"""The lucky-manager experiment: how often does 'pick the best Sharpe' find skill that is not there, and what do PSR / DSR / BH say?
   python3 experiments/lucky_manager.py [universes]       (default 300; writes results/lucky_manager.md; seeds are fixed, so the output is reproducible)
All managers here are SIMULATED with known truth. Nothing in this file uses real fund data."""
import sys, os, math
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from diligence import simulate, metrics, inference, screen

U = int(sys.argv[1]) if len(sys.argv) > 1 else 300
out = ['# Lucky-manager experiment (simulated, reproducible)\n', 'Zero-skill universes: every manager has a true Sharpe of exactly 0 (8%% annual vol, normal returns). %d universes per row. '
       '"Naive PSR > 95%%" = the best-Sharpe manager looks significant when judged alone; "DSR > 95%%" = it still does after deflating for the number of candidates. '
       'A correct test at 5%% should be fooled about 5%% of the time.\n' % U,
       '| managers N | months T | mean best annual Sharpe | naive PSR > 95% | DSR > 95% |\n|---|---|---|---|---|']
for N in (10, 50, 100, 500):
    for T in (36, 60):
        best, naive, deflated = [], 0, 0
        for s in range(U):
            R, _ = simulate.simulate_managers(N, T, 0, seed=10_000 * N + 100 * T + s); sr = np.array([metrics.sharpe(x)[0] for x in R]); i = int(np.argmax(sr)); var = float(np.var(sr, ddof=1))
            best.append(sr[i] * math.sqrt(12)); naive += inference.psr(R[i], 0.0) > 0.95; deflated += inference.dsr(R[i], N, var) > 0.95
        out.append('| %d | %d | %.2f | %.1f%% | %.1f%% |' % (N, T, np.mean(best), 100 * naive / U, 100 * deflated / U))
out += ['', '## Screening a mixed universe with Benjamini-Hochberg (q = 10%)', '',
        '100 managers, 20 truly skilled (true annual Sharpe 1.0), 80 with none; %d universes per row.\n' % (U // 3),
        '| months T | managers flagged | false discovery proportion | share of skilled found (power) |\n|---|---|---|---|']
for T in (36, 60, 120):
    fl = fp = tp = 0
    for s in range(U // 3):
        R, tr = simulate.simulate_managers(100, T, 20, 1.0, seed=7_000_000 + 1000 * T + s); rej = np.array([r['bh_significant'] for r in screen.screen(R, fdr=0.10)])
        fl += rej.sum(); fp += int(np.sum(rej & ~tr['skilled'])); tp += int(np.sum(rej & tr['skilled']))
    out.append('| %d | %.1f per universe | %.1f%% | %.0f%% |' % (T, fl / (U // 3), 100 * fp / max(1, fl), 100 * tp / ((U // 3) * 20)))
out += ['', '## Reading it', '',
        '* The best of many zero-skill managers has a high Sharpe by construction, and the more candidates, the higher: judged alone it is called significant almost every time.',
        '* Deflating for the number of candidates (DSR) brings the false positive rate far BELOW the nominal 5% (0-0.7% here): it is conservative, at the price of power. Short track records cannot tell a skilled manager from the best of a crowd.',
        '* BH keeps the share of false discoveries near the chosen q = 10% (13% at 36 months, where the test statistics are least normal, then 11% and 8%) while finding more skilled managers as the track record grows: 19% of them at 36 months, 84% at 120.',
        '* Caveats: independent managers, normal returns, one fixed skill level, no fees, no survivorship or backfill bias. Real universes are correlated and messier, which makes selection bias worse, not better.']
os.makedirs(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'results'), exist_ok=True)
p = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'results', 'lucky_manager.md'); open(p, 'w').write('\n'.join(out) + '\n'); print('\n'.join(out)); print('\nwritten to ' + p)
