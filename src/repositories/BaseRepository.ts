import { runQuery, runStatement, sanitizeBindings } from '../lib/database';
import { offlineQueue, SyncPriority } from '../lib/offlineQueue';
import { createUuid } from '../utils/uuid';

export interface BaseRecord {
  id: string;
  created_at: string;
  updated_at: string | null;
  version: number;
  updated_by_device: string | null;
  is_deleted: number;
  deleted_at: string | null;
  deleted_by: string | null;
}

export interface EntityRow {
  id: string;
  created_at: string;
  updated_at: string | null;
  version: number;
  updated_by_device: string | null;
  is_deleted: number;
  deleted_at: string | null;
  deleted_by: string | null;
}

function getDeviceId(): string {
  return `device_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export abstract class BaseRepository<
  T extends EntityRow,
  TInsert extends { [key: string]: unknown },
  TUpdate extends { [key: string]: unknown }
> {
  abstract readonly tableName: string;
  abstract readonly insertColumns: readonly string[];
  abstract readonly updateColumns: readonly string[];

  async findById(id: string): Promise<T | null> {
    const rows = await runQuery<T>(
      `SELECT * FROM ${this.tableName} WHERE id = ? AND is_deleted = 0 LIMIT 1`,
      [id]
    );
    return rows[0] ?? null;
  }

  async findAll(
    where?: string,
    params?: (string | number | null)[]
  ): Promise<T[]> {
    const sql = where
      ? `SELECT * FROM ${this.tableName} WHERE is_deleted = 0 AND ${where}`
      : `SELECT * FROM ${this.tableName} WHERE is_deleted = 0`;
    return runQuery<T>(sql, params ?? []);
  }

  async insert(
    payload: TInsert,
    options?: { priority?: SyncPriority; userId?: string }
  ): Promise<T> {
    const id = createUuid();
    const created_at = new Date().toISOString();
    const deviceId = getDeviceId();
    const now = created_at;

    const row: Record<string, unknown> = {
      id,
      created_at,
      updated_at: now,
      version: 1,
      updated_by_device: deviceId,
      is_deleted: 0,
      deleted_at: null,
      deleted_by: null,
    };

    for (const col of this.insertColumns) {
      if (col in payload || Object.prototype.hasOwnProperty.call(payload, col)) {
        const val = payload[col];
        if (val === undefined) {
          row[col] = null;
        } else if (typeof val === 'object' && val !== null) {
          row[col] = JSON.stringify(val);
        } else {
          row[col] = val;
        }
      }
    }

    const columns = this.insertColumns.filter(c => c in row || Object.prototype.hasOwnProperty.call(row, c));
    const allColumns = ['id', 'created_at', 'updated_at', 'version', 'updated_by_device', 'is_deleted', 'deleted_at', 'deleted_by', ...columns];
    const placeholders = allColumns.map(() => '?').join(', ');
    const values = sanitizeBindings(allColumns.map(col => row[col]));

    await runStatement(
      `INSERT INTO ${this.tableName} (${allColumns.join(', ')}) VALUES (${placeholders})`,
      values
    );

    await offlineQueue.enqueue({
      table: this.tableName,
      operation: 'INSERT',
      payload: row,
      recordId: id,
      priority: options?.priority,
      userId: options?.userId,
    });

    return row as unknown as T;
  }

  async update(
    id: string,
    payload: TUpdate,
    options?: { priority?: SyncPriority; userId?: string }
  ): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) throw new Error(`${this.tableName} ${id} not found`);

    const deviceId = getDeviceId();
    const now = new Date().toISOString();
    const newVersion = (existing.version ?? 0) + 1;

    const updatePairs: string[] = [];
    const updateValues: (string | number | null)[] = [];

    for (const col of this.updateColumns) {
      if (col in payload || Object.prototype.hasOwnProperty.call(payload, col)) {
        const val = payload[col as keyof TUpdate];
        updatePairs.push(`${col} = ?`);
        if (val === undefined) {
          updateValues.push(null);
        } else if (typeof val === 'object' && val !== null) {
          updateValues.push(JSON.stringify(val));
        } else {
          updateValues.push(val as string | number | null);
        }
      }
    }

    updatePairs.push('updated_at = ?', 'version = ?', 'updated_by_device = ?');
    updateValues.push(now, newVersion, deviceId, id);

    await runStatement(
      `UPDATE ${this.tableName} SET ${updatePairs.join(', ')} WHERE id = ? AND is_deleted = 0`,
      updateValues
    );

    await offlineQueue.enqueue({
      table: this.tableName,
      operation: 'UPDATE',
      payload: { ...existing, ...payload, updated_at: now, version: newVersion },
      recordId: id,
      priority: options?.priority,
      userId: options?.userId,
    });
  }

  async delete(
    id: string,
    options?: { priority?: SyncPriority; userId?: string }
  ): Promise<void> {
    const deviceId = getDeviceId();
    const now = new Date().toISOString();

    await runStatement(
      `UPDATE ${this.tableName} SET is_deleted = 1, deleted_at = ?, deleted_by = ? WHERE id = ?`,
      [now, deviceId, id]
    );

    await offlineQueue.enqueue({
      table: this.tableName,
      operation: 'DELETE',
      payload: { id, is_deleted: 1, deleted_at: now, deleted_by: deviceId },
      recordId: id,
      priority: options?.priority,
      userId: options?.userId,
    });
  }

  async hardDelete(id: string): Promise<void> {
    await runStatement(`DELETE FROM ${this.tableName} WHERE id = ?`, [id]);
  }
}
