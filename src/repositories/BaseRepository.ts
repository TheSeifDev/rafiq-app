import { runQuery } from '../lib/database';
import { upsertLocal, updateLocal, deleteLocal, type SyncPriority } from '../local/repository';
import { createUuid } from '../utils/uuid';

export interface BaseRecord {
  id: string;
  created_at: string;
  updated_at: string | null;
}

export interface EntityRow {
  id: string;
  created_at: string;
  updated_at: string | null;
  [key: string]: unknown;
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
      `SELECT * FROM ${this.tableName} WHERE id = ? LIMIT 1`,
      [id]
    );
    return rows[0] ?? null;
  }

  async findAll(
    where?: string,
    params?: (string | number | null)[]
  ): Promise<T[]> {
    const sql = where
      ? `SELECT * FROM ${this.tableName} WHERE ${where}`
      : `SELECT * FROM ${this.tableName}`;
    return runQuery<T>(sql, params ?? []);
  }

  async insert(
    payload: TInsert,
    options?: { priority?: SyncPriority; userId?: string }
  ): Promise<T> {
    const id = createUuid();
    const row = { id, ...payload } as Record<string, unknown>;
    await upsertLocal(this.tableName, row, {
      userId: options?.userId,
      priority: options?.priority ?? 'normal',
    });
    return row as unknown as T;
  }

  async update(
    id: string,
    payload: TUpdate,
    options?: { priority?: SyncPriority; userId?: string }
  ): Promise<void> {
    await updateLocal(this.tableName, id, payload as Record<string, unknown>, {
      userId: options?.userId,
      priority: options?.priority ?? 'normal',
    });
  }

  async delete(
    id: string,
    options?: { priority?: SyncPriority; userId?: string; hard?: boolean }
  ): Promise<void> {
    await deleteLocal(this.tableName, id, {
      userId: options?.userId,
      priority: options?.priority ?? 'normal',
      hard: options?.hard ?? false,
    });
  }

  async hardDelete(id: string): Promise<void> {
    await deleteLocal(this.tableName, id, { hard: true });
  }
}
