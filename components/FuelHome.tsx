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
 *   7. Weight check-in + recent meal rhythm
 *   8. Adaptive TDEE banner (when applicable)
 *   9. Quick-jump tiles + Wrapped launcher
 *   10. Hidatsa credit footer
 */

import React, { useMemo, useState } from 'react';
import {
  Feather, Beef, Wheat, Droplets, Dumbbell, Flame, Plus, ChevronRight,
  Bike, Footprints, MoreHorizontal, Scale, TrendingDown, TrendingUp, Minus,
  X, Check,
} from 'lucide-react';
import type { UserProfile, NutritionTargets, DailyLog, WeightEntry } from '../types';

// ───────────────────── Warm-dark palette ─────────────────────
// Brighter, more saturated accent set so the dashboard reads
// "colorful gym companion" rather than monochrome.
const C = {
  bg: '#161210',
  card: '#1d1815',
  cardSoft: '#221d19',
  border: 'rgba(255,255,255,0.06)',
  borderStrong: 'rgba(255,255,255,0.10)',
  ink: '#f5ede1',
  inkMid: '#c4b8a4',
  inkLight: '#8b7e6e',
  fire: '#d97757',          // terracotta — primary CTA / streak
  ochre: '#e8a85a',          // bright gold — carbs
  emerald: '#7ab896',        // emerald sage — fat / good metric
  sky: '#6fa8c4',            // muted blue — water
  rose: '#c97b6e',           // dusk rose — accent
  protein: '#e3614a',        // vivid coral — protein (more energy)
  sage: '#7a9080',           // calmer green — habits, weigh-in
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
  weighIns: WeightEntry[];
  onLogWeight: (weight: number) => boolean;
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
  weighIns,
  onLogWeight,
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
  const [showWeightCheckIn, setShowWeightCheckIn] = useState(false);
  const [weightInput, setWeightInput] = useState(String(profile.weight || ''));
  const [weightError, setWeightError] = useState('');

  // ───────── Math ─────────
  const calRatio = Math.max(0, Math.min(1, consumed.calories / Math.max(1, targets.calories)));
  const remainingCal = Math.max(0, targets.calories - consumed.calories);
  const waterTarget = Math.max(48, Math.min(100, Math.round((profile.weight || 150) * 0.5)));

  // For macro bars — show either consumed/target or remaining/target.
  const macroData = macroView === 'consumed'
    ? [
        { label: 'Protein', current: Math.round(consumed.protein), target: targets.protein, color: C.protein, icon: <Beef className="w-3.5 h-3.5" strokeWidth={1.5} /> },
        { label: 'Carbs',   current: Math.round(consumed.carbs),   target: targets.carbs,   color: C.ochre,   icon: <Wheat className="w-3.5 h-3.5" strokeWidth={1.5} /> },
        { label: 'Fat',     current: Math.round(consumed.fat),     target: targets.fat,     color: C.emerald, icon: <Flame className="w-3.5 h-3.5" strokeWidth={1.5} /> },
      ]
    : [
        { label: 'Protein', current: Math.max(0, Math.round(targets.protein - consumed.protein)), target: targets.protein, color: C.protein, icon: <Beef className="w-3.5 h-3.5" strokeWidth={1.5} /> },
        { label: 'Carbs',   current: Math.max(0, Math.round(targets.carbs - consumed.carbs)),     target: targets.carbs,   color: C.ochre,   icon: <Wheat className="w-3.5 h-3.5" strokeWidth={1.5} /> },
        { label: 'Fat',     current: Math.max(0, Math.round(targets.fat - consumed.fat)),         target: targets.fat,     color: C.emerald, icon: <Flame className="w-3.5 h-3.5" strokeWidth={1.5} /> },
      ];

  // ───────── Habits — last 30 days ─────────
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
    const average = thisWeek.length
      ? thisWeek.reduce((sum, entry) => sum + entry.weight, 0) / thisWeek.length
      : undefined;
    const change = thisWeek.length >= 2
      ? thisWeek[thisWeek.length - 1].weight - thisWeek[0].weight
      : undefined;
    const today = new Date();
    const todayKey = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('-');
    return { latest, average, change, thisWeekCount: thisWeek.length, checkedInToday: latest?.date === todayKey };
  }, [weighIns]);

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
      {/* ─────── Hero greeting ─────── */}
      {/* The user's name now lives in the global header, so we drop the
          giant name h1 here. Compact one-line greeting + streak badge. */}
      <div className="px-1 pt-1 pb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.3em] font-bold" style={{ color: C.inkLight }}>{dateString}</p>
          <h2 className="text-lg font-medium tracking-tight mt-1 leading-tight truncate" style={{ color: C.ink }}>
            {greeting}, <span style={{ color: C.inkMid }}>{firstName}</span>
          </h2>
        </div>
        {streak >= 2 && (
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full shrink-0"
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

      {/* ─────── 3-number ring + macro bars card ─────── */}
      {/* Section header dropped — the card is self-explanatory and section
          chrome is real estate we want back for compactness. */}
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

      {/* ─────── Movement strip (compact, no section header) ─────── */}
      <div className="grid grid-cols-3 gap-2 mt-3">
        <MovementChip
          icon={<Dumbbell className="w-3.5 h-3.5" strokeWidth={1.7} />}
          color={C.fire}
          label="Workout"
          value={workoutCompletedToday ? 'Done' : '—'}
        />
        <MovementChip
          icon={<Flame className="w-3.5 h-3.5" strokeWidth={1.7} />}
          color={C.fire}
          label="Burn"
          value={`${activityBurn}`}
          unit="kcal"
        />
        <MovementChip
          icon={<Droplets className="w-3.5 h-3.5" strokeWidth={1.7} />}
          color={C.sky}
          label="Water"
          value={`${waterIntake}`}
          unit={`/${waterTarget}`}
        />
      </div>

      {/* Quick-burn pills */}
      <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1 scrollbar-hide">
        <QuickBurnPill label="Run"  icon={<Footprints className="w-3.5 h-3.5" strokeWidth={1.5} />} onClick={() => onLogActivity('running', 30)} />
        <QuickBurnPill label="Lift" icon={<Dumbbell className="w-3.5 h-3.5"   strokeWidth={1.5} />} onClick={() => onLogActivity('weights', 30)} />
        <QuickBurnPill label="Bike" icon={<Bike className="w-3.5 h-3.5"       strokeWidth={1.5} />} onClick={() => onLogActivity('cycling', 30)} />
        <QuickBurnPill label="Walk" icon={<Footprints className="w-3.5 h-3.5" strokeWidth={1.5} />} onClick={() => onLogActivity('walking', 30)} />
        <QuickBurnPill label="Other" icon={<MoreHorizontal className="w-3.5 h-3.5" strokeWidth={1.5} />} onClick={onOpenActivityModal} muted />
      </div>

      {/* ─────── Check-in + Meals (the two interactive habit cards) ─────── */}
      {/* The Quick Jumps tile row and the larger Wrapped launcher card were
          removed — both were redundant with the dock and with these two
          cards' own CTAs. */}
      <div className="mt-4">
        <WeightCheckInCard summary={weightSummary} onOpen={openWeightCheckIn} />
      </div>
      <MealRhythmCard days={days30} countThisWeek={foodLogThisWeek} onLogMeal={onQuickAddFood} />

      {/* ─────── Hidatsa credit footer ─────── */}
      <p className="text-center text-[9px] mt-8 uppercase tracking-[0.3em]" style={{ color: C.inkLight }}>
        Hiraaciréʼ · Numakiki · Sáhniš
      </p>
      <p className="text-center text-[8px] mt-1.5 italic" style={{ color: C.inkLight, opacity: 0.7 }}>
        Vocabulary supported by the MHA Language Project
      </p>

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
                <div className="text-[10px] uppercase tracking-[0.25em] font-bold" style={{ color: C.emerald }}>Today</div>
                <h3 className="text-xl font-bold mt-1" style={{ color: C.ink }}>
                  {weightSummary.checkedInToday ? 'Update your check-in' : 'Quick weight check-in'}
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
              style={{ background: C.fire }}
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
    <div>
      <div className="relative" style={{ height: 170 }}>
        <svg width="100%" height={170} viewBox="0 0 240 170" preserveAspectRatio="xMidYMid meet">
          <path d="M 49.4 144 A 86 86 0 1 1 190.6 144" fill="none" stroke={C.border} strokeWidth="14" strokeLinecap="round" />
          <path d="M 49.4 144 A 86 86 0 1 1 190.6 144" fill="none" stroke={C.fire} strokeWidth="14" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} />
        </svg>
        {/* Center: big consumed number */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-1">
          <div className="text-[60px] leading-none font-bold tabular-nums" style={{ color: C.ink }}>
            {Math.round(consumed)}
          </div>
          <div className="text-[10px] mt-1.5 uppercase tracking-[0.2em] font-bold" style={{ color: C.inkLight }}>Consumed</div>
        </div>
      </div>

      {/* Remaining / Target — sit cleanly under the ring as a row, no overlap */}
      <div className="grid grid-cols-2 gap-3 mt-2 px-3">
        <div className="text-left">
          <div className="text-[20px] font-bold tabular-nums leading-none" style={{ color: C.ink }}>{Math.round(remaining)}</div>
          <div className="text-[9px] mt-1 uppercase tracking-[0.2em]" style={{ color: C.inkLight }}>Remaining</div>
        </div>
        <div className="text-right">
          <div className="text-[20px] font-bold tabular-nums leading-none" style={{ color: C.ink }}>{target.toLocaleString()}</div>
          <div className="text-[9px] mt-1 uppercase tracking-[0.2em]" style={{ color: C.inkLight }}>Target</div>
        </div>
      </div>
    </div>
  );
};

