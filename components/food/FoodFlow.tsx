/**
 * Ding! food composer UI.
 * React 19 + the repository's Tailwind 4 and lucide-react. No new dependencies.
 * Rendered inside the shared, accessible FoodDialog composer shell.
 * Parent owns media permissions, durable jobs, persistence, and detailed editing.
 */
import React, { useId, useRef, useState } from 'react';
import { Camera, ScanBarcode, ImagePlus, X, Check, LoaderCircle } from 'lucide-react';
import { sumMeal, validFood, type ReviewFood } from '../../services/foodDraft';

const focus = 'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#e8a85a]';
const button = `min-h-11 rounded-xl px-4 py-3 text-base font-semibold ${focus} disabled:opacity-50 disabled:cursor-not-allowed`;
const primary = `${button} bg-[#d97757] text-[var(--bg-dark)]`;
const secondary = `${button} border border-[var(--ink-mid)]/50 text-[var(--ink)]`;
const surface = 'rounded-3xl border border-white/10 bg-[var(--bg-card)] p-5';
const input = `w-full min-h-12 rounded-xl border border-[var(--ink-mid)]/60 bg-[var(--bg-card)] px-3 py-3 text-base text-[var(--ink)] ${focus}`;

export type FoodDraft = {
  text: string;
  photos: { id: string; url: string }[];
};

export function FoodEntry({ draft, onText, onCamera, onLibrary, onBarcode,
  onRemovePhoto, onAnalyze, onManual, usuals, busy = false, error,
}: {
  draft: FoodDraft;
  onText: (text: string) => void;
  onCamera: () => void;
  onLibrary: () => void;
  onBarcode: () => void;
  onRemovePhoto: (id: string) => void;
  onAnalyze: () => Promise<void>;
  onManual: () => void;
  usuals?: React.ReactNode;
  busy?: boolean;
  error?: string;
}) {
  const id = useId();
  const lock = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const disabled = busy || submitting;
  const ready = !!draft.text.trim() || draft.photos.length > 0;
  return (
    <section className="space-y-5 text-[var(--ink)]" aria-labelledby={`${id}-heading`}>
      <div className="rise-in relative overflow-hidden rounded-[28px] border border-[var(--line)] bg-[var(--bg-card)] p-5">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[var(--primary)] opacity-20 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -left-10 h-48 w-48 rounded-full bg-[var(--accent)] opacity-10 blur-3xl" />
        <div className="relative">
          <h2 id={`${id}-heading`} className="text-[1.75rem] font-bold leading-tight tracking-tight">Show me what you ate</h2>
          <p className="mt-1 text-base text-[var(--ink-mid)]">A photo, a few words. Lets figure it out.</p>
          <form onSubmit={async event => {
            event.preventDefault();
            if (!ready || disabled || lock.current) return;
            lock.current = true;
            setSubmitting(true);
            setSubmitError('');
            try { await onAnalyze(); }
            catch { setSubmitError('Couldnt start that. Your food is still here. Try again.'); }
            finally { lock.current = false; setSubmitting(false); }
          }} className="mt-5 space-y-4">
            <fieldset disabled={disabled} className="space-y-3">
              <legend className="sr-only">Your food</legend>
              <button type="button" onClick={onCamera} className={`tap group flex min-h-[8.5rem] w-full flex-col items-center justify-center gap-2 rounded-3xl bg-[var(--primary)] px-4 text-[var(--on-primary)] shadow-[0_12px_30px_rgba(217,119,87,0.35)] ${focus} disabled:opacity-50`}>
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/10 transition-transform duration-300 group-active:scale-90"><Camera size={30} aria-hidden="true" /></span>
                <span className="text-lg font-bold">{draft.photos.length ? 'Add another photo' : 'Take a photo'}</span>
              </button>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={onLibrary} className={`tap flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-[var(--line-strong)] bg-[var(--bg-card-soft)] px-3 text-base font-semibold ${focus}`}><ImagePlus size={20} aria-hidden="true" />Photos</button>
                <button type="button" onClick={onBarcode} className={`tap flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-[var(--line-strong)] bg-[var(--bg-card-soft)] px-3 text-base font-semibold ${focus}`}><ScanBarcode size={20} aria-hidden="true" />Barcode</button>
              </div>
              {draft.photos.length > 0 && <ul className="flex flex-wrap gap-3 pt-1" aria-label="Attached photos">
                {draft.photos.map((photo, index) => <li key={photo.id} className="rise-in relative">
                  <img src={photo.url} alt={`Food photo ${index + 1}`} className="h-24 w-24 rounded-2xl object-cover" />
                  <button type="button" onClick={() => onRemovePhoto(photo.id)} aria-label={`Remove photo ${index + 1}`} className={`absolute -right-2 -top-2 flex h-9 w-9 items-center justify-center rounded-full border border-[var(--line-strong)] bg-[var(--bg-card)] ${focus}`}><X size={18} aria-hidden="true" /></button>
                </li>)}
              </ul>}
              <label htmlFor={`${id}-note`} className="sr-only">Tell me about it</label>
              <textarea id={`${id}-note`} rows={2} value={draft.text} onChange={e => onText(e.target.value)} placeholder="Or tell me: chicken bowl, extra rice, ate about half" className={`${input} resize-none rounded-2xl bg-[var(--bg-dark)] placeholder:text-[var(--ink-light)]`} />
            </fieldset>
            {(error || submitError) && <p role="alert" className="text-base text-[#e8a85a]">{error || submitError}</p>}
            {ready && <button type="submit" disabled={disabled} className={`${primary} rise-in min-h-14 w-full rounded-2xl`}>
              {disabled ? 'Starting…' : draft.photos.length ? `Figure out my food (${draft.photos.length} photo${draft.photos.length > 1 ? 's' : ''})` : 'Figure out my food'}
            </button>}
          </form>
        </div>
      </div>
      {usuals && <div aria-label="Recent, favorites, restaurants and quick add">{usuals}</div>}
    </section>
  );
}

