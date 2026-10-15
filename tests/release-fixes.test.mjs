// Regression tests for the v1.0 pre-submission fixes (audit/CRITICAL_ISSUES.md).
//
// Run from the repo root (after `npm --prefix functions run build`):
//   node --test tests/release-fixes.test.mjs
//
// App modules are bundled on the fly with the repo's own esbuild (like
// audit/tests/nutrition-audit.test.mjs). Firebase is replaced by a stub that
// records every callable request, so the tests can inspect exactly what
// would be sent to the Cloud Functions (and on to the AI providers).

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const esbuild = require(join(root, 'node_modules/esbuild'));
const src = (p) => readFileSync(join(root, p), 'utf8');

// Every callable request the bundled client code makes lands here.
globalThis.__calls = [];
globalThis.__reply = () => ({ text: '{}', functionCalls: null });

const stubFirebase = {
  name: 'stub-firebase',
  setup(b) {
    b.onResolve({ filter: /^firebase\/functions$/ }, () => ({ path: 'functions', namespace: 'stub' }));
    b.onResolve({ filter: /^\.\/firebase$|^\.\.\/services\/firebase$/ }, () => ({ path: 'app', namespace: 'stub' }));
    // geminiService only needs the Type enum from the Gemini SDK.
    b.onResolve({ filter: /^@google\/genai$/ }, () => ({ path: 'genai', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({
      loader: 'js',
      contents: a.path === 'genai'
        ? `export const Type = { OBJECT: 'OBJECT', STRING: 'STRING', NUMBER: 'NUMBER', ARRAY: 'ARRAY', BOOLEAN: 'BOOLEAN', INTEGER: 'INTEGER' };`
        : a.path === 'functions'
        ? `export const httpsCallable = (_f, name) => async (req) => {
             globalThis.__calls.push({ name, req });
             return { data: globalThis.__reply(name, req) };
           };`
        : `export const functions = {}; export const db = null; export const auth = null; export const storage = null;`,
    }));
  },
};

const out = mkdtempSync(join(tmpdir(), 'ding-release-'));
const entry = join(out, 'entry.ts');
const mods = ['services/aiPrivacy.ts', 'services/geminiService.ts', 'constants.tsx', 'services/starterTargets.ts'];
writeFileSync(entry, mods.map((m) => `export * from ${JSON.stringify(join(root, m))};`).join('\n'));
await esbuild.build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: join(out, 'app.mjs'),
  jsx: 'automatic', logLevel: 'silent', nodePaths: [join(root, 'node_modules')], plugins: [stubFirebase] });
const app = await import(pathToFileURL(join(out, 'app.mjs')).href);
const lastCall = () => globalThis.__calls[globalThis.__calls.length - 1];
const reset = () => { globalThis.__calls = []; globalThis.__reply = () => ({ text: '{}', functionCalls: null }); };

// ───────────────────────── PRIV-01: Apple Health weight never reaches AI ─────────────────────────

const HEALTH_WEIGHT = 187.3;   // a distinctive number that only exists in Apple Health
const MANUAL_WEIGHT = 192;
const healthWeighIns = [
  { id: 'a', date: '2026-10-01', weight: MANUAL_WEIGHT, createdAt: '2026-10-01T12:00:00.000Z', source: 'check-in' },
  { id: 'b', date: '2026-10-13', weight: HEALTH_WEIGHT, createdAt: '2026-10-13T12:00:00.000Z', source: 'health' },
];
// A profile synced before the fix: Health overwrote profile.weight.
const contaminated = { name: 'Test', age: 34, sex: 'Male', height: 70, weight: HEALTH_WEIGHT, goal: 'Weight Loss',
  activityLevel: 'Moderate', acceptedAiDataSharing: true };

