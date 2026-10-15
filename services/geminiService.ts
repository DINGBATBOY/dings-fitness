/**
 * Gemini service — client side.
 *
 * All AI calls go through the Cloud Function `callGemini` (functions/src/index.ts),
 * which holds the API key server-side and enforces per-user daily quotas.
 *
 * The shape of inputs and outputs is unchanged from the previous direct-to-Gemini
 * implementation, so MainApp.tsx and other callers don't need to change.
 */

import { Type } from "@google/genai";
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import { ChatResponse, DailyLog, UserProfile, NutritionTargets } from "../types";
import { detectRestaurantsInText, findMenuItemMatches, type Restaurant, type MenuItem } from "../data/restaurants";

// ---------------------------------------------------------------------------
// Sanitization (defense in depth — server also limits payload size).
// Strips HTML tags and caps length to keep prompts within reasonable bounds.
// ---------------------------------------------------------------------------
const sanitize = (text: string, maxLen = 4000): string =>
  (text ?? "").replace(/<[^>]*>/g, "").trim().slice(0, maxLen);

// ---------------------------------------------------------------------------
// Low-level proxy caller.
// All AI calls in this file go through this function.
// ---------------------------------------------------------------------------
type ProxyRequest = {
  contents: unknown;
  config?: unknown;
  /**
   * Which app feature this is. The server only accepts its own allowlist
   * (functions/src/aiPolicy.ts GEMINI_FEATURES) and picks the model and
   * tools itself (audit SEC-01).
   */
  feature: 'sendChatMessage' | 'analyzeDailyLog' | 'fuelCoachIdeas';
};
type ProxyResponse = {
  text: string;
  functionCalls: any[] | null;
};

async function callGeminiProxy(req: ProxyRequest): Promise<ProxyResponse> {
  if (!functions) {
    throw new Error("Firebase not configured. AI features unavailable.");
  }
  const fn = httpsCallable<ProxyRequest, ProxyResponse>(functions, "callGemini");
  try {
    const res = await fn(req);
    return res.data;
  } catch (err: any) {
    // Surface a clean error message to the UI.
    const code = err?.code as string | undefined;
    const message = err?.message as string | undefined;
    if (code === "functions/unauthenticated") {
      throw new Error("Please sign in again to use AI features.");
    }
    if (code === "functions/resource-exhausted") {
      throw new Error(message || "Daily AI limit reached. Try again tomorrow.");
    }
    if (code === "functions/invalid-argument") {
      throw new Error(message || "Invalid request.");
    }
    if (code === "functions/failed-precondition") {
      throw new Error(message || "Allow AI features first.");
    }
    throw new Error(message || "AI service unavailable. Please try again.");
  }
}

// ===========================================================================
// searchNutrition — proxy to USDA + Open Food Facts via Cloud Function
// ===========================================================================
export interface NutritionMatch {
  source: "usda" | "openfoodfacts";
  name: string;
  brand?: string;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g?: number;
  servingSize?: string;
  sourceUrl?: string;
  confidence: "high" | "medium" | "low";
  /** 0..1 share of the query's food words this match covers (server-side gate). */
  relevance?: number;
}

export interface SearchNutritionResponse {
  matches: NutritionMatch[];
  sourcesUsed: ("usda" | "openfoodfacts")[];
  sourcesSkipped: { source: string; reason: string }[];
}

/**
 * Look up a food in USDA + Open Food Facts. Returns top normalized matches
 * (per-100g basis). Used as a tier-3 lookup inside analyzeFoodEntry before
 * the Gemini fallback. Resolves to an empty result on any failure rather
 * than throwing — the caller treats failure as "no nutrition match" and
 * proceeds to the AI tier.
 */
export const searchNutrition = async (
  query: string,
  limit = 3,
): Promise<SearchNutritionResponse> => {
  if (!functions || !query?.trim()) {
    return { matches: [], sourcesUsed: [], sourcesSkipped: [] };
  }
  try {
    const fn = httpsCallable<{ query: string; limit?: number }, SearchNutritionResponse>(
      functions,
      "searchNutrition",
    );
    const res = await fn({ query: query.trim(), limit });
    return res.data || { matches: [], sourcesUsed: [], sourcesSkipped: [] };
  } catch (err) {
    console.warn("[searchNutrition] failed", err);
    return { matches: [], sourcesUsed: [], sourcesSkipped: [] };
  }
};

