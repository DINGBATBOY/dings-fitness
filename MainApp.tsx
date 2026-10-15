
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Layout } from './components/Layout';
import { CalorieCalendar } from './components/CalorieCalendar';
import { Journal } from './components/Journal';
import { Auth } from './components/Auth';
import { Onboarding } from './components/Onboarding';
import { RestaurantHub } from './components/RestaurantHub';
import { FuelCoachSheet } from './components/FuelCoachSheet';
import { FoodComposer, type FoodSeed, type FoodStatus } from './components/food/FoodComposer';
import { Dashboard, type DaySummary } from './components/Dashboard';
import { ProfileHub, type ProfileSection } from './components/ProfileHub';
import { ProgressCharts } from './components/ProgressCharts';
import { buildCoachContext } from './services/coachContext';
import { FoodDetailSheet } from './components/FoodDetailSheet';
import { readAppearance, applyAppearance, isValidAppearance, type Appearance } from './services/theme';
import { FoodDialog } from './components/food/FoodDialog';
import { commitFood } from './services/foodCommit';
import { DeleteAccountModal } from './components/DeleteAccountModal';
import { UsageDashboard } from './components/UsageDashboard';
import { Wrapped } from './components/Wrapped';


import { SafeMarkdown } from './components/SafeMarkdown';
import { HealthConnectCard } from './components/HealthConnectCard';
import {
  isHealthSupported,
  healthAvailable,
  requestHealthPermissions,
  fetchTodayActiveEnergy,
  fetchLatestBodyMass,
  fetchDailySummaries,
  fetchTodayWorkouts,
  type HealthWorkout,
} from './services/health';

