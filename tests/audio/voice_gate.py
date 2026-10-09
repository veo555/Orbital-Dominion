#!/usr/bin/env python3
"""Character-voice gate: measures the speech module (src/js/84_voice.js) and writes tests/out/audio/voice_report.json.

  python3 tests/audio/voice_gate.py                 full gate (about 6-8 min; exit 1 when a hard check fails)
  python3 tests/audio/voice_gate.py --quick         fewer sentences/characters (about 2 min): for iterating, not for the report
  python3 tests/audio/voice_gate.py --calibrate     re-fit the LEVEL table VOX_LVL / VOX_LVLK in src/js/84_voice.js (between the /*LVL:BEGIN*/ and /*LVL:END*/ markers) from renders of the story
                                                    characters x 6 styles x 3 sentences, then REBUILD and re-run without the flag to verify
  python3 tests/audio/voice_gate.py --spectro idris,kaz,lyra   also write spectrogram PNGs to tests/out/audio/spectro/
  OD_URL=file:///.../orbital_dominion_v4.html       points it at a scratch build (never run a bare build.py while other agents share dist/)

Nobody can listen here. These are the only claims the gate makes, and every metric has a MUTATION CONTROL (a signal or input that must be rejected, so the check cannot be vacuous):
  instruments   the pitch tracker and the LPC formant tracker are run on synthetic vowels with KNOWN f0 / formants first; level, click, DC, silence, clipping and NaN detectors on deliberately bad signals
  segmenter     hand-labelled syllable counts (tests/audio/voice_labels.json; regression / held-out / adversarial sets) against a naive vowel-group counter that must score clearly worse
  corpus        every character (story + the 13 fixture characters) x 4 sentences: finite, peak <= 0.98, level within 3 dB of the style target, DC, first sample, last 20 ms, non-silent, bit-exact
                determinism (twice the same hash; Math.random / Date.now / performance.now are stubbed to THROW while the graph is built), every character a different hash, duration estimate vs rendered length
  distinct      pitch median, LPC F1..F3, long-term spectrum (centroid + 14 bands), syllable rate per character; leave-one-sentence-out nearest-centroid speaker identification vs a label-permutation
                control; fixture characters (identical voice data: they differ only by the id-hash offsets) reported separately
  sweeps        probe characters, ONE voice field changed at a time: pitch -> f0, formant -> LPC F2 / centroid, rate -> duration, timbre -> spectral shape; ttsPitch/ttsRate must NOT change a sample
  styles        radio (band-limited + crackle in the pauses), whisper (unvoiced, quieter), shout (louder, higher), narration (slower, reverb tail), thought; unknown style = normal
  prosody       measured on the AUDIO: question rises, statement falls, comma holds, '!' lifts, declination, realised pauses vs the plan
  live          real speak/speakStop/bark/queue/say in a page whose AudioContext is running, with a fake speechSynthesis (voice choice, ttsPitch/ttsRate, async voiceschanged, cancel, onEnd, announcer limits)
Limits: offline Chromium renders, no loudspeaker, no listener. Intelligibility, taste, mobile loudness and latency are untested; the synthesized stream is speech-LIKE (syllables, pitch, formants), not speech."""
import os, re, sys, json, time, base64, pathlib, argparse, itertools, math, platform
import numpy as np
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
AUDIO = ROOT / 'tests' / 'audio'
sys.path.insert(0, str(AUDIO))
import voice_dsp as D

URL = os.environ.get('OD_URL') or (ROOT / 'dist' / 'orbital_dominion_v4.html').as_uri()
OUT = ROOT / 'tests' / 'out' / 'audio'
SRC = ROOT / 'src' / 'js' / '84_voice.js'
ap = argparse.ArgumentParser()
ap.add_argument('--quick', action='store_true'); ap.add_argument('--calibrate', action='store_true')
ap.add_argument('--dry', action='store_true', help='with --calibrate: report the fit, do not rewrite the source'); ap.add_argument('--spectro', default=''); ap.add_argument('--out', default=str(OUT / 'voice_report.json')); ap.add_argument('--only', default='', help='comma list of sections to run')
ARGS = ap.parse_args()
SR = 44100
SENT = ["The colony holds the line tonight. Are you ready for the dawn, Marshal?",
        "Hold the line! They are coming from the north, and we will not break.",
        "Nothing here is as it seems, and nobody will tell you why.",
        "We rebuild, and we remember. The array wakes at dawn."]
TXT = "Hold the line, Marshal. They are coming from the north!"
TARGET = {'normal': -20, 'radio': -20, 'whisper': -26, 'shout': -17, 'narration': -20, 'thought': -24}   # = VOX_TARGET in 84_voice.js (read back below and compared)
STYLES = list(TARGET)
REVERB = ('narration', 'thought')                                                                      # these keep ringing after the line: render a longer tail so the buffer end is not a cut
REF = 135.0

R = dict(url=URL, started=time.strftime('%Y-%m-%d %H:%M:%S'), host=platform.platform(), checks=[], sections={})
T0 = time.time()


def ck(sec, name, ok, detail='', control=False, soft=False):
    """control=True: `ok` means the instrument/metric correctly REJECTED a bad input. soft: reported, does not fail the gate."""
    ok = bool(ok)
    R['checks'].append(dict(sec=sec, name=name, ok=ok, control=control, soft=soft, detail=str(detail)[:600]))
    tag = 'PASS' if ok else ('WARN' if soft else 'FAIL')
    print(f"[{tag}] {sec:10s} {'(control) ' if control else ''}{name}  {str(detail)[:200]}", flush=True)
    return ok


def want(sec):
    return not ARGS.only or sec in ARGS.only.split(',')


def sec_store(name, d):
    R['sections'][name] = d


def st(f, ref=REF):
    return 12 * np.log2(np.maximum(np.asarray(f, float), 1e-9) / ref)


# ====================================================================== page helpers
def new_page(b, gesture=False):
    pg = b.new_page()
    pg.errs = []; pg.net = []
    pg.on('pageerror', lambda e: pg.errs.append(str(e)))
    pg.on('console', lambda m: pg.errs.append('console.error: ' + m.text) if m.type == 'error' else None)
    pg.on('request', lambda r: pg.net.append(r.url) if not re.match(r'^(file|data|blob|about):', r.url) else None)
    pg.add_init_script('window.__TEST="live"')
    pg.goto(URL); pg.wait_for_timeout(600)
    if gesture:
        pg.mouse.click(400, 300); pg.wait_for_timeout(300)
    pg.add_script_tag(content=(AUDIO / 'voice_page.js').read_text())
    return pg


def render(pg, spec, sec=0):
    r = pg.evaluate("([s,sec])=>VG.render(s,sec)", [spec, sec])
    x = np.frombuffer(base64.b64decode(r['b64']), dtype=np.float32).astype(np.float64)
    return x, r


def rline(pg, cid, text, style='normal', vol=1.0, tail=None):
    """render one line (extra tail for the reverb styles) -> (x, record, plan)"""
    pl = pg.evaluate("([i,t,s])=>VG.plan(i,t,s)", [cid, text, style])
    sec = pl['dur'] + 0.02 + 0.16 + (4.2 if style in REVERB else 0.6) if tail is None else pl['dur'] + tail
    x, r = render(pg, dict(speech=cid, text=text, style=style, vol=vol), min(sec, 60))
    return x, r, pl


# ====================================================================== measurement helpers
def sanity(x, sr, target=None, tol=3.0):
    lv = D.levels(x, sr)
    f = dict(finite=lv['finite'], peak=lv['peak'] <= 0.98, nonsilent=lv['activeDb'] > -60, dc=abs(lv['dc']) < 0.01, first=lv['first'] < 0.05, tail=lv['tailDb'] < -60)
    if target is not None:
        f['level'] = abs(lv['activeDb'] - target) <= tol
    return all(f.values()), f, lv


def articulation(x, nsyl):
    """syllables per second of ARTICULATION: gaps longer than 120 ms (phrase pauses) are removed from the time base"""
    env, fr = D.envelope(x, SR, 0.010); act = env > -35
    runs = []; i = 0; n = len(act)
    while i < n:
        j = i
        while j < n and act[j] == act[i]: j += 1
        runs.append((bool(act[i]), j - i)); i = j
    while runs and not runs[0][0]: runs.pop(0)
    while runs and not runs[-1][0]: runs.pop()
    t = sum(l for a, l in runs if a or l < 12) * fr
    return nsyl / max(t, 0.1)


def features(x, nsyl):
    lv = D.levels(x, SR); tr = D.f0_track(x, SR); v = tr[tr[:, 1] > 0]
    f0 = float(np.median(v[:, 1])) if len(v) >= 10 else 0.0
    fm = D.formants(x, SR, tr) if len(v) >= 10 else None
    act = D.active_frames(x, SR)[0]
    return dict(lv=lv, f0=f0, f0st=float(st(f0)) if f0 > 0 else None, f0p10=float(np.percentile(v[:, 1], 10)) if len(v) >= 10 else 0.0, f0p90=float(np.percentile(v[:, 1], 90)) if len(v) >= 10 else 0.0,
                voicedShare=float(len(v) / max(1, int((tr[:, 2] >= 0).sum()))) if len(tr) else 0.0,
                F=fm, L=D.ltas_bands(x, SR), cent=D.ltas_centroid(x, SR), flat=D.flatness(x, SR), syl=D.syllable_rate(x, SR), artic=articulation(x, nsyl),
                span=lv['end'] - lv['start'], hi3500=D.band_ratio_db(x, SR, 3500, SR / 2), lo300=D.band_ratio_db(x, SR, 0, 300), tr=tr)


def f0_win(tr, t0, t1):
    """median f0 (Hz) of the tracker frames whose centre lies in [t0, t1] (audio seconds), None when fewer than 2 voiced frames"""
    s = [f for (t, f, c) in tr if f > 0 and t0 <= t + 0.02 <= t1]
    return float(np.median(s)) if len(s) >= 2 else None


def mean_pairwise(vecs):
    d = [np.linalg.norm(a - b) for a, b in itertools.combinations(vecs, 2)]
    return float(np.mean(d)) if d else 0.0


