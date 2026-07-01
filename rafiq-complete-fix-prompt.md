# Rafiq App — Complete Fix Prompt

> Copy the code block below and paste it into your AI coding assistant (Cursor, Claude, ChatGPT, etc.) along with your codebase.

---

```
You are fixing a React Native (Expo SDK 54) health app called "Rafiq". SQLite local + Supabase remote. Runs in Expo Go (NOT a development build — NO remote push notifications).

There are 14 fixes. Fix ALL of them in the PRIORITY ORDER listed.

CRITICAL CONSTRAINTS:
- App runs in Expo Go → NO registerForPushNotificationsAsync, NO getExpoPushTokenAsync → ONLY local Notifications.scheduleNotificationAsync()
- EXPO_PUBLIC_OPENROUTER_API_KEY is FREE TIER → aggressive rate limits → handle 429 gracefully
- All user-facing text MUST be in Arabic
- Patient IDs stored in SQLite MUST be raw UUIDs (no prefix) for Supabase uuid columns

---

## FIX 1 — SQLite Missing Columns (EmergencyProfile Save Crash)

**Error:** `NativeDatabase.prepareAsync` rejected → `java.lang.NullPointerException` when saving EmergencyProfile.

**Cause:** `BaseRepository.ts` and `PatientRepository.ts` use columns that don't exist in SQLite schema: `is_deleted`, `deleted_at`, `deleted_by`, `updated_by_device`.

**Fix:**
1. In `src/local/schema.ts`, add to `patients` table: `is_deleted` (INTEGER DEFAULT 0), `updated_by_device` (TEXT nullable), `deleted_by` (TEXT nullable), `deleted_at` (TEXT nullable).
2. In database initialization (src/local/db.ts), BEFORE any queries run, add columns with try/catch per column:
```typescript
const addCol = async (table: string, col: string, type: string, def?: string) => {
  try {
    await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${col} ${type} ${def || ''}`);
  } catch (e) { /* column exists */ }
};
await addCol('patients', 'is_deleted', 'INTEGER', 'DEFAULT 0');
await addCol('patients', 'updated_by_device', 'TEXT');
await addCol('patients', 'deleted_by', 'TEXT');
await addCol('patients', 'deleted_at', 'TEXT');
```
3. Bump schema version.

---

## FIX 2 — Non-UUID Patient IDs Breaking Everything

**Error:** `patientId is not a UUID pat_1778922130541_djtd92q`, `Patient profile not found`, `Sync pushed=0 failed=4`.

**Cause:** Old data has `pat_<timestamp>_<random>` IDs. Even `pat_<uuid>` format is WRONG — Supabase uuid columns need raw UUIDs like `a1b2c3d4-e5f6-7890-abcd-ef1234567890`.

**Fix:**
1. In database initialization, AFTER schema is ready and columns exist (after Fix 1), run:
```typescript
// Migrate non-UUID patient IDs to raw UUIDs
const oldPatients = await db.getAllAsync<{id: string}>(
  "SELECT id FROM patients WHERE id NOT GLOB '*-*-*-*-*'"
);
if (oldPatients.length > 0) {
  await db.execAsync('BEGIN TRANSACTION');
  try {
    for (const p of oldPatients) {
      const newId = crypto.randomUUID();
      // Update ALL tables referencing patient_id
      const tables = ['patients','medications','vitals','patient_conditions','emergency_contacts'];
      for (const t of tables) {
        try { await db.runAsync(`UPDATE ${t} SET patient_id = ? WHERE patient_id = ?`, [newId, p.id]); } catch(e) {}
      }
      // Update AsyncStorage and in-memory state
      const stored = await AsyncStorage.getItem('currentPatientId');
      if (stored === p.id) {
        await AsyncStorage.setItem('currentPatientId', newId);
        // Update your auth store's currentPatientId state variable too
      }
    }
    await db.execAsync('COMMIT');
  } catch (e) { await db.execAsync('ROLLBACK'); throw e; }
}
```
2. Change `generateId()` in `src/lib/database/helpers.ts` to return raw UUIDs:
```typescript
export function generateId(prefix?: string): string {
  return crypto.randomUUID(); // Always raw UUID, no prefix
}
```
3. Extract `isUuid()` from `medication.service.ts` to `src/lib/utils/isUuid.ts` and import everywhere.

---

## FIX 3 — patient_conditions Table Schema Wrong

**Cause:** Table has `condition_key`, `custom_note` but `PatientConditionRepository` expects `condition_name`, `severity`, `diagnosed_date`, `notes`, `is_active`.

**Fix:**
1. In db.ts, drop and recreate:
```typescript
await db.execAsync('DROP TABLE IF EXISTS patient_conditions');
await db.execAsync(`CREATE TABLE patient_conditions (
  id TEXT PRIMARY KEY, patient_id TEXT NOT NULL,
  condition_name TEXT NOT NULL, severity TEXT,
  diagnosed_date TEXT, notes TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
)`);
```
2. Update `TABLE_COLUMNS` in `src/local/repository.ts` to match.

---

## FIX 4 — Vitals & Other Services Missing UUID Guard

**Fix:** Add `isUuid()` guard before EVERY Supabase call in: `vitals.service.ts`, `vitals-reading.service.ts`, `condition.service.ts`, `emergency-contact.service.ts`, `chat.service.ts`. If not UUID → local SQLite only.

---

## FIX 5 — AI 429 Rate Limit + Missing Models + Unsupported Params

**Errors:** `EXPO_PUBLIC_GROQ_MODEL: missing`, `EXPO_PUBLIC_OPENROUTER_MODEL: missing`, 429 on every AI call.

**Fix:**
1. In `src/config/env.ts`, add fallback defaults:
```typescript
groqModel: process.env.EXPO_PUBLIC_GROQ_MODEL || 'llama-3.3-70b-versatile',
openrouterModel: process.env.EXPO_PUBLIC_OPENROUTER_MODEL || 'meta-llama/llama-3.1-8b-instruct:free',
```
2. Remove `reasoning: { effort: 'high' }` from `AIManager.ts` (free model doesn't support it).
3. In `StreamProcessor.ts` `fetchWithRetry`: if status 429, do NOT retry — throw `RateLimitError` immediately.
4. Create `GroqProvider.ts` following `OpenRouterProvider.ts` pattern, using `EXPO_PUBLIC_GROQ_KEY`.
5. Register GroqProvider as fallback in `manager.ts`.
6. Show Arabic error on 429: "تم تجاوز حد الطلبات، حاول بعد قليل".

---

## FIX 6 — Patient Context Aggregator "Profile Not Found"

**Fix:** After Fixes 1+2 resolve root causes, also:
1. In `ensurePatientRow()`: log actual error, retry once, don't swallow silently.
2. In `PatientContextAggregator.aggregate()`: null check on patient profile, return fallback context instead of throwing.

---

## FIX 7 — Hourly Sync Mechanism (Local SQLite → Supabase)

**Fix:**
1. Add `is_synced` (INTEGER DEFAULT 0) and `synced_at` (TEXT nullable) to ALL data tables via ALTER TABLE (try/catch per column, like Fix 1).
2. In repositories, set `is_synced = 0` on every create/update.
3. Create `src/services/sync.service.ts`:
   - `syncAll()`: query `WHERE is_synced = 0 OR is_synced IS NULL`, upsert to Supabase, mark `is_synced = 1`. Order: patients first. Skip non-UUID patient_id records.
   - `startPeriodicSync()`: `setInterval` every 3600000ms + immediate first call.
   - `stopPeriodicSync()`: clear interval.
   - `syncNow()`: manual trigger with debounce.
4. Start on login, stop on logout. Check network before syncing.

---

## FIX 8 — expo-notifications Error at Startup

**Error:** `expo-notifications: Android Push notifications functionality was removed from Expo Go`

**Fix:** Search ENTIRE codebase for `registerForPushNotificationsAsync`, `getExpoPushTokenAsync`, `getDevicePushTokenAsync`. Wrap ALL in:
```typescript
import Constants from 'expo-constants';
if (Constants.appOwnership !== 'expo') { /* push code */ }
```
Keep `Notifications.setNotificationHandler()` (works in Expo Go). Only remove PUSH-specific registration.

---

## FIX 9 — Save Button on EmergencyProfileScreen.tsx

**Current:** Only a small checkmark icon in header. No visible Save button below the form.

**Fix:** Add full-width "حفظ" button at the BOTTOM of the form content (above bottom tab bar):
```tsx
<View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 100 }}>
  <TouchableOpacity style={{ backgroundColor: '#0d9488', borderRadius: 12, paddingVertical: 16, alignItems: 'center' }}
    onPress={handleSave} disabled={isSaving}>
    {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>حفظ</Text>}
  </TouchableOpacity>
</View>
```
handleSave: validate → save to SQLite → show "تم الحفظ بنجاح" toast → handle errors gracefully.

---

## FIX 10 — Navigation Bug: Tapping Profile Tab Goes to Home

**Fix:** Find bottom tab navigator config (in `src/navigation/` or `app/(tabs)/_layout.tsx`). The Profile tab redirects to Home because of:
- Incorrect screen registration
- A `useEffect` or auth guard calling `navigation.replace('Home')`
- Wrong `tabPress` listener
Ensure Profile tab navigates to EmergencyProfileScreen. Remove any incorrect redirects.

---

## FIX 11 — Medications with WhatsApp-Style Notification Action Buttons

**Fix:**

**A) Notification categories (register ONCE at app startup):**
```typescript
Notifications.setNotificationCategoryAsync('MEDICATION_REMINDER', [
  { identifier: 'TAKEN', buttonTitle: '✅ أخذت الدواء', options: { opensAppToForeground: false } },
  { identifier: 'SNOOZE_5MIN', buttonTitle: '⏰ بعد 5 دقائق', options: { opensAppToForeground: false } },
]);
```

**B) Schedule medication reminder:**
```typescript
await Notifications.scheduleNotificationAsync({
  content: {
    title: `⏰ حان وقت دواء ${med.name}`,
    body: `الجرعة: ${med.dosage}`,
    data: { medicationId: med.id, type: 'medication_reminder' },
    categoryIdentifier: 'MEDICATION_REMINDER',
  },
  trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: nextDoseTime },
});
```

**C) Handle button presses (register at app root, works in background):**
```typescript
Notifications.addNotificationResponseReceivedListener((response) => {
  const { medicationId, type } = response.notification.request.content.data;
  if (type !== 'medication_reminder') return;
  if (response.actionIdentifier === 'TAKEN') {
    // Mark dose taken in SQLite, decrement stock, schedule next dose
    Notifications.dismissNotificationAsync(response.notification.request.identifier);
  } else if (response.actionIdentifier === 'SNOOZE_5MIN') {
    // Reschedule 5 min later
    Notifications.scheduleNotificationAsync({
      content: response.notification.request.content,
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(Date.now() + 300000) },
    });
    Notifications.dismissNotificationAsync(response.notification.request.identifier);
  }
});
```

