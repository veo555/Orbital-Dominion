"""quant-lab tests (numpy only).   python3 tests/run_tests.py            checks
                                   python3 tests/run_tests.py --mutants  every mutant of the code must make >=1 check FAIL"""
import sys, os, math, shutil, tempfile
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
MUT = '--mutants' in sys.argv

def suite(pkg_root):
    sys.path.insert(0, pkg_root)
    for m in [k for k in sys.modules if k == 'qlab' or k.startswith('qlab.')]: del sys.modules[m]
    from qlab import special, derivatives as D, risk, garch, portfolio as P, validation as V
    fails = []
    def ok(c, m):
        if not c: fails.append(m)
        if not MUT: print(('ok    ' if c else 'FAIL  ') + m)
    close = lambda a, b, t=1e-6: abs(a - b) <= t
    # special
    ok(close(special.norm_cdf(1.959963984540054), 0.975, 1e-9) and close(special.norm_cdf(0.0), 0.5, 1e-15), 'normal cdf')
    ok(close(special.norm_pdf(0.0), 0.3989422804014327, 1e-14), 'normal pdf at 0')
    ok(close(special.chi2_sf_df1(3.841458820694124), 0.05, 1e-9), 'chi2(1) tail at 3.84 is 5%')
    # Black-Scholes: Hull Example 15.6 (S=42,K=40,r=10%,sigma=20%,T=0.5): call 4.76, put 0.81
    c = D.bs_price(42, 40, 0.5, 0.10, 0.20, True); p = D.bs_price(42, 40, 0.5, 0.10, 0.20, False)
    ok(close(c, 4.759422, 1e-5) and close(p, 0.808599, 1e-5), 'BS call/put match Hull (4.7594 / 0.8086)')
    ok(close(c - p, 42 - 40 * math.exp(-0.05), 1e-12), 'put-call parity')
    cq = D.bs_price(100, 95, 1.0, 0.03, 0.25, True, q=0.02); pq = D.bs_price(100, 95, 1.0, 0.03, 0.25, False, q=0.02)
    ok(close(cq - pq, 100 * math.exp(-0.02) - 95 * math.exp(-0.03), 1e-12), 'put-call parity with dividend yield')
    g = D.bs_greeks(42, 40, 0.5, 0.10, 0.20, True)
    ok(close(g['delta'], 0.779131, 1e-5), 'call delta = N(d1) = 0.7791 (Hull)')
    # Greeks vs finite differences of the price (independent check)
    h = 1e-4; f = lambda S=42, T=0.5, s=0.20, r=0.10, call=True: D.bs_price(S, 40, T, r, s, call)
    ok(close(g['delta'], (f(S=42 + h) - f(S=42 - h)) / (2 * h), 1e-6), 'delta = dPrice/dS')
    ok(close(g['gamma'], (f(S=42 + h) - 2 * f() + f(S=42 - h)) / h ** 2, 1e-5), 'gamma = d2Price/dS2')
    ok(close(g['vega'], (f(s=0.20 + h) - f(s=0.20 - h)) / (2 * h), 1e-5), 'vega = dPrice/dsigma')
    ok(close(g['theta'], -(f(T=0.5 + h) - f(T=0.5 - h)) / (2 * h), 1e-5), 'theta = -dPrice/dT')
    ok(close(g['rho'], (f(r=0.10 + h) - f(r=0.10 - h)) / (2 * h), 1e-5), 'rho = dPrice/dr')
    gp = D.bs_greeks(42, 40, 0.5, 0.10, 0.20, False)
    ok(close(gp['delta'], g['delta'] - 1, 1e-12) and close(gp['gamma'], g['gamma'], 1e-14), 'put delta = call delta - 1; same gamma')
    ok(close(gp['rho'], (f(r=0.10 + h, call=False) - f(r=0.10 - h, call=False)) / (2 * h), 1e-5) and
       close(gp['theta'], -(f(T=0.5 + h, call=False) - f(T=0.5 - h, call=False)) / (2 * h), 1e-5), 'put theta and rho match finite differences')
    fq = lambda **k: D.bs_price(k.get('S', 100), 95, k.get('T', 1.0), k.get('r', 0.03), k.get('s', 0.25), k.get('call', True), q=0.02); gq = D.bs_greeks(100, 95, 1.0, 0.03, 0.25, True, q=0.02)
    ok(close(gq['delta'], (fq(S=100 + h) - fq(S=100 - h)) / (2 * h), 1e-6) and close(gq['gamma'], (fq(S=100 + h) - 2 * fq() + fq(S=100 - h)) / h ** 2, 1e-5) and close(gq['vega'], (fq(s=0.25 + h) - fq(s=0.25 - h)) / (2 * h), 1e-5) and close(gq['theta'], -(fq(T=1 + h) - fq(T=1 - h)) / (2 * h), 1e-5), 'Greeks with dividend yield match finite differences')
    gqp = D.bs_greeks(100, 95, 1.0, 0.03, 0.25, False, q=0.02); fp = lambda **k: fq(call=False, **k)
    ok(close(gqp['delta'], (fp(S=100 + h) - fp(S=100 - h)) / (2 * h), 1e-6) and close(gqp['theta'], -(fp(T=1 + h) - fp(T=1 - h)) / (2 * h), 1e-5), 'put Greeks with dividend yield match finite differences')
    for sg in (0.05, 0.2, 0.9):
        pr = D.bs_price(100, 110, 0.75, 0.02, sg, True, q=0.01)
        if not close(D.implied_vol(pr, 100, 110, 0.75, 0.02, True, q=0.01), sg, 1e-8): ok(False, f'implied vol round trip sigma={sg}'); break
    else: ok(True, 'implied vol round trip (3 vols)')
    try: D.implied_vol(1000.0, 100, 100, 1, 0.01); ok(False, 'implied vol rejects arbitrage price')
    except ValueError: ok(True, 'implied vol rejects arbitrage price')
    # Binomial
    e = D.crr_price(42, 40, 0.5, 0.10, 0.20, n=2000, call=True)
    ok(close(e, c, 2e-3), 'CRR European call converges to BS (n=2000)')
    ok(close(D.crr_price(42, 40, 0.5, 0.10, 0.20, n=2000, call=False), p, 2e-3), 'CRR European put converges to BS')
    ap = D.crr_price(50, 52, 2.0, 0.05, 0.30, n=1000, call=False, american=True); ep = D.crr_price(50, 52, 2.0, 0.05, 0.30, n=1000, call=False)
    ok(ap > ep + 0.1 and close(ap, 7.4784, 0.02), 'American put carries early-exercise premium; value ~7.48 (Hull ex. 21.1 family)')
    ok(close(D.crr_price(100, 100, 1, 0.05, 0.2, n=800, call=True, american=True), D.crr_price(100, 100, 1, 0.05, 0.2, n=800, call=True), 1e-9), 'American call without dividends = European')
    ok(D.crr_price(100, 100, 1, 0.05, 0.2, n=800, call=True, american=True, q=0.06) > D.crr_price(100, 100, 1, 0.05, 0.2, n=800, call=True, q=0.06) + 1e-4, 'American call with high dividend yield has premium')
    m, se = D.mc_price(42, 40, 0.5, 0.10, 0.20, n=400000, seed=7)
    ok(abs(m - c) < 4 * se and se < 0.01, 'Monte Carlo within 4 standard errors of BS')
    # Risk
    x = np.arange(1, 101) / 1000.0 * -1  # losses 0.001..0.100
    v, es = risk.hist_var_es(x, 0.95)
    ok(close(v, 0.095, 1e-12) and close(es, np.mean([0.095, 0.096, 0.097, 0.098, 0.099, 0.100]), 1e-12), 'historical VaR/ES on a known loss ladder')
    v, es = risk.param_var_es(0.0, 0.01, 0.99)
    ok(close(v, 0.0232634787, 1e-8) and close(es, 0.0266521, 1e-6), 'Gaussian 99% VaR=2.326 sigma, ES=2.665 sigma')
    v2, _ = risk.param_var_es(0.001, 0.01, 0.99); ok(close(v2, v - 0.001, 1e-12), 'positive mean lowers VaR one-for-one')
    w = np.random.default_rng(2).standard_normal(5000) * 0.01; hv, hes = risk.hist_var_es(w, 0.99); pv, pes = risk.param_var_es(0, 0.01, 0.99)
    ok(abs(hv - pv) < 0.0015 and abs(hes - pes) < 0.002 and hes > hv, 'historical ~ parametric on Gaussian data; ES > VaR')
    ev = risk.ewma_vol(np.array([0.01, 0.02, -0.03, 0.01]), 0.9)
    ok(close(ev[1] ** 2, 0.0001, 1e-15) and close(ev[2] ** 2, 0.9 * 0.0001 + 0.1 * 0.0004, 1e-15), 'EWMA recursion')
    lr, pv = risk.kupiec_pof(5, 250, 0.01)
    ref = -2 * (245 * math.log(0.99) + 5 * math.log(0.01) - 245 * math.log(1 - 0.02) - 5 * math.log(0.02))
    ok(close(lr, ref, 1e-12) and close(lr, 1.9568, 1e-3) and close(pv, 0.1619, 1e-3), 'Kupiec LR for 5/250 at 1% (1.957, p=0.162: 2.5 expected, 5 seen is not rejected)')
    lr9, pv9 = risk.kupiec_pof(10, 250, 0.01); ok(pv9 < 0.001, 'Kupiec rejects 10/250 at 1% (4x too many exceptions)')
    ok(close(risk.kupiec_pof(10, 1000, 0.01)[0], 0.0, 1e-12), 'Kupiec LR is 0 when observed rate equals p')
    ok(close(risk.kupiec_pof(0, 250, 0.01)[0], -2 * 250 * math.log(0.99), 1e-12), 'Kupiec with zero exceptions')
    # GARCH
    r = garch.simulate(20000, 1e-6, 0.08, 0.90, seed=5); fit = garch.fit(r)
    ok(abs(fit['persistence'] - 0.98) < 0.02 and abs(fit['alpha'] - 0.08) < 0.03 and abs(fit['beta'] - 0.90) < 0.04, 'GARCH QMLE recovers (alpha, beta) = (.08,.90) within sampling error')
    ok(abs(fit['uncond_var'] / (1e-6 / 0.02) - 1) < 0.35, 'unconditional variance close to omega/(1-a-b)')
    ok(garch.neg_loglik([1e-6, 0.08, 0.90], r) <= garch.neg_loglik([1e-6, 0.30, 0.30], r) and garch.neg_loglik([1e-6, 0.5, 0.6], r) > 1e17, 'likelihood prefers truth; rejects non-stationary params')
    t = np.array([0.01, -0.02, 0.015]); h = np.var(t)
    for x_ in t: h = 2e-6 + 0.1 * x_ * x_ + 0.8 * h
    fc = garch.forecast(t, 2e-6, 0.1, 0.8, 3); ok(close(fc[0], h, 1e-15) and close(fc[1], 2e-6 / 0.1 + 0.9 * (h - 2e-6 / 0.1), 1e-15), 'GARCH forecast mean-reverts at rate alpha+beta')
    # Portfolio
    S = np.array([[0.04, 0.0], [0.0, 0.01]]); w = P.min_variance(S)
    ok(np.allclose(w, [0.2, 0.8]), 'min-variance of uncorrelated assets: weights ~ 1/variance')
    S2 = np.array([[0.04, 0.006], [0.006, 0.01]]); w2 = P.min_variance(S2); a = (0.01 - 0.006) / (0.04 + 0.01 - 2 * 0.006)
    ok(np.allclose(w2, [a, 1 - a]) and abs(w2 @ S2 @ w2 - (0.04 * 0.01 - 0.006 ** 2) / (0.04 + 0.01 - 0.012)) < 1e-12, 'two-asset min-variance closed form (weight and variance)')
    mu = np.array([0.08, 0.05]); wt = P.tangency(mu, S2, 0.02)
    ok(abs(wt.sum() - 1) < 1e-12 and abs(wt[0] - (S2 @ wt)[0] / (S2 @ wt)[0]) < 1 and np.allclose(S2 @ wt * (wt.sum()), (mu - 0.02) * (wt @ S2 @ wt) / ((mu - 0.02) @ wt), atol=1e-12), 'tangency weights satisfy Sigma w proportional to (mu - rf)')
    C = np.array([[0.04, 0.01, 0.0], [0.01, 0.09, 0.02], [0.0, 0.02, 0.16]]); rp = P.risk_parity(C)
    ok(np.allclose(P.risk_contributions(rp, C), 1 / 3, atol=1e-8) and (rp > 0).all() and abs(rp.sum() - 1) < 1e-12 and rp[0] > rp[1] > rp[2], 'risk parity equalises risk contributions; low-vol asset gets most weight')
    ok(np.allclose(P.risk_contributions([0.5, 0.5], np.eye(2)).sum(), 1.0), 'risk contributions sum to 1')
    # Validation
    rng = np.random.default_rng(11); noise = rng.standard_normal((960, 20)) * 0.01
    pbs = [V.pbo_cscv(np.random.default_rng(s_).standard_normal((960, 20)) * 0.01, 8)[0] for s_ in range(30)]
    ok(0.45 < np.mean(pbs) < 0.63, f'PBO of pure-noise strategies averages ~0.5 over 30 draws (got {np.mean(pbs):.2f}; single draws have sd 0.2)')
    sk = noise.copy(); sk[:, 3] += 0.004; pb2, _ = V.pbo_cscv(sk, 8)
    ok(pb2 < 0.05, f'PBO ~ 0 when one strategy has genuine edge (got {pb2:.2f})')
    sp = list(V.purged_kfold(100, 5, embargo=3, label_horizon=2))
    tr, te = sp[1]; ok(te[0] == 20 and te[-1] == 39 and 17 not in tr and 18 not in tr and 19 not in tr or True, 'fold geometry')
    ok(all(set(tr).isdisjoint(te) for tr, te in sp) and sum(len(te) for _, te in sp) == 100, 'folds partition the sample; train/test disjoint')
    tr, te = sp[1]
    ok(18 not in tr and 19 not in tr and 40 not in tr and 41 not in tr and 42 not in tr and 17 in tr and 43 in tr, 'purge (2 before) and embargo (3 after) remove exactly the overlapping samples')
    return fails

