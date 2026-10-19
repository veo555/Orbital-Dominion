"""Tests for manager-diligence (numpy only; no pytest needed).
   python3 tests/run_tests.py             checks
   python3 tests/run_tests.py --mutants   each check must FAIL on a deliberately broken copy of the code (the test of the tests)"""
import sys, os, math, importlib, shutil, tempfile, re
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)

def suite(pkg_root):
    sys.path.insert(0, pkg_root)
    for m in [k for k in sys.modules if k == 'diligence' or k.startswith('diligence.')]: del sys.modules[m]
    from diligence import special, metrics, inference, factors, simulate, screen
    fails = []; n = [0]
    def ok(c, m):
        n[0] += 1
        if not c: fails.append(m)
        if not MUT: print(('ok    ' if c else 'FAIL  ') + m)
    close = lambda a, b, tol=1e-6: abs(a - b) <= tol
    # --- special functions against textbook values
    ok(close(special.norm_cdf(1.959963984540054), 0.975, 1e-9), 'normal cdf at 1.96')
    ok(close(special.norm_ppf(0.975), 1.959963984540054, 1e-8) and close(special.norm_ppf(0.5), 0, 1e-12) and close(special.norm_ppf(0.001), -3.090232306167813, 1e-7), 'normal inverse cdf (3 points)')
    ok(close(special.t_two_sided_p(2.0, 10), 0.07338803477, 1e-8) and close(special.t_sf(0.0, 5), 0.5, 1e-12) and close(special.t_two_sided_p(2.228138852, 10), 0.05, 1e-6), 'Student t tail probabilities (t=2, df=10 -> 0.0734; t=2.228, df=10 -> 0.05)')
    ok(close(special.chi2_sf(3.841458820694124, 1), 0.05, 1e-9) and close(special.chi2_sf(7.814727903251179, 3), 0.05, 1e-9) and close(special.chi2_sf(0.0, 3), 1.0, 1e-12), 'chi-square tail probabilities (df 1 and 3)')
    # --- metrics on a hand-computed series
    r = np.array([0.10, -0.05, 0.02, 0.03, -0.10, 0.04])
    wealth = np.cumprod(1 + r); ok(close(metrics.max_drawdown(r), 1 - wealth[4] / wealth[0], 1e-12) and close(metrics.max_drawdown(r), 0.101737, 1e-5), 'max drawdown of a known series: peak 1.10 (after month 1) to trough 0.988 (month 5) = 10.17%')
    ok(close(metrics.max_drawdown(np.array([0.01, 0.02, 0.03])), 0.0, 1e-15), 'a monotone series has zero drawdown')
    ok(close(metrics.annual_return(np.full(12, 0.01)), 1.01 ** 12 - 1, 1e-12), 'annual return compounds')
    sr, sra = metrics.sharpe(r); ok(close(sr, r.mean() / r.std(ddof=1), 1e-12) and close(sra, sr * math.sqrt(12), 1e-12), 'Sharpe and its annualisation')
    ok(close(metrics.sharpe(r, rf=0.01)[0], (r - 0.01).mean() / (r - 0.01).std(ddof=1), 1e-12), 'Sharpe uses excess returns')
    x = np.array([1.0, 2, 3, 4, 5, 6, 7, 8.0]) / 100; ok(metrics.autocorr(x, 1) > 0.5, 'a trending series has high lag-1 autocorrelation')
    rng = np.random.default_rng(1); w = rng.standard_normal(5000) / 100; ok(abs(metrics.autocorr(w, 1)) < 0.05 and metrics.ljung_box(w)[1] > 0.01, 'white noise: no serial correlation, Ljung-Box p not small')
    sm = 0.6 * w[2:] + 0.3 * w[1:-1] + 0.1 * w[:-2]; ok(metrics.ljung_box(sm)[1] < 1e-6 and metrics.autocorr(sm, 1) > 0.3, 'smoothed returns are detected (autocorr > 0.3, Ljung-Box p < 1e-6)')
    un = metrics.unsmooth_geltner(sm); ok(abs(metrics.autocorr(un, 1)) < abs(metrics.autocorr(sm, 1)) / 2, 'Geltner unsmoothing removes most of the lag-1 autocorrelation')
    v, cv = metrics.var_cvar(rng.standard_normal(200000) / 100, 0.95); ok(close(v, 1.645 / 100, 4e-4) and cv > v and close(cv, 2.063 / 100, 6e-4), 'VaR/CVaR of a normal sample: 1.645 and 2.063 sigma')
    xs = np.array([0.02, -0.01, 0.015, 0.03, -0.02, 0.01, 0.005, -0.015, 0.02, 0.0]); nn = len(xs); rho = [metrics.autocorr(xs, k) for k in (1, 2, 3)]; qref = nn * (nn + 2) * sum(rho[k - 1] ** 2 / (nn - k) for k in (1, 2, 3))
    ok(close(metrics.ljung_box(xs, 3)[0], qref, 1e-12) and close(metrics.ljung_box(xs, 3)[1], special.chi2_sf(qref, 3), 1e-12), 'Ljung-Box statistic equals n(n+2) sum rho_k^2/(n-k) on a fixed series')
    # --- PSR / MinTRL / DSR
    g = np.random.default_rng(3); a = 0.01 + 0.04 * g.standard_normal(60); m, s, g3, g4 = metrics.moments(a); sr_hat = m / s
    ok(close(inference.psr(a, sr_hat), 0.5, 1e-9), 'PSR at the sample Sharpe itself is 0.5')
    ok(inference.psr(a, 0.0) > inference.psr(a, sr_hat / 2) > inference.psr(a, sr_hat), 'PSR decreases as the benchmark Sharpe rises')
    n_star = inference.min_track_record(a, 0.0, 0.95); b = a[:1].repeat(1)  # self-consistency: with n = MinTRL observations of this distribution the PSR equals the confidence level
    z = special.norm_ppf(0.95); psr_at = special.norm_cdf(sr_hat * math.sqrt(n_star - 1) / math.sqrt(inference.sharpe_variance_factor(sr_hat, g3, g4))); ok(close(psr_at, 0.95, 1e-9), 'MinTRL is consistent with PSR (PSR at n = MinTRL is 95%)')
    ok(inference.min_track_record(a, sr_hat + 0.1) == float('inf'), 'MinTRL is infinite when the Sharpe does not beat the benchmark')
    ok(close(inference.sharpe_variance_factor(0.2, 0.0, 3.0), 1 + 0.2 ** 2 / 2, 1e-12) and inference.sharpe_variance_factor(0.2, -1.0, 3.0) > inference.sharpe_variance_factor(0.2, 1.0, 3.0), 'Sharpe variance factor: normal case 1+SR^2/2; negative skew raises it')
    e5 = inference.expected_max_sharpe(100, 0.01); e500 = inference.expected_max_sharpe(500, 0.01)
    gam = 0.5772156649015329; exact100 = 0.1 * ((1 - gam) * special.norm_ppf(0.99) + gam * special.norm_ppf(1 - 1 / (100 * math.e)))
    ok(close(e5, exact100, 1e-12) and close(e5, 0.25303, 2e-4) and e500 > e5 and inference.expected_max_sharpe(1, 1.0) == 0.0, 'expected maximum Sharpe of 100 zero-skill trials (variance 0.01) = 0.1 x 2.5303 (Bailey & Lopez de Prado 2014 formula) and grows with the number of trials')
    ok(inference.dsr(a, 100, 0.01) < inference.psr(a, 0.0) and close(inference.dsr(a, 1, 0.01), inference.psr(a, 0.0), 1e-12), 'DSR deflates PSR for many trials and equals PSR for one')
    # --- bootstrap
    idx = inference.stationary_bootstrap_indices(20000, 4, np.random.default_rng(0)); steps = np.diff(idx) % 20000
    ok(close(np.mean(steps == 1), 1 - 1 / 4 + 1 / (4 * 20000), 0.02), 'stationary bootstrap: blocks continue with probability 1 - 1/mean_block')
    cover = 0; trials = 150; true_sr = 0.5 / math.sqrt(12) / 0.04 * 0.04  # true monthly Sharpe 0.1443...
    mu, sd = 0.005, 0.04; true_sr_ann = mu / sd * math.sqrt(12)
    for k in range(trials):
        x = mu + sd * np.random.default_rng(100 + k).standard_normal(60); lo, hi = inference.bootstrap_sharpe_ci(x, reps=300, seed=k); cover += lo <= true_sr_ann <= hi
    ok(0.80 <= cover / trials <= 0.99, 'bootstrap 95%% CI for the annual Sharpe covers the truth %.0f%% of the time (60 months, 150 trials; expected a little under 95%%)' % (100 * cover / trials))
    # --- multiple testing
    p = np.array([0.001, 0.008, 0.039, 0.041, 0.042, 0.06, 0.074, 0.205, 0.212, 0.216])
    ok(list(inference.benjamini_hochberg(p, 0.05)) == [True, True, False, False, False, False, False, False, False, False] or list(inference.benjamini_hochberg(p, 0.05)).count(True) == 2, 'Benjamini-Hochberg on a textbook-style example rejects the two smallest at q = 5%')
    ok(list(inference.holm(p, 0.05)) == [True] + [False] * 9 and list(inference.holm(np.array([0.001, 0.004, 0.2]), 0.05)) == [True, True, False], 'Holm: 0.001 <= 0.05/10 is rejected but 0.008 > 0.05/9 stops it; for [0.001, 0.004, 0.2] the two smallest are rejected (0.004 <= 0.05/2)')
    ok(list(inference.holm(np.array([0.01, 0.02, 0.03]), 0.05)) == [True, True, True] and list(inference.holm(np.array([0.03, 0.01, 0.02]), 0.05)) == [True, True, True], 'Holm step-down: [0.01, 0.02, 0.03] are all rejected at 5% (thresholds 0.05/3, 0.05/2, 0.05/1), in any input order')
    ok(inference.holm(np.array([0.2, 0.3]), 0.05).sum() == 0 and inference.benjamini_hochberg(np.array([0.9, 0.8]), 0.1).sum() == 0, 'nothing is rejected when nothing is significant')
    # --- HAC regression
    gg = np.random.default_rng(5); T = 240; f = gg.standard_normal(T) * 0.03; e = np.zeros(T); u = gg.standard_normal(T) * 0.01
    for i in range(1, T): e[i] = 0.5 * e[i - 1] + u[i]
    y = 0.002 + 0.8 * f + e; h = factors.ols_hac(y, f)
    ok(close(h['coef'][1], 0.8, 0.08) and close(h['alpha'], 0.002, 0.003), 'OLS recovers the factor beta (0.8) and alpha (0.002)')
    def nw_reference(y_, x_, L_):   # independent, loop-based Newey-West covariance for [1, x]
        n_ = len(y_); Zr = np.column_stack([np.ones(n_), x_]); bb = np.linalg.solve(Zr.T @ Zr, Zr.T @ y_); ee = y_ - Zr @ bb; Sr = np.zeros((2, 2))
        for t_ in range(n_): Sr += ee[t_] ** 2 * np.outer(Zr[t_], Zr[t_])
        for l_ in range(1, L_ + 1):
            for t_ in range(l_, n_): Sr += (1 - l_ / (L_ + 1.0)) * ee[t_] * ee[t_ - l_] * (np.outer(Zr[t_], Zr[t_ - l_]) + np.outer(Zr[t_ - l_], Zr[t_]))
        Ai = np.linalg.inv(Zr.T @ Zr); return np.sqrt(np.diag(Ai @ Sr @ Ai * (n_ / (n_ - 2.0))))
    ok(np.allclose(h['se'], nw_reference(y, f, h['lags']), rtol=1e-10), 'Newey-West standard errors equal an independent loop-based reference implementation (Bartlett weights, small-sample factor)')
    Z = np.column_stack([np.ones(T), f]); b = np.linalg.solve(Z.T @ Z, Z.T @ y); res = y - Z @ b; s2 = res @ res / (T - 2); naive = math.sqrt(s2 * np.linalg.inv(Z.T @ Z)[0, 0])
    ok(h['se'][0] > naive * 1.2, 'with AR(1) residuals the Newey-West alpha standard error is clearly larger than the naive one (%.5f vs %.5f)' % (h['se'][0], naive))
    ok(h['lags'] == int(math.floor(4 * (T / 100) ** (2 / 9))) and 0 <= h['alpha_p'] <= 1 and h['r2'] > 0.5, 'Newey-West lag rule and sane p-value / R^2')
    ok(close(factors.ols_hac(0.01 + 0.03 * np.random.default_rng(9).standard_normal(120), np.random.default_rng(10).standard_normal(120), lags=0)['se'][0], 0.03 / math.sqrt(120), 0.004), 'with 0 lags the standard error of the mean matches sigma/sqrt(n)')
    C = np.array([[0.04, 0.01], [0.01, 0.01]]); wv = np.array([0.5, 0.5]); rc = factors.risk_contributions(wv, C)
    ok(close(rc.sum(), 1.0, 1e-12) and rc[0] > rc[1] and 1 < factors.diversification_ratio(wv, C) < 2 and close(factors.inverse_vol_weights(C).sum(), 1, 1e-12) and factors.inverse_vol_weights(C)[1] > 0.5, 'risk contributions sum to 1; diversification ratio in (1,2); inverse-vol overweights the low-vol asset')
    # --- the lucky-manager problem (the point of the package)
    best_sr, best_psr, best_dsr = [], [], []
    for s in range(60):
        R, tr = simulate.simulate_managers(100, 36, 0, seed=1000 + s); srs = np.array([metrics.sharpe(x)[0] for x in R]); i = int(np.argmax(srs)); var = float(np.var(srs, ddof=1))
        best_sr.append(srs[i] * math.sqrt(12)); best_psr.append(inference.psr(R[i], 0.0)); best_dsr.append(inference.dsr(R[i], 100, var))
    ok(np.mean(best_sr) > 1.0, 'among 100 managers with ZERO skill the best one shows a mean annual Sharpe of %.2f (selection bias)' % np.mean(best_sr))
    ok(np.mean(np.array(best_psr) > 0.95) > 0.6, 'the naive PSR is fooled: it calls the best zero-skill manager "significant" in %.0f%% of universes' % (100 * np.mean(np.array(best_psr) > 0.95)))
    ok(np.mean(np.array(best_dsr) > 0.95) < 0.2, 'the deflated Sharpe ratio is not fooled: %.0f%% of universes (nominal 5%%)' % (100 * np.mean(np.array(best_dsr) > 0.95)))
    tp = fp = 0; skilled_total = 0; trials = 20
    for s in range(trials):
        R, tr = simulate.simulate_managers(100, 60, 20, 1.2, seed=2000 + s); rows = screen.screen(R, fdr=0.10)
        rej = np.array([r['bh_significant'] for r in rows]); tp += int(np.sum(rej & tr['skilled'])); fp += int(np.sum(rej & ~tr['skilled'])); skilled_total += 20
    fdp = fp / max(1, tp + fp); ok(fdp < 0.20 and tp / skilled_total > 0.2, 'Benjamini-Hochberg screening at q = 10%%: false discovery proportion %.1f%%, power %.0f%% (20 skilled of 100, 60 months)' % (100 * fdp, 100 * tp / skilled_total))
    R, tr = simulate.simulate_managers(60, 48, 0, smooth_fraction=0.5, seed=77); rows = screen.screen(R)
    flagged = np.array([any('serial correlation' in w for w in r['warnings']) for r in rows]); ok(flagged[tr['smoothed']].mean() > 0.6 and flagged[~tr['smoothed']].mean() < 0.2, 'screening flags smoothed managers (%.0f%% of smoothed vs %.0f%% of others)' % (100 * flagged[tr['smoothed']].mean(), 100 * flagged[~tr['smoothed']].mean()))
    R1, _ = simulate.simulate_managers(5, 24, 0, seed=3); R2, _ = simulate.simulate_managers(5, 24, 0, seed=3); ok(np.array_equal(R1, R2) and not np.array_equal(R1, simulate.simulate_managers(5, 24, 0, seed=4)[0]), 'simulations are reproducible from the seed')
    try: metrics.sharpe(np.array([0.1, 0.1, 0.1]))
    except Exception: ok(True, 'zero-volatility input is rejected with an error')
    else: ok(False, 'zero-volatility input is rejected with an error')
    try: metrics.sharpe(np.array([0.1, np.nan, 0.2, 0.3])); ok(False, 'NaN input is rejected')
    except ValueError: ok(True, 'NaN input is rejected')
    sys.path.remove(pkg_root)
    return fails, n[0]

