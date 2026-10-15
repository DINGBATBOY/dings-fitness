// Ding! Fitness — pre-launch audit: nutrition, calculation and date-handling tests.
//
// Run from the repo root (after `npm ci` and `npm --prefix functions run build`):
//   node --test audit/tests/nutrition-audit.test.mjs
//
// These tests exercise the REAL app modules (constants.tsx, services/foodDraft.ts,
// services/foodCommit.ts, src/utils/adaptiveTDEE.ts, functions/lib/foodJobs.js).
// constants.tsx is .tsx, so it is bundled on the fly with the repo's own esbuild.
//
// Tests named "DEFECT:" assert the CORRECT behavior and are expected to FAIL until
// the matching issue in audit/CRITICAL_ISSUES.md is fixed. Everything else should pass.
// Two helpers (Dashboard's day-shift and MainApp's rollover) are not exported, so they
// are replicated verbatim below and marked REPLICA; keep them in sync or export them.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const esbuild = require(join(root, 'node_modules/esbuild'));

const out = mkdtempSync(join(tmpdir(), 'ding-audit-'));
const entry = join(out, 'entry.ts');
writeFileSync(entry, `
export * from ${JSON.stringify(join(root, 'constants.tsx'))};
export * from ${JSON.stringify(join(root, 'services/foodDraft.ts'))};
export * from ${JSON.stringify(join(root, 'services/foodCommit.ts'))};
export * from ${JSON.stringify(join(root, 'src/utils/adaptiveTDEE.ts'))};
`);
esbuild.buildSync({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: join(out, 'app.mjs'),
  jsx: 'automatic', logLevel: 'silent', nodePaths: [join(root, 'node_modules')] });
const app = await import(pathToFileURL(join(out, 'app.mjs')).href);
const { validateFoodResult } = require(join(root, 'functions/lib/foodJobs.js'));

const kcalFromMacros = m => m.protein * 4 + m.carbs * 4 + m.fat * 9;
const review = (over = {}) => ({ id: 'x', name: 'Chicken breast, cooked', quantity: 1, basePortion: '100 g', baseGrams: 100,
  base: { calories: 165, protein: 31, carbs: 0, fat: 3.6 }, source: 'nutrition_db', confidence: 'high',
  evidence: { kind: 'database', summary: 'USDA', sources: [] }, ...over });
const state = (over = {}) => ({ profile: null, todayLog: [], dailyLogs: [], foodHistory: [], waterIntake: 0, activityBurn: 0,
  lastActiveDate: '10/14/2026', ...over });

// ───────────────────────── 1. Energy / target math ─────────────────────────

test('Mifflin-St Jeor BMR matches the published formula (male, 180 lb, 70 in, 30 y)', () => {
  const r = app.calculateTDEEDetailed(180, 70, 30, 'Sedentary', 'Male');
  const kg = 180 / 2.20462, cm = 70 * 2.54;
  assert.equal(r.bmr, Math.round(10 * kg + 6.25 * cm - 5 * 30 + 5));
  assert.equal(r.tdee, Math.round((10 * kg + 6.25 * cm - 5 * 30 + 5) * 1.2));
  assert.equal(r.formula, 'mifflin-st-jeor');
});

test('Katch-McArdle is used only for plausible body fat (5–60%)', () => {
  assert.equal(app.calculateTDEEDetailed(180, 70, 30, 'Sedentary', 'Male', 20).formula, 'katch-mcardle');
  assert.equal(app.calculateTDEEDetailed(180, 70, 30, 'Sedentary', 'Male', 3).formula, 'mifflin-st-jeor');
  assert.equal(app.calculateTDEEDetailed(180, 70, 30, 'Sedentary', 'Male', 75).formula, 'mifflin-st-jeor');
});

