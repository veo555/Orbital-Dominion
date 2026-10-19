# Quantitative due-diligence memo (SYNTHETIC DATA): M09

> Illustration only. The return history is simulated (examples/sample_returns.csv); it shows what the quantitative section of a manager-selection memo can look like. The qualitative sections (strategy, edge, people, operations, terms) cannot be judged from returns and are listed as an open checklist.

## 1. Track record (60 monthly returns)

| metric | value |
|---|---|
| annualised return | 9.7% |
| annualised volatility | 6.9% |
| Sharpe ratio (annualised) | 1.38 |
| 95% stationary-bootstrap CI for the Sharpe | [0.57, 2.23] |
| max drawdown | 6.7% |
| Sortino / Calmar | 2.86 / 1.45 |
| skewness / kurtosis | 0.18 / 2.91 |
| 95% historical VaR / CVaR (monthly) | 2.5% / 2.8% |

## 2. Is the Sharpe ratio statistically real?

* Probabilistic Sharpe ratio against zero: **1.00** (probability that the true Sharpe is positive, allowing for skewness and kurtosis).
* Minimum track record for 95% confidence at the observed Sharpe: **18 months** (we have 60).
* **Selection bias:** this manager is one of 25 candidates screened. The deflated Sharpe ratio, which benchmarks against the best Sharpe expected among 25 zero-skill managers, is **0.74**; judged alone it would look stronger.
* Benjamini-Hochberg at a 10% false discovery rate across all 25 candidates: **significant**. Holm at 5%: **significant**.

## 3. Data quality

* Serial correlation lag 1-3: 0.00, -0.06, 0.01; Ljung-Box p = 0.969. No sign of smoothed marks.

## 4. Open items before any recommendation (not assessable from returns)

- [ ] Strategy and source of edge: what is the repeatable reason this should make money, and what would make it stop?
- [ ] Capacity and the size of the book relative to liquidity
- [ ] Factor exposures: regress on equity, rates, credit, volatility and trend factors with Newey-West errors (examples/screen_csv.py --factors)
- [ ] Drawdown behaviour in 2008 / 2020 style stress: does the history contain one?
- [ ] Team: tenure, key-person risk, turnover, incentive alignment
- [ ] Operational due diligence: valuation policy, independent administrator, auditor, counterparties, compliance
- [ ] Terms: fees, high-water mark, liquidity (lock-ups, gates, notice), side letters, transparency
- [ ] Fit: correlation with the existing portfolio and marginal contribution to risk (factors.risk_contributions)

_Past performance does not predict future results. Synthetic data; no real manager is described._
