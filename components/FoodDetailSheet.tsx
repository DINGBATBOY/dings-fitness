/**
 * FoodDetailSheet — drill-in view for a single logged FoodItem.
 *
 * Two modes, decided from the item's `ingredients` field:
 *
 *   1. Ingredient-based item (AI-scanned meal):
 *      • Header shows the meal name and current totals.
 *      • One editable row per ingredient — grams input scales macros
 *        proportionally when changed; trash button removes the ingredient.
 *      • Totals recompute live from the ingredients.
 *
 *   2. Single-item log (manual entry, restaurant DB, single-food photo):
 *      • Header + 4 macro inputs (calories, protein, carbs, fat) + fiber.
 *      • User can edit macros directly.
 *
 * Save writes the mutated item back through the parent handler; Delete
 * removes the item entirely.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Trash2, Check, Utensils } from 'lucide-react';
import type { FoodItem, FoodIngredient } from '../types';

// Palette matches FuelHome.
const C = {
  bg: '#161210',
  card: '#1d1815',
  cardSoft: '#221d19',
  border: 'rgba(255,255,255,0.06)',
  borderStrong: 'rgba(255,255,255,0.10)',
  ink: '#f5ede1',
  inkMid: '#c4b8a4',
  inkLight: '#8b7e6e',
  fire: '#d97757',
  ochre: '#e8a85a',
  emerald: '#7ab896',
  sky: '#6fa8c4',
  protein: '#7ab896',
  fatColor: '#d97757',
  carbColor: '#e8a85a',
  danger: '#e3614a',
};

interface FoodDetailSheetProps {
  /** The item being drilled into. Null → sheet is closed. */
  item: FoodItem | null;
  /** Called with the updated item when the user saves. */
  onSave: (updated: FoodItem) => void;
  /** Called when the user wants to remove the entire item. */
  onDelete: (itemId: string) => void;
  onClose: () => void;
  /** Read-only for archived days (past logs). Editing disabled. */
  readOnly?: boolean;
}

