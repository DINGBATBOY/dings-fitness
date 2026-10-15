import React, { useEffect, useRef } from 'react';
import { ChevronDown, CalendarDays, ArrowLeft, X } from 'lucide-react';

/**
 * Full-page Add Food shell (MacroFactor-style). Still a native modal <dialog>
 * for focus containment, inert background, Escape/back and focus return —
 * styled full-screen with a slide-up entrance in index.css (.food-dialog).
 */
export function FoodDialog({ open, onClose, title = 'Add food', children, resetKey, closeLabel = 'Close and keep food draft', dateLabel, onDateClick, onBack, backLabel = 'Back to add food' }: {
  open: boolean; onClose: () => void; title?: string; children: React.ReactNode; resetKey?: string; closeLabel?: string;
  /** Which day this logs to, e.g. "Today" or "Mon, Oct 13". */
  dateLabel?: string;
  onDateClick?: () => void;
  /** When set, the header's left button goes back a step instead of closing. */
  onBack?: () => void;
  backLabel?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    const focused = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (focused?.isConnected) focused.focus();
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const content = scrollRef.current;
    if (!content) return;
    content.scrollTop = 0;
    const heading = content.querySelector<HTMLElement>('h2');
    if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
  }, [open, resetKey]);
  useEffect(() => {
    if (!open || !window.visualViewport) return;
    const viewport = window.visualViewport;
    const resize = () => {
      ref.current?.style.setProperty('--food-height', `${viewport.height}px`);
      ref.current?.style.setProperty('--food-top', `${viewport.offsetTop}px`);
    };
    resize();
    viewport.addEventListener('resize', resize);
    viewport.addEventListener('scroll', resize);
    return () => { viewport.removeEventListener('resize', resize); viewport.removeEventListener('scroll', resize); };
  }, [open]);
  return <dialog ref={ref} aria-label={title} className="food-dialog" onCancel={e => { e.preventDefault(); closeRef.current(); }}>
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center gap-2 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
        {onBack ? (
          <button type="button" autoFocus onClick={onBack} aria-label={backLabel} className="tap flex h-11 items-center gap-1 rounded-full bg-[var(--bg-card)] pl-2.5 pr-3.5 text-sm font-semibold text-[var(--ink)]"><ArrowLeft size={20} aria-hidden="true" />Back</button>
        ) : (
          <button type="button" autoFocus onClick={onClose} aria-label={closeLabel} className="tap flex h-11 w-11 items-center justify-center rounded-full bg-[var(--bg-card)] text-[var(--ink)]"><ChevronDown size={24} aria-hidden="true" /></button>
        )}
        <p className="flex-1 text-center text-base font-bold tracking-tight">{title}</p>
        {dateLabel ? (
          <button type="button" onClick={onDateClick} disabled={!onDateClick} className="tap flex min-h-11 items-center gap-1.5 rounded-full border border-[var(--line-strong)] bg-[var(--bg-card)] px-3 text-sm font-semibold text-[var(--ink)]">
            <CalendarDays size={16} aria-hidden="true" className="text-[var(--primary)]" />{dateLabel}
          </button>
        ) : <span className="w-11" />}
        {onBack && <button type="button" onClick={onClose} aria-label={closeLabel} className="tap flex h-11 w-11 items-center justify-center rounded-full bg-[var(--bg-card)] text-[var(--ink)]"><X size={20} aria-hidden="true" /></button>}
      </header>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]">{open && children}</div>
    </div>
  </dialog>;
}
