"""Audio content gate (Playwright + Chromium, offline renders).  Exit code != 0 on failure.
   python3 tests/e2e/e2e_audio.py                    (a few minutes; OD_URL=file://... points it at a scratch build)
   python3 tests/e2e/e2e_audio.py --only rifleman.   (voice ids starting with ...; comma list)   --cue theme_,intro   --no-music   --no-voices   --quick (no build mutations)   --full (intro + finale at full length)
   python3 tests/e2e/e2e_audio.py --spectro rifleman.fire.obsidian,hub.done.aurora    (just write spectrogram PNGs to tests/out/audio/spectro/)

Implements docs/AUDIO_SPEC.md §6 for EVERY voice in audioVoices() and EVERY cue in MUSIC_CUES. Nobody can listen to the result here, so quality means these measurements:
  voices   1  finite, peak <= 0.98, not silent (>= -60 dBFS active RMS), |DC| < 0.01, first sample < 0.05, last 20 ms < -60 dBFS, duration within dur+tail (and <= 6 s;
              unit events: fire <= 0.35 s, select/ack <= 0.6 s, boom class <= 2.5 s)
           2  active-window RMS within +-4 dB of its class (ui -26, fire -22, impact -18, boom -14, voice -20, alert -17, cine -18, music -20, amb -30)
           3  deterministic (identical FNV-1a hash of two renders with the same seed) and pure (the builders run with Math.random / Date.now / performance.now stubbed to throw);
              repeatable sounds (fire/melee/select/ack/hit) must vary with the seed (no machine-gunning)
           4  distinct: 28-D feature vector (20 Bark-like bands, centroid, flatness, attack, decay, zcr, pitch-contour slope + voiced fraction + duration), z-normalised over the corpus,
              pairwise distance >= tau (1.0, validated on the corpus' own clone distances every run) for (a) every pair of unit types with the same event and faction,
              (b) the faction variants of one unit / building and event, (c) the nine skills, (d) the UI/global voices of one class and the cinematic voices; no two ids render identically
  matrix   every unit type x {select, ack, die, ready, fire|melee} x the factions that field it, every building x {place, done, die, fire (armed)} x 3 factions, 9 skills exist as exact
           voice ids; every SFX_GLOBAL name (except the legacy unit-event names) and every CINE_SFX name is served by a DESIGNED voice, not a generic fallback
  cues     5  per cue (first min(len, 24) s): finite, peak <= 0.98, programme loudness -26..-14 dBFS (stings: active window), crest 6..26 dB, no dead air > 1.5 s
           6  tempo (onset-envelope autocorrelation) within +-3 % of the declared tempo or a clean 2x / 0.5x; key (chroma x Krumhansl-Kessler) = declared tonic for >= 80 % of the cues
              and every miss declared modal/atonal; the three faction themes distinct on chroma + centroid + onset density
           7  loop seam (loop:true): last 0.25 s vs first 0.25 s of the second pass < 6 dB, no click
           8  deterministic
  controls the self-test (tests/audio/selftest.js: known-answer signals + silence, clipped square, white noise, DC, NaN, clicks, wrong tempo/key, dead air, seam step/click, duplicated
           voice, cloned voices) runs first; then the SAME pipeline is run on controls registered as real voices and as a real 'cue' renderer, and on deliberately broken builds
           (silent / +9.5 dB / non-deterministic / Math.random in a builder / every id renders the same sound): each MUST be rejected for the right reason (CLAUDE.md rule 15).

How the gate finds things the music module owns (docs/AUDIO_SPEC.md §4 leaves the access path open, so it is fixed here):
  * audioRender({cue:id},seconds,sr) renders a cue offline; for loop:true cues a render longer than one loop must wrap (the second pass starts at the loop length)
  * the DECLARED tempo / key / mode / loop length of a cue must be reachable as  __RTS.musicInfo(id) -> {tempo|bpm, key:'D', mode:'dorian', beats, len, sections:[{bars}]}
    (or __RTS.MUSIC_DATA[id]); loop length = loopLen or sum(sections.bars) x beats x 60 / tempo, else MUSIC_CUES[id].len
Limits: Chromium software audio; no loudspeaker, no listener: subjective taste, mobile loudness, latency and the iOS/Android lifecycle are NOT tested."""
import os, re, sys, json, time, base64, pathlib, subprocess, tempfile, argparse, urllib.request, collections
from urllib.parse import unquote, urlparse
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
URL = os.environ.get('OD_URL') or (ROOT / 'dist' / 'orbital_dominion_v3.html').as_uri()
OUT = ROOT / 'tests' / 'out' / 'audio'
OUT.mkdir(parents=True, exist_ok=True)
AUDIO = ROOT / 'tests' / 'audio'
ap = argparse.ArgumentParser()
ap.add_argument('--only', default=''); ap.add_argument('--cue', default=''); ap.add_argument('--no-music', action='store_true'); ap.add_argument('--no-voices', action='store_true')
ap.add_argument('--quick', action='store_true'); ap.add_argument('--full', action='store_true'); ap.add_argument('--no-selftest', action='store_true'); ap.add_argument('--spectro', default='')
ARGS = ap.parse_args()
T0 = time.time()
fails = []; errs = []; reqs = []


