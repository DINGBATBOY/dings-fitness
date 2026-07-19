/**
 * Wrapped — personalized "Spotify Wrapped"-style summary.
 *
 * Hybrid scrollable page: most sections fade/slide in as you scroll, but a few
 * hero stats get the slide-style theatrical treatment (large numbers, staggered
 * entry, gradient backdrops). Designed as a full-screen overlay launched from
 * the dashboard or auto-prompted at the start of a new month.
 *
 * Aggregates everything from existing AppState — no new data dependency, no
 * server calls. Everything is computed client-side from dailyLogs +
 * foodHistory + bodyStats + workout state.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Flame, Beef, Wheat, Droplets, Trophy, Zap, Activity, TrendingUp,
  Calendar, Star, Award, Dumbbell, Heart, Feather, ChevronRight,
} from 'lucide-react';
import type {
  DailyLog, FoodItem, HistoryEntry, UserProfile, NutritionTargets, BodyStats, WeightEntry,
} from '../types';

type Period = 'week' | 'month';

interface WrappedProps {
  profile: UserProfile;
  dailyLogs: DailyLog[];
  weighIns?: WeightEntry[];
  todayLog: FoodItem[];
  todayActivityBurn: number;
  todayWaterIntake: number;
  foodHistory: HistoryEntry[];
  bodyStats: BodyStats;
  targets: NutritionTargets;
  weeklyCompletedWorkouts?: string[];
  initialPeriod?: Period;
  /** Set when this Wrapped was triggered by the month-start auto-prompt so we
   *  can show a "New month!" badge in the header. */
  autoPrompted?: boolean;
  /** When true, renders as page content inside an existing tab (no fullscreen
   *  overlay, no top bar with close button). When false/undefined, renders as
   *  a fullscreen overlay with sticky close header. */
  inline?: boolean;
  /** Only used in overlay mode. In inline mode this is ignored. */
  onClose?: () => void;
}

