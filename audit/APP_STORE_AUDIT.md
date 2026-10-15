# Ding! Fitness — App Store Pre-Launch Audit (Executive Assessment)

**Audited:** commit `52f33aa` ("Food-only Ding!"), the repo in `Dings Fitness/ding! (2)`, on Oct 14, 2026. TestFlight build #72 corresponds to `2c1ae5d`, the shell before the food-only change.
**Verdict:** **NO-GO** as-is · readiness **54/100** · P0 **0** · P1 **15** · P2 **20** · P3 **16**.
**Companion files:** `CRITICAL_ISSUES.md` (P0/P1 detail), `FUNCTIONAL_TEST_MATRIX.md`, `NUTRITION_ACCURACY_REPORT.md`, `SECURITY_PRIVACY_REPORT.md`, `UI_UX_REPORT.md`, `APP_STORE_SUBMISSION_CHECKLIST.md`, `RELEASE_READINESS.md`, `tests/nutrition-audit.test.mjs`, `evidence/`.

## Summary

Ding! is a well-engineered small app. Access control is tight, keys are server-side, the food pipeline is durable and idempotent, and nothing logs without review. **No security breach or cross-user data path was found.**

It isn't ready to submit, for three groups of reasons:

1. **Disclosure accuracy (likely rejections).** HealthKit weight reaches Gemini, several AI features skip the consent sheet, the policy denies an Analytics SDK the app runs, and the listing and screenshots sell workout features that no longer exist. The binary is also universal without iPad screenshots, and there's no privacy manifest.
2. **Target correctness.** First-run targets come from LLM arithmetic using rules the app itself doesn't use, and protein scales with total body weight (288 g/day for a 250 lb sedentary woman).
3. **Data correctness over time.** Past days can't be corrected. A rollover path can drop a day's food. Dates break on DST (Nov 1, 18 days from now) and in non-US locales. The single user document reaches Firestore's 1 MiB cap in about 2–12 months depending on usage.

Most fixes are small. The table in `RELEASE_READINESS.md §2` lists effort per item.

## Top 10 issues

| # | ID | Sev | Issue | Evidence |
|---|---|---|---|---|
| 1 | PRIV-01 | P1 | Apple Health weight overwrites `profile.weight`, which goes to Gemini in coach and Analyze Day prompts | `MainApp.tsx:1077,1471`; `geminiService.ts:343,1764` |
| 2 | PRIV-02 | P1 | Analyze Day, Fuel Coach and onboarding send personal data to Google without 5.1.2(i) consent; the server enforces consent only for the scan | `Journal.tsx:220`, `FuelCoachSheet.tsx:91`, `Onboarding.tsx:240` |
| 3 | NUT-02 | P1 | Onboarding targets are computed by Gemini with different deltas/protein rules than `CALCULATE_MACROS`; targets shift on the first profile save | `geminiService.ts:1817–1932` |
| 4 | STORE-01 | P1 | Listing, keywords and screenshots advertise removed workout features | `APP_STORE_LISTING.md:46`, `app-store/screenshots/04-training-plan.png` |
| 5 | PRIV-03 | P1 | Firebase Analytics runs (measurement ID in the bundle) while the policy says no third-party analytics | `services/firebase.ts:87` |
| 6 | NUT-01 | P1 | Protein = total lb × 0.85–1.15 → 70 % protein / 12 % fat targets for higher-weight users | [TEST] #5–6 |
| 7 | FUNC-01 | P1 | Past-day entries can't be edited or deleted, although logging to past days is offered | `MainApp.tsx:1806–1817` |
| 8 | STORE-02 / STORE-03 | P1 | Universal binary without iPad screenshots; no `PrivacyInfo.xcprivacy` despite Filesystem's file-timestamp API use | `project.pbxproj:362`; Filesystem plugin |
| 9 | DATA-01 | P1 | User doc reaches 1 MiB in ~157 days (typical) / ~67 days (heavy), after which sync fails | size model |
| 10 | DATE-02 / DATE-01 | P1 / P2 | Locale-formatted date keys break navigation outside en-US; DST breaks "next day" on Nov 1 2026 | [TEST] #22–23, Playwright |