// These are APP events, not verbatim provider events. The server adapter must
// validate evidence before emitting named-place or source-page messages.
export type AnalysisEvent = {
  jobId: string;
  revision: number;
  seq: number;
  at: string;
} & (
  | { type: 'preparing' }
  | { type: 'queued' }
  | { type: 'uploading' }
  | { type: 'reading'; input: 'photo' | 'text' | 'barcode' }
  | { type: 'candidate'; name: string }
  | { type: 'searching' }
  | { type: 'source_opened'; domain: string }
  | { type: 'validating' }
  | { type: 'retrying' }
  | { type: 'ready' }
  | { type: 'failed'; message: string }
  | { type: 'cancelled' }
);

function progressCopy(event: AnalysisEvent) {
  switch (event.type) {
    case 'preparing': return 'Getting your food ready…';
    case 'queued': return 'Your food is next…';
    case 'uploading': return 'Sending your photo…';
    case 'reading': return event.input === 'barcode' ? 'Looking up that barcode…' : event.input === 'text' ? 'Reading what you ate…' : 'Looking at your plate…';
    case 'candidate': return `Looks like ${event.name}. Checking…`;
    case 'searching': return 'Looking for nutrition info…';
    case 'source_opened': return `Checking ${event.domain}…`;
    case 'validating': return 'Checking the portions and totals…';
    case 'retrying': return 'That lookup didnt work. Trying another way…';
    case 'ready': return 'Got it. Take a look.';
    case 'failed': return event.message;
    case 'cancelled': return 'Stopped. Your food is still here.';
  }
}

export function AnalysisProgress({ event, photo, milestones = [], delayed = false,
  connection = 'online', backgroundSafe, onMinimize, onCancel, onRetry, onReview, onManual,
}: {
  event: AnalysisEvent;
  photo?: string;
  milestones?: string[]; // Completed facts only; never speculative timed steps.
  delayed?: boolean;
  connection?: 'online' | 'offline';
  backgroundSafe: boolean;
  onMinimize: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onReview: () => void;
  onManual: () => void;
}) {
  const id = useId();
  const pending = !['ready', 'failed', 'cancelled'].includes(event.type);
  return (
    <section aria-labelledby={`${id}-heading`} className={`${surface} space-y-5 text-[var(--ink)]`}>
      {photo && <img src={photo} alt="Your food being checked" className="h-40 w-full rounded-2xl object-cover" />}
      <p className="text-sm font-semibold text-[var(--ink-mid)]">Your food</p>
      <h2 id={`${id}-heading`} className="text-2xl font-bold">Lets figure it out</h2>
      <div role="status" aria-live="polite" aria-atomic="true" className="flex items-start gap-3">
        {pending ? <LoaderCircle className="mt-1 shrink-0 animate-spin text-[#d97757] motion-reduce:animate-none" size={20} aria-hidden="true" /> : event.type === 'ready' ? <Check className="mt-1 shrink-0 text-[#7ab896]" size={20} aria-hidden="true" /> : null}
        <p className="text-lg font-semibold">{progressCopy(event)}</p>
      </div>
      {milestones.length > 0 && <ul className="space-y-2 text-sm text-[var(--ink-mid)]">
        {milestones.slice(-2).map((line, i) => <li key={`${i}-${line}`} className="flex gap-2"><Check size={18} aria-hidden="true" className="shrink-0 text-[#7ab896]" />{line}</li>)}
      </ul>}
      {pending && <p className="text-sm text-[var(--ink-mid)]">{connection === 'offline' ? 'Connection dropped. Reconnecting to check where things are.' : delayed ? 'Taking a little longer. Your food is still here.' : 'Usually takes 10–40 seconds. Youll check it before anything gets logged.'}</p>}
      {pending && <div className="flex flex-wrap gap-3">
        {backgroundSafe && <button type="button" onClick={onMinimize} className={primary}>Keep using Ding</button>}
        <button type="button" onClick={onCancel} className={secondary}>Stop analysis</button>
      </div>}
      {event.type === 'ready' && <button type="button" onClick={onReview} className={`${primary} w-full`}>Review my food</button>}
      {(event.type === 'failed' || event.type === 'cancelled') && <div className="flex flex-wrap gap-3">
        <button type="button" onClick={onRetry} className={primary}>Try again</button>
        <button type="button" onClick={onManual} className={secondary}>Enter macros myself</button>
      </div>}
    </section>
  );
}

