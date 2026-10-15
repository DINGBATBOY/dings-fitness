/**
 * Server-side AI policy shared by the AI callables (audit PRIV-02, SEC-01).
 *
 * 1. Consent: Guideline 5.1.2(i) needs explicit permission before personal
 *    data goes to a third-party AI. The client shows a one-time sheet and
 *    stores `profile.acceptedAiDataSharing`; the server re-checks it on every
 *    AI call so an old build or a hand-made request can't skip the sheet.
 * 2. callGemini is not a general-purpose proxy: only the app's own features
 *    are accepted, the server picks the model and the tools, and requests are
 *    text-only and size-capped.
 * 3. A global daily spend circuit breaker caps the whole app's AI bill, on
 *    top of the per-user daily quota.
 * 4. App Check is wired but NOT enforced yet (APP_CHECK_ENFORCED = false).
 */
import { getFirestore, FieldPath, FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { Type } from '@google/genai';

// ─────────────────────────── 1. Consent ───────────────────────────

export const AI_CONSENT_FIELD = 'profile.acceptedAiDataSharing';

/** True when users/{uid} has accepted AI data sharing. Reads one field, not the whole (large) user doc. */
export async function hasAiConsent(uid: string): Promise<boolean> {
  const ref = getFirestore().collection('users').doc(uid);
  const [snap] = await getFirestore().getAll(ref, { fieldMask: [new FieldPath('profile', 'acceptedAiDataSharing')] });
  return snap?.get(AI_CONSENT_FIELD) === true;
}

export async function requireAiConsent(uid: string, message = 'Allow AI features first.'): Promise<void> {
  if (!(await hasAiConsent(uid))) throw new HttpsError('failed-precondition', message);
}

// ─────────────────────────── 2. callGemini allowlist ───────────────────────────

export const GEMINI_MODEL = 'gemini-2.5-flash';

/** Coach chat tools. Owned by the server; whatever `tools` the client sends is ignored. */
const COACH_TOOLS = [{
  functionDeclarations: [
    {
      name: 'saveInsight',
      description: 'Save a key piece of advice, a rule, or a motivation quote to the users notes.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: 'Short title for the note' },
          content: { type: Type.STRING, description: 'The insight or advice to save' },
        },
        required: ['title', 'content'],
      },
    },
    {
      name: 'updateUserMetric',
      description: 'Update the users physical metrics (current weight or body fat percentage) when they report a change.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          metric: { type: Type.STRING, enum: ['weight', 'bodyFat'], description: 'The metric to update.' },
          value: { type: Type.NUMBER, description: 'The new value (e.g., 195 for 195lbs).' },
        },
        required: ['metric', 'value'],
      },
    },
  ],
}];

interface FeaturePolicy {
  /** Client may send a system instruction. */
  systemInstruction: boolean;
  /** Client may ask for JSON with a response schema. */
  json: boolean;
  /** Server-owned tool declarations. */
  tools?: unknown[];
  maxOutputTokens: number;
}

/** The only Gemini features the app has. Anything else is rejected. */
export const GEMINI_FEATURES: Record<string, FeaturePolicy> = {
  sendChatMessage: { systemInstruction: true, json: false, tools: COACH_TOOLS, maxOutputTokens: 2048 },
  analyzeDailyLog: { systemInstruction: false, json: true, maxOutputTokens: 2048 },
  fuelCoachIdeas: { systemInstruction: false, json: true, maxOutputTokens: 4096 },
};

const MAX_PROMPT_CHARS = 60_000;      // all text parts + system instruction
const MAX_TURNS = 60;
const MAX_SCHEMA_BYTES = 8_000;

const bad = (msg: string): never => { throw new HttpsError('invalid-argument', msg); };

/** Text-only contents: a string, or [{ role: 'user' | 'model', parts: [{ text }] }]. */
function sanitizeContents(contents: unknown): { contents: unknown; chars: number } {
  if (typeof contents === 'string') {
    if (!contents.trim()) bad('Missing prompt.');
    return { contents, chars: contents.length };
  }
  if (!Array.isArray(contents) || contents.length === 0 || contents.length > MAX_TURNS) bad('Invalid conversation.');
  let chars = 0;
  const clean = (contents as unknown[]).map((turn) => {
    const t = turn as { role?: unknown; parts?: unknown };
    if (t?.role !== 'user' && t?.role !== 'model') bad('Invalid conversation.');
    if (!Array.isArray(t.parts) || t.parts.length === 0 || t.parts.length > 8) bad('Invalid conversation.');
    const parts = (t.parts as unknown[]).map((part) => {
      const keys = part && typeof part === 'object' ? Object.keys(part) : [];
      const text = (part as { text?: unknown })?.text;
      // Text only: no images, files, function responses or code execution.
      if (keys.length !== 1 || typeof text !== 'string') bad('Only text is allowed here.');
      chars += (text as string).length;
      return { text: text as string };
    });
    return { role: t.role, parts };
  });
  return { contents: clean, chars };
}

