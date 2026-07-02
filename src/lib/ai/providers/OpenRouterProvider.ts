import { AIProvider, AIMessage, HealthContext, StreamingCallback, AIProviderError, AIRateLimitError } from './types';
import { fetchWithRetry, type StreamConfig } from '../streaming';
import { env } from '../../../config/env';

const DEFAULT_MODEL = 'openai/gpt-4o-mini';
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

const FETCH_CONFIG: StreamConfig = {
  throttleMs: 16,
  bufferSize: 5,
  timeoutMs: 60000,
  maxRetries: 1,
  retryDelayMs: 1000,
};

interface ProviderHealth {
  isHealthy: boolean;
  lastError: string | null;
  consecutiveFailures: number;
}

class OpenRouterProvider implements AIProvider {
  name = 'OpenRouter';
  id = 'openrouter';

  private apiKey: string;
  private model: string;
  private health: ProviderHealth = {
    isHealthy: true,
    lastError: null,
    consecutiveFailures: 0,
  };
  private apiKeyValidated = false;

  constructor(apiKey?: string, model?: string) {
    const rawKey = apiKey || env.openRouterApiKey || '';
    this.apiKey = rawKey;

    if (this.apiKey) {
      const isValid = this.apiKey.startsWith('sk-or-v1-');
      console.log(
        '[OpenRouter] API key loaded:',
        isValid ? 'valid format' : 'invalid format'
      );
      this.apiKeyValidated = isValid;
    } else {
      console.warn('[OpenRouter] No API key found in environment');
    }

    this.model = env.openRouterModel || model || DEFAULT_MODEL;
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey || !this.apiKeyValidated) {
      const envKey = env.openRouterApiKey;
      if (envKey && envKey.startsWith('sk-or-v1-')) {
        this.resetHealth();
        this.apiKey = envKey;
        this.apiKeyValidated = true;
      } else {
        return false;
      }
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
        `Failed to read response text: ${(err as Error).message}`,
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
        `Failed to parse JSON: ${(err as Error).message} — raw: ${raw.slice(0, 200)}`,
        this.id,
        500,
        false
      );
    }

    const content: string = data?.choices?.[0]?.message?.content ?? '';
    this.markSuccess();
    return { role: 'assistant' as const, content }
  }

  async generateStreaming(
    messages: AIMessage[],
    context: HealthContext,
    onChunk: StreamingCallback,
    _signal?: AbortSignal
  ): Promise<string> {
    console.warn(
      '[OpenRouter] generateStreaming() is not supported on Expo SDK 54 React Native. ' +
      'Falling back to non-streaming generate().'
    );

    const result = await this.generate(messages, context);
    if (result.content) {
      try {
        onChunk(result.content);
      } catch (err) {
        console.warn('[OpenRouter] onChunk callback threw:', (err as Error).message);
      }
    }
    return result.content;
  }

  private async makeRequest(
    messages: AIMessage[],
    context: HealthContext
  ): Promise<Response> {
    if (!this.apiKey) {
      throw new AIProviderError('OpenRouter API key not configured', this.id, 401, false);
    }
    if (!this.apiKey.startsWith('sk-or-v1-')) {
      throw new AIProviderError('Invalid OpenRouter API key format', this.id, 401, false);
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
            'HTTP-Referer': 'https://rafiq-health.app',
            'X-Title': 'RAFIQ Health Assistant',
          },
          body: JSON.stringify({
            model: this.model,
            messages: allMessages,
            max_tokens: 2000,
            temperature: 0.7,
            stream: false,
          }),
          timeout: FETCH_CONFIG.timeoutMs,
        },
        FETCH_CONFIG
      );

      if (!response.ok) {
        let errorBody = '';
        try {
          errorBody = await response.text();
        } catch {
          errorBody = '(unreadable)';
        }
        if (response.status === 429) {
          this.markFailure(`Rate limited (429)`);
          throw new AIRateLimitError(this.id);
        }
        const isRetryable = response.status >= 500;
        this.markFailure(`HTTP ${response.status}: ${errorBody.slice(0, 200)}`);
        throw new AIProviderError(
          `OpenRouter error ${response.status}: ${errorBody.slice(0, 200)}`,
          this.id,
          response.status,
          isRetryable
        );
      }

      return response;
    } catch (error) {
      if (error instanceof AIProviderError) throw error;
      this.markFailure((error as Error).message);
      throw new AIProviderError(
        (error as Error).message || 'Request failed',
        this.id,
        500,
        true
      );
    }
  }

  private createSystemPrompt(context: HealthContext): string {
    const vitals = context.latestVitals;
    const medList = context.medications
      .map(m => `- ${m.name}${m.dosage ? ` (${m.dosage})` : ''}${m.time ? ` at ${m.time}` : ''}`)
      .join('\n');

    const alertsText =
      context.recentAlerts.length > 0
        ? context.recentAlerts.map(a => `- ${a}`).join('\n')
        : '- No recent alerts';

    return `You are RAFIQ, a compassionate healthcare AI assistant for a medical monitoring app.

CONTEXT:
- Patient: ${context.patientName || 'User'}
- Last Updated: ${context.lastUpdated}

LATEST VITALS:
${vitals.heartRate ? `❤️ Heart Rate: ${vitals.heartRate} bpm` : '❤️ No heart rate data'}
${vitals.bloodPressureSys && vitals.bloodPressureDia ? `💗 Blood Pressure: ${vitals.bloodPressureSys}/${vitals.bloodPressureDia} mmHg` : '💗 No blood pressure data'}
${vitals.oxygenSaturation ? `🫁 SpO2: ${vitals.oxygenSaturation}%` : '🫁 No SpO2 data'}
${vitals.temperature ? `🌡️ Temperature: ${vitals.temperature}°C` : '🌡️ No temperature data'}

CURRENT MEDICATIONS:
${medList || '- No medications recorded'}

RECENT ALERTS:
${alertsText}

GUIDELINES:
1. Be empathetic, clear, and concise
2. Use medical terms accurately but explain them simply
3. Focus on actionable health advice
4. Never provide definitive diagnoses - always suggest consulting a doctor
5. For emergencies, direct users to emergency services immediately
6. Keep responses short and practical (2-4 sentences for quick answers)
7. Use markdown for formatting when helpful

Remember: You are a health assistant, not a doctor. Always encourage professional medical advice for serious concerns.`;
  }

  private markSuccess(): void {
    this.health.consecutiveFailures = 0;
    this.health.isHealthy = true;
    this.health.lastError = null;
  }

  private markFailure(error: string): void {
    this.health.consecutiveFailures++;
    this.health.lastError = error;
    if (this.health.consecutiveFailures >= 3) {
      this.health.isHealthy = false;
    }
  }

  getHealth(): ProviderHealth {
    return { ...this.health };
  }

  resetHealth(): void {
    this.health = {
      isHealthy: true,
      lastError: null,
      consecutiveFailures: 0,
    };
  }
}

export const openRouterProvider = new OpenRouterProvider();
export { OpenRouterProvider };
export default openRouterProvider;
