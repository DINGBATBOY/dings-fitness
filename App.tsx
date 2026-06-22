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

export default function App() {
  const [phase, setPhase] = useState<AppPhase>('splash');
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  // True once Firebase auth has fired its first event after this page load.
  // Before this, a null user could mean either "logged out" OR "still
  // rehydrating from IndexedDB / localStorage" — they're indistinguishable.
  // Showing the sign-in screen during a rehydrate causes a visible flash
  // back to Auth every time the app comes out of background. We hold the
  // splash phase until we know.
  const [authResolved, setAuthResolved] = useState(false);

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
        try {
          const profileSnap = await getDoc(doc(db, "users", u.uid));
          if (profileSnap.exists()) {
            setProfile(profileSnap.data() as UserProfile);
          } else {
            setProfile(null);
          }
        } catch (e) {
          console.error("Error loading profile", e);
        }
      } else {
        setProfile(null);
        // Only transition to 'auth' when we're not in splash AND we're
        // already past initial resolution. This prevents the brief null
        // that happens during background-resume from yanking the user
        // back to the sign-in screen.
        setPhase((p) => {
          if (p === 'splash') return p;
          // If we've already shown the app phase to this user, treat a null
          // user as a sign-out (intentional). The auth listener's initial
          // null on a fresh page load is handled by the splash gate.
          return 'auth';
        });
      }
    });
    return () => unsub();
  }, [authResolved]);

  const handleSplashComplete = () => {
    // If auth hasn't resolved yet (e.g., slow IndexedDB rehydrate on
    // background-resume), stay on splash a tick longer rather than flashing
    // the auth screen. Once authResolved flips true the effect below will
    // transition us out.
    if (!authResolved) return;
    if (user) {
      if (profile) {
        setPhase('app');
      } else {
        setPhase('onboarding');
      }
    } else {
      setPhase('auth');
    }
  };

  // Once auth resolves AND splash is done, drop into the right phase.
  // Covers the case where the splash timer fired before auth resolved.
  useEffect(() => {
    if (!authResolved) return;
    if (phase !== 'splash') return;
    // Splash's onComplete will fire its own handleSplashComplete shortly;
    // if it already did and we're here because authResolved flipped after,
    // run the same logic now.
    if (user) {
      setPhase(profile ? 'app' : 'onboarding');
    } else {
      setPhase('auth');
    }
  }, [authResolved, phase, user, profile]);

  const handleLogin = async (u: any) => {
    setUser(u);
    try {
      const profileSnap = await getDoc(doc(db, "users", u.uid));
      if (profileSnap.exists()) {
        setProfile(profileSnap.data() as UserProfile);
        setPhase('app');
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
