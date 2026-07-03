import * as SQLite from 'expo-sqlite';
import { RAFIQ_SQLITE_SCHEMA, RAFIQ_SQLITE_SCHEMA_VERSION } from './schema';
import { createUuid as createRuntimeUuid } from '../utils/uuid';
import { isUuid } from '../utils/uuid';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DB_NAME = 'rafiq-local.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export type SqlValue = string | number | boolean | null | undefined;

export function createUuid(): string {
  return createRuntimeUuid();
}

/**
 * FIX (E2): Check if a column exists on a table before attempting
 * `ALTER TABLE ADD COLUMN`. The migrations v5/v7 and the boot-time safety
 * checks were all blindly running `ALTER TABLE ADD COLUMN` for columns that
 * ALREADY exist in the canonical schema (created by `CREATE TABLE IF NOT
 * EXISTS`), producing noisy "duplicate column name" errors on every startup.
 *
 * This helper queries `PRAGMA table_info` and returns true if the column
 * is already present.
 */
async function columnExists(db: SQLite.SQLiteDatabase, table: string, column: string): Promise<boolean> {
  try {
    const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
    return cols.some((c) => c.name === column);
  } catch {
    return false;
  }
}

/**
 * FIX (E2): Add a column ONLY if it doesn't already exist. Silent no-op
 * if the column is present. Errors are still logged for real failures
 * (e.g. typo in column name).
 */
async function addColumnIfMissing(
  db: SQLite.SQLiteDatabase,
  table: string,
  column: string,
  definition: string
): Promise<void> {
  if (await columnExists(db, table, column)) {
    return; // already present — skip silently
  }
  try {
    await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  } catch (e) {
    // Only log if the column STILL doesn't exist after the attempt —
    // avoids noise when another concurrent process added it.
    if (!(await columnExists(db, table, column))) {
      console.warn(`[db.ts migration] ADD COLUMN ${table}.${column} failed:`, e);
    }
  }
}

