"""Factor regression with heteroskedasticity-and-autocorrelation-consistent (Newey-West) standard errors, and portfolio diversification statistics."""
import math
import numpy as np
from .special import t_two_sided_p

def nw_lags(n):
    return int(math.floor(4.0 * (n / 100.0) ** (2.0 / 9.0)))

def ols_hac(y, X, lags=None):
    """OLS of y on [1, X]. Returns alpha, betas, their Newey-West t-stats and two-sided p-values (Student t, n-k-1 df), R^2 and the lag used."""
    y = np.asarray(y, dtype=float); X = np.asarray(X, dtype=float)
    if X.ndim == 1: X = X[:, None]
    n, k = X.shape
    if n <= k + 2: raise ValueError("too few observations")
    Z = np.column_stack([np.ones(n), X]); XtX_inv = np.linalg.inv(Z.T @ Z); b = XtX_inv @ Z.T @ y; e = y - Z @ b
    L = nw_lags(n) if lags is None else lags
    u = Z * e[:, None]; S = u.T @ u
    for l in range(1, L + 1):
        w = 1.0 - l / (L + 1.0); G = u[l:].T @ u[:-l]; S += w * (G + G.T)
    V = XtX_inv @ S @ XtX_inv * (n / (n - k - 1.0)); se = np.sqrt(np.diag(V)); t = b / se
    p = np.array([t_two_sided_p(ti, n - k - 1) for ti in t]); r2 = 1.0 - float(e @ e) / float(np.sum((y - y.mean()) ** 2))
    return dict(coef=b, se=se, t=t, p=p, r2=r2, lags=L, n=n, alpha=float(b[0]), alpha_t=float(t[0]), alpha_p=float(p[0]))

def risk_contributions(weights, cov):
    """Percent contribution of each position to portfolio variance (sums to 1)."""
    w = np.asarray(weights, float); C = np.asarray(cov, float); pv = float(w @ C @ w); return (w * (C @ w)) / pv

def diversification_ratio(weights, cov):
    """Weighted average stand-alone volatility divided by portfolio volatility (1 = no diversification)."""
    w = np.asarray(weights, float); C = np.asarray(cov, float); return float((w @ np.sqrt(np.diag(C))) / math.sqrt(w @ C @ w))

def inverse_vol_weights(cov):
    v = 1.0 / np.sqrt(np.diag(np.asarray(cov, float))); return v / v.sum()