test('typical targets: macro calories reconcile with the calorie target within rounding (±15 kcal)', () => {
  const cases = [
    [180, 70, 30, 'Moderately Active', 'Male', 'Weight Loss'],
    [140, 64, 28, 'Lightly Active', 'Female', 'Body Recomposition'],
    [200, 72, 40, 'Very Active', 'Male', 'Bulk/Hypertrophy'],
  ];
  for (const [w, h, a, act, sex, goal] of cases) {
    const m = app.CALCULATE_MACROS(app.CALCULATE_TDEE(w, h, a, act, sex), goal, w, sex);
    assert.ok(Math.abs(kcalFromMacros(m) - m.calories) <= 15, `${goal}: macros ${kcalFromMacros(m)} vs target ${m.calories}`);
  }
});

test('safety floor holds for every split and goal (female 1200 / male 1500 / 75% TDEE)', () => {
  for (const split of ['balanced', 'low-carb', 'high-protein', 'keto']) {
    const f = app.CALCULATE_MACROS(app.CALCULATE_TDEE(110, 60, 25, 'Sedentary', 'Female'), 'Weight Loss', 110, 'Female', split);
    assert.ok(f.calories >= 1200, `${split} female ${f.calories}`);
    const m = app.CALCULATE_MACROS(app.CALCULATE_TDEE(130, 64, 25, 'Sedentary', 'Male'), 'Weight Loss', 130, 'Male', split);
    assert.ok(m.calories >= 1500, `${split} male ${m.calories}`);
  }
});

test('DEFECT: high body weight — protein is set on total body weight and crowds out fat (ISSUE NUT-01)', () => {
  // 250 lb, 5'2", 60-year-old woman, sedentary, recomp + high-protein split.
  // Observed: 1,639 kcal target with protein 288 g (70% of calories) and fat 22 g (12%).
  const tdee = app.CALCULATE_TDEE(250, 62, 60, 'Sedentary', 'Female');
  const m = app.CALCULATE_MACROS(tdee, 'Body Recomposition', 250, 'Female', 'high-protein');
  const proteinShare = (m.protein * 4) / m.calories, fatShare = (m.fat * 9) / m.calories;
  assert.ok(proteinShare <= 0.40, `protein is ${Math.round(proteinShare * 100)}% of calories (${m.protein} g)`);
  assert.ok(fatShare >= 0.20, `fat is ${Math.round(fatShare * 100)}% of calories (${m.fat} g)`);
});

test('DEFECT: 420 lb user gets a 483 g/day protein target (ISSUE NUT-01)', () => {
  const tdee = app.CALCULATE_TDEE(420, 66, 50, 'Sedentary', 'Female');
  const m = app.CALCULATE_MACROS(tdee, 'Body Recomposition', 420, 'Female', 'high-protein');
  assert.ok(m.protein <= 250, `protein ${m.protein} g/day`);
});

test('energy balance: Health active energy is truth, logged workouts are not added twice', () => {
  const e = app.computeEnergyBalance({ bmr: 1700, activityLevel: 'Sedentary', caloriesEaten: 2000, loggedWorkoutKcal: 300, healthActiveEnergy: 600 });
  assert.equal(e.activeBurn, 600);
  assert.equal(e.tef, 200);
  assert.equal(e.totalBurn, 1700 + 600 + 200);
  const extra = app.computeEnergyBalance({ bmr: 1700, activityLevel: 'Sedentary', caloriesEaten: 0, loggedWorkoutKcal: 300, healthActiveEnergy: 600, healthWorkoutKcal: 100 });
  assert.equal(extra.extra, 200);
  assert.equal(extra.activeBurn, 800);
});

// ───────────────────────── 2. Portion scaling & aggregation ─────────────────

test('logging 100 g, 150 g, 0.5 and 2.5 servings scales every macro linearly', () => {
  for (const q of [1, 1.5, 0.5, 2.5]) {
    const saved = app.toSavedFood(review({ quantity: q }), 'd');
    assert.ok(Math.abs(saved.calories - 165 * q) < 1e-9);
    assert.ok(Math.abs(saved.protein - 31 * q) < 1e-9);
    assert.ok(Math.abs(saved.fat - 3.6 * q) < 1e-9);
  }
});

