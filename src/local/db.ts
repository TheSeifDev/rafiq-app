import * as SQLite from 'expo-sqlite';
import { RAFIQ_SQLITE_SCHEMA, RAFIQ_SQLITE_SCHEMA_VERSION } from './schema';
import { createUuid as createRuntimeUuid } from '../utils/uuid';

const DB_NAME = 'rafiq-local.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export type SqlValue = string | number | boolean | null | undefined;

export function createUuid(): string {
  return createRuntimeUuid();
}

const MIGRATIONS: Record<number, string> = {
};

async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  const rows = await db.getAllAsync<{ version: number }>(
    'SELECT MAX(version) as version FROM schema_migrations'
  );
  const currentVersion = rows[0]?.version ?? 0;

  if (currentVersion < RAFIQ_SQLITE_SCHEMA_VERSION) {
    console.info(`[SQLite] Migrating from version ${currentVersion} to ${RAFIQ_SQLITE_SCHEMA_VERSION}`);

    for (let v = currentVersion + 1; v <= RAFIQ_SQLITE_SCHEMA_VERSION; v++) {
      if (v === 1) continue;

      const migrationSql = MIGRATIONS[v];
      if (migrationSql) {
        try {
          await db.execAsync(migrationSql);
          console.info(`[SQLite] Applied migration v${v}`);
        } catch (err) {
          console.error(`[SQLite] Migration v${v} failed:`, err);
        }
      }

      try {
        await db.runAsync(
          'INSERT OR REPLACE INTO schema_migrations (version, name, applied_at) VALUES (?, ?, datetime(\'now\'))',
          [v, `migration-v${v}`]
        );
      } catch {
      }
    }
  }
}

export async function getLocalDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME).then(async (db) => {
      await db.execAsync(RAFIQ_SQLITE_SCHEMA);
      await runMigrations(db);
      return db;
    });
  }
  return dbPromise;
}

export async function run(sql: string, params: SqlValue[] = []): Promise<SQLite.SQLiteRunResult> {
  const db = await getLocalDb();
  return db.runAsync(sql, params as SQLite.SQLiteBindValue[]);
}

export async function all<T>(sql: string, params: SqlValue[] = []): Promise<T[]> {
  const db = await getLocalDb();
  return db.getAllAsync<T>(sql, params as SQLite.SQLiteBindValue[]);
}

export async function first<T>(sql: string, params: SqlValue[] = []): Promise<T | null> {
  const db = await getLocalDb();
  const row = await db.getFirstAsync<T>(sql, params as SQLite.SQLiteBindValue[]);
  return row ?? null;
}

export async function transaction<T>(fn: (db: SQLite.SQLiteDatabase) => Promise<T>): Promise<T> {
  const db = await getLocalDb();
  await db.execAsync('BEGIN IMMEDIATE TRANSACTION');
  try {
    const value = await fn(db);
    await db.execAsync('COMMIT');
    return value;
  } catch (err) {
    await db.execAsync('ROLLBACK');
    throw err;
  }
}

export function jsonString(value: unknown, fallback: unknown = {}): string {
  if (value === undefined) return JSON.stringify(fallback);
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value ?? fallback);
  } catch {
    return JSON.stringify(fallback);
  }
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value as T;
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function sqliteBool(value: unknown): number {
  return value === true || value === 1 ? 1 : 0;
}

export function fromSqliteBool(value: unknown): boolean {
  return value === true || value === 1;
}
