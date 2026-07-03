import { localSyncEngine } from '../local/syncEngine';
import { env } from '../config/env';

const SYNC_INTERVAL_MS = 60 * 60 * 1000;
const DEBOUNCE_MS = 5_000;

class SyncService {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private currentUserId: string | null = null;
  private isSyncing = false;

  start(userId: string): void {
    if (this.intervalId) {
      this.currentUserId = userId;
      return;
    }

    this.currentUserId = userId;
    console.info('[SyncService] Starting periodic sync (interval:', SYNC_INTERVAL_MS / 1000 / 60, 'min)');

    this.runSync('startup').catch(err =>
      console.warn('[SyncService] Startup sync failed (non-fatal):', err)
    );

    this.intervalId = setInterval(() => {
      this.runSync('periodic').catch(err =>
        console.warn('[SyncService] Periodic sync failed (non-fatal):', err)
      );
    }, SYNC_INTERVAL_MS);
  }

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

  async syncImmediate(): Promise<{ pushed: number; failed: number }> {
    return this.runSync('immediate');
  }

  private async isOnline(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const url = env.supabaseUrl ? `${env.supabaseUrl}/rest/v1/` : 'https://supabase.co/rest/v1/';
      const headers: Record<string, string> = {};
      if (env.supabaseAnonKey) headers.apikey = env.supabaseAnonKey;
      const res = await fetch(url, {
        signal: controller.signal,
        method: 'HEAD',
        headers,
      });
      clearTimeout(timeoutId);
      return res.status < 500;
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
      const result = await localSyncEngine.push(100);

      try {
        const pullResult = await localSyncEngine.pull({
          userId: this.currentUserId,
        });
        console.info(
          `[SyncService] Pull complete (${reason}): pulled=${pullResult.pulled}, failed=${pullResult.failed}`
        );
      } catch (pullErr) {
        console.warn(
          '[SyncService] Pull failed (non-fatal):',
          pullErr instanceof Error ? pullErr.message : pullErr
        );
      }

      console.info(
        `[SyncService] Sync complete (${reason}): pushed=${result.pushed}, failed=${result.failed}, remaining=${result.remaining}`
      );
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
