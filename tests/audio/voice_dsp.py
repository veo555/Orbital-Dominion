"""numpy measurements for the character-voice gate (tests/audio/voice_gate.py). Pure functions on float64 mono arrays; no browser, no game.
Independent of the engine's own analyser (80_audio.js audioAnalyse) and of tests/audio/dsp.js - the gate cross-checks the level against audioAnalyse.

  active_rms_db(x, sr)        active-window RMS in dBFS (10 ms frames within 40 dB of the loudest frame; the definition of docs/AUDIO_SPEC.md 6.2)
  levels(x, sr)               finite / peak / active dB / dc / first sample / last-20 ms RMS / duration / active start-end
  f0_track(x, sr)             normalised-autocorrelation pitch track (40 ms frames, 10 ms hop, first lobe above 0.85 x max: no octave drops on sub-harmonic voices)
  formants(x, sr, voiced)     LPC (order 12 at 11.025 kHz) F1..F3 medians over loud voiced frames
  ltas_centroid(x, sr)        long-term-average-spectrum centroid 150..5000 Hz
  envelope(x, sr)             5 ms RMS envelope (dB re peak)
  syllable_rate(x, sr)        peaks/s of the smoothed envelope (prominence >= 3 dB) over the active window; also the modulation-spectrum peak (Hz) and the share of modulation power in 2..8 Hz
  band_ratio_db(x, sr, lo, hi)  energy in [lo,hi] relative to the total, dB
  flatness(x, sr)             mean spectral flatness of active frames
  features(x, sr)             all of the above as one dict
"""
import numpy as np


def active_frames(x, sr, fr=0.010, db=-40.0):
    n = max(1, int(round(fr * sr))); nf = len(x) // n
    if nf == 0: return np.zeros(0, bool), n, np.zeros(0)
    p = (x[:nf * n].reshape(nf, n) ** 2).mean(1)
    m = p.max()
    return (p >= m * 10 ** (db / 10)) & (p > 0), n, p


def active_rms_db(x, sr, span=True):
    """RMS over the ACTIVE WINDOW of docs/AUDIO_SPEC.md 6.2 / 80_audio.js audioAnalyse: the span from the first to the last 10 ms frame that is within 40 dB of the loudest
    one (pauses inside the span count). span=False: only the active frames (what a listener perceives as 'while it speaks')."""
    act, n, p = active_frames(x, sr)
    if not act.any(): return -200.0
    if span:
        i = np.nonzero(act)[0]; v = float(p[i[0]:i[-1] + 1].mean())
    else:
        v = float(p[act].mean())
    return 10 * np.log10(v) if v > 0 else -200.0


def levels(x, sr):
    act, n, p = active_frames(x, sr)
    idx = np.nonzero(act)[0]
    t = x[-int(0.02 * sr):]
    return dict(finite=bool(np.isfinite(x).all()), peak=float(np.abs(x).max()) if len(x) else 0.0, activeDb=active_rms_db(x, sr), dc=float(x.mean()) if len(x) else 0.0,
                first=float(abs(x[0])) if len(x) else 0.0, tailDb=float(10 * np.log10(max(1e-20, (t ** 2).mean()))), dur=len(x) / sr,
                start=float(idx[0] * n / sr) if len(idx) else 0.0, end=float((idx[-1] + 1) * n / sr) if len(idx) else 0.0)