**D) Foreground handler:**
```typescript
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }),
});
```

**E) On app restart:** query active medications, calculate next dose times, schedule notifications.

**F) DO NOT use any push notification APIs. Only scheduleNotificationAsync.**

---

## FIX 12 — Emergency Page: ALL Egyptian Emergency Numbers

**Current:** Only 4 numbers. Replace with complete list grouped by category:

```typescript
const EGYPTIAN_EMERGENCY_NUMBERS = [
  // الطوارئ العامة
  { number: '112', name: 'الطوارئ العامة', category: 'general', color: '#ef4444' },
  { number: '123', name: 'الشرطة', category: 'general', color: '#eab308' },
  // الخدمات الطبية
  { number: '125', name: 'الإسعاف', category: 'medical', color: '#ef4444' },
  { number: '126', name: 'المطافئ', category: 'medical', color: '#f97316' },
  { number: '153', name: 'المرور', category: 'medical', color: '#3b82f6' },
  { number: '920033333', name: 'الخط الصحي', category: 'medical', color: '#06b6d4' },
  { number: '37717173', name: 'مركز السموم', category: 'medical', color: '#dc2626' },
  { number: '23624543', name: 'إسعاف القاهرة', category: 'medical', color: '#ef4444' },
  { number: '27928585', name: 'إسعاف الجيزة', category: 'medical', color: '#ef4444' },
  { number: '25240054', name: 'إسعاف حلوان', category: 'medical', color: '#ef4444' },
  // خطوط المساعدة
  { number: '16000', name: 'المجلس الطبي العام', category: 'helpline', color: '#8b5cf6' },
  { number: '15555', name: 'صيدلية', category: 'helpline', color: '#10b981' },
  { number: '15000', name: 'مكافحة الإدمان', category: 'helpline', color: '#6366f1' },
  { number: '109', name: 'خط نجدة الطفولة', category: 'helpline', color: '#f472b6' },
  { number: '15200', name: 'نجدة المرأة', category: 'helpline', color: '#ec4899' },
  { number: '28007777', name: 'التأمين الصحي', category: 'helpline', color: '#14b8a6' },
  // المرافق
  { number: '121', name: 'الغاز', category: 'utility', color: '#f97316' },
  { number: '128', name: 'مياه الشرب', category: 'utility', color: '#0ea5e9' },
  { number: '122', name: 'الكهرباء', category: 'utility', color: '#eab308' },
  { number: '129', name: 'الصرف الصحي', category: 'utility', color: '#64748b' },
  { number: '19888', name: 'النظافة', category: 'utility', color: '#78716c' },
];
```
Display grouped by category. Each has "اتصال" button using `Linking.openURL('tel:NUMBER')`.
Keep SOS button + Share Location at top. Keep user Emergency Contacts at bottom.

