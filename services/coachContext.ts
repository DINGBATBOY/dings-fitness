/**
 * What the Coach knows about you, rebuilt fresh for every chat message.
 *
 * Apple Health data (steps, Health active energy, Health workouts) is NOT
 * included: the privacy policy promises HealthKit data is never disclosed to
 * third parties, including AI providers (and Apple's guideline 5.1.3 is
 * strict about it). Changing that needs an explicit opt-in + policy update.
 *
 * Storage plan: nothing new is stored. Everything here already lives in the
 * app's state (today's log, the dailyLogs archive, weigh-ins, food history)
 * plus Apple Health numbers held in memory. Each message gets a compact,
 * capped text snapshot (~2-4 KB): today in detail, the last 7 days per day,
 * 30-day averages, weight trend and usual foods. Older detail is summarized,
 * not sent, so the prompt stays small no matter how long someone uses Ding.
 */
import type { AppState, DailyLog, NutritionTargets, WeightEntry } from '../types';

export interface CoachContextInput {
  appState: AppState;
  targets: NutritionTargets;
  consumed: { calories: number; protein: number; carbs: number; fat: number };
  streak: number;
}

const r = (n: number) => Math.round(n || 0);
const DAY = 86400000;

export function buildCoachContext(i: CoachContextInput): string {
  const { appState, targets, consumed } = i;
  const now = new Date();
  const today = now.toLocaleDateString();
  const lines: string[] = [];
  const profile = appState.profile;

  lines.push(`Now: ${now.toLocaleString('en-US', { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`);
  if (profile) lines.push(`Goal: ${profile.goal}${profile.goalTargetWeight ? ` (target ${profile.goalTargetWeight} lbs)` : ''}. Day streak: ${i.streak}.`);
  lines.push(`Daily targets: ${r(targets.calories)} kcal, P ${r(targets.protein)} g, C ${r(targets.carbs)} g, F ${r(targets.fat)} g.`);

  // ── Today ──
  const left = targets.calories - consumed.calories;
  lines.push('', 'TODAY');
  lines.push(`Eaten: ${r(consumed.calories)} kcal, P ${r(consumed.protein)} / C ${r(consumed.carbs)} / F ${r(consumed.fat)} g. ` +
    `Left: ${left >= 0 ? r(left) : `${r(-left)} over`} kcal, P ${r(targets.protein - consumed.protein)} / C ${r(targets.carbs - consumed.carbs)} / F ${r(targets.fat - consumed.fat)} g.`);
  const foods = (appState.todayLog || []).slice(0, 30);
  if (foods.length) {
    lines.push('Foods today (time · name · kcal · P/C/F):');
    for (const f of [...foods].reverse()) lines.push(`- ${f.timestamp?.replace(/:\d{2}\s/, ' ') || ''} · ${f.name} · ${r(f.calories)} · ${r(f.protein)}/${r(f.carbs)}/${r(f.fat)}`);
    if ((appState.todayLog || []).length > 30) lines.push(`(+${appState.todayLog.length - 30} more items)`);
  } else lines.push('Nothing logged yet today.');
  lines.push(`Water: ${r(appState.waterIntake || 0)} oz. Workouts logged in Ding: ${r(appState.activityBurn || 0)} kcal.`);
  lines.push('(Steps and calories burned from Apple Health stay on the phone and are not shared with you. If asked, point the user to the balance card on Home.)');

  // ── Last 7 days ──
  const byDate = new Map<string, DailyLog>();
  for (const l of appState.dailyLogs || []) {
    if (!l?.date) continue;
    const p = new Date(l.date);
    byDate.set(Number.isNaN(p.getTime()) ? l.date : p.toLocaleDateString(), l);
  }
  const start = new Date(); start.setHours(0, 0, 0, 0);
  lines.push('', 'LAST 7 DAYS (before today): date · kcal · P/C/F g · water · logged workouts · top foods');
  let weekKcal = 0, weekDays = 0, weekP = 0;
  for (let k = 7; k >= 1; k--) {
    const d = new Date(start.getTime() - k * DAY);
    const key = d.toLocaleDateString();
    const l = byDate.get(key);
    const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
    if (!l || !((l.caloriesConsumed || 0) > 0 || l.foodItems?.length)) { lines.push(`- ${label} · not logged`); continue; }
    weekKcal += l.caloriesConsumed || 0; weekP += l.proteinConsumed || 0; weekDays++;
    const top = [...(l.foodItems || [])].sort((a, b) => b.calories - a.calories).slice(0, 3).map(f => f.name).join(', ');
    lines.push(`- ${label} · ${r(l.caloriesConsumed)} · ${r(l.proteinConsumed)}/${r(l.carbsConsumed)}/${r(l.fatConsumed)} · ${r(l.waterIntake || 0)} oz${l.caloriesBurned ? ` · workouts ${r(l.caloriesBurned)} kcal` : ''}${top ? ` · ${top}` : ''}`);
  }
  if (weekDays) lines.push(`7-day average on logged days: ${r(weekKcal / weekDays)} kcal, ${r(weekP / weekDays)} g protein (${weekDays}/7 days logged). 7-day total: ${r(weekKcal)} kcal.`);

  // ── 30-day summary ──
  const month: DailyLog[] = [];
  for (let k = 30; k >= 1; k--) {
    const l = byDate.get(new Date(start.getTime() - k * DAY).toLocaleDateString());
    if (l && ((l.caloriesConsumed || 0) > 0 || l.foodItems?.length)) month.push(l);
  }
  if (month.length) {
    const avg = (f: (l: DailyLog) => number) => r(month.reduce((t, l) => t + (f(l) || 0), 0) / month.length);
    const near = month.filter(l => Math.abs((l.caloriesConsumed || 0) - targets.calories) <= targets.calories * 0.1).length;
    lines.push('', `LAST 30 DAYS: ${month.length} days logged; avg ${avg(l => l.caloriesConsumed)} kcal, P ${avg(l => l.proteinConsumed)} / C ${avg(l => l.carbsConsumed)} / F ${avg(l => l.fatConsumed)} g; ${near} days within 10% of target.`);
  }

  // ── Weight ──
  // Health-sourced weigh-ins are HealthKit data: excluded like steps.
  const w: WeightEntry[] = [...(appState.weighIns || [])].filter(e => e.source !== 'health' && e.weight > 50 && e.weight < 700).sort((a, b) => a.date.localeCompare(b.date));
  if (w.length) {
    const recent = w.slice(-6).map(e => `${e.date} ${e.weight}`).join(', ');
    lines.push('', `WEIGHT (lbs): ${recent}.${profile?.initialWeight ? ` Started at ${profile.initialWeight}.` : ''}`);
  }

  // ── Usuals ──
  const usual = [...(appState.foodHistory || [])].sort((a, b) => (b.loggedCount || 0) - (a.loggedCount || 0)).slice(0, 6);
  if (usual.length) lines.push('', `USUAL FOODS: ${usual.map(h => `${h.label} (${r(h.totalCalories)} kcal${h.loggedCount ? `, ×${h.loggedCount}` : ''})`).join('; ')}.`);

  return lines.join('\n').slice(0, 7000);
}