test('PRIV-01: aiSafeWeight never returns an Apple Health weight', () => {
  assert.equal(app.aiSafeWeight(contaminated, healthWeighIns), MANUAL_WEIGHT);
  assert.equal(app.aiSafeWeight({ weight: HEALTH_WEIGHT }, [healthWeighIns[1]]), undefined);
  // A typed profile weight that no Health sample matches is kept.
  assert.equal(app.aiSafeWeight({ weight: 200 }, healthWeighIns), 200);
  assert.equal(app.aiSafeWeight({ weight: 200 }, []), 200);
});

test('PRIV-01: the MainApp weigh-in path no longer copies Health weight into profile.weight', () => {
  const main = src('MainApp.tsx');
  assert.match(main, /profile: prev\.profile && source !== 'health'/);
});

test('PRIV-01: coach chat and Analyze Day prompts built from a Health-synced profile contain no Health weight', async () => {
  reset();
  const safe = app.profileForAi(contaminated, healthWeighIns);
  await app.sendChatMessage([], safe, 'how am I doing?', 'USER DATA');
  const chat = JSON.stringify(lastCall().req);
  assert.ok(!chat.includes(String(HEALTH_WEIGHT)), 'coach prompt leaked the Health weight');
  assert.ok(chat.includes(`${MANUAL_WEIGHT} lbs`));

  globalThis.__reply = () => ({ text: '{"summary":"","positives":[],"improvements":[],"recommendations":[],"progressScore":50}', functionCalls: null });
  const log = { date: '10/14/2026', caloriesConsumed: 1500, proteinConsumed: 100, carbsConsumed: 150, fatConsumed: 50,
    waterIntake: 40, caloriesBurned: 0, foodItems: [] };
  await app.analyzeDailyLog(log, app.profileForAi({ ...contaminated }, [healthWeighIns[1]]), { calories: 2000, protein: 150, carbs: 200, fat: 60 });
  const day = JSON.stringify(lastCall().req);
  assert.ok(!day.includes(String(HEALTH_WEIGHT)), 'Analyze Day leaked the Health weight');
  assert.ok(day.includes('not shared'));
});

test('PRIV-01: no remaining client prompt interpolates profile.weight without the AI-safe path', () => {
  const gemini = src('services/geminiService.ts');
  // Every place that prints the profile weight must handle the "not shared" case.
  const safeForm = "${profile.weight ? `${profile.weight} lbs` : 'not shared'}";
  const raw = gemini.split(safeForm).join('').match(/\$\{profile\.weight\}/g) || [];
  assert.equal(raw.length, 0, 'found a raw ${profile.weight} in a prompt');
  assert.ok(!/generateVisionRoadmap|generateMealSuggestion/.test(gemini), 'unused weight-sending prompts were removed');
});

// ───────────────────────── PRIV-02: AI consent everywhere ─────────────────────────

// Load a compiled functions module with firebase-admin/firestore replaced by a fake.
function loadFunctionsModule(file, fakeFirestore) {
  const Module = require('node:module');
  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'firebase-admin/firestore') return fakeFirestore;
    return origLoad.call(this, request, parent, isMain);
  };
  try {
    const path = require.resolve(join(root, 'functions/lib', file));
    delete require.cache[path];
    return require(path);
  } finally {
    Module._load = origLoad;
  }
}
const fakeUsers = (users) => {
  const reads = [];
  return {
    reads,
    FieldPath: class { constructor(...parts) { this.parts = parts; } },
    FieldValue: { increment: (n) => ({ inc: n }), serverTimestamp: () => 'ts' },
    getFirestore: () => ({
      collection: () => ({ doc: (id) => ({ id }) }),
      getAll: async (ref, opts) => {
        reads.push({ id: ref.id, mask: opts?.fieldMask?.map((f) => f.parts.join('.')) });
        const profile = users[ref.id];
        return [{ get: (field) => (field === 'profile.acceptedAiDataSharing' ? profile?.acceptedAiDataSharing : undefined) }];
      },
    }),
  };
};

