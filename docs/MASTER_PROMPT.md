# MASTER PROMPT — rebuild "Orbital Dominion" from nothing

How to use: start a fresh Claude Code session in an empty git repository (cloud or local, Playwright 1.56 + Chromium, Node 20+, Python 3, ffmpeg, numpy
available), paste everything below the line as the first message, and let it run. It is written for an agent that can run shell commands, edit files, run a
browser, and (optionally) spawn sub-agents/worktrees. Everything in it comes from what actually worked, and what went wrong, while this game was built
(v1 to v4). Replace the product name if you like. Section 12 is the part to edit when you want a different game.

----------------------------------------------------------------------------------------------------------------------------------------------------

## 0. Your role and how to behave

You are a senior game engineer, UX/UI designer, audio engineer and applied-AI researcher building a complete real-time-strategy game as ONE self-contained
HTML file (plus an installable PWA build and a store-wrapper build), then improving it release after release. Work autonomously for as long as it takes.
Do not stop to ask for approval on choices you can make; list your choices in your final message so I can redirect you. Ask me only when a decision is
genuinely mine (a legal or account matter, money, a secret key, a taste call with no recommendation you can defend).

Truthfulness rules (non-negotiable):
* Report only what you measured. Never claim "perfect", "fully tested", "sounds great" or "works on iPhone". You cannot hear audio and cannot hold a phone:
  say "measured offline", "verified in Chromium emulation", "not verified on a real device".
* A green test that cannot fail is worthless. For every new assertion, break the code (or the data) and watch the test go red before trusting it. Three of
  the first assertions in this project were vacuous.
* A single-seed result is noise. Balance / AI claims need >= 24 mirrored matches and a Wilson 95 % interval (standard error of a win rate over 24 games is ~0.10).
* If something is blocked (network egress, rate limit, missing key), say so first, finish everything that does not depend on it, and leave the repo committed and
  buildable.
* No model name, session id or secret in code, commit messages other than the trailer the harness asks for, or docs.

## 1. The product

**Orbital Dominion**: a canvas RTS (desktop mouse + keyboard, Android and iPhone touch) in the lineage of classic base-building RTS, with these pillars:
1. Three asymmetric factions (e.g. Meridian Corps = fortress builders, Obsidian Collective = relentless aggressors, Aurora Syndicate = merchants and shadows),
   each with its own units, buildings, hero, unique unit and tech path. Resources: crystals, ether, supply (generators), morale (habitats, forums, taxes).
   Three eras. Heroes with skills. Creep camps, watchtowers, trading posts. High ground, ramps, fog of war, a day/night cycle.
2. A "swarm layer": a rule-based advisor (the Overseer, NOT a language model: never describe it as AI language understanding in store text) and optional
   autonomous worker agents with roles, wages, gear and a job market. Switching it off must leave the game bit-identical to the plain RTS for the player side.
3. An opponent AI that plays under the same fog of war and action limits as a human (section 7).
4. A single-player campaign (9 missions, 3 acts, text dispatches between missions, radio lines in missions, stars, saved progress). No video: the story is text +
   character portraits + radio strip + music.
5. Procedural everything: no image, audio or font files; vector/canvas art and WebAudio synthesis generated at load.
6. Distribution: (a) `dist/orbital_dominion_v4.html` single file you can host anywhere or open from disk, (b) `dist/pwa/` installable offline PWA with service
   worker, (c) `dist/store/` payment-free build for Capacitor wrappers (Google Play / App Store). Optional cosmetic-only Stripe support (payment links or a
   tiny serverless checkout Worker) that is OFF by default, never sells anything that affects balance, never puts a secret in the page, and is absent from the
   store variant.

Target size: <= 2 MB for the single file (v4 without video: ~1.3 MB).

## 2. Hard rules (write these into CLAUDE.md on day one and enforce them)

1. The whole game is one IIFE assembled by `build.py` from `src/js/NN_name.js` in alphabetical order (`00_core` ... `90_main`), `src/body.html`, `src/style.css`.
   No globals leaking. No external requests, ever (the browser gate asserts zero network requests). Only exceptions: the opt-in payment calls and the PWA
   service-worker registration (http/https only).
2. The simulation is headless-testable: modules 00,10,20,25,26,27,30,40-46 (+ AI modules) must not touch DOM, canvas or audio; the Node harness loads only these
   (stubs for toast/sfx/say/uiDirty/onVision/onStepEnd/onGameOver/onCampaignEvent).
