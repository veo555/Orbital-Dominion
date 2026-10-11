# T2 opponent — design and maths

> **What this AI is — and is not.** Orbital Dominion has **no language model and must not get one** (no network access, a 1-2 MB
> single file, store policy). Every "AI" in the game — the skirmish opponent T2, the campaign opponent, and the player-side
> Overseer / Autopilot / advisor — is **classical and small**: hand-written rules, a parameter vector tuned by self-play, a Bayesian
> belief grid, a Lanchester combat predictor, a 16-unit value network, a linear policy head and (since v5) a Monte-Carlo tree search
> over macro-actions on an abstract game model. None of it understands language; the Overseer's command parser is a rule-based keyword
> grammar. Store text must not describe any of it as an LLM or as language understanding.

The skirmish opponent of v4.0 ("T2") replaces the v3 wave AI (`40_ai.js`, kept as `makeAIV3`/`aiThinkV3` for the campaign and as
the league's anchor). It is a **hierarchical, parameterised, fog-honest policy** whose parameter vector θ is tuned by a self-play
**league** run headlessly on our own simulator. v5 adds an AlphaGo-style **macro planner** (§17) and **expert iteration** (§18).
Results (Elo, win rates, calibration, CPU) are in `docs/AI_LEAGUE_RESULTS.md`.

| File | Role |
|---|---|
| `src/js/41_ai_lib.js` | Pure maths: belief update, diffusion, pheromones, combat predictor, Ideal Free Distribution, value function, swarm geometry |
| `src/js/41_ai_mcts.js` | v5 **macro planner**: abstract game model, PUCT search, prior / rollout policies, determinisation, Dirichlet noise (§17) |
| `src/js/41_ai_params.js` | **Generated** (`tools/league/export_params.js`): θ per tier, style priors, V(s) weights, combat link constants, planner budgets, policy head |
| `src/js/42_ai_agent.js` | The agent: perception → belief → strategy (+ planner glue) → macro / workers / scouting / tactics, APM cap; the player's advisor |
| `tools/league/expit.js`, `expit_fit.js`, `calib_model.js` | v5 expert-iteration league, policy-head fit + promotion gate, abstract-model calibration (§17-18) |
| `tests/sim/ai_mcts.js` | PUCT on toy trees (+ mutants), policy improvement, model invariants, calibration against the real sim, head fit, gate, planner determinism / save |
| `tools/league/*.js`, `train_value.py` | Game runner, process pool, CMA-ES, PFSP, Bradley–Terry, league, value-function trainer, calibration, evaluation, profiling |
| `tests/sim/ai_lib.js`, `ai_combat.js`, `ai_agent.js` | Unit tests, real-sim predictor calibration, no-peek / determinism / APM / save / CPU tests (each with a control that must fail) |

Everything in 41/42 is sim-side: no DOM, no `Math.random` (the AI's own mulberry32 state lives in `ai.rs`), no wall clock, and the
whole AI state is plain data + typed arrays in `G.ais[team]`, so `46_save.js` snapshots it unchanged (tested).

## 1. Architecture

```
            every think (2-4 Hz, tier)            every 2nd think            every 4th think
 G ──seen()──► aiObserve ──► memory (mem.u/b, t, first-seen) ──► aiBelief: structure grid P_s, army density a, pheromones
                   │ reaction delay                                    │
                   ▼                                                    ▼
             perceived enemies R.en ──► aiArmy (tactics)        aiStrategy: V(s), p_G, postures  ◄── θ (41_ai_params.js)
                                         groups: attack / home      mil ∈ {hold, attack, defend, retreat}, eco ∈ {grow, mass},
                                         engage/flee, focus, kite,  harass squad
                                         concave, march, siege, hero
             aiMacro (odd thinks): supply, hero, workers, era, buildings (priority + reservation), research, trade, production
             aiWorkers + aiScout (every 4th): Ideal Free Distribution, repair demand pheromone, belief-driven scouting
             all commands ──► aiAct: APM token bucket
```

Time slicing keeps the per-think cost bounded: belief + strategy and macro alternate, workers/scouting run on every fourth think,
creep planning on every fourth hold-think; the expensive placement scan stops at the first anchor that has a legal spot.

## 2. Perception: acting only on what the team has seen

* **The gate.** `aiObserve` iterates the world but lets an enemy entity through only if `seen(team, e)` is true — the same function
  the renderer uses for the player's fog (vision grid + cloak/detection). Units inside geysers or garrisons are skipped.
* **Memory.** Every sighting writes `{type, x, y, hp, maxhp, t, first}`. Buildings are forgotten when all four corners of their
  footprint are in view and the building is not seen (destroyed). Units expire after 80 s, or are dropped as **killed** when they
  vanish in plain view: last seen < 2 s ago and every point they could have reached since (`speed · age + 24` px, 6 directions) is
  visible (what a player sees as an explosion).
* **Reaction delay** (AlphaStar-style human-like constraint): a unit is *perceived* (acted upon) only `delay` seconds after its
  sighting episode began (`now − first ≥ delay`); a sighting episode restarts after 3 s out of view. Plus the think interval, the
  mean effective delay is `delay + iv/2` (Easy 0.75 s … Master 0.28 s).
* **What counts as public knowledge**: terrain, resource and creep-camp positions, and both start sites (a 2-player, point-symmetric
  map: any player knows where the opponent starts). Known residual information channels, accepted because a human has them too:
  `canPlace` refuses a site occupied by a fogged enemy building (a human gets the same error); `G.res` amounts of remote fields are
  read for "does this expansion still have crystals"; units that fire are globally revealed for 1.6 s by the sim's own rules
  (`revealT`), for every player.
* **Verification** (`tests/sim/ai_agent.js`): from a mid-game snapshot the AI thinks 16 times on the true world and 16 times after
  every unseen enemy unit was moved and damaged, six unseen units added, unseen buildings damaged and the enemy's bank / era /
  upgrades / kills changed. The command streams and the complete AI state must be identical. Two mutated AIs that peek (no `seen()`
  gate; army estimate from `G.units`) are caught by the same test. A second test checks that every id in memory was visible at
  some tick.

## 3. Beliefs (Bayesian grid on 22 × 22 cells of 4 × 4 tiles)

**Enemy structures.** Per cell an occupancy probability `P_s`. Cells containing a remembered building are set to 0.99. Cells in
view without a building get the Bayes update for an imperfect sensor with detection probability `p_d = 0.92` and false-alarm
rate `p_f = 0.002`:

    P(occ | no detection) = P (1 − p_d) / ( P (1 − p_d) + (1 − P)(1 − p_f) )
    P(occ | detection)    = P p_d / ( P p_d + (1 − P) p_f )

Cells out of view relax towards a **hazard prior** (the opponent expands over time):
`P ← P + h (q(t) − P)` with `h = 1 − 0.97^Δt`; for the cell of an expansion site at distance `d` px from the enemy start,
`q(t) = 0.7 σ((t − t_exp)/70)`, `t_exp = 170 + d/9`; elsewhere `q = 0.003`. The prior starts with the (public) enemy main at 0.99.

**Enemy army location.** A probability density `a` over cells (Σa = 1), propagated as a random walk:
diffusion by pairwise fluxes between 4-neighbours, `f_ij = k (a_j − a_i)`, `k = min(0.24, 0.12 Δt)` (mass-conserving, non-negative
for `k ≤ 0.25`, both tested), then a pull towards its own structures `a ← 0.97 a + 0.03 P_s/ΣP_s`. Observation: if enemy combat
units are seen, `a ← 0.4 a + 0.6 obs` (value-weighted sightings); if not, **negative information** `a_i ← a_i (1 − 0.85)` for
cells in view, then renormalise.

## 4. Stigmergy: pheromone fields

All three fields use the ant-colony update `τ ← (1 − ρ) τ + Δτ`, followed by diffusion where noted:

| Field | Deposit Δτ | Evaporation ρ per update | Diffusion | Used for |
|---|---|---|---|---|
| `ph.vis` coverage | cells in view set to 1 | `1 − 0.985^Δt` | — | scouting: staleness = 1 − τ |
| `ph.def` defence demand | perceived enemies within 620 px of our structures, value/100 | `1 − 0.6^Δt` | k = 0.08 | aggregates repeated alarms |
| `ph.dem` repair demand | damaged own structures, missing HP/150 | `1 − 0.7^Δt` | k = 0.05 | miners sent to the strongest demand cell |

Scouting target = argmax over cells of `(1 − τ_vis) · (0.12 + P_s + 0.5·[expansion site]) − distance/3200`; the scout is the
fastest healthy light unit (a worker early in the game), recalled when hurt below 55 % or after its tour.

## 5. Combat predictor

A force is a list of **stacks** (`cmbStackOf`): n identical units with HP, armour (+ upgrades + visible aura buffs), projectile armour,
tags, air/ground ability, damage per shot incl. bonuses and weapon upgrades, cooldown, range, speed, splash, healing, lifesteal,
cloak and detection — all from `UDEF`/`BDEF`, i.e. the same numbers `dmgVs()` uses.

**Heterogeneous Lanchester square-law ODE** (`cmbSimulate`, Euler, Δt = 0.5 s, ≤ 40 s): each stack splits its fire over the enemy
stacks it can hit in proportion to their numbers; with `n_s = H_s/hp_s`

    dH_t/dt = − Σ_s  n_s · dps(s→t) · (n_t / Σ_{t' hittable by s} n_t') · splash(s,t)

For one homogeneous stack per side this is exactly Lanchester's square law (tested: 20 vs 10 identical units leave 17.28 survivors,
analytic √300 = 17.32). Extensions: out-ranged stacks start firing after `(R_max − range)/v_close`; splash multiplies by the units a
blast catches in a blob of ~24 px spacing, `min(n_ground, 1 + ½ π R² / 576)`; Menders heal bio stacks (14 HP/s each, energy pool
300 HP); lifesteal heals the attacker; a side without a detector cannot hit cloaked stacks.

**Closed form**: fighting strength `S = (Σ dps)(Σ hp)`; `ℓ = ln(S_A+1) − ln(S_B+1)`.

**Link** (fitted on the real sim, `tools/league/calib_combat.js`): `P(A wins) = σ(k_ode · margin + k_L · ℓ)`, no intercept (the
predictor is antisymmetric). Random skirmishes (2–14 random units per side, random upgrades, sometimes a hero) are simulated in the
real engine; on held-out skirmishes the blend beats both parts (numbers in the results doc and `tests/sim/ai_combat.js`). The
first version of the ODE was worse than the closed form; the calibration exposed a splash bug (splash scaled by a single target
stack) — the experiment changed the model, which is the point of running it.

**Use.** Engage/retreat (local fights, with our own turrets/hub added at home), the global attack decision against the estimated
enemy army, the creep-camp check (P ≥ 0.85), and Call to Arms (P < 0.3 at a hub under attack). Unit choice uses the same
attrition rates: exchange efficiency of type s against the observed enemy mix
`eff_s = Σ_t share_t dps(s→t) cost_t / hp_t  ÷  (Σ_t share_t dps(t→s)/hp_s · cost_s)`, and the composition weight of a class is
multiplied by `(eff/mean eff)^θ_counter`.

## 6. Strategy layer (hierarchical macro-actions)

Like HierNet-SC2 / mini-AlphaStar's macro-actions, the top layer chooses among a few **postures** rather than raw commands; the
lower layers turn a posture into commands.

* **Value function** `V(s) = P(win | observation)` (shipped: a 16-unit tanh MLP, held-out AUC 0.825; logistic regression is the fallback): logistic regression (or a 16-unit tanh MLP if it is clearly better on held-out
  games) over 11 observation features: log army-value ratio, log worker ratio, base difference, era difference, time, army
  difference, supply, log bank, hero level difference, kill difference, log structure-value ratio. Enemy quantities come from
  memory (with floors), never from the true state. Training: §9.
* **Estimated enemy army** = remembered combat units (≤ 90 s old) plus a *phantom* of Riflemen-equivalents for what has not been
  seen: `phantom = θ_prior · V_own · (0.4 + 0.6 · staleness)`, staleness = time since the enemy army was last seen / 90 s.
  `p_G` = predictor(own army, estimated army).
* **Military posture** `mil`: *defend* when perceived enemies with ≥ 120 value are at our structures (target = their centroid);
  *attack* when `U = (p_G − θ_aggr) + 0.25 θ_vW (V − 0.5) > 0`, after `θ_firstAtk`, with ≥ `θ_atkSup` army supply (or when
  near max supply); attack ends in *retreat* when the attack group falls below 35 % of its start or `p_G < 0.8 θ_retreat`
  (20 s cool-down), *retreat* → *hold* after 8 s. V shifts the attack threshold: adaptive aggression.
* **Economic posture** `eco`: *mass* (army first: worker target capped, no expansion, +1 production building) while a stronger
  enemy army was seen in the last 75 s or we are under attack; otherwise *grow*. V also shifts the number of bases wanted.
* **Harass**: when θ_harass > 0.3, a squad of 4–8 fast units (Raptor, Reaver, Skiff) raids the least-defended known enemy hub's
  workers and returns when its local P < 0.45 or its HP < 45 %.

## 7. Macro (priority list with reservation)

One ordered list per macro think: supply → hero → workers → era → buildings → research → trade → army production. An affordable
item is done; a high-priority item that is not affordable **reserves** its cost, so lower items only spend the unreserved rest
(no starvation of an expansion by a stream of Riflemen; no idle bank either because cheaper items still proceed). Production
capacity is sized from income: income ≈ 98 crystals/min per miner (≤ 20 per base) + 52 ether/min per siphon worker (measured, §8),
garrisons wanted = `round(θ_gar · income / 300) − foundries − airfields` (+1/+2 when the bank exceeds 900/1600). Buildings: first
garrison, first siphon, expansions (`θ_expandAt`, `θ_expandRate`, saturation trigger, V shift), armory, more garrisons, siphons
(ether need), foundry / airfield (composition weights), exchange (trade weight or floating crystals → buy ether on the market),
depot, turrets (`θ_turret` per base, placed towards the enemy start), forum, habitats. Placement scans up to 15 tiles around the
best anchor and falls back to other bases (a full plateau once caused a 60 s supply block — found in a trace, fixed).

## 8. Workers: Ideal Free Distribution

Measured in the real sim (one base, 2 min after a 30 s warm-up): crystals/min = 215, 420, 595, 778, 958, 1120, 1313, 1493, 1595,
1720, 1875, 1925 for 2…28 miners (≈ 98 per miner up to 16, then 0.6×, 0.4×, ~0.1×); a siphon gives ≈ 52 ether/min per worker,
linear to 6. Each site gets a concave marginal-gain curve `g_s(k)`; ether is weighted by a shadow price
`λ_e = 1.6 / 1.0 / 0.45 / 0.12` for an ether bank below 150 / 400 / 900 / above. **Greedy marginal allocation** (give the next
worker to the site with the largest marginal gain) maximises a separable concave sum (Gross 1956; Fox 1966) and its fixed point is
the **Ideal Free Distribution** (Fretwell & Lucas 1970): no worker can raise its income by moving. Both properties are tested
against brute force. The agent moves at most two selections of workers per worker-think (APM) from the most over-allocated to the
most under-allocated site.

## 9. Tactics and swarm control

* **Groups.** During an attack, the *attack group* (units present when the attack started, plus joined batches) fights and marches;
  new units wait at the stage and join as a batch of ≥ max(5, 30 %) — no reinforcement trickle. Everything else is the *home group*.
* **Engage / flee with hysteresis.** Per group, local enemies within 520 px and enemy static defence in range; `p = P(win)` from §5
  with our own turrets/hub added at home. Before contact the group declines a fight below `θ_aggr − 0.1`; after contact it disengages
  only below `θ_retreat` **and** only if it is not slower than the enemies in contact (turning round in front of faster units feeds
  free kills — seen in traces); it never flees from its own base. The retreat direction is a potential field: attraction to the
  stage, `1/d` repulsion from each threat weighted by value.
* **Focus fire** (Normal+): enemies scored by `(dps + 1) · (1 + ½·hero + 1.2·healer) / max(10, hp)`; greedily, the nearest ranged
  units whose volley covers 1.25 × the target's HP are assigned to it (overkill-aware, kill-securing), up to 3 selections per think.
* **Kiting** (Hard+): ranged units with a reloading weapon (cd > 0.25 s) step 75 px back along the potential field from melee units
  in contact; idle units re-acquire automatically.
* **Concave** (Hard+): on first contact, sub-groups of four take slots on an arc of radius 0.75 × mean range facing the enemy.
* **Formation march** (boids, Reynolds 1987): cohesion — if the group's mean distance from its centroid exceeds 2.2 × (60 + 22√n),
  the stragglers close up first (no chokepoint stringing); alignment — the group moves at 1.1 × its slowest member's speed;
  separation is the engine's own unit push; with micro, sub-groups of four march to `goal + ½ (sub-centroid − centroid)` (clamped
  to a radius growing with √n). Formations are re-planned at most every 3 s.
* Siege Howitzers at 195–335 px, damaged units (< 22 %, hero < 30 %) pulled back, hero skills on clusters (v3's rule fed with
  perceived enemies only), creep camps with the hero when the predictor says ≥ 0.85, Call to Arms for hopeless hub defences.

## 10. Human-like limits (AlphaStar's constraints, scaled)

* **APM**: every command to one selection (a human's select + right-click), every queue click, placement, research, rally, tax
  change, skill learn and cast costs one action from a token bucket refilled at `apm/60` per second with a 5-second burst
  (`max(3, 5 · apm/60)`), as AlphaStar capped actions per 5-second window. Command-APM ≈ half of a human's APM (which counts the
  selection clicks separately). Tested from the outside: the sim's command functions are wrapped, identical orders within one think
  are merged into one selection command, and every 1/5/10/30 s window must stay within `burst + rate · W`; an AI whose `aiAct`
  never refuses breaks the bound (control).
* **Reaction delay** §2; **think rate** (2–4 Hz); **micro** switches per tier.

| Tier | θ | think | APM (command) | delay | focus | kite / concave / pull-back | macro efficiency (production and worker queues) |
|---|---|---|---|---|---|---|---|
| Easy | θ₀ | 0.6 s | 45 | 0.50 s | no | no | 0.50 |
| Normal | θ₀ | 0.45 s | 80 | 0.35 s | yes | no | 0.70 |
| Hard | league M@30 | 0.45 s | 90 | 0.30 s | yes | no | 0.65 |
| Master | league M@30 | 0.25 s | 240 | 0.15 s | yes | yes | 1 |

(Shipped "ladder-2"; measured separations in `docs/AI_LEAGUE_RESULTS.md` §2a.) Income handicap is 1.0 on every tier;
the v3 "Hard = +25 % income" cheat is not used by T2 (the field `handicap` exists and defaults to 1.0).

## 11. The parameter vector θ and faction styles

29 parameters, searched in the unit cube (CMA-ES samples are mapped back by reflection, `u = 1 − |1 − (z mod 2)|`) and decoded to
ranges: worker target per base 12–22, worker cap 24–48, workers per siphon 2–6, first expansion 100–600 s, expansion rate,
Era II 140–480 s, Era III 360–900 s, production share 0.6–2.2, seven composition weights (light, melee, anti-armour, heavy,
artillery, air, support), counter strength 0–1.5, engage threshold θ_aggr 0.45–0.85, retreat threshold 0.12–0.45, earliest attack
60–480 s, attack supply 8–40, harass, scouting, turrets, creeping, V weight 0–2, bank discipline, trade, tech, unseen-army prior
0.6–1.4. **Faction styles are priors**: an offset added to θ in the same space for the faction played (rush: earlier/lower attack
thresholds, melee, fewer turrets, later expansion and Era II, more harass; turtle: turrets, heavy and artillery, later attack;
trader: trade, earlier expansion and Era II, tech, air). The same code runs for every faction.

## 12. The league (tools/league/run.js)

Following AlphaStar's league (Vinyals et al. 2019), scaled from thousands of TPUs to three CPU processes:

* **Main agent M**: CMA-ES over θ (λ = 10). Each candidate plays a mirrored pair of games (same seed, sides and factions swapped)
  against the current mean of M (**self-play**) and a mirrored pair against an opponent drawn by **PFSP** from the whole league
  (frozen snapshots, exploiters, v3 Easy/Normal/Hard anchors) with `f_hard(p) = (1 − p)²`, p = M's Laplace-smoothed score over the
  last 24 games against that opponent.
* **Main exploiter E**: CMA-ES (λ = 6) trained only against the current M mean; it **graduates** into the pool and is reset to θ₀
  when it scores > 70 % over its last 6 rating games against M, or after 8 generations.
* **League exploiter L**: CMA-ES (λ = 6) against a PFSP opponent from the frozen pool; graduates at > 70 % (or after 10
  generations) and is then reset to θ₀ with probability 0.25 (as in AlphaStar).
* **Snapshots** of M every 3 generations; rating games of the three means each generation.
* **Variance reduction**: common random numbers (every candidate of an optimiser faces the same opponents on the same seeds in a
  generation), mirrored sides, and a fitness `score + 0.25 (material share − 0.5)` that breaks ties between draws.
* **Games** are capped at 8 game minutes during training (10 in the final evaluation); an unfinished game is adjudicated by
  material share (army + structures + workers + bank + era): > 0.6 wins, < 0.4 loses, else a draw.
* **Ratings**: Bradley–Terry maximum likelihood by Hunter's MM algorithm with a one-game symmetric prior, on the Elo scale,
  anchored at v3-Hard = 1000.
* **Checkpointing**: optimiser states (plain JSON), pool, win-rate memory and ratings are written after every generation; `--resume`
  continues.

**CMA-ES** (Hansen 2016 tutorial, default parameters): sample `x_k = m + σ B D z_k`; recombine the μ = λ/2 best with weights
`w_i ∝ ln(μ + ½) − ln i`; cumulative step-size adaptation
`p_σ ← (1 − c_σ) p_σ + √(c_σ(2 − c_σ) μ_eff) C^{−½} (m' − m)/σ`, `σ ← σ exp((c_σ/d_σ)(‖p_σ‖/E‖N(0,I)‖ − 1))`;
covariance `C ← (1 − c₁ − c_μ) C + c₁ (p_c p_cᵀ + δ(h_σ) C) + c_μ Σ w_i y_i y_iᵀ`. Tested on the sphere and Rosenbrock functions,
including a JSON checkpoint/restore mid-run.

**Value function training** (`train_value.py`, numpy): every 15 game seconds each T2 side logs its 11 observation features and
the same 11 features computed from the **true** state (privileged — AlphaStar's centralised critic idea, used here only as an
analysis upper bound); label = final result for that side (draws 0.5). Split held out **by game** (gid mod 5). L2-regularised
logistic regression by Newton/IRLS; a 16-unit tanh MLP with Adam and early stopping as the alternative (shipped only if it improves
held-out log-loss by > 1 %). Reported: log-loss, Brier, AUC, ECE, reliability table, AUC by game phase, baselines. The league
trains V after generation 4 and re-trains every 5 generations; later games use it.

## 13. AlphaStar and follow-ups → what we did

| Idea (source) | Here | Why |
|---|---|---|
| Partial observability, camera/fog honesty (AlphaStar 2019) | **Adopted**: `seen()` gate, memory, belief grid; tested with mutation controls | the old AI read hidden state; fairness is the point |
| APM limit and reaction delay (AlphaStar; ~350 ms average delay, capped actions per 5 s window) | **Adopted**: token bucket with a 5 s burst, per-tier delay, think rate; tested | human-like play, and difficulty from skill not cheats |
| Supervised imitation init from human replays, then RL | **Adapted**: no human replays exist; θ₀ is a hand-made prior ("supervised" by design knowledge) and the league starts from it; exploiters reset to θ₀ | we have no replay corpus |
| Actor-critic with V-trace off-policy correction, TD(λ), UPGO | **Not adopted** (documented): our policy is a 29-parameter program, not a differentiable network; there is no per-step policy gradient to correct | a black-box ES over θ is the right tool for a tiny, non-differentiable parameter space |
| KL regularisation towards the supervised policy | **Adapted**: CMA-ES starts at θ₀ with σ₀ = 0.12 (trust region in θ space); exploiters reset to θ₀ | keeps the search near sensible strategies |
| Centralised value baseline with opponent information | **Adapted for analysis**: a privileged V on true features is trained beside the fog-honest one (upper bound on what better scouting could buy); only the observation-based V is shipped | the shipped AI must not see hidden state |
| Transformer entity encoder, LSTM core, autoregressive pointer heads | **Rejected** | no training budget, no GPU, phone CPU at runtime; a hand-structured hierarchy + small learned pieces fits |
| League: main agents with PFSP, main exploiters, league exploiters, frozen snapshots, Nash-style evaluation | **Adopted (scaled)**: all four roles, PFSP f_hard, graduation/reset rules; Bradley–Terry ratings instead of a Nash average (few agents) | finds and closes exploits a single self-play loop misses |
| AlphaStar Unplugged (offline RL on replays, 2023) | **Partly**: V(s) is learned offline from logged league games | the same "learn from logged games" idea, at our scale |
| TStarBot-X (league on small compute, 2020) | **Adopted in spirit**: league roles with a small budget, diversity via exploiters and style priors | evidence that small leagues still help |
| HierNet-SC2 / mini-AlphaStar macro-actions | **Adopted**: posture layer over macro/tactical controllers | hierarchy makes a tiny policy expressive |
| LLM-based SC2 agents (2023-25) | **Rejected** | no network, no model at runtime, latency; the opponent is rule-based plus tuned parameters (as is the Overseer — never described as language understanding) |
| Lanchester laws for fights | **Adopted**, calibrated on the real sim | cheap, principled, testable |
| Boids, potential fields, stigmergy/ACO, Ideal Free Distribution | **Adopted** (§4, §8, §9) | army cohesion, retreat direction, scouting coverage, demand aggregation, worker allocation |
| PSO / evolution strategies for parameter search | **CMA-ES** (an ES with covariance learning) | strong default for 10–100 noisy dimensions |

## 14. CPU, determinism, save

* Measured with `tools/league/profile.js` (the sim is unchanged; `aiThink` is wrapped from outside). Budget: replacing the v3-Hard
  AI by T2 Master must cost ≤ +25 % of total tick time; tested in `tests/sim/ai_agent.js`.
* Determinism: AI-vs-AI games are bit-exact for a fixed (seed, `Math.random` stream); the T2 sources contain no `Math.random`,
  `Date` or `performance.now` (checked).
* Save: `G.ais[t]` is plain data + typed arrays; `46_save.js` needed no change. Round trip with two T2 AIs tested.

## 15. Integration

* `00_core.js` `DIFF`: each tier has `tier:'easy'|'normal'|'hard'|'master'` (T2 preset name); new entry `master` (its v3 fields copy
  Hard, used only if a campaign is started at Master). `20_sim.js` `newGame`: `G.aiKind = opts.aiKind || (opts.campaign ? 'v3' : 't2')`.
* Skirmish and the attract-mode demo use T2; **campaign missions keep v3** (their waves, `foe.mods` waveMult/intervalMult/
  firstWave/hero/air and star thresholds were balanced against it; `tools/mission_sim.js` proxies stay valid).
* Menu: a fourth difficulty button "Master" (`72_menus.js` list and descriptions, `71_hud.js` `DIFF_NAMES`, `style.css` grid of 4).
* `tests/sim/smoke.js` (swarm-off equivalence with v2) and `tests/sim/off.js` now pass `aiKind:'v3'` so they still compare the same
  enemy AI on both sides of the diff.

## 16. Limits

Bot-vs-bot Elo is not human Elo; nobody has played against T2 yet. θ was tuned for ~2.5 CPU-hours (a few hundred CMA-ES
evaluations in 29 dimensions) — a local refinement of a hand-made prior, not a converged optimum. Training games are adjudicated
at 8 minutes, which rewards mid-game material. The combat predictor knows nothing about terrain, chokepoints or spell timing.
The Autopilot "human proxy" is itself a rule-based bot.

## 17. v5: the macro planner — AlphaGo-style search on an abstract model (`41_ai_mcts.js`)

The strategy layer of §6 is a hand-structured policy whose parameters θ the league tuned. v5 puts a **search** on top of it, the way AlphaGo
put Monte-Carlo tree search on top of its policy and value networks. What is searched is the choice among seven **macro-actions** (the
postures the agent already had, made explicit):

| index | macro-action | what the real agent does while it is in force (`42_ai_agent.js`) |
|---|---|---|
| 0 | grow | economy first: workers up to θ's cap, no new attack |
| 1 | expand | build the next base now (base target = bases + 1; the hub is a must-have even in "mass") |
| 2 | tech | era now, armory now, research without the bank buffer |
| 3 | mass | army first ("mass" economy posture, +1 production building, no expansion) |
| 4 | attack | start an attack with ≥ 6 supply (campaign: ≥ 6 / waveMult), +1 production building |
| 5 | defend | no new attack, an ongoing attack retreats, one more turret per base |
| 6 | harass | send the fast-unit raid squad now (needs ≥ 3 Raptors / Reavers / Skiffs) |

Scouting is **not** a macro-action: the abstract model has no information state, so a search could never value scouting; it stays with θ
and the belief grid (§3-4). This is a known limit of planning on a model without beliefs inside it.

### 17.1 The abstract model (the forward model the search runs)

State (per side, a `Float64Array` with both sides and the time): crystals, ether, workers, bases + a base timer, siphons, production
buildings + timer, era + timer, upgrade levels + timer, army value A, Lanchester coefficients d (dps per value) and h (hp per value), turrets,
structure value, army location (home / attacking + travel timer), kills, losses, worker cap, hero level, fast-unit share. Transitions in 20-s
steps for both sides simultaneously:

* **Economy**: crystals/s = H · g(W_c / H) · κ_inc with the measured Ideal-Free-Distribution curve g (16 miners per base at 1.63/s each, then
  0.6×, 0.4×); ether/s = 0.867 · min(0.3 W, 3 · siphons) · κ_e. Each base trains one worker per κ_wt s up to the cap (economic actions: θ's
  cap; army actions: the lean "mass" cap). Production capacity follows income as in the real macro (target = κ_gar · income / 300 per
  minute), a share κ_oth of the income goes into other structures, Generators cost 12.5 crystals per supply.
* **Army**: bought from the bank at ≤ κ_prod value/s per production building, ether share 0.08 (Era I) / 0.3 (Era II+). Era and upgrades
  multiply d and h (κ_era, κ_up).
* **Combat** (Lanchester square law on value units, two Euler half-steps): a side loses `κ_eng · (Σ opposing dps) / h` value per second, with
  dps = d · A plus turrets (20 dps, 320 hp) and hubs (8 dps) for a defender at home. The attacker's fire goes to the army in proportion to its
  hit points against the statics; a defence below 15 % of the attacker gets raided: turrets, workers (κ_wk), structures (κ_raid). An attack
  ends when the army falls below κ_ret of its start value or its strength d·h·A² is below half the defender's (the real agent's retreat
  rule). Harass kills workers at κ_har per squad value per second and loses value to defenders at home.
