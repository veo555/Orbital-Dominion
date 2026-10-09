#!/usr/bin/env python3
"""Train the T2 opponent's value function V(s) = P(win | observation) from league self-play logs.

    python3 tools/league/train_value.py <feats.jsonl> [--out vf.json] [--quiet] [--report report.json]

Input lines (tools/league/run.js): {gid, gen, team, t, y, f:[11 observed features], p:[11 privileged features]}
  f = features the AI computes from ITS OWN observations (fog-honest; aiFeatures in src/js/42_ai_agent.js)
  p = the same definitions with the TRUE opponent state (privileged; only for analysis, like AlphaStar's centralised critic)
  y = final result for that team: 1 win, 0 loss, 0.5 draw (adjudicated by material share at the cap)
Split: held-out by GAME (gid % 5 == 0 -> test) so no game contributes to both sides.
Models: L2-regularised logistic regression (Newton / IRLS) on standardised features, and a 1-hidden-layer tanh MLP (Adam, early
stopping on a validation slice of the training games). The shipped model is the logistic regression unless the MLP improves the
held-out log-loss by more than 1 % (small data: prefer the simpler, better-calibrated model).
Reported: log-loss, Brier score, AUC (Mann-Whitney, draws excluded), reliability table (10 bins), and the same for the privileged model
and two baselines (base rate; army-ratio-only logistic regression)."""
import json, sys, math
import numpy as np

FEATS = ['logArmyRatio', 'logWorkerRatio', 'baseDiff', 'eraDiff', 'time', 'armyDiffK', 'supply', 'logBank', 'heroDiff', 'killDiff', 'logStructRatio']

def load(path):
    rows = [json.loads(l) for l in open(path) if l.strip()]
    F = np.array([r['f'] for r in rows], float); P = np.array([r['p'] for r in rows], float)
    y = np.array([r['y'] for r in rows], float); g = np.array([r['gid'] for r in rows]); t = np.array([r['t'] for r in rows], float)
    return F, P, y, g, t

def sig(z): return 1.0 / (1.0 + np.exp(-np.clip(z, -30, 30)))

def fit_lr(X, y, lam=1.0, iters=50):
    n, d = X.shape; Xb = np.hstack([X, np.ones((n, 1))]); w = np.zeros(d + 1)
    R = lam * np.eye(d + 1); R[d, d] = 0.0
    for _ in range(iters):
        p = sig(Xb @ w); W = p * (1 - p) + 1e-9
        g = Xb.T @ (p - y) + R @ w; H = (Xb * W[:, None]).T @ Xb + R
        step = np.linalg.solve(H, g); w -= step
        if np.max(np.abs(step)) < 1e-8: break
    return w

def pred_lr(w, X): return sig(np.hstack([X, np.ones((X.shape[0], 1))]) @ w)

def fit_mlp(X, y, Xv, yv, h=16, lr=0.01, epochs=3000, seed=1, l2=1e-3):
    rs = np.random.RandomState(seed); d = X.shape[1]
    W1 = rs.randn(h, d) * 0.3; b1 = np.zeros(h); w2 = rs.randn(h) * 0.3; b2 = 0.0
    params = [W1, b1, w2, np.array([b2])]; m = [np.zeros_like(p) for p in params]; v = [np.zeros_like(p) for p in params]
    best = (1e9, None); bad = 0
    for ep in range(1, epochs + 1):
        A = np.tanh(X @ params[0].T + params[1]); p = sig(A @ params[2] + params[3][0])
        e = (p - y) / len(y)
        g2 = A.T @ e + l2 * params[2]; gb2 = np.array([e.sum()])
        dA = np.outer(e, params[2]) * (1 - A * A)
        g1 = dA.T @ X + l2 * params[0]; gb1 = dA.sum(0)
        grads = [g1, gb1, g2, gb2]
        for i in range(4):
            m[i] = 0.9 * m[i] + 0.1 * grads[i]; v[i] = 0.999 * v[i] + 0.001 * grads[i] ** 2
            params[i] -= lr * (m[i] / (1 - 0.9 ** ep)) / (np.sqrt(v[i] / (1 - 0.999 ** ep)) + 1e-8)
        if ep % 25 == 0:
            pv = pred_mlp(params, Xv); L = logloss(pv, yv)
            if L < best[0] - 1e-5: best = (L, [p.copy() for p in params]); bad = 0
            else:
                bad += 1
                if bad > 12: break
    return best[1] or params

def pred_mlp(params, X):
    A = np.tanh(X @ params[0].T + params[1]); return sig(A @ params[2] + params[3][0])

def logloss(p, y): p = np.clip(p, 1e-6, 1 - 1e-6); return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))
def brier(p, y): return float(np.mean((p - y) ** 2))
def auc(p, y):
    m = (y == 0) | (y == 1); p, y = p[m], y[m]
    pos, neg = p[y == 1], p[y == 0]
    if len(pos) == 0 or len(neg) == 0: return float('nan')
    order = np.argsort(np.concatenate([pos, neg]), kind='mergesort'); ranks = np.empty(len(order)); ranks[order] = np.arange(1, len(order) + 1)
    allv = np.concatenate([pos, neg])            # average ranks for ties
    for val in np.unique(allv):
        idx = np.where(allv == val)[0]
        if len(idx) > 1: ranks[idx] = ranks[idx].mean()
    return float((ranks[:len(pos)].sum() - len(pos) * (len(pos) + 1) / 2) / (len(pos) * len(neg)))
