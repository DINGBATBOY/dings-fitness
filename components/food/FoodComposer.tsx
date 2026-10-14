import React, { useEffect, useRef, useState } from 'react';
import { Camera as CameraIcon, Star } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { FoodDialog } from './FoodDialog';
import { FoodEntry, AnalysisProgress, MealReview, type AnalysisEvent } from './FoodFlow';
import { FoodEditor, type FoodEditorDraft } from './FoodEditor';
import { RestaurantHub } from '../RestaurantHub';
import { lookupBarcode } from '../../services/geminiService';
import { fromAnalysis, fromSavedFood, toSavedFood, type ReviewFood } from '../../services/foodDraft';
import { readFoodDraft, writeFoodDraft } from '../../services/foodDraftStore';
import { startFoodJob, recoverFoodJob, watchFoodJob, cancelFoodJob, jobEvent } from '../../services/foodAnalysisJobs';
import type { AppState, FoodItem, HistoryEntry, NutritionTargets } from '../../types';

type Draft = {
  id: string; text: string; photos: { id: string; url: string }[]; items: ReviewFood[];
  logDate: string; jobId?: string; correctionId?: string; startedAt?: number;
  attempted?: boolean;
  request?: { id: string; description: string; correctionId?: string };
  editor?: { itemId: string | null; fields: FoodEditorDraft };
};
export type FoodSeed = { id: string; items: FoodItem[] };
export type FoodStatus = 'empty' | 'draft' | 'analyzing' | 'ready';
const freshDraft = (): Draft => ({ id: crypto.randomUUID(), text: '', photos: [], items: [], logDate: new Date().toLocaleDateString() });
// An empty composer can sit open overnight. Start the date when food is first entered.
const beginInput = (draft: Draft): Draft => draft.text.trim() || draft.photos.length || draft.items.length ||
  (draft.editor && (draft.editor.fields.name.trim() || Object.values(draft.editor.fields.values).some(value => value.trim())))
  ? draft : { ...draft, logDate: new Date().toLocaleDateString() };
const action = 'min-h-11 rounded-xl border border-[#c4b8a4]/50 px-4 py-3 text-base';

function cleanError(error: unknown) {
  const e = error as { code?: string; message?: string };
  if (e.code?.includes('not-found')) return 'Food analysis needs a service update. Your draft is safe; you can enter macros yourself.';
  if (e.code?.includes('unauthenticated')) return 'Sign in again to check your food. Your draft is still here.';
  if (e.code?.includes('resource-exhausted')) return 'Youve reached todays analysis limit. Your usuals and manual entry still work.';
  if (e.code?.includes('unavailable') || e.code?.includes('deadline')) return 'Connection trouble. Your food is still here. Try again when youre online.';
  return e.message || 'Couldnt finish that. Your food is still here. Try again.';
}

