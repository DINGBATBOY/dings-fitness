
import { initializeApp, FirebaseApp } from 'firebase/app';
import { initializeFirestore, Firestore } from 'firebase/firestore';
import {
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
  Auth,
} from 'firebase/auth';
import { getFunctions, Functions, connectFunctionsEmulator } from 'firebase/functions';
import { getAnalytics, Analytics } from 'firebase/analytics';

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
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const isConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

let app: FirebaseApp | undefined;
let db: Firestore | undefined;
let auth: Auth | undefined;
let functions: Functions | undefined;
let analytics: Analytics | undefined;

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

    if (typeof window !== 'undefined') {
        try {
            analytics = getAnalytics(app);
        } catch {
            // Analytics may not be available in all environments; safe to ignore.
        }
    }
} else {
    console.warn("Firebase not configured: copy .env.example to .env and fill in your keys.");
}

export { db, auth, functions, isConfigured, analytics };
