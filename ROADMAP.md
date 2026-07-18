# Ding! Fitness — Roadmap

_Last updated: 2026-05-29_

This is the working priority list for getting Ding! Fitness shipped on the App
Store + Google Play, and the v1.1+ improvements that come after launch.
Items already shipped are marked ✅ and kept for reference.

---

## 🚀 Recently Shipped (across recent sessions)

| Item | Notes |
|---|---|
| ✅ Cross-account data leak fix | Per-uid `localStorage` namespacing + auth-listener cache clear + forced-remount via `key={uid}`. |
| ✅ Eating disorder safety floors + health disclaimer | 1,500/1,200 kcal minimum, 75% TDEE floor, onboarding interstitial, one-time modal for existing users, ED helpline in disclaimer. |
| ✅ Email setup (support@dings.fitness) | Cloudflare Email Routing → Gmail forward + Gmail "Send mail as" alias. |
| ✅ Privacy / Terms / Disclaimer public URLs | Static HTML at `dings.fitness/privacy/`, `/terms/`, `/disclaimer/`. Content mirrors `LegalModal.tsx`. |
| ✅ Body-composition-aware BMR (Katch-McArdle) | Auto-switches from Mifflin-St Jeor when body fat % is provided. |
| ✅ Food image recognition v2 | Split label vs meal handling, ingredient-level breakdown for meals, source + confidence badges, quantity / sanity-check guardrails. |
| ✅ Dashboard overhaul | Hero strip with greeting/date/streak indicator, polished Activity Burn with personalized burn estimates, compact Hydration strip, meal-grouped food log (Breakfast/Lunch/Snacks/Dinner/Late), custom activity modal replacing `prompt()`. |
| ✅ Restaurant Hub (Eats tab) | Replaced Curator tab. 44 restaurants seeded across all 5 tiers, ~220 menu items, tier filter chips, search, restaurant detail with quantity stepper + tap-to-log. |
| ✅ Token tracking + admin dashboard | Per-call `tokenUsage` collection, per-user lifetime totals on `quotas/{uid}`, admin-only dashboard (gated by `ADMIN_UIDS`) with by-feature + by-user breakdowns and cost estimates. |
| ✅ Bug fixes + copy trims | Sign-up checkboxes (13+ and Terms agreement) fixed — triple-toggle race condition removed. Macro/calorie screen copy trimmed. |
| ✅ Food Search Phase 1 — modifier-aware restaurant lookup | `ComponentItem` schema + Chipotle (23 items) + Sweetgreen (24 items) ingredient breakdowns. Prompt handles "double X", "no X", "light X", build-from-scratch with explicit math. |
| ✅ Favorites + history dedup + undo + close buttons | Star toggle on history entries, auto-favorite at 5+ logs, dedupe by label so re-logging bumps existing entry, undo toast on activity burn, X close buttons on food add + edit profile modals. |
| ✅ Food Search Phase 2 — USDA + Open Food Facts | `searchNutrition` Cloud Function with optional USDA key + always-on OFF, injected into Gemini prompt as authoritative context, client-side source override, debug chip showing which DBs fired + skip reasons. |
| ✅ Macro-fit AI meal suggestions | "🎯 What fits your day" card at top of Eats tab. Scoring engine ranks all 220 menu items by calorie fit, protein contribution, goal tags, popularity, and tier. Live recompute as user logs through the day. |
| ✅ Marketing landing page at `dings.fitness/` | `public/landing.html` (477 lines) + `firebase.json` redirects `/` → `/landing.html`. App Store Marketing URL ready. |
| ✅ Workout personalization | `WorkoutPreferences` schema (experience / daysPerWeek / sessionMinutes / equipment) collected in onboarding + editable in profile. `generateSmartSplit` reads them and shapes exercise pool, volume, and structure to each user's training context. |
| ✅ Wrapped-style summary page | "Spotify Wrapped" vibe — `components/Wrapped.tsx` overlay with hybrid scroll + hero animations. Weekly + Monthly toggle, vibe-based headline by consistency %, top foods, training volume, body changes, patterns. Launcher on dashboard + auto-prompt at the start of each calendar month (uid-namespaced localStorage marker, 5-day-data threshold). |
| ✅ Auto-favorite toggle | Edit Profile now has a toggle for `autoFavoriteEnabled`. Default ON (matches existing behavior); user can opt out. |
| ✅ Generic undo (food add + delete) | Extended the activity-burn undo pattern to two new flows. Food add: snapshots item IDs, undo removes them by ID. Delete: snapshots item + original index, undo splices it back at the same position. 5s window each, single Undo button in the toast picks the freshest pending undo. |
| ✅ Tab restructure (7 → 6) | Recomp absorbed into a new Reflect tab (Wrapped inline + Recomp Velocity below). Profile moved behind the header avatar tap. Dock is now Fuel · Eats · Log · Reflect · Dings · Coach. Old `recomp` deep-link still resolves to Reflect. |
| ✅ Inline Wrapped mode | `<Wrapped inline />` renders as page content for the Reflect tab; overlay mode preserved for the auto-prompt at month start. |
| ✅ Voice + feather pass (medium) | Streak badge 🔥 → 🪶 "X-day trail". Splash status lines softened ("NEURAL PERFORMANCE ENGINE ONLINE" → "🪶 TRAIL PREPARED / STRENGTH GATHERED"). Toasts: "Fuel Logged" → "Marked", "Entry Deleted" → "Removed from your trail", burn copy → "X kcal · movement noted". Wrapped closing → "The trail continues / Walk on, {Name}." Lucide Feather glyph for the Reflect dock icon + Wrapped hero chip + Wrapped closing card. Email placeholder "athlete@dings.com" → "warrior@dings.com". |
| ✅ Dusk Trail palette + chrome cleanup | New CSS variables (`--primary` terracotta `#d97757`, `--accent` ochre `#d4a55a`, `--alert` warm red, plus `--rose-dusk` + `--cream`). Background `#050505` → `#0d0a08`. Dropped heavy `shadow-[0_0_20px_...]` glows on toast/FAB/avatar/onboarding/Stats. Replaced `from-orange-500 to-pink-500` gradients with solid dusk tones on toast, FAB, Wrapped hero/launcher, coach bubbles, splash, sign-in button. Removed cyberpunk scanline overlay + ping pulse from sticky header. `.glass-panel` flattened (no steep linear gradient). |

