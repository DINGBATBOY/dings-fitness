# Critical Issues (P0 / P1) — Ding! Fitness v1.0 pre-submission audit

Audit date: Oct 14, 2026 · Commit audited: `52f33aa` (food-only app, on top of `2c1ae5d`) · Auditor: Claude

**P0 found: 0.** No cross-user data access, committed secrets or catastrophic crash path was found.
**P1 found: 15.** Ranked by impact. P2/P3 issues are listed in the other reports (index at the end).

Evidence labels used throughout:
- **[TEST]** verified by an executed test (file and test number given)
- **[SRC]** verified by source-code inspection (file:line given)
- **[RUNTIME?]** plausible from source, needs a device/runtime check
- **[UNVERIFIED]** could not be checked from this environment

---

## 1. PRIV-01 — Apple Health weight is sent to Google Gemini, contradicting the privacy policy (Guideline 5.1.3)

| | |
|---|---|
| Severity | **P1** · blocks release: **Yes** |
| Feature | Apple Health sync → AI coach / Analyze Day |
| Files | `MainApp.tsx:1471` (`recordWeight(mass.lbs, 'health')`), `MainApp.tsx:1077` (overwrites `profile.weight`), `services/geminiService.ts:343` (coach), `:1764` (Analyze Day), `:1936` (vision roadmap) |
| Evidence | [SRC] |

**Description.** When Health sync is on, the latest HealthKit body-mass sample is recorded as a weigh-in and **also written to `profile.weight`**. Every coach message builds its system prompt with `Weight: ${profile.weight} lbs`, and Analyze Day sends `Current Weight: ${profile.weight}`. So a HealthKit value reaches Google. `services/coachContext.ts` carefully strips Health-sourced weigh-ins, but the profile field bypasses that filter.

The privacy policy (public/privacy, LegalModal) says HealthKit data is "never disclosed to third parties (including our AI providers)". Guideline 5.1.3(i) restricts disclosure of HealthKit data.

**Repro.** Connect Apple Health with a weight sample newer than any manual check-in → open Coach → send a message → inspect the `callGemini` request: the system instruction contains the HealthKit weight.

**Expected.** No HealthKit-derived value leaves the device toward an AI provider. **Actual.** It does, on every coach message.

**Fix.** Keep Health weight out of `profile.weight` (store it only as a `weighIns` entry with `source:'health'`), or have every AI prompt read the weight from the latest *non-Health* weigh-in. Add a unit test that builds each prompt with a Health-sourced profile and asserts the Health number is absent.

---

## 2. PRIV-02 — AI consent gate has holes; three features send personal data to Google without the 5.1.2(i) consent

| | |
|---|---|
| Severity | **P1** · blocks release: **Yes** |
| Feature | AI consent sheet (`acceptedAiDataSharing`) |
| Files | `components/Journal.tsx:214–220` (Analyze Day), `components/FuelCoachSheet.tsx:91` ("What should I eat?"), `components/Onboarding.tsx:240` → `services/geminiService.ts:1817` (onboarding macros), `functions/src/index.ts:117` (`callGemini` never checks consent) |
| Evidence | [SRC] |

**Description.** Only the food scan and coach chat call `requireAiConsent` (`MainApp.tsx:1606, 1803`). Analyze Day sends the day's log, targets and weight; Fuel Coach sends remaining macros, the user's note and profile goal; onboarding sends name, age, sex, height, weight, body fat and goal — all to Gemini without the consent sheet. Server-side, only `startFoodAnalysis` enforces consent (`functions/src/foodJobs.ts:52`); `callGemini` doesn't.

Guideline 5.1.2(i) (revised Nov 2025) requires apps to "clearly disclose where personal data will be shared with third parties, including with third party AI, and obtain explicit permission before doing so." A Terms checkbox at sign-up is unlikely to count as explicit permission for AI sharing.

**Fix.** Route every AI entry point through `requireAiConsent`. For onboarding, either show the consent sheet before the macro step or use the local `CALCULATE_MACROS` (see NUT-02, which recommends this anyway). Enforce consent in `callGemini` server-side, the same way `startFoodAnalysis` does. Regression test: mount each AI entry point with `acceptedAiDataSharing=false` and assert no callable is invoked.

---

## 3. PRIV-03 — The privacy policy says "no third-party analytics", but the app runs Google Analytics for Firebase

