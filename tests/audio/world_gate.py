#!/usr/bin/env python3
"""World sound-design probe: measures every voice of src/js/81_sfx_world.js (buildings, hero skills, UI / economy / alert globals, fanfares, cinematic effects) and writes
tests/out/audio/world_report.json.

  OD_URL=file:///.../orbital_dominion_v3.html python3 tests/audio/world_gate.py        (build into a scratch dir first: never run a bare build.py next to other agents)
  python3 tests/audio/world_gate.py --only skill.,cine. --seeds 4 --out /tmp/x.json
Exit code 1 when a hard criterion fails.

Reuses the in-page half and the numpy helpers of units_gate.py (same dsp.js analyser, same 28-D feature vector, tau = 1.0 after z-normalisation over EVERY registered non-music voice).
Claims made by the report (nobody can listen here):
  matrix     12 buildings x {place done die} x 3 factions, hub/turret fire x 3, hub/generator amb x 3, 9 skills, every SFX_GLOBAL name that is not a legacy unit event (+ era/win/lose per faction),
             all 24 CINE_SFX exist as exact, non-fallback voice ids
  per voice  finite, peak <= 0.98 (all seeds), active-window RMS within +-4 dB of the class target (and the real deviation), |DC|, first sample, last 20 ms, duration vs declared (+ tail),
             fire <= 0.35 s and <= 4 source nodes, boom <= 2.5 s, everything <= 6 s with its tail, determinism (same seed = same hash), seed variation where the sound repeats,
             stereo width (side/mid) of the cinematic set, numpy centroid / attack / decay
  distinct   skills (9), cinematic (24), UI/global per class, building types of one event+faction (info), faction variants of one building+event, fanfare faction variants
Limits: offline Chromium renders, no loudspeaker, no listener. Taste, mobile loudness and latency are untested."""
import os, re, sys, json, time, pathlib, argparse, collections, itertools
import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
ap = argparse.ArgumentParser()
ap.add_argument('--only', default=''); ap.add_argument('--seeds', type=int, default=4)
ap.add_argument('--out', default=''); ap.add_argument('--tau', type=float, default=1.0)
ARGS = ap.parse_args()
_argv = sys.argv; sys.argv = [sys.argv[0]]
sys.path.insert(0, str(HERE))
import units_gate as U                                   # PAGE_JS, np_features, mono_np, vocab, CLASS_DB (its argparse sees an empty argv)
sys.argv = _argv
from playwright.sync_api import sync_playwright

ROOT = U.ROOT; OUT = pathlib.Path(ARGS.out or (U.OUT / 'world_report.json')); SR = U.SR
FACS = ['meridian', 'obsidian', 'aurora']
BUILDINGS = U.vocab('BUILDING_TYPES'); SKILLS = U.vocab('SFX_SKILLS'); CINE = U.vocab('CINE_SFX'); GLOBAL = U.vocab('SFX_GLOBAL')
LEGACY = {'ack', 'select', 'shoot', 'bolt', 'rocket', 'shell', 'acid', 'melee', 'boom', 'boomBig'}
ARMED = ['hub', 'turret']; HUMS = ['hub', 'generator']


def required():
    r = []
    for b in BUILDINGS:
        for e in ('place', 'done', 'die'): r += [f'{b}.{e}.{f}' for f in FACS]
    for b in ARMED: r += [f'{b}.fire.{f}' for f in FACS]
    for b in HUMS: r += [f'{b}.amb.{f}' for f in FACS]
    r += [f'skill.{s}' for s in SKILLS]
    r += [f'global.{g}' for g in GLOBAL if g not in LEGACY]
    r += [f'global.{n}.{f}' for n in ('era', 'win', 'lose') for f in FACS]
    r += [f'cine.{c}' for c in CINE]
    return r


def kind_of(i):
    h = i.split('.')[0]
    return 'building' if h in BUILDINGS else h if h in ('skill', 'global', 'cine') else 'other'


