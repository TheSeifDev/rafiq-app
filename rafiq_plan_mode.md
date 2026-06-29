# RAFIQ Production Hardening — PLAN MODE

## Context
RAFIQ (رفيق) is an Arabic-first Medical AI Companion (React Native / Expo). It has sophisticated local-first architecture (SQLite + Supabase sync, sensor fusion, AI orchestration) but contains **critical patient safety bugs and security vulnerabilities** preventing production release.

## Your Task
Create a **detailed implementation plan** with:
1. Exact files to modify (with line numbers where known)
2. New files to create
3. Code snippets for critical fixes
4. Dependencies to install
5. Time estimates per task
6. Risk assessment

## Confirmed Issues (Pre-Audited)

### 🔴 CRITICAL
| # | Issue | File | Line | Fix |
|---|-------|------|------|-----|
| C1 | Companion reads wrong AsyncStorage key | `src/services/companionMessage.service.ts` | 28 | Change `"rafiq_chat_messages"` → `"@rafiq_ai_state"`, parse `{messages:[]}` |
| C2 | ErrorBoundary is a stub | `src/components/ErrorBoundary.tsx` | All | Implement real `componentDidCatch` with Arabic fallback UI |
| C3 | API keys in app binary | `.env` | - | Move AI calls to backend proxy, rotate keys |
| C4 | Prompt injection via profile fields | `src/services/ai/HealthContextEngine.ts` | - | Sanitize all user strings before prompt injection |
| C5 | Reasoning history poisoning | `src/services/ai/AIManager.ts` | ~441 | Tag reasoning as non-authoritative, remove from system context |
| C6 | Fever threshold wrong | `src/services/healthEngine.ts` | 229 | Change: ≥38.3°C low, ≥38.9°C moderate, ≥39.5°C critical |
| C7 | Tachycardia doesn't trigger emergency | `src/services/healthEngine.ts` | 408-411 | HR >180 or sustained >150 for 3+ readings = emergency |
| C8 | Zero vitals passed as real | `src/hooks/useAIChat.ts` | 61-133 | Use `null` not `0` for missing vitals |
| C9 | isProcessing stuck after crash | `src/services/sync/offlineQueue.ts` | - | Reset if true for >5min, don't persist across sessions |
| C10 | No AI output safety filter | `src/services/ai/AIManager.ts` | - | Add MedicalSafetyValidator between AI and user |
| C11 | Allergy data dropped on fallback | `src/services/ai/OpenRouterProvider.ts` | - | Fallback must receive identical patient context |
| C12 | healthDataConsent=true by default | `src/stores/app.store.ts` | 62 | Default false, add consent gate |

### 🟠 HIGH (37 issues)
Include: Forgot Password, Biometric Login, No Onboarding, Duplicate Notifications, No Internet Detection, No Skeletons, No Crash Reporting, Widespread `any`, No Migrations, No Accessibility, No Help Center, etc.

## Plan Requirements

### Phase 1: Security (2 days)
- [ ] Backend proxy for AI calls (`AIProxyClient.ts`)
- [ ] Input sanitization utility (`sanitizeForAI.ts`)
- [ ] Secure storage audit
- [ ] Remove secrets from logs

### Phase 2: Medical Safety (2 days)
- [ ] `MedicalSafetyValidator.ts` — allergy detection, contraindications, emergency escalation, disclaimer
- [ ] Fix fever/tachycardia thresholds
- [ ] Fix zero-vitals sentinel

### Phase 3: AI Memory (3 days)
- [ ] Fix companion storage key
- [ ] `MemoryTimeline.ts` — symptom/mood/medication memory
- [ ] `DailyCheckIn.ts` — morning check-in
- [ ] Fix reasoning loop poisoning
- [ ] Fix fallback provider context
- [ ] Fix token counting (Arabic `/2.5` not `/4`)

### Phase 4: Architecture (2 days)
- [ ] Extract shared components (SectionCard, Skeleton, EmptyState)
- [ ] Replace all `any` with proper types
- [ ] SQLite migration system
- [ ] Remove dead code

### Phase 5-10: Performance, Reliability, Notifications, Auth, Accessibility, UX
(See full prompt for details)

### Phase 11: Product Features (4 days)
- [ ] Smart Medication Intelligence (missed med alerts)
- [ ] Health Score algorithm
- [ ] Mood Tracking
- [ ] Symptom Timeline
- [ ] Health Journal
- [ ] AI Context Cards on Home
- [ ] Weekly AI Summary
- [ ] Emergency Timeline
- [ ] Caregiver Notes
- [ ] PDF Health Report
- [ ] Predictive Alerts
- [ ] Offline AI Cache

## Deliverable
A markdown plan file with:
1. File-by-file changes (old code → new code)
2. New file templates
3. Install commands (`expo install ...`)
4. Testing checklist per phase
5. Risk matrix

Do NOT write the actual implementation yet. Only the plan.
