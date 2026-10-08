# Architecture — Orbital Dominion v3

Audience: an engineer (or coding agent) who has never seen the code. Everything below was read from the source in
this package; line counts are approximate (5,900 lines of JS in 18 modules, 27 KB CSS).

---

## 1. Build and runtime shape

* `build.py` reads `src/js/*.js` **in alphabetical order**, concatenates them into **one IIFE**, wraps them with
  `src/style.css` and `src/body.html`, and writes `dist/orbital_dominion_v3.html`. There is no bundler, no
  transpiler, no dependency. The HTML head already carries `viewport … user-scalable=no`.
* All modules therefore share one lexical scope (`const`/`function` at top level are visible everywhere). Order matters
  only for *top-level statements that execute at load* (data tables in `00_core.js`, `boot()` in `90_main.js`).
* Rendering is **Canvas 2D** (`#game` main view, `#mm` minimap). There are **no image files**: every sprite is drawn
  from vector primitives at first use (`50_art.js`, `51_art_b.js`) into an offscreen canvas and cached in
  `spriteCache` (scale `SC`); terrain is pre-rendered once per map (`52_terrain.js`); fog of war is a low-resolution
  canvas (`FQ = 4` sub-cells per tile) composited each frame. Icons are generated the same way (`iconURL`, `glyph`).
* Audio is **synthesised with WebAudio** (`80_audio.js`): SFX bursts, a generative score (chords/scale/drums, echo
  bus), plus optional `speechSynthesis` voice lines (`say`). No audio files.
* Persistence: `localStorage` — settings (`SETKEY`) and, if payments are enabled, a supporter flag (`SUPKEY`); all reads/writes are try/catch-wrapped. **There is no save game** (a match is lost if the OS kills the page; BACKLOG M-07).
* Fixed constants (`00_core.js`): `TILE = 32 px`, map `88 × 88` tiles (`WW = WH = 2816 px`), `TICK = 1/30 s`,
  `MAXSUP = 120` supply, `TOPBAR = 44`, `BOTTOM = 198` (**JS constants, used in camera math** — they must become
  variables for a responsive/mobile HUD; see BACKLOG M-04).

### Main loop (`90_main.js`)

```
requestAnimationFrame(frame) -> dt = min(0.1 s, delta)
  frameBody: acc += dt * G.speed;  while (acc >= TICK && n < 14) step()      // fixed timestep, spiral-of-death guard
             camera/zoom easing, updateFog, render(t, dt), drawMinimap, hudUpdate(dt)
```
`n < 14` means a slow device runs the sim *slower than real time* rather than freezing. The renderer draws the
latest sim state **without interpolation** (units move in 30 Hz steps; on 60/120 Hz displays that can look slightly
stepped — BACKLOG P-03).

### `step()` order (`30_systems.js`)

`dayNight → rebuildCells (spatial hash, cell size 64) → recalcTeams → buildDetectors → neutralsStep → updateBuilding*
→ updateUnit* → separate → projectiles/particles/fx → updateZones → built-in AI (`aiThink`, per team, interval from
DIFF) → economyStep (taxes, morale, market drift) → swarmStep → auras (every 15 ticks) → dead-entity compaction →
rebuildBlocked → updateVision (every 4 ticks) → sampleStats → onStepEnd`.

## 2. Module map

