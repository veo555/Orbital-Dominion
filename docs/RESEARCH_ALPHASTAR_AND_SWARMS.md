# Research note: AlphaStar, the AlphaGo family, what came after, swarm theory — and what a browser RTS can actually adopt

Status of the sources (read this first). The environment this was written in blocks `deepmind.google`, `youtube.com`, `arxiv.org` and `gwern.net`;
only web-search summaries were reachable. So:

* **Confirmed by search results I could read** (marked [S] with a link at the end): AlphaStar reached Grandmaster on all three races on the
  European ladder, above 99.8 % of ranked players; it played under a camera and APM limits agreed with a professional; one network per race; the
  training combines imitation learning, a league and multi-agent RL; off-policy correction with TD(λ), V-trace and UPGO; the league has main agents,
  main exploiters and league exploiters; main agents use prioritised fictitious self-play; entity encoder = Transformer, LSTM core, pointer-network
  targeting; AlphaStar Unplugged (offline RL on ~5 M human replays, 90 % win rate against the earlier behaviour-cloning agent); TStarBot-X
  (league training on a small budget; main agent beat two master players 5:0 and 4:1); HierNet-SC2 (hierarchical macro-actions, 94-97 % against the
  cheating built-in levels 8-10); mini-AlphaStar (single-machine reproduction); the 2023-26 wave of LLM agents and benchmarks (SC2Arena, StarEvolve,
  TextStarCraft II, world models).
* **From my own memory** (marked [M]; treat as unverified until checked against the Nature paper's Methods and its pseudocode supplement): exact
  network sizes, the exact league mixing proportions, MMR figures, the APM cap values, wall-clock/TPU counts.
* **The YouTube video you linked (timestamp 47:43)** could not be opened here, so nothing in this note comes from it. If you paste its transcript or
  tell me which claims you care about, I will fold them in.

---

## 1. What AlphaStar is

**Problem.** StarCraft II is a real-time, partially observed, simultaneous-move, long-horizon (10^3-10^4 decisions), enormous-action-space game,
non-transitive (rock-paper-scissors across strategies). Self-play against only the latest self collapses into cycles; a strong agent must be robust
against a *population*.

**Agent** [S for the components, M for sizes]. One network per race. Inputs: a set of up to a few hundred *entities* (own, enemy-visible, neutral) each
with a feature vector; scalar features (resources, upgrades, build order so far); a coarse minimap. Entity set → **Transformer encoder** (permutation
invariant, 3 layers, 2 heads in the description I could check) → pooled and concatenated with scalar and spatial encodings → **deep LSTM core** (memory
under fog of war) → **autoregressive action heads**: action type → delay → queue flag → *which units* (a **pointer network** over the entity set,
repeated) → target unit (pointer) or target location. A **value head** that, during training only, sees the opponent's hidden state (a centralised
baseline).

**Constraints that make it human-comparable** [S]: camera interface (it must move a view window), and an action-rate cap negotiated with pro player
TLO (numbers [M]: on the order of a few tens of actions per 5 s windows, average APM below the pros', plus an observation-to-action delay of
roughly 100+ ms).

**Training in three stages.**

1. *Supervised imitation* of human replays (several hundred thousand games above a high MMR) gives a policy π_SL that is already about Gold-level.
   Maximum likelihood: min −Σ log π_θ(a_t | o_{≤t}).
2. *Reinforcement learning* of the policy with a reward that is only the final win/loss (+ auxiliary pseudo-rewards early on), by actor-critic with
   off-policy corrections, because the actors lag the learner:
   * **V-trace** (Espeholt et al. 2018, IMPALA): with behaviour policy μ and target π, ρ_t = min(ρ̄, π/μ), c_t = min(c̄, π/μ),
     δ_t = ρ_t (r_t + γV(x_{t+1}) − V(x_t)), and the target
     v_s = V(x_s) + Σ_{t≥s} γ^{t−s} (Π_{i<t} c_i) δ_t.
   * **TD(λ)** for the value baselines.
   * **UPGO** (upgoing policy update, a self-imitation rule): bootstrap with the better of "continue the trajectory" and "the value estimate":
     G_t = r_t + γ G_{t+1} if Q(s_{t+1},a_{t+1}) ≥ V(s_{t+1}), else r_t + γ V(s_{t+1}); the advantage G_t − V(s_t) pushes the policy only toward
     trajectories that turned out better than expected.
   * **KL regularisation** toward π_SL (and entropy), to stay in the human-like region of strategy space while exploring.
