import { supabase } from '../lib/supabase';
import { createUuid } from '../local/db';
import { listWhere, upsertLocal } from '../local/repository';
import { isUuid } from '../utils/uuid';

export type VitalsRecord = {
  id: string;
  patient_id: string;
  heart_rate: number | null;
  blood_pressure_systolic: number | null;
  blood_pressure_diastolic: number | null;
  oxygen_saturation: number | null;
  temperature: number | null;
  steps: number | null;
  source: 'manual' | 'smartwatch' | 'bluetooth';
  recorded_at: string;
};

export const vitalsService = {
  async getVitalsHistory(patientId: string, limitDays?: number): Promise<VitalsRecord[]> {
    const local = await listWhere<Record<string, unknown>>(
      'vitals',
      'patient_id = ?',
      [patientId],
      `recorded_at DESC${limitDays ? ` LIMIT ${Math.max(1, limitDays)}` : ''}`,
    );
    if (local.length > 0) return local as unknown as VitalsRecord[];

    // Guard: Supabase columns are UUID type — non-UUID patient IDs will be rejected
    if (!isUuid(patientId)) {
      console.warn('[VitalsService] Skipping Supabase fallback: patientId is not a UUID', patientId);
      return [];
    }

    let query = supabase.from('vitals').select('*').eq('patient_id', patientId).order('recorded_at', { ascending: false });
    if (limitDays) query = query.limit(limitDays);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      await upsertLocal('vitals', row as Record<string, unknown>, { enqueue: false });
    }
    return (data ?? []) as VitalsRecord[];
  },
  async saveVitals(payload: Omit<VitalsRecord, 'id'>): Promise<void> {
    await upsertLocal('vitals', { id: createUuid(), ...payload }, { priority: 'high' });
  },
  async getLatestVitals(patientId: string): Promise<VitalsRecord | null> {
    const local = await listWhere<Record<string, unknown>>('vitals', 'patient_id = ?', [patientId], 'recorded_at DESC LIMIT 1');
    if (local[0]) return local[0] as unknown as VitalsRecord;

    // Guard: Supabase columns are UUID type — non-UUID patient IDs will be rejected
    if (!isUuid(patientId)) {
      console.warn('[VitalsService] Skipping Supabase fallback: patientId is not a UUID', patientId);
      return null;
    }

    const { data, error } = await supabase.from('vitals').select('*').eq('patient_id', patientId).order('recorded_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as VitalsRecord | null) ?? null;
  },
};
