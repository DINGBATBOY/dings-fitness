# Ding! Fitness — App Store Listing

_Everything you need to submit v1.0. Copy → paste into the right App Store Connect field._
_Last updated: 2026-10-14 (food-only app; matches the code after the pre-launch audit fixes)_

Ding! is a **food-tracking app**: snap or describe a meal, review the macros,
log it. Workouts are logged only as calories burned; there is no workout
planner. Don't describe anything the binary doesn't do (Guideline 2.3.1).

---

## 1. App Name + Subtitle

| Field | Value | Limit |
|---|---|---|
| **App Name** | Ding! Fitness | 30 |
| **Subtitle** | Snap it. Know your macros. | 30 (26 used) |

Subtitle alternatives:
- "AI food log and macro coach" (27)
- "Photo food log, real macros" (27)
- "Calories and macros, no noise" (29)

---

## 2. Promotional Text

_(170 limit. Can be changed any time without a new build.)_

```
Snap a photo, scan a barcode or just describe it. Ding! works out the macros, shows you where the numbers came from, and lets you fix anything before it logs.
```

---

## 3. Description

_(4000 limit. The first three lines show above "more".)_

```
Yooo. Logging food shouldn't feel like homework.

Ding! is a food tracker that works out what you ate from a photo, a barcode or a quick note, then shows you the macros and where they came from. You check it, tweak it, log it. That's it.

What you get:

• Photo and text food logging — Snap your plate or type "chicken bowl, extra rice". Ding! identifies the food, estimates the portion and breaks it into calories, protein, carbs and fat.
• Barcode scanning — Packaged foods come straight from Open Food Facts and USDA product data.
• You stay in control — Every result opens on a review screen first: change portions (½, 1, 1½, 2×), edit any number, or say "that's not it" and re-check one item. Nothing logs itself.
• Eats — 44 restaurant chains with published menu macros. Chipotle, Sweetgreen, Chick-fil-A, Subway, Cava and more. Tap an item, log it.
• Your day at a glance — Calories left, macros, water and a balance card that shows what you've eaten against what you've burned. Step back to any past day and fix it.
• Progress — 7- and 30-day charts for calories against your target, eaten vs burned, macros and your weight trend, plus a monthly Wrapped.
• Coach — Ask what to eat with what's left today, get ideas for eating out, cooking or snacks, or ask how your week went. The coach sees your logged food and targets, not your Apple Health data.
• Apple Health (optional) — Bring in steps, active energy, workouts and weight so the balance card reflects your real day. Ding! only reads from Health and never writes to it.
• Targets that make sense — Your daily calories and macros come from your stats, activity level and goal, with safe minimums built in. Log workouts as calories burned.

What's different:

No social feed. No streak shame. No "you missed a day" guilt. Just a tracker that texts back like a friend who wants you to win.

Built honoring the languages of the Three Affiliated Tribes — Hiraaciréʼ (Hidatsa), Numakiki (Mandan), Sáhniš (Arikara), supported by the MHA Language Project.

Privacy: your data is yours. No ads, no selling, no third-party analytics. AI features ask for your permission first, and you can delete your account and data any time from Profile.

Ding! is for adults 18 and over. It's a nutrition tool, not medical advice.
```

---

## 4. Keywords