// Predicate matching the Stats / Journal definition of a "real" day —
// don't count placeholder rows that were created without any logging.
const hasRealActivity = (log: DailyLog): boolean =>
  (log.foodItems && log.foodItems.length > 0) ||
  (log.caloriesConsumed || 0) > 0 ||
  (log.waterIntake || 0) > 0 ||
  (log.caloriesBurned || 0) > 0;

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const Wrapped: React.FC<WrappedProps> = ({
  profile,
  dailyLogs,
  weighIns = [],
  todayLog,
  todayActivityBurn,
  todayWaterIntake,
  foodHistory,
  bodyStats,
  targets,
  weeklyCompletedWorkouts = [],
  initialPeriod = 'month',
  autoPrompted = false,
  inline = false,
  onClose,
}) => {
  const [period, setPeriod] = useState<Period>(initialPeriod);

  // Lock body scroll while the overlay is open. Inline mode is just page
  // content inside an already-scrollable tab, so we leave scrolling alone.
  useEffect(() => {
    if (inline) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = original; };
  }, [inline]);

  // ----- DATE WINDOW -------------------------------------------------------
  const window = useMemo(() => {
    const todayD = new Date();
    todayD.setHours(0, 0, 0, 0);
    const start = new Date(todayD);
    if (period === 'week') {
      start.setDate(start.getDate() - 6); // last 7 days incl. today
    } else {
      start.setDate(start.getDate() - 29); // last 30 days incl. today
    }
    return { start, end: todayD };
  }, [period]);

  const periodLabel = useMemo(() => {
    const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `${fmt(window.start)} – ${fmt(window.end)}`;
  }, [window]);

  // ----- ASSEMBLE LOGS IN WINDOW ------------------------------------------
  const logsInWindow = useMemo<DailyLog[]>(() => {
    const todayStr = new Date().toLocaleDateString();
    const todayEntry: DailyLog = {
      date: todayStr,
      weight: profile.weight || 0,
      caloriesConsumed: todayLog.reduce((a, i) => a + (i.calories || 0), 0),
      proteinConsumed:  todayLog.reduce((a, i) => a + (i.protein  || 0), 0),
      carbsConsumed:    todayLog.reduce((a, i) => a + (i.carbs    || 0), 0),
      fatConsumed:      todayLog.reduce((a, i) => a + (i.fat      || 0), 0),
      fiberConsumed:    todayLog.reduce((a, i) => a + (i.fiber    || 0), 0),
      waterIntake:      todayWaterIntake,
      caloriesBurned:   todayActivityBurn,
      foodItems:        todayLog,
    };
    const seen = new Set<string>();
    const history = (dailyLogs || [])
      .filter(l => l.date !== todayStr)
      .filter(l => {
        if (seen.has(l.date)) return false;
        seen.add(l.date);
        return true;
      });
    const combined = [todayEntry, ...history];
    return combined.filter(l => {
      const d = new Date(l.date);
      return d >= window.start && d <= window.end && hasRealActivity(l);
    });
  }, [dailyLogs, todayLog, todayActivityBurn, todayWaterIntake, profile.weight, window]);

  // ----- AGGREGATES --------------------------------------------------------
  const stats = useMemo(() => {
    const days = logsInWindow.length;
    const totals = logsInWindow.reduce((acc, l) => ({
      calories: acc.calories + (l.caloriesConsumed || 0),
      protein:  acc.protein  + (l.proteinConsumed  || 0),
      carbs:    acc.carbs    + (l.carbsConsumed    || 0),
      fat:      acc.fat      + (l.fatConsumed      || 0),
      fiber:    acc.fiber    + (l.fiberConsumed    || 0),
      water:    acc.water    + (l.waterIntake      || 0),
      burned:   acc.burned   + (l.caloriesBurned   || 0),
      items:    acc.items    + (l.foodItems?.length || 0),
      volume:   acc.volume   + (l.workoutVolume    || 0),
      workouts: acc.workouts + (l.workoutCompleted ? 1 : 0),
    }), {
      calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0,
      water: 0, burned: 0, items: 0, volume: 0, workouts: 0,
    });
    const avg = (n: number) => (days > 0 ? Math.round(n / days) : 0);

    // ---- Streak: longest run of consecutive logged days in the window ----
    const dateKeys = new Set(logsInWindow.map(l => new Date(l.date).toDateString()));
    let longestStreak = 0;
    let currentRun = 0;
    const probe = new Date(window.start);
    const end = new Date(window.end);
    while (probe <= end) {
      if (dateKeys.has(probe.toDateString())) {
        currentRun += 1;
        if (currentRun > longestStreak) longestStreak = currentRun;
      } else {
        currentRun = 0;
      }
      probe.setDate(probe.getDate() + 1);
    }
    // Live streak counting backwards from today.
    let currentStreak = 0;
    const cursor = new Date(window.end);
    while (cursor >= window.start && dateKeys.has(cursor.toDateString())) {
      currentStreak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    // ---- Best days ----
    const byProtein = [...logsInWindow].sort((a, b) => (b.proteinConsumed || 0) - (a.proteinConsumed || 0))[0];
    const byBurn    = [...logsInWindow].sort((a, b) => (b.caloriesBurned  || 0) - (a.caloriesBurned  || 0))[0];
    const byVolume  = [...logsInWindow].sort((a, b) => (b.workoutVolume   || 0) - (a.workoutVolume   || 0))[0];
    const closestToTarget = logsInWindow.reduce<DailyLog | null>((best, l) => {
      if (!best) return l;
      const cur = Math.abs((l.caloriesConsumed || 0) - targets.calories);
      const prev = Math.abs((best.caloriesConsumed || 0) - targets.calories);
      return cur < prev ? l : best;
    }, null);

    // ---- Top foods (from foodHistory, weighted by loggedCount) ----
    const mealCounts = new Map<string, { count: number; protein: number; calories: number }>();
    for (const entry of (foodHistory || [])) {
      const c = entry.loggedCount ?? 1;
      const cur = mealCounts.get(entry.label);
      mealCounts.set(entry.label, {
        count: (cur?.count || 0) + c,
        protein: entry.totalProtein || cur?.protein || 0,
        calories: entry.totalCalories || cur?.calories || 0,
      });
    }
    const topMeals = [...mealCounts.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([name, info]) => ({ name, ...info }));

    // ---- Top protein source ----
    const topProteinFood = [...mealCounts.entries()]
      .filter(([, info]) => info.protein >= 15) // floor to avoid "water" topping the list
      .sort((a, b) => b[1].protein * b[1].count - a[1].protein * a[1].count)[0];

    // ---- Body delta (weight in window) ----
    // Use explicit check-ins only; daily logs can contain legacy snapshots.
    const weightLogs = weighIns
      .filter(entry => {
        const date = new Date(`${entry.date}T12:00:00`);
        return date >= window.start && date <= window.end;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const firstWeight = weightLogs[0]?.weight;
    const lastWeight  = weightLogs[weightLogs.length - 1]?.weight;
    const weightDelta = (firstWeight && lastWeight) ? (lastWeight - firstWeight) : null;

    // ---- Body fat delta (from InBody if present) ----
    // We don't have per-day BF in dailyLogs, but profile.inBodyData is the
    // most recent reading. Surface it only if it falls inside the window.
    const inBody = profile.inBodyData;
    let bfDelta: number | null = null;
    if (inBody && inBody.date) {
      const inBodyDate = new Date(inBody.date);
      if (inBodyDate >= window.start && inBodyDate <= window.end && profile.bodyFat) {
        // crude — show *current* BF as the snapshot value; no delta unless
        // we had a starting BF measurement, which we don't track historically.
        bfDelta = null;
      }
    }

    // ---- Patterns: best day of week (highest avg target-hit ratio) ----
    const byDOW: Record<number, { sum: number; n: number; ratioSum: number }> =
      { 0: { sum: 0, n: 0, ratioSum: 0 }, 1: { sum: 0, n: 0, ratioSum: 0 }, 2: { sum: 0, n: 0, ratioSum: 0 },
        3: { sum: 0, n: 0, ratioSum: 0 }, 4: { sum: 0, n: 0, ratioSum: 0 }, 5: { sum: 0, n: 0, ratioSum: 0 },
        6: { sum: 0, n: 0, ratioSum: 0 } };
    for (const l of logsInWindow) {
      const dow = new Date(l.date).getDay();
      byDOW[dow].sum += (l.caloriesConsumed || 0);
      byDOW[dow].n   += 1;
      byDOW[dow].ratioSum += Math.min(1, (l.proteinConsumed || 0) / Math.max(1, targets.protein));
    }
    const bestDOW = Object.entries(byDOW)
      .filter(([, v]) => v.n > 0)
      .sort(([, a], [, b]) => (b.ratioSum / b.n) - (a.ratioSum / a.n))[0];

    // ---- Hydration trend: avg oz/day vs 64oz baseline ----
    const avgWater = avg(totals.water);
    const hydrationStatus =
      avgWater >= 80 ? 'crushing-it' :
      avgWater >= 60 ? 'on-track' :
      avgWater >= 40 ? 'room-to-grow' : 'needs-attention';

    // ---- Body-part XP totals ----
    const totalXP = Object.values(bodyStats || {}).reduce((acc: number, part: any) => {
      return acc + ((part?.level || 0) * 100) + (part?.currentXP || 0);
    }, 0);
    const topBodyPart = Object.entries(bodyStats || {})
      .sort(([, a]: any, [, b]: any) => ((b?.level || 0) - (a?.level || 0)) || ((b?.currentXP || 0) - (a?.currentXP || 0)))[0];

    return {
      days,
      totals,
      averages: {
        calories: avg(totals.calories),
        protein:  avg(totals.protein),
        carbs:    avg(totals.carbs),
        fat:      avg(totals.fat),
        fiber:    avg(totals.fiber),
        water:    avgWater,
        burned:   avg(totals.burned),
      },
      longestStreak,
      currentStreak,
      bestProtein: byProtein,
      bestBurn: byBurn,
      bestVolume: byVolume,
      bestTargetDay: closestToTarget,
      topMeals,
      topProteinFood: topProteinFood ? { name: topProteinFood[0], ...topProteinFood[1] } : null,
      weightDelta,
      firstWeight,
      lastWeight,
      bfDelta,
      bestDOW: bestDOW ? Number(bestDOW[0]) : null,
      hydrationStatus,
      totalXP,
      topBodyPart: topBodyPart ? { name: topBodyPart[0], ...(topBodyPart[1] as any) } : null,
      workoutsThisWeek: weeklyCompletedWorkouts.length,
    };
  }, [logsInWindow, targets.calories, targets.protein, foodHistory, weeklyCompletedWorkouts, bodyStats, profile.bodyFat, profile.inBodyData, weighIns, window]);

  // ---- Headline / vibe based on consistency ----
  const consistencyPct = stats.days / (period === 'week' ? 7 : 30);
  // Cuodi voice vibe headlines — see VOICE.md. Top tier rotates through a
  // pool so heavy users don't read the same line every visit; the pick is
  // stable for a given view (seeded by day) so it doesn't flicker on
  // re-renders.
  const vibe = useMemo(() => {
    const firePool = [
      { title: 'This is crazy', sub: 'you are more consistent then me and I\'m a program!' },
      { title: 'Keep up the great work!', sub: 'Seriously — this streak is something.' },
      { title: 'Keep moving forward!', sub: 'The trail rewards showing up. You keep showing up.' },
    ];
    if (consistencyPct >= 0.85) {
      const daySeed = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
      return { ...firePool[daySeed % firePool.length], tone: 'fire' };
    }
    if (consistencyPct >= 0.6)  return { title: 'We love to see this!', sub: 'Keep this rolling.', tone: 'growing' };
    if (consistencyPct >= 0.3)  return { title: 'Keep going!', sub: 'It can only get better from here.', tone: 'steady' };
    return { title: 'Day by day it will get better', sub: '(if you, ya know use the app)', tone: 'fresh' };
  }, [consistencyPct, period]);

  // ----- RENDER ------------------------------------------------------------
  const firstName = (profile.name || 'You').split(' ')[0];
  const round = (n: number) => Math.round(n);

  // The body is the same in both modes — only the outer chrome differs.
  // Inline mode skips the sticky top-bar (the tab nav itself provides chrome)
  // and uses tab-friendly padding instead of overlay padding.
  const body = (
    <>
      {/* Top bar — only in overlay mode. Inline mode is inside a tab,
          so the user navigates with the bottom dock instead of a close button. */}
      {!inline && (
        <div className="sticky top-0 z-10 backdrop-blur-md bg-[#0d0a08]/85 border-b border-white/5 px-4 py-3 flex items-center justify-between max-w-md mx-auto">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#d97757] flex items-center justify-center">
              <Feather className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-orange-300 leading-none">
                {autoPrompted ? 'New month' : 'Your wrapped'}
              </div>
              <div className="text-[9px] text-gray-500 leading-none mt-0.5">{periodLabel}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gray-300 hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className={inline ? 'space-y-5 pb-2' : 'max-w-md mx-auto px-4 pb-32 pt-2 space-y-5'}>
          {/* Period toggle */}
          <div className="flex gap-1.5 px-1">
            {(['week', 'month'] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`flex-1 py-2 rounded-full text-[10px] uppercase tracking-widest font-bold transition-all ${
                  period === p
                    ? 'bg-[#d97757] text-white shadow-md'
                    : 'bg-white/5 text-gray-400 hover:bg-white/10'
                }`}
              >
                {p === 'week' ? 'Last 7 Days' : 'Last 30 Days'}
              </button>
            ))}
          </div>

          {/* Empty state */}
          {stats.days === 0 && (
            <div className="bg-white/5 border border-white/10 rounded-3xl p-10 text-center mt-8">
              <div className="text-5xl mb-3 opacity-50">📊</div>
              <h3 className="text-white font-bold mb-1">No Wrapped yet</h3>
              <p className="text-[11px] text-gray-500">
                Log a few days in the last {period === 'week' ? '7' : '30'} days and your story will appear here.
              </p>
            </div>
          )}

          {stats.days > 0 && (
            <>
              {/* ───────────────── HERO ───────────────── */}
              <motion.section
                key={`hero-${period}`}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45 }}
                className="relative rounded-[2rem] overflow-hidden border border-white/10 px-6 pt-8 pb-7"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-[#d97757]/20 via-[#c97b6e]/12 to-[#d4a55a]/15 pointer-events-none" />
                <div className="absolute -top-20 -right-16 w-64 h-64 rounded-full bg-orange-500/20 blur-3xl pointer-events-none" />
                <div className="absolute -bottom-24 -left-10 w-72 h-72 rounded-full bg-purple-500/15 blur-3xl pointer-events-none" />
                <div className="relative">
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15, duration: 0.4 }}
                    className="text-[10px] font-bold uppercase tracking-[0.25em] text-orange-300 mb-2"
                  >
                    {firstName}'s {period === 'week' ? 'week' : 'month'}
                  </motion.div>
                  <motion.h1
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25, duration: 0.5 }}
                    className="text-[34px] leading-[1.05] font-bold text-white tracking-tight"
                  >
                    {vibe.title}
                  </motion.h1>
                  <motion.p
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4, duration: 0.4 }}
                    className="text-sm text-white/70 mt-3 max-w-[28ch]"
                  >
                    {vibe.sub}
                  </motion.p>

                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.55, duration: 0.4 }}
                    className="flex gap-3 mt-6"
                  >
                    <HeroStat value={String(stats.days)} label={`day${stats.days !== 1 ? 's' : ''} logged`} />
                    <HeroStat value={String(stats.longestStreak)} label="day streak" />
                    <HeroStat value={String(stats.totals.items)} label="items tracked" />
                  </motion.div>
                </div>
              </motion.section>

              {/* ─────────── STREAK STORY ─────────── */}
              <FadeIn>
                <SectionHeading icon={<Calendar className="w-3.5 h-3.5" />} label="Consistency" />
                <div className="rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-emerald-500/[0.04] to-transparent p-5">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-emerald-300 font-bold">Longest streak</div>
                      <div className="text-5xl font-bold text-white tabular-nums leading-none mt-2">
                        {stats.longestStreak}
                        <span className="text-base text-gray-500 font-normal ml-2">days</span>
                      </div>
                      {stats.currentStreak > 0 && (
                        <div className="text-[11px] text-emerald-300/80 mt-2">
                          🔥 You're on day <span className="font-bold text-white">{stats.currentStreak}</span> right now.
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Active</div>
                      <div className="text-2xl font-bold text-white tabular-nums leading-none mt-2">
                        {Math.round(consistencyPct * 100)}%
                      </div>
                      <div className="text-[10px] text-gray-500 mt-1">of the {period === 'week' ? 'week' : 'month'}</div>
                    </div>
                  </div>
                </div>
              </FadeIn>

              {/* ─────────── CALORIES + MACROS ─────────── */}
              <FadeIn delay={0.05}>
                <SectionHeading icon={<Flame className="w-3.5 h-3.5" />} label="Fuel" />
                <div className="rounded-3xl border border-[#d97757]/25 bg-[#d97757]/[0.06] p-5">
                  <div className="text-[10px] uppercase tracking-widest text-orange-300 font-bold">Total calories</div>
                  <div className="text-5xl font-bold text-white tabular-nums leading-none mt-2">
                    {round(stats.totals.calories).toLocaleString()}
                  </div>
                  <div className="text-[11px] text-gray-400 mt-2">
                    averaging <span className="text-white font-bold">{stats.averages.calories.toLocaleString()} kcal</span> per logged day
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2.5">
                  <MacroChip accent="emerald" icon={<Beef className="w-3.5 h-3.5" />} label="Protein"
                    total={`${round(stats.totals.protein)}g`} avg={`${stats.averages.protein}g/d`} />
                  <MacroChip accent="blue" icon={<Wheat className="w-3.5 h-3.5" />} label="Carbs"
                    total={`${round(stats.totals.carbs)}g`} avg={`${stats.averages.carbs}g/d`} />
                  <MacroChip accent="amber" icon={<Zap className="w-3.5 h-3.5" />} label="Fat"
                    total={`${round(stats.totals.fat)}g`} avg={`${stats.averages.fat}g/d`} />
                </div>
              </FadeIn>

              {/* ─────────── TOP FOODS ─────────── */}
              {stats.topMeals.length > 0 && (
                <FadeIn delay={0.08}>
                  <SectionHeading icon={<Trophy className="w-3.5 h-3.5" />} label="Your top foods" />
                  <div className="rounded-3xl border border-white/10 bg-white/[0.03] overflow-hidden">
                    {stats.topMeals.map((meal, idx) => (
                      <motion.div
                        key={meal.name}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.12 + idx * 0.06, duration: 0.3 }}
                        className={`flex items-center gap-3 px-4 py-3 ${idx > 0 ? 'border-t border-white/5' : ''}`}
                      >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm tabular-nums shrink-0 ${
                          idx === 0 ? 'bg-[#d97757] text-white shadow-md' :
                          idx === 1 ? 'bg-orange-500/30 text-orange-200' :
                                       'bg-white/5 text-gray-300'
                        }`}>
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold text-white truncate">{meal.name}</div>
                          <div className="text-[10px] text-gray-500">
                            {meal.count}× · {Math.round(meal.calories)} kcal · {Math.round(meal.protein)}g protein
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                  {stats.topProteinFood && (
                    <div className="mt-2.5 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] px-4 py-3 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center text-emerald-300">
                        <Beef className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">Top protein source</div>
                        <div className="text-sm font-bold text-white truncate">{stats.topProteinFood.name}</div>
                      </div>
                    </div>
                  )}
                </FadeIn>
              )}

              {/* ─────────── WORKOUTS + XP ─────────── */}
              <FadeIn delay={0.1}>
                <SectionHeading icon={<Dumbbell className="w-3.5 h-3.5" />} label="Training" />
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-2xl border border-blue-500/25 bg-blue-500/[0.05] p-4">
                    <div className="text-[10px] uppercase tracking-widest text-blue-300 font-bold">Workouts</div>
                    <div className="text-3xl font-bold text-white tabular-nums leading-none mt-2">
                      {period === 'week' ? stats.workoutsThisWeek : stats.totals.workouts}
                    </div>
                    <div className="text-[10px] text-gray-500 mt-1">
                      {period === 'week' ? 'this training week' : 'completed sessions'}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-violet-500/25 bg-violet-500/[0.05] p-4">
                    <div className="text-[10px] uppercase tracking-widest text-violet-300 font-bold">Total volume</div>
                    <div className="text-3xl font-bold text-white tabular-nums leading-none mt-2">
                      {round(stats.totals.volume).toLocaleString()}
                      <span className="text-xs text-gray-500 font-normal ml-1">lb</span>
                    </div>
                    <div className="text-[10px] text-gray-500 mt-1">lifted across the {period}</div>
                  </div>
                </div>
                {stats.topBodyPart && (stats.topBodyPart.level || 0) > 0 && (
                  <div className="mt-2.5 rounded-2xl border border-pink-500/25 bg-pink-500/[0.04] p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-pink-500/15 flex items-center justify-center text-pink-300">
                      <TrendingUp className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-pink-300">Strongest body part</div>
                      <div className="text-sm font-bold text-white capitalize">
                        {stats.topBodyPart.name} <span className="text-pink-300/80 font-normal">— Level {stats.topBodyPart.level}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-gray-500">XP total</div>
                      <div className="text-sm font-bold text-white tabular-nums">{stats.totalXP.toLocaleString()}</div>
                    </div>
                  </div>
                )}
              </FadeIn>

              {/* ─────────── BODY CHANGES ─────────── */}
              {(stats.weightDelta !== null || stats.firstWeight) && (
                <FadeIn delay={0.12}>
                  <SectionHeading icon={<Heart className="w-3.5 h-3.5" />} label="Your body" />
                  <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                    {stats.firstWeight && stats.lastWeight && (
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <div className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Weight</div>
                          <div className="text-xs text-gray-500 mt-1 tabular-nums">
                            {round(stats.firstWeight)} → {round(stats.lastWeight)} lb
                          </div>
                        </div>
                        {stats.weightDelta !== null && (
                          <div className={`text-2xl font-bold tabular-nums ${
                            stats.weightDelta < 0 ? 'text-emerald-300' :
                            stats.weightDelta > 0 ? 'text-orange-300' : 'text-gray-300'
                          }`}>
                            {stats.weightDelta > 0 ? '+' : ''}{stats.weightDelta.toFixed(1)} lb
                          </div>
                        )}
                      </div>
                    )}
                    {profile.bodyFat && (
                      <div className="flex items-center justify-between gap-4 mt-3 pt-3 border-t border-white/5">
                        <div>
                          <div className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Body fat (current)</div>
                          <div className="text-xs text-gray-500 mt-1">latest reading</div>
                        </div>
                        <div className="text-2xl font-bold tabular-nums text-cyan-300">
                          {profile.bodyFat.toFixed(1)}%
                        </div>
                      </div>
                    )}
                    <p className="text-[10px] text-gray-600 italic mt-3 leading-snug">
                      One {period === 'week' ? 'week' : 'month'} is a snapshot, not a verdict. Trends matter more than any single number.
                    </p>
                  </div>
                </FadeIn>
              )}

              {/* ─────────── BEST DAYS ─────────── */}
              <FadeIn delay={0.14}>
                <SectionHeading icon={<Award className="w-3.5 h-3.5" />} label="Standout days" />
                <div className="space-y-2">
                  {stats.bestProtein && (stats.bestProtein.proteinConsumed || 0) > 0 && (
                    <StandoutRow icon={<Trophy className="w-4 h-4 text-emerald-400" />}
                      label="Highest protein"
                      date={stats.bestProtein.date}
                      value={`${round(stats.bestProtein.proteinConsumed || 0)}g`} />
                  )}
                  {stats.bestTargetDay && (
                    <StandoutRow icon={<Award className="w-4 h-4 text-orange-400" />}
                      label="Closest to calorie target"
                      date={stats.bestTargetDay.date}
                      value={`${round(stats.bestTargetDay.caloriesConsumed || 0)} / ${targets.calories}`} />
                  )}
                  {stats.bestBurn && (stats.bestBurn.caloriesBurned || 0) > 0 && (
                    <StandoutRow icon={<Flame className="w-4 h-4 text-pink-400" />}
                      label="Most active day"
                      date={stats.bestBurn.date}
                      value={`${round(stats.bestBurn.caloriesBurned || 0)} kcal`} />
                  )}
                  {stats.bestVolume && (stats.bestVolume.workoutVolume || 0) > 0 && (
                    <StandoutRow icon={<Dumbbell className="w-4 h-4 text-blue-400" />}
                      label="Heaviest workout"
                      date={stats.bestVolume.date}
                      value={`${round(stats.bestVolume.workoutVolume || 0).toLocaleString()} lb`} />
                  )}
                </div>
              </FadeIn>

              {/* ─────────── PATTERNS ─────────── */}
              <FadeIn delay={0.16}>
                <SectionHeading icon={<Activity className="w-3.5 h-3.5" />} label="Patterns" />
                <div className="grid grid-cols-2 gap-2.5">
                  {stats.bestDOW !== null && (
                    <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.05] p-4">
                      <div className="text-[10px] uppercase tracking-widest text-amber-300 font-bold">Best day</div>
                      <div className="text-3xl font-bold text-white leading-none mt-2">
                        {DAY_NAMES[stats.bestDOW]}
                      </div>
                      <div className="text-[10px] text-gray-500 mt-1">highest protein-hit rate</div>
                    </div>
                  )}
                  <div className={`rounded-2xl border p-4 ${
                    stats.hydrationStatus === 'crushing-it' ? 'border-cyan-500/30 bg-cyan-500/[0.07]' :
                    stats.hydrationStatus === 'on-track'    ? 'border-cyan-500/25 bg-cyan-500/[0.05]' :
                    stats.hydrationStatus === 'room-to-grow'? 'border-amber-500/20 bg-amber-500/[0.04]' :
                                                              'border-orange-500/25 bg-orange-500/[0.05]'
                  }`}>
                    <div className={`text-[10px] uppercase tracking-widest font-bold ${
                      stats.hydrationStatus === 'needs-attention' ? 'text-orange-300' : 'text-cyan-300'
                    }`}>
                      <Droplets className="w-3 h-3 inline mr-1 -mt-0.5" />
                      Hydration
                    </div>
                    <div className="text-3xl font-bold text-white tabular-nums leading-none mt-2">
                      {stats.averages.water}
                      <span className="text-xs text-gray-500 font-normal ml-1">oz/d</span>
                    </div>
                    <div className="text-[10px] text-gray-500 mt-1">
                      {stats.hydrationStatus === 'crushing-it'   && 'Above the 80oz line. Keep it.'}
                      {stats.hydrationStatus === 'on-track'      && 'Solid, hitting your range.'}
                      {stats.hydrationStatus === 'room-to-grow'  && 'Bump up toward 60–80oz.'}
                      {stats.hydrationStatus === 'needs-attention' && 'Most days under 40oz.'}
                    </div>
                  </div>
                </div>
              </FadeIn>

              {/* ─────────── CLOSING ─────────── */}
              <FadeIn delay={0.2}>
                <div className="mt-6 rounded-[2rem] overflow-hidden border border-white/10 px-6 py-7 relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-[#d97757]/15 via-[#c97b6e]/10 to-[#d4a55a]/12 pointer-events-none" />
                  <div className="relative text-center">
                    <Feather className="w-6 h-6 text-orange-300 mx-auto mb-3" strokeWidth={1.5} />
                    <div className="text-[10px] uppercase tracking-[0.25em] text-orange-300 font-bold">Your currently forged path</div>
                    <h3 className="text-xl font-bold text-white mt-2">
                      Walk on, {firstName}
                    </h3>
                    <p className="text-[12px] text-gray-400 mt-2 max-w-[28ch] mx-auto">
                      Your steps are forged. Take more.
                    </p>
                    <button
                      onClick={onClose}
                      className="mt-5 inline-flex items-center gap-1.5 bg-white/5 border border-white/10 hover:bg-white/10 px-4 py-2 rounded-full text-xs font-bold text-white transition-colors"
                    >
                      Back to the app
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </FadeIn>

              <p className="text-[9px] text-gray-600 italic text-center pt-2">
                Stats reflect only days you logged · empty days are not counted
              </p>
            </>
          )}
        </div>
    </>
  );

  // Inline mode: render as page content inside an existing tab.
  if (inline) {
    return <div className="animate-fade-in">{body}</div>;
  }

  // Overlay mode: fullscreen, dim background, sticky close header.
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="fixed inset-0 z-[100] bg-[#0d0a08] overflow-y-auto"
      >
        {body}
      </motion.div>
    </AnimatePresence>
  );
};

// ───────────── helpers ─────────────

const FadeIn: React.FC<{ children: React.ReactNode; delay?: number }> = ({ children, delay = 0 }) => (
  <motion.section
    initial={{ opacity: 0, y: 14 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: '-50px' }}
    transition={{ duration: 0.45, delay }}
    className="space-y-2"
  >
    {children}
  </motion.section>
);

const SectionHeading: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (
  <div className="flex items-center gap-1.5 px-1">
    <span className="text-gray-500">{icon}</span>
    <h3 className="text-[10px] font-bold uppercase tracking-[0.25em] text-gray-400">{label}</h3>
  </div>
);

const HeroStat: React.FC<{ value: string; label: string }> = ({ value, label }) => (
  <div className="flex-1 min-w-0 bg-black/30 backdrop-blur-sm border border-white/10 rounded-2xl px-3 py-2.5">
    <div className="text-xl font-bold text-white tabular-nums leading-none">{value}</div>
    <div className="text-[9px] uppercase tracking-widest text-white/60 mt-1 leading-tight">{label}</div>
  </div>
);

interface MacroChipProps {
  accent: 'emerald' | 'blue' | 'amber';
  icon: React.ReactNode;
  label: string;
  total: string;
  avg: string;
}
const MacroChip: React.FC<MacroChipProps> = ({ accent, icon, label, total, avg }) => {
  const styles: Record<MacroChipProps['accent'], { border: string; bg: string; text: string }> = {
    emerald: { border: 'border-emerald-500/25', bg: 'bg-emerald-500/[0.05]', text: 'text-emerald-300' },
    blue:    { border: 'border-blue-500/25',    bg: 'bg-blue-500/[0.05]',    text: 'text-blue-300' },
    amber:   { border: 'border-amber-500/25',   bg: 'bg-amber-500/[0.05]',   text: 'text-amber-300' },
  };
  const s = styles[accent];
  return (
    <div className={`rounded-2xl border ${s.border} ${s.bg} p-3`}>
      <div className={`flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest ${s.text}`}>
        {icon}{label}
      </div>
      <div className="text-xl font-bold text-white tabular-nums leading-none mt-1.5">{total}</div>
      <div className="text-[9px] text-gray-500 mt-1 tabular-nums">{avg}</div>
    </div>
  );
};

const StandoutRow: React.FC<{
  icon: React.ReactNode; label: string; date: string; value: string;
}> = ({ icon, label, date, value }) => (
  <div className="bg-white/[0.03] border border-white/10 rounded-2xl px-4 py-3 flex items-center gap-3">
    <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
      {icon}
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</div>
      <div className="text-sm text-white font-bold tabular-nums">{value}</div>
    </div>
    <div className="text-[10px] text-gray-500 tabular-nums shrink-0">
      {new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
    </div>
  </div>
);

export default Wrapped;
