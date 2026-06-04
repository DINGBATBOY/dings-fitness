import React, { useMemo } from 'react';
import { AppState } from '../types';
import { CALCULATE_TDEE } from '../constants';

interface RecompVelocityProps {
  appState: AppState;
  workoutSplit: any[];
}

const WarningIcon = () => (
  <svg className="w-5 h-5 text-alert" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
);
const CheckIcon = () => (
  <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
);
const ShieldIcon = () => (
  <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
);

export const RecompVelocity: React.FC<RecompVelocityProps> = ({ appState, workoutSplit }) => {
  const targetCalories = appState.nutritionTargets?.calories || 2000;
  const targetProtein = appState.nutritionTargets?.protein || 150;
  const todayCalories = appState.todayLog.reduce((acc, item) => acc + (item.calories || 0), 0);
  const todayProtein = appState.todayLog.reduce((acc, item) => acc + (item.protein || 0), 0);
  const todayCaloriesBurned = appState.activityBurn || 0;
  const waterIntake = appState.waterIntake || 0;

  // 1. Track the Work (Volume Progression Rate)
  const workoutLogs = useMemo(() => {
    return appState.dailyLogs
      .filter(log => log.workoutCompleted && log.workoutVolume !== undefined)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [appState.dailyLogs]);

  if (workoutLogs.length === 0) {
      return (
          <div className="space-y-6 pb-20 animate-fade-in flex flex-col items-center justify-center pt-20 text-center">
              <h3 className="text-xl font-orbitron font-bold text-white tracking-tighter mb-4">
                  RECOMP <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">VELOCITY</span>
              </h3>
              <div className="glass-panel border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] p-8 rounded-3xl border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] max-w-sm">
                  <p className="text-gray-400 text-sm">Complete your first workout to start tracking velocity</p>
              </div>
          </div>
      );
  }

  const strengthTrend = useMemo(() => {
    if (workoutLogs.length < 3) return { text: "Gathering Data (need 3+ workouts)", rate: 0 };
    
    let recentSum = 0;
    let recentCount = 0;
    for(let i=0; i<Math.min(2, workoutLogs.length); i++) {
        recentSum += workoutLogs[i].workoutVolume || 0;
        recentCount++;
    }
    const recentAvg = recentSum / recentCount;

    let baselineSum = 0;
    let baselineCount = 0;
    for(let i=2; i<Math.min(5, workoutLogs.length); i++) {
        baselineSum += workoutLogs[i].workoutVolume || 0;
        baselineCount++;
    }
    const baselineAvg = baselineCount > 0 ? (baselineSum / baselineCount) : recentAvg;

    if (baselineAvg === 0) return { text: "Volume Maintained →", rate: 0 };

    const rate = ((recentAvg - baselineAvg) / baselineAvg) * 100;
    
    if (rate > 5) return { text: `Progressive Overload Active ↑ ${rate.toFixed(1)}%`, rate };
    if (rate < -5) return { text: `Volume Declining ↓ ${Math.abs(rate).toFixed(1)}%`, rate };
    return { text: "Volume Maintained →", rate };
  }, [workoutLogs]);

  // 2. Protect the Muscle
  const currentWeight = appState.profile?.weight || 200;
  const currentSMM = useMemo(() => {
    const bf = appState.profile?.bodyFat || 25;
    return appState.profile?.inBodyData?.smm || (currentWeight * (1 - bf / 100) * 0.55);
  }, [appState.profile, currentWeight]);

  const proteinShortfall = (currentWeight * 0.7) - todayProtein;
  const musclePreservationRisk = todayProtein < (currentWeight * 0.7) && todayCaloriesBurned > 400;

  // 3. Watch the "Stomach Fat" & Rest Day
  const todaySugar = appState.todayLog.reduce((acc, item) => acc + (item.sugar || 0), 0);
  const todayFiber = appState.todayLog.reduce((acc, item) => acc + (item.fiber || 0), 0);
  
  const hasLoggedFood = appState.todayLog.length > 0;
  const visceralRisk = hasLoggedFood && (todaySugar > 60 || todayFiber < 20);
  
  const tdee = appState.profile ? CALCULATE_TDEE(
    appState.profile.weight,
    appState.profile.height,
    appState.profile.age,
    appState.profile.activityLevel,
    appState.profile.sex,
    appState.profile.inBodyData?.pbf ?? appState.profile.bodyFat,
  ) : 2500;
  const todayWorkoutCompleted = appState.dailyLogs.some(l => l.date === new Date().toISOString().split('T')[0] && l.workoutCompleted);
  const netCalories = todayCalories; // Intake
  const overfeedingRisk = hasLoggedFood && !todayWorkoutCompleted && netCalories > (tdee + 400);

  // 4. Daily Dashboard Output
  const recompScoreData = useMemo(() => {
    let score = 2; // base
    let notes = [];
    
    const calDiff = Math.abs(todayCalories - targetCalories);
    if (calDiff <= 100) { score += 3; notes.push("+3: Calories dialed in"); }
    else if (calDiff <= 250) { score += 1; notes.push("+1: Calories close"); }
    else { score -= 2; notes.push("-2: Calories off target"); }

    if (todayProtein >= targetProtein) { score += 2; notes.push("+2: Protein target hit"); }
    else if (todayProtein >= targetProtein * 0.85) { score += 1; notes.push("+1: Protein adequate"); }
    else if (todayProtein < targetProtein * 0.7) { score -= 2; notes.push("-2: Protein far too low"); }

    if (todayWorkoutCompleted) { score += 1; notes.push("+1: Workout completed"); }
    if (waterIntake >= 80) { score += 1; notes.push("+1: Hydration on point"); }
    if (appState.todayLog.length >= 7) { score += 1; notes.push("+1: Consistent logging"); }

    return {
      total: Math.max(1, Math.min(10, score)),
      notes
    };
  }, [todayCalories, targetCalories, todayProtein, targetProtein, todayWorkoutCompleted, waterIntake, appState.todayLog]);

  const recoveryIndex = useMemo(() => {
    const proteinFactor = targetProtein > 0 ? Math.min(1, todayProtein / targetProtein) : 0;
    
    let workoutLast48h = false;
    if (workoutLogs.length > 0) {
       const lastWorkoutTime = new Date(workoutLogs[0].date).getTime();
       if (Date.now() - lastWorkoutTime < 48 * 3600 * 1000) {
           workoutLast48h = true;
       }
    }
    const trainingFactor = workoutLast48h ? 1 : 0.5; // partial credit if resting
    
    const todaySleep = appState.dailyLogs
      .find(l => l.date === new Date().toLocaleDateString())
      ?.sleepHours;
    const sleepFactor = todaySleep ? Math.min(1, todaySleep / 8) : 0.75;
    
    const caloricFactor = Math.abs(todayCalories - targetCalories) <= 300 ? 1 : 0;
    const hydrationFactor = Math.min(1, waterIntake / 80);
    
    const avg = (proteinFactor + trainingFactor + sleepFactor + caloricFactor + hydrationFactor) / 5;
    const percentage = Math.round(avg * 100);
    
    let label = "Recovery Debt";
    let colorClass = "text-alert";
    if (percentage >= 80) { label = "Primed for Growth"; colorClass = "text-accent"; }
    else if (percentage >= 60) { label = "Moderate Recovery"; colorClass = "text-yellow-400"; }
    
    return { percentage, label, colorClass };
  }, [todayProtein, targetProtein, workoutLogs, todayCalories, targetCalories, waterIntake]);

  // 5. Weekly Motivation Map
  const weeklyMap = useMemo(() => {
    const startingWeight = appState.profile?.initialWeight || appState.profile?.weight || 200;
    const startingBF = appState.profile?.bodyFat || 25;
    
    // Calculate 7-day average calories & protein
    const last7Logs = appState.dailyLogs.slice(0, 7);
    const avgConsumed = last7Logs.length > 0 ? last7Logs.reduce((acc, l) => acc + (l.caloriesConsumed || 0), 0) / last7Logs.length : todayCalories;
    const avgProtein = last7Logs.length > 0 ? last7Logs.reduce((acc, l) => acc + (l.proteinConsumed || 0), 0) / last7Logs.length : todayProtein;
    
    const avgDailyDeficit = tdee - avgConsumed;
    let weeklyLoss = (avgDailyDeficit * 7) / 3500;
    weeklyLoss = Math.max(-1, Math.min(1.5, weeklyLoss)); // Cap at 1.5 loss or 1 lb gain per week
    
    const weeksOut = 4;
    const projectedWeight = startingWeight - (weeklyLoss * weeksOut);
    const expectedFatLossLbs = weeklyLoss * weeksOut * (avgDailyDeficit > 0 ? 0.9 : -0.5); // Assume 90% is fat if cutting
    
    const startingFatLbs = startingWeight * (startingBF / 100);
    const projectedFatLbs = startingFatLbs - expectedFatLossLbs;
    const projectedBodyFat = Math.max(5, (projectedFatLbs / projectedWeight) * 100);
    
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + (weeksOut * 7));
    const targetDateString = targetDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

    if (avgDailyDeficit < -300) {
       return `If you maintain this surplus and lifting volume, expect steady mass accretion. Projected weight: ${projectedWeight.toFixed(1)} lbs by ${targetDateString}.`;
    }

    return `If you keep up this average deficit and lifting volume, you're projected to reach ${projectedWeight.toFixed(1)} lbs and ${projectedBodyFat.toFixed(1)}% body fat by ${targetDateString} while protecting your ${currentSMM.toFixed(1)} lbs of muscle.`;
  }, [appState.profile, appState.dailyLogs, tdee, todayCalories, currentSMM]);

  return (
    <div className="space-y-6 pb-20 animate-fade-in">
      <div className="flex items-center justify-between px-2">
        <h3 className="text-xl font-orbitron font-bold text-white tracking-tighter">
          RECOMP <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">VELOCITY</span>
        </h3>
      </div>

      {/* 4. Daily Dashboard Output */}
      <div className="grid grid-cols-2 gap-4">
        <div className="glass-panel p-4 rounded-3xl border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] relative overflow-hidden">
          <div className="absolute -right-4 -top-4 w-20 h-20 bg-primary/20 rounded-full blur-xl"></div>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">Recomp Score</p>
          <div className="flex items-end gap-1 font-mono">
            <span className="text-4xl font-bold text-white">{recompScoreData.total}</span>
            <span className="text-sm text-gray-500 mb-1">/10</span>
          </div>
          <div className="mt-2 space-y-1">
             {recompScoreData.notes.slice(0,2).map((n, i) => (
               <p key={i} className="text-[9px] text-gray-400 font-mono">{n}</p>
             ))}
          </div>
        </div>
        
        <div className="glass-panel p-4 rounded-3xl border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] relative overflow-hidden">
          <div className="absolute -right-4 -top-4 w-20 h-20 bg-accent/20 rounded-full blur-xl"></div>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">Recovery Index</p>
          <div className="flex items-end gap-1 font-mono">
            <span className={`text-3xl font-bold ${recoveryIndex.colorClass}`}>{recoveryIndex.percentage}%</span>
          </div>
          <p className={`text-[10px] font-bold mt-2 uppercase tracking-widest ${recoveryIndex.colorClass}`}>
             {recoveryIndex.label}
          </p>
        </div>
      </div>

      {/* 1. Track the Work */}
      <div className="glass-panel p-5 rounded-3xl border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-2xl">📈</span>
          <div>
            <h4 className="text-white font-bold text-sm uppercase tracking-widest">Strength Trend</h4>
            <p className="text-[10px] text-gray-400">Progression rate vs baseline</p>
          </div>
        </div>
        <div className={`p-3 rounded-xl border text-xs font-bold uppercase tracking-widest font-mono text-center ${
          strengthTrend.rate > 5
            ? "bg-accent/10 border-accent/30 text-accent" 
            : strengthTrend.rate < -5 
              ? "bg-alert/10 border-alert/30 text-alert"
              : "bg-white/5 border-white/10 text-white"
        }`}>
          {strengthTrend.text}
        </div>
      </div>

      {/* 2 & 3. Risks */}
      <div className="grid grid-cols-1 gap-4">
        {musclePreservationRisk && (
          <div className="p-4 rounded-2xl border bg-alert/10 border-alert/30">
            <div className="flex items-center gap-3 mb-2">
              <WarningIcon />
              <h4 className="font-bold text-xs uppercase tracking-widest text-alert">Muscle Risk</h4>
            </div>
            <p className="text-[11px] text-gray-300">
              High activity detected but protein is too low. You need <span className="font-mono text-white font-bold">{Math.ceil(proteinShortfall)}g</span> more protein today to protect your lean mass.
            </p>
          </div>
        )}
        
        {!musclePreservationRisk && (
           <div className="p-4 rounded-2xl border bg-white/5 border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
             <div className="flex items-center gap-3 mb-2">
               <ShieldIcon />
               <h4 className="font-bold text-xs uppercase tracking-widest text-white">Muscle Protected</h4>
             </div>
             <p className="text-[11px] text-gray-400">
               Protein intake is sufficient to preserve your <span className="font-mono">{currentSMM.toFixed(1)}</span> lbs SMM.
             </p>
           </div>
        )}

        {visceralRisk && (
          <div className="p-4 rounded-2xl border bg-primary/10 border-primary/30">
            <div className="flex items-center gap-3 mb-2">
              <WarningIcon />
              <h4 className="font-bold text-xs uppercase tracking-widest text-primary">Visceral Fat Risk</h4>
            </div>
            <p className="text-[11px] text-gray-300">
              Sugar is above 60g or fiber is below 20g. This macro profile drives visceral fat accumulation.
            </p>
          </div>
        )}
        
        {hasLoggedFood && !visceralRisk && (
           <div className="p-4 rounded-2xl border bg-white/5 border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
             <div className="flex items-center gap-3 mb-2">
               <CheckIcon />
               <h4 className="font-bold text-xs uppercase tracking-widest text-white">Visceral Drivers Optimal</h4>
             </div>
             <p className="text-[11px] text-gray-400">
               Sugar and fiber ratios are in an optimal range to minimize waistline fat storage.
             </p>
           </div>
        )}

        {overfeedingRisk && (
           <div className="p-4 rounded-2xl border bg-alert/10 border-alert/30">
            <div className="flex items-center gap-3 mb-2">
              <WarningIcon />
              <h4 className="font-bold text-xs uppercase tracking-widest text-alert">Overfeeding Risk</h4>
            </div>
            <p className="text-[11px] text-gray-300">
              Rest day detected, but calories are {Math.round(netCalories - tdee)} above maintenance. Excess will likely be stored as fat without a stimulus.
            </p>
          </div>
        )}
      </div>

      {/* 5. Weekly Motivation Map */}
      <div className="glass-panel p-5 rounded-3xl border border-primary/30 shadow-[inset_0_1px_0_rgba(249,115,22,0.1)] relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent"></div>
        <div className="relative z-10">
          <h4 className="text-primary font-bold text-xs uppercase tracking-widest mb-3">Weekly Motivation Map</h4>
          <p className="text-white/80 text-sm leading-relaxed italic">
            "{weeklyMap}"
          </p>
        </div>
      </div>
    </div>
  );
};

