import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dumbbell, Droplets, Scale, MessageCircle, ChevronRight, Share2 } from 'lucide-react';
import { Share } from '@capacitor/share';
import type { UserProfile, NutritionTargets, DailyLog, WeightEntry, FoodItem } from '../types';
import { computeEnergyBalance } from '../constants';
import { FoodLauncher, type FoodStatus } from './food/FoodComposer';
import { FoodDialog } from './food/FoodDialog';

interface FuelHomeProps {
  profile: UserProfile; targets: NutritionTargets;
  consumed: { calories: number; protein: number; carbs: number; fat: number };
  activityBurn: number; waterIntake: number; workoutCompletedToday: boolean; streak: number;
  greeting: string; dateString: string; dailyLogs: DailyLog[]; weighIns: WeightEntry[];
  onLogWeight: (weight: number) => boolean; onQuickAddFood: () => void;
  onOpenWorkouts: () => void; onLogWater: () => void; onOpenReflect: () => void;
  hasEnoughDataForWrapped: boolean; onOpenFuelCoach?: () => void; onLogActivity?: () => void;
  adaptiveSuggestion?: { hasEnoughData: boolean; adjustmentKcal?: number; suggestedTdee?: number; reason?: string };
  onAcceptAdaptiveSuggestion?: () => void;
  energyBaseline?: { bmr: number; tdee: number } | null; healthActiveEnergy?: number | null;
  todayFood?: FoodItem[]; foodStatus?: FoodStatus; onOpenLog?: () => void; onAskDing?: () => void;
  onFoodHeroVisibility?: (visible: boolean) => void;
}