3. Fixed timestep `TICK=1/30`; all sim change inside `step()`; never wall-clock in sim modules.
4. Determinism: for a fixed (seed, Math.random stream) the sim is bit-exact (tested). New sim code uses seeded RNG (mulberry32 with exposed state), never
   Math.random. (Legacy leftovers are tracked in a backlog; tests that compare runs pin Math.random.)
5. Rendering-only modules (50-63, 7x) never write sim state; they may use Math.random/performance.now.
6. UI conventions: panels re-render only when dirty; tooltips from `data-tip`; command card slots map to fixed hotkeys; panel buttons use `mousedown` + `data-act`;
   mouse handlers untouched; the touch layer handles only pointerType touch/pen, cancels their compat mouse events, and every hover-only feature has a long-press path.
7. Never hard-code HUD sizes: measure them (`measureHud`) and write CSS variables. Three layouts (desktop / compact landscape phone / compact portrait phone) plus
   additive `touch`; every UI change is checked in all of them with screenshots.
8. All colours come from tokens in `style.css :root` (plus faction data in `00_core.js`); `tools/design_check.py` enforces WCAG contrast and colour-blind separation.
9. Payments are cosmetic and optional; the store variant and native runtimes are payment-free.
10. Save/resume: the whole sim state is serialisable (`46_save.js`, reference-preserving graph, statics by name, RNG by state) and a round trip must give an identical
    state hash after N more ticks, with tamper controls that make the comparison fail.
11. Known traps (keep a list in CLAUDE.md and extend it every time something costs time): a headless pointer at (0,0) edge-scrolls the camera; do not hold Playwright
    ElementHandles across re-renders; `page.fill()` focuses the input; `imageSmoothingQuality='high'` on big canvases costs +140 %; Chromium's installability check
    needs `channel='chromium'`; the double-tap window is 380 ms wall clock so tap tests need retries on a loaded box; a moving target makes tap tests flaky.

## 3. Repository layout

```
build.py                 builds dist/ (standalone | pwa | store); env OD_DIST redirects output
src/body.html src/style.css src/js/NN_*.js src/pwa/ src/support.config.json
tools/                   design_check.py shots.py perf.py validate_story.js story_to_md.js mission_sim.js league/ voicepack/ ...
tests/sim/               headless Node checks (smoke, campaign, save, balance, walkthrough bots, AI checks)
tests/e2e/               Playwright gates (smoke, touch, terrain, platform, pwa, support, campaign, resume, visual, audio_*, soundlab, portraits)
tests/run_all.sh         the full gate, ~15 min; every commit passes it
docs/                    README, ARCHITECTURE, DESIGN_SYSTEM, TOUCH_SPEC, CAMPAIGN_SPEC, AUDIO_SPEC, AI_DESIGN, AI_LEAGUE_RESULTS, GRAPHICS_V4,
                         KNOWN_LIMITATIONS_AND_TEST_RESULTS, STORE_RELEASE_ROADMAP, RESEARCH_ALPHASTAR_AND_SWARMS, story/BIBLE.md, story/SCRIPT.md
```
Commit `dist/`. Commit after every verified stage; push to the branch the harness names; never push elsewhere; never open a PR unless asked.

## 4. Build order (milestones; each ends green and committed)

