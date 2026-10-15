/**
 * ProgressCharts — the top of the Progress tab.
 *
 *   Range: 7 / 30 days (ending today)
 *   Tiles: avg eaten, avg daily balance, days near target
 *   1. Calories eaten per day vs target (bars + dashed target line)
 *   2. Daily balance: eaten − burned (diverging bars around zero; deficit
 *      below in aqua, surplus above in orange). Burned comes from
 *      computeEnergyBalance with Apple Health active energy per day when
 *      connected, otherwise the activity-level estimate + logged workouts.
 *   3. Macros per day, stacked by calories (protein · carbs · fat)
 *   4. Weight check-ins (line)
 *
 * Tap or hover a bar to read its value in the chart header; "See the numbers"
 * opens the same data as a table. Colors are the --viz-* tokens in index.css
 * (validated against every background tone, light and dark).
 */
import React, { useMemo, useState } from 'react';
import type { DailyLog, FoodItem, NutritionTargets, UserProfile, WeightEntry } from '../types';
import { computeEnergyBalance } from '../constants';
import type { DaySummary } from './Dashboard';
import { addDays, dayKey, isoDate, normalizeDayKey, parseDayKey } from '../services/dayKey';

interface Props {
  profile: UserProfile;
  targets: NutritionTargets;
  dailyLogs: DailyLog[];
  todayLog: FoodItem[];
  todayConsumed: { calories: number; protein: number; carbs: number; fat: number };
  todayActivityBurn: number;
  weighIns: WeightEntry[];
  energyBaseline?: { bmr: number; tdee: number } | null;
  healthActiveEnergy?: number | null;
  healthByDate?: Record<string, DaySummary>;
}

type Day = {
  date: string; label: string; short: string;
  eaten: number; protein: number; carbs: number; fat: number;
  logged: boolean; burned: number | null; net: number | null;
};

const card = 'rounded-3xl border border-[var(--line)] bg-[var(--bg-card)] p-5';
const eyebrow = 'text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--ink-light)]';
const n0 = (v: number) => Math.round(v).toLocaleString();

