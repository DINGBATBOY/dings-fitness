
import React from 'react';

export const DAYS_OF_WEEK = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
];

// ============================================================================
//  Admin
// ============================================================================
// Firebase UIDs that can view the token-usage admin dashboard.
// Find your UID in Firebase Console → Authentication → Users.
// Keep this list tight — admin sees all users' usage data.
//
// ALSO update functions/src/index.ts (isAdmin) and firestore.rules (isAdmin)
// with the same UID so server-side reads match.
export const ADMIN_UIDS: string[] = [
  'bYGcwJKlN2b4myugbVGNv8e4syO2',
];

export const isAdminUser = (uid: string | null | undefined): boolean =>
  !!uid && ADMIN_UIDS.includes(uid);

export const XP_PER_LEVEL_BASE = 100;


export const INITIAL_BODY_STATS = {
  chest: { level: 1, currentXP: 0, maxXP: 100 },
  back: { level: 1, currentXP: 0, maxXP: 100 },
  legs: { level: 1, currentXP: 0, maxXP: 100 },
  arms: { level: 1, currentXP: 0, maxXP: 100 },
  stamina: { level: 1, currentXP: 0, maxXP: 100 },
};

// Heuristic to map workout labels to muscle groups
export const GET_AFFECTED_MUSCLES = (label: string): string[] => {
  const l = label.toLowerCase();
  const muscles: string[] = [];

  if (l.includes('push') || l.includes('chest') || l.includes('upper')) {
    muscles.push('chest', 'arms');
  }
  if (l.includes('pull') || l.includes('back')) {
    muscles.push('back', 'arms');
  }
  if (l.includes('leg') || l.includes('lower')) {
    muscles.push('legs');
  }
  if (l.includes('arm') || l.includes('bicep') || l.includes('tricep')) {
    muscles.push('arms');
  }
  if (l.includes('hiit') || l.includes('cardio') || l.includes('conditioning') || l.includes('quick')) {
    muscles.push('stamina');
  }
  if (l.includes('full') || l.includes('total')) {
    muscles.push('chest', 'back', 'legs', 'arms');
  }

  // Default fallback if AI generates a unique name
  if (muscles.length === 0) {
      return ['stamina']; 
  }

  return [...new Set(muscles)]; // unique only
};

// ============================================================================
//  TDEE / BMR calculation
// ============================================================================
// We support two formulas depending on what data we have:
//
//   • Katch-McArdle (lean-mass based) — used when body fat percentage is
//     available and in a plausible range (5-60%). More accurate for users
//     whose body composition deviates from population averages (high body
//     fat, very lean, athletic builds). Formula: BMR = 370 + (21.6 × LBM_kg).
//
//   • Mifflin-St Jeor (weight only) — fallback for users who don't know
//     their body fat. Formula: 10×kg + 6.25×cm − 5×age + (sex offset).
//
// The Katch-McArdle path is what gives the app honest, non-discouraging
// targets for users whose weight alone misrepresents their metabolic rate.

const ACTIVITY_MULTIPLIERS: Record<string, number> = {
  'Sedentary': 1.2,
  'Lightly Active': 1.375,
  'Moderately Active': 1.55,
  'Very Active': 1.725,
  'Extra Active': 1.9,
};

export type BMRFormula = 'katch-mcardle' | 'mifflin-st-jeor';

export interface TDEEResult {
  tdee: number;            // Total Daily Energy Expenditure (kcal/day)
  bmr: number;             // Basal Metabolic Rate (kcal/day)
  formula: BMRFormula;     // Which equation produced this BMR
  lbmKg?: number;          // Lean body mass in kg (only set for Katch-McArdle)
  activityMultiplier: number;
}

export const calculateTDEEDetailed = (
  weight: number,        // lbs
  height: number,        // inches
  age: number,
  activityLevel: string,
  sex?: string,
  bodyFat?: number,      // optional — body fat %, e.g. 22 for 22%
): TDEEResult => {
  const weightKg = weight / 2.20462;
  const heightCm = height * 2.54;
  const isFemale = sex?.toLowerCase() === 'female';
  const activityMultiplier = ACTIVITY_MULTIPLIERS[activityLevel] || 1.2;

  let bmr: number;
  let formula: BMRFormula;
  let lbmKg: number | undefined;

  // Use Katch-McArdle only when bodyFat is provided AND in a plausible range.
  // Values outside 5-60% are almost certainly data-entry errors and would
  // produce unreliable LBM estimates, so we fall back to Mifflin-St Jeor.
  if (bodyFat !== undefined && bodyFat > 5 && bodyFat < 60) {
    lbmKg = weightKg * (1 - bodyFat / 100);
    bmr = 370 + (21.6 * lbmKg);
    formula = 'katch-mcardle';
  } else {
    bmr = (10 * weightKg) + (6.25 * heightCm) - (5 * age) + (isFemale ? -161 : 5);
    formula = 'mifflin-st-jeor';
  }

  return {
    tdee: Math.round(bmr * activityMultiplier),
    bmr: Math.round(bmr),
    formula,
    lbmKg,
    activityMultiplier,
  };
};

// Backward-compatible thin wrapper — existing call sites that only need the
// TDEE number can keep using this. New call sites that want to show "based on
// your body composition" trust signals should call calculateTDEEDetailed.
export const CALCULATE_TDEE = (
  weight: number,
  height: number,
  age: number,
  activityLevel: string,
  sex?: string,
  bodyFat?: number,
): number => {
  return calculateTDEEDetailed(weight, height, age, activityLevel, sex, bodyFat).tdee;
};

