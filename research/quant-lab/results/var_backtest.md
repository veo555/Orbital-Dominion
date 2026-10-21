# VaR backtest under GARCH(1,1) truth (alpha=0.99, 19750 out-of-sample days, nominal exception rate 1%)

| Method | Exceptions | Rate | Kupiec LR | p-value | Verdict |
|---|---|---|---|---|---|
| 250d historical | 294 | 1.49% | 41.41 | 1.24e-10 | reject |
| EWMA-0.94 Gaussian | 248 | 1.26% | 12.06 | 0.000514 | reject |
| Oracle conditional Gaussian | 206 | 1.04% | 0.36 | 0.546 | not rejected |

Kupiec tests *unconditional* coverage only; it cannot see exceptions that cluster (Christoffersen independence is not implemented here).