3. *The League* [S, mixing details M]. A growing population of frozen and learning agents:
   * **Main agents** (the ones you evaluate): trained against a mixture of self-play and **prioritised fictitious self-play (PFSP)** over all past league
     players. PFSP samples opponent j with probability ∝ f(P[i beats j]), e.g. f_hard(x) = (1−x)^p (focus on opponents you still lose to) or
     f_var(x) = x(1−x) (focus on even matches).
   * **Main exploiters**: trained only against the current main agents to find *their* holes; reset when they succeed, then the main agents must fix them.
   * **League exploiters**: PFSP against the whole league to find holes anywhere; occasionally reset.
   * Snapshots are frozen periodically and added to the league. The aim is a policy with low **exploitability** (worst-case loss against the best
     response), which is what makes a non-transitive game robust; the league is an approximate fictitious-play/PSRO-style solver.

**Results** [S for headline, M for MMR]. Grandmaster on all three races, above 99.8 % of active players; final MMRs of order 6000 (Protoss ≈ 6.3 k).
The league training lasted weeks on large TPU slices [M].

**Why a browser game cannot copy it.** Months of TPU time and a 10^8-parameter network are not shippable in a 2 MB HTML file running on a phone.
What *does* transfer is the **method** (population + PFSP + exploiters + an evaluated value function + imitation prior + fairness limits) applied to a
much smaller, parameterised, hierarchical agent, trained with our own headless simulator.

## 2. What happened after (2019-2026)

| Line of work | What it showed | Relevance here |
|---|---|---|
| **AlphaStar Unplugged** (DeepMind, 2023) [S] | Offline RL benchmark on ~5 M human replays; offline actor-critic / MuZero baselines; 90 % win rate vs. the earlier BC agent | Learning from logged games works; we generate our own logs by self-play and train a small value function offline |
| **TStarBot-X** (Tencent, 2020) [S] | League training with agent roles and matchmaking on modest compute; beat two master players | Evidence that a league is feasible on a small budget; supports our small league |
| **HierNet-SC2 / TG** (Liu et al.) [S] | Three-layer *hierarchical* macro-action architecture, no supervised pre-training, 94-97 % vs the cheating built-in AI | Our strategy layer chooses macro-actions (expand, tech, mass, harass, defend, regroup); parameters tuned by the league |
| **mini-AlphaStar** (JAIR 2022) [S] | Scaled-down reproduction for one machine | Confirms the architecture can be shrunk; we shrink even further (no net for control) |
| **SMAC and MARL benchmarks** | Micro-management as cooperative MARL (QMIX, MAPPO) | Unit-level coordination ideas; we use potential fields instead of learned policies |
| **LLM-agents on SC2** (TextStarCraft II, SwarmBrain, SC2Arena, StarEvolve, "Society of Mind" hierarchies, world-model refinement) [S] | Language models as slow strategists over a text API; hierarchical split (strategy by LLM, execution by scripts); mixed results, still below RL on real-time play | Not shippable offline in a browser; the *hierarchical split* is the useful lesson, and our rule-based Overseer is explicitly **not** an LLM |
| **Other population/self-play systems** [M] | OpenAI Five (PPO + self-play), AlphaZero/MuZero (search + learned model), Pluribus (CFR), XLand (open-ended auto-curricula) | Search with a learned value (AlphaZero-style) motivates using V(s) inside planning; auto-curricula motivate exploiters |

I found no new "AlphaStar-successor" system in the 2024-26 results; the active frontier is LLM agents and offline/world-model methods, mostly evaluated
against the built-in AI rather than on the ladder.

