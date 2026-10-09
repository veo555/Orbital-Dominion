# Roadmap: from this web build to Google Play and the Apple App Store

Status date: **6 Oct 2026**. Store requirements marked ✔ were checked against the official page (sources at the end);
items marked ◇ are from general knowledge and must be re-confirmed at the moment you sign up / submit. Effort figures
are my estimates for **one full-time engineer** — they are planning aids, not measurements.

---

> **Update, 6 Oct 2026 (3.1):** since this roadmap was written the *web* side of Phase 2/3/4 has been built and tested **in Chromium emulation only**: Pointer-Events touch layer and phone layouts
> (M-01…M-06), pause-on-background / Back button / audio suspend (M-07, *without* save/resume), Capacitor config + a payment-free `store` build (M-10 prerequisites), adaptive quality and a battery tier (P-05, P-07),
> colour-blind palette and reduce-motion (F-03 partly), haptics (F-05 partly), installable offline web app. **Still open:** the S0 device spike (nothing has run on a real phone), save/resume, tutorial (F-01),
> store assets/accounts/policies, real-device audio. §6 (monetisation) now has a concrete, store-safe answer for the *web* releases: `docs/MONETIZATION.md`. Per-item status: `docs/BACKLOG.md`.

## 0. Executive summary

1. **The simulation, AI, economy and desktop UI are in good shape** (deterministic, tested, 0 errors, 0 network calls).
   **The product layer a phone needs does not exist yet**: touch input, a phone-sized HUD, app-lifecycle handling,
   persistence, onboarding, store assets, and any measurement on real hardware.
2. **Recommended path:** wrap the existing code with **Capacitor** (bundled local assets, one codebase for both stores),
   *but* gate the whole plan on a one-week **device spike (S0)**. If a low-end phone cannot sustain the frame-time
   budget with the Canvas-2D renderer, replace only the renderer (WebGL) — the simulation (≈ 3,500 lines of pure JS,
   headless-tested) is reusable in every scenario.
3. **Critical path** (calendar-bound, start immediately): developer accounts + identity verification, and — if your
   Google account is a *personal* one created after 13 Nov 2023 — a **closed test with ≥ 12 testers continuously
   opted in for ≥ 14 days** before Google lets you apply for production access ✔.
4. **Honest estimate:** about **3–4 months** to a defensible 1.0 for one full-time engineer, dominated by touch UX
   (4–6 weeks) and real-device performance work (2–4 weeks). "Perfect" is not a ship criterion; the measurable gates in
   §5 are.
5. Out of scope by decision: any real-money / USDC / peer-to-peer feature. All in-game currency is virtual and there is
   no network code, which keeps review and privacy answers simple.

## 1. Verified store facts (as of 6 Oct 2026)

**Google Play**
* ✔ From **31 Aug 2026**, new apps and updates must **target Android 16 (API 36)** or higher; an extension up to
  **1 Nov 2026** can be requested in Play Console. (Wear OS/Automotive: API 35; TV/XR: API 34.) Existing apps must target
  API 35+ to remain available to new users.
* ✔ **Personal developer accounts created after 13 Nov 2023** must run a closed test with **≥ 12 testers opted in
  continuously ≥ 14 days** before applying for production access (then answer a questionnaire). Opt-outs restart that
  tester's clock. Organisation accounts are not described as subject to this on that page — re-check for your case.
* ✔ Listing graphics: app icon **512 × 512 px, 32-bit PNG with alpha, ≤ 1024 KB**; feature graphic **1024 × 500 px**
  (JPEG or 24-bit PNG, no alpha); **at least two screenshots** (JPEG/24-bit PNG, 320–3840 px per side); for tablets and
  Chromebooks Google asks for **≥ 4** screenshots (16:9 / 9:16).
* ✔ Android vitals "bad behaviour" thresholds (28-day average): user-perceived **crash rate 1.09 %** overall,
  **ANR rate 0.47 %** overall, **8 % per phone model** for either. Exceeding them can reduce visibility and show a
  warning on the listing.
