import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { AppLanguage } from '../constants/translations';

export type NotificationPrefs = {
  medicationReminders: boolean;
  lowStockAlerts: boolean;
  emergencyAlerts: boolean;
  chatAlerts: boolean;
  vitalsAlerts: boolean;
  sound: boolean;
  vibration: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
};

const DEFAULT_NOTIF_PREFS: NotificationPrefs = {
  medicationReminders: true,
  lowStockAlerts: true,
  emergencyAlerts: true,
  chatAlerts: true,
  vitalsAlerts: true,
  sound: true,
  vibration: true,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
};

type AppState = {
  language: AppLanguage;
  darkMode: boolean;
  healthDataConsent: boolean;
  notificationPrefs: NotificationPrefs;
  _recoverReloadTrigger: number;
  hydrate: (fallbackLanguage: AppLanguage) => Promise<void>;
  setLanguage: (language: AppLanguage) => Promise<void>;
  setDarkMode: (enabled: boolean) => Promise<void>;
  setHealthDataConsent: (enabled: boolean) => Promise<void>;
  setNotificationPrefs: (prefs: Partial<NotificationPrefs>) => Promise<void>;
};

const STORAGE_KEY = 'rafiq_app_prefs_v2';

function persist(state: AppState): void {
  AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      language: state.language,
      darkMode: state.darkMode,
      healthDataConsent: state.healthDataConsent,
      notificationPrefs: state.notificationPrefs,
    }),
  ).catch(() => {
  });
}

export const useAppStore = create<AppState>((set, get) => ({
  language: 'ar',
  darkMode: false,
  healthDataConsent: false,
  notificationPrefs: { ...DEFAULT_NOTIF_PREFS },
  _recoverReloadTrigger: 0,
  hydrate: async (fallbackLanguage) => {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      set({ language: fallbackLanguage });
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      set({
        language: parsed.language ?? fallbackLanguage,
        darkMode: parsed.darkMode ?? false,
        healthDataConsent: parsed.healthDataConsent === true ? true : false,
        notificationPrefs: { ...DEFAULT_NOTIF_PREFS, ...(parsed.notificationPrefs ?? {}) },
      });
    } catch {
      set({ language: fallbackLanguage });
    }
  },
  setLanguage: async (language) => {
    set({ language });
    persist(get());
  },
  setDarkMode: async (enabled) => {
    set({ darkMode: enabled });
    persist(get());
  },
  setHealthDataConsent: async (enabled) => {
    set({ healthDataConsent: enabled });
    persist(get());
  },
  setNotificationPrefs: async (prefs) => {
    set((state) => ({ notificationPrefs: { ...state.notificationPrefs, ...prefs } }));
    persist(get());
  },
}));
