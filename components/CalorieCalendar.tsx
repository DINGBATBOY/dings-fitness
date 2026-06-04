
import React from 'react';
import { DailyLog } from '../types';

interface CalorieCalendarProps {
  logs: DailyLog[];
  targetCalories: number;
}

export const CalorieCalendar: React.FC<CalorieCalendarProps> = ({ logs, targetCalories }) => {
  if (logs.length === 0) {
      return (
          <div className="w-full text-center py-6">
              <p className="text-gray-500 text-sm uppercase tracking-widest font-bold">Start logging to see your calendar fill up</p>
          </div>
      );
  }

  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const startDay = new Date(currentYear, currentMonth, 1).getDay(); // 0 = Sun, 1 = Mon...
  
  // Adjust so Monday is first day of week if preferred, but standard Sun is fine.
  // Let's normalize data for quick lookup
  const logMap = new Map<number, DailyLog>();
  logs.forEach(log => {
      const d = new Date(log.date);
      if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
          logMap.set(d.getDate(), log);
      }
  });

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: startDay }, (_, i) => i);

  const getDayColor = (day: number) => {
      const log = logMap.get(day);
      if (!log) return "bg-white/5 border-white/10"; // No data

      const adherence = log.caloriesConsumed / targetCalories;
      
      if (adherence > 1.1) return "bg-red-500/20 border-red-500 text-red-500"; // Over (>110%)
      if (adherence < 0.6) return "bg-yellow-500/20 border-yellow-500 text-yellow-500"; // Undereating significantly
      return "bg-green-500/20 border-green-500 text-green-500"; // Good range
  };

  return (
    <div className="w-full">
        <div className="flex justify-between items-center mb-4">
            <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                {today.toLocaleString('default', { month: 'long' })} Protocol
            </h4>
            <div className="flex gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500/50"></div>
                <div className="w-2 h-2 rounded-full bg-red-500/50"></div>
            </div>
        </div>

        <div className="grid grid-cols-7 gap-2 mb-2">
            {['S','M','T','W','T','F','S'].map((d,i) => (
                <div key={i} className="text-center text-[9px] font-bold text-gray-600">{d}</div>
            ))}
        </div>

        <div className="grid grid-cols-7 gap-2">
            {blanks.map(b => <div key={`blank-${b}`} className="aspect-square"></div>)}
            
            {days.map(day => {
                const log = logMap.get(day);
                const isToday = day === today.getDate();
                return (
                    <div 
                        key={day} 
                        className={`aspect-square rounded-lg border flex flex-col items-center justify-center relative ${getDayColor(day)} ${isToday ? 'ring-1 ring-white' : ''}`}
                    >
                        <span className="text-[10px] font-bold">{day}</span>
                        {log && (
                            <span className="text-[7px] opacity-70 mt-0.5">{Math.round(log.caloriesConsumed/100)}k</span>
                        )}
                    </div>
                );
            })}
        </div>
    </div>
  );
};
