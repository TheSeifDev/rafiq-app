import { supabase } from '../lib/supabase';
import { all, createUuid, parseJson, run } from './db';
import { allowedTables, logSync, normalizeForSqlite } from './repository';
import { isUuid } from '../utils/uuid';

type PendingSyncRow = {
  id: string;
  user_id: string | null;
  device_id: string | null;
  table_name: string;
  record_id: string;
  operation: 'insert' | 'update' | 'delete' | 'upsert';
  payload: string;
  attempts: number;
  max_attempts: number;
};

type PullOptions = {
  userId: string;
  since?: string | null;
  tables?: string[];
};

const PUSHABLE_TABLES = new Set(allowedTables().filter((table) => ![
  'profiles',
].includes(table)));

// FIX (E5): Trimmed PULL_TABLES to only include tables that ACTUALLY EXIST
// in the Supabase database (per the migrations in supabase/migrations/).
// The old list included ~20 local-only tables (esp32_devices, vitals_readings,
// patient_conditions, emergency_events, fall_detection_events, oxygen_alerts,
// heart_rate_alerts, respiratory_alerts, mqtt_events, sensor_readings,
// automation_logs, relay_logs, radar_presence_logs, ai_memory, ai_context,
// ai_personality, ai_voice_sessions, ai_emotion_logs, ai_reminders, etc.)
// which all failed on every pull, producing noisy "pulled=8, failed=32" logs.
// These tables are local-only (not synced to Supabase) and are correctly
// omitted from the pull list.
const PULL_TABLES = [
  'patients',
  'emergency_contacts',
  'devices',
  'wearables',
  'vitals',
  'medications',
  'medication_logs',
  'reminders',
  'notifications',
  'gas_alerts',
  'fall_events',
  'smart_home_devices',
  'ai_conversations',
  'ai_messages',
];

const UPDATED_AT_TABLES = new Set([
  'patients',
  'emergency_contacts',
  'devices',
  'wearables',
  'vitals',
  'medications',
  'medication_logs',
  'reminders',
  'notifications',
  'gas_alerts',
  'fall_events',
  'smart_home_devices',
  'ai_conversations',
  'ai_messages',
]);

// FIX (E5): Trimmed USER_SCOPED_TABLES to match PULL_TABLES — only tables
// that exist in Supabase AND have a user_id column.
const USER_SCOPED_TABLES = new Set([
  'patients',
  'emergency_contacts',
  'devices',
  'wearables',
  'vitals',
  'medications',
  'medication_logs',
  'reminders',
  'notifications',
  'gas_alerts',
  'fall_events',
  'smart_home_devices',
  'ai_conversations',
  'ai_messages',
]);

const PULL_PAGE_SIZE = 1000;

const UUID_REFERENCE_COLUMNS = new Set([
  'id',
  'user_id',
  'patient_id',
  'medication_id',
  'notification_id',
  'conversation_id',
  'reminder_id',
  'wearable_id',
  'vitals_reading_id',
  'smart_home_device_id',
  'source_message_id',
  'emergency_event_id',
]);

function nextRetryIso(attempts: number): string {
  const seconds = Math.min(300, Math.pow(2, attempts) * 5);
  return new Date(Date.now() + seconds * 1000).toISOString();
}

