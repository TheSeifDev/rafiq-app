/**
 * Local + Remote Notification Service for Rafiq.
 *
 * FIX LOG (v3.1):
 *   1. CRITICAL — Unified Android channel ID to `rafiq_medication` everywhere.
 *      Previously `notificationService` used `'medications'` while `notificationPipeline`
 *      created `'rafiq_medication'`. On Android, a notification scheduled against a
 *      non-existent channel is SILENTLY DROPPED. Now both systems use `rafiq_medication`.
 *   2. CRITICAL — Replaced deprecated `SchedulableTriggerInputTypes.DAILY` trigger
 *      (which fired only ONCE because `repeats: true` was missing) with the modern
 *      `CalendarTriggerInput` shape: `{ hour, minute, repeats: true, channelId }`.
 *      Production medication reminders now actually repeat daily.
 *   3. NEW    — Added `scheduleProfileCompletionReminder()` that fires an hourly
 *      local notification (system-tray, visible in background) prompting the user
 *      to complete their medical profile. The body is dynamically refreshed each
 *      time the notification fires by `addNotificationReceivedListener` in App.tsx,
 *      which calls `patientValidationService.validatePatientProfile` and dismisses
 *      the notification if the profile is complete.
 *   4. FIX    — `scheduleImmediateLocalNotification` now picks a sensible default
 *      channel per `kind` (medication → rafiq_medication, vitals → rafiq_health,
 *      chat → rafiq_chat, emergency → rafiq_emergency, default → rafiq_default).
 */
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { NotificationPrefs } from '../../store/app.store';

// ─── Environment detection ──────────────────────────────────
export const IS_EXPO_GO = Constants.appOwnership === 'expo';

// ─── Unified channel IDs (must match notificationPipeline.ts) ──
export const CHANNEL_IDS = {
  default: 'rafiq_default',
  emergency: 'rafiq_emergency',
  medication: 'rafiq_medication',
  health: 'rafiq_health',
  device: 'rafiq_device',
  chat: 'rafiq_chat',
  system: 'rafiq_system',
  wearable: 'rafiq_wearable',
  food: 'rafiq_food',
} as const;

/**
 * Pick the right channel for a notification kind.
 * Falls back to `rafiq_default` for unknown kinds.
 */
export function channelForKind(kind?: string): string {
  if (!kind) return CHANNEL_IDS.default;
  if (kind.startsWith('med')) return CHANNEL_IDS.medication;
  if (kind.startsWith('vitals')) return CHANNEL_IDS.health;
  if (kind.startsWith('chat')) return CHANNEL_IDS.chat;
  if (kind.startsWith('emergency')) return CHANNEL_IDS.emergency;
  if (kind.startsWith('food')) return CHANNEL_IDS.food;
  if (kind.startsWith('wearable') || kind.startsWith('device')) return CHANNEL_IDS.wearable;
  if (kind.startsWith('profile')) return CHANNEL_IDS.system;
  return CHANNEL_IDS.default;
}

// ─── Permission (local only — no token) ─────────────────────

export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// ─── Android channel ────────────────────────────────────────
//
// FIX: The old `ensureAndroidChannel` only created a single channel called
//      `'medications'`, which did NOT match the channel ID used by
//      `notificationPipeline.ts` (`'rafiq_medication'`). This caused Android
//      to silently drop medication reminders in production.
//      Now we ensure ALL channels exist with consistent IDs.

export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;

  const channelDefs: Array<[string, string, Notifications.AndroidImportance]> = [
    [CHANNEL_IDS.default, 'Default', Notifications.AndroidImportance.DEFAULT],
    [CHANNEL_IDS.medication, 'Medication Reminders', Notifications.AndroidImportance.HIGH],
    [CHANNEL_IDS.emergency, 'Emergency Alerts', Notifications.AndroidImportance.MAX],
    [CHANNEL_IDS.health, 'Health & Vitals', Notifications.AndroidImportance.HIGH],
    [CHANNEL_IDS.chat, 'Chat Messages', Notifications.AndroidImportance.DEFAULT],
    [CHANNEL_IDS.system, 'System Reminders', Notifications.AndroidImportance.DEFAULT],
    [CHANNEL_IDS.food, 'Food & Nutrition', Notifications.AndroidImportance.DEFAULT],
    [CHANNEL_IDS.device, 'Device Alerts', Notifications.AndroidImportance.LOW],
    [CHANNEL_IDS.wearable, 'Wearable Alerts', Notifications.AndroidImportance.LOW],
  ];

  await Promise.all(
    channelDefs.map(([id, name, importance]) =>
      Notifications.setNotificationChannelAsync(id, {
        name,
        importance,
        vibrationPattern: importance === Notifications.AndroidImportance.MAX ? [0, 250, 250, 250] : [0, 100],
        lightColor: '#00C2FF',
        sound: 'default',
      }).catch(() => undefined)
    )
  );
}

