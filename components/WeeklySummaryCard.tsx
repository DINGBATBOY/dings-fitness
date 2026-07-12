/**
 * WeeklySummaryCard — week-at-a-glance calorie trail on the Fuel home.
 *
 * Shows this calendar week (Mon–Sun): total + average on logged days,
 * a 7-day mini bar strip (emerald = at/under target, fire = over, dim =
 * not logged), the week-over-week average delta, and weight change from
 * this week's weigh-ins.
 *
 * "Analyze my week" asks Gemini (via the callGemini Cloud Function) to
 * explain WHICH days and foods drove the count up or kept it on track.
 * The result is cached in localStorage per week + data snapshot, so
 * re-opening the app doesn't re-spend an AI call unless the data changed.
 */

import React, { useMemo, useState } from 'react';
import { Sparkles, TrendingDown, TrendingUp, Minus, RotateCcw } from 'lucide-react';
import type { DailyLog, NutritionTargets, WeightEntry } from '../types';
import { PhysiqueGoal } from '../types';
import type { UserProfile } from '../types';
import { analyzeWeeklyCalories, type WeeklyAnalysis, type WeeklyDaySummary } from '../services/geminiService';

const C = {
  bg: '#161210',
  card: '#1d1815',
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

const CACHE_KEY = 'ding.weekAnalysis';

interface WeeklySummaryCardProps {
  dailyLogs: DailyLog[];
  /** Live totals for today (today usually isn't archived into dailyLogs yet). */
  consumedToday: { calories: number; protein: number; carbs: number; fat: number };
  targets: NutritionTargets;
  weighIns: WeightEntry[];
  profile: UserProfile;
}

interface DayDatum {
  day: string;
  date: Date;
  calories: number | null;
  isToday: boolean;
  isFuture: boolean;
  topFoods: string[];
  workout?: string;
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const startOfWeek = (d: Date): Date => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // back to Monday
  return x;
};

export const WeeklySummaryCard: React.FC<WeeklySummaryCardProps> = ({
  dailyLogs,
  consumedToday,
  targets,
  weighIns,
  profile,
}) => {
  const [analysis, setAnalysis] = useState<WeeklyAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState('');

  const week = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const byDate = new Map<string, DailyLog>();
    (dailyLogs || []).forEach(l => {
      if (!l.date) return;
      const parsed = new Date(l.date);
      const key = Number.isNaN(parsed.getTime()) ? l.date : parsed.toLocaleDateString();
      byDate.set(key, l);
    });

    const readDay = (d: Date, isToday: boolean): DayDatum => {
      const log = byDate.get(d.toLocaleDateString());
      let calories: number | null =
        log && (log.caloriesConsumed || 0) > 0 ? Math.round(log.caloriesConsumed) : null;
      if (isToday) {
        // Today lives in live state; the archived log (if any) may lag it.
        const live = Math.round(consumedToday.calories || 0);
        calories = Math.max(live, calories ?? 0) > 0 ? Math.max(live, calories ?? 0) : null;
      }
      const topFoods = (log?.foodItems || [])
        .slice()
        .sort((a, b) => (b.calories || 0) - (a.calories || 0))
        .slice(0, 2)
        .map(i => `${i.name} (${Math.round(i.calories)} kcal)`);
      return {
        day: DAY_NAMES[(d.getDay() + 6) % 7],
        date: d,
        calories,
        isToday,
        isFuture: d > today,
        topFoods,
        workout: log?.workoutCompleted ? (log.workoutLabel || 'workout') : undefined,
      };
    };

    const mon = startOfWeek(today);
    const days: DayDatum[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(mon); d.setDate(mon.getDate() + i);
      days.push(readDay(d, d.getTime() === today.getTime()));
    }

    const lastMon = new Date(mon); lastMon.setDate(mon.getDate() - 7);
    const lastDays: DayDatum[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(lastMon); d.setDate(lastMon.getDate() + i);
      lastDays.push(readDay(d, false));
    }

    const logged = days.filter(d => d.calories !== null);
    const total = logged.reduce((s, d) => s + (d.calories || 0), 0);
    const avg = logged.length ? Math.round(total / logged.length) : null;

    const lastLogged = lastDays.filter(d => d.calories !== null);
    const lastAvg = lastLogged.length
      ? Math.round(lastLogged.reduce((s, d) => s + (d.calories || 0), 0) / lastLogged.length)
      : null;

    // Weight change across this week's weigh-ins.
    const thisWeekWeighIns = (weighIns || [])
      .filter(e => {
        const t = new Date(`${e.date}T12:00:00`);
        return t >= mon && e.weight > 50 && e.weight < 700;
      })
      .sort((a, b) => new Date(`${a.date}T12:00:00`).getTime() - new Date(`${b.date}T12:00:00`).getTime());
    const weightChange = thisWeekWeighIns.length >= 2
      ? thisWeekWeighIns[thisWeekWeighIns.length - 1].weight - thisWeekWeighIns[0].weight
      : null;

    return { mon, days, total, avg, loggedCount: logged.length, lastAvg, weightChange };
  }, [dailyLogs, consumedToday, weighIns]);

  // Snapshot hash — cached analysis is reused only while the data matches.
  const dataHash = useMemo(
    () => JSON.stringify([week.days.map(d => d.calories), week.lastAvg]),
    [week],
  );
  const weekKey = week.mon.toISOString().slice(0, 10);

  // Rehydrate a cached analysis for this exact week + data snapshot.
  useMemo(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return;
      const cached = JSON.parse(raw);
      if (cached.weekKey === weekKey && cached.hash === dataHash && cached.result) {
        setAnalysis(cached.result);
      }
    } catch { /* fine — user just taps analyze again */ }
  }, [weekKey, dataHash]);

  const runAnalysis = async () => {
    setAnalyzing(true);
    setAnalysisError('');
    try {
      const thisWeek: WeeklyDaySummary[] = week.days
        .filter(d => !d.isFuture)
        .map(d => ({
          day: d.day,
          date: d.date.toLocaleDateString(),
          calories: d.calories,
          topFoods: d.topFoods,
          workout: d.workout,
        }));
      const result = await analyzeWeeklyCalories(
        { thisWeek, thisWeekAvg: week.avg, lastWeekAvg: week.lastAvg, weightChange: week.weightChange },
        profile,
        targets,
      );
      setAnalysis(result);
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ weekKey, hash: dataHash, result }));
      } catch { /* storage full/private — nonfatal */ }
    } catch {
      setAnalysisError("Couldn't reach the coach right now. Try again in a bit.");
    } finally {
      setAnalyzing(false);
    }
  };

  const delta = week.avg !== null && week.lastAvg !== null ? week.avg - week.lastAvg : null;
  // For bulking, eating more than last week is progress; otherwise less is.
  const deltaIsGood = delta === null ? true
    : profile.goal === PhysiqueGoal.Bulk ? delta >= 0 : delta <= 0;
  const DeltaIcon = delta === null || delta === 0 ? Minus : delta < 0 ? TrendingDown : TrendingUp;

  const maxBar = Math.max(targets.calories, ...week.days.map(d => d.calories || 0), 1);

  return (
    <div className="rounded-3xl p-5 mt-3" style={{ background: C.card, border: `1px solid ${C.border}` }}>
      {/* Header */}
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-[0.3em] font-bold" style={{ color: C.inkLight }}>
          This week
        </span>
        <span className="text-[10px] tabular-nums" style={{ color: C.inkLight }}>
          {week.loggedCount} of 7 days logged
        </span>
      </div>

      {/* Totals row */}
      <div className="flex items-end justify-between gap-3 mt-3">
        <div>
          <div className="text-[28px] font-bold tabular-nums leading-none" style={{ color: C.ink }}>
            {week.total.toLocaleString()}
            <span className="text-[11px] font-semibold ml-1.5" style={{ color: C.inkLight }}>kcal</span>
          </div>
          <div className="text-[11px] mt-1.5" style={{ color: C.inkMid }}>
            {week.avg !== null ? `${week.avg.toLocaleString()} avg / day` : 'No days logged yet'}
            <span style={{ color: C.inkLight }}> · target {targets.calories.toLocaleString()}</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          {delta !== null && (
            <div className="flex items-center justify-end gap-1 text-[12px] font-bold tabular-nums"
              style={{ color: deltaIsGood ? C.emerald : C.fire }}>
              <DeltaIcon className="w-3.5 h-3.5" strokeWidth={2} />
              {delta === 0 ? 'even' : `${Math.abs(delta).toLocaleString()} kcal/day`}
            </div>
          )}
          <div className="text-[10px] mt-0.5" style={{ color: C.inkLight }}>
            {week.lastAvg !== null ? `vs last week's ${week.lastAvg.toLocaleString()} avg` : 'no last-week data yet'}
          </div>
          {week.weightChange !== null && (
            <div className="text-[10px] mt-1 font-semibold tabular-nums"
              style={{ color: week.weightChange <= 0 ? C.emerald : C.sky }}>
              {week.weightChange > 0 ? '+' : ''}{week.weightChange.toFixed(1)} lbs this week
            </div>
          )}
        </div>
      </div>

      {/* 7-day bar strip */}
      <div className="grid grid-cols-7 gap-1.5 mt-4">
        {week.days.map(d => {
          const h = d.calories ? Math.max(6, Math.round((d.calories / maxBar) * 44)) : 4;
          const over = d.calories !== null && d.calories > targets.calories;
          const color = d.calories === null ? C.borderStrong : over ? C.fire : C.emerald;
          return (
            <div key={d.day} className="flex flex-col items-center">
              <div className="w-full flex items-end justify-center" style={{ height: 44 }}>
                <div
                  className="w-full max-w-[22px] rounded-t-[4px]"
                  style={{
                    height: h,
                    background: color,
                    opacity: d.isFuture ? 0.25 : d.calories === null ? 0.5 : 1,
                  }}
                />
              </div>
              <span
                className="text-[8px] font-bold uppercase tracking-wider mt-1"
                style={{ color: d.isToday ? C.ochre : C.inkLight }}
              >
                {d.day.slice(0, 2)}
              </span>
            </div>
          );
        })}
      </div>

      {/* ─── AI analysis ─── */}
      <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${C.border}` }}>
        {!analysis && (
          <button
            onClick={runAnalysis}
            disabled={analyzing || week.loggedCount < 2}
            className="w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-widest transition-opacity disabled:opacity-40"
            style={{ background: `${C.fire}1a`, color: C.fire, border: `1px solid ${C.fire}40` }}
          >
            <Sparkles className="w-3.5 h-3.5" strokeWidth={1.7} />
            {analyzing ? 'Reading your trail…' : week.loggedCount < 2 ? 'Log 2+ days to analyze' : 'Analyze my week'}
          </button>
        )}
        {analysisError && (
          <p className="text-[11px] mt-2 text-center" style={{ color: C.fire }}>{analysisError}</p>
        )}
        {analysis && (
          <div>
            <p className="text-[12px] leading-relaxed" style={{ color: C.inkMid }}>{analysis.summary}</p>

            {analysis.wins.length > 0 && (
              <div className="mt-3">
                <span className="text-[9px] uppercase tracking-[0.25em] font-bold" style={{ color: C.emerald }}>
                  What worked
                </span>
                {analysis.wins.map((w, i) => (
                  <p key={i} className="text-[11px] mt-1 leading-snug" style={{ color: C.inkMid }}>· {w}</p>
                ))}
              </div>
            )}

            {analysis.watchouts.length > 0 && (
              <div className="mt-3">
                <span className="text-[9px] uppercase tracking-[0.25em] font-bold" style={{ color: C.fire }}>
                  What ran hot
                </span>
                {analysis.watchouts.map((w, i) => (
                  <p key={i} className="text-[11px] mt-1 leading-snug" style={{ color: C.inkMid }}>· {w}</p>
                ))}
              </div>
            )}

            {analysis.drivers.length > 0 && (
              <div className="mt-3">
                <span className="text-[9px] uppercase tracking-[0.25em] font-bold" style={{ color: C.ochre }}>
                  Patterns
                </span>
                {analysis.drivers.map((w, i) => (
                  <p key={i} className="text-[11px] mt-1 leading-snug" style={{ color: C.inkMid }}>· {w}</p>
                ))}
              </div>
            )}

            {analysis.oneChange && (
              <div className="mt-3 rounded-xl px-3 py-2.5" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                <span className="text-[9px] uppercase tracking-[0.25em] font-bold" style={{ color: C.sky }}>
                  One change for next week
                </span>
                <p className="text-[12px] mt-1 leading-snug font-semibold" style={{ color: C.ink }}>
                  {analysis.oneChange}
                </p>
              </div>
            )}

            <button
              onClick={runAnalysis}
              disabled={analyzing}
              className="mt-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest"
              style={{ color: C.inkLight }}
            >
              <RotateCcw className="w-3 h-3" strokeWidth={1.7} />
              {analyzing ? 'Reading…' : 'Refresh analysis'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
