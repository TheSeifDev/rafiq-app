import { all, createUuid, first, fromSqliteBool, jsonString, run, sqliteBool } from './db';

export type SyncOperation = 'insert' | 'update' | 'delete' | 'upsert';
export type SyncPriority = 'low' | 'normal' | 'high' | 'critical';

const TABLE_COLUMNS: Record<string, string[]> = {
  profiles: ['id', 'email', 'full_name', 'phone', 'avatar_url', 'role', 'created_at', 'updated_at'],
  patients: ['id', 'legacy_id', 'user_id', 'full_name', 'age', 'gender', 'blood_type', 'phone', 'birth_date', 'height_cm', 'weight_kg', 'medical_history', 'allergies', 'chronic_conditions', 'emergency_notes', 'condition_type', 'risk_level', 'notes', 'relationship', 'address', 'emergency_contact', 'location', 'address_data', 'reporter_data', 'hospital_data', 'latitude', 'longitude', 'geocoded_address', 'device_id', 'version', 'is_deleted', 'updated_by_device', 'deleted_by', 'deleted_at', 'created_at', 'updated_at'],
  patient_conditions: ['id', 'patient_id', 'user_id', 'condition_name', 'severity', 'diagnosed_date', 'notes', 'is_active', 'is_deleted', 'updated_by_device', 'deleted_by', 'deleted_at', 'created_at', 'updated_at'],
  emergency_contacts: ['id', 'legacy_id', 'patient_id', 'user_id', 'name', 'relation', 'relationship', 'phone', 'phone_number', 'email', 'priority', 'is_primary', 'is_deleted', 'updated_by_device', 'deleted_by', 'deleted_at', 'created_at', 'updated_at'],
  devices: ['id', 'legacy_id', 'patient_id', 'user_id', 'device_name', 'name', 'device_type', 'type', 'mac_address', 'ip_address', 'firmware_version', 'status', 'last_seen', 'battery_level', 'signal_strength', 'location', 'mqtt_topic', 'config', 'metadata', 'created_at', 'updated_at'],
  esp32_devices: ['id', 'device_id', 'patient_id', 'user_id', 'chip_id', 'mqtt_client_id', 'board_type', 'firmware_version', 'ip_address', 'last_boot_at', 'last_seen', 'metadata', 'created_at', 'updated_at'],
  wearables: ['id', 'patient_id', 'user_id', 'device_id', 'device_name', 'device_model', 'mac_address', 'ble_uuid', 'paired_at', 'last_sync', 'battery_level', 'firmware_version', 'status', 'config', 'is_primary', 'created_at', 'updated_at'],
  vitals: ['id', 'patient_id', 'user_id', 'heart_rate', 'blood_pressure_systolic', 'blood_pressure_diastolic', 'oxygen_saturation', 'temperature', 'respiratory_rate', 'source', 'device_id', 'recorded_at', 'created_at'],
  vitals_readings: ['id', 'patient_id', 'user_id', 'source', 'heart_rate', 'oxygen_level', 'oxygen_saturation', 'blood_pressure_systolic', 'blood_pressure_diastolic', 'temperature', 'respiratory_rate', 'blood_glucose', 'weight_kg', 'steps', 'steps_count', 'sleep_hours', 'stress_level', 'device_id', 'device_name', 'confidence', 'raw_payload', 'recorded_at', 'created_at'],
  medications: ['id', 'patient_id', 'user_id', 'name', 'dosage', 'strength', 'category', 'reason', 'form', 'frequency', 'schedule_type', 'times', 'time_of_day', 'meal_rule', 'quantity_type', 'total_quantity', 'remaining_quantity', 'refill_threshold', 'duration_days', 'start_date', 'end_date', 'instructions', 'side_effects', 'notes', 'doctor_name', 'active', 'is_active', 'version', 'deleted_at', 'created_at', 'updated_at'],
  medication_logs: ['id', 'medication_id', 'patient_id', 'user_id', 'taken_at', 'scheduled_for', 'skipped', 'skipped_reason', 'note', 'notes', 'source', 'created_at'],
  reminders: ['id', 'legacy_id', 'patient_id', 'user_id', 'title', 'description', 'type', 'time', 'datetime', 'repeat', 'repeat_pattern', 'done', 'completed', 'completed_at', 'is_active', 'source', 'version', 'deleted_at', 'created_at', 'updated_at'],
  notifications: ['id', 'user_id', 'patient_id', 'title', 'body', 'type', 'category', 'severity', 'is_read', 'is_pinned', 'data', 'screen', 'source', 'idempotency_key', 'delivered_at', 'read_at', 'acknowledged_at', 'created_at', 'updated_at'],
  notification_receipts: ['id', 'notification_id', 'user_id', 'device_id', 'channel', 'status', 'attempts', 'last_error', 'scheduled_at', 'delivered_at', 'read_at', 'acknowledged_at', 'created_at', 'updated_at'],
  alerts: ['id', 'legacy_id', 'patient_id', 'user_id', 'emergency_event_id', 'type', 'message', 'severity', 'source', 'is_read', 'resolved', 'data', 'created_at', 'updated_at'],
  emergency_events: ['id', 'legacy_id', 'patient_id', 'user_id', 'type', 'severity', 'status', 'message', 'latitude', 'longitude', 'location_name', 'source', 'source_event_id', 'response_time', 'triggered_at', 'resolved_at', 'resolved', 'notes', 'data', 'created_at', 'updated_at'],
  fall_detection_events: ['id', 'patient_id', 'user_id', 'wearable_id', 'device_id', 'severity', 'confidence', 'latitude', 'longitude', 'location_name', 'emergency_triggered', 'resolved', 'triggered_at', 'resolved_at', 'notes', 'raw_payload', 'created_at'],
  gas_alerts: ['id', 'patient_id', 'user_id', 'device_id', 'level', 'concentration_ppm', 'location', 'triggered_at', 'resolved_at', 'resolved', 'notes', 'raw_payload', 'created_at'],
  oxygen_alerts: ['id', 'patient_id', 'user_id', 'vitals_reading_id', 'oxygen_saturation', 'threshold', 'severity', 'resolved', 'triggered_at', 'resolved_at', 'notes', 'created_at'],
  heart_rate_alerts: ['id', 'patient_id', 'user_id', 'vitals_reading_id', 'heart_rate', 'threshold_low', 'threshold_high', 'severity', 'resolved', 'triggered_at', 'resolved_at', 'notes', 'created_at'],
  respiratory_alerts: ['id', 'patient_id', 'user_id', 'vitals_reading_id', 'respiratory_rate', 'threshold_low', 'threshold_high', 'severity', 'resolved', 'triggered_at', 'resolved_at', 'notes', 'created_at'],
  mqtt_events: ['id', 'patient_id', 'user_id', 'device_id', 'topic', 'qos', 'retain', 'direction', 'payload', 'payload_text', 'received_at', 'created_at'],
  sensor_readings: ['id', 'patient_id', 'user_id', 'device_id', 'sensor_type', 'value', 'unit', 'room', 'raw_payload', 'recorded_at', 'created_at'],
  smart_home_devices: ['id', 'patient_id', 'user_id', 'device_name', 'device_type', 'room', 'mqtt_topic', 'status', 'state', 'config', 'created_at', 'updated_at'],
  smart_home_commands: ['id', 'smart_home_device_id', 'user_id', 'command', 'payload', 'status', 'requested_at', 'sent_at', 'acknowledged_at', 'last_error', 'created_at'],
  automation_logs: ['id', 'patient_id', 'user_id', 'automation_name', 'trigger_type', 'action', 'status', 'data', 'created_at'],
  relay_logs: ['id', 'device_id', 'state', 'source', 'data', 'created_at'],
  radar_presence_logs: ['id', 'device_id', 'patient_id', 'presence', 'distance_cm', 'zone', 'raw_payload', 'recorded_at'],
  ai_conversations: ['id', 'patient_id', 'user_id', 'title', 'summary', 'provider', 'model', 'created_at', 'updated_at'],
  ai_messages: ['id', 'conversation_id', 'patient_id', 'user_id', 'role', 'content', 'reasoning_details', 'model', 'provider', 'tokens_used', 'created_at'],
  ai_memory: ['id', 'patient_id', 'user_id', 'memory_type', 'key', 'value', 'confidence', 'source_message_id', 'expires_at', 'created_at', 'updated_at'],
  ai_context: ['id', 'patient_id', 'user_id', 'context_type', 'data', 'last_built_at', 'created_at', 'updated_at'],
  ai_personality: ['id', 'patient_id', 'user_id', 'language', 'tone', 'preferences', 'created_at', 'updated_at'],
  ai_voice_sessions: ['id', 'patient_id', 'user_id', 'conversation_id', 'started_at', 'ended_at', 'stt_provider', 'tts_provider', 'transcript', 'metadata', 'created_at'],
  ai_emotion_logs: ['id', 'patient_id', 'user_id', 'conversation_id', 'emotion', 'confidence', 'source', 'metadata', 'created_at'],
  ai_reminders: ['id', 'reminder_id', 'conversation_id', 'patient_id', 'user_id', 'instruction', 'created_at'],
};

