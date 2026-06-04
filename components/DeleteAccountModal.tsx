/**
 * DeleteAccountModal — two-step account deletion confirmation.
 *
 * Required by Apple App Store Guideline 5.1.1(v) and Google Play (May 2024).
 *
 * Flow:
 *   1. Warning screen describing what will be deleted.
 *   2. Confirmation screen — user must type DELETE to enable the destroy button.
 *   3. On confirm: call the `deleteAccount` Cloud Function, then sign out.
 *
 * The Cloud Function handles the actual data wipe (Firestore + Storage + Auth).
 * The client just confirms intent.
 */

import React, { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { signOut } from 'firebase/auth';
import { functions, auth } from '../services/firebase';
import { X, AlertTriangle, Loader2 } from 'lucide-react';

interface DeleteAccountModalProps {
  onClose: () => void;
  onDeleted: () => void;
}

export const DeleteAccountModal: React.FC<DeleteAccountModalProps> = ({ onClose, onDeleted }) => {
  const [step, setStep] = useState<'warn' | 'confirm'>('warn');
  const [typed, setTyped] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');

  const canDelete = typed.trim().toUpperCase() === 'DELETE';

  const handleDelete = async () => {
    if (!canDelete || !functions || !auth) return;
    setError('');
    setIsDeleting(true);
    try {
      const fn = httpsCallable<{ confirm: string }, { success: boolean }>(
        functions,
        'deleteAccount',
      );
      await fn({ confirm: 'DELETE' });

      // Wipe any cached state for this user, sign out, hand control back to the app.
      const uid = auth.currentUser?.uid;
      if (uid) {
        try { localStorage.removeItem(`dings_app_state_${uid}`); } catch {}
        try { localStorage.removeItem(`dings_workout_split_${uid}`); } catch {}
      }
      // Also clear legacy global keys from pre-namespacing versions of the app.
      try { localStorage.removeItem('dings_app_state'); } catch {}
      try { localStorage.removeItem('dings_workout_split'); } catch {}
      try { await signOut(auth); } catch {}

      onDeleted();
    } catch (err: any) {
      console.error('Account deletion failed', err);
      const code = err?.code as string | undefined;
      if (code === 'functions/unauthenticated') {
        setError('Your session expired. Please sign out and back in, then try again.');
      } else {
        setError(err?.message || 'Could not delete your account. Please try again or email support.');
      }
      setIsDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.85)' }}
      onClick={(e) => { if (e.target === e.currentTarget && !isDeleting) onClose(); }}
    >
      <div
        className="w-full sm:max-w-md glass rounded-t-3xl sm:rounded-3xl flex flex-col overflow-hidden"
        style={{
          maxHeight: '90vh',
          borderTop: '1px solid rgba(239,68,68,0.25)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 0 60px rgba(239,68,68,0.1)',
          background: '#0a0a0a',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
          <span className="text-[10px] font-mono text-red-500 uppercase tracking-widest font-bold">
            Delete Account
          </span>
          {!isDeleting && (
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </div>

        <div className="overflow-y-auto px-6 pb-8 space-y-5">
          {step === 'warn' && (
            <>
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-500/5 border border-red-500/20">
                <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <p className="text-sm text-gray-200 leading-relaxed">
                  This permanently deletes your account and <span className="text-white font-semibold">cannot be undone</span>.
                </p>
              </div>

              <div>
                <p className="text-xs text-gray-500 uppercase tracking-widest font-bold mb-3">
                  What gets erased
                </p>
                <ul className="text-sm text-gray-300 space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="text-red-500 mt-0.5">•</span>
                    <span>Your profile, weight history, body composition data</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-500 mt-0.5">•</span>
                    <span>Every food log, meal, and macro entry</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-500 mt-0.5">•</span>
                    <span>Your workout split and exercise history</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-500 mt-0.5">•</span>
                    <span>Saved notes, milestones, and AI coach history</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-500 mt-0.5">•</span>
                    <span>Your login credentials</span>
                  </li>
                </ul>
              </div>

              <p className="text-xs text-gray-500 leading-relaxed">
                If you just want to take a break, sign out instead — your data will be here when you come back.
              </p>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={onClose}
                  className="flex-1 py-3 rounded-xl border border-white/10 text-gray-300 font-bold uppercase tracking-widest text-xs hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setStep('confirm')}
                  className="flex-1 py-3 rounded-xl bg-red-500/10 text-red-400 border border-red-500/30 font-bold uppercase tracking-widest text-xs hover:bg-red-500/20 transition-colors"
                >
                  Continue
                </button>
              </div>
            </>
          )}

          {step === 'confirm' && (
            <>
              <p className="text-sm text-gray-200 leading-relaxed">
                Type <span className="font-mono font-bold text-red-400">DELETE</span> below to confirm. This is final.
              </p>

              <input
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="DELETE"
                disabled={isDeleting}
                autoFocus
                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white font-mono tracking-widest text-center text-lg focus:outline-none focus:border-red-500/50 disabled:opacity-50"
              />

              {error && (
                <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                  {error}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => { setStep('warn'); setTyped(''); setError(''); }}
                  disabled={isDeleting}
                  className="flex-1 py-3 rounded-xl border border-white/10 text-gray-300 font-bold uppercase tracking-widest text-xs hover:bg-white/5 transition-colors disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  onClick={handleDelete}
                  disabled={!canDelete || isDeleting}
                  className="flex-1 py-3 rounded-xl bg-red-500 text-white font-bold uppercase tracking-widest text-xs hover:bg-red-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Deleting</span>
                    </>
                  ) : (
                    <span>Delete Forever</span>
                  )}
                </button>
              </div>

              <p className="text-[10px] text-gray-600 text-center leading-relaxed">
                Need help? Email <span className="text-gray-400">support@dings.fitness</span> instead.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default DeleteAccountModal;