| | |
|---|---|
| Severity | **P1** · blocks release: **Yes** (privacy policy and App Privacy label must be accurate) |
| Files | `services/firebase.ts:87` (`getAnalytics(app)`), `.env` (`VITE_FIREBASE_MEASUREMENT_ID` set, 12 chars); `public/privacy/index.html` and `components/LegalModal.tsx:110,173` |
| Evidence | [TEST] measurement ID `G-GN1…` found in the production bundle `dist/assets/index-*.js`; in the Playwright run the preview made Analytics network calls (`firebase_analytics.js … Failed to fetch`, see `evidence/ui-axe-report.json`). [UNVERIFIED] whether Codemagic's env group also sets the measurement ID for iOS. |

**Description.** Analytics initializes on every launch where a measurement ID is configured. The policy states "We … do not use third-party analytics or advertising trackers" and "The App contains no third-party analytics SDKs." `APP_STORE_LISTING.md §9` lists Analytics as an SDK, but the policy text contradicts it.

**Fix (choose one).** (a) Remove `getAnalytics` (simplest; nothing in the code reads `analytics`), or (b) disclose Google Analytics in the policy and in the App Privacy label (Usage Data / Identifiers → Analytics), and confirm it doesn't count as "tracking". Then re-check the label against the actual data flows.

---

## 4. STORE-01 — App Store listing and screenshots advertise workout features that were removed (Guideline 2.3.1 / 2.3.3)

| | |
|---|---|
| Severity | **P1** · blocks release: **Yes**, if submitted as written |
| Files | `APP_STORE_LISTING.md:46` ("Personalized Workouts — A 7-day split…"), promo text ("Workouts built around your gym"), keywords (`workout,split,gym,recomp`), screenshot plan #6 "Workout split"; `app-store/screenshots/iphone-6-9/04-training-plan.png`, `05-weekly-reflect.png` |
| Evidence | [SRC] listing file; [UNVERIFIED] what is currently entered in App Store Connect |

**Description.** As of Oct 14 the app is strictly food tracking (HANDOFF "Food-only app"). The listing still promises AI workout splits, "training volume" in Wrapped, and the old tab names (Fuel/Dings/Reflect). Screenshots and descriptions must reflect the binary.

**Fix.** Rewrite the description, promo text, subtitle alternatives and keywords for the food-only app. Retake all screenshots on build #72+ (Home, Add Food, review screen, Progress, Coach, Eats).

---

## 5. STORE-02 — The binary is universal (iPhone + iPad), but there are no iPad screenshots and the UI is a phone column on iPad

