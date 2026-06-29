# Ding! Fitness — App Store Listing

_Everything you need to submit. Copy → paste into the right App Store Connect field._
_Last updated: 2026-06_

---

## 1. App Name + Subtitle

| Field | Value | Char limit |
|---|---|---|
| **App Name** | Ding! Fitness | 30 |
| **Subtitle** | Your path, your trail. | 30 |

Subtitle alternatives if the first one doesn't grab you:
- "Track food. Train. No noise."
- "Macros + workouts, your way."
- "AI macros. Smarter trail."

---

## 2. Promotional Text

_(170 char limit. Updateable without re-submission, so safe to iterate.)_

```
Adaptive macros that adjust to your trend. AI photo food logging. Workouts built around your gym. No streak shame, no feed — just your path.
```

---

## 3. Description

_(4000 char limit. The first 3 lines are what shows above the "more" fold. Lead with the voice.)_

```
Yooo. Welcome to your path.

Ding! is the fitness app for people who want to start but dont know where to. Track food, train, log everything in between. The AI figures out what you ate from a photo. Your calorie target adapts every week so you stop guessing. Workouts get built around YOUR equipment, YOUR schedule, YOUR energy.

What you get:

• AI Food Logging — Snap a photo, type it, or scan the label. Macros figured out in seconds.
• Adaptive Targets — Your weekly calorie target adjusts based on your actual weight trend. The trail bends to you.
• Restaurant Cheat Code — 44 chains pre-loaded with verified macros. Chipotle, Sweetgreen, Subway, Cava — tap a meal, log it, done.
• Personalized Workouts — A 7-day split built around your training experience, available days, session length, and equipment. Beginner to advanced. Full gym to bodyweight.
• Weekly + Monthly Wrapped — Look back on your week or month with the energy of a Spotify recap. Top foods, longest trail, training volume, patterns.
• Honest Safety — Calorie targets clamp to safe minimums. Eating disorder helpline in the disclaimer. We will not gamify your body.

Whats different:

No social feed. No streak shame. No "you missed a day, here's guilt." Just a tracker that texts back like a friend who actually wants you to win.

Built honoring the languages of the Three Affiliated Tribes — Hiraaciréʼ (Hidatsa), Numakiki (Mandan), Sáhniš (Arikara). Cultural vocabulary appears throughout the app, supported by the MHA Language Project.

Privacy is non-negotiable. Your data is yours. No selling, no sharing. Delete your account anytime — your data leaves with you.

Get on the trail.
```

---

## 4. Keywords

_(100 char total limit, comma-separated, no spaces after commas. Don't repeat words from the app name or description — Apple already indexes those.)_

```
macros,calorie counter,meal tracker,nutrition,workout,split,gym,recomp,adaptive,ai food,protein
```

That's 95 characters. Tight.

---

## 5. What's New in This Version

_(For v1.0 — first release. 4000 char limit but keep it short.)_

```
First release. Welcome to your path.
```

That's it. For a first release, less is more.

---

## 6. URLs

| Field | URL |
|---|---|
| **Support URL** | https://dings.fitness |
| **Marketing URL** *(optional)* | https://dings.fitness |
| **Privacy Policy URL** *(required)* | https://dings.fitness/privacy/ |

---

## 7. Category

| Field | Value |
|---|---|
| **Primary** | Health & Fitness |
| **Secondary** *(optional)* | Food & Drink |

---

## 8. Age Rating questionnaire

_(App Store Connect → App Information → Age Rating → Edit. Click through these honestly.)_

Expected outcome: **4+**.

| Question | Answer | Why |
|---|---|---|
| Cartoon or Fantasy Violence | None | |
| Realistic Violence | None | |
| Sexual Content or Nudity | None | |
| Profanity or Crude Humor | **Infrequent / Mild** | The app's voice uses casual profanity ("damn," "the hell") in toasts/copy. Honest answer. Won't bump above 4+ on its own. |
| Alcohol, Tobacco, or Drug Use or References | None | |
| Mature/Suggestive Themes | None | |
| Horror/Fear Themes | None | |
| Medical/Treatment Information | **Infrequent/Mild** | The app tracks nutrition + provides a calorie target. Not diagnostic. Disclaimer in onboarding makes this clear. |
| Gambling | None | |
| Unrestricted Web Access | None | |
| Made for Kids | **No** | |

---

## 9. Privacy Nutrition Label

_(App Store Connect → App Privacy → Get Started. This is what shows on your App Store page as "Data Linked to You" / "Data Not Linked.")_

**Data we collect — what to declare:**

| Data Type | Purpose | Linked to user? | Used for tracking? |
|---|---|---|---|
| Email Address | App Functionality, Account Management | **Yes — linked** | No |
| Name | App Functionality | Yes — linked | No |
| Health & Fitness data (weight, body fat, macros, workouts) | App Functionality, Product Personalization | Yes — linked | No |
| Other Diagnostic Data (food log entries, AI usage counters) | Analytics, App Functionality | Yes — linked | No |
| Photos | App Functionality (food scan, profile pic) | Yes — linked | No |

**What we do NOT collect:**
- Location
- Contacts
- Browsing history
- Search history (outside the app)
- Financial info
- Sensitive info beyond what's in the health bucket

**Third-party SDKs to disclose:**
- Firebase (authentication, Firestore database, Cloud Functions, Analytics) — Google
- Gemini API (via your own Cloud Function proxy, not direct from device) — Google
- USDA FoodData Central + Open Food Facts (server-side queries only)

**Key answer: "Used for tracking"** → **No** for everything. You don't have ads, don't share with data brokers, don't track across other apps/websites.

---

## 10. Export Compliance

For TestFlight + App Store submission, Apple asks if your app uses encryption.

**Answer:** No — only standard HTTPS/TLS via Firebase. No proprietary cryptography. Saves you from filing the longer form.

---

## 11. Screenshots — what to capture

Apple requires at least **3 screenshots** per device size. Take **6** for safety. Required device sizes for iPhone-only apps in 2026:

| Size | Resolution | Device example |
|---|---|---|
| **6.9"** | 1290 × 2796 px | iPhone 16 Pro Max, 15 Pro Max |
| **6.7"** *(or 6.5")* | 1284 × 2778 px | iPhone 14/13/12 Pro Max |
| **6.1"** | 1179 × 2556 px | iPhone 16 Pro, 15 Pro |

