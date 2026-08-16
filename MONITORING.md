# Ding! Fitness — Ops & Monitoring Hub

Everything to watch after launch, in one place. Organized by how often to
look. A scheduled Claude agent ("Ding ops check", Mondays) automates the
uptime checks and reminds you of the rest.

---

## Dashboards (bookmark these)

| What | Where | You're watching for |
|---|---|---|
| Firebase console | https://console.firebase.google.com/project/dings-fitness | Function errors, Firestore usage, Auth signups |
| Cloud Functions logs | Firebase console → Functions → Logs | `[callGemini]` upstream errors, quota exhaustion spikes |
| Firebase billing | Firebase console → Usage and billing | Blaze plan spend — set a budget alert at $25/mo |
| Gemini API usage | https://aistudio.google.com/ (API keys → usage) | Token spend, rate limits, model deprecation notices |
| In-app usage dashboard | Ding app → Profile → usage dashboard (admin UID only) | Per-feature AI cost, per-user token totals, top spenders |
| App Store Connect | https://appstoreconnect.apple.com | Review status, crashes, ratings/reviews, TestFlight feedback |
| Codemagic | https://codemagic.io/apps | Build pass/fail, free build minutes remaining |
| GitHub repo | https://github.com/DINGBATBOY/dings-fitness | Pushes trigger Codemagic — every push to main = a build |
| Domain + site | dings.fitness (behind Cloudflare) | Uptime, cert, registrar renewal date |

---

## Daily (first two weeks after launch, then relax)

- **App Store Connect → Ratings & Reviews** — respond to every early review;
  replies are visible and set the tone.
- **Crashes**: App Store Connect → TestFlight/App Analytics → Crashes. Any
  repeated crash signature = drop everything.
- **Cloud Functions logs** — filter for `error`. The two expected noisy ones:
  `resource-exhausted` (user hit the 50/day AI cap — fine, unless it's
  everyone) and `[callGemini] upstream error` (Gemini outage or bad key).
- **Support inbox** — support@dings.fitness. Apple reviewers and early users
  both land here. Reply within 24h.

## Weekly (the ops agent reminds you)

- **Website up**: dings.fitness, /privacy/, /terms/, /disclaimer/ all return
  200. These URLs are printed in the App Store listing — a dead privacy page
  is a compliance problem, not just embarrassment. *(agent-automated)*
- **AI spend**: in-app usage dashboard or Firebase logs. Watch the
  `tokenUsage` totals; a single user gaming the quota shows up here.
- **Firestore usage**: reads/writes trending against the free tier?
  Every app open reads the user doc; growth shows here first.
- **Codemagic minutes**: free tier is limited; each push to main burns a
  build. Batch pushes if minutes get tight.
- **TestFlight feedback** screenshots (testers can send annotated shots).

## Monthly

- **Domain renewal + DNS**: check registrar expiry for dings.fitness and
  Cloudflare cert status (auto-renews, but verify after any DNS change).
- **Apple program membership**: $99/yr — lapse pulls the app from sale.
- **Secrets audit**: GEMINI_API_KEY / USDA_API_KEY in Firebase Secrets
  Manager; CERTIFICATE_PRIVATE_KEY + App Store Connect API key in Codemagic.
  Rotate anything that ever leaked into a log.
- **Dependency deprecation watch**:
  - `gemini-2.5-flash` — older model; watch Google's deprecation schedule
    and A/B `gemini-3.5-flash-lite` on food scans when convenient.
  - Capacitor major versions (currently v6).
  - Apple minimum-OS mandates (already on 15.0; Spring 2027 rule satisfied).

## Release-day checklist (every future update)

1. `git push origin main` → Codemagic builds automatically
2. `firebase deploy --only functions` **if** anything in `functions/` changed
3. `firebase deploy --only hosting,firestore:rules,storage` **if** the web
   app, landing page, or rules changed
4. TestFlight pass on the new build before submitting the version
5. App Store Connect → new version → attach build → Submit

## Alert thresholds (rules of thumb)

- Function error rate > 5% of calls in a day → investigate that day
- AI cost > $1/day with <100 users → someone is abusing quota; check
  `tokenUsage` for the uid and consider lowering DAILY_LIMIT_PER_USER
- Crash-free rate < 99% → hotfix before any feature work
- Any 4xx/5xx on the privacy/terms URLs → fix same day (listing compliance)

## Escalation contacts

- Apple Developer Support: https://developer.apple.com/contact/ (review
  disputes, expedited review requests)
- Firebase status: https://status.firebase.google.com
- Gemini/Google AI status: https://status.cloud.google.com
- Codemagic status: https://status.codemagic.io
- Cloudflare status: https://www.cloudflarestatus.com
