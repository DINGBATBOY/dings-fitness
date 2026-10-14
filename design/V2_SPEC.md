# Ding! v2 — build spec (Ding's direction, Oct 14 2026)

This is the prompt Claude wrote for itself from Ding's request, then executed.

## What Ding asked for (analysis)

- **Adding food is the point of the app** and should feel immersive — not a
  card on the home screen, not a bottom sheet. Model: MacroFactor.
- **Center "+" in the tab bar**, big and unmistakable. It opens a **full page**
  for adding food: scan / photo / describe, previous adds, portions, and the
  **Eats** restaurant section folded in.
- **Home = the dashboard**: today's calories, the week's calories, trends,
  calories burned (Apple Health), **steps** (Apple Health). Like MacroFactor.
- **No Log tab.** A **date at the top** switches the whole dashboard to any
  day ("see the app as if it was the day before"). The full history lives in
  the profile.
- **Reflect merges into Profile.** Profile becomes a hub: day streak, most
  eaten food, stats, the old Reflect content, full history in sections, and
  settings — including **light/dark mode and background colors**.
- **Faster, smoother page switching** and **more animation on taps**.
- Keep the original feel Ding liked (the Eats section, the warm dashboard).

## Decisions

1. **Keep ChatGPT's food engine, replace its shell.** Its durable scan jobs,
   drafts, review-with-portions, "Thats not it", evidence and 12 tests stay.
   Its navigation (Today/Log/Train/Reflect) and stripped-down home are replaced.
2. **Tab bar:** Home · Train · **(+)** · Coach · Profile. The + is a raised
   56px terracotta disc that rotates to an × while the Add Food page is open.
3. **Add Food page** (full screen, slides up, stays mounted while minimized):
   - Header: close, "Add food", and a chip for the day it logs to (follows
     the dashboard's selected date).
   - Hero "scan" zone: big camera button, Photos, Barcode, describe-it input,
     "Figure out my food".
   - Segmented sections: **Recent · Favorites · Eats · Quick add**
     (Quick add = type macros yourself). Eats = the original RestaurantHub.
   - Analyzing and review (portions ½/1/1½/2×, That's not it, edit) happen on
     the same page. Logging closes the page and lands on that day's dashboard.
4. **Home dashboard** for the selected date:
   - Date bar: ‹ day › with a 7-day strip (tap any day; tap the title for Today).
   - Calorie ring (eaten / target / left, signed — never clamped), macro bars.
   - Energy card: burned = resting + active (Apple Health when connected),
     steps (Apple Health), logged workouts.
   - Week card: 7 bars of calories vs target with the weekly average.
   - Trends card: weight sparkline + change, 7-day protein average.
   - That day's food, grouped by meal time; tap to view (edit today).
   - Water for that day (add on today).
   - Past days are viewable and can have food added to them.
5. **Apple Health:** new plugin method `getDailySummaries(days)` →
   per-day steps + active energy (HKStatisticsCollectionQuery), step count
   added to the read set. Feeds the dashboard for any of the last 30 days.
6. **Profile hub:** header (photo, name, goal), stat tiles (day streak,
   days logged, most eaten food, 7-day avg calories, weight change, meals
   logged), then sections: **Overview** (old Reflect: Wrapped + deeper read),
   **History** (old Log page, full), **Settings** (existing profile settings
   + new **Appearance**).
7. **Appearance:** Theme Dark / Light; background tone (Warm charcoal,
   Midnight, Forest, Plum, True black). Stored per device and in the profile.
   Implemented with CSS variables so the new screens follow it fully and older
   screens follow it through class overrides.
8. **Motion:** direction-aware slide+fade between tabs (~180ms), spring press
   feedback on buttons/cards, + button pop/rotate, Add Food page slide-up,
   staggered list entry, ring/number ease-in. All off under reduced motion.
9. **Carry-over fixes:** only write `dailyLogs` to Firestore when the day
   rolled over (ChatGPT's commit wrote the whole history on every log).

## Ship

Typecheck, food tests, build, browser check at phone width; commit; deploy
Firestore rules + indexes + storage, functions, web; real scan on the web;
Codemagic build; watch it green.
