# Nutrition Accuracy Report — Ding! Fitness v1.0

**Bottom line.** Within a logged food, portion scaling, aggregation, idempotent saves and calorie/macro bookkeeping are correct (18 passing tests on the real modules). The material problems sit one level up, in **how targets are produced**: an LLM computes the first targets (NUT-02), protein is based on total body weight (NUT-01), and nothing caps implausible AI-estimated calories (AI-02). **Dates** also cause wrong days on DST and non-US locales (DATE-01/02).

Test suite: `audit/tests/nutrition-audit.test.mjs` — run `node --test audit/tests/nutrition-audit.test.mjs` from the repo root after `npm ci`.
Result on `52f33aa`: **26 tests, 18 pass, 8 fail.** All 8 failures are tests marked `DEFECT:` that assert the correct behavior (output: `evidence/nutrition-audit-test-output.txt`). The existing suite `tests/food-flow.test.mjs`: 12/12 pass.

---

## 1. Formulas in use (verified against source)

| Quantity | Formula | Where | Verified |
|---|---|---|---|
| BMR (default) | Mifflin-St Jeor: 10·kg + 6.25·cm − 5·age + 5 (M) / −161 (F) | `constants.tsx calculateTDEEDetailed` | [TEST] #1 |
| BMR (body fat 5–60 %) | Katch-McArdle: 370 + 21.6·LBM_kg | same | [TEST] #2 |
| TDEE | BMR × 1.2 / 1.375 / 1.55 / 1.725 / 1.9 | same | [TEST] #1 |
| Units | lb→kg ÷2.20462, in→cm ×2.54 | same | [TEST] #1 |
| Calorie target | TDEE + goal delta (−600 WL, −350 recomp, −300 lean, +300 bulk, −100 perf) or timeline rate (≤1 %/wk loss, ≤0.5 lb/wk gain) | `CALCULATE_MACROS` | [SRC] |
| Safety floor | max(1,500 M / 1,200 F, 0.75 × TDEE) | `getMinSafeCalories` | [TEST] #4 |
| Protein | weight_lb × 0.85–1.15 g | `constants.tsx:555` | [TEST] #5–6 (DEFECT) |
| Carbs / fat | remaining kcal split per preset ÷4 / ÷9 | same | [TEST] #3 |
| Energy balance (display only) | BMR + active (Health truth, else NEAT baseline + logged) + 10 % TEF | `computeEnergyBalance` | [TEST] #7 |
| Calories left | target − eaten (signed) | `Dashboard.tsx` | [SRC] |
| Adaptive TDEE | formula + 0.4 × (inferred − formula), capped ±400 | `src/utils/adaptiveTDEE.ts` | [TEST] #26 (DEFECT) |

The 4/4/9 Atwater factors are used only to split the target into macros. **Logged food calories are never recomputed from macros**, so label and database calories are respected. That matches the brief's "do not overwrite legitimate database calories". The flip side is that nothing *flags* an item whose calories contradict its macros (AI-02).

---

## 2. Mandatory test cases — results

| # | Scenario | Result | Evidence |
|---|---|---|---|
| 1 | Log 100 g of a food | ✅ exact | #8 |
| 2 | Log 150 g of the same food | ✅ exact (×1.5) | #8 |
| 3 | 0.5 servings | ✅ | #8 |
| 4 | 2.5 servings | ✅ | #8 |
| 5 | Change serving units | ⚠️ grams only when the source gave per-100 g (barcode); otherwise a multiplier of the base portion. No g↔oz/cup conversion exists in the app. | [SRC] `FoodEditor.tsx` |
| 6 | Edit an existing logged entry | ✅ today only · ❌ past days not editable (FUNC-01) | [SRC] |
| 7 | Delete a previously logged entry | ✅ today only · ❌ past days (FUNC-01) | [SRC] |
| 8 | Add the same food twice | ✅ two entries, `loggedCount` 2 | #14 |
| 9 | Multiple foods, different meals | ✅ totals; meal grouping is derived from the timestamp (`classifyMeal`). No "move between meals" feature exists. | [SRC] |
| 10 | Change a food DB entry after logging | ✅ logged items are copies; edits to Recent don't alter history after persistence | [SRC] |
| 11 | Zero-calorie product | ✅ | #11 |
| 12 | Incomplete nutrition values | ✅ fiber stays unknown in the composer · ❌ barcode path turns missing protein/carbs/fat into 0 (NUT-04) | #12, [SRC] `functions/src/index.ts:1391–1393` |
| 13 | Reject negative / invalid quantities | ✅ | #10 |
| 14 | Extremely large valid quantity | ✅ accepted, no upper sanity warning (P3) | #13 |
| 15 | Crossing midnight with the app open | ✅ `commitFood` (existing test) · ❌ `MainApp` rollover can drop food (DATA-02) | #24, #25 |
| 16 | Changing timezones | ❌ westward travel triggers DATA-02; DST breaks day navigation (DATE-01) | #22, #24 |
| 17 | Daily totals after sync | ⚠️ multi-device last-writer-wins on whole arrays (DATA-03) | [SRC] |
| 18 | No duplicate logs after a retry | ✅ stable ids, idempotent | #15 + existing suite |
| 19 | Displayed vs stored totals | ✅ stored day totals equal the item sums | #17 |
| 20 | Consistent after restart | ✅ `localStorage` + Firestore cache; not run on device | [SRC] / [RUNTIME?] |