export const ProgressCharts: React.FC<Props> = ({
  profile, targets, dailyLogs, todayLog, todayConsumed, todayActivityBurn, weighIns,
  energyBaseline, healthActiveEnergy, healthByDate = {},
}) => {
  const [range, setRange] = useState<7 | 30>(() => {
    try { return sessionStorage.getItem('ding-progress-range') === '30' ? 30 : 7; } catch { return 7; }
  });
  const pick = (r: 7 | 30) => { setRange(r); try { sessionStorage.setItem('ding-progress-range', String(r)); } catch { /* ignore */ } };

  const days: Day[] = useMemo(() => {
    const byDate = new Map<string, DailyLog>();
    for (const l of dailyLogs || []) {
      if (!l?.date) continue;
      byDate.set(normalizeDayKey(l.date), l);
    }
    const start = new Date(); start.setHours(0, 0, 0, 0);
    return Array.from({ length: range }, (_, i) => {
      const d = addDays(start, -(range - 1 - i));   // DST-safe (DATE-01)
      const date = dayKey(d);
      const isToday = i === range - 1;
      const l = byDate.get(date);
      const eaten = isToday ? todayConsumed.calories : (l?.caloriesConsumed || 0);
      const logged = isToday ? todayLog.length > 0 : !!l && ((l.caloriesConsumed || 0) > 0 || (l.foodItems?.length || 0) > 0);
      const health = healthByDate[date];
      const active = isToday ? (healthActiveEnergy ?? health?.activeKcal ?? null) : (health?.activeKcal ?? null);
      const e = energyBaseline && logged ? computeEnergyBalance({
        bmr: energyBaseline.bmr, activityLevel: profile.activityLevel, caloriesEaten: eaten,
        loggedWorkoutKcal: isToday ? todayActivityBurn : (l?.caloriesBurned || 0), healthActiveEnergy: active,
      }) : null;
      return {
        date,
        label: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        short: range === 7 ? d.toLocaleDateString('en-US', { weekday: 'narrow' }) : (d.getDate() === 1 || i % 5 === 0 || isToday ? String(d.getDate()) : ''),
        eaten,
        protein: isToday ? todayConsumed.protein : (l?.proteinConsumed || 0),
        carbs: isToday ? todayConsumed.carbs : (l?.carbsConsumed || 0),
        fat: isToday ? todayConsumed.fat : (l?.fatConsumed || 0),
        logged,
        burned: e ? e.totalBurn : null,
        net: e ? e.net : null,
      };
    });
  }, [range, dailyLogs, todayLog, todayConsumed, todayActivityBurn, energyBaseline, healthActiveEnergy, healthByDate, profile.activityLevel]);

  const logged = days.filter(d => d.logged);
  const avgEaten = logged.length ? logged.reduce((s, d) => s + d.eaten, 0) / logged.length : 0;
  const withNet = logged.filter(d => d.net !== null);
  const avgNet = withNet.length ? withNet.reduce((s, d) => s + (d.net || 0), 0) / withNet.length : null;
  const nearTarget = logged.filter(d => Math.abs(d.eaten - targets.calories) <= targets.calories * 0.1).length;

  const weights = useMemo(() => {
    const cutoff = isoDate(addDays(new Date(), -(range - 1)));
    return [...(weighIns || [])].filter(w => w.weight > 50 && w.weight < 700 && w.date >= cutoff).sort((a, b) => a.date.localeCompare(b.date));
  }, [weighIns, range]);

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Range" className="grid grid-cols-2 gap-1 rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-1">
        {([7, 30] as const).map(r => (
          <button key={r} type="button" role="tab" aria-selected={range === r} onClick={() => pick(r)}
            className={`tap min-h-11 rounded-xl text-sm font-semibold transition-colors duration-200 ${range === r ? 'bg-[var(--ink)] text-[var(--bg-dark)]' : 'text-[var(--ink-mid)]'}`}>
            Last {r} days
          </button>
        ))}
      </div>

      <div className="stagger grid grid-cols-3 gap-2">
        <Tile label="Avg eaten" value={avgEaten ? n0(avgEaten) : '—'} unit="kcal" />
        <Tile label="Avg balance" value={avgNet === null ? '—' : `${avgNet <= 0 ? '−' : '+'}${n0(Math.abs(avgNet))}`} unit={avgNet === null ? '' : avgNet <= 0 ? 'deficit' : 'surplus'} />
        <Tile label="Near target" value={`${nearTarget}/${logged.length || 0}`} unit="days ±10%" />
      </div>

      <div key={range} className="stagger space-y-4">
        <BarCard
          title="Calories eaten"
          days={days}
          value={d => d.eaten}
          color={() => 'var(--primary)'}
          target={targets.calories}
          format={d => d.logged ? `${n0(d.eaten)} kcal · target ${n0(targets.calories)}` : 'Nothing logged'}
        />

        <DivergingCard days={days} />

        <MacroCard days={days} />

        <section className={card} aria-label="Weight">
          <p className={eyebrow}>Weight check-ins</p>
          {weights.length >= 2 ? <WeightLine points={weights} /> : (
            <p className="mt-3 text-sm text-[var(--ink-mid)]">{weights.length === 1 ? `${weights[0].weight} lbs on ${weights[0].date}. One more weigh-in draws the line.` : 'Weigh in from Home to see your trend here.'}</p>
          )}
        </section>

        <details className={`${card} text-sm`}>
          <summary className="min-h-11 cursor-pointer py-2 font-semibold">See the numbers</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left tabular-nums">
              <thead className="text-xs text-[var(--ink-light)]"><tr><th className="py-1 pr-2 font-semibold">Day</th><th className="pr-2 font-semibold">Eaten</th><th className="pr-2 font-semibold">Burned</th><th className="pr-2 font-semibold">Balance</th><th className="font-semibold">P/C/F g</th></tr></thead>
              <tbody>
                {[...days].reverse().map(d => (
                  <tr key={d.date} className="border-t border-[var(--line)]">
                    <td className="py-1.5 pr-2 whitespace-nowrap">{d.label}</td>
                    <td className="pr-2">{d.logged ? n0(d.eaten) : '—'}</td>
                    <td className="pr-2">{d.burned !== null ? n0(d.burned) : '—'}</td>
                    <td className="pr-2">{d.net !== null ? `${d.net <= 0 ? '−' : '+'}${n0(Math.abs(d.net))}` : '—'}</td>
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

function Tile({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-3">
      <p className="text-[11px] text-[var(--ink-mid)]">{label}</p>
      <p className="mt-0.5 text-lg font-bold leading-tight tabular-nums">{value}</p>
      <p className="text-[11px] text-[var(--ink-light)]">{unit}</p>
    </div>
  );
}

/** Selected-bar state shared by the bar charts: tap or hover to read a day. */
function useSelected(days: Day[]) {
  const [sel, setSel] = useState<number | null>(null);
  const index = sel ?? days.length - 1;
  return { index, day: days[index], set: setSel };
}

function XLabels({ days, index }: { days: Day[]; index: number }) {
  return (
    <div className="mt-1.5 flex gap-[2px]">
      {days.map((d, i) => <span key={d.date} className={`flex-1 text-center text-[10px] ${i === index ? 'font-bold text-[var(--ink)]' : 'text-[var(--ink-light)]'}`}>{d.short}</span>)}
    </div>
  );
}

function BarCard({ title, days, value, color, target, format }: {
  title: string; days: Day[]; value: (d: Day) => number; color: (d: Day) => string; target?: number; format: (d: Day) => string;
}) {
  const { index, day, set } = useSelected(days);
  const max = Math.max(1, (target || 0) * 1.2, ...days.map(value));
  return (
    <section className={card} aria-label={title}>
      <div className="flex items-baseline justify-between gap-2">
        <p className={eyebrow}>{title}</p>
        <p className="text-right text-xs text-[var(--ink-mid)]"><b className="text-[var(--ink)]">{day.label}</b><br />{format(day)}</p>
      </div>
      <div className="relative mt-3 h-36" onPointerLeave={() => set(null)}>
        {target ? (
          <div aria-hidden="true" className="absolute inset-x-0 border-t-2 border-dashed border-[var(--ink-light)]/70" style={{ bottom: `${(target / max) * 100}%` }} />
        ) : null}
        <div className="absolute inset-0 flex items-end gap-[2px]">
          {days.map((d, i) => (
            <button key={d.date} type="button" aria-label={`${d.label}: ${format(d)}`} onClick={() => set(i)} onPointerEnter={() => set(i)}
              className="flex h-full flex-1 items-end justify-center">
              <span className="bar-grow block w-full max-w-[28px] rounded-t-[4px]" style={{
                height: `${d.logged ? Math.max(2, (value(d) / max) * 100) : 1.5}%`,
                background: d.logged ? color(d) : 'var(--line-strong)',
                opacity: i === index ? 1 : 0.55,
                animationDelay: `${i * 18}ms`,
              }} />
            </button>
          ))}
        </div>
      </div>
      <XLabels days={days} index={index} />
      {target ? <p className="mt-2 text-[11px] text-[var(--ink-light)]">Dashed line = your {target.toLocaleString()} kcal target</p> : null}
    </section>
  );
}

function DivergingCard({ days }: { days: Day[] }) {
  const { index, day, set } = useSelected(days);
  const nets = days.map(d => d.net ?? 0);
  const span = Math.max(250, ...nets.map(Math.abs));
  const has = days.some(d => d.net !== null);
  return (
    <section className={card} aria-label="Daily balance">
      <div className="flex items-baseline justify-between gap-2">
        <p className={eyebrow}>Eaten vs burned</p>
        <p className="text-right text-xs text-[var(--ink-mid)]"><b className="text-[var(--ink)]">{day.label}</b><br />
          {day.net === null ? 'No food logged' : `${n0(day.eaten)} eaten · ${n0(day.burned || 0)} burned`}</p>
      </div>
      {!has ? <p className="mt-3 text-sm text-[var(--ink-mid)]">Log food (and add your stats in Profile) to see your daily balance.</p> : <>
        <div className="relative mt-3 h-40" onPointerLeave={() => set(null)}>
          <div aria-hidden="true" className="absolute inset-x-0 top-1/2 border-t border-[var(--ink-light)]/60" />
          <div className="absolute inset-0 flex gap-[2px]">
            {days.map((d, i) => {
              const h = d.net === null ? 0 : (Math.abs(d.net) / span) * 50;
              const deficit = (d.net ?? 0) <= 0;
              return (
                <button key={d.date} type="button" onClick={() => set(i)} onPointerEnter={() => set(i)}
                  aria-label={`${d.label}: ${d.net === null ? 'no food logged' : `${deficit ? 'deficit' : 'surplus'} ${n0(Math.abs(d.net))} kcal`}`}
                  className="relative h-full flex-1">
                  {d.net !== null && <span className="absolute left-1/2 block w-full max-w-[28px] -translate-x-1/2" style={{
                    height: `${Math.max(1, h)}%`,
                    top: deficit ? '50%' : undefined, bottom: deficit ? undefined : '50%',
                    background: deficit ? 'var(--viz-deficit)' : 'var(--viz-surplus)',
                    borderRadius: deficit ? '0 0 4px 4px' : '4px 4px 0 0',
                    opacity: i === index ? 1 : 0.55,
                  }} />}
                </button>
              );
            })}
          </div>
        </div>
        <XLabels days={days} index={index} />
        <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--ink-mid)]">
          <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: 'var(--viz-deficit)' }} />Deficit (below)</span>
          <span className="font-semibold text-[var(--ink)]">{day.net === null ? '' : `${day.net <= 0 ? '−' : '+'}${n0(Math.abs(day.net))} kcal`}</span>
          <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: 'var(--viz-surplus)' }} />Surplus (above)</span>
        </div>
      </>}
    </section>
  );
}

