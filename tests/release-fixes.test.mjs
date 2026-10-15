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
const mods = ['services/aiPrivacy.ts', 'services/geminiService.ts', 'constants.tsx', 'services/starterTargets.ts', 'services/dayKey.ts', 'services/foodCommit.ts'];
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

// ───────────────────────── DATE-01 / DATE-02: day keys ─────────────────────────

import { execFileSync } from 'node:child_process';
const appUrl = pathToFileURL(join(out, 'app.mjs')).href;
const inTz = (tz, locale, code) => execFileSync(process.execPath, ['--input-type=module', '-e',
  `const app = await import(${JSON.stringify(appUrl)});\n${code}`],
  { env: { ...process.env, TZ: tz, LANG: locale, LC_ALL: locale }, encoding: 'utf8' }).trim();

test('DATE-01: day navigation steps exactly one calendar day across both 2026/27 US DST changes', () => {
  const out = inTz('America/New_York', 'en_US.UTF-8', `
    const walk = (from, n, step) => { let k = from, seen = []; for (let i = 0; i < n; i++) { k = app.shiftDayKey(k, step); seen.push(k); } return seen; };
    console.log(JSON.stringify({ fwd: walk('10/30/2026', 4, 1), back: walk('3/16/2027', 4, -1),
      add: app.dayKey(app.addDays(new Date(2026, 10, 1), 1)), between: app.daysBetween(new Date(2026, 10, 1), new Date(2026, 10, 2)) }));`);
  const r = JSON.parse(out);
  assert.deepEqual(r.fwd, ['10/31/2026', '11/1/2026', '11/2/2026', '11/3/2026']);
  assert.deepEqual(r.back, ['3/15/2027', '3/14/2027', '3/13/2027', '3/12/2027']);
  assert.equal(r.add, '11/2/2026');
  assert.equal(r.between, 1);
});

test('DATE-01: no millisecond day arithmetic left in the day-navigation code', () => {
  for (const f of ['components/Dashboard.tsx', 'services/coachContext.ts', 'components/ProgressCharts.tsx']) {
    assert.ok(!/86400000|86_400_000|\* DAY\b/.test(src(f)), `${f} still adds 24 h in milliseconds`);
  }
});

test('DATE-02: day keys are locale-independent and parse back in en-GB, de-DE and en-CA', () => {
  for (const [tz, loc] of [['Europe/London', 'en_GB.UTF-8'], ['Europe/Berlin', 'de_DE.UTF-8'], ['America/Vancouver', 'en_CA.UTF-8']]) {
    const r = JSON.parse(inTz(tz, loc, `
      const k = app.dayKey(new Date(2026, 9, 14)), p = app.parseDayKey(k);
      const iso = app.parseDayKey('2026-10-14');
      console.log(JSON.stringify({ k, md: [p.getMonth(), p.getDate()], iso: [iso.getMonth(), iso.getDate()],
        prev: app.shiftDayKey(k, -1), legacyGB: app.normalizeDayKey('14/10/2026'), legacyDE: app.normalizeDayKey('14.10.2026') }));`));
    assert.equal(r.k, '10/14/2026', loc);
    assert.deepEqual(r.md, [9, 14], loc);
    assert.deepEqual(r.iso, [9, 14], `${loc}: ISO keys must parse as LOCAL dates, not UTC`);
    assert.equal(r.prev, '10/13/2026', loc);
    assert.equal(r.legacyGB, '10/14/2026');
    assert.equal(r.legacyDE, '10/14/2026');
  }
});

test('DATE-02: day keys are no longer built with toLocaleDateString() in app code', () => {
  const offenders = clientFiles()
    .filter((f) => !/RecompVelocity|WeeklySummaryCard|design\/|services\/dayKey/.test(f))
    .filter((f) => /\.toLocaleDateString\(\)/.test(src(f).replace(/parseDayKey\([^)]*\)\.toLocaleDateString\(\)/g, '')))
    .filter((f) => !(f === 'MainApp.tsx' && (src(f).match(/\.toLocaleDateString\(\)/g) || []).length === 1)); // saved-note display date
  assert.deepEqual(offenders, []);
});

// ───────────────────────── DATA-02: rollover never drops food ─────────────────────────

