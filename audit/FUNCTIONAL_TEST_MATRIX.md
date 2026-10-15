# Functional Test Matrix — Ding! Fitness v1.0 (`52f33aa`)

**Environment actually available:** Linux cloud sandbox (Node 22, Chromium via Playwright, real app modules, the Vite dev preview `design/preview.html` with sample data and no Firebase), plus Ding's Windows PC (no Java, no Mac).
**Not available:** macOS/Xcode, iOS Simulator, a physical iPhone, TestFlight, App Store Connect, a signed-in account, the Firebase emulators and the live backend. **No iOS Simulator or device test was performed.**

Legend: ✅ pass · ❌ defect · ⚠️ partial/risk · ⬜ not verified
Method: **T** executed test · **P** Playwright on the real React components (preview harness) · **S** source inspection · **—** needs device/account

## Feature inventory

| # | Feature | Status in code | Depends on |
|---|---|---|---|
| F1 | Email/password sign-up, login, reset, logout | live | Firebase Auth |
| F2 | Onboarding (6 steps) + disclaimer + targets | live (targets via Gemini, fallback local) | Gemini `callGemini` |
| F3 | Home dashboard: day switcher, ring, macros, balance card, week, trends, food list, water | live | local state, HealthKit |
| F4 | Add Food: photo/camera scan → job pipeline → review → log | live | `startFoodAnalysis`/`processFoodAnalysis`, OpenAI, Storage |
| F5 | Barcode (native scanner / manual) | live | `lookupBarcode`, OFF, USDA |
| F6 | Describe-it text scan | live | same as F4 |
| F7 | Recent / Favorites re-log | live | `foodHistory` |
| F8 | Eats (curated 44-chain menu DB) | live | `data/restaurants.ts` |
| F9 | Quick add / manual editor / ingredient editor | live | — |
| F10 | Food detail edit/delete | live (today only) | — |
| F11 | Undo (food, delete, water, activity) | live | — |
| F12 | Water tracking | live | — |
| F13 | Log a workout (calories burned) | live | — |
| F14 | Weigh-in + weight trend | live | — |
| F15 | Apple Health (energy, steps, workouts, weight) | shipped, **never confirmed on device** | `plugins/ding-health` |
| F16 | Coach chat (+ saveInsight, updateUserMetric tools) | live | Gemini |
| F17 | Fuel Coach "What should I eat?" | live | Gemini |
| F18 | Progress tab (charts, calendar, Wrapped) | live | — |
| F19 | Profile hub: History (Journal, Analyze Day, PDF export), Settings, Appearance | live | Gemini, jsPDF, Filesystem/Share |
| F20 | Edit profile / custom targets / adaptive TDEE | live | — |
| F21 | Account deletion | live | `deleteAccount` |
| F22 | AI consent sheet | live (partial coverage) | — |
| F23 | Fuel Coach GPT key | live, visible to all users | `createGptKey`, `gptMacros` |
| F24 | Admin token-usage dashboard | admin-only | `tokenUsage` |
| — | **Dead code that still ships in the bundle:** `FuelHome`, `BowLoader`, `SpotlightTour`, `WorkoutsHome`, `RecompVelocity`, `WeeklySummaryCard`, workout-split state and `generateSmartSplit`, legacy scan (`analyzeFoodEntry*`, `lookupFoodOnWeb`), `callOpenAI`/`foodWebLookup` functions (deployed, uncalled), `FALLBACK_SPLIT` still written to `user_workouts` for new users (`MainApp.tsx:703`) | | |

## Test matrix

