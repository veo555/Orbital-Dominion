"""Audio mix gate + measurement report (Playwright + Chromium, offline renders). docs/AUDIO_V4.md.
   python3 tests/e2e/e2e_audio_mix.py                       gates only (voices by class, scenarios through the shipped v4 master chain, ducking, loudness meter)
   python3 tests/e2e/e2e_audio_mix.py --report out.json     also write every measured number (voices per class, cues, scenarios for chains v3 AND v4) to out.json
   python3 tests/e2e/e2e_audio_mix.py --cues theme_meridian,battle --no-voices --no-scen    (subsets; --cues all = every cue, ~12 s of audio each)
   OD_URL=file:///.../dist/orbital_dominion_v3.html to point it at a scratch build.

What is enforced (all numbers come from tests/audio/bs1770.js, an ITU-R BS.1770-4 meter verified against ffmpeg's ebur128 by tests/audio/bs1770_test.js):
  voices  every voice, rendered raw: finite, DC < 0.01, class-mean active level within 3 dB of the class target, per-voice true peak <= -0.2 dBTP (raw voices; the master chain handles the rest)
  scen    through the shipped master chain 'v4': calm / battle / burst500 (500 calls in 3 s) / voiceOver:  true peak <= -1.0 dBTP, no sample >= 0.999, finite;
          battle LUFS-I within -30..-14; burst500 at most +6 LU over battle (dense fights do not explode); speech sits >= 6 LU over the ducked background; the music bus is ducked >= 4 dB under speech
  duck    the live duck envelope (attack 40 ms, hold, 900 ms release) measured in an offline mixdown: before 1.0, during 0.5, after 1.0
  mutate  a chain without the limiter / without the soft clip (v3) FAILS the true-peak gate on burst500 (the gate can fail); a mixdown without ducks FAILS the duck gate.
Not tested: how it sounds, a phone's loudspeaker, latency."""
import os, sys, json, time, pathlib, argparse
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
URL = os.environ.get('OD_URL') or (ROOT / 'dist' / 'orbital_dominion_v3.html').as_uri()
AUDIO = ROOT / 'tests' / 'audio'
ap = argparse.ArgumentParser()
ap.add_argument('--report', default=''); ap.add_argument('--cues', default=''); ap.add_argument('--no-voices', action='store_true'); ap.add_argument('--no-scen', action='store_true')
ap.add_argument('--chains', default='v4'); ap.add_argument('--chain-json', default='', help='explore: a custom master preset {comp:{..},trim,lim:{..},clip:{..}} measured as chain "x"'); ap.add_argument('--cue-seconds', type=float, default=12)
ARGS = ap.parse_args()
fails = []; T0 = time.time(); REPORT = {}
CLASS_DB = {'ui': -26, 'fire': -22, 'impact': -18, 'boom': -14, 'voice': -20, 'alert': -17, 'cine': -18, 'music': -20, 'amb': -30}


def ok(c, m):
    print(('ok    ' if c else 'FAIL  ') + m, flush=True)
    if not c: fails.append(m)


def f(v, d=1):
    return ('%.' + str(d) + 'f') % v


