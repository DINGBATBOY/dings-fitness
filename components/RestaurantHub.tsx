/**
 * Restaurant Hub — curated chain restaurant database with one-tap logging.
 *
 * Two views in one component:
 *   • List view   — restaurants grouped by health tier, with filter chips.
 *   • Detail view — selected restaurant's menu, grouped by category, with
 *                   per-item quantity stepper and one-tap "log to today".
 *
 * The component is presentational + lift-state pattern. The actual food log
 * mutation happens in MainApp via the onLogItem callback.
 */

import React, { useMemo, useState } from 'react';
import {
  RESTAURANTS,
  TIER_INFO,
  sortedRestaurants,
  searchMenuItems,
  findMacroFitMatches,
  getEffectiveMenuItems,
  type Restaurant,
  type MenuItem,
  type RestaurantTier,
} from '../data/restaurants';
import type { FoodItem } from '../types';

interface RestaurantHubProps {
  onLogItem: (item: FoodItem, restaurantName: string) => void;
  /** User's target macros for the day (from MainApp's CALCULATE_MACROS). */
  targetMacros?: { calories: number; protein: number; carbs: number; fat: number };
  /** User's currently-consumed macros today. */
  consumedMacros?: { calories: number; protein: number; carbs: number; fat: number };
  /** User-added menu items keyed by restaurant slug — surfaced in the
   *  restaurant detail view under "Added by you" so the user can re-log
   *  things they've previously eaten that weren't in our built-in DB. */
  customMenuItems?: Record<string, MenuItem[]>;
}