export const FoodDetailSheet: React.FC<FoodDetailSheetProps> = ({
  item,
  onSave,
  onDelete,
  onClose,
  readOnly = false,
}) => {
  // Ingredient-mode draft: mirrors item.ingredients and scales macros as
  // the user edits grams. Populated on open, wiped on close.
  const [ingredientsDraft, setIngredientsDraft] = useState<FoodIngredient[]>([]);
  // Single-item draft: mirrors the top-level macros. Same lifecycle.
  const [macrosDraft, setMacrosDraft] = useState({
    calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0,
  });

  // Reset the draft when a new item is opened.
  useEffect(() => {
    if (!item) return;
    if (item.ingredients && item.ingredients.length > 0) {
      setIngredientsDraft(item.ingredients.map(i => ({ ...i })));
    } else {
      setIngredientsDraft([]);
    }
    setMacrosDraft({
      calories: item.calories || 0,
      protein: item.protein || 0,
      carbs: item.carbs || 0,
      fat: item.fat || 0,
      fiber: item.fiber ?? 0,
    });
  }, [item?.id]);

  const isIngredientMode = ingredientsDraft.length > 0;

  // Live-recomputed totals from ingredients (when in ingredient mode).
  const totals = useMemo(() => {
    if (!isIngredientMode) return macrosDraft;
    return ingredientsDraft.reduce(
      (acc, ing) => ({
        calories: acc.calories + (ing.calories || 0),
        protein:  acc.protein  + (ing.protein  || 0),
        carbs:    acc.carbs    + (ing.carbs    || 0),
        fat:      acc.fat      + (ing.fat      || 0),
        fiber:    acc.fiber    + (ing.fiber    || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
    );
  }, [isIngredientMode, ingredientsDraft, macrosDraft]);

  // Scale one ingredient's macros to a new gram value. Proportional to the
  // original grams — a 100g → 150g change lifts everything by 1.5x.
  const handleGramsChange = (idx: number, rawGrams: string) => {
    const nextGrams = Number(rawGrams);
    if (!Number.isFinite(nextGrams) || nextGrams < 0) return;
    setIngredientsDraft(prev => prev.map((ing, i) => {
      if (i !== idx) return ing;
      const prevGrams = ing.grams || 1;   // guard against divide-by-zero
      const ratio = nextGrams / prevGrams;
      return {
        ...ing,
        grams:    nextGrams,
        calories: Math.round(ing.calories * ratio),
        protein:  Math.round(ing.protein  * ratio),
        carbs:    Math.round(ing.carbs    * ratio),
        fat:      Math.round(ing.fat      * ratio * 10) / 10,
        fiber:    ing.fiber !== undefined ? Math.round(ing.fiber * ratio * 10) / 10 : undefined,
      };
    }));
  };

  const handleDeleteIngredient = (idx: number) => {
    setIngredientsDraft(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    if (!item) return;
    if (isIngredientMode) {
      // Reconstruct the FoodItem from ingredients' summed totals + the
      // edited ingredient list.
      onSave({
        ...item,
        calories: Math.round(totals.calories),
        protein:  Math.round(totals.protein),
        carbs:    Math.round(totals.carbs),
        fat:      Math.round(totals.fat * 10) / 10,
        fiber:    totals.fiber > 0 ? Math.round(totals.fiber * 10) / 10 : item.fiber,
        ingredients: ingredientsDraft.length > 0 ? ingredientsDraft : undefined,
      });
    } else {
      onSave({
        ...item,
        calories: Math.round(macrosDraft.calories),
        protein:  Math.round(macrosDraft.protein),
        carbs:    Math.round(macrosDraft.carbs),
        fat:      Math.round(macrosDraft.fat * 10) / 10,
        fiber:    macrosDraft.fiber > 0 ? Math.round(macrosDraft.fiber * 10) / 10 : item.fiber,
      });
    }
  };

  return (
    <AnimatePresence>
      {item && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[220] flex items-end justify-center bg-black/75 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="w-full max-w-md rounded-t-3xl overflow-hidden flex flex-col"
            style={{ background: C.card, maxHeight: '85vh' }}
          >
            {/* Grabber + header */}
            <div className="pt-2 pb-4 px-5 shrink-0" style={{ background: C.card, borderBottom: `1px solid ${C.border}` }}>
              <div className="mx-auto w-10 h-1 rounded-full mb-3" style={{ background: C.borderStrong }} />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: `${C.fire}18`, color: C.fire }}>
                      <Utensils className="w-4 h-4" strokeWidth={1.8} />
                    </div>
                    <h2 className="text-lg font-bold leading-tight truncate" style={{ color: C.ink }}>
                      {item.name}
                    </h2>
                  </div>
                  <div className="flex items-center gap-3 mt-3 text-[11px]" style={{ color: C.inkMid }}>
                    <span><span className="font-bold tabular-nums" style={{ color: C.ink }}>{Math.round(totals.calories)}</span> kcal</span>
                    <span>·</span>
                    <span><span className="font-bold tabular-nums" style={{ color: C.protein }}>{Math.round(totals.protein)}g</span> P</span>
                    <span><span className="font-bold tabular-nums" style={{ color: C.carbColor }}>{Math.round(totals.carbs)}g</span> C</span>
                    <span><span className="font-bold tabular-nums" style={{ color: C.fatColor }}>{Math.round(totals.fat)}g</span> F</span>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center"
                  style={{ background: C.bg, color: C.inkMid }}
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Body — scrollable */}
            <div className="flex-1 overflow-y-auto px-5 pt-4 pb-6">
              {isIngredientMode ? (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] uppercase tracking-[0.3em] font-bold" style={{ color: C.inkLight }}>
                      Ingredients
                    </span>
                    <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: C.inkLight }}>
                      {ingredientsDraft.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {ingredientsDraft.map((ing, idx) => (
                      <IngredientRow
                        key={idx}
                        ingredient={ing}
                        onGramsChange={(g) => handleGramsChange(idx, g)}
                        onDelete={() => handleDeleteIngredient(idx)}
                        disabled={readOnly}
                      />
                    ))}
                  </div>
                  <p className="text-[11px] mt-4 leading-relaxed" style={{ color: C.inkLight }}>
                    Adjust the grams and everything else scales with it. Delete the ones you
                    didn't actually eat.
                  </p>
                </>
              ) : (
                <>
                  <div className="mb-3">
                    <span className="text-[10px] uppercase tracking-[0.3em] font-bold" style={{ color: C.inkLight }}>
                      Macros
                    </span>
                  </div>
                  <MacroEditor
                    label="Calories"
                    value={macrosDraft.calories}
                    unit="kcal"
                    color={C.fire}
                    onChange={(v) => setMacrosDraft(prev => ({ ...prev, calories: v }))}
                    disabled={readOnly}
                  />
                  <MacroEditor
                    label="Protein"
                    value={macrosDraft.protein}
                    unit="g"
                    color={C.protein}
                    onChange={(v) => setMacrosDraft(prev => ({ ...prev, protein: v }))}
                    disabled={readOnly}
                  />
                  <MacroEditor
                    label="Carbs"
                    value={macrosDraft.carbs}
                    unit="g"
                    color={C.carbColor}
                    onChange={(v) => setMacrosDraft(prev => ({ ...prev, carbs: v }))}
                    disabled={readOnly}
                  />
                  <MacroEditor
                    label="Fat"
                    value={macrosDraft.fat}
                    unit="g"
                    color={C.fatColor}
                    onChange={(v) => setMacrosDraft(prev => ({ ...prev, fat: v }))}
                    disabled={readOnly}
                  />
                  <MacroEditor
                    label="Fiber"
                    value={macrosDraft.fiber}
                    unit="g"
                    color={C.sky}
                    onChange={(v) => setMacrosDraft(prev => ({ ...prev, fiber: v }))}
                    disabled={readOnly}
                  />
                </>
              )}
            </div>

            {/* Sticky footer — Save + Delete */}
            {!readOnly && (
              <div className="shrink-0 px-5 pt-3 pb-6" style={{ background: C.card, borderTop: `1px solid ${C.border}` }}>
                <div className="flex gap-2">
                  <button
                    onClick={() => onDelete(item.id)}
                    className="flex-1 py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-bold"
                    style={{ background: `${C.danger}18`, color: C.danger, border: `1px solid ${C.danger}30` }}
                  >
                    <Trash2 className="w-4 h-4" strokeWidth={2} />
                    Delete
                  </button>
                  <button
                    onClick={handleSave}
                    className="flex-[2] py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-bold text-white"
                    style={{ background: C.fire }}
                  >
                    <Check className="w-4 h-4" strokeWidth={2.5} />
                    Save changes
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ──────────────────── Sub-components ────────────────────

const IngredientRow: React.FC<{
  ingredient: FoodIngredient;
  onGramsChange: (grams: string) => void;
  onDelete: () => void;
  disabled?: boolean;
}> = ({ ingredient, onGramsChange, onDelete, disabled }) => (
  <div
    className="rounded-2xl p-3"
    style={{ background: C.bg, border: `1px solid ${C.border}` }}
  >
    <div className="flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {ingredient.emoji && (
            <span className="text-sm" aria-hidden>{ingredient.emoji}</span>
          )}
          <span className="text-[14px] font-semibold truncate" style={{ color: C.ink }}>
            {ingredient.name}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mt-1 text-[11px]" style={{ color: C.inkLight }}>
          <span><span className="tabular-nums" style={{ color: C.ink }}>{Math.round(ingredient.calories)}</span> kcal</span>
          <span><span className="tabular-nums" style={{ color: C.protein }}>{Math.round(ingredient.protein)}g</span> P</span>
          <span><span className="tabular-nums" style={{ color: C.carbColor }}>{Math.round(ingredient.carbs)}g</span> C</span>
          <span><span className="tabular-nums" style={{ color: C.fatColor }}>{Math.round(ingredient.fat)}g</span> F</span>
        </div>
      </div>
      <div className="flex items-center gap-1 rounded-lg px-2 shrink-0" style={{ background: C.card, border: `1px solid ${C.borderStrong}` }}>
        <input
          type="number"
          inputMode="numeric"
          value={Math.round(ingredient.grams) || ''}
          onChange={(e) => onGramsChange(e.target.value)}
          disabled={disabled}
          min={0}
          className="w-12 py-1.5 bg-transparent text-sm font-bold outline-none tabular-nums text-center"
          style={{ color: C.ink }}
          aria-label={`${ingredient.name} grams`}
        />
        <span className="text-[10px] font-bold" style={{ color: C.inkLight }}>g</span>
      </div>
      {!disabled && (
        <button
          onClick={onDelete}
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ color: C.inkLight }}
          aria-label="Delete ingredient"
        >
          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.7} />
        </button>
      )}
    </div>
  </div>
);

const MacroEditor: React.FC<{
  label: string;
  value: number;
  unit: string;
  color: string;
  onChange: (v: number) => void;
  disabled?: boolean;
}> = ({ label, value, unit, color, onChange, disabled }) => (
  <div className="flex items-center justify-between mt-3 first:mt-0 rounded-2xl px-4 py-3" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
    <span className="text-[13px] font-semibold" style={{ color: C.ink }}>{label}</span>
    <div className="flex items-center gap-1">
      <input
        type="number"
        inputMode="decimal"
        value={value || ''}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === '' ? 0 : Number(raw));
        }}
        disabled={disabled}
        min={0}
        step={0.1}
        className="w-20 py-1 bg-transparent text-lg font-bold outline-none tabular-nums text-right"
        style={{ color }}
      />
      <span className="text-[11px] font-bold" style={{ color: C.inkLight }}>{unit}</span>
    </div>
  </div>
);

export default FoodDetailSheet;
