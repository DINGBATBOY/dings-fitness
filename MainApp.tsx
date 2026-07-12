
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Layout } from './components/Layout';
import { ProgressRing } from './components/ProgressRing';
import { MacroReactor } from './components/MacroReactor';
import { MuscleMap } from './components/MuscleMap';
import { CalorieCalendar } from './components/CalorieCalendar';
import { Journal } from './components/Journal';
import { Auth } from './components/Auth';
import { Onboarding } from './components/Onboarding';
import { RecompVelocity } from './components/RecompVelocity';
import { RestaurantHub } from './components/RestaurantHub';
import { DeleteAccountModal } from './components/DeleteAccountModal';
import { UsageDashboard } from './components/UsageDashboard';
import { Wrapped } from './components/Wrapped';
import { FuelHome } from './components/FuelHome';
import { SpotlightTour } from './components/SpotlightTour';
import { FeatherCelebration } from './components/FeatherCelebration';
import { WorkoutsHome } from './components/WorkoutsHome';
import { SafeMarkdown } from './components/SafeMarkdown';
import { computeAdaptiveTDEE } from './src/utils/adaptiveTDEE';
import { detectRestaurantsInText, findMenuItemMatches, type MenuItem } from './data/restaurants';
import { UserProfile, DailyLog, AppState, Location, PhysiqueGoal, SavedNote, Meal, FoodItem, BodyStats, BodyPartStats, WorkoutExercise, VisionRoadmap, ActivityLevel, NutritionTargets, HistoryEntry, WeightEntry } from './types';
import { CALCULATE_TDEE, CALCULATE_MACROS, DAYS_OF_WEEK, INITIAL_BODY_STATS, GET_AFFECTED_MUSCLES, XP_PER_LEVEL_BASE, isAdminUser } from './constants';
import { generateMealSuggestion, generateSmartSplit, sendChatMessage, analyzeFoodEntry } from './services/geminiService';
import { db, auth, functions, isConfigured } from './services/firebase';
import { httpsCallable } from 'firebase/functions';
import { doc, onSnapshot, setDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';

const DEFAULT_STATE: AppState = { 
    profile: null,
    todayLog: [], 
    activityBurn: 0,
    dailyLogs: [], 
    milestones: [], 
    savedNotes: [], 
    mealHistory: [],
    foodHistory: [],
    recentFoods: [], 
    waterIntake: 0,
    weighIns: [],
    bodyStats: INITIAL_BODY_STATS,
    lastActiveDate: new Date().toLocaleDateString()
};

// FALLBACK SPLIT in case AI fails or is slow
const FALLBACK_SPLIT = [
    { day: "Monday", label: "Upper Power", intensity: "High", exercises: [
        { name: "Bench Press", sets: 3, reps: "5-8", completed: false },
        { name: "Barbell Row", sets: 3, reps: "6-10", completed: false },
        { name: "Overhead Press", sets: 3, reps: "8-12", completed: false },
        { name: "Pull Ups", sets: 3, reps: "AMRAP", completed: false },
        { name: "Dumbbell Curls", sets: 3, reps: "10-15", completed: false }
    ]},
    { day: "Tuesday", label: "Lower Power", intensity: "High", exercises: [
        { name: "Squat", sets: 3, reps: "5-8", completed: false },
        { name: "Romanian Deadlift", sets: 3, reps: "8-12", completed: false },
        { name: "Leg Press", sets: 3, reps: "10-15", completed: false },
        { name: "Calf Raises", sets: 4, reps: "15-20", completed: false }
    ]},
    { day: "Wednesday", label: "Rest / Active Recovery", intensity: "Low", exercises: [
        { name: "Light Cardio (Walk)", sets: 1, reps: "30 mins", completed: false },
        { name: "Stretching Routine", sets: 1, reps: "15 mins", completed: false }
    ]},
    { day: "Thursday", label: "Push Hypertrophy", intensity: "Moderate", exercises: [
        { name: "Incline Dumbbell Press", sets: 3, reps: "8-12", completed: false },
        { name: "Lateral Raises", sets: 4, reps: "12-15", completed: false },
        { name: "Tricep Pushdowns", sets: 3, reps: "12-15", completed: false },
        { name: "Pushups", sets: 3, reps: "Failure", completed: false }
    ]},
    { day: "Friday", label: "Pull Hypertrophy", intensity: "Moderate", exercises: [
        { name: "Lat Pulldowns", sets: 3, reps: "10-12", completed: false },
        { name: "Cable Rows", sets: 3, reps: "10-12", completed: false },
        { name: "Face Pulls", sets: 4, reps: "15-20", completed: false },
        { name: "Hammer Curls", sets: 3, reps: "10-12", completed: false }
    ]},
    { day: "Saturday", label: "Legs Hypertrophy", intensity: "Moderate", exercises: [
        { name: "Goblet Squats", sets: 3, reps: "10-12", completed: false },
        { name: "Lunges", sets: 3, reps: "12 per leg", completed: false },
        { name: "Leg Curls", sets: 3, reps: "12-15", completed: false },
        { name: "Planks", sets: 3, reps: "60s", completed: false }
    ]},
    { day: "Sunday", label: "Rest", intensity: "Low", exercises: [
         { name: "Full Rest", sets: 0, reps: "0", completed: false }
    ]}
];


// Temporary type for scanned items before they become FoodItems
interface ScannedItem {
    name: string;
    calories: string;
    protein: string;
    carbs: string;
    fat: string;
    fiber: string;
    // Optional enrichment from the AI analysis. These drive UI badges and the
    // collapsible "what's in this number?" panel. None of them are required;
    // legacy/manual entries omit them and the UI gracefully hides the badges.
    source?: 'label' | 'restaurant_db' | 'visual_estimate' | 'text_only';
    confidence?: 'high' | 'medium' | 'low';
    ingredients?: Array<{
        name: string;
        grams: number;
        calories: number;
        protein: number;
        carbs: number;
        fat: number;
        fiber?: number;
        emoji?: string;
    }>;
    servingSize?: string;
    servingsConsumed?: number;
}

// Image Resize Utility to prevent crashes
const resizeImage = (file: File, maxWidth = 1024, quality = 0.7): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxWidth) {
            width = Math.round((width * maxWidth) / height);
            height = maxWidth;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
};

const safeFloat = (val: any): number => {
    const str = String(val).replace(/[^0-9.]/g, ''); // Remove non-numeric chars except dot
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
};

// ============================================================================
//  Dashboard helpers
// ============================================================================

// METs from the Compendium of Physical Activities (Ainsworth et al., 2011).
// Used to estimate calorie burn = MET × weight_kg × hours.
//
// Each activity has three intensity levels. A flat default = moderate so
// quick-tap pills on the home screen stay one-shot, while the activity
// modal lets the user pick easy/moderate/hard explicitly.
type Intensity = 'easy' | 'moderate' | 'hard';
type ActivityKind =
  | 'running' | 'weights' | 'cycling' | 'walking' | 'hiit' | 'yoga'
  | 'swimming' | 'hiking' | 'rowing' | 'elliptical' | 'jump-rope'
  | 'basketball' | 'soccer' | 'tennis' | 'dance';

const ACTIVITY_METS_BY_INTENSITY: Record<ActivityKind, Record<Intensity, number>> = {
  // Cardio — running scales fastest with intensity (jog → sprint).
  running:    { easy: 6.0,  moderate: 9.8,  hard: 12.5 },
  cycling:    { easy: 4.0,  moderate: 8.0,  hard: 11.0 },
  walking:    { easy: 2.5,  moderate: 4.3,  hard: 5.5  },
  swimming:   { easy: 4.5,  moderate: 7.0,  hard: 10.0 },
  hiking:     { easy: 4.5,  moderate: 6.5,  hard: 8.5  },
  rowing:     { easy: 5.0,  moderate: 7.5,  hard: 9.5  },
  elliptical: { easy: 4.5,  moderate: 6.5,  hard: 8.5  },
  'jump-rope':{ easy: 8.0,  moderate: 11.0, hard: 12.5 },
  // Strength — MET stays moderate-ish; hard ≈ supersets/circuit work.
  weights:    { easy: 3.5,  moderate: 5.0,  hard: 6.5  },
  // HIIT/conditioning
  hiit:       { easy: 6.0,  moderate: 8.0,  hard: 10.5 },
  // Mind-body / flexibility
  yoga:       { easy: 2.0,  moderate: 3.0,  hard: 5.0  }, // hard ≈ power vinyasa
  // Sports — pickup-game pace assumed for "moderate."
  basketball: { easy: 5.0,  moderate: 7.0,  hard: 9.0  },
  soccer:     { easy: 6.0,  moderate: 8.0,  hard: 10.0 },
  tennis:     { easy: 5.0,  moderate: 7.0,  hard: 8.5  },
  dance:      { easy: 3.5,  moderate: 5.0,  hard: 7.5  },
};

// Backward-compat default (moderate) for existing call sites.
const ACTIVITY_METS = Object.fromEntries(
  Object.entries(ACTIVITY_METS_BY_INTENSITY).map(([k, v]) => [k, v.moderate]),
) as Record<ActivityKind, number>;

const personalizedBurn = (weightLbs: number, met: number, minutes: number = 30): number => {
  const weightKg = (weightLbs || 150) / 2.20462;
  return Math.round(met * weightKg * (minutes / 60));
};

const personalizedBurnAt = (
  weightLbs: number,
  kind: ActivityKind,
  intensity: Intensity = 'moderate',
  minutes: number = 30,
): number => {
  const met = ACTIVITY_METS_BY_INTENSITY[kind]?.[intensity] ?? 5;
  return personalizedBurn(weightLbs, met, minutes);
};

// Meal categorization based on item timestamp.
type MealKey = 'breakfast' | 'lunch' | 'snacks' | 'dinner' | 'late';

const MEAL_DEFINITIONS: { key: MealKey; label: string; emoji: string }[] = [
  { key: 'breakfast', label: 'Breakfast', emoji: '🌅' },
  { key: 'lunch',     label: 'Lunch',     emoji: '☀️' },
  { key: 'snacks',    label: 'Snacks',    emoji: '🍿' },
  { key: 'dinner',    label: 'Dinner',    emoji: '🌙' },
  { key: 'late',      label: 'Late Night',emoji: '🌌' },
];

// FoodItem.timestamp is whatever toLocaleTimeString produces, which varies by
// locale. We accept ISO dates, "3:45:00 PM", or "15:45" gracefully.
const classifyMeal = (timestamp: string | undefined): MealKey => {
  if (!timestamp) return 'snacks';
  let hour = -1;
  if (/^\d{4}-\d{2}-\d{2}T/.test(timestamp)) {
    hour = new Date(timestamp).getHours();
  } else {
    const m12 = timestamp.match(/(\d+):(\d+)(?::\d+)?\s*(AM|PM)/i);
    if (m12) {
      let h = parseInt(m12[1], 10);
      const ampm = m12[3].toUpperCase();
      if (ampm === 'PM' && h < 12) h += 12;
      if (ampm === 'AM' && h === 12) h = 0;
      hour = h;
    } else {
      const m24 = timestamp.match(/^(\d{1,2}):(\d{2})/);
      if (m24) hour = parseInt(m24[1], 10);
    }
  }
  if (hour < 0) return 'snacks';
  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 15) return 'lunch';
  if (hour >= 17 && hour < 22) return 'dinner';
  if (hour >= 22 || hour < 5)  return 'late';
  return 'snacks'; // 15:00-17:00
};

// Consecutive-day streak ending today or yesterday. A day counts if it has
// any logged food (calories consumed > 0 or foodItems present). Today is
// pulled from todayLog since dailyLogs is the historical record.
const computeStreak = (dailyLogs: any[], todayLog: any[]): number => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];

  const loggedDates = new Set<string>();
  if (todayLog && todayLog.length > 0) loggedDates.add(todayStr);
  (dailyLogs || [])
    .filter(l => (l.caloriesConsumed ?? 0) > 0 || (l.foodItems && l.foodItems.length > 0))
    .forEach(l => loggedDates.add(l.date));

  let streak = 0;
  const d = new Date(today);
  // If today not yet logged, allow the streak to count from yesterday so the
  // user doesn't see "0-day streak" first thing in the morning.
  if (!loggedDates.has(todayStr)) d.setDate(d.getDate() - 1);

  for (let i = 0; i < 365; i++) {
    const dateStr = d.toISOString().split('T')[0];
    if (loggedDates.has(dateStr)) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
};

