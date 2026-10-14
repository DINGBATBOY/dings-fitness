# Handoff — read this first in a new session

Fast context transfer for Ding! Fitness. Companion docs: `MONITORING.md`
(ops + deploy layers), `DEPLOY.md` (secrets/deploy), `ROADMAP.md` (what's next),
`APP_STORE_LISTING.md` (submission copy), `CUSTOM_GPT_INSTRUCTIONS.md`.

## Where things stand (Oct 13, 2026)

- **iOS**: v1.0, **not yet submitted**. Last TestFlight build is **#56, Aug
  12**. A Codemagic build was started Sept 18 for the OpenAI scan, but
  nothing since includes HealthKit-on-device verification, the consent
  sheet, or barcode scanning. Codemagic webhook is **not wired** — start
  builds by hand. ~9 users, all internal/TestFlight.
- **Web**: live at dings.fitness (Firebase Hosting behind Cloudflare). Last
  confirmed live build: `12ce6e9` (Sept 19). `3330580` (Cheddar's / venue-word
  fix) was committed Sept 20; check https://dings.fitness/version.json for
  what's actually live.
- **Unpushed / undeployed at time of writing:** `f461d9c` (barcode scanning,
  shared lookup cache, portion buttons) plus this handoff update. Needs
  `npm install` (new dependency), `firebase deploy --only functions` (two new
  functions) **and** `.\deploy.ps1`, then a Codemagic build. See Open items.
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
`openai-migration` branch if it's ever wanted. Verified working in prod on
Sept 18 (`tokenUsage` showed `gpt-5.6-terra`).

| Path | Cloud Function | Model | tokenUsage feature |
|---|---|---|---|
| Gemini | `callGemini` | `gemini-2.5-flash` | the other 9 |
| OpenAI | `callOpenAI` | `gpt-5.6-terra` | `analyzeFoodEntry` (pass 2: vision + JSON) |
| OpenAI | `foodWebLookup` | `gpt-5-search-api` | `foodRestaurantLookup` / `foodWebLookup` (pass 1) |
| none | `lookupBarcode` | — | not logged (no AI) |
| none | `searchNutrition` | — | not logged (USDA + Open Food Facts) |

`callOpenAI` is a **separate function**, not a provider flag inside
`callGemini`. All of them share auth, the same daily quota bucket, usage
logging and ops counters.

**Why two passes.** OpenAI cannot combine web search with vision + strict
JSON in one call. So pass 1 (`gpt-5-search-api`, in the `foodWebLookup`
function, prompts server-side) looks up the food, then pass 2
(`gpt-5.6-terra`) reads the photo/text with pass 1's findings injected.
Pass 1 fires for:

- **any meal from a named place** — curated chain or not. Curated menu data
  still wins for items it covers exactly. Place detection
  (`detectIndieRestaurantIntent`) is case-insensitive ("bowl from ted
  peters"), fires on venue words ("cheddars scratch kitchen", "... cafe",
  "... steakhouse") and real possessives ("joe's"), and ignores "at home",
  "from scratch", contractions, and times like "at 7pm". The Cheddar's bug
  (Sept 20) was exactly this: a bare restaurant name matched no rule, so no
  lookup ran.
- **a food USDA/OFF was queried for and missed** (no matches or only
  low-confidence ones). Items it grounds carry `source: "web_lookup"`.

**Pass 1 fails quietly, by design.** `lookupFoodOnWeb` (client) never throws
— a failed lookup degrades to an ordinary estimate — but it logs
`[lookupFoodOnWeb:<kind>] FAILED` to the browser console, and the server logs
`[foodWebLookup] upstream error <message>` in Functions logs. A working scan
only proves pass 2 ran.

**GPT-6 Astra was ruled out — it has no vision.** Don't "upgrade" to it.

**Verifying which provider actually ran:** Firestore → `tokenUsage` → the
newest doc's `model` field, or the admin **AI Usage** screen (Profile, admin
only: *Recent calls* with a model chip per call, plus *By model*). Pass-1
**cache hits write no `tokenUsage` doc** — check the browser console for
`cache hit`.

Secrets: `GEMINI_API_KEY`, `OPENAI_API_KEY`, `USDA_API_KEY` (optional).
Setting a secret does nothing until `firebase deploy --only functions` binds
the new version to the running function.

## Food lookup pipeline (Oct 2026)

Order of truth, best first:

1. **Barcode** (`lookupBarcode` function, no AI): Open Food Facts product
   API, then USDA branded foods matched on `gtinUpc`. Cached in
   `barcodeCache/{code}` (hits 180 d, misses 7 d). Client:
   `@capacitor/barcode-scanner` (native on iOS, html5-qrcode on web), the
   barcode button next to the camera in the food sheet. Items carry
   `source: "barcode"`.
