"""Optional voice-pack loader gate (Playwright + Chromium). python3 tests/e2e/e2e_audio_voicepack.py  (OD_URL=file://... for a scratch build)
Builds a SYNTHETIC pack (tones, via tests/audio/voicepack_pipeline.make_pack: extract -> fake API -> pack, nothing is ever sent to ElevenLabs), loads it through the same file input the
Settings row uses, and checks: default off (no pack, synthesized voice, zero requests); verified load; a covered line plays the recording (voice bus, music ducked, real signal on the master
meter, same {dur,onEnd} contract); an uncovered/edited line falls back to the synthesized voice; MUTATIONS - one corrupted byte, a tampered manifest hash, an unsafe path and a bad
format each reject only their file; zip loading; removal; mute. Not tested: how a recording sounds, Safari/iOS Opus support."""
import os, sys, json, time, pathlib, shutil, hashlib, zipfile, importlib.util
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
URL = os.environ.get('OD_URL') or (ROOT / 'dist' / 'orbital_dominion_v3.html').as_uri()
spec = importlib.util.spec_from_file_location('vpp', ROOT / 'tests' / 'audio' / 'voicepack_pipeline.py')
vpp = importlib.util.module_from_spec(spec); spec.loader.exec_module(vpp)
fails = []; T0 = time.time()


def ok(c, m):
    print(('ok    ' if c else 'FAIL  ') + m, flush=True)
    if not c: fails.append(m)


WORK = ROOT / 'tests' / 'out' / 'voicepack_e2e'
shutil.rmtree(WORK, ignore_errors=True)
pack, chosen = vpp.make_pack(WORK, n_lines=4)
man = json.load(open(pack / 'manifest.json'))
files = [str(pack / 'manifest.json')] + sorted({str(pack / e['file']) for e in man['lines'].values()})
L0 = chosen[0]
dur0 = man['lines'][L0['id']]['duration']

