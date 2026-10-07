"""Cinematic gate (Playwright + Chromium). Exit code != 0 on failure.
   python3 tests/e2e/e2e_cine.py          (about 1 minute; OD_URL=file://... points it at a scratch build)

FIRST SKELETON — the engine owner wrote the checks below; the art agents / WF5 extend it. It asserts on data and pixels, never on "looks nice":
  painters      every vocabulary id has a painter; every CINE_BG / CINE_PROPS variant / CINE_FX / actor renders without throwing and produces non-uniform pixels.
                MUTATION CONTROL (CLAUDE.md rule 15): the same checker is run against deliberately blanked painters and MUST report them (a gate that cannot fail is worthless).
  pure frames   cineFrame(id,t) twice => identical pixel hash, also after the baked-background caches are dropped; different times => different pixels
  reduced motion  no shake, flashes / wipes / glitches become fades
  layout        letterbox 2.39:1 window, portrait 16:9 window centred vertically
  player        1280x720 desktop, 844x390 landscape phone, 390x844 portrait phone (touch): overlay visible, subtitle text matches the data, Skip button >= 44 px, skip by
                click / Esc / Space / Enter (+ double-tap and long-press on touch), match paused during the film and restored after, the game's hotkeys are inert while it plays,
                replay works, visibilitychange pauses the film clock, a second cinePlay replaces the first (onEnd 'replaced'), unknown ids end gracefully
  export        cineExport at 320x180 / 2 s returns a non-empty video/webm Blob (skipped with a notice when MediaRecorder is unavailable) and leaves nothing running
  hygiene       zero page errors, zero console errors, zero network requests
Limits: Chromium software raster; audio is not exercised (the audio engine is guarded by typeof and may be a stub); no real phone, no WebKit."""
import os, sys, pathlib
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.dont_write_bytecode = True   # importing tools/cine_contact.py must not leave __pycache__ in the repo
sys.path.insert(0, str(ROOT / 'tools'))
from cine_contact import load_fixture
URL = os.environ.get('OD_URL') or (ROOT / 'dist' / 'orbital_dominion_v3.html').as_uri()
fails = []; errs = []; reqs = []
def ok(c, m):
    print(('ok    ' if c else 'FAIL  ') + m, flush=True)
    if not c: fails.append(m)
def note(m): print('note  ' + m, flush=True)

MIN, SHOW = load_fixture('min'), load_fixture('showcase')

def open_page(b, w, h, dpr=1, mobile=False):
    ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=dpr, is_mobile=mobile, has_touch=mobile)
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append(('pageerror', str(e))))
    pg.on('console', lambda m: errs.append((m.type, m.text)) if m.type in ('error',) else None)
    pg.on('request', lambda r: reqs.append(r.url[:80]) if not r.url.startswith(('file:', 'data:', 'blob:')) else None)
    pg.add_init_script("window.__TEST='live'")
    pg.goto(URL); pg.wait_for_function("()=>!!(window.__RTS&&window.__RTS.cineFrame&&window.__RTS.CINE_PAINT)", timeout=15000)
    for fx in (MIN, SHOW):
        pg.evaluate("(d)=>{Object.assign(__RTS.STORY.characters,d.characters);Object.assign(__RTS.STORY.cine,d.cine);}", fx)
    return ctx, pg

