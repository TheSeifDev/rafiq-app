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
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { initMonitoring } from './src/lib/monitoring';

if (Constants.appOwnership === 'expo') {
  Notifications.setAutoServerRegistrationEnabledAsync(false).catch(() => {});
}

LogBox.ignoreLogs([
  'expo-notifications',
  '`expo-notifications` functionality is not fully supported in Expo Go',
]);

function Boot(): React.JSX.Element {
  const initialize = useAuthStore((state) => state.initialize);
  const language = useAppStore((state) => state.language);
  const hydrate = useAppStore((state) => state.hydrate);

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
