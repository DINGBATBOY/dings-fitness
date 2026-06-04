# Ding! Fitness — Native (iOS) Setup

End-to-end runbook for taking the current web app and shipping it to the
App Store via Capacitor + cloud CI. Read top-to-bottom the first time.

**Decisions already locked in:**
- Bundle ID: `com.dings.fitness`
- App name: `Ding! Fitness`
- iOS first, Android later
- Build via cloud CI (Codemagic recommended, GitHub Actions provided as alt)

---

## Phase 1 · Install Capacitor locally (~10 min)

You're on Windows. These commands work on Windows.

```bash
cd "C:\Users\Cuodi\Documents\Claude\Projects\Dings Fitness\ding! (2)"

# Pull in the new Capacitor deps that were added to package.json
npm install

# Verify the install worked
npx cap --version
```

If `npm install` errors with the `@rollup/rollup-...` optional-deps bug,
delete `node_modules` and `package-lock.json` and re-run `npm install`.

## Phase 2 · Scaffold the iOS project (~5 min)

```bash
# Build the web bundle first — Capacitor copies it into ios/
npm run build

# Generate the ios/ folder (Xcode project, Podfile, Info.plist, etc.)
npx cap add ios

# Sync the dist/ output into the iOS bundle
npx cap sync ios
```

After this you should have a new `ios/` folder. **Commit it to the repo** —
the CI builds depend on these files being checked in.

```bash
git add ios/ package.json package-lock.json capacitor.config.ts codemagic.yaml .github/
git commit -m "Add Capacitor + iOS scaffolding"
git push
```

## Phase 3 · Create the App Store Connect app record (~10 min)

Apple's portal where every iOS app lives.

1. Go to https://appstoreconnect.apple.com/apps
2. Click `+` → `New App`
3. Fill in:
   - **Platform:** iOS
   - **Name:** Ding! Fitness *(public, can be changed pre-launch)*
   - **Primary Language:** English (U.S.)
   - **Bundle ID:** `com.dings.fitness` *(should already appear in the
     dropdown if you registered it at developer.apple.com first — if not,
     go to https://developer.apple.com/account/resources/identifiers/list,
     click `+`, type App IDs, enter `com.dings.fitness`)*
   - **SKU:** `dings-fitness-ios-001` *(any unique string; not user-visible)*
   - **User Access:** Full Access
4. Once created, note the **Apple ID** shown at App Information →
   General Information. It's a 10-digit number like `1234567890`. You'll
   paste it into `codemagic.yaml` (or use it for GH Actions).

## Phase 4 · Pick a CI path

### Option A · Codemagic (recommended, easier signing)

1. Sign up at https://codemagic.io with your GitHub account.
2. Add this repo as a new app.
3. **App Store Connect API key** (one-time):
   - At https://appstoreconnect.apple.com/access/integrations/api click
     `Generate API Key` → role `App Manager`.
   - Download the `.p8` file. Note the **Key ID** and **Issuer ID**.
   - In Codemagic → Teams → Integrations → "App Store Connect":
     upload the .p8 + paste Key ID + Issuer ID.
4. **iOS code signing** (Codemagic handles it for you):
   - In Codemagic → this app → Settings → iOS code signing.
   - Mode: `Automatic`. Team: yours. Bundle ID: `com.dings.fitness`.
   - Codemagic generates the cert + provisioning profile and stores them
     for future builds. No base64 hell.
5. Edit `codemagic.yaml`:
   - Find `APP_STORE_APPLE_ID: 0000000000` and replace with the 10-digit
     Apple ID from Phase 3 step 4.
6. Push to `main`. Codemagic kicks off the build, archives, uploads to
   TestFlight. You get an email when it's ready.

### Option B · GitHub Actions (more setup, free)

Open `.github/workflows/ios-testflight.yml` — the top comment block walks
through the 7 secrets you need to add to your GitHub repo. The bottleneck
is generating the .p12 distribution cert and the .mobileprovision profile,
which require macOS access at least once. If you don't have any Mac access
at all, Option A is the better path.

If you go this route, **delete `codemagic.yaml`** so the same build doesn't
fire twice.