def reliability(p, y, bins=10):
    out = []
    for i in range(bins):
        lo, hi = i / bins, (i + 1) / bins; m = (p >= lo) & (p < hi if i < bins - 1 else p <= hi)
        if m.sum(): out.append({'bin': f'{lo:.1f}-{hi:.1f}', 'n': int(m.sum()), 'pred': round(float(p[m].mean()), 3), 'obs': round(float(y[m].mean()), 3)})
    return out
def ece(p, y, bins=10):
    e = 0.0
    for r in reliability(p, y, bins): e += r['n'] * abs(r['pred'] - r['obs'])
    return e / max(1, len(p))
def rnd(x, k=4): return None if x is None or (isinstance(x, float) and math.isnan(x)) else round(x, k)
def metrics(p, y): return {'logloss': rnd(logloss(p, y)), 'brier': rnd(brier(p, y)), 'auc': rnd(auc(p, y)), 'ece': rnd(ece(p, y))}

def main():
    a = sys.argv[1:]; path = a[0]; out = None; quiet = '--quiet' in a; rep = None
    if '--out' in a: out = a[a.index('--out') + 1]
    if '--report' in a: rep = a[a.index('--report') + 1]
    F, P, y, g, t = load(path)
    test = (g % 5 == 0); val = (g % 5 == 1); tr = ~test & ~val; trv = ~test
    mu = F[trv].mean(0); sd = F[trv].std(0) + 1e-6; Z = (F - mu) / sd
    pmu = P[trv].mean(0); psd = P[trv].std(0) + 1e-6; PZ = (P - pmu) / psd
    w = fit_lr(Z[trv], y[trv], lam=1.0); p_lr = pred_lr(w, Z[test])
    wp = fit_lr(PZ[trv], y[trv], lam=1.0); p_pr = pred_lr(wp, PZ[test])
    w0 = fit_lr(Z[trv][:, :1], y[trv], lam=1.0); p_ar = pred_lr(w0, Z[test][:, :1])
    p_base = np.full(test.sum(), y[trv].mean())
    mlp = fit_mlp(Z[tr], y[tr], Z[val], y[val]); p_mlp = pred_mlp(mlp, Z[test])
    R = {'n_rows': int(len(y)), 'n_games': int(len(np.unique(g))), 'n_test_rows': int(test.sum()), 'n_test_games': int(len(np.unique(g[test]))),
         'draw_frac': round(float(np.mean(y == 0.5)), 3),
         'lr_observed': metrics(p_lr, y[test]), 'mlp_observed': metrics(p_mlp, y[test]), 'lr_privileged': metrics(p_pr, y[test]),
         'army_ratio_only': metrics(p_ar, y[test]), 'base_rate': metrics(p_base, y[test]),
         'reliability_lr_observed': reliability(p_lr, y[test]), 'reliability_lr_privileged': reliability(p_pr, y[test]),
         'weights_lr_observed': {FEATS[i]: round(float(w[i]), 4) for i in range(len(FEATS))}, 'bias': round(float(w[-1]), 4)}
    # AUC by game phase (observed LR)
    tt = t[test]; R['auc_by_time'] = {}
    for lo, hi in [(0, 180), (180, 300), (300, 420), (420, 9999)]:
        m = (tt >= lo) & (tt < hi)
        if m.sum() > 20: R['auc_by_time'][f'{lo}-{hi}'] = {'n': int(m.sum()), 'auc': rnd(auc(p_lr[m], y[test][m])), 'auc_priv': rnd(auc(p_pr[m], y[test][m]))}
    use_mlp = logloss(p_mlp, y[test]) < 0.99 * logloss(p_lr, y[test])
    if use_mlp: model = {'kind': 'mlp', 'W1': mlp[0].round(5).tolist(), 'b1': mlp[1].round(5).tolist(), 'w2': mlp[2].round(5).tolist(), 'b2': round(float(mlp[3][0]), 5)}
    else: model = {'kind': 'lr', 'w': [round(float(x), 5) for x in w[:-1]], 'b': round(float(w[-1]), 5)}
    model.update({'mu': [round(float(x), 5) for x in mu], 'sd': [round(float(x), 5) for x in sd], 'feats': FEATS, 'n': int(len(y))})
    R['shipped'] = model['kind']
    if out: json.dump({'model': model, 'report': R}, open(out, 'w'), indent=1)
    if rep: json.dump(R, open(rep, 'w'), indent=1)
    if not quiet: print(json.dumps(R, indent=1))
    L = R['lr_observed']; M = R['mlp_observed']; Pp = R['lr_privileged']
    print(f"rows {R['n_rows']} games {R['n_games']} | held-out {R['n_test_games']} games: LR auc {L['auc']} brier {L['brier']} logloss {L['logloss']} ece {L['ece']} | MLP auc {M['auc']} logloss {M['logloss']} | privileged LR auc {Pp['auc']} | base-rate logloss {R['base_rate']['logloss']} | shipped {model['kind']}")

if __name__ == '__main__':
    main()
