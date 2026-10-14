# Ding! Fitness — food-first design review and build specification

Implementation is now integrated into the app. See [IMPLEMENTATION.md](IMPLEMENTATION.md) for the live components, checks, deployment order and remaining device QA. The findings below describe the code as it was before implementation.

Reviewed October 13, 2026. Source: the React/Tailwind code in this checkout, including MainApp, FuelHome, Layout, BowLoader, Onboarding, SpotlightTour, geminiService, the server proxy, VOICE.md and MHA_LANGUAGE.md. No device rendering was inspected. Code-level findings below are distinct from device QA requirements.

The blunt verdict: Ding asks beginners to understand a nutrition dashboard before it demonstrates why they should use Ding. The food analyzer has the strongest product story and the weakest place in the hierarchy. Its result exposes infrastructure before helping someone answer the only three questions that matter: Is that my food? Is that my amount? Can I log it?

Keep the warm palette, direct voice, transparent estimates, minimum-calorie floors and target-minus-eaten arithmetic. Give the analyzer the first useful action and make correction part of the magic.

## 1. Five highest-impact changes, ranked

Effort is relative: S = localized UI/copy change; M = several components and shared state; L = backend/data-model work plus mobile lifecycle QA. This is not a delivery-date estimate.

| Rank | What's wrong in the code | Change | Why it matters | Effort |
|---|---|---|---|---|
| 1 | FuelHome renders greeting, a 200px RingHero, macro bars and a detailed energy-burn ledger before QuickActionTile gives food equal weight with three supporting tasks. Layout has six destinations, with labels only on the active one. MainApp's generic + repeats the food tile. | Put **Show me what you ate** above the compact daily balance. Remove the 2×2 grid and generic +. Use four always-labeled destinations: Today, Log, Train, Reflect. Keep one shared food composer. | Beginners immediately see the service Ding performs. Calories become context for eating instead of an entrance exam. | M |
| 2 | BowLoader covers the app at z-120, cycles jokes every 2.6 seconds, has no leave/cancel controls. callOpenAI awaits one complete response; analyzeFoodEntry silently falls back to another pipeline on many errors. | A dismissible analysis state driven by real events, with a resumable job and a persistent status card. | A 40-second wait is tolerable when the food is safe, progress is honest, and the app remains useful. | L |
| 3 | MainApp's review leads with prose, database diagnostics, colored confidence badges and five always-editable nutrient columns. Renaming a food does not recalculate it. Saving discards source/confidence/portion metadata; custom entries can later enter a VERIFIED MENU DATA prompt. | Identification → meal totals → food/portion check → log. Put detailed editing and evidence behind clear disclosures. Add correction and preserve provenance through save/reuse. | This makes the result understandable while fixing ways the app can imply more certainty than its data supports. | L overall; M for the first UI pass |
| 4 | Onboarding currently has nine steps. SpotlightTour then teaches ring → + → Eats → Reflect. The first lesson is app navigation, not the food analyzer. | Replace the automatic tour with one food invitation after essential onboarding: **Yooo. Lets start with what you ate.** Optional labeled sample; no permission prompt until the camera is tapped. | First value is recognizing a meal, not finishing a tour. | M |
| 5 | MainApp's food flow uses purple/cyan/pink, emoji, 8–11px text and small controls. Layout has unlabeled inactive tabs; pb-safe is used without a definition in the supplied CSS. index.html disables user scaling. | One type/color/control system, accessible modal behavior, reduced motion, and verified safe-area/keyboard behavior. | The signature flow should feel finished before more features ship. | M |

## 2. Shared rules and navigation

