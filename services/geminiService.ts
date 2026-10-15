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

// ===========================================================================
// OpenAI path — food macro analysis only
//
// The food scan runs on OpenAI (accuracy); every other AI feature stays on
// Gemini via callGeminiProxy. Two separate Cloud Functions, two separate
// providers, one shared quota.
//
// TWO-PASS DESIGN. OpenAI cannot combine web search with vision + strict
// JSON in a single call. So when the user names a restaurant we don't have
// in the local menu database:
//   pass 1  gpt-5-search-api looks the dish up on the web (text only)
//   pass 2  gpt-5.6-terra reads the photo and returns strict JSON, with
//           pass 1's findings injected as context
// Ordinary scans (no named restaurant) skip pass 1 entirely and cost one call.
// ===========================================================================

type OpenAIProxyRequest = {
  model?: string;
  messages: unknown[];
  responseFormat?: unknown;
  webSearch?: boolean;
  temperature?: number;
  feature?: string;
  /** "responses" = vision + reasoning + hosted web_search in one call. */
  api?: "chat" | "responses";
  reasoningEffort?: "low" | "medium" | "high";
};

type OpenAIProxyResponse = {
  text: string;
  /** Responses API only: pages the model cited. */
  sources?: { url: string; title?: string }[];
  /** Responses API only: how many web searches the model ran. */
  webSearchCalls?: number;
};

/** Error from callOpenAIProxy, keeping the Functions error code. */
class AIProxyError extends Error {
  constructor(message: string, public code?: string, public upstream?: string) {
    super(message);
  }
}

async function callOpenAIProxy(req: OpenAIProxyRequest): Promise<OpenAIProxyResponse> {
  if (!functions) {
    throw new Error("Firebase not configured. AI features unavailable.");
  }
  // Reasoning + web search can run past the SDK's 70 s default.
  const fn = httpsCallable<OpenAIProxyRequest, OpenAIProxyResponse>(functions, "callOpenAI", { timeout: 170_000 });
  try {
    const res = await fn(req);
    return res.data;
  } catch (err: any) {
    const code = err?.code as string | undefined;
    const message = err?.message as string | undefined;
    const upstream = typeof err?.details?.upstream === "string" ? err.details.upstream : undefined;
    if (code === "functions/unauthenticated") {
      throw new AIProxyError("Please sign in again to use AI features.", code);
    }
    if (code === "functions/resource-exhausted") {
      throw new AIProxyError(message || "Daily AI limit reached. Try again tomorrow.", code);
    }
    throw new AIProxyError(message || "AI service unavailable. Please try again.", code, upstream);
  }
}

/**
 * Pass 1 — live web lookup. Runs server-side in the `foodWebLookup` Cloud
 * Function (gpt-5-search-api), which also owns the prompts and a shared
 * cache, so a dish one user already looked up comes back instantly and free.
 *   'restaurant' — a named place's dish (tokenUsage feature foodRestaurantLookup)
 *   'food'       — a food USDA + Open Food Facts could not match (foodWebLookup)
 * Returns a short plain-text digest to inject into the vision call, or ''
 * when nothing useful comes back. Never throws: a failed lookup degrades to
 * an ordinary estimate rather than breaking the scan, but failures are
 * logged loudly because they otherwise look identical to "nothing found".
 */
