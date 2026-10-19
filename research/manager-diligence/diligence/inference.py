"""Statistical inference for Sharpe ratios and selection bias.
References: Lo (2002) 'The statistics of Sharpe ratios'; Bailey & Lopez de Prado (2012) 'The Sharpe ratio efficient frontier' (PSR, MinTRL) and (2014)
'The deflated Sharpe ratio'; Politis & Romano (1994) stationary bootstrap; Holm (1979); Benjamini & Hochberg (1995). All Sharpe ratios here are PER-PERIOD."""
import math
import numpy as np
from .special import norm_cdf, norm_ppf
from .metrics import moments, excess

EULER_GAMMA = 0.5772156649015329

def sharpe_variance_factor(sr, skew, kurt):
    """1 - skew*SR + (kurt-1)/4 * SR^2 : the non-normality correction of the Sharpe estimator variance (kurt non-excess; normal = 3)."""
    return 1.0 - skew * sr + (kurt - 1.0) / 4.0 * sr * sr

def sharpe_se(sr, n, skew=0.0, kurt=3.0):
    """Standard error of the per-period Sharpe estimate from n observations."""
    return math.sqrt(sharpe_variance_factor(sr, skew, kurt) / (n - 1.0))

def psr(r, sr_benchmark=0.0, rf=0.0):
    """Probabilistic Sharpe ratio: P(true Sharpe > sr_benchmark) given the sample, its length, skewness and kurtosis (per-period units)."""
    e = excess(r, rf); n = e.size; m, s, g3, g4 = moments(e); sr = m / s
    f = sharpe_variance_factor(sr, g3, g4)
    if f <= 0: return float('nan')
    return norm_cdf((sr - sr_benchmark) * math.sqrt(n - 1.0) / math.sqrt(f))

def min_track_record(r, sr_benchmark=0.0, confidence=0.95, rf=0.0):
    """Minimum number of observations for the sample Sharpe to beat sr_benchmark at the given confidence (inf if sr <= benchmark)."""
    e = excess(r, rf); m, s, g3, g4 = moments(e); sr = m / s
    if sr <= sr_benchmark: return float('inf')
    z = norm_ppf(confidence)
    return 1.0 + sharpe_variance_factor(sr, g3, g4) * (z / (sr - sr_benchmark)) ** 2

def expected_max_sharpe(n_trials, sr_variance):
    """Expected maximum of n_trials independent zero-skill Sharpe estimates with the given cross-sectional variance (Bailey & Lopez de Prado 2014)."""
    if n_trials < 2: return 0.0
    return math.sqrt(sr_variance) * ((1 - EULER_GAMMA) * norm_ppf(1 - 1.0 / n_trials) + EULER_GAMMA * norm_ppf(1 - 1.0 / (n_trials * math.e)))

def dsr(r, n_trials, sr_variance, rf=0.0):
    """Deflated Sharpe ratio: the PSR against the Sharpe you would expect to find as the BEST of n_trials managers with no skill.
    sr_variance is the variance of the per-period Sharpe estimates across the n_trials candidates."""
    return psr(r, expected_max_sharpe(n_trials, sr_variance), rf)

def stationary_bootstrap_indices(n, mean_block, rng):
    """Politis-Romano stationary bootstrap index sequence of length n (geometric block lengths, wrap-around)."""
    p = 1.0 / mean_block; idx = np.empty(n, dtype=np.int64); idx[0] = rng.integers(n)
    jumps = rng.random(n) < p; starts = rng.integers(n, size=n)
    for i in range(1, n):
        idx[i] = starts[i] if jumps[i] else (idx[i - 1] + 1) % n
    return idx

def bootstrap_sharpe_ci(r, rf=0.0, periods=12, mean_block=3, reps=2000, level=0.95, seed=0):
    """Percentile CI for the ANNUALISED Sharpe ratio using the stationary bootstrap (keeps short-range dependence)."""
    e = excess(r, rf); n = e.size; rng = np.random.default_rng(seed); out = np.empty(reps)
    for b in range(reps):
        x = e[stationary_bootstrap_indices(n, mean_block, rng)]; sd = x.std(ddof=1); out[b] = x.mean() / sd * math.sqrt(periods) if sd > 0 else 0.0
    a = (1 - level) / 2; return float(np.quantile(out, a)), float(np.quantile(out, 1 - a))

def holm(pvals, alpha=0.05):
    """Holm step-down: boolean rejection array controlling the family-wise error rate at alpha."""
    p = np.asarray(pvals, dtype=float); order = np.argsort(p); m = p.size; rej = np.zeros(m, dtype=bool)
    for rank, i in enumerate(order):
        if p[i] <= alpha / (m - rank): rej[i] = True
        else: break
    return rej

def benjamini_hochberg(pvals, q=0.10):
    """Benjamini-Hochberg step-up: boolean rejection array controlling the false discovery rate at q (independent or positively dependent tests)."""
    p = np.asarray(pvals, dtype=float); m = p.size; order = np.argsort(p); thresh = q * (np.arange(1, m + 1) / m)
    passed = p[order] <= thresh; rej = np.zeros(m, dtype=bool)
    if passed.any(): k = np.max(np.nonzero(passed)[0]); rej[order[:k + 1]] = True
    return rej
