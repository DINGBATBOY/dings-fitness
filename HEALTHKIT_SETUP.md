# HealthKit (v1.1) — setup, testing & compliance

Auto-imports Apple Health / Apple Watch data so users stop logging activity by
hand. Everything in the codebase is done; this file is the **human checklist**:
the two things only you can do (Apple Developer portal + App Store Connect) and
what to verify on a real phone.

## What shipped in code

- **`plugins/ding-health/`** — a local, read-only HealthKit Capacitor plugin
  (custom Swift, because no off-the-shelf plugin supports Capacitor 6 *and*
  body mass). Reads today's active energy, today's workouts, latest weight.
  Added to `package.json` as `"ding-health": "file:./plugins/ding-health"`.
- **`services/health.ts`** — app-side wrapper. iOS-guarded, every call wrapped
  in try/catch; on web/Android/decline it returns "no data" and the app behaves
  exactly as before.
- **`MainApp.tsx`** — feeds the (previously unused) `healthActiveEnergy` prop to
  `FuelHome`, syncs on launch + foreground, auto-completes the matching split
  day, seeds weigh-ins (de-duped), plus a connect prompt and a Profile toggle.
- **`components/HealthConnectCard.tsx`** — the permission explainer.
- **iOS**: `NSHealthShareUsageDescription` in `Info.plist`,
  `ios/App/App/App.entitlements` with the HealthKit entitlement, and
  `CODE_SIGN_ENTITLEMENTS` wired into both build configs of `project.pbxproj`.
- **`public/privacy/index.html`** — new "Apple Health (HealthKit)" section.

### Energy math — unchanged on purpose
The daily calorie **target stays `target − eaten`**. Health data only feeds the
informational energy card via `computeEnergyBalance()`, which is already
source-aware: when Health active energy is present it is the source of truth and
logged workouts are shown as a *component* of it, never added on top. Today's
active energy is held in **ephemeral React state and never written to Firestore**,
so it cannot bloat the user doc (HANDOFF gotcha 3).

---

## 1. Apple Developer portal (required — do this first)

Automatic signing can only include a capability that is enabled on the App ID.

1. Go to <https://developer.apple.com/account/resources/identifiers/list>.
2. Open the identifier **`com.dings.fitness`**.
3. Enable the **HealthKit** capability. (Leave "Clinical Health Records" off —
   we don't use it.) Save.

Without this, the Codemagic build's `fetch-signing-files --create` will produce
a profile that doesn't grant HealthKit and the app will fail to read data (or
fail to install). This is a one-time step.

> The entitlements file and Info.plist string are already committed, so once the
> App ID has HealthKit enabled, the next Codemagic build signs correctly with no
> Xcode needed on your end.

## 2. Before the next Codemagic build

- **Optional, local only:** run `npm install` once in the repo so `ding-health`
  is linked into `node_modules` (needed only if you want to run `npx cap sync ios`
  locally). CI does this automatically via `npm ci`.
- Codemagic's pipeline (`npm ci` → typecheck → build → `npx cap sync ios` →
  `pod install`) picks up the plugin with no yaml changes: `cap sync` detects the
  `file:` plugin and adds `pod 'DingHealth'` to the Podfile plus `DingHealthPlugin`
  to `capacitor.config.json`'s `packageClassList`.
- Start a build manually (the webhook still isn't wired).

## 3. Test on a physical device (simulator HealthKit is unreliable)

Use an iPhone with real Health/Watch data, via TestFlight:

1. **Fresh install → dashboard shows the "Connect Apple Health" card.**
2. Tap **Connect** → the iOS Health permission sheet lists Active Energy,
   Workouts, and Weight. Toggle all on → **Allow**.
3. **Energy card** ("Calories burned today") flips from **Estimated** to
   **From Apple Health**; Active burn matches the Health app's Active Energy.
4. Confirm **no double-count**: if you also logged a workout in-app, total burn
   still equals Health's active energy (workouts appear as a component, not an
   addition). The calorie target above is unchanged.
5. **Weight**: with no manual check-in today, your latest Health weight appears
   as a check-in ("Synced … from Apple Health"). Do a manual check-in and
   confirm it is **not** overwritten and no duplicate is created.
6. **Workout auto-complete**: complete a Watch workout (≥10 min) on a day your
   split schedules a non-rest day → that day flips to complete once (re-open the
   app; it should not re-toast or double-log).
7. **Decline path**: on a second test account tap Connect then **Deny** every
   toggle → app stays in Estimated mode, no errors, fully usable.
8. **Profile → Apple Health** row shows Connected; **Disconnect** returns the
   card/estimate. (Full revoke is Settings → Health → Data Access & Devices.)
9. **Non-iOS**: web build shows no Health UI and works exactly as today.

---

## 4. App Store Connect — App Privacy nutrition label

App Store Connect → your app → **App Privacy → Edit**. Add (or confirm) the
**Health & Fitness** data category and set it as follows:

| Field | Selection |
|---|---|
| Data type | **Health** (and **Fitness**, for workouts/active energy) |
| Collected? | **Yes** |
| Linked to the user's identity? | **Yes** (stored under their account) |
| Used for tracking? | **No** |
| Purposes | **App Functionality** only |

Do **not** check Third-Party Advertising, Developer's Advertising or Marketing,
or Analytics for Health/Fitness data — HealthKit data is used only to run the
feature. This mirrors the privacy policy's HealthKit section.

If the review team asks: data is read-only, used solely in-app to show energy
balance / auto-complete workouts / seed weigh-ins, never sold, never shared with
third parties (including the Gemini AI provider), and only daily aggregates are
retained.

### Also expect
- Health-data apps get extra review scrutiny and often a request to see the
  permission-prompt copy — it's the `NSHealthShareUsageDescription` string in
  `Info.plist`, which states we don't use the data for ads and don't sell it.
- The App Store listing/metadata should not imply medical use.
