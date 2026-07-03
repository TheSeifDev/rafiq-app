export interface AIProvider {
  name: string;
  id: string;
  generateStreaming(
    messages: AIMessage[],
    context: HealthContext,
    onChunk: (text: string) => void,
    signal?: AbortSignal
  ): Promise<string>;

  generate(
    messages: AIMessage[],
    context: HealthContext
  ): Promise<AIMessage>;

  isAvailable(): Promise<boolean>;
}

export interface AIMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface HealthContext {
  patientName: string;
  latestVitals: {
    heartRate?: number;
    bloodPressureSys?: number;
    bloodPressureDia?: number;
    oxygenSaturation?: number;
    temperature?: number;
  };
  medications: {
    name: string;
    dosage?: string;
    time?: string;
  }[];
  recentAlerts: string[];
  lastUpdated: string;
  conditions?: Array<{ name: string; severity?: string | null; isActive?: boolean }>;
  allergies?: string[];
  hospital?: { name?: string | null; phone?: string | null; address?: string | null };
  emergencyContacts?: Array<{ name: string; phone: string; relation?: string }>;
  profileCompletion?: { percentage: number; missingFields: string[] };
}

export interface AIProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export type StreamingCallback = (text: string) => void;

export interface AIResponse {
  content: string;
  provider: string;
  model: string;
  tokens?: number;
  finishReason: "stop" | "length" | "content_filter" | "error";
}

export class AIProviderError extends Error {
  constructor(
    message: string,
    public provider: string,
    public statusCode?: number,
    public isRetryable: boolean = false
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}

export class AIRateLimitError extends AIProviderError {
  constructor(provider: string, public retryAfter?: number) {
    super("Rate limit exceeded", provider, 429, true);
    this.name = "AIRateLimitError";
  }
}

export class AITimeoutError extends AIProviderError {
  constructor(provider: string) {
    super("Request timed out", provider, 504, true);
    this.name = "AITimeoutError";
  }
}
