/**
 * Stats — Wrapped-style insights view.
 *
 * Aggregates the user's last week or month and surfaces it as a celebratory
 * card grid. Pulls everything from data already in AppState — dailyLogs,
 * todayLog, foodHistory — so there's no new data dependency.
 *
 * Rendered inside the Journal tab via a "Day View / Insights" toggle.
 */

import React, { useMemo, useState } from 'react';
import { Flame, Beef, Wheat, Droplets, Trophy, Calendar, Zap, Activity, Star, Award, TrendingUp } from 'lucide-react';
import type { DailyLog, FoodItem, HistoryEntry, UserProfile, NutritionTargets } from '../types';

interface StatsProps {
  dailyLogs: DailyLog[];
  todayLog: FoodItem[];
  todayActivityBurn: number;
  todayWaterIntake: number;
  foodHistory: HistoryEntry[];
  profile: UserProfile;
  targets: NutritionTargets;
  weeklyCompletedWorkouts?: string[];
}

type Period = 'week' | 'month';

// Predicate matching what the Journal uses to filter empty placeholder days.
const hasRealActivity = (log: DailyLog): boolean =>
  (log.foodItems && log.foodItems.length > 0) ||
  (log.caloriesConsumed || 0) > 0 ||
  (log.waterIntake || 0) > 0 ||
  (log.caloriesBurned || 0) > 0;

