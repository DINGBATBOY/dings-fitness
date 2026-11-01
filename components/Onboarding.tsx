/**
 * Onboarding v3 (Oct 31, 2026): "how and why do you want to track?"
 *
 * Ding! is a food tracker now, not a gym app, so the flow starts from the
 * person's reasons and the way they want to see their food, and only asks
 * about weight when their answers make weight relevant. Design notes and the
 * competitor comparison live in the "Onboarding audit" doc (Claude project).
 *
 *   welcome  → name + the short health note (acceptance is recorded on finish)
 *   form     → why · how · [direction] · about you · activity · [pace] · [eating style]
 *              ([..] = skipped when the answers make it irrelevant)
 *   result   → the plan, shaped by the tracking style, with "use my own numbers"
 *
 * Targets are computed on the device (computeProfileTargets, the same math as
 * Edit Profile). Nothing here talks to an AI provider: the consent sheet comes
 * later (PRIV-02 / NUT-02). Answers are kept in localStorage until finish so
 * closing the app mid-way doesn't lose them.
 *
 * Colors are the theme variables (index.css), so light mode works here too.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ActivityLevel, PhysiqueGoal, type GoalPace, type MacroSplit, type TrackingStyle, type UserProfile } from '../types';
import { getBMI, getBMICategory, paceWeeklyLbs, type BMICategory } from '../constants';
import { computeProfileTargets, type StarterTargets } from '../services/starterTargets';
import { AlertTriangle, ArrowLeft, ArrowRight, Check } from 'lucide-react';

interface OnboardingProps {
  onComplete: (profile: UserProfile, targets: any) => void;
}

// ──────────────────── Options ────────────────────

/** Why they track. Multi-select; ids are stored on profile.trackingReasons. */
export const TRACKING_REASONS: { id: string; label: string; blurb: string }[] = [
  { id: 'aware',    label: 'See what I’m actually eating', blurb: 'No plan yet, just want the facts' },
  { id: 'protein',  label: 'Hit my protein',              blurb: 'Every day, without guessing' },
  { id: 'lose',     label: 'Lose some fat',               blurb: 'Steady, not miserable' },
  { id: 'gain',     label: 'Build muscle or gain weight', blurb: 'Eat enough to grow' },
  { id: 'maintain', label: 'Keep my weight steady',       blurb: 'Stay where I am' },
  { id: 'perform',  label: 'Fuel training or a sport',    blurb: 'Enough gas in the tank' },
  { id: 'energy',   label: 'Feel better day to day',      blurb: 'Energy, sleep, mood' },
  { id: 'diet',     label: 'Stick to a way of eating',    blurb: 'Keto, low-carb, high-protein…' },
  { id: 'numbers',  label: 'I already have numbers to hit', blurb: 'From a coach, dietitian or another app' },
];

const STYLES: { id: TrackingStyle; label: string; blurb: string }[] = [
  { id: 'macros',   label: 'Full macros',   blurb: 'Calories plus protein, carbs and fat. The whole picture.' },
  { id: 'calories', label: 'Calories first', blurb: 'One number to watch. Macros stay in the background.' },
  { id: 'protein',  label: 'Protein first', blurb: 'Your protein goal is the headline. Calories ride along.' },
  { id: 'log',      label: 'Just log it',   blurb: 'No targets, no "over". See what you eat and spot patterns.' },
];

type Direction = 'lose' | 'maintain' | 'gain' | 'none';
const DIRECTIONS: { id: Direction; label: string; blurb: string }[] = [
  { id: 'lose',     label: 'Down',              blurb: 'Lose fat at a pace you pick' },
  { id: 'maintain', label: 'Keep it steady',    blurb: 'Eat about what you burn' },
  { id: 'gain',     label: 'Up',                blurb: 'Gain at a pace you pick' },
  { id: 'none',     label: 'Not about my weight', blurb: 'I’ll set you at maintenance and you focus on the food' },
];

const ACTIVITY: { id: ActivityLevel; label: string; blurb: string }[] = [
  { id: ActivityLevel.Sedentary, label: 'Mostly sitting',   blurb: 'Desk job, driving, couch' },
  { id: ActivityLevel.Light,     label: 'On my feet some',  blurb: 'Errands, short walks, light chores' },
  { id: ActivityLevel.Moderate,  label: 'On my feet a lot', blurb: 'Retail, teaching, lots of walking' },
  { id: ActivityLevel.Very,      label: 'Physical job',     blurb: 'Warehouse, construction, serving' },
  { id: ActivityLevel.Extra,     label: 'Hard labor all day', blurb: 'Heavy physical work, every day' },
];

const PACES: { id: GoalPace; label: string }[] = [
  { id: 'gentle', label: 'Gentle' },
  { id: 'steady', label: 'Steady' },
  { id: 'faster', label: 'Faster' },
];

const SPLITS: { id: MacroSplit; label: string; blurb: string }[] = [
  { id: 'balanced',     label: 'No rules, balanced', blurb: 'A normal mix of carbs and fat' },
  { id: 'high-protein', label: 'High-protein',       blurb: 'Extra protein, carbs for training' },
  { id: 'low-carb',     label: 'Low-carb',           blurb: 'Fewer carbs, more fat' },
  { id: 'keto',         label: 'Keto',               blurb: 'Very low carb' },
];

type StepId = 'why' | 'how' | 'direction' | 'body' | 'activity' | 'pace' | 'eating';