* ◇ Upload an **Android App Bundle (.aab)** with **Play App Signing**; complete the **Data safety** form, the
  **content rating questionnaire (IARC)**, a **privacy policy URL**, target-audience declaration. Registration fee
  US$25 one-time.

**Apple App Store**
* ✔ Since **28 Apr 2026**, uploads must be built with **Xcode 26 or later** against the **iOS 26 / iPadOS 26 SDK**; since
  **9 Sep 2026** iOS/iPadOS apps must **target iOS 13 or later**. A **Mac is required** for the final build/archive
  (local, or a hosted macOS CI such as Xcode Cloud / Codemagic / GitHub macOS runners).
* ✔ **New age-rating system** (questions updated; developers had to answer by 31 Jan 2026) — answer honestly
  (Guideline 2.3.6) in App Store Connect → App Information.
* ✔ **Guideline 4.2:** "Your app should include features, content, and UI that elevate it beyond a repackaged
  website." A full interactive canvas game with bundled content is not a repackaged site, but wrapper apps get scrutiny —
  see §3 for how to make the native value obvious.
* ✔ **Guideline 2.5.2:** apps must be self-contained and may not download/execute code that introduces or changes
  features. The game is already one bundled file with no network access — **keep every script bundled** (no remote JS).
* ✔ **Guideline 2.1(a):** the app must be tested **on-device**; crashes and obvious technical problems are rejected.
* ✔ **Guideline 5.1.1:** all apps need a **privacy policy link** in App Store Connect metadata *and* accessible inside
  the app.
* ✔ **Guideline 3.1.1:** unlocking features/content in the app must use **in-app purchase**.
* ✔ Screenshots: required for the largest iPhone class (and iPad if you support it), up to 10 per size, JPEG/PNG without
  alpha. Exact pixel sizes change with each device generation — read the current table in App Store Connect Help when
  producing assets.
* ◇ Apple Developer Program US$99/year; TestFlight for beta; organisation enrolment needs a D-U-N-S number (can take days to weeks).

## 2. Wrapper decision

| Option | What it is | Fit | Main risks |
|---|---|---|---|
| **A. Capacitor** (recommended) | Native iOS/Android shell with a WebView; the game ships as local files; plugins for lifecycle, preferences, orientation, haptics, status bar | Reuses 100 % of the code; satisfies 2.5.2 by construction; one team, two stores | WebView performance ceiling (Canvas 2D), WKWebView audio quirks, memory limits; 4.2 scrutiny (mitigate with native features, §3 phase 4) |
| B. Android TWA / PWA | Trusted Web Activity pointing at a hosted HTTPS site | Fast Android-only stopgap for internal testing | Needs hosting + Digital Asset Links; no iOS equivalent; offline/lifecycle weaker |
| C. Native engine port (Unity/Godot) | Rewrite sim + rendering | Best raw performance, console/Steam options later | Rewrites ~6 k lines, throws away the headless test harness, 3–6× the effort |
| D. Capacitor + WebGL renderer (PixiJS or raw) | Keep sim/UI, swap the canvas drawing | Fixes GPU-bound frames, keeps everything else | Medium effort (renderer ≈ 300 lines + art pipeline); do it **only if S0 proves it necessary** |

**Version note:** per Capacitor's own documentation page, v7 is out of active maintenance (extended support ended
8 Jun 2026) and **v8 is the current documented release**; v9 is shown as *unreleased* with a minimum of Xcode 27 /
Android Studio 2026.1.1 / iOS 16 / Android API 26 ✔. Use the current stable major and read its **support-policy page**
for the Xcode / Android Studio / minSdk requirements *before* installing; they move with every major.

**Setup sketch (documented workflow; I could not execute it here — the sandbox's npm mirror returned `403` for the
`@capacitor/*` packages, so treat it as unverified until you run it):**
```bash
npm run www                                   # build + copy dist/orbital_dominion_v4.html -> www/index.html
npm i @capacitor/core @capacitor/app @capacitor/preferences @capacitor/haptics @capacitor/screen-orientation @capacitor/status-bar
npm i -D @capacitor/cli @capacitor/android @capacitor/ios
npx cap init "Orbital Dominion" com.<yourco>.orbitaldominion --web-dir=www     # choose the final bundle/package ID once; it is permanent
npx cap add android && npx cap add ios && npx cap sync
npx cap open android      # Android Studio: set targetSdk 36, lock landscape, build .aab
npx cap open ios          # Xcode 26+: signing, deployment target, build/archive
```
`www/index.html` being a copy of the single built file is deliberate: the wrapper needs no change to the build.