- Four destinations: **Today / Log / Train / Reflect**. Profile remains in the avatar. Coach becomes an **Ask Ding** row on Today and relevant contextual screens. Eats becomes **Restaurant menus** inside the composer, beneath recent foods; reuse RestaurantHub as a nested view.
- One food workflow and one active launcher on screen. On Today, its initial form is the hero; after the hero scrolls out, a compact **Show me what you ate** action can appear above the dock. On other destinations use that compact form. Do not show both at once. Use the same openAddFood handler, draft and result state. It is an action, not a fifth selected tab.
- Selecting a restaurant suggestion, coach meal or recent meal supplies the shared composer with a prefilled review. These do not need AI. MainApp currently has direct logging handlers from RestaurantHub and FuelCoachSheet; route them through the same review and save path. Known meals should remain fast: review → one-tap log, without a forced scan.
- Keep a single source of truth: `{draftId, revision, capturedAt, logDate, input, jobId, result, edits, saveState}`. Closing the sheet preserves it. A pending job reopens progress; a finished job reopens review. Starting a new food draft is explicit.
- Preserve the intended log date across midnight/backgrounding. If it differs from today, the review footer names that date and lets the user change it; a late result must not silently land on a different day.
- Keep calories left exactly `target - eaten`, including negative values. Display `−140 kcal left` with neutral explanation `140 above today's target`, not a red failure treatment. Exercise never changes that subtraction. Leave existing minimum-calorie floors intact.

### Visual system

| Token | Specification |
|---|---|
| Page / surface | #161210 / #1d1815. Use surface contrast plus spacing for grouping; white at 8–10% only for decorative separators. |
| Text | #f5ede1 primary; existing #c4b8a4 secondary. #8b7e6e only where measured contrast and size support it; not for tiny essential instructions. |
| Action | #d97757 with #161210 text. Reserve filled terracotta for the main food action or current screen's commit action. |
| Gold / sage | #e8a85a for a question requiring attention; #7ab896 for confirmed completion. Neither evaluates whether a food is good or bad. |
| Type | Inter for every instruction and food name. 28/34 title, 20/26 item heading, 16/24 body and inputs, 14/20 secondary, 12/16 short captions, 36/40 numeric total. Use rem equivalents; sizes are defaults, not fixed-height containers. |
| Brand fonts | Orbitron only for the Ding! wordmark and rare celebratory headings. JetBrains Mono only for optional numeric detail, never a paragraph or all nutrition UI. Tabular figures can stay in Inter. |
| Spacing | 20px page gutters; 24px between sections; 16–20px inside cards; 12px between related controls; 8px between label/value. 24px large-card radius, 12px control radius. |
| Targets | At least 44×44 CSS px in the web UI; primary action minimum height 56px. Text may wrap and increase height. Icons 20–24px, consistent Lucide stroke width. |
| Motion | 180–220ms sheet transition; 120–160ms result fade; one small haptic on successful save if available. No count-up of speculative calories, flashing scanner beam, or looping bow. Reduced-motion mode removes transform/spin. |

Calculated from the supplied solid hex colors: white on terracotta is about 3.12:1; cream on terracotta 2.69:1; charcoal on terracotta 5.96:1. Use charcoal for normal-size CTA text. Muted #8b7e6e on the card is about 4.45:1; secondary #c4b8a4 is about 9.00:1. These are color calculations, not a claim of whole-app compliance. [WCAG contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

What makes it Ding: the user's actual plate is the hero image; the software speaks in Cuodi's short, candid sentences; the result preserves the photo and becomes an understandable food record. A small terracotta exclamation mark can settle into the completed state. Recognition, an honest assumption and an easy correction become the repeating signature. Don't make every nutrient an arrow or every wait a cultural motif.

Keep the already approved Hidatsa vocabulary and its exact diacritics. Pair any word with plain English; don't make it necessary to navigate. Retain credit in a readable 12–14px About/Language section rather than 8px decoration. Attribute Hidatsa, Mandan and Arikara separately where relevant; the local reference identifies words from all three. Do not expand the vocabulary, invent translations, imply external endorsement, or infer sacred motifs from identity. Cuodi's existing approval remains the authority for the soul layer.

### Home: top to bottom

