/**
 * FuelHome — dashboard v3 (mockup direction).
 *
 * Big emotional hero + open ring + 2x2 quick actions + weight/hydration
 * strip at the bottom. Replaces the previous "dense strip of chips"
 * version. The coach line lives inline as the hero sub-title so the
 * greeting itself feels like it knows you.
 *
 * Layout (top → bottom):
 *   1. Compact date/streak strip
 *   2. Hero: "Morning, Ding 👋" + fire coach sub-line
 *   3. Ring card: ¾-arc CALORIES LEFT hero + clean tinted macro bars
 *   4. Quick actions 2×2: Log Food / Scan Meal / Start Workout / Weigh In
 *   5. Weight Trend + Hydration cards side by side
 *   6. Adaptive TDEE banner (only when actionable)
 *   7. Hidatsa credit footer
 *
 * The weight check-in modal + hydration logging live inside this file.
 */

import React, { useMemo, useState } from 'react';
import {
  Feather, Droplets, Dumbbell, Plus, Camera, Scale, ChevronRight,
  TrendingDown, TrendingUp, Minus, X, Check,
} from 'lucide-react';
import type { UserProfile, NutritionTargets, DailyLog, WeightEntry } from '../types';
import { pickCoachMessage } from './CoachCard';

// ───────────────────── Warm-dark palette ─────────────────────
// Adds `purple` for the fourth quick-action tile (Weigh In). Purple sits
// between fire (action) and sky (info) — it's the "personal check-in" tier.
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
  purple: '#a48ec7',
  protein: '#7ab896',        // protein now GREEN like the mockup — success tone
  fatColor: '#d97757',       // fat gets fire (mockup uses this)
  carbColor: '#e8a85a',      // carbs stay ochre
};

interface FuelHomeProps {
  profile: UserProfile;
  targets: NutritionTargets;
  consumed: { calories: number; protein: number; carbs: number; fat: number };
  activityBurn: number;
  waterIntake: number;
  workoutCompletedToday: boolean;
  streak: number;
  greeting: string;
  dateString: string;
  dailyLogs: DailyLog[];
  weighIns: WeightEntry[];
  onLogWeight: (weight: number) => boolean;
  onQuickAddFood: () => void;
  /** Opens the AddFood sheet directly in AI/scan mode. */
  onScanFood: () => void;
  /** Switches the app tab to the Workouts view. */
  onOpenWorkouts: () => void;
  /** Adds a fixed increment of water (default caller adds 8oz). */
  onLogWater: () => void;
  onOpenReflect: () => void;
  hasEnoughDataForWrapped: boolean;
  adaptiveSuggestion?: {
    hasEnoughData: boolean;
    adjustmentKcal?: number;
    suggestedTdee?: number;
    reason?: string;
  };
  onAcceptAdaptiveSuggestion?: () => void;
}

