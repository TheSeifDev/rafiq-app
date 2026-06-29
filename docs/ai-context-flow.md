# AI Context Flow Audit

**Goal** – Document how the current AI chat pipeline builds (or fails to build) a health‑aware context for each user request.

---

## 1. End‑to‑End Call Stack
```
User sends message → useAICHat hook (src/lib/ai/hooks/useAICHat.ts)
    ↓  collects healthContext prop passed from screen/component
    ↓  calls aiManager.generate(message)
AIManager (src/lib/ai/orchestration/AIManager.ts)
    ↓  ensures `initialize(healthContext)` was called – otherwise throws
    ↓  extracts topic, prunes reasoning state
    ↓  **buildHealthContext(this.healthContext)**   ← HealthContextEngine
    ↓  formatContextForPrompt(this.healthContext, insights) ← HealthContextEngine
    ↓  builds system prompt + reasoning history → messages array
    ↓  sends messages to provider (OpenRouter) via makeRequest()
Provider response → AIManager returns AIResponse
useAICHat receives AIResponse → updates chat state, persists history
```

## 2. Where Context Is Built
| Step | File | What Happens |
|------|------|--------------|
| **A** | `useAICHat.ts` (line 71) | Calls `aiManager.initialize(healthContext)` on mount. The **healthContext** prop is supplied by the screen that renders the chat (e.g. `ChatScreen.tsx`).
| **B** | `AIManager.generate()` (line 148‑152) | Calls `buildHealthContext(this.healthContext)` – this merges vitals, medication, alerts, food, sleep into a single **HealthContextData** object.
| **C** | `HealthContextEngine.buildHealthContext()` (src/lib/ai/orchestration/HealthContextEngine.ts) | Turns the raw data into a human‑readable `contextText` and an array of `HealthInsight`s. No patient‑specific fields beyond what the **healthContext** already contains are added here.
| **D** | `HealthContextEngine.formatContextForPrompt()` (line 292‑321) | Prefixes the AI system prompt with "You are RAFIQ…" and embeds `contextText` and top insights.

## 3. Where Context Is Lost / Ignored
1. **No automatic fetch of patient data** – `useAICHat` receives **only** the `healthContext` object that its parent component decides to pass. If the parent does not query the database for the patient, the object is empty, and the AI never sees the profile.
2. **Missing aggregation of conditions, allergies, emergency contacts, hospital data** – `HealthContextData` defined in `HealthContextEngine.ts` only contains:
   ```ts
   patientName, latestVitals, medications, recentAlerts, foodLogs, sleepRecords
   ```
   There is **no field** for `conditions`, `allergies`, `emergency_profile`, `hospital_data`, or `reporter_data`.
3. **No deduplication of recent chat topics** – the reasoning state is trimmed but never inspected for symptom extraction; therefore previous health‑related dialogue is never fed back into the prompt.
4. **Supabase fallback never used** – the aggregator that should pull from remote only exists in `src/local/syncEngine.ts` and is not wired into the chat flow.
5. **AsyncStorage is only used for chat persistence**, not for storing the health context. The priority order (SQLite → AsyncStorage → Supabase) is not enforced anywhere.

## 4. Summary of Gaps
- **Patient information is never fetched** inside the AI pipeline; it must be supplied manually.
- **Allergy, nutrition, emergency, hospital, reporter data** are absent from the system prompt.
- **No caching** of the heavy context aggregation; each `generate` call rebuilds from whatever was passed in.
- **No extraction of symptoms or concerns** from previous chat messages to enrich the context.
- **Supabase is not consulted** for missing local rows.

---

## 5. Recommended Insertion Points
1. **Chat screen (or parent component)** – before rendering `useAICHat`, call the new `PatientContextAggregator` to obtain a full `HealthContextData` object.
2. **AIManager.initialize()** – continue to receive this enriched object.
3. **HealthContextEngine.buildHealthContext()** – keep as‑is; it will now receive a richer payload (conditions, allergies, etc.).
4. **AIManager.generate()** – no changes needed beyond the enriched `healthContext`.

With these changes the AI will have a complete, patient‑aware view without introducing any new AI, memory, or chat architecture.
