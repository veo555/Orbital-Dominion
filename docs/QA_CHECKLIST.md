# Release QA checklist

Run the whole list on **every release candidate**. Tick = verified on the named device, with date and build number in
`docs/QA_LOG.md` (create it). A failed item blocks the release unless an explicit waiver is written next to it.

## 0. Automated gates (must be green first)
- [ ] `bash tests/run_all.sh` (build + sim smoke + browser smoke) on the release commit
- [ ] `node tests/sim/match2.js` batch (≥ 24 seeds × 18 min, `RS=11`) — no exceptions; results recorded vs previous release
- [ ] Wrapper builds produced by CI from the tag (`.aab` targeting **API 36**, `.ipa` built with **Xcode 26+**)
- [ ] No network requests in the packaged app (inspect with a proxy or the OS network profiler) unless a feature declares them

## 1. Device matrix (fill in real devices)
| Tier | Android | iOS/iPadOS |
|---|---|---|
| Low | ~2019 mid-range phone, 3–4 GB RAM, Android 10–12 | oldest supported iPhone (iOS 15/16+, per wrapper) |
| Mid | current mid-range, Android 14–16 | iPhone from the last 2–3 years |
| High | current flagship | current iPhone + an iPad |
| Odd | foldable/tablet or Chromebook (Play asks ≥ 4 large-screen screenshots) | small-screen iPhone (SE class) |
Also test: one device with **system font size at maximum**, one with **dark mode + battery saver**, one on **OS beta** if available.

## 2. Install and launch
- [ ] Fresh install, first launch < budget (record seconds); no blank screen > 300 ms
- [ ] Update install over previous build keeps settings (and saved match, once M-07 exists)
- [ ] Offline (airplane mode) launch and a full match work
- [ ] App icon, name, splash correct (adaptive icon on Android; no alpha on iOS 1024 icon)
- [ ] Uninstall leaves nothing the user cares about

## 3. Input (touch) — every action reachable without a keyboard
- [ ] Pan, pinch-zoom, two-finger pan, minimap tap/drag
- [ ] Select: tap, box (long-press or Select mode), double-tap type, add/remove from selection, idle worker/army/hero buttons
- [ ] Orders: move, attack, attack-move, stop, hold, gather (crystal, ether siphon), repair, rally point, queue waypoints, patrol/guard point roles
- [ ] Build: open build menu, place ghost with visible validity, confirm/cancel, cancel construction
- [ ] Command card: train, research, era advance, hero skills (learn + cast incl. targeted), siege mode, stim
- [ ] Control groups: set, add, recall, camera jump
- [ ] Panels: Economy (taxes, market trade), Swarm (all four tabs), command box via on-screen keyboard (+ dictation)
- [ ] Multi-touch edge cases: third finger, finger leaving the screen edge, palm touches, stylus
- [ ] No accidental browser behaviours: pull-to-refresh, double-tap zoom, text selection, long-press menu, back-swipe exiting mid-match

## 4. Core gameplay (per faction × difficulty; at least one full match each on a real device)
- [ ] Meridian / Obsidian / Aurora: start, economy, era II, era III, hero, unique unit, win and lose conditions, end screen + chart, restart, to-menu
- [ ] Easy / Normal / Hard behave as described; seeds reproduce the same map
- [ ] Fog, high ground, detection, day/night, creep camps, orbital strikes, stims, siege, healing, supply cap messages
- [ ] Taxes/morale/habitats; market trade; Freighter routes; Watchtower/Trading Post capture
- [ ] Pause/resume, speed 1×–N×, surrender confirmation

## 5. Swarm / Overseer
- [ ] Master switch on/off at any time (J / button); presets Autopilot / Advisor / Manual
- [ ] Enroll/release agents; assign each of the 12 roles individually and to a group; point roles (Guard/Patrol/Escort) with touch
- [ ] Right-click-equivalent override returns control to the agent afterwards; Stop holds ~20 s
- [ ] Advise mode: proposals appear, approve works, stale proposals expire; Act mode logs every action
- [ ] Natural-language box: all example chips, unknown phrases rejected politely, "status", "why"
- [ ] Autopilot 20 min on a real device: no stall, no error toasts storm (see `e2e_toast_audit.py`)

