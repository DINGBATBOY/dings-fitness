import React, { useState, useEffect } from 'react';
import { SplashScreen } from './components/SplashScreen';
import { Auth } from './components/Auth';
import { Onboarding } from './components/Onboarding';
import MainApp from './MainApp';
import { auth, db } from './services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { UserProfile } from './types';
import { AnimatePresence, motion } from 'motion/react';

type AppPhase = 'splash' | 'auth' | 'onboarding' | 'app';
type UserDocument = {
  profile?: UserProfile;
  nutritionTargets?: unknown;
} & Partial<UserProfile>;

const extractProfile = (data: UserDocument | undefined): UserProfile | null => {
  if (!data) return null;
  if (data.profile && typeof data.profile === 'object') {
    return data.profile;
  }
  // Legacy fallback for older documents that stored profile fields at the root.
  if (typeof data.name === 'string' && typeof data.weight === 'number' && data.goal) {
    return data as UserProfile;
  }
  return null;
};

export default function App() {
  const [phase, setPhase] = useState<AppPhase>('splash');
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  // True once Firebase auth has fired its first event after this page load.
  // Before this, a null user could mean either "logged out" OR "still
  // rehydrating from IndexedDB / localStorage" — they're indistinguishable.
  const [authResolved, setAuthResolved] = useState(false);
  // True once we've attempted to load the user's Firestore profile (success
  // or failure). Important: a null profile alone doesn't mean "needs
  // onboarding" — it might mean "fetch still in flight." Transitioning to
  // onboarding without this flag was the bug that yanked logged-in users
  // straight into the new-user signup flow.
  const [profileResolved, setProfileResolved] = useState(false);
  // True once the splash timer (2.7s) has fired. Decoupled from authResolved
  // so we can hold splash until BOTH are true and we know what to do next.
  const [splashCompleted, setSplashCompleted] = useState(false);

  useEffect(() => {
    // Auth listener begins immediately, but we don't act on it
    // until splash is minimally done. Actually wait, we just store it
    // then when splash completes we check it.
    let lastUid: string | null = null;
    const unsub = onAuthStateChanged(auth, async (u) => {
      // First fire marks auth as resolved — now null actually means "no
      // user" and we can transition phases without false positives.
      if (!authResolved) setAuthResolved(true);
      // Defensive cleanup: any time the signed-in uid changes (including
      // sign-out, where the new uid is null), wipe legacy global cache keys
      // so one user's cached data can never seed another user's session.
      // Per-uid namespaced keys are safe to leave behind — they can only be
      // read by the user that wrote them.
      const newUid = u?.uid ?? null;
      if (newUid !== lastUid) {
        try { localStorage.removeItem('dings_app_state'); } catch {}
        try { localStorage.removeItem('dings_workout_split'); } catch {}
        lastUid = newUid;
      }

      setUser(u);
      if (u) {
        // New user-state arriving — profile fetch starts now. Mark unresolved
        // so the phase-transition effect waits for it.
        setProfileResolved(false);
        try {
          const profileSnap = await getDoc(doc(db, "users", u.uid));
          setProfile(profileSnap.exists() ? extractProfile(profileSnap.data() as UserDocument) : null);
        } catch (e) {
          console.error("Error loading profile", e);
          setProfile(null);
        } finally {
          setProfileResolved(true);
        }
      } else {
        setProfile(null);
        setProfileResolved(true); // no user => no profile to wait for
        // Only transition to 'auth' when we're past splash. The brief null
        // that happens during background-resume rehydrate is handled by the
        // splash gate (we stay on splash until authResolved).
        setPhase((p) => (p === 'splash' ? p : 'auth'));
      }
    });
    return () => unsub();
  }, []);

  // Splash done = the 2.7s timer fired. We don't transition phases here;
  // the effect below handles it once auth + profile are both resolved.
  const handleSplashComplete = () => {
    setSplashCompleted(true);
  };

  // Single source of truth for transitioning OUT of splash.
  // Three gates must all be true: splash timer done, auth fired at least
  // once, AND (if there's a user) the profile fetch has completed.
  // Without the profile gate, this fires while the fetch is still in flight
  // and yanks logged-in users straight into the new-user signup flow.
  useEffect(() => {
    if (phase !== 'splash') return;
    if (!splashCompleted || !authResolved) return;
    if (user && !profileResolved) return; // logged in, profile still loading

    if (!user) {
      setPhase('auth');
    } else if (profile) {
      setPhase('app');
    } else {
      // Authenticated but no profile doc exists → genuine new user
      setPhase('onboarding');
    }
  }, [phase, splashCompleted, authResolved, user, profile, profileResolved]);

  const handleLogin = async (u: any) => {
    setUser(u);
    try {
      const profileSnap = await getDoc(doc(db, "users", u.uid));
      if (profileSnap.exists()) {
        const loadedProfile = extractProfile(profileSnap.data() as UserDocument);
        setProfile(loadedProfile);
        setPhase(loadedProfile ? 'app' : 'onboarding');
      } else {
        setPhase('onboarding');
      }
    } catch (e) {
      console.error("Error checking profile on login", e);
      setPhase('onboarding'); // Fallback to onboarding if anything goes wrong
    }
  };

  const handleOnboardingComplete = async (newProfile: UserProfile, targets: any) => {
    setProfile(newProfile);
    if (user) {
      try {
        await setDoc(doc(db, "users", user.uid), { profile: newProfile, nutritionTargets: targets }, { merge: true });
      } catch (e) {
        console.error("Failed to save profile to Firestore:", e);
        alert("Couldn't save your profile to the cloud (likely a Firestore rules issue). Continuing locally — your data may not sync.");
      }
    }
    setPhase('app');
  };

  const handleSignOut = () => {
    setUser(null);
    setProfile(null);
    setPhase('auth');
  };

  return (
    <div className="w-full h-screen bg-[#050505] text-white overflow-hidden relative">
      <AnimatePresence mode="wait">
        {phase === 'splash' && (
          <motion.div
            key="splash"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 z-50"
          >
            <SplashScreen onComplete={handleSplashComplete} />
          </motion.div>
        )}
        
        {phase === 'auth' && (
          <motion.div
            key="auth"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 z-40 overflow-y-auto"
          >
            <Auth onLogin={handleLogin} />
          </motion.div>
        )}

        {phase === 'onboarding' && (
          <motion.div
            key="onboarding"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 z-30 overflow-y-auto"
          >
            <Onboarding onComplete={handleOnboardingComplete} />
          </motion.div>
        )}

        {phase === 'app' && (
          <motion.div
            key="app"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 z-20 overflow-y-auto"
          >
            <MainApp
              // Remount from scratch whenever the signed-in user changes,
              // so no in-memory state from a previous account can leak.
              key={user?.uid ?? 'anon'}
              userId={user?.uid}
              userEmail={user?.email}
              initialProfile={profile}
              onSignOut={handleSignOut}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
