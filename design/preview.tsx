// Development-only Vite entry (design/preview.html). Not in the production build.
// Renders the v2 shell with sample data and no Firebase so screens can be
// checked in a browser: Home dashboard, Add Food page, Profile hub, themes.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { Layout } from '../components/Layout';
import { Dashboard } from '../components/Dashboard';
import { ProfileHub, type ProfileSection } from '../components/ProfileHub';
import { FoodComposer, type FoodStatus } from '../components/food/FoodComposer';
import { Journal } from '../components/Journal';
import { Wrapped } from '../components/Wrapped';
import { applyAppearance, readAppearance, type Appearance } from '../services/theme';
import { ActivityLevel, PhysiqueGoal, type DailyLog, type FoodItem, type HistoryEntry, type UserProfile, type WeightEntry } from '../types';

const profile: UserProfile = { name: 'Ding', age: 30, weight: 170, height: 68, activityLevel: ActivityLevel.Light, goal: PhysiqueGoal.Lean, highEnergyDays: [], busyDays: [], initialWeight: 176 };
const targets = { calories: 2100, protein: 160, carbs: 220, fat: 70 };
const food = (name: string, calories: number, protein: number, carbs: number, fat: number, timestamp: string): FoodItem =>
  ({ id: crypto.randomUUID(), name, calories, protein, carbs, fat, timestamp });
const day = (n: number) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - n); return d; };
const dailyLogs: DailyLog[] = [1, 2, 3, 4, 5, 6, 8, 9].map(n => {
  const items = [food('Oatmeal with banana', 380, 14, 68, 7, '8:10:00 AM'), food('Chipotle chicken bowl', 690 + n * 25, 52, 70, 22, '12:40:00 PM'), food('Salmon, rice and greens', 640 - n * 10, 44, 58, 24, '7:15:00 PM')];
  return { date: day(n).toLocaleDateString(), weight: 0, waterIntake: 48 + n * 4, workoutCompleted: n % 2 === 0,
    caloriesConsumed: items.reduce((s, i) => s + i.calories, 0) + (n === 3 ? 450 : 0), proteinConsumed: 110 + n * 4, carbsConsumed: 196, fatConsumed: 53, foodItems: items };
});
const todayLog: FoodItem[] = [food('Greek yogurt + berries', 240, 22, 28, 4, '8:05:00 AM'), food('Turkey sandwich', 520, 36, 48, 18, '12:30:00 PM')];
const history: HistoryEntry[] = [
  { id: 'h1', label: 'Chipotle chicken bowl', timestamp: day(1).toISOString(), totalCalories: 715, totalProtein: 52, totalCarbs: 70, totalFat: 22, items: [dailyLogs[0].foodItems![1]], loggedCount: 9, favorited: true },
  { id: 'h2', label: 'Greek yogurt + berries', timestamp: day(0).toISOString(), totalCalories: 240, totalProtein: 22, totalCarbs: 28, totalFat: 4, items: [todayLog[0]], loggedCount: 6 },
  { id: 'h3', label: 'Turkey sandwich', timestamp: day(0).toISOString(), totalCalories: 520, totalProtein: 36, totalCarbs: 48, totalFat: 18, items: [todayLog[1]], loggedCount: 2 },
];
const weighIns: WeightEntry[] = [12, 10, 8, 6, 4, 2, 0].map((n, i) => ({ id: String(i), date: day(n).toISOString().slice(0, 10), weight: 174 - i * 0.6, createdAt: '', source: 'check-in' }));
const health: Record<string, { steps: number; activeKcal: number }> = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(n => [day(n).toLocaleDateString(), { steps: 4200 + n * 1100, activeKcal: 310 + n * 30 }]));

function Preview() {
  const params = new URLSearchParams(location.search);
  const [tab, setTab] = useState(params.get('tab') || 'dashboard');
  const [open, setOpen] = useState(params.get('add') === '1');
  const [status, setStatus] = useState<FoodStatus>('empty');
  const [date, setDate] = useState(new Date().toLocaleDateString());
  const [section, setSection] = useState<ProfileSection>((params.get('section') as ProfileSection) || 'overview');
  const [appearance, setAppearance] = useState<Appearance>(() => {
    const m = params.get('mode'); const t = params.get('tone');
    return m || t ? { mode: (m as Appearance['mode']) || 'dark', tone: (t as Appearance['tone']) || 'charcoal' } : readAppearance();
  });
  useEffect(() => applyAppearance(appearance), [appearance]);
  const consumed = { calories: 760, protein: 58, carbs: 76, fat: 22 };
  return <Layout activeTab={tab} onTabChange={setTab} onAdd={() => setOpen(o => !o)} addOpen={open} foodStatus={status} profile={profile}>
    {tab === 'dashboard' && <Dashboard profile={profile} targets={targets} selectedDate={date} onSelectDate={setDate} todayLog={todayLog} todayConsumed={consumed}
      todayWater={32} todayActivityBurn={0} dailyLogs={dailyLogs} weighIns={weighIns} streak={12} greeting="Evening" energyBaseline={{ bmr: 1780, tdee: 2350 }}
      healthActiveEnergy={null} healthByDate={health} healthConnected onAddFood={() => setOpen(true)} onOpenFood={() => {}} onLogWater={() => {}} onLogWeight={() => true}
      onLogActivity={() => {}} onOpenFuelCoach={() => {}} onAskCoach={() => setTab('coach')} />}
    {tab === 'profile' && <ProfileHub profile={profile} avatar={<div className="flex h-20 w-20 items-center justify-center rounded-full border-[3px] border-[var(--primary)] text-3xl font-bold text-[var(--primary)]">D</div>}
      streak={12} dailyLogs={dailyLogs} todayLog={todayLog} foodHistory={history} weighIns={weighIns} onEdit={() => {}} section={section} onSection={setSection}
      appearance={appearance} onAppearance={setAppearance}
      overview={<Wrapped inline profile={profile} dailyLogs={dailyLogs} weighIns={weighIns} todayLog={todayLog} todayActivityBurn={0} todayWaterIntake={32} foodHistory={history} bodyStats={undefined as any} targets={targets} weeklyCompletedWorkouts={[]} initialPeriod="week" />}
      history={<Journal dailyLogs={dailyLogs} todayLog={todayLog} waterIntake={32} activityBurn={0} profile={profile} targets={targets} onDeleteLog={() => {}} onUpdateFood={() => {}} />}
      settings={<div className="rounded-3xl border border-[var(--line)] bg-[var(--bg-card)] p-5 text-white">Apple Health, targets, account…</div>} />}
    {(tab === 'workouts' || tab === 'coach') && <p className="pt-10 text-center text-[var(--ink-mid)]">{tab} screen</p>}
    <FoodComposer uid="design-preview" open={open} onClose={() => setOpen(false)} onOpen={() => setOpen(true)} seed={null} onSeedConsumed={() => {}} onStatus={setStatus}
      onSave={async () => { setOpen(false); }} history={history} onFavorite={() => {}} onRemoveHistory={() => {}} targets={targets} consumed={consumed}
      requireConsent={() => {}} logDate={date} dateLabel={date === new Date().toLocaleDateString() ? 'Today' : new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} />
  </Layout>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
