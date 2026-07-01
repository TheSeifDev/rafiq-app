function getVar(name: string, required = false): string | undefined {
  const value = process.env[name];

  if (!value && required) {
    console.error(`[ENV] Required environment variable missing: ${name}`);
    return undefined;
  }

  console.log(`[ENV] ${name}:`, value ? 'present' : 'missing');

  return value;
}

function getAPIKey(name: string): string | undefined {
  const key = getVar(name, false);

  if (!key) return undefined;

  const cleaned = key.trim().replace(/^["']|["']$/g, "");

  if (!cleaned.startsWith("sk-or-v1-") && !cleaned.startsWith("gsk_")) {
    console.warn(`[ENV] ${name} may be invalid format (expected sk-or-v1- or gsk_)`);
  }

  return cleaned;
}

// Environment exports
export const env = {
  supabaseUrl: getVar("EXPO_PUBLIC_SUPABASE_URL", true),
  supabaseAnonKey: getVar("EXPO_PUBLIC_SUPABASE_ANON_KEY", true),
  openRouterApiKey: getAPIKey("EXPO_PUBLIC_OPENROUTER_API_KEY"),
  groqApiKey: getAPIKey("EXPO_PUBLIC_GROQ_KEY"),
  groqModel: getVar("EXPO_PUBLIC_GROQ_MODEL") ?? "llama-3.1-8b-instant",
  openRouterModel: getVar("EXPO_PUBLIC_OPENROUTER_MODEL") ?? "openai/gpt-4o-mini",
  enableDebugLogs: getVar("EXPO_PUBLIC_DEBUG") === "true",
};

// Validation check
export function validate(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!env.supabaseUrl) {
    errors.push("EXPO_PUBLIC_SUPABASE_URL is required");
  }

  if (!env.supabaseAnonKey) {
    errors.push("EXPO_PUBLIC_SUPABASE_ANON_KEY is required");
  }

  if (!env.openRouterApiKey && !env.groqApiKey) {
    errors.push("At least one AI provider API key required (EXPO_PUBLIC_OPENROUTER_API_KEY or EXPO_PUBLIC_GROQ_KEY)");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// Log environment status on startup
export function logStatus(): void {
  console.log("═══ Environment Status ═══");
  console.log("Supabase:", env.supabaseUrl ? "✓" : "✗");
  console.log("OpenRouter:", env.openRouterApiKey ? "✓" : "✗");
  console.log("Groq:", env.groqApiKey ? "✓" : "✗");
  console.log("═══════════════════════════");

  const validation = validate();
  if (!validation.valid) {
    console.error("[ENV] Configuration errors:", validation.errors);
  }
}

export default env;
