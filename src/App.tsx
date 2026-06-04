// @ts-nocheck
import React, { useState } from 'react';
import { format, subDays } from 'date-fns';
import { Activity, Flame, Scale, Brain, AlertTriangle, CheckCircle2, TrendingUp, Moon, Apple } from 'lucide-react';
import { 
  DailyLog, 
  calculateVolume, 
  calculateNetCalories, 
  isHypertrophicStimulusActive, 
  isMusclePreservationRisk, 
  isVisceralAccumulationRisk, 
  calculateRecompScore, 
  calculateGrowthDelta, 
  generateMotivationMap 
} from './utils/calculations';
import { MotivationMap } from './components/MotivationMap';
import { InputPanel } from './components/InputPanel';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const generateMockData = (): DailyLog[] => {
  const logs: DailyLog[] = [];
  for (let i = 0; i < 14; i++) {
    const date = format(subDays(new Date(), i), 'yyyy-MM-dd');
    const isWorkoutDay = i % 2 === 0;
    logs.push({
      date,
      foodCalories: 2200 + Math.random() * 200 - 100,
      protein: 190 + Math.random() * 30,
      sugar: 40 + Math.random() * 20,
      fiber: 20 + Math.random() * 10,
      workoutCalories: isWorkoutDay ? 400 + Math.random() * 200 : 0,
      weight: isWorkoutDay ? 135 - i * 2 : 0, // Trending up towards today
      reps: isWorkoutDay ? 10 : 0,
      sets: isWorkoutDay ? 3 : 0,
      sleepHours: 6.5 + Math.random() * 2,
      visceralFatLevel: 10,
    });
  }
  return logs;
};

export default function App() {
  const [logs, setLogs] = useState<DailyLog[]>(generateMockData());
  const todayDate = format(new Date(), 'yyyy-MM-dd');
  
  const todayLog = logs.find(l => l.date === todayDate) || {
    date: todayDate,
    foodCalories: 0,
    protein: 0,
    sugar: 0,
    fiber: 0,
    workoutCalories: 0,
    weight: 0,
    reps: 0,
    sets: 0,
    sleepHours: 0,
    visceralFatLevel: 10,
  };

  const handleSave = (newLog: DailyLog) => {
    setLogs(prev => {
      const existing = prev.findIndex(l => l.date === newLog.date);
      if (existing >= 0) {
        const newLogs = [...prev];
        newLogs[existing] = newLog;
        return newLogs;
      }
      return [newLog, ...prev].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    });
  };

  const currentLog = logs[0]; // Most recent
  
  const netCalories = calculateNetCalories(currentLog);
  const volume = calculateVolume(currentLog);
  const isHypertrophic = isHypertrophicStimulusActive(logs);
  const muscleRisk = isMusclePreservationRisk(currentLog);
  const visceralRisk = isVisceralAccumulationRisk(currentLog);
  const recompScore = calculateRecompScore(currentLog);
  const growthDelta = calculateGrowthDelta(currentLog);
  const motivationMapData = generateMotivationMap(logs);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Bio Vision</h1>
          </div>
          <div className="text-sm font-medium text-slate-500">
            {format(new Date(), 'EEEE, MMMM do')}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        
        {/* Input Section */}
        <InputPanel initialData={todayLog} onSave={handleSave} />

        {/* Daily Summary Dashboard */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col">
            <div className="flex items-center gap-2 text-slate-500 mb-3">
              <Flame className="w-4 h-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">Net Calories</span>
            </div>
            <div className="text-3xl font-light tracking-tight mb-1">{Math.round(netCalories)}</div>
            <div className="text-xs text-slate-400 mt-auto">
              {Math.round(currentLog.foodCalories)} in - {Math.round(currentLog.workoutCalories)} out
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col">
            <div className="flex items-center gap-2 text-slate-500 mb-3">
              <Scale className="w-4 h-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">Work Volume</span>
            </div>
            <div className="text-3xl font-light tracking-tight mb-1">{volume}</div>
            <div className="text-xs text-slate-400 mt-auto">
              {currentLog.weight}lbs × {currentLog.reps}r × {currentLog.sets}s
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col">
            <div className="flex items-center gap-2 text-slate-500 mb-3">
              <Brain className="w-4 h-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">Recomp Score</span>
            </div>
            <div className="flex items-end gap-1 mb-1">
              <span className="text-3xl font-light tracking-tight">{recompScore}</span>
              <span className="text-lg text-slate-400 mb-1">/10</span>
            </div>
            <div className="text-xs text-slate-400 mt-auto">
              Based on calorie window & protein
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col">
            <div className="flex items-center gap-2 text-slate-500 mb-3">
              <TrendingUp className="w-4 h-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">Growth Delta</span>
            </div>
            <div className="text-xl font-medium tracking-tight text-emerald-600 mb-1">{growthDelta}</div>
            <div className="text-xs text-slate-400 mt-auto">
              Vol + Protein + Sleep
            </div>
          </div>

        </div>

        {/* Status Flags */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          <div className={cn(
            "p-4 rounded-xl border flex items-start gap-3 transition-colors",
            isHypertrophic ? "bg-emerald-50 border-emerald-200" : "bg-slate-50 border-slate-200"
          )}>
            {isHypertrophic ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" /> : <Activity className="w-5 h-5 text-slate-400 shrink-0" />}
            <div>
              <h3 className={cn("font-medium text-sm mb-1", isHypertrophic ? "text-emerald-900" : "text-slate-700")}>
                Hypertrophic Stimulus
              </h3>
              <p className={cn("text-xs leading-relaxed", isHypertrophic ? "text-emerald-700" : "text-slate-500")}>
                {isHypertrophic ? "Active. Volume is trending upward over the last 3 sessions." : "Inactive. Need 3 consecutive sessions of increasing volume."}
              </p>
            </div>
          </div>

          <div className={cn(
            "p-4 rounded-xl border flex items-start gap-3 transition-colors",
            muscleRisk ? "bg-rose-50 border-rose-200" : "bg-slate-50 border-slate-200"
          )}>
            {muscleRisk ? <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" /> : <CheckCircle2 className="w-5 h-5 text-slate-400 shrink-0" />}
            <div>
              <h3 className={cn("font-medium text-sm mb-1", muscleRisk ? "text-rose-900" : "text-slate-700")}>
                Muscle Preservation
              </h3>
              <p className={cn("text-xs leading-relaxed", muscleRisk ? "text-rose-700" : "text-slate-500")}>
                {muscleRisk ? "Risk! Protein < 180g while burning > 500 cals." : "Safe. Protein intake is sufficient for activity level."}
              </p>
            </div>
          </div>

          <div className={cn(
            "p-4 rounded-xl border flex items-start gap-3 transition-colors",
            visceralRisk ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-200"
          )}>
            {visceralRisk ? <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" /> : <CheckCircle2 className="w-5 h-5 text-slate-400 shrink-0" />}
            <div>
              <h3 className={cn("font-medium text-sm mb-1", visceralRisk ? "text-amber-900" : "text-slate-700")}>
                Visceral Accumulation
              </h3>
              <p className={cn("text-xs leading-relaxed", visceralRisk ? "text-amber-700" : "text-slate-500")}>
                {visceralRisk ? "Risk! High sugar or low fiber with Visceral Fat Level 10." : "Safe. Sugar and fiber are within healthy ranges."}
              </p>
            </div>
          </div>

        </div>

        {/* Motivation Map */}
        <MotivationMap data={motivationMapData} />

      </main>
    </div>
  );
}
