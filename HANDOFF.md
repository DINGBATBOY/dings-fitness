# Handoff — read this first in a new session

Fast context transfer for Ding! Fitness. Companion docs: `MONITORING.md`
(ops + deploy layers), `DEPLOY.md` (secrets/deploy), `ROADMAP.md` (what's next),
`APP_STORE_LISTING.md` (submission copy), `CUSTOM_GPT_INSTRUCTIONS.md`.

## Where things stand (Sept 2026)

- **iOS**: v1.0, **not yet submitted**. Last TestFlight build is **#56, Aug
  12** — well behind `main`. Codemagic builds from `main` but the webhook is
  not wired, so nothing builds until you start it by hand. ~9 users, all
  internal/TestFlight.
- **Web**: live at dings.fitness (Firebase Hosting behind Cloudflare).
- **Backend**: Firebase Cloud Functions. **Two AI providers on purpose** —
  see the next section.
- A weekly **ops agent** ("ding-ops-check", Mondays) checks uptime, deploy
  freshness, backend cost risk, and scans for code regressions.

## Two AI providers — deliberate split (Sept 2026)

The food-macro scan runs on **OpenAI**; **everything else stays on Gemini**.
Gemini's macro estimates were not accurate enough, and that one feature is
the app's core promise. The other nine features were working fine, so they
were left alone rather than migrated wholesale — a full switch was built,
tested and **reverted** (`52cc4a1`) once before, and survives on the
`openai-migration` branch if it's ever wanted.

| Path | Function | Model | Features |
|---|---|---|---|
| Gemini | `callGemini` | `gemini-2.5-flash` | the other 9 |
| OpenAI | `callOpenAI` | `gpt-5.6-terra` | `analyzeFoodEntry` |
| OpenAI | `callOpenAI` | `gpt-5-search-api` | `foodRestaurantLookup` |
| OpenAI | `callOpenAI` | `gpt-5-search-api` | `foodWebLookup` |

`callOpenAI` is a **separate function**, not a provider flag inside
`callGemini` — nine working features had no reason to share that risk. Both
share auth, the same daily quota bucket, usage logging and ops counters.

**Why two passes.** OpenAI cannot combine web search with vision + strict
JSON in one call. So pass 1 (`gpt-5-search-api`) looks up a named
restaurant's dish, then pass 2 (`gpt-5.6-terra`) reads the photo with pass
1's findings injected as context. Pass 1 fires for **any meal from a named
place** — curated chain or not (changed Sept 19; curated menu data still wins
for items it covers exactly). Place detection is case-insensitive ("bowl from
ted peters") and ignores "at home", "from scratch", times like "at 7pm". Packaged food USDA/OFF already
grounds skips it. Third trigger (Sept 19): a
text-only food that USDA/OFF was queried for and **missed** (no matches, or
only low-confidence ones) gets a generic web lookup, feature `foodWebLookup`;
items it grounds carry `source: "web_lookup"` (UI badge "Web lookup").

**The two passes fail differently, and this matters for debugging.** Pass 2
fails loudly — a bad key throws and the scan visibly errors. Pass 1 fails
*silently* by design (`lookupRestaurantDish` swallows everything and returns
`''`), so a broken search model degrades to an ordinary estimate with no
visible symptom. A working scan only proves pass 2 ran.

**GPT-6 Astra was ruled out — it has no vision.** Don't "upgrade" to it.

**Verifying which provider actually ran:** Firestore → `tokenUsage` → check
the newest doc's `model` field. Feature name alone is not proof —
`analyzeFoodEntry` was the feature name on the Gemini path too. Only
`foodRestaurantLookup` is unique to OpenAI.

Secrets: `GEMINI_API_KEY`, `OPENAI_API_KEY`, `USDA_API_KEY` (optional).
Setting a secret does nothing until `firebase deploy --only functions` binds
the new version to the running function.

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
7. **When a capability changes, hunt the prompt strings that assumed it.**
   Moving the food scan off Gemini removed its Google Search tool, but six
   prompt strings still ordered the model to "USE THE GOOGLE SEARCH TOOL" —
   inviting it to fabricate a lookup it never performed. This exact bug was
   fixed once in `b36f972` and reintroduced in `1566bef`. Prompts are code;
   `grep` them whenever a tool or provider changes.

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

## HealthKit — written, NEVER RUN ON A DEVICE

Built in `7969bde` + `cc42718` (Aug 23) as a **custom local Capacitor
plugin**, `plugins/ding-health` (not an off-the-shelf package). Includes
`DingHealthPlugin.swift`, entitlements, both Info.plist usage strings,
`components/HealthConnectCard.tsx`, MainApp wiring, and a HealthKit section
added to the published privacy policy. Setup notes: `HEALTHKIT_SETUP.md`.

**It has never executed.** The last TestFlight build (#56) predates the
commit, and HealthKit does not work in the simulator. Treat every part of it
as unverified until a Codemagic build runs on a physical device — the first
build is where entitlement, permission-prompt and pod-linking problems will
surface, and none of that can be checked from here.

Still outstanding: the **App Privacy nutrition label** in App Store Connect
has to declare health data before submission. Apple applies extra scrutiny
to HealthKit apps.

Double-counting is already handled in `computeEnergyBalance()` — when Health
supplies active energy, logged workouts render as a *component* of it, never
an addition. Don't "fix" that by adding them.

## Deliberate product decisions (don't "fix" these)

- **Restaurants group by cuisine, not health tier.** "Healthiest/Landmines"
  was removed as subjective and at odds with the app's ED-safety stance. The
  `tier` field remains in data because macro-fit ranking uses it internally,
  but it is never displayed.
- **One food entry point.** The dashboard tile, the global +, and the Journal
  button all open the same unified sheet.
- Minimum-calorie safety floors exist on purpose (`getMinSafeCalories`).

## Open items

Ordered by what blocks what.

1. **Deploy the OpenAI food scan.** Set the secret, then *both* targets —
   the function alone changes nothing, because the client is what decides to
   call it:
   ```powershell
   firebase functions:secrets:set OPENAI_API_KEY
   firebase deploy --only functions
   .\deploy.ps1
   ```
   Then **spot-check accuracy on real meals with known macros** — accuracy
   is the entire reason for the switch, so an untested deploy proves
   nothing. Test on **web, not TestFlight** (#56 predates all of this and
   will still call Gemini). Confirm pass 1 fired by looking for a
   `foodRestaurantLookup` doc in `tokenUsage`, not just a working scan.
2. **Set a spend limit on the OpenAI project.** Every scan is now a paid
   call and the two-pass path can fire twice. The per-user daily quota caps
   one account's abuse, not total spend. The $25 Firestore surprise was the
   cheap version of this lesson.
3. **Gemini postpay → prepay billing migration — was due Sept 14, 2026.**
   That date has passed; verify it actually happened or nine features break.
4. **Codemagic build.** iOS is ~5 weeks behind and carries the first-ever
   run of HealthKit. Batch it rather than spending a build number per
   change.
5. Wire the Codemagic webhook so pushes build iOS automatically.
6. Submit v1.0 to the App Store. Before submitting: fill the App Privacy
   label per `APP_STORE_LISTING.md` §9 (Health & Fitness + Photos, shared
   with third parties for App Functionality) and install a HealthKit build
   on a real iPhone. Done Sept 18: privacy policy / terms / in-app legal now
   name OpenAI; one-time AI data-sharing consent sheet gates the food scan
   and coach chat (`acceptedAiDataSharing` on the profile, Guideline
   5.1.2(i)); `ITSAppUsesNonExemptEncryption=false` in Info.plist.
7. Cloud Functions Node 20 decommission Oct 30, 2026 (code is on 22; ships
   on next functions deploy).
8. Firestore subcollection migration (see gotcha 3).

The admin **AI Usage** dashboard (Profile, admin only) now shows *Recent
calls* with the model for each, plus a *By model* breakdown. That's the
fastest in-app way to confirm a food scan hit `gpt-*` and not `gemini-*`.

Nice-to-have: add a `byModel` breakdown to `opsReport` — it already groups
`byFeature`, and with two providers billing, per-model cost is the number
you'll actually want.
