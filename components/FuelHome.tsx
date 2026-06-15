/**
 * FuelHome — Cream/parchment-themed Home (Fuel tab) screen.
 *
 * Inspired by the Mati-Watsā mockup: warm cream background, Lucide line
 * icons in warm brown, large semi-circle "Daily Balance" ring as the hero.
 * Other tabs continue to use the Dusk Trail dark theme.
 *
 * Sections:
 *   1. Hero title with arrow underline (placeholder for future Hidatsa
 *      vocabulary — currently English "Daily Balance" until the user
 *      provides specific words).
 *   2. Daily Balance semi-circle ring (calories consumed vs target).
 *   3. Tracking — three cards for Protein / Carbs / Fat.
 *   4. Today's Movement — three cards for Workout / Burn / Water.
 *   5. My Track — Log meal quick-add + Reflect preview.
 *   6. Wrapped launcher when user has enough data.
 */

import React from 'react';
import {
  Feather, Beef, Wheat, Droplets, Dumbbell, Flame, Plus, ChevronRight,
  Bike, Footprints, MoreHorizontal,
} from 'lucide-react';
import type { UserProfile, NutritionTargets } from '../types';

// ───────────────────── Palette tokens ─────────────────────
// Single source of truth for the cream theme. Keep these in sync with
// Layout.tsx's `theme` block when activeTab='dashboard'.
const C = {
  bg: '#f5ede1',          // warm cream/parchment background
  card: '#ffffff',        // pure white card surface
  ink: '#3a2818',         // dark warm brown — primary text
  inkMid: '#7a6555',      // mid warm brown — secondary text
  inkLight: '#a09080',    // light warm brown — tertiary
  border: '#e8dcc5',      // soft beige line
  borderStrong: '#d4c3a0',
  terracotta: '#7a4a30',  // deeper terracotta for cream-theme accents
  ochre: '#b88860',       // softer ochre on cream
  sage: '#7a9080',        // calm green secondary
  fire: '#d97757',        // shared with Dusk Trail (consistency)
};

interface FuelHomeProps {
  profile: UserProfile;
  targets: NutritionTargets;
  consumed: { calories: number; protein: number; carbs: number; fat: number };
  activityBurn: number;
  waterIntake: number;
  workoutCompletedToday: boolean;
  streak: number;
  greeting: string;
  dateString: string;
  onQuickAddFood: () => void;
  onOpenReflect: () => void;
  /** Tap a quick-burn pill (Running / Weights / Cycling / etc.) to log kcal
   *  for that activity. The parent computes the actual kcal from MET + body
   *  weight; we just hand off the activity key + a sensible default minutes. */
  onLogActivity: (kind: 'running' | 'weights' | 'cycling' | 'walking', minutes: number) => void;
  /** Opens the full activity modal for HIIT / Yoga / Manual entries. */
  onOpenActivityModal: () => void;
  hasEnoughDataForWrapped: boolean;
}