* d and h at the root come from the real unit stacks (`cmbStackOf`, the numbers the combat predictor of §5 uses): our army against the
  estimated enemy army and vice versa.

**Calibration** (`tools/league/calib_model.js`). Real T2-vs-T2 games are logged every 10 s with the **privileged** true state of both sides
(offline only) and each side's macro behaviour, labelled from its posture and from what it built. The model is rolled forward from the true
state at t with both sides' observed labels and compared with the truth at t + 60 s and t + 120 s; the constants κ are fitted by coordinate
descent (log scale) on half of the games and reported on the other half, against the persistence baseline (state(t+h) = state(t)). Numbers:
`docs/AI_LEAGUE_RESULTS.md` §9. Honest summary: workers, bases and structures are predicted far better than persistence; army value and
material share, which battles dominate, only slightly better, and on fresh seeds the share is not better than persistence.

### 17.2 The search

* **Prior** (AlphaGo's policy network p_σ): `P(s,a) = softmax_a((u_θ(s,a) + φ_a·x(s)) / 0.6)` over the legal actions. `u_θ` are the
  league-tuned rules of §6 written as utilities of the seven actions (attack: `4 (p_G − θ_aggr)` with penalties before `θ_firstAtk` and below
  `θ_atkSup`; expand: base count against θ's base schedule; tech: era due by θ_era2 / θ_era3; ...). `x(s)` are 12 features (log army ratio,
  log worker ratio, base and era difference, time, bank, workers, army locations, log army size). φ (7 × 12) is the **policy head** learned by
  expert iteration (§18); φ = 0 is the v4 policy.
* **PUCT selection** (Silver et al. 2016): `a* = argmax_a  Q(s,a) + c_puct · P(s,a) · √(Σ_b N(s,b)) / (1 + N(s,a))`, c_puct = 1.5, values in
  [0, 1]; an unvisited action is valued at the parent's mean (first-play urgency).
* **Opponent**: not searched (a simultaneous-move game is not a tree of alternating moves). In every step the opponent samples its
  macro-action from the same prior with θ₀ and its faction style: open-loop MCTS, the tree is over our actions and the opponent is part of a
  stochastic environment.
* **Expansion / depth**: one new node per simulation, tree depth ≤ 3 macro-steps of 20 s.
* **Leaf evaluation** (AlphaGo's mixing): `V(s_L) = (1 − λ) · v(s_L) + λ · z_L`, λ = 0.5 (AlphaGo's value), v = the embedded value network
  V(s) (§6, 16-unit MLP) on the 11 features computed from the abstract state, z_L = a **fast rollout** to the horizon t₀ + 100 s with the
  cheap rollout policy (θ utilities only, no head; AlphaGo's p_π was likewise cheaper than p_σ), scored `z = σ(12 · (material share − 0.5))`,
  the adjudication rule of our evaluations made smooth.
* **Backup**: Q(s,a) = mean of the leaf values below (s,a). **Move**: the most-visited root action (training: sampled from N^(1/τ), τ = 1,
  with Dirichlet(0.3) noise, ε = 0.25, on the root prior, as in AlphaGo Zero).

### 17.3 Imperfect information: determinisation from the belief grid

AlphaGo had perfect information; we have fog of war. The planner uses **determinised / information-set MCTS** (Cowling, Powley & Whitehouse
2012; the pitfalls in Frank & Basin 1998): K worlds are **sampled from the AI's beliefs**, a tree is searched in each with an equal share of
the budget, and the root visit counts are summed. The enemy side of a world:

* army value ~ max(remembered army, estimate · LogNormal(0, 0.12 + 0.35 · staleness)), the estimate being §6's phantom rule;
* workers ~ max(seen, symmetric prior · LogNormal(0, 0.18)); bases = remembered hubs + the public main + **one Bernoulli draw per expansion
  site with the belief grid's occupancy P_s** (§3); era = max(seen, our era with p = 0.6); bank, production and structures likewise;
* d, h from our stacks against the remembered + phantom enemy stacks.

Everything comes from `ai.mem` and `ai.bel`, never from the true opponent state. The no-peek test (§2) runs with the planner on and checks
that its root state and decisions are identical after the hidden world is scrambled; a mutant whose world sampling reads the true enemy army
and bank is caught (`tests/sim/ai_agent.js`). Known weakness of determinisation ("strategy fusion": each world's tree acts as if it knew the
hidden state) is acceptable here because no macro-action gathers information.

### 17.4 Trust region, time slicing, budget, tiers

* **Override rule.** The search changes the agent's behaviour only where it clearly disagrees with the rules it was built from: let a_θ be the
  θ rules' favourite (argmax u_θ). If the most visited action a ≠ a_θ and Q(a) − Q(a_θ) ≥ 0.02 (or a_θ was never visited and a has half of
  all visits), the agent follows a; otherwise the v4 controllers act unchanged. This keeps an imperfect model from overriding well-tuned
  rules on noise (a policy-improvement step inside a trust region; compare the KL constraint of §13). The first version without it let the
  model "raid" with no fast units and withhold attacks the rules would have made.
* **Time slicing.** The planner runs inside the strategy think (2 Hz at Master); each slice searches ⌈K / slices⌉ worlds; a decision is made
  when all K worlds are done. Master: 256 simulations per decision, K = 4 worlds of 64, 8 slices → a decision every 4 s of game time, 32
  simulations in the worst think. Planner state (`ai.pl`: root state, point estimate, accumulated N and W, prior, RNG state) is plain data:
  `46_save.js` round-trips it (tested); the search uses only the AI's own mulberry32 state, so it is deterministic.
* **Tiers.** Easy / Normal / Hard: no search. Master: the full budget (`41_ai_params.js`, results doc §10).

## 18. v5: expert iteration in the league (`tools/league/expit.js`)

AlphaGo Zero's insight: MCTS is a **policy-improvement operator** (the visit distribution π of a search guided by a prior p is a better
policy than p), so train p towards π and search again with the better p. Here:

