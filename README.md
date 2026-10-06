# Orbital Dominion v3 — project handoff package

A real-time strategy game (three factions, three eras, fog of war, heroes, a Caesar-style colony economy, a
Patrizier-style market) with a **swarm-agent layer**: every unit can be an autonomous agent with a role, a wallet and
XP; a master AI ("the Overseer") directs the colony; a labour marketplace lets you hire freelancers and take jobs on
five billing cadences (minute / hour / day / month / per task).

It currently ships as **one standalone HTML file** (`dist/orbital_dominion_v3.html`, ~500 KB, no external requests,
no libraries). This package is everything needed to continue development in a coding environment and take it to
Google Play and the Apple App Store.

> **Read first:** `docs/STORE_RELEASE_ROADMAP.md` (what stands between this and the stores) and
> `docs/KNOWN_LIMITATIONS_AND_TEST_RESULTS.md` (what has and has not been verified). The game is **desktop
> mouse + keyboard only today**; touch controls and a phone layout are the largest piece of work.

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

## 4. What was deliberately dropped

The earlier "real USDC wallets / peer-to-peer play" idea is **out of scope** (per the owner's decision). All
currency in the game is virtual, there is no purchase flow and no network code, which keeps store review
simple. If monetisation is added later (paid app, ads, in-app purchase), see the notes at the end of
`docs/STORE_RELEASE_ROADMAP.md`.

## 5. Status in one paragraph

Desktop-complete and stable in headless Chromium: 0 console errors, 0 network requests, deterministic simulation
for a fixed seed, 0.31 ms per simulation step with 60+ agents (headless). Autopilot (the Overseer playing for you)
does not lose to the built-in Normal AI in 19 of 24 test matches (10 wins / 9 undecided at the 18-minute limit /
5 losses; score 0.60 with win = 1, undecided = ½, standard error ≈ 0.10). **Not done:** touch input, phone layout, save/load, app-lifecycle handling, real-device
performance and audio testing, tutorial/onboarding, store assets and policies. The roadmap sequences them.
