# ding-health

A tiny, **read-only** HealthKit bridge for Ding! Fitness. Local Capacitor 6
plugin — not published to npm; consumed via `"ding-health": "file:./plugins/ding-health"`.

## Why a custom plugin

None of the off-the-shelf health plugins support Capacitor 6 *and* read body
mass: `@capgo/capacitor-health` is Capacitor 7+, `capacitor-health-extended`
was unpublished, and `@perfood/capacitor-healthkit` tops out at Capacitor 4/5.
This reads exactly what the app needs and nothing more, keeping the App Store
health-data review narrow and adding no dependency that would block a future
Capacitor upgrade.

## Surface

- `isAvailable()` — HealthKit present on this device.
- `requestAuthorization()` — read permission sheet for the three types.
- `getTodayActiveEnergy()` — cumulative active kcal since local midnight.
- `getTodayWorkouts()` — workouts started today (type, duration, kcal).
- `getLatestBodyMass()` — most recent weight sample.

No writes, no background delivery, no raw-sample streaming.

## Source of truth

- Native: `ios/Sources/DingHealthPlugin/DingHealthPlugin.swift`.
- App-side wrapper (guards + graceful fallback): `services/health.ts` in the app.
- The `dist/` folder is committed pre-built so the app's toolchain never has to
  build this package. If you edit `src/`, rebuild with `tsc` and commit `dist/`.

## Integration

`npx cap sync ios` detects this package (via the `capacitor` key in
`package.json`) and adds `pod 'DingHealth'` to the Podfile plus `DingHealthPlugin`
to `capacitor.config.json`'s `packageClassList`. HealthKit capability and the
`NSHealthShareUsageDescription` string live in the app's iOS project.
