<!-- Copy this file's content into a NEW public repository named exactly like your username (veo555/veo555), as README.md.
     GitHub shows that README at the top of your profile. Edit the bracketed parts; delete anything you do not want public. -->

# Hi, I'm veo 👋

**Quant researcher.** I work on stochastic modelling, statistics and multi-agent decision-making, and I like testing ideas with simulations I can reproduce and attack.

[One sentence about your background, only if you want it public: field, degree, years, or what you did before. Delete this line if not.]

## What I'm building now

### 📊 [manager-diligence](https://github.com/veo555/manager-diligence): is that manager skilled, or just the best of a crowd?
Selection-bias-aware statistics for evaluating hedge-fund-style track records: probabilistic and **deflated Sharpe ratios**, minimum track record length, stationary-bootstrap intervals, Newey-West alpha, smoothing detection, Holm / Benjamini-Hochberg screening, all validated on simulated universes with known truth. Result: among 100 zero-skill managers, the best one looks statistically significant 99% of the time on 3 years of data until you deflate for the number of candidates. 42 checks + 15 mutation tests; numpy only. *(Simulated data only; not investment advice.)*

[Sample due-diligence memo](https://github.com/veo555/manager-diligence/blob/HEAD/examples/sample_memo_M09.md) · [Lucky-manager experiment](https://github.com/veo555/manager-diligence/blob/HEAD/results/lucky_manager.md)

### 🧮 [quant-lab](https://github.com/veo555/Orbital-Dominion/tree/HEAD/research/quant-lab): reference implementations that are tested to be right
Black–Scholes/Greeks/implied vol, CRR trees, Monte Carlo, VaR/ES with Kupiec backtest, GARCH(1,1) QMLE, min-variance/tangency/risk parity, PBO and purged CV. Verified against textbook values and finite differences; 27 mutants all caught. Result: under a known GARCH truth a 250-day historical 99% VaR breaches 1.49% of days (Kupiec rejects), the oracle 1.04%.

### 🛰️ [Orbital Dominion](https://github.com/veo555/Orbital-Dominion): swarm agents as game design
An open-source, StarCraft-inspired RTS that doubles as a research testbed: fog-honest, rate-limited agents tuned by league self-play (CMA-ES, prioritised fictitious self-play, Bradley-Terry ratings), a delegation/swarm layer, deterministic replays with shareable codes, and a spectator mode that shows each agent's own win estimate and reasons. One HTML file, no server, no language model.

**▶ Play / watch:** https://veo555.github.io/Orbital-Dominion/ · [Hugging Face Space](https://huggingface.co/spaces/veo555/orbital-dominion) · [tournament dataset](https://huggingface.co/datasets/veo555/orbital-dominion-tournament) · **Evaluate in 15 minutes:** [docs/EVALUATE.md](https://github.com/veo555/Orbital-Dominion/blob/HEAD/docs/EVALUATE.md)

What I care about in it: results with intervals (not point estimates), tests that are proven able to fail, and an honest limits list. Example: an AlphaGo-style planner is implemented but ships **off** because it showed no measurable gain.

## Interests
Hedge fund manager selection and alternatives due diligence · Statistics and stochastic processes · reinforcement learning and self-play · multi-agent systems · algorithmic trading research · reproducible research

## Say hello
Feedback on the project is the most useful thing: open an issue ("Playtest report") or start a discussion on the repo. [Add a contact link here if you want one: website, LinkedIn, X. Optional.]

<sub>Everything I publish is MIT-licensed unless stated otherwise.</sub>