1. **Header.** Safe-area-aware 52px minimum row: small Ding! wordmark left, 44px profile target right. One date below or in the row. Remove the editable-name chip; changing a name belongs in Profile. Today currently gets the date twice, in Layout and FuelHome.
2. **Greeting.** `MORNIN, Ding` at 24/30. One line of encouragement only if useful. No emoji; no wall of coach prose.
3. **Signature action.** Roughly 140–168px surface, 20px inset, terracotta border or edge. Camera icon; 28px `Show me what you ate`; 16px `A photo, a few words. Lets figure it out.` The entire surface is one button opening the composer. No separate camera route or hidden auto-capture. It must fit above the fold on a small phone at default text size.
4. **Daily balance.** Compact card, roughly 120–160px minimum, grows with text. `Today so far`, 32px `1,240 kcal left`, then `860 eaten · 2,100 target`. Below: three labeled values for Protein, Carbs and Fat, with optional thin tracks. No giant ring, percentage-of-goal badge, BMR/NEAT/TEF ledger or generic Details link here. Explicit `Energy details` disclosure holds the existing burn information.
5. **Today's food.** Most recent two or three food records, with time, food name and kcal, plus `See log`. This creates a visible before/after payoff after saving. On empty day: `Nothing here yet. Start with your next meal.` No guilt message or zero-state chart.
6. **Support.** Three quiet rows: `Train · Your next session`, `Water · 24 oz · Add 8 oz`, `Weight · Last check-in … · Check in`. Make the water increment visible and offer undo. Ask Ding follows. Weight trend and weekly recap can live lower down or in Reflect.
7. **Dock.** Four destinations with persistent text labels, minimum 52px content height plus the actual bottom inset. Selected item uses cream text, a terracotta marker and `aria-current="page"`; inactive text stays legible.

Home states: first use shows the invitation; returning use shows the same action; an active draft changes it to `Finish your food`; analyzing shows `Checking your food…`; result ready shows `Your food is ready to check`. Saving adds the food row and shows `Logged. LETS GOOOO` with Undo. Use louder celebration for the first log or a meaningful milestone, not every sandwich. Above-target days keep the same action and neutral palette.

### First launch

Keep essential onboarding and existing safety logic. Replace the automatic four-stop tour with one invitation after onboarding: `Yooo. Lets start with what you ate.` / `Show me a meal and Ill work out the macros. You get the last word.` Primary opens the same composer; `Look around first` dismisses it. Optional `Try an example` loads an explicitly marked sample result and never writes it to the food log. Do not fabricate a live lookup for a sample. Camera and AI consent remain contextual, before their respective use. A later project can defer optional onboarding questions, but don't tear apart target setup for this redesign.

### Food composer entry: top to bottom

**Shell:** one modal sheet, 24px top radius, max width 448px. On compact iPhone heights use the available full height; elsewhere leave safe top clearance. Header and bottom action remain visible, with one scrollable body. Avoid the current 94dvh outer scroller plus 40vh inner result scroller. Use a tested dialog primitive or a correctly implemented portal: accessible name, focus containment, inert background, Escape/back behavior, focus restoration, body scroll lock. Do not implement a decorative drag handle that implies a gesture you don't support.

1. Header: `Your food` and 44px Close. Close preserves the draft. No calorie allowance eyebrow while capturing food.
2. Title: `Show me what you ate`. Supporting line: `A photo, a few words. Lets figure it out.`
3. Primary 64px **Take a photo**, with Camera icon. Tapping uses the native camera on iOS. Do not launch it automatically on sheet open: people must still be able to type, use a saved photo or log packaged food.
4. Two secondary minimum-48px controls: **Photos** and **Barcode**. Equal to each other, visually quieter than camera. On web, provide a supported barcode flow or manual code field; avoid silent native-plugin failure.
5. Selected photos: 112px thumbnails with 44px removal targets. Camera becomes `Add another photo`. Keep an attachment limit and compression status explicit; retain existing upload processing limits.
6. Visible textarea label **Tell me about it**, 16px text, three rows. Placeholder `Chicken bowl, extra rice. Ate about half.` Helper `Place, size, sauce — whatever you know.` No auto-focus on entry; don't summon a keyboard over the camera action.
7. Always-present 56px **Figure out my food**. Disabled until trimmed text or an attachment exists. Disabled helper: `Add a photo or a few words to get started.` No disappearing gradient CTA, no Enter-to-submit from a multiline note.
8. **Your usuals**: at most three rows plus `See all`; picking one enters the same review immediately. Restaurant menus and `Enter macros myself` remain within this composer.

