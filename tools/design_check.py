#!/usr/bin/env python3
"""Design-system verifier: reads the colour tokens from src/style.css and MEASURES them.

  python3 tools/design_check.py            # print the report, exit 1 if a hard requirement fails
  python3 tools/design_check.py --write    # also refresh the generated block in docs/DESIGN_SYSTEM.md

  1. WCAG 2.x contrast ratio of every text / data colour on every surface it is used on.
     Requirements: body text >= 7:1 (AAA), secondary and data colours >= 4.5:1 (AA).
  2. Team colours under colour-vision deficiency. The sRGB colours are pushed through the Machado, Oliveira & Fernandes (2009)
     severity-1.0 matrices for protanopia, deuteranopia and tritanopia (in linear RGB) and compared in CIELAB with the CIEDE2000
     formula. dE00 < ~10 means "hard to tell apart at a glance", > ~25 means "clearly different". Requirement: the colour-blind-safe
     blue-vs-orange pair stays >= 25 under all three deficiencies.
"""
import math, pathlib, re, sys
ROOT = pathlib.Path(__file__).resolve().parents[1]
CSS = (ROOT / 'src' / 'style.css').read_text(encoding='utf-8')
CORE = (ROOT / 'src' / 'js' / '00_core.js').read_text(encoding='utf-8')
MENUS = (ROOT / 'src' / 'js' / '72_menus.js').read_text(encoding='utf-8')

def tokens():
    root = re.search(r':root\{(.*?)\n\}', CSS, re.S).group(1)
    return {k: v.strip() for k, v in re.findall(r'(--[\w-]+):\s*([^;]+);', root)}
T = tokens()

def rgb(h):
    h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
lin = lambda c: (c / 255) / 12.92 if c / 255 <= 0.04045 else (((c / 255) + 0.055) / 1.055) ** 2.4
def lum(h): r, g, b = (lin(c) for c in rgb(h)); return 0.2126 * r + 0.7152 * g + 0.0722 * b
def contrast(a, b):
    la, lb = lum(a), lum(b); hi, lo = max(la, lb), min(la, lb); return (hi + 0.05) / (lo + 0.05)

# ---- faction colours straight from the data tables / CB constants ---------------------------------------------------------------
FAC = {m[0]: m[1] for m in re.findall(r"(\w+):\{id:'\w+',name:'[^']*',tag:'[^']*',unique:'\w+',hero:'\w+',\s*col:\{base:'(#[0-9a-f]{6})'", CORE, re.I)}
FAC = {k: v for k, v in zip(re.findall(r"id:'(meridian|obsidian|aurora)'", CORE), re.findall(r"col:\{base:'(#[0-9a-fA-F]{6})'", CORE))}
CB_YOU = re.search(r"CB_YOU=\{base:'(#[0-9a-fA-F]{6})'", MENUS).group(1); CB_FOE = re.search(r"CB_FOE=\{base:'(#[0-9a-fA-F]{6})'", MENUS).group(1)

# ---- colour science -----------------------------------------------------------------------------------------------------------------
MACHADO = {
    'protanopia':   [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
    'deuteranopia': [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
    'tritanopia':   [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]]}
def simulate(h, kind):
    v = [lin(c) for c in rgb(h)]
    if kind != 'normal':
        M = MACHADO[kind]; v = [max(0, min(1, sum(M[i][j] * v[j] for j in range(3)))) for i in range(3)]
    return v
def lab(v):
    r, g, b = v
    X = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b; Y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b; Z = 0.0193339 * r + 0.1191920 * g + 0.9503041 * b
    f = lambda t: t ** (1 / 3) if t > 216 / 24389 else (24389 / 27 * t + 16) / 116
    fx, fy, fz = f(X / 0.95047), f(Y), f(Z / 1.08883)
    return 116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)
def de2000(l1, l2):
    L1, a1, b1 = l1; L2, a2, b2 = l2
    C1, C2 = math.hypot(a1, b1), math.hypot(a2, b2); Cb = (C1 + C2) / 2
    G = 0.5 * (1 - math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)))
    a1p, a2p = (1 + G) * a1, (1 + G) * a2; C1p, C2p = math.hypot(a1p, b1), math.hypot(a2p, b2)
    h1p = math.degrees(math.atan2(b1, a1p)) % 360; h2p = math.degrees(math.atan2(b2, a2p)) % 360
    dLp, dCp = L2 - L1, C2p - C1p
    dh = 0 if C1p * C2p == 0 else (h2p - h1p if abs(h2p - h1p) <= 180 else h2p - h1p - 360 * math.copysign(1, h2p - h1p))
    dHp = 2 * math.sqrt(C1p * C2p) * math.sin(math.radians(dh / 2))
    Lbp, Cbp = (L1 + L2) / 2, (C1p + C2p) / 2
    if C1p * C2p == 0: hbp = h1p + h2p
    elif abs(h1p - h2p) <= 180: hbp = (h1p + h2p) / 2
    else: hbp = (h1p + h2p + 360) / 2 if h1p + h2p < 360 else (h1p + h2p - 360) / 2
    Tt = 1 - 0.17 * math.cos(math.radians(hbp - 30)) + 0.24 * math.cos(math.radians(2 * hbp)) + 0.32 * math.cos(math.radians(3 * hbp + 6)) - 0.20 * math.cos(math.radians(4 * hbp - 63))
    Sl = 1 + 0.015 * (Lbp - 50) ** 2 / math.sqrt(20 + (Lbp - 50) ** 2); Sc = 1 + 0.045 * Cbp; Sh = 1 + 0.015 * Cbp * Tt
    Rt = -2 * math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7)) * math.sin(math.radians(60 * math.exp(-(((hbp - 275) / 25) ** 2))))
    return math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh))
