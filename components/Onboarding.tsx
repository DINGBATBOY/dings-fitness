/**
 * Onboarding — stepped form (v2).
 *
 * Replaces the earlier chat-with-typing-dots flow. Same data collected +
 * three new fields (injuries, goal timeline, motivation), plus a proper
 * feet/inches height picker so nobody has to think in raw inches.
 *
 * Structure:
 *   phase 'disclaimer' → mandatory health disclaimer (Apple/Google policy)
 *   phase 'form'       → 9 stepped screens with a top progress bar
 *   phase 'result'     → macros reveal + Let's Go button
 *
 * Palette matches FuelHome — one warm-dark surface tone throughout.
 */

import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { PhysiqueGoal, ActivityLevel, UserProfile } from '../types';
import {
  DAYS_OF_WEEK,
  CALCULATE_TDEE,
  CALCULATE_MACROS,
  getBMI,
  getBMICategory,
  type BMICategory,
} from '../constants';
import { generateOnboardingMacros } from '../services/geminiService';
import {
  AlertTriangle,
  Heart,
  ArrowLeft,
  ArrowRight,
  Check,
  Sparkles,
} from 'lucide-react';

interface OnboardingProps {
  onComplete: (profile: UserProfile, targets: any) => void;
}

// ──────────────────── Palette (matches FuelHome) ────────────────────
const C = {
  bg: '#161210',
  card: '#1d1815',
  cardSoft: '#221d19',
  border: 'rgba(255,255,255,0.06)',
  borderStrong: 'rgba(255,255,255,0.10)',
  ink: '#f5ede1',
  inkMid: '#c4b8a4',
  inkLight: '#8b7e6e',
  fire: '#d97757',
  ochre: '#e8a85a',
  emerald: '#7ab896',
  sky: '#6fa8c4',
  protein: '#e3614a',
  amber: '#d4a55a',
};

// Height stays split as ft/in in the draft so the picker is straightforward.
// Motivation is a free-form-ish string but we surface 7 preset chips.
interface Draft {
  name: string;
  age?: number;
  sex?: 'Male' | 'Female';
  heightFt?: number;
  heightIn?: number;
  weight?: number;
  bodyFat?: number;
  activityLevel?: ActivityLevel;
  goal?: PhysiqueGoal;
  goalTargetWeight?: number;
  goalTargetDate?: string;
  motivation?: string;
  injuries: string[];
  workoutExperience?: 'beginner' | 'intermediate' | 'advanced';
  workoutDaysPerWeek?: 3 | 4 | 5 | 6;
  workoutSessionMinutes?: 30 | 45 | 60 | 90;
  workoutEquipment?: 'full-gym' | 'home-weights' | 'bodyweight';
  highEnergyDays: string[];
  busyDays: string[];
}

const INJURIES = ['Knees', 'Shoulders', 'Back', 'Wrists', 'Ankles', 'Elbows', 'Hips', 'None'];

const MOTIVATIONS = [
  'Feel good in my body',
  'Get stronger',
  'Build muscle',
  'Lose fat',
  'Have more energy',
  'Live longer',
  'Prep for an event',
];

// Total steps used to compute the progress bar. Kept in one place so
// changes to the flow update the bar automatically.
const TOTAL_STEPS = 9;