// ===========================================================================
// lookupBarcode — UPC/EAN -> label nutrition via Cloud Function (no AI)
// ===========================================================================
export interface BarcodeMacros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
}

export interface BarcodeProduct {
  barcode: string;
  name: string;
  brand?: string;
  servingSize?: string;
  perServing: BarcodeMacros | null;
  per100g: BarcodeMacros | null;
  source: "openfoodfacts" | "usda";
  sourceUrl?: string;
}

export const lookupBarcode = async (
  barcode: string,
): Promise<{ found: boolean; cached: boolean; product?: BarcodeProduct }> => {
  if (!functions) throw new Error("Firebase not configured.");
  const fn = httpsCallable<{ barcode: string }, { found: boolean; cached: boolean; product?: BarcodeProduct }>(
    functions,
    "lookupBarcode",
  );
  try {
    const res = await fn({ barcode });
    return res.data;
  } catch (err: any) {
    if (err?.code === "functions/resource-exhausted") {
      throw new Error(err?.message || "Daily limit reached. Try again tomorrow.");
    }
    if (err?.code === "functions/invalid-argument") {
      throw new Error(err?.message || "That doesn't look like a product barcode.");
    }
    throw new Error("Barcode lookup is unavailable right now.");
  }
};

// The food scan runs on OpenAI through the durable job pipeline
// (services/foodAnalysisJobs.ts -> startFoodAnalysis/processFoodAnalysis).
// The old callOpenAI / foodWebLookup proxies were deleted (audit SEC-01).

// ===========================================================================
// TOOL DEFINITIONS (sent server-side as part of `config.tools`)
// ===========================================================================
// The coach's tools (saveInsight, updateUserMetric) are declared on the
// server (functions/src/aiPolicy.ts). Client-sent tools are ignored.

// ===========================================================================
// PUBLIC API — same names + shapes as before
// ===========================================================================

export const sendChatMessage = async (
  history: { role: string; text: string }[],
  profile: any,
  newMessage: string,
  /** Live snapshot of the user's food, burn and trends (services/coachContext.ts). */
  appContext = '',
): Promise<ChatResponse> => {
  const safeMessage = sanitize(newMessage);

  const systemInstruction = `You are Dings, the nutrition coach inside Ding!, a food-tracking app.
  Help with food, eating habits, macros, meal ideas, restaurants, calories burned and weight trends.
  Ding! logs workouts only as calories burned and doesn't build training plans: if asked about
  training, answer briefly and generally and bring it back to food.

  You can see the user's live data below. Use it: refer to what they actually ate, what's left
  today, their week and logged workouts. Do the arithmetic from these numbers rather than guessing,
  and never invent foods or numbers that aren't there. If something isn't in the data, say so.

  ${appContext ? `USER DATA (live from the app):\n${sanitize(appContext, 8000)}` : ''}

  User Profile:
  Name: ${profile.name}
  Age: ${profile.age}
  Weight: ${profile.weight ? `${profile.weight} lbs` : 'not shared'}
  Height: ${profile.height} inches
  PBF: ${profile.bodyFat || "N/A"}%
  Goal: ${profile.goal}
  Activity: ${profile.activityLevel}

  CAPABILITIES:
  1. SAVE NOTES: If the user says "remember this", use 'saveInsight'.
  2. UPDATE METRICS: If the user tells you their new weight or body fat (e.g., "I weighed in at 190 today", "I lost 5 lbs"), USE the 'updateUserMetric' tool immediately.

  When the user reports a weight change:
  1. Call the tool.
  2. Congratulate them or offer encouragement based on their goal (${profile.goal}).
  `;

  const contents = history.map((msg) => ({
    role: msg.role === "user" ? "user" : "model",
    parts: [{ text: msg.text }],
  }));

  contents.push({
    role: "user",
    parts: [{ text: safeMessage }],
  });

  const response = await callGeminiProxy({
    feature: 'sendChatMessage',
    contents,
    config: { systemInstruction },
  });

  return {
    text:
      response.text ||
      (response.functionCalls && response.functionCalls.length > 0
        ? "Processing your data..."
        : "I didn't catch that."),
    toolCalls: response.functionCalls ?? undefined,
  };
};