---

## P0 — Pre-Launch Ship Blockers

_Must be done before App Store submission._

| Item | Status | Effort | Notes |
|---|---|---|---|
| Apple Developer enrollment | In progress (Ding) | — | $99/yr, 1–3 day approval. Unblocks everything below. |
| Sign in with Apple | Conditional | ~2 hrs | Only required by Apple Guideline 4.8 if a social sign-in (Google/Facebook/etc) is added. Current `Auth.tsx` is email/password only — if we ship that way, this is NOT a blocker. Revisit if Google Auth is added later. |
| Capacitor wrap for iOS/Android | Not started | 3–4 hrs | Native packaging of the web app. Required for both stores. Can hit dependency snags. |
| App Store + Play Store listing prep | Not started | 2–3 hrs | Screenshots (~5 per size), description copy, privacy nutrition label, age rating. |

---

## P1 — High Impact Pre-Launch

_Significantly improve what ships._

| Item | Status | Effort | Notes |
|---|---|---|---|
| More restaurant components | Not started | 1.5 hrs | Subway, Cava, Qdoba, Moe's, Jersey Mike's. Same pattern as Chipotle/Sweetgreen — `components: []` array per restaurant. **Last open P1 item.** |
| ✅ Auto-favorite settings UI toggle | Shipped | — | Toggle lives in Edit Profile. |
| ✅ Generic undo for food log + delete | Shipped | — | Same 5s undo pattern as activity-burn; toast button picks the freshest pending undo. |
| ✅ Food Search Phase 2 (USDA + OFF) | Shipped | — | Cloud Function `searchNutrition` integrated. USDA + Open Food Facts both queried, results injected as authoritative context. |
| ✅ Macro-fit AI meal suggestions | Shipped | — | "What fits your day" card on Eats tab, live recompute, smart copy by daily progress. |

---

## Tech Debt / Cleanup

_Surfaced by 2026-05-29 codebase scan. Non-blocking but worth doing._

| Item | Effort | Notes |
|---|---|---|
| Delete `components/FoodCurator.tsx` | 5 min | Replaced by Restaurant Hub. Never imported. 153 lines of dead code. |
| Delete `components/Stats.tsx` | 5 min | Superseded by Wrapped. Never imported. 404 lines of dead code. |
| Typography pass | 2–3 hrs | Orbitron is still the dominant display font — main remaining cyberpunk signal after the Dusk Trail palette. Consider keeping Orbitron only for the "DINGS" wordmark and moving display headings to Inter (already in stack) or a warm serif like Fraunces. |
| Sweep remaining `text-orange-XXX` / `bg-pink-XXX` Tailwind classes in non-hero areas | 1 hr | Hero surfaces converted to Dusk Trail; sub-features still use neon Tailwind palette. Looks fine against the warmer bg but a full sweep would harmonize. |

---

## P2 — Polish + Quality of Life

| Item | Status | Effort | Notes |
|---|---|---|---|
| Food Search Phase 3 — smart query routing | Not started | 2 hrs | Skip Gemini entirely when local data is high-confidence. Token cost optimization + faster perceived speed. Lower urgency since Phase 2 is solid. |
| Restaurant "pro tips" per restaurant | Not started | 2 hrs | Curated "Get this, skip that" guidance per chain. Editorial work — needs Ding's input on the tips. |
| Cross-restaurant collections | Not started | 1.5 hrs | "High-protein picks" / "Low-cal quick bites" / "Plant-based" browse views that span all 44 restaurants. |
| Hidatsa cultural integration | Blocked on Ding | ~1 hr once words provided | Need specific words, greetings, or phrases. |
| Restaurant pro tips data entry | Ongoing | — | Filling in tips for all 44 restaurants. |

