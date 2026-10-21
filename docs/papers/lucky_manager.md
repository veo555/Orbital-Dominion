# Research note: selection luck in manager universes — a reproducible simulation study

**Question.** How often does the best manager in a universe of managers with *zero* true skill appear statistically skilled, and what do deflation and FDR control change?

**Method.** Each manager's monthly returns are iid normal with mean 0, annual vol 8%. For N ∈ {10,50,100,500} and T ∈ {36,60} months, 300 universes each; the highest-Sharpe manager is tested (i) alone by Probabilistic Sharpe Ratio (Bailey–López de Prado) at 95%, (ii) after the Deflated Sharpe Ratio, which replaces the benchmark 0 by the expected maximum Sharpe of N independent null trials. A second experiment screens 100 managers (20 true Sharpe 1.0) with Benjamini–Hochberg at q=10% for T ∈ {36,60,120}. Code: `research/manager-diligence/experiments/lucky_manager.py`.

**Result (full table in `results/lucky_manager.md`).** N=50, T=36: mean best annual Sharpe 1.34; naive PSR>95% in 92.3%; DSR>95% in 0.0%. Analytical check: 1−0.95⁵⁰ = 92.3% (the best-of-N is simply a multiple-testing event). BH: false-discovery proportion 13.1/10.9/8.1% at T=36/60/120 and power 19/46/84%.

**Interpretation.** (1) Track-record significance is meaningless without the size of the candidate set. (2) DSR is conservative (0–0.7% false positives vs 5% nominal): in short histories it trades power for safety. (3) FDR control is the right frame for *screening*; family-wise control for *one-shot mandates*.

**Limits.** Independent managers, normal returns, a single skill level, no fees, no survivorship/backfill bias, no estimation error in the cross-sectional variance of Sharpe ratios (assumed known under the null in DSR). Real universes have correlated managers and fat tails, which generally worsen selection bias. Simulated data only; not investment advice.

**Reproduce.** `python3 research/manager-diligence/experiments/lucky_manager.py`. Tests: `python3 research/manager-diligence/tests/run_tests.py --mutants`.
