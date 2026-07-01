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

const MIGRATIONS: Record<number, ((db: SQLite.SQLiteDatabase) => Promise<void>) | string> = {
  // v4 — Migrate non-UUID patient IDs to UUID format and fix all foreign key references.
  //       Old IDs look like `pat_1778922130541_djtd92q`; Supabase uuid columns reject them.
  4: async (db: SQLite.SQLiteDatabase) => {
    const patients = await db.getAllAsync<{ id: string }>('SELECT id FROM patients');
    const nonUuidPatients = patients.filter((p) => !isUuid(p.id));

    if (nonUuidPatients.length === 0) {
      console.info('[Migration v4] No non-UUID patient IDs found — nothing to migrate.');
      return;
    }

    console.info(`[Migration v4] Migrating ${nonUuidPatients.length} non-UUID patient IDs...`);

    // Tables that hold a patient_id foreign key
    const PATIENT_FK_TABLES = [
      'medications',
      'vitals',
      'vitals_readings',
      'patient_conditions',
      'emergency_contacts',
      'devices',
      'wearables',
      'reminders',
      'notifications',
      'emergency_events',
      'alerts',
      'fall_detection_events',
      'gas_alerts',
      'oxygen_alerts',
      'heart_rate_alerts',
      'respiratory_alerts',
      'mqtt_events',
      'sensor_readings',
      'smart_home_devices',
      'automation_logs',
      'radar_presence_logs',
      'ai_conversations',
      'ai_messages',
      'ai_memory',
      'ai_context',
      'ai_personality',
      'ai_voice_sessions',
      'ai_emotion_logs',
      'ai_reminders',
      'realtime_events',
    ];

    for (const patient of nonUuidPatients) {
      const oldId = patient.id;
      const newId = createRuntimeUuid();
      try {
        await db.execAsync('BEGIN IMMEDIATE TRANSACTION');

        // Update all FK tables first (while old PK still exists)
        for (const table of PATIENT_FK_TABLES) {
          try {
            await db.runAsync(
              `UPDATE ${table} SET patient_id = ? WHERE patient_id = ?`,
              [newId, oldId]
            );
          } catch {
            // Table may not exist yet — safe to skip
          }
        }

        // Now update the patient PK itself
        await db.runAsync(
          'UPDATE patients SET id = ? WHERE id = ?',
          [newId, oldId]
        );

        await db.execAsync('COMMIT');

        // Also patch AsyncStorage if this ID was cached as the active patient
        try {
          const PATIENT_ID_KEY = '@rafiq_patientId';
          const cached = await AsyncStorage.getItem(PATIENT_ID_KEY);
          if (cached === oldId) {
            await AsyncStorage.setItem(PATIENT_ID_KEY, newId);
            console.info(`[Migration v4] Updated AsyncStorage @rafiq_patientId: ${oldId} → ${newId}`);
          }
        } catch {
          // AsyncStorage update failure is non-fatal
        }

        console.info(`[Migration v4] Migrated patient ${oldId} → ${newId}`);
      } catch (err) {
        try { await db.execAsync('ROLLBACK'); } catch { /* ignore */ }
        console.error(`[Migration v4] Failed to migrate patient ${oldId}:`, err);
      }
    }
  },

  // v5 — Add missing soft-delete columns to patients and emergency_contacts.
  //       These are required by BaseRepository (is_deleted, updated_by_device, deleted_by, deleted_at).
  5: async (db: SQLite.SQLiteDatabase) => {
    const patientsAlters = [
      `ALTER TABLE patients ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE patients ADD COLUMN updated_by_device TEXT`,
      `ALTER TABLE patients ADD COLUMN deleted_by TEXT`,
    ];
    const contactsAlters = [
      `ALTER TABLE emergency_contacts ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE emergency_contacts ADD COLUMN updated_by_device TEXT`,
      `ALTER TABLE emergency_contacts ADD COLUMN deleted_by TEXT`,
      `ALTER TABLE emergency_contacts ADD COLUMN deleted_at TEXT`,
    ];
    // Also add to patient_conditions (will be recreated in v6 anyway but ALTER is harmless if exists)
    const conditionsAlters = [
      `ALTER TABLE patient_conditions ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE patient_conditions ADD COLUMN updated_by_device TEXT`,
      `ALTER TABLE patient_conditions ADD COLUMN deleted_by TEXT`,
      `ALTER TABLE patient_conditions ADD COLUMN deleted_at TEXT`,
    ];

    for (const sql of [...patientsAlters, ...contactsAlters, ...conditionsAlters]) {
      try {
        await db.execAsync(sql);
      } catch {
        // Column already exists — safe to ignore "duplicate column" errors
      }
    }
    console.info('[Migration v5] Ensured soft-delete columns exist on patients, emergency_contacts, patient_conditions.');
  },

  // v6 — Recreate patient_conditions with the correct schema expected by PatientConditionRepository.
  //       Old schema had condition_key + custom_note; repository expects condition_name + severity +
  //       diagnosed_date + notes + is_active + soft-delete columns.
  6: async (db: SQLite.SQLiteDatabase) => {
    // Check if the old schema is in place (has condition_key column)
    let hasOldSchema = false;
    try {
      const cols = await db.getAllAsync<{ name: string }>(
        `PRAGMA table_info(patient_conditions)`
      );
      hasOldSchema = cols.some((c) => c.name === 'condition_key');
    } catch {
      // Table may not exist yet — schema CREATE IF NOT EXISTS will handle it
      return;
    }

    if (!hasOldSchema) {
      console.info('[Migration v6] patient_conditions already has correct schema — skipping.');
      return;
    }

    // Rename old table, create new, copy with column mapping, drop old
    await db.execAsync('BEGIN IMMEDIATE TRANSACTION');
    try {
      await db.execAsync('ALTER TABLE patient_conditions RENAME TO patient_conditions_old');

      await db.execAsync(`
        CREATE TABLE patient_conditions (
          id TEXT PRIMARY KEY,
          patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
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

      // Copy data with column rename: condition_key → condition_name, custom_note → notes
      await db.execAsync(`
        INSERT INTO patient_conditions
          (id, patient_id, user_id, condition_name, notes, created_at, updated_at)
        SELECT
          id, patient_id, user_id, condition_key, custom_note, created_at, updated_at
        FROM patient_conditions_old
      `);

      await db.execAsync('DROP TABLE patient_conditions_old');
      await db.execAsync('COMMIT');
      console.info('[Migration v6] Recreated patient_conditions with correct schema.');
    } catch (err) {
      try { await db.execAsync('ROLLBACK'); } catch { /* ignore */ }
      console.error('[Migration v6] Failed to recreate patient_conditions:', err);
      throw err;
    }
  },
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

      const migration = MIGRATIONS[v];
      if (migration) {
        try {
          if (typeof migration === 'function') {
            await migration(db);
          } else {
            await db.execAsync(migration);
          }
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
