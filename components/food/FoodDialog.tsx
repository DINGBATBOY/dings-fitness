import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

/** Native modal semantics: focus containment, inert background and focus return. */
export function FoodDialog({ open, onClose, title = 'Your food', children, resetKey, closeLabel = 'Close and keep food draft' }: {
  open: boolean; onClose: () => void; title?: string; children: React.ReactNode; resetKey?: string; closeLabel?: string;
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
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-5 py-2">
        <p className="text-base font-semibold text-[#c4b8a4]">{title}</p>
        <button type="button" autoFocus onClick={onClose} aria-label={closeLabel} className="flex h-11 w-11 items-center justify-center rounded-xl text-[#f5ede1]"><X size={22} aria-hidden="true" /></button>
      </header>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">{open && children}</div>
    </div>
  </dialog>;
}
