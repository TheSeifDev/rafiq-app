import { providerManager } from '../providers/manager';
import { AIProvider } from '../providers/types';
import { AIRateLimitError } from '../providers/types';
import { env } from '../../../config/env';
import { MedicalSafetyValidator } from '../safety/MedicalSafetyValidator';
import { sendChat, type ChatMessage as EdgeChatMessage } from '../../../services/chat.service';

import {
  createReasoningState,
  addUserMessage,
  addAssistantMessage,
  extractTopic,
  pruneForTokenBudget,
  type ReasoningState,
} from './ReasoningEngine';
import {
  parseJSONResponse,
  createTimeoutController,
  type StreamChunk,
  type StreamingConfig,
} from './StreamingEngine';
import {
  buildHealthContext,
  formatContextForPrompt,
  type HealthContextData,
  type HealthInsight,
} from './HealthContextEngine';
import type { PatientContext } from '../../../services/ai/PatientContextAggregator';
import generateLocalResponse from './LocalAIFallback';

export interface AIResponse {
  content: string;
  reasoningDetails?: string;
  provider: string;
  model: string;
  finishReason: string;
  insights?: HealthInsight[];
  tokensPerSecond?: number;
  requiresEmergencyEscalation?: boolean;
}

export interface AIConfig {
  model: string;
  maxTokens: number;
  temperature: number;
  reasoningEnabled: boolean;
  streamingEnabled: boolean;
  fallbackEnabled: boolean;
  maxRetries: number;
  timeoutMs: number;
}