export const Stats: React.FC<StatsProps> = ({
  dailyLogs,
  todayLog,
  todayActivityBurn,
  todayWaterIntake,
  foodHistory,
  profile,
  targets,
  weeklyCompletedWorkouts = [],
}) => {
  const [period, setPeriod] = useState<Period>('week');

  // ----- DATE WINDOW -------------------------------------------------------
  const window = useMemo(() => {
    const todayD = new Date();
    todayD.setHours(0, 0, 0, 0);
    const start = new Date(todayD);
    if (period === 'week') {
      start.setDate(start.getDate() - 6); // last 7 days including today
    } else {
      start.setDate(start.getDate() - 29); // last 30 days including today
    }
    return { start, end: todayD };
  }, [period]);

  const periodLabel = useMemo(() => {
    const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `${fmt(window.start)} – ${fmt(window.end)}`;
  }, [window]);

  // ----- ASSEMBLE LOGS IN WINDOW ------------------------------------------
  // Today's live data isn't in dailyLogs yet, so we construct a today-entry
  // and merge it in. Then filter to the window + real activity only.
  const logsInWindow = useMemo<DailyLog[]>(() => {
    const todayStr = new Date().toLocaleDateString();
    const todayEntry: DailyLog = {
      date: todayStr,
      weight: profile.weight || 0,
      caloriesConsumed: todayLog.reduce((acc, i) => acc + (i.calories || 0), 0),
      proteinConsumed:  todayLog.reduce((acc, i) => acc + (i.protein  || 0), 0),
      carbsConsumed:    todayLog.reduce((acc, i) => acc + (i.carbs    || 0), 0),
      fatConsumed:      todayLog.reduce((acc, i) => acc + (i.fat      || 0), 0),
      fiberConsumed:    todayLog.reduce((acc, i) => acc + (i.fiber    || 0), 0),
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
    }), { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, water: 0, burned: 0, items: 0 });

    const avg = (n: number) => (days > 0 ? Math.round(n / days) : 0);

    // Best days
    const byProtein = [...logsInWindow].sort((a, b) => (b.proteinConsumed || 0) - (a.proteinConsumed || 0))[0];
    const byBurn    = [...logsInWindow].sort((a, b) => (b.caloriesBurned  || 0) - (a.caloriesBurned  || 0))[0];
    const closestToTarget = logsInWindow.reduce<DailyLog | null>((best, l) => {
      if (!best) return l;
      const cur = Math.abs((l.caloriesConsumed || 0) - targets.calories);
      const prev = Math.abs((best.caloriesConsumed || 0) - targets.calories);
      return cur < prev ? l : best;
    }, null);

    // Most-logged meal — from foodHistory, weighted by loggedCount where present.
    const mealCounts = new Map<string, number>();
    for (const entry of (foodHistory || [])) {
      const count = entry.loggedCount ?? 1;
      mealCounts.set(entry.label, (mealCounts.get(entry.label) || 0) + count);
    }
    const topMeals = [...mealCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    // Workouts completed — current week only (we don't store historical workout completions per day).
    const workoutsThisWeek = weeklyCompletedWorkouts.length;

    return {
      days,
      totals,
      averages: {
        calories: avg(totals.calories),
        protein:  avg(totals.protein),
        carbs:    avg(totals.carbs),
        fat:      avg(totals.fat),
        fiber:    avg(totals.fiber),
        water:    avg(totals.water),
        burned:   avg(totals.burned),
      },
      bestProtein: byProtein,
      bestBurn: byBurn,
      bestTargetDay: closestToTarget,
      topMeals,
      workoutsThisWeek,
    };
  }, [logsInWindow, targets.calories, foodHistory, weeklyCompletedWorkouts]);

  // ----- RENDER HELPERS ----------------------------------------------------
  const Card: React.FC<{
    accent?: 'orange' | 'emerald' | 'blue' | 'amber' | 'cyan' | 'pink' | 'violet';
    icon: React.ReactNode;
    label: string;
    big: React.ReactNode;
    sub?: string;
    className?: string;
  }> = ({ accent = 'orange', icon, label, big, sub, className = '' }) => {
    const accents: Record<NonNullable<typeof accent>, { border: string; bg: string; text: string; iconBg: string }> = {
      orange:  { border: 'border-orange-500/25',  bg: 'bg-orange-500/[0.04]',  text: 'text-orange-300',  iconBg: 'bg-orange-500/15' },
      emerald: { border: 'border-emerald-500/25', bg: 'bg-emerald-500/[0.04]', text: 'text-emerald-300', iconBg: 'bg-emerald-500/15' },
      blue:    { border: 'border-blue-500/25',    bg: 'bg-blue-500/[0.04]',    text: 'text-blue-300',    iconBg: 'bg-blue-500/15' },
      amber:   { border: 'border-amber-500/25',   bg: 'bg-amber-500/[0.04]',   text: 'text-amber-300',   iconBg: 'bg-amber-500/15' },
      cyan:    { border: 'border-cyan-500/25',    bg: 'bg-cyan-500/[0.04]',    text: 'text-cyan-300',    iconBg: 'bg-cyan-500/15' },
      pink:    { border: 'border-pink-500/25',    bg: 'bg-pink-500/[0.04]',    text: 'text-pink-300',    iconBg: 'bg-pink-500/15' },
      violet:  { border: 'border-violet-500/25',  bg: 'bg-violet-500/[0.04]',  text: 'text-violet-300',  iconBg: 'bg-violet-500/15' },
    };
    const a = accents[accent];
    return (
      <div className={`${a.bg} border ${a.border} rounded-2xl p-4 flex flex-col gap-2 ${className}`}>
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg ${a.iconBg} flex items-center justify-center ${a.text}`}>
            {icon}
          </div>
          <span className={`text-[10px] font-bold uppercase tracking-widest ${a.text}`}>{label}</span>
        </div>
        <div className="text-2xl font-bold text-white tracking-tight tabular-nums leading-tight">
          {big}
        </div>
        {sub && <div className="text-[11px] text-gray-500 leading-snug">{sub}</div>}
      </div>
    );
  };

  // Empty state — no logs in the window yet.
  if (stats.days === 0) {
    return (
      <div className="space-y-4 pb-24">
        <PeriodToggle period={period} onChange={setPeriod} />
        <div className="bg-white/5 border border-white/10 rounded-3xl p-10 text-center">
          <div className="text-5xl mb-3 opacity-50">📊</div>
          <h3 className="text-white font-bold mb-1">No insights yet</h3>
          <p className="text-[11px] text-gray-500">
            Log food for at least one day in the last {period === 'week' ? '7' : '30'} days
            to unlock your {period === 'week' ? 'weekly' : 'monthly'} stats.
          </p>
        </div>
      </div>
    );
  }

  const round = (n: number) => Math.round(n);

  return (
    <div className="space-y-4 pb-24">
      <PeriodToggle period={period} onChange={setPeriod} />

      {/* HERO CARD — period summary */}
      <div className="rounded-3xl p-5 border border-white/10 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 via-pink-500/10 to-purple-500/10 pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-1.5">
            <Star className="w-4 h-4 text-orange-400" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-orange-300">
              Your {period === 'week' ? 'Week' : 'Month'}
            </span>
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight mb-1">{periodLabel}</h2>
          <p className="text-[12px] text-gray-400">
            <span className="text-white font-bold">{stats.days}</span> day{stats.days !== 1 ? 's' : ''} logged
            {' · '}
            <span className="text-white font-bold">{stats.totals.items}</span> item{stats.totals.items !== 1 ? 's' : ''} tracked
          </p>
        </div>
      </div>

      {/* MACRO TOTALS */}
      <div className="grid grid-cols-2 gap-2.5">
        <Card
          accent="orange"
          icon={<Flame className="w-4 h-4" />}
          label="Calories"
          big={<>{round(stats.totals.calories).toLocaleString()}<span className="text-sm text-gray-500 font-normal"> total</span></>}
          sub={`avg ${round(stats.averages.calories).toLocaleString()} kcal/day`}
        />
        <Card
          accent="emerald"
          icon={<Beef className="w-4 h-4" />}
          label="Protein"
          big={<>{round(stats.totals.protein)}g<span className="text-sm text-gray-500 font-normal"> total</span></>}
          sub={`avg ${stats.averages.protein}g/day`}
        />
        <Card
          accent="blue"
          icon={<Wheat className="w-4 h-4" />}
          label="Carbs"
          big={<>{round(stats.totals.carbs)}g<span className="text-sm text-gray-500 font-normal"> total</span></>}
          sub={`avg ${stats.averages.carbs}g/day`}
        />
        <Card
          accent="amber"
          icon={<Zap className="w-4 h-4" />}
          label="Fat"
          big={<>{round(stats.totals.fat)}g<span className="text-sm text-gray-500 font-normal"> total</span></>}
          sub={`avg ${stats.averages.fat}g/day`}
        />
        <Card
          accent="cyan"
          icon={<Droplets className="w-4 h-4" />}
          label="Water"
          big={<>{round(stats.totals.water)}<span className="text-sm text-gray-500 font-normal"> oz</span></>}
          sub={`avg ${stats.averages.water} oz/day`}
        />
        <Card
          accent="pink"
          icon={<Activity className="w-4 h-4" />}
          label="Burned"
          big={<>{round(stats.totals.burned).toLocaleString()}<span className="text-sm text-gray-500 font-normal"> kcal</span></>}
          sub={`avg ${stats.averages.burned} kcal/day`}
        />
      </div>

      {/* STANDOUT DAYS */}
      {stats.bestProtein && (
        <section className="space-y-2">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 px-1">Best days</h3>
          <div className="space-y-2">
            <StandoutRow
              icon={<Trophy className="w-4 h-4 text-emerald-400" />}
              label="Highest protein"
              date={stats.bestProtein.date}
              value={`${round(stats.bestProtein.proteinConsumed || 0)}g`}
            />
            {stats.bestTargetDay && (
              <StandoutRow
                icon={<Award className="w-4 h-4 text-orange-400" />}
                label="Closest to calorie target"
                date={stats.bestTargetDay.date}
                value={`${round(stats.bestTargetDay.caloriesConsumed || 0)} / ${targets.calories} kcal`}
              />
            )}
            {stats.bestBurn && (stats.bestBurn.caloriesBurned || 0) > 0 && (
              <StandoutRow
                icon={<Flame className="w-4 h-4 text-pink-400" />}
                label="Most active day"
                date={stats.bestBurn.date}
                value={`${round(stats.bestBurn.caloriesBurned || 0)} kcal burned`}
              />
            )}
          </div>
        </section>
      )}

      {/* TOP MEALS */}
      {stats.topMeals.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 px-1">Most logged meals</h3>
          <div className="bg-white/[0.03] border border-white/10 rounded-2xl divide-y divide-white/5">
            {stats.topMeals.map(([name, count], idx) => (
              <div key={name} className="flex items-center gap-3 px-4 py-3">
                <div className="w-7 h-7 rounded-full bg-orange-500/15 flex items-center justify-center text-orange-300 font-bold text-xs">
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-white truncate">{name}</div>
                  <div className="text-[10px] text-gray-500">
                    logged {count}×
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* WORKOUTS THIS WEEK */}
      {period === 'week' && (
        <Card
          accent="violet"
          icon={<TrendingUp className="w-4 h-4" />}
          label="Workouts"
          big={<>{stats.workoutsThisWeek}<span className="text-sm text-gray-500 font-normal"> completed</span></>}
          sub="based on the current training week"
        />
      )}

      {/* CONSISTENCY METER */}
      <Card
        accent="cyan"
        icon={<Calendar className="w-4 h-4" />}
        label="Consistency"
        big={
          <>
            {stats.days}<span className="text-base text-gray-500 font-normal">/{period === 'week' ? 7 : 30} days</span>
          </>
        }
        sub={`${Math.round((stats.days / (period === 'week' ? 7 : 30)) * 100)}% of the period`}
      />

      <p className="text-[9px] text-gray-600 italic text-center pt-2">
        Stats reflect only days you logged · empty days are not counted
      </p>
    </div>
  );
};

// ----- Sub-components ------------------------------------------------------

const PeriodToggle: React.FC<{ period: Period; onChange: (p: Period) => void }> = ({ period, onChange }) => (
  <div className="flex gap-1.5 px-1">
    {(['week', 'month'] as Period[]).map(p => (
      <button
        key={p}
        onClick={() => onChange(p)}
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
);

const StandoutRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  date: string;
  value: string;
}> = ({ icon, label, date, value }) => (
  <div className="bg-white/[0.03] border border-white/10 rounded-2xl px-4 py-3 flex items-center gap-3">
    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
      {icon}
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-[11px] font-bold uppercase tracking-widest text-gray-400">{label}</div>
      <div className="text-sm text-white font-bold tabular-nums">{value}</div>
    </div>
    <div className="text-[11px] text-gray-500 tabular-nums shrink-0">
      {new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
    </div>
  </div>
);

export default Stats;
