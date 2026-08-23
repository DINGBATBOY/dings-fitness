/**
 * health.ts — the app's single, safe entry point to Apple Health.
 *
 * Everything here is defensive on purpose. HealthKit only exists on iOS, so
 * every call is guarded by `isHealthSupported()` and wrapped in try/catch.
 * On web, Android, a declined permission, or any native error, these helpers
 * return a benign "no data" value (null / [] / false) and the app renders
 * exactly as it does today with no Health connected. Nothing here throws.
 *
 * The native side is the local `ding-health` Capacitor plugin
 * (plugins/ding-health). We call it through Capacitor's `registerPlugin`
 * proxy rather than importing the package, so the web bundle never depends
 * on the plugin's JS.
 */
import { registerPlugin, Capacitor } from '@capacitor/core';

export interface HealthWorkout {
  uuid: string;
  activityType: string;
  activityTypeRaw: number;
  durationMin: number;
  kcal: number | null;
  start: string;
  end: string;
}

export interface HealthBodyMass {
  lbs: number;
  date: string; // ISO timestamp of the sample
  uuid: string;
}

interface DingHealthPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  requestAuthorization(): Promise<{ granted: boolean; available: boolean }>;
  getTodayActiveEnergy(): Promise<{ available: boolean; kcal: number | null }>;
  getTodayWorkouts(): Promise<{ available: boolean; workouts: HealthWorkout[] }>;
  getLatestBodyMass(): Promise<{
    available: boolean;
    found: boolean;
    kg?: number;
    lbs?: number;
    date?: string;
    uuid?: string;
  }>;
}

const DingHealth = registerPlugin<DingHealthPlugin>('DingHealth');

/** HealthKit is Apple-only. Everything else no-ops. */
export const isHealthSupported = (): boolean => Capacitor.getPlatform() === 'ios';

/** Does this device actually have HealthKit (false on web/Android/iPad)? */
export const healthAvailable = async (): Promise<boolean> => {
  if (!isHealthSupported()) return false;
  try {
    const { available } = await DingHealth.isAvailable();
    return !!available;
  } catch {
    return false;
  }
};

/**
 * Present the HealthKit permission sheet. Resolves true if the sheet
 * completed (iOS never tells us whether read access was granted; we find out
 * implicitly when queries return data or don't).
 */
export const requestHealthPermissions = async (): Promise<boolean> => {
  if (!isHealthSupported()) return false;
  try {
    const res = await DingHealth.requestAuthorization();
    return !!res.granted;
  } catch {
    return false;
  }
};

/** Active energy (kcal) burned since local midnight, or null if unavailable. */
export const fetchTodayActiveEnergy = async (): Promise<number | null> => {
  if (!isHealthSupported()) return null;
  try {
    const res = await DingHealth.getTodayActiveEnergy();
    if (!res.available || res.kcal == null) return null;
    const kcal = Math.round(res.kcal);
    return kcal > 0 ? kcal : null;
  } catch {
    return null;
  }
};

/** Workouts that started today, or [] if none / unavailable. */
export const fetchTodayWorkouts = async (): Promise<HealthWorkout[]> => {
  if (!isHealthSupported()) return [];
  try {
    const res = await DingHealth.getTodayWorkouts();
    return res.available && Array.isArray(res.workouts) ? res.workouts : [];
  } catch {
    return [];
  }
};

/** Most recent body-mass sample in lbs, or null. */
export const fetchLatestBodyMass = async (): Promise<HealthBodyMass | null> => {
  if (!isHealthSupported()) return null;
  try {
    const res = await DingHealth.getLatestBodyMass();
    if (!res.available || !res.found || typeof res.lbs !== 'number' || !res.date) {
      return null;
    }
    const lbs = Math.round(res.lbs * 10) / 10;
    if (lbs <= 50 || lbs >= 700) return null; // mirror the app's sane range
    return { lbs, date: res.date, uuid: res.uuid || res.date };
  } catch {
    return null;
  }
};
