import { WebPlugin } from '@capacitor/core';

import type {
  DingHealthPlugin,
  HealthAvailability,
  HealthAuthResult,
  ActiveEnergyResult,
  WorkoutsResult,
  BodyMassResult,
} from './definitions';

/**
 * Web/Android no-op. HealthKit is Apple-only, so every method resolves to a
 * benign "not available / no data" shape. The app never shows Health UI off
 * iOS, but resolving (rather than throwing) keeps any stray call harmless.
 */
export class DingHealthWeb extends WebPlugin implements DingHealthPlugin {
  async isAvailable(): Promise<HealthAvailability> {
    return { available: false };
  }
  async requestAuthorization(): Promise<HealthAuthResult> {
    return { granted: false, available: false };
  }
  async getTodayActiveEnergy(): Promise<ActiveEnergyResult> {
    return { available: false, kcal: null };
  }
  async getTodayWorkouts(): Promise<WorkoutsResult> {
    return { available: false, workouts: [] };
  }
  async getLatestBodyMass(): Promise<BodyMassResult> {
    return { available: false, found: false };
  }
}
