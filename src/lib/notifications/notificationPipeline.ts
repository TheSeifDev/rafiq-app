/**
 * RAFIQ Notification Pipeline — Production-Grade Instant Delivery
 *
 * Architecture:
 * - Event-driven from any source (Supabase realtime, backend WebSocket, local events)
 * - All events → notificationService.createNotification() → Supabase + local notification
 * - High-priority Android channel for instant delivery
 * - Foreground service awareness
 * - Exponential retry for failed deliveries
 * - Offline queue with persistence
 */

import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { supabase } from '../supabase'
import type { NotificationPrefs } from '../../store/app.store';
import { createUuid } from '../../local/db';
import { upsertLocal } from '../../local/repository';

// ─── Constants ─────────────────────────────────────────────────────────────

export const PRIORITY_HIGH = Notifications.AndroidImportance.HIGH;
export const PRIORITY_MAX = Notifications.AndroidImportance.MAX;
export const CHANNEL_DEFAULT = 'rafiq_default';
export const CHANNEL_EMERGENCY = 'rafiq_emergency';
export const CHANNEL_MEDICATION = 'rafiq_medication';
export const CHANNEL_HEALTH = 'rafiq_health';
export const CHANNEL_DEVICE = 'rafiq_device';
export const CHANNEL_CHAT = 'rafiq_chat';
export const CHANNEL_SYSTEM = 'rafiq_system';
export const CHANNEL_WEARABLE = 'rafiq_wearable';
export const CHANNEL_FOOD = 'rafiq_food';
export const STORAGE_QUEUE_KEY = 'rafiq_notification_queue_v2';

export type NotificationCategory =
  | 'emergency'
  | 'health'
  | 'medication'
  | 'device'
  | 'chat'
  | 'system'
  | 'food'
  | 'wearable';

export interface NotificationPayload {
  id?: string;
  user_id: string;
  title: string;
  body: string;
  type: string;
  category: NotificationCategory;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  data?: Record<string, unknown>;
  screen?: string;
  source?: 'local' | 'backend' | 'wearable' | 'ai' | 'system';
  created_at?: string;
  is_read?: boolean;
}

// ─── Android Channels ───────────────────────────────────────────────────────

export async function initializeNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;

  const channels = [
    {
      id: CHANNEL_EMERGENCY,
      name: 'Emergency Alerts',
      importance: PRIORITY_MAX,
      vibrationPattern: [0, 500, 200, 500, 200, 500],
      lightColor: '#FF3B3B',
      sound: 'default',
      enableVibrate: true,
      bypassDnd: true,
    },
    {
      id: CHANNEL_HEALTH,
      name: 'Health Alerts',
      importance: PRIORITY_HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#10B981',
      sound: 'default',
      enableVibrate: true,
      bypassDnd: false,
    },
    {
      id: CHANNEL_MEDICATION,
      name: 'Medication Reminders',
      importance: PRIORITY_HIGH,
      vibrationPattern: [0, 250, 125, 250],
      lightColor: '#00C2FF',
      sound: 'default',
      enableVibrate: true,
      bypassDnd: false,
    },
    {
      id: CHANNEL_DEVICE,
      name: 'Device Alerts',
      importance: PRIORITY_HIGH,
      vibrationPattern: [0, 200, 100, 200],
      lightColor: '#F59E0B',
      sound: 'default',
      enableVibrate: true,
      bypassDnd: false,
    },
    {
      id: CHANNEL_WEARABLE,
      name: 'Wearable Alerts',
      importance: PRIORITY_HIGH,
      vibrationPattern: [0, 200, 100, 200],
      lightColor: '#8B5CF6',
      sound: 'default',
      enableVibrate: true,
      bypassDnd: false,
    },
    {
      id: CHANNEL_CHAT,
      name: 'Chat Messages',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 100],
      lightColor: '#00C2FF',
      sound: 'default',
      enableVibrate: true,
      bypassDnd: false,
    },
    {
      id: CHANNEL_SYSTEM,
      name: 'System Alerts',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 100],
      lightColor: '#94A3B8',
      sound: 'default',
      enableVibrate: true,
      bypassDnd: false,
    },
    {
      id: CHANNEL_FOOD,
      name: 'Food Alerts',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 100],
      lightColor: '#F97316',
      sound: 'default',
      enableVibrate: true,
      bypassDnd: false,
    },
    {
      id: CHANNEL_DEFAULT,
      name: 'General',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 100],
      lightColor: '#00C2FF',
      sound: 'default',
      enableVibrate: true,
      bypassDnd: false,
    },
  ] as const;

  for (const channel of channels) {
    try {
      await Notifications.setNotificationChannelAsync(channel.id as string, {
        name: channel.name as string,
        importance: channel.importance as number,
        vibrationPattern: [...channel.vibrationPattern],
        lightColor: channel.lightColor as string,
        sound: channel.sound as string,
        enableVibrate: channel.enableVibrate as boolean,
        bypassDnd: (channel as any).bypassDnd ?? false,
      });
    } catch (err) {
      console.warn(`[NotificationChannels] Failed to set channel ${channel.id}:`, err);
    }
  }

  // Register medication action category (works in Expo Go — local only)
  try {
    await Notifications.setNotificationCategoryAsync('MEDICATION_REMINDER', [
      {
        identifier: 'TAKEN',
        buttonTitle: '✅ أخذت الدواء',
        options: { opensAppToForeground: false },
      },
      {
        identifier: 'SNOOZE_5MIN',
        buttonTitle: '⏰ بعد 5 دقائق',
        options: { opensAppToForeground: false },
      },
    ]);
  } catch (err) {
    console.warn('[NotificationChannels] Failed to set MEDICATION_REMINDER category:', err);
  }
}

