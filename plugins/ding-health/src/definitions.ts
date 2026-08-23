/**
 * DingHealth plugin — read-only HealthKit access for Ding! Fitness.
 *
 * iOS-only. On web/Android every method rejects (see web.ts); callers must
 * guard with `Capacitor.getPlatform() === 'ios'`. The app-side wrapper in
 * `services/health.ts` does exactly that and turns every failure into a
 * safe "no data" result so the app behaves identically without Health.
 */

export interface HealthAvailability {
  available: boolean;
}

export interface HealthAuthResult {
  /** True when the permission sheet completed. iOS never reveals whether
   *  read access was actually granted, so this is "sheet shown", not "yes". */
  granted: boolean;
  available: boolean;
}

export interface ActiveEnergyResult {
  available: boolean;
  /** Cumulative active energy (kcal) burned since local midnight, or null. */
  kcal: number | null;
}

export interface HealthWorkout {
  uuid: string;
  activityType: string;
  activityTypeRaw: number;
  durationMin: number;
  kcal: number | null;
  start: string;
  end: string;
}

export interface WorkoutsResult {
  available: boolean;
  workouts: HealthWorkout[];
}

export interface BodyMassResult {
  available: boolean;
  found: boolean;
  kg?: number;
  lbs?: number;
  date?: string;
  uuid?: string;
}

export interface DingHealthPlugin {
  /** Whether HealthKit exists on this device (false on iPad/web/Android). */
  isAvailable(): Promise<HealthAvailability>;
  /** Present the HealthKit read-permission sheet for the three types. */
  requestAuthorization(): Promise<HealthAuthResult>;
  /** Active energy burned since local midnight. */
  getTodayActiveEnergy(): Promise<ActiveEnergyResult>;
  /** Workouts that started today. */
  getTodayWorkouts(): Promise<WorkoutsResult>;
  /** Most recent body-mass sample, whenever it was recorded. */
  getLatestBodyMass(): Promise<BodyMassResult>;
}
