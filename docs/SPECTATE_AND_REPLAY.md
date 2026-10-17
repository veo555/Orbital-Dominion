# Watch agents, replay codes, and how to use them for research

Added in 6.1. Two parts: **spectator mode** (UI, `src/js/75_spectate.js`) and **replays** (sim, `src/js/47_replay.js`).

## 1. Spectator mode
Main menu -> **Watch agents**. Pick a faction and a tier (Easy / Normal / Hard / Master) for each side, a map seed (blank = random), or paste a replay code. Two T2 agents then play a complete match. Nobody commands anything.

The panel shows, refreshed about 2.5 times a second:
* **A graph of each agent's own win estimate** `V(s)` (blue = A, amber = B) and the **material share** of A (dashed). The two agents are fog-honest, so their estimates can disagree: that gap is the information asymmetry (one has scouted, the other has not).
* A **stats table** (army value, workers, bases, supply, bank, era).
* A one-line **"why"** per agent: its current posture (building up / massing / attacking / defending / retreating) with the numbers behind it (predicted fight win chance, enemy force near its base, the threshold it waits for).
* **Key moments**: match start, attack waves, retreats, new bases, lost bases, era changes.
* Controls: Pause, 1x / 2x / 4x / 8x, Follow action (auto camera) or free camera (drag, arrow keys / WASD, wheel), Copy code, Copy link, New match (same setup, new seed), Exit. Keyboard: Space pause, 1 2 4 8 speed, F follow, Esc exit.

## 2. Replay codes
Every spectated match has a short code, for example `OD1-424242-aurora-obsidian-master-hard-m`:

```
OD1 - <seed> - <faction A> - <faction B> - <tier A> - <tier B> - <flags>
flags: m = rocks + rich fields, a / b = arsenal off for side A / B, 0 = none
```
The same code always reproduces the same match: the simulation is a pure function of its setup, the agents use their own seeded streams, and since 6.1 the remaining sim-affecting random draws (movement jitter, unit pop-out, the campaign AI, Overseer picks) come from a saved replay stream (`G.rrng`) when a game is started with `replay:true`. The address bar carries `#watch=<code>`, so **a link to the page plus `#watch=<code>` opens that exact match** (for example `https://<your-pages-url>/#watch=OD1-424242-aurora-obsidian-master-hard-m`).

### Verifying a replay
`replayHash()` hashes the observable state (tick, every unit's team, position and HP, every building's HP and queue, resources, the replay stream state). A checkpoint `(tick, hash)` is stored every 300 ticks (10 s). `replayExport()` returns the setup, the checkpoints so far and the result; two machines that run the same code must reach identical checkpoints. Tested in `tests/sim/replay.js` (two different `Math.random` streams, same hashes; a control without `replay:true` that must differ; save/restore mid-match; code parsing and nine malformed codes; mutants for each guarantee) and in `tests/e2e/e2e_spectate.py` (same in the browser).

### Headless use (batch experiments)
```js
const load = require('./tests/sim/simlib3.js');           // loads the sim modules into a sandbox
const S = load();
S.newGame(S.__run('replayParse("OD1-424242-aurora-obsidian-master-hard-m")'));
for (let i = 0; i < 18000; i++) S.step();                 // 10 minutes of game time
console.log(JSON.stringify(S.__run('replayExport()')));
```

## 3. Limits (read before building on it)
* Only **agent-vs-agent** matches are replayable. A human match would need every command logged; the simulation is deterministic, so a command log is the missing piece (a good first contribution).
* Particles and effects keep `Math.random` (cosmetic), so a replay is identical in state, not in every spark.
* Replays are valid for the **same build**: a balance or AI change alters the match. The code does not carry a build id yet.
* The graph shows each agent's own `V(s)` (a small model trained on league games, AUC about 0.8 on held-out games), not a ground-truth win probability.
* Nobody has yet measured whether watching these matches teaches people anything: that is study S2 in `docs/RESEARCH_AGENDA.md`.