// ─── Global Handler (instant response) ─────────────────────────────────────

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as Record<string, unknown> | undefined;
    const category = data?.category as NotificationCategory | undefined;

    // Emergency alerts always show even when app is in foreground
    const isEmergency = category === 'emergency' || data?.severity === 'critical';

    return {
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldBeSilenced: !isEmergency && data?.silent === true,
    };
  },
  // NOTE: handleSuccess and handleError are NOT valid in expo-notifications SDK 53+
  // They were removed from the API. Delivery tracking is done via the queue.
});

// ─── Medication Action Button Handler ────────────────────────────────────────
// Handles TAKEN and SNOOZE_5MIN action buttons on medication reminders.
// Registered once here so it works even when the app is in background.

Notifications.addNotificationResponseReceivedListener(async (response) => {
  const data = response.notification.request.content.data as Record<string, unknown> | undefined;
  const type = data?.type as string | undefined;
  const medicationId = data?.medicationId as string | undefined;
  const actionId = response.actionIdentifier;

  // Only handle medication reminders with action buttons
  if (type !== 'medication_reminder' || !medicationId) return;

  if (actionId === 'TAKEN') {
    // Mark dose taken in SQLite (via medication service lazy import)
    try {
      const { medicationService } = require('../../services/medication.service') as typeof import('../../services/medication.service');
      await medicationService.markDoseTaken(medicationId);
    } catch (err) {
      console.warn('[MedAction] markDoseTaken failed:', err);
    }
    // Dismiss this notification
    try {
      await Notifications.dismissNotificationAsync(response.notification.request.identifier);
    } catch { /* ignore */ }

  } else if (actionId === 'SNOOZE_5MIN') {
    // Re-schedule 5 minutes later with same content
    try {
      const src = response.notification.request.content;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: src.title ?? undefined,
          subtitle: src.subtitle ?? undefined,
          body: src.body ?? undefined,
          data: (src.data as Record<string, unknown>) ?? {},
          sound: (src.sound as 'default' | undefined) ?? 'default',
          // Re-attach categoryIdentifier so action buttons persist
          categoryIdentifier: 'MEDICATION_REMINDER',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 300, // 5 minutes
        },
      });
    } catch (err) {
      console.warn('[MedAction] snooze reschedule failed:', err);
    }
    try {
      await Notifications.dismissNotificationAsync(response.notification.request.identifier);
    } catch { /* ignore */ }
  }
});

// ─── Queue Management ────────────────────────────────────────────────────────

let isProcessingQueue = false;