const card = 'rounded-3xl border border-white/10 bg-[var(--bg-card)] p-5';
const row = 'flex min-h-16 w-full items-center gap-3 py-3 text-left';
export const FuelHome: React.FC<FuelHomeProps> = ({ profile, targets, consumed, activityBurn,
  waterIntake, workoutCompletedToday, streak, greeting, weighIns, onLogWeight, onQuickAddFood,
  onOpenWorkouts, onLogWater, onOpenReflect, onOpenFuelCoach, onLogActivity, adaptiveSuggestion,
  onAcceptAdaptiveSuggestion, energyBaseline, healthActiveEnergy, todayFood = [], foodStatus = 'empty', onOpenLog, onAskDing, onFoodHeroVisibility,
}) => {
  const heroRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => onFoodHeroVisibility?.(entry.isIntersecting), { rootMargin: '-72px 0px -80px 0px' });
    if (heroRef.current) observer.observe(heroRef.current);
    return () => observer.disconnect();
  }, [onFoodHeroVisibility]);
  const [weightOpen, setWeightOpen] = useState(false);
  const [weight, setWeight] = useState('');
  const [weightError, setWeightError] = useState('');
  const [shareStatus, setShareStatus] = useState('');
  const remaining = targets.calories - consumed.calories;
  const latest = useMemo(() => [...weighIns].sort((a,b) => a.date.localeCompare(b.date)).at(-1), [weighIns]);
  const energy = energyBaseline ? computeEnergyBalance({ bmr: energyBaseline.bmr, activityLevel: profile.activityLevel, caloriesEaten: consumed.calories, loggedWorkoutKcal: activityBurn, healthActiveEnergy: healthActiveEnergy ?? null }) : null;
  async function share() {
    const text = `DING MACROS\nLeft today: ${Math.round(remaining)} kcal\nEaten: ${Math.round(consumed.calories)} of ${Math.round(targets.calories)} kcal\nProtein ${Math.round(consumed.protein)}/${Math.round(targets.protein)}g · Carbs ${Math.round(consumed.carbs)}/${Math.round(targets.carbs)}g · Fat ${Math.round(consumed.fat)}/${Math.round(targets.fat)}g`;
    try { await Share.share({ text }); }
    catch (err) {
      if (/cancel/i.test(String((err as Error)?.message))) return;
      try { await navigator.clipboard.writeText(text); setShareStatus('Copied'); }
      catch { setShareStatus('Couldnt share right now'); }
    }
  }
  return <div className="space-y-6 pb-6 text-[var(--ink)]">
    <div>
      <h1 className="text-2xl font-bold leading-tight">{greeting}, {(profile.name || 'friend').split(' ')[0]}</h1>
      <p className="mt-1 text-base text-[var(--ink-mid)]">One meal at a time.{streak >= 2 ? ` ${streak} days showing up.` : ''}</p>
    </div>
    <div ref={heroRef}><FoodLauncher status={foodStatus} onClick={onQuickAddFood} /></div>
    <section className={card} aria-label="Today's nutrition">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-[var(--ink-mid)]">Today so far</h2>
        <button type="button" onClick={() => void share()} aria-label="Share today's macros" className="flex h-11 w-11 items-center justify-center rounded-xl"><Share2 size={20} aria-hidden="true" /></button>
      </div>
      <p className="text-[2rem] font-bold tabular-nums leading-tight">{Math.round(remaining).toLocaleString()} <span className="text-base font-normal">kcal left</span></p>
      <p className="mt-2 text-sm text-[var(--ink-mid)]">{Math.round(consumed.calories).toLocaleString()} eaten · {Math.round(targets.calories).toLocaleString()} target</p>
      {remaining < 0 && <p className="mt-1 text-sm text-[var(--ink-mid)]">{Math.round(-remaining)} above todays target</p>}
      <dl className="mt-5 grid grid-cols-3 gap-3">
        {([['Protein', 'protein', '#7ab896'], ['Carbs', 'carbs', '#e8a85a'], ['Fat', 'fat', '#d97757']] as const).map(([label,key,color]) => <div key={key}>
          <dt className="text-sm text-[var(--ink-mid)]">{label}</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums">{Math.round(consumed[key])}<span className="text-sm font-normal text-[var(--ink-mid)]"> / {Math.round(targets[key])}g</span></dd>
          <div aria-hidden="true" className="mt-2 h-1 rounded-full bg-[var(--bg-card)]"><div className="h-1 rounded-full" style={{ background: color, width: `${Math.min(100, Math.max(0, consumed[key] / Math.max(1, targets[key]) * 100))}%` }} /></div>
        </div>)}
      </dl>
      {shareStatus && <p role="status" className="mt-3 text-sm text-[var(--ink-mid)]">{shareStatus}</p>}
      {energy && <details className="mt-4 border-t border-white/10 pt-2">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm text-[var(--ink-mid)]">Energy details</summary>
        <dl className="space-y-3 text-sm">{[['Resting burn', energy.bmr], ['Active burn', energy.activeBurn], ['Everyday movement', energy.neat], ['Food digestion', energy.tef], ['Total burn', energy.totalBurn]].map(([label,value]) => <div className="flex justify-between gap-4" key={String(label)}><dt>{label}</dt><dd className="tabular-nums">{Number(value).toLocaleString()} kcal</dd></div>)}</dl>
        <p className="mt-3 text-sm leading-relaxed text-[var(--ink-mid)]">{energy.activeSource === 'health' ? 'Active energy from Apple Health.' : 'Movement is estimated.'} Workouts are included in active burn. These numbers dont change your food target.</p>
        {onLogActivity && <button type="button" onClick={onLogActivity} className="mt-3 min-h-11 rounded-xl border border-[var(--ink-mid)]/50 px-4">Log activity</button>}
      </details>}
    </section>
    <section className={card} aria-label="Today's food">
      <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-semibold">Todays food</h2><button type="button" onClick={onOpenLog} className="min-h-11 text-sm text-[var(--ink-mid)]">See log</button></div>
      {todayFood.length ? <ul className="divide-y divide-white/10">{todayFood.slice(0,3).map(item => <li key={item.id}><button type="button" onClick={onOpenLog} className="flex min-h-16 w-full items-center justify-between gap-4 py-3 text-left"><span className="text-base">{item.name}</span><span className="shrink-0 text-sm tabular-nums text-[var(--ink-mid)]">{Math.round(item.calories)} kcal</span></button></li>)}</ul> : <p className="mt-2 text-base text-[var(--ink-mid)]">Nothing here yet. Start with your next meal.</p>}
    </section>
    <section className={`${card} divide-y divide-white/10`} aria-label="Along the way">
      <button type="button" onClick={onOpenWorkouts} className={row}><Dumbbell size={22} aria-hidden="true" /><span className="flex-1"><span className="block text-base font-semibold">Train</span><span className="text-sm text-[var(--ink-mid)]">{workoutCompletedToday ? 'Session logged. Nice work.' : 'Your next session'}</span></span><ChevronRight size={20} aria-hidden="true" /></button>
      <button type="button" onClick={onLogWater} className={row}><Droplets size={22} aria-hidden="true" /><span className="flex-1"><span className="block text-base font-semibold">Water</span><span className="text-sm text-[var(--ink-mid)]">{waterIntake} oz today</span></span><span className="text-sm font-semibold">Add 8 oz</span></button>
      <button type="button" onClick={() => { setWeight(String(latest?.weight || profile.weight || '')); setWeightError(''); setWeightOpen(true); }} className={row}><Scale size={22} aria-hidden="true" /><span className="flex-1"><span className="block text-base font-semibold">Weight</span><span className="text-sm text-[var(--ink-mid)]">{latest ? `${latest.weight.toFixed(1)} lbs · ${latest.date}` : 'Whenever youre ready'}</span></span><span className="text-sm">Check in</span></button>
      {onAskDing && <button type="button" onClick={onAskDing} className={row}><MessageCircle size={22} aria-hidden="true" /><span className="flex-1 text-base font-semibold">Ask Ding</span><ChevronRight size={20} aria-hidden="true" /></button>}
      {onOpenFuelCoach && <button type="button" onClick={onOpenFuelCoach} className={row}><span className="flex-1"><span className="block text-base font-semibold">Need a food idea?</span><span className="text-sm text-[var(--ink-mid)]">Eat out, cook, or something sweet</span></span><ChevronRight size={20} aria-hidden="true" /></button>}
      <button type="button" onClick={onOpenReflect} className={row}><span className="flex-1 text-base font-semibold">Look back at your week</span><ChevronRight size={20} aria-hidden="true" /></button>
    </section>
    {adaptiveSuggestion?.hasEnoughData && Math.abs(adaptiveSuggestion.adjustmentKcal || 0) >= 50 && <section className={card}><h2 className="text-xl font-semibold">Adjusting your path</h2><p className="mt-2 text-base text-[var(--ink-mid)]">{adaptiveSuggestion.reason}</p><button type="button" onClick={onAcceptAdaptiveSuggestion} className="mt-4 min-h-11 rounded-xl bg-[#d97757] px-4 py-3 font-semibold text-[var(--bg-dark)]">Use suggested target</button><p className="mt-2 text-sm text-[var(--ink-mid)]">Or keep your current target.</p></section>}
    <details className="text-sm text-[var(--ink-mid)]"><summary className="min-h-11 cursor-pointer py-3">Language & credits</summary><p className="leading-relaxed">Hiraaciréʼ · Numakiki · Sáhniš</p><p className="mt-2 leading-relaxed">Vocabulary supported by the MHA Language Project</p></details>
    <FoodDialog open={weightOpen} onClose={() => setWeightOpen(false)} title="Weight check-in" closeLabel="Close weight check-in"><form className="space-y-5 text-[var(--ink)]" onSubmit={e => { e.preventDefault(); const value=Number(weight); if (!weight.trim() || !Number.isFinite(value) || value < 50 || value > 700) { setWeightError('Enter a weight between 50 and 700 lbs.'); return; } if (onLogWeight(value)) setWeightOpen(false); }}><h2 className="text-2xl font-bold">Quick weight check-in</h2><p className="text-base text-[var(--ink-mid)]">No judgment. This helps Ding notice the trend.</p><label className="block text-base">Weight (lbs)<input required type="number" inputMode="decimal" min="50" max="700" step="0.1" value={weight} onChange={e => setWeight(e.target.value)} className="mt-2 min-h-14 w-full rounded-xl border border-[var(--ink-mid)]/60 bg-[var(--bg-card)] p-3 text-2xl" /></label>{weightError && <p role="alert">{weightError}</p>}<button type="submit" className="min-h-14 w-full rounded-xl bg-[#d97757] p-3 font-semibold text-[var(--bg-dark)]">Save check-in</button></form></FoodDialog>
  </div>;
};

export default FuelHome;
