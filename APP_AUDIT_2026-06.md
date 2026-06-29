# Ding! Fitness — App Audit & Improvement Plan

*Date: 2026-06-23 — full scan of the app in its current TestFlight state.*

This is an ideas / direction doc, not a code-change doc. Three big asks from
you:

1. The front screen feels busy.
2. The light orange palette feels "meh."
3. Make Reflect (Wrapped) more concise / interactable.

Plus — new voice lines I'd like you to write for moments that still feel
generic.

I broke this into four sections, each with a recommendation up top and the
reasoning below it. At the end is a priority list so you know which ones I'd
ship before App Store, which ones can wait for v1.1.

---

## 1. Front screen is busy — what's actually causing it

The Fuel tab stacks 8 distinct visual blocks before the user can scroll. In
order:

1. Hero greeting + streak badge
2. Section header "Daily Nutrition"
3. Macro ring card (3 numbers + 3 macro bars + Consumed/Remaining toggle)
4. Adaptive TDEE banner (conditional)
5. Section header "Today's Movement"
6. 3-tile Movement grid (Workout / Steps / Active)
7. Section header "Quick Burn"
8. Pill row of activities
9. Section header "Quick Jumps"
10. 2-tile grid (Meals / Reflect)
11. Wrapped launcher card
12. Habits 30-day grids (2 of them)
13. Hidatsa footer

That's **13 things** above the dock. For a daily-glance screen, my read is
this is doing too much. The macro ring is the hero, and everything below it
is competing with itself.

### What to cut / merge

**Quick Jumps tile row → delete entirely.** Meals and Reflect already have
dock tabs. The tiles are a redundant navigation layer that costs vertical
space and visual weight. The dock is already there at all times.

**Today's Movement → fold into the macro ring card.** Move "Workout: Done"
into the right-side gutter of the ring card as a small chip. Steps and Active
mins are nice-to-have, not glance-critical — push them behind a tap on the
ring (drill-down sheet) or to the Workouts tab.

**Habits 30-day grids → collapse into one strip.** Right now you have two
separate 30-day grids (weigh-ins, food logs). Merge into a single 30-cell
strip where each cell is a colored dot: dim = nothing, half-saturated = one
of the two, fully saturated = both. Saves ~120px of vertical and reads
faster.

**Adaptive TDEE banner → keep, but only show when actionable (already does).**
Already conditional — leave alone.

**Wrapped launcher card → keep, but shrink to a single-line "Your week so far →"
link.** The big card competes with Habits below it. A simple full-width pill
button reading "YOUR WEEK SO FAR →" with the consistency number on the right
gets the job done.

### After cuts, the screen reads:

1. Hero greeting + streak
2. Macro ring card (now includes workout chip)
3. Adaptive TDEE banner (when relevant)
4. Quick Burn pills (keep — these are quick log actions, not navigation)
5. Habits strip (single combined strip)
6. "Your week so far →" pill
7. Hidatsa footer

7 blocks instead of 13. Same information, less scanning.

---

## 2. Palette feels "meh" — diagnosis

Open the dashboard right now and inventory the colors:

- Background `#161210` (warm charcoal)
- Cream text `#f5ede1`
- Macro coral `#e3614a` (protein)
- Macro gold `#e8a85a` (carbs)
- Macro emerald `#7ab896` (fat — the only cool color)
- Fire `#d97757` (CTA, streak badge, accent)
- Ochre `#e8a85a` (streak text — same as carbs)

**Every accent except one is in the orange→amber→coral wedge.** That's the
"meh" feeling. Warm-on-warm with no cool anchor reads as one note. The
emerald on fat is doing a lot of work as the only contrast, but it's small
and only appears in the macro bars.

### Three options, in order of how much I'd push for them

**Option A — Add a cool blue anchor for "info" surfaces (recommended).**

Introduce one cool accent: `#6fa8c4` (a dusty sky / river blue — already
in your `C` palette object in FuelHome but barely used). Use it for:

- The "Your week so far →" pill border + arrow
- Section header underlines on the dashboard
- The active dock indicator (currently fire — would be a nice swap to blue
  to differentiate "you are here" from CTAs)
- Wrapped section headings
- Adaptive TDEE banner border (currently fire — feels alarming when it's
  actually a suggestion)

Adding ~5% cool to a warm palette makes the warm parts feel *warmer*, not
washed out. Right now everything competes; with a blue anchor, the coral
CTA pops because it's the only warm thing in a sea of cool blue accents on
non-CTA surfaces.

**Option B — Deepen the orange instead.**

If you want to stay all-warm, the issue is saturation, not hue. Your
current `#d97757` is fairly muted. Push it toward a true terracotta
`#c25a3a` for CTAs and keep the gold for accents. This separates "action"
(deep terracotta) from "ambient warmth" (gold/cream). I think this is less
distinctive than Option A but easier to ship.

**Option C — Hidatsa river palette.**

Pull from the Missouri river / earthworks visual that ties to your roots:
deep coral `#c25a3a` (CTA), river blue `#5a8aa0` (info), prairie gold
`#e8a85a` (accent), grass green `#7ab896` (success), bone cream `#f5ede1`
(text). Same energy, but the cool blue and the deeper coral give the app
a name no other fitness app has. This is the brand-distinctive move.

I'd go A or C. C if you want this to feel unmistakably yours.

### One concrete fix regardless of option

The active dock indicator and the streak badge are currently the same fire
orange as the CTA. When everything is fire, nothing is fire. Pick one
"primary action" color and reserve it. Right now fire is doing six jobs.

---

## 3. Wrapped is too long — three redesign options

Current Wrapped is 9 sections, all scrollable, in one long page. ~786 lines
of component. You called it Spotify-style but Spotify Wrapped is
*card-by-card*, not a scroll. Three ways to tighten it:

