import { AIProvider, AIMessage, HealthContext, StreamingCallback, AIResponse, AIProviderError, AIRateLimitError } from "./types";
import { openRouterProvider } from "./OpenRouterProvider";
import { groqProvider } from "./GroqProvider";

/**
 * ARABIC rate-limit message shown in the chat UI when all providers are 429.
 * "Rate limit exceeded, please try again in a moment."
 */
export const RATE_LIMIT_MESSAGE_AR = 'تم تجاوز حد الطلبات، حاول بعد قليل';
export const RATE_LIMIT_MESSAGE_EN = 'Rate limit exceeded, please try again in a moment.';

// Simple retry count — don't retry on 429 errors
const MAX_RETRIES = 1;

class MinimalFallbackProvider implements AIProvider {
  name = "Unavailable";
  id = "fallback";

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async generate(_messages: AIMessage[], _context: HealthContext): Promise<AIMessage> {
    throw new AIProviderError(
      "AI service temporarily unavailable. Please try again.",
      this.id,
      503,
      true
    );
  }

  async generateStreaming(
    _messages: AIMessage[],
    _context: HealthContext,
    onChunk: StreamingCallback,
    _signal?: AbortSignal
  ): Promise<string> {
    const message = "AI service temporarily unavailable. Please try again.";
    onChunk(message);
    return message;
  }
}

class ProviderManager {
  private primary: AIProvider;
  private secondary: AIProvider;
  private fallback: MinimalFallbackProvider;

  constructor() {
    this.primary = openRouterProvider;
    this.secondary = groqProvider;
    this.fallback = new MinimalFallbackProvider();
  }

  getProvider(): AIProvider {
    return this.primary;
  }

  /**
   * Try primary (OpenRouter), then secondary (Groq), then show error.
   * On 429 from primary → immediately try secondary without retry.
   * On 429 from secondary → throw AIRateLimitError so UI shows Arabic message.
   */
  async generate(
    messages: AIMessage[],
    context: HealthContext,
    retries: number = MAX_RETRIES
  ): Promise<AIResponse> {
    // --- Try PRIMARY ---
    try {
      const isAvailable = await this.primary.isAvailable();
      if (isAvailable) {
        const response = await this.primary.generate(messages, context);
        return {
          content: response.content,
          provider: this.primary.name,
          model: this.primary.id,
          finishReason: "stop",
        };
      }
    } catch (primaryError) {
      const isRateLimit = primaryError instanceof AIRateLimitError ||
        (primaryError instanceof Error && primaryError.message.startsWith('RateLimitError'));

      if (!isRateLimit) {
        // Non-429 primary failure: retry up to MAX_RETRIES then try secondary
        for (let attempt = 0; attempt < retries; attempt++) {
          try {
            const response = await this.primary.generate(messages, context);
            return {
              content: response.content,
              provider: this.primary.name,
              model: this.primary.id,
              finishReason: "stop",
            };
          } catch {
            await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
          }
        }
      }
      // Fall through to secondary
      console.warn('[ProviderManager] Primary failed, trying secondary (Groq)');
    }

    // --- Try SECONDARY (Groq) ---
    try {
      const isAvailable = await this.secondary.isAvailable();
      if (isAvailable) {
        const response = await this.secondary.generate(messages, context);
        return {
          content: response.content,
          provider: this.secondary.name,
          model: this.secondary.id,
          finishReason: "stop",
        };
      }
    } catch (secondaryError) {
      const isRateLimit = secondaryError instanceof AIRateLimitError ||
        (secondaryError instanceof Error && secondaryError.message.startsWith('RateLimitError'));

      if (isRateLimit) {
        // Both providers rate-limited → surface Arabic message
        throw new AIRateLimitError('all');
      }
      console.warn('[ProviderManager] Secondary (Groq) also failed:', (secondaryError as Error).message);
    }

    // --- Final fallback (just error) ---
    return {
      content: "AI service temporarily unavailable. Please try again.",
      provider: this.fallback.name,
      model: this.fallback.id,
      finishReason: "error",
    };
  }

  async generateStreaming(
    messages: AIMessage[],
    context: HealthContext,
    onChunk: StreamingCallback,
    signal?: AbortSignal,
    retries: number = MAX_RETRIES
  ): Promise<AIResponse> {
    // Primary
    try {
      const isAvailable = await this.primary.isAvailable();
      if (isAvailable) {
        const content = await this.primary.generateStreaming(messages, context, onChunk, signal);
        return {
          content,
          provider: this.primary.name,
          model: this.primary.id,
          finishReason: "stop",
        };
      }
    } catch (primaryError) {
      const isRateLimit = primaryError instanceof AIRateLimitError ||
        (primaryError instanceof Error && primaryError.message.startsWith('RateLimitError'));
      if (!isRateLimit) {
        for (let attempt = 0; attempt < retries; attempt++) {
          try {
            const content = await this.primary.generateStreaming(messages, context, onChunk, signal);
            return {
              content,
              provider: this.primary.name,
              model: this.primary.id,
              finishReason: "stop",
            };
          } catch {
            await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
          }
        }
      }
    }

    // Secondary
    try {
      const isAvailable = await this.secondary.isAvailable();
      if (isAvailable) {
        const content = await this.secondary.generateStreaming(messages, context, onChunk, signal);
        return {
          content,
          provider: this.secondary.name,
          model: this.secondary.id,
          finishReason: "stop",
        };
      }
    } catch (secondaryError) {
      const isRateLimit = secondaryError instanceof AIRateLimitError ||
        (secondaryError instanceof Error && secondaryError.message.startsWith('RateLimitError'));
      if (isRateLimit) {
        throw new AIRateLimitError('all');
      }
    }

    const message = "AI service temporarily unavailable. Please try again.";
    onChunk(message);
    return {
      content: message,
      provider: this.fallback.name,
      model: this.fallback.id,
      finishReason: "error",
    };
  }
}

export const providerManager = new ProviderManager();
export default providerManager;