interface Draft {
  name: string;
  reasons: string[];
  style?: TrackingStyle;
  direction?: Direction;
  units: 'us' | 'metric';
  age?: number;
  sex?: 'Male' | 'Female';
  heightFt?: number;
  heightIn?: number;
  heightCm?: number;
  weight?: number;        // in the chosen unit
  bodyFat?: number;
  activity?: ActivityLevel;
  pace: GoalPace;
  goalWeight?: number;    // in the chosen unit
  split?: MacroSplit;
}

const DRAFT_KEY = 'ding.onboarding.v3';
const KG_PER_LB = 0.45359237;

const defaultUnits = (): 'us' | 'metric' => {
  try { return /^en-(US|LR|MM)\b/i.test(navigator.language || 'en-US') ? 'us' : 'metric'; } catch { return 'us'; }
};

const loadSaved = (): { draft: Draft; phase: 'welcome' | 'form'; step: StepId } | null => {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object' || !v.draft || !Array.isArray(v.draft.reasons)) return null;
    return v;
  } catch { return null; }
};

const r = (n: number) => Math.round(n);
/** One formatter for weekly change so the pace card and the result agree. */
const rate = (lbsPerWeek: number, toUnit: (lbs: number) => number) => (Math.round(Math.abs(toUnit(lbsPerWeek)) * 10 + 1e-6) / 10).toFixed(1);
const fmt = (n: number) => r(n).toLocaleString();

