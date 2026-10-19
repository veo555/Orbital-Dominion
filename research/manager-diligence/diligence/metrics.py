"""Descriptive performance and risk statistics for a periodic return series (simple returns, e.g. monthly)."""
import numpy as np
from .special import chi2_sf

def _a(r):
    r = np.asarray(r, dtype=float)
    if r.ndim != 1 or r.size < 3 or not np.all(np.isfinite(r)):
        raise ValueError("returns must be a finite 1-D array with at least 3 observations")
    return r

def excess(r, rf=0.0):
    return _a(r) - np.asarray(rf, dtype=float)

def moments(r):
    """mean, std (ddof=1), skewness, kurtosis (NON-excess: normal = 3)."""
    r = _a(r); m = r.mean(); s = r.std(ddof=1)
    if s < 1e-12: raise ValueError("zero volatility")
    z = (r - m) / r.std(ddof=0)
    return m, s, float(np.mean(z ** 3)), float(np.mean(z ** 4))

def sharpe(r, rf=0.0, periods=12):
    """Per-period Sharpe ratio of excess returns, and its annualised value (x sqrt(periods))."""
    e = excess(r, rf); sd = e.std(ddof=1)
    if sd < 1e-12: raise ValueError("zero volatility")
    sr = e.mean() / sd
    return float(sr), float(sr * np.sqrt(periods))

def max_drawdown(r):
    """Largest peak-to-trough fall of the compounded wealth curve, as a positive fraction."""
    w = np.cumprod(1.0 + _a(r)); peak = np.maximum.accumulate(np.concatenate([[1.0], w]))[1:]
    return float(np.max(1.0 - w / peak))

def annual_return(r, periods=12):
    r = _a(r); return float(np.prod(1.0 + r) ** (periods / r.size) - 1.0)

def sortino(r, mar=0.0, periods=12):
    r = _a(r); dd = np.sqrt(np.mean(np.minimum(r - mar, 0.0) ** 2))
    return float('inf') if dd == 0 else float((r.mean() - mar) / dd * np.sqrt(periods))

def calmar(r, periods=12):
    md = max_drawdown(r); return float('inf') if md == 0 else annual_return(r, periods) / md

def var_cvar(r, level=0.95):
    """Historical value-at-risk and expected shortfall as positive loss fractions."""
    r = _a(r); q = np.quantile(r, 1 - level); tail = r[r <= q]
    return float(-q), float(-tail.mean())

def autocorr(r, lag):
    r = _a(r); x = r - r.mean(); den = float(np.sum(x * x))
    return float(np.sum(x[lag:] * x[:-lag]) / den)

def ljung_box(r, lags=3):
    """Ljung-Box Q statistic and p-value for serial correlation up to `lags`. Positive autocorrelation in hedge-fund returns is a classic sign of
    smoothed / stale marks (Getmansky, Lo & Makarov 2004): it understates volatility and so overstates the Sharpe ratio."""
    r = _a(r); n = r.size
    q = n * (n + 2) * sum(autocorr(r, k) ** 2 / (n - k) for k in range(1, lags + 1))
    return float(q), float(chi2_sf(q, lags))

def unsmooth_geltner(r, rho=None):
    """First-order Geltner unsmoothing: r*_t = (r_t - rho r_{t-1}) / (1 - rho). rho defaults to the lag-1 autocorrelation (floored at 0)."""
    r = _a(r); rho = max(0.0, autocorr(r, 1)) if rho is None else rho
    if not 0 <= rho < 1: raise ValueError("rho must be in [0,1)")
    return (r[1:] - rho * r[:-1]) / (1 - rho)

def summary(r, rf=0.0, periods=12):
    r = _a(r); m, s, g3, g4 = moments(r - rf); sr, sra = sharpe(r, rf, periods); v, cv = var_cvar(r)
    q, p = ljung_box(r)
    return dict(n=int(r.size), ann_return=annual_return(r, periods), ann_vol=float(r.std(ddof=1) * np.sqrt(periods)), sharpe_ann=sra, sortino_ann=sortino(r, periods=periods),
                max_drawdown=max_drawdown(r), calmar=calmar(r, periods), skew=g3, kurtosis=g4, var95=v, cvar95=cv, autocorr1=autocorr(r, 1), ljung_box_p=p)
