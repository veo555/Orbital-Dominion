# Known limitations and test results (honest status)

Purpose: so the next engineer knows exactly what was verified, how, and what was **not**. "Perfect" is not a state a
game reaches; the release gates in `QA_CHECKLIST.md` define "good enough to ship".

## 00. v6.0 (16 Oct 2026): merged FORTIFY + ARSENAL

Full `bash tests/run_all.sh` on the merged tree: ALL GATES PASSED (includes sim smoke, fortify 100+ checks with mutants, arsenal 116 checks, e2e fortify/arsenal, touch, platform, PWA, audio). Two merge-induced test expectations were corrected (campaign Airfield list now includes a locked Dropship; fortify tests run with the arsenal off to keep v5 units). Not verified: balance of the new units beyond the duel simulator and `fortify_ab.js`; any real device; sound heard by a person; grounding judged by screenshots only.

## 0. Added in 4.0 (read first; the sections below describe 3.x and are kept for history)

* **Never run by a human**: the new opponent AI (bot-vs-bot Elo only), the new audio chain (offline measurements only), the new lighting/shadows (Chromium software raster only), the Material 3 layer (Chromium emulation only), the dispatch cards.
* **AI tiers**: Easy < Normal < Hard < Master is ordered but each adjacent step is only 56-73 % over 24 games (CI half-width about 18 points); Master vs Hard is the weakest step. More league training is the stated next step. Campaign missions still use the v3 AI.
* **Graphics**: perf numbers are software raster, relative only; ultra-tier bloom costs about 4 ms in software; WebKit blend modes untested.
* **Audio**: `tests/audio/world_gate.py` (building die voices of Aurora not distinct enough; one 0.999 peak) and `voice_gate.py --quick` (18 prosody/timing checks) are known failing and were not triaged; they are not part of `run_all.sh`. No Schroeder/FDN reverb was added; `audioRoom()` is not called by gameplay.
* **ElevenLabs**: never called (egress blocked, no key). Free plan: about 10 000 credits per month, no commercial licence (so not for the store build), API access on it disputed. The pipeline exists, is offline and optional.
* **Sources**: DeepMind's AlphaStar page, the video, arXiv and gwern were unreachable; the research note says which facts come from search summaries and which from memory.

* **Weak check (v5):** `e2e_audio_engine.py` `chk_orphan` (orphaned audio source nodes are retired) cannot be mutation-proven any more: with the sweep disabled the test nodes still retire in current Chromium. It stays as a regression check only.

## 1. What was verified, and how

| Claim | Evidence | Reproduce |
|---|---|---|
| Builds to one file, ~500 KB, no external URLs | `build.py`; browser gate records **0 non-`file:/data:/blob:` requests** | `python3 tests/e2e/e2e_smoke.py` |
| No console errors / page errors in normal play | Playwright listeners on `console` (error+warning) and `pageerror` over menu → match → Autopilot 150 s → panels | same |
| Simulation never throws, resources stay finite/non-negative, supply ≤ cap, wallets finite | 6 seeds (3 factions each side) × 5 game-minutes with Autopilot | `node tests/sim/smoke.js` |
| **Bit-exact determinism** for fixed `(seed, RS)` | FNV hash of all team/unit/building state after 4 game-min, two runs identical; a different `RS` gives a different hash (so `Math.random` is still used) | same |
| Swarm OFF leaves the v3 layer inert: with the same seeded `Math.random` stream the v3 build (swarm off) reproduces **v2's enemy-side state exactly** (3 seeds × 300 s × 2 RS values = identical in 6/6); enemy AI still plays | smoke checks (3) and (3b); `tests/sim/off.js` prints the numbers | `cd tests/sim && RS=5 node off.js ../../src/js 1,2,3 300` vs `RS=5 LIB=./simlibv2.js node off.js ../../baseline/v2/src/js 1,2,3 300`. Without `RS`, runs differ by `Math.random` noise only. Caveat: Kaz's Shockwave nerf (v2→v3) is the one intended balance change, which matters only once Kaz casts it |
| Natural-language parser answers in words, rejects nonsense | 8 mandatory + 4 state-dependent phrases | smoke (d) |
| HUD does not clip at 1366 / 1280 / 1100 / 1024 px wide | `e2e_smoke.py`; exploratory `e2e_topbar_responsive.py` covers down to 700 px | |
| Autopilot strength (headless) | 24 matches × 18 game-minutes vs built-in **Normal** AI, factions = `seed % 3` vs next faction: **10 W / 9 undecided / 5 L**, score 0.60 (W = 1, undecided = ½), SE ≤ 0.10 | `node tests/sim/match2.js <seeds> 18 normal` with `RS=11` |
| Step cost | 0.31 ms per `step()` (Autopilot, dozens of agents, ~8 game-min); Autopilot-off is slightly cheaper | `e2e_perf.py` |

