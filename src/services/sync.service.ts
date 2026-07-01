/**
 * Sync Service — Local SQLite → Supabase hourly background sync.
 *
 * Architecture:
 * - Uses existing localSyncEngine.push() which already has pending_sync queue
 * - Adds periodic scheduling (every 1 hour) + immediate first sync on login
 * - Debounces manual sync calls to avoid hammering the backend
 * - Skips sync if device is offline (network check via fetch)
 * - Order: patients first (dependency), then all other tables
 *
 * Usage:
 *   import { syncService } from './sync.service';
 *   syncService.start(userId);   // on login
 *   syncService.stop();           // on logout
 *   syncService.syncNow();        // after a write (debounced 5s)
 */

import { localSyncEngine } from '../local/syncEngine';

const SYNC_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const DEBOUNCE_MS = 5_000; // 5 seconds

class SyncService {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private currentUserId: string | null = null;
  private isSyncing = false;

  // ── Public API ─────────────────────────────────────────────

  /**
   * Start periodic sync. Call this immediately after login.
   * Runs first sync immediately, then every SYNC_INTERVAL_MS.
   */
  start(userId: string): void {
    if (this.intervalId) {
      // Already running — just update userId
      this.currentUserId = userId;
      return;
    }

    this.currentUserId = userId;
    console.info('[SyncService] Starting periodic sync (interval:', SYNC_INTERVAL_MS / 1000 / 60, 'min)');

    // First sync — run immediately but don't block startup
    this.runSync('startup').catch(err =>
      console.warn('[SyncService] Startup sync failed (non-fatal):', err)
    );

    // Periodic sync
    this.intervalId = setInterval(() => {
      this.runSync('periodic').catch(err =>
        console.warn('[SyncService] Periodic sync failed (non-fatal):', err)
      );
    }, SYNC_INTERVAL_MS);
  }

  /**
   * Stop periodic sync. Call this on logout.
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.currentUserId = null;
    console.info('[SyncService] Periodic sync stopped.');
  }

  /**
   * Manually trigger a sync with 5-second debounce.
   * Call this after any write operation to ensure fast propagation.
   */
  syncNow(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.runSync('manual').catch(err =>
        console.warn('[SyncService] Manual sync failed (non-fatal):', err)
      );
    }, DEBOUNCE_MS);
  }

  /**
   * Immediately sync without debounce. Useful after critical writes.
   */
  async syncImmediate(): Promise<{ pushed: number; failed: number }> {
    return this.runSync('immediate');
  }

  // ── Internal ───────────────────────────────────────────────

  private async isOnline(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      // Hit a lightweight endpoint to check connectivity
      const res = await fetch('https://dns.google', { signal: controller.signal, method: 'HEAD' });
      clearTimeout(timeoutId);
      return res.ok || res.status < 500;
    } catch {
      return false;
    }
  }

  private async runSync(reason: string): Promise<{ pushed: number; failed: number }> {
    if (this.isSyncing) {
      console.info('[SyncService] Sync already in progress, skipping:', reason);
      return { pushed: 0, failed: 0 };
    }

    if (!this.currentUserId) {
      console.info('[SyncService] No user logged in, skipping sync:', reason);
      return { pushed: 0, failed: 0 };
    }

    const online = await this.isOnline();
    if (!online) {
      console.info('[SyncService] Offline, skipping sync:', reason);
      return { pushed: 0, failed: 0 };
    }

    this.isSyncing = true;
    console.info('[SyncService] Running sync (reason:', reason, ')');

    try {
      // Push pending_sync queue to Supabase
      // localSyncEngine.push() already handles ordering and UUID validation
      const result = await localSyncEngine.push(100);
      console.info(`[SyncService] Sync complete (${reason}): pushed=${result.pushed}, failed=${result.failed}, remaining=${result.remaining}`);
      return { pushed: result.pushed, failed: result.failed };
    } catch (err) {
      console.warn('[SyncService] Sync error:', err instanceof Error ? err.message : err);
      return { pushed: 0, failed: 0 };
    } finally {
      this.isSyncing = false;
    }
  }
}

export const syncService = new SyncService();
export default syncService;
