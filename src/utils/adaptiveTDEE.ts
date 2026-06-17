/**
 * Adaptive TDEE — weekly calorie target re-estimation.
 *
 * The "MacroFactor moat" applied to Ding!: the user's initial TDEE is a
 * formula-based estimate (Mifflin-St Jeor / Katch-McArdle). Reality
 * almost always differs by 5-15%. Once the user logs ~2 weeks of weight
 * data, we can back into their *actual* maintenance level by comparing
 * the calories they ate vs the weight they lost (or gained), and adjust
 * their target accordingly.
 *
 * The math:
 *   - 1 lb of body weight ≈ 3500 kcal (for fat; less for lean tissue)
 *   - Expected weight change over N days = (intake − TDEE) × N / 3500
 *   - Actual weight change comes from a moving-average of logged weights
 *     so we don't react to single-day fluid noise.
 *   - The delta between expected and actual tells us how far off the
 *     formula was. We absorb a fraction of that delta into the next
 *     week's TDEE estimate (smoothing — don't whipsaw the user).
 */

import type { DailyLog, UserProfile } from '../../types';

const KCAL_PER_LB = 3500;
// How much of the observed error we apply each week. 0.4 = 40% — fast
// enough to converge in ~3 weeks, slow enough to ignore single bad days.
const SMOOTHING = 0.4;

// Minimum data window for the math to be meaningful. <10 days of weight
// readings = noise dominates signal.
const MIN_DAYS_OF_WEIGHT = 10;

export interface AdaptiveResult {
  /** Whether we had enough data to compute anything. */
  hasEnoughData: boolean;
  /** The new suggested TDEE (kcal/day). undefined when hasEnoughData=false. */
  suggestedTdee?: number;
  /** Delta from the user's current formula-derived TDEE. */
  adjustmentKcal?: number;
  /** Net weight change observed in the window (lbs). Negative = loss. */
  weightDeltaLbs?: number;
  /** Days included in the trend window. */
  windowDays?: number;
  /** Average daily intake observed (kcal). */
  avgIntakeKcal?: number;
  /** Human-readable explanation for surfacing in the UI. */
  reason?: string;
}

/**
 * Compute a 7-day moving average for a series. Used to smooth out daily
 * weight fluctuations (water, sodium, glycogen) so we react to trend, not
 * noise.
 */
const movingAverage = (values: number[], window = 7): number[] => {
  if (values.length === 0) return [];
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = values.slice(start, i + 1);
    out.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  return out;
};

/**
 * Re-estimate the user's TDEE based on logged calorie intake + actual
 * weight change over the past ~2 weeks.
 *
 * Returns `hasEnoughData: false` early when there aren't enough weight
 * readings — caller should keep using the formula TDEE in that case.
 */
export const computeAdaptiveTDEE = (
  profile: UserProfile,
  dailyLogs: DailyLog[],
  currentFormulaTDEE: number,
): AdaptiveResult => {
  // Filter to logs with a real weight reading.
  const weighed = (dailyLogs || [])
    .filter(l => (l.weight || 0) > 50 && (l.weight || 0) < 700) // sanity range
    .map(l => ({
      date: new Date(l.date),
      weight: l.weight,
      calories: l.caloriesConsumed || 0,
      burn: l.caloriesBurned || 0,
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (weighed.length < MIN_DAYS_OF_WEIGHT) {
    return {
      hasEnoughData: false,
      reason: `Log weight on ${MIN_DAYS_OF_WEIGHT - weighed.length} more day${MIN_DAYS_OF_WEIGHT - weighed.length !== 1 ? 's' : ''} to enable adaptive targets.`,
    };
  }

  // Trend = compare last 7-day average to the 7-day average from ~14 days back.
  const N = weighed.length;
  const recent = weighed.slice(N - 7);
  const baseline = weighed.slice(Math.max(0, N - 14), N - 7);
  if (baseline.length < 3) {
    return {
      hasEnoughData: false,
      reason: 'Need ~2 weeks of weight logs to spot a trend.',
    };
  }

  const avgRecentWeight = recent.reduce((a, b) => a + b.weight, 0) / recent.length;
  const avgBaselineWeight = baseline.reduce((a, b) => a + b.weight, 0) / baseline.length;
  const weightDeltaLbs = avgRecentWeight - avgBaselineWeight;

  // How many days does that delta represent?
  const windowDays = Math.round(
    (recent[recent.length - 1].date.getTime() - baseline[0].date.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (windowDays < 7) {
    return {
      hasEnoughData: false,
      reason: 'Weight logs are too clustered to see a trend.',
    };
  }

  // Average daily NET intake (consumed minus activity burn) across the window.
  const recentWindow = weighed.slice(Math.max(0, N - windowDays));
  const dayCount = recentWindow.length;
  if (dayCount === 0) {
    return { hasEnoughData: false, reason: 'No log days in trend window.' };
  }
  const avgNetIntake =
    recentWindow.reduce((a, b) => a + (b.calories - b.burn), 0) / dayCount;
  const avgIntakeKcal = Math.round(
    recentWindow.reduce((a, b) => a + b.calories, 0) / dayCount,
  );

  // Inferred actual TDEE: if avgNetIntake > actualTDEE, you'd gain. We solve
  // for actualTDEE knowing the observed weight delta:
  //   weightDeltaLbs ≈ (avgNetIntake − actualTDEE) × windowDays / 3500
  // ⇒ actualTDEE = avgNetIntake − (weightDeltaLbs × 3500 / windowDays)
  const inferredTDEE = avgNetIntake - (weightDeltaLbs * KCAL_PER_LB) / windowDays;

  // Smooth toward the inferred value — don't snap.
  const suggestedTdee = Math.round(
    currentFormulaTDEE + (inferredTDEE - currentFormulaTDEE) * SMOOTHING,
  );
  const adjustmentKcal = suggestedTdee - currentFormulaTDEE;

  // Sanity guard: cap adjustments to ±400 kcal/day. Bigger than that and
  // something's wrong with the data — could be the user changed activity
  // level, got hurt, water-weight shift, etc. Don't compound errors.
  const cappedTdee =
    adjustmentKcal > 400
      ? currentFormulaTDEE + 400
      : adjustmentKcal < -400
        ? currentFormulaTDEE - 400
        : suggestedTdee;

  const reasonParts: string[] = [];
  if (Math.abs(adjustmentKcal) < 50) {
    reasonParts.push("Your formula target is on point — staying put.");
  } else if (adjustmentKcal > 0) {
    reasonParts.push(
      `Your weight ${weightDeltaLbs >= 0 ? "rose" : "barely moved"} by ${Math.abs(weightDeltaLbs).toFixed(1)} lb over ${windowDays} days while averaging ${avgIntakeKcal} kcal. Raising your target by ${Math.abs(cappedTdee - currentFormulaTDEE)} kcal.`,
    );
  } else {
    reasonParts.push(
      `Your weight ${weightDeltaLbs < 0 ? "dropped" : "barely moved"} by ${Math.abs(weightDeltaLbs).toFixed(1)} lb over ${windowDays} days while averaging ${avgIntakeKcal} kcal. Lowering your target by ${Math.abs(cappedTdee - currentFormulaTDEE)} kcal.`,
    );
  }

  return {
    hasEnoughData: true,
    suggestedTdee: cappedTdee,
    adjustmentKcal: cappedTdee - currentFormulaTDEE,
    weightDeltaLbs,
    windowDays,
    avgIntakeKcal,
    reason: reasonParts.join(' '),
  };
};