function isArabic(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

const DEFAULT_CONFIG: AIConfig = {
  model: 'openai/gpt-4o-mini',
  maxTokens: 2000,
  temperature: 0.7,
  reasoningEnabled: false,
  streamingEnabled: false,
  fallbackEnabled: true,
  maxRetries: 1,
  timeoutMs: 60000,
};

const STREAMING_CONFIG: StreamingConfig = {
  throttleMs: 16,
  bufferSize: 3,
  maxRetries: 3,
  retryDelayMs: 1000,
  timeoutMs: 60000,
};

const FALLBACK_HEALTH_CONTEXT: HealthContextData = {
  patientName: 'User',
  latestVitals: {},
  medications: [],
  recentAlerts: [],
  foodLogs: [],
  sleepRecords: [],
  conditions: [],
  allergies: [],
  hospital: { name: null, address: null, phone: null, hasMedicalFile: null, fileNumber: null },
  reporter: { name: null, relationship: null, phone: null, isPrimaryContact: null },
  address: { city: null, area: null, detailed: null, geocoded: null },
  emergency: { contacts: [], primaryContact: null, profile: null },
  profileCompletion: { percentage: 0, completedFields: [], missingFields: [], readinessScore: 0 },
  lastUpdated: new Date().toISOString(),
};

function alertsToStrings(alerts: unknown[]): string[] {
  return alerts.map((a: any) => {
    if (typeof a === 'string') return a;
    const title = a?.title ?? a?.message ?? a?.type ?? '';
    return String(title);
  });
}

class AIManager {
  private config: AIConfig;
  private reasoningState: ReasoningState;
  private healthContext: HealthContextData | null = null;
  private patientContext: PatientContext | null = null;
  private _isInitialized = false;
  private safetyValidator = new MedicalSafetyValidator();

  constructor(config: Partial<AIConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      streamingEnabled: false,
    };
    this.reasoningState = createReasoningState();
  }

  initialize(healthContext: HealthContextData): void {
    this.healthContext = healthContext;
    this._isInitialized = true;
  }

  isInitialized(): boolean {
    return this._isInitialized;
  }

  updateHealthContext(context: HealthContextData): void {
    this.healthContext = context;
  }

  setPatientContext(pc: PatientContext | null): void {
    this.patientContext = pc;
  }

  getReasoningState(): ReasoningState {
    return this.reasoningState;
  }

  loadReasoningState(state: ReasoningState): void {
    this.reasoningState = state;
  }

  clearMemory(): void {
    this.reasoningState = createReasoningState();
  }

  async generate(
    userMessage: string,
    onChunk?: (chunk: StreamChunk) => void
  ): Promise<AIResponse> {
    if (!this._isInitialized || !this.healthContext) {
      console.warn('[AI Manager] Not initialized — using fallback health context');
      this.initialize(this.healthContext ?? FALLBACK_HEALTH_CONTEXT);
    }

    const healthContext = this.healthContext!;

    const topic = extractTopic(userMessage);
    this.reasoningState = pruneForTokenBudget(this.reasoningState);
    const { insights: healthInsights } = buildHealthContext(healthContext);
    const patientInsights = this.buildPatientInsights(this.patientContext);
    const allInsights = [...healthInsights, ...patientInsights];
    const systemPrompt = formatContextForPrompt(healthContext, allInsights);

    this.reasoningState = addUserMessage(this.reasoningState, userMessage, topic ?? undefined);
    const messages = this.buildMessagesWithContext(systemPrompt);

    let aiResponse: AIResponse;

    const hasDirectProvider = !!(env.openRouterApiKey || env.groqApiKey);

    if (!hasDirectProvider) {
      console.log('[AI Manager] No direct API keys — using Supabase Edge Function (Gemini)');
      try {
        aiResponse = await this.generateWithFallback(userMessage);
      } catch (fallbackErr) {
        const errMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
        console.error('[AI Manager] Edge Function failed:', errMsg);

        console.log('[AI Manager] All remote AI failed — using local built-in AI');
        const localContent = generateLocalResponse(userMessage);
        aiResponse = {
          content: localContent.content,
          provider: localContent.provider,
          model: localContent.model,
          finishReason: localContent.finishReason,
        };
      }
    } else {
      try {
        aiResponse = await this.generateNonStreaming(messages, allInsights);
      } catch (generationError: unknown) {
        const errMsg = generationError instanceof Error ? generationError.message : String(generationError);

        console.error('[AI Manager] Generation error:', {
          message: errMsg,
          provider: this.getProvider().name,
          model: this.config.model,
        });

        if (this.config.fallbackEnabled) {
          console.log('[AI Manager] Attempting fallback provider after primary failure');
          try {
            aiResponse = await this.generateWithFallback(userMessage);
          } catch {
            console.log('[AI Manager] ALL remote AI failed — using local built-in AI');
            const localContent = generateLocalResponse(userMessage);
            aiResponse = {
              content: localContent.content,
              provider: localContent.provider,
              model: localContent.model,
              finishReason: localContent.finishReason,
            };
          }
        } else {
          throw generationError;
        }
      }
    }

    const validationResult = MedicalSafetyValidator.validateMedicalResponse(
      aiResponse.content,
      {
        allergies: this.patientContext?.allergies.list,
        conditions: this.patientContext?.conditions.list.map(c => c.name),
        currentMedications: this.patientContext?.medications.active.map(m => m.name),
        age: this.patientContext?.age ?? undefined,
      }
    );

    if (!validationResult.isSafe) {
      aiResponse = {
        ...aiResponse,
        content: validationResult.sanitizedResponse,
        requiresEmergencyEscalation: validationResult.requiresEmergencyEscalation,
      };
    }

    if (validationResult.requiresEmergencyEscalation) {
      aiResponse.requiresEmergencyEscalation = true;
    }

    if (onChunk && aiResponse.content) {
      try {
        onChunk({ type: 'content', content: aiResponse.content, done: true });
      } catch (chunkErr) {
        console.warn('[AI Manager] onChunk callback threw:', (chunkErr as Error).message);
      }
    }

    return aiResponse;
  }

  private async generateNonStreaming(
    messages: Array<{ role: string; content: string; reasoning?: string }>,
    insights: HealthInsight[]
  ): Promise<AIResponse> {
    const provider = this.getProvider();
    const startTime = Date.now();

    const response = await this.makeRequest(provider, messages);
    const { content, reasoning: reasoningDetails, finishReason } = await parseJSONResponse(response);

    if (!content && !reasoningDetails) {
      console.warn('[AI Manager] Provider returned empty content', {
        provider: provider.name,
        model: provider.id,
        finishReason,
      });
    }

    this.reasoningState = addAssistantMessage(this.reasoningState, content, reasoningDetails);

    const durationSec = (Date.now() - startTime) / 1000;
    const hasArabic = /[\u0600-\u06FF]/.test(content);
    const charsPerToken = hasArabic ? 2.5 : 4;
    const tokensPerSecond =
      durationSec > 0 ? Math.round(content.length / charsPerToken / durationSec) : 0;

    return {
      content,
      reasoningDetails,
      provider: provider.name,
      model: provider.id,
      finishReason,
      insights,
      tokensPerSecond,
    };
  }

  private async generateWithFallback(userMessage: string): Promise<AIResponse> {
    const ctx = this.healthContext ?? FALLBACK_HEALTH_CONTEXT;
    const hasDirectProvider = !!(env.openRouterApiKey || env.groqApiKey);

    if (!hasDirectProvider) {
      return this.generateViaEdgeFunction(userMessage, ctx);
    }

    try {
      return await this.generateViaDirectProviders(ctx);
    } catch {
      console.warn('[AI Manager] Direct providers failed, falling back to Edge Function');
      return this.generateViaEdgeFunction(userMessage, ctx);
    }
  }

  private async generateViaDirectProviders(ctx: HealthContextData): Promise<AIResponse> {
    const { insights: healthInsights } = buildHealthContext(ctx);
    const patientInsights = this.buildPatientInsights(this.patientContext);
    const allInsights = [...healthInsights, ...patientInsights];

    const latestVitals = this.healthContext?.latestVitals ?? {};

    const result = await providerManager.generate(
      this.reasoningState.messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      {
        patientName: this.healthContext?.patientName || (this.patientContext?.fullName || 'User'),
        latestVitals: {
          heartRate: (latestVitals as Record<string, unknown>).heartRate as number | undefined,
          bloodPressureSys: (latestVitals as Record<string, unknown>).bloodPressureSys as number | undefined,
          bloodPressureDia: (latestVitals as Record<string, unknown>).bloodPressureDia as number | undefined,
          oxygenSaturation: (latestVitals as Record<string, unknown>).oxygenSaturation as number | undefined,
          temperature: (latestVitals as Record<string, unknown>).temperature as number | undefined,
        },
        medications: (this.healthContext?.medications ?? []).map(m => ({
          name: typeof m === 'string' ? m : (m as any).name ?? '',
          dosage: typeof m === 'object' && m !== null ? (m as any).dosage : undefined,
          time: typeof m === 'object' && m !== null ? (m as any).time : undefined,
        })),
        recentAlerts: alertsToStrings(this.healthContext?.recentAlerts ?? []),
        lastUpdated: this.healthContext?.lastUpdated ?? new Date().toISOString(),
      }
    );

    const validationResult = MedicalSafetyValidator.validateMedicalResponse(
      result.content,
      {
        allergies: this.patientContext?.allergies.list,
        conditions: this.patientContext?.conditions.list.map(c => c.name),
        currentMedications: this.patientContext?.medications.active.map(m => m.name),
        age: this.patientContext?.age ?? undefined,
      }
    );

    const safeContent = validationResult.isSafe ? result.content : validationResult.sanitizedResponse;

    this.reasoningState = addAssistantMessage(this.reasoningState, safeContent);

    return {
      content: safeContent,
      provider: result.provider,
      model: result.model,
      finishReason: result.finishReason,
      insights: allInsights,
      requiresEmergencyEscalation: validationResult.requiresEmergencyEscalation,
    };
  }

  private async generateViaEdgeFunction(userMessage: string, ctx: HealthContextData): Promise<AIResponse> {
    const { insights: healthInsights } = buildHealthContext(ctx);
    const patientInsights = this.buildPatientInsights(this.patientContext);
    const allInsights = [...healthInsights, ...patientInsights];

    const v = ctx.latestVitals;
    const vitalsSummary = [
      v.heartRate ? `HR: ${v.heartRate} bpm` : '',
      v.bloodPressureSys ? `BP: ${v.bloodPressureSys}/${v.bloodPressureDia} mmHg` : '',
      v.oxygenSaturation ? `SpO2: ${v.oxygenSaturation}%` : '',
      v.temperature ? `Temp: ${v.temperature}C` : '',
    ].filter(Boolean).join(' | ') || 'No vitals data';

    const medsSummary = (ctx.medications ?? [])
      .map(m => typeof m === 'string' ? m : (m as any).name ?? '')
      .filter(Boolean)
      .join(', ') || 'No medications';

    const fullVitals = `${vitalsSummary}\nMedications: ${medsSummary}`;

    const messages: EdgeChatMessage[] = this.reasoningState.messages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== 'user' || lastMsg.content !== userMessage) {
      messages.push({ role: 'user', content: userMessage });
    }

    console.log('[AI Manager] Using Supabase Edge Function for AI response');

    let reply: string;
    try {
      reply = await sendChat(messages, fullVitals);
    } catch (edgeErr) {
      const errMsg = edgeErr instanceof Error ? edgeErr.message : String(edgeErr);
      console.error('[AI Manager] Edge Function also failed:', errMsg);
      throw new Error(`AI service unavailable: ${errMsg}`);
    }

    const validationResult = MedicalSafetyValidator.validateMedicalResponse(
      reply,
      {
        allergies: this.patientContext?.allergies.list,
        conditions: this.patientContext?.conditions.list.map(c => c.name),
        currentMedications: this.patientContext?.medications.active.map(m => m.name),
        age: this.patientContext?.age ?? undefined,
      }
    );

    const safeContent = validationResult.isSafe ? reply : validationResult.sanitizedResponse;

    this.reasoningState = addAssistantMessage(this.reasoningState, safeContent);

    return {
      content: safeContent,
      provider: 'Gemini (Edge)',
      model: 'gemini-2.5-flash',
      finishReason: 'stop',
      insights: allInsights,
      requiresEmergencyEscalation: validationResult.requiresEmergencyEscalation,
    };
  }

  private buildPatientInsights(pc: PatientContext | null): HealthInsight[] {
    const insights: HealthInsight[] = [];
    if (!pc) return insights;

    pc.conditions.list.forEach(condition => {
      insights.push({
        type: 'condition' as const,
        priority: 'medium',
        title: condition.name,
        description: `Condition: ${condition.severity ?? 'unknown severity'}`,
        value: condition.isActive ? 'Active' : 'Inactive',
      });
    });

    pc.medications.active.forEach(med => {
      insights.push({
        type: 'medication' as const,
        priority: 'low',
        title: med.name,
        description: `Medication: ${med.dosage ?? 'no dosage'} ${med.time_of_day?.join(', ') ?? ''}`,
        value: med.is_active ? 'Active' : 'Inactive',
      });
    });

    pc.allergies.list.forEach(allergy => {
      insights.push({
        type: 'allergy' as const,
        priority: 'high',
        title: `Allergy: ${allergy}`,
        description: 'Patient has this allergy',
        value: undefined,
      });
    });

    if (pc.hospital.name) {
      insights.push({
        type: 'hospital' as const,
        priority: 'medium',
        title: `Hospital: ${pc.hospital.name}`,
        description: pc.hospital.doctorName ? `Doctor: ${pc.hospital.doctorName}` : 'No doctor specified',
        value: undefined,
      });
    }

    if (pc.reporter.data.name) {
      insights.push({
        type: 'reporter' as const,
        priority: 'low',
        title: `Reporter: ${pc.reporter.data.name}`,
        description: `Relationship: ${pc.reporter.relation ?? 'unknown'}`,
        value: pc.reporter.data.isPrimaryContact ? 'Primary contact' : 'Not primary',
      });
    }

    if (pc.address.detailed) {
      insights.push({
        type: 'address' as const,
        priority: 'low',
        title: 'Address',
        description: pc.address.detailed,
        value: undefined,
      });
    }

    if (pc.emergency.contacts.length > 0) {
      insights.push({
        type: 'emergency' as const,
        priority: 'medium',
        title: `Emergency Contacts: ${pc.emergency.contacts.length}`,
        description: `Primary contact: ${pc.emergency.primaryContact?.name ?? 'none'}`,
        value: undefined,
      });
    }

    insights.push({
      type: 'profile' as const,
      priority: pc.profileCompletion.percentage >= 80 ? 'low' : pc.profileCompletion.percentage >= 50 ? 'medium' : 'high',
      title: `Profile Completion: ${pc.profileCompletion.percentage}%`,
      description: `Missing: ${pc.profileCompletion.missingFields.join(', ')}`,
      value: undefined,
    });

    return insights;
  }

  private buildMessagesWithContext(systemPrompt: string): Array<{ role: string; content: string; reasoning?: string }> {
    const messages: Array<{ role: string; content: string; reasoning?: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    for (const msg of this.reasoningState.messages) {
      if (msg.role === 'assistant' && msg.reasoningDetails) {
        messages.push({
          role: 'assistant',
          content: msg.content,
          reasoning: msg.reasoningDetails,
        });
      } else {
        messages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    return messages;
  }

  private getProvider(): AIProvider {
    return providerManager.getProvider();
  }

  private async makeRequest(
    provider: AIProvider,
    messages: Array<{ role: string; content: string; reasoning?: string }>
  ): Promise<Response> {
    const url = this.getApiUrl(provider.id);
    const headers = this.getHeaders(provider.id);

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      stream: false,
    };

    const controller = createTimeoutController(this.config.timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (fetchError: unknown) {
      const msg = fetchError instanceof Error ? fetchError.message : String(fetchError);
      throw new Error(`[AI Manager] Network request failed: ${msg}`);
    }

    if (!response.ok) {
      let errorBody = '';
      try { errorBody = await response.text(); } catch { errorBody = '(could not read error body)'; }
      if (response.status === 429) {
        throw new AIRateLimitError(provider.name);
      }
      throw new Error(`[AI Manager] API error ${response.status}: ${errorBody.slice(0, 400)}`);
    }

    return response;
  }

  private getApiUrl(modelId: string): string {
    if (modelId && (modelId.includes('groq') || (env.groqApiKey && !env.openRouterApiKey))) {
      return 'https://api.groq.com/openai/v1/chat/completions';
    }
    return 'https://openrouter.ai/api/v1/chat/completions';
  }

  private getHeaders(modelId: string): HeadersInit {
    const isGroq = modelId && (modelId.includes('groq') || (env.groqApiKey && !env.openRouterApiKey));
    if (isGroq && env.groqApiKey) {
      return {
        Authorization: `Bearer ${env.groqApiKey}`,
        'Content-Type': 'application/json',
      };
    }
    return {
      Authorization: `Bearer ${env.openRouterApiKey || ''}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://rafiq-health.app',
      'X-Title': 'RAFIQ Health Assistant',
    };
  }
}

export const aiManager = new AIManager();
export { AIManager };
export default aiManager;
