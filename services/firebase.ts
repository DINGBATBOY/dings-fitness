
import { initializeApp, FirebaseApp } from 'firebase/app';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, Firestore } from 'firebase/firestore';
import {
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
  Auth,
} from 'firebase/auth';
import { getFunctions, Functions, connectFunctionsEmulator } from 'firebase/functions';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { Capacitor } from '@capacitor/core';

// Values come from .env (copy .env.example -> .env and fill in your project's keys).
// NEVER hardcode credentials here.
//
// Note: the Gemini API key is NO LONGER required on the client. It lives as a
// Firebase Functions secret on the server. See functions/src/index.ts.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const isConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

let app: FirebaseApp | undefined;
let db: Firestore | undefined;
let auth: Auth | undefined;
let functions: Functions | undefined;

if (isConfigured) {
    app = initializeApp(firebaseConfig);
    // ignoreUndefinedProperties:true tells the Firestore SDK to drop any
    // `undefined` fields before sending the write. Without this, any object
    // we save that has an optional field set to undefined will throw
    // "Unsupported field value: undefined" — and the entire save fails.
    // This is the right default for our schemas, where optional fields are
    // common (fiber, brand, etc.) and undefined just means "not present."
    //
    // experimentalAutoDetectLongPolling: required for the iOS Capacitor
    // WebView. Firestore's default WebSocket transport is unreliable inside
    // WKWebView — getDoc() hangs forever instead of resolving. Long-polling
    // is slower but works everywhere; the SDK auto-detects when WebSockets
    // are available and uses them when possible.
    db = initializeFirestore(app, {
        ignoreUndefinedProperties: true,
        experimentalAutoDetectLongPolling: true,
        // Keep queued log writes across reloads/offline app restarts.
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
    // initializeAuth with an explicit persistence chain. iOS WKWebView's
    // IndexedDB is unreliable — signInWithEmailAndPassword hangs forever
    // when Firebase tries to persist the auth token. We pass a fallback
    // chain so the SDK tries IndexedDB first, then localStorage, then
    // sessionStorage, then in-memory. All four work in the iOS WebView at
    // least at the in-memory level, so sign-in always resolves.
    auth = initializeAuth(app, {
        persistence: [
            indexedDBLocalPersistence,
            browserLocalPersistence,
            browserSessionPersistence,
            inMemoryPersistence,
        ],
    });
    // Region must match functions/src/index.ts (`setGlobalOptions({ region })`).
    functions = getFunctions(app, 'us-central1');

    // If running against the local Firebase emulator, point Functions at it.
    // Toggle by setting VITE_USE_FIREBASE_EMULATORS=true in .env.local
    if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true' && typeof window !== 'undefined') {
        try {
            connectFunctionsEmulator(functions, '127.0.0.1', 5001);
        } catch (e) {
            console.warn('Failed to connect to Functions emulator', e);
        }
    }

    // App Check (audit SEC-01) — prepared, NOT enforced. Off until
    // VITE_APPCHECK_RECAPTCHA_KEY is set at build time. Web only: reCAPTCHA
    // can't attest the iOS WebView (capacitor://localhost); iOS needs App
    // Attest through a native plugin (HANDOFF "App Check"). The server
    // counts calls without a token (opsCounters.appCheckMissing) until
    // enforcement is switched on in functions/src/aiPolicy.ts.
    const appCheckKey = import.meta.env.VITE_APPCHECK_RECAPTCHA_KEY as string | undefined;
    if (appCheckKey && typeof window !== 'undefined' && !Capacitor.isNativePlatform()) {
        try {
            const debugToken = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN as string | undefined;
            if (debugToken) (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
            initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(appCheckKey), isTokenAutoRefreshEnabled: true });
        } catch (e) {
            console.warn('App Check init failed (not enforced yet)', e);
        }
    }

    // No Google Analytics: the privacy policy promises no third-party
    // analytics, and nothing read it (audit PRIV-03). Don't add it back
    // without updating the policy and the App Privacy label.
} else {
    console.warn("Firebase not configured: copy .env.example to .env and fill in your keys.");
}

export { db, auth, functions, isConfigured };
