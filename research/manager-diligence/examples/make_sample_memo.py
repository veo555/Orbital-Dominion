#!/usr/bin/env python3
"""Generate a sample quantitative due-diligence memo for ONE manager of examples/sample_returns.csv (synthetic data).
   python3 examples/make_sample_memo.py M09 > examples/sample_memo_M09.md"""
import sys, os, csv, math
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from diligence import metrics, inference, screen
name = sys.argv[1] if len(sys.argv) > 1 else 'M09'
here = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(here, 'sample_returns.csv')) as f: rows = list(csv.reader(f))
names = rows[0]; D = np.array([[float(x) for x in r] for r in rows[1:]]); R = D.T
i = names.index(name); r = R[i]; row = screen.screen(R, names=names)[i]
lo, hi = inference.bootstrap_sharpe_ci(r, reps=4000, seed=1); sr_m, sr_a = metrics.sharpe(r)
ac = [metrics.autocorr(r, k) for k in (1, 2, 3)]; N = len(names)
print('# Quantitative due-diligence memo (SYNTHETIC DATA): %s\n' % name)
print('> Illustration only. The return history is simulated (examples/sample_returns.csv); it shows what the quantitative section of a manager-selection memo can look like. The qualitative sections (strategy, edge, people, operations, terms) cannot be judged from returns and are listed as an open checklist.\n')
print('## 1. Track record (%d monthly returns)\n' % len(r))
print('| metric | value |\n|---|---|')
print('| annualised return | %.1f%% |\n| annualised volatility | %.1f%% |\n| Sharpe ratio (annualised) | %.2f |\n| 95%% stationary-bootstrap CI for the Sharpe | [%.2f, %.2f] |' % (100 * row['ann_return'], 100 * row['ann_vol'], sr_a, lo, hi))
print('| max drawdown | %.1f%% |\n| Sortino / Calmar | %.2f / %.2f |\n| skewness / kurtosis | %.2f / %.2f |\n| 95%% historical VaR / CVaR (monthly) | %.1f%% / %.1f%% |' % (100 * row['max_drawdown'], row['sortino_ann'], row['calmar'], row['skew'], row['kurtosis'], 100 * row['var95'], 100 * row['cvar95']))
print('\n## 2. Is the Sharpe ratio statistically real?\n')
print('* Probabilistic Sharpe ratio against zero: **%.2f** (probability that the true Sharpe is positive, allowing for skewness and kurtosis).' % row['psr0'])
print('* Minimum track record for 95%% confidence at the observed Sharpe: **%.0f months** (we have %d).' % (row['min_track_months'], len(r)))
print('* **Selection bias:** this manager is one of %d candidates screened. The deflated Sharpe ratio, which benchmarks against the best Sharpe expected among %d zero-skill managers, is **%.2f**; judged alone it would look stronger.' % (N, N, row['dsr']))
print('* Benjamini-Hochberg at a 10%% false discovery rate across all %d candidates: **%s**. Holm at 5%%: **%s**.' % (N, 'significant' if row['bh_significant'] else 'not significant', 'significant' if row['holm_significant'] else 'not significant'))
print('\n## 3. Data quality\n')
print('* Serial correlation lag 1-3: %.2f, %.2f, %.2f; Ljung-Box p = %.3f. %s' % (ac[0], ac[1], ac[2], row['ljung_box_p'], 'No sign of smoothed marks.' if row['ljung_box_p'] >= 0.05 or ac[0] <= 0 else 'Positive serial correlation: ask how positions are valued; unsmoothed volatility is likely higher.'))
print('\n## 4. Open items before any recommendation (not assessable from returns)\n')
for t in ['Strategy and source of edge: what is the repeatable reason this should make money, and what would make it stop?', 'Capacity and the size of the book relative to liquidity', 'Factor exposures: regress on equity, rates, credit, volatility and trend factors with Newey-West errors (examples/screen_csv.py --factors)', 'Drawdown behaviour in 2008 / 2020 style stress: does the history contain one?', 'Team: tenure, key-person risk, turnover, incentive alignment', 'Operational due diligence: valuation policy, independent administrator, auditor, counterparties, compliance', 'Terms: fees, high-water mark, liquidity (lock-ups, gates, notice), side letters, transparency', 'Fit: correlation with the existing portfolio and marginal contribution to risk (factors.risk_contributions)']:
    print('- [ ] ' + t)
print('\n_Past performance does not predict future results. Synthetic data; no real manager is described._')
