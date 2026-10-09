#!/usr/bin/env python3
"""Unit sound-design probe: measures every  <unit>.<event>.<faction>  voice of src/js/81_sfx_units.js and writes tests/out/audio/units_report.json.

  python3 tests/audio/units_gate.py                 measure + report (exit 1 when a hard criterion fails)
  python3 tests/audio/units_gate.py --calibrate     also rewrite the TRIM table in src/js/81_sfx_units.js (per-voice gain that puts the ACTIVE-WINDOW RMS on the class target),
                                                    then re-run with no flag to verify
  python3 tests/audio/units_gate.py --corpus units  z-normalise over the unit voices only (fast iteration); the default `all` z-normalises over every registered voice like tests/e2e/e2e_audio.py does
  python3 tests/audio/units_gate.py --only rifleman.,titan.fire --spectro
  OD_URL=file:///.../orbital_dominion_v4.html  points it at a scratch build (never run a bare build.py while other agents share dist/).

What it measures (nobody can listen here: these are the only claims):
  matrix     every unit type x {select ack ready die hit} + fire|melee (+ mine, deliver for the worker) x the factions that field it exists as an exact, non-fallback voice id
  per voice  finite, peak <= 0.98, active-window RMS within +-4 dB of its class (and the real deviation), |DC|, first sample, last 20 ms, duration vs declared, fire <= 0.35 s, select/ack <= 0.6 s,
             boom <= 2.5 s, source nodes created by one render (oscillators + buffer sources, counted by wrapping the context factory methods), DSL layers, determinism (same seed = same hash),
             seed variation (seeds 0/1/2 differ for repeatable events), spectral centroid / attack (10-90 %) / decay (peak to -20 dB) computed here with numpy from the raw samples and, independently, by the gate's dsp.js
  distinct   the gate's 28-D feature vector (tests/audio/dsp.js, tau = 1.0 after z-normalisation) for (a) every pair of unit types with the same event and faction and (b) the faction variants of one
             unit and event: the closest pairs are listed; numpy centroid / attack / decay triples show WHICH axis separates the faction variants
Limits: offline Chromium renders, no loudspeaker, no listener. Taste, mobile loudness and latency are untested."""
import os, re, sys, json, time, base64, pathlib, argparse, collections, itertools
import numpy as np
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
URL = os.environ.get('OD_URL') or (ROOT / 'dist' / 'orbital_dominion_v4.html').as_uri()
OUT = ROOT / 'tests' / 'out' / 'audio'
AUDIO = ROOT / 'tests' / 'audio'
SRC = ROOT / 'src' / 'js' / '81_sfx_units.js'
ap = argparse.ArgumentParser()
ap.add_argument('--calibrate', action='store_true'); ap.add_argument('--corpus', default='all'); ap.add_argument('--only', default=''); ap.add_argument('--spectro', action='store_true')
ap.add_argument('--out', default=str(OUT / 'units_report.json')); ap.add_argument('--seeds', type=int, default=6)
ap.add_argument('--fac', default='', help='only voices of these factions (comma list)'); ap.add_argument('--ev', default='', help='only these events (comma list)')
ap.add_argument('--shots', default='', help='comma list of voice ids: write spectrogram PNGs only (to --shots-dir) and exit'); ap.add_argument('--shots-dir', default=str(OUT / 'spectro'))
ARGS = ap.parse_args()
SR = 44100
CLASS_DB = {'ui': -26, 'fire': -22, 'impact': -18, 'boom': -14, 'voice': -20, 'alert': -17, 'cine': -18, 'music': -20, 'amb': -30}
FACTIONS = ['meridian', 'obsidian', 'aurora']
EVENTS = ['select', 'ack', 'fire', 'melee', 'die', 'ready', 'hit', 'mine', 'deliver']


def vocab(name):
    t = (ROOT / 'src' / 'js' / '43_vocab.js').read_text(encoding='utf-8')
    m = re.search(r'const ' + name + r'=\[(.*?)\];', t, re.S)
    return re.findall(r"'([^']+)'", re.sub(r'//[^\n]*', '', m.group(1)))


UNITS, BUILDINGS, SFXF = vocab('UNIT_TYPES'), vocab('BUILDING_TYPES'), vocab('SFX_FACTIONS')

