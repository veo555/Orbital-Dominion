#!/usr/bin/env python3
"""Arsenal sound probe: measures the voices of src/js/81_sfx_arsenal.js (skill.flak sprint pounce pounceHit snipe overcharge emp scan barrage lanceCharge burrowIn burrowOut lanceHit)
and writes tests/out/audio/arsenal_report.json.

  OD_URL=file:///.../orbital_dominion_v4.html python3 tests/audio/arsenal_gate.py              measure, exit 1 when a hard criterion fails
  OD_URL=...                                  python3 tests/audio/arsenal_gate.py --calibrate  rewrite the TRIM block of 81_sfx_arsenal.js (rebuild, then run again to verify)

Per voice (same criteria as tests/audio/world_gate.py): registered as an exact, non-fallback id, finite, peak <= 0.98 over all seeds, active-window RMS within +-4 dB of its class target
(fire -22, impact -18, boom -14), |DC| / first sample / last 20 ms, duration, fire <= 0.35 s and <= 4 source nodes, boom <= 2.5 s, determinism (same seed = same hash),
seed variation for the repeating weapons sounds. Limits: offline Chromium renders, no loudspeaker, no listener: taste and mobile loudness are untested."""
import os, re, sys, json, pathlib, argparse
HERE = pathlib.Path(__file__).resolve().parent
ap = argparse.ArgumentParser(); ap.add_argument('--calibrate', action='store_true'); ap.add_argument('--seeds', type=int, default=6)
ARGS = ap.parse_args()
_argv = sys.argv; sys.argv = [sys.argv[0]]
sys.path.insert(0, str(HERE))
import units_gate as U
sys.argv = _argv
from playwright.sync_api import sync_playwright

SRC = U.ROOT / 'src' / 'js' / '81_sfx_arsenal.js'
OUT = U.OUT / 'arsenal_report.json'
NAMES = ['skill.' + n for n in ('flak', 'sprint', 'pounce', 'pounceHit', 'snipe', 'overcharge', 'emp', 'scan', 'salvo', 'lanceCharge', 'burrowIn', 'burrowOut', 'lanceHit')]
REPEAT = {'skill.flak', 'skill.pounceHit'}                       # sounds that play many times in a row: seeds must differ


def rewrite_trim(new):
    t = SRC.read_text(encoding='utf-8')
    body = ','.join("'%s':%s" % (k, new[k]) for k in sorted(new))
    t2 = re.sub(r'/\*TRIM:BEGIN\*/\nconst TRIM=\{.*?\};\n/\*TRIM:END\*/', lambda m: '/*TRIM:BEGIN*/\nconst TRIM={%s};\n/*TRIM:END*/' % body, t, flags=re.S)
    SRC.write_text(t2, encoding='utf-8')


def main():
    fails = []
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--no-sandbox'])
        pg = b.new_page(viewport={'width': 1366, 'height': 800})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.add_init_script("window.__TEST='lite'")
        pg.goto(U.URL); pg.wait_for_function("()=>!!(window.__RTS&&window.__RTS.AUD)", timeout=20000)
        for f in ('dsp.js', 'controls.js', 'page.js'): pg.add_script_tag(content=(U.AUDIO / f).read_text(encoding='utf-8'))
        pg.evaluate("(v)=>ODP.setVocab(v)", {'factions': U.SFXF, 'units': U.UNITS, 'buildings': U.BUILDINGS})
        pg.evaluate(U.PAGE_JS)
        info = {v['id']: v for v in pg.evaluate("()=>UG.ids()")}
        miss = [n for n in NAMES if n not in info or info[n]['fallback']]
        if miss: fails.append('not registered as exact voices: %s' % miss)
        recs = {}
        sel = [n for n in NAMES if n in info]
        for i in range(0, len(sel), 6):
            for r in pg.evaluate("([a,o])=>UG.run(a,o)", [sel[i:i + 6], {'seeds': ARGS.seeds}]): recs[r['id']] = r
        b.close()
    trim = {}
    rep = []
    old = SRC.read_text(encoding='utf-8')
    m = re.search(r'const TRIM=\{(.*?)\};', old, re.S)
    cur = {k: float(v) for k, v in re.findall(r"'([^']+)':([0-9.]+)", m.group(1))} if m else {}
    for n in sel:
        r = recs[n]; lv = r['lv']; tgt = U.CLASS_DB[r['cls']]; hard = []
        g0 = cur.get(n, 1.0)
        mean_act = sum(r['seedAct']) / len(r['seedAct'])
        # calibration: gain that puts the mean active level on the class target, lowered so the largest peak stays <= 0.95
        want = g0 * 10 ** ((tgt - mean_act) / 20.0)
        want = min(want, g0 * 0.95 / max(max(r['seedPeak']), 1e-6))
        trim[n] = round(want, 4)
        if not lv['finite']: hard.append('finite')
        if max(r['seedPeak']) > 0.98: hard.append('peak %.3f' % max(r['seedPeak']))
        if not lv['activeDb'] > -60: hard.append('silent')
        if abs(lv['activeDb'] - tgt) > 4: hard.append('level %.1f vs %d' % (lv['activeDb'], tgt))
        if lv['dc'] >= 0.01: hard.append('dc %.4f' % lv['dc'])
        if lv['first'] >= 0.05: hard.append('first %.3f' % lv['first'])
        if lv['tailDb'] > -60: hard.append('tail %.1f dB' % lv['tailDb'])
        if r['dur'] + r['tail'] > 6.0: hard.append('dur+tail %.2f > 6' % (r['dur'] + r['tail']))
        if r['cls'] == 'fire' and r['dur'] > 0.35: hard.append('fire dur %.2f > 0.35' % r['dur'])
        if r['cls'] == 'fire' and max(r['seedNodes']) > 4: hard.append('fire nodes %d > 4' % max(r['seedNodes']))
        if r['cls'] == 'boom' and r['dur'] > 2.5: hard.append('boom dur %.2f > 2.5' % r['dur'])
        if r['hashA'] != r['hashB']: hard.append('non-deterministic')
        if n in REPEAT and len(set(r['seedHashes'][:3])) < 3: hard.append('no seed variation')
        rep.append(dict(id=n, cls=r['cls'], dur=r['dur'], act=round(lv['activeDb'], 2), peak=round(max(r['seedPeak']), 3), nodes=max(r['seedNodes']), trim=g0, hard=hard))
        print('%-12s %-6s act %6.1f dB (target %d)  peak %.3f  nodes %d  dur %.2f  %s' % (n, r['cls'], lv['activeDb'], tgt, max(r['seedPeak']), max(r['seedNodes']), r['dur'], 'FAIL ' + ', '.join(hard) if hard else 'ok'))
        if hard and not ARGS.calibrate: fails.append('%s: %s' % (n, ', '.join(hard)))
    OUT.parent.mkdir(parents=True, exist_ok=True); OUT.write_text(json.dumps(rep, indent=1))
    if errs: fails.append('page errors: %s' % errs[:3])
    if ARGS.calibrate:
        rewrite_trim(trim); print('TRIM rewritten (%d entries); rebuild and run again without --calibrate' % len(trim)); return 0
    print('\n%d voices measured, %d problem(s)' % (len(rep), len(fails)))
    for f in fails: print('FAIL ', f)
    return 1 if fails else 0


sys.exit(main())