export const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
  const [phase, setPhase] = useState<'disclaimer' | 'form' | 'result'>('disclaimer');
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<Draft>({
    name: '',
    injuries: [],
    highEnergyDays: [],
    busyDays: [],
  });
  const [errorMsg, setErrorMsg] = useState('');
  const [isGeneratingMacros, setIsGeneratingMacros] = useState(false);
  const [macroResult, setMacroResult] = useState<any>(null);
  const [healthWarning, setHealthWarning] = useState<{
    kind: 'lowBmi' | 'highBmi' | 'weightLossWhileUnderweight';
    category: BMICategory;
  } | null>(null);

  const setField = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft(prev => ({ ...prev, [key]: value }));
    setErrorMsg('');
  };

  // Total inches only computed on submit — the intermediate ft/in state
  // is what the picker actually reads.
  const totalHeightInches = useMemo(() => {
    const ft = draft.heightFt ?? 0;
    const inch = draft.heightIn ?? 0;
    return ft * 12 + inch;
  }, [draft.heightFt, draft.heightIn]);

  // Per-step validation. Blocks Next until required fields are set +
  // in-range. Returns an error message string (empty = valid).
  const validateCurrentStep = (): string => {
    switch (step) {
      case 1:
        if (!draft.name.trim()) return "Enter your name to continue.";
        if (draft.name.trim().length > 30) return "Name must be 30 characters or less.";
        return '';
      case 2:
        if (!draft.age) return "Enter your age.";
        if (draft.age < 13 || draft.age > 100) return "Age must be between 13 and 100.";
        if (!draft.sex) return "Pick your biological sex — we need it to estimate your metabolism.";
        return '';
      case 3:
        if (!draft.heightFt || draft.heightIn === undefined) return "Enter your height.";
        if (totalHeightInches < 48 || totalHeightInches > 96) return "Height should be between 4'0\" and 8'0\".";
        if (!draft.weight) return "Enter your current weight.";
        if (draft.weight < 80 || draft.weight > 500) return "Weight should be between 80 and 500 lbs.";
        return '';
      case 4:
        if (draft.bodyFat !== undefined && (draft.bodyFat < 3 || draft.bodyFat > 60)) {
          return "Body fat should be 3–60%.";
        }
        if (!draft.activityLevel) return "Pick your typical activity level.";
        return '';
      case 5:
        if (!draft.goal) return "Pick a goal to continue.";
        return '';
      case 6:
        if (draft.goalTargetWeight !== undefined && (draft.goalTargetWeight < 60 || draft.goalTargetWeight > 500)) {
          return "Target weight should be between 60 and 500 lbs.";
        }
        return '';
      case 7:
        return '';
      case 8:
        if (!draft.workoutExperience) return "Pick your training experience.";
        if (!draft.workoutDaysPerWeek) return "Pick how many days a week you'll train.";
        if (!draft.workoutSessionMinutes) return "Pick a session length.";
        if (!draft.workoutEquipment) return "Pick your setup.";
        return '';
      case 9:
        return '';
      default:
        return '';
    }
  };

  const goNext = () => {
    const err = validateCurrentStep();
    if (err) { setErrorMsg(err); return; }

    // BMI safety gates fire between steps. The modal surfaces at the
    // moment the concerning data has landed — non-blocking; the user can
    // dismiss and continue.
    if (step === 3 && draft.weight && totalHeightInches) {
      const bmi = getBMI(draft.weight, totalHeightInches);
      const category = getBMICategory(bmi);
      if (category === 'severelyUnderweight' || category === 'underweight') {
        setHealthWarning({ kind: 'lowBmi', category });
      } else if (category === 'severelyObese') {
        setHealthWarning({ kind: 'highBmi', category });
      }
    }
    if (step === 5 && draft.goal === PhysiqueGoal.WeightLoss && draft.weight && totalHeightInches) {
      const bmi = getBMI(draft.weight, totalHeightInches);
      const category = getBMICategory(bmi);
      if (category === 'severelyUnderweight' || category === 'underweight') {
        setHealthWarning({ kind: 'weightLossWhileUnderweight', category });
      }
    }

    setErrorMsg('');
    if (step < TOTAL_STEPS) {
      setStep(s => s + 1);
    } else {
      generateMacros();
    }
  };

  const goBack = () => {
    if (step > 1) {
      setErrorMsg('');
      setStep(s => s - 1);
    }
  };

  const generateMacros = async () => {
    setIsGeneratingMacros(true);
    setErrorMsg('');
    const finalProfile: any = {
      name: draft.name.trim(),
      age: draft.age,
      sex: draft.sex,
      weight: draft.weight,
      height: totalHeightInches,
      bodyFat: draft.bodyFat,
      activityLevel: draft.activityLevel,
      goal: draft.goal,
      goalTargetWeight: draft.goalTargetWeight,
      goalTargetDate: draft.goalTargetDate,
      motivation: draft.motivation?.trim() || undefined,
      injuries: draft.injuries.length ? draft.injuries : undefined,
      workoutExperience: draft.workoutExperience,
      workoutDaysPerWeek: draft.workoutDaysPerWeek,
      workoutSessionMinutes: draft.workoutSessionMinutes,
      workoutEquipment: draft.workoutEquipment,
      highEnergyDays: draft.highEnergyDays,
      busyDays: draft.busyDays,
    };
    try {
      const result = await generateOnboardingMacros(finalProfile);
      setMacroResult({
        dailyCalories: result.dailyCalories ?? result.calories,
        protein: result.protein,
        carbs: result.carbs,
        fat: result.fat,
        protocolName: result.protocolName,
        coachMessage: result.coachMessage,
        floorApplied: result.floorApplied === true,
        finalProfile,
      });
    } catch (e) {
      // Fallback — local formulas so a network flake doesn't stall
      // onboarding. Same shape as the Gemini result.
      console.error("Gemini onboarding failed, using local macros:", e);
      const bf = finalProfile.inBodyData?.pbf ?? finalProfile.bodyFat;
      const tdee = CALCULATE_TDEE(
        finalProfile.weight || 150,
        finalProfile.height || 70,
        finalProfile.age || 30,
        finalProfile.activityLevel || ActivityLevel.Light,
        finalProfile.sex || 'Male',
        bf,
      );
      const macros = CALCULATE_MACROS(
        tdee,
        finalProfile.goal || PhysiqueGoal.Lean,
        finalProfile.weight || 150,
        finalProfile.sex || 'Male',
        'balanced',
        // Timeline-aware deficit — same formula the AI is instructed to use,
        // so the local fallback produces the same shape of answer.
        (finalProfile.goalTargetWeight && finalProfile.goalTargetDate)
          ? { targetWeightLbs: finalProfile.goalTargetWeight, targetDate: finalProfile.goalTargetDate }
          : undefined,
      );
      setMacroResult({
        dailyCalories: macros.calories,
        protein: macros.protein,
        carbs: macros.carbs,
        fat: macros.fat,
        floorApplied: macros.floorApplied,
        finalProfile,
      });
    } finally {
      setIsGeneratingMacros(false);
      setPhase('result');
    }
  };

  const handleFinish = () => {
    if (!macroResult) return;
    const raw = macroResult.finalProfile;
    const workoutPreferences = (raw.workoutExperience || raw.workoutDaysPerWeek || raw.workoutSessionMinutes || raw.workoutEquipment)
      ? {
          experience: raw.workoutExperience,
          daysPerWeek: raw.workoutDaysPerWeek,
          sessionMinutes: raw.workoutSessionMinutes,
          equipment: raw.workoutEquipment,
        }
      : undefined;

    // Strip fields that don't live on UserProfile (draft-only shape).
    const {
      workoutExperience, workoutDaysPerWeek, workoutSessionMinutes, workoutEquipment,
      ...cleanProfile
    } = raw;

    onComplete(
      {
        ...cleanProfile,
        initialWeight: cleanProfile.weight,
        workoutPreferences,
        acceptedHealthDisclaimer: true,
        disclaimerAcceptedAt: new Date().toISOString(),
      } as UserProfile,
      {
        calories: macroResult.dailyCalories,
        protein: macroResult.protein,
        carbs: macroResult.carbs,
        fat: macroResult.fat,
      }
    );
  };

  // ─────────────────── DISCLAIMER PHASE ───────────────────
  if (phase === 'disclaimer') {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col overflow-y-auto" style={{ background: C.bg, color: C.ink }}>
        <div className="flex-1 flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="w-full max-w-md rounded-3xl p-7"
            style={{ background: C.card, border: `1px solid ${C.border}` }}
          >
            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: `${C.fire}20`, color: C.fire }}>
                <Heart className="w-7 h-7" strokeWidth={1.5} />
              </div>
              <h1 className="text-xl font-bold tracking-tight text-center" style={{ color: C.ink }}>
                Before we begin
              </h1>
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-center" style={{ color: C.inkLight }}>
                Quick read — your wellbeing matters
              </p>
            </div>

            <div className="space-y-4 mt-6 text-sm leading-relaxed" style={{ color: C.inkMid }}>
              <p>
                Ding! is a <span className="font-semibold" style={{ color: C.ink }}>fitness tracking tool</span>, not
                a medical device or a substitute for professional advice. The calorie targets, workouts, and
                suggestions you'll see are estimates — a starting point, not a prescription.
              </p>
              <p>
                Before changing your diet or exercise routine, please talk to a doctor —
                especially if you have a medical condition, are pregnant or breastfeeding, or take medication.
              </p>
              <div className="flex items-start gap-3 p-4 rounded-2xl" style={{ background: `${C.protein}10`, border: `1px solid ${C.protein}30` }}>
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: C.protein }} />
                <p className="text-[13px]" style={{ color: C.ink }}>
                  If you've had an eating disorder, please don't use Ding! to set weight or calorie goals.
                  The{' '}
                  <a
                    href="https://www.allianceforeatingdisorders.com/find-treatment/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2"
                    style={{ color: C.protein }}
                  >
                    National Alliance for Eating Disorders
                  </a>{' '}
                  helpline is 1-866-662-1235.
                </p>
              </div>
              <p className="text-xs" style={{ color: C.inkLight }}>
                By continuing, you confirm you've read the above and understand that Ding! doesn't provide medical advice.
              </p>
            </div>

            <button
              onClick={() => setPhase('form')}
              className="w-full py-4 mt-6 rounded-2xl font-semibold text-sm text-white transition-colors"
              style={{ background: C.fire }}
            >
              I understand — let's start
            </button>
          </motion.div>
        </div>
      </div>
    );
  }

  // ─────────────────── RESULT PHASE ───────────────────
  if (phase === 'result' && macroResult) {
    return (
      <div className="fixed inset-0 z-[100] overflow-y-auto" style={{ background: C.bg, color: C.ink }}>
        <div className="min-h-full flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-md space-y-5"
          >
            <div className="text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-[0.25em] font-bold" style={{ background: `${C.fire}15`, color: C.fire, border: `1px solid ${C.fire}30` }}>
                <Sparkles className="w-3 h-3" strokeWidth={2} />
                {macroResult.protocolName || 'Your plan'}
              </div>
              <h1 className="text-2xl font-bold mt-3 leading-tight" style={{ color: C.ink }}>
                {draft.name.trim().split(/\s+/)[0]}, here are your daily targets.
              </h1>
              {macroResult.coachMessage && (
                <p className="text-sm mt-3 leading-relaxed" style={{ color: C.inkMid }}>
                  {macroResult.coachMessage}
                </p>
              )}
            </div>

            <div className="rounded-3xl p-5" style={{ background: C.card, border: `1px solid ${C.border}` }}>
              <div className="text-center pb-4 mb-4" style={{ borderBottom: `1px solid ${C.border}` }}>
                <div className="text-[10px] uppercase tracking-[0.25em] font-bold" style={{ color: C.fire }}>Daily calories</div>
                <div className="text-5xl font-bold tabular-nums mt-1" style={{ color: C.ink }}>{macroResult.dailyCalories}</div>
                <div className="text-[10px] mt-1" style={{ color: C.inkLight }}>kcal / day</div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Protein', value: macroResult.protein, color: C.protein },
                  { label: 'Carbs',   value: macroResult.carbs,   color: C.ochre },
                  { label: 'Fat',     value: macroResult.fat,     color: C.emerald },
                ].map(m => (
                  <div key={m.label} className="rounded-2xl p-3 text-center" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                    <div className="text-[9px] uppercase tracking-[0.2em] font-bold" style={{ color: m.color }}>{m.label}</div>
                    <div className="text-lg font-bold tabular-nums mt-1" style={{ color: C.ink }}>{m.value}g</div>
                  </div>
                ))}
              </div>
              {macroResult.floorApplied && (
                <div className="mt-4 flex items-start gap-2 p-3 rounded-2xl" style={{ background: `${C.amber}10`, border: `1px solid ${C.amber}30` }}>
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: C.amber }} />
                  <p className="text-[11px] leading-relaxed" style={{ color: C.ink }}>
                    Capped at the safe minimum. Going lower hurts more than it helps.
                  </p>
                </div>
              )}
            </div>

            <button
              onClick={handleFinish}
              className="w-full py-4 rounded-2xl font-semibold text-white text-base flex items-center justify-center gap-2"
              style={{ background: C.fire }}
            >
              Let's go
              <ArrowRight className="w-5 h-5" strokeWidth={2} />
            </button>
          </motion.div>
        </div>
      </div>
    );
  }

  // ─────────────────── FORM PHASE ───────────────────
  const progressPercent = Math.min(100, Math.round(((step - 1) / TOTAL_STEPS) * 100));

  return (
    <div className="fixed inset-0 z-[100] flex flex-col" style={{ background: C.bg, color: C.ink }}>
      {/* Header — back button + progress bar + step counter */}
      <div className="px-5 pt-5 pb-4 shrink-0" style={{ background: C.bg }}>
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={goBack}
            disabled={step === 1}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-opacity disabled:opacity-30"
            style={{ background: C.card, border: `1px solid ${C.border}`, color: C.inkMid }}
            aria-label="Previous step"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={2} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-[9px] uppercase tracking-[0.3em] font-bold" style={{ color: C.inkLight }}>
              Step {step} of {TOTAL_STEPS}
            </div>
          </div>
        </div>
        <div className="h-1 rounded-full overflow-hidden" style={{ background: C.card }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: C.fire }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* Body — the actual step content, swaps on step change */}
      <div className="flex-1 overflow-y-auto px-5 pb-40">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25 }}
            className="max-w-md mx-auto"
          >
            {step === 1 && (
              <StepShell
                title="What's your name?"
                subtitle="This is how Ding will refer to you."
              >
                <TextInput
                  autoFocus
                  value={draft.name}
                  onChange={v => setField('name', v)}
                  placeholder="Your name"
                  maxLength={30}
                  onSubmit={goNext}
                />
              </StepShell>
            )}

            {step === 2 && (
              <StepShell
                title="Tell us about you."
                subtitle="Age and biological sex help us estimate your baseline metabolism."
              >
                <label className="block">
                  <span className="text-[10px] uppercase tracking-[0.25em] font-bold" style={{ color: C.inkLight }}>Age</span>
                  <NumberInput
                    autoFocus
                    value={draft.age}
                    onChange={v => setField('age', v)}
                    placeholder="Your age"
                    min={13}
                    max={100}
                  />
                </label>
                <div className="mt-5">
                  <span className="text-[10px] uppercase tracking-[0.25em] font-bold" style={{ color: C.inkLight }}>Biological sex</span>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <ChoiceButton label="Male"   selected={draft.sex === 'Male'}   onClick={() => setField('sex', 'Male')} />
                    <ChoiceButton label="Female" selected={draft.sex === 'Female'} onClick={() => setField('sex', 'Female')} />
                  </div>
                </div>
              </StepShell>
            )}

            {step === 3 && (
              <StepShell
                title="Height and weight."
                subtitle="Ballpark is fine — you can update anytime."
              >
                <div className="mb-5">
                  <span className="text-[10px] uppercase tracking-[0.25em] font-bold" style={{ color: C.inkLight }}>Height</span>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <FtInInput
                      label="ft"
                      value={draft.heightFt}
                      onChange={v => setField('heightFt', v)}
                      min={4}
                      max={8}
                    />
                    <FtInInput
                      label="in"
                      value={draft.heightIn}
                      onChange={v => setField('heightIn', v)}
                      min={0}
                      max={11}
                    />
                  </div>
                </div>
                <label className="block">
                  <span className="text-[10px] uppercase tracking-[0.25em] font-bold" style={{ color: C.inkLight }}>Weight (lbs)</span>
                  <NumberInput
                    value={draft.weight}
                    onChange={v => setField('weight', v)}
                    placeholder="e.g. 165"
                    min={80}
                    max={500}
                  />
                </label>
              </StepShell>
            )}

            {step === 4 && (
              <StepShell
                title="Metabolism inputs."
                subtitle="Body fat is optional. Activity should reflect how you actually move day to day — separate from training."
              >
                <label className="block">
                  <span className="text-[10px] uppercase tracking-[0.25em] font-bold" style={{ color: C.inkLight }}>Body fat % (optional)</span>
                  <NumberInput
                    value={draft.bodyFat}
                    onChange={v => setField('bodyFat', v)}
                    placeholder="Skip if you don't know"
                    min={3}
                    max={60}
                    step={0.1}
                  />
                  <p className="text-[10px] mt-1.5" style={{ color: C.inkLight }}>
                    If you have it, your macros will be tuned to lean mass instead of scale weight.
                  </p>
                </label>
                <div className="mt-5">
                  <span className="text-[10px] uppercase tracking-[0.25em] font-bold" style={{ color: C.inkLight }}>Daily activity (outside of workouts)</span>
                  <div className="space-y-2 mt-2">
                    {Object.values(ActivityLevel).map(level => (
                      <ChoiceButton
                        key={level}
                        label={level}
                        selected={draft.activityLevel === level}
                        onClick={() => setField('activityLevel', level)}
                      />
                    ))}
                  </div>
                </div>
              </StepShell>
            )}

            {step === 5 && (
              <StepShell
                title="What are you here for?"
                subtitle="Pick the one that fits best. You can change later."
              >
                <div className="space-y-2">
                  {[
                    { g: PhysiqueGoal.WeightLoss,    blurb: 'Lose fat, keep muscle.' },
                    { g: PhysiqueGoal.Lean,          blurb: 'Stay lean, look defined.' },
                    { g: PhysiqueGoal.Bulk,          blurb: 'Add size and strength.' },
                    { g: PhysiqueGoal.Recomposition, blurb: 'Lose fat and gain muscle at the same time.' },
                    { g: PhysiqueGoal.Performance,   blurb: 'Feel strong, move well.' },
                  ].map(({ g, blurb }) => (
                    <GoalButton
                      key={g}
                      label={g}
                      blurb={blurb}
                      selected={draft.goal === g}
                      onClick={() => setField('goal', g)}
                    />
                  ))}
                </div>
              </StepShell>
            )}

            {step === 6 && (
              <StepShell
                title="What does success look like?"
                subtitle="Both fields are optional — leave blank if you'd rather move gradually."
              >
                <label className="block">
                  <span className="text-[10px] uppercase tracking-[0.25em] font-bold" style={{ color: C.inkLight }}>Target weight (lbs, optional)</span>
                  <NumberInput
                    value={draft.goalTargetWeight}
                    onChange={v => setField('goalTargetWeight', v)}
                    placeholder="e.g. 155"
                    min={60}
                    max={500}
                  />
                </label>
                <label className="block mt-5">
                  <span className="text-[10px] uppercase tracking-[0.25em] font-bold" style={{ color: C.inkLight }}>Target date (optional)</span>
                  <DateInput
                    value={draft.goalTargetDate}
                    onChange={v => setField('goalTargetDate', v)}
                  />
                </label>
                <div className="mt-5">
                  <span className="text-[10px] uppercase tracking-[0.25em] font-bold" style={{ color: C.inkLight }}>Why now?</span>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {MOTIVATIONS.map(m => (
                      <ChipButton
                        key={m}
                        label={m}
                        selected={draft.motivation === m}
                        onClick={() => setField('motivation', m)}
                      />
                    ))}
                  </div>
                  <TextInput
                    value={draft.motivation && MOTIVATIONS.includes(draft.motivation) ? '' : (draft.motivation || '')}
                    onChange={v => setField('motivation', v)}
                    placeholder="Or type your own reason"
                    maxLength={120}
                    className="mt-2"
                  />
                </div>
              </StepShell>
            )}

            {step === 7 && (
              <StepShell
                title="Anything hurting?"
                subtitle="Pick what you'd rather not stress. We'll steer the AI split around these — nothing gets recommended blindly."
              >
                <div className="flex flex-wrap gap-2">
                  {INJURIES.map(i => {
                    const selected = draft.injuries.includes(i);
                    return (
                      <ChipButton
                        key={i}
                        label={i}
                        selected={selected}
                        onClick={() => {
                          if (i === 'None') {
                            setField('injuries', selected ? [] : ['None']);
                          } else {
                            const next = selected
                              ? draft.injuries.filter(x => x !== i)
                              : [...draft.injuries.filter(x => x !== 'None'), i];
                            setField('injuries', next);
                          }
                        }}
                      />
                    );
                  })}
                </div>
              </StepShell>
            )}

            {step === 8 && (
              <StepShell
                title="How you train."
                subtitle="This shapes the workout split — no wrong answer."
              >
                <div>
                  <span className="text-[10px] uppercase tracking-[0.25em] font-bold" style={{ color: C.inkLight }}>Experience</span>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {(['beginner', 'intermediate', 'advanced'] as const).map(e => (
                      <ChoiceButton
                        key={e}
                        label={e[0].toUpperCase() + e.slice(1)}
                        selected={draft.workoutExperience === e}
                        onClick={() => setField('workoutExperience', e)}
                      />
                    ))}
                  </div>
                </div>
                <div className="mt-5">
                  <span className="text-[10px] uppercase tracking-[0.25em] font-bold" style={{ color: C.inkLight }}>Days per week</span>
                  <div className="grid grid-cols-4 gap-2 mt-2">
                    {[3, 4, 5, 6].map(d => (
                      <ChoiceButton
                        key={d}
                        label={`${d}`}
                        selected={draft.workoutDaysPerWeek === d}
                        onClick={() => setField('workoutDaysPerWeek', d as 3 | 4 | 5 | 6)}
                      />
                    ))}
                  </div>
                </div>
                <div className="mt-5">
                  <span className="text-[10px] uppercase tracking-[0.25em] font-bold" style={{ color: C.inkLight }}>Session length (minutes)</span>
                  <div className="grid grid-cols-4 gap-2 mt-2">
                    {[30, 45, 60, 90].map(m => (
                      <ChoiceButton
                        key={m}
                        label={`${m}m`}
                        selected={draft.workoutSessionMinutes === m}
                        onClick={() => setField('workoutSessionMinutes', m as 30 | 45 | 60 | 90)}
                      />
                    ))}
                  </div>
                </div>
                <div className="mt-5">
                  <span className="text-[10px] uppercase tracking-[0.25em] font-bold" style={{ color: C.inkLight }}>Where you train</span>
                  <div className="space-y-2 mt-2">
                    <ChoiceButton label="Full gym"                 selected={draft.workoutEquipment === 'full-gym'}     onClick={() => setField('workoutEquipment', 'full-gym')} />
                    <ChoiceButton label="Home with some weights"  selected={draft.workoutEquipment === 'home-weights'} onClick={() => setField('workoutEquipment', 'home-weights')} />
                    <ChoiceButton label="Bodyweight only"          selected={draft.workoutEquipment === 'bodyweight'}    onClick={() => setField('workoutEquipment', 'bodyweight')} />
                  </div>
                </div>
              </StepShell>
            )}

            {step === 9 && (
              <StepShell
                title="Your week at a glance."
                subtitle="Both optional. Helps the AI put hard days when you have energy and rest days when you don't."
              >
                <div>
                  <span className="text-[10px] uppercase tracking-[0.25em] font-bold" style={{ color: C.emerald }}>Days you have the most energy</span>
                  <DaysPicker
                    selected={draft.highEnergyDays}
                    onToggle={d => {
                      const next = draft.highEnergyDays.includes(d)
                        ? draft.highEnergyDays.filter(x => x !== d)
                        : [...draft.highEnergyDays, d];
                      setField('highEnergyDays', next);
                    }}
                    color={C.emerald}
                  />
                </div>
                <div className="mt-5">
                  <span className="text-[10px] uppercase tracking-[0.25em] font-bold" style={{ color: C.protein }}>Days that are usually your busiest</span>
                  <DaysPicker
                    selected={draft.busyDays}
                    onToggle={d => {
                      const next = draft.busyDays.includes(d)
                        ? draft.busyDays.filter(x => x !== d)
                        : [...draft.busyDays, d];
                      setField('busyDays', next);
                    }}
                    color={C.protein}
                  />
                </div>
              </StepShell>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Sticky footer — Next button + inline error */}
      <div
        className="fixed bottom-0 left-0 right-0 px-5 pt-3 pb-6"
        style={{
          background: `linear-gradient(180deg, ${C.bg}00 0%, ${C.bg} 40%)`,
        }}
      >
        <div className="max-w-md mx-auto">
          {errorMsg && (
            <p className="text-[12px] mb-2 px-1" style={{ color: C.protein }}>{errorMsg}</p>
          )}
          <button
            onClick={goNext}
            disabled={isGeneratingMacros}
            className="w-full py-4 rounded-2xl font-semibold text-white text-base flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ background: C.fire }}
          >
            {isGeneratingMacros ? (
              <>
                <motion.div
                  className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                />
                Crunching your numbers...
              </>
            ) : step === TOTAL_STEPS ? (
              <>
                <Check className="w-5 h-5" strokeWidth={2} />
                Build my plan
              </>
            ) : (
              <>
                Continue
                <ArrowRight className="w-5 h-5" strokeWidth={2} />
              </>
            )}
          </button>
        </div>
      </div>

      {/* BMI safety modal — surfaces after step 3 or 5 when concerning. */}
      {healthWarning && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 backdrop-blur-sm"
          style={{ background: 'rgba(0,0,0,0.75)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setHealthWarning(null); }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="w-full max-w-sm rounded-3xl p-6 space-y-4"
            style={{ background: C.card, border: `1px solid ${C.amber}30` }}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: `${C.amber}20`, color: C.amber }}>
                <AlertTriangle className="w-5 h-5" strokeWidth={1.5} />
              </div>
              <h3 className="text-base font-bold" style={{ color: C.ink }}>
                A quick check-in
              </h3>
            </div>
            <div className="text-sm leading-relaxed space-y-3" style={{ color: C.inkMid }}>
              {healthWarning.kind === 'lowBmi' && (
                <>
                  <p>
                    Based on the height and weight you entered, your BMI is on the lower end.
                    We want you to be safe.
                  </p>
                  <p style={{ color: C.inkLight }}>
                    If a doctor hasn't cleared you to track calories, please consider talking
                    to one before setting a target.
                  </p>
                </>
              )}
              {healthWarning.kind === 'weightLossWhileUnderweight' && (
                <>
                  <p>
                    Your stats suggest you may already be in the underweight range.
                    We'd gently suggest reconsidering a weight-loss goal.
                  </p>
                  <p style={{ color: C.inkLight }}>
                    A Recomposition or Performance goal focuses on getting stronger without
                    further weight loss. Worth talking to a doctor before deciding.
                  </p>
                </>
              )}
              {healthWarning.kind === 'highBmi' && (
                <p>
                  Based on the height and weight you entered, your BMI is in the severely obese range.
                  We can help — but at this level, working with a doctor or registered dietitian
                  alongside the app will give you a much safer, more sustainable plan than an app on its own.
                </p>
              )}
              <p className="text-[11px] italic" style={{ color: C.inkLight }}>
                BMI is a rough estimate — it can be off for muscular builds. Trust your doctor over ours.
              </p>
            </div>
            <button
              onClick={() => setHealthWarning(null)}
              className="w-full py-3 rounded-2xl font-semibold text-sm text-white"
              style={{ background: C.fire }}
            >
              Got it, continue
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
};

// ──────────────────── Sub-components ────────────────────

const StepShell: React.FC<{ title: string; subtitle: string; children: React.ReactNode }> = ({ title, subtitle, children }) => (
  <div>
    <h2 className="text-2xl font-bold tracking-tight leading-tight" style={{ color: C.ink }}>
      {title}
    </h2>
    <p className="text-sm mt-2 leading-relaxed" style={{ color: C.inkMid }}>
      {subtitle}
    </p>
    <div className="mt-6">
      {children}
    </div>
  </div>
);

interface TextInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  maxLength?: number;
  className?: string;
  onSubmit?: () => void;
}
const TextInput: React.FC<TextInputProps> = ({ value, onChange, placeholder, autoFocus, maxLength, className, onSubmit }) => (
  <input
    type="text"
    value={value}
    onChange={e => onChange(e.target.value)}
    placeholder={placeholder}
    autoFocus={autoFocus}
    maxLength={maxLength}
    onKeyDown={e => { if (e.key === 'Enter' && onSubmit) { e.preventDefault(); onSubmit(); } }}
    className={`w-full rounded-2xl px-5 py-4 text-lg font-semibold outline-none transition-colors ${className || ''}`}
    style={{
      background: C.card,
      border: `1px solid ${C.borderStrong}`,
      color: C.ink,
    }}
  />
);

