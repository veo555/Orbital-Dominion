# Known limitations and test results (honest status)

Purpose: so the next engineer knows exactly what was verified, how, and what was **not**. "Perfect" is not a state a
game reaches; the release gates in `QA_CHECKLIST.md` define "good enough to ship".

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

### 1.1 Reading the balance numbers correctly
* One match is a noisy Bernoulli-like outcome; with N = 24 the standard error of a win-rate/score is up to
  √(0.25/24) ≈ 0.10. **Any claim of the form "change X improved results" needs ≥ 24 paired seeds and a difference
  well beyond 0.1** — an early opening tweak looked bad in one 12-match batch (4 W / 6 L / 2 D) and neutral in a
  24-seed A/B. Fights are knife-edge (Lanchester square law), so small timing differences flip single outcomes.
* Faction matchups are not equal: Meridian vs Obsidian-rush improved from 2 W / 1 D / 5 L to 4 W / 2 D / 2 L after the
  fixes below, but n = 8 — treat as directional only. Obsidian rush remains the hardest matchup for a turtle.
* All numbers are against the **built-in AI**, which cheats by knowing your start corner and does not scout; they say
  little about how a human would fare against Autopilot (or Autopilot against a human).

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
* **No real device has ever run this.** Only headless Chromium (Linux, software rendering). No Safari/WebKit, Firefox,
  Android WebView, WKWebView, no GPU, no thermal throttling, no low-memory conditions.
* **Audio is untested in any real browser** (WebAudio synthesis + `speechSynthesis`); iOS autoplay/mute-switch/
  interruption behaviour is unknown.
* **No human playtest**: balance, difficulty curve, clarity of the swarm UI, and fun are unmeasured.
* No accessibility audit (colour contrast, colour-blindness, text scaling, reduced motion).
* No long-session soak (30–60 min), no memory-leak profiling, no save/load (does not exist).
* No security review — but the attack surface is currently nil (no network, no storage except settings).

## 4. Known limitations of the product
1. **Input is mouse + keyboard only.** Browsers synthesise mouse events from taps, so a single tap selects, but there is
   no pan/zoom gesture, no box-select, no right-click equivalent, no long-press tooltip. See `screenshots/mobile_*`.
2. **Fixed HUD geometry.** `TOPBAR = 44` and `BOTTOM = 198` px are JS constants used in camera math; on an 844 × 390
   phone in landscape the bottom panel takes ~51 % of the height and leaves ~150 px of map; in portrait the command
   card overflows the viewport width.
3. No save/load; the settings in `localStorage` are the only persistence. No pause on tab/app backgrounding (the
   sim keeps running if the page stays alive; `window.blur` only clears held keys).
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
