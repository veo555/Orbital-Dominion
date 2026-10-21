"""Vanilla option pricing: Black-Scholes-Merton (continuous dividend yield q), Greeks, implied volatility,
Cox-Ross-Rubinstein binomial tree (European/American), and antithetic Monte Carlo."""
import math
import numpy as np
from .special import norm_cdf, norm_pdf

def _d1d2(S, K, T, r, q, sigma):
    v = sigma * math.sqrt(T)
    d1 = (math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / v
    return d1, d1 - v

def bs_price(S, K, T, r, sigma, call=True, q=0.0):
    if T <= 0 or sigma <= 0:
        intrinsic = max(S - K, 0.0) if call else max(K - S, 0.0)
        return intrinsic
    d1, d2 = _d1d2(S, K, T, r, q, sigma)
    if call:
        return float(S * math.exp(-q * T) * norm_cdf(d1) - K * math.exp(-r * T) * norm_cdf(d2))
    return float(K * math.exp(-r * T) * norm_cdf(-d2) - S * math.exp(-q * T) * norm_cdf(-d1))

def bs_greeks(S, K, T, r, sigma, call=True, q=0.0):
    """delta, gamma, vega (per 1.00 vol), theta (per year), rho (per 1.00 rate)."""
    d1, d2 = _d1d2(S, K, T, r, q, sigma)
    eq, er = math.exp(-q * T), math.exp(-r * T)
    pdf = float(norm_pdf(d1))
    gamma = eq * pdf / (S * sigma * math.sqrt(T))
    vega = S * eq * pdf * math.sqrt(T)
    if call:
        delta = eq * float(norm_cdf(d1))
        theta = -S * eq * pdf * sigma / (2 * math.sqrt(T)) - r * K * er * float(norm_cdf(d2)) + q * S * eq * float(norm_cdf(d1))
        rho = K * T * er * float(norm_cdf(d2))
    else:
        delta = -eq * float(norm_cdf(-d1))
        theta = -S * eq * pdf * sigma / (2 * math.sqrt(T)) + r * K * er * float(norm_cdf(-d2)) - q * S * eq * float(norm_cdf(-d1))
        rho = -K * T * er * float(norm_cdf(-d2))
    return dict(delta=delta, gamma=gamma, vega=vega, theta=theta, rho=rho)

def implied_vol(price, S, K, T, r, call=True, q=0.0, lo=1e-6, hi=5.0, tol=1e-12):
    """Bracketed bisection (monotone in sigma, so always converges when the price is arbitrage-free)."""
    intrinsic = max((S * math.exp(-q * T) - K * math.exp(-r * T)) if call else (K * math.exp(-r * T) - S * math.exp(-q * T)), 0.0)
    if price < intrinsic - 1e-12 or price > (S * math.exp(-q * T) if call else K * math.exp(-r * T)) + 1e-12:
        raise ValueError("price violates no-arbitrage bounds")
    a, b = lo, hi
    for _ in range(200):
        m = 0.5 * (a + b)
        if bs_price(S, K, T, r, m, call, q) < price: a = m
        else: b = m
        if b - a < tol: break
    return 0.5 * (a + b)

def crr_price(S, K, T, r, sigma, n=500, call=True, american=False, q=0.0):
    dt = T / n
    u = math.exp(sigma * math.sqrt(dt)); d = 1.0 / u
    p = (math.exp((r - q) * dt) - d) / (u - d)
    disc = math.exp(-r * dt)
    j = np.arange(n + 1)
    ST = S * u ** (n - j) * d ** j
    V = np.maximum(ST - K, 0.0) if call else np.maximum(K - ST, 0.0)
    for i in range(n - 1, -1, -1):
        V = disc * (p * V[:i + 1] + (1 - p) * V[1:i + 2])
        if american:
            jj = np.arange(i + 1)
            Si = S * u ** (i - jj) * d ** jj
            V = np.maximum(V, (Si - K) if call else (K - Si))
    return float(V[0])

def mc_price(S, K, T, r, sigma, n=200000, call=True, q=0.0, seed=0):
    """Antithetic-variates Monte Carlo; returns (price, standard_error)."""
    rng = np.random.default_rng(seed)
    z = rng.standard_normal(n // 2)
    drift = (r - q - 0.5 * sigma * sigma) * T; vol = sigma * math.sqrt(T)
    pay = lambda zz: np.maximum(S * np.exp(drift + vol * zz) - K, 0.0) if call else np.maximum(K - S * np.exp(drift + vol * zz), 0.0)
    x = 0.5 * (pay(z) + pay(-z)) * math.exp(-r * T)
    return float(x.mean()), float(x.std(ddof=1) / math.sqrt(len(x)))