async function lookupFoodOnWeb(query: string, kind: 'restaurant' | 'food'): Promise<string> {
  if (!functions) return '';
  const q = sanitize(query, 300);
  try {
    const fn = httpsCallable<{ query: string; kind: string }, { text: string; found: boolean; cached: boolean }>(
      functions,
      "foodWebLookup",
    );
    const { data } = await fn({ query: q, kind });
    if (!data?.found || !data.text) {
      console.info(`[lookupFoodOnWeb:${kind}] search ran, no usable data${data?.cached ? ' (cached)' : ''} for`, q);
      return '';
    }
    if (data.cached) console.info(`[lookupFoodOnWeb:${kind}] cache hit for`, q);
    return data.text.slice(0, 1500);
  } catch (err) {
    console.error(`[lookupFoodOnWeb:${kind}] FAILED — falling back to estimate`, err);
    return '';
  }
}

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
  /** Live snapshot of the user's food, burn and trends (services/coachContext.ts). */
  appContext = '',
): Promise<ChatResponse> => {
  const safeMessage = sanitize(newMessage);

  const systemInstruction = `You are Dings, the nutrition coach inside Ding!, a food-tracking app.
  Help with food, eating habits, macros, meal ideas, restaurants, calories burned and weight trends.
  Ding! logs workouts only as calories burned and doesn't build training plans: if asked about
  training, answer briefly and generally and bring it back to food.

  You can see the user's live data below. Use it: refer to what they actually ate, what's left
  today, their week, steps and burn. Do the arithmetic from these numbers rather than guessing,
  and never invent foods or numbers that aren't there. If something isn't in the data, say so.

  ${appContext ? `USER DATA (live from the app):\n${sanitize(appContext, 8000)}` : ''}

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
  2. UPDATE METRICS: If the user tells you their new weight or body fat (e.g., "I weighed in at 190 today", "I lost 5 lbs"), USE the 'updateUserMetric' tool immediately.

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
      tools: [{ functionDeclarations: [saveInsightTool, updateUserMetricTool] }],
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

/** Parse a JSON object out of model text that may carry fences or stray prose. */
const parseModelJson = (text: string): any => {
  const cleaned = (text || "").replace(/```(?:json)?\n?|\n?```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("No JSON object in model output");
  }
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
    // User-saved/AI-derived numbers must never enter a VERIFIED reference block.
    const effectiveItems = r.menuItems;
    const matchedItems: MenuItem[] = findMenuItemMatches(userText, effectiveItems);

    const formatItem = (i: MenuItem): string => {
      const fiber = i.fiber !== undefined ? `, fiber: ${i.fiber}g` : '';
      const serving = i.servingSize ? ` [${i.servingSize}]` : '';
      return `  - ${i.name}${serving}: ${i.calories} cal, protein: ${i.protein}g, carbs: ${i.carbs}g, fat: ${i.fat}g${fiber}`;
    };

    // CASE 1: no menu item matches the user's query.
    if (matchedItems.length === 0 && (!r.components || r.components.length === 0)) {
      return `${r.shortName}: User mentioned this restaurant, but their specific item is NOT in our verified menu list. If a WEB LOOKUP RESULTS section appears below, it was fetched from ${r.shortName}'s published nutrition data (${r.nutritionSourceUrl || r.officialUrl || ''}) — use it and set "source": "restaurant_db". If there is no such section, estimate from the dish's visible/described composition and typical chain portion sizes, set "source": "visual_estimate", and say in the tip that this item wasn't in our verified list.  Confidence: "medium" either way.`;
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
      ? `  (NO complete menu item matched the user's query. If you can compose the user's item from the components below, do so and SHOW THE MATH in the tip. If you cannot, use the WEB LOOKUP RESULTS section below when one is present; otherwise estimate and mark "confidence": "medium".)`
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
  • Check the WEB LOOKUP RESULTS section below, if one is present — it holds
    data fetched from the restaurant's published source for this order.
  • Set "source": "restaurant_db" if that section covers the actual item;
    otherwise estimate the real item and set "visual_estimate".
  • Set "confidence": "medium" — note in the tip that the specific item
    wasn't in our verified list.
  • In the tip, name BOTH what the user ordered AND what was different from
    our listed item, so they know we used a fallback.
Example: user says "Chicken Bacon Ranch Flatbread from Tropical Smoothie";
list has "Chicken Bacon Ranch Wrap." → DO NOT use the wrap's macros. Return
the flatbread's own values, tip: "Estimated the flatbread directly — our
verified list only had the wrap."

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

  // 0. Venue words: "Cheddars Scratch Kitchen", "joe's bar and grill",
  //    "versailles cafe". This is what catches a restaurant typed as a bare
  //    name with no "from"/"at" and no capital letters — the common case on a
  //    phone. "my kitchen" / "home kitchen" style phrases are stripped first
  //    so cooking at home doesn't look like a venue.
  const venueText = t.replace(/\b(?:my|our|the|a|home)\s+(?:kitchen|grill|oven|kitchen's)\b/gi, ' ');
  if (/\b(?:scratch\s+kitchen|kitchen|grill|grille|cafe|café|caf|diner|bistro|tavern|pub|steakhouse|roadhouse|smokehouse|pizzeria|taqueria|trattoria|cantina|brewery|brewhouse|bakery|deli|delicatessen|creamery|eatery|restaurant|bar\s*(?:&|and)\s*grill|house\s+of|buffet|grillhouse)\b/i.test(venueText)) {
    return true;
  }

  // 1. Possessive place names: "Joe's", "Ted Peters'", "cheddar's"
  //    (case-insensitive — people don't capitalize on a phone). Everyday
  //    contractions like "it's" or "that's" don't count.
  // Requires an actual possessive: "joe's" or "peters'" — not "didn't".
  const possMatch = t.match(/\b([a-zA-Z]{2,})(?:'s\b|s'(?!\w))/);
  if (possMatch) {
    const contraction = /^(it|that|there|here|what|who|he|she|let|one|today|tonight|yesterday|everyone|someone|somebody|nobody|everybody|wife|husband|friend|mom|mum|mother|dad|father|grandma|grandpa|sister|brother|kid|kids)$/i;
    if (!contraction.test(possMatch[1])) return true;
  }

  // 2. Location phrases: "at X", "from X", "ordered from X", "@ X".
  //    Case-insensitive, because people type "bowl from ted peters" on a
  //    phone keyboard. Phrases that name a situation rather than a place
  //    ("at home", "from scratch", "from leftovers") are excluded.
  const locMatch = t.match(/(?:^|\s)(?:at|from|@)\s+(?:the\s+)?([a-z0-9][\w'&.-]*)(.*)$/i);
  if (locMatch) {
    const [, word, rest] = locMatch;
    const notAPlace = /^(home|work|school|scratch|leftovers?|last|my|our|a|an|this|that|night|noon|lunch|dinner|breakfast|brunch|about|around|least|most|once|all|first)$/i;
    // "at 5", "at 7pm", "at 12:30" are times; "at 5 guys" is a place.
    const isTime = /^\d{1,2}(:\d{2})?(am|pm)?$/i.test(word) && !/^\s*[a-z]/i.test(rest.replace(/^\s*(am|pm)\b/i, ''));
    if (!notAPlace.test(word) && !isTime) return true;
  }

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

const FOOD_LABEL_RULES = `
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
  // specific place, generic USDA matches ("salmon" = 175 cal) are wrong — this
  // is the condition that triggers the pass-1 web lookup in analyzeFoodEntry.
  const hasIndieRestaurantIntent =
    matched.length === 0 && detectIndieRestaurantIntent(textDescription);

  // If we have USDA/OFF matches, inject those too. When indie restaurant
  // intent is present we soften the USDA-is-authoritative instruction so the
  // model prefers restaurant-specific lookup data over USDA generics.
  const nutritionContext = formatNutritionContext(nutritionMatches, hasIndieRestaurantIntent);

  const indieRestaurantHint = hasIndieRestaurantIntent ? `

INDEPENDENT RESTAURANT DETECTED in the user's text — they named a specific
non-chain restaurant (apostrophe-S name, "at [Place]", "from [Place]", or
similar). We ran a live web lookup for this order. For ANY items associated
with that restaurant:
1. If a WEB LOOKUP RESULTS section appears below, treat it as the primary
   source for those items — it holds what the search actually found.
2. Even if USDA matches were injected below, prefer the lookup's numbers for
   the restaurant-specific item — USDA's generic "salmon" or "potato salad"
   is wrong for a named restaurant's preparation.
3. Set "source": "restaurant_db" and "confidence": "medium" when the lookup
   covers the item. If NO lookup section is present, the search found
   nothing: estimate from the dish's visible/described composition and
   typical restaurant portions, set "source": "visual_estimate" and
   "confidence": "low", and say so plainly in "tip".
4. In "tip", state the restaurant and where the numbers came from.
` : '';

  const outputSchema = FOOD_OUTPUT_SCHEMA;
  const labelInstructions = FOOD_LABEL_RULES;

  const mealInstructions = `
MEAL PHOTO MODE — ONE ITEM PER DISTINCT FOOD, THEN INGREDIENTS INSIDE:

STEP 1 — DECIDE: SINGLE DISH or MULTI-ITEM ORDER?
Look at the image and ask: how many distinct foods am I looking at?

SINGLE DISH — one plate, bowl, or serving of ONE dish (a bowl of pasta, a
burrito, a stir-fry, a pizza slice, a burger). Return exactly ONE item in
the "items" array. Populate its "ingredients" with the components you can
see (noodles, sauce, meat, cheese, etc.).

MULTI-ITEM ORDER — a tray, combo, meal box, take-out bag, or cafeteria
plate holding several DISTINCT foods (grilled nuggets + fries + a drink;
sandwich + chips + soda; entree + side + side; a burrito + bag of chips
+ salsa on the side; ramen + gyoza + drink). Return ONE ITEM PER DISTINCT
FOOD in the "items" array. That means a Chick-fil-A tray with 30 grilled
nuggets, waffle fries, a Coke Zero, a milkshake, and a BBQ sauce should
return FIVE items — not one "Chick-fil-A meal" with the five things
listed as ingredients.

Common markers of a MULTI-ITEM ORDER:
  • Two or more separate containers, cups, wrappers, or bags visible
  • A drink or dip/sauce packet visible alongside a main food
  • A protein + one or more sides (fries, chips, coleslaw, rice, salad)
  • A "combo" or "meal deal" mentioned in the user's text

If in doubt, PREFER splitting into multiple items over one bundled item.
Users can always drill into an item to see ingredient-level breakdown.

STEP 2 — FOR EACH ITEM you return:
- Give a specific human-readable name (e.g. "30 Grilled Nuggets", "Waffle
  Fries (large)", "Coke Zero (20 oz)", "Cookies & Cream Milkshake",
  "Chick-fil-A Sauce"). Include quantity/size in the name when visible.
- Estimate portion in grams from visual cues (plate size, cup size,
  wrapper size, typical serving conventions).
- Compute calories, protein, carbs, fat, fiber from USDA / brand data.
- Populate "ingredients" ONLY when the item itself decomposes cleanly
  into components (e.g. a bowl of chicken burrito → rice, beans, chicken,
  salsa). SKIP "ingredients" for simple single-food items like
  "30 Grilled Nuggets", "Coke Zero", "BBQ Sauce" — the item itself IS
  the food.
- The item-level totals MUST equal the sum of ingredient values (when
  ingredients are populated), or match the underlying food data directly
  (when not).
- Suggest one short emoji per ingredient for visual reference (e.g.
  rice → "🍚", chicken → "🍗").

- If the user mentions a SPECIFIC RESTAURANT or BRAND (e.g. "Chipotle",
  "Chick-fil-A", "Starbucks", "Sweetgreen", "Huey Magoo's"), use the
  authoritative restaurant data and/or WEB LOOKUP RESULTS sections above
  for EACH menu item first, BEFORE estimating visually. Set
  "source": "restaurant_db" on each item you sourced that way.
- You have NO live web access in this step. Every external source you are
  allowed to cite has already been gathered and placed in the sections
  above. Never claim to have looked something up, and never invent a URL.
- For homemade or generic items, set "source": "visual_estimate".
- "confidence": "high" only for restaurant-database matches; "medium"
  for clear visual estimates; "low" for obscured or ambiguous items.

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

When you cite a source from the provided data sections, include the source URL or restaurant name in "tip" so the user can verify.
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

  const validSources = ["label", "restaurant_db", "nutrition_db", "web_lookup", "visual_estimate", "text_only"];
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
    portionNote: typeof raw?.portionNote === "string" && raw.portionNote.trim()
      ? raw.portionNote.trim().slice(0, 140)
      : undefined,
    source: validSources.includes(raw?.source) ? raw.source : undefined,
    confidence: validConfidence.includes(raw?.confidence) ? raw.confidence : undefined,
    uncertainty: typeof raw?.uncertainty === 'string' ? raw.uncertainty.slice(0, 240) : undefined,
  };
};

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

// LEGACY two-pass scan (Sept 2026): optional gpt-5-search-api lookup on the
// typed text, then a Chat Completions vision call. Kept as the automatic
// fallback when the one-call Responses scan fails.
const analyzeFoodEntryLegacy = async (
  images: string[],
  textDescription: string,
  imageType: FoodImageType,
  customMenuItems: Record<string, MenuItem[]> | undefined,
  lookup: NutritionLookup,
): Promise<FoodAnalysisResult> => {
  const parts: any[] = [];
  const hasImages = Array.isArray(images) && images.length > 0;

  const nutritionMatches = lookup.matches;
  const nutritionSourcesUsed = lookup.sourcesUsed;
  const nutritionSourcesSkipped = lookup.sourcesSkipped;
  const shouldQueryNutritionDb = lookup.queried;
  const textTrimmed = (textDescription || "").trim();
  const restaurantMatched = detectRestaurantsInText(textTrimmed);

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

  // ---- PASS 1 (conditional): live web lookup ----
  // The vision model in pass 2 has no web access, so anything it should be
  // able to cite has to be fetched here first. Two cases qualify:
  //
  //   (a) the user named a place — a curated chain ("Chipotle bowl") or any
  //       other restaurant ("salmon dinner from ted peters"). Always looked
  //       up; curated menu data still wins for items it covers exactly.
  //   (b) see (c) below — USDA / Open Food Facts missed.
  //
  // Packaged food that USDA/OFF already grounds skips it. A failed or empty
  // lookup degrades silently to an ordinary estimate.
  const namedIndieRestaurant =
    restaurantMatched.length === 0 && detectIndieRestaurantIntent(textDescription);

  // (c) USDA / Open Food Facts were queried and came back empty (or with
  //     only low-confidence guesses) — search the web for the food itself
  //     before falling back to an AI estimate.
  const nutritionDbMissed =
    shouldQueryNutritionDb &&
    (nutritionMatches.length === 0 || nutritionMatches.every(m => m.confidence === 'low'));

  // Any meal tied to a named place — chain or independent — gets a live web
  // lookup, even when our curated menu DB has the item. The curated data
  // still wins where it covers the exact item (it's verified); the lookup
  // fills everything else and catches menu changes.
  const namedPlace = restaurantMatched.length > 0 || namedIndieRestaurant;

  let webLookup = '';
  let webLookupKind: 'restaurant' | 'food' | null = null;
  if (namedPlace && textDescription.trim()) {
    webLookupKind = 'restaurant';
    webLookup = await lookupFoodOnWeb(textDescription, 'restaurant');
  } else if (nutritionDbMissed) {
    webLookupKind = 'food';
    webLookup = await lookupFoodOnWeb(textDescription, 'food');
  }

  // ---- PASS 2: vision + strict JSON ----
  // Convert the accumulated parts into OpenAI message content. Images become
  // data URLs; text stays text.
  const content: any[] = [];
  parts.forEach((part: any) => {
    if (part?.inlineData?.data) {
      content.push({
        type: 'image_url',
        image_url: { url: `data:${part.inlineData.mimeType || 'image/jpeg'};base64,${part.inlineData.data}` },
      });
    } else if (typeof part?.text === 'string') {
      content.push({ type: 'text', text: part.text });
    }
  });

  if (hasImages && nutritionMatches.length > 0) {
    content.push({
      type: 'text',
      text: `

A photo is attached. Identify the food from the PHOTO first. A readable
nutrition label in the photo beats the database candidates. Use a candidate
only if it is the same food the photo shows; estimate everything else on
the plate separately.`,
    });
  }

  if (webLookup && webLookupKind === 'food') {
    content.push({
      type: 'text',
      text: `

WEB LOOKUP RESULTS. USDA and Open Food Facts had no match for this food, so
we searched the web for its published nutrition facts. Treat these as more
authoritative than an estimate or than any low-confidence database matches
above, scale them to the amount the user described, and set
"source": "web_lookup" with "confidence": "medium" for the items they cover.
Say in "tip" which site the numbers came from.

${webLookup}`,
    });
  } else if (webLookup) {
    content.push({
      type: 'text',
      text: `

WEB LOOKUP RESULTS for the place the user named. These came from a live
search of the restaurant's published information. If VERIFIED MENU data
above covers the exact item ordered, keep using it (it is checked against the
official source). For everything else, treat these results as more
authoritative than USDA generics or a visual estimate, and set
"source": "restaurant_db" with "confidence": "medium" for those items. Say in
"tip" that the numbers came from the restaurant's published data.

${webLookup}`,
    });
  }

  const response = await callOpenAIProxy({
    feature: 'analyzeFoodEntry',
    messages: [{ role: 'user', content }],
    // json_object (not json_schema): the prompt already specifies the exact
    // shape, items are normalized defensively below, and a strict schema here
    // would force every optional field to be present or null for no benefit.
    responseFormat: { type: 'json_object' },
  });

  const cleanText = (text: string) => text.replace(/```json\n?|\n?```/g, "").trim();

  try {
    if (!response.text) throw new Error("No text returned from AI");
    const parsed = JSON.parse(cleanText(response.text));

    let items: FoodAnalysisItem[] = Array.isArray(parsed?.items)
      ? parsed.items.map(normalizeItem).filter((i: FoodAnalysisItem) => i.name)
      : [];

    // (Oct 2026) The old client-side override that relabelled every item as
    // "nutrition_db" whenever the database returned anything is gone: it
    // stamped database credibility on answers the model had rightly worked
    // out itself because the candidates didn't fit. The model's label stands.

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
      identifiedAs: typeof parsed?.identifiedAs === "string" ? parsed.identifiedAs.trim().slice(0, 200) : undefined,
      pipeline: "legacy",
    };
  } catch (e) {
    console.error("Failed to parse AI food-analysis response", e);
    return { items: [], tip: "Could not analyze food. Please try again.", pipeline: "legacy" };
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

const analyzeFoodEntryWithSearch = async (
  images: string[],
  textDescription: string,
  customMenuItems: Record<string, MenuItem[]> | undefined,
  lookup: NutritionLookup,
): Promise<FoodAnalysisResult> => {
  const hasImages = Array.isArray(images) && images.length > 0;
  const text = sanitize(textDescription || '', 1000);
  const chains = detectRestaurantsInText(text);
  const namedPlace = chains.length === 0 && detectIndieRestaurantIntent(text);

  const noteLine = text
    ? `The user's note: "${text}"`
    : `The user didn't add a note${hasImages ? ' — identify the food from the photo.' : '.'}`;
  const placeHint = namedPlace
    ? `\n\nThe note seems to name a specific restaurant or place. Search for that place's menu and nutrition for this item before estimating.`
    : '';

  const userText =
    `${noteLine}${hasImages ? `\n${images.length} photo${images.length > 1 ? 's' : ''} attached.` : ''}` +
    placeHint +
    formatRestaurantReference(chains, text, customMenuItems) +
    formatNutritionContext(lookup.matches) +
    `\n${FOOD_OUTPUT_SCHEMA}`;

  const content: any[] = [{ type: 'text', text: userText }];
  if (hasImages) {
    images.forEach(img => {
      content.push({
        type: 'image_url',
        image_url: { url: `data:image/jpeg;base64,${extractBase64(img)}`, detail: 'high' },
      });
    });
  }

  const response = await callOpenAIProxy({
    feature: 'analyzeFoodEntry',
    api: 'responses',
    webSearch: true,
    reasoningEffort: 'medium',
    messages: [
      { role: 'system', content: SEARCH_SCAN_INSTRUCTIONS },
      { role: 'user', content },
    ],
  });

  if (!response?.text) throw new Error('Empty response from the one-call scan');
  const parsed = parseModelJson(response.text);
  if (!Array.isArray(parsed?.items)) throw new Error('One-call scan returned no items array');

  const items: FoodAnalysisItem[] = parsed.items.map(normalizeItem).filter((i: FoodAnalysisItem) => i.name);
  const validTypes = ["label", "meal", "mixed", "text-only"];
  const sources = Array.isArray(response.sources) ? response.sources : [];
  if (response.webSearchCalls) {
    console.info(`[analyzeFoodEntry] one-call scan ran ${response.webSearchCalls} web search(es)`, sources.map(s => s.url));
  }

  return {
    items,
    tip: typeof parsed?.tip === "string" ? parsed.tip : "",
    detectedType: validTypes.includes(parsed?.detectedType) ? parsed.detectedType : undefined,
    nutritionSourcesUsed: lookup.sourcesUsed,
    nutritionMatchCount: lookup.matches.length,
    nutritionSourcesSkipped: lookup.sourcesSkipped,
    identifiedAs: typeof parsed?.identifiedAs === "string" ? parsed.identifiedAs.trim().slice(0, 200) : undefined,
    webSources: sources,
    pipeline: "search",
  };
};

/**
 * Food scan entry point. One-call ChatGPT-style scan first; the legacy
 * two-pass scan if it fails for any reason other than quota or auth.
 */
export const analyzeFoodEntry = async (
  images: string[],
  textDescription: string,
  imageType: FoodImageType = "auto",
  customMenuItems?: Record<string, MenuItem[]>,
): Promise<FoodAnalysisResult> => {
  const hasImages = Array.isArray(images) && images.length > 0;
  const lookup = await lookupNutritionForText(textDescription, hasImages);
  try {
    return await analyzeFoodEntryWithSearch(images, textDescription, customMenuItems, lookup);
  } catch (err: any) {
    if (err instanceof AIProxyError &&
        (err.code === "functions/resource-exhausted" || err.code === "functions/unauthenticated")) {
      throw err;
    }
    console.warn(
      "[analyzeFoodEntry] one-call scan FAILED — falling back to the legacy two-pass scan",
      err?.upstream || err?.message || err,
    );
    return analyzeFoodEntryLegacy(images, textDescription, imageType, customMenuItems, lookup);
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

// ─────────────────────── Weekly calorie analysis ───────────────────────

export interface WeeklyDaySummary {
  /** Short day name, e.g. 'Mon'. */
  day: string;
  /** Locale date string for context. */
  date: string;
  /** Total kcal for the day, or null when nothing was logged. */
  calories: number | null;
  /** Biggest calorie items that day, pre-formatted (e.g. "Pizza (860 kcal)"). */
  topFoods?: string[];
  /** Workout label if one was completed. */
  workout?: string;
}

export interface WeeklyAnalysis {
  summary: string;
  wins: string[];
  watchouts: string[];
  drivers: string[];
  oneChange: string;
}

/**
 * Ask the coach to read a week of calorie data and explain which days and
 * habits helped or hurt. Tone: warm, zero judgment — trends over slip-ups.
 */
export const analyzeWeeklyCalories = async (
  input: {
    thisWeek: WeeklyDaySummary[];
    thisWeekAvg: number | null;
    lastWeekAvg: number | null;
    /** Weight change across this week in lbs (negative = lost), null if unknown. */
    weightChange: number | null;
  },
  profile: UserProfile,
  targets: NutritionTargets,
): Promise<WeeklyAnalysis> => {
  const dayLines = input.thisWeek
    .map((d) => {
      const cal = d.calories === null ? "not logged" : `${d.calories} kcal`;
      const foods = d.topFoods?.length ? ` — biggest items: ${d.topFoods.join(", ")}` : "";
      const wo = d.workout ? ` — workout: ${d.workout}` : "";
      return `  ${d.day} ${d.date}: ${cal}${foods}${wo}`;
    })
    .join("\n");

  const prompt = `
  You are Ding, a warm fitness coach. Analyze this user's week of calorie
  tracking. Be specific about WHICH days and WHICH foods/habits pushed the
  weekly count up or helped keep it on track. No judgment — trends over
  slip-ups, and celebrate what worked.

  User:
  - Goal: ${profile.goal}
  - Daily calorie target: ${targets.calories} kcal
  - Protein target: ${targets.protein}g

  This week, day by day:
${dayLines}

  This week's average on logged days: ${input.thisWeekAvg ?? "n/a"} kcal
  Last week's average: ${input.lastWeekAvg ?? "no data"} kcal
  Weight change this week: ${input.weightChange === null ? "no weigh-ins" : `${input.weightChange > 0 ? "+" : ""}${input.weightChange.toFixed(1)} lbs`}

  Rules:
  - Reference days by name (e.g. "Saturday ran hot because of...").
  - Name specific foods from the data when they drove a day over.
  - If days are unlogged, gently note that logging them sharpens the picture.
  - Keep every string short — this renders on a phone card.

  Return ONLY a valid JSON object:
  {
    "summary": "2-3 sentence read of the week vs last week and the goal",
    "wins": ["specific day/habit that helped", ...],
    "watchouts": ["specific day/food that pushed the count up", ...],
    "drivers": ["pattern behind the numbers, e.g. weekend restaurant meals", ...],
    "oneChange": "single most impactful change for next week"
  }
  `;

  const response = await callGeminiProxy({
    feature: "analyzeWeeklyCalories",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          wins: { type: Type.ARRAY, items: { type: Type.STRING } },
          watchouts: { type: Type.ARRAY, items: { type: Type.STRING } },
          drivers: { type: Type.ARRAY, items: { type: Type.STRING } },
          oneChange: { type: Type.STRING },
        },
        required: ["summary", "wins", "watchouts", "drivers", "oneChange"],
      },
    },
  });

  return JSON.parse(response.text);
};

// ─────────────────────── Fuel Coach (in-app) ───────────────────────

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