EVAL_JS = r"""
(opt)=>{
  const all=Array.from(UG.store.values()).filter(r=>r.feat),zn=ODA.znorm(all.map(r=>r.feat)),Z={};for(const r of all)Z[r.id]=ODA.zproj(r.feat,zn);
  const SF=id=>{const r=UG.store.get(id);return[Z[id]].concat((r.seedFeats||[]).map(v=>ODA.zproj(v,zn)));};
  const pairs=(ids,rule,key)=>{const o=[],I=ids.filter(i=>Z[i]);for(let i=0;i<I.length;i++)for(let j=i+1;j<I.length;j++){
    const A=SF(I[i]),B=SF(I[j]);let m=1e9;for(const a of A)for(const b of B){const d=ODA.dist(a,b);if(d<m)m=d;}
    o.push({rule,key,a:I[i],b:I[j],d:ODA.dist(Z[I[i]],Z[I[j]]),dSeeds:m});}return o;};
  const out=[];
  out.push(...pairs(opt.skills,'skills','nine skills'));
  out.push(...pairs(opt.cine,'cine','cinematic'));
  for(const k in opt.classes)out.push(...pairs(opt.classes[k],'global','ui/global '+k));
  for(const k in opt.byEventFaction)out.push(...pairs(opt.byEventFaction[k],'buildingTypes',k));
  for(const k in opt.byBuildingEvent)out.push(...pairs(opt.byBuildingEvent[k],'buildingFactions',k));
  for(const k in opt.fanfares)out.push(...pairs(opt.fanfares[k],'fanfareFactions',k));
  for(const k in opt.fanfareNames)out.push(...pairs(opt.fanfareNames[k],'fanfareNames',k));
  const nn={};for(const id of opt.focus){if(!Z[id])continue;let m=1e9,w=null;for(const o of all){if(o.id===id)continue;const d=ODA.dist(Z[id],Z[o.id]);if(d<m){m=d;w=o.id;}}nn[id]=[w,m];}
  const intra={};for(const id of opt.focus){const A=Z[id]?SF(id):null;if(!A||A.length<2)continue;let m=0;for(let i=1;i<A.length;i++)m=Math.max(m,ODA.dist(A[0],A[i]));intra[id]=m;}
  return{n:all.length,pairs:out,nearestAny:nn,intra};
}
"""