| File | Role | Headless-safe? |
|---|---|---|
| `00_core.js` | Constants, seeded RNG (`mulberry32`), noise, settings, **all data tables**: `FACTIONS`, `ERAS`, `UDEF` (units), `BDEF` (buildings), `TECH`, `SKILLS`, `TAX`, `CAMP_TYPES`, `DIFF`, swarm tables (`PAY`, `CADS`, `ROLES`, `GEAR`, `FREE_TYPES`, `CLIENTS`) | yes |
| `10_map.js` | Seeded map generation (`genMap`): 3 height levels, ramps, resource sites, corridors, neutral camps; `mapConnected` guard | yes |
| `20_sim.js` | Game state `G` (`mkG`, `newGame`), entities, A* `findPath` (budgeted per tick), vision/fog logic, production queues, `setOrder`/`orderBuild`, combat core (`acquire`, `fire`, `damageEnt`, `kill`), XP | yes |
| `25_agents.js` | **Per-unit agents**: `mkAgent`, `agEnroll`, `agDirect`, brain (`agBrain` ~3 Hz per agent), reactions (`agReact`: flee, defend, stim, focus-fire via `heroKillTime`), role runners `RUN[role]` (mine, build, repair, trade, scout, guard, patrol, hunt, assault, escort, medic, free), wallets/gear/XP, `swarmStep` | yes |
| `26_economy.js` | **Labour market**: wage index W(t), freelancer listings, hiring/firing/notice, payroll, job board, escrow, clients, `colonyClock` | yes |
| `27_overseer.js` | **The master**: blackboard (`bbUpdate`, `bbHunt`, `bbAssault`, `bbIntel`, `bbDefense`), domain controllers (`ovSupply/Eco/Tech/Buildings/Production/Defense/War/Recon/Trade/Alloc/Labor/Jobs`), propose/approve mechanism (`ovAct`), presets, **rule-based natural-language parser** (`ovCommand`) | yes |
| `30_systems.js` | Per-tick systems: unit/building update, skills (`castSkill`), gather/build/repair/trade steps, economy (tax/morale/market), `step()`, `endGame` | yes |
| `40_ai.js` | The built-in opponent (`makeAI`, `aiThink`, `aiBuild`, `findSpot`, expansions, hero spells) | yes |
| `50_art.js`, `51_art_b.js`, `52_terrain.js` | Procedural unit/building/neutral art, glyphs/icons, terrain + decals | no (canvas) |
| `53_terrain_hd.js` | Sharp 2×/3× terrain tiles near the camera, replayed battle decals (§9) | no |
| `60_render.js` | Camera, fog, `render()`, minimap, ghost placement, night lighting; **layout classes and measured HUD geometry** (`applyLayoutClasses`, `measureHud`) | no |
| `62_quality.js` | Graphics tiers (`battery/balanced/high/ultra`) and the adaptive scaler | no |
| `63_fx.js` | Vignette + grade, additive glows, parallax dust | no |
| `70_ui.js` | Selection, control groups, orders, command card (`buildCommands`, `runCmd`), toasts | no |
| `71_hud.js` | HUD/panels (`hudUpdate`, info card, objectives, economy panel, tooltips) | no |
| `72_menus.js` | Menus, help text (`HELP_HTML`), end screen + chart | no |
| `73_swarm_ui.js` | Swarm panel: tabs `ov` (Overseer), `ro` (Roster), `mk` (Market), `lg` (Ledger); command box; role assignment; world overlays (agent badges) | no |
| `74_touch.js` | Pointer-Events touch layer: gestures, minimap, long-press help, touch dock, placement bar (`docs/TOUCH_SPEC.md`) | no |
| `75_platform.js` | Lifecycle (auto-pause, wake-lock, Back), fullscreen, install helpers, service-worker registration | no |
| `46_save.js` | Snapshot / restore of the whole match state (reference-preserving graph; statics by name; seeded generators by state) — headless, tested by `tests/sim/save.js` | **yes** (sim-side) |
| `78_resume.js` | Autosave slot in localStorage, main-menu Continue button, `resumeGame()` (via `startGame({resume})`) | no |
| `77_support.js` | Optional payments UI + entitlement logic (`docs/MONETIZATION.md`) | no |
| `80_audio.js` | WebAudio SFX + music + speech | no |
| `90_main.js` | Input binding (mouse/keyboard), main loop, boot, `window.__RTS` test export | no |

