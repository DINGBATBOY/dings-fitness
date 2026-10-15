/**
 * Server-side AI policy shared by the AI callables.
 *
 * Consent: Guideline 5.1.2(i) needs explicit permission before personal data
 * goes to a third-party AI. The client shows a one-time sheet and stores
 * `profile.acceptedAiDataSharing`; the server re-checks it on every AI call
 * so an old build or a hand-made request can't skip the sheet.
 */
import { getFirestore, FieldPath } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

export const AI_CONSENT_FIELD = 'profile.acceptedAiDataSharing';

/** True when users/{uid} has accepted AI data sharing. Reads one field, not the whole (large) user doc. */
export async function hasAiConsent(uid: string): Promise<boolean> {
  const ref = getFirestore().collection('users').doc(uid);
  const [snap] = await getFirestore().getAll(ref, { fieldMask: [new FieldPath('profile', 'acceptedAiDataSharing')] });
  return snap?.get(AI_CONSENT_FIELD) === true;
}

export async function requireAiConsent(uid: string, message = 'Allow AI features first.'): Promise<void> {
  if (!(await hasAiConsent(uid))) throw new HttpsError('failed-precondition', message);
}
