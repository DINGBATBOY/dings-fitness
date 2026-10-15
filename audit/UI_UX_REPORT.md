# UI / UX & Accessibility Report — Ding! Fitness v1.0

**Method.** Playwright (Chromium) rendered the real React components through `design/preview.html` with sample data. Viewports: 390×844 (iPhone 14/15), 320×568 (SE 1st gen), 1024×1366 (iPad 13"), 844×390 (landscape). Both themes were captured. axe-core 4 ran WCAG 2.0/2.1/2.2 AA + best-practice rules on each screen (`evidence/ui-axe-report.json`). Touch targets were measured from bounding boxes.
**Not covered:** the Coach tab, the onboarding flow, edit-profile and settings modals (not in the preview harness), real WKWebView rendering, safe areas on a notch/Dynamic Island device, VoiceOver and Dynamic Type on iOS. Those need a device pass.

**Overall.** The v2 shell (Home, Add Food, Progress) is clean, consistent and readable, and the core flow is short. The main problems are *date correctness* in the UI, *muted-text contrast*, *small targets* on the day/week controls, and the older History/Settings screens, which still use the pre-v2 dark styling and tiny 10 px links.

## Core workflow: Open → Find food → Portion → Log → See macros

| Step | Taps | Notes |
|---|---|---|
| Open app → Home | 0 | Splash 2 s native + React splash (`App.tsx` waits ~2.7 s). Consider shortening the forced splash for returning users. |
| Find food | 1 (+) then camera / Recent / Eats / Quick add | Good: one entry point, Recent one-tap re-log with a ⊕ button. |
| Portion | ½ / 1 / 1½ / 2× chips, or editor | Grams only for barcode-per-100 g items; no unit picker (oz, cups). |
| Log | 1 | Closes the dialog, toast with Undo (8 s). |
| See macros | 0 | Lands on the dashboard of the *logged* day. |

Friction points:
1. **Logging to the wrong day is easy.** The selected day persists after browsing history, and the composer then logs there. The review banner ("Logging to Tue, Oct 13 · Use today") is good, but because past days can't be edited afterwards (FUNC-01), one missed glance makes a permanent error.
2. **Scan wait.** A photo scan runs up to 90 s with streamed progress ("searching", "opened chipotle.com"). That's good feedback, but there's no estimate of typical duration.
3. **AI consent sheet** appears on the first scan. Fine, but the onboarding AI call happens earlier without it (PRIV-02).

## Findings

### DATE-01 / DATE-02 (P2 / P1) — the day switcher shows wrong or invalid dates
Covered in `CRITICAL_ISSUES.md`. UI evidence: `evidence/dst-stuck.png` (Next day stays on "Sunday, Nov 1") and `evidence/locale-en-GB.png` ("Invalid Date NaN" ×7 in the week strip).

### A11Y-01 (P2) — muted text fails WCAG AA contrast on every screen
`--ink-light` is #8a7a6b on #fffaf3 (light) = **3.98:1** and #8b7e6e on #1d1815 (dark) = **4.44:1**; AA needs 4.5:1. axe flagged 3–17 nodes per screen: section labels ("TODAYS BALANCE SO FAR", "LAST 7 DAYS"), timestamps, units, chart captions. Most of them are 11–12 px uppercase, which makes it worse.
**Fix:** darken light-mode `--ink-light` to about #75685a and lighten dark-mode to about #9a8c7b (re-check each tone in `index.css:113–116`), and use ≥ 12 px for labels.

### A11Y-02 (P2) — touch targets below 44×44 pt
Measured at 390 px: Previous/Next day **40×40**, the "Today" title button 76×**33**, the balance info button 40×40, week-chart day bars **38×128** (28×128 at 320 px), week-strip days **38×71** at 320 px, the Add pill 72×**40**. Progress chart bars are 43 px wide. In History: two icon-only buttons **40×40 with no accessible name** (`Journal.tsx:701` and its sibling — axe *critical* `button-name`), and "Analyze Day" 122×**29**. Settings: Log Out / Fuel Coach GPT key / Contact Support / "Show me around again" are `text-[10px]` underlined links (25 instances of `text-[10px]` in `MainApp.tsx`).
**Fix:** `h-11 w-11` minimum, `aria-label` on the Journal arrows, 13–15 px text for the settings actions.

### A11Y-03 (P2) — no Dynamic Type
All sizes are fixed px or rem on a fixed root. iOS text-size settings don't affect the WebView. VoiceOver users who rely on larger text get none.
**Fix:** set `html { font: -apple-system-body; }` with rem-based sizing, or read the preferred content size natively and scale the root font size.

### A11Y-04 (P3) — heading structure
No `<h1>` on Home ("Today" is a button); heading-order violations on Progress and History. Make the day title an `h1` containing the button.

### UX-01 (P2) — History and Settings still use pre-v2 styling
`Journal.tsx` and the settings block in `MainApp.tsx` use hard-coded `text-white/40`, `bg-white/5`, `text-gray-500`, cyan accents, `uppercase tracking-widest` 10 px text. In light mode they depend on the "LIGHT MODE BRIDGE" overrides: they're readable in the capture, but "EXPORT MONTHLY PDF" (light blue on light blue) and "ANALYZE DAY" (green on green) are low-contrast. This is also where reviewers look for account deletion.
**Fix:** migrate these screens to the `--ink*`/`--bg*` tokens, like the v2 components.

### UX-02 (P2) — iPad shows a phone column (if iPad stays enabled)
`evidence/home-ipad-1024.png`: a 448 px column centred on 1024 px, about 55 % empty. See STORE-02; recommend iPhone-only for v1.0.

### UX-03 (P3) — iPhone landscape is enabled but the layout is portrait-only
`Info.plist` allows Landscape Left/Right on iPhone. Remove them (or add `UIRequiresFullScreen` and lock orientation).

### UX-04 (P3) — copy
- Missing apostrophes throughout user-facing strings: "Couldnt", "Thats not it", "Todays balance", "Youve", "Lets figure it out", "wasnt". Probably a side effect of the PowerShell-ASCII gotcha, but it reads as typos to reviewers. Use ’ (U+2019) or `&apos;`; only `.ps1` files need to stay ASCII.
- The support email body says "App version: v2.1" (`MainApp.tsx`), while the binary is 1.0.
- Coach error is a bare "Connection error." with no retry.

### UX-05 (P3) — dashboard framing
Mid-day, the balance card shows a large green "−1,406 deficit" (`evidence/home-light-390.png`) because burn is counted for the whole day while eating is partial. It's informational and labeled "so far", but the big green deficit early in the day can reward under-eating, which sits awkwardly with the ED-safety stance. Consider showing the pro-rated burn, or neutral coloring until evening.

### What works well
- One food entry point, a durable draft, a clear "nothing logs itself" review, and evidence text per item ("Estimated from your photo…").
- Reduced-motion is respected (`index.css:31`; tab motion is 0 under reduced motion).
- No horizontal overflow at 320 px on any captured screen.
- Light and dark both render without broken surfaces on the v2 screens.
- Food rows, Recent rows and the + buttons meet 44–48 px.
