/* =========================================================================
   AUDIO ENGINE — context abstraction (live + offline), bus graph, synth kit, voice DSL, registry, dispatcher,
   polyphony governance (v5: no speech of any kind; music and sound effects only). Contract: docs/AUDIO_SPEC.md §1–2 and §8 (engine reference).
   Everything private lives inside AUDIO (a closure) so this file cannot collide with other modules' names.
   Public globals: AC muted busSfx busMusic musicFx AUD KIT audioInit applyVolumes toggleMute sfx sfxUnit sfxBuilding
                   registerVoice registerRenderer audioVoices audioRender audioStats audioPlay audioDuck audioBus audioA audioDelay
                   audioOffline audioAnalyse audioHash audioClasses audioOnReady audioLegacyScore audioMeter tone noiseBurst
   No sim state is read except G.teams[].faction (faction of an entity) and cam/VW/VH (positional pan). Never Math.random/Date in a voice.
   ========================================================================= */
let AC=null,muted=false,busSfx=null,busMusic=null,musicFx=null;   // AC: the live AudioContext (75_platform reads it); the bus* aliases mirror the new buses
const AUD={cap:40,capMusic:24,peakNodes:0,lastError:'',
  counters:{calls:0,played:0,merged:0,poly:0,capped:0,culled:0,muted:0,noctx:0,suspended:0,skipped:0,nosound:0,errors:0,renders:0}};   // test hooks; filled in below
