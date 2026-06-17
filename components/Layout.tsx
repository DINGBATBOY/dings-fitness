
import React from 'react';
import { Feather, Flame, Utensils, BookOpen, Zap, MessageCircle } from 'lucide-react';
import { UserProfile } from '../types';

export const Layout: React.FC<{ children: React.ReactNode, activeTab: string, onTabChange: (tab: string) => void, profile?: UserProfile }> = ({ children, activeTab, onTabChange, profile }) => {
  // Whole app is on the cream/parchment Mati-Watsā theme. The header +
  // dock chrome are warm cream with soft warm-brown line icons.
  //
  // Bottom dock — 6 tabs. Eats kept because the macro-fit AI card +
  // 44-restaurant DB is a hero feature that earns its dock slot. Recomp
  // absorbed into Reflect; Profile lives behind the header avatar tap.
  const tabs = [
    { id: 'dashboard',   label: 'Fuel',    Icon: Flame },
    { id: 'restaurants', label: 'Eats',    Icon: Utensils },
    { id: 'journal',     label: 'Log',     Icon: BookOpen },
    { id: 'reflect',     label: 'Reflect', Icon: Feather },
    { id: 'workouts',    label: 'Dings',   Icon: Zap },
    { id: 'coach',       label: 'Coach',   Icon: MessageCircle },
  ];

  const currentDate = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: '2-digit' }).toUpperCase().replace(',', ' ·');
  const firstInitial = profile?.name ? profile.name.charAt(0).toUpperCase() : '?';

  // Cream/parchment chrome tokens. Kept inline rather than imported so
  // Layout has no external dependency on the cream-theme util — they're
  // identical values, just convenient to inline at the root of the app.
  const theme = {
    rootBg: '#f5ede1',
    headerBg: 'linear-gradient(180deg, rgba(245,237,225,0.96) 0%, rgba(245,237,225,0.88) 100%)',
    headerBorder: 'rgba(58,40,24,0.10)',
    wordmarkFrom: '#7a4a30',
    wordmarkTo: '#b88860',
    wordmarkText: '#3a2818',
    dateText: '#a09080',
    avatarBorder: 'rgba(58,40,24,0.15)',
    dockBg: 'rgba(245,237,225,0.96)',
    dockBorder: 'rgba(58,40,24,0.10)',
    iconActive: '#7a4a30',
    iconInactive: '#a09080',
    activeLabel: '#3a2818',
    activeIndicator: '#7a4a30',
  };

  return (
    <div className="min-h-screen pb-32 max-w-md mx-auto relative transition-colors duration-300" style={{ background: theme.rootBg }}>
      <header
        className="fixed top-0 left-0 right-0 z-40 px-6 py-4 max-w-md mx-auto overflow-hidden transition-colors duration-300"
        style={{ background: theme.headerBg, borderBottom: `1px solid ${theme.headerBorder}` }}
      >
        <div className="relative flex justify-between items-center z-10">
          <div>
            <h1 className="text-xl font-orbitron font-bold tracking-tighter leading-none flex items-center" style={{ color: theme.wordmarkText }}>
              DINGS
              <span
                className="text-transparent bg-clip-text ml-1 mr-2"
                style={{ backgroundImage: `linear-gradient(to right, ${theme.wordmarkFrom}, ${theme.wordmarkTo})` }}
              >
                FITNESS
              </span>
              {activeTab === 'dashboard' && (
                <span className="inline-flex h-1.5 w-1.5 rounded-full" style={{ background: theme.activeIndicator }}></span>
              )}
            </h1>
            <p className="text-[9px] font-mono uppercase tracking-[0.2em] mt-1" style={{ color: theme.dateText }}>{currentDate}</p>
          </div>
          {/* Avatar — tap to navigate to profile. Border adapts to theme. */}
          <button
            onClick={() => onTabChange('profile')}
            className="w-9 h-9 rounded-full p-0.5 overflow-hidden shadow-lg relative flex items-center justify-center transition-colors"
            style={{ border: `1px solid ${theme.avatarBorder}`, background: '#fff' }}
            aria-label="Open profile"
          >
            {profile?.profilePicture ? (
              <img src={profile.profilePicture} className="rounded-full w-full h-full object-cover" alt="Avatar" />
            ) : (
               <div className="w-full h-full rounded-full flex items-center justify-center" style={{ background: '#d97757' }}>
                  <span className="font-orbitron font-bold text-white text-xs">{firstInitial}</span>
               </div>
            )}
          </button>
        </div>
      </header>

      <main className="pt-24 px-4 fade-in">
        {children}
      </main>

      <nav
        className="fixed bottom-0 left-0 right-0 max-w-md mx-auto rounded-t-2xl rounded-b-none p-2 flex justify-between items-center z-50 backdrop-blur-md pb-safe transition-colors duration-300"
        style={{
          background: theme.dockBg,
          borderTop: `1px solid ${theme.dockBorder}`,
          boxShadow: '0 -10px 40px rgba(58,40,24,0.08)',
        }}
      >
        {tabs.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              data-tour={tab.id === 'restaurants' ? 'eats-tab' : tab.id === 'reflect' ? 'reflect-tab' : undefined}
              onClick={() => onTabChange(tab.id)}
              className="flex-1 flex flex-col items-center py-2 h-[60px] justify-center transition-all duration-300 relative group"
            >
              {isActive && (
                <div
                  className="absolute top-0 left-1/4 right-1/4 h-[1px]"
                  style={{ background: theme.activeIndicator }}
                ></div>
              )}
              <tab.Icon
                className="w-5 h-5 transition-all duration-300"
                strokeWidth={1.5}
                style={{
                  color: isActive ? theme.iconActive : theme.iconInactive,
                  transform: isActive ? 'scale(1.1) translateY(-2px)' : 'none',
                }}
              />
              {isActive && (
                <span className="text-[8px] font-bold mt-1 uppercase tracking-widest animate-fade-in" style={{ color: theme.activeLabel }}>
                  {tab.label}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
};
