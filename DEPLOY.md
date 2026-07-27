# Deploying Ding! — Phase 1 (Security)

This is the deployment guide for the changes that just landed in this branch:

- A Firebase Functions Gemini proxy (`functions/`)
- Firestore + Storage security rules (`firestore.rules`, `storage.rules`)
- Client refactor: `services/geminiService.ts` now calls the proxy instead of Gemini directly
- Removed `VITE_GEMINI_API_KEY` requirement from the client `.env`

After this is deployed, the Gemini API key will no longer ship in your client bundle.

---

## 1. Prerequisites (one-time)

```bash
# From the project root
npm install -g firebase-tools
firebase login
```

Then set your Firebase project ID in `.firebaserc`. Open the file and replace
`REPLACE_WITH_YOUR_FIREBASE_PROJECT_ID` with your real project ID (e.g.
`dings-fitness`, or whatever shows in the Firebase Console URL).

---

## 2. ROTATE THE GEMINI KEY (do this first!)

Your current key is in the public JS bundle in `dist/`. It is compromised.

1. Open https://aistudio.google.com/app/apikey
2. Delete the existing key
3. Click "Create API key" and copy the new one
4. **Do not put it in `.env`.** It only lives on the server now.

---

## 3. Install function dependencies

```bash
cd functions
npm install
cd ..
```

---

## 4. Set the Gemini key as a Functions secret

```bash
firebase functions:secrets:set GEMINI_API_KEY
```

Paste your new key when prompted. Firebase stores it in Google Secret Manager;
the Cloud Function reads it at runtime. It is never written to disk in your
project.

---

## 5. Deploy the Cloud Function

```bash
firebase deploy --only functions
```

First-time deploy enables a few Google Cloud APIs automatically. May take
2–3 minutes.

---

## 6. Deploy the Firestore + Storage rules

```bash
firebase deploy --only firestore:rules,storage:rules
```

> ⚠️ **Before deploying rules, double-check the rules file.** The rules in
> `firestore.rules` lock everything down to per-user access. If your current
> live rules are different (e.g., you had additional collections), merge them
> in first — otherwise existing data may become inaccessible.

---

## 7. Remove the Gemini key from your local `.env`

Open `.env` and delete the `VITE_GEMINI_API_KEY=...` line entirely. The
client no longer reads it.

---

## 8. Rebuild and verify the client

```bash
npm run build
```

Now confirm the new key is **not** in the bundle:

```bash
# Should return nothing:
grep -r "AIzaSy" dist/ --include="*.js" | grep -v "VITE_FIREBASE_API_KEY"
```

The only AIzaSy* string you should see is your Firebase web API key (that one
is safe to ship — it's gated by Firestore rules + Auth).

---

## 9. Smoke test

Run `npm run dev` (or open the deployed app). Sign in, then test each AI feature:

- Onboarding macros (if creating a fresh account)
- Food analysis ("Analyze" on a food item)
- Smart split generation
- Coach chat
- Meal suggestion

Each should now route through the Cloud Function. You can confirm in the
browser's Network tab — look for a request to
`https://us-central1-<your-project>.cloudfunctions.net/callGemini` instead of
direct calls to `generativelanguage.googleapis.com`.

---

## 10. Watch the budget

In Google Cloud Console:

1. Navigation menu → Billing → Budgets & alerts
2. Create a budget on the project
3. Threshold: $5/month with email alert at 50% and 100%

The Cloud Function also enforces a per-user daily quota of **50 AI calls/day**.
Adjust `DAILY_LIMIT_PER_USER` in `functions/src/index.ts` if needed.

---

## Local development with emulators

To test without burning real Gemini quota:

```bash
# Terminal 1 — run emulators
firebase emulators:start

# In your .env, set:
VITE_USE_FIREBASE_EMULATORS=true

# Terminal 2
npm run dev
```

The client will talk to the local Functions emulator on port 5001. Note that
the emulator still needs a valid Gemini key — set it in the local environment:

```bash
echo "GEMINI_API_KEY=<your-key>" > functions/.secret.local
```

Firebase emulators read `.secret.local` automatically.

---

## Rollback

If something goes wrong, you can roll back the Functions deploy from the
Firebase Console (Functions → callGemini → Logs/Versions). The client refactor
is git-revertable.