const item = (id, calories = 100) => ({ id, name: id, calories, protein: 10, carbs: 10, fat: 2, fiber: 1, timestamp: '' });
const baseState = (over = {}) => ({ profile: null, todayLog: [], dailyLogs: [], foodHistory: [], waterIntake: 0, activityBurn: 0,
  lastActiveDate: '10/14/2026', ...over });

test('DATA-02: rolling over onto a date that already has an archive merges, de-duplicated by id', () => {
  const archived = { date: '10/14/2026', weight: 0, waterIntake: 24, workoutCompleted: false, caloriesConsumed: 1800,
    proteinConsumed: 90, carbsConsumed: 200, fatConsumed: 60, foodItems: [item('a', 1800)] };
  const s = baseState({ dailyLogs: [archived], todayLog: [item('dinner', 900), item('a', 1800)], waterIntake: 8 });
  const { state, archived: did } = app.rolloverDay(s, '10/15/2026');
  const day = state.dailyLogs.find((d) => d.date === '10/14/2026');
  assert.ok(did);
  assert.deepEqual(day.foodItems.map((f) => f.id).sort(), ['a', 'dinner']);
  assert.equal(day.caloriesConsumed, 2700);
  assert.equal(day.waterIntake, 24);
  assert.equal(state.todayLog.length, 0);
  assert.equal(state.lastActiveDate, '10/15/2026');
  assert.equal(state.dailyLogs.filter((d) => d.date === '10/14/2026').length, 1);
  // Idempotent: running it again changes nothing.
  assert.equal(app.rolloverDay(state, '10/15/2026').state, state);
});

test('DATA-02: MainApp uses the shared rollover, not its own', () => {
  const main = src('MainApp.tsx');
  assert.match(main, /rolloverDay\(prev, todayStr\)/);
  assert.ok(!/alreadyArchived/.test(main), 'the old drop-on-already-archived branch is gone');
});

test('DATA-02: a legacy-format key for today is adopted, not archived away', () => {
  const s = baseState({ lastActiveDate: '2026-10-15', todayLog: [item('lunch')] });
  const { state } = app.rolloverDay(s, '10/15/2026');
  assert.equal(state.todayLog.length, 1);
  assert.equal(state.lastActiveDate, '10/15/2026');
});

// ───────────────────────── FUNC-01: edit / delete on past days ─────────────────────────

test('FUNC-01: editing and deleting a past-day food updates that day\'s stored totals', () => {
  const day = { date: '10/12/2026', weight: 0, waterIntake: 0, workoutCompleted: false, caloriesConsumed: 600, proteinConsumed: 60,
    carbsConsumed: 60, fatConsumed: 12, fiberConsumed: 3, foodItems: [item('x', 200), item('y', 200), item('z', 200)] };
  let s = baseState({ dailyLogs: [day], lastActiveDate: '10/14/2026', todayLog: [item('t', 300)] });

  s = app.updateFoodOnDay(s, '10/12/2026', { ...item('y', 500), protein: 40 }, '10/14/2026');
  let d = s.dailyLogs[0];
  assert.equal(d.caloriesConsumed, 900);
  assert.equal(d.proteinConsumed, 90);
  assert.equal(d.foodItems.find((f) => f.id === 'y').calories, 500);

  const { state, removed } = app.removeFoodFromDay(s, '10/12/2026', 'x', '10/14/2026');
  d = state.dailyLogs[0];
  assert.equal(removed.item.id, 'x');
  assert.equal(d.caloriesConsumed, 700);
  assert.deepEqual(d.foodItems.map((f) => f.id), ['y', 'z']);
  assert.equal(state.todayLog.length, 1, "today's log is untouched");

  // Undo puts it back on the same past day, same position, totals restored.
  const back = app.restoreFoodToDay(state, '10/12/2026', removed.item, removed.index, '10/14/2026');
  assert.deepEqual(back.dailyLogs[0].foodItems.map((f) => f.id), ['x', 'y', 'z']);
  assert.equal(back.dailyLogs[0].caloriesConsumed, 900);
});

test('FUNC-01: today goes through the same functions', () => {
  let s = baseState({ todayLog: [item('t1'), item('t2')], lastActiveDate: '10/14/2026' });
  s = app.updateFoodOnDay(s, '10/14/2026', item('t1', 450), '10/14/2026');
  assert.equal(s.todayLog[0].calories, 450);
  const { state } = app.removeFoodFromDay(s, '10/14/2026', 't2', '10/14/2026');
  assert.deepEqual(state.todayLog.map((f) => f.id), ['t1']);
});

