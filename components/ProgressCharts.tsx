/**
 * ProgressCharts — the Progress tab, laid out as a dashboard (Oct 31, 2026).
 *
 * One range control (7 / 30 / 90 days) drives every section:
 *   1. Overview tiles — avg calories, avg protein, days logged, weight —
 *      each compared with the same-length period before it.
 *   2. Goals hit — calories within ±10 % of target, protein goal (≥ 90 %),
 *      days logged.
 *   3. Calories — one card, Eaten / Balance toggle (bars; 90 days = weekly
 *      averages so the bars stay readable).
 *   4. Macros — average grams vs target + where the calories come from.
 *   5. Weight — trend line, change, pace per week, distance to goal weight.
 *   6. Consistency — day grid for the range + weekday/weekend patterns.
 *   7. What you ate — most-logged foods and biggest calorie sources.
 *   8. Recap launcher (opens the Wrapped story overlay) + the numbers table.
 *
 * Averages and hit rates leave out today until it's over (a half-logged day
 * drags every average down); the charts still show it. Colors are the --viz-*
 * tokens and --primary from index.css (validated against every tone).
 */
import React, { useMemo, useState } from 'react';
import type { DailyLog, FoodItem, NutritionTargets, UserProfile, WeightEntry } from '../types';
import { computeEnergyBalance } from '../constants';
import type { DaySummary } from './Dashboard';
import { addDays, dayKey, daysBetween, isoDate, normalizeDayKey, parseDayKey } from '../services/dayKey';

export type ProgressRange = 7 | 30 | 90;

interface Props {
  profile: UserProfile;
  targets: NutritionTargets;
  dailyLogs: DailyLog[];
  todayLog: FoodItem[];
  todayConsumed: { calories: number; protein: number; carbs: number; fat: number };
  todayActivityBurn: number;
  todayWater?: number;
  weighIns: WeightEntry[];
  streak?: number;
  energyBaseline?: { bmr: number; tdee: number } | null;
  healthActiveEnergy?: number | null;
  healthByDate?: Record<string, DaySummary>;
  /** Opens the Wrapped story overlay for the given period. */
  onOpenRecap?: (period: 'week' | 'month') => void;
}

type Day = {
  date: string; d: Date; label: string; short: string; isToday: boolean;
  eaten: number; protein: number; carbs: number; fat: number; water: number;
  logged: boolean; burned: number | null; net: number | null;
  items: FoodItem[];
};

/** A bar on the calorie chart: one day, or one week when the range is 90. */
type Bar = { key: string; label: string; short: string; logged: boolean; eaten: number; net: number | null; burned: number | null; isToday: boolean };

const card = 'rounded-3xl border border-[var(--line)] bg-[var(--bg-card)] p-5';
const eyebrow = 'text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--ink-light)]';
const n0 = (v: number) => Math.round(v).toLocaleString();
const signed = (v: number, digits = 0) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const RANGE_LABEL: Record<ProgressRange, string> = { 7: '7 days', 30: '30 days', 90: '90 days' };
const DOW = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

