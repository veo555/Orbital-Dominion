# Orbital Dominion v3 — project handoff package

A real-time strategy game (three factions, three eras, fog of war, heroes, a Caesar-style colony economy, a
Patrizier-style market) with a **swarm-agent layer**: every unit can be an autonomous agent with a role, a wallet and
XP; a master AI ("the Overseer") directs the colony; a labour marketplace lets you hire freelancers and take jobs on
five billing cadences (minute / hour / day / month / per task).

It ships three ways from one source tree (`python3 build.py`): a **single self-contained HTML file**
(`dist/orbital_dominion_v3.html`, ≈ 2 MB since 3.2, no external requests, no libraries) to download and share; an **installable,
offline-capable web app** (`dist/pwa/`); and a **store build** (`dist/store/`) for Capacitor wrappers. See `docs/DEPLOY.md`.

> **Read first:** `docs/KNOWN_LIMITATIONS_AND_TEST_RESULTS.md` (what has and has not been verified — **no real phone has run
> this yet**) and `docs/STORE_RELEASE_ROADMAP.md` (what stands between this and the stores).

## 0. What changed in 3.2 (8 Oct 2026): story, campaign, cinematics, sound

The game now has a single-player campaign, *The Lantern Tithe*: nine missions in three acts, films between them, and a
new sound engine. Everything here was produced by automated authoring passes and checked with the commands below. Read
the last column before relying on any claim.

| Area | What is in the build | Checked in headless Chromium / Node | Not checked |
|---|---|---|---|
| **Story** | 9 missions; 16 characters (8 good, 3 evil, the rest grey or narrator); 32 films (intro ≈ 81 s, 9 briefings, 9 debriefs, 8 interludes, ending ≈ 128 s, credits, 3 defeat scenes; ≈ 20 min of film, 391 spoken lines); 113 radio lines; hero and worker barks | `node tools/validate_story.js`: 0 errors, 0 warnings. `node tests/story/validate_selftest.js`: 56 deliberate corruptions, all caught | Whether the writing lands with players; no editor has read it |
| **Campaign** | Chapter select, briefings, radio strip, objectives and stars, debriefs, progress saved in the browser, cinematics gallery | `node tests/sim/campaign.js`: 394 checks pass (every condition and action op, restrictions, determinism, swarm-off inertness, save helpers) | Difficulty for humans; the balance playtests (`tools/mission_sim.js`, `tests/sim/campaign_balance.js`) exist but were not run |
| **Cinematics** | Real-time procedural films: 12 backgrounds, 12 prop kinds, 19 effects, portraits drawn from each character's look data, subtitles, skip, WebM export where the browser can record | A headless browser draws every effect kind; the crowd, banner and unit props were spot-checked; the intro plays for 2 s with no painter errors | Real GPUs and phones; WebM export on iOS; subtitle legibility on phones |
| **Sound** | Synthesized engine; 478 voices (unit types × factions, workers and fighters, hero skills, buildings, UI, cinematic sfx); 25 music cues including the three faction themes; leitmotifs; synthesized character voices, plus device speech where available; Sound Lab under Settings | A headless browser starts a real match (creating the audio context), plays all 25 music cues, and fires unit, building, hero, cinematic sounds and speech with no page errors | **Nobody has listened to it.** Loudness, balance and taste are not measured by ear |