interface NumberInputProps {
  value?: number;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  autoFocus?: boolean;
}
const NumberInput: React.FC<NumberInputProps> = ({ value, onChange, placeholder, min, max, step, autoFocus }) => (
  <input
    type="number"
    inputMode="decimal"
    value={value ?? ''}
    onChange={e => {
      const raw = e.target.value;
      if (raw === '') onChange(undefined);
      else onChange(Number(raw));
    }}
    placeholder={placeholder}
    min={min}
    max={max}
    step={step ?? 1}
    autoFocus={autoFocus}
    className="w-full mt-2 rounded-2xl px-5 py-4 text-lg font-semibold outline-none tabular-nums"
    style={{
      background: C.card,
      border: `1px solid ${C.borderStrong}`,
      color: C.ink,
    }}
  />
);

const DateInput: React.FC<{ value?: string; onChange: (v: string) => void }> = ({ value, onChange }) => (
  <input
    type="date"
    value={value ?? ''}
    onChange={e => onChange(e.target.value)}
    className="w-full mt-2 rounded-2xl px-5 py-4 text-lg font-semibold outline-none"
    style={{
      background: C.card,
      border: `1px solid ${C.borderStrong}`,
      color: C.ink,
      colorScheme: 'dark',
    }}
  />
);

const FtInInput: React.FC<{ label: string; value?: number; onChange: (v: number | undefined) => void; min: number; max: number }> = ({ label, value, onChange, min, max }) => (
  <div className="flex items-center gap-2 rounded-2xl pl-4 pr-3" style={{ background: C.card, border: `1px solid ${C.borderStrong}` }}>
    <input
      type="number"
      inputMode="numeric"
      value={value ?? ''}
      onChange={e => {
        const raw = e.target.value;
        if (raw === '') onChange(undefined);
        else onChange(Number(raw));
      }}
      min={min}
      max={max}
      className="w-full py-4 bg-transparent text-lg font-semibold outline-none tabular-nums"
      style={{ color: C.ink }}
      placeholder="0"
    />
    <span className="text-sm font-semibold shrink-0" style={{ color: C.inkLight }}>{label}</span>
  </div>
);