async function prepareImage(file: File): Promise<string> {
  if (file.size > 20 * 1024 * 1024) throw new Error('That photo is too large. Choose one under 20 MB.');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Couldnt read that photo. Try another one.'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('Couldnt read that photo. Try a JPG or PNG.'));
      image.onload = () => {
        const scale = Math.min(1, 1536 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Couldnt prepare that photo. Try another one.'));
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function FoodComposer({ uid, open, onClose, onOpen, seed, onSeedConsumed, onStatus,
  onSave, history, onFavorite, onRemoveHistory, targets, consumed, customMenuItems, requireConsent,
}: {
  uid: string; open: boolean; onClose: () => void; onOpen: () => void;
  seed: FoodSeed | null; onSeedConsumed: () => void; onStatus: (status: FoodStatus) => void;
  onSave: (items: FoodItem[], label: string, date: string) => Promise<void>;
  history: HistoryEntry[]; onFavorite: (id: string) => void; onRemoveHistory: (id: string) => void;
  targets: NutritionTargets; consumed: { calories: number; protein: number; carbs: number; fat: number };
  customMenuItems?: AppState['customMenuItems']; requireConsent: (action: () => void) => void;
}) {
  const [draft, setDraft] = useState<Draft>(freshDraft);
  const current = useRef(draft); current.current = draft;
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<'entry' | 'review' | 'editor' | 'menus' | 'barcode'>('entry');
  const [editing, setEditing] = useState<string | null>(null);
  const [event, setEvent] = useState<AnalysisEvent | null>(null);
  const [localBusy, setLocalBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState('');
  const [storageError, setStorageError] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [barcode, setBarcode] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const [now, setNow] = useState(Date.now());
  const upload = useRef<HTMLInputElement>(null);
  const takePhoto = useRef<HTMLInputElement>(null);
  const operation = useRef(0);
  const alive = useRef(true);
  const requestLock = useRef(false);
  const pending = localBusy || !!draft.jobId;
  useEffect(() => {
    alive.current = true;
    let mounted = true;
    readFoodDraft<Draft>(uid).then(saved => {
      if (!mounted) return;
      if (saved?.id && Array.isArray(saved.photos) && Array.isArray(saved.items)) {
        setDraft(saved); setView(saved.editor ? 'editor' : saved.items.length ? 'review' : 'entry');
        setEditing(saved.editor?.itemId ?? null);
        if (saved.request && !saved.jobId && navigator.onLine) {
          const request = saved.request;
          // Never block access to a local draft on a network read.
          void recoverFoodJob(uid, request.id).then(found => {
            if (mounted && found) setDraft(d => d.request?.id === request.id
              ? { ...d, jobId: request.id, correctionId: request.correctionId } : d);
          });
        }
      }
    }).catch(() => { if (mounted) setStorageError('Device storage is unavailable. Keep Ding open until youve logged this food.'); })
      .finally(() => { if (mounted) setLoaded(true); });
    return () => { mounted = false; alive.current = false; operation.current++; };
  }, [uid]);
  useEffect(() => {
    if (!loaded) return;
    writeFoodDraft(uid, draft).catch(() => setStorageError('Couldnt keep this draft on your device. Keep Ding open until youve logged it.'));
  }, [draft, loaded, uid]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [pending]);
  useEffect(() => {
    if (!loaded) return;
    onStatus(pending ? 'analyzing' : draft.items.length ? 'ready' : draft.text.trim() || draft.photos.length || draft.editor ? 'draft' : 'empty');
  }, [loaded, pending, draft.items.length, draft.photos.length, draft.text, draft.editor, onStatus]);
  useEffect(() => {
    if (!draft.jobId || !loaded) return;
    let lastSeq = -1;
    return watchFoodJob(uid, draft.jobId, job => {
      if (!job) { setError('That analysis is no longer available. Your input is still here.'); setDraft(d => ({ ...d, jobId: undefined })); return; }
      if (job.seq <= lastSeq) return;
      lastSeq = job.seq;
      setEvent(jobEvent(job));
      if (job.state === 'ready' && job.result) {
        try {
          const items = fromAnalysis(job.result);
          if (!items.length) throw new Error('I couldnt identify the food. Add a few words or another photo and try again.');
          setDraft(d => ({ ...d, jobId: undefined, request: undefined, correctionId: undefined,
            items: d.correctionId ? d.items.flatMap(item => item.id === d.correctionId ? items : [item]) : items }));
          setView('review'); setEvent(null); setError('');
        } catch (err) { setError(cleanError(err)); setDraft(d => ({ ...d, jobId: undefined, request: undefined })); setEvent(null); }
      } else if (job.state === 'failed' || job.state === 'cancelled') {
        setDraft(d => ({ ...d, jobId: undefined, request: undefined })); setStopping(false);
      }
    }, err => setError(cleanError(err)));
  }, [draft.jobId, loaded, uid]);

  const hasDraft = !!(draft.text.trim() || draft.photos.length || draft.items.length || draft.editor || pending);
  function acceptSeed() {
    if (!seed || pending) return;
    setDraft({ ...freshDraft(), items: seed.items.map(fromSavedFood) });
    setView('review'); setEvent(null); setError(''); onSeedConsumed();
  }
  useEffect(() => { if (loaded && seed && !hasDraft) acceptSeed(); }, [loaded, seed?.id]);

  async function addPhotos(files: File[]) {
    if (pending) return;
    const token = ++operation.current;
    setLocalBusy(true); setError('');
    try {
      const remaining = 4 - current.current.photos.length;
      if (files.length > remaining) throw new Error('Up to 4 photos per meal. Remove one before adding more.');
      const photos = await Promise.all(files.map(async file => ({ id: crypto.randomUUID(), url: await prepareImage(file) })));
      if (alive.current && token === operation.current) setDraft(d => ({ ...beginInput(d), request: undefined, photos: [...d.photos, ...photos] }));
    } catch (err) { if (alive.current) setError(cleanError(err)); }
    finally { if (alive.current && token === operation.current) setLocalBusy(false); }
  }
  async function camera() {
    if (!Capacitor.isNativePlatform()) { takePhoto.current?.click(); return; }
    try {
      const photo = await Camera.getPhoto({ source: CameraSource.Camera, resultType: CameraResultType.Uri, quality: 85, width: 1536, correctOrientation: true });
      if (photo.webPath) {
        const blob = await (await fetch(photo.webPath)).blob();
        await addPhotos([new File([blob], 'food.jpg', { type: blob.type || 'image/jpeg' })]);
      }
    } catch (err) {
      if (!/cancel/i.test(String((err as Error)?.message))) setError('Camera access is off or unavailable. Use Photos or type it here.');
    }
  }
  async function analyze(correctionId?: string, correction?: string) {
    if (requestLock.current || pending) return;
    if (!navigator.onLine) { setError('Youre offline. Your draft is here; reconnect to check it.'); return; }
    const snapshot = current.current;
    if (!snapshot.text.trim() && !snapshot.photos.length && !correction) return;
    requestLock.current = true;
    const token = ++operation.current;
    const description = correctionId ? `Correct ONLY this food: ${snapshot.items.find(i => i.id === correctionId)?.name}. User correction: ${correction}. Other foods visible in the photo must NOT be returned. Original meal note: ${snapshot.text}` : snapshot.text;
    const request = !correctionId && snapshot.request ? snapshot.request : { id: crypto.randomUUID(), description, correctionId };
    const jobId = request.id;
    setLocalBusy(true); setError(''); setNow(Date.now());
    setEvent({ jobId, revision: 1, seq: 0, at: new Date().toISOString(), type: 'preparing' });
    const submitting = { ...snapshot, request, startedAt: Date.now(), attempted: true };
    setDraft(submitting);
    try {
      // Save the id BEFORE sending so a lost acknowledgement can be recovered or retried.
      await writeFoodDraft(uid, submitting).catch(() => setStorageError('Couldnt keep the job on your device. Keep Ding open until youve logged it.'));
      if (!alive.current || token !== operation.current) return;
      await startFoodJob(jobId, snapshot.photos.map(p => p.url), request.description);
      if (!alive.current || token !== operation.current) { await cancelFoodJob(jobId); return; }
      const accepted = { ...current.current, jobId, correctionId: request.correctionId };
      // Persist the accepted job before offering safe backgrounding.
      setDraft(accepted);
      await writeFoodDraft(uid, accepted).catch(() => setStorageError('Couldnt keep the job on your device. Keep Ding open until youve logged it.'));
    } catch (err) {
      if (alive.current && token === operation.current) { setError(cleanError(err)); setEvent(null); }
    } finally {
      if (token === operation.current) requestLock.current = false;
      if (alive.current && token === operation.current) setLocalBusy(false);
    }
  }
  async function stop() {
    setStopping(true); setError('');
    try {
      const id = draft.jobId || draft.request?.id;
      if (id) await cancelFoodJob(id);
      operation.current++; requestLock.current = false; setLocalBusy(false);
      setDraft(d => ({ ...d, jobId: undefined, request: undefined }));
      setEvent(id ? { jobId: id, revision: 1, seq: 0, at: new Date().toISOString(), type: 'cancelled' } : null);
    } catch (err) { setError(cleanError(err)); }
    finally { setStopping(false); }
  }
  async function findBarcode(code: string) {
    if (!code.trim() || requestLock.current) return;
    requestLock.current = true;
    const token = ++operation.current;
    setLocalBusy(true); setError('');
    setEvent({ jobId: 'barcode', revision: 1, seq: 0, at: new Date().toISOString(), type: 'reading', input: 'barcode' });
    try {
      const result = await lookupBarcode(code.trim());
      if (!alive.current || operation.current !== token) return;
      const p = result.product;
      const macros = p?.perServing ?? p?.per100g;
      if (!p || !result.found || !macros) throw new Error('Couldnt find that one. Use Take a photo to show me the nutrition label.');
      const basePortion = p.perServing ? p.servingSize || '1 serving (check the package)' : '100 g';
      setDraft(d => ({ ...beginInput(d), request: undefined, items: [...d.items, { id: crypto.randomUUID(), name: p.brand ? `${p.brand} ${p.name}` : p.name,
        base: macros, basePortion, baseGrams: p.perServing ? undefined : 100, quantity: 1, source: 'barcode',
        evidence: { kind: 'database', summary: `${p.source === 'usda' ? 'USDA' : 'Open Food Facts'} label record. Check the package and amount.`,
          sources: p.sourceUrl ? [{ title: 'Product nutrition record', url: p.sourceUrl }] : [] } }] }));
      setView('review');
    } catch (err) { if (alive.current && operation.current === token) { setError(cleanError(err)); setView('entry'); } }
    finally { if (operation.current === token) requestLock.current = false; if (alive.current && operation.current === token) { setLocalBusy(false); setEvent(null); } }
  }
  async function scanBarcode() {
    if (!Capacitor.isNativePlatform()) { setView('barcode'); return; }
    try {
      const { CapacitorBarcodeScanner, CapacitorBarcodeScannerTypeHint } = await import('@capacitor/barcode-scanner');
      const result = await CapacitorBarcodeScanner.scanBarcode({ hint: CapacitorBarcodeScannerTypeHint.ALL, scanInstructions: 'Point at the barcode on the package' });
      if (result.ScanResult) await findBarcode(result.ScanResult);
    } catch (err) { if (!/cancel/i.test(String((err as Error)?.message))) { setError('Camera unavailable. Enter the barcode number here.'); setView('barcode'); } }
  }
  const usuals = [...history].sort((a, b) => Number(!!b.favorited) - Number(!!a.favorited));
  const progress = event && (pending || event.type === 'failed' || event.type === 'cancelled');
  return <FoodDialog open={open} onClose={onClose} resetKey={!loaded ? 'loading' : progress ? 'analysis' : view}>
    {!loaded ? <p role="status">Getting your food ready…</p> : <>
      {storageError && <p role="alert" className="mb-4 text-sm text-[#e8a85a]">{storageError}</p>}
      {error && <p role="alert" className="mb-4 rounded-xl border border-[#e8a85a]/50 p-3 text-base text-[#f5ede1]">{error}</p>}
      {seed && hasDraft ? <div className="space-y-4 text-[#f5ede1]">
        <h2 className="text-2xl font-bold">Youve got food in progress</h2>
        <p>Keep your current draft, or use this meal instead.</p>
        <button type="button" className={action} onClick={onSeedConsumed}>Keep my draft</button>
        <button type="button" disabled={pending} className={action} onClick={acceptSeed}>Use selected meal</button>
        {pending && <p className="text-sm text-[#c4b8a4]">Finish or stop the current analysis first.</p>}
      </div> : progress ? <>
        <AnalysisProgress event={event} photo={draft.photos[0]?.url} delayed={now - (draft.startedAt || now) > 40_000}
          connection={online ? 'online' : 'offline'} backgroundSafe={!!draft.jobId && !storageError}
          onMinimize={onClose} onCancel={() => void stop()} onRetry={() => { setEvent(null); setView(draft.items.length ? 'review' : 'entry'); }}
          onReview={() => { setEvent(null); setView('review'); }} onManual={() => { setEvent(null); setEditing(null); setView('editor'); }} />
        {!draft.jobId && pending && <p className="mt-3 text-sm text-[#c4b8a4]">Keep Ding open while this starts.</p>}
        {stopping && <p role="status" className="mt-3 text-[#c4b8a4]">Stopping…</p>}
        {draft.jobId && now - (draft.startedAt || now) > 95_000 && <p className="mt-3 text-sm text-[#c4b8a4]">Still waiting for confirmation. You can stop this attempt and try again.</p>}
      </> : view === 'editor' ? <FoodEditor key={editing || 'new'} item={draft.items.find(i => i.id === editing)}
        initialDraft={draft.editor?.itemId === editing ? draft.editor.fields : undefined}
        onDraftChange={fields => setDraft(d => ({ ...beginInput(d), editor: { itemId: editing, fields } }))}
        onBack={() => { setDraft(d => ({ ...d, editor: undefined })); setView(draft.items.length ? 'review' : 'entry'); }}
        onSave={item => { setDraft(d => ({ ...d, request: undefined, editor: undefined, items: editing ? d.items.map(i => i.id === editing ? item : i) : [...d.items, item] })); setView('review'); }} />
        : view === 'menus' ? <><button type="button" className={action} onClick={() => setView('entry')}>Back to your food</button><RestaurantHub targetMacros={targets} consumedMacros={consumed} customMenuItems={customMenuItems} onLogItem={item => { setDraft(d => ({ ...beginInput(d), request: undefined, items: [...d.items, fromSavedFood(item)] })); setView('review'); }} /></>
        : view === 'barcode' ? <form className="space-y-4 text-[#f5ede1]" onSubmit={e => { e.preventDefault(); void findBarcode(barcode); }}><button type="button" className={action} onClick={() => setView('entry')}>Back</button><h2 className="text-2xl font-bold">Enter the barcode</h2><label className="block">Numbers below the bars<input autoFocus inputMode="numeric" pattern="[0-9]{8,14}" required value={barcode} onChange={e => setBarcode(e.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-[#c4b8a4]/60 bg-[#161210] p-3 text-base" /></label><button type="submit" className="min-h-14 w-full rounded-xl bg-[#d97757] font-semibold text-[#161210]">Find this food</button></form>
        : view === 'review' ? <>
          {draft.photos[0] && <img src={draft.photos[0].url} alt="Your meal" className="mb-5 h-36 w-full rounded-2xl object-cover" />}
          {draft.logDate !== new Date().toLocaleDateString() && <div className="mb-5 rounded-xl border border-[#e8a85a]/50 p-3 text-[#f5ede1]"><p>Logging to {draft.logDate}</p><button type="button" className={action} onClick={() => setDraft(d => ({ ...d, logDate: new Date().toLocaleDateString() }))}>Use today instead</button></div>}
          <MealReview items={draft.items} onQuantity={(id, quantity) => setDraft(d => ({ ...d, items: d.items.map(i => i.id === id ? { ...i, quantity } : i) }))}
            onCorrect={async (id, note) => { requireConsent(() => { onOpen(); void analyze(id, note); }); }}
            onEdit={id => { setEditing(id); setView('editor'); }} onRemove={id => setDraft(d => ({ ...d, items: d.items.filter(i => i.id !== id) }))}
            onBack={() => { setEvent(null); setView('entry'); }} onSave={async () => {
              const snapshot = current.current;
              await onSave(snapshot.items.map(item => toSavedFood(item, snapshot.id)), snapshot.items.map(i => i.name).join(', '), snapshot.logDate);
              const next = freshDraft();
              // Clear persisted draft before allowing another meal, preserving idempotency on crash.
              await writeFoodDraft(uid, next);
              setDraft(next); setView('entry'); setEvent(null); setError(''); onClose();
            }} />
        </> : <>
          {draft.items.length > 0 && <button type="button" className={`${action} mb-4 w-full text-[#f5ede1]`} onClick={() => setView('review')}>Back to your meal · {draft.items.length} items</button>}
          <FoodEntry draft={draft} onText={text => setDraft(d => ({ ...beginInput(d), request: undefined, text }))} onCamera={() => void camera()} onLibrary={() => upload.current?.click()} onBarcode={() => void scanBarcode()}
            onRemovePhoto={id => setDraft(d => ({ ...d, request: undefined, photos: d.photos.filter(p => p.id !== id) }))}
            onAnalyze={async () => { requireConsent(() => { onOpen(); void analyze(); }); }}
            onManual={() => { setEditing(null); setView('editor'); }} busy={localBusy}
            usuals={<div className="space-y-3"><h3 className="text-xl font-semibold">Your usuals</h3>{usuals.length === 0 && <p className="text-base text-[#c4b8a4]">Meals you log will show up here.</p>}
              {(showAll ? usuals : usuals.slice(0, 3)).map(entry => <div key={entry.id} className="rounded-2xl border border-white/10 p-3"><div className="flex items-center gap-2"><button type="button" className="min-h-12 flex-1 text-left" onClick={() => { setDraft(d => ({ ...beginInput(d), request: undefined, items: [...d.items, ...entry.items.map(fromSavedFood)] })); setView('review'); }}><span className="block text-base font-semibold">{entry.label}</span><span className="text-sm text-[#c4b8a4]">{Math.round(entry.totalCalories)} kcal · check amount</span></button><button type="button" aria-label={entry.favorited ? `Unfavorite ${entry.label}` : `Favorite ${entry.label}`} aria-pressed={!!entry.favorited} className="flex h-11 w-11 items-center justify-center" onClick={() => onFavorite(entry.id)}><Star size={20} fill={entry.favorited ? '#e8a85a' : 'none'} aria-hidden="true" /></button></div>{showAll && !entry.favorited && <button type="button" className="min-h-11 text-sm text-[#c4b8a4]" onClick={() => onRemoveHistory(entry.id)}>Remove from usuals</button>}</div>)}
              {usuals.length > 3 && <button type="button" className={action} onClick={() => setShowAll(v => !v)}>{showAll ? 'Show fewer' : 'See all usuals'}</button>}
              <button type="button" className={`${action} w-full`} onClick={() => setView('menus')}>Restaurant menus</button>
            </div>} />
          <input ref={upload} type="file" multiple accept="image/*" className="hidden" onChange={e => { void addPhotos(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
          <input ref={takePhoto} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { void addPhotos(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
          {hasDraft && <button type="button" className="mt-5 min-h-11 text-sm text-[#c4b8a4]" onClick={() => setDiscarding(true)}>Discard this draft</button>}
          {discarding && <div className="mt-3 rounded-xl border border-[#e8a85a]/50 p-4 text-[#f5ede1]"><p>Remove the photos, note and unsaved food?</p><div className="mt-3 flex flex-wrap gap-3"><button type="button" className={action} onClick={() => setDiscarding(false)}>Keep draft</button><button type="button" className={action} onClick={() => { setDraft(freshDraft()); setError(''); setEvent(null); setDiscarding(false); }}>Discard draft</button></div></div>}
        </>}
    </>}
  </FoodDialog>;
}

export function FoodLauncher({ status, onClick, compact = false }: { status: FoodStatus; onClick: () => void; compact?: boolean }) {
  const label = status === 'analyzing' ? 'Checking your food…' : status === 'ready' ? 'Your food is ready to check' : status === 'draft' ? 'Finish your food' : 'Show me what you ate';
  return <button type="button" onClick={onClick} className={compact ? 'flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-[#d97757] px-4 py-3 text-base font-semibold text-[#161210] shadow-lg' : 'w-full rounded-3xl border border-[#d97757]/60 bg-[#1d1815] p-5 text-left text-[#f5ede1]'}>
    <CameraIcon size={compact ? 22 : 28} className={compact ? 'shrink-0' : 'mb-3 text-[#d97757]'} aria-hidden="true" />
    <span className={compact ? '' : 'block text-[1.75rem] font-bold leading-tight'}>{label}</span>
    {!compact && <span className="mt-2 block text-base text-[#c4b8a4]">{status === 'empty' ? 'A photo, a few words. Lets figure it out.' : status === 'analyzing' ? 'Keep going. Your meal will be here.' : 'Pick up where you left off.'}</span>}
  </button>;
}