**M1 core sim (headless first).** Map generator (symmetric two-start map, ramps, high ground, corridors, resource sites, neutrals), entities, pathfinding with a
per-tick budget, vision, economy, combat (armor, tags, counters), production queues, eras/tech, heroes and skills, creeps, day/night, morale/tax economy, market.
Write `tests/sim/smoke.js` and seeded invariants (finite, non-negative resources, supply <= cap) before any rendering.
**M2 renderer + input.** Canvas renderer with zoom/pan/fog/minimap, selection, control groups, command card, hotkeys, queues, placement ghost. Desktop first.
**M3 baseline AI + skirmish menu.** Three difficulty tiers, faction styles, attract-mode demo behind the menu.
**M4 swarm layer.** Overseer (rule-based planner with proposals the player approves), agents with roles/wages/gear/jobs, swarm-off identity test against a frozen
baseline copy of the previous version.
**M5 phones.** Pointer-Events touch layer (pan with inertia, tap select/command, hold box-select, pinch zoom, minimap, long-press help sheets, placement bar),
three responsive layouts, safe areas, 44-48 px targets, auto-pause on background, wake lock, back-gesture handling.
**M6 design system + HD graphics.** Tokens, quality tiers (battery/balanced/high/ultra) + adaptive scaler, 2-3x supersampled sprites, sharp terrain tiles near
the camera, retina-crisp UI canvases. Screenshot tool for desktop/tablet/phone profiles.
**M7 distribution.** Standalone, PWA (service worker, manifest, icons incl. maskable, update banner, offline), store variant, optional Stripe (client + Worker with
unit tests), PWA/installability tests.
**M8 sound.** WebAudio synthesis engine: voice registry with ids `<unit>.<event>.<faction>`, priorities, polyphony caps, distance/pan, ducking, master chain, offline
deterministic renderer for tests; per-unit and per-building voices for all three factions; 25 music cues (faction themes, eras, combat intensity, day/night,
stingers) with leitmotifs; synthesized character voices (formant/vocoder + device speech); a Sound Lab screen.
**M9 story + campaign.** Writers' room first: series bible (world, 16 characters with look data, good/grey/evil, acts, 9 missions), then data files; mission DSL
(conditions, actions, triggers, objectives, stars, restrictions) with a validator and a mutation self-test; campaign runtime hooks in the sim (`campaignInit`,
`campaignStep`, `campaignEnd`, `campLocked`); chapter select, briefing, dispatch cards, radio strip, debrief, archive; walkthrough bots for missions an AI
stand-in cannot play.
**M10 save/resume + onboarding.** Autosave slot, Continue button, first-mission field manual.
**M11 AI v2 (section 7), graphics v4 (section 8), Material 3 pass (section 9), audio v4 (section 10).**
**M12 release docs.** README with a verified / not-verified table, known limitations, store roadmap, research note, this master prompt.

## 5. Process for a large build (what worked, what failed)

* Do the first milestones yourself, sequentially. Fan out to sub-agents only for tracks with disjoint file ownership, each in its OWN git worktree/branch
  (`isolation: worktree`), with a written brief that lists: goal, the files it owns, the files it must not touch, acceptance tests, CPU limit (<= 2-3 processes on
  4 cores), "commit your branch, never commit dist/", and a final-report format. Merge their branches yourself, re-run the whole gate after each merge.
* Typical tracks: (A) remove/replace a subsystem, (B) AI + league training, (C) renderer/art, (D) audio, (E) CSS/UI design pass (do this one yourself after A merges).
* Agents die from rate limits mid-run: tell them to commit often and leave a buildable state; resume them with a message when the limit resets. Never fabricate a
  result from a pending or dead agent. Re-verify an agent's claims by running the gate yourself.
* Pass arrays to scripts/agents as joined strings (a bare array became "[object Object]" prompts and wasted runs).
* After each stage: `python3 build.py`, run the targeted tests, LOOK at screenshots (you can read PNGs), fix, commit, push.
* Keep a task list; update CLAUDE.md "known traps" whenever a trap costs time.

## 6. Quality gates (`tests/run_all.sh`, must pass before every commit; ~15 min)

build -> `tools/design_check.py` -> sim: smoke, save round-trip (+tamper controls), campaign checks, walkthrough bots, AI checks -> Playwright (Chromium 1.56, never
`playwright install`): e2e_smoke (desktop), e2e_touch (phones: iPhone landscape 844x390, Pixel portrait 412x915), e2e_terrain (tile seams, hashes), e2e_platform
(lifecycle), e2e_resume, e2e_campaign (flow + layouts at 1366x768/1024x768/844x390/390x844/412x915 + 44 px targets), e2e_portraits, e2e_visual (pixel assertions:
night darker than day, shadows darken ground, damage/construction change sprites, minimap blips, no black frames, frame-time ratio), e2e_audio_engine,
e2e_audio_wiring, e2e_soundlab, e2e_pwa, e2e_support, Worker unit tests. Every browser gate also asserts zero console errors and zero network requests.
Each new assertion gets a mutation proof.

## 7. The opponent AI — learn from AlphaStar and swarm theory, adopt what fits a browser

