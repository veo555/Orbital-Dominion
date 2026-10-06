# CLAUDE.md — briefing for an AI coding agent working in this repository

Project: **Orbital Dominion v3** — a canvas-based RTS shipped as a single HTML file; goal now is Google Play + Apple
App Store release. Read `README.md`, then `docs/STORE_RELEASE_ROADMAP.md` and `docs/ARCHITECTURE.md`.

## Commands
- Build: `python3 build.py` → `dist/orbital_dominion_v3.html`
- Gates (run before every commit): `bash tests/run_all.sh` (build + `tests/sim/smoke.js` + `tests/e2e/e2e_smoke.py`)
- Balance/regression probes: see README §1 (`tests/sim/match2.js`, `eco.js`, `off.js`, `tools/ab.sh`)

## Ground rules
1. **No globals leaking, no external requests.** The whole game is one IIFE assembled by `build.py`; files load in
   alphabetical order (`00_core` … `90_main`). Add new modules with the right numeric prefix. The browser gate asserts
   zero network requests — keep it that way unless a deliberate feature needs one.
2. **The simulation is headless-testable.** Modules `00,10,20,25,26,27,30,40` must not touch DOM, canvas or audio
   directly (the Node harness loads only these, stubbing `toast/sfx/say/uiDirty/onVision/onStepEnd/onGameOver`).
   UI code lives in `50+`. If you add a sim → UI call, add a stub for it in `tests/sim/simlib3.js`.
3. **Fixed timestep:** the sim advances in `TICK = 1/30` s steps (`step()`); rendering interpolates nothing — keep
   sim state changes inside `step()`. Never use wall-clock time (`Date`, `performance.now`) in sim modules.
4. **Determinism:** for a fixed `(seed, Math.random stream)` the sim is bit-exact (tested). ~30 sim-affecting
   `Math.random()` calls remain (see docs/BACKLOG.md B-20). New sim code must use `G.rng`/`S.rng` (mulberry32), not `Math.random`.
5. **Swarm off must stay inert.** With `G.sw.on === false` the player side behaves like v2 (`tests/sim/off.js`
   compares against `baseline/v2`). The Overseer is a **rule-based** system, not an LLM — don't describe it as AI
   language understanding in store text.
6. **Test-side hooks:** `window.__TEST='live'` exposes `window.__RTS` (G, ui, cam, step, setSel, ovPreset…) without
   changing boot. Playwright scripts use it; do not ship code that depends on it.
7. **UI conventions:** panels re-render only when dirty (`uiDirty()`, `swDirty()`); tooltips come from `data-tip`;
   command card slots map to `SLOT_KEYS` (`q w e r a s d f z x c v`); panel buttons use `mousedown` + `data-act`.
   When converting to pointer/touch events keep these `data-act` contracts — the E2E scripts rely on them.
8. **Balance changes need numbers.** Use `tools/ab.sh` over ≥ 24 seeds (SE of a win-rate on 24 matches ≈ 0.10) — a
   single-seed result is noise (see KNOWN_LIMITATIONS §3).
9. Don't claim "perfect". Release gates are in `docs/QA_CHECKLIST.md`.

## Known traps (each cost real time before)
- The command card buttons have no `data-tip`; find them through `__RTS.ui.cmds` names.
- While paused, `Escape` toggles pause; with the Swarm panel open the first `Escape` closes the panel.
- `page.fill()` in Playwright focuses the input — subsequent hotkeys then go into the text box.
- Headless `fps` numbers come from software rendering; they say nothing about phones.
- The enemy AI knows where your start corner is (it does not scout). Autopilot's recon is real, the enemy's is not.