export const FuelHome: React.FC<FuelHomeProps> = ({
  profile,
  targets,
  consumed,
  activityBurn,
  waterIntake,
  workoutCompletedToday,
  streak,
  greeting,
  dateString,
  onQuickAddFood,
  onOpenReflect,
  onLogActivity,
  onOpenActivityModal,
  hasEnoughDataForWrapped,
}) => {
  const firstName = (profile.name || 'Warrior').split(' ')[0];

  // ───────────────────── Ring math ─────────────────────
  // Semi-circle (half donut) showing calorie progress. We draw it with two
  // overlapping SVG arcs: a track (full) and a progress (clipped to ratio).
  const calRatio = Math.max(0, Math.min(1, consumed.calories / Math.max(1, targets.calories)));
  const remainingCal = Math.max(0, targets.calories - consumed.calories);

  // Water target ~0.5oz per lb body weight, capped at 100oz.
  const waterTarget = Math.max(48, Math.min(100, Math.round((profile.weight || 150) * 0.5)));

  return (
    <div className="pb-20 -mx-4 px-4" style={{ background: C.bg, color: C.ink }}>
      {/* ─────── Hero greeting ─────── */}
      <div className="px-1 pt-1 pb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.3em] font-medium" style={{ color: C.inkLight }}>{dateString}</p>
          <h2 className="text-xl font-medium tracking-tight mt-1 leading-tight" style={{ color: C.inkMid }}>
            {greeting},
          </h2>
          <h1 className="text-3xl font-bold tracking-tight truncate leading-tight" style={{ color: C.ink }}>
            {firstName}
          </h1>
        </div>
        {streak >= 2 && (
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full shrink-0 self-start mt-1"
            style={{ background: `${C.fire}1a`, border: `1px solid ${C.fire}40` }}
          >
            <Feather className="w-3.5 h-3.5" strokeWidth={1.5} style={{ color: C.terracotta }} />
            <span
              className="text-[10px] font-bold tracking-widest uppercase tabular-nums"
              style={{ color: C.terracotta }}
            >
              {streak}-day trail
            </span>
          </div>
        )}
      </div>

      {/* ─────── Section title with arrow underline ─────── */}
      <SectionTitle label="Daily Balance" />

      {/* ─────── Daily Balance ring ─────── */}
      <div className="flex flex-col items-center mt-2 mb-4">
        <CalorieRing
          consumed={consumed.calories}
          target={targets.calories}
          ratio={calRatio}
          remaining={remainingCal}
        />
      </div>

      {/* ─────── Tracking ─────── */}
      <SectionTitle label="Tracking" small />
      <div className="grid grid-cols-3 gap-2.5 mt-2">
        <TrackingCard
          icon={<Beef className="w-5 h-5" strokeWidth={1.5} style={{ color: C.terracotta }} />}
          label="Protein"
          current={consumed.protein}
          target={targets.protein}
          unit="g"
        />
        <TrackingCard
          icon={<Wheat className="w-5 h-5" strokeWidth={1.5} style={{ color: C.ochre }} />}
          label="Carbs"
          current={consumed.carbs}
          target={targets.carbs}
          unit="g"
        />
        <TrackingCard
          icon={<Flame className="w-5 h-5" strokeWidth={1.5} style={{ color: C.fire }} />}
          label="Fat"
          current={consumed.fat}
          target={targets.fat}
          unit="g"
        />
      </div>

      {/* ─────── Today's Movement ─────── */}
      <div className="mt-6">
        <SectionTitle label="Today's Movement" small />
        <div className="grid grid-cols-3 gap-2.5 mt-2">
          <MovementCard
            icon={<Dumbbell className="w-5 h-5" strokeWidth={1.5} style={{ color: C.terracotta }} />}
            label="Workout"
            value={workoutCompletedToday ? 'Done' : '—'}
            sublabel={workoutCompletedToday ? 'session logged' : 'not yet'}
          />
          <MovementCard
            icon={<Flame className="w-5 h-5" strokeWidth={1.5} style={{ color: C.fire }} />}
            label="Burn"
            value={`${activityBurn}`}
            sublabel="kcal · today"
          />
          <MovementCard
            icon={<Droplets className="w-5 h-5" strokeWidth={1.5} style={{ color: C.sage }} />}
            label="Water"
            value={`${waterIntake}`}
            sublabel={`/ ${waterTarget} oz`}
          />
        </div>

        {/* Quick-log activity row — tap a pill to instantly add ~30 min of
            that activity's calorie burn. Parent computes the real kcal from
            MET + body weight; the "Other" pill opens the full modal for
            HIIT / Yoga / Manual entries. */}
        <div className="flex gap-1.5 mt-2.5 overflow-x-auto pb-1 scrollbar-hide">
          <QuickBurnPill
            label="Run"
            icon={<Footprints className="w-3.5 h-3.5" strokeWidth={1.5} />}
            onClick={() => onLogActivity('running', 30)}
          />
          <QuickBurnPill
            label="Lift"
            icon={<Dumbbell className="w-3.5 h-3.5" strokeWidth={1.5} />}
            onClick={() => onLogActivity('weights', 30)}
          />
          <QuickBurnPill
            label="Bike"
            icon={<Bike className="w-3.5 h-3.5" strokeWidth={1.5} />}
            onClick={() => onLogActivity('cycling', 30)}
          />
          <QuickBurnPill
            label="Walk"
            icon={<Footprints className="w-3.5 h-3.5" strokeWidth={1.5} />}
            onClick={() => onLogActivity('walking', 30)}
          />
          <QuickBurnPill
            label="Other"
            icon={<MoreHorizontal className="w-3.5 h-3.5" strokeWidth={1.5} />}
            onClick={onOpenActivityModal}
            muted
          />
        </div>
      </div>

      {/* ─────── My Track ─────── */}
      <div className="mt-6">
        <SectionTitle label="My Track" small />
        <div className="grid grid-cols-2 gap-2.5 mt-2">
          {/* Log meal — quick-add CTA */}
          <button
            onClick={onQuickAddFood}
            className="rounded-2xl text-left transition-all active:scale-[0.98] overflow-hidden"
            style={{ background: C.card, border: `1px solid ${C.border}` }}
          >
            <div className="p-4 flex flex-col items-start gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ background: C.fire }}
              >
                <Plus className="w-5 h-5 text-white" strokeWidth={2} />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.25em] font-bold" style={{ color: C.inkLight }}>
                  Meals
                </div>
                <div className="text-[15px] font-bold mt-0.5" style={{ color: C.ink }}>
                  Log a meal
                </div>
                <div className="text-[10px] mt-0.5" style={{ color: C.inkMid }}>
                  Quick add to today
                </div>
              </div>
            </div>
          </button>

          {/* Reflect preview */}
          <button
            onClick={onOpenReflect}
            disabled={!hasEnoughDataForWrapped}
            className="rounded-2xl text-left transition-all active:scale-[0.98] overflow-hidden disabled:opacity-60"
            style={{ background: C.card, border: `1px solid ${C.border}` }}
          >
            <div className="p-4 flex flex-col items-start gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ background: `${C.terracotta}15` }}
              >
                <Feather className="w-5 h-5" strokeWidth={1.5} style={{ color: C.terracotta }} />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.25em] font-bold" style={{ color: C.inkLight }}>
                  Reflect
                </div>
                <div className="text-[15px] font-bold mt-0.5" style={{ color: C.ink }}>
                  Your trail
                </div>
                <div className="text-[10px] mt-0.5" style={{ color: C.inkMid }}>
                  {hasEnoughDataForWrapped ? 'Week & month recap' : 'Log a few more days'}
                </div>
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* ─────── Wrapped launcher (when ready) ─────── */}
      {hasEnoughDataForWrapped && (
        <button
          onClick={onOpenReflect}
          className="w-full mt-5 rounded-2xl text-left overflow-hidden relative transition-all active:scale-[0.99]"
          style={{
            background: `linear-gradient(135deg, ${C.fire}15, ${C.ochre}10)`,
            border: `1px solid ${C.fire}30`,
          }}
        >
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: C.fire }}>
              <Feather className="w-5 h-5 text-white" strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-[0.25em] font-bold" style={{ color: C.terracotta }}>
                Your Wrapped
              </div>
              <div className="text-[14px] font-bold mt-0.5" style={{ color: C.ink }}>
                See your week, recapped
              </div>
            </div>
            <ChevronRight className="w-5 h-5" strokeWidth={1.5} style={{ color: C.inkMid }} />
          </div>
        </button>
      )}

      <p className="text-center text-[9px] mt-8 uppercase tracking-[0.3em]" style={{ color: C.inkLight }}>
        Dings Fitness OS v2.1
      </p>
    </div>
  );
};

