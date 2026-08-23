/**
 * HealthConnectCard — the one-time dashboard prompt that explains why we'd
 * like Apple Health access before the iOS permission sheet appears. Shown
 * only on iOS, only when the user hasn't connected or dismissed it.
 *
 * Deliberately concrete about what we read and what we do NOT do, because
 * the whole point is informed consent (and Apple reviews this flow).
 */
import React from 'react';
import { HeartPulse, X } from 'lucide-react';

// Palette matches FuelHome — one warm-dark surface tone throughout.
const C = {
  bg: '#0f0c0a',
  surface: '#161210',
  border: 'rgba(245,237,225,0.08)',
  ink: '#f5ede1',
  inkMid: '#c4b8a4',
  inkLight: '#8b7e6e',
  fire: '#d97757',
  emerald: '#7ab896',
};

interface HealthConnectCardProps {
  onConnect: () => void;
  onDismiss: () => void;
  busy?: boolean;
}

export const HealthConnectCard: React.FC<HealthConnectCardProps> = ({ onConnect, onDismiss, busy }) => {
  return (
    <div
      className="relative rounded-3xl p-5 mb-4"
      style={{ background: C.surface, border: `1px solid ${C.border}` }}
    >
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="absolute top-4 right-4 opacity-60"
        style={{ color: C.inkLight }}
      >
        <X className="w-4 h-4" strokeWidth={2} />
      </button>

      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center"
          style={{ background: `${C.fire}1f`, color: C.fire }}
        >
          <HeartPulse className="w-5 h-5" strokeWidth={1.8} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-bold" style={{ color: C.ink }}>
            Connect Apple Health
          </div>
          <p className="text-[12px] mt-1 leading-snug" style={{ color: C.inkMid }}>
            Stop logging activity by hand. With your permission, Ding reads your{' '}
            <span style={{ color: C.ink }}>active energy</span>, today's{' '}
            <span style={{ color: C.ink }}>workouts</span>, and your latest{' '}
            <span style={{ color: C.ink }}>weight</span> to keep your energy balance
            and check-ins accurate automatically.
          </p>
          <p className="text-[10px] mt-2 leading-snug" style={{ color: C.inkLight }}>
            Read-only. Your health data is never used for ads and never sold. It stays
            on your device and in your private account. Your daily calorie target does
            not change.
          </p>

          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={onConnect}
              disabled={busy}
              className="px-4 py-2 rounded-full text-[12px] font-bold uppercase tracking-widest disabled:opacity-60"
              style={{ background: C.fire, color: '#1a120e' }}
            >
              {busy ? 'Connecting…' : 'Connect'}
            </button>
            <button
              onClick={onDismiss}
              disabled={busy}
              className="px-4 py-2 rounded-full text-[12px] font-bold uppercase tracking-widest"
              style={{ color: C.inkMid }}
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HealthConnectCard;