The Node harness (`tests/sim/simlib3.js`) loads **only** the "headless-safe" prefixes `00,10,20,25,26,27,30,40`
into a `vm` sandbox, appends no-op stubs for `toast, sfx, say, uiDirty, onVision, onStepEnd, onGameOver`, replaces
`Math.random` with a seeded stream when env `RS` is set, and exports a curated API (`newGame, step, G, ovPreset,
ovCommand, …`) plus `__run(code)` which evaluates code *inside* the sim scope (used by A/B snippets).

## 3. Game state

`G` (from `mkG`): `units[]`, `buildings[]`, `res[]` (crystal patches, geysers), `proj[]`, `parts[]`, `fx[]`,
`teams[2]` (`c` crystals, `e` ether, `used/cap` supply, `era`, `tax`, `morale`, kills/lost…), `ais[2]` (`null` for the
human), `time`, `tick`, `seed`, `over`, plus `sw` (the swarm layer, below). Two teams only: you (0) vs one AI (1).
Entities carry `order` (`t` = type, e.g. `gather`/`build`/`move`/`attack`), `def` (shared definition), `hp`, `team`;
agents add `u.ag`.

### `G.sw` (created by `swarmInit`)

```
on            master switch (J key / Settings / Manual preset)
pol           standing policy: comm 5 %, bounty 5 %, flee, clinic, subsidy, autoEnroll, hunt, assault, quotas, healFee…
dom           {supply, eco, alloc, army, tech, trade, labor}: each 'off' | 'advise' | 'act'
bb            blackboard: tickets (build jobs), alarm, hunt, assault, intel cells, stage points, summary
agents[]      units with u.ag (refreshed every 15 ticks) ; ids Map(id -> entity)
props[]       Overseer proposals awaiting approval (advise mode) ; log[] decisions ; cmdLog[] NL transcript
led / ledT    ledger: commission, wage, gear, clinic, subsidy, bounty, bonus, peer, lost, gig, fee, escrow, sold, tips
eco           {W (wage index), free[] (listings), jobs[], ctr[] (contracts), clients[], stats, hist}
ov            Overseer internal timers (saving flag, wave counter, income estimates, scarcity/shadow prices)
rng           mulberry32(G.seed ^ 0x77aa51)  — the swarm economy's own seeded stream
```

`u.ag`: `role`, `dm` (`'auto'` = Overseer/brain decides, `'set'` = player directive), `dir` (target/waypoints),
`wallet`, `xp`, `lvl`, `gear` (Mk I–III), `earned/cost` (ROI shown in the ledger), `why` (human-readable reason shown
in the info card), contract/job ids (`cid`, `free`).

## 4. The swarm in detail

### 4.1 Individual level — the agent brain
Each enrolled unit runs `agBrain` about 3 times per second (`(tick + id) % 10 === 0`), staggered by id:

1. **Reactions first** (`agReact`): flee when a worker is outgunned, head to the field clinic when wounded, defend via
   `runDefend` when the blackboard raises an alarm, stim (Riflemen/Raptors), orbital dodge, and **focus-fire** on the
   enemy hero only if `heroKillTime(hero, team) ≤ 4 s` (estimated from the DPS of nearby friendly shooters after armour).
2. **Directive**: if `ag.dm === 'set'` the unit follows the player's role (Guard post, Patrol loop, Escort target, …)
   and `why` says so. A direct right-click order overrides and the agent resumes afterwards (Stop = stays 20 s).
3. **Autonomy**: otherwise it asks the Overseer which role is in demand (`agPickRes`, tickets, quotas) and executes
   `RUN[role](u)`.

### 4.2 Collective level — the Overseer
`ovStep` runs every 1.5 s of game time. Seven **domains** can each be `off`, `advise` (proposals appear in the
panel and need approval via `ovApprove`) or `act` (acts immediately and logs). Presets: `autopilot` (all act +
auto-enroll + hunt + assault), `advisor` (all advise), `manual` (swarm off). The control flow of one pass:

