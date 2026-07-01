import { supabase } from '../lib/supabase';
import { createUuid } from '../local/db';
import { deleteLocal, getById, listWhere, upsertLocal, updateLocal } from '../local/repository';
import { isUuid } from '../utils/uuid';

export type Medication = {
  id: string;
  patient_id: string;
  user_id?: string | null;
  name: string;
  dosage: string;
  frequency: string;
  time_of_day: string[];
  start_date: string | null;
  end_date: string | null;
  instructions: string | null;
  is_active: boolean;

  // v2 (backward-compatible; may be null for existing rows)
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
  active?: boolean | null;
  created_at?: string;
  updated_at?: string | null;
};

export type MedicationInsert = Omit<Medication, 'id'>;

export type MedicationLog = {
  id: string;
  medication_id: string;
  taken_at: string;
  scheduled_for: string | null;
  skipped: boolean;
  note: string | null;
  created_at: string;
};

export type MedicationLogInsert = {
  medication_id: string;
  taken_at?: string;
  scheduled_for?: string | null;
  skipped?: boolean;
  note?: string | null;
  created_at?: string;
};

export const medicationService = {
  async getMedications(patientId: string): Promise<Medication[]> {
    // Always try local first
    const local = await listWhere<Record<string, unknown>>(
      'medications',
      'patient_id = ? AND deleted_at IS NULL',
      [patientId],
      'updated_at DESC, created_at DESC',
    );
    if (local.length > 0) return local as unknown as Medication[];

    // Guard: Supabase columns are UUID type — non-UUID patient IDs will be rejected
    if (!isUuid(patientId)) {
      console.warn('[MedicationService] Skipping Supabase fallback: patientId is not a UUID', patientId);
      return [];
    }

    const { data, error } = await supabase
      .from('medications')
      .select('*')
      .eq('patient_id', patientId)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    for (const med of data ?? []) {
      await upsertLocal('medications', med as Record<string, unknown>, { enqueue: false });
    }
    return (data ?? []) as Medication[];
  },

  async getMedication(id: string): Promise<Medication | null> {
    const local = await getById<Record<string, unknown>>('medications', id);
    if (local && !local.deleted_at) return local as unknown as Medication;

    if (!isUuid(id)) {
      console.warn('[MedicationService] Skipping Supabase fallback: medication id is not a UUID', id);
      return null;
    }

    const { data, error } = await supabase.from('medications').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return (data ?? null) as Medication | null;
  },

  async addMedication(payload: MedicationInsert): Promise<void> {
    await upsertLocal('medications', { id: createUuid(), ...payload }, {
      userId: payload.user_id ?? undefined,
      priority: 'normal',
    });
  },

  async createMedication(payload: MedicationInsert): Promise<Medication> {
    return upsertLocal('medications', { id: createUuid(), ...payload }, {
      userId: payload.user_id ?? undefined,
      priority: 'normal',
    }) as Promise<Medication>;
  },

  async updateMedication(id: string, payload: Partial<Medication>): Promise<void> {
    await updateLocal('medications', id, payload as Record<string, unknown>, {
      userId: payload.user_id ?? undefined,
      priority: 'normal',
    });
  },

  async updateMedicationReturning(id: string, payload: Partial<Medication>): Promise<Medication> {
    await this.updateMedication(id, payload);
    const updated = await this.getMedication(id);
    if (!updated) throw new Error('Medication not found after update');
    return updated;
  },

  async deleteMedication(id: string): Promise<void> {
    await deleteLocal('medications', id, { priority: 'normal' });
  },

  async setActive(id: string, active: boolean): Promise<void> {
    await updateLocal('medications', id, { active, is_active: active }, { priority: 'normal' });
  },

  async refillStock(
    id: string,
    payload: Pick<Medication, 'total_quantity' | 'remaining_quantity' | 'refill_threshold' | 'quantity_type'>,
  ): Promise<void> {
    await updateLocal('medications', id, payload as Record<string, unknown>, { priority: 'normal' });
  },

  async listLogs(medicationId: string, limit = 200): Promise<MedicationLog[]> {
    const local = await listWhere<Record<string, unknown>>(
      'medication_logs',
      'medication_id = ?',
      [medicationId],
      `taken_at DESC LIMIT ${Math.max(1, Math.min(limit, 500))}`,
    );
    if (local.length > 0) return local as unknown as MedicationLog[];

    if (!isUuid(medicationId)) {
      console.warn('[MedicationService] Skipping Supabase fallback: medicationId is not a UUID', medicationId);
      return [];
    }

    const { data, error } = await supabase
      .from('medication_logs')
      .select('*')
      .eq('medication_id', medicationId)
      .order('taken_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    for (const log of data ?? []) {
      await upsertLocal('medication_logs', log as Record<string, unknown>, { enqueue: false });
    }
    return (data ?? []) as MedicationLog[];
  },

  async addLog(payload: MedicationLogInsert): Promise<void> {
    await upsertLocal('medication_logs', { id: createUuid(), ...payload }, { priority: 'normal' });
  },

  async listLogsForPatientRange(patientId: string, startIso: string, endIso: string): Promise<MedicationLog[]> {
    const local = await listWhere<Record<string, unknown>>(
      'medication_logs',
      'patient_id = ? AND taken_at >= ? AND taken_at < ?',
      [patientId, startIso, endIso],
      'taken_at DESC',
    );
    if (local.length > 0) return local as unknown as MedicationLog[];

    if (!isUuid(patientId)) {
      console.warn('[MedicationService] Skipping Supabase fallback: patientId is not a UUID', patientId);
      return [];
    }

    const { data, error } = await supabase
      .from('medication_logs')
      .select('*, medications!inner(patient_id)')
      .eq('medications.patient_id', patientId)
      .gte('taken_at', startIso)
      .lt('taken_at', endIso)
      .order('taken_at', { ascending: false });

    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as MedicationLog[];
  },

  /**
   * Mark a dose as taken (called from notification action button TAKEN).
   * Logs the dose and decrements remaining_quantity if stock tracking is active.
   */
  async markDoseTaken(medicationId: string): Promise<void> {
    const now = new Date().toISOString();

    // Log the dose taken
    await upsertLocal('medication_logs', {
      id: createUuid(),
      medication_id: medicationId,
      taken_at: now,
      scheduled_for: now,
      skipped: false,
      note: 'أُخذ من الإشعار',
      created_at: now,
    }, { priority: 'normal' });

    // Decrement remaining quantity if stock tracking is active
    try {
      const med = await this.getMedication(medicationId);
      if (med && typeof med.remaining_quantity === 'number' && med.remaining_quantity > 0) {
        await updateLocal('medications', medicationId, {
          remaining_quantity: med.remaining_quantity - 1,
          updated_at: now,
        }, { priority: 'normal' });
      }
    } catch (err) {
      console.warn('[MedicationService] markDoseTaken: stock decrement failed', err);
    }
  },
};