import 'react-native-get-random-values';

function generateUUID(): string {
  return crypto.randomUUID();
}

export function generateId(_prefix?: string): string {
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

  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const KEY = '@rafiq_device_id';
    const existing = await AsyncStorage.getItem(KEY);
    if (existing) {
      cachedDeviceId = existing;
      return existing;
    }
    const fresh = generateId('device');
    await AsyncStorage.setItem(KEY, fresh);
    cachedDeviceId = fresh;
    return fresh;
  } catch (err) {
    console.warn('[helpers] getDeviceId: AsyncStorage unavailable, using session-scoped ID:', err);
    const fallback = generateId('device');
    cachedDeviceId = fallback;
    return fallback;
  }
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
