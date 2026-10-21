# Interview preparation — quant research / development / fund-selection roles

Closed-form answers below are numerically checked by `python3 docs/career/verify_answers.py` (Monte Carlo / enumeration). Repo-specific
claims are tied to files you can open live in the interview. **Say only what you can defend; the strongest signal is "here is the test that could have failed."**

## 1. Typical formats (verify per firm)
| Stage | What happens | Prepare with |
|---|---|---|
| Recruiter/HR screen | motivation, visa status, comp expectations | `MARKETS_US_UK_CH.md` |
| Online assessment | probability/mental-maths speed (prop firms), coding (QD), stats (QR) | §3 below, `quant-lab` |
| Technical rounds (2–4) | probability puzzles, statistics, regression/time-series, coding, ML | §3–§5 |
| Research presentation / take-home | defend a past project or analyse a dataset | §2 (your repos) |
| Fund-selection roles (e.g. hedge-fund investment professional) | evaluate a track record, due-diligence discussion, case study, fit with allocator process | §4 |

## 2. Your projects as interview material (prepare a 3-minute and a 10-minute version of each)
**manager-diligence** — *Claim:* best of N zero-skill managers looks significant almost always. *Evidence:* `results/lucky_manager.md`
(N=50, T=36: naive PSR>95% in 92.3% of universes; DSR>95% in 0.0%). *Why it must be true:* P(≥1 of 50 passes a 5% test) = 1−0.95⁵⁰ = 92.3% (verified).
*Weakness to volunteer:* independent managers, normal returns, no fees/survivorship; DSR is conservative → low power (BH table: 19% of skilled found at 36 months, 84% at 120).
**quant-lab** — *Claim:* Gaussian/historical VaR under-covers when volatility clusters (`results/var_backtest.md`: 1.49% and 1.26% breaches vs 1.04% for the oracle at nominal 1%).
*Follow-up they will ask:* "Kupiec cannot see clustering of breaches — what does?" → Christoffersen independence / conditional-coverage test (not implemented; say so).
**Orbital Dominion** — *Claim:* a reproducible multi-agent research testbed. *Evidence:* bit-exact deterministic sim, replay hash, tournament CSV with Wilson intervals and Bradley–Terry ratings.
*Weakness to volunteer:* bot-vs-bot Elo is not human skill; no human study; the MCTS/PUCT planner shipped **off** because no measurable gain.
Note for finance interviews: this is evidence of engineering discipline and experimental design, **not** of trading performance — do not oversell it.

## 3. Probability and statistics questions with verified answers
1. *Expected tosses until HH?* 6 (states: 0,H,HH; E₀=2+E_H... solve: E₀=6). Verified by simulation.
2. *E[max of n U(0,1)]?* n/(n+1) (P(max≤x)=xⁿ → ∫ n xⁿ dx). n=5 → 5/6.
3. *P(sup_{t≤1} Wₜ > a)?* 2·P(W₁>a) by the reflection principle; a=1 → 0.3173.
4. *Kelly for an even-money bet with win probability 0.6?* f* = 2p−1 = 0.2 (maximises E log wealth). Full Kelly is aggressive: halve it if p is estimated.
5. *Best of 50 independent zero-skill managers, 5% one-sided test each, chance at least one "passes"?* 1−0.95⁵⁰ = 92.3%. This is the multiple-testing problem in one line.
6. *Expected max of 50 standard normals?* ≈ 2.25 (Blom: Φ⁻¹((n−0.375)/(n+0.25)) = 2.24). The naive √(2 ln n) = 2.80 overstates it in the leading term and its corrected form is still ~0.15 low at n=50 — convergence is slow.
7. *Variance of a sample Sharpe ratio (iid normal)?* ≈ (1+SR²/2)/T (Lo 2002). Hence a monthly SR of 0.2 over 60 months has s.e. ≈ 0.13, i.e. ~1.5 s.e. from zero: not significant at 5% two-sided.
8. *Put–call parity?* C−P = S e^{−qT} − K e^{−rT}; model-free (no-arbitrage). Verified numerically in `quant-lab` tests.
9. *Birthday (23 people)?* 50.7%. *Monty Hall switching?* 2/3.
10. *Why does BH control FDR but not FWER, and when is Holm preferable?* Holm controls the chance of **any** false discovery (strong, no independence assumption); BH controls the **expected share** of false discoveries (more power, valid under independence/PRDS). Use Holm when one false positive is costly (a mandate), BH for screening a long list.

## 4. Fund-selection / due-diligence discussion points
* Track record < ~3 years is mostly noise: with annual vol 8% a 1.0 Sharpe over 36 months has t≈1.7.
* Always report **how many managers were looked at** (selection set). Deflate for it.
* Smoothed/illiquid marks: look at lag-1 autocorrelation and Ljung–Box before trusting volatility or Sharpe (`metrics.ljung_box`, `unsmooth_geltner`).
* Factor-adjust before praising alpha: Newey–West t-stat on the alpha, with a sane lag.
* Operational due diligence, fees, capacity, liquidity terms matter as much as returns — statistics only answers "is it luck?".
* Do not claim you have allocated money or run a book. You built diligence *tools* and validated them on simulations.

## 5. Coding / ML screens
* Be fluent in numpy vectorisation, pandas joins/resampling, complexity, and writing tests first. Practise: implement rolling Sharpe, max drawdown, an LRU cache, an order-book matcher.
* ML: bias–variance, regularisation, leakage and **purged/embargoed CV** for overlapping labels (`quant-lab/validation.py`), PBO. Be ready to explain why shuffled K-fold inflates financial backtests.

## 6. Behavioural
Prepare STAR stories: a bug you only found because a test could fail (the three vacuous assertions in `CLAUDE.md` rule 15), a result you did not publish because it was within noise, a decision to ship a feature **off**.

## 7. Questions to ask them
How is research validated before capital? How do you treat multiple testing across the team? What does a good first-year deliverable look like? How do you handle model decay?
