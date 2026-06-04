
import React from 'react';

interface MuscleMapProps {
  muscles: string[]; // e.g., ['chest', 'arms']
  className?: string;
}

export const MuscleMap: React.FC<MuscleMapProps> = ({ muscles, className = "" }) => {
  const isActive = (key: string) => muscles.includes(key);
  const activeColor = "#f97316";
  const inactiveColor = "rgba(255, 255, 255, 0.1)";

  // Helper for glowing effect
  const getFilter = (key: string) => isActive(key) ? "drop-shadow(0 0 4px rgba(255, 34, 34, 0.8))" : "none";

  return (
    <svg viewBox="0 0 100 200" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
       {/* Head (Generic) */}
       <path d="M50 15 C50 15 58 15 58 25 C58 35 50 38 50 38 C50 38 42 35 42 25 C42 15 50 15 50 15" 
             fill={inactiveColor} stroke="none" />

       {/* Chest / Pecs */}
       <path d="M38 42 L50 45 L62 42 C62 42 65 55 62 58 L50 60 L38 58 C35 55 38 42 38 42 Z"
             fill={isActive('chest') || isActive('stamina') ? activeColor : inactiveColor} 
             style={{ filter: getFilter('chest') }} />

       {/* Shoulders / Arms */}
       <path d="M38 42 L25 50 L20 80 L28 75 L35 55 Z" 
             fill={isActive('arms') || isActive('stamina') ? activeColor : inactiveColor} 
             style={{ filter: getFilter('arms') }} />
       <path d="M62 42 L75 50 L80 80 L72 75 L65 55 Z" 
             fill={isActive('arms') || isActive('stamina') ? activeColor : inactiveColor} 
             style={{ filter: getFilter('arms') }} />

       {/* Abs / Core */}
       <path d="M40 60 L50 62 L60 60 L58 85 L42 85 Z" 
             fill={isActive('stamina') ? activeColor : inactiveColor} 
             style={{ filter: getFilter('stamina') }} />

       {/* Back (Visible as Traps/Lats contour for simplicity in 2D or implicit) */}
       {/* Visualizing Back as outer contour or distinct blocks if 'back' is active */}
       {isActive('back') && (
         <>
            <path d="M35 42 L30 60 L38 70" stroke={activeColor} strokeWidth="2" style={{ filter: getFilter('back') }} />
            <path d="M65 42 L70 60 L62 70" stroke={activeColor} strokeWidth="2" style={{ filter: getFilter('back') }} />
         </>
       )}

       {/* Legs (Quads) */}
       <path d="M40 88 L58 88 L65 130 L55 140 L45 140 L35 130 Z" 
             fill={isActive('legs') || isActive('stamina') ? activeColor : inactiveColor} 
             style={{ filter: getFilter('legs') }} />
             
       {/* Legs (Calves) */}
       <path d="M45 145 L55 145 L58 180 L50 190 L42 180 Z" 
             fill={isActive('legs') || isActive('stamina') ? activeColor : inactiveColor} 
             style={{ filter: getFilter('legs') }} />

       {/* Tech Grid Overlay */}
       <line x1="10" y1="10" x2="10" y2="190" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
       <line x1="90" y1="10" x2="90" y2="190" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
       <line x1="50" y1="10" x2="50" y2="190" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" strokeDasharray="2 2" />
    </svg>
  );
};
