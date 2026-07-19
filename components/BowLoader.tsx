/**
 * BowLoader — full-screen scanning overlay for the AI food scan.
 *
 * A warrior's bow: the arrow nocks, draws back, and fires across the
 * screen on a loop (CSS keyframes `bowShot` + `bowstring` live in
 * index.css). Shown while Gemini reads the meal photo.
 */

import React, { useEffect, useState } from 'react';

const C = {
  bg: 'rgba(22, 18, 16, 0.97)',
  ink: '#f5ede1',
  inkMid: '#c4b8a4',
  inkLight: '#8b7e6e',
  fire: '#d97757',
  ochre: '#e8a85a',
};

const LINES = [
  'Reading the plate…',
  'Sizing up portions…',
  'Counting the macros…',
  'Checking the nutrition records…',
  'Almost there — nocking the numbers…',
];

export const BowLoader: React.FC<{ subtitle?: string }> = ({ subtitle }) => {
  const [lineIdx, setLineIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setLineIdx(i => (i + 1) % LINES.length), 2600);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      className="fixed inset-0 z-[120] flex flex-col items-center justify-center px-8"
      style={{ background: C.bg, backdropFilter: 'blur(8px)' }}
      role="status"
      aria-label="Analyzing your food"
    >
      <svg width="260" height="140" viewBox="0 0 260 140" aria-hidden>
        {/* Bow limb — vertical arc, belly facing right (arrow fires right) */}
        <path
          d="M 62 22 Q 96 70 62 118"
          fill="none"
          stroke={C.ochre}
          strokeWidth="4"
          strokeLinecap="round"
        />
        {/* Grip wrap */}
        <path d="M 76 62 L 76 78" stroke={C.fire} strokeWidth="6" strokeLinecap="round" />
        {/* Bowstring — animates a slight draw in sync with the arrow */}
        <g className="bow-string">
          <line x1="62" y1="22" x2="62" y2="118" stroke={C.ink} strokeOpacity="0.45" strokeWidth="1.5" />
        </g>
        {/* Arrow — draws back, holds, fires across, resets */}
        <g className="bow-arrow">
          {/* fletching */}
          <path d="M 40 70 L 30 62 M 40 70 L 30 78 M 48 70 L 38 62 M 48 70 L 38 78"
            stroke={C.fire} strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
          {/* shaft */}
          <line x1="34" y1="70" x2="112" y2="70" stroke={C.ink} strokeWidth="3" strokeLinecap="round" />
          {/* flint head */}
          <polygon points="124,70 108,63 112,70 108,77" fill={C.fire} />
        </g>
      </svg>

      <p className="text-[13px] font-bold mt-6 tracking-wide" style={{ color: C.ink }}>
        {LINES[lineIdx]}
      </p>
      {subtitle && (
        <p className="text-[11px] mt-2 text-center leading-relaxed" style={{ color: C.inkLight }}>
          {subtitle}
        </p>
      )}
    </div>
  );
};