* **Self-play data.** The main agent M (Master + planner, θ = league-1's M@30) plays self-play and PFSP games with Dirichlet root noise and
  τ = 1. Every root decision is logged: x(s), u_θ(s), legal mask, π = N / ΣN.
* **Policy head.** `φ ← argmin_φ mean_i KL(π_i ‖ p_φ(·|s_i)) + c ‖φ‖²`, c = 10⁻³, on a replay window of the last 6 generations. Up to the
  entropy of π (a constant) this is AlphaGo Zero's policy loss `−πᵀ log p`. Convex in φ; exact gradient
  `∂L/∂φ_a = mean_i (p_ia − π_ia) x_i / T + 2cφ_a`; Adam. θ itself is not fitted to π: θ also drives the low-level controllers, so fitting
  it to a macro distribution would entangle the two; the head absorbs the correction (the documented alternative to "fit θ by CMA-ES to π").
* **Value.** V(s) is retrained on all games logged so far (`train_value.py`; label = the outcome z: AlphaGo Zero's `(z − v)²` term).
* **Gate** (AlphaGo Zero's evaluator): the candidate (new φ, new V) plays 16 mirrored pairs (32 games) against the incumbent without noise and
  becomes the incumbent only with ≥ 55 %. AlphaGo Zero used 400 games; with 32 games the gate is noisy (a true-50 % candidate passes with
  probability ≈ 0.3), so promotions are reported with Wilson intervals and re-checked in the final evaluation.
* **Kept from league-1:** PFSP opponent choice f_hard, a main exploiter E (CMA-ES over θ against M) and a league exploiter L (CMA-ES against
  the PFSP pool) with graduation, frozen snapshots of every promoted version, v3 anchors and the v4 Master (no planner) as an anchor,
  Bradley–Terry ratings, a checkpoint after every generation (`--resume`).

## 19. AlphaGo / AlphaStar idea → adopted, adapted or rejected

| Idea (source) | Here | Why |
|---|---|---|
| Policy network p_σ trained on expert moves (AlphaGo) | **Adapted**: the prior is the league-tuned θ rules as utilities, plus a linear head | no expert corpus; θ is our "supervised" policy |
| RL policy p_ρ by self-play policy gradient (AlphaGo) | **Adapted** in league-1: θ by CMA-ES in a league | non-differentiable 29-parameter program |
| Value network v_θ on self-play outcomes (AlphaGo) | **Adopted**: the V(s) MLP on league games, evaluated at the search leaves | §6, §18 |
| Fast rollout policy p_π (AlphaGo) | **Adopted**: θ-utility softmax without the head, on the abstract model | cheap rollouts |
| Leaf mixing V = (1−λ) v + λ z, λ = 0.5 (AlphaGo) | **Adopted**, λ = 0.5 | AlphaGo's best value; λ not re-tuned here (budget) |
| PUCT selection, mean backup, most-visited move (AlphaGo / AlphaGo Zero) | **Adopted** | tested on toy trees with two mutants |
| The real rules as the simulator (AlphaGo, AlphaZero) | **Adapted**: a calibrated **abstract** model | the real sim costs ~10⁴× more per step |
| Learned latent model (MuZero) | **Rejected** for now | a learned dynamics model needs far more data than a few thousand games; a hand-built abstract model calibrated on real games is the small-data equivalent |
| MCTS as policy improvement: π ∝ N^(1/τ), Dirichlet noise, loss −πᵀ log p (AlphaGo Zero) | **Adopted** for the policy head | §18 |
| Gate new networks at 55 % (AlphaGo Zero) | **Adopted** with 32 games instead of 400 | compute |
| Continual update without gating (AlphaZero) | **Rejected** | with our noise a bad update would ship; the gate is cheap insurance |
| Perfect-information search | **Replaced** by determinisation (ISMCTS-style) over belief samples | fog of war |
| Tabula rasa self-play (AlphaGo Zero) | **Rejected** | θ₀ and the league's θ are cheap, decent priors |
| League, PFSP, exploiters, fog honesty, APM limits (AlphaStar) | **Kept** (§10-13) | |
| LLM-based agents (2023-26) | **Rejected** | no network, no runtime model; nothing here is a language model |

## 20. v5: the player's advisor and the other AIs

* **Overseer advisor (swarm ON only).** `G.sw.adv` is a fog-honest perception object for the player's team (`aiAdvisorMake`): the same
  memory, belief grid, value function and a small planner search (96 simulations in 2 worlds, every 3 s). It has **no command authority**.
  Its per-macro-action Q values annotate the Overseer's proposals: an expansion Hub, an era, production buildings, turrets and an assault
  wave carry a line such as `win chance 54 % -> 61 %: expanding now` (status quo = "grow"; "(the planner advises against it now)" when the
  estimate drops). Swarm OFF never creates it, so the v2 equivalence (`tests/sim/off.js`) is untouched; with swarm ON it changes no game
  state (it only writes `G.sw.adv` and proposal texts).
* **Campaign opponent.** T2 honours the mission mods `waveMult` (attack size threshold and production pace) and `firstWave` (earliest
  attack) besides `intervalMult`, `hero` and `air`. Whether missions switch to T2: results doc §11.