const JSON_COLUMNS = new Set([
  'address_data', 'reporter_data', 'hospital_data', 'chronic_conditions', 'config', 'metadata',
  'raw_payload', 'times', 'time_of_day', 'data', 'state', 'payload', 'value', 'preferences',
]);

const BOOL_COLUMNS = new Set([
  'is_primary', 'active', 'is_active', 'is_deleted', 'skipped', 'done', 'completed', 'is_read', 'is_pinned',
  'resolved', 'emergency_triggered', 'retain', 'presence',
]);

export function allowedTables(): string[] {
  return Object.keys(TABLE_COLUMNS);
}

export function normalizeForSqlite<T extends Record<string, unknown>>(table: string, row: T): Record<string, unknown> {
  const columns = TABLE_COLUMNS[table];
  if (!columns) throw new Error(`Unsupported local table: ${table}`);

  const normalized: Record<string, unknown> = {};
  for (const key of columns) {
    if (!(key in row)) continue;
    const value = row[key];
    if (JSON_COLUMNS.has(key)) normalized[key] = jsonString(value, key === 'times' || key === 'time_of_day' ? [] : {});
    else if (BOOL_COLUMNS.has(key)) normalized[key] = sqliteBool(value);
    else normalized[key] = value ?? null;
  }
  return normalized;
}