function MacroCard({ days }: { days: Day[] }) {
  const { index, day, set } = useSelected(days);
  const kcal = (d: Day) => ({ p: d.protein * 4, c: d.carbs * 4, f: d.fat * 9 });
  const max = Math.max(1, ...days.map(d => { const k = kcal(d); return k.p + k.c + k.f; }));
  const series = [
    { key: 'p' as const, label: 'Protein', color: 'var(--viz-protein)', grams: day.protein },
    { key: 'c' as const, label: 'Carbs', color: 'var(--viz-carbs)', grams: day.carbs },
    { key: 'f' as const, label: 'Fat', color: 'var(--viz-fat)', grams: day.fat },
  ];
  return (
    <section className={card} aria-label="Macros per day">
      <div className="flex items-baseline justify-between gap-2">
        <p className={eyebrow}>Macros</p>
        <p className="text-xs font-bold text-[var(--ink)]">{day.label}</p>
      </div>
      <div className="relative mt-3 h-36" onPointerLeave={() => set(null)}>
        <div className="absolute inset-0 flex items-end gap-[2px]">
          {days.map((d, i) => {
            const k = kcal(d);
            return (
              <button key={d.date} type="button" onClick={() => set(i)} onPointerEnter={() => set(i)}
                aria-label={`${d.label}: protein ${Math.round(d.protein)} g, carbs ${Math.round(d.carbs)} g, fat ${Math.round(d.fat)} g`}
                className="flex h-full flex-1 items-end justify-center">
                <span className="bar-grow flex w-full max-w-[28px] flex-col-reverse gap-[2px] overflow-hidden rounded-t-[4px]" style={{ height: `${((k.p + k.c + k.f) / max) * 100}%`, opacity: i === index ? 1 : 0.55, animationDelay: `${i * 18}ms` }}>
                  {series.map(s => <span key={s.key} className="block w-full" style={{ flexGrow: k[s.key], flexBasis: 0, background: s.color }} />)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <XLabels days={days} index={index} />
      <div className="mt-3 grid grid-cols-3 gap-2">
        {series.map(s => (
          <div key={s.key} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} aria-hidden="true" />
            <span className="text-xs text-[var(--ink-mid)]">{s.label}<br /><b className="text-sm text-[var(--ink)] tabular-nums">{Math.round(s.grams)} g</b></span>
          </div>
        ))}
      </div>
    </section>
  );
}

function WeightLine({ points }: { points: WeightEntry[] }) {
  const [sel, setSel] = useState<number | null>(null);
  const W = 320, H = 120, pad = 10;
  const ws = points.map(p => p.weight);
  const min = Math.min(...ws), max = Math.max(...ws), span = Math.max(1, max - min);
  const t0 = parseDayKey(points[0].date).getTime(), t1 = parseDayKey(points[points.length - 1].date).getTime();
  const x = (p: WeightEntry) => pad + ((parseDayKey(p.date).getTime() - t0) / Math.max(1, t1 - t0)) * (W - pad * 2);
  const y = (p: WeightEntry) => pad + (1 - (p.weight - min) / span) * (H - pad * 2);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(p).toFixed(1)},${y(p).toFixed(1)}`).join(' ');
  const i = sel ?? points.length - 1;
  const change = points[points.length - 1].weight - points[0].weight;
  return (
    <div>
      <div className="mt-1 flex items-baseline justify-between">
        <p className="text-2xl font-bold tabular-nums">{points[i].weight}<span className="ml-1 text-sm font-medium text-[var(--ink-mid)]">lbs</span></p>
        <p className="text-xs text-[var(--ink-mid)]">{points[i].date} · {change > 0 ? '+' : change < 0 ? '−' : ''}{Math.abs(change).toFixed(1)} lbs over this range</p>
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
