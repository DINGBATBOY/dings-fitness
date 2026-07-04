/**
 * MuscleMapHero — anatomical body diagram for the Workouts tab.
 *
 * Front + back views, toggle at top. Muscle groups fill in fire orange
 * when the day's workout targets them (primary — full opacity + glow), or
 * in muted amber (secondary — synergist / stabilizer). Non-targeted
 * muscles stay in the base dark tone so the active ones read at a glance.
 *
 * Muscle keys are defined in constants.tsx (MuscleKey). Each key
 * corresponds to a single <path> below — adding a new muscle group means
 * drawing its path here AND wiring it into GET_MUSCLE_ACTIVATION.
 */

import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { MuscleKey, MuscleActivation } from '../constants';

interface MuscleMapHeroProps {
  activation: MuscleActivation;
  className?: string;
  /** Optional forced view. If unset the component owns its own toggle. */
  view?: 'front' | 'back';
}

const C = {
  bodyFill: '#221d19',           // silhouette base
  bodyStroke: 'rgba(255,255,255,0.06)',
  muscleBase: '#2b241f',         // slightly lighter than body, defines groups
  muscleStroke: 'rgba(255,237,225,0.08)',
  primary: '#d97757',            // fire — hit hard today
  primaryGlow: 'rgba(217,119,87,0.35)',
  secondary: '#e8a85a',          // ochre — synergist
  ink: '#f5ede1',
  inkMid: '#c4b8a4',
  inkLight: '#8b7e6e',
  card: '#1d1815',
  border: 'rgba(255,255,255,0.06)',
};

export const MuscleMapHero: React.FC<MuscleMapHeroProps> = ({ activation, className = '', view: forcedView }) => {
  const [internalView, setInternalView] = useState<'front' | 'back'>('front');
  const view = forcedView ?? internalView;

  const isPrimary   = (k: MuscleKey) => activation.primary.includes(k);
  const isSecondary = (k: MuscleKey) => activation.secondary.includes(k);
  const fillFor = (k: MuscleKey) =>
    isPrimary(k)   ? C.primary
    : isSecondary(k) ? C.secondary
    : C.muscleBase;
  const opacityFor = (k: MuscleKey) =>
    isPrimary(k)   ? 0.95
    : isSecondary(k) ? 0.55
    : 1;

  // Muscles active in the CURRENTLY-VISIBLE view — used to size the count
  // shown in the corner. Prevents "8 muscles active" from being confusing
  // when only 2 are visible on the current side.
  const visibleActiveCount = useMemo(() => {
    const frontKeys: MuscleKey[] = ['chest','delts_ant','biceps','forearm_ant','abs','obliques','quads','calf_ant'];
    const backKeys:  MuscleKey[] = ['traps','delts_post','triceps','forearm_post','lats','mid_back','lower_back','glutes','hamstrings','calves'];
    const set = view === 'front' ? frontKeys : backKeys;
    return set.filter(k => isPrimary(k) || isSecondary(k)).length;
  }, [view, activation]);

  return (
    <div className={className}>
      {/* Front/back toggle + active count */}
      {!forcedView && (
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="flex p-0.5 rounded-full" style={{ background: C.card, border: `1px solid ${C.border}` }}>
            {(['front', 'back'] as const).map(v => (
              <button
                key={v}
                onClick={() => setInternalView(v)}
                className="px-3.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest transition-colors"
                style={{
                  background: view === v ? C.ink : 'transparent',
                  color: view === v ? C.card : C.inkLight,
                }}
              >
                {v}
              </button>
            ))}
          </div>
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold" style={{ color: C.inkLight }}>
            <span className="tabular-nums" style={{ color: C.primary }}>{visibleActiveCount}</span>
            <span> muscle{visibleActiveCount === 1 ? '' : 's'} active</span>
          </div>
        </div>
      )}

      {/* Body diagram */}
      <div className="relative flex items-center justify-center">
        <AnimatePresence mode="wait">
          <motion.svg
            key={view}
            viewBox="0 0 200 400"
            width="100%"
            className="max-w-[280px] mx-auto"
            initial={{ opacity: 0, rotateY: forcedView ? 0 : (view === 'front' ? -20 : 20) }}
            animate={{ opacity: 1, rotateY: 0 }}
            exit={{ opacity: 0, rotateY: view === 'front' ? 20 : -20 }}
            transition={{ duration: 0.3 }}
            style={{ transformStyle: 'preserve-3d' }}
          >
            {view === 'front' ? (
              <FrontView fillFor={fillFor} opacityFor={opacityFor} isPrimary={isPrimary} />
            ) : (
              <BackView fillFor={fillFor} opacityFor={opacityFor} isPrimary={isPrimary} />
            )}
          </motion.svg>
        </AnimatePresence>
      </div>
    </div>
  );
};

