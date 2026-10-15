/**
 * What may leave the device toward an AI provider (Gemini / OpenAI).
 *
 * The privacy policy promises that Apple Health data is never disclosed to
 * AI providers (App Store Guideline 5.1.3). Health weigh-ins are stored as
 * `weighIns` entries with `source: 'health'` and no longer touch
 * `profile.weight` (PRIV-01, Oct 2026). Profiles synced before that fix may
 * still carry a Health value in `profile.weight`, so every AI prompt reads
 * the weight through `aiSafeWeight` instead of trusting the profile field.
 */
import type { WeightEntry } from '../types';

const isWeight = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
const when = (w: WeightEntry) => w.createdAt || w.date || '';

/**
 * The newest weight the user entered themselves (check-in, chat, onboarding
 * or Edit Profile). Never an Apple Health sample. `undefined` when the only
 * weight we know came from Health.
 */
export function aiSafeWeight(
  profile: { weight?: number } | null | undefined,
  weighIns: WeightEntry[] | null | undefined = [],
): number | undefined {
  const entries = (weighIns || []).filter(w => w && isWeight(w.weight));
  const manual = entries
    .filter(w => w.source !== 'health')
    .sort((a, b) => when(a).localeCompare(when(b)));
  const latestManual = manual.length ? manual[manual.length - 1].weight : undefined;
  const healthValues = new Set(entries.filter(w => w.source === 'health').map(w => w.weight));
  const profileWeight = profile?.weight;
  if (isWeight(profileWeight)) {
    // A profile weight that matches a Health sample (and no manual entry)
    // may be a pre-fix Health overwrite: don't send it.
    if (!healthValues.has(profileWeight) || profileWeight === latestManual) return profileWeight;
  }
  return latestManual;
}

/** A copy of the profile that is safe to put into an AI prompt. */
export function profileForAi<T extends { weight?: number }>(
  profile: T,
  weighIns: WeightEntry[] | null | undefined,
): T {
  return { ...profile, weight: aiSafeWeight(profile, weighIns) };
}