`ovRescue → ovSupply → ovEco → ovTech → ovBuildings → ovDefense → ovWar → ovRecon → ovProduction → ovTrade → ovLabor → ovAlloc (every 2nd pass)`

* **Supply**: new Generator when `cap − used ≤ 3 + 2·productionBuildings (+3 if crystals ≥ 300)`.
* **Allocation by price signal** (`ovAlloc`): compares *demand* (what queued buildings/units/eras will consume) with
  *supply* (income + stock) per resource, tracks a shadow price, and moves one worker at a time toward the scarcer
  resource with hysteresis so allocation never oscillates.
* **Buildings/production/tech**: build-order driven by rules with affordability checks; the Overseer saves
  (`ovSave`) only when an *essential* item is short of crystals (not ether), then continues — a fix for an earlier stall.
  Garrison placement uses a path-checked `findSpot` (a spot behind a cliff is rejected if the walking path is
  `> 1.5 × straight-line + 140 px`).
* **War** (`bbHunt`, `bbAssault`, `ovWar`): Lanchester product heuristic `(Σ dps × Σ hp)` for strength; square-law
  casualty fraction; enemy-army estimator from scouted intel. Gates: hunt creep camps when strength ≥ 3.6× camp;
  launch an assault at ≥ 2.2× + 8 supply (and `assaultMin` minutes). Spread/stage points keep the army from clumping.
* **Recon** (`ovRecon`): one scout reveals stale intel cells (`bb.cells`); **the built-in enemy AI does not scout —
  it knows your start corner.**
* **Natural-language master** (`ovCommand`): a deterministic keyword/number/place/cadence grammar (`nlClause`) — verbs
  such as keep/build/guard/patrol/scout/hunt/hire/take jobs/status/why, unit & building nouns, "these/here"
  resolved from selection, camera and control groups. It answers in words and says so when it does not understand.
  **It is not a language model**; store copy must not call it one. An LLM front-end could later translate free
  text into the same `nlClause` intents (BACKLOG F-02).

### 4.3 Marketplace and payroll (`26_economy.js`)
* **Wage index** `W(t)`: a mean-reverting (Ornstein–Uhlenbeck-type) process,
  `dW = κ(μ + shock − W) dt + σ √dt · N(0,1)`, `κ = 0.012 /s` (half-life ≈ 58 s), `σ = 0.02`, clamped to `[0.55, 1.9]`.
  The mean is **endogenous**: `μ = 1 + 0.035 · (hired agents) + 0.02 · (open jobs)` — hiring pushes wages up.
  `shock` is a Poisson event (rate 1/330 s, size 16–32 %, sign ±, decays with τ = 80 s) announced to the player as a
  "labour shortage / glut". All draws come from the seeded `S.rng`.
