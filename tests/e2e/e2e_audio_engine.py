"""Audio engine gate (Playwright + Chromium). Exit code != 0 on failure.   python3 tests/e2e/e2e_audio_engine.py   (about 70 s)
Asserts the ENGINE contract of docs/AUDIO_SPEC.md §1/§2/§8 (not the content of any voice):
  * the AudioContext exists only after a user gesture, Voice slider (#setVoice / SET.voiceVol) works, visibility suspend/resume
  * resolution order exact id -> unit/building voice from `who` -> generic fallback, registry, cache invalidation
  * mute silences, a burst of 500 sfx calls keeps activeNodes <= cap, priorities admit alert/ui while fire is saturated,
    identical-voice spam compresses (merged calls -> ONE louder voice), per-voice polyphony
  * offline render of every fallback voice: finite, non-silent, peak <= 0.98, |DC| < 0.01, no click at start/end, loudness within +-4 dB of
    its class, deterministic (same hash twice), different voices differ; a DSL voice using every kit feature renders cleanly
  * rendering touches no sim state and uses no Math.random / Date.now / performance.now; positional pan sign (live log + offline stereo)
  * zero network requests, zero page errors / console errors
  * MUTATION CHECKS (CLAUDE.md rule 15): the cap, determinism, purity, silence, pan sign, mute and spam checks are re-run against a copy of the
    build with that one behaviour broken and MUST fail there (needs a file:// URL or an http URL we can fetch)."""
import os, re, sys, json, pathlib, tempfile, time, urllib.request
from urllib.parse import unquote, urlparse
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
URL = os.environ.get('OD_URL') or (ROOT / 'dist' / 'orbital_dominion_v4.html').as_uri()
OUT = ROOT / 'tests' / 'out' / 'audio'
OUT.mkdir(parents=True, exist_ok=True)
T0 = time.time()
fails = []; errs = []; reqs = []


def ok(c, m):
    print(('ok    ' if c else 'FAIL  ') + m, flush=True)
    if not c: fails.append(m)


def vocab(name):
    t = (ROOT / 'src' / 'js' / '43_vocab.js').read_text(encoding='utf-8')
    m = re.search(r'const ' + name + r'=\[(.*?)\];', t, re.S)
    return re.findall(r"'([^']+)'", re.sub(r'//[^\n]*', '', m.group(1)))


LEGACY = 'click ack err coin boom boomBig train done alert place melee level era shoot bolt rocket shell acid win lose'.split()
SFX_GLOBAL = vocab('SFX_GLOBAL'); CINE_SFX = vocab('CINE_SFX')

CLASS_DB = {'ui': -26, 'fire': -22, 'impact': -18, 'boom': -14, 'voice': -20, 'alert': -17, 'cine': -18, 'music': -20, 'amb': -30}

# ---------------------------------------------------------------- page helpers
def new_page(b, url, track=True, boot='live', nocontent=False):
    """boot='live' starts the demo match (needed for sfx/pan/mute/cap checks); boot='lite' sets __TEST without 'live' = no demo, no frame loop (offline checks)"""
    pg = b.new_page(viewport={'width': 1366, 'height': 800})
    if track:
        pg.on('pageerror', lambda e: errs.append(('pageerror', str(e))))
        pg.on('console', lambda m: errs.append((m.type, m.text)) if m.type in ('error', 'warning') else None)
        pg.on('request', lambda r: reqs.append(r.url[:80]) if not r.url.startswith(('file:', 'data:', 'blob:')) else None)
    pg.add_init_script("window.__TEST='%s'" % ('live' if boot == 'live' else 'lite'))
    if nocontent: pg.add_init_script("window.__NOCONTENT=true")
    pg.goto(url); pg.wait_for_timeout(600 if boot == 'live' else 250)
    if nocontent: pg.evaluate("()=>{delete window.__NOCONTENT;}")   # content modules are skipped while loading only; later registerVoice() calls of the tests work normally
    return pg


def quiet_engine(pg):
    # STALE-TEST FIX: in the full build the music director (82_music.js) plays a theme in a match, books music nodes and ducks the music bus every tick while
    # the match is paused - musicStop() holds the director (LIVE.held) so the engine probes below see a quiet engine, as they did when only 80_audio.js existed.
    pg.evaluate("()=>{__RTS.G.paused=true;__RTS.musicStop(0);}")
    # the faded-out theme / ambience still holds a few nodes for a few seconds (reverb tails): wait until the engine is really idle
    try: pg.wait_for_function("()=>{const s=__RTS.AUD.stats();return s.activeNodes===0&&s.activeNodesMusic===0;}", timeout=15000)
    except Exception: print('note: engine not idle after 15 s (the checks below will say so)')
    pg.evaluate("()=>{__RTS.AUD.reset(true);}")   # no sim-originated sounds while we count


def go_live(pg, fast=False):
    """gesture + match; fast=True (mutation pages) skips the match build and just leaves demo mode: sfx() only reads G, ui.demo, cam."""
    pg.mouse.click(400, 300); pg.wait_for_timeout(250)
    if fast: pg.evaluate("()=>{__RTS.ui.demo=false;}")
    else:
        pg.click('#bStart'); pg.wait_for_timeout(1000)
    quiet_engine(pg)


# The engine-only page: the full build registers content voices (81_sfx_*), the 'cue' renderer (82 music) and 'speech' (84) while it loads, so the
# engine's own pre-registration contract (generic fallback voices, legacy score, generic-before-unit-voice resolution) can only be observed on a build in which
# those load-time registrations are skipped. The variant makes the public registerVoice()/registerRenderer() wrappers no-ops while window.__NOCONTENT is set
# (new_page(nocontent=True) sets it before load and deletes it right after, 80_audio.js registers its own fallbacks through the closure-private function).
ENGINE_PATCH = [
    ("function registerVoice(id,def,meta){return AUDIO.registerVoice(id,def,meta);}", "function registerVoice(id,def,meta){if(window.__NOCONTENT)return id;return AUDIO.registerVoice(id,def,meta);}"),
    ("function registerRenderer(kind,fn){AUDIO.registerRenderer(kind,fn);}", "function registerRenderer(kind,fn){if(window.__NOCONTENT)return;AUDIO.registerRenderer(kind,fn);}"),
]


def engine_html(html):
    for old, new in ENGINE_PATCH:
        assert html.count(old) == 1, 'engine-only patch target not found exactly once: ' + old[:40]
        html = html.replace(old, new)
    return html


# ---------------------------------------------------------------- checks (each takes a recorder so mutation runs can reuse them)
def chk_determinism(pg, rec):
    r = pg.evaluate("""async()=>{const A=__RTS.AUD,out={};
      for(const id of ['global.shoot','global.boom','global.heal','global.ack','cine.boom','cine.gong','cine.crowd','cine.engine','cine.stinger','cine.explosion']){
        const hs=[],qs=[];for(let k=0;k<3;k++){const r=await A.render({sfx:id},0,44100);hs.push(A.hash(r.channels,true));qs.push(A.hash(r.channels));}out[id]=[hs,qs];}
      return out;}""")
    rec(all(len(set(h)) == 1 and len(set(q)) == 1 for h, q in r.values()), 'offline renders are bit-reproducible (3 renders of 10 voices incl. noise/pluck/modal/formant/unison/reverb: identical float32 bits and 16-bit hash): ' + json.dumps({k: v[0][0] for k, v in r.items()}))


def chk_seed(pg, rec):
    r = pg.evaluate("""async()=>{const A=__RTS.AUD,h=async s=>A.hash((await A.render({sfx:'global.shoot',seed:s},0,44100)).channels);return [await h(0),await h(0),await h(1),await h(2)];}""")
    rec(r[0] == r[1] and r[0] != r[2] and r[2] != r[3], 'the instance seed drives the variation: same seed same output, other seeds differ')


