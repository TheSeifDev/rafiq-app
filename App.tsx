import React, { useEffect } from 'react';
import 'react-native-get-random-values';
import { LogBox, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as Localization from 'expo-localization';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useAppStore } from './src/store/app.store';
import { linking } from './src/navigation/linking';
import { useAuthStore } from './src/store/auth.store';
import { initNotificationsOnce } from './src/lib/notifications/medicationReminders';
import { navigationRef } from './src/navigation/MainNavigator';
import { initializeNotificationChannels } from './src/lib/notifications/notificationPipeline';
import {
  scheduleProfileCompletionReminder,
  cancelProfileCompletionReminder,
  PROFILE_COMPLETION_IDENTIFIER,
} from './src/lib/notifications/notificationService';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { initMonitoring } from './src/lib/monitoring';

if (Constants.appOwnership === 'expo') {
  Notifications.setAutoServerRegistrationEnabledAsync(false).catch(() => { });
}

LogBox.ignoreLogs([
  'expo-notifications',
  '`expo-notifications` functionality is not fully supported in Expo Go',
]);

function Boot(): React.JSX.Element {
  const initialize = useAuthStore((state) => state.initialize);
  const language = useAppStore((state) => state.language);
  const hydrate = useAppStore((state) => state.hydrate);
  const session = useAuthStore((state) => state.session);

  useEffect(() => {
    initMonitoring();
    hydrate(Localization.getLocales()[0]?.languageCode === 'ar' ? 'ar' : 'en').catch(() => undefined);
    initialize().catch(() => undefined);

    const setupNotifications = async () => {
      await initializeNotificationChannels().catch(console.warn);
      await initNotificationsOnce().catch((e) => console.warn('[Notifications] Init failed:', e));
    };
    setupNotifications();

    // Request required permissions automatically on startup
    const requestPermissions = async () => {
      try {
        // Request notification permission
        const notifStatus = await Notifications.requestPermissionsAsync();
        console.log('[Permissions] Notifications:', notifStatus.status);

        // Request location permission (foreground only)
        try {
          const Location = require('expo-location');
          const locStatus = await Location.requestForegroundPermissionsAsync();
          console.log('[Permissions] Location:', locStatus.status);
        } catch (locErr) {
          console.warn('[Permissions] expo-location not available:', locErr);
        }
      } catch (err) {
        console.warn('[Permissions] Failed to request:', err);
      }
    };
    // Delay permission requests slightly to avoid blocking app startup
    setTimeout(requestPermissions, 2000);
  }, [hydrate, initialize]);

  // ─── Hourly profile-completion reminder ────────────────────────────
  //
  // FIX: User explicitly requested "رساله تاكد كل ساعه من ملئ جميع البيانات"
  // (an hourly reminder that checks all data is filled). The old in-app modal
  // only fired when AppState === 'active' and was dismissable forever. This
  // schedules a proper local notification (visible in system tray even when
  // the app is killed) that repeats every hour and prompts the user to
  // complete their medical profile. We re-schedule on language change and
  // cancel on logout.
  useEffect(() => {
    if (!session?.user?.id) {
      cancelProfileCompletionReminder().catch(() => undefined);
      return;
    }
    scheduleProfileCompletionReminder({
      language: language === 'ar' ? 'ar' : 'en',
      userId: session.user.id,
    }).catch((e) => console.warn('[ProfileReminder] schedule failed:', e));

    // Listener: when the notification is delivered, optionally re-validate
    // and dismiss if the profile is complete. (Best-effort; non-fatal.)
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data ?? {};
      if (data?.kind !== 'profile_completion' && data?.notificationKey !== PROFILE_COMPLETION_IDENTIFIER) {
        return;
      }
      // Profile completeness is checked by ProfileCompletionReminder component
      // in MainNavigator when the user taps the notification. The notification
      // itself is left visible so the user can act on it.
    });
    return () => sub.remove();
  }, [session?.user?.id, language]);

  const isRTL = language === 'ar';

  return (
    <View style={{ flex: 1, direction: isRTL ? 'rtl' : 'ltr' }}>
      <RootNavigator />
    </View>
  );
}

export default function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <NavigationContainer ref={navigationRef} linking={linking}>
          <Boot />
        </NavigationContainer>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