export const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
  const saved = useMemo(loadSaved, []);
  const [phase, setPhase] = useState<'welcome' | 'form' | 'result'>(saved?.phase || 'welcome');
  const [draft, setDraft] = useState<Draft>(saved?.draft || { name: '', reasons: [], units: defaultUnits(), pace: 'steady' });
  const [step, setStep] = useState<StepId>(saved?.step || 'why');
  const [errorMsg, setErrorMsg] = useState('');
  const [healthWarning, setHealthWarning] = useState<{ kind: 'lowBmi' | 'highBmi' | 'lossWhileUnderweight'; category: BMICategory } | null>(null);
  const [plan, setPlan] = useState<{ profile: any; t: StarterTargets } | null>(null);
  const [ownNumbers, setOwnNumbers] = useState(false);
  const [custom, setCustom] = useState({ calories: 0, protein: 0, carbs: 0, fat: 0 });

  // Keep answers if the app closes mid-way (cleared on finish).
  useEffect(() => {
    if (phase === 'result') return;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ draft, phase, step })); } catch { /* private mode */ }
  }, [draft, phase, step]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft(prev => ({ ...prev, [key]: value }));
    setErrorMsg('');
  };

  // Switching units converts what's already typed instead of reinterpreting it.
  const setUnits = (units: 'us' | 'metric') => {
    if (units === draft.units) return;
    setDraft(prev => {
      const toKg = units === 'metric';
      const conv = (v?: number) => (v === undefined ? undefined : Math.round((toKg ? v * KG_PER_LB : v / KG_PER_LB) * 10) / 10);
      let { heightFt, heightIn, heightCm } = prev;
      if (toKg && (heightFt || heightIn)) { heightCm = Math.round(((heightFt ?? 0) * 12 + (heightIn ?? 0)) * 2.54); }
      if (!toKg && heightCm) { const total = Math.round(heightCm / 2.54); heightFt = Math.floor(total / 12); heightIn = total % 12; }
      return { ...prev, units, weight: conv(prev.weight), goalWeight: conv(prev.goalWeight), heightFt, heightIn, heightCm };
    });
    setErrorMsg('');
  };

  const metric = draft.units === 'metric';
  const weightLbs = draft.weight ? (metric ? draft.weight / KG_PER_LB : draft.weight) : 0;
  const goalWeightLbs = draft.goalWeight ? (metric ? draft.goalWeight / KG_PER_LB : draft.goalWeight) : 0;
  const heightIn = metric ? (draft.heightCm ? draft.heightCm / 2.54 : 0) : (draft.heightFt ?? 0) * 12 + (draft.heightIn ?? 0);
  const wUnit = metric ? 'kg' : 'lbs';
  const toUnit = (lbs: number) => (metric ? lbs * KG_PER_LB : lbs);

  const logOnly = draft.style === 'log';
  const moving = draft.direction === 'lose' || draft.direction === 'gain';
  const goal: PhysiqueGoal = logOnly ? PhysiqueGoal.Maintain
    : draft.direction === 'lose' ? PhysiqueGoal.WeightLoss
    : draft.direction === 'gain' ? PhysiqueGoal.Bulk
    : PhysiqueGoal.Maintain;

  const steps = useMemo<StepId[]>(() => {
    const s: StepId[] = ['why', 'how'];
    if (!logOnly) s.push('direction');
    s.push('body', 'activity');
    if (!logOnly && moving) s.push('pace');
    if (!logOnly) s.push('eating');
    return s;
  }, [logOnly, moving]);
  const idx = Math.max(0, steps.indexOf(step));
  // A restored or changed answer can drop the current step from the list.
  useEffect(() => { if (!steps.includes(step)) setStep(steps[Math.min(idx, steps.length - 1)]); }, [steps, step, idx]);

  // What the answers so far point to (preselected, still changeable).
  const suggestedStyle: TrackingStyle = draft.reasons.includes('protein') ? 'protein'
    : draft.reasons.length > 0 && draft.reasons.every(x => x === 'aware' || x === 'energy') ? 'log'
    : 'macros';
  const suggestedDirection: Direction | undefined = draft.reasons.includes('lose') ? 'lose'
    : draft.reasons.includes('gain') ? 'gain'
    : draft.reasons.includes('maintain') ? 'maintain'
    : undefined;

  const validate = (): string => {
    switch (step) {
      case 'why':
        return draft.reasons.length ? '' : 'Pick at least one. Whatever’s closest is fine.';
      case 'how':
        return draft.style ? '' : 'Pick how you want to see your food.';
      case 'direction':
        return draft.direction ? '' : 'Pick one. You can change it anytime.';
      case 'body': {
        if (!draft.age) return 'What’s your age?';
        // 18+: Gemini's API terms bar apps used by under-18s, and the deficit
        // tables are adult references (audit LEGAL-01).
        if (draft.age < 18) return 'Ding! is for adults 18 and over.';
        if (draft.age > 100) return 'Age should be between 18 and 100.';
        if (!draft.sex) return 'Pick the sex your metabolism math should use.';
        if (!heightIn) return 'What’s your height?';
        if (heightIn < 48 || heightIn > 96) return metric ? 'Height should be 122 to 244 cm.' : 'Height should be between 4\'0" and 8\'0".';
        if (!draft.weight) return 'What’s your weight right now? Ballpark is fine.';
        if (weightLbs < 80 || weightLbs > 500) return metric ? 'Weight should be 36 to 227 kg.' : 'Weight should be 80 to 500 lbs.';
        if (draft.bodyFat !== undefined && (draft.bodyFat < 3 || draft.bodyFat > 60)) return 'Body fat should be 3 to 60%. Or leave it blank.';
        return '';
      }
      case 'activity':
        return draft.activity ? '' : 'Pick the one closest to a normal day.';
      case 'pace':
        if (draft.goalWeight !== undefined) {
          if (goalWeightLbs < 60 || goalWeightLbs > 500) return metric ? 'Goal weight should be 27 to 227 kg.' : 'Goal weight should be 60 to 500 lbs.';
          if (draft.direction === 'lose' && goalWeightLbs >= weightLbs) return 'For losing, the goal should be under your current weight.';
          if (draft.direction === 'gain' && goalWeightLbs <= weightLbs) return 'For gaining, the goal should be over your current weight.';
        }
        return '';
      default:
        return '';
    }
  };

  const goTo = (next: StepId) => {
    // Preselect what the earlier answers suggest, so most people just tap Continue.
    if (next === 'how' && !draft.style) set('style', suggestedStyle);
    if (next === 'direction' && !draft.direction && suggestedDirection) set('direction', suggestedDirection);
    if (next === 'eating' && !draft.split) {
      set('split', draft.style === 'protein' || draft.reasons.includes('protein') ? 'high-protein' : 'balanced');
    }
    setStep(next);
  };

  const goNext = () => {
    const err = validate();
    if (err) { setErrorMsg(err); return; }
    setErrorMsg('');

    // BMI check-ins land the moment the numbers are in. Non-blocking.
    if (step === 'body') {
      const category = getBMICategory(getBMI(weightLbs, heightIn));
      const low = category === 'severelyUnderweight' || category === 'underweight';
      if (low && draft.direction === 'lose' && !logOnly) setHealthWarning({ kind: 'lossWhileUnderweight', category });
      else if (low) setHealthWarning({ kind: 'lowBmi', category });
      else if (category === 'severelyObese') setHealthWarning({ kind: 'highBmi', category });
    }

    if (idx < steps.length - 1) goTo(steps[idx + 1]);
    else buildPlan();
  };

  const goBack = () => {
    setErrorMsg('');
    if (phase === 'result') { setPhase('form'); return; }
    if (idx > 0) setStep(steps[idx - 1]);
    else setPhase('welcome');
  };

  const buildPlan = () => {
    const profile: any = {
      name: draft.name.trim(),
      age: draft.age,
      sex: draft.sex,
      weight: Math.round(weightLbs * 10) / 10,
      height: Math.round(heightIn * 10) / 10,
      bodyFat: draft.bodyFat,
      activityLevel: draft.activity,
      goal,
      goalPace: !logOnly && moving ? draft.pace : undefined,
      goalTargetWeight: !logOnly && moving && goalWeightLbs ? Math.round(goalWeightLbs * 10) / 10 : undefined,
      macroSplit: logOnly ? 'balanced' : (draft.split || 'balanced'),
      trackingStyle: draft.style,
      trackingReasons: draft.reasons,
      units: draft.units,
    };
    const t = computeProfileTargets(profile);
    setPlan({ profile, t });
    setCustom({ calories: t.calories, protein: t.protein, carbs: t.carbs, fat: t.fat });
    setOwnNumbers(!logOnly && draft.reasons.includes('numbers'));
    setPhase('result');
  };

  const handleFinish = () => {
    if (!plan) return;
    const manual = ownNumbers && !logOnly;
    if (manual) {
      if (!custom.calories || custom.calories < 800 || custom.calories > 9000) { setErrorMsg('Calories should be between 800 and 9,000.'); return; }
      if (custom.protein < 0 || custom.carbs < 0 || custom.fat < 0) { setErrorMsg('Macros can’t be negative.'); return; }
    }
    const targets = manual
      ? { calories: r(custom.calories), protein: r(custom.protein || 0), carbs: r(custom.carbs || 0), fat: r(custom.fat || 0) }
      : { calories: plan.t.calories, protein: plan.t.protein, carbs: plan.t.carbs, fat: plan.t.fat };
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    onComplete(
      {
        ...plan.profile,
        initialWeight: plan.profile.weight,
        highEnergyDays: [],
        busyDays: [],
        manualTargets: manual || undefined,
        acceptedHealthDisclaimer: true,
        disclaimerAcceptedAt: new Date().toISOString(),
      } as UserProfile,
      targets,
    );
  };

  const firstName = draft.name.trim().split(/\s+/)[0] || 'friend';

  // ─────────────────── WELCOME ───────────────────
  if (phase === 'welcome') {
    const nameOk = draft.name.trim().length > 0 && draft.name.trim().length <= 30;
    return (
      <Screen>
        <div className="flex min-h-full flex-col px-6 pb-8 pt-[max(3rem,env(safe-area-inset-top))]">
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mx-auto w-full max-w-md flex-1">
            <p className="text-[2.6rem] font-bold leading-none tracking-tight text-[var(--primary)]">Ding!</p>
            <h1 className="mt-6 text-[1.9rem] font-bold leading-tight tracking-tight">Yooo!! Welcome in.</h1>
            <p className="mt-3 text-base leading-relaxed text-[var(--ink-mid)]">
              Show me what you eat and I’ll work out what’s in it. First, a few quick questions so the numbers fit YOU, not some average person. Takes about a minute.
            </p>

            <label className="mt-8 block">
              <span className={fieldLabel}>What should I call you?</span>
              <input
                type="text" value={draft.name} maxLength={30} autoComplete="given-name" placeholder="Your name"
                onChange={e => set('name', e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && nameOk) { e.preventDefault(); setPhase('form'); } }}
                className={inputCls}
              />
            </label>

            <div className="mt-6 space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-4 text-sm leading-relaxed text-[var(--ink-mid)]">
              <p><span className="font-semibold text-[var(--ink)]">Real quick: Ding! isn’t medical advice.</span> Every number here is an estimate, a starting point, not a prescription. Pregnant or breastfeeding, managing a condition, or on medication? Check with your doctor before changing how you eat.</p>
              <div className="flex items-start gap-2.5 rounded-xl border border-[var(--alert)]/30 bg-[var(--alert)]/10 p-3">
                <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[var(--alert)]" aria-hidden="true" />
                <p className="text-[var(--ink)]">
                  If you’ve had an eating disorder, please don’t use Ding! to set weight or calorie goals. The{' '}
                  <a href="https://www.allianceforeatingdisorders.com/find-treatment/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">National Alliance for Eating Disorders</a>{' '}
                  helpline is 1-866-662-1235.
                </p>
              </div>
            </div>
          </motion.div>

          <div className="mx-auto mt-8 w-full max-w-md">
            <button type="button" disabled={!nameOk} onClick={() => setPhase('form')}
              className="tap flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--primary)] text-base font-semibold text-[var(--on-primary)] disabled:opacity-40">
              Lets go <ArrowRight size={20} aria-hidden="true" />
            </button>
            <p className="mt-3 text-center text-xs leading-relaxed text-[var(--ink-light)]">
              By continuing you confirm you’ve read the note above and understand Ding! doesnt give medical advice.
            </p>
          </div>
        </div>
      </Screen>
    );
  }

  // ─────────────────── RESULT ───────────────────
  if (phase === 'result' && plan) {
    const { t, profile } = plan;
    const style = draft.style || 'macros';
    const shown = ownNumbers ? custom : t;
    const dailyDelta = shown.calories - t.tdee;
    const weekly = (dailyDelta * 7) / 3500;
    const weeksToGoal = profile.goalTargetWeight && Math.abs(weekly) > 0.05
      ? Math.abs(profile.goalTargetWeight - profile.weight) / Math.abs(weekly) : 0;
    const eta = weeksToGoal && weeksToGoal < 520
      ? new Date(Date.now() + weeksToGoal * 7 * 86400000).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '';

    return (
      <Screen>
        <div className="flex min-h-full flex-col px-5 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))]">
          <div className="mx-auto w-full max-w-md">
            <BackButton onClick={goBack} />
          </div>
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} className="mx-auto mt-4 w-full max-w-md flex-1 space-y-4">
            {logOnly ? (
              <>
                <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight">You’re set, {firstName}. No targets, just the facts.</h1>
                <p className="text-base leading-relaxed text-[var(--ink-mid)]">Log what you eat and Home shows what you had: calories, protein, carbs, fat and your week. No "left", no "over", nothing to hit.</p>
                <div className="rounded-3xl border border-[var(--line)] bg-[var(--bg-card)] p-5">
                  <p className={fieldLabel}>What you’ll see</p>
                  <ul className="mt-3 space-y-2.5 text-[15px]">
                    {['Snap, scan or type a meal, you get the last word on the numbers', 'Daily totals and your last 7 days', 'Patterns, like which meals carry your protein'].map(x => (
                      <li key={x} className="flex items-start gap-2.5"><Check size={18} className="mt-0.5 shrink-0 text-[var(--sage)]" aria-hidden="true" />{x}</li>
                    ))}
                  </ul>
                </div>
                <p className="text-sm text-[var(--ink-mid)]">Want targets later? Profile → Edit profile → Tracking style.</p>
              </>
            ) : (
              <>
                <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight">
                  {ownNumbers ? `Your numbers, ${firstName}.` : `${firstName}, here’s your starting point.`}
                </h1>
                <p className="text-base leading-relaxed text-[var(--ink-mid)]">
                  {ownNumbers
                    ? 'Put in what you were given. Ding! tracks against these and won’t recalculate them.'
                    : <>You burn about <b className="text-[var(--ink)] tabular-nums">{fmt(t.tdee)}</b> a day. {summaryLine(goal, weekly, wUnit, toUnit)}</>}
                </p>

                <div className="rounded-3xl border border-[var(--line)] bg-[var(--bg-card)] p-5">
                  {ownNumbers ? (
                    <div className="grid grid-cols-2 gap-3">
                      {([['calories', 'Calories', 'kcal'], ['protein', 'Protein', 'g'], ['carbs', 'Carbs', 'g'], ['fat', 'Fat', 'g']] as const).map(([k, label, unit]) => (
                        <label key={k} className="block">
                          <span className={fieldLabel}>{label}</span>
                          <div className="mt-2 flex items-center rounded-2xl border border-[var(--line-strong)] bg-[var(--bg-dark)] pr-3">
                            <input type="number" inputMode="numeric" value={custom[k] || ''}
                              onChange={e => { setErrorMsg(''); setCustom(c => ({ ...c, [k]: e.target.value === '' ? 0 : Number(e.target.value) })); }}
                              className={`w-full min-w-0 bg-transparent px-4 py-3.5 text-lg font-semibold tabular-nums outline-none ${noSpin}`} aria-label={`${label} per day`} />
                            <span className="text-sm text-[var(--ink-light)]">{unit}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  ) : style === 'protein' ? (
                    <>
                      <BigNumber label="Daily protein" value={`${t.protein}`} unit="g a day" color="var(--viz-protein)" />
                      <p className="mt-4 text-center text-sm text-[var(--ink-mid)]">riding along: <b className="text-[var(--ink)] tabular-nums">{fmt(t.calories)}</b> kcal · C {t.carbs}g · F {t.fat}g</p>
                    </>
                  ) : (
                    <>
                      <BigNumber label="Daily calories" value={fmt(t.calories)} unit="kcal a day" color="var(--primary)" />
                      {style === 'calories' ? (
                        <p className="mt-4 text-center text-sm text-[var(--ink-mid)]">in the background: P {t.protein}g · C {t.carbs}g · F {t.fat}g</p>
                      ) : (
                        <div className="mt-5 grid grid-cols-3 gap-2.5">
                          {([['Protein', t.protein, 'var(--viz-protein)'], ['Carbs', t.carbs, 'var(--viz-carbs)'], ['Fat', t.fat, 'var(--viz-fat)']] as const).map(([label, v, c]) => (
                            <div key={label} className="rounded-2xl border border-[var(--line)] bg-[var(--bg-dark)] p-3 text-center">
                              <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: c }}>{label}</p>
                              <p className="mt-1 text-xl font-bold tabular-nums">{v}g</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  {!ownNumbers && t.floorApplied && (
                    <div className="mt-4 flex items-start gap-2 rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent)]/10 p-3">
                      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
                      <p className="text-sm leading-relaxed">I kept you at a safe minimum. Going lower hurts more than it helps.</p>
                    </div>
                  )}
                  {!ownNumbers && eta && (
                    <p className="mt-4 text-center text-sm text-[var(--ink-mid)]">At this pace you’d hit <b className="text-[var(--ink)] tabular-nums">{r(toUnit(profile.goalTargetWeight))} {wUnit}</b> around <b className="text-[var(--ink)]">{eta}</b>.</p>
                  )}
                </div>

                <button type="button" onClick={() => { setErrorMsg(''); setOwnNumbers(v => !v); }}
                  className="tap min-h-11 w-full rounded-2xl border border-[var(--line-strong)] px-4 text-sm font-semibold">
                  {ownNumbers ? 'Use Ding’s numbers instead' : 'I have my own numbers'}
                </button>
                <p className="text-sm leading-relaxed text-[var(--ink-mid)]">
                  {ownNumbers ? 'You can switch back anytime in Edit profile.' : 'This is a starting point. Log for a couple of weeks with a few weigh-ins and Ding! will suggest an adjustment from what really happens.'}
                </p>
              </>
            )}
          </motion.div>

          <div className="mx-auto mt-6 w-full max-w-md">
            {errorMsg && <p className="mb-2 px-1 text-sm text-[var(--alert)]" role="alert">{errorMsg}</p>}
            <button type="button" onClick={handleFinish}
              className="tap flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--primary)] text-base font-semibold text-[var(--on-primary)]">
              LETS GO <ArrowRight size={20} aria-hidden="true" />
            </button>
          </div>
        </div>
      </Screen>
    );
  }

  // ─────────────────── FORM ───────────────────
  const progress = Math.round(((idx + 1) / (steps.length + 1)) * 100);
  const isLast = idx === steps.length - 1;

  return (
    <Screen>
      <div className="flex min-h-full flex-col">
        <div className="sticky top-0 z-10 bg-[var(--bg-dark)] px-5 pb-3 pt-[max(1.25rem,env(safe-area-inset-top))]">
          <div className="mx-auto flex max-w-md items-center gap-3">
            <BackButton onClick={goBack} />
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--line-strong)]" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Setup progress">
              <motion.div className="h-full rounded-full bg-[var(--primary)]" animate={{ width: `${progress}%` }} transition={{ duration: 0.35, ease: 'easeOut' }} />
            </div>
          </div>
        </div>

        <div className="flex-1 px-5 pb-40">
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -18 }} transition={{ duration: 0.22 }} className="mx-auto max-w-md pt-3">

              {step === 'why' && (
                <StepShell title={`What brings you here, ${firstName}?`} subtitle="Pick everything that fits. This shapes what I show you first.">
                  <div className="space-y-2">
                    {TRACKING_REASONS.map(o => {
                      const on = draft.reasons.includes(o.id);
                      return (
                        <OptionCard key={o.id} multi selected={on} label={o.label} blurb={o.blurb}
                          onClick={() => set('reasons', on ? draft.reasons.filter(x => x !== o.id) : [...draft.reasons, o.id])} />
                      );
                    })}
                  </div>
                </StepShell>
              )}

              {step === 'how' && (
                <StepShell title="How do you want to track?" subtitle="This is what Home puts front and center. Switch anytime in your profile.">
                  <div className="space-y-2">
                    {STYLES.map(o => (
                      <OptionCard key={o.id} selected={draft.style === o.id} label={o.label} blurb={o.blurb}
                        badge={o.id === suggestedStyle ? 'Fits what you picked' : undefined}
                        onClick={() => set('style', o.id)} />
                    ))}
                  </div>
                  <StyleSketch style={draft.style} />
                </StepShell>
              )}

              {step === 'direction' && (
                <StepShell title="Where do you want your weight to go?" subtitle="This sets your calories. No wrong answer, and you can change it later.">
                  <div className="space-y-2">
                    {DIRECTIONS.map(o => (
                      <OptionCard key={o.id} selected={draft.direction === o.id} label={o.label} blurb={o.blurb} onClick={() => set('direction', o.id)} />
                    ))}
                  </div>
                </StepShell>
              )}

              {step === 'body' && (
                <StepShell title="A little about you" subtitle={logOnly ? 'Even without targets, this lets me estimate what your body burns in a day. Ballpark is fine.' : 'This is how I estimate what your body burns. Ballpark is fine, you can change it anytime.'}>
                  <Segmented value={draft.units} onChange={setUnits} options={[{ id: 'us', label: 'lbs · ft' }, { id: 'metric', label: 'kg · cm' }]} label="Units" />
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className={fieldLabel}>Age</span>
                      <NumberField value={draft.age} onChange={v => set('age', v)} placeholder="e.g. 29" min={18} max={100} />
                    </label>
                    <div>
                      <span className={fieldLabel}>Sex</span>
                      <div className="mt-2 grid grid-cols-2 gap-1.5">
                        {(['Male', 'Female'] as const).map(s => (
                          <button key={s} type="button" aria-pressed={draft.sex === s} onClick={() => set('sex', s)}
                            className={`tap min-h-[3.4rem] rounded-2xl border text-sm font-semibold ${draft.sex === s ? 'border-[var(--primary)] bg-[var(--primary)]/15 text-[var(--ink)]' : 'border-[var(--line-strong)] bg-[var(--bg-card)] text-[var(--ink-mid)]'}`}>{s}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <p className="mt-1.5 text-xs text-[var(--ink-light)]">Sex is only used for the metabolism formula.</p>

                  <div className="mt-5">
                    <span className={fieldLabel}>Height</span>
                    {metric ? (
                      <UnitField value={draft.heightCm} onChange={v => set('heightCm', v)} unit="cm" placeholder="e.g. 175" />
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        <UnitField value={draft.heightFt} onChange={v => set('heightFt', v)} unit="ft" placeholder="5" />
                        <UnitField value={draft.heightIn} onChange={v => set('heightIn', v)} unit="in" placeholder="9" />
                      </div>
                    )}
                  </div>
                  <div className="mt-5">
                    <span className={fieldLabel}>Weight right now</span>
                    <UnitField value={draft.weight} onChange={v => set('weight', v)} unit={wUnit} placeholder={metric ? 'e.g. 75' : 'e.g. 165'} step={0.1} />
                  </div>
                  <details className="mt-5 rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] px-4 py-3" open={draft.bodyFat !== undefined}>
                    <summary className="cursor-pointer text-sm font-semibold text-[var(--ink-mid)]">Know your body fat %? (optional)</summary>
                    <p className="mt-2 text-xs leading-relaxed text-[var(--ink-light)]">From a scan or a smart scale. It makes the burn estimate and protein fit your lean mass better.</p>
                    <UnitField value={draft.bodyFat} onChange={v => set('bodyFat', v)} unit="%" placeholder="Skip if you don’t know" step={0.1} />
                  </details>
                </StepShell>
              )}

              {step === 'activity' && (
                <StepShell title="On a normal day, how much do you move?" subtitle="Don’t count workouts. Log those in Ding! and they earn their calories back that day.">
                  <div className="space-y-2">
                    {ACTIVITY.map(o => (
                      <OptionCard key={o.id} selected={draft.activity === o.id} label={o.label} blurb={o.blurb} onClick={() => set('activity', o.id)} />
                    ))}
                  </div>
                </StepShell>
              )}

              {step === 'pace' && (
                <StepShell title={draft.direction === 'lose' ? 'How fast do you want to lose?' : 'How fast do you want to gain?'} subtitle="Slower is easier to stick with. You can change this whenever.">
                  <div className="space-y-2">
                    {PACES.map(p => {
                      const wk = paceWeeklyLbs(goal, weightLbs || 170, p.id);
                      const kcal = r((wk * 3500) / 7);
                      return (
                        <OptionCard key={p.id} selected={draft.pace === p.id} label={p.label}
                          badge={p.id === 'steady' ? 'Most people' : undefined}
                          blurb={`About ${rate(wk, toUnit)} ${wUnit} a week · ${kcal > 0 ? '+' : '−'}${fmt(Math.abs(kcal))} kcal a day`}
                          onClick={() => set('pace', p.id)} />
                      );
                    })}
                  </div>
                  <label className="mt-6 block">
                    <span className={fieldLabel}>Goal weight (optional)</span>
                    <UnitField value={draft.goalWeight} onChange={v => set('goalWeight', v)} unit={wUnit} placeholder="Leave blank to just go" step={0.1} />
                    <p className="mt-1.5 text-xs text-[var(--ink-light)]">If you add one, I’ll show roughly when you’d get there.</p>
                  </label>
                </StepShell>
              )}

              {step === 'eating' && (
                <StepShell title="Any way you like to eat?" subtitle="This splits your calories between carbs and fat. Protein is set either way.">
                  <div className="space-y-2">
                    {SPLITS.map(o => (
                      <OptionCard key={o.id} selected={(draft.split || 'balanced') === o.id} label={o.label} blurb={o.blurb} onClick={() => set('split', o.id)} />
                    ))}
                  </div>
                </StepShell>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="fixed inset-x-0 bottom-0 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6" style={{ background: 'linear-gradient(180deg, transparent 0%, var(--bg-dark) 35%)' }}>
          <div className="mx-auto max-w-md">
            {errorMsg && <p className="mb-2 px-1 text-sm text-[var(--alert)]" role="alert">{errorMsg}</p>}
            <button type="button" onClick={goNext}
              className="tap flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--primary)] text-base font-semibold text-[var(--on-primary)]">
              {isLast ? <><Check size={20} aria-hidden="true" /> {logOnly ? 'Finish' : 'Build my plan'}</> : <>Continue <ArrowRight size={20} aria-hidden="true" /></>}
            </button>
          </div>
        </div>
      </div>

      {healthWarning && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setHealthWarning(null); }}>
          <motion.div role="dialog" aria-modal="true" aria-labelledby="ob-checkin" initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            className="w-full max-w-sm space-y-4 rounded-3xl border border-[var(--accent)]/30 bg-[var(--bg-card)] p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent)]/20 text-[var(--accent)]"><AlertTriangle size={20} aria-hidden="true" /></div>
              <h3 id="ob-checkin" className="text-lg font-bold">A quick check-in</h3>
            </div>
            <div className="space-y-3 text-[15px] leading-relaxed text-[var(--ink-mid)]">
              {healthWarning.kind === 'lowBmi' && (
                <>
                  <p>From the height and weight you entered, your BMI is on the low side. I want you to be safe.</p>
                  <p>If a doctor hasn’t cleared you to track calories, please talk to one before you set a target.</p>
                </>
              )}
              {healthWarning.kind === 'lossWhileUnderweight' && (
                <>
                  <p>Your numbers suggest you may already be underweight, so losing more probably isn’t the move.</p>
                  <p>Keeping it steady lets you track and eat well without cutting. Worth a talk with a doctor before deciding.</p>
                </>
              )}
              {healthWarning.kind === 'highBmi' && (
                <p>From the height and weight you entered, your BMI is in the severely obese range. I can help, and a doctor or registered dietitian alongside the app will make the plan a lot safer than an app on its own.</p>
              )}
              <p className="text-xs italic text-[var(--ink-light)]">BMI is rough and can be off for muscular builds. Trust your doctor over me.</p>
            </div>
            {healthWarning.kind === 'lossWhileUnderweight' ? (
              <div className="space-y-2">
                <button type="button" onClick={() => { set('direction', 'maintain'); setHealthWarning(null); }}
                  className="tap min-h-12 w-full rounded-2xl bg-[var(--primary)] text-sm font-semibold text-[var(--on-primary)]">Switch to keep it steady</button>
                <button type="button" onClick={() => setHealthWarning(null)} className="tap min-h-11 w-full text-sm text-[var(--ink-mid)]">Keep my choice</button>
              </div>
            ) : (
              <button type="button" onClick={() => setHealthWarning(null)}
                className="tap min-h-12 w-full rounded-2xl bg-[var(--primary)] text-sm font-semibold text-[var(--on-primary)]">Got it, continue</button>
            )}
          </motion.div>
        </div>
      )}
    </Screen>
  );
};

// ──────────────────── Helpers ────────────────────

function summaryLine(goal: PhysiqueGoal, weekly: number, unit: string, toUnit: (lbs: number) => number): string {
  const shown = Math.abs(toUnit(weekly)) >= 0.05 ? `${rate(weekly, toUnit)} ${unit}` : '';
  if (goal === PhysiqueGoal.WeightLoss && shown) return `Eating this puts you about ${shown} a week down.`;
  if (goal === PhysiqueGoal.Bulk && shown) return `Eating this puts you about ${shown} a week up.`;
  return 'Eating about this keeps your weight steady.';
}

const fieldLabel = 'text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--ink-light)]';
const inputCls = 'mt-2 w-full rounded-2xl border border-[var(--line-strong)] bg-[var(--bg-card)] px-5 py-4 text-lg font-semibold text-[var(--ink)] outline-none placeholder:text-[var(--ink-light)] focus:border-[var(--primary)]';

const Screen: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="fixed inset-0 z-[100] overflow-y-auto bg-[var(--bg-dark)] text-[var(--ink)]">{children}</div>
);

const BackButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button type="button" onClick={onClick} aria-label="Back"
    className="tap flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--bg-card)] text-[var(--ink-mid)]">
    <ArrowLeft size={18} aria-hidden="true" />
  </button>
);

const StepShell: React.FC<{ title: string; subtitle: string; children: React.ReactNode }> = ({ title, subtitle, children }) => (
  <div>
    <h2 className="text-[1.65rem] font-bold leading-tight tracking-tight">{title}</h2>
    <p className="mt-2 text-[15px] leading-relaxed text-[var(--ink-mid)]">{subtitle}</p>
    <div className="mt-6">{children}</div>
  </div>
);

const OptionCard: React.FC<{ label: string; blurb?: string; selected: boolean; onClick: () => void; multi?: boolean; badge?: string }> = ({ label, blurb, selected, onClick, multi, badge }) => (
  <button type="button" onClick={onClick} aria-pressed={selected}
    className={`tap flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-colors ${selected ? 'border-[var(--primary)] bg-[var(--primary)]/12' : 'border-[var(--line)] bg-[var(--bg-card)]'}`}>
    <span className="min-w-0 flex-1">
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-[15px] font-semibold">{label}</span>
        {badge && <span className="rounded-full bg-[var(--sage)]/15 px-2 py-0.5 text-[11px] font-semibold text-[var(--sage)]">{badge}</span>}
      </span>
      {blurb && <span className="mt-0.5 block text-[13px] leading-snug text-[var(--ink-mid)]">{blurb}</span>}
    </span>
    <span aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center border-2 ${multi ? 'rounded-md' : 'rounded-full'} ${selected ? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--on-primary)]' : 'border-[var(--line-strong)]'}`}>
      {selected && <Check size={14} strokeWidth={3} />}
    </span>
  </button>
);

/** A tiny picture of what Home will lead with for the chosen style. */
const StyleSketch: React.FC<{ style?: TrackingStyle }> = ({ style }) => {
  if (!style) return null;
  const bars = (only?: string) => (['protein', 'carbs', 'fat'] as const).filter(k => !only || k !== only).map(k => (
    <div key={k} className="h-1.5 rounded-full bg-[var(--line-strong)]"><div className="h-full rounded-full" style={{ width: k === 'protein' ? '62%' : k === 'carbs' ? '45%' : '38%', background: `var(--viz-${k})` }} /></div>
  ));
  return (
    <div className="mt-5 rounded-2xl border border-dashed border-[var(--line-strong)] p-4" aria-hidden="true">
      <p className={fieldLabel}>Home will look like</p>
      <div className="mt-3 flex items-center gap-4">
        {style !== 'log' ? (
          <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-[6px] border-[var(--line-strong)]" style={{ borderTopColor: style === 'protein' ? 'var(--viz-protein)' : 'var(--primary)', borderRightColor: style === 'protein' ? 'var(--viz-protein)' : 'var(--primary)' }}>
            <span className="text-[11px] font-bold tabular-nums">{style === 'protein' ? '62g' : '1,340'}</span>
          </div>
        ) : (
          <div className="shrink-0"><p className="text-xl font-bold tabular-nums">760</p><p className="text-[11px] text-[var(--ink-mid)]">kcal today</p></div>
        )}
        <div className="flex-1 space-y-1.5">
          {style === 'macros' && bars()}
          {style === 'protein' && <><p className="text-[11px] text-[var(--ink-mid)]">1,340 kcal left</p>{bars('protein')}</>}
          {style === 'calories' && <p className="text-[12px] text-[var(--ink-mid)]">P 58 · C 76 · F 22</p>}
          {style === 'log' && <p className="text-[12px] text-[var(--ink-mid)]">P 58g · C 76g · F 22g, no targets</p>}
        </div>
      </div>
    </div>
  );
};

const Segmented = <T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { id: T; label: string }[]; label: string }) => (
  <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-1 rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-1">
    {options.map(o => (
      <button key={o.id} type="button" role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)}
        className={`tap min-h-10 rounded-xl text-sm font-semibold ${value === o.id ? 'bg-[var(--ink)] text-[var(--bg-dark)]' : 'text-[var(--ink-mid)]'}`}>{o.label}</button>
    ))}
  </div>
);