// Tier color classes — kept as full static strings so Tailwind's JIT picks them up.
const TIER_CLASSES: Record<RestaurantTier, { badge: string; chip: string; border: string }> = {
  1: { badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', chip: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30', border: 'border-emerald-500/20' },
  2: { badge: 'bg-lime-500/15 text-lime-300 border-lime-500/30',          chip: 'bg-lime-500/10 text-lime-300 border-lime-500/30',          border: 'border-lime-500/20' },
  3: { badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',       chip: 'bg-amber-500/10 text-amber-300 border-amber-500/30',      border: 'border-amber-500/20' },
  4: { badge: 'bg-orange-500/15 text-orange-300 border-orange-500/30',    chip: 'bg-orange-500/10 text-orange-300 border-orange-500/30',   border: 'border-orange-500/20' },
  5: { badge: 'bg-red-500/15 text-red-300 border-red-500/30',             chip: 'bg-red-500/10 text-red-300 border-red-500/30',            border: 'border-red-500/20' },
};

const GOAL_TAG_LABELS: Record<string, string> = {
  'high-protein': 'High-protein',
  'low-cal':      'Low-cal',
  'low-carb':     'Low-carb',
  'plant-based':  'Plant-based',
  'gluten-free':  'GF',
};

export const RestaurantHub: React.FC<RestaurantHubProps> = ({ onLogItem, targetMacros, consumedMacros, customMenuItems }) => {
  const [tierFilter, setTierFilter] = useState<RestaurantTier | 'all'>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Restaurant | null>(null);
  // Per-item quantity in the detail view (keyed by `${restaurantId}/${itemId}`).
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [showAllMatches, setShowAllMatches] = useState(false);

  // ----- MACRO-FIT MATCHES ------------------------------------------------
  // Score every menu item against the user's remaining cal/protein for today
  // and surface the top 6-8 that fit. Recomputes when consumedMacros changes,
  // so the card updates live as the user logs through the day.
  const remainingCalories = Math.max(
    0,
    (targetMacros?.calories ?? 0) - (consumedMacros?.calories ?? 0),
  );
  const remainingProtein = Math.max(
    0,
    (targetMacros?.protein ?? 0) - (consumedMacros?.protein ?? 0),
  );

  const macroFitMatches = useMemo(() => {
    if (!targetMacros) return [];
    return findMacroFitMatches(remainingCalories, remainingProtein, {
      limit: showAllMatches ? 16 : 6,
      maxPerRestaurant: 2,
      customMenuItems,
    });
  }, [remainingCalories, remainingProtein, targetMacros, showAllMatches, customMenuItems]);

  // Smart copy for the card header, based on how much of the day is left.
  const fitHeadline = useMemo(() => {
    if (!targetMacros) return null;
    const consumedRatio = (consumedMacros?.calories ?? 0) / Math.max(targetMacros.calories, 1);
    if (consumedRatio < 0.2) return { title: 'Plenty of room today', tone: 'fresh' as const };
    if (consumedRatio < 0.9) return { title: 'Fits your remaining macros', tone: 'normal' as const };
    if (consumedRatio < 1.05) return { title: 'Light bites to round out today', tone: 'caution' as const };
    return { title: 'Over budget — these stay light', tone: 'over' as const };
  }, [targetMacros, consumedMacros]);

  // ----- LIST VIEW DATA ----------------------------------------------------
  const filteredRestaurants = useMemo(() => {
    const list = sortedRestaurants();
    if (tierFilter === 'all') return list;
    return list.filter(r => r.tier === tierFilter);
  }, [tierFilter]);

  const searchResults = useMemo(() => {
    if (!search.trim()) return [];
    return searchMenuItems(search, 12);
  }, [search]);

  // ----- HELPERS -----------------------------------------------------------
  const qtyKey = (rId: string, iId: string) => `${rId}/${iId}`;
  const getQty = (rId: string, iId: string): number => quantities[qtyKey(rId, iId)] ?? 1;
  const setQty = (rId: string, iId: string, qty: number) => {
    setQuantities(prev => ({ ...prev, [qtyKey(rId, iId)]: Math.max(1, Math.min(20, qty)) }));
  };

  const logItem = (r: Restaurant, item: MenuItem, qty: number) => {
    const food: FoodItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: qty > 1 ? `${item.name} ×${qty}` : item.name,
      calories: Math.round(item.calories * qty),
      protein:  Math.round(item.protein  * qty),
      carbs:    Math.round(item.carbs    * qty),
      fat:      Math.round(item.fat      * qty),
      // Only include fiber when the menu entry actually has it — Firestore
      // rejects documents with `undefined` field values.
      ...(item.fiber !== undefined ? { fiber: Math.round(item.fiber * qty) } : {}),
      timestamp: new Date().toLocaleTimeString(),
    };
    onLogItem(food, r.shortName);
  };

  // ========================================================================
  //  DETAIL VIEW
  // ========================================================================
  if (selected) {
    const tierColors = TIER_CLASSES[selected.tier];
    const tier = TIER_INFO[selected.tier];
    // Merge built-in items with any user-added custom items so "Added by you"
    // shows up as a category alongside Bowls, Sides, etc.
    const effectiveItems = getEffectiveMenuItems(selected, customMenuItems);
    const itemsByCategory: Record<string, MenuItem[]> = {};
    for (const item of effectiveItems) {
      (itemsByCategory[item.category] ||= []).push(item);
    }
    // Popular items first within each category
    Object.values(itemsByCategory).forEach(arr => arr.sort((a, b) => Number(!!b.isPopular) - Number(!!a.isPopular)));

    return (
      <div className="space-y-5 pb-24 animate-fade-in">
        {/* Back button + tier badge */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setSelected(null)}
            className="text-[11px] text-cyan-400 hover:text-cyan-300 font-bold uppercase tracking-widest"
          >
            ← All Restaurants
          </button>
          <span className={`text-[9px] uppercase tracking-widest font-bold px-2.5 py-1 rounded-full border ${tierColors.badge}`}>
            {tier.emoji} Tier {selected.tier} · {tier.label}
          </span>
        </div>

        {/* Restaurant header */}
        <section className={`glass-panel rounded-3xl p-5 border ${tierColors.border}`}>
          <div className="flex items-start gap-3">
            <span className="text-4xl leading-none">{selected.emoji}</span>
            <div className="flex-1 min-w-0">
              <h2 className="text-white text-xl font-bold tracking-tight">{selected.name}</h2>
              <p className="text-[11px] text-gray-500 uppercase tracking-widest font-bold mt-0.5">{selected.category}</p>
              <p className="text-[13px] text-gray-400 mt-2 leading-relaxed">{selected.blurb}</p>
            </div>
          </div>
          {selected.nutritionNote && (
            <p className="text-[11px] text-gray-500 italic mt-3 leading-relaxed">{selected.nutritionNote}</p>
          )}
        </section>

        {/* Menu sections */}
        {Object.entries(itemsByCategory).map(([category, items]) => (
          <section key={category} className="space-y-2">
            <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-1">{category}</h3>
            <div className="space-y-2">
              {items.map(item => {
                const qty = getQty(selected.id, item.id);
                return (
                  <div key={item.id} className="bg-white/[0.03] hover:bg-white/[0.05] border border-white/5 hover:border-white/10 rounded-2xl p-3.5 transition-colors">
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold text-white text-sm">{item.name}</h4>
                          {item.isPopular && (
                            <span className="text-[8px] uppercase tracking-widest font-bold text-orange-300 bg-orange-500/15 border border-orange-500/30 px-1.5 py-0.5 rounded-full">★ Popular</span>
                          )}
                        </div>
                        {item.servingSize && (
                          <p className="text-[10px] text-gray-500 mt-0.5">{item.servingSize}</p>
                        )}
                        <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 mt-1.5 text-[10px] font-medium tabular-nums">
                          <span className="text-white"><span className="font-bold">{item.calories}</span> <span className="text-gray-500">cal</span></span>
                          <span className="text-emerald-400"><span className="font-bold">{item.protein}</span><span className="text-emerald-700">p</span></span>
                          <span className="text-blue-400"><span className="font-bold">{item.carbs}</span><span className="text-blue-700">c</span></span>
                          <span className="text-amber-400"><span className="font-bold">{item.fat}</span><span className="text-amber-700">f</span></span>
                          {item.fiber ? <span className="text-yellow-500/70"><span className="font-bold">{item.fiber}</span><span className="text-yellow-700">fib</span></span> : null}
                        </div>
                        {item.goalTags && item.goalTags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {item.goalTags.map(tag => (
                              <span key={tag} className="text-[8px] uppercase tracking-widest font-bold text-gray-300 bg-white/5 border border-white/10 px-1.5 py-0.5 rounded-full">
                                {GOAL_TAG_LABELS[tag] || tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Quantity + add row */}
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/5">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setQty(selected.id, item.id, qty - 1)}
                          className="h-8 w-8 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-lg text-gray-300 text-sm font-bold"
                          aria-label="Decrease quantity"
                        >−</button>
                        <span className="w-8 text-center text-sm font-bold text-white tabular-nums">{qty}</span>
                        <button
                          onClick={() => setQty(selected.id, item.id, qty + 1)}
                          className="h-8 w-8 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-lg text-gray-300 text-sm font-bold"
                          aria-label="Increase quantity"
                        >+</button>
                      </div>
                      <button
                        onClick={() => logItem(selected, item, qty)}
                        className="flex-1 h-8 bg-white text-black rounded-lg text-[11px] font-bold uppercase tracking-widest hover:bg-gray-200 transition-colors"
                      >
                        + Log {qty * item.calories} cal
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        {selected.officialUrl && (
          <p className="text-center text-[10px] text-gray-600 pt-2">
            Nutrition data via{' '}
            <a
              href={selected.nutritionSourceUrl || selected.officialUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-400 hover:text-cyan-300 underline"
            >
              {new URL(selected.officialUrl).hostname.replace('www.', '')}
            </a>
            {selected.lastVerified && <> · last verified {selected.lastVerified}</>}
          </p>
        )}
      </div>
    );
  }

  // ========================================================================
  //  LIST VIEW
  // ========================================================================
  return (
    <div className="space-y-4 pb-24 animate-fade-in">
      {/* Hero strip */}
      <div className="px-1">
        <h2 className="text-white text-xl font-bold tracking-tight">Eats</h2>
        <p className="text-gray-500 text-[11px] font-medium mt-0.5">
          Verified macros from {RESTAURANTS.length} curated restaurants — tap to log
        </p>
      </div>

      {/* MACRO-FIT CARD — surfaces items that fit your day's remaining macros.
          Recomputes live as the user logs food. Hidden when targetMacros
          isn't available (e.g. profile still loading). */}
      {targetMacros && macroFitMatches.length > 0 && fitHeadline && (
        <section className="glass-panel rounded-3xl border border-cyan-500/20 p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-base">🎯</span>
                <h3 className="text-white text-sm font-bold tracking-tight">{fitHeadline.title}</h3>
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5 font-mono tabular-nums">
                {remainingCalories} cal · {remainingProtein}g protein remaining
              </p>
            </div>
            {macroFitMatches.length >= 6 && (
              <button
                onClick={() => setShowAllMatches(s => !s)}
                className="shrink-0 text-[10px] text-cyan-400 hover:text-cyan-300 uppercase tracking-widest font-bold"
              >
                {showAllMatches ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>

          <div className="space-y-1.5">
            {macroFitMatches.map(({ restaurant, item, reason }) => {
              const tier = TIER_INFO[restaurant.tier];
              return (
                <button
                  key={`${restaurant.id}-${item.id}`}
                  onClick={() => {
                    const food: FoodItem = {
                      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                      name: item.name,
                      calories: Math.round(item.calories),
                      protein: Math.round(item.protein),
                      carbs: Math.round(item.carbs),
                      fat: Math.round(item.fat),
                      // Only include fiber when present — Firestore rejects undefined.
                      ...(item.fiber !== undefined ? { fiber: Math.round(item.fiber) } : {}),
                      timestamp: new Date().toLocaleTimeString(),
                    };
                    onLogItem(food, restaurant.shortName);
                  }}
                  className="w-full text-left bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-cyan-500/40 rounded-xl px-3 py-2.5 transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl shrink-0">{restaurant.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-bold text-white truncate">{item.name}</span>
                        {item.isPopular && (
                          <span className="text-[8px] uppercase tracking-widest font-bold text-orange-300 bg-orange-500/15 border border-orange-500/30 px-1.5 py-0.5 rounded-full">★</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-500">
                        <span className="text-gray-400 font-medium">{restaurant.shortName}</span>
                        <span className="text-gray-700">·</span>
                        <span className="text-gray-500 italic truncate">{reason}</span>
                      </div>
                      <div className="flex flex-wrap gap-x-2.5 gap-y-0 mt-1 text-[10px] font-medium tabular-nums">
                        <span className="text-white"><span className="font-bold">{item.calories}</span> cal</span>
                        <span className="text-emerald-400"><span className="font-bold">{item.protein}</span>p</span>
                        <span className="text-blue-400"><span className="font-bold">{item.carbs}</span>c</span>
                        <span className="text-amber-400"><span className="font-bold">{item.fat}</span>f</span>
                      </div>
                    </div>
                    <span className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 group-hover:bg-emerald-500 group-hover:text-black text-gray-300 text-sm font-bold transition-colors shrink-0">
                      +
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <p className="text-[9px] text-gray-600 italic text-center pt-1">
            Tap any item to log instantly · ranked by how well it fits your day
          </p>
        </section>
      )}

      {/* Search */}
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search menu items (e.g. burrito bowl, tender)"
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500"
        />
      </div>

      {/* Tier filter chips */}
      {!search.trim() && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          <button
            onClick={() => setTierFilter('all')}
            className={`shrink-0 text-[10px] uppercase tracking-widest font-bold px-3 py-1.5 rounded-full border transition-all ${
              tierFilter === 'all'
                ? 'bg-white/10 text-white border-white/30'
                : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'
            }`}
          >
            All
          </button>
          {([1, 2, 3, 4, 5] as RestaurantTier[]).map(t => {
            const colors = TIER_CLASSES[t];
            const info = TIER_INFO[t];
            const count = RESTAURANTS.filter(r => r.tier === t).length;
            return (
              <button
                key={t}
                onClick={() => setTierFilter(t)}
                className={`shrink-0 text-[10px] uppercase tracking-widest font-bold px-3 py-1.5 rounded-full border transition-all ${
                  tierFilter === t ? colors.chip : 'bg-white/5 text-gray-500 border-white/10 hover:bg-white/10'
                }`}
              >
                {info.emoji} T{t} <span className="opacity-60">({count})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Search results */}
      {search.trim() && (
        <section className="space-y-2">
          <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-1">
            {searchResults.length} match{searchResults.length !== 1 ? 'es' : ''}
          </h3>
          {searchResults.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-500">No menu items match &ldquo;{search}&rdquo;.</div>
          ) : (
            searchResults.map(({ restaurant, item }) => (
              <button
                key={`${restaurant.id}-${item.id}`}
                onClick={() => { setSelected(restaurant); setSearch(''); }}
                className="w-full text-left bg-white/[0.03] hover:bg-white/[0.05] border border-white/5 hover:border-white/10 rounded-2xl p-3.5 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl leading-none">{restaurant.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-white text-sm truncate">{item.name}</h4>
                    <p className="text-[10px] text-gray-500 mt-0.5">{restaurant.shortName} · {item.category}</p>
                    <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 mt-1 text-[10px] font-medium tabular-nums">
                      <span className="text-white"><span className="font-bold">{item.calories}</span> cal</span>
                      <span className="text-emerald-400"><span className="font-bold">{item.protein}</span>p</span>
                      <span className="text-blue-400"><span className="font-bold">{item.carbs}</span>c</span>
                      <span className="text-amber-400"><span className="font-bold">{item.fat}</span>f</span>
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </section>
      )}

      {/* Restaurant list grouped by tier */}
      {!search.trim() && (
        <>
          {([1, 2, 3, 4, 5] as RestaurantTier[])
            .filter(t => tierFilter === 'all' || tierFilter === t)
            .map(t => {
              const tierRestaurants = filteredRestaurants.filter(r => r.tier === t);
              if (tierRestaurants.length === 0) return null;
              const info = TIER_INFO[t];
              const colors = TIER_CLASSES[t];
              return (
                <section key={t} className="space-y-2">
                  <div className="flex items-baseline justify-between px-1">
                    <h3 className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">
                      <span className="mr-1.5">{info.emoji}</span>
                      Tier {t} · {info.label}
                    </h3>
                    <span className="text-[10px] text-gray-600 font-mono tabular-nums">{tierRestaurants.length}</span>
                  </div>
                  <p className="text-[10px] text-gray-500 px-1 -mt-1">{info.description}</p>
                  <div className="space-y-2">
                    {tierRestaurants.map(r => (
                      <button
                        key={r.id}
                        onClick={() => setSelected(r)}
                        className={`w-full text-left bg-white/[0.03] hover:bg-white/[0.05] border ${colors.border} rounded-2xl p-3.5 transition-all hover:border-opacity-70`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-3xl leading-none">{r.emoji}</span>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-white text-sm truncate">{r.name}</h4>
                            <p className="text-[10px] text-gray-500 mt-0.5">{r.category} · {r.menuItems.length} items</p>
                          </div>
                          <span className="text-gray-600">›</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
        </>
      )}
    </div>
  );
};

export default RestaurantHub;
