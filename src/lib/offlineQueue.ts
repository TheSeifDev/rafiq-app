import AsyncStorage from '@react-native-async-storage/async-storage';

export type SyncPriority = 'critical' | 'high' | 'medium' | 'low';

export interface QueueItem {
  id: string;
  table: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  payload: Record<string, unknown>;
  recordId: string;
  priority: SyncPriority;
  userId?: string;
  createdAt: string;
  retries: number;
}

interface QueueMeta {
  lastSync: string | null;
  lastPush: string | null;
  queueVersion: number;
  deviceId: string;
}

const QUEUE_KEY = '@rafiq_offline_queue';
const META_KEY  = '@rafiq_offline_queue_meta';

let _isProcessing = false;

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function createDeviceId(): string {
  return `device_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const PRIORITY_ORDER: Record<SyncPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

async function getMeta(): Promise<QueueMeta> {
  const defaults: QueueMeta = {
    lastSync: null,
    lastPush: null,
    queueVersion: 1,
    deviceId: createDeviceId(),
  };
  try {
    const raw = await AsyncStorage.getItem(META_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<QueueMeta>;
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
}

async function saveMeta(meta: QueueMeta): Promise<void> {
  try {
    await AsyncStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch (err) {
    console.warn('[offlineQueue] Failed to save meta:', (err as Error).message);
  }
}

async function getQueue(): Promise<QueueItem[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as QueueItem[];
  } catch {
    return [];
  }
}

async function saveQueue(items: QueueItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  } catch (err) {
    console.error('[offlineQueue] Failed to save queue:', (err as Error).message);
  }
}

export const offlineQueue = {

  async enqueue(item: {
    table: string;
    operation: string;
    payload: Record<string, unknown>;
    recordId: string;
    priority?: SyncPriority;
    userId?: string;
  }): Promise<void> {
    const queue = await getQueue();

    const queueItem: QueueItem = {
      id: generateId(),
      table: item.table,
      operation: item.operation as QueueItem['operation'],
      payload: item.payload,
      recordId: item.recordId,
      priority: item.priority ?? 'medium',
      userId: item.userId,
      createdAt: new Date().toISOString(),
      retries: 0,
    };

    queue.push(queueItem);

    queue.sort(
      (a, b) => (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2)
    );

    await saveQueue(queue);
  },

  async dequeue(): Promise<QueueItem | null> {
    if (_isProcessing) return null;
    const queue = await getQueue();
    if (queue.length === 0) return null;
    const item = queue.shift()!;
    await saveQueue(queue);
    return item;
  },

  async peek(): Promise<QueueItem | null> {
    const queue = await getQueue();
    return queue[0] ?? null;
  },

  async getPendingCount(): Promise<number> {
    const queue = await getQueue();
    return queue.length;
  },

  async clear(): Promise<void> {
    await AsyncStorage.removeItem(QUEUE_KEY);
  },

  async removeById(id: string): Promise<void> {
    const queue = await getQueue();
    const filtered = queue.filter(item => item.id !== id);
    if (filtered.length !== queue.length) {
      await saveQueue(filtered);
    }
  },

  async processQueue(): Promise<{ processed: number; failed: number }> {
    if (_isProcessing) return { processed: 0, failed: 0 };
    _isProcessing = true;

    let processed = 0;
    let failed = 0;

    try {
      const queue = await getQueue();
      const meta = await getMeta();

      processed = queue.length;

      meta.lastSync = new Date().toISOString();
      await saveMeta(meta);

      if (processed > 0) {
        await saveQueue([]);
      }
    } catch (err) {
      console.error('[offlineQueue] Queue processing failed:', err);
      failed = 1;
    } finally {
      _isProcessing = false;
    }

    return { processed, failed };
  },

  get isProcessing(): boolean {
    return _isProcessing;
  },

  async getMeta(): Promise<QueueMeta> {
    return getMeta();
  },
};

export default offlineQueue;
