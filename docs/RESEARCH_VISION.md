# Swarm Agents as Game Design: a playable research testbed

**Orbital Dominion** is an open-source real-time-strategy game that doubles as a research testbed for one question:

> *Can small, inspectable, fog-honest AI agents be built into the gameplay of a strategy game itself, as opponents, as delegates, as teammates and as teachers, in a way that makes the game more interesting, and can people learn from how those agents play?*

It is inspired by the *StarCraft* family of games (macro economy, fog of war, scouting, counters, expansion, army control) and by the
research programmes built on them: DeepMind's **AlphaStar** (league training, partial observability, human-like action limits) and the
**AlphaGo / AlphaZero** line (search guided by a learned prior and value). It is deliberately **small-scale**: everything runs in one
HTML file in a browser, with no server, no GPU and no language model. That constraint is the point. It makes every idea
inspectable, reproducible and forkable by anyone with a laptop.

## 1. Thesis and honest scope

Most game AI is a *difficulty slider* bolted on at the end. We treat agents as a **design material** instead, and ask four concrete things:

| # | Research question | What this repository offers today | Status |
|---|---|---|---|
| Q1 | **Agents as opponents.** Can a fog-honest, human-rate-limited agent tuned by self-play give a more varied and fairer opponent than scripted waves? | Skirmish opponent with belief grid, scouting, fight prediction, 4 tiers, league-tuned parameters | Built and measured bot-vs-bot; **no human study yet** |
| Q2 | **Agents as delegates (swarm).** Can a player hand parts of the game to agents (every unit may be an agent with a role, a wallet and XP, plus a collective "Overseer") and so play at a different level of abstraction? | 12 agent roles, Overseer with 7 domains (off / advise / act), Autopilot / Advisor / Manual presets, a labour marketplace | Built; **delegation effects on human play not yet measured** |
| Q3 | **Agents as teachers.** Can people learn from watching agents and from agent advice? | Agents explain *why* they act (info card), the advisor shows a calibrated win chance with reasons, the menu runs agents against each other (attract mode) | Prototype; **learning gain not yet measured** |
| Q4 | **Agents vs agents as a lab.** Can the same game serve as a fast, deterministic benchmark for multi-agent methods? | Headless deterministic simulator at ~100x real time, league tools (CMA-ES, PFSP, Bradley-Terry), mutation-proofed tests | Built and used for all numbers in `docs/AI_LEAGUE_RESULTS.md` |

**What this project is not.** It does not claim to reproduce AlphaStar (which used orders of magnitude more compute and a deep
network), and it contains **no language model**. The Overseer's text box is a rule-based keyword grammar. Claims in this repository
are limited to what is measured and logged; where something is only a hypothesis, the documents say so.

## 2. System overview

```
 headless deterministic simulator (fixed 1/30 s step, seeded RNG)         <- src/js/00..46
   |-- opponent agent  : perception -> belief grid -> strategy -> macro/tactics   (41_ai_*, 42_ai_agent)
   |-- swarm layer     : unit agents (roles, wallets, XP) + Overseer + marketplace (30_systems, 43..45)
   |-- advisor         : same fog-honest perception for YOUR team, win-chance estimate + reasons
   |-- planner (off)   : AlphaGo-style PUCT search over macro-actions (41_ai_mcts)
 league tools (Node)   : self-play, CMA-ES, PFSP, Elo / Bradley-Terry, calibration   <- tools/league
 renderer / UI         : pre-rendered 3D-style sprites, console HUD, touch, PWA       <- src/js/5x..7x
```

### 2.1 The opponent agent (Q1, Q4)
* **Fog-honest.** It only reads what its team has seen. A **Bayesian belief grid** tracks where enemy structures and armies probably are; scouting is driven by a **stigmergic** "staleness" map (ant-colony style pheromones).
* **Human-like limits.** Per-tier action-rate cap and reaction delay: difficulty comes from skill, not from resource cheating.
* **Hierarchical.** A strategy layer picks macro postures (expand / mass / attack / defend / retreat / harass) from a learned value estimate and a Lanchester-style fight predictor; unit controllers execute (kiting, concave, focus fire, siege).
* **Tuned by self-play.** A parameter vector is optimised by a league: CMA-ES, prioritised fictitious self-play (PFSP), main and exploiter agents, Bradley-Terry ratings. A small learned value function (16-unit network) is trained on league games.