## Phase 5 · TestFlight smoke test (~30 min after first CI build)

1. App Store Connect → TestFlight → Internal Testing → `+ Create Group`
   → name it `Internal`. Add yourself as a tester.
2. When CI uploads the .ipa, the build appears in TestFlight after 5–15 min
   of Apple processing.
3. Approve it for internal testing (tap the build, accept Export Compliance:
   "No, this app doesn't use encryption" *unless your AI calls use custom
   crypto, which they don't — Firebase + HTTPS is standard*).
4. Install TestFlight on your iPhone. Accept the invite email. Install
   Ding! Fitness from TestFlight.
5. **Smoke-test these flows on real hardware:**
   - Sign up → email/password flow
   - Onboarding chat (12 questions including workout prefs)
   - Health disclaimer acceptance
   - Add food (manual + AI scan with camera)
   - Browse Eats tab → tap a restaurant → log an item
   - Open Reflect tab → see Wrapped inline
   - Edit profile → flip auto-favorite toggle
   - Sign out → sign back in (verify data persists across sessions)
   - Permission prompts: camera, photo library

If anything fires the JS error boundary or crashes, fix and re-push. Each
push = a new TestFlight build.

## Phase 6 · App Store listing prep (~2–3 hrs)

The metadata that makes the public store page. Required before submission:

| Field | Notes |
|---|---|
| **Screenshots** | Required sizes (in App Store Connect → App Information → Media Manager): 6.7" (iPhone 16 Pro Max), 6.1" (iPhone 16/15). 3–10 per size, PNG/JPEG, RGB color space. Take with iOS Simulator or real device. |
| **App icon** | 1024×1024 PNG, no alpha. Match your Dusk Trail palette + feather motif. |
| **Description** | Up to 4000 chars. Reuse copy from `public/landing.html` — adapt for the App Store voice. |
| **Promotional Text** | 170 chars. Updateable without re-submission. |
| **Keywords** | 100 chars total, comma-separated. e.g. `fitness,nutrition,macros,calorie,workout,trail,wrapped` |
| **Support URL** | `https://dings.fitness` |
| **Marketing URL** | `https://dings.fitness` |
| **Privacy Policy URL** | `https://dings.fitness/privacy/` ← already exists |
| **Category** | Primary: Health & Fitness. Secondary (optional): Food & Drink. |
| **Age Rating** | Click `Edit` → questionnaire. Honest answers — no objectionable content, no gambling, no user-generated content (v1). |
| **Privacy Practices** | App Store Connect → App Privacy → fill out the data-collection labels. You collect: email, name, body metrics, dietary logs. All used for app functionality. None sold. None linked to third-party identifiers. |

## Phase 7 · Submit for review

1. App Store Connect → this app → `1.0 Prepare for Submission`.
2. Select the TestFlight build you smoke-tested.
3. Confirm everything is filled in.
4. Hit `Add for Review` → `Submit for Review`.
5. Apple review usually 1–3 days. Expect possibly one rejection round —
   common reasons are missing privacy disclosures or unclear app description.
   The Guideline number in the rejection email tells you exactly what's
   wrong; fix and re-submit.

---

## Going forward

Every push to `main` = a new TestFlight build automatically. For App Store
updates after launch, you bump the marketing version (`1.0` → `1.1`) in
Xcode's project settings (or in `ios/App/App/Info.plist` directly), push,
and submit the new build for review through App Store Connect.

## Android (later)

Run the same `npx cap add android` flow when you're ready. Android can
build from Windows with Android Studio — no Mac required. Google Play
Developer account is $25 one-time.

---

## Glossary

- **Bundle ID** — Unique app identifier in reverse-DNS format. PERMANENT
  after first submission. Yours: `com.dings.fitness`.
- **.ipa** — Compiled iOS app binary. What you upload to TestFlight.
- **TestFlight** — Apple's beta-distribution channel. Required step before
  public App Store launch.
- **App Store Connect API Key** — Lets CI tools upload builds without
  needing your Apple ID password. Lives at appstoreconnect.apple.com.
- **Provisioning Profile** — The "license" that says your cert is allowed
  to sign apps with this bundle ID. Codemagic regenerates them automatically.
