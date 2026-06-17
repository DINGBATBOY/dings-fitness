/**
 * SpotlightTour — first-launch walkthrough.
 *
 * Fires once per user after onboarding completes. Dims the screen, "cuts
 * out" a rectangle around the target UI element using an SVG mask, and
 * floats a speech bubble next to it with Cuodi-voice copy.
 *
 * Targets are identified by a `data-tour="<id>"` attribute on the actual
 * UI element. The tour component looks them up at runtime via
 * querySelector, measures their bounding rect, and re-measures on resize
 * + scroll so the spotlight tracks if the page reflows.
 *
 * Strings below are Cuodi-voice PLACEHOLDERS marked with [VOICE:PENDING].
 * The real lines live in VOICE.md and should replace these inline once
 * Cuodi writes them.
 */

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';

// Cream palette tokens — inline so no util dep.
const C = {
  bg: '#f5ede1',
  ink: '#3a2818',
  inkMid: '#7a6555',
  inkLight: '#a09080',
  terracotta: '#7a4a30',
  fire: '#d97757',
  ochre: '#b88860',
};

interface Stop {
  /** The data-tour="<id>" attribute on the target element. */
  targetId: string;
  /** Speech bubble heading (short). */
  title: string;
  /** Speech bubble body — Cuodi-voice copy. */
  body: string;
  /** Where the bubble sits relative to the spotlight target. Default 'auto'
   *  picks above or below depending on viewport position. */
  placement?: 'auto' | 'above' | 'below';
}

// Default tour — replace the body strings with Cuodi's real lines from
// VOICE.md once they're written. The structure stays the same.
export const DEFAULT_TOUR_STOPS: Stop[] = [
  {
    targetId: 'macro-ring',
    title: "Your daily balance",
    // [VOICE:PENDING] Replace with Cuodi's "tour stop 1" line from VOICE.md
    body: "This ring is your day. Calories on the rails, macros stacked. Check in here first thing — its the move.",
  },
  {
    targetId: 'add-food-fab',
    title: "Log everything",
    // [VOICE:PENDING] Replace with Cuodi's "tour stop 2" line from VOICE.md
    body: "Tap the + to drop food in. Type it, scan it, photograph it. I'll figure out the macros, you just eat.",
  },
  {
    targetId: 'eats-tab',
    title: "Restaurant cheat code",
    // [VOICE:PENDING] Replace with Cuodi's "tour stop 3" line from VOICE.md
    body: "Going out? Eats has 44 chains pre-loaded. Tap one, tap a meal, done. No more guessing what Chipotle did to your day.",
  },
  {
    targetId: 'reflect-tab',
    title: "Look back",
    // [VOICE:PENDING] Replace with Cuodi's "tour stop 4" line from VOICE.md
    body: "Wrapped lives here. Weekly recap, monthly recap, top foods, trail. Come here Sunday nights.",
  },
];

interface SpotlightTourProps {
  /** Array of stops. If omitted, uses DEFAULT_TOUR_STOPS. */
  stops?: Stop[];
  /** Called when the user finishes the tour or skips out. */
  onClose: () => void;
  /** Optional closing line shown after the last stop (full-screen card).
   *  [VOICE:PENDING] — replace once Cuodi writes the tour closing. */
  closingLine?: string;
}

