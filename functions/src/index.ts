/**
 * Ding! — Cloud Functions
 *
 * Currently exposes these callables:
 *   • callGemini       — proxy to Gemini generateContent with auth + quota.
 *   • deleteAccount    — user-initiated full account wipe.
 *   • searchNutrition  — query Open Food Facts (free) + USDA FoodData Central
 *                        (requires user-supplied API key) for grounded
 *                        nutrition data; falls back gracefully if a source
 *                        isn't configured.
 *
 * To set the secrets once:
 *   firebase functions:secrets:set GEMINI_API_KEY
 *   firebase functions:secrets:set USDA_API_KEY   (optional)
 * Then deploy:
 *   firebase deploy --only functions
 */

import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { setGlobalOptions } from "firebase-functions/v2";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";
import { GoogleGenAI } from "@google/genai";

initializeApp();
setGlobalOptions({ region: "us-central1", maxInstances: 10 });

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
// Optional. If absent, searchNutrition still works via Open Food Facts.
const USDA_API_KEY = defineSecret("USDA_API_KEY");

// ----- Tunables -----
const DAILY_LIMIT_PER_USER = 50;          // AI calls/user/day
const ALLOWED_MODELS = new Set([
  "gemini-2.5-flash",
  // Add others here as needed. Keep this tight to prevent users
  // from switching to a more expensive model client-side.
]);
const DEFAULT_MODEL = "gemini-2.5-flash";
const MAX_REQUEST_BYTES = 9 * 1024 * 1024;  // ~9 MB (onCall hard cap is 10 MB)

// ----- Token pricing (USD per 1M tokens) -----
// Update these if Google adjusts Gemini pricing.
// Source: https://ai.google.dev/pricing
const PRICING: Record<string, { input: number; output: number }> = {
  "gemini-2.5-flash":      { input: 0.075, output: 0.30 },
  "gemini-2.5-flash-lite": { input: 0.0375, output: 0.15 },
  "gemini-2.5-pro":        { input: 1.25, output: 5.00 },
};
const FALLBACK_PRICING = { input: 0.075, output: 0.30 };

const estimateCostUsd = (
  model: string,
  promptTokens: number,
  candidatesTokens: number,
): number => {
  const p = PRICING[model] ?? FALLBACK_PRICING;
  return (
    (promptTokens / 1_000_000) * p.input +
    (candidatesTokens / 1_000_000) * p.output
  );
};

// ============================================================================
//  callGemini
// ============================================================================
export const callGemini = onCall(
  {
    cors: true,                  // Auth is enforced via Firebase ID token; CORS is a courtesy layer
    secrets: [GEMINI_API_KEY],
    timeoutSeconds: 60,
    memory: "512MiB",
  },
  async (req: CallableRequest<GeminiRequest>) => {
    // ----- 1. Auth -----
    if (!req.auth) {
      throw new HttpsError("unauthenticated", "Sign in first.");
    }
    const uid = req.auth.uid;

    // ----- 2. Validate input -----
    const data = req.data;
    if (!data || typeof data !== "object") {
      throw new HttpsError("invalid-argument", "Missing request body.");
    }

    const approxBytes = JSON.stringify(data).length;
    if (approxBytes > MAX_REQUEST_BYTES) {
      throw new HttpsError("invalid-argument", "Request too large.");
    }

    // Server forces the model — don't trust the client.
    const requestedModel = data.model || DEFAULT_MODEL;
    if (!ALLOWED_MODELS.has(requestedModel)) {
      throw new HttpsError(
        "invalid-argument",
        `Model not allowed: ${requestedModel}`,
      );
    }
    const model = requestedModel;

    if (!data.contents) {
      throw new HttpsError("invalid-argument", "Missing `contents`.");
    }

    // Optional feature label from the client for per-feature attribution
    // in the admin dashboard (e.g. 'analyzeFoodEntry', 'sendChatMessage').
    // Sanitized — only used for analytics, doesn't affect routing.
    const feature = typeof data.feature === "string"
      ? data.feature.slice(0, 64).replace(/[^a-zA-Z0-9_.-]/g, "")
      : "unknown";

    // ----- 3. Rate limit (atomic) -----
    await consumeQuota(uid);

    // ----- 4. Forward to Gemini -----
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY.value() });

    const startTime = Date.now();
    let result;
    try {
      // Cast contents/config to any — we're a thin proxy that forwards whatever
      // the client sends. We don't want to lock the proxy's types to a single
      // Gemini SDK version's exact shape.
      result = await ai.models.generateContent({
        model,
        contents: data.contents as any,
        config: data.config as any,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gemini call failed";
      console.error("[callGemini] upstream error", uid, msg);
      throw new HttpsError("internal", "AI service error. Try again.");
    }
    const durationMs = Date.now() - startTime;

    // ----- 5. Token usage logging (best-effort — don't block the response) -----
    // Gemini returns usageMetadata on every generateContent response. We capture
    // it for cost monitoring and write a per-call doc + update per-user totals.
    // Failure here is non-fatal: the user still gets their AI result.
    try {
      const usage = (result as any).usageMetadata ?? {};
      const promptTokens = Number(usage.promptTokenCount ?? 0);
      const candidatesTokens = Number(usage.candidatesTokenCount ?? 0);
      const totalTokens = Number(usage.totalTokenCount ?? promptTokens + candidatesTokens);
      const costUsd = estimateCostUsd(model, promptTokens, candidatesTokens);
      const userEmail = req.auth.token?.email ?? null;

      await logTokenUsage({
        uid,
        userEmail,
        feature,
        model,
        promptTokens,
        candidatesTokens,
        totalTokens,
        costUsd,
        durationMs,
      });
    } catch (err) {
      console.error("[callGemini] usage logging failed (non-fatal)", uid, err);
    }

    // ----- 6. Return shape (matches what the client was using) -----
    return {
      text: result.text ?? "",
      functionCalls: result.functionCalls ?? null,
    };
  },
);