// ──────────────────── Front view ────────────────────

interface ViewProps {
  fillFor: (k: MuscleKey) => string;
  opacityFor: (k: MuscleKey) => number;
  isPrimary: (k: MuscleKey) => boolean;
}

const glow = (color: string) => `drop-shadow(0 0 6px ${color})`;

const FrontView: React.FC<ViewProps> = ({ fillFor, opacityFor, isPrimary }) => (
  <>
    {/* ─── Body silhouette (base layer) ─── */}
    {/* Head */}
    <ellipse cx="100" cy="35" rx="22" ry="26" fill={C.bodyFill} stroke={C.bodyStroke} strokeWidth="1" />
    {/* Neck */}
    <path d="M 88 58 L 88 72 L 112 72 L 112 58 Z" fill={C.bodyFill} stroke={C.bodyStroke} strokeWidth="1" />
    {/* Torso silhouette (trapezoidal — broad shoulders down to waist) */}
    <path
      d="M 60 75
         Q 55 78 52 90
         L 45 130
         Q 42 165 55 190
         Q 62 210 75 215
         L 125 215
         Q 138 210 145 190
         Q 158 165 155 130
         L 148 90
         Q 145 78 140 75
         Z"
      fill={C.bodyFill}
      stroke={C.bodyStroke}
      strokeWidth="1"
    />
    {/* Upper arms silhouette */}
    <path d="M 45 90 Q 40 120 42 155 Q 45 175 55 180 L 62 175 Q 62 145 60 105 Z" fill={C.bodyFill} stroke={C.bodyStroke} strokeWidth="1" />
    <path d="M 155 90 Q 160 120 158 155 Q 155 175 145 180 L 138 175 Q 138 145 140 105 Z" fill={C.bodyFill} stroke={C.bodyStroke} strokeWidth="1" />
    {/* Forearms silhouette */}
    <path d="M 42 158 Q 38 195 40 235 L 55 235 Q 57 200 55 178 Z" fill={C.bodyFill} stroke={C.bodyStroke} strokeWidth="1" />
    <path d="M 158 158 Q 162 195 160 235 L 145 235 Q 143 200 145 178 Z" fill={C.bodyFill} stroke={C.bodyStroke} strokeWidth="1" />
    {/* Hips */}
    <path d="M 65 210 Q 60 220 65 240 L 100 245 L 135 240 Q 140 220 135 210 Z" fill={C.bodyFill} stroke={C.bodyStroke} strokeWidth="1" />
    {/* Thighs */}
    <path d="M 65 240 Q 60 280 68 325 L 92 325 Q 96 285 95 240 Z" fill={C.bodyFill} stroke={C.bodyStroke} strokeWidth="1" />
    <path d="M 135 240 Q 140 280 132 325 L 108 325 Q 104 285 105 240 Z" fill={C.bodyFill} stroke={C.bodyStroke} strokeWidth="1" />
    {/* Lower legs */}
    <path d="M 68 325 Q 65 360 72 388 L 92 388 Q 94 355 92 325 Z" fill={C.bodyFill} stroke={C.bodyStroke} strokeWidth="1" />
    <path d="M 132 325 Q 135 360 128 388 L 108 388 Q 106 355 108 325 Z" fill={C.bodyFill} stroke={C.bodyStroke} strokeWidth="1" />

    {/* ─── Muscle overlays ─── */}
    {/* Anterior deltoids */}
    <path
      d="M 60 78 Q 52 82 50 100 Q 55 108 65 105 Q 72 92 68 78 Z"
      fill={fillFor('delts_ant')} opacity={opacityFor('delts_ant')}
      stroke={C.muscleStroke} strokeWidth="0.6"
      style={{ filter: isPrimary('delts_ant') ? glow(C.primaryGlow) : undefined }}
    />
    <path
      d="M 140 78 Q 148 82 150 100 Q 145 108 135 105 Q 128 92 132 78 Z"
      fill={fillFor('delts_ant')} opacity={opacityFor('delts_ant')}
      stroke={C.muscleStroke} strokeWidth="0.6"
      style={{ filter: isPrimary('delts_ant') ? glow(C.primaryGlow) : undefined }}
    />

    {/* Chest (pecs) — two teardrops meeting at sternum */}
    <path
      d="M 72 82 Q 68 88 70 105 Q 78 130 96 130 Q 100 125 100 108 Q 98 90 92 82 Z"
      fill={fillFor('chest')} opacity={opacityFor('chest')}
      stroke={C.muscleStroke} strokeWidth="0.6"
      style={{ filter: isPrimary('chest') ? glow(C.primaryGlow) : undefined }}
    />
    <path
      d="M 128 82 Q 132 88 130 105 Q 122 130 104 130 Q 100 125 100 108 Q 102 90 108 82 Z"
      fill={fillFor('chest')} opacity={opacityFor('chest')}
      stroke={C.muscleStroke} strokeWidth="0.6"
      style={{ filter: isPrimary('chest') ? glow(C.primaryGlow) : undefined }}
    />

    {/* Biceps — inside of upper arm */}
    <path
      d="M 48 105 Q 45 130 50 155 Q 58 158 62 150 Q 62 125 60 105 Z"
      fill={fillFor('biceps')} opacity={opacityFor('biceps')}
      stroke={C.muscleStroke} strokeWidth="0.6"
      style={{ filter: isPrimary('biceps') ? glow(C.primaryGlow) : undefined }}
    />
    <path
      d="M 152 105 Q 155 130 150 155 Q 142 158 138 150 Q 138 125 140 105 Z"
      fill={fillFor('biceps')} opacity={opacityFor('biceps')}
      stroke={C.muscleStroke} strokeWidth="0.6"
      style={{ filter: isPrimary('biceps') ? glow(C.primaryGlow) : undefined }}
    />

    {/* Forearms (front) */}
    <path
      d="M 44 162 Q 40 195 44 228 L 54 228 Q 56 200 54 162 Z"
      fill={fillFor('forearm_ant')} opacity={opacityFor('forearm_ant')}
      stroke={C.muscleStroke} strokeWidth="0.6"
      style={{ filter: isPrimary('forearm_ant') ? glow(C.primaryGlow) : undefined }}
    />
    <path
      d="M 156 162 Q 160 195 156 228 L 146 228 Q 144 200 146 162 Z"
      fill={fillFor('forearm_ant')} opacity={opacityFor('forearm_ant')}
      stroke={C.muscleStroke} strokeWidth="0.6"
      style={{ filter: isPrimary('forearm_ant') ? glow(C.primaryGlow) : undefined }}
    />

    {/* Abs — 3 rows of 2 blocks (6-pack) */}
    {[0, 1, 2].map(row => (
      <React.Fragment key={row}>
        <rect
          x="86" y={135 + row * 20}
          width="12" height="15" rx="3"
          fill={fillFor('abs')} opacity={opacityFor('abs')}
          stroke={C.muscleStroke} strokeWidth="0.6"
          style={{ filter: isPrimary('abs') ? glow(C.primaryGlow) : undefined }}
        />
        <rect
          x="102" y={135 + row * 20}
          width="12" height="15" rx="3"
          fill={fillFor('abs')} opacity={opacityFor('abs')}
          stroke={C.muscleStroke} strokeWidth="0.6"
          style={{ filter: isPrimary('abs') ? glow(C.primaryGlow) : undefined }}
        />
      </React.Fragment>
    ))}

    {/* Obliques */}
    <path
      d="M 70 140 Q 65 165 68 195 L 82 190 Q 80 165 82 140 Z"
      fill={fillFor('obliques')} opacity={opacityFor('obliques')}
      stroke={C.muscleStroke} strokeWidth="0.6"
      style={{ filter: isPrimary('obliques') ? glow(C.primaryGlow) : undefined }}
    />
    <path
      d="M 130 140 Q 135 165 132 195 L 118 190 Q 120 165 118 140 Z"
      fill={fillFor('obliques')} opacity={opacityFor('obliques')}
      stroke={C.muscleStroke} strokeWidth="0.6"
      style={{ filter: isPrimary('obliques') ? glow(C.primaryGlow) : undefined }}
    />

    {/* Quads — two large teardrops on thighs */}
    <path
      d="M 68 245 Q 63 285 71 320 L 90 320 Q 94 285 92 245 Z"
      fill={fillFor('quads')} opacity={opacityFor('quads')}
      stroke={C.muscleStroke} strokeWidth="0.6"
      style={{ filter: isPrimary('quads') ? glow(C.primaryGlow) : undefined }}
    />
    <path
      d="M 132 245 Q 137 285 129 320 L 110 320 Q 106 285 108 245 Z"
      fill={fillFor('quads')} opacity={opacityFor('quads')}
      stroke={C.muscleStroke} strokeWidth="0.6"
      style={{ filter: isPrimary('quads') ? glow(C.primaryGlow) : undefined }}
    />

    {/* Anterior calf (tibialis) — front lower leg */}
    <path
      d="M 76 328 Q 74 358 78 380 L 86 380 Q 88 355 86 328 Z"
      fill={fillFor('calf_ant')} opacity={opacityFor('calf_ant')}
      stroke={C.muscleStroke} strokeWidth="0.6"
      style={{ filter: isPrimary('calf_ant') ? glow(C.primaryGlow) : undefined }}
    />
    <path
      d="M 124 328 Q 126 358 122 380 L 114 380 Q 112 355 114 328 Z"
      fill={fillFor('calf_ant')} opacity={opacityFor('calf_ant')}
      stroke={C.muscleStroke} strokeWidth="0.6"
      style={{ filter: isPrimary('calf_ant') ? glow(C.primaryGlow) : undefined }}
    />
  </>
);

