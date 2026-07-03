import * as SQLite from 'expo-sqlite';
import type {
  WearableConnection,
  WearableVitals,
  WearableConnectionInsert,
  WearableVitalsInsert,
} from '../types/wearable';
import { sanitizeBindings, generateId } from '../lib/database/helpers';

class WearableRepository {
  async insertConnection(
    db: SQLite.SQLiteDatabase,
    connection: WearableConnectionInsert
  ): Promise<void> {
    const sql = `
      INSERT INTO wearable_connections (
        id, user_id, provider, provider_device_id, access_token, refresh_token,
        expires_at, connected_at, last_sync, is_active, version,
        updated_at, updated_by_device, is_deleted, deleted_at, deleted_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const bindings = sanitizeBindings([
      connection.id,
      connection.user_id,
      connection.provider,
      connection.provider_device_id,
      connection.access_token,
      connection.refresh_token,
      connection.expires_at,
      connection.connected_at,
      connection.last_sync,
      connection.is_active,
      connection.version,
      connection.updated_at,
      connection.updated_by_device,
      connection.is_deleted,
      connection.deleted_at,
      connection.deleted_by,
    ]);

    await db.runAsync(sql, bindings as SQLite.SQLiteBindValue[]);
  }

  async getActiveConnections(db: SQLite.SQLiteDatabase): Promise<WearableConnection[]> {
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM wearable_connections
       WHERE is_active = 1 AND is_deleted = 0
       ORDER BY connected_at DESC`
    );

    return rows.map((row) => this.mapConnectionRow(row));
  }

  async getConnectionsByUser(
    db: SQLite.SQLiteDatabase,
    userId: string
  ): Promise<WearableConnection[]> {
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM wearable_connections
       WHERE user_id = ? AND is_deleted = 0
       ORDER BY connected_at DESC`,
      [userId]
    );

    return rows.map((row) => this.mapConnectionRow(row));
  }

  async markConnectionDeleted(
    db: SQLite.SQLiteDatabase,
    connectionId: string,
    deletedBy: string,
    deletedAt: string
  ): Promise<void> {
    await db.runAsync(
      `UPDATE wearable_connections
       SET is_active = 0, is_deleted = 1, deleted_at = ?, deleted_by = ?, updated_at = ?
       WHERE id = ?`,
      [deletedAt, deletedBy, deletedAt, connectionId]
    );
  }

  async updateLastSync(
    db: SQLite.SQLiteDatabase,
    connectionId: string,
    lastSync: string
  ): Promise<void> {
    const now = new Date().toISOString();
    await db.runAsync(
      `UPDATE wearable_connections SET last_sync = ?, updated_at = ? WHERE id = ?`,
      [lastSync, now, connectionId]
    );
  }

  async insertVitals(
    db: SQLite.SQLiteDatabase,
    vitals: WearableVitalsInsert
  ): Promise<void> {
    const sql = `
      INSERT INTO wearable_vitals (
        id, user_id, patient_id, provider, heart_rate, blood_pressure_systolic,
        blood_pressure_diastolic, oxygen_saturation, temperature, steps,
        sleep_seconds, activity_calories, recorded_at, synced_to_cloud, version,
        updated_at, updated_by_device, is_deleted, deleted_at, deleted_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const bindings = sanitizeBindings([
      vitals.id,
      vitals.user_id,
      vitals.patient_id,
      vitals.provider,
      vitals.heart_rate,
      vitals.blood_pressure_systolic,
      vitals.blood_pressure_diastolic,
      vitals.oxygen_saturation,
      vitals.temperature,
      vitals.steps,
      vitals.sleep_seconds,
      vitals.activity_calories,
      vitals.recorded_at,
      vitals.synced_to_cloud,
      vitals.version,
      vitals.updated_at,
      vitals.updated_by_device,
      vitals.is_deleted,
      vitals.deleted_at,
      vitals.deleted_by,
    ]);

    await db.runAsync(sql, bindings as SQLite.SQLiteBindValue[]);
  }

  async getVitals(
    db: SQLite.SQLiteDatabase,
    userId: string,
    startDate?: string,
    endDate?: string
  ): Promise<WearableVitals[]> {
    let sql = `SELECT * FROM wearable_vitals WHERE user_id = ? AND is_deleted = 0`;
    const args: (string | number)[] = [userId];

    if (startDate) {
      sql += ` AND recorded_at >= ?`;
      args.push(startDate);
    }

    if (endDate) {
      sql += ` AND recorded_at <= ?`;
      args.push(endDate);
    }

    sql += ` ORDER BY recorded_at DESC`;

    const rows = await db.getAllAsync<Record<string, unknown>>(sql, args);
    return rows.map((row) => this.mapVitalsRow(row));
  }

  async getLatestVitals(
    db: SQLite.SQLiteDatabase,
    userId: string
  ): Promise<WearableVitals | null> {
    const row = await db.getFirstAsync<Record<string, unknown>>(
      `SELECT * FROM wearable_vitals
       WHERE user_id = ? AND is_deleted = 0
       ORDER BY recorded_at DESC
       LIMIT 1`,
      [userId]
    );

    return row ? this.mapVitalsRow(row) : null;
  }

  async getVitalsCount(
    db: SQLite.SQLiteDatabase,
    userId: string,
    provider: string
  ): Promise<number> {
    const result = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM wearable_vitals
       WHERE user_id = ? AND provider = ? AND is_deleted = 0`,
      [userId, provider]
    );

    return result?.count ?? 0;
  }

  private mapConnectionRow(row: Record<string, unknown>): WearableConnection {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      provider: row.provider as WearableConnection['provider'],
      providerDeviceId: row.provider_device_id as string | null,
      accessToken: row.access_token as string | null,
      refreshToken: row.refresh_token as string | null,
      expiresAt: row.expires_at as string | null,
      connectedAt: row.connected_at as string,
      lastSyncAt: row.last_sync as string | null,
      isActive: row.is_active === 1,
      version: row.version as number,
      updatedAt: row.updated_at as string,
      updatedByDevice: row.updated_by_device as string,
      isDeleted: row.is_deleted === 1,
      deletedAt: row.deleted_at as string | null,
      deletedBy: row.deleted_by as string | null,
    };
  }

  private mapVitalsRow(row: Record<string, unknown>): WearableVitals {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      patientId: row.patient_id as string | null,
      provider: row.provider as WearableVitals['provider'],
      heartRate: row.heart_rate as number | null,
      bloodPressureSystolic: row.blood_pressure_systolic as number | null,
      bloodPressureDiastolic: row.blood_pressure_diastolic as number | null,
      oxygenSaturation: row.oxygen_saturation as number | null,
      temperature: row.temperature as number | null,
      steps: row.steps as number | null,
      sleepSeconds: row.sleep_seconds as number | null,
      sleepStages: null,
      activityCalories: row.activity_calories as number | null,
      recordedAt: row.recorded_at as string,
      syncedToCloud: row.synced_to_cloud === 1,
      version: row.version as number,
      updatedAt: row.updated_at as string,
      updatedByDevice: row.updated_by_device as string,
      isDeleted: row.is_deleted === 1,
      deletedAt: row.deleted_at as string | null,
      deletedBy: row.deleted_by as string | null,
    };
  }
}

export const wearableRepository = new WearableRepository();