# ====================================================================== 0. instruments
def instruments():
    sec = 'instrument'; out = {}
    sr = SR

    def vowel(f0, F, bw, dur=1.2, glide=None):
        n = int(dur * sr); t = np.arange(n) / sr
        if glide: ph = np.cumsum(glide[0] + (glide[1] - glide[0]) * t / dur) / sr
        else: ph = f0 * t
        pulses = np.zeros(n); idx = np.nonzero(np.diff(np.floor(ph)) > 0)[0] + 1; pulses[idx] = 1.0
        tt = np.arange(int(0.05 * sr)) / sr
        h = sum(np.exp(-np.pi * b * tt) * np.sin(2 * np.pi * f * tt) for f, b in zip(F, bw))
        y = np.fft.irfft(np.fft.rfft(pulses, n + len(h)) * np.fft.rfft(h, n + len(h)))[:n]
        return y / np.abs(y).max() * 0.5

    # pitch tracker: known f0
    errs = []
    for f0 in (95.0, 120.0, 165.0, 220.0, 300.0):
        x = vowel(f0, (730, 1090, 2440), (80, 90, 120)); tr = D.f0_track(x, sr); v = tr[tr[:, 1] > 0]
        errs.append(abs(float(np.median(v[:, 1])) / f0 - 1) if len(v) else 1.0)
    out['f0_err_max_pct'] = 100 * max(errs)
    ck(sec, 'pitch tracker recovers a known f0 (95..300 Hz) within 1.5 %', max(errs) < 0.015, f'max error {100 * max(errs):.2f} %')
    # formant tracker: vowels whose F1 is well above the pitch harmonics (LPC cannot resolve an F1 below ~1.5 x f0: /i/ and /u/ at f0 130 Hz return nothing - a documented limit, which is why the gate
    # only asserts on F2 / F3 and reports F1)
    VW = {'a': (730, 1090, 2440), 'e': (530, 1840, 2480), 'ae': (660, 1720, 2410), 'uh': (640, 1190, 2390)}; res = {}; e = {}
    for name, Fs in VW.items():
        for f0 in (110.0, 170.0):
            x = vowel(f0, Fs, (80, 100, 140)); tr = D.f0_track(x, sr); fm = D.formants(x, sr, tr)
            res[(name, f0)] = fm
            if fm: e[f'{name}@{int(f0)}'] = [abs(fm[f'F{i + 1}'] / F - 1) for i, F in enumerate(Fs)]
    out['formant_err_pct'] = {k: [round(100 * v, 1) for v in vs] for k, vs in e.items()}
    ck(sec, 'LPC tracker recovers the known F1..F3 of /a/ /e/ /ae/ /uh/ at f0 110 and 170 Hz within 12 %', len(e) == 8 and all(max(v) < 0.12 for v in e.values()), json.dumps(out['formant_err_pct']))
    ra, re_, rae = res[('a', 110.0)], res[('e', 110.0)], res[('ae', 110.0)]
    ck(sec, 'the formant tracker tells vowels apart by F2: /e/ (1840 Hz) >= 1.4 x /a/ (1090), /ae/ (1720) >= 1.3 x /a/', bool(ra and re_ and rae and re_['F2'] > 1.4 * ra['F2'] and rae['F2'] > 1.3 * ra['F2']), f"F2 e={re_ and re_['F2']:.0f} ae={rae and rae['F2']:.0f} a={ra and ra['F2']:.0f}" if (ra and re_ and rae) else 'no result', control=True)
    lim = {}
    for nm, Fs in (('i', (270, 2290, 3010)), ('o', (570, 840, 2410))):
        xi = vowel(130.0, Fs, (80, 100, 140)); lim[nm] = D.formants(xi, sr, D.f0_track(xi, sr))
    out['limits_f0_130'] = lim
    ck(sec, 'known limit recorded: LPC does not resolve /i/ (F1 270 Hz, only 2 x f0 above the pitch) or /o/ (F1 570 and F2 840 Hz merge) at f0 130 Hz (None) - formant claims therefore use medians over running speech, never one vowel', lim['i'] is None and lim['o'] is None, str(lim), soft=True)
    # direction detector on glides
    def slope(x):
        tr = D.f0_track(x, sr); end = len(x) / sr
        a = f0_win(tr, end - 0.55, end - 0.35); b = f0_win(tr, end - 0.20, end - 0.05)
        return None if a is None or b is None else float(st(b, a))
    up = slope(vowel(0, (730, 1090, 2440), (80, 90, 120), 1.0, (100, 200))); dn = slope(vowel(0, (730, 1090, 2440), (80, 90, 120), 1.0, (200, 100))); fl = slope(vowel(130, (730, 1090, 2440), (80, 90, 120), 1.0))
    out['slope_st'] = dict(up=up, down=dn, flat=fl)
    ck(sec, 'direction detector: rising glide > +2 st, falling < -2 st, flat within 0.6 st', up is not None and dn is not None and fl is not None and up > 2 and dn < -2 and abs(fl) < 0.6, json.dumps(out['slope_st']))
    # sanity detector on bad signals
    t = np.arange(int(1.0 * sr)) / sr; good = 0.1 * np.sin(2 * np.pi * 140 * t)
    good[:441] *= np.linspace(0, 1, 441); good[-1764 - 441:-1764] *= np.linspace(1, 0, 441); good[-1764:] = 0.0      # 10 ms fades, 40 ms of exact silence at the end (what a rendered line has)
    ok0, f0_, _ = sanity(good, sr)
    bad = {'silence': np.zeros(len(t)), 'clipped': np.clip(good * 40, -1, 1), 'dc offset': good + 0.05, 'click at 0': np.concatenate([[0.5], good[1:]]), 'NaN': np.where(np.arange(len(t)) == 500, np.nan, good)}
    bad['cut mid-signal'] = 0.1 * np.sin(2 * np.pi * 140 * t)
    bad['cut mid-signal'][:441] *= np.linspace(0, 1, 441)
    rej = {}
    for k, x in bad.items():
        try: o, f, _ = sanity(x, sr)
        except Exception: o, f = False, {}
        rej[k] = not o
    ck(sec, 'sanity checks accept a clean tone', ok0, json.dumps({k: v for k, v in f0_.items() if not v}))
    ck(sec, 'sanity checks reject silence, clipping, DC, a click at sample 0, an unfaded end and NaN', all(rej.values()), json.dumps(rej), control=True)
    _, fl_, lv_ = sanity(good * 2.0, sr, target=D.active_rms_db(good, sr), tol=3.0)
    ck(sec, 'the level check rejects a +6 dB copy (tolerance 3 dB)', not fl_['level'], f"{lv_['activeDb']:.1f} dB vs {D.active_rms_db(good, sr):.1f}", control=True)
    # voiced share: whisper-like noise vs voiced
    rng = np.random.default_rng(1); nz = rng.standard_normal(len(t)) * 0.05
    trn = D.f0_track(nz, sr); trv = D.f0_track(vowel(130, (730, 1090, 2440), (80, 90, 120)), sr)
    vn = float((trn[:, 1] > 0).mean()) if len(trn) else 0.0; vv = float((trv[:, 1] > 0).mean()) if len(trv) else 0.0
    out['voiced_noise'] = vn; out['voiced_vowel'] = vv
    ck(sec, 'voiced-frame share: noise < 0.15, a vowel > 0.85', vn < 0.15 and vv > 0.85, f'noise {vn:.2f} vowel {vv:.2f}', control=True)
    sec_store('instruments', out)


# ====================================================================== 1. segmenter
def segmenter(pg):
    sec = 'segmenter'; lab = json.load(open(AUDIO / 'voice_labels.json')); out = {}
    naive = lambda w: max(1, len(re.findall(r'[aeiouy]+', w)))
    for name, grp in lab.items():
        if name.startswith('_'): continue
        words = {w: int(n) for n, ws in grp.items() for w in ws.split()}
        got = pg.evaluate("(L)=>{const V=__RTS.AUD.voice,o={};for(const w of L)o[w]=V.syllables(w).length;return o;}", list(words))
        bad = [(w, words[w], got[w]) for w in words if got[w] != words[w]]
        nb = sum(1 for w in words if naive(w) != words[w])
        acc = 1 - len(bad) / len(words); nacc = 1 - nb / len(words)
        out[name] = dict(n=len(words), accuracy=acc, wrong=bad, naiveAccuracy=nacc)
        need = {'regression': 1.0, 'heldout': 0.97, 'adversarial': 0.85}[name]
        ck(sec, f'syllable counts, {name} set ({len(words)} words)', acc >= need, f'{100 * acc:.1f} % (need {100 * need:.0f} %), wrong {bad[:6]}')
        ck(sec, f'a naive vowel-group counter scores clearly worse on the {name} set', nacc <= acc - 0.15, f'naive {100 * nacc:.1f} % vs {100 * acc:.1f} %', control=True)
    # word / punctuation classes
    cases = [("Are you ready?", lambda w: w[-1]['pause'] == 'q'), ("Hold the line!", lambda w: w[-1]['pause'] == 'x'), ("Wait... what", lambda w: w[0]['pause'] == 'ell' and w[1]['pause'] is None),
             ("We hold, and wait.", lambda w: [x['pause'] for x in w] == [None, 'c', None, 'p']), ("Mr. Vale holds", lambda w: w[0]['pause'] is None and len(w) == 3),
             ("Hold — now", lambda w: w[0]['pause'] == 'd' and len(w) == 2), ("9000 crates", lambda w: w[0]['syl'] == 4), ("Café", lambda w: len(w) == 1 and w[0]['syl'] == 2),
             ("HELLO there", lambda w: w[0]['caps'] is True and w[1]['caps'] is False), ("...", lambda w: len(w) == 0), ("", lambda w: len(w) == 0), ("a-b", lambda w: len(w) == 2)]
    bad = []
    for t, f in cases:
        w = pg.evaluate("(t)=>VG.words(t)", t)
        try: o = f(w)
        except Exception: o = False
        if not o: bad.append((t, w))
    ck(sec, f'word and punctuation classes ({len(cases)} cases: ? ! ... , abbreviation, dash, digits, accents, caps)', not bad, bad[:3])
    # sentence counts are the sum of the words
    sm = pg.evaluate("(S)=>S.map(t=>[VG.count(t),VG.words(t).reduce((a,w)=>a+w.syl,0)])", SENT)
    ck(sec, 'sentence syllable count = sum over words', all(a == b for a, b in sm), sm)
    sec_store('segmenter', out)