def chk_pure(pg, rec):
    r = pg.evaluate("""async()=>{const A=__RTS.AUD,mr=Math.random,dn=Date.now,pn=performance.now.bind(performance);let err=null,ps=[];
      const boom=n=>()=>{throw new Error(n+' used while rendering');};
      Math.random=boom('Math.random');Date.now=boom('Date.now');performance.now=boom('performance.now');
      try{ // builders run synchronously inside the call: stubs can be restored before awaiting
        for(const id of ['global.boom','global.heal','cine.crowd','cine.gong','global.toast','cine.stinger'])ps.push(A.render({sfx:id},0,44100));
        ps.push(A.render({voice:{dur:0.3,cls:'fire',layers:[{k:'noise',color:'pink',filter:{type:'bp',f0:900,q:2},rm:{f:80},drive:0.4}]}},0,44100));
      }catch(e){err=String(e);}finally{Math.random=mr;Date.now=dn;performance.now=pn;}
      if(err)return{err};
      try{const rs=await Promise.all(ps);return{ok:true,n:rs.length,nonsilent:rs.every(r=>A.analyse(r.channels,r.sampleRate).peak>0.01)};}catch(e){return{err:String(e)};}}""")
    rec(r.get('ok') is True and r.get('nonsilent') is True, 'rendering uses no Math.random / Date.now / performance.now (stubbed to throw) ' + json.dumps(r))


def chk_gates(pg, rec):
    info = pg.evaluate("""()=>__RTS.AUD.voices({info:true}).filter(v=>v.fallback)""")
    rec(len(info) >= 61, f'{len(info)} generic fallback voices registered (>= 61: legacy + SFX_GLOBAL + CINE_SFX)')
    res = pg.evaluate("""async()=>{const A=__RTS.AUD,cls=A.classes(),out=[];
      for(const v of A.voices({info:true}).filter(v=>v.fallback)){
        const r=await A.render({sfx:v.id},0,44100),a=A.analyse(r.channels,r.sampleRate),h2=A.hash((await A.render({sfx:v.id},0,44100)).channels,true);
        out.push({id:v.id,cls:v.cls,dur:v.dur,tail:v.tail,target:cls[v.cls].db,a,h:A.hash(r.channels,true),h2});}
      return out;}""")
    bad = []
    for r in res:
        a = r['a']; d = a['activeDb'] - r['target']
        why = []
        if not a['finite']: why.append('NaN/Inf')
        if a['peak'] > 0.98: why.append('peak %.3f' % a['peak'])
        if a['activeDb'] < -60: why.append('silent %.1f dB' % a['activeDb'])
        if a['dc'] >= 0.01: why.append('DC %.4f' % a['dc'])
        if a['first'] >= 0.05: why.append('first sample %.3f' % a['first'])
        if a['tailDb'] > -60: why.append('tail %.1f dB' % a['tailDb'])
        if abs(d) > 4: why.append('level %+.1f dB vs class %s' % (d, r['cls']))
        if r['h'] != r['h2']: why.append('not deterministic')
        if a['end'] > r['dur'] + r['tail'] + 0.05: why.append('longer than declared %.2f > %.2f' % (a['end'], r['dur'] + r['tail']))
        if why: bad.append(r['id'] + ': ' + ', '.join(why))
    rec(not bad, f'all {len(res)} fallback voices: finite, non-silent, peak<=0.98, |DC|<0.01, no click at start/end, level within +-4 dB of class, deterministic' + ('' if not bad else ' -> ' + '; '.join(bad[:6])))
    hs = [r['h'] for r in res]
    rec(len(set(hs)) == len(hs), 'all fallback voices render differently from each other (no accidental clones)')
    json.dump([{k: r[k] for k in ('id', 'cls', 'target')} | {'activeDb': r['a']['activeDb'], 'peak': r['a']['peak'], 'hash': r['h']} for r in res], open(OUT / 'engine_fallback_levels.json', 'w'), indent=1)
    return res


def chk_pan(pg, rec):
    r = pg.evaluate("""async()=>{const R=__RTS,A=R.AUD,cam=R.cam,cx=cam.x+1366/cam.z/2,cy=cam.y+800/cam.z/2,o={};
      const one=(nm,x,y)=>{A.reset(true);A.sfx(nm,x,y);const l=A.log.filter(e=>e.name===nm).pop();return l;};
      o.left=one('shoot',cx-400,cy);o.right=one('shoot',cx+400,cy);o.mid=one('shoot',cx,cy);o.farR=one('shoot',cx+560,cy);o.far=one('boom',cx+99999,cy);
      const rms=d=>{let s=0;for(let i=0;i<d.length;i++)s+=d[i]*d[i];return Math.sqrt(s/d.length);};
      for(const[k,dx]of[['oL',-350],['oR',350],['oM',0]]){const r=await A.render({sfx:'global.shell',x:cx+dx,y:cy},0,44100);o[k]=[rms(r.channels[0]),rms(r.channels[1])];}
      return o;}""")
    rec(r['left']['pan'] < -0.1 and r['right']['pan'] > 0.1 and abs(r['mid']['pan']) < 0.05, f"live pan sign: left {r['left']['pan']:.2f} < 0 < right {r['right']['pan']:.2f}, centre {r['mid']['pan']:.2f}")
    rec(r['mid']['vol'] > r['right']['vol'] > r['farR']['vol'] >= 0.25, f"distance attenuation falls with distance: {r['mid']['vol']:.2f} > {r['right']['vol']:.2f} > {r['farR']['vol']:.2f} (floor 0.25)")
    rec(r['far']['r'] == 'culled', 'a sound far outside the view is culled, not played')
    rec(r['oL'][0] > 1.5 * r['oL'][1] and r['oR'][1] > 1.5 * r['oR'][0] and abs(r['oM'][0] - r['oM'][1]) < 0.1 * r['oM'][0], f"offline stereo output follows the source: L-src {r['oL']}, R-src {r['oR']}, mid {r['oM']}")


def chk_mute(pg, rec):
    r = pg.evaluate("""async()=>{const A=__RTS.AUD,names=['click','coin','err','place','train','ack','select','tab','cancel','mine'],c=()=>A.stats().counters;
      A.reset(true);for(const n of names)A.sfx(n);const p1=c().played;
      A.reset(true);const m=A.mute();for(const n of names)A.sfx(n);const c2=c();await new Promise(r=>setTimeout(r,250));const g=A.stats().masterGain;
      A.reset(true);const m2=A.mute();for(const n of names)A.sfx(n);const p3=c().played;await new Promise(r=>setTimeout(r,250));const g3=A.stats().masterGain;
      return{p1,m,played2:c2.played,muted2:c2.muted,g,m2,p3,g3};}""")
    rec(r['p1'] >= 8, f"unmuted: sfx plays ({r['p1']}/10)")
    rec(r['m'] is True and r['played2'] == 0 and r['muted2'] == 10 and r['g'] < 0.01, f"mute: no voice is created ({r['played2']} played, {r['muted2']} counted as muted) and the master gain falls to {r['g']:.3f}")
    rec(r['m2'] is False and r['p3'] >= 8 and r['g3'] > 0.95, f"unmute restores sound (played {r['p3']}, master gain {r['g3']:.2f})")


JS_STRESS_REG = """(n,cls)=>{const A=__RTS.AUD;for(let i=0;i<n;i++)A.registerVoice('stress.'+cls+'.'+i,{dur:1.0,cls,gap:0,poly:0,layers:[{k:'osc',type:'sine',f:200+i*13,gain:0.01},{k:'osc',type:'triangle',f:300+i*11,gain:0.01},{k:'noise',color:'pink',gain:0.01,filter:{type:'lp',f0:1200}}]});}"""


