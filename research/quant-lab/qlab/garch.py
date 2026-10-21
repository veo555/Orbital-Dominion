"""Gaussian GARCH(1,1) by quasi-maximum likelihood with variance targeting omitted (omega free),
optimised by a small Nelder-Mead implementation (numpy only)."""
import math
import numpy as np

def simulate(n, omega, alpha, beta, seed=0, burn=500):
    rng = np.random.default_rng(seed)
    z = rng.standard_normal(n + burn); r = np.empty(n + burn)
    h = omega / (1 - alpha - beta)
    for t in range(n + burn):
        r[t] = math.sqrt(h) * z[t]
        h = omega + alpha * r[t] ** 2 + beta * h
    return r[burn:]

def neg_loglik(params, r):
    omega, alpha, beta = params
    if omega <= 0 or alpha < 0 or beta < 0 or alpha + beta >= 0.9999: return 1e18
    h = np.var(r); ll = 0.0
    for x in r:
        ll += math.log(h) + x * x / h
        h = omega + alpha * x * x + beta * h
    return 0.5 * (ll + len(r) * math.log(2 * math.pi))

def nelder_mead(f, x0, step, iters=600, tol=1e-10):
    n = len(x0); pts = [np.array(x0, float)]
    for i in range(n):
        p = np.array(x0, float); p[i] += step[i]; pts.append(p)
    vals = [f(p) for p in pts]
    for _ in range(iters):
        o = np.argsort(vals); pts = [pts[i] for i in o]; vals = [vals[i] for i in o]
        if abs(vals[-1] - vals[0]) < tol: break
        c = np.mean(pts[:-1], axis=0)
        xr = c + (c - pts[-1]); fr = f(xr)
        if fr < vals[0]:
            xe = c + 2 * (c - pts[-1]); fe = f(xe)
            pts[-1], vals[-1] = (xe, fe) if fe < fr else (xr, fr)
        elif fr < vals[-2]: pts[-1], vals[-1] = xr, fr
        else:
            xc = c + 0.5 * (pts[-1] - c); fc = f(xc)
            if fc < vals[-1]: pts[-1], vals[-1] = xc, fc
            else:
                for i in range(1, n + 1):
                    pts[i] = pts[0] + 0.5 * (pts[i] - pts[0]); vals[i] = f(pts[i])
    i = int(np.argmin(vals)); return pts[i], vals[i]

def fit(r):
    r = np.asarray(r, float); v = float(np.var(r))
    x0 = [0.05 * v, 0.08, 0.85]
    p, nll = nelder_mead(lambda q: neg_loglik(q, r), x0, [0.02 * v, 0.03, 0.05])
    return dict(omega=float(p[0]), alpha=float(p[1]), beta=float(p[2]), loglik=-nll,
                persistence=float(p[1] + p[2]), uncond_var=float(p[0] / (1 - p[1] - p[2])))

def forecast(r, omega, alpha, beta, steps=10):
    """h_{T+k} mean-reverts to omega/(1-alpha-beta) at rate alpha+beta."""
    r = np.asarray(r, float); h = np.var(r)
    for x in r: h = omega + alpha * x * x + beta * h
    lr = omega / (1 - alpha - beta); out = []
    for k in range(steps): out.append(lr + (alpha + beta) ** k * (h - lr))
    return np.array(out)