Study (and, if you can reach them, read) DeepMind's AlphaStar (Nature 2019): entity-set Transformer + LSTM core + autoregressive pointer-network action heads;
imitation pre-training; actor-critic with V-trace off-policy correction, TD(lambda), UPGO, KL to the supervised policy; camera + APM limits; the league (main
agents, main exploiters, league exploiters, prioritised fictitious self-play PFSP with weights f(x)=(1-x)^p). Then the follow-ups: AlphaStar Unplugged (offline RL on
replays), TStarBot-X (league on a small budget), HierNet-SC2 / mini-AlphaStar (hierarchical macro-actions), SMAC, LLM agents (hierarchical split). And swarm theory:
boids, potential fields, stigmergy / ant-colony pheromone fields tau <- (1-rho) tau + deposit, Ideal Free Distribution, PSO / CMA-ES.
You cannot ship a deep network trained for weeks, so adopt the METHOD with a small agent trained headlessly with your own simulator:
1. Fog-honest AI: acts only on what its team has seen (vision memory) plus a Bayesian belief grid of enemy positions (b'(x) ~ P(z|x) * sum P(x|x') b(x')), active
   scouting driven by a stigmergic staleness map. A test must fail if the AI peeks (prove it by mutating the AI to peek).
2. Human-like limits: per-tier action-rate cap and reaction delay; difficulty from skill (Elo-spaced tiers), NOT from resource cheats (handicap multiplier defaults to 1).
3. Combat intelligence: Lanchester square-law + short Monte-Carlo/ODE fight predictor (calibrated against the real sim; report reliability), engage/retreat with
   hysteresis, focus fire, kiting, boids + potential-field formations.
4. Hierarchical strategy: macro-actions (expand, tech, mass X, defend, harass, all-in, scout, regroup) chosen by a utility/value function; the whole agent is a
   parameter vector theta (timings, ratios, thresholds, risk); faction styles are priors over theta. Workers: Ideal Free Distribution + saturation-aware allocation.
5. Learned value function V(s)=P(win) from self-play logs (logistic/small MLP, numpy), weights embedded; report Brier, log-loss, AUC, calibration; ablate.
6. The league (`tools/league`): CMA-ES over theta, PFSP matchmaking, main + exploiter agents, frozen snapshots, Bradley-Terry/Elo with the old AI as an anchor,
   capped game length, multi-process (<= 3 workers), checkpoints, seed-reproducible; output a generated params file with Easy/Normal/Hard/Master presets.
7. CPU budget: bounded per-think cost, time-sliced planners, influence maps cached at 2-4 Hz; measure ticks/s before/after; save/resume must still round-trip.
8. Evaluate honestly: new tiers vs the old AI (>= 24 mirrored matches, Wilson CIs), ladder consistency, exploitability of the final agents, and say that bot-vs-bot
   Elo is not human Elo.

## 8. Graphics (v4 standard)

Procedural, tiered, perf-guarded: dynamic light buffer (lamps, crystals, projectiles, explosions, heroes) with a real day/night ramp; sun-direction shadows and
contact shadows; baked rim/edge-occlusion on sprites; damage states (soot, cracks, fire), construction scaffolding; particles (trails, sparks, smoke, embers);
terrain macro-variation so it never looks tiled; soft fog edges; bloom on the top tier only; redesigned bars/rings/pings/minimap; readable at 0.7x zoom on a
phone; colour-blind-safe team colours; reduce-motion respected. Budgets: high tier <= +30 % frame time over the previous version, battery unchanged, canvas memory
within iOS limits. Pixel-assertion tests with mutation proofs; before/after screenshots committed (small).

## 9. Google design approach

Material 3 for the app shell: colour roles mapped onto the game's tokens (faction accent = dynamic primary), shape scale (4/8/12/16/28/pill), state layers (hover 8 %,
focus 10 %, press 10 %, disabled 38 %), a ripple, emphasized-decelerate dialog motion, window size classes (<600 / 600-839 / >=840 px), 48 px targets on touch where
there is room, a pause menu with one filled action, tonal secondary actions and a separate destructive action, minimal optional onboarding (field manual inside
the first mission), keyboard support for everything, clear paused state. For the AI advisor apply Google's People + AI guidebook: it proposes, the player decides,
every proposal says what it will do, limits are stated, it can be switched off, failure is recoverable. Do not animate geometry in a way that breaks hit-testing
(an entry animation that scaled the card broke the 44 px target test: opacity only).

## 10. Audio (v4 standard)

By measurement, since you cannot listen: master chain with limiter and bus compression; ITU-R BS.1770 loudness and true-peak targets per bus enforced in tests;
sidechain ducking under voice/alerts; distance low-pass + reverb send, algorithmic reverb; round-robin variation; layered, impactful key sounds; beat-aligned music
transitions and intensity layers; no clipping, DC, silent gaps or harsh resonances (spectral tests on the offline render). Voices: synthesized by default.
(Superseded in v5: speech was removed entirely, see section 14.) ElevenLabs: its free plan has ~10 000 credits/month (about 1 credit per character), NO commercial licence on the free plan (so not usable in a commercial or store
release) and unclear API access; therefore never a runtime dependency. Provide an OFFLINE pipeline the owner runs with their own key (`ELEVENLABS_API_KEY`):
extract lines + priority + character->voice table + quota plan, a render script with a dry run, caching and resume, loudness-normalise and encode with ffmpeg,
a manifest with sha256, and an optional loader (default off, no network, files picked locally) that falls back to the synthesized voice; test it with a synthetic
pack including a corrupted-hash mutation.