Commands: `python3 build.py` (rebuild every variant), `node tools/validate_story.js` (story data), `node tests/story/validate_selftest.js`
(the validator's own mutation test), `node tests/sim/campaign.js` (campaign runtime), `node tests/sim/smoke.js` (simulation),
`python3 tools/cine_contact.py` (contact sheets of film frames).

---

## 0b. What changed in 3.1 (6 Oct 2026)

| Area | Change | Evidence |
|---|---|---|
| **Phones and tablets** | three responsive layouts (desktop / landscape phone / portrait phone), measured HUD geometry instead of the fixed 44/198 px constants, Pointer-Events touch layer (pan with inertia, tap select / command, hold-to-box-select, pinch zoom, minimap, long-press help sheets, placement confirm bar, touch dock), iOS zoom blocking, safe-area insets. Map share of an 844 × 390 phone screen: 38 % → 62 %. | `tests/e2e/e2e_touch.py` (real multi-touch, iPhone + Pixel profiles) · `docs/TOUCH_SPEC.md` |
| **Design** | documented colour tokens, hover only where hover exists, focus ring, reduce-motion, colour-blind-safe team palette (blue vs orange), menu reflow, touch wording | `tools/design_check.py` (WCAG contrast + CIEDE2000 under protan/deutan/tritan) · `docs/DESIGN_SYSTEM.md` |
| **HD graphics** | quality tiers + adaptive scaler, sharp 2×/3× terrain tiles near the camera (1× base unchanged: identical pixel hashes), retina-crisp icons / charts / minimap, resampling quality only where it pays, glow / vignette / dust effects | `tools/perf.py`, seam test (tile join ≤ 12/255 vs a single bake) |
| **App behaviour** | auto-pause and audio suspend when backgrounded, wake-lock, Android Back = pause (installed), fullscreen, install button (Android prompt / iPhone instructions), share | `tests/e2e/e2e_platform.py` |
| **Web app** | manifest, offline-first versioned service worker with an update prompt, icons + logo, `_headers`, CI + Pages workflows | `tests/e2e/e2e_pwa.py` (offline reload and match, Chrome installability verdict, update flow) |
| **Optional payments** | Stripe-hosted checkout (Payment Links or a Worker backend), cosmetic perks only, **off by default**, hidden in store/native builds | `tests/e2e/e2e_support.py` (28 checks) · Worker unit tests (9, mutation-tested) · `docs/MONETIZATION.md` |

New commands: `bash tests/run_all.sh` now runs every gate (≈ 5 min); `python3 tools/shots.py` renders device screenshots; `python3 tools/perf.py` measures render cost;
`python3 tools/design_check.py` verifies the colour tokens; `npm run serve` serves the web app on :8080.

---

## 1. Quick start

```bash
# requirements: Python 3.9+, Node 18+ (tested with Node 22), for browser tests: pip install playwright && playwright install chromium
python3 build.py                 # src/  ->  dist/orbital_dominion_v3.html   (pure concatenation, no dependencies)
open dist/orbital_dominion_v3.html   # or double-click; it runs from file://

bash tests/run_all.sh            # build + simulation smoke (~40 s) + browser smoke (~40 s)
```

Individual gates and tools:

| Command | What it does |
|---|---|
| `node tests/sim/smoke.js` | Headless regression gate (~1 min): 6 seeds × 3 factions with Autopilot, invariants (finite resources, supply ≤ cap, no NaN wallets), **bit-exact determinism**, **swarm-off ≡ v2 baseline** (3 seeds), natural-language parser checks |
| `python3 tests/e2e/e2e_smoke.py` | Real-browser gate (Playwright/Chromium): boots with zero console errors and **zero network requests**, Autopilot plays 150 s, Swarm panel/tabs/command box, hotkey isolation, pause semantics, top-bar fit at 4 widths |
| `python3 tests/e2e/mobile_probe.py` | *Informational*: phone/tablet viewports with touch; writes screenshots to `tests/out/` (shows the current mobile gaps) |
| `node tests/sim/match2.js 21,22,23 18 normal` | Autopilot vs. built-in AI, seeds × game-minutes × difficulty (set `RS=7` for a seeded `Math.random`, `SRC=<dir>` to test another source tree) |
| `node tests/sim/eco.js 1,2,3,4,5,6 300` | Deterministic early-game economy metrics (supply-blocked seconds, floating crystals, army size) |
| `node tests/sim/timeline.js 7 10` | Per-30-s timeline of one match (resources, supply, roles, enemy) + Overseer log tail |
| `RS=5 node tests/sim/off.js ../../src/js 1,2,3 300` (and `RS=5 LIB=./simlibv2.js … ../../baseline/v2/src/js`) | Swarm-OFF equivalence printout (run from `tests/sim/`; **always set `RS`** or `Math.random` noise hides the comparison). The same check runs as an assertion in `smoke.js` |
| `tools/ab.sh <srcA> <srcB>` | Parallel A/B balance comparison of two source trees over 24 seeds |
| `tools/diag/*.js` | ~30 single-purpose diagnostic scripts used while tuning (kept as worked examples of how to probe the sim) |
| `tests/e2e/e2e_*.py` | The exploratory Playwright flows used during development (print, don't assert) — useful as recipes |

## 2. Folder map

```
README.md, CLAUDE.md          this file · briefing for an AI coding agent working in the repo
build.py                      concatenates src/js/*.js (alphabetical) + style.css + body.html into dist/...html
package.json                  npm scripts (no runtime dependencies)
src/
  body.html                   HUD / menu / panel markup (ids referenced from JS)
  style.css                   all styling (responsive breakpoints at 1180 / 900 / 760 px)
  js/                         the game, 18 modules, numeric prefix = load order (see docs/ARCHITECTURE.md)
dist/orbital_dominion_v3.html the built single-file game (identical to what build.py produces)
tests/
  sim/                        headless Node harness (vm sandbox) + smoke / match / eco / equivalence scripts
  e2e/                        Playwright scripts (e2e_smoke.py is the gate; the rest are exploratory)
  run_all.sh                  build + both gates
tools/                        A/B scripts, diag/ probes
baseline/v2/                  previous version (source + build) — reference for swarm-off equivalence
baseline/v1/                  first version, reference only
screenshots/                  reference screenshots of the v3 UI and of the *current* mobile layout problems
docs/                         all handoff documents (below)
```

## 3. Documents

| File | Purpose |
|---|---|
| `docs/STORE_RELEASE_ROADMAP.md` | Phased plan from this web build to App Store / Google Play, with the **verified (Oct 2026)** store requirements, wrapper decision, effort ordering and release gates |
| `docs/ARCHITECTURE.md` | Module map, simulation loop, swarm/Overseer/economy design, math, determinism, test hooks, extension recipes |
| `docs/GAME_DESIGN.md` | Factions, eras, units, buildings, systems — the design reference (also source material for store listings and a tutorial) |
| `docs/KNOWN_LIMITATIONS_AND_TEST_RESULTS.md` | Honest status: measured results, what was *not* tested, known issues, technical debt |
| `docs/QA_CHECKLIST.md` | Release QA matrix: devices, functional, performance, lifecycle, audio, store compliance |
| `docs/BACKLOG.md` | Prioritised work items (P0/P1/P2) with acceptance criteria |
| `docs/KICKOFF_PROMPT.md` | A ready-to-paste first prompt for the coding environment |
| `docs/DESIGN_SYSTEM.md` | Colour tokens with measured contrast and colour-blind safety, layouts, accessibility |
| `docs/TOUCH_SPEC.md` | Gesture specification mapped to the tests that verify it |
| `docs/DEPLOY.md` | Release as a file, as a web app, as store apps; checklist |
| `docs/MONETIZATION.md` | Optional Stripe payments: modes, security model, store rules, setup, what is verified |
| `docs/story/SCRIPT.md` | The full screenplay of *The Lantern Tithe*: every film, mission, radio line and character, generated from the story data (`node tools/story_to_md.js`); do not edit by hand |
| `docs/story/BIBLE.md` | The series bible: premise, chronology, characters with voice guides, factions, the nine missions, the cinematic manifest |
| `docs/CAMPAIGN_SPEC.md` | Mission data format, the condition and action language, runtime semantics, progress save |
| `docs/CINEMATIC_SPEC.md` | Film format, renderer contract, painter registry, player API |
| `docs/AUDIO_SPEC.md` | Sound engine, voice language, sound-design matrix, music data format, Sound Lab |

## 4. What was deliberately dropped — and what changed

The earlier "real USDC wallets / peer-to-peer play" idea is **out of scope** (per the owner's decision). All in-game
currency is virtual and is **never sold**. **Update (3.1, at the owner's request):** an *optional* "support the game"
payment through Stripe-hosted checkout now exists for the **web distributions only** — off by default, cosmetic perks only, absent from the store build and hidden
in native wrappers. With it left off, the game still makes **no network requests**. Details, security model and policy notes: `docs/MONETIZATION.md`.

## 5. Status in one paragraph

Desktop-complete and stable in headless Chromium: 0 console errors, 0 network requests, deterministic simulation
for a fixed seed, 0.31 ms per simulation step with 60+ agents (headless). Autopilot (the Overseer playing for you)
does not lose to the built-in Normal AI in 19 of 24 test matches (10 wins / 9 undecided at the 18-minute limit /
5 losses; score 0.60 with win = 1, undecided = ½, standard error ≈ 0.10). **Done in 3.1 (verified only in emulation):** touch input, phone layouts, app lifecycle, installable offline web app, optional payments, HD rendering tiers.
**Not done:** real-device testing of any kind (iOS Safari/WebKit especially), real-device performance and audio, save/load (a match is lost if the OS kills the page),
tutorial/onboarding, store listing assets, accounts/policies. See `docs/KNOWN_LIMITATIONS_AND_TEST_RESULTS.md` §3.
