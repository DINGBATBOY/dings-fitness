import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { defineSecret } from 'firebase-functions/params';
import OpenAI from 'openai';
import { requireAiConsent } from './aiPolicy';

type JobState = 'queued' | 'running' | 'ready' | 'failed' | 'cancelled';
const terminal = (state: JobState) => ['ready', 'failed', 'cancelled'].includes(state);
const jobKey = (uid: string, id: unknown) => {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(id)) throw new HttpsError('invalid-argument', 'Invalid food draft.');
  return `${uid}_${id}`;
};

/** Reject missing/invalid required values instead of quietly manufacturing zero. */
export function validateFoodResult(text: string) {
  const raw = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
  if (!Array.isArray(raw.items) || raw.items.length > 40) throw new Error('Invalid food result');
  const nutrient = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  for (const item of raw.items) {
    if (typeof item.name !== 'string' || !item.name.trim() || item.name.length > 250) throw new Error('Missing food name');
    for (const key of ['calories', 'protein', 'carbs', 'fat']) if (!nutrient(item[key])) throw new Error('Invalid nutrition values');
    if (item.fiber != null && !nutrient(item.fiber)) throw new Error('Invalid fiber');
    if (item.servingsConsumed != null && (!nutrient(item.servingsConsumed) || item.servingsConsumed <= 0)) throw new Error('Invalid serving');
    if (item.ingredients != null) {
      if (!Array.isArray(item.ingredients) || item.ingredients.length > 60) throw new Error('Invalid ingredients');
      for (const ingredient of item.ingredients) {
        if (typeof ingredient.name !== 'string' || !ingredient.name.trim()) throw new Error('Invalid ingredient name');
        for (const key of ['grams', 'calories', 'protein', 'carbs', 'fat']) if (!nutrient(ingredient[key])) throw new Error('Invalid ingredient values');
        if (ingredient.fiber != null && !nutrient(ingredient.fiber)) throw new Error('Invalid ingredient fiber');
      }
    }
  }
  return raw;
}

