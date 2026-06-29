# Architecture Audit Report

**Generated automatically by Claude Code**

---

## 1. Existing Patient Models
- **Interface**: `Patient` (src/types/database.ts) – includes basic demographics, JSONB fields for address, reporter, hospital.
- **SQLite Table**: `patients` (src/local/schema.ts). Stores the same columns; JSON columns (`address_data`, `reporter_data`, `hospital_data`).
- **Repository**: `PatientRepository` (src/repositories/PatientRepository.ts) – CRUD for patient rows.
- **Service**: `patient.service.ts` (src/services/patient.service.ts) – high‑level patient operations.
- **Status**: **Exists** (full implementation, used throughout the app).

---

## 2. Existing Medication Models
- **Interface**: `Medication` & `MedicationInsert` (src/types/database.ts) – detailed medication record.
- **Health Context Interface**: `MedicationInfo` (src/lib/ai/orchestration/HealthContextEngine.ts) – used for AI context.
- **SQLite Table**: `medications` & `medication_logs` (src/local/schema.ts).
- **Repository**: `MedicationRepository` (src/repositories/MedicationRepository.ts).
- **Service**: `medication.service.ts` (src/services/medication.service.ts) – schedule, reminders, CRUD.
- **Status**: **Exists** (complete).

---

## 3. Existing Allergy Models
- **Database Column**: `allergies TEXT` in the `patients` table (src/local/schema.ts) – free‑form list.
- **Interface**: None dedicated; allergies are accessed via the `Patient` interface as a string field.
- **Repository / Service**: No separate repository/service; allergy data is read/written through the patient repo/service.
- **Status**: **Partial** – represented as a column on the patient record, no dedicated model or table.

---

## 4. Existing Nutrition Models
- **Health Context Interface**: `FoodLogEntry` (src/lib/ai/orchestration/HealthContextEngine.ts) – used only for AI insights.
- **SQLite / Supabase**: No dedicated `food_logs` or nutrition tables in the schema.
- **Screens**: `FoodScreen.tsx` (src/screens/FoodScreen.tsx) – UI exists but data storage is not defined.
- **Status**: **Missing** – UI present, but no persistent model/table.

---

## 5. Existing Emergency Models
- **Interface**: `EmergencyContact` (src/types/database.ts) and `EmergencyContactInsert`.
- **SQLite Tables**: `emergency_contacts`, `emergency_events` (src/local/schema.ts).
- **Repository**: `EmergencyContact` handling is within `PatientRepository` (shared) – separate repository not present.
- **Service**: `EmergencyCenter` screens and related services (`src/services/vitals.service.ts` interacts with emergency events).
- **Status**: **Exists** (full tables, basic interfaces, UI screens).

---

## 6. Existing Hospital Models
- **Interface**: `HospitalData` (src/types/database.ts) – stored as JSON in the `patients` table.
- **SQLite Table**: No separate hospital table; data lives inside `patients.hospital_data` JSON column.
- **Status**: **Partial** – hospital information exists but only as embedded JSON on the patient record.

---

## 7. Existing AI Chat Models
- **Hook**: `useAICHat` (src/lib/ai/hooks/useAICHat.ts) – provides chat UI and persistence.
- **Manager**: `AIManager` (src/lib/ai/orchestration/AIManager.ts) – orchestration, reasoning state, health context.
- **Health Context Engine**: `HealthContextEngine` (src/lib/ai/orchestration/HealthContextEngine.ts) – structures AI prompt and insights.
- **Memory Persistence**: AsyncStorage (`@react-native-async-storage/async-storage`) stores chat history.
- **Status**: **Exists** (fully functional chat pipeline).

---

## 8. Existing Memory Systems
- **Local SQLite**: All patient‑centric data stored in `src/local/schema.ts` and accessed via `src/local/db.ts`.
- **AsyncStorage**: Used by `useAICHat` for chat history and by `AIManager` for reasoning state.
- **Supabase**: Remote sync client in `src/lib/supabase.ts` (and thin wrapper in `src/services/supabase.ts`).
- **Status**: **Exists** (multiple layers – SQLite, AsyncStorage, Supabase).

---

