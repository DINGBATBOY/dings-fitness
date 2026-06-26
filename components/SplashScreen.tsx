import React, { useEffect } from 'react';
import { motion } from 'motion/react';

/**
 * SplashScreen — a quiet Ding! opening moment.
 *
 * Replaces the cyberpunk splash with a quieter Ding! moment
 * A feather-fletched arrow draws itself across the screen, the
 * fletching unfurls, the word "DING!" lands beneath. About 2.5 seconds
 * total before the parent calls onComplete.
 *
 * The arrow is intentionally simple line art — a few SVG paths. No
 * gradients, no neon glow. Made to feel like ink on parchment.
 */

interface SplashScreenProps {
  onComplete: () => void;
}

// Warm-dark palette kept inline so this file has no deps.
const C = {
  bg: '#161210',
  ink: '#f5ede1',
  inkMid: '#c4b8a4',
  inkLight: '#8b7e6e',
  terracotta: '#d97757',
  ochre: '#e8a85a',
  fire: '#d97757',
};

export const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
  useEffect(() => {
    const timer = setTimeout(onComplete, 2700);
    return () => clearTimeout(timer);
  }, [onComplete]);

  // Length of the arrow shaft in user units, used for the draw-in animation.
  const SHAFT_LENGTH = 168;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden noise-bg"
      style={{ background: C.bg }}
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{ delay: 2.4, duration: 0.3 }}
    >
      <div className="relative flex flex-col items-center" style={{ width: 280 }}>
        {/* ───────────── Feather arrow ───────────── */}
        <svg width={280} height={100} viewBox="0 0 280 100" fill="none" aria-hidden>
          {/* Arrow shaft — draws in left-to-right */}
          <motion.line
            x1={56} y1={50} x2={56 + SHAFT_LENGTH} y2={50}
            stroke={C.terracotta}
            strokeWidth={2}
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
          />

          {/* Arrowhead — appears once the shaft has drawn in */}
          <motion.polygon
            points={`${56 + SHAFT_LENGTH + 18},50 ${56 + SHAFT_LENGTH - 2},42 ${56 + SHAFT_LENGTH - 2},58`}
            fill={C.terracotta}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25, delay: 0.85, ease: 'backOut' }}
            style={{ transformOrigin: `${56 + SHAFT_LENGTH}px 50px` }}
          />

          {/* Fletching — three feathers fanning out from the tail */}
          <g style={{ transformOrigin: '56px 50px' }}>
            {/* Upper feather */}
            <motion.path
              d="M 56 50 Q 38 36, 22 28 Q 30 38, 44 46 Z"
              fill={C.fire}
              stroke={C.terracotta}
              strokeWidth={1}
              strokeLinejoin="round"
              initial={{ opacity: 0, x: 8, y: 8 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              transition={{ duration: 0.35, delay: 1.0, ease: 'easeOut' }}
            />
            {/* Center feather */}
            <motion.path
              d="M 56 50 Q 36 50, 18 50 Q 30 50, 44 50 Z"
              fill={C.ochre}
              stroke={C.terracotta}
              strokeWidth={1}
              strokeLinejoin="round"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, delay: 1.1, ease: 'easeOut' }}
            />
            {/* Lower feather */}
            <motion.path
              d="M 56 50 Q 38 64, 22 72 Q 30 62, 44 54 Z"
              fill={C.fire}
              stroke={C.terracotta}
              strokeWidth={1}
              strokeLinejoin="round"
              initial={{ opacity: 0, x: 8, y: -8 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              transition={{ duration: 0.35, delay: 1.2, ease: 'easeOut' }}
            />
            {/* Feather spines (subtle interior detail) */}
            <motion.g
              stroke={C.terracotta}
              strokeWidth={0.6}
              strokeLinecap="round"
              opacity={0.6}
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              transition={{ duration: 0.4, delay: 1.4 }}
            >
              <line x1={30} y1={36} x2={50} y2={48} />
              <line x1={26} y1={50} x2={50} y2={50} />
              <line x1={30} y1={64} x2={50} y2={52} />
            </motion.g>
          </g>
        </svg>

        {/* ───────────── DING! wordmark ───────────── */}
        <motion.div
          className="font-orbitron font-bold tracking-tight text-5xl mt-3 select-none"
          style={{ color: C.ink, letterSpacing: '-0.02em' }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 1.5, ease: 'easeOut' }}
        >
          DING<span style={{ color: C.fire }}>!</span>
        </motion.div>

        {/* ───────────── Subtle subtitle ───────────── */}
        <motion.div
          className="text-[10px] uppercase tracking-[0.3em] mt-3"
          style={{ color: C.inkLight }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 1.85 }}
        >
          Little things add up
        </motion.div>
      </div>
    </motion.div>
  );
};