test('ingredients scale with the portion and still sum to the item total', () => {
  const item = review({ quantity: 2, base: { calories: 300, protein: 20, carbs: 30, fat: 10 },
    ingredients: [{ name: 'a', grams: 100, calories: 200, protein: 10, carbs: 20, fat: 8 }, { name: 'b', grams: 50, calories: 100, protein: 10, carbs: 10, fat: 2 }] });
  const saved = app.toSavedFood(item, 'd');
  const sum = saved.ingredients.reduce((t, i) => t + i.calories, 0);
  assert.equal(sum, saved.calories);
  assert.equal(saved.ingredients[0].grams, 200);
});

test('rejects zero, negative and non-finite quantities and nutrients', () => {
  for (const quantity of [0, -1, NaN, Infinity]) assert.equal(app.validFood(review({ quantity })), false, `quantity ${quantity}`);
  assert.equal(app.validFood(review({ base: { calories: -5, protein: 0, carbs: 0, fat: 0 } })), false);
  assert.throws(() => app.toSavedFood(review({ quantity: 0 }), 'd'));
});

test('zero-calorie product (diet soda) is valid and adds nothing', () => {
  const zero = review({ name: 'Diet soda', base: { calories: 0, protein: 0, carbs: 0, fat: 0 } });
  assert.equal(app.validFood(zero), true);
  const r = app.commitFood(state(), [app.toSavedFood(zero, 'z')], 'Diet soda', '10/14/2026', '10/14/2026');
  assert.equal(r.state.todayLog[0].calories, 0);
});

test('incomplete fiber stays unknown (undefined) instead of becoming a verified 0', () => {
  const t = app.sumMeal([review(), review({ id: 'y', base: { calories: 100, protein: 1, carbs: 20, fat: 1, fiber: 3 } })]);
  assert.equal(t.fiber, undefined);
});

test('extremely large but valid quantity (20 servings) is accepted and scales exactly', () => {
  const saved = app.toSavedFood(review({ quantity: 20 }), 'd');
  assert.equal(saved.calories, 3300);
});

test('adding the same saved food twice from Recent creates two entries (intended re-log)', () => {
  const a = app.toSavedFood(app.fromSavedFood({ id: 'h1', name: 'Oats', calories: 150, protein: 5, carbs: 27, fat: 3, timestamp: '8:00 AM' }), 'draft-a');
  const b = app.toSavedFood(app.fromSavedFood({ id: 'h1', name: 'Oats', calories: 150, protein: 5, carbs: 27, fat: 3, timestamp: '8:00 AM' }), 'draft-b');
  let s = app.commitFood(state(), [a], 'Oats', '10/14/2026', '10/14/2026').state;
  s = app.commitFood(s, [b], 'Oats', '10/14/2026', '10/14/2026').state;
  assert.equal(s.todayLog.length, 2);
  assert.equal(s.foodHistory[0].loggedCount, 2);
});

test('a retried save of the same draft does not double count (idempotent commit)', () => {
  const f = app.toSavedFood(review(), 'draft-1');
  const one = app.commitFood(state(), [f], 'x', '10/14/2026', '10/14/2026');
  const two = app.commitFood(one.state, [f], 'x', '10/14/2026', '10/14/2026');
  assert.equal(two.state.todayLog.length, 1);
});

test('logging to a past day updates that day\'s stored totals exactly', () => {
  const past = { date: '10/12/2026', weight: 0, waterIntake: 0, caloriesConsumed: 500, proteinConsumed: 20, carbsConsumed: 50, fatConsumed: 10, foodItems: [] };
  const r = app.commitFood(state({ dailyLogs: [past] }), [app.toSavedFood(review({ quantity: 1.5 }), 'p')], 'x', '10/12/2026', '10/14/2026');
  const day = r.state.dailyLogs.find(d => d.date === '10/12/2026');
  assert.equal(day.caloriesConsumed, 500 + 247.5);
  assert.equal(day.foodItems.length, 1);
});

