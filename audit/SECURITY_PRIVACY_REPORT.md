# Security & Privacy Report — Ding! Fitness v1.0

**Bottom line.** The core data boundary is sound. Firestore and Storage rules are owner-only with default-deny, job ids are uid-prefixed, and there are no committed secrets or AI keys on the client. The release risks are **disclosure accuracy** (HealthKit weight to Gemini, consent gaps, undeclared Analytics) and **cost abuse** of open AI proxies. No P0 was found.

Limitations: the Firestore/Storage rules emulator could not run. The audit sandbox can't download the emulator jar, and Ding's PC has no Java. Cross-user isolation is therefore **verified by rule inspection, not by an executed emulator test**. No production data or services were touched.

---

## 1. Secrets & configuration

| Check | Result | Evidence |
|---|---|---|
| Secrets in git history (`AIza…`, `sk-…`, private keys, GitHub tokens, AWS keys) | ✅ none | [TEST] `git log --all -p` regex scan over 106 commits |
| `.env`, `.ops-key`, `cert_private_key.pem` ignored | ✅ | [TEST] `git check-ignore` |
| AI keys on client | ✅ none: Gemini/OpenAI/USDA keys are Functions secrets | [SRC] `functions/src/index.ts:35–38` |
| Firebase web config in bundle | ✅ expected (public by design; protected by rules) | [SRC] |
| Analytics measurement ID in bundle | ⚠️ present → PRIV-03 | [TEST] bundle grep |
| `functions/firebase-debug.log` on disk | ✅ ignored; not reviewed for content | — |

## 2. Authorization (cross-user access)