def dE(h1, h2, kind): return de2000(lab(simulate(h1, kind)), lab(simulate(h2, kind)))

# ---- report ------------------------------------------------------------------------------------------------------------------------------
fails = []; out = []
def line(s=''): out.append(s)
surfaces = ['--bg', '--panel', '--panel2', '--raise']
line('### Surfaces and text (WCAG 2.x contrast ratio, higher is better)\n')
line('| Token | Hex | Role | ' + ' | '.join(f'on `{s}` {T[s]}' for s in surfaces) + ' | Needs |')
line('|---|---|---|' + '---|' * len(surfaces) + '---|')
rows = [('--txt', 'primary text', 7), ('--txt2', 'secondary text', 7), ('--dim', 'tertiary text / labels', 4.5),
        ('--cry', 'crystal figures', 4.5), ('--eth', 'ether figures', 4.5), ('--sup', 'supply figures', 4.5),
        ('--ok', 'positive / success', 4.5), ('--warn', 'caution', 4.5), ('--bad', 'danger / error', 4.5), ('--info', 'information', 4.5), ('--acc2', 'default accent (Meridian glow)', 4.5)]
for tok, role, need in rows:
    cells = []
    for s in surfaces:
        c = contrast(T[tok], T[s]); good = c >= need
        if not good: fails.append(f'{tok} on {s}: {c:.2f}:1 < {need}:1')
        cells.append(f"{c:.1f}:1 {'✔' if good else '✘'}")
    line(f'| `{tok}` | {T[tok]} | {role} | ' + ' | '.join(cells) + f' | {need}:1 |')

line('\n### Faction and team colours on the dark UI surface `--panel2` ' + T['--panel2'] + '\n')
line('| Colour | Hex | Contrast on `--panel2` |'); line('|---|---|---|')
for name, h in [('Meridian Corps', FAC['meridian']), ('Obsidian Collective', FAC['obsidian']), ('Aurora Syndicate', FAC['aurora']), ('Colour-blind "you"', CB_YOU), ('Colour-blind "enemy"', CB_FOE)]:
    c = contrast(h, T['--panel2']); line(f'| {name} | {h} | {c:.1f}:1 {"✔" if c >= 3 else "✘"} |')
    if c < 3: fails.append(f'{name} {h} on panel2: {c:.2f}:1 < 3:1 (non-text graphical objects)')

line('\n### Can the two sides be told apart? CIEDE2000 colour difference under colour-vision deficiency\n')
line('dE00 below ~10 = hard to tell apart at a glance; above ~25 = clearly different.\n')
kinds = ['normal', 'protanopia', 'deuteranopia', 'tritanopia']
line('| Pair (you vs enemy) | ' + ' | '.join(kinds) + ' | worst |'); line('|---|' + '---|' * (len(kinds) + 1))
pairs = [(f'{a.title()} vs {b.title()}', FAC[a], FAC[b]) for a, b in [('meridian', 'obsidian'), ('meridian', 'aurora'), ('obsidian', 'aurora')]]
pairs.append(('**Colour-blind-safe mode: blue vs orange**', CB_YOU, CB_FOE))
for name, a, b in pairs:
    vals = [dE(a, b, k) for k in kinds]; worst = min(vals)
    line(f'| {name} | ' + ' | '.join(f'{v:.0f}' for v in vals) + f' | **{worst:.0f}** |')
    if 'Colour-blind' in name and worst < 25: fails.append(f'colour-blind pair worst dE00 {worst:.1f} < 25')
report = '\n'.join(out)
print(report)
print('\nFAILED requirements:' if fails else '\nAll design requirements met.')
for f in fails: print('  -', f)
if '--write' in sys.argv:
    p = ROOT / 'docs' / 'DESIGN_SYSTEM.md'
    if p.exists():
        s = p.read_text(encoding='utf-8')
        s = re.sub(r'(<!-- BEGIN GENERATED -->).*?(<!-- END GENERATED -->)', lambda m: m.group(1) + '\n' + report + '\n' + m.group(2), s, flags=re.S)
        p.write_text(s, encoding='utf-8'); print('updated', p)
sys.exit(1 if fails else 0)
