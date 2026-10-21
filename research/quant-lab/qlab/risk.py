"""Value-at-Risk / Expected Shortfall estimators and the Kupiec proportion-of-failures backtest."""
import math
import numpy as np
from .special import norm_pdf, chi2_sf_df1

def _ppf(p):
    # Acklam-free: Newton on the normal cdf using erf (accurate to ~1e-12 for 1e-6<p<1-1e-6)
    x = 0.0
    for _ in range(100):
        c = 0.5 * (1 + math.erf(x / math.sqrt(2)))
        x -= (c - p) / float(norm_pdf(x))
        if abs(c - p) < 1e-15: break
    return x

def hist_var_es(returns, alpha=0.99):
    """Loss-positive historical VaR and ES. VaR = empirical alpha-quantile of losses; ES = mean loss at or beyond VaR."""
    L = -np.asarray(returns, dtype=float)
    var = float(np.quantile(L, alpha, method="inverted_cdf"))
    return var, float(L[L >= var].mean())

def param_var_es(mu, sigma, alpha=0.99):
    """Gaussian VaR/ES of returns ~ N(mu, sigma^2), loss-positive."""
    z = _ppf(alpha)
    return -mu + sigma * z, -mu + sigma * float(norm_pdf(z)) / (1 - alpha)

def ewma_vol(returns, lam=0.94):
    r = np.asarray(returns, dtype=float)
    v = np.empty(len(r)); v[0] = r[0] ** 2
    for t in range(1, len(r)):
        v[t] = lam * v[t - 1] + (1 - lam) * r[t - 1] ** 2
    return np.sqrt(v)

def kupiec_pof(n_exceptions, n_obs, p):
    """Kupiec (1995) LR test. H0: exception probability = p. Returns (LR, p_value)."""
    x, n = int(n_exceptions), int(n_obs)
    if x == 0: lr = -2 * (n * math.log(1 - p))
    elif x == n: lr = -2 * (n * math.log(p))
    else:
        ph = x / n
        lr = -2 * ((n - x) * math.log(1 - p) + x * math.log(p) - (n - x) * math.log(1 - ph) - x * math.log(ph))
    return lr, chi2_sf_df1(lr)
