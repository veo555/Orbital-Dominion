# T2 opponent: league and evaluation results

Design and maths: `docs/AI_DESIGN.md`. All numbers below come from headless bot-vs-bot games in our own simulator. **Nobody has
played against T2 yet; bot-vs-bot Elo is not human Elo.** Raw logs (`tests/out/league/`, `tests/out/final/`, ~22 MB) are not
committed. Everything can be re-run from the committed tools (commands at the end).

## v5-C (AlphaGo-style planner + expert iteration) — results, read this first

Design: `docs/AI_DESIGN.md` §17-20. Everything below is headless bot-vs-bot play in our own simulator; **no human has played against
any of it, and bot-vs-bot Elo is not human Elo.** Nothing in the game is a language model (AI_DESIGN, top note). Raw logs
(`tests/out/expit/`, `tests/out/final5/`) are not committed.

### 9. Abstract-model calibration (`tools/league/calib_model.js`)

18 real T2-Master-vs-T2-Master games (seeds 41001-41006, 42001-42012, 600 s), logged every 10 s for both sides; constants fitted on 9 games,
reported on the other 9 (held out). Mean absolute error per side, model vs persistence (state(t+h) = state(t)):

| horizon | workers | army value | bank | bases | structures | material share | normalised total |
|---|---|---|---|---|---|---|---|
| 60 s, before fit (hand constants) | 2.36 / 4.12 | 422 / 437 | 298 / 184 | 0.10 / 0.31 | 523 / 582 | 0.046 / 0.047 | 2.96 / 3.47 |
| **60 s, fitted** | **1.90** / 4.12 | **410** / 437 | **178** / 184 | **0.09** / 0.31 | **406** / 582 | **0.042** / 0.047 | **2.44** / 3.47 |
| 120 s, before fit | 3.32 / 7.81 | 722 / 709 | 577 / 203 | 0.29 / 0.58 | 802 / 1136 | 0.077 / 0.076 | 5.16 / 5.94 |
| **120 s, fitted** | **2.93** / 7.81 | **665** / 709 | 216 / 203 | **0.30** / 0.58 | **639** / 1136 | **0.071** / 0.076 | **4.05** / 5.94 |

Fitted constants (shipped as `PL_K0`): income ×0.485 (the measured per-miner curve over-states real income: travel, builders, scouts),
ether ×0.25, production 5.8 value/s per building, engagement 0.21, travel 60 s, worker build 14 s, 47 value per supply, retreat at 62.5 %,
raid 2.6, era quality +36 %. Fresh seeds in the test (`tests/sim/ai_mcts.js`, 2 games, 480 s): 60 s 2.04 vs 3.06, 120 s 3.29 vs 5.26; but
material share 0.033 vs 0.033 (60 s) and **0.049 vs 0.043 (120 s, worse than persistence)**. Honest reading: the economy is modelled well,
battles are not; the material share — what decides our adjudicated games — is about as predictable as "nothing changes". This is the
main reason the search below rarely finds a clearly better posture.

### 10. Planner ablations and expert iteration

Development ablations (planner vs the same Master without it, fresh seeds, 600 s):

| version | games | score | 95 % Wilson CI |
|---|---|---|---|
| first planner, owning all postures (no trust region, raid without fast units allowed) | 24 | 50.0 % | [31.4, 68.6] |
| + harass legality, calibrated model, trust region (margin 0.03) | 48 | 47.9 % | [34.5, 61.7] |

**Expert-iteration league** (`tools/league/expit.js`, seed 2, 2 workers; planned 2.6 h, **ran 11 generations / 68 min** before a session
interruption stopped it after the generation-11 checkpoint; 558 games, 49 362 logged root decisions, 16 057 value rows):

| fit at gen | decisions | held-out KL(π‖p): θ-only → incumbent → new head | top-1 agreement θ-only → new | V held-out (games): MLP AUC / log-loss | gate vs incumbent (32 games) |
|---|---|---|---|---|---|
| 3 | 13 311 | 0.092 → 0.092 → **0.064** | 0.913 → 0.862 | 7: 0.847 / 0.513 | M1@3 vs M0: **56.3 %** [39, 72] → promoted |
| 6 | 26 897 | 0.117 → 0.070 → 0.066 | 0.872 → 0.839 | 20: 0.837 / 0.531 | M2@6 vs M1@3: 46.9 % [31, 64] → rejected |
| 9 | 27 111 | 0.140 → 0.072 → **0.058** | 0.834 → 0.853 | 34: 0.811 / 0.539 | M2@9 vs M1@3: **56.3 %** [39, 72] → promoted |

