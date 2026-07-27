/**
 * FuelCoachSheet — the in-app "what should I eat" assistant.
 *
 * Full-screen sheet launched from the Fuel home banner. Four modes:
 *   • Near me      — best menu items for the remaining macros, grounded in
 *                    the curated restaurant DB (findMacroFitMatches feeds
 *                    verified candidates to Gemini for verdicts).
 *   • Cook         — 3 recipes sized to the remaining macros, with
 *                    ingredients, steps, and a grocery list.
 *   • Snacks & sweets — packaged picks, 2-minute builds, and one real
 *                    dessert recipe portioned to fit.
 *   • Start my day — breakfast options + a sketch of the day's budget.
 *
 * Remaining macros come in as props (always live — no pasting), and any
 * suggestion can be logged straight into today with one tap.
 */

import React, { useState } from 'react';
import {
  X, UtensilsCrossed, ChefHat, Cookie, Sunrise, Sparkles, Plus, Check,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import type { FoodItem, UserProfile } from '../types';
import { findMacroFitMatches } from '../data/restaurants';
import {
  generateFuelIdeas,
  type FuelCoachMode,
  type FuelIdea,
  type FuelIdeasResult,
} from '../services/geminiService';

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
};

const MODES: Array<{ id: FuelCoachMode; label: string; icon: React.ReactNode; hint: string }> = [
  { id: 'eatout',  label: 'Near me',        icon: <UtensilsCrossed className="w-4 h-4" strokeWidth={1.8} />, hint: 'Craving? Cuisine? A place you’re headed?' },
  { id: 'cook',    label: 'Cook',           icon: <ChefHat className="w-4 h-4" strokeWidth={1.8} />,          hint: 'What’s in the fridge? How much time?' },
  { id: 'snacks',  label: 'Snacks & sweets', icon: <Cookie className="w-4 h-4" strokeWidth={1.8} />,          hint: 'Sweet? Salty? Chocolate emergency?' },
  { id: 'morning', label: 'Start my day',   icon: <Sunrise className="w-4 h-4" strokeWidth={1.8} />,          hint: 'How much time do you have this morning?' },
];

interface FuelCoachSheetProps {
  remaining: { calories: number; protein: number; carbs: number; fat: number };
  profile: UserProfile | null;
  onClose: () => void;
  /** Log a suggestion into today's food log. */
  onLogItem: (item: FoodItem) => void;
}