# ------------------------------------------------------------------ page-side helpers (checkers are shared by the real run and the mutation run)
HELPERS = """
window.__H = (()=>{
  const R=__RTS, P=R.CINE_PAINT, W=320, H=134, cv=document.createElement('canvas'); cv.width=W; cv.height=H;
  const film=(scene)=>({id:'t',kind:'interlude',title:'t',music:'intro',letterbox:true,seed:5,scenes:[Object.assign({id:'s',dur:3,bg:{k:'void',tint:'#18305a',glow:.5},cam:{from:{x:.5,y:.5,z:1,r:0},to:{x:.5,y:.5,z:1,r:0},ease:'lin'},actors:[],props:[],fx:[],lines:[],sfx:[],trans:{in:'cut',out:'cut',len:.3}},scene)]});
  const px=(f,t)=>{R.cineFrame(f,t,cv,{frameOnly:true,tier:'high',noTrans:true,grain:false,bloom:false});return cv.getContext('2d').getImageData(0,0,W,H).data;};
  const diff=(a,b)=>{let n=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>12)n++;return n;};
  const spread=(d)=>{const q=new Set();let m=0,m2=0,n=d.length/4;for(let i=0;i<d.length;i+=4){q.add((d[i]>>4)|((d[i+1]>>4)<<4)|((d[i+2]>>4)<<8));const l=.3*d[i]+.59*d[i+1]+.11*d[i+2];m+=l;m2+=l*l;}m/=n;return{colours:q.size,sd:Math.sqrt(Math.max(0,m2/n-m*m))};};
  const hash=(f,t,o)=>{R.cineFrame(f,t,cv,Object.assign({frameOnly:true,tier:'high'},o||{}));const d=cv.getContext('2d').getImageData(0,0,W,H).data;let h=0x811c9dc5;for(let i=0;i<d.length;i++){h^=d[i];h=Math.imul(h,16777619);}return h>>>0;};
  /* every check returns an array of problem strings */
  const checkBg=()=>{const bad=[];for(const k of Object.keys(R.CINE_BG)){try{const s=spread(px(film({bg:{k}}),1));if(s.colours<24||s.sd<3)bad.push('bg:'+k+' is uniform ('+s.colours+' colours, sd '+s.sd.toFixed(1)+')');}catch(e){bad.push('bg:'+k+' threw '+e.message);}}return bad;};
  const variants=()=>{const v=[],C=R.CINE_PROPS;for(const k of Object.keys(C)){const spec=C[k],keys=Object.keys(spec).filter(x=>Array.isArray(spec[x]));if(!keys.length)v.push({k});else for(const key of keys)for(const val of spec[key])v.push({k,[key]:val});}return v;};
  const checkProps=()=>{const bad=[],base=px(film({}),1);for(const p of variants()){try{const n=diff(px(film({props:[Object.assign({at:[.5,.55],scale:1.3},p)]}),1),base);if(n<60)bad.push('prop '+JSON.stringify(p)+' draws nothing ('+n+' px)');}catch(e){bad.push('prop '+JSON.stringify(p)+' threw '+e.message);}}return bad;};
  const checkFx=()=>{const bad=[],mk=(fx)=>film({bg:{k:'bridge',faction:'meridian',alert:false,view:'space'},fx});   // no actor in this scene: a real portrait rim-lights itself from the live point lights of flare/explosion/lightning/beam/pulse, which would make a BLANKED painter of those fx look as if it still changed the frame
    for(const k of R.CINE_FX){try{let best=0;for(let t=.15;t<2.9;t+=.15){best=Math.max(best,diff(px(mk([{k,t0:0,t1:3,a:1,x:.6,y:.4,to:[.9,.8]}]),t),px(mk([]),t)));}if(best<8)bad.push('fx:'+k+' changes nothing ('+best+' px)');}catch(e){bad.push('fx:'+k+' threw '+e.message);}}return bad;};
  const checkActor=()=>{const bad=[];try{const bg={k:'bridge',faction:'meridian',alert:false,view:'space'};   // fixed faction: an actor alone would otherwise change the colour grade of the whole frame
      const n=diff(px(film({bg,actors:[{id:'a',char:'idris',at:[.5,.6],h:.8,expr:'neutral',mode:'bust'}]}),1),px(film({bg}),1));if(n<200)bad.push('actor draws nothing ('+n+' px)');}catch(e){bad.push('actor threw '+e.message);}return bad;};
  return{R,P,cv,film,px,diff,spread,hash,checkBg,checkProps,checkFx,checkActor,variants};
})();
"""

