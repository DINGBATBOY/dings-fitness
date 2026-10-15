# App Store Submission Checklist — Ding! Fitness v1.0

Status key: ✅ verified · ❌ fails · ⚠️ needs change · ⬜ cannot be verified from code (do it in App Store Connect or on a device)
"Required" = universally required for any app. "Applies" = required because of a feature this app has.

## A. Binary and project (verifiable from code)

| Item | Scope | Status | Evidence / action |
|---|---|---|---|
| Built with Xcode 26 / iOS 26 SDK (required for uploads since Apr 28, 2026) | Required | ✅* | `codemagic.yaml` `xcode: latest`; #72 uploaded. *Confirm the Xcode version in the #72 log. |
| Bundle id `com.dings.fitness` matches the ASC record | Required | ✅ | `project.pbxproj:358`, `codemagic.yaml` |
| Version 1.0, monotonically increasing build number | Required | ✅ | `MARKETING_VERSION = 1.0`; epoch fallback (HANDOFF gotcha 5) |
| Deployment target iOS 15.0 | Required | ✅ | Capacitor 6 minimum 13; fine |
| Device family | Required | ❌ | `TARGETED_DEVICE_FAMILY = "1,2"` → iPad screenshots required. **Set to 1** or support iPad (STORE-02). |
| Orientations | Required | ⚠️ | iPhone landscape declared but unsupported → portrait only (UX-03). |
| App icon 1024 px, single-size asset | Required | ✅ | `AppIcon-512@2x.png` 1024×1024, RGB, no alpha (checked). |
| Launch screen | Required | ✅ | `LaunchScreen.storyboard` + splash 2 s |
| Usage strings: Camera, Photo Library, Photo Add, Health Share/Update | Applies | ✅ | `Info.plist`. Photo *Add* claims "save exported reports and progress photos", but no code saves to the photo library (grep found none). Remove the key or fix the text (P3). |
| HealthKit entitlement + capability | Applies | ✅ | `App.entitlements` (`healthkit`, `access` = []) |
| HealthKit UI clearly identifies Health use | Applies | ✅ | `HealthConnectCard`, Settings toggle |
| **PrivacyInfo.xcprivacy** (app) with required-reason APIs | Applies | ❌ | Missing; Filesystem plugin uses file timestamps (STORE-03). |
| Third-party SDK manifests | Applies | ⚠️ | Capacitor/Cordova ship (empty) manifests; other plugins don't. Covered by the app manifest above. |
| Export compliance key | Required | ✅ | `ITSAppUsesNonExemptEncryption = false` |
| Push / background modes / universal links | n/a | ✅ | None declared, none used |
| Sign in with Apple | n/a | ✅ | Email/password only, no third-party social login → 4.8 doesn't apply |
| In-app account deletion | Applies | ⚠️ | Exists (Settings → Delete account), but leaves residue (DEL-01) |
| No debug or test UI for normal users | Required | ⚠️ | Admin dashboard gated ✅; "Fuel Coach GPT key" visible to all (FEAT-01) |
| No placeholder or dead features reachable | Required | ✅ | Train tab removed; dead code unreachable |
| Capacitor iOS security patch | Applies | ❌ | 6.2.1 → 6.2.2 (SEC-02) |
| Crash-free first launch on device | Required | ⬜ | No device available |

## B. Guidelines that apply to this app

| Guideline | Status | Note |
|---|---|---|
| 1.4.1 Physical harm (health/medical accuracy) | ⚠️ | Disclaimer ✅, safety floors ✅; but the 800 kcal custom floor (SAFE-01), minors on deficits (LEGAL-01), and implausible-AI-value gaps (AI-02) |
| 2.1 App completeness | ⬜ | Requires a working demo account and a real scan run (never done by a human, per HANDOFF) |
| 2.3.1 / 2.3.3 Accurate metadata, screenshots | ❌ | Listing and screenshots advertise removed workout features (STORE-01) |
| 4.2 Minimum functionality (WebView app) | ✅ | Native camera, barcode, HealthKit, sharing |
| 5.1.1 Privacy policy in-app + URL; data minimization; deletion | ⚠️ | Policy linked in-app and at /privacy ✅; inaccurate on Analytics and HealthKit (PRIV-01/03) |
| 5.1.2(i) Explicit permission before sharing with third-party AI | ❌ | Analyze Day, Fuel Coach, onboarding bypass consent (PRIV-02) |
| 5.1.3 Health data | ❌ | HealthKit weight reaches Gemini (PRIV-01) |
| 3.1 IAP / subscriptions | n/a | Free, no purchases (`LegalModal.tsx:344`) |
| 1.2 UGC | n/a | No content shared between users |