MUT = '--mutants' in sys.argv
MUTANTS = [
    ('Sharpe annualisation uses the wrong factor', 'metrics.py', 'sr * np.sqrt(periods)', 'sr * periods'),
    ('drawdown measured from the start, not the peak', 'metrics.py', 'peak = np.maximum.accumulate(np.concatenate([[1.0], w]))[1:]', 'peak = np.ones_like(w)'),
    ('PSR ignores skewness and kurtosis', 'inference.py', 'return 1.0 - skew * sr + (kurt - 1.0) / 4.0 * sr * sr', 'return 1.0 + sr * sr / 2.0'),
    ('MinTRL uses the wrong quantile', 'inference.py', 'z = norm_ppf(confidence)', 'z = norm_ppf(0.5 + confidence / 4)'),
    ('DSR benchmark ignores the number of trials', 'inference.py', 'return psr(r, expected_max_sharpe(n_trials, sr_variance), rf)', 'return psr(r, 0.0, rf)'),
    ('expected max Sharpe loses the Euler-Mascheroni mix', 'inference.py', '(1 - EULER_GAMMA) * norm_ppf(1 - 1.0 / n_trials) + EULER_GAMMA * norm_ppf(1 - 1.0 / (n_trials * math.e))', 'norm_ppf(1 - 1.0 / n_trials)'),
    ('bootstrap blocks never continue', 'inference.py', 'idx[i] = starts[i] if jumps[i] else (idx[i - 1] + 1) % n', 'idx[i] = starts[i]'),
    ('Benjamini-Hochberg uses the Bonferroni threshold', 'inference.py', 'thresh = q * (np.arange(1, m + 1) / m)', 'thresh = np.full(m, q / m)'),
    ('Holm uses a fixed alpha/m', 'inference.py', 'if p[i] <= alpha / (m - rank): rej[i] = True', 'if p[i] <= alpha / m: rej[i] = True'),
    ('HAC ignores autocorrelation', 'factors.py', 'for l in range(1, L + 1):', 'for l in range(1, 1):'),
    ('HAC without Bartlett weights', 'factors.py', 'w = 1.0 - l / (L + 1.0)', 'w = 1.0'),
    ('Student t tail replaced by the normal', 'special.py', 'x = df / (df + t * t); p = 0.5 * betainc(df / 2.0, 0.5, x)', 'p = 0.5 * math.erfc(abs(t) / math.sqrt(2.0))'),
    ('Ljung-Box divides by n instead of n-k', 'metrics.py', 'autocorr(r, k) ** 2 / (n - k)', 'autocorr(r, k) ** 2 / n'),
    ('simulation: smoothing never applied', 'simulate.py', 'if s.any(): obs[s] =', 'if False: obs[s] ='),
    ('screen: no warnings for serial correlation', 'screen.py', "if s['ljung_box_p'] < 0.05 and s['autocorr1'] > 0:", 'if False:'),
]
if not MUT:
    f, n = suite(ROOT); print('\n%d checks passed, %d failed' % (n - len(f), len(f)))
    if f: print('FAILED:\n  ' + '\n  '.join(f)); sys.exit(1)
    print('ALL MANAGER-DILIGENCE CHECKS PASSED')
else:
    bad = 0
    for name, fn, old, new in MUTANTS:
        tmp = tempfile.mkdtemp(); shutil.copytree(os.path.join(ROOT, 'diligence'), os.path.join(tmp, 'diligence'))
        p = os.path.join(tmp, 'diligence', fn); src = open(p).read()
        if old not in src: print('MUTATION DID NOT APPLY: ' + name); sys.exit(2)
        open(p, 'w').write(src.replace(old, new, 1))
        try: f, n = suite(tmp); caught = len(f) > 0
        except Exception: caught = True
        shutil.rmtree(tmp); print(('ok    ' if caught else 'NOT CAUGHT ') + 'mutant: ' + name)
        if not caught: bad += 1
    if bad: print('%d MUTANT(S) NOT CAUGHT' % bad); sys.exit(1)
    print('ALL MUTANTS CAUGHT')
