import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { authService } from '../services/auth.service';
import { patientService } from '../services/patient.service';
import { syncService } from '../services/sync.service';

export type AuthState = {
  session: Session | null;
  loading: boolean;
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

/**
 * On first login after signup, creates the `patients` row from auth.user metadata.
 * This is deferred from signup because RLS blocks inserts when there's no active session
 * (e.g. when email confirmation is required).
 */
async function ensurePatientRow(session: Session): Promise<void> {
  const user = session.user;
  if (!user) return;

  const createRow = async () => {
    if (await patientService.hasPatient(user.id)) return;

    // Extract metadata stored during signup
    const meta = user.user_metadata ?? {};
    const fullName = meta.full_name ?? meta.name ?? '';

    // Only create if we have a name (indicates this user went through our signup flow)
    if (!fullName) return;

    await patientService.createPatient({
      user_id: user.id,
      full_name: fullName,
      phone: meta.phone ?? null,
      birth_date: meta.birth_date ?? null,
    });
  };

  try {
    await createRow();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[auth] ensurePatientRow first attempt failed:', msg, '— retrying once...');
    // Retry once after a short delay (handles transient network issues)
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      await createRow();
    } catch (retryErr) {
      const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
      console.warn('[auth] ensurePatientRow retry also failed:', retryMsg, '— will retry on next session');
    }
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  loading: true,

  initialize: async () => {
    // 1. Restore existing session
    const session = await authService.getSession();
    set({ session, loading: false });

    if (session) {
      ensurePatientRow(session);
      syncService.start(session.user.id);
    }

    // 2. Listen for future auth state changes (login/logout/token refresh)
    authService.onAuthStateChange(async (_event, newSession) => {
      set({ session: newSession, loading: false });

      if (newSession) {
        ensurePatientRow(newSession);
        syncService.start(newSession.user.id);
      } else {
        syncService.stop();
      }
    });
  },

  signIn: async (email, password) => {
    const session = await authService.signIn(email, password);
    set({ session });
    // Create patient row if it doesn't exist yet
    ensurePatientRow(session);
    syncService.start(session.user.id);
  },

  signUp: async (email, password) => {
    await authService.signUp(email, password);
  },

  signOut: async () => {
    syncService.stop();
    await authService.signOut();
    set({ session: null });
  },
}));
