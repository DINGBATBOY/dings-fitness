import React, { useEffect, useRef, useState } from 'react';
import { sumMeal, scaleIngredients, validFood, type ReviewFood } from '../../services/foodDraft';

const field = 'mt-1 min-h-12 w-full rounded-xl border border-[var(--ink-mid)]/60 bg-[var(--bg-card)] p-3 text-base';
export type FoodEditorDraft = {
  name: string; amount: string; values: Record<'calories' | 'protein' | 'carbs' | 'fat' | 'fiber', string>;
  amounts: string[]; mode: 'macros' | 'ingredients'; multiplier: string; grams: string;
};
export function FoodEditor({ item, onSave, onBack, initialDraft, onDraftChange }: {
  item?: ReviewFood; onSave: (item: ReviewFood) => void; onBack: () => void;
  initialDraft?: FoodEditorDraft; onDraftChange?: (draft: FoodEditorDraft) => void;
}) {
  const [name, setName] = useState(initialDraft?.name ?? item?.name ?? '');
  const [amount, setAmount] = useState(initialDraft?.amount ?? (item ? `${item.quantity} × (${item.basePortion})` : '1 serving'));
  const [values, setValues] = useState(() => {
    if (initialDraft) return initialDraft.values;
    const totals = item ? sumMeal([item]) : undefined;
    return { calories: totals ? String(totals.calories) : '', protein: totals ? String(totals.protein) : '', carbs: totals ? String(totals.carbs) : '', fat: totals ? String(totals.fat) : '', fiber: totals?.fiber === undefined ? '' : String(totals.fiber) };
  });
  const [ingredients] = useState(() => scaleIngredients(item?.ingredients, item?.quantity ?? 1) ?? []);
  const [amounts, setAmounts] = useState(() => initialDraft?.amounts ?? ingredients.map(i => String(i.grams)));
  const [mode, setMode] = useState<'macros' | 'ingredients'>(initialDraft?.mode ?? 'macros');
  const [error, setError] = useState('');
  const [multiplier, setMultiplier] = useState(initialDraft?.multiplier ?? String(item?.quantity ?? 1));
  const [grams, setGrams] = useState(initialDraft?.grams ?? String((item?.baseGrams ?? 0) * (item?.quantity ?? 1)));
  const draftCallback = useRef(onDraftChange); draftCallback.current = onDraftChange;
  useEffect(() => { draftCallback.current?.({ name, amount, values, amounts, mode, multiplier, grams }); }, [name, amount, values, amounts, mode, multiplier, grams]);
  function applyAmount() {
    const quantity = item?.baseGrams ? Number(grams) / item.baseGrams : Number(multiplier);
    if (!item || !Number.isFinite(quantity) || quantity <= 0) { setError('Enter an amount greater than zero.'); return; }
    onSave({ ...item, quantity });
  }
  return <section className="space-y-5 text-[var(--ink)]">
    <button type="button" onClick={onBack} className="min-h-11 text-base text-[var(--ink-mid)]">{item ? 'Back to review' : 'Back to your food'}</button>
    <h2 className="text-2xl font-bold">{item ? 'Make it yours' : 'Enter your food'}</h2>
    {item && <div className="rounded-2xl border border-white/10 p-4">
      <p className="text-base">Base amount: {item.basePortion}</p>
      {item.baseGrams ? <label className="mt-3 block text-sm">Grams eaten<input className={field} type="number" inputMode="decimal" min="0.01" step="any" value={grams} onChange={e => setGrams(e.target.value)} /></label> : <label className="mt-3 block text-sm">Custom multiplier of base amount<input className={field} type="number" inputMode="decimal" min="0.01" step="any" value={multiplier} onChange={e => setMultiplier(e.target.value)} /></label>}
      <button type="button" className="mt-3 min-h-11 rounded-xl border border-[var(--ink-mid)]/50 px-4" onClick={applyAmount}>Use this amount</button>
    </div>}
    <form className="space-y-4" onSubmit={e => {
      e.preventDefault();
      try {
      const parsed = Object.fromEntries(Object.entries(values).map(([key, raw]) => [key, String(raw).trim() === '' ? undefined : Number(raw)]));
      const parts = mode === 'ingredients' ? ingredients.map((ingredient, i) => {
        const grams = Number(amounts[i]);
        if (amounts[i].trim() === '' || !Number.isFinite(grams) || grams < 0 || ingredient.grams <= 0) throw new Error('Check each ingredient amount.');
        return scaleIngredients([ingredient], grams / ingredient.grams)![0];
      }) : [];
        const base = mode === 'ingredients' ? sumMeal(parts.map((part, i) => ({ id: String(i), name: part.name, base: part, quantity: 1, basePortion: '', evidence: { kind: 'user', summary: '', sources: [] } }))) : parsed as ReviewFood['base'];
        const updated: ReviewFood = {
          id: item?.id || crypto.randomUUID(), name: name.trim(), base, basePortion: amount.trim(), quantity: 1,
          ingredients: mode === 'ingredients' ? parts.filter(i => i.grams > 0) : undefined,
          source: item?.source || 'manual',
          evidence: { kind: 'user', summary: 'Entered or edited by you.', sources: item?.evidence.sources ?? [] },
        };
        if (!amount.trim() || !validFood(updated)) throw new Error('Add a name, amount and nonnegative numbers. Fiber can stay blank.');
        onSave(updated);
      } catch (err) { setError(err instanceof Error ? err.message : 'Check the amounts.'); }
    }}>
      <label className="block text-sm">Food name<input required className={field} value={name} onChange={e => setName(e.target.value)} /></label>
      <label className="block text-sm">Amount these numbers describe<input required className={field} value={amount} onChange={e => setAmount(e.target.value)} placeholder="1 bar (60 g)" /></label>
      {ingredients.length > 0 && <div className="flex flex-wrap gap-2">
        <button type="button" aria-pressed={mode === 'macros'} onClick={() => setMode('macros')} className="min-h-11 rounded-xl border border-[var(--ink-mid)]/50 px-4">Edit totals</button>
        <button type="button" aria-pressed={mode === 'ingredients'} onClick={() => setMode('ingredients')} className="min-h-11 rounded-xl border border-[var(--ink-mid)]/50 px-4">Edit ingredients</button>
      </div>}
      {mode === 'ingredients' ? <div className="space-y-3">{ingredients.map((part, i) => <label key={i} className="block text-sm">{part.name} (grams)<input className={field} type="number" inputMode="decimal" min="0" step="any" value={amounts[i]} onChange={e => setAmounts(prev => prev.map((v, j) => i === j ? e.target.value : v))} /></label>)}<p className="text-sm text-[var(--ink-mid)]">Set an ingredient to 0 to remove it. Totals recalculate from these ingredients.</p></div> : <><div className="grid grid-cols-2 gap-4">{(['calories', 'protein', 'carbs', 'fat', 'fiber'] as const).map(key => <label key={key} className="block text-sm capitalize">{key} {key === 'calories' ? '(kcal)' : '(g)'}<input className={field} required={key !== 'fiber'} type="number" inputMode="decimal" min="0" step="any" value={values[key]} onChange={e => setValues(prev => ({ ...prev, [key]: e.target.value }))} /></label>)}</div><p className="text-sm text-[var(--ink-mid)]">{ingredients.length ? 'Saving totals replaces the ingredient calculation. Your edits become the numbers used.' : 'Use the amount you ate. Leave fiber blank if you dont know it.'}</p></>}
      {error && <p role="alert" className="text-[#e8a85a]">{error}</p>}
      <button type="submit" className="min-h-14 w-full rounded-xl bg-[#d97757] px-4 font-semibold text-[var(--bg-dark)]">Use these numbers</button>
    </form>
  </section>;
}
