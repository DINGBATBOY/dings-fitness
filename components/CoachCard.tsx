/**
 * CoachCard — the coach line at the top of the Fuel dashboard.
 *
 * Rule-based today (no AI needed): given the user's current context
 * (streak, remaining kcal, weight trend, protein avg, time of day, etc.),
 * we pick the single most relevant message from ~20 templates. The
 * priorities are set so the rarest / most-earned message wins — a
 * 7-day streak crosses the wire before a generic "half way there."
 *
 * Sky-blue accent establishes the cool color anchor for the "info" tier
 * of the palette (vs. fire for actions, emerald for success, protein for
 * warnings). Everything the Coach says is a *reflection* of the user's
 * data, so it deserves the info tint, not the action tint.
 */

import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { MessageSquare } from 'lucide-react';

// Palette matches FuelHome exactly so the card sits naturally in the tab.
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
  sky: '#6fa8c4',       // ← the cool anchor
  skyTint: 'rgba(111,168,196,0.10)',
  emerald: '#7ab896',
  protein: '#e3614a',
};

/**
 * All the data the coach needs to pick a message. Kept as one prop so
 * the caller (FuelHome) doesn't have to remember which fields matter —
 * either you pass a full context or you don't render the card.
 */
export interface CoachContext {
  /** Time-of-day greeting the app already computes ("Morning" / "Afternoon" / "Evening"). */
  greeting: string;
  firstName: string;
  /** Today's consumed macros. */
  consumed: { calories: number; protein: number };
  /** Today's targets. */
  targets: { calories: number; protein: number };
  /** Current streak length in days. */
  streak: number;
  /** Weight-tracking summary — same shape FuelHome already computes. */
  weightSummary?: {
    change?: number;         // signed lbs over the last ~7 days
    latest?: number;         // most recent weigh-in
    thisWeekCount?: number;  // number of check-ins this week
  };
  /** Days of food-logging in the last 7 days. Sets the confidence tier. */
  daysLoggedThisWeek: number;
  /** Weekly average protein (grams). Set to undefined if <3 days logged. */
  weeklyAvgProtein?: number;
  /** Optional goal target from onboarding. Used for milestone lines. */
  goalTargetWeight?: number;
}

interface CoachCardProps {
  context: CoachContext;
  className?: string;
}

export const CoachCard: React.FC<CoachCardProps> = ({ context, className = '' }) => {
  const { headline, body } = useMemo(() => pickCoachMessage(context), [context]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className={`rounded-3xl p-5 ${className}`}
      style={{
        background: C.card,
        border: `1px solid ${C.sky}30`,
        boxShadow: `inset 3px 0 0 ${C.sky}`,
      }}
      data-tour="coach-card"
    >
      <div className="flex items-center gap-2">
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center"
          style={{ background: C.skyTint, color: C.sky }}
        >
          <MessageSquare className="w-3 h-3" strokeWidth={2} />
        </div>
        <span
          className="text-[10px] uppercase tracking-[0.3em] font-bold"
          style={{ color: C.sky }}
        >
          Coach
        </span>
      </div>

      <h2
        className="text-xl font-bold tracking-tight leading-tight mt-3"
        style={{ color: C.ink }}
      >
        {headline}
      </h2>
      {body && (
        <p
          className="text-sm mt-1.5 leading-snug"
          style={{ color: C.inkMid }}
        >
          {body}
        </p>
      )}
    </motion.div>
  );
};

// ─────────────────────── Message picker ───────────────────────

/**
 * Pick the single best coach message for the current context.
 *
 * Priority order (highest → lowest):
 *   1. Weekly streak milestone (7, 14, 21...)
 *   2. Active streak ≥ 3 days
 *   3. Meaningful weight trend change (≥ 1 lb this week)
 *   4. Time-of-day + progress alignment
 *      • Morning + nothing logged → fresh-start line
 *      • Morning + already eating → early-riser line
 *      • Afternoon + between 40-65% → halfway-there line
 *      • Evening + within 150 kcal of target → almost-there line
 *      • Evening + slightly over → forgiving nudge
 *   5. Weekly protein consistency (≥ 4 days logged + hitting protein)
 *   6. Onboarding / empty state (< 2 days logged this week)
 *   7. Default fallback — literal calories remaining
 *
 * Every branch returns `{ headline, body }` so the card layout stays
 * consistent — headline is the greeting + name, body is the insight.
 */