def main():
    t0 = time.time()
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--no-sandbox'])
        pg = b.new_page(viewport={'width': 1366, 'height': 800})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.add_init_script("window.__TEST='lite'")
        pg.goto(U.URL); pg.wait_for_function("()=>!!(window.__RTS&&window.__RTS.AUD)", timeout=20000)
        for f in ('dsp.js', 'controls.js', 'page.js'): pg.add_script_tag(content=(U.AUDIO / f).read_text(encoding='utf-8'))
        pg.evaluate("(v)=>ODP.setVocab(v)", {'factions': U.SFXF, 'units': U.UNITS, 'buildings': BUILDINGS})
        pg.evaluate(U.PAGE_JS)
        info = pg.evaluate("()=>UG.ids()"); by = {v['id']: v for v in info}
        want = required()
        missing = [w for w in want if w not in by or by[w]['fallback']]
        mine = sorted(i for i in by if not by[i]['fallback'] and (kind_of(i) != 'other') and not i.startswith('ctl.'))
        sel = [i for i in mine if not ARGS.only or any(i.startswith(s) for s in ARGS.only.split(','))]
        print(f'{len(mine)} world voices registered ({len(want)} required, missing {len(missing)}: {missing[:6]}), measuring {len(sel)}', flush=True)
        corpus = [v['id'] for v in info if v['bus'] != 'music' and not v['id'].startswith('ctl.')]
        others = [i for i in corpus if i not in set(sel)]
        pg.evaluate("()=>UG.store.clear()")
        recs = {}
        for i in range(0, len(sel), 12):
            for r in pg.evaluate("([a,o])=>UG.run(a,o)", [sel[i:i + 12], {'seeds': ARGS.seeds, 'samples': True, 'stereo': True, 'seedFeats': True}]): recs[r['id']] = r
        for i in range(0, len(others), 25): pg.evaluate("([a,o])=>UG.run(a,o)", [others[i:i + 25], {'seeds': 1}])
        print(f'measured {len(sel)} voices x {ARGS.seeds} seeds + {len(others)} corpus voices in {time.time()-t0:.0f} s', flush=True)
        S = set(sel)
        skills = [f'skill.{s}' for s in SKILLS if f'skill.{s}' in S]; cine = [f'cine.{c}' for c in CINE if f'cine.{c}' in S]
        classes = collections.defaultdict(list)
        for i in sel:
            if kind_of(i) == 'global' and len(i.split('.')) == 2: classes[by[i]['cls']].append(i)
        bef = collections.defaultdict(list); bbe = collections.defaultdict(list)
        for i in sel:
            if kind_of(i) != 'building': continue
            t, e, f = i.split('.'); bef[f'{e}|{f}'].append(i); bbe[f'{t}|{e}'].append(i)
        fan = {n: [f'global.{n}.{f}' for f in FACS if f'global.{n}.{f}' in S] for n in ('era', 'win', 'lose')}
        fnm = {f: [f'global.{n}.{f}' for n in ('era', 'win', 'lose') if f'global.{n}.{f}' in S] for f in FACS}
        ev = pg.evaluate(EVAL_JS.strip(), dict(skills=skills, cine=cine, classes=dict(classes), byEventFaction=dict(bef), byBuildingEvent=dict(bbe), fanfares=fan, fanfareNames=fnm, focus=sel))
        b.close()

    voices = []; fails = collections.defaultdict(list)
    for id_ in sel:
        r = recs[id_]; x = U.mono_np(r.pop('mono')); nf = U.np_features(x); lv = r['lv']; tgt = U.CLASS_DB[r['cls']]; kind = kind_of(id_); parts = id_.split('.')
        ev_name = parts[1] if kind == 'building' else ''
        hard = []
        if not lv['finite']: hard.append('finite')
        if lv['peak'] > 0.98: hard.append('peak %.3f' % lv['peak'])
        if not lv['activeDb'] > -60: hard.append('silent')
        if abs(lv['activeDb'] - tgt) > 4: hard.append('level %.1f vs %d' % (lv['activeDb'], tgt))
        if lv['dc'] >= 0.01: hard.append('dc %.4f' % lv['dc'])
        if lv['first'] >= 0.05: hard.append('first %.3f' % lv['first'])
        if lv['tailDb'] > -60: hard.append('tail %.1f dB' % lv['tailDb'])
        if lv['end'] > r['dur'] + r['tail'] + 0.05: hard.append('audible %.2f s > dur+tail %.2f' % (lv['end'], r['dur'] + r['tail']))
        if r['dur'] + r['tail'] > 6.0: hard.append('dur+tail %.2f > 6' % (r['dur'] + r['tail']))
        if ev_name == 'fire' and r['dur'] > 0.35: hard.append('fire dur %.2f > 0.35' % r['dur'])
        if ev_name == 'fire' and max(r['seedNodes']) > 4: hard.append('fire nodes %d > 4' % max(r['seedNodes']))
        if r['cls'] == 'boom' and r['dur'] > 2.5: hard.append('boom dur %.2f > 2.5' % r['dur'])
        if r['hashA'] != r['hashB']: hard.append('non-deterministic')
        var = len(set(r['seedHashes'][:3])) == 3
        if ev_name in ('fire', 'place', 'die') and not var: hard.append('no seed variation')
        if max(r['seedPeak']) > 0.98: hard.append('peak over seeds %.3f' % max(r['seedPeak']))
        if abs(r['engine']['act'] - lv['activeDb']) > 0.01: hard.append('engine/gate level disagree')
        for h in hard: fails[h.split(' ')[0]].append(id_)
        voices.append(dict(id=id_, kind=kind, cls=r['cls'], dur=r['dur'], tail=r['tail'], layers=r['layers'], sourceNodes=[min(r['seedNodes']), max(r['seedNodes'])], gain=round(r['gain'], 4),
                           activeDb=round(lv['activeDb'], 2), targetDb=tgt, levelErrDb=round(lv['activeDb'] - tgt, 2), seedActiveDb=[round(min(r['seedAct']), 1), round(max(r['seedAct']), 1)], peak=round(lv['peak'], 3),
                           peakAllSeeds=round(max(r['seedPeak']), 3), audibleEnd=round(lv['end'], 3), tailDb=round(lv['tailDb'], 1), dc=round(lv['dc'], 5), first=round(lv['first'], 4), sideDb=round(r['sideDb'], 1),
                           centroidHz=round(nf['centroid']), p95Hz=round(nf['p95_hz']), attackMs=round(nf['attack_ms'], 1), decayMs=round(nf['decay_ms']), flatnessDb=round(r['flatDb'], 1), pitchSlopeOctPerS=round(r['pitchSlope'], 2),
                           f0Hz=round(r['f0']), above5kHzDb=round(nf['hi_db'], 1), intraZ=round(ev['intra'].get(id_, 0), 2), hash=r['hashA'], seedVariation=var, deterministic=r['hashA'] == r['hashB'], hard=hard))
    V = {v['id']: v for v in voices}
    tau = ARGS.tau
    med = lambda l: round(float(np.median(l)), 2) if len(l) else None

    def rows(rule):
        pr = sorted([q for q in ev['pairs'] if q['rule'] == rule], key=lambda q: q['d'])
        return pr

    def short(q):
        A, B = V.get(q['a']), V.get(q['b'])
        ax = dict(centroidOct=round(abs(np.log2(max(A['centroidHz'], 1) / max(B['centroidHz'], 1))), 2), decayOct=round(abs(np.log2(max(A['decayMs'], 1) / max(B['decayMs'], 1))), 2),
                  attackOct=round(abs(np.log2(max(A['attackMs'], 1) / max(B['attackMs'], 1))), 2)) if A and B else {}
        return dict(a=q['a'], b=q['b'], z=round(q['d'], 2), zAnySeeds=round(q['dSeeds'], 2), **ax)

    dist = {}
    for rule, label in (('skills', 'nine hero skills'), ('cine', '24 cinematic effects'), ('global', 'UI/global voices of one class'), ('buildingTypes', 'building types, same event + faction (info)'),
                        ('buildingFactions', 'faction variants of one building + event'), ('fanfareFactions', 'faction variants of era / win / lose'), ('fanfareNames', 'era vs win vs lose within one faction')):
        pr = rows(rule)
        dist[rule] = dict(what=label, pairs=len(pr), belowTau=sum(1 for q in pr if q['d'] < tau), belowTauAnySeeds=sum(1 for q in pr if q['dSeeds'] < tau), minZ=round(pr[0]['d'], 2) if pr else None,
                          medianZ=med([q['d'] for q in pr]), closest=[short(q) for q in pr[:8]])
    # the cinematic set is stereo-wide by design: median side/mid per group
    def grp(f): return [v for v in voices if f(v)]
    g_b, g_s, g_g, g_c = grp(lambda v: v['kind'] == 'building'), grp(lambda v: v['kind'] == 'skill'), grp(lambda v: v['kind'] == 'global'), grp(lambda v: v['kind'] == 'cine')
    fa_sum = {}
    for f in FACS:
        vv = [v for v in g_b if v['id'].endswith('.' + f)]
        if vv: fa_sum[f] = dict(n=len(vv), centroidHzMedian=med([v['centroidHz'] for v in vv]), decayMsMedian=med([v['decayMs'] for v in vv]), attackMsMedian=med([v['attackMs'] for v in vv]),
                                f0HzMedian=med([v['f0Hz'] for v in vv if v['f0Hz']]), above5kHzDbMedian=med([v['above5kHz' + 'Db'] for v in vv]))
    report = dict(
        meta=dict(generated=time.strftime('%Y-%m-%d %H:%M:%S'), url=U.URL, sampleRate=SR, tau=tau, corpusVoices=ev['n'], seedsPerVoice=ARGS.seeds, required=len(want), missing=missing, measured=len(sel),
                  honesty='Offline Chromium renders analysed with numpy and tests/audio/dsp.js. Nobody listened to these sounds: taste, mobile loudness and latency are untested.'),
        summary=dict(
            counts=dict(buildings=len(g_b), skills=len(g_s), globals=len(g_g), cine=len(g_c)),
            hardFailures={k: len(v) for k, v in fails.items()}, nVoicesWithHardFailure=sum(1 for v in voices if v['hard']),
            peakMax=max(v['peakAllSeeds'] for v in voices), levelErrDbAbsMax=max(abs(v['levelErrDb']) for v in voices), levelErrDbAbsMean=round(float(np.mean([abs(v['levelErrDb']) for v in voices])), 2),
            levelErrByClass={c: dict(n=len(vv), meanAbs=round(float(np.mean([abs(v['levelErrDb']) for v in vv])), 2), maxAbs=round(float(max(abs(v['levelErrDb']) for v in vv)), 2)) for c in sorted({v['cls'] for v in voices}) for vv in [[v for v in voices if v['cls'] == c]]},
            fireDurMax=max([v['dur'] for v in g_b if v['id'].split('.')[1] == 'fire'] or [0]), fireSourceNodesMax=max([v['sourceNodes'][1] for v in g_b if v['id'].split('.')[1] == 'fire'] or [0]),
            boomDurMax=max([v['dur'] for v in voices if v['cls'] == 'boom'] or [0]), durPlusTailMax=round(max(v['dur'] + v['tail'] for v in voices), 2), cineDurPlusTailMax=round(max([v['dur'] + v['tail'] for v in g_c] or [0]), 2),
            allDeterministic=all(v['deterministic'] for v in voices), cineSideDbMedian=med([v['sideDb'] for v in g_c]), buildingSideDbMedian=med([v['sideDb'] for v in g_b]), globalSideDbMedian=med([v['sideDb'] for v in g_g]),
            cineCentroidHzRange=[min([v['centroidHz'] for v in g_c] or [0]), max([v['centroidHz'] for v in g_c] or [0])], cineDurRange=[min([v['dur'] for v in g_c] or [0]), max([v['dur'] for v in g_c] or [0])],
            buildingFactionMedians=fa_sum, seedWanderIntraZMax=max(v['intraZ'] for v in voices), seedWanderIntraZMedian=med([v['intraZ'] for v in voices])),
        distinct=dist,
        nearestAnyVoice={k: dict(id=v[0], z=round(v[1], 2)) for k, v in sorted(ev['nearestAny'].items(), key=lambda kv: kv[1][1])[:25]},
        voices=voices)
    OUT.parent.mkdir(parents=True, exist_ok=True); OUT.write_text(json.dumps(report, indent=1))
    s = report['summary']
    print(f"voices {len(voices)} {s['counts']}  hard failures {s['hardFailures']}  peakMax {s['peakMax']}  |level err| max {s['levelErrDbAbsMax']} mean {s['levelErrDbAbsMean']}  boom dur max {s['boomDurMax']}  dur+tail max {s['durPlusTailMax']}")
    for k, d in dist.items():
        print(f"distinct {k:17s} {d['pairs']:5d} pairs  min z {d['minZ']}  median {d['medianZ']}  below tau {d['belowTau']} (any seeds {d['belowTauAnySeeds']})")
        for q in d['closest'][:3]: print('      ', q['a'], q['b'], q['z'])
    if errs: print('page errors:', errs[:3])
    hard = bool(missing) or s['nVoicesWithHardFailure'] > 0 or any(dist[k]['belowTau'] > 0 for k in ('skills', 'cine', 'global', 'buildingFactions', 'fanfareFactions', 'fanfareNames'))
    print(f'{"FAILED" if hard else "ALL OK"} ({time.time()-t0:.0f} s)')
    return 1 if hard else 0


if __name__ == '__main__':
    sys.exit(main())
