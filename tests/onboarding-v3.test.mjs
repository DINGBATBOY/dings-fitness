// Onboarding v3 (Oct 31, 2026): "how and why do you track", pace, maintain,
// tracking style. Run: node --test tests/onboarding-v3.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(root, p), 'utf8');
const out = mkdtempSync(join(tmpdir(), 'ding-onb-'));
const entry = join(out, 'entry.ts');
writeFileSync(entry, ['constants.tsx', 'services/starterTargets.ts'].map((m) => `export * from ${JSON.stringify(join(root, m))};`).join('\n'));
await esbuild.build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: join(out, 'app.mjs'),
  jsx: 'automatic', logLevel: 'silent', nodePaths: [join(root, 'node_modules')] });
const app = await import(pathToFileURL(join(out, 'app.mjs')).href);

const base = { weight: 180, height: 70, age: 30, sex: 'Male', activityLevel: 'Moderately Active' };

test('Maintain eats at maintenance', () => {
  const t = app.computeProfileTargets({ ...base, goal: 'Maintain' });
  assert.equal(t.calories, t.tdee);
  assert.equal(t.floorApplied, false);
});

test('pace sets the loss/gain delta and the three paces are ordered', () => {
  const tdee = app.computeProfileTargets({ ...base, goal: 'Maintain' }).tdee;
  const loss = ['gentle', 'steady', 'faster'].map((pace) => app.computeProfileTargets({ ...base, goal: 'Weight Loss', goalPace: pace }).calories);
  assert.ok(loss[0] > loss[1] && loss[1] > loss[2], `loss ${loss}`);
  // steady = 0.5 %/week of 180 lb = 0.9 lb/week = 450 kcal/day
  assert.equal(tdee - loss[1], 450);
  const gain = ['gentle', 'steady', 'faster'].map((pace) => app.computeProfileTargets({ ...base, goal: 'Bulk/Hypertrophy', goalPace: pace }).calories);
  assert.deepEqual(gain.map((c) => c - tdee), [125, 250, 375]);
  // No pace: unchanged legacy behaviour (flat -600 for Weight Loss).
  assert.equal(tdee - app.computeProfileTargets({ ...base, goal: 'Weight Loss' }).calories, 600);
});

test('pace never undercuts the safety floor', () => {
  const t = app.computeProfileTargets({ weight: 110, height: 60, age: 60, sex: 'Female', activityLevel: 'Sedentary', goal: 'Weight Loss', goalPace: 'faster' });
  assert.ok(t.calories >= app.getMinSafeCalories('Female', t.tdee));
});

test('timelineFor is what every CALCULATE_MACROS caller uses', () => {
  assert.equal(app.timelineFor({}), undefined);
  assert.deepEqual(app.timelineFor({ goalPace: 'gentle' }), { targetWeightLbs: undefined, targetDate: undefined, pace: 'gentle' });
  const main = src('MainApp.tsx');
  assert.equal((main.match(/timelineFor\(/g) || []).length, 3, 'dashboard fallback, adaptive accept, Edit Profile');
  assert.ok(!/targetWeightLbs: (appState\.profile|newProfile)\.goalTargetWeight/.test(main));
});

test('macro guard rails hold for Maintain and every pace', () => {
  for (const w of [120, 180, 260, 400]) for (const goal of ['Maintain', 'Weight Loss', 'Bulk/Hypertrophy'])
    for (const goalPace of [undefined, 'gentle', 'steady', 'faster']) for (const macroSplit of ['balanced', 'high-protein', 'low-carb', 'keto']) {
      const m = app.computeProfileTargets({ ...base, weight: w, goal, goalPace, macroSplit });
      const label = `${w} ${goal} ${goalPace} ${macroSplit}`;
      assert.ok(m.protein * 4 <= m.calories * 0.4 + 0.5, label);
      assert.ok(m.fat * 9 >= m.calories * 0.25 - 9, label);
      assert.ok(Math.abs(m.protein * 4 + m.carbs * 4 + m.fat * 9 - m.calories) <= 6, label);
    }
});

test('onboarding asks why and how before weight, offers a no-target mode, and stays local', () => {
  const o = src('components/Onboarding.tsx');
  const order = ["{step === 'why' &&", "{step === 'how' &&", "{step === 'direction' &&", "{step === 'body' &&"].map((k) => o.indexOf(k));
  assert.ok(order.every((i, n) => i > 0 && (n === 0 || i > order[n - 1])), `step order ${order}`);
  for (const id of ['macros', 'calories', 'protein', 'log']) assert.match(o, new RegExp(`id: '${id}'`));
  assert.match(o, /I have my own numbers/);
  assert.match(o, /National Alliance for Eating Disorders/);
  assert.ok(!/geminiService|httpsCallable|callGemini/.test(o));
  // Home honours the style.
  const d = src('components/Dashboard.tsx');
  assert.match(d, /profile\.trackingStyle \|\| 'macros'/);
  assert.match(d, /style === 'log'/);
});