/**
 * Build the generateContent request from what the client sent. The server
 * decides the model and tools; the client's `model`, `tools`, safety
 * settings, cached content and anything else are ignored.
 */
export function buildGeminiRequest(data: unknown): { feature: string; model: string; contents: unknown; config: Record<string, unknown> } {
  const d = (data && typeof data === 'object' ? data : {}) as { feature?: unknown; contents?: unknown; config?: unknown };
  const feature = typeof d.feature === 'string' ? d.feature : '';
  const policy = Object.prototype.hasOwnProperty.call(GEMINI_FEATURES, feature) ? GEMINI_FEATURES[feature] : undefined;
  if (!policy) bad('Unknown AI feature.');
  const { contents, chars } = sanitizeContents(d.contents);
  const clientConfig = (d.config && typeof d.config === 'object' ? d.config : {}) as Record<string, unknown>;
  const config: Record<string, unknown> = { maxOutputTokens: policy!.maxOutputTokens };
  let total = chars;

  if (policy!.systemInstruction && clientConfig.systemInstruction !== undefined) {
    if (typeof clientConfig.systemInstruction !== 'string') bad('Invalid instructions.');
    total += (clientConfig.systemInstruction as string).length;
    config.systemInstruction = clientConfig.systemInstruction;
  }
  if (policy!.json) {
    config.responseMimeType = 'application/json';
    const schema = clientConfig.responseSchema;
    if (schema !== undefined) {
      if (!schema || typeof schema !== 'object' || JSON.stringify(schema).length > MAX_SCHEMA_BYTES) bad('Invalid response schema.');
      config.responseSchema = schema;
    }
  }
  if (policy!.tools) config.tools = policy!.tools;
  if (total > MAX_PROMPT_CHARS) bad('That request is too long.');
  return { feature, model: GEMINI_MODEL, contents, config };
}

// ─────────────────────────── 3. Global spend circuit breaker ───────────────────────────

/**
 * Whole-app ceiling per UTC day, across every user and both providers.
 * When either is reached, every AI callable returns resource-exhausted
 * until midnight UTC. Raise them here (and redeploy) as usage grows.
 * Cost is the tokenUsage estimate, so it lags by one call; the call
 * count is reserved up front.
 */
export const GLOBAL_DAILY_SPEND_USD = 25;
export const GLOBAL_DAILY_AI_CALLS = 3000;
export const SPEND_COLLECTION = 'opsSpend';

/** Throws resource-exhausted when today's app-wide AI spend or call count is at the cap; otherwise reserves one call. */
export async function checkGlobalSpend(today: string): Promise<void> {
  const ref = getFirestore().collection(SPEND_COLLECTION).doc(today);
  const snap = await ref.get();
  const costUsd = Number(snap.get('costUsd')) || 0;
  const calls = Number(snap.get('calls')) || 0;
  if (costUsd >= GLOBAL_DAILY_SPEND_USD || calls >= GLOBAL_DAILY_AI_CALLS) {
    await ref.set({ breakerTrips: FieldValue.increment(1), lastTripAt: FieldValue.serverTimestamp() }, { merge: true }).catch(() => undefined);
    throw new HttpsError('resource-exhausted', 'AI features are paused for today. Please try again tomorrow.');
  }
  await ref.set({ calls: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

/** Add a finished call's estimated cost to today's app-wide total. */
export async function recordGlobalSpend(today: string, costUsd: number): Promise<void> {
  if (!Number.isFinite(costUsd) || costUsd <= 0) return;
  await getFirestore().collection(SPEND_COLLECTION).doc(today)
    .set({ costUsd: FieldValue.increment(costUsd), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

// ─────────────────────────── 4. App Check (prepared, not enforced) ───────────────────────────

/**
 * Flip to true only after (a) App Attest + reCAPTCHA Enterprise are
 * registered in the Firebase console, (b) the shipping iOS build sends App
 * Check tokens, and (c) the `appCheckMissing` ops counter has stayed near
 * zero for real traffic. See HANDOFF.md "App Check".
 */
export const APP_CHECK_ENFORCED = false;
