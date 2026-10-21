"""Mean-variance building blocks: global minimum variance, tangency (max Sharpe), equal-risk-contribution."""
import numpy as np

def min_variance(cov):
    w = np.linalg.solve(np.asarray(cov, float), np.ones(len(cov)))
    return w / w.sum()

def tangency(mu, cov, rf=0.0):
    w = np.linalg.solve(np.asarray(cov, float), np.asarray(mu, float) - rf)
    return w / w.sum()

def risk_contributions(w, cov):
    w = np.asarray(w, float); m = np.asarray(cov, float) @ w
    return w * m / (w @ m)

def risk_parity(cov, iters=10000, tol=1e-12):
    """Long-only ERC by the fixed-point w_i <- (1/sigma_i-scaled) Newton-free iteration on w_i (Sigma w)_i = c."""
    S = np.asarray(cov, float); n = len(S); w = np.full(n, 1.0 / n)
    for _ in range(iters):
        rc = risk_contributions(w, S)
        wn = w * np.sqrt((1.0 / n) / rc); wn /= wn.sum()
        if np.abs(wn - w).max() < tol: w = wn; break
        w = wn
    return w
