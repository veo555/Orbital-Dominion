# T2 opponent: league and evaluation results

Design and maths: `docs/AI_DESIGN.md`. All numbers below come from headless bot-vs-bot games in our own simulator. **Nobody has
played against T2 yet; bot-vs-bot Elo is not human Elo.** Raw logs (`tests/out/league/`, `tests/out/final/`, ~22 MB) are not
committed. Everything can be re-run from the committed tools (commands at the end).

## 1. League run (`tools/league/run.js`, seed 1)

| | |
|---|---|
| Budget | planned 2.5 h, **ran 30 generations / 118 min** (stopped by a session interruption after the gen-30 checkpoint; not resumed, inside the time box) |
| Workers | 3 processes; 72 games per generation (M 10×4, E 6×2, L 6×2, 8 rating games) |
| Games | **2160**, 98 % adjudicated at the 8-min training cap (material share), mean length 479 s |
| θ | 29 dimensions, CMA-ES σ₀ = 0.12, final σ = 0.146 |
| Pool at the end | v3 Easy/Normal/Hard anchors, M snapshots @0,3,…,30, main exploiters E0@8, E1@16, E2@24, league exploiters L0@5, L1@8, L2@18, L3@28 |
| Exploiter graduations | E0 (rate vs M 0.25, by age), E1 (0.33, age), E2 (0.42, age): **no main exploiter ever reached the 70 % graduation threshold against M**; league exploiters L0 and L1 reached 0.75 against the pool |
| Value function | trained at generations 4, 9, …, 29 from the logged features; the gen-29 model is shipped |