## 3. Phases, deliverables and exit criteria

### Phase 0 — Calendar-bound set-up (start now, runs in parallel; ~2–3 days of actual work)
* Create the **Google Play** and **Apple Developer** accounts (identity verification can take days; organisation
  accounts need a D-U-N-S). Decide *personal vs organisation* knowingly — it changes the Google 12-tester rule.
* **Name and IP clearance:** search "Orbital Dominion" in both stores and trademark databases (USPTO/EUIPO/etc.)
  *before* producing assets; decide bundle/package ID. Keep competitor/IP names (StarCraft, Age of Empires, Warcraft …)
  **out of title, subtitle, keywords and description** — store metadata policies forbid it, and the game's names, art and
  text are original (procedural art, original factions) — keep it that way.
* Draft the **privacy policy** (true statement today: *the game collects no personal data and makes no network
  requests*; it must be revisited the day you add analytics, crash reporting, ads or accounts).
* Put the repo under version control, add CI running `tests/run_all.sh`.
* Recruit **≥ 12–20 testers** (friends, community, a Discord/Reddit post) so the 14-day clock can start the day a build
  exists.

### Phase 1 — Spike S0: wrapper + real-device measurement (1 week) → **decision gate**
* Wrap with Capacitor (§2), install on **three real devices**: a low-end Android (3–4 GB RAM, ~2019 mid-range SoC), a
  current mid-range Android, an iPhone from the last 4–5 years (+ an iPad if you will support it).
* Measure with a 10-minute Autopilot match at max zoom-out and again during a big fight: p50/p95 frame time, long
  frames, JS heap, native memory, cold-start time, battery drain, temperature after 20 minutes, audio behaviour
  (first-gesture unlock, mute switch, phone-call interruption, background/foreground).
* **Gate:** low-end p95 frame time ≤ 33 ms (30 fps) with the existing renderer → continue with Option A. Otherwise
  schedule P-02 (WebGL renderer) before Phase 2 finishes. Record the numbers in `docs/DEVICE_RESULTS.md`.

### Phase 2 — Mobile UX (4–6 weeks; the largest block) — BACKLOG M-01…M-10
Concrete design (adapt after playtests):
* **Gestures** (Pointer Events, not mouse): one-finger drag on empty ground **pans**; **tap** on own unit/building
  selects; **tap on ground/enemy/resource with a selection** issues the context command (move/attack/gather/repair/rally —
  exactly what right-click does now via `contextCommand`); **long-press + drag** (≈ 300 ms) or a visible **Select** toggle
  draws the box; **two-finger pinch** zooms, two-finger drag pans; **double-tap** selects all of the type on screen;
  group chips on screen (tap recall, long-press set); minimap tap/drag jumps/pans.
* **HUD:** replace the fixed `BOTTOM = 198` / `TOPBAR = 44` constants with measured values; a compact landscape layout
  (minimap ≈ 96–120 px, collapsible info card, command card on the right edge); `viewport-fit=cover` +
  `env(safe-area-inset-*)`; **touch targets ≥ 44 pt (iOS) / 48 dp (Android)**; no hover-only information (tooltips → long-press
  sheets); lock **landscape**.
