/**
 * NotificationsRepository — local SQLite + sync queue
 * Uses explicit insertColumns and updateColumns.
 * No Partial<T>, no as unknown as.
 */
import { BaseRepository, EntityRow } from './BaseRepository';
import { runQuery, runStatement, sanitizeBindings } from '../lib/database';
import { createUuid } from '../utils/uuid';

// ─────────────────────────────────────────
// Notification DTOs
// ─────────────────────────────────────────

export type NotificationType = 'critical' | 'reminder' | 'general';

export interface NotificationInsert {
  user_id: string;
  type: string;
  title: string;
  body?: string | null;
  data?: Record<string, unknown> | null;
  read?: number;
  read_at?: string | null;
  [key: string]: unknown;
}

export interface NotificationUpdate {
  type?: string;
  title?: string;
  body?: string | null;
  data?: Record<string, unknown> | null;
  read?: number;
  read_at?: string | null;
  [key: string]: unknown;
}

export interface NotificationRow extends EntityRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  data: string | null;
  read: number;
  created_at: string;
  read_at: string | null;
  updated_at: string | null;
}

// ─────────────────────────────────────────
// Alert DTOs
// ─────────────────────────────────────────

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface AlertInsert {
  user_id: string;
  type: string;
  severity?: AlertSeverity;
  title: string;
  message?: string | null;
  source?: string | null;
  acknowledged?: number;
  acknowledged_at?: string | null;
  [key: string]: unknown;
}

export interface AlertUpdate {
  type?: string;
  severity?: AlertSeverity;
  title?: string;
  message?: string | null;
  source?: string | null;
  acknowledged?: number;
  acknowledged_at?: string | null;
  [key: string]: unknown;
}

export interface AlertRow extends EntityRow {
  id: string;
  user_id: string;
  type: string;
  severity: string;
  title: string;
  message: string | null;
  source: string | null;
  acknowledged: number;
  acknowledged_at: string | null;
  created_at: string;
  updated_at: string | null;
}

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