/**
 * MacroBar — drawn as an arrow on the trail. Subtle dashed track shows
 * the full path to your goal; the colored arrow grows along it as you
 * eat. Arrowhead chevron at the tip of the fill makes it feel like
 * forward motion, not a static gauge.
 */
const MacroBar: React.FC<{
  label: string;
  icon: React.ReactNode;
  current: number;
  target: number;
  color: string;
  view: 'consumed' | 'remaining';
}> = ({ label, icon, current, target, color, view }) => {
  const eaten = view === 'consumed' ? current : Math.max(0, target - current);
  const fill = Math.max(0, Math.min(1, eaten / Math.max(1, target)));

  // SVG drawing — viewBox is 100 wide × 12 tall. Arrow nocks at x=2,
  // tip moves to (fill * 96) so it never clips the right edge.
  const TIP = Math.max(6, fill * 96); // min 6 so arrow shape is always visible

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

      <svg width="100%" height="12" viewBox="0 0 100 12" preserveAspectRatio="none">
        {/* Subtle dashed track for the full path */}
        <line
          x1="2" y1="6" x2="98" y2="6"
          stroke="rgba(255,255,255,0.10)"
          strokeWidth="0.6"
          strokeDasharray="2 2"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* Nock dot at the start */}
        <circle cx="2" cy="6" r="1.6" fill={color} />
        {/* Shaft — grows with fill */}
        <line
          x1="2" y1="6" x2={TIP} y2="6"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          style={{ transition: 'all 500ms' }}
        />
        {/* Chevron arrowhead at the tip */}
        <polyline
          points={`${TIP - 2.6},3.5 ${TIP},6 ${TIP - 2.6},8.5`}
          fill="none"
          stroke={color}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          style={{ transition: 'all 500ms' }}
        />
      </svg>
    </div>
  );
};