---

## P3 — Post-Launch / v1.1+

_Save for after launch. Most either need real user data or have cold-start
problems if shipped too early._

| Item | Effort | Notes |
|---|---|---|
| Monthly data PDF export + wipe warnings | 3–4 hrs | Power-user feature (dietitian sharing). Pairs naturally with the Wrapped page. |
| Wrapped v2 (sharing, year-end, deeper insights) | 3–4 hrs | Build on shipped Wrapped: share-as-image, end-of-year mega Wrapped, AI-generated personalized narrative. |
| Continuous TDEE re-estimation | 4–5 hrs | The MacroFactor moat — weekly re-estimate TDEE from actual calorie + weight trend. Major v1.1 feature, the "smart algorithm" headline. |
| Referral / monetization system | 6–8 hrs | Explicitly post-launch per strategy. Build only after ~500+ DAUs. Free at launch is the right call. |
| Community v1.2 (recipes, body matching, reviews) | 80–120 hrs | The full Community & Discovery vision. Save for ~500–1000 active users. Cold-start problem otherwise. |
| Image thumbnails on logged food | 2 hrs | Schema change to store source image + UI update. Nice but not urgent. |
| Streaming Gemini responses | 1 hr | Show AI macros as they compute. Perceived speed. |
| Query cache for AI lookups | 1.5 hrs | Same query → same cached answer. Cost optimization at scale. |

---

## Critical Path to Launch

1. **Ding starts Apple Developer enrollment** (not started yet — the gating external item).
2. **Last P1 cleanup** — 5 more restaurant components (Subway/Cava/Qdoba/Moe's/Jersey Mike's). ~1.5 hrs. After this, P1 is fully cleared.
3. **App Store / Play Store listing prep** (screenshots, copy, privacy nutrition label). Can begin in parallel with #1.
4. **Capacitor wrap** once Apple Dev approves. Add Sign in with Apple only if Google Auth gets added at the same time.
5. **Submit to App Store + Play Store.**

After launch:
- Week 1–4: Monthly PDF export + Wrapped v2 (sharing).
- Month 2: Continuous TDEE re-estimation.
- Month 3+: Community v1.2 layer.

---

# Post-launch roadmap (added at submission, July 2026)

## Headliner: Campfire — the community page

The place people share their journeys, recipes, and local finds. Named
for the warm-dark fire aesthetic the whole app already carries.

**What it is**
- **Journeys** — progress posts: a photo, a milestone ("down 12 lbs on
  the trail"), a short story. Feathers (likes) instead of hearts — the
  streak icon becomes the community currency.
- **Recipes** — user recipes with macros attached; one tap logs a
  serving straight into your day. The Fuel Coach recipe card format is
  already the right shape for this.
- **Local finds** — "this dish at this spot fits a cut" posts with a
  location/restaurant tag. Over time this becomes community ground truth
  the Fuel Coach can cite.

**Ship it in two phases**
1. **Phase 1 — the lodge wall (low risk):** curated, read-only feed you
   post to (featured journeys, a weekly recipe). No UGC = no new App
   Store obligations. Validates whether people even open the tab.
2. **Phase 2 — full sharing:** open posting with the required Apple
   guideline 1.2 kit shipped IN THE SAME BUILD: report post, block user,
   a moderation queue (Cloud Function + Gemini auto-screen, you as final
   reviewer in the first months), and terms language covering community
   content. Also update the App Privacy label (user content becomes
   collected + linked).

**Tech sketch:** Firestore `posts/{id}` (+ `reports`, `blocks`),
Storage for images (reuse the meal-scan upload path), pagination by
`createdAt`, counts denormalized onto the post doc. All fits the
existing rules pattern.

## Strong next bets (roughly in order)

- **HealthKit sync** — read steps/workouts/weight from Apple Health,
  write food energy back. Biggest retention feature available; also
  makes activityBurn real instead of manual.
- **Barcode scanner** — the camera plugin is already installed and the
  functions layer already talks to Open Food Facts; wiring a barcode
  lookup into AddFood is a weekend-sized feature that removes the most
  common logging friction.
- **Push notifications** — streak-keeper nudge in the evening if
  nothing's logged, weigh-in reminder on your usual morning, weekly
  summary ready. Needs APNs/FCM setup.
- **Home-screen widget** — the calorie arrow ring as a widget. Native
  work (WidgetKit extension) but the single most-seen surface an app
  can own.
- **Wrapped-style month recap** — the Wrapped component exists;
  auto-generate a shareable month card (ties into Campfire later).
- **Premium tier** — once AI usage grows: free tier keeps N AI calls a
  day, Ding+ unlocks more scans, Fuel Coach runs, and deeper weekly
  analysis. The quota system in functions already supports this switch.
- **MHA language deepening** — a daily word on the dashboard footer,
  language milestones tied to streaks. The credit footer becomes a
  living feature and sharpens what makes Ding unlike every other
  macro app.
