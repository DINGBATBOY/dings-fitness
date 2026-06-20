/**
 * FuelHome — Warm-dark "gym companion" dashboard.
 *
 * Pivoted from the cream Mati-Watsā direction. The cream felt thematically
 * loud (read as "tribal app" instead of "gym app"). This version is warm
 * charcoal #161210 with terracotta + ochre accents — the friendly-companion
 * vibe of a fitness app where the cultural layer is felt in accents
 * (feathers, arrow underlines, a Hidatsa credit line) rather than carrying
 * the whole canvas.
 *
 * Layout, top to bottom:
 *   1. Greeting + name (Cuodi voice: MORNIN / AFTERNOOOON! / Good EVENINGGGG!)
 *   2. Daily Nutrition section header with arrow underline
 *   3. 3-number calorie ring: Remaining / Consumed / Target visible at once
 *   4. Macro bars row: Protein / Carbs / Fat with horizontal progress
 *   5. Consumed / Remaining toggle (data view selector)
 *   6. Movement row + quick-burn pills
 *   7. Habits section: Weigh-In + Food Logging 30-day grids (NEW)
 *   8. Adaptive TDEE banner (when applicable)
 *   9. Quick-jump tiles + Wrapped launcher
 *   10. Hidatsa credit footer
 */

import React, { useMemo, useState } from 'react';
import {
  Feather, Beef, Wheat, Droplets, Dumbbell, Flame, Plus, ChevronRight,
  Bike, Footprints, MoreHorizontal,
} from 'lucide-react';
import type { UserProfile, NutritionTargets, DailyLog } from '../types';

