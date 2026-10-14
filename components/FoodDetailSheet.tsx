import React from 'react';
import type { FoodItem } from '../types';
import { FoodDialog } from './food/FoodDialog';
import { FoodEditor } from './food/FoodEditor';
import { fromSavedFood, toSavedFood } from '../services/foodDraft';

interface FoodDetailSheetProps {
  item: FoodItem | null; onSave: (updated: FoodItem) => void;
  onDelete: (itemId: string) => void; onClose: () => void; readOnly?: boolean;
}
export const FoodDetailSheet: React.FC<FoodDetailSheetProps> = ({ item, onSave, onDelete, onClose, readOnly = false }) => (
  <FoodDialog open={!!item} onClose={onClose} closeLabel="Close food details" title={readOnly ? 'Logged food' : 'Edit logged food'}>
    {item && (readOnly ? <div className="space-y-4 text-[#f5ede1]">
      <h2 className="text-2xl font-bold">{item.name}</h2>
      <p className="text-3xl font-semibold tabular-nums">{Math.round(item.calories)} kcal</p>
      <p className="text-base">Protein {Math.round(item.protein)} g · Carbs {Math.round(item.carbs)} g · Fat {Math.round(item.fat)} g</p>
      <p className="text-sm text-[#c4b8a4]">{item.nutritionEvidence?.portionNote}</p>
      <p className="text-sm text-[#c4b8a4]">{item.nutritionEvidence?.summary || 'Previously logged numbers.'}</p>
      <p className="text-sm text-[#c4b8a4]">Past entries are read-only.</p>
    </div> : <>
      <FoodEditor key={item.id} item={fromSavedFood(item)} onBack={onClose} onSave={draft => {
        const updated = toSavedFood(draft, item.draftId || item.id);
        onSave({ ...updated, id: item.id, timestamp: item.timestamp, draftId: item.draftId });
        onClose();
      }} />
      <button type="button" onClick={() => { onDelete(item.id); onClose(); }} className="mt-5 min-h-11 w-full rounded-xl border border-[#c4b8a4]/50 px-4 text-base text-[#f5ede1]">Remove this food</button>
    </>)}
  </FoodDialog>
);