def painters(pg):
    print('--- painters', flush=True)
    pg.evaluate(HELPERS)
    ok(pg.evaluate("()=>__RTS.cineCoverage()") == [], 'every vocabulary id (bg, prop, fx, transition, actor, grade) has a painter')
    for name, fn in (('backgrounds', 'checkBg'), ('props (every kind and variant)', 'checkProps'), ('fx', 'checkFx'), ('actor', 'checkActor')):
        bad = pg.evaluate(f"()=>__H.{fn}()")
        ok(bad == [], f'{name}: every entry renders and produces non-uniform pixels' + (' — ' + '; '.join(bad[:4]) if bad else ''))
    und = pg.evaluate("()=>Object.keys(__RTS.CINE_BG).filter(k=>typeof __RTS.CINE_PAINT.bg[k].static!=='boolean')")
    ok(und == [], f'every background painter declares fn.static = true (baked once per scene) or false (animated every frame) {und}')
    slow = pg.evaluate("""()=>{const H=__H,R=__RTS,out=[];const cv=document.createElement('canvas');cv.width=1280;cv.height=536;
      for(const k of Object.keys(R.CINE_BG)){R.CNE.bgc.clear();const t0=performance.now();R.cineFrame(H.film({bg:{k}}),1,cv,{frameOnly:true,tier:'high'});const ms=performance.now()-t0;if(ms>200)out.push(k+' '+ms.toFixed(0)+' ms');}return out;}""")
    if slow: note('backgrounds whose first frame (bake) takes > 200 ms at 1280x536 in this software-raster browser (budget in docs/CINEMATIC_SPEC.md section 5.9): ' + ', '.join(slow))
    st = pg.evaluate("()=>__RTS.cineStats()")
    ok(st['errors'] == [], f'no painter exception was swallowed by the engine {st["errors"][:2]}')
    ph = st['placeholders']
    note(f"placeholders still registered: bg {len(ph['bg'])}/12, prop {len(ph['prop'])}/12, fx {len(ph['fx'])}/19, actor {ph['actor']}  (the art agents replace them)")
    # soft check: variants of one prop kind should look different (placeholders may not)
    dup = pg.evaluate("""()=>{const H=__H,out=[];const seen={};for(const p of H.variants()){const k=p.k;const h=H.hash(H.film({props:[Object.assign({at:[.5,.55],scale:1.3},p)]}),1,{noTrans:true,grain:false,bloom:false});(seen[k]=seen[k]||{})[h]=(seen[k][h]||[]).concat([JSON.stringify(p)]);}
      for(const k in seen)for(const h in seen[k])if(seen[k][h].length>1)out.push(k+': '+seen[k][h].length+' identical');return out;}""")
    if dup: note('prop variants that still render identically (placeholders): ' + '; '.join(dup[:8]))
    # ---------------- mutation control: blank painters MUST be caught
    print('--- mutation controls (blanked painters must be reported)', flush=True)
    for reg, key, fn, label in (('bg', 'space', 'checkBg', 'background'), ('prop', 'ship', 'checkProps', 'prop'), ('fx', 'beam', 'checkFx', 'fx'), ('actor', None, 'checkActor', 'actor')):
        bad = pg.evaluate(f"""()=>{{const P=__H.P,reg='{reg}',key={'null' if key is None else repr(key)};let orig;
          if(key){{orig=P[reg][key];P[reg][key]=function(){{}};}}else{{orig=P.actor;P.actor=function(){{}};}}
          try{{return __H.{fn}();}}finally{{if(key)P[reg][key]=orig;else P.actor=orig;}}}}""")
        ok(len(bad) > 0, f'mutation: a blanked {label} painter is detected by the checker ({len(bad)} problem(s))')
    ok(pg.evaluate("()=>__H.checkBg().length+__H.checkProps().length+__H.checkFx().length+__H.checkActor().length") == 0, 'painters restored after the mutation runs')

