/**
 * Dashboard — the Home tab (MacroFactor-style).
 *
 * Everything is shown for ONE selected day, switched with the date bar at the
 * top (‹ day › + a week strip). Today is live and editable; past days are a
 * read view of that day's archived log, and food can still be added to them
 * (the + logs to the selected day).
 *
 *   1. Date bar + week strip
 *   2. Calories: ring (left, signed — never clamped) + macro bars
 *   3. Energy: burned (resting + active, Apple Health when connected) + steps
 *   4. Week: 7 bars of calories vs target, weekly average
 *   5. Trends: weight trend + weigh-in, 7-day protein average, days logged
 *   6. That day's food, grouped by meal
 *   7. Water
 *
 * Calorie model (HANDOFF): calories left = target − eaten, always. Burned
 * energy is informational and never moves the target.
 */
import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Flame, Footprints, Droplets, Scale, TrendingDown, TrendingUp, Minus, Plus, Sparkles, MessageCircle, Dumbbell, Info } from 'lucide-react';
import type { DailyLog, FoodItem, NutritionTargets, UserProfile, WeightEntry } from '../types';
import { computeEnergyBalance } from '../constants';
import type { HealthWorkout } from '../services/health';
import { addDays, dayKey, isoDate, normalizeDayKey, parseDayKey, shiftDayKey, todayKey } from '../services/dayKey';

export type DaySummary = { steps?: number | null; activeKcal?: number | null };

interface DashboardProps {
  profile: UserProfile;
  targets: NutritionTargets;
  selectedDate: string;               // day key (services/dayKey)
  onSelectDate: (date: string) => void;
  todayLog: FoodItem[];
  todayConsumed: { calories: number; protein: number; carbs: number; fat: number };
  todayWater: number;
  todayActivityBurn: number;
  dailyLogs: DailyLog[];
  weighIns: WeightEntry[];
  streak: number;
  greeting: string;
  energyBaseline?: { bmr: number; tdee: number } | null;
  healthActiveEnergy?: number | null;
  healthByDate?: Record<string, DaySummary>;
  /** Today's workouts as Apple Health recorded them. */
  healthWorkouts?: HealthWorkout[];
  healthConnected?: boolean;
  onConnectHealth?: () => void;
  onAddFood: () => void;
  /** Open a logged food for edit/delete on the day it belongs to. */
  onOpenFood: (item: FoodItem, date: string) => void;
  onLogWater: (oz: number) => void;
  onLogWeight: (weight: number) => boolean;
  onLogActivity?: () => void;
  onOpenFuelCoach?: () => void;
  onAskCoach?: () => void;
  adaptiveSuggestion?: { hasEnoughData: boolean; adjustmentKcal?: number; suggestedTdee?: number; reason?: string };
  onAcceptAdaptiveSuggestion?: () => void;
}

const P = { protein: '#7ab896', carbs: '#e8a85a', fat: '#d97757' };
const card = 'rounded-3xl border border-[var(--line)] bg-[var(--bg-card)] p-5';
const label = 'text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--ink-light)]';

// Day keys go through services/dayKey (locale-independent, DST-safe; audit DATE-01/02).
const parse = (d: string) => parseDayKey(d);
const fmt = (d: Date) => dayKey(d);
const shift = (d: string, n: number) => shiftDayKey(d, n);
const n0 = (v: number) => Math.round(v).toLocaleString();