const KIT={};   // synth kit (osc/noise/fm/pluck/formant layers, envelopes, filters, sends); filled in below
const AUDIO=(function(){
'use strict';
const C=AUD.counters;
const BUSES=['sfx','ui','amb','music'],BIX={sfx:0,ui:1,amb:2,music:3},BM=3;   // BM: index of the music bus
/* rooms: IR length, RT, damping, pre-delay, and the RETURN gain calibrated (measured, see tests/e2e/e2e_audio_engine.py) so that send 1.0 returns wet energy ~ dry energy for every room */
/* plate/hall/air are the content rooms; open/canyon/cave are the ROOM PRESETS of the distance send (audioRoom(name)): open = a field (short, dark, 20 ms pre-delay), canyon = hard walls (long pre-delay slap), cave = long and dull.
   `ret` of the three newer rooms is the measured return that makes send 1.0 return wet energy = dry energy (tests/e2e/e2e_audio_mix.py, 'room calibration'). */
const ROOMS={plate:0,hall:1,air:2,open:3,canyon:4,cave:5},NROOM=8,RROOM={plate:{len:0.9,rt:0.7,dm:2.6,pre:0.003,ret:5.37},hall:{len:2.0,rt:1.7,dm:1.6,pre:0.012,ret:2.88},air:{len:3.2,rt:2.9,dm:1.0,pre:0.02,ret:2.16},
  open:{len:1.1,rt:0.8,dm:2.4,pre:0.02,ret:3.78},canyon:{len:2.4,rt:2.0,dm:1.4,pre:0.06,ret:2.47},cave:{len:3.6,rt:3.2,dm:0.8,pre:0.015,ret:2.03}};
const DLYRET=1.57;   // delay send 1.0: echo train energy ~ -3 dB re dry
/* loudness classes: target RMS dBFS (active window, unit gain), priority, bus, default cooldown (ms), polyphony per voice id */
const CLS={
  ui:{db:-26,prio:1,bus:'ui',gap:30,poly:3},fire:{db:-22,prio:2,bus:'sfx',gap:45,poly:5},impact:{db:-18,prio:3,bus:'sfx',gap:60,poly:4},
  boom:{db:-14,prio:4,bus:'sfx',gap:90,poly:3,range:1.5},
  alert:{db:-17,prio:7,bus:'ui',gap:400,poly:2,duck:0.35},music:{db:-20,prio:0,bus:'music',gap:0,poly:0},
  amb:{db:-30,prio:0,bus:'amb',gap:1000,poly:1}};
const PRIO={amb:0,ui:1,fire:2,impact:3,boom:4,hero:5,alert:7,music:0};
const LIMF=[0.35,0.9,0.6,0.7,0.8,0.9,1,1];   // admission limit as a fraction of AUD.cap, indexed by priority (ui keeps headroom on purpose: button feedback must survive a big fight)
const VARY={ui:{pitch:0.01},fire:{pitch:0.05,filter:0.12,gain:0.08},impact:{pitch:0.05,filter:0.10,gain:0.06},boom:{pitch:0.04,filter:0.10},alert:{},amb:{},music:{}};
const FACP={meridian:1,obsidian:0.84,aurora:1.22,wild:0.72};   // pitch bias of GENERIC fallback voices per faction (content voices replace this with real timbres)
const VOICES=new Map(),RENDERERS={},READY=[];
let DER=Object.create(null),GEN=Object.create(null),FG=Object.create(null),legacyOn=true;
const S={buses:[],A:[],cache:null,nodes:0,nodesM:0,master:null,comp:null,an:null,anBuf:null,fresh:true,anchor:null,hidden:false,spoken:0};
const BSET=new Set(typeof BUILDING_TYPES!=='undefined'?BUILDING_TYPES:[]);
const FACS=typeof SFX_FACTIONS!=='undefined'?SFX_FACTIONS:['meridian','obsidian','aurora','wild'];
const cl=(v,a,b)=>v<a?a:(v>b?b:v);
const noop=()=>{};
function fnv(s){let h=0x811C9DC5;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function hz(n){
  if(typeof n==='number')return 440*Math.pow(2,(n-69)/12);
  const m=/^([A-Ga-g])([#b]?)(-?\d)$/.exec(n);if(!m)throw new Error('KIT.hz: bad note '+n);
  const base={c:0,d:2,e:4,f:5,g:7,a:9,b:11}[m[1].toLowerCase()]+(m[2]==='#'?1:m[2]==='b'?-1:0);
  return 440*Math.pow(2,((+m[3]+1)*12+base-69)/12);
}

/* ------------------------------------------------------------------ noise, impulse responses, Karplus–Strong (context-independent data) */
const NN=131072,NDATA={};
function noiseData(color){
  let d=NDATA[color];if(d)return d;
  d=new Float32Array(NN);const r=mulberry32(color==='white'?0xA11CE:color==='pink'?0xB105E:0xC0FFEE);
  if(color==='pink'){let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;for(let i=0;i<NN;i++){const w=r()*2-1;b0=0.99886*b0+w*0.0555179;b1=0.99332*b1+w*0.0750759;b2=0.969*b2+w*0.153852;b3=0.8665*b3+w*0.3104856;b4=0.55*b4+w*0.5329522;b5=-0.7616*b5-w*0.016898;d[i]=b0+b1+b2+b3+b4+b5+b6+w*0.5362;b6=w*0.115926;}}
  else if(color==='brown'){let b=0;for(let i=0;i<NN;i++){b=(b+0.02*(r()*2-1))/1.02;d[i]=b;}}
  else for(let i=0;i<NN;i++)d[i]=r()*2-1;
  let m=0,sq=0;for(let i=0;i<NN;i++)m+=d[i];m/=NN;for(let i=0;i<NN;i++){d[i]-=m;sq+=d[i]*d[i];}
  const k=0.3/Math.sqrt(sq/NN);for(let i=0;i<NN;i++)d[i]=cl(d[i]*k,-1,1);   // every colour: RMS 0.3 (-10.5 dBFS), clipped at +-1
  return NDATA[color]=d;
}
const IRC={};
function irData(room,sr){
  const key=room+'@'+sr;let d=IRC[key];if(d)return d;
  const R=RROOM[room],n=Math.floor(R.len*sr),ch=[new Float32Array(n),new Float32Array(n)];
  for(let c=0;c<2;c++){
    const out=ch[c],rg=mulberry32(0x5EED+c*7919+R.len*1000|0);let y=0;
    for(let i=0;i<n;i++){const t=i/sr;if(t<R.pre)continue;const a=Math.max(0.06,0.95*Math.exp(-t*R.dm*1.4));y+=a*((rg()*2-1)-y);out[i]=y*Math.exp(-6.9*t/R.rt)*Math.min(1,(t-R.pre)/0.004);}
    for(let k=0;k<7;k++){const ti=Math.floor((R.pre+0.006+rg()*0.05*(R.len>1?1.4:0.8))*sr);if(ti<n)out[ti]+=(rg()<0.5?-1:1)*(0.55-k*0.05);}
  }
  return IRC[key]={L:ch[0],R:ch[1],n};
}
const KSD=new Map();
function ksData(sr,N,t60,damp,bright,len){
  const key=sr+'|'+N+'|'+t60+'|'+damp+'|'+bright+'|'+len;let d=KSD.get(key);if(d)return d;
  const n=Math.ceil(len*sr),out=new Float32Array(n),line=new Float32Array(N),r=mulberry32((Math.imul(N,2654435761)^Math.round(bright*10))>>>0),b=0.15+0.85*bright;
  let y=0,mean=0;for(let i=0;i<N;i++){y+=b*((r()*2-1)-y);line[i]=y;mean+=y;}mean/=N;for(let i=0;i<N;i++)line[i]-=mean;
  const g=Math.pow(10,-3*N/(sr*t60));let idx=0,prev=line[N-1],pk=1e-9;
  for(let i=0;i<n;i++){const cur=line[idx];out[i]=cur;line[idx]=g*((1-damp)*cur+damp*0.5*(cur+prev));prev=cur;if(++idx>=N)idx=0;const a=Math.abs(cur);if(a>pk)pk=a;}
  const k=1/pk;for(let i=0;i<n;i++)out[i]*=k;
  if(KSD.size>96)KSD.delete(KSD.keys().next().value);
  KSD.set(key,out);return out;
}

/* ------------------------------------------------------------------ per-context caches + A handle */
function mkCache(){return{noise:{},ir:{},rev:[],dly:[],waves:new WeakMap(),ks:new Map(),sinks:new Map(),dlyT:0.3125,dlyFb:0.36};}
/* Offline determinism: Chromium sums the inputs of a node in pointer-hash order, and float addition is not associative, so any node with >= 3 inputs
   renders differently (1 ulp) from run to run. A 2-input add is commutative, hence exact. So offline, every mix point is a chain of 2-input adders:
   reading A.dest / A.out (or a send input) returns a fresh unity-gain LEAF with exactly one input of its own, and flushSinks() joins the chain to the real node. */
function leaf(A,target){
  const c=A.cache;let sk=c.sinks.get(target);if(!sk){sk={target,head:null};c.sinks.set(target,sk);}
  const g=A.ctx.createGain();
  if(!sk.head)sk.head=g;else{const j=A.ctx.createGain();sk.head.connect(j);g.connect(j);sk.head=j;}
  return g;
}
function flushSinks(A){for(const sk of A.cache.sinks.values())if(sk.head){sk.head.connect(sk.target);sk.head=null;}A.cache.sinks.clear();}
const lk=(A,n)=>A.off?leaf(A,n):n;
function mkA(){
  const A={ctx:null,_dest:null,_out:null,t0:0,off:false,bus:0,cache:null,inst:null,dur:0,vg:1,v:null,s:0,rng:null,p:null};
  Object.defineProperty(A,'dest',{get(){return A.off?leaf(A,A._dest):A._dest;},set(v){A._dest=v;},enumerable:true});
  Object.defineProperty(A,'out',{get(){return A.off?leaf(A,A._out):A._out;},set(v){A._out=v;},enumerable:true});
  A.rng=function(){let t=A.s=(A.s+0x6D2B79F5)|0;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
  A.p={vol:1,pan:0,rng:A.rng,faction:'meridian',pitch:1,fmul:1,variant:0,seed:0,t0:0};
  return A;
}
const AP=[];let apd=0;
function takeA(){return AP[apd++]||(AP[apd-1]=mkA());}
const IP=[];
function instGet(v){const i=IP.pop()||{n:0,v:null,out:null,m:false,x:[]};i.n=0;i.v=v;i.out=null;i.m=false;return i;}
function instFree(i){
  if(i.out){try{i.out.disconnect();}catch(e){}i.out=null;}
  const x=i.x;for(let k=0;k<x.length;k++){try{x[k].disconnect();}catch(e){}}x.length=0;   // layer gains / pans / send gains: cut them from the bus and the reverb input
  if(i.v)i.v.live--;i.v=null;IP.push(i);
}
const trk=(A,n)=>{if(!A.off){const i=A.inst;if(i&&i.v)i.x.push(n);}};   // remember a tail node of this instance so it is disconnected when the instance ends
function srcEnded(){
  const i=this._i;if(!i)return;this.onended=null;this._i=null;try{this.disconnect();}catch(e){}
  if(i.m)S.nodesM--;else S.nodes--;
  if(--i.n===0)instFree(i);
}
/* A source whose output was cut from the graph before it started (music killPlayer() disconnects a cue's gains while notes in its look-ahead are still scheduled) is never pulled by the
   renderer, so it never fires `ended` and would stay in the node budget for ever. Every live source is remembered with its stop time; sweepNodes() (throttled, called from stats / the
   cap check) retires the ones that are more than 0.75 s past their stop time. */
const LIVEN=[];let sweepT=0;
function sweepNodes(now,force){
  if(!AC||!LIVEN.length||AC.state!=='running'||(!force&&now-sweepT<400))return;sweepT=now;
  const lim=AC.currentTime-0.75;let w=0;
  for(let k=0;k<LIVEN.length;k++){const s=LIVEN[k];if(!s._i)continue;if(s._t1<lim){srcEnded.call(s);continue;}LIVEN[w++]=s;}
  LIVEN.length=w;
}
/* start+stop a source node and (live) account for it; every source of every voice goes through here */
function go(A,s,t0,t1,off){
  if(off===undefined)s.start(t0);else s.start(t0,off);
  s.stop(t1);
  if(!A.off){const i=A.inst;s.onended=srcEnded;s._i=i;s._t1=t1;LIVEN.push(s);i.n++;if(i.m)S.nodesM++;else{S.nodes++;if(S.nodes>AUD.peakNodes)AUD.peakNodes=S.nodes;}}
}
const cn=(a,b)=>{a.connect(b);return b;};
function noiseBuf(A,color){
  const c=A.cache;let b=c.noise[color];
  if(!b){b=A.ctx.createBuffer(1,NN,A.ctx.sampleRate);b.copyToChannel(noiseData(color),0);c.noise[color]=b;}
  return b;
}
function getRev(A,room){
  const c=A.cache,ri=ROOMS[room||'hall'];if(ri===undefined)throw new Error('unknown reverb room '+room);
  const ix=A.bus*NROOM+ri;let r=c.rev[ix];if(r)return lk(A,r);
  const x=A.ctx,sr=x.sampleRate;let buf=c.ir[ri];
  if(!buf){const d=irData(room||'hall',sr);buf=x.createBuffer(2,d.n,sr);buf.copyToChannel(d.L,0);buf.copyToChannel(d.R,1);c.ir[ri]=buf;}
  const inG=x.createGain(),conv=x.createConvolver(),ret=x.createGain();conv.buffer=buf;ret.gain.value=RROOM[room||'hall'].ret;
  inG.connect(conv);conv.connect(ret);ret.connect(A.dest);c.rev[ix]=inG;return lk(A,inG);
}
function getDly(A){
  const c=A.cache;let d=c.dly[A.bus];if(d)return lk(A,d.inG);
  const x=A.ctx,inG=x.createGain(),dl=x.createDelay(1.5),fb=x.createGain(),lp=x.createBiquadFilter(),ret=x.createGain();
  dl.delayTime.value=c.dlyT;fb.gain.value=c.dlyFb;lp.type='lowpass';lp.frequency.value=2200;ret.gain.value=DLYRET;
  inG.connect(dl);dl.connect(lp);lp.connect(fb);fb.connect(dl);lp.connect(ret);ret.connect(A.dest);
  c.dly[A.bus]={inG,dl,fb};return lk(A,inG);
}
function sendOut(A,node,sd){
  const x=A.ctx;
  if(sd.rev>0){const g=x.createGain();g.gain.value=sd.rev;node.connect(g);g.connect(getRev(A,sd.room));trk(A,g);}
  if(sd.dly>0){const g=x.createGain();g.gain.value=sd.dly;node.connect(g);g.connect(getDly(A));trk(A,g);}
}

/* ------------------------------------------------------------------ kit: envelopes, pitch, filters, shapers, layers */
function envEnd(e,len){
  const a=e&&e.a>0.002?e.a:0.002,s=e&&e.s>0?e.s:0,d=e&&e.d!==undefined?e.d:Math.max(0.005,len-a);
  if(s>0){const r=e.r!==undefined?Math.max(e.r,0.004):0.02;return Math.max(a+d,len-r)+r+0.004;}
  return a+d+0.004;
}
/* attack >= 2 ms (linear from 0), exponential decay to the sustain level (0 = percussive: decays to -80 dB), release; returns the absolute end time */
function envApply(g,t,peak,e,len){
  const a=e&&e.a>0.002?e.a:0.002,s=e&&e.s>0?e.s:0,d=e&&e.d!==undefined?e.d:Math.max(0.005,len-a);
  g.setValueAtTime(0,t);g.linearRampToValueAtTime(peak,t+a);
  let te;
  if(s>0){const r=e.r!==undefined?Math.max(e.r,0.004):0.02,sl=Math.max(peak*s,0.0001),tr=Math.max(t+a+d,t+len-r);
    g.exponentialRampToValueAtTime(sl,t+a+d);g.setValueAtTime(sl,tr);g.exponentialRampToValueAtTime(0.0001,tr+r);te=tr+r;}
  else{g.exponentialRampToValueAtTime(0.0001,t+a+d);te=t+a+d;}
  g.linearRampToValueAtTime(0,te+0.004);return te+0.004;
}
let PE0=0,PE1=0;
function pitchEnds(f,P){
  if(!P){PE0=PE1=f;return;}
  if(P.pts){PE0=P.pts[0][1];PE1=P.pts[P.pts.length-1][1];return;}
  PE0=P.from!==undefined?P.from:f;PE1=P.to!==undefined?P.to:(P.st!==undefined?PE0*Math.pow(2,P.st/12):PE0);
}
/* frequency automation: constant f, or glide {from,to,t,curve:'exp'|'lin',hold} / {st} (semitones from f) / {pts:[[t,hz],...]}; mul = pitch multiplier */
function pitchApply(par,t,f,P,len,mul){
  if(!P){par.setValueAtTime(Math.max(1,f*mul),t);return;}
  if(P.pts){const q=P.pts;par.setValueAtTime(Math.max(1,q[0][1]*mul),t+q[0][0]);
    for(let i=1;i<q.length;i++){const v=Math.max(1,q[i][1]*mul),tt=t+q[i][0];if(P.curve==='lin')par.linearRampToValueAtTime(v,tt);else par.exponentialRampToValueAtTime(v,tt);}return;}
  pitchEnds(f,P);const a=Math.max(1,PE0*mul),b=Math.max(1,PE1*mul),h=P.hold||0;
  par.setValueAtTime(a,t);if(h>0)par.setValueAtTime(a,t+h);
  if(b!==a){const tt=t+(P.t!==undefined?P.t:len);if(P.curve==='lin')par.linearRampToValueAtTime(b,tt);else par.exponentialRampToValueAtTime(b,tt);}
}
const FT={lp:'lowpass',hp:'highpass',bp:'bandpass',notch:'notch',peak:'peaking',ls:'lowshelf',hs:'highshelf',ap:'allpass'};
/* q is always LINEAR Q (0.707 = flat). WebAudio wants dB for lowpass/highpass, converted here. */
function mkFilter(A,t,f,len,p){
  const b=A.ctx.createBiquadFilter(),ty=FT[f.type]||f.type||'lowpass';b.type=ty;
  const q=f.q!==undefined?f.q:0.707;b.Q.value=(ty==='lowpass'||ty==='highpass')?20*Math.log10(Math.max(0.01,q)):q;
  if(f.g!==undefined)b.gain.value=f.g;
  const nyq=A.ctx.sampleRate*0.45,fm=p.fmul||1,f0=cl((f.f0!==undefined?f.f0:(f.f!==undefined?f.f:1000))*fm,10,nyq);
  b.frequency.setValueAtTime(f0,t);
  if(f.f1!==undefined){const f1=cl(f.f1*fm,10,nyq),tt=t+(f.t!==undefined?f.t:len);if(f.curve==='lin')b.frequency.linearRampToValueAtTime(f1,tt);else b.frequency.exponentialRampToValueAtTime(f1,tt);}
  return b;
}
const SHC=new Map();
function shaperCurve(amt){
  const k=Math.round(amt*20);let c=SHC.get(k);if(c)return c;
  const n=1025,kk=1+k*0.6,th=Math.tanh(kk);c=new Float32Array(n);for(let i=0;i<n;i++)c[i]=Math.tanh((i/(n-1)*2-1)*kk)/th;SHC.set(k,c);return c;
}
function mkShaper(A,amt){const w=A.ctx.createWaveShaper();w.curve=shaperCurve(amt);if(amt>0.5)w.oversample='2x';return w;}
function waveOf(A,L){
  const c=A.cache;let w=c.waves.get(L.harm);if(w)return w;
  const h=L.harm,re=new Float32Array(h.length+1),im=new Float32Array(h.length+1);for(let i=0;i<h.length;i++)im[i+1]=h[i];
  w=A.ctx.createPeriodicWave(re,im);c.waves.set(L.harm,w);return w;
}
function mkRing(A,t0,R,stop,n){
  const x=A.ctx,g=x.createGain(),dp=R.depth!==undefined?R.depth:1,c=x.createOscillator(),cg=x.createGain();
  g.gain.value=1-dp;c.type=R.type||'sine';c.frequency.value=R.f||100;cg.gain.value=dp;c.connect(cg);cg.connect(g.gain);go(A,c,t0,stop);n.connect(g);return g;
}
const peakOf=(A,L)=>(L.db!==undefined?Math.pow(10,L.db/20):(L.gain!==undefined?L.gain:1))*A.vg;
/* common tail of every layer: filters -> shaper -> ring-mod -> envelope gain -> tremolo -> pan -> out (+ sends). Returns the absolute end time. */
function chain(A,p,t0,L,len,s){
  const x=A.ctx,end=t0+envEnd(L.env,len);let n=s;
  const fl=L.filter;
  if(fl){if(Array.isArray(fl)){for(let i=0;i<fl.length;i++)n=cn(n,mkFilter(A,t0,fl[i],len,p));}else n=cn(n,mkFilter(A,t0,fl,len,p));}
  if(L.drive>0)n=cn(n,mkShaper(A,L.drive));
  if(L.rm)n=mkRing(A,t0,L.rm,end+0.02,n);
  const g=x.createGain();n.connect(g);envApply(g.gain,t0,peakOf(A,L),L.env,len);n=g;
  if(L.trem){const T=L.trem,tg=x.createGain(),lf=x.createOscillator(),lg=x.createGain(),dp=T.depth!==undefined?T.depth:0.5;
    tg.gain.value=1-dp/2;lf.frequency.value=T.f||6;lg.gain.value=dp/2;lf.connect(lg);lg.connect(tg.gain);go(A,lf,t0,end+0.02);n.connect(tg);n=tg;}
  if(L.pan!==undefined&&x.createStereoPanner){const pn=x.createStereoPanner();pn.pan.value=cl(p.pan+L.pan,-1,1);n.connect(pn);pn.connect(A.sp||A.dest);trk(A,pn);trk(A,n);}
  else{n.connect(A.out);trk(A,n);}
  if(L.send)sendOut(A,n,L.send);
  return end;
}
const mkO=(x,L,w)=>{const o=x.createOscillator();if(w)o.setPeriodicWave(w);else o.type=L.type||'sine';return o;};
function lenOf(A,L,dl){return L.dur!==undefined?L.dur:Math.max(0.02,A.dur-dl);}
function kOsc(A,t,L,p){
  const x=A.ctx,dl=L.delay||0,t0=t+dl,len=lenOf(A,L,dl),U=L.unison,n=U?Math.max(1,U.n|0):1,w=L.harm?waveOf(A,L):null;
  if(L.gain===0)return;
  const mix=n>1?x.createGain():null;if(mix)mix.gain.value=1/Math.sqrt(n);
  const o0=n===1?mkO(x,L,w):null,end=chain(A,p,t0,L,len,mix||o0),stop=end+0.02;
  let lg=null;
  if(L.vib){const lf=x.createOscillator();lg=x.createGain();lf.frequency.value=L.vib.f||5.5;lg.gain.value=L.vib.cents||18;lf.connect(lg);go(A,lf,t0,stop);}
  for(let i=0;i<n;i++){
    const o=o0||mkO(x,L,w),u=n>1?(i/(n-1)-0.5)*2:0;
    pitchApply(o.frequency,t0,L.f,L.pitch,len,p.pitch);
    o.detune.value=(L.detune||0)+u*(U?(U.spread||12):0);
    if(lg)lg.connect(o.detune);
    if(mix){if(U.pan&&x.createStereoPanner){const pn=x.createStereoPanner();pn.pan.value=u*U.pan;o.connect(pn);pn.connect(lk(A,mix));}else o.connect(lk(A,mix));}
    go(A,o,t0,stop);
  }
}
function kNoise(A,t,L,p){
  const x=A.ctx,dl=L.delay||0,t0=t+dl,len=lenOf(A,L,dl);if(L.gain===0)return;
  const s=x.createBufferSource(),buf=noiseBuf(A,L.color||'white');s.buffer=buf;s.loop=true;if(L.rate)s.playbackRate.value=L.rate;
  const end=chain(A,p,t0,L,len,s);go(A,s,t0,end+0.02,A.rng()*(NN/x.sampleRate-0.1));
}
function kFm(A,t,L,p){
  const x=A.ctx,dl=L.delay||0,t0=t+dl,len=lenOf(A,L,dl),car=x.createOscillator(),mod=x.createOscillator(),mg=x.createGain(),ratio=L.ratio||2,pp=p.pitch;if(L.gain===0)return;
  car.type=L.type||'sine';mod.type=L.mtype||'sine';
  pitchApply(car.frequency,t0,L.f,L.pitch,len,pp);pitchApply(mod.frequency,t0,L.f,L.pitch,len,pp*ratio);
  const ix=L.idx===undefined?2:L.idx,b0=typeof ix==='number'?ix:(ix.from!==undefined?ix.from:2),b1=typeof ix==='number'?ix:(ix.to!==undefined?ix.to:b0);
  pitchEnds(L.f,L.pitch);const d0=b0*PE0*pp*ratio,d1=b1*PE1*pp*ratio;
  mg.gain.setValueAtTime(Math.max(d0,0.01),t0);if(b1!==b0)mg.gain.exponentialRampToValueAtTime(Math.max(d1,0.01),t0+(typeof ix==='object'&&ix.t!==undefined?ix.t:len));
  mod.connect(mg);mg.connect(car.frequency);
  const end=chain(A,p,t0,L,len,car),stop=end+0.02;go(A,car,t0,stop);go(A,mod,t0,stop);
}
function ksBuf(A,N,t60,damp,bright,len){
  const c=A.cache,sr=A.ctx.sampleRate,key=sr+'|'+N+'|'+t60+'|'+damp+'|'+bright+'|'+len;let b=c.ks.get(key);
  if(!b){const d=ksData(sr,N,t60,damp,bright,len);b=A.ctx.createBuffer(1,d.length,sr);b.copyToChannel(d,0);c.ks.set(key,b);}
  return b;
}
/* pluck: mode 'ks' (Karplus–Strong string; t60 ring time s, damp 0..1 high-frequency loss, bright 0..1 excitation brightness) or 'modal' (struck bar/bell: n partials, ratios[], inh, tilt, t60, damp) */
function kPluck(A,t,L,p){
  const x=A.ctx,dl=L.delay||0,t0=t+dl,len=lenOf(A,L,dl),f=Math.max(30,(L.f||440)*p.pitch),t60=L.t60||0.4;if(L.gain===0)return;
  if(L.mode==='modal'){
    const np=L.n||(L.ratios?L.ratios.length:5),mix=x.createGain(),end=chain(A,p,t0,L,len,mix),dm=L.damp!==undefined?L.damp:0.7,tl=L.tilt!==undefined?L.tilt:0.6;
    for(let i=0;i<np;i++){
      const o=x.createOscillator(),g=x.createGain(),r=L.ratios?L.ratios[i]:(i+1)*(1+(L.inh||0)*i*i),td=t60/(1+dm*i),am=Math.pow(tl,i),te=Math.min(end,t0+td+0.01);
      o.frequency.value=Math.min(f*r,x.sampleRate*0.45);g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(am,t0+0.002);g.gain.exponentialRampToValueAtTime(0.0001,t0+0.002+td);
      o.connect(g);g.connect(lk(A,mix));go(A,o,t0,te+0.02);
    }
    return;
  }
  const sr=x.sampleRate,damp=Math.round((L.damp!==undefined?L.damp:0.5)*10)/10,bright=Math.round((L.bright!==undefined?L.bright:0.6)*10)/10,
    N=Math.max(2,Math.round(sr/f-0.5*damp)),rate=f*(N+0.5*damp)/sr,tq=Math.max(0.05,Math.round(t60*20)/20),lq=cl(Math.ceil(Math.max(len,0.1)*10)/10,0.1,4);
  const s=x.createBufferSource();s.buffer=ksBuf(A,N,tq,damp,bright,lq);
  if(L.pitch&&L.pitch.st){s.playbackRate.setValueAtTime(rate,t0);s.playbackRate.exponentialRampToValueAtTime(rate*Math.pow(2,L.pitch.st/12),t0+(L.pitch.t!==undefined?L.pitch.t:len));}else s.playbackRate.value=rate;
  const end=chain(A,p,t0,L,len,s);go(A,s,t0,Math.min(end,t0+lq/rate)+0.02);
}
const VOW={a:[[730,9,1],[1090,11,0.7],[2440,16,0.35]],e:[[530,9,1],[1840,13,0.6],[2480,16,0.35]],i:[[270,8,1],[2290,14,0.5],[3010,18,0.3]],o:[[570,9,1],[840,10,0.7],[2410,16,0.3]],
  u:[[300,8,1],[870,10,0.6],[2240,16,0.25]],ae:[[660,9,1],[1720,13,0.6],[2410,16,0.35]],uh:[[500,9,1],[1500,12,0.6],[2500,16,0.3]],er:[[490,9,1],[1350,12,0.7],[1690,14,0.5]]};
/* formant voice: source (src 'saw'|'square'|'triangle'|'noise') through parallel band-pass resonators = vowel; to/morph glides to another vowel; scale shifts all formants (<1 = bigger creature) */
function kFormant(A,t,L,p){
  const x=A.ctx,dl=L.delay||0,t0=t+dl,len=lenOf(A,L,dl),vw=L.formants||VOW[L.vowel||'a'],tv=L.to?VOW[L.to]:null,sc=(L.scale||1)*p.fmul;if(L.gain===0)return;
  if(!vw)throw new Error('formant: unknown vowel '+L.vowel);
  const mix=x.createGain();mix.gain.value=L.kq||2.5;
  const end=chain(A,p,t0,L,len,mix),stop=end+0.02;let src,lg=null;
  if(L.src==='noise'){src=x.createBufferSource();src.buffer=noiseBuf(A,'white');src.loop=true;}
  else{src=x.createOscillator();src.type=L.src==='square'?'square':L.src==='triangle'?'triangle':'sawtooth';pitchApply(src.frequency,t0,L.f||110,L.pitch,len,p.pitch);
    if(L.vib){const lf=x.createOscillator();lg=x.createGain();lf.frequency.value=L.vib.f||5.5;lg.gain.value=L.vib.cents||18;lf.connect(lg);lg.connect(src.detune);go(A,lf,t0,stop);}}
  for(let i=0;i<vw.length;i++){
    const b=x.createBiquadFilter(),g=x.createGain();b.type='bandpass';b.Q.value=vw[i][1];g.gain.value=vw[i][2];
    b.frequency.setValueAtTime(cl(vw[i][0]*sc,50,x.sampleRate*0.45),t0);
    if(tv&&tv[i])b.frequency.exponentialRampToValueAtTime(cl(tv[i][0]*sc,50,x.sampleRate*0.45),t0+(L.morph!==undefined?L.morph:len));
    src.connect(b);b.connect(g);g.connect(lk(A,mix));
  }
  if(L.src==='noise')go(A,src,t0,stop,A.rng()*(NN/x.sampleRate-0.1));else go(A,src,t0,stop);
}
function layerPlay(A,t,L,p){
  p=p||A.p;
  if(L.only&&L.only.indexOf(p.variant)<0)return;
  if(L.skip&&L.skip.indexOf(p.variant)>=0)return;
  switch(L.k||'osc'){case'osc':kOsc(A,t,L,p);break;case'noise':kNoise(A,t,L,p);break;case'fm':kFm(A,t,L,p);break;case'pluck':kPluck(A,t,L,p);break;case'formant':kFormant(A,t,L,p);break;
    default:throw new Error('unknown layer kind '+L.k);}
}
function notes(freqs,step,tpl){const o=[];for(let i=0;i<freqs.length;i++){const l=Object.assign({},tpl);l.f=typeof freqs[i]==='string'?hz(freqs[i]):freqs[i];l.delay=(tpl.delay||0)+i*step;o.push(l);}return o;}
Object.assign(KIT,{layer:layerPlay,osc:kOsc,noise:kNoise,fm:kFm,pluck:kPluck,formant:kFormant,env:envApply,envEnd,pitch:pitchApply,filter:mkFilter,shaper:mkShaper,noiseBuf,rev:getRev,dly:getDly,send:sendOut,go,hz,notes,
  midi:hz,rng:mulberry32,hash:fnv,vowels:VOW,wave:waveOf,ring:mkRing,peak:peakOf});

/* ------------------------------------------------------------------ registry */
function estLayer(L){
  const k=L.k||'osc';let n=1;
  if(k==='osc'){n=L.unison?Math.max(1,L.unison.n|0):1;if(L.vib)n++;}else if(k==='fm')n=2;else if(k==='pluck'&&L.mode==='modal')n=L.n||(L.ratios?L.ratios.length:5);else if(k==='formant'&&L.vib)n=2;
  if(L.rm)n++;if(L.trem)n++;return n;
}
function mkVoice(id,def,meta){
  const isFn=typeof def==='function';
  if(!def||(!isFn&&typeof def!=='object'))throw new Error('registerVoice '+id+': def must be an object or a function');
  const o=isFn?(meta||{}):(meta?Object.assign({},def,meta):def),cls=o.cls||'fire',K0=CLS[cls];
  if(!K0)throw new Error('registerVoice '+id+': unknown class '+cls);
  let est=o.est||4,tail=0.3;
  if(!isFn){
    if(!Array.isArray(def.layers)||!def.layers.length)throw new Error('registerVoice '+id+': layers[] required');
    if(!(def.dur>0))throw new Error('registerVoice '+id+': dur (seconds) required');
    est=0;
    for(let i=0;i<def.layers.length;i++){
      const L=def.layers[i];if(!L||typeof L!=='object'||['osc','noise','fm','pluck','formant'].indexOf(L.k||'osc')<0)throw new Error('registerVoice '+id+': layer '+i+' has unknown k "'+(L&&L.k)+'"');
      est+=estLayer(L);
      if(L.send){if(L.send.rev>0)tail=Math.max(tail,RROOM[L.send.room||'hall'].len);if(L.send.dly>0)tail=Math.max(tail,1.6);}
    }
  }else if(!(o.dur>0))throw new Error('registerVoice '+id+': function voices need meta.dur');
  const prio=cl(typeof o.prio==='number'?o.prio|0:(PRIO[o.prio||cls]!==undefined?PRIO[o.prio||cls]:K0.prio),0,7),seg=id.split('.');
  return{id,def:isFn?null:def,fn:isFn?def:null,layers:isFn?null:def.layers,dur:o.dur,cls,prio,bus:BIX[K0.bus],busName:K0.bus,gain:o.gain!==undefined?o.gain:1,
    gap:o.gap!==undefined?o.gap:K0.gap,poly:o.poly!==undefined?o.poly:K0.poly,range:o.range||K0.range||1,duck:o.duck!==undefined?o.duck:(K0.duck||0),
    vary:o.vary||VARY[cls]||{},variants:o.variants||(isFn?1:3),seq:!!o.seq,h:fnv(id),n:0,last:-1e9,pend:0,live:0,est,bad:0,mute:false,
    tail:o.tail!==undefined?o.tail:tail,fallback:!!o.fallback,fac:FACS.indexOf(seg[2])>=0?seg[2]:null};
}
function registerVoice(id,def,meta){
  if(typeof id!=='string'||!id)throw new Error('registerVoice: id must be a non-empty string');
  const v=mkVoice(id,def,meta);VOICES.set(id,v);DER=Object.create(null);GEN=Object.create(null);FG=Object.create(null);return id;
}
function registerRenderer(kind,fn){
  if(typeof kind!=='string'||typeof fn!=='function')throw new Error('registerRenderer(kind,fn)');
  RENDERERS[kind]=fn;if(kind==='cue')legacyOn=false;
}
function audioVoices(opt){
  const o=opt||{},out=[];
  for(const[id,v]of VOICES){
    if(o.prefix&&id.indexOf(o.prefix)!==0)continue;if(o.fallback===false&&v.fallback)continue;if(o.cls&&v.cls!==o.cls)continue;
    out.push(o.info?{id,cls:v.cls,dur:v.dur,tail:v.tail,gain:v.gain,fallback:v.fallback,bus:v.busName,prio:v.prio}:id);
  }
  return o.info?out.sort((a,b)=>a.id<b.id?-1:1):out.sort();
}
function audioClasses(){const o={};for(const k in CLS)o[k]={db:CLS[k].db,prio:CLS[k].prio,bus:CLS[k].bus,gap:CLS[k].gap,poly:CLS[k].poly};return o;}

/* ------------------------------------------------------------------ resolution: exact id -> unit/building voice from `who` -> generic fallback */
const W={ty:null,fa:null,kind:null,der:false};
function whoInfo(who){
  W.ty=null;W.fa=null;W.kind=null;W.der=false;if(!who)return;
  W.ty=who.type||null;W.kind=who.kind||null;
  let fa=who.faction;
  if(!fa&&who.team!==undefined){const tm=who.team;if(tm===0||tm===1)fa=(G&&G.teams[tm])?G.teams[tm].faction:null;else fa='wild';}
  if(fa==='neutral'||fa==='none')fa='wild';
  W.fa=fa||null;
}
const EVN={select:'select',ack:'ack',fire:'fire',melee:'melee',die:'die',ready:'ready',hit:'hit',shoot:'fire',bolt:'fire',rocket:'fire',shell:'fire',acid:'fire',boom:'die',boomBig:'die',done:'*',place:'place',amb:'amb'};
function derived(ty,ev,fa){
  const a=DER[ty]||(DER[ty]={}),b=a[ev]||(a[ev]={});let v=b[fa];
  if(v===undefined){v=VOICES.get(ty+'.'+ev+'.'+fa)||(ev==='fire'?VOICES.get(ty+'.melee.'+fa):ev==='melee'?VOICES.get(ty+'.fire.'+fa):null)||null;b[fa]=v;}
  return v;
}
function generic(name){
  let v=GEN[name];if(v!==undefined)return v;
  const nm=name.indexOf(':')>=0?name.replace(':','.'):name;
  return GEN[name]=VOICES.get(nm)||VOICES.get('ui.'+nm)||VOICES.get('global.'+nm)||null;
}
/* per-faction GLOBAL voices (81_sfx_world.js): global.<name>.<faction> / ui.<name>.<faction>, e.g. the era / win / lose fanfares. The faction is the one of `who`; the three fanfare names
   called WITHOUT `who` (the sim does: sfx('era'), sfx('win')) use the local player's faction (G.teams[0]). Cached per (name, faction); the cache is dropped by registerVoice. */
const FACG={era:1,win:1,lose:1};
function facGlobal(name,fa){
  const a=FG[name]||(FG[name]=Object.create(null));let v=a[fa];
  if(v===undefined)v=a[fa]=VOICES.get('global.'+name+'.'+fa)||VOICES.get('ui.'+name+'.'+fa)||null;
  return v;
}
function resolve(name,who){
  whoInfo(who);
  let v=VOICES.get(name);if(v)return v;
  if(W.ty&&W.fa){const ev=EVN[name];if(ev){v=derived(W.ty,ev==='*'?(W.kind==='building'||BSET.has(W.ty)?'done':'ready'):ev,W.fa);if(v){W.der=true;return v;}}}
  let fa=W.fa;if(!fa&&FACG[name]===1&&typeof G!=='undefined'&&G&&G.teams&&G.teams[0])fa=G.teams[0].faction;
  if(fa){v=facGlobal(name,fa);if(v){W.fa=fa;W.der=true;return v;}}
  return generic(name);
}

/* ------------------------------------------------------------------ test hook: ring log, stats */
const LOGN=200,RING=[];for(let i=0;i<LOGN;i++)RING.push({t:0,name:'',voice:null,who:null,faction:null,x:null,y:null,pan:0,vol:1,r:''});
let logHead=0,logCount=0,LPAN=0,LVOL=1;
function logEv(name,v,x,y,r){
  const e=RING[logHead];e.t=Math.round(performance.now());e.name=name;e.voice=v?v.id:null;e.who=W.ty;e.faction=W.fa;e.x=x===undefined?null:x;e.y=y===undefined?null:y;e.pan=LPAN;e.vol=LVOL;e.r=r;
  logHead=(logHead+1)%LOGN;if(logCount<LOGN)logCount++;
}
function logReset(){logHead=0;logCount=0;}
Object.defineProperty(AUD,'log',{get(){const o=[];for(let i=0;i<logCount;i++)o.push(Object.assign({},RING[(logHead-logCount+i+LOGN*2)%LOGN]));return o;}});
Object.defineProperty(AUD,'activeNodes',{get(){sweepNodes(performance.now());return S.nodes;}});
Object.defineProperty(AUD,'activeNodesMusic',{get(){sweepNodes(performance.now());return S.nodesM;}});

/* ------------------------------------------------------------------ graph, volumes, ducking, lifecycle */
function softClip(k,ceil){k=k||0.62;ceil=ceil||0.97;const n=2049,c=new Float32Array(n);for(let i=0;i<n;i++){const x=i/(n-1)*2-1,a=Math.abs(x),y=a<=k?a:k+(ceil-k)*Math.tanh((a-k)/(ceil-k));c[i]=x<0?-y:y;}return c;}
/* MASTER CHAIN. One definition used by the live graph and by the offline mixdown (audioMixdown), so the tests measure the chain that ships.
   v3 = the original chain (kept only so docs/AUDIO_V4.md can show before/after numbers from the same renderer): glue compressor -> soft clip (ceiling 0.97).
   v4 = glue compressor (gentle, slow enough to keep transients) -> limiter (DynamicsCompressor, ratio 20, 1 ms attack; the browser's compressor has ~6 ms look-ahead)
        -> soft clip with a -1.2 dBFS asymptote, so that sample peaks cannot pass 0.87 and true peaks stay <= -1 dBTP (measured by tests/e2e/e2e_audio_mix.py). */
const MASTERS={
  v3:{comp:{thr:-12,knee:10,ratio:3.5,att:0.004,rel:0.16},lim:null,clip:{k:0.62,ceil:0.97}},
  v4:{comp:{thr:-18,knee:14,ratio:2.6,att:0.010,rel:0.22},trim:-4.2,lim:{thr:-4,knee:0,ratio:20,att:0.001,rel:0.09},clip:{k:0.5,ceil:0.87}}};
function masterChain(x,input,preset){
  const M=typeof preset==='object'&&preset?preset:(MASTERS[preset]||MASTERS.v4),comp=x.createDynamicsCompressor(),clip=x.createWaveShaper(),out=x.createGain();
  const c=M.comp;comp.threshold.value=c.thr;comp.knee.value=c.knee;comp.ratio.value=c.ratio;comp.attack.value=c.att;comp.release.value=c.rel;
  input.connect(comp);let n=comp,lim=null;
  if(M.trim){const tg=x.createGain();tg.gain.value=Math.pow(10,M.trim/20);n.connect(tg);n=tg;}   // cancels the browser compressor's automatic make-up gain (0.6 x the static reduction at 0 dBFS) so quiet material passes at unity
  if(M.lim){lim=x.createDynamicsCompressor();const l=M.lim;lim.threshold.value=l.thr;lim.knee.value=l.knee;lim.ratio.value=l.ratio;lim.attack.value=l.att;lim.release.value=l.rel;n.connect(lim);n=lim;}
  clip.curve=softClip(M.clip.k,M.clip.ceil);clip.oversample='2x';n.connect(clip);clip.connect(out);
  return{comp,lim,clip,out};
}
function buildGraph(){
  const x=AC,mixIn=x.createGain(),master=x.createGain(),an=x.createAnalyser(),ch=masterChain(x,mixIn,'v4');
  ch.out.connect(master);master.connect(x.destination);
  an.fftSize=1024;an.smoothingTimeConstant=0;master.connect(an);S.an=an;S.anBuf=new Float32Array(1024);S.master=master;S.comp=ch.comp;S.lim=ch.lim;
  S.cache=mkCache();S.buses=[];S.A=[];
  S.anchor={n:1,v:null,out:null,m:true};   // keeps the live per-bus A handles' instance alive forever (music schedules notes over time)
  for(let i=0;i<BUSES.length;i++){
    const inn=x.createGain(),dk=x.createGain();inn.connect(dk);dk.connect(mixIn);S.buses.push({name:BUSES[i],inn,dk,lo:1,end:0,from:1,t0:0});
    const A=mkA();A.ctx=x;A.dest=inn;A.out=inn;A.cache=S.cache;A.bus=i;A.inst=i===BM?S.anchor:{n:1,v:null,out:null,m:false};S.A.push(A);
  }
  busSfx=S.buses[0].inn;busMusic=S.buses[BM].inn;
  getDly(S.A[BM]);musicFx=S.cache.dly[BM].inG;
}
function applyVolumes(){
  if(!AC||!S.buses.length)return;
  const t=AC.currentTime,vol=[SET.sfx,SET.sfx,SET.sfx,SET.music];
  for(let i=0;i<S.buses.length;i++){const g=S.buses[i].inn.gain;if(S.fresh)g.value=vol[i];else{g.cancelScheduledValues(t);g.setTargetAtTime(vol[i],t,0.02);}}
  const m=S.master.gain;if(S.fresh)m.value=muted?0:1;else{m.cancelScheduledValues(t);m.setTargetAtTime(muted?0:1,t,0.012);}
  S.fresh=false;
}
/* DUCKING (the sidechain of this engine: alerts and big sounds tell the music bus to dip). A bus keeps one ramp state {from,t0,lo,end}; overlapping ducks combine
   (deepest wins, the later end wins). The same functions schedule the live gain and the offline mixdown, so what the tests measure is what plays. */
const DK={att:0.04,rel:0.9};
function duckAt(b,t){
  if(!(b.end>0)||t>=b.end+DK.rel)return 1;
  if(t>=b.end)return b.lo+(1-b.lo)*(t-b.end)/DK.rel;
  if(t<=b.t0)return b.from;
  if(t<b.t0+DK.att)return b.from+(b.lo-b.from)*(t-b.t0)/DK.att;
  return b.lo;
}
function duckPlan(b,t,amount,ms){
  const active=t<b.end,from=duckAt(b,t),lo=Math.max(0.03,Math.min(1-amount,active?b.lo:1)),end=Math.max(t+DK.att+ms/1000,active?b.end:0);
  b.from=from;b.t0=t;b.lo=lo;b.end=end;
}
function duckSchedule(g,b){g.cancelScheduledValues(b.t0);g.setValueAtTime(b.from,b.t0);g.linearRampToValueAtTime(b.lo,b.t0+DK.att);g.setValueAtTime(b.lo,b.end);g.linearRampToValueAtTime(1,b.end+DK.rel);}
function audioDuck(bus,amount,ms){
  if(!AC||!S.buses.length)return;const b=S.buses[BIX[bus]];if(!b)return;
  duckPlan(b,AC.currentTime,amount,ms);duckSchedule(b.dk.gain,b);
}
/* OFFLINE MIXDOWN: tracks = [{channels:[L,R], at:seconds, bus:'sfx'|..., gain:linear, pan?:-1..1}], opt.ducks = [{bus,t,amount,ms}] (time-ordered). Every track is a pre-rendered buffer,
   so the bus gains, the ducking and the REAL master chain (opt.chain 'v3'|'v4') are what is under test. opt.vol = bus volumes (default = the game's defaults). Resolves {sampleRate,channels}. */
function audioMixdown(tracks,seconds,sr,opt){
  opt=opt||{};sr=sr||44100;
  const OC=window.OfflineAudioContext||window.webkitOfflineAudioContext;if(!OC)return Promise.reject(new Error('OfflineAudioContext unavailable'));
  const x=new OC(2,Math.max(1,Math.ceil(seconds*sr)),sr),mixIn=x.createGain(),ch=masterChain(x,mixIn,opt.chain||'v4'),vol=Object.assign({sfx:0.8,ui:0.8,amb:0.8,music:0.45},opt.vol||{});
  ch.out.connect(x.destination);
  const buses={};for(const nm of BUSES){const inn=x.createGain(),dk=x.createGain();inn.gain.value=vol[nm];inn.connect(dk);dk.connect(mixIn);buses[nm]={inn,dk,st:{lo:1,end:0,from:1,t0:0}};}
  const keep=[];
  for(const d of(opt.ducks||[])){const b=buses[d.bus];if(!b)continue;duckPlan(b.st,d.t,d.amount,d.ms);duckSchedule(b.dk.gain,b.st);}
  for(const tr of tracks){
    const buf=x.createBuffer(tr.channels.length,tr.channels[0].length,sr);for(let c=0;c<tr.channels.length;c++)buf.copyToChannel(tr.channels[c],c);
    const src=x.createBufferSource(),g=x.createGain();src.buffer=buf;g.gain.value=tr.gain===undefined?1:tr.gain;src.connect(g);
    let o=g;if(tr.pan){const p=x.createStereoPanner();p.pan.value=tr.pan;g.connect(p);o=p;}
    o.connect(buses[tr.bus||'sfx'].inn);src.start(Math.max(0,tr.at||0));keep.push(src,g);
  }
  return x.startRendering().then(buf=>{keep.length=0;return{sampleRate:buf.sampleRate,channels:[buf.getChannelData(0),buf.getChannelData(1)]};});
}
function audioInit(){
  if(!AC){
    const Ctor=window.AudioContext||window.webkitAudioContext;if(!Ctor)return;
    try{AC=new Ctor({latencyHint:'interactive'});}catch(e){try{AC=new Ctor();}catch(e2){AC=null;return;}}
    S.fresh=true;
    try{buildGraph();applyVolumes();}catch(e){AUD.lastError='graph: '+(e&&e.message||e);C.errors++;try{AC.close();}catch(_){}AC=null;S.buses=[];S.A=[];return;}   // a context that cannot build its graph is no context: sound off, game on
    try{const b=AC.createBuffer(1,1,22050),s=AC.createBufferSource();s.buffer=b;s.connect(AC.destination);s.start(0);}catch(e){}   // iOS unlock
    if(legacyOn)legacyStart();
    for(const f of READY){try{f(AC);}catch(e){}}
  }
  if(AC&&AC.state!=='running'&&AC.state!=='closed'){try{const pr=AC.resume();if(pr&&pr.catch)pr.catch(noop);}catch(e){}}
}
function toggleMute(){
  muted=!muted;applyVolumes();
  return muted;
}
function audioOnReady(fn){READY.push(fn);if(AC){try{fn(AC);}catch(e){}}}
function audioBus(name){return S.buses.length?S.buses[BIX[name]].inn:null;}
function audioA(name){const A=S.A[BIX[name||'music']];if(!A)return null;A.t0=AC.currentTime;return A;}
function audioDelay(bus,time,fb){
  if(!S.cache)return;const ix=BIX[bus];if(time>0)S.cache.dlyT=time;if(fb!==undefined)S.cache.dlyFb=fb;
  const d=S.cache.dly[ix];if(d){if(time>0)d.dl.delayTime.setTargetAtTime(time,AC.currentTime,0.05);if(fb!==undefined)d.fb.gain.value=fb;}
}
function audioMeter(){
  if(!S.an)return{peak:0,rms:0};
  S.an.getFloatTimeDomainData(S.anBuf);let pk=0,sq=0;for(let i=0;i<S.anBuf.length;i++){const a=S.anBuf[i];if(a>pk)pk=a;else if(-a>pk)pk=-a;sq+=a*a;}
  return{peak:pk,rms:Math.sqrt(sq/S.anBuf.length)};
}
function audioStats(){
  sweepNodes(performance.now(),true);
  const b={},dk={};for(let i=0;i<S.buses.length;i++){b[BUSES[i]]=S.buses[i].inn.gain.value;dk[BUSES[i]]=S.buses[i].dk.gain.value;}
  return{state:AC?AC.state:'none',sampleRate:AC?AC.sampleRate:0,currentTime:AC?AC.currentTime:0,muted,activeNodes:S.nodes,activeNodesMusic:S.nodesM,peakNodes:AUD.peakNodes,cap:AUD.cap,capMusic:AUD.capMusic,
    masterGain:S.master?S.master.gain.value:null,buses:b,ducks:dk,voices:VOICES.size,renderers:Object.keys(RENDERERS),legacyScore:legacyOn,lastError:AUD.lastError,counters:Object.assign({},C)};
}
function gesture(){if(AC&&AC.state==='running')return;audioInit();}
for(const ev of['pointerdown','mousedown','touchend','keydown','click'])window.addEventListener(ev,gesture,{passive:true,capture:true});
document.addEventListener('visibilitychange',()=>{
  if(!AC||AC.state==='closed')return;
  if(document.hidden){S.hidden=true;try{if(AC.state==='running')AC.suspend();}catch(e){}}
  else{S.hidden=false;try{const pr=AC.resume();if(pr&&pr.catch)pr.catch(noop);}catch(e){}}
});

/* ------------------------------------------------------------------ playing a voice (live) */
const POS={pan:0,vol:1,far:0};
/* SPATIAL: besides pan and volume, a voice far from the screen centre gets a low-pass (the air eats the highs: 16 kHz at `near` -> 2.2 kHz at the view edge, exponential in `far`) and a reverb
   send (-26 dB -> -9 dB re dry), so distant fire sits behind close fire instead of just being quieter. Equal-power pan is unchanged (StereoPanner). */
const SPAT={near:0.3,lp0:16000,lp1:2200,rev0:0.05,rev1:0.35,room:'open'};
function spatialOut(A,x,dest,pan,far){
  let head=dest;A.sp=null;
  if(Math.abs(pan)>0.015&&x.createStereoPanner){const o=x.createStereoPanner();o.pan.value=pan;o.connect(head);head=o;trk(A,o);}
  if(far>0.02){
    const lp=x.createBiquadFilter();lp.type='lowpass';lp.Q.value=0.5;lp.frequency.value=SPAT.lp0*Math.pow(SPAT.lp1/SPAT.lp0,far);lp.connect(head);
    const g=x.createGain();g.gain.value=SPAT.rev0+(SPAT.rev1-SPAT.rev0)*far;lp.connect(g);g.connect(getRev(A,SPAT.room));trk(A,g);trk(A,lp);head=lp;
    /* layers that carry their own `pan` (stereo-wide faction voices) bypass A.out: they get the same low-pass and send through A.sp, straight to the bus (their pan already contains the positional pan) */
    const l2=x.createBiquadFilter();l2.type='lowpass';l2.Q.value=0.5;l2.frequency.value=lp.frequency.value;l2.connect(dest);l2.connect(g);trk(A,l2);A.sp=l2;
  }
  return head;
}
function audioRoom(name){if(name===undefined)return SPAT.room;if(ROOMS[name]===undefined)throw new Error('unknown room '+name);SPAT.room=name;return name;}
function calcPos(x,y,range){
  const z=cam.z,hv=VW/z/2,cx=cam.x+hv,cy=cam.y+VH/z/2,hw=(hv+160)*range,hh=(VH/z/2+160)*range;
  if(Math.abs(x-cx)>hw||Math.abs(y-cy)>hh)return false;
  const dd=Math.hypot(x-cx,y-cy)/(hw*1.3);
  POS.pan=cl((x-cx)/hv,-1,1)*0.8;POS.vol=cl(1.15-dd,0.25,1);POS.far=cl((dd-SPAT.near)/(1-SPAT.near),0,1);return true;
}
function prep(A,v,p,n){
  const vy=v.vary,r=A.rng;
  /* seeded white-noise variation. A low-discrepancy (golden-ratio) sequence was tried and reverted: the TRIM calibrations of the content voices were fitted against these exact draws, and a different
     sequence pushed 5-6 headroom-limited voices over 0.98 on some seeds (tests/audio/units_gate.py). Measured variation of this scheme: tests/e2e/e2e_audio_mix.py 'variation'. */
  if(vy.pitch)p.pitch*=1+(r()*2-1)*vy.pitch;
  if(vy.filter)p.fmul=1+(r()*2-1)*vy.filter;
  if(vy.gain)p.vol*=1+(r()*2-1)*vy.gain;
  if(v.variants>1)p.variant=v.seq?((n-1)%v.variants):Math.floor(r()*v.variants);
}
function run(A,v,t,p){
  if(v.fn)v.fn(A,t,p);else{const Ls=v.layers;for(let i=0;i<Ls.length;i++)layerPlay(A,t,Ls[i],p);}
}
function launch(v,vol,pan,pm,fa,far){
  const A=takeA(),p=A.p,inst=instGet(v);
  try{
    A.ctx=AC;A.off=false;A.sp=null;A.dest=S.buses[v.bus].inn;A.bus=v.bus;A.cache=S.cache;A.inst=inst;A.v=v;A.dur=v.dur;inst.m=v.bus===BM;
    A.s=(v.h^Math.imul(++v.n,0x9E3779B1))|0;
    p.vol=vol;p.pan=pan;p.faction=fa||v.fac||'meridian';p.pitch=pm;p.fmul=1;p.variant=0;p.seed=v.n;
    prep(A,v,p,v.n);
    const t=AC.currentTime+0.004;A.t0=t;p.t0=t;
    if(Math.abs(pan)>0.015||far>0.02){const o=spatialOut(A,AC,A.dest,pan,far||0);A.out=o;inst.out=o;}else A.out=A.dest;
    A.vg=v.gain*p.vol;
    run(A,v,t,p);
  }catch(e){C.errors++;AUD.lastError=v.id+': '+(e&&e.message||e);if(++v.bad>=3)v.mute=true;}
  finally{
    if(inst.n>0){v.live++;v.est=inst.n;}else{if(inst.out){try{inst.out.disconnect();}catch(e){}inst.out=null;}inst.v=null;IP.push(inst);}
    apd--;
  }
}
function play(v,x,y){
  let pan=0,vol=1,posFar=0;
  if(typeof x==='number'&&typeof y==='number'){if(!calcPos(x,y,v.range)){C.culled++;return'culled';}pan=POS.pan;vol=POS.vol;posFar=POS.far;LPAN=pan;LVOL=vol;}
  if(v.mute)return'bad';
  const now=performance.now();
  if(v.gap>0&&now-v.last<v.gap){v.pend++;C.merged++;return'merge';}
  if(v.poly>0&&v.live>=v.poly){C.poly++;return'poly';}
  sweepNodes(now);
  if(v.bus===BM){if(S.nodesM+v.est>AUD.capMusic){C.capped++;return'cap';}}
  else if(S.nodes+v.est>AUD.cap*LIMF[v.prio]){C.capped++;return'cap';}
  const n=now-v.last<600?v.pend:0;v.pend=0;v.last=now;
  let pm=W.fa&&v.fallback?(FACP[W.fa]||1):1;
  if(n>0){vol*=1+Math.min(0.7,0.22*Math.log2(1+n));pm*=1-0.012*Math.min(n,3);}   // unit-spam compression: N merged calls -> one louder, slightly lower voice
  launch(v,vol,pan,pm,W.fa,posFar);C.played++;
  if(v.duck>0)audioDuck('music',v.duck,(v.dur+0.4)*1000);
  return'play';
}
function emit(name,v,x,y){
  let r;LPAN=0;LVOL=1;
  if(!v){r='nosound';C.nosound++;}
  else if(!AC){r='noctx';C.noctx++;}
  else if(muted){r='muted';C.muted++;}
  else if(!G||(typeof ui!=='undefined'&&ui.demo&&typeof x!=='number')){r='skip';C.skipped++;}
  else if(AC.state!=='running'){r='suspended';C.suspended++;}
  else r=play(v,x,y);
  logEv(name,v,x,y,r);return r==='play';
}
function sfx(name,x,y,who){C.calls++;return emit(name,resolve(name,who),x,y);}
const EVGEN={select:'select',ack:'ack',fire:'shoot',melee:'melee',die:'boom',ready:'done',hit:'melee',place:'place',done:'done'};
function direct(type,ev,x,y,faction,bld){
  C.calls++;W.ty=type;W.fa=faction==='neutral'||faction==='none'?'wild':(faction||null);W.kind=bld?'building':'unit';W.der=false;
  let v=W.fa?derived(type,ev,W.fa):null;if(v)W.der=true;
  else{const g=EVGEN[ev];v=g?generic(bld&&ev==='die'?'boomBig':bld&&ev==='fire'?'bolt':g):null;}
  return emit(ev,v,x,y);
}
function sfxUnit(type,ev,x,y,faction){return direct(type,ev,x,y,faction,false);}
function sfxBuilding(type,ev,x,y,faction){return direct(type,ev,x,y,faction,true);}
/* direct playback for the Sound Lab / tests: id (voice id or legacy name) or a voice def; opts {vol,pan,pitch,faction,force} ; bypasses culling, cooldown and polyphony */
function audioPlay(what,opt){
  if(!AC||muted||AC.state!=='running')return false;
  const o=opt||{};let v;
  if(typeof what==='string')v=VOICES.get(what)||generic(what);else v=mkVoice('__play',what,o.meta);
  if(!v)return false;
  launch(v,o.vol!==undefined?o.vol:1,o.pan||0,o.pitch||1,o.faction||null);C.played++;return true;
}

/* ------------------------------------------------------------------ offline rendering */
function renderOffline(seconds,sr,build,opt){
  const OC=window.OfflineAudioContext||window.webkitOfflineAudioContext;
  if(!OC)return Promise.reject(new Error('OfflineAudioContext unavailable'));
  C.renders++;
  const ctx=new OC(2,Math.max(1,Math.ceil(seconds*sr)),sr),A=mkA();
  A.ctx=ctx;A.off=true;A.cache=mkCache();A.inst={n:1,v:null,out:null,m:false};
  let dest=ctx.destination;
  if(opt&&opt.master){const sh=ctx.createWaveShaper();sh.curve=softClip(0.62,0.97);sh.connect(ctx.destination);dest=sh;}
  A.dest=dest;A.out=dest;
  try{build(A,ctx);flushSinks(A);}catch(e){return Promise.reject(e);}   // builders run synchronously here: callers may stub Math.random around this call only
  // A (and with it the reverb/delay nodes in A.cache) must stay referenced until rendering is done: if nothing in JS holds the convolver once the
  // sources have ended, the browser may garbage-collect it mid-render and cut the tail at a random moment (measured: 0.005 FS differences in reverb tails).
  return ctx.startRendering().then(buf=>{A.cache=null;A.ctx=null;return{sampleRate:buf.sampleRate,channels:[buf.getChannelData(0),buf.getChannelData(1)]};});
}
function renderVoice(spec,seconds,sr){
  let v;
  if(spec.voice)v=mkVoice('__spec',spec.voice,spec.meta);
  else{const who=spec.type||spec.faction?{type:spec.type,faction:spec.faction}:null;v=resolve(spec.sfx,who);}
  if(!v)return Promise.reject(new Error('audioRender: no voice for '+JSON.stringify(spec).slice(0,100)));
  const sec=seconds||Math.min(12,v.dur+v.tail+0.1);
  return renderOffline(sec,sr,(A,ctx)=>{
    const p=A.p,seed=spec.seed|0;A.sp=null;
    A.bus=v.bus;A.v=v;A.dur=v.dur;A.s=(v.h^Math.imul(seed+1,0x9E3779B1))|0;
    p.vol=spec.vol!==undefined?spec.vol:1;p.pan=spec.pan||0;p.faction=spec.faction||W.fa||v.fac||'meridian';p.pitch=spec.pitch||1;p.fmul=1;p.variant=0;p.seed=seed;
    let far=spec.far||0;
    if(spec.x!==undefined&&spec.y!==undefined&&typeof cam!=='undefined'){calcPos(spec.x,spec.y,1e6);p.vol*=POS.vol;p.pan=spec.pan!==undefined?spec.pan:POS.pan;far=spec.far!==undefined?spec.far:POS.far;}
    prep(A,v,p,seed+1);
    if(Math.abs(p.pan)>0.015||far>0.02)A.out=spatialOut(A,ctx,A.dest,p.pan,far);
    A.vg=v.gain*p.vol;p.t0=0;A.t0=0;
    run(A,v,0,p);
  },{master:spec.master});
}
function audioRender(spec,seconds,sr){
  sr=sr||44100;
  try{
    if(!spec||typeof spec!=='object')throw new Error('audioRender: spec object required');
    if(spec.voice||spec.sfx!==undefined)return renderVoice(spec,seconds,sr);
    const ks=Object.keys(spec);for(let i=0;i<ks.length;i++)if(RENDERERS[ks[i]])return Promise.resolve(RENDERERS[ks[i]](spec,seconds,sr));
  }catch(e){return Promise.reject(e);}
  return Promise.reject(new Error('audioRender: no renderer for '+JSON.stringify(spec).slice(0,100)));
}
/* analysis used by the gates: returns {finite,peak,rmsDb,activeDb,start,end,dc,first,tailDb,dur}. active window = frames (10 ms) within 40 dB of the loudest frame */
function audioAnalyse(ch,sr){
  const n=ch[0].length,nc=ch.length,fr=Math.max(1,Math.round(sr*0.01)),nf=Math.floor(n/fr),lev=new Float64Array(nf+1);
  let pk=0,fin=true,sq=0,sum=0,first=0;
  for(let c=0;c<nc;c++){const d=ch[c];for(let i=0;i<n;i++){let v=d[i];if(!isFinite(v)){fin=false;v=0;}const a=v<0?-v:v;if(a>pk)pk=a;sq+=v*v;sum+=v;lev[Math.min(nf,(i/fr)|0)]+=v*v;}if(Math.abs(d[0])>first)first=Math.abs(d[0]);}
  let mx=0;for(let i=0;i<nf;i++)if(lev[i]>mx)mx=lev[i];
  const thr=mx*1e-4;let a0=-1,a1=-1,as=0;
  for(let i=0;i<nf;i++)if(lev[i]>=thr&&lev[i]>0){if(a0<0)a0=i;a1=i;}
  for(let i=Math.max(0,a0);i<=a1&&a0>=0;i++)as+=lev[i];
  const act=a0<0?0:as/((a1-a0+1)*fr*nc),db=v=>v>0?10*Math.log10(v):-200,tn=Math.min(n,Math.round(sr*0.02));let ts=0;
  for(let c=0;c<nc;c++)for(let i=n-tn;i<n;i++)ts+=ch[c][i]*ch[c][i];
  return{finite:fin,peak:pk,rmsDb:db(sq/(n*nc)),activeDb:db(act),start:a0<0?0:a0*fr/sr,end:a0<0?0:(a1+1)*fr/sr,dc:Math.abs(sum/(n*nc)),first,tailDb:db(ts/(tn*nc)),dur:n/sr};
}
/* FNV-1a over the samples quantised to 16 bit (spec §6.3); exact=true hashes the raw float32 bits instead (a stricter reproducibility check) */
function audioHash(ch,exact){
  let h=0x811C9DC5;
  if(exact){for(let c=0;c<ch.length;c++){const u=new Uint32Array(ch[c].buffer,ch[c].byteOffset,ch[c].length);for(let i=0;i<u.length;i++){h^=u[i]&0xFFFF;h=Math.imul(h,16777619);h^=u[i]>>>16;h=Math.imul(h,16777619);}}return(h>>>0).toString(16).padStart(8,'0');}
  for(let c=0;c<ch.length;c++){const d=ch[c];for(let i=0;i<d.length;i++){const q=Math.round(cl(d[i],-1,1)*32767)&0xFFFF;h^=q&255;h=Math.imul(h,16777619);h^=q>>8;h=Math.imul(h,16777619);}}
  return(h>>>0).toString(16).padStart(8,'0');
}

/* ------------------------------------------------------------------ legacy helpers + fallback score (steps aside as soon as a music module registers a 'cue' renderer) */
function tone(f,d,type,v,slide,delay,pan){
  if(!AC||muted||!S.buses.length)return;const t=AC.currentTime+(delay||0),o=AC.createOscillator(),g=AC.createGain();let out=g;
  o.type=type;o.frequency.setValueAtTime(f,t);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(25,f+slide),t+d);
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+0.003);g.gain.exponentialRampToValueAtTime(0.0001,t+d);o.connect(g);
  if(pan&&AC.createStereoPanner){const pn=AC.createStereoPanner();pn.pan.value=pan;g.connect(pn);out=pn;}
  out.connect(busSfx);o.onended=()=>{try{out.disconnect();}catch(e){}};o.start(t);o.stop(t+d+0.03);
}
const LGR=mulberry32(0x5C0DE);
function noiseBurst(d,v,f0,pan,type){
  if(!AC||muted||!S.buses.length)return;const A=S.A[0],s=AC.createBufferSource(),fl=AC.createBiquadFilter(),g=AC.createGain(),t=AC.currentTime;
  s.buffer=noiseBuf(A,'white');fl.type=type||'lowpass';fl.frequency.value=f0;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+0.003);g.gain.exponentialRampToValueAtTime(0.0001,t+d);
  s.connect(fl);fl.connect(g);let out=g;if(pan&&AC.createStereoPanner){const pn=AC.createStereoPanner();pn.pan.value=pan;g.connect(pn);out=pn;}
  out.connect(busSfx);s.onended=()=>{try{out.disconnect();}catch(e){}};s.start(t,LGR()*0.5,d+0.05);
}
const LG={timer:null,beat:0,next:0,inten:0,out:null,cho:[[-12,[0,3,7]],[-16,[0,4,7]],[-9,[0,4,7]],[-14,[0,4,7]]],scale:[0,2,3,5,7,8,10]};
const nf=semi=>110*Math.pow(2,semi/12);
function lgNote(f,t,d,type,v,lpf){
  const o=AC.createOscillator(),g=AC.createGain(),fl=AC.createBiquadFilter();o.type=type;o.frequency.value=f;fl.type='lowpass';fl.frequency.value=lpf||1400;
  g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(v,t+Math.min(d*0.35,1.6));g.gain.exponentialRampToValueAtTime(0.0001,t+d);
  o.connect(fl);fl.connect(g);g.connect(LG.out);if(v<0.03)g.connect(musicFx);o.start(t);o.stop(t+d+0.05);o.onended=()=>{try{g.disconnect();}catch(e){}};
}
function lgDrum(kind,t,v){
  if(kind==='kick'){const o=AC.createOscillator(),g=AC.createGain();o.frequency.setValueAtTime(130,t);o.frequency.exponentialRampToValueAtTime(40,t+0.18);g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(0.0001,t+0.22);o.connect(g);g.connect(LG.out);o.start(t);o.stop(t+0.25);o.onended=()=>{try{g.disconnect();}catch(e){}};}
  else{const s=AC.createBufferSource(),fl=AC.createBiquadFilter(),g=AC.createGain();s.buffer=noiseBuf(S.A[BM],'white');fl.type='highpass';fl.frequency.value=kind==='hat'?7000:1800;
    g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(0.0001,t+(kind==='hat'?0.05:0.14));s.connect(fl);fl.connect(g);g.connect(LG.out);s.start(t,LGR()*2,0.2);s.onended=()=>{try{g.disconnect();}catch(e){}};}
}
function lgTick(){
  if(!AC||muted||!legacyOn||AC.state!=='running'||S.hidden)return;
  const nowT=AC.currentTime;if(LG.next<nowT)LG.next=nowT+0.1;
  const target=G&&!ui.demo?(G.time-G.fightT<9?1:0):0.25;LG.inten+=(target-LG.inten)*0.08;
  const night=G?1-G.daylight:0,beat=60/(70+LG.inten*14),inten=LG.inten;
  while(LG.next<nowT+0.7){
    const t=LG.next,bar=Math.floor(LG.beat/4),step=LG.beat%4,ch=LG.cho[bar%4],root=ch[0]+(night>0.5?-2:0);
    if(step===0){for(const iv of ch[1]){lgNote(nf(root+iv+12),t,beat*4.4,'triangle',0.032,700+night*-200+inten*500);lgNote(nf(root+iv+12)*1.004,t,beat*4.4,'sine',0.026,900);}lgNote(nf(root),t,beat*3.8,'sine',0.07,300);}
    if(step===2||(inten>0.4&&step%2===0))lgNote(nf(root),t,beat*0.9,'sine',0.05+inten*0.03,260);
    const pArp=0.35+0.4*inten-0.2*night;
    if(LGR()<pArp&&(step%2===1||inten>0.5)){const n=LG.scale[Math.floor(LGR()*7)]+(LGR()<.5?12:24)-12+(night>0.5?-5:0);lgNote(nf(n+ch[0]+12),t,beat*1.4,'triangle',0.02,2200);}
    if(inten>0.35){if(step===0||step===2)lgDrum('kick',t,0.11*inten);if(step%2===1)lgDrum('hat',t,0.03*inten);if(step===3&&inten>0.7)lgDrum('snare',t,0.05);}
    LG.next+=beat;LG.beat++;
  }
}
function legacyStart(){
  if(LG.timer||!AC)return;
  LG.out=AC.createGain();LG.out.gain.value=1.1;LG.out.connect(S.buses[BM].inn);audioDelay('music',0.42,0.38);
  LG.next=AC.currentTime+0.2;LG.timer=setInterval(()=>{try{lgTick();}catch(e){audioFault(e);}},140);
}
function audioLegacyScore(on){legacyOn=!!on;if(on&&AC)legacyStart();}

/* ------------------------------------------------------------------ generic fallback voices (ported from the original implementation + the SFX_GLOBAL names)
   Ids: global.<name>. Content voices registered later (81_sfx_lib.js) take precedence automatically. TRIM = per-voice gain correction measured with audioAnalyse so that every
   generic voice lands inside its class loudness window (tests/e2e/e2e_audio_engine.py asserts it). */
(function(){
const O=(type,f,o)=>Object.assign({k:'osc',type,f},o),Nz=(color,o)=>Object.assign({k:'noise',color},o),FM=(f,ratio,idx,o)=>Object.assign({k:'fm',f,ratio,idx},o);
const lp=(f0,f1,t,q)=>({type:'lp',f0,f1:f1||undefined,t:t||undefined,q:q||undefined}),hp=(f0,f1,t)=>({type:'hp',f0,f1:f1||undefined,t:t||undefined}),bp=(f0,f1,t,q)=>({type:'bp',f0,f1:f1||undefined,t:t||undefined,q:q||undefined});
const G0={
  click:{cls:'ui',dur:0.07,layers:[O('square',900,{pitch:{from:1000,to:760,t:0.04},env:{d:0.04},gain:0.5,filter:lp(3200)}),Nz('white',{dur:0.015,env:{d:0.012},gain:0.3,filter:hp(4000)})]},
  tab:{cls:'ui',dur:0.1,layers:[O('triangle',700,{dur:0.05,env:{d:0.045}}),O('triangle',1050,{delay:0.03,dur:0.06,env:{d:0.055}})]},
  cancel:{cls:'ui',dur:0.13,layers:[O('sine',520,{pitch:{from:560,to:340,t:0.1},env:{d:0.11}}),O('triangle',260,{pitch:{from:280,to:170,t:0.1},env:{d:0.11},gain:0.5})]},
  toast:{cls:'ui',dur:0.34,layers:[FM(880,3.5,{from:2.2,to:0.1},{env:{a:0.003,d:0.3},send:{rev:0.25,room:'plate'}}),O('sine',1760,{gain:0.18,dur:0.22,env:{d:0.2}})]},
  err:{cls:'ui',dur:0.24,gap:200,layers:[O('square',170,{pitch:{from:170,to:130,t:0.2},env:{d:0.2},filter:lp(900,0,0,1)}),O('sawtooth',172,{detune:25,pitch:{from:172,to:128,t:0.2},env:{d:0.2},gain:0.6,filter:lp(800)})]},
  coin:{cls:'ui',dur:0.32,gap:60,layers:[O('triangle',1320,{dur:0.1,env:{d:0.09}}),O('triangle',1760,{delay:0.07,dur:0.22,env:{d:0.2}}),FM(2640,2,{from:1,to:0.05},{delay:0.07,dur:0.15,env:{d:0.14},gain:0.15})]},
  mine:{cls:'ui',dur:0.09,layers:[Nz('white',{dur:0.035,env:{d:0.03},gain:0.6,filter:bp(2400,0,0,3)}),O('sine',320,{pitch:{from:320,to:170,t:0.05},env:{d:0.05},gain:0.7})]},
  deliver:{cls:'ui',dur:0.16,layers:[O('sine',620,{pitch:{from:620,to:420,t:0.1},env:{d:0.1}}),Nz('pink',{dur:0.1,env:{d:0.09},gain:0.4,filter:lp(1800)})]},
  trade:{cls:'ui',dur:0.4,layers:[O('triangle',880,{dur:0.12,env:{d:0.1}}),O('triangle',1175,{delay:0.08,dur:0.12,env:{d:0.1}}),O('triangle',1568,{delay:0.16,dur:0.22,env:{d:0.2},gain:0.6,send:{rev:0.2,room:'plate'}})]},
  train:{cls:'ui',dur:0.12,layers:[O('triangle',620,{pitch:{from:620,to:820,t:0.09},env:{d:0.1}}),O('sine',1240,{pitch:{from:1240,to:1640,t:0.09},env:{d:0.08},gain:0.2})]},
  done:{cls:'impact',dur:0.38,gap:120,layers:[O('triangle',520,{dur:0.14,env:{d:0.13}}),O('triangle',780,{delay:0.1,dur:0.26,env:{d:0.25}}),O('sine',1560,{delay:0.1,dur:0.2,env:{d:0.18},gain:0.15})]},
  place:{cls:'impact',dur:0.18,layers:[O('triangle',300,{pitch:{from:300,to:540,t:0.12},env:{d:0.12},gain:0.5}),Nz('white',{dur:0.09,env:{d:0.08},filter:lp(900),gain:0.5}),O('sine',110,{pitch:{from:110,to:55,t:0.15},env:{d:0.16}})]},
  level:{cls:'impact',dur:0.65,gap:300,layers:notes([523,659,831,1047],0.08,{k:'osc',type:'triangle',dur:0.3,env:{d:0.28}})},
  era:{cls:'alert',dur:1.7,gap:1500,duck:0.3,layers:notes([330,416,524,660,832],0.11,{k:'osc',type:'triangle',dur:0.5,env:{d:0.48},send:{rev:0.2,room:'hall'}}).concat([O('sine',660,{delay:0.5,dur:1.1,env:{a:0.05,d:1.0},gain:0.6,send:{rev:0.3,room:'hall'}})])},
  win:{cls:'alert',dur:1.6,gap:3000,duck:0.4,layers:[O('triangle',392,{dur:0.22,env:{d:0.2}}),O('triangle',523,{delay:0.2,dur:0.22,env:{d:0.2}}),O('triangle',784,{delay:0.4,dur:0.72,env:{d:0.7}}),O('triangle',1047,{delay:0.6,dur:0.92,env:{d:0.9},gain:0.8,send:{rev:0.25,room:'hall'}})]},
  lose:{cls:'alert',dur:1.4,gap:3000,duck:0.4,layers:[O('sawtooth',300,{pitch:{from:300,to:150,t:0.5},dur:0.5,env:{a:0.01,d:0.45},filter:lp(1200)}),O('sawtooth',200,{delay:0.4,pitch:{from:200,to:80,t:0.9},dur:0.95,env:{a:0.01,d:0.9},filter:lp(900),send:{rev:0.2,room:'hall'}})]},
  alert:{cls:'alert',dur:0.42,layers:[O('square',480,{dur:0.13,env:{d:0.12},filter:lp(2500)}),O('square',340,{delay:0.14,dur:0.26,env:{d:0.25},filter:lp(2500)})]},
  alertBase:{cls:'alert',dur:1.15,gap:900,layers:[0,1,2].map(i=>O('sawtooth',i%2?330:440,{delay:i*0.38,dur:0.34,env:{a:0.01,s:0.8,d:0.1,r:0.06},filter:lp(1800),trem:{f:11,depth:0.3}}))},
  supply:{cls:'ui',dur:0.2,layers:[O('sine',220,{pitch:{from:220,to:330,t:0.12},env:{d:0.13}}),O('triangle',660,{delay:0.04,dur:0.12,env:{d:0.1},gain:0.5})]},
  research:{cls:'ui',dur:0.46,layers:[FM(600,2,{from:1.5,to:0.2},{dur:0.13,env:{d:0.12}}),FM(800,2,{from:1.5,to:0.2},{delay:0.1,dur:0.13,env:{d:0.12}}),FM(1000,2,{from:1.5,to:0.2},{delay:0.2,dur:0.25,env:{d:0.24},send:{rev:0.2,room:'plate'}})]},
  hero:{cls:'impact',prio:'hero',dur:0.7,gap:600,layers:[O('sawtooth',392,{dur:0.65,env:{a:0.03,d:0.6},filter:lp(600,2200,0.15)}),O('sawtooth',588,{detune:6,dur:0.65,env:{a:0.03,d:0.6},filter:lp(600,2200,0.15),gain:0.7}),O('square',196,{dur:0.6,env:{a:0.03,d:0.55},gain:0.4,filter:lp(700)})]},
  heroFall:{cls:'alert',prio:'hero',dur:1.3,gap:2000,layers:[O('sawtooth',220,{pitch:{from:220,to:90,t:1.1},dur:1.25,env:{a:0.02,d:1.2},filter:lp(900,250,1.1)}),Nz('brown',{dur:1.1,env:{d:1.05},gain:0.6,filter:lp(500)})]},
  heroRevive:{cls:'impact',prio:'hero',dur:0.95,gap:1000,layers:notes([330,495,660,990],0.1,{k:'osc',type:'triangle',dur:0.5,env:{d:0.48},send:{rev:0.25,room:'plate'}})},
  siege:{cls:'impact',dur:0.4,gap:200,layers:[Nz('white',{dur:0.2,env:{d:0.18},filter:bp(800,0,0,2)}),O('sine',70,{pitch:{from:90,to:45,t:0.25},env:{d:0.26}}),FM(380,2.4,{from:4,to:0.5},{delay:0.05,dur:0.3,env:{d:0.28},gain:0.4})]},
  cloak:{cls:'fire',dur:0.6,gap:200,layers:[Nz('white',{dur:0.55,env:{a:0.15,d:0.35},filter:bp(3200,400,0.5,4)}),O('sine',880,{pitch:{from:880,to:220,t:0.5},dur:0.55,env:{a:0.1,d:0.4},gain:0.25})]},
  heal:{cls:'fire',dur:0.6,gap:150,layers:[{k:'pluck',f:660,t60:0.35,damp:0.4,bright:0.7,dur:0.5,env:{d:0.48},send:{rev:0.25,room:'plate'}},{k:'pluck',f:990,t60:0.35,damp:0.4,bright:0.7,delay:0.1,dur:0.5,env:{d:0.48},send:{rev:0.25,room:'plate'}}]},
  stim:{cls:'fire',dur:0.22,gap:100,layers:[Nz('white',{dur:0.07,env:{d:0.06},filter:hp(6000)}),O('sawtooth',300,{pitch:{from:300,to:1200,t:0.15},dur:0.2,env:{d:0.19},gain:0.6,filter:lp(4000)})]},
  ack:{cls:'ui',dur:0.14,gap:60,variants:2,seq:true,vary:{pitch:0.03},layers:[O('triangle',480,{only:[0],dur:0.07,env:{d:0.06}}),O('triangle',660,{only:[0],delay:0.05,dur:0.09,env:{d:0.08},gain:0.9}),O('triangle',540,{only:[1],dur:0.07,env:{d:0.06}}),O('triangle',720,{only:[1],delay:0.05,dur:0.09,env:{d:0.08},gain:0.9})]},
  select:{cls:'ui',dur:0.24,gap:60,layers:[O('sine',523,{pitch:{from:523,to:560,t:0.06},dur:0.08,env:{d:0.07}}),O('sine',784,{delay:0.06,dur:0.16,env:{d:0.15}}),O('triangle',1568,{delay:0.06,gain:0.15,dur:0.1,env:{d:0.09}})]},
  shoot:{cls:'fire',dur:0.1,gap:45,layers:[O('square',600,{pitch:{from:620,to:280,t:0.07},env:{d:0.08},filter:lp(3200)}),Nz('white',{dur:0.015,env:{d:0.012},filter:hp(3000),gain:0.5})],vary:{pitch:0.08,filter:0.12,gain:0.08}},
  bolt:{cls:'fire',dur:0.11,gap:50,layers:[O('sawtooth',780,{pitch:{from:780,to:330,t:0.08},env:{d:0.09},filter:lp(5000,1500,0.08)}),O('sine',1200,{pitch:{from:1250,to:600,t:0.05},dur:0.06,env:{d:0.05},gain:0.5})]},
  rocket:{cls:'fire',dur:0.26,gap:90,layers:[Nz('white',{dur:0.25,env:{a:0.01,d:0.23},filter:lp(3000,700,0.22),gain:0.8}),O('sawtooth',210,{pitch:{from:230,to:90,t:0.2},dur:0.22,env:{d:0.2},filter:lp(1200),gain:0.6})]},
  shell:{cls:'impact',dur:0.36,gap:150,layers:[O('sawtooth',95,{pitch:{from:110,to:45,t:0.3},env:{d:0.33},filter:lp(600)}),Nz('white',{dur:0.3,env:{d:0.28},filter:lp(700),gain:0.8}),O('sine',55,{dur:0.3,env:{d:0.28},gain:0.8})]},
  acid:{cls:'fire',dur:0.18,gap:80,layers:[O('sine',320,{pitch:{from:320,to:640,t:0.14},env:{d:0.15},vib:{f:30,cents:60}}),Nz('white',{dur:0.11,env:{d:0.1},filter:hp(3200),gain:0.4}),FM(500,1.4,{from:2,to:0.2},{dur:0.12,env:{d:0.11},gain:0.4})]},
  melee:{cls:'impact',dur:0.1,gap:70,layers:[Nz('white',{dur:0.08,env:{d:0.07},filter:lp(2600)}),O('square',160,{pitch:{from:170,to:90,t:0.07},env:{d:0.07},gain:0.35})]},
  boom:{cls:'boom',dur:0.55,gap:60,layers:[Nz('white',{dur:0.5,env:{d:0.48},filter:lp(1800,300,0.4),gain:1}),O('sine',80,{pitch:{from:95,to:40,t:0.3},env:{d:0.32},gain:1.2}),Nz('brown',{delay:0.02,dur:0.5,env:{a:0.01,d:0.45},filter:lp(400),gain:0.8})]},
  boomBig:{cls:'boom',dur:1.3,gap:120,layers:[Nz('white',{dur:1.1,env:{a:0.008,d:1.0},filter:lp(1400,180,1.0),gain:0.7}),O('sine',58,{pitch:{from:75,to:28,t:0.7},dur:0.9,env:{a:0.01,d:0.85},gain:1}),Nz('brown',{delay:0.05,dur:1.2,env:{a:0.05,d:1.1},gain:1.0,filter:lp(200)}),O('sine',44,{delay:0.1,dur:1.1,env:{a:0.05,d:1.0},gain:0.5,send:{rev:0.15,room:'hall'}})]}
};
const TRIM={'global.acid':0.2956,'global.ack':0.2881,'global.alert':0.6082,'global.alertBase':0.4913,'global.bolt':0.3993,'global.boom':0.7008,'global.boomBig':0.883,'global.cancel':0.2106,'global.click':0.3788,'global.cloak':0.9758,'global.coin':0.267,'global.deliver':0.2172,'global.done':0.7384,'global.era':0.6988,'global.err':0.1385,'global.heal':0.8739,'global.hero':0.6309,'global.heroFall':0.8609,'global.heroRevive':0.5784,'global.level':0.5062,'global.lose':1.2714,'global.melee':1.0984,'global.mine':0.3226,'global.place':0.4759,'global.research':0.2808,'global.rocket':0.8638,'global.select':0.2261,'global.shell':0.5201,'global.shoot':0.267,'global.siege':0.5601,'global.stim':0.7065,'global.supply':0.2209,'global.tab':0.262,'global.toast':0.2398,'global.trade':0.4476,'global.train':0.266,'global.win':0.8831};
for(const id in G0){const d=G0[id];registerVoice('global.'+id,d,{fallback:true,gain:(d.gain||1)*(TRIM['global.'+id]||1)});}
})();

return{init:audioInit,applyVolumes,toggleMute,sfx,sfxUnit,sfxBuilding,registerVoice,registerRenderer,audioVoices,audioRender,audioStats,audioPlay,audioDuck,audioBus,audioA,audioDelay,
  audioOffline:renderOffline,audioMixdown,audioRoom,logReset,audioAnalyse,audioHash,audioClasses,audioOnReady,audioLegacyScore,audioMeter,tone,noiseBurst,mkVoice,VOICES,RENDERERS,resolve,calcPos,CLS,PRIO,hz,S};
})();
/* v5 robustness: audio can never break gameplay.  Every entry point the game calls (the sim calls sfx() from inside step()) catches whatever the Web Audio graph throws,
   counts it (AUD.counters.errors, AUD.lastError) and returns a harmless value.  tests/e2e/e2e_robust_audio.py injects a missing / throwing AudioContext and throwing nodes. */
function audioFault(e){try{AUD.lastError=String(e&&e.message||e);AUD.counters.errors++;}catch(_){}return false;}
function audioInit(){try{AUDIO.init();}catch(e){audioFault(e);}}
function applyVolumes(){try{AUDIO.applyVolumes();}catch(e){audioFault(e);}}
function toggleMute(){try{return AUDIO.toggleMute();}catch(e){audioFault(e);return muted;}}
function sfx(name,x,y,who){try{return AUDIO.sfx(name,x,y,who);}catch(e){return audioFault(e);}}
function sfxUnit(type,ev,x,y,faction){try{return AUDIO.sfxUnit(type,ev,x,y,faction);}catch(e){return audioFault(e);}}
function sfxBuilding(type,ev,x,y,faction){try{return AUDIO.sfxBuilding(type,ev,x,y,faction);}catch(e){return audioFault(e);}}
function registerVoice(id,def,meta){return AUDIO.registerVoice(id,def,meta);}
function registerRenderer(kind,fn){AUDIO.registerRenderer(kind,fn);}
function audioVoices(opt){return AUDIO.audioVoices(opt);}
function audioRender(spec,seconds,sr){return AUDIO.audioRender(spec,seconds,sr);}
function audioStats(){return AUDIO.audioStats();}
function audioPlay(what,opt){try{return AUDIO.audioPlay(what,opt);}catch(e){return audioFault(e);}}
function audioDuck(bus,amount,ms){try{AUDIO.audioDuck(bus,amount,ms);}catch(e){audioFault(e);}}
function audioBus(name){return AUDIO.audioBus(name);}
function audioA(name){return AUDIO.audioA(name);}
function audioDelay(bus,time,fb){AUDIO.audioDelay(bus,time,fb);}
function audioOffline(seconds,sr,build,opt){return AUDIO.audioOffline(seconds,sr,build,opt);}
function audioMixdown(tracks,seconds,sr,opt){return AUDIO.audioMixdown(tracks,seconds,sr,opt);}
function audioRoom(name){return AUDIO.audioRoom(name);}
function audioAnalyse(ch,sr){return AUDIO.audioAnalyse(ch,sr);}
function audioHash(ch,exact){return AUDIO.audioHash(ch,exact);}
function audioClasses(){return AUDIO.audioClasses();}
function audioOnReady(fn){AUDIO.audioOnReady(fn);}
function audioLegacyScore(on){AUDIO.audioLegacyScore(on);}
function audioMeter(){try{return AUDIO.audioMeter();}catch(e){audioFault(e);return{peak:0,rms:0};}}
function tone(f,d,type,v,slide,delay,pan){try{AUDIO.tone(f,d,type,v,slide,delay,pan);}catch(e){audioFault(e);}}
function noiseBurst(d,v,f0,pan,type){try{AUDIO.noiseBurst(d,v,f0,pan,type);}catch(e){audioFault(e);}}
Object.defineProperty(AUD,'ctx',{get(){return AC;}});
Object.assign(AUD,{sfx,sfxUnit,sfxBuilding,init:audioInit,mute:toggleMute,stats:audioStats,registerVoice,registerRenderer,voices:audioVoices,render:audioRender,play:audioPlay,duck:audioDuck,analyse:audioAnalyse,hash:audioHash,
  offline:audioOffline,mixdown:audioMixdown,room:audioRoom,classes:audioClasses,KIT,resolve:AUDIO.resolve,calcPos:AUDIO.calcPos,meter:audioMeter,tone,noiseBurst,audioA,bus:audioBus,delay:audioDelay,onReady:audioOnReady,legacyScore:audioLegacyScore,
  reset(all){const c=AUD.counters;for(const k in c)c[k]=0;AUDIO.logReset();AUD.peakNodes=AUDIO.S.nodes;AUD.lastError='';if(all)for(const v of AUDIO.VOICES.values()){v.last=-1e9;v.pend=0;v.n=0;v.bad=0;v.mute=false;}}});
