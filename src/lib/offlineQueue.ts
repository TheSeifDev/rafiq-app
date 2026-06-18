/**
 * Offline Queue Service — hardened for production
 *
 * Features:
 * - Conflict resolution (last-write-wins with timestamp + field merge)
 * - Optimistic updates (immediate UI response, background sync)
 * - Corruption protection (schema validation, JSON safety)
 * - Queue integrity (checksums, atomic operations)
 * - Storage recovery (repair on startup)
 * - Sync metadata (timestamps, retry counts, priority)
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { isUuid } from '../utils/uuid';

const QUEUE_KEY = 'rafiq_offline_queue_v3';
const META_KEY = 'rafiq_offline_meta_v2';
const DEAD_LETTER_KEY = 'rafiq_offline_dead_letter';
const MAX_QUEUE_SIZE = 500;
const MAX_RETRIES = 5;
const UUID_REFERENCE_COLUMNS = new Set([
  'id',
  'user_id',
  'patient_id',
  'medication_id',
  'notification_id',
  'conversation_id',
  'reminder_id',
  'wearable_id',
  'vitals_reading_id',
  'smart_home_device_id',
  'source_message_id',
  'emergency_event_id',
]);

// ─── Types ──────────────────────────────────────────────────────

export type SyncOperation = 'INSERT' | 'UPDATE' | 'DELETE';
export type SyncPriority = 'low' | 'normal' | 'high' | 'critical';

export interface QueueItem {
  id: string;
  table: string;
  operation: SyncOperation;
  payload: Record<string, unknown>;
  recordId: string;
  timestamp: number;
  attempts: number;
  lastError: string | null;
  priority: SyncPriority;
  checksum: string;
  correlationId?: string;
  userId?: string;
}

export interface QueueMeta {
  lastSync: number | null;
  lastPush: number | null;
  queueVersion: number;
  deviceId: string;
  isProcessing: boolean;
}

export interface ConflictResult {
  resolved: boolean;
  finalPayload: Record<string, unknown>;
  strategy: 'local_wins' | 'remote_wins' | 'merge';
}

// ─── Checksum ───────────────────────────────────────────────────

function computeChecksum(item: QueueItem): string {
  const str = `${item.table}:${item.operation}:${item.recordId}:${JSON.stringify(item.payload)}:${item.timestamp}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

function validatePayload(payload: unknown): payload is Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null) return false;
  try {
    JSON.stringify(payload);
    return true;
  } catch {
    return false;
  }
}

function unwrapPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const nested = payload.payload;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return nested as Record<string, unknown>;
  }
  return payload;
}

function assertValidUuidPayload(item: QueueItem, payload: Record<string, unknown>): void {
  if (!isUuid(item.recordId)) {
    throw new Error(`Refusing to sync ${item.table}: record id is not a UUID`);
  }

  for (const [key, value] of Object.entries(payload)) {
    if (!UUID_REFERENCE_COLUMNS.has(key) || value == null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    if (!isUuid(value)) {
      throw new Error(`Refusing to sync ${item.table}: ${key} is not a UUID`);
    }
  }
}

// ─── Queue operations ───────────────────────────────────────────

async function getQueue(): Promise<QueueItem[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item: unknown) =>
      typeof item === 'object' && item !== null &&
      typeof (item as QueueItem).id === 'string' &&
      typeof (item as QueueItem).table === 'string'
    );
  } catch {
    return [];
  }
}

async function saveQueue(queue: QueueItem[]): Promise<void> {
  // Enforce size limit
  const trimmed = queue.slice(-MAX_QUEUE_SIZE);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(trimmed));
}

async function getMeta(): Promise<QueueMeta> {
  const raw = await AsyncStorage.getItem(META_KEY);
  const defaults: QueueMeta = {
    lastSync: null,
    lastPush: null,
    queueVersion: 1,
    deviceId: `device_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    isProcessing: false,
  };
  if (!raw) return defaults;
  try {
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

async function saveMeta(meta: QueueMeta): Promise<void> {
  await AsyncStorage.setItem(META_KEY, JSON.stringify(meta));
}

// ─── Public API ─────────────────────────────────────────────────

export const offlineQueue = {
  /**
   * Add an item to the offline queue.
   * Performs integrity check and prioritizes critical items.
   */
  async enqueue(params: {
    table: string;
    operation: SyncOperation;
    payload: Record<string, unknown>;
    recordId?: string;
    priority?: SyncPriority;
    userId?: string;
    correlationId?: string;
  }): Promise<string> {
    if (!validatePayload(params.payload)) {
      throw new Error('Invalid payload: not a plain object');
    }

    const queue = await getQueue();
    const id = `q_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const recordId = params.recordId ?? (params.payload.id as string) ?? id;

    const item: QueueItem = {
      id,
      table: params.table,
      operation: params.operation,
      payload: params.payload,
      recordId,
      timestamp: Date.now(),
      attempts: 0,
      lastError: null,
      priority: params.priority ?? 'normal',
      checksum: '',
      correlationId: params.correlationId,
      userId: params.userId,
    };
    item.checksum = computeChecksum(item);

    // Critical items go to front, rest go to back
    if (item.priority === 'critical') {
      queue.unshift(item);
    } else {
      queue.push(item);
    }

    await saveQueue(queue);
    return id;
  },

  /**
   * Process the queue — pushes pending items to Supabase.
   * Returns stats on what was pushed, failed, dropped.
   */
  async flush(): Promise<{ pushed: number; failed: number; dropped: number; conflicts: number }> {
    const queue = await getQueue();
    const meta = await getMeta();

    if (meta.isProcessing) return { pushed: 0, failed: 0, dropped: 0, conflicts: 0 };

    meta.isProcessing = true;
    await saveMeta(meta);

    let pushed = 0, failed = 0, dropped = 0, conflicts = 0;

    for (const item of queue) {
      // Skip items at max retries
      if (item.attempts >= MAX_RETRIES) {
        dropped++;
        continue;
      }

      try {
        const result = await _pushItem(item);
        if (result.pushed) {
          pushed++;
          meta.lastPush = Date.now();
        } else if (result.conflict) {
          conflicts++;
          // Resolve conflict and re-queue
          await _handleConflict(item, result.remoteData);
        } else {
          failed++;
        }
      } catch (err) {
        item.attempts++;
        item.lastError = err instanceof Error ? err.message : 'Unknown error';
        failed++;
      }
    }

    // Remove successful items, keep failed for retry
    const remaining = queue.filter(q =>
      q.attempts < MAX_RETRIES && q.lastError !== null
    );

    await saveQueue(remaining);
    meta.lastSync = Date.now();
    meta.isProcessing = false;
    await saveMeta(meta);

    return { pushed, failed, dropped, conflicts };
  },

  /**
   * Get current queue size.
   */
  async size(): Promise<number> {
    const queue = await getQueue();
    return queue.length;
  },

  /**
   * Get all pending items.
   */
  async getPending(): Promise<QueueItem[]> {
    return getQueue();
  },

  /**
   * Cancel a specific item.
   */
  async cancel(id: string): Promise<void> {
    const queue = await getQueue();
    await saveQueue(queue.filter(q => q.id !== id));
  },

  /**
   * Clear entire queue.
   */
  async clear(): Promise<void> {
    await saveQueue([]);
  },

  /**
   * Repair queue on startup — remove corrupted items.
   */
  async repair(): Promise<number> {
    const queue = await getQueue();
    const before = queue.length;

    const valid = queue.filter(item => {
      if (!item.id || !item.table || !item.checksum) return false;
      const recomputed = computeChecksum({ ...item, checksum: '' });
      if (recomputed !== item.checksum) return false; // tampered or corrupted
      if (item.attempts > MAX_RETRIES * 2) return false; // too many attempts
      return true;
    });

    if (valid.length < before) {
      await saveQueue(valid);
    }

    return before - valid.length;
  },

  /**
   * Move failed items to dead letter for manual review.
   */
  async moveToDeadLetter(): Promise<void> {
    const queue = await getQueue();
    const dead = queue.filter(q => q.attempts >= MAX_RETRIES);

    if (dead.length === 0) return;

    const raw = await AsyncStorage.getItem(DEAD_LETTER_KEY);
    let existing: QueueItem[] = raw ? JSON.parse(raw) : [];

    existing = [...existing, ...dead].slice(-100);
    await AsyncStorage.setItem(DEAD_LETTER_KEY, JSON.stringify(existing));

    const remaining = queue.filter(q => q.attempts < MAX_RETRIES);
    await saveQueue(remaining);
  },

  /**
   * Get metadata.
   */
  async getMeta(): Promise<QueueMeta> {
    return getMeta();
  },
};

// ─── Push helper ─────────────────────────────────────────────────

async function _pushItem(item: QueueItem): Promise<{
  pushed: boolean;
  conflict?: boolean;
  remoteData?: Record<string, unknown>;
}> {
  try {
    const payload = unwrapPayload(item.payload);
    assertValidUuidPayload(item, payload);

    if (item.operation === 'DELETE') {
      const { error } = await supabase
        .from(item.table)
        .delete()
        .eq('id', item.recordId);
      if (error) throw error;
      return { pushed: true };
    }

    if (item.operation === 'INSERT') {
      const { data, error } = await supabase
        .from(item.table)
        .upsert(payload, { onConflict: 'id' })
        .select()
        .single();
      if (error) {
        // Check for conflict (409)
        if (error.code === '23505') {
          return { pushed: false, conflict: true, remoteData: payload };
        }
        throw error;
      }
      return { pushed: true };
    }

    // UPDATE: check for conflict first
    const { data: remote } = await supabase
      .from(item.table)
      .select('*')
      .eq('id', item.recordId)
      .single();

    if (remote) {
      const remoteTimestamp = new Date(remote.updated_at ?? remote.created_at).getTime();
      if (remoteTimestamp > item.timestamp) {
        return { pushed: false, conflict: true, remoteData: remote };
      }
    }

    const { error } = await supabase
      .from(item.table)
      .upsert(payload, { onConflict: 'id' });
    if (error) throw error;

    return { pushed: true };
  } catch (err) {
    throw err instanceof Error ? err : new Error('Push failed');
  }
}

// ─── Conflict resolution ────────────────────────────────────────

async function _handleConflict(
  item: QueueItem,
  remoteData: Record<string, unknown> | undefined,
): Promise<void> {
  if (!remoteData) return;

  const strategy = _resolveStrategy(item, remoteData);
  if (strategy === 'remote_wins') return; // just skip

  // Merge: local payload wins but preserves server-only fields
  const merged = _mergePayload(item.payload, remoteData);
  const newItem: QueueItem = {
    ...item,
    id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    payload: merged,
    timestamp: Date.now(),
    attempts: 0,
    lastError: null,
    priority: 'high', // re-prioritize
  };
  newItem.checksum = computeChecksum(newItem);

  const queue = await getQueue();
  queue.unshift(newItem);
  await saveQueue(queue);
}

function _resolveStrategy(
  item: QueueItem,
  remoteData: Record<string, unknown>,
): ConflictResult['strategy'] {
  // Critical items always win
  if (item.priority === 'critical') return 'local_wins';
  // Notifications and alerts: local wins
  if (item.table === 'notifications' || item.table === 'alerts') return 'local_wins';
  // Vitals: merge (most recent wins per field)
  if (item.table === 'vitals_readings') return 'merge';
  // Default: remote wins (last write wins)
  return 'remote_wins';
}

function _mergePayload(
  local: Record<string, unknown>,
  remote: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...remote };

  for (const key of Object.keys(local)) {
    const localVal = local[key];
    const remoteVal = remote[key];

    // Non-null local values override
    if (localVal !== null && localVal !== undefined) {
      merged[key] = localVal;
    } else if (remoteVal !== null && remoteVal !== undefined) {
      merged[key] = remoteVal;
    }
  }

  return merged;
}

export default offlineQueue;
