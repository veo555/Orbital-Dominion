"""Robustness gate, part 2: audio can never break gameplay.
   python3 tests/e2e/e2e_robust_audio.py          (about 2 minutes; OD_URL=file://... points the REAL checks at a scratch build)

The game is booted with Web Audio missing (no AudioContext at all), with an AudioContext constructor that throws, with a real context whose every node factory throws,
and with a context that works for a while and then starts throwing.  In every case: a full match plays (Autopilot, 3x speed, hundreds of sfx() calls from inside step()),
the mute toggle, the volume sliders and the music API are exercised, and the page must show ZERO uncaught errors, the recovery breaker must stay untouched (no audio
error may reach the frame guard), and the simulation must keep advancing.  Then the audio entry-point wrappers (80_audio.js / 82_music.js) are patched out in a
MUTANT build and the same scenario must fail.
"""
import os, sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from playwright.sync_api import sync_playwright
from robust_lib import *

R = Rec()

NODE_FACTORIES = "['createGain','createOscillator','createBufferSource','createBiquadFilter','createDynamicsCompressor','createWaveShaper','createStereoPanner','createConvolver','createDelay','createAnalyser','createBuffer','createChannelMerger','createChannelSplitter','createPeriodicWave','createConstantSource']"
SCENARIOS = {
    'no AudioContext at all': "delete window.AudioContext;delete window.webkitAudioContext;window.AudioContext=undefined;window.webkitAudioContext=undefined;",
    'AudioContext constructor throws': "window.AudioContext=function(){throw new Error('no audio device')};window.webkitAudioContext=window.AudioContext;",
    'every node factory throws': f"(()=>{{const A=window.AudioContext;for(const m of {NODE_FACTORIES})if(A.prototype[m])A.prototype[m]=function(){{throw new DOMException('node failure','InvalidStateError')}};}})();",
    'context dies after 400 node creations': f"(()=>{{const A=window.AudioContext;let n=0;for(const m of {NODE_FACTORIES}){{const f=A.prototype[m];if(f)A.prototype[m]=function(){{if(++n>400)throw new DOMException('device lost','InvalidStateError');return f.apply(this,arguments)}};}}A.prototype.resume=function(){{return Promise.reject(new Error('blocked'))}};}})();",
}


def scenario(b, url, name, init):
    errs = {}
    ctx, pg, e = open_page(b, url, init=init, errs=errs)
    start_match(pg, 700)
    pg.mouse.click(600, 400)                      # a user gesture: this is what calls audioInit()
    pg.evaluate("()=>{__RTS.ovPreset('autopilot');__RTS.G.speed=3;}")
    t0 = tick(pg)
    pg.wait_for_timeout(4500)
    api = pg.evaluate("""()=>{const o={},A=__RTS.AUD;
      const t=(k,f)=>{try{o[k]=f();}catch(e){o[k]='THREW '+e.message;}};
      t('mute1',()=>A.mute());t('mute2',()=>A.mute());
      t('music',()=>{__RTS.musicPlay('battle');__RTS.musicScene({intensity:0.9,night:0.5});__RTS.musicMood('tension');__RTS.musicStinger('sting_era');__RTS.musicDuck(0.5,300);__RTS.musicStop(0.1);return 'ok';});
      t('sfx',()=>{for(let i=0;i<50;i++){__RTS.sfxUnit('rifleman','fire',500,500,'meridian');__RTS.sfxBuilding('hub','done',500,500,'meridian');}return 'ok';});
      t('play',()=>{A.play('global.click');return 'ok';});
      for(const id of ['setMusic','setSfx']){const el=document.getElementById(id);if(el){el.value=33;el.dispatchEvent(new Event('input',{bubbles:true}));}}
      o.errors=A.stats().counters.errors;o.state=A.stats().state;o.last=A.lastError;o.guard=__RTS.guard.state.log.length;o.tripped=__RTS.guard.state.tripped;o.dialog=!!document.getElementById('guardDlg');
      o.tick=__RTS.G.tick;return o;}""")
    adv = api['tick'] - t0
    bad_calls = [k for k in ('mute1', 'mute2', 'music', 'sfx', 'play') if isinstance(api[k], str) and api[k].startswith('THREW')]
    good = (not e['page'] and not e['console'] and api['guard'] == 0 and not api['tripped'] and not api['dialog'] and adv >= 150 and not bad_calls)
    msg = f"ticks {adv}, page errors {e['page'][:2]}, console errors {e['console'][:2]}, guard log {api['guard']}, audio errors swallowed {api['errors']} ({str(api['last'])[:50]}), state {api['state']}, throwing calls {bad_calls}"
    ctx.close()
    return good, msg, api


