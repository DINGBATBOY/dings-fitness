/**
 * FeatherCelebration — short SVG animation that pops when the user logs
 * a meal. Eight pieces (feathers + arrows) fly from off-screen across the
 * viewport with staggered timing and rotation, then fade. Lasts ~1.5s
 * total, then unmounts.
 *
 * Triggered by the parent setting a `show` flag. The component decides its
 * own pieces and timing — parent just calls `onDone` when it should
 * unmount.
 */

import React, { useEffect, useMemo } from 'react';
import { motion } from 'motion/react';

interface Piece {
  kind: 'feather' | 'arrow';
  color: string;
  startX: number;       // px from left, can be negative (off-screen)
  startY: number;       // px from top
  endX: number;
  endY: number;
  rotation: number;     // initial rotation in degrees
  endRotation: number;
  delay: number;        // seconds
  duration: number;
  scale: number;
}

interface FeatherCelebrationProps {
  show: boolean;
  onDone: () => void;
}

// Palette — matches the dashboard's brighter macro colors so this feels
// like the same world, not a separate confetti popup.
const PALETTE = ['#d97757', '#e8a85a', '#e3614a', '#7ab896', '#c97b6e'];

export const FeatherCelebration: React.FC<FeatherCelebrationProps> = ({ show, onDone }) => {
  // Random piece config — recomputed each time show flips on so every
  // trigger looks slightly different. useMemo keyed on show so rerenders
  // mid-animation don't shuffle the pieces.
  const pieces = useMemo<Piece[]>(() => {
    if (!show || typeof window === 'undefined') return [];
    const W = window.innerWidth;
    const H = window.innerHeight;
    const N = 9;
    return Array.from({ length: N }).map((_, i) => {
      const fromLeft = i % 2 === 0;
      const kind = i % 3 === 0 ? 'arrow' : 'feather';
      return {
        kind,
        color: PALETTE[i % PALETTE.length],
        startX: fromLeft ? -60 : W + 60,
        startY: H * (0.15 + Math.random() * 0.55),
        endX: fromLeft ? W + 60 : -60,
        endY: H * (0.10 + Math.random() * 0.55) - 60,
        rotation: fromLeft ? -25 + Math.random() * 50 : 155 + Math.random() * 50,
        endRotation: fromLeft ? 30 + Math.random() * 90 : -30 - Math.random() * 90,
        delay: i * 0.05,
        duration: 1.0 + Math.random() * 0.5,
        scale: 0.7 + Math.random() * 0.6,
      };
    });
  }, [show]);

  // Auto-dismiss ~1.6s after triggering — gives the slowest piece time
  // to land and fade before we unmount.
  useEffect(() => {
    if (!show) return;
    const t = setTimeout(onDone, 1600);
    return () => clearTimeout(t);
  }, [show, onDone]);

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[500] pointer-events-none"
      style={{ overflow: 'hidden' }}
      aria-hidden
    >
      {pieces.map((p, i) => (
        <motion.div
          key={i}
          initial={{ x: p.startX, y: p.startY, rotate: p.rotation, opacity: 0, scale: p.scale * 0.6 }}
          animate={{ x: p.endX, y: p.endY, rotate: p.endRotation, opacity: [0, 1, 1, 0], scale: p.scale }}
          transition={{ duration: p.duration, delay: p.delay, ease: 'easeOut', times: [0, 0.15, 0.7, 1] }}
          style={{ position: 'absolute', top: 0, left: 0 }}
        >
          {p.kind === 'feather' ? (
            <FeatherSvg color={p.color} />
          ) : (
            <ArrowSvg color={p.color} />
          )}
        </motion.div>
      ))}
    </div>
  );
};

// ───────── SVG art ─────────

const FeatherSvg: React.FC<{ color: string }> = ({ color }) => (
  <svg width={36} height={36} viewBox="0 0 36 36" fill="none">
    {/* Single stylized feather — soft leaf shape with a center spine */}
    <path
      d="M 6 18 Q 18 6, 30 18 Q 24 24, 18 18 Q 12 24, 6 18 Z"
      fill={color}
      opacity={0.92}
    />
    {/* Spine */}
    <line x1="8" y1="18" x2="30" y2="18" stroke="#161210" strokeWidth="0.7" opacity={0.4} />
    {/* Side barbs */}
    <line x1="14" y1="14" x2="20" y2="18" stroke="#161210" strokeWidth="0.4" opacity={0.3} />
    <line x1="14" y1="22" x2="20" y2="18" stroke="#161210" strokeWidth="0.4" opacity={0.3} />
  </svg>
);

const ArrowSvg: React.FC<{ color: string }> = ({ color }) => (
  <svg width={44} height={20} viewBox="0 0 44 20" fill="none">
    {/* Arrow shaft */}
    <line x1="6" y1="10" x2="34" y2="10" stroke={color} strokeWidth="2" strokeLinecap="round" />
    {/* Arrowhead */}
    <polygon points="40,10 32,6 32,14" fill={color} />
    {/* Fletching at tail — 2 small feathers */}
    <path d="M 6 10 Q 3 6, 0 4 Q 4 8, 6 10" fill={color} opacity={0.85} />
    <path d="M 6 10 Q 3 14, 0 16 Q 4 12, 6 10" fill={color} opacity={0.85} />
  </svg>
);

export default FeatherCelebration;