// ============================================================================
//  Quota helper
// ============================================================================
/**
 * Atomically increments today's quota counter for the user.
 * Throws resource-exhausted if the daily limit is hit.
 */
async function consumeQuota(uid: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
  const db = getFirestore();
  const ref = db.collection("quotas").doc(uid);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.data() as { day?: string; count?: number } | undefined;

    if (!cur || cur.day !== today) {
      // First call of a new day (or first call ever).
      tx.set(ref, {
        day: today,
        count: 1,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return;
    }

    const next = (cur.count ?? 0) + 1;
    if (next > DAILY_LIMIT_PER_USER) {
      throw new HttpsError(
        "resource-exhausted",
        `Daily AI limit reached (${DAILY_LIMIT_PER_USER}/day). Resets tomorrow.`,
      );
    }
    tx.update(ref, {
      count: next,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

// ============================================================================
//  Token usage logging
// ============================================================================
/**
 * Writes a per-call record to `tokenUsage/` AND updates running totals on the
 * caller's `quotas/{uid}` doc. Best-effort: never throws to the caller.
 *
 * Schema of tokenUsage docs:
 *   { uid, userEmail?, feature, model, promptTokens, candidatesTokens,
 *     totalTokens, costUsd, durationMs, timestamp }
 *
 * Recommended: set a Firestore TTL policy on `tokenUsage.timestamp` to
 * auto-delete docs older than 30-90 days for cost control.
 */
interface TokenUsageInput {
  uid: string;
  userEmail: string | null;
  feature: string;
  model: string;
  promptTokens: number;
  candidatesTokens: number;
  totalTokens: number;
  costUsd: number;
  durationMs: number;
}

async function logTokenUsage(input: TokenUsageInput): Promise<void> {
  const db = getFirestore();
  const today = new Date().toISOString().slice(0, 10);

  // Per-call doc — the audit trail.
  const callDoc = {
    ...input,
    timestamp: FieldValue.serverTimestamp(),
    day: today,
  };

  // Per-user aggregate — fast queries for "today's totals across all users"
  // or "this user's lifetime spend" without scanning every per-call doc.
  const quotasRef = db.collection("quotas").doc(input.uid);

  await Promise.all([
    db.collection("tokenUsage").add(callDoc),
    quotasRef.set(
      {
        // Day rollover handling is done in consumeQuota; here we just add.
        // If the day rolled between consumeQuota and now, these accumulate
        // against today's date which is still correct.
        lifetimeCalls: FieldValue.increment(1),
        lifetimePromptTokens: FieldValue.increment(input.promptTokens),
        lifetimeCandidatesTokens: FieldValue.increment(input.candidatesTokens),
        lifetimeTotalTokens: FieldValue.increment(input.totalTokens),
        lifetimeCostUsd: FieldValue.increment(input.costUsd),
        lastFeature: input.feature,
        lastUpdated: FieldValue.serverTimestamp(),
        userEmail: input.userEmail,
      },
      { merge: true },
    ),
  ]);
}

// ============================================================================
//  Types
// ============================================================================
interface GeminiRequest {
  /** Optional — server enforces allowlist. Default: gemini-2.5-flash */
  model?: string;
  /** Anything @google/genai accepts as `contents` (string, parts array, etc.) */
  contents: unknown;
  /** Anything @google/genai accepts as `config` (system instruction, tools, schema, etc.) */
  config?: unknown;
  /** Optional feature label for per-feature attribution in the admin dashboard. */
  feature?: string;
}

// ============================================================================
//  deleteAccount
// ============================================================================
/**
 * Permanently delete a user's account and all associated data.
 *
 * Required by Apple App Store (Guideline 5.1.1(v)) and Google Play (May 2024).
 *
 * Wiped in order:
 *   1. Firestore docs: users/{uid}, user_workouts/{uid}, quotas/{uid} (recursive)
 *   2. Storage objects under users/{uid}/
 *   3. Firebase Auth user (must be last — invalidates the caller's token)
 *
 * The client must send { confirm: "DELETE" } as an explicit guard against
 * accidental calls. Surface a confirmation modal client-side as well.
 */
export const deleteAccount = onCall(
  {
    cors: true,
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (req: CallableRequest<{ confirm?: string }>) => {
    if (!req.auth) {
      throw new HttpsError("unauthenticated", "Sign in first.");
    }
    if (req.data?.confirm !== "DELETE") {
      throw new HttpsError(
        "invalid-argument",
        'Missing or invalid confirmation. Send { confirm: "DELETE" }.',
      );
    }

    const uid = req.auth.uid;
    const db = getFirestore();
    const storage = getStorage();
    const auth = getAuth();

    // ----- 1. Firestore (recursive — handles any subcollections) -----
    try {
      await Promise.all([
        db.recursiveDelete(db.collection("users").doc(uid)),
        db.recursiveDelete(db.collection("user_workouts").doc(uid)),
        db.recursiveDelete(db.collection("quotas").doc(uid)),
      ]);
    } catch (err) {
      console.error("[deleteAccount] Firestore delete error", uid, err);
      // Continue — Auth deletion is still the most important.
    }

    // ----- 2. Storage (any profile pictures or future user uploads) -----
    try {
      const bucket = storage.bucket();
      await bucket.deleteFiles({ prefix: `users/${uid}/` });
    } catch (err) {
      console.error("[deleteAccount] Storage delete error", uid, err);
      // Continue.
    }

    // ----- 3. Auth (MUST be last — invalidates the caller's ID token) -----
    try {
      await auth.deleteUser(uid);
    } catch (err) {
      console.error("[deleteAccount] Auth delete error", uid, err);
      throw new HttpsError(
        "internal",
        "Failed to delete account. Please contact support@dings.fitness.",
      );
    }

    return { success: true };
  },
);

// ============================================================================
//  searchNutrition
// ============================================================================
/**
 * Query verified nutrition databases for a food item. Tiered lookup:
 *
 *   1. USDA FoodData Central — high quality for whole foods (chicken breast,
 *      oatmeal, broccoli). Requires USDA_API_KEY secret to be configured;
 *      skipped silently if it isn't.
 *   2. Open Food Facts — broad coverage for branded packaged goods
 *      (cereals, protein bars, beverages). Free, no key required.
 *
 * Returns a normalized list of matches with macros on a per-100g basis
 * plus, where available, the source's reported serving size. Callers
 * (analyzeFoodEntry in the client) inject these into the Gemini prompt as
 * authoritative data so the AI does the quantity scaling against verified
 * values rather than guessing.
 *
 * Quota: counts against the user's daily AI quota since it's a downstream
 * service call. Light: ~50ms per upstream API.
 */
interface NutritionMatch {
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

interface SearchNutritionRequest {
  query: string;
  /** Optional cap. Defaults to 3. Max 5. */
  limit?: number;
}

interface SearchNutritionResponse {
  matches: NutritionMatch[];
  sourcesUsed: ("usda" | "openfoodfacts")[];
  sourcesSkipped: { source: string; reason: string }[];
}

export const searchNutrition = onCall(
  {
    cors: true,
    secrets: [USDA_API_KEY],
    timeoutSeconds: 15,
    memory: "256MiB",
  },
  async (req: CallableRequest<SearchNutritionRequest>): Promise<SearchNutritionResponse> => {
    if (!req.auth) {
      throw new HttpsError("unauthenticated", "Sign in first.");
    }
    const uid = req.auth.uid;

    const query = (req.data?.query ?? "").toString().trim().slice(0, 200);
    if (!query) {
      throw new HttpsError("invalid-argument", "Missing `query`.");
    }
    const limit = Math.min(Math.max(Number(req.data?.limit ?? 3), 1), 5);

    // Light per-user quota: shares the same bucket as Gemini calls so a
    // misbehaving client can't bypass quotas by spamming this endpoint.
    await consumeQuota(uid);

    const sourcesUsed: ("usda" | "openfoodfacts")[] = [];
    const sourcesSkipped: { source: string; reason: string }[] = [];
    const matches: NutritionMatch[] = [];

    // --- 1. USDA (when key is configured) -----------------------------------
    let usdaKey = "";
    try {
      usdaKey = USDA_API_KEY.value();
    } catch {
      // Secret not set in this environment — that's fine, fall through to OFF.
    }

    if (usdaKey) {
      try {
        const usdaMatches = await fetchFromUsda(query, usdaKey, limit);
        matches.push(...usdaMatches);
        sourcesUsed.push("usda");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "USDA fetch failed";
        console.error("[searchNutrition] USDA error", uid, msg);
        sourcesSkipped.push({ source: "usda", reason: msg });
      }
    } else {
      sourcesSkipped.push({ source: "usda", reason: "USDA_API_KEY not set" });
    }

    // --- 2. Open Food Facts (always tried) ----------------------------------
    try {
      const offMatches = await fetchFromOpenFoodFacts(query, limit);
      matches.push(...offMatches);
      sourcesUsed.push("openfoodfacts");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "OFF fetch failed";
      console.error("[searchNutrition] OFF error", uid, msg);
      sourcesSkipped.push({ source: "openfoodfacts", reason: msg });
    }

    // Trim to overall limit, USDA first (already prepended), then OFF.
    return {
      matches: matches.slice(0, limit),
      sourcesUsed,
      sourcesSkipped,
    };
  },
);

// ----- USDA helper -----
// USDA FoodData Central nutrient IDs (the API uses numeric IDs, not names).
const USDA_NUTRIENT_IDS = {
  energy:  1008,  // Energy (kcal)
  protein: 1003,
  carbs:   1005,
  fat:     1004,
  fiber:   1079,
} as const;

async function fetchFromUsda(query: string, apiKey: string, limit: number): Promise<NutritionMatch[]> {
  // Sanitize the query: USDA's parser is picky about non-ASCII characters and
  // certain punctuation (especially from mobile autocorrect inputs). We keep
  // letters, digits, spaces, and a couple of harmless connectors.
  const safeQuery = query.replace(/[^a-zA-Z0-9 ,.\-/]/g, " ").replace(/\s+/g, " ").trim();
  if (!safeQuery) {
    return [];
  }

  // No dataType filter — USDA returns all data types and ranks them by quality
  // server-side. Adding `dataType=Foundation,SR Legacy,Survey (FNDDS),Branded`
  // caused intermittent HTTP 400s (their parser dislikes the encoded parens).
  const url =
    `https://api.nal.usda.gov/fdc/v1/foods/search` +
    `?api_key=${encodeURIComponent(apiKey)}` +
    `&query=${encodeURIComponent(safeQuery)}` +
    `&pageSize=${limit}`;

  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    // Capture USDA's actual error body — they return structured JSON like
    // {"error": {"code": "API_KEY_INVALID"}} that helps diagnose problems.
    let detail = "";
    try {
      const body = await res.text();
      // Trim noise so the message stays small in the UI chip.
      detail = ` — ${body.slice(0, 160).replace(/\s+/g, " ").trim()}`;
    } catch {
      /* ignore body read errors */
    }
    throw new Error(`USDA HTTP ${res.status}${detail}`);
  }
  const data = (await res.json()) as { foods?: any[] };
  const foods = Array.isArray(data.foods) ? data.foods : [];

  return foods.slice(0, limit).map((f: any): NutritionMatch => {
    const nutrients: Array<{ nutrientId: number; value: number }> = f.foodNutrients ?? [];
    const get = (id: number) => {
      const n = nutrients.find(x => x.nutrientId === id);
      return n ? Number(n.value) || 0 : 0;
    };
    // USDA already normalizes to per-100g for most food types.
    const calories = get(USDA_NUTRIENT_IDS.energy);
    const protein  = get(USDA_NUTRIENT_IDS.protein);
    const carbs    = get(USDA_NUTRIENT_IDS.carbs);
    const fat      = get(USDA_NUTRIENT_IDS.fat);
    const fiber    = get(USDA_NUTRIENT_IDS.fiber);

    // Foundation/SR Legacy entries get high confidence; Branded varies.
    const confidence: "high" | "medium" | "low" =
      f.dataType === "Foundation" || f.dataType === "SR Legacy" ? "high"
      : f.dataType === "Survey (FNDDS)" ? "medium"
      : "medium";

    const servingSize =
      typeof f.servingSize === "number" && f.servingSizeUnit
        ? `${f.servingSize} ${f.servingSizeUnit}`
        : "100 g";

    return {
      source: "usda",
      name: f.description ?? "Unknown",
      brand: f.brandOwner ?? undefined,
      caloriesPer100g: Math.round(calories),
      proteinPer100g:  Math.round(protein * 10) / 10,
      carbsPer100g:    Math.round(carbs * 10) / 10,
      fatPer100g:      Math.round(fat * 10) / 10,
      fiberPer100g:    fiber > 0 ? Math.round(fiber * 10) / 10 : undefined,
      servingSize,
      sourceUrl: f.fdcId ? `https://fdc.nal.usda.gov/fdc-app.html#/food-details/${f.fdcId}/nutrients` : undefined,
      confidence,
    };
  });
}

// ----- Open Food Facts helper -----
async function fetchFromOpenFoodFacts(query: string, limit: number): Promise<NutritionMatch[]> {
  const url =
    `https://world.openfoodfacts.org/cgi/search.pl` +
    `?search_terms=${encodeURIComponent(query)}` +
    `&search_simple=1&action=process&json=1` +
    `&page_size=${limit}` +
    // Sort by completeness so we get well-filled-in products first.
    `&sort_by=completeness`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      // OFF asks contributors to identify themselves via UA.
      "User-Agent": "DingFitness/1.0 (https://dings.fitness; support@dings.fitness)",
    },
  });
  if (!res.ok) {
    throw new Error(`OFF HTTP ${res.status}`);
  }
  const data = (await res.json()) as { products?: any[] };
  const products = Array.isArray(data.products) ? data.products : [];

  return products
    .filter(p => p?.nutriments && (p.nutriments["energy-kcal_100g"] ?? p.nutriments["energy_100g"]))
    .slice(0, limit)
    .map((p: any): NutritionMatch => {
      const n = p.nutriments ?? {};
      const calories = n["energy-kcal_100g"] ?? (n["energy_100g"] ? n["energy_100g"] / 4.184 : 0);
      // Confidence reflects how filled-in the entry is. OFF data quality varies wildly.
      const completeness = Number(p.completeness ?? 0);
      const confidence: "high" | "medium" | "low" =
        completeness > 0.8 ? "high" : completeness > 0.5 ? "medium" : "low";

      return {
        source: "openfoodfacts",
        name: p.product_name || p.product_name_en || "Unknown",
        brand: p.brands ? String(p.brands).split(",")[0].trim() : undefined,
        caloriesPer100g: Math.round(Number(calories) || 0),
        proteinPer100g:  Math.round((Number(n.proteins_100g)      || 0) * 10) / 10,
        carbsPer100g:    Math.round((Number(n.carbohydrates_100g) || 0) * 10) / 10,
        fatPer100g:      Math.round((Number(n.fat_100g)           || 0) * 10) / 10,
        fiberPer100g:    n.fiber_100g ? Math.round(Number(n.fiber_100g) * 10) / 10 : undefined,
        servingSize:     p.serving_size || "100 g",
        sourceUrl:       p.code ? `https://world.openfoodfacts.org/product/${p.code}` : undefined,
        confidence,
      };
    });
}
