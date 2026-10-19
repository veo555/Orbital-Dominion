# Lucky-manager experiment (simulated, reproducible)

Zero-skill universes: every manager has a true Sharpe of exactly 0 (8% annual vol, normal returns). 300 universes per row. "Naive PSR > 95%" = the best-Sharpe manager looks significant when judged alone; "DSR > 95%" = it still does after deflating for the number of candidates. A correct test at 5% should be fooled about 5% of the time.

| managers N | months T | mean best annual Sharpe | naive PSR > 95% | DSR > 95% |
|---|---|---|---|---|
| 10 | 36 | 0.95 | 44.7% | 0.0% |
| 10 | 60 | 0.68 | 35.0% | 0.3% |
| 50 | 36 | 1.34 | 92.3% | 0.0% |
| 50 | 60 | 1.04 | 94.0% | 0.0% |
| 100 | 36 | 1.53 | 99.3% | 0.3% |
| 100 | 60 | 1.17 | 100.0% | 0.0% |
| 500 | 36 | 1.90 | 100.0% | 0.0% |
| 500 | 60 | 1.42 | 100.0% | 0.7% |

## Screening a mixed universe with Benjamini-Hochberg (q = 10%)

100 managers, 20 truly skilled (true annual Sharpe 1.0), 80 with none; 100 universes per row.

| months T | managers flagged | false discovery proportion | share of skilled found (power) |
|---|---|---|---|
| 36 | 4.3 per universe | 13.1% | 19% |
| 60 | 10.4 per universe | 10.9% | 46% |
| 120 | 18.3 per universe | 8.1% | 84% |

## Reading it

* The best of many zero-skill managers has a high Sharpe by construction, and the more candidates, the higher: judged alone it is called significant almost every time.
* Deflating for the number of candidates (DSR) brings the false positive rate far BELOW the nominal 5% (0-0.7% here): it is conservative, at the price of power. Short track records cannot tell a skilled manager from the best of a crowd.
* BH keeps the share of false discoveries near the chosen q = 10% (13% at 36 months, where the test statistics are least normal, then 11% and 8%) while finding more skilled managers as the track record grows: 19% of them at 36 months, 84% at 120.
* Caveats: independent managers, normal returns, one fixed skill level, no fees, no survivorship or backfill bias. Real universes are correlated and messier, which makes selection bias worse, not better.
