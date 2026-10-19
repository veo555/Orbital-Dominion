#!/usr/bin/env python3
"""Screen managers from a CSV of monthly returns.
   python3 examples/screen_csv.py examples/sample_returns.csv [--factors factors.csv] [--rf 0.0] [--top 15]
CSV format: header row of manager names; one row per month; simple returns as decimals (0.012 = 1.2%) or percent (1.2) with --percent.
Optional factors CSV: same number of rows, one column per factor (e.g. equity market excess return).  Nothing leaves your machine."""
import sys, os, csv, argparse
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from diligence import screen

ap = argparse.ArgumentParser(); ap.add_argument('returns'); ap.add_argument('--factors'); ap.add_argument('--rf', type=float, default=0.0, help='risk-free return per period (default 0)')
ap.add_argument('--top', type=int, default=15); ap.add_argument('--percent', action='store_true', help='returns are in percent'); a = ap.parse_args()
def read(path):
    with open(path, newline='') as f: rows = list(csv.reader(f))
    names = rows[0]; data = np.array([[float(x) for x in r] for r in rows[1:] if r], float); return names, data
names, data = read(a.returns); scale = 100.0 if a.percent else 1.0; data = data / scale
fac = None
if a.factors: _, fac = read(a.factors); fac = fac / scale; assert fac.shape[0] == data.shape[0], 'factor file must have one row per month'
rows = screen.screen(data.T, names=names, rf=a.rf / scale, factors=fac)
print(screen.to_markdown(rows, a.top))
print('Candidates: %d, months: %d. BH = significant at a 10%% false discovery rate; DSR deflates for the number of candidates. Past returns do not predict future returns.' % (data.shape[1], data.shape[0]))