interface QueuedNotification {
  id: string;
  payload: NotificationPayload;
  attempts: number;
  nextRetry: number;
  createdAt: number;
}

async function getQueue(): Promise<QueuedNotification[]> {
  const raw = await AsyncStorage.getItem(STORAGE_QUEUE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as QueuedNotification[];
  } catch {
    return [];
  }
}

async function saveQueue(queue: QueuedNotification[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_QUEUE_KEY, JSON.stringify(queue));
}

export async function enqueueNotification(payload: NotificationPayload): Promise<string> {
  const queue = await getQueue();
  const id = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const queued: QueuedNotification = {
    id,
    payload,
    attempts: 0,
    nextRetry: Date.now(),
    createdAt: Date.now(),
  };
  queue.push(queued);
  await saveQueue(queue);

  // Attempt immediate delivery
  processQueue();

  return id;
}

export async function processQueue(): Promise<void> {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  try {
    const queue = await getQueue();
    const now = Date.now();
    const maxAttempts = 5;
    const baseDelay = 5000; // 5 seconds

    const pending = queue.filter(q => q.attempts < maxAttempts && q.nextRetry <= now);
    const failed = queue.filter(q => q.attempts >= maxAttempts);

    // Save failed to dead letter for manual review
    if (failed.length > 0) {
      await saveDeadLetter(failed);
    }

    const active = queue.filter(q => q.attempts < maxAttempts);

    for (const item of pending) {
      try {
        await deliverNotification(item.payload);
        item.attempts = maxAttempts; // Mark as complete
      } catch (err) {
        item.attempts += 1;
        item.nextRetry = now + baseDelay * Math.pow(2, item.attempts); // Exponential backoff
        console.warn(`[Queue] Retry ${item.attempts}/${maxAttempts} for ${item.id}`);
      }
    }

    await saveQueue(active.filter(q => q.attempts < maxAttempts));
  } finally {
    isProcessingQueue = false;
  }
}

async function markAsDelivered(notificationId: string): Promise<void> {
  const queue = await getQueue();
  const updated = queue.filter(q => q.id !== notificationId);
  await saveQueue(updated);
}

async function requeueFailed(notificationId: string): Promise<void> {
  const queue = await getQueue();
  const item = queue.find(q => q.id === notificationId);
  if (item && item.attempts < 5) {
    item.attempts += 1;
    item.nextRetry = Date.now() + 5000 * Math.pow(2, item.attempts);
    await saveQueue(queue);
    processQueue();
  }
}

const DEAD_LETTER_KEY = 'rafiq_notification_dead_letter';
async function saveDeadLetter(items: QueuedNotification[]): Promise<void> {
  if (items.length === 0) return;
  const raw = await AsyncStorage.getItem(DEAD_LETTER_KEY);
  let dead: QueuedNotification[] = [];
  if (raw) {
    try { dead = JSON.parse(raw) as QueuedNotification[]; } catch { dead = []; }
  }
  dead.push(...items);
  // Keep only last 100
  if (dead.length > 100) dead = dead.slice(-100);
  await AsyncStorage.setItem(DEAD_LETTER_KEY, JSON.stringify(dead));
}

// ─── Core Delivery ───────────────────────────────────────────────────────────