def chk_cap(pg, rec, full=True):
    r = pg.evaluate("""async()=>{const R=__RTS,A=R.AUD,cam=R.cam,cx=cam.x+1366/cam.z/2,cy=cam.y+800/cam.z/2,o={};
      const reg="""+JS_STRESS_REG+"""; reg(40,'fire');
      A.reset(true);let mx=0;
      for(let pass=0;pass<3;pass++)for(let i=0;i<40;i++){A.sfx('stress.fire.'+i,cx+(i-20)*8,cy);mx=Math.max(mx,A.activeNodes);}
      o.fireMax=mx;o.peak=A.stats().peakNodes;o.cap=A.cap;o.capped=A.stats().counters.capped;o.played=A.stats().counters.played;
      // priorities: with fire saturated an alert, a ui click and a boom are still admitted; one more fire is not
      const before=A.stats().counters.played;
      const al=A.sfx('alert'),ck=A.sfx('click'),fr=A.sfx('stress.fire.39',cx,cy);
      o.admit={alert:al,click:ck,fire:fr};o.nodesAfter=A.activeNodes;
      if(!%s)return o;
      // mixed 500-call burst in 2 s
      await new Promise(r=>setTimeout(r,1250));A.reset(true);
      const names=['shoot','bolt','rocket','shell','acid','melee','boom','boomBig','click','ack','coin','err','alert','place'];let s=12345,mx2=0;const rnd=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};
      let calls=0;await new Promise(res=>{let tick=0;const iv=setInterval(()=>{for(let k=0;k<5;k++){A.sfx(names[(rnd()*names.length)|0],cx+(rnd()-0.5)*1100,cy+(rnd()-0.5)*600);calls++;mx2=Math.max(mx2,A.activeNodes);}
        if(++tick>=100){clearInterval(iv);res();}},20);});
      const st=A.stats();o.burst={calls,max:mx2,peak:st.peakNodes,played:st.counters.played,merged:st.counters.merged,poly:st.counters.poly,capped:st.counters.capped,culled:st.counters.culled};
      await new Promise(r=>setTimeout(r,1500));o.after=A.activeNodes;
      return o;}""" % ('true' if full else 'false'))
    rec(r['fireMax'] <= r['cap'] and r['peak'] <= r['cap'], f"polyphony cap holds: 40 voices x3 passes -> activeNodes max {r['fireMax']} <= cap {r['cap']}")
    rec(r['fireMax'] >= 18 and r['capped'] > 0 and r['played'] < 120, f"...and the cap really bound (reached {r['fireMax']} nodes, {r['capped']} voices refused, {r['played']}/120 played)")
    rec(r['admit']['alert'] and r['admit']['click'] and not r['admit']['fire'], f"priority classes: with fire saturated alert+ui are admitted, one more fire is refused {r['admit']}")
    if not full: return
    b = r['burst']
    rec(b['calls'] >= 500 and b['max'] <= r['cap'] and b['peak'] <= r['cap'], f"500 sfx calls in 2 s: activeNodes max {b['max']} / peak {b['peak']} <= cap {r['cap']}  {b}")
    rec(b['merged'] + b['poly'] + b['capped'] > 100 and b['played'] < 0.6 * b['calls'], f"...the governor acted ({b['played']} of {b['calls']} calls became voices)")
    rec(r['after'] == 0, 'all source nodes are released after they end (activeNodes back to 0)')


def chk_spam(pg, rec):
    r = pg.evaluate("""async()=>{const A=__RTS.AUD,probe=[];
      A.registerVoice('probe.spam',(Ax,t,p)=>{probe.push([p.vol,p.pitch]);KIT_osc(Ax,t,p);},{dur:0.1,cls:'fire',gap:60,poly:0,vary:{},variants:1});
      function KIT_osc(Ax,t,p){A.KIT.layer(Ax,t,{k:'osc',type:'sine',f:440,gain:0.05},p);}
      A.reset(true);let n=0;for(let i=0;i<40;i++)n+=A.sfx('probe.spam')?1:0;const c1=A.stats().counters;
      await new Promise(r=>setTimeout(r,90));A.sfx('probe.spam');const c2=A.stats().counters;
      A.registerVoice('probe.poly',{dur:0.8,cls:'fire',gap:0,poly:2,layers:[{k:'osc',type:'sine',f:300,gain:0.01}]});A.reset(true);
      for(let i=0;i<6;i++)A.sfx('probe.poly');const c3=A.stats().counters;
      return{n,played1:c1.played,merged1:c1.merged,played2:c2.played,probe,poly:{played:c3.played,poly:c3.poly}};}""")
    rec(r['played1'] == 1 and r['merged1'] == 39, f"identical-voice spam compresses: 40 calls in one burst -> {r['played1']} voice, {r['merged1']} merged")
    p = r['probe']
    rec(len(p) == 2 and p[1][0] > p[0][0] * 1.2 and p[1][1] < p[0][1], f"...and the next voice stands for the merged ones (louder, slightly lower): vol {p[0][0]:.2f} -> {p[1][0]:.2f}, pitch {p[0][1]:.3f} -> {p[1][1]:.3f}" if len(p) == 2 else f'probe calls {p}')
    rec(r['poly']['played'] == 2 and r['poly']['poly'] == 4, f"per-voice polyphony limit: poly=2 -> {r['poly']['played']} played, {r['poly']['poly']} refused")


