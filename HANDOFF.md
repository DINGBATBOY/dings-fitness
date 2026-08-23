# Handoff — read this first in a new session

Fast context transfer for Ding! Fitness. Companion docs: `MONITORING.md`
(ops + deploy layers), `DEPLOY.md` (secrets/deploy), `ROADMAP.md` (what's next),
`APP_STORE_LISTING.md` (submission copy), `CUSTOM_GPT_INSTRUCTIONS.md`.

## Where things stand (Aug 2026)

- **iOS**: v1.0, build target ready, **not yet submitted**. Codemagic builds
  from `main`. ~9 users, all internal/TestFlight.
- **Web**: live at dings.fitness (Firebase Hosting behind Cloudflare).
- **Backend**: Firebase Cloud Functions, Gemini (`gemini-2.5-flash`) proxied
  through `callGemini`. AI spend is trivially small (~$0.004/week).
- A weekly **ops agent** ("ding-ops-check", Mondays) checks uptime, deploy
  freshness, backend cost risk, and scans for code regressions.

## Three deploy targets — they drift apart

This has caused more lost time than anything else in the project.

| Changed | Command |
|---|---|
| App code (`components/`, `MainApp.tsx`, `services/`, `public/`) | `.\deploy.ps1` **and** a Codemagic build for iOS |
| `functions/` | `firebase deploy --only functions` |
| Docs only | just push |

`.\deploy.ps1` builds, deploys hosting, pushes, then **verifies both layers**
(Firebase origin vs the public Cloudflare edge) and tells you which is stale.
Use it instead of running the commands by hand.

**iOS does NOT update from a deploy.** TestFlight builds are frozen snapshots;
only a Codemagic build ships new code to the phone. The Codemagic webhook is
**not wired**, so pushes do not auto-build — start builds manually.

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
5. **Build numbers must increase monotonically.** They're now derived from the
   latest App Store Connect build + 1. (Previously epoch % 100000, which wrapped
   every ~28h and made old builds look newer.)
6. **Imports must be at the top of `functions/src/index.ts`.** A mid-file
   import compiled to a TDZ `ReferenceError` and blocked all deploys.

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
- `FuelHome` already accepts a `healthActiveEnergy` prop, currently unused.

## Next up: HealthKit (v1.1)

Goal: auto-import so users stop logging activity by hand.

- Plugin candidates: `@capgo/capacitor-health`, `capacitor-health-extended`.
- Needs: HealthKit capability in Xcode, `NSHealthShareUsageDescription` in
  Info.plist, physical device to test (simulator support is poor).
- Wire reads to: **active energy → `healthActiveEnergy` prop** (already
  plumbed), **workouts → auto-complete the day's split**, **body mass →
  auto weigh-ins**.
- **Compliance**: privacy policy needs a HealthKit section (Apple forbids
  using health data for ads or selling it) and the App Privacy nutrition
  label must be updated. Expect extra review scrutiny.
- Watch for double-counting: once Health provides active energy, manual
  workout logs must render as a breakdown, not an addition. The calculator
  already handles this — just pass the prop.

## Deliberate product decisions (don't "fix" these)

- **Restaurants group by cuisine, not health tier.** "Healthiest/Landmines"
  was removed as subjective and at odds with the app's ED-safety stance. The
  `tier` field remains in data because macro-fit ranking uses it internally,
  but it is never displayed.
- **One food entry point.** The dashboard tile, the global +, and the Journal
  button all open the same unified sheet.
- Minimum-calorie safety floors exist on purpose (`getMinSafeCalories`).

## Open items

- Submit v1.0 to the App Store.
- **Gemini postpay → prepay billing migration — do before Sept 14, 2026** or
  AI calls start failing.
- Cloud Functions Node 20 decommission Oct 30, 2026 (code is on 22; ships on
  next functions deploy).
- Wire the Codemagic webhook so pushes build iOS automatically.
- Firestore subcollection migration (see gotcha 3).
