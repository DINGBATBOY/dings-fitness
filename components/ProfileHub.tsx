/**
 * ProfileHub — Profile tab. The old Log page lives here; Reflect is the Progress tab.
 *
 *   Header: photo, name, goal
 *   Stat tiles: day streak, days logged, most eaten, 7-day avg, weight change, foods logged, water
 *   Sections: History (the old Log page) · Settings (Reflect moved to the Progress tab)
 *   Settings starts with Appearance (light/dark + background tone).
 */
import React, { useMemo, useState } from 'react';
import { Flame, CalendarCheck, Utensils, Gauge, Scale, ListChecks, Pencil, Sun, Moon, Check, Droplets } from 'lucide-react';
import type { DailyLog, FoodItem, HistoryEntry, UserProfile, WeightEntry } from '../types';
import { TONES, type Appearance } from '../services/theme';

export type ProfileSection = 'history' | 'settings';

interface ProfileHubProps {
  profile: UserProfile;
  avatar: React.ReactNode;
  streak: number;
  dailyLogs: DailyLog[];
  todayLog: FoodItem[];
  foodHistory: HistoryEntry[];
  weighIns: WeightEntry[];
  onEdit: () => void;
  section: ProfileSection;
  onSection: (s: ProfileSection) => void;
  appearance: Appearance;
  onAppearance: (a: Appearance) => void;
  history: React.ReactNode;
  settings: React.ReactNode;
}

const SECTIONS: { id: ProfileSection; label: string }[] = [
  { id: 'history', label: 'History' },
  { id: 'settings', label: 'Settings' },
];