test('stored day totals equal the sum of the stored items after several commits', () => {
  let s = state({ lastActiveDate: '10/13/2026' });
  for (let i = 0; i < 5; i++) s = app.commitFood(s, [app.toSavedFood(review({ id: 'i' + i, quantity: 0.5 + i }), 'd' + i)], 'x', '10/13/2026', '10/14/2026').state;
  const day = s.dailyLogs.find(d => d.date === '10/13/2026');
  const sum = day.foodItems.reduce((t, i) => t + i.calories, 0);
  assert.ok(Math.abs(sum - day.caloriesConsumed) < 1e-6, `${sum} vs ${day.caloriesConsumed}`);
});

test('fractional servings produce long floating-point tails (display must round)', () => {
  const totals = app.sumMeal([review({ base: { calories: 513.4, protein: 22.6, carbs: 70.3, fat: 15.2 }, quantity: 1.5 })]);
  // FoodEditor pre-fills inputs with String(totals.calories); this shows the raw value.
  assert.equal(String(totals.calories), '770.0999999999999');
});

// ───────────────────────── 3. AI output validation ─────────────────────────

test('server rejects missing / negative / non-numeric nutrients', () => {
  assert.throws(() => validateFoodResult(JSON.stringify({ items: [{ name: 'x', calories: '100', protein: 1, carbs: 1, fat: 1 }] })));
  assert.throws(() => validateFoodResult(JSON.stringify({ items: [{ name: 'x', calories: 100, protein: -1, carbs: 1, fat: 1 }] })));
  assert.throws(() => validateFoodResult('not json'));
});

test('DEFECT: server accepts calories that contradict the macros by >5x (ISSUE AI-02)', () => {
  const r = () => validateFoodResult(JSON.stringify({ items: [{ name: 'Apple', calories: 4800, protein: 0.5, carbs: 25, fat: 0.3 }] }));
  assert.throws(r, 'implausible item (4800 kcal vs ~105 kcal from macros) should be rejected or flagged');
});

test('DEFECT: server accepts a single item of 50,000 kcal (ISSUE AI-02)', () => {
  assert.throws(() => validateFoodResult(JSON.stringify({ items: [{ name: 'Sandwich', calories: 50000, protein: 2500, carbs: 5000, fat: 2222 }] })));
});

// ───────────────────────── 4. Dates, midnight, timezones ───────────────────

// REPLICA of components/Dashboard.tsx parse/shift (lines 64–66).
const DAY = 86400000;
const parse = d => { const t = new Date(d); t.setHours(0, 0, 0, 0); return t; };
const shift = (d, n) => new Date(parse(d).getTime() + n * DAY).toLocaleDateString();

function inTz(tz, locale, code) {
  return execFileSync(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, TZ: tz, LANG: locale, LC_ALL: locale }, encoding: 'utf8' }).trim();
}

test('DEFECT: day switcher "next day" is stuck on the US fall-back DST day, Nov 1 2026 (ISSUE DATE-01)', () => {
  const code = `const DAY=86400000;const parse=d=>{const t=new Date(d);t.setHours(0,0,0,0);return t};
    const shift=(d,n)=>new Date(parse(d).getTime()+n*DAY).toLocaleDateString('en-US');
    console.log(shift('11/1/2026',1)+'|'+shift('3/15/2027',-1))`;
  const [next, prev] = inTz('America/New_York', 'en_US.UTF-8', code).split('|');
  assert.equal(next, '11/2/2026', `next day after Nov 1 resolved to ${next}`);
  assert.equal(prev, '3/14/2027', `previous day before Mar 15 resolved to ${prev}`);
});

test('DEFECT: non-US date formats break day parsing (en-GB "14/10/2026" → Invalid Date) (ISSUE DATE-02)', () => {
  const code = `const s=new Date(2026,9,14).toLocaleDateString('en-GB');const p=new Date(s);
    const s2=new Date(2026,9,5).toLocaleDateString('en-GB');const p2=new Date(s2);
    console.log(s+'|'+isNaN(p.getTime())+'|'+s2+'|'+p2.getMonth()+'-'+p2.getDate())`;
  const [s, invalid, s2, md] = inTz('Europe/London', 'en_GB.UTF-8', code).split('|');
  assert.equal(invalid, 'false', `${s} could not be parsed back into a date`);
  assert.equal(md, '9-5', `${s2} (5 Oct) parsed back as month-day ${md}`);
});