// ============================================================================
//  Safety floors
// ============================================================================
// Absolute minimum daily calories for unsupervised use. Based on common
// clinical guidance (ACSM, Mayo Clinic) for non-medically-supervised diets.
// We also cap the deficit at MIN_TDEE_FRACTION below TDEE — going lower than
// 75% of maintenance is where rebound, muscle loss, and metabolic adaptation
// start to dominate.
export const MIN_CALORIES_MALE = 1500;
export const MIN_CALORIES_FEMALE = 1200;
export const MIN_TDEE_FRACTION = 0.75; // Don't recommend below 75% of TDEE

export const getMinSafeCalories = (sex?: string, tdee?: number): number => {
  const isFemale = sex?.toLowerCase() === 'female';
  const absoluteFloor = isFemale ? MIN_CALORIES_FEMALE : MIN_CALORIES_MALE;
  if (!tdee || tdee <= 0) return absoluteFloor;
  const tdeeFloor = Math.round(tdee * MIN_TDEE_FRACTION);
  // Use whichever is HIGHER — protects both small-frame and large-frame users.
  return Math.max(absoluteFloor, tdeeFloor);
};

// BMI helpers (input: lbs + inches). Used to flag at-risk users in onboarding.
export const getBMI = (weightLbs: number, heightInches: number): number => {
  if (!weightLbs || !heightInches) return 0;
  const weightKg = weightLbs / 2.20462;
  const heightM = (heightInches * 2.54) / 100;
  return weightKg / (heightM * heightM);
};

export type BMICategory =
  | 'severelyUnderweight' // < 16
  | 'underweight'         // 16 - 18.5
  | 'normal'              // 18.5 - 25
  | 'overweight'          // 25 - 30
  | 'obese'               // 30 - 40
  | 'severelyObese';      // 40+

export const getBMICategory = (bmi: number): BMICategory => {
  if (bmi < 16) return 'severelyUnderweight';
  if (bmi < 18.5) return 'underweight';
  if (bmi < 25) return 'normal';
  if (bmi < 30) return 'overweight';
  if (bmi < 40) return 'obese';
  return 'severelyObese';
};

export interface MacroResult {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  floorApplied: boolean;       // True if we clamped to the safety floor
  originalCalories: number;    // What the formula would've returned without clamping
  minSafeCalories: number;     // The floor we used
}

// Macro split presets — controls the carb/fat ratio of remaining calories
// (after protein). Each preset also gets a slight protein bump if appropriate.
//
//   • balanced       — 55% carbs / 45% fat (the original default)
//   • low-carb       — 30% carbs / 70% fat
//   • high-protein   — 60% carbs / 40% fat + bumped protein ratio
//   • keto           — 10% carbs / 90% fat (ketogenic — protein moderate)
export type MacroSplitMode = 'balanced' | 'low-carb' | 'high-protein' | 'keto';

interface SplitRules {
  carbFraction: number;
  fatFraction: number;
  /** Override on top of the goal-based protein ratio. */
  proteinBoost?: number;
}

const SPLIT_RULES: Record<MacroSplitMode, SplitRules> = {
  'balanced':      { carbFraction: 0.55, fatFraction: 0.45 },
  'low-carb':      { carbFraction: 0.30, fatFraction: 0.70 },
  'high-protein':  { carbFraction: 0.60, fatFraction: 0.40, proteinBoost: 0.15 },
  'keto':          { carbFraction: 0.10, fatFraction: 0.90 },
};

export const CALCULATE_MACROS = (
  tdee: number,
  goal: string,
  weightLbs: number,
  sex?: string,
  splitMode: MacroSplitMode = 'balanced',
): MacroResult => {
  let targetCalories = tdee;
  let proteinRatio = 0.85; // Default Lean/Athletic

  if (goal?.includes('Weight Loss')) {
      targetCalories = tdee - 600;
      proteinRatio = 0.85;
  } else if (goal?.includes('Body Recomposition') || goal?.includes('Recomp')) {
      targetCalories = tdee - 350;
      proteinRatio = 1.0;
  } else if (goal?.includes('Lean/Athletic')) {
      targetCalories = tdee - 300;
      proteinRatio = 0.85;
  } else if (goal?.includes('Bulk/Hypertrophy') || goal?.includes('Bulk')) {
      targetCalories = tdee + 300;
      proteinRatio = 0.9;
  } else if (goal?.includes('Performance')) {
      targetCalories = tdee - 100;
      proteinRatio = 0.9;
  } else {
      targetCalories = tdee - 300;
  }

  // Apply split-mode protein boost (e.g. high-protein mode adds 0.15 g/lb).
  const rules = SPLIT_RULES[splitMode] || SPLIT_RULES['balanced'];
  proteinRatio += rules.proteinBoost || 0;

  // SAFETY FLOOR: clamp to the higher of (sex-based absolute floor, 75% of TDEE).
  // This protects against unsafe deficits regardless of how aggressive the
  // user's goal is. We track whether we clamped so the UI can surface it.
  const originalCalories = Math.round(targetCalories);
  const minSafeCalories = getMinSafeCalories(sex, tdee);
  const floorApplied = originalCalories < minSafeCalories;
  const finalCalories = floorApplied ? minSafeCalories : originalCalories;

  const protein = Math.round(weightLbs * proteinRatio);
  const proteinCalories = protein * 4;
  const remainingCalories = Math.max(0, finalCalories - proteinCalories);

  const carbs = Math.max(0, Math.round((remainingCalories * rules.carbFraction) / 4));
  const fat = Math.max(0, Math.round((remainingCalories * rules.fatFraction) / 9));

  return {
    calories: finalCalories,
    protein,
    carbs,
    fat,
    floorApplied,
    originalCalories,
    minSafeCalories,
  };
};
