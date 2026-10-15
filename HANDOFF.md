# Handoff — read this first in a new session

Fast context transfer for Ding! Fitness. Companion docs: `MONITORING.md`
(ops + deploy layers), `DEPLOY.md` (secrets/deploy), `ROADMAP.md` (what's next),
`APP_STORE_LISTING.md` (submission copy), `CUSTOM_GPT_INSTRUCTIONS.md`.

## Where things stand (Oct 14, 2026, late)

- **Pre-launch audit fixes shipped** (`audit/CRITICAL_ISSUES.md` has the
  per-issue status): `71ecf99`..`207f1f4`, 11 commits. All "Must fix before
  submission" code items are done except DATA-01 (deliberately deferred).
  - **Functions** deployed from `207f1f4` (Oct 14, ~10:55 pm ET);
    `callOpenAI` and `foodWebLookup` deleted from the project. Firestore and
    Storage rules unchanged (no rules deploy needed).
  - **Web**: `deploy.ps1` verified origin + Cloudflare edge on `207f1f4`.
  - **iOS**: **Codemagic #74 green** on `207f1f4` (uploaded to App Store
    Connect Oct 14, 22:56 ET): Capacitor 6.2.2, PrivacyInfo.xcprivacy,
    iPhone-only portrait and every app fix. This is the build to test and
    submit.
  - v1.0 **not yet submitted**. ~9 users, all internal/TestFlight.
- **What changed for users:** AI consent sheet now also gates Analyze Day
  and Fuel Coach (and the server enforces it on every Gemini call);
  onboarding targets are computed on the device (no AI) with the new
  protein cap / fat floor; minimum age 18; past days' food can be edited
  and deleted; day navigation works across DST and in non-US locales; the
  day streak finally counts past today; Apple Health weight no longer
  changes `profile.weight` (targets use the weight the user typed).