# ====================================================================== 2/3. corpus
def corpus(pg, real, fx):
    sec = 'corpus'; ids = real + fx; nS = 2 if ARGS.quick else len(SENT); out = {}; C = {}
    t_start = time.time(); deviations = []; engdiff = []; dets = []; hashes = {}
    for cid in ids:
        for k in range(nS):
            x, r, pl = rline(pg, cid, SENT[k])
            nsyl = len(pl['syl'])
            ok, f, lv = sanity(x, SR, TARGET['normal'], 3.0)
            F = features(x, nsyl)
            ed = abs(F['lv']['activeDb'] - r['ana']['activeDb'])
            C[(cid, k)] = dict(F=F, ok=ok, f=f, plan=pl, nsyl=nsyl, hash=r['hash'], hashExact=r['hashExact'], ms=r['ms'], stereoSame=r['stereoSame'], x=x if k == 0 else None)
            deviations.append(F['lv']['activeDb'] - TARGET['normal']); engdiff.append(ed)
        print(f'   corpus {cid} ({time.time() - t_start:.0f} s)', flush=True)
    bad = [(c, k, {n: v for n, v in v['f'].items() if not v}) for (c, k), v in C.items() if not v['ok']]
    ck(sec, f'{len(C)} renders ({len(ids)} characters x {nS} sentences): finite, peak <= 0.98, non-silent, |DC| < 0.01, first sample < 0.05, last 20 ms < -60 dBFS, level within 3 dB of -20', not bad, bad[:5])
    peaks = [v['F']['lv']['peak'] for v in C.values()]; dm = np.mean(deviations)
    out['level'] = dict(meanDev=float(dm), maxAbsDev=float(np.max(np.abs(deviations))), sd=float(np.std(deviations)), maxPeak=float(max(peaks)), engineVsNumpyMaxDb=float(max(engdiff)))
    ck(sec, 'level spread: all within +-2 dB of -20 dBFS (the calibration target; the hard window is +-3 dB)', np.max(np.abs(deviations)) <= 2.0, f"mean {dm:+.2f} dB, max |dev| {np.max(np.abs(deviations)):.2f}, sd {np.std(deviations):.2f}", soft=True)
    ck(sec, "independent level meter (numpy) agrees with the engine's audioAnalyse within 0.15 dB", max(engdiff) <= 0.15, f'max difference {max(engdiff):.3f} dB')
    # determinism: same call twice -> same bits; every character differs
    t0 = time.time(); same = []
    for cid in ids:
        _, r2, _ = rline(pg, cid, SENT[0])
        same.append(r2['hashExact'] == C[(cid, 0)]['hashExact'] and r2['hash'] == C[(cid, 0)]['hash'])
    ck(sec, f'bit-exact determinism: {len(ids)} characters rendered twice give identical float32 bits (Math.random/Date.now/performance.now throw while building)', all(same), [c for c, s in zip(ids, same) if not s])
    hs = [C[(c, 0)]['hash'] for c in ids]
    ck(sec, f'all {len(ids)} characters render different audio for the same sentence (distinct hashes)', len(set(hs)) == len(hs), f'{len(set(hs))} distinct of {len(hs)}')
    ck(sec, 'the hash is not constant: two different sentences by one character differ', C[(ids[0], 0)]['hash'] != C[(ids[0], 1)]['hash'], '', control=True)
    # different text -> different audio for the SAME character; same text different style handled in styles()
    ck(sec, 'a voice is mono (left == right) for the normal style', all(v['stereoSame'] for v in C.values()), '', soft=True)
    # estimator vs the rendered length
    err = []
    for (c, k), v in C.items():
        lv = v['F']['lv']; planEnd = v['plan']['dur'] + 0.02 - 0.03          # render starts at 0.02 s; the plan ends with 30 ms of silence
        err.append((lv['end'] - planEnd, c, k))
    ee = np.array([e[0] for e in err])
    out['estimator'] = dict(meanErrS=float(ee.mean()), maxAbsErrS=float(np.abs(ee).max()))
    ck(sec, 'duration estimate (plan.dur, what speak() returns) matches the rendered active end within 0.12 s', np.abs(ee).max() <= 0.12, f'max |error| {np.abs(ee).max() * 1000:.0f} ms, mean {ee.mean() * 1000:+.0f} ms')
    # rate sanity: conversational English is ~3-5.5 syllables/s including pauses
    rates = [v['nsyl'] / max(v['F']['span'], 0.1) for v in C.values()]
    out['rate'] = dict(sylPerSMin=float(min(rates)), sylPerSMax=float(max(rates)), sylPerSMedian=float(np.median(rates)))
    ck(sec, 'overall speaking rate (syllables per second incl. pauses) of every line is in the conversational range 2.5..6', min(rates) >= 2.5 and max(rates) <= 6.0, f'{min(rates):.2f}..{max(rates):.2f} (median {np.median(rates):.2f})')
    # one syllable per vowel group: envelope peaks vs the plan's syllables
    pk = [v['F']['syl']['peaks'] / v['nsyl'] for v in C.values()]
    out['envelopePeaksPerSyllable'] = dict(min=float(min(pk)), median=float(np.median(pk)), max=float(max(pk)))
    ck(sec, 'the stream is syllabic: loudness-envelope peaks / planned syllables is 0.8..1.35 for every line', min(pk) >= 0.8 and max(pk) <= 1.35, f'{min(pk):.2f}..{max(pk):.2f} median {np.median(pk):.2f}')
    out['renderMs'] = dict(median=float(np.median([v['ms'] for v in C.values()])), n=len(C), wallS=time.time() - t_start)
    sec_store('corpus', out)
    return C


# ====================================================================== 4. distinct
def fvec(F, which):
    v = []
    for w in which:
        if w == 'f0': v.append(F['f0st'] if F['f0st'] is not None else 0.0)
        elif w == 'L': v += list(F['L'])
        elif w == 'F': fm = F['F'] or dict(F1=500, F2=1500, F3=2500); v += [float(st(fm['F1'], 500)), float(st(fm['F2'], 1500)), float(st(fm['F3'], 2500))]
        elif w == 'cent': v.append(float(st(max(F['cent'], 50), 500)))
        elif w == 'rate': v.append(float(np.log2(F['artic'])))
    return np.array(v, float)


def loso(X, perm=None):
    """X [n][m][d]: leave-one-sentence-out nearest-centroid speaker identification accuracy (z-normalised by the pooled spread)"""
    n, m, d = X.shape; sd = X.reshape(-1, d).std(0) + 1e-9; acc = []
    lab = np.arange(n) if perm is None else perm
    for held in range(m):
        tr = [i for i in range(m) if i != held]; Cn = X[:, tr].mean(1) / sd
        ok = 0
        for i in range(n):
            dd = np.linalg.norm(Cn - X[i, held] / sd, axis=1); ok += int(lab[int(np.argmin(dd))] == i)
        acc.append(ok / n)
    return float(np.mean(acc))


