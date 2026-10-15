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
 *   firebase functions:secrets:set OPENAI_API_KEY  (food scan; callOpenAI)
 *   firebase functions:secrets:set USDA_API_KEY    (optional)
 * Then deploy:
 *   firebase deploy --only functions
 */

import { onCall, onRequest, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { randomBytes, createHash } from "crypto";
import { defineSecret } from "firebase-functions/params";
import { setGlobalOptions } from "firebase-functions/v2";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { registerFoodJobs } from './foodJobs';
import { requireAiConsent } from './aiPolicy';

initializeApp();
setGlobalOptions({ region: "us-central1", maxInstances: 10 });

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");
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

// ----- OpenAI (food scan only; see callOpenAI below) -----
// Vision is required for photo analysis, which rules out GPT-6 Astra (no
// vision). Terra is the accuracy/cost balance; Sol is allowlisted if food
// scans need more.
//
// Oct 2026: the scan now runs on the RESPONSES API (`api: "responses"`),
// where gpt-5.6-terra takes the photo AND has the hosted web_search tool in
// the same call — the way ChatGPT itself answers "what is this?". The old
// claim that search and vision can't be combined is only true of Chat
// Completions (search there needs gpt-5-search-api, which has no vision).
// gpt-5-search-api stays allowlisted for the legacy two-pass fallback.
const ALLOWED_OPENAI_MODELS = new Set([
  "gpt-5.6-terra",     // default for vision + macros
  "gpt-5.6-sol",       // stronger, pricier
  "gpt-5-search-api",  // text-only search pass
]);
const DEFAULT_OPENAI_MODEL = "gpt-5.6-terra";
const MAX_REQUEST_BYTES = 9 * 1024 * 1024;  // ~9 MB (onCall hard cap is 10 MB)

// ----- Token pricing (USD per 1M tokens) -----
// Update these if Google adjusts Gemini pricing.
// Source: https://ai.google.dev/pricing
const PRICING: Record<string, { input: number; output: number }> = {
  "gemini-2.5-flash":      { input: 0.075, output: 0.30 },
  "gemini-2.5-flash-lite": { input: 0.0375, output: 0.15 },
  "gemini-2.5-pro":        { input: 1.25, output: 5.00 },
  // OpenAI, USD per 1M tokens (Sept 2026)
  "gpt-5.6-terra":    { input: 2.00, output: 12.00 },
  "gpt-5.6-sol":      { input: 4.00, output: 20.00 },
  "gpt-5-search-api": { input: 2.00, output: 12.00 },
};
const FALLBACK_PRICING = { input: 0.075, output: 0.30 };
// Hosted web_search tool calls are billed per call on top of tokens.
// ESTIMATE ($10 / 1k calls) — check https://openai.com/api/pricing and
// update. Only used for the cost figure in tokenUsage.
const WEB_SEARCH_CALL_USD = 0.01;

export const { startFoodAnalysis, cancelFoodAnalysis, processFoodAnalysis, cleanFoodAnalysis } = registerFoodJobs({
  apiKey: OPENAI_API_KEY,
  model: DEFAULT_OPENAI_MODEL,
  consumeQuota,
  recordUsage: async (uid, response, durationMs) => {
    const usage = response.usage ?? {};
    const promptTokens = Number(usage.input_tokens) || 0;
    const candidatesTokens = Number(usage.output_tokens) || 0;
    const webSearchCalls = (response.output ?? []).filter((o: any) => o.type === 'web_search_call').length;
    await logTokenUsage({ uid, userEmail: null, feature: 'analyzeFoodEntry', model: DEFAULT_OPENAI_MODEL,
      promptTokens, candidatesTokens, totalTokens: promptTokens + candidatesTokens,
      costUsd: estimateCostUsd(DEFAULT_OPENAI_MODEL, promptTokens, candidatesTokens) + webSearchCalls * WEB_SEARCH_CALL_USD,
      durationMs, webSearchCalls, api: 'responses' });
  },
});

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

    // ----- 1b. AI data-sharing consent (Guideline 5.1.2(i); audit PRIV-02) -----
    // Same rule as startFoodAnalysis: nothing goes to Gemini until the user
    // has accepted the in-app AI consent sheet.
    await requireAiConsent(uid);

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
    try {
      await consumeQuota(uid);
    } catch (err) {
      // Count exhaustion hits so the ops report can spot widespread limiting
      // (fine when isolated, a signal when it's everyone). Best-effort.
      bumpOpsCounter("quotaExhaustedHits").catch(() => undefined);
      throw err;
    }

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
      // Best-effort daily error counter for the ops report.
      bumpOpsCounter("upstreamErrors").catch(() => undefined);
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
  /** Responses API only: how many hosted web searches the model ran. */
  webSearchCalls?: number;
  /** Which OpenAI API served the call ("chat" | "responses"). */
  api?: string;
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
//  Ops counters + opsReport
// ============================================================================
/** Increment a named counter on today's opsCounters doc. Server-only data. */
async function bumpOpsCounter(field: string): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  await getFirestore()
    .collection("opsCounters")
    .doc(day)
    .set({ [field]: FieldValue.increment(1), day }, { merge: true });
}

/**
 * opsReport — admin-only weekly health snapshot for the ops agent.
 *
 * Aggregates what the in-app admin dashboard shows, as JSON:
 * 7-day AI spend/calls (total, per-feature, top spenders), today's
 * quota-limited users, error counters, and total user count.
 *
 * Auth: the same personal bearer key as gptMacros (gptKeys/{key} -> uid),
 * but the resolved uid must be on the admin allowlist. Accepts the key as
 * `?key=` (the ops agent's fetch tool cannot set headers) or a Bearer
 * header. HTTPS-only; the key is revocable by minting a new one in-app.
 */
const OPS_ADMIN_UIDS = new Set([
  "bYGcwJKlN2b4myugbVGNv8e4syO2", // keep in sync with firestore.rules isAdmin()
]);

