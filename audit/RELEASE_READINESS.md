# Release Readiness — Ding! Fitness v1.0

## Decision: **NO-GO** for App Store submission as of `52f33aa` (Oct 14, 2026)

Readiness score **54 / 100**. Even a higher score wouldn't change the decision: 15 open P1 issues, several of which are likely App Review rejections (2.3, 5.1.2(i), 5.1.3, missing iPad screenshots).

The verdict becomes **CONDITIONAL GO** once the "Must fix before submission" items below are done and the on-device pass in `FUNCTIONAL_TEST_MATRIX.md` is completed by a human. Most P1 fixes are small (hours, not weeks). The exception is DATA-01, the subcollection migration, which can follow submission as long as the user count stays small.

## 1. Score

| Area | Weight | Score | Basis | Coverage / confidence |
|---|---|---|---|---|
| App Store compliance | 20 % | **40** | Binary basics are sound (Xcode 26 path, icon, usage strings, entitlements, encryption key, deletion exists). But metadata is inaccurate (STORE-01), iPad is declared without screenshots (STORE-02), the privacy manifest is missing (STORE-03), and 5.1.2(i)/5.1.3 gaps (PRIV-01/02) plus an inaccurate privacy policy (PRIV-03). | 30/42 applicable items assessable; 12 need ASC/device |
| Functional reliability | 20 % | **55** | Scan pipeline, drafts, idempotent save and undo are well built. Defects: past-day edit/delete missing (FUNC-01), rollover data loss (DATA-02), locale and DST date bugs (DATE-01/02), the 1 MiB cap (DATA-01), multi-device LWW (DATA-03). No device testing. | 46 % of features exercised by an executed test |
| Nutrition accuracy | 20 % | **60** | Scaling, aggregation and energy math all pass (18 tests). Target generation is the weak point: LLM targets (NUT-02), protein on total weight (NUT-01), adaptive bias (NUT-03), no AI plausibility check (AI-02), barcode zeros (NUT-04). | High for in-app math; external data unverifiable |
| Security & privacy | 20 % | **55** | Rules are owner-only, no secrets, no IDOR, safe markdown. Against that: HealthKit → AI (PRIV-01), consent gaps (PRIV-02), undeclared Analytics (PRIV-03), open AI proxies and no App Check (SEC-01), a critical Capacitor CVE (SEC-02), deletion residue (DEL-01). | Rules verified by inspection only (emulator unavailable) |
| Performance & stability | 10 % | **65** | Web cold load measured: FCP 0.76 s (CPU ×1) / 1.19 s (CPU ×4) on the auth screen. Main JS 1.86 MB (532 KB gz) in one chunk. State diffing is cheap (JSON.stringify of 740 KB `dailyLogs` ≈ 3 ms desktop). No error boundary or crash reporting (OBS-01); doc growth raises egress. | No device profiling; no signed-in heavy-user run |
| UX & accessibility | 10 % | **60** | Clean v2 core flow. Contrast fails AA for muted text (A11Y-01), sub-44 pt targets and two unlabeled buttons (A11Y-02), no Dynamic Type (A11Y-03), legacy History/Settings styling (UX-01). | Preview harness only; no VoiceOver run |
| **Weighted total** | | **54** | | |

Scores reflect quality *where it could be assessed*. Areas that couldn't be tested weren't given credit (e.g. HealthKit on device and live auth are counted neither as pass nor full marks).

## 2. Recommended fix order

### Must fix before submission
| ID | Fix | Effort |
|---|---|---|
| PRIV-01 | Stop writing Health weight into `profile.weight`; AI prompts use the latest non-Health weigh-in | S |
| PRIV-02 | Consent gate on Analyze Day, Fuel Coach, onboarding (or compute onboarding locally); enforce consent in `callGemini` | S |
| PRIV-03 | Remove `getAnalytics`, or disclose it in the policy and privacy label | XS |
| NUT-02 | Onboarding targets from `CALCULATE_MACROS`; Gemini for the coach message only | S |
| NUT-01 | Protein from goal/lean weight with a cap; fat floor | S |
| LEGAL-01 | Minimum age 18 (onboarding, Terms, Privacy, rating) | XS |
| STORE-02 | `TARGETED_DEVICE_FAMILY = 1`; portrait only | XS |
| STORE-03 | Add `PrivacyInfo.xcprivacy` (File Timestamp C617.1, tracking false, data types) | XS |
| SEC-02 | `@capacitor/ios` 6.2.2 + `cap sync` | XS |
| FUNC-01 | Edit/delete on past days (shared path with today) | M |
| DATA-02 | Rollover merges like `commitFood`; never drops `todayLog` | S |
| DATE-02 | Set availability to US only now; ISO day keys in v1.1 (or fix now) | XS / M |
| SEC-01 | Spend limits (OpenAI, Google), App Check, server-built prompts; delete `callOpenAI`/`foodWebLookup` | M |
| STORE-01 | Rewrite the listing and retake screenshots | S |
| FEAT-01 | Hide the GPT key button behind admin | XS |
| DATE-01 | DST-safe day shift (`setDate(d.getDate() + n)`) before Nov 1 | XS |
| — | Human on-device pass (scan, barcode, HealthKit, deletion, PDF, light mode) | — |

### Should fix before public launch
DATA-01 subcollection migration · AI-02 plausibility guard · DEL-01 complete deletion · OBS-01 crash reporting + error boundary · SAFE-01 custom-target floor · NUT-04 barcode unknowns · NUT-03 adaptive window · DATA-03 per-item writes (falls out of DATA-01) · A11Y-01/02 contrast and targets · SEC-03 `npm audit fix` + firebase-admin upgrade · FUNC-04 profile-load failure must not reroute to onboarding · AGE-01 new age-rating questionnaire.