// ───────────────────── Warm-dark palette ─────────────────────
const C = {
  bg: '#161210',            // warm charcoal background
  card: '#1d1815',          // slightly lighter card surface
  cardSoft: '#221d19',
  border: 'rgba(255,255,255,0.06)',
  borderStrong: 'rgba(255,255,255,0.10)',
  ink: '#f5ede1',           // warm cream primary text
  inkMid: '#c4b8a4',
  inkLight: '#8b7e6e',
  fire: '#d97757',          // terracotta — primary CTA
  ochre: '#d4a55a',         // gold accent
  sage: '#7a9080',
  emerald: '#7ab896',       // softer green for "good"
  sky: '#6fa8c4',
  rose: '#c97b6e',
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
  /** Last ~30 days of logs — used for the Habits grids. */
  dailyLogs: DailyLog[];
  onQuickAddFood: () => void;
  onOpenReflect: () => void;
  onLogActivity: (kind: 'running' | 'weights' | 'cycling' | 'walking', minutes: number) => void;
  onOpenActivityModal: () => void;
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
  activityBurn,
  waterIntake,
  workoutCompletedToday,
  streak,
  greeting,
  dateString,
  dailyLogs,
  onQuickAddFood,
  onOpenReflect,
  onLogActivity,
  onOpenActivityModal,
  hasEnoughDataForWrapped,
  adaptiveSuggestion,
  onAcceptAdaptiveSuggestion,
}) => {
  const firstName = (profile.name || 'Warrior').split(' ')[0];
  const [macroView, setMacroView] = useState<'consumed' | 'remaining'>('consumed');

  // ───────── Math ─────────
  const calRatio = Math.max(0, Math.min(1, consumed.calories / Math.max(1, targets.calories)));
  const remainingCal = Math.max(0, targets.calories - consumed.calories);
  const waterTarget = Math.max(48, Math.min(100, Math.round((profile.weight || 150) * 0.5)));

  // For macro bars — show either consumed/target or remaining/target.
  const macroData = macroView === 'consumed'
    ? [
        { label: 'Protein', current: Math.round(consumed.protein), target: targets.protein, color: C.fire, icon: <Beef className="w-3.5 h-3.5" strokeWidth={1.5} /> },
        { label: 'Carbs',   current: Math.round(consumed.carbs),   target: targets.carbs,   color: C.ochre, icon: <Wheat className="w-3.5 h-3.5" strokeWidth={1.5} /> },
        { label: 'Fat',     current: Math.round(consumed.fat),     target: targets.fat,     color: C.rose, icon: <Flame className="w-3.5 h-3.5" strokeWidth={1.5} /> },
      ]
    : [
        { label: 'Protein', current: Math.max(0, Math.round(targets.protein - consumed.protein)), target: targets.protein, color: C.fire, icon: <Beef className="w-3.5 h-3.5" strokeWidth={1.5} /> },
        { label: 'Carbs',   current: Math.max(0, Math.round(targets.carbs - consumed.carbs)),     target: targets.carbs,   color: C.ochre, icon: <Wheat className="w-3.5 h-3.5" strokeWidth={1.5} /> },
        { label: 'Fat',     current: Math.max(0, Math.round(targets.fat - consumed.fat)),         target: targets.fat,     color: C.rose, icon: <Flame className="w-3.5 h-3.5" strokeWidth={1.5} /> },
      ];

  // ───────── Habits — last 30 days ─────────
  const days30 = useMemo(() => {
    const out: { date: string; hadWeigh: boolean; hadFood: boolean }[] = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const byDate = new Map<string, DailyLog>();
    (dailyLogs || []).forEach(l => { if (l.date) byDate.set(l.date, l); });
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString();
      const log = byDate.get(dateStr);
      out.push({
        date: dateStr,
        hadWeigh: !!(log && (log.weight || 0) > 0),
        hadFood: !!(log && ((log.caloriesConsumed || 0) > 0 || (log.foodItems?.length || 0) > 0)),
      });
    }
    return out;
  }, [dailyLogs]);
  const weighInThisWeek = days30.slice(-7).filter(d => d.hadWeigh).length;
  const foodLogThisWeek = days30.slice(-7).filter(d => d.hadFood).length;

  return (
    <div className="pb-20 -mx-4 px-4" style={{ background: C.bg, color: C.ink }}>
      {/* ─────── Hero greeting ─────── */}
      <div className="px-1 pt-1 pb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.3em] font-bold" style={{ color: C.inkLight }}>{dateString}</p>
          <h2 className="text-base font-medium tracking-tight mt-1 leading-tight" style={{ color: C.inkMid }}>
            {greeting}
          </h2>
          <h1 className="text-3xl font-bold tracking-tight truncate leading-tight mt-0.5" style={{ color: C.ink }}>
            {firstName}
          </h1>
        </div>
        {streak >= 2 && (
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full shrink-0 self-start mt-1"
            style={{ background: `${C.fire}1a`, border: `1px solid ${C.fire}40` }}
          >
            <Feather className="w-3.5 h-3.5" strokeWidth={1.5} style={{ color: C.fire }} />
            <span
              className="text-[10px] font-bold tracking-widest uppercase tabular-nums"
              style={{ color: C.ochre }}
            >
              {streak}-day trail
            </span>
          </div>
        )}
      </div>

      {/* ─────── Daily Nutrition section header (subtle arrow underline) ─────── */}
      <SectionHeader label="Daily Nutrition" />

      {/* ─────── 3-number ring + macro bars card ─────── */}
      <div className="rounded-3xl p-5 mt-2" style={{ background: C.card, border: `1px solid ${C.border}` }} data-tour="macro-ring">
        <ThreeNumberRing
          consumed={consumed.calories}
          target={targets.calories}
          remaining={remainingCal}
          ratio={calRatio}
        />

        {/* Macro bars */}
        <div className="space-y-3 mt-4">
          {macroData.map(m => (
            <MacroBar
              key={m.label}
              label={m.label}
              icon={m.icon}
              current={m.current}
              target={m.target}
              color={m.color}
              view={macroView}
            />
          ))}
        </div>

        {/* Consumed / Remaining toggle */}
        <div className="flex p-1 mt-4 rounded-full" style={{ background: C.bg }}>
          {(['consumed', 'remaining'] as const).map(v => (
            <button
              key={v}
              onClick={() => setMacroView(v)}
              className="flex-1 py-2 text-[11px] font-bold uppercase tracking-widest rounded-full transition-all"
              style={{
                background: macroView === v ? C.ink : 'transparent',
                color: macroView === v ? C.bg : C.inkLight,
              }}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* ─────── Adaptive TDEE banner ─────── */}
      {adaptiveSuggestion?.hasEnoughData &&
       Math.abs(adaptiveSuggestion.adjustmentKcal || 0) >= 50 && (
        <div
          className="rounded-2xl p-4 mt-3 flex items-start gap-3"
          style={{ background: `${C.fire}12`, border: `1px solid ${C.fire}30` }}
        >
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-[0.25em] font-bold" style={{ color: C.fire }}>
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

      {/* ─────── Movement row ─────── */}
      <SectionHeader label="Today's Movement" className="mt-6" />
      <div className="grid grid-cols-3 gap-2.5 mt-2">
        <StatTile
          icon={<Dumbbell className="w-4 h-4" strokeWidth={1.5} />}
          color={C.fire}
          label="Workout"
          value={workoutCompletedToday ? 'Done' : '—'}
          sublabel={workoutCompletedToday ? 'session logged' : 'not yet'}
        />
        <StatTile
          icon={<Flame className="w-4 h-4" strokeWidth={1.5} />}
          color={C.fire}
          label="Burn"
          value={`${activityBurn}`}
          sublabel="kcal · today"
        />
        <StatTile
          icon={<Droplets className="w-4 h-4" strokeWidth={1.5} />}
          color={C.sky}
          label="Water · mini"
          value={`${waterIntake}`}
          sublabel={`/ ${waterTarget} oz`}
        />
      </div>

      {/* Quick-burn pills */}
      <div className="flex gap-1.5 mt-2.5 overflow-x-auto pb-1 scrollbar-hide">
        <QuickBurnPill label="Run"  icon={<Footprints className="w-3.5 h-3.5" strokeWidth={1.5} />} onClick={() => onLogActivity('running', 30)} />
        <QuickBurnPill label="Lift" icon={<Dumbbell className="w-3.5 h-3.5"   strokeWidth={1.5} />} onClick={() => onLogActivity('weights', 30)} />
        <QuickBurnPill label="Bike" icon={<Bike className="w-3.5 h-3.5"       strokeWidth={1.5} />} onClick={() => onLogActivity('cycling', 30)} />
        <QuickBurnPill label="Walk" icon={<Footprints className="w-3.5 h-3.5" strokeWidth={1.5} />} onClick={() => onLogActivity('walking', 30)} />
        <QuickBurnPill label="Other" icon={<MoreHorizontal className="w-3.5 h-3.5" strokeWidth={1.5} />} onClick={onOpenActivityModal} muted />
      </div>

      {/* ─────── Habits — 30-day grids ─────── */}
      <SectionHeader label="Habits" className="mt-6" />
      <div className="grid grid-cols-2 gap-2.5 mt-2">
        <HabitTile
          title="Weigh-In"
          subtitle="Last 30 days"
          days={days30}
          dayHadFn={(d) => d.hadWeigh}
          color={C.emerald}
          countThisWeek={weighInThisWeek}
        />
        <HabitTile
          title="Food Logging"
          subtitle="Last 30 days"
          days={days30}
          dayHadFn={(d) => d.hadFood}
          color={C.sky}
          countThisWeek={foodLogThisWeek}
        />
      </div>

      {/* ─────── Quick jumps + Wrapped launcher ─────── */}
      <div className="grid grid-cols-2 gap-2.5 mt-3">
        <button
          onClick={onQuickAddFood}
          className="rounded-2xl text-left transition-all active:scale-[0.98] overflow-hidden"
          style={{ background: C.card, border: `1px solid ${C.border}` }}
        >
          <div className="p-4 flex flex-col items-start gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: C.fire }}>
              <Plus className="w-5 h-5 text-white" strokeWidth={2} />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] font-bold" style={{ color: C.inkLight }}>Meals</div>
              <div className="text-[15px] font-bold mt-0.5" style={{ color: C.ink }}>Log a meal</div>
              <div className="text-[10px] mt-0.5" style={{ color: C.inkMid }}>Quick add to today</div>
            </div>
          </div>
        </button>

        <button
          onClick={onOpenReflect}
          disabled={!hasEnoughDataForWrapped}
          className="rounded-2xl text-left transition-all active:scale-[0.98] overflow-hidden disabled:opacity-60"
          style={{ background: C.card, border: `1px solid ${C.border}` }}
        >
          <div className="p-4 flex flex-col items-start gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: `${C.fire}20` }}>
              <Feather className="w-5 h-5" strokeWidth={1.5} style={{ color: C.fire }} />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] font-bold" style={{ color: C.inkLight }}>Reflect</div>
              <div className="text-[15px] font-bold mt-0.5" style={{ color: C.ink }}>Your trail</div>
              <div className="text-[10px] mt-0.5" style={{ color: C.inkMid }}>
                {hasEnoughDataForWrapped ? 'Week & month recap' : 'Log a few more days'}
              </div>
            </div>
          </div>
        </button>
      </div>

      {hasEnoughDataForWrapped && (
        <button
          onClick={onOpenReflect}
          className="w-full mt-3 rounded-2xl text-left overflow-hidden relative transition-all active:scale-[0.99]"
          style={{
            background: `linear-gradient(135deg, ${C.fire}1a, ${C.ochre}10)`,
            border: `1px solid ${C.fire}30`,
          }}
        >
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: C.fire }}>
              <Feather className="w-5 h-5 text-white" strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-[0.25em] font-bold" style={{ color: C.fire }}>Your Wrapped</div>
              <div className="text-[14px] font-bold mt-0.5" style={{ color: C.ink }}>See your week, recapped</div>
            </div>
            <ChevronRight className="w-5 h-5" strokeWidth={1.5} style={{ color: C.inkMid }} />
          </div>
        </button>
      )}

      {/* ─────── Hidatsa credit footer ─────── */}
      <p className="text-center text-[9px] mt-8 uppercase tracking-[0.3em]" style={{ color: C.inkLight }}>
        Hiraaciréʼ · Numakiki · Sáhniš
      </p>
      <p className="text-center text-[8px] mt-1.5 italic" style={{ color: C.inkLight, opacity: 0.7 }}>
        Vocabulary supported by the MHA Language Project
      </p>
    </div>
  );
};

