import { BaseRepository, EntityRow } from './BaseRepository';
import { runQuery, runStatement, sanitizeBindings } from '../lib/database';
import type {
  AddressData,
  ReporterData,
  HospitalData,
} from '../types/database';
import { offlineQueue, SyncPriority } from '../lib/offlineQueue';
import { createUuid } from '../utils/uuid';

export interface PatientInsert {
  user_id: string;
  full_name: string;
  phone?: string | null;
  birth_date?: string | null;
  age?: number | null;
  gender?: string | null;
  blood_type?: string | null;
  condition_type?: string | null;
  risk_level?: string | null;
  notes?: string | null;
  relationship?: string;
  address_data?: AddressData | null;
  reporter_data?: ReporterData | null;
  hospital_data?: HospitalData | null;
  latitude?: number | null;
  longitude?: number | null;
  geocoded_address?: string | null;
  address?: string | null;
  emergency_contact?: string | null;
  location?: string | null;
  [key: string]: unknown;
}

export interface PatientUpdate {
  full_name?: string;
  phone?: string | null;
  birth_date?: string | null;
  age?: number | null;
  gender?: string | null;
  blood_type?: string | null;
  condition_type?: string | null;
  risk_level?: string | null;
  notes?: string | null;
  address_data?: AddressData | null;
  reporter_data?: ReporterData | null;
  hospital_data?: HospitalData | null;
  latitude?: number | null;
  longitude?: number | null;
  geocoded_address?: string | null;
  address?: string | null;
  emergency_contact?: string | null;
  location?: string | null;
  [key: string]: unknown;
}