const MainApp = ({ userId, userEmail, initialProfile, onSignOut }: any) => {
  // Auth State (managed by shell now, but keeping some refs)
  const user = { uid: userId, email: userEmail };

  // Per-user cache keys. localStorage is global, so we scope every key by uid
  // to guarantee one user's cache can never leak into another's session.
  // If userId isn't available yet (shouldn't happen at this point), we skip
  // the cache entirely — never fall back to a global key.
  const appStateKey = userId ? `dings_app_state_${userId}` : null;
  const splitKey = userId ? `dings_workout_split_${userId}` : null;

  // INITIALIZE STATE FROM LOCAL STORAGE FIRST (Backup for "Dad/Data on Phone")
  const [appState, setAppState] = useState<AppState>(() => {
      try {
          const saved = appStateKey ? localStorage.getItem(appStateKey) : null;
          if (saved) {
              const parsed = JSON.parse(saved);
              // Deep merge to ensure profile and other critical keys exist even if older data is partial
              return {
                  ...DEFAULT_STATE,
                  ...parsed,
                  profile: initialProfile || { ...DEFAULT_STATE.profile, ...(parsed.profile || {}) }
              };
          }
      } catch (e) {
          console.error("Error loading state", e);
      }
      return { ...DEFAULT_STATE, profile: initialProfile };
  });

  const [workoutSplit, setWorkoutSplit] = useState<any[]>(() => {
      try {
          const saved = splitKey ? localStorage.getItem(splitKey) : null;
          if (saved) {
              const parsed = JSON.parse(saved);
              if (Array.isArray(parsed) && parsed.length > 0) return parsed;
          }
      } catch (e) {
          console.error("Error loading split", e);
      }
      return FALLBACK_SPLIT;
  });

  const [weeklyCompletedWorkouts, setWeeklyCompletedWorkouts] = useState<string[]>([]);

  // UI State
  const [activeTab, setActiveTab] = useState('dashboard');
  // Direction of the page-turn transition. Positive when moving to a
  // later tab (forward), negative when going back. Recomputed inside the
  // tab-switch handler below. Default forward feels right on first paint.
  const TAB_ORDER = ['dashboard', 'restaurants', 'journal', 'reflect', 'workouts', 'coach', 'profile'];
  const [pageTurnDirection, setPageTurnDirection] = useState<1 | -1>(1);
  const switchTab = useCallback((next: string) => {
    setPageTurnDirection(
      TAB_ORDER.indexOf(next) >= TAB_ORDER.indexOf(activeTab) ? 1 : -1,
    );
    setActiveTab(next);
  }, [activeTab]);
  const [isGeneratingSplit, setIsGeneratingSplit] = useState(false);
  const [showAddFood, setShowAddFood] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  
  // Chat
  const [chatHistory, setChatHistory] = useState<{role: string, text: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Manual Workout Entry State
  const [manualExercise, setManualExercise] = useState({ name: '', sets: 3, reps: '10' });
  const [activeDayIndexForAdd, setActiveDayIndexForAdd] = useState<number | null>(null);

  // Food Analysis State
  const [addFoodMode, setAddFoodMode] = useState<'manual' | 'ai' | 'history'>('manual');
  const [foodImages, setFoodImages] = useState<string[]>([]);
  const [foodDescription, setFoodDescription] = useState('');
  const [isAnalyzingFood, setIsAnalyzingFood] = useState(false);
  const [analysisTip, setAnalysisTip] = useState('');
  // Surfaces which nutrition databases the last analysis actually queried.
  // Empty = nutrition DB wasn't queried (image path, restaurant match, or
  // query too long). Used both as a debug aid and a trust signal to the user.
  const [analysisNutritionSources, setAnalysisNutritionSources] = useState<('usda' | 'openfoodfacts')[]>([]);
  const [analysisNutritionMatchCount, setAnalysisNutritionMatchCount] = useState<number>(0);
  const [analysisNutritionSkipped, setAnalysisNutritionSkipped] = useState<{ source: string; reason: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const profilePicInputRef = useRef<HTMLInputElement>(null);
  
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
  // Which scanned items have their ingredient list expanded. Set of indices.
  const [expandedIngredients, setExpandedIngredients] = useState<Set<number>>(new Set());
  const [foodForm, setFoodForm] = useState<ScannedItem>({ name: '', calories: '', protein: '', carbs: '', fat: '', fiber: '' });

  // Activity Logging State
  const [isLoggingActivity, setIsLoggingActivity] = useState(false);

  // Admin-only token usage dashboard. Visibility is gated by isAdminUser(userId).
  const [showUsageDashboard, setShowUsageDashboard] = useState(false);

  // Wrapped (Spotify-Wrapped-style summary) overlay. `wrappedAutoPrompted`
  // tracks whether the open was triggered by the month-start auto-prompt vs.
  // a manual tap so we can show a "New month" badge.
  const [showWrapped, setShowWrapped] = useState(false);
  const [wrappedAutoPrompted, setWrappedAutoPrompted] = useState(false);
  const [wrappedInitialPeriod, setWrappedInitialPeriod] = useState<'week' | 'month'>('month');

  // Quick-add custom activity modal (replaces the old window.prompt() UX).
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [activityModalForm, setActivityModalForm] = useState<{
    kind: ActivityKind | 'manual';
    intensity: Intensity;
    minutes: number;
    manualKcal: string; // string for input control
  }>({ kind: 'running', intensity: 'moderate', minutes: 30, manualKcal: '' });
  const [activityLogValue, setActivityLogValue] = useState('');

  // Profile Edit State
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editProfileData, setEditProfileData] = useState<Partial<UserProfile>>({});
  const [visionRoadmap, setVisionRoadmap] = useState<VisionRoadmap | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // One-time health disclaimer for users who onboarded BEFORE we added the
  // disclaimer step. App Store / Play Store policy requires every user to see
  // and accept it at least once. Triggered below once profile is loaded.
  const [showHealthDisclaimer, setShowHealthDisclaimer] = useState(false);

  // First-launch spotlight tour. Fires once per user (gated by a uid-namespaced
  // localStorage flag). Triggered on first profile load OR via the "Show tour
  // again" button in Profile.
  const tourSeenKey = userId ? `dings_tour_seen_${userId}` : null;
  const [showTour, setShowTour] = useState(false);
  // Feather/arrow celebration overlay — pops when food gets logged.
  const [showCelebration, setShowCelebration] = useState(false);
  useEffect(() => {
    if (!tourSeenKey || !appState.profile) return;
    // Only auto-fire once. Manual re-trigger uses setShowTour(true) directly.
    let seen = false;
    try { seen = localStorage.getItem(tourSeenKey) === '1'; } catch { /* private mode */ }
    if (!seen) {
      // Small delay so the dashboard has time to render before we measure
      // the macro-ring target.
      const t = setTimeout(() => {
        setShowTour(true);
        // Mark seen IMMEDIATELY when the tour starts, not when it ends.
        // Otherwise if the user backgrounds the app mid-tour or kills it,
        // the tour replays on next launch — which is jarring.
        try { localStorage.setItem(tourSeenKey, '1'); } catch { /* ignore */ }
      }, 600);
      return () => clearTimeout(t);
    }
  }, [tourSeenKey, appState.profile]);
  const handleCloseTour = useCallback(() => {
    setShowTour(false);
    try { if (tourSeenKey) localStorage.setItem(tourSeenKey, '1'); } catch { /* ignore */ }
  }, [tourSeenKey]);
  const handleReplayTour = useCallback(() => {
    // Switch to dashboard so the tour's targets are reachable, then fire.
    switchTab('dashboard');
    setTimeout(() => setShowTour(true), 350);
  }, [switchTab]);

  // Helper to Save State to DB AND LocalStorage
  const saveToCloud = useCallback(async (updates: Partial<AppState>) => {
      // Always save local first for speed/offline.
      // Per-user cache key so accounts can't read each other's data.
      if (appStateKey) {
          const currentLocal = localStorage.getItem(appStateKey);
          const parsedLocal = currentLocal ? JSON.parse(currentLocal) : DEFAULT_STATE;
          const merged = { ...parsedLocal, ...updates };
          localStorage.setItem(appStateKey, JSON.stringify(merged));
      }

      if (!user || !db) return;
      const ref = doc(db, "users", user.uid);
      try {
          await setDoc(ref, updates, { merge: true });
      } catch (error) {
          console.error("Firebase permission denied or network error during saveToCloud:", error);
          triggerToast("Sync error (check rules)");
      }
  }, [user, appStateKey]);

  // Wrappers for state updates that also sync
  const handleUpdateAppState = (newState: AppState | ((prev: AppState) => AppState)) => {
      setAppState(prev => {
          const updated = typeof newState === 'function' ? newState(prev) : newState;
          saveToCloud(updated); // Fire and forget
          return updated;
      });
  };

  // 1. DAILY RESET LOGIC
  // Idempotent: re-running this when an archive already exists for the
  // previous day will only refresh todayLog/lastActiveDate, not duplicate.
  // Runs both on dependency change AND every minute so apps left open past
  // midnight still roll over without requiring a navigation.
  useEffect(() => {
    const performRollover = () => {
      const todayStr = new Date().toLocaleDateString();

      let archivedJustNow = false;
      let isMonday = false;

      setAppState(prev => {
        const lastDate = prev.lastActiveDate;
        if (!lastDate || lastDate === todayStr) return prev; // nothing to do

        // IDEMPOTENCY GUARD — don't double-archive if a log for lastDate
        // already exists (handles Strict Mode double-firing and snapshot
        // race conditions where the same effect could run twice).
        const alreadyArchived = (prev.dailyLogs || []).some(l => l.date === lastDate);

        const safeTodayLog = prev.todayLog || [];
        const calories = safeTodayLog.reduce((acc, item) => acc + (item.calories || 0), 0);
        const protein  = safeTodayLog.reduce((acc, item) => acc + (item.protein  || 0), 0);
        const carbs    = safeTodayLog.reduce((acc, item) => acc + (item.carbs    || 0), 0);
        const fat      = safeTodayLog.reduce((acc, item) => acc + (item.fat      || 0), 0);
        const fiber    = safeTodayLog.reduce((acc, item) => acc + (item.fiber    || 0), 0);

        // Skip archiving days with no real activity — opening the app and
        // logging nothing shouldn't create a placeholder entry. This was
        // creating dozens of empty rows that polluted the Journal navigation.
        const hadAnyActivity =
          safeTodayLog.length > 0 ||
          (prev.waterIntake || 0) > 0 ||
          (prev.activityBurn || 0) > 0;

        let nextDailyLogs = prev.dailyLogs || [];
        if (!alreadyArchived && hadAnyActivity) {
          const archivedLog: DailyLog = {
            date: lastDate,
            weight: 0,
            caloriesConsumed: calories,
            proteinConsumed: protein,
            carbsConsumed: carbs,
            fatConsumed: fat,
            fiberConsumed: fiber,
            waterIntake: prev.waterIntake,
            caloriesBurned: prev.activityBurn,
            workoutCompleted: false,
            foodItems: safeTodayLog,
          };
          nextDailyLogs = [...nextDailyLogs, archivedLog];
          archivedJustNow = true;
          console.log("[Rollover] Archived", safeTodayLog.length, "items for", lastDate, "→", todayStr);
        } else if (alreadyArchived) {
          console.log("[Rollover] Already archived", lastDate, "— resetting today only");
        } else {
          console.log("[Rollover] Skipping empty day", lastDate, "— no food/water/burn logged");
        }

        const next = {
          ...prev,
          dailyLogs: nextDailyLogs,
          todayLog: [],
          activityBurn: 0,
          waterIntake: 0,
          lastActiveDate: todayStr,
        };
        // Persist immediately. Fire-and-forget is OK because localStorage
        // is also written synchronously inside saveToCloud, so a closed tab
        // doesn't lose data — the next sign-in will push it.
        saveToCloud(next);
        return next;
      });

      // Workout reset on Monday — only fires once per actual rollover (not
      // on idempotent re-runs) by checking the `archivedJustNow` flag the
      // setAppState callback set.
      if (archivedJustNow) {
        const dayOfWeek = new Date().getDay();
        isMonday = dayOfWeek === 1;
        if (isMonday) {
          setWeeklyCompletedWorkouts([]);
          if (user && db) saveWorkoutToCloud(workoutSplit, []);
          const resetSplit = workoutSplit.map(day => ({
            ...day,
            exercises: day.exercises.map((ex: any) => ({ ...ex, completed: false })),
          }));
          setWorkoutSplit(resetSplit);
          saveWorkoutToCloud(resetSplit, []);
          triggerToast("New Week: Workouts Reset");
        } else {
          triggerToast("New Day: Food & Water Reset");
        }
      }
    };

    // Run on mount + when relevant state changes
    performRollover();

    // Re-check every minute so apps left open past midnight still archive.
    const intervalId = setInterval(performRollover, 60_000);
    return () => clearInterval(intervalId);
  }, [appState.lastActiveDate, user, workoutSplit, saveToCloud]);

  // 2. Database Sync (User)
  useEffect(() => {
    if (!isConfigured || !db) return; 

    if (user?.uid) {
        const unsubState = onSnapshot(doc(db, "users", user.uid), (docSnapshot) => {
            if (docSnapshot.exists()) {
                const data = docSnapshot.data() as Partial<AppState>;

                // ONE-TIME CLEANUP: remove empty dailyLogs (no food, no water,
                // no burn) and de-dupe by date. The old rollover code created
                // empty placeholder entries every time the app opened without
                // logging. Self-terminating — once dailyLogs is clean, future
                // snapshots find no empties and skip the write.
                const rawDailyLogs = Array.isArray(data.dailyLogs) ? data.dailyLogs : [];
                const seenDates = new Set<string>();
                const cleanedDailyLogs = rawDailyLogs.filter(log => {
                    if (!log || !log.date) return false;
                    if (seenDates.has(log.date)) return false;
                    seenDates.add(log.date);
                    const hasActivity =
                      (log.foodItems && log.foodItems.length > 0) ||
                      (log.caloriesConsumed || 0) > 0 ||
                      (log.waterIntake || 0) > 0 ||
                      (log.caloriesBurned || 0) > 0;
                    return hasActivity;
                });
                if (cleanedDailyLogs.length !== rawDailyLogs.length) {
                    const removed = rawDailyLogs.length - cleanedDailyLogs.length;
                    console.log(`[Cleanup] Removed ${removed} empty/duplicate dailyLogs entries from storage.`);
                    // Write back the cleaned version. saveToCloud merges, so
                    // this replaces only the dailyLogs field. Fire and forget.
                    saveToCloud({ dailyLogs: cleanedDailyLogs });
                }

                setAppState(prev => {
                    const nextState = {
                        ...prev,
                        ...data,
                        dailyLogs: cleanedDailyLogs,
                        todayLog: data.todayLog || prev.todayLog || [],
                        milestones: data.milestones || prev.milestones || [],
                        savedNotes: data.savedNotes || prev.savedNotes || [],
                        foodHistory: data.foodHistory || prev.foodHistory || [],
                        recentFoods: data.recentFoods || prev.recentFoods || [],
                        mealHistory: data.mealHistory || prev.mealHistory || [],
                        weighIns: data.weighIns || prev.weighIns || [],
                    };
                    if (appStateKey) localStorage.setItem(appStateKey, JSON.stringify(nextState));
                    return nextState;
                });
            }
        }, (error) => {
            console.error("Firebase snapshot error (users):", error);
            triggerToast("Database read access denied. Review Firestore Rules.");
        });

        const unsubWorkout = onSnapshot(doc(db, "user_workouts", user.uid), (docSnapshot) => {
            if (docSnapshot.exists()) {
                 const data = docSnapshot.data();
                 if (data.split && data.split.length > 0) {
                     setWorkoutSplit(data.split);
                     if (splitKey) localStorage.setItem(splitKey, JSON.stringify(data.split));
                 }
                 if (data.weeklyProgress) setWeeklyCompletedWorkouts(data.weeklyProgress);
            } else {
                const localSplit = splitKey ? localStorage.getItem(splitKey) : null;
                if (localSplit) {
                    const parsed = JSON.parse(localSplit);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        setWorkoutSplit(parsed);
                        saveWorkoutToCloud(parsed, []);
                        return;
                    }
                }
                setWorkoutSplit(FALLBACK_SPLIT);
                saveWorkoutToCloud(FALLBACK_SPLIT, []);
            }
        }, (error) => {
            console.error("Firebase snapshot error (user_workouts):", error);
        });

        return () => {
            unsubState();
            unsubWorkout();
        };
    }
  }, [user]);

  // Force Fallback check if state becomes empty
  useEffect(() => {
      if (!workoutSplit || workoutSplit.length === 0) {
          setWorkoutSplit(FALLBACK_SPLIT);
      }
  }, [workoutSplit]);

  // One-time health disclaimer trigger for existing users (pre-disclaimer-onboarding).
  // Fires once the profile is loaded; sets to false the moment it sees acceptedHealthDisclaimer=true.
  useEffect(() => {
    if (appState.profile && appState.profile.acceptedHealthDisclaimer !== true) {
      setShowHealthDisclaimer(true);
    } else {
      setShowHealthDisclaimer(false);
    }
  }, [appState.profile?.acceptedHealthDisclaimer]);

  const saveWorkoutToCloud = useCallback(async (split: any[], progress: string[]) => {
      if (splitKey) localStorage.setItem(splitKey, JSON.stringify(split));
      if (!user || !db) return;
      const ref = doc(db, "user_workouts", user.uid);
      try {
          await setDoc(ref, { split, weeklyProgress: progress }, { merge: true });
      } catch (error) {
          console.error("Firebase error saving workouts:", error);
      }
  }, [user, splitKey]);

  // Current Time Awareness
  const currentDayName = useMemo(() => new Date().toLocaleDateString('en-US', { weekday: 'long' }), []);
  const currentHour = useMemo(() => new Date().getHours(), []);
  
  const greeting = useMemo(() => {
    // Cuodi voice greetings — see VOICE.md
    if (currentHour < 12) return "MORNIN";
    if (currentHour < 18) return "AFTERNOOOON!";
    return "Good EVENINGGGG!";
  }, [currentHour]);

  // Display-formatted date for the hero strip — "Saturday, May 17".
  const dateString = useMemo(() => {
    return new Date().toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  }, []);

  // Consecutive-day streak. Recomputed when today's log or history changes.
  const streak = useMemo(
    () => computeStreak(appState.dailyLogs || [], appState.todayLog || []),
    [appState.dailyLogs, appState.todayLog],
  );


  useEffect(() => {
      if (activeTab === 'coach' && chatBottomRef.current) {
          chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
      }
  }, [chatHistory, activeTab]);

  // Wrapped auto-prompt: when the calendar month changes, show the previous
  // month's Wrapped once. localStorage key is uid-namespaced (per the
  // cross-account leak fix) and stores the YYYY-MM string we last greeted on.
  // Only fires if there's actually data in the prior month worth celebrating
  // — otherwise the user would get an empty Wrapped that feels deflating.
  useEffect(() => {
      if (!userId || !appState.profile) return;
      const key = `dings_wrapped_last_seen_${userId}`;
      const today = new Date();
      const currentYM = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      let lastSeen: string | null = null;
      try { lastSeen = localStorage.getItem(key); } catch { /* private mode */ }
      if (lastSeen === currentYM) return; // already greeted this month

      // Check there's data in the previous 30 days worth showing.
      const cutoff = new Date(today);
      cutoff.setDate(cutoff.getDate() - 30);
      const recentRealDays = (appState.dailyLogs || []).filter(l => {
          const d = new Date(l.date);
          const real = (l.caloriesConsumed || 0) > 0 || (l.foodItems?.length || 0) > 0 || (l.caloriesBurned || 0) > 0;
          return d >= cutoff && real;
      }).length;
      if (recentRealDays < 5) {
          // Not enough data yet. Don't burn the auto-prompt; let them
          // accumulate first. Update the marker on the 1st of the month
          // anyway so we don't poll forever — they can still tap the
          // dashboard launcher manually.
          if (today.getDate() === 1) {
              try { localStorage.setItem(key, currentYM); } catch { /* ignore */ }
          }
          return;
      }

      // Defer slightly so it doesn't fight with the dashboard render.
      const t = setTimeout(() => {
          setWrappedAutoPrompted(true);
          setWrappedInitialPeriod('month');
          setShowWrapped(true);
          try { localStorage.setItem(key, currentYM); } catch { /* ignore */ }
      }, 1200);
      return () => clearTimeout(t);
  }, [userId, appState.profile, appState.dailyLogs]);

  const generateSplitForUser = async () => {
      setIsGeneratingSplit(true);
      try {
          if (!appState.profile) throw new Error("No profile");
          const split = await generateSmartSplit(appState.profile.goal, appState.profile.busyDays, appState.profile.highEnergyDays, {
              age: appState.profile.age || 30,
              weight: appState.profile.weight || 150,
              activityLevel: appState.profile.activityLevel || ActivityLevel.Light,
              // Pass workout-personalization answers from onboarding. Legacy
              // profiles without these get sensible defaults inside the prompt.
              workoutPreferences: appState.profile.workoutPreferences,
              // Onboarding v2 fields — if the profile has them, feed them
              // to the AI so injuries are avoided and motivation can flavor
              // tone. Both optional; legacy profiles skip.
              injuries: appState.profile.injuries,
              motivation: appState.profile.motivation,
          });
          if (split && Array.isArray(split) && split.length > 0) {
              setWorkoutSplit(split);
              saveWorkoutToCloud(split, weeklyCompletedWorkouts);
          } else {
              throw new Error("Empty split generated");
          }
      } catch (e) {
          console.error("Split gen failed, using fallback", e);
          setWorkoutSplit(FALLBACK_SPLIT);
          saveWorkoutToCloud(FALLBACK_SPLIT, weeklyCompletedWorkouts);
          triggerToast("Used a simple starter split");
      } finally {
          setIsGeneratingSplit(false);
      }
  }

  // Pick a random voice line from a list. Used so the same toast feels less
  // robotic on repeat exposure — see VOICE.md for the source samples.
  const pickVoice = (lines: string[]) => lines[Math.floor(Math.random() * lines.length)];

  // Stable identity — useCallback so child callbacks (recordWeight, etc.)
  // can list it in their deps without re-creating themselves every render.
  // The state setters inside are themselves stable, so an empty dep array
  // is safe.
  const triggerToast = useCallback((msg: string, durationMs = 3000) => {
    setToastMessage(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), durationMs);
  }, []);

  // Mint (or rotate) the personal bearer key the Fuel Coach GPT uses to
  // read live macros via the gptMacros endpoint. Copies it to clipboard.
  const handleCreateGptKey = useCallback(async () => {
    if (!functions) { triggerToast('Not connected — try again once online.'); return; }
    try {
      triggerToast('Creating your Fuel Coach key…');
      const fn = httpsCallable<Record<string, never>, { key: string }>(functions, 'createGptKey');
      const res = await fn({});
      await navigator.clipboard.writeText(res.data.key);
      triggerToast('Key copied. Paste it into your GPT\u2019s Action auth (Bearer). Minting a new key revokes the old one.', 7000);
    } catch {
      triggerToast('Could not create the key. Try again.');
    }
  }, [triggerToast]);

  const updateWater = (amount: number) => {
      handleUpdateAppState(prev => ({
          ...prev,
          waterIntake: Math.max(0, prev.waterIntake + amount)
      }));
  };

  const targetMacros = useMemo(() => {
    if (!appState.profile) return { calories: 2000, protein: 150, carbs: 200, fat: 65 };
    if (appState.nutritionTargets) return appState.nutritionTargets;
    // Prefer InBody-measured body fat % when present (gold standard);
    // otherwise fall back to user-entered bodyFat. If neither, CALCULATE_TDEE
    // uses Mifflin-St Jeor automatically.
    const bf = appState.profile.inBodyData?.pbf ?? appState.profile.bodyFat;
    const tdee = CALCULATE_TDEE(
      appState.profile.weight,
      appState.profile.height,
      appState.profile.age,
      appState.profile.activityLevel,
      appState.profile.sex,
      bf,
    );
    return CALCULATE_MACROS(
      tdee,
      appState.profile.goal,
      appState.profile.weight,
      appState.profile.sex,
      appState.profile.macroSplit,
      (appState.profile.goalTargetWeight && appState.profile.goalTargetDate)
        ? { targetWeightLbs: appState.profile.goalTargetWeight, targetDate: appState.profile.goalTargetDate }
        : undefined,
    );
  }, [appState.profile, appState.nutritionTargets]);

  // Adaptive TDEE — re-estimates the user's maintenance level from their
  // logged weight trend + intake. Returns hasEnoughData=false until ~10 days
  // of weight logs are available. The suggestion is offered to the user
  // (in the dashboard banner); they accept by tapping a button which writes
  // it back to the profile's nutrition targets.
  const adaptiveSuggestion = useMemo(() => {
    if (!appState.profile || !appState.dailyLogs) {
      return { hasEnoughData: false };
    }
    const bf = appState.profile.inBodyData?.pbf ?? appState.profile.bodyFat;
    const formulaTDEE = CALCULATE_TDEE(
      appState.profile.weight,
      appState.profile.height,
      appState.profile.age,
      appState.profile.activityLevel,
      appState.profile.sex,
      bf,
    );
    return computeAdaptiveTDEE(appState.profile, appState.dailyLogs, formulaTDEE, appState.weighIns || []);
  }, [appState.profile, appState.dailyLogs, appState.weighIns]);

  // Apply an adaptive suggestion by recomputing macros at the new TDEE
  // and writing them as the user's persistent nutrition targets.
  const acceptAdaptiveSuggestion = useCallback(() => {
    if (!appState.profile || !adaptiveSuggestion.hasEnoughData || !adaptiveSuggestion.suggestedTdee) return;
    const newMacros = CALCULATE_MACROS(
      adaptiveSuggestion.suggestedTdee,
      appState.profile.goal,
      appState.profile.weight,
      appState.profile.sex,
      appState.profile.macroSplit,
      (appState.profile.goalTargetWeight && appState.profile.goalTargetDate)
        ? { targetWeightLbs: appState.profile.goalTargetWeight, targetDate: appState.profile.goalTargetDate }
        : undefined,
    );
    const newTargets = {
      calories: newMacros.calories,
      protein: newMacros.protein,
      carbs: newMacros.carbs,
      fat: newMacros.fat,
    };
    handleUpdateAppState(prev => ({
      ...prev,
      nutritionTargets: newTargets,
      profile: prev.profile ? {
        ...prev.profile,
        adaptiveTdee: {
          suggestedTdee: adaptiveSuggestion.suggestedTdee!,
          adjustmentKcal: adaptiveSuggestion.adjustmentKcal || 0,
          computedAt: new Date().toISOString(),
          lastAppliedAt: new Date().toISOString(),
          reason: adaptiveSuggestion.reason || '',
        },
      } : prev.profile,
    }));
    const dir = (adaptiveSuggestion.adjustmentKcal || 0) > 0 ? 'raised' : 'lowered';
    triggerToast(`Target ${dir} to ${newTargets.calories} kcal`, 4000);
  }, [appState.profile, adaptiveSuggestion]);

  const consumedMacros = useMemo(() => {
    const today = appState.todayLog || [];
    const totals = today.reduce((acc, item) => ({
      calories: acc.calories + (Number(item.calories) || 0),
      protein: acc.protein + (Number(item.protein) || 0),
      carbs: acc.carbs + (Number(item.carbs) || 0),
      fat: acc.fat + (Number(item.fat) || 0),
      fiber: acc.fiber + (Number(item.fiber) || 0)
    }), { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });

    // Adjust calories based on activity burn
    totals.calories = Math.max(0, totals.calories - (appState.activityBurn || 0));
    
    return totals;
  }, [appState.todayLog, appState.activityBurn]);

  const recordWeight = useCallback((weight: number, source: WeightEntry['source'] = 'check-in') => {
    if (!Number.isFinite(weight) || weight < 50 || weight > 700) {
      triggerToast('Enter a weight between 50 and 700 lbs');
      return false;
    }

    const now = new Date();
    const date = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');
    const entry: WeightEntry = {
      id: `${date}-${Date.now()}`,
      date,
      weight: Math.round(weight * 10) / 10,
      createdAt: now.toISOString(),
      source,
    };

    handleUpdateAppState(prev => {
      const existing = prev.weighIns || [];
      const sameDay = existing.findIndex(item => item.date === date);
      const weighIns = sameDay >= 0
        ? existing.map((item, index) => index === sameDay ? entry : item)
        : [...existing, entry];

      return {
        ...prev,
        weighIns,
        profile: prev.profile ? { ...prev.profile, weight: entry.weight } : prev.profile,
      };
    });
    setVisionRoadmap(null);
    // Source-aware confirmation so the chat tool feels like a chat reply,
    // not a check-in dialog.
    const toastMsg = source === 'chat'
      ? `Got it — saved ${entry.weight} lbs`
      : `Checked in at ${entry.weight} lbs`;
    triggerToast(toastMsg);
    return true;
  }, [triggerToast]);

  // Tracks the most recent activity burn so the user can hit "Undo" inside
  // the success toast. Null means there's nothing to undo right now.
  const [pendingActivityUndo, setPendingActivityUndo] = useState<{ amount: number; expiresAt: number } | null>(null);

  // Same pattern, but for food log additions. We snapshot the IDs that were
  // pushed so undo can remove exactly those (and not a re-logged duplicate).
  const [pendingFoodUndo, setPendingFoodUndo] = useState<{ ids: string[]; label: string; expiresAt: number } | null>(null);

  // Same pattern, but for food log deletions. We snapshot the deleted item
  // + its position in todayLog so undo restores it where it was.
  const [pendingDeleteUndo, setPendingDeleteUndo] = useState<{ item: FoodItem; index: number; expiresAt: number } | null>(null);

  const logActivity = (calories: number) => {
    handleUpdateAppState(prev => ({
        ...prev,
        activityBurn: prev.activityBurn + calories
    }));
    // 5-second undo window. The toast shows an Undo button while this is set.
    const expiresAt = Date.now() + 5000;
    setPendingActivityUndo({ amount: calories, expiresAt });
    // Toast duration matches the undo window so the Undo button stays
    // visible the whole time.
    triggerToast(pickVoice([
      'Mhm getting to work I see',
      'Another step in the right direction. Keep workin',
    ]), 5000);
    // Auto-clear the undo window after it expires.
    setTimeout(() => {
      setPendingActivityUndo(curr =>
        curr && curr.expiresAt <= Date.now() ? null : curr,
      );
    }, 5100);
  };

  const undoLastActivity = () => {
    if (!pendingActivityUndo) return;
    const amount = pendingActivityUndo.amount;
    handleUpdateAppState(prev => ({
        ...prev,
        activityBurn: Math.max(0, prev.activityBurn - amount),
    }));
    setPendingActivityUndo(null);
    triggerToast(`${amount} kcal · movement unmarked`);
  };

  // Undo the last food log push. Removes the exact items we just added
  // (matched by ID) so a re-logged item with the same name isn't touched.
  const undoLastFoodLog = () => {
    if (!pendingFoodUndo) return;
    const idsToRemove = new Set(pendingFoodUndo.ids);
    handleUpdateAppState(prev => ({
        ...prev,
        todayLog: (prev.todayLog || []).filter(i => !idsToRemove.has(i.id)),
    }));
    setPendingFoodUndo(null);
    triggerToast(pickVoice([
      'So you just didnt eat that?',
      'was it really that bad?',
      "Yeah I'd remove that too",
    ]));
  };

  // Restore the last deleted food item. We splice it back at its original
  // position so the order doesn't visibly jump around on undo.
  const undoLastDelete = () => {
    if (!pendingDeleteUndo) return;
    const { item, index } = pendingDeleteUndo;
    handleUpdateAppState(prev => {
        const next = [...(prev.todayLog || [])];
        const insertAt = Math.min(index, next.length);
        next.splice(insertAt, 0, item);
        return { ...prev, todayLog: next };
    });
    setPendingDeleteUndo(null);
    triggerToast(`Restored ${item.name}`);
  };

  // Toggle the favorited flag on a HistoryEntry. Favorited entries are
  // pinned to the top of the Quick tab and never pruned from history.
  const toggleHistoryFavorite = (entryId: string) => {
    handleUpdateAppState(prev => ({
        ...prev,
        foodHistory: (prev.foodHistory || []).map(e =>
            e.id === entryId ? { ...e, favorited: !e.favorited } : e,
        ),
    }));
  };

  // Remove a history entry entirely (Quick tab "X" button). This is
  // different from deleteLog — that one removes from today's log only.
  const removeHistoryEntry = (entryId: string) => {
    handleUpdateAppState(prev => ({
        ...prev,
        foodHistory: (prev.foodHistory || []).filter(e => e.id !== entryId),
    }));
  };

  const completedWorkoutsToday = useMemo(() => {
      const todayDayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
      return weeklyCompletedWorkouts.filter(w => w === todayDayName);
  }, [weeklyCompletedWorkouts]);

  // ----------------------------------------------------------------------
  // EXPONENTIAL SMOOTHING + THERMODYNAMICS PHYSICS CHECK
  // ----------------------------------------------------------------------
  const liveMetrics = useMemo(() => {
      // 1. ANCHOR: Use Initial Weight from Profile or Fallback
      const startWeight = appState.profile?.initialWeight || appState.profile?.weight || 160;
      const startBF = appState.profile?.bodyFat || 20;
      const weightKg = startWeight / 2.20462;
      const heightCm = (appState.profile?.height || 70) * 2.54;
      const age = appState.profile?.age || 25;
      const baseBMR = (10 * weightKg) + (6.25 * heightCm) - (5 * age) + (appState.profile?.sex === 'Female' ? -161 : 5);

      let trendWeight = startWeight;
      let trendBF = startBF;
      let accumulatedTheoreticalLoss = 0; // Cumulative lbs expected to be lost based on CICO

      // 2. Iterate History (Exponential Smoothing)
      // We process every logged day to smooth out the trend curve
      const allDays = [...(appState.dailyLogs || [])]; 
      
      allDays.forEach(log => {
          // --- Thermodynamics Check (CICO) ---
          // TDEE = 1815 * 1.2 + (Workout ? 350 : 0)
          const workoutBurn = log.workoutCompleted ? 350 : 0;
          const dailyTDEE = (baseBMR * 1.2) + workoutBurn;
          
          // Deficit = TDEE - Consumed
          const deficit = dailyTDEE - log.caloriesConsumed;
          
          // Expected Fat Loss = Deficit / 3500
          // Note: If no food logged (0 cal), this implies massive deficit. 
          // We filter days with <500 cal to prevent bad data skewing the math.
          if (log.caloriesConsumed > 500) {
              const dailyLoss = deficit / 3500;
              accumulatedTheoreticalLoss += dailyLoss; // Positive means weight LOSS
          }
      });

      // Weight trend only uses explicit check-ins. Older daily logs may carry
      // a repeated profile snapshot, which is not a real scale reading.
      const weightEntries = [...(appState.weighIns || [])]
          .filter(entry => entry.weight > 50 && entry.weight < 700)
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      weightEntries.forEach(entry => {
          trendWeight = trendWeight + 0.1 * (entry.weight - trendWeight);
      });

      // 3. Process TODAY (Live)
      const currentScaleWeight = appState.profile?.weight || trendWeight;
      const currentScaleBF = appState.profile?.bodyFat || trendBF;

      // Update Trend for Today
      if (weightEntries.length === 0) {
          trendWeight = trendWeight + 0.1 * (currentScaleWeight - trendWeight);
      }
      trendBF = trendBF + 0.05 * (currentScaleBF - trendBF);

      // Calculate Today's Physics
      const todayWorkout = completedWorkoutsToday.length > 0;
      const todayWorkoutBurn = todayWorkout ? 350 : 0;
      const todayTDEE = (baseBMR * 1.2) + todayWorkoutBurn;
      const todayDeficit = todayTDEE - consumedMacros.calories;
      
      // Only count today's deficit if user has actually logged meaningful food
      if (consumedMacros.calories > 500) {
          accumulatedTheoreticalLoss += (todayDeficit / 3500);
      }

      // 4. GENERATE BIO-ESTIMATED WEIGHT (The Math)
      const bioWeight = startWeight - accumulatedTheoreticalLoss;

      // 5. GENERATE FEEDBACK (Reality Check)
      // "Actual Scale Change" (Positive = Lost Weight)
      const totalScaleDrop = startWeight - currentScaleWeight;
      
      let status = "Healthy";
      let feedback = "Collecting data...";

      const diff = totalScaleDrop - accumulatedTheoreticalLoss;
      // Example: Scale dropped 5lbs, Physics says 2lbs. Diff = 3. (Water weight lost)
      // Example: Scale dropped 0lbs, Physics says 2lbs. Diff = -2. (Retention)

      if (diff > 2.5) {
          status = "Fluctuation";
          feedback = "Scale drop exceeds fat loss. Likely water weight shedding.";
      } else if (diff < -1.5) {
          status = "Plateau / Recomp";
          feedback = "Scale is lagging behind calculated fat loss. Water retention or muscle gain masking progress.";
      } else {
          status = "On Track";
          feedback = "Scale movement aligns accurately with your calorie deficit.";
      }

      return {
          scaleTrend: trendWeight.toFixed(1), // Smoothed Scale Weight
          bioWeight: bioWeight.toFixed(1),    // Thermodynamic Estimate
          currentPBF: trendBF.toFixed(1),
          theoreticalFatLoss: accumulatedTheoreticalLoss.toFixed(1),
          actualScaleDrop: totalScaleDrop.toFixed(1),
          status,
          feedback
      };

  }, [appState.dailyLogs, appState.profile, appState.weighIns, consumedMacros, completedWorkoutsToday]);

  const toggleExerciseComplete = (dayIndex: number, exerciseIndex: number) => {
      const newSplit = [...workoutSplit];
      const ex = newSplit[dayIndex].exercises[exerciseIndex];
      ex.completed = !ex.completed;
      setWorkoutSplit(newSplit);
      saveWorkoutToCloud(newSplit, weeklyCompletedWorkouts);
  };

  const updateExerciseWeight = (dayIndex: number, exerciseIndex: number, weight: string) => {
      const newSplit = [...workoutSplit];
      const val = weight === '' ? undefined : Number(weight);
      newSplit[dayIndex].exercises[exerciseIndex].weight = val;
      setWorkoutSplit(newSplit);
  };

  const deleteExercise = (dayIndex: number, exerciseIndex: number) => {
      const newSplit = [...workoutSplit];
      newSplit[dayIndex].exercises.splice(exerciseIndex, 1);
      setWorkoutSplit(newSplit);
      saveWorkoutToCloud(newSplit, weeklyCompletedWorkouts);
      triggerToast("Exercise Deleted");
  };

  const addExerciseToSplit = (dayIndex: number) => {
      if(!manualExercise.name) return;
      const newSplit = [...workoutSplit];
      newSplit[dayIndex].exercises.push({
          name: manualExercise.name,
          sets: manualExercise.sets,
          reps: manualExercise.reps,
          completed: false,
          gymAlternative: '',
          homeAlternative: ''
      });
      setWorkoutSplit(newSplit);
      saveWorkoutToCloud(newSplit, weeklyCompletedWorkouts);
      setManualExercise({ name: '', sets: 3, reps: '10' });
      setActiveDayIndexForAdd(null);
      triggerToast("Exercise Added");
  };

  const completeWorkoutDay = (dayIndex: number) => {
      const day = workoutSplit[dayIndex];
      if (weeklyCompletedWorkouts.includes(day.day)) {
          triggerToast("Already Completed This Week!");
          return;
      }

      const affectedMuscles = GET_AFFECTED_MUSCLES(day.label);
      const xpGain = 150; 
      
      handleUpdateAppState(prev => {
          const newBodyStats = { ...prev.bodyStats };
          affectedMuscles.forEach(muscle => {
              const key = muscle as keyof BodyStats;
              if (newBodyStats[key]) {
                  newBodyStats[key].currentXP += xpGain;
                  if (newBodyStats[key].currentXP >= newBodyStats[key].maxXP) {
                      newBodyStats[key].level += 1;
                      newBodyStats[key].currentXP -= newBodyStats[key].maxXP;
                      newBodyStats[key].maxXP = Math.round(newBodyStats[key].maxXP * 1.2);
                      triggerToast(`LEVEL UP: ${muscle.toUpperCase()}!`);
                  }
              }
          });
          return { ...prev, bodyStats: newBodyStats };
      });

      const newWeekly = [...weeklyCompletedWorkouts, day.day];
      setWeeklyCompletedWorkouts(newWeekly);
      saveWorkoutToCloud(workoutSplit, newWeekly);
      
      let totalVolume = 0;
      day.exercises.forEach((ex: any) => {
          const weight = ex.weight || 0;
          const sets = ex.sets || 0;
          const repsStr = String(ex.reps);
          const repsMatch = repsStr.match(/\d+/);
          const reps = repsMatch ? parseInt(repsMatch[0]) : 0;
          totalVolume += (weight * sets * reps);
      });

      handleUpdateAppState(prev => ({
          ...prev,
          dailyLogs: [
              ...prev.dailyLogs,
              {
                  date: new Date().toISOString(),
                  weight: 0,
                  caloriesConsumed: consumedMacros.calories,
                  proteinConsumed: consumedMacros.protein,
                  carbsConsumed: consumedMacros.carbs,
                  fatConsumed: consumedMacros.fat,
                  waterIntake: prev.waterIntake,
                  workoutCompleted: true,
                  workoutLabel: day.label,
                  workoutVolume: totalVolume,
                  workoutExercises: day.exercises
              }
          ]
      }));
      triggerToast("Workout logged");
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
        Array.from(e.target.files).forEach(async (file: File) => {
            // Resize image before storing in state to prevent memory crashes
            try {
                const resized = await resizeImage(file);
                setFoodImages(prev => [...prev, resized]);
            } catch (err) {
                console.error("Image resize failed", err);
                triggerToast("Failed to process image");
            }
        });
    }
  };

  const removeImage = (index: number) => {
      setFoodImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleAnalyzeFood = async () => {
    if (foodImages.length === 0 && !foodDescription) return;
    setIsAnalyzingFood(true);
    setAnalysisTip(pickVoice([
      'Trying to figure out what the hell you are eating....',
      'This (whatever it is, im still figuring it out..) looks yummy',
    ]));
    try {
      const result = await analyzeFoodEntry(foodImages, foodDescription, 'auto', appState.customMenuItems);
      
      if (!result.items || !Array.isArray(result.items)) {
          throw new Error("Invalid AI response");
      }

      // Map result items to our scan form state safely. We preserve the new
      // optional enrichment fields (source, confidence, ingredients, serving
      // info) so the review UI can surface them as badges and an expandable
      // ingredient list.
      const items: ScannedItem[] = result.items.map((item: any) => ({
          name: item.name || "Unknown Item",
          calories: String(item.calories || '').replace(/[^0-9.]/g, ''),
          protein: String(item.protein || '').replace(/[^0-9.]/g, ''),
          carbs: String(item.carbs || '').replace(/[^0-9.]/g, ''),
          fat: String(item.fat || '').replace(/[^0-9.]/g, ''),
          fiber: String(item.fiber || '').replace(/[^0-9.]/g, ''),
          source: item.source,
          confidence: item.confidence,
          ingredients: Array.isArray(item.ingredients) ? item.ingredients : undefined,
          servingSize: typeof item.servingSize === 'string' ? item.servingSize : undefined,
          servingsConsumed: typeof item.servingsConsumed === 'number' ? item.servingsConsumed : undefined,
      }));

      setScannedItems(items);
      setExpandedIngredients(new Set());

      // If detection found nothing, set manual mode default
      if (items.length === 0) {
           setFoodForm({ name: '', calories: '', protein: '', carbs: '', fat: '' });
      }

      if (result.tip) setAnalysisTip(result.tip);
      setAnalysisNutritionSources((result as any).nutritionSourcesUsed ?? []);
      setAnalysisNutritionMatchCount((result as any).nutritionMatchCount ?? 0);
      setAnalysisNutritionSkipped((result as any).nutritionSourcesSkipped ?? []);
    } catch (e) {
      triggerToast("Hm yeah so I dont know what you are eating, you sure its food?");
      console.error(e);
      setAddFoodMode('manual');
    } finally {
      setIsAnalyzingFood(false);
    }
  };

  const addFoodEntry = () => {
      // Manual Mode Entry
      if (!foodForm.name || !foodForm.calories) return;
      const newItem: FoodItem = {
          id: Date.now().toString() + '-' + Math.random().toString(36).substr(2, 5),
          name: foodForm.name,
          calories: safeFloat(foodForm.calories),
          protein: safeFloat(foodForm.protein),
          carbs: safeFloat(foodForm.carbs),
          fat: safeFloat(foodForm.fat),
          fiber: safeFloat(foodForm.fiber),
          timestamp: new Date().toLocaleTimeString()
      };
      
      // Add single item
      pushFoodToState([newItem], newItem.name);
  };

  const addAllScannedItems = () => {
      const newItems: FoodItem[] = scannedItems.map((item, idx) => ({
          id: Date.now().toString() + '-' + idx + '-' + Math.random().toString(36).substr(2, 5),
          name: item.name || 'Unknown',
          calories: safeFloat(item.calories),
          protein: safeFloat(item.protein),
          carbs: safeFloat(item.carbs),
          fat: safeFloat(item.fat),
          fiber: safeFloat(item.fiber),
          timestamp: new Date().toLocaleTimeString(),
          // Preserve AI-decomposed ingredients so the Log tab can drill in
          // and let the user edit portions or delete individual ingredients.
          ingredients: Array.isArray((item as any).ingredients) && (item as any).ingredients.length > 0
              ? (item as any).ingredients.map((ing: any) => ({
                  name: String(ing.name || 'Ingredient'),
                  grams: safeFloat(ing.grams),
                  calories: safeFloat(ing.calories),
                  protein: safeFloat(ing.protein),
                  carbs: safeFloat(ing.carbs),
                  fat: safeFloat(ing.fat),
                  fiber: ing.fiber !== undefined ? safeFloat(ing.fiber) : undefined,
                  emoji: ing.emoji || undefined,
              }))
              : undefined,
      }));

      // AUTO-ADD UNKNOWN RESTAURANT ITEMS: if the user's description mentions
      // a known chain AND any scanned item has a restaurant-attributed source,
      // see whether the item exists in our verified menu (built-in or custom).
      // If not, add it to the user's customMenuItems for that restaurant so
      // they (and the AI, on future requests) can find it instantly.
      const detected = detectRestaurantsInText(foodDescription || '');
      if (detected.length > 0) {
          const primaryRestaurant = detected[0];
          const currentCustom = appState.customMenuItems?.[primaryRestaurant.id] || [];
          const allKnownForThisRestaurant: MenuItem[] = [...primaryRestaurant.menuItems, ...currentCustom];

          const newCustomEntries: NonNullable<AppState['customMenuItems']>[string] = [];
          for (let i = 0; i < scannedItems.length; i++) {
              const scanned = scannedItems[i];
              const sourceItem = (scanned as any).source;
              // Only auto-add when the AI attributed the macros to a restaurant
              // database or nutrition database (real source). Skip pure
              // text/visual estimates so guesses don't pollute the menu.
              if (sourceItem !== 'restaurant_db' && sourceItem !== 'nutrition_db') continue;
              const itemName = scanned.name || newItems[i].name;
              if (!itemName) continue;
              // Fuzzy match against everything we already know for this restaurant.
              const matches = findMenuItemMatches(itemName, allKnownForThisRestaurant);
              if (matches.length > 0) continue; // already in our menu, skip
              newCustomEntries.push({
                  id: `custom-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
                  name: itemName,
                  category: 'Added by you',
                  calories: safeFloat(scanned.calories),
                  protein:  safeFloat(scanned.protein),
                  carbs:    safeFloat(scanned.carbs),
                  fat:      safeFloat(scanned.fat),
                  fiber:    safeFloat(scanned.fiber) || undefined,
                  isCustom: true,
                  addedAt: new Date().toISOString(),
              });
          }

          if (newCustomEntries.length > 0) {
              handleUpdateAppState(prev => ({
                  ...prev,
                  customMenuItems: {
                      ...(prev.customMenuItems || {}),
                      [primaryRestaurant.id]: [
                          ...(prev.customMenuItems?.[primaryRestaurant.id] || []),
                          ...newCustomEntries,
                      ],
                  },
              }));
              // Toast happens after the log toast in pushFoodToState — slight delay
              // so the user sees both messages in sequence.
              const itemLabels = newCustomEntries.map(e => `"${e.name}"`).join(', ');
              setTimeout(() => triggerToast(`Saved ${itemLabels} to ${primaryRestaurant.shortName}`), 1500);
          }
      }

      // Use user description or generic name if description missing
      const mealLabel = foodDescription || (newItems.length > 1 ? "Scanned Meal" : newItems[0].name);
      pushFoodToState(newItems, mealLabel);
  };

  const pushFoodToState = (items: FoodItem[], label?: string) => {
      handleUpdateAppState(prev => {
          const rawLabel = label || (items.length === 1 ? items[0].name : `Meal (${items.length} items)`);
          const mealLabel = rawLabel.length > 30 ? rawLabel.substring(0, 30) + '...' : rawLabel;
          const totalCalories = items.reduce((a,b) => a + b.calories, 0);
          const totalProtein  = items.reduce((a,b) => a + b.protein, 0);
          const totalCarbs    = items.reduce((a,b) => a + b.carbs, 0);
          const totalFat      = items.reduce((a,b) => a + b.fat, 0);

          const currentHistory = prev.foodHistory || [];

          // De-dupe by label. If we've logged this exact meal label before,
          // BUMP the existing entry (refresh timestamp + increment count)
          // instead of creating a duplicate. This is what the user expected
          // when re-logging "Chipotle Chicken Bowl" repeatedly.
          const existingIdx = currentHistory.findIndex(e => e.label === mealLabel);
          let newHistory: HistoryEntry[];
          let bumped: HistoryEntry;

          if (existingIdx >= 0) {
              const existing = currentHistory[existingIdx];
              const nextCount = (existing.loggedCount ?? 1) + 1;
              // Auto-favorite at 5+ logs unless user has explicitly turned it off.
              const shouldAutoFavorite =
                  !existing.favorited &&
                  nextCount >= 5 &&
                  prev.profile?.autoFavoriteEnabled !== false;
              bumped = {
                  ...existing,
                  timestamp: new Date().toLocaleDateString(),
                  loggedCount: nextCount,
                  favorited: existing.favorited || shouldAutoFavorite,
                  // Keep the LATEST items list so re-logs reflect any AI macro
                  // refinements between log events.
                  items,
                  totalCalories, totalProtein, totalCarbs, totalFat,
              };
              // Move to front
              newHistory = [bumped, ...currentHistory.filter((_, i) => i !== existingIdx)];
              if (shouldAutoFavorite) {
                  setTimeout(() => triggerToast(`★ Added "${mealLabel}" to favorites`), 100);
              }
          } else {
              bumped = {
                  id: Date.now().toString(),
                  label: mealLabel,
                  timestamp: new Date().toLocaleDateString(),
                  totalCalories, totalProtein, totalCarbs, totalFat,
                  items,
                  loggedCount: 1,
              };
              newHistory = [bumped, ...currentHistory];
          }

          // Prune to 50, but ALWAYS keep favorited entries even if they'd
          // otherwise be dropped from the cap.
          if (newHistory.length > 50) {
              const favorited = newHistory.filter(e => e.favorited);
              const nonFavorited = newHistory.filter(e => !e.favorited).slice(0, 50 - favorited.length);
              // Re-merge preserving recency order: favorites at the start
              // (latest first), then most-recent non-favorited.
              newHistory = [...favorited, ...nonFavorited];
          }

          return {
              ...prev,
              todayLog: [...items, ...(prev.todayLog || [])],
              foodHistory: newHistory,
          };
      });

      // Reset Form
      setFoodForm({ name: '', calories: '', protein: '', carbs: '', fat: '' });
      setScannedItems([]);
      setExpandedIngredients(new Set());
      setFoodImages([]);
      setFoodDescription('');
      setShowAddFood(false);
      setAddFoodMode('manual');

      // 5-second undo window. Snapshot the exact item IDs so undo removes
      // these specific entries even if the user logs the same meal again.
      const undoExpiresAt = Date.now() + 5000;
      const undoLabel = items.length > 1 ? `${items.length} items` : items[0]?.name || 'item';
      setPendingFoodUndo({ ids: items.map(i => i.id), label: undoLabel, expiresAt: undoExpiresAt });
      triggerToast(
        items.length > 1
          ? `${items.length} items down. Damn you ate huh`
          : pickVoice([
              'That must have been yummy',
              'Really you ate that? HAHA Just kidding',
            ]),
        5000,
      );
      // Celebrate the log — feathers + arrows fly across the screen.
      setShowCelebration(true);
      setTimeout(() => {
        setPendingFoodUndo(curr =>
          curr && curr.expiresAt <= Date.now() ? null : curr,
        );
      }, 5100);
  };

  const deleteLog = (id: string) => {
      // Snapshot the item BEFORE we remove it so undo can restore it exactly
      // (including its original position in the food log order).
      const currentLog = appState.todayLog || [];
      const index = currentLog.findIndex(item => item.id === id);
      const snapshot = index >= 0 ? currentLog[index] : null;

      handleUpdateAppState(prev => ({
          ...prev,
          todayLog: (prev.todayLog || []).filter(item => item.id !== id)
      }));

      if (snapshot) {
          // 5-second undo window. Same pattern as activity-burn / food-add undo.
          const expiresAt = Date.now() + 5000;
          setPendingDeleteUndo({ item: snapshot, index, expiresAt });
          triggerToast(pickVoice([
            `So you just didnt eat that ${snapshot.name}?`,
            `${snapshot.name}? Was it really that bad?`,
            `Yeah I'd remove ${snapshot.name} too`,
          ]), 5000);
          setTimeout(() => {
              setPendingDeleteUndo(curr =>
                  curr && curr.expiresAt <= Date.now() ? null : curr,
              );
          }, 5100);
      } else {
          triggerToast("Removed from your trail");
      }
  };

  const updateScannedItem = (index: number, field: keyof ScannedItem, value: string) => {
      const updated = [...scannedItems];
      updated[index] = { ...updated[index], [field]: value };
      setScannedItems(updated);
  };

  const removeScannedItem = (index: number) => {
      const updated = scannedItems.filter((_, i) => i !== index);
      setScannedItems(updated);
  };

  const logHistoryEntry = (entry: HistoryEntry) => {
      // Create fresh copies of items with new IDs for the current log
      const newItems = entry.items.map((item, idx) => ({
          ...item,
          id: Date.now() + '-' + idx + Math.random().toString(36).substr(2, 5),
          timestamp: new Date().toLocaleTimeString()
      }));
      
      // Push to state (this will also bubble it to top of history in pushFoodToState)
      pushFoodToState(newItems, entry.label);
      setAddFoodMode('manual');
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || !appState.profile) return;
    const userMsg = chatInput;
    setChatInput('');
    setChatHistory(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsChatLoading(true);
    try {
        const response = await sendChatMessage(chatHistory, appState.profile, userMsg);
        
        if (response.text) {
             setChatHistory(prev => [...prev, { role: 'model', text: response.text }]);
        }

        if (response.toolCalls && response.toolCalls.length > 0) {
            for (const tool of response.toolCalls) {
                if (tool.name === 'saveInsight') {
                    const { title, content } = tool.args;
                    const newNote: SavedNote = {
                        id: Date.now().toString(),
                        title: title,
                        content: content,
                        date: new Date().toLocaleDateString(),
                        type: 'coach_insight'
                    };
                    handleUpdateAppState(prev => ({
                        ...prev,
                        savedNotes: [newNote, ...(prev.savedNotes || [])]
                    }));
                    triggerToast("Coach Saved a Note");
                }
                else if (tool.name === 'addExerciseToSplit') {
                     const { day, exerciseName, sets, reps } = tool.args;
                     const dayIndex = workoutSplit.findIndex(d => d.day.toLowerCase() === day.toLowerCase());
                     if (dayIndex !== -1) {
                         const newSplit = [...workoutSplit];
                         newSplit[dayIndex].exercises.push({
                             name: exerciseName,
                             sets: sets,
                             reps: reps,
                             completed: false,
                             gymAlternative: '',
                             homeAlternative: ''
                         });
                         setWorkoutSplit(newSplit);
                         saveWorkoutToCloud(newSplit, weeklyCompletedWorkouts);
                         triggerToast(`Added ${exerciseName} to ${day}`);
                     }
                }
                else if (tool.name === 'updateUserMetric') {
                     const { metric, value } = tool.args;
                     if (metric === 'weight' && appState.profile) {
                          recordWeight(Number(value), 'chat');
                    } else if (metric === 'bodyFat' && appState.profile) {
                         const newProfile = { ...appState.profile, bodyFat: value };
                         handleUpdateAppState(prev => ({
                             ...prev,
                             profile: newProfile
                         }));
                         setVisionRoadmap(null);
                         triggerToast(`Body Fat Updated: ${value}%`);
                    }
                }
            }
        }
    } catch (e) {
        setChatHistory(prev => [...prev, { role: 'model', text: "Connection error." }]);
    } finally {
        setIsChatLoading(false);
    }
  };

  const handleProfilePicUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      handleUpdateAppState(prev => ({
        ...prev,
        profile: {
          ...prev.profile!,
          profilePicture: base64
        }
      }));
    };
    reader.readAsDataURL(file);
  };

  // --------------------------------------------------------------------------------
  // RENDER LOGIC
  // --------------------------------------------------------------------------------
  
  if (!isConfigured) {
      return (
          <div className="min-h-screen bg-[#0d0a08] flex flex-col items-center justify-center text-white font-orbitron text-center p-4">
              <h2 className="text-red-500 font-bold mb-4">SYSTEM HALTED</h2>
              <p className="text-xs text-gray-400">Firebase Config Missing in <code>services/firebase.ts</code></p>
          </div>
      );
  }

  // Use appState.profile or initialProfile, but at this point profile is guaranteed
  const currentProfile = appState.profile || initialProfile;
  if (!currentProfile) return null; // safety

  const waterTarget = Math.round(currentProfile.weight * 0.5);

  return (
    <Layout
      activeTab={activeTab}
      onTabChange={switchTab}
      profile={currentProfile}
      onUpdateName={(name) => {
        // Header username editor — name comes in trimmed and length-checked.
        // Mirror to local state + Firestore via handleUpdateAppState; toast
        // gives a soft confirmation so taps feel deliberate.
        handleUpdateAppState(prev => ({
          ...prev,
          profile: prev.profile ? { ...prev.profile, name } : prev.profile,
        }));
        triggerToast('Saved');
      }}
    >
      {showToast && (() => {
        // Pick the active undo, preferring the MOST RECENTLY set one (each
        // new action overwrites the prior toast anyway, so the freshest
        // pending undo is what the user is looking at). Order matches the
        // typical action flow: delete > food-add > activity-burn.
        const now = Date.now();
        let undoFn: (() => void) | null = null;
        if (pendingDeleteUndo && pendingDeleteUndo.expiresAt > now) {
          undoFn = undoLastDelete;
        } else if (pendingFoodUndo && pendingFoodUndo.expiresAt > now) {
          undoFn = undoLastFoodLog;
        } else if (pendingActivityUndo && pendingActivityUndo.expiresAt > now) {
          undoFn = undoLastActivity;
        }
        return (
          <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[200] bg-[#d97757] text-white px-5 py-2 rounded-full font-bold text-xs uppercase tracking-widest shadow-md animate-slide-up flex items-center gap-3 whitespace-nowrap">
            <span>{toastMessage}</span>
            {/* Undo button — appears whenever a 5-second undo window is open
                for activity burn, food add, or food delete. Tapping reverses
                the most recent action and clears the window. */}
            {undoFn && (
              <button
                onClick={undoFn}
                className="ml-1 px-3 py-1 rounded-full bg-white text-black text-[10px] font-bold uppercase tracking-widest hover:bg-gray-200 transition-colors"
              >
                Undo
              </button>
            )}
          </div>
        );
      })()}

      {/* FLOATING ACTION BUTTON FOR ADD FOOD - GLOBAL (Hidden on Coach tab) */}
      {!showAddFood && activeTab !== 'coach' && (
          <button
            data-tour="add-food-fab"
            onClick={() => setShowAddFood(true)}
            className="fixed bottom-28 right-6 w-14 h-14 bg-[#d97757] rounded-full shadow-[0_4px_14px_rgba(0,0,0,0.4)] z-[60] flex items-center justify-center text-2xl text-white hover:scale-110 transition-transform"
          >
              +
          </button>
      )}

      {/* ADD FOOD BOTTOM SHEET MODAL */}
      {showAddFood && (
            <div
              className="fixed inset-0 z-[100] flex items-end justify-center"
              style={{ background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(6px)' }}
              onClick={() => setShowAddFood(false)}
            >
              <div
                className="w-full max-w-md rounded-t-[2.5rem] shadow-2xl overflow-y-auto max-h-[88vh] animate-slide-up"
                style={{
                  background: '#161210',
                  borderTop: '1px solid rgba(255,255,255,0.08)',
                }}
                onClick={e => e.stopPropagation()}
              >
                {/* Top grip + hero header */}
                <div className="px-6 pt-3 pb-5">
                  <div className="w-12 h-1.5 rounded-full mx-auto mb-5" style={{ background: 'rgba(255,255,255,0.12)' }}></div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.3em] font-bold" style={{ color: '#d97757' }}>
                        Log fuel
                      </div>
                      <h2 className="text-3xl font-bold leading-tight mt-1" style={{ color: '#f5ede1' }}>
                        What did you eat?
                      </h2>
                    </div>
                    <button
                      onClick={() => setShowAddFood(false)}
                      className="w-9 h-9 flex items-center justify-center rounded-full shrink-0 transition-colors"
                      style={{ background: '#1d1815', border: '1px solid rgba(255,255,255,0.1)', color: '#c4b8a4' }}
                      aria-label="Close"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <div className="px-6 pb-6">
                
                {/* QUICK ADD PILLS - Now using Grouped History */}
                {appState.foodHistory && appState.foodHistory.length > 0 && addFoodMode === 'manual' && scannedItems.length === 0 && (
                    <div className="mb-6">
                        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                            {appState.foodHistory.slice(0, 6).map(entry => (
                                <button 
                                    key={entry.id} 
                                    onClick={() => logHistoryEntry(entry)}
                                    className="bg-white/5 hover:bg-orange-500/20 border border-white/10 hover:border-orange-500 rounded-full px-4 py-2 text-xs text-gray-300 transition-all shrink-0 whitespace-nowrap font-medium"
                                >
                                    {entry.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div className="flex p-1 bg-white/5 rounded-xl mb-6 border border-white/10">
                    <button 
                        onClick={() => { setAddFoodMode('manual'); setScannedItems([]); }}
                        className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all ${addFoodMode === 'manual' ? 'bg-white text-black shadow-lg' : 'text-gray-500'}`}
                    >
                        Manual
                    </button>
                    <button 
                        onClick={() => setAddFoodMode('ai')}
                        className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all ${addFoodMode === 'ai' ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg' : 'text-gray-500'}`}
                    >
                        AI Scan
                    </button>
                    <button
                        onClick={() => setAddFoodMode('history')}
                        className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all ${addFoodMode === 'history' ? 'bg-white/20 text-white shadow-lg' : 'text-gray-500'}`}
                    >
                        Quick
                    </button>
                </div>

                {addFoodMode === 'history' && (() => {
                    const all = appState.foodHistory || [];
                    const favorites = all.filter(e => e.favorited);
                    const recents = all.filter(e => !e.favorited);

                    // Reusable card renderer — same shape for favorites and recents,
                    // only the star fill / accent color differ.
                    const renderEntry = (entry: HistoryEntry) => (
                        <div
                            key={entry.id}
                            className={`group flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-3 py-2.5 transition-all ${entry.favorited ? 'border-orange-500/30' : ''}`}
                        >
                            {/* Tap the body to re-log */}
                            <button
                                onClick={() => logHistoryEntry(entry)}
                                className="flex-1 min-w-0 text-left"
                            >
                                <p className="text-sm font-bold text-gray-100 truncate">{entry.label}</p>
                                <div className="flex flex-wrap gap-x-2 gap-y-0 text-[9px] text-gray-500 uppercase tracking-wider mt-0.5 tabular-nums">
                                    <span>{Math.round(entry.totalCalories)} kcal</span>
                                    <span className="text-emerald-400">{Math.round(entry.totalProtein)}g P</span>
                                    {entry.items.length > 1 && <span>· {entry.items.length} items</span>}
                                    {entry.loggedCount && entry.loggedCount > 1 && <span className="text-gray-600">· logged {entry.loggedCount}×</span>}
                                </div>
                            </button>

                            {/* Star toggle */}
                            <button
                                onClick={(e) => { e.stopPropagation(); toggleHistoryFavorite(entry.id); }}
                                className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors text-base ${
                                    entry.favorited
                                        ? 'text-orange-400 hover:text-orange-300 bg-orange-500/10'
                                        : 'text-gray-600 hover:text-orange-400 hover:bg-white/5'
                                }`}
                                aria-label={entry.favorited ? 'Unfavorite' : 'Favorite'}
                            >
                                {entry.favorited ? '★' : '☆'}
                            </button>

                            {/* Remove from history. Favorites are pinned, so only allow
                                removing non-favorited entries from this view. */}
                            {!entry.favorited && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); removeHistoryEntry(entry.id); }}
                                    className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-600 hover:text-red-400 hover:bg-white/5 opacity-0 group-hover:opacity-100 transition-all text-xs"
                                    aria-label="Remove from history"
                                >
                                    ✕
                                </button>
                            )}

                            {/* Quick "+" log button (always visible) */}
                            <button
                                onClick={(e) => { e.stopPropagation(); logHistoryEntry(entry); }}
                                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-emerald-500 hover:text-black text-gray-300 text-sm font-bold transition-colors shrink-0"
                                aria-label="Quick log"
                            >
                                +
                            </button>
                        </div>
                    );

                    if (all.length === 0) {
                        return (
                            <div className="text-center py-10 opacity-50">
                                <p className="text-xs">No meals yet — log something to start your quick list.</p>
                            </div>
                        );
                    }

                    return (
                        <div className="space-y-5">
                            {/* FAVORITES */}
                            {favorites.length > 0 && (
                                <div className="space-y-2">
                                    <h3 className="text-[10px] font-bold text-orange-400 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                                        <span>★ Favorites</span>
                                        <span className="text-gray-600 font-mono">({favorites.length})</span>
                                    </h3>
                                    <div className="space-y-1.5 max-h-[30vh] overflow-y-auto">
                                        {favorites.map(renderEntry)}
                                    </div>
                                </div>
                            )}

                            {/* RECENTS */}
                            {recents.length > 0 && (
                                <div className="space-y-2">
                                    <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                                        <span>Recent</span>
                                        <span className="text-gray-700 font-mono">({recents.length})</span>
                                    </h3>
                                    <div className="space-y-1.5 max-h-[30vh] overflow-y-auto">
                                        {recents.map(renderEntry)}
                                    </div>
                                </div>
                            )}

                            <p className="text-[9px] text-gray-600 italic text-center pt-2">
                                Star items you want pinned — favorites are kept forever.
                                Items you log 5+ times are starred automatically.
                            </p>
                        </div>
                    );
                })()}

                {addFoodMode === 'ai' && scannedItems.length === 0 && (
                     <div className="space-y-4">
                         {/* DRAG & DROP / CLICK AREA */}
                         <div className="border-2 border-dashed border-white/10 rounded-2xl p-4 flex flex-col items-center justify-center hover:border-purple-500/50 transition-all group relative bg-white/[0.02]">
                            <div className="w-16 h-16 rounded-full bg-purple-500/10 text-purple-500 flex items-center justify-center mb-3 text-2xl group-hover:scale-110 transition-transform">📷</div>
                            <p className="text-xs text-gray-400 font-bold mb-1">Tap to capture labels or food</p>
                            <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">Multi-select supported</p>
                            <input 
                                type="file" 
                                ref={fileInputRef}
                                accept="image/*"
                                multiple
                                onChange={handleImageUpload}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                            />
                         </div>

                         {/* HORIZONTAL IMAGE PREVIEW SCROLL */}
                         {foodImages.length > 0 && (
                             <div className="flex gap-3 overflow-x-auto pb-2 px-1">
                                 {foodImages.map((img, idx) => (
                                     <div key={idx} className="relative w-24 h-24 shrink-0 rounded-xl overflow-hidden border border-white/20 group">
                                         <img src={img} className="w-full h-full object-cover" alt={`Upload ${idx}`} />
                                         <button 
                                            onClick={() => removeImage(idx)}
                                            className="absolute top-1 right-1 bg-black/70 text-white rounded-full p-1 w-5 h-5 flex items-center justify-center text-[10px] backdrop-blur-md hover:bg-red-500 transition-colors"
                                         >
                                             ✕
                                         </button>
                                     </div>
                                 ))}
                             </div>
                         )}
                         
                         <input 
                            type="text"
                            value={foodDescription}
                            onChange={(e) => setFoodDescription(e.target.value)}
                            placeholder="e.g. '2 servings of rice label, 1 cup of chicken'"
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white text-sm focus:outline-none focus:border-purple-500 transition-colors"
                         />

                         <button 
                            onClick={handleAnalyzeFood}
                            disabled={(foodImages.length === 0 && !foodDescription) || isAnalyzingFood}
                            className="w-full py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold text-xs uppercase tracking-widest rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:grayscale"
                         >
                            {isAnalyzingFood ? "Analyzing..." : `Analyze ${foodImages.length > 0 ? `(${foodImages.length} Images)` : ''}`}
                         </button>
                     </div>
                )}
                
                {scannedItems.length > 0 && (
                    // SCANNED ITEMS REVIEW LIST
                    <div className="space-y-4">
                        {/* ... items list ... */}
                         <div className="flex justify-between items-center mb-2">
                             <h3 className="text-xs font-bold uppercase text-white">Review Detected Items</h3>
                             <button onClick={() => { setScannedItems([]); setExpandedIngredients(new Set()); }} className="text-[10px] text-pink-500 font-bold uppercase">Clear All</button>
                        </div>

                        {analysisTip && (
                            <div className="bg-purple-500/10 border border-purple-500/30 p-4 rounded-xl flex items-start gap-3">
                                <span className="text-lg">💡</span>
                                <p className="text-xs text-purple-400 leading-relaxed pt-0.5 font-medium">{analysisTip}</p>
                            </div>
                        )}

                        {/* Nutrition DB lookup indicator — surfaces which authoritative
                            sources were queried AND which were skipped, so the
                            integration is fully visible. Hidden when no nutrition
                            lookup was made (e.g. photo path, restaurant match, or
                            query too long). */}
                        {(analysisNutritionSources.length > 0 || analysisNutritionSkipped.length > 0) && (
                            <div className="bg-cyan-500/10 border border-cyan-500/30 px-3 py-2 rounded-xl space-y-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm">🗄</span>
                                    <div className="flex-1 text-[10px] text-cyan-300 uppercase tracking-widest font-bold">
                                        {analysisNutritionSources.length === 0 ? (
                                            <span className="text-amber-400">No databases used</span>
                                        ) : (
                                            <>
                                                {analysisNutritionSources.includes('usda') && 'USDA'}
                                                {analysisNutritionSources.includes('usda') && analysisNutritionSources.includes('openfoodfacts') && ' + '}
                                                {analysisNutritionSources.includes('openfoodfacts') && 'Open Food Facts'}
                                                {analysisNutritionMatchCount > 0
                                                    ? ` · ${analysisNutritionMatchCount} match${analysisNutritionMatchCount !== 1 ? 'es' : ''}`
                                                    : ' · no matches'}
                                            </>
                                        )}
                                    </div>
                                </div>
                                {/* If any sources were skipped, show why. This is the diagnostic
                                    for things like "USDA_API_KEY not set" — once the user fixes
                                    that, this line disappears. */}
                                {analysisNutritionSkipped.length > 0 && (
                                    <div className="text-[9px] text-amber-400/80 leading-relaxed pl-6">
                                        {analysisNutritionSkipped.map((s, i) => (
                                            <div key={i}>
                                                <span className="font-bold uppercase">{s.source}</span> skipped: {s.reason}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-1">
                            {scannedItems.map((item, idx) => {
                                // Source label: short, human-readable, with emoji.
                                const sourceLabel =
                                    item.source === 'label' ? '📋 Nutrition label' :
                                    item.source === 'restaurant_db' ? '🔍 Restaurant menu' :
                                    item.source === 'nutrition_db' ? '🗄 USDA / Open Food Facts' :
                                    item.source === 'visual_estimate' ? '👁 Visual estimate' :
                                    item.source === 'text_only' ? '✏️ Text estimate' :
                                    null;

                                // Confidence chip styling. Low confidence intentionally screams
                                // "verify" so users catch AI errors like the per-unit / per-serving
                                // mix-up that produced a 144g-protein 6-tender result for Huey Magoo.
                                const confidenceClass =
                                    item.confidence === 'high' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' :
                                    item.confidence === 'medium' ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' :
                                    item.confidence === 'low' ? 'bg-red-500/15 text-red-400 border-red-500/30' :
                                    '';
                                const confidenceText =
                                    item.confidence === 'high' ? '● High confidence' :
                                    item.confidence === 'medium' ? '● Medium — verify' :
                                    item.confidence === 'low' ? '● Low — verify' :
                                    null;

                                const isExpanded = expandedIngredients.has(idx);
                                const toggleExpanded = () => {
                                    setExpandedIngredients(prev => {
                                        const next = new Set(prev);
                                        if (next.has(idx)) next.delete(idx);
                                        else next.add(idx);
                                        return next;
                                    });
                                };

                                return (
                                <div key={idx} className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={item.name}
                                            onChange={(e) => updateScannedItem(idx, 'name', e.target.value)}
                                            className="flex-1 bg-transparent border-b border-white/10 text-white font-bold text-sm focus:outline-none focus:border-pink-500"
                                            placeholder="Item Name"
                                        />
                                        <button onClick={() => removeScannedItem(idx)} className="text-gray-500 hover:text-red-500">✕</button>
                                    </div>

                                    {/* Source + confidence badges — only render when AI provided them. */}
                                    {(sourceLabel || confidenceText) && (
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            {sourceLabel && (
                                                <span className="text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/5 text-gray-300 border border-white/10">
                                                    {sourceLabel}
                                                </span>
                                            )}
                                            {confidenceText && (
                                                <span className={`text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full font-bold border ${confidenceClass}`}>
                                                    {confidenceText}
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    {/* Serving info for nutrition labels */}
                                    {item.servingSize && (
                                        <div className="text-[10px] text-gray-500">
                                            Serving: <span className="text-gray-300">{item.servingSize}</span>
                                            {typeof item.servingsConsumed === 'number' && (
                                                <> · <span className="text-gray-300">{item.servingsConsumed} serving{item.servingsConsumed !== 1 ? 's' : ''} consumed</span></>
                                            )}
                                        </div>
                                    )}

                                    <div className="grid grid-cols-5 gap-2">
                                        <div>
                                            <label className="text-[8px] text-gray-500 uppercase">Cals</label>
                                            <input type="number" value={item.calories} onChange={(e) => updateScannedItem(idx, 'calories', e.target.value)} className="w-full bg-white/5 rounded px-2 py-1 text-xs text-white" />
                                        </div>
                                        <div>
                                            <label className="text-[8px] text-emerald-400 uppercase">Prot</label>
                                            <input type="number" value={item.protein} onChange={(e) => updateScannedItem(idx, 'protein', e.target.value)} className="w-full bg-white/5 rounded px-2 py-1 text-xs text-white" />
                                        </div>
                                        <div>
                                            <label className="text-[8px] text-gray-500 uppercase">Carb</label>
                                            <input type="number" value={item.carbs} onChange={(e) => updateScannedItem(idx, 'carbs', e.target.value)} className="w-full bg-white/5 rounded px-2 py-1 text-xs text-white" />
                                        </div>
                                        <div>
                                            <label className="text-[8px] text-gray-500 uppercase">Fat</label>
                                            <input type="number" value={item.fat} onChange={(e) => updateScannedItem(idx, 'fat', e.target.value)} className="w-full bg-white/5 rounded px-2 py-1 text-xs text-white" />
                                        </div>
                                        <div>
                                            <label className="text-[8px] text-yellow-500 uppercase">Fibr</label>
                                            <input type="number" value={item.fiber} onChange={(e) => updateScannedItem(idx, 'fiber', e.target.value)} className="w-full bg-white/5 rounded px-2 py-1 text-xs text-white" />
                                        </div>
                                    </div>

                                    {/* Per-ingredient breakdown — read-only, collapsed by default. */}
                                    {item.ingredients && item.ingredients.length > 0 && (
                                        <div className="pt-1">
                                            <button
                                                onClick={toggleExpanded}
                                                className="text-[10px] text-cyan-400 hover:text-cyan-300 uppercase tracking-widest font-bold"
                                            >
                                                {isExpanded ? '▾' : '▸'} {isExpanded ? 'Hide' : 'Show'} {item.ingredients.length} ingredient{item.ingredients.length !== 1 ? 's' : ''}
                                            </button>
                                            {isExpanded && (
                                                <div className="mt-2 space-y-1 pl-2 border-l border-white/10">
                                                    {item.ingredients.map((ing, ingIdx) => (
                                                        <div key={ingIdx} className="flex items-center justify-between text-[11px] text-gray-400 gap-2">
                                                            <span className="flex-1 truncate">
                                                                {ing.emoji && <span className="mr-1">{ing.emoji}</span>}
                                                                {ing.name}
                                                                <span className="text-gray-600 ml-1">· {Math.round(ing.grams)}g</span>
                                                            </span>
                                                            <span className="text-gray-500 text-[10px] tabular-nums whitespace-nowrap">
                                                                {Math.round(ing.calories)} cal · {Math.round(ing.protein)}p · {Math.round(ing.carbs)}c · {Math.round(ing.fat)}f
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                                );
                            })}
                        </div>

                        <div className="flex gap-3 pt-4">
                            <button onClick={() => setShowAddFood(false)} className="flex-1 py-4 rounded-xl border border-white/10 text-gray-400 font-bold text-xs uppercase tracking-widest hover:bg-white/5">Cancel</button>
                            <button onClick={addAllScannedItems} className="flex-1 py-4 rounded-xl bg-white text-black font-bold text-xs uppercase tracking-widest shadow-lg hover:bg-gray-200">Log All ({scannedItems.length})</button>
                        </div>
                    </div>
                )}
                
                {addFoodMode === 'manual' && scannedItems.length === 0 && (
                    // MANUAL ENTRY FORM
                    <form onSubmit={(e) => { e.preventDefault(); addFoodEntry(); }} className="space-y-4">
                        <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 block ml-1">Name</label>
                            <input type="text" value={foodForm.name} onChange={e => setFoodForm({...foodForm, name: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white focus:outline-none focus:border-white focus:bg-white/10 transition-all" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 block ml-1">Calories</label>
                                <input type="number" value={foodForm.calories} onChange={e => setFoodForm({...foodForm, calories: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white focus:outline-none focus:border-white focus:bg-white/10 transition-all" />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-1.5 block ml-1">Protein (g)</label>
                                <input type="number" value={foodForm.protein} onChange={e => setFoodForm({...foodForm, protein: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white focus:outline-none focus:border-emerald-400 focus:bg-emerald-400/5 transition-all" />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 block ml-1">Carbs (g)</label>
                                <input type="number" value={foodForm.carbs} onChange={e => setFoodForm({...foodForm, carbs: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white focus:outline-none focus:border-white focus:bg-white/10 transition-all" />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 block ml-1">Fat (g)</label>
                                <input type="number" value={foodForm.fat} onChange={e => setFoodForm({...foodForm, fat: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white focus:outline-none focus:border-white focus:bg-white/10 transition-all" />
                            </div>
                            <div className="col-span-2">
                                <label className="text-[10px] font-bold text-yellow-500 uppercase tracking-widest mb-1.5 block ml-1">Fiber (g)</label>
                                <input type="number" value={foodForm.fiber} onChange={e => setFoodForm({...foodForm, fiber: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white focus:outline-none focus:border-yellow-500 focus:bg-yellow-500/5 transition-all" />
                            </div>
                        </div>
                        <div className="flex gap-3 pt-4">
                            <button type="button" onClick={() => setShowAddFood(false)} className="flex-1 py-4 rounded-xl border border-white/10 text-gray-400 font-bold text-xs uppercase tracking-widest hover:bg-white/5">Cancel</button>
                            <button type="submit" className="flex-1 py-4 rounded-xl bg-white text-black font-bold text-xs uppercase tracking-widest shadow-lg hover:bg-gray-200">Log Item</button>
                        </div>
                    </form>
                )}
                </div>
              </div>
            </div>
      )}

      {/* ───────────── Page-turn tab transition ─────────────
          Wrap all the tab content blocks in a single motion.div whose
          `key` is activeTab. AnimatePresence sees the key change, exits
          the outgoing page with a subtle 3D rotateY + slide, and brings
          the incoming page in from the opposite direction. The `custom`
          prop carries the direction (1 = forward in TAB_ORDER, -1 = back). */}
      <div style={{ perspective: 1200 }}>
        <AnimatePresence mode="wait" custom={pageTurnDirection}>
          <motion.div
            key={activeTab}
            custom={pageTurnDirection}
            variants={{
              enter: (d: number) => ({
                opacity: 0,
                rotateY: d > 0 ? 28 : -28,
                x: d > 0 ? 60 : -60,
                transformOrigin: d > 0 ? '0% 50%' : '100% 50%',
              }),
              center: { opacity: 1, rotateY: 0, x: 0 },
              exit: (d: number) => ({
                opacity: 0,
                rotateY: d > 0 ? -28 : 28,
                x: d > 0 ? -60 : 60,
                transformOrigin: d > 0 ? '100% 50%' : '0% 50%',
              }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.35, ease: [0.32, 0.72, 0.36, 1] }}
            style={{ transformStyle: 'preserve-3d', willChange: 'transform' }}
          >
      {activeTab === 'dashboard' && (
        <FuelHome
          profile={appState.profile}
          targets={targetMacros}
          consumed={consumedMacros}
          activityBurn={appState.activityBurn || 0}
          waterIntake={appState.waterIntake || 0}
          workoutCompletedToday={(() => {
            const todayStr = new Date().toLocaleDateString();
            return (appState.dailyLogs || []).some(l => l.date === todayStr && l.workoutCompleted) ||
              weeklyCompletedWorkouts.includes(new Date().toLocaleDateString('en-US', { weekday: 'long' }));
          })()}
          streak={streak}
          greeting={greeting}
          dateString={dateString}
          dailyLogs={appState.dailyLogs || []}
          weighIns={appState.weighIns || []}
          onLogWeight={(weight) => recordWeight(weight)}
          onQuickAddFood={() => { setAddFoodMode('manual'); setShowAddFood(true); }}
          onScanFood={() => { setAddFoodMode('ai'); setShowAddFood(true); }}
          onOpenWorkouts={() => switchTab('workouts')}
          onLogWater={() => updateWater(8)}
          onOpenReflect={() => switchTab('reflect')}
          hasEnoughDataForWrapped={(appState.dailyLogs?.filter(l => (l.caloriesConsumed || 0) > 0 || (l.foodItems?.length || 0) > 0).length || 0) >= 2}
          adaptiveSuggestion={adaptiveSuggestion}
          onAcceptAdaptiveSuggestion={acceptAdaptiveSuggestion}
        />
      )}


      {activeTab === 'restaurants' && (
        <div className="animate-fade-in">
          <RestaurantHub
            targetMacros={targetMacros}
            consumedMacros={consumedMacros}
            customMenuItems={appState.customMenuItems}
            onLogItem={(item, restaurantName) => {
              // Push the verified menu item directly into today's food log.
              // Restaurant-sourced items skip the AI pipeline entirely — macros
              // come from the curated database, not from a Gemini estimate.
              pushFoodToState([item], `${restaurantName} · ${item.name}`);
              triggerToast(`Logged ${item.name}`);
            }}
          />
        </div>
      )}

      {activeTab === 'journal' && (
        <div className="animate-fade-in">
          <Journal
            dailyLogs={appState.dailyLogs || []}
            todayLog={appState.todayLog || []}
            waterIntake={appState.waterIntake}
            activityBurn={appState.activityBurn}
            profile={appState.profile}
            targets={targetMacros}
            onDeleteLog={deleteLog}
            onUpdateFood={(updated) => {
              // Replace the matching item in today's live log. Past-day
              // items pass a read-only sheet, so we don't need to touch
              // archived logs here — the sheet won't call this for those.
              handleUpdateAppState(prev => ({
                ...prev,
                todayLog: (prev.todayLog || []).map(it => it.id === updated.id ? updated : it),
              }));
              triggerToast('Updated');
            }}
            onAddFood={() => {
                setAddFoodMode('manual');
                setShowAddFood(true);
            }}
          />
        </div>
      )}

      {activeTab === 'workouts' && (
        <WorkoutsHome
          workoutSplit={workoutSplit}
          weeklyCompletedWorkouts={weeklyCompletedWorkouts}
          currentDayName={currentDayName}
          profile={appState.profile}
          isGeneratingSplit={isGeneratingSplit}
          onToggleExerciseComplete={toggleExerciseComplete}
          onUpdateExerciseWeight={updateExerciseWeight}
          onDeleteExercise={deleteExercise}
          onAddExercise={(dayIndex, ex) => {
            // Inline add — WorkoutsHome owns its own draft state, so we
            // don't route through the legacy addExerciseToSplit (which
            // reads from module-level manualExercise state). Cleaner path.
            if (!ex.name.trim()) return;
            const newSplit = [...workoutSplit];
            newSplit[dayIndex] = {
              ...newSplit[dayIndex],
              exercises: [
                ...newSplit[dayIndex].exercises,
                {
                  name: ex.name,
                  sets: ex.sets,
                  reps: ex.reps,
                  completed: false,
                  gymAlternative: '',
                  homeAlternative: '',
                },
              ],
            };
            setWorkoutSplit(newSplit);
            saveWorkoutToCloud(newSplit, weeklyCompletedWorkouts);
            triggerToast("Exercise added");
          }}
          onCompleteWorkoutDay={completeWorkoutDay}
          onRegenerateSplit={generateSplitForUser}
          onOpenPersonalize={() => {
            setEditProfileData({
              weight: appState.profile?.weight,
              bodyFat: appState.profile?.bodyFat,
              goal: appState.profile?.goal,
              activityLevel: appState.profile?.activityLevel,
              workoutPreferences: appState.profile?.workoutPreferences,
            });
            setIsEditingProfile(true);
          }}
        />
      )}

      {/* REFLECT — the analytics & insights home. Wrapped lives here inline
          (no more buried-on-the-dashboard launcher), with Recomp Velocity
          rendered below it as a deeper-dive section. Replaces the old
          standalone Recomp tab; the old `recomp` tab id still resolves here
          so any stale deep-links don't break. */}
      {(activeTab === 'reflect' || activeTab === 'recomp') && appState.profile && (
        <div className="space-y-6 pb-20">
          <Wrapped
            inline
            profile={appState.profile}
            dailyLogs={appState.dailyLogs || []}
            weighIns={appState.weighIns || []}
            todayLog={appState.todayLog || []}
            todayActivityBurn={appState.activityBurn || 0}
            todayWaterIntake={appState.waterIntake || 0}
            foodHistory={appState.foodHistory || []}
            bodyStats={appState.bodyStats}
            targets={targetMacros}
            weeklyCompletedWorkouts={weeklyCompletedWorkouts}
            initialPeriod="week"
          />

          {/* RECOMP VELOCITY — deeper-dive trend analysis. Lives under
              Wrapped so users who want the harder numbers can scroll to them. */}
          <div className="pt-2 border-t border-white/5">
            <div className="flex items-center gap-1.5 px-1 mb-3">
              <span className="text-gray-500">🪶</span>
              <h3 className="text-[10px] font-bold uppercase tracking-[0.25em] text-gray-400">Deeper read</h3>
            </div>
            <RecompVelocity appState={appState} workoutSplit={workoutSplit} />
          </div>
        </div>
      )}

      {activeTab === 'coach' && (
        <div className="flex flex-col animate-fade-in relative min-h-screen pb-40">
           {/* ... existing coach content ... */}
          <div className="flex-1 space-y-6 pr-2 pb-4 pt-2">
              <div className="text-center opacity-30 my-4">
                  <span className="text-4xl font-orbitron font-bold text-[#f5ede1]">Ding!</span>
                  <p className="text-[10px] font-bold uppercase mt-2">Ask about food, training, or today</p>
              </div>
              {chatHistory.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed shadow-md ${msg.role === 'user' ? 'bg-[#c97b6e] text-white rounded-tr-sm' : 'glass-panel text-gray-200 rounded-tl-sm border border-white/10'}`}>
                          <SafeMarkdown className="markdown-body" text={msg.text} />
                      </div>
                  </div>
              ))}
              {isChatLoading && (
                  <div className="flex justify-start">
                      <div className="bg-white/5 px-4 py-3 rounded-2xl rounded-tl-sm flex gap-1">
                          <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce"></div>
                          <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce delay-100"></div>
                          <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce delay-200"></div>
                      </div>
                  </div>
              )}
              <div ref={chatBottomRef} />
          </div>
          
          <div className="fixed bottom-24 left-4 right-4 bg-[#0d0a08]/95 backdrop-blur-xl p-3 rounded-2xl border border-white/10 shadow-2xl z-30">
               {/* Saved Notes Quick View */}
                {appState.savedNotes && appState.savedNotes.length > 0 && (
                    <div className="mb-3">
                        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                            {appState.savedNotes.map(note => (
                                <div key={note.id} className="min-w-[140px] max-w-[140px] bg-white/5 p-2 rounded-xl border border-white/5 shrink-0 hover:border-pink-500/50 transition-colors cursor-pointer" onClick={() => setChatInput(`Tell me about note: ${note.title}`)}>
                                    <p className="text-[9px] font-bold text-pink-500 truncate">{note.title}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

              <div className="relative">
                  <input 
                    type="text" 
                    value={chatInput} 
                    onChange={e => setChatInput(e.target.value)} 
                    onKeyDown={e => e.key === 'Enter' && handleSendMessage()} 
                    placeholder="Ask Ding! anything..." 
                    className="w-full bg-[#151515] border border-white/10 rounded-xl pl-5 pr-12 py-4 text-white placeholder-gray-600 focus:outline-none focus:border-pink-500/50 focus:bg-[#1a1a1a] transition-all shadow-inner text-sm" 
                  />
                  <button 
                    onClick={handleSendMessage} 
                    disabled={isChatLoading || !chatInput.trim()} 
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-[#c97b6e] rounded-lg text-white disabled:opacity-50 disabled:bg-gray-800 transition-all hover:scale-105"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  </button>
              </div>
          </div>
        </div>
      )}

      {activeTab === 'profile' && (
        <div className="space-y-6 pb-20 animate-fade-in">
           <div className="glass-panel p-8 rounded-[2rem] flex flex-col items-center gap-6 text-center border-t border-white/10 relative">
              <button 
                onClick={() => {
                   setEditProfileData({
                       weight: appState.profile?.weight,
                       bodyFat: appState.profile?.bodyFat,
                       goal: appState.profile?.goal,
                       activityLevel: appState.profile?.activityLevel,
                       workoutPreferences: appState.profile?.workoutPreferences,
                   });
                   setIsEditingProfile(true);
                }}
                className="absolute top-6 right-6 text-xs text-cyan-400 uppercase tracking-widest font-bold hover:text-white transition-colors"
              >
                Edit
              </button>
              <div 
                className="w-24 h-24 rounded-full border-4 border-[#d4a55a] p-1 cursor-pointer relative group flex items-center justify-center bg-[#161210]"
                onClick={() => profilePicInputRef.current?.click()}
              >
                 {appState.profile?.profilePicture ? (
                     <img src={appState.profile.profilePicture} className="w-full h-full object-cover rounded-full" />
                 ) : (
                     <span className="text-3xl font-orbitron font-bold text-cyan-400">
                         {appState.profile?.name?.charAt(0)?.toUpperCase() || 'U'}
                     </span>
                 )}
                 <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                   <span className="text-xs text-white font-bold uppercase">Pic</span>
                 </div>
                 <input 
                   type="file" 
                   ref={profilePicInputRef} 
                   className="hidden" 
                   accept="image/*"
                   onChange={handleProfilePicUpload} 
                 />
              </div>
              <div>
                 <h2 className="text-2xl font-orbitron font-bold text-white mb-1">{appState.profile?.name}</h2>
                 <p className="text-xs text-cyan-400 font-bold uppercase tracking-[0.2em]">{appState.profile?.goal}</p>
              </div>
           </div>

           <div className="grid grid-cols-2 gap-4">
              <div className="glass-panel p-6 rounded-3xl text-center">
                 <p className="text-[9px] text-gray-500 font-bold uppercase mb-2 tracking-widest">Trend Weight</p>
                 <p className="text-3xl font-mono text-white tracking-tighter">{liveMetrics.scaleTrend} <span className="text-sm text-gray-500">lbs</span></p>
              </div>
              <div className="glass-panel p-6 rounded-3xl text-center">
                 <p className="text-[9px] text-gray-500 font-bold uppercase mb-2 tracking-widest">Trend Body Fat</p>
                 <p className="text-3xl font-mono text-cyan-400 tracking-tighter">{liveMetrics.currentPBF}<span className="text-sm text-cyan-400/50">%</span></p>
              </div>
           </div>

           {/* CALORIE CALENDAR */}
           <div className="glass-panel p-6 rounded-3xl">
              <CalorieCalendar logs={appState.dailyLogs || []} targetCalories={targetMacros.calories} />
           </div>
           
           <div className="flex flex-col items-center gap-3 mt-6">
              <button
                  onClick={() => {
                      // Clear this user's per-uid cache + any legacy global keys
                      // (from before we namespaced by uid).
                      if (appStateKey) localStorage.removeItem(appStateKey);
                      if (splitKey) localStorage.removeItem(splitKey);
                      localStorage.removeItem('dings_app_state');
                      localStorage.removeItem('dings_workout_split');
                      signOut(auth);
                      onSignOut();
                  }}
                  className="px-6 py-3 bg-red-500/10 text-red-500 rounded-full border border-red-500/20 hover:bg-red-500/20 transition-colors text-xs font-bold uppercase tracking-widest"
              >
                  Log Out
              </button>
              <button
                  onClick={handleCreateGptKey}
                  className="text-[10px] text-gray-500 underline underline-offset-4 hover:text-cyan-400 transition-colors uppercase tracking-widest"
              >
                  Fuel Coach GPT key
              </button>
              <button
                  onClick={() => {
                      // Pre-fill a support email with app version + account context
                      // so users don't have to retype anything for us to triage.
                      const subject = encodeURIComponent('Ding! Support Request');
                      const body = encodeURIComponent(
                          `\n\n---\nApp version: v2.1\nAccount: ${userEmail || 'unknown'}\n(Please describe your question or issue above this line.)`
                      );
                      window.location.href = `mailto:support@dings.fitness?subject=${subject}&body=${body}`;
                  }}
                  className="text-[10px] text-gray-500 underline underline-offset-4 hover:text-cyan-400 transition-colors uppercase tracking-widest"
              >
                  Contact Support
              </button>
              <button
                  onClick={handleReplayTour}
                  className="text-[10px] text-gray-500 underline underline-offset-4 hover:text-[#d97757] transition-colors uppercase tracking-widest"
              >
                  Show me around again
              </button>
              {isAdminUser(userId) && (
                <button
                    onClick={() => setShowUsageDashboard(true)}
                    className="text-[10px] text-cyan-400 underline underline-offset-4 hover:text-cyan-300 transition-colors uppercase tracking-widest font-bold"
                >
                    Admin · Token Usage
                </button>
              )}
              <button
                  onClick={() => setIsDeleteModalOpen(true)}
                  className="text-[10px] text-gray-600 underline underline-offset-4 hover:text-red-400 transition-colors uppercase tracking-widest"
              >
                  Delete Account
              </button>
           </div>

           <p className="text-center text-[9px] text-gray-700 uppercase tracking-widest mt-8">Ding! v2.1</p>
        </div>
      )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* EDIT PROFILE MODAL */}
      {isEditingProfile && (
         <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) setIsEditingProfile(false); }}
         >
            <div className="bg-[#0f0f0f] w-full max-w-sm rounded-[2rem] p-6 border border-white/10 shadow-2xl animate-slide-up">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-orbitron font-bold text-white tracking-widest">EDIT PROFILE</h3>
                  <button
                    onClick={() => setIsEditingProfile(false)}
                    className="w-9 h-9 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </div>
                <div className="space-y-4 mb-6">
                    <div>
                        <label className="block text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-2">Weight (lbs)</label>
                        <input 
                            type="number"
                            value={editProfileData.weight || ''}
                            onChange={e => setEditProfileData(prev => ({...prev, weight: Number(e.target.value)}))}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-400"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-2">Body Fat %</label>
                        <input 
                            type="number"
                            value={editProfileData.bodyFat || ''}
                            onChange={e => setEditProfileData(prev => ({...prev, bodyFat: Number(e.target.value)}))}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-400"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-2">Goal</label>
                        <select
                            value={editProfileData.goal || ''}
                            onChange={e => setEditProfileData(prev => ({...prev, goal: e.target.value as PhysiqueGoal}))}
                            className="w-full bg-[#151515] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-400"
                        >
                            {Object.values(PhysiqueGoal).map(g => (
                                <option key={g} value={g}>{g}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-2">Activity Level</label>
                        <select
                            value={editProfileData.activityLevel || ''}
                            onChange={e => setEditProfileData(prev => ({...prev, activityLevel: e.target.value as ActivityLevel}))}
                            className="w-full bg-[#151515] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-400"
                        >
                            {Object.values(ActivityLevel).map(a => (
                                <option key={a} value={a}>{a}</option>
                            ))}
                        </select>
                    </div>

                    {/* MACRO SPLIT — how the non-protein calories divide between
                        carbs and fat. Defaults to 'balanced'. Picker recomputes
                        the user's daily macros on save. */}
                    <div>
                        <label className="block text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-2">Macro Split</label>
                        <div className="grid grid-cols-2 gap-1.5">
                            {([
                                { value: 'balanced',     display: 'Balanced',     hint: '55C / 45F' },
                                { value: 'high-protein', display: 'High-protein', hint: '+ protein' },
                                { value: 'low-carb',     display: 'Low-carb',     hint: '30C / 70F' },
                                { value: 'keto',         display: 'Keto',         hint: '10C / 90F' },
                            ] as const).map(opt => {
                                const current = (editProfileData.macroSplit !== undefined
                                    ? editProfileData.macroSplit
                                    : appState.profile?.macroSplit) || 'balanced';
                                const selected = current === opt.value;
                                return (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => setEditProfileData(prev => ({...prev, macroSplit: opt.value as any}))}
                                        className={`flex flex-col items-start px-3 py-2 rounded-lg border text-left transition-all ${
                                            selected
                                                ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40'
                                                : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'
                                        }`}
                                    >
                                        <span className="text-[11px] font-bold uppercase tracking-widest">{opt.display}</span>
                                        <span className="text-[9px] mt-0.5 opacity-70">{opt.hint}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* WORKOUT PREFERENCES — drives the AI-generated workout split.
                        Existing users (onboarded before this section existed) can
                        fill these in here without going through full onboarding. */}
                    <div className="pt-2 border-t border-white/5">
                        <h4 className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                            <span>⚡</span>
                            <span>Workout Preferences</span>
                        </h4>

                        {/* Helper renders a button-group selector for one field. */}
                        {([
                            { field: 'experience' as const,     label: 'Experience',     options: [
                                { value: 'beginner' as const,     display: 'Beginner' },
                                { value: 'intermediate' as const, display: 'Intermediate' },
                                { value: 'advanced' as const,     display: 'Advanced' },
                            ]},
                            { field: 'daysPerWeek' as const,    label: 'Days per week',  options: [
                                { value: 3 as const, display: '3' },
                                { value: 4 as const, display: '4' },
                                { value: 5 as const, display: '5' },
                                { value: 6 as const, display: '6' },
                            ]},
                            { field: 'sessionMinutes' as const, label: 'Session length', options: [
                                { value: 30 as const, display: '30 min' },
                                { value: 45 as const, display: '45 min' },
                                { value: 60 as const, display: '60 min' },
                                { value: 90 as const, display: '90 min' },
                            ]},
                            { field: 'equipment' as const,      label: 'Equipment',      options: [
                                { value: 'full-gym' as const,      display: 'Full gym' },
                                { value: 'home-weights' as const,  display: 'Home weights' },
                                { value: 'bodyweight' as const,    display: 'Bodyweight' },
                            ]},
                        ] as const).map(({ field, label, options }) => {
                            const current = editProfileData.workoutPreferences?.[field];
                            return (
                                <div key={field} className="mb-3">
                                    <label className="block text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1.5">{label}</label>
                                    <div className="flex gap-1.5 flex-wrap">
                                        {options.map(opt => {
                                            const selected = current === opt.value;
                                            return (
                                                <button
                                                    key={String(opt.value)}
                                                    onClick={() => {
                                                        setEditProfileData(prev => ({
                                                            ...prev,
                                                            workoutPreferences: {
                                                                ...(prev.workoutPreferences || {}),
                                                                [field]: opt.value,
                                                            } as any,
                                                        }));
                                                    }}
                                                    className={`flex-1 min-w-[64px] px-3 py-2 rounded-lg border text-[11px] font-bold uppercase tracking-widest transition-all ${
                                                        selected
                                                            ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40'
                                                            : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'
                                                    }`}
                                                >
                                                    {opt.display}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* AUTO-FAVORITE TOGGLE — controls whether meals logged 5+
                        times automatically get starred in food history. Default
                        is ON (undefined === true); user can opt out here. */}
                    <div className="pt-3 border-t border-white/5">
                        {(() => {
                            const currentVal =
                                editProfileData.autoFavoriteEnabled !== undefined
                                    ? editProfileData.autoFavoriteEnabled
                                    : appState.profile?.autoFavoriteEnabled;
                            const enabled = currentVal !== false; // undefined defaults to ON
                            return (
                                <button
                                    type="button"
                                    onClick={() => setEditProfileData(prev => ({ ...prev, autoFavoriteEnabled: !enabled }))}
                                    className="w-full flex items-center justify-between gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.05] transition-colors text-left"
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[11px] font-bold text-white uppercase tracking-widest flex items-center gap-1.5">
                                            <span>⭐</span>
                                            Auto-favorite meals
                                        </div>
                                        <div className="text-[10px] text-gray-500 mt-1 leading-snug">
                                            Star meals automatically after logging them 5 or more times
                                        </div>
                                    </div>
                                    {/* Switch */}
                                    <div className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${
                                        enabled ? 'bg-cyan-500' : 'bg-white/10'
                                    }`}>
                                        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all ${
                                            enabled ? 'left-[18px]' : 'left-0.5'
                                        }`} />
                                    </div>
                                </button>
                            );
                        })()}
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setIsEditingProfile(false)} className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400 font-bold uppercase tracking-widest text-xs">Cancel</button>
                    <button onClick={() => {
                        const newProfile = { ...appState.profile, ...editProfileData } as UserProfile;
                        // Body-composition-aware BMR: prefer InBody scan, fall back to manual bodyFat entry.
                        const bf = newProfile.inBodyData?.pbf ?? newProfile.bodyFat;
                        const tdee = CALCULATE_TDEE(newProfile.weight, newProfile.height, newProfile.age, newProfile.activityLevel, newProfile.sex, bf);
                        const macroResult = CALCULATE_MACROS(
                          tdee,
                          newProfile.goal,
                          newProfile.weight,
                          newProfile.sex,
                          newProfile.macroSplit,
                          (newProfile.goalTargetWeight && newProfile.goalTargetDate)
                            ? { targetWeightLbs: newProfile.goalTargetWeight, targetDate: newProfile.goalTargetDate }
                            : undefined,
                        );
                        // Strip MacroResult to NutritionTargets shape (drop floor metadata).
                        const targets = {
                            calories: macroResult.calories,
                            protein: macroResult.protein,
                            carbs: macroResult.carbs,
                            fat: macroResult.fat,
                        };

                        // Detect whether workout preferences changed so we can hint at
                        // regenerating the split.
                        const prevPrefs = JSON.stringify(appState.profile?.workoutPreferences || {});
                        const nextPrefs = JSON.stringify(newProfile.workoutPreferences || {});
                        const workoutPrefsChanged = prevPrefs !== nextPrefs;

                        handleUpdateAppState(prev => ({
                            ...prev,
                            profile: newProfile,
                            nutritionTargets: targets // Sync new calculated targets
                        }));
                        setIsEditingProfile(false);
                        triggerToast(
                          macroResult.floorApplied
                            ? "Profile updated. Calories capped at safety minimum."
                            : workoutPrefsChanged
                              ? "Saved. Refresh your plan to apply your new preferences."
                              : "Yep saved that, you are here forever(okay legally not actually..chill)"
                        );
                    }} className="flex-1 py-3 rounded-xl bg-cyan-500 text-black font-bold uppercase tracking-widest text-xs">Save</button>
                </div>
            </div>
         </div>
      )}

      {/* DELETE ACCOUNT MODAL */}
      {isDeleteModalOpen && (
        <DeleteAccountModal
          onClose={() => setIsDeleteModalOpen(false)}
          onDeleted={onSignOut}
        />
      )}

      {/* ADMIN · TOKEN USAGE DASHBOARD */}
      {showUsageDashboard && isAdminUser(userId) && (
        <UsageDashboard onClose={() => setShowUsageDashboard(false)} />
      )}

      {/* SPOTLIGHT TOUR — fires once after first profile load (and on demand
          from Profile's "Show tour again" button). Dims the screen and walks
          the user through 4 stops in Cuodi-voice. */}
      {showTour && <SpotlightTour onClose={handleCloseTour} />}

      {/* FEATHER CELEBRATION — fires every time food is logged.
          Self-dismisses after ~1.6s. Stacked above everything. */}
      <FeatherCelebration show={showCelebration} onDone={() => setShowCelebration(false)} />

      {/* WRAPPED OVERLAY — Spotify-Wrapped-style personalized summary.
          Launched from the dashboard launcher card or auto-prompted at the
          start of a new calendar month. */}
      {showWrapped && appState.profile && (
        <Wrapped
          profile={appState.profile}
          dailyLogs={appState.dailyLogs || []}
          weighIns={appState.weighIns || []}
          todayLog={appState.todayLog || []}
          todayActivityBurn={appState.activityBurn || 0}
          todayWaterIntake={appState.waterIntake || 0}
          foodHistory={appState.foodHistory || []}
          bodyStats={appState.bodyStats}
          targets={targetMacros}
          weeklyCompletedWorkouts={weeklyCompletedWorkouts}
          initialPeriod={wrappedInitialPeriod}
          autoPrompted={wrappedAutoPrompted}
          onClose={() => {
            setShowWrapped(false);
            setWrappedAutoPrompted(false);
          }}
        />
      )}

      {/* CUSTOM ACTIVITY MODAL — replaces the old window.prompt() flow. */}
      {showActivityModal && (
        <div
          className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(0,0,0,0.85)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowActivityModal(false); }}
        >
          <div
            className="w-full sm:max-w-md glass rounded-t-3xl sm:rounded-3xl p-6 space-y-5"
            style={{ background: '#0a0a0a' }}
          >
            <div className="flex justify-between items-center">
              <h3 className="text-white text-base font-bold tracking-tight">Log Activity</h3>
              <button
                onClick={() => setShowActivityModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-gray-400"
              >
                ✕
              </button>
            </div>

            {/* Activity picker */}
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Activity</label>
              <div className="grid grid-cols-4 gap-2 max-h-44 overflow-y-auto pr-1">
                {[
                  { key: 'running',    emoji: '🏃',  label: 'Running' },
                  { key: 'weights',    emoji: '🏋️',  label: 'Weights' },
                  { key: 'cycling',    emoji: '🚴',  label: 'Cycling' },
                  { key: 'walking',    emoji: '🚶',  label: 'Walking' },
                  { key: 'hiking',     emoji: '🥾',  label: 'Hiking' },
                  { key: 'swimming',   emoji: '🏊',  label: 'Swim' },
                  { key: 'rowing',     emoji: '🚣',  label: 'Rowing' },
                  { key: 'elliptical', emoji: '⚙️',  label: 'Elliptical' },
                  { key: 'jump-rope',  emoji: '⤵️',  label: 'Jump Rope' },
                  { key: 'hiit',       emoji: '🔥',  label: 'HIIT' },
                  { key: 'yoga',       emoji: '🧘',  label: 'Yoga' },
                  { key: 'basketball', emoji: '🏀',  label: 'Basketball' },
                  { key: 'soccer',     emoji: '⚽',  label: 'Soccer' },
                  { key: 'tennis',     emoji: '🎾',  label: 'Tennis' },
                  { key: 'dance',      emoji: '💃',  label: 'Dance' },
                  { key: 'manual',     emoji: '✏️',  label: 'Manual' },
                ].map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setActivityModalForm({ ...activityModalForm, kind: opt.key as any })}
                    className={`flex flex-col items-center justify-center p-2 rounded-xl border text-[9px] font-bold uppercase tracking-wider transition-all ${
                      activityModalForm.kind === opt.key
                        ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                        : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                    }`}
                  >
                    <span className="text-lg mb-0.5">{opt.emoji}</span>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Intensity picker — hidden for manual entry */}
            {activityModalForm.kind !== 'manual' && (
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Intensity</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { value: 'easy',     label: 'Easy',     hint: 'conversational' },
                    { value: 'moderate', label: 'Moderate', hint: 'breathing harder' },
                    { value: 'hard',     label: 'Hard',     hint: "can't talk" },
                  ] as const).map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setActivityModalForm({ ...activityModalForm, intensity: opt.value })}
                      className={`flex flex-col items-start p-2.5 rounded-xl border text-left transition-all ${
                        activityModalForm.intensity === opt.value
                          ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                          : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                      }`}
                    >
                      <span className="text-[10px] font-bold uppercase tracking-widest">{opt.label}</span>
                      <span className="text-[9px] mt-0.5 opacity-70">{opt.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Duration (for MET-based) or manual kcal entry */}
            {activityModalForm.kind === 'manual' ? (
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Calories burned</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={activityModalForm.manualKcal}
                  onChange={e => setActivityModalForm({ ...activityModalForm, manualKcal: e.target.value })}
                  placeholder="e.g. 250"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-cyan-500"
                  autoFocus
                />
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Duration</label>
                  <span className="text-xs font-mono text-cyan-300 tabular-nums">{activityModalForm.minutes} min</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={120}
                  step={5}
                  value={activityModalForm.minutes}
                  onChange={e => setActivityModalForm({ ...activityModalForm, minutes: Number(e.target.value) })}
                  className="w-full accent-cyan-500"
                />
                <div className="flex justify-between mt-1 text-[9px] text-gray-600 font-mono">
                  <span>5m</span><span>30m</span><span>60m</span><span>120m</span>
                </div>
              </div>
            )}

            {/* Estimated burn preview */}
            {(() => {
              const isManual = activityModalForm.kind === 'manual';
              const estimated = isManual
                ? Number(activityModalForm.manualKcal) || 0
                : personalizedBurnAt(
                    appState.profile.weight,
                    activityModalForm.kind as ActivityKind,
                    activityModalForm.intensity,
                    activityModalForm.minutes,
                  );
              return (
                <div className="bg-orange-500/8 border border-orange-500/25 rounded-xl px-4 py-3 flex items-center justify-between">
                  <span className="text-[10px] font-bold text-orange-300 uppercase tracking-widest">Estimated burn</span>
                  <span className="text-xl font-mono font-bold text-orange-400 tabular-nums">
                    {estimated} <span className="text-[10px] text-orange-500/70">kcal</span>
                  </span>
                </div>
              );
            })()}

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowActivityModal(false)}
                className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400 font-bold text-xs uppercase tracking-widest hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const isManual = activityModalForm.kind === 'manual';
                  const kcal = isManual
                    ? Number(activityModalForm.manualKcal) || 0
                    : personalizedBurnAt(
                        appState.profile.weight,
                        activityModalForm.kind as ActivityKind,
                        activityModalForm.intensity,
                        activityModalForm.minutes,
                      );
                  if (kcal > 0) logActivity(kcal);
                  setShowActivityModal(false);
                }}
                className="flex-1 py-3 rounded-xl bg-orange-500 text-black font-bold text-xs uppercase tracking-widest hover:bg-orange-400"
              >
                Log Burn
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ONE-TIME HEALTH DISCLAIMER (for users who onboarded before we added this step) */}
      {showHealthDisclaimer && (
        <div
          className="fixed inset-0 z-[400] flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(0,0,0,0.92)' }}
        >
          <div
            className="w-full sm:max-w-md glass rounded-t-3xl sm:rounded-3xl flex flex-col overflow-hidden"
            style={{ maxHeight: '90vh', background: '#0a0a0a' }}
          >
            <div className="overflow-y-auto px-6 py-8 space-y-5">
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center">
                  <span className="text-2xl">⚡</span>
                </div>
                <h2 className="text-lg font-orbitron font-bold text-white tracking-wider text-center">
                  QUICK READ
                </h2>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest text-center">
                  Health disclaimer
                </p>
              </div>

              <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
                <p>
                  Dings is a <span className="text-white font-semibold">fitness tracking tool</span>,
                  not a medical device or substitute for professional advice. Calorie targets and
                  suggestions are estimates — a starting point, not a prescription.
                </p>
                <p>
                  Please talk to a doctor before changing your diet or exercise routine, especially
                  if you have any medical condition, are pregnant or breastfeeding, or take medication.
                </p>
                <div className="flex items-start gap-3 p-3 rounded-2xl bg-red-500/5 border border-red-500/20">
                  <span className="text-red-400 shrink-0 mt-0.5">⚠</span>
                  <p className="text-[12px] text-gray-200">
                    If you have or have had an eating disorder, please don't use this app to set goals.
                    Reach out to a healthcare provider or the National Alliance for Eating Disorders
                    helpline (1-866-662-1235).
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  // Persist acceptance so we never prompt again.
                  handleUpdateAppState(prev => ({
                    ...prev,
                    profile: prev.profile
                      ? {
                          ...prev.profile,
                          acceptedHealthDisclaimer: true,
                          disclaimerAcceptedAt: new Date().toISOString(),
                        }
                      : prev.profile,
                  }));
                  setShowHealthDisclaimer(false);
                }}
                className="w-full py-4 rounded-2xl bg-white text-black font-orbitron font-bold text-sm tracking-widest hover:bg-gray-200 transition-colors"
              >
                I UNDERSTAND & AGREE
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default MainApp;