export function normalizeFromSqlite<T extends Record<string, unknown>>(row: T): T {
  const next: Record<string, unknown> = { ...row };
  for (const key of Object.keys(next)) {
    if (JSON_COLUMNS.has(key)) {
      try {
        next[key] = typeof next[key] === 'string' ? JSON.parse(next[key] as string) : next[key];
      } catch {
        next[key] = key === 'times' || key === 'time_of_day' ? [] : {};
      }
    } else if (BOOL_COLUMNS.has(key)) {
      next[key] = fromSqliteBool(next[key]);
    }
  }
  return next as T;
}

export async function upsertLocal<T extends Record<string, unknown>>(
  table: string,
  row: T,
  options: { enqueue?: boolean; userId?: string; priority?: SyncPriority } = {},
): Promise<T & { id: string }> {
  const now = new Date().toISOString();
  const withDefaults = {
    id: (row.id as string | undefined) ?? createUuid(),
    created_at: row.created_at ?? now,
    updated_at: row.updated_at ?? now,
    ...row,
  };
  const normalized = normalizeForSqlite(table, withDefaults);
  const keys = Object.keys(normalized);
  const placeholders = keys.map(() => '?').join(', ');
  const update = keys.filter((key) => key !== 'id').map((key) => `${key} = excluded.${key}`).join(', ');

  await run(
    `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})
     ON CONFLICT(id) DO UPDATE SET ${update}`,
    keys.map((key) => normalized[key] as string | number | boolean | null),
  );

  if (options.enqueue !== false) {
    await enqueueSync({
      tableName: table,
      operation: 'upsert',
      recordId: withDefaults.id as string,
      payload: withDefaults,
      userId: options.userId ?? (withDefaults.user_id as string | undefined),
      priority: options.priority,
    });
  }

  return withDefaults as T & { id: string };
}