export interface PatientRow extends EntityRow {
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
  address_data: string | null;
  reporter_data: string | null;
  hospital_data: string | null;
  latitude: number | null;
  longitude: number | null;
  geocoded_address: string | null;
  address: string | null;
  emergency_contact: string | null;
  location: string | null;
  created_at: string;
  updated_at: string | null;
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

export interface EmergencyContactUpdate {
  name?: string;
  relation?: string;
  phone?: string;
  priority?: number;
  is_primary?: boolean;
  notes?: string | null;
  [key: string]: unknown;
}

export interface EmergencyContactRow extends EntityRow {
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

export interface PatientConditionUpdate {
  condition_name?: string;
  severity?: string;
  diagnosed_date?: string | null;
  notes?: string | null;
  is_active?: boolean;
  [key: string]: unknown;
}

export interface PatientConditionRow extends EntityRow {
  id: string;
  patient_id: string;
  condition_name: string;
  severity: string | null;
  diagnosed_date: string | null;
  notes: string | null;
  is_active: number;
  created_at: string;
  updated_at: string | null;
}

function parseJsonb<T>(val: unknown, fallback: T): T {
  if (!val) return fallback;
  if (typeof val === 'string') {
    try { return JSON.parse(val) as T; } catch { return fallback; }
  }
  if (typeof val === 'object') return val as T;
  return fallback;
}

function serializeJsonb(val: unknown): string | null {
  if (!val) return null;
  if (typeof val === 'string') return val;
  return JSON.stringify(val);
}

// FIX (P2-7): Previously returned a new value on EVERY call. Now cached at
// module scope so it's stable within a session. For true cross-session
// persistence, use the async getDeviceId() from lib/database/helpers.ts.
let _cachedDeviceId: string | null = null;
function getDeviceId(): string {
  if (_cachedDeviceId) return _cachedDeviceId;
  _cachedDeviceId = `device_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return _cachedDeviceId;
}

export class PatientRepository extends BaseRepository<PatientRow, PatientInsert, PatientUpdate> {
  readonly tableName = 'patients';

  readonly insertColumns = [
    'user_id',
    'full_name',
    'phone',
    'birth_date',
    'age',
    'gender',
    'blood_type',
    'condition_type',
    'risk_level',
    'notes',
    'relationship',
    'address_data',
    'reporter_data',
    'hospital_data',
    'latitude',
    'longitude',
    'geocoded_address',
    'address',
    'emergency_contact',
    'location',
  ] as const;

  readonly updateColumns = [
    'full_name',
    'phone',
    'birth_date',
    'age',
    'gender',
    'blood_type',
    'condition_type',
    'risk_level',
    'notes',
    'address_data',
    'reporter_data',
    'hospital_data',
    'latitude',
    'longitude',
    'geocoded_address',
    'address',
    'emergency_contact',
    'location',
  ] as const;

  async getByUserId(userId: string): Promise<PatientNormalizedRow | null> {
    const rows = await runQuery<PatientRow>(
      `SELECT * FROM patients WHERE user_id = ? AND is_deleted = 0 LIMIT 1`,
      [userId]
    );
    if (!rows[0]) return null;
    return this.normalizeRow(rows[0]);
  }

  async getIdByUserId(userId: string): Promise<string | null> {
    const rows = await runQuery<{ id: string }>(
      `SELECT id FROM patients WHERE user_id = ? AND is_deleted = 0 LIMIT 1`,
      [userId]
    );
    return rows[0]?.id ?? null;
  }

  async createPatient(payload: PatientInsert): Promise<PatientRow> {
    const id = createUuid();
    const now = new Date().toISOString();
    const deviceId = getDeviceId();

    const row: PatientRow = {
      id,
      user_id: payload.user_id,
      full_name: payload.full_name,
      phone: payload.phone ?? null,
      birth_date: payload.birth_date ?? null,
      age: payload.age ?? null,
      gender: payload.gender ?? null,
      blood_type: payload.blood_type ?? null,
      condition_type: payload.condition_type ?? null,
      risk_level: payload.risk_level ?? null,
      notes: payload.notes ?? null,
      relationship: payload.relationship ?? 'self',
      // FIX (E3): Schema has `NOT NULL DEFAULT '{}'` for these columns, but
      // passing `null` explicitly overrides the default and violates the
      // constraint. Use '{}' (empty JSON object) when the payload doesn't
      // provide a value, so the NOT NULL constraint is satisfied.
      address_data: payload.address_data ? JSON.stringify(payload.address_data) : '{}',
      reporter_data: payload.reporter_data ? JSON.stringify(payload.reporter_data) : '{}',
      hospital_data: payload.hospital_data ? JSON.stringify(payload.hospital_data) : '{}',
      latitude: payload.latitude ?? null,
      longitude: payload.longitude ?? null,
      geocoded_address: payload.geocoded_address ?? null,
      address: payload.address ?? null,
      emergency_contact: payload.emergency_contact ?? null,
      location: payload.location ?? null,
      created_at: now,
      updated_at: now,
      version: 1,
      updated_by_device: deviceId,
      is_deleted: 0,
      deleted_at: null,
      deleted_by: null,
    };

    const columns = [
      'id', 'user_id', 'full_name', 'phone', 'birth_date', 'age', 'gender',
      'blood_type', 'condition_type', 'risk_level', 'notes', 'relationship',
      'address_data', 'reporter_data', 'hospital_data', 'latitude', 'longitude',
      'geocoded_address', 'address', 'emergency_contact', 'location',
      'created_at', 'updated_at', 'version', 'updated_by_device',
      'is_deleted', 'deleted_at', 'deleted_by',
    ];

    const placeholders = columns.map(() => '?').join(', ');
    const values = sanitizeBindings(columns.map(col => row[col as keyof PatientRow]));

    await runStatement(
      `INSERT INTO patients (${columns.join(', ')}) VALUES (${placeholders})`,
      values
    );

    await offlineQueue.enqueue({
      table: this.tableName,
      operation: 'INSERT',
      payload: row as unknown as Record<string, unknown>,
      recordId: id,
      priority: 'critical',
      userId: payload.user_id,
    });

    return row;
  }

  async updateProfile(id: string, payload: PatientUpdate): Promise<void> {
    await this.update(id, payload);
  }

  async hasPatient(userId: string): Promise<boolean> {
    const rows = await runQuery<{ id: string }>(
      `SELECT id FROM patients WHERE user_id = ? AND is_deleted = 0 LIMIT 1`,
      [userId]
    );
    return rows.length > 0;
  }

  private normalizeRow(row: PatientRow): PatientNormalizedRow {
    return {
      ...row,
      address_data: parseJsonb(row.address_data, {} as AddressData),
      reporter_data: parseJsonb(row.reporter_data, {} as ReporterData),
      hospital_data: parseJsonb(row.hospital_data, {} as HospitalData),
    };
  }
}

export interface PatientNormalizedRow {
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
  address: string | null;
  emergency_contact: string | null;
  location: string | null;
  created_at: string;
  updated_at: string | null;
  version?: number;
  updated_by_device?: string | null;
  is_deleted?: number;
  deleted_at?: string | null;
  deleted_by?: string | null;
}

export class EmergencyContactRepository extends BaseRepository<EmergencyContactRow, EmergencyContactInsert, EmergencyContactUpdate> {
  readonly tableName = 'emergency_contacts';

  readonly insertColumns = [
    'patient_id', 'name', 'relation', 'phone', 'priority',
    'is_primary', 'notes',
  ] as const;

  readonly updateColumns = [
    'name', 'relation', 'phone', 'priority', 'is_primary', 'notes',
  ] as const;

  async getByPatientId(patientId: string): Promise<EmergencyContactRow[]> {
    return runQuery<EmergencyContactRow>(
      `SELECT * FROM emergency_contacts WHERE patient_id = ? AND is_deleted = 0 ORDER BY priority ASC`,
      [patientId]
    );
  }

  async upsertContact(contact: EmergencyContactInsert & { id?: string }): Promise<EmergencyContactRow> {
    if (contact.id) {
      const existing = await this.findById(contact.id);
      if (existing) {
        const { id: _, patient_id: __, created_at: ___, ...updatePayload } = contact;
        await this.update(contact.id, updatePayload as EmergencyContactUpdate);
        return { ...existing, ...updatePayload } as EmergencyContactRow;
      }
    }

    const id = createUuid();
    const now = new Date().toISOString();
    const deviceId = getDeviceId();

    const row: EmergencyContactRow = {
      id,
      patient_id: contact.patient_id,
      name: contact.name,
      relation: contact.relation,
      phone: contact.phone,
      priority: contact.priority ?? 0,
      is_primary: contact.is_primary ? 1 : 0,
      notes: contact.notes ?? null,
      created_at: now,
      updated_at: now,
      version: 1,
      updated_by_device: deviceId,
      is_deleted: 0,
      deleted_at: null,
      deleted_by: null,
    };

    const columns = [
      'id', 'patient_id', 'name', 'relation', 'phone', 'priority',
      'is_primary', 'notes', 'created_at', 'updated_at', 'version',
      'updated_by_device', 'is_deleted', 'deleted_at', 'deleted_by',
    ];

    const placeholders = columns.map(() => '?').join(', ');
    const values = sanitizeBindings(columns.map(col => row[col as keyof EmergencyContactRow]));

    await runStatement(
      `INSERT INTO emergency_contacts (${columns.join(', ')}) VALUES (${placeholders})`,
      values
    );

    return row;
  }
}

export class PatientConditionRepository extends BaseRepository<PatientConditionRow, PatientConditionInsert, PatientConditionUpdate> {
  readonly tableName = 'patient_conditions';

  readonly insertColumns = [
    'patient_id', 'condition_name', 'severity', 'diagnosed_date',
    'notes', 'is_active',
  ] as const;

  readonly updateColumns = [
    'condition_name', 'severity', 'diagnosed_date', 'notes', 'is_active',
  ] as const;

  async getByPatientId(patientId: string): Promise<PatientConditionRow[]> {
    return runQuery<PatientConditionRow>(
      `SELECT * FROM patient_conditions WHERE patient_id = ? AND is_deleted = 0`,
      [patientId]
    );
  }

  async syncConditions(patientId: string, conditions: PatientConditionInsert[]): Promise<void> {
    const existing = await runQuery<{ id: string }>(
      `SELECT id FROM patient_conditions WHERE patient_id = ? AND is_deleted = 0`,
      [patientId]
    );
    for (const row of existing) {
      await this.delete(row.id);
    }

    for (const condition of conditions) {
      await this.insert({ ...condition, patient_id: patientId });
    }
  }
}