PAGE_JS = r"""
(()=>{
const SR=44100,UG=window.UG={cnt:0};
const P=(window.BaseAudioContext||window.OfflineAudioContext).prototype;
for(const m of ['createOscillator','createBufferSource','createConstantSource']){const o=P[m];P[m]=function(){UG.cnt++;return o.apply(this,arguments);};}
const b64=m=>{const u=new Uint8Array(m.buffer,m.byteOffset,m.byteLength);let s='';for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s);};
UG.ids=()=>Object.values(ODP.info()).map(v=>({id:v.id,cls:v.cls,dur:v.dur,tail:v.tail,gain:v.gain,fallback:!!v.fallback,bus:v.bus}));
UG.layers=id=>{const v=__RTS.AUD.resolve(id);return v&&Array.isArray(v.layers)?v.layers.length:-1;};
/* one voice: render seeds, measure with the gate's own dsp.js (ODA) and the engine's analyser; optionally ship the mono samples of seed 0 */
UG.measure=async(id,o)=>{
  o=o||{};const info=ODP.info()[id],rec={id,cls:info.cls,dur:info.dur,tail:info.tail,gain:info.gain,fallback:!!info.fallback};
  rec.layers=UG.layers(id);
  const c0=UG.cnt;
  const p=ODP.rs({sfx:id,seed:0});rec.nodes=UG.cnt-c0;            // the graph is built synchronously inside render(): the counter has moved by now
  const r1=await p;
  rec.lv=ODA.levels(r1.channels,SR);rec.hashA=ODA.hashQ(r1.channels);
  const e=__RTS.AUD.analyse(r1.channels,SR);rec.engine={act:e.activeDb,peak:e.peak};
  const f=ODA.voiceFeatures(r1.channels,SR,rec.lv);rec.feat=f.v;rec.odaCentroid=f.centroidHz;rec.odaAttackMs=f.attackMs;rec.odaDecayMs=f.decayMs;rec.flatDb=f.flatnessDb;rec.pitchSlope=f.pitchSlope;rec.voiced=f.voiced;
  const r2=await ODP.rs({sfx:id,seed:0});rec.hashB=ODA.hashQ(r2.channels);
  {const x=ODA.mono(r1.channels),s0=Math.floor(rec.lv.start*SR),s1=Math.min(x.length,Math.max(s0+64,Math.ceil(rec.lv.end*SR)),s0+Math.round(1.5*SR)),pc=ODA.pitchContour(x,s0,s1,SR,90);
   const f=pc.f0.slice().sort((a,b)=>a-b);rec.f0=f.length?f[f.length>>1]:0;}
  rec.seedHashes=[rec.hashA];rec.seedAct=[rec.lv.activeDb];rec.seedPeak=[rec.lv.peak];rec.seedNodes=[rec.nodes];rec.seedFeats=[];rec.seedCen=[f.centroidHz];
  for(let s=1;s<(o.seeds||3);s++){const c1=UG.cnt;const q=ODP.rs({sfx:id,seed:s});const n=UG.cnt-c1;const r=await q;const l=ODA.levels(r.channels,SR);rec.seedHashes.push(ODA.hashQ(r.channels));rec.seedAct.push(l.activeDb);rec.seedPeak.push(l.peak);rec.seedNodes.push(n);
    if(o.seedFeats){const ff=ODA.voiceFeatures(r.channels,SR,l);rec.seedFeats.push(ff.v);rec.seedCen.push(ff.centroidHz);}}
  if(o.samples){const x=ODA.mono(r1.channels);rec.mono=b64(x);}
  if(o.stereo){const L=r1.channels[0],R=r1.channels[1];let s=0,d=0;for(let i=0;i<L.length;i++){const m=L[i]+R[i],sd=L[i]-R[i];s+=m*m;d+=sd*sd;}rec.sideDb=10*Math.log10((d+1e-20)/(s+d+1e-20));}
  return rec;
};
UG.store=new Map();
UG.run=async(ids,o)=>{const out=[];for(const id of ids){const r=await UG.measure(id,o);UG.store.set(id,r);const q=Object.assign({},r);delete q.feat;delete q.seedFeats;out.push(q);}return out;};
/* z-normalise over `corpusIds` (the voices already measured by UG.run) and return the pair tables for the unit groups */
UG.evaluate=(unitIds,tau)=>{
  const all=Array.from(UG.store.values()).filter(r=>r.feat),zn=ODA.znorm(all.map(r=>r.feat)),Z={};for(const r of all)Z[r.id]=ODA.zproj(r.feat,zn);
  const cls={};for(const r of all)cls[r.id]=r.cls;
  const groups=ODA.distinctGroups(unitIds,ODP.vocab,{cls}).filter(g=>g.rule==='a'||g.rule==='b');
  const pairs=[];
  for(const g of groups){const ids=g.ids.filter(i=>Z[i]);for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++)pairs.push({rule:g.rule,key:g.key,a:ids[i],b:ids[j],d:ODA.dist(Z[ids[i]],Z[ids[j]])});}
  const nn={};for(const id of unitIds){if(!Z[id])continue;let m=1e9,w=null;for(const o of all){if(o.id===id)continue;const d=ODA.dist(Z[id],Z[o.id]);if(d<m){m=d;w=o.id;}}nn[id]=[w,m];}
  /* seed robustness: every seed render of A against every seed render of B (the game plays a different seed each time), and how far a voice's own seeds wander from its seed-0 render */
  const SF=id=>{const r=UG.store.get(id);return[Z[id]].concat((r.seedFeats||[]).map(v=>ODA.zproj(v,zn)));};
  for(const q of pairs){if(q.d>4)continue;const A=SF(q.a),B=SF(q.b);let m=1e9;for(const a of A)for(const b of B){const d=ODA.dist(a,b);if(d<m)m=d;}q.dSeeds=m;}
  const intra={};for(const id of unitIds){const r=UG.store.get(id);if(!r||!r.seedFeats||!r.seedFeats.length)continue;const A=SF(id);let m=0;for(let i=1;i<A.length;i++)m=Math.max(m,ODA.dist(A[0],A[i]));intra[id]=m;}
  return{n:all.length,groups:groups.map(g=>({rule:g.rule,key:g.key,n:g.ids.length})),pairs,nearestAny:nn,intra};
};
})();
"""


