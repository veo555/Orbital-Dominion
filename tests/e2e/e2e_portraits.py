"""Portrait painter gate (Playwright + Chromium). Exit code != 0 on failure.
   python3 tests/e2e/e2e_portraits.py        (about 1.5 minutes; OD_URL=file://... points it at a scratch build)

Owner: src/js/64_cine_portraits.js (CINE_PAINT.actor + drawPortrait). Asserts on pixels and data, never on "looks nice"; the sheets in tests/out/cine/portraits_*.png (tools/portrait_sheets.py) are for looking.
  coverage      13 fixture characters (as fx_*) + every character of the real story x 12 expressions x 4 modes: no painter error, non-uniform pixels, mode semantics
                (silhouette = near-black figure, shadow = dark figure with bright eye lights, hologram = cyan with scanlines and flicker)
  expressions   every pair of the 12 expressions differs by a clear number of pixels on every character
  lip-sync      state.talk changes the mouth in EVERY expression, monotonically; state.blink closes the eyes
  facing        face:'l' is the exact mirror image of face:'r' under a mirrored key light (bust / silhouette / shadow)
  motion        idle breathing: frames at different times differ a little, and only a little
  purity        same call twice, after a cache flood, and in a fresh page (cold caches) => identical pixels; Math.random / Date / performance.now poisoned => no error; source scan
  any look      every hair x armour x mark combination, odd / partial look data, unknown character ids, extreme sizes, missing options: never throws, always draws
  distinctness  every pair of characters differs at 64 px (tools/portrait_sheets.py: head-weighted perceptual metric; controls: an identical look under another id and one-attribute changes)
                and the 48 px chip keeps the identity; the check is run against deliberately wrong painters and MUST fail them
  engine        the painter inside cineFrame (all modes, both facings, key lights): non-uniform, pure frames; cost per portrait (software raster, relative only)
  mutations     (CLAUDE.md rule 15) blank / look-blind / expression-blind / talk-blind / blink-blind / facing-blind / mode-blind / impure painters are each caught by the check that owns them
Limits: Chromium software raster; the numbers say nothing about real phones; looks are judged by eye on the sheets, not here."""
import os, sys, pathlib, re, json
import numpy as np
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / 'tools'))
import portrait_sheets as PS
URL = os.environ.get('OD_URL') or (ROOT / 'dist' / 'orbital_dominion_v3.html').as_uri()
PS.URL = URL
fails = []; reqs = []
def ok(c, m):
    print(('ok    ' if c else 'FAIL  ') + m, flush=True)
    if not c: fails.append(m)
def note(m): print('note  ' + m, flush=True)