* The head does what expert iteration asks: it moves the prior towards the search's visit distribution (held-out KL 0.140 → 0.058 at gen 9).
* The search overrode the θ rules in **6-9 % of decisions** (trust region, margin 0.02, τ = 1 in training games).
* Both promotions passed the 55 % gate with intervals that include 50 % (32 games); they are **not significant** on their own.
* Bradley–Terry over the league's own games (v3-Hard = 1000): M2@9 1027, M1@3 1042, M0 1003, **v4-master 981**, v3-normal 789, v3-easy 395
  (few games per agent: ±60 Elo or more).
* Value function: the shipped v4 MLP had held-out AUC 0.825 on league-1 data; the expert-iteration V (M2@9, 12 055 rows / 172 games,
  held out by game: 34 games) has MLP AUC 0.811, log-loss 0.539, LR AUC 0.777, ECE(LR) 0.038. Different data (shorter 540-s games, planner
  agents), so the two AUCs are not directly comparable; the old model was **not** re-scored on the new held-out games (not done). The new V
  ships only inside the Master tier (`tiers.master.vf`); the other tiers keep the v4 V.

Shipped: Master = θ M@30 + planner (256 simulations, 4 determinised worlds, 8 slices, c_puct 1.5, λ 0.5, margin 0.02) + head φ and V of
**M2@9**. Easy / Normal / Hard are unchanged from ladder-2 (no search).

**Final evaluation** (`tools/league/final_eval.js`, fresh seeds 61001-61024, 24 mirrored pairs = 48 games per matchup, 600-s cap,
sides and factions swapped; Master-v5 here = the trained planner at 256 simulations per decision, as in the league):

| Matchup | W–D–L | Score | 95 % Wilson CI | Elo | target |
|---|---|---|---|---|---|
| **Master-v5 (planner + head + V) vs Master-v4 (no planner)** — the ablation | 20–8–20 | **50.0 %** | [36.4, 63.6] | 0 | > 50 %: **not shown** |
| Master-v5 vs Hard | 19–9–20 | **49.0 %** | [35.4, 62.6] | −7 | ≥ 65 %: **missed** |
| Hard vs Normal | 22–11–15 | **57.3 %** | [43.3, 70.2] | +51 | ≥ 65 %: **missed** |
| Normal vs Easy | 29–13–6 | **74.0 %** | [60.1, 84.3] | +181 | ≥ 65 %: met (point estimate; CI lower bound 60 %) |
| Master-v5 vs v3-Hard at equal income (×1.0) | 39–6–3 | **87.5 %** | [75.3, 94.1] | +338 | ≥ 85 %: met (point estimate) |
| Master-v5 vs v3-Hard with its +25 % income | 21–6–21 | 50.0 % | [36.4, 63.6] | 0 | (reported) |

Bradley–Terry over these games (v3-Hard = 1000): Master-v5 1002, Master-v4 1000, Hard 1009, Normal 960, Easy 782, v3-Hard ×1.0 673.

**Honest summary.** The AlphaGo machinery is built, tested and trained, but it **does not make the Master measurably stronger**: planner on vs
off is exactly 50 % over 48 games, and Master is not separated from Hard (49 %). The tier targets (≥ 65 % for each adjacent pair) are met only
for Normal > Easy; Hard > Normal is 57 %. The reasons, in order of evidence: (1) the abstract model predicts the economy but not battles, and
battles decide these games (the material share 120 s ahead is predicted no better than "no change"); (2) the trust region lets the search
override the rules in only 6-9 % of decisions; (3) 11 generations / 558 games of expert iteration with a 32-game gate is a tiny budget
(AlphaGo Zero: millions of games, 400-game gate). Making Master clearly stronger than Hard would need either a forward model that predicts
fights (tactical search, terrain) or more decisive skill levers; neither was done here. Ladder-2 settings for Easy/Normal/Hard were kept.

