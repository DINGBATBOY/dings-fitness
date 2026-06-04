import React, { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../services/firebase';
import { marked } from 'marked';
import { ChefHat, Utensils, Loader2, FastForward } from 'lucide-react';

interface FoodCuratorProps {
  targetMacros: { calories: number; protein: number; carbs: number; fat: number };
  consumedMacros: { calories: number; protein: number; carbs: number; fat: number };
}

export const FoodCurator: React.FC<FoodCuratorProps> = ({ targetMacros, consumedMacros }) => {
  const remainingProtein = Math.max(0, targetMacros.protein - consumedMacros.protein);
  const remainingCarbs = Math.max(0, targetMacros.carbs - consumedMacros.carbs);
  const remainingFat = Math.max(0, targetMacros.fat - consumedMacros.fat);
  const remainingCalories = Math.max(0, targetMacros.calories - consumedMacros.calories);

  const [customProtein, setCustomProtein] = useState(remainingProtein.toString());
  const [customCarbs, setCustomCarbs] = useState(remainingCarbs.toString());
  const [customFat, setCustomFat] = useState(remainingFat.toString());
  const [feeling, setFeeling] = useState('');
  
  const [isLoading, setIsLoading] = useState(false);
  const [suggestion, setSuggestion] = useState('');

  const handleGenerate = async (type: 'recipe' | 'fastfood') => {
    setIsLoading(true);
    setSuggestion('');
    try {
      if (!functions) throw new Error("AI features unavailable — sign in first.");

      // Strip any HTML from user-supplied "feeling" input.
      const safeFeeling = (feeling ?? '').replace(/<[^>]*>/g, '').trim().slice(0, 200);

      const p = parseInt(customProtein) || 0;
      const c = parseInt(customCarbs) || 0;
      const f = parseInt(customFat) || 0;
      const cal = (p * 4) + (c * 4) + (f * 9);

      let prompt = `I need a food suggestion that fits these exact macros: ${p}g Protein, ${c}g Carbs, ${f}g Fat (approx ${cal} calories).\n`;

      if (safeFeeling) {
        prompt += `I am currently feeling/craving: "${safeFeeling}".\n`;
      }

      if (type === 'recipe') {
        prompt += `Please provide a recipe with ingredients and step-by-step cooking directions that hits these macros as closely as possible.`;
      } else {
        prompt += `Please recommend a fast-food option (like Chipotle, Sweetgreen, Cava, etc.) and tell me exactly what to order to hit these macros as closely as possible.`;
      }

      const callGemini = httpsCallable<
        { contents: string },
        { text: string; functionCalls: any[] | null }
      >(functions, 'callGemini');

      const res = await callGemini({ contents: prompt });
      setSuggestion(res.data.text || 'No suggestion generated.');
    } catch (error: any) {
      console.error("Error generating food suggestion:", error);
      const msg = error?.message ?? "Failed to generate suggestion. Please try again.";
      setSuggestion(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="glass-panel border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] p-6 rounded-3xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-yellow-400/20 rounded-xl">
            <ChefHat className="w-6 h-6 text-yellow-400" />
          </div>
          <h2 className="text-xl font-orbitron font-bold text-white">Food Curator</h2>
        </div>
        <p className="text-sm text-gray-400 mb-6">
          Let AI curate a meal to hit your remaining macros, or enter custom targets.
        </p>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-gray-500 mb-1">Protein (g)</label>
            <input 
              type="number" 
              value={customProtein} 
              onChange={(e) => setCustomProtein(e.target.value)}
              className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-white text-center font-orbitron focus:outline-none focus:border-yellow-400/50"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-gray-500 mb-1">Carbs (g)</label>
            <input 
              type="number" 
              value={customCarbs} 
              onChange={(e) => setCustomCarbs(e.target.value)}
              className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-white text-center font-orbitron focus:outline-none focus:border-yellow-400/50"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-gray-500 mb-1">Fat (g)</label>
            <input 
              type="number" 
              value={customFat} 
              onChange={(e) => setCustomFat(e.target.value)}
              className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-white text-center font-orbitron focus:outline-none focus:border-yellow-400/50"
            />
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-[10px] uppercase tracking-widest text-gray-500 mb-1">What are you feeling?</label>
          <input 
            type="text" 
            placeholder="e.g., craving something spicy, want a quick salad..."
            value={feeling} 
            onChange={(e) => setFeeling(e.target.value)}
            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-yellow-400/50"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button 
            onClick={() => handleGenerate('recipe')}
            disabled={isLoading}
            className="flex items-center justify-center gap-2 bg-yellow-400/10 hover:bg-yellow-400/20 text-yellow-400 border border-yellow-400/30 rounded-xl py-3 transition-colors disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Utensils className="w-4 h-4" />}
            <span className="font-bold text-sm">Recipe</span>
          </button>
          <button 
            onClick={() => handleGenerate('fastfood')}
            disabled={isLoading}
            className="flex items-center justify-center gap-2 bg-orange-500/10 hover:bg-orange-500/20 text-orange-500 border border-orange-500/30 rounded-xl py-3 transition-colors disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FastForward className="w-4 h-4" />}
            <span className="font-bold text-sm">Fast Food</span>
          </button>
        </div>
      </div>

      {suggestion && (
        <div className="glass-panel p-6 rounded-3xl">
          <h3 className="text-lg font-orbitron font-bold text-white mb-4">Curated Suggestion</h3>
          <div 
            className="prose prose-invert prose-sm max-w-none text-gray-300"
            dangerouslySetInnerHTML={{ __html: marked.parse(suggestion) as string }}
          />
        </div>
      )}
    </div>
  );
};
