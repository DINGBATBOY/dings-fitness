
import React from 'react';

interface ProgressRingProps {
  progress: number;
  size: number;
  strokeWidth: number;
  color: string;
  label: string;
  value: string | number;
}

export const ProgressRing: React.FC<ProgressRingProps> = ({ progress, size, strokeWidth, color, label, value }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (Math.min(progress, 1) * circumference);

  return (
    <div className="relative flex flex-col items-center">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          stroke="rgba(255,255,255,0.05)"
          strokeWidth={strokeWidth}
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        <circle
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
          className="transition-all duration-500 ease-out"
          style={{ filter: `drop-shadow(0 0 5px ${color})` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-xs font-bold text-white font-mono">{value}</span>
        <span className="text-[8px] text-gray-500 uppercase tracking-widest">{label}</span>
      </div>
    </div>
  );
};