### 1.0 Added in 3.1 (all in headless/emulated Chromium on Linux, software rendering)

| Claim | Evidence | Reproduce |
|---|---|---|
| Phone layouts fit: no HUD element clipped, command buttons ≥ 40 px, map share 62 % (844 × 390) / 74 % (412 × 915) | `e2e_touch.py` | `python3 tests/e2e/e2e_touch.py` |
| Touch gestures work (tap select, tap command, pan, pinch, hold-box-select, double-tap, hold-add, minimap, command card, placement with confirm bar, groups, long-press help without firing) | same, real multi-touch via DevTools | same |
| App lifecycle: auto-pause on hide, Back = pause in an installed app, install flow shown for an iPhone user-agent, settings persist | `e2e_platform.py` | `python3 tests/e2e/e2e_platform.py` |
| Web app: manifest valid, Chrome installability verdict clean (checker proven sensitive with a broken manifest), service worker activates, **reload and a full match work with the network off**, update waits for consent, no off-origin requests | `e2e_pwa.py` | `python3 tests/e2e/e2e_pwa.py` |
| HD terrain tiles: 1× base map unchanged (seeds 7/21/99), tiles deterministic, tile joins ≤ 13/255 vs one reference bake, memory bounded (≤ 14 tiles even at 4K), decals replayed, tier switch drops tiles | `e2e_terrain.py` | `python3 tests/e2e/e2e_terrain.py` |
| Payments (client): off by default and inert; link-mode and API-mode flows against a mocked backend; hostile redirects refused; perks cosmetic (identical game state); store/native hide it; zero stray requests | `e2e_support.py` (28 checks) | `python3 tests/e2e/e2e_support.py` |
| Payments (server): signature verification, server-side pricing, tokens, CORS, refund revocation, no secret leakage — **5 injected security bugs all caught** | `server/stripe-worker/test/worker.test.mjs` (9 tests) | `cd server/stripe-worker && npm test` |
| Colour tokens: primary text 12.6–17.2:1, all data colours ≥ 5.2:1 on every surface; colour-blind-safe pair ΔE00 ≥ 54 under protan/deutan/tritan (default pairs fall to 17–18) | `tools/design_check.py` | `python3 tools/design_check.py` |
| Simulation untouched: determinism hash (`9183bd53`) and swarm-off ≡ v2 baseline unchanged | `tests/sim/smoke.js` | `node tests/sim/smoke.js` |
| Render cost (software raster, relative only): high tier at DPR 1 = 14.9 ms vs 14.5 ms in 3.0; DPR 2 / zoom 1.7 with tiles +23 ms; first draw of a tile spikes 25–50 ms | `tools/perf.py` | `python3 tools/perf.py --dpr 1 2 --zoom 1 1.7` |

**Test-quality incidents found and fixed while building 3.1** (so you know the gates earned their keep, and which assertions had to be repaired):
* the original `e2e_smoke.py` clicked an element *handle* that the re-rendering Swarm panel had already replaced — **the unmodified 3.0 build failed it 2 times in 6**; now selector-based;
* a touch-test assertion ended in `||true` (vacuous) and was replaced by a check that a long-press does not fire the pressed button;
* the CDP installability check returns `[]` for *any* manifest in the default headless shell; the PWA test now uses the full Chromium build and was verified against a deliberately broken manifest;
* a 500 ms click-suppression window after long-press swallowed legitimate quick taps (measured: taps up to ≈ 450 ms later were lost); now 120 ms;
* the adaptive quality scaler first read a blocked main thread as "slow GPU" and downgraded the tier; stalls and background tabs are now ignored;
* high-quality image resampling on the large terrain canvas cost +140 % frame time; restricted to sprites;
* tile cache could exceed its memory cap on huge viewports; now only the nearest 14 tiles are baked;
* in portrait the floating info card covered the control-group chips; relocated.

### 1.1 Reading the balance numbers correctly
* One match is a noisy Bernoulli-like outcome; with N = 24 the standard error of a win-rate/score is up to
  √(0.25/24) ≈ 0.10. **Any claim of the form "change X improved results" needs ≥ 24 paired seeds and a difference
  well beyond 0.1** — an early opening tweak looked bad in one 12-match batch (4 W / 6 L / 2 D) and neutral in a
  24-seed A/B. Fights are knife-edge (Lanchester square law), so small timing differences flip single outcomes.