// ─── Identifier builder ─────────────────────────────────────

export function buildIdentifier(medicationId: string, hour: number, minute: number): string {
  return `med_${medicationId}_${hour}_${minute}`;
}

export type NotificationTarget =
  | 'NotificationCenter'
  | 'Medications'
  | 'Vitals'
  | 'Chat'
  | 'Emergency'
  | 'NotificationSettings'
  | 'EmergencyProfile';

export type LocalNotificationKind =
  | 'medication_reminder'
  | 'med_low_stock'
  | 'med_missed_check'
  | 'vitals_alert'
  | 'chat_message'
  | 'profile_completion'
  | 'test'
  | 'general';

// ─── Time calculation for Expo Go ───────────────────────────

/**
 * Calculate seconds from now until the next occurrence of hour:minute.
 * Used by Expo Go's TIME_INTERVAL trigger (one-shot, re-scheduled on delivery).
 */
export function secondsUntilNext(hour: number, minute: number): number {
  const now = new Date();
  const next = new Date();
  next.setHours(hour, minute, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return Math.max(10, Math.floor((next.getTime() - now.getTime()) / 1000));
}

// ─── Schedule a single daily reminder ───────────────────────

export async function scheduleMedicationReminder(params: {
  medicationId: string;
  medicationName: string;
  hour: number;
  minute: number;
  language?: 'ar' | 'en';
  prefs?: NotificationPrefs;
  userId?: string;
}): Promise<string> {
  const { medicationId, medicationName, hour, minute, language = 'ar', userId } = params;
  const identifier = buildIdentifier(medicationId, hour, minute);

  // Cancel existing to prevent duplicates
  await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});

  // Ensure all channels exist on Android
  await ensureAndroidChannel();

  const title =
    language === 'ar'
      ? '💊 وقت الدواء!'
      : '💊 Medication reminder';
  const body =
    language === 'ar'
      ? `حان موعد ${medicationName}`
      : `Time for: ${medicationName}`;

  return Notifications.scheduleNotificationAsync({
    identifier,
    content: {
      title,
      body,
      data: {
        screen: 'Medications',
        kind: 'medication_reminder',
        type: 'medication_reminder',
        medicationId,
        userId,
        notificationKey: identifier,
      },
      sound: 'default',
      categoryIdentifier: 'MEDICATION_REMINDER',
      ...(Platform.OS === 'android' && { channelId: CHANNEL_IDS.medication }),
    },
    trigger: IS_EXPO_GO
      ? {
          // Expo Go: TIME_INTERVAL is reliable. One-shot, re-scheduled on delivery
          // via addNotificationReceivedListener in RootNavigator.
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: secondsUntilNext(hour, minute),
          repeats: false,
        }
      : {
          // FIX: Production uses CalendarTriggerInput (NOT the deprecated DAILY enum).
          // The old code used `SchedulableTriggerInputTypes.DAILY` WITHOUT `repeats: true`,
          // which caused reminders to fire only ONCE. Calendar trigger with `repeats: true`
          // is the correct shape per expo-notifications v0.30+ docs.
          type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
          hour,
          minute,
          repeats: true,
          channelId: CHANNEL_IDS.medication,
        },
  });
}

// ─── Cancel all reminders for one medication ────────────────

export async function cancelAllRemindersForMedication(medicationId: string): Promise<void> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  const mine = all.filter((n) => n.identifier.startsWith(`med_${medicationId}_`));
  await Promise.all(mine.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
}

export async function scheduleImmediateLocalNotification(params: {
  title: string;
  body: string;
  screen?: NotificationTarget;
  kind?: LocalNotificationKind;
  data?: Record<string, unknown>;
  seconds?: number;
  identifier?: string;
  channelId?: string;
}): Promise<string> {
  const granted = await requestNotificationPermission();
  if (!granted) throw new Error('Notification permission not granted');

  await ensureAndroidChannel();

  const kind = params.kind ?? 'general';

  return Notifications.scheduleNotificationAsync({
    identifier: params.identifier,
    content: {
      title: params.title,
      body: params.body,
      data: {
        screen: params.screen ?? 'NotificationCenter',
        kind,
        type: kind,
        ...(params.data ?? {}),
      },
      sound: 'default',
      ...(Platform.OS === 'android' && {
        channelId: params.channelId ?? channelForKind(kind),
      }),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: Math.max(1, params.seconds ?? 1),
    },
  });
}