// Bump when plugins/ding-health reads a NEW HealthKit type. iOS only shows the
// permission sheet when asked, and only for types it hasn't asked about, so
// already-connected users must be re-asked once or the new type (v2: steps)
// silently returns nothing.
const HEALTH_READ_VERSION = 2;
const HEALTH_READ_KEY = 'ding-health-read-version';
import { App as CapApp } from '@capacitor/app';
import { computeAdaptiveTDEE } from './src/utils/adaptiveTDEE';
import { detectRestaurantsInText, findMenuItemMatches, type MenuItem } from './data/restaurants';
import { UserProfile, DailyLog, AppState, Location, PhysiqueGoal, SavedNote, Meal, FoodItem, BodyStats, BodyPartStats, WorkoutExercise, VisionRoadmap, ActivityLevel, NutritionTargets, HistoryEntry, WeightEntry } from './types';
import { CALCULATE_TDEE, CALCULATE_MACROS, DAYS_OF_WEEK, INITIAL_BODY_STATS, GET_AFFECTED_MUSCLES, XP_PER_LEVEL_BASE, isAdminUser, calculateTDEEDetailed } from './constants';
import { sendChatMessage } from './services/geminiService';
import { profileForAi } from './services/aiPrivacy';
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
  const reduceMotion = useReducedMotion();
  // Auth State (managed by shell now, but keeping some refs)
  const user = useMemo(() => ({ uid: userId, email: userEmail }), [userId, userEmail]);

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

  const latestAppState = useRef(appState);
  latestAppState.current = appState;
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

  // Apple Health (iOS only). Today's active energy is EPHEMERAL — recomputed
  // each launch/foreground straight from HealthKit and never written to the
  // user doc, so it can't grow the document (gotcha 3). Weigh-ins and workout
  // completions flow through the existing bounded arrays. `healthDeviceAvailable`
  // gates the connect prompt; `healthConnecting` disables the button mid-request.
  const [healthActiveEnergy, setHealthActiveEnergy] = useState<number | null>(null);
  const [healthDeviceAvailable, setHealthDeviceAvailable] = useState(false);
  const [healthConnecting, setHealthConnecting] = useState(false);

  // UI State
  const [activeTab, setActiveTab] = useState('dashboard');
  // Home shows ONE day at a time; the date bar switches it. New food logs to it.
  const [selectedDate, setSelectedDate] = useState(() => new Date().toLocaleDateString());
  const [profileSection, setProfileSection] = useState<ProfileSection>('history');
  const [appearance, setAppearanceState] = useState<Appearance>(() => readAppearance());
  const [healthByDate, setHealthByDate] = useState<Record<string, DaySummary>>({});
  const [healthWorkouts, setHealthWorkouts] = useState<HealthWorkout[]>([]);
  const [detailFood, setDetailFood] = useState<{ item: FoodItem; editable: boolean } | null>(null);
  const [showFuelCoach, setShowFuelCoach] = useState(false);

  // Single entry point for logging food. The FAB and the dashboard tile both
  // call this so there is exactly one destination — the unified add-food
  // sheet, which handles typing, photos, and your usuals in one screen.
  const openAddFood = useCallback(() => {
    setShowAddFood(true);
  }, []);
  // Direction of the page-turn transition. Positive when moving to a
  // later tab (forward), negative when going back. Recomputed inside the
  // tab-switch handler below. Default forward feels right on first paint.
  const TAB_ORDER = ['dashboard', 'coach', 'progress', 'profile'];
  const [pageTurnDirection, setPageTurnDirection] = useState<1 | -1>(1);
  const switchTab = useCallback((requested: string) => {
    // Old destinations now live elsewhere: Log is Profile → History, Reflect
    // is the Progress tab, Eats is a section of the Add Food page, and the
    // Train tab is gone (food-only app, Oct 2026).
    let next = requested;
    if (requested === 'journal') { setProfileSection('history'); next = 'profile'; }
    if (requested === 'reflect' || requested === 'recomp') next = 'progress';
    if (requested === 'workouts') next = 'dashboard';
    if (requested === 'restaurants') {
      try { sessionStorage.setItem('ding-add-section', 'eats'); } catch { /* ignore */ }
      setShowAddFood(true);
      return;
    }
    if (next === activeTab) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    setPageTurnDirection(
      TAB_ORDER.indexOf(next) >= TAB_ORDER.indexOf(activeTab) ? 1 : -1,
    );
    setActiveTab(next);
    window.scrollTo({ top: 0 });
  }, [activeTab]);
  const [isGeneratingSplit, setIsGeneratingSplit] = useState(false);
  const [showAddFood, setShowAddFood] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastUndoKind, setToastUndoKind] = useState<'food' | 'delete' | 'activity' | 'water' | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  
  // Chat
  const [chatHistory, setChatHistory] = useState<{role: string, text: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Manual Workout Entry State
  const [manualExercise, setManualExercise] = useState({ name: '', sets: 3, reps: '10' });
  const [activeDayIndexForAdd, setActiveDayIndexForAdd] = useState<number | null>(null);

  const [foodStatus, setFoodStatus] = useState<FoodStatus>('empty');
  const [foodHeroVisible, setFoodHeroVisible] = useState(true);
  const [foodSeed, setFoodSeed] = useState<FoodSeed | null>(null);
  const profilePicInputRef = useRef<HTMLInputElement>(null);
  const seedFood = (items: FoodItem[]) => {
    setFoodSeed({ id: crypto.randomUUID(), items });
    setShowAddFood(true);
  };

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

  // While the edit-profile modal is open, freeze the page behind it so
  // touch scrolling stays inside the modal (iOS scroll-chaining fix).
  useEffect(() => {
    if (!isEditingProfile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isEditingProfile]);
  const [editProfileData, setEditProfileData] = useState<Partial<UserProfile>>({});
  // Custom macro targets — when on, the user pins exact numbers and Save
  // stores them verbatim instead of recomputing from the profile.
  const [manualTargetsOn, setManualTargetsOn] = useState(false);
  const [manualDraft, setManualDraft] = useState({ calories: 2000, protein: 150, carbs: 200, fat: 65 });
  const [visionRoadmap, setVisionRoadmap] = useState<VisionRoadmap | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // One-time health disclaimer for users who onboarded BEFORE we added the
  // disclaimer step. App Store / Play Store policy requires every user to see
  // and accept it at least once. Triggered below once profile is loaded.
  const [showHealthDisclaimer, setShowHealthDisclaimer] = useState(false);

  // One-time AI data-sharing consent (App Store Guideline 5.1.2(i)). Shown the
  // first time the user triggers an AI feature that sends their own content
  // (a food photo/description, a coach message) to OpenAI or Google. The
  // pending action runs only after they agree.
  const [aiConsentPending, setAiConsentPending] = useState<null | (() => void)>(null);
  const [aiConsentSaving, setAiConsentSaving] = useState(false);
  const [aiConsentError, setAiConsentError] = useState('');
  // Ref mirrors the profile flag so an action re-run right after acceptance
  // (from a closure created before the state update) sees consent immediately.
  const aiConsentRef = useRef(false);
  aiConsentRef.current = aiConsentRef.current || appState.profile?.acceptedAiDataSharing === true;
  const hasAiConsent = () => aiConsentRef.current;
  const requireAiConsent = (action: () => void) => {
    if (hasAiConsent()) { action(); return; }
    setAiConsentError('');
    setAiConsentPending(() => action);
  };

  // First-launch spotlight tour. Fires once per user (gated by a uid-namespaced
  // localStorage flag). Triggered on first profile load OR via the "Show tour
  // again" button in Profile.
  const tourSeenKey = userId ? `dings_tour_seen_${userId}` : null;
  const [showTour, setShowTour] = useState(false);
  // Feather/arrow celebration overlay — pops when food gets logged.

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

  // Wrappers for state updates that also sync.
  //
  // COST-CRITICAL: this used to hand the ENTIRE AppState to saveToCloud on
  // every change — every water tap re-uploaded the full document (profile,
  // all daily logs, food history, meal history, the profile picture…), and
  // the onSnapshot listener then re-downloaded all of it. That amplification
  // is what drove the Firestore egress spike in Aug 2026.
  //
  // Now we diff against the previous state and send only the fields that
  // actually changed. setDoc(..., { merge: true }) applies a partial update,
  // so this is behaviourally identical but a fraction of the bytes.
  const handleUpdateAppState = (newState: AppState | ((prev: AppState) => AppState)) => {
      setAppState(prev => {
          const updated = typeof newState === 'function' ? newState(prev) : newState;

          const changed: Partial<AppState> = {};
          (Object.keys(updated) as Array<keyof AppState>).forEach(key => {
              // Reference check first (cheap); fall back to a value compare so
              // recreated-but-identical objects don't trigger a write.
              if (prev[key] === updated[key]) return;
              try {
                  if (JSON.stringify(prev[key]) === JSON.stringify(updated[key])) return;
              } catch {
                  // Non-serializable — treat as changed and let it save.
              }
              (changed as Record<string, unknown>)[key as string] = updated[key];
          });

          if (Object.keys(changed).length > 0) {
              saveToCloud(changed); // Fire and forget
          }
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
          if (import.meta.env.DEV) console.log("[Rollover] Archived", safeTodayLog.length, "items for", lastDate, "→", todayStr);
        } else if (alreadyArchived) {
          if (import.meta.env.DEV) console.log("[Rollover] Already archived", lastDate, "— resetting today only");
        } else {
          if (import.meta.env.DEV) console.log("[Rollover] Skipping empty day", lastDate, "— no food/water/burn logged");
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
        // Send only the fields rollover actually changes — spreading `next`
        // here would re-upload the entire document (see handleUpdateAppState).
        saveToCloud({
          dailyLogs: nextDailyLogs,
          todayLog: [],
          activityBurn: 0,
          waterIntake: 0,
          lastActiveDate: todayStr,
        });
        return next;
      });

      // Workout reset on Monday — only fires once per actual rollover (not
      // on idempotent re-runs) by checking the `archivedJustNow` flag the
      // setAppState callback set.
      if (archivedJustNow) {
        const dayOfWeek = new Date().getDay();
        isMonday = dayOfWeek === 1;
        // Food-only app (Oct 2026): the Monday workout-split reset is gone.
        triggerToast("New Day: Food & Water Reset");
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

                // Sanitize dailyLogs for local use only: drop empty/duplicate
                // entries left by old rollover code.
                //
                // DO NOT write back to Firestore from inside this listener.
                // A write here re-triggers this same snapshot, and each
                // iteration re-downloads the entire user document. That
                // write/read cycle is what produced ~200GB of Firestore
                // egress over two days in Aug 2026. Cleaning in memory is
                // enough — the next real save persists the cleaned array.
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
                if (import.meta.env.DEV && cleanedDailyLogs.length !== rawDailyLogs.length) {
                    console.log(`[Cleanup] Ignoring ${rawDailyLogs.length - cleanedDailyLogs.length} empty/duplicate dailyLogs entries (in memory only).`);
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
  
  // ── Appearance (Profile → Settings) ──
  useEffect(() => { applyAppearance(appearance); }, [appearance]);
  // The account's saved appearance follows the user to other devices.
  useEffect(() => {
    const remote = appState.profile?.appearance;
    if (isValidAppearance(remote) && (remote.mode !== appearance.mode || remote.tone !== appearance.tone)) setAppearanceState(remote);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appState.profile?.appearance?.mode, appState.profile?.appearance?.tone]);
  const changeAppearance = (next: Appearance) => {
    setAppearanceState(next);
    handleUpdateAppState(prev => ({ ...prev, profile: prev.profile ? { ...prev.profile, appearance: next } : prev.profile }));
  };
  // A selected day of "today" that is now yesterday (app left open past
  // midnight) rolls forward so Home doesn't silently show the wrong day.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      setSelectedDate(prev => {
        const t = new Date().toLocaleDateString();
        const y = new Date(Date.now() - 86400000).toLocaleDateString();
        return prev === y ? t : prev;
      });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

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

  // Pick a random voice line from a list. Used so the same toast feels less
  // robotic on repeat exposure — see VOICE.md for the source samples.
  const pickVoice = (lines: string[]) => lines[Math.floor(Math.random() * lines.length)];

  // Stable identity — useCallback so child callbacks (recordWeight, etc.)
  // can list it in their deps without re-creating themselves every render.
  // The state setters inside are themselves stable, so an empty dep array
  // is safe.
  const triggerToast = useCallback((msg: string, durationMs = 3000, undo: 'food' | 'delete' | 'activity' | 'water' | null = null) => {
    clearTimeout(toastTimer.current);
    setToastMessage(msg);
    setToastUndoKind(undo);
    setShowToast(true);
    toastTimer.current = setTimeout(() => setShowToast(false), durationMs);
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
      setPendingWaterUndo({ amount, expiresAt: Date.now() + 5000 });
      triggerToast(`Added ${amount} oz of water.`, 5000, 'water');
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
      appState.profile.goalTargetWeight
        ? { targetWeightLbs: appState.profile.goalTargetWeight, targetDate: appState.profile.goalTargetDate }
        : undefined,
      bf,
    );
  }, [appState.profile, appState.nutritionTargets]);

  // Adaptive TDEE — re-estimates the user's maintenance level from their
  // logged weight trend + intake. Returns hasEnoughData=false until ~10 days
  // of weight logs are available. The suggestion is offered to the user
  // (in the dashboard banner); they accept by tapping a button which writes
  // it back to the profile's nutrition targets.
  // Resting + baseline burn, straight from the onboarding profile.
  // bmr  = calories burned at complete rest
  // tdee = bmr x activity multiplier (the "normal day" burn)
  const energyBaseline = useMemo(() => {
    if (!appState.profile) return null;
    const bf = appState.profile.inBodyData?.pbf ?? appState.profile.bodyFat;
    const detail = calculateTDEEDetailed(
      appState.profile.weight,
      appState.profile.height,
      appState.profile.age,
      appState.profile.activityLevel,
      appState.profile.sex,
      bf,
    );
    return { bmr: detail.bmr, tdee: detail.tdee };
  }, [appState.profile]);

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
      appState.profile.goalTargetWeight
        ? { targetWeightLbs: appState.profile.goalTargetWeight, targetDate: appState.profile.goalTargetDate }
        : undefined,
      appState.profile.inBodyData?.pbf ?? appState.profile.bodyFat,
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

    // NOTE: activity burn is deliberately NOT subtracted here.
    //
    // The daily target already comes from TDEE = BMR x activityMultiplier,
    // where the multiplier reflects the activity level chosen at onboarding.
    // Subtracting logged workouts on top of that double-counts them and
    // silently inflates the budget — which made "calories left" mean two
    // different things depending on whether a workout had been logged.
    //
    // Eaten is now purely what was eaten. Burn is surfaced separately in the
    // energy-balance card so the user can see it without it moving the target.
    
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
        // Apple Health samples stay in weighIns only. profile.weight goes into
        // AI prompts, and HealthKit data must never reach an AI provider
        // (privacy policy, Guideline 5.1.3; audit PRIV-01).
        profile: prev.profile && source !== 'health' ? { ...prev.profile, weight: entry.weight } : prev.profile,
      };
    });
    setVisionRoadmap(null);
    // Source-aware confirmation so the chat tool feels like a chat reply,
    // not a check-in dialog.
    const toastMsg = source === 'chat'
      ? `Got it — saved ${entry.weight} lbs`
      : source === 'health'
      ? `Synced ${entry.weight} lbs from Apple Health`
      : `Checked in at ${entry.weight} lbs`;
    triggerToast(toastMsg);
    return true;
  }, [triggerToast]);

  // Tracks the most recent activity burn so the user can hit "Undo" inside
  // the success toast. Null means there's nothing to undo right now.
  const [pendingActivityUndo, setPendingActivityUndo] = useState<{ amount: number; expiresAt: number } | null>(null);
  const [pendingWaterUndo, setPendingWaterUndo] = useState<{ amount: number; expiresAt: number } | null>(null);
  const undoLastWater = () => {
    if (!pendingWaterUndo) return;
    handleUpdateAppState(prev => ({ ...prev, waterIntake: Math.max(0, prev.waterIntake - pendingWaterUndo.amount) }));
    setPendingWaterUndo(null);
    triggerToast('Water entry undone.');
  };

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
    ]), 5000, 'activity');
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
        dailyLogs: (prev.dailyLogs || []).map(day => {
          const removed = (day.foodItems || []).filter(i => idsToRemove.has(i.id));
          if (!removed.length) return day;
          return { ...day, foodItems: day.foodItems!.filter(i => !idsToRemove.has(i.id)),
            caloriesConsumed: day.caloriesConsumed - removed.reduce((sum,i) => sum + i.calories, 0),
            proteinConsumed: day.proteinConsumed - removed.reduce((sum,i) => sum + i.protein, 0),
            carbsConsumed: day.carbsConsumed - removed.reduce((sum,i) => sum + i.carbs, 0),
            fatConsumed: day.fatConsumed - removed.reduce((sum,i) => sum + i.fat, 0),
            fiberConsumed: (day.fiberConsumed || 0) - removed.reduce((sum,i) => sum + (i.fiber || 0), 0) };
        }),
    }));
    setPendingFoodUndo(null);
    triggerToast('Undone. Your food log is back where it was.');
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

  // ----------------------------------------------------------------------
  // APPLE HEALTH SYNC (iOS only)
  // ----------------------------------------------------------------------
  // Pulls three things and nothing else: today's active energy (ephemeral,
  // feeds the FuelHome energy card), the latest body-mass sample (seeds a
  // weigh-in), and today's workouts (auto-completes the scheduled split day).
  //
  // Defined as a plain function so each render closes over the freshest
  // appState — a ref hands the latest copy to effects/listeners without
  // making them re-subscribe. Every step is guarded and best-effort; any
  // failure leaves the app exactly as it was with no Health data.
  const healthSyncInFlight = useRef(false);
  const runHealthSync = async (force = false) => {
      if (!isHealthSupported()) return;
      if (!force && !appState.profile?.healthSyncEnabled) return;
      // Prevent overlapping runs (launch fires both the enable-effect and the
      // foreground listener). Overlap could seed a weigh-in / complete a day
      // twice before the first run's state commit lands.
      if (healthSyncInFlight.current) return;
      healthSyncInFlight.current = true;
      try {

      // 1) Active energy — EPHEMERAL. Never persisted, so it cannot grow the
      //    user doc. null => the card falls back to the estimated model.
      // New read types (steps) need one more permission prompt for people who
      // connected before they existed. iOS skips types already answered.
      try {
          if (Number(localStorage.getItem(HEALTH_READ_KEY) || '0') < HEALTH_READ_VERSION) {
              await requestHealthPermissions();
              localStorage.setItem(HEALTH_READ_KEY, String(HEALTH_READ_VERSION));
          }
      } catch { /* best-effort */ }

      const kcal = await fetchTodayActiveEnergy();
      setHealthActiveEnergy(kcal);
      // Today's workouts as Apple Health recorded them (watch sessions etc.).
      // Shown on Home and used to avoid double-counting logged workouts.
      fetchTodayWorkouts().then(setHealthWorkouts).catch(() => undefined);
      // Steps + active energy per day for the dashboard's day switcher.
      // Ephemeral like active energy: never written to the user doc.
      fetchDailySummaries(30).then(setHealthByDate).catch(() => undefined);

      // 2) Latest weight — seed a weigh-in only when the user hasn't already
      //    checked in today (manual check-ins always win; no duplicates).
      try {
          const mass = await fetchLatestBodyMass();
          if (mass) {
              const now = new Date();
              const todayKey = [
                  now.getFullYear(),
                  String(now.getMonth() + 1).padStart(2, '0'),
                  String(now.getDate()).padStart(2, '0'),
              ].join('-');
              const hasTodayWeighIn = (appState.weighIns || []).some(w => w.date === todayKey);
              if (!hasTodayWeighIn) {
                  recordWeight(mass.lbs, 'health');
              }
          }
      } catch { /* best-effort */ }

      } finally {
          healthSyncInFlight.current = false;
      }
  };

  // Hand effects/listeners the latest sync closure without re-subscribing.
  const syncHealthRef = useRef<(force?: boolean) => void>(() => {});
  syncHealthRef.current = runHealthSync;

  // Detect HealthKit availability once (gates the connect prompt).
  useEffect(() => {
      if (!isHealthSupported()) return;
      let cancelled = false;
      healthAvailable().then(a => { if (!cancelled) setHealthDeviceAvailable(a); });
      return () => { cancelled = true; };
  }, []);

  // Sync when the feature is enabled (on mount for returning users, and when
  // the user first connects). Cheap boolean dep — won't spin.
  useEffect(() => {
      if (!isHealthSupported()) return;
      if (!appState.profile?.healthSyncEnabled) return;
      syncHealthRef.current(false);
  }, [appState.profile?.healthSyncEnabled]);

  // Re-sync whenever the app returns to the foreground (fresh watch/scale data).
  useEffect(() => {
      if (!isHealthSupported()) return;
      let handle: { remove: () => void } | undefined;
      CapApp.addListener('appStateChange', ({ isActive }) => {
          if (isActive) syncHealthRef.current(false);
      }).then(l => { handle = l; }).catch(() => {});
      return () => { handle?.remove(); };
  }, []);

  // Show the HealthKit permission sheet, then remember the choice + sync now.
  const connectHealth = async () => {
      if (!isHealthSupported()) return;
      setHealthConnecting(true);
      try {
          const granted = await requestHealthPermissions();
          try { localStorage.setItem(HEALTH_READ_KEY, String(HEALTH_READ_VERSION)); } catch { /* ignore */ }
          // Mark enabled regardless of the (opaque) read-status flag: if the
          // user actually denied, queries just return null and we quietly stay
          // in estimated mode. This also dismisses the prompt.
          handleUpdateAppState(prev => ({
              ...prev,
              profile: prev.profile
                  ? { ...prev.profile, healthSyncEnabled: true, healthPromptDismissed: true }
                  : prev.profile,
          }));
          await syncHealthRef.current(true);
          triggerToast(granted ? 'Apple Health connected' : 'Apple Health connected — allow access when prompted');
      } finally {
          setHealthConnecting(false);
      }
  };

  const dismissHealthPrompt = () => {
      handleUpdateAppState(prev => ({
          ...prev,
          profile: prev.profile ? { ...prev.profile, healthPromptDismissed: true } : prev.profile,
      }));
  };

  const disconnectHealth = () => {
      setHealthActiveEnergy(null);
      setHealthWorkouts([]);
      setHealthByDate({});
      handleUpdateAppState(prev => ({
          ...prev,
          profile: prev.profile ? { ...prev.profile, healthSyncEnabled: false } : prev.profile,
      }));
      triggerToast('Apple Health disconnected');
  };

  // Shared commit for scans, manual food, barcodes, usuals and menu suggestions.
  // Stable item IDs make a retried save harmless, including after a relaunch.
  const pushFoodToState = async (items: FoodItem[], label?: string, logDate = new Date().toLocaleDateString()) => {
      const mealLabel = label || items.map(item => item.name).join(', ');
      const { state: next, added: fresh } = commitFood(latestAppState.current, items, mealLabel, logDate);
      if (!fresh.length && next === latestAppState.current) return;
      const foodHistory = next.foodHistory;
      const dailyLogsChanged = next.dailyLogs !== latestAppState.current.dailyLogs;
      // Local durability is required before the composer clears. Cloud sync may finish offline.
      if (!appStateKey) throw new Error('Sign in again to save your food.');
      localStorage.setItem(appStateKey, JSON.stringify(next));
      latestAppState.current = next;
      setAppState(next);
      // dailyLogs is the whole history (the user doc's biggest field). Only send
      // it when this commit actually changed it: a midnight rollover or food
      // logged to a past day. Ordinary logs touch todayLog only.
      void saveToCloud({ todayLog: next.todayLog, ...(dailyLogsChanged ? { dailyLogs: next.dailyLogs } : {}), foodHistory, lastActiveDate: next.lastActiveDate, waterIntake: next.waterIntake, activityBurn: next.activityBurn });
      const expiresAt = Date.now() + 8000;
      setPendingFoodUndo({ ids: fresh.map(i => i.id), label: mealLabel, expiresAt });
      setSelectedDate(logDate);
      switchTab('dashboard');
      triggerToast(logDate === new Date().toLocaleDateString() ? 'Logged. LETS GOOOO' : 'Logged to ' + logDate, 8000, 'food');
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
          triggerToast(`Removed ${snapshot.name}.`, 5000, 'delete');
          setTimeout(() => {
              setPendingDeleteUndo(curr =>
                  curr && curr.expiresAt <= Date.now() ? null : curr,
              );
          }, 5100);
      } else {
          triggerToast("Removed from your trail");
      }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || !appState.profile) return;
    if (!hasAiConsent()) {
      requireAiConsent(() => { handleSendMessage(); });
      return;
    }
    const userMsg = chatInput;
    setChatInput('');
    setChatHistory(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsChatLoading(true);
    try {
        const context = buildCoachContext({
            appState, targets: targetMacros, consumed: consumedMacros, streak,
        });
        const response = await sendChatMessage(chatHistory, profileForAi(appState.profile, appState.weighIns), userMsg, context);
        
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
                    } else if (metric === 'bodyFat' && appState.profile && Number(value) >= 3 && Number(value) <= 70) {
                         const newProfile = { ...appState.profile, bodyFat: Number(value) };
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

    // COST-CRITICAL: the profile picture is stored inside the user document,
    // and every Firestore snapshot re-downloads that whole document. A raw
    // phone photo as base64 is ~1MB, so it was being sent down the wire on
    // every sync — that egress is what blew up the bill in Aug 2026.
    // Downscale to 256px JPEG (~15-30KB) before storing: ~97% smaller,
    // still sharp for a 96px avatar.
    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const MAX = 256;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        // If canvas is unavailable for any reason, fall back to the original
        // rather than losing the upload entirely.
        const compressed = ctx
          ? (ctx.drawImage(img, 0, 0, w, h), canvas.toDataURL('image/jpeg', 0.8))
          : src;
        handleUpdateAppState(prev => ({
          ...prev,
          profile: { ...prev.profile!, profilePicture: compressed },
        }));
      };
      img.onerror = () => {
        triggerToast("Couldn't read that image. Try another one.");
      };
      img.src = src;
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
      onAdd={() => (showAddFood ? setShowAddFood(false) : openAddFood())}
      addOpen={showAddFood}
      foodStatus={foodStatus}
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
        if (toastUndoKind === 'delete' && pendingDeleteUndo && pendingDeleteUndo.expiresAt > now) {
          undoFn = undoLastDelete;
        } else if (toastUndoKind === 'food' && pendingFoodUndo && pendingFoodUndo.expiresAt > now) {
          undoFn = undoLastFoodLog;
        } else if (toastUndoKind === 'activity' && pendingActivityUndo && pendingActivityUndo.expiresAt > now) {
          undoFn = undoLastActivity;
        } else if (toastUndoKind === 'water' && pendingWaterUndo && pendingWaterUndo.expiresAt > now) {
          undoFn = undoLastWater;
        }
        return (
          <div role="status" className="fixed top-24 left-1/2 -translate-x-1/2 z-[200] w-max max-w-[92vw] bg-[#d97757] text-[var(--bg-dark)] px-5 py-2 rounded-2xl font-semibold text-sm shadow-md animate-slide-up flex items-center gap-3 text-center leading-snug">
            <span>{toastMessage}</span>
            {/* Undo button — appears whenever a 5-second undo window is open
                for activity burn, food add, or food delete. Tapping reverses
                the most recent action and clears the window. */}
            {undoFn && (
              <button
                onClick={undoFn}
                className="ml-1 min-h-11 px-3 rounded-xl bg-[var(--ink)] text-[var(--bg-dark)] text-sm font-semibold"
              >
                Undo
              </button>
            )}
          </div>
        );
      })()}

      <FoodComposer key={userId} uid={userId!} open={showAddFood} onClose={() => setShowAddFood(false)} onOpen={openAddFood}
        seed={foodSeed} onSeedConsumed={() => setFoodSeed(null)} onStatus={setFoodStatus}
        onSave={pushFoodToState} history={appState.foodHistory || []} onFavorite={toggleHistoryFavorite} onRemoveHistory={removeHistoryEntry}
        targets={targetMacros} consumed={consumedMacros} customMenuItems={appState.customMenuItems}
        logDate={selectedDate}
        dateLabel={selectedDate === new Date().toLocaleDateString() ? 'Today' : new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        requireConsent={action => {
          if (hasAiConsent()) { action(); return; }
          setShowAddFood(false);
          requireAiConsent(action);
        }} />

      {/* Food drill-in from the dashboard. Today's items are editable; past days read-only. */}
      <FoodDetailSheet
        item={detailFood?.item ?? null}
        readOnly={!detailFood?.editable}
        onClose={() => setDetailFood(null)}
        onDelete={(id) => deleteLog(id)}
        onSave={(updated) => {
          handleUpdateAppState(prev => ({
            ...prev,
            todayLog: (prev.todayLog || []).map(it => it.id === updated.id ? updated : it),
          }));
          triggerToast('Updated');
        }}
      />

      {/* Quick direction-aware slide between tabs; respects reduced motion. */}
      <div>
        <AnimatePresence mode="wait" initial={false} custom={pageTurnDirection}>
          <motion.div
            key={activeTab}
            custom={pageTurnDirection}
            variants={{
              enter: (d: number) => ({ opacity: 0, x: reduceMotion ? 0 : d * 28 }),
              center: { opacity: 1, x: 0 },
              exit: (d: number) => ({ opacity: 0, x: reduceMotion ? 0 : d * -28 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.16, 1, 0.3, 1] }}
            style={{ willChange: 'transform, opacity' }}
          >
      {activeTab === 'dashboard' && (
        <>
        {isHealthSupported() && healthDeviceAvailable &&
         !appState.profile?.healthSyncEnabled && !appState.profile?.healthPromptDismissed && (
          <div className="mb-4">
            <HealthConnectCard
              onConnect={connectHealth}
              onDismiss={dismissHealthPrompt}
              busy={healthConnecting}
            />
          </div>
        )}
        <Dashboard
          profile={currentProfile}
          targets={targetMacros}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          todayLog={appState.todayLog || []}
          todayConsumed={consumedMacros}
          todayWater={appState.waterIntake || 0}
          todayActivityBurn={appState.activityBurn || 0}
          dailyLogs={appState.dailyLogs || []}
          weighIns={appState.weighIns || []}
          streak={streak}
          greeting={greeting}
          energyBaseline={energyBaseline}
          healthActiveEnergy={healthActiveEnergy}
          healthByDate={healthByDate}
          healthWorkouts={healthWorkouts}
          onLogActivity={() => {
            setActivityModalForm({ kind: 'running', intensity: 'moderate', minutes: 30, manualKcal: '' });
            setShowActivityModal(true);
          }}
          healthConnected={!!appState.profile?.healthSyncEnabled}
          onConnectHealth={isHealthSupported() && healthDeviceAvailable && !appState.profile?.healthSyncEnabled ? connectHealth : undefined}
          onAddFood={openAddFood}
          onOpenFood={(item, editable) => setDetailFood({ item, editable })}
          onLogWater={updateWater}
          onLogWeight={(weight) => recordWeight(weight)}
          onOpenFuelCoach={() => setShowFuelCoach(true)}
          onAskCoach={() => switchTab('coach')}
          adaptiveSuggestion={adaptiveSuggestion}
          onAcceptAdaptiveSuggestion={acceptAdaptiveSuggestion}
        />
        </>
      )}


      {showFuelCoach && (
        <FuelCoachSheet
          remaining={{
            calories: Math.round(targetMacros.calories - consumedMacros.calories),
            protein: Math.max(0, Math.round(targetMacros.protein - consumedMacros.protein)),
            carbs: Math.max(0, Math.round(targetMacros.carbs - consumedMacros.carbs)),
            fat: Math.max(0, Math.round(targetMacros.fat - consumedMacros.fat)),
          }}
          profile={appState.profile ? profileForAi(appState.profile, appState.weighIns) : null}
          requireAiConsent={requireAiConsent}
          onClose={() => setShowFuelCoach(false)}
          onLogItem={(item) => {
            // Fuel Coach macros are AI estimates (except DB-grounded eat-out
            // picks) — same trust level as the AI meal scan.
            seedFood([item]);
            setShowFuelCoach(false);
          }}
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
              seedFood([item]);
            }}
          />
        </div>
      )}




      {activeTab === 'coach' && (
        <div className="flex flex-col animate-fade-in relative min-h-screen pb-40">
           {/* ... existing coach content ... */}
          <div className="flex-1 space-y-6 pr-2 pb-4 pt-2">
              <div className="text-center opacity-30 my-4">
                  <span className="text-4xl font-orbitron font-bold text-[var(--ink)]">Ding!</span>
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

      {activeTab === 'progress' && appState.profile && (
        <div className="space-y-5 pb-6">
          <div className="rise-in">
            <p className="text-sm text-[var(--ink-mid)]">Your food, over time</p>
            <h1 className="text-[1.65rem] font-bold leading-tight tracking-tight">Progress</h1>
          </div>
          <ProgressCharts
            profile={appState.profile}
            targets={targetMacros}
            dailyLogs={appState.dailyLogs || []}
            todayLog={appState.todayLog || []}
            todayConsumed={consumedMacros}
            todayActivityBurn={appState.activityBurn || 0}
            weighIns={appState.weighIns || []}
            energyBaseline={energyBaseline}
            healthActiveEnergy={healthActiveEnergy}
            healthByDate={healthByDate}
          />
          <p className="pt-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--ink-light)]">Your story</p>
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
            initialPeriod="week"
          />
          <div className="rounded-3xl border border-[var(--line)] bg-[var(--bg-card)] p-5">
            <CalorieCalendar logs={appState.dailyLogs || []} targetCalories={targetMacros.calories} />
          </div>
        </div>
      )}

      {activeTab === 'profile' && appState.profile && (
        <ProfileHub
          profile={appState.profile}
          avatar={(
              <div 
                className="tap w-20 h-20 shrink-0 rounded-full border-[3px] border-[var(--primary)] p-0.5 cursor-pointer relative group flex items-center justify-center bg-[var(--bg-dark)]"
                onClick={() => profilePicInputRef.current?.click()}
              >
                 {appState.profile?.profilePicture ? (
                     <img src={appState.profile.profilePicture} className="w-full h-full object-cover rounded-full" />
                 ) : (
                     <span className="text-3xl font-orbitron font-bold text-[var(--primary)]">
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
          )}
          streak={streak}
          dailyLogs={appState.dailyLogs || []}
          todayLog={appState.todayLog || []}
          foodHistory={appState.foodHistory || []}
          weighIns={appState.weighIns || []}
          onEdit={() => {
                   setEditProfileData({
                       weight: appState.profile?.weight,
                       bodyFat: appState.profile?.bodyFat,
                       goal: appState.profile?.goal,
                       activityLevel: appState.profile?.activityLevel,
                       workoutPreferences: appState.profile?.workoutPreferences,
                   });
                   setManualTargetsOn(!!appState.profile?.manualTargets);
                   setManualDraft({
                       calories: targetMacros.calories,
                       protein: targetMacros.protein,
                       carbs: targetMacros.carbs,
                       fat: targetMacros.fat,
                   });
                   setIsEditingProfile(true);
                }}
          section={profileSection}
          onSection={setProfileSection}
          appearance={appearance}
          onAppearance={changeAppearance}
          history={(
            <div>
              <Journal
            dailyLogs={appState.dailyLogs || []}
            todayLog={appState.todayLog || []}
            waterIntake={appState.waterIntake}
            activityBurn={appState.activityBurn}
            profile={appState.profile}
            aiProfile={profileForAi(appState.profile, appState.weighIns)}
            requireAiConsent={requireAiConsent}
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
          />
            </div>
          )}
          settings={(
            <div className="space-y-6">
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

           {/* APPLE HEALTH (iOS only) */}
           {isHealthSupported() && healthDeviceAvailable && (
              <div className="glass-panel p-6 rounded-3xl">
                 <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                       <p className="text-[9px] text-gray-500 font-bold uppercase mb-1 tracking-widest">Apple Health</p>
                       <p className="text-sm text-white leading-snug">
                          {appState.profile?.healthSyncEnabled
                             ? 'Connected — active energy, steps, workouts and weight sync automatically.'
                             : 'Not connected. Pull activity from Apple Health instead of logging by hand.'}
                       </p>
                       <p className="text-[10px] text-gray-500 mt-1">Read-only. Never used for ads and never sold.</p>
                    </div>
                    {appState.profile?.healthSyncEnabled ? (
                       <button
                          onClick={disconnectHealth}
                          className="shrink-0 px-4 py-2 rounded-full border border-red-500/20 bg-red-500/10 text-red-400 text-[11px] font-bold uppercase tracking-widest hover:bg-red-500/20 transition-colors"
                       >
                          Disconnect
                       </button>
                    ) : (
                       <button
                          onClick={connectHealth}
                          disabled={healthConnecting}
                          className="shrink-0 px-4 py-2 rounded-full border border-[#d97757]/30 bg-[#d97757]/15 text-[#d97757] text-[11px] font-bold uppercase tracking-widest hover:bg-[#d97757]/25 transition-colors disabled:opacity-60"
                       >
                          {healthConnecting ? 'Connecting…' : 'Connect'}
                       </button>
                    )}
                 </div>
                 {appState.profile?.healthSyncEnabled && (
                    <p className="text-[10px] text-gray-500 mt-3 leading-snug">
                       To fully revoke access, open the Health app → Sharing → Apps → Ding! Fitness.
                    </p>
                 )}
              </div>
           )}

           
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
              {/* Admin only: the GPT key lets an outside ChatGPT read this account's
                  macros, a data path the privacy policy doesn't describe (FEAT-01). */}
              {isAdminUser(userId) && (
              <button
                  onClick={handleCreateGptKey}
                  className="text-[10px] text-gray-500 underline underline-offset-4 hover:text-cyan-400 transition-colors uppercase tracking-widest"
              >
                  Fuel Coach GPT key
              </button>
              )}
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

           <p className="text-center text-[11px] text-[var(--ink-light)] uppercase tracking-widest mt-8">Ding! v2.2</p>
            </div>
          )}
        />
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
            <div className="bg-[#0f0f0f] w-full max-w-sm max-h-[85dvh] overflow-y-auto overscroll-contain rounded-[2rem] p-6 border border-white/10 shadow-2xl animate-slide-up">
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

                    {/* CUSTOM TARGETS — pin exact numbers for your own plan.
                        When on, Save stores these verbatim; when off, Save
                        recalculates targets from the profile as usual. */}
                    <div className="pt-2 border-t border-white/5">
                        <button
                            type="button"
                            onClick={() => setManualTargetsOn(v => !v)}
                            className="w-full flex items-center justify-between"
                            aria-pressed={manualTargetsOn}
                        >
                            <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest flex items-center gap-2">
                                <span>🎯</span>
                                <span>Custom Macro Targets</span>
                            </span>
                            <span className={`w-10 h-6 rounded-full p-0.5 transition-colors ${manualTargetsOn ? 'bg-cyan-500' : 'bg-white/10'}`}>
                                <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${manualTargetsOn ? 'translate-x-4' : ''}`} />
                            </span>
                        </button>
                        {manualTargetsOn && (
                            <div className="mt-3 space-y-3">
                                <p className="text-[10px] text-gray-500 leading-snug">
                                    Set exact numbers for your own plan. These override the calculated targets until you turn this off.
                                </p>
                                <div className="grid grid-cols-2 gap-2.5">
                                    {([
                                        { key: 'calories', label: 'Calories', unit: 'kcal' },
                                        { key: 'protein',  label: 'Protein',  unit: 'g' },
                                        { key: 'carbs',    label: 'Carbs',    unit: 'g' },
                                        { key: 'fat',      label: 'Fat',      unit: 'g' },
                                    ] as const).map(f => (
                                        <div key={f.key}>
                                            <label className="block text-[9px] text-gray-500 uppercase tracking-widest font-bold mb-1.5">
                                                {f.label} ({f.unit})
                                            </label>
                                            <input
                                                type="number"
                                                inputMode="numeric"
                                                min="0"
                                                value={manualDraft[f.key] || ''}
                                                onChange={e => setManualDraft(prev => ({ ...prev, [f.key]: Number(e.target.value) }))}
                                                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-cyan-400 tabular-nums"
                                            />
                                        </div>
                                    ))}
                                </div>
                                <p className="text-[9px] text-gray-600 tabular-nums">
                                    Macros add up to {(manualDraft.protein * 4 + manualDraft.carbs * 4 + manualDraft.fat * 9).toLocaleString()} kcal
                                    · calories set to {(manualDraft.calories || 0).toLocaleString()}
                                </p>
                            </div>
                        )}
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
                        const newProfile = { ...appState.profile, ...editProfileData, manualTargets: manualTargetsOn } as UserProfile;
                        // Body-composition-aware BMR: prefer InBody scan, fall back to manual bodyFat entry.
                        const bf = newProfile.inBodyData?.pbf ?? newProfile.bodyFat;
                        const tdee = CALCULATE_TDEE(newProfile.weight, newProfile.height, newProfile.age, newProfile.activityLevel, newProfile.sex, bf);
                        const macroResult = CALCULATE_MACROS(
                          tdee,
                          newProfile.goal,
                          newProfile.weight,
                          newProfile.sex,
                          newProfile.macroSplit,
                          newProfile.goalTargetWeight
                            ? { targetWeightLbs: newProfile.goalTargetWeight, targetDate: newProfile.goalTargetDate }
                            : undefined,
                          bf,
                        );
                        // Custom targets win verbatim; otherwise strip MacroResult
                        // to NutritionTargets shape (drop floor metadata).
                        const targets = manualTargetsOn
                            ? {
                                calories: Math.max(800, Math.round(manualDraft.calories || 0)),
                                protein: Math.max(0, Math.round(manualDraft.protein || 0)),
                                carbs: Math.max(0, Math.round(manualDraft.carbs || 0)),
                                fat: Math.max(0, Math.round(manualDraft.fat || 0)),
                              }
                            : {
                                calories: macroResult.calories,
                                protein: macroResult.protein,
                                carbs: macroResult.carbs,
                                fat: macroResult.fat,
                              };


                        handleUpdateAppState(prev => ({
                            ...prev,
                            profile: newProfile,
                            nutritionTargets: targets // Sync new calculated targets
                        }));
                        setIsEditingProfile(false);
                        triggerToast(
                          manualTargetsOn
                            ? "Saved with your custom targets."
                            : macroResult.floorApplied
                            ? "Profile updated. Calories capped at safety minimum."
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

      {/* One food invitation after onboarding. */}
      <FoodDialog open={showTour} onClose={handleCloseTour} title="Welcome to Ding!" closeLabel="Look around first">
        <div className="space-y-5 text-[var(--ink)]">
          <h2 className="text-3xl font-bold">Yooo. Lets start with what you ate.</h2>
          <p className="text-base leading-relaxed text-[var(--ink-mid)]">Show me a meal and Ill work out the macros. You get the last word.</p>
          <button type="button" className="min-h-14 w-full rounded-xl bg-[#d97757] p-4 text-base font-semibold text-[var(--bg-dark)]" onClick={() => { handleCloseTour(); openAddFood(); }}>Show me what you ate</button>
          <button type="button" className="min-h-11 w-full text-base text-[var(--ink-mid)]" onClick={handleCloseTour}>Look around first</button>
        </div>
      </FoodDialog>




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

      {/* ONE-TIME AI DATA-SHARING CONSENT (Guideline 5.1.2(i)) */}
      {aiConsentPending && (
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
                <h2 className="text-lg font-orbitron font-bold text-white tracking-wider text-center">
                  BEFORE YOU USE AI
                </h2>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest text-center">
                  How AI features use your data
                </p>
              </div>
              <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
                <p>
                  To estimate macros, Dings sends your food photos and descriptions to
                  <span className="text-white font-semibold"> OpenAI</span>. Coach chats, Fuel Coach and
                  Analyze Day are processed by <span className="text-white font-semibold">Google Gemini</span>.
                </p>
                <p>
                  Food scans send only the photo and what you typed. Coach features include your logged
                  food, targets and profile details like your goal and stats. Neither provider gets your email, password, or Apple
                  Health data. Food photos are kept privately while the analysis runs, then deleted.
                  Your draft stays on this device until you log or discard it.
                </p>
                <p className="text-[12px] text-gray-400">
                  You can always log food manually instead. Details are in the Privacy Policy.
                </p>
              </div>
              <div className="space-y-2">
                <button
                  disabled={aiConsentSaving}
                  onClick={async () => {
                    if (aiConsentSaving) return;
                    const run = aiConsentPending;
                    setAiConsentSaving(true); setAiConsentError('');
                    try {
                      if (!db || !navigator.onLine || !latestAppState.current.profile) throw new Error('Reconnect to save your choice.');
                      const consent = { acceptedAiDataSharing: true, aiDataSharingAcceptedAt: new Date().toISOString() };
                      // The food worker verifies consent on the server before accepting input.
                      await setDoc(doc(db, 'users', userId), { profile: consent }, { merge: true });
                      aiConsentRef.current = true;
                      handleUpdateAppState(prev => ({ ...prev, profile: prev.profile ? { ...prev.profile, ...consent } : prev.profile }));
                      setAiConsentPending(null);
                      run?.();
                    } catch {
                      setAiConsentError('Couldnt save your choice. Check your connection and try again.');
                    } finally { setAiConsentSaving(false); }
                  }}
                  className="w-full py-4 rounded-2xl bg-white text-black font-orbitron font-bold text-sm tracking-widest hover:bg-gray-200 transition-colors"
                >
                  {aiConsentSaving ? 'SAVING…' : 'AGREE & CONTINUE'}
                </button>
                {aiConsentError && <p role="alert" className="text-sm text-[#e8a85a]">{aiConsentError}</p>}
                <button
                  disabled={aiConsentSaving}
                  onClick={() => {
                    setAiConsentPending(null);
                    triggerToast('No problem. You can still log food manually.');
                  }}
                  className="w-full py-3 rounded-2xl bg-white/5 text-gray-400 text-xs font-bold tracking-widest hover:bg-white/10 transition-colors"
                >
                  NOT NOW
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default MainApp;