def ok(c, m):
    print(('ok    ' if c else 'FAIL  ') + m, flush=True)
    if not c: fails.append(m)


def note(m): print('note  ' + m, flush=True)


def vocab(name):
    t = (ROOT / 'src' / 'js' / '43_vocab.js').read_text(encoding='utf-8')
    m = re.search(r'const ' + name + r'=\[(.*?)\];', t, re.S)
    return re.findall(r"'([^']+)'", re.sub(r'//[^\n]*', '', m.group(1)))


VOC = {'units': vocab('UNIT_TYPES'), 'buildings': vocab('BUILDING_TYPES'), 'factions': vocab('SFX_FACTIONS'), 'skills': vocab('SFX_SKILLS'), 'global': vocab('SFX_GLOBAL'), 'cine': vocab('CINE_SFX')}
LEGACY_UNIT_NAMES = 'ack select shoot bolt rocket shell acid melee boom boomBig'.split()   # these resolve through the unit-aware dispatcher; their generic voice is the deliberate fallback
FACTION_IDS = ['meridian', 'obsidian', 'aurora']
VARIATION_EVENTS = {'fire', 'melee', 'select', 'ack', 'hit'}


def new_page(b, url, track=True):
    pg = b.new_page(viewport={'width': 1366, 'height': 800})
    if track:
        pg.on('pageerror', lambda e: errs.append(('pageerror', str(e))))
        pg.on('console', lambda m: errs.append((m.type, m.text)) if m.type in ('error', 'warning') else None)
        pg.on('request', lambda r: reqs.append(r.url[:80]) if not r.url.startswith(('file:', 'data:', 'blob:')) else None)
    pg.add_init_script("window.__TEST='lite'")   # exports __RTS without starting the demo / frame loop: nothing else touches audio
    pg.goto(url); pg.wait_for_function("()=>!!(window.__RTS&&window.__RTS.AUD)", timeout=15000)
    for f in ('dsp.js', 'controls.js', 'page.js'):
        pg.add_script_tag(content=(AUDIO / f).read_text(encoding='utf-8'))
    pg.evaluate("(v)=>ODP.setVocab(v)", {'factions': VOC['factions'], 'units': VOC['units'], 'buildings': VOC['buildings']})
    return pg


def show(items, n=6, fmt=lambda x: str(x)):
    return ('; '.join(fmt(x) for x in items[:n]) + (f' ... +{len(items)-n} more' if len(items) > n else '')) if items else ''


