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

// ─── FIX #2: Separate PRAGMAs from CREATE TABLE ────────────────────────
// In expo-sqlite v16, PRAGMAs sent via execAsync alongside CREATE TABLE
// statements may not take effect reliably. The fix is to run PRAGMAs
// as separate execAsync calls AFTER the schema.
const SCHEMA_PRAGMAS = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
`;

const SCHEMA_TABLES_AND_INDEXES = RAFIQ_SQLITE_SCHEMA.replace(
  /PRAGMA\s+foreign_keys\s*=\s*ON\s*;?/gi,
  ''
).replace(
  /PRAGMA\s+journal_mode\s*=\s*WAL\s*;?/gi,
  ''
).replace(
  /PRAGMA\s+synchronous\s*=\s*NORMAL\s*;?/gi,
  ''
).trim();

// ─── FIX #3: Run PRAGMA foreign_keys ON separately with WITH validation ───
async function enableForeignKeys(db: SQLite.SQLiteDatabase): Promise<void> {
  try {
    await db.execAsync('PRAGMA foreign_keys = ON;');
    // Verify it took effect
    const rows = await db.getAllAsync<{ foreign_keys: number }>('PRAGMA foreign_keys;');
    if (rows[0]?.foreign_keys !== 1) {
      console.warn('[DB] PRAGMA foreign_keys = ON did not take effect, retrying...');
      await db.execAsync('PRAGMA foreign_keys = ON;');
    }
    console.log('[DB] Foreign keys enabled successfully');
  } catch (err) {
    console.error('[DB] Failed to enable foreign keys (non-fatal, will continue):', err);
    // Non-fatal: the app can still work, FK constraints just won't be enforced
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
      'ai_voice_sessions', 'ai_emotion_logs', 'ai_reminders', 'realtime_events',
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
          } catch {  }
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
          } catch {  }
        }

        console.info(`[Migration v4] Migrated patient ${oldId} → ${newId}`);
      } catch (err) {
        try { await db.execAsync('ROLLBACK'); } catch {  }
        console.error(`[Migration v4] Failed to migrate patient ${oldId}:`, err);
      }
    }
  },

  5: async (db: SQLite.SQLiteDatabase) => {
    const alters = [
      `ALTER TABLE patients ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE patients ADD COLUMN updated_by_device TEXT`,
      `ALTER TABLE patients ADD COLUMN deleted_by TEXT`,
      `ALTER TABLE patients ADD COLUMN deleted_at TEXT`,
      `ALTER TABLE emergency_contacts ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE emergency_contacts ADD COLUMN updated_by_device TEXT`,
      `ALTER TABLE emergency_contacts ADD COLUMN deleted_by TEXT`,
      `ALTER TABLE emergency_contacts ADD COLUMN deleted_at TEXT`,
      `ALTER TABLE patient_conditions ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE patient_conditions ADD COLUMN updated_by_device TEXT`,
      `ALTER TABLE patient_conditions ADD COLUMN deleted_by TEXT`,
      `ALTER TABLE patient_conditions ADD COLUMN deleted_at TEXT`,
    ];
    for (const sql of alters) {
      try { await db.execAsync(sql); } catch {  }
    }
    console.info('[Migration v5] Soft-delete columns ensured.');
  },

  7: async (db: SQLite.SQLiteDatabase) => {
    const alters = [
      `ALTER TABLE patient_conditions ADD COLUMN version INTEGER NOT NULL DEFAULT 1`,
      `ALTER TABLE emergency_contacts ADD COLUMN version INTEGER NOT NULL DEFAULT 1`,
      `ALTER TABLE medications ADD COLUMN version INTEGER NOT NULL DEFAULT 1`,
      `ALTER TABLE medications ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE medications ADD COLUMN updated_by_device TEXT`,
      `ALTER TABLE medications ADD COLUMN deleted_by TEXT`,
    ];
    for (const sql of alters) {
      try { await db.execAsync(sql); } catch {  }
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
          version INTEGER NOT NULL DEFAULT 1,
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
      try { await db.execAsync('ROLLBACK'); } catch {  }
      console.error('[Migration v6] Failed:', err);
      throw err;
    }
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
            try { await db.runAsync(`UPDATE ${t} SET patient_id = ? WHERE patient_id = ?`, [newId, oldId]); } catch {  }
          }
          await db.runAsync('UPDATE patients SET id = ?, legacy_id = ? WHERE id = ?', [newId, oldId, oldId]);
          await db.execAsync('COMMIT');
          for (const key of ['@rafiq_patientId', '@rafiq_userId', 'currentPatientId']) {
            try {
              if ((await AsyncStorage.getItem(key)) === oldId) {
                await AsyncStorage.setItem(key, newId);
              }
            } catch {  }
          }
          console.info(`[DB Boot] Emergency migration: ${oldId} → ${newId}`);
        } catch (err) {
          try { await db.execAsync('ROLLBACK'); } catch {  }
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
    for (const [table, col, def] of colsToEnsure) {
      try { await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`); } catch {  }
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
      } catch {  }
    }
  }
}