- **Tests:** `node --test tests/release-fixes.test.mjs` (34 regression
  tests for this round) plus the food-flow and audit suites. The audit's
  remaining DEFECT failures are AI-02 (#20, #21) and NUT-03 (#26), both P2
  and out of scope.
- **Not yet verified by a human:** everything in
  `audit/FUNCTIONAL_TEST_MATRIX.md` "Must be done by a human" (real scan
  through the job pipeline, HealthKit + steps on a real iPhone, consent
  sheet, barcode, PDF export, deletion, light mode).
- A weekly **ops agent** ("ding-ops-check", Mondays) checks uptime, deploy
  freshness, backend cost risk, and scans for code regressions.

## Pre-launch fixes (Oct 14, 2026) — read before touching these areas

- **Day keys** (`services/dayKey.ts`): every day key is `M/D/YYYY` built
  from local calendar fields (`dayKey`, `todayKey`), parsed with
  `parseDayKey`, shifted with `shiftDayKey`/`addDays`. **Never** use
  `toLocaleDateString()` (locale-dependent) or `new Date(key)` or
  `+ 86400000` for days. `services/foodCommit.ts` inlines the same format
  because Node's type stripping (food-flow test) can't resolve
  extensionless imports. Weigh-ins stay ISO `YYYY-MM-DD`.
- **One rollover:** `rolloverDay` in `services/foodCommit.ts` (MainApp's
  timer and `commitFood`). It merges into an existing archive; never drop
  `todayLog`.
- **Edit/delete any day:** `updateFoodOnDay` / `removeFoodFromDay` /
  `restoreFoodToDay` (stored day totals move by the item's delta).
- **AI privacy:** prompts get the profile through `profileForAi`
  (`services/aiPrivacy.ts`); Health weigh-ins never reach `profile.weight`.
  Every Gemini/OpenAI entry point goes through `requireAiConsent` on the
  client and `requireAiConsent(uid)` on the server
  (`functions/src/aiPolicy.ts`).
- **Gemini is not a proxy any more:** `callGemini` accepts only
  `sendChatMessage`, `analyzeDailyLog`, `fuelCoachIdeas`
  (`GEMINI_FEATURES`); the server picks the model and the coach tools;
  text only. **A new Gemini feature must be added to `GEMINI_FEATURES`**
  or the server rejects it.
- **Spend breaker:** `opsSpend/{UTC day}` (`calls`, `costUsd`,
  `breakerTrips`). At $25 or 3,000 AI calls in a UTC day every AI feature
  returns "paused for today". Change `GLOBAL_DAILY_SPEND_USD` /
  `GLOBAL_DAILY_AI_CALLS` in `aiPolicy.ts` and redeploy functions.
- **Targets:** onboarding = `computeProfileTargets`
  (`services/starterTargets.ts`) = Edit Profile's formula. Protein basis =
  min(weight, goal weight when losing, lean mass ÷ 0.75), capped at 40 %
  of calories / 250 g; fat ≥ 25 %; carbs = remainder. Existing users keep
  stored targets until they save Edit Profile.
- **iOS project:** iPhone only (`TARGETED_DEVICE_FAMILY = 1`), portrait
  only, `ios/App/App/PrivacyInfo.xcprivacy` is in the App target's
  Resources phase. Keep its data types in step with the App Privacy label
  (`APP_STORE_LISTING.md` §9).
- **No Google Analytics** (privacy policy says so). Don't add it back
  without a policy + label change.
- **18+ only** (Gemini API terms). Age rating: override to 18+.

## App Check — prepared, NOT enforced

Code: `enforceAppCheck: APP_CHECK_ENFORCED` (false, `functions/src/aiPolicy.ts`)
on `callGemini`, `startFoodAnalysis`, `searchNutrition`, `lookupBarcode`.
Calls without a token are counted in `opsCounters/{day}.appCheckMissing`.
Web initializes reCAPTCHA Enterprise only when `VITE_APPCHECK_RECAPTCHA_KEY`
is set at build time. **iOS has no App Check client yet:** reCAPTCHA can't
attest the `capacitor://` WebView, so App Attest needs a native plugin
(`@capacitor-firebase/app-check` + `GoogleService-Info.plist` +
`FirebaseApp.configure()`), which wasn't added blind because a missing plist
crashes the app at launch. Order to turn it on:
1. Console steps (Ding): Firebase Console → App Check → Apps → iOS app
   `com.dings.fitness` → **App Attest** → Register (needs the Team ID from
   developer.apple.com → Membership). In the Apple developer portal →
   Identifiers → `com.dings.fitness`, enable the **App Attest** capability
   (the code session then adds `com.apple.developer.devicecheck.appattest-environment`
   = `production` to `App.entitlements`). Web app → **reCAPTCHA Enterprise** → create a key in
   Google Cloud Console → Security → reCAPTCHA (website key, domains
   `dings.fitness`, `dings-fitness.web.app`) → paste it into App Check and
   into `.env` as `VITE_APPCHECK_RECAPTCHA_KEY`. Add a line about reCAPTCHA
   to the privacy policy before shipping the web key.
2. Code session: add the native plugin + plist, ship a Codemagic build.
3. Watch `appCheckMissing` in `opsReport` for a week of real traffic, then
   set `APP_CHECK_ENFORCED = true` and deploy functions. In the console,
   leave Firestore/Storage enforcement off until the same numbers look clean.

## Food-only app (Oct 14 evening) — read first

Ding decided Ding! is **strictly a food-tracking app**. Removed: the Train tab
(WorkoutsHome / AI workout split), Recomp Velocity, onboarding steps 7–9
(injuries, workout preferences, energy/busy days — onboarding is 6 steps),
the edit-profile workout preferences, the coach's `addExerciseToSplit` tool,
the Monday split reset. Workout data in `user_workouts` is left untouched.

**Kept on purpose:** logging workouts as **calories burned** ("Log a
workout" on Home → activity modal → `activityBurn`), and Apple Health
workouts/steps/active energy.

- **Tabs:** Home · Coach · **(+)** · Progress · Profile. Old ids still
  resolve in `switchTab`: `workouts` → Home, `reflect`/`recomp` → Progress,
  `journal` → Profile/History, `restaurants` → Add Food's Eats.
- **Progress** (`components/ProgressCharts.tsx` + Wrapped + calorie calendar):
  7/30-day calories vs target, eaten-vs-burned diverging bars, macros stacked
  by calories, weight line, "See the numbers" table. Chart colors are the
  `--viz-*` tokens in index.css, validated with the dataviz palette checker
  on every background tone (the old macro colors failed it — don't reuse
  them for charts).
- **Home balance card:** "Todays balance so far" = eaten − (resting +
  active + extra + digestion) via `computeEnergyBalance`. Steps are **not**
  added: Apple Health's active energy already includes walking. New
  `healthWorkoutKcal` input: logged workouts beyond what Health itself
  recorded today count as extra burn on top of Health (no watch, gym
  machine). Past days keep the old rule (logged = inside Health's number).
- **Steps fix:** connected users were never re-asked for the new `stepCount`
  type, so steps were always empty. `HEALTH_READ_VERSION` (MainApp) re-runs
  `requestAuthorization` once when the read set grows; iOS only prompts for
  new types. Bump it whenever `plugins/ding-health` reads a new type.
  Nothing on the Apple Developer site is needed per data type.
- **Coach knows the app:** `services/coachContext.ts` builds a capped
  (~1–7 KB) text snapshot per message — today's foods/macros/left, water,
  logged workouts, last 7 days per day, 30-day averages, weight check-ins,
  usual foods — passed into `sendChatMessage`. Nothing new is stored.
  **Apple Health data is excluded** (steps, Health burn/workouts,
  Health-sourced weigh-ins): the privacy policy promises HealthKit data is
  never disclosed to AI providers. Changing that needs an explicit opt-in and
  a policy update. The privacy policy now says coach messages include the
  logged-data summary.
- **Add Food back button:** any sub-view (review, editor, barcode) shows
  "← Back" (to the scan screen, draft kept) + ✕ close in the header.

## App shell v2 (Oct 14, 2026) — read before touching navigation

Ding's direction (spec: `design/V2_SPEC.md`). Built on top of ChatGPT's
food-flow commit (`c79e6fc`: durable scan jobs, drafts, review, evidence).

- **Tabs (superseded above):** Home · Train · **(+)** · Coach · Profile (`components/Layout.tsx`).
  The raised center + opens **Add Food**, a full-page `<dialog>`
  (`FoodDialog` + `.food-dialog` in index.css). Old tab ids still resolve:
  `journal` → Profile/History, `reflect`/`recomp` → Profile/Overview,
  `restaurants` → Add Food's Eats section (`switchTab` in MainApp).
- **Add Food** (`components/food/FoodComposer.tsx`): scan hero (camera,
  photos, barcode, describe) + sections **Recent · Favorites · Eats
  (RestaurantHub) · Quick add (FoodEditor)**. Logs to the dashboard's
  selected day (`logDate` prop).
- **Home** (`components/Dashboard.tsx`): one selected day at a time
  (`selectedDate` in MainApp, `toLocaleDateString()` format). Past days read
  from `dailyLogs`; today is live. Ring is signed (target − eaten). Energy =
  `computeEnergyBalance`; steps + per-day active energy come from
  `fetchDailySummaries(30)` (ephemeral, never written to the user doc).
- **HealthKit:** new native method `getDailySummaries({days})` +
  `stepCount` read type. **Needs a Codemagic build** — older builds simply
  show no steps. Privacy policy + Info.plist usage string mention steps.
- **Profile** (`components/ProfileHub.tsx`): stats, then History (old
  Journal) and Settings (Appearance + everything the old profile tab had).
  The old Overview/Reflect moved to the Progress tab.
- **Appearance** (`services/theme.ts`): `data-theme` (dark/light) and
  `data-tone` (charcoal/midnight/forest/plum/black) on `<html>`. All surface
  and ink colors are CSS variables (`--bg-dark`, `--bg-card`, `--ink`,
  `--ink-mid`, `--ink-light`, `--line`…). Older dark-only screens follow light
  mode through the "LIGHT MODE BRIDGE" overrides in index.css. **New UI must
  use the variables, not hex** (`bg-[var(--bg-card)]`, not `bg-[#1d1815]`).
  Saved per device (localStorage) and to `profile.appearance`.
- **Motion:** `.tap`, `.rise-in`, `.stagger`, `.bar-grow`, `.plus-idle` in
  index.css; tab slide in MainApp (motion/react). All off under reduced motion.
- `pushFoodToState` now writes `dailyLogs` only when a commit changed it
  (rollover or past-day log) — ChatGPT's version sent the whole history on
  every log.
- Dev preview with sample data, no Firebase: `npx vite` then
  `/design/preview.html` (`?tab=profile&section=settings&mode=light&add=1`).

## Two AI providers — deliberate split (Sept 2026)

The food scan runs on **OpenAI**; **everything else stays on Gemini**.
Gemini's macro estimates were not accurate enough, and that one feature is
the app's core promise. The other nine features were working fine, so they
were left alone — a full switch was built, tested and **reverted**
(`52cc4a1`) once, and survives on the `openai-migration` branch.

| Path | Cloud Function | Model | tokenUsage feature |
|---|---|---|---|
| Gemini | `callGemini` | `gemini-2.5-flash` | `sendChatMessage`, `analyzeDailyLog`, `fuelCoachIdeas` (server allowlist) |
| OpenAI | `processFoodAnalysis` (Firestore trigger) | `gpt-5.6-terra` + hosted `web_search`, Responses API, streamed | `analyzeFoodEntry` (`api: "responses"`, `webSearchCalls`) — **the live scan** |
| none | `lookupBarcode` | — | not logged (no AI) |
| none | `searchNutrition` | — | not logged (USDA + Open Food Facts) |

All share auth, the same daily quota bucket (50/user/day), usage logging and
ops counters. **GPT-6 Astra has no vision** — don't "upgrade" the scan to it.

**Verifying what ran:** Firestore → `tokenUsage` → newest doc (`model`, `api`,
`webSearchCalls`), or the admin **AI Usage** screen (Profile → Settings,
admin only).

Secrets: `GEMINI_API_KEY`, `OPENAI_API_KEY`, `USDA_API_KEY` (optional).
Setting a secret does nothing until `firebase deploy --only functions` binds
the new version to the running function.

## Food scan jobs (Oct 14, 2026) — how a scan actually runs

Built by ChatGPT (`c79e6fc`); design notes in `design/IMPLEMENTATION.md`.

1. Client (`components/food/FoodComposer.tsx` → `services/foodAnalysisJobs.ts`)
   builds the prompt with `prepareFoodAnalysis()` in `geminiService.ts` —
   that includes the relevance-gated USDA/OFF lookup, curated chain data and
   `SEARCH_SCAN_INSTRUCTIONS` — and calls **`startFoodAnalysis`** with a
   client-generated `jobId`.
2. `startFoodAnalysis` checks AI consent (`profile.acceptedAiDataSharing`)
   and quota, stores the input in Storage `foodAnalysisInputs/{uid}/…`, and
   creates `foodAnalysisJobs/{uid}_{jobId}` (`state: queued`).
3. **`processFoodAnalysis`** (onDocumentCreated) claims it, streams the
   Responses API call, and publishes real progress (`reading` → `searching`
   → `source_opened` with a domain → `validating` → `ready`/`failed`).
   90 s budget, one retry on 429/5xx, validates the JSON server-side
   (`validateFoodResult`). **There is no fallback pipeline** — a failure shows
   "Couldnt finish that lookup" with retry / enter-it-yourself.
4. The client watches the job doc (`onSnapshot`, owner-only read rule) and
   moves to review. `cancelFoodAnalysis` stops it. `cleanFoodAnalysis`
   (hourly) fails stalled jobs, deletes results after 48 h, sweeps orphan
   uploads. Account deletion removes jobs + inputs.
- Drafts (photos, note, edits, job id) persist on the device in IndexedDB
  (`services/foodDraftStore.ts`) so closing the app doesn't lose a meal.
- Saved foods carry `nutritionEvidence` (source, portion note, summary, up to
  8 source links, edited-by-user) — useful, but it grows the user doc.
- 12 regression tests: `node --experimental-strip-types --test tests/food-flow.test.mjs`
  (run `npm --prefix functions run build` first).
- Known looseness: `startFoodAnalysis` accepts client-built messages, so an
  authenticated user could send any prompt (per-user quota + the global
  spend breaker cap it; see Open items).

## Food scan accuracy overhaul (Oct 13, 2026) — why the prompt looks like it does

Problem: asking ChatGPT "what is this?" about a food photo gave a sensible
answer; the app gave nonsense. Causes, all fixed and still relevant to
`prepareFoodAnalysis` / `searchNutrition`:

1. **Typed text was treated as a food name.** "what is this" ran a USDA/OFF
   keyword search for those words and injected the hits as AUTHORITATIVE.
   Now `extractFoodQuery` (client) and `foodTokens` (server) drop questions
   and filler; no food words → no database search.
2. **No relevance check.** Server-side gate in `searchNutrition`: a hit must
   cover >= 60% of the food words and not be a different form (sauce,
   seasoning, powder, bar, juice…); branded hits the user didn't name are
   "low"; OFF no longer sorts by completeness. Prompt frames hits as
   **candidates to verify**.
3. **Search + vision in one call.** gpt-5.6-terra on the Responses API takes
   images and hosted `web_search` together (reasoning effort medium). The
   model identifies first, then searches only for named restaurants, brands
   or unfamiliar dishes. Output includes `identifiedAs` and `uncertainty`.
4. Photos upload at 1536 px / JPEG 0.85, `detail: high`.
- User-saved / AI-derived menu items are **never** sent as "VERIFIED MENU
  DATA" (ChatGPT caught that in my first version).

Cost: one model call per scan plus ~$0.01 per web search the model chooses
(`WEB_SEARCH_CALL_USD`, an estimate). Searched answers are not cached.

### Legacy scan paths — deleted (Oct 14, 2026, SEC-01)

The client-side scans (`analyzeFoodEntry*`, `lookupFoodOnWeb`), the
`callOpenAI` proxy and the `foodWebLookup` function are gone. Old
`foodLookupCache` docs are inert. The job pipeline is the only scan.

## Food lookup pipeline — order of truth

1. **Barcode** (`lookupBarcode`, no AI): Open Food Facts product API, then
   USDA branded foods matched on `gtinUpc`. Cached in `barcodeCache/{code}`
   (hits 180 d, misses 7 d). Native scanner on iOS, manual number entry on
   web. Items carry `source: "barcode"`.
2. **Curated menu DB** (`data/restaurants.ts`) for exact chain items — also
   browsable in Add Food → **Eats**.
3. **USDA / Open Food Facts** (`searchNutrition`), relevance-gated.
4. **Model's own web search** inside the scan job.
5. **Vision/text estimate** (same job call).

Review (`MealReview` in `components/food/FoodFlow.tsx`): dish name + totals,
evidence sentence, per-item ½ / 1 / 1½ / 2× against an **immutable base**
(`services/foodDraft.ts`), "Thats not it" (re-checks only that item), full
editor (`FoodEditor`, macros or per-ingredient grams). Nothing logs itself.
`services/foodCommit.ts` is the single idempotent save (stable ids, handles
midnight, logs to any date).

## Four deploy targets — they drift apart

This has caused more lost time than anything else in the project.

| Changed | Command |
|---|---|
| `firestore.rules`, `firestore.indexes.json`, `storage.rules` | `firebase deploy --only "firestore:rules,firestore:indexes,storage"` |
| `functions/` | `firebase deploy --only functions` (deploy **before** web when the app depends on new functions) |
| App code (`components/`, `MainApp.tsx`, `services/`, `public/`, `index.css`) | `.\deploy.ps1 -SkipPush` (after pushing) |
| Anything the iPhone runs, incl. `plugins/ding-health` / `ios/` | a **Codemagic build** |
| Docs only | just push |

`.\deploy.ps1` builds, deploys hosting, optionally pushes, then **verifies
both layers** (Firebase origin vs the Cloudflare edge). Use it instead of
running the commands by hand.

**iOS does NOT update from a deploy.** TestFlight builds are frozen snapshots;
only a Codemagic build ships new code to the phone. The Codemagic webhook is
**not wired** — start builds by hand (see "Working on this repo with Claude").

## Hard-won gotchas (do not relearn these)

1. **Cloudflare caches independently and ignores query strings.** A successful
   deploy can serve stale content for hours. Compare `dings-fitness.web.app`
   (origin) against `dings.fitness` (edge). Fix = Purge Everything.
2. **Never write to Firestore from inside an `onSnapshot` callback.** That
   pattern plus a large user doc produced ~200GB egress / $25 in two days
   (Aug 2026). See `handleUpdateAppState` — writes are diffed to changed
   fields only.
3. **The user document is one big doc and nothing trims it.** `dailyLogs`,
   `foodHistory`, `weighIns` grow forever; Firestore hard-caps at 1 MiB.
   Migrating to subcollections is the top v1.1 engineering task — do it while
   the user count is small. Profile pictures are downscaled to ~256px JPEG
   before storage for the same reason.
4. **PowerShell scripts must be plain ASCII.** Windows PS 5.1 reads UTF-8
   without BOM as ANSI; em dashes corrupt strings and produce nonsense parser
   errors.
5. **Build numbers must increase monotonically.** The script asks App Store
   Connect for the latest build + 1, but that lookup currently fails and it
   falls back to the epoch timestamp (e.g. 1791946985) — still monotonic, so
   harmless. Never go back to `epoch % 100000` (it wrapped every ~28 h).
6. **Imports must be at the top of `functions/src/index.ts`.** A mid-file
   import compiled to a TDZ `ReferenceError` and blocked all deploys.
7. **When a capability changes, hunt the prompt strings that assumed it.**
   Moving the food scan off Gemini removed its Google Search tool, but six
   prompt strings still ordered the model to "USE THE GOOGLE SEARCH TOOL" —
   inviting it to fabricate a lookup it never performed. This exact bug was
   fixed once in `b36f972` and reintroduced in `1566bef`. Prompts are code;
   `grep` them whenever a tool or provider changes.
8. **First deploy of a Firestore-triggered function fails** with an Eventarc
   service-agent "Permission denied" (happened to `processFoodAnalysis`).
   Wait ~3 minutes and redeploy just that function. Don't ship web that
   depends on it until it exists — scans would sit in `queued` forever.
9. **Codemagic "requires a provisioning profile with the HealthKit feature"
   can be a lie.** On #69/#70 the real error was earlier, in "Initialize
   keychain + create signing files": App Store Connect API **403 "A required
   agreement is missing or has expired"**. That step doesn't fail on the
   403. Read its log first; the fix is accepting the agreement in App Store
   Connect (account holder).

## Calorie model — deliberate design

- **Daily target** = `CALCULATE_MACROS(tdee…)` where `tdee = BMR × activity
  multiplier`. **Activity burn is NOT subtracted from it.** The multiplier
  already includes activity; subtracting logged workouts double-counted and
  made "calories left" mean different things on different days.
- **`calories left = target − eaten`. Always.** Do not make the target move
  with daily activity.
- **Energy card is informational only**: `computeEnergyBalance()` in
  `constants.tsx` returns `BMR + activeBurn + TEF`. It is **source-aware**:
  - Health data present → `activeEnergyBurned` is truth, logged workouts are a
    *component* of it, never added on top.
  - No Health data → NEAT estimated from activity level (conservative
    `NEAT_BASELINE`, 150–600), and logged workouts **do** add.
- The Home dashboard (`components/Dashboard.tsx`) shows burned energy via
  `computeEnergyBalance` with Apple Health active energy for the selected
  day when available, and **signed** calories left (negative = over).

## HealthKit — shipped in builds, not yet confirmed on a device

Custom local Capacitor plugin `plugins/ding-health` (Swift + TS), entitlements,
Info.plist usage strings, `HealthConnectCard`, privacy-policy section. Setup
notes: `HEALTHKIT_SETUP.md`. Reads only: active energy, **steps** (added Oct
14), today's workouts, latest body mass. Never writes.

- Native methods: `isAvailable`, `requestAuthorization`,
  `getTodayActiveEnergy`, `getTodayWorkouts`, `getLatestBodyMass`,
  **`getDailySummaries({days})`** (per-day steps + active energy via
  HKStatisticsCollectionQuery; feeds the dashboard's day switcher).
- JS wrapper `services/health.ts` never throws; older builds without a method
  just return empty data.
- Builds #71 and #72 compiled and signed with the HealthKit entitlement, but
  **nobody has confirmed on a real iPhone** that the permission prompt
  (now incl. steps), imports and step counts work. Adding a read type means
  the prompt appears again.
- Step counts and per-day active energy are **ephemeral** — read on device,
  never written to the user doc.

Still outstanding: the **App Privacy nutrition label** in App Store Connect
must declare health data before submission.

Double-counting is handled in `computeEnergyBalance()` — when Health supplies
active energy, logged workouts are a *component* of it, never an addition.
Don't "fix" that by adding them.

## Deliberate product decisions (don't "fix" these)

- **Restaurants group by cuisine, not health tier.** "Healthiest/Landmines"
  was removed as subjective and at odds with the app's ED-safety stance. The
  `tier` field remains in data because macro-fit ranking uses it internally,
  but it is never displayed.
- **One food entry point.** The center **+**, the dashboard's Add button,
  Fuel Coach picks and restaurant items all open the same Add Food page and
  save through `commitFood`.
- **Ding's navigation (Oct 14):** Home · Coach · (+) · Progress · Profile.
  Food-only: no workout planner. No Log tab — the dashboard's date bar
  replaces it; full history is Profile → History.
- **Voice:** `VOICE.md` (Cuodi's texting voice). Hidatsa words only from
  `MHA_LANGUAGE.md`; never invent new ones.
- Minimum-calorie safety floors exist on purpose (`getMinSafeCalories`).

## Open items

Ordered by what blocks what. "Unconfirmed" = raised but never confirmed done.

**Before submitting v1.0 (Ding):**
1. **On-device pass** — `audit/FUNCTIONAL_TEST_MATRIX.md` "Must be done by a
   human", on the Codemagic build from `207f1f4`+: real photo scan through
   the job pipeline, barcode, AI consent sheet (now also on Analyze Day and
   Fuel Coach), HealthKit prompt + steps, PDF export, past-day edit/delete,
   account deletion, light mode. On web: one signed-in scan, then the
   newest `tokenUsage` doc (`api: "responses"`).
2. **Gemini prepay** (deadline was Oct 12) — unconfirmed. If it wasn't done,
   coach chat, Fuel Coach and Analyze Day fail.
3. **OpenAI + Google Cloud spend limits** — unconfirmed. The in-app breaker
   ($25/day) is a backstop, not a replacement.
4. **App Store Connect:** listing text, screenshots (6.9" iPhone only),
   App Privacy label, age rating (override to 18+), availability, App
   Review notes + demo account — all in `APP_STORE_LISTING.md`.
5. **Codemagic upload emails**: check that #72's ITMS-91053 privacy-manifest
   warning (if any) doesn't recur on the new build.

**Engineering, next:**
6. **Firestore subcollection migration** (DATA-01, gotcha 3) — its own
   session, before public launch.
7. **App Check**: native iOS plugin, then enforcement (section "App Check").
8. **Scan prompt server-side**: `startFoodAnalysis` still accepts
   client-built messages (quota + breaker capped). Move
   `SEARCH_SCAN_INSTRUCTIONS` and the message assembly to the function.
9. Remaining audit P2s: AI-02 plausibility guard, NUT-03 adaptive window,
   DEL-01 complete deletion, DATA-03 multi-device writes, OBS-01 crash
   reporting + error boundary, SAFE-01, NUT-04, A11Y-01/02, SEC-03
   (`npm audit fix`; web still has grpc/protobufjs/ws/dompurify advisories),
   FUNC-04, AGE-01 is covered by the listing.
10. **iOS storage risks** (Firestore `persistentLocalCache`, IndexedDB
    drafts in WKWebView) — check on device.
11. Wire the Codemagic webhook so pushes build iOS automatically.
12. Tech debt: unused `FuelHome`, `BowLoader`, `SpotlightTour`,
    `WorkoutsHome`, `RecompVelocity`, and the workout split state still in
    MainApp; `firebase-functions` is flagged outdated (breaking upgrade);
    main JS bundle ~1.8 MB.

### Food-accuracy ideas not built yet

- **Accuracy regression set**: 15–20 meals with known macros (packaged,
  chain, local spot, home-cooked), rerun after every prompt/model change.
  Run the same photos through ChatGPT vs the app side by side.
- **Cache searched answers** from scan jobs.
- **Learn from corrections**: reuse a user's edited macros next time they
  log the same thing (saved foods already keep `nutritionEvidence.editedByUser`).
- **Nutritionix API** (paid) as a structured source for chains.
- `byModel` breakdown in `opsReport` (it already groups `byFeature`).

## Working on this repo with Claude (Cowork)

- **Standing rule (Ding, Oct 13): after ANY edit to the app, ship it as part
  of the task** — commit, push, deploy what changed (rules → functions → web,
  see "Four deploy targets"), then start a Codemagic build and watch it to
  the end. Don't ask first. Docs-only changes: commit + push only.
- The repo lives in the connected folder `Dings Fitness/ding! (2)` (Windows,
  CRLF files). The **device shell** (`device_bash`) has **no network** and no
  git credentials — use it for reading, editing and local git commits.
- **Push / deploy / npm from the Desktop Commander tools** — they run
  PowerShell on Ding's PC with his GitHub + Firebase logins and network.
  Their environment has `NODE_ENV=production`, which makes `npm install`
  skip dev deps (tsc, vite): prefix with `$env:NODE_ENV=""` and use
  `npm install --include=dev`. Long deploys outlive the 60 s bridge wait;
  poll with `list_sessions` / `read_process_output`, never re-run.
- **Big edits:** tar the source on the device, stage it, work in the cloud
  workspace (`npm ci` works there; `npx vite` + `/design/preview.html` +
  Playwright give real screenshots), then tar the changed files back and
  extract on the device. `device_commit_files` can serve a stale copy when
  re-using the same staged path — always use a fresh file name.
- **Codemagic:** use the Chrome browser named **"personal chrome"**
  (`select_browser`), not Opera GX (its tab groups break the extension). App
  = https://codemagic.io/app/6a20e6ff98dc5374825eecca (the other
  "dings-fitness", …42abba708d4b4b4c, is an old failed duplicate). Start new
  build → branch `main` → "iOS · TestFlight (main)". A build takes ~4 min.
- **Delete permission** for the folder must be granted **each session**, or
  git leaves `.git/*.lock` files and Ding's next git command fails with
  "index.lock exists".
- Claude can't sign in to the app (no passwords), so a live signed-in test
  needs Ding.
- Checks: `npx tsc --noEmit`, `npm --prefix functions run build`, the food
  tests above, `npx vite build --outDir <scratch>`.
