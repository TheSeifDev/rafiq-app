/**
 * Notification Permission Service — Production-grade permission handling
 * Handles Android 13+ POST_NOTIFICATIONS permission and notification channels
 */
import * as Notifications from 'expo-notifications';
import { Platform, Linking } from 'react-native';

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

class NotificationPermissionService {
  /**
   * Request notification permissions (iOS + Android)
   */
  async requestPermissions(): Promise<PermissionStatus> {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();

      if (existingStatus === 'granted') {
        await this.ensureAndroidChannel();
        return 'granted';
      }

      const { status } = await Notifications.requestPermissionsAsync();

      if (status === 'granted') {
        await this.ensureAndroidChannel();
        return 'granted';
      }

      return 'denied';
    } catch (error) {
      console.error('[NotificationPermission] Request failed:', error);
      return 'denied';
    }
  }

  /**
   * Check current permission state
   */
  async checkPermissionState(): Promise<PermissionStatus> {
    try {
      const { status } = await Notifications.getPermissionsAsync();

      if (status === 'granted') {
        return 'granted';
      }

      if (status === 'denied') {
        return 'denied';
      }

      return 'undetermined';
    } catch {
      return 'undetermined';
    }
  }

  /**
   * Ensure Android notification channel exists (Android 8+)
   */
  async ensureAndroidChannel(): Promise<void> {
    if (Platform.OS !== 'android') return;

    try {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default Channel',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#6366F1',
        sound: 'default',
        enableVibrate: true,
        enableLights: true,
      });

      await Notifications.setNotificationChannelAsync('medical-alerts', {
        name: 'Medical Alerts',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 500, 250, 500],
        lightColor: '#EF4444',
        sound: 'default',
        enableVibrate: true,
        enableLights: true,
      });

      await Notifications.setNotificationChannelAsync('reminders', {
        name: 'Reminders',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#10B981',
        sound: 'default',
        enableVibrate: true,
        enableLights: true,
      });
    } catch (error) {
      console.error('[NotificationPermission] Channel setup failed:', error);
    }
  }

  /**
   * Open phone notification settings directly
   */
  async openPhoneNotificationSettings(): Promise<void> {
    try {
      await Linking.openSettings();
    } catch (error) {
      console.error('[NotificationPermission] Open settings failed:', error);
    }
  }

  /**
   * Configure notification behavior for Android 13+
   *
   * FIX: This method previously called `Notifications.setNotificationHandler`
   * which DUPLICATES the registration in `notificationPipeline.ts`. Since
   * `setNotificationHandler` overwrites the previous registration, calling
   * this method would silently REPLACE the pipeline's emergency-aware
   * foreground handler (which shows emergency alerts even when the app is
   * foregrounded) with a generic "always show" handler.
   *
   * The method is now a no-op — the canonical handler is in
   * `notificationPipeline.ts:196`. This method is kept only for backward
   * compatibility with any caller that still imports it.
   */
  async configureNotificationBehavior(): Promise<void> {
    // Intentional no-op — see JSDoc above.
    return;
  }
}

export const notificationPermissionService = new NotificationPermissionService();