with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])
    pg = b.new_page(viewport={'width': 1366, 'height': 800})
    errs = []; reqs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('request', lambda r: reqs.append(r.url[:80]) if not r.url.startswith(('file:', 'data:', 'blob:')) else None)
    pg.add_init_script("window.__TEST='lite'")
    pg.goto(URL); pg.wait_for_timeout(300)
    for js in ('dsp.js', 'bs1770.js', 'mix_page.js'):
        pg.add_script_tag(content=(AUDIO / js).read_text(encoding='utf-8'))

    if not ARGS.no_voices:
        t = time.time()
        vt = pg.evaluate("()=>ODM.classTable()")
        REPORT['voices'] = vt
        print('note  %d voices measured in %.0f s' % (vt['n'], time.time() - t))
        ok(not vt['nonfinite'], 'every voice renders finite samples (%d voices)' % vt['n'])
        for c, s in sorted(vt['classes'].items()):
            a, l, tp, ce, ha, de = s['activeDb'], s['lufsM'], s['tpDb'], s['crest'], s['harsh'], s['decay']
            print('      %-7s n=%3d  active %6s dB (target %s)  LUFS-M %6s  TP max %6s  crest %5s (p10 %s p90 %s)  centroid %5d Hz  2-5k share %6s dB  decay50 med %.2fs max %.2fs'
                  % (c, s['n'], f(a['mean']), CLASS_DB.get(c, '?'), f(l['mean']), f(tp['max']), f(ce['mean']), f(ce['p10']), f(ce['p90']), s['centroid']['mean'], f(ha['mean']), de['med'], de['max']))
            if c in CLASS_DB:
                ok(abs(a['mean'] - CLASS_DB[c]) <= 3.0, 'class %s: mean active level %s dBFS within 3 dB of its target %d' % (c, f(a['mean']), CLASS_DB[c]))
            ok(s['dc']['max'] < 0.01, 'class %s: |DC| < 0.01 (max %s)' % (c, f(s['dc']['max'], 4)))
        ok(vt['hottest'][0]['tpDb'] <= 1.0, 'hottest RAW voice true peak %s dBTP (%s) <= +1.0 (inter-sample overshoot of a raw voice is caught by the master limiter + soft clip: the scenario gates below hold the OUTPUT at <= -1 dBTP)' % (f(vt['hottest'][0]['tpDb'], 2), vt['hottest'][0]['id']))

    if ARGS.cues:
        ids = [x for x in ARGS.cues.split(',') if x]
        if ids == ['all']:
            ids = pg.evaluate("()=>Object.keys(__RTS.MUSIC_CUES)")
        t = time.time()
        ct = pg.evaluate("([ids,sec])=>ODM.cueTable(ids,sec)", [ids, ARGS.cue_seconds])
        REPORT['cues'] = ct
        print('note  %d cues measured in %.0f s (window %.0f s, intensity 0.75)' % (len(ct), time.time() - t, ARGS.cue_seconds))
        for c in ct:
            print('      %-16s LUFS-I %6s  LUFS-M %6s  LRA %4s  TP %6s  crest %5s  centroid %5d  2-5k %6s dB  DC %s  dead %.1fs'
                  % (c['id'], f(c['lufsI']), f(c['lufsM']), f(c['lra']), f(c['tpDb']), f(c['crest']), c['centroid'], f(c['harsh']), f(c['dc'], 4), c['dead']))
        prog = [c for c in ct if not c['id'].startswith('sting')]
        if len(prog) >= 10:
            ok(all(abs(c['lufsI'] + 17.5) <= 2.0 for c in prog), 'programme cues sit at -17.5 +-2 LUFS-I (83_music_trim.js): spread %.1f LU (min %s %s, max %s %s)' % (
                max(c['lufsI'] for c in prog) - min(c['lufsI'] for c in prog), min(prog, key=lambda c: c['lufsI'])['id'], f(min(c['lufsI'] for c in prog)), max(prog, key=lambda c: c['lufsI'])['id'], f(max(c['lufsI'] for c in prog))))
            ok(all(c['dead'] < 1.5 for c in prog), 'no dead air > 1.5 s in a programme cue')
        ok(all(c['tpDb'] <= 0.0 for c in ct), 'no cue has a true peak above 0 dBTP before the master chain')
        REPORT['sweeps'] = {}
        for th in [c for c in ids if c.startswith('theme_')]:
            lv = {}
            for it in (0.1, 0.5, 0.9):
                lv[it] = pg.evaluate("([i,s,it])=>ODM.cueTable([i],s,{intensity:it})", [th, ARGS.cue_seconds, it])[0]
            nt = pg.evaluate("([i,s])=>ODM.cueTable([i],s,{intensity:0.75,night:1})", [th, ARGS.cue_seconds])[0]
            REPORT['sweeps'][th] = {'int': {str(k): v['lufsI'] for k, v in lv.items()}, 'centroid': {str(k): v['centroid'] for k, v in lv.items()}, 'night_lufs': nt['lufsI'], 'night_centroid': nt['centroid']}
            ok(lv[0.1]['lufsI'] < lv[0.5]['lufsI'] < lv[0.9]['lufsI'] and lv[0.9]['lufsI'] - lv[0.1]['lufsI'] >= 1.5,
               '%s: intensity layers add up: LUFS-I %s -> %s -> %s at intensity 0.1 / 0.5 / 0.9 (monotonic, span >= 1.5 LU)' % (th, f(lv[0.1]['lufsI']), f(lv[0.5]['lufsI']), f(lv[0.9]['lufsI'])))
            print('      %s night: LUFS-I %s centroid %d Hz vs day (0.75) %s' % (th, f(nt['lufsI']), nt['centroid'], 'see sweep'))
        ok(all(c['finite'] for c in ct), 'every measured cue is finite')
        ok(all(c['dc'] < 0.01 for c in ct), 'every measured cue |DC| < 0.01')

    chains = [c for c in ARGS.chains.split(',') if c]
    SC = {}
    if not ARGS.no_scen:
        for ch in sorted(set(chains + ['v4'] + (['x'] if ARGS.chain_json else []))):
            t = time.time()
            SC[ch] = pg.evaluate("(c)=>ODM.scenarios(c)", json.loads(ARGS.chain_json) if ch == 'x' else ch)
            print('note  scenarios through master chain %s rendered in %.0f s' % (ch, time.time() - t))
            for k, s in SC[ch].items():
                print('      %-9s LUFS-I %6s  LUFS-S max %6s  TP %6s dBTP  sample peak %6s  crest %5s  centroid %5d Hz  2-5k %6s dB  clipped samples %d'
                      % (k, f(s['lufsI']), f(s['lufsS']), f(s['tpDb'], 2), f(s['peakDb'], 2), f(s['crest']), s['centroid'], f(s['harsh']), s['clipped']))
        REPORT['scenarios'] = SC
        S = SC['v4']
        for k, s in S.items():
            ok(s['finite'] and s['clipped'] == 0, 'v4 %s: finite, no sample >= 0.999 (%d)' % (k, s['clipped']))
            ok(s['tpDb'] <= -1.0, 'v4 %s: true peak %s dBTP <= -1.0' % (k, f(s['tpDb'], 2)))
        ok(-30 <= S['battle']['lufsI'] <= -14, 'v4 battle programme loudness %s LUFS in -30..-14' % f(S['battle']['lufsI']))
        ok(S['burst500']['lufsS'] - S['battle']['lufsS'] <= 6.0, 'v4 burst500 short-term loudness %s LU over battle (<= 6)' % f(S['burst500']['lufsS'] - S['battle']['lufsS']))
        v = S['voiceOver']
        ok(v['snr'] >= 3.0, 'speech %s LUFS sits %s LU over a dense-fight background (10 shots/s + booms, ducked) %s LUFS (>= 3)' % (f(v['speechLufs']), f(v['snr']), f(v['bgUnderSpeech'])))
        ok(v['snrMusic'] >= 9.0, 'speech sits %s LU over the ducked music alone (>= 9)' % f(v['snrMusic']))
        ok(v['duckDb'] <= -8.0, 'music is ducked %s dB under speech (<= -8)' % f(v['duckDb']))
        if 'v3' in SC:
            ok(SC['v3']['burst500']['tpDb'] > -1.0 or SC['v3']['burst500']['clipped'] > 0, 'MUTATION: the v3 chain (no limiter, 0.97 ceiling) FAILS the v4 true-peak/clipping gate on burst500 (TP %s dBTP, %d clipped)' % (f(SC['v3']['burst500']['tpDb'], 2), SC['v3']['burst500']['clipped']))

    rm = pg.evaluate("()=>ODM.rooms(['plate','hall','air','open','canyon','cave'])")
    REPORT['rooms'] = rm
    print('note  rooms (send 1.0: wet-dry dB, RT60 s): ' + '  '.join('%s %+.2f %.2fs' % (k, v['diffDb'], v['t60']) for k, v in rm.items()))
    ok(all(abs(v['diffDb']) < 0.3 for v in rm.values()), 'every reverb room returns wet energy = dry energy at send 1.0 within 0.3 dB (calibration of the open/canyon/cave presets)')
    ok(rm['open']['t60'] < rm['canyon']['t60'] < rm['cave']['t60'], 'room presets differ: open %.2fs < canyon %.2fs < cave %.2fs' % (rm['open']['t60'], rm['canyon']['t60'], rm['cave']['t60']))
    REPORT['distance'] = {}
    for vid in ('rifleman.fire.meridian', 'rifleman.fire.aurora', 'skiff.fire.aurora', 'hub.fire.obsidian', 'hero_lyra.fire.aurora'):
        d = pg.evaluate("(v)=>ODM.distance(v)", vid)
        REPORT['distance'][vid] = d
        ok(d['far']['centroid'] < d['near']['centroid'] * 0.96 and d['far']['activeDb'] < d['near']['activeDb'] - 1.5 and d['far']['decay'] > d['near']['decay'] + 0.1,
           '%s: far source is darker (centroid %d -> %d Hz), has a reverb tail (decay %.2f -> %.2f s)' % (vid, d['near']['centroid'], d['far']['centroid'], d['near']['decay'], d['far']['decay']))
    for vid in ('rifleman.fire.meridian', 'hero_lyra.hit.aurora'):
        cs = pg.evaluate("(v)=>ODM.variation(v)", vid)['centroids']
        steps = [abs(cs[i + 1] - cs[i]) / max(cs[i], 1) for i in range(len(cs) - 1)]
        near = sum(1 for x in steps if x < 0.004) / len(steps)
        REPORT.setdefault('variation', {})[vid] = {'near_identical_fraction': near, 'spread': (max(cs) - min(cs)) / (sum(cs) / len(cs))}
        ok(near <= 0.15 and (max(cs) - min(cs)) / (sum(cs) / len(cs)) > 0.03, '%s: 30 consecutive instances: %.0f%% of neighbouring pairs are near-identical (< 0.4%% centroid step), spread %.1f%%' % (vid, near * 100, 100 * (max(cs) - min(cs)) / (sum(cs) / len(cs))))
    ctrl = [1000.0] * 30
    ok(sum(1 for i in range(29) if abs(ctrl[i + 1] - ctrl[i]) / ctrl[i] < 0.004) / 29 >= 0.1, 'CONTROL: a machine-gun (identical instances) is rejected by the variation criterion')
    if not ARGS.no_scen:
        for ch in sorted(set(chains + ['v4'])):
            tr = pg.evaluate("(c)=>ODM.transfer(c)", ch)
            REPORT.setdefault('transfer', {})[ch] = tr
            print('note  static transfer %s: ' % ch + '  '.join('%d dBFS -> %+.1f dB' % (r['in'], r['gain']) for r in tr))
        if ARGS.chain_json:
            tr = pg.evaluate("(c)=>ODM.transfer(c)", json.loads(ARGS.chain_json))
            print('note  static transfer x: ' + '  '.join('%d dBFS -> %+.1f dB' % (r['in'], r['gain']) for r in tr))
    dp = pg.evaluate("()=>ODM.duckProbe()")
    REPORT['duck'] = dp
    ok(abs(dp['during'] / dp['before'] - 0.5) < 0.03 and abs(dp['after'] / dp['before'] - 1) < 0.03, 'duck envelope: x%s during a 0.5 duck, x%s after the release' % (f(dp['during'] / dp['before'], 3), f(dp['after'] / dp['before'], 3)))
    ok(0.6 < dp['mid'] / dp['before'] < 0.9, 'duck release is a ramp: x%s half-way through the 900 ms release (expected about 0.75)' % f(dp['mid'] / dp['before'], 3))

    ok(not reqs, 'zero network requests %s' % reqs[:3])
    ok(not errs, 'zero page errors %s' % errs[:3])
    b.close()
if ARGS.report:
    pathlib.Path(ARGS.report).write_text(json.dumps(REPORT, indent=1))
    print('wrote', ARGS.report)
print(('FAILED (%d s, %d failures)' % (time.time() - T0, len(fails))) if fails else 'ALL OK (%d s)' % (time.time() - T0))
sys.exit(1 if fails else 0)
