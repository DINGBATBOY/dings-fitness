// DEPRECATED: Bio Vision prototype, not used
// @ts-nocheck
import { subDays, format, addWeeks } from 'date-fns';

export type DailyLog = {
  date: string;
  foodCalories: number;
  protein: number;
  sugar: number;
  fiber: number;
  workoutCalories: number;
  weight: number;
  reps: number;
  sets: number;
  sleepHours: number;
  visceralFatLevel: number;
};

export const calculateVolume = (log: DailyLog) => log.weight * log.reps * log.sets;
export const calculateNetCalories = (log: DailyLog) => log.foodCalories - log.workoutCalories;

export const isHypertrophicStimulusActive = (logs: DailyLog[]) => {
  // Needs at least 3 logs with volume > 0
  const workoutLogs = logs.filter(l => calculateVolume(l) > 0).slice(0, 3);
  if (workoutLogs.length < 3) return false;
  
  const v1 = calculateVolume(workoutLogs[0]); // most recent
  const v2 = calculateVolume(workoutLogs[1]);
  const v3 = calculateVolume(workoutLogs[2]); // oldest of the 3
  
  return v1 > v2 && v2 > v3;
};

export const isMusclePreservationRisk = (log: DailyLog) => {
  return log.protein < 180 && log.workoutCalories > 500;
};

export const isVisceralAccumulationRisk = (log: DailyLog) => {
  return (log.sugar > 50 || log.fiber < 25) && log.visceralFatLevel === 10;
};

export const calculateRecompScore = (log: DailyLog) => {
  let score = 5; // Base score
  
  // Calorie window: 2,100–2,350
  if (log.foodCalories >= 2100 && log.foodCalories <= 2350) {
    score += 3;
  } else if (log.foodCalories >= 1900 && log.foodCalories <= 2500) {
    score += 1;
  } else {
    score -= 2;
  }
  
  // Protein floor: 200g
  if (log.protein >= 200) {
    score += 2;
  } else if (log.protein >= 180) {
    score += 1;
  } else {
    score -= 2;
  }
  
  return Math.max(1, Math.min(10, score));
};

export const calculateGrowthDelta = (log: DailyLog) => {
  const volume = calculateVolume(log);
  let score = 0;
  
  if (volume > 5000) score += 2;
  else if (volume > 2000) score += 1;
  
  if (log.protein >= 200) score += 2;
  else if (log.protein >= 150) score += 1;
  
  if (log.sleepHours >= 7) score += 2;
  else if (log.sleepHours >= 6) score += 1;
  
  if (score >= 5) return "Optimal Repair";
  if (score >= 3) return "Moderate Repair";
  return "Suboptimal Repair";
};

export const generateMotivationMap = (logs: DailyLog[], currentWeight: number = 200, currentBf: number = 26, currentSmm: number = 87.1) => {
  const last7Days = logs.slice(0, 7);
  if (last7Days.length === 0) return null;
  
  const avgProtein = last7Days.reduce((sum, l) => sum + l.protein, 0) / last7Days.length;
  const avgNetCalories = last7Days.reduce((sum, l) => sum + calculateNetCalories(l), 0) / last7Days.length;
  const workoutDays = last7Days.filter(l => calculateVolume(l) > 0).length;
  
  const deficit = 2500 - avgNetCalories;
  const totalDeficit4Weeks = deficit * 28;
  const lbsLost = totalDeficit4Weeks / 3500;
  
  const startingWeight = currentWeight > 0 ? currentWeight : 200;
  const startingFatLbs = startingWeight * (currentBf / 100);
  const newFatLbs = Math.max(0, startingFatLbs - lbsLost);
  const newWeight = Math.max(150, startingWeight - lbsLost);
  const newBf = (newFatLbs / newWeight) * 100;
  
  const targetDate = addWeeks(new Date(), 4);
  const formattedDate = format(targetDate, 'MMMM do');
  
  const projectionText = `If you maintain this ${Math.round(avgProtein)}g protein average and ${workoutDays}x/week lifting volume, your body fat is projected to drop to ${newBf.toFixed(1)}% by ${formattedDate} while maintaining your ${currentSmm.toFixed(1)} lbs of muscle.`;
  
  const chartData = [];
  for (let i = 0; i <= 4; i++) {
    const weekDate = addWeeks(new Date(), i);
    const weekLbsLost = (deficit * 7 * i) / 3500;
    const weekNewFatLbs = Math.max(0, startingFatLbs - weekLbsLost);
    const weekNewWeight = Math.max(150, startingWeight - weekLbsLost);
    const weekBf = (weekNewFatLbs / weekNewWeight) * 100;
    
    chartData.push({
      week: `Week ${i}`,
      date: format(weekDate, 'MMM d'),
      bodyFat: parseFloat(weekBf.toFixed(1)),
      muscleMass: currentSmm
    });
  }
  
  return {
    projectionText,
    chartData,
    avgProtein,
    workoutDays,
    avgNetCalories
  };
};
