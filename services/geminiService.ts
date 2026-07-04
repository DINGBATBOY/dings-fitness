/**
 * Gemini service — client side.
 *
 * All AI calls go through the Cloud Function `callGemini` (functions/src/index.ts),
 * which holds the API key server-side and enforces per-user daily quotas.
 *
 * The shape of inputs and outputs is unchanged from the previous direct-to-Gemini
 * implementation, so MainApp.tsx and other callers don't need to change.
 */

import { Type, FunctionDeclaration } from "@google/genai";
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import { ChatResponse, DailyLog, UserProfile, NutritionTargets } from "../types";
import { getMinSafeCalories } from "../constants";
import { detectRestaurantsInText, findMenuItemMatches, getEffectiveMenuItems, type Restaurant, type MenuItem } from "../data/restaurants";

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
  /** Optional — server enforces an allowlist. Defaults to gemini-2.5-flash. */
  model?: string;
  contents: unknown;
  config?: unknown;
  /**
   * Optional feature label so per-call token usage can be attributed to a
   * specific AI feature (food analysis vs coach vs onboarding) in the admin
   * dashboard. Free-form, max 64 chars, sanitized server-side.
   */
  feature?: string;
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
// TOOL DEFINITIONS (sent server-side as part of `config.tools`)
// ===========================================================================
const saveInsightTool: FunctionDeclaration = {
  name: "saveInsight",
  description: "Save a key piece of advice, a rule, or a motivation quote to the users notes.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING, description: "Short title for the note" },
      content: { type: Type.STRING, description: "The insight or advice to save" },
    },
    required: ["title", "content"],
  },
};

const addToWorkoutTool: FunctionDeclaration = {
  name: "addExerciseToSplit",
  description: "Add a specific exercise to a specific day of the workout split.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      day: { type: Type.STRING, description: "The day of the week (e.g., Monday)" },
      exerciseName: { type: Type.STRING },
      sets: { type: Type.NUMBER },
      reps: { type: Type.STRING },
    },
    required: ["day", "exerciseName", "sets", "reps"],
  },
};

const updateUserMetricTool: FunctionDeclaration = {
  name: "updateUserMetric",
  description: "Update the users physical metrics (current weight or body fat percentage) when they report a change.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      metric: {
        type: Type.STRING,
        enum: ["weight", "bodyFat"],
        description: "The metric to update.",
      },
      value: {
        type: Type.NUMBER,
        description: "The new value (e.g., 195 for 195lbs).",
      },
    },
    required: ["metric", "value"],
  },
};

// ===========================================================================
// PUBLIC API — same names + shapes as before
// ===========================================================================