### 11. Campaign: can T2 replace the v3 AI? — no, v3 stays

`tests/sim/campaign_balance.js all --runs 3` (the 3-run smoke gate) in a temporary source tree where campaign games create T2 instead of
v3 (with the new `waveMult` / `firstWave` hooks), compared with the current tree:

| variant | PASS | WARN | FAIL | failing missions |
|---|---|---|---|---|
| current (v3 enemy, v3 player proxy) | 4 | 2 | 3 | m05, m06, m08 (scripted missions the stock AI cannot judge; covered by `campaign_walkthrough.js`) |
| **T2 enemy**, v3 player proxy (fair) | 3 | 2 | 4 | m05, m06, m08 **+ m04** (trigger m04_t14 never fires) |
| T2 on both sides | 0 | 0 | 9 | all (the T2 player proxy does not pursue scripted objectives; m02-m05, m07, m08 stall) |

(An earlier fair-variant run gave 2 / 2 / 5 but was made while a bug left T2 idle; it was discarded and re-run.) Decision: **the campaign
keeps the v3 AI**, and `makeAIV3` / `aiThinkV3` are **not deleted**. Two further reasons: `tests/sim/off.js` and `smoke.js` prove the
swarm-off equivalence with `baseline/v2` by running the same legacy enemy AI in both trees (CLAUDE.md rule 5) — deleting v3 would remove the
ground truth of that test; and v3 is the league's fixed anchor.

### 12. Other AIs

* **Overseer advisor** (swarm ON): proposals for expansion, era, production buildings, turrets and assault waves carry a machine-generated
  `win chance a % -> b %: ...` line from the advisor's V(s) + planner Q values. Swarm OFF: unchanged; `off.js` output byte-identical to
  `baseline/v2` (seeds 1-3, 300 s).
* **Agents / creeps**: `tools/league/diag_agents.js` (idle workers, floating bank, stuck units, creep leash) was written but **not run for
  this report** (time); no agent/creep fixes were made in v5-C.

### 13. Tests (v5-C)

| Test | Result |
|---|---|
| `tests/sim/ai_mcts.js --quick` (new, in `run_all.sh`) | ALL PLANNER CHECKS PASSED: PUCT finds the 0.95 line under a 70 %-misleading prior (visits 332/30/438); 40-sim budget focuses on the right prior's action (36/2/2); mutants caught (exploration term removed: trap FAIL 800/0/0; sign flipped: needle FAIL 0/40/0); policy improvement in 40/40 random MDPs (E[Q*] 0.949 prior → 0.957 at 30 sims → 0.966 at 200); model invariants; calibration on fresh seeds beats persistence (60 s 2.04 vs 3.06, 120 s 3.29 vs 5.26) and the no-change control fails; planted policy head recovered (KL 0.436 → 0.000); gate rule; planner deterministic (93 decisions), plain-data state, exact save/restore |
| `tests/sim/ai_agent.js --quick` | ALL PASSED: no-peek with the planner running (8 commands, planner state compared); three peeking mutants caught incl. the new "planner world from the true enemy army"; determinism; APM bounds + control; save; CPU +18.2 % vs v3-Hard, **+10.7 % vs v4 Master** (budget 25 %), worst think 5.8 ms. (The probe now picks the first moment ≥ 330 s at which the AI acts: after the merge the old fixed moment was quiet even for v4.) |
| `ai_lib.js`, `ai_combat.js`, `smoke.js`, `save.js` | pass |
| `campaign.js` (394 checks), `campaign_walkthrough.js` | pass |
| `off.js` seeds 1-3, 300 s, RS=5, against `baseline/v2` | byte-identical output |
| `tests/e2e/e2e_smoke.py` (desktop browser, rebuilt dist after the merge) | ALL E2E CHECKS PASSED (zero network requests) |

Bug found and fixed during the work: a trailing `//` comment added to the `P:{...}` line of `makeAIT2` swallowed `next/k/rs` and left T2
idle; the expert-iteration league had started before it and was unaffected; the first fair campaign run used the broken tree and was redone.

