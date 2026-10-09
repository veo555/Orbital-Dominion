# CLAUDE.md — briefing for an AI coding agent working in this repository

Project: **Orbital Dominion v4** — a canvas-based RTS shipped as a single HTML file; goal now is Google Play + Apple
App Store release. Read `README.md`, then `docs/STORE_RELEASE_ROADMAP.md` and `docs/ARCHITECTURE.md`.

## Commands
- Build: `python3 build.py` → `dist/orbital_dominion_v4.html`
- Gates (run before every commit): `bash tests/run_all.sh` (~5 min): build, `tools/design_check.py`, `tests/sim/smoke.js`, and the browser gates `e2e_smoke` (desktop), `e2e_touch` (phones),
  `e2e_terrain` (HD tiles), `e2e_platform` (lifecycle), `e2e_pwa` (offline/install/update), `e2e_support` (payments, client), plus `server/stripe-worker` unit tests. Playwright must be **1.56** to match the preinstalled Chromium (`pip install playwright==1.56.0`); never run `playwright install`.
- Variants: `python3 build.py [standalone|pwa|store]` → `dist/orbital_dominion_v4.html`, `dist/pwa/`, `dist/store/`. Commit `dist/`.
- Visuals: `python3 tools/shots.py --tag x desktop iphone-land pixel-port` (device screenshots), `python3 tools/perf.py` (render cost; software raster, relative only).
- Balance/regression probes: see README §1 (`tests/sim/match2.js`, `eco.js`, `off.js`, `tools/ab.sh`)

## Ground rules
1. **No globals leaking, no external requests.** The whole game is one IIFE assembled by `build.py`; files load in
   alphabetical order (`00_core` … `90_main`). Add new modules with the right numeric prefix. The browser gate asserts
   zero network requests — keep it that way. The only deliberate exceptions are the **opt-in** payment calls (`77_support.js`, off unless `src/support.config.json` enables them, only after a player action)
   and the PWA service-worker registration (`BUILD.variant==='pwa'`, http(s) only).
2. **The simulation is headless-testable.** Modules `00,10,20,25,26,27,30,40,41,42` must not touch DOM, canvas or audio
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
10. **Never hard-code the HUD size.** `TOPBAR`/`BOTTOM` are measured (`measureHud`); panels position with `--tH/--bH`. Three layouts exist (desktop / `compact` / `compact portrait`, plus additive `touch`) — a UI change must be checked in all of them (`tools/shots.py`).
11. **Touch contract:** mouse handlers stay as they are; `74_touch.js` handles only `pointerType` `touch`/`pen` and cancels their compat mouse events. Panel buttons keep `mousedown` + `data-act` (browsers synthesise them from taps). Anything hover-only needs a long-press path. See `docs/TOUCH_SPEC.md`.
12. **Rendering-only modules** (`53,60,62,63,7x`) must never write simulation state. Quality/FX/terrain-tile code may use `Math.random`/`performance.now`; sim modules may not.
13. **Payments are cosmetic and optional.** Never sell in-game currency or anything that affects balance; never put a secret in the page; the `store` variant and native runtimes must stay payment-free (`docs/MONETIZATION.md`).
14. **Colours come from the tokens** in `style.css :root` (and faction data in `00_core.js`); run `python3 tools/design_check.py` after changing one.
15. **A green test that cannot fail is worthless.** Three assertions in this repo were vacuous when first written (always-true expression; CDP installability check that returns `[]` in the headless shell; a handle-based click that raced a re-render). Mutate the code (or the manifest, or the data) and watch the test fail before trusting it.

## Known traps (each cost real time before)
- The command card buttons have no `data-tip`; find them through `__RTS.ui.cmds` names.
- While paused, `Escape` toggles pause; with the Swarm panel open the first `Escape` closes the panel.
- `page.fill()` in Playwright focuses the input — subsequent hotkeys then go into the text box.
- Headless `fps` numbers come from software rendering; they say nothing about phones.
- Skirmish/demo opponent (41_ai_*, 42_ai_agent) is fog-honest: it scouts and uses a belief grid. Campaign missions still use the v3 AI (`aiKind:'v3'`), which knows your start corner. Tests that compare against the old AI must pass `aiKind:'v3'`.
- Tap tests are load-sensitive: the double-tap window is 380 ms of wall clock; retry, and near-freeze the live loop (`G.speed=0.05`) instead of pausing (touch ignores input while paused).
- Entry animations that scale/translate dialogs break geometry and 44 px target tests: animate opacity only.
- A headless pointer sits at (0,0), which **edge-scrolls the camera** away from your base; move the mouse to mid-screen first (`pg.mouse.move`) or use touch emulation (edge scroll is off in touch mode).
- Don't hold a Playwright `ElementHandle` across a panel re-render (the Swarm panel replaces its `innerHTML` several times a second); click through the selector instead.
- `imageSmoothingQuality='high'` on the big terrain/fog canvases costs +140 % frame time; it is applied to sprites only.
- Chrome's installability check (`Page.getInstallabilityErrors`) returns `[]` for ANY manifest in the default headless shell; use `channel='chromium'`.
- A moving target makes tap tests flaky: stop the unit (`u.order={t:'idle'}`) and pick verified-empty ground (`entityAt(...)===null`).