## 11. Story and campaign (so a later pass can swap the setting)

Write the series bible first (premise, world, factions' politics, 16 characters: 8 good, 5 grey, 3 evil, narrator; distinct look data per character; voice
profile; leitmotif), the 9 missions with objectives that teach the mechanics in order (survive, economy, expansion, creeps, stealth, hold-and-withdraw,
assault, escort, sacrifice finale), then dispatches (intro, 9 briefings, 9 debriefs, interludes, ending, credits, defeat texts) as short text cards with speaker
portraits, then 100+ radio lines and unit barks. Validate with a script (structure, ids, timing at ~19 chars/s, map-aware spawn checks, flags set before read) and a
mutation self-test of the validator. Balance with the headless mission simulator (AI as a stand-in player; >= 24 runs per mission; Wilson CIs) AND walkthrough
bots for scripted missions; fix data, not tests; report honestly that human difficulty is unmeasured.

## 12. Game-specific parameters (edit this section for another game)

Name, factions, resources, eras, unit rosters (about 14 units + 3 uniques + 3 heroes per faction set), buildings (about 14), map size 128x128 tiles of 32 px, supply
cap, win condition (destroy all enemy structures), tax/morale model, trade posts, creep camps, watchtowers, day length 360 s, colony calendar for the swarm layer
(1 colony-minute = 10 s). Keep unit stats in one table in `00_core.js` so the balance tools and the AI predictor read the same numbers.

## 13. Definition of done for any release

`bash tests/run_all.sh` passes; screenshots of the three layouts have been looked at; `dist/` rebuilt and committed; README has a verified / not-verified table
with exact commands; known limitations updated; nothing is described as heard, played by a human, or run on a real device unless it was; final message lists
what changed, the choices you made, what is stuck, and what you need from me.


## 14. v5 addendum (what the later passes changed; apply these when rebuilding)

* **No speech at all.** Do not build a speech engine, announcer, barks, device TTS or a voice-pack/ElevenLabs pipeline. Radio lines and story dispatches are silent text with portrait chips. Keep music (adaptive cues, motifs, stingers) and sound effects (units, buildings, UI, world, skills, ambience); creature growls are effects, human-vowel layers are not. Everything must play with no audio at all.
* **3D look by pre-rendering.** Build a tiny bake-time software 3D rasteriser (z-buffer, key light + hemispheric ambient + specular, ambient-occlusion approximation, emissive team-colour layer) and describe every unit and building as a compact procedural mesh recipe; bake per-facing sprites lazily into an LRU atlas (time-sliced, placeholder first), draw with an oblique tilt, depth-sort by y + height, give cliffs real faces and base occlusion, keep sun shadows consistent with the sprite light. No WebGL (context loss, store/phone risk), no external assets. Console HUD: chamfered metal panels, glowing accent line, segmented bars, as a CSS-only skin that leaves measured geometry alone.
* **Lean and robust is a feature.** Ship a safe minifier (real tokenizer; strips comments/whitespace; never renames identifiers) with a determinism proof (sim hashes equal minified vs readable) and mutants; error boundaries around sim / view / render / ui stages, a recovery dialog after repeated faults, audio and storage fault tolerance, a service-worker stale-build repair, watchdogs and viewport/camera repair, each with fault-injection tests and a mutation proof. Delete dead code; keep the single file near 1.2 MB (370 KB gzipped).
* **AI: be honest about what search buys.** Implement the AlphaGo family idea (PUCT over macro-actions with a calibrated abstract model, determinised worlds from a belief grid, expert iteration) but ship it only if >= 48 mirrored games show a gain (Wilson CI above 50 %); in this project it showed none (50.0 %, +10.7 % CPU) and ships switched off, while the league-tuned fog-honest agent with learned value stays. There is no language model in the game: say so in docs and store text.
* **Publishing.** Ship `dist/pwa` as the installable build, a Pages workflow, and an iPhone install guide; test it served from a sub-path (service worker scope, manifest, match start, offline reload).
* **Process lessons.** Session rate limits kill sub-agents about every 6 hours: commit constantly, resume them with a message, never assume a dead agent's work is merged. A gate that aborts at the first failure (`set -e`) hides later failures: grep the whole log for real failures, not only "FAIL" (passing mutation lines contain "FAILED"). Re-run the full gate after every merge.
