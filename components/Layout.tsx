
import React from 'react';
import { Feather } from 'lucide-react';
import { UserProfile } from '../types';

export const Layout: React.FC<{ children: React.ReactNode, activeTab: string, onTabChange: (tab: string) => void, profile?: UserProfile }> = ({ children, activeTab, onTabChange, profile }) => {
  // Bottom dock — 6 tabs. Eats kept because the macro-fit AI card +
  // 44-restaurant DB is a hero feature that earns its dock slot. Recomp
  // absorbed into Reflect; Profile lives behind the header avatar tap.
  const tabs = [
    { id: 'dashboard',   label: 'Fuel',    borderClass: 'border-primary',     icon: (active: boolean) => <span className={active ? "text-primary"     : ""}>🔥</span> },
    { id: 'restaurants', label: 'Eats',    borderClass: 'border-accent',      icon: (active: boolean) => <span className={active ? "text-accent"      : ""}>🍽️</span> },
    { id: 'journal',     label: 'Log',     borderClass: 'border-emerald-400', icon: (active: boolean) => <span className={active ? "text-emerald-400" : ""}>📖</span> },
    { id: 'reflect',     label: 'Reflect', borderClass: 'border-purple-400',  icon: (active: boolean) => <Feather className={`w-5 h-5 ${active ? 'text-purple-300' : 'text-current'}`} strokeWidth={1.5} /> },
    { id: 'workouts',    label: 'Dings',   borderClass: 'border-blue-500',    icon: (active: boolean) => <span className={active ? "text-blue-500"    : ""}>⚡</span> },
    { id: 'coach',       label: 'Coach',   borderClass: 'border-pink-500',    icon: (active: boolean) => <span className={active ? "text-pink-500"    : ""}>💬</span> },
  ];

  const currentDate = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: '2-digit' }).toUpperCase().replace(',', ' ·');

  const firstInitial = profile?.name ? profile.name.charAt(0).toUpperCase() : '?';

  return (
    <div className="min-h-screen pb-32 max-w-md mx-auto relative bg-[#0d0a08]">
      {/* Sticky Header with blur — dropped the scanline overlay for a
          calmer, warmer chrome that matches the Dusk Trail palette. */}
      <header className="fixed top-0 left-0 right-0 z-40 border-b border-white/10 px-6 py-4 max-w-md mx-auto overflow-hidden" style={{ background: 'linear-gradient(180deg, rgba(13,10,8,0.95) 0%, rgba(13,10,8,0.85) 100%)' }}>
        <div className="relative flex justify-between items-center z-10">
          <div>
            <h1 className="text-xl font-orbitron font-bold text-white tracking-tighter leading-none flex items-center">
              DINGS <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#d97757] to-[#d4a55a] ml-1 mr-2">FITNESS</span>
              {activeTab === 'dashboard' && (
                /* Steady warm dot — dropped the cyberpunk ping pulse. */
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[#d4a55a]"></span>
              )}
            </h1>
            <p className="text-[9px] text-gray-500 font-mono uppercase tracking-[0.2em] mt-1">{currentDate}</p>
          </div>
          {/* Avatar is now the entry point to the Profile screen — since
              Profile no longer has its own bottom dock slot. Tap to jump. */}
          <button
            onClick={() => onTabChange('profile')}
            className="w-9 h-9 rounded-full border border-white/10 p-0.5 overflow-hidden shadow-lg bg-black relative flex items-center justify-center hover:border-cyan-400/50 transition-colors"
            aria-label="Open profile"
          >
            {profile?.profilePicture ? (
              <img src={profile.profilePicture} className="rounded-full w-full h-full object-cover opacity-80" alt="Avatar" />
            ) : (
               <div className="w-full h-full rounded-full flex items-center justify-center bg-[#d97757]">
                  <span className="font-orbitron font-bold text-white text-xs">{firstInitial}</span>
               </div>
            )}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="pt-24 px-4 fade-in">
        {children}
      </main>

      {/* Floating Dock Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-[#0a0a0a]/95 rounded-t-2xl rounded-b-none p-2 flex justify-between items-center z-50 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] border-t border-white/10 backdrop-blur-md pb-safe">
        {tabs.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`flex-1 flex flex-col items-center py-2 h-[60px] justify-center transition-all duration-300 relative group`}
              >
                {/* Active Indicator Top Border */}
                {isActive && <div className={`absolute top-0 left-1/4 right-1/4 h-[1px] border-t var(--${tab.borderClass.substring(7)}) ${tab.borderClass}`}></div>}
                
                <span className={`text-xl transform transition-transform duration-300 ${isActive ? 'scale-110 -translate-y-0.5' : 'opacity-40 group-hover:opacity-100 group-hover:scale-105'}`}>
                    {tab.icon(isActive)}
                </span>
                
                {isActive && (
                    <span className={`text-[8px] font-bold mt-1 uppercase tracking-widest animate-fade-in opacity-80`}>
                        {tab.label}
                    </span>
                )}
              </button>
            )
        })}
      </nav>
    </div>
  );
};