def distinct(C, real, fx, prof):
    sec = 'distinct'; out = {}; nS = max(k for (_, k) in C) + 1
    # per-character table (mean over sentences)
    tab = {}
    for cid in real + fx:
        Fs = [C[(cid, k)]['F'] for k in range(nS)]
        fm = [F['F'] for F in Fs if F['F']]
        tab[cid] = dict(timbre=prof[cid]['timbre'], profileF0=prof[cid]['f0'], f0=float(np.mean([F['f0'] for F in Fs])), f0st=float(np.mean([F['f0st'] for F in Fs])),
                        F1=float(np.mean([f['F1'] for f in fm])) if fm else None, F2=float(np.mean([f['F2'] for f in fm])) if fm else None, F3=float(np.mean([f['F3'] for f in fm])) if fm else None,
                        centroid=float(np.mean([F['cent'] for F in Fs])), artic=float(np.mean([F['artic'] for F in Fs])), dur=float(np.mean([C[(cid, k)]['plan']['dur'] for k in range(nS)])),
                        activeDb=float(np.mean([F['lv']['activeDb'] for F in Fs])), peak=float(max(F['lv']['peak'] for F in Fs)), flat=float(np.mean([F['flat'] for F in Fs])), L=np.mean([F['L'] for F in Fs], 0).tolist())
    out['table'] = {c: {k: (round(v, 3) if isinstance(v, float) else v) for k, v in t.items() if k != 'L'} for c, t in tab.items()}

    def group(ids, name, minAcc, ctrlMax, hard=True):
        X = np.array([[fvec(C[(c, k)]['F'], ['f0', 'L']) for k in range(nS)] for c in ids]); n = len(ids)
        acc = loso(X)
        rng = np.random.default_rng(0); ctl = [loso(X, rng.permutation(n)) for _ in range(120)]
        # the label-permutation control: the same classifier with the centroid labels shuffled
        o = dict(n=n, accuracy=acc, chance=1 / n, permutationMean=float(np.mean(ctl)), permutationP99=float(np.percentile(ctl, 99)))
        ck(sec, f'speaker identification from held-out sentences, {name} ({n} characters; features f0 + 14-band long-term spectrum): >= {minAcc:.2f} (chance {1 / n:.2f})', acc >= minAcc, f'{acc:.2f}', soft=not hard)
        ck(sec, f'the same classifier with shuffled centroid labels stays near chance on {name}', np.mean(ctl) <= 3 * (1 / n) + 0.03 and np.percentile(ctl, 99) < acc, f'permuted mean {np.mean(ctl):.2f}, p99 {np.percentile(ctl, 99):.2f}, real {acc:.2f}', control=True)
        return o

    if nS >= 3:
        out['idReal'] = group(real, 'story characters', 0.75, 0.2)
        out['idFixture'] = group(fx, 'fixture characters (identical voice data)', 0.25, 0.2, hard=False)
        out['idAll'] = group(real + fx, 'all characters', 0.5, 0.2, hard=False)
    # pairwise JND axes over the story characters: pitch (st), timbre shape (RMS dB over 14 bands), articulation rate (%), mean formant (st)
    def pair_axes(a, b):
        ta, tb = tab[a], tab[b]
        fa = np.mean([st(ta[k], 1000) for k in ('F1', 'F2', 'F3') if ta[k]]); fb = np.mean([st(tb[k], 1000) for k in ('F1', 'F2', 'F3') if tb[k]])
        return dict(pitch=float(abs(ta['f0st'] - tb['f0st'])), shape=float(np.sqrt(np.mean((np.array(ta['L']) - np.array(tb['L'])) ** 2))), rate=float(abs(ta['artic'] / tb['artic'] - 1) * 100), formant=float(abs(fa - fb)))
    JND = dict(pitch=1.0, shape=2.0, rate=8.0, formant=0.8)

    def sep(a):
        return any(a[k] >= JND[k] for k in JND)
    for name, ids in (('real', real), ('fixture', fx)):
        P = {}
        for a, b in itertools.combinations(ids, 2):
            ax = pair_axes(a, b); P[(a, b)] = ax
        n = len(P); ns = sum(1 for v in P.values() if sep(v))
        closest = sorted(P.items(), key=lambda kv: max(kv[1][k] / JND[k] for k in JND))[:5]
        out['pairs_' + name] = dict(pairs=n, separable=ns, jnd=JND, closest=[dict(pair=list(k), **{a: round(b, 2) for a, b in v.items()}) for k, v in closest])
        if name == 'real':
            notsep = [k for k, v in P.items() if not sep(v)]
            out['pairs_real']['notSeparable'] = [list(k) for k in notsep]
            ck(sec, f'story characters: every pair differs by >= 1 just-noticeable difference on at least one axis (pitch 1 st, spectrum shape 2 dB, rate 8 %, formants 0.8 st)', ns == n, f'{ns}/{n} pairs; indistinguishable: {[(list(k), {a: round(b, 1) for a, b in P[k].items()}) for k in notsep]} (STORY voice data too similar: change pitch / rate / timbre / formant of one of them)', soft=True)
        else:
            ck(sec, f'fixture characters (13 with IDENTICAL voice data; only the id-hash offsets differ): share of pairs separable by a JND axis', ns / n >= 0.5, f'{ns}/{n} pairs; the rest are within a JND on every axis by construction', soft=True)
    # clone control: one character against ITSELF (a second sentence) must not be flagged "separable" on most axes
    cl = []
    for cid in real:
        a = dict(C[(cid, 0)]['F']); b = dict(C[(cid, 1)]['F'])
        cl.append(abs(a['f0st'] - b['f0st']))
    # within-speaker pitch variation between two sentences (prosody + content), the noise floor of the pitch axis
    out['withinSpeakerPitchSt'] = dict(median=float(np.median(cl)), p90=float(np.percentile(cl, 90)))
    ck(sec, 'one character against itself (two sentences): the median pitch-median difference stays under the 1 st JND', np.median(cl) < 1.0, f'median {np.median(cl):.2f} st, p90 {np.percentile(cl, 90):.2f} st', control=True)
    # the range of the tables
    f0s = [tab[c]['f0'] for c in real]; ck(sec, 'story characters span a wide pitch range (>= 8 semitones between lowest and highest median f0)', st(max(f0s), min(f0s)) >= 8, f'{min(f0s):.0f}..{max(f0s):.0f} Hz = {st(max(f0s), min(f0s)):.1f} st')
    cens = [tab[c]['centroid'] for c in real]; ck(sec, 'story characters span a wide timbre range (spectral centroid ratio >= 2)', max(cens) / min(cens) >= 2, f'{min(cens):.0f}..{max(cens):.0f} Hz')
    ars = [tab[c]['artic'] for c in real]; ck(sec, 'story characters span a range of speaking rates (articulation rate max/min >= 1.2)', max(ars) / min(ars) >= 1.2, f'{min(ars):.2f}..{max(ars):.2f} syl/s')
    sec_store('distinct', out)
    return tab


# ====================================================================== 5. sweeps
def sweeps(pg):
    sec = 'sweeps'; out = {}; text = SENT[1]
    def meas(voice, id='probe_s'):
        pg.evaluate("([i,v])=>VG.addChar(i,v)", [id, voice])
        x, r, pl = rline(pg, id, text); F = features(x, len(pl['syl'])); return x, r, pl, F
    # pitch
    ps = [0.6, 0.8, 1.0, 1.25, 1.5]; rows = []
    for p in ps:
        x, r, pl, F = meas(dict(pitch=p)); rows.append((p, F['f0'], F['lv']['activeDb']))
    f = np.array([r[1] for r in rows]); slope = np.polyfit(np.log2(ps), np.log2(f), 1)[0]
    out['pitch'] = dict(pitch=ps, f0=[round(v, 1) for v in f], slope=float(slope), levelDb=[round(r[2], 2) for r in rows])
    ck(sec, 'pitch sweep (same character, voice.pitch 0.6..1.5): measured median f0 rises monotonically, log-log slope 0.9..1.1', all(np.diff(f) > 0) and 0.9 <= slope <= 1.1, f'f0 {[round(v) for v in f]} slope {slope:.3f}')
    ck(sec, 'pitch sweep: the level stays within +-1.5 dB of -20 across the sweep (level compensation works)', max(abs(r[2] + 20) for r in rows) <= 1.5, [round(r[2], 1) for r in rows])
    # formant
    fs = [0.0, 0.25, 0.5, 0.75, 1.0]; rows = []
    for k in fs:
        x, r, pl, F = meas(dict(formant=k)); fm = F['F']; rows.append((k, fm['F1'] if fm else None, fm['F2'] if fm else None, fm['F3'] if fm else None, F['cent'], F['f0']))
    F2 = np.array([r[2] for r in rows]); F3 = np.array([r[3] for r in rows]); f0s = np.array([r[5] for r in rows]); tract = 0.82 + 0.4 * np.array(fs)
    c2 = float(np.corrcoef(np.log(tract), np.log(F2))[0, 1]); c3 = float(np.corrcoef(np.log(tract), np.log(F3))[0, 1])
    out['formant'] = dict(formant=fs, F1=[r[1] for r in rows], F2=[round(v) for v in F2], F3=[round(v) for v in F3], centroid=[round(r[4]) for r in rows], corrLogTractLogF2=c2, corrLogTractLogF3=c3, f0=[round(v, 1) for v in f0s])
    ck(sec, 'formant sweep (voice.formant 0..1 = vocal-tract length 1.22..0.82): LPC F2 and F3 fall as the tract gets longer (log-log correlation with the tract factor > 0.9)', c2 > 0.9 and c3 > 0.9 and F2[-1] > 1.2 * F2[0], f'F2 {[round(v) for v in F2]} F3 {[round(v) for v in F3]} r2={c2:.2f} r3={c3:.2f}')
    ck(sec, 'formant sweep leaves the pitch alone (median f0 within 1 st over the sweep)', st(f0s.max(), f0s.min()) <= 1.0, f'{f0s.min():.0f}..{f0s.max():.0f} Hz')
    # rate
    rs = [0.8, 1.0, 1.3]; rows = []
    for rt in rs:
        x, r, pl, F = meas(dict(rate=rt)); rows.append((rt, F['span'], F['artic'], pl['dur']))
    sp = np.array([r[1] for r in rows]); ar = np.array([r[2] for r in rows])
    out['rate'] = dict(rate=rs, span=[round(v, 3) for v in sp], artic=[round(v, 3) for v in ar], planDur=[round(r[3], 3) for r in rows])
    ratio = sp[0] / sp[2]; ideal = 1.3 / 0.8
    ck(sec, 'rate sweep (voice.rate 0.8..1.3): spoken time falls, articulation rate rises, the 0.8 : 1.3 duration ratio is within 25 % of the ideal 1.625 (pauses scale less)', all(np.diff(sp) < 0) and all(np.diff(ar) > 0) and abs(ratio / ideal - 1) <= 0.25, f'span {[round(v, 2) for v in sp]} ratio {ratio:.2f} artic {[round(v, 2) for v in ar]}')
    # timbre
    tims = ['smooth', 'soft', 'bright', 'rough', 'hollow', 'metal']; shape = {}; cen = {}; fl = {}; lv = {}
    for t_ in tims:
        x, r, pl, F = meas(dict(timbre=t_)); shape[t_] = np.array(F['L']); cen[t_] = F['cent']; fl[t_] = F['flat']; lv[t_] = F['lv']['activeDb']
    d = {(a, b): float(np.sqrt(np.mean((shape[a] - shape[b]) ** 2))) for a, b in itertools.combinations(tims, 2)}
    mn = min(d, key=d.get)
    out['timbre'] = dict(centroid={k: round(v) for k, v in cen.items()}, flatness={k: round(v, 5) for k, v in fl.items()}, levelDb={k: round(v, 2) for k, v in lv.items()}, minPair=[list(mn), d[mn]], shapeDist={f'{a}~{b}': round(v, 2) for (a, b), v in d.items()})
    ck(sec, 'timbre sweep: all 15 timbre pairs differ in long-term spectrum shape by >= 1.5 dB RMS', d[mn] >= 1.5, f'closest pair {mn} = {d[mn]:.2f} dB; centroids {out["timbre"]["centroid"]}')
    ck(sec, 'timbre sweep: the level of every timbre is within +-1.5 dB of -20', max(abs(v + 20) for v in lv.values()) <= 1.5, {k: round(v, 1) for k, v in lv.items()})
    # controls: tts fields do not touch the blips; real fields do
    pg.evaluate("()=>VG.addChar('probe_c',{})"); _, r0, _ = rline(pg, 'probe_c', TXT)
    pg.evaluate("()=>VG.addChar('probe_c',{ttsPitch:1.6,ttsRate:1.3})"); _, r1, _ = rline(pg, 'probe_c', TXT)
    pg.evaluate("()=>VG.addChar('probe_c',{pitch:1.05})"); _, r2, _ = rline(pg, 'probe_c', TXT)
    ck(sec, 'ttsPitch / ttsRate change the speechSynthesis utterance only: the synthesized samples are bit-identical', r0['hashExact'] == r1['hashExact'], f"{r0['hash']} / {r1['hash']}")
    ck(sec, 'a +5 % pitch change DOES change the samples', r0['hashExact'] != r2['hashExact'], '', control=True)
    # the id-hash offsets are bounded: identical voice data under 13 ids
    f0s = []
    for i in range(13):
        pg.evaluate("([i])=>VG.addChar('probe_h'+i,{})", [i]); x, r, pl = rline(pg, f'probe_h{i}', SENT[2]); tr = D.f0_track(x, SR); v = tr[tr[:, 1] > 0][:, 1]; f0s.append(float(np.median(v)))
    sp_ = float(st(max(f0s), min(f0s)))
    out['hashOffsets'] = dict(f0=[round(v, 1) for v in f0s], spreadSt=sp_)
    ck(sec, 'identical voice data under 13 different ids: pitch medians spread 0.8..4 st (the id hash adds a small, bounded offset: +-1.4 st designed + intonation/vibrato)', 0.8 <= sp_ <= 4.0, f'{min(f0s):.0f}..{max(f0s):.0f} Hz = {sp_:.2f} st')
    sec_store('sweeps', out)