* Faction matchups are not equal: Meridian vs Obsidian-rush improved from 2 W / 1 D / 5 L to 4 W / 2 D / 2 L after the
  fixes below, but n = 8 — treat as directional only. Obsidian rush remains the hardest matchup for a turtle.
* All numbers are against the **built-in AI**, which cheats by knowing your start corner and does not scout; they say
  little about how a human would fare against Autopilot (or Autopilot against a human).

### 1.2 Added in 3.2: story, campaign, cinematics, sound (headless Chromium and Node only; read with §3)

* **Story data** is checked by `tools/validate_story.js`: structure, ids, timing (lines are read at 19 characters a second),
  scripted spawn and building tiles on each mission's own map, flags read only after being set, radio line counts, and the
  unlock chain. Its self-test (`tests/story/validate_selftest.js`) corrupted a valid fixture in 56 ways (59 since 4.0, see 1.4) and checks that each is caught.
* **Campaign runtime** (`tests/sim/campaign.js`): every condition and action operation, restrictions, the hold and resume
  protocol, determinism, malformed data, the save helpers, and swarm-off inertness. All checks pass.
* **Sound**: a headless browser starts a real match (which creates the audio context), plays all 25 music cues, and fires
  unit, building, hero and cinematic sounds and speech with no page errors. Offline rendering is deterministic by design
  (each voice has a seeded generator). The objective metric gates in `tests/audio/` exist but were not executed in this pass.
* **Cinematics** (removed in 4.0, see 1.4): in 3.2 every one of the 19 effect kinds drew pixels in a headless browser.
* **Content**: 32 films (text dispatches since 4.0) and 9 missions exist and validate. The generated screenplay (`docs/story/SCRIPT.md`) is produced by `tools/story_to_md.js`.

### 1.3 Added in 3.3: campaign balance measured, save/resume (headless only; read with §3)

Every mission was played 24 times (`node tests/sim/campaign_balance.js <id> --full`, built-in AI on the player side at the mission difficulty, a different seeded random stream per run, 2-3 worker processes). The AI is a stand-in for a human: it knows nothing of scripted objectives, so these are sanity bounds, not difficulty.