| Resource | Rule / check | Verdict |
|---|---|---|
| `users/{uid}` (+ subcollections) | read/write iff `auth.uid == uid` | ✅ [SRC] `firestore.rules:13–19` |
| `user_workouts/{uid}` | owner only | ✅ |
| `quotas/{uid}` | owner/admin read, no client writes | ✅ |
| `tokenUsage/*` | read own or admin; no writes | ✅ (query must filter by uid; the rule is evaluated per document) |
| `foodAnalysisJobs/*` | read iff `resource.data.uid == auth.uid`; no writes | ✅ |
| `gptKeys`, `barcodeCache`, `foodLookupCache`, `opsCounters`, `foodAnalysisMaintenance` | default deny | ✅ |
| Storage `users/{uid}/**` | owner, < 1 MB, image/* | ✅ `storage.rules` |
| Storage `foodAnalysisInputs/**` | default deny (Admin SDK only) | ✅ |
| Callables: `startFoodAnalysis`/`cancelFoodAnalysis` | doc id = `${auth.uid}_${jobId}`, jobId regex `^[a-zA-Z0-9-]{8,80}$` | ✅ no IDOR |
| `deleteAccount` | acts on `auth.uid` only, needs `{confirm:"DELETE"}` | ✅ |
| `gptMacros` (public HTTPS) | 192-bit bearer key → uid; read-only | ✅ |
| `opsReport` | key must map to an admin uid | ✅; key accepted in `?key=` (logged in URLs, P3) |
| Admin UI | client gate `isAdminUser` + rules `isAdmin()` | ✅ (UID hard-coded in 3 places; keep in sync) |

**Suggested executed test (not run):** `@firebase/rules-unit-testing` with two users. User B must be denied `getDoc/setDoc/deleteDoc` on `users/A`, `user_workouts/A`, `quotas/A`, `tokenUsage` docs where `uid==A`, `foodAnalysisJobs/A_x`, and Storage `users/A/avatar.jpg`. Run it with `firebase emulators:exec` once Java is installed.

## 3. Findings

### SEC-01 (P1) — AI cost exposure
See `CRITICAL_ISSUES.md #13`. `callGemini` forwards client `config` (system instruction, tools, schema) and `contents`. `startFoodAnalysis` accepts client-built `messages`. There's no App Check, and sign-ups are free and unverified. The 50/day cap is per account.

### SEC-02 (P1) — `@capacitor/ios` 6.2.1 critical advisory (fix 6.2.2)
See `CRITICAL_ISSUES.md #14`.

### SEC-03 (P2) — dependency advisories
[TEST] `npm audit --omit=dev` (`evidence/npm-audit-*.json`):
- **web:** 7 (2 critical, 3 high). `@capacitor/ios` (above). `websocket-driver`, `ws`, `@grpc/grpc-js` and `protobufjs` are mostly Node-side paths of the Firebase SDK, not in the WebView bundle. `dompurify` ≤ 3.4.x comes in via jsPDF; the app's own `SafeMarkdown` doesn't use it.
- **functions:** 19 (2 critical: `proxy-addr`, `websocket-driver`; 7 high incl. `node-forge`, `form-data`, `@fastify/busboy`). Most are fixed by `npm audit fix`; `firebase-admin` 12 → 14 is a major bump. `firebase-functions` 6 is also flagged outdated by the CLI.
**Fix:** `npm audit fix` in both packages, then plan the firebase-admin 14 / firebase-functions upgrade and re-run the food tests.

### SEC-04 (P2) — prompt injection is contained but not prevented
User text is length-limited (`sanitize`) and embedded in prompts. Output is JSON-validated for the scan. An injected note can only distort the user's *own* log, since the result is reviewed before logging. But the coach can call `updateUserMetric` (weight/body fat) from model output: `recordWeight` validates weight 50–700, while body fat is stored unvalidated, possibly as a string (`MainApp.tsx:1663`).
**Fix:** validate body fat to 3–70 % and a number type; confirm metric updates with the user before applying.

### SEC-05 (P3) — web hosting headers
`firebase.json` sets cache headers only. Add `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy` and `frame-ancestors 'none'` for dings.fitness.

### SEC-06 (P3) — ops key in a query string
`opsReport` accepts `?key=` (noted as deliberate for the ops agent). Keys in URLs end up in logs. Rotate periodically, or use a separate read-only ops key.

### XSS review
Coach and markdown output go through `SafeMarkdown`: tag allowlist, all attributes stripped, `href` limited to http/https/mailto/tel. No bypass was found by inspection. ✅

---

## 4. Privacy & disclosure

### Data inventory (what is collected → where it goes)

| Data | Stored | Sent to | Disclosed in policy? |
|---|---|---|---|
| Email, password (Firebase Auth) | Firebase Auth | — | ✅ |
| Name, age, sex, height, weight, body fat, activity, goal, target weight/date | `users/{uid}.profile` | **Gemini** (onboarding, coach, Analyze Day, Fuel Coach) | ✅ (onboarding sent before consent — PRIV-02) |
| Food logs, water, logged workouts, notes | `users/{uid}` | Gemini (coach context, Analyze Day); OpenAI (scan) | ✅ |
| Food photos | Storage `foodAnalysisInputs/` (deleted after the job; orphans swept at 2 h) | **OpenAI** | ✅ |
| Profile picture | base64 inside the user doc (~256 px) | — | ✅ |
| HealthKit: active energy, steps, workouts | device memory only | none | ✅ |
| HealthKit: body mass | `weighIns` (source `health`) **and `profile.weight`** | **Gemini via `profile.weight`** ❌ | ❌ contradicts the policy (PRIV-01) |
| AI usage (uid, **email**, feature, tokens, cost) | `tokenUsage`, `quotas` | — | ⚠️ not described; retained after deletion (DEL-01) |
| Analytics events / app-instance id | Google Analytics | Google | ❌ policy says none (PRIV-03) |
| GPT key → read access to macros | `gptKeys` | user's own ChatGPT GPT (OpenAI) | ❌ not described (FEAT-01) |

### PRIV-01 (P1) HealthKit weight → Gemini · PRIV-02 (P1) consent gaps · PRIV-03 (P1) Analytics undisclosed
See `CRITICAL_ISSUES.md #1–3`.

### DEL-01 (P2) — account deletion is incomplete
`functions/src/index.ts:824–883`:
- **Left behind:** `tokenUsage/*` docs (uid + `userEmail`) and `gptKeys/{key}` (uid).
- **Silent partial failure:** if the Firestore deletes throw, the function logs, continues, deletes the Auth user and returns `{success:true}`. Data stays with no account attached and no retry.
- **Left on device:** Firestore's persistent IndexedDB cache (`persistentLocalCache`) and the food-draft IndexedDB (`foodDraftStore`); `DeleteAccountModal` clears `localStorage` keys only.
- **Third parties:** OpenAI/Google API retention is described generically. ✅
The policy promises removal "within thirty (30) days" from active systems.
**Fix:** delete `tokenUsage where uid==` (or pseudonymize: drop email, hash uid) and `gptKeys where uid==`. Return an error (or queue a retry) if the Firestore deletes fail before deleting Auth. Call `clearIndexedDbPersistence` and `indexedDB.deleteDatabase` for the drafts DB after sign-out.
Covered correctly: `users`, `user_workouts`, `quotas`, `foodAnalysisJobs`, Storage `users/` and `foodAnalysisInputs/`, Auth user. Deletion is a hard delete, not deactivation. ✅ No subscriptions exist, so no cancellation guidance is needed. ✅ No Sign in with Apple, so no Apple token revocation is needed. ✅

### FEAT-01 (P2) — "Fuel Coach GPT key" is visible to every user
`MainApp.tsx:2169`. It mints a bearer key that lets a ChatGPT Custom GPT read live macros. It's an undisclosed data path to OpenAI, it's confusing for reviewers, and it lacks the 5.1.2(i) consent. Hide it behind `isAdminUser` for v1.0, or disclose it and gate it with consent.

### Other
- **AI consent can't be withdrawn in-app** (no toggle back to false). P3; add one in Settings.
- **Email isn't verified** at sign-up. P3; it also lets abusers mint accounts (SEC-01).
- **Logging privacy:** server logs include uid and upstream error text, not prompts or images. ✅ The client logs only in DEV (one exception: `MainApp.tsx:659` is DEV-gated). ✅
- **Transport:** HTTPS only via Firebase SDKs and Hosting; no ATS exceptions in `Info.plist`. ✅
- **Tracking/ATT:** no IDFA and no ad SDKs, so ATT isn't required, provided the Analytics decision (PRIV-03) doesn't add cross-app tracking.