### Reproduce (v5)
```
node tools/league/calib_model.js --games 12 --seed0 42001 --fit           # abstract-model calibration
node tools/league/expit.js --out tests/out/expit --hours 2.6 --workers 2  # expert-iteration league (--resume)
node tools/league/final_eval.js tests/out/final5/plan.json out.json       # matchups above
node tools/league/export_params.js tiers.json                             # writes 41_ai_params.js (tiers incl. plan, pol.phi)
```

---

# v4 (league-1) results

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

## 2a. Shipped tier ladder ("ladder-2", current `41_ai_params.js`)

The first release (§2 below) had Normal/Hard/Master sharing θ and was not Elo-separated at the top. The ladder was rebuilt from
skill levers only (income ×1.0 everywhere). In the AI, *macro efficiency* is the probability that a production building or a hub
uses a given chance to queue; it now also gates worker production.

| Tier | θ | think | APM | delay | focus | kite / concave / pull-back | macro eff. |
|---|---|---|---|---|---|---|---|
| Easy | θ₀ (hand prior) | 0.6 s | 45 | 0.50 s | no | no | 0.50 |
| Normal | θ₀ | 0.45 s | 80 | 0.35 s | yes | no | 0.70 |
| Hard | M@30 (league) | 0.45 s | 90 | 0.30 s | yes | no | 0.65 |
| Master | M@30 | 0.25 s | 240 | 0.15 s | yes | yes | 1.00 |

**Search** (candidates picked on these seeds, so these scores are optimistic):
- seeds 11001+: Master vs Hard-candidate with micro and macro 0.8 scored 54.2%; that candidate vs Normal 83.3%; Normal vs Easy 70.8%.
- seeds 12001+: Master vs Hard (shipped) 66.7% [46.7, 82.0], vs a macro-0.75 variant 60.4%; Hard vs Normal 66.7% [46.7, 82.0], variant 75.0%.
- seeds 14001+: weakening Hard further (macro 0.55, 80 APM) and Normal (macro 0.6) did *not* widen the top gap. Master vs that Hard
  scored 52.1%, that Hard vs that Normal 56.3%, and that Normal vs Easy 62.5%. So macro efficiency stops mattering at the top, and
  the shipped ladder was kept.

**Confirmation on fresh seeds 13001+ with the shipped presets** (24 mirrored games each, 10-min cap):

| Matchup | W–D–L | Score | 95 % Wilson CI | Elo |
|---|---|---|---|---|
| Master vs Hard | 12–3–9 | **56.3 %** | [36.9, 73.8] | +44 — **below the 60 % target** |
| Hard vs Normal | 13–5–6 | **64.6 %** | [44.7, 80.5] | +104 |
| Normal vs Easy | 14–7–3 | **72.9 %** | [52.9, 86.6] | +172 |
| Master vs v3-Hard at equal income | 19–3–2 | **85.4 %** | [66.5, 94.5] | +307 |
| Normal vs v3-Normal | 16–5–3 | 77.1 % | [57.3, 89.4] | +211 |
| Easy vs v3-Easy (0.85 income) | 23–1–0 | 97.9 % | [82.8, 99.8] | |
| Autopilot (human proxy) vs Easy, 18-min cap | 19–1–4 | 81.3 % | [61.8, 92.1] | |

BT Elo of the confirmation games (Master = 1000): Master 1000, Hard 961, Normal 869, Easy 710; Autopilot 954, v3-Hard×1.0 698,
v3-Normal 664, v3-Easy 160.

Pooled Master vs Hard over both seed sets (48 games, selection-biased): 61.5 % [47.3, 73.9].

**Honest summary.** Hard > Normal > Easy meet the ≥ 60 % point-estimate target on fresh seeds; none of the three adjacent pairs is
significant at 24 games (every CI's lower bound is below 60 %, two below 50 %). Master > Hard stays at 56 % on fresh seeds. The
largest Master–Hard separation seen was 66.7 % (selection seeds). Further separation would need a stronger Master (more
league training) rather than a weaker Hard.

## 2. First release evaluation (`tools/league/final_eval.js`, seeds 7001+, 10-min cap, mirrored sides and factions)

Tiers then shipped (superseded by §2a): Master / Hard / Normal used θ = M@30, Easy used θ₀; they differ in think rate, APM cap,
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