export const SpotlightTour: React.FC<SpotlightTourProps> = ({
  stops = DEFAULT_TOUR_STOPS,
  onClose,
  closingLine = "So whats next? Oh yeah im supposed to know sorry! Your path starts here: The steps you take will always be yours. No matter how long your strides are just keeping moving forwards.",
}) => {
  const [idx, setIdx] = useState(0);
  const [showClosing, setShowClosing] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Lock body scroll while the tour is open.
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = original; };
  }, []);

  // Locate the target element for the current stop and measure it. Re-measure
  // on resize and scroll so the spotlight tracks. Polls a few times in case
  // the target hasn't mounted yet (e.g., tab switched but content still
  // animating in).
  useLayoutEffect(() => {
    if (showClosing) return;
    let attempts = 0;
    const measure = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${stops[idx].targetId}"]`);
      if (el) {
        setRect(el.getBoundingClientRect());
        return true;
      }
      return false;
    };
    if (!measure()) {
      const iv = setInterval(() => {
        attempts += 1;
        if (measure() || attempts > 20) clearInterval(iv);
      }, 80);
      return () => clearInterval(iv);
    }
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [idx, stops, showClosing]);

  // Padding around the target for the spotlight cutout — makes the
  // highlighted element feel like it's getting room rather than tight-cropped.
  const PAD = 8;
  const cutout = rect
    ? {
        x: Math.max(0, rect.left - PAD),
        y: Math.max(0, rect.top - PAD),
        w: rect.width + PAD * 2,
        h: rect.height + PAD * 2,
      }
    : null;

  // Decide where to put the speech bubble. Goal: not on top of the cutout,
  // and visible without scrolling. Above is preferred for dock items (bottom
  // of screen), below for everything else.
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const bubbleBelow = rect ? rect.top < vh * 0.45 : true;

  const handleNext = () => {
    if (idx < stops.length - 1) {
      setIdx(idx + 1);
    } else {
      setShowClosing(true);
    }
  };

  const handleSkip = () => {
    onClose();
  };

  const handleFinish = () => {
    onClose();
  };

  return (
    <AnimatePresence>
      {/* ───────────── Closing card ───────────── */}
      {showClosing ? (
        <motion.div
          key="closing"
          ref={overlayRef}
          className="fixed inset-0 z-[400] flex items-center justify-center p-6"
          style={{ background: 'rgba(58, 40, 24, 0.85)', backdropFilter: 'blur(4px)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <motion.div
            initial={{ scale: 0.92, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            className="rounded-3xl w-full max-w-sm p-7"
            style={{ background: C.bg, border: `1px solid ${C.terracotta}30` }}
          >
            <div className="text-[10px] uppercase tracking-[0.25em] font-bold mb-3" style={{ color: C.terracotta }}>
              Your path begins
            </div>
            <p className="text-[15px] leading-snug" style={{ color: C.ink }}>
              {closingLine}
            </p>
            <button
              onClick={handleFinish}
              className="mt-6 w-full rounded-full py-3 text-sm font-bold uppercase tracking-widest text-white transition-opacity active:opacity-80"
              style={{ background: C.fire }}
            >
              LETS GO
            </button>
          </motion.div>
        </motion.div>
      ) : (
        <motion.div
          key="spotlight"
          ref={overlayRef}
          className="fixed inset-0 z-[400]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          {/* SVG mask creates the dim overlay with a rounded cutout. */}
          {cutout ? (
            <svg
              width="100%"
              height="100%"
              viewBox={`0 0 ${typeof window !== 'undefined' ? window.innerWidth : 400} ${vh}`}
              preserveAspectRatio="none"
              style={{ position: 'absolute', inset: 0, pointerEvents: 'auto' }}
              onClick={(e) => {
                // Don't dismiss when tapping the cutout area itself — only
                // when tapping outside the bubble + spotlight.
                if ((e.target as Element).tagName === 'svg' || (e.target as Element).tagName === 'rect') {
                  // Tap outside the bubble: do nothing (use Next button to advance).
                }
              }}
            >
              <defs>
                <mask id="spotlight-mask">
                  <rect width="100%" height="100%" fill="white" />
                  <motion.rect
                    initial={false}
                    animate={{ x: cutout.x, y: cutout.y, width: cutout.w, height: cutout.h }}
                    transition={{ type: 'spring', stiffness: 200, damping: 25 }}
                    rx={12}
                    ry={12}
                    fill="black"
                  />
                </mask>
              </defs>
              <rect
                width="100%"
                height="100%"
                fill="rgba(58, 40, 24, 0.78)"
                mask="url(#spotlight-mask)"
              />
              {/* Subtle outline ring on the cutout for definition */}
              <motion.rect
                initial={false}
                animate={{ x: cutout.x, y: cutout.y, width: cutout.w, height: cutout.h }}
                transition={{ type: 'spring', stiffness: 200, damping: 25 }}
                rx={12}
                ry={12}
                fill="none"
                stroke={C.fire}
                strokeWidth={2}
                strokeOpacity={0.6}
              />
            </svg>
          ) : (
            // While we're locating the target, dim the screen without a cutout.
            <div className="absolute inset-0" style={{ background: 'rgba(58, 40, 24, 0.78)' }} />
          )}

          {/* Speech bubble */}
          {cutout && (
            <motion.div
              key={`bubble-${idx}`}
              initial={{ opacity: 0, y: bubbleBelow ? -10 : 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.1 }}
              className="absolute rounded-3xl px-5 py-4 max-w-[320px]"
              style={{
                background: C.bg,
                border: `1px solid ${C.terracotta}30`,
                boxShadow: '0 10px 40px rgba(58, 40, 24, 0.25)',
                left: '50%',
                transform: 'translateX(-50%)',
                top: bubbleBelow ? cutout.y + cutout.h + 16 : undefined,
                bottom: bubbleBelow ? undefined : vh - cutout.y + 16,
                width: 'calc(100% - 48px)',
              }}
            >
              {/* Header row: stop count + skip */}
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] uppercase tracking-[0.25em] font-bold" style={{ color: C.terracotta }}>
                  {idx + 1} of {stops.length}
                </div>
                <button
                  onClick={handleSkip}
                  className="flex items-center gap-1 text-[10px] uppercase tracking-widest font-bold py-1 px-2 rounded-full transition-colors"
                  style={{ color: C.inkLight }}
                  aria-label="Skip tour"
                >
                  Skip
                  <X className="w-3 h-3" strokeWidth={2} />
                </button>
              </div>

              {/* Body */}
              <h3 className="text-base font-bold mb-1" style={{ color: C.ink }}>
                {stops[idx].title}
              </h3>
              <p className="text-[13px] leading-snug" style={{ color: C.inkMid }}>
                {stops[idx].body}
              </p>

              {/* Action row */}
              <div className="flex items-center justify-between mt-4">
                <div className="flex gap-1">
                  {stops.map((_, i) => (
                    <div
                      key={i}
                      className="h-1 rounded-full transition-all"
                      style={{
                        width: i === idx ? 16 : 6,
                        background: i === idx ? C.terracotta : `${C.terracotta}30`,
                      }}
                    />
                  ))}
                </div>
                <button
                  onClick={handleNext}
                  className="rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-white"
                  style={{ background: C.fire }}
                >
                  {idx < stops.length - 1 ? 'Next' : 'Finish'}
                </button>
              </div>
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SpotlightTour;