// ──────────────────────── Sub-components ────────────────────────

const SectionHeader: React.FC<{ label: string; className?: string }> = ({ label, className = '' }) => (
  <div className={`flex items-end justify-between gap-3 px-1 ${className}`}>
    <h3 className="text-lg font-bold tracking-tight" style={{ color: C.ink }}>
      {label}
    </h3>
    {/* Native accent: arrow underline. Subtle, small, terracotta. */}
    <svg width="60" height="6" viewBox="0 0 60 6" className="self-center">
      <line x1="2" y1="3" x2="50" y2="3" stroke={C.fire} strokeWidth="1.2" strokeLinecap="round" opacity={0.7} />
      <polyline points="46,1 52,3 46,5" fill="none" stroke={C.fire} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity={0.7} />
    </svg>
  </div>
);

const ThreeNumberRing: React.FC<{
  consumed: number;
  target: number;
  remaining: number;
  ratio: number;
}> = ({ consumed, target, remaining, ratio }) => {
  // 270° arc (¾ circle) — leaves room at the bottom for the three labels.
  const r = 86;
  const circ = 2 * Math.PI * r * 0.75; // 75% of full
  const offset = circ * (1 - ratio);

  return (
    <div className="relative" style={{ height: 200 }}>
      <svg width="100%" height={200} viewBox="0 0 240 200" preserveAspectRatio="xMidYMid meet">
        {/* Background track — 270° arc starting at 135° (lower-left), ending at 45° (lower-right) */}
        <path
          d="M 49.4 174 A 86 86 0 1 1 190.6 174"
          fill="none"
          stroke={C.border}
          strokeWidth="14"
          strokeLinecap="round"
        />
        {/* Progress — same path, dashed */}
        <path
          d="M 49.4 174 A 86 86 0 1 1 190.6 174"
          fill="none"
          stroke={C.fire}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
        />
      </svg>

      {/* Center: big consumed number */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pt-1">
        <div className="text-[56px] leading-none font-bold tabular-nums" style={{ color: C.ink }}>
          {Math.round(consumed)}
        </div>
        <div className="text-[11px] mt-1 uppercase tracking-[0.2em]" style={{ color: C.inkLight }}>Consumed</div>
      </div>

      {/* Left flag — Remaining */}
      <div className="absolute" style={{ left: 12, bottom: 6, textAlign: 'center', width: 70 }}>
        <div className="text-[22px] font-bold tabular-nums" style={{ color: C.ink }}>{Math.round(remaining)}</div>
        <div className="text-[9px] uppercase tracking-[0.2em]" style={{ color: C.inkLight }}>Remaining</div>
      </div>

      {/* Right flag — Target */}
      <div className="absolute" style={{ right: 12, bottom: 6, textAlign: 'center', width: 70 }}>
        <div className="text-[22px] font-bold tabular-nums" style={{ color: C.ink }}>{target.toLocaleString()}</div>
        <div className="text-[9px] uppercase tracking-[0.2em]" style={{ color: C.inkLight }}>Target</div>
      </div>
    </div>
  );
};

const MacroBar: React.FC<{
  label: string;
  icon: React.ReactNode;
  current: number;
  target: number;
  color: string;
  view: 'consumed' | 'remaining';
}> = ({ label, icon, current, target, color, view }) => {
  const ratio = view === 'consumed'
    ? Math.max(0, Math.min(1, current / Math.max(1, target)))
    : Math.max(0, Math.min(1, (target - current) / Math.max(1, target))); // for remaining, the bar represents what's been EATEN
  // Actually for the "remaining" view, the bar should still show consumed progress
  // since that's the more useful visual. We just show different numbers below.

  // Recompute: bar always shows consumed/target progress regardless of view.
  // current here is the displayed number (consumed OR remaining); we need a
  // different number for the bar fill. Simplest: always show progress as
  // consumed_total/target.
  // We don't have the raw consumed in this child when view=remaining, so the
  // bar fill = (target - current) / target when view=remaining.
  const fill = view === 'consumed'
    ? Math.max(0, Math.min(1, current / Math.max(1, target)))
    : Math.max(0, Math.min(1, (target - current) / Math.max(1, target)));

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <span style={{ color }}>{icon}</span>
          <span className="text-[12px] font-bold tracking-wide" style={{ color: C.ink }}>{label}</span>
        </div>
        <div className="text-[12px] tabular-nums" style={{ color: C.inkMid }}>
          <span className="font-bold" style={{ color: C.ink }}>{current}</span>
          <span className="opacity-60"> / {target}g</span>
        </div>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: C.bg }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${fill * 100}%`, background: color }}
        />
      </div>
    </div>
  );
};

const StatTile: React.FC<{
  icon: React.ReactNode;
  color: string;
  label: string;
  value: string;
  sublabel: string;
}> = ({ icon, color, label, value, sublabel }) => (
  <div className="rounded-2xl p-3 flex flex-col items-start" style={{ background: C.card, border: `1px solid ${C.border}` }}>
    <div className="flex items-center justify-between w-full mb-2">
      <span style={{ color }}>{icon}</span>
      <span className="text-[8px] uppercase tracking-[0.2em] font-bold" style={{ color: C.inkLight }}>{label}</span>
    </div>
    <div className="text-[20px] font-bold tabular-nums leading-none" style={{ color: C.ink }}>{value}</div>
    <div className="text-[10px] mt-1" style={{ color: C.inkMid }}>{sublabel}</div>
  </div>
);

const QuickBurnPill: React.FC<{
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  muted?: boolean;
}> = ({ label, icon, onClick, muted }) => (
  <button
    onClick={onClick}
    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-widest shrink-0 transition-all active:scale-95"
    style={{
      background: muted ? C.card : C.fire,
      color: muted ? C.inkMid : '#fff',
      border: muted ? `1px solid ${C.border}` : `1px solid ${C.fire}`,
    }}
  >
    {icon}
    {label}
  </button>
);

/**
 * HabitTile — 30-day grid showing whether the user did a specific thing each day.
 *
 * Days are rendered as a 7×5 grid (35 cells; we only fill 30, leave 5 blank).
 * Lit cells = the user did the thing that day. Greyed cells = they didn't.
 * Bottom of the tile shows "X / 7 this week".
 *
 * Beautiful because it's honest: you see your pattern at a glance without
 * shaming a missed day. The trail just has gaps where it has gaps.
 */
const HabitTile: React.FC<{
  title: string;
  subtitle: string;
  days: { date: string; hadWeigh: boolean; hadFood: boolean }[];
  dayHadFn: (d: { hadWeigh: boolean; hadFood: boolean }) => boolean;
  color: string;
  countThisWeek: number;
}> = ({ title, subtitle, days, dayHadFn, color, countThisWeek }) => {
  // 7 columns × however many rows we need. days is 30, so we render 7×5 with
  // 5 leading blanks (so today lands at the end).
  const BLANKS = 35 - days.length;
  return (
    <div className="rounded-2xl p-4" style={{ background: C.card, border: `1px solid ${C.border}` }}>
      <div className="text-[14px] font-bold leading-tight" style={{ color: C.ink }}>{title}</div>
      <div className="text-[10px] mt-0.5" style={{ color: C.inkLight }}>{subtitle}</div>

      <div className="grid grid-cols-7 gap-[3px] mt-3">
        {Array.from({ length: BLANKS }).map((_, i) => (
          <div key={`b${i}`} style={{ width: '100%', aspectRatio: '1 / 1' }} />
        ))}
        {days.map((d, i) => {
          const lit = dayHadFn(d);
          return (
            <div
              key={d.date + i}
              style={{
                width: '100%',
                aspectRatio: '1 / 1',
                background: lit ? color : 'rgba(255,255,255,0.05)',
                borderRadius: 3,
              }}
            />
          );
        })}
      </div>

      <div className="flex items-center justify-between mt-3 pt-2" style={{ borderTop: `1px solid ${C.border}` }}>
        <div className="text-[11px]" style={{ color: C.inkMid }}>
          <span className="font-bold tabular-nums" style={{ color: C.ink }}>{countThisWeek}</span>
          <span style={{ color: C.inkLight }}> / 7 this week</span>
        </div>
        <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.5} style={{ color: C.inkLight }} />
      </div>
    </div>
  );
};

export default FuelHome;