JS_KIT = r"""async()=>{
const A=__RTS.AUD,SR=44100,o={};
const fft=(re,im)=>{const n=re.length;for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){let t=re[i];re[i]=re[j];re[j]=t;t=im[i];im[i]=im[j];im[j]=t;}}
  for(let len=2;len<=n;len<<=1){const ang=-2*Math.PI/len,wr=Math.cos(ang),wi=Math.sin(ang);for(let i=0;i<n;i+=len){let cr=1,ci=0;for(let k=0;k<len/2;k++){const ur=re[i+k],ui=im[i+k],vr=re[i+k+len/2]*cr-im[i+k+len/2]*ci,vi=re[i+k+len/2]*ci+im[i+k+len/2]*cr;re[i+k]=ur+vr;im[i+k]=ui+vi;re[i+k+len/2]=ur-vr;im[i+k+len/2]=ui-vi;const t=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=t;}}}};
const spec=(x,t0,n)=>{const re=new Float64Array(n),im=new Float64Array(n),s=Math.round(t0*SR);for(let i=0;i<n;i++)re[i]=(x[s+i]||0)*(0.5-0.5*Math.cos(2*Math.PI*i/n));fft(re,im);const m=new Float64Array(n/2);for(let i=0;i<n/2;i++)m[i]=re[i]*re[i]+im[i]*im[i];return m;};
const band=(m,n,f0,f1)=>{let s=0;for(let i=Math.max(1,Math.floor(f0*n/SR));i<=Math.min(n/2-1,Math.ceil(f1*n/SR));i++)s+=m[i];return s;};
const db=v=>10*Math.log10(v+1e-30);
const peak=(m,n,f0=20,f1=SR/2-100)=>{let bi=0,bv=0;for(let i=Math.floor(f0*n/SR);i<=Math.floor(f1*n/SR);i++)if(m[i]>bv){bv=m[i];bi=i;}const a=Math.log(m[bi-1]+1e-30),b=Math.log(m[bi]+1e-30),c=Math.log(m[bi+1]+1e-30);return (bi+0.5*(a-c)/(a-2*b+c))*SR/n;};
const cent=(m,n,f0=50,f1=16000)=>{let s=0,w=0;for(let i=Math.floor(f0*n/SR);i<=Math.floor(f1*n/SR);i++){s+=m[i]*i*SR/n;w+=m[i];}return s/w;};
const R=async(layers,dur,extra)=>{const r=await A.render({voice:Object.assign({dur,cls:'fire',gain:1,vary:{},layers},extra||{})},dur+0.05,SR);return r.channels;};
const S1={a:0.005,s:1,d:0.01,r:0.01};
let x;
x=await R([{k:'osc',type:'sine',f:440,gain:0.5,env:S1}],0.6);o.osc440=peak(spec(x[0],0.1,16384),16384);
x=await R([{k:'osc',type:'sine',f:1000,pitch:{from:1000,to:250,t:0.4},gain:0.5,env:S1}],0.5);o.glide=[peak(spec(x[0],0.02,2048),2048),1000*Math.pow(0.25,0.043/0.4),peak(spec(x[0],0.34,2048),2048),1000*Math.pow(0.25,0.363/0.4)];
x=await R([{k:'noise',color:'white',gain:0.5,env:S1,filter:{type:'lp',f0:8000,f1:400,t:0.5,q:0.707}}],0.55);o.lpSweep=[cent(spec(x[0],0.02,2048),2048),cent(spec(x[0],0.42,2048),2048)];
x=await R([{k:'noise',color:'white',gain:0.5,env:S1,filter:{type:'hp',f0:4000}}],0.4);{const m=spec(x[0],0.05,8192);o.hp=db(band(m,8192,100,800))-db(band(m,8192,5000,9000));}
x=await R([{k:'pluck',f:330,t60:0.6,damp:0.3,bright:0.7,gain:0.5,env:{d:0.5}}],0.5);o.ks330=peak(spec(x[0],0.05,16384),16384,250,420);
x=await R([{k:'pluck',f:880,t60:0.6,damp:0.3,bright:0.7,gain:0.5,env:{d:0.5}}],0.5);o.ks880=peak(spec(x[0],0.05,16384),16384,700,1100);
x=await R([{k:'pluck',mode:'modal',f:300,ratios:[1,2.76,5.4],t60:0.6,gain:0.5,env:{d:0.5}}],0.5);{const m=spec(x[0],0.02,16384);o.modal=[peak(m,16384,100,500),peak(m,16384,700,1000),peak(m,16384,1400,1800)];}
x=await R([{k:'fm',f:440,ratio:2,idx:2,gain:0.3,env:S1}],0.5);{const m=spec(x[0],0.05,16384);const b=f=>db(band(m,16384,f-15,f+15));o.fm=[b(440),b(880),b(1320),b(1760)];}
x=await R([{k:'osc',type:'sine',f:1000,gain:0.5,env:S1,rm:{f:300,depth:1}}],0.5);{const m=spec(x[0],0.05,16384);const b=f=>db(band(m,16384,f-15,f+15));o.ring=[b(700),b(1000),b(1300)];}
for(const v of['a','i']){x=await R([{k:'formant',src:'sawtooth',f:110,vowel:v,gain:0.5,env:S1}],0.5);const m=spec(x[0],0.05,16384);o['vowel_'+v]=[db(band(m,16384,600,900))-db(band(m,16384,200,400)),db(band(m,16384,2000,3200))-db(band(m,16384,600,900))];}
x=await R([{k:'osc',type:'sine',f:200,gain:0.3,env:S1,drive:0.8}],0.5);{const m=spec(x[0],0.05,16384);o.drive=db(band(m,16384,585,615))-db(band(m,16384,185,215));}
x=await R([{k:'osc',type:'sine',f:200,gain:0.3,env:S1}],0.5);{const m=spec(x[0],0.05,16384);o.nodrive=db(band(m,16384,585,615))-db(band(m,16384,185,215));}
x=await R([{k:'osc',type:'sine',f:500,gain:0.5,env:{a:0.005,s:1,d:0.01,r:0.01},trem:{f:8,depth:0.8}}],0.6);{const w=Math.round(0.01*SR),e=[];for(let i=0.05*SR;i<0.55*SR;i+=w){let s=0;for(let j=0;j<w;j++)s+=x[0][i+j]**2;e.push(Math.sqrt(s/w));}o.trem=Math.max(...e)/Math.min(...e);}
x=await R([{k:'osc',type:'sine',f:440,gain:0.5,env:{a:0.1,d:0.1,s:0.5,r:0.2}}],0.6);{const rms=(a,b)=>{let s=0,n=0;for(let i=Math.round(a*SR);i<Math.round(b*SR);i++){s+=x[0][i]**2;n++;}return Math.sqrt(s/n);};const pk=Math.max(rms(0.09,0.11),rms(0.1,0.12));o.adsr={start:rms(0,0.01)/0.35,peakRms:rms(0.095,0.105),sustain:rms(0.3,0.38),susRatio:rms(0.3,0.38)/rms(0.095,0.105),tail:rms(0.595,0.65)};}
{const e=(c,a,b)=>{let s=0;for(let i=Math.round(a*SR);i<Math.min(c.length,Math.round(b*SR));i++)s+=c[i]**2;return s;};
 const nz=send=>[{k:'noise',color:'white',gain:0.5,env:{a:0.002,d:0.01},dur:0.02,send}];
 const dry=await R(nz(undefined),0.2);o.reverb={};
 for(const room of['plate','hall','air']){const w=await R(nz({rev:1,room}),4);o.reverb[room]={diff:db(e(w[0],0.03,4))-db(e(dry[0],0,0.2)),drop:db(e(w[0],0.3,0.5))-db(e(w[0],1.0,1.2))};}
 const w=await R(nz({dly:1}),3);o.dly=db(e(w[0],0.03,3))-db(e(dry[0],0,0.2));}
x=await R([{k:'osc',type:'sine',f:440,gain:0.5,env:S1,pan:-1}],0.3);o.pan=[Math.sqrt(x[0].reduce((s,v)=>s+v*v,0)/x[0].length),Math.sqrt(x[1].reduce((s,v)=>s+v*v,0)/x[1].length)];
{const lo=[],res={};for(const c of['white','pink','brown']){x=await R([{k:'noise',color:c,gain:0.5,env:S1}],0.6);const m=spec(x[0],0.05,16384);res[c]=db(band(m,16384,100,400))-db(band(m,16384,4000,8000));}o.noise=res;}
x=await R([{k:'osc',type:'sawtooth',f:200,gain:0.3,env:S1,unison:{n:3,spread:40}}],0.5);{const m=spec(x[0],0.05,16384);const b=f=>db(band(m,16384,f-1.5,f+1.5));o.unison=[b(200*Math.pow(2,-40/1200)),b(200),b(200*Math.pow(2,40/1200))];}
return o;}"""


def chk_kit(pg, rec):
    o = pg.evaluate(JS_KIT)
    rec(abs(o['osc440'] - 440) < 0.5, f"osc: a 440 Hz sine measures {o['osc440']:.2f} Hz")
    g = o['glide']
    rec(abs(g[0] / g[1] - 1) < 0.04 and abs(g[2] / g[3] - 1) < 0.04, f"pitch glide follows the exponential curve: {g[0]:.0f}/{g[1]:.0f} Hz early, {g[2]:.0f}/{g[3]:.0f} Hz late")
    rec(o['lpSweep'][0] > 3 * o['lpSweep'][1] and o['lpSweep'][1] < 800, f"filter envelope: low-pass sweep 8 kHz -> 400 Hz moves the spectral centroid {o['lpSweep'][0]:.0f} -> {o['lpSweep'][1]:.0f} Hz")
    rec(o['hp'] < -25, f"high-pass at 4 kHz removes the low band ({o['hp']:.0f} dB)")
    rec(abs(o['ks330'] / 330 - 1) < 0.015 and abs(o['ks880'] / 880 - 1) < 0.015, f"Karplus-Strong pluck is in tune: {o['ks330']:.1f} Hz for 330, {o['ks880']:.1f} Hz for 880")
    rec(abs(o['modal'][0] / 300 - 1) < 0.015 and abs(o['modal'][1] / 828 - 1) < 0.015 and abs(o['modal'][2] / 1620 - 1) < 0.015, f"modal (struck) pluck puts partials at the requested ratios {[round(v) for v in o['modal']]} (expected 300/828/1620)")
    f = o['fm']
    rec(f[1] - f[0] < -30 and f[2] - f[0] > -20, f"FM (ratio 2, index 2): energy only at odd multiples of the carrier (880 Hz {f[1]-f[0]:.0f} dB, 1320 Hz {f[2]-f[0]:.0f} dB re 440 Hz)")
    r = o['ring']
    rec(r[1] - r[0] < -30 and abs(r[0] - r[2]) < 2, f"ring-mod (1 kHz x 300 Hz): sidebands at 700/1300 Hz, carrier suppressed ({r[1]-r[0]:.0f} dB)")
    a, i = o['vowel_a'], o['vowel_i']
    rec(a[0] > 5 and a[1] < -5 and i[0] < -5 and i[1] > 5, f"formant voice: vowel 'a' has its energy near F1 {a[0]:+.0f}/{a[1]:+.0f} dB, vowel 'i' near F2 {i[0]:+.0f}/{i[1]:+.0f} dB")
    rec(o['drive'] > -20 and o['nodrive'] < -60, f"waveshaper drive adds odd harmonics (H3 {o['drive']:.0f} dB re H1 with drive, {o['nodrive']:.0f} without)")
    rec(4 < o['trem'] < 6.5, f"tremolo depth 0.8 modulates the envelope by {o['trem']:.1f}x (expected 5x)")
    ad = o['adsr']
    rec(ad['start'] < 0.15 and 0.42 < ad['susRatio'] < 0.6 and ad['tail'] < 0.001, f"ADSR: attack ramps from silence ({ad['start']:.2f}), sustain = {ad['susRatio']:.2f} of peak (s=0.5), release ends in silence")
    rv = o['reverb']
    rec(all(abs(rv[k]['diff']) < 1.5 for k in rv) and rv['hall']['drop'] > 15 and abs(o['dly'] + 3) < 1.5, f"send calibration: reverb send 1.0 returns wet~dry energy ({', '.join('%s %+.1f dB' % (k, rv[k]['diff']) for k in rv)}), hall tail decays {rv['hall']['drop']:.0f} dB between 0.4 s and 1.1 s, delay send 1.0 = {o['dly']:+.1f} dB")
    rec(o['pan'][1] < 1e-4 and o['pan'][0] > 0.1, f"layer pan -1 puts everything in the left channel {o['pan']}")
    n = o['noise']
    rec(10 < n['pink'] - n['white'] < 19 and 20 < n['brown'] - n['white'] < 34, f"noise colours tilt as named: pink {n['pink']-n['white']:+.0f} dB, brown {n['brown']-n['white']:+.0f} dB re white (low/high band)")
    u = o['unison']
    rec(max(u) - min(u) < 6, f"unison spreads three detuned copies (-40/0/+40 cents all present: {[round(v) for v in u]} dB)")