Main-agent progress (Bradley–Terry Elo of `M@g` from the league's own games, v3-Hard = 1000, a few games per point — noisy):

```
gen   1  900 |#########
gen   4 1191 |############
gen   7 1193 |############
gen  13 1219 |############
gen  18 1091 |###########
gen  22 1221 |############
gen  25  980 |##########
gen  30 1022 |##########
```

M's rating games against v3-Hard (mirrored, 8-min cap): gens 1–5 31 % of 16, 6–10 75 % of 12, 11–15 75 % of 10, 16–20 59 % of 16,
21–25 54 % of 12, 26–30 42 % of 12. **Honest reading:** the league improved quickly in the first ten generations and then
drifted within noise; with 4 games per candidate the CMA-ES fitness is very noisy (σ grew from 0.12 to 0.146 instead of shrinking,
the signature of a noise-dominated search). Final-league BT Elo of pool members: E2@24 1115, L1@8 1111, M@18 1091, M@15 1065,
M@6 1062, M@9 1058, M@24 1036, M@27 1034, M@21 1033, M@30 1022, L0@5 1017, E0@8 1013, M@12 1005, v3-hard 1000, E1@16 983,
**M@0 (θ₀) 972**, L3@28 961, M@3 933, L2@18 929, v3-normal 654, v3-easy 332.

**Selecting Master.** Because the league's own ratings are noisy, four candidates were re-measured with the Master configuration
against v3-Hard on fresh seeds (24 mirrored games each, 10-min cap):

| Candidate | vs v3-Hard | 95 % Wilson CI |
|---|---|---|
| θ₀ (hand prior, M@0) | 35.4 % | [19.6, 55.3] |
| M@18 | 47.9 % | [29.6, 66.8] |
| **M@30 (final mean) → shipped** | **50.0 %** | [31.4, 68.6] |
| E2@24 (main exploiter) | 39.6 % | [22.8, 59.2] |

BT over these games: θ₀ 898, M@18 985, M@30 998, E2@24 928 (v3-Hard 1000). The league's result is ≈ +100 Elo over the hand prior,
**not significant at 24 games per arm**.

## 2. Final evaluation (`tools/league/final_eval.js`, seeds 7001+, 10-min cap, mirrored sides and factions)

Tiers shipped in `41_ai_params.js`: Master / Hard / Normal use θ = M@30, Easy uses θ₀; they differ in think rate, APM cap,
reaction delay, micro and macro efficiency (`docs/AI_DESIGN.md` §10). **Income ×1.0 on every T2 tier; the v3 opponents keep their
own multipliers (v3-Easy 0.85, v3-Normal 1.0, v3-Hard 1.25).**

| Matchup (24 games each) | W–D–L | Score | 95 % Wilson CI | Elo diff | adjudicated |
|---|---|---|---|---|---|
| T2-Easy vs v3-Easy | 24–0–0 | 100.0 % | [86.2, 100] | ≥ +400 | 22 |
| T2-Normal vs v3-Normal | 21–2–1 | 91.7 % | [74.2, 97.7] | +417 | 15 |
| T2-Hard vs v3-Hard (+25 % income) | 9–2–13 | 41.7 % | [24.5, 61.2] | −58 | 18 |
| T2-Master vs v3-Hard (+25 % income) | 8–3–13 | 39.6 % | [22.8, 59.2] | −73 | 20 |
| T2-Master vs v3-Hard (+25 %), second seed set 9001+ | 9–4–11 | 45.8 % | [27.9, 64.9] | −29 | 20 |
| **T2-Master vs v3-Hard pooled (72 games incl. the selection run)** | | **45.1 %** | **[34.2, 56.6]** | −34 | |
| **T2-Master vs v3-Hard at equal income (×1.0)** | 19–4–1 | **87.5 %** | **[69.0, 95.7]** | +338 | 16 |
| T2-Normal vs T2-Easy | 18–4–2 | 83.3 % | [64.1, 93.3] | +280 | 23 |
| T2-Hard vs T2-Normal | 12–3–9 | 56.3 % | [36.9, 73.8] | +44 | 24 |
| T2-Master vs T2-Hard | 10–5–9 | 52.1 % | [33.2, 70.3] | +14 | 24 |
| **Ablation**: T2-Master vs T2-Master without V(s) | 11–5–8 | 56.3 % | [36.9, 73.8] | +44 | 20 |
| **Human proxy**: v3 Autopilot (Overseer) vs T2-Easy, 18-min cap | 16–3–5 | 72.9 % | [52.9, 86.6] | +172 | 12 |

Bradley–Terry Elo over the final-evaluation games (v3-Hard = 1000): T2-Easy 668, T2-Normal 918, T2-Hard 940, T2-Master 936,
T2-Master-noV 887, Autopilot 837, v3-Normal 527, v3-Easy −5. (In the separate fair-income run: T2-Master 976, v3-Hard ×1.0 656.)

What this shows, and what it does not:

* **Without any resource cheat** T2-Easy and T2-Normal beat their v3 counterparts decisively, and T2-Master beats v3-Hard at equal
  income 87.5 %. Against v3-Hard *with* its +25 % income T2-Master is statistically at par (45.1 %, CI includes 50 %): skill
  roughly compensates a 25 % income deficit.
* **Elo ladder**: Easy → Normal is a clear step (+280); **Normal → Hard → Master are not separated** (+44, +14, CIs include 50 %).
  The intended ~200-Elo spacing was reached only at the bottom. The top three tiers share θ and differ only in reaction/APM/micro,
  which matter little in bot-vs-bot play at these army sizes. Recommendation: give Normal (and perhaps Hard) earlier/weaker θ
  snapshots and re-measure; not done in this run.
* **Value-function ablation**: +44 Elo for V, not significant at 24 games.
* **Easy is beatable** by the rule-based Autopilot (72.9 %), our best available human proxy; whether a beginner beats it is
  unverified.
* Factions: T2 with Aurora is weak against v3-Hard (Master 12.5 %, Hard 18.8 % of 8 each) while Obsidian does well (81 %, 63 %);
  the trader style prior probably needs its own tuning (style offsets were fixed, not learned).

## 3. Exploitability (`tools/league/exploit.js`)

A fresh exploiter (CMA-ES from θ₀, λ = 6, 4 generations = 48 training games) against a frozen target, then 24 evaluation games:

| Target | Exploiter's score | 95 % CI |
|---|---|---|
| final Master (M@30) | **16.7 %** | [6.7, 35.9] |
| θ₀ with the Master configuration (baseline) | 47.9 % | [29.6, 66.8] |

With the same budget, no exploiter found a winning counter-strategy against either target, and against the league result it stayed
clearly losing. Inside the league, no main exploiter ever reached its 70 % graduation threshold against M (best 0.42). These are
small budgets; a stronger search may well find exploits.

## 4. Value function V(s) (`tools/league/train_value.py`, generation-29 model)

125 424 feature rows from 2 088 league games; held out by game: 417 games. Draw fraction 0.437 (adjudicated draws, label 0.5).

| Model (held-out) | log-loss | Brier | AUC | ECE |
|---|---|---|---|---|
| **MLP 16 tanh, observation features — shipped** | **0.600** | **0.106** | **0.825** | 0.011 |
| Logistic regression, observation features | 0.611 | 0.110 | 0.814 | 0.013 |
| Logistic regression, **privileged** (true opponent state) | 0.600 | 0.106 | 0.831 | 0.010 |
| Army-value ratio only | 0.641 | 0.122 | 0.753 | 0.033 |
| Base rate | 0.693 | 0.145 | 0.500 | — |

AUC by game phase (observation LR / privileged LR): 0–180 s 0.561 / 0.601; 180–300 s 0.687 / 0.677; 300–420 s 0.943 / 0.958;
> 420 s 0.999 / 1.000 (the last bin is close to the adjudication point and partly trivial). The fog-honest model is within 0.006 AUC of
the privileged one: the memory + phantom estimate recovers most of what perfect information would give. Reliability (observation LR):

| bin | 0–.1 | .1–.2 | .2–.3 | .3–.4 | .4–.5 | .5–.6 | .6–.7 | .7–.8 | .8–.9 | .9–1 |
|---|---|---|---|---|---|---|---|---|---|---|
| n | 1118 | 833 | 825 | 1455 | 8442 | 6888 | 2627 | 1227 | 1044 | 687 |
| predicted | .049 | .148 | .252 | .358 | .470 | .540 | .642 | .747 | .850 | .934 |
| observed | .029 | .146 | .268 | .354 | .477 | .527 | .623 | .768 | .879 | .969 |

LR weights (standardised): kill difference +0.42, supply +0.39, log army ratio +0.39, base difference +0.23, log worker ratio +0.20,
hero level difference +0.19, time −0.58 (games drift to draws), structure ratio −0.17, army difference −0.15, era −0.05, bank −0.04.

## 5. Combat predictor vs the real simulation (`tools/league/calib_combat.js`)

Random skirmishes in the real engine (2–14 random units per side, random upgrades, 25 % with a hero), outcome vs prediction:

| Data | ODE only | Lanchester closed form only | **Blend (shipped, k_ode 2.109, k_L 2.222)** |
|---|---|---|---|
| fit seeds 1+2, 1200 skirmishes, held-out half: log-loss / Brier / accuracy | 0.239 / 0.077 / 88.8 % | 0.166 / 0.049 / 93.2 % | **0.147 / 0.044 / 94.7 %** |
| fresh seed 3 (600) | 0.279 / 0.085 / 88.7 % | 0.308 / 0.083 / 88.0 % | 0.264 / 0.071 / 90.7 % |
| fresh seed 11 (240, `tests/sim/ai_combat.js`, after the cloak fix) | 0.250 | 0.229 | **0.159**, accuracy 92.1 %; P > 0.9 → 99 % won (85), P < 0.1 → 1 % won (105) |

Before the splash fix the ODE alone had log-loss 0.335 / 82 % accuracy (seed 1, 200 skirmishes).

## 6. CPU (`tools/league/profile.js`, `tests/sim/ai_agent.js`)

| Measurement | T2-Master | v3-Hard |
|---|---|---|
| AI ms per tick, 6-min game, seed 3 | 0.0378 | 0.0076 |
| total ms per tick of that game | 0.535 | 0.494 |
| **cost of replacing v3-Hard by T2-Master, sim cost held fixed** | **+6.0 %** of total tick time (budget +25 %) | |
| worst single think | 2.5 ms | 1.5 ms |
| earlier 8-min profile (seeds 1, 2) | 0.086 ms/tick (10.8 % of the tick), worst think 13.4 ms | 0.029 ms/tick, worst 14.5 ms |

Headless Node numbers on a desktop CPU; phones will be slower in absolute terms, the ratio is what was budgeted.

## 7. Tests (all headless, deterministic; each with a control that must fail)

| Test | Result |
|---|---|
| `tests/sim/ai_lib.js` | 40 checks pass: Bayes update, hazard, mass-conserving diffusion (500 steps), pheromone decay (1−ρ), negative information, square-law ODE (17.28 vs analytic 17.32), counters, cloak, IFD = brute-force optimum, CMA-ES sphere (171 gens) and Rosenbrock (488 gens) with checkpoint, PFSP, Wilson, Bradley–Terry |
| `tests/sim/ai_combat.js` | pass (numbers in §5); the sign-flipped control is rejected |
| `tests/sim/ai_agent.js` (full and `--quick`) | no-peek: identical command stream and AI state after scrambling 55 hidden enemy units, adding 6, damaging 78 entities and changing bank/era/upgrades; both peeking mutants caught; seen-ever invariant; determinism (same hash twice); no `Math.random`/`Date`/`performance.now` in T2 sources; APM bound holds for Easy, Master and a tight 12/min cap, and the never-refusing control breaks it (160 %); save round trip with two T2 AIs; CPU +6.0 % |
| `tests/sim/smoke.js`, `save.js`, `campaign.js` (394 checks), `campaign_walkthrough.js` | pass |
| `tests/e2e/e2e_smoke.py` (desktop browser) | pass |

Not run in this pass: the other browser gates in `tests/run_all.sh` (touch, terrain, platform, PWA, resume, campaign UI, audio,
payments) — T2 changes only sim modules, the difficulty row (4 buttons) and the HUD name table; the new Master button was not
screenshot-checked in the compact / portrait layouts (`tools/shots.py`).

## 8. Reproduce

```
node tools/league/run.js --hours 2.5 --out tests/out/league          # league (resume with --resume)
node tools/league/summarize.js tests/out/league                      # tables above
python3 tools/league/train_value.py tests/out/league/feats.jsonl --out vf.json
node tools/league/final_eval.js plan.json results.json               # matchups (see tests in §2)
node tools/league/exploit.js '<target spec>' out.json 4 6 12 1
node tools/league/calib_combat.js 600 3
node tools/league/export_params.js tiers.json --vf vf.json           # writes src/js/41_ai_params.js
```
