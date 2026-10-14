import React from 'react';
import { House, Dumbbell, MessageCircle, Plus } from 'lucide-react';
import type { UserProfile } from '../types';
import type { FoodStatus } from './food/FoodComposer';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  /** Opens the full-page Add Food screen (the center +). */
  onAdd: () => void;
  addOpen?: boolean;
  foodStatus?: FoodStatus;
  profile?: UserProfile;
  onUpdateName?: (name: string) => void;
}

/**
 * App shell: content + a MacroFactor-style tab bar with a raised center +.
 *   Home · Train · (+) · Coach · Profile
 * The + is the app's signature action — adding food — so it is bigger,
 * brighter and animated; it rotates into an × while Add Food is open.
 */
export const Layout: React.FC<LayoutProps> = ({ children, activeTab, onTabChange, onAdd, addOpen = false, foodStatus = 'empty', profile }) => {
  const left = [
    { id: 'dashboard', label: 'Home', Icon: House },
    { id: 'workouts', label: 'Train', Icon: Dumbbell },
  ];
  const right = [
    { id: 'coach', label: 'Coach', Icon: MessageCircle },
  ];
  const profileSelected = activeTab === 'profile' || activeTab === 'reflect' || activeTab === 'journal';
  const tab = ({ id, label, Icon }: { id: string; label: string; Icon: typeof House }) => {
    const selected = id === activeTab || (id === 'dashboard' && activeTab === 'restaurants');
    return (
      <button
        type="button"
        key={id}
        onClick={() => onTabChange(id)}
        aria-current={selected ? 'page' : undefined}
        className={`tap relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 ${selected ? 'text-[var(--ink)]' : 'text-[var(--ink-light)]'}`}
      >
        <Icon size={22} strokeWidth={selected ? 2.2 : 1.8} aria-hidden="true" className="transition-transform duration-200" style={{ transform: selected ? 'translateY(-1px) scale(1.06)' : undefined }} />
        <span className="text-[11px] font-semibold">{label}</span>
        <span aria-hidden="true" className="absolute bottom-0.5 h-1 w-1 rounded-full bg-[var(--primary)] transition-all duration-200" style={{ opacity: selected ? 1 : 0, transform: selected ? 'scale(1)' : 'scale(0)' }} />
      </button>
    );
  };
  const busy = foodStatus === 'analyzing' || foodStatus === 'ready';

  return (
    <div className="mx-auto min-h-dvh max-w-md bg-[var(--bg-dark)] pb-[calc(7rem+env(safe-area-inset-bottom))] text-[var(--ink)]">
      <main className="px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">{children}</main>
      <nav
        aria-label="Main navigation"
        className="fixed bottom-0 left-1/2 z-50 w-full max-w-md -translate-x-1/2 border-t border-[var(--line)] bg-[var(--bg-glass)] px-2 pt-1.5 pb-[max(0.4rem,env(safe-area-inset-bottom))] backdrop-blur-xl"
      >
        <div className="flex items-end">
          {left.map(tab)}
          <div className="flex flex-1 justify-center">
            <button
              type="button"
              onClick={onAdd}
              aria-label={addOpen ? 'Close add food' : 'Add food'}
              aria-expanded={addOpen}
              className={`tap relative -mt-7 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--on-primary)] ring-4 ring-[var(--bg-dark)] ${addOpen ? '' : 'plus-idle'}`}
              style={{ boxShadow: '0 10px 26px rgba(217,119,87,0.38)' }}
            >
              <Plus size={32} strokeWidth={2.6} aria-hidden="true" className="transition-transform duration-300 ease-out" style={{ transform: addOpen ? 'rotate(135deg)' : 'rotate(0deg)' }} />
              {busy && !addOpen && (
                <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 flex h-4 w-4">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-75" />
                  <span className="relative inline-flex h-4 w-4 rounded-full border-2 border-[var(--bg-dark)] bg-[var(--accent)]" />
                </span>
              )}
            </button>
          </div>
          {right.map(tab)}
          <button
            type="button"
            onClick={() => onTabChange('profile')}
            aria-current={profileSelected ? 'page' : undefined}
            className={`tap relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 ${profileSelected ? 'text-[var(--ink)]' : 'text-[var(--ink-light)]'}`}
          >
            <span className={`flex h-[24px] w-[24px] items-center justify-center overflow-hidden rounded-full border text-[11px] font-bold transition-all duration-200 ${profileSelected ? 'border-[var(--primary)] scale-110' : 'border-[var(--line-strong)]'}`}>
              {profile?.profilePicture
                ? <img src={profile.profilePicture} alt="" className="h-full w-full object-cover" />
                : (profile?.name?.charAt(0).toUpperCase() || 'D')}
            </span>
            <span className="text-[11px] font-semibold">Profile</span>
            <span aria-hidden="true" className="absolute bottom-0.5 h-1 w-1 rounded-full bg-[var(--primary)] transition-all duration-200" style={{ opacity: profileSelected ? 1 : 0, transform: profileSelected ? 'scale(1)' : 'scale(0)' }} />
          </button>
        </div>
      </nav>
    </div>
  );
};