def chk_hooks(pg, rec):
    """what the music / voice / Sound Lab modules call"""
    h = pg.evaluate("""async()=>{const R=__RTS,A=R.AUD,K=A.KIT,sl=ms=>new Promise(r=>setTimeout(r,ms)),o={};
      A.reset(true);o.legacy0=A.stats().legacyScore;o.renderers0=A.stats().renderers;
      // live handle for the music bus
      const MA=A.audioA('music');o.A={ctx:MA.ctx===A.ctx,destIsBus:MA.dest===A.bus('music'),t0:MA.t0>0,rng:typeof MA.rng()==='number',off:MA.off};
      const n0=A.stats().activeNodesMusic,s0=A.stats().activeNodes;
      K.layer(MA,MA.t0+0.02,{k:'osc',type:'sine',f:330,dur:0.25,gain:0.05},MA.p);K.layer(MA,MA.t0+0.05,{k:'noise',color:'pink',dur:0.2,gain:0.02,filter:{type:'lp',f0:900}},MA.p);
      o.musicNodes=A.stats().activeNodesMusic-n0;o.sfxNodes=A.stats().activeNodes-s0;
      await sl(700);o.musicNodesAfter=A.stats().activeNodesMusic-n0;
      // ducking
      A.duck('music',0.6,300);await sl(120);o.duckLow=A.stats().ducks.music;await sl(1300);o.duckBack=A.stats().ducks.music;
      A.delay('music',0.25,0.3);
      // direct playback + meter
      o.play=[A.play('global.click'),A.play({dur:0.1,cls:'ui',layers:[{k:'osc',f:500,gain:0.1}]}),A.play('definitely.not.a.voice')];
      A.play('global.boom');await sl(60);const m=A.meter();o.meter=[typeof m.peak,typeof m.rms,m.peak>=0];
      // announcer is counted; legacy helpers do not throw
      const says0=A.stats().counters.says;R.SET.voice=true;A.say('Engine test line');o.says=A.stats().counters.says-says0;
      let err=null;try{A.tone(440,0.05,'sine',0.01);A.noiseBurst(0.05,0.01,1000);}catch(e){err=String(e);}o.compat=err;
      // a music module registers its renderer
      A.registerRenderer('probe',(spec,sec,sr)=>A.offline(sec,sr,(Ax)=>{K.layer(Ax,0,{k:'osc',type:'sine',f:261.6,dur:0.4,gain:0.2,send:{rev:0.2,room:'hall'}},Ax.p);K.layer(Ax,0.1,{k:'noise',dur:0.2,gain:0.1},Ax.p);}));
      o.renderers=A.stats().renderers;
      const a=await A.render({probe:'test'},1.2,44100),b=await A.render({probe:'test'},1.2,44100),m2=A.analyse(a.channels,a.sampleRate);
      o.cue={peak:m2.peak,same:A.hash(a.channels,true)===A.hash(b.channels,true),sr:a.sampleRate,n:a.channels[0].length};
      let rej=null;try{await A.render({nothing:1},1,44100);}catch(e){rej=String(e);}o.reject=rej;
      let ready=0;A.onReady(()=>ready++);o.ready=ready;
      const x=await A.offline(0.3,44100,(Ax)=>{K.layer(Ax,0,{k:'osc',f:200,dur:0.2,gain:8},Ax.p);},{master:true});o.masterOffline=A.analyse(x.channels,44100).peak;
      return o;}""")
    rec(h['A']['ctx'] and h['A']['destIsBus'] and h['A']['t0'] and h['A']['rng'] and h['A']['off'] is False, f"audioA('music') is a live handle on the music bus {h['A']}")
    rec(h['musicNodes'] == 2 and h['sfxNodes'] == 0 and h['musicNodesAfter'] == 0, f"notes scheduled through the music A count against the music budget only ({h['musicNodes']} music / {h['sfxNodes']} sfx nodes) and are released ({h['musicNodesAfter']} left)")
    rec(h['duckLow'] < 0.55 and h['duckBack'] > 0.97, f"audioDuck dips the music bus ({h['duckLow']:.2f}) and recovers ({h['duckBack']:.2f})")
    rec(h['play'] == [True, True, False] and h['meter'] == ['number', 'number', True], f"audioPlay plays an id or a def (and refuses unknown ids), audioMeter reads the master {h['play']}")
    rec(h['says'] == 1 and h['compat'] is None, f"say() is counted ({h['says']}), legacy tone()/noiseBurst() helpers still work {h['compat']}")
    # STALE-TEST FIX: the full build already has the music module's 'cue' renderer, so the fallback-score hand-over is checked on the engine-only page (main run, below);
    # here a private renderer kind ('probe') exercises registerRenderer + audioRender without replacing the real 'cue' renderer the rest of the run depends on.
    rec(h['legacy0'] is False and 'cue' in h['renderers0'] and 'probe' in h['renderers'], "full build: the music module has registered its 'cue' renderer at load, so the fallback score is already off; registerRenderer('probe') adds a kind")
    rec(0.01 < h['cue']['peak'] <= 0.98 and h['cue']['same'] and h['cue']['sr'] == 44100 and h['cue']['n'] == 52920 and h['reject'] is not None and h['ready'] == 1, f"registerRenderer + audioOffline: audioRender({{probe}}) renders deterministically {h['cue']}; unknown spec rejects; audioOnReady fires at once when the context exists")
    rec(h['masterOffline'] < 0.98, f"audioOffline(..., {{master:true}}) soft-clips an over-driven render (peak {h['masterOffline']:.3f})")


