/**
 * Database Helpers — production-safe UUID and bindings
 */

import 'react-native-get-random-values';

function generateUUID(): string {
  return crypto.randomUUID();
}

export function generateId(_prefix?: string): string {
  // Always return a bare UUID — Supabase uuid columns reject prefixed IDs.
  // The prefix parameter is kept for API compatibility but is intentionally ignored.
  return generateUUID();
}

export function sanitizeBindings(
  args: unknown[]
): (string | number | null | Uint8Array)[] {
  return args.map((arg) => {
    if (arg === undefined) return null;

    if (arg === null) return null;

    if (typeof arg === 'string') {
      return arg.trim() === '' ? null : arg;
    }

    if (typeof arg === 'number') {
      return arg;
    }

    if (arg instanceof Uint8Array) {
      return arg;
    }

    if (typeof arg === 'boolean') {
      return arg ? 1 : 0;
    }

    if (typeof arg === 'object') {
      return JSON.stringify(arg);
    }

    return null;
  });
}

let cachedDeviceId: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) {
    return cachedDeviceId;
  }

  cachedDeviceId = generateId('device');

  return cachedDeviceId;
}

export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

export function uuidToBuffer(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '');

  const bytes = new Uint8Array(16);

  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }

  return bytes;
}