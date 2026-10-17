# Contributing

Orbital Dominion is an MIT-licensed research testbed. Pull requests, forks, issues, new agents and replication reports are all welcome.

## Quick start
```
python3 build.py && open dist/orbital_dominion_v4.html     # play
node tests/sim/smoke.js                                     # fast checks
bash tests/run_all.sh                                       # full gate (~30 min, needs Playwright 1.56)
```
Read `CLAUDE.md` first: it lists the engineering rules (deterministic simulation, no globals, no network, colour tokens, touch contract) and the known traps. `docs/ARCHITECTURE.md` is the module map. Review `src/`, not `dist/` (generated; commit it after `python3 build.py`).

## Good first contributions
* **A new agent** for the league (`tools/league/`, `src/js/42_ai_agent.js`): beat Master in `tools/league/eval.js`, report intervals.
* **Replay export/import** (seed + command log) to enable the teaching studies in `docs/RESEARCH_AGENDA.md`.
* **A better abstract battle model** for the planner (`src/js/41_ai_mcts.js`, calibration in `tools/league/calib_model.js`).
* **A human study**: run S1-S3 and publish the data.
* A real-device test report (iPhone / Android): the project has never run on one.

## Rules of thumb
1. A test that cannot fail is worthless: mutate the code and watch it fail (`--mutants` in the sim tests).
2. Balance or AI changes need numbers: at least 24 seeds, report the interval.
3. Simulation modules (`00..46`) never touch DOM, canvas, audio, `Date` or `Math.random`; use `G.rng`.
4. Do not claim an LLM, "perfect", or human-level play. The Overseer is rule-based.
5. Payments are cosmetic and optional; never sell anything that affects balance.
