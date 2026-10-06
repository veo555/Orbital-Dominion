# Backlog — prioritised, with acceptance criteria

Priorities: **P0** = blocks a store release · **P1** = needed for a quality 1.0 · **P2** = after 1.0 / optional.
Effort: S ≤ 2 days · M ≈ 3–5 days · L ≈ 1–2 weeks · XL > 2 weeks (one engineer, estimates only).
IDs are referenced from the other documents.

## M — Mobile product layer

| ID | Pri | Eff | Item | Acceptance criteria |
|---|---|---|---|---|
| M-01 | P0 | M | **Pointer-Events input layer.** Replace `mousedown/mouseup/mousemove/wheel` in `bindInput()` (`90_main.js`) with Pointer Events (touch + pen + mouse) while keeping desktop behaviour identical | Desktop E2E gate still green; a synthetic touch drag/tap in Playwright (`has_touch`) produces the same selection/orders as the mouse path; `touch-action:none` on canvas, no page scroll/zoom/overscroll |
| M-02 | P0 | L | **Touch gesture scheme**: one-finger pan, tap-select, tap-context-command (via `contextCommand`), long-press + drag box-select (or Select toggle), pinch zoom + two-finger pan, double-tap select-type, minimap drag | Written gesture spec in `docs/`; ≥ 8 playtesters complete a match with touch only; mis-selection rate (taps selecting the wrong unit) recorded and < 10 % in tests |
| M-03 | P0 | M | **On-screen controls**: command-card buttons ≥ 44 pt/48 dp, Attack-move / Stop / Hold / Cancel buttons, control-group chips (tap = recall, long-press = set), "Select" mode toggle, idle-worker / army / hero buttons already exist (`#bIdle,#bArmy,#bHero`) — make them touch-sized | Every action reachable without a keyboard (checklist matrix in QA §3) |
| M-04 | P0 | L | **Responsive HUD geometry**: replace constants `TOPBAR=44`, `BOTTOM=198` (`00_core.js`) used by `clampCam`, `centerOn`, `viewBottom` with measured values; compact landscape layout (minimap 96–120 px, collapsible info card, command card at right edge); `viewport-fit=cover` + safe-area insets | At 844×390 and 932×430 the visible map area ≥ 70 % of height with panels collapsed; nothing clipped on notch devices; `tests/e2e/mobile_probe.py` shows no overflow in portrait/landscape |
| M-05 | P0 | M | **Touch-friendly panels**: Swarm panel as side sheet, quick-chips for common Overseer phrases, `visualViewport` handling for the keyboard, menus/help scrollable by touch | Command box usable with the on-screen keyboard without the layout jumping; all `data-act` buttons ≥ 44 pt |
| M-06 | P1 | S | **No hover-only information**: tooltips (`data-tip`, `showTipHTML`) become long-press sheets on touch | Every tooltip's content reachable by long-press; none appears stuck |
| M-07 | P0 | M–L | **Lifecycle + resume**: pause on `appStateChange`/`visibilitychange`; suspend/resume `AudioContext`; Android back button → pause menu; **decide and implement save/resume** (serialise `G` vs seed + input log; ARCHITECTURE §6) | Killing the app mid-match and relaunching offers "Resume"; resumed match state matches within the design's tolerance (exact if replay-based); no timers keep ticking in background |
| M-08 | P1 | S | Settings via `@capacitor/preferences` with migration from `localStorage` key `SETKEY` | Settings survive reinstall-free app restarts on both OSes |
| M-09 | P0 | S | Orientation lock (landscape), immersive/fullscreen, status bar styling, splash screen | No rotation relayout glitch; no status-bar overlap |
| M-10 | P0 | M | **Wrapper project + CI**: Capacitor (or chosen option), signed `.aab` (target API 36) and `.ipa` (Xcode 26+ SDK), semantic versioning, reproducible builds | One command/CI job produces both artefacts from a tag; installs and boots on the S0 devices |

## P — Performance and stability

| ID | Pri | Eff | Item | Acceptance criteria |
|---|---|---|---|---|
| P-01 | P0 | M | **Device spike S0 + profiling harness**: instrument frame time (EMA, p95), long frames, heap, start-up; run on 3+ real devices; record in `docs/DEVICE_RESULTS.md` | Table of results for each device × scenario (menu, 10-min Autopilot, big fight, max zoom-out); decision recorded |
| P-02 | P1 (P0 if S0 fails) | L–XL | **WebGL renderer** for terrain/sprites/fog (keep sim + HUD) | Low-end p95 ≤ 33 ms in the S0 scenarios; visual parity checked with screenshots |
| P-03 | P1 | M | **Render interpolation** between sim ticks (30 Hz sim on 60/120 Hz screens) | No visible stepping at 60 Hz; sim determinism tests unchanged |
| P-04 | P1 | M | **Sprite atlas baked at build time** (Node canvas or a headless-browser export) instead of lazy generation in `unitSprite/buildingSprite` | No hitch on first sight of a unit type; start-up time reduced (record before/after) |
| P-05 | P1 | M | Cheaper fog + night lighting; **adaptive quality** (frame-time EMA → drop effects/DPR) | Low-end reaches the gate with adaptive quality on; user can force "High" |
| P-06 | P0 | M | 60-min soak, heap snapshots, leak fixes (look at `S.log`, `cmdLog`, particles, caches, DOM nodes) | < 20 % heap growth over 60 min; no unbounded arrays |
| P-07 | P1 | S | Battery mode: 30 fps render cap, reduced particles, DPR 1.5 | Documented drain per 30 min on the mid-tier device, before/after |
| P-08 | P1 | S | Loading screen for first boot (art generation, map build) | No blank/frozen screen > 300 ms |

