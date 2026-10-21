# quant-lab

Small, dependency-light (numpy only) reference implementations of core quantitative-finance building blocks.
The point is not novelty; it is **verifiability**: every function is checked against textbook values or an independent
finite-difference / closed-form reference, and the checks themselves are mutation-tested (a deliberately broken copy of
the code must fail at least one check — 27 mutants, all caught).

| Module | Contents | Reference used by the tests |
|---|---|---|
| `derivatives` | Black–Scholes–Merton (dividend yield), Greeks, implied vol, CRR binomial (European/American), antithetic Monte Carlo | Hull's worked example (call 4.7594 / put 0.8086), put–call parity, finite differences of the price, BS-limit of the tree, MC within 4 s.e. |
| `risk` | historical & Gaussian VaR/ES, EWMA vol, Kupiec POF backtest | closed-form 2.326σ / 2.665σ, hand-computed loss ladder, explicit LR formula |
| `garch` | GARCH(1,1) QMLE (own Nelder–Mead), simulation, variance forecast | parameter recovery on simulated data with known truth, likelihood ordering, mean-reversion formula |
| `portfolio` | min-variance, tangency, equal-risk-contribution | two-asset closed forms, first-order conditions, equal risk contributions |
| `validation` | PBO via CSCV (Bailey et al.), purged K-fold with embargo | noise → PBO ≈ 0.5 (mean over 30 draws), planted edge → PBO ≈ 0, exact fold geometry |

```bash
pip install numpy
python3 tests/run_tests.py             # checks
python3 tests/run_tests.py --mutants   # every mutant must be caught
python3 experiments_var_backtest.py    # regenerates results/var_backtest.md
```

## A result: VaR coverage under volatility clustering (`results/var_backtest.md`)
Data from a known GARCH(1,1) (99 % VaR, 19 750 out-of-sample days): a 250-day historical VaR breaches 1.49 % of days, EWMA-Gaussian 1.26 %
(both rejected by Kupiec), the oracle conditional-variance VaR 1.04 % (not rejected). Lesson: unconditional window estimators under-state
tail risk when volatility clusters; the fix is a good *conditional* variance forecast, not a bigger window.

## Limits (read before using)
* Teaching/reference quality. Not a production risk system: no calendars, no day-count conventions, no curve building, no vol surface, no Greeks by AAD.
* Kupiec tests unconditional coverage only. Christoffersen independence and expected-shortfall backtests (Acerbi–Székely) are not implemented.
* GARCH QMLE uses a plain Nelder–Mead with a Gaussian likelihood, no standard errors; fine for the demonstration, not for inference on short samples.
* Binomial/MC prices converge at O(1/n) and O(1/√n); the tests use tolerances accordingly.

See also `../manager-diligence` (selection-bias-aware performance statistics) in this repository. MIT licence.