export async function deliverNotification(payload: NotificationPayload): Promise<string> {
  const { user_id, title, body, type, category, severity, data, screen, source } = payload;

  // 1. Persist locally first. Background sync will push to Supabase.
  const inserted = await upsertLocal('notifications', {
    id: payload.id ?? createUuid(),
    user_id,
    title,
    body,
    type,
    category,
    severity: severity ?? 'medium',
    data: data ?? {},
    screen: screen ?? 'NotificationCenter',
    source: source ?? 'local',
    is_read: false,
    is_pinned: severity === 'critical',
    idempotency_key: `${type}:${category}:${user_id}:${JSON.stringify(data ?? {})}:${title}`,
  }, {
    userId: user_id,
    priority: severity === 'critical' || category === 'emergency' ? 'critical' : 'normal',
  });

  // 2. Fire local push notification immediately
  await fireLocalNotification({
    title,
    body,
    data: {
      notificationId: inserted.id,
      category,
      severity,
      type,
      screen: screen ?? 'NotificationCenter',
      ...data,
    },
    category,
  });

  // FIX (P2-10): Wire in the reliability system so delivery is tracked and
  // pending deliveries can be verified. Previously the receipt-tracking code
  // in notificationReliability.ts was architecturally orphaned — never called.
  try {
    const { createReliableReceipt, markDelivered, verifyPendingDeliveries } =
      await import('./notificationReliability');
    await createReliableReceipt(inserted.id, payload);
    await markDelivered(inserted.id);
    // Verify pending deliveries 30s later (best-effort, non-blocking).
    setTimeout(() => {
      verifyPendingDeliveries().catch((err) =>
        console.warn('[Pipeline] verifyPendingDeliveries failed:', err)
      );
    }, 30_000);
  } catch (err) {
    // Non-fatal — reliability tracking is best-effort.
    console.warn('[Pipeline] reliability tracking failed (non-fatal):', err);
  }

  return inserted.id;
}

export async function fireLocalNotification(params: {
  title: string;
  body: string;
  data: Record<string, unknown>;
  category: NotificationCategory;
  identifier?: string;
  seconds?: number;
}): Promise<string> {
  const { title, body, data, category, identifier, seconds = 1 } = params;

  // Determine channel based on category
  const channelMap: Record<NotificationCategory, string> = {
    emergency: CHANNEL_EMERGENCY,
    health: CHANNEL_HEALTH,
    medication: CHANNEL_MEDICATION,
    device: CHANNEL_DEVICE,
    chat: CHANNEL_CHAT,
    system: CHANNEL_SYSTEM,
    food: CHANNEL_FOOD,
    wearable: CHANNEL_WEARABLE,
  };

  const channelId = channelMap[category] || CHANNEL_DEFAULT;
  const isCritical = category === 'emergency' || data?.severity === 'critical';

  // Android high priority (importance only, priority was removed)
  const androidConfig = isCritical
    ? { channelId, importance: PRIORITY_MAX }
    : { channelId, importance: PRIORITY_HIGH };

  return Notifications.scheduleNotificationAsync({
    identifier: identifier ?? `notif_${Date.now()}`,
    content: {
      title,
      body,
      data,
      sound: 'default',
      ...(Platform.OS === 'android' && androidConfig),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: Math.max(1, seconds),
    },
  });
}

// ─── Convenience Methods ─────────────────────────────────────────────────────

export async function notifyEmergency(params: {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}): Promise<string> {
  return enqueueNotification({
    user_id: params.userId,
    title: params.title,
    body: params.body,
    type: 'emergency_alert',
    category: 'emergency',
    severity: 'critical',
    data: params.data,
    screen: 'Emergency',
    source: 'system',
  });
}

export async function notifyHealth(params: {
  userId: string;
  title: string;
  body: string;
  severity?: 'low' | 'medium' | 'high';
  data?: Record<string, unknown>;
}): Promise<string> {
  return enqueueNotification({
    user_id: params.userId,
    title: params.title,
    body: params.body,
    type: 'health_alert',
    category: 'health',
    severity: params.severity ?? 'medium',
    data: params.data,
    screen: 'Vitals',
    source: 'wearable',
  });
}

export async function notifyMedication(params: {
  userId: string;
  title: string;
  body: string;
  medicationId?: string;
  data?: Record<string, unknown>;
}): Promise<string> {
  return enqueueNotification({
    user_id: params.userId,
    title: params.title,
    body: params.body,
    type: 'medication_reminder',
    category: 'medication',
    severity: 'medium',
    data: { medicationId: params.medicationId, ...params.data },
    screen: 'Medications',
    source: 'system',
  });
}

export async function notifyDevice(params: {
  userId: string;
  title: string;
  body: string;
  deviceId?: string;
  data?: Record<string, unknown>;
}): Promise<string> {
  return enqueueNotification({
    user_id: params.userId,
    title: params.title,
    body: params.body,
    type: 'device_alert',
    category: 'device',
    severity: 'medium',
    data: { deviceId: params.deviceId, ...params.data },
    screen: 'Home',
    source: 'system',
  });
}