export const sendChatMessage = async (
  history: { role: string; text: string }[],
  profile: any,
  newMessage: string,
): Promise<ChatResponse> => {
  const safeMessage = sanitize(newMessage);

  const systemInstruction = `You are Dings, an expert fitness coach.

  User Profile:
  Name: ${profile.name}
  Age: ${profile.age}
  Weight: ${profile.weight} lbs
  Height: ${profile.height} inches
  PBF: ${profile.bodyFat || "N/A"}%
  Goal: ${profile.goal}
  Activity: ${profile.activityLevel}

  CAPABILITIES:
  1. SAVE NOTES: If the user says "remember this", use 'saveInsight'.
  2. UPDATE WORKOUT: If the user wants to add an exercise, use 'addExerciseToSplit'.
  3. UPDATE METRICS: If the user tells you their new weight or body fat (e.g., "I weighed in at 190 today", "I lost 5 lbs"), USE the 'updateUserMetric' tool immediately.

  When the user reports a weight change:
  1. Call the tool.
  2. Congratulate them or offer encouragement based on their goal (${profile.goal}).
  3. Mention that you are adjusting their Path/Protocol to match this new data.
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
    config: {
      systemInstruction,
      tools: [{ functionDeclarations: [saveInsightTool, addToWorkoutTool, updateUserMetricTool] }],
    },
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

export const generateMealSuggestion = async (
  remainingMacros: { calories: number; protein: number; carbs: number; fat: number },
  time: string,
  vibe: string,
) => {
  const prompt = `Create a single specific meal recipe for these macros: ${remainingMacros.calories}kcal, ${remainingMacros.protein}g protein. Time: ${sanitize(time, 100)}. Vibe: ${sanitize(vibe, 200)}.`;

  const response = await callGeminiProxy({
    feature: 'generateMealSuggestion',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          calories: { type: Type.NUMBER },
          protein: { type: Type.NUMBER },
          carbs: { type: Type.NUMBER },
          fat: { type: Type.NUMBER },
          timeEstimate: { type: Type.STRING },
          ingredients: { type: Type.ARRAY, items: { type: Type.STRING } },
          instructions: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: [
          "name",
          "calories",
          "protein",
          "carbs",
          "fat",
          "timeEstimate",
          "ingredients",
          "instructions",
        ],
      },
    },
  });

  return JSON.parse(response.text);
};

export const generateSmartSplit = async (
  goal: string,
  busyDays: string[],
  highEnergyDays: string[],
  profile: {
    age: number;
    weight: number;
    activityLevel: string;
    workoutPreferences?: {
      experience?: 'beginner' | 'intermediate' | 'advanced';
      daysPerWeek?: 3 | 4 | 5 | 6;
      sessionMinutes?: 30 | 45 | 60 | 90;
      equipment?: 'full-gym' | 'home-weights' | 'bodyweight';
    };
    // New — flagged during onboarding, fed into the prompt so the AI
    // avoids or substitutes exercises that stress these joints.
    injuries?: string[];
    // Free-form "why now" — not mathematically used, but included so the
    // AI can tune the tone of exercise labels/notes when relevant.
    motivation?: string;
  },
) => {
  // Defaults for legacy profiles that pre-date these onboarding questions.
  const prefs = profile.workoutPreferences || {};
  const experience = prefs.experience || 'intermediate';
  const daysPerWeek = prefs.daysPerWeek || 4;
  const sessionMinutes = prefs.sessionMinutes || 60;
  const equipment = prefs.equipment || 'full-gym';
  // Injuries: 'None' selection is treated as no restrictions. Everything
  // else lands in a substitution guide block.
  const activeInjuries = (profile.injuries || []).filter(i => i && i.toLowerCase() !== 'none');
  const injuryGuide = activeInjuries.length ? `
INJURY / LIMITATION SUBSTITUTIONS — NON-NEGOTIABLE:
The user has flagged: ${activeInjuries.join(', ')}.
Apply these substitutions across the entire week:
${activeInjuries.map(i => {
  const key = i.toLowerCase();
  if (key.includes('knee'))    return "  • Knees: avoid deep barbell back squat, jump squats, box jumps, lunges with heavy load. Substitute leg press (limited depth), goblet squat to box, hip thrust, step-ups, sled work.";
  if (key.includes('shoulder')) return "  • Shoulders: avoid overhead barbell press, upright rows, behind-the-neck movements, dips. Substitute landmine press, incline dumbbell press, cable lateral raise, chest-supported row.";
  if (key.includes('back'))     return "  • Back (lumbar): avoid loaded deadlift from floor, barbell row, jump exercises, weighted good mornings. Substitute trap bar deadlift from blocks, chest-supported row, hip thrust, back extensions with control.";
  if (key.includes('wrist'))    return "  • Wrists: avoid barbell curls, straight-bar pressing that forces wrist extension, push-ups on flat palms. Substitute dumbbell/hammer curls, football-bar press, push-ups on parallettes.";
  if (key.includes('ankle'))    return "  • Ankles: avoid deep squats to full depth, plyometrics, sprinting. Substitute leg press with heel elevation, sled push, cycling for conditioning.";
  if (key.includes('elbow'))    return "  • Elbows: avoid heavy barbell curls, close-grip bench press, dips, skullcrushers. Substitute hammer curls, incline dumbbell press, cable pushdowns with EZ-bar.";
  if (key.includes('hip'))      return "  • Hips: avoid deep squats, weighted lunges, sumo deadlift. Substitute leg press, single-leg press, cable pull-through, hip thrust from bench.";
  return `  • ${i}: substitute any movement that directly loads this joint. Prefer machine or supported variants.`;
}).join('\n')}
Under no circumstance should the split include a movement from the AVOID list above.` : '';
  // Motivation is passed through only as an optional tone hint. Nothing
  // in the workout math depends on it.
  const motivationLine = profile.motivation
    ? `- Motivation: "${profile.motivation}" (tune exercise notes to reference this only if it feels natural — not required.)`
    : '';

  // Derive prescription from preferences. These rules are what make the
  // generated split actually personalized — beginners get compound-focused
  // simple sessions, advanced get higher volume with isolations, etc.
  const experienceGuide: Record<typeof experience, string> = {
    beginner:
      "BEGINNER: Stick to fundamental compound movements (squat variants, hinge variants, push, pull). " +
      "3 sets × 8-12 reps. AVOID complex movements (Olympic lifts, advanced isolations). Focus on form & consistency.",
    intermediate:
      "INTERMEDIATE: Mix compounds and isolations. Use rep ranges 6-15 (heavy compounds 6-8, accessories 10-15). " +
      "3-4 sets per exercise. Include progressive overload cues.",
    advanced:
      "ADVANCED: Higher volume — 4-5 sets per exercise. Include advanced techniques (drop sets, rest-pause, tempo work) " +
      "where appropriate. More isolation work and specialization lifts allowed.",
  };

  // Exercises per session scales with session length.
  const exerciseCount: Record<number, string> = {
    30: "4-5 exercises (compound-focused, time-efficient)",
    45: "5-6 exercises",
    60: "6-7 exercises",
    90: "7-9 exercises (room for thorough warm-up + accessory work)",
  };

  // Equipment determines the exercise pool.
  const equipmentGuide: Record<typeof equipment, string> = {
    'full-gym':
      "User has FULL GYM access: barbells, dumbbells, machines, cables, racks all available. " +
      "Use whatever fits the goal best.",
    'home-weights':
      "User has HOME with SOME WEIGHTS: dumbbells, bands, possibly a bench. " +
      "NO barbells, NO machines, NO cables. Substitute accordingly (e.g. goblet squat instead of back squat).",
    'bodyweight':
      "User has BODYWEIGHT ONLY: no equipment. Build the split entirely from " +
      "bodyweight exercises (push-ups, pull-ups if a bar exists, dips, lunges, planks, etc.). " +
      "Use unilateral and tempo variations for progression.",
  };

  // Pairing template by daysPerWeek — proven splits used across the lifting
  // literature. Gemini gets the template as a STRONG suggestion (not a rigid
  // rule) so it shapes a coherent week rather than improvising six different
  // "upper body" days.
  const pairingTemplate: Record<number, string> = {
    3: "Full-body 3x: each session hits squat-pattern, hinge-pattern, push, pull, and a core/conditioning finisher. 48hrs rest between sessions ideal.",
    4: "Upper/Lower 4x: Upper A (horizontal push + vertical pull focus) / Lower A (squat focus) / Upper B (vertical push + horizontal pull focus) / Lower B (hinge focus).",
    5: "Push/Pull/Legs/Upper/Lower OR Bro split: Mon=Chest, Tue=Back, Wed=Legs, Thu=Shoulders+arms, Fri=Posterior chain. Pick whichever fits the user's goal — PPL for general, bro for hypertrophy bias.",
    6: "Push/Pull/Legs 2x: PPL Mon-Wed (heavy), PPL Thu-Sat (volume), Sunday rest. Lower volume per session but each muscle hits twice weekly.",
  };

  // Rest periods by intensity, in seconds — for the rest_seconds hint we ask
  // Gemini to set per exercise.
  const restPeriodGuide = `
Rest periods (mandatory hint per exercise):
  • Heavy compound (squat, deadlift, bench, OHP) — 120-180s
  • Moderate compound (rows, presses, pulldowns) — 90-120s
  • Isolation (curls, lateral raises, leg curls) — 60-90s
  • Cardio/conditioning intervals — 30-60s or as prescribed`;

  const periodizationGuide = `
Periodization — week 1 of a 4-week mesocycle:
  • Volume: at the lower end of the prescription range (e.g. 3 sets, not 5)
  • Intensity: leave 2-3 reps in reserve (RIR) per working set
  • This baseline lets the user progress weight/reps over weeks 2-4 before deloading on week 5.
  • Mention RIR in the exercise notes field so users see it.`;

  const exerciseVarietyRules = `
Exercise variety rules — non-negotiable:
  1. Do NOT repeat the exact same exercise within the same training week.
     (Variation is fine: "Barbell Back Squat" Monday and "Front Squat" Friday is OK; same exercise twice is not.)
  2. Each training day must include AT LEAST ONE compound (multi-joint) movement.
  3. Avoid more than 3 isolation exercises per session — if you find yourself
     prescribing 4+, drop one and add a compound.
  4. For 5- or 6-day splits, vary the rep ranges across the week:
     some days low-rep heavy (4-6), some moderate (8-12), some high (12-20).
  5. ALWAYS include at least one posterior-chain exercise per week
     (hinge, row, face-pull, reverse-fly, RDL, hip thrust, etc.) — this is
     the most common gap in self-generated programs.`;

  const prompt = `Generate a 7-day workout split (Monday-Sunday) tailored to this user.

GOAL: ${sanitize(goal, 200)}

USER CONTEXT:
- Age: ${profile.age}, Weight: ${profile.weight} lbs, Daily activity: ${profile.activityLevel}
- Training experience: ${experience}
- Available training days per week: ${daysPerWeek}
- Typical session length: ${sessionMinutes} minutes
- Equipment access: ${equipment}
- High-energy days (plan hardest sessions here): ${highEnergyDays.join(", ") || "Not specified"}
- Busy days (plan rest or short sessions here): ${busyDays.join(", ") || "Not specified"}
${motivationLine}
${injuryGuide}

EXPERIENCE PRESCRIPTION:
${experienceGuide[experience]}

VOLUME PER SESSION (${sessionMinutes} min):
Aim for ${exerciseCount[sessionMinutes]} per workout day.

EQUIPMENT CONSTRAINTS:
${equipmentGuide[equipment]}

PAIRING TEMPLATE — start here, then adapt to the user's goal:
${pairingTemplate[daysPerWeek]}

${exerciseVarietyRules}

${restPeriodGuide}

${periodizationGuide}

REQUIREMENTS:
1. Schedule exactly ${daysPerWeek} TRAINING days and ${7 - daysPerWeek} REST days across the week.
2. Put training days on high-energy days when possible; rest/light on busy days.
3. Monday MUST be day 1 of the array.
4. Use specific exercise names (e.g. "Goblet Squat" not just "Legs").
5. Match exercises to the equipment constraint above — do NOT prescribe equipment the user doesn't have.
6. For each training day, set "intensity" to one of: "Light", "Moderate", "High".
   Pair intensity with the user's high-energy days (High goes on those days).
7. For each training day, set "label" descriptively — name the focus AND the
   pattern: e.g. "Upper Push · Heavy Bench", "Lower · Squat Focus", "Pull Day
   · Vertical & Horizontal". Don't write generic "Upper Day".
8. For rest days, set "exercises" to an empty array [] and "label" to "Rest"
   (or "Active Recovery: walk / mobility" if user is Very/Extra active).
9. For each exercise, provide both a gymAlternative AND a homeAlternative
   so users can adapt if their equipment situation changes.
10. End each session with a SHORT compound finisher when there's time
    (carry, sled, jump rope, plank, hill sprint) for goals other than pure
    hypertrophy bulking.
11. ${goal?.toLowerCase().includes('bulk') ? 'BULK: bias toward 8-12 rep hypertrophy range, longer rest, more isolation work in the back half of the week.' : goal?.toLowerCase().includes('weight loss') || goal?.toLowerCase().includes('lean') ? 'CUT/LEAN: keep working sets to 3-4, add short conditioning finishers to 4 of the training days, avoid grinding singles.' : goal?.toLowerCase().includes('recomp') ? 'RECOMP: heavy compound work early week (4-6 reps), volume isolations late week, one conditioning day.' : goal?.toLowerCase().includes('performance') ? 'PERFORMANCE: prioritize power output (3-5 reps on main lifts) and movement quality. Include sport-specific carry-over.' : 'GENERAL: balanced mix of strength, hypertrophy, and conditioning across the week.'}
`;

  const response = await callGeminiProxy({
    feature: 'generateSmartSplit',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            day: { type: Type.STRING },
            label: { type: Type.STRING },
            intensity: { type: Type.STRING },
            exercises: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  sets: { type: Type.NUMBER },
                  reps: { type: Type.STRING },
                  gymAlternative: { type: Type.STRING },
                  homeAlternative: { type: Type.STRING },
                },
                required: ["name", "sets", "reps", "gymAlternative", "homeAlternative"],
              },
            },
          },
          required: ["day", "label", "intensity", "exercises"],
        },
      },
    },
  });

  return JSON.parse(response.text);
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

export type FoodImageType = "auto" | "label" | "meal";

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
  source?: "label" | "restaurant_db" | "nutrition_db" | "visual_estimate" | "text_only";
  confidence?: "high" | "medium" | "low";
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
}

// Strip a leading data: URL prefix when present.
const extractBase64 = (img: string): string =>
  img.includes(",") ? img.split(",")[1] : img;

// Defensive numeric coercion — AI can occasionally return strings like "150"
// or even "~150 kcal". Pull out the first number; null if none.
const toNumber = (v: unknown): number => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const m = v.match(/-?\d+(?:\.\d+)?/);
    if (m) return parseFloat(m[0]);
  }
  return 0;
};
const toNumberOpt = (v: unknown): number | undefined => {
  if (v === undefined || v === null || v === "") return undefined;
  const n = toNumber(v);
  return Number.isFinite(n) ? n : undefined;
};

// Format a matched restaurant's menu (and components, if defined) as an
// authoritative reference block. Injected into the AI prompt when the user
// mentions a known chain, so the model uses verified macros instead of
// guessing or web-searching.
//
// KEY DESIGN: we pre-filter the menu by keyword overlap against the user's
// text. The AI ONLY sees items that match the user's query. If nothing
// matches, the AI is given the restaurant name and explicitly told to web
// search the specific item — preventing the "substitute a similar item"
// bug (e.g. wrap macros returned for a flatbread query).
const formatRestaurantContext = (
  restaurants: Restaurant[],
  userText: string,
  customMenuItems?: Record<string, MenuItem[]>,
): string => {
  if (restaurants.length === 0) return '';

  const blocks = restaurants.map(r => {
    // Match user text against this restaurant's menu items, INCLUDING
    // user-added custom items. This means once a user has logged a new
    // item (e.g., Mango Magic Smoothie) and we auto-added it, future AI
    // requests will see it as authoritative without needing to web-search.
    const effectiveItems = getEffectiveMenuItems(r, customMenuItems);
    const matchedItems: MenuItem[] = findMenuItemMatches(userText, effectiveItems);

    const formatItem = (i: MenuItem): string => {
      const fiber = i.fiber !== undefined ? `, fiber: ${i.fiber}g` : '';
      const serving = i.servingSize ? ` [${i.servingSize}]` : '';
      return `  - ${i.name}${serving}: ${i.calories} cal, protein: ${i.protein}g, carbs: ${i.carbs}g, fat: ${i.fat}g${fiber}`;
    };

    // CASE 1: no menu item matches the user's query.
    if (matchedItems.length === 0 && (!r.components || r.components.length === 0)) {
      return `${r.shortName}: User mentioned this restaurant, but their specific item is NOT in our verified menu list. USE THE GOOGLE SEARCH TOOL to find the official nutrition data for the specific item from ${r.shortName}'s nutrition guide (${r.nutritionSourceUrl || r.officialUrl || ''}). Do NOT guess. Set "source": "restaurant_db" if you find authoritative data; "visual_estimate" otherwise. Confidence: "medium". Note in the tip that you searched for the specific item.`;
    }

    const menuLines = matchedItems.map(formatItem).join('\n');

    // Component breakdown for build-your-own concepts (Chipotle, Sweetgreen,
    // etc.). Grouped by category so the model can pick "1 base + 1 protein +
    // toppings + sauce + extras" cleanly when composing custom orders.
    let componentSection = '';
    if (r.components && r.components.length > 0) {
      const byCategory: Record<string, typeof r.components> = {};
      for (const c of r.components) {
        (byCategory[c.category] ||= [] as any).push(c);
      }
      const categoryOrder = ['base', 'protein', 'topping', 'sauce', 'extras'];
      const lines: string[] = [];
      for (const cat of categoryOrder) {
        const items = byCategory[cat];
        if (!items || items.length === 0) continue;
        lines.push(`  [${cat.toUpperCase()}S]`);
        for (const c of items) {
          const fiber = c.fiber !== undefined ? `, fiber: ${c.fiber}g` : '';
          const notes = c.notes ? ` — ${c.notes}` : '';
          lines.push(`    • ${c.name} [${c.servingSize}]: ${c.calories} cal, protein: ${c.protein}g, carbs: ${c.carbs}g, fat: ${c.fat}g${fiber}${notes}`);
        }
      }
      componentSection = `\n\n  Per-portion ingredient components (use these for custom builds and modifiers):\n${lines.join('\n')}`;
    }

    // CASE 2: we have matched items and/or components — give them to the AI.
    // Be explicit that this list was PRE-FILTERED to match the user's query,
    // so a missing item means we don't have data for it (search instead).
    const header = matchedItems.length > 0
      ? `${r.shortName} (verified items matching the user's query):`
      : `${r.shortName} (verified ingredient components):`;
    const fallbackNote = matchedItems.length === 0
      ? `  (NO complete menu item matched the user's query. If you can compose the user's item from the components below, do so and SHOW THE MATH in the tip. If you cannot, USE GOOGLE SEARCH for the official ${r.shortName} nutrition.)`
      : '';

    return `${header}\n${menuLines}${fallbackNote}${componentSection}`;
  }).join('\n\n');

  return `

AUTHORITATIVE RESTAURANT DATA — USE THESE VALUES INSTEAD OF SEARCHING THE WEB:
The user mentioned one or more restaurants we have verified data for. Use these
exact macros as the source of truth ONLY when the user's described item
matches an item on the listed menu. If the user ordered multiple items from
the list, return one item per line. If they ordered a quantity (e.g. "6
tenders"), multiply per-unit macros by the quantity and SHOW THE MATH in the
tip. Set "source": "restaurant_db" and "confidence": "high" for any item drawn
from this list.

CRITICAL — DO NOT SUBSTITUTE SIMILAR-BUT-DIFFERENT ITEMS:
If the user describes an item that is NOT exactly in the listed menu (e.g.
they ordered a "flatbread" but only "wrap" is in our list, or they ordered a
"large" but only the "small" is listed), do NOT silently substitute the
listed item's macros. Instead:
  • USE THE GOOGLE SEARCH TOOL to find the actual item's nutrition data from
    the restaurant's official source.
  • Set "source": "restaurant_db" if the search returned authoritative data
    from the chain's site; otherwise "visual_estimate".
  • Set "confidence": "medium" — note in the tip that the specific item
    wasn't in our verified list and you searched for it instead.
  • In the tip, name BOTH what the user ordered AND what was different from
    our listed item, so they know we used a fallback.
Example: user says "Chicken Bacon Ranch Flatbread from Tropical Smoothie";
list has "Chicken Bacon Ranch Wrap." → DO NOT use the wrap's macros. Search
for the flatbread, return its actual values, tip: "Searched for the
flatbread directly — our verified list only had the wrap."

MODIFIER HANDLING — read carefully when components are listed above:
For build-your-own concepts (Chipotle bowls, Sweetgreen salads, Subway subs,
Qdoba, Moe's, Cava, Jersey Mike's), the user often customizes the order. When
the user uses phrases like the ones below, adjust macros AGAINST THE COMPONENTS
listed for that restaurant — do NOT just return the pre-built menu item:

  • "double X" or "extra X"           → add ONE more standard portion of X
  • "triple X"                        → add TWO more standard portions of X
  • "no X" or "without X"             → subtract one standard portion of X from
                                         the base item (e.g. "no rice" off a
                                         chicken bowl removes 1 scoop of white
                                         rice's macros)
  • "light X" or "easy X"             → subtract HALF a standard portion of X
  • "X on the side" or "extra X on the side"
                                       → ADD a full portion (the user still
                                         eats it; only logging "instead of" or
                                         "skip" removes it)
  • "add X" or "with X" (when X is in components)
                                       → ADD one standard portion of X
  • Specific quantities like "8 oz chicken" or "2 scoops rice"
                                       → use the listed component's per-portion
                                         macros and scale linearly by the
                                         oz/portion ratio
  • Build-from-scratch ("just chicken and lettuce")
                                       → sum the listed components, no base item

CRITICAL: Always show the math in "tip" so the user can verify, e.g.:
"Chipotle Chicken Burrito Bowl + extra chicken = 595 + 180 = 775 cal,
49g + 32g = 81g protein."

For items NOT in the listed components (e.g. a sauce we don't have data for),
mark "confidence" as "medium" and note the assumption in tip.

${blocks}
`;
};