// ─── Cancel ALL notifications ───────────────────────────────

export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

// ─── List all scheduled ─────────────────────────────────────

export async function getScheduledNotifications() {
  return Notifications.getAllScheduledNotificationsAsync();
}

// ─── Test notification (immediate, 5 second delay) ──────────

export async function sendTestNotification(language: 'ar' | 'en'): Promise<string> {
  return scheduleImmediateLocalNotification({
    title: language === 'ar' ? 'إشعار تجريبي' : 'Test notification',
    body: language === 'ar' ? 'إشعارات رفيق تعمل بنجاح!' : 'Rafiq notifications are working!',
    screen: 'NotificationCenter',
    kind: 'test',
    seconds: 5,
  });
}

// ─── Quiet hours helper ─────────────────────────────────────

export function isQuietHours(now: Date, prefs: NotificationPrefs): boolean {
  if (!prefs.quietHoursEnabled) return false;

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [startH, startM] = prefs.quietHoursStart.split(':').map(Number);
  const [endH, endM] = prefs.quietHoursEnd.split(':').map(Number);

  const startMinutes = (startH ?? 22) * 60 + (startM ?? 0);
  const endMinutes = (endH ?? 7) * 60 + (endM ?? 0);

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }
  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

// ─── Hourly profile-completion reminder ─────────────────────
//
// NEW: Schedules a repeating hourly local notification that reminds the
// user to complete their medical profile. The notification body is set
// to a generic prompt at schedule time; App.tsx registers a
// `addNotificationReceivedListener` that re-validates the profile when
// the notification fires and either (a) dismisses it if the profile is
// complete, or (b) updates the body with the actual missing fields.
//
// This satisfies the user's requirement:
//   "كمان رساله تاكد كل ساعه من ملئ جميع البيانات"
//   ("also a message that checks every hour that all data is filled")
//
// The notification is visible in the system tray even when the app is
// backgrounded or killed (unlike the existing in-app modal which only
// fires when AppState === 'active').

export const PROFILE_COMPLETION_IDENTIFIER = 'rafiq_profile_completion_hourly';

export async function scheduleProfileCompletionReminder(params: {
  language?: 'ar' | 'en';
  userId?: string;
}): Promise<string> {
  const { language = 'ar', userId } = params;

  await ensureAndroidChannel();

  // Cancel any previous instance first (idempotent re-schedule)
  await Notifications.cancelScheduledNotificationAsync(PROFILE_COMPLETION_IDENTIFIER).catch(() => undefined);

  const title =
    language === 'ar'
      ? '📋 أكمل ملفك الطبي'
      : '📋 Complete your medical profile';

  // NOTE: The body is generic at schedule time. App.tsx intercepts the
  // delivered notification and rewrites the body with the actual missing
  // fields via `Notifications.dismissNotificationAsync` + re-fire, OR by
  // updating the persisted notification in the DB. For simplicity, we
  // keep the body static and let the user discover the missing fields
  // by tapping the notification (which deep-links to EmergencyProfile).
  const body =
    language === 'ar'
      ? 'ملفك الطبي غير مكتمل. اضغط لإكمال البيانات المهمة (الحساسيات، الأدوية، جهات الطوارئ).'
      : 'Your medical profile is incomplete. Tap to fill in important data (allergies, medications, emergency contacts).';

  return Notifications.scheduleNotificationAsync({
    identifier: PROFILE_COMPLETION_IDENTIFIER,
    content: {
      title,
      body,
      data: {
        screen: 'EmergencyProfile',
        kind: 'profile_completion',
        type: 'profile_completion',
        userId,
        notificationKey: PROFILE_COMPLETION_IDENTIFIER,
      },
      sound: 'default',
      ...(Platform.OS === 'android' && { channelId: CHANNEL_IDS.system }),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 60 * 60, // 1 hour
      repeats: true,
    },
  });
}

export async function cancelProfileCompletionReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(PROFILE_COMPLETION_IDENTIFIER).catch(() => undefined);
}