| | |
|---|---|
| Severity | **P1** · blocks release: **Yes** (App Store Connect requires 13" iPad screenshots for iPad-capable builds) |
| Files | `ios/App/App.xcodeproj/project.pbxproj:362,382` `TARGETED_DEVICE_FAMILY = "1,2"`; `Info.plist` `UISupportedInterfaceOrientations~ipad` (all four) |
| Evidence | [SRC]; [TEST] 1024×1366 screenshot `evidence/home-ipad-1024.png` shows a 448 px column with empty sides |

**Fix.** For v1.0, set `TARGETED_DEVICE_FAMILY = 1` (iPhone only; iPads run it in compatibility mode). Otherwise design for iPad and supply 13" screenshots. Also restrict iPhone to portrait — landscape is declared but the layout is portrait-only.

---

## 6. STORE-03 — No app-level privacy manifest; `@capacitor/filesystem` uses required-reason file-timestamp APIs

| | |
|---|---|
| Severity | **P1** · blocks release: **Likely** |
| Files | none found: `find . -name PrivacyInfo.xcprivacy` returns only Capacitor's own (empty) manifests in `node_modules/@capacitor/ios`; `node_modules/@capacitor/filesystem/ios/Sources/FilesystemPlugin/FilesystemPlugin.swift:214,218,256,260` (`.creationDate`, `.modificationDate`), `Filesystem.swift:109` (`attributesOfItem`) |
| Evidence | [SRC]; [UNVERIFIED] whether App Store Connect already emailed ITMS-91053 warnings for builds #71/#72 |

**Description.** The Filesystem plugin (used for PDF export in `Journal.tsx`) reads file timestamps, which is a required-reason API category. Neither the plugin (v6.0.4 or 7.1.9) nor the app ships a manifest. Capacitor's docs say `@capacitor/filesystem` "may necessitate a Privacy Manifest File" in the app.

**Fix.** Add `ios/App/App/PrivacyInfo.xcprivacy` to the App target: `NSPrivacyAccessedAPICategoryFileTimestamp` with reason `C617.1`, `NSPrivacyAccessedAPICategoryUserDefaults` `CA92.1` if any plugin uses UserDefaults, `NSPrivacyTracking=false`, and the collected data types that match the App Privacy label. Check the upload emails for #72.

---

## 7. LEGAL-01 — Users aged 13–17 are allowed, but the Gemini API terms prohibit apps likely used by under-18s; minors also get weight-loss deficits

| | |
|---|---|
| Severity | **P1** · blocks release: **Yes** (third-party terms + ED-safety exposure) |
| Files | `components/Onboarding.tsx:139` (`age < 13 \|\| age > 100`), `public/terms` §Eligibility ("at least thirteen (13)… 13 to 17 must…"), `constants.tsx` `CALCULATE_MACROS` (−600 kcal for Weight Loss, no age branch) |
| Evidence | [SRC]; Gemini API Additional Terms: "You must be 18 years of age or older to use the APIs" and you "will not use the Services as part of a website, application, or other service … directed towards or is likely to be accessed by individuals under the age of 18." |

**Fix.** Raise the minimum age to 18 in onboarding, Terms and Privacy (simplest and consistent with the ED-safety stance), and answer the age-rating questionnaire to match. If teens must stay, move the teen-reachable AI features off Gemini, and don't give deficits to minors (Mifflin-St Jeor and the deficit tables are adult references).

---

## 8. NUT-02 — Onboarding calorie/macro targets are produced by LLM arithmetic, using rules that differ from the app's own formula

| | |
|---|---|
| Severity | **P1** (materially inconsistent targets) · blocks release: **Yes** |
| Files | `services/geminiService.ts:1817–1932` (`generateOnboardingMacros`: "Calculate a personalized macro plan…"), `components/Onboarding.tsx:240`, `App.tsx:164` (saved as `nutritionTargets`), `MainApp.tsx:922` (stored targets win), `constants.tsx:466+` (`CALCULATE_MACROS`) |
| Evidence | [SRC]; the rule mismatch is deterministic (below). The LLM output itself was not executed (no network to Gemini). |

**Description.** The first daily target every user sees, and keeps until they edit their profile, is whatever Gemini computes. The prompt's rules differ from the code's:

| Goal | Gemini prompt | `CALCULATE_MACROS` (fallback, edit profile, adaptive) |
|---|---|---|
| Weight Loss | −500 kcal | −600 kcal |
| Recomp / Lean | −200 kcal | −350 / −300 kcal |
| Performance | maintenance | −100 kcal |
| Protein | 0.8–1.0 g/lb | 0.85–1.15 g/lb |
| Carbs/fat | carbs 45–55 %, fat 25–35 % of total | 55/45 split of non-protein kcal |

So the same person gets different targets depending on whether the Gemini call succeeded. Their targets then **jump with no input change** the first time they press Save in Edit Profile. Only the calorie floor is re-checked, and it relies on the LLM-supplied `tdee`. Nothing checks that P×4 + C×4 + F×9 ≈ calories.

**Fix.** Compute targets locally with `CALCULATE_MACROS` (already the fallback). Use Gemini, if at all, only for the one-line coach message. This also removes the PRIV-02 onboarding problem. Regression test: the onboarding result equals `CALCULATE_MACROS(...)` for a fixed profile.

---

## 9. NUT-01 — Protein is set from total body weight, producing implausible targets for higher-weight users

| | |
|---|---|
| Severity | **P1** (materially incorrect macros for a large user segment) · blocks release: **Yes** |
| File | `constants.tsx:555` `const protein = Math.round(weightLbs * proteinRatio)` (ratio 0.85–1.15) |
| Evidence | [TEST] `audit/tests/nutrition-audit.test.mjs` #5, #6 (fail as expected) |

**Observed** (from the real `CALCULATE_TDEE` + `CALCULATE_MACROS`):

| Profile | Target | Protein | Carbs | Fat | Protein share | Fat share |
|---|---|---|---|---|---|---|
| 250 lb, 5'2", 60 F, sedentary, recomp, high-protein | 1,639 | **288 g** | 73 g | **22 g** | **70 %** | **12 %** |
| 380 lb, 5'4", 45 F, sedentary, weight loss, high-protein | 2,224 | **380 g** | 106 g | 31 g | 68 % | 13 % |
| 420 lb, 5'6", 50 F, sedentary, recomp, high-protein | 2,700 | **483 g** | 115 g | 34 g | 72 % | 11 % |
| 180 lb, 5'10", 30 M, moderate, weight loss, balanced | 2,163 | 153 g | 213 g | 78 g | 28 % | 32 % |

The calories reconcile (macros sum within ±4 kcal), so the problem is the distribution: protein far above common guidance and fat below typical minimums for anyone with higher body fat.

**Fix.** Base protein on goal weight or lean mass (e.g. `min(weight, goal weight)` or LBM when body fat is known), cap it (e.g. ≤ 35–40 % of calories or ≤ ~250 g), and set a fat floor (e.g. ≥ 20–25 % of calories or 0.25 g/lb of goal weight) before giving carbs the remainder. Both DEFECT tests should then pass.

---

## 10. DATA-01 — The single user document will hit Firestore's 1 MiB cap within months; then every sync write fails

| | |
|---|---|
| Severity | **P1** (major data/sync failure for engaged users; launch-scale blocker rather than review blocker) |
| Files | `MainApp.tsx:483` (`setDoc(users/{uid}, …, {merge:true})`), `services/foodCommit.ts` (`dailyLogs[].foodItems[]` with `nutritionEvidence`, `foodHistory` ≤ 50 entries with full items); HANDOFF gotcha 3 |
| Evidence | [TEST] size model (`node`, realistic items incl. evidence/ingredients): scan item with 8 sources + 5 ingredients = 2,515 B; with 3 sources = 1,109 B; simple item = 279 B. Per day: light 2.4 KB → **~380 days**; typical 5.9 KB → **~157 days**; heavy 13.8 KB → **~67 days** to the cap (after ~93 KB of `foodHistory`). |

**Actual at the cap.** `setDoc` throws, and the user sees "Sync error (check rules)". New logs stay only in `localStorage` (≈5 MB WebView quota, also full-state writes) and never reach other devices or a reinstall. Each snapshot also re-downloads the whole document, so egress grows with document size (the Aug 2026 incident pattern).

**Fix.** Do the subcollection migration (`users/{uid}/days/{yyyy-mm-dd}`, `users/{uid}/foodHistory/{id}`) before public launch. Interim: cap `nutritionEvidence.sources` at 3 and drop `ingredients` from archived days. Add an `opsReport` alert at > 500 KB and a client warning at > 800 KB.

---

## 11. DATA-02 — Midnight rollover silently deletes today's food when that date already has an archive

| | |
|---|---|
| Severity | **P1** (silent data loss; edge-case trigger) |
| File | `MainApp.tsx:544, 562–583` (`alreadyArchived` → reset `todayLog` without archiving) |
| Evidence | [TEST] #24 (verbatim replica of the rollover data path) fails; #25 shows `commitFood`'s rollover merges correctly |

**Repro.** Oct 14 is archived. The device clock moves back to Oct 14 (westward travel across midnight, a manual clock or timezone change, or a stale device whose `lastActiveDate` points at an already-archived day). The user logs dinner. At the next rollover `alreadyArchived` is true, `todayLog` is set to `[]`, and dinner is gone locally and in the cloud.

**Fix.** Replace the custom rollover in `MainApp` with the same merge `commitFood` uses (`appendToDay`, deduplicated by id). Never drop `todayLog` without merging it.

---

## 12. DATE-02 — Day navigation and history break outside the en-US date format

| | |
|---|---|
| Severity | **P1** if the app is distributed outside the US (App Store Connect defaults to all countries); P2 if availability is US-only |
| Files | `components/Dashboard.tsx:64–66` (`new Date(localeString)`), same pattern in `Journal.tsx`, `CalorieCalendar.tsx:29`, `ProgressCharts.tsx:60`, `adaptiveTDEE.ts:126`, `FoodComposer.tsx:268`, `MainApp.tsx:1799`; all date keys are `toLocaleDateString()` |
| Evidence | [TEST] #23; [TEST] Playwright on the real Dashboard (`evidence/locale-en-GB.png`): **en-GB / de-DE** week strip renders "Invalid Date NaN" ×7, "Previous day" gets stuck on "Yesterday", and yesterday shows 0 eaten although it has data; **en-CA** "Previous day" from Yesterday jumps to **Friday, Oct 9** (5 days) because `YYYY-MM-DD` parses as UTC |

**Fix.** Store every day key as local ISO `YYYY-MM-DD` (as `weighIns` already does), parse with `new Date(y, m-1, d)`, and migrate existing `toLocaleDateString` keys once. Until then, set App Store availability to the US only.

---

## 13. SEC-01 — Unbounded AI cost exposure: open prompt proxies, no App Check, free sign-ups

| | |
|---|---|
| Severity | **P1** (production-incident / bill risk) |
| Files | `functions/src/index.ts:117–229` (`callGemini` forwards client `contents` and `config` — incl. any `tools`, e.g. Google Search grounding, and arbitrary system instructions), `functions/src/foodJobs.ts:53` (`startFoodAnalysis` accepts client-built `messages` with up to 4 images, then runs gpt-5.6-terra + web_search), `callOpenAI` still deployed; no App Check anywhere (`grep appCheck` = 0); `Auth.tsx` email/password with no verification |
| Evidence | [SRC]; HANDOFF open items 2–3 (Gemini prepay, OpenAI spend limit) unconfirmed |

**Description.** Any authenticated account can use the backend as a general-purpose GPT/Gemini endpoint (50 calls/day/account, shared bucket). Accounts are free and unverified, so the cap is per throwaway account, not per person. Each scan is a reasoning call with high-detail images plus billed web searches.

**Fix.** (1) Enable App Check (App Attest on iOS, reCAPTCHA Enterprise on web) and `enforceAppCheck: true` on all callables. (2) Build prompts server-side: the client sends only photos and a note; the server owns system instructions, model, tools and `responseSchema`; delete or lock down `callOpenAI` / `foodWebLookup`. (3) Add a global daily spend circuit breaker in `consumeQuota`. (4) Set hard limits in OpenAI and Google billing and confirm the Gemini prepay switch.

---

## 14. SEC-02 — `@capacitor/ios` 6.2.1 has a critical advisory, fixed in 6.2.2

| | |
|---|---|
| Severity | **P1** (critical CVE in the shipped native shell; one-line fix) |
| Evidence | [TEST] `npm audit --omit=dev`: GHSA-rvm3-566m-v7fv "remote content can be loaded at the app origin via the internal HTTP proxy path", range `>=6.0.0 <6.2.2`; installed `@capacitor/ios@6.2.1`; `npm view @capacitor/ios@6` lists 6.2.2 |

**Fix.** `npm i @capacitor/ios@6.2.2 @capacitor/core@6.2.x`, `npx cap sync ios`, rebuild on Codemagic.

---

## 15. FUNC-01 — Past days are read-only, yet food can be logged to past days; mistakes become permanent after an 8-second undo

| | |
|---|---|
| Severity | **P1** (broken correction of historical entries; affects totals permanently) |
| Files | `MainApp.tsx:1806–1817` (`readOnly={!detailFood?.editable}`, edit/delete only touch `todayLog`), `components/Dashboard.tsx:412` (`onOpenFood(f, isToday)`), `components/Journal.tsx:975` (`readOnly={!isToday …}`), `MainApp.tsx:1576` (`deleteLog` filters `todayLog` only) |
| Evidence | [SRC] |

**Repro.** Select yesterday on Home → + → log a food (the banner says "Logging to Tue…") → wait 8 s → tap the food: the sheet is read-only, with no delete. Same for anything logged today once midnight passes.

**Fix.** Make edit/delete operate on `dailyLogs[date].foodItems` and recompute that day's totals, sharing one code path with `todayLog`. Add tests: edit and delete on a past day update the stored totals.

---

## Not P1, but release-relevant (see other reports)

- **DATE-01 (P2):** "Next day" gets stuck on **Sun Nov 1, 2026** (US DST end, 18 days away), and "Previous day" skips Mar 14, 2027. [TEST] #22 and `evidence/dst-stuck.png`.
- **AI-02 (P2):** the server accepts an "apple" at 4,800 kcal and a 50,000 kcal item ([TEST] #20, #21); the prompt asks for a 4/4/9 check but nothing enforces it.
- **DEL-01 (P2):** account deletion leaves `tokenUsage` (uid + email) and `gptKeys/{key}`, returns success even if the Firestore deletes failed, and leaves Firestore's IndexedDB cache and food drafts on the device.
- **DATA-03 (P2):** whole-array last-writer-wins sync can drop entries logged on two devices (or one offline device) at once.
- **OBS-01 (P2):** no crash reporting and no React error boundary; a render error shows a blank screen with no signal to you.

Full index of P2/P3 issues: `RELEASE_READINESS.md` §3.
