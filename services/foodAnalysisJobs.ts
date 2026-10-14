import { doc, getDocFromServer, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebase';
import { prepareFoodAnalysis, type FoodAnalysisResult } from './geminiService';
import type { AnalysisEvent } from '../components/food/FoodFlow';

export type FoodJob = {
  jobId: string; seq: number; createdAtMs: number; updatedAtMs: number;
  state: 'queued' | 'running' | 'ready' | 'failed' | 'cancelled';
  type: AnalysisEvent['type']; input?: 'photo' | 'text' | 'barcode'; domain?: string; message?: string;
  result?: FoodAnalysisResult;
};
export async function startFoodJob(jobId: string, images: string[], description: string) {
  if (!functions) throw new Error('Sign in again to check your food.');
  const messages = await prepareFoodAnalysis(images, description);
  const call = httpsCallable(functions, 'startFoodAnalysis', { timeout: 60_000 });
  await call({ jobId, messages, hasImages: images.length > 0 });
}
export async function recoverFoodJob(uid: string, jobId: string): Promise<boolean> {
  if (!db) return false;
  // Missing documents are intentionally not readable under owner-only rules.
  // Retain the request ID on failure: an explicit retry reuses it idempotently.
  try { return (await getDocFromServer(doc(db, 'foodAnalysisJobs', `${uid}_${jobId}`))).exists(); }
  catch { return false; }
}
export function watchFoodJob(uid: string, jobId: string, update: (job: FoodJob | null) => void, error: (error: Error) => void) {
  if (!db) { error(new Error('Connection unavailable. Reopen Ding when youre online.')); return () => {}; }
  return onSnapshot(doc(db, 'foodAnalysisJobs', `${uid}_${jobId}`), snapshot => update(snapshot.exists() ? snapshot.data() as FoodJob : null), error);
}
export async function cancelFoodJob(jobId: string) {
  if (!functions) throw new Error('Reconnect to stop this analysis.');
  await httpsCallable(functions, 'cancelFoodAnalysis')({ jobId });
}
export function jobEvent(job: FoodJob): AnalysisEvent {
  const base = { jobId: job.jobId, revision: 1, seq: job.seq, at: new Date(job.updatedAtMs).toISOString() };
  if (job.type === 'reading') return { ...base, type: 'reading', input: job.input || 'photo' };
  if (job.type === 'source_opened' && job.domain) return { ...base, type: 'source_opened', domain: job.domain };
  if (job.type === 'failed') return { ...base, type: 'failed', message: job.message || 'Couldnt finish that lookup. Try again.' };
  if (['preparing', 'queued', 'searching', 'validating', 'retrying', 'ready', 'cancelled', 'uploading'].includes(job.type)) return { ...base, type: job.type } as AnalysisEvent;
  return { ...base, type: 'reading', input: job.input || 'photo' };
}