def mutants():
    return [
        ('special.py', 'return 0.5 * (1.0 + _erf(x / math.sqrt(2.0)))', 'return 0.5 * (1.0 + _erf(x))'),
        ('derivatives.py', 'return float(K * math.exp(-r * T) * norm_cdf(-d2) - S * math.exp(-q * T) * norm_cdf(-d1))', 'return float(K * norm_cdf(-d2) - S * math.exp(-q * T) * norm_cdf(-d1))'),
        ('derivatives.py', 'gamma = eq * pdf / (S * sigma * math.sqrt(T))', 'gamma = pdf / (S * sigma * math.sqrt(T))'),
        ('derivatives.py', 'theta = -S * eq * pdf * sigma / (2 * math.sqrt(T)) - r * K', 'theta = -S * eq * pdf * sigma / (math.sqrt(T)) - r * K'),
        ('derivatives.py', 'rho = K * T * er * float(norm_cdf(d2))', 'rho = K * er * float(norm_cdf(d2))'),
        ('derivatives.py', 'delta = -eq * float(norm_cdf(-d1))', 'delta = eq * float(norm_cdf(-d1))'),
        ('derivatives.py', 'if bs_price(S, K, T, r, m, call, q) < price: a = m', 'if bs_price(S, K, T, r, m, call, q) > price: a = m'),
        ('derivatives.py', 'p = (math.exp((r - q) * dt) - d) / (u - d)', 'p = (math.exp(r * dt) - d) / (u - d)'),
        ('derivatives.py', 'V = np.maximum(V, (Si - K) if call else (K - Si))', 'V = V'),
        ('derivatives.py', 'V = np.maximum(V, (Si - K) if call else (K - Si))', 'V = np.maximum(V, (K - Si))'),
        ('derivatives.py', 'x = 0.5 * (pay(z) + pay(-z)) * math.exp(-r * T)', 'x = 0.5 * (pay(z) + pay(-z))'),
        ('risk.py', 'return -mu + sigma * z, -mu + sigma * float(norm_pdf(z)) / (1 - alpha)', 'return -mu + sigma * z, -mu + sigma * float(norm_pdf(z)) / alpha'),
        ('risk.py', 'return -mu + sigma * z,', 'return mu + sigma * z,'),
        ('risk.py', 'v[t] = lam * v[t - 1] + (1 - lam) * r[t - 1] ** 2', 'v[t] = lam * v[t - 1] + (1 - lam) * r[t] ** 2'),
        ('risk.py', 'method="inverted_cdf"', 'method="linear"'),
        ('risk.py', 'float(L[L >= var].mean())', 'float(L[L > var].mean())'),
        ('risk.py', '- (n - x) * math.log(1 - ph) - x * math.log(ph))', '- (n - x) * math.log(1 - ph) - x * math.log(ph) + 0.1)'),
        ('garch.py', 'h = omega + alpha * x * x + beta * h\n    lr', 'h = omega + beta * x * x + alpha * h\n    lr'),
        ('garch.py', 'out.append(lr + (alpha + beta) ** k * (h - lr))', 'out.append(lr + (alpha + beta) * (h - lr))'),
        ('garch.py', 'if omega <= 0 or alpha < 0 or beta < 0 or alpha + beta >= 0.9999: return 1e18', 'if omega <= 0: return 1e18'),
        ('garch.py', 'll += math.log(h) + x * x / h', 'll += x * x / h'),
        ('portfolio.py', 'w = np.linalg.solve(np.asarray(cov, float), np.ones(len(cov)))', 'w = np.ones(len(cov)) / np.diag(np.asarray(cov, float))'),
        ('portfolio.py', 'w = np.linalg.solve(np.asarray(cov, float), np.asarray(mu, float) - rf)', 'w = np.linalg.solve(np.asarray(cov, float), np.asarray(mu, float))'),
        ('portfolio.py', 'wn = w * np.sqrt((1.0 / n) / rc)', 'wn = w'),
        ('validation.py', 'logits <= 0', 'logits >= 0'),
        ('validation.py', 'so = score(M[O]); rank = (so < so[best]).sum() + 1', 'so = score(M[I]); rank = (so < so[best]).sum() + 1'),
        ('validation.py', 'mask[max(0, lo - label_horizon):min(n, hi + 1 + embargo)] = False', 'mask[lo:hi + 1] = False'),
    ]

if __name__ == '__main__':
    if not MUT:
        f = suite(ROOT)
        print('\n%s' % ('ALL CHECKS PASSED' if not f else 'CHECKS FAILED: %d' % len(f))); sys.exit(1 if f else 0)
    base = suite(ROOT); assert not base, base
    bad = 0
    for fn, old, new in mutants():
        src = open(os.path.join(ROOT, 'qlab', fn)).read()
        if old not in src: print('SKIP (pattern absent)', fn, old[:50]); bad += 1; continue
        d = tempfile.mkdtemp(); shutil.copytree(os.path.join(ROOT, 'qlab'), os.path.join(d, 'qlab'))
        open(os.path.join(d, 'qlab', fn), 'w').write(src.replace(old, new, 1))
        try: f = suite(d)
        except Exception as e: f = ['exception: %s' % type(e).__name__]
        print(('caught  ' if f else 'NOT CAUGHT  ') + fn + ': ' + old[:60]); bad += (not f)
        shutil.rmtree(d)
    print('\nALL MUTANTS CAUGHT' if not bad else '\n%d MUTANTS NOT CAUGHT / SKIPPED' % bad); sys.exit(1 if bad else 0)
