"""Screening report over many managers' monthly returns: one row per manager with the numbers a manager-selection analyst would ask for, plus warnings.
Selection-bias aware: each Sharpe is deflated for the number of candidates, and p-values are corrected for multiple testing."""
import math
import numpy as np
from . import metrics, inference

def screen(returns, names=None, rf=0.0, periods=12, fdr=0.10, factors=None):
    """returns: array [n_managers, n_months] (or dict name -> series of equal length). factors: optional [n_months, k] factor returns for alpha regressions."""
    if isinstance(returns, dict): names = list(returns); returns = np.array([returns[k] for k in names], float)
    R = np.asarray(returns, float); N = R.shape[0]; names = names or ['m%d' % i for i in range(N)]
    srs = np.array([metrics.sharpe(r, rf, periods)[0] for r in R]); var_sr = float(np.var(srs, ddof=1)) if N > 1 else 0.0
    rows = []
    for i, r in enumerate(R):
        s = metrics.summary(r, rf, periods)
        psr0 = inference.psr(r, 0.0, rf)
        row = dict(name=names[i], **s, psr0=psr0, p_value=1.0 - psr0, dsr=inference.dsr(r, N, var_sr, rf) if N > 1 else float('nan'),
                   min_track_months=inference.min_track_record(r, 0.0, 0.95, rf))
        if factors is not None:
            from .factors import ols_hac
            h = ols_hac(r - rf, factors); row.update(alpha_ann=h['alpha'] * periods, alpha_t=h['alpha_t'], alpha_p=h['alpha_p'], r2=h['r2'])
        w = []
        if s['ljung_box_p'] < 0.05 and s['autocorr1'] > 0: w.append('positive serial correlation (possible smoothed marks): Sharpe may be overstated')
        if s['kurtosis'] > 5: w.append('fat tails (kurtosis %.1f)' % s['kurtosis'])
        if s['n'] < row['min_track_months']: w.append(('track record shorter than the %.0f months needed' % row['min_track_months']) if math.isfinite(row['min_track_months']) else 'Sharpe not positive')
        row['warnings'] = w; rows.append(row)
    p = np.array([r['alpha_p'] if factors is not None else r['p_value'] for r in rows])
    rej = inference.benjamini_hochberg(p, fdr); holm_rej = inference.holm(p, 0.05)
    for r, a, b in zip(rows, rej, holm_rej): r['bh_significant'] = bool(a); r['holm_significant'] = bool(b)
    return rows

def to_markdown(rows, top=20):
    rows = sorted(rows, key=lambda r: -r['sharpe_ann'])[:top]
    head = '| manager | ann. return | vol | Sharpe | PSR(>0) | DSR | max DD | autocorr | BH | warnings |\n|---|---|---|---|---|---|---|---|---|---|\n'
    return head + '\n'.join('| %s | %.1f%% | %.1f%% | %.2f | %.2f | %s | %.1f%% | %.2f | %s | %s |' % (r['name'], 100 * r['ann_return'], 100 * r['ann_vol'], r['sharpe_ann'], r['psr0'],
        ('%.2f' % r['dsr']) if r['dsr'] == r['dsr'] else 'n/a', 100 * r['max_drawdown'], r['autocorr1'], 'yes' if r['bh_significant'] else 'no', '; '.join(r['warnings']) or '-') for r in rows) + '\n'