## C. App Store Connect (cannot be verified from code)

| Item | Status | What to do |
|---|---|---|
| App name "Ding! Fitness" (≤30), subtitle | ⬜ ⚠️ | Pick a food-only subtitle; "Macros + workouts, your way." is now inaccurate |
| Description, promotional text, keywords | ⚠️ | Rewrite: remove "Personalized Workouts", "Workouts built around your gym", "training volume", and keywords `workout,split,gym,recomp` |
| Screenshots 6.9" (and 13" iPad if universal) | ❌ | Existing set shows the removed training plan and old tabs; retake on the fixed build |
| App previews | ⬜ | Optional |
| Privacy Nutrition Label | ⬜ ⚠️ | Must match reality: Contact Info (email), Health & Fitness (incl. HealthKit, steps), Photos, User Content (coach messages, food notes), Identifiers (user ID), **Usage Data/Analytics if Google Analytics stays**; "shared with third parties" = Yes (OpenAI, Google) for App Functionality; Tracking = No. HANDOFF open item 4: unconfirmed. |
| Accessibility declarations (Nutrition Labels for accessibility, new in 2025–26) | ⬜ | Declare only what you've tested (VoiceOver, larger text currently ❌, dark mode ✅, reduced motion ✅) |
| Support URL | ⚠️ | `https://dings.fitness` redirects to the landing page; make sure a visible support contact is on it |
| Privacy policy URL | ✅ | `https://dings.fitness/privacy/` (content needs the PRIV fixes) |
| Age rating questionnaire (new 2025 system: 4+/9+/13+/16+/18+) | ⚠️ | `APP_STORE_LISTING.md §8` expects 4+ under the old system. New questions (medical/wellness topics, etc.) apply to new submissions; "infrequent health/wellness topics" maps to **9+**. Answer honestly; if the min age goes to 18 (LEGAL-01), set the rating and Terms consistently. |
| App Review contact | ⬜ | Name, phone, email |
| Demo account + instructions | ⬜ | Create a dedicated reviewer account with onboarding done. Note: the consent sheet appears on first scan; HealthKit is optional; give a sample food to scan. The listing's suggestion "cuodibeltran+review@gmail.com / their own password" is not a usable credential. |
| Export compliance | ✅ | Plist key set |
| Content rights | ⬜ | Restaurant nutrition facts are public; brand names used descriptively; Open Food Facts data is ODbL (attribution shown per item ✅; `barcodeCache` stores OFF records, so check share-alike obligations for a derived database) |
| Pricing and availability | ⬜ ⚠️ | **Limit to the United States** until DATE-02 is fixed |
| Subscription metadata | n/a | |
| Notes for Review | ⬜ | Mention: food-only tracker; AI estimates are reviewed by the user before logging; AI providers named; HealthKit read-only and never sent to AI (true only after PRIV-01) |
| Apple Developer agreements current | ⬜ | Gotcha 9: an expired agreement broke #69/#70 |

## D. Before pressing Submit

1. Fix every P1 in `CRITICAL_ISSUES.md`, run the audit tests (`node --test audit/tests/nutrition-audit.test.mjs` → 26/26), and run Codemagic.
2. On a real iPhone with that build: the full flow in `FUNCTIONAL_TEST_MATRIX.md` "Must be done by a human".
3. Confirm the Gemini prepay switch and OpenAI and Google spend limits (HANDOFF items 2–3).
4. Update the listing, screenshots, privacy label and age rating; set availability; add the reviewer account.