with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
    swallowed = {}
    for name, init in SCENARIOS.items():
        try: good, msg, api = scenario(b, URL, name, init)
        except Exception as ex: good, msg, api = False, f'exception {type(ex).__name__}: {str(ex)[:200]}', {}
        R.ok(good, f'{name}: {msg}')
        swallowed[name] = api.get('errors', 0)
    R.ok(swallowed['every node factory throws'] > 0 or swallowed['context dies after 400 node creations'] > 0,
         f"the faults were really hit (audio errors counted: {swallowed}) - the scenarios are not vacuous")
    # MUTANT: the public audio entry points are not guarded any more -> the throwing context must break something
    unguard = [
        ("function audioInit(){try{AUDIO.init();}catch(e){audioFault(e);}}", "function audioInit(){AUDIO.init();}"),
        ("function sfx(name,x,y,who){try{return AUDIO.sfx(name,x,y,who);}catch(e){return audioFault(e);}}", "function sfx(name,x,y,who){return AUDIO.sfx(name,x,y,who);}"),
        ("function sfxUnit(type,ev,x,y,faction){try{return AUDIO.sfxUnit(type,ev,x,y,faction);}catch(e){return audioFault(e);}}", "function sfxUnit(type,ev,x,y,faction){return AUDIO.sfxUnit(type,ev,x,y,faction);}"),
        ("function sfxBuilding(type,ev,x,y,faction){try{return AUDIO.sfxBuilding(type,ev,x,y,faction);}catch(e){return audioFault(e);}}", "function sfxBuilding(type,ev,x,y,faction){return AUDIO.sfxBuilding(type,ev,x,y,faction);}"),
        ("    try{buildGraph();applyVolumes();}catch(e){AUD.lastError='graph: '+(e&&e.message||e);C.errors++;try{AC.close();}catch(_){}AC=null;S.buses=[];S.A=[];return;}", "    buildGraph();applyVolumes();"),
        ("function musicPlay(cue,opts){try{return MUSE.musicPlay(cue,opts);}catch(e){return audioFault(e);}}", "function musicPlay(cue,opts){return MUSE.musicPlay(cue,opts);}"),
        ("function musicScene(sc){try{return MUSE.musicScene(sc);}catch(e){return audioFault(e);}}", "function musicScene(sc){return MUSE.musicScene(sc);}"),
    ]
    murl = mutant_url(unguard)
    broken = []
    for name in ('every node factory throws', 'context dies after 400 node creations'):
        try: good, msg, api = scenario(b, murl, name, SCENARIOS[name])
        except Exception as ex: good, msg = False, f'exception {type(ex).__name__}'
        broken.append((name, good, msg[:170]))
    R.ok(any(not g for _, g, _ in broken), 'MUTANT (audio wrappers + graph try removed) is caught by at least one scenario (the late-failure one is also covered by the engine'"'"'s own per-voice try/catch): ' + ' | '.join(f"{n}: {'NOT caught' if g else 'fails as it must'} ({m})" for n, g, m in broken))
    b.close()
R.done('ROBUSTNESS (AUDIO)')