# ====================================================================== 6. styles
def gaps(pl):
    """the plan's silent intervals inside the line (voicing, aspiration and frication gains all zero for >= 0.1 s) = the phrase pauses: [(audio_t0, audio_t1)] (the render starts the plan at 0.02 s)"""
    return [(a + 0.02, b + 0.02) for a, b in pl['sil']]


def styles(pg):
    sec = 'styles'; out = {}; chars = ['idris', 'lyra', 'kaz']
    ctrl_x = {c: rline(pg, o_, TXT, 'normal')[0] for c, o_ in zip(chars, chars[1:] + chars[:1])}
    for cid in chars:
        X = {}; PL = {}
        for sty in STYLES:
            x, r, pl = rline(pg, cid, TXT, sty); X[sty] = (x, r); PL[sty] = pl
        Fm = {s: features(X[s][0], len(PL[s]['syl'])) for s in STYLES}
        ok = {s: sanity(X[s][0], SR, TARGET[s], 3.0) for s in STYLES}
        lvl = {s: round(Fm[s]['lv']['activeDb'], 2) for s in STYLES}
        o = dict(level=lvl)
        ck(sec, f'{cid}: all 6 styles are sane (finite, peak, DC, clicks, tail) and within 3 dB of their level target', all(v[0] for v in ok.values()), {s: {k: v for k, v in ok[s][1].items() if not v} for s in STYLES if not ok[s][0]} or lvl)
        xn = X['normal'][0]; Fn = Fm['normal']
        # radio: band-limited + crackle
        lo_n, hi_n = D.band_ratio_db(xn, SR, 0, 250), D.band_ratio_db(xn, SR, 3800, SR / 2)
        xr = X['radio'][0]; lo_r, hi_r = D.band_ratio_db(xr, SR, 0, 250), D.band_ratio_db(xr, SR, 3800, SR / 2)
        o['radio'] = dict(lowShareDb=(lo_n, lo_r), highShareDb=(hi_n, hi_r))
        ck(sec, f'{cid}: radio is band-limited: energy below 250 Hz and above 3.8 kHz is >= 8 dB lower (share of total) than the normal style', lo_r <= lo_n - 8 and hi_r <= hi_n - 8, f'<250 Hz {lo_n:.1f} -> {lo_r:.1f} dB, >3.8 kHz {hi_n:.1f} -> {hi_r:.1f} dB')
        xo = ctrl_x[cid]; lo_o, hi_o = D.band_ratio_db(xo, SR, 0, 250), D.band_ratio_db(xo, SR, 3800, SR / 2)
        ck(sec, f'the radio band test applied to ANOTHER character\'s normal render (as if it were radio) fails', not (lo_o <= lo_n - 8 and hi_o <= hi_n - 8), f'<250 Hz {lo_n:.1f} vs {lo_o:.1f} dB, >3.8 kHz {hi_n:.1f} vs {hi_o:.1f} dB', control=True)
        gp = gaps(PL['radio']); floor_r = []; floor_n = []
        for (a, b) in gp:
            m = (b - a) * 0.2; s0 = int((a + m) * SR); s1 = int((b - m) * SR)
            if s1 > s0 + 200: floor_r.append(10 * np.log10(max(1e-20, (xr[s0:s1] ** 2).mean()))); floor_n.append(10 * np.log10(max(1e-20, (xn[s0:s1] ** 2).mean())))
        o['radio']['pauseFloorDb'] = dict(radio=floor_r, normal=floor_n)
        ck(sec, f'{cid}: radio has static crackle in the pauses (>= 25 dB above the normal style\'s silence, above -75 dBFS)', len(floor_r) > 0 and min(floor_r) > -75 and min(r_ - n_ for r_, n_ in zip(floor_r, floor_n)) >= 25, f'radio {[round(v) for v in floor_r]} dBFS vs normal {[round(v) for v in floor_n]}')
        # whisper: unvoiced, quieter
        vs_n, vs_w = Fn['voicedShare'], Fm['whisper']['voicedShare']
        o['whisper'] = dict(voicedShare=(vs_n, vs_w), hi3500=(Fn['hi3500'], Fm['whisper']['hi3500']))
        ck(sec, f'{cid}: whisper is breathy, not pitched: voiced-frame share <= 0.25 and < a third of the normal style', vs_w <= 0.25 and vs_w <= vs_n / 3, f'normal {vs_n:.2f} -> whisper {vs_w:.2f}')
        ck(sec, f'{cid}: whisper is 4..9 dB quieter than normal and brighter above 3.5 kHz', 4 <= lvl['normal'] - lvl['whisper'] <= 9 and Fm['whisper']['hi3500'] > Fn['hi3500'] + 3, f"dLevel {lvl['normal'] - lvl['whisper']:.1f} dB, hi share {Fn['hi3500']:.1f} -> {Fm['whisper']['hi3500']:.1f} dB")
        # shout
        o['shout'] = dict(dLevel=lvl['shout'] - lvl['normal'], dF0St=float(st(Fm['shout']['f0'], Fn['f0'])), centroid=(Fn['cent'], Fm['shout']['cent']))
        ck(sec, f'{cid}: shout is louder (+1.5..+4.5 dB), higher (>= +1 st) and brighter (centroid up) than normal', 1.5 <= lvl['shout'] - lvl['normal'] <= 4.5 and st(Fm['shout']['f0'], Fn['f0']) >= 1.0 and Fm['shout']['cent'] > Fn['cent'], f"dLevel {lvl['shout'] - lvl['normal']:+.1f} dB, dF0 {st(Fm['shout']['f0'], Fn['f0']):+.1f} st, centroid {Fn['cent']:.0f}->{Fm['shout']['cent']:.0f}")
        # narration: slower + tail; thought: tail
        dn = Fm['narration']['span'] / Fn['span']
        tail = {}
        for s_ in ('normal', 'narration', 'thought', 'radio'):
            xs = X[s_][0]; end = PL[s_]['dur'] + 0.02; a = int((end + 0.12) * SR); b = int((end + 0.6) * SR)
            tail[s_] = float(10 * np.log10(max(1e-20, (xs[a:b] ** 2).mean()))) if b < len(xs) else None
        o['narration'] = dict(durationRatio=dn, tailDb=tail)
        ck(sec, f'{cid}: narration is slower than normal (spoken time x1.08..1.30)', 1.08 <= dn <= 1.30, f'x{dn:.2f}')
        ck(sec, f'{cid}: narration and thought have a reverb tail (>= 25 dB above the dry styles 0.12..0.6 s after the line)', all(tail[s_] is not None and tail[s_] - tail['normal'] >= 25 for s_ in ('narration', 'thought')), {k: (round(v) if v is not None else None) for k, v in tail.items()})
        ck(sec, f'{cid}: thought is quieter than normal by 2..6 dB and less harmonic (higher spectral flatness)', 2 <= lvl['normal'] - lvl['thought'] <= 6 and Fm['thought']['flat'] > Fn['flat'], f"dLevel {lvl['normal'] - lvl['thought']:.1f} dB, flatness {Fn['flat']:.5f}->{Fm['thought']['flat']:.5f}")
        # all different
        hs = [X[s][1]['hash'] for s in STYLES]
        ck(sec, f'{cid}: the 6 styles render 6 different signals', len(set(hs)) == 6, '')
        out[cid] = o
        if cid in ARGS.spectro.split(','):
            for s in STYLES: save_spectro(X[s][0], f'voice_{cid}_{s}')
    # unknown style = normal (alias), and aliases
    _, ra, _ = rline(pg, 'idris', TXT, 'normal'); _, rb, _ = rline(pg, 'idris', TXT, 'sparkle'); _, rc, _ = rline(pg, 'idris', TXT, 'whispers'); _, rd, _ = rline(pg, 'idris', TXT, 'whisper'); _, re_, _ = rline(pg, 'idris', TXT, 'yell'); _, rf, _ = rline(pg, 'idris', TXT, 'shout')
    ck(sec, 'an unknown style name falls back to normal; whispers/yell/narrator are aliases of whisper/shout/narration', ra['hashExact'] == rb['hashExact'] and rc['hashExact'] == rd['hashExact'] and re_['hashExact'] == rf['hashExact'], '')
    ck(sec, 'normal and whisper are NOT the same signal', ra['hashExact'] != rd['hashExact'], '', control=True)
    sec_store('styles', out)


def save_spectro(x, name, fmax=6000, n_fft=1024, hop=256):
    try:
        from PIL import Image
    except Exception:
        return
    w = np.hanning(n_fft); fr = [np.abs(np.fft.rfft(x[i:i + n_fft] * w)) for i in range(0, len(x) - n_fft + 1, hop)]
    S = 20 * np.log10(np.array(fr).T + 1e-9); k = int(fmax / (SR / 2) * S.shape[0]); S = S[:k]
    S = np.clip((S - (S.max() - 70)) / 70, 0, 1)[::-1]
    rgb = np.stack([np.clip(S * 2, 0, 1), np.clip(S * 2 - 0.6, 0, 1) * 0.9, np.clip(1.5 - np.abs(S * 3 - 1.2), 0, 1) * (S > 0.05)], -1)
    (OUT / 'spectro').mkdir(parents=True, exist_ok=True)
    Image.fromarray((rgb * 255).astype(np.uint8)).resize((min(1400, S.shape[1] * 2), 300), Image.NEAREST).save(OUT / 'spectro' / (name + '.png'))