with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])
    pg = b.new_page(viewport={'width': 1366, 'height': 800})
    errs = []; reqs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type in ('error',) else None)
    pg.on('request', lambda r: reqs.append(r.url[:80]) if not r.url.startswith(('file:', 'data:', 'blob:')) else None)
    pg.add_init_script("window.__TEST='lite'")
    pg.goto(URL); pg.wait_for_timeout(500)
    pg.mouse.click(40, 40); pg.evaluate("()=>__RTS.AUD.init()")
    for _ in range(40):
        if pg.evaluate("()=>__RTS.AUD.stats().state") == 'running': break
        pg.wait_for_timeout(100)
    ok(pg.evaluate("()=>__RTS.AUD.stats().state") == 'running', 'audio context is running')

    def speak(who, text, **kw):
        return pg.evaluate("([w,t])=>{const A=__RTS.AUD.voice;A.stop();return new Promise(res=>{const r=A.speak(w,t,{onEnd:e=>res({r,end:e})});setTimeout(()=>res({r,end:null,timeout:true}),12000);});}", [who, text])

    st = pg.evaluate("()=>__RTS.AUD.voice.pack.status()")
    ok(not st['loaded'], 'default: no voice pack loaded')
    r0 = pg.evaluate("([w,t])=>{const r=__RTS.AUD.voice.speak(w,t,{});__RTS.AUD.voice.stop();return r;}", [L0['speaker'], L0['text']])
    ok(not r0.get('pack') and r0['blips'], 'default: the line plays the synthesized voice (blips=%s, pack=%s)' % (r0['blips'], r0.get('pack')))
    ok(pg.evaluate("()=>!!document.getElementById('bVoicePack')&&!!document.getElementById('voicePackFile')&&document.getElementById('voicePackFile').closest('.row')!==null"), 'the Settings row (Load voice pack... + file input) exists')

    def load(paths):
        pg.evaluate("()=>{if(!document.getElementById('voicePackFile')){const i=document.createElement('input');i.type='file';i.id='voicePackFile';i.multiple=true;document.body.append(i);}}") if not pg.query_selector('#voicePackFile') else None
        # the Settings row's own input when present, else the API (same code path: voxPackFromFiles)
        if pg.query_selector('#voicePackFile'):
            pg.set_input_files('#voicePackFile', paths); pg.wait_for_timeout(100)
        for _ in range(60):
            s = pg.evaluate("()=>__RTS.AUD.voice.pack.status()")
            if s['accepted'] or s['rejected']: break
            pg.wait_for_timeout(100)
        pg.wait_for_timeout(300)
        return pg.evaluate("()=>__RTS.AUD.voice.pack.status()")

    has_row = bool(pg.query_selector('#voicePackFile'))
    print('note  Settings row input present at boot: %s' % has_row)
    if not has_row:
        # 'lite' boot does not run buildMenus/soundLabInit: add the picker the Settings row would create and drive the API directly
        pg.evaluate("""()=>{window.__vpLoad=async(files)=>{const A=__RTS.AUD.voice.pack;return A.fromFiles(files);};}""")
    # drive through the real picker when it exists, else through a DataTransfer-built FileList against the same function
    def load_files(paths):
        if has_row: return load(paths)
        blobs = []
        for pth in paths:
            blobs.append({'name': os.path.basename(pth), 'b64': __import__('base64').b64encode(open(pth, 'rb').read()).decode()})
        pg.evaluate("""async(bl)=>{const fs=bl.map(x=>{const u=Uint8Array.from(atob(x.b64),c=>c.charCodeAt(0));return new File([u],x.name);});await window.__vpLoad(fs);}""", blobs)
        return pg.evaluate("()=>__RTS.AUD.voice.pack.status()")

    s = load_files(files)
    ok(s['loaded'] and s['accepted'] == len(man['lines']) and s['rejected'] == 0, 'verified load: %d/%d ids accepted, %d rejected %s' % (s['accepted'], len(man['lines']), s['rejected'], s['reasons'][:2]))
    pg.evaluate("()=>__RTS.AUD.reset(true)")
    res = speak(L0['speaker'], L0['text'])
    r = res['r']
    ok(r.get('pack') is True and abs(r['dur'] - dur0) < 0.05, 'a covered line plays the recording: dur %.2f s == manifest %.2f s' % (r['dur'], dur0))
    ok(res['end'] and not res['end']['interrupted'] and res['end']['reason'] == 'end', 'onEnd fires at the end of the recording (same contract as the synthesized voice)')
    c = pg.evaluate("()=>__RTS.AUD.counters.packPlays")
    ok(c == 1, 'packPlays counter = 1')
    # during playback: signal on the master meter, speakLevel > 0, music ducked
    pg.evaluate("()=>{__RTS.AUD.voice.stop();}"); pg.wait_for_timeout(1500)
    probe = pg.evaluate("""([w,t])=>new Promise(res=>{const A=__RTS.AUD,V=A.voice;const r=V.speak(w,t,{});let pk=0,lv=0,duck=1;const t0=performance.now();
      const iv=setInterval(()=>{pk=Math.max(pk,A.meter().peak);lv=Math.max(lv,V.level());duck=Math.min(duck,A.stats().ducks.music);if(performance.now()-t0>1200){clearInterval(iv);V.stop();res({pk,lv,duck,r});}},30);})""", [L0['speaker'], L0['text']])
    ok(probe['pk'] > 0.005 and probe['lv'] > 0.1, 'the recording reaches the master (peak %.3f) and drives the lip-sync level (%.2f)' % (probe['pk'], probe['lv']))
    ok(probe['duck'] < 0.5, 'the music bus is ducked while the recording plays (gain %.2f)' % probe['duck'])
    # uncovered / edited line falls back
    pg.wait_for_timeout(1500)
    rf = pg.evaluate("([w,t])=>{const r=__RTS.AUD.voice.speak(w,t+' (edited)',{});__RTS.AUD.voice.stop();return r;}", [L0['speaker'], L0['text']])
    ok(not rf.get('pack') and rf['blips'], 'an edited line (text changed) is NOT matched and falls back to the synthesized voice')
    rf = pg.evaluate("()=>{const r=__RTS.AUD.voice.speak('brio','This line is not in the pack.',{});__RTS.AUD.voice.stop();return r;}")
    ok(not rf.get('pack') and rf['blips'], 'a line that is not in the pack falls back to the synthesized voice')
    # mute: no recording is started
    pg.evaluate("()=>{__RTS.AUD.mute();}")
    rm = pg.evaluate("([w,t])=>{const r=__RTS.AUD.voice.speak(w,t,{});__RTS.AUD.voice.stop();return r;}", [L0['speaker'], L0['text']])
    pg.evaluate("()=>{__RTS.AUD.mute();}")
    ok(not rm['blips'] and pg.evaluate("()=>__RTS.AUD.counters.packPlays") == 2, 'muted: the recording is not started (packPlays unchanged)')

    # ---- mutations
    tmp = WORK / 'mut'; shutil.rmtree(tmp, ignore_errors=True); tmp.mkdir()
    for f in files: shutil.copy(f, tmp / os.path.basename(f))
    victim = man['lines'][L0['id']]['file']; vname = tmp / os.path.basename(victim)
    data = bytearray(vname.read_bytes()); data[len(data) // 2] ^= 0x01; vname.write_bytes(bytes(data))
    s = load_files([str(tmp / os.path.basename(f)) for f in files])
    rej = [x for x in s['reasons'] if 'sha256 mismatch' in x]
    ok(s['rejected'] >= 1 and rej and s['accepted'] == len(man['lines']) - sum(1 for e in man['lines'].values() if e['file'] == victim), 'MUTATION corrupt one byte of %s: rejected (%s), the other files are still accepted (%d)' % (os.path.basename(victim), rej[:1], s['accepted']))
    rf = pg.evaluate("([w,t])=>{const r=__RTS.AUD.voice.speak(w,t,{});__RTS.AUD.voice.stop();return r;}", [L0['speaker'], L0['text']])
    ok(not rf.get('pack') and rf['blips'], 'the line of the corrupted file falls back to the synthesized voice')
    m2 = json.loads(json.dumps(man)); first = next(iter(m2['lines'])); m2['lines'][first]['sha256'] = '0' * 64
    (tmp / 'manifest.json').write_text(json.dumps(m2)); shutil.copy(files[1], tmp / os.path.basename(files[1]));
    for f in files[1:]: shutil.copy(f, tmp / os.path.basename(f))
    s = load_files([str(tmp / 'manifest.json')] + [str(tmp / os.path.basename(f)) for f in files[1:]])
    ok(s['rejected'] >= 1 and any('sha256 mismatch' in x for x in s['reasons']), 'MUTATION tampered manifest hash: rejected')
    m3 = json.loads(json.dumps(man)); m3['lines'][first]['file'] = '../../etc/passwd'
    (tmp / 'manifest.json').write_text(json.dumps(m3))
    s = load_files([str(tmp / 'manifest.json')] + [str(tmp / os.path.basename(f)) for f in files[1:]])
    ok(any('unsafe path' in x for x in s['reasons']), 'MUTATION path traversal in the manifest: rejected as an unsafe path')
    m4 = json.loads(json.dumps(man)); m4['format'] = 2
    (tmp / 'manifest.json').write_text(json.dumps(m4))
    s = load_files([str(tmp / 'manifest.json')] + [str(tmp / os.path.basename(f)) for f in files[1:]])
    ok(s['accepted'] == 0 and not s['loaded'], 'MUTATION unsupported manifest format: nothing is loaded')
    # zip + clean reload
    s = load_files([str(pack / 'voicepack.zip')])
    ok(s['loaded'] and s['accepted'] == len(man['lines']) and s['rejected'] == 0 and s['source'] == 'zip', 'a voicepack.zip loads (stored entries): %d accepted' % s['accepted'])
    pg.wait_for_timeout(1500)
    rz = pg.evaluate("([w,t])=>{const r=__RTS.AUD.voice.speak(w,t,{});__RTS.AUD.voice.stop();return r;}", [L0['speaker'], L0['text']])
    ok(rz.get('pack') is True, 'a line from the zip pack plays the recording')
    pg.evaluate("()=>__RTS.AUD.voice.pack.clear()")
    rc = pg.evaluate("([w,t])=>{const r=__RTS.AUD.voice.speak(w,t,{});__RTS.AUD.voice.stop();return r;}", [L0['speaker'], L0['text']])
    ok(not rc.get('pack') and rc['blips'] and not pg.evaluate("()=>__RTS.AUD.voice.pack.status().loaded"), 'removing the pack restores the synthesized voice')
    # sha-256 implementation against hashlib
    h = pg.evaluate("async()=>{const A=__RTS.AUD.voice.pack,o=[];for(const n of [0,1,55,56,63,64,65,1000]){const u=new Uint8Array(n);for(let i=0;i<n;i++)u[i]=(i*37+11)&255;o.push(A.sha256(u));}return o;}")
    exp = [hashlib.sha256(bytes(((i * 37 + 11) & 255) for i in range(n))).hexdigest() for n in (0, 1, 55, 56, 63, 64, 65, 1000)]
    ok(h == exp, 'the in-page SHA-256 equals hashlib on 8 lengths around the block boundaries')
    ok(not reqs, 'zero network requests %s' % reqs[:3])
    ok(not errs, 'zero page errors / console errors %s' % errs[:3])
    b.close()
print(('FAILED (%d s, %d failures)' % (time.time() - T0, len(fails))) if fails else 'ALL OK (%d s, 0 failures)' % (time.time() - T0))
sys.exit(1 if fails else 0)
