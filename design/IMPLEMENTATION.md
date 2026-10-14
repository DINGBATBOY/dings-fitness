# Ding! food flow — implementation and release notes

Implemented in the existing app; no separate prototype is required for production. The dev-only preview at `/design/preview.html` uses sample totals and disables AI requests. It is excluded from the production build.

## What changed

- `FuelHome` leads with **Show me what you ate**, followed by a smaller signed calorie balance, food log and supporting actions. `Layout` has four always-labeled destinations. The same food launcher follows the user when the home hero is offscreen.
- `FoodComposer` owns one photo/text/barcode/manual/usuals/menu flow. The camera opens only on a camera tap. Photos remain local until analysis is explicitly started. Barcode values go through review without AI analysis.
- `FoodDialog`, `FoodEntry`, `AnalysisProgress`, `MealReview` and `FoodEditor` provide keyboard-safe scrolling, native modal focus containment, readable controls and reduced motion. The automatic tour is now one food invitation.
- Reviews lead with food and totals. Portion buttons use an immutable base. Full macro/ingredient editing and **Thats not it** remain available. Unknown fiber remains unknown. Saved food carries sources, amount and uncertainty into its next use; manually edited numbers no longer imply model confidence.
- Photos, notes, editor fields and accepted jobs persist per account in IndexedDB. A saved request ID allows an interrupted acknowledgement to be recovered or explicitly retried with the same ID. Ready results never auto-log. Stable food IDs protect retried saves; a pure commit helper handles food finished after midnight.
- Food and water actions offer Undo. Deletion copy no longer judges the food. Minimum calorie floors and `target − eaten` are unchanged. Existing Hidatsa wording and its credit are preserved; no language was added.
- Removed user-created menu estimates from prompts labeled **VERIFIED MENU DATA**. Stabilized the user subscription dependency to avoid reattaching database listeners on every render. Firestore's persistent local cache keeps pending writes across reloads when device storage is available.

## Real analysis events

The client calls `startFoodAnalysis` after consent is saved. The authenticated callable stores private input and creates `foodAnalysisJobs/{uid}_{jobId}`. A Firestore trigger owns the AI request even when the UI is closed. The app observes the job document.

| State | User-facing meaning | Evidence |
|---|---|---|
| Preparing | Getting your food ready | Client preparing the input and nutrition references |
| Queued | Your food is next | Server accepted and durably stored input |
| Reading | Looking at your plate / Reading what you ate | Worker claimed the job |
| Searching | Looking for nutrition info | Actual Responses API search event |
| Source opened | Checking *domain* | Actual tool `open_page` action; validated HTTP(S) URL |
| Validating | Checking the numbers | Completed response being parsed and validated |
| Ready | Your food is ready to check | Validated result persisted |
| Failed / cancelled | Recoverable explanation and retry/manual entry | Terminal server state |

There is no fake percentage, timed restaurant reveal, invented page visit or raw reasoning stream. The provider does not expose a verified intermediate food identity, so **Found Chipotle** is not fabricated. Status updates may arrive too close together to see every state.

The worker has a 90-second budget, at most one retry for transient provider failures, monotonically increasing sequence numbers, duplicate-delivery protection and terminal-state guards. Cancellation before upload acknowledgement reserves a cancelled job ID so a late upload cannot restart it. Corrections replace only the selected item after a valid result arrives.

Server inputs use the private `foodAnalysisInputs/{uid}/` Storage prefix. Normal completion removes input immediately. The hourly cleanup recovers stalled jobs, expires result documents after 48 hours and sweeps orphan uploads older than two hours in bounded pages. Cleanup timing is approximate, especially at larger scale. Account deletion removes owned jobs, private inputs and the local food draft. Local drafts remain until logging/discarding. No photo is placed in food history or the user profile document.

## Deploy backend first

This checkout has **not** been deployed. The new frontend requires the new functions; deploy the backend before publishing web assets or sending a TestFlight build. Existing clients continue to use the legacy callable.

From the repository root, using the intended Firebase project:

```powershell
npm run typecheck
npm run test:food
firebase deploy --only "firestore:rules,firestore:indexes,storage"
firebase deploy --only "functions:startFoodAnalysis,functions:cancelFoodAnalysis,functions:processFoodAnalysis,functions:cleanFoodAnalysis,functions:deleteAccount"
npm run build
```

Confirm the new composite index is ready, the existing `OPENAI_API_KEY` secret is available, the configured model supports Responses + web search, and the default Storage bucket exists. The Firestore trigger, scheduled function and Storage access need their usual Firebase service permissions. The maintenance collection and private input prefix use default-deny client rules. Rule helpers were moved into their service scope.

After an authenticated scan passes in a staging build, release web hosting using the project's normal process. On the Mac used for iOS builds, run `npm run cap:sync`, open Xcode and test before uploading a build. No native dependency was added.

## Verification

- Frontend typecheck and production build passed.
- Functions TypeScript build passed.
- 12 regression tests passed: portions without rounding drift, ingredient totals, re-use of saved evidence, unknown vs zero fiber, valid numbers, label servings, safe URLs, user overrides, server response validation, duplicate save and both midnight date choices.
- Browser checked at 390 px: manual entry → review, half portion macro changes, draft retention after reload, explicit logging and draft reset. Further checks cover narrow-screen controls and retained editor input.
- Production build still reports a large main bundle. This redesign does not complete app-wide code splitting or restyle every legacy profile/workout screen.

Live authenticated model calls, deployed rules/trigger behavior, cancellation under real network loss, offline sync across devices, VoiceOver, native camera/barcode permissions and iOS safe-area/keyboard behavior still need device/staging verification. Java is unavailable here, so Firestore emulator rules tests were not run. Windows cannot perform the final Xcode build.

Protocol references: [Responses streaming events](https://developers.openai.com/api/reference/resources/responses/streaming-events), [web search](https://developers.openai.com/api/docs/guides/tools-web-search), [Firestore listeners](https://firebase.google.com/docs/firestore/query-data/listen), [Firestore-triggered functions](https://firebase.google.com/docs/functions/firestore-events), [Firebase rules scope](https://firebase.google.com/docs/rules/rules-language).
