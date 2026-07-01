import { supabase } from '../lib/supabase';
import type { VitalsReading, VitalsReadingInsert } from '../types/database';
import { toFiniteNumberOrNull } from '../utils/number';
import { createUuid } from '../local/db';
import { listWhere, upsertLocal } from '../local/repository';
import { localSyncEngine } from '../local/syncEngine';
import { isUuid } from '../utils/uuid';

function normalizeVitalsReading(reading: unknown): VitalsReading {
  const row = (reading ?? {}) as Partial<VitalsReading> & Record<string, unknown>;
  return {
    ...(row as VitalsReading),
    heart_rate: toFiniteNumberOrNull(row.heart_rate),
    oxygen_level: toFiniteNumberOrNull(row.oxygen_level),
    blood_pressure_systolic: toFiniteNumberOrNull(row.blood_pressure_systolic),
    blood_pressure_diastolic: toFiniteNumberOrNull(row.blood_pressure_diastolic),
    temperature: toFiniteNumberOrNull(row.temperature),
    steps: toFiniteNumberOrNull(row.steps),
  };
}

export const vitalsReadingService = {
  /**
   * Fetch the full vitals history for a patient, newest first.
   */
  async getHistory(patientId: string): Promise<VitalsReading[]> {
    const local = await listWhere<Record<string, unknown>>(
      'vitals_readings',
      'patient_id = ?',
      [patientId],
      'recorded_at DESC',
    );
    if (local.length > 0) return local.map(normalizeVitalsReading);

    // Guard: Supabase patient_id column is uuid type — non-UUID IDs will be rejected
    if (!isUuid(patientId)) {
      console.warn('[VitalsReadingService] Skipping Supabase fallback: patientId is not a UUID', patientId);
      return [];
    }

    const { data, error } = await supabase
      .from('vitals_readings')
      .select('*')
      .eq('patient_id', patientId)
      .order('recorded_at', { ascending: false });

    if (error) throw new Error(error.message);
    for (const reading of data ?? []) {
      await upsertLocal('vitals_readings', reading as Record<string, unknown>, { enqueue: false });
    }
    return (data ?? []).map(normalizeVitalsReading);
  },

  /**
   * Fetch only the most recent reading (used for the Home dashboard card).
   */
  async getLatest(patientId: string): Promise<VitalsReading | null> {
    const local = await listWhere<Record<string, unknown>>(
      'vitals_readings',
      'patient_id = ?',
      [patientId],
      'recorded_at DESC LIMIT 1',
    );
    if (local[0]) return normalizeVitalsReading(local[0]);

    // Guard: Supabase patient_id column is uuid type — non-UUID IDs will be rejected
    if (!isUuid(patientId)) {
      console.warn('[VitalsReadingService] Skipping Supabase fallback: patientId is not a UUID', patientId);
      return null;
    }

    const { data, error } = await supabase
      .from('vitals_readings')
      .select('*')
      .eq('patient_id', patientId)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return null;
    return normalizeVitalsReading(data);
  },

  /**
   * Insert a new vitals reading (manual or smartwatch).
   */
  async addReading(
    reading: VitalsReadingInsert
  ): Promise<{ data: VitalsReading | null; error: string | null }> {
    try {
      const data = await upsertLocal('vitals_readings', {
        id: createUuid(),
        ...reading,
        recorded_at: reading.recorded_at ?? new Date().toISOString(),
      }, { priority: 'high' });
      return { data: normalizeVitalsReading(data), error: null };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : 'Failed to save reading locally',
      };
    }
  },

  /**
   * Subscribe to real-time inserts for a given patient.
   * Returns the Supabase RealtimeChannel so the caller can unsubscribe.
   */
  subscribeToReadings(
    patientId: string,
    callback: (reading: VitalsReading) => void
  ): () => void {
    const channel = supabase
      .channel(`vitals-readings-${patientId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'vitals_readings',
          filter: `patient_id=eq.${patientId}`,
      },
      async (payload) => {
        await localSyncEngine.recordRealtimeEvent({
          patientId,
          tableName: 'vitals_readings',
          recordId: (payload.new as { id?: string }).id,
          eventType: 'INSERT',
          payload: payload.new as Record<string, unknown>,
        });
        callback(normalizeVitalsReading(payload.new));
      }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
};