def f0_track(x, sr, lo=55.0, hi=520.0, win=0.040, hop=0.010, vthr=0.55, ldb=-34.0):
    """-> array of (t, f0 or 0, clarity). Frames quieter than ldb dB below the loudest frame are unvoiced."""
    n = int(win * sr); h = int(hop * sr); lagmin = int(sr / hi); lagmax = min(int(sr / lo), n - 1)
    pk = np.sqrt((x ** 2).max()) if len(x) else 0
    fl = pk * 10 ** (ldb / 20)
    out = []; N = 1
    while N < 2 * n: N *= 2
    for s in range(0, len(x) - 2 * n, h):
        fr = x[s:s + 2 * n]
        a = fr[:n]
        if np.sqrt((a ** 2).mean()) < fl: out.append((s / sr, 0.0, 0.0)); continue
        a = a - a.mean(); b = fr - fr.mean()
        A = np.fft.rfft(a, N); B = np.fft.rfft(b, N)
        cc = np.fft.irfft(np.conj(A) * B, N)[:lagmax + 2]          # cross-correlation a . b[l:l+n]
        # normalise by the energy of the shifted window
        cs = np.concatenate([[0.0], np.cumsum(b * b)])
        ea = float((a * a).sum()) + 1e-12
        l = np.arange(lagmin, lagmax + 1)
        es = cs[l + n] - cs[l]
        nsdf = cc[lagmin:lagmax + 1] / np.sqrt(ea * (es + 1e-12))
        if len(nsdf) < 3: out.append((s / sr, 0.0, 0.0)); continue
        # local maxima
        pks = [i for i in range(1, len(nsdf) - 1) if nsdf[i] >= nsdf[i - 1] and nsdf[i] > nsdf[i + 1] and nsdf[i] > 0]
        if not pks: out.append((s / sr, 0.0, 0.0)); continue
        best = max(nsdf[i] for i in pks)
        if best < vthr: out.append((s / sr, 0.0, float(best))); continue
        i = next(i for i in pks if nsdf[i] >= 0.85 * best)
        y0, y1, y2 = nsdf[i - 1], nsdf[i], nsdf[i + 1]
        den = (y0 - 2 * y1 + y2); d = 0.5 * (y0 - y2) / den if den != 0 else 0.0
        out.append((s / sr, sr / (lagmin + i + d), float(best)))
    return np.array(out) if out else np.zeros((0, 3))


def st(f, ref):
    return 12 * np.log2(np.asarray(f) / ref)


def _decimate(x, sr, tsr=11025):
    k = int(round(sr / tsr))
    if k <= 1: return x, sr
    m = 8 * k + 1; t = np.arange(m) - (m - 1) / 2
    h = np.sinc(t / k) * np.hanning(m); h /= h.sum()
    y = np.convolve(x, h, 'same')[::k]
    return y, sr / k


def _lpc(fr, order):
    r = np.correlate(fr, fr, 'full')[len(fr) - 1:len(fr) + order]
    if r[0] <= 0: return None
    a = np.zeros(order + 1); a[0] = 1.0; e = r[0]
    for i in range(1, order + 1):
        acc = r[i] + sum(a[j] * r[i - j] for j in range(1, i))
        k = -acc / e
        a2 = a.copy()
        for j in range(1, i): a2[j] = a[j] + k * a[i - j]
        a2[i] = k; a = a2; e *= (1 - k * k)
        if e <= 0: return None
    return a


def formants(x, sr, f0t=None, order=12, maxn=140):
    """median F1, F2, F3 (Hz) over the loudest voiced frames; None when too few frames"""
    y, s2 = _decimate(x, sr)
    y = np.append(y[0], y[1:] - 0.97 * y[:-1])
    n = int(0.025 * s2); h = int(0.010 * s2); w = np.hanning(n)
    rows = []
    for s in range(0, len(y) - n, h):
        fr = y[s:s + n] * w
        rows.append((s / s2, float((fr ** 2).mean())))
    if not rows: return None
    pw = np.array([r[1] for r in rows]); thr = pw.max() * 10 ** (-20 / 10)
    voiced = None
    if f0t is not None and len(f0t):
        voiced = {int(round(t * 100)): v for t, v, c in f0t}
    F = []
    for (t, p), s in zip(rows, range(0, len(y) - n, h)):
        if p < thr: continue
        if voiced is not None and voiced.get(int(round(t * 100)), 0) <= 0: continue
        fr = y[s:s + n] * w
        a = _lpc(fr, order)
        if a is None: continue
        rt = np.roots(a); rt = rt[np.imag(rt) > 0.01]
        ang = np.angle(rt); fq = ang * s2 / (2 * np.pi); bw = -np.log(np.abs(rt) + 1e-9) * s2 / np.pi
        sel = sorted([(f, b) for f, b in zip(fq, bw) if 150 < f < 4600 and b < 450])
        if len(sel) >= 3: F.append([sel[0][0], sel[1][0], sel[2][0]])
    if len(F) < 5: return None
    F = np.array(F)
    return dict(F1=float(np.median(F[:, 0])), F2=float(np.median(F[:, 1])), F3=float(np.median(F[:, 2])), n=len(F))