def pure_frames(pg):
    print('--- pure frames', flush=True)
    r = pg.evaluate("""()=>{const H=__H,R=__RTS,out={};
      const cases=[['showcase_all',3.1],['showcase_all',17.3],['showcase_trans',2.75],['showcase_trans',4.45],['showcase_trans',7.55],['showcase_cam',5.1],['showcase_fx_explosion',1.3],['showcase_title',1.2],['showcase_subs',9.5],['intro',.2],['intro',30.4]];
      out.a=cases.map(([id,t])=>H.hash(id,t));out.b=cases.map(([id,t])=>H.hash(id,t));
      R.CNE.bgc.clear();R.CNE.endc.clear();out.c=cases.map(([id,t])=>H.hash(id,t));    // after dropping every cache
      out.d=[H.hash('showcase_all',3.1),H.hash('showcase_all',3.2),H.hash('showcase_all',9.9)];
      out.sub=H.hash('showcase_subs',3.0,{subs:true})!==H.hash('showcase_subs',3.0,{subs:false});
      return out;}""")
    ok(r['a'] == r['b'], 'cineFrame(id,t) twice => identical pixel hash (11 frames incl. transitions, fx, title)')
    ok(r['a'] == r['c'], 'identical again after every baked-background / end-frame cache was dropped (frames carry no hidden state)')
    ok(len(set(r['d'])) == 3, 'different times give different pixels')
    ok(r['sub'], 'opts.subs burns the subtitle into the frame')
    # reduced motion
    r = pg.evaluate("""()=>{const H=__H,R=__RTS;R.SET.rm=true;
      const mk=(fx)=>({id:'x',kind:'interlude',title:'x',music:'intro',seed:3,scenes:[{id:'s',dur:3,bg:{k:'void',tint:'#18305a',glow:.5},cam:{from:{x:.4,y:.5,z:1,r:0},to:{x:.6,y:.5,z:1.3,r:.1},ease:'lin'},fx,trans:{in:'cut',out:'cut'}}]});
      const a=H.hash(mk([{k:'shake',t0:1,t1:2,a:1}]),1.4,{rm:true}),b=H.hash(mk([]),1.4,{rm:true});
      const a2=H.hash(mk([{k:'shake',t0:1,t1:2,a:1}]),1.4,{rm:false}),b2=H.hash(mk([]),1.4,{rm:false});
      const tr=['flash','wipe','glitch','iris','fade','cut'].map(k=>R.cnTrans({scenes:[{s:{trans:{in:k,out:k,len:.5}},dur:4},{s:{trans:{in:k,out:k,len:.5}},dur:4}]},1,true).in.k);
      R.SET.rm=false;return{shakeRm:a===b,shakeOn:a2!==b2,tr};}""")
    ok(r['shakeRm'], 'reduced motion: the shake fx changes nothing')
    ok(r['shakeOn'], 'normal motion: the shake fx moves the picture (the reduced-motion comparison is not vacuous)')
    ok(r['tr'] == ['fade', 'fade', 'fade', 'fade', 'fade', 'cut'], f'reduced motion: flash / wipe / glitch / iris become fades {r["tr"]}')