// REPLICA of MainApp.tsx performRollover (lines 537–606), reduced to the data path.
function rollover(prev, todayStr) {
  const lastDate = prev.lastActiveDate;
  if (!lastDate || lastDate === todayStr) return prev;
  const alreadyArchived = (prev.dailyLogs || []).some(l => l.date === lastDate);
  const log = prev.todayLog || [];
  const had = log.length > 0 || prev.waterIntake > 0 || prev.activityBurn > 0;
  let dailyLogs = prev.dailyLogs || [];
  if (!alreadyArchived && had) dailyLogs = [...dailyLogs, { date: lastDate, caloriesConsumed: log.reduce((a, i) => a + i.calories, 0), foodItems: log }];
  return { ...prev, dailyLogs, todayLog: [], activityBurn: 0, waterIntake: 0, lastActiveDate: todayStr };
}

test('DEFECT: rollover silently drops today\'s food when that date already has an archive (ISSUE DATA-02)', () => {
  // Westward travel across midnight: Oct 15 local becomes Oct 14 again in the new zone.
  // Oct 14 was archived the night before, so the second rollover off Oct 14 discards todayLog.
  const oct14 = { date: '10/14/2026', caloriesConsumed: 1800, foodItems: [{ id: 'a', calories: 1800 }] };
  let s = state({ dailyLogs: [oct14], lastActiveDate: '10/14/2026', todayLog: [{ id: 'dinner', name: 'Dinner', calories: 900 }] });
  s = rollover(s, '10/15/2026');
  const kept = s.dailyLogs.flatMap(d => d.foodItems || []).some(i => i.id === 'dinner');
  assert.ok(kept, 'Dinner (900 kcal) logged on 10/14 disappeared during rollover');
});

test('commitFood rollover merges into an existing archive (the safe path) — contrast with DATA-02', () => {
  const oct14 = { date: '10/14/2026', weight: 0, waterIntake: 0, caloriesConsumed: 1800, proteinConsumed: 0, carbsConsumed: 0, fatConsumed: 0, foodItems: [{ id: 'a', calories: 1800, protein: 0, carbs: 0, fat: 0 }] };
  const dinner = { id: 'dinner', name: 'Dinner', calories: 900, protein: 0, carbs: 0, fat: 0 };
  const s = app.commitFood(state({ dailyLogs: [oct14], todayLog: [dinner] }), [app.toSavedFood(review(), 'n')], 'x', '10/15/2026', '10/15/2026').state;
  assert.ok(s.dailyLogs.find(d => d.date === '10/14/2026').foodItems.some(i => i.id === 'dinner'));
});

// ───────────────────────── 5. Adaptive TDEE ─────────────────────────

test('DEFECT: adaptive TDEE under-reads a steady 1 lb/week loss by ~half (ISSUE NUT-03)', () => {
  // 14 daily weigh-ins losing exactly 1 lb/week while eating 2,000 kcal/day.
  // True TDEE = 2000 + 3500/7 = 2500. With formula TDEE = 2500 the suggestion should be ~0.
  const weighIns = [], logs = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(2026, 8, 1 + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    weighIns.push({ id: iso, date: iso, weight: 200 - i / 7, createdAt: d.toISOString(), source: 'check-in' });
    logs.push({ date: d.toLocaleDateString(), caloriesConsumed: 2000, caloriesBurned: 0 });
  }
  const r = app.computeAdaptiveTDEE({}, logs, 2500, weighIns);
  assert.ok(r.hasEnoughData);
  assert.ok(Math.abs(r.adjustmentKcal) <= 60, `suggested a ${r.adjustmentKcal} kcal change although the formula TDEE is exactly right`);
});