// ============================================================================
//  Food image analysis
// ============================================================================
// Two scenarios, very different accuracy needs:
//
//   (A) Nutrition label photo   → STRICT OCR extraction of printed values.
//                                  Never estimate; if not visible, null.
//   (B) Meal/dish photo         → Ingredient-level breakdown with portion
//                                  estimates and per-ingredient macros, so
//                                  the user can see and edit the components.
//
// Callers may pass an explicit `imageType` hint if the UI knows which mode
// it's in (e.g. dedicated "Scan label" vs "Photo a meal" buttons). When the
// hint is `'auto'` (default), the model inspects each image and chooses.
//
// Output schema is a superset of the previous shape — every field the old
// UI reads (items[].{name, calories, protein, carbs, fat, fiber}, tip) is
// still present. New optional fields (ingredients, servingSize,
// servingsConsumed, source, confidence) are additive so the UI can opt in.

export interface FoodIngredient {
  name: string;
  grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  emoji?: string; // optional visual hint for UI (e.g. "🍚")
}

export interface FoodAnalysisItem {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  ingredients?: FoodIngredient[];      // meal photos only
  servingSize?: string;                // label photos: e.g. "1 cup (245g)"
  servingsConsumed?: number;           // label photos: default 1
  source?: "label" | "restaurant_db" | "nutrition_db" | "web_lookup" | "visual_estimate" | "text_only";
  confidence?: "high" | "medium" | "low";
  portionNote?: string;                // what amount the numbers assume
  uncertainty?: string;
}

export interface FoodAnalysisResult {
  items: FoodAnalysisItem[];
  tip: string;
  detectedType?: "label" | "meal" | "mixed" | "text-only";
  /**
   * Which downstream nutrition databases were actually queried for this
   * analysis. Surfaced in the UI so admins can verify USDA/OFF integration
   * is firing as expected.
   */
  nutritionSourcesUsed?: ("usda" | "openfoodfacts")[];
  /** Number of matches the nutrition lookup returned (post-merge). */
  nutritionMatchCount?: number;
  /** Sources that were skipped (e.g. USDA_API_KEY not set) with reasons. */
  nutritionSourcesSkipped?: { source: string; reason: string }[];
  /** What the model decided the food is, in plain words. */
  identifiedAs?: string;
  /** Pages the model cited from its own web search (one-call scan only). */
  webSources?: { url: string; title?: string }[];
  /** Which pipeline produced this result. */
  pipeline?: "search" | "legacy";
}

// Strip a leading data: URL prefix when present.
const extractBase64 = (img: string): string =>
  img.includes(",") ? img.split(",")[1] : img;

// ---------------------------------------------------------------------------
// Does the typed text actually name a food? "what is this", "how many
// calories?", "macros pls" don't — and running a USDA / Open Food Facts
// keyword search on them returns random products, which the scan used to
// treat as authoritative. Mirrors foodTokens() in functions/src/index.ts.
// ---------------------------------------------------------------------------
const FOOD_QUERY_FILLER = new Set([
  "what", "whats", "is", "this", "that", "it", "its", "the", "a", "an", "of", "with", "and", "or",
  "how", "many", "much", "calorie", "calories", "cal", "cals", "kcal", "macro", "macros",
  "nutrition", "nutritional", "info", "in", "on", "my", "i", "ate", "had", "have", "got", "for", "to",
  "some", "please", "pls", "plz", "okay", "ok", "so", "can", "you", "tell", "me", "about", "does",
  "do", "are", "these", "those", "here", "there", "today", "tonight", "lunch", "dinner", "breakfast",
  "snack", "be", "would", "should", "estimate", "guess", "food", "meal", "picture", "photo", "pic",
  "thing", "stuff", "idk", "hmm", "um", "yo", "hey", "just", "like", "rn", "now",
]);