### Can improve after launch
A11Y-03 Dynamic Type · UX-01 legacy screen restyle · PERF-01 code-split (lazy-load jsPDF/html2canvas, Wrapped, Journal) · NUT-05 USDA energy fallback · all P3s.

## 3. Full issue index

### P1 (15) — details in `CRITICAL_ISSUES.md`
PRIV-01, PRIV-02, PRIV-03, STORE-01, STORE-02, STORE-03, LEGAL-01, NUT-02, NUT-01, DATA-01, DATA-02, DATE-02, SEC-01, SEC-02, FUNC-01

### P2 (20)
| ID | Area | Summary | Where documented |
|---|---|---|---|
| DATE-01 | Dates | Next day stuck on Nov 1 2026; previous skips Mar 14 2027 | CRITICAL (tail), UI |
| AI-02 | Nutrition | Server accepts implausible calories (4,800 kcal apple; 50,000 kcal item) | NUTRITION |
| NUT-03 | Nutrition | Adaptive TDEE divides by the wrong window (−92 kcal error at steady state) | NUTRITION |
| NUT-04 | Nutrition | Barcode missing nutrients → 0 | NUTRITION |
| NUT-05 | Nutrition | USDA energy only from nutrient 1008 (possible 0 kcal candidates) [RUNTIME?] | NUTRITION |
| SAFE-01 | Safety | Custom targets allow 800 kcal | NUTRITION |
| DEL-01 | Privacy | Deletion leaves tokenUsage/gptKeys/device caches; silent partial success | SECURITY |
| DATA-03 | Data | Whole-array last-writer-wins across devices / offline | FUNCTIONAL |
| OBS-01 | Ops | No crash reporting, no React error boundary → blank screen | below |
| FEAT-01 | Privacy | GPT key button visible to everyone, undisclosed data path | SECURITY |
| SEC-03 | Security | 7 web / 19 functions dependency advisories | SECURITY |
| SEC-04 | Security | Coach tool can write unvalidated body fat | SECURITY |
| A11Y-01 | A11y | Muted text 3.98:1 / 4.44:1 | UI |
| A11Y-02 | A11y | Sub-44 pt targets; 2 unlabeled buttons | UI |
| A11Y-03 | A11y | No Dynamic Type | UI |
| UX-01 | UX | History/Settings legacy styling, low-contrast light mode | UI |
| UX-02 | UX | iPad phone column (if iPad kept) | UI |
| FUNC-04 | Auth | Profile fetch error at launch sends an existing user into onboarding, which overwrites the profile | FUNCTIONAL |
| PERF-01 | Perf | 1.86 MB main chunk; jsPDF/html2canvas eagerly loaded | below |
| AGE-01 | Store | Age-rating plan written for the old 4+ system | CHECKLIST |

### P3 (16)
UX-03 landscape enabled · UX-04 missing apostrophes, "v2.1" in the support email, bare "Connection error." · UX-05 big green mid-day deficit · A11Y-04 no h1 / heading order · SEC-05 no security headers on Hosting · SEC-06 ops key in query string · PROMPT-01 coach prompt mentions steps/burn and "adjusting Path/Protocol" it can't do (gotcha 7) · NUT-06 raw float values in editor inputs · NUT-07 no sanity warning on huge quantities/values · PRIV-04 AI consent can't be withdrawn · PRIV-05 logout leaves the Firestore cache and drafts · AUTH-01 no email verification · PLIST-01 unused NSPhotoLibraryAddUsageDescription · DEBT-01 dead workout code still writes `FALLBACK_SPLIT` to `user_workouts` for new users · FUNC-05 undo-delete after midnight restores into the new day · FUNC-06 selected day doesn't roll forward while the app stays foregrounded.

## 4. Observability & release safety

| Area | State |
|---|---|
| Crash reporting | ❌ none (no Crashlytics/Sentry; WebView errors invisible) → add Sentry Capacitor or a `window.onerror`/`unhandledrejection` logger to a Function, plus a React error boundary with a "Reload" button |
| Backend health | ⚠️ `opsReport` + weekly ops agent (uptime, cost, doc size, error counters) — good start; no real-time alerting |
| AI cost alarms | ⚠️ counters only; provider spend limits unconfirmed |
| Release version tracking | ✅ `/version.json` on web; iOS build number = epoch |
| Rollback | ⚠️ web: redeploy the previous commit; Functions: redeploy; iOS: can't roll back a shipped binary, so use phased release and server-side kill switches |
| Feature flags / remote config | ❌ none. Recommend one Firestore `config/app` doc read at launch (e.g. `scanEnabled`, `coachEnabled`, minimum build) so AI features can be switched off without a new binary |
| DB migrations | ❌ no migration framework; DATA-01 needs a dual-read migration plan |
| Third-party dependencies | OpenAI (scan: no fallback pipeline by design), Gemini (9 features), USDA, OFF. If OpenAI is down, scans fail with a clear message ✅ |
| Four deploy targets drift | Known (HANDOFF). `deploy.ps1` verifies web origin vs edge ✅; Codemagic webhook not wired |

## 5. What's already solid
Owner-only rules with default deny · server-side AI keys · uid-scoped job ids · durable, idempotent food commits (stable ids, retry-safe, midnight-aware in `commitFood`) · a review step before logging with evidence labels · safety floors on the automatic path · HealthKit read-only · server-side validation of model JSON · recursive hard delete of the main data · DEV-only client logging · a clear four-target deploy runbook.
