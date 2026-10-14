import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { sumMeal, fromAnalysis, fromSavedFood, toSavedFood, validFood } from '../services/foodDraft.ts';
import { commitFood } from '../services/foodCommit.ts';
const require = createRequire(import.meta.url);
const { validateFoodResult } = require('../functions/lib/foodJobs.js');

const fixture = () => ({ id: 'rice', name: 'Rice bowl', quantity: 1, basePortion: '1 bowl',
  base: { calories: 513.4, protein: 22.6, carbs: 70.3, fat: 15.2 },
  ingredients: [{ name: 'Rice', grams: 130, calories: 170, protein: 3, carbs: 37, fat: 0.4 }],
  source: 'visual_estimate', confidence: 'medium',
  evidence: { kind: 'estimate', summary: 'Rice amount estimated.', sources: [] } });

const stateFixture = () => ({ profile: null, todayLog: [], dailyLogs: [], foodHistory: [], waterIntake: 0, activityBurn: 0, lastActiveDate: '10/13/2026' });
test('retrying a save does not duplicate food or increment usual counts', () => {
  const food = toSavedFood(fixture(), 'draft');
  const first = commitFood(stateFixture(), [food], 'Rice', '10/13/2026', '10/13/2026');
  const retry = commitFood(first.state, [food], 'Rice', '10/13/2026', '10/13/2026');
  assert.equal(retry.added.length, 0);
  assert.equal(retry.state.todayLog.length, 1);
  assert.equal(retry.state.foodHistory[0].loggedCount, 1);
});
test('a scan finished after midnight keeps both the previous meal and pending food on their intended day', () => {
  const oldFood = toSavedFood(fixture(), 'old-draft');
  const pending = toSavedFood(fixture(), 'pending-draft');
  const state = { ...stateFixture(), todayLog: [oldFood], waterIntake: 16 };
  const result = commitFood(state, [pending], 'Rice', '10/13/2026', '10/14/2026').state;
  assert.equal(result.todayLog.length, 0);
  assert.equal(result.lastActiveDate, '10/14/2026');
  assert.equal(result.dailyLogs[0].foodItems.length, 2);
  assert.equal(result.dailyLogs[0].caloriesConsumed, oldFood.calories + pending.calories);
  assert.equal(result.dailyLogs[0].waterIntake, 16);
});
test('choosing today after midnight archives old food before adding the new meal', () => {
  const oldFood = toSavedFood(fixture(), 'old-draft');
  const pending = toSavedFood(fixture(), 'pending-draft');
  const result = commitFood({ ...stateFixture(), todayLog: [oldFood] }, [pending], 'Rice', '10/14/2026', '10/14/2026').state;
  assert.equal(result.todayLog[0].id, pending.id);
  assert.equal(result.dailyLogs[0].foodItems[0].id, oldFood.id);
  assert.equal(result.dailyLogs[0].foodItems.length, 1);
});

test('portion toggles always use the original base, without rounding drift', () => {
  const food = fixture();
  for (const quantity of [2, 0.5, 1.5, 1]) {
    assert.equal(sumMeal([{ ...food, quantity }]).calories, food.base.calories * quantity);
  }
  assert.equal(food.ingredients[0].grams, 130);
});
test('saving a composed food does not double-count its ingredients', () => {
  const saved = toSavedFood({ ...fixture(), quantity: 2 }, 'draft-1');
  assert.equal(saved.calories, 1026.8);
  assert.equal(saved.ingredients[0].grams, 260);
  assert.equal(saved.id, 'draft-1:rice');
  assert.equal(saved.nutritionEvidence.portionNote, '2 × (1 bowl)');
});
test('relogging preserves evidence and does not apply the original portion twice', () => {
  const first = toSavedFood({ ...fixture(), quantity: 2 }, 'draft-1');
  const again = toSavedFood(fromSavedFood(first), 'draft-2');
  assert.equal(again.calories, first.calories);
  assert.deepEqual(again.ingredients, first.ingredients);
  assert.equal(again.nutritionEvidence.summary, first.nutritionEvidence.summary);
});
test('unknown fiber remains unknown; true zero remains zero', () => {
  assert.equal(sumMeal([fixture()]).fiber, undefined);
  assert.equal(sumMeal([{ ...fixture(), base: { ...fixture().base, fiber: 0 } }]).fiber, 0);
  assert.equal(sumMeal([fixture(), { ...fixture(), base: { ...fixture().base, fiber: 3 } }]).fiber, undefined);
});
test('zero calorie food can save but negative, missing and nonfinite values cannot', () => {
  const food = { ...fixture(), base: { calories: 0, protein: 0, carbs: 0, fat: 0 } };
  assert.equal(validFood(food), true);
  for (const calories of [-10, NaN, Infinity, undefined]) assert.equal(validFood({ ...food, base: { ...food.base, calories } }), false);
  assert.equal(validFood({ ...food, quantity: 0 }), false);
});
test('analyzed label totals already include servings; client never multiplies them twice', () => {
  const [item] = fromAnalysis({ items: [{ name: 'Milk', calories: 240, protein: 16, carbs: 24, fat: 10, servingsConsumed: 2, servingSize: '1 cup', source: 'label' }], tip: '' });
  assert.equal(toSavedFood(item, 'draft').calories, 240);
  assert.equal(item.basePortion, '2 × 1 cup');
});
test('malformed source links do not break food review or render unsafe schemes', () => {
  const items = [{ name: 'Apple', calories: 90, protein: 0, carbs: 24, fat: 0 }];
  const [food] = fromAnalysis({ items, tip: '', webSources: [{ url: 'javascript:alert(1)' }, { url: 'not a url' }, { url: 'https://example.com/nutrition' }] });
  assert.equal(food.evidence.sources.length, 1);
  assert.equal(food.evidence.sources[0].url, 'https://example.com/nutrition');
});
test('user overrides preserve evidence links but drop model confidence', () => {
  const food = fixture(); food.evidence.kind = 'user';
  const saved = toSavedFood(food, 'draft');
  assert.equal(saved.nutritionEvidence.confidence, undefined);
  assert.equal(saved.nutritionEvidence.editedByUser, true);
});
test('server rejects incomplete or malformed nutrition rather than guessing zeros', () => {
  const valid = { items: [{ name: 'Water', calories: 0, protein: 0, carbs: 0, fat: 0 }] };
  assert.equal(validateFoodResult(JSON.stringify(valid)).items.length, 1);
  for (const calories of [-10, null, '100']) {
    assert.throws(() => validateFoodResult(JSON.stringify({ items: [{ ...valid.items[0], calories }] })));
  }
  assert.throws(() => validateFoodResult(JSON.stringify({ items: [{ name: 'Food' }] })));
  assert.deepEqual(validateFoodResult('{"items":[]}').items, []);
});