def chk_orphan(pg, rec):
    """a source whose output is cut from the graph never fires `ended` (the renderer never pulls it): music's killPlayer() disconnects a cue's gains while notes of its look-ahead are still
    scheduled. The engine must retire such nodes by their stop time or they stay in the node budget for ever (found by this gate: activeNodes never returned to 0 after a theme was replaced)."""
    r = pg.evaluate("""async()=>{const A=__RTS.AUD,K=A.KIT,sl=ms=>new Promise(r=>setTimeout(r,ms));
      const n0=A.stats().activeNodesMusic,MA=A.audioA('music'),real=MA._dest;
      MA._dest=A.ctx.createGain();   // a gain that is connected to nothing (the layers connect synchronously; the real bus is put back right after)
      for(let i=0;i<3;i++)K.layer(MA,MA.t0+0.02,{k:'osc',type:'sine',f:300+i*50,dur:0.15,gain:0.05},MA.p);
      MA._dest=real;
      const booked=A.stats().activeNodesMusic-n0;await sl(1800);
      return{booked,left:A.stats().activeNodesMusic-n0};}""")
    rec(r['booked'] == 3 and r['left'] == 0, f"source nodes that can never fire `ended` (output cut from the graph) are retired after their stop time: {r['booked']} booked, {r['left']} left")


def chk_cost(pg, rec):
    r = pg.evaluate("""()=>{const A=__RTS.AUD,cam=__RTS.cam,cx=cam.x+1366/cam.z/2,cy=cam.y+800/cam.z/2;A.reset(true);
      A.sfx('shoot',cx,cy);const N=20000;let t0=performance.now();for(let i=0;i<N;i++)A.sfx('shoot',cx,cy);const merged=(performance.now()-t0)*1000/N;
      t0=performance.now();for(let i=0;i<N;i++)A.sfx('boomBig',cx+99999,cy);const culled=(performance.now()-t0)*1000/N;
      t0=performance.now();for(let i=0;i<N;i++)A.sfx('shoot',cx,cy,{type:'rifleman',faction:'obsidian'});const withWho=(performance.now()-t0)*1000/N;
      return{merged,culled,withWho,log:A.log.length,played:A.stats().counters.played};}""")
    rec(r['merged'] < 25 and r['culled'] < 25 and r['withWho'] < 25, f"hot path: a merged / culled / who-resolved sfx() call costs {r['merged']:.1f} / {r['culled']:.1f} / {r['withWho']:.1f} us (< 25 us each)")


def chk_resolution(pg, ok):
    """resolution order exact id -> unit/building voice from `who` -> generic fallback (engine-only page: nothing registered yet)"""
    res = pg.evaluate("""async()=>{const R=__RTS,A=R.AUD,G=R.G,cam=R.cam,cx=cam.x+1366/cam.z/2,cy=cam.y+800/cam.z/2,o={},simple=f=>({dur:0.1,cls:'fire',gap:0,poly:0,layers:[{k:'osc',type:'square',f,gain:0.02}]});
      const last=()=>A.log.slice(-1)[0],call=(nm,who,x=cx,y=cy)=>{A.reset(true);A.sfx(nm,x,y,who);return last();};
      const myFac=G.teams[0].faction,hauler=G.units.find(u=>u.team===0&&u.type==='hauler'),creep=G.units.find(u=>u.team===2),bld=G.buildings.find(b=>b.team===0&&b.type==='hub');
      o.fac=myFac;o.creep=creep&&creep.type;
      o.before=call('shoot',{type:'rifleman',faction:'obsidian'}).voice;
      A.registerVoice('rifleman.fire.obsidian',simple(500));
      o.derived=call('shoot',{type:'rifleman',faction:'obsidian'}).voice;
      o.otherFaction=call('shoot',{type:'rifleman',faction:'meridian'}).voice;
      o.noWho=call('shoot').voice;
      o.exact=call('rifleman.fire.obsidian').voice;
      A.registerVoice('hauler.select.'+myFac,simple(600));A.registerVoice('hauler.ready.'+myFac,simple(650));
      o.entity=call('select',hauler).voice;o.entityRow=last();
      o.unitDone=call('done',hauler).voice;
      A.registerVoice('hub.done.'+myFac,simple(700));A.registerVoice('hub.die.'+myFac,simple(300));
      o.bldDone=call('done',bld).voice;o.bldBoom=call('boomBig',bld).voice;
      A.registerVoice(creep.type+'.melee.wild',simple(150));
      o.creepFireFallsToMelee=call('shoot',creep).voice;o.creepFac=last().faction;
      A.reset(true);A.sfxUnit('rifleman','fire',cx,cy,'obsidian');o.sfxUnit=last().voice;
      A.reset(true);A.sfxBuilding('turret','fire',cx,cy,'meridian');o.sfxBuilding=last().voice;
      A.reset(true);A.sfxUnit('nosuchunit','die',cx,cy,'aurora');o.sfxUnitGeneric=last().voice;
      o.cinePlays=(A.reset(true),A.cineSfx('whoosh'));o.cineRow=last();
      o.unknown=call('definitely_not_a_sound').r;
      o.gen1=A.resolve('tab').id;A.registerVoice('ui.tab',simple(800));o.gen2=A.resolve('tab').id;
      A.registerVoice('global.click',simple(900),{fallback:false});o.override=A.voices({info:true}).find(v=>v.id==='global.click').fallback===false&&A.resolve('click').id==='global.click';
      o.skill=(A.registerVoice('skill.barrage',simple(120)),A.resolve('skill:barrage').id);
      A.reset(true);o.log=A.log.length;for(let i=0;i<260;i++)A.sfx('click');o.log2=A.log.length;
      const keys=Object.keys(A.log[0]).sort().join();o.keys=keys;
      return o;}""")
    ok(res['before'] == 'global.shoot' and res['derived'] == 'rifleman.fire.obsidian', f"resolution: generic before registration ({res['before']}), unit voice from who after ({res['derived']}) - cache invalidated")
    ok(res['otherFaction'] == 'global.shoot' and res['noWho'] == 'global.shoot', 'other faction / no `who` still fall back to the generic voice')
    ok(res['exact'] == 'rifleman.fire.obsidian', 'exact voice id wins')
    ok(res['entity'] == 'hauler.select.' + res['fac'] and res['entityRow']['faction'] == res['fac'], f"entity `who` -> faction from G.teams[team].faction ({res['fac']})")
    ok(res['unitDone'] == 'hauler.ready.' + res['fac'], "'done' on a unit means its `ready` event")
    ok(res['bldDone'] == 'hub.done.' + res['fac'] and res['bldBoom'] == 'hub.die.' + res['fac'], "building `who`: 'done' -> <type>.done, boomBig -> <type>.die")
    ok(res['creepFireFallsToMelee'] == res['creep'] + '.melee.wild' and res['creepFac'] == 'wild', f"creeps are faction 'wild'; fire falls back to melee ({res['creepFireFallsToMelee']})")
    ok(res['sfxUnit'] == 'rifleman.fire.obsidian' and res['sfxBuilding'] == 'global.bolt' and res['sfxUnitGeneric'] == 'global.boom', f"sfxUnit/sfxBuilding resolve ({res['sfxUnit']}, {res['sfxBuilding']}, {res['sfxUnitGeneric']})")
    ok(res['cinePlays'] is True and res['cineRow']['voice'] == 'cine.whoosh', 'cineSfx plays cine.<name> non-positionally')
    ok(res['unknown'] == 'nosound', 'an unknown name is a counted no-op')
    ok(res['gen1'] == 'global.tab' and res['gen2'] == 'ui.tab' and res['override'] is True and res['skill'] == 'skill.barrage', f"ui.<name> precedes global.<name>, re-registering an id replaces it, 'skill:x' maps to skill.x")
    ok(res['log'] == 0 and res['log2'] == 200 and res['keys'] == 'faction,name,pan,r,t,voice,vol,who,x,y', f"AUD.log is a 200-entry ring with {{t,name,voice,who,faction,x,y}} (+pan,vol,r): {res['keys']}")



