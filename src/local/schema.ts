export const RAFIQ_SQLITE_SCHEMA_VERSION = 8;

export const RAFIQ_SQLITE_SCHEMA = `
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  full_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY,
  legacy_id TEXT UNIQUE,
  user_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  age INTEGER,
  gender TEXT,
  blood_type TEXT,
  phone TEXT,
  birth_date TEXT,
  height_cm INTEGER,
  weight_kg REAL,
  medical_history TEXT,
  allergies TEXT,
  chronic_conditions TEXT,
  emergency_notes TEXT,
  condition_type TEXT,
  risk_level TEXT,
  notes TEXT,
  relationship TEXT DEFAULT 'self',
  address TEXT,
  emergency_contact TEXT,
  location TEXT,
  address_data TEXT NOT NULL DEFAULT '{}',
  reporter_data TEXT NOT NULL DEFAULT '{}',
  hospital_data TEXT NOT NULL DEFAULT '{}',
  latitude REAL,
  longitude REAL,
  geocoded_address TEXT,
  device_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  updated_by_device TEXT,
  deleted_by TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS patient_conditions (
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
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS emergency_contacts (
  id TEXT PRIMARY KEY,
  legacy_id TEXT UNIQUE,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  user_id TEXT,
  name TEXT NOT NULL,
  relation TEXT,
  relationship TEXT,
  phone TEXT NOT NULL,
  phone_number TEXT,
  email TEXT,
  priority INTEGER NOT NULL DEFAULT 1,
  is_primary INTEGER NOT NULL DEFAULT 0,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  updated_by_device TEXT,
  deleted_by TEXT,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  legacy_id TEXT UNIQUE,
  patient_id TEXT REFERENCES patients(id) ON DELETE SET NULL,
  user_id TEXT,
  device_name TEXT NOT NULL,
  name TEXT,
  device_type TEXT NOT NULL DEFAULT 'other',
  type TEXT,
  mac_address TEXT,
  ip_address TEXT,
  firmware_version TEXT,
  status TEXT NOT NULL DEFAULT 'offline',
  last_seen TEXT,
  battery_level INTEGER,
  signal_strength INTEGER,
  location TEXT,
  mqtt_topic TEXT,
  config TEXT NOT NULL DEFAULT '{}',
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS esp32_devices (
  id TEXT PRIMARY KEY,
  device_id TEXT REFERENCES devices(id) ON DELETE CASCADE,
  patient_id TEXT REFERENCES patients(id) ON DELETE SET NULL,
  user_id TEXT,
  chip_id TEXT UNIQUE,
  mqtt_client_id TEXT,
  board_type TEXT DEFAULT 'esp32',
  firmware_version TEXT,
  ip_address TEXT,
  last_boot_at TEXT,
  last_seen TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS wearables (
  id TEXT PRIMARY KEY,
  patient_id TEXT REFERENCES patients(id) ON DELETE CASCADE,
  user_id TEXT,
  device_id TEXT REFERENCES devices(id) ON DELETE SET NULL,
  device_name TEXT NOT NULL,
  device_model TEXT,
  mac_address TEXT,
  ble_uuid TEXT,
  paired_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_sync TEXT,
  battery_level INTEGER,
  firmware_version TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected',
  config TEXT NOT NULL DEFAULT '{}',
  is_primary INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vitals_readings (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  user_id TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  heart_rate INTEGER,
  oxygen_level REAL,
  oxygen_saturation REAL,
  blood_pressure_systolic INTEGER,
  blood_pressure_diastolic INTEGER,
  temperature REAL,
  respiratory_rate INTEGER,
  blood_glucose REAL,
  weight_kg REAL,
  steps INTEGER,
  steps_count INTEGER,
  sleep_hours REAL,
  stress_level INTEGER,
  device_id TEXT REFERENCES devices(id) ON DELETE SET NULL,
  device_name TEXT,
  confidence REAL,
  raw_payload TEXT NOT NULL DEFAULT '{}',
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vitals (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  user_id TEXT,
  heart_rate INTEGER,
  blood_pressure_systolic INTEGER,
  blood_pressure_diastolic INTEGER,
  oxygen_saturation REAL,
  temperature REAL,
  respiratory_rate INTEGER,
  source TEXT NOT NULL DEFAULT 'manual',
  device_id TEXT REFERENCES devices(id) ON DELETE SET NULL,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS medications (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  user_id TEXT,
  name TEXT NOT NULL,
  dosage TEXT,
  strength TEXT,
  category TEXT,
  reason TEXT,
  form TEXT,
  frequency TEXT,
  schedule_type TEXT,
  times TEXT NOT NULL DEFAULT '[]',
  time_of_day TEXT NOT NULL DEFAULT '[]',
  meal_rule TEXT,
  quantity_type TEXT,
  total_quantity REAL,
  remaining_quantity REAL,
  refill_threshold REAL,
  duration_days INTEGER,
  start_date TEXT,
  end_date TEXT,
  instructions TEXT,
  side_effects TEXT,
  notes TEXT,
  doctor_name TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  updated_by_device TEXT,
  deleted_by TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS medication_logs (
  id TEXT PRIMARY KEY,
  medication_id TEXT NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  patient_id TEXT REFERENCES patients(id) ON DELETE CASCADE,
  user_id TEXT,
  taken_at TEXT NOT NULL DEFAULT (datetime('now')),
  scheduled_for TEXT,
  skipped INTEGER NOT NULL DEFAULT 0,
  skipped_reason TEXT,
  note TEXT,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  legacy_id TEXT UNIQUE,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  user_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'general',
  time TEXT,
  datetime TEXT,
  repeat TEXT DEFAULT 'none',
  repeat_pattern TEXT,
  done INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'local',
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  patient_id TEXT REFERENCES patients(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT,
  category TEXT NOT NULL DEFAULT 'system',
  severity TEXT NOT NULL DEFAULT 'medium',
  is_read INTEGER NOT NULL DEFAULT 0,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL DEFAULT '{}',
  screen TEXT,
  source TEXT NOT NULL DEFAULT 'local',
  idempotency_key TEXT,
  delivered_at TEXT,
  read_at TEXT,
  acknowledged_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS notification_receipts (
  id TEXT PRIMARY KEY,
  notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  device_id TEXT,
  channel TEXT NOT NULL DEFAULT 'local',
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  scheduled_at TEXT,
  delivered_at TEXT,
  read_at TEXT,
  acknowledged_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS emergency_events (
  id TEXT PRIMARY KEY,
  legacy_id TEXT UNIQUE,
  patient_id TEXT REFERENCES patients(id) ON DELETE SET NULL,
  user_id TEXT,
  type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'high',
  status TEXT NOT NULL DEFAULT 'active',
  message TEXT,
  latitude REAL,
  longitude REAL,
  location_name TEXT,
  source TEXT NOT NULL DEFAULT 'system',
  source_event_id TEXT,
  response_time INTEGER,
  triggered_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  resolved INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  legacy_id TEXT UNIQUE,
  patient_id TEXT REFERENCES patients(id) ON DELETE SET NULL,
  user_id TEXT,
  emergency_event_id TEXT REFERENCES emergency_events(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'general',
  message TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  source TEXT,
  is_read INTEGER NOT NULL DEFAULT 0,
  resolved INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fall_detection_events (
  id TEXT PRIMARY KEY,
  patient_id TEXT REFERENCES patients(id) ON DELETE SET NULL,
  user_id TEXT,
  wearable_id TEXT REFERENCES wearables(id) ON DELETE SET NULL,
  device_id TEXT REFERENCES devices(id) ON DELETE SET NULL,
  severity TEXT NOT NULL DEFAULT 'high',
  confidence REAL,
  latitude REAL,
  longitude REAL,
  location_name TEXT,
  emergency_triggered INTEGER NOT NULL DEFAULT 0,
  resolved INTEGER NOT NULL DEFAULT 0,
  triggered_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  notes TEXT,
  raw_payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gas_alerts (
  id TEXT PRIMARY KEY,
  patient_id TEXT REFERENCES patients(id) ON DELETE SET NULL,
  user_id TEXT,
  device_id TEXT REFERENCES devices(id) ON DELETE SET NULL,
  level TEXT NOT NULL,
  concentration_ppm INTEGER,
  location TEXT,
  triggered_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  resolved INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  raw_payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS oxygen_alerts (
  id TEXT PRIMARY KEY,
  patient_id TEXT REFERENCES patients(id) ON DELETE CASCADE,
  user_id TEXT,
  vital_reading_id TEXT REFERENCES vitals_readings(id) ON DELETE SET NULL,
  oxygen_saturation REAL NOT NULL,
  threshold REAL NOT NULL DEFAULT 94,
  severity TEXT NOT NULL DEFAULT 'high',
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS heart_rate_alerts (
  id TEXT PRIMARY KEY,
  patient_id TEXT REFERENCES patients(id) ON DELETE CASCADE,
  user_id TEXT,
  vital_reading_id TEXT REFERENCES vitals_readings(id) ON DELETE SET NULL,
  heart_rate INTEGER NOT NULL,
  threshold_low INTEGER,
  threshold_high INTEGER,
  severity TEXT NOT NULL DEFAULT 'medium',
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS respiratory_alerts (
  id TEXT PRIMARY KEY,
  patient_id TEXT REFERENCES patients(id) ON DELETE CASCADE,
  user_id TEXT,
  vital_reading_id TEXT REFERENCES vitals_readings(id) ON DELETE SET NULL,
  respiratory_rate INTEGER NOT NULL,
  threshold_low INTEGER,
  threshold_high INTEGER,
  severity TEXT NOT NULL DEFAULT 'medium',
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mqtt_events (
  id TEXT PRIMARY KEY,
  patient_id TEXT REFERENCES patients(id) ON DELETE SET NULL,
  user_id TEXT,
  device_id TEXT REFERENCES devices(id) ON DELETE SET NULL,
  topic TEXT NOT NULL,
  qos INTEGER DEFAULT 0,
  retain INTEGER DEFAULT 0,
  direction TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  payload_text TEXT,
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sensor_readings (
  id TEXT PRIMARY KEY,
  patient_id TEXT REFERENCES patients(id) ON DELETE SET NULL,
  user_id TEXT,
  device_id TEXT REFERENCES devices(id) ON DELETE SET NULL,
  sensor_type TEXT NOT NULL,
  value REAL,
  unit TEXT,
  room TEXT,
  raw_payload TEXT NOT NULL DEFAULT '{}',
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS smart_home_devices (
  id TEXT PRIMARY KEY,
  patient_id TEXT REFERENCES patients(id) ON DELETE SET NULL,
  user_id TEXT,
  device_name TEXT NOT NULL,
  device_type TEXT NOT NULL DEFAULT 'other',
  room TEXT,
  mqtt_topic TEXT,
  status TEXT NOT NULL DEFAULT 'off',
  state TEXT NOT NULL DEFAULT '{}',
  config TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS smart_home_commands (
  id TEXT PRIMARY KEY,
  smart_home_device_id TEXT REFERENCES smart_home_devices(id) ON DELETE SET NULL,
  user_id TEXT,
  command TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT,
  acknowledged_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS automation_logs (
  id TEXT PRIMARY KEY,
  patient_id TEXT REFERENCES patients(id) ON DELETE SET NULL,
  user_id TEXT,
  automation_name TEXT,
  trigger_type TEXT,
  action TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS relay_logs (
  id TEXT PRIMARY KEY,
  device_id TEXT REFERENCES devices(id) ON DELETE SET NULL,
  state TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'mqtt',
  data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS radar_presence_logs (
  id TEXT PRIMARY KEY,
  device_id TEXT REFERENCES devices(id) ON DELETE SET NULL,
  patient_id TEXT REFERENCES patients(id) ON DELETE SET NULL,
  presence INTEGER NOT NULL,
  distance_cm REAL,
  zone TEXT,
  raw_payload TEXT NOT NULL DEFAULT '{}',
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_conversations (
  id TEXT PRIMARY KEY,
  patient_id TEXT REFERENCES patients(id) ON DELETE CASCADE,
  user_id TEXT,
  title TEXT,
  summary TEXT,
  provider TEXT,
  model TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT REFERENCES ai_conversations(id) ON DELETE CASCADE,
  patient_id TEXT REFERENCES patients(id) ON DELETE CASCADE,
  user_id TEXT,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  reasoning_details TEXT,
  model TEXT,
  provider TEXT,
  tokens_used INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_memory (
  id TEXT PRIMARY KEY,
  patient_id TEXT REFERENCES patients(id) ON DELETE CASCADE,
  user_id TEXT,
  memory_type TEXT NOT NULL DEFAULT 'general',
  key TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '{}',
  confidence REAL,
  source_message_id TEXT REFERENCES ai_messages(id) ON DELETE SET NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(patient_id, memory_type, key)
);

CREATE TABLE IF NOT EXISTS ai_context (
  id TEXT PRIMARY KEY,
  patient_id TEXT REFERENCES patients(id) ON DELETE CASCADE,
  user_id TEXT,
  context_type TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  last_built_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_personality (
  id TEXT PRIMARY KEY,
  patient_id TEXT REFERENCES patients(id) ON DELETE CASCADE,
  user_id TEXT,
  language TEXT NOT NULL DEFAULT 'ar',
  tone TEXT NOT NULL DEFAULT 'warm',
  preferences TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_voice_sessions (
  id TEXT PRIMARY KEY,
  patient_id TEXT REFERENCES patients(id) ON DELETE SET NULL,
  user_id TEXT,
  conversation_id TEXT REFERENCES ai_conversations(id) ON DELETE SET NULL,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT,
  stt_provider TEXT,
  tts_provider TEXT,
  transcript TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_emotion_logs (
  id TEXT PRIMARY KEY,
  patient_id TEXT REFERENCES patients(id) ON DELETE SET NULL,
  user_id TEXT,
  conversation_id TEXT REFERENCES ai_conversations(id) ON DELETE SET NULL,
  emotion TEXT NOT NULL,
  confidence REAL,
  source TEXT NOT NULL DEFAULT 'ai',
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_reminders (
  id TEXT PRIMARY KEY,
  reminder_id TEXT REFERENCES reminders(id) ON DELETE CASCADE,
  conversation_id TEXT REFERENCES ai_conversations(id) ON DELETE SET NULL,
  patient_id TEXT REFERENCES patients(id) ON DELETE CASCADE,
  user_id TEXT,
  instruction TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pending_sync (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  device_id TEXT,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  idempotency_key TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  next_attempt_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_error TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS failed_sync (
  id TEXT PRIMARY KEY,
  pending_sync_id TEXT,
  user_id TEXT,
  device_id TEXT,
  table_name TEXT NOT NULL,
  record_id TEXT,
  operation TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  error_code TEXT,
  error_message TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  failed_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  resolution TEXT
);

CREATE TABLE IF NOT EXISTS sync_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  device_id TEXT,
  direction TEXT NOT NULL,
  table_name TEXT,
  record_id TEXT,
  status TEXT NOT NULL,
  pushed INTEGER NOT NULL DEFAULT 0,
  pulled INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  details TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- FIX (P3-3): realtime_events table removed — no consumer ever read from it.
-- A v8 migration in db.ts drops it if it already exists from a prior install.

CREATE INDEX IF NOT EXISTS idx_patients_user_id ON patients(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_patient_priority ON emergency_contacts(patient_id, priority);
CREATE INDEX IF NOT EXISTS idx_devices_patient_status ON devices(patient_id, status, last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_vitals_readings_patient_time ON vitals_readings(patient_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_medications_patient_active ON medications(patient_id, active, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_medication_logs_medication_time ON medication_logs(medication_id, taken_at DESC);
CREATE INDEX IF NOT EXISTS idx_reminders_patient_active_time ON reminders(patient_id, is_active, COALESCE(datetime, time));
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_alerts_patient_time ON alerts(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_emergency_events_patient_time ON emergency_events(patient_id, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_mqtt_events_topic_time ON mqtt_events(topic, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_sensor_readings_device_time ON sensor_readings(device_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_time ON ai_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pending_sync_ready ON pending_sync(status, next_attempt_at, priority);

INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (${RAFIQ_SQLITE_SCHEMA_VERSION}, 'unified-offline-schema');`;
