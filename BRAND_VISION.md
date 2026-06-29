# Ding! Fitness — Brand & Personalization Plan

_The work that takes the app from "made by AI" to "made by Cuodi."_
_Last updated: 2026-06-XX_

This is the strategic to-do list for personalization. The app's *features* are
strong; what's missing is **specificity**. Every well-known indie fitness app
has an opinionated, recognizable voice. Ding! Fitness needs to become
unmistakably yours before the world meets it.

---

## The honest read

**Where the AI-slop feeling comes from** (it's the surface, not the substance):

1. **Borrowed patterns dressed up** — Wrapped = Spotify, ring = Strava,
   onboarding chat = MacroFactor, sectioned cards = MyFitnessPal. Stacked
   together they read as "fitness app made of fitness app references."
   Nothing screams *only Ding! does this.*
2. **Generic copy** — "Daily Balance," "Today's Movement," "Log a meal."
   Polite-default. Could belong to any wellness app.
3. **Lucide icons everywhere** — Every modern app uses them. We lost the
   bison/salmon/corn/feather illustrations from the original mockup when
   we shipped for speed.
4. **Hidatsa layer is placeholder** — The cultural specificity that's
   authentically yours is currently absent. We have English labels where
   the mockup had Mati-Watsā.
5. **No founder voice** — Nowhere in the app does Cuodi show up. Every
   loved indie fitness app has a founder voice somewhere.

---

## What competing apps actually do that we don't

Each top app has **an opinion strong enough to alienate some people.**
That's what makes them feel real, not AI:

| App | The opinion |
|---|---|
| MacroFactor | "We will not nag you with streaks or social pressure. We will quietly compute the right number." |
| Strong | "This app is only for serious lifters; everyone else should leave." |
| WHOOP | "Your body is a system; we'll tell you what it can handle today." |
| Strava | "Exercise is communal; share or it didn't happen." |
| Hevy | "We'll never charge you for the basics." |

**Ding! Fitness does not yet have its refusal.** That's the most important
gap, and the easiest one to fix — it's a copy decision.

---

## The Plan — what to do, in order

### Before App Store submission (~3–4 hrs, pure content work)

These are the two highest-leverage moves. Both are copy/content, no
engineering risk, and both flip the app from generic to specific.

#### ☐ 1. Hidatsa-anchored vocabulary

This is your differentiator and currently the most underused. Don't
rename everything — pick **5–7 words** and let them sit. Keep English as
the primary read; Hidatsa as the soul layer.

Suggested candidates (you fill in the actual Hidatsa):

- **Mati-Watsā** → Daily Balance section title (already in the mockup)
- ___________ → Reflect tab name OR sub-label
- ___________ → The trail / streak concept
- ___________ → Council / morning ritual (see item #3)
- ___________ → Strength / lifting label on Dings tab
- ___________ → Nourishment / Fuel tab subtitle
- ___________ → "Walk on" closing greeting

Add a small **glossary screen** accessible from Profile that teaches
the words and honors the source. Two sentences per term. This is what
no AI-built app will ever do correctly because their teams don't have
the cultural standing.

#### ☐ 2. Cuodi voice in the app

Have the app speak as you sometimes. Concrete places:

- **Onboarding** — replace the AI Coach intro with a 3–4 sentence
  welcome written by you. Tell them what Ding! is and what it isn't.
  Like a letter.
- **Splash screen status lines** — replace the cyberpunk "GATHERING
  STRENGTH" with phrases that sound like you.
- **Health disclaimer** — currently legal-default. Re-write as a calm
  short paragraph in your voice.
- **Reflect closing card** — already says "Walk on, {Name}." Could be
  a rotating Cuodi quote that changes weekly.

To do this you need to **write 6–8 sample paragraphs in your own voice**
— could be journal entries, texts, anything authentic. Then we extract
the patterns and bake them into copy.

#### ☐ 3. The opinionated stance — Ding!'s refusal

Pick one and put it in the onboarding. Examples:

- "Ding! Fitness will never show you a social feed."
- "Ding! Fitness will never reset your trail — only rest it."
- "We do not gamify your body."
- "We do not track steps or sleep. The trail is about what you eat,
  what you train, and how you reflect — nothing more."

You only need ONE. Pick the truest one. Put it where the user can't
miss it on their first day.

---

### Post-launch v1.1+ (real engineering work)

These are bigger lifts that earn their place AFTER you have real users.
Don't do them pre-launch — you'll burn the runway.

#### ☐ 4. The Morning Council (signature ritual)

Right now there's no reason to open the app *first thing*. Food logging
happens after meals; workouts happen at the gym. Give it a morning
moment.

**The Morning Council** — each morning the app opens to a 3-line
"council":
- Yesterday's trail (one short fact, e.g. "78g protein logged, sage hit")
- Today's path (one intention or target)
- The wind (the AI's read on the user, one sentence)

Takes 8 seconds to read. Reason to open the app every day. WHOOP-style
ritual, but warmer.

**Effort:** ~4–6 hrs. New screen + morning gate logic + a prompt to
Gemini that produces "the wind" line.

#### ☐ 5. The trail metaphor made literal

Right now "12-day trail" is just a counter with a feather emoji. Make
the trail *literally visible* — logged days draw a path across a
landscape (forest, mountain, prairie) you can pan.

Missing days don't reset to zero; **the trail goes cold and brush
grows back across it.** Re-engaging the next day clears the brush.

This makes the streak an emotional place, not a number. Hardest item
on the list but the most distinctive thing the app could do.

**Effort:** ~12–20 hrs. Procedural SVG landscape, day-by-day state,
brush-clearing animation.

#### ☐ 6. Original art for 3 hero moments

You don't need 100 custom illustrations. Just three for the hero
surfaces:

- **The bison** — food / macros area
- **The salmon** — water / hydration
- **The feather** — streak / Reflect

Hand-drawn or commissioned, simple line art. Keep Lucide for utility
icons. The three illustrations carry the brand.

**Effort:** $300–800 commissioned to a Native artist, or your own time
if you draw. Long-term differentiator.

#### ☐ 7. The Cuodi letters

Have the Profile tab show a "letters" view. **Every Monday morning, a
3–4 sentence note** from Cuodi about something — training philosophy,
why the feather is on the streak badge, the meaning of Mati-Watsā,
what you ate this weekend.

This is the founder voice that makes apps feel handcrafted. Hevy and
Strong do versions of this in patch notes; Ding! makes it part of the
product.

**Effort:** ~3 hrs to build a Firestore-backed letters collection that
you can write to from the admin dashboard. Ongoing: 15 min/week
writing the note.

#### ☐ 8. The honoring moment (signature interaction)

When the user logs a meal that fits their remaining macros perfectly
(within ±5%), the app responds with a small visual moment:

- A feather floats across the screen
- A quiet sound (optional)
- One sentence: "You walked it well." Or a rotating Hidatsa phrase.

Happens maybe 1 in 8 days. **Strong, restrained — but unmistakably
Ding!** This is the kind of interaction that makes users send
screenshots to friends.

**Effort:** ~3 hrs. Macro-fit detection logic + motion library
animation.

---

## Notes to self

- The Hidatsa words list above has 7 blanks. Fill them in *before*
  any of the above ships. The vocabulary is the foundation everything
  else builds on.
- For the Cuodi voice — write 6–8 sample paragraphs in any context
  (texts, journal, sample app copy). The voice will emerge from those
  samples and we can systematize it.
- Don't try to do all 8 before launch. Items 1–3 are pre-launch.
  Items 4–8 are post-launch, in roughly that priority order.
- Cultural authenticity *is* the moat. No competing app can credibly
  ship "Mati-Watsā" because their teams don't have the standing. You
  do. This is your strongest position; lean into it.
- If anything in here feels off — generic, performative, or wrong
  voice — cut it. The instinct is more reliable than this document.

---

## Where it stands as of 2026-06-XX

- **Pre-launch P1 complete** (except 5 restaurant component arrays, which are non-blocking)
- **Apple Dev enrolled**, app on iPhone via TestFlight
- **Cream/Mati-Watsā theme shipped** but currently English-labeled placeholders
- **Bugs fixed:** camera permissions, PDF export, Firestore long-polling, auth persistence, restaurant intent
- **Not yet started:** items 1–8 above
