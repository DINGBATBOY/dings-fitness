import React from 'react';
import { House, BookOpen, Dumbbell, Feather } from 'lucide-react';
import type { UserProfile } from '../types';

interface LayoutProps {
  children: React.ReactNode; activeTab: string; onTabChange: (tab: string) => void;
  profile?: UserProfile; onUpdateName?: (name: string) => void;
}
export const Layout: React.FC<LayoutProps> = ({ children, activeTab, onTabChange, profile }) => {
  const tabs = [
    { id: 'dashboard', label: 'Today', Icon: House },
    { id: 'journal', label: 'Log', Icon: BookOpen },
    { id: 'workouts', label: 'Train', Icon: Dumbbell },
    { id: 'reflect', label: 'Reflect', Icon: Feather },
  ];
  return <div className="mx-auto min-h-dvh max-w-md bg-[#161210] pb-[calc(10rem+env(safe-area-inset-bottom))] text-[#f5ede1]">
    <header className="sticky top-0 z-40 flex min-h-16 items-center justify-between gap-4 border-b border-white/10 bg-[#161210]/95 px-5 py-2 backdrop-blur-md">
      <div><p className="font-orbitron text-xl font-bold tracking-tight">DING<span className="text-[#d97757]">!</span></p><p className="mt-1 text-xs text-[#c4b8a4]">{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p></div>
      <button type="button" onClick={() => onTabChange('profile')} aria-label="Open profile" className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#c4b8a4]/50 bg-[#1d1815] text-base font-semibold">{profile?.profilePicture ? <img src={profile.profilePicture} alt="" className="h-full w-full object-cover" /> : profile?.name?.charAt(0).toUpperCase() || 'You'}</button>
    </header>
    <main className="px-5 pt-5">{children}</main>
    <nav aria-label="Main navigation" className="fixed bottom-0 left-1/2 z-50 flex w-full max-w-md -translate-x-1/2 border-t border-white/10 bg-[#161210]/95 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-md">
      {tabs.map(({ id, label, Icon }) => {
        const selected = id === activeTab;
        return <button type="button" key={id} onClick={() => onTabChange(id)} aria-current={selected ? 'page' : undefined} className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 ${selected ? 'text-[#f5ede1]' : 'text-[#c4b8a4]'}`}>
          {selected && <span aria-hidden="true" className="absolute top-0 h-0.5 w-6 rounded-full bg-[#d97757]" />}
          <Icon size={22} strokeWidth={1.8} aria-hidden="true" /><span className="text-xs font-semibold">{label}</span>
        </button>;
      })}
    </nav>
  </div>;
};