States: denied camera → `Camera access is off. You can use Photos or type it here.` with those actions and optional Settings; camera cancel → return silently to intact draft; offline → retain draft, explain the need to reconnect for analysis; barcode miss → `Couldnt find that one. Show me the nutrition label.` with a camera action; quota → explain availability and keep manual/known-food options; upload failure → retry that upload without discarding other attachments. Do not automatically turn every error into a blank manual form.

### Analyzing: top to bottom

Keep the same sheet and photo/note identity. Show a 160px photo crop, one 24px title, one 18px current status and at most two completed factual steps in 14px secondary text. No percentage: you don't know the denominator. The 10–40-second helper is based on the supplied current experience, not a completion guarantee; replace it with measured copy if latency changes.

| Actual event | Visible state/copy | Evidence required |
|---|---|---|
| Local attachment upload | `Sending your photo…` | Actual pending upload. Byte progress may be shown for upload only. |
| Worker starts model / lookup | `Looking at your plate…`, `Reading what you ate…`, or `Looking up that barcode…` | Accepted job + actual input type. |
| Structured food candidate, if available | `Looks like a chicken bowl. Checking…` | Validated candidate output. Do not claim this happens early in today's single final-JSON call. |
| Search begins | `Looking for nutrition info…` | Real search tool event. Skip this entirely on paths without search. |
| Specific page opened | `Checking chipotle.com…` | Actual opened-page/tool evidence, not a query containing Chipotle. If it is a nutrition page and known to be official, say `Checking Chipotle's nutrition page…`. |
| Parsed answer validation | `Checking the portions and totals…` | Server parsing, unit/numeric validation and evidence mapping actually running. |
| Deliberate bounded fallback | `That lookup didnt work. Trying another way…` | A real retry starts. Never silently reset the clock. |
| Valid completed result | `Got it. Take a look.` | Complete validated draft, not partial JSON. |

At about 15 seconds keep the original expectation visible; don't invent a step. At 40 seconds: `Taking a little longer. Your food is still here.` **Keep using Ding** minimizes the sheet once a server-owned job is durable; show a status row above the dock on every destination. On completion it changes to **Review your food**. Never steal focus or interrupt a workout to open the result. Returning from iOS background reads the server job; a client timer alone is not background execution. No push-permission request is needed for this.

**Stop analysis** requests cancellation; keep the photo and note. While cancellation is pending, say `Stopping…`; after it is acknowledged discard late results for that revision. A proposed 90-second total product deadline bounds the whole attempt, including fallback; make it a server setting and measure before tightening it. Timeout: `That took too long. Your food is still here.` Actions: Try again / Enter macros myself. Network loss is `Reconnecting…`, not an inference that the server failed. No result logs itself.

### What the backend needs

Current architecture: services/geminiService.ts does a nutrition lookup, calls the Responses proxy, parses the final JSON on the client, and may start the legacy pipeline. functions/src/index.ts awaits `responses.create` without streaming and only then extracts citations. A frontend timer cannot supply truthful intermediate claims from this.

Recommended staged implementation:

