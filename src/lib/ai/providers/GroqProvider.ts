import { AIProvider, AIMessage, HealthContext, StreamingCallback, AIProviderError, AIRateLimitError } from './types';
import { fetchWithRetry, type StreamConfig } from '../streaming';
import { env } from '../../../config/env';

const DEFAULT_MODEL = 'llama-3.1-8b-instant';
const API_URL = 'https://api.groq.com/openai/v1/chat/completions';

const FETCH_CONFIG: StreamConfig = {
  throttleMs: 16,
  bufferSize: 5,
  timeoutMs: 30000,
  maxRetries: 1,
  retryDelayMs: 1000,
};

interface ProviderHealth {
  isHealthy: boolean;
  lastError: string | null;
  consecutiveFailures: number;
  rateLimitedUntil: number;
}

class GroqProvider implements AIProvider {
  name = 'Groq';
  id = 'groq';

  private apiKey: string;
  private model: string;
  private health: ProviderHealth = {
    isHealthy: true,
    lastError: null,
    consecutiveFailures: 0,
    rateLimitedUntil: 0,
  };

  constructor(apiKey?: string, model: string = DEFAULT_MODEL) {
    const rawKey = apiKey || env.groqApiKey || '';
    this.apiKey = rawKey.trim().replace(/^[\"']|[\"']$/g, '');
    this.model = model;

    if (this.apiKey) {
      const isValid = this.apiKey.startsWith('gsk_');
      // FIX (P3-1): Only log API key validity in dev.
      if (__DEV__) console.log('[Groq] API key loaded:', isValid ? 'valid format' : 'invalid format');
    } else {
      if (__DEV__) console.warn('[Groq] No API key found in environment (EXPO_PUBLIC_GROQ_KEY)');
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey || !this.apiKey.startsWith('gsk_')) {
      return false;
    }
    // If currently rate-limited, check if the window has passed
    if (this.health.rateLimitedUntil > Date.now()) {
      console.warn('[Groq] Rate limit window active, unavailable until', new Date(this.health.rateLimitedUntil).toISOString());
      return false;
    }
    return this.health.isHealthy;
  }

  async generate(
    messages: AIMessage[],
    context: HealthContext
  ): Promise<AIMessage> {
    const response = await this.makeRequest(messages, context);

    let raw = '';
    try {
      raw = await response.text();
    } catch (err) {
      throw new AIProviderError(
        `[Groq] Failed to read response: ${(err as Error).message}`,
        this.id,
        500,
        true
      );
    }

    let data: any;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      throw new AIProviderError(
        `[Groq] Failed to parse JSON: ${(err as Error).message} — raw: ${raw.slice(0, 200)}`,
        this.id,
        500,
        false
      );
    }

    const content: string = data?.choices?.[0]?.message?.content ?? '';
    this.markSuccess();
    return { role: 'assistant', content };
  }

  async generateStreaming(
    messages: AIMessage[],
    context: HealthContext,
    onChunk: StreamingCallback,
    _signal?: AbortSignal
  ): Promise<string> {
    // No streaming on React Native — fall back to regular generate()
    const result = await this.generate(messages, context);
    if (result.content) {
      try { onChunk(result.content); } catch { /* ignore callback errors */ }
    }
    return result.content;
  }

  private async makeRequest(
    messages: AIMessage[],
    context: HealthContext
  ): Promise<Response> {
    if (!this.apiKey || !this.apiKey.startsWith('gsk_')) {
      throw new AIProviderError('Groq API key not configured or invalid', this.id, 401, false);
    }

    const systemPrompt = this.createSystemPrompt(context);
    const allMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...messages.map(m => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      })),
    ];

    try {
      const response = await fetchWithRetry(
        API_URL,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.model,
            messages: allMessages,
            max_tokens: 1500,
            temperature: 0.7,
            stream: false,
          }),
          timeout: FETCH_CONFIG.timeoutMs,
        },
        FETCH_CONFIG
      );

      if (!response.ok) {
        let errorBody = '';
        try { errorBody = await response.text(); } catch { errorBody = '(unreadable)'; }

        if (response.status === 429) {
          // Mark rate limited for 60 seconds
          this.health.rateLimitedUntil = Date.now() + 60_000;
          this.markFailure(`Rate limited (429)`);
          throw new AIRateLimitError(this.id);
        }

        this.markFailure(`HTTP ${response.status}: ${errorBody.slice(0, 200)}`);
        throw new AIProviderError(
          `Groq error ${response.status}: ${errorBody.slice(0, 200)}`,
          this.id,
          response.status,
          response.status >= 500
        );
      }

      return response;
    } catch (error) {
      if (error instanceof AIProviderError) throw error;
      this.markFailure((error as Error).message);
      throw new AIProviderError(
        (error as Error).message || 'Groq request failed',
        this.id,
        500,
        true
      );
    }
  }

  private createSystemPrompt(context: HealthContext): string {
    const vitals = context.latestVitals;
    const medList = context.medications
      .map(m => `- ${m.name}${m.dosage ? ` (${m.dosage})` : ''}`)
      .join('\n');

    // FIX (P2-14): Include conditions, allergies, hospital, emergency contacts
    // so the fallback Groq provider has the same patient context as the
    // primary OpenRouter path.
    const conditionsText =
      context.conditions && context.conditions.length > 0
        ? context.conditions.map(c => `- ${c.name}${c.severity ? ` (${c.severity})` : ''}`).join('\n')
        : '- None recorded';

    const allergiesText =
      context.allergies && context.allergies.length > 0
        ? context.allergies.map(a => `- ${a}`).join('\n')
        : '- No known allergies';

    const hospitalText = context.hospital
      ? `${context.hospital.name ?? 'Unknown'}${context.hospital.phone ? ` • ${context.hospital.phone}` : ''}`
      : '- None recorded';

    const emergencyText =
      context.emergencyContacts && context.emergencyContacts.length > 0
        ? context.emergencyContacts.map(c => `- ${c.name}${c.relation ? ` (${c.relation})` : ''}: ${c.phone}`).join('\n')
        : '- None recorded';

    return `You are RAFIQ, a compassionate healthcare AI assistant for a medical monitoring app.
You MUST respond in the SAME LANGUAGE the user writes in (Arabic if they write Arabic, English if they write English).

PATIENT CONTEXT:
- Patient: ${context.patientName || 'User'}
- Last Updated: ${context.lastUpdated}

LATEST VITALS:
${vitals.heartRate ? `❤️ Heart Rate: ${vitals.heartRate} bpm` : '❤️ No heart rate data'}
${vitals.bloodPressureSys && vitals.bloodPressureDia ? `💗 Blood Pressure: ${vitals.bloodPressureSys}/${vitals.bloodPressureDia} mmHg` : '💗 No blood pressure data'}
${vitals.oxygenSaturation ? `🫁 SpO2: ${vitals.oxygenSaturation}%` : '🫁 No SpO2 data'}
${vitals.temperature ? `🌡️ Temperature: ${vitals.temperature}°C` : '🌡️ No temperature data'}

MEDICATIONS:
${medList || '- None recorded'}

CONDITIONS:
${conditionsText}

ALLERGIES:
${allergiesText}

HOSPITAL:
${hospitalText}

EMERGENCY CONTACTS:
${emergencyText}

GUIDELINES:
1. Be empathetic and concise
2. Never provide definitive diagnoses — always recommend consulting a doctor
3. For emergencies, direct to emergency services immediately
4. CRITICAL: Always check the patient's allergies and conditions before recommending any medication or food
5. Keep responses focused (2-4 sentences for quick questions)`;
  }

  private markSuccess(): void {
    this.health.consecutiveFailures = 0;
    this.health.isHealthy = true;
    this.health.lastError = null;
    this.health.rateLimitedUntil = 0;
  }

  private markFailure(error: string): void {
    this.health.consecutiveFailures++;
    this.health.lastError = error;
    if (this.health.consecutiveFailures >= 3) {
      this.health.isHealthy = false;
    }
  }

  resetHealth(): void {
    this.health = {
      isHealthy: true,
      lastError: null,
      consecutiveFailures: 0,
      rateLimitedUntil: 0,
    };
  }
}

export const groqProvider = new GroqProvider();
export { GroqProvider };
export default groqProvider;