If you only have one device on hand, capture at the largest size — Apple will downscale automatically for the smaller targets, *but* they'll show better quality if you submit native captures for each.

### The 6 shots to take, in order

These are the ones that tell your app's story. Take them in this order on a real device with TestFlight installed:

1. **Dashboard / Daily Balance ring** (Fuel tab, after logging a few foods) — the hero shot. Shows the cream theme, the calorie ring, the tracking row, the quick-burn pills.
2. **Eats tab — restaurant grid** with the "What fits your day" macro-fit card visible at top. Shows the restaurant DB is real.
3. **Add Food → AI photo scan** mid-result. After Gemini returns macros for a real food photo. Shows the AI feature.
4. **Reflect / Wrapped** — the inline view showing top foods + your trail. The Spotify-style moment.
5. **Onboarding chat** — one of the questions mid-conversation. Shows the personality / voice from the start.
6. **Workout split (Dings tab)** — one day expanded showing exercises with reps. Shows the workout generation is real.

### Capturing technique

- **Volume Up + Side button** on iPhone → screenshot.
- Best lighting/state: scroll to top, no notifications dropped down, no banners. Aeroplane mode if you want to hide signal/wifi bars (battery + signal show on every shot anyway).
- Don't add overlay text/marketing flair — Apple is fine with raw UI screenshots and they look more honest.

### Pulling them off the phone (without a Mac)

- AirDrop → can't on Windows.
- iCloud Photos → install iCloud for Windows, photos sync to your PC.
- Email yourself the screenshots.
- Or use any cloud sync (Google Photos, Dropbox).

Drop the 6 final screenshots into App Store Connect → App Information → Media Manager → Screenshots → 6.9" Display (drag in), repeat for 6.1".

---

## 12. App Icon

Must be **1024 × 1024 PNG, no alpha channel, no transparency.** App Store Connect → App Information → App Icon.

If you don't have a polished icon ready, the bare-minimum acceptable one is the wordmark **DING!** on a cream background with the feather arrow above it. Simple, on-brand, faster than commissioning.

You can also generate a clean version from your Mati-Watsā mockup if you have it as a vector.

---

## 13. Pre-submission checklist

Before hitting "Submit for Review":

- [ ] App icon uploaded (1024×1024)
- [ ] 6+ screenshots uploaded for at least 6.9" Display
- [ ] App description pasted in (use the version above)
- [ ] Subtitle pasted in
- [ ] Promotional text pasted in
- [ ] Keywords pasted in
- [ ] What's New pasted in
- [ ] Support URL filled in
- [ ] Privacy Policy URL filled in
- [ ] Category selected (Health & Fitness)
- [ ] Age Rating questionnaire completed (should land at 4+)
- [ ] App Privacy nutrition label filled in
- [ ] Export Compliance answered (No proprietary crypto)
- [ ] Build selected from TestFlight (the latest one with the voice + tour)
- [ ] App Review Information filled in (your name, phone, email — Apple may contact you if review has questions)
- [ ] Sign-in info provided for review (if your app requires login, give them a test account: cuodibeltran+review@gmail.com / their own password)
- [ ] Notes for review (one paragraph: "Ding! is a personal fitness tracking app with AI food logging. No in-app purchases. Test account credentials provided. Camera permission requested for food photo scanning. No content moderation needed — no user-generated content shared between users.")

---

## 14. After submission

- Apple usually reviews within **24–48 hours** for first submissions.
- **Expect one rejection round.** It's normal. The reasons are usually one of:
  - Missing privacy disclosure for a data type you forgot
  - Unclear app description
  - Camera/Photo permission strings not clear enough (yours are — already verified)
  - Test account login didn't work
- The rejection email cites the **specific Guideline number** (e.g. 2.1, 5.1.1). Search "App Store Review Guidelines [number]" — Apple's docs are clear.
- Fix, resubmit, usually approved within another 24–48 hours.

---

## 15. After approval

- **Manual release** (recommended for first launch) — Apple approves but doesn't make it live until you press the button. Gives you control.
- **Phased release** (optional) — Apple slowly rolls out to your existing users over 7 days. Doesn't apply on first launch since you have no existing users; turn on for v1.1+.

When you tap **Release**, it usually appears in the App Store search within 1–2 hours.