export function registerFoodJobs(config: {
  apiKey: ReturnType<typeof defineSecret>;
  model: string;
  consumeQuota: (uid: string) => Promise<unknown>;
  recordUsage: (uid: string, response: any, elapsed: number) => Promise<void>;
}) {
  const startFoodAnalysis = onCall({ secrets: [config.apiKey], timeoutSeconds: 60, memory: '512MiB', cors: true }, async req => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in again to check your food.');
    const uid = req.auth.uid;
    const id = req.data?.jobId;
    const ref = getFirestore().collection('foodAnalysisJobs').doc(jobKey(uid, id));
    const existing = await ref.get();
    if (existing.exists) return { jobId: id };
    await requireAiConsent(uid, 'Allow AI food analysis first.');
    const messages = req.data?.messages;
    if (!Array.isArray(messages) || !messages.length || messages.length > 4) throw new HttpsError('invalid-argument', 'Add a photo or description.');
    const payload = JSON.stringify(messages);
    if (Buffer.byteLength(payload) > 9 * 1024 * 1024) throw new HttpsError('invalid-argument', 'Use fewer photos for this meal.');
    await config.consumeQuota(uid);
    // Unique storage object avoids concurrent retries overwriting input of an accepted job.
    const inputPath = `foodAnalysisInputs/${uid}/${id}-${crypto.randomUUID()}.json`;
    const file = getStorage().bucket().file(inputPath);
    await file.save(payload, { resumable: false, contentType: 'application/json' });
    try {
      await ref.create({ uid, jobId: id, inputPath, state: 'queued', type: 'queued',
        input: req.data?.hasImages ? 'photo' : 'text', seq: 0,
        createdAtMs: Date.now(), updatedAtMs: Date.now(), expiresAtMs: Date.now() + 48 * 60 * 60 * 1000 });
    } catch (err) {
      await file.delete({ ignoreNotFound: true });
      if (!(await ref.get()).exists) throw err;
    }
    return { jobId: id };
  });

  const cancelFoodAnalysis = onCall({ cors: true }, async req => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
    const ref = getFirestore().collection('foodAnalysisJobs').doc(jobKey(req.auth.uid, req.data?.jobId));
    await getFirestore().runTransaction(async tx => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) {
        // A cancellation can beat the upload acknowledgement. Reserve the ID so
        // a late start cannot create work after the user has stopped it.
        tx.create(ref, { uid: req.auth!.uid, jobId: req.data.jobId, state: 'cancelled', type: 'cancelled', seq: 0,
          createdAtMs: Date.now(), updatedAtMs: Date.now(), expiresAtMs: Date.now() + 48 * 60 * 60 * 1000 });
        return;
      }
      if (terminal(snapshot.get('state'))) return;
      tx.update(ref, { state: 'cancelled', type: 'cancelled', seq: Number(snapshot.get('seq')) + 1, updatedAtMs: Date.now() });
    });
    return { cancelled: true };
  });

  const processFoodAnalysis = onDocumentCreated({ document: 'foodAnalysisJobs/{id}', secrets: [config.apiKey], timeoutSeconds: 120, memory: '512MiB', retry: false }, async event => {
    if (!event.data) return;
    const ref = event.data.ref;
    const data = event.data.data();
    const claimed = await getFirestore().runTransaction(async tx => {
      const current = await tx.get(ref);
      if (current.get('state') !== 'queued') return false;
      tx.update(ref, { state: 'running', type: 'reading', seq: 1, updatedAtMs: Date.now() });
      return true;
    });
    if (!claimed) {
      // Firestore delivery is at least once. A duplicate must not delete a live worker's input.
      const current = await ref.get();
      if ((!current.exists || terminal(current.get('state'))) && data.inputPath) await getStorage().bucket().file(data.inputPath).delete({ ignoreNotFound: true });
      return;
    }
    const controller = new AbortController();
    const remaining = Math.max(1, 90_000 - (Date.now() - data.createdAtMs));
    const deadline = setTimeout(() => controller.abort(), remaining);
    const unsubscribe = ref.onSnapshot(snapshot => {
      if (!snapshot.exists || snapshot.get('state') === 'cancelled') controller.abort();
    }, () => controller.abort());
    async function publish(patch: Record<string, unknown>) {
      return getFirestore().runTransaction(async tx => {
        const current = await tx.get(ref);
        if (!current.exists || terminal(current.get('state'))) return false;
        tx.update(ref, { ...patch, seq: Number(current.get('seq')) + 1, updatedAtMs: Date.now() });
        return true;
      });
    }
    try {
      const [buffer] = await getStorage().bucket().file(data.inputPath).download();
      const messages = JSON.parse(buffer.toString());
      const input = messages.map((m: any) => ({
        role: m.role === 'system' ? 'developer' : m.role,
        content: (typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content).map((part: any) =>
          part.type === 'image_url' ? { type: 'input_image', image_url: part.image_url.url, detail: 'high' } : { type: 'input_text', text: String(part.text ?? '') }),
      }));
      const client = new OpenAI({ apiKey: config.apiKey.value(), maxRetries: 0 });
      let response: any;
      let searchVisible = false;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const stream = await (client as any).responses.create({ model: config.model, input,
            reasoning: { effort: 'medium' }, tools: [{ type: 'web_search' }], stream: true,
          }, { signal: controller.signal });
          for await (const chunk of stream) {
            if (chunk.type === 'response.web_search_call.searching' && !searchVisible) {
              searchVisible = true;
              await publish({ type: 'searching' });
            }
            // A query string is not proof a page was read. Only use an actual open_page action.
            if (chunk.type === 'response.output_item.done' && chunk.item?.type === 'web_search_call' && chunk.item.action?.type === 'open_page') {
              try {
                const page = new URL(chunk.item.action.url);
                if (page.protocol === 'https:' || page.protocol === 'http:') await publish({ type: 'source_opened', domain: page.hostname.replace(/^www\./, '') });
              } catch { /* No validated domain: keep generic status. */ }
            }
            if (chunk.type === 'response.completed') response = chunk.response;
            if (chunk.type === 'response.failed' || chunk.type === 'response.incomplete' || chunk.type === 'error') throw new Error('Incomplete analysis');
          }
          if (!response) throw new Error('No completed analysis');
          break;
        } catch (err: any) {
          if (controller.signal.aborted || attempt > 0 || Date.now() - data.createdAtMs > 45_000 || !(err?.status === 429 || err?.status >= 500)) throw err;
          await publish({ type: 'retrying' });
          searchVisible = false;
        }
      }
      await publish({ type: 'validating' });
      const text = response.output_text || (response.output ?? []).filter((o: any) => o.type === 'message').flatMap((o: any) => o.content ?? []).map((c: any) => c.text || '').join('');
      const result = validateFoodResult(text);
      const sources = new Map<string, { url: string; title?: string }>();
      for (const output of response.output ?? []) for (const part of output.content ?? []) for (const citation of part.annotations ?? []) {
        if (citation.type === 'url_citation' && typeof citation.url === 'string') {
          try { const u = new URL(citation.url); if (['https:', 'http:'].includes(u.protocol)) sources.set(u.href, { url: u.href, title: citation.title || u.hostname }); } catch { /* Invalid evidence URL. */ }
        }
      }
      const normalized = JSON.parse(JSON.stringify({ ...result, webSources: [...sources.values()].slice(0, 8), pipeline: 'search' }));
      if (Buffer.byteLength(JSON.stringify(normalized)) > 450_000) throw new Error('Food result too large');
      await publish({ state: 'ready', type: 'ready', result: normalized });
      await config.recordUsage(data.uid, response, Date.now() - data.createdAtMs).catch(err => console.error('[foodJob] usage recording failed', err));
    } catch (err) {
      console.error('[foodJob] analysis failed', data.jobId, err instanceof Error ? err.message : 'unknown');
      await publish({ state: 'failed', type: 'failed', message: controller.signal.aborted ? 'That took too long. Your food is still here. Try again.' : 'Couldnt finish that lookup. Your food is still here. Try again or enter the numbers yourself.' });
    } finally {
      clearTimeout(deadline);
      unsubscribe();
      await getStorage().bucket().file(data.inputPath).delete({ ignoreNotFound: true }).catch(() => {});
    }
  });

  // Bounds retention and recovers jobs orphaned by a crashed worker or trigger delivery failure.
  const cleanFoodAnalysis = onSchedule('every 60 minutes', async () => {
    const collection = getFirestore().collection('foodAnalysisJobs');
    const [stale, expired] = await Promise.all([
      collection.where('state', 'in', ['queued', 'running']).where('updatedAtMs', '<', Date.now() - 120_000).limit(200).get(),
      collection.where('expiresAtMs', '<', Date.now()).limit(400).get(),
    ]);
    const jobs = new Map([...stale.docs, ...expired.docs].map(job => [job.id, job]));
    for (const job of jobs.values()) {
      const data = job.data();
      if (!terminal(data.state)) await getFirestore().runTransaction(async tx => {
        const current = await tx.get(job.ref);
        if (!current.exists || terminal(current.get('state'))) return;
        tx.update(job.ref, { state: 'failed', type: 'failed', message: 'That took too long. Try again.', seq: Number(current.get('seq')) + 1, updatedAtMs: Date.now() });
      });
      if (data.inputPath) await getStorage().bucket().file(data.inputPath).delete({ ignoreNotFound: true }).catch(() => {});
      if (data.expiresAtMs < Date.now()) await job.ref.delete();
    }
    // Also collect uploads whose callable crashed before creating a job document.
    // This private prefix is denied to client SDKs by the existing Storage rules.
    const cursorRef = getFirestore().collection('foodAnalysisMaintenance').doc('cleanup');
    const cursor = (await cursorRef.get()).get('pageToken') as string | undefined;
    const [files, next] = await getStorage().bucket().getFiles({ prefix: 'foodAnalysisInputs/', autoPaginate: false, maxResults: 250, ...(cursor ? { pageToken: cursor } : {}) });
    for (const file of files) {
      const created = Date.parse(String(file.metadata.timeCreated || ''));
      if (Number.isFinite(created) && created < Date.now() - 2 * 60 * 60 * 1000) await file.delete({ ignoreNotFound: true });
    }
    await cursorRef.set({ pageToken: next?.pageToken || null });
  });
  return { startFoodAnalysis, cancelFoodAnalysis, processFoodAnalysis, cleanFoodAnalysis };
}