def mono_np(b):
    return np.frombuffer(base64.b64decode(b), dtype=np.float32).astype(np.float64)


def np_features(x):
    """spectral centroid (Hz, 50-16 kHz, power-weighted over the active window), attack time (10->90 % of the peak of the 2 ms RMS envelope), decay (peak -> last time above -20 dB), f0 not estimated"""
    sr = SR
    h = max(1, int(round(sr * 0.001)))
    n = len(x)
    # 2 ms RMS windows, 1 ms hop
    nwin = (n - 2 * h) // h
    if nwin <= 4: return dict(centroid=0.0, attack_ms=0.0, decay_ms=0.0, active_s=0.0, p95_hz=0.0, hi_db=-99.0)
    c = np.concatenate([[0], np.cumsum(x * x)])
    idx = np.arange(nwin) * h
    env = np.sqrt((c[idx + 2 * h] - c[idx]) / (2 * h))
    pk = env.max(); kp = int(env.argmax())
    k10 = int(np.argmax(env >= 0.1 * pk)); k90 = int(np.argmax(env >= 0.9 * pk))
    ge = np.nonzero(env[kp:] >= 0.1 * pk)[0]
    kend = kp + (int(ge[-1]) if len(ge) else 0)
    # active window: samples whose envelope is within 60 dB (-> -60 dB) of the peak, for the spectrum
    act = np.nonzero(env >= pk * 1e-3)[0]
    s0, s1 = int(act[0] * h), int(min(n, act[-1] * h + 2 * h))
    seg = x[s0:s1]
    N = 1024
    while N < len(seg) and N < 8192: N <<= 1
    hop = N // 2
    w = np.hanning(N)
    P = np.zeros(N // 2 + 1)
    if len(seg) <= N:
        P += np.abs(np.fft.rfft(np.pad(seg, (0, N - len(seg))) * np.hanning(N))) ** 2
    else:
        for st in range(0, len(seg) - N + 1, hop): P += np.abs(np.fft.rfft(seg[st:st + N] * w)) ** 2
    f = np.arange(N // 2 + 1) * sr / N
    m = (f >= 50) & (f <= 16000)
    cen = float((f[m] * P[m]).sum() / max(P[m].sum(), 1e-30))
    cp = np.cumsum(P[m]); p95 = float(f[m][int(np.searchsorted(cp, 0.95 * cp[-1]))])
    hi = float(10 * np.log10(max(P[f >= 5000].sum(), 1e-30) / max(P[(f >= 20)].sum(), 1e-30)))
    return dict(centroid=cen, attack_ms=float(max(0, k90 - k10) + 1), decay_ms=float(max(0, kend - kp) + 1), active_s=float((s1 - s0) / sr), p95_hz=p95, hi_db=hi)


def render_seeds(pg, vid, seeds):
    out = pg.evaluate("""async([id,seeds])=>{const o=[];for(const s of seeds){const r=await ODP.rs({sfx:id,seed:s});const m=ODA.mono(r.channels);const u=new Uint8Array(m.buffer,m.byteOffset,m.byteLength);let q='';for(let i=0;i<u.length;i+=0x8000)q+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));o.push(btoa(q));}return o;}""", [vid, seeds])
    return [mono_np(x) for x in out]


CHORD = {'meridian': [62, 66, 69, 71], 'obsidian': [64, 67, 71, 74], 'aurora': [66, 70, 73, 77]}   # D F# A B (D6), Em7, F#maj7 as midi pitch classes (see 81_sfx_units.js PD)


def peak_hz(x):
    n = 8192; seg = np.pad(x[:n], (0, max(0, n - len(x[:n])))) * np.hanning(n)
    P = np.abs(np.fft.rfft(seg)); f = np.arange(len(P)) * SR / n; m = (f > 150) & (f < 4000)
    return float(f[m][int(P[m].argmax())])


def loop_sim(pg, seed=7):
    """30 s of 6 workers (a mine beat every 1.1-1.5 s each, a deliver every 8th beat) built from independent seed renders, with the engine's per-voice cooldown (mine 110 ms, deliver 150 ms)
    merging near-simultaneous calls: loudness, spectrum and pitch-set statistics of what a player would hear for half a minute"""
    res = {}
    for fa in FACTIONS:
        rng = np.random.default_rng(seed)
        mines = render_seeds(pg, f'hauler.mine.{fa}', list(range(24))); dels = render_seeds(pg, f'hauler.deliver.{fa}', list(range(12)))
        T = 30.0; n = int(T * SR) + SR; mix = np.zeros(n); events = []
        for w in range(6):
            t = float(rng.uniform(0, 1.2)); k = 0
            while t < T:
                k += 1; events.append((t, 'd' if k % 8 == 0 else 'm')); t += float(rng.uniform(1.1, 1.5))
        events.sort(); last = {'m': -9.0, 'd': -9.0}; gap = {'m': 0.11, 'd': 0.15}; played = merged = 0
        for t, kind in events:
            if t - last[kind] < gap[kind]: merged += 1; continue
            last[kind] = t; played += 1; pool = mines if kind == 'm' else dels; src = pool[int(rng.integers(0, len(pool)))]; i = int(t * SR); mix[i:i + len(src)] += src[:n - i]
        mix = mix[:int(T * SR)]
        sec = [20 * np.log10(max(np.sqrt(np.mean(mix[i * SR:(i + 1) * SR] ** 2)), 1e-9)) for i in range(int(T))]
        P = np.abs(np.fft.rfft(mix * np.hanning(len(mix)))) ** 2; f = np.arange(len(P)) * SR / len(mix); m = (f >= 50) & (f <= 16000)
        cen = float((f[m] * P[m]).sum() / P[m].sum()); hi = float(10 * np.log10(P[f >= 5000].sum() / P[f >= 20].sum()))
        # pitch set of the mine ticks: dominant partial of each of the 24 renders, nearest midi note, distance in cents to the nearest chord tone (any octave)
        cents = []; pcs = set()
        for x in mines:
            h = peak_hz(x); midi = 69 + 12 * np.log2(h / 440.0); pc = [(midi - c) % 12 for c in CHORD[fa]]
            d = min(min(a, 12 - a) for a in pc); cents.append(d * 100); pcs.add(round(midi) % 12)
        res[fa] = dict(events=len(events), played=played, mergedByCooldown=merged, rmsDbfs30s=round(float(20 * np.log10(np.sqrt(np.mean(mix ** 2)))), 1), peak=round(float(np.abs(mix).max()), 3),
                       shortTermDb=dict(mean=round(float(np.mean(sec)), 1), std=round(float(np.std(sec)), 1), min=round(float(min(sec)), 1), max=round(float(max(sec)), 1)),
                       centroidHz=round(cen), above5kHzDb=round(hi, 1), mineSingleRenders=len(mines), mineMaxCentsFromChordTone=round(float(max(cents))), mineMedianCentsFromChordTone=round(float(np.median(cents))),
                       minePitchClasses=sorted(pcs), chordPitchClasses=sorted({c % 12 for c in CHORD[fa]}))
    return res


def expected_matrix(meta):
    U, F = meta['U'], meta['F']; req = []
    for t in UNITS:
        d = U.get(t)
        if not d: continue
        if d['creep']: facs = ['wild']
        elif d['hero']: facs = [d['faction']]
        elif d['unique']: facs = [f for f in FACTIONS if F.get(f, {}).get('unique') == t]
        else: facs = FACTIONS
        for f in facs:
            evs = ['die', 'hit'] if d['creep'] else ['select', 'ack', 'ready', 'die', 'hit']
            if d['creep']: evs += ['select', 'ack', 'ready']
            evs += ['fire', 'melee'] if (d['dmg'] > 0 or d['creep'] or d['hero']) else ['melee', 'fire']
            if d['worker']: evs += ['mine', 'deliver']
            for ev in dict.fromkeys(evs): req.append(f'{t}.{ev}.{f}')
    return req


def spectro(pg, ids, d=None):
    from PIL import Image
    d = pathlib.Path(d or OUT / 'spectro'); d.mkdir(parents=True, exist_ok=True)
    for vid in ids:
        r = pg.evaluate("async(id)=>{const r=await ODP.rs({sfx:id,seed:0});const m=ODA.mono(r.channels);const u=new Uint8Array(m.buffer);let s='';for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s);}", vid)
        x = mono_np(r); n_fft, hop = 1024, 128
        if len(x) < n_fft: x = np.pad(x, (0, n_fft - len(x)))
        w = np.hanning(n_fft); fr = [np.abs(np.fft.rfft(x[i:i + n_fft] * w)) for i in range(0, len(x) - n_fft + 1, hop)]
        S = 20 * np.log10(np.array(fr).T + 1e-9); S = np.clip((S - (S.max() - 80)) / 80, 0, 1)[::-1]
        rgb = np.stack([np.clip(S * 2, 0, 1), np.clip(S * 2 - 0.6, 0, 1) * 0.9, np.clip(1.5 - np.abs(S * 3 - 1.2), 0, 1) * (S > 0.05)], -1)
        Image.fromarray((rgb * 255).astype(np.uint8)).resize((min(1100, max(300, S.shape[1] * 2)), 360), Image.NEAREST).save(d / (re.sub(r'[^A-Za-z0-9_.-]', '_', vid) + '.png'))


def rewrite_trim(new):
    t = SRC.read_text(encoding='utf-8')
    m = re.search(r'/\*TRIM:BEGIN\*/\nconst TRIM=\{(.*?)\};\n/\*TRIM:END\*/', t, re.S)
    if not m: raise SystemExit('TRIM block markers not found in 81_sfx_units.js')
    body = ','.join("'%s':[%s]" % (k, ','.join(('%.4f' % x).rstrip('0').rstrip('.') if abs(x) >= 1e-4 else '0' for x in new[k])) for k in sorted(new))
    SRC.write_text(t[:m.start(1)] + body + t[m.end(1):], encoding='utf-8')


def main():
    t0 = time.time()
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--no-sandbox'])
        pg = b.new_page(viewport={'width': 1366, 'height': 800})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type in ('error', 'warning') else None)
        pg.add_init_script("window.__TEST='lite'")
        pg.goto(URL); pg.wait_for_function("()=>!!(window.__RTS&&window.__RTS.AUD)", timeout=15000)
        for f in ('dsp.js', 'controls.js', 'page.js'): pg.add_script_tag(content=(AUDIO / f).read_text(encoding='utf-8'))
        pg.evaluate("(v)=>ODP.setVocab(v)", {'factions': SFXF, 'units': UNITS, 'buildings': BUILDINGS})
        pg.evaluate(PAGE_JS)
        meta = pg.evaluate("""()=>({U:Object.fromEntries(Object.entries(__RTS.UDEF).map(([k,v])=>[k,{creep:!!v.creep,hero:!!v.hero,faction:v.faction||null,unique:!!v.unique,worker:!!v.worker,trade:!!v.trade,noWeapon:!!v.noWeapon,dmg:v.dmg||0,proj:v.proj||null}])),
          F:Object.fromEntries(Object.entries(__RTS.FACTIONS).map(([k,v])=>[k,{unique:v.unique}]))})""")
        if ARGS.shots:
            spectro(pg, [s for s in ARGS.shots.split(',') if s], ARGS.shots_dir); b.close(); print('wrote', ARGS.shots_dir); return 0
        info = pg.evaluate("()=>UG.ids()")
        by = {v['id']: v for v in info}
        uid = [v['id'] for v in info if not v['fallback'] and re.fullmatch(r'(%s)\.(%s)\.(%s)' % ('|'.join(UNITS), '|'.join(EVENTS), '|'.join(SFXF)), v['id'])]
        uid.sort()
        want = expected_matrix(meta)
        missing = [w for w in want if w not in by or by[w]['fallback']]
        extra = [i for i in uid if i not in set(want)]
        print(f'{len(uid)} unit voices registered, {len(want)} required, missing {len(missing)}: {missing[:8]}', flush=True)
        sel = [i for i in uid if (not ARGS.only or any(i.startswith(s) for s in ARGS.only.split(','))) and (not ARGS.fac or i.split('.')[2] in ARGS.fac.split(',')) and (not ARGS.ev or i.split('.')[1] in ARGS.ev.split(','))]
        # corpus for z-normalisation
        corpus = [v['id'] for v in info if v['bus'] != 'music' and not v['id'].startswith('ctl.')] if ARGS.corpus == 'all' else list(sel)
        others = [i for i in corpus if i not in set(sel)]
        pg.evaluate("()=>UG.store.clear()")
        recs = {}
        t1 = time.time()
        for i in range(0, len(sel), 12):
            for r in pg.evaluate("([a,o])=>UG.run(a,o)", [sel[i:i + 12], {'seeds': ARGS.seeds, 'samples': True, 'stereo': True, 'seedFeats': True}]): recs[r['id']] = r
            if (i // 12) % 6 == 5: print(f'   ... {min(i+12,len(sel))}/{len(sel)} unit voices ({time.time()-t1:.0f} s)', flush=True)
        for i in range(0, len(others), 25):
            pg.evaluate("([a,o])=>UG.run(a,o)", [others[i:i + 25], {'seeds': 1}])
        print(f'measured {len(sel)} unit voices x {ARGS.seeds} seeds + {len(others)} corpus voices in {time.time()-t1:.0f} s', flush=True)
        ev = pg.evaluate("(a)=>UG.evaluate(a)", sel)
        loop = loop_sim(pg) if any(i.startswith('hauler.mine') for i in sel) else None
        if ARGS.spectro:
            worst = sorted(ev['pairs'], key=lambda x: x['d'])[:6]
            spectro(pg, list(dict.fromkeys([x[k] for x in worst for k in ('a', 'b')])))
        b.close()

    # ------------------------------------------------------------------ numpy features + per-voice verdicts
    voices = []; fails = collections.defaultdict(list)
    for id_ in sel:
        r = recs[id_]; ty, evn, fa = id_.split('.')
        x = mono_np(r.pop('mono')); nf = np_features(x); lv = r['lv']
        tgt = CLASS_DB[r['cls']]
        hard = []
        if not lv['finite']: hard.append('finite')
        if lv['peak'] > 0.98: hard.append('peak %.3f' % lv['peak'])
        if not lv['activeDb'] > -60: hard.append('silent')
        if abs(lv['activeDb'] - tgt) > 4: hard.append('level %.1f vs %d' % (lv['activeDb'], tgt))
        if lv['dc'] >= 0.01: hard.append('dc %.4f' % lv['dc'])
        if lv['first'] >= 0.05: hard.append('first %.3f' % lv['first'])
        if lv['tailDb'] > -60: hard.append('tail %.1f dB' % lv['tailDb'])
        if lv['end'] > r['dur'] + r['tail'] + 0.05: hard.append('audible %.2f s > dur+tail %.2f' % (lv['end'], r['dur'] + r['tail']))
        if evn == 'fire' and r['dur'] > 0.35: hard.append('fire dur %.2f > 0.35' % r['dur'])
        if evn in ('select', 'ack') and r['dur'] > 0.6: hard.append('select/ack dur %.2f > 0.6' % r['dur'])
        if r['cls'] == 'boom' and r['dur'] > 2.5: hard.append('boom dur %.2f > 2.5' % r['dur'])
        if r['hashA'] != r['hashB']: hard.append('non-deterministic')
        var = len(set(r['seedHashes'][:3])) == 3
        if evn in ('fire', 'melee', 'select', 'ack', 'hit', 'mine', 'deliver') and not var: hard.append('no seed variation')
        if max(r['seedPeak']) > 0.98: hard.append('peak over seeds %.3f' % max(r['seedPeak']))
        if abs(r['engine']['act'] - lv['activeDb']) > 0.01: hard.append('engine/gate level disagree')
        for h in hard: fails[h.split(' ')[0]].append(id_)
        voices.append(dict(id=id_, type=ty, event=evn, faction=fa, cls=r['cls'], dur=r['dur'], tail=r['tail'], layers=r['layers'], sourceNodes=r['nodes'], seedNodes=[min(r['seedNodes']), max(r['seedNodes'])],
                           gain=round(r['gain'], 4), activeDb=round(lv['activeDb'], 2), targetDb=tgt, levelErrDb=round(lv['activeDb'] - tgt, 2), seedActiveDb=[round(min(r['seedAct']), 1), round(max(r['seedAct']), 1)], seedActiveDbMean=round(float(np.mean(r['seedAct'])), 2), peak=round(lv['peak'], 3),
                           peakAllSeeds=round(max(r['seedPeak']), 3), audibleEnd=round(lv['end'], 3), tailDb=round(lv['tailDb'], 1), dc=round(lv['dc'], 5), first=round(lv['first'], 4), sideDb=round(r['sideDb'], 1),
                           centroidHz=round(nf['centroid']), p95Hz=round(nf['p95_hz']), attackMs=round(nf['attack_ms'], 1), decayMs=round(nf['decay_ms']), flatnessDb=round(r['flatDb'], 1), pitchSlopeOctPerS=round(r['pitchSlope'], 2),
                           voicedFrac=round(r['voiced'], 2), odaCentroidHz=round(r['odaCentroid']), f0Hz=round(r['f0']), above5kHzDb=round(nf['hi_db'], 1), seedCentroidWanderOct=round(float(max(abs(np.log2(max(c, 1) / max(r['seedCen'][0], 1))) for c in r['seedCen'])), 2), intraZ=round(ev['intra'].get(id_, 0), 2), hash=r['hashA'], seedVariation=var, deterministic=r['hashA'] == r['hashB'], hard=hard))
    V = {v['id']: v for v in voices}

    # ------------------------------------------------------------------ distinctness
    TAU = 1.0
    pa = sorted([q for q in ev['pairs'] if q['rule'] == 'a'], key=lambda q: q['d']); pb = sorted([q for q in ev['pairs'] if q['rule'] == 'b'], key=lambda q: q['d'])

    def axes(a, c):
        A, C = V[a], V[c]
        return dict(centroidOct=round(abs(np.log2(max(A['centroidHz'], 1) / max(C['centroidHz'], 1))), 2), decayOct=round(abs(np.log2(max(A['decayMs'], 1) / max(C['decayMs'], 1))), 2),
                    attackOct=round(abs(np.log2(max(A['attackMs'], 1) / max(C['attackMs'], 1))), 2))
    def numpy_sep(a):  # separated on at least one named axis: centroid >= 0.25 oct, decay >= 0.3 oct, attack >= 0.5 oct
        return bool(a['centroidOct'] >= 0.25 or a['decayOct'] >= 0.3 or a['attackOct'] >= 0.5)
    fac_triples = []
    for k in sorted({q['key'] for q in pb}):
        _, ty, evn = k.split('|'); ids = [f'{ty}.{evn}.{f}' for f in FACTIONS if f'{ty}.{evn}.{f}' in V]
        if len(ids) < 2: continue
        tri = []
        for a, c in itertools.combinations(ids, 2):
            d = [q['d'] for q in pb if {q['a'], q['b']} == {a, c}][0]
            ax = axes(a, c); tri.append(dict(a=a.split('.')[2], b=c.split('.')[2], z=round(d, 2), **ax, namedAxis=numpy_sep(ax)))
        fac_triples.append(dict(unit=ty, event=evn, centroidHz={i.split('.')[2]: V[i]['centroidHz'] for i in ids}, attackMs={i.split('.')[2]: V[i]['attackMs'] for i in ids}, decayMs={i.split('.')[2]: V[i]['decayMs'] for i in ids}, pairs=tri, minZ=min(t['z'] for t in tri)))
    def pair_row(q):
        ax = axes(q['a'], q['b']); return dict(a=q['a'], b=q['b'], z=round(q['d'], 2), zAnySeeds=round(q.get('dSeeds', q['d']), 2), **ax, namedAxis=numpy_sep(ax))
    nn_units = {i: ev['nearestAny'][i] for i in sel if i in ev['nearestAny']}
    med = lambda l: round(float(np.median(l)), 2) if len(l) else None
    ftr = {}
    for fb in ('obsidian', 'aurora'):
        f0r, decr, cenr, side, flat, atkr = [], [], [], [], [], []
        for k in sorted({(v['type'], v['event']) for v in voices if v['faction'] == 'meridian'}):
            a, c = V.get(f'{k[0]}.{k[1]}.meridian'), V.get(f'{k[0]}.{k[1]}.{fb}')
            if not a or not c: continue
            if a['voicedFrac'] >= 0.5 and c['voicedFrac'] >= 0.5 and a['f0Hz'] and c['f0Hz']: f0r.append(c['f0Hz'] / a['f0Hz'])
            decr.append(c['decayMs'] / max(a['decayMs'], 1)); cenr.append(c['centroidHz'] / max(a['centroidHz'], 1)); side.append(c['sideDb'] - a['sideDb']); flat.append(c['flatnessDb'] - a['flatnessDb']); atkr.append(c['attackMs'] / max(a['attackMs'], 1))
        ftr[fb + '_vs_meridian'] = dict(pairs=len(decr), voicedPairs=len(f0r), medianF0Ratio=med(f0r), medianDecayRatio=med(decr), medianAttackRatio=med(atkr), medianCentroidRatio=med(cenr), medianSideDbDifference=med(side), medianFlatnessDbDifference=med(flat))
    fmed = {}
    for fa in SFXF:
        vv = [v for v in voices if v['faction'] == fa]
        if vv: fmed[fa] = dict(n=len(vv), centroidHz=med([v['centroidHz'] for v in vv]), decayMs=med([v['decayMs'] for v in vv]), attackMs=med([v['attackMs'] for v in vv]), sideDb=med([v['sideDb'] for v in vv]), flatnessDb=med([v['flatnessDb'] for v in vv]), above5kHzDb=med([v['above5kHzDb'] for v in vv]),
                               f0HzVoiced=med([v['f0Hz'] for v in vv if v['voicedFrac'] >= 0.5 and v['f0Hz']]))
    report = dict(
        meta=dict(generated=time.strftime('%Y-%m-%d %H:%M:%S'), url=URL, sampleRate=SR, tau=TAU, corpus=ARGS.corpus, corpusVoices=ev['n'], seedsPerVoice=ARGS.seeds,
                  honesty='Offline Chromium renders analysed with numpy and tests/audio/dsp.js. Nobody listened to these sounds: taste, mobile loudness and latency are untested.',
                  matrixRequired=len(want), matrixMissing=missing, extraVoices=extra, unitVoices=len(uid), measured=len(sel)),
        summary=dict(
            byEvent={e: sum(1 for v in voices if v['event'] == e) for e in EVENTS}, byFaction={f: sum(1 for v in voices if v['faction'] == f) for f in SFXF + []},
            hardFailures={k: len(v) for k, v in fails.items()}, nVoicesWithHardFailure=sum(1 for v in voices if v['hard']),
            peakMax=max(v['peakAllSeeds'] for v in voices), levelErrDbAbsMax=max(abs(v['levelErrDb']) for v in voices), levelErrDbAbsMean=round(float(np.mean([abs(v['levelErrDb']) for v in voices])), 2),
            fireDurMax=max([v['dur'] for v in voices if v['event'] == 'fire'] or [0]), fireSourceNodesMax=max([v['seedNodes'][1] for v in voices if v['event'] == 'fire'] or [0]), fireLayersMax=max([v['layers'] for v in voices if v['event'] == 'fire'] or [0]),
            selectAckDurMax=max([v['dur'] for v in voices if v['event'] in ('select', 'ack')] or [0]), dieDurMax=max([v['dur'] for v in voices if v['event'] == 'die'] or [0]),
            allDeterministic=all(v['deterministic'] for v in voices), allVariedWhereRepeatable=all(v['seedVariation'] for v in voices if v['event'] in ('fire', 'melee', 'select', 'ack', 'hit', 'mine', 'deliver')),
            centroidHzRange=[min(v['centroidHz'] for v in voices), max(v['centroidHz'] for v in voices)], factionTransform=ftr, factionMedians=fmed,
            seedWanderIntraZMax=max(v['intraZ'] for v in voices), seedWanderIntraZMedian=med([v['intraZ'] for v in voices])),
        distinct=dict(
            tau=TAU, pairsRuleA=len(pa), pairsRuleB=len(pb), belowTauA=sum(1 for q in pa if q['d'] < TAU), belowTauB=sum(1 for q in pb if q['d'] < TAU),
            minZA=round(pa[0]['d'], 2) if pa else None, minZB=round(pb[0]['d'], 2) if pb else None,
            medianZA=round(float(np.median([q['d'] for q in pa])), 2) if pa else None, medianZB=round(float(np.median([q['d'] for q in pb])), 2) if pb else None,
            closestTypePairsSameEventAndFaction=[pair_row(q) for q in pa[:25]], closestFactionPairsSameUnitAndEvent=[pair_row(q) for q in pb[:25]],
            factionVariantsNamedAxisSeparated='%d/%d pairs' % (sum(1 for f in fac_triples for t in f['pairs'] if t['namedAxis']), sum(len(f['pairs']) for f in fac_triples)),
            factionTriples=fac_triples),
        workerLoop30s=loop,
        nearestAnyVoice={k: dict(id=v[0], z=round(v[1], 2)) for k, v in sorted(nn_units.items(), key=lambda kv: kv[1][1])[:20]},
        voices=voices)
    pathlib.Path(ARGS.out).parent.mkdir(parents=True, exist_ok=True)
    pathlib.Path(ARGS.out).write_text(json.dumps(report, indent=1))
    s = report['summary']; d = report['distinct']
    print(f"voices {len(voices)}  hard failures {s['hardFailures']}  peakMax {s['peakMax']}  |level err| max {s['levelErrDbAbsMax']} mean {s['levelErrDbAbsMean']}  fire dur max {s['fireDurMax']} layers max {s['fireLayersMax']} sources max {s['fireSourceNodesMax']}")
    print(f"distinct: rule a {d['pairsRuleA']} pairs min {d['minZA']} below tau {d['belowTauA']};  rule b {d['pairsRuleB']} pairs min {d['minZB']} below tau {d['belowTauB']};  named-axis separation of faction variants {d['factionVariantsNamedAxisSeparated']}")
    for q in d['closestTypePairsSameEventAndFaction'][:8]: print('   a', q['a'], q['b'], q['z'])
    for q in d['closestFactionPairsSameUnitAndEvent'][:8]: print('   b', q['a'], q['b'], q['z'])
    if errs: print('page errors:', errs[:3])

    if ARGS.calibrate:
        t = SRC.read_text(encoding='utf-8')
        m = re.search(r'/\*TRIM:BEGIN\*/\nconst TRIM=\{(.*?)\};', t, re.S)
        old = {k: [float(x) for x in v.split(',')] for k, v in re.findall(r"'([a-z_.]+)':\[([0-9.,\- ]+)\]", m.group(1))}
        new = {}
        # level is linear in gain: new = old * 10^((target - mean over seeds of the active level)/20); the seed spread is part of the game's variation
        grp = collections.defaultdict(dict)
        for v in voices:
            key = f"{v['type']}.{v['event']}"; fl = ONLY_FACS.get(v['type'], FACTIONS); grp[key][v['faction']] = v
        for key, fv in grp.items():
            ty = key.split('.')[0]; facs = ONLY_FACS.get(ty, FACTIONS); arr = []
            for f in facs:
                v = fv.get(f)
                if not v: arr.append((old.get(key) or [1])[facs.index(f)] if key in old else 1.0); continue
                mean_db = v['seedActiveDbMean']
                g = v['gain'] * 10 ** ((v['targetDb'] - mean_db) / 20)
                pk = v['peakAllSeeds'] * (g / v['gain'])
                if pk > 0.95: g *= 0.95 / pk; print('   spiky: %s peak would be %.2f at target, trimmed %.1f dB below target' % (v['id'], pk, 20 * np.log10(pk / 0.95)))
                arr.append(g)
            new[key] = arr
        for k, v in old.items():
            if k not in new: new[k] = v
        rewrite_trim(new); print('TRIM table rewritten (%d entries); rebuild and re-run without --calibrate to verify' % len(new))
    hard = bool(report['meta']['matrixMissing']) or s['nVoicesWithHardFailure'] > 0 or d['belowTauA'] > 0 or d['belowTauB'] > 0
    print(f'{"FAILED" if hard else "ALL OK"} ({time.time()-t0:.0f} s)')
    return 1 if hard else 0


ONLY_FACS = {'bulwark': ['meridian'], 'reaver': ['obsidian'], 'specter': ['aurora'], 'hero_idris': ['meridian'], 'hero_kaz': ['obsidian'], 'hero_lyra': ['aurora'], 'crawler': ['wild'], 'spitter': ['wild'], 'brute': ['wild']}
if __name__ == '__main__':
    sys.exit(main())