const ChoiceButton: React.FC<{ label: string; selected: boolean; onClick: () => void }> = ({ label, selected, onClick }) => (
  <button
    onClick={onClick}
    className="py-3.5 px-4 rounded-2xl text-sm font-semibold transition-colors text-center"
    style={{
      background: selected ? `${C.fire}18` : C.card,
      border: `1px solid ${selected ? C.fire : C.border}`,
      color: selected ? C.ink : C.inkMid,
    }}
  >
    {label}
  </button>
);

const GoalButton: React.FC<{ label: string; blurb: string; selected: boolean; onClick: () => void }> = ({ label, blurb, selected, onClick }) => (
  <button
    onClick={onClick}
    className="w-full rounded-2xl p-4 text-left transition-colors"
    style={{
      background: selected ? `${C.fire}15` : C.card,
      border: `1px solid ${selected ? C.fire : C.border}`,
    }}
  >
    <div className="text-[15px] font-bold" style={{ color: C.ink }}>{label}</div>
    <div className="text-[12px] mt-0.5" style={{ color: C.inkMid }}>{blurb}</div>
  </button>
);

const ChipButton: React.FC<{ label: string; selected: boolean; onClick: () => void }> = ({ label, selected, onClick }) => (
  <button
    onClick={onClick}
    className="px-3.5 py-2 rounded-full text-[12px] font-semibold transition-colors"
    style={{
      background: selected ? C.fire : C.card,
      border: `1px solid ${selected ? C.fire : C.border}`,
      color: selected ? '#fff' : C.inkMid,
    }}
  >
    {label}
  </button>
);

const DaysPicker: React.FC<{ selected: string[]; onToggle: (d: string) => void; color: string }> = ({ selected, onToggle, color }) => (
  <div className="grid grid-cols-7 gap-1.5 mt-2">
    {DAYS_OF_WEEK.map(d => {
      const isSel = selected.includes(d);
      return (
        <button
          key={d}
          onClick={() => onToggle(d)}
          className="py-3 rounded-xl text-[11px] font-bold uppercase tracking-widest transition-colors text-center"
          style={{
            background: isSel ? `${color}18` : C.card,
            border: `1px solid ${isSel ? color : C.border}`,
            color: isSel ? C.ink : C.inkLight,
          }}
        >
          {d.slice(0, 2)}
        </button>
      );
    })}
  </div>
);

export default Onboarding;
