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

  useEffect(() => {
    // Auth listener begins immediately, but we don't act on it
    // until splash is minimally done. Actually wait, we just store it
    // then when splash completes we check it.
    let lastUid: string | null = null;
    const unsub = onAuthStateChanged(auth, async (u) => {
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
        setPhase((p) => (p !== 'splash' ? 'auth' : p));
      }
    });
    return () => unsub();
  }, []);

  const handleSplashComplete = () => {
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