def transitions(pg):
    print('--- transitions (pixel semantics)', flush=True)
    r = pg.evaluate("""()=>{const H=__H,R=__RTS,out={};
      const mk=(tin,tout)=>({id:'tr',kind:'interlude',title:'t',music:'intro',seed:2,scenes:[
        {id:'a',dur:3,bg:{k:'void',tint:'#2a5a9a',glow:.9},trans:{in:'cut',out:'cut',len:.8}},
        {id:'b',dur:3,bg:{k:'void',tint:'#9a3a2a',glow:.9},trans:{in:tin,out:tout,len:.8}}]});
      const mean=(d)=>{let s=0;for(let i=0;i<d.length;i+=4)s+=d[i]+d[i+1]+d[i+2];return s/(d.length/3);};
      const px=(f,t)=>{R.cineFrame(f,t,H.cv,{frameOnly:true,tier:'high',grain:false,bloom:false});return H.cv.getContext('2d').getImageData(0,0,320,134).data;};
      for(const k of ['fade','flash','wipe','glitch','iris']){
        const f=mk(k,k);
        out[k]={inStart:mean(px(f,3.0)),inMid:mean(px(f,3.4)),inEnd:mean(px(f,3.9)),steady:mean(px(f,4.5)),outMid:mean(px(f,5.6)),outEnd:mean(px(f,6.0))};}
      const c=mk('cut','cut');out.cut={inStart:mean(px(c,3.0)),steady:mean(px(c,4.5)),outEnd:mean(px(c,6.0))};
      out.prev=mean(px(mk('cut','cut'),2.95));out.first=mean(px(mk('cut','cut'),0));                       // the first scene of a film fades in from black by default only when it declares no trans
      const d=mk('cut','cut');d.scenes[0].trans=undefined;out.firstDefault=mean(px(d,0));
      return out;}""")
    v = r['fade']; ok(v['inStart'] < v['steady'] * .1 and v['inEnd'] > v['steady'] * .9 and v['outEnd'] < v['steady'] * .1,
                      f"fade: comes from black, settles on the scene, leaves to black {{in {v['inStart']:.0f}->{v['inEnd']:.0f}, steady {v['steady']:.0f}, out end {v['outEnd']:.0f}}}")
    for k in ('iris', 'wipe'):   # these reveal the new scene over the previous scene's last frame (mean {prev}), and leave to black
        v = r[k]; ok(abs(v['inStart'] - r['prev']) < r['prev'] * .06 and abs(v['inEnd'] - v['steady']) < v['steady'] * .06 and v['outEnd'] < v['steady'] * .1,
                     f"{k}: starts on the previous scene's last frame ({v['inStart']:.0f} vs {r['prev']:.0f}), settles on the new scene, leaves to black {{out end {v['outEnd']:.0f}}}")
    v = r['flash']; ok(v['inStart'] > v['steady'] * 2 and v['inEnd'] <= v['steady'] * 1.15 and v['outEnd'] > v['steady'] * 2, f"flash: starts white, settles, leaves white {{{v['inStart']:.0f}, {v['steady']:.0f}, {v['outEnd']:.0f}}}")
    v = r['glitch']; ok(abs(v['inEnd'] - v['steady']) < v['steady'] * .12 and v['outEnd'] < v['steady'] * .35, f"glitch: settles on the scene and leaves to black {{{v['inEnd']:.0f} vs {v['steady']:.0f}, out end {v['outEnd']:.0f}}}")
    v = r['cut']; ok(abs(v['inStart'] - v['steady']) < v['steady'] * .06 and abs(v['outEnd'] - v['steady']) < v['steady'] * .06, f"cut: no transition at all {{{v['inStart']:.0f}, {v['steady']:.0f}, {v['outEnd']:.0f}}}")
    ok(r['first'] > 5, 'the first scene keeps an explicit cut (starts on picture)')
    ok(r['firstDefault'] < 3, f"the first scene of a film with no trans data fades in from black ({r['firstDefault']:.1f})")

def layout(pg):
    print('--- layout', flush=True)
    r = pg.evaluate("()=>({ls:__RTS.cnWindow(1280,720,true),ph:__RTS.cnWindow(844,390,true),por:__RTS.cnWindow(390,844,true),nb:__RTS.cnWindow(1280,720,false),wide:__RTS.cnWindow(2600,720,true)})")
    ok(abs(r['ls']['w'] / r['ls']['h'] - 2.39) < .02 and r['ls']['w'] == 1280 and r['ls']['y'] > 0, f"landscape: 2.39:1 letterbox window across the full width {r['ls']}")
    ok(abs(r['ph']['w'] / r['ph']['h'] - 2.39) < .02, f"landscape phone: 2.39:1 window {r['ph']}")
    ok(r['por']['portrait'] and r['por']['w'] == 390 and abs(r['por']['h'] - 219) <= 1 and abs(r['por']['y'] - (844 - r['por']['h']) / 2) <= 1, f"portrait phone: full-width 16:9 window centred vertically {r['por']}")
    ok(abs(r['nb']['w'] / r['nb']['h'] - 16 / 9) < .02, f"no letterbox flag: viewport aspect {r['nb']}")
    ok(r['wide']['h'] == 720 and r['wide']['x'] > 0, 'ultra-wide: pillarboxed, never wider than 2.39:1')