/** The food words in the user's text, or "" when it's only a question / filler. */
export const extractFoodQuery = (text: string): string =>
  (text || "")
    .toLowerCase()
    .replace(/['’]s\b/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(w => w && !FOOD_QUERY_FILLER.has(w) && !FOOD_QUERY_FILLER.has(w.replace(/s$/, "")))
    .join(" ")
    .trim();

// Format Open Food Facts / USDA matches as REFERENCE CANDIDATES.
//
// Oct 2026: these used to be injected as "AUTHORITATIVE — USE THESE VALUES",
// and the model obeyed even when the top keyword hit was a different food
// (teriyaki sauce for a teriyaki bowl, a random product for "what is this").
// The server now drops irrelevant hits (functions/src/index.ts relevance
// gate); the prompt still makes the model confirm it's the same food before
// using one.
//
// `softenSearchBlock`: when true, tells the model that web-lookup results for
// a named restaurant outrank USDA generics for that restaurant's items. Set
// when indie restaurant intent is detected upstream (legacy two-pass path).
const formatNutritionContext = (matches: NutritionMatch[], softenSearchBlock = false): string => {
  if (matches.length === 0) return '';
  const lines = matches.map(m => {
    const brand = m.brand ? ` (${m.brand})` : '';
    const fiber = m.fiberPer100g !== undefined ? `, fiber: ${m.fiberPer100g}g` : '';
    const sourceLabel = m.source === 'usda' ? 'USDA' : 'Open Food Facts';
    return `  - [${sourceLabel}, ${m.confidence} conf] ${m.name}${brand}: ${m.caloriesPer100g} cal, protein: ${m.proteinPer100g}g, carbs: ${m.carbsPer100g}g, fat: ${m.fatPer100g}g${fiber} (per 100g${m.servingSize ? `, serving: ${m.servingSize}` : ''})`;
  }).join('\n');

  const searchPolicy = softenSearchBlock
    ? `For RESTAURANT-NAMED items in the user's query, prefer the WEB LOOKUP
RESULTS section below if one is present — USDA generics are wrong for a named
restaurant's preparation. For generic sides not tied to the restaurant
("french fries", "ketchup"), a matching candidate here is fine.`
    : '';

  return `

NUTRITION DATABASE CANDIDATES (keyword search — verify before using):
We searched USDA FoodData Central and Open Food Facts for the food words the
user typed. These are candidates, NOT answers. Use one ONLY if it is clearly
the same food in the same form as what the user ate — same dish, raw vs
cooked, plain vs sauced or fried, and the same brand for packaged food. If
none of them fit (or the photo shows something else), IGNORE this section and
work out the macros yourself. Never force a poor match.

When one does fit: values are PER 100 GRAMS. Scale to the user's portion in
grams and show the math in "tip" (e.g. "USDA chicken breast, roasted: 165 cal
per 100g; 6 oz = 170g -> 280 cal"), and set "source": "nutrition_db" for that
item. "low conf" entries are a brand the user did not name — only use those
for that exact product. ${searchPolicy}

${lines}
`;
};

// Shared output schema — both scan pipelines return this shape.
const FOOD_OUTPUT_SCHEMA = `
OUTPUT FORMAT:
Return ONLY a valid JSON object (no markdown, no code fences) with this shape:
{
  "identifiedAs": "string — what you believe the food is, in plain words (e.g. 'Chicken shawarma plate with rice, garlic sauce and salad'). If unsure, your best guess and the runner-up.",
  "detectedType": "label" | "meal" | "mixed" | "text-only",
  "items": [
    {
      "name": "string — short, human-readable label",
      "calories": number,
      "protein": number,
      "carbs": number,
      "fat": number,
      "fiber": number,
      "source": "label" | "restaurant_db" | "nutrition_db" | "web_lookup" | "visual_estimate" | "text_only",
      "confidence": "high" | "medium" | "low",
      "uncertainty": "string — if uncertain, the specific food or portion question the user can resolve, e.g. 'Chicken or tofu? I couldnt tell.' Empty when there is no specific question. No percentages or judgment about food.",
      "servingSize": "string — only for nutrition labels, e.g. '1 cup (245g)'",
      "portionNote": "string — the amount these numbers assume, in plain words, e.g. '6 oz grilled chicken + 1 cup rice' or '1 bar (60 g)'. Always fill this in.",
      "servingsConsumed": number,
      "ingredients": [
        {
          "name": "string — single ingredient",
          "grams": number,
          "calories": number,
          "protein": number,
          "carbs": number,
          "fat": number,
          "fiber": number,
          "emoji": "string — one emoji that visually represents the ingredient"
        }
      ]
    }
  ],
  "tip": "string — one short sentence explaining how this estimate was produced"
}

Rules for the schema:
- "servingSize" and "servingsConsumed" appear ONLY when the item came from a nutrition label.
- "ingredients" appears ONLY for prepared meals/dishes (not for nutrition labels and not for simple single-ingredient items like "an apple").
- When you include ingredients, the item-level macros MUST equal the sum of ingredient macros (within ±5%).
- All numeric fields are numbers, not strings. No units inside numbers.
`;


// USDA / Open Food Facts lookup shared by both scan pipelines.
interface NutritionLookup {
  matches: NutritionMatch[];
  sourcesUsed: ("usda" | "openfoodfacts")[];
  sourcesSkipped: { source: string; reason: string }[];
  /** True when we actually ran the search (the text named a food). */
  queried: boolean;
}

// Tier-3 lookup: USDA + Open Food Facts, on the FOOD WORDS of the typed text
// only. Skipped when:
//  • the text is a question or filler with no food words ("what is this?")
//  • a photo is attached and the text is long (a meal narrative, not a name)
//  • the text mentions a known chain (our curated menu is more specific)
//  • the text is unusually long
const lookupNutritionForText = async (
  textDescription: string,
  hasImages: boolean,
): Promise<NutritionLookup> => {
  const textTrimmed = (textDescription || "").trim();
  const foodQuery = extractFoodQuery(textTrimmed);
  const shouldQuery =
    foodQuery.length > 0 &&
    (!hasImages || textTrimmed.length <= 60) &&
    detectRestaurantsInText(textTrimmed).length === 0 &&
    textTrimmed.length < 120;
  const empty: NutritionLookup = { matches: [], sourcesUsed: [], sourcesSkipped: [], queried: false };
  if (!shouldQuery) return empty;
  try {
    const nutrition = await searchNutrition(foodQuery, 3);
    return {
      matches: nutrition.matches || [],
      sourcesUsed: nutrition.sourcesUsed || [],
      sourcesSkipped: nutrition.sourcesSkipped || [],
      queried: true,
    };
  } catch (err) {
    // Non-fatal — proceed without nutrition context.
    console.warn("[analyzeFoodEntry] searchNutrition failed (non-fatal)", err);
    return { ...empty, queried: true };
  }
};

// ============================================================================
//  ONE-CALL SCAN (Oct 2026) — the ChatGPT-style pipeline
// ============================================================================
// Why: asking ChatGPT "what is this?" gave better answers than the app,
// because ChatGPT looks at the photo, thinks, and searches the web if it
// needs to — all in one go. The legacy scan instead searched databases and
// the web for the WORDS the user typed (often a question), then handed the
// vision model whatever came back labelled "authoritative".
//
// Now: gpt-5.6-terra on the Responses API gets the photo, the user's note,
// any curated chain data and relevance-checked database candidates, plus
// the hosted web_search tool. It identifies the food first, searches when a
// named restaurant / brand / unfamiliar dish calls for it, then returns the
// same JSON shape as before. Any failure falls back to the legacy scan.

// Curated chain data for the one-call scan. Same matching as the legacy
// formatter, shorter instructions (the model can search for anything the
// curated list doesn't cover).
const formatRestaurantReference = (
  restaurants: Restaurant[],
  userText: string,
  customMenuItems?: Record<string, MenuItem[]>,
): string => {
  if (restaurants.length === 0) return '';
  const blocks = restaurants.map(r => {
    const matchedItems = findMenuItemMatches(userText, r.menuItems);
    const lines: string[] = matchedItems.map(i => {
      const fiber = i.fiber !== undefined ? `, fiber ${i.fiber}g` : '';
      const serving = i.servingSize ? ` [${i.servingSize}]` : '';
      return `  - ${i.name}${serving}: ${i.calories} cal, P ${i.protein}g, C ${i.carbs}g, F ${i.fat}g${fiber}`;
    });
    if (r.components && r.components.length > 0) {
      lines.push('  Build-your-own components (per standard portion):');
      for (const c of r.components) {
        const notes = c.notes ? ` — ${c.notes}` : '';
        lines.push(`    • [${c.category}] ${c.name} [${c.servingSize}]: ${c.calories} cal, P ${c.protein}g, C ${c.carbs}g, F ${c.fat}g${notes}`);
      }
    }
    const src = r.nutritionSourceUrl || r.officialUrl || '';
    if (lines.length === 0) {
      return `${r.shortName}: the user's item is not in our verified list. Search ${r.shortName}'s published nutrition${src ? ` (${src})` : ''} for it.`;
    }
    return `${r.shortName}${src ? ` (official nutrition: ${src})` : ''}:\n${lines.join('\n')}`;
  }).join('\n\n');

  return `

VERIFIED MENU DATA (checked against the restaurants' published nutrition):
Use these exact numbers when the user's item IS one of the listed items, and
set "source": "restaurant_db", "confidence": "high". Do not substitute a
similar-but-different item (a flatbread is not the wrap; a large is not the
small) — search for the real item instead. For build-your-own orders, add
or subtract components for "double / extra / no / light / add" and show the
math in "tip" (e.g. "Chicken bowl 595 + extra chicken 180 = 775 cal").

${blocks}
`;
};

const SEARCH_SCAN_INSTRUCTIONS = `You are an expert nutritionist helping someone log what they ate in a fitness app. They show you a photo and/or a short note — often casual, sometimes just "what is this?". Answer the way you would if they asked you directly in a chat: work out what the food really is, then give realistic macros for the amount they ate.

1. IDENTIFY FIRST
- Study the photo before anything else: the dish and cuisine, how it was cooked (fried, grilled, sauced, breaded), every visible component, and any packaging, logo, cup, wrapper, receipt or menu that names a brand or restaurant.
- The note may be a question rather than a food name — identify from the photo either way. If the user names the food, brand or place, trust that over your visual guess.
- If two identities are plausible, go with the more likely one and mention the runner-up in "identifiedAs".

2. LOOK IT UP WHEN IT MATTERS
- You can search the web. Search when the food is from a named restaurant or chain, when it is a branded or packaged product, or when it is a dish you are not confident about. Prefer the restaurant's or brand's own nutrition page, then Nutritionix, MyFitnessPal, FatSecret or CalorieKing.
- Don't search for plain whole foods you already know well (an apple, white rice, a grilled chicken breast).
- Never claim a source you did not actually read. When you used one, name the site in "tip".

3. PORTION
- Estimate the amount from visual cues: plate size (a dinner plate is ~10-11 in), bowl, utensils or a hand for scale, cup and container sizes. For restaurant food, use the restaurant's standard serving unless the photo clearly shows more or less. A quantity the user states always wins.
- Write the amount you assumed in "portionNote".

4. MACROS
- A readable Nutrition Facts label in a photo beats everything: copy its values exactly ("source": "label", include "servingSize"; "servingsConsumed" is 1 unless the user says otherwise, and scale the macros by it).
- Otherwise use published data (from your search or the reference sections below) when it is the same item; if not, build the total from standard nutrition values for each component.
- Count what is easy to miss: cooking oil and butter, sauces, dressings, cheese, glazes, sugary drinks. Restaurant cooking is usually richer than home cooking.
- Check before answering: calories should be within ~10% of 4×protein + 4×carbs + 9×fat.

5. ITEMS
- One item per distinct food (entree, each side, each drink, each sauce cup). A single composed dish (a burrito, a bowl of pasta) is ONE item with its components in "ingredients"; skip "ingredients" for simple foods (a drink, a bar, a piece of fruit).
- "source" per item: "label" (read from a label), "restaurant_db" (from the VERIFIED MENU DATA section), "web_lookup" (from your web search), "nutrition_db" (from the database candidates), "visual_estimate" (photo + your own knowledge), "text_only" (no photo, your own knowledge).
- "confidence": "high" for a label or published data for the exact item; "medium" for a solid identification with an estimated portion; "low" when the food or portion is genuinely unclear.

Reply with ONLY the JSON object described below — no prose before or after it, no markdown.
`;

/** Build the existing food-specific prompt for the durable server job. */
export async function prepareFoodAnalysis(images: string[], description: string) {
  const text = sanitize(description, 1000);
  const lookup = await lookupNutritionForText(text, images.length > 0);
  const chains = detectRestaurantsInText(text);
  const note = `User's note: ${text || 'Identify the food from the attached photo.'}`;
  const content: unknown[] = [{ type: 'text', text: note + formatRestaurantReference(chains, text) + formatNutritionContext(lookup.matches) + '\n' + FOOD_OUTPUT_SCHEMA }];
  images.forEach(img => content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${extractBase64(img)}`, detail: 'high' } }));
  return [{ role: 'system', content: SEARCH_SCAN_INSTRUCTIONS }, { role: 'user', content }];
}

export const analyzeDailyLog = async (
  log: DailyLog,
  profile: UserProfile,
  targets: NutritionTargets,
) => {
  const prompt = `
  Analyze the following daily food log and provide feedback based on the user's profile and nutrition targets.

  User Profile:
  - Goal: ${profile.goal}
  - Current Weight: ${profile.weight ? `${profile.weight} lbs` : 'not shared'}
  - Target Calories: ${targets.calories} kcal
  - Target Protein: ${targets.protein}g
  - Target Carbs: ${targets.carbs}g
  - Target Fat: ${targets.fat}g

  Daily Log (${log.date}):
  - Calories Consumed: ${log.caloriesConsumed} kcal
  - Protein Consumed: ${log.proteinConsumed}g
  - Carbs Consumed: ${log.carbsConsumed}g
  - Fat Consumed: ${log.fatConsumed}g
  - Water Intake: ${log.waterIntake} oz
  - Activity Burned: ${log.caloriesBurned || 0} kcal
  - Food Items: ${log.foodItems?.map((i) => `${i.name} (${i.calories}kcal, P:${i.protein}g, C:${i.carbs}g, F:${i.fat}g)`).join(", ") || "None logged"}

  Provide a constructive analysis:
  1. What went well?
  2. What went wrong or could be improved?
  3. Specific recommendations for tomorrow.
  4. Progress assessment towards the goal (${profile.goal}).

  Return ONLY a valid JSON object with the following structure:
  {
    "summary": "Overall summary of the day",
    "positives": ["Point 1", "Point 2"],
    "improvements": ["Point 1", "Point 2"],
    "recommendations": ["Point 1", "Point 2"],
    "progressScore": 0-100
  }
  `;

  const response = await callGeminiProxy({
    feature: 'analyzeDailyLog',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          positives: { type: Type.ARRAY, items: { type: Type.STRING } },
          improvements: { type: Type.ARRAY, items: { type: Type.STRING } },
          recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
          progressScore: { type: Type.NUMBER },
        },
        required: ["summary", "positives", "improvements", "recommendations", "progressScore"],
      },
    },
  });

  return JSON.parse(response.text);
};

export type FuelCoachMode = 'eatout' | 'cook' | 'snacks' | 'morning';

export interface FuelIdea {
  name: string;
  /** Restaurant/brand for eat-out & packaged items, or "Homemade". */
  source: string;
  verdict: 'GO' | 'OKAY';
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** One-sentence reason this fits (or what to watch). */
  why: string;
  timeEstimate?: string;
  ingredients?: string[];
  steps?: string[];
  /** Items the user likely needs to buy for this recipe. */
  grocery?: string[];
}

export interface FuelIdeasResult {
  intro: string;
  ideas: FuelIdea[];
}

const FUEL_MODE_BRIEFS: Record<FuelCoachMode, string> = {
  eatout: `MODE: EAT OUT.
  Pick the best 4-5 options for the remaining macros, drawing FIRST from the
  CANDIDATE MENU ITEMS below (these come from a verified database — treat
  their macros as ground truth). You may add at most one well-known chain
  item that is NOT in the list if it is clearly better; append " (verify)"
  to its source if you do. Verdict GO for strong macro fits, OKAY for
  workable-but-not-optimal (say why). No recipes in this mode.`,
  cook: `MODE: COOK.
  Give exactly 3 recipes the user can make, sized so one serving fits the
  remaining macros. Each needs timeEstimate (e.g. "25 min"), ingredients
  with quantities, steps (numbered, max 8, each one short), and grocery =
  the subset of ingredients a typical kitchen wouldn't already have.
  Range the three across effort: one fast, one standard, one worth-it.`,
  snacks: `MODE: SNACKS & SWEETS.
  Give 5-6 ideas in three tiers: (a) 2-3 packaged grab-now items with REAL
  brand names and honest macros, (b) 1-2 two-minute builds (no cooking),
  (c) exactly one worth-the-effort dessert recipe with ingredients + steps,
  portioned so ONE serving fits the remaining macros. Desserts are normal
  food — never moralize. If the user asked for something specific (e.g.
  chocolate), make it happen within the budget.`,
  morning: `MODE: START MY DAY.
  The user has a full day of macros ahead. In "intro", sketch how the day
  could split across breakfast/lunch/dinner in one or two sentences. Then
  give 3 breakfast options across effort levels (grab-and-go, ~10 min cook,
  meal-preppable), each with macros. Bias protein-forward and say so in
  "why" where it matters. Include ingredients/steps only for the cooked one.`,
};

export const generateFuelIdeas = async (
  mode: FuelCoachMode,
  remaining: { calories: number; protein: number; carbs: number; fat: number },
  note: string,
  profile: UserProfile,
  candidateItems?: string[],
): Promise<FuelIdeasResult> => {
  const candidates = mode === 'eatout' && candidateItems?.length
    ? `\n  CANDIDATE MENU ITEMS (verified macros — prefer these):\n${candidateItems.map((c) => `  - ${c}`).join('\n')}\n`
    : '';

  const prompt = `
  You are Ding's in-app Fuel Coach. Suggest food that fits what's LEFT of
  the user's day. Use real numbers, be specific, never moralize food.

  User:
  - Goal: ${profile.goal}
  - Remaining today: ${remaining.calories} kcal, ${remaining.protein}g protein, ${remaining.carbs}g carbs, ${remaining.fat}g fat

  ${FUEL_MODE_BRIEFS[mode]}
  ${candidates}
  ${note ? `USER NOTE (cravings / location / what's on hand): "${sanitize(note, 300)}"` : ''}

  Every idea must fit within the remaining calories (leave a little room —
  don't land exactly on zero unless remaining is small). Protein gap is the
  priority to close. "intro" is 1-2 sentences, conversational, no fluff.
  `;

  const response = await callGeminiProxy({
    feature: 'fuelCoachIdeas',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          intro: { type: Type.STRING },
          ideas: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                source: { type: Type.STRING },
                verdict: { type: Type.STRING },
                calories: { type: Type.NUMBER },
                protein: { type: Type.NUMBER },
                carbs: { type: Type.NUMBER },
                fat: { type: Type.NUMBER },
                why: { type: Type.STRING },
                timeEstimate: { type: Type.STRING },
                ingredients: { type: Type.ARRAY, items: { type: Type.STRING } },
                steps: { type: Type.ARRAY, items: { type: Type.STRING } },
                grocery: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['name', 'source', 'verdict', 'calories', 'protein', 'carbs', 'fat', 'why'],
            },
          },
        },
        required: ['intro', 'ideas'],
      },
    },
  });

  const parsed = JSON.parse(response.text) as FuelIdeasResult;
  // Normalize verdicts defensively — the model occasionally freestyles.
  parsed.ideas = (parsed.ideas || []).map((i) => ({
    ...i,
    verdict: i.verdict === 'GO' ? 'GO' : 'OKAY',
  }));
  return parsed;
};