// ─── FIX #4: Add write verification ─────────────────────────────────────────
// After DB initialization, do a test write + read to verify the database
// is actually working, not just that it opened successfully.
async function verifyDatabaseReadWrite(db: SQLite.SQLiteDatabase): Promise<boolean> {
  const testId = `__write_test_${Date.now()}`;
  try {
    // Write
    await db.runAsync(
      'INSERT OR REPLACE INTO schema_migrations (version, name, applied_at) VALUES (?, ?, datetime(\'now\'))',
      [99999, testId]
    );
    // Read back
    const rows = await db.getAllAsync<{ name: string }>(
      'SELECT name FROM schema_migrations WHERE name = ?',
      [testId]
    );
    // Cleanup
    await db.runAsync('DELETE FROM schema_migrations WHERE name = ?', [testId]);
    return rows.length > 0;
  } catch (err) {
    console.error('[DB] Write/read verification FAILED:', err);
    return false;
  }
}

export async function getLocalDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME).then(async (db) => {
      try {
        // Step 1: Create tables and indexes (without PRAGMAs)
        await db.execAsync(SCHEMA_TABLES_AND_INDEXES);
        console.log('[DB] Schema (tables + indexes) created/verified');
      } catch (schemaErr) {
        console.error('[DB] FATAL: Schema execution failed:', schemaErr);
        throw schemaErr;
      }

      // Step 2: FIX #2 — Enable PRAGMAs separately for reliability
      try {
        await db.execAsync(SCHEMA_PRAGMAS);
        console.log('[DB] WAL mode + synchronous NORMAL set');
      } catch (pragmaErr) {
        console.warn('[DB] PRAGMA (WAL/synchronous) failed (non-fatal):', pragmaErr);
      }

      // Step 3: Enable foreign keys separately
      await enableForeignKeys(db);

      // Step 4: Run migrations
      await runMigrations(db);

      // Step 5: Boot-time safety checks
      await runBootTimeSafetyChecks(db);

      // Step 6: FIX #4 — Verify database is actually read-write capable
      const verified = await verifyDatabaseReadWrite(db);
      if (!verified) {
        console.error('[DB] WARNING: Database read/write verification failed!');
      } else {
        console.log('[DB] Database initialized successfully — all tables ready + R/W verified');
      }

      return db;
    }).catch((openErr) => {
      console.error('[DB] FATAL: Cannot open database:', openErr);
      // Reset the promise so next call retries
      dbPromise = null;
      throw openErr;
    });
  }
  return dbPromise;
}

export async function run(sql: string, params: SqlValue[] = []): Promise<SQLite.SQLiteRunResult> {
  const db = await getLocalDb();
  try {
    const result = await db.runAsync(sql, params as SQLite.SQLiteBindValue[]);
    if (__DEV__ && result.changes === 0 && sql.trim().startsWith('INSERT')) {
      console.warn('[SQLite] INSERT produced 0 changes — possible constraint violation:', sql.slice(0, 120));
    }
    return result;
  } catch (err) {
    console.error('[SQLite] runAsync FAILED:', err instanceof Error ? err.message : String(err));
    console.error('[SQLite] SQL:', sql.slice(0, 200));
    throw err;
  }
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