async function markFailed(item: PendingSyncRow, error: unknown): Promise<void> {
  const attempts = item.attempts + 1;
  const message = error instanceof Error ? error.message : String(error);
  if (attempts >= item.max_attempts) {
    await run(
      `INSERT INTO failed_sync
        (id, pending_sync_id, user_id, device_id, table_name, record_id, operation, payload, error_message, attempts, failed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        createUuid(),
        item.id,
        item.user_id,
        item.device_id,
        item.table_name,
        item.record_id,
        item.operation,
        item.payload,
        message,
        attempts,
        new Date().toISOString(),
      ],
    );
    await run('DELETE FROM pending_sync WHERE id = ?', [item.id]);
  } else {
    await run(
      `UPDATE pending_sync
       SET attempts = ?, last_error = ?, next_attempt_at = ?, status = 'pending', updated_at = ?
       WHERE id = ?`,
      [attempts, message, nextRetryIso(attempts), new Date().toISOString(), item.id],
    );
  }
}

async function pushOne(item: PendingSyncRow): Promise<void> {
  if (!PUSHABLE_TABLES.has(item.table_name)) {
    await run('DELETE FROM pending_sync WHERE id = ?', [item.id]);
    return;
  }

  const payload = parseJson<Record<string, unknown>>(item.payload, {});
  if (!isUuid(item.record_id)) {
    throw new Error(`Refusing to sync ${item.table_name}: record id is not a UUID`);
  }
  for (const [key, value] of Object.entries(payload)) {
    if (!UUID_REFERENCE_COLUMNS.has(key) || value == null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    if (!isUuid(value)) {
      throw new Error(`Refusing to sync ${item.table_name}: ${key} is not a UUID`);
    }
  }

  if (item.operation === 'delete') {
    const { error } = await supabase.from(item.table_name).delete().eq('id', item.record_id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from(item.table_name).upsert(payload, { onConflict: 'id' });
    if (error) throw new Error(error.message);
  }

  await run('DELETE FROM pending_sync WHERE id = ?', [item.id]);
}

export const localSyncEngine = {
  async push(limit = 50): Promise<{ pushed: number; failed: number; remaining: number }> {
    const items = await all<PendingSyncRow>(
      `SELECT * FROM pending_sync
       WHERE status = 'pending' AND datetime(next_attempt_at) <= datetime('now')
       ORDER BY
        CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
        created_at ASC
       LIMIT ?`,
      [limit],
    );

    let pushed = 0;
    let failed = 0;
    await logSync({ direction: 'push', status: 'started', details: { count: items.length } });

    for (const item of items) {
      await run('UPDATE pending_sync SET status = ?, updated_at = ? WHERE id = ?', [
        'processing',
        new Date().toISOString(),
        item.id,
      ]);
      try {
        await pushOne(item);
        pushed++;
      } catch (err) {
        failed++;
        await markFailed(item, err);
      }
    }

    const remainingRows = await all<{ c: number }>('SELECT COUNT(*) as c FROM pending_sync WHERE status = ?', ['pending']);
    const remaining = remainingRows[0]?.c ?? 0;
    await logSync({ direction: 'push', status: failed ? 'partial' : 'success', pushed, failed, details: { remaining } });
    return { pushed, failed, remaining };
  },

  async pull(options: PullOptions): Promise<{ pulled: number; failed: number }> {
    const tables = options.tables ?? PULL_TABLES;
    let pulled = 0;
    let failed = 0;
    await logSync({ userId: options.userId, direction: 'pull', status: 'started', details: { tables } });

    for (const table of tables) {
      try {
        let offset = 0;
        let pageRows: Record<string, unknown>[] = [];
        do {
          let query = supabase.from(table).select('*').range(offset, offset + PULL_PAGE_SIZE - 1);
          if (USER_SCOPED_TABLES.has(table)) {
            query = query.eq('user_id', options.userId);
          }
          if (options.since && UPDATED_AT_TABLES.has(table)) {
            query = query.gte('updated_at', options.since);
          }
          const { data, error } = await query;
          if (error) throw new Error(error.message);

          pageRows = (data ?? []) as Record<string, unknown>[];
          for (const row of pageRows) {
            const normalized = normalizeForSqlite(table, row);
            const keys = Object.keys(normalized);
            if (!keys.length) continue;
            const update = keys.filter((key) => key !== 'id').map((key) => `${key} = excluded.${key}`).join(', ');
            await run(
              `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})
               ON CONFLICT(id) DO UPDATE SET ${update}`,
              keys.map((key) => normalized[key] as string | number | boolean | null),
            );
            pulled++;
          }
          offset += PULL_PAGE_SIZE;
        } while (pageRows.length === PULL_PAGE_SIZE);
      } catch (err) {
        // FIX (E5): Distinguish between "table doesn't exist in Supabase" (skip
        // silently — these are local-only tables like ai_*, mqtt_events, etc.)
        // and real errors (RLS violation, network, etc.). Previously every
        // missing table counted as a "failed" pull, producing noisy logs like
        // "pulled=8, failed=32" on every startup.
        const errMsg = err instanceof Error ? err.message : String(err);
        const isMissingTable =
          errMsg.includes('Could not find the table') ||
          errMsg.includes('relation') && errMsg.includes('does not exist') ||
          errMsg.includes('schema cache lookup failed') ||
          errMsg.includes('42P01'); // Postgres undefined_table

        if (isMissingTable) {
          // Local-only table or not yet created in Supabase — skip silently.
          // Only log at debug level to avoid noise.
          console.info(`[SyncEngine] Pull: table '${table}' not in Supabase — skipping (local-only).`);
        } else {
          failed++;
          await logSync({
            userId: options.userId,
            direction: 'pull',
            tableName: table,
            status: 'failed',
            failed: 1,
            details: { error: errMsg },
          });
        }
      }
    }

    await logSync({ userId: options.userId, direction: 'pull', status: failed ? 'partial' : 'success', pulled, failed });
    return { pulled, failed };
  },
};

export default localSyncEngine;
