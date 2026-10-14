import type { FoodItem, FoodIngredient } from '../types';
import type { FoodAnalysisResult } from './geminiService';

export type Macros = { calories: number; protein: number; carbs: number; fat: number; fiber?: number };
export type ReviewFood = {
  id: string;
  name: string;
  base: Macros;
  basePortion: string;
  quantity: number;
  baseGrams?: number;
  ingredients?: FoodIngredient[];
  source?: NonNullable<FoodItem['nutritionEvidence']>['source'];
  confidence?: 'high' | 'medium' | 'low';
  evidence: {
    kind: 'published' | 'label' | 'database' | 'estimate' | 'user';
    summary: string;
    needsCheck?: string;
    sources: { title: string; url: string }[];
  };
};

export function validFood(item: ReviewFood) {
  return !!item.name.trim() && Number.isFinite(item.quantity) && item.quantity > 0 &&
    [item.base.calories, item.base.protein, item.base.carbs, item.base.fat,
      ...(item.base.fiber === undefined ? [] : [item.base.fiber])].every(n => Number.isFinite(n) && n >= 0);
}

export function sumMeal(items: ReviewFood[]): Macros {
  const totals = items.reduce<Macros>((sum, item) => ({
    calories: sum.calories + item.base.calories * item.quantity,
    protein: sum.protein + item.base.protein * item.quantity,
    carbs: sum.carbs + item.base.carbs * item.quantity,
    fat: sum.fat + item.base.fat * item.quantity,
    fiber: (sum.fiber ?? 0) + (item.base.fiber ?? 0) * item.quantity,
  }), { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
  if (items.some(item => item.base.fiber === undefined)) totals.fiber = undefined;
  return totals;
}

export function scaleIngredients(ingredients: FoodIngredient[] | undefined, quantity: number) {
  return ingredients?.map(i => ({ ...i, grams: i.grams * quantity,
    calories: i.calories * quantity, protein: i.protein * quantity,
    carbs: i.carbs * quantity, fat: i.fat * quantity,
    fiber: i.fiber === undefined ? undefined : i.fiber * quantity,
  }));
}

export function fromAnalysis(result: FoodAnalysisResult): ReviewFood[] {
  return result.items.map(item => {
    const source = item.source;
    const kind = source === 'label' ? 'label' : source === 'restaurant_db' ? 'published' : source === 'nutrition_db' ? 'database' : 'estimate';
    const food: ReviewFood = {
      id: crypto.randomUUID(), name: item.name, base: {
        calories: item.calories, protein: item.protein, carbs: item.carbs, fat: item.fat, fiber: item.fiber,
      },
      // Returned macros already include servingsConsumed. 1x always means this analyzed amount.
      basePortion: item.portionNote || (item.servingSize ? `${item.servingsConsumed ?? 1} × ${item.servingSize}` : 'The amount shown or described'),
      quantity: 1, ingredients: item.ingredients, source, confidence: item.confidence,
      evidence: {
        kind,
        summary: source === 'label' ? 'Read from the label. Check the amount.' :
          source === 'restaurant_db' ? 'Menu numbers. Check the portion and extras.' :
          source === 'nutrition_db' ? 'Nutrition reference. Portion estimated.' :
          source === 'web_lookup' ? 'Web-assisted estimate. Check the food and amount.' : 'Estimated from your photo or description.',
        needsCheck: item.uncertainty || (item.confidence === 'low' ? 'I wasnt sure about this food or its amount. Take a look.' : undefined),
        // These are scan-level citations, labeled as such rather than claiming an item match.
        sources: (result.webSources ?? []).flatMap(s => {
          try { const url = new URL(s.url); return ['http:', 'https:'].includes(url.protocol) ? [{ title: `Scan source: ${s.title || url.hostname}`, url: url.href }] : []; }
          catch { return []; }
        }),
      },
    };
    if (!validFood(food)) throw new Error('Some nutrition numbers were missing. Try adding a little more detail.');
    return food;
  });
}

export function fromSavedFood(item: FoodItem): ReviewFood {
  const evidence = item.nutritionEvidence;
  return {
    id: crypto.randomUUID(), name: item.name,
    base: { calories: item.calories, protein: item.protein, carbs: item.carbs, fat: item.fat, fiber: item.fiber },
    basePortion: evidence?.portionNote || 'Your previously logged amount', quantity: 1,
    ingredients: item.ingredients, source: evidence?.source, confidence: evidence?.confidence,
    evidence: {
      kind: evidence?.editedByUser ? 'user' : evidence?.source === 'label' || evidence?.source === 'barcode' ? 'label' : evidence?.source === 'restaurant_db' ? 'published' : 'estimate',
      summary: evidence?.summary || 'Saved numbers. Check the amount before logging again.',
      sources: evidence?.sources ?? [], needsCheck: evidence?.needsCheck,
    },
  };
}

export function toSavedFood(item: ReviewFood, draftId: string): FoodItem {
  if (!validFood(item)) throw new Error('Check the food name and amounts before logging.');
  return {
    id: `${draftId}:${item.id}`, draftId, name: item.name.trim(), ...sumMeal([item]),
    timestamp: new Date().toLocaleTimeString(), ingredients: scaleIngredients(item.ingredients, item.quantity),
    nutritionEvidence: {
      source: item.source, confidence: item.evidence.kind === 'user' ? undefined : item.confidence,
      portionNote: item.quantity === 1 ? item.basePortion : `${item.quantity} × (${item.basePortion})`,
      summary: item.evidence.summary, sources: item.evidence.sources,
      needsCheck: item.evidence.needsCheck, editedByUser: item.evidence.kind === 'user',
    },
  };
}
