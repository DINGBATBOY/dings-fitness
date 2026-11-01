/**
 * Daily targets from a profile, computed on the device (audit NUT-02).
 *
 * Onboarding used to ask Gemini to do this arithmetic, with rules that
 * differed from CALCULATE_MACROS, so a user's targets jumped the first time
 * they saved Edit Profile. Every path (onboarding, Edit Profile, the
 * dashboard fallback, adaptive TDEE) now goes through CALCULATE_MACROS, and
 * onboarding sends nothing to an AI provider (the consent sheet comes later).
 */
import { CALCULATE_MACROS, calculateTDEEDetailed, type GoalTimeline, type MacroResult, type MacroSplitMode } from '../constants';
import { ActivityLevel, PhysiqueGoal } from '../types';

export interface StarterProfile {
  name?: string;
  weight?: number;
  height?: number;
  age?: number;
  sex?: string;
  bodyFat?: number;
  inBodyData?: { pbf?: number };
  activityLevel?: string;
  goal?: string;
  macroSplit?: string;
  goalTargetWeight?: number;
  goalTargetDate?: string;
  goalPace?: string;
}

/**
 * The GoalTimeline every CALCULATE_MACROS call builds from a profile
 * (onboarding, Edit Profile, the dashboard fallback, adaptive TDEE), so the
 * pace and goal weight count the same everywhere.
 */
export function timelineFor(p: Pick<StarterProfile, 'goalTargetWeight' | 'goalTargetDate' | 'goalPace'> | null | undefined): GoalTimeline | undefined {
  if (!p || (!p.goalTargetWeight && !p.goalPace)) return undefined;
  return {
    targetWeightLbs: p.goalTargetWeight || undefined,
    targetDate: p.goalTargetDate || undefined,
    pace: (p.goalPace as GoalTimeline['pace']) || undefined,
  };
}

export interface StarterTargets extends MacroResult {
  tdee: number;
  bmr: number;
}

/** Same inputs, same answer as Edit Profile: CALCULATE_TDEE + CALCULATE_MACROS. */
export function computeProfileTargets(p: StarterProfile): StarterTargets {
  const bf = p.inBodyData?.pbf ?? p.bodyFat;
  const weight = p.weight || 150;
  const detail = calculateTDEEDetailed(
    weight,
    p.height || 70,
    p.age || 30,
    p.activityLevel || ActivityLevel.Light,
    p.sex || 'Male',
    bf,
  );
  const macros = CALCULATE_MACROS(
    detail.tdee,
    p.goal || PhysiqueGoal.Lean,
    weight,
    p.sex || 'Male',
    (p.macroSplit as MacroSplitMode) || 'balanced',
    timelineFor(p),
    bf,
  );
  return { ...macros, tdee: detail.tdee, bmr: detail.bmr };
}

/** The one-line note under the onboarding result. Written locally, no AI. */
export function starterCoachMessage(goal: string | undefined, t: Pick<StarterTargets, 'floorApplied' | 'calories' | 'tdee'>): string {
  if (t.floorApplied) return 'We kept you at a safe minimum. Steady progress beats fast progress.';
  const g = goal || '';
  if (g.includes('Bulk')) return 'A small surplus over your burn, with protein to build on.';
  if (g.includes('Performance')) return 'Close to what you burn, so you have fuel to perform.';
  if (g.includes('Weight Loss')) return 'A steady deficit you can actually keep up, with protein to protect muscle.';
  if (g.includes('Recomp')) return 'A gentle deficit with plenty of protein: lose fat, keep muscle.';
  if (g === 'Maintain') return 'Right around what you burn. Steady weight, room to live.';
  return 'Built from your stats and activity. It adjusts as you log.';
}
