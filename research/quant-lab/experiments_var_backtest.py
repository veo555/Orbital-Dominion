"""Does a rolling-window VaR hold its coverage under volatility clustering? Known truth: GARCH(1,1) data.
Compares (a) 250-day historical VaR, (b) Gaussian VaR with EWMA(0.94) volatility, (c) oracle Gaussian VaR from the true conditional variance.
Run: python3 experiments_var_backtest.py > results/var_backtest.md"""
import math, numpy as np
from qlab import garch, risk
om, al, be, n, a = 2e-6, 0.10, 0.88, 20000, 0.99
rng = np.random.default_rng(42); z = rng.standard_normal(n + 500); r = np.empty(n + 500); h = np.empty(n + 500); hh = om / (1 - al - be)
for t in range(n + 500):
    h[t] = hh; r[t] = math.sqrt(hh) * z[t]; hh = om + al * r[t] ** 2 + be * hh
r, h = r[500:], h[500:]
z99 = risk._ppf(a); W = 250
hist = np.array([risk.hist_var_es(r[t - W:t], a)[0] for t in range(W, n)])
ew = risk.ewma_vol(r)[W:] * z99
orc = np.sqrt(h[W:]) * z99
L = -r[W:]
print('# VaR backtest under GARCH(1,1) truth (alpha=%.2f, %d out-of-sample days, nominal exception rate 1%%)\n' % (a, len(L)))
print('| Method | Exceptions | Rate | Kupiec LR | p-value | Verdict |\n|---|---|---|---|---|---|')
for name, v in (('250d historical', hist), ('EWMA-0.94 Gaussian', ew), ('Oracle conditional Gaussian', orc)):
    x = int((L > v).sum()); lr, p = risk.kupiec_pof(x, len(L), 1 - a)
    print('| %s | %d | %.2f%% | %.2f | %.3g | %s |' % (name, x, 100 * x / len(L), lr, p, 'reject' if p < 0.05 else 'not rejected'))
print('\nKupiec tests *unconditional* coverage only; it cannot see exceptions that cluster (Christoffersen independence is not implemented here).')