* **Swarm panel on touch:** full-height side sheet; command box with **quick-chips** for the most common phrases so typing
  is optional (the OS keyboard's dictation already gives voice input); handle the on-screen keyboard via `visualViewport`.
* **Browser behaviours to disable:** pull-to-refresh/overscroll, double-tap zoom, text selection/callout menus,
  context menu (`touch-action: none`, `-webkit-touch-callout: none`).
* **Lifecycle:** pause on background (`@capacitor/app` `appStateChange`, plus `visibilitychange` for the web build),
  suspend/resume `AudioContext`, handle the **Android back button** (open the pause menu, never exit mid-match).
* **Persistence:** settings via `@capacitor/preferences` (WKWebView may evict `localStorage`); **save/resume** — decide
  between state serialisation and seed+input replay (ARCHITECTURE §6) *before* building it; at minimum offer
  "resume last match" after the OS kills the app.
* **Exit:** a first-time tester can play a full match on a phone with no keyboard and no instructions beyond the
  tutorial; the existing desktop E2E gates still pass.

### Phase 3 — Performance, stability, battery (2–4 weeks, overlaps Phase 2) — BACKLOG P-01…P-08
Likely work items (confirm by profiling, do not guess): cap/adapt DPR; render fog at lower resolution or via a
single texture upload; bake sprites into an atlas at build time instead of lazily at first sight (avoids hitches and
shortens start-up); pool particles; adaptive quality (EMA of frame time → drop night lighting / particle counts /
fog smoothing); 30 fps cap option and a battery-saver mode; sim-render interpolation so 60 Hz displays do not look
stepped; memory ceiling on low-end devices; 60-minute soak test with heap snapshots.

### Phase 4 — Onboarding, content polish, "native value" (2–3 weeks) — BACKLOG F-01…F-08
* A short **interactive tutorial** (mine → build generator → train → era → swarm basics → hire one agent) — the swarm layer
  is the differentiator and is currently explained only by a help page.
* Haptics for key events, native share of match results (optional), offline-by-design messaging, splash/launch screen,
  adaptive Android icon, proper app icon (1024 × 1024 for iOS **without alpha**), sound settings, accessibility pass
  (text scale, colour-blind palette for the three factions, reduced motion).
* These also answer guideline 4.2 ("more than a repackaged website") with evidence: touch-native controls, haptics,
  lifecycle, local persistence, offline play, tutorial.

### Phase 5 — Store assets, compliance, beta (2–3 weeks work, ≥ 14 calendar days of testing)
* Listing text (title, short/long description, keywords) and screenshots in the required sizes; short trailer video
  (optional but valuable); feature graphic 1024 × 500.
* **Describe the AI honestly:** "an Overseer that you can command in plain language" is fine; do not claim a
  generative-AI model (it is a rule-based system with a keyword parser).
* **Privacy/data forms** (Play *Data safety*, Apple *App Privacy*): "no data collected" is accurate **only while no SDKs
  are added** (crash reporters, analytics and ad SDKs change the answers). Provide the policy URL and an in-app link.
* **Age rating / content rating:** answer both questionnaires honestly (stylised sci-fi combat, no gore, no gambling —
  the "market/wages/hiring" systems use virtual currency only and involve no real money).
* **Beta:** TestFlight (internal → external) and Play **closed testing** (≥ 12 testers × ≥ 14 days if your account requires
  it). Fix-and-rebuild cycles inside the window do not reset testers who stay opted in.
* Apple: complete **App Review information** (demo steps: "Press Start Mission → … ; no login needed"), export-compliance
  answers (the game uses no encryption beyond the OS's).

### Phase 6 — Submission and staged rollout (≈ 1–2 weeks incl. review)
* Apple: submit, expect questions on 4.2 first — answer with the native-feature list. Google: apply for production access,
  then **staged rollout** (e.g. 5 % → 20 % → 100 %) watching Android vitals against the thresholds in §1.
* Keep a hot-fix path: CI → signed build in < 1 hour.

### Phase 7 — After launch
Watch crash/ANR rate per device model (the 8 % per-model rule bites low-end devices first), read reviews weekly, ship a
balance/bug patch within 2–3 weeks, plan content (maps, campaign, multiplayer) from retention data.

## 4. Risk register (top items)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| WebView too slow on low-end Android | medium-high | high | S0 gate; adaptive quality; WebGL renderer (Option D) |
| Touch RTS control feels bad (box-select, precision) | high on first try | high | Playtest early with prototypes, ship alternative modes (Select toggle), generous hit boxes, auto-target |
| Audio problems on iOS (autoplay, silent switch, interruptions) | medium | medium | Gesture unlock, test matrix in QA checklist, user-facing mute/volume, make voice lines optional |
| App killed in background → lost match | high | medium | Pause-on-background + save/resume (M-07) |
| Apple 4.2 rejection ("repackaged website") | low-medium | high (days) | Native features list, demo notes, tutorial, no remote code |
| Google 12-tester/14-day gate delays launch | certain if personal account | medium | Recruit testers in Phase 0; or use an organisation account |
| Name/IP conflict | unknown | high | Clearance in Phase 0, before assets |
| Balance is untested with humans | high | medium | 3 playtest rounds (QA checklist §8), difficulty tuning, easier "Easy" |
| Scope creep ("it must be perfect") | high | high | Ship gates in §5; backlog triage; defer multiplayer/campaign |

## 5. Release gates (proposed — adjust, but write numbers down)

| Area | Gate |
|---|---|
| Stability | Closed-test crash-free sessions ≥ 99.5 %; zero known crashers; vitals comfortably under **1.09 % crash / 0.47 % ANR** ✔ thresholds |
| Frame time | Low-end tier p95 ≤ 33 ms, mid tier p95 ≤ 20 ms in a 10-min Autopilot match; no frame > 250 ms after loading |
| Start-up | Cold start to interactive menu ≤ 4 s low-end (measure first; adjust) |
| Memory | No growth > 20 % over a 60-min soak; stays clear of OS kill on low-end (measure) |
| Input | 100 % of playtesters complete a match with touch only; ≥ 70 % finish the tutorial unaided |
| Lifecycle | Background/foreground, call interruption, rotation lock, low battery, airplane mode all pass the QA checklist |
| Compliance | Privacy policy live and linked in-app; data/age forms match reality; no remote code; metadata free of third-party marks |
| Regression | `tests/run_all.sh` green on the release commit; A/B balance batch shows no regression vs the previous release |

## 6. Monetisation notes (decide later, plan now)
* **Implemented for the web releases (3.1):** optional Stripe-hosted "support the game" payments with cosmetic perks, off by default, stripped from the store build — `docs/MONETIZATION.md`. Store apps would need StoreKit / Play Billing for any paid extras.
* **Premium (paid upfront):** simplest — no billing code, no ads, privacy answers stay "no data collected".
* **Free + one-time "full game" unlock:** requires **Apple in-app purchase** (3.1.1 ✔) and Google Play Billing for Play
  distribution; adds store-side complexity and receipt handling.
* **Ads:** adds SDKs → changes privacy/data forms, requires consent flows in the EU/UK, Apple's tracking-transparency
  prompt if tracking, and affects age-rating eligibility; most degrading to an RTS' UX.
* Anything involving **real money, tokens or wagering** is out of scope by decision and would trigger separate store
  policies and legal review.
* This is product guidance, not legal advice; have a lawyer review the privacy policy and any commercial terms.

## 7. Suggested first two weeks
Day 1: accounts + name search + repo/CI. Days 2–5: S0 wrapper spike on three devices, record numbers. Days 6–10: choose
the gesture scheme with a clickable prototype (`ui.cmds`, `contextCommand`, `boxSelect` are the integration points),
replace `TOPBAR/BOTTOM` constants, land lifecycle pause. Then run the QA checklist's input/lifecycle sections on devices
every week.

## Sources (accessed 6 Oct 2026)
* Google Play target API requirement — https://developer.android.com/google/play/requirements/target-sdk
* Google Play testing requirement for new personal accounts — https://support.google.com/googleplay/android-developer/answer/14151465
* Google Play listing graphic assets — https://support.google.com/googleplay/android-developer/answer/9866151
* Android vitals thresholds — https://developer.android.com/games/optimize/vitals
* Apple SDK/Xcode/iOS target requirements and age ratings — https://developer.apple.com/news/upcoming-requirements/
* App Review Guidelines — https://developer.apple.com/app-store/review/guidelines/
* App Store Connect screenshot specifications — https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications
* Capacitor support policy (v7 and "next") — https://capacitorjs.com/docs/v7/main/reference/support-policy , https://capacitorjs.com/docs/next/main/reference/support-policy