### 2.2 The swarm layer (Q2)
Select units and **enroll them as agents** with one of 12 roles (Miner, Builder, Scout, Guard, Hunter, Raider, Medic, ...). Each agent explains what it is doing and why, earns crystals and experience, and can be overridden at any time. Above them sits the **Overseer**, a collective controller with seven domains, each switchable off / advise / act. You can speak to it ("keep 14 miners", "guard the natural with 4 riflemen", "why?"). A labour marketplace (hire freelancers by the minute, hour, day, month or per task) makes delegation an economic decision rather than a toggle.

### 2.3 The advisor and the teaching loop (Q3)
The advisor uses the same fog-honest perception as the opponent, but for the human's team. When enabled it reports a **calibrated win chance** and the change a decision is expected to make ("win chance 54 % -> 61 %: expanding now"). The main menu continuously plays agent vs agent, so a new player can watch how an economy opens, how scouts spread and when armies commit, before ever touching a unit.

### 2.4 Search (Q4)
A **PUCT macro-planner** (AlphaGo-family) on a calibrated abstract model of the game, with determinised worlds sampled from the belief grid, and an expert-iteration loop that fits a policy head to the search. **It is shipped switched off:** over the tested budgets it showed no measurable gain (50.0 % [36, 64] over 48 games) at about +10 % CPU. The negative result is documented, and the code is there to build on.

## 3. How it relates to prior work

| Idea | Source | Used here |
|---|---|---|
| League training, PFSP, exploiters | AlphaStar (Vinyals et al., Nature 2019) | Yes, on a parameter vector, not a deep net |
| Partial observability, action-rate limits | AlphaStar | Yes: belief grid, APM cap, reaction delay |
| Learned value + tree search | AlphaGo / AlphaZero (Silver et al., 2016-2018) | Yes, small scale; shipped off |
| Offline learning from logged games | AlphaStar Unplugged (2023) | Partly: value function fitted offline on league logs |
| Stigmergy, Ideal Free Distribution, Lanchester | swarm / ecology / combat theory | Yes: scouting, worker allocation, fight prediction |
| Behavioural-cloning from human replays | AlphaStar | **No** (no human replay corpus exists for this game) |

Full discussion with sources: `docs/RESEARCH_ALPHASTAR_AND_SWARMS.md`, design and maths: `docs/AI_DESIGN.md`.

## 4. What has been demonstrated, and what has not

**Demonstrated (reproducible from this repository):**
1. A fog-honest, rate-limited, self-play-tuned agent can play complete games of a non-trivial RTS inside a 1.3 MB single-file browser game. The suite passes: no-peek tests, determinism tests, save/restore tests, CPU budgets.
2. The difficulty tiers are ordered by league rating (see the results file for exact numbers and confidence intervals; **Master and Hard are not statistically separated**).
3. The simulator is a fast, bit-exact benchmark: the same seed gives the same game, which makes ablations and A/B tests cheap.
4. Delegation (swarm), advice (win chance with reasons) and spectating (agent vs agent) are all implemented as playable features, not slideware.

**Not yet demonstrated (open, and the reason this is a research project):**
* That any of this makes the game **more fun or more interesting** to humans. This needs a user study.
* That players **learn** from watching agents or reading advice (needs a controlled comparison, e.g. with / without advisor, skill measured before and after).
* That league-tuned opponents are **more human-like or more varied** than scripted ones (needs a human rating study).
* That search beats the tuned heuristic policy at this scale (our first attempt did not).
* Anything about real devices: the game has never run on a physical phone; no person has listened to the audio.

## 5. Proposed experiments (see `docs/RESEARCH_AGENDA.md` for protocols)
1. **Opponent variety and fairness:** blind A/B, scripted waves (campaign AI) vs league agent, rated by players on challenge, fairness and variety.
2. **Learning from agents:** randomised groups (watch agent games / use advisor / control), measure build-order quality and economy at minute 8 before vs after.
3. **Delegation:** does Autopilot-for-economy free attention for tactics? Measure actions per minute and army-control quality.
4. **Agent-vs-agent science:** new agent families (neural policies, imitation, evolutionary strategies) dropped into the same league.
5. **Explainability:** compare rule-based "why" strings against alternatives.

## 6. Reproduce and extend
```
python3 build.py                              # build the playable game
node tests/sim/smoke.js                       # fast headless checks
node tools/league/run.js --help               # self-play league (see docs/AI_LEAGUE_RESULTS.md for commands)
node tests/sim/ai_agent.js --quick            # no-peek, determinism, APM-cap tests for the agent
```
Contributions are welcome: see `CONTRIBUTING.md`. Everything is MIT licensed; fork it, swap in your own agent, publish your league results.

## 7. Citing
If you use this in research, please cite the repository (`veo555/claude`, Orbital Dominion v6.0) and the papers it builds on
(listed in `docs/RESEARCH_ALPHASTAR_AND_SWARMS.md`).