* **Wage level**: `baseWage = WAGE_K · √(c + 1.3·e) · (1 + SKILL_WAGE·(lvl − 1))` per second at `W = 1`
  (c, e = the unit's crystal/ether cost); `periodPrice = baseWage × period seconds × cadence multiplier × W × ask`.
* **Cadences** (`CADS`): Minute ×1.35 and Hour ×1.15 are *floating* (re-priced each period at the spot `W`); Day ×0.95
  and Month ×0.72 are *locked* at signing; Task ×1.22 is paid on completion from **escrow** funded up front.
  `cadenceTable(type, lvl, ask, h)` computes, for a planning horizon `h`, the total outlay per cadence — billing is in
  advance in whole periods (so a Month contract for a 5-minute need *wastes* the remainder), floating cadences are
  priced at the **expected** index `E[W] = μ + (W₀ − μ)(1 − e^{−κh})/(κh)`. `bestCadence` returns the cheapest.
  Notice period vs. immediate dismissal are separate paths (`econFire`).
* **Calendar abstraction** (`PAY`): 1 colony-minute = 10 s, hour = 60 s, day = 360 s (= one day/night cycle),
  month = 2160 s — so every cadence is exercisable in one match. Numbers are balance values, not market data.
* **Job board** (`genJob`, `jobsStep`): four neutral clients (Helios Mining Co-op, Kestrel Logistics, Vantage Survey
  Guild, Bastion Security Ltd) with budgets and reputation post jobs: *survey, courier run, camp clearance, mining
  bounty, guard retainer, relay retainer*. Task prices come from `taskPrice` (route length via `routeLen`, danger via
  `routeDanger`, the wage index and the worker's level). Agents deliver and are paid on completion; failures cost
  reputation. 5 % commission on deliveries, 5 % kill bounty, gear Mk I–III bought from the agent's own wallet.
* All currency is **virtual game currency**. There is no payment, wallet, or network code.

## 5. UI architecture
* DOM overlays on top of two canvases. Panels render to `innerHTML` **only when dirty** (`uiDirty()`, `swDirty()`,
  per-panel signature strings) to keep layout cost off the frame path.
* Action wiring uses `data-act="verb:arg"` attributes and `mousedown` handlers (`swAct`, `swBind`, eco panel). This is
  the contract the E2E tests depend on. Tooltips: `data-tip` + `showTipHTML` (hover only).
* Command card: 12 slots (`SLOT_KEYS = q w e r / a s d f / z x c v`), built by `buildCommands()` from the selection;
  sub-menus (build pages, role menus) replace the grid until `Escape`.
* Responsive CSS (3.1): desktop keeps its breakpoints; `applyLayoutClasses()` adds `compact` / `portrait` / `touch` to `<html>` and `measureHud()` writes the **measured**
  bar heights to `--tH/--bH` and to the camera's `TOPBAR/BOTTOM` (now `let`). Never hard-code those sizes again. `docs/DESIGN_SYSTEM.md` §5.
* Input: the original `bindInput()` keeps **mouse and keyboard** (`mousedown/mouseup/mousemove/wheel/
  contextmenu` and `keydown/keyup`. No Pointer/Touch events exist yet.

## 6. Determinism, replay and multiplayer readiness
* The sim is a pure function of its inputs *except* for `Math.random()` calls (≈ 30 in sim modules: `20_sim` 11,
  `25_agents` 1, `27_overseer` 5, `30_systems` 5, `40_ai` 8). With the harness' seeded replacement the sim is **bit-exact**
  across runs (`tests/sim/smoke.js` hashes all unit/building/team state after 4 game-minutes, twice).
* Consequence: *replays / lockstep* need those calls moved to `G.rng` streams (BACKLOG B-20). Map generation and the
  swarm economy already use seeded `mulberry32` streams.
* Saved games are feasible either by (a) serialising `G` (needs care: `Map`/`Set`, closures in `S.props[i].fn`, entity
  cross-references by object not id) or (b) *seed + input log replay* once B-20 is done. Decide before implementing
  (BACKLOG M-07).

## 7. Performance profile (measured, headless Chromium, software rendering)
* `step()` ≈ **0.31 ms** with Autopilot and dozens of agents at ~8 game-minutes (one seed; swarm off is a little cheaper) (≈ 1 % of the 33 ms budget). Pathfinding is
  budgeted (`G.pathBudget = 16` searches per tick).
* Headless render ≈ 55 fps at 1366 × 800 with the panel open — *this says nothing about phones.* Real-device profiling
  is BACKLOG P-01. Expected hot spots: full-canvas fog compositing, per-unit `drawImage` + health bars, night-lighting
  pass, lazy sprite generation on first sight of a unit type (hitches), DPR up to 2.

## 8. Extension recipes
* **New unit**: add to `UDEF` (`00_core.js`), add a `case` in `artUnit` (`50_art.js`), list it in a producer's
  `prod`, add to `ARMY_W` weights (`27_overseer.js`) and NL nouns (`NL_UNITS`) if the Overseer should build it. Run
  `tests/sim/smoke.js` and an A/B batch.
* **New role**: add to `ROLES`/`ROLE_ORDER` (`00_core.js`), implement `runX` and register in `RUN` (`25_agents.js`),
  add `canRole` rule, a command-card entry in `73_swarm_ui.js`, and an NL synonym in `NL_ROLEWORDS`.
* **New cadence or client**: `CADS`/`CADI`, `CLIENTS`, `JOB_NAMES`; `cadenceTable` derives prices automatically.
* **New Overseer domain**: add to `DOMAINS`, `S.dom` default in `swarmInit`, a controller called from `ovStep`, and
  wrap every action in `ovAct(dom, key, text, fn)` so advise/act/off semantics come for free.

## 9. Rendering pipeline, quality tiers and resolution independence (3.1)

* **Everything is vector and baked at the device density.** Sprites are drawn once into canvases at `SC×` (2/3/4 by tier) and scaled down with mip-mapped resampling
  (`imageSmoothingQuality='high'` **only for sprites** — applying it to the large, changing terrain/fog canvases costs +140 % frame time, measured). HUD icons are stored at 2×;
  charts, sparklines and the minimap use `hd(cv)` (backing store = CSS size × DPR).
* **Terrain** is a resumable generator: `terrainSetup()` (once per map) + `terrainPaint(g,T)` (yields between layers). Run to completion it produces the 1× base map
  (**bit-identical to 3.0**: `tests/e2e/e2e_terrain.py` keeps the 3.0 reference hashes for seeds 7/21/99 — `2c52c2f0`, `acbf291b`, `1ee2ff20`, FNV-1a over the PNG data URL — as a soft check, plus a determinism check). `53_terrain_hd.js` re-runs it onto 512-world-px tiles at 2×/3× when `DPR × zoom > 1.2`,
  one generator stage (≤ 6 ms) per step inside a 5 ms per-frame budget, nearest-to-centre first, at most the nearest 14 tiles are ever baked (memory is bounded even for a 4K window at DPR 1.5, which would want ~45; the rest are evicted LRU), skipping unexplored (black) tiles. Tiles overlap by 6 px; a numeric
  seam test against a single reference bake gives max 10–12/255 and mean 0.03–0.08 over 1.4–3.1 M pixels. Battle decals are seeded, kept in `G.decalAll` and replayed onto tiles.
* **Quality** (`62_quality.js`): `battery` (DPR ≤ 1, SC 2, 30 fps cap) · `balanced` (DPR ≤ 1.5) · `high` (DPR ≤ 2, tiles, FX; the Auto ceiling) · `ultra` (DPR ≤ 3, SC 4, 3× tiles).
  Auto starts from a device heuristic and moves between tiers from 2-second frame-time windows (3 slow → down, 10 fast and ≥ 30 s since the last change → up); frames > 200 ms and hidden tabs are ignored.
  Measured (software raster, so only relative): high at DPR 1 = 14.9 ms vs 14.5 ms in 3.0; steady-state with tiles +6…+23 ms; first draw of a tile spikes 25–50 ms (lazy raster) — on a GPU this is far smaller.
* **FX** (`63_fx.js`): vignette/grade (tier ≥ balanced), additive glows and dust (≥ high; dust off under reduce-motion). Rendering-only; the simulation never reads any of it.

## 10. Build variants and the platform layer

`build.py` assembles `standalone`, `pwa`, `store` (see `docs/DEPLOY.md`) and injects `BUILD` (`variant`, `id`, `version`) and `SUPPORT_CFG` as the first statements of the IIFE. The PWA registers
`sw.js` only when `BUILD.variant==='pwa'` and the page is served over http(s). `75_platform.js` owns lifecycle and install behaviour; `77_support.js` owns payments (all of it dormant unless the config enables it).
Test-side hooks added to `window.__RTS` (only with `window.__TEST`): `TOPBAR`, `BOTTOM`, `Q`, `DPR`, `SC`, `tch`, `tileFor`, `terrainPaint`, `TP`, `setQualityMode`, `measureHud`.
