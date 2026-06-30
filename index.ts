import { I18nManager } from 'react-native';
import * as Localization from 'expo-localization';

const deviceIsArabic = Localization.getLocales()[0]?.languageCode === 'ar';
I18nManager.allowRTL(true);
I18nManager.forceRTL(deviceIsArabic);

const ExpoConstants = require('expo-constants').default as typeof import('expo-constants')['default'];

if (ExpoConstants.appOwnership === 'expo') {
  const _err = console.error;
  const _warn = console.warn;
  const pat = /expo-notifications/;

  console.error = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && pat.test(args[0])) return;
    _err.apply(console, args);
  };
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && pat.test(args[0])) return;
    _warn.apply(console, args);
  };

  setTimeout(() => {
    console.error = _err;
    console.warn = _warn;
  }, 0);
}

const CRASH_LOG_KEY = 'rafiq_crash_report';

function saveCrashReport(error: Error, source: string): void {
  const report = {
    message: error.message,
    stack: error.stack,
    source,
    timestamp: new Date().toISOString(),
    deviceIsArabic,
  };
  console.error(`[CrashReport:${source}]`, error.message);

  try {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    AsyncStorage.setItem(CRASH_LOG_KEY, JSON.stringify(report)).catch(() => {
    });
  } catch {
  }
}

const ErrorUtilsGlobal = (globalThis as any).ErrorUtils;

if (typeof ErrorUtilsGlobal !== 'undefined' && ErrorUtilsGlobal !== null) {
  ErrorUtilsGlobal.setGlobalHandler((error: Error, isFatal?: boolean) => {
    saveCrashReport(error, isFatal ? 'FATAL' : 'NON-FATAL');
  });
}

import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