export function pickCoachMessage(ctx: CoachContext): { headline: string; body?: string } {
  const {
    greeting,
    firstName,
    consumed,
    targets,
    streak,
    weightSummary,
    daysLoggedThisWeek,
    weeklyAvgProtein,
  } = ctx;

  const remaining = targets.calories - consumed.calories;
  const proteinRatio = targets.protein ? consumed.protein / targets.protein : 0;
  const nothingLoggedYet = consumed.calories === 0;
  const greetLower = greeting.toLowerCase();
  const isMorning   = greetLower.includes('morning');
  const isAfternoon = greetLower.includes('afternoon');
  const isEvening   = greetLower.includes('evening');
  const head = `${greeting}, ${firstName}.`;

  // 1. Weekly streak milestones
  if (streak > 0 && streak % 7 === 0) {
    return { headline: head, body: `${streak} days straight. Serious rhythm.` };
  }
  // 2. Active streak
  if (streak >= 3) {
    return { headline: head, body: `${streak}-day streak. Same time tomorrow?` };
  }

  // 3. Meaningful weight trend
  if (weightSummary?.change !== undefined && Math.abs(weightSummary.change) >= 1) {
    const abs = Math.abs(weightSummary.change).toFixed(1);
    if (weightSummary.change < 0) {
      return { headline: head, body: `↓ ${abs} lbs this week. Trending the right way.` };
    }
    return { headline: head, body: `↑ ${abs} lbs this week — up is good if you're bulking.` };
  }

  // 3b. Goal-distance line — cheap, always relevant when we have a target.
  //     Rounds to whole lbs so we don't say "6.3 lbs away."
  if (ctx.goalTargetWeight && weightSummary?.latest) {
    const distance = Math.round(Math.abs(weightSummary.latest - ctx.goalTargetWeight));
    if (distance >= 1) {
      const direction = weightSummary.latest > ctx.goalTargetWeight ? 'from' : 'above';
      return { headline: head, body: `You're ${distance} lb${distance === 1 ? '' : 's'} ${direction} your goal.` };
    }
  }

  // 4a. Evening + close to target (under)
  if (isEvening && remaining >= 0 && remaining <= 200) {
    return { headline: head, body: `${remaining} calorie${remaining === 1 ? '' : 's'} from target. Close it out.` };
  }
  // 4b. Evening + slightly over (forgiving)
  if (isEvening && remaining < 0 && Math.abs(remaining) <= 300) {
    return { headline: head, body: `${Math.abs(remaining)} over. Nothing a walk can't fix — tomorrow's fresh.` };
  }
  // 4c. Afternoon + halfway there
  if (isAfternoon && !nothingLoggedYet && consumed.calories >= targets.calories * 0.4 && consumed.calories <= targets.calories * 0.65) {
    return { headline: head, body: `You're halfway there.` };
  }
  // 4d. Morning + fresh start
  if (isMorning && nothingLoggedYet) {
    return { headline: head, body: `Ready to fuel today?` };
  }
  // 4e. Morning + already eating
  if (isMorning && !nothingLoggedYet) {
    return { headline: head, body: `Early start. Let's ride.` };
  }

  // 5. Weekly protein consistency
  if (daysLoggedThisWeek >= 4 && proteinRatio >= 0.9) {
    const avgText = weeklyAvgProtein ? `${Math.round(weeklyAvgProtein)}g protein` : 'protein';
    return { headline: head, body: `You've been averaging ${avgText} this week. Keep it up.` };
  }

  // 6. Empty state — new users, or a rough patch
  if (daysLoggedThisWeek < 2) {
    return { headline: head, body: `Log a couple more days and I'll start noticing your patterns.` };
  }

  // 7. Default — literal but honest
  if (remaining > 0) {
    return { headline: head, body: `${remaining} calorie${remaining === 1 ? '' : 's'} left today.` };
  }
  return { headline: head, body: `You're on target for today.` };
}

export default CoachCard;