---

## FIX 13 — Share My Location Not Working

**Fix:**
```typescript
import * as Location from 'expo-location';
import { Share, Alert } from 'react-native';

const handleShareLocation = async () => {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') { Alert.alert('خطأ', 'يرجى السماح بالوصول إلى الموقع'); return; }
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    const { latitude, longitude } = loc.coords;
    const url = `https://www.google.com/maps?q=${latitude},${longitude}`;
    await Share.share({ message: `🚨 موقعي الحالي للطوارئ\n\n📍 ${url}`, url });
  } catch (e) {
    Alert.alert('خطأ', 'تعذر تحديد الموقع، تأكد من تفعيل GPS');
  }
};
```

---

## FIX 14 — Missing Env Var Defaults

**Logs:** `EXPO_PUBLIC_GROQ_MODEL: missing`, `EXPO_PUBLIC_OPENROUTER_MODEL: missing`

**Fix:** Already covered in Fix 5 — add fallback defaults in `env.ts`. Verify no code reads `process.env.EXPO_PUBLIC_GROQ_MODEL` directly — all must go through the `env` config object.

---

## PRIORITY ORDER
1. Fix 1 (SQLite columns) → 2. Fix 2 (UUID migration) → 3. Fix 3 (patient_conditions) → 4. Fix 8 (expo-notifications error) → 5. Fix 14 (env defaults) → 6. Fix 4 (UUID guards) → 7. Fix 5 (AI 429) → 8. Fix 6 (patient context) → 9. Fix 7 (sync) → 10. Fix 9 (save button) → 11. Fix 10 (navigation) → 12. Fix 13 (share location) → 13. Fix 12 (emergency numbers) → 14. Fix 11 (medications + notifications)
```

---

| # | Fix | Severity |
|---|-----|----------|
| 1 | SQLite missing columns (save crash) | 🔴 Critical |
| 2 | Non-UUID patient IDs | 🔴 Critical |
| 3 | patient_conditions schema wrong | 🔴 Critical |
| 4 | UUID guards on all services | 🟠 High |
| 5 | AI 429 + missing models | 🔴 Critical |
| 6 | Patient context aggregator | 🔴 Critical |
| 7 | Hourly sync mechanism | 🔴 Critical |
| 8 | expo-notifications startup error | 🟠 High |
| 9 | Save button on EmergencyProfile | 🟡 Medium |
| 10 | Navigation bug (→Home) | 🟠 High |
| 11 | Medications + notification action buttons | 🔴 Critical |
| 12 | All Egyptian emergency numbers | 🟡 Medium |
| 13 | Share My Location | 🟠 High |
| 14 | Missing env var defaults | 🟡 Medium |