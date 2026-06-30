/**
 * Production Monitoring Hooks — with Persistent Snapshots
 *
 * Tracks:
 *   - App startup performance timing (persistent)
 *   - Dropped frames (React Native FPS)
 *   - Sync latency (Supabase queries)
 *   - Queue latency (notification queue depth + age)
 *   - BLE disconnect frequency
 *   - Realtime connection health
 *
 * Persistence:
 *   - Startup analytics history (last 20 sessions)
 *   - Crash-session metrics written to AsyncStorage
 *   - Rolling sync/ble history with max entries
 *
 * All metrics are stored in-memory + persisted to AsyncStorage.
 * Integrates with the app bootstrap sequence.
 */
import { eventBus } from '../events/EventBus';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Storage Keys ──────────────────────────────────────────────────────────

const STORAGE_METRICS = 'rafiq_metrics_v3';
const STORAGE_STARTUP_HISTORY = 'rafiq_startup_history_v2';
const STORAGE_CIRCUIT_STATS = 'rafiq_circuit_stats_v1';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface AppMetrics {
  startupTimeMs: number;
  droppedFrames: number;
  avgFrameTimeMs: number;
  syncLatencyMs: Record<string, number>;
  queueDepth: number;
  queueOldestAgeMs: number;
  bleDisconnectCount: number;
  bleReconnectCount: number;
  realtimeHealth: 'healthy' | 'degraded' | 'down';
  lastSyncAt: number | null;
  sessionId: string;
}

interface SyncMetric {
  latencyMs: number;
  timestamp: number;
  table: string;
  success: boolean;
}

interface BLEMetric {
  event: 'connect' | 'disconnect' | 'reconnect';
  timestamp: number;
  deviceId?: string;
}

interface StartupSnapshot {
  sessionId: string;
  timestamp: number;
  startupTimeMs: number;
  droppedFrames: number;
  exitReason?: string;
  phases: Record<string, number>;
}

// ─── In-memory metrics store ─────────────────────────────────────────────

let metrics: AppMetrics = createEmptyMetrics();

// Init lock — prevents race between markStartupBegin and loadMetrics
let initPromise: Promise<void> | null = null;

// ─── Rolling history ──────────────────────────────────────────────────────

const syncHistory: SyncMetric[] = [];
const bleHistory: BLEMetric[] = [];
const startupHistory: StartupSnapshot[] = [];
const MAX_SYNC_ENTRIES = 50;
const MAX_BLE_ENTRIES = 100;
const MAX_STARTUP_HISTORY = 20;

