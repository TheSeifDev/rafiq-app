import { useState, useEffect, useCallback, useRef } from 'react';
import { medicationService, type Medication } from '../services/medication.service';
import { isUuid } from '../utils/uuid';
import { patientService } from '../services/patient.service';
import { useAuthStore } from '../store/auth.store';

interface UseMedicationsResult {
  medications: Medication[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useMedications(patientId: string | null): UseMedicationsResult {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const resolvingRef = useRef(false);

  const load = useCallback(async () => {
    if (!patientId) {
      setLoading(false);
      return;
    }

    setError(null);
    setLoading(true);

    let effectivePatientId = patientId;

    if (!isUuid(patientId)) {
      console.warn(
        '[useMedications] Detected non-UUID patientId, attempting to resolve:',
        patientId
      );

      if (resolvingRef.current) {
        console.warn('[useMedications] UUID resolution already in progress, skipping duplicate call');
        setLoading(false);
        return;
      }
      resolvingRef.current = true;

      try {
        const userId = useAuthStore.getState().session?.user?.id;
        if (userId) {
          const profile = await patientService.getProfile(userId);
          if (profile && isUuid(profile.id)) {
            effectivePatientId = profile.id;
            console.info('[useMedications] Resolved patientId to UUID:', effectivePatientId);
          } else {
            console.warn('[useMedications] Could not resolve patientId — no valid profile found');
          }
        } else {
          console.warn('[useMedications] Could not resolve patientId — no authenticated user');
        }
      } catch (resolveErr) {
        console.warn('[useMedications] UUID resolution failed, will try with original ID:', resolveErr);
      } finally {
        resolvingRef.current = false;
      }
    }

    try {
      const data = await medicationService.getMedications(effectivePatientId);
      setMedications(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل تحميل الأدوية';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    load();
  }, [load]);

  return {
    medications,
    loading,
    error,
    refresh: load,
  };
}
