
export enum ActivityLevel {
  Sedentary = 'Sedentary',
  Light = 'Lightly Active',
  Moderate = 'Moderately Active',
  Very = 'Very Active',
  Extra = 'Extra Active'
}

export enum PhysiqueGoal {
  Lean = 'Lean/Athletic',
  Bulk = 'Bulk/Hypertrophy',
  WeightLoss = 'Weight Loss',
  Performance = 'Performance',
  Recomposition = 'Body Recomposition'
}

export enum Location {
  Gym = 'Gym',
  Home = 'Home'
}

export interface InBodyMetrics {
  weight: number;
  smm: number; // Skeletal Muscle Mass
  pbf: number; // Percent Body Fat
  bmr: number;
  visceralLevel: number;
  date: string;
}

export interface RoadmapStep {
  title: string;
  description: string;
  milestone: string;
  actionItems: string[]; // Specific things to do
}

export interface VisionRoadmap {
  visionStatement: string;
  nutritionTargets: {
    dailyCalories: number;
    dailyProtein: number; // in grams
    dailyDeficit: number; // in calories
    strategySummary: string;
  };
  steps: RoadmapStep[];
}

// ============================================================================
//  Workout Preferences
// ============================================================================
// Drives the generateSmartSplit Gemini prompt so the AI shapes exercises,
// volume, and structure to the user's actual training context. All fields
// optional so legacy profiles without these still generate a workable split
// from sensible defaults (intermediate / 4 days / 60 min / full-gym).
export type TrainingExperience = 'beginner' | 'intermediate' | 'advanced';
export type EquipmentAccess = 'full-gym' | 'home-weights' | 'bodyweight';

export interface WorkoutPreferences {
  experience?: TrainingExperience;
  daysPerWeek?: 3 | 4 | 5 | 6;
  sessionMinutes?: 30 | 45 | 60 | 90;
  equipment?: EquipmentAccess;
}

// ============================================================================
//  Macro Split Preferences
// ============================================================================
// Controls how the leftover calories (after protein) are divided between
// carbs and fat. 'balanced' is the default — matches the formula we shipped
// originally (55/45 carb/fat of remaining). Other modes shift the ratio.
export type MacroSplit = 'balanced' | 'low-carb' | 'high-protein' | 'keto';

// ============================================================================
//  Adaptive TDEE State (per-user, persisted)
// ============================================================================
// When the adaptive TDEE engine has enough data to suggest a target update,
// we cache the result so we don't recompute on every render. `lastAppliedAt`
// gates how often we re-prompt the user (e.g. weekly).
export interface AdaptiveTDEEState {
  suggestedTdee: number;
  adjustmentKcal: number;
  computedAt: string;     // ISO timestamp when computeAdaptiveTDEE last ran
  lastAppliedAt?: string; // ISO timestamp when the user last accepted a change
  reason: string;
}

export interface UserProfile {
  name: string;
  age: number;
  weight: number;
  height: number;
  sex?: 'Male' | 'Female';
  bodyFat?: number;
  activityLevel: ActivityLevel;
  goal: PhysiqueGoal;
  highEnergyDays: string[];
  busyDays: string[];
  initialWeight: number;
  inBodyData?: InBodyMetrics;
  profilePicture?: string;
  workoutPreferences?: WorkoutPreferences;
  // Legal/compliance — set when the user accepts the health disclaimer.
  // Required for App Store / Play Store submission for any fitness/health app.
  acceptedHealthDisclaimer?: boolean;
  disclaimerAcceptedAt?: string; // ISO timestamp
  // When true (default), items logged 5+ times are auto-favorited.
  // Set to false explicitly to disable.
  autoFavoriteEnabled?: boolean;
  // Macro split preference — controls how non-protein calories are divided
  // between carbs and fat. Defaults to 'balanced' if unset.
  macroSplit?: MacroSplit;
  // Cached adaptive TDEE state. Recomputed weekly; cleared on profile reset.
  adaptiveTdee?: AdaptiveTDEEState;
}

export interface WorkoutExercise {
  id?: string;
  name: string;
  sets: number;
  reps: number; // Changed from string to number for volume calculation
  weight?: number; // Weight in lbs
  location?: Location;
  completed?: boolean;
}

export interface FoodItem {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  timestamp: string;
}

export interface HistoryEntry {
  id: string;
  label: string;
  timestamp: string;
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  totalFiber?: number;
  items: FoodItem[];
  // User-curated quick-access. Favorited entries never get pruned from
  // history even when the 50-entry cap would otherwise drop them.
  favorited?: boolean;
  // Total times the user has logged this meal/label. Used for auto-favoriting
  // (items logged 5+ times become favorites automatically unless the user
  // disabled autoFavoriteEnabled in their profile).
  loggedCount?: number;
}

export interface Meal {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  timeEstimate: string;
  ingredients: string[];
  instructions?: string[];
  dateCreated?: string;
}

export interface DailyLog {
  date: string;
  weight: number;
  caloriesConsumed: number;
  proteinConsumed: number;
  carbsConsumed: number;
  fatConsumed: number;
  sugarConsumed?: number;
  fiberConsumed?: number;
  waterIntake: number; // in oz
  caloriesBurned?: number; // Added for activity tracking
  workoutCompleted?: boolean;
  workoutLabel?: string;
  workoutVolume?: number;
  workoutExercises?: WorkoutExercise[];
  sleepHours?: number;
  recompScore?: number;
  bioVisionFlags?: string[];
  foodItems?: FoodItem[];
}

export interface SavedNote {
  id: string;
  content: string;
  date: string;
  type: 'coach_insight';
  title?: string;
}

export interface BodyPartStats {
  level: number;
  currentXP: number;
  maxXP: number;
}

export interface BodyStats {
  chest: BodyPartStats;
  back: BodyPartStats;
  legs: BodyPartStats;
  arms: BodyPartStats;
  stamina: BodyPartStats;
}

export interface NutritionTargets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface AppState {
  profile: UserProfile | null;
  todayLog: FoodItem[];
  activityBurn: number; // Current day activity burn in calories
  waterIntake: number; // Current day water in oz
  dailyLogs: DailyLog[];
  milestones: string[];
  savedNotes: SavedNote[];
  mealHistory: Meal[];
  foodHistory: HistoryEntry[]; // Replaces recentFoods for robust grouping
  recentFoods: FoodItem[]; // Deprecated but kept for migration safety
  bodyStats: BodyStats;
  lastActiveDate?: string;
  nutritionTargets?: NutritionTargets; // Persistent targets
  /**
   * User-added menu items, keyed by restaurant slug ("chipotle", "chick-fil-a").
   * When the AI scan returns an item attributed to a known chain that isn't
   * in our built-in DB, we auto-add it here so the user can re-log it fast
   * next time AND so the AI sees it as authoritative on future requests.
   * Items use the same MenuItem shape as the built-in database.
   */
  customMenuItems?: Record<string, Array<{
    id: string;
    name: string;
    category: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber?: number;
    servingSize?: string;
    notes?: string;
    isCustom?: boolean;
    addedAt?: string; // ISO timestamp
  }>>;
}

export interface ChatResponse {
  text: string;
  toolCalls?: any[];
}