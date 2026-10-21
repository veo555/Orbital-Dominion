"""Numerically verifies every closed-form answer quoted in INTERVIEW_PREP.md (Monte Carlo / exact enumeration).
Run: python3 docs/career/verify_answers.py   (numpy only; exit 1 on any mismatch)"""
import math, itertools, numpy as np, sys
rng = np.random.default_rng(2026); bad = []
def chk(name, got, want, tol):
    ok = abs(got - want) <= tol; print(('ok   ' if ok else 'FAIL ') + '%-58s got %.5f  want %.5f' % (name, got, want)); 
    if not ok: bad.append(name)
# 1. E[#flips until HH] = 6
def flips_hh():
    n = 0; last = 0
    while True:
        n += 1; h = rng.random() < .5
        if h and last: return n
        last = h
chk('E[flips to first HH] = 6', np.mean([flips_hh() for _ in range(200000)]), 6.0, 0.06)
# 2. E[max of two U(0,1)] = 2/3 ; E[max of n] = n/(n+1)
chk('E[max of 5 uniforms] = 5/6', rng.random((400000, 5)).max(1).mean(), 5 / 6, 0.002)
# 3. reflection principle P(max_{t<=1} W > a) = 2 P(W_1 > a) (discretised; small downward bias)
a = 1.0; steps = 4000; W = np.cumsum(rng.standard_normal((20000, steps)) / math.sqrt(steps), axis=1)
p_mc = (W.max(1) > a).mean(); p_th = 2 * (1 - 0.5 * (1 + math.erf(a / math.sqrt(2))))
chk('reflection principle P(max W > 1) = 2*P(W1 > 1)', p_mc, p_th, 0.015)
# 4. Kelly: p=.6 even-money bet, f* = 2p-1 = 0.2 maximises E[log wealth]
fs = np.linspace(0.01, 0.99, 981); g = 0.6 * np.log(1 + fs) + 0.4 * np.log(1 - fs)
chk('Kelly fraction argmax of E log (p=.6) = 0.2', float(fs[g.argmax()]), 0.2, 0.002)
# 5. E[max of N iid standard normals]: Blom approximation Phi^-1((N-0.375)/(N+0.25)) (the textbook sqrt(2 ln N) formula is ~0.15 too low at N=50)
N = 50; mc = rng.standard_normal((200000, N)).max(1).mean()
def ppf(q):
    x = 0.0
    for _ in range(100): x -= (0.5 * (1 + math.erf(x / math.sqrt(2))) - q) / (math.exp(-x * x / 2) / math.sqrt(2 * math.pi))
    return x
chk('E[max of 50 normals]: Blom approximation vs MC', ppf((N - 0.375) / (N + 0.25)), mc, 0.01)
# 6. Zero-skill manager lottery: P(best of N has naive t>1.645 over T months) = 1-(0.95)^N ; N=50 -> 0.923 (matches results table 92.3%)
chk('P(at least one of 50 zero-skill managers passes a 5% one-sided test)', 1 - 0.95 ** 50, 0.9231, 0.0005)
# 7. Birthday-style: P(no match among 23) ~ 0.4927
chk('birthday problem n=23', 1 - np.prod([(365 - i) / 365 for i in range(23)]), 0.5073, 0.0001)
# 8. Monty Hall switch wins 2/3
w = 0
for _ in range(100000):
    car, pick = rng.integers(3), rng.integers(3)
    w += car != pick
chk('Monty Hall: switching wins 2/3', w / 100000, 2 / 3, 0.006)
# 9. Var of sample Sharpe: Var(SR_hat) ~ (1 + SR^2/2)/T  (Lo 2002, iid normal); T=60, SR=0.2 monthly
T, SR = 60, 0.2; x = rng.standard_normal((100000, T)) + SR; srh = x.mean(1) / x.std(1, ddof=1)
chk('Var(sample Sharpe) ~ (1+SR^2/2)/T (Lo 2002)', srh.var(), (1 + SR * SR / 2) / T, 0.0012)
# 10. Put-call parity numerical on MC prices
S, K, r, s, Tm = 100, 105, .03, .2, 1.0; z = rng.standard_normal(2_000_000); ST = S * np.exp((r - s * s / 2) * Tm + s * math.sqrt(Tm) * z)
c = math.exp(-r * Tm) * np.maximum(ST - K, 0).mean(); p = math.exp(-r * Tm) * np.maximum(K - ST, 0).mean()
chk('put-call parity C-P = S - K e^{-rT} (MC)', c - p, S - K * math.exp(-r * Tm), 0.08)
print('\nALL ANSWERS VERIFIED' if not bad else '\nMISMATCHES: %s' % bad); sys.exit(1 if bad else 0)
