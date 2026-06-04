
import React from 'react';
import { motion } from 'motion/react';

interface MacroReactorProps {
  consumedCals: number;
  targetCals: number;
  consumedProt: number;
  targetProt: number;
  consumedCarbs: number;
  targetCarbs: number;
  consumedFat: number;
  targetFat: number;
}

export const MacroReactor: React.FC<MacroReactorProps> = ({ 
  consumedCals, 
  targetCals, 
  consumedProt, 
  targetProt,
  consumedCarbs,
  targetCarbs,
  consumedFat,
  targetFat
}) => {
  const size = 320;
  const center = size / 2;
  
  // Rings configuration
  const rings = [
    { radius: 130, stroke: 12, color: '#ef4444', consumed: consumedCals, target: targetCals, label: 'Calories' },
    { radius: 105, stroke: 10, color: '#10b981', consumed: consumedProt, target: targetProt, label: 'Protein' },
    { radius: 85, stroke: 8, color: '#3b82f6', consumed: consumedCarbs, target: targetCarbs, label: 'Carbs' },
    { radius: 70, stroke: 6, color: '#f59e0b', consumed: consumedFat, target: targetFat, label: 'Fat' },
  ];

  return (
    <div className="relative flex flex-col items-center justify-center py-8">
      {/* Glow Backdrop */}
      <div className="absolute inset-0 bg-emerald-500/5 blur-[80px] rounded-full"></div>

      <div className="relative">
        <svg width={size} height={size} className="transform -rotate-90">
          {rings.map((ring, i) => {
            const circ = 2 * Math.PI * ring.radius;
            const pct = Math.min(ring.consumed / ring.target, 1);
            const offset = circ - (pct * circ);
            
            return (
              <g key={ring.label}>
                {/* Track */}
                <circle
                  cx={center} cy={center} r={ring.radius}
                  fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth={ring.stroke}
                />
                {/* Progress */}
                <motion.circle
                  initial={{ strokeDashoffset: circ }}
                  animate={{ strokeDashoffset: offset }}
                  transition={{ duration: 1.5, ease: "easeOut", delay: i * 0.1 }}
                  cx={center} cy={center} r={ring.radius}
                  fill="none"
                  stroke={ring.color}
                  strokeWidth={ring.stroke}
                  strokeDasharray={circ}
                  strokeLinecap="round"
                  style={{ filter: `drop-shadow(0 0 4px ${ring.color}66)` }}
                />
              </g>
            );
          })}
        </svg>

        {/* Center Content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[10px] text-white/30 uppercase tracking-[0.2em] font-bold mb-1">Remaining</span>
          <div className="text-4xl font-mono font-bold text-white tracking-tighter">
            {Math.max(0, targetCals - consumedCals)}
          </div>
          <span className="text-[10px] text-white/30 uppercase tracking-widest font-bold mt-1">kcal</span>
        </div>
      </div>

      {/* Macro Legend */}
      <div className="grid grid-cols-2 gap-x-12 gap-y-4 mt-8 w-full max-w-xs">
        {rings.slice(1).map((ring) => (
          <div key={ring.label} className="flex flex-col">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ring.color }} />
              <span className="text-[10px] text-white/40 uppercase font-bold tracking-widest">{ring.label}</span>
            </div>
            <div className="flex items-baseline gap-1 font-mono">
              <span className="text-lg font-bold text-white">{Math.round(ring.consumed)}</span>
              <span className="text-[10px] text-white/20 font-bold">/ {ring.target}g</span>
            </div>
            <div className="w-full h-1 bg-white/5 rounded-full mt-1 overflow-hidden">
              <div 
                className="h-full transition-all duration-1000" 
                style={{ 
                  backgroundColor: ring.color, 
                  width: `${Math.min(100, (ring.consumed / ring.target) * 100)}%` 
                }} 
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