export const ProfileHub: React.FC<ProfileHubProps> = ({
  profile, avatar, streak, dailyLogs, todayLog, foodHistory, weighIns, onEdit,
  section, onSection, appearance, onAppearance, history, settings,
}) => {
  const stats = useMemo(() => {
    const days = (dailyLogs || []).filter(l => (l.caloriesConsumed || 0) > 0 || (l.foodItems?.length || 0) > 0);
    const daysLogged = days.length + (todayLog.length ? 1 : 0);
    const meals = days.reduce((s, l) => s + (l.foodItems?.length || 0), 0) + todayLog.length;
    // Most eaten: history's logged count is the best signal; fall back to raw names.
    let most: { name: string; count: number } | null = null;
    for (const h of foodHistory || []) {
      const c = h.loggedCount || 1;
      if (!most || c > most.count) most = { name: h.label, count: c };
    }
    if (!most || most.count < 2) {
      const counts = new Map<string, number>();
      for (const f of [...todayLog, ...days.flatMap(l => l.foodItems || [])]) {
        const k = (f.name || '').trim();
        if (k) counts.set(k, (counts.get(k) || 0) + 1);
      }
      for (const [name, count] of counts) if (!most || count > most.count) most = { name, count };
    }
    const cutoff = new Date(); cutoff.setHours(0, 0, 0, 0); cutoff.setDate(cutoff.getDate() - 7);
    const recent = days.filter(l => new Date(l.date) >= cutoff);
    const avg7 = recent.length ? recent.reduce((s, l) => s + (l.caloriesConsumed || 0), 0) / recent.length : 0;
    const sorted = [...(weighIns || [])].filter(w => w.weight > 50 && w.weight < 700).sort((a, b) => a.date.localeCompare(b.date));
    const start = profile.initialWeight || sorted[0]?.weight;
    const latest = sorted[sorted.length - 1]?.weight ?? profile.weight;
    const change = start && latest ? latest - start : undefined;
    const waterDays = days.filter(l => (l.waterIntake || 0) > 0);
    const avgWater = waterDays.length ? waterDays.reduce((s, l) => s + (l.waterIntake || 0), 0) / waterDays.length : 0;
    return { daysLogged, meals, most, avg7, change, avgWater };
  }, [dailyLogs, todayLog, foodHistory, weighIns, profile.initialWeight, profile.weight]);

  const tiles: { Icon: typeof Flame; label: string; value: string; sub?: string; tone?: string }[] = [
    { Icon: Flame, label: 'Day streak', value: String(streak), sub: streak === 1 ? 'day' : 'days', tone: 'var(--primary)' },
    { Icon: CalendarCheck, label: 'Days logged', value: String(stats.daysLogged), tone: 'var(--sage)' },
    { Icon: Gauge, label: '7-day average', value: stats.avg7 ? Math.round(stats.avg7).toLocaleString() : '—', sub: 'kcal', tone: 'var(--accent)' },
    { Icon: Scale, label: 'Weight change', value: stats.change === undefined ? '—' : `${stats.change > 0 ? '+' : stats.change < 0 ? '−' : ''}${Math.abs(stats.change).toFixed(1)}`, sub: 'lbs since start', tone: '#6fa8c4' },
    { Icon: ListChecks, label: 'Foods logged', value: stats.meals.toLocaleString(), tone: '#a48ec7' },
    { Icon: Droplets, label: 'Avg water', value: stats.avgWater ? String(Math.round(stats.avgWater)) : '—', sub: 'oz / day', tone: '#6fa8c4' },
  ];

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <header className="rise-in relative overflow-hidden rounded-[28px] border border-[var(--line)] bg-[var(--bg-card)] p-5">
        <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-[var(--primary)] opacity-15 blur-3xl" />
        <div className="relative flex items-center gap-4">
          {avatar}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-bold tracking-tight">{profile.name}</h1>
            <p className="text-sm text-[var(--ink-mid)]">{profile.goal}</p>
          </div>
          <button type="button" onClick={onEdit} className="tap flex h-11 items-center gap-1.5 rounded-full border border-[var(--line-strong)] px-3 text-sm font-semibold"><Pencil size={15} /> Edit</button>
        </div>
      </header>

      {/* Most eaten — the headline stat */}
      {stats.most && (
        <div className="rise-in flex items-center gap-4 rounded-3xl border border-[var(--line)] bg-[var(--bg-card)] p-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--primary)]/15 text-[var(--primary)]"><Utensils size={22} /></div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--ink-light)]">Most eaten</p>
            <p className="truncate text-lg font-bold">{stats.most.name}</p>
            <p className="text-xs text-[var(--ink-mid)]">logged {stats.most.count}×</p>
          </div>
        </div>
      )}

      {/* Stat tiles */}
      <div className="stagger grid grid-cols-2 gap-3">
        {tiles.map(({ Icon, label, value, sub, tone }) => (
          <div key={label} className="rounded-3xl border border-[var(--line)] bg-[var(--bg-card)] p-4">
            <Icon size={18} style={{ color: tone }} aria-hidden="true" />
            <p className="mt-2 text-2xl font-bold tabular-nums">{value}{sub && <span className="ml-1 text-xs font-medium text-[var(--ink-mid)]">{sub}</span>}</p>
            <p className="text-xs text-[var(--ink-mid)]">{label}</p>
          </div>
        ))}
      </div>

      {/* Section switcher */}
      <div role="tablist" aria-label="Profile sections" className="sticky top-0 z-30 -mx-4 bg-[var(--bg-dark)]/95 px-4 py-2 backdrop-blur-md">
        <div className="relative grid grid-cols-2 rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-1">
          <span aria-hidden="true" className="absolute inset-y-1 rounded-xl bg-[var(--ink)] transition-transform duration-300 ease-out"
            style={{ width: 'calc((100% - 0.5rem) / 2)', left: '0.25rem', transform: `translateX(${SECTIONS.findIndex(s => s.id === section) * 100}%)` }} />
          {SECTIONS.map(s => (
            <button key={s.id} type="button" role="tab" aria-selected={section === s.id} onClick={() => onSection(s.id)}
              className={`relative z-10 min-h-11 rounded-xl text-sm font-semibold transition-colors duration-300 ${section === s.id ? 'text-[var(--bg-dark)]' : 'text-[var(--ink-mid)]'}`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div key={section} className="rise-in">
        {section === 'history' && history}
        {section === 'settings' && (
          <div className="space-y-5">
            <AppearanceCard appearance={appearance} onChange={onAppearance} />
            {settings}
          </div>
        )}
      </div>
    </div>
  );
};

function AppearanceCard({ appearance, onChange }: { appearance: Appearance; onChange: (a: Appearance) => void }) {
  const [mode, setMode] = useState(appearance.mode);
  const set = (next: Appearance) => { setMode(next.mode); onChange(next); };
  return (
    <section className="rounded-3xl border border-[var(--line)] bg-[var(--bg-card)] p-5" aria-label="Appearance">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--ink-light)]">Appearance</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {([['dark', 'Dark', Moon], ['light', 'Light', Sun]] as const).map(([id, label, Icon]) => (
          <button key={id} type="button" aria-pressed={mode === id} onClick={() => set({ ...appearance, mode: id })}
            className={`tap flex min-h-14 items-center justify-center gap-2 rounded-2xl border text-base font-semibold transition-colors ${mode === id ? 'border-[var(--primary)] bg-[var(--primary)]/12' : 'border-[var(--line-strong)]'}`}>
            <Icon size={18} aria-hidden="true" /> {label}
          </button>
        ))}
      </div>
      <p className="mt-5 text-sm font-semibold">Background {appearance.mode === 'light' && <span className="font-normal text-[var(--ink-light)]">(dark mode)</span>}</p>
      <div className="mt-2 grid grid-cols-5 gap-2">
        {TONES.map(t => {
          const on = appearance.tone === t.id;
          return (
            <button key={t.id} type="button" aria-pressed={on} aria-label={t.label} onClick={() => set({ mode: 'dark', tone: t.id })}
              className="tap flex flex-col items-center gap-1.5">
              <span className={`relative flex h-12 w-12 items-center justify-center rounded-2xl border-2 transition-transform ${on && appearance.mode === 'dark' ? 'scale-110 border-[var(--primary)]' : 'border-[var(--line-strong)]'}`}
                style={{ background: `linear-gradient(135deg, ${t.swatch} 50%, ${t.card} 50%)` }}>
                {on && appearance.mode === 'dark' && <Check size={18} className="text-[#d97757]" />}
              </span>
              <span className="text-center text-[10px] leading-tight text-[var(--ink-mid)]">{t.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