// ──────────────────────── Sub-components ────────────────────────

const SectionTitle: React.FC<{ label: string; small?: boolean }> = ({ label, small }) => (
  <div className="flex flex-col items-center my-2">
    <h3
      className={`font-bold tracking-tight ${small ? 'text-base' : 'text-2xl'} uppercase`}
      style={{
        color: C.ink,
        letterSpacing: small ? '0.05em' : '0.08em',
        fontFamily: small ? 'inherit' : "'Orbitron', sans-serif",
      }}
    >
      {label}
    </h3>
    {/* Arrow underline — straight line + arrow head, evokes the mockup */}
    <svg width={small ? "80" : "140"} height="8" viewBox="0 0 140 8" className="mt-1">
      <line x1="6" y1="4" x2="128" y2="4" stroke={C.terracotta} strokeWidth="1.5" strokeLinecap="round" />
      <polyline points="124,1 130,4 124,7" fill="none" stroke={C.terracotta} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="6" cy="4" r="1.5" fill={C.terracotta} />
    </svg>
  </div>
);

const CalorieRing: React.FC<{
  consumed: number;
  target: number;
  ratio: number;
  remaining: number;
}> = ({ consumed, target, ratio, remaining }) => {
  // Semi-circle math: 180° arc, radius 90, total path length ≈ π·r ≈ 283.
  const r = 90;
  const cx = 110, cy = 100;
  const circumference = Math.PI * r;
  const dashOffset = circumference * (1 - ratio);

  // Sage "remaining" partial arc — visual cue for what's left.
  const remainingRatio = Math.max(0, 1 - ratio);
  const sageOffset = circumference * (1 - remainingRatio);

  return (
    <div className="relative" style={{ width: 220, height: 130 }}>
      <svg width={220} height={130} viewBox="0 0 220 130">
        {/* Background track */}
        <path
          d={`M 20 100 A ${r} ${r} 0 0 1 200 100`}
          fill="none"
          stroke={C.border}
          strokeWidth="14"
          strokeLinecap="round"
        />
        {/* Progress (terracotta) */}
        <path
          d={`M 20 100 A ${r} ${r} 0 0 1 200 100`}
          fill="none"
          stroke={C.fire}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pt-3">
        <div className="text-4xl font-bold tabular-nums" style={{ color: C.ink }}>
          {Math.round(consumed)}
        </div>
        <div className="text-[11px] mt-0.5 tabular-nums" style={{ color: C.inkMid }}>
          / {target.toLocaleString()} kcal
        </div>
        {remaining > 0 && (
          <div className="text-[10px] mt-1 tabular-nums" style={{ color: C.sage }}>
            {Math.round(remaining)} left
          </div>
        )}
      </div>
    </div>
  );
};

const TrackingCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  current: number;
  target: number;
  unit: string;
}> = ({ icon, label, current, target, unit }) => (
  <div
    className="rounded-2xl p-3 flex flex-col items-center text-center"
    style={{ background: C.card, border: `1px solid ${C.border}` }}
  >
    <div className="text-[9px] uppercase tracking-[0.2em] font-bold" style={{ color: C.inkMid }}>{label}</div>
    <div className="my-2">{icon}</div>
    <div className="text-[11px] font-bold tabular-nums" style={{ color: C.ink }}>
      {Math.round(current)}{unit}
    </div>
    <div className="text-[9px] tabular-nums" style={{ color: C.inkLight }}>
      of {Math.round(target)}{unit}
    </div>
  </div>
);

const MovementCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  sublabel: string;
}> = ({ icon, label, value, sublabel }) => (
  <div
    className="rounded-2xl p-3 flex flex-col items-center text-center"
    style={{ background: C.card, border: `1px solid ${C.border}` }}
  >
    <div className="my-1">{icon}</div>
    <div className="text-[9px] uppercase tracking-[0.2em] font-bold mt-1" style={{ color: C.inkMid }}>{label}</div>
    <div className="text-[15px] font-bold tabular-nums mt-1" style={{ color: C.ink }}>{value}</div>
    <div className="text-[9px] mt-0.5" style={{ color: C.inkLight }}>{sublabel}</div>
  </div>
);

const QuickBurnPill: React.FC<{
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  muted?: boolean;
}> = ({ label, icon, onClick, muted }) => (
  <button
    onClick={onClick}
    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-widest shrink-0 transition-all active:scale-95"
    style={{
      background: muted ? C.bg : C.fire,
      color: muted ? C.inkMid : '#fff',
      border: muted ? `1px solid ${C.border}` : `1px solid ${C.fire}`,
    }}
  >
    {icon}
    {label}
  </button>
);

export default FuelHome;