/**
 * MovementChip — slim, single-line replacement for the old StatTile.
 *
 * Used in the 3-column row under the macro card to give a glance at today's
 * workout / burn / water without spending the vertical room a full tile
 * needs. Visual: icon + value on top, label below in fine print.
 */
const MovementChip: React.FC<{
  icon: React.ReactNode;
  color: string;
  label: string;
  value: string;
  unit?: string;
}> = ({ icon, color, label, value, unit }) => (
  <div
    className="rounded-xl px-3 py-2 flex items-center gap-2"
    style={{ background: C.card, border: `1px solid ${C.border}` }}
  >
    <span className="shrink-0" style={{ color }}>{icon}</span>
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline gap-1 leading-none">
        <span className="text-[15px] font-bold tabular-nums" style={{ color: C.ink }}>{value}</span>
        {unit && <span className="text-[9px]" style={{ color: C.inkLight }}>{unit}</span>}
      </div>
      <div className="text-[8px] uppercase tracking-[0.2em] font-bold mt-0.5 truncate" style={{ color: C.inkLight }}>{label}</div>
    </div>
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

/** Weight trend and check-in action, intentionally focused on averages. */
const WeightCheckInCard: React.FC<{
  summary: {
    latest?: WeightEntry;
    average?: number;
    change?: number;
    thisWeekCount: number;
    checkedInToday: boolean;
  };
  onOpen: () => void;
}> = ({ summary, onOpen }) => {
  const TrendIcon = summary.change === undefined ? Minus : summary.change < 0 ? TrendingDown : TrendingUp;
  const trendText = summary.change === undefined
    ? `${summary.thisWeekCount} reading${summary.thisWeekCount === 1 ? '' : 's'} this week`
    : `${summary.change > 0 ? '+' : ''}${summary.change.toFixed(1)} lb this week`;

  return (
    <div className="rounded-2xl p-4 mt-2" style={{ background: C.card, border: `1px solid ${C.border}` }}>
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-full shrink-0 flex items-center justify-center" style={{ background: `${C.emerald}18`, color: C.emerald }}>
          <Scale className="w-5 h-5" strokeWidth={1.7} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] font-bold" style={{ color: C.inkLight }}>Latest</div>
              <div className="text-2xl font-bold tabular-nums mt-0.5" style={{ color: C.ink }}>
                {(summary.latest?.weight ?? 0) > 0 ? summary.latest!.weight.toFixed(1) : '--'}
                <span className="text-xs ml-1" style={{ color: C.inkLight }}>lb</span>
              </div>
            </div>
            {summary.average !== undefined && (
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-[0.2em] font-bold" style={{ color: C.inkLight }}>7-day avg</div>
                <div className="text-base font-bold tabular-nums mt-0.5" style={{ color: C.ink }}>{summary.average.toFixed(1)}</div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-[11px]" style={{ color: C.inkMid }}>
            <TrendIcon className="w-3.5 h-3.5" strokeWidth={1.7} style={{ color: C.emerald }} />
            <span>{trendText}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-4 pt-3" style={{ borderTop: `1px solid ${C.border}` }}>
        <p className="flex-1 text-[10px] leading-relaxed" style={{ color: C.inkLight }}>
          A few readings help Ding tune your targets.
        </p>
        <button
          onClick={onOpen}
          className="shrink-0 px-3.5 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest text-white"
          style={{ background: C.fire }}
        >
          {summary.checkedInToday ? 'Update today' : 'Check in'}
        </button>
      </div>
    </div>
  );
};

const MealRhythmCard: React.FC<{
  days: { date: string; hadFood: boolean }[];
  countThisWeek: number;
  onLogMeal: () => void;
}> = ({ days, countThisWeek, onLogMeal }) => (
  <button
    onClick={onLogMeal}
    className="w-full rounded-2xl p-4 mt-2 text-left transition-all active:scale-[0.99]"
    style={{ background: C.card, border: `1px solid ${C.border}` }}
  >
    <div className="flex items-start gap-3">
      <div className="w-11 h-11 rounded-full shrink-0 flex items-center justify-center" style={{ background: `${C.sky}18`, color: C.sky }}>
        <Plus className="w-5 h-5" strokeWidth={2} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[15px] font-bold" style={{ color: C.ink }}>What did you eat?</div>
            <div className="text-[10px] mt-0.5" style={{ color: C.inkMid }}>
              {countThisWeek > 0 ? `${countThisWeek} day${countThisWeek === 1 ? '' : 's'} logged this week` : 'Tell Ding and keep moving'}
            </div>
          </div>
          <ChevronRight className="w-4 h-4 shrink-0" strokeWidth={1.5} style={{ color: C.inkLight }} />
        </div>
        <div className="grid grid-cols-10 gap-[3px] mt-3" aria-label="Meal history for the last 30 days">
          {days.map((day, index) => (
            <span
              key={day.date + index}
              className="block rounded-sm"
              style={{ aspectRatio: '1 / 1', background: day.hadFood ? C.sky : 'rgba(255,255,255,0.05)' }}
            />
          ))}
        </div>
      </div>
    </div>
  </button>
);

export default FuelHome;