---

## 3. Findings

### NUT-01 (P1) — protein on total body weight
See `CRITICAL_ISSUES.md #9`. A 250 lb sedentary woman gets 288 g protein and 22 g fat (70 % / 12 % of calories).

### NUT-02 (P1) — onboarding targets come from Gemini arithmetic with different rules
See `CRITICAL_ISSUES.md #8`. The deltas differ by 100–150 kcal from the app's own formula, and targets shift the first time the user saves their profile.

### AI-02 (P2) — no plausibility check on AI estimates
`validateFoodResult` (`functions/src/foodJobs.ts:17`) checks types and non-negativity only. [TEST] #20, #21: an apple at 4,800 kcal and a 50,000 kcal sandwich pass. The review screen does show the numbers before logging (good, nothing logs itself), but a hallucinated value is one tap from the log.
**Fix:** reject or flag items where |kcal − (4P + 4C + 9F)| > max(80 kcal, 35 %) (unless `source: 'label'`) and items above ~3,000 kcal. Show a "these numbers look off" warning in `MealReview` instead of failing silently.

### NUT-03 (P2) — adaptive TDEE reads weight trends at roughly half speed
`adaptiveTDEE.ts:111,143`. The two 7-day averages are about 7 days apart (centroid to centroid), but the change is divided by the full first-to-last span (~13 days). [TEST] #26: a steady 1 lb/week loss on 2,000 kcal (true TDEE 2,500) yields a **−92 kcal** suggestion when the correct answer is ≈0. Repeated acceptance compounds it.
**Fix:** divide by the distance between the two window midpoints, or fit a linear regression to the weigh-ins.

### NUT-04 (P2) — barcode lookups turn missing nutrients into verified zeros
`functions/src/index.ts:1391–1393` (`Number(n['proteins_100g']) || 0`), same for the USDA path. An Open Food Facts product with calories but no protein field is logged with 0 g protein, labeled "label record".
**Fix:** treat missing as unknown, mark the item "needs check", and open the editor.

### NUT-05 (P2, [RUNTIME?]) — USDA Foundation foods may come back as 0 kcal
`searchNutrition` reads energy only from nutrient 1008. Many Foundation-type records carry energy as 2047/2048 (Atwater) instead. Such a match would be sent as a 0-kcal "high confidence" candidate (Foundation ranks first). It's framed as a candidate to verify, and the model usually overrides it, but it shouldn't be offered. Couldn't be checked live: no network to `api.nal.usda.gov` from the audit sandbox.
**Fix:** fall back 1008 → 2047 → 2048 → 4P + 4C + 9F, and drop candidates with energy 0 but macros > 0.

### SAFE-01 (P2) — custom targets bypass the safety floor
`MainApp.tsx:2428` `Math.max(800, …)`. The automatic path floors at 1,200 / 1,500 kcal, but manual targets allow 800 kcal with no warning, which conflicts with the ED-safety stance in the listing and disclaimer.
**Fix:** floor at `getMinSafeCalories`, or require an explicit acknowledgement plus a resource link.

### P3 items
- `FoodEditor` pre-fills inputs with raw floats (`770.0999999999999`, [TEST] #18). Round to 1 decimal for display.
- Targets don't follow weight check-ins: `nutritionTargets` is stored and only recomputed on Edit Profile or an adaptive accept. That seems intended, but the coach prompt says "Mention that you are adjusting their Path/Protocol" when weight changes (`geminiService.ts:356`), which no longer happens.
- No sugar or sodium tracking exists (`sugarConsumed` field exists but is never populated). Don't claim it in metadata.
- Water is tracked in fl oz only; there's no metric option.

---

## 4. Data integrity

| Check | Status |
|---|---|
| Serving size and unit are stated | ✅ `basePortion` and `portionNote` on every item |
| Missing values ≠ verified zero | ⚠️ composer ✅; barcode ❌ (NUT-04); USDA energy ⚠️ (NUT-05) |
| Source traceability | ✅ `nutritionEvidence.source/summary/sources` per item (scan-level citations labeled "Scan source:") |
| Estimates labeled | ✅ "Estimated from your photo…", "Web-assisted estimate…", plus `needsCheck` |
| User foods not marked verified | ✅ editing sets `editedByUser` and clears `confidence` |
| Edited custom foods don't corrupt history | ✅ copies |
| Recipe totals = ingredients | ✅ [TEST] #9 |
| Raw vs cooked | ⚠️ left to the model and user; prompt doesn't ask the model to state raw vs cooked for weighed items. Add it to `portionNote`. |
| No double counting | ✅ Health active energy treated as truth ([TEST] #7) |
| Duplicates | ✅ idempotent commit |

**External data limitation.** The accuracy of USDA, Open Food Facts, chain menus (`data/restaurants.ts`, 44 chains per the listing; file last modified Aug 19, 2026) and model web searches **could not be independently verified** here. Recommendation (already in HANDOFF): a 15–20 meal regression set with known macros, re-run after every prompt or model change.