// Detect non-chain restaurant intent in the user's text. Patterns covered:
//   - Apostrophe-S names:           "Joe's pizza", "Ted Peters' salmon"
//   - Possessive without apostrophe: "Mama lasagna", "Marios pizza"
//   - Location phrases:              "at Frenchy's", "from Versailles Cafe"
//   - Capitalized multi-word names FOLLOWED by a food noun:
//                                    "Ted Peters salmon dinner",
//                                    "Café Versailles palomilla"
//
// Conservative on purpose — false positives are cheap (we just ask Gemini to
// search), false negatives are the bug we're fixing (defaulting to USDA
// generics when the user named a specific place).
export const detectIndieRestaurantIntent = (text: string): boolean => {
  if (!text || text.length < 3) return false;
  const t = text.trim();

  // 1. Possessive: "Joe's", "Ted Peters'", "Mama's"
  if (/\b[A-Z][a-zA-Z]+(\s+[A-Z][a-zA-Z]+)?'s?\b/.test(t)) return true;

  // 2. Location phrases: "at X", "from X", "ordered from X", "@ X"
  //    where X starts with a capital letter (a proper noun).
  if (/\b(?:at|from|@)\s+[A-Z][a-zA-Z]+/.test(t)) return true;

  // 3. Two-or-more capitalized words at the start, followed by a food noun.
  //    Catches "Ted Peters salmon dinner", "Café Versailles palomilla" etc.
  //    Excludes the obvious chains we already handle via detectRestaurantsInText.
  const foodNouns = /\b(?:salmon|chicken|steak|burger|pizza|sandwich|burrito|bowl|salad|pasta|dinner|plate|combo|wrap|taco|sub|hoagie|hero|fish|shrimp|wings|ribs|rice|noodle|soup|stew|chili|breakfast|brunch|lunch|special|platter|entree|tenders|nuggets|dish|meal)\b/i;
  if (
    /^[A-Z][a-zA-Z]+\s+[A-Z][a-zA-Z]+(\s+[A-Z][a-zA-Z]+)?/.test(t) &&
    foodNouns.test(t)
  ) {
    return true;
  }

  return false;
};

// Format Open Food Facts / USDA matches as authoritative reference data.
// Injected when no restaurant chain is detected — gives the AI verified
// macros for whole foods and branded packaged products before it falls back
// to estimation.
//
// `softenSearchBlock`: when true, the instruction allowing the AI to prefer
// Google Search for restaurant-specific items overrides USDA for those items.
// Set when indie restaurant intent is detected upstream.
const formatNutritionContext = (matches: NutritionMatch[], softenSearchBlock = false): string => {
  if (matches.length === 0) return '';
  const lines = matches.map(m => {
    const brand = m.brand ? ` (${m.brand})` : '';
    const fiber = m.fiberPer100g !== undefined ? `, fiber: ${m.fiberPer100g}g` : '';
    const sourceLabel = m.source === 'usda' ? 'USDA' : 'Open Food Facts';
    return `  - [${sourceLabel}, ${m.confidence} conf] ${m.name}${brand}: ${m.caloriesPer100g} cal, protein: ${m.proteinPer100g}g, carbs: ${m.carbsPer100g}g, fat: ${m.fatPer100g}g${fiber} (per 100g${m.servingSize ? `, serving: ${m.servingSize}` : ''})`;
  }).join('\n');

  const searchPolicy = softenSearchBlock
    ? `For RESTAURANT-NAMED items in the user's query, prefer Google Search
results (per the Independent Restaurant block above) — USDA generics are
wrong for a named restaurant's preparation. For generic ingredients or
sides not tied to the restaurant ("french fries", "ketchup"), use USDA.`
    : `Do NOT use Google Search for foods covered here.`;

  return `

AUTHORITATIVE NUTRITION DATABASE MATCHES — USE THESE VALUES:
We queried USDA FoodData Central and Open Food Facts for the user's text.
Below are the top matches. Values are PER 100 GRAMS unless a different
serving size is specified. If the user query includes a quantity (e.g. "6 oz
chicken breast", "1 cup oatmeal", "2 slices bread"), scale these per-100g
values to the user's portion in grams and SHOW THE MATH in the tip — e.g.
"USDA chicken breast (raw) is 165 cal per 100g; 6 oz = 170g → 280 cal."
Prefer USDA entries over Open Food Facts when both are present (higher data
quality). ${searchPolicy}

MANDATORY SOURCE LABELING: For ANY item whose macros came from this
nutrition database section (whether directly or scaled), you MUST set
"source": "nutrition_db" in the JSON output. Do NOT use "text_only" or
"visual_estimate" for these items — that's incorrect attribution. Set
"confidence" to the listed confidence level (high/medium/low).

${lines}
`;
};

// Build the prompt based on the imageType hint.
// `nutritionMatches` are injected when the caller has already queried
// USDA/OFF via the searchNutrition Cloud Function.
const buildFoodAnalysisPrompt = (
  imageType: FoodImageType,
  hasImages: boolean,
  textDescription: string,
  nutritionMatches: NutritionMatch[] = [],
  customMenuItems?: Record<string, MenuItem[]>,
): string => {
  const userContext = `Context from user: "${sanitize(textDescription, 1000)}"`;

  // If the user's text mentions a known chain, inject its verified menu data
  // as authoritative context. Menu items are pre-filtered by keyword overlap
  // against the user's text so the AI only sees items relevant to the query
  // (prevents the "wrap returned for flatbread" substitution bug). Includes
  // user-added custom items so the AI honors them on future requests.
  const matched = detectRestaurantsInText(textDescription);
  const restaurantContext = formatRestaurantContext(matched, textDescription, customMenuItems);

  // Detect INDEPENDENT restaurant intent for queries that don't match a known
  // chain. Examples: "Ted Peters salmon dinner", "Joe's pizza", "Mama's
  // lasagna", "at Frenchy's", "from Versailles Cafe". When the user names a
  // specific place, generic USDA matches ("salmon" = 175 cal) are wrong — we
  // need Google Search to find that restaurant's actual preparation.
  const hasIndieRestaurantIntent =
    matched.length === 0 && detectIndieRestaurantIntent(textDescription);

  // If we have USDA/OFF matches, inject those too. When indie restaurant
  // intent is present we soften the "don't use search" instruction so Gemini
  // can prefer restaurant-specific data over USDA generics.
  const nutritionContext = formatNutritionContext(nutritionMatches, hasIndieRestaurantIntent);

  const indieRestaurantHint = hasIndieRestaurantIntent ? `

INDEPENDENT RESTAURANT DETECTED in the user's text — they named a specific
non-chain restaurant (apostrophe-S name, "at [Place]", "from [Place]", or
similar). For ANY items associated with that restaurant:
1. USE the Google Search tool FIRST to find the restaurant's nutrition data,
   menu photos, recipes, or reviews that describe portion sizes.
2. Even if USDA matches were injected below, prefer search-derived numbers
   for the restaurant-specific item — USDA's generic "salmon" or "potato
   salad" is wrong for a named restaurant's preparation.
3. Set "source": "restaurant_db" and "confidence": "medium" when search finds
   the restaurant's data. Set "low" if you can only find similar dishes
   from comparable restaurants.
4. In "tip", state the restaurant + which search source you used.
` : '';

  // Shared output schema description — same shape regardless of mode.
  const outputSchema = `
OUTPUT FORMAT:
Return ONLY a valid JSON object (no markdown, no code fences) with this shape:
{
  "detectedType": "label" | "meal" | "mixed" | "text-only",
  "items": [
    {
      "name": "string — short, human-readable label",
      "calories": number,
      "protein": number,
      "carbs": number,
      "fat": number,
      "fiber": number,
      "source": "label" | "restaurant_db" | "nutrition_db" | "visual_estimate" | "text_only",
      "confidence": "high" | "medium" | "low",
      "servingSize": "string — only for nutrition labels, e.g. '1 cup (245g)'",
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

  const labelInstructions = `
NUTRITION LABEL MODE — STRICT EXTRACTION:
- Treat each provided image as a nutrition label / Nutrition Facts panel.
- READ AND EXTRACT the printed values exactly as shown. DO NOT estimate or interpolate.
- If a value (e.g. fiber) is not printed, OMIT that field rather than guessing.
- Identify the "Serving size" line from the label and put it in "servingSize".
- Assume "servingsConsumed" is 1 unless the user's text says otherwise (e.g. "ate the whole bag = 3 servings" → servingsConsumed: 3).
- If the user says they ate multiple servings, scale calories/macros by servingsConsumed.
- Set "source": "label" and "confidence": "high" when the label is clearly readable; "medium" if partially obscured; "low" if mostly unreadable.
- DO NOT include an "ingredients" array for nutrition labels.
`;

  const mealInstructions = `
MEAL PHOTO MODE — INGREDIENT-LEVEL BREAKDOWN:
- Treat each provided image as a prepared meal or dish (not a nutrition label).
- Identify the dish and break it into the individual ingredients you can see.
- For EACH ingredient, estimate portion size in grams based on visual cues (plate size, spoon/fork for scale, typical serving conventions).
- Compute per-ingredient calories, protein, carbs, fat, and fiber from standard food databases (USDA values).
- The item-level totals MUST equal the sum of ingredient values.
- Suggest one short emoji per ingredient for visual reference (e.g. rice → "🍚", chicken → "🍗").
- If the user mentions a SPECIFIC RESTAURANT or BRAND (e.g. "Chipotle", "Starbucks", "Sweetgreen", "Huey Magoo's"), USE the Google Search tool to find that restaurant's published nutritional data for the specific menu item first, BEFORE estimating visually. Set "source": "restaurant_db" when you do.
- For homemade or generic dishes, set "source": "visual_estimate".
- "confidence": "high" only for restaurant-database matches; "medium" for clear visual estimates; "low" for obscured or ambiguous dishes.

QUANTITY HANDLING — CRITICAL FOR ACCURACY:
When the user specifies a quantity (e.g. "6 tenders", "2 slices", "1.5 cups"), follow this exact procedure:
1. Find the published macros for ONE UNIT of the item on the source (one tender, one slice, one cup).
2. If the source only lists multi-unit serving sizes (e.g. "2 tenders = 24g protein"), DIVIDE FIRST to get per-unit values (12g protein per tender), THEN multiply by the user's quantity.
3. NEVER assume that a multi-unit serving size value applies per single unit.
4. State the math explicitly in "tip" — e.g. "Huey Magoo's lists 12g protein per grilled tender; 6 tenders × 12g = 72g protein."

SANITY CHECK (run before returning):
- Total protein in an item should not exceed (item weight in grams) × 0.35. If it does, you likely made a unit error — recheck.
- Total fat should not exceed (item weight in grams) × 0.95.
- Total carbs should not exceed (item weight in grams) × 0.95.
- Total calories should be within ~10% of (4 × protein + 4 × carbs + 9 × fat).
- If any check fails, drop "confidence" to "medium" or "low" and note the uncertainty in "tip".

When you cite a source from web search, include the source URL or restaurant name in "tip" so the user can verify.
`;

  const autoInstructions = `
AUTO MODE — DETECT PER IMAGE:
- For EACH provided image, FIRST decide: is it (a) a nutrition label / Nutrition Facts panel, or (b) a prepared meal/dish photo?
- If a label, follow NUTRITION LABEL MODE rules below for that item.
- If a meal photo, follow MEAL PHOTO MODE rules below for that item.
- If multiple images mix labels and meals, "detectedType": "mixed" and treat each appropriately.
- If there are no images and only a text description, "detectedType": "text-only" and estimate from the description alone (set "source": "text_only").
${labelInstructions}
${mealInstructions}
`;

  let modeBlock: string;
  switch (imageType) {
    case "label":
      modeBlock = labelInstructions;
      break;
    case "meal":
      modeBlock = mealInstructions;
      break;
    case "auto":
    default:
      modeBlock = autoInstructions;
      break;
  }

  return `Analyze the provided ${hasImages ? "image(s) and " : ""}text description to identify food items and estimate nutrition.

${userContext}
${restaurantContext}
${indieRestaurantHint}
${nutritionContext}
${modeBlock}

${outputSchema}
`;
};

// Normalize one ingredient from the AI response.
const normalizeIngredient = (raw: any): FoodIngredient => ({
  name: typeof raw?.name === "string" ? raw.name : "Unknown ingredient",
  grams: toNumber(raw?.grams),
  calories: toNumber(raw?.calories),
  protein: toNumber(raw?.protein),
  carbs: toNumber(raw?.carbs),
  fat: toNumber(raw?.fat),
  fiber: toNumberOpt(raw?.fiber),
  emoji: typeof raw?.emoji === "string" ? raw.emoji : undefined,
});

// Normalize one item from the AI response. Trims invalid sources/confidence
// values and coerces all numerics defensively.
const normalizeItem = (raw: any): FoodAnalysisItem => {
  const ingredients = Array.isArray(raw?.ingredients)
    ? raw.ingredients.map(normalizeIngredient).filter((i: FoodIngredient) => i.name)
    : undefined;

  const validSources = ["label", "restaurant_db", "nutrition_db", "visual_estimate", "text_only"];
  const validConfidence = ["high", "medium", "low"];

  return {
    name: typeof raw?.name === "string" && raw.name.trim() ? raw.name : "Unknown Item",
    calories: toNumber(raw?.calories),
    protein: toNumber(raw?.protein),
    carbs: toNumber(raw?.carbs),
    fat: toNumber(raw?.fat),
    fiber: toNumberOpt(raw?.fiber),
    ingredients: ingredients && ingredients.length > 0 ? ingredients : undefined,
    servingSize: typeof raw?.servingSize === "string" ? raw.servingSize : undefined,
    servingsConsumed: toNumberOpt(raw?.servingsConsumed),
    source: validSources.includes(raw?.source) ? raw.source : undefined,
    confidence: validConfidence.includes(raw?.confidence) ? raw.confidence : undefined,
  };
};

export const analyzeFoodEntry = async (
  images: string[],
  textDescription: string,
  imageType: FoodImageType = "auto",
  customMenuItems?: Record<string, MenuItem[]>,
): Promise<FoodAnalysisResult> => {
  const parts: any[] = [];
  const hasImages = Array.isArray(images) && images.length > 0;

  // Tier-3 lookup: USDA + Open Food Facts. Skip when:
  //  • the user attached a photo (Gemini handles vision regardless)
  //  • the text mentions a known restaurant (our DB is more specific)
  //  • the query is empty or unusually long (likely a complex meal narrative,
  //    not a single food lookup — let Gemini handle it)
  let nutritionMatches: NutritionMatch[] = [];
  let nutritionSourcesUsed: ("usda" | "openfoodfacts")[] = [];
  let nutritionSourcesSkipped: { source: string; reason: string }[] = [];
  const textTrimmed = (textDescription || "").trim();
  const restaurantMatched = detectRestaurantsInText(textTrimmed);
  const shouldQueryNutritionDb =
    !hasImages &&
    restaurantMatched.length === 0 &&
    textTrimmed.length > 0 &&
    textTrimmed.length < 120;

  if (shouldQueryNutritionDb) {
    try {
      const nutrition = await searchNutrition(textTrimmed, 3);
      nutritionMatches = nutrition.matches || [];
      nutritionSourcesUsed = nutrition.sourcesUsed || [];
      nutritionSourcesSkipped = nutrition.sourcesSkipped || [];
    } catch (err) {
      // Non-fatal — proceed without nutrition context.
      console.warn("[analyzeFoodEntry] searchNutrition failed (non-fatal)", err);
    }
  }

  parts.push({ text: buildFoodAnalysisPrompt(imageType, hasImages, textDescription, nutritionMatches, customMenuItems) });

  if (hasImages) {
    images.forEach((img) => {
      parts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: extractBase64(img),
        },
      });
    });
  }

  // Keep googleSearch enabled for restaurant lookup. We continue to parse
  // plain text JSON (cleanText) because responseSchema cannot be combined
  // with the search tool in the current API.
  const response = await callGeminiProxy({
    feature: 'analyzeFoodEntry',
    contents: { parts },
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  const cleanText = (text: string) => text.replace(/```json\n?|\n?```/g, "").trim();

  try {
    if (!response.text) throw new Error("No text returned from AI");
    const parsed = JSON.parse(cleanText(response.text));

    let items: FoodAnalysisItem[] = Array.isArray(parsed?.items)
      ? parsed.items.map(normalizeItem).filter((i: FoodAnalysisItem) => i.name)
      : [];

    // CLIENT-SIDE SOURCE OVERRIDE.
    // Gemini sometimes ignores our prompt instruction and labels items as
    // "text_only" even when we injected USDA/OFF matches. We know
    // authoritatively whether we queried the nutrition DB (nutritionMatches
    // has length > 0), so we re-attribute any item that came through with a
    // weak source label. We never override "restaurant_db" (that's our DB)
    // or "label" (that's an image OCR match).
    if (nutritionMatches.length > 0) {
      items = items.map(item => {
        if (!item.source || item.source === "text_only" || item.source === "visual_estimate") {
          // Inherit the best confidence from the injected matches.
          const bestConf = nutritionMatches.reduce<("high" | "medium" | "low")>(
            (best, m) => {
              const rank = { high: 3, medium: 2, low: 1 } as const;
              return rank[m.confidence] > rank[best] ? m.confidence : best;
            },
            "low",
          );
          return { ...item, source: "nutrition_db", confidence: item.confidence ?? bestConf };
        }
        return item;
      });
    }

    const validTypes = ["label", "meal", "mixed", "text-only"];
    const detectedType = validTypes.includes(parsed?.detectedType)
      ? parsed.detectedType
      : undefined;

    return {
      items,
      tip: typeof parsed?.tip === "string" ? parsed.tip : "",
      detectedType,
      nutritionSourcesUsed,
      nutritionMatchCount: nutritionMatches.length,
      nutritionSourcesSkipped,
    };
  } catch (e) {
    console.error("Failed to parse AI food-analysis response", e);
    return { items: [], tip: "Could not analyze food. Please try again." };
  }
};

export const parseInsightAction = async (text: string) => {
  const prompt = `Extract type (FOOD/EXERCISE/NONE) from: "${sanitize(text, 500)}"`;

  const response = await callGeminiProxy({
    feature: 'parseInsightAction',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING, enum: ["FOOD", "EXERCISE", "NONE"] },
          foodData: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              calories: { type: Type.NUMBER },
              protein: { type: Type.NUMBER },
              carbs: { type: Type.NUMBER },
              fat: { type: Type.NUMBER },
            },
            nullable: true,
          },
          exerciseData: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              sets: { type: Type.NUMBER },
              reps: { type: Type.STRING },
            },
            nullable: true,
          },
        },
        required: ["type"],
      },
    },
  });

  return JSON.parse(response.text);
};

export const analyzeDailyLog = async (
  log: DailyLog,
  profile: UserProfile,
  targets: NutritionTargets,
) => {
  const prompt = `
  Analyze the following daily food log and provide feedback based on the user's profile and nutrition targets.

  User Profile:
  - Goal: ${profile.goal}
  - Current Weight: ${profile.weight} lbs
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

export const generateOnboardingMacros = async (userAnswers: any) => {
  // Timeline is optional. When present, we compute a rate-based deficit
  // instead of the flat lookup. Same math the local fallback uses.
  const hasTimeline = !!(userAnswers.goalTargetWeight && userAnswers.goalTargetDate);
  const timelineBlock = hasTimeline
    ? `
- Target weight: ${userAnswers.goalTargetWeight} lbs
- Target date: ${userAnswers.goalTargetDate} (today is ${new Date().toISOString().slice(0, 10)})`
    : '';

  const rateInstruction = hasTimeline ? `
RATE-BASED DEFICIT (use this INSTEAD of the flat lookup below when timeline is present):
1. Compute days_to_target = target_date − today, in whole days.
2. Compute lb_delta = current_weight − target_weight (positive = losing, negative = gaining).
3. Compute raw_daily_delta = (lb_delta × 3500) / days_to_target.  (1 lb of fat ≈ 3500 kcal.)
4. Clamp to safe rate:
   • Max loss:    1% of current bodyweight per week = (weight × 0.01 × 3500) / 7 kcal/day.
   • Max surplus: 0.5 lb/week clean bulk = 250 kcal/day.
5. dailyCalories = TDEE − clamped_daily_delta.
6. If the timeline forces a rate above the safety cap, still use the CAPPED rate and mention in the coachMessage that their timeline is aggressive and will be extended if they stick with the safe pace.

If timeline is NOT present, fall back to the flat goal-based deficits below.` : '';

  const prompt = `Calculate a personalized macro plan for this athlete:
- Name: ${sanitize(userAnswers.name, 100)}
- Age: ${userAnswers.age}
- Sex: ${userAnswers.sex}
- Height: ${userAnswers.height}
- Weight: ${userAnswers.weight} lbs
- Body Fat: ${userAnswers.bodyFat || "unknown"}%
- Goal: ${userAnswers.goal}
- Activity Level: ${userAnswers.activityLevel}${timelineBlock}

For BMR calculation:
- If body fat % is provided AND between 5% and 60%, USE THE KATCH-MCARDLE EQUATION:
  LBM_kg = (weight_lbs × (1 − bodyFat/100)) / 2.20462
  BMR = 370 + (21.6 × LBM_kg)
  Katch-McArdle is lean-mass-based and produces more accurate, non-discouraging targets for users with high body fat or athletic builds. PREFER IT when BF% is available.
- Otherwise (BF% unknown or out of range), use the Mifflin-St Jeor equation adjusted for their sex.

Apply an appropriate activity multiplier (Sedentary 1.2, Light 1.375, Moderate 1.55, Very 1.725, Extra 1.9) to get TDEE.
${rateInstruction}

Flat goal-based deficits (fallback when no timeline):
- Weight Loss: 500 calorie deficit
- Lean/Athletic or Recomposition: at maintenance or slight deficit (-200)
- Muscle Building: 300 calorie surplus
- Performance: at maintenance

Set protein at 0.8-1g per lb of bodyweight (higher end for muscle building and recomp). Fill remaining calories with carbs (45-55%) and fat (25-35%).

IMPORTANT SAFETY FLOORS — never recommend less than:
- 1,500 kcal/day for Male users
- 1,200 kcal/day for Female users
If the math would produce something lower, set it at the floor and explain why in the coach message.

Also write a SHORT 1-sentence message (max 20 words) explaining WHY these are their numbers in a motivating coach voice. If the user set a timeline, briefly acknowledge the pace (e.g. "on pace for your June goal" or "gently paced for your window"). Keep it tight.`;

  const systemInstruction = `You are an expert sports nutritionist and fitness coach. A user has completed their assessment. Calculate their personalized nutrition protocol and provide it in the exact JSON format requested. Be precise with numbers. Show your reasoning briefly.`;

  const response = await callGeminiProxy({
    feature: 'generateOnboardingMacros',
    contents: prompt,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          dailyCalories: { type: Type.NUMBER },
          protein: { type: Type.NUMBER },
          carbs: { type: Type.NUMBER },
          fat: { type: Type.NUMBER },
          tdee: { type: Type.NUMBER },
          deficit: { type: Type.NUMBER },
          coachMessage: { type: Type.STRING },
          protocolName: { type: Type.STRING },
        },
        required: [
          "dailyCalories",
          "protein",
          "carbs",
          "fat",
          "tdee",
          "deficit",
          "coachMessage",
          "protocolName",
        ],
      },
    },
  });

  const parsed = JSON.parse(response.text || "{}");

  // SAFETY FLOOR (defense in depth): we already tell the model not to go below
  // the floor in the prompt, but never trust an LLM for safety-critical limits.
  // We re-clamp on the client AND in the goal-math, so the floor holds even if
  // the model hallucinates or the schema lets a low number through.
  const tdee = typeof parsed.tdee === "number" ? parsed.tdee : undefined;
  const minSafe = getMinSafeCalories(userAnswers.sex, tdee);
  if (typeof parsed.dailyCalories !== "number" || parsed.dailyCalories < minSafe) {
    const original = parsed.dailyCalories;
    parsed.dailyCalories = minSafe;
    parsed.floorApplied = true;
    parsed.originalCalories = original;
    // Recompute carbs/fat if the AI returned them based on an unsafe target.
    if (typeof parsed.protein === "number") {
      const remaining = minSafe - parsed.protein * 4;
      if (remaining > 0) {
        parsed.carbs = Math.max(0, Math.round((remaining * 0.55) / 4));
        parsed.fat = Math.max(0, Math.round((remaining * 0.45) / 9));
      }
    }
  }

  return parsed;
};