## B — Engineering quality

| ID | Pri | Eff | Item | Acceptance criteria |
|---|---|---|---|---|
| B-10 | P1 | S | Help text (`HELP_HTML`) generated from or checked against data tables (costs, damage, era requirements) | A test fails if help numbers diverge from `UDEF/BDEF/ERAS/TECH` |
| B-20 | P1 | M | Replace the ≈ 30 sim-affecting `Math.random()` calls (`20_sim` 11, `25_agents` 1, `27_overseer` 5, `30_systems` 5, `40_ai` 8) with seeded streams (`G.rng` etc.) | `tests/sim/smoke.js` determinism passes **without** setting `RS`; two runs hash-equal; (enables replays/lockstep/save-by-replay) |
| B-21 | P2 | L | Serialisable game state (only if M-07 chooses serialisation) | Round-trip `save → load → 60 s` equals uninterrupted run (hash) |
| B-22 | P1 | M | Convert exploratory `tests/e2e/e2e_*.py` into assertions and wire into CI; add touch variants | CI fails on regression of any flow |
| B-23 | P2 | M | ESLint + Prettier + JSDoc/TS type-check; optional move to ES modules with Vite/esbuild keeping the numeric order | `npm run lint` green; build output equivalent (tests green) |
| B-24 | P1 | S | Unit tests for pure maths: `periodPrice`, `cadenceTable/bestCadence`, wage-index statistics (mean reversion, bounds), Lanchester/strength helpers | Tests assert known values and invariants (e.g. float cadences priced at expected W) |
| B-25 | P1 | M | Balance round with humans + A/B batches (24+ paired seeds): Meridian vs Obsidian rush; "Easy" for newcomers; Hard still beatable | Documented results; no change shipped on single-seed evidence |
| B-26 | P1 | S | Decide crash reporting (privacy impact: SDK = data collection → store forms change) | Written decision; if adopted, forms/policy updated |
| B-27 | P2 | M | Enemy AI scouting parity (it currently knows your corner) | Difficulty re-baselined after the change (it will get *easier*) |

## F — Features and polish

| ID | Pri | Eff | Item | Acceptance criteria |
|---|---|---|---|---|
| F-01 | P0 | L | **Interactive tutorial** (mine → generator → train → era → swarm basics → hire an agent) | ≥ 70 % of fresh testers finish unaided; skippable; replayable from the menu |
| F-02 | P2 | L | Optional LLM front-end that translates free text into existing `nlClause` intents (needs network → privacy/Data-safety impact, cost, moderation) | Not for 1.0; if built, the rule-based parser remains the offline fallback |
| F-03 | P1 | M | Accessibility: colour-blind-safe faction palette/markers, text scale, reduced-motion, contrast pass | Checklist QA §11 passes |
| F-04 | P1 | M | Localisation scaffolding (string table; keep English only at 1.0 if needed) | No user-visible strings hard-coded in logic modules (or documented exceptions) |
| F-05 | P1 | S | Haptics on key events; polished splash/icon; sound options | Haptics respect OS settings and a toggle |
| F-06 | P2 | XL | Campaign / scenarios; more maps and sizes | post-1.0 |
| F-07 | P2 | L | Achievements via Game Center / Play Games (Apple requires the Game Center entitlement if you offer it ✔) | optional |
| F-08 | P2 | M | Replays/spectate (needs B-20) | post-1.0 |
| F-09 | P2 | XL | Multiplayer (needs B-20/B-21, server, moderation, privacy) — **not planned** | out of scope |

## S — Store and operations

| ID | Pri | Eff | Item | Acceptance criteria |
|---|---|---|---|---|
| S-01 | P0 | S | Developer accounts (Google, Apple), identity verification; decide personal vs organisation (12-tester rule) | Both consoles accessible; 2FA on; upload keys backed up |
| S-02 | P0 | S | App name + trademark/store-name clearance; bundle/package ID fixed | Written clearance note; ID committed |
| S-03 | P0 | S | Privacy policy (hosted URL + in-app link) | URL live; accurate for the shipped SDK set |
| S-04 | P0 | M | Listing assets: icon 512 (Play) / 1024 no-alpha (Apple), feature graphic 1024×500, screenshots per current specs, description, keywords (no third-party marks) | All fields complete in both consoles |
| S-05 | P0 | S | Age/content rating questionnaires; Data safety + App Privacy forms | Answers match the build; screenshots of submitted answers archived |
| S-06 | P0 | M | TestFlight + Play closed test (≥ 12 testers × ≥ 14 days if required) | Test period completed; feedback triaged |
| S-07 | P0 | S | Submission, staged rollout, vitals monitoring | Live on both stores; vitals under thresholds |