test('PRIV-02: server consent check reads only the consent field and rejects without consent', async () => {
  const fs = fakeUsers({ yes: { acceptedAiDataSharing: true }, no: { acceptedAiDataSharing: false } });
  const policy = loadFunctionsModule('aiPolicy.js', fs);
  assert.equal(await policy.hasAiConsent('yes'), true);
  assert.equal(await policy.hasAiConsent('no'), false);
  assert.equal(await policy.hasAiConsent('missing'), false);
  await assert.rejects(policy.requireAiConsent('no'), (e) => e.code === 'failed-precondition');
  assert.deepEqual(fs.reads[0].mask, ['profile.acceptedAiDataSharing']);
});

test('PRIV-02: callGemini and startFoodAnalysis check consent before spending quota', () => {
  const index = src('functions/src/index.ts');
  const body = index.slice(index.indexOf('export const callGemini = onCall('));
  const consentAt = body.indexOf('await requireAiConsent(uid)');
  assert.ok(consentAt > 0, 'callGemini must call requireAiConsent');
  assert.ok(consentAt < body.indexOf('consumeQuota(uid)'), 'consent must be checked before quota');
  const jobs = src('functions/src/foodJobs.ts');
  assert.ok(jobs.indexOf('requireAiConsent(uid') < jobs.indexOf('config.consumeQuota(uid)'));
});