function sourceUrl(value: string) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined;
  } catch { return undefined; }
}

export function MealReview({ items, onQuantity, onCorrect, onEdit, onRemove,
  onSave, onBack, busy = false,
}: {
  items: ReviewFood[];
  onQuantity: (id: string, quantity: number) => void;
  // Starts a correction job; the parent retains the original until it is ready.
  onCorrect: (id: string, description: string) => Promise<void>;
  // Opens an editor INSIDE the same composer, including grams and ingredients.
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
  // Must persist with the parent's idempotency key before resolving.
  onSave: () => Promise<void>;
  onBack: () => void;
  busy?: boolean;
}) {
  const id = useId();
  const [correcting, setCorrecting] = useState<string | null>(null);
  const [correction, setCorrection] = useState('');
  const [working, setWorking] = useState<'save' | 'correct' | null>(null);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const totals = sumMeal(items);
  const valid = items.length > 0 && items.every(validFood);
  const blocked = busy || working !== null;
  const estimated = items.some(item => item.evidence.kind === 'estimate' || item.evidence.needsCheck);
  async function run(kind: 'save' | 'correct', action: () => Promise<void>) {
    if (lock.current || blocked) return;
    lock.current = true;
    setWorking(kind);
    setError('');
    try { await action(); }
    catch { setError(kind === 'save' ? 'Couldnt save that. Your review is still here. Try again.' : 'Couldnt check that change. Your original is still here. Try again.'); }
    finally { lock.current = false; setWorking(null); }
  }
  return (
    <section aria-labelledby={`${id}-heading`} className="space-y-5 text-[var(--ink)]">
      <div>
        <p className="text-sm text-[var(--ink-mid)]">{items.every(item => item.evidence.kind === 'user') ? 'Your numbers. One last look.' : estimated ? 'Heres my best read' : 'Yep okay, heres what I found'}</p>
        <h2 id={`${id}-heading`} className="mt-2 text-[1.75rem] font-bold leading-tight">{items.length === 1 ? items[0].name : `Your meal · ${items.length} items`}</h2>
      </div>
      {items.length > 0 && <div className={surface}>
        <p className="text-sm text-[var(--ink-mid)]">Meal total{estimated ? ' · estimated' : ''}</p>
        <p className="mt-1 text-4xl font-bold tabular-nums">{Math.round(totals.calories).toLocaleString()} <span className="text-base font-normal">kcal</span></p>
        <dl className="mt-4 grid grid-cols-3 gap-3">
          {([['Protein', totals.protein, '#7ab896'], ['Carbs', totals.carbs, '#e8a85a'], ['Fat', totals.fat, '#d97757']] as const).map(([label, value, color]) => <div key={label}>
            <dt className="text-sm text-[var(--ink-mid)]">{label}</dt><dd className="mt-1 text-lg font-semibold tabular-nums" style={{ color }}>{Math.round(value)} g</dd>
          </div>)}
        </dl>
      </div>}
      <fieldset disabled={blocked} className="space-y-4">
        <legend className="sr-only">Check your food and portions</legend>
        {items.map(item => <article key={item.id} className={`${surface} space-y-3`}>
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-xl font-semibold">{item.name}</h3>
            <button type="button" onClick={() => onRemove(item.id)} aria-label={`Remove ${item.name}`} className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${focus}`}><X size={20} aria-hidden="true" /></button>
          </div>
          <p className="text-base text-[var(--ink-mid)]">{item.evidence.summary}</p>
          {item.evidence.sources.length > 0 && <ul aria-label={`Sources for ${item.name}`}>
            {item.evidence.sources.slice(0, 1).map((source, i) => {
              const href = sourceUrl(source.url);
              return <li key={`${source.url}-${i}`}>{href ? <a href={href} target="_blank" rel="noopener noreferrer" className={`inline-flex min-h-11 items-center break-all text-sm text-[#e8a85a] underline ${focus}`}>Source: {new URL(href).hostname.replace(/^www\./, '')}</a> : <span className="text-sm text-[var(--ink-mid)]">{source.title}</span>}</li>;
            })}
          </ul>}
          {item.evidence.needsCheck && <p className="rounded-xl border-l-2 border-[#e8a85a] py-2 pl-3 text-base">{item.evidence.needsCheck}</p>}
          <p className="text-base">Base amount: {item.basePortion}</p>
          <fieldset className="space-y-2">
            <legend className="text-sm text-[var(--ink-mid)]">How much of that amount?</legend>
            <div className="grid grid-cols-4 gap-2">
              {[0.5, 1, 1.5, 2].map(quantity => <button key={quantity} type="button" aria-pressed={quantity === item.quantity} aria-label={`${quantity} times the base amount of ${item.name}`} onClick={() => onQuantity(item.id, quantity)} className={`${button} px-1 ${quantity === item.quantity ? 'bg-[#d97757] text-[var(--bg-dark)]' : 'border border-[var(--ink-mid)]/50'}`}>{quantity === 0.5 ? '½' : quantity === 1.5 ? '1½' : quantity}×</button>)}
            </div>
          </fieldset>
          <p className="text-sm tabular-nums text-[var(--ink-mid)]">Selected: {item.quantity}× base · {Math.round(item.base.calories * item.quantity)} kcal</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { setCorrecting(item.id); setCorrection(''); setError(''); }} className={secondary}>Thats not it</button>
            <button type="button" onClick={() => onEdit(item.id)} className={secondary}>Edit amount & macros</button>
          </div>
          {correcting === item.id && <form className="space-y-3 border-t border-white/10 pt-4" onSubmit={event => {
            event.preventDefault();
            if (!correction.trim()) return;
            void run('correct', async () => { await onCorrect(item.id, correction.trim()); setCorrecting(null); });
          }}>
            <label htmlFor={`${id}-correction`} className="block text-base">What did I miss?</label>
            <textarea id={`${id}-correction`} autoFocus rows={2} value={correction} onChange={e => setCorrection(e.target.value)} placeholder="Its tofu, not chicken. Keep the rice." className={`${input} placeholder:text-[var(--ink-mid)]`} />
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={!correction.trim()} className={primary}>Check again</button>
              <button type="button" onClick={() => setCorrecting(null)} className={secondary}>Keep original</button>
            </div>
          </form>}
          <details>
            <summary className={`flex min-h-11 cursor-pointer items-center text-sm underline underline-offset-4 ${focus}`}>How I got this</summary>
            <p className="py-2 text-sm text-[var(--ink-mid)]">{item.evidence.summary} Fiber: {item.base.fiber === undefined ? 'not available' : `${Math.round(item.base.fiber * item.quantity * 10) / 10} g`}.</p>
            {item.evidence.sources.length > 0 && <ul aria-label="Evidence links">{item.evidence.sources.map((source, index) => {
              const href = sourceUrl(source.url);
              return href ? <li key={index}><a href={href} target="_blank" rel="noopener noreferrer" className={`inline-flex min-h-11 items-center break-words text-sm text-[#e8a85a] underline ${focus}`}>{source.title}</a></li> : null;
            })}</ul>}
            {item.ingredients?.length ? <ul className="space-y-2 text-sm text-[var(--ink-mid)]">{item.ingredients.map((ingredient, index) => <li key={index} className="flex flex-wrap justify-between gap-2"><span>{ingredient.name} · {Math.round(ingredient.grams * item.quantity)} g</span><span className="tabular-nums">{Math.round(ingredient.calories * item.quantity)} kcal</span></li>)}</ul> : null}
          </details>
        </article>)}
      </fieldset>
      {!items.length && <p className="text-base text-[var(--ink-mid)]">Nothing left to log. Lets start again.</p>}
      {!valid && items.length > 0 && <p role="alert" className="text-base text-[#e8a85a]">Check the amounts before saving. Use zero only when the value is actually zero.</p>}
      {working === 'correct' && <p role="status">Checking your correction…</p>}
      {error && <p role="alert" className="text-base text-[#e8a85a]">{error}</p>}
      <footer className="sticky bottom-0 space-y-3 border-t border-white/10 bg-[var(--bg-card)] pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button type="button" disabled={!valid || blocked || correcting !== null} onClick={() => void run('save', onSave)} className={`${primary} min-h-14 w-full`}>{working === 'save' ? 'Saving…' : `Log ${items.length === 1 ? 'this food' : 'this meal'}${valid ? ` · ${Math.round(totals.calories)} kcal` : ''}`}</button>
        <button type="button" disabled={blocked} onClick={onBack} className={`${secondary} w-full`}>{items.length ? 'Back to my photo / note' : 'Add food'}</button>
      </footer>
    </section>
  );
}

