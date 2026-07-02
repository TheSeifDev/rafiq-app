import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ─── FIX #1: Lazy initialization — don't throw at module load time ─────────
// The old code threw immediately if env vars were missing, crashing the
// entire app before any screen could render. Now we initialize lazily
// so the app can at least start and show a proper error message.

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

let _client: SupabaseClient | null = null;

function createSupabaseClient(): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    const missing: string[] = [];
    if (!supabaseUrl) missing.push('EXPO_PUBLIC_SUPABASE_URL');
    if (!supabaseAnonKey) missing.push('EXPO_PUBLIC_SUPABASE_ANON_KEY');
    throw new Error(
      `Missing Supabase environment variables: ${missing.join(', ')}. ` +
      `Create a .env file with these variables.`
    );
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
}

/**
 * Lazy Supabase client accessor.
 * FIX: Defers creation to first property access so missing env vars
 * don't white-screen crash the app at module load time.
 */
function getSupabaseClient(): SupabaseClient {
  if (!_client) {
    _client = createSupabaseClient();
    console.log('[Supabase] Client initialized successfully');
  }
  return _client;
}

/**
 * Check if Supabase env vars are configured (without creating the client).
 */
export function isSupabaseConfigured(): boolean {
  return !!(supabaseUrl && supabaseAnonKey);
}

// ─── Backward-compatible named export via Proxy ──────────────────────────
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getSupabaseClient();
    const value = Reflect.get(client, prop, receiver);
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  },
});

export default supabase;