export const FuelCoachSheet: React.FC<FuelCoachSheetProps> = ({
  remaining,
  profile,
  onClose,
  onLogItem,
}) => {
  const [mode, setMode] = useState<FuelCoachMode>('eatout');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<FuelIdeasResult | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [loggedIdx, setLoggedIdx] = useState<Set<number>>(new Set());

  const activeMode = MODES.find(m => m.id === mode)!;

  const getIdeas = async () => {
    if (!profile) return;
    setLoading(true);
    setError('');
    setResult(null);
    setExpanded(null);
    setLoggedIdx(new Set());
    try {
      // Ground eat-out mode in the verified restaurant database.
      const candidates = mode === 'eatout'
        ? findMacroFitMatches(remaining.calories, remaining.protein, { limit: 14, maxPerRestaurant: 2 })
            .map(m => `${m.restaurant.name} — ${m.item.name} (${m.item.calories} kcal, P${m.item.protein} C${m.item.carbs} F${m.item.fat})`)
        : undefined;
      const res = await generateFuelIdeas(mode, remaining, note, profile, candidates);
      setResult(res);
    } catch {
      setError("Couldn't reach the coach. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const logIdea = (idea: FuelIdea, idx: number) => {
    onLogItem({
      id: `fuelcoach-${Date.now()}-${idx}`,
      name: idea.source && idea.source !== 'Homemade' ? `${idea.name} (${idea.source})` : idea.name,
      calories: Math.round(idea.calories),
      protein: Math.round(idea.protein),
      carbs: Math.round(idea.carbs),
      fat: Math.round(idea.fat),
      timestamp: new Date().toISOString(),
    });
    setLoggedIdx(prev => new Set(prev).add(idx));
  };

  return (
    <div className="fixed inset-0 z-[230] flex flex-col" style={{ background: C.bg }}>
      {/* ─── Header ─── */}
      <div className="px-5 pt-5 pb-4 shrink-0" style={{ borderBottom: `1px solid ${C.border}` }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold" style={{ color: C.ink }}>Fuel Coach</h2>
            <p className="text-[11px] mt-1 tabular-nums" style={{ color: C.inkMid }}>
              Left today: <span className="font-bold" style={{ color: C.fire }}>{remaining.calories.toLocaleString()} kcal</span>
              <span style={{ color: C.inkLight }}> · P {remaining.protein}g · C {remaining.carbs}g · F {remaining.fat}g</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center"
            style={{ background: C.card, color: C.inkMid }}
            aria-label="Close Fuel Coach"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode chips */}
        <div className="grid grid-cols-2 gap-2 mt-4">
          {MODES.map(m => (
            <button
              key={m.id}
              onClick={() => { setMode(m.id); setResult(null); setError(''); }}
              className="rounded-xl px-3 py-2.5 flex items-center gap-2 text-left"
              style={mode === m.id
                ? { background: `${C.fire}1f`, border: `1px solid ${C.fire}55`, color: C.fire }
                : { background: C.card, border: `1px solid ${C.border}`, color: C.inkMid }}
              aria-pressed={mode === m.id}
            >
              {m.icon}
              <span className="text-[12px] font-bold">{m.label}</span>
            </button>
          ))}
        </div>

        {/* Note + go */}
        <div className="flex gap-2 mt-3">
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !loading) getIdeas(); }}
            placeholder={activeMode.hint}
            className="min-w-0 flex-1 rounded-xl px-3.5 py-2.5 text-[13px] outline-none"
            style={{ background: C.card, border: `1px solid ${C.borderStrong}`, color: C.ink }}
          />
          <button
            onClick={getIdeas}
            disabled={loading}
            className="shrink-0 px-4 rounded-xl flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-white disabled:opacity-50"
            style={{ background: C.fire }}
          >
            <Sparkles className="w-3.5 h-3.5" strokeWidth={1.8} />
            {loading ? '…' : 'Go'}
          </button>
        </div>
      </div>

      {/* ─── Results ─── */}
      <div className="flex-1 overflow-y-auto px-5 py-4 pb-10">
        {loading && (
          <p className="text-center text-[12px] py-16" style={{ color: C.inkLight }}>
            Reading your macros and scouting options…
          </p>
        )}
        {error && (
          <p className="text-center text-[12px] py-16" style={{ color: C.fire }}>{error}</p>
        )}
        {!loading && !error && !result && (
          <p className="text-center text-[12px] py-16 px-8 leading-relaxed" style={{ color: C.inkLight }}>
            Pick a mode, add a note if you want ({activeMode.hint.toLowerCase()}), and hit Go.
            Every idea is sized to what you have left today.
          </p>
        )}
        {result && (
          <>
            <p className="text-[13px] leading-relaxed mb-4" style={{ color: C.inkMid }}>{result.intro}</p>
            <div className="space-y-3">
              {result.ideas.map((idea, idx) => {
                const isOpen = expanded === idx;
                const hasDetail = (idea.ingredients?.length || 0) > 0 || (idea.steps?.length || 0) > 0;
                const isLogged = loggedIdx.has(idx);
                return (
                  <div key={idx} className="rounded-2xl p-4" style={{ background: C.card, border: `1px solid ${C.border}` }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[14px] font-bold leading-tight" style={{ color: C.ink }}>{idea.name}</span>
                          <span
                            className="text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full shrink-0"
                            style={idea.verdict === 'GO'
                              ? { background: `${C.emerald}1f`, color: C.emerald, border: `1px solid ${C.emerald}44` }
                              : { background: `${C.ochre}1f`, color: C.ochre, border: `1px solid ${C.ochre}44` }}
                          >
                            {idea.verdict}
                          </span>
                        </div>
                        <p className="text-[10px] mt-0.5" style={{ color: C.inkLight }}>
                          {idea.source}{idea.timeEstimate ? ` · ${idea.timeEstimate}` : ''}
                        </p>
                      </div>
                      <button
                        onClick={() => !isLogged && logIdea(idea, idx)}
                        className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center transition-colors"
                        style={isLogged
                          ? { background: `${C.emerald}22`, color: C.emerald, border: `1px solid ${C.emerald}55` }
                          : { background: `${C.fire}1f`, color: C.fire, border: `1px solid ${C.fire}40` }}
                        aria-label={isLogged ? 'Logged' : `Log ${idea.name}`}
                      >
                        {isLogged ? <Check className="w-4 h-4" strokeWidth={2.2} /> : <Plus className="w-4 h-4" strokeWidth={2.2} />}
                      </button>
                    </div>

                    <p className="text-[11px] mt-2 tabular-nums font-semibold" style={{ color: C.inkMid }}>
                      {Math.round(idea.calories)} kcal
                      <span style={{ color: C.emerald }}> · P {Math.round(idea.protein)}g</span>
                      <span style={{ color: C.ochre }}> · C {Math.round(idea.carbs)}g</span>
                      <span style={{ color: C.fire }}> · F {Math.round(idea.fat)}g</span>
                    </p>
                    <p className="text-[11px] mt-1.5 leading-snug" style={{ color: C.inkLight }}>{idea.why}</p>

                    {hasDetail && (
                      <>
                        <button
                          onClick={() => setExpanded(isOpen ? null : idx)}
                          className="flex items-center gap-1 mt-2.5 text-[10px] font-bold uppercase tracking-widest"
                          style={{ color: C.sky }}
                        >
                          {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          {isOpen ? 'Hide recipe' : 'Recipe & grocery list'}
                        </button>
                        {isOpen && (
                          <div className="mt-3 rounded-xl p-3.5" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                            {idea.ingredients && idea.ingredients.length > 0 && (
                              <>
                                <p className="text-[9px] uppercase tracking-[0.25em] font-bold" style={{ color: C.inkLight }}>Ingredients</p>
                                {idea.ingredients.map((ing, i) => (
                                  <p key={i} className="text-[11px] mt-1" style={{ color: C.inkMid }}>· {ing}</p>
                                ))}
                              </>
                            )}
                            {idea.steps && idea.steps.length > 0 && (
                              <>
                                <p className="text-[9px] uppercase tracking-[0.25em] font-bold mt-3" style={{ color: C.inkLight }}>Steps</p>
                                {idea.steps.map((s, i) => (
                                  <p key={i} className="text-[11px] mt-1 leading-snug" style={{ color: C.inkMid }}>{i + 1}. {s}</p>
                                ))}
                              </>
                            )}
                            {idea.grocery && idea.grocery.length > 0 && (
                              <>
                                <p className="text-[9px] uppercase tracking-[0.25em] font-bold mt-3" style={{ color: C.emerald }}>Grocery run</p>
                                {idea.grocery.map((g, i) => (
                                  <p key={i} className="text-[11px] mt-1" style={{ color: C.inkMid }}>· {g}</p>
                                ))}
                              </>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <button
              onClick={getIdeas}
              disabled={loading}
              className="mt-4 mx-auto flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest"
              style={{ color: C.inkLight }}
            >
              <Sparkles className="w-3 h-3" strokeWidth={1.7} />
              Different ideas
            </button>
          </>
        )}
      </div>
    </div>
  );
};