def ltas_centroid(x, sr, lo=150.0, hi=5000.0):
    act, n, p = active_frames(x, sr)
    N = 2048; w = np.hanning(N); acc = np.zeros(N // 2 + 1); k = 0
    for s in range(0, len(x) - N, N // 2):
        fr = x[s:s + N]
        if (fr ** 2).mean() < p.max() * 1e-3 if len(p) else True: continue
        acc += np.abs(np.fft.rfft(fr * w)) ** 2; k += 1
    if not k: return 0.0
    f = np.fft.rfftfreq(N, 1 / sr); m = (f >= lo) & (f <= hi)
    return float((f[m] * acc[m]).sum() / max(1e-30, acc[m].sum()))


def band_ratio_db(x, sr, lo, hi):
    X = np.abs(np.fft.rfft(x)) ** 2; f = np.fft.rfftfreq(len(x), 1 / sr)
    m = (f >= lo) & (f < hi)
    return float(10 * np.log10(max(1e-30, X[m].sum()) / max(1e-30, X.sum())))


def flatness(x, sr):
    act, n, p = active_frames(x, sr)
    N = 1024; w = np.hanning(N); v = []
    for s in range(0, len(x) - N, N // 2):
        fr = x[s:s + N]
        if (fr ** 2).mean() < p.max() * 1e-2 if len(p) else True: continue
        P = np.abs(np.fft.rfft(fr * w)) ** 2 + 1e-18
        v.append(float(np.exp(np.log(P).mean()) / P.mean()))
    return float(np.mean(v)) if v else 0.0


def envelope(x, sr, fr=0.005):
    n = max(1, int(round(fr * sr))); nf = len(x) // n
    p = (x[:nf * n].reshape(nf, n) ** 2).mean(1)
    return 10 * np.log10(p / max(p.max(), 1e-30) + 1e-12), fr


def syllable_rate(x, sr):
    env, fr = envelope(x, sr)
    act = env > -45
    idx = np.nonzero(act)[0]
    if len(idx) < 10: return dict(rate=0.0, modHz=0.0, modShare=0.0, peaks=0, span=0.0)
    a, b = idx[0], idx[-1] + 1
    e = env[a:b]
    k = int(round(0.040 / fr)) | 1                      # 40 ms boxcar smoothing (a syllable nucleus is ~80-200 ms)
    es = np.convolve(np.pad(e, (k // 2, k // 2), mode='edge'), np.ones(k) / k, 'valid')
    peaks = 0; i = 1; last = es[0]
    # a peak counts when the envelope rises >= 3 dB above the previous trough and then falls >= 3 dB
    trough = es[0]; rising = True; top = es[0]
    for v in es[1:]:
        if rising:
            if v > top: top = v
            elif top - v >= 3.0 and top - trough >= 3.0: peaks += 1; rising = False; trough = v
        else:
            if v < trough: trough = v
            elif v - trough >= 3.0: rising = True; top = v
    span = (b - a) * fr
    lin = 10 ** (e / 20)
    lin = lin - lin.mean()
    M = np.abs(np.fft.rfft(lin * np.hanning(len(lin)), 8192)) ** 2; fm = np.fft.rfftfreq(8192, fr)
    m1 = (fm >= 0.5) & (fm <= 20); m2 = (fm >= 2.0) & (fm <= 8.0)
    modHz = float(fm[m2][np.argmax(M[m2])]) if m2.any() else 0.0
    return dict(rate=peaks / span if span > 0 else 0.0, modHz=modHz, modShare=float(M[m2].sum() / max(1e-30, M[m1].sum())), peaks=peaks, span=span)


def features(x, sr):
    lv = levels(x, sr); tr = f0_track(x, sr)
    v = tr[tr[:, 1] > 0] if len(tr) else np.zeros((0, 3))
    f = v[:, 1] if len(v) else np.zeros(0)
    ref = 135.0
    d = dict(lv=lv, voicedFrames=int(len(f)), frames=int(len(tr)), voicedShare=float(len(f) / max(1, (tr[:, 2] >= 0).sum() if len(tr) else 1)))
    if len(f) >= 10:
        d.update(f0Med=float(np.median(f)), f0P10=float(np.percentile(f, 10)), f0P90=float(np.percentile(f, 90)), f0RangeSt=float(st(np.percentile(f, 90), np.percentile(f, 10))), clarity=float(np.mean(v[:, 2])))
    else:
        d.update(f0Med=0.0, f0P10=0.0, f0P90=0.0, f0RangeSt=0.0, clarity=0.0)
    fm = formants(x, sr, tr) if len(f) >= 10 else None
    d['formants'] = fm
    d['centroid'] = ltas_centroid(x, sr)
    d['flatness'] = flatness(x, sr)
    d['syl'] = syllable_rate(x, sr)
    d['lo300Db'] = band_ratio_db(x, sr, 0, 300); d['hi3500Db'] = band_ratio_db(x, sr, 3500, sr / 2)
    return d