_(100 limit, comma-separated, no spaces. Don't repeat words from the name or subtitle; Apple indexes those.)_

```
calorie counter,food log,nutrition,protein,meal tracker,barcode scanner,diet,AI,restaurant,carbs
```

96 characters.

---

## 5. What's New in This Version

```
First release. Snap it, check it, log it.
```

---

## 6. URLs

| Field | URL |
|---|---|
| **Support URL** | https://dings.fitness |
| **Marketing URL** _(optional)_ | https://dings.fitness |
| **Privacy Policy URL** _(required)_ | https://dings.fitness/privacy/ |

---

## 7. Category

| Field | Value |
|---|---|
| **Primary** | Health & Fitness |
| **Secondary** _(optional)_ | Food & Drink |

---

## 8. Age Rating (2025 questionnaire: 4+ / 9+ / 13+ / 16+ / 18+)

App Store Connect → App Information → Age Rating → Edit. Answer honestly,
then **override to 18+**: the Terms of Service require users to be 18 or
older (Gemini API terms bar apps likely to be used by under-18s), and Apple
says that when your terms set a minimum age above the calculated rating you
must override to it.

| Section | Question | Answer | Why |
|---|---|---|---|
| In-App Controls | Parental Controls | No | |
| | Age Assurance | No | Age is self-declared at sign-up (18+ checkbox + onboarding check), not verified. |
| Capabilities | Unrestricted Web Access | No | No in-app browser. Links open Safari/Mail. |
| | User-Generated Content | No | Nothing a user writes is shown to other users. |
| | Social Media | No | |
| | Messaging and Chat | No | No user-to-user messaging. The AI coach is not a person. |
| | Advertising | No | |
| Mature Themes | Profanity or Crude Humor | **Infrequent** | Casual voice in toasts ("damn", "LETS GOOOO"). |
| | Horror/Fear Themes | None | |
| | Alcohol, Tobacco, or Drug Use or References | None | Drinks can be logged as food, nothing more. |
| Medical or Wellness | Medical or Treatment Information | None | No diagnosis or treatment advice; a nutrition-tool disclaimer and an eating-disorder helpline are shown. |
| | Health or Wellness Topics | **Yes** | Calorie targets, macros, weight trend. |
| Sexuality or Nudity | all three | None | |
| Violence | all four | None | |
| Chance-Based Activities | Gambling, Simulated Gambling, Contests, Loot Boxes | None | |
| Age Categories and Override | | **Override to Higher Age Rating → 18+** | Matches the Terms. Calculated rating would be 9+. |
| | Made for Kids | No | |

---

## 9. App Privacy (nutrition label)

App Store Connect → App Privacy. This matches the code after the Oct 2026
fixes **and** `ios/App/App/PrivacyInfo.xcprivacy`; change both together.

**Tracking: No** for every type (no ads, no data brokers, no cross-app tracking, no analytics SDK).

| Category → Data type | What it is in Ding! | Purposes | Linked to user |
|---|---|---|---|
| Contact Info → **Email Address** | Sign-in email | App Functionality | Yes |
| Contact Info → **Name** | First name for greetings | App Functionality | Yes |
| Health & Fitness → **Health** | Weight, body fat, height, food and nutrition logs, targets; Apple Health body weight when the user connects Health (saved as a weigh-in) | App Functionality, Product Personalization | Yes |
| Health & Fitness → **Fitness** | Workouts the user logs as calories burned | App Functionality, Product Personalization | Yes |
| User Content → **Photos or Videos** | Food photos (sent for analysis, deleted after the scan finishes or within 48 h), optional profile picture | App Functionality | Yes |
| User Content → **Other User Content** | Coach chat messages, food notes and descriptions, saved notes | App Functionality | Yes |
| Identifiers → **User ID** | Firebase account ID | App Functionality | Yes |
| Usage Data → **Product Interaction** | AI usage records (which AI feature, when, token counts) used for quotas and cost monitoring | App Functionality, Analytics | Yes |
| Other Data → **Other Data Types** | Age and biological sex (for calorie targets) | App Functionality, Product Personalization | Yes |

**Not collected:** Location, Contacts, Browsing History, Search History,
Financial Info, Purchases, Sensitive Info, Diagnostics (no crash reporting
yet), Advertising Data, Device ID. Apple Health **steps, active energy and
Health workouts stay on the device** (read for the balance card, never
uploaded), so they are not "collected".

**Who processes it (service providers, App Functionality only):**
- Google Firebase — Authentication, Firestore, Cloud Functions, Cloud Storage. **No Google Analytics** (removed Oct 2026).
- OpenAI — food photos and the user's note for the food scan (only after the in-app AI consent sheet).
- Google Gemini — coach chat, Fuel Coach and Analyze Day: logged food, targets, goal and profile stats, **never Apple Health data** (only after the AI consent sheet).
- USDA FoodData Central and Open Food Facts — food search words and barcodes, sent from our server, not linked to the user.
- Apple HealthKit — read-only, on device.

---

## 10. Export Compliance

**No proprietary encryption** — standard HTTPS/TLS only.
`ITSAppUsesNonExemptEncryption = false` is already in Info.plist.

---

## 11. Screenshots

The binary is **iPhone only** (`TARGETED_DEVICE_FAMILY = 1`), so no iPad
screenshots are needed. Apple needs one iPhone set: **6.9" display**
(1320 × 2868 or 1290 × 2796, portrait). Smaller sizes are scaled from it.
Take **6** on a real iPhone with the current TestFlight build (after the
Oct 2026 fixes), signed in with a demo account that has a week of food.

| # | Screen | How to get there | What it shows |
|---|---|---|---|
| 1 | **Home** | Home tab, today, after 3–4 meals | Calories-left ring, macros, balance card, the date bar |
| 2 | **Add Food — scan** | Center **+** | Camera / photos / barcode / describe, Recent and Favorites |
| 3 | **Review** | Scan a real plate, wait for the result | Dish name, items with ½ / 1 / 1½ / 2× portions, the "where this came from" line |
| 4 | **Progress** | Progress tab, 7 days | Calories vs target chart, eaten vs burned, weight line |
| 5 | **Coach** | Coach tab, ask "what should I eat with what's left?" | A reply that uses the real numbers |
| 6 | **Eats** | + → Eats | Restaurant list with menu macros |

Optional 7th: **Wrapped** (Progress → Wrapped).

Do not reuse the old set in `app-store/screenshots/iphone-6-9/` — it shows
the removed Train tab (`04-training-plan.png`) and old Reflect screen
(`05-weekly-reflect.png`).

Capture: Volume Up + Side button. No notifications on screen. Move the
files to the PC with iCloud Photos for Windows or by emailing them to
yourself, then drag them into App Store Connect → the version → iPhone 6.9".

---

## 12. App Icon

1024 × 1024 PNG, no alpha. Already in `ios/App/App/Assets.xcassets`; App
Store Connect takes it from the build.

---

## 13. App Review Information

- **Sign-in required: Yes.** Make a demo account just for review (for
  example `cuodibeltran+review@gmail.com`) with a week of logged food, a
  weigh-in, and AI consent **not** yet accepted, so the reviewer sees the
  consent sheet. Put the email and password in App Store Connect only.
- **Notes for review** (paste):

```
Ding! is a food-tracking app for adults (18+). Sign in with the demo account above.

AI: the first time you use a food scan, the coach, Fuel Coach or Analyze Day, the app asks permission to send that data to OpenAI (food photos and notes) or Google Gemini (coach). Nothing is sent before you agree, and the server also checks this. Food can always be logged by hand.

Apple Health is optional (the Connect Apple Health card on Home). Ding! only reads steps, active energy, workouts and body weight to show calories burned. Health data is never sent to AI providers and Ding! never writes to Health.

Camera is used for food photos and barcodes. No in-app purchases, no ads, no user-to-user content. Account deletion: Profile > Settings > Delete Account.
```

---

## 14. Pre-submission checklist

- [ ] Build from Codemagic after the Oct 2026 fixes selected for the version
- [ ] 6+ iPhone 6.9" screenshots from that build (section 11)
- [ ] Subtitle, promotional text, description, keywords, What's New (sections 1–5)
- [ ] Support + Privacy Policy URLs (section 6)
- [ ] Category: Health & Fitness / Food & Drink
- [ ] Age rating questionnaire answered and **overridden to 18+** (section 8)
- [ ] App Privacy label matches section 9
- [ ] Export compliance: no proprietary encryption
- [ ] App Review Information: demo account + notes (section 13)
- [ ] Availability: decide countries (day keys are now locale-safe; see HANDOFF)
- [ ] OpenAI and Google spend limits set; Gemini prepay confirmed
- [ ] On-device pass in `audit/FUNCTIONAL_TEST_MATRIX.md` done

---

## 15. After submission

- First reviews usually take 24–48 hours. One rejection round is normal.
- Common reasons: a data type missing from the privacy label, a
  description that promises something the build doesn't do, a demo account
  that doesn't work. The email cites the guideline number.

## 16. After approval

- **Manual release** for v1.0 (approve, then press Release yourself).
- **Phased release** from v1.1 on.
