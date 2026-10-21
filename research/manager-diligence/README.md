# manager-diligence

**Selection-bias-aware statistics for evaluating manager track records** (hedge funds, but any return series): how long a track record you need, how much of a high Sharpe ratio is luck, whether a "great" manager is just the best of a crowd, whether returns look smoothed, and whether alpha survives a factor regression with autocorrelation-robust standard errors. Pure Python + numpy, one dependency, ~320 lines, **42 checks plus 15 mutation tests**. Educational / research code: not investment advice, and no real fund data is used anywhere.

## Why this exists
Manager selection is a statistics problem before it is anything else: you see a few dozen short, noisy, non-normal, possibly smoothed return histories, pick the best looking ones, and expect the future to look like the past. The classic mistakes are statistical and well documented. This package implements the standard fixes and **tests them against simulated universes where the truth is known**:

| question | tool | reference |
|---|---|---|
| Is this Sharpe ratio significantly above a benchmark, given skewness and fat tails? | `inference.psr` | Bailey & López de Prado (2012) |
| How many months of track record do I need? | `inference.min_track_record` | same |
| It is the best of N managers I looked at: is it still impressive? | `inference.dsr`, `expected_max_sharpe` | Bailey & López de Prado (2014) |
| What is a confidence interval for the Sharpe that respects short-range dependence? | `inference.bootstrap_sharpe_ci` (stationary bootstrap) | Politis & Romano (1994) |
| Which managers are significant when I test many at once? | `inference.holm` (family-wise), `inference.benjamini_hochberg` (false discovery rate) | Holm (1979); Benjamini & Hochberg (1995) |
| Does alpha survive factor exposure, with autocorrelated residuals? | `factors.ols_hac` (Newey-West) | Newey & West (1987) |
| Are the returns smoothed (stale marks), which understates risk? | `metrics.ljung_box`, `autocorr`, `unsmooth_geltner` | Getmansky, Lo & Makarov (2004); Geltner (1993) |
| Drawdown, Calmar, Sortino, historical VaR / CVaR, risk contributions, diversification ratio | `metrics`, `factors` | standard |

## Quick start
```
pip install numpy
python3 tests/run_tests.py                     # 42 checks
python3 tests/run_tests.py --mutants           # each check must fail on a deliberately broken copy (15 mutants)
python3 examples/screen_csv.py examples/sample_returns.csv --top 8     # screen 25 synthetic managers
python3 experiments/lucky_manager.py           # the selection-bias experiment below (about 10 minutes)
python3 examples/make_sample_memo.py M09       # a sample quantitative due-diligence memo ([examples/sample_memo_M09.md](examples/sample_memo_M09.md), synthetic data)
```
```python
from diligence import inference, metrics, screen, simulate
R, truth = simulate.simulate_managers(n_managers=100, n_months=36, n_skilled=0, seed=1)   # 100 managers, none with skill
rows = screen.screen(R)                                                                    # table with PSR, DSR, drawdown, warnings, BH / Holm flags
print(screen.to_markdown(rows, 5))
```

## The result that matters: the best of many is not the same as good
Simulated universes in which **every manager has zero true skill** (8% annual volatility, normal returns, 300 universes per row). Full output in [`results/lucky_manager.md`](results/lucky_manager.md); seeds are fixed, so it reproduces exactly.

| managers N | months T | mean best annual Sharpe | judged alone: "significant" (PSR > 95%) | after deflating for N: "significant" (DSR > 95%) |
|---|---|---|---|---|
| 10 | 36 | 0.95 | 44.7% | 0.0% |
| 50 | 36 | 1.34 | 92.3% | 0.0% |
| 100 | 36 | 1.53 | 99.3% | 0.3% |
| 100 | 60 | 1.17 | 100.0% | 0.0% |
| 500 | 36 | 1.90 | 100.0% | 0.0% |

With 100 candidates and three years of data, the best zero-skill manager shows an annual Sharpe of about 1.5 and looks statistically significant 99% of the time if you judge it alone. Deflating for the number of candidates removes the illusion (in fact it is conservative: far below the nominal 5%). A mixed universe (20 skilled of 100, true annual Sharpe 1.0) screened with Benjamini-Hochberg at 10%:

| months | flagged per universe | false discovery proportion | skilled found |
|---|---|---|---|
| 36 | 4.3 | 13.1% | 19% |
| 60 | 10.4 | 10.9% | 46% |
| 120 | 18.3 | 8.1% | 84% |

The honest lesson: three years cannot separate skill from luck in a crowd; ten years can. Real universes are correlated and have survivorship and backfill bias, which makes this worse, not better.

## How it is tested (and why you can trust the tests)
* Special functions (normal, Student t, chi-square) are checked against textbook values; the NW standard errors against an independent loop-based implementation; MinTRL against PSR for self-consistency; the bootstrap against its coverage (94% for a nominal 95%).
* **Mutation testing:** 15 deliberate bugs (wrong annualisation, no Bartlett weights, Bonferroni instead of BH, no smoothing in the simulator, and so on). Every one must make at least one check fail. The first version of the suite missed four of them; they are why the suite now contains an exact formula check for the expected-maximum Sharpe, a Holm step-down case, a reference NW implementation and an exact Ljung-Box case.

## Limits
* Independent normal-ish simulations; real data have regime changes, survivorship, backfill bias, fees, and liquidity terms that these tests do not model.
* DSR assumes the candidate Sharpe ratios are roughly independent and uses their cross-sectional variance; with strongly correlated candidates it is too harsh.
* BH assumes independence or positive dependence of the tests. The Newey-West t-test uses Student-t critical values with n-k-1 degrees of freedom, a practical but approximate choice at short sample sizes.
* No optimisation, no portfolio construction beyond risk contributions and inverse-volatility weights, no data connectors.

MIT licence. Part of the [Orbital Dominion](https://github.com/veo555/Orbital-Dominion) repository (folder `research/manager-diligence`); `git subtree split` makes it a standalone repository.
