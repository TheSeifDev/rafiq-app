export interface StreamConfig {
  throttleMs: number;
  bufferSize: number;
  timeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
}

export interface StreamCallbacks {
  onChunk: (content: string, reasoning?: string) => void;
  onDone: () => void;
  onError: (error: Error) => void;
}

export interface StreamResult {
  content: string;
  reasoning: string;
  chunks: number;
}

const DEFAULT_CONFIG: StreamConfig = {
  throttleMs: 16,
  bufferSize: 10,
  timeoutMs: 60000,
  maxRetries: 3,
  retryDelayMs: 1000,
};

export class StreamProcessor {
  private config: StreamConfig;
  private isActive: boolean = false;
  private chunkBuffer: string = '';
  private reasoningBuffer: string = '';
  private totalChunks: number = 0;

  constructor(config: Partial<StreamConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async process(
    response: Response,
    callbacks: StreamCallbacks
  ): Promise<StreamResult> {
    if (!response.ok) {
      let errorBody = '';
      try {
        errorBody = await response.text();
      } catch {
        errorBody = '(unreadable)';
      }
      const err = new Error(`HTTP error ${response.status}: ${errorBody.slice(0, 300)}`);
      callbacks.onError(err);
      throw err;
    }

    this.chunkBuffer = '';
    this.reasoningBuffer = '';
    this.totalChunks = 0;
    this.isActive = true;

    let raw = '';
    try {
      raw = await response.text();
    } catch (err: any) {
      const error = new Error(
        `[StreamProcessor] Failed to read response text: ${err?.message ?? String(err)}`
      );
      callbacks.onError(error);
      this.isActive = false;
      throw error;
    }

    if (!raw || !raw.trim()) {
      const error = new Error('[StreamProcessor] Empty response body from provider');
      callbacks.onError(error);
      this.isActive = false;
      throw error;
    }

    let data: any;
    try {
      data = JSON.parse(raw);
    } catch (err: any) {
      const error = new Error(
        `[StreamProcessor] JSON parse failed: ${err?.message ?? String(err)} — raw: ${raw.slice(0, 200)}`
      );
      callbacks.onError(error);
      this.isActive = false;
      throw error;
    }

    const content: string = data?.choices?.[0]?.message?.content ?? '';
    const reasoning: string = data?.choices?.[0]?.message?.reasoning ?? '';

    this.chunkBuffer = content;
    this.reasoningBuffer = reasoning;
    this.totalChunks = 1;

    try {
      callbacks.onChunk(content, reasoning || undefined);
    } catch (err) {
      console.warn('[StreamProcessor] onChunk callback threw:', (err as Error).message);
    }

    try {
      callbacks.onDone();
    } catch (err) {
      console.warn('[StreamProcessor] onDone callback threw:', (err as Error).message);
    }

    this.isActive = false;

    return {
      content,
      reasoning,
      chunks: this.totalChunks,
    };
  }

  abort(): void {
    this.isActive = false;
  }

  createSignal(): AbortSignal {
    const controller = new AbortController();
    return controller.signal;
  }

  getStats(): { chunks: number; contentLength: number; reasoningLength: number } {
    return {
      chunks: this.totalChunks,
      contentLength: this.chunkBuffer.length,
      reasoningLength: this.reasoningBuffer.length,
    };
  }
}

export async function fetchWithRetry(
  url: string,
  options: RequestInit & { timeout?: number },
  config: StreamConfig = DEFAULT_CONFIG
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        options.timeout || config.timeoutMs
      );

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const err = new Error(`RateLimitError: 429 Too Many Requests${retryAfter ? ` (retry after ${retryAfter}s)` : ''}`);
        (err as any).statusCode = 429;
        (err as any).isRateLimitError = true;
        throw err;
      }

      if (!response.ok && response.status >= 500 && attempt < config.maxRetries) {
        const delay = config.retryDelayMs * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      return response;
    } catch (error) {
      lastError = error as Error;
      if (attempt < config.maxRetries) {
        const delay = config.retryDelayMs * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Fetch failed after retries');
}

export function createStreamProcessor(config?: Partial<StreamConfig>): StreamProcessor {
  return new StreamProcessor(config);
}

export default StreamProcessor;