## 9. Existing SQLite Tables
| Table | File (definition) |
|-------|-------------------|
| `schema_migrations` | src/local/schema.ts |
| `profiles` | src/local/schema.ts |
| `patients` | src/local/schema.ts |
| `patient_conditions` | src/local/schema.ts |
| `emergency_contacts` | src/local/schema.ts |
| `devices` | src/local/schema.ts |
| `esp32_devices` | src/local/schema.ts |
| `wearables` | src/local/schema.ts |
| `vitals_readings` | src/local/schema.ts |
| `vitals` | src/local/schema.ts |
| `medications` | src/local/schema.ts |
| `medication_logs` | src/local/schema.ts |
| `reminders` | src/local/schema.ts |
| `notifications` | src/local/schema.ts |
| `notification_receipts` | src/local/schema.ts |
| `emergency_events` | src/local/schema.ts |
| `alerts` | src/local/schema.ts |
| `fall_detection_events` | src/local/schema.ts |
| `gas_alerts` | src/local/schema.ts |
| `oxygen_alerts` | src/local/schema.ts |
| `heart_rate_alerts` | src/local/schema.ts |

**Status**: **Exists** – comprehensive schema covering patient data, vitals, devices, alerts, notifications, etc.

---

## 10. Existing Supabase Tables
- Supabase client is instantiated (`src/lib/supabase.ts`).
- No explicit schema files are present in the repo; tables are defined remotely.
- The code interacts with Supabase via `supabase.from(...).select/...` in:
  - `src/local/syncEngine.ts`
  - `src/services/vitals.service.ts`
  - `src/services/medication.service.ts`
  - `src/bootstrap/orchestrator.ts`
- **Status**: **Exists (remote)** – the project expects matching tables on the Supabase instance, but local definitions are not stored in the repo.

---

## 11. Existing Home Screen Components
- **File**: `src/screens/HomeScreen.tsx` – renders the main dashboard.
- **Related UI**: Contains sections for vitals, medication, notifications, and a placeholder for “Today’s Focus”.
- **Status**: **Exists**.

---

## 12. Existing Notification Systems
- **SQLite Table**: `notifications` & `notification_receipts` (src/local/schema.ts).
- **Service**: `notification.service.ts` (src/services/notification.service.ts) – creates, updates, and dispatches notifications.
- **Library**: `src/lib/notifications/` folder provides pipelines, safety checks, and UI helpers (`notificationPipeline.ts`, `notificationSafety.ts`).
- **UI Screens**: `NotificationsScreen.tsx`, `NotificationCenterScreen.tsx`, `NotificationSettingsScreen.tsx` (src/screens/).
- **Status**: **Exists** (full end‑to‑end notification stack).

---

## Summary of Findings
| Domain | Exists | Partial | Missing | Deprecated |
|--------|--------|---------|---------|------------|
| Patient Models | ✅ |   |   |   |
| Medication Models | ✅ |   |   |   |
| Allergy Models |   | ✅ (column only) |   |   |
| Nutrition Models |   |   | ❌ |   |
| Emergency Models | ✅ |   |   |   |
| Hospital Models |   | ✅ (JSON column) |   |   |
| AI Chat Models | ✅ |   |   |   |
| Memory Systems | ✅ |   |   |   |
| SQLite Tables | ✅ |   |   |   |
| Supabase Tables | ✅ (remote) |   |   |   |
| Home Screen | ✅ |   |   |   |
| Notification Systems | ✅ |   |   |   |

All required components for Phase 10 are present **except** a dedicated nutrition model/table. The allergy information is stored as a plain string column on `patients`; no separate table exists.

### Next Steps (Phase 10 Implementation)
1. **Leverage existing patient, medication, emergency, and hospital JSON fields** to build the health context.
2. **Create a thin wrapper** (service function) that aggregates data from SQLite (local) and, if needed, falls back to Supabase.
3. **Reuse** `useAICHat` hook and `AIManager` – extend `initialize` calls to include the freshly built health context.
4. **Add UI** to `HomeScreen.tsx` for the “Today’s Focus” card, consuming the same health‑context builder.
5. **Persist** any new insights (e.g., nutrition) only if a new nutrition table is added in the future; otherwise keep the current model untouched.

*All implementations will reference the file paths, models, services, and tables listed above to avoid duplication.*