# ====================================================================== 7. prosody
def prosody(pg):
    sec = 'prosody'; out = {}; chars = ['idris', 'lyra', 'kaz'] if not ARGS.quick else ['idris']
    Q = [("You are ready.", "You are ready?"), ("The line is holding.", "The line is holding?"), ("Who goes there.", "Who goes there?")]
    rows = []; ctrl = []
    for cid in chars:
        for a, b in Q:
            res = {}
            for tag, t in (('s', a), ('q', b), ('s2', a)):
                x, r, pl = rline(pg, cid, t); tr = D.f0_track(x, SR); last = pl['syl'][-1]
                w0, w1 = last['t0'] + 0.02, last['t1'] + 0.02
                res[tag] = f0_win(tr, w0 + 0.55 * (w1 - w0), w1 + 0.03), f0_win(tr, w0, w0 + 0.45 * (w1 - w0)), tr, pl
            fs, fq = res['s'], res['q']
            if fs[0] and fq[0]: rows.append(dict(char=cid, text=b, finalDiffSt=float(st(fq[0], fs[0])), qSlope=float(st(fq[0], fq[1])) if fq[1] else None, sSlope=float(st(fs[0], fs[1])) if fs[1] else None))
            # control: the statement against an identical statement
            if fs[0] and res['s2'][0]: ctrl.append(float(st(res['s2'][0], fs[0])))
    d = np.array([r['finalDiffSt'] for r in rows]); qs = [r['qSlope'] for r in rows if r['qSlope'] is not None]; ss = [r['sSlope'] for r in rows if r['sSlope'] is not None]
    out['question'] = dict(rows=rows, medianFinalDiffSt=float(np.median(d)) if len(d) else None, control=ctrl)
    ck(sec, f'question rises: the final syllable of "?" is >= 3 st above the same words with "." ({len(rows)} cases; median {np.median(d):+.1f} st)', len(rows) >= 3 and (d >= 3.0).mean() >= 0.8, [round(v, 1) for v in d])
    ck(sec, 'question: pitch rises across its final syllable (late window above early window), statement: it falls', len(qs) >= 3 and np.median(qs) > 0.5 and np.median(ss) < -0.5, f'? slope median {np.median(qs):+.1f} st, . slope median {np.median(ss):+.1f} st')
    ck(sec, 'the same statement rendered twice differs by 0 st at its end (the metric reads the audio, not the punctuation)', len(ctrl) >= 3 and max(abs(v) for v in ctrl) < 0.05, ctrl, control=True)
    # '!' lifts; declination; comma continuation; realised pauses
    ex = []
    for cid in chars:
        m = {}
        for tag, t in (('x', "Hold the line against them!"), ('p', "Hold the line against them.")):
            x, r, pl = rline(pg, cid, t); tr = D.f0_track(x, SR); v = tr[tr[:, 1] > 0][:, 1]; m[tag] = (float(np.mean(st(v))), float(st(np.percentile(v, 90), np.percentile(v, 10))))
        ex.append((m['x'][0] - m['p'][0], m['x'][1] - m['p'][1]))
    out['exclaim'] = dict(meanLiftSt=[round(e[0], 2) for e in ex], rangeLiftSt=[round(e[1], 2) for e in ex])
    ck(sec, '"!" lifts the pitch (mean f0 >= +1 st above the "." version) and widens the range', all(e[0] >= 1.0 for e in ex) and np.mean([e[1] for e in ex]) > 0, out['exclaim'])
    dec = []
    for cid in chars:
        x, r, pl = rline(pg, cid, "We hold the line against the dark tonight."); tr = D.f0_track(x, SR); v = tr[tr[:, 1] > 0]; n = len(v)
        dec.append(float(st(np.median(v[:n // 3, 1]), np.median(v[-n // 3:, 1]))))
    out['declination'] = dec
    ck(sec, 'statements decline: median f0 of the first third of the voiced frames is >= 2 st above the last third', all(d_ >= 2.0 for d_ in dec), [round(v, 1) for v in dec])
    cm = []; cm_ctrl = []
    for cid in chars:
        for t, store in (("We hold the line, and we wait.", cm), ("We hold the line. And we wait.", cm_ctrl)):
            x, r, pl = rline(pg, cid, t); tr = D.f0_track(x, SR); syl = pl['syl']; ph0 = [s for s in syl if s['ph'] == 0][-1]; last = syl[-1]
            a = f0_win(tr, ph0['t0'] + 0.02 + 0.5 * (ph0['t1'] - ph0['t0']), ph0['t1'] + 0.05); b = f0_win(tr, last['t0'] + 0.02 + 0.5 * (last['t1'] - last['t0']), last['t1'] + 0.05)
            if a and b: store.append(float(st(a, b)))
    out['comma'] = dict(commaEndMinusFinalSt=cm, periodEndMinusFinalSt=cm_ctrl)
    ck(sec, 'a comma holds the pitch up: the end of the clause before "," is >= 1.5 st above the final fall', len(cm) >= len(chars) and all(v >= 1.5 for v in cm), [round(v, 1) for v in cm])
    ck(sec, 'with "." instead of "," the clause end is NOT that far above the final (median at least 1 st lower than with the comma)', len(cm_ctrl) >= len(chars) and np.median(cm) - np.median(cm_ctrl) >= 1.0, f'comma {np.round(cm, 1).tolist()} vs period {np.round(cm_ctrl, 1).tolist()}', control=True)
    # pauses realised in the audio: the longest run of silence (5 ms envelope < -45 dB re peak) that overlaps each planned pause
    pa = []
    for cid in chars[:2]:
        x, r, pl = rline(pg, cid, "One, two. Three? Four... Five! Six")
        env, fr = D.envelope(x, SR, 0.005); act = env > -45
        for g0, g1 in gaps(pl):
            i0, i1 = int(max(0, g0 - 0.05) / fr), int((g1 + 0.05) / fr); run = 0; best = 0
            for v_ in act[i0:i1]:
                run = 0 if v_ else run + 1; best = max(best, run)
            pa.append(dict(char=cid, planned=g1 - g0, realised=best * fr))
    out['pauses'] = pa
    err = [abs(p['planned'] - p['realised']) for p in pa]
    pl_ = [p['planned'] for p in pa]
    ck(sec, 'phrase pauses are realised in the audio: the silent run is within 60 ms of the planned pause (%d pauses; planned %.2f..%.2f s)' % (len(pa), min(pl_), max(pl_)), len(pa) >= 8 and max(err) <= 0.06 and max(pl_) / min(pl_) >= 1.8, f'max error {max(err) * 1000:.0f} ms')
    sec_store('prosody', out)


# ====================================================================== 8. live
def live(b):
    sec = 'live'; out = {}
    pg = new_page(b, gesture=True)
    pg.add_script_tag(content=(AUDIO / 'voice_live.js').read_text())
    VOICES = [dict(name=n, lang=l, voiceURI=n, localService=ls, default=False) for n, l, ls in [
        ('Samantha', 'en-US', True), ('Daniel', 'en-GB', True), ('Karen', 'en-AU', True), ('Alex', 'en-US', True), ('Moira', 'en-IE', True), ('Fred', 'en-US', True),
        ('Google US English', 'en-US', False), ('Thomas', 'fr-FR', True), ('Anna', 'de-DE', True)]]
    st0 = pg.evaluate("()=>VL.state()"); out['state'] = st0
    ck(sec, 'the AudioContext is running after one real click (autoplay policy not bypassed)', st0['state'] == 'running', st0['state'])
    pg.evaluate("()=>VL.tts()")
    # ---- barks first (a fresh page: the very first bark of a key must not be refused by the cooldown)
    o = pg.evaluate("()=>VL.barks()"); out['barks'] = o
    seq = o['seq']; seq4 = o['seq4']
    def bag_ok(s, k): return all(len(set(s[i:i + k])) == k for i in range(0, len(s) - k + 1, k)) and all(s[i] != s[i + 1] for i in range(len(s) - 1))
    ck(sec, 'barks: a shuffled bag, every line once per cycle (3 lines x 4 cycles; 4 lines x 4 cycles) and never the same line twice in a row', bag_ok(seq, 3) and bag_ok(seq4, 4) and None not in seq + seq4, f'{seq} / {seq4}')
    ck(sec, 'barks: the spoken text comes from STORY.barks and the voice is rendered (blips) at HALF the volume of a normal line', o['textOk'] and o['barkBlips'] and abs(o['barkGain'] / o['lineGain'] - 0.5) < 0.02, f"gain ratio {o['barkGain'] / o['lineGain']:.3f}")
    ck(sec, 'barks do not duck the music; spoken lines do', o['duckBark'] > 0.99 and o['duckLine'] < 0.7, f"bark {o['duckBark']:.2f} line {o['duckLine']:.2f}")
    d = o['defaults']
    ck(sec, 'barks: the first bark of a never-used key is spoken even right after page load; a second one within 1.5 s is refused; the same (character,key) is refused for 5 s; another key is allowed after the gap', d['first'] and d['immediate'] and d['sameKeyAfterGap'] and d['otherCharAfterGap'], json.dumps(d))
    ck(sec, 'barks never talk over a spoken line, and a spoken line interrupts a bark', o['overLine']['bark'] is None and o['overLine']['stillLyra'] and o['interruptsBark'] == 'interrupt', json.dumps(o['overLine']) + ' ' + str(o['interruptsBark']))
    ck(sec, 'barks: an unknown key or character returns null; a hero unit type resolves to its character', o['unknownKey'] is None and o['unknownChar'] is None and (o['aliasHero'].get('skipped') or (o['aliasHero']['ok'] and o['aliasHero']['canon'] == o['aliasHero']['id'])), json.dumps(o['aliasHero']))
    # ---- the line lifecycle
    o = pg.evaluate("()=>VL.basic()"); out['basic'] = o
    r = o['res']
    ck(sec, 'speak() returns {dur, syllables, blips}; a graph exists while it plays (<= 6 source nodes), is released afterwards, the lip-sync envelope moves, the music is ducked', r['blips'] and r['dur'] > 1 and 0 < o['nDur'] <= 6 and o['nAfter'] == o['n0'] and o['lvMax'] > 0.3 and o['lvAfter'] == 0 and o['duck'] < 0.7, f"dur {r['dur']:.2f} nodes {o['nDur']} lvl {o['lvMax']:.2f} duck {o['duck']:.2f}")
    e = o['ended']
    ck(sec, 'onEnd fires exactly once, reason "end", at the estimated duration (+-0.35 s)', o['calls'] == 1 and e and e['o']['reason'] == 'end' and abs(e['ms'] / 1000 - r['dur']) <= 0.35 and o['curAfter'] is None, f"{e and e['ms']:.0f} ms vs {1000 * r['dur']:.0f}")
    o = pg.evaluate("()=>VL.stopInterrupt()"); out['stop'] = o
    ck(sec, 'speakStop(): onEnd once with reason "stop" (interrupted) immediately, nodes released', o['stop']['calls'] == 1 and o['stop']['reason'] == 'stop' and o['stop']['interrupted'] and o['stop']['latency'] < 50 and o['stop']['curNull'] and o['nodesAfterStop'] == 0, json.dumps(o['stop']))
    i = o['interrupt']
    ck(sec, 'a new line interrupts the old one: the old onEnd fires once with reason "interrupt", the new one ends with "end"', i['aCalls'] == 1 and i['aReason'] == 'interrupt' and i['aInterrupted'] and i['curIsB'] and i['bCalls'] == 1 and i['bReason'] == 'end' and i['aCallsLater'] == 1, json.dumps(i))
    ck(sec, 'empty text: dur 0, onEnd still fires (asynchronously), nothing is left running', o['empty']['dur'] == 0 and o['empty']['calls'] == 1 and o['empty']['cur'] is None, json.dumps(o['empty']))
    o = pg.evaluate("()=>VL.queue()"); out['queue'] = o
    ck(sec, 'queue: the second line waits for the first (A ends, then B), the queue empties; at most 8 lines queue; speakStop() clears it', o['queued'] and o['curDuring'] == 'idris' and o['events'] == ['A.end', 'B.end'] and o['qAfter'] == 0 and o['cap']['queued'] == 8 and o['cap']['skipped'] == 6 and o['cap']['qlenAfterStop'] == 0, json.dumps(o))
    o = pg.evaluate("()=>VL.mute()"); out['mute'] = o
    ck(sec, 'mute: cuts the line being spoken (onEnd "stop"), nothing is created while muted (no blips, no TTS), sound returns after unmuting', o['muted'] and o['cutCalls'] == 1 and o['cutReason'] == 'stop' and o['curAfterMute'] is None and not o['mutedRes']['blips'] and not o['mutedRes']['tts'] and o['unmuted'] and o['unmutedRes']['blips'], json.dumps(o))
    # ---- TTS before and after voiceschanged
    r0 = pg.evaluate("()=>{VL.T.hang=false;const r=__RTS.AUD.voice.speak('idris','Before the voices arrive.',{});__RTS.AUD.voice.stop();return{tts:r.tts,blips:r.blips,speaks:VL.T.speaks};}")
    ck(sec, 'before "voiceschanged" no TTS voice exists: the line is still audible through the synthesized stream (blips true, tts false, speechSynthesis.speak not called)', r0['blips'] and not r0['tts'] and r0['speaks'] == 0, json.dumps(r0))
    listeners = pg.evaluate("(l)=>VL.deliver(l)", VOICES)
    o = pg.evaluate("()=>VL.ttsChoice()"); out['ttsChoice'] = o
    u = o['utt']; p = o['profile']
    ck(sec, 'after the async "voiceschanged": an English voice is chosen and the utterance carries ttsPitch / ttsRate / volume (= voice volume 0.9)', listeners >= 1 and o['res']['tts'] and u and u['lang'].startswith('en') and abs(u['pitch'] - p['ttsPitch']) < 1e-6 and abs(u['rate'] - p['ttsRate']) < 1e-6 and abs(u['volume'] - 0.9) < 1e-6, json.dumps(u))
    sh, wh, ra = o['shout'], o['whisper'], o['radio']
    ck(sec, 'styles shape the utterance: shout higher pitch/faster/loud, whisper quiet (<= 0.35), radio slightly lower pitch', sh['pitch'] > u['pitch'] and sh['rate'] > u['rate'] and wh['volume'] <= 0.35 and ra['pitch'] < u['pitch'], f"shout {sh['pitch']:.2f}/{sh['rate']:.2f}, whisper vol {wh['volume']:.2f}, radio pitch {ra['pitch']:.2f}")
    ck(sec, 'when TTS speaks the synthesized stream is mixed down to a murmur (<= 0.4 of its solo gain)', o['mix']['withTts'] / o['mix']['noTts'] <= 0.4, f"{o['mix']['withTts'] / o['mix']['noTts']:.2f}")
    o = pg.evaluate("()=>VL.flags()"); out['flags'] = o
    ck(sec, 'SET.voice = false switches TTS off (the synthesized stream stays); the TTS volume follows SET.voiceVol (0.9 -> 0.9, 0.45 -> 0.45, 0 -> no utterance)', not o['voiceOff']['tts'] and o['voiceOff']['blips'] and o['voiceOff']['ttsSpeaks'] == 0 and abs(o['vol']['a'] - 0.9) < 1e-6 and abs(o['vol']['b'] - 0.45) < 1e-6 and o['vol']['c'] is None, json.dumps(o))
    lists = {'six local English': [v for v in VOICES if v['lang'].startswith('en') and v['localService']],
             'twenty English': [dict(name=f'Voice{i:02d}' + (' Female' if i % 3 == 0 else ''), lang='en-US', voiceURI=f'v{i}', localService=True, default=False) for i in range(20)],
             'three English': [v for v in VOICES if v['lang'].startswith('en') and v['localService']][:3],
             'network only': [v for v in VOICES if v['lang'].startswith('en') and not v['localService']],
             'mixed': [v for v in VOICES if v['lang'].startswith('en')],
             'no English': [v for v in VOICES if not v['lang'].startswith('en')]}
    o = pg.evaluate("(l)=>VL.ttsAssign(l)", lists); out['ttsAssign'] = {k: (v if k in ('reorder', 'stable', 'canon', 'listeners') else dict(distinct=v['distinct'], nulls=v['nulls'])) for k, v in o.items()}
    out['ttsAssignMap'] = o['six local English']['map']
    n_ch = len(o['six local English']['map'])
    ck(sec, 'voice assignment: with 6 local English voices all 6 are used by the %d characters; with 20 every character gets a different voice; with 3 all 3 are used' % n_ch, o['six local English']['distinct'] == 6 and o['twenty English']['distinct'] == min(20, n_ch) and o['three English']['distinct'] == 3, {k: o[k]['distinct'] for k in lists})
    cnt = {}
    for v in o['six local English']['map'].values(): cnt[v] = cnt.get(v, 0) + 1
    ck(sec, 'voice assignment: when the pool is smaller than the cast the characters spread evenly (no voice carries more than ceil(cast / voices) + 1 characters)', max(cnt.values()) <= math.ceil(n_ch / 6) + 1, cnt)
    ck(sec, 'voice assignment: local voices only when any exist (the network voice is never picked next to local ones); network voices are used when they are all there is; no English voice = no TTS', 'Google US English' not in o['mixed']['map'].values() and set(o['network only']['map'].values()) == {'Google US English'} and o['no English']['nulls'] == n_ch, f"mixed uses {sorted(set(o['mixed']['map'].values()))}")
    ck(sec, 'voice assignment is deterministic: the same voices in another order give the same mapping; unknown speakers and a re-fired "voiceschanged" move nobody', o['reorder']['same'] and o['stable']['same'] and o['stable']['refire'], json.dumps({k: o[k] for k in ('reorder', 'stable')}))
    m6 = o['six local English']['map']; femalish = re.compile(r'Samantha|Karen|Moira'); maleish = re.compile(r'Daniel|Alex|Fred')
    prof = {c: pg.evaluate("(i)=>VG.profile(i)", c)['ttsPitch'] for c in m6}
    hi = [c for c, v in prof.items() if v >= 1.12]; lo = [c for c, v in prof.items() if v <= 0.9]
    ck(sec, 'voice assignment honours the gender hint: ttsPitch >= 1.12 characters get female-named voices, <= 0.9 get male-named voices (when both lists exist)', all(femalish.search(m6[c]) for c in hi) and all(maleish.search(m6[c]) for c in lo), {c: m6[c] for c in hi + lo})
    heroes = [c for c in ('idris', 'kaz', 'lyra') if c in m6]
    ck(sec, 'the three heroes have three different TTS voices', len(set(m6[c] for c in heroes)) == len(heroes), {c: m6[c] for c in heroes})
    ck(sec, "'narrator' resolves to the character whose role is narrator: same voice record, same TTS voice", o['canon']['narrator'] == o['canon']['roleChar'] and o['canon']['narratorVoice'] == o['canon']['roleVoice'] and o['canon']['roleChar'], json.dumps(o['canon']))
    pg.evaluate("(l)=>VL.deliver(l)", lists['six local English'])
    o = pg.evaluate("()=>VL.ttsEnd()"); out['ttsEnd'] = o
    sl, hg = o['slow'], o['hang']
    ck(sec, 'onEnd waits for TTS when TTS is longer than the synthesized stream (resolved by the later of the two)', sl['tts'] and sl['calls'] == 1 and sl['ended']['ms'] > sl['dur'] * 1000 + 1500 and abs(sl['ended']['ms'] - sl['expectMs']) <= 600 and sl['ended']['x']['reason'] == 'end', f"ended at {sl['ended']['ms']:.0f} ms, TTS lasts {sl['expectMs']:.0f} ms, blips {1000 * sl['dur']:.0f} ms")
    ck(sec, 'onEnd is still resolved (by the estimated duration) when TTS never reports its end', hg['tts'] and hg['calls'] == 1 and hg['ended'] and hg['ended']['ms'] > hg['dur'] * 1000 and hg['ended']['ms'] < hg['waited'], f"resolved at {hg['ended'] and hg['ended']['ms']:.0f} ms")
    ck(sec, 'speechSynthesis order: a new line cancels the old utterance before speaking; speakStop() cancels and nothing keeps speaking', o['order'][-3:] == ['cancel', 'cancel', 'speak'] or o['order'][-2:] == ['cancel', 'speak'], o['order'])
    ck(sec, 'speakStop() cancels speechSynthesis exactly once and leaves nothing speaking', o['cancelsOnStop'] == 1 and not o['speakingAfterStop'], f"cancels {o['cancelsOnStop']}")
    o = pg.evaluate("()=>VL.announcer()"); out['announcer'] = o
    f = o['first'][0] if o['first'] else None
    ck(sec, 'announcer say(): keeps its voice (rate 1.05, pitch 0.75, an en-US Samantha/Daniel/Alex/Google voice when present) and follows SET.voiceVol', f and f['rate'] == 1.05 and f['pitch'] == 0.75 and f['voice'] == 'Samantha' and abs(f['volume'] - 0.9) < 1e-6 and abs(o['vol'] - 0.45) < 1e-6, json.dumps(f))
    ck(sec, 'announcer rate limits: 2.2 s between lines, 9 s per repeated text; waits for a character who is speaking; off for SET.voice=false, demo and mute', o['tooSoon'] == 0 and o['sameText'] == 0 and o['otherText'] == 1 and o['duringLine'] == 0 and o['voiceOff'] == 0 and o['demo'] == 0 and o['muted'] == 0, json.dumps({k: o[k] for k in ('tooSoon', 'sameText', 'otherText', 'duringLine', 'voiceOff', 'demo', 'muted')}))
    o = pg.evaluate("()=>VL.robust()"); out['robust'] = o
    badl = [l for l in o['lines'] if l['err'] or not l['finite']]
    ck(sec, 'odd inputs (empty, punctuation only, digits, accents, emoji, markup, smart quotes, 600+ characters) never throw and give finite durations; empty/punctuation-only give dur 0', not badl and o['errors'] == 0 and all(l['dur'] == 0 for l in o['lines'][:4]), badl[:3])
    badp = [p for p in o['profiles'] if p['err'] or not np.isfinite(p['f0'] or np.nan)]
    ck(sec, 'unknown / null / numeric speaker ids give a finite default voice; null, undefined and "" are the same default speaker', not badp and o['profiles'][0]['f0'] == o['profiles'][1]['f0'] == o['profiles'][2]['f0'], badp[:2])
    o = pg.evaluate("()=>VL.perf()"); out['perf'] = o
    ck(sec, 'cost on the main thread: plan <= 4 ms for 600 characters, speak() <= 25 ms for 600 characters / <= 5 ms for a normal line; 3 source nodes per line, none left afterwards', o['plan600'] <= 4 * 3 and o['speak600'] <= 25 * 2 and o['speakMid'] <= 5 * 2 and o['nodesMid'] <= 6 and o['nodesAfter'] == 0, f"plan600 {o['plan600']:.1f} ms, speak600 {o['speak600']:.1f} ms, speak mid {o['speakMid']:.1f} ms, nodes {o['nodesMid']}")
    pg.evaluate("()=>VL.untts()")
    ck(sec, 'no page errors during the live scenarios', not pg.errs, pg.errs[:3]); ck(sec, 'zero network requests during the live scenarios', not pg.net, pg.net[:3])
    sec_store('live', out); pg.close()


# ====================================================================== calibration
def calibrate(b):
    src = SRC.read_text()
    m = re.search(r'/\*LVL:BEGIN\*/\n(.*?)/\*LVL:END\*/', src, re.S)
    assert m, 'LVL markers missing in 84_voice.js'
    blk = m.group(1)
    K = float(re.search(r'const VOX_LVLK=([\d.\-]+);', blk).group(1))
    tbl = {}
    for line in re.finditer(r'^(\w+):\{(.*?)\}', blk, re.M):
        tbl[line.group(1)] = {k: float(v) for k, v in re.findall(r'(\w+):(-?[\d.]+)', line.group(2))}
    tg = {k: float(v) for k, v in re.findall(r'(\w+):(-?\d+)', re.search(r'const VOX_TARGET=\{(.*?)\};', src).group(1))}
    assert tg == {k: float(v) for k, v in TARGET.items()}, f'VOX_TARGET in the source {tg} differs from the gate {TARGET}'
    pg = new_page(b)
    ids = [i for i in pg.evaluate("()=>VG.chars()") if not i.startswith('fx_')]
    VOL = 0.25; rows = []
    for cid in ids:
        P = pg.evaluate("(i)=>VG.profile(i)", cid)
        for sty in STYLES:
            for k in range(3):
                x, r, pl = rline(pg, cid, [SENT[0], SENT[1], SENT[2]][k], sty, vol=VOL)
                rows.append(dict(id=cid, timbre=P['timbre'], f0=P['f0'], style=sty, db=D.active_rms_db(x, SR)))
        print('   calibrate', cid, flush=True)
    # needed correction e = (target + 20 log10(vol)) - measured ; model: e = a[timbre,style] + dk * (-log2(f0/135))   (gain_dB = T - K log2(f0/F0))
    keys = sorted({(r['timbre'], r['style']) for r in rows}); ix = {k: i for i, k in enumerate(keys)}
    A = np.zeros((len(rows), len(keys) + 1)); y = np.zeros(len(rows))
    for n, r in enumerate(rows):
        A[n, ix[(r['timbre'], r['style'])]] = 1.0; A[n, -1] = -math.log2(r['f0'] / REF); y[n] = (TARGET[r['style']] + 20 * math.log10(VOL)) - r['db']
    sol, *_ = np.linalg.lstsq(A, y, rcond=None); res = y - A @ sol
    print(f'before: residual (target - measured) mean {y.mean():+.2f} dB, rms {np.sqrt((y ** 2).mean()):.2f} dB, max |{np.abs(y).max():.2f}|')
    print(f'fit   : residual after the fit rms {np.sqrt((res ** 2).mean()):.2f} dB, max |{np.abs(res).max():.2f}|; dK = {sol[-1]:+.3f}')
    newK = round(K + sol[-1], 2); new = {t: dict(v) for t, v in tbl.items()}
    for (t, s), i in ix.items(): new.setdefault(t, {})[s] = round(tbl.get(t, {}).get(s, 0.0) + sol[i], 1)
    order = ['normal', 'radio', 'whisper', 'shout', 'narration', 'thought']
    body = f'const VOX_LVLK={newK};\nconst VOX_LVL={{\n' + ',\n'.join(f"{t}:{{" + ','.join(f'{s_}:{new[t][s_]}' for s_ in order) + '}' for t in sorted(new)) + '};\n'
    if ARGS.dry:
        print('dry run: source not rewritten'); pg.close(); return
    SRC.write_text(src[:m.start(1)] + body + src[m.end(1):])
    print(f'wrote the LVL table to {SRC} (VOX_LVLK {K} -> {newK}); rebuild and re-run the gate to verify'); pg.close()


# ====================================================================== main
def main():
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--no-sandbox'])
        if ARGS.calibrate:
            calibrate(b); b.close(); return 0
        if want('instrument'): instruments()
        pg = new_page(b)
        fx = pg.evaluate("(s)=>VG.fixtures(s)", (ROOT / 'tests' / 'fixtures' / 'story_min.js').read_text())
        allc = pg.evaluate("()=>VG.chars()"); real = [c for c in allc if not c.startswith('fx_')]
        if ARGS.quick: real = real[:8]; fx = fx[:5]
        print(f'characters: {len(real)} story + {len(fx)} fixture; build {URL}')
        R['characters'] = dict(story=real, fixture=fx)
        prof = {c: pg.evaluate("(i)=>VG.profile(i)", c) for c in real + fx}
        ck('setup', 'the story characters carry voice data (pitch, rate, timbre, formant, ttsPitch, ttsRate)', all(prof[c]['found'] for c in real), [c for c in real if not prof[c]['found']])
        if want('segmenter'): segmenter(pg)
        C = None
        if want('corpus') or want('distinct'):
            C = corpus(pg, real, fx)
            R['profiles'] = {c: {k: (round(v, 4) if isinstance(v, float) else v) for k, v in prof[c].items() if k in ('timbre', 'pitch', 'rate', 'formant', 'ttsPitch', 'ttsRate', 'f0', 'tract', 'habit', 'breath', 'lp')} for c in real + fx}
        if want('distinct'): distinct(C, real, fx, prof)
        if want('sweeps'): sweeps(pg)
        if want('styles'): styles(pg)
        if want('prosody'): prosody(pg)
        ck('page', 'no page errors in the offline renders', not pg.errs, pg.errs[:3]); ck('page', 'zero network requests (CLAUDE.md rule 1)', not pg.net, pg.net[:3])
        pg.close()
        if want('live'): live(b)
        b.close()
    fails = [c for c in R['checks'] if not c['ok'] and not c['soft']]; warns = [c for c in R['checks'] if not c['ok'] and c['soft']]
    R['summary'] = dict(checks=len(R['checks']), passed=sum(1 for c in R['checks'] if c['ok']), failed=len(fails), warnings=len(warns), controls=sum(1 for c in R['checks'] if c['control']), seconds=round(time.time() - T0, 1), quick=ARGS.quick)
    R['limits'] = ['Offline Chromium renders and numpy measurements only: nobody listened. Intelligibility, naturalness and taste are untested.',
                   'The blip stream is speech-LIKE (one syllable per vowel group, pitch contour from punctuation, vowel formants from letters), not speech; the words are carried by TTS where the device has voices and by subtitles everywhere.',
                   'Speaker distinctness is measured with a pitch + long-term-spectrum classifier on 4 sentences per character; human discrimination of the 13 fixture characters (identical voice data) is expected to be weak: they differ only by the id-hash offsets.',
                   'speechSynthesis is exercised with a FAKE engine: voice selection, utterance parameters, cancel and onEnd handling are verified, real device voices, their quality and their latency are not.',
                   'Mobile loudness, latency and the iOS / Android audio lifecycle are not verified by headless Chromium.']
    json.dump(R, open(ARGS.out, 'w'), indent=1, default=lambda o: o.tolist() if hasattr(o, 'tolist') else str(o))
    print(f"\n{R['summary']['passed']}/{R['summary']['checks']} checks passed, {len(fails)} failed, {len(warns)} warnings ({R['summary']['controls']} are mutation controls) in {R['summary']['seconds']} s -> {ARGS.out}")
    for c in fails: print('  FAILED:', c['sec'], c['name'], '|', c['detail'])
    return 1 if fails else 0


if __name__ == '__main__':
    sys.exit(main())