# ------------------------------------------------------------------ spectrograms (numpy + PIL; only for failing / requested voices)
def spectro(pg, ids, tag=''):
    try:
        import numpy as np
        from PIL import Image
    except Exception as e:
        note('spectrograms skipped (numpy/PIL missing: %s)' % e); return []
    d = OUT / 'spectro'; d.mkdir(parents=True, exist_ok=True); done = []
    for vid in ids:
        r = pg.evaluate("""async(id)=>{const r=await ODP.rs({sfx:id,seed:0});const L=r.channels[0],R=r.channels[1],m=new Float32Array(L.length);for(let i=0;i<m.length;i++)m[i]=.5*(L[i]+R[i]);
          const u=new Uint8Array(m.buffer);let s='';for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s);}""", vid)
        x = np.frombuffer(base64.b64decode(r), dtype=np.float32).astype(np.float64)
        n_fft, hop = 1024, 128
        if len(x) < n_fft: x = np.pad(x, (0, n_fft - len(x)))
        w = np.hanning(n_fft); fr = [np.abs(np.fft.rfft(x[i:i + n_fft] * w)) for i in range(0, len(x) - n_fft + 1, hop)]
        S = 20 * np.log10(np.array(fr).T + 1e-9); S = np.clip((S - (S.max() - 80)) / 80, 0, 1)[::-1]
        rgb = np.stack([np.clip(S * 2, 0, 1), np.clip(S * 2 - 0.6, 0, 1) * 0.9, np.clip(1.5 - np.abs(S * 3 - 1.2), 0, 1) * (S > 0.05)], -1)
        img = Image.fromarray((rgb * 255).astype(np.uint8)).resize((min(1100, max(300, S.shape[1] * 2)), 360), Image.NEAREST)
        p = d / (re.sub(r'[^A-Za-z0-9_.-]', '_', vid) + tag + '.png'); img.save(p); done.append(str(p))
    return done


# ------------------------------------------------------------------ the matrix of voices that must exist (docs/AUDIO_SPEC.md §3)
def required_matrix(meta):
    U, B, F = meta['U'], meta['B'], meta['F']; req = []
    for t in VOC['units']:
        d = U.get(t)
        if not d: continue
        if d['creep']: facs = ['wild']
        elif d['hero']: facs = [d['faction']]
        elif d['unique']: facs = [f for f in FACTION_IDS if F.get(f, {}).get('unique') == t]
        else: facs = FACTION_IDS
        armed = d['dmg'] > 0 and not d['noWeapon'] and not d['worker'] and not d['trade']
        for f in facs:
            if not d['creep']:
                for ev in ('select', 'ack', 'ready'): req.append(([f'{t}.{ev}.{f}'], f'{t}.{ev}.{f}'))
            req.append(([f'{t}.die.{f}'], f'{t}.die.{f}'))
            if armed: req.append(([f'{t}.fire.{f}', f'{t}.melee.{f}'] if not d['proj'] else [f'{t}.fire.{f}'], f'{t}.{"fire" if d["proj"] else "melee|fire"}.{f}'))
    for t in VOC['buildings']:
        evs = ['place', 'done', 'die'] + (['fire'] if B.get(t, {}).get('dmg', 0) > 0 else [])
        for f in FACTION_IDS:
            for ev in evs: req.append(([f'{t}.{ev}.{f}'], f'{t}.{ev}.{f}'))
    for s in VOC['skills']: req.append(([f'skill.{s}'], f'skill.{s}'))
    return req