| Mission | AI win rate (95 % CI) | Median win time (par) | Reading |
|---|---|---|---|
| m01 Lamp Night | 96 % (80-99) | 720 s (780) | survive-until-dawn: ends at the clock; the scripted final strike finds nobody in its circle in AI runs (it is a threat to a human who stands there) |
| m02 The Waking Fund | 58 % (39-76) | 852 s (1200) | inside the 55-85 % design band |
| m03 The Axis | 100 % (86-100) | 441 s (900) | easy for the AI |
| m04 Ember Census | 100 % (86-100) | 728 s (900) | easy for the AI; two branch triggers (enemy Era III, hauler lost) are `optional` now |
| m05 Glass Market | AI cannot play it (stealth route) | - | walkthrough bot wins 3/3 in about 70 s (par 900 is generous) |
| m06 The Third Bell | AI loses 100 % (army walks into the turret ring) | - | with 4 turrets the bot lost; with 3 the bot wins 3/3 (726 s, the clock). **Changed: one turret removed** |
| m07 The Choir Spire | 100 % (86-100) | 437 s (900) | easy for the AI |
| m08 Patience | AI cannot play it (escort) | - | walkthrough bot wins 3/3 in 51 s |
| m09 The Closing | AI cannot play it (ends with the hero's death) | - | stock AI breaks garrison and Foci; hero walkthrough wins 1/3 (the AI loses the Hub in the rest). **Changed: the win now needs the Foci destroyed** (before, the closing could fire with them standing) |

What this does and does not say: the missions are completable (the scripted objectives fire, no crashes, no stalls, deterministic); several are easy for a plain skirmish AI. How hard they are for a person is **unmeasured**. A win rate of 24 runs has a standard error of about 0.10.

* **Save/resume**: the whole match is serialised (`46_save.js`). Tested: restoring a snapshot and running N more ticks gives the same state hash as running on without the round trip (skirmish, AI-vs-AI, campaign missions m01-m03), and tampering with the snapshot changes the outcome (so the comparison can fail). Browser: autosave on backgrounding, Continue after reload, terrain rebuilt, slot erased at game over, corrupt slot rejected. **Not verified**: iOS Safari / WebView storage limits (a snapshot is about 300 KB of localStorage), restoring after a version upgrade (a snapshot of another version is refused, not migrated), restoring a match saved inside a blocking cinematic (autosave is skipped there).
* **Audio e2e gates were run for the first time** (`e2e_audio_engine.py`, `e2e_audio_wiring.py`, `e2e_soundlab.py`, now part of `tests/run_all.sh`; all pass). They found one real bug, fixed in `80_audio.js`: music notes still scheduled when a cue was stopped were cut from the graph, never fired `ended`, and permanently used up the node budget; a sweep now retires them. The other failures were stale tests (written before the unit/music modules registered at load; they now run those contracts on an engine-only page and assert the new invariants on the full page) and one negative control that did not depend on the caster. The objective DSP gates in `tests/audio/*.py` (loudness, spectra) were still not run. Nothing has been heard by a person.
* **Pre-existing flaky assertion fixed**: "perks are cosmetic" compared two matches that were not seeded for `Math.random` (about 30 sim calls still use it, BACKLOG B-20); it failed on a build older than 3.2 as well. It now pins `Math.random`.

### 1.4 Added in 4.0 (T1): videos removed, text dispatches (headless Chromium and Node only; read with §3)

* **What was removed:** the cinematic engine and its art (`64_cine_bg_*`, `64_cine_props`, `65_cine_fx`, `66_cine`), the film overlay and CSS, WebM export, the film contact-sheet tools and `e2e_cine.py`. Build size `dist/orbital_dominion_v4.html` went from 2,026,361 to 1,322,454 bytes.
* **Story preserved:** `tools/films_to_dispatch.js` (one-shot, deleted after use) converted the 32 films; a throwaway check against the v3 source compared all 278 spoken lines (text, speaker, style) and the 32 ids / kinds / titles / order: 0 differences. The 39 scene title cards became `heading` lines. `docs/story/SCRIPT.md` was regenerated; a script check found all 430 dispatch and radio lines in it, in order.
* **Validator:** `node tools/validate_story.js`: 0 errors, 0 warnings on the real story (including the map checks). `node tests/story/validate_selftest.js`: the fixture validates with 0 errors and 59 mutations are each caught with their expected message (the film-only mutations were deleted, dispatch ones added).
* **Campaign UI:** `e2e_campaign.py` drives prologue, briefing, in-mission blocking dispatch (hold, two queued cards, Esc, hotkeys do not leak), debrief, defeat, archive, reset and reload, Enter / Space / Esc, touch taps and the five layouts (1366x768, 1024x768, 844x390, 390x844, 412x915: no horizontal overflow, 44 px targets on touch, a 34-line dispatch scrolls inside its card). Rule 15: six deliberately broken builds (Enter / Space handler removed, cards not marked seen, previous screen not restored, Skip all not marking cards read, hold not honoured, hotkeys leaking) were each caught by it; a seventh break (debrief shown over a held card) failed four checks before the fix in `90_main.js`.
* **Not changed:** simulation, AI, balance. `tests/sim/campaign.js` (394 checks), `campaign_walkthrough.js` and `save.js` pass after the `cine` to `dispatch` rename; `tools/mission_check.js` reports 0 errors (13 warnings, not compared with v3). A balance smoke run of m01 and m04 (1 run each) and m04 again (3 runs) completed; these are smoke runs, not balance claims (CLAUDE.md rule 8).
* **Not verified:** a real phone, WebKit / iOS momentum scrolling in the transcript, screen readers (the card has dialog / region roles and labels, never tested with VoiceOver or TalkBack), and whether the mood music that opens with a card (`musicPlay` on the dispatch's `mood`) sounds right: the audio gate only observes that the call is made and that closing the card stops it. `e2e_touch.py` has a pre-existing flaky double-tap check (it also fails on the v3 build).

## 2. Defects found and fixed in the final round (regression ideas)
1. Overseer stalled unit production while "saving" for a build that was short only of *ether*, with 500+ crystals
   floating → saving now triggers only when crystals are the bottleneck (`ovBuildings`, era branch).
2. A second-Garrison rule was inert because an unaffordable Armory `break`-ed the loop → `continue`.
3. First Garrison could be placed behind a cliff (≈15 s walking detour; first soldiers at t ≈ 93 s) → Overseer-only
   path-checked `findSpot` (`pathCheck`) and an earlier garrison gate; first soldiers at ≈ 54 s.
4. Focus-fire chased the tanky enemy hero through the enemy line → `heroKillTime ≤ 4 s` gate.
5. Kaz's Shockwave (55 damage) one-shot 55-HP Riflemen → `30 + 20·level`.
6. HUD chip showed a stale preset name for up to 0.5 s; clock showed "2:3" → now "Day 1 · 2h 3m".
7. Top bar clipped the menu button ≤ 1024 px → responsive CSS (`@media` at 1180 / 900 / 760).
8. Spurious toasts ("Not enough ether", repeated "Build more Generators") from `queueHero` → affordability and
   supply checks.

## 3. NOT verified (do not assume)
* **No real device has ever run this — including after 3.1.** "Works on iPhone and Android" currently means: *Chromium emulating their viewport, pixel density, touch input and (for iPhone) the user-agent string*.
  Specifically **unverified**: Safari/WebKit behaviour (Add to Home Screen, audio unlock and the silent switch, 100vh/URL-bar resizing, notch safe areas, canvas memory limits — iOS Safari caps a canvas at ≈ 16.7 Mpx and total canvas memory),
  Android WebView / Chrome on real GPUs, Firefox, thermal throttling, low-memory kills, 120 Hz panels, real thumbs on glass, haptics, the on-screen keyboard, fullscreen/orientation APIs, `beforeinstallprompt` (cannot be triggered in emulation).
  The code is written defensively for these (try/catch around every optional API, feature detection) but defensive is not verified.
* No Safari/WebKit, Firefox, Android WebView, WKWebView, no GPU, no thermal throttling, no low-memory conditions.
* **Audio is untested in any real browser** (WebAudio synthesis + `speechSynthesis`); iOS autoplay/mute-switch/
  interruption behaviour is unknown.
* **No human playtest**: balance, difficulty curve, clarity of the swarm UI, and fun are unmeasured.
* No accessibility audit (colour contrast, colour-blindness, text scaling, reduced motion).
* No long-session soak (30–60 min), no memory-leak profiling, no soak of save/resume across long sessions.
* No security review — but the attack surface is currently nil (no network, no storage except settings).

* **Nothing has been heard.** Music, voices and effects have not been listened to by a person. Loudness, balance and taste are unmeasured by ear.
* **The campaign has not been played by a human and has not been balanced.** Mission difficulty for a person is unknown; the AI stand-in was run (§1.3).
* **No films any more (4.0).** The story is text dispatches; their legibility and scrolling were checked in Chromium emulation only (844x390, 390x844, 412x915, 1024x768, 1366x768), not on a real phone or in WebKit.
* **Speech depends on the device.** Voices differ across Android WebViews, iOS and desktop. The synthesized fallback voice was checked only as a signal, not for intelligibility.
* **Phone screens were reviewed only as Chromium emulation screenshots** (campaign select, briefing, match with radio strip at 844x390 and 412x915; geometry is asserted by `e2e_campaign.py`); debrief and Sound Lab rely on those assertions.
* **Writing quality** comes from automated authoring passes checked by the validator (structure, references, timing). No editor has read the script.


## 4. Known limitations of the product
1. *(3.0 limitation, resolved in 3.1 — emulation only)* Touch input and phone layouts now exist; see §1.0 and `docs/TOUCH_SPEC.md`. The `screenshots/mobile_*` files in this package show the **3.0** layout, not the current one (regenerate with `tools/shots.py`).
2. *(resolved in 3.1)* HUD geometry is measured, not fixed. Remaining: on a 390-px-tall screen the map gets 62 % of the height, below the 70 % goal.
3. **No save/load**: a match is lost if the OS or browser discards the page. The game now auto-pauses when hidden, so a backgrounded-but-alive page resumes intact. Settings (and the optional-payment supporter flag) persist in `localStorage` only.
4. Rendering has no interpolation; the sim runs at 30 Hz.
5. 1v1 vs AI on one map size; no campaign, no multiplayer, no tutorial beyond the objectives list.
6. The built-in AI "knows" your corner; the Overseer scouts honestly. Autopilot cannot dodge **instant** hero spells,
   only telegraphed orbital strikes.
7. The Overseer is rule-based. It cannot reason about situations its rules do not cover; the NL grammar understands a
   few dozen phrasings.
8. English only. Text is hard-coded in JS (no string table).
9. Help text in `72_menus.js` is hand-written and can drift from the data tables — audit it after any balance change.

## 5. Technical debt
* One global scope, no modules, no types, no linter. Fine for a 6 k-line single file; limiting for a team.
* ≈ 30 sim-affecting `Math.random()` calls (determinism, replays) — see BACKLOG B-20. ≈ 13 more in art/audio/UI are
  cosmetic and fine.
* `G` is not serialisable as-is (see ARCHITECTURE §6).
* Test scripts in `tests/e2e/e2e_*.py` (except `e2e_smoke.py`) print rather than assert.
* The enemy AI (`40_ai.js`) and the Overseer (`27_overseer.js`, ~1,000 lines) duplicate some build-order logic.