# ------------------------------------------------------------------ player
PLAY = """({id,from})=>{window.__end=null;window.__ctl=__RTS.cinePlay(id,{from,onEnd:(i)=>{window.__end=i;}});return true;}"""
STATE = """()=>{const ov=document.getElementById('cineOverlay'),r=ov.getBoundingClientRect(),sk=document.getElementById('cineSkip').getBoundingClientRect(),cs=document.getElementById('cineSub');
  const cvr=document.getElementById('cine').getBoundingClientRect();
  return{active:__RTS.cineActive(),shown:!ov.classList.contains('hidden'),cover:[r.left,r.top,r.width,r.height],vp:[innerWidth,innerHeight],sub:cs.textContent,subRect:cs.getBoundingClientRect().toJSON(),
    skip:[sk.width,sk.height,document.getElementById('cineSkip').classList.contains('on')],skipRect:sk.toJSON(),paused:__RTS.G?__RTS.G.paused:null,gtime:__RTS.G?__RTS.G.time:null,end:window.__end,canvas:[document.getElementById('cine').width,document.getElementById('cine').height],
    hint:!document.getElementById('cineHint').classList.contains('hidden'),dom:document.activeElement&&document.activeElement.id}}"""

def first_line(pg, id):
    return pg.evaluate("""(id)=>{const c=__RTS.STORY.cine[id],tl=__RTS.cineTimeline(c);for(const e of tl.scenes)for(const l of e.s.lines||[])return{t:e.t0+l.t+.35,text:l.text,who:l.who,style:l.style||'normal'};return null;}""", id)