### Option A — Swipeable card stack (truest to Spotify) ★ recommended

Each section becomes a full-screen card. Swipe right or tap to advance.
Bottom progress dots show position. 7 cards total instead of the current 9
scrolling sections:

1. **Hero** — "Cuodi's week" + headline phrase
2. **Consistency** — big number, one line of context
3. **Fuel** — calories total + average + best day
4. **Top foods** — top 3 (not 5), one big card
5. **Training** — workouts + volume + one body-part call-out
6. **Body** — weight delta with a single sparkline
7. **Closing** — the receipt / share card

Standout days and Patterns get folded into the closing card as small
footnotes ("Your standout day was Tuesday — 2,400 cal, two workouts").

This is the most work but also the most fun. It actually feels like a
recap, not a long page.

### Option B — Tabbed digest (cheapest)

Keep the existing sections but render as 3 tabs across the top:

- **The story** (Hero + Closing)
- **The numbers** (Consistency + Fuel + Training)
- **You, this week** (Top foods + Body + Standout days)

Each tab is short. User picks where to dig. Easier to build than swipe
stack — basically just regrouping the existing sections under a tab UI.

### Option C — Sticky summary header + expandable sections

Top of the page: a 4-stat strip that's always visible (Days logged,
Calories, Workouts, Weight delta). Below: each section is collapsed by
default, tap to expand. Best for users who only want one number and bounce.
Least Spotify-like but most utilitarian.

**My pick: A.** The Wrapped is a moment, not a dashboard. Treat it like one.
The card stack is also where Cuodi's voice can really land — one line per
card, instead of paragraphs.

### Interactivity I'd add (any option)

- **Tap top foods → one-tap "Log this again now"** — turn the recap into an
  action.
- **Share card at the end** — pre-rendered as a PNG, "Save image / Share to
  Instagram." This is the viral hook. Even just a wordmark + the one
  headline phrase + your top 3 foods is enough.
- **Swipe down on hero to scroll the rest** (if you go with A) — for users
  who want the long version.

---

## 4. New voice lines I want you to write

Voice moments still feeling generic. Cuodi-isms wanted: dropped
apostrophes, random CAPS, multi exclamation, meta asides, no emoji.

### Empty states (high priority — these are first impressions)

- **No food logged today (morning, before 11am):** Currently silent. Voice
  line wanted.
- **No food logged today (evening, after 6pm):** Different tone — should be
  a little sus / playful nag.
- **No workout this week (Sunday night):** Gentle.
- **First Wrapped, not enough data:** Currently "No Wrapped yet 📊" — needs
  voice.
- **Coach chat — first message of the day:** Currently generic. Wanted: a
  greeting that varies by time.

### Hit moments (medium priority — these are the rewarding feels)

- **Hit protein target for the day** (the moment it crosses):
- **First time logging 3 days in a row:**
- **First time hitting a 7-day streak:**
- **Recomp: first week of weight trending the right direction:**
- **PR on a lift (when workout logged with > previous max):**

### Mistakes / corrections (low priority but personality-rich)

- **Deleted a food log:** "K it never happened" energy
- **Overlogged calories (>150% target):** Light, not preachy. Maybe a
  question-back like "you sure that's right" vibe
- **Same food logged 3 days in a row:** "this is your roman empire huh"

### Spotlight tour bodies (still pending from before)

The 4 stop bodies for SpotlightTour — I have generic placeholders. Wanted
Cuodi voice for each:

1. **Macro ring stop:** Explain what the 3 numbers are
2. **Eats tab stop:** What this tab does
3. **Reflect tab stop:** What Wrapped is
4. **Avatar / profile stop:** Tap here for settings

### Tour finale + first-launch lines

- **Tour finished:** Something like "ALRIGHT thats it. go log a food or
  whatever you do" — but in your voice
- **First app open after install (before sign-in):** Auth screen welcome —
  one line on top of the form

### Health disclaimer (legal-required but you can voice it)

The "this is not medical advice" line that needs to appear in Coach. Wanted:
Cuodi voice of "look I am not a doctor obviously, talk to one if you got
real questions ok"

---

## Priority list

**Before App Store launch (this week-ish):**

- Cut Quick Jumps tiles (5 min, immediate breathing room)
- Combine Habits grids into one strip (~30 min)
- Shrink Wrapped launcher to a pill (~15 min)
- Differentiate dock active indicator from CTA color (~5 min — one line in
  Layout.tsx)
- Fold Workout chip into ring card (~30 min)
- Empty-state voice lines (you write, I wire up)

**v1.1 — within a month of launch:**

- Wrapped card-stack redesign (Option A) — full rewrite of Wrapped.tsx
- Palette decision (A or C) — global swap, touches index.css + Layout +
  FuelHome + Wrapped
- Share card export from Wrapped — needs html-to-image lib + Capacitor share
- Coach voice greetings + remaining tour bodies

**v1.2+ — when there's time:**

- Tap top foods → re-log
- Hit-moment animations (protein target, streaks, PRs)
- "Roman empire" repeat-food line

---

## Open questions for you

I held off on these because I want your call:

1. **Palette direction — A, B, or C?** Strong recommend A or C. C is more
   distinctive but more work.
2. **Wrapped redesign — A, B, or C?** Strong recommend A.
3. **Is "Dings" (workouts tab) staying as the label?** I notice in
   Layout.tsx the workouts tab is labeled "Dings" — kind of cute but
   ambiguous next to the brand name "Dings Fitness." Could be "Lifts" or
   "Train." Or leave it — it's growing on me.
4. **Reflect vs Wrapped naming** — Reflect tab opens Wrapped. The tab
   reads "Reflect" but everything inside says "wrapped." Pick one term.

Tell me which directions you want and I'll start swinging.