// ──────────────────── Back view ────────────────────

const BackView: React.FC<ViewProps> = ({ fillFor, opacityFor, isPrimary }) => (
  <>
    {/* ─── Body silhouette (same base shape, mirrored context) ─── */}
    <ellipse cx="100" cy="35" rx="22" ry="26" fill={C.bodyFill} stroke={C.bodyStroke} strokeWidth="1" />
    <path d="M 88 58 L 88 72 L 112 72 L 112 58 Z" fill={C.bodyFill} stroke={C.bodyStroke} strokeWidth="1" />
    <path
      d="M 60 75
         Q 55 78 52 90
         L 45 130
         Q 42 165 55 190
         Q 62 210 75 215
         L 125 215
         Q 138 210 145 190
         Q 158 165 155 130
         L 148 90
         Q 145 78 140 75
         Z"
      fill={C.bodyFill}
      stroke={C.bodyStroke}
      strokeWidth="1"
    />
    <path d="M 45 90 Q 40 120 42 155 Q 45 175 55 180 L 62 175 Q 62 145 60 105 Z" fill={C.bodyFill} stroke={C.bodyStroke} strokeWidth="1" />
    <path d="M 155 90 Q 160 120 158 155 Q 155 175 145 180 L 138 175 Q 138 145 140 105 Z" fill={C.bodyFill} stroke={C.bodyStroke} strokeWidth="1" />
    <path d="M 42 158 Q 38 195 40 235 L 55 235 Q 57 200 55 178 Z" fill={C.bodyFill} stroke={C.bodyStroke} strokeWidth="1" />
    <path d="M 158 158 Q 162 195 160 235 L 145 235 Q 143 200 145 178 Z" fill={C.bodyFill} stroke={C.bodyStroke} strokeWidth="1" />
    <path d="M 65 210 Q 60 220 65 240 L 100 245 L 135 240 Q 140 220 135 210 Z" fill={C.bodyFill} stroke={C.bodyStroke} strokeWidth="1" />
    <path d="M 65 240 Q 60 280 68 325 L 92 325 Q 96 285 95 240 Z" fill={C.bodyFill} stroke={C.bodyStroke} strokeWidth="1" />
    <path d="M 135 240 Q 140 280 132 325 L 108 325 Q 104 285 105 240 Z" fill={C.bodyFill} stroke={C.bodyStroke} strokeWidth="1" />
    <path d="M 68 325 Q 65 360 72 388 L 92 388 Q 94 355 92 325 Z" fill={C.bodyFill} stroke={C.bodyStroke} strokeWidth="1" />
    <path d="M 132 325 Q 135 360 128 388 L 108 388 Q 106 355 108 325 Z" fill={C.bodyFill} stroke={C.bodyStroke} strokeWidth="1" />

    {/* ─── Back muscle overlays ─── */}
    {/* Traps — inverted triangle from neck spreading to shoulders */}
    <path
      d="M 88 62 L 112 62 L 130 88 Q 100 96 70 88 Z"
      fill={fillFor('traps')} opacity={opacityFor('traps')}
      stroke={C.muscleStroke} strokeWidth="0.6"
      style={{ filter: isPrimary('traps') ? glow(C.primaryGlow) : undefined }}
    />

    {/* Posterior delts */}
    <path
      d="M 60 78 Q 52 82 50 100 Q 55 108 65 105 Q 72 92 68 78 Z"
      fill={fillFor('delts_post')} opacity={opacityFor('delts_post')}
      stroke={C.muscleStroke} strokeWidth="0.6"
      style={{ filter: isPrimary('delts_post') ? glow(C.primaryGlow) : undefined }}
    />
    <path
      d="M 140 78 Q 148 82 150 100 Q 145 108 135 105 Q 128 92 132 78 Z"
      fill={fillFor('delts_post')} opacity={opacityFor('delts_post')}
      stroke={C.muscleStroke} strokeWidth="0.6"
      style={{ filter: isPrimary('delts_post') ? glow(C.primaryGlow) : undefined }}
    />

    {/* Triceps — back of upper arm */}
    <path
      d="M 48 105 Q 45 130 50 155 Q 58 158 62 150 Q 62 125 60 105 Z"
      fill={fillFor('triceps')} opacity={opacityFor('triceps')}
      stroke={C.muscleStroke} strokeWidth="0.6"
      style={{ filter: isPrimary('triceps') ? glow(C.primaryGlow) : undefined }}
    />
    <path
      d="M 152 105 Q 155 130 150 155 Q 142 158 138 150 Q 138 125 140 105 Z"
      fill={fillFor('triceps')} opacity={opacityFor('triceps')}
      stroke={C.muscleStroke} strokeWidth="0.6"
      style={{ filter: isPrimary('triceps') ? glow(C.primaryGlow) : undefined }}
    />

    {/* Forearms back */}
    <path
      d="M 44 162 Q 40 195 44 228 L 54 228 Q 56 200 54 162 Z"
      fill={fillFor('forearm_post')} opacity={opacityFor('forearm_post')}
      stroke={C.muscleStroke} strokeWidth="0.6"
      style={{ filter: isPrimary('forearm_post') ? glow(C.primaryGlow) : undefined }}
    />
    <path
      d="M 156 162 Q 160 195 156 228 L 146 228 Q 144 200 146 162 Z"
      fill={fillFor('forearm_post')} opacity={opacityFor('forearm_post')}
      stroke={C.muscleStroke} strokeWidth="0.6"
      style={{ filter: isPrimary('forearm_post') ? glow(C.primaryGlow) : undefined }}
    />

    {/* Lats — big wing shapes flanking the mid-back */}
    <path
      d="M 68 92 Q 60 115 62 155 Q 65 175 78 178 Q 92 175 92 145 Q 88 115 82 92 Z"
      fill={fillFor('lats')} opacity={opacityFor('lats')}
      stroke={C.muscleStroke} strokeWidth="0.6"
      style={{ filter: isPrimary('lats') ? glow(C.primaryGlow) : undefined }}
    />
    <path
      d="M 132 92 Q 140 115 138 155 Q 135 175 122 178 Q 108 175 108 145 Q 112 115 118 92 Z"
      fill={fillFor('lats')} opacity={opacityFor('lats')}
      stroke={C.muscleStroke} strokeWidth="0.6"
      style={{ filter: isPrimary('lats') ? glow(C.primaryGlow) : undefined }}
    />

    {/* Mid-back / rhomboids — vertical strip between shoulder blades */}
    <path
      d="M 92 92 L 108 92 Q 110 130 108 158 L 92 158 Q 90 130 92 92 Z"
      fill={fillFor('mid_back')} opacity={opacityFor('mid_back')}
      stroke={C.muscleStroke} strokeWidth="0.6"
      style={{ filter: isPrimary('mid_back') ? glow(C.primaryGlow) : undefined }}
    />

    {/* Lower back / erectors */}
    <path
      d="M 88 162 L 112 162 L 110 200 L 90 200 Z"
      fill={fillFor('lower_back')} opacity={opacityFor('lower_back')}
      stroke={C.muscleStroke} strokeWidth="0.6"
      style={{ filter: isPrimary('lower_back') ? glow(C.primaryGlow) : undefined }}
    />

    {/* Glutes — two rounded shapes at hips */}
    <path
      d="M 68 214 Q 62 235 70 250 Q 82 253 92 245 Q 96 228 92 214 Z"
      fill={fillFor('glutes')} opacity={opacityFor('glutes')}
      stroke={C.muscleStroke} strokeWidth="0.6"
      style={{ filter: isPrimary('glutes') ? glow(C.primaryGlow) : undefined }}
    />
    <path
      d="M 132 214 Q 138 235 130 250 Q 118 253 108 245 Q 104 228 108 214 Z"
      fill={fillFor('glutes')} opacity={opacityFor('glutes')}
      stroke={C.muscleStroke} strokeWidth="0.6"
      style={{ filter: isPrimary('glutes') ? glow(C.primaryGlow) : undefined }}
    />

    {/* Hamstrings — back of thighs */}
    <path
      d="M 68 258 Q 63 290 71 320 L 90 320 Q 94 290 92 258 Z"
      fill={fillFor('hamstrings')} opacity={opacityFor('hamstrings')}
      stroke={C.muscleStroke} strokeWidth="0.6"
      style={{ filter: isPrimary('hamstrings') ? glow(C.primaryGlow) : undefined }}
    />
    <path
      d="M 132 258 Q 137 290 129 320 L 110 320 Q 106 290 108 258 Z"
      fill={fillFor('hamstrings')} opacity={opacityFor('hamstrings')}
      stroke={C.muscleStroke} strokeWidth="0.6"
      style={{ filter: isPrimary('hamstrings') ? glow(C.primaryGlow) : undefined }}
    />

    {/* Calves — bulged shape at back of lower legs (gastrocnemius) */}
    <path
      d="M 72 328 Q 66 350 74 375 L 88 375 Q 92 350 88 328 Z"
      fill={fillFor('calves')} opacity={opacityFor('calves')}
      stroke={C.muscleStroke} strokeWidth="0.6"
      style={{ filter: isPrimary('calves') ? glow(C.primaryGlow) : undefined }}
    />
    <path
      d="M 128 328 Q 134 350 126 375 L 112 375 Q 108 350 112 328 Z"
      fill={fillFor('calves')} opacity={opacityFor('calves')}
      stroke={C.muscleStroke} strokeWidth="0.6"
      style={{ filter: isPrimary('calves') ? glow(C.primaryGlow) : undefined }}
    />
  </>
);

export default MuscleMapHero;