| Feature | Test case | Method | Result | Notes / issue |
|---|---|---|---|---|
| F1 | Register / login / invalid credentials / reset | S | ⬜ | Code paths exist (`Auth.tsx:50,52,73`). No live account available. |
| F1 | Duplicate account prevention | S | ✅ | Firebase rejects duplicate email. |
| F1 | Session persistence on iOS WKWebView | — | ⬜ | Persistence chain IndexedDB → local → session → memory; in-memory fallback logs the user out on relaunch. Verify on device. |
| F1 | Profile fetch fails at launch → onboarding shown to existing user | S | ⚠️ | `App.tsx:76–79` sets profile `null` on a getDoc error. Re-onboarding then overwrites the profile and targets (merge). P2 (FUNC-04). |
| F1 | Logout clears caches | S | ⚠️ | `localStorage` only; Firestore IndexedDB cache and drafts remain (P3). |
| F2 | Age 13–100 validation | S | ⚠️ | Accepts minors (LEGAL-01). |
| F2 | Target calculation | S/T | ❌ | Gemini-computed, rules differ (NUT-02). Local fallback ✅ T#1–4. |
| F2 | Data sent before consent | S | ❌ | PRIV-02. |
| F2 | Underweight BMI guard | S | ✅ | `Onboarding.tsx:187–196`. |
| F3 | Day switcher: previous/next across normal days | P | ✅ | en-US. |
| F3 | Day switcher across DST (Nov 1 2026, Mar 14 2027) | T/P | ❌ | Stuck on Nov 1 / skips Mar 14 (DATE-01), `evidence/dst-stuck.png`. |
| F3 | Non-US locale (en-GB, de-DE, en-CA) | P | ❌ | "Invalid Date NaN" strip, stuck navigation, empty past days, en-CA jumps 5 days (DATE-02). |
| F3 | Ring = target − eaten, signed | S/P | ✅ | |
| F3 | Balance card math | T | ✅ | T#7. |
| F3 | Selected day rolls forward after midnight | S | ⚠️ | Only on `visibilitychange`; a foreground app left open keeps "yesterday" selected and new food logs there (with a banner). |
| F4 | Scan job lifecycle (queued → ready/failed/cancelled, retry, 90 s budget, cleanup) | T/S | ✅ | Existing 12 tests pass; server code reviewed. |
| F4 | Real signed-in scan end to end | — | ⬜ | HANDOFF: never run by a human. **Required before submission.** |
| F4 | Draft survives app close (IndexedDB) | — | ⬜ | WKWebView IndexedDB reliability flagged in HANDOFF. |
| F4 | Malformed / implausible model output | T | ⚠️ | Malformed rejected ✅; implausible accepted ❌ (AI-02). |
| F4 | Offline → clear message, draft kept | S | ✅ | `FoodComposer.tsx:197`. |
| F4 | Repeated taps / double submit | S | ✅ | `requestLock`, `operation` token, form `lock`. |
| F4 | Camera permission denied | S | ✅ | Message + fallback to Photos/typing. |
| F5 | Valid / unknown / invalid barcode, cancel | S | ✅ | Length 6–14 check; not found → photo-the-label prompt. |
| F5 | Missing nutrients | S | ❌ | Become 0 (NUT-04). |
| F5 | Native scanner on device | — | ⬜ | |
| F7 | Re-log, favorite, search, remove | S/P | ✅ | Rendered in preview. |
| F8 | Eats list renders | P | ✅ | |
| F9 | Manual entry validation (negative, blank, NaN) | T/S | ✅ | No upper bound (P3). |
| F10 | Edit / delete today's item | S | ✅ | |
| F10 | Edit / delete past-day item | S | ❌ | Read-only (FUNC-01). |
| F11 | Undo food log (today and past day) | S | ✅ | Adjusts `dailyLogs` totals correctly. |
| F11 | Undo delete | S | ⚠️ | Always restores into `todayLog`. Fine today-only, but after midnight it lands on the wrong day (P3). |
| F12 | Water add / undo, never negative | S | ✅ | |
| F13 | Log workout → balance card, not target | S/T | ✅ | |
| F14 | Weigh-in validation 50–700 lb, one per day | S | ✅ | |
| F15 | HealthKit prompt, steps, energy, workouts, weight | — | ⬜ | Never confirmed on an iPhone (HANDOFF). **Required before submission** (reviewers test HealthKit). |
| F15 | Health data kept out of AI | S | ❌ | PRIV-01. |
| F16 | Coach chat with consent | S | ✅ | |
| F16 | Chat error → "Connection error." | S | ✅ | Generic; no retry button (P3). |
| F16 | Prompt drift (steps/burn, "adjusting Path/Protocol") | S | ⚠️ | P3 (PROMPT-01). |
| F17 | Fuel Coach without consent | S | ❌ | PRIV-02. |
| F18 | Progress charts render (dark/light) | P | ✅ | `--viz-*` palette; minor contrast (A11Y-01). |
| F19 | Analyze Day without consent | S | ❌ | PRIV-02. |
| F19 | PDF export on iOS (Filesystem + Share) | — | ⬜ | Needs the privacy manifest (STORE-03). |
| F20 | Edit profile recompute | S | ⚠️ | Targets change vs. onboarding (NUT-02). |
| F20 | Custom targets floor | S | ❌ | 800 kcal allowed (SAFE-01). |
| F20 | Adaptive TDEE suggestion | T | ❌ | Biased (NUT-03). |
| F21 | Delete account (server + client) | S | ⚠️ | Residue + silent partial failure (DEL-01). Not run live. |
| F22 | Consent covers every AI path | S | ❌ | PRIV-02. |
| — | Uncaught render error | S | ❌ | No error boundary → blank screen; no crash reporting (OBS-01). |
| — | Midnight rollover with the app open | T | ⚠️ | `commitFood` ✅; `MainApp` rollover loses data when an archive exists (DATA-02). |
| — | Two devices editing the same day | S | ❌ | Whole-array LWW (DATA-03). |
| — | 1 MiB user-doc growth | T | ❌ | ~67–380 days to the cap (DATA-01). |
| — | Reinstall behavior | — | ⬜ | Expect a cloud restore if the doc < 1 MiB and sync is healthy. |

## Coverage

- Features inventoried: **24**.
- Exercised by an executed test (unit or Playwright) at least once: **11 / 24 ≈ 46 %** (F2 fallback math, F3, F4 server logic, F7, F8, F9, F11 math, F13, F14 math, F18, F20 math).
- Verified only by source inspection: **9 / 24**.
- Not verifiable here (device, account or backend): **4 / 24** fully (F1 live auth, F5 native, F15 HealthKit, F21 live delete), plus the live paths of F4.

**Must be done by a human before submitting** (iPhone, TestFlight build ≥ #72 with the fixes): sign-up → onboarding → consent → photo scan → review → log → edit → delete; barcode; Health connect + steps; PDF export; delete account; light mode on every screen; kill-and-relaunch while a scan is running.