# ================================================================== main run
with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])   # NO autoplay flag: the engine must cope with the real autoplay policy
    pg = new_page(b, URL)
    st = pg.evaluate("()=>__RTS.AUD.stats()")
    ok(st['state'] == 'none' and st['activeNodes'] == 0 and not pg.evaluate("()=>__RTS.AUD.stats().buses.sfx"), 'no AudioContext before a user gesture (lazy creation)')
    ok(pg.evaluate("()=>__RTS.AUD.sfx('click')") is False and pg.evaluate("()=>__RTS.AUD.stats().counters.noctx") >= 1 and pg.evaluate("()=>__RTS.AUD.stats().state") == 'none', 'sfx() before a gesture is a counted no-op and does not create the context')
    ok(pg.evaluate("()=>typeof __RTS.AUD.log.length==='number'&&__RTS.AUD.cap===40") and len(pg.evaluate("()=>__RTS.AUD.log")) >= 1, 'AUD hook exposed on window.__RTS (log, counters, cap, activeNodes)')
    # offline rendering needs no gesture and no context
    pre = pg.evaluate("async()=>{const r=await __RTS.AUD.render({sfx:'click'},0,44100);return [r.sampleRate,r.channels.length,__RTS.AUD.stats().state];}")
    ok(pre == [44100, 2, 'none'], f'audioRender works before any gesture and leaves the live context uncreated {pre}')

    pg.mouse.click(400, 300); pg.wait_for_timeout(250)   # the first gesture (nothing else touched audio before)
    st = pg.evaluate("()=>__RTS.AUD.stats()")
    ok(st['state'] == 'running' and st['sampleRate'] > 0, f"context is created by the first user gesture and is running ({st['state']}, {st['sampleRate']} Hz)")

    # settings: Voice slider
    pg.click('#bSet'); pg.wait_for_timeout(200)
    ok(pg.evaluate("()=>{const e=document.getElementById('setVoice');return !!e&&+e.value===90&&__RTS.SET.voiceVol===0.9;}"), '#setVoice slider exists in Settings and shows SET.voiceVol (default 0.9)')
    pg.evaluate("()=>{const e=document.getElementById('setVoice');e.value=37;e.dispatchEvent(new Event('input',{bubbles:true}));}")
    ok(pg.evaluate("()=>__RTS.SET.voiceVol")== 0.37 and pg.evaluate("()=>JSON.parse(localStorage.getItem('orbital_dominion_v4_settings')).voiceVol")== 0.37, 'moving #setVoice sets SET.voiceVol and saves it')
    pg.evaluate("()=>{const e=document.getElementById('setVoice');e.value=55;e.dispatchEvent(new Event('input',{bubbles:true}));}"); pg.wait_for_timeout(300)
    v = pg.evaluate("()=>__RTS.AUD.stats().buses")
    ok(abs(v['voice'] - 0.55 * 1.8) < 0.02 and abs(v['sfx'] - 0.8) < 0.02 and abs(v['music'] - 0.45) < 0.02, f"voice bus follows #setVoice (x1.8 mix trim VBOOST, docs/AUDIO_V4.md), sfx/music buses follow their own sliders {v}")
    pg.evaluate("()=>{const e=document.getElementById('setVoice');e.value=90;e.dispatchEvent(new Event('input',{bubbles:true}));}")
    pg.evaluate("()=>__RTS.showOverlay('menu')")
    pg.click('#bStart'); pg.wait_for_timeout(1200)
    ok(pg.evaluate("()=>!!(__RTS.G&&__RTS.G.units.length>0&&!__RTS.ui.demo)"), 'match started (sound enabled, autoplay policy NOT bypassed)')
    quiet_engine(pg)

    # vocabulary
    cov = pg.evaluate("""([g,c])=>{const A=__RTS.AUD;return{g:g.filter(n=>!A.resolve(n)),c:c.filter(n=>!A.voices().includes('cine.'+n))};}""", [SFX_GLOBAL, CINE_SFX])
    ok(not cov['g'] and not cov['c'], f'every SFX_GLOBAL name resolves to a voice and every CINE_SFX has cine.<name> (missing: {cov})')
    ok(set(pg.evaluate("()=>__RTS.AUD.voices({prefix:'global.'})")) >= {'global.' + n for n in LEGACY}, 'a generic fallback exists for every legacy name ' + ','.join(LEGACY[:6]) + '...')

    # offline gates (before test voices are registered)
    # STALE-TEST FIX: the full build replaces the generic fallback voices by content voices (81_sfx_*), so the fallback gates (chk_gates) run on the engine-only page
    # below. Here: the content layer is in place and every legacy / SFX_GLOBAL / CINE_SFX name still resolves (above).
    ci = pg.evaluate("()=>{const A=__RTS.AUD,st=A.stats(),all=A.voices({info:true});return{n:all.length,content:all.filter(v=>!v.fallback).length,fb:all.filter(v=>v.fallback).length,cue:st.renderers.includes('cue'),legacy:st.legacyScore};}")
    ok(ci['content'] > 200 and ci['cue'] and ci['legacy'] is False, f'full build: content voices registered at load ({ci["content"]} content / {ci["fb"]} still-generic voices), the music module owns the score (cue renderer, fallback score off)')
    chk_determinism(pg, ok); chk_seed(pg, ok); chk_pure(pg, ok)
    kit = pg.evaluate("""async()=>{const A=__RTS.AUD,def={dur:0.8,cls:'fire',gain:0.2,layers:[
        {k:'osc',type:'sawtooth',f:220,unison:{n:3,spread:20,pan:0.7},pitch:{from:260,to:200},filter:[{type:'lp',f0:3000,f1:600,q:2},{type:'peak',f0:800,q:2,g:4}],drive:0.5,vib:{f:5,cents:15},trem:{f:7,depth:0.3},env:{a:0.01,d:0.2,s:0.5,r:0.2},dur:0.7,send:{rev:0.2,room:'plate',dly:0.1}},
        {k:'osc',harm:[1,0.5,0.3,0.2],f:330,rm:{f:90,depth:0.8},pan:-0.5,env:{d:0.5},pitch:{st:-5}},
        {k:'fm',f:440,ratio:3.5,idx:{from:3,to:0.1},delay:0.05,env:{d:0.4},send:{rev:0.3,room:'air'}},
        {k:'pluck',f:392,t60:0.5,damp:0.3,bright:0.8,delay:0.1,env:{d:0.5}},{k:'pluck',mode:'modal',f:200,ratios:[1,2.7,5.1],t60:0.5,delay:0.1,env:{d:0.5}},
        {k:'formant',src:'sawtooth',f:120,vowel:'a',to:'u',morph:0.4,delay:0.2,dur:0.5,env:{a:0.05,s:0.7,d:0.1,r:0.1},vib:{f:5,cents:20}},
        {k:'noise',color:'brown',rate:1.5,filter:{type:'hp',f0:200},only:[0,1,2],skip:[7],delay:0.3,env:{d:0.3},send:{dly:0.2}}]};
      const a=await A.render({voice:def},1.5,44100),b=await A.render({voice:def},1.5,44100),m=A.analyse(a.channels,a.sampleRate);
      let bad=null;try{await A.render({voice:{dur:0.2,layers:[{k:'wobble'}]}},0,44100);}catch(e){bad=String(e);}
      let bad2=null;try{A.registerVoice('x.bad',{dur:0.2,layers:[]});}catch(e){bad2=String(e);}
      return{m,same:A.hash(a.channels,true)===A.hash(b.channels,true),bad,bad2};}""")
    m = kit['m']
    ok(kit['same'] and m['finite'] and 0.01 < m['peak'] <= 0.98 and m['dc'] < 0.01 and m['tailDb'] < -60 and m['first'] < 0.05, f"a DSL voice using every kit feature (osc/unison/harm/ring/fm/ks+modal pluck/formant/filters/drive/vib/trem/sends) renders clean + deterministic (peak {m['peak']:.3f}, active {m['activeDb']:.1f} dB)")
    ok(kit['bad'] is not None and kit['bad2'] is not None, 'a malformed voice is rejected: unknown layer kind makes the render reject, an empty layers[] throws in registerVoice')
    # sim state untouched by rendering
    st = pg.evaluate("""async()=>{const R=__RTS,A=R.AUD,G=R.G;const hs=()=>{let h=2166136261;const f=v=>{h^=Math.round(v*100)|0;h=Math.imul(h,16777619);};for(const u of G.units){f(u.x);f(u.y);f(u.hp);}for(const b of G.buildings){f(b.x);f(b.y);f(b.hp);}f(G.time*1000);return h>>>0;};
      const a=[G.tick,hs()];for(const id of ['global.boom','global.heal','cine.gong'])await A.render({sfx:id},0,44100);await A.render({cue:'__none__'}).catch(()=>0);const b=[G.tick,hs()];
      G.paused=false;R.step();const c=[G.tick,hs()];G.paused=true;return{a,b,c};}""")
    ok(st['a'] == st['b'] and st['c'] != st['b'], f"audio rendering leaves sim state untouched (G.tick, state hash {st['a']} == {st['b']}); control: one sim step changes it ({st['c']})")

    # live checks
    chk_kit(pg, ok)
    chk_pan(pg, ok); chk_mute(pg, ok); chk_cap(pg, ok); chk_spam(pg, ok); chk_cost(pg, ok); chk_orphan(pg, ok); chk_hooks(pg, ok)

    # lifecycle (last live test: 75_platform pauses the match when hidden)
    lc = pg.evaluate("""async()=>{const A=__RTS.AUD,sl=ms=>new Promise(r=>setTimeout(r,ms)),o={};
      const hide=v=>{Object.defineProperty(document,'hidden',{value:v,configurable:true});document.dispatchEvent(new Event('visibilitychange'));};
      o.s0=A.stats().state;hide(true);await sl(250);o.s1=A.stats().state;const n0=A.activeNodes;A.reset(true);A.sfx('click');A.sfx('shoot');o.hiddenRow=A.log.slice(-1)[0].r;o.grew=A.activeNodes-n0;
      hide(false);await sl(500);o.s2=A.stats().state;A.reset(true);o.back=A.sfx('click');o.backRow=A.log.slice(-1)[0];o.nodesLater=A.activeNodes;return o;}""")
    ok(lc['s0'] == 'running' and lc['s1'] == 'suspended' and lc['s2'] == 'running', f"visibility: hidden -> suspend, visible -> resume {lc['s0']}/{lc['s1']}/{lc['s2']}")
    ok(lc['hiddenRow'] == 'suspended' and lc['grew'] == 0 and lc['back'] is True, 'no voices are queued while the context is suspended; sound is back after resume ' + json.dumps(lc.get('backRow')))

    # ------------------------------------------------------------ mutation checks
    # ------------------------------------------------------------ engine-only page: the contracts that exist BEFORE any content module registers
    html = None
    if URL.startswith('file:'):
        html = pathlib.Path(unquote(urlparse(URL).path)).read_text(encoding='utf-8')
    else:
        try: html = urllib.request.urlopen(URL, timeout=10).read().decode('utf-8')
        except Exception as e: print('cannot fetch the page for the mutation checks:', e)
    if html is not None:
        tmp0 = tempfile.mkdtemp(prefix='od_audio_eng_'); ef = pathlib.Path(tmp0) / 'engine.html'; ef.write_text(engine_html(html), encoding='utf-8')
        ep = new_page(b, ef.as_uri(), nocontent=True)
        ok(ep.evaluate("()=>{const A=__RTS.AUD,st=A.stats();return A.voices({info:true}).every(v=>v.fallback)&&!st.renderers.includes('cue')&&st.legacyScore===true;}"), 'engine-only page: only the 80_audio.js fallback voices exist, no cue renderer, the fallback score is on')
        lg = ep.evaluate("""()=>{const A=__RTS.AUD,o={};o.on=A.stats().legacyScore;A.legacyScore(false);o.off=A.stats().legacyScore;A.legacyScore(true);o.back=A.stats().legacyScore;
          A.registerRenderer('cue',()=>null);o.afterCue=A.stats().legacyScore;A.legacyScore(false);return o;}""")
        ok(lg['on'] is True and lg['off'] is False and lg['back'] is True and lg['afterCue'] is False, f'the fallback score plays until a music module registers a cue renderer, then steps aside {lg}')
        go_live(ep)
        chk_gates(ep, ok)
        chk_resolution(ep, ok)
        ep.close()

    ok(html is not None, 'page source available for mutation checks')
    MUT = [  # name, old, new, check, needs live page
        ('cap broken', "else if(S.nodes+v.est>AUD.cap*LIMF[v.prio]){C.capped++;return'cap';}", "else if(false){C.capped++;return'cap';}", lambda pg, rec: chk_cap(pg, rec, False), True),
        ('render seed not deterministic', "A.s=(v.h^Math.imul(seed+1,0x9E3779B1))|0;", "A.s=(v.h^Math.imul(seed+1+(performance.now()*1e3|0),0x9E3779B1))|0;", chk_determinism, False),
        ('noise offset uses Math.random', "go(A,s,t0,end+0.02,A.rng()*(NN/x.sampleRate-0.1));", "go(A,s,t0,end+0.02,Math.random()*(NN/x.sampleRate-0.1));", chk_pure, False),
        ('every voice silent', "A.vg=v.gain*p.vol;p.t0=0;A.t0=0;", "A.vg=0;p.t0=0;A.t0=0;", chk_gates, False),
        ('unit voice from `who` never derived', "if(W.ty&&W.fa){const ev=EVN[name];", "if(false&&W.ty&&W.fa){const ev=EVN[name];", chk_resolution, True),
        ('pan sign flipped', "POS.pan=cl((x-cx)/hv,-1,1)*0.8;", "POS.pan=cl((x-cx)/hv,-1,1)*-0.8;", chk_pan, True),
        ('mute ignored', "else if(muted){r='muted';C.muted++;}", "else if(false){r='muted';C.muted++;}", chk_mute, True),
        ('ring-mod depth ignored', "g.gain.value=1-dp;c.type=R.type||'sine'", "g.gain.value=1;c.type=R.type||'sine'", chk_kit, False),
        ('pitch glide target ignored', "if(b!==a){const tt=t+(P.t!==undefined?P.t:len);", "if(false){const tt=t+(P.t!==undefined?P.t:len);", chk_kit, False),
        ('orphaned nodes never retired', "function sweepNodes(now,force){\n  if(!AC||", "function sweepNodes(now,force){\n  if(true||!AC||", chk_orphan, True),
        ('spam merge removed', "if(v.gap>0&&now-v.last<v.gap){v.pend++;C.merged++;return'merge';}", "if(false){v.pend++;C.merged++;return'merge';}", chk_spam, True),
    ]
    ENGINE_MUTS = {'every voice silent', 'unit voice from `who` never derived'}   # these checks only make sense before content registers -> mutate the engine-only variant
    MATCH_MUTS = {'unit voice from `who` never derived'}                          # need real G.units / G.teams, not just the demo
    if html is not None:
        tmp = tempfile.mkdtemp(prefix='od_audio_mut_')
        for name, old, new, check, live in MUT:
            base = engine_html(html) if name in ENGINE_MUTS else html
            n = base.count(old)
            if n != 1:
                ok(False, f'mutation "{name}": snippet occurs {n} times in the build (expected 1) - the mutation no longer targets real code'); continue
            f = pathlib.Path(tmp) / 'mut.html'; f.write_text(base.replace(old, new), encoding='utf-8')
            mp = new_page(b, f.as_uri(), track=False, boot='live' if live else 'lite', nocontent=name in ENGINE_MUTS)
            if live: go_live(mp, fast=name not in MATCH_MUTS)
            got = []
            try: check(mp, lambda c, m: got.append((c, m)))
            except Exception as e: got.append((False, 'exception ' + str(e)[:80]))
            mp.close()
            killed = any(not c for c, m in got)
            ok(killed, f'MUTATION "{name}" is caught: ' + ('; '.join(m[:90] for c, m in got if not c)[:150] if killed else 'NOT CAUGHT (the test cannot fail)'))
            if name == 'every voice silent' and killed: pass
    b.close()

ok(not reqs, f'zero network requests {reqs[:3]}')
ok(not errs, f'zero page errors / console errors / warnings {errs[:3]}')
print(f'{"FAILED" if fails else "ALL OK"} ({time.time()-T0:.0f} s, {len(fails)} failures)')
sys.exit(1 if fails else 0)