function getDeviceId(): string {
  return `device_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─────────────────────────────────────────
// NotificationRepository
// ─────────────────────────────────────────

export class NotificationRepository extends BaseRepository<NotificationRow, NotificationInsert, NotificationUpdate> {
  readonly tableName = 'notifications';

  readonly insertColumns = [
    'user_id', 'type', 'title', 'body', 'data', 'read', 'read_at',
  ] as const;

  readonly updateColumns = [
    'type', 'title', 'body', 'data', 'read', 'read_at',
  ] as const;

  async getByUserId(userId: string, limit?: number): Promise<NotificationRow[]> {
    let sql = `SELECT * FROM notifications WHERE user_id = ? AND is_deleted = 0 ORDER BY created_at DESC`;
    const params: (string | number)[] = [userId];
    if (limit) {
      sql += ` LIMIT ?`;
      params.push(limit);
    }
    return runQuery<NotificationRow>(sql, params);
  }

  async markRead(id: string): Promise<void> {
    await runStatement(
      `UPDATE notifications SET read = 1, read_at = ? WHERE id = ?`,
      [new Date().toISOString(), id]
    );
    const { offlineQueue } = await import('../lib/offlineQueue');
    await offlineQueue.enqueue({
      table: 'notifications',
      operation: 'UPDATE',
      payload: { id, read: 1, read_at: new Date().toISOString() },
      recordId: id,
      priority: 'low',
    });
  }

  async markAllRead(userId: string): Promise<void> {
    const now = new Date().toISOString();
    await runStatement(
      `UPDATE notifications SET read = 1, read_at = ? WHERE user_id = ? AND read = 0`,
      [now, userId]
    );
  }

  async deleteForUser(userId: string): Promise<void> {
    const rows = await runQuery<{ id: string }>(
      `SELECT id FROM notifications WHERE user_id = ?`,
      [userId]
    );
    for (const row of rows) {
      await this.delete(row.id);
    }
  }

  async createNotification(payload: NotificationInsert): Promise<NotificationRow> {
    const id = createUuid();
    const now = new Date().toISOString();
    const deviceId = getDeviceId();

    const row: NotificationRow = {
      id,
      user_id: payload.user_id,
      type: payload.type,
      title: payload.title,
      body: payload.body ?? null,
      data: payload.data !== null && typeof payload.data === 'object' ? JSON.stringify(payload.data) : null,
      read: payload.read ?? 0,
      created_at: now,
      read_at: payload.read_at ?? null,
      updated_at: now,
      version: 1,
      updated_by_device: deviceId,
      is_deleted: 0,
      deleted_at: null,
      deleted_by: null,
    };

    const columns = [
      'id', 'user_id', 'type', 'title', 'body', 'data', 'read', 'created_at',
      'read_at', 'updated_at', 'version', 'updated_by_device', 'is_deleted',
      'deleted_at', 'deleted_by',
    ];

    const placeholders = columns.map(() => '?').join(', ');
    const values = sanitizeBindings(columns.map(col => row[col as keyof NotificationRow]));

    await runStatement(
      `INSERT INTO notifications (${columns.join(', ')}) VALUES (${placeholders})`,
      values
    );

    return row;
  }
}

// ─────────────────────────────────────────
// AlertRepository
// ─────────────────────────────────────────

export class AlertRepository extends BaseRepository<AlertRow, AlertInsert, AlertUpdate> {
  readonly tableName = 'alerts';

  readonly insertColumns = [
    'user_id', 'type', 'severity', 'title', 'message', 'source', 'acknowledged', 'acknowledged_at',
  ] as const;

  readonly updateColumns = [
    'type', 'severity', 'title', 'message', 'source', 'acknowledged', 'acknowledged_at',
  ] as const;

  async getByUserId(userId: string): Promise<AlertRow[]> {
    return runQuery<AlertRow>(
      `SELECT * FROM alerts WHERE user_id = ? AND is_deleted = 0 ORDER BY created_at DESC`,
      [userId]
    );
  }

  async acknowledge(id: string): Promise<void> {
    await runStatement(
      `UPDATE alerts SET acknowledged = 1, acknowledged_at = ? WHERE id = ?`,
      [new Date().toISOString(), id]
    );
    const { offlineQueue } = await import('../lib/offlineQueue');
    await offlineQueue.enqueue({
      table: 'alerts',
      operation: 'UPDATE',
      payload: { id, acknowledged: 1, acknowledged_at: new Date().toISOString() },
      recordId: id,
      priority: 'low',
    });
  }

  async createAlert(payload: AlertInsert): Promise<AlertRow> {
    const id = createUuid();
    const now = new Date().toISOString();
    const deviceId = getDeviceId();

    const row: AlertRow = {
      id,
      user_id: payload.user_id,
      type: payload.type,
      severity: payload.severity ?? 'info',
      title: payload.title,
      message: payload.message ?? null,
      source: payload.source ?? null,
      acknowledged: payload.acknowledged ?? 0,
      acknowledged_at: payload.acknowledged_at ?? null,
      created_at: now,
      updated_at: now,
      version: 1,
      updated_by_device: deviceId,
      is_deleted: 0,
      deleted_at: null,
      deleted_by: null,
    };

    const columns = [
      'id', 'user_id', 'type', 'severity', 'title', 'message', 'source',
      'acknowledged', 'acknowledged_at', 'created_at', 'updated_at',
      'version', 'updated_by_device', 'is_deleted', 'deleted_at', 'deleted_by',
    ];

    const placeholders = columns.map(() => '?').join(', ');
    const values = sanitizeBindings(columns.map(col => row[col as keyof AlertRow]));

    await runStatement(
      `INSERT INTO alerts (${columns.join(', ')}) VALUES (${placeholders})`,
      values
    );

    return row;
  }
}