function createEmptyMetrics(): AppMetrics {
  return {
    startupTimeMs: 0,
    droppedFrames: 0,
    avgFrameTimeMs: 0,
    syncLatencyMs: {},
    queueDepth: 0,
    queueOldestAgeMs: 0,
    bleDisconnectCount: 0,
    bleReconnectCount: 0,
    realtimeHealth: 'healthy',
    lastSyncAt: null,
    sessionId: `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  };
}

function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Persistence ──────────────────────────────────────────────────────────

async function loadMetrics(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_METRICS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.sessionId) {
        // Previous session crash data — preserve for crash analytics
        const prevSession: StartupSnapshot = {
          sessionId: parsed.sessionId,
          timestamp: Date.now() - 1,
          startupTimeMs: parsed.startupTimeMs,
          droppedFrames: parsed.droppedFrames,
          phases: {},
        };
        startupHistory.push(prevSession);
        if (startupHistory.length > MAX_STARTUP_HISTORY) startupHistory.shift();
      }
    }
  } catch { /* ignore */ }

  try {
    const raw = await AsyncStorage.getItem(STORAGE_STARTUP_HISTORY);
    if (raw) {
      const arr = JSON.parse(raw) as StartupSnapshot[];
      startupHistory.push(...arr.slice(-MAX_STARTUP_HISTORY));
    }
  } catch { /* ignore */ }

  metrics = createEmptyMetrics();
}

async function persistMetrics(): Promise<void> {
  try {
    const snapshot: AppMetrics & { _persistedAt: number } = {
      ...metrics,
      _persistedAt: Date.now(),
    };
    await AsyncStorage.setItem(STORAGE_METRICS, JSON.stringify(snapshot));
  } catch { /* ignore */ }
}

async function persistStartupHistory(): Promise<void> {
  try {
    const recent = startupHistory.slice(-MAX_STARTUP_HISTORY);
    await AsyncStorage.setItem(STORAGE_STARTUP_HISTORY, JSON.stringify(recent));
  } catch { /* ignore */ }
}

// ─── Startup tracking ──────────────────────────────────────────────────────

let startupStartTime = 0;

export function markStartupBegin(): void {
  startupStartTime = Date.now();
  metrics = createEmptyMetrics();
  if (!initPromise) {
    initPromise = loadMetrics().finally(() => { /* lock guard */ });
  }
}

export async function markStartupComplete(phaseDurations?: Record<string, number>): Promise<void> {
  if (startupStartTime > 0) {
    metrics.startupTimeMs = Date.now() - startupStartTime;

    const snapshot: StartupSnapshot = {
      sessionId: metrics.sessionId,
      timestamp: Date.now(),
      startupTimeMs: metrics.startupTimeMs,
      droppedFrames: metrics.droppedFrames,
      phases: phaseDurations ?? {},
    };

    startupHistory.push(snapshot);
    if (startupHistory.length > MAX_STARTUP_HISTORY) startupHistory.shift();

    await Promise.all([
      persistMetrics(),
      persistStartupHistory(),
    ]);

    eventBus.emit({
      type: 'monitoring.startup',
      source: 'system',
      timestamp: Date.now(),
      payload: {
        startupTimeMs: metrics.startupTimeMs,
        sessionId: metrics.sessionId,
        historyCount: startupHistory.length,
      },
    });

    startupStartTime = 0;
  }
}

// ─── Frame drop tracking (React Native) ───────────────────────────────────

let frameCount = 0;
let totalFrameTime = 0;
let dropCount = 0;

export function recordFrame(frameTimeMs: number): void {
  frameCount++;
  totalFrameTime += frameTimeMs;

  if (frameTimeMs > 16.67 * 2) {
    dropCount++;
  }

  if (frameCount % 60 === 0) {
    metrics.droppedFrames = dropCount;
    metrics.avgFrameTimeMs = Math.round(totalFrameTime / frameCount);
    dropCount = 0;
    frameCount = 0;
    totalFrameTime = 0;
    persistMetrics().catch(() => { });

    eventBus.emit({
      type: 'monitoring.frames',
      source: 'system',
      timestamp: Date.now(),
      payload: { droppedFrames: metrics.droppedFrames, avgFrameTimeMs: metrics.avgFrameTimeMs },
    });
  }
}

export function getDroppedFrameCount(): number {
  return metrics.droppedFrames;
}

// ─── Sync latency tracking ────────────────────────────────────────────────

export function recordSyncLatency(table: string, latencyMs: number, success: boolean): void {
  metrics.syncLatencyMs[table] = latencyMs;
  metrics.lastSyncAt = Date.now();

  syncHistory.push({ latencyMs, timestamp: Date.now(), table, success });
  if (syncHistory.length > MAX_SYNC_ENTRIES) syncHistory.shift();

  persistMetrics().catch(() => { });

  if (!success || latencyMs > 5000) {
    eventBus.emit({
      type: 'monitoring.syncSlow',
      source: 'system',
      timestamp: Date.now(),
      payload: { table, latencyMs, success },
      metadata: { severity: latencyMs > 5000 ? 'high' : 'low' },
    });
  }
}

export function getSyncLatencyStats(): {
  avg: number; p95: number; max: number; failureRate: number; count: number;
} {
  if (syncHistory.length === 0) return { avg: 0, p95: 0, max: 0, failureRate: 0, count: 0 };

  const latencies = syncHistory.map(s => s.latencyMs).sort((a, b) => a - b);
  const failures = syncHistory.filter(s => !s.success).length;

  return {
    avg: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
    p95: latencies[Math.floor(latencies.length * 0.95)] ?? 0,
    max: Math.max(...latencies),
    failureRate: Math.round((failures / syncHistory.length) * 100),
    count: syncHistory.length,
  };
}

// ─── Queue latency ─────────────────────────────────────────────────────────

export async function updateQueueMetrics(): Promise<void> {
  try {
    const queueRaw = await AsyncStorage.getItem('rafiq_notification_queue_v2');
    if (queueRaw) {
      const queue = JSON.parse(queueRaw) as Array<{ createdAt: number }>;
      metrics.queueDepth = queue.length;
      metrics.queueOldestAgeMs = queue.length > 0
        ? Date.now() - queue.reduce((a, b) => a.createdAt < b.createdAt ? a : b).createdAt
        : 0;
    } else {
      metrics.queueDepth = 0;
      metrics.queueOldestAgeMs = 0;
    }
    await persistMetrics();
  } catch { /* ignore */ }
}

// ─── BLE disconnect frequency ──────────────────────────────────────────────

export function recordBLEEvent(event: BLEMetric['event'], deviceId?: string): void {
  bleHistory.push({ event, timestamp: Date.now(), deviceId });
  if (bleHistory.length > MAX_BLE_ENTRIES) bleHistory.shift();

  if (event === 'disconnect') metrics.bleDisconnectCount++;
  if (event === 'reconnect') metrics.bleReconnectCount++;

  persistMetrics().catch(() => { });

  if (event === 'disconnect') {
    const recentDisconnects = bleHistory.filter(
      b => b.event === 'disconnect' && Date.now() - b.timestamp < 10 * 60 * 1000
    );
    if (recentDisconnects.length >= 3) {
      eventBus.emit({
        type: 'monitoring.bleUnstable',
        source: 'wearable',
        timestamp: Date.now(),
        payload: { recentDisconnects: recentDisconnects.length, deviceId },
        metadata: { severity: 'medium', category: 'wearable' },
      });
    }
  }

  eventBus.emit({
    type: 'monitoring.ble',
    source: 'wearable',
    timestamp: Date.now(),
    payload: { event, deviceId },
  });
}

// ─── Realtime health ────────────────────────────────────────────────────────

export function updateRealtimeHealth(health: AppMetrics['realtimeHealth']): void {
  const prev = metrics.realtimeHealth;
  metrics.realtimeHealth = health;
  persistMetrics().catch(() => { });

  if (health !== prev) {
    eventBus.emit({
      type: 'monitoring.realtimeHealth',
      source: 'system',
      timestamp: Date.now(),
      payload: { health, previous: prev },
      metadata: { severity: health === 'down' ? 'high' : health === 'degraded' ? 'medium' : 'low' },
    });
  }
}

// ─── Event bus integration ─────────────────────────────────────────────────

function setupEventListeners(): void {
  eventBus.on('wearable.disconnected', () => recordBLEEvent('disconnect'));
  eventBus.on('wearable.connected', (evt) => {
    const deviceId = typeof evt.payload === 'object' && evt.payload !== null
      ? (evt.payload as { deviceId?: string }).deviceId
      : undefined;
    recordBLEEvent('connect', deviceId);
  });
  eventBus.on('supabase.connectionStateChanged', (evt) => {
    const payload = evt.payload as { current?: string; previous?: string } | undefined;
    const health = payload?.current === 'active'
      ? 'healthy'
      : payload?.current === 'reconnecting' ? 'degraded' : 'down';
    updateRealtimeHealth(health);
  });
  eventBus.on('app.bootstrapComplete', (evt) => {
    const phases = (evt.payload as { phases?: Record<string, { durationMs?: number }> } | undefined)?.phases ?? {};
    const phaseDurations: Record<string, number> = {};
    for (const [key, val] of Object.entries(phases)) {
      if (typeof val === 'object' && val !== null && 'durationMs' in (val as object)) {
        phaseDurations[key] = (val as { durationMs: number }).durationMs;
      }
    }
    markStartupComplete(phaseDurations);
  });
}

// ─── Metrics snapshot ─────────────────────────────────────────────────────

export function getMetrics(): AppMetrics {
  return { ...metrics };
}

export function getStartupHistory(): StartupSnapshot[] {
  return [...startupHistory];
}

export function getStartupStats(): {
  avgStartup: number;
  bestStartup: number;
  worstStartup: number;
  sessions: number;
} {
  if (startupHistory.length === 0) return { avgStartup: 0, bestStartup: 0, worstStartup: 0, sessions: 0 };
  const times = startupHistory.map(s => s.startupTimeMs);
  return {
    avgStartup: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
    bestStartup: Math.min(...times),
    worstStartup: Math.max(...times),
    sessions: startupHistory.length,
  };
}

export function getMetricsSummary(): string {
  const syncStats = getSyncLatencyStats();
  return [
    `Startup: ${metrics.startupTimeMs}ms (session: ${metrics.sessionId.slice(0, 12)})`,
    `Dropped frames: ${metrics.droppedFrames}`,
    `Sync: avg=${syncStats.avg}ms p95=${syncStats.p95}ms fail=${syncStats.failureRate}%`,
    `Queue: depth=${metrics.queueDepth}`,
    `BLE: ↓${metrics.bleDisconnectCount} ↑${metrics.bleReconnectCount}`,
    `Realtime: ${metrics.realtimeHealth}`,
  ].join(' | ');
}

// ─── Init ────────────────────────────────────────────────────────────

let initialized = false;

export function initMonitoring(): void {
  if (initialized) return;
  initialized = true;

  markStartupBegin();
  setupEventListeners();

  // ── Crash Report Recovery ──
  // On startup, check if the previous session crashed.
  // If so, log it and clear the crash report.
  const CRASH_LOG_KEY = 'rafiq_crash_report';
  (async () => {
    try {
      const raw = await AsyncStorage.getItem(CRASH_LOG_KEY);
      if (raw) {
        const report = JSON.parse(raw);
        eventBus.emit({
          type: 'monitoring.previousCrash',
          source: 'system',
          timestamp: Date.now(),
          payload: { ...report },
          metadata: { severity: 'high', category: 'stability' },
        });
        // Clear the crash report after reading it
        await AsyncStorage.removeItem(CRASH_LOG_KEY);
      }
    } catch {
      // Ignore — crash recovery is best-effort
    }
  })();

  setInterval(() => { updateQueueMetrics(); }, 30_000);

  console.info('[Monitoring] Initialized', { sessionId: metrics.sessionId });
}