Next in line: SEC-01 (open AI proxies, no App Check, spend limits unconfirmed), LEGAL-01 (13–17-year-olds vs Gemini's 18+ terms), DATA-02 (rollover data loss), SEC-02 (Capacitor iOS critical CVE).

## Immediate release blockers
PRIV-01, PRIV-02, PRIV-03, STORE-01, STORE-02, STORE-03, NUT-01, NUT-02, LEGAL-01, FUNC-01, DATA-02, SEC-02, plus the human on-device pass. DATE-02 is mitigated by limiting availability to the US. SEC-01 is mitigated by provider spend limits before submission.

---

## Phase 1 — Architecture map

```
iPhone (Capacitor 6.2.1, WKWebView, iOS 15+)         Web (dings.fitness → Cloudflare → Firebase Hosting)
  React 19 + Vite 6 + Tailwind 4 SPA (same bundle) ───────────────┘
  │  native plugins: Camera, BarcodeScanner, Filesystem, Share, App, SplashScreen, StatusBar,
  │                  ding-health (local Swift HealthKit plugin, read-only)
  │  state: one AppState in MainApp.tsx → localStorage (per uid) + Firestore users/{uid} (merge writes,
  │         onSnapshot read-back; diffed top-level fields) · food drafts in IndexedDB
  │
  ├─ Firebase Auth (email/password)
  ├─ Firestore: users/{uid} (profile, nutritionTargets, todayLog, dailyLogs[], foodHistory[], weighIns[],
  │             water, activityBurn, notes) · user_workouts/{uid} (legacy) · quotas · tokenUsage ·
  │             foodAnalysisJobs · barcodeCache · foodLookupCache · gptKeys · opsCounters
  ├─ Storage: users/{uid}/** (rules allow; avatar is stored inline instead) · foodAnalysisInputs/{uid}/ (server)
  └─ Cloud Functions (Node 22, us-central1, maxInstances 10)
       callGemini ──────────► Gemini 2.5 Flash (coach, onboarding macros, Analyze Day, Fuel Coach, …)
       startFoodAnalysis → Firestore job → processFoodAnalysis ──► OpenAI gpt-5.6-terra (Responses + web_search)
       cancelFoodAnalysis · cleanFoodAnalysis (hourly)
       searchNutrition ──► USDA FDC + Open Food Facts (relevance-gated)
       lookupBarcode ────► OFF product API → USDA gtinUpc (cached)
       deleteAccount · createGptKey · gptMacros (public, bearer) · opsReport (admin, bearer)
       callOpenAI, foodWebLookup (deployed, unused by the UI)
CI/CD: Codemagic (manual start) → TestFlight · deploy.ps1 → Hosting (+ edge verification) · firebase deploy for rules/functions
Analytics: Firebase Analytics (getAnalytics) · Crash reporting: none · Payments: none · Push: none
Tests: tests/food-flow.test.mjs (12) · audit/tests/nutrition-audit.test.mjs (26, added by this audit)
```

**Critical path traced (scan → log).** `FoodComposer.analyze` → `prepareFoodAnalysis` (client builds the prompt; calls `searchNutrition`) → `startFoodAnalysis` (auth, consent, quota, input to Storage, job doc) → `processFoodAnalysis` (claims the job, streams OpenAI, publishes progress, `validateFoodResult`) → client `onSnapshot` on the job → `fromAnalysis` → `MealReview` (portion chips/editor) → `toSavedFood` (stable id) → `MainApp.pushFoodToState` → `commitFood` (rollover + dedupe + history) → `localStorage` → `setDoc(merge)` → `onSnapshot` re-merge → `Dashboard`.

Feature inventory with statuses: `FUNCTIONAL_TEST_MATRIX.md`.

## What was actually executed

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ exit 0 |
| `npm --prefix functions run build` | ✅ exit 0 |
| `tests/food-flow.test.mjs` | ✅ 12/12 |
| `audit/tests/nutrition-audit.test.mjs` (new) | 18 pass / 8 fail; all 8 failures are documented defects |
| `vite build` | ✅; main chunk 1,858 KB (532 KB gz), warning > 500 KB |
| `npm audit --omit=dev` | web 7 (2 critical) · functions 19 (2 critical) |
| Git-history secret scan (106 commits) | ✅ none |
| Playwright + axe on 10 screen/viewport/theme combos | contrast, target-size, button-name findings |
| Playwright date tests (DST, en-GB, de-DE, en-CA) | ❌ reproduced DATE-01/02 |
| Web cold-load timing (auth screen) | FCP 0.76 s / 1.19 s at CPU ×4 |
| Doc-size growth model | 67–380 days to 1 MiB |
| Official-requirement lookups | Xcode 26 upload rule (Apr 28 2026), 5.1.2(i) AI wording, new age ratings, Capacitor privacy-manifest note, Gemini API age terms |

## Environment limitations
Linux sandbox and a Windows PC; **no macOS, Xcode, Simulator, iPhone, TestFlight or App Store Connect access**, no signed-in account, no Firestore emulator (no Java on the PC; the jar can't be downloaded in the sandbox), and no network to USDA, OFF, OpenAI, Gemini or dings.fitness from the sandbox. So: no claims about on-device behavior, HealthKit prompts, real scan quality, live rules enforcement or ASC state. Every such item is marked ⬜ or [RUNTIME?].

## Sources consulted
- Apple / Expo note on the Xcode 26 upload requirement: https://expo.dev/blog/app-store-connect-minimum-sdk-26
- Guideline 5.1.2(i) third-party AI wording: https://www.igeeksblog.com/apple-app-store-ai-data-disclosure-guidelines
- New age-rating tiers and questionnaire: https://trysonar.app/blog/app-store-age-rating.md, https://9to5mac.com/2025/07/24/apple-notifies-developers-of-new-app-store-age-rating-system/
- Capacitor privacy manifest guidance: https://capacitorjs.com/docs/ios/privacy-manifest
- Gemini API Additional Terms (age): https://ai.google.dev/gemini-api/terms_preview
- Capacitor advisory: https://github.com/advisories/GHSA-rvm3-566m-v7fv
