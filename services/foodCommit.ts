import type { AppState, DailyLog, FoodItem, HistoryEntry } from '../types';

// Same format as services/dayKey todayKey(). Inlined because this module is
// also loaded directly by Node's type stripping in tests/food-flow.test.mjs,
// which can't resolve extensionless imports.
const todayKey = (d = new Date()) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
// Canonical form of a stored key (services/dayKey normalizeDayKey, inlined
// for the same reason): legacy en-GB "14/10/2026" and ISO keys name the same day.
const canonDay = (key: string) => {
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(key);
  if (m) return `${+m[2]}/${+m[3]}/${m[1]}`;
  m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(key);
  if (m) return +m[1] > 12 ? `${+m[2]}/${+m[1]}/${m[3]}` : `${+m[1]}/${+m[2]}/${m[3]}`;
  return key;
};

function appendToDay(day: DailyLog, items: FoodItem[]): DailyLog {
  const fresh = items.filter(item => !(day.foodItems || []).some(saved => saved.id === item.id));
  const total = (key: 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber') => fresh.reduce((sum, item) => sum + (item[key] || 0), 0);
  return { ...day, foodItems: [...fresh, ...(day.foodItems || [])],
    caloriesConsumed: (day.caloriesConsumed || 0) + total('calories'),
    proteinConsumed: (day.proteinConsumed || 0) + total('protein'),
    carbsConsumed: (day.carbsConsumed || 0) + total('carbs'),
    fatConsumed: (day.fatConsumed || 0) + total('fat'), fiberConsumed: (day.fiberConsumed || 0) + total('fiber') };
}
function emptyDay(date: string): DailyLog {
  return { date, weight: 0, waterIntake: 0, workoutCompleted: false, caloriesConsumed: 0, proteinConsumed: 0, carbsConsumed: 0, fatConsumed: 0 };
}

/**
 * Midnight rollover: move todayLog into dailyLogs[lastActiveDate] and start a
 * new day. The ONLY rollover in the app (MainApp's timer and commitFood both
 * use it). If that date already has an archive (the clock moved back, a
 * second device, a stale lastActiveDate) the food is MERGED into it,
 * de-duplicated by id. todayLog is never dropped (audit DATA-02).
 */
export function rolloverDay(state: AppState, today = todayKey()): { state: AppState; archived: boolean } {
  const last = state.lastActiveDate;
  if (!last || last === today) return { state, archived: false };
  // Same day written in a legacy format: just adopt the canonical key.
  if (canonDay(last) === canonDay(today)) return { state: { ...state, lastActiveDate: today }, archived: false };
  const dailyLogs = state.dailyLogs || [];
  const base = dailyLogs.find(day => day.date === last) || dailyLogs.find(day => canonDay(day.date) === canonDay(last)) || emptyDay(last);
  // Water/burn are running totals for the day; max() avoids double counting
  // when the same day is rolled over twice (e.g. on two devices).
  const archived = appendToDay({ ...base, date: canonDay(base.date),
    waterIntake: Math.max(base.waterIntake || 0, state.waterIntake || 0),
    caloriesBurned: Math.max(base.caloriesBurned || 0, state.activityBurn || 0) }, state.todayLog || []);
  const hasActivity = !!(archived.foodItems?.length || archived.waterIntake || archived.caloriesBurned);
  return {
    state: { ...state, todayLog: [], waterIntake: 0, activityBurn: 0, lastActiveDate: today,
      dailyLogs: hasActivity ? [...dailyLogs.filter(day => day !== base), archived] : dailyLogs },
    archived: hasActivity,
  };
}

/** One idempotent commit for all food sources, including a draft completed after midnight. */
export function commitFood(state: AppState, items: FoodItem[], label: string, logDate: string, today = todayKey()) {
  if (!items.length) throw new Error('Add a food before logging.');
  let next = rolloverDay(state, today).state;
  const savedIds = new Set([...next.todayLog, ...next.dailyLogs.flatMap(day => day.foodItems || [])].map(item => item.id));
  const fresh = items.filter(item => { if (savedIds.has(item.id)) return false; savedIds.add(item.id); return true; });
  if (!fresh.length) return { state: next, added: fresh };
  const history = next.foodHistory || [];
  const existing = history.find(entry => entry.label === label);
  const loggedCount = (existing?.loggedCount || 0) + 1;
  const sum = (key: 'calories' | 'protein' | 'carbs' | 'fat') => fresh.reduce((value, item) => value + item[key], 0);
  const entry: HistoryEntry = { id: existing?.id || crypto.randomUUID(), label, timestamp: logDate, items: fresh,
    totalCalories: sum('calories'), totalProtein: sum('protein'), totalCarbs: sum('carbs'), totalFat: sum('fat'), loggedCount,
    favorited: existing?.favorited || (loggedCount >= 5 && next.profile?.autoFavoriteEnabled !== false) };
  const ordered = [entry, ...history.filter(saved => saved.id !== entry.id)];
  const favorites = ordered.filter(saved => saved.favorited);
  next = { ...next, foodHistory: [...favorites, ...ordered.filter(saved => !saved.favorited).slice(0, Math.max(0, 50 - favorites.length))] };
  if (logDate === today) next = { ...next, todayLog: [...fresh, ...next.todayLog] };
  else next = { ...next, dailyLogs: [...next.dailyLogs.filter(day => day.date !== logDate), appendToDay(next.dailyLogs.find(day => day.date === logDate) || emptyDay(logDate), fresh)] };
  return { state: next, added: fresh };
}

// ── Edit / delete on any day (audit FUNC-01) ──────────────────────────────
// One code path for today (todayLog) and past days (dailyLogs[date]). Past
// days carry stored totals, so they're adjusted by the item's delta (which
// also keeps any total that predates per-item storage).

type Macros = 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber';
const TOTAL_KEY: Record<Macros, keyof DailyLog> = {
  calories: 'caloriesConsumed', protein: 'proteinConsumed', carbs: 'carbsConsumed', fat: 'fatConsumed', fiber: 'fiberConsumed',
};
function adjustTotals(day: DailyLog, remove?: FoodItem | null, add?: FoodItem | null): DailyLog {
  const next = { ...day } as DailyLog & Record<string, number>;
  for (const key of Object.keys(TOTAL_KEY) as Macros[]) {
    const field = TOTAL_KEY[key] as string;
    const value = (Number(next[field]) || 0) - (Number(remove?.[key]) || 0) + (Number(add?.[key]) || 0);
    next[field] = Math.max(0, Math.round(value * 100) / 100);
  }
  return next;
}
const isTodayKey = (date: string, today: string) => date === today || canonDay(date) === canonDay(today);
const findDay = (logs: DailyLog[], date: string) =>
  logs.find(day => day.date === date) || logs.find(day => canonDay(day.date) === canonDay(date));

/** Replace a logged food (matched by id) on the given day and update that day's totals. */
export function updateFoodOnDay(state: AppState, date: string, updated: FoodItem, today = todayKey()): AppState {
  if (isTodayKey(date, today)) {
    return { ...state, todayLog: (state.todayLog || []).map(item => item.id === updated.id ? updated : item) };
  }
  const logs = state.dailyLogs || [];
  const day = findDay(logs, date);
  const old = day?.foodItems?.find(item => item.id === updated.id);
  if (!day || !old) return state;
  const changed = adjustTotals({ ...day, foodItems: day.foodItems!.map(item => item.id === updated.id ? updated : item) }, old, updated);
  return { ...state, dailyLogs: logs.map(d => d === day ? changed : d) };
}

/** Remove a logged food from the given day. Returns what was removed (for undo). */
export function removeFoodFromDay(state: AppState, date: string, id: string, today = todayKey()):
  { state: AppState; removed: { item: FoodItem; index: number } | null } {
  if (isTodayKey(date, today)) {
    const list = state.todayLog || [];
    const index = list.findIndex(item => item.id === id);
    if (index < 0) return { state, removed: null };
    return { state: { ...state, todayLog: list.filter(item => item.id !== id) }, removed: { item: list[index], index } };
  }
  const logs = state.dailyLogs || [];
  const day = findDay(logs, date);
  const index = day?.foodItems?.findIndex(item => item.id === id) ?? -1;
  if (!day || index < 0) return { state, removed: null };
  const item = day.foodItems![index];
  const changed = adjustTotals({ ...day, foodItems: day.foodItems!.filter(f => f.id !== id) }, item, null);
  return { state: { ...state, dailyLogs: logs.map(d => d === day ? changed : d) }, removed: { item, index } };
}

/** Put a removed food back on the day it came from (undo), at its old position. */
export function restoreFoodToDay(state: AppState, date: string, item: FoodItem, index: number, today = todayKey()): AppState {
  const insert = (list: FoodItem[]) => {
    if (list.some(f => f.id === item.id)) return list;
    const next = [...list];
    next.splice(Math.min(index, next.length), 0, item);
    return next;
  };
  if (isTodayKey(date, today)) return { ...state, todayLog: insert(state.todayLog || []) };
  const logs = state.dailyLogs || [];
  const day = findDay(logs, date);
  if (!day) {
    return { ...state, dailyLogs: [...logs, adjustTotals({ ...emptyDay(date), foodItems: [item] }, null, item)] };
  }
  if ((day.foodItems || []).some(f => f.id === item.id)) return state;
  const changed = adjustTotals({ ...day, foodItems: insert(day.foodItems || []) }, null, item);
  return { ...state, dailyLogs: logs.map(d => d === day ? changed : d) };
}
