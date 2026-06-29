
import React, { useState } from 'react';
import { auth } from '../services/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { Mail, Lock, CheckCircle2 } from 'lucide-react';
import { LegalModal } from './LegalModal';

interface AuthProps {
  onLogin: (user: any) => void;
}

type LegalTab = 'privacy' | 'terms' | 'disclaimer';

export const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [resetMsg, setResetMsg] = useState('');

  // Signup-only gates
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [legalModal, setLegalModal] = useState<LegalTab | null>(null);

  const canSubmit = isLogin || showForgot || (ageConfirmed && legalAccepted);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (showForgot) {
      handleResetPassword();
      return;
    }
    if (!isLogin && !canSubmit) {
      setError('Please confirm your age and accept the Terms of Service to continue.');
      return;
    }
    setError('');
    setIsLoading(true);

    try {
      if (!auth) {
        throw new Error("Firebase not configured. Please check services/firebase.ts");
      }

      let userCredential;
      if (isLogin) {
        userCredential = await signInWithEmailAndPassword(auth, email, password);
      } else {
        userCredential = await createUserWithEmailAndPassword(auth, email, password);
      }
      onLogin(userCredential.user);
    } catch (err: any) {
      console.error(err);
      setError(err.message.replace('Firebase: ', ''));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email) {
      setError("Please enter your email");
      return;
    }
    setError('');
    setResetMsg('');
    setIsLoading(true);
    try {
      if (!auth) throw new Error("Firebase not configured.");
      await sendPasswordResetEmail(auth, email);
      setResetMsg("Reset link sent to your email");
    } catch (err: any) {
      console.error(err);
      setError(err.message.replace('Firebase: ', ''));
    } finally {
      setIsLoading(false);
    }
  };

  const switchMode = (login: boolean) => {
    setIsLogin(login);
    setError('');
    setAgeConfirmed(false);
    setLegalAccepted(false);
  };

  return (
    <>
      {legalModal && (
        <LegalModal initialTab={legalModal} onClose={() => setLegalModal(null)} />
      )}

      <div className="fixed inset-0 bg-[#0d0a08] flex items-center justify-center p-6 z-[200] noise-bg">
        {/* Background Ambience — warmer, calmer orbs in dusk hues */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-[300px] h-[300px] bg-[#d97757] rounded-full opacity-[0.05] blur-[100px]" style={{ animation: 'orbFloat 12s ease-in-out infinite' }}></div>
          <div className="absolute bottom-[10%] right-[10%] w-[400px] h-[400px] bg-[#c97b6e] rounded-full opacity-[0.05] blur-[150px]" style={{ animation: 'orbPulse 10s ease-in-out infinite' }}></div>
          <div className="absolute top-[40%] left-[10%] w-[200px] h-[200px] bg-[#d4a55a] rounded-full opacity-[0.04] blur-[80px]" style={{ animation: 'orbDrift 14s ease-in-out infinite' }}></div>
        </div>

        <div
          className="w-full max-w-sm glass p-8 rounded-3xl relative overflow-hidden"
          style={{
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
            borderTop: '1px solid rgba(217,119,87,0.2)'
          }}
        >
          <div className="relative z-10 space-y-6">
            <div className="text-center flex flex-col items-center">
              <div className="w-12 h-12 mb-4 relative flex items-center justify-center">
                <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full fill-none" strokeWidth="4" style={{ stroke: '#d97757' }}>
                  <polygon points="50 3, 93 25, 93 75, 50 97, 7 75, 7 25" />
                </svg>
                <CheckCircle2 className="w-5 h-5" style={{ color: '#d97757' }} />
              </div>

              <h1 className="text-5xl font-orbitron font-bold text-white tracking-tighter leading-none mb-2">
                DING<span className="text-transparent bg-clip-text bg-gradient-to-r from-[#d97757] to-[#d4a55a]">!</span>
              </h1>
              <p className="text-[10px] text-gray-500 uppercase tracking-[0.2em]">Food, movement, and progress</p>

              <p className="text-[12px] text-gray-400 mt-3 min-h-4 leading-snug">
                {showForgot ? 'We will get you back in.' : (isLogin ? "Welcome back. Let's see how today is going." : 'Start simple. Log a meal, move a little, keep going.')}
              </p>
            </div>

            {!showForgot && (
              <div className="flex bg-black/40 rounded-full p-1 border border-white/5">
                <button
                  type="button"
                  onClick={() => switchMode(true)}
                  className={`flex-1 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${isLogin ? 'bg-white text-black' : 'text-gray-500 hover:text-white'}`}
                >
                  Login
                </button>
                <button
                  type="button"
                  onClick={() => switchMode(false)}
                  className={`flex-1 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${!isLogin ? 'bg-white text-black' : 'text-gray-500 hover:text-white'}`}
                >
                  Sign Up
                </button>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-red-500/10 border border-red-500/50 p-3 rounded-lg text-red-500 text-[10px] font-bold uppercase">
                  {error}
                </div>
              )}

              {resetMsg && (
                <div className="bg-green-500/10 border border-green-500/50 p-3 rounded-lg text-green-500 text-[10px] font-bold uppercase">
                  {resetMsg}
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-white uppercase tracking-widest mb-2 ml-1">Email</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Mail className="w-4 h-4 text-gray-600 group-focus-within:text-orange-500 transition-colors" />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="warrior@dings.com"
                    className="w-full bg-black/50 border-l border-white/10 rounded-xl py-4 pl-11 pr-4 text-white placeholder-gray-700 text-sm focus:outline-none focus:border-orange-500 focus:shadow-[inset_0_0_0_1px_rgba(249,115,22,0.3)] border-transparent transition-all"
                    required
                  />
                </div>
              </div>

              {!showForgot && (
                <div>
                  <label className="block text-[10px] font-bold text-white uppercase tracking-widest mb-2 ml-1">Password</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Lock className="w-4 h-4 text-gray-600 group-focus-within:text-orange-500 transition-colors" />
                    </div>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-black/50 border-l border-white/10 rounded-xl py-4 pl-11 pr-4 text-white placeholder-gray-700 text-sm focus:outline-none focus:border-orange-500 focus:shadow-[inset_0_0_0_1px_rgba(249,115,22,0.3)] border-transparent transition-all"
                      required
                    />
                  </div>
                </div>
              )}

              {/* Signup-only legal gates */}
              {!isLogin && !showForgot && (
                <div className="space-y-3 pt-1">
                  {/* The <label> + hidden <input> combo handles all clicks
                      natively — clicking ANYWHERE in the label toggles the
                      input via onChange. We must NOT add competing onClick
                      handlers on the visible div or span; in practice that
                      caused double-toggles on iOS/Safari that looked like
                      the checkbox was inert. */}
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={ageConfirmed}
                      onChange={(e) => setAgeConfirmed(e.target.checked)}
                      className="sr-only"
                    />
                    <div className="relative mt-0.5 shrink-0">
                      <div
                        className={`w-4 h-4 rounded border transition-all ${ageConfirmed ? 'bg-orange-500 border-orange-500' : 'border-gray-600 bg-black/40'}`}
                      >
                        {ageConfirmed && (
                          <svg className="w-full h-full p-0.5" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6l3 3 5-5" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <span className="text-[11px] text-gray-400 leading-snug">
                      I confirm I am <strong className="text-white">13 years of age or older</strong>
                    </span>
                  </label>

                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={legalAccepted}
                      onChange={(e) => setLegalAccepted(e.target.checked)}
                      className="sr-only"
                    />
                    <div className="relative mt-0.5 shrink-0">
                      <div
                        className={`w-4 h-4 rounded border transition-all ${legalAccepted ? 'bg-orange-500 border-orange-500' : 'border-gray-600 bg-black/40'}`}
                      >
                        {legalAccepted && (
                          <svg className="w-full h-full p-0.5" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6l3 3 5-5" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <span className="text-[11px] text-gray-400 leading-snug">
                      I agree to the{' '}
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setLegalModal('terms'); }}
                        className="text-orange-400 hover:text-orange-300 underline underline-offset-2 transition-colors"
                      >
                        Terms of Service
                      </button>
                      {' '}and{' '}
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setLegalModal('privacy'); }}
                        className="text-orange-400 hover:text-orange-300 underline underline-offset-2 transition-colors"
                      >
                        Privacy Policy
                      </button>
                      , and I have read the{' '}
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setLegalModal('disclaimer'); }}
                        className="text-orange-400 hover:text-orange-300 underline underline-offset-2 transition-colors"
                      >
                        Health Disclaimer
                      </button>
                    </span>
                  </label>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || (!isLogin && !showForgot && !canSubmit)}
                className="w-full py-4 mt-2 bg-[#d97757] hover:bg-[#c46844] text-white font-semibold text-sm rounded-xl shadow-md disabled:opacity-40 disabled:cursor-not-allowed transition-colors relative overflow-hidden btn-shimmer"
              >
                {isLoading ? 'Working...' : (showForgot ? 'Send reset link' : (isLogin ? 'Sign in' : 'Create account'))}
              </button>
            </form>

            <div className="text-center space-y-4 flex flex-col">
              {!showForgot && isLogin && (
                <button
                  type="button"
                  onClick={() => { setShowForgot(true); setError(''); setResetMsg(''); }}
                  className="text-[10px] text-gray-500 hover:text-white uppercase tracking-widest transition-colors"
                >
                  Forgot your password?
                </button>
              )}
              {showForgot && (
                <button
                  type="button"
                  onClick={() => { setShowForgot(false); setError(''); setResetMsg(''); }}
                  className="text-[10px] text-gray-500 hover:text-white uppercase tracking-widest transition-colors"
                >
                  Back to Login
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