## 3. Swarm theory

* **Stigmergy** [S]: coordination through traces left in the environment; no central planner, no direct messaging.
* **Ant colony optimisation** (Dorigo, early 1990s) [S]: pheromone τ on edges/cells, update
  τ ← (1−ρ)τ + Σ_k Δτ_k (evaporation ρ, deposit Δτ_k ∝ 1/L_k of the ant's path); choice probability ∝ τ^α η^β (η = heuristic desirability).
* **Boids** (Reynolds 1987) [M]: steering = w_s·separation + w_a·alignment + w_c·cohesion, each a purely local rule.
* **Particle swarm / evolution strategies** (Kennedy-Eberhart 1995 [S]; CMA-ES, Hansen & Ostermeier 2001 [M]) for parameter search.
* **Potential fields / influence maps** (game AI practice, [M]): sum of attractive and repulsive fields over a grid; gradient ascent for movement.
* **Ideal Free Distribution** (Fretwell & Lucas 1970 [M]): foragers distribute over patches until per-capita payoff is equal.

## 4. Mapping: idea → what this game does

(The right-hand column is filled in from the 4.0 AI work; see `docs/AI_DESIGN.md` and `docs/AI_LEAGUE_RESULTS.md` for the evidence and the numbers.)

| Idea | Adopted? | How |
|---|---|---|
| Partial observability / fog | yes | the AI only reads what its team has seen; Bayesian belief grid over enemy positions; scouting driven by a stigmergic "staleness" map |
| Human-like action limits | yes | per-tier APM cap and reaction delay; difficulty from skill, not resource cheating |
| Hierarchical macro-actions | yes | strategy layer picks macro-actions; unit controllers execute |
| League + PFSP + exploiters | yes, on a small parameter vector | CMA-ES over θ, PFSP matchmaking, main + exploiter agents, Bradley-Terry/Elo |
| Learned value function | yes, small | logistic / small MLP trained on league games, embedded as weights, used in attack/defend/expand decisions |
| Imitation of humans | no | there are no human replays of this game; the v3 AI plays the role of the "supervised" anchor (Elo baseline) |
| Deep policy network, V-trace, UPGO, KL | no | needs orders of magnitude more compute than a browser/CI budget; recorded here so the choice is explicit |
| Boids / potential fields | yes | army cohesion, surround, kiting, chokepoint handling |
| Ant-colony stigmergy | yes | scouting coverage, harass routes, defence demand |
| Ideal Free Distribution | yes | worker allocation across crystal patches |
| Lanchester combat model | yes | fight prediction for engage/retreat |

## 5. Sources

* [AlphaStar: Grandmaster level in StarCraft II using multi-agent reinforcement learning (DeepMind)](https://deepmind.google/blog/alphastar-grandmaster-level-in-starcraft-ii-using-multi-agent-reinforcement-learning/) — via search summary; the page itself was blocked.
* [Nature 575 (2019), Vinyals et al.](https://www.nature.com/articles/s41586-019-1724-z)
* [AlphaStar Unplugged: Large-Scale Offline Reinforcement Learning (arXiv 2308.03526)](https://arxiv.org/pdf/2308.03526) — via search summary.
* [TStarBot-X (arXiv 2011.13729)](https://arxiv.org/pdf/2011.13729) — via search summary.
* [HierNet-SC2 / On Efficient RL for Full-length Game of StarCraft II (JAIR)](https://www.jair.org/index.php/jair/article/view/13743); [mini-AlphaStar (arXiv 2104.06890)](https://arxiv.org/abs/2104.06890).
* LLM agents: [SC2Arena / StarEvolve (arXiv 2508.10428)](https://arxiv.org/pdf/2508.10428), [SwarmBrain](https://www.emergentmind.com/papers/2401.17749), [World Models for Policy Refinement in StarCraft II](https://arxiv.org/pdf/2602.14857).
* Swarm theory: [stigmergy](https://lia.disi.unibo.it/Courses/AI/fundamentalsAI2008-09/papers/stigmergy.pdf), [ant colony optimization](https://www.cs.princeton.edu/courses/archive/fall24/cos597C/bib2/Ant_colony_optimization.pdf), [swarm intelligence chapter](https://www2.cs.uh.edu/~ceick/6367/SWIchapterforHandbook_NC.pdf).

---

## 6. The AlphaGo family (2016-2020) and what v5 took from it

**Status of the sources.** DeepMind's pages and arXiv could not be opened from the sandbox used for v5 (egress blocked), and no web search
was used. Everything in this section is **from memory [M]** of the papers listed at the end of the section; figures marked [M] should be
checked against the papers before they are quoted elsewhere. The *algorithms* (formulas) are standard and were re-derived and unit-tested
here (`tests/sim/ai_mcts.js`); the *numbers about DeepMind's systems* are recollections.

### 6.1 AlphaGo (Silver et al., Nature 529, 2016) [M]

* **SL policy network p_σ**: a 13-layer convolutional network trained to predict expert moves from ~30 million KGS positions (about 57 %
  accuracy). **Rollout policy p_π**: a linear softmax over small local pattern features, far weaker (~24 %) but about a thousand times
  faster (microseconds per move).
* **RL policy network p_ρ**: initialised from p_σ and improved by policy-gradient self-play against randomly chosen earlier versions (an
  opponent pool, to avoid over-fitting to the latest self); it won ~80 % against p_σ without search.
* **Value network v_θ**: regression of the game outcome z from positions of p_ρ self-play games, one position per game (~30 million games)
  so that strongly correlated positions do not cause over-fitting.
* **Search**: asynchronous MCTS. Selection `a = argmax Q(s,a) + u(s,a)` with `u = c_puct P(s,a) √(Σ_b N(s,b)) / (1 + N(s,a))` and P from
  **p_σ** (the SL network searched better than p_ρ, presumably because it keeps a broader set of plausible moves). Leaf evaluation mixes
  the value network and a fast rollout: `V(s_L) = (1 − λ) v_θ(s_L) + λ z_L`, best at λ = 0.5. Q is the mean of the leaf values below; the
  move played is the most visited at the root. Virtual loss for parallel threads. The distributed version beat Fan Hui 5:0 (2015) and the
  "Lee" version beat Lee Sedol 4:1 (2016).

### 6.2 AlphaGo Zero (Silver et al., Nature 550, 2017) [M]

* **No human data, no hand features**: one residual network `f_θ(s) = (p, v)` with a policy and a value head; no rollouts (leaf value = v).
* **MCTS as a policy-improvement operator**: self-play moves are chosen from the visit distribution `π(a|s) ∝ N(s,a)^(1/τ)` (τ = 1 for the
  first ~30 moves, then → 0); **Dirichlet noise** Dir(0.03) mixed into the root prior with ε = 0.25 for exploration; ~1600 simulations per
  move.
* **Loss** `l = (z − v)² − πᵀ log p + c ‖θ‖²`: the network learns to predict the search's move distribution and the game's result.
* **Evaluator / gating**: a new network becomes the self-play generator only if it beats the current best by ≥ 55 % over 400 games.
* Results: beat AlphaGo Lee 100:0 after three days; the 40-block version beat AlphaGo Master.

### 6.3 AlphaZero (Silver et al., Science 362, 2018; preprint 2017) [M]

* The same algorithm for chess, shogi and Go with the rules as the only domain knowledge; **no gating** — one network updated continually;
  Dirichlet α scaled to the typical number of legal moves (0.3 chess, 0.15 shogi, 0.03 Go); draws as outcomes; ~800 simulations per move.
  Beat Stockfish, Elmo and the three-day AlphaGo Zero.

### 6.4 MuZero (Schrittwieser et al., Nature 588, 2020; preprint 2019) [M]

* Search **without known rules**: a learned **representation** h (observation → latent state), **dynamics** g (latent state, action → next
  latent state, reward) and **prediction** f (latent state → policy, value). Trained end-to-end by unrolling K (≈ 5) steps with targets: the
  search's visit distribution, n-step bootstrapped returns, observed rewards. MCTS runs in the latent space with a pUCT rule that adds a
  slowly growing exploration term. Matched AlphaZero on board games and set the Atari state of the art; "Reanalyse" re-runs the search on old
  data. Later work (Gumbel MuZero, 2022) made policy improvement reliable with very few simulations.

### 6.5 Imperfect information (what AlphaGo did not face) [M]

* **Determinisation / Perfect-Information Monte Carlo**: sample complete worlds consistent with what is known, search each, aggregate
  (Ginsberg's bridge program GIB, 2001). Known failure modes: **strategy fusion** (each world's plan assumes it knows the hidden state) and
  **non-locality** (Frank & Basin 1998). **Information-Set MCTS** (Cowling, Powley & Whitehouse 2012) builds one tree over information sets.
  For games where information-gathering moves matter, belief-state methods (ReBeL 2020, Student of Games 2023) are the principled route.
* **Search on abstract RTS models**: game-tree search over high-level states with Lanchester-style combat models in StarCraft (Uriarte &
  Ontañón, AIIDE 2014), portfolio / greedy search for combat (Churchill & Buro), UCT for tactical planning in Wargus (Balla & Fern 2009),
  combinatorial bandits in µRTS (Ontañón 2013). These are the closest published relatives of what v5 does.

### 6.6 What v5 used, adapted or rejected (details and formulas: `docs/AI_DESIGN.md` §17-19)

| AlphaGo-family idea | v5 |
|---|---|
| PUCT selection, mean backup, most-visited move | **used** (`41_ai_mcts.js` `puctSelect`, `plSimulate`), tested on toy trees with mutants |
| Policy prior from a trained policy (p_σ) | **adapted**: the league-tuned θ rules as utilities + a learned linear head φ |
| Value network at the leaves, mixed with fast rollouts, λ = 0.5 | **used**: the existing V(s) MLP on abstract features + rollouts with a cheap θ-only policy |
| Search on the true rules | **adapted**: a hand-built abstract model calibrated against the real simulation (the small-data stand-in for MuZero's learned model) |
| MCTS as policy improvement: π ∝ N^(1/τ), Dirichlet root noise, train p towards π | **used** in the expert-iteration league for the head φ (KL loss = AlphaGo Zero's policy loss up to a constant) |
| `(z − v)²` value training on self-play outcomes | **used**: V(s) retrained on the new league games |
| Evaluator gating at 55 % | **used** with 32 instead of 400 games (noisy; reported with intervals) |
| Continual update (AlphaZero), tabula rasa (Zero), learned dynamics (MuZero) | **rejected** for this budget: see AI_DESIGN §19 |
| Perfect information | **replaced** by determinisation over samples of the belief grid (fog of war) |

References [M]: D. Silver et al., "Mastering the game of Go with deep neural networks and tree search", Nature 529:484-489 (2016).
D. Silver et al., "Mastering the game of Go without human knowledge", Nature 550:354-359 (2017). D. Silver et al., "A general reinforcement
learning algorithm that masters chess, shogi, and Go through self-play", Science 362:1140-1144 (2018). J. Schrittwieser et al., "Mastering
Atari, Go, chess and shogi by planning with a learned model", Nature 588:604-609 (2020). P. Cowling, E. Powley, D. Whitehouse, "Information
Set Monte Carlo Tree Search", IEEE Trans. Comput. Intell. AI in Games 4(2) (2012). I. Frank, D. Basin, "Search in games with incomplete
information: a case study using Bridge card play", Artificial Intelligence 100 (1998). A. Uriarte, S. Ontañón, "Game-tree search over
high-level game states in RTS games", AIIDE 2014. R. Balla, A. Fern, "UCT for tactical assault planning in real-time strategy games", IJCAI
2009. I. Danihelka et al., "Policy improvement by planning with Gumbel", ICLR 2022.
