import { I18nManager } from 'react-native';
import * as Localization from 'expo-localization';

// ─── Step 1: Lock RTL direction ONCE at startup ─────────────
const deviceIsArabic = Localization.getLocales()[0]?.languageCode === 'ar';
I18nManager.allowRTL(true);
I18nManager.forceRTL(deviceIsArabic);

// ─── Step 2: Suppress Expo Go SDK warnings ──────────────────
// eslint-disable-next-line @typescript-eslint/no-var-requires
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

  // Restore after a tick (all module-level side-effects will have fired)
  setTimeout(() => {
    console.error = _err;
    console.warn = _warn;
  }, 0);
}

// ─── Step 3: Global Crash Reporting ─────────────────────────
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
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    AsyncStorage.setItem(CRASH_LOG_KEY, JSON.stringify(report)).catch(() => {
      // Storage might not be ready — that's OK
    });
  } catch {
    // require might fail in some edge cases
  }
}

// نصل للـ ErrorUtils من الـ Global Scope مباشرة في وقت التنفيذ
// ولا نستخدم import لأن الـ Module System لم يكتمل تحميله بعد في هذه المرحلة المبكرة
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ErrorUtilsGlobal = (globalThis as any).ErrorUtils;

if (typeof ErrorUtilsGlobal !== 'undefined' && ErrorUtilsGlobal !== null) {
  ErrorUtilsGlobal.setGlobalHandler((error: Error, isFatal?: boolean) => {
    saveCrashReport(error, isFatal ? 'FATAL' : 'NON-FATAL');
  });
}

// ─── Step 4: Register the app ───────────────────────────────
import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);