## 6. Marketplace and economy
- [ ] Hire on each cadence (minute/hour/day/month/task); price shown = price charged; floating vs locked behaviour visible
- [ ] Notice vs dismiss; contract expiry; payroll when out of crystals (agents quit/behaviour as designed)
- [ ] Job board: accept, progress, success payout, failure/expiry, escrow refund, client reputation
- [ ] Wage events (shortage/glut) announced; ledger totals reconcile (sum of ledger lines = change in crystals attributable)
- [ ] Wallet/gear/XP progress and field clinic

## 7. Performance and resources (record numbers)
- [ ] 10-min Autopilot match: p50/p95 frame time, long-frame count, min FPS; same at max zoom-out and in a 100-unit fight
- [ ] Cold start time; time to first interactive frame
- [ ] Memory: start, after 30 min, after 60 min (soak); no growth trend
- [ ] Battery drain per 30 min at default and in battery-saver mode; device temperature after 20 min
- [ ] No ANR/jank when the on-screen keyboard opens; no thermal throttling cliff within 30 min on the mid device

## 8. Lifecycle and interruptions
- [ ] Home button / app switcher → match pauses; return resumes cleanly; audio resumes
- [ ] Incoming call / alarm / notification shade / Siri / assistant invocation
- [ ] Screen lock/unlock; auto-lock disabled during play or handled
- [ ] Rotation lock honoured; split-screen/multi-window behaviour defined (block or support)
- [ ] OS kills the app in background → relaunch offers resume (M-07)
- [ ] Low battery / battery saver; airplane mode toggled mid-match
- [ ] Android back button and gesture navigation; iOS swipe gestures near screen edges don't fight the camera pan

## 9. Audio
- [ ] Sound starts only after a user gesture, reliably on first tap (iOS + Android)
- [ ] Music/SFX sliders and mute work; mute persists
- [ ] iOS silent switch behaviour is the intended one; headphone plug/unplug; Bluetooth route change
- [ ] Voice lines (`speechSynthesis`): present/absent gracefully; optional; never blocks the game
- [ ] No clipping/crackle at max SFX density (big fights); no audio after pause/background

## 10. Layout
- [ ] Every HUD element visible and unclipped at 844×390, 932×430, 1024×768, 1180×820, portrait menus; notch/cutout safe
- [ ] Text readable at default font size; with large system font nothing overlaps
- [ ] Dark/light OS mode irrelevant (game is dark) — status/navigation bars styled sensibly

## 11. Accessibility
- [ ] Factions distinguishable without colour (shape/emblem markers); contrast of HUD text ≥ 4.5:1 for body text
- [ ] Text scale option; reduced-motion option (screen shake, flashing, fast pulses)
- [ ] No information conveyed by sound alone (alerts also visual)

## 12. Store compliance
- [ ] Target API 36 verified in the bundle; Xcode 26+/iOS 26 SDK verified in the archive
- [ ] Privacy policy URL live, reachable in-app; Data safety / App Privacy answers match the shipped SDK list
- [ ] Age/content rating questionnaires answered honestly (Apple's new system; IARC for Play)
- [ ] No remote code execution/loading; no references to other platforms' stores; no unfinished/placeholder content; no crash on first launch
- [ ] Store metadata free of third-party trademarks; screenshots show real gameplay from the shipped build
- [ ] App Review notes: no login, how to reach the Swarm panel, the Overseer is rule-based
- [ ] Billing (if any): Apple IAP / Play Billing only for digital goods; restore purchases works

## 13. Human playtest protocol (3 rounds, ≥ 10 new players each, phone only)
1. Observe silently with think-aloud; no coaching. Record: time to first successful order, tutorial completion, mis-taps,
   points of confusion about the swarm UI, match completion, subjective difficulty (1–5), "would you play again".
2. Between rounds fix the top 5 friction points; repeat. Targets: ≥ 70 % tutorial completion, ≥ 60 % finish a first match.
3. Keep raw notes in `docs/PLAYTEST_*.md`; link fixes to BACKLOG IDs.

## 14. Sign-off
Release manager: ____ · Build/version: ____ · Date: ____ · Waivers: ____ · Next hot-fix owner: ____