export const generateVisionRoadmap = async (profile: any) => {
  const prompt = `Based on User Data: Weight: ${profile.weight}lbs, Height: ${profile.height}, Goal: ${profile.goal}.

  Calculate SPECIFIC DAILY TARGETS based on this CURRENT WEIGHT:
  1. Exact Daily Calories.
  2. Exact Daily Protein.
  3. Exact Calorie Deficit amount needed.

  IMPORTANT SAFETY FLOORS — never recommend less than:
  - 1,500 kcal/day for Male users
  - 1,200 kcal/day for Female users
  If the math would produce something lower, set it at the floor.

  Create 3 distinct steps/milestones to get from ${profile.weight}lbs to their goal.
  For each step, provide a list of 3 concrete "actionItems" (short, checkbox-style tasks).`;

  const response = await callGeminiProxy({
    feature: 'generateVisionRoadmap',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          visionStatement: { type: Type.STRING },
          nutritionTargets: {
            type: Type.OBJECT,
            properties: {
              dailyCalories: { type: Type.NUMBER },
              dailyProtein: { type: Type.NUMBER },
              dailyDeficit: { type: Type.NUMBER },
              strategySummary: { type: Type.STRING },
            },
            required: ["dailyCalories", "dailyProtein", "dailyDeficit", "strategySummary"],
          },
          steps: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                milestone: { type: Type.STRING },
                actionItems: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ["title", "description", "milestone", "actionItems"],
            },
          },
        },
        required: ["visionStatement", "nutritionTargets", "steps"],
      },
    },
  });

  const parsed = JSON.parse(response.text);

  // SAFETY FLOOR (defense in depth): clamp dailyCalories to the per-sex floor
  // even if the model ignores the prompt. We don't have TDEE here, so we use
  // only the absolute floor.
  const minSafe = getMinSafeCalories(profile.sex);
  if (
    parsed?.nutritionTargets &&
    typeof parsed.nutritionTargets.dailyCalories === "number" &&
    parsed.nutritionTargets.dailyCalories < minSafe
  ) {
    parsed.nutritionTargets.dailyCalories = minSafe;
  }

  return parsed;
};
