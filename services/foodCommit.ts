import type { AppState, DailyLog, FoodItem, HistoryEntry } from '../types';

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

/** One idempotent commit for all food sources, including a draft completed after midnight. */
export function commitFood(state: AppState, items: FoodItem[], label: string, logDate: string, today = new Date().toLocaleDateString()) {
  if (!items.length) throw new Error('Add a food before logging.');
  let next = state;
  if (state.lastActiveDate && state.lastActiveDate !== today) {
    const old = state.dailyLogs.find(day => day.date === state.lastActiveDate);
    const archived = appendToDay({ ...(old || emptyDay(state.lastActiveDate)), waterIntake: state.waterIntake, caloriesBurned: state.activityBurn }, state.todayLog);
    const hasActivity = archived.foodItems?.length || archived.waterIntake || archived.caloriesBurned;
    next = { ...state, todayLog: [], waterIntake: 0, activityBurn: 0, lastActiveDate: today,
      dailyLogs: hasActivity ? [...state.dailyLogs.filter(day => day.date !== state.lastActiveDate), archived] : state.dailyLogs };
  }
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
