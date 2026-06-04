// DEPRECATED: Bio Vision prototype, not used
// @ts-nocheck
import React, { useState } from 'react';
import { DailyLog } from '../utils/calculations';
import { format } from 'date-fns';
import { Save, Activity, Utensils, Moon } from 'lucide-react';

export const InputPanel = ({ onSave, initialData }: { onSave: (log: DailyLog) => void, initialData: DailyLog }) => {
  const [formData, setFormData] = useState<DailyLog>(initialData);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: parseFloat(value) || 0 }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-slate-900">Today's Entry ({format(new Date(), 'MMM do')})</h2>
        <button type="submit" className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
          <Save className="w-4 h-4" />
          Save Day
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Nutrition */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-slate-700 font-medium pb-2 border-b border-slate-100">
            <Utensils className="w-4 h-4 text-emerald-500" />
            Nutrition
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Food Calories</label>
            <input type="number" name="foodCalories" value={formData.foodCalories || ''} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Protein (g)</label>
            <input type="number" name="protein" value={formData.protein || ''} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Sugar (g)</label>
              <input type="number" name="sugar" value={formData.sugar || ''} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Fiber (g)</label>
              <input type="number" name="fiber" value={formData.fiber || ''} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>
        </div>

        {/* Workout */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-slate-700 font-medium pb-2 border-b border-slate-100">
            <Activity className="w-4 h-4 text-rose-500" />
            Workout
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Calories Burned</label>
            <input type="number" name="workoutCalories" value={formData.workoutCalories || ''} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Weight</label>
              <input type="number" name="weight" value={formData.weight || ''} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Reps</label>
              <input type="number" name="reps" value={formData.reps || ''} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Sets</label>
              <input type="number" name="sets" value={formData.sets || ''} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>
        </div>

        {/* Recovery & Vitals */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-slate-700 font-medium pb-2 border-b border-slate-100">
            <Moon className="w-4 h-4 text-indigo-500" />
            Recovery & Vitals
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Sleep (Hours)</label>
            <input type="number" name="sleepHours" value={formData.sleepHours || ''} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Visceral Fat Level</label>
            <input type="number" name="visceralFatLevel" value={formData.visceralFatLevel || ''} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>
      </div>
    </form>
  );
};