# ================================================================== main run
with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])
    pg = new_page(b, URL)
    if ARGS.spectro:
        ids = [s for s in ARGS.spectro.split(',') if s]
        print('\n'.join(spectro(pg, ids)) or 'nothing written'); b.close(); sys.exit(0)

    # ---------------------------------------------------------------- 0. the measurement code measures, and every check rejects its control
    if not ARGS.no_selftest:
        r = subprocess.run(['node', str(AUDIO / 'selftest.js')], capture_output=True, text=True, cwd=str(ROOT))
        lines = r.stdout.strip().splitlines()
        bad = [l for l in lines if l.startswith('FAIL')]
        for l in bad: print('      selftest: ' + l[:300])
        ok(r.returncode == 0 and not bad, 'tests/audio/selftest.js: ' + (lines[-1] if lines else r.stderr[:200]) + f' ({sum(1 for l in lines if l.startswith("ok"))} assertions: known-answer signals + silence / clipped square / white noise / DC / NaN / clicks / wrong tempo / wrong key / dead air / seam / duplicated and cloned voices all rejected)')

    info = pg.evaluate("()=>Object.values(ODP.info())")
    ids_all = sorted(v['id'] for v in info); by_id = {v['id']: v for v in info}
    nfall = sum(1 for v in info if v['fallback'])
    ok(len(ids_all) > 0, f'{len(ids_all)} voices registered ({nfall} generic fallbacks, {len(ids_all)-nfall} designed)')
    classes = pg.evaluate("()=>__RTS.AUD.classes()")
    ok(all(classes[k]['db'] == v for k, v in {'ui': -26, 'fire': -22, 'impact': -18, 'boom': -14, 'voice': -20, 'alert': -17, 'cine': -18, 'music': -20, 'amb': -30}.items()), 'the engine\'s class table equals docs/AUDIO_SPEC.md §6 (ui -26, fire -22, impact -18, boom -14, voice -20, alert -17, cine -18, music -20, amb -30)')

    # ---------------------------------------------------------------- 1. the matrix
    if not ARGS.no_voices and not ARGS.only:
        meta = pg.evaluate("""()=>({U:Object.fromEntries(Object.entries(__RTS.UDEF).map(([k,v])=>[k,{creep:!!v.creep,hero:!!v.hero,faction:v.faction||null,unique:!!v.unique,worker:!!v.worker,trade:!!v.trade,noWeapon:!!v.noWeapon,dmg:v.dmg||0,proj:v.proj||null}])),
          B:Object.fromEntries(Object.entries(__RTS.BDEF).map(([k,v])=>[k,{dmg:v.dmg||0}])),F:Object.fromEntries(Object.entries(__RTS.FACTIONS).map(([k,v])=>[k,{unique:v.unique}]))})""")
        req = required_matrix(meta); have = set(ids_all)
        miss = [lab for alts, lab in req if not any(a in have for a in alts)]
        miss_u = [m for m in miss if m.split('.')[0] in VOC['units']]; miss_b = [m for m in miss if m.split('.')[0] in VOC['buildings']]; miss_s = [m for m in miss if m.startswith('skill.')]
        def grp(l):
            c = collections.Counter(m.split('.')[0] for m in l); return ', '.join(f'{k}:{v}' for k, v in sorted(c.items()))
        ok(not miss_u, f'unit voices: every required <type>.<event>.<faction> exists ({sum(1 for a,l in req if l.split(".")[0] in VOC["units"])} required: select ack ready die + fire|melee, for the factions that field the unit)' + (f' - MISSING {len(miss_u)}: {grp(miss_u)} e.g. {show(miss_u, 4)}' if miss_u else ''))
        ok(not miss_b, f'building voices: place done die (+ fire for armed buildings) x 3 factions exist' + (f' - MISSING {len(miss_b)}: {grp(miss_b)} e.g. {show(miss_b, 4)}' if miss_b else ''))
        ok(not miss_s, 'the nine hero skills have a skill.<id> voice' + (f' - MISSING: {show(miss_s, 9)}' if miss_s else ''))
        names = [n for n in VOC['global'] if n not in LEGACY_UNIT_NAMES]
        res = pg.evaluate("(a)=>a.map(n=>{const v=__RTS.AUD.resolve(n);return [n,v?v.id:null,v?!!v.fallback:null];})", names)
        generic = [f'{n}({vid})' for n, vid, fb in res if vid is None or fb]
        ok(not generic, f'every SFX_GLOBAL name outside the legacy unit events is served by a DESIGNED voice ({len(names)} names)' + (f' - still generic fallbacks: {len(generic)}: {show(generic, 12)}' if generic else ''))
        cres = [f'cine.{n}' for n in VOC['cine'] if f'cine.{n}' not in by_id or by_id[f'cine.{n}']['fallback']]
        ok(not cres, f'every CINE_SFX name has a DESIGNED cine.<name> voice ({len(VOC["cine"])} names)' + (f' - still generic fallbacks / missing: {len(cres)}: {show(cres, 12)}' if cres else ''))

    # ---------------------------------------------------------------- 2. the corpus (checks 1-4)
    vrep = None
    if not ARGS.no_voices:
        pref = [s for s in ARGS.only.split(',') if s]
        ids = [i for i in ids_all if not pref or any(i.startswith(s) for s in pref)]
        step = max(1, len(ids) // 40); panel = ids[::step][:40]
        varia = [i for i in ids if len(i.split('.')) == 3 and i.split('.')[1] in VARIATION_EVENTS]
        t1 = time.time(); pg.evaluate("()=>ODP.reset()")
        for i in range(0, len(ids), 25):
            pg.evaluate("([a,o])=>ODP.runVoices(a,o)", [ids[i:i + 25], {'variationIds': varia, 'panelIds': panel}])
            if (i // 25) % 8 == 7: print(f'      ... {min(i+25,len(ids))}/{len(ids)} voices rendered and measured ({time.time()-t1:.0f} s)', flush=True)
        vrep = pg.evaluate("()=>ODP.evaluateVoices()")
        note(f'{len(ids)} voices x 2 renders (+ {len(panel)} panel voices x 5 extra seeds, {len(varia)} repeatable voices x 2) in {time.time()-t1:.0f} s')
        bycode = collections.defaultdict(list)
        for f in vrep['fails']: bycode[f['code']].append(f)
        ex = lambda code, n=5: show(bycode[code], n, lambda f: f"{f['id']}: {f['msg']}")
        n = len(ids)
        def chk(num, codes, text):
            l = [f for c in codes for f in bycode[c]]
            ok(not l, f'check {num}: {text} ({n} voices)' + (f' - {len(set(f["id"] for f in l))} FAIL: ' + show(l, 6, lambda f: f"{f['id']}: {f['msg']}") if l else ''))
        chk('1a', ['render'], 'every voice renders offline without error')
        chk('1b', ['finite'], 'finite samples'); chk('1c', ['peak'], 'peak <= 0.98'); chk('1d', ['silent'], 'not silent (active RMS >= -60 dBFS)'); chk('1e', ['dc'], '|DC| < 0.01')
        chk('1f', ['first', 'tail'], 'no click: first sample < 0.05, last 20 ms < -60 dBFS'); chk('1g', ['duration', 'budget'], 'duration within dur+tail <= 6 s, fire <= 0.35 s, select/ack <= 0.6 s, boom <= 2.5 s')
        chk('2', ['level', 'class'], 'active-window RMS within +-4 dB of the voice\'s class')
        chk('3a', ['determinism'], 'two renders with the same seed hash identically'); chk('3b', ['impure'], 'builders use no Math.random / Date.now / performance.now')
        chk('3c', ['variation'], 'repeatable voices (fire/melee/select/ack/hit) vary with the seed - no machine-gunning'); chk('meas', ['measure'], 'the gate\'s analyser and the engine\'s audioAnalyse/audioHash agree')
        dups = vrep['duplicates']
        dcl = vrep['defClones']
        ok(not dups and not dcl, 'no two voice ids render identically or share one definition (copy-paste clones)' + (f' - identical renders {len(dups)}: {show(dups, 4, lambda g: "=".join(g[:4]))}' if dups else '') + (f' - identical definitions {len(dcl)}: {show(dcl, 4, lambda g: "=".join(g[:4]))}' if dcl else ''))
        cal = vrep.get('cal')
        if cal:
            ok(cal['ok'], f"tau calibration: tau {cal['tau']} >= 1.5 x median clone distance {cal['medIntra']:.2f} (P90 {cal['p90Intra']:.2f}, {cal['panel']} panel voices x 5 seeds) and <= median nearest other voice {cal['medInter']:.2f} (P10 {cal['p10Inter']:.2f})")
            cp = vrep.get('controlPair')
            if cp: ok(cp['d'] < cal['tau'] and cp['dup'] == 0, f"control pair: {cp['id']} against its own seed-1 render is {cp['d']:.2f} apart (< tau, so it FAILS the distinctness test as a clone must), a duplicate is {cp['dup']:.0f}")
        else: ok(False, 'distinctness could not be calibrated: fewer than 4 voices with features')
        pairs = vrep.get('pairs') or []
        for rule, txt in (('a', 'every pair of unit types with the same event and faction'), ('b', 'the faction variants of one unit / building and event'), ('c', 'the nine skills'), ('d', 'UI/global voices of one class and the cinematic voices')):
            ng = sum(1 for g in (vrep.get('groups') or []) if g['rule'] == rule); npair = sum(g['n'] * (g['n'] - 1) // 2 for g in (vrep.get('groups') or []) if g['rule'] == rule)
            bad = sorted([x for x in pairs if x['rule'] == rule], key=lambda x: x['d'])
            vacuous = ng == 0 and not pref   # a distinctness test over zero groups must not pass silently
            ok(not bad and not vacuous, f"check 4{rule}: {txt} are >= tau {cal['tau'] if cal else '?'} apart ({npair} pairs in {ng} groups)" + (f' - {len(bad)} TOO CLOSE: ' + show(bad, 6, lambda x: f"{x['a']} ~ {x['b']} ({x['d']:.2f})") if bad else '') + ('' if ng else ' - NO SUCH GROUP exists in this corpus: nothing was compared'))
        # report + spectrograms of whatever failed
        (OUT / 'audio_failures.json').write_text(json.dumps({'voices': vrep['fails'], 'duplicates': dups, 'defClones': dcl, 'pairs': pairs, 'cal': cal}, indent=1))
        failing = []
        for f in vrep['fails']:
            if f['id'] not in failing: failing.append(f['id'])
        for x in pairs:
            for k in ('a', 'b'):
                if x[k] not in failing: failing.append(x[k])
        if failing:
            sp = spectro(pg, failing[:10]); note(f'{len(failing)} voices flagged; failures in tests/out/audio/audio_failures.json, spectrograms of the first {len(sp)} in tests/out/audio/spectro/ (view them with the Read tool)')
        recs = pg.evaluate("()=>Array.from(ODP.store.values()).map(r=>({id:r.id,cls:r.cls,dur:r.dur,tail:r.tail,fallback:r.fallback,activeDb:r.lv&&+r.lv.activeDb.toFixed(2),peak:r.lv&&+r.lv.peak.toFixed(3),end:r.lv&&+r.lv.end.toFixed(3),hash:r.hashA}))")
        (OUT / 'audio_voices.json').write_text(json.dumps(recs, indent=0))

    # ---------------------------------------------------------------- 3. music (checks 5-8)
    crep = None
    if not ARGS.no_music:
        stats = pg.evaluate("()=>({renderers:__RTS.AUD.stats().renderers,cues:Object.entries(__RTS.MUSIC_CUES).map(([k,v])=>({id:k,loop:!!v.loop,len:v.len,sting:!!v.sting,faction:v.faction||null}))})")
        have_r = 'cue' in stats['renderers']
        ok(have_r, "a music module has registered the 'cue' offline renderer (registerRenderer('cue', ...), docs/AUDIO_SPEC.md §8.8)")
        if have_r:
            want = [s for s in ARGS.cue.split(',') if s]; cues = [c for c in stats['cues'] if not want or any(c['id'].startswith(w) for w in want)]
            pg.evaluate("()=>ODP.cues.clear()"); t1 = time.time(); undeclared = []; summary = []
            for c in cues:
                d = pg.evaluate("(id)=>ODP.declared(id)", c['id']) or {}
                if not d.get('tempo') and not c['sting']: undeclared.append(c['id'])
                full = ARGS.full and c['id'] in ('intro', 'finale')
                window = c['len'] if full else min(c['len'], 24)
                loop_len = (d.get('loopLen') or c['len']) if c['loop'] else None
                r = pg.evaluate("([id,o])=>ODP.runCue(id,o)", [c['id'], {'window': window, 'loop': c['loop'], 'loopLen': loop_len, 'sting': c['sting'], 'declared': d, 'len': c['len']}])
                summary.append(r)
            note(f'{len(cues)} cues rendered and analysed in {time.time()-t1:.0f} s (window min(len, 24) s{", intro/finale full length" if ARGS.full else ""}; loop seams on one loop + 0.6 s)')
            ok(not undeclared, 'the declared tempo / key / mode of every non-sting cue is reachable (__RTS.musicInfo(id))' + (f' - NOT reachable for {len(undeclared)}: {show(undeclared, 8)}' if undeclared else ''))
            crep = pg.evaluate("()=>ODP.evaluateCues()")
            byc = collections.defaultdict(list)
            for f in crep['fails']: byc[f['code']].append(f)
            def cchk(num, codes, text):
                l = [f for c in codes for f in byc[c]]
                ok(not l, f'check {num}: {text} ({len(cues)} cues)' + (f' - FAIL: ' + show(l, 6, lambda f: f"{f['id']}: {f['msg']}") if l else ''))
            cchk('5a', ['render', 'impure'], 'every cue renders offline'); cchk('5b', ['finite', 'peak', 'silent'], 'non-silent, finite, peak <= 0.98'); cchk('5c', ['loudness'], 'programme loudness -26..-14 dBFS')
            cchk('5d', ['crest'], 'crest factor 6..26 dB'); cchk('5e', ['deadair'], 'no dead air longer than 1.5 s'); cchk('5f', ['dc'], '|DC| < 0.01')
            cchk('6a', ['tempo'], 'tempo within +-3 % of the declared tempo (or a clean 2x / 0.5x)')
            kp = crep['keyPop']
            ok(kp['pass'], f"check 6b: key = declared tonic for {kp['ok']}/{kp['n']} cues ({kp['rate']*100:.0f} %, need >= 80 %) and every miss is declared modal/atonal" + ('' if kp['pass'] else f" - misses: {show(kp['bad'], 8)}; misses declared major/minor: {show(kp['undeclared'], 8)}"))
            th = crep.get('themes')
            if th: ok(not th['bad'], 'check 6c: the faction themes are pairwise distinct on chroma + centroid + onset density (distances ' + ', '.join(f"{d['a'][6:]}~{d['b'][6:]} {d['d']:.1f}" for d in th['ds']) + ')' + (f" - TOO CLOSE: {show(th['bad'], 3, lambda x: x['a']+'~'+x['b'])}" if th['bad'] else ''))
            else: ok(False, 'check 6c: the three theme_* cues rendered, so their distinctness can be measured')
            cchk('7', ['seam', 'click'], 'loop seam: step < 6 dB and no click for every loop:true cue'); cchk('8', ['determinism'], 'two renders of a cue hash identically')
            (OUT / 'audio_cues.json').write_text(json.dumps({'table': crep['table'], 'fails': crep['fails'], 'keyPop': kp, 'themes': th}, indent=1))
            if crep['fails']: note('failures: tests/out/audio/audio_cues.json')
            for r in crep['table'][:40]:
                print(f"      {r['id']:<16}{'loop' if r['loop'] else 'once' if not r['sting'] else 'sting'}  rms {r['rms']:>6} dB  crest {r['crest']:>5}  tempo {r['bpm']:>6} (decl {r['declTempo']})  key {r['key']:<4}(decl {r['declKey']} {r['mode']})  dead {r['deadAir']} s  seam {r['seam']}  onsets/s {r['density']}", flush=True)

    # ---------------------------------------------------------------- 4. controls through the real pipeline (fresh page: nothing registered by the game is touched)
    cp = new_page(b, URL, track=False)
    cv = cp.evaluate("()=>ODP.controlVoices()")
    for c in cv['voices']:
        good = all(e in c['got'] for e in c['expect']) and (bool(c['expect']) or not c['got'])
        ok(good, f"control voice {c['id']} " + (f"is rejected as {c['expect']} (got {c['got']})" if c['expect'] else f"passes cleanly (got {c['got'] or 'no failures'}, {c['lv']})"))
    ds = cv['distinct']
    ok(ds['cloneRejected'] and ds['differentAccepted'], f"control: a duplicated voice (distance {ds['dClone']:.2f}) is rejected as indistinct, two different voices (distance {ds['dDiff']:.2f}) are accepted")
    ok(cv['defCloneCaught'], 'control: two ids registered with the SAME definition are reported as copy-paste clones (and the two different voices are not)')
    cc = cp.evaluate("()=>ODP.controlCues()")
    for c in cc:
        if c['keyMismatch']: ok(c['keyMatch'] is False, f"control cue {c['id']}: music in the wrong key is measured as {c['key']} vs declared D -> key mismatch " + ('caught' if c['keyMatch'] is False else 'NOT caught'))
        else: ok(all(e in c['got'] for e in c['expect']) and (bool(c['expect']) or not c['got']), f"control cue {c['id']} " + (f"is rejected as {c['expect']} (got {c['got']})" if c['expect'] else f"passes cleanly (got {c['got'] or 'no failures'}; tempo {c['bpm']}, key {c['key']}, seam {c['seam']} dB)"))
    cp.close()

    # ---------------------------------------------------------------- 5. broken builds must be flagged by the same pipeline
    html = None
    if URL.startswith('file:'): html = pathlib.Path(unquote(urlparse(URL).path)).read_text(encoding='utf-8')
    else:
        try: html = urllib.request.urlopen(URL, timeout=10).read().decode('utf-8')
        except Exception as e: note('cannot fetch the page for the build mutations: %s' % e)
    if html is not None and not ARGS.quick:
        base = new_page(b, URL, track=False); bp = base.evaluate("()=>ODP.mutationProbe()"); base.close()
        ok(not bp['codes'] and bp['weakPairs'] == 0 and bp['duplicateHashes'] == 0, f"probe of {bp['n']} voices on the real build is clean (the mutations below are measured against this) {bp['codes'] or ''}")
        VG = "A.vg=v.gain*p.vol;p.t0=0;A.t0=0;"
        MUT = [
            ('every voice silent', VG, "A.vg=0;p.t0=0;A.t0=0;", lambda r: r['codes'].get('silent', 0) == r['n']),
            ('every voice +9.5 dB too loud', VG, "A.vg=v.gain*p.vol*3;p.t0=0;A.t0=0;", lambda r: r['codes'].get('level', 0) >= 0.8 * r['n']),
            ('renders depend on a render counter', "A.s=(v.h^Math.imul(seed+1,0x9E3779B1))|0;", "A.s=(v.h^Math.imul(seed+1+(globalThis.__mc=(globalThis.__mc|0)+1),0x9E3779B1))|0;", lambda r: r['codes'].get('determinism', 0) >= 0.5 * r['n']),
            ('noise start offset uses Math.random', "go(A,s,t0,end+0.02,A.rng()*(NN/x.sampleRate-0.1));", "go(A,s,t0,end+0.02,Math.random()*(NN/x.sampleRate-0.1));", lambda r: r['codes'].get('impure', 0) >= 1),
            ('every id renders the same sound', "else{const who=spec.type||spec.faction?{type:spec.type,faction:spec.faction}:null;v=resolve(spec.sfx,who);}", "else{v=resolve('global.click',null);}", lambda r: r['duplicateHashes'] >= 1 and r['weakPairs'] == r['pairs']),
        ]
        tmp = tempfile.mkdtemp(prefix='od_audio_gate_mut_')
        for name, old, new, pred in MUT:
            n = html.count(old)
            if n != 1: ok(False, f'mutation "{name}": snippet occurs {n} times in the build (expected 1) - the mutation no longer targets real code'); continue
            f = pathlib.Path(tmp) / 'mut.html'; f.write_text(html.replace(old, new), encoding='utf-8')
            mp = new_page(b, f.as_uri(), track=False)
            try: r = mp.evaluate("()=>ODP.mutationProbe()"); good = pred(r)
            except Exception as e: r = {'error': str(e)[:120]}; good = False
            mp.close()
            ok(good, f'MUTATION "{name}" is caught by the corpus pipeline: ' + (json.dumps(r)[:220] if good else 'NOT CAUGHT ' + json.dumps(r)[:200]))
    b.close()

ok(not reqs, f'zero network requests {reqs[:3]}')
ok(not errs, f'zero page errors / console errors / warnings {errs[:3]}')
print(f'{"FAILED" if fails else "ALL OK"} ({time.time()-T0:.0f} s, {len(fails)} failures)')
sys.exit(1 if fails else 0)