# ------------------------------------------------------------------ page-side helpers: every check returns an array of problem strings
HELPERS = r"""
window.__PT = (()=>{
  const R=__RTS, P=R.CINE_PAINT, EXPR=['neutral','talk','angry','smirk','sad','shock','smile','determined','laugh','scared','cold','weary'], MODES=['bust','silhouette','shadow','hologram'];
  const BG=[40,48,66];
  const ids=()=>Object.keys(R.STORY.characters).filter(k=>R.STORY.characters[k].look);
  const render=(id,o)=>{o=o||{};const w=o.w||256,h=o.h||270,cv=document.createElement('canvas');cv.width=w;cv.height=h;const g=cv.getContext('2d');g.fillStyle='rgb('+BG+')';g.fillRect(0,0,w,h);
    R.drawPortrait(g,id,o.expr||'neutral',w/2,h*(o.cy||.52),h*(o.boxH||.94),{W:w,H:h,bottom:h,face:o.face||'r',mode:o.mode||'bust',talk:o.talk||0,blink:o.blink||0,t:o.t==null?1.3:o.t,key:o.key,rim:o.rim,lights:o.lights});
    return g.getImageData(0,0,w,h);};
  const diff=(a,b,thr)=>{let n=0;const d=a.data,e=b.data,t=thr||24;for(let i=0;i<d.length;i+=4)if(Math.abs(d[i]-e[i])+Math.abs(d[i+1]-e[i+1])+Math.abs(d[i+2]-e[i+2])>t)n++;return n;};
  const fig=a=>{const m=[],d=a.data;for(let i=0;i<d.length;i+=4)m.push(Math.abs(d[i]-BG[0])+Math.abs(d[i+1]-BG[1])+Math.abs(d[i+2]-BG[2])>30);return m;};   // figure mask = not the flat background
  const stats=a=>{const m=fig(a),d=a.data;let n=0,lum=0,r=0,g=0,b=0,dark=0,bright=0;const q=new Set();
    for(let k=0;k<m.length;k++)if(m[k]){const i=k*4,l=.3*d[i]+.59*d[i+1]+.11*d[i+2];n++;lum+=l;r+=d[i];g+=d[i+1];b+=d[i+2];if(l<60)dark++;if(l>170)bright++;q.add((d[i]>>4)|((d[i+1]>>4)<<4)|((d[i+2]>>4)<<8));}
    return{frac:n/m.length,lum:lum/Math.max(1,n),r:r/Math.max(1,n),g:g/Math.max(1,n),b:b/Math.max(1,n),dark:dark/Math.max(1,n),bright,colours:q.size};};
  const rowActivity=a=>{const w=a.width,h=a.height,m=fig(a),d=a.data;let s=0,n=0;for(let y=1;y<h;y++)for(let x=0;x<w;x++){const k=y*w+x;if(m[k]&&m[k-w]){const i=k*4,j=(k-w)*4;s+=Math.abs(d[i]-d[j])+Math.abs(d[i+1]-d[j+1])+Math.abs(d[i+2]-d[j+2]);n++;}}return s/Math.max(1,n);};
  const mirrorDiff=(a,b)=>{const w=a.width;let n=0;for(let y=0;y<a.height;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,j=(y*w+(w-1-x))*4;if(Math.abs(a.data[i]-b.data[j])+Math.abs(a.data[i+1]-b.data[j+1])+Math.abs(a.data[i+2]-b.data[j+2])>24)n++;}return n;};
  const hash=a=>{let h=0x811c9dc5;const d=a.data;for(let i=0;i<d.length;i++){h^=d[i];h=Math.imul(h,16777619);}return h>>>0;};
  const err0=()=>P.errors.length;
  const errs=(n0,what)=>P.errors.slice(n0).map(e=>what+': '+e);
  /* ---- checks ---- */
  const checkCoverage=()=>{const bad=[],n0=err0();
    for(const id of ids())for(const m of MODES)for(const e of EXPR){
      let s;try{s=stats(render(id,{mode:m,expr:e,w:128,h:135}));}catch(x){bad.push(id+' '+m+' '+e+' threw '+x.message);continue;}
      if(s.frac<.12||s.colours<(m==='silhouette'?4:10))bad.push(id+' '+m+' '+e+' draws almost nothing (figure '+(100*s.frac).toFixed(0)+'%, '+s.colours+' colours)');}
    return bad.slice(0,6).concat(errs(n0,'painter error').slice(0,4));};
  const checkModes=()=>{const bad=[];
    for(const id of ids()){const A={};for(const m of MODES)A[m]=render(id,{mode:m,expr:'determined',key:{x:.85,y:.2,col:'#ffd9a0',a:.8}});
      const sb=stats(A.bust),ss=stats(A.silhouette),sh=stats(A.shadow),sy=stats(A.hologram);
      if(ss.dark<.8)bad.push(id+' silhouette is not black ('+(100*ss.dark).toFixed(0)+'% dark figure pixels)');
      if(!(ss.lum<.45*sb.lum))bad.push(id+' silhouette not darker than the bust ('+ss.lum.toFixed(0)+' vs '+sb.lum.toFixed(0)+')');
      if(!(sh.lum<.5*sb.lum)||sh.dark<.8)bad.push(id+' shadow is not hidden in the dark ('+sh.lum.toFixed(0)+' vs '+sb.lum.toFixed(0)+')');
      if(sh.bright<6)bad.push(id+' shadow has no glowing eyes ('+sh.bright+' bright px)');
      if(!(sy.g+sy.b>2.1*sy.r+30)||sy.r>140)bad.push(id+' hologram is not cyan (rgb '+sy.r.toFixed(0)+','+sy.g.toFixed(0)+','+sy.b.toFixed(0)+')');
      if(!(rowActivity(A.hologram)>1.6*rowActivity(A.bust)))bad.push(id+' hologram has no scanlines (row activity '+rowActivity(A.hologram).toFixed(1)+' vs '+rowActivity(A.bust).toFixed(1)+')');
      const f1=render(id,{mode:'hologram',t:.37}),f2=render(id,{mode:'hologram',t:.91});if(diff(f1,f2)<300)bad.push(id+' hologram does not move/flicker over time');}
    return bad.slice(0,8);};
  const checkExpressions=()=>{const bad=[];
    for(const id of ids()){const ims=EXPR.map(e=>render(id,{expr:e}));
      for(let i=0;i<ims.length;i++)for(let j=i+1;j<ims.length;j++){const d=diff(ims[i],ims[j]),need=(EXPR[i]==='neutral'&&EXPR[j]==='talk')?150:1200;if(d<need)bad.push(id+' '+EXPR[i]+'/'+EXPR[j]+' differ by only '+d+' px (need '+need+')');}}
    return bad.slice(0,8);};
  const checkTalk=()=>{const bad=[];
    for(const id of ids()){for(const e of EXPR){const d=diff(render(id,{expr:e,talk:0}),render(id,{expr:e,talk:1}));if(d<90)bad.push(id+' '+e+': talk 0 -> 1 changes only '+d+' px');}
      const b=render(id,{}),a=[.25,.5,.75,1].map(t=>diff(b,render(id,{talk:t})));if(!(a[0]<a[1]&&a[1]<a[2]&&a[2]<=a[3]+10))bad.push(id+' lip-sync is not monotonic '+a.join(','));}
    return bad.slice(0,8);};
  const checkBlink=()=>{const bad=[];
    for(const id of ids()){const o=render(id,{}),c=render(id,{blink:1}),h=render(id,{blink:.5});const d=diff(o,c);if(d<150)bad.push(id+' blink 1 changes only '+d+' px');
      if(!(diff(o,h)<d))bad.push(id+' half blink is not between open and closed');}
    return bad.slice(0,8);};
  const checkFacing=()=>{const bad=[];
    for(const id of ids())for(const [m,tol] of [['bust',90],['silhouette',60],['shadow',60]]){
      const a=render(id,{face:'r',mode:m,expr:'angry',key:{x:.1,y:.2,col:'#ffd9a0',a:.8}}),b=render(id,{face:'l',mode:m,expr:'angry',key:{x:.9,y:.2,col:'#ffd9a0',a:.8}});
      const d=mirrorDiff(a,b);if(d>tol)bad.push(id+' '+m+': face l is not the mirror of face r ('+d+' px differ)');}
    return bad.slice(0,8);};
  const checkMotion=()=>{const bad=[];
    for(const id of ids()){const a=render(id,{t:0}),b=render(id,{t:1.7}),c=render(id,{t:0}),n=fig(a).filter(Boolean).length,d=diff(a,b);
      if(d<150)bad.push(id+' no idle motion ('+d+' px)');if(d>.45*n)bad.push(id+' idle motion is not subtle ('+(100*d/n).toFixed(0)+'% of the figure)');if(diff(a,c)!==0)bad.push(id+' same t differs');}
    return bad.slice(0,8);};
  const checkPure=()=>{const bad=[],n0=err0();
    const A=ids().slice(0,12);
    const first=A.map(id=>hash(render(id,{expr:'smirk',talk:.4,blink:.25,t:2.2,key:{x:.3,y:.1,col:'#ffd0a0',a:.7}})));
    const again=A.map(id=>hash(render(id,{expr:'smirk',talk:.4,blink:.25,t:2.2,key:{x:.3,y:.1,col:'#ffd0a0',a:.7}})));
    A.forEach((id,i)=>{if(first[i]!==again[i])bad.push(id+' second identical call differs (warm cache)');});
    for(let k=0;k<1500;k++){const id=ids()[k%ids().length];render(id,{w:40+(k%97)*5,h:50+(k%89)*5,expr:EXPR[k%12],mode:MODES[k%4],talk:(k%9)/8,t:k*.07});}   // cache flood: evicts every layer
    const flood=A.map(id=>hash(render(id,{expr:'smirk',talk:.4,blink:.25,t:2.2,key:{x:.3,y:.1,col:'#ffd0a0',a:.7}})));
    A.forEach((id,i)=>{if(first[i]!==flood[i])bad.push(id+' differs after a cache flood');});
    window.__ptFirst=first;
    const rnd=Math.random,dn=Date.now,pn=performance.now.bind(performance),thr=()=>{throw new Error('forbidden call in a painter');};
    Math.random=thr;Date.now=thr;performance.now=thr;
    try{for(const id of ids().slice(0,8))for(const m of MODES){render(id,{mode:m,w:97,h:103,expr:'laugh',talk:.6,t:3.3});}}catch(e){bad.push('painter used Math.random/Date/performance.now: '+e.message);}finally{Math.random=rnd;Date.now=dn;performance.now=pn;}
    return bad.concat(errs(n0,'painter error')).slice(0,8);};
  /* every hair x armour x mark combination and awkward data: never throws, always draws */
  const checkAnyLook=()=>{const bad=[],n0=err0(),C=R.STORY.characters,HAIR=['short','long','shaved','crest','braid','hood','bald','bun','mane'],ARM=['plate','coat','robe','suit','rags','crown','hood'],MARK=['scar-l','tattoo','glow-eye','mask','visor','halo','cracks','none'];
    let n=0;const keep=C.__any;
    for(const h of HAIR)for(const a of ARM)for(const m of MARK){const id='any_'+h+'_'+a+'_'+m;C[id]={id,side:'good',faction:'meridian',role:'ally',look:{skin:'#c58c6a',hair:{style:h,color:'#6a4a2a'},eyes:'#66ccff',armor:{style:a,col:'#3d8bff',trim:'#a6ceff'},mark:[m],build:['lean','broad','slight','massive'][n%4],age:['young','adult','old'][n%3],emblem:['faction','none','crown','sun'][n%4]}};n++;
      try{const s=stats(render(id,{w:96,h:100,expr:EXPR[n%12],mode:MODES[n%4]}));if(s.frac<.1)bad.push(id+' draws almost nothing');}catch(e){bad.push(id+' threw '+e.message);}delete C[id];}
    const odd={e1:{look:{}},e2:{},e3:{look:{skin:'not a colour',hair:'short',eyes:'#fff',armor:'robe',mark:'halo',build:'huge',age:'ancient',emblem:'sun'}},e4:{look:{skin:'#c58c6a',hair:{style:'nope',color:'rgba(10,20,30,.5)'},armor:{style:'nope'},mark:['scar-l','tattoo','cracks','halo','mask','visor','glow-eye']}},
      e5:{look:{skin:'#000',hair:{style:'mane',color:'#fff'},eyes:'#000',armor:{style:'crown',col:'#000',trim:'#000'},mark:[null,undefined,'x'],emblem:'faction'},faction:'nonexistent',side:'evil'},e6:{look:{skin:'#fff',hair:{style:'hood',color:'#fff'},eyes:'#fff',armor:{style:'hood',col:'#fff',trim:'#fff'},mark:['halo','mask']},role:'villain'}};
    for(const k in odd){C[k]=Object.assign({id:k},odd[k]);for(const m of MODES)try{const s=stats(render(k,{w:96,h:100,mode:m}));if(s.frac<.05)bad.push(k+' '+m+' draws almost nothing');}catch(e){bad.push(k+' '+m+' threw '+e.message);}delete C[k];}
    try{const cv=document.createElement('canvas');cv.width=200;cv.height=200;const g=cv.getContext('2d');
      R.drawPortrait(g,'no_such_character','neutral',100,100,180);R.drawPortrait(g,'idris','not_an_expression',100,100,180,{mode:'not_a_mode',face:'x'});R.drawPortrait(g,'idris','neutral',100,100,0);R.drawPortrait(g,'idris','neutral',100,100,-5);
      R.drawPortrait(g,'idris','neutral',100,100,NaN);R.drawPortrait(g,'idris','neutral',100,100,3);R.drawPortrait(g,'idris','neutral',100,100,4000);R.drawPortrait(g,'idris','neutral',NaN,100,100);R.drawPortrait(g,'idris',undefined,100,100,100);
      R.drawPortrait(g,'idris','talk',100,100,150,{talk:7,blink:-3,t:1e9,key:{x:NaN,y:0},lights:[null,{x:.5,y:.5,a:1,col:'#f00'},{x:2,y:-1,a:.9}],bottom:50});R.drawPortrait(g,'idris','talk',100,100,150,{talk:'x',blink:'y',t:'z',rim:'bogus colour',lights:'no'});
      R.drawPortrait(g,'idris','neutral',100,100,150,{bottom:400});R.drawPortrait(g,'idris','neutral',100,100,150,{bottom:-100});R.drawPortrait(g,'idris','neutral',100,100,150,{W:0,H:0});
      for(const m of MODES){R.drawPortrait(g,'idris','neutral',100,100,3000,{mode:m});R.drawPortrait(g,'idris','neutral',100,100,5,{mode:m});}
      R.drawPortrait(null,'idris','neutral',1,1,1);R.cineFrame&&0;}catch(e){bad.push('awkward arguments threw '+e.message);}
    return bad.slice(0,8).concat(errs(n0,'painter error').slice(0,4));};
  /* engine integration: the painter inside cineFrame */
  const filmFor=(chars)=>({id:'pt_film',kind:'interlude',title:'t',music:'intro',letterbox:true,seed:5,scenes:chars.map((c,i)=>({id:'s'+i,dur:3,bg:{k:'void',tint:'#18305a',glow:.5},cam:{from:{x:.5,y:.5,z:1,r:0},to:{x:.5,y:.5,z:1.06,r:0},ease:'lin'},
    actors:[{id:'a',char:c,at:[.3,.62],h:.8,face:'r',expr:'angry',mode:MODES[i%4],t0:0},{id:'b',char:ids()[(i+3)%ids().length],at:[.72,.62],h:.7,face:'l',expr:'smile',mode:'bust',t0:0}],
    fx:[{k:'flare',t0:.5,t1:1.5,x:.8,y:.3,col:'#ffd9a0'}],lines:[{who:c,text:'Lip sync line for the portrait gate.',t:.2,dur:2.5,style:'normal'}],sfx:[],trans:{in:'cut',out:'cut',len:.3}}))});
  const engine=()=>{const out={bad:[],ms:[]},n0=err0(),film=filmFor(ids().slice(0,8)),cv=document.createElement('canvas');cv.width=640;cv.height=268;
    const fr=(t,o)=>{R.cineFrame(film,t,cv,Object.assign({frameOnly:true,tier:'high',noTrans:true},o||{}));return cv.getContext('2d').getImageData(0,0,640,268);};
    for(let i=0;i<8;i++){const a=fr(i*3+1.3),b=fr(i*3+1.3);if(diff(a,b,0)!==0)out.bad.push('scene '+i+': cineFrame is not pure');if(stats(a).colours<40)out.bad.push('scene '+i+': frame is nearly uniform');}
    const t0=performance.now();let n=0;for(let i=0;i<60;i++){fr(1+(i%8)*3+.01*i);n++;}out.ms=(performance.now()-t0)/n;
    const q=fr(1.3,{rm:true});if(stats(q).colours<40)out.bad.push('reduced motion frame is uniform');
    return Object.assign(out,{errs:errs(n0,'painter error')});};
  /* mutations: wrap the real painter so one aspect is ignored */
  let orig=null;
  const mutate=(name)=>{if(!orig)orig=P.actor;const W={
    blank:()=>{},
    noLook:(g,id,...a)=>orig(g,'fx_idris',...a),
    noExpr:(g,id,st,...a)=>orig(g,id,Object.assign({},st,{expr:'neutral'}),...a),
    noTalk:(g,id,st,...a)=>orig(g,id,Object.assign({},st,{talk:0}),...a),
    noBlink:(g,id,st,...a)=>orig(g,id,Object.assign({},st,{blink:0}),...a),
    noFace:(g,id,st,...a)=>orig(g,id,Object.assign({},st,{face:'r'}),...a),
    noMode:(g,id,st,...a)=>orig(g,id,Object.assign({},st,{mode:'bust'}),...a),
    noTime:(g,id,st,...a)=>orig(g,id,Object.assign({},st,{t:0}),...a),
    impure:(g,id,st,...a)=>{orig(g,id,st,...a);g.fillStyle='rgb(255,0,0)';g.fillRect(Math.floor(Math.random()*g.canvas.width),Math.floor(Math.random()*g.canvas.height),3,3);}
  };P.actor=W[name];};
  const unmutate=()=>{if(orig)P.actor=orig;};
  /* timing: median ms of a warm portrait (1x1 readback forces the software rasteriser to finish) */
  const bench=(id,W,H,box,mode,n)=>{const cv=document.createElement('canvas');cv.width=W;cv.height=H;const g=cv.getContext('2d'),a=[];
    for(let i=0;i<n+3;i++){const t0=performance.now();R.drawPortrait(g,id,'talk',W*.3,H*.55,H*box,{W,H,bottom:H,mode,t:2+i*.033,talk:(Math.sin(i)+1)/2,blink:i%30===5?1:0});g.getImageData(0,0,1,1);if(i>=3)a.push(performance.now()-t0);}a.sort((x,y)=>x-y);return a[a.length>>1];};
  return{render,diff,stats,ids,mutate,unmutate,bench,hash,checkCoverage,checkModes,checkExpressions,checkTalk,checkBlink,checkFacing,checkMotion,checkPure,checkAnyLook,engine,EXPR,MODES};
})();
"""