export const FuelHome: React.FC<FuelHomeProps> = ({
  profile,
  targets,
  consumed,
  activityBurn: _activityBurn,     // no longer surfaced on Home
  waterIntake,
  workoutCompletedToday: _workoutCompletedToday,
  streak,
  greeting,
  dateString,
  dailyLogs,
  weighIns,
  onLogWeight,
  onQuickAddFood,
  onScanFood,
  onOpenWorkouts,
  onLogWater,
  onOpenReflect: _onOpenReflect,
  hasEnoughDataForWrapped: _hasEnoughDataForWrapped,
  adaptiveSuggestion,
  onAcceptAdaptiveSuggestion,
}) => {
  const firstName = (profile.name || 'Warrior').split(' ')[0];
  const [showWeightCheckIn, setShowWeightCheckIn] = useState(false);
  const [weightInput, setWeightInput] = useState(String(profile.weight || ''));
  const [weightError, setWeightError] = useState('');

  // ───────── Math ─────────
  const calRatio = Math.max(0, Math.min(1, consumed.calories / Math.max(1, targets.calories)));
  const remainingCal = Math.max(0, targets.calories - consumed.calories);
  const waterTarget = Math.max(48, Math.min(100, Math.round((profile.weight || 150) * 0.5)));
  const percentOfGoal = Math.round(calRatio * 100);

  // ───────── Days logged, weight summary — same as before ─────────
  const days30 = useMemo(() => {
    const out: { date: string; hadFood: boolean }[] = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const byDate = new Map<string, DailyLog>();
    (dailyLogs || []).forEach(l => {
      if (!l.date) return;
      const parsed = new Date(l.date);
      const key = Number.isNaN(parsed.getTime()) ? l.date : parsed.toLocaleDateString();
      byDate.set(key, l);
    });
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString();
      const log = byDate.get(dateStr);
      out.push({
        date: dateStr,
        hadFood: (i === 0 && (consumed.calories > 0 || consumed.protein > 0 || consumed.carbs > 0 || consumed.fat > 0)) ||
          !!(log && ((log.caloriesConsumed || 0) > 0 || (log.foodItems?.length || 0) > 0)),
      });
    }
    return out;
  }, [dailyLogs, consumed]);
  const foodLogThisWeek = days30.slice(-7).filter(d => d.hadFood).length;

  const weightSummary = useMemo(() => {
    const sorted = [...(weighIns || [])]
      .filter(entry => entry.weight > 50 && entry.weight < 700)
      .sort((a, b) => new Date(`${a.date}T12:00:00`).getTime() - new Date(`${b.date}T12:00:00`).getTime());
    const latest = sorted[sorted.length - 1];
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - 6);
    const thisWeek = sorted.filter(entry => new Date(`${entry.date}T12:00:00`) >= cutoff);
    const change = thisWeek.length >= 2
      ? thisWeek[thisWeek.length - 1].weight - thisWeek[0].weight
      : undefined;
    // Take the last ~14 entries to draw a tiny sparkline.
    const sparkPoints = sorted.slice(-14).map(e => e.weight);
    return { latest, change, thisWeekCount: thisWeek.length, sparkPoints };
  }, [weighIns]);

  // ───────── Coach message (fire sub-line under greeting) ─────────
  const coachMsg = useMemo(() => pickCoachMessage({
    greeting,
    firstName,
    consumed: { calories: consumed.calories, protein: consumed.protein },
    targets: { calories: targets.calories, protein: targets.protein },
    streak,
    weightSummary: {
      change: weightSummary.change,
      latest: weightSummary.latest?.weight,
      thisWeekCount: weightSummary.thisWeekCount,
    },
    daysLoggedThisWeek: foodLogThisWeek,
    weeklyAvgProtein: undefined,
    goalTargetWeight: profile.goalTargetWeight,
  }), [greeting, firstName, consumed, targets, streak, weightSummary, foodLogThisWeek, profile.goalTargetWeight]);

  const openWeightCheckIn = () => {
    setWeightInput(String(weightSummary.latest?.weight || profile.weight || ''));
    setWeightError('');
    setShowWeightCheckIn(true);
  };

  const submitWeight = (event: React.FormEvent) => {
    event.preventDefault();
    const weight = Number(weightInput);
    if (!Number.isFinite(weight) || weight < 50 || weight > 700) {
      setWeightError('Enter a weight between 50 and 700 lbs.');
      return;
    }
    if (onLogWeight(weight)) setShowWeightCheckIn(false);
  };

  return (
    <div className="pb-20 -mx-4 px-4" style={{ background: C.bg, color: C.ink }}>
      {/* ─────── Compact date + streak strip ─────── */}
      <div className="px-1 pt-1 pb-3 flex items-center justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.3em] font-bold" style={{ color: C.inkLight }}>
          {dateString}
        </p>
        {streak >= 2 && (
          <div
            className="flex items-center gap-1.5 px-3 py-1 rounded-full shrink-0"
            style={{ background: `${C.fire}1a`, border: `1px solid ${C.fire}40` }}
          >
            <Feather className="w-3 h-3" strokeWidth={1.5} style={{ color: C.fire }} />
            <span className="text-[10px] font-bold tracking-widest uppercase tabular-nums" style={{ color: C.ochre }}>
              {streak}-day trail
            </span>
          </div>
        )}
      </div>

      {/* ─────── Hero greeting + coach sub-line ─────── */}
      <div className="px-1 pb-4">
        <h1 className="text-[30px] font-bold tracking-tight leading-tight" style={{ color: C.ink }}>
          {greeting}, {firstName} <span aria-hidden>👋</span>
        </h1>
        {coachMsg.body && (
          <p className="text-[15px] font-semibold mt-1 leading-snug" style={{ color: C.fire }}>
            {coachMsg.body}
          </p>
        )}
      </div>

      {/* ─────── Ring card ─────── */}
      <div
        className="rounded-3xl p-6"
        style={{ background: C.card, border: `1px solid ${C.border}` }}
        data-tour="macro-ring"
      >
        <RingHero
          remaining={remainingCal}
          target={targets.calories}
          ratio={calRatio}
          percentOfGoal={percentOfGoal}
        />

        {/* MACROS · DETAILS section */}
        <div className="mt-5 pt-5" style={{ borderTop: `1px solid ${C.border}` }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] uppercase tracking-[0.3em] font-bold" style={{ color: C.inkLight }}>
              Macros
            </span>
            <button
              onClick={_onOpenReflect}
              className="text-[10px] uppercase tracking-[0.25em] font-bold flex items-center gap-1"
              style={{ color: C.inkMid }}
            >
              Details <ChevronRight className="w-3 h-3" strokeWidth={2} />
            </button>
          </div>

          <MacroRow label="Protein" current={consumed.protein} target={targets.protein} color={C.protein} />
          <MacroRow label="Carbs"   current={consumed.carbs}   target={targets.carbs}   color={C.carbColor} />
          <MacroRow label="Fat"     current={consumed.fat}     target={targets.fat}     color={C.fatColor}  />
        </div>
      </div>

      {/* ─────── Quick actions 2×2 ─────── */}
      <div className="grid grid-cols-2 gap-3 mt-4">
        <QuickActionTile
          label="Log Food"
          icon={<Plus className="w-5 h-5" strokeWidth={2.4} />}
          iconBg={C.fire}
          onClick={onQuickAddFood}
        />
        <QuickActionTile
          label="Scan Meal"
          icon={<Camera className="w-5 h-5" strokeWidth={2} />}
          iconBg={C.sky}
          onClick={onScanFood}
        />
        <QuickActionTile
          label="Start Workout"
          icon={<Dumbbell className="w-5 h-5" strokeWidth={2} />}
          iconBg={C.emerald}
          onClick={onOpenWorkouts}
        />
        <QuickActionTile
          label="Weigh In"
          icon={<Scale className="w-5 h-5" strokeWidth={2} />}
          iconBg={C.purple}
          onClick={openWeightCheckIn}
        />
      </div>

      {/* ─────── Weight Trend + Hydration strip ─────── */}
      <div className="grid grid-cols-2 gap-3 mt-3">
        <WeightTrendCard
          latest={weightSummary.latest?.weight}
          change={weightSummary.change}
          sparkPoints={weightSummary.sparkPoints}
        />
        <HydrationCard
          intake={waterIntake}
          target={waterTarget}
          onLog={onLogWater}
        />
      </div>

      {/* ─────── Adaptive TDEE banner ─────── */}
      {adaptiveSuggestion?.hasEnoughData &&
       Math.abs(adaptiveSuggestion.adjustmentKcal || 0) >= 50 && (
        <div
          className="rounded-2xl p-4 mt-4 flex items-start gap-3"
          style={{ background: `${C.sky}12`, border: `1px solid ${C.sky}40` }}
        >
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-[0.25em] font-bold" style={{ color: C.sky }}>
              Adjusting your path
            </div>
            <div className="text-[12px] mt-1 leading-snug" style={{ color: C.ink }}>
              {adaptiveSuggestion.reason}
            </div>
            <div className="flex gap-2 mt-2.5">
              <button
                onClick={onAcceptAdaptiveSuggestion}
                className="px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest text-white"
                style={{ background: C.fire }}
              >
                Accept
              </button>
              <span className="text-[10px] self-center" style={{ color: C.inkLight }}>or keep current</span>
            </div>
          </div>
        </div>
      )}

      {/* ─────── Hidatsa credit footer ─────── */}
      <p className="text-center text-[9px] mt-8 uppercase tracking-[0.3em]" style={{ color: C.inkLight }}>
        Hiraaciréʼ · Numakiki · Sáhniš
      </p>
      <p className="text-center text-[8px] mt-1.5 italic" style={{ color: C.inkLight, opacity: 0.7 }}>
        Vocabulary supported by the MHA Language Project
      </p>

      {/* ─────── Weight check-in modal ─────── */}
      {showWeightCheckIn && (
        <div
          className="fixed inset-0 z-[220] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-3"
          onClick={(event) => { if (event.target === event.currentTarget) setShowWeightCheckIn(false); }}
        >
          <form
            onSubmit={submitWeight}
            className="w-full max-w-sm rounded-2xl p-5 shadow-2xl"
            style={{ background: C.cardSoft, border: `1px solid ${C.borderStrong}` }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.25em] font-bold" style={{ color: C.purple }}>Today</div>
                <h3 className="text-xl font-bold mt-1" style={{ color: C.ink }}>
                  Quick weight check-in
                </h3>
                <p className="text-[12px] mt-1 leading-relaxed" style={{ color: C.inkMid }}>
                  No judgment. This helps Ding notice the trend, not obsess over one day.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowWeightCheckIn(false)}
                className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center"
                style={{ background: C.bg, color: C.inkMid }}
                aria-label="Close weight check-in"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <label className="block mt-5">
              <span className="text-[10px] uppercase tracking-[0.2em] font-bold" style={{ color: C.inkLight }}>Weight</span>
              <div className="flex items-center gap-3 mt-2 rounded-xl px-4" style={{ background: C.bg, border: `1px solid ${weightError ? C.fire : C.borderStrong}` }}>
                <input
                  autoFocus
                  type="number"
                  inputMode="decimal"
                  min="50"
                  max="700"
                  step="0.1"
                  value={weightInput}
                  onChange={(event) => { setWeightInput(event.target.value); setWeightError(''); }}
                  className="min-w-0 flex-1 bg-transparent py-4 text-3xl font-bold outline-none tabular-nums"
                  style={{ color: C.ink }}
                  aria-describedby={weightError ? 'weight-error' : undefined}
                />
                <span className="text-sm font-bold" style={{ color: C.inkLight }}>lbs</span>
              </div>
              {weightError && <span id="weight-error" className="block text-[11px] mt-2" style={{ color: C.fire }}>{weightError}</span>}
            </label>

            <button
              type="submit"
              className="w-full mt-5 py-3.5 rounded-xl flex items-center justify-center gap-2 text-sm font-bold text-white"
              style={{ background: C.purple }}
            >
              <Check className="w-4 h-4" strokeWidth={2.5} />
              Save check-in
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

// ──────────────────────── Sub-components ────────────────────────

/**
 * RingHero — ¾ open arc + single hero number (CALORIES LEFT).
 * viewBox is wide-flat so the ring sits high and the label group under
 * it feels intentional, not floating.
 */
const RingHero: React.FC<{
  remaining: number;
  target: number;
  ratio: number;
  percentOfGoal: number;
}> = ({ remaining, target, ratio, percentOfGoal }) => {
  const r = 92;
  const circ = 2 * Math.PI * r * 0.75; // 270°
  const offset = circ * (1 - ratio);
  return (
    <div className="relative" style={{ height: 200 }}>
      <svg width="100%" height="200" viewBox="0 0 260 200" preserveAspectRatio="xMidYMid meet">
        {/* Track — 270° arc, terminating at bottom-left / bottom-right */}
        <path
          d="M 55.9 168 A 92 92 0 1 1 204.1 168"
          fill="none"
          stroke={C.border}
          strokeWidth="16"
          strokeLinecap="round"
        />
        {/* Filled progress */}
        <path
          d="M 55.9 168 A 92 92 0 1 1 204.1 168"
          fill="none"
          stroke={C.fire}
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 500ms ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pt-2">
        <div className="text-[10px] uppercase tracking-[0.3em] font-bold" style={{ color: C.inkLight }}>
          Calories Left
        </div>
        <div className="text-[52px] font-bold leading-none tabular-nums mt-1" style={{ color: C.ink }}>
          {Math.round(remaining).toLocaleString()}
        </div>
        <div className="text-[11px] mt-1.5" style={{ color: C.inkLight }}>
          of {target.toLocaleString()} kcal
        </div>
        <div className="text-[10px] uppercase tracking-[0.25em] font-bold mt-2 tabular-nums" style={{ color: C.fire }}>
          {percentOfGoal}% of goal
        </div>
      </div>
    </div>
  );
};

/**
 * MacroRow — clean tinted horizontal bar. No icons, no chrome. Label +
 * bar + "current / target g" number aligned to the right.
 */
const MacroRow: React.FC<{
  label: string;
  current: number;
  target: number;
  color: string;
}> = ({ label, current, target, color }) => {
  const ratio = Math.max(0, Math.min(1, current / Math.max(1, target)));
  return (
    <div className="mt-3 first:mt-0">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[13px] font-bold" style={{ color: C.ink }}>{label}</span>
        <span className="text-[12px] tabular-nums" style={{ color: C.inkMid }}>
          <span className="font-bold" style={{ color: C.ink }}>{Math.round(current)}</span>
          <span style={{ color: C.inkLight }}> / {Math.round(target)}g</span>
        </span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: C.bg }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${ratio * 100}%`,
            background: color,
            transition: 'width 500ms ease',
          }}
        />
      </div>
    </div>
  );
};

/**
 * QuickActionTile — dark card with a colored icon chip on the left, big
 * bold label on the right. Whole card is the button.
 */
const QuickActionTile: React.FC<{
  label: string;
  icon: React.ReactNode;
  iconBg: string;
  onClick: () => void;
}> = ({ label, icon, iconBg, onClick }) => (
  <button
    onClick={onClick}
    className="rounded-2xl p-4 flex items-center gap-3 text-left transition-transform active:scale-[0.98]"
    style={{ background: C.card, border: `1px solid ${C.border}` }}
  >
    <div
      className="w-11 h-11 rounded-full shrink-0 flex items-center justify-center"
      style={{ background: iconBg, color: '#fff' }}
    >
      {icon}
    </div>
    <span className="text-[14px] font-bold leading-tight" style={{ color: C.ink }}>
      {label}
    </span>
  </button>
);

/**
 * WeightTrendCard — big lb number + tiny sparkline. Delta line under the
 * number colored by direction (green down for cutters, sky up for bulkers,
 * inkLight for stable). Empty state when no weigh-ins.
 */
const WeightTrendCard: React.FC<{
  latest?: number;
  change?: number;
  sparkPoints: number[];
}> = ({ latest, change, sparkPoints }) => {
  const TrendIcon = change === undefined ? Minus : change < 0 ? TrendingDown : TrendingUp;
  const trendColor = change === undefined ? C.inkLight : change < 0 ? C.emerald : C.sky;
  return (
    <div className="rounded-2xl p-4" style={{ background: C.card, border: `1px solid ${C.border}` }}>
      <div className="text-[9px] uppercase tracking-[0.25em] font-bold" style={{ color: C.inkLight }}>
        Weight Trend
      </div>
      <div className="flex items-end justify-between gap-2 mt-2">
        <div>
          <span className="text-[26px] font-bold tabular-nums leading-none" style={{ color: C.ink }}>
            {latest !== undefined ? latest.toFixed(1) : '--'}
          </span>
          <span className="text-[10px] font-semibold ml-1" style={{ color: C.inkLight }}>lbs</span>
        </div>
        {sparkPoints.length >= 2 && <Sparkline points={sparkPoints} color={trendColor} />}
      </div>
      {change !== undefined && (
        <div className="flex items-center gap-1 mt-1.5 text-[10px] font-semibold" style={{ color: trendColor }}>
          <TrendIcon className="w-3 h-3" strokeWidth={2} />
          {Math.abs(change).toFixed(1)} lbs
        </div>
      )}
    </div>
  );
};

/**
 * HydrationCard — sky drop icon + "X / Y oz" + one-tap Log water link
 * that increments by the caller's fixed increment.
 */
const HydrationCard: React.FC<{
  intake: number;
  target: number;
  onLog: () => void;
}> = ({ intake, target, onLog }) => (
  <div className="rounded-2xl p-4 flex flex-col" style={{ background: C.card, border: `1px solid ${C.border}` }}>
    <div className="text-[9px] uppercase tracking-[0.25em] font-bold" style={{ color: C.inkLight }}>
      Hydration
    </div>
    <div className="flex items-center gap-2 mt-2">
      <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: `${C.sky}18`, color: C.sky }}>
        <Droplets className="w-5 h-5" strokeWidth={1.8} />
      </div>
      <div className="min-w-0">
        <div className="text-[20px] font-bold tabular-nums leading-none" style={{ color: C.ink }}>
          {intake}
          <span className="text-[11px] font-semibold ml-1" style={{ color: C.inkLight }}>/ {target} oz</span>
        </div>
      </div>
    </div>
    <button
      onClick={onLog}
      className="text-[11px] font-bold uppercase tracking-widest mt-2 self-start"
      style={{ color: C.sky }}
    >
      Log water
    </button>
  </div>
);

/**
 * Tiny inline sparkline — sized to fit the right side of a stat card.
 * Normalizes the y-range so even a small change reads visually.
 */
const Sparkline: React.FC<{ points: number[]; color: string }> = ({ points, color }) => {
  if (points.length < 2) return null;
  const w = 60;
  const h = 24;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = Math.max(0.001, max - min);
  const step = w / (points.length - 1);
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(2)} ${(h - ((p - min) / range) * h).toFixed(2)}`)
    .join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="opacity-90">
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

export default FuelHome;