2. **Curated menu DB** (`data/restaurants.ts`) for exact chain items.
3. **USDA / Open Food Facts text search** (`searchNutrition`). Now also runs
   when a photo is attached with a short typed name (<= 60 chars).
4. **Web lookup** (`foodWebLookup` function, `gpt-5-search-api`): named
   places always; foods USDA/OFF missed. Prompts live server-side now.
   Shared cache `foodLookupCache/{sha256(kind:normalized query)}`; found 90 d,
   not found 3 d. **Cache hits write no `tokenUsage` doc** — a scan with no
   `foodRestaurantLookup` entry may simply have been a cache hit; check the
   browser console for `[lookupFoodOnWeb:…] cache hit`.
5. **Vision/text estimate** (`callOpenAI`, `gpt-5.6-terra`).

Review screen: every item gets ½ / 1 / 1½ / 2× portion buttons (they scale
macros and ingredients from cached 1× values; typing a number by hand resets
the base) and an "Assumes: …" line from the model's `portionNote`.

Both cache collections are server-only (default-deny rule). To purge a bad
cached answer, delete its doc in the console.

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

Ordered by what blocks what. Status as of Oct 13 — anything marked
"unconfirmed" was raised but never confirmed done in chat.

1. **Ship `f461d9c`** (barcode, lookup cache, portions):
   ```powershell
   npm install                          # @capacitor/barcode-scanner is new
   git push
   firebase deploy --only functions     # lookupBarcode + foodWebLookup are new
   .\deploy.ps1
   ```
   Then on web: scan a barcode (try a protein bar), log "cheddars scratch
   kitchen <dish>" twice (second should be a console `cache hit`), and tap
   the portion buttons.
2. **Gemini postpay → prepay billing — deadline was Oct 12, 2026**
   (per Google's Aug 12 email; the earlier "Sept 14" note was wrong).
   Unconfirmed. If it wasn't done, the nine Gemini features (coach chat,
   onboarding macros, meal suggestions…) break.
3. **OpenAI spend limit.** Unconfirmed. Every food scan is a paid call and
   restaurant meals are two.
4. **Codemagic build + real-iPhone test.** First-ever run of HealthKit
   (`plugins/ding-health`), the AI consent sheet, and the native barcode
   scanner (`CapacitorBarcodeScanner` pod). Test: Health permission prompt
   and import, consent sheet on first scan, barcode scan.
5. **App Privacy label** in App Store Connect per `APP_STORE_LISTING.md` §9
   (Health & Fitness + Photos, shared with third parties for App
   Functionality). Unconfirmed.
6. **Submit v1.0.** Done already (Sept 18): privacy policy / terms / in-app
   legal name OpenAI, Gemini, USDA + Open Food Facts; one-time AI consent
   sheet gates food scan + coach chat (`acceptedAiDataSharing`, Guideline
   5.1.2(i)); `ITSAppUsesNonExemptEncryption=false`. Known gap: onboarding
   sends body stats to Gemini *before* the consent sheet; it relies on the
   sign-up terms checkbox. Moving consent into sign-up would close it.
7. **Cloud Functions Node 20 decommission Oct 30, 2026.** Code is on Node
   22; it ships with the next functions deploy (item 1 covers it).
8. **Firestore subcollection migration** (gotcha 3) — before user count grows.
9. Wire the Codemagic webhook so pushes build iOS automatically.

### Food-accuracy ideas not built yet

- **Accuracy regression set**: 15–20 meals with known macros (packaged,
  chain, local spot, home-cooked), rerun after every prompt/model change.
  Prompts have regressed twice (gotcha 7). Nothing measures accuracy today.
- **Learn from corrections**: when a user edits macros on the review
  screen, save their version and reuse it next time they log the same thing.
- **Nutritionix API** (paid) as a structured source for chains and
  plain-English entries, replacing some web searches.
- `byModel` breakdown in `opsReport` (it already groups `byFeature`).

## Working on this repo with Claude (Cowork)

- The repo lives in the connected folder `Dings Fitness/ding! (2)`. The
  device shell there has **no network**: `npm install` / `npm view` fail.
  For a new dependency, generate `package-lock.json` in the cloud workspace
  (`npm install <pkg> --package-lock-only`) and copy it back; typecheck
  locally needs the package unpacked into `node_modules` by hand, or the
  user runs `npm install`.
- `git push` from Claude fails (no GitHub credentials there) — the user
  pushes.
- Git in the connected folder leaves `.git/*.lock` files unless Claude has
  **delete permission** for the folder; grant it when asked or the user's
  next git command fails with "index.lock exists".
- Checks Claude can run: `npm run typecheck`, `cd functions && npx tsc
  --noEmit -p .`, `npx vite build --outDir <scratch>`.