export async function notifyWearable(params: {
  userId: string;
  title: string;
  body: string;
  vitalType?: string;
  value?: string;
  data?: Record<string, unknown>;
}): Promise<string> {
  return enqueueNotification({
    user_id: params.userId,
    title: params.title,
    body: params.body,
    type: 'wearable_alert',
    category: 'wearable',
    severity: 'medium',
    data: { vitalType: params.vitalType, value: params.value, ...params.data },
    screen: 'Vitals',
    source: 'wearable',
  });
}

export async function notifyGasAlert(params: {
  userId: string;
  title: string;
  body: string;
  level?: string;
  location?: string;
}): Promise<string> {
  return enqueueNotification({
    user_id: params.userId,
    title: params.title,
    body: params.body,
    type: 'gas_alert',
    category: 'device',
    severity: 'critical',
    data: { level: params.level, location: params.location },
    screen: 'Home',
    source: 'system',
  });
}

export async function notifyFallDetection(params: {
  userId: string;
  title: string;
  body: string;
  location?: string;
  timestamp?: string;
}): Promise<string> {
  return enqueueNotification({
    user_id: params.userId,
    title: params.title,
    body: params.body,
    type: 'fall_detection',
    category: 'emergency',
    severity: 'critical',
    data: { location: params.location, timestamp: params.timestamp },
    screen: 'Emergency',
    source: 'wearable',
  });
}

export async function notifyWearableDisconnect(params: {
  userId: string;
  deviceName?: string;
}): Promise<string> {
  return enqueueNotification({
    user_id: params.userId,
    title: params.userId ? (params.deviceName ? `Wearable disconnected: ${params.deviceName}` : 'Wearable Disconnected') : 'Wearable Disconnected',
    body: params.userId ? 'Smartwatch connection lost. Please check the device.' : 'Smartwatch connection lost. Please check the device.',
    type: 'wearable_disconnect',
    category: 'wearable',
    severity: 'medium',
    data: { deviceName: params.deviceName },
    screen: 'Vitals',
    source: 'system',
  });
}

export async function notifyAIWarning(params: {
  userId: string;
  title: string;
  body: string;
  insightType?: string;
}): Promise<string> {
  return enqueueNotification({
    user_id: params.userId,
    title: params.title,
    body: params.body,
    type: 'ai_warning',
    category: 'health',
    severity: 'medium',
    data: { insightType: params.insightType },
    screen: 'Chat',
    source: 'ai',
  });
}

export async function notifyFoodAlert(params: {
  userId: string;
  title: string;
  body: string;
  foodName?: string;
  reason?: string;
}): Promise<string> {
  return enqueueNotification({
    user_id: params.userId,
    title: params.title,
    body: params.body,
    type: 'food_alert',
    category: 'food',
    severity: 'low',
    data: { foodName: params.foodName, reason: params.reason },
    screen: 'Food',
    source: 'ai',
  });
}

// ─── Supabase Realtime Subscription ─────────────────────────────────────────

export function subscribeToNotifications(
  userId: string,
  onNotification: (notification: any) => void
): () => void {
  const channel = supabase
    .channel(`notifications:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        // Fire local notification for backend-originated notifications
        const notif = payload.new;
        if (notif.category) {
          fireLocalNotification({
            title: notif.title,
            body: notif.body,
            data: {
              notificationId: notif.id,
              category: notif.category,
              severity: notif.severity,
              type: notif.type,
              screen: notif.screen ?? 'NotificationCenter',
            },
            category: notif.category,
          });
        }
        onNotification(payload.new);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// ─── Permission ─────────────────────────────────────────────────────────────

export async function ensureNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function getChannelForCategory(category: NotificationCategory): string {
  const map: Record<NotificationCategory, string> = {
    emergency: CHANNEL_EMERGENCY,
    health: CHANNEL_HEALTH,
    medication: CHANNEL_MEDICATION,
    device: CHANNEL_DEVICE,
    chat: CHANNEL_CHAT,
    system: CHANNEL_SYSTEM,
    food: CHANNEL_FOOD,
    wearable: CHANNEL_WEARABLE,
  };
  return map[category] || CHANNEL_DEFAULT;
}
