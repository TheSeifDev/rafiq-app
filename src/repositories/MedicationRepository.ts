import { BaseRepository, EntityRow } from './BaseRepository';
import { runQuery, runStatement, sanitizeBindings } from '../lib/database';
import { offlineQueue, SyncPriority } from '../lib/offlineQueue';

export interface MedicationInsert {
  patient_id: string;
  name: string;
  dosage?: string | null;
  frequency?: string | null;
  time_of_day?: string | null;
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
  [key: string]: unknown;
}

export interface MedicationUpdate {
  name?: string | null;
  dosage?: string | null;
  frequency?: string | null;
  time_of_day?: string | null;
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
  [key: string]: unknown;
}

export interface MedicationRow extends EntityRow {
  id: string;
  patient_id: string;
  name: string;
  dosage: string | null;
  frequency: string | null;
  time_of_day: string | null;
  start_date: string | null;
  end_date: string | null;
  instructions: string | null;
  is_active: number;
  strength: string | null;
  category: string | null;
  reason: string | null;
  form: string | null;
  schedule_type: string | null;
  times: string | null;
  meal_rule: string | null;
  quantity_type: string | null;
  total_quantity: number | null;
  remaining_quantity: number | null;
  refill_threshold: number | null;
  notes: string | null;
  doctor_name: string | null;
  active: number | null;
  created_at: string;
  updated_at: string | null;
}

export interface MedicationLogInsert {
  medication_id: string;
  taken_at: string;
  scheduled_for?: string | null;
  skipped?: boolean;
  note?: string | null;
  [key: string]: unknown;
}

export interface MedicationLogUpdate {
  taken_at?: string;
  scheduled_for?: string | null;
  skipped?: boolean;
  note?: string | null;
  [key: string]: unknown;
}

export interface MedicationLogRow extends EntityRow {
  id: string;
  medication_id: string;
  taken_at: string;
  scheduled_for: string | null;
  skipped: number;
  note: string | null;
  created_at: string;
  updated_at: string | null;
}

function generateLocalId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function getDeviceId(): string {
  return `device_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function serializeJsonb(val: unknown): string | null {
  if (!val) return null;
  if (typeof val === 'string') return val;
  return JSON.stringify(val);
}

export class MedicationRepository extends BaseRepository<MedicationRow, MedicationInsert, MedicationUpdate> {
  readonly tableName = 'medications';

  readonly insertColumns = [
    'patient_id', 'name', 'dosage', 'frequency', 'time_of_day',
    'start_date', 'end_date', 'instructions', 'is_active',
    'strength', 'category', 'reason', 'form', 'schedule_type',
    'times', 'meal_rule', 'quantity_type', 'total_quantity',
    'remaining_quantity', 'refill_threshold', 'notes', 'doctor_name', 'active',
  ] as const;

  readonly updateColumns = [
    'name', 'dosage', 'frequency', 'time_of_day',
    'start_date', 'end_date', 'instructions', 'is_active',
    'strength', 'category', 'reason', 'form', 'schedule_type',
    'times', 'meal_rule', 'quantity_type', 'total_quantity',
    'remaining_quantity', 'refill_threshold', 'notes', 'doctor_name', 'active',
  ] as const;

  async getByPatientId(patientId: string): Promise<MedicationRow[]> {
    return runQuery<MedicationRow>(
      `SELECT * FROM medications WHERE patient_id = ? AND is_deleted = 0 ORDER BY updated_at DESC, created_at DESC`,
      [patientId]
    );
  }

  async addMedication(payload: MedicationInsert): Promise<MedicationRow> {
    return this.insert({
      ...payload,
      is_active: payload.is_active ?? true,
      active: payload.active ?? true,
    });
  }

  async createMedication(payload: MedicationInsert): Promise<MedicationRow> {
    return this.insert(payload);
  }

  async updateMedication(id: string, changes: MedicationUpdate): Promise<void> {
    await this.update(id, changes);
  }

  async updateMedicationReturning(id: string, changes: MedicationUpdate): Promise<MedicationRow> {
    await this.update(id, changes);
    return (await this.findById(id))!;
  }

  async deleteMedication(id: string): Promise<void> {
    await this.delete(id);
  }

  async setActive(id: string, active: boolean): Promise<void> {
    await this.update(id, { is_active: active, active: active } as MedicationUpdate);
  }

  async refillStock(
    id: string,
    payload: { total_quantity: number; remaining_quantity: number; refill_threshold: number; quantity_type: string }
  ): Promise<void> {
    await this.update(id, payload as MedicationUpdate);
  }
}

export class MedicationLogRepository extends BaseRepository<MedicationLogRow, MedicationLogInsert, MedicationLogUpdate> {
  readonly tableName = 'medication_logs';

  readonly insertColumns = [
    'medication_id', 'taken_at', 'scheduled_for', 'skipped', 'note',
  ] as const;

  readonly updateColumns = [
    'taken_at', 'scheduled_for', 'skipped', 'note',
  ] as const;

  async listLogs(medicationId: string, limit = 200): Promise<MedicationLogRow[]> {
    return runQuery<MedicationLogRow>(
      `SELECT * FROM medication_logs WHERE medication_id = ? AND is_deleted = 0 ORDER BY taken_at DESC LIMIT ?`,
      [medicationId, limit]
    );
  }

  async addLog(payload: MedicationLogInsert): Promise<MedicationLogRow> {
    return this.insert(payload);
  }

  async listLogsForPatientRange(patientId: string, startIso: string, endIso: string): Promise<MedicationLogRow[]> {
    return runQuery<MedicationLogRow>(
      `SELECT ml.* FROM medication_logs ml
       INNER JOIN medications m ON ml.medication_id = m.id
       WHERE m.patient_id = ? AND ml.taken_at >= ? AND ml.taken_at < ? AND ml.is_deleted = 0
       ORDER BY ml.taken_at DESC`,
      [patientId, startIso, endIso]
    );
  }
}