export async function updateLocal<T extends Record<string, unknown>>(
  table: string,
  id: string,
  patch: Partial<T>,
  options: { enqueue?: boolean; userId?: string; priority?: SyncPriority } = {},
): Promise<void> {
  const normalized = normalizeForSqlite(table, { ...patch, updated_at: new Date().toISOString() });
  const keys = Object.keys(normalized).filter((key) => key !== 'id');
  if (!keys.length) return;
  await run(
    `UPDATE ${table} SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`,
    [...keys.map((key) => normalized[key] as string | number | boolean | null), id],
  );

  if (options.enqueue !== false) {
    const row = await getById<Record<string, unknown>>(table, id);
    await enqueueSync({
      tableName: table,
      operation: 'update',
      recordId: id,
      payload: row ?? { id, ...patch },
      userId: options.userId ?? (row?.user_id as string | undefined),
      priority: options.priority,
    });
  }
}

export async function deleteLocal(
  table: string,
  id: string,
  options: { enqueue?: boolean; userId?: string; hard?: boolean; priority?: SyncPriority } = {},
): Promise<void> {
  if (options.hard) {
    await run(`DELETE FROM ${table} WHERE id = ?`, [id]);
  } else {
    await run(`UPDATE ${table} SET deleted_at = ?, updated_at = ? WHERE id = ?`, [
      new Date().toISOString(),
      new Date().toISOString(),
      id,
    ]);
  }

  if (options.enqueue !== false) {
    await enqueueSync({
      tableName: table,
      operation: 'delete',
      recordId: id,
      payload: { id },
      userId: options.userId,
      priority: options.priority,
    });
  }
}

export async function getById<T extends Record<string, unknown>>(table: string, id: string): Promise<T | null> {
  const row = await first<T>(`SELECT * FROM ${table} WHERE id = ? LIMIT 1`, [id]);
  return row ? normalizeFromSqlite(row) : null;
}

export async function listWhere<T extends Record<string, unknown>>(
  table: string,
  whereSql = '1=1',
  params: Array<string | number | boolean | null> = [],
  orderSql = 'created_at DESC',
): Promise<T[]> {
  const rows = await all<T>(`SELECT * FROM ${table} WHERE ${whereSql} ORDER BY ${orderSql}`, params);
  return rows.map(normalizeFromSqlite);
}

export async function enqueueSync(params: {
  tableName: string;
  operation: SyncOperation;
  recordId: string;
  payload: Record<string, unknown>;
  userId?: string;
  deviceId?: string;
  priority?: SyncPriority;
}): Promise<string> {
  if (!TABLE_COLUMNS[params.tableName]) throw new Error(`Unsupported sync table: ${params.tableName}`);

  const id = createUuid();
  const idempotencyKey = `${params.tableName}:${params.recordId}:${params.operation}`;
  await run(
    `INSERT INTO pending_sync
      (id, user_id, device_id, table_name, record_id, operation, payload, idempotency_key, priority, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
     ON CONFLICT(user_id, idempotency_key) DO UPDATE SET
       payload = excluded.payload,
       operation = excluded.operation,
       priority = excluded.priority,
       status = 'pending',
       updated_at = excluded.updated_at`,
    [
      id,
      params.userId ?? null,
      params.deviceId ?? null,
      params.tableName,
      params.recordId,
      params.operation,
      jsonString(params.payload),
      idempotencyKey,
      params.priority ?? 'normal',
      new Date().toISOString(),
      new Date().toISOString(),
    ],
  );
  return id;
}

export async function logSync(params: {
  userId?: string;
  deviceId?: string;
  direction: 'push' | 'pull' | 'realtime' | 'repair';
  tableName?: string;
  recordId?: string;
  status: 'started' | 'success' | 'partial' | 'failed';
  pushed?: number;
  pulled?: number;
  failed?: number;
  details?: Record<string, unknown>;
}): Promise<void> {
  await run(
    `INSERT INTO sync_logs
      (id, user_id, device_id, direction, table_name, record_id, status, pushed, pulled, failed, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      createUuid(),
      params.userId ?? null,
      params.deviceId ?? null,
      params.direction,
      params.tableName ?? null,
      params.recordId ?? null,
      params.status,
      params.pushed ?? 0,
      params.pulled ?? 0,
      params.failed ?? 0,
      jsonString(params.details),
      new Date().toISOString(),
    ],
  );
}