export const ProgressCharts: React.FC<Props> = ({
  profile, targets, dailyLogs, todayLog, todayConsumed, todayActivityBurn, todayWater = 0, weighIns, streak,
  energyBaseline, healthActiveEnergy, healthByDate = {}, onOpenRecap,
}) => {
  const [range, setRange] = useState<ProgressRange>(() => {
    try {
      const v = Number(sessionStorage.getItem('ding-progress-range'));
      return v === 30 || v === 90 ? v : 7;
    } catch { return 7; }
  });
  const pick = (r: ProgressRange) => { setRange(r); try { sessionStorage.setItem('ding-progress-range', String(r)); } catch { /* ignore */ } };

  // Two ranges' worth of days (current + the one before it, for comparisons).
  const allDays: Day[] = useMemo(() => {
    const byDate = new Map<string, DailyLog>();
    for (const l of dailyLogs || []) {
      if (!l?.date) continue;
      byDate.set(normalizeDayKey(l.date), l);
    }
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const total = range * 2;
    return Array.from({ length: total }, (_, i) => {
      const d = addDays(start, -(total - 1 - i));   // DST-safe (DATE-01)
      const date = dayKey(d);
      const isToday = i === total - 1;
      const l = byDate.get(date);
      const items = isToday ? todayLog : (l?.foodItems || []);
      const eaten = isToday ? todayConsumed.calories : (l?.caloriesConsumed || 0);
      const logged = isToday ? todayLog.length > 0 : !!l && ((l.caloriesConsumed || 0) > 0 || (l.foodItems?.length || 0) > 0);
      const health = healthByDate[date];
      const active = isToday ? (healthActiveEnergy ?? health?.activeKcal ?? null) : (health?.activeKcal ?? null);
      const e = energyBaseline && logged ? computeEnergyBalance({
        bmr: energyBaseline.bmr, activityLevel: profile.activityLevel, caloriesEaten: eaten,
        loggedWorkoutKcal: isToday ? todayActivityBurn : (l?.caloriesBurned || 0), healthActiveEnergy: active,
        healthWorkoutKcal: health?.workoutKcal ?? undefined,
      }) : null;
      const posInRange = i - range;   // 0..range-1 for the current range
      return {
        date, d, isToday,
        label: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        short: range === 7 ? d.toLocaleDateString('en-US', { weekday: 'narrow' }) : (d.getDate() === 1 || posInRange % 5 === 0 || isToday ? String(d.getDate()) : ''),
        eaten,
        protein: isToday ? todayConsumed.protein : (l?.proteinConsumed || 0),
        carbs: isToday ? todayConsumed.carbs : (l?.carbsConsumed || 0),
        fat: isToday ? todayConsumed.fat : (l?.fatConsumed || 0),
        water: isToday ? todayWater : (l?.waterIntake || 0),
        logged, items,
        burned: e ? e.totalBurn : null,
        net: e ? e.net : null,
      };
    });
  }, [range, dailyLogs, todayLog, todayConsumed, todayActivityBurn, todayWater, energyBaseline, healthActiveEnergy, healthByDate, profile.activityLevel]);

  const days = allDays.slice(range);
  const prevDays = allDays.slice(0, range);

  // ---- Stats (today left out of averages until it's over) ---------------
  const s = useMemo(() => {
    const finished = (ds: Day[]) => {
      const done = ds.filter(d => d.logged && !d.isToday);
      return done.length ? done : ds.filter(d => d.logged);
    };
    const cur = finished(days);
    const prev = finished(prevDays);
    const onCal = (d: Day) => Math.abs(d.eaten - targets.calories) <= targets.calories * 0.1;
    const onProtein = (d: Day) => d.protein >= targets.protein * 0.9;
    const nets = cur.filter(d => d.net !== null).map(d => d.net as number);
    const loggedCount = days.filter(d => d.logged).length;

    // Weekday vs weekend + most on-target weekday.
    const weekday = cur.filter(d => d.d.getDay() !== 0 && d.d.getDay() !== 6);
    const weekend = cur.filter(d => d.d.getDay() === 0 || d.d.getDay() === 6);
    const dowHits = new Map<number, { n: number; hit: number }>();
    for (const d of cur) {
      const k = d.d.getDay(); const v = dowHits.get(k) || { n: 0, hit: 0 };
      v.n += 1; if (onCal(d)) v.hit += 1; dowHits.set(k, v);
    }
    const bestDow = [...dowHits.entries()].filter(([, v]) => v.n >= 2 && v.hit > 0)
      .sort((a, b) => b[1].hit / b[1].n - a[1].hit / a[1].n || b[1].n - a[1].n)[0];

    return {
      n: cur.length,
      loggedCount,
      avgCal: avg(cur.map(d => d.eaten)),
      prevAvgCal: prev.length ? avg(prev.map(d => d.eaten)) : null,
      avgProtein: avg(cur.map(d => d.protein)),
      prevAvgProtein: prev.length ? avg(prev.map(d => d.protein)) : null,
      avgCarbs: avg(cur.map(d => d.carbs)),
      avgFat: avg(cur.map(d => d.fat)),
      prevLogged: prevDays.filter(d => d.logged).length,
      calHit: cur.filter(onCal).length,
      proteinHit: cur.filter(onProtein).length,
      avgNet: nets.length ? avg(nets) : null,
      weekdayAvg: weekday.length ? avg(weekday.map(d => d.eaten)) : null,
      weekendAvg: weekend.length ? avg(weekend.map(d => d.eaten)) : null,
      bestDow: bestDow ? { name: DOW[bestDow[0]], hit: bestDow[1].hit, n: bestDow[1].n } : null,
      mealsPerDay: avg(cur.map(d => d.items.length)),
      avgWater: avg(cur.filter(d => d.water > 0).map(d => d.water)),
      waterDays: cur.filter(d => d.water > 0).length,
      todayExcluded: cur.length > 0 && !cur.some(d => d.isToday) && days[days.length - 1].logged,
    };
  }, [days, prevDays, targets.calories, targets.protein]);

  // ---- Weight ------------------------------------------------------------
  const weight = useMemo(() => {
    const clean = [...(weighIns || [])].filter(w => w.weight > 50 && w.weight < 700).sort((a, b) => a.date.localeCompare(b.date));
    const cutoff = isoDate(addDays(new Date(), -(range - 1)));
    const inRange = clean.filter(w => w.date >= cutoff);
    const latest = clean[clean.length - 1] || null;
    const change = inRange.length >= 2 ? inRange[inRange.length - 1].weight - inRange[0].weight : null;
    let perWeek: number | null = null;
    if (inRange.length >= 2) {
      const spanDays = daysBetween(parseDayKey(inRange[0].date), parseDayKey(inRange[inRange.length - 1].date));
      if (spanDays >= 6) perWeek = ((change as number) / spanDays) * 7;
    }
    const goal = profile.goalTargetWeight && profile.goalTargetWeight > 50 ? profile.goalTargetWeight : null;
    return { points: inRange, latest, change, perWeek, goal, toGoal: goal && latest ? latest.weight - goal : null };
  }, [weighIns, range, profile.goalTargetWeight]);

  // ---- Foods -------------------------------------------------------------
  const foods = useMemo(() => {
    const map = new Map<string, { name: string; count: number; kcal: number }>();
    let total = 0;
    for (const d of days) {
      for (const it of d.items || []) {
        const name = (it.name || '').trim();
        if (!name) continue;
        const key = name.toLowerCase();
        const v = map.get(key) || { name, count: 0, kcal: 0 };
        v.count += 1; v.kcal += it.calories || 0; total += it.calories || 0;
        map.set(key, v);
      }
    }
    const list = [...map.values()];
    return {
      total,
      mostLogged: [...list].sort((a, b) => b.count - a.count || b.kcal - a.kcal).slice(0, 5),
      mostCalories: [...list].sort((a, b) => b.kcal - a.kcal).slice(0, 5),
      distinct: list.length,
    };
  }, [days]);

  // ---- Calorie bars (weekly buckets for 90 days) ----------------------
  const bars: Bar[] = useMemo(() => {
    if (range !== 90) {
      return days.map(d => ({ key: d.date, label: d.label, short: d.short, logged: d.logged, eaten: d.eaten, net: d.net, burned: d.burned, isToday: d.isToday }));
    }
    const out: Bar[] = [];
    for (let i = days.length; i > 0; i -= 7) {
      const chunk = days.slice(Math.max(0, i - 7), i);
      const lg = chunk.filter(d => d.logged);
      const nets = lg.filter(d => d.net !== null);
      const first = chunk[0].d;
      const fmt = (x: Date) => x.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      out.unshift({
        key: chunk[0].date,
        label: `Week of ${fmt(first)}${lg.length ? ` · ${lg.length} day${lg.length === 1 ? '' : 's'} logged` : ''}`,
        short: '', logged: lg.length > 0,
        eaten: avg(lg.map(d => d.eaten)),
        net: nets.length ? avg(nets.map(d => d.net as number)) : null,
        burned: nets.length ? avg(nets.map(d => d.burned as number)) : null,
        isToday: chunk.some(d => d.isToday),
      });
    }
    out.forEach((b, i) => { if (i % 3 === 0 || i === out.length - 1) b.short = parseDayKey(b.key).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); });
    return out;
  }, [days, range]);

  const prevLabel = `vs previous ${RANGE_LABEL[range]}`;

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Range" className="grid grid-cols-3 gap-1 rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-1">
        {([7, 30, 90] as const).map(r => (
          <button key={r} type="button" role="tab" aria-selected={range === r} onClick={() => pick(r)}
            className={`tap min-h-11 rounded-xl text-sm font-semibold transition-colors duration-200 ${range === r ? 'bg-[var(--ink)] text-[var(--bg-dark)]' : 'text-[var(--ink-mid)]'}`}>
            {RANGE_LABEL[r]}
          </button>
        ))}
      </div>

      <div key={range} className="stagger space-y-4">
        {/* 1. OVERVIEW ------------------------------------------------- */}
        <section aria-label="Overview" className="grid grid-cols-2 gap-2">
          <Stat label="Avg calories" value={s.n ? n0(s.avgCal) : '—'} unit="kcal / day"
            sub={s.n ? `target ${n0(targets.calories)}` : 'Nothing logged yet'}
            delta={s.n && s.prevAvgCal !== null ? { text: `${signed(s.avgCal - s.prevAvgCal)} ${prevLabel}` } : null} />
          <Stat label="Avg protein" value={s.n ? `${Math.round(s.avgProtein)}` : '—'} unit="g / day"
            sub={s.n ? `${Math.round((s.avgProtein / Math.max(1, targets.protein)) * 100)}% of ${targets.protein} g goal` : 'Nothing logged yet'}
            delta={s.n && s.prevAvgProtein !== null ? { text: `${signed(s.avgProtein - s.prevAvgProtein)} g ${prevLabel}` } : null} />
          <Stat label="Days logged" value={`${s.loggedCount}`} unit={`of ${range}`}
            sub={streak && streak > 1 ? `${streak}-day streak going` : streak === 1 ? 'Streak: 1 day' : 'Log today to start a streak'}
            delta={s.prevLogged > 0 ? { text: `${signed(s.loggedCount - s.prevLogged)} ${Math.abs(s.loggedCount - s.prevLogged) === 1 ? 'day' : 'days'} ${prevLabel}` } : null} />
          {weight.latest ? (
            <Stat label="Weight" value={`${weight.latest.weight}`} unit="lbs"
              sub={weight.change !== null ? `${signed(weight.change, 1)} lbs in ${RANGE_LABEL[range]}` : `last weigh-in ${shortDate(weight.latest.date)}`}
              delta={weight.toGoal !== null ? { text: Math.abs(weight.toGoal) < 0.5 ? 'At your goal weight' : `${Math.abs(weight.toGoal).toFixed(1)} lbs to goal (${weight.goal})` } : null} />
          ) : (
            <Stat label="Avg balance" value={s.avgNet === null ? '—' : signed(s.avgNet)} unit={s.avgNet === null ? '' : 'kcal / day'}
              sub={s.avgNet === null ? 'Add your stats in Profile' : s.avgNet <= 0 ? 'under what you burn' : 'over what you burn'} delta={null} />
          )}
        </section>
        {s.todayExcluded && <p className="-mt-2 px-1 text-[11px] text-[var(--ink-light)]">Averages leave out today until the day is over.</p>}

        {/* 2. GOALS HIT ------------------------------------------------ */}
        <section className={card} aria-label="Goals hit">
          <p className={eyebrow}>Goals hit</p>
          {s.n === 0 ? <p className="mt-3 text-sm text-[var(--ink-mid)]">Log a few days to see how often you land on your targets.</p> : (
            <div className="mt-3 space-y-3.5">
              <Meter label="Calories on target" hint="within 10%" value={s.calHit} of={s.n} />
              <Meter label="Protein goal reached" hint={`${Math.round(targets.protein * 0.9)} g+`} value={s.proteinHit} of={s.n} />
              <Meter label="Days logged" value={s.loggedCount} of={range} />
            </div>
          )}
        </section>

        {/* 3. CALORIES ------------------------------------------------- */}
        <CaloriesCard bars={bars} target={targets.calories} weekly={range === 90} />

        {/* 4. MACROS --------------------------------------------------- */}
        <MacroCard n={s.n} protein={s.avgProtein} carbs={s.avgCarbs} fat={s.avgFat} targets={targets} />

        {/* 5. WEIGHT --------------------------------------------------- */}
        <section className={card} aria-label="Weight">
          <p className={eyebrow}>Weight</p>
          {weight.points.length >= 2 ? (
            <>
              <WeightLine points={weight.points} goal={weight.goal} />
              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-[var(--line)] pt-3">
                <Mini label="Change" value={weight.change !== null ? `${signed(weight.change, 1)} lbs` : '—'} />
                <Mini label="Pace" value={weight.perWeek !== null ? `${signed(weight.perWeek, 1)} / wk` : '—'} />
                <Mini label="To goal" value={weight.toGoal !== null ? (Math.abs(weight.toGoal) < 0.5 ? 'There' : `${Math.abs(weight.toGoal).toFixed(1)} lbs`) : 'No goal set'} />
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-[var(--ink-mid)]">{weight.points.length === 1
              ? `${weight.points[0].weight} lbs on ${shortDate(weight.points[0].date)}. One more weigh-in in this range draws the line.`
              : weight.latest ? `No weigh-ins in the last ${RANGE_LABEL[range]}. Last one: ${weight.latest.weight} lbs on ${shortDate(weight.latest.date)}.`
              : 'Weigh in from Home to see your trend here.'}</p>
          )}
        </section>

        {/* 6. CONSISTENCY ---------------------------------------------- */}
        <section className={card} aria-label="Consistency">
          <p className={eyebrow}>Consistency</p>
          <DayGrid days={days} target={targets.calories} />
          {s.n >= 3 && (
            <ul className="mt-4 space-y-2.5 border-t border-[var(--line)] pt-3 text-sm">
              {s.weekdayAvg !== null && s.weekendAvg !== null && (
                <Pattern label="Weekdays vs weekends" value={`${n0(s.weekdayAvg)} · ${n0(s.weekendAvg)} kcal`} />
              )}
              {s.bestDow && <Pattern label="Most often on target" value={`${s.bestDow.name} (${s.bestDow.hit} of ${s.bestDow.n})`} />}
              <Pattern label="Foods logged per day" value={s.mealsPerDay.toFixed(1)} />
              {s.waterDays > 0 && <Pattern label="Water on days you logged it" value={`${Math.round(s.avgWater)} oz`} />}
            </ul>
          )}
        </section>

        {/* 7. WHAT YOU ATE --------------------------------------------- */}
        <FoodsCard foods={foods} />

        {/* 8. RECAP + NUMBERS ------------------------------------------ */}
        {onOpenRecap && s.n > 0 && (
          <button type="button" onClick={() => onOpenRecap(range === 7 ? 'week' : 'month')}
            className="tap flex min-h-14 w-full items-center gap-3 rounded-3xl border border-[var(--line)] bg-[var(--bg-card)] px-5 py-4 text-left">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--on-primary)]" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
            </span>
            <span className="flex-1">
              <span className="block text-sm font-semibold">Play your {range === 7 ? 'week' : 'month'} recap</span>
              <span className="block text-xs text-[var(--ink-mid)]">Streaks, top foods and highlights as a story</span>
            </span>
            <span aria-hidden="true" className="text-[var(--ink-light)]">›</span>
          </button>
        )}

        <details className={`${card} text-sm`}>
          <summary className="min-h-11 cursor-pointer py-2 font-semibold">See the numbers</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left tabular-nums">
              <thead className="text-xs text-[var(--ink-light)]"><tr><th className="py-1 pr-2 font-semibold">Day</th><th className="pr-2 font-semibold">Eaten</th><th className="pr-2 font-semibold">Burned</th><th className="pr-2 font-semibold">Balance</th><th className="font-semibold">P/C/F g</th></tr></thead>
              <tbody>
                {[...days].reverse().filter(d => range !== 90 || d.logged).map(d => (
                  <tr key={d.date} className="border-t border-[var(--line)]">
                    <td className="py-1.5 pr-2 whitespace-nowrap">{d.label}</td>
                    <td className="pr-2">{d.logged ? n0(d.eaten) : '—'}</td>
                    <td className="pr-2">{d.burned !== null ? n0(d.burned) : '—'}</td>
                    <td className="pr-2">{d.net !== null ? signed(d.net) : '—'}</td>
                    <td className="whitespace-nowrap">{d.logged ? `${Math.round(d.protein)}/${Math.round(d.carbs)}/${Math.round(d.fat)}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </div>
  );
};

function shortDate(iso: string) {
  const d = parseDayKey(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function Stat({ label, value, unit, sub, delta }: { label: string; value: string; unit: string; sub: string; delta: { text: string } | null }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-3.5">
      <p className="text-[11px] font-semibold text-[var(--ink-mid)]">{label}</p>
      <p className="mt-1 text-2xl font-bold leading-none tabular-nums">{value}<span className="ml-1 text-xs font-medium text-[var(--ink-mid)]">{unit}</span></p>
      <p className="mt-1.5 text-[11px] leading-snug text-[var(--ink-mid)]">{sub}</p>
      {delta && <p className="mt-0.5 text-[11px] leading-snug text-[var(--ink-light)] tabular-nums">{delta.text}</p>}
    </div>
  );
}

function Meter({ label, hint, value, of }: { label: string; hint?: string; value: number; of: number }) {
  const pct = of ? Math.min(100, (value / of) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold">{label}{hint && <span className="ml-1.5 text-xs font-normal text-[var(--ink-light)]">{hint}</span>}</span>
        <span className="tabular-nums text-[var(--ink-mid)]"><b className="text-[var(--ink)]">{value}</b> of {of} days</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--line-strong)]" role="meter" aria-valuemin={0} aria-valuemax={of} aria-valuenow={value} aria-label={label}>
        <div className="bar-grow h-full rounded-full bg-[var(--primary)]" style={{ width: `${Math.max(pct, value ? 3 : 0)}%` }} />
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-[var(--ink-light)]">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Pattern({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-baseline justify-between gap-3">
      <span className="text-[var(--ink-mid)]">{label}</span>
      <span className="text-right font-semibold tabular-nums">{value}</span>
    </li>
  );
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-0.5 rounded-full bg-[var(--wash)] p-0.5">
      {options.map(o => (
        <button key={o.id} type="button" role="tab" aria-selected={value === o.id} onClick={() => onChange(o.id)}
          className={`tap min-h-8 rounded-full px-3 text-xs font-semibold ${value === o.id ? 'bg-[var(--ink)] text-[var(--bg-dark)]' : 'text-[var(--ink-mid)]'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function CaloriesCard({ bars, target, weekly }: { bars: Bar[]; target: number; weekly: boolean }) {
  const [mode, setMode] = useState<'eaten' | 'balance'>('eaten');
  const [sel, setSel] = useState<number | null>(null);
  const index = sel ?? bars.length - 1;
  const bar = bars[index];
  const hasBalance = bars.some(b => b.net !== null);
  const readout = mode === 'eaten'
    ? (bar.logged ? `${n0(bar.eaten)} kcal${weekly ? ' avg/day' : ''}` : 'Nothing logged')
    : (bar.net === null ? 'No balance' : `${signed(bar.net)} kcal${weekly ? ' avg/day' : ''}`);
  return (
    <section className={card} aria-label="Calories">
      <div className="flex items-center justify-between gap-2">
        <p className={eyebrow}>Calories</p>
        <Segmented label="Calories view" value={mode} onChange={v => { setMode(v); setSel(null); }}
          options={[{ id: 'eaten', label: 'Eaten' }, { id: 'balance', label: 'Balance' }]} />
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-2">
        <p className="text-xs text-[var(--ink-mid)]">{bar.label}</p>
        <p className="text-sm font-semibold tabular-nums">{readout}</p>
      </div>
      {mode === 'eaten' ? (
        <EatenBars bars={bars} target={target} index={index} set={setSel} />
      ) : hasBalance ? (
        <BalanceBars bars={bars} index={index} set={setSel} />
      ) : (
        <p className="mt-3 h-36 text-sm text-[var(--ink-mid)]">Log food (and add your stats in Profile) to see what you ate against what you burned.</p>
      )}
      <XLabels bars={bars} index={index} />
      <p className="mt-2 text-[11px] text-[var(--ink-light)]">
        {mode === 'eaten'
          ? `Dashed line = your ${target.toLocaleString()} kcal target${weekly ? ' · each bar is a week’s daily average' : ''}`
          : <>
              <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: 'var(--viz-deficit)' }} />Under what you burned
              <span className="ml-3 mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: 'var(--viz-surplus)' }} />Over
            </>}
      </p>
    </section>
  );
}

function XLabels({ bars, index }: { bars: Bar[]; index: number }) {
  return (
    <div className="mt-1.5 flex gap-[2px]">
      {bars.map((b, i) => <span key={b.key} className={`flex-1 whitespace-nowrap text-center text-[10px] ${i === index ? 'font-bold text-[var(--ink)]' : 'text-[var(--ink-light)]'}`}>{b.short}</span>)}
    </div>
  );
}

function EatenBars({ bars, target, index, set }: { bars: Bar[]; target: number; index: number; set: (i: number | null) => void }) {
  const max = Math.max(1, target * 1.2, ...bars.map(b => b.eaten));
  return (
    <div className="relative mt-2 h-36" onPointerLeave={() => set(null)}>
      <div aria-hidden="true" className="absolute inset-x-0 border-t-2 border-dashed border-[var(--ink-light)]/70" style={{ bottom: `${(target / max) * 100}%` }} />
      <div className="absolute inset-0 flex items-end gap-[2px]">
        {bars.map((b, i) => (
          <button key={b.key} type="button" aria-label={`${b.label}: ${b.logged ? `${n0(b.eaten)} kcal` : 'nothing logged'}`} onClick={() => set(i)} onPointerEnter={() => set(i)}
            className="flex h-full flex-1 items-end justify-center">
            <span className="bar-grow block w-full max-w-[28px] rounded-t-[4px]" style={{
              height: `${b.logged ? Math.max(2, (b.eaten / max) * 100) : 1.5}%`,
              background: b.logged ? 'var(--primary)' : 'var(--line-strong)',
              opacity: i === index ? 1 : 0.55,
              animationDelay: `${i * 18}ms`,
            }} />
          </button>
        ))}
      </div>
    </div>
  );
}

function BalanceBars({ bars, index, set }: { bars: Bar[]; index: number; set: (i: number | null) => void }) {
  const span = Math.max(250, ...bars.map(b => Math.abs(b.net ?? 0)));
  return (
    <div className="relative mt-2 h-36" onPointerLeave={() => set(null)}>
      <div aria-hidden="true" className="absolute inset-x-0 top-1/2 border-t border-[var(--ink-light)]/60" />
      <div className="absolute inset-0 flex gap-[2px]">
        {bars.map((b, i) => {
          const h = b.net === null ? 0 : (Math.abs(b.net) / span) * 50;
          const under = (b.net ?? 0) <= 0;
          return (
            <button key={b.key} type="button" onClick={() => set(i)} onPointerEnter={() => set(i)}
              aria-label={`${b.label}: ${b.net === null ? 'no balance' : `${under ? 'under' : 'over'} by ${n0(Math.abs(b.net))} kcal`}`}
              className="relative h-full flex-1">
              {b.net !== null && <span className="absolute left-1/2 block w-full max-w-[28px] -translate-x-1/2" style={{
                height: `${Math.max(1, h)}%`,
                top: under ? '50%' : undefined, bottom: under ? undefined : '50%',
                background: under ? 'var(--viz-deficit)' : 'var(--viz-surplus)',
                borderRadius: under ? '0 0 4px 4px' : '4px 4px 0 0',
                opacity: i === index ? 1 : 0.55,
              }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MacroCard({ n, protein, carbs, fat, targets }: { n: number; protein: number; carbs: number; fat: number; targets: NutritionTargets }) {
  const rows = [
    { key: 'p', label: 'Protein', color: 'var(--viz-protein)', g: protein, target: targets.protein, kcal: protein * 4 },
    { key: 'c', label: 'Carbs', color: 'var(--viz-carbs)', g: carbs, target: targets.carbs, kcal: carbs * 4 },
    { key: 'f', label: 'Fat', color: 'var(--viz-fat)', g: fat, target: targets.fat, kcal: fat * 9 },
  ];
  const total = rows.reduce((t, r) => t + r.kcal, 0) || 1;
  return (
    <section className={card} aria-label="Macros">
      <p className={eyebrow}>Macros · daily average</p>
      {n === 0 ? <p className="mt-3 text-sm text-[var(--ink-mid)]">Nothing logged in this range yet.</p> : <>
        <div className="mt-3 space-y-3.5">
          {rows.map(r => {
            const pct = r.target ? (r.g / r.target) * 100 : 0;
            return (
              <div key={r.key}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2 font-semibold"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: r.color }} aria-hidden="true" />{r.label}</span>
                  <span className="tabular-nums text-[var(--ink-mid)]"><b className="text-[var(--ink)]">{Math.round(r.g)} g</b> / {r.target} g · {Math.round(pct)}%</span>
                </div>
                <div className="relative mt-1.5 h-2 rounded-full bg-[var(--line-strong)]" role="meter" aria-label={`${r.label} average vs target`} aria-valuenow={Math.round(r.g)} aria-valuemin={0} aria-valuemax={r.target}>
                  <div className="bar-grow h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: r.color }} />
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-5 border-t border-[var(--line)] pt-3">
          <p className="text-xs text-[var(--ink-mid)]">Where your calories come from</p>
          <div className="mt-2 flex h-3 gap-[2px] overflow-hidden rounded-full" aria-hidden="true">
            {rows.map(r => <span key={r.key} className="block h-full" style={{ flexGrow: r.kcal, flexBasis: 0, background: r.color }} />)}
          </div>
          <div className="mt-2 flex justify-between text-xs tabular-nums text-[var(--ink-mid)]">
            {rows.map(r => <span key={r.key}>{r.label} <b className="text-[var(--ink)]">{Math.round((r.kcal / total) * 100)}%</b></span>)}
          </div>
        </div>
      </>}
    </section>
  );
}

function DayGrid({ days, target }: { days: Day[]; target: number }) {
  const [sel, setSel] = useState<number | null>(null);
  // Pad the front so columns line up with weekdays (Sun first).
  const lead = days[0].d.getDay();
  const cells: (Day | null)[] = [...Array.from({ length: lead }, () => null), ...days];
  const state = (d: Day) => !d.logged ? 'none' : Math.abs(d.eaten - target) <= target * 0.1 ? 'on' : 'logged';
  const shown = sel !== null ? days[sel] : null;
  const cellH = days.length <= 7 ? 'h-10' : days.length > 31 ? 'h-6' : 'h-7';
  return (
    <div className="mt-3">
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-[var(--ink-light)]">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((x, i) => <span key={i}>{x}</span>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1" onPointerLeave={() => setSel(null)}>
        {cells.map((d, i) => {
          if (!d) return <span key={`pad-${i}`} />;
          const st = state(d);
          const di = i - lead;
          return (
            <button key={d.date} type="button" onClick={() => setSel(di)} onPointerEnter={() => setSel(di)}
              aria-label={`${d.label}: ${st === 'none' ? 'not logged' : `${n0(d.eaten)} kcal${st === 'on' ? ', on target' : ''}`}`}
              className={`${cellH} rounded-md text-[10px] font-semibold tabular-nums transition-opacity ${d.isToday ? 'ring-2 ring-[var(--ink-mid)] ring-offset-2 ring-offset-[var(--bg-card)]' : ''}`}
              style={{
                background: st === 'on' ? 'var(--primary)' : st === 'logged' ? 'color-mix(in srgb, var(--primary) 38%, transparent)' : 'var(--wash)',
                color: st === 'on' ? 'var(--on-primary)' : 'var(--ink-mid)',
                opacity: sel === null || sel === di ? 1 : 0.7,
              }}>
              {d.d.getDate()}
            </button>
          );
        })}
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px] text-[var(--ink-mid)]">
        <span className="flex items-center gap-3">
          <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: 'var(--primary)' }} />On target</span>
          <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: 'color-mix(in srgb, var(--primary) 38%, transparent)' }} />Logged</span>
        </span>
        <span className="text-right font-semibold text-[var(--ink)]">{shown ? `${shown.label.replace(/^\w+, /, '')}: ${shown.logged ? `${n0(shown.eaten)} kcal` : 'not logged'}` : ''}</span>
      </div>
    </div>
  );
}

function FoodsCard({ foods }: { foods: { total: number; mostLogged: { name: string; count: number; kcal: number }[]; mostCalories: { name: string; count: number; kcal: number }[]; distinct: number } }) {
  const [mode, setMode] = useState<'logged' | 'kcal'>('logged');
  const list = mode === 'logged' ? foods.mostLogged : foods.mostCalories;
  const max = Math.max(1, ...list.map(f => (mode === 'logged' ? f.count : f.kcal)));
  return (
    <section className={card} aria-label="What you ate">
      <div className="flex items-center justify-between gap-2">
        <p className={eyebrow}>What you ate</p>
        {list.length > 0 && <Segmented<'logged' | 'kcal'> label="Sort foods" value={mode} onChange={setMode}
          options={[{ id: 'logged', label: 'Most logged' }, { id: 'kcal', label: 'Most kcal' }]} />}
      </div>
      {list.length === 0 ? <p className="mt-3 text-sm text-[var(--ink-mid)]">Foods you log in this range show up here.</p> : <>
        <ol className="mt-3 space-y-3">
          {list.map((f, i) => {
            const v = mode === 'logged' ? f.count : f.kcal;
            return (
              <li key={f.name}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate"><span className="mr-2 tabular-nums text-[var(--ink-light)]">{i + 1}</span>{f.name}</span>
                  <span className="shrink-0 tabular-nums text-[var(--ink-mid)]">{mode === 'logged'
                    ? <><b className="text-[var(--ink)]">{f.count}×</b> · {n0(f.kcal / f.count)} kcal</>
                    : <><b className="text-[var(--ink)]">{n0(f.kcal)}</b> kcal · {Math.round((f.kcal / Math.max(1, foods.total)) * 100)}%</>}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-[var(--line-strong)]">
                  <div className="bar-grow h-full rounded-full bg-[var(--primary)]" style={{ width: `${(v / max) * 100}%` }} />
                </div>
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-[11px] text-[var(--ink-light)]">{foods.distinct} different foods in this range</p>
      </>}
    </section>
  );
}

function WeightLine({ points, goal }: { points: WeightEntry[]; goal: number | null }) {
  const [sel, setSel] = useState<number | null>(null);
  const W = 320, H = 120, pad = 10;
  const ws = points.map(p => p.weight);
  const min = Math.min(...ws), max = Math.max(...ws), span = Math.max(1, max - min);
  const t0 = parseDayKey(points[0].date).getTime(), t1 = parseDayKey(points[points.length - 1].date).getTime();
  const x = (p: WeightEntry) => pad + ((parseDayKey(p.date).getTime() - t0) / Math.max(1, t1 - t0)) * (W - pad * 2);
  const y = (p: WeightEntry) => pad + (1 - (p.weight - min) / span) * (H - pad * 2);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(p).toFixed(1)},${y(p).toFixed(1)}`).join(' ');
  const i = sel ?? points.length - 1;
  return (
    <div>
      <div className="mt-1 flex items-baseline justify-between">
        <p className="text-2xl font-bold tabular-nums">{points[i].weight}<span className="ml-1 text-sm font-medium text-[var(--ink-mid)]">lbs</span></p>
        <p className="text-xs text-[var(--ink-mid)]">{shortDate(points[i].date)}{goal ? ` · goal ${goal}` : ''}</p>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img" aria-label={`Weight from ${points[0].weight} to ${points[points.length - 1].weight} lbs`} onPointerLeave={() => setSel(null)}>
        <path d={d} fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, k) => (
          <g key={p.id || p.date} onPointerEnter={() => setSel(k)} onClick={() => setSel(k)}>
            <circle cx={x(p)} cy={y(p)} r="14" fill="transparent" />
            <circle cx={x(p)} cy={y(p)} r={k === i ? 5 : 3.5} fill="var(--primary)" stroke="var(--bg-card)" strokeWidth="2" />
          </g>
        ))}
      </svg>
    </div>
  );
}