def player(b, name, w, h, dpr, mobile):
    print(f'--- player {name} {w}x{h} @{dpr}x{" touch" if mobile else ""}', flush=True)
    ctx, pg = open_page(b, w, h, dpr, mobile)
    if not mobile: pg.mouse.move(w // 2, h // 2)
    pg.evaluate("()=>{__RTS.startGame();for(let i=0;i<60;i++)__RTS.step();}"); pg.wait_for_timeout(200)
    before = pg.evaluate("()=>({t:__RTS.G.time,p:__RTS.G.paused})")
    ln = first_line(pg, 'intro'); ok(ln is not None, f'{name}: the intro has a spoken line to test ({ln["who"]}: "{ln["text"][:30]}…")')
    pg.evaluate(PLAY, {'id': 'intro', 'from': ln['t']}); pg.wait_for_timeout(500)
    s = pg.evaluate(STATE)
    ok(s['active'] and s['shown'], f'{name}: overlay visible and cineActive()')
    ok(s['cover'][2] >= w - 1 and s['cover'][3] >= h - 1, f'{name}: overlay covers the whole viewport {s["cover"]}')
    ok(s['paused'] is True, f'{name}: the match is paused while the film plays')
    g0 = s['gtime']; pg.wait_for_timeout(400); g1 = pg.evaluate(STATE)['gtime']
    ok(g0 == g1, f'{name}: the simulation does not advance while the film plays (G.time {g0:.3f} -> {g1:.3f} over 400 ms)')
    ok(ln['text'] in s['sub'], f'{name}: subtitle text matches the data ("{s["sub"][:60]}")')
    sr = s['subRect']; ok(sr['left'] >= 0 and sr['right'] <= w + 1 and sr['bottom'] <= h + 1 and sr['top'] >= 0, f'{name}: subtitle strip is inside the viewport')
    if w < h: ok(s['hint'], f'{name}: portrait shows the "rotate for the best view" hint')
    else: ok(not s['hint'], f'{name}: landscape shows no rotate hint')
    k = s['canvas'][0] / w
    ok(1 <= k <= 2.51, f'{name}: backing store is DPR-aware and capped ({s["canvas"]} for {w}x{h} css px -> x{k:.2f})')
    if not mobile: pg.mouse.move(w // 2 + 5, h // 2 + 5)
    else: pg.evaluate("()=>document.getElementById('cineOverlay').dispatchEvent(new PointerEvent('pointermove',{pointerType:'touch',bubbles:true}))")
    pg.wait_for_timeout(120); s = pg.evaluate(STATE)
    ok(s['skip'][2] and s['skip'][1] >= 44 and s['skip'][0] >= 44, f'{name}: Skip button appears on pointer move and is >= 44 px ({s["skip"][0]:.0f}x{s["skip"][1]:.0f})')
    # the game's hotkeys are inert: P / Escape-pause must not un-pause the match behind the film
    leak = []
    for key in ('p', 'h', 'm', 'Tab'):
        pg.keyboard.press(key); pg.wait_for_timeout(60)
        st = pg.evaluate("()=>({paused:__RTS.G.paused,menu:!document.getElementById('pauseMenu').classList.contains('hidden')||!document.getElementById('helpMenu').classList.contains('hidden'),panel:__RTS.ui.panel,active:__RTS.cineActive()})")
        if not st['active'] or st['paused'] is not True or st['menu'] or st['panel']: leak.append((key, st))
    ok(not leak, f'{name}: game hotkeys (P, H, M, Tab) reach neither the match nor its menus while the film plays {leak[:1]}')
    # skip #1: the button
    box = pg.evaluate("()=>{const r=document.getElementById('cineSkip').getBoundingClientRect();return[r.left+r.width/2,r.top+r.height/2]}")
    if mobile: pg.touchscreen.tap(box[0], box[1])
    else: pg.mouse.click(box[0], box[1])
    pg.wait_for_function("()=>window.__end!==null", timeout=3000); s = pg.evaluate(STATE)
    ok(s['end']['skipped'] and not s['active'] and not s['shown'], f'{name}: Skip button ends the film at once (reason {s["end"]["reason"]})')
    ok(s['paused'] == before['p'], f'{name}: match pause state restored after the film (paused={s["paused"]})')
    # skip #2..#4: keys (replay each time)
    for key in ('Escape', ' ', 'Enter'):
        pg.evaluate(PLAY, {'id': 'intro', 'from': 0}); pg.wait_for_timeout(250)
        ok(pg.evaluate("()=>__RTS.cineActive()"), f'{name}: replay starts')
        pg.keyboard.press(key); pg.wait_for_timeout(120)
        s = pg.evaluate(STATE); ok(s['end'] and s['end']['skipped'] and not s['active'] and not s['shown'], f'{name}: {key!r} skips (overlay gone, onEnd skipped)')
    if mobile:
        cx, cy = w // 2, h // 3
        pg.evaluate(PLAY, {'id': 'intro', 'from': 0}); pg.wait_for_timeout(250)
        pg.touchscreen.tap(cx, cy); pg.wait_for_timeout(80); pg.touchscreen.tap(cx, cy); pg.wait_for_timeout(150)
        s = pg.evaluate(STATE); ok(s['end'] and s['end']['skipped'], f'{name}: double-tap skips')
        pg.evaluate(PLAY, {'id': 'intro', 'from': 0}); pg.wait_for_timeout(250)
        cdp = ctx.new_cdp_session(pg)
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': cx, 'y': cy, 'id': 1}]}); pg.wait_for_timeout(950)
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); pg.wait_for_timeout(100)
        s = pg.evaluate(STATE); ok(s['end'] and s['end']['skipped'] and not s['active'], f'{name}: press-and-hold skips')
    ctx.close()

def clock_and_misc(b):
    print('--- clock, replace, unknown id, gallery', flush=True)
    ctx, pg = open_page(b, 1280, 720)
    pg.evaluate("()=>{window.__e1=null;window.__e2=null;window.__c1=__RTS.cinePlay('showcase_subs',{onEnd:i=>{window.__e1=i}});}"); pg.wait_for_timeout(400)
    t0 = pg.evaluate("()=>__c1.t()"); ok(t0 > 0, f'film clock runs ({t0:.2f} s)')
    pg.evaluate("()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));}"); pg.wait_for_timeout(120)
    t1 = pg.evaluate("()=>__c1.t()"); pg.wait_for_timeout(500); t2 = pg.evaluate("()=>__c1.t()")
    ok(abs(t2 - t1) < .02, f'hidden tab: the film clock is paused ({t1:.3f} -> {t2:.3f})')
    pg.evaluate("()=>{Object.defineProperty(document,'hidden',{value:false,configurable:true});document.dispatchEvent(new Event('visibilitychange'));}"); pg.wait_for_timeout(500)
    t3 = pg.evaluate("()=>__c1.t()"); ok(t3 > t2 + .2, f'visible again: the clock resumes without a jump ({t2:.3f} -> {t3:.3f})')
    pg.evaluate("()=>{__c1.pause()}"); pg.wait_for_timeout(100); a = pg.evaluate("()=>__c1.t()"); pg.wait_for_timeout(300)
    ok(abs(pg.evaluate("()=>__c1.t()") - a) < .02, 'api pause() holds the clock'); pg.evaluate("()=>__c1.resume()")
    pg.evaluate("()=>{window.__c2=__RTS.cinePlay('showcase_mini',{onEnd:i=>{window.__e2=i}});}"); pg.wait_for_timeout(150)
    ok(pg.evaluate("()=>window.__e1&&window.__e1.reason")=='replaced', 'starting a second film ends the first one (onEnd reason replaced)')
    pg.wait_for_function("()=>window.__e2!==null", timeout=6000)
    ok(pg.evaluate("()=>window.__e2.reason")=='done' and not pg.evaluate("()=>__RTS.cineActive()"), 'a film that is left alone ends by itself (reason done) and releases the overlay')
    ok(pg.evaluate("()=>document.getElementById('cineOverlay').classList.contains('hidden')"), 'overlay hidden after the film')
    pg.evaluate("()=>{window.__e3=null;__RTS.cinePlay('no_such_film',{onEnd:i=>{window.__e3=i}})}"); pg.wait_for_function("()=>window.__e3!==null", timeout=2000)
    ok(not pg.evaluate("()=>__RTS.cineActive()"), 'unknown film id: onEnd is called, nothing is left running')
    g = pg.evaluate("()=>__RTS.cineGallery().filter(x=>x.id==='intro'||x.id==='showcase_mini')")
    ok(len(g) == 2 and all(set(x) >= {'id', 'title', 'kind', 'len', 'seen'} for x in g) and next(x for x in g if x['id'] == 'showcase_mini')['seen'], f'cineGallery() rows have id/title/kind/len/seen and remember what was played {g[:1]}')
    ok(abs(pg.evaluate("()=>__RTS.cineDuration('showcase_mini')") - 2) < 1e-6, 'cineDuration sums the scenes')
    ctx.close()

def export(b):
    print('--- export', flush=True)
    ctx, pg = open_page(b, 1280, 720)
    sup = pg.evaluate("()=>typeof MediaRecorder!=='undefined'&&!!HTMLCanvasElement.prototype.captureStream&&MediaRecorder.isTypeSupported('video/webm')")
    if not sup: print('SKIP  export: this browser cannot record a canvas (MediaRecorder / captureStream / webm missing)'); ctx.close(); return
    r = pg.evaluate("""async()=>{const prog=[];const b=await __RTS.cineExport('showcase_mini',{w:320,h:180,fps:15,bitrate:4e5,onProgress:p=>prog.push(p)});
      return{size:b?b.size:0,type:b?b.type:null,prog:prog.length,last:prog[prog.length-1],active:__RTS.cineActive(),hidden:document.getElementById('cineOverlay').classList.contains('hidden')};}""")
    ok(r['size'] > 500 and r['type'].startswith('video/webm'), f'export: a non-empty video/webm Blob came back ({r["size"]} bytes, {r["type"]})')
    ok(r['prog'] > 1 and r['last'] == 1, f'export: progress callback reported {r["prog"]} steps ending at 1')
    ok(not r['active'] and r['hidden'], 'export: nothing is left running and the overlay was never left visible')
    ctx.close()

def main():
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
        ctx, pg = open_page(b, 1280, 720)
        painters(pg); pure_frames(pg); transitions(pg); layout(pg); ctx.close()
        player(b, 'desktop', 1280, 720, 1, False)
        player(b, 'phone-land', 844, 390, 3, True)
        player(b, 'phone-port', 390, 844, 3, True)
        clock_and_misc(b); export(b)
        b.close()
    print('--- hygiene', flush=True)
    ok(not errs, f'zero page errors / console errors {errs[:3]}')
    ok(not reqs, f'zero network requests {reqs[:3]}')
    print('\nCINE GATE ' + ('FAILED: ' + '; '.join(fails[:8]) if fails else 'PASSED'))
    sys.exit(1 if fails else 0)

if __name__ == '__main__':
    main()
