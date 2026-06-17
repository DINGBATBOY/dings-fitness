# VOICE PACK — Dings Fitness

_Authored by Cuodi. This is the source of truth for every user-facing string in the app._

## Who it's for

People who don't know where to start but want something that can really help them begin their path.

## Voice dials

- **Intensity:** balanced energy
- **Language:** curses freely / casual profanity OK
- **Emoji:** no emoji

## Mechanics (extracted from the samples)

- **Random CAPS** for emphasis on key words (`EITHER WAY`, `THE MOVE`, `LETS GOOOOOOOO`)
- **Drops apostrophes** casually (`Its`, `Dont`)
- **Multiple exclamation marks** to mark genuine enthusiasm (`Yooo!!!!`)
- **Conversational fillers** as connective tissue (`huh`, `matter fact`, `yooo`, `bro`, `c'mon now`)
- **Drawn-out vowels** when celebrating (`LETS GOOOOOOOOOOOOOO`)
- **Meta / self-aware asides** in parens (`(just kidding, not really)`)
- **Multiple ellipses** for trailing off (`Hmmm....`)
- **No period when going for casual** (`what are you doing`)
- **Like texting a friend** — never corporate, even on errors or settings

## Voice in context (gold-standard examples)

### Onboarding
Scene: A brand-new user just opened the app for the first time. Empty profile, no workouts logged.

> "Yooo!!!! I heard you were here to find your path to fitness or eating better? Or you are just kinda fucking around huh. EITHER WAY. Its great to see you, let me show you around."

### Workout start
Scene: They tapped "Start workout." Screen's about to load their first exercise.

> "The first step in your PATH LETS GO"

### Mid-set push
Scene: They're grinding through the hardest set. App pops a little nudge.

> "No matter how many steps you take as long as they are in the right direction the path will always be there"

### New PR
Scene: They just logged a personal record. Big confetti moment.

> "LETS GOOOOOOOOOOOOOOOOOOOOOOOOOOOOO. This is the MOVE, C'MON NOW"

### Streak hit
Scene: They've worked out 7 days straight. Streak counter ticks up.

> "you just love it here huh. Keep walking on that path, matter fact keep SPRINTING LIKE YOU ARE"

### Missed day
Scene: They skipped yesterday. Streak just broke. App needs to pull them back — without making them feel judged.

> "Hey uh, seems like you missed a day. I'm not very clingy but DONT DO IT AGAIN(just kidding, not really)"

### Rest day
Scene: It's a scheduled rest day. No workout planned.

> "I think its time for nothing. Like literally do nothing what are you doing"

### Empty / error
Scene: Something went wrong — a screen failed to load, or there's no data yet.

> "Hmmm.... Seems like I missed a step. Hehe. I'll hit you up when its done"

## How to apply

1. Treat the examples above as the source of truth for tone.
2. For each screen, write copy as if the same person wrote every word.
3. Keep the dials consistent everywhere — don't go corporate on errors or settings.
4. When unsure, write it shorter and more like a text message.

---
Pending samples — Cuodi to write 

These are the additional voice moments I'd need to do a full pass across the app. Drop them in here as you write them. 

Good Morning / Good Afternoon / Good Evening greeting on the home tab: 

My answer: MORNIN, AFTERNOOOON! Good EVENINGGGG! 

Toast when food gets logged ("X items marked" / "Marked"): 

My answer: That must have been yummy, or Really you ate that? HAHA Just kidding.  

Toast when activity burn gets logged ("250 kcal · movement noted"): 

My answer: Mhm getting to work I see. Or Another step in the right direction. Keep workin 

Toast when deleting a food entry, with Undo button visible: 

So you just didnt eat that? OR was it really that bad? OR Yeah I’d remove that too.  

Wrapped (Reflect) section headlines based on consistency %:  

85%+ consistency: This is crazy, you are more consistent then me and I’m a program! 

60-85%: We love to see this! 

30-60%: Keep going! It can only get better from here 

<30%: Day by day it will get better(if you, ya know use the app) 

Wrapped closing card ("Walk on, {name}" currently):  
Answer: Your Currently Forged Path:  

AI is "thinking" — photo scan or food analysis loading state:  
Answer:  Trying to figure out what the hell you are eating.... AND This (whatever it is, im still figuring it out..) looks yummy 

Photo scan succeeded — short success line:  
Answer: Yep okay now i know what it is: and then actually say what it is 

Photo scan failed — short failure line, not techy: Hm yeah so I dont know what Answer: you are eating, you sure its food? 

Adaptive TDEE banner — "your trail is adjusting because..." 
Answer: Adjusting your path 

First-launch tour — opening line (after onboarding, before they see the home tab): 
Answer: Yooo!!!! I heard you were here to find your path to fitness or eating better? Or you are just kinda fucking around huh. EITHER WAY. Its great to see you, let me show you around." 

First-launch tour — final line ("here's where you go from here"): 
Answer: So whats next? Oh yeah im supposed to know sorry! Your path starts here: The steps you take will always be yours. No matter how long your strides are just keeping moving forwards 

Health disclaimer — short text-message version of the legal one: 

Profile saved successfully toast: 
Answer: Yep saved that, you are here forever(okay legally not actually..chill) 

Sign-in screen welcome (returning users): 
Thought I'd never see you again. No seriously I’m lonely sometimes 

Sign-up screen welcome (new accounts): 
WELCOME your path begins here 

## First-launch tour spec (decided)

- **Trigger:** fires right after onboarding completes — user finishes the 12-question chat, sees the home tab, the spotlight tour kicks in immediately. Hot iron, no opt-in friction.
- **Format:** spotlight overlay. One UI element lit up at a time, everything else dimmed. Speech bubble in Cuodi's voice next to the highlighted thing.
- **Length:** 30–45 seconds. 3–4 stops, period.
- **Stops (proposed — Cuodi confirms):**
  1. The **macro ring** on the home tab — "this is your daily balance"
  2. The **+ floating Add Food button** — "this is how you log everything"
  3. The **Eats tab** in the dock — "this is the restaurant cheat code"
  4. The **Reflect tab** (feather icon) — "and this is where you look back"
- **Skippable:** yes — "skip tour" link in the corner of every speech bubble.
- **Re-runnable:** there's a "Show the tour again" button in Profile so users can re-trigger it.

### Voice samples needed for the tour

Fill these in and I'll wire them in straight from this file:

- **Tour stop 1 — the macro ring on Fuel:** ___________
- **Tour stop 2 — the + Add Food button:** ___________
- **Tour stop 3 — the Eats tab:** ___________
- **Tour stop 4 — the Reflect tab:** ___________
- **Tour closing line (last bubble dismisses, lands them on home):** ___________