export const Dashboard: React.FC<DashboardProps> = (props) => {
  const {
    profile, targets, selectedDate, onSelectDate, todayLog, todayConsumed, todayWater, todayActivityBurn,
    dailyLogs, weighIns, streak, greeting, energyBaseline, healthActiveEnergy, healthByDate = {}, healthWorkouts = [], healthConnected,
    onConnectHealth, onAddFood, onOpenFood, onLogWater, onLogWeight, onLogActivity, onOpenFuelCoach, onAskCoach,
    adaptiveSuggestion, onAcceptAdaptiveSuggestion,
  } = props;
  const today = todayKey();
  const isToday = selectedDate === today;
  const firstName = (profile.name || 'friend').split(' ')[0];

  const logsByDate = useMemo(() => {
    const m = new Map<string, DailyLog>();
    for (const l of dailyLogs || []) {
      if (!l?.date) continue;
      m.set(normalizeDayKey(l.date), l);
    }
    return m;
  }, [dailyLogs]);

  /** Totals for any day: today is live, past days come from the archive. */
  const dayData = (date: string) => {
    if (date === today) {
      return { foods: todayLog, calories: todayConsumed.calories, protein: todayConsumed.protein, carbs: todayConsumed.carbs, fat: todayConsumed.fat, water: todayWater, burned: todayActivityBurn, workout: false, logged: todayLog.length > 0 };
    }
    const l = logsByDate.get(date);
    return {
      foods: l?.foodItems || [], calories: l?.caloriesConsumed || 0, protein: l?.proteinConsumed || 0, carbs: l?.carbsConsumed || 0, fat: l?.fatConsumed || 0,
      water: l?.waterIntake || 0, burned: l?.caloriesBurned || 0, workout: !!l?.workoutCompleted,
      logged: !!l && ((l.caloriesConsumed || 0) > 0 || (l.foodItems?.length || 0) > 0),
    };
  };
  const day = dayData(selectedDate);

  // ── Week (7 days ending on the selected day) ──
  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const date = shift(selectedDate, i - 6);
    const d = dayData(date);
    return { date, calories: d.calories, protein: d.protein, logged: d.logged, future: parse(date) > parse(today) };
  }), [selectedDate, logsByDate, todayConsumed, todayLog, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const loggedDays = week.filter(w => w.logged);
  const weekAvg = loggedDays.length ? loggedDays.reduce((s, w) => s + w.calories, 0) / loggedDays.length : 0;
  const proteinAvg = loggedDays.length ? loggedDays.reduce((s, w) => s + w.protein, 0) / loggedDays.length : 0;

  // ── Week strip (Sun–Sat containing the selected day) ──
  const strip = useMemo(() => {
    const sel = parse(selectedDate);
    const start = addDays(sel, -sel.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(start, i);
      const date = fmt(d);
      return { date, dow: d.toLocaleDateString('en-US', { weekday: 'narrow' }), num: d.getDate(), future: d > parse(today), logged: dayData(date).logged };
    });
  }, [selectedDate, logsByDate, todayLog, today]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Energy ──
  const health = healthByDate[selectedDate];
  const activeFromHealth = isToday ? (healthActiveEnergy ?? health?.activeKcal ?? null) : (health?.activeKcal ?? null);
  const energy = energyBaseline ? computeEnergyBalance({
    bmr: energyBaseline.bmr, activityLevel: profile.activityLevel, caloriesEaten: day.calories,
    loggedWorkoutKcal: day.burned, healthActiveEnergy: activeFromHealth,
    // Only today knows which workouts Health itself recorded; logged workouts
    // beyond those count as extra burn on top of Health's number.
    healthWorkoutKcal: isToday ? healthWorkouts.reduce((t, w) => t + (w.kcal || 0), 0) : undefined,
  }) : null;
  const [showBalanceInfo, setShowBalanceInfo] = useState(false);
  const steps = health?.steps ?? null;
  const stepGoal = 8000;

  // ── Weight ──
  const weight = useMemo(() => {
    const sorted = [...(weighIns || [])].filter(e => e.weight > 50 && e.weight < 700)
      .sort((a, b) => a.date.localeCompare(b.date));
    const latest = sorted[sorted.length - 1];
    const cutoff = isoDate(addDays(new Date(), -7));
    const recent = sorted.filter(e => e.date >= cutoff);
    const change = recent.length >= 2 ? recent[recent.length - 1].weight - recent[0].weight : undefined;
    return { latest, change, spark: sorted.slice(-21).map(e => e.weight) };
  }, [weighIns]);
  const [weighing, setWeighing] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [weightError, setWeightError] = useState('');

  // ── Ring ──
  const left = targets.calories - day.calories; // signed on purpose
  const ratio = Math.max(0, Math.min(1, day.calories / Math.max(1, targets.calories)));
  const R = 70, CIRC = 2 * Math.PI * R, ARC = CIRC * 0.75;

  const title = isToday ? 'Today' : selectedDate === shift(today, -1) ? 'Yesterday' : parse(selectedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  // ── Food grouped by meal ──
  const meals = useMemo(() => {
    const groups: Record<string, FoodItem[]> = { Breakfast: [], Lunch: [], Dinner: [], Snacks: [] };
    for (const f of day.foods) {
      const m = /(\d{1,2}):\d{2}(?::\d{2})?\s*(AM|PM)?/i.exec(f.timestamp || '');
      let h = m ? Number(m[1]) : 12;
      if (m?.[2]) { const pm = m[2].toUpperCase() === 'PM'; if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
      const g = h < 11 ? 'Breakfast' : h < 15 ? 'Lunch' : h >= 17 && h < 22 ? 'Dinner' : 'Snacks';
      groups[g].push(f);
    }
    return Object.entries(groups).filter(([, v]) => v.length);
  }, [day.foods]);

  return (
    <div className="space-y-4 pb-6">
      {/* ─── 1. Date bar ─── */}
      <div className="rise-in">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm text-[var(--ink-mid)]">{isToday ? `${greeting}, ${firstName}` : 'Looking back'}</p>
            <div className="flex items-center gap-1">
              <button type="button" aria-label="Previous day" onClick={() => onSelectDate(shift(selectedDate, -1))} className="tap -ml-2 flex h-10 w-10 items-center justify-center rounded-full text-[var(--ink-mid)]"><ChevronLeft size={22} /></button>
              <button type="button" onClick={() => onSelectDate(today)} className="tap truncate text-[1.65rem] font-bold leading-tight tracking-tight" aria-label={isToday ? 'Today' : `${title}. Jump to today`}>{title}</button>
              <button type="button" aria-label="Next day" disabled={isToday} onClick={() => onSelectDate(shift(selectedDate, 1))} className="tap flex h-10 w-10 items-center justify-center rounded-full text-[var(--ink-mid)] disabled:opacity-25"><ChevronRight size={22} /></button>
            </div>
          </div>
          {streak >= 1 && (
            <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--primary)]/40 bg-[var(--primary)]/10 px-3 py-1.5">
              <Flame size={16} className="text-[var(--primary)]" aria-hidden="true" />
              <span className="text-sm font-bold tabular-nums">{streak}</span>
              <span className="sr-only">day streak</span>
            </div>
          )}
        </div>
        <div className="mt-3 grid grid-cols-7 gap-1" role="group" aria-label="Pick a day this week">
          {strip.map(s => {
            const on = s.date === selectedDate;
            return (
              <button key={s.date} type="button" disabled={s.future} onClick={() => onSelectDate(s.date)} aria-pressed={on}
                className={`tap flex flex-col items-center gap-1 rounded-2xl py-2 transition-colors disabled:opacity-30 ${on ? 'bg-[var(--ink)] text-[var(--bg-dark)]' : 'text-[var(--ink-mid)]'}`}>
                <span className="text-[11px] font-semibold">{s.dow}</span>
                <span className="text-base font-bold tabular-nums">{s.num}</span>
                <span className={`h-1.5 w-1.5 rounded-full ${s.logged ? (on ? 'bg-[var(--primary)]' : 'bg-[var(--sage)]') : 'bg-transparent'}`} />
              </button>
            );
          })}
        </div>
      </div>

      <div key={selectedDate} className="stagger space-y-4">
        {/* ─── 2. Calories ─── */}
        <section className={card} aria-label="Calories">
          <div className="flex items-center gap-5">
            <div className="relative h-[156px] w-[156px] shrink-0">
              <svg viewBox="0 0 180 180" className="h-full w-full -rotate-[225deg]" aria-hidden="true">
                <circle cx="90" cy="90" r={R} fill="none" stroke="var(--line-strong)" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${ARC} ${CIRC}`} />
                <circle cx="90" cy="90" r={R} fill="none" stroke={left < 0 ? 'var(--accent)' : 'var(--primary)'} strokeWidth="14" strokeLinecap="round"
                  strokeDasharray={`${ARC * ratio} ${CIRC}`} style={{ transition: 'stroke-dasharray 0.9s cubic-bezier(0.16,1,0.3,1)' }} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center pt-2">
                <span className="text-[2rem] font-bold leading-none tabular-nums">{left < 0 ? '−' : ''}{n0(Math.abs(left))}</span>
                <span className="mt-1 text-xs font-semibold text-[var(--ink-mid)]">{left < 0 ? 'kcal over' : 'kcal left'}</span>
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <p className={label}>Eaten</p>
                <p className="text-xl font-bold tabular-nums">{n0(day.calories)} <span className="text-sm font-medium text-[var(--ink-mid)]">/ {n0(targets.calories)}</span></p>
              </div>
              {(['protein', 'carbs', 'fat'] as const).map(k => {
                const cur = day[k]; const tgt = targets[k] || 1;
                return (
                  <div key={k}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="font-semibold capitalize">{k}</span>
                      <span className="tabular-nums text-[var(--ink-mid)]"><b className="text-[var(--ink)]">{Math.round(cur)}</b>/{tgt}g</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--line-strong)]">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, (cur / tgt) * 100)}%`, background: P[k], transition: 'width 0.8s cubic-bezier(0.16,1,0.3,1)' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {left < 0 && <p className="mt-3 text-sm text-[var(--ink-mid)]">{n0(-left)} above {isToday ? 'todays' : 'that days'} target. Thats information, not a verdict.</p>}
        </section>

        {/* ─── 3. Balance: eaten vs burned (deficit) + steps + workouts ─── */}
        <section className={card} aria-label="Calorie balance">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={label}>{isToday ? 'Todays balance so far' : 'Balance'}</p>
              {energy ? (
                <p className="mt-1 text-[2rem] font-bold leading-none tabular-nums" style={{ color: energy.net <= 0 ? 'var(--sage)' : 'var(--accent)' }}>
                  {energy.net <= 0 ? '−' : '+'}{n0(Math.abs(energy.net))}
                  <span className="ml-1.5 text-base font-semibold">{energy.net <= 0 ? 'deficit' : 'surplus'}</span>
                </p>
              ) : <p className="mt-1 text-base text-[var(--ink-mid)]">Add your weight and height in Profile to estimate burn.</p>}
            </div>
            <button type="button" onClick={() => setShowBalanceInfo(v => !v)} aria-expanded={showBalanceInfo} aria-label="How this is worked out" className="tap flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--ink-light)]"><Info size={18} /></button>
          </div>
          {energy && (
            <dl className="mt-4 space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-[var(--ink-mid)]">Eaten</dt><dd className="font-semibold tabular-nums">{n0(energy.eaten)}</dd></div>
              <div className="flex justify-between"><dt className="text-[var(--ink-mid)]">Resting burn</dt><dd className="tabular-nums">−{n0(energy.bmr)}</dd></div>
              <div className="flex justify-between"><dt className="text-[var(--ink-mid)]">{energy.activeSource === 'health' ? 'Active (Apple Health)' : 'Daily movement (est.)'}</dt><dd className="tabular-nums">−{n0(energy.activeBurn - energy.extra)}</dd></div>
              {energy.activeSource === 'estimated' && energy.workouts > 0 && <div className="flex justify-between pl-3 text-xs"><dt className="text-[var(--ink-light)]">incl. logged workouts</dt><dd className="tabular-nums text-[var(--ink-light)]">{n0(energy.workouts)}</dd></div>}
              {energy.extra > 0 && <div className="flex justify-between"><dt className="text-[var(--ink-mid)]">Logged, not in Health</dt><dd className="tabular-nums">−{n0(energy.extra)}</dd></div>}
              <div className="flex justify-between"><dt className="text-[var(--ink-mid)]">Digesting food</dt><dd className="tabular-nums">−{n0(energy.tef)}</dd></div>
              <div className="flex justify-between border-t border-[var(--line)] pt-1.5"><dt className="font-semibold">Burned</dt><dd className="font-semibold tabular-nums">{n0(energy.totalBurn)}</dd></div>
            </dl>
          )}
          {showBalanceInfo && (
            <p className="mt-3 rounded-2xl bg-[var(--wash)] p-3 text-xs leading-relaxed text-[var(--ink-mid)]">
              Burned = resting burn (from your stats) + active energy + a little for digesting food. With Apple Health,
              active energy is your iPhone/Watch number — it already counts your <b>steps</b> and any workout Health recorded,
              so steps arent added again. Workouts you log here that Health didnt record are added on top. Without Health,
              Ding estimates daily movement from your activity level. Your calories-left target never moves with this.
            </p>
          )}
          <div className="mt-4 grid grid-cols-2 gap-4 border-t border-[var(--line)] pt-4">
            <div>
              <p className={label}><Footprints size={12} className="mr-1 inline text-[var(--sage)]" aria-hidden="true" />Steps</p>
              {steps != null ? <>
                <p className="mt-1 text-xl font-bold tabular-nums">{n0(steps)}</p>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--line-strong)]"><div className="h-full rounded-full bg-[var(--sage)]" style={{ width: `${Math.min(100, (steps / stepGoal) * 100)}%`, transition: 'width 0.8s ease' }} /></div>
                <p className="mt-1 text-xs text-[var(--ink-mid)]">of {n0(stepGoal)}</p>
              </> : healthConnected ? <p className="mt-1 text-sm text-[var(--ink-mid)]">No steps from Apple Health for this day.</p>
                : onConnectHealth ? <button type="button" onClick={onConnectHealth} className="tap mt-1 min-h-11 rounded-xl border border-[var(--line-strong)] px-3 text-sm font-semibold">Connect Apple Health</button>
                : <p className="mt-1 text-sm text-[var(--ink-mid)]">Steps sync from Apple Health on iPhone.</p>}
            </div>
            <div>
              <p className={label}><Dumbbell size={12} className="mr-1 inline text-[var(--primary)]" aria-hidden="true" />Workouts</p>
              {isToday && healthWorkouts.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {healthWorkouts.slice(0, 3).map(w => <li key={w.uuid} className="text-sm"><span className="font-semibold">{w.activityType}</span> <span className="text-[var(--ink-mid)]">{w.durationMin} min{w.kcal ? ` · ${n0(w.kcal)}` : ''}</span></li>)}
                </ul>
              )}
              {day.burned > 0 && <p className="mt-1 text-sm"><span className="font-semibold tabular-nums">{n0(day.burned)}</span> <span className="text-[var(--ink-mid)]">kcal logged</span></p>}
              {!(isToday && healthWorkouts.length) && !day.burned && <p className="mt-1 text-sm text-[var(--ink-mid)]">{day.workout ? 'Workout done' : 'None logged'}</p>}
              {isToday && onLogActivity && <button type="button" onClick={onLogActivity} className="tap mt-2 min-h-11 w-full rounded-xl border border-[var(--line-strong)] px-3 text-sm font-semibold">Log a workout</button>}
            </div>
          </div>
        </section>

        {/* ─── 4. Week ─── */}
        <section className={card} aria-label="This week">
          <div className="flex items-baseline justify-between">
            <p className={label}>Last 7 days</p>
            <p className="text-sm text-[var(--ink-mid)]">avg <b className="text-[var(--ink)] tabular-nums">{weekAvg ? n0(weekAvg) : '—'}</b> kcal</p>
          </div>
          {(() => {
            const max = Math.max(targets.calories * 1.25, ...week.map(w => w.calories), 1);
            const targetPct = (targets.calories / max) * 100;
            return (
              <div className="relative mt-4 h-32">
                <div className="absolute inset-x-0 border-t border-dashed border-[var(--ink-light)]/60" style={{ bottom: `${targetPct}%` }} aria-hidden="true">
                  <span className="absolute -top-4 right-0 text-[10px] font-semibold text-[var(--ink-light)]">target</span>
                </div>
                <div className="absolute inset-0 flex items-end gap-2">
                  {week.map((w, i) => {
                    const on = w.date === selectedDate;
                    const over = w.calories > targets.calories;
                    return (
                      <button key={w.date} type="button" disabled={w.future} onClick={() => onSelectDate(w.date)} className="tap flex h-full flex-1 flex-col items-center justify-end gap-1" aria-label={`${parse(w.date).toLocaleDateString('en-US', { weekday: 'long' })}: ${n0(w.calories)} kcal`}>
                        <div className="bar-grow w-full rounded-lg" style={{
                          height: `${Math.max(w.calories ? 4 : 2, (w.calories / max) * 100)}%`,
                          background: on ? 'var(--primary)' : over ? 'color-mix(in srgb, var(--accent) 70%, transparent)' : 'var(--line-strong)',
                          animationDelay: `${i * 35}ms`,
                        }} />
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}
          <div className="mt-1 flex gap-2">
            {week.map(w => <span key={w.date} className={`flex-1 text-center text-[11px] ${w.date === selectedDate ? 'font-bold text-[var(--ink)]' : 'text-[var(--ink-light)]'}`}>{parse(w.date).toLocaleDateString('en-US', { weekday: 'narrow' })}</span>)}
          </div>
        </section>

        {/* ─── 5. Trends ─── */}
        <section className={card} aria-label="Trends">
          <p className={label}>Trends</p>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <div>
              <p className="flex items-center gap-1 text-sm text-[var(--ink-mid)]"><Scale size={14} aria-hidden="true" /> Weight</p>
              <p className="mt-0.5 text-2xl font-bold tabular-nums">{weight.latest ? weight.latest.weight : '—'}<span className="ml-1 text-sm font-medium text-[var(--ink-mid)]">lbs</span></p>
              {weight.change !== undefined && (
                <p className="flex items-center gap-1 text-xs text-[var(--ink-mid)]">
                  {weight.change < -0.05 ? <TrendingDown size={14} /> : weight.change > 0.05 ? <TrendingUp size={14} /> : <Minus size={14} />}
                  {weight.change > 0 ? '+' : ''}{weight.change.toFixed(1)} lbs this week
                </p>
              )}
              {weight.spark.length >= 2 && <Spark points={weight.spark} />}
            </div>
            <div>
              <p className="text-sm text-[var(--ink-mid)]">Protein avg</p>
              <p className="mt-0.5 text-2xl font-bold tabular-nums">{proteinAvg ? Math.round(proteinAvg) : '—'}<span className="ml-1 text-sm font-medium text-[var(--ink-mid)]">g</span></p>
              <p className="text-xs text-[var(--ink-mid)]">target {targets.protein}g · {loggedDays.length}/7 days logged</p>
            </div>
          </div>
          {isToday && (weighing ? (
            <form className="mt-4 flex items-start gap-2" onSubmit={e => {
              e.preventDefault();
              const w = Number(weightInput);
              if (!Number.isFinite(w) || w < 50 || w > 700) { setWeightError('Enter a weight between 50 and 700 lbs.'); return; }
              if (onLogWeight(w)) { setWeighing(false); setWeightError(''); }
            }}>
              <div className="flex-1">
                <label className="sr-only" htmlFor="dash-weight">Weight in lbs</label>
                <input id="dash-weight" autoFocus inputMode="decimal" value={weightInput} onChange={e => setWeightInput(e.target.value)} className="min-h-11 w-full rounded-xl border border-[var(--line-strong)] bg-[var(--bg-dark)] px-3 text-base text-[var(--ink)]" placeholder="lbs" />
                {weightError && <p role="alert" className="mt-1 text-xs text-[var(--accent)]">{weightError}</p>}
              </div>
              <button type="submit" className="tap min-h-11 rounded-xl bg-[var(--primary)] px-4 font-semibold text-[var(--on-primary)]">Save</button>
              <button type="button" onClick={() => setWeighing(false)} className="tap min-h-11 rounded-xl px-3 text-[var(--ink-mid)]">Cancel</button>
            </form>
          ) : (
            <button type="button" onClick={() => { setWeightInput(String(weight.latest?.weight || profile.weight || '')); setWeighing(true); }} className="tap mt-4 min-h-11 w-full rounded-xl border border-[var(--line-strong)] text-sm font-semibold">Weigh in</button>
          ))}
        </section>

        {/* ─── Adaptive target suggestion ─── */}
        {isToday && adaptiveSuggestion?.hasEnoughData && adaptiveSuggestion.adjustmentKcal && Math.abs(adaptiveSuggestion.adjustmentKcal) >= 50 && onAcceptAdaptiveSuggestion && (
          <section className="rounded-3xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 p-4">
            <p className="flex items-center gap-1.5 text-sm font-bold"><Sparkles size={16} className="text-[var(--accent)]" /> Your target could move {adaptiveSuggestion.adjustmentKcal > 0 ? 'up' : 'down'} {Math.abs(Math.round(adaptiveSuggestion.adjustmentKcal))} kcal</p>
            {adaptiveSuggestion.reason && <p className="mt-1 text-sm text-[var(--ink-mid)]">{adaptiveSuggestion.reason}</p>}
            <button type="button" onClick={onAcceptAdaptiveSuggestion} className="tap mt-3 min-h-11 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-[#1f1712]">Use it</button>
          </section>
        )}

        {/* ─── 6. Food ─── */}
        <section className={card} aria-label="Food">
          <div className="flex items-center justify-between">
            <p className={label}>Food · {n0(day.calories)} kcal</p>
            <button type="button" onClick={onAddFood} className="tap flex min-h-10 items-center gap-1 rounded-full bg-[var(--primary)] px-3 text-sm font-bold text-[var(--on-primary)]"><Plus size={16} strokeWidth={2.6} /> Add</button>
          </div>
          {meals.length === 0 ? (
            <p className="mt-4 text-base text-[var(--ink-mid)]">{isToday ? 'Nothing here yet. Tap the + and show me what you ate.' : 'Nothing logged this day.'}</p>
          ) : (
            <div className="mt-3 space-y-4">
              {meals.map(([meal, items]) => (
                <div key={meal}>
                  <div className="flex items-baseline justify-between">
                    <p className="text-sm font-bold">{meal}</p>
                    <p className="text-xs tabular-nums text-[var(--ink-light)]">{n0(items.reduce((s, f) => s + (f.calories || 0), 0))} kcal</p>
                  </div>
                  <ul className="mt-1 divide-y divide-[var(--line)]">
                    {items.map(f => (
                      <li key={f.id}>
                        <button type="button" onClick={() => onOpenFood(f, selectedDate)} className="tap flex min-h-12 w-full items-center justify-between gap-3 py-2 text-left">
                          <span className="min-w-0">
                            <span className="block truncate text-base">{f.name}</span>
                            <span className="text-xs tabular-nums text-[var(--ink-light)]">P {Math.round(f.protein)} · C {Math.round(f.carbs)} · F {Math.round(f.fat)}</span>
                          </span>
                          <span className="shrink-0 text-sm font-semibold tabular-nums">{n0(f.calories)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          {isToday && (onOpenFuelCoach || onAskCoach) && (
            <div className="mt-4 flex gap-2 border-t border-[var(--line)] pt-3">
              {onOpenFuelCoach && <button type="button" onClick={onOpenFuelCoach} className="tap min-h-11 flex-1 rounded-xl border border-[var(--line-strong)] text-sm font-semibold">What should I eat?</button>}
              {onAskCoach && <button type="button" onClick={onAskCoach} aria-label="Ask Ding" className="tap flex min-h-11 w-12 items-center justify-center rounded-xl border border-[var(--line-strong)]"><MessageCircle size={18} /></button>}
            </div>
          )}
        </section>

        {/* ─── 7. Water ─── */}
        <section className={`${card} flex items-center gap-4`} aria-label="Water">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#6fa8c4]/15 text-[#6fa8c4]"><Droplets size={22} /></div>
          <div className="flex-1">
            <p className="text-lg font-bold tabular-nums">{n0(day.water)} <span className="text-sm font-medium text-[var(--ink-mid)]">oz water</span></p>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--line-strong)]"><div className="h-full rounded-full bg-[#6fa8c4]" style={{ width: `${Math.min(100, (day.water / Math.max(48, Math.round((profile.weight || 150) * 0.5))) * 100)}%`, transition: 'width 0.6s ease' }} /></div>
          </div>
          {isToday && <button type="button" onClick={() => onLogWater(8)} className="tap min-h-11 shrink-0 rounded-xl bg-[#6fa8c4]/20 px-3 text-sm font-bold text-[#6fa8c4]">+8 oz</button>}
        </section>
      </div>
    </div>
  );
};

function Spark({ points }: { points: number[] }) {
  const w = 120, h = 30;
  const min = Math.min(...points), max = Math.max(...points), span = Math.max(0.5, max - min);
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i / (points.length - 1)) * w},${h - ((p - min) / span) * (h - 4) - 2}`).join(' ');
  return <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 h-8 w-full" aria-hidden="true"><path d={d} fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
