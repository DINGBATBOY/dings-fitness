/**
 * MusclePoseCarousel — swipeable warrior pose cards for the Workouts tab.
 *
 * Replaces the SVG muscle map with illustrated pose art: one card per
 * muscle group, each showing the warrior flexing that group with it
 * glowing fire orange. The day's activation decides which cards appear —
 * primary groups first, then synergists. Swipe horizontally when the day
 * hits more than one group; dots underneath track position.
 *
 * Images live in public/muscles/<id>.png (see CARDS below for ids).
 * Cards whose image is missing or fails to load are silently dropped;
 * if nothing is left to show, we fall back to the classic MuscleMapHero
 * so the section never renders empty.
 */

import React, { useMemo, useRef, useState } from 'react';
import type { MuscleKey, MuscleActivation } from '../constants';
import { MuscleMapHero } from './MuscleMapHero';

const C = {
  bg: '#161210',
  imgBg: '#0a0806',            // near-black behind the artwork glow
  border: 'rgba(255,255,255,0.06)',
  borderStrong: 'rgba(255,255,255,0.10)',
  ink: '#f5ede1',
  inkMid: '#c4b8a4',
  inkLight: '#8b7e6e',
  fire: '#d97757',
  ochre: '#e8a85a',
};

interface PoseCard {
  /** File id — image expected at /muscles/<id>.png */
  id: string;
  label: string;
  /** Muscle keys this card represents. Card activates if ANY key is active. */
  keys: MuscleKey[];
}

/** Order here = display order (primary cards keep this relative order). */
const CARDS: PoseCard[] = [
  { id: 'chest',       label: 'Chest',          keys: ['chest'] },
  { id: 'back',        label: 'Back',           keys: ['lats', 'mid_back'] },
  { id: 'shoulders',   label: 'Shoulders',      keys: ['delts_ant', 'delts_post'] },
  { id: 'traps',       label: 'Traps',          keys: ['traps'] },
  { id: 'biceps',      label: 'Biceps',         keys: ['biceps'] },
  { id: 'triceps',     label: 'Triceps',        keys: ['triceps'] },
  { id: 'forearms',    label: 'Forearms',       keys: ['forearm_ant', 'forearm_post'] },
  { id: 'abs',         label: 'Core',           keys: ['abs', 'obliques'] },
  { id: 'lower_back',  label: 'Lower back',     keys: ['lower_back'] },
  { id: 'glutes_hams', label: 'Glutes & hams',  keys: ['glutes', 'hamstrings'] },
  { id: 'quads',       label: 'Quads',          keys: ['quads'] },
  { id: 'calves',      label: 'Calves',         keys: ['calves', 'calf_ant'] },
];

interface MusclePoseCarouselProps {
  activation: MuscleActivation;
  className?: string;
}

export const MusclePoseCarousel: React.FC<MusclePoseCarouselProps> = ({ activation, className = '' }) => {
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  const cards = useMemo(() => {
    const isPrimary = (c: PoseCard) => c.keys.some(k => activation.primary.includes(k));
    const isActive  = (c: PoseCard) =>
      c.keys.some(k => activation.primary.includes(k) || activation.secondary.includes(k));
    const live = CARDS.filter(c => isActive(c) && !failed.has(c.id));
    // Primary cards first, both groups keeping manifest order.
    return [
      ...live.filter(isPrimary).map(c => ({ ...c, primary: true })),
      ...live.filter(c => !isPrimary(c)).map(c => ({ ...c, primary: false })),
    ];
  }, [activation, failed]);

  // Nothing usable (no activation, or all images missing) — keep the
  // classic SVG map so the hero slot never goes blank.
  if (cards.length === 0) {
    return <MuscleMapHero activation={activation} className={className} />;
  }

  const onScroll = () => {
    const el = trackRef.current;
    if (!el || el.clientWidth === 0) return;
    setPage(Math.round(el.scrollLeft / el.clientWidth));
  };

  const clampedPage = Math.min(page, cards.length - 1);

  return (
    <div className={className}>
      {/* ─── Swipe track ─── */}
      <div
        ref={trackRef}
        onScroll={onScroll}
        className="flex overflow-x-auto snap-x snap-mandatory rounded-2xl hide-scrollbar"
        style={{ background: C.imgBg, border: `1px solid ${C.border}` }}
      >
        {cards.map(card => (
          <div key={card.id} className="relative w-full shrink-0 snap-center">
            <img
              src={`/muscles/${card.id}.png`}
              alt={`${card.label} pose`}
              draggable={false}
              className="w-full object-cover select-none"
              style={{ aspectRatio: '4 / 5', background: C.imgBg }}
              onError={() => setFailed(prev => new Set(prev).add(card.id))}
            />
            {/* Label + tier chip overlay */}
            <div className="absolute left-0 right-0 bottom-0 px-4 pb-3 pt-10"
              style={{ background: 'linear-gradient(to top, rgba(10,8,6,0.85), transparent)' }}
            >
              <div className="flex items-end justify-between gap-2">
                <span className="text-[17px] font-bold tracking-tight" style={{ color: C.ink }}>
                  {card.label}
                </span>
                <span
                  className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full shrink-0"
                  style={card.primary
                    ? { background: `${C.fire}26`, color: C.fire, border: `1px solid ${C.fire}55` }
                    : { background: `${C.ochre}1f`, color: C.ochre, border: `1px solid ${C.ochre}44` }}
                >
                  {card.primary ? 'Primary' : 'Synergist'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ─── Dots + count ─── */}
      {cards.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-3" aria-hidden>
          {cards.map((card, i) => (
            <span
              key={card.id}
              className="rounded-full transition-all duration-300"
              style={{
                width: i === clampedPage ? 16 : 6,
                height: 6,
                background: i === clampedPage ? C.fire : C.borderStrong,
              }}
            />
          ))}
          <span className="text-[9px] font-bold uppercase tracking-widest ml-2 tabular-nums" style={{ color: C.inkLight }}>
            {clampedPage + 1} / {cards.length}
          </span>
        </div>
      )}
    </div>
  );
};