test('FUNC-01: past-day food sheets are no longer read-only', () => {
  const main = src('MainApp.tsx');
  assert.ok(!/readOnly=\{!detailFood\?\.editable\}/.test(main));
  assert.match(main, /onOpenFood=\{\(item, date\) => setDetailFood\(\{ item, date \}\)\}/);
  assert.ok(!/readOnly=\{!isToday/.test(src('components/Journal.tsx')));
});

// ───────────────────────── STORE-02 / STORE-03: iOS project ─────────────────────────

test('STORE-02: iPhone-only binary, portrait only', () => {
  const pbx = src('ios/App/App.xcodeproj/project.pbxproj');
  const families = pbx.match(/TARGETED_DEVICE_FAMILY = [^;]+;/g);
  assert.ok(families.length >= 2);
  for (const f of families) assert.equal(f, 'TARGETED_DEVICE_FAMILY = 1;');
  const plist = src('ios/App/App/Info.plist');
  const orient = (key) => plist.split(`<key>${key}</key>`)[1].split('</array>')[0];
  assert.ok(!/Landscape|UpsideDown/.test(orient('UISupportedInterfaceOrientations')));
  assert.ok(!/Landscape|UpsideDown/.test(orient('UISupportedInterfaceOrientations~ipad')));
});

test('STORE-03: PrivacyInfo.xcprivacy exists, declares C617.1 and no tracking, and ships in the App target', () => {
  const manifest = src('ios/App/App/PrivacyInfo.xcprivacy');
  assert.match(manifest, /<key>NSPrivacyTracking<\/key>\s*<false\/>/);
  assert.match(manifest, /NSPrivacyAccessedAPICategoryFileTimestamp<\/string>\s*<key>NSPrivacyAccessedAPITypeReasons<\/key>\s*<array>\s*<string>C617\.1<\/string>/);
  for (const t of ['EmailAddress', 'Name', 'UserID', 'Health', 'Fitness', 'PhotosorVideos', 'OtherUserContent', 'ProductInteraction']) {
    assert.ok(manifest.includes(`NSPrivacyCollectedDataType${t}</string>`), `manifest should declare ${t}`);
  }
  assert.ok(!/<true\/>\s*<key>NSPrivacyCollectedDataTypePurposes/.test(manifest.replace(/NSPrivacyCollectedDataTypeLinked<\/key>\s*<true\/>/g, '')),
    'no data type may be used for tracking');
  const pbx = src('ios/App/App.xcodeproj/project.pbxproj');
  const ref = /(\w{24}) \/\* PrivacyInfo\.xcprivacy \*\/ = \{isa = PBXFileReference;/.exec(pbx);
  assert.ok(ref, 'file reference missing');
  const build = new RegExp(`(\\w{24}) \\/\\* PrivacyInfo\\.xcprivacy in Resources \\*\\/ = \\{isa = PBXBuildFile; fileRef = ${ref[1]}`).exec(pbx);
  assert.ok(build, 'build file missing');
  const resources = pbx.split('/* Begin PBXResourcesBuildPhase section */')[1].split('/* End PBXResourcesBuildPhase section */')[0];
  assert.ok(resources.includes(build[1]), 'not in the App target Resources phase, so it would not ship');
});

// ───────────────────────── SEC-02: Capacitor iOS advisory ─────────────────────────

test('SEC-02: @capacitor/ios and @capacitor/core are 6.2.2+ (GHSA-rvm3-566m-v7fv fixed)', () => {
  const lock = JSON.parse(src('package-lock.json'));
  const ver = (name) => lock.packages[`node_modules/${name}`].version.split('.').map(Number);
  for (const name of ['@capacitor/ios', '@capacitor/core']) {
    const [maj, min, patch] = ver(name);
    assert.ok(maj > 6 || (maj === 6 && (min > 2 || (min === 2 && patch >= 2))), `${name} ${ver(name).join('.')}`);
  }
  assert.deepEqual(ver('@capacitor/ios'), ver('@capacitor/core'), 'keep core and ios in step');
});

// ───────────────────────── LEGAL-01: 18+ ─────────────────────────

test('LEGAL-01: minimum age is 18 in onboarding, sign-up, Terms, Privacy and the in-app legal text', () => {
  const onboarding = src('components/Onboarding.tsx');
  assert.match(onboarding, /draft\.age < 18/);
  assert.match(onboarding, /min=\{18\}/);
  assert.match(src('components/Auth.tsx'), /18 years of age or older/);
  for (const f of ['public/terms/index.html', 'public/privacy/index.html', 'components/LegalModal.tsx']) {
    const text = src(f);
    assert.match(text, /eighteen \(18\)/, f);
    assert.ok(!/thirteen|13 to 17|under 13/i.test(text), `${f} still mentions 13-17 year olds`);
  }
});

// ───────────────────────── SEC-01: AI cost exposure ─────────────────────────

const loadPolicy = (spend = {}) => {
  const docs = { ...spend };
  const writes = [];
  const fs = {
    FieldPath: class { constructor(...p) { this.parts = p; } },
    FieldValue: { increment: (n) => ({ __inc: n }), serverTimestamp: () => 'ts' },
    getFirestore: () => ({
      collection: (c) => ({ doc: (id) => ({
        get: async () => ({ get: (k) => docs[`${c}/${id}`]?.[k] }),
        set: async (v) => { writes.push({ path: `${c}/${id}`, v });
          const cur = docs[`${c}/${id}`] || (docs[`${c}/${id}`] = {});
          for (const [k, val] of Object.entries(v)) cur[k] = val && val.__inc !== undefined ? (cur[k] || 0) + val.__inc : val; },
      }) }),
      getAll: async () => [{ get: () => true }],
    }),
  };
  return { policy: loadFunctionsModule('aiPolicy.js', fs), docs, writes };
};

test('SEC-01: callGemini only accepts the app\'s own features', () => {
  const { policy } = loadPolicy();
  assert.deepEqual(Object.keys(policy.GEMINI_FEATURES).sort(), ['analyzeDailyLog', 'fuelCoachIdeas', 'sendChatMessage']);
  for (const feature of [undefined, '', 'unknown', 'generateOnboardingMacros', 'analyzeWeeklyCalories', '__proto__', 'toString']) {
    assert.throws(() => policy.buildGeminiRequest({ feature, contents: 'hi' }), (e) => e.code === 'invalid-argument', String(feature));
  }
});

test('SEC-01: the server picks the model and tools; client tools, model and extras are ignored', () => {
  const { policy } = loadPolicy();
  const r = policy.buildGeminiRequest({
    feature: 'analyzeDailyLog', model: 'gemini-2.5-pro', contents: 'Analyze this day',
    config: { tools: [{ googleSearch: {} }], responseMimeType: 'text/plain', responseSchema: { type: 'OBJECT' },
      systemInstruction: 'You are a general assistant', safetySettings: [], cachedContent: 'x', maxOutputTokens: 65000 },
  });
  assert.equal(r.model, 'gemini-2.5-flash');
  assert.equal(r.config.tools, undefined, 'no client tools (e.g. Google Search grounding)');
  assert.equal(r.config.systemInstruction, undefined, 'Analyze Day takes no client system instruction');
  assert.equal(r.config.responseMimeType, 'application/json');
  assert.deepEqual(r.config.responseSchema, { type: 'OBJECT' });
  assert.equal(r.config.maxOutputTokens, 2048);
  assert.equal(r.config.safetySettings, undefined);
  assert.equal(r.config.cachedContent, undefined);

  const chat = policy.buildGeminiRequest({ feature: 'sendChatMessage', contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
    config: { systemInstruction: 'coach', tools: [{ codeExecution: {} }] } });
  const names = chat.config.tools[0].functionDeclarations.map((f) => f.name).sort();
  assert.deepEqual(names, ['saveInsight', 'updateUserMetric'], 'chat gets the server-owned coach tools only');
  assert.equal(chat.config.systemInstruction, 'coach');
});

test('SEC-01: Gemini requests are text-only and size-capped', () => {
  const { policy } = loadPolicy();
  const img = [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/jpeg', data: 'AAAA' } }] }];
  assert.throws(() => policy.buildGeminiRequest({ feature: 'sendChatMessage', contents: img }), (e) => e.code === 'invalid-argument');
  const fileRef = [{ role: 'user', parts: [{ text: 'hi', fileData: { fileUri: 'gs://x' } }] }];
  assert.throws(() => policy.buildGeminiRequest({ feature: 'sendChatMessage', contents: fileRef }), (e) => e.code === 'invalid-argument');
  assert.throws(() => policy.buildGeminiRequest({ feature: 'sendChatMessage', contents: [{ role: 'system', parts: [{ text: 'x' }] }] }));
  assert.throws(() => policy.buildGeminiRequest({ feature: 'fuelCoachIdeas', contents: 'x'.repeat(70_000) }), (e) => e.code === 'invalid-argument');
});

test('SEC-01: the global daily spend circuit breaker trips at the cap and reserves calls below it', async () => {
  const day = '2026-10-15';
  const under = loadPolicy({ [`opsSpend/${day}`]: { costUsd: 3, calls: 10 } });
  await under.policy.checkGlobalSpend(day);
  assert.equal(under.docs[`opsSpend/${day}`].calls, 11);
  await under.policy.recordGlobalSpend(day, 0.5);
  assert.equal(under.docs[`opsSpend/${day}`].costUsd, 3.5);

  const over = loadPolicy({ [`opsSpend/${day}`]: { costUsd: 25, calls: 10 } });
  await assert.rejects(over.policy.checkGlobalSpend(day), (e) => e.code === 'resource-exhausted');
  assert.equal(over.docs[`opsSpend/${day}`].breakerTrips, 1);
  const busy = loadPolicy({ [`opsSpend/${day}`]: { costUsd: 0, calls: 3000 } });
  await assert.rejects(busy.policy.checkGlobalSpend(day), (e) => e.code === 'resource-exhausted');
});

test('SEC-01: quota and usage logging go through the breaker; callOpenAI and foodWebLookup are gone', () => {
  const index = src('functions/src/index.ts');
  const quota = index.slice(index.indexOf('async function consumeQuota'));
  assert.ok(quota.indexOf('checkGlobalSpend(today)') > 0 && quota.indexOf('checkGlobalSpend(today)') < quota.indexOf('runTransaction'));
  assert.match(index, /recordGlobalSpend\(today, input\.costUsd\)/);
  assert.ok(!/export const (callOpenAI|foodWebLookup)\b/.test(index));
  const gemini = src('services/geminiService.ts');
  assert.ok(!/["'](callOpenAI|foodWebLookup)["']|lookupFoodOnWeb|analyzeFoodEntryLegacy|functionDeclarations/.test(gemini));
  assert.match(index, /buildGeminiRequest\(req\.data\)/);
  assert.ok(!/data\.config as any|data\.contents as any/.test(index), 'callGemini no longer forwards raw client config');
});

test('SEC-01: App Check is wired on the AI callables but not enforced', () => {
  const index = src('functions/src/index.ts');
  for (const fn of ['callGemini', 'searchNutrition', 'lookupBarcode']) {
    const body = index.slice(index.indexOf(`export const ${fn} = onCall(`)).slice(0, 400);
    assert.match(body, /enforceAppCheck: APP_CHECK_ENFORCED/, fn);
  }
  assert.match(src('functions/src/foodJobs.ts'), /enforceAppCheck: APP_CHECK_ENFORCED/);
  assert.match(src('functions/src/aiPolicy.ts'), /export const APP_CHECK_ENFORCED = false;/);
});

// ───────────────────────── STORE-01: listing matches the food-only binary ─────────────────────────

test('STORE-01: listing copy fits Apple limits and promises no removed features', () => {
  const md = src('APP_STORE_LISTING.md');
  const blocks = [...md.matchAll(/```\n([\s\S]*?)\n```/g)].map((m) => m[1]);
  const [promo, description, keywords] = blocks;
  assert.ok(promo.length <= 170, `promo ${promo.length}`);
  assert.ok(description.length <= 4000, `description ${description.length}`);
  assert.ok(keywords.length <= 100 && !/, /.test(keywords), `keywords ${keywords.length}`);
  const subtitle = /\*\*Subtitle\*\* \| ([^|]+) \|/.exec(md)[1].trim();
  assert.ok(subtitle.length <= 30, subtitle);
  const copy = [promo, description, keywords, subtitle].join('\n');
  assert.ok(!/workout split|7-day split|training plan|training volume|recomp|Personalized Workouts|Fuel tab|Dings tab/i.test(copy));
  assert.ok(!/\bReflect\b/.test(copy), 'the Reflect tab no longer exists');
  assert.match(md, /Override to Higher Age Rating → 18\+/);
  assert.match(md, /No Google Analytics/);
});
