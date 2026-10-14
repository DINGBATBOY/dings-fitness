// Development-only Vite entry. Not included in the production build.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { Layout } from '../components/Layout';
import { FuelHome } from '../components/FuelHome';
import { FoodComposer, FoodLauncher, type FoodStatus } from '../components/food/FoodComposer';
import { AnalysisProgress } from '../components/food/FoodFlow';
import { ActivityLevel, PhysiqueGoal, type FoodItem, type UserProfile } from '../types';

const profile: UserProfile = { name: 'Ding', age: 30, weight: 170, height: 68, activityLevel: ActivityLevel.Light, goal: PhysiqueGoal.Lean, highEnergyDays: [], busyDays: [], initialWeight: 170 };
const targets = { calories: 2100, protein: 140, carbs: 230, fat: 70 };
function Preview() {
  const [tab, setTab] = useState('dashboard');
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<FoodStatus>('empty');
  const [food, setFood] = useState<FoodItem[]>([]);
  const [water, setWater] = useState(24);
  const [message, setMessage] = useState('');
  const consumed = { calories: 860, protein: 53, carbs: 101, fat: 29 };
  return <Layout activeTab={tab} onTabChange={setTab} profile={profile}>
    <p className="mb-4 rounded-xl border border-[#e8a85a]/40 p-3 text-sm text-[#c4b8a4]">Design preview · sample daily totals · manual logging works locally</p>
    {tab === 'dashboard' ? <FuelHome profile={profile} targets={targets} consumed={consumed} activityBurn={120} waterIntake={water} workoutCompletedToday={false} streak={3} greeting="MORNIN" dateString="Today" dailyLogs={[]} weighIns={[]} onLogWeight={() => true} onQuickAddFood={() => setOpen(true)} onOpenWorkouts={() => setTab('workouts')} onLogWater={() => setWater(v => v + 8)} onOpenReflect={() => setTab('reflect')} hasEnoughDataForWrapped={false} todayFood={food} foodStatus={status} onOpenLog={() => setTab('journal')} onAskDing={() => setTab('coach')} /> : <div className="space-y-5"><FoodLauncher compact status={status} onClick={() => setOpen(true)} /><h1 className="text-2xl">{tab === 'journal' ? 'Food log preview' : 'Analysis state preview'}</h1>{food.map(item => <p key={item.id}>{item.name} · {item.calories} kcal</p>)}<AnalysisProgress event={{ jobId: 'example', revision: 1, seq: 3, at: new Date().toISOString(), type: 'searching' }} backgroundSafe milestones={['Photo received']} onMinimize={() => setTab('dashboard')} onCancel={() => setMessage('Stopped sample analysis')} onRetry={() => {}} onReview={() => {}} onManual={() => setOpen(true)} /></div>}
    {message && <p role="status" className="mt-4 text-[#e8a85a]">{message}</p>}
    <FoodComposer uid="design-preview" open={open} onClose={() => setOpen(false)} onOpen={() => setOpen(true)} seed={null} onSeedConsumed={() => {}} onStatus={setStatus} onSave={async items => { setFood(prev => [...items, ...prev]); setMessage('Logged. LETS GOOOO'); }} history={[]} onFavorite={() => {}} onRemoveHistory={() => {}} targets={targets} consumed={consumed} requireConsent={() => setMessage('AI calls are disabled in this preview. Use manual entry.')} />
  </Layout>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