const noSpin = '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';
const toNum = (raw: string) => (raw === '' ? undefined : Number(raw));

const NumberField: React.FC<{ value?: number; onChange: (v: number | undefined) => void; placeholder?: string; min?: number; max?: number }> = ({ value, onChange, placeholder, min, max }) => (
  <input type="number" inputMode="numeric" value={value ?? ''} onChange={e => onChange(toNum(e.target.value))}
    placeholder={placeholder} min={min} max={max} className={`${inputCls} ${noSpin} tabular-nums`} />
);

const UnitField: React.FC<{ value?: number; onChange: (v: number | undefined) => void; unit: string; placeholder?: string; step?: number }> = ({ value, onChange, unit, placeholder, step }) => (
  <div className="mt-2 flex items-center rounded-2xl border border-[var(--line-strong)] bg-[var(--bg-card)] pr-4 focus-within:border-[var(--primary)]">
    <input type="number" inputMode="decimal" step={step ?? 1} value={value ?? ''} onChange={e => onChange(toNum(e.target.value))}
      placeholder={placeholder} className={`w-full min-w-0 bg-transparent px-5 py-4 text-lg font-semibold tabular-nums outline-none placeholder:text-[var(--ink-light)] ${noSpin}`} />
    <span className="shrink-0 text-sm font-semibold text-[var(--ink-light)]">{unit}</span>
  </div>
);

const BigNumber: React.FC<{ label: string; value: string; unit: string; color: string }> = ({ label, value, unit, color }) => (
  <div className="text-center">
    <p className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color }}>{label}</p>
    <p className="mt-1 text-5xl font-bold tabular-nums">{value}</p>
    <p className="mt-1 text-xs text-[var(--ink-light)]">{unit}</p>
  </div>
);

export default Onboarding;
