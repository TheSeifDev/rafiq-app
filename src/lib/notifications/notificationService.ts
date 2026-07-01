/**
 * Local + Remote Notification Service for Rafiq.
 *
 * ✅ Local scheduling works in Expo Go via scheduleNotificationAsync().
 * ✅ Remote push guarded: skipped in Expo Go, active in production.
 * ✅ Expo Go uses TIME_INTERVAL triggers (reliable one-shot → re-scheduled on delivery).
 * ✅ Production uses DAILY repeating triggers.
 */
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { NotificationPrefs } from '../../store/app.store';

// ─── Environment detection ──────────────────────────────────
export const IS_EXPO_GO = Constants.appOwnership === 'expo';

// NOTE: setNotificationHandler is set in notificationPipeline.ts to avoid duplicate registration.

// ─── Permission (local only — no token) ─────────────────────

export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// ─── Android channel ────────────────────────────────────────

export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('medications', {
    name: 'Medication Reminders',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#00C2FF',
    sound: 'default',
  });
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
  | 'NotificationSettings';

export type LocalNotificationKind =
  | 'medication_reminder'
  | 'med_low_stock'
  | 'med_missed_check'
  | 'vitals_alert'
  | 'chat_message'
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

  // Ensure channel exists on Android
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
      ...(Platform.OS === 'android' && { channelId: 'medications' }),
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
          // Production: proper DAILY repeating trigger
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour,
          minute,
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

  return Notifications.scheduleNotificationAsync({
    identifier: params.identifier,
    content: {
      title: params.title,
      body: params.body,
      data: {
        screen: params.screen ?? 'NotificationCenter',
        kind: params.kind ?? 'general',
        type: params.kind ?? 'general',
        ...(params.data ?? {}),
      },
      sound: 'default',
      ...(Platform.OS === 'android' && { channelId: params.channelId ?? 'medications' }),
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