const MIGRATIONS: Record<number, ((db: SQLite.SQLiteDatabase) => Promise<void>) | string> = {
  4: async (db: SQLite.SQLiteDatabase) => {
    const patients = await db.getAllAsync<{ id: string }>(
      "SELECT id FROM patients WHERE id NOT GLOB '*-*-*-*-*'"
    );

    if (patients.length === 0) {
      console.info('[Migration v4] No non-UUID patient IDs found — nothing to migrate.');
      return;
    }

    console.info(`[Migration v4] Migrating ${patients.length} non-UUID patient IDs...`);

    const PATIENT_FK_TABLES = [
      'medications', 'vitals', 'vitals_readings', 'patient_conditions',
      'emergency_contacts', 'devices', 'wearables', 'reminders', 'notifications',
      'emergency_events', 'alerts', 'fall_detection_events', 'gas_alerts',
      'oxygen_alerts', 'heart_rate_alerts', 'respiratory_alerts', 'mqtt_events',
      'sensor_readings', 'smart_home_devices', 'automation_logs', 'radar_presence_logs',
      'ai_conversations', 'ai_messages', 'ai_memory', 'ai_context', 'ai_personality',
      'ai_voice_sessions', 'ai_emotion_logs', 'ai_reminders',
    ];

    for (const patient of patients) {
      const oldId = patient.id;
      const newId = createRuntimeUuid();
      try {
        await db.execAsync('BEGIN TRANSACTION');

        for (const table of PATIENT_FK_TABLES) {
          try {
            await db.runAsync(
              `UPDATE ${table} SET patient_id = ? WHERE patient_id = ?`,
              [newId, oldId]
            );
          } catch (e) { console.warn("[db.ts migration]", e); }
        }

        await db.runAsync(
          'UPDATE patients SET id = ?, legacy_id = ? WHERE id = ?',
          [newId, oldId, oldId]
        );

        await db.execAsync('COMMIT');

        for (const key of ['@rafiq_patientId', '@rafiq_userId', 'currentPatientId']) {
          try {
            const cached = await AsyncStorage.getItem(key);
            if (cached === oldId) {
              await AsyncStorage.setItem(key, newId);
              console.info(`[Migration v4] Updated AsyncStorage ${key}: ${oldId} → ${newId}`);
            }
          } catch (e) { console.warn("[db.ts migration]", e); }
        }

        console.info(`[Migration v4] Migrated patient ${oldId} → ${newId}`);
      } catch (err) {
        try { await db.execAsync('ROLLBACK'); } catch (e) { console.warn("[db.ts migration]", e); }
        console.error(`[Migration v4] Failed to migrate patient ${oldId}:`, err);
      }
    }
  },

  5: async (db: SQLite.SQLiteDatabase) => {
    // FIX (E2): Use addColumnIfMissing to avoid "duplicate column name" errors
    // when the canonical schema already created these columns via CREATE TABLE.
    const cols: Array<[string, string, string]> = [
      ['patients', 'is_deleted', 'INTEGER NOT NULL DEFAULT 0'],
      ['patients', 'updated_by_device', 'TEXT'],
      ['patients', 'deleted_by', 'TEXT'],
      ['patients', 'deleted_at', 'TEXT'],
      ['emergency_contacts', 'is_deleted', 'INTEGER NOT NULL DEFAULT 0'],
      ['emergency_contacts', 'updated_by_device', 'TEXT'],
      ['emergency_contacts', 'deleted_by', 'TEXT'],
      ['emergency_contacts', 'deleted_at', 'TEXT'],
      ['patient_conditions', 'is_deleted', 'INTEGER NOT NULL DEFAULT 0'],
      ['patient_conditions', 'updated_by_device', 'TEXT'],
      ['patient_conditions', 'deleted_by', 'TEXT'],
      ['patient_conditions', 'deleted_at', 'TEXT'],
    ];
    for (const [table, col, def] of cols) {
      await addColumnIfMissing(db, table, col, def);
    }
    console.info('[Migration v5] Soft-delete columns ensured.');
  },

  7: async (db: SQLite.SQLiteDatabase) => {
    // FIX (E2): Use addColumnIfMissing to avoid "duplicate column name" errors.
    const cols: Array<[string, string, string]> = [
      ['patient_conditions', 'version', 'INTEGER NOT NULL DEFAULT 1'],
      ['emergency_contacts', 'version', 'INTEGER NOT NULL DEFAULT 1'],
      ['medications', 'version', 'INTEGER NOT NULL DEFAULT 1'],
      ['medications', 'is_deleted', 'INTEGER NOT NULL DEFAULT 0'],
      ['medications', 'updated_by_device', 'TEXT'],
      ['medications', 'deleted_by', 'TEXT'],
    ];
    for (const [table, col, def] of cols) {
      await addColumnIfMissing(db, table, col, def);
    }
    console.info('[Migration v7] version + soft-delete columns ensured on all BaseRepository tables.');
  },

  6: async (db: SQLite.SQLiteDatabase) => {
    let hasOldSchema = false;
    try {
      const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(patient_conditions)`);
      hasOldSchema = cols.some((c) => c.name === 'condition_key');
    } catch { return; }

    if (!hasOldSchema) {
      console.info('[Migration v6] patient_conditions schema is already correct.');
      return;
    }

    await db.execAsync('BEGIN TRANSACTION');
    try {
      await db.execAsync('ALTER TABLE patient_conditions RENAME TO patient_conditions_old');
      await db.execAsync(`
        CREATE TABLE patient_conditions (
          id TEXT PRIMARY KEY,
          patient_id TEXT NOT NULL,
          user_id TEXT,
          condition_name TEXT NOT NULL,
          severity TEXT,
          diagnosed_date TEXT,
          notes TEXT,
          is_active INTEGER NOT NULL DEFAULT 1,
          is_deleted INTEGER NOT NULL DEFAULT 0,
          updated_by_device TEXT,
          deleted_by TEXT,
          deleted_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      await db.execAsync(`
        INSERT INTO patient_conditions (id, patient_id, user_id, condition_name, notes, created_at, updated_at)
        SELECT id, patient_id, user_id, condition_key, custom_note, created_at, updated_at
        FROM patient_conditions_old
      `);
      await db.execAsync('DROP TABLE patient_conditions_old');
      await db.execAsync('COMMIT');
      console.info('[Migration v6] Recreated patient_conditions with correct schema.');
    } catch (err) {
      try { await db.execAsync('ROLLBACK'); } catch (e) { console.warn("[db.ts migration]", e); }
      console.error('[Migration v6] Failed:', err);
      throw err;
    }
  },

  8: async (db: SQLite.SQLiteDatabase) => {
    try {
      await db.execAsync('DROP TABLE IF EXISTS realtime_events');
      console.info('[Migration v8] Dropped realtime_events table (unused).');
    } catch (err) {
      console.warn('[Migration v8] Non-fatal error dropping realtime_events:', err);
    }
  },

  // FIX (E4): v9 migration — add `notes` column to emergency_contacts.
  // The canonical schema now includes it (for fresh installs), but existing
  // installs need an ALTER TABLE to add it. Uses addColumnIfMissing to be
  // idempotent and avoid "duplicate column" errors.
  9: async (db: SQLite.SQLiteDatabase) => {
    await addColumnIfMissing(db, 'emergency_contacts', 'notes', 'TEXT');
    console.info('[Migration v9] emergency_contacts.notes column ensured.');
  },
};

async function runBootTimeSafetyChecks(db: SQLite.SQLiteDatabase): Promise<void> {
  try {
    const oldPatients = await db.getAllAsync<{ id: string }>(
      "SELECT id FROM patients WHERE id NOT GLOB '*-*-*-*-*'"
    );
    if (oldPatients.length > 0) {
      console.warn(`[DB Boot] Found ${oldPatients.length} non-UUID patient IDs — running emergency migration`);
      const PATIENT_FK_TABLES = [
        'medications', 'vitals', 'vitals_readings', 'patient_conditions',
        'emergency_contacts', 'devices', 'wearables', 'reminders', 'notifications',
        'emergency_events', 'alerts', 'ai_conversations', 'ai_messages',
      ];
      for (const patient of oldPatients) {
        const oldId = patient.id;
        const newId = createRuntimeUuid();
        try {
          await db.execAsync('BEGIN TRANSACTION');
          for (const t of PATIENT_FK_TABLES) {
            try { await db.runAsync(`UPDATE ${t} SET patient_id = ? WHERE patient_id = ?`, [newId, oldId]); } catch (e) { console.warn("[db.ts migration]", e); }
          }
          await db.runAsync('UPDATE patients SET id = ?, legacy_id = ? WHERE id = ?', [newId, oldId, oldId]);
          await db.execAsync('COMMIT');
          for (const key of ['@rafiq_patientId', '@rafiq_userId', 'currentPatientId']) {
            try {
              if ((await AsyncStorage.getItem(key)) === oldId) {
                await AsyncStorage.setItem(key, newId);
              }
            } catch (e) { console.warn("[db.ts migration]", e); }
          }
          console.info(`[DB Boot] Emergency migration: ${oldId} → ${newId}`);
        } catch (err) {
          try { await db.execAsync('ROLLBACK'); } catch (e) { console.warn("[db.ts migration]", e); }
          console.error(`[DB Boot] Emergency migration failed for ${oldId}:`, err);
        }
      }
    }

    const colsToEnsure: Array<[string, string, string]> = [
      ['patients', 'is_deleted', 'INTEGER NOT NULL DEFAULT 0'],
      ['patients', 'updated_by_device', 'TEXT'],
      ['patients', 'deleted_by', 'TEXT'],
      ['patients', 'deleted_at', 'TEXT'],
      ['patients', 'legacy_id', 'TEXT'],
      ['patients', 'version', 'INTEGER NOT NULL DEFAULT 1'],
      ['emergency_contacts', 'is_deleted', 'INTEGER NOT NULL DEFAULT 0'],
      ['emergency_contacts', 'updated_by_device', 'TEXT'],
      ['emergency_contacts', 'deleted_by', 'TEXT'],
      ['emergency_contacts', 'deleted_at', 'TEXT'],
      ['emergency_contacts', 'version', 'INTEGER NOT NULL DEFAULT 1'],
      ['emergency_contacts', 'notes', 'TEXT'],
      ['patient_conditions', 'version', 'INTEGER NOT NULL DEFAULT 1'],
      ['patient_conditions', 'is_deleted', 'INTEGER NOT NULL DEFAULT 0'],
      ['patient_conditions', 'updated_by_device', 'TEXT'],
      ['patient_conditions', 'deleted_by', 'TEXT'],
      ['patient_conditions', 'deleted_at', 'TEXT'],
      ['medications', 'version', 'INTEGER NOT NULL DEFAULT 1'],
      ['medications', 'is_deleted', 'INTEGER NOT NULL DEFAULT 0'],
      ['medications', 'updated_by_device', 'TEXT'],
      ['medications', 'deleted_by', 'TEXT'],
    ];
    // FIX (E2): Use addColumnIfMissing to avoid "duplicate column name" errors
    // on every boot — the canonical schema already creates these columns.
    for (const [table, col, def] of colsToEnsure) {
      await addColumnIfMissing(db, table, col, def);
    }
  } catch (err) {
    console.error('[DB Boot] Safety check error (non-fatal):', err);
  }
}

async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const rows = await db.getAllAsync<{ version: number }>(
    'SELECT MAX(version) as version FROM schema_migrations'
  );
  const currentVersion = rows[0]?.version ?? 0;

  if (currentVersion < RAFIQ_SQLITE_SCHEMA_VERSION) {
    console.info(`[SQLite] Migrating from v${currentVersion} → v${RAFIQ_SQLITE_SCHEMA_VERSION}`);

    for (let v = currentVersion + 1; v <= RAFIQ_SQLITE_SCHEMA_VERSION; v++) {
      const migration = MIGRATIONS[v];
      if (migration) {
        try {
          if (typeof migration === 'function') {
            await migration(db);
          } else {
            await db.execAsync(migration);
          }
          console.info(`[SQLite] Migration v${v} applied`);
        } catch (err) {
          console.error(`[SQLite] Migration v${v} failed:`, err);
        }
      }

      try {
        await db.runAsync(
          `INSERT OR REPLACE INTO schema_migrations (version, name, applied_at) VALUES (?, ?, datetime('now'))`,
          [v, `migration-v${v}`]
        );
      } catch (e) { console.warn("[db.ts migration]", e); }
    }
  }
}

export async function getLocalDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME).then(async (db) => {
      await db.execAsync(RAFIQ_SQLITE_SCHEMA);
      await runMigrations(db);
      await runBootTimeSafetyChecks(db);
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