export const opsReport = onRequest({ cors: true }, async (req, res) => {
  try {
    const header = String(req.headers.authorization || "");
    const key =
      (typeof req.query.key === "string" && req.query.key) ||
      (header.startsWith("Bearer ") ? header.slice(7).trim() : "");
    if (!key) {
      res.status(401).json({ error: "Missing key" });
      return;
    }

    const db = getFirestore();
    const keyDoc = await db.collection("gptKeys").doc(key).get();
    const uid = keyDoc.exists ? (keyDoc.get("uid") as string) : null;
    if (!uid || !OPS_ADMIN_UIDS.has(uid)) {
      res.status(403).json({ error: "Not authorized" });
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const d7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    // 7-day AI usage from the tokenUsage audit trail.
    const usageSnap = await db
      .collection("tokenUsage")
      .where("day", ">=", d7)
      .get();

    let totalCost = 0;
    let totalCalls = 0;
    let totalTokens = 0;
    const byFeature: Record<string, { calls: number; costUsd: number }> = {};
    const byUser: Record<string, { costUsd: number; calls: number; email?: string }> = {};
    usageSnap.forEach((doc) => {
      const d = doc.data() as Record<string, unknown>;
      const cost = Number(d.costUsd) || 0;
      totalCost += cost;
      totalCalls += 1;
      totalTokens += Number(d.totalTokens) || 0;
      const feature = String(d.feature || "unknown");
      byFeature[feature] = {
        calls: (byFeature[feature]?.calls || 0) + 1,
        costUsd: (byFeature[feature]?.costUsd || 0) + cost,
      };
      const u = String(d.uid || "unknown");
      byUser[u] = {
        calls: (byUser[u]?.calls || 0) + 1,
        costUsd: (byUser[u]?.costUsd || 0) + cost,
        email: typeof d.userEmail === "string" ? d.userEmail : byUser[u]?.email,
      };
    });
    const topSpenders = Object.entries(byUser)
      .sort((a, b) => b[1].costUsd - a[1].costUsd)
      .slice(0, 5)
      .map(([id, v]) => ({
        uid: id.slice(0, 8) + "…", // partial uid — enough to correlate, not to target
        email: v.email ?? null,
        calls: v.calls,
        costUsd: Number(v.costUsd.toFixed(4)),
      }));

    // Users at today's quota limit right now.
    // NOTE: equality-only query on purpose. Adding `.where("count", ">=", …)`
    // would combine equality + range and require a composite index; this
    // collection holds one small doc per user per day, so filtering in
    // memory is cheaper than maintaining an index.
    const quotaSnap = await db.collection("quotas").where("day", "==", today).get();
    let usersAtLimitToday = 0;
    quotaSnap.forEach((doc) => {
      if ((Number(doc.get("count")) || 0) >= DAILY_LIMIT_PER_USER) usersAtLimitToday += 1;
    });

    // Error counters, last 7 days.
    const countersSnap = await db
      .collection("opsCounters")
      .where("day", ">=", d7)
      .get();
    let upstreamErrors = 0;
    let quotaExhaustedHits = 0;
    countersSnap.forEach((doc) => {
      upstreamErrors += Number(doc.get("upstreamErrors")) || 0;
      quotaExhaustedHits += Number(doc.get("quotaExhaustedHits")) || 0;
    });

    // Total registered users (Firestore user docs).
    const usersCount = (await db.collection("users").count().get()).data().count;

    // COST EARLY-WARNING: user-document size.
    //
    // Firestore egress = document size x how often snapshots fire. In Aug 2026
    // an oversized user doc (raw base64 profile picture + whole-state writes)
    // produced ~200GB of egress in two days. Document size is the leading
    // indicator, so sample it here and let the ops agent alarm on growth
    // BEFORE it shows up on a bill. Sampled (not scanned) so this check can't
    // itself become the expensive thing.
    const SAMPLE = 25;
    const sampleSnap = await db.collection("users").limit(SAMPLE).get();
    let totalBytes = 0;
    let maxBytes = 0;
    let biggestDocUid: string | null = null;
    let docsWithEmbeddedImages = 0;
    sampleSnap.forEach((doc) => {
      const raw = JSON.stringify(doc.data() ?? {});
      const bytes = Buffer.byteLength(raw, "utf8");
      totalBytes += bytes;
      if (bytes > maxBytes) {
        maxBytes = bytes;
        biggestDocUid = doc.id.slice(0, 8) + "…";
      }
      // A data: URI in the doc means an image is embedded rather than linked.
      if (raw.includes("data:image/")) docsWithEmbeddedImages += 1;
    });
    const sampled = sampleSnap.size;
    const avgBytes = sampled > 0 ? Math.round(totalBytes / sampled) : 0;

    const payload = {
      generatedAt: new Date().toISOString(),
      windowDays: 7,
      users: { total: usersCount },
      ai: {
        calls: totalCalls,
        totalTokens,
        costUsd: Number(totalCost.toFixed(4)),
        avgCostPerDayUsd: Number((totalCost / 7).toFixed(4)),
        byFeature: Object.fromEntries(
          Object.entries(byFeature).map(([k, v]) => [
            k,
            { calls: v.calls, costUsd: Number(v.costUsd.toFixed(4)) },
          ]),
        ),
        topSpenders,
      },
      quota: {
        dailyLimitPerUser: DAILY_LIMIT_PER_USER,
        usersAtLimitToday,
        exhaustedHits7d: quotaExhaustedHits,
      },
      errors: { upstreamErrors7d: upstreamErrors },
      // Cost risk signals — see the sampling note above.
      storage: {
        sampledUsers: sampled,
        avgUserDocKb: Number((avgBytes / 1024).toFixed(1)),
        maxUserDocKb: Number((maxBytes / 1024).toFixed(1)),
        biggestDocUid,
        docsWithEmbeddedImages,
        // Rough guide: >100KB average means snapshot traffic is getting
        // expensive; >500KB on any single doc is the pattern that caused
        // the Aug 2026 egress incident.
        avgWarnKb: 100,
        maxWarnKb: 500,
      },
    };

    // `?format=html` renders the same numbers as a plain HTML page.
    // The weekly ops agent fetches with a page-oriented tool that cannot
    // surface raw JSON bodies, so HTML is what actually reaches it. JSON
    // stays the default for browsers, scripts, and anything programmatic.
    if (req.query.format === "html") {
      const esc = (s: unknown) =>
        String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
      const featureRows = Object.entries(payload.ai.byFeature)
        .sort((a, b) => b[1].costUsd - a[1].costUsd)
        .map(([k, v]) => `<li>${esc(k)}: ${v.calls} calls, $${v.costUsd.toFixed(4)}</li>`)
        .join("");
      const spenderRows = payload.ai.topSpenders
        .map((s) => `<li>${esc(s.email ?? s.uid)}: ${s.calls} calls, $${s.costUsd.toFixed(4)}</li>`)
        .join("");
      res.set("Content-Type", "text/html; charset=utf-8");
      res.send(`<!doctype html><html><head><meta charset="utf-8">
<title>Ding ops report</title></head><body>
<h1>Ding! Fitness — ops report</h1>
<p>Generated ${esc(payload.generatedAt)} · window ${payload.windowDays} days</p>
<h2>Users</h2>
<p>Total registered users: ${payload.users.total}</p>
<h2>AI usage (7 days)</h2>
<ul>
<li>Calls: ${payload.ai.calls}</li>
<li>Total tokens: ${payload.ai.totalTokens}</li>
<li>Cost: $${payload.ai.costUsd.toFixed(4)}</li>
<li>Average cost per day: $${payload.ai.avgCostPerDayUsd.toFixed(4)}</li>
</ul>
<h3>By feature</h3><ul>${featureRows || "<li>none</li>"}</ul>
<h3>Top spenders</h3><ul>${spenderRows || "<li>none</li>"}</ul>
<h2>Quota</h2>
<ul>
<li>Daily limit per user: ${payload.quota.dailyLimitPerUser}</li>
<li>Users at limit today: ${payload.quota.usersAtLimitToday}</li>
<li>Quota-exhausted hits (7d): ${payload.quota.exhaustedHits7d}</li>
</ul>
<h2>Errors</h2>
<p>Upstream AI errors (7d): ${payload.errors.upstreamErrors7d}</p>
<h2>Cost risk — Firestore document size</h2>
<ul>
<li>Sampled users: ${payload.storage.sampledUsers}</li>
<li>Average user document: ${payload.storage.avgUserDocKb} KB (warn above ${payload.storage.avgWarnKb} KB)</li>
<li>Largest user document: ${payload.storage.maxUserDocKb} KB${payload.storage.biggestDocUid ? ` (${esc(payload.storage.biggestDocUid)})` : ""} (warn above ${payload.storage.maxWarnKb} KB)</li>
<li>Documents with embedded images: ${payload.storage.docsWithEmbeddedImages}</li>
</ul>
</body></html>`);
      return;
    }

    res.json(payload);
  } catch (err) {
    console.error("[opsReport] failed", err);
    // Only reachable after the admin key check passed, so returning the real
    // message is safe here and makes failures diagnosable without digging
    // through Cloud Logging.
    res.status(500).json({
      error: "Report generation failed",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});


// ============================================================================
//  callOpenAI
// ============================================================================
/**
 * OpenAI proxy, used ONLY by the food-macro scan (analyzeFoodEntry).
 *
 * Deliberately separate from callGemini rather than a provider flag inside
 * it: nine other features depend on that path and there is no reason to put
 * them at risk. Both share the same auth, quota bucket and usage logging.
 *
 * Two APIs:
 *   api: "responses" (default for the food scan since Oct 2026)
 *      gpt-5.6-terra sees the photo, reasons, and can call the hosted
 *      web_search tool in ONE call — the ChatGPT-style flow. Messages are
 *      sent in Chat Completions shape and converted here.
 *   api: "chat" (legacy two-pass fallback)
 *      1. vision + JSON (gpt-5.6-terra) - reads the plate
 *      2. text-only search (gpt-5-search-api + webSearch) - pass 1
 */
interface OpenAIRequest {
  model?: string;
  messages: unknown;
  responseFormat?: unknown;
  /**
   * chat: enables web_search_options (search models only).
   * responses: offers the hosted web_search tool; the model decides
   * whether to search.
   */
  webSearch?: boolean;
  temperature?: number;
  feature?: string;
  api?: "chat" | "responses";
  reasoningEffort?: "low" | "medium" | "high";
}

/** Chat Completions message shape -> Responses API `input` items. */
function toResponsesInput(messages: unknown[]): unknown[] {
  return messages.map((m: any) => {
    const role = m?.role === "system" ? "developer" : (m?.role || "user");
    const parts = typeof m?.content === "string"
      ? [{ type: "text", text: m.content }]
      : Array.isArray(m?.content) ? m.content : [];
    const content = parts.map((p: any) => {
      if (p?.type === "image_url") {
        const url = typeof p.image_url === "string" ? p.image_url : p.image_url?.url;
        // "high": labels and small portion cues need full resolution.
        return { type: "input_image", image_url: url, detail: p.image_url?.detail || "high" };
      }
      return { type: "input_text", text: String(p?.text ?? "") };
    });
    return { role, content };
  });
}

/** Pull url citations the model attached to its answer (deduped). */
function extractCitations(response: any): { url: string; title?: string }[] {
  const out: { url: string; title?: string }[] = [];
  const seen = new Set<string>();
  for (const item of response?.output ?? []) {
    if (item?.type !== "message") continue;
    for (const part of item.content ?? []) {
      for (const a of part?.annotations ?? []) {
        if (a?.type === "url_citation" && a.url && !seen.has(a.url)) {
          seen.add(a.url);
          out.push({ url: String(a.url), title: a.title ? String(a.title) : undefined });
        }
      }
    }
  }
  return out.slice(0, 8);
}

export const callOpenAI = onCall(
  {
    cors: true,
    secrets: [OPENAI_API_KEY],
    timeoutSeconds: 180,   // reasoning + web search can take a while
    memory: "512MiB",
  },
  async (req: CallableRequest<OpenAIRequest>) => {
    if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
    const uid = req.auth.uid;

    const data = req.data;
    if (!data || typeof data !== "object") {
      throw new HttpsError("invalid-argument", "Missing request body.");
    }
    if (JSON.stringify(data).length > MAX_REQUEST_BYTES) {
      throw new HttpsError("invalid-argument", "Request too large.");
    }
    if (!Array.isArray(data.messages) || data.messages.length === 0) {
      throw new HttpsError("invalid-argument", "Missing `messages`.");
    }

    const model = data.model || DEFAULT_OPENAI_MODEL;
    if (!ALLOWED_OPENAI_MODELS.has(model)) {
      throw new HttpsError("invalid-argument", `Model not allowed: ${model}`);
    }

    const feature = typeof data.feature === "string"
      ? data.feature.slice(0, 64).replace(/[^a-zA-Z0-9_.-]/g, "")
      : "unknown";

    // Shares the Gemini quota bucket so one user cannot bypass the daily cap
    // by using the food scan.
    try {
      await consumeQuota(uid);
    } catch (err) {
      bumpOpsCounter("quotaExhaustedHits").catch(() => undefined);
      throw err;
    }

    const client = new OpenAI({ apiKey: OPENAI_API_KEY.value() });
    const startTime = Date.now();

    // ---- Responses API: vision + reasoning + optional web search, one call
    if (data.api === "responses") {
      const effort = ["low", "medium", "high"].includes(String(data.reasoningEffort))
        ? data.reasoningEffort
        : "medium";
      let response: any;
      try {
        response = await (client as any).responses.create({
          model,
          input: toResponsesInput(data.messages as unknown[]),
          reasoning: { effort },
          ...(data.webSearch ? { tools: [{ type: "web_search" }], tool_choice: "auto" } : {}),
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "OpenAI call failed";
        console.error("[callOpenAI:responses] upstream error", uid, feature, msg);
        bumpOpsCounter("upstreamErrors").catch(() => undefined);
        // The client falls back to the legacy two-pass scan on this error;
        // the upstream message is passed along so the fallback is diagnosable
        // from the browser console.
        throw new HttpsError("internal", "AI service error. Try again.", { upstream: msg.slice(0, 300) });
      }
      const durationMs = Date.now() - startTime;
      const webSearchCalls = (response?.output ?? []).filter((o: any) => o?.type === "web_search_call").length;
      const sources = extractCitations(response);

      try {
        const usage = response?.usage ?? {};
        const promptTokens = Number(usage.input_tokens ?? 0);
        const candidatesTokens = Number(usage.output_tokens ?? 0);
        await logTokenUsage({
          uid,
          userEmail: req.auth.token?.email ?? null,
          feature,
          model,
          promptTokens,
          candidatesTokens,
          totalTokens: Number(usage.total_tokens ?? promptTokens + candidatesTokens),
          costUsd: estimateCostUsd(model, promptTokens, candidatesTokens) + webSearchCalls * WEB_SEARCH_CALL_USD,
          durationMs,
          webSearchCalls,
          api: "responses",
        });
      } catch (err) {
        console.error("[callOpenAI] usage logging failed (non-fatal)", uid, err);
      }

      const text = typeof response?.output_text === "string"
        ? response.output_text
        : (response?.output ?? [])
            .filter((o: any) => o?.type === "message")
            .flatMap((o: any) => (o.content ?? []).map((c: any) => c?.text ?? ""))
            .join("");
      return { text, sources, webSearchCalls };
    }

    let result;
    try {
      result = await client.chat.completions.create({
        model,
        messages: data.messages as any,
        ...(data.responseFormat ? { response_format: data.responseFormat as any } : {}),
        ...(data.webSearch ? { web_search_options: {} } : {}),
        ...(typeof data.temperature === "number" ? { temperature: data.temperature } : {}),
      } as any);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "OpenAI call failed";
      console.error("[callOpenAI] upstream error", uid, feature, msg);
      bumpOpsCounter("upstreamErrors").catch(() => undefined);
      throw new HttpsError("internal", "AI service error. Try again.");
    }
    const durationMs = Date.now() - startTime;

    try {
      const usage = (result as any).usage ?? {};
      const promptTokens = Number(usage.prompt_tokens ?? 0);
      const candidatesTokens = Number(usage.completion_tokens ?? 0);
      await logTokenUsage({
        uid,
        userEmail: req.auth.token?.email ?? null,
        feature,
        model,
        promptTokens,
        candidatesTokens,
        totalTokens: Number(usage.total_tokens ?? promptTokens + candidatesTokens),
        costUsd: estimateCostUsd(model, promptTokens, candidatesTokens),
        durationMs,
      });
    } catch (err) {
      console.error("[callOpenAI] usage logging failed (non-fatal)", uid, err);
    }

    return { text: (result as any).choices?.[0]?.message?.content ?? "" };
  },
);

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
      const foodJobs = await db.collection('foodAnalysisJobs').where('uid', '==', uid).get();
      for (const job of foodJobs.docs) await job.ref.delete();
    } catch (err) {
      console.error("[deleteAccount] Firestore delete error", uid, err);
      // Continue — Auth deletion is still the most important.
    }

    // ----- 2. Storage (any profile pictures or future user uploads) -----
    try {
      const bucket = storage.bucket();
      await bucket.deleteFiles({ prefix: `users/${uid}/` });
      await bucket.deleteFiles({ prefix: `foodAnalysisInputs/${uid}/` });
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
  /** 0..1 share of the query's food words this match covers. */
  relevance?: number;
}

// ----- Relevance gate (Oct 2026) -----
// USDA and Open Food Facts are keyword engines: they return SOMETHING for
// almost any text — including "what is this". Those hits used to be handed
// to the model as "AUTHORITATIVE — USE THESE VALUES", which is where many
// nonsense scans came from (a teriyaki *sauce* standing in for a teriyaki
// *bowl*, a random product for a question). Now a match is only returned
// when it actually covers the food words the user typed and isn't a
// different FORM of the food (sauce, seasoning, powder, bar...).
const MATCH_FILLER = new Set([
  "what", "whats", "is", "this", "that", "it", "its", "the", "a", "an", "of", "with", "and", "or",
  "how", "many", "much", "calorie", "calories", "cal", "cals", "kcal", "macro", "macros",
  "nutrition", "nutritional", "info", "in", "on", "my", "i", "ate", "had", "have", "got", "for", "to",
  "some", "please", "okay", "ok", "so", "can", "you", "tell", "me", "about", "does", "do", "are",
  "these", "those", "here", "there", "today", "tonight", "lunch", "dinner", "breakfast", "snack",
  "from", "at", "be", "would", "should", "estimate", "guess", "food", "meal", "picture", "photo", "pic",
  "g", "gram", "grams", "oz", "ounce", "ounces", "lb", "lbs", "pound", "pounds", "ml", "cup", "cups",
  "tbsp", "tsp", "tablespoon", "tablespoons", "teaspoon", "teaspoons", "slice", "slices", "piece",
  "pieces", "serving", "servings", "x", "half", "large", "medium", "small", "regular", "about",
]);
const FORM_WORDS = new Set([
  "sauce", "seasoning", "mix", "powder", "dressing", "marinade", "flavored", "flavor", "chip",
  "bar", "drink", "beverage", "candy", "spread", "broth", "bouillon", "baby", "infant", "formula",
  "supplement", "extract", "syrup", "dip", "kit", "snack", "cracker", "cereal", "juice", "oil",
  "gravy", "rub", "glaze", "topping", "dehydrated", "dried", "concentrate", "substitute",
]);

function stem(w: string): string {
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

function rawWords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/['’]s\b/g, "")
    .replace(/[^a-z ]+/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 1);
}
const wordsOf = (s: string): string[] => rawWords(s).map(stem);
const isFiller = (w: string): boolean => MATCH_FILLER.has(w) || MATCH_FILLER.has(stem(w));

/** The food words in a query: no filler, quantities, units or questions. */
function foodTokens(query: string): string[] {
  return Array.from(new Set(rawWords(query).filter(w => !isFiller(w)).map(stem)));
}

/**
 * 0..1 share of the query's food words a candidate covers; 0 when the
 * candidate is a different form of the food than what was asked for.
 */
function relevanceScore(qTokens: string[], name: string, brand?: string): number {
  if (qTokens.length === 0) return 0;
  const nameWords = new Set(wordsOf(name));
  for (const w of nameWords) {
    if (FORM_WORDS.has(w) && !qTokens.includes(w)) return 0;
  }
  const all = new Set([...nameWords, ...wordsOf(brand || "")]);
  const covered = qTokens.filter(w => all.has(w)).length;
  return covered / qTokens.length;
}
const MIN_RELEVANCE = 0.6;

/** Did the user name this product's brand? */
function brandMentioned(qTokens: string[], brand?: string): boolean {
  const b = wordsOf(brand || "").filter(w => w.length > 2);
  return b.length > 0 && b.some(w => qTokens.includes(w));
}

/** Query text for the upstream engines: the food words, unstemmed. */
function upstreamQuery(query: string): string {
  return rawWords(query).filter(w => !isFiller(w)).join(" ");
}

/**
 * Keep only relevant matches, re-rate confidence honestly, rank best first.
 * Branded products the user didn't name are capped at "low": one brand's
 * granola is not "granola".
 */
function gateMatches(
  qTokens: string[],
  raw: (NutritionMatch & { usdaType?: string })[],
): NutritionMatch[] {
  const typeRank = (m: NutritionMatch & { usdaType?: string }) =>
    m.source === "usda"
      ? (m.usdaType === "Foundation" || m.usdaType === "SR Legacy" ? 3 : m.usdaType === "Survey (FNDDS)" ? 2 : 1)
      : 0;
  return raw
    .map(m => ({ m, rel: relevanceScore(qTokens, m.name, m.brand) }))
    .filter(x => x.rel >= MIN_RELEVANCE)
    .map(x => {
      const branded = x.m.source === "openfoodfacts" || x.m.usdaType === "Branded";
      const confidence: NutritionMatch["confidence"] =
        branded && !brandMentioned(qTokens, x.m.brand) ? "low" : x.m.confidence;
      const { usdaType: _drop, ...rest } = x.m;
      void _drop;
      return { m: { ...rest, confidence, relevance: Math.round(x.rel * 100) / 100 }, rel: x.rel, tr: typeRank(x.m) };
    })
    .sort((a, b) => b.rel - a.rel || b.tr - a.tr)
    .map(x => x.m);
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

    // A question or filler ("what is this?", "how many calories") has no
    // food words to look up. Answer empty instead of letting a keyword
    // engine return something random.
    const qTokens = foodTokens(query);
    if (qTokens.length === 0) {
      return {
        matches: [],
        sourcesUsed: [],
        sourcesSkipped: [{ source: "all", reason: "no food words in query" }],
      };
    }

    // Light per-user quota: shares the same bucket as Gemini calls so a
    // misbehaving client can't bypass quotas by spamming this endpoint.
    await consumeQuota(uid);

    const sourcesUsed: ("usda" | "openfoodfacts")[] = [];
    const sourcesSkipped: { source: string; reason: string }[] = [];
    const matches: (NutritionMatch & { usdaType?: string })[] = [];
    // Pull a wider candidate set than we return; the relevance gate below
    // throws most of it away.
    const searchText = upstreamQuery(query) || query;
    const CANDIDATES = 10;

    // --- 1. USDA (when key is configured) -----------------------------------
    let usdaKey = "";
    try {
      usdaKey = USDA_API_KEY.value();
    } catch {
      // Secret not set in this environment — that's fine, fall through to OFF.
    }

    if (usdaKey) {
      try {
        const usdaMatches = await fetchFromUsda(searchText, usdaKey, CANDIDATES);
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
      const offMatches = await fetchFromOpenFoodFacts(searchText, CANDIDATES);
      matches.push(...offMatches);
      sourcesUsed.push("openfoodfacts");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "OFF fetch failed";
      console.error("[searchNutrition] OFF error", uid, msg);
      sourcesSkipped.push({ source: "openfoodfacts", reason: msg });
    }

    // Relevant matches only, best first (whole-food USDA entries win ties).
    return {
      matches: gateMatches(qTokens, matches).slice(0, limit),
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

  return foods.slice(0, limit).map((f: any): NutritionMatch & { usdaType?: string } => {
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
      usdaType: typeof f.dataType === "string" ? f.dataType : undefined,
    };
  });
}

// ----- Open Food Facts helper -----
async function fetchFromOpenFoodFacts(query: string, limit: number): Promise<NutritionMatch[]> {
  const url =
    `https://world.openfoodfacts.org/cgi/search.pl` +
    `?search_terms=${encodeURIComponent(query)}` +
    `&search_simple=1&action=process&json=1` +
    // Default (relevance/popularity) order. sort_by=completeness used to put
    // the best-documented product first whether or not it matched the query.
    `&page_size=${limit}`;

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

// ============================================================================
//  lookupBarcode
// ============================================================================
/**
 * Resolve a scanned UPC/EAN barcode to label nutrition. No AI involved:
 *
 *   1. Open Food Facts product endpoint (free, best barcode coverage)
 *   2. USDA FoodData Central branded foods, matched on gtinUpc
 *
 * Results (including misses) are cached in `barcodeCache/{code}` so a
 * product only hits the upstream APIs once for every user. Hits stay for
 * 180 days; misses for 7 days so newly added products show up.
 * The collection is server-only (default-deny in firestore.rules).
 */
interface BarcodeMacros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
}

interface BarcodeProduct {
  barcode: string;
  name: string;
  brand?: string;
  servingSize?: string;
  perServing: BarcodeMacros | null;
  per100g: BarcodeMacros | null;
  source: "openfoodfacts" | "usda";
  sourceUrl?: string;
}

interface LookupBarcodeResponse {
  found: boolean;
  cached: boolean;
  product?: BarcodeProduct;
}

const BARCODE_HIT_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const BARCODE_MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const round1 = (n: number) => Math.round(n * 10) / 10;

export const lookupBarcode = onCall(
  {
    cors: true,
    secrets: [USDA_API_KEY],
    timeoutSeconds: 20,
    memory: "256MiB",
  },
  async (req: CallableRequest<{ barcode?: string }>): Promise<LookupBarcodeResponse> => {
    if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
    const uid = req.auth.uid;

    const code = String(req.data?.barcode ?? "").replace(/\D/g, "");
    if (code.length < 6 || code.length > 14) {
      throw new HttpsError("invalid-argument", "That doesn't look like a product barcode.");
    }

    const db = getFirestore();
    const cacheRef = db.collection("barcodeCache").doc(code);
    const cached = await cacheRef.get();
    if (cached.exists) {
      const c = cached.data() as { found: boolean; product?: BarcodeProduct; fetchedAt?: number };
      const age = Date.now() - Number(c.fetchedAt ?? 0);
      if ((c.found && age < BARCODE_HIT_TTL_MS) || (!c.found && age < BARCODE_MISS_TTL_MS)) {
        cacheRef.update({ hits: FieldValue.increment(1) }).catch(() => undefined);
        return { found: c.found, cached: true, product: c.product };
      }
    }

    // Cache miss: these are free APIs, but still count it against the user's
    // daily quota so a client can't hammer them through us.
    await consumeQuota(uid);

    let product: BarcodeProduct | null = null;
    try {
      product = await fetchBarcodeFromOpenFoodFacts(code);
    } catch (err) {
      console.error("[lookupBarcode] OFF error", code, err instanceof Error ? err.message : err);
    }

    if (!product) {
      let usdaKey = "";
      try { usdaKey = USDA_API_KEY.value(); } catch { /* not configured */ }
      if (usdaKey) {
        try {
          product = await fetchBarcodeFromUsda(code, usdaKey);
        } catch (err) {
          console.error("[lookupBarcode] USDA error", code, err instanceof Error ? err.message : err);
        }
      }
    }

    await cacheRef.set({
      found: !!product,
      ...(product ? { product } : {}),
      fetchedAt: Date.now(),
      hits: 0,
    });

    return product ? { found: true, cached: false, product } : { found: false, cached: false };
  },
);

async function fetchBarcodeFromOpenFoodFacts(code: string): Promise<BarcodeProduct | null> {
  const url =
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json` +
    `?fields=code,product_name,product_name_en,brands,serving_size,serving_quantity,nutriments`;
  const res = await fetch(url, {
    method: "GET",
    headers: { "User-Agent": "DingFitness/1.0 (https://dings.fitness; support@dings.fitness)" },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`OFF HTTP ${res.status}`);
  const data = (await res.json()) as { status?: number; product?: any };
  const p = data.product;
  if (data.status !== 1 || !p?.nutriments) return null;

  const n = p.nutriments;
  const kcal = (suffix: "_100g" | "_serving"): number | undefined => {
    const direct = n[`energy-kcal${suffix}`];
    if (direct !== undefined && direct !== "") return Number(direct);
    const kj = n[`energy${suffix}`];
    return kj !== undefined && kj !== "" ? Number(kj) / 4.184 : undefined;
  };
  const block = (suffix: "_100g" | "_serving"): BarcodeMacros | null => {
    const cal = kcal(suffix);
    if (cal === undefined || Number.isNaN(cal)) return null;
    const fiber = n[`fiber${suffix}`];
    return {
      calories: Math.round(cal),
      protein: round1(Number(n[`proteins${suffix}`]) || 0),
      carbs: round1(Number(n[`carbohydrates${suffix}`]) || 0),
      fat: round1(Number(n[`fat${suffix}`]) || 0),
      fiber: fiber !== undefined && fiber !== "" ? round1(Number(fiber)) : undefined,
    };
  };

  const per100g = block("_100g");
  let perServing = block("_serving");
  // Many OFF entries have per-100g data and a serving weight but no
  // per-serving block. Derive it rather than making the user do the math.
  const servingGrams = Number(p.serving_quantity);
  if (!perServing && per100g && servingGrams > 0) {
    const f = servingGrams / 100;
    perServing = {
      calories: Math.round(per100g.calories * f),
      protein: round1(per100g.protein * f),
      carbs: round1(per100g.carbs * f),
      fat: round1(per100g.fat * f),
      fiber: per100g.fiber !== undefined ? round1(per100g.fiber * f) : undefined,
    };
  }
  if (!perServing && !per100g) return null;

  return {
    barcode: code,
    name: String(p.product_name || p.product_name_en || "Unknown product").trim(),
    brand: p.brands ? String(p.brands).split(",")[0].trim() : undefined,
    servingSize: p.serving_size ? String(p.serving_size) : undefined,
    perServing,
    per100g,
    source: "openfoodfacts",
    sourceUrl: `https://world.openfoodfacts.org/product/${code}`,
  };
}

async function fetchBarcodeFromUsda(code: string, apiKey: string): Promise<BarcodeProduct | null> {
  const url =
    `https://api.nal.usda.gov/fdc/v1/foods/search` +
    `?api_key=${encodeURIComponent(apiKey)}` +
    `&query=${encodeURIComponent(code)}` +
    `&pageSize=10`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`USDA HTTP ${res.status}`);
  const data = (await res.json()) as { foods?: any[] };
  // USDA stores GTINs with varying leading zeros (UPC-A vs EAN-13 vs GTIN-14),
  // so compare with leading zeros stripped.
  const bare = code.replace(/^0+/, "");
  const f = (data.foods ?? []).find(x => String(x?.gtinUpc ?? "").replace(/^0+/, "") === bare);
  if (!f) return null;

  const nutrients: Array<{ nutrientId: number; value: number }> = f.foodNutrients ?? [];
  const get = (id: number) => Number(nutrients.find(x => x.nutrientId === id)?.value) || 0;
  const per100g: BarcodeMacros = {
    calories: Math.round(get(USDA_NUTRIENT_IDS.energy)),
    protein: round1(get(USDA_NUTRIENT_IDS.protein)),
    carbs: round1(get(USDA_NUTRIENT_IDS.carbs)),
    fat: round1(get(USDA_NUTRIENT_IDS.fat)),
    fiber: get(USDA_NUTRIENT_IDS.fiber) > 0 ? round1(get(USDA_NUTRIENT_IDS.fiber)) : undefined,
  };

  // Branded search results are per 100 g/ml; scale to the label serving when
  // the serving is expressed in grams or millilitres.
  let perServing: BarcodeMacros | null = null;
  const size = Number(f.servingSize);
  const unit = String(f.servingSizeUnit ?? "").toLowerCase();
  if (size > 0 && (unit === "g" || unit === "ml" || unit === "grm" || unit === "mlt")) {
    const k = size / 100;
    perServing = {
      calories: Math.round(per100g.calories * k),
      protein: round1(per100g.protein * k),
      carbs: round1(per100g.carbs * k),
      fat: round1(per100g.fat * k),
      fiber: per100g.fiber !== undefined ? round1(per100g.fiber * k) : undefined,
    };
  }
  const household = f.householdServingFullText ? `${f.householdServingFullText} ` : "";
  return {
    barcode: code,
    name: String(f.description ?? "Unknown product"),
    brand: f.brandName || f.brandOwner || undefined,
    servingSize: size > 0 ? `${household}(${size} ${unit === "grm" ? "g" : unit === "mlt" ? "ml" : unit})`.trim() : undefined,
    perServing,
    per100g,
    source: "usda",
    sourceUrl: f.fdcId ? `https://fdc.nal.usda.gov/fdc-app.html#/food-details/${f.fdcId}/nutrients` : undefined,
  };
}

// ============================================================================
//  foodWebLookup
// ============================================================================
/**
 * Pass 1 of the food scan: a live web search (gpt-5-search-api) for a named
 * restaurant's dish ('restaurant') or a food USDA/OFF couldn't match
 * ('food'). Returns a short plain-text digest the client injects into the
 * vision call.
 *
 * Results are cached in `foodLookupCache/{hash}`, keyed by kind + a
 * normalized query (lowercased, punctuation and filler words dropped, words
 * sorted), so "Chipotle chicken bowl" and "chicken bowl from chipotle" share
 * one entry and every user after the first gets it instantly and free.
 * Found: 90 days. Not found: 3 days. Cache hits are NOT logged to
 * tokenUsage (no tokens were spent) — the response carries `cached: true`.
 */
const LOOKUP_HIT_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const LOOKUP_MISS_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const LOOKUP_STOPWORDS = new Set([
  "a", "an", "the", "from", "at", "of", "with", "and", "i", "got", "had", "ate",
  "my", "some", "for", "to", "in", "on", "order", "ordered",
]);

function normalizeLookupQuery(q: string): string {
  return q
    .toLowerCase()
    .replace(/['’]s\b/g, "s")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(w => w && !LOOKUP_STOPWORDS.has(w))
    .sort()
    .join(" ");
}

function buildLookupPrompt(q: string, kind: "restaurant" | "food"): string {
  return kind === "restaurant"
    ? `Find published nutrition information for this restaurant order: "${q}".

Search the restaurant's own site and nutrition PDFs first, then reputable nutrition databases that list restaurant items (Nutritionix, FatSecret, MyFitnessPal, CalorieKing). Report ONLY what you actually find, in at most 8 short lines:
- Restaurant name and the site the numbers came from
- Each dish or side you matched, with calories and protein/carbs/fat if published
- Typical portion size or weight if stated
- If you could NOT find real data for this order, say exactly: NO DATA FOUND

Do not guess numbers. Do not pad with general nutrition advice.`
    : `Find published nutrition facts for this food: "${q}".

The USDA and Open Food Facts databases had no match, so search the web: the brand's or manufacturer's own site first, then retailer listings (Target, Walmart, Amazon, Instacart), then reputable nutrition sites (Nutritionix, FatSecret, CalorieKing). Report ONLY what you actually find, in at most 6 short lines:
- The exact product or dish you matched, with brand if any, and the site it came from
- Serving size (with grams if stated)
- Calories, protein, carbs, fat, and fiber per serving
- If you could NOT find real data for this specific food, say exactly: NO DATA FOUND

Do not guess numbers. Do not substitute a different product. Do not pad with general nutrition advice.`;
}

export const foodWebLookup = onCall(
  {
    cors: true,
    secrets: [OPENAI_API_KEY],
    timeoutSeconds: 90,
    memory: "256MiB",
  },
  async (req: CallableRequest<{ query?: string; kind?: string }>): Promise<{ text: string; found: boolean; cached: boolean }> => {
    if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
    const uid = req.auth.uid;

    const query = String(req.data?.query ?? "").trim().slice(0, 300);
    const kind: "restaurant" | "food" = req.data?.kind === "restaurant" ? "restaurant" : "food";
    if (!query) throw new HttpsError("invalid-argument", "Missing `query`.");

    const normalized = normalizeLookupQuery(query);
    const key = createHash("sha256").update(`${kind}:${normalized}`).digest("hex").slice(0, 40);
    const db = getFirestore();
    const cacheRef = db.collection("foodLookupCache").doc(key);

    const cached = await cacheRef.get();
    if (cached.exists) {
      const c = cached.data() as { text?: string; found?: boolean; fetchedAt?: number };
      const age = Date.now() - Number(c.fetchedAt ?? 0);
      if ((c.found && age < LOOKUP_HIT_TTL_MS) || (!c.found && age < LOOKUP_MISS_TTL_MS)) {
        cacheRef.update({ hits: FieldValue.increment(1) }).catch(() => undefined);
        return { text: c.found ? String(c.text ?? "") : "", found: !!c.found, cached: true };
      }
    }

    try {
      await consumeQuota(uid);
    } catch (err) {
      bumpOpsCounter("quotaExhaustedHits").catch(() => undefined);
      throw err;
    }

    const model = "gpt-5-search-api";
    const feature = kind === "restaurant" ? "foodRestaurantLookup" : "foodWebLookup";
    const client = new OpenAI({ apiKey: OPENAI_API_KEY.value() });
    const startTime = Date.now();
    let result;
    try {
      result = await client.chat.completions.create({
        model,
        messages: [{ role: "user", content: buildLookupPrompt(query, kind) }],
        web_search_options: {},
      } as any);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "OpenAI call failed";
      // Logged with the real upstream message: this is the line to look for
      // in Functions logs when lookups "find nothing" suspiciously often.
      console.error("[foodWebLookup] upstream error", uid, feature, msg);
      bumpOpsCounter("upstreamErrors").catch(() => undefined);
      throw new HttpsError("internal", "Web lookup failed.");
    }

    try {
      const usage = (result as any).usage ?? {};
      const promptTokens = Number(usage.prompt_tokens ?? 0);
      const candidatesTokens = Number(usage.completion_tokens ?? 0);
      await logTokenUsage({
        uid,
        userEmail: req.auth.token?.email ?? null,
        feature,
        model,
        promptTokens,
        candidatesTokens,
        totalTokens: Number(usage.total_tokens ?? promptTokens + candidatesTokens),
        costUsd: estimateCostUsd(model, promptTokens, candidatesTokens),
        durationMs: Date.now() - startTime,
      });
    } catch (err) {
      console.error("[foodWebLookup] usage logging failed (non-fatal)", uid, err);
    }

    const raw = String((result as any).choices?.[0]?.message?.content ?? "").trim();
    const found = !!raw && !/NO DATA FOUND/i.test(raw);
    const text = found ? raw.slice(0, 1500) : "";

    await cacheRef.set({
      kind,
      query: query.slice(0, 300),
      normalized,
      found,
      text,
      fetchedAt: Date.now(),
      hits: 0,
    }).catch(err => console.error("[foodWebLookup] cache write failed (non-fatal)", err));

    return { text, found, cached: false };
  },
);

// ═══════════════════════ Fuel Coach GPT API ═══════════════════════
//
// Lets the user's personal Custom GPT ("Fuel Coach") read their LIVE
// remaining macros instead of them pasting numbers manually.
//
// Security model:
//   - createGptKey (onCall, authed): mints a personal bearer key stored
//     at gptKeys/{key} -> { uid }. One active key per user — minting a
//     new one revokes the old. Client rules never touch gptKeys (the
//     default-deny rule covers it); only the Admin SDK reads it.
//   - gptMacros (onRequest): public HTTPS endpoint the GPT Action calls
//     with "Authorization: Bearer <key>". Read-only, returns a compact
//     macro snapshot. No writes, no PII beyond first-name-free numbers.


export const createGptKey = onCall(async (req: CallableRequest): Promise<{ key: string }> => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  const db = getFirestore();

  // Revoke any previous keys — one active key per user.
  const old = await db.collection("gptKeys").where("uid", "==", uid).get();
  const batch = db.batch();
  old.forEach((d) => batch.delete(d.ref));

  const key = "ding_" + randomBytes(24).toString("hex");
  batch.set(db.collection("gptKeys").doc(key), {
    uid,
    createdAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
  return { key };
});

export const gptMacros = onRequest({ cors: true }, async (req, res) => {
  try {
    const header = String(req.headers.authorization || "");
    const key = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!key) {
      res.status(401).json({ error: "Missing Authorization: Bearer <key>" });
      return;
    }

    const db = getFirestore();
    const keyDoc = await db.collection("gptKeys").doc(key).get();
    if (!keyDoc.exists) {
      res.status(403).json({ error: "Invalid or revoked key" });
      return;
    }
    const uid = keyDoc.get("uid") as string;

    const snap = await db.collection("users").doc(uid).get();
    if (!snap.exists) {
      res.status(404).json({ error: "No user data" });
      return;
    }
    const data = snap.data() as Record<string, unknown> & {
      nutritionTargets?: { calories: number; protein: number; carbs: number; fat: number };
      todayLog?: Array<Record<string, unknown>>;
      dailyLogs?: Array<Record<string, unknown>>;
      lastActiveDate?: string;
      profile?: { goal?: string };
    };

    // The app stamps lastActiveDate with the DEVICE's toLocaleDateString().
    // Compute "today" in the caller's timezone (default matches the app's
    // primary user) and only trust todayLog when the dates agree —
    // otherwise it's a stale, not-yet-rolled-over log from a prior day.
    const tz = typeof req.query.tz === "string" ? req.query.tz : "America/Chicago";
    let todayStr: string;
    try {
      todayStr = new Date().toLocaleDateString("en-US", { timeZone: tz });
    } catch {
      todayStr = new Date().toLocaleDateString("en-US");
    }
    const isCurrent = data.lastActiveDate === todayStr;
    const items = isCurrent && Array.isArray(data.todayLog) ? data.todayLog : [];

    const sum = (field: string) =>
      Math.round(items.reduce((s, i) => s + (Number((i as Record<string, unknown>)[field]) || 0), 0));
    const consumed = {
      calories: sum("calories"),
      protein: sum("protein"),
      carbs: sum("carbs"),
      fat: sum("fat"),
    };

    const targets = data.nutritionTargets || null;
    const left = (t: number | undefined, c: number) =>
      typeof t === "number" ? Math.max(0, Math.round(t - c)) : null;

    const last7 = (Array.isArray(data.dailyLogs) ? data.dailyLogs : [])
      .slice(-7)
      .map((l) => {
        const log = l as Record<string, unknown>;
        return {
          date: log.date,
          calories: Math.round(Number(log.caloriesConsumed) || 0),
          protein: Math.round(Number(log.proteinConsumed) || 0),
        };
      });

    res.json({
      date: todayStr,
      timezone: tz,
      goal: data.profile?.goal || null,
      targets,
      consumedToday: consumed,
      remainingToday: targets
        ? {
            calories: left(targets.calories, consumed.calories),
            protein: left(targets.protein, consumed.protein),
            carbs: left(targets.carbs, consumed.carbs),
            fat: left(targets.fat, consumed.fat),
          }
        : null,
      todayItems: items.slice(0, 30).map((i) => {
        const it = i as Record<string, unknown>;
        return {
          name: String(it.name || "item"),
          calories: Math.round(Number(it.calories) || 0),
          protein: Math.round(Number(it.protein) || 0),
        };
      }),
      last7Days: last7,
      note: isCurrent
        ? undefined
        : "Nothing logged yet today — remaining equals the full daily targets.",
    });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});