1. First UI release: make the existing wait dismissible, preserve the draft and expose only real coarse stages known to the client. Do not yet promise survival across app termination or show unavailable search detail.
2. Durable release: authenticated `startFoodAnalysis` validates input/consent/quota, creates an idempotent job and returns jobId. A server worker owns the entire pipeline and bounded fallback. Photo upload finishes before claiming the app can leave; use private object references rather than stuffing image bytes into the job document.
3. The worker consumes provider streaming events and writes normalized progress plus terminal result to a user-owned Firestore job. Subscribe using the project's existing Firebase stack. Add ownership rules, server-only status/result writes and a retention policy; never include photos or raw prompts in analytics. Firestore supports realtime document listeners; the worker itself still needs to be implemented. [Firebase documentation](https://firebase.google.com/docs/firestore/query-data/listen).
4. Emit `{ jobId, revision, seq, at, type, payload }`. `type` is uploading/reading/candidate/searching/source_opened/validating/retrying/ready/failed/cancelled. Sequence numbers order updates; revisions isolate a corrected request. Persist current snapshot and a short milestone history. Duplicate or older updates never replace newer state.
5. Provider search events indicate searching/in-progress/completed; a search-completed signal does **not** establish the exact food or that a particular nutrition page was read. Derive domain-specific copy only from appropriate tool output. Never expose model reasoning or pretend it is operational telemetry. [OpenAI streaming event reference](https://developers.openai.com/api/reference/resources/responses/streaming-events), [web-search action documentation](https://developers.openai.com/api/docs/guides/tools-web-search).
6. The current one-call design may not expose food identity until the final answer. Ship the honest coarse messages first. Add an explicit structured identification step only if early identity/correction materially helps users enough to justify latency and cost; don't add a model call just to animate a checklist.
7. Validate finite nonnegative values, units, serving basis, missing nutrients, evidence links and item identity. Keep immutable per-base-amount macros. Separate identification uncertainty, portion uncertainty and nutrition evidence; a model's `high` string is not a calibrated probability. Partial tool text and unfinished JSON never become saveable food records.
8. Save uses a unique meal/draft key and atomic deduplication; disable repeated taps locally too. Server attempts consume quota according to an explicit bounded policy, not accidentally once for each hidden fallback. Closing a sheet does not cancel a job. Correcting food creates a new revision scoped to the affected item; unrelated foods and user edits remain intact.

### Review: top to bottom

1. Photo/note stays recognizable. Small introduction `Yep okay, heres what I found`; for ambiguous food `Heres my best read`. Title at 28px is the actual dish, e.g. `Chicken shawarma plate`, not `Review Detected Items`. For several distinct foods use `Your meal · 3 items` and list each name directly below.
2. Totals card: 36px **780 kcal**, then Protein / Carbs / Fat with full labels and values at 18px. Treat this example as illustrative, not a nutrition claim. Sum the draft exactly once; do not add both composed-dish totals and its ingredients. Round for display, not at every edit step.
3. Plain-language evidence sentence, per item when mixed: `Menu numbers. Rice amount estimated.` / `Label values for 1 bar (60 g).` / `Photo estimate. Sauce amount is the guess.` An exact menu match still does not prove the photo's portion. Unknown evidence reads `Estimate`; don't hide uncertainty because the source field is missing.
4. Each item is a calm 20px-title card with its assumed amount at 16px: **Base amount: 6 oz chicken + 1 cup rice**. Below, `How much of that amount?` and four 44px controls: ½× / 1× / 1½× / 2×. Show selected quantity and resulting kcal. Say “base amount” so the original assumption remains truthful when scaled. In the detailed editor offer grams/custom quantities. For barcode data with no serving, show `Base amount: 100 g`, not `1 serving`; request consumed grams if needed.
5. Two visible actions: **Thats not it** and **Edit amount & macros**. The former opens `What did I miss?` with a short note and **Check again**. One tap reaches the fix; no method can guarantee a correct new answer without information. Preserve the photo and other items. If meaningful candidate alternatives actually exist, offer them as choices. Choosing one reruns or retrieves that food's nutrition; never just rename the previous macros.
6. Specific uncertainty gets a gold-edged sentence: `Chicken or tofu? I couldnt tell.` or `I couldnt read the serving size.` Not a red `LOW` badge. Allow estimates to be logged with that uncertainty intact; block only invalid/missing required data, not imperfect confidence.
7. **How I got this** disclosure: source title and actual URL, match/portion limitations, base serving, fiber (unknown stays unknown), and ingredient breakdown where available. Keep relevant source citations adjacent to source-dependent claims and directly accessible; no unlinked hostname masquerading as evidence. Provider-required visible citations should remain visible even if other details collapse. Database availability and API-key errors belong in operational diagnostics.
8. Sticky footer: 56px terracotta **Log this meal · 780 kcal**, charcoal text. Secondary **Back to my photo / note**. Saving disables duplicate commits; failure retains edits and offers retry. Removing the last item gives `Nothing left to log. Lets start again.` and an Add food action. Successful save returns to Today, updates the food list and daily totals, and retains Undo.

Full editor: same composer, Back returns to review; food name, amount/unit, calories, protein, carbs, fat and fiber use labeled 16px controls in at most two columns. Ingredient edits recompute the dish from ingredients. Direct nutrient overrides mark those values **Edited by you** and must not be overwritten later by stale ingredient totals. Correcting a name is either cosmetic with an explicit edit record, or a food replacement that recalculates nutrition. Store which operation occurred.

## 3. Reference React + Tailwind code and integration

See **DingFoodFlow.tsx** in this directory. Three components are implemented against the repository's installed React/Tailwind/Lucide packages:

- `FoodEntry`: camera-first composer content, controlled photo/note draft, persistent submit action, trimmed-input guard, upload removal, accessible labels, error retention and repeated-submit guard.
- `AnalysisProgress`: event-driven copy, no fake percentages, completed milestones, conditional safe minimization, offline/delayed/ready/error/cancel states and reduced-motion treatment.
- `MealReview`: computed meal totals, immutable-base portion multipliers, correction form, evidence disclosure/links, detailed-editor callback, empty/error/saving states and duplicate-tap guard. `sumMeal` preserves unknown fiber.

These are reference UI components, not a deployed feature or a completed backend migration. They pass the repo's TypeScript check. `FoodEntry` and `AnalysisProgress` are content for the accessible composer shell; they are not dialogs by themselves. `MealReview` provides its own sticky footer. Parent callbacks must be wired before production use. Keep input/selection state outside these components so closing/reopening restores it.

Concrete seams:

| Current code | Integration |
|---|---|
| FuelHome's onQuickAddFood + MainApp openAddFood | Keep one opening function; use it for the signature action. Add optional seed input for a recent/restaurant/coach item, never a separate save path. |
| MainApp's foodImages / foodDescription | Move into the persistent draft controller; map to FoodEntry. Camera/library/barcode callbacks own permissions and preserve cancellations. |
| isAnalyzingFood and BowLoader | Replace boolean-only rendering with a discriminated job/composer state and AnalysisProgress. Handle cancellation-pending in the parent; do not mark cancelled merely because a button was tapped. |
| ScannedItem strings | Validate before mapping to numeric ReviewFood. Choose an explicit base: 1x may be the already-analyzed plate; don't multiply `servingsConsumed` twice. |
| setScannedPortion | Scale immutable base numbers once; preserve consistent ingredient bases and make the reference amount visible. |
| FoodDetailSheet | Refactor its editable content for draft use inside the composer. Distinguish ingredient-driven calculation from direct nutrient overrides. |
| addAllScannedItems / FoodItem / HistoryEntry | Persist source evidence, serving basis, uncertainty, edits and draft key along with totals. Preserve metadata through recent-food re-log and menu reuse. |
| source badges | Convert verified evidence into human summary copy. Do not mechanically turn `high` into `Verified`. Retain the raw diagnostics privately for support. |

The source URL normalizer in the reference code permits only http/https. The application must still decide whether evidence actually supports an item; rendering a link is not verification. The supplied code delegates the native camera, shared modal shell, backend worker, detailed editor and saved-log adapter to existing/new application infrastructure rather than pretending those exist.

## Code-confirmed problems and targeted QA

| Finding | Evidence | Repair / acceptance |
|---|---|---|
| Calories left is clamped | FuelHome:127; MainApp:2256; additional FuelCoach context at MainApp:2817 | Use exact signed target − eaten consistently in UI/share payload. Keep exercise separate. |
| Single logging route is not yet universal | MainApp:2824 and :2839 directly save from FuelCoach and RestaurantHub | Prefill the same review; one common commit and undo behavior. |
| Empty AI result appears to do nothing | MainApp:1694 clears foodForm but doesn't change addFoodMode; analysisTip only renders when scannedItems.length > 0 | Dedicated no-food-result state with retained input and clear retry/manual actions. |
| Errors collapse into a food joke/manual form | MainApp:1715 catch handles all failures the same way | Distinguish connection, auth/quota, unreadable image and no match. Never imply the user's food is at fault for an outage. |
| Barcode cancel and denied camera are swallowed together | MainApp:1593–1606 | Silent cancel; actionable permission error; supported web alternative. |
| Trust metadata is lost at save | MainApp:1742 mapping and types.ts:175 | Preserve evidence and portion basis in saved food/history. |
| User/AI numbers can become “verified” on reuse | MainApp:1785–1808 auto-adds attributed scan values to custom menus; geminiService:1527 includes effective custom items; :1547 labels the reference VERIFIED MENU DATA | Separate curated published entries from user/AI entries. Carry origin, amount and edits; never promote confidence just because a value was saved. |
| Renaming leaves old nutrition and confidence | MainApp:1963 updateScannedItem | Explicit identity correction recomputes; cosmetic edits stay labeled as edits. |
| Numeric sanitizer can turn -10 into +10 | MainApp:173 safeFloat strips everything except digits/dot | Validate number input; reject malformed/negative entries instead of silently changing meaning. Preserve meaningful zero. |
| Macro override and ingredients can disagree | MainApp:1963 clears base but leaves ingredients; FoodDetailSheet:91 uses ingredient sums | Define one authoritative representation after each edit and show override status. |
| Portion text can contradict scaled numbers | MainApp:1973 updates macros/ingredients/portion but not servingSize, servingsConsumed or portionNote | Explicit base-versus-selected quantity; convert actual serving display consistently. |
| Inactive dock items lose text and accessible names | Layout:219–246 renders labels only for active tab; no explicit per-button name | Persistent visible labels and aria-current. |
| Small controls and missing labels | MainApp:2320 image removal 20px, :2555 removal unnamed; :2616 numeric label/input siblings lack associations; Layout:126 avatar 36px | 44px targets and associated labels; VoiceOver traversal. |
| Nested scrolling and modal semantics | MainApp:2236 and :2512; no dialog semantics/focus trap in sheet markup | One scroll container; modal focus lifecycle; footer above keyboard. |
| Safe-area implementation incomplete in web CSS | Layout:207 uses pb-safe, absent in index.css; index.html has no viewport-fit=cover; native config uses contentInset always and overlaysWebView false | Choose and test one inset strategy. Do not blindly add CSS insets over native insets. Physical notch/home-indicator/keyboard checks required before claiming overlap. |
| Zoom disabled and reduced-motion support absent in supplied styles | index.html:6; index.css bow and other animations | Allow zoom; honor prefers-reduced-motion; test large text reflow. |
| Profile-name editor overwrites full name with first name | Layout firstName → nameDraft → onUpdateName(trimmed) | Move full display-name editing to Profile and preserve all entered words. |

The plus is also absent on the Ask tab (`activeTab !== 'coach'`), contrary to the description that it is on every tab. This matters if Ask remains a place users mention meals: provide the same food launcher there rather than relying on discovery elsewhere.

Device acceptance: test 320/375/390/430px widths; large text/200% zoom; long food names; screen reader order, active tab and focus return; denied camera; web barcode fallback; background and relaunch during a 40-second scan; network loss after job acceptance; barcode per-100g fallback; zero-calorie foods; unknown fiber; multiple composed dishes; 2x → 0.5x → 1x without drift; correction affecting only one item; late response after cancellation; repeated Save; review restored after close; keyboard not covering actions. Browser/TypeScript checks alone do not establish these.

Build order: fix signed calories, empty/error states and provenance promotion first; then ship the food-led home and readable review; then implement durable streamed jobs; finally replace the tour and finish device accessibility/motion QA. Keep the calorie-floor calculation and existing food-safety stance out of this refactor.

## 4. Don't do

- Don't add a Scan tab, camera FAB and separate text logger. One composer, one draft, one save path.
- Don't use timed “Found Chipotle” theater, made-up confidence percentages, or checking-source claims inferred only from search keywords.
- Don't hide uncertainties, or turn all uncertainty into a red alert. Say what needs checking.
- Don't rename a food while keeping the previous food's macros.
- Don't turn user edits or saved guesses into published nutrition on the next scan.
- Don't recreate a neon dashboard, glass card stack or three-font control panel. The plate and Cuodi's voice are already distinctive.
- Don't generate more Hidatsa words or turn cultural identity into a scanning animation.
- Don't use jokes about the food being weird/bad during failures. Be funny about the app; be useful about the food.