test('PRIV-02: every client entry point that calls Gemini goes through requireAiConsent', () => {
  const aiCalls = /\b(sendChatMessage|analyzeDailyLog|generateFuelIdeas)\(/;
  const entryPoints = {
    'MainApp.tsx': /requireAiConsent\(\(\) => \{ handleSendMessage\(\); \}\)/,
    'components/Journal.tsx': /requireAiConsent\(\(\) => \{ void runAnalyze\(\); \}\)/,
    'components/FuelCoachSheet.tsx': /requireAiConsent\(\(\) => \{ void fetchIdeas\(\); \}\)/,
  };
  for (const [file, gate] of Object.entries(entryPoints)) {
    const code = src(file);
    assert.ok(aiCalls.test(code), `${file} should contain an AI call`);
    assert.match(code, gate, `${file} must gate its AI call behind requireAiConsent`);
  }
  // Onboarding no longer calls any AI (NUT-02): checked in the NUT-02 tests.
});

// ───────────────────────── PRIV-03 / FEAT-01 ─────────────────────────

import { readdirSync, statSync } from 'node:fs';
const clientFiles = () => {
  const outFiles = [];
  const walk = (dir) => {
    for (const name of readdirSync(join(root, dir))) {
      const rel = dir ? `${dir}/${name}` : name;
      if (['node_modules', 'dist', '.git', 'functions', 'ios', 'audit', 'tests', 'plugins', 'app-store', '.firebase'].includes(rel)) continue;
      const st = statSync(join(root, rel));
      if (st.isDirectory()) walk(rel);
      else if (/\.(tsx?|jsx?)$/.test(name)) outFiles.push(rel);
    }
  };
  walk('');
  return outFiles;
};

test('PRIV-03: no Google Analytics in the client (the privacy policy says there are no analytics)', () => {
  const offenders = clientFiles().filter((f) => /firebase\/analytics|getAnalytics\(|gtag\(|MEASUREMENT_ID/.test(src(f)));
  assert.deepEqual(offenders, []);
});

test('FEAT-01: the Fuel Coach GPT key is admin-only in the UI and on the server', () => {
  const main = src('MainApp.tsx');
  const btn = main.indexOf('Fuel Coach GPT key');
  const gate = main.lastIndexOf('{isAdminUser(userId) && (', btn);
  assert.ok(gate > 0 && btn - gate < 400, 'GPT key button must sit inside an isAdminUser block');
  const index = src('functions/src/index.ts');
  const fn = index.slice(index.indexOf('export const createGptKey'));
  assert.match(fn.slice(0, 600), /OPS_ADMIN_UIDS\.has\(uid\)/);
});

// ───────────────────────── NUT-02: onboarding targets are local ─────────────────────────

test('NUT-02: onboarding targets equal CALCULATE_MACROS for the same profile (no LLM arithmetic)', () => {
  const p = { name: 'A', weight: 180, height: 70, age: 30, sex: 'Male', activityLevel: 'Moderately Active',
    goal: 'Weight Loss', bodyFat: 18 };
  const t = app.computeProfileTargets(p);
  const tdee = app.CALCULATE_TDEE(180, 70, 30, 'Moderately Active', 'Male', 18);
  const m = app.CALCULATE_MACROS(tdee, 'Weight Loss', 180, 'Male', 'balanced', undefined, 18);
  assert.deepEqual({ c: t.calories, p: t.protein, cb: t.carbs, f: t.fat }, { c: m.calories, p: m.protein, cb: m.carbs, f: m.fat });
  // Same profile through the Edit Profile path gives the same numbers (no jump on first Save).
  const again = app.computeProfileTargets({ ...p });
  assert.equal(again.calories, t.calories);
  assert.ok(typeof app.starterCoachMessage(p.goal, t) === 'string');
});

test('NUT-02: onboarding sends nothing to an AI provider', () => {
  const onboarding = src('components/Onboarding.tsx');
  assert.ok(!/geminiService|httpsCallable|callGemini/.test(onboarding));
  assert.ok(!/generateOnboardingMacros/.test(src('services/geminiService.ts')));
});

// ───────────────────────── NUT-01: protein basis, cap and fat floor ─────────────────────────

test('NUT-01: across weights, goals and splits protein ≤ 40% / 250 g, fat ≥ 25%, macros add up', () => {
  const goals = ['Weight Loss', 'Body Recomposition', 'Lean/Athletic', 'Bulk/Hypertrophy', 'Performance'];
  for (const w of [110, 150, 200, 250, 320, 420]) for (const sex of ['Male', 'Female']) for (const goal of goals)
    for (const split of ['balanced', 'low-carb', 'high-protein', 'keto']) {
      const tdee = app.CALCULATE_TDEE(w, 66, 45, 'Sedentary', sex);
      const m = app.CALCULATE_MACROS(tdee, goal, w, sex, split);
      const label = `${w} lb ${sex} ${goal} ${split}`;
      assert.ok(m.protein * 4 <= m.calories * 0.40 + 0.5, `${label}: protein ${m.protein} g`);
      assert.ok(m.protein <= 250, `${label}: protein ${m.protein} g`);
      assert.ok(m.fat * 9 >= m.calories * 0.25 - 9, `${label}: fat ${m.fat} g of ${m.calories}`);
      assert.ok(m.carbs >= 0);
      assert.ok(Math.abs(m.protein * 4 + m.carbs * 4 + m.fat * 9 - m.calories) <= 6, `${label}: macros don't add up`);
    }
});

test('NUT-01: protein follows goal weight and lean mass, not total weight', () => {
  const tdee = app.CALCULATE_TDEE(300, 66, 40, 'Very Active', 'Female');
  const plain = app.CALCULATE_MACROS(tdee, 'Weight Loss', 300, 'Female');
  const withGoal = app.CALCULATE_MACROS(tdee, 'Weight Loss', 300, 'Female', 'balanced', { targetWeightLbs: 180 });
  const withBf = app.CALCULATE_MACROS(tdee, 'Weight Loss', 300, 'Female', 'balanced', undefined, 45);
  assert.equal(withGoal.protein, Math.min(Math.round(180 * 0.85), Math.floor(withGoal.calories * 0.4 / 4)));
  assert.ok(withBf.protein < plain.protein);
  // A lean, typical user is unchanged by the guard rails: 180 lb man, 0.85 g/lb.
  const lean = app.CALCULATE_MACROS(app.CALCULATE_TDEE(180, 70, 30, 'Moderately Active', 'Male'), 'Weight Loss', 180, 'Male');
  assert.equal(lean.protein, 153);
});
