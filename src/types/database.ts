export interface AddressData {
  governorate?: string;
  district?: string;
  street?: string;
  building_number?: string;
  apartment_number?: string;
  floor?: string;
  apartment_side?: 'right' | 'left' | '';
  landmark?: string;
  extra_notes?: string;
}

export interface ReporterData {
  name?: string;
  relationship?: string;
  phone?: string;
  is_primary_contact?: boolean;
}

export interface HospitalData {
  name?: string;
  address?: string;
  phone?: string;
  has_medical_file?: boolean;
  file_number?: string;
}

export interface Patient {
  id: string;
  user_id: string;
  full_name: string;
  age: number | null;
  gender: string | null;
  blood_type: string | null;
  phone: string | null;
  birth_date: string | null;
  condition_type: string | null;
  risk_level: string | null;
  notes: string | null;
  relationship: string | null;
  address_data: AddressData;
  reporter_data: ReporterData;
  hospital_data: HospitalData;
  latitude: number | null;
  longitude: number | null;
  geocoded_address: string | null;
  address?: string | null;
  emergency_contact?: string | null;
  location?: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface EmergencyContact {
  id: string;
  patient_id: string;
  name: string;
  relation: string;
  phone: string;
  priority: number;
  is_primary: number;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
  version?: number;
  updated_by_device?: string | null;
  is_deleted?: number;
  deleted_at?: string | null;
  deleted_by?: string | null;
}

export interface EmergencyContactInsert {
  patient_id: string;
  name: string;
  relation: string;
  phone: string;
  priority?: number;
  is_primary?: boolean;
  notes?: string | null;
  [key: string]: unknown;
}

export interface PatientCondition {
  id: string;
  patient_id: string;
  condition_name: string;
  severity: string | null;
  diagnosed_date: string | null;
  notes: string | null;
  is_active: number;
  created_at: string;
  updated_at: string | null;
  version: number;
  updated_by_device: string | null;
  is_deleted: number;
  deleted_at: string | null;
  deleted_by: string | null;
}

export interface PatientConditionInsert {
  patient_id: string;
  condition_name: string;
  severity?: string;
  diagnosed_date?: string | null;
  notes?: string | null;
  is_active?: boolean;
  [key: string]: unknown;
}

export interface PatientHealth {
  id: string;
  patient_id: string;
  heart_rate: number;
  oxygen_level: number | null;
  blood_pressure: string | null;
  temperature: number | null;
  created_at: string;
}

export interface VitalRecord {
  id: string;
  user_id: string;
  heart_rate: number;
  oxygen_level: number | null;
  blood_pressure_systolic: number | null;
  blood_pressure_diastolic: number | null;
  created_at: string;
}

export type VitalsReadingSource = 'manual' | 'smartwatch' | 'ble';

export interface VitalsReading {
  id: string;
  patient_id: string;
  source: VitalsReadingSource;
  heart_rate: number | null;
  oxygen_level: number | null;
  blood_pressure_systolic: number | null;
  blood_pressure_diastolic: number | null;
  temperature: number | null;
  steps: number | null;
  device_name: string | null;
  device_id: string | null;
  recorded_at: string;
  created_at: string;
}

export interface VitalsReadingInsert {
  patient_id: string;
  source: VitalsReadingSource;
  heart_rate?: number | null;
  oxygen_level?: number | null;
  blood_pressure_systolic?: number | null;
  blood_pressure_diastolic?: number | null;
  temperature?: number | null;
  steps?: number | null;
  device_name?: string | null;
  device_id?: string | null;
  recorded_at?: string;
}

export interface Medication {
  id: string;
  patient_id: string;
  name: string;
  dosage: string;
  frequency: string;
  time_of_day: string[];
  start_date: string | null;
  end_date: string | null;
  instructions: string | null;
  is_active: boolean;

  strength: string | null;
  category: string | null;
  reason: string | null;
  form: string | null;
  schedule_type: string | null;
  times: unknown;
  meal_rule: string | null;
  quantity_type: string | null;
  total_quantity: number | null;
  remaining_quantity: number | null;
  refill_threshold: number | null;
  notes: string | null;
  doctor_name: string | null;
  active: boolean;
  created_at: string;
  updated_at: string | null;
}

export interface MedicationInsert {
  patient_id: string;
  name: string;
  dosage: string;
  frequency: string;
  time_of_day?: string[];
  start_date?: string | null;
  end_date?: string | null;
  instructions?: string | null;
  is_active?: boolean;

  strength?: string | null;
  category?: string | null;
  reason?: string | null;
  form?: string | null;
  schedule_type?: string | null;
  times?: unknown;
  meal_rule?: string | null;
  quantity_type?: string | null;
  total_quantity?: number | null;
  remaining_quantity?: number | null;
  refill_threshold?: number | null;
  notes?: string | null;
  doctor_name?: string | null;
  active?: boolean;
}

export interface MedicationLog {
  id: string;
  medication_id: string;
  taken_at: string;
  scheduled_for: string | null;
  skipped: boolean;
  note: string | null;
  created_at: string;
}

export interface MedicationLogInsert {
  medication_id: string;
  taken_at?: string;
  scheduled_for?: string | null;
  skipped?: boolean;
  note?: string | null;
}

export interface SyncPayload {
  id: string;
  entity: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  payload: Record<string, unknown>;
  device_id: string;
  sync_version: number;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
}

export type NotificationType = 'critical' | 'reminder' | 'general';

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: NotificationType | null;
  is_read: boolean;
  created_at: string;
}

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  user_id: string;
  role: ChatRole;
  content: string;
  created_at: string;
}

export interface ChatMessageInsert {
  user_id: string;
  role: ChatRole;
  content: string;
}

export interface BleDevice {
  id: string;
  name: string | null;
  rssi: number | null;
}

export interface BleVitalsStreamPayload {
  heartRate?: number;
  oxygenLevel?: number;
  temperature?: number;
  steps?: number;
  deviceId: string;
  deviceName: string;
  timestamp: string;
}