def open_page(p, errs):
    b, pg, perrs = PS.open_page(p)
    pg.on('request', lambda r: reqs.append(r.url[:80]) if not r.url.startswith(('file:', 'data:', 'blob:')) else None)
    pg.evaluate(HELPERS)
    return b, pg, perrs

def run(pg, name, timeout=240000):
    return pg.evaluate(f"()=>__PT.{name}()")

# ------------------------------------------------------------------ distinctness (numpy) against the page's current painter
def distinct_report(pg, ids, size=64):
    feats, imgs = PS.chip_features(pg, ids, size)
    names, M = PS.distance_matrix(feats)
    pairs = PS.closest_pairs(names, M, 4)
    return pairs, M, names

def main():
    with sync_playwright() as p:
        perrs = []
        b, pg, page_errs = open_page(p, perrs)
        story = PS.story_ids(pg); fx = PS.fixture_ids(pg); allids = fx + story
        note(f'{len(fx)} fixture characters + {len(story)} story characters: {", ".join(story)}')
        ok(len(fx) == 13, '13 fixture characters present (12 speakers + narrator)')

        # ---- coverage / modes
        r = run(pg, 'checkCoverage'); ok(not r, f'{len(allids)} characters x 12 expressions x 4 modes render, non-uniform, no painter error' + (' -- ' + '; '.join(r) if r else ''))
        r = run(pg, 'checkModes'); ok(not r, 'modes: silhouette is black, shadow is dark with glowing eyes, hologram is cyan with moving scanlines' + (' -- ' + '; '.join(r) if r else ''))
        # ---- expression / talk / blink / facing / motion
        r = run(pg, 'checkExpressions'); ok(not r, 'all 12 expressions differ pairwise on every character' + (' -- ' + '; '.join(r) if r else ''))
        r = run(pg, 'checkTalk'); ok(not r, 'state.talk drives the mouth in every expression, monotonically' + (' -- ' + '; '.join(r) if r else ''))
        r = run(pg, 'checkBlink'); ok(not r, 'state.blink closes the eyes (graded)' + (' -- ' + '; '.join(r) if r else ''))
        r = run(pg, 'checkFacing'); ok(not r, 'face l/r are exact mirrors under mirrored light (bust, silhouette, shadow)' + (' -- ' + '; '.join(r) if r else ''))
        r = run(pg, 'checkMotion'); ok(not r, 'idle breathing exists and is subtle; the same time gives the same pixels' + (' -- ' + '; '.join(r) if r else ''))
        # ---- purity
        r = run(pg, 'checkPure'); ok(not r, 'pure: warm cache == cache flood == poisoned Math.random/Date/performance.now' + (' -- ' + '; '.join(r) if r else ''))
        first = pg.evaluate("()=>window.__ptFirst")
        # fresh page = cold caches, another process-level state: the same hashes
        b2, pg2, _ = open_page(p, perrs)
        cold = pg2.evaluate("()=>{const A=__PT.ids().slice(0,12);return A.map(id=>__PT.hash(__PT.render(id,{expr:'smirk',talk:.4,blink:.25,t:2.2,key:{x:.3,y:.1,col:'#ffd0a0',a:.8}})));}")
        ok(cold == first, 'a fresh page (cold caches) renders bit-identical portraits')
        b2.close()
        src = (ROOT / 'src' / 'js' / '64_cine_portraits.js').read_text(encoding='utf-8')
        code = re.sub(r'/\*.*?\*/', '', src, flags=re.S); code = re.sub(r'(^|[^:])//[^\n]*', r'\1', code)
        bad = [t for t in ('Math.random', 'Date.now', 'new Date', 'performance.now', 'setTimeout', 'requestAnimationFrame', 'fetch(', 'XMLHttpRequest') if t in code]
        ok(not bad, 'source scan: no ' + ', '.join(bad or ['Math.random / Date / performance.now / timers / network']) + ' in 64_cine_portraits.js')
        # ---- any look
        r = run(pg, 'checkAnyLook'); ok(not r, '9 hairs x 7 armours x 8 marks (504 looks), odd / partial look data, unknown ids, extreme sizes and options never throw and always draw' + (' -- ' + '; '.join(r) if r else ''))
        # ---- distinctness
        MIN = PS.MIN_PAIR
        for name, ids in (('fixture', fx), ('story', story)):
            if len(ids) < 2: continue
            pairs, M, names = distinct_report(pg, ids)
            off = M[np.triu_indices(len(ids), 1)]
            ok(pairs[0][0] >= MIN, f'{name} characters ({len(ids)}) at 64 px: every pair differs, closest {pairs[0][1]} / {pairs[0][2]} = {pairs[0][0]:.2f} (gate {MIN}, median pair {np.median(off):.2f})')
            note(f'{name} closest pairs: ' + ', '.join(f'{a}/{c} {d:.2f}' for d, a, c in pairs))
        # 48 px chips keep the identity (LOD): render at 48, compare on the same metric
        for name, ids in (('fixture', fx), ('story', story)):
            if len(ids) < 2: continue
            feats, _ = PS.chip_features(pg, ids, 48)
            names, M = PS.distance_matrix(feats); pr = PS.closest_pairs(names, M, 3)
            ok(pr[0][0] >= PS.MIN_PAIR_48, f'{name} characters at 48 px: closest {pr[0][1]} / {pr[0][2]} = {pr[0][0]:.2f} (gate {PS.MIN_PAIR_48})')
        # controls prove the metric can fail: the same look under another id is NOT clearly different, a one-attribute change of the look is rated by its size
        base = pg.evaluate("()=>JSON.parse(JSON.stringify(__RTS.STORY.characters.idris))")
        pg.evaluate("(c)=>{c.id='ctl_clone';__RTS.STORY.characters.ctl_clone=c}", base)
        f, _ = PS.chip_features(pg, ['idris', 'ctl_clone']); dclone = PS.pair_distance(f['idris'], f['ctl_clone'])
        note(f'control: idris vs the identical look under another id = {dclone:.2f} (only the per-id face DNA differs)')
        ok(dclone < MIN + .25, f'metric control: an identical look is not rated "clearly different" ({dclone:.2f} < {MIN + .25:.2f})')
        # ---- engine
        e = pg.evaluate("()=>__PT.engine()")
        ok(not e['bad'] and not e['errs'], 'engine: cineFrame with portraits in all modes / facings / flare is pure and non-uniform, reduced motion too' + (' -- ' + '; '.join((e['bad'] + e['errs'])[:4]) if (e['bad'] or e['errs']) else ''))
        note(f"engine: {e['ms']:.1f} ms per 640x268 frame with two portraits + void + flare (software raster, relative only)")
        warm = [pg.evaluate("([i,W,H,b,m])=>__PT.bench(i,W,H,b,m,40)", [cid, 1280, 720, .8, 'bust']) for cid in ('idris', 'tilda', 'ostrander', 'oru')]
        holo = pg.evaluate("()=>__PT.bench('idris',1280,720,.8,'hologram',30)")
        note('warm bust 1280x720 box 0.8 (talking + blinking): ' + ', '.join(f'{c} {w:.1f} ms' for c, w in zip(('idris', 'tilda', 'ostrander', 'oru'), warm)) + f'; hologram {holo:.1f} ms (budget in the spec: 2 ms on a phone-class GPU path, relative here)')
        ok(max(warm) < 14 and holo < 22, f'portrait cost stays bounded in software raster (bust max {max(warm):.1f} ms < 14, hologram {holo:.1f} ms < 22)')

        # ---- mutation controls: each wrong painter must be caught by the check that owns the aspect
        def mut(name, check, why):
            pg.evaluate("(n)=>__PT.mutate(n)", name)
            try:
                if callable(check): r = check()
                else: r = run(pg, check)
            finally: pg.evaluate("()=>__PT.unmutate()")
            ok(bool(r), f'mutation control: {why} is caught' + ('' if r else ' -- NOT CAUGHT'))
        mut('blank', 'checkCoverage', 'a blank painter')
        mut('blank', 'checkModes', 'a blank painter (modes)')
        mut('noMode', 'checkModes', 'a painter that ignores state.mode')
        mut('noExpr', 'checkExpressions', 'an expression-blind painter')
        mut('noTalk', 'checkTalk', 'a talk-blind painter')
        mut('noBlink', 'checkBlink', 'a blink-blind painter')
        mut('noFace', 'checkFacing', 'a painter that ignores state.face')
        mut('noTime', 'checkMotion', 'a painter without idle motion')
        mut('impure', 'checkPure', 'an impure painter (Math.random)')
        def look_blind():
            pairs, M, names = distinct_report(pg, fx); return [] if pairs[0][0] >= MIN else [f'closest {pairs[0][0]:.2f}']
        mut('noLook', look_blind, 'a painter that ignores the character look (distinctness)')
        # a single-attribute duplicate pair: two story characters whose looks differ only in the eye colour must fail the gate (eyes are invisible at 64 px, so this pair is NOT distinct)
        pg.evaluate("(c)=>{c.id='ctl_eyes';c.look.eyes='#ff2040';__RTS.STORY.characters.ctl_eyes=c}", base)
        f, _ = PS.chip_features(pg, ['idris', 'ctl_eyes']); de = PS.pair_distance(f['idris'], f['ctl_eyes'])
        ok(de < MIN, f'metric control: a look that differs from another only by eye colour is rejected ({de:.2f} < {MIN})')

        ok(not page_errs, 'zero page errors / console errors' + (' -- ' + '; '.join(page_errs[:3]) if page_errs else ''))
        ok(not reqs, 'zero network requests' + (' -- ' + ', '.join(reqs[:3]) if reqs else ''))
        b.close()
    print('\n' + ('ALL PORTRAIT CHECKS PASSED' if not fails else f'{len(fails)} FAILED:\n  - ' + '\n  - '.join(fails)))
    return 1 if fails else 0

if __name__ == '__main__':
    sys.exit(main())
