/* =========================================================================
   WORLD SOUND DESIGN — buildings, hero skills, UI / economy / alert / fanfare globals and the cinematic effects (docs/AUDIO_SPEC.md §3, §8; vocabulary 43_vocab.js).
   Everything is synthesised with the voice DSL of 80_audio.js; there is no randomness here (the engine's seeded rng drives the per-instance variation) and no DOM.
   Ids registered (all replace the generic fallbacks of the same id):
     <building>.place|done|die.<faction>   12 buildings x 3 factions; <hub|turret>.fire.<faction>; <hub|generator>.amb.<faction> (quiet hum, audible only near the camera: range .45)
     skill.<id>                            the nine hero skills (meridian family: banner barrage orbital; obsidian: bloodlust shock rampage; aurora: regen veil sing)
     global.<name>                         every SFX_GLOBAL name that is not a legacy unit event (click err tab cancel toast coin mine deliver trade train done place level era win lose alert ...)
     global.era|win|lose.<faction>         the per-faction fanfares (80_audio.js resolve(): sfx('era',x,y,{faction}) and the argument-less sim calls find them)
   HOW THE BUILDING VOICES ARE BUILT. One archetype per (building, event), written once with a handful of PARTS in the Meridian reference pitch: T tone, K struck metal/bell/pluck, R ringing
   noise (a one-node resonator), H held horn/pad, B filtered noise, S sub thump, C click. Every part is rendered with the FACTION'S TIMBRE (docs/AUDIO_SPEC.md §3):
     meridian  harmonic partial sets (strong 2nd/4th) through a lowpass, Karplus-Strong plucks, bar/plate strikes, clean noise, short plate reverb, D major
     obsidian  detuned unison saws + tanh drive, clang ratios, pink noise, driven sub, 0.78x pitch, 30 % longer decay, E phrygian
     aurora    FM bells, glass partials, modal bell strikes, bright airy noise, 1.4x pitch, long 'air' reverb, F-sharp lydian
   so the three faction versions of a sound share contour and rhythm but differ in spectrum, attack, decay and pitch set.
   LOUDNESS. TRIM (below) holds the gain that puts the ACTIVE-WINDOW RMS on the class target (ui -26, fire -22, impact -18, boom -14, alert -17, cine -18, amb -30); it is written by the offline
   calibrator (audioAnalyse on seeds 0..7: mean active level onto the class target, then lowered if needed so the largest peak of those seeds is <= 0.95; the worst case ends 3.3 dB under
   target, inside the +-4 dB window) and checked by tests/audio/world_gate.py (-> tests/out/audio/world_report.json). Fire voices are <= 0.35 s and <= 4 source nodes, booms <= 2.5 s, everything <= 6 s with its tail.
   The file is one closure: no new global names.
   ========================================================================= */
(function(){
'use strict';
const HM=[1,.55,.2,.32,.06,.14,.03];                      // meridian partial set: fundamental + strong 2nd/4th (even-harmonic, "brass-and-servo")
const GLASS=[1,0,0,.3,0,0,.15];
const BELL=[1,2.76,5.4,8.93],BAR=[1,2.32,4.25,6.63],CLANG=[1,1.47,2.09,2.56,3.4],HOLLOW=[1,2.76,5.4],PLATE=[1,1.6,2.7,4.1];
/* q = part-level equalisation: the PEAK of every part (T K S C Rg H, B by filter type) at the same nominal gain is brought to the meridian reference (measured with one note of each
   part through the three renderers; saturated obsidian parts and glassy aurora parts differ by up to 8 dB), so an archetype written once has the same crest in all three factions */
const FP=[
  {id:'meridian',ix:0,pm:1,dm:1,rv:.1,room:'plate',base:62,sc:[0,2,4,5,7,9,11],q:{}},       // D4, D major
  {id:'obsidian',ix:1,pm:.78,dm:1.3,rv:0,room:'plate',base:52,sc:[0,1,3,5,7,8,10],q:{T:1.1,K:1.2,S:.9,C:.6,Rg:.5,H:1.35,bp:.4,lp:.63,hp:.9}},   // E3, E phrygian
  {id:'aurora',ix:2,pm:1.4,dm:1.2,rv:.2,room:'air',base:66,sc:[0,2,4,6,7,9,11],q:{T:1.1,S:1.6,Rg:1.1,H:1.35,bp:1.25,lp:1.2,hp:1.1}}];      // F#4, F# lydian
const FPI={};for(const f of FP)FPI[f.id]=f;
const dflt=(v,d)=>v===undefined?d:v;
const qf=(F,k)=>F.q[k]||1;
const R4=x=>Math.round(x*10000)/10000;
const cfg=(F,o)=>{const r={};for(const k in o){const v=o[k];r[k]=Array.isArray(v)&&k!=='rt'?v[F.ix]:v;}return r;};   // per-faction value: [meridian,obsidian,aurora]
const fl=(a,o)=>{o=o||[];for(let i=0;i<a.length;i++){const x=a[i];if(Array.isArray(x))fl(x,o);else if(x)o.push(x);}return o;};
const nt=(F,d,oc)=>440*Math.pow(2,(F.base+F.sc[((d%7)+7)%7]+12*(Math.floor(d/7)+(oc||0))-69)/12);   // scale degree -> Hz in the faction's key
const snd=(F,k)=>F.rv>0?{rev:R4(F.rv*(k===undefined?1:k)),room:F.room}:undefined;
const mk=(dur,...parts)=>({dur,layers:fl(parts)});
const OB=(F,...p)=>F.ix===1?p:[];                          // layers that only the obsidian version has (separates a collapse from its meridian twin: grinding clang + scrape)

/* ------------------------------------------------------------------ parts (each returns layers) */
/* T tone: f (Hz, meridian reference; abs:1 = already in the faction's key), f2 glide target, t glide time, d decay, a attack, g gain, del delay; s (sustain 0..1) + len + r + dd for held notes;
   cut filter scale; sine: pure sine for meridian; solo: one oscillator; sq: square for obsidian; ratio/idx: aurora FM; trem Hz; vib cents; rm Hz ring-mod (obsidian); pan */
function T(F,q){
  const o=cfg(F,q),ab=o.abs?1:F.pm,f=o.f*ab,f2=(o.f2||o.f)*ab,a=o.a||.003,del=o.del||0,g=dflt(o.g,1)*qf(F,'T'),sus=o.s>0,cut=o.cut||1;
  const d=(o.d||.1)*(sus?1:F.dm),len=sus?o.len:a+d+.01,tg=o.t||d,gl=f2!==f?{from:f,to:f2,t:tg}:undefined;
  const env=sus?{a,d:o.dd||.05,s:o.s,r:o.r||.05}:{a,d},nyq=12000,tr=o.trem?{f:o.trem,depth:.6}:undefined,vb=o.vib?{f:5.6,cents:o.vib}:undefined;
  if(F.ix===0){
    const L={k:'osc',f,pitch:gl,delay:del,dur:len,env,gain:g,trem:tr,vib:vb,send:snd(F),pan:o.pan};
    if(o.sine)L.type='sine';else{L.harm=HM;L.filter={type:'lp',f0:Math.min(f*5*cut,nyq),f1:Math.max(f2*3*cut,250),t:tg};}
    return [L];
  }
  if(F.ix===1)return [{k:'osc',type:o.sq?'square':'sawtooth',f,pitch:gl,unison:o.solo?undefined:{n:2,spread:o.det||16},delay:del,dur:len,env,gain:g*(o.sq?.7:.85),
    filter:{type:'lp',f0:Math.min(f*4*cut,nyq),f1:Math.max(f2*2*cut,200),t:tg,q:.9},drive:dflt(o.drive,.45),rm:o.rm?{f:o.rm,depth:.55}:undefined,trem:tr,vib:vb,pan:o.pan}];
  if(o.solo)return [{k:'osc',harm:GLASS,f,pitch:gl,delay:del,dur:len,env,gain:g*.9,trem:tr,vib:vb,send:snd(F),pan:o.pan}];
  const ix=Math.min(o.idx||2.2,6000/(Math.max(f,f2)*(o.ratio||3.5)));
  return [{k:'fm',f,ratio:o.ratio||3.5,idx:{from:ix,to:ix*.04,t:sus?o.len*.6:d},pitch:gl,delay:del,dur:len,env:sus?env:{a,d:d*1.15},gain:g*.85,trem:tr,vib:vb,send:snd(F),pan:o.pan}];
}
/* K struck / plucked: f, t60 ring time, g, del, n partials, m material 'bar'|'hollow'|'clang'|'plate'|'bell' (meridian: bar unless given; obsidian: clang; aurora: bell), ks:1 = string pluck for meridian/obsidian */
const MAT={bar:BAR,hollow:HOLLOW,clang:CLANG,plate:PLATE,bell:BELL};
function K(F,q){
  const o=cfg(F,q),f=o.f*(o.abs?1:F.pm),del=o.del||0,g=dflt(o.g,1)*qf(F,'K'),t60=(o.t60||.3)*F.dm,len=t60*1.15+.02,nn=o.n||3;
  if(F.ix===2||!o.ks){
    const rt=F.ix===2?BELL:(o.m&&F.ix===0?MAT[o.m]:(F.ix===1?(o.m==='hollow'?HOLLOW:CLANG):BAR));
    return [{k:'pluck',mode:'modal',f,ratios:rt.slice(0,Math.max(2,nn)),tilt:F.ix===2?.55:.6,t60,damp:F.ix===1?1.2:.8,delay:del,dur:len,env:{d:len},gain:g*(F.ix===1?.8:1),drive:F.ix===0?.15:.3,send:snd(F)}];
  }
  const ob=F.ix===1;
  return [{k:'pluck',mode:'ks',f,t60,damp:ob?.85:.45,bright:dflt(o.bright,ob?.35:.7),delay:del,dur:len,env:{d:len},gain:g,drive:ob?.3:.2,send:snd(F)}];
}
/* R ringing noise: ONE node, noise through a high-Q band-pass at f = a struck, pitched "tok / clank" (debris, anvils). f, q, d, g, del, a. A band of width f/q keeps only ~sqrt(q/f) of the noise
   energy, so the gain is compensated (g = 1 rings at about the level of a plucked string) */
function Rg(F,q){
  const o=cfg(F,q),f=o.f*(o.abs?1:F.pm),del=o.del||0,g=dflt(o.g,1)*qf(F,'Rg'),a=o.a||.002,d=(o.d||.15)*F.dm,qq=(o.q||18)*(F.ix===2?1.6:F.ix===1?.55:1);
  /* below ~450 Hz a narrow band holds only a few dozen independent noise samples: its level swings by +-6 dB from one noise draw to the next, so a low "tok" is a three-partial hollow strike instead */
  if(o.f<=450)return K(F,{f:o.f,abs:o.abs,t60:(o.d||.15)*1.5,n:3,g:dflt(o.g,1)*.9,del,m:'hollow'});
  return [{k:'noise',color:'white',delay:del,dur:a+d+.01,env:{a,d},gain:g*.9*Math.sqrt(22050*qq/f),filter:{type:'bp',f0:f,q:qq},drive:F.ix===1?.3:.1,send:snd(F)}];
}
/* H held horn / pad: f, len, a, r, s, g, cut */
function H(F,q){
  const o=cfg(F,q),f=o.f*(o.abs?1:F.pm),del=o.del||0,g=dflt(o.g,1)*qf(F,'H'),a=o.a||.03,len=o.len||.4,env={a,d:.06,s:dflt(o.s,.75),r:o.r||.06},cut=o.cut||1;
  if(F.ix===1)return [{k:'osc',type:'sawtooth',f,unison:{n:3,spread:24},delay:del,dur:len,env,gain:g*.8,filter:{type:'lp',f0:f*2*cut,f1:f*4.5*cut,t:a+.08,q:.9},drive:.35}];
  if(F.ix===2)return [{k:'osc',type:'triangle',f,unison:{n:3,spread:22,pan:.7},delay:del,dur:len,env,gain:g*.9,send:snd(F)}];
  return [{k:'osc',harm:HM,f,delay:del,dur:len,env,gain:g,filter:{type:'lp',f0:f*2*cut,f1:Math.min(f*5*cut,12000),t:a+.08,q:.9},send:snd(F)}];
}
/* B filtered noise: type bp/lp/hp, f0->f1 over t, q, d, a, g, c colour, drive, trem (rapid patter); s/len/r/dd = held rumble. obsidian: pink + drive, lowpass stays low;
   aurora: bright resonant wash (a lowpass becomes a band around 4x the cutoff, bands ring, highs shine) */
function B(F,q){
  const o=cfg(F,q),del=o.del||0,ty=o.type||'bp',g=dflt(o.g,1)*qf(F,ty),a=o.a||.003,sus=o.s>0,d=(o.d||.1)*(sus?1:F.dm),q0=o.q||1,f0=o.f0,f1=o.f1,len=sus?o.len:a+d+.01,tt=o.t||len;
  const env=sus?{a,d:o.dd||.1,s:o.s,r:o.r||.2}:{a,d},tr=o.trem?{f:o.trem,depth:o.td||.85}:undefined;
  /* a long low-passed rumble carries a few Hz of energy whose mean over the sound is not zero (|DC| .015 on some seeds): a 30 Hz high-pass (inaudible on a phone) keeps |DC| under the gate's .01 for every seed */
  const dcf=f=>ty==='lp'&&(sus||o.c==='brown')?[f,{type:'hp',f0:30,q:.7}]:f;
  if(F.ix===1){const lp=ty==='lp';
    return [{k:'noise',color:o.c==='white'?'white':'pink',delay:del,dur:len,env,gain:g*1.1,filter:dcf({type:ty,f0:f0*(lp?.85:F.pm),f1:f1?f1*(lp?.85:F.pm):undefined,t:tt,q:lp?Math.max(q0,.8):q0*.7}),drive:dflt(o.drive,.3),trem:tr}];}
  if(F.ix===2){const lp=ty==='lp',k=lp?Math.min(4,6500/f0):ty==='bp'?1.5:1.5;
    return [{k:'noise',color:'white',delay:del,dur:len,env,gain:g*.9,filter:{type:lp?'bp':ty,f0:f0*k,f1:f1?f1*k:undefined,t:tt,q:lp?1.2:ty==='bp'?Math.max(q0*2,2.2):q0},drive:dflt(o.drive,.08),trem:tr,send:snd(F)}];}
  return [{k:'noise',color:o.c||'white',delay:del,dur:len,env,gain:g,filter:{type:ty,f0,f1,t:tt,q:q0},drive:dflt(o.drive,.12),trem:tr}];
}
/* S sub thump: f -> f2 pitch drop, d, g, del, a; s/len/r/dd = held sub (booms: a flat body keeps the transient from dominating the peak) */
function S(F,q){
  const o=cfg(F,q),f=o.f*F.pm,f2=(o.f2||o.f)*F.pm,del=o.del||0,g=dflt(o.g,1)*qf(F,'S'),a=o.a||.004,sus=o.s>0,k=F.ix===1?F.dm:F.ix===2?.75:1,d=(o.d||.15)*k,len=sus?o.len:a+d+.01;
  const L={k:'osc',type:'sine',f,pitch:{from:f,to:f2,t:sus?len:d},delay:del,dur:len,env:sus?{a,d:o.dd||.1,s:o.s,r:o.r||.15}:{a,d},gain:g};
  if(F.ix===1){L.gain=g*1.1;L.drive=.5;}else if(F.ix===2){L.gain=g*.65;L.send=snd(F,.7);delete L.type;L.harm=GLASS;}
  return [L];
}
/* C click / transient: g, del, f */
function C(F,q){
  const o=cfg(F,q),del=o.del||0,g=dflt(o.g,1)*qf(F,'C');
  if(F.ix===1)return [{k:'noise',color:'pink',delay:del,dur:.03,env:{d:.022},gain:g*1.2,filter:{type:'lp',f0:3200,f1:1200,t:.02},drive:.5}];
  if(F.ix===2){const f=o.f||3400;return [{k:'osc',type:'sine',f,pitch:{from:f,to:f*.75,t:.04},delay:del,dur:.05,env:{d:.04},gain:g*.6,send:snd(F)}];}
  return [{k:'noise',color:'white',delay:del,dur:.02,env:{d:.009},gain:g,filter:{type:'hp',f0:o.f||4500}}];
}
/* a metal clunk (scaffold, hammer, container): sub thump + struck body + click */
const CLK=(F,o)=>[S(F,{f:o.f*.8,f2:o.f*.45,d:.12,g:(o.g||1)*.9,del:o.del||0}),K(F,{f:o.f*2,t60:o.t||.16,n:3,g:(o.g||1)*.8,del:o.del||0,m:o.m||'bar'}),C(F,{g:(o.g||1)*.45,del:o.del||0,f:o.cf||3800})];
/* notes of a jingle in the faction's key: kind 'pluck'|'bell'|'horn'|'tone'; degs scale degrees, o octave, st spacing, len, g */
function JG(F,r){
  const out=[],degs=r.d;
  for(let i=0;i<degs.length;i++){
    const f=nt(F,degs[i],r.o||0),del=(r.del||0)+i*(r.st||.1),g=r.g!==undefined?(Array.isArray(r.g)?r.g[i]:r.g):1;
    if(r.k==='pluck')out.push(K(F,{abs:1,f,del,t60:r.len*2.2,g,n:2,ks:1,bright:r.br}));
    else if(r.k==='bell')out.push(K(F,{abs:1,f,del,t60:r.len*2,g,n:3,m:r.m||'bell'}));
    else if(r.k==='horn')out.push(T(F,{abs:1,f,del,a:r.a||.02,s:r.s||.7,len:r.len,r:r.rel||.06,g,cut:r.cut||1.2,ratio:r.ratio||1,idx:r.idx||1.4}));
    else out.push(T(F,{abs:1,f,del,a:r.a||.003,d:r.len,g,cut:r.cut,sine:r.sine,solo:r.solo,sq:r.sq}));
  }
  return out;
}
/* ------------------------------------------------------------------ BUILDINGS: place (scaffold clunks) / done (jingle in the faction's key) / die (collapse + debris) / fire / amb */
const PLACE={
  hub:F=>mk(.7,CLK(F,{f:105,g:1,t:.22}),CLK(F,{f:135,g:.85,del:.18,t:.22}),T(F,{f:120,f2:360,t:.26,a:.02,d:.3,g:.5,del:.34,cut:.6}),B(F,{type:'hp',f0:4200,a:.01,d:.22,g:.3,del:.32}),S(F,{f:62,f2:34,d:.3,g:1,del:.46})),
  generator:F=>mk(.45,CLK(F,{f:210,g:.55,t:.12}),B(F,{type:'hp',f0:5200,a:.005,d:.2,g:.8,del:.1,trem:42,td:.9}),T(F,{f:1900,f2:420,t:.07,d:.09,g:.8,del:.06,sq:1}),T(F,{f:110,f2:240,t:.3,a:.04,d:.3,g:.8,del:.16,cut:.5})),
  depot:F=>mk(.5,CLK(F,{f:150,g:1,t:.22,m:'hollow'}),CLK(F,{f:190,g:.7,del:.16,t:.2,m:'hollow'}),B(F,{type:'lp',f0:1400,f1:500,d:.12,g:.35,del:.02})),
  siphon:F=>mk(.55,B(F,{type:'bp',f0:1300,q:2.5,a:.01,d:.28,g:1.2,trem:26}),CLK(F,{f:165,g:.5,t:.14,del:.1}),T(F,{f:320,f2:780,t:.18,a:.02,d:.2,g:.8,del:.26,vib:90})),
  habitat:F=>mk(.5,K(F,{f:180,t60:.22,ks:1,bright:.2,g:1,n:2}),S(F,{f:150,f2:80,d:.08,g:.5}),K(F,{f:240,t60:.2,ks:1,bright:.2,g:.8,del:.13,n:2}),T(F,{f:520,d:.25,g:.35,del:.24,sine:1,solo:1}),B(F,{type:'lp',f0:700,d:.1,g:.25})),
  garrison:F=>mk(.6,CLK(F,{f:130,g:1,t:.18,m:'plate'}),CLK(F,{f:130,g:.9,del:.2,t:.18,m:'plate'}),CLK(F,{f:150,g:.8,del:.4,t:.2,m:'plate'}),B(F,{type:'lp',f0:1800,f1:700,d:.2,g:.3,del:.38})),
  armory:F=>mk(.55,K(F,{f:520,t60:.3,n:3,g:1}),C(F,{g:.5}),K(F,{f:620,t60:.28,n:3,g:.9,del:.12}),C(F,{g:.45,del:.12}),K(F,{f:470,t60:.34,n:3,g:.9,del:.25}),C(F,{g:.4,del:.25}),B(F,{type:'hp',f0:6000,a:.01,d:.15,g:.3,del:.25}),S(F,{f:90,f2:55,d:.12,g:.7})),
  forum:F=>mk(.5,K(F,{f:420,t60:.18,n:3,m:'plate',g:1}),C(F,{g:.3,f:3000}),K(F,{f:630,t60:.16,n:2,m:'plate',g:.8,del:.13}),T(F,{f:1046,d:.28,g:.3,del:.22,sine:1,solo:1}),S(F,{f:120,f2:75,d:.1,g:.5})),
  exchange:F=>mk(.45,C(F,{g:.8,f:5500}),C(F,{g:.7,f:5000,del:.06}),C(F,{g:.7,f:6000,del:.11}),C(F,{g:.6,f:5200,del:.16}),K(F,{f:1900,t60:.16,n:3,m:'bell',g:.8,del:.2}),S(F,{f:150,f2:90,d:.1,g:.8,del:.24})),
  foundry:F=>mk(.7,S(F,{f:75,f2:38,d:.26,g:1}),K(F,{f:130,t60:.3,n:3,m:'plate',g:.8}),C(F,{g:.5}),B(F,{type:'lp',f0:300,f1:1400,t:.35,a:.1,d:.35,g:.7,del:.12}),B(F,{type:'hp',f0:3500,a:.15,d:.25,g:.25,del:.25}),CLK(F,{f:110,g:.8,del:.4,t:.25})),
  airfield:F=>mk(.65,CLK(F,{f:190,g:.9,t:.18}),T(F,{f:90,f2:760,t:.5,a:.1,d:.5,g:.5,del:.12,cut:.7}),B(F,{type:'bp',f0:700,f1:4200,t:.4,q:1.2,a:.1,d:.35,g:.6,del:.14}),CLK(F,{f:210,g:.7,del:.34,t:.16})),
  turret:F=>mk(.4,T(F,{f:300,f2:900,t:.18,a:.02,d:.2,g:.9,sq:1}),C(F,{g:.4,del:.17,f:3500}),C(F,{g:.35,del:.25,f:4200}),K(F,{f:520,t60:.14,n:2,g:.5,del:.17}),K(F,{f:610,t60:.12,n:2,g:.4,del:.25}),S(F,{f:115,f2:70,d:.09,g:.45,del:.17}))
};
const DONE={
  hub:F=>mk(.9,JG(F,{k:'pluck',d:[0,4,7],o:0,st:.12,len:.16,g:[1,.9,.9]}),H(F,{abs:1,f:nt(F,0,1),del:.3,len:.5,a:.04,g:.9,s:.7}),K(F,{abs:1,f:nt(F,0,2),t60:.5,n:3,m:'bell',del:.34,g:.6}),S(F,{f:75,f2:50,d:.3,g:.9})),
  generator:F=>mk(.6,T(F,{f:130,f2:760,t:.22,a:.02,d:.26,g:.5,cut:.6}),JG(F,{k:'tone',d:[4,7],o:1,st:.1,len:.13,del:.22,sq:1,g:.8}),B(F,{type:'bp',f0:2600,q:3,a:.02,d:.5,g:.2,trem:50,del:.05})),
  depot:F=>mk(.5,K(F,{f:330,t60:.12,n:2,m:'hollow',g:1}),K(F,{f:440,t60:.12,n:2,m:'hollow',g:.9,del:.1}),JG(F,{k:'bell',d:[4],o:1,len:.3,del:.18,g:.7}),S(F,{f:110,f2:70,d:.08,g:.5})),
  siphon:F=>mk(.55,S(F,{f:95,f2:62,d:.09,g:1}),S(F,{f:95,f2:62,d:.09,g:.9,del:.1}),S(F,{f:95,f2:62,d:.09,g:.8,del:.2}),T(F,{f:200,f2:520,t:.22,a:.03,d:.26,g:.45,del:.12,vib:80}),B(F,{type:'bp',f0:900,f1:300,d:.25,g:.3,del:.1}),JG(F,{k:'bell',d:[4],o:2,len:.2,del:.32,g:.6})),
  habitat:F=>mk(.7,JG(F,{k:'pluck',d:[0,2,4],o:1,st:.1,len:.2,g:.9}),H(F,{abs:1,f:nt(F,0,0),del:.15,len:.5,a:.1,g:.55,s:.6})),
  garrison:F=>mk(.75,T(F,{abs:1,f:nt(F,0,0),a:.015,s:.7,len:.12,g:.9,cut:1.2}),T(F,{abs:1,f:nt(F,0,0),a:.015,s:.7,len:.12,g:.9,del:.15,cut:1.2}),T(F,{abs:1,f:nt(F,4,0),a:.02,s:.7,len:.36,g:1,del:.3,cut:1.2,r:.1}),C(F,{g:.4}),B(F,{type:'hp',f0:3000,d:.1,g:.25,del:.3})),
  armory:F=>mk(.65,K(F,{f:520,t60:.4,n:3,g:1}),C(F,{g:.5}),K(F,{f:780,t60:.3,n:3,g:.8,del:.14}),T(F,{f:300,f2:900,t:.2,a:.03,d:.22,g:.35,del:.28,cut:.6}),B(F,{type:'hp',f0:6500,d:.14,g:.25,del:.12})),
  forum:F=>mk(.95,JG(F,{k:'bell',d:[4,2,0,4],o:1,st:.17,len:.3,g:[.9,.8,.8,1]}),H(F,{abs:1,f:nt(F,0,0),len:.6,a:.1,g:.4,s:.6,del:.05})),
  exchange:F=>mk(.6,C(F,{g:.7,f:5500}),K(F,{abs:1,f:nt(F,7,2),t60:.2,n:3,m:'bell',g:.8,del:.04}),K(F,{abs:1,f:nt(F,9,2),t60:.3,n:3,m:'bell',g:.7,del:.14}),JG(F,{k:'pluck',d:[0,4],o:1,st:.12,len:.2,del:.28,g:.7}),S(F,{f:140,f2:90,d:.08,g:.5,del:.02})),
  foundry:F=>mk(.9,K(F,{f:140,t60:.7,n:3,m:'plate',g:1}),S(F,{f:75,f2:45,d:.3,g:.9}),H(F,{abs:1,f:nt(F,0,-1),len:.6,a:.06,g:.8,s:.7,del:.1}),B(F,{type:'hp',f0:5000,a:.04,d:.35,g:.2,del:.1})),
  airfield:F=>mk(.75,B(F,{type:'bp',f0:400,f1:5000,t:.5,q:1.2,a:.15,d:.35,g:.8}),T(F,{f:300,f2:1400,t:.4,a:.1,d:.4,g:.35,cut:.8}),JG(F,{k:'tone',d:[4,4],o:2,st:.12,len:.08,del:.5,sine:1,solo:1,g:.7})),
  turret:F=>mk(.45,T(F,{f:200,f2:600,t:.15,a:.02,d:.16,g:.5,sq:1}),C(F,{g:.7,del:.15}),C(F,{g:.6,del:.21}),K(F,{abs:1,f:nt(F,7,2),t60:.2,n:3,m:'bell',g:.7,del:.25}))
};
/* collapse: crack, a held rumble + sub (flat body: the transient cannot dominate the peak), debris hits (ringing noise = 1 node each), dust */
const DIE={
  hub:F=>mk(2.4,C(F,{g:.35}),B(F,{type:'hp',f0:2500,a:.004,d:.18,g:.35}),B(F,{c:'brown',type:'lp',f0:2200,f1:90,t:2.0,a:.015,s:.55,dd:.35,len:2.0,r:.5,g:[1.2,.5,1.2]}),S(F,{f:60,f2:22,a:.02,s:.7,dd:.2,len:1.6,r:.6,g:.6}),
    Rg(F,{f:180,q:10,d:.5,g:.5,del:.1}),Rg(F,{f:260,q:12,d:.4,g:.4,del:.35}),Rg(F,{f:150,q:9,d:.45,g:.4,del:.62}),Rg(F,{f:320,q:12,d:.3,g:.3,del:.95}),
    B(F,{type:'hp',f0:4500,a:.06,s:.3,dd:.3,len:1.2,r:.6,g:.25,del:.15}),S(F,{f:45,f2:20,d:.5,g:.5,del:1.1}),OB(F,K(F,{f:260,t60:1.2,n:5,g:2.6,del:.05}),B(F,{type:'bp',f0:2600,q:.8,a:.02,s:.5,dd:.2,len:1.2,r:.5,g:1.8,trem:14,td:.8,del:.1}))),
  generator:F=>mk(1.1,C(F,{g:.3}),S(F,{f:95,f2:40,d:.3,g:.65}),B(F,{type:'lp',f0:3000,f1:300,t:.5,a:.005,d:.5,g:.6}),B(F,{type:'hp',f0:5500,a:.01,s:.6,dd:.1,len:.7,r:.2,g:.65,trem:35,del:.1}),T(F,{f:1500,f2:150,t:.6,a:.01,d:.6,g:.5,sq:1,del:.05,cut:.8}),Rg(F,{f:240,q:10,d:.3,g:.6,del:.3})),
  depot:F=>mk(1.1,C(F,{g:.4}),S(F,{f:110,f2:55,d:.3,g:.9}),B(F,{type:'lp',f0:1800,f1:300,t:.6,a:.004,d:.5,g:.8}),Rg(F,{f:210,q:8,d:.35,g:.8,del:.04}),K(F,{f:280,t60:.4,n:3,m:'hollow',g:.7,del:.12}),Rg(F,{f:340,q:10,d:.3,g:.6,del:.33}),Rg(F,{f:190,q:8,d:.3,g:.6,del:.52}),B(F,{type:'bp',f0:2500,q:1,a:.02,d:.5,g:.2,del:.1})),
  siphon:F=>mk(1.3,C(F,{g:.35}),S(F,{f:85,f2:38,d:.4,g:.8}),B(F,{type:'hp',f0:3500,f1:1500,t:.9,a:.02,s:.6,dd:.2,len:.8,r:.4,g:.6}),B(F,{c:'brown',type:'lp',f0:900,f1:120,t:1.0,a:.01,d:.9,g:.8}),T(F,{f:260,f2:80,t:.7,a:.02,d:.7,g:.35,vib:120,del:.1}),Rg(F,{f:300,q:10,d:.3,g:.5,del:.45})),
  habitat:F=>mk(1.0,C(F,{g:.3}),S(F,{f:100,f2:55,d:.25,g:.7}),B(F,{type:'lp',f0:1400,f1:250,t:.6,a:.01,d:.5,g:.7}),K(F,{f:180,t60:.25,n:2,ks:1,bright:.25,g:.9,del:.02}),K(F,{f:230,t60:.2,n:2,ks:1,bright:.25,g:.7,del:.16}),B(F,{type:'hp',f0:5500,a:.01,d:.4,g:.35,del:.05}),Rg(F,{f:1900,q:20,d:.25,g:.4,del:.28}),OB(F,S(F,{f:70,f2:34,d:.35,g:.9}),B(F,{type:'bp',f0:1400,q:.8,d:.35,g:.6,trem:20,td:.9,del:.04}))),
  garrison:F=>mk(1.8,C(F,{g:.3}),B(F,{c:'brown',type:'lp',f0:1800,f1:100,t:1.5,a:.01,s:.5,dd:.3,len:1.4,r:.45,g:[1.1,.3,1.1]}),S(F,{f:65,f2:26,a:.015,s:.6,dd:.2,len:1.2,r:.5,g:.55}),Rg(F,{f:140,q:6,d:.4,g:.7,del:.05}),Rg(F,{f:200,q:8,d:.35,g:.6,del:.3}),Rg(F,{f:120,q:6,d:.4,g:.6,del:.55}),B(F,{type:'bp',f0:1200,f1:500,t:1,q:.8,a:.08,s:.4,dd:.2,len:.9,r:.4,g:.4,del:.1}),B(F,{type:'hp',f0:3500,a:.05,d:.6,g:.2,del:.2}),OB(F,K(F,{f:420,t60:1,n:5,g:2,del:.04}),B(F,{type:'bp',f0:3000,q:.8,a:.02,s:.5,dd:.2,len:.9,r:.4,g:1.4,trem:16,td:.8,del:.1}))),
  armory:F=>mk(1.7,C(F,{g:.5}),B(F,{type:'lp',f0:3500,f1:300,t:1.2,a:.004,s:.45,dd:.2,len:1.2,r:.5,g:1.1}),S(F,{f:75,f2:30,a:.01,s:.65,dd:.15,len:1.0,r:.5,g:.55}),K(F,{f:260,t60:.6,n:2,g:.6,del:.1}),K(F,{f:380,t60:.5,n:2,g:.5,del:.28}),K(F,{f:300,t60:.5,n:2,g:.5,del:.5}),B(F,{type:'hp',f0:5000,a:.03,d:.5,g:.35,del:.1})),
  forum:F=>mk(1.6,C(F,{g:.4}),B(F,{c:'brown',type:'lp',f0:1500,f1:90,t:1.4,a:.015,s:.5,dd:.3,len:1.3,r:.45,g:[1,.5,1]}),S(F,{f:62,f2:26,a:.02,s:.55,dd:.2,len:1.1,r:.5,g:.5}),K(F,{f:420,t60:.9,n:3,m:'plate',g:.5,del:.04}),Rg(F,{f:520,q:16,d:.4,g:.5,del:.2}),Rg(F,{f:380,q:14,d:.4,g:.5,del:.45}),B(F,{type:'hp',f0:4000,a:.05,d:.6,g:.25,del:.15}),OB(F,K(F,{f:600,t60:.8,n:5,g:1.5,del:.03}),B(F,{type:'bp',f0:2000,q:.8,a:.02,s:.5,dd:.2,len:.8,r:.4,g:1,trem:18,td:.8,del:.1}))),
  exchange:F=>mk(1.7,C(F,{g:.4}),B(F,{c:'brown',type:'lp',f0:1800,f1:100,t:1.4,a:.01,s:.5,dd:.3,len:1.3,r:.45,g:[1,.6,1]}),S(F,{f:66,f2:28,a:.015,s:.55,dd:.2,len:1.0,r:.5,g:.5}),Rg(F,{f:2800,q:30,d:.2,g:.5,del:.1}),Rg(F,{f:3400,q:30,d:.2,g:.5,del:.19}),Rg(F,{f:2400,q:30,d:.2,g:.5,del:.27}),Rg(F,{f:3100,q:30,d:.22,g:.4,del:.4}),Rg(F,{f:2700,q:30,d:.25,g:.4,del:.52}),B(F,{type:'bp',f0:1500,q:1,a:.05,d:.6,g:.3,del:.12}),OB(F,K(F,{f:700,t60:.8,n:5,g:1.5,del:.05}),B(F,{type:'bp',f0:3200,q:.8,a:.02,s:.5,dd:.2,len:.9,r:.4,g:1,trem:20,td:.8,del:.1}))),
  foundry:F=>mk(2.0,C(F,{g:.4}),B(F,{type:'lp',f0:2800,f1:120,t:1.7,a:.02,s:.6,dd:.3,len:1.6,r:.5,g:1.2}),S(F,{f:55,f2:22,a:.02,s:.7,dd:.2,len:1.3,r:.6,g:.6}),K(F,{f:130,t60:.9,n:3,m:'plate',g:.6,del:.05}),B(F,{type:'hp',f0:2500,f1:1200,t:1.0,a:.1,s:.35,dd:.3,len:1.0,r:.4,g:.35,del:.1}),Rg(F,{f:200,q:8,d:.4,g:.5,del:.6}),S(F,{f:50,f2:24,d:.4,g:.5,del:1.0})),
  airfield:F=>mk(2.0,C(F,{g:.4}),B(F,{type:'lp',f0:3500,f1:150,t:1.6,a:.01,s:.55,dd:.25,len:1.5,r:.5,g:1.1}),S(F,{f:60,f2:24,a:.015,s:.65,dd:.2,len:1.2,r:.5,g:.5}),T(F,{f:2200,f2:120,t:1.2,a:.02,d:1.2,g:.35,sine:1,cut:.9,del:.05}),B(F,{type:'bp',f0:600,f1:3000,t:.8,q:1,a:.05,d:.7,g:.5,del:.05}),Rg(F,{f:240,q:8,d:.4,g:.5,del:.7}),OB(F,K(F,{f:350,t60:1,n:5,g:1.5,del:.05}),B(F,{type:'bp',f0:2800,q:.8,a:.02,s:.5,dd:.2,len:1,r:.4,g:1,trem:15,td:.8,del:.1}))),
  turret:F=>mk(.9,C(F,{g:.5}),S(F,{f:100,f2:42,d:.3,g:.9}),B(F,{type:'lp',f0:3000,f1:350,t:.5,a:.004,d:.5,g:.9}),K(F,{f:300,t60:.3,n:2,g:.6,del:.06}),Rg(F,{f:380,q:12,d:.25,g:.5,del:.3}),T(F,{f:1600,f2:300,t:.3,d:.3,g:.25,sq:1,cut:.8}))
};
/* fire (hub: heavy defence bolt, turret: sharp quick bolt): <= 0.35 s, <= 4 source nodes */
const FIRE={
  hub:F=>mk(.3,T(F,{f:1100,f2:160,t:.14,d:.2,g:1,solo:1,det:0}),S(F,{f:110,f2:55,d:.16,g:.8}),F.ix===1?B(F,{type:'lp',f0:2500,d:.1,g:.5}):C(F,{g:.5})),
  turret:F=>mk(.18,T(F,{f:2400,f2:520,t:.07,d:.12,g:.9,solo:1,sq:1}),C(F,{g:.5}),F.ix===1?S(F,{f:150,f2:80,d:.08,g:.6}):B(F,{type:'hp',f0:6000,d:.04,g:.4}))
};
/* ambient hum (quiet, class amb, audible only when the camera is near: range .45); hold 2.6 s with a 0.4 s fade in / 0.6 s out: re-trigger every ~2.2 s (poly 2 = a seamless crossfade) */
const HE={a:.4,d:.05,s:1,r:.6};
const AMB={
  hub:F=>F.ix===0?mk(2.6,{k:'osc',type:'sine',f:55,dur:2.6,env:HE,trem:{f:.4,depth:.4}},{k:'osc',harm:HM,f:110,dur:2.6,env:HE,gain:.4,filter:{type:'lp',f0:400},trem:{f:.6,depth:.3}},{k:'noise',color:'brown',dur:2.6,env:HE,gain:.3,filter:{type:'lp',f0:200}})
    :F.ix===1?mk(2.6,{k:'osc',type:'sawtooth',f:41,unison:{n:3,spread:18},dur:2.6,env:HE,gain:.8,filter:{type:'lp',f0:160,q:.9},drive:.3},{k:'noise',color:'pink',dur:2.6,env:HE,gain:.7,filter:{type:'bp',f0:90,q:.6},trem:{f:.8,depth:.5}})
    :mk(2.6,{k:'fm',f:220,ratio:2,idx:.6,dur:2.6,env:HE,send:{rev:.3,room:'air'}},{k:'osc',harm:GLASS,f:880,dur:2.6,env:HE,gain:.4,trem:{f:4.5,depth:.35},send:{rev:.3,room:'air'}},{k:'osc',type:'triangle',f:330,unison:{n:2,spread:14,pan:.8},dur:2.6,env:HE,gain:.5}),
  generator:F=>F.ix===0?mk(2.6,{k:'osc',type:'sine',f:100,dur:2.6,env:HE},{k:'osc',type:'sine',f:200,dur:2.6,env:HE,gain:.4},{k:'noise',color:'white',dur:2.6,env:HE,gain:.12,filter:{type:'bp',f0:2400,q:5}})
    :F.ix===1?mk(2.6,{k:'osc',type:'square',f:50,dur:2.6,env:HE,filter:{type:'lp',f0:200},drive:.4},{k:'noise',color:'pink',dur:2.6,env:HE,gain:.4,filter:{type:'bp',f0:1800,q:1},trem:{f:50,depth:.5}})
    :mk(2.6,{k:'osc',type:'sine',f:330,dur:2.6,env:HE,send:{rev:.3,room:'air'}},{k:'osc',type:'sine',f:331.5,dur:2.6,env:HE,send:{rev:.3,room:'air'}},{k:'fm',f:990,ratio:2,idx:.4,dur:2.6,env:HE,gain:.3})
};
const ARCH={place:PLACE,done:DONE,die:DIE,fire:FIRE,amb:AMB};
const BIG={hub:1,garrison:1,armory:1,forum:1,exchange:1,foundry:1,airfield:1};
const BCLS=(b,e)=>e==='place'||e==='done'?'impact':e==='die'?(BIG[b]?'boom':'impact'):e==='fire'?'fire':'amb';
const RVS={place:.5,done:.7,die:.35,fire:0,amb:1};                        // reverb send scale per event: a tail inside the loudness window lowers its RMS and pushes the transient over the peak limit
const BVARY={place:{pitch:.03,filter:.08,gain:.05},done:{pitch:.012,filter:.06},die:{pitch:.03,filter:.08},fire:{pitch:.05,filter:.12,gain:.08},amb:{}};
/*TRIM:BEGIN*/
const TRIM={'airfield.die.aurora':0.6461,'airfield.die.meridian':0.6647,'airfield.die.obsidian':0.3541,'airfield.done.aurora':1.3524,'airfield.done.meridian':1.3548,'airfield.done.obsidian':0.9653,'airfield.place.aurora':0.5948,'airfield.place.meridian':0.6556,'airfield.place.obsidian':0.5279,'armory.die.aurora':0.6144,'armory.die.meridian':0.6478,'armory.die.obsidian':0.5039,'armory.done.aurora':0.5404,'armory.done.meridian':0.56,'armory.done.obsidian':0.4328,'armory.place.aurora':0.4007,'armory.place.meridian':0.4487,'armory.place.obsidian':0.3426,'depot.die.aurora':0.4916,'depot.die.meridian':0.5419,'depot.die.obsidian':0.4063,'depot.done.aurora':0.6161,'depot.done.meridian':0.5658,'depot.done.obsidian':0.4632,'depot.place.aurora':0.4938,'depot.place.meridian':0.5978,'depot.place.obsidian':0.4302,'exchange.die.aurora':0.6108,'exchange.die.meridian':0.426,'exchange.die.obsidian':0.3927,'exchange.done.aurora':0.6156,'exchange.done.meridian':0.6736,'exchange.done.obsidian':0.4483,'exchange.place.aurora':0.8932,'exchange.place.meridian':0.961,'exchange.place.obsidian':0.6343,'forum.die.aurora':0.564,'forum.die.meridian':0.5159,'forum.die.obsidian':0.3781,'forum.done.aurora':0.3962,'forum.done.meridian':0.3805,'forum.done.obsidian':0.3033,'forum.place.aurora':0.5885,'forum.place.meridian':0.6593,'forum.place.obsidian':0.5423,'foundry.die.aurora':0.4581,'foundry.die.meridian':0.5204,'foundry.die.obsidian':0.4253,'foundry.done.aurora':0.4944,'foundry.done.meridian':0.3684,'foundry.done.obsidian':0.238,'foundry.place.aurora':0.6201,'foundry.place.meridian':0.6051,'foundry.place.obsidian':0.4406,'garrison.die.aurora':0.4897,'garrison.die.meridian':0.4904,'garrison.die.obsidian':0.319,'garrison.done.aurora':0.4555,'garrison.done.meridian':0.426,'garrison.done.obsidian':0.2604,'garrison.place.aurora':0.5121,'garrison.place.meridian':0.6671,'garrison.place.obsidian':0.4921,'generator.amb.aurora':0.0463,'generator.amb.meridian':0.0488,'generator.amb.obsidian':0.0379,'generator.die.aurora':0.6526,'generator.die.meridian':0.7004,'generator.die.obsidian':0.5531,'generator.done.aurora':1.1917,'generator.done.meridian':1.2155,'generator.done.obsidian':0.7287,'generator.place.aurora':0.668,'generator.place.meridian':0.8401,'generator.place.obsidian':0.508,'global.alert':0.7546,'global.alertBase':0.3452,'global.cancel':0.2174,'global.click':0.4324,'global.cloak':0.8434,'global.coin':0.2805,'global.deliver':0.3051,'global.done':0.4587,'global.era':0.5339,'global.era.aurora':0.3243,'global.era.meridian':0.2982,'global.era.obsidian':0.1801,'global.err':0.2248,'global.heal':0.7913,'global.hero':0.3849,'global.heroFall':0.8324,'global.heroRevive':0.5747,'global.level':0.6867,'global.lose':0.7094,'global.lose.aurora':0.318,'global.lose.meridian':0.3885,'global.lose.obsidian':0.181,'global.mine':0.3103,'global.place':0.5869,'global.research':0.2768,'global.siege':0.5396,'global.stim':0.7383,'global.supply':0.2332,'global.tab':0.1949,'global.toast':0.2541,'global.trade':0.5431,'global.train':0.266,'global.win':0.6252,'global.win.aurora':0.2647,'global.win.meridian':0.2653,'global.win.obsidian':0.1523,'habitat.die.aurora':0.5337,'habitat.die.meridian':0.6401,'habitat.die.obsidian':0.3338,'habitat.done.aurora':0.454,'habitat.done.meridian':0.551,'habitat.done.obsidian':0.3292,'habitat.place.aurora':0.5335,'habitat.place.meridian':0.6905,'habitat.place.obsidian':0.5216,'hub.amb.aurora':0.0522,'hub.amb.meridian':0.0591,'hub.amb.obsidian':0.0592,'hub.die.aurora':0.5241,'hub.die.meridian':0.4593,'hub.die.obsidian':0.2777,'hub.done.aurora':0.4175,'hub.done.meridian':0.3705,'hub.done.obsidian':0.2317,'hub.fire.aurora':0.3712,'hub.fire.meridian':0.3046,'hub.fire.obsidian':0.2142,'hub.place.aurora':0.5576,'hub.place.meridian':0.5915,'hub.place.obsidian':0.4499,'siphon.die.aurora':0.5625,'siphon.die.meridian':0.4789,'siphon.die.obsidian':0.4254,'siphon.done.aurora':0.9578,'siphon.done.meridian':0.7476,'siphon.done.obsidian':0.5029,'siphon.place.aurora':1.0222,'siphon.place.meridian':1.2036,'siphon.place.obsidian':0.7016,'skill.banner':0.2959,'skill.barrage':0.5174,'skill.bloodlust':0.4691,'skill.orbital':0.4048,'skill.rampage':0.2588,'skill.regen':0.4641,'skill.shock':0.3147,'skill.sing':0.3287,'skill.veil':1.1116,'turret.die.aurora':0.5376,'turret.die.meridian':0.6108,'turret.die.obsidian':0.4298,'turret.done.aurora':1.1769,'turret.done.meridian':1.1907,'turret.done.obsidian':0.7796,'turret.fire.aurora':0.4891,'turret.fire.meridian':0.4389,'turret.fire.obsidian':0.279,'turret.place.aurora':0.769,'turret.place.meridian':0.8686,'turret.place.obsidian':0.5721};
/*TRIM:END*/
for(const e in ARCH)for(const b in ARCH[e])for(const F of FP){
  const id=b+'.'+e+'.'+F.id,def=ARCH[e][b](F);
  for(const L of def.layers)if(L.send){L.send.rev=R4(L.send.rev*RVS[e]);if(F.ix===2)L.send.room=e==='done'?'hall':'plate';}
  const o={dur:def.dur,layers:def.layers,cls:BCLS(b,e),gain:TRIM[id]||1,vary:BVARY[e]};
  if(e==='amb'){o.range=.45;o.poly=2;o.gap=900;}
  registerVoice(id,o);
}
/* ------------------------------------------------------------------ HERO SKILLS: the three hero families keep their faction's timbre (Idris/meridian: banner barrage orbital; Kaz/obsidian: bloodlust shock rampage; Lyra/aurora: regen veil sing) */
const FM_=FPI.meridian,FO_=FPI.obsidian,FA_=FPI.aurora;
const VOWH=(v,k)=>KIT.vowels[v].map(x=>[x[0],x[1]*(k||.5),x[2]]);   // half the resonator Q: a vowel colour that does not swing in level with the seeded pitch variation
const SKILL={
  /* meridian */
  banner:{cls:'impact',def:()=>{const F=FM_;return mk(.95,T(F,{abs:1,f:nt(F,0,-1),a:.12,s:.7,len:.7,r:.15,g:1,cut:1.1}),T(F,{abs:1,f:nt(F,4,-1),a:.15,s:.7,len:.65,r:.15,g:.7,cut:1.1,del:.03}),
    K(F,{abs:1,f:nt(F,0,1),t60:.5,n:3,m:'bell',del:.1,g:.5}),S(F,{f:70,f2:50,d:.25,g:.7}),S(F,{f:70,f2:50,d:.25,g:.55,del:.45}));}},
  barrage:{cls:'boom',def:()=>{const F=FM_,wh=(f0,f1,del)=>({k:'osc',type:'sine',f:f0,pitch:{from:f0,to:f1,t:.5},delay:del,dur:.52,env:{a:.06,d:.44},gain:.55,filter:{type:'lp',f0:4500},send:{rev:.08,room:'plate'}});
    return mk(1.7,wh(3200,1000,0),wh(2800,900,.12),wh(3600,1100,.24),
      [0,.12,.26].map((d,i)=>[S(F,{f:85-i*6,f2:38,d:.3,g:.7,del:.62+d}),B(F,{type:'lp',f0:3000,f1:300,t:.35,d:.35,g:.6,del:.62+d}),C(F,{g:.2,del:.62+d})]),
      B(F,{c:'brown',type:'lp',f0:700,f1:120,t:.9,a:.05,s:.7,dd:.15,len:.95,r:.35,g:.9,drive:.5,del:.6}));}},
  orbital:{cls:'boom',def:()=>{const F=FM_;return mk(2.4,
    {k:'osc',type:'sawtooth',f:120,pitch:{from:120,to:2600,t:1.2,curve:'exp'},dur:1.3,env:{a:.5,d:.7,s:.0001},filter:{type:'lp',f0:500,f1:6000,t:1.2},gain:.85},
    {k:'osc',type:'sine',f:600,pitch:{from:600,to:4200,t:1.2},dur:1.3,env:{a:.6,d:.65},gain:.55},
    {k:'noise',color:'white',dur:1.3,env:{a:.9,d:.35},filter:{type:'bp',f0:300,f1:6500,t:1.2,q:1.5},gain:1.1,drive:.1},
    B(F,{type:'hp',f0:2200,a:.003,d:.25,g:.8,del:1.26}),C(F,{g:.5,del:1.26}),
    {k:'osc',type:'sawtooth',f:90,pitch:{from:900,to:90,t:.35},delay:1.26,dur:.4,env:{d:.38},gain:.45,filter:{type:'lp',f0:3000}},
    S(F,{f:70,f2:24,a:.01,s:.8,dd:.2,len:1.0,r:.5,g:.9,del:1.26}),B(F,{c:'brown',type:'lp',f0:1800,f1:80,t:1.1,a:.01,s:.6,dd:.3,len:1.0,r:.4,g:1,del:1.26}));}},
  /* obsidian */
  shock:{cls:'boom',def:()=>{const F=FO_;return mk(1.5,C(F,{g:.5}),B(F,{type:'lp',f0:2500,f1:200,t:.35,d:.4,g:1}),T(F,{f:120,f2:45,t:.3,a:.004,d:.4,g:.8,det:22}),
    S(F,{f:62,f2:26,a:.01,s:.75,dd:.2,len:1.1,r:.5,g:.95,del:.03}),S(F,{f:45,f2:24,d:.5,g:.5,del:.5}),
    Rg(F,{f:150,q:8,d:.4,g:.6,del:.12}),Rg(F,{f:210,q:9,d:.35,g:.5,del:.3}),B(F,{type:'hp',f0:3000,a:.04,d:.55,g:.25,del:.1}));}},
  rampage:{cls:'impact',def:()=>{const F=FO_;return mk(1.5,
    {k:'formant',src:'sawtooth',f:95,pitch:{from:105,to:70,t:1.0},formants:VOWH('a'),to:'o',morph:.7,scale:.6,dur:1.2,env:{a:.06,d:.1,s:.7,r:.4},gain:1,drive:.5,trem:{f:14,depth:.35}},
    [0,.18,.36,.54,.72].map((d,i)=>[S(F,{f:92-i*3,f2:52,d:.22,g:.9-i*.04,del:.1+d}),B(F,{type:'lp',f0:900,d:.1,g:.5,del:.1+d})]),
    B(F,{type:'bp',f0:1600,f1:700,t:1.0,q:.8,a:.1,s:.5,dd:.2,len:.9,r:.3,g:.25,del:.1}));}},
  bloodlust:{cls:'impact',def:()=>{const F=FO_;return mk(1.05,S(F,{f:80,f2:48,d:.18,g:1}),S(F,{f:80,f2:48,d:.18,g:.8,del:.14}),S(F,{f:84,f2:50,d:.18,g:1,del:.5}),S(F,{f:84,f2:50,d:.18,g:.8,del:.64}),
    T(F,{f:70,a:.15,s:.6,len:.85,r:.2,g:.6,rm:35,trem:9}),B(F,{type:'bp',f0:400,a:.1,s:.5,dd:.2,len:.8,r:.25,g:.3,trem:12,del:.02}));}},
  /* aurora */
  regen:{cls:'impact',def:()=>{const F=FA_;return mk(1.15,JG(F,{k:'bell',d:[0,2,4],o:1,st:.14,len:.32,g:[.9,.9,1]}),H(F,{abs:1,f:nt(F,0,0),del:.05,len:.8,a:.15,g:.35,s:.5}),B(F,{type:'hp',f0:5000,a:.1,d:.7,g:.12,del:.3}));}},
  veil:{cls:'impact',def:()=>{const F=FA_;return mk(1.4,B(F,{type:'bp',f0:5000,f1:600,t:1.1,q:2,a:.25,d:.95,g:1}),T(F,{f:1800,f2:400,t:1,a:.1,d:1.0,g:.5}),K(F,{abs:1,f:nt(F,4,2),t60:.5,n:3,del:.9,g:.4}));}},
  sing:{cls:'impact',def:()=>{const F=FA_;return mk(2.0,
    B(F,{type:'bp',f0:300,f1:3500,t:1.6,q:1.2,a:.5,s:.5,dd:.3,len:1.5,r:.5,g:.5,trem:3}),
    JG(F,{k:'bell',d:[0,2,4,7],o:2,st:.28,len:.5,del:.35,g:[.5,.6,.7,.8]}),S(F,{f:60,f2:40,d:.6,g:.8}));}}
};
for(const id in SKILL){const s=SKILL[id],d=s.def();registerVoice('skill.'+id,{dur:d.dur,layers:d.layers,cls:s.cls,prio:'hero',gain:TRIM['skill.'+id]||1,gap:150});}
/* ------------------------------------------------------------------ GLOBALS: UI / economy / alerts / fanfares. Raw DSL layers (O osc, Z noise, M fm, P string pluck, D modal strike) */
const O=(type,f,o)=>Object.assign({k:'osc',type,f},o),Z=(color,o)=>Object.assign({k:'noise',color},o),M=(f,ratio,idx,o)=>Object.assign({k:'fm',f,ratio,idx},o);
/* P string pluck / D modal strike: the strike's OWN decay shapes the sound (t60 = -80 dB time of the fundamental, partial i rings t60/(1+damp*i)); the layer envelope only holds and releases.
   (An exponential layer envelope on top would square the decay: a "0.3 s" bell was -50 dB after 100 ms, a 22 dB crest.) tilt .4: each upper partial 8 dB down (all partials start in phase). */
const P=(f,o)=>{const t=(o&&o.t60)||.3,r=Object.assign({k:'pluck',mode:'ks',f,damp:.4,bright:.6},o);r.t60=t;r.dur=t*.9+.08;r.env={a:.002,d:.01,s:1,r:.08};return r;};
const D=(f,ratios,o)=>{const t=(o&&o.t60)||.4,r=Object.assign({k:'pluck',mode:'modal',f,ratios,tilt:.4,damp:.3},o);r.t60=t;r.dur=t+.06;r.env={a:.002,d:.01,s:1,r:.05};return r;};
const lp=(f0,f1,t,q)=>({type:'lp',f0,f1,t,q}),hp=(f0,f1,t)=>({type:'hp',f0,f1,t}),bp=(f0,f1,t,q)=>({type:'bp',f0,f1,t,q});
const hz=n=>KIT.hz(n);
const fit=d=>{let m=d.dur;for(const L of d.layers)m=Math.max(m,(L.delay||0)+(L.dur||0));d.dur=Math.round(m*100)/100;return d;};   // declared length = end of the last layer (the gate bounds the audible end by dur + tail)
const GLB={
  /* ---- ui (-26) */
  click:{cls:'ui',dur:.06,layers:[Z('white',{dur:.02,env:{d:.012},gain:.6,filter:hp(3500)}),O('sine',1900,{pitch:{from:2100,to:1500,t:.03},dur:.05,env:{d:.035},gain:.5})]},
  tab:{cls:'ui',dur:.1,layers:[D(600,[1,2.2,3.9],{t60:.07,dur:.09,env:{d:.08},gain:1}),O('sine',900,{pitch:{from:900,to:700,t:.04},dur:.05,env:{d:.04},gain:.4})]},
  err:{cls:'ui',dur:.3,gap:200,layers:[O('sawtooth',150,{dur:.12,env:{a:.004,d:.11},filter:lp(900,0,0,1),drive:.3}),O('sawtooth',156,{dur:.12,env:{a:.004,d:.11},filter:lp(900),gain:.6,detune:15}),
    O('sawtooth',140,{delay:.15,dur:.14,env:{a:.004,d:.13},filter:lp(800),drive:.3}),O('sawtooth',146,{delay:.15,dur:.14,env:{a:.004,d:.13},filter:lp(800),gain:.6,detune:15})]},
  cancel:{cls:'ui',dur:.16,layers:[O('sine',520,{pitch:{from:520,to:280,t:.12},env:{d:.13}}),Z('pink',{dur:.08,env:{d:.07},gain:.3,filter:lp(900)})]},
  toast:{cls:'ui',dur:.36,layers:[M(880,3.5,{from:2.2,to:.1},{env:{a:.003,d:.32},send:{rev:.25,room:'plate'}}),O('sine',1760,{gain:.18,dur:.24,env:{d:.22}})]},
  coin:{cls:'ui',dur:.34,gap:60,layers:[D(2093,[1,2.4,4.1],{t60:.14,dur:.16,env:{d:.14}}),D(3136,[1,2.4,4.1],{delay:.07,t60:.26,dur:.28,env:{d:.26},gain:.8,send:{rev:.12,room:'plate'}}),Z('white',{dur:.02,env:{d:.012},gain:.35,filter:hp(6000)})]},
  mine:{cls:'ui',dur:.1,layers:[Z('white',{dur:.04,env:{d:.03},gain:.6,filter:bp(2400,0,0,3)}),O('sine',320,{pitch:{from:320,to:170,t:.05},dur:.06,env:{d:.055},gain:.7})]},
  deliver:{cls:'ui',dur:.2,layers:[O('sine',200,{pitch:{from:200,to:110,t:.1},dur:.12,env:{d:.1},gain:.8}),Z('pink',{delay:.03,dur:.14,env:{d:.12},gain:.5,filter:lp(1500)})]},
  trade:{cls:'ui',dur:.46,layers:[P(880,{t60:.25,damp:.4,bright:.7,dur:.3,env:{d:.28}}),P(1175,{delay:.09,t60:.25,damp:.4,bright:.7,dur:.3,env:{d:.28}}),P(1568,{delay:.18,t60:.4,damp:.4,bright:.7,dur:.32,env:{d:.3},send:{rev:.2,room:'plate'}})]},
  train:{cls:'ui',dur:.13,layers:[O('triangle',620,{pitch:{from:620,to:860,t:.09},dur:.12,env:{d:.1}}),O('sine',1240,{pitch:{from:1240,to:1720,t:.09},dur:.1,env:{d:.08},gain:.2})]},
  supply:{cls:'ui',dur:.24,layers:[O('sine',196,{dur:.1,env:{d:.09}}),O('sine',294,{delay:.09,dur:.14,env:{d:.13}}),O('triangle',588,{delay:.09,dur:.12,env:{d:.11},gain:.25})]},
  research:{cls:'ui',dur:.46,layers:[M(600,2,{from:1.5,to:.2},{dur:.13,env:{d:.12}}),M(800,2,{from:1.5,to:.2},{delay:.1,dur:.13,env:{d:.12}}),M(1000,2,{from:1.5,to:.2},{delay:.2,dur:.25,env:{d:.24},send:{rev:.2,room:'plate'}})]},
  /* ---- impact (-18) */
  done:{cls:'impact',dur:.5,gap:120,layers:[D(784,BELL,{t60:.3,dur:.34,env:{d:.32}}),D(1175,BELL,{delay:.1,t60:.4,dur:.4,env:{d:.38},gain:.8,send:{rev:.12,room:'plate'}}),O('sine',110,{pitch:{from:110,to:70,t:.08},dur:.1,env:{d:.08},gain:.5})]},
  place:{cls:'impact',dur:.3,layers:[O('sine',110,{pitch:{from:110,to:60,t:.1},dur:.12,env:{d:.1}}),D(330,BAR,{t60:.15,dur:.17,env:{d:.16},gain:.8}),Z('pink',{dur:.08,env:{d:.07},gain:.5,filter:lp(900)}),O('triangle',300,{delay:.08,pitch:{from:300,to:560,t:.12},dur:.14,env:{d:.12},gain:.4})]},
  level:{cls:'impact',dur:.8,gap:300,layers:[P(523,{t60:.3,bright:.8,dur:.36,env:{d:.34}}),P(659,{delay:.08,t60:.3,bright:.8,dur:.36,env:{d:.34}}),P(831,{delay:.16,t60:.3,bright:.8,dur:.36,env:{d:.34}}),P(1047,{delay:.24,t60:.5,bright:.8,dur:.5,env:{d:.48}}),D(2093,BELL,{delay:.24,t60:.5,dur:.54,env:{d:.5},gain:.4,send:{rev:.2,room:'plate'}})]},
  hero:{cls:'impact',prio:'hero',dur:.85,gap:600,layers:[O('sawtooth',196,{unison:{n:2,spread:12},dur:.8,env:{a:.04,d:.5,s:.5,r:.2},filter:lp(500,2200,.2),gain:.8}),O('sawtooth',294,{detune:6,dur:.8,env:{a:.04,d:.5,s:.5,r:.2},filter:lp(500,2400,.2),gain:.5}),O('sawtooth',392,{dur:.8,env:{a:.04,d:.5,s:.5,r:.2},filter:lp(600,2600,.2),gain:.4}),O('sine',75,{pitch:{from:90,to:55,t:.2},dur:.35,env:{d:.3},gain:.8,send:{rev:.12,room:'hall'}})]},
  heroRevive:{cls:'impact',prio:'hero',dur:1.0,gap:1000,layers:[D(660,BELL,{t60:.5,dur:.55,env:{d:.5}}),D(990,BELL,{delay:.12,t60:.5,dur:.55,env:{d:.5},gain:.8}),D(1320,BELL,{delay:.24,t60:.6,dur:.65,env:{d:.6},gain:.7}),D(1980,BELL,{delay:.36,t60:.8,dur:.8,env:{d:.76},gain:.6,send:{rev:.3,room:'air'}}),Z('white',{delay:.3,dur:.6,env:{a:.15,d:.45},gain:.12,filter:hp(6000)})]},
  siege:{cls:'impact',dur:.5,gap:200,layers:[Z('white',{dur:.18,env:{d:.16},gain:.8,filter:bp(800,0,0,2)}),O('sine',90,{pitch:{from:90,to:45,t:.25},dur:.3,env:{d:.28}}),M(380,2.4,{from:4,to:.5},{delay:.05,dur:.3,env:{d:.28},gain:.4})]},
  /* ---- alert (-17) */
  alert:{cls:'alert',dur:.45,layers:[O('square',480,{dur:.14,env:{a:.005,d:.12},filter:lp(2500),gain:.8}),O('square',340,{delay:.16,dur:.27,env:{a:.005,d:.25},filter:lp(2500),gain:.8})]},
  alertBase:{cls:'alert',dur:1.25,gap:900,layers:[0,1,2].map(i=>O('sawtooth',i%2?330:440,{delay:i*.4,pitch:{from:i%2?330:440,to:i%2?300:400,t:.34},dur:.36,env:{a:.01,s:.8,d:.1,r:.07},filter:lp(1800),trem:{f:11,depth:.3}})).concat([O('sine',55,{dur:1.2,env:{a:.05,s:.7,d:.2,r:.2},gain:.6})])},
  heroFall:{cls:'alert',prio:'hero',dur:1.7,gap:2000,layers:[O('sawtooth',220,{unison:{n:2,spread:14},pitch:{from:220,to:85,t:1.3},dur:1.4,env:{a:.03,d:1.3},filter:lp(900,250,1.2),gain:.9}),Z('brown',{dur:1.3,env:{d:1.2},gain:.6,filter:lp(500)}),D(110,[1,2.7,5.2],{delay:.9,t60:.8,dur:.8,env:{d:.76},gain:.5,send:{rev:.12,room:'hall'}})]},
  /* ---- fire (-22) */
  cloak:{cls:'fire',dur:.6,gap:200,layers:[Z('white',{dur:.55,env:{a:.15,d:.38},filter:bp(3200,400,.5,4),drive:.1}),O('sine',880,{pitch:{from:880,to:220,t:.5},dur:.55,env:{a:.1,d:.4},gain:.25})]},
  heal:{cls:'fire',dur:.6,gap:150,layers:[P(660,{t60:.35,damp:.4,bright:.7,dur:.5,env:{d:.48},send:{rev:.25,room:'plate'}}),P(990,{delay:.1,t60:.35,damp:.4,bright:.7,dur:.5,env:{d:.48},send:{rev:.25,room:'plate'}})]},
  stim:{cls:'fire',dur:.22,gap:100,layers:[Z('white',{dur:.07,env:{d:.06},filter:hp(6000)}),O('sawtooth',300,{pitch:{from:300,to:1200,t:.15},dur:.2,env:{d:.19},gain:.6,filter:lp(4000)})]}
};
for(const id in GLB){const d=fit(GLB[id]);registerVoice('global.'+id,Object.assign({},d,{gain:TRIM['global.'+id]||1}));}
/* ------------------------------------------------------------------ FANFARES: global.era|win|lose.<faction> (+ a faction-less global.era|win|lose for menus, tests and cinematics). The aurora versions use the 'hall' room (2 s) so dur + tail stays under 6 s */
const FG=FP.map(f=>f.ix===2?Object.assign({},f,{room:'hall',rv:.16}):f);
const chord=(F,degs,o,del,len,g,a)=>degs.map((d,i)=>H(F,{abs:1,f:nt(F,d,o[i]===undefined?0:o[i]),del,len,a:a||.04,g:g*(1-i*.12),s:.75}));
const ERA={
  meridian:F=>mk(1.9,JG(F,{k:'horn',d:[0,2,4,7],o:0,st:.11,len:.16,a:.02,g:[.8,.85,.9,1]}),chord(F,[0,4,0],[0,0,1],.44,1.05,.9),K(F,{abs:1,f:nt(F,0,2),del:.44,t60:1,n:3,m:'bell',g:.5}),S(F,{f:75,f2:50,d:.4,g:.9,del:.44})),
  obsidian:F=>mk(2.0,[0,.22,.44].map((d,i)=>[T(F,{abs:1,f:nt(F,[0,1,3][i],0),del:d,a:.012,s:.7,len:.17,r:.05,g:1,cut:1.1,drive:.5}),S(F,{f:80,f2:46,d:.2,g:.9,del:d})]),
    chord(F,[0,1,4],[1,1,1],.66,.9,.9,.03),B(F,{type:'hp',f0:3000,a:.01,d:.7,g:.4,del:.66}),S(F,{f:70,f2:38,d:.5,g:1,del:.66})),
  aurora:F=>mk(2.2,JG(F,{k:'bell',d:[0,2,4,6,9],o:2,st:.1,len:.4,g:[.8,.8,.85,.9,1]}),T(F,{f:180,f2:1500,t:.6,a:.1,d:.7,g:.45}),B(F,{type:'hp',f0:6000,a:.2,d:.9,g:.2,del:.4})),   // rising: high bell run over an upward FM sweep, no pad
  neutral:()=>({dur:1.5,layers:[523,659,784,1047,1319].map((f,i)=>D(f,BELL,{delay:i*.1,t60:.5,dur:.55,env:{d:.52},gain:.8+i*.05,send:{rev:.16,room:'plate'}})).concat([O('sine',1047,{delay:.5,dur:.9,env:{a:.1,d:.8},gain:.3})])})
};
const WIN={
  meridian:F=>mk(2.4,[0,.12,.24].map(d=>T(F,{abs:1,f:nt(F,0,0),del:d,a:.01,s:.7,len:.09,r:.03,g:.9,cut:1.2})),T(F,{abs:1,f:nt(F,4,0),del:.4,a:.015,s:.7,len:.3,r:.06,g:1,cut:1.2}),
    chord(F,[0,2,4,7],[1,1,1,1],.78,1.5,.9),B(F,{type:'hp',f0:3500,a:.03,s:.5,dd:.1,len:.35,r:.05,trem:30,g:.35,del:.4}),S(F,{f:75,f2:50,d:.4,g:.9,del:.78}),K(F,{abs:1,f:nt(F,0,2),del:.8,t60:1.3,n:3,m:'bell',g:.5})),
  obsidian:F=>mk(2.4,[0,.2,.4,.6].map((d,i)=>[S(F,{f:85,f2:48,d:.22,g:.8+i*.07,del:d}),B(F,{type:'lp',f0:900,d:.1,g:.4,del:d})]),chord(F,[0,4,0,1],[0,0,1,1],.62,1.5,.9,.03),
    {k:'formant',src:'sawtooth',f:90,formants:VOWH('a'),scale:.6,delay:.62,dur:.7,env:{a:.05,d:.1,s:.6,r:.3},gain:.7,drive:.5},B(F,{type:'hp',f0:2800,a:.01,d:.9,g:.4,del:.62}),S(F,{f:70,f2:36,d:.6,g:1,del:.62})),
  aurora:F=>mk(2.8,K(F,{abs:1,f:nt(F,0,-1),t60:2.2,n:3,m:'bell',g:1}),JG(F,{k:'bell',d:[0,2,4,7],o:0,st:.16,len:.8,del:.1,g:[.8,.8,.85,1]}),chord(F,[0,4,7],[0,0,0],.7,1.7,.8,.3),B(F,{type:'hp',f0:5500,a:.3,d:1.1,g:.18,del:.6})),   // settling: low struck bell, slower mid-register bells, a wide sustained chord
  neutral:()=>({dur:1.8,layers:[O('triangle',523,{dur:.2,env:{d:.18}}),O('triangle',659,{delay:.12,dur:.2,env:{d:.18}}),O('triangle',784,{delay:.24,dur:.2,env:{d:.18}}),O('triangle',1047,{delay:.38,dur:1.2,env:{a:.01,d:1.1},gain:.9}),O('triangle',1319,{delay:.38,dur:1.1,env:{a:.01,d:1.0},gain:.5}),D(2093,BELL,{delay:.4,t60:1,dur:1.1,env:{d:1.0},gain:.4,send:{rev:.22,room:'plate'}})]})
};
const LOSE={
  meridian:F=>mk(2.6,T(F,{abs:1,f:nt(F,0,0),f2:nt(F,4,-1),t:.8,a:.04,s:.7,len:.9,r:.2,g:1,cut:.8}),T(F,{abs:1,f:nt(F,4,-1),f2:nt(F,0,-1),t:1.2,a:.04,s:.7,len:1.4,r:.3,g:.9,del:.8,cut:.7}),
    S(F,{f:60,f2:42,d:.6,g:.9,del:.8}),K(F,{abs:1,f:nt(F,0,-2),t60:1.4,n:3,m:'bell',g:.6,del:.85})),
  obsidian:F=>mk(2.6,S(F,{f:62,f2:30,a:.02,s:.7,dd:.3,len:1.4,r:.7,g:1}),T(F,{abs:1,f:nt(F,0,-1),f2:nt(F,0,-2),t:1.8,a:.05,s:.7,len:1.9,r:.4,g:.9,det:24,drive:.55}),T(F,{abs:1,f:nt(F,1,-1),f2:nt(F,1,-2),t:1.8,a:.05,s:.7,len:1.9,r:.4,g:.7,det:24,drive:.55}),
    B(F,{c:'brown',type:'lp',f0:900,f1:100,t:2,a:.05,s:.5,dd:.4,len:1.8,r:.5,g:.6})),
  aurora:F=>mk(2.7,JG(F,{k:'bell',d:[9,7,4,2,0],o:1,st:.26,len:.7,g:[1,.9,.8,.8,.9]}),T(F,{abs:1,f:nt(F,0,0),f2:nt(F,0,-1),t:2.0,a:.2,s:.6,len:2.0,r:.5,g:.5,solo:0,idx:1.2}),H(F,{abs:1,f:nt(F,2,-1),del:.2,len:1.8,a:.3,g:.35,s:.5}),B(F,{type:'bp',f0:3000,f1:500,t:2.2,q:1,a:.4,s:.4,dd:.3,len:1.8,r:.5,g:.15})),
  neutral:()=>({dur:1.5,layers:[O('triangle',523,{dur:.4,env:{a:.01,d:.38}}),O('triangle',440,{delay:.35,dur:1.0,env:{a:.01,d:.95},gain:.9}),O('sine',220,{delay:.35,dur:1.0,env:{a:.02,d:.95},gain:.5}),D(110,[1,2.7],{delay:.4,t60:.9,dur:.9,env:{d:.85},gain:.4,send:{rev:.15,room:'plate'}})]})
};
const FANF={era:{T:ERA,gap:1500,duck:.3},win:{T:WIN,gap:3000,duck:.4},lose:{T:LOSE,gap:3000,duck:.4}};
for(const n in FANF){
  const fz=FANF[n];
  for(const F of FG){const id='global.'+n+'.'+F.id,d=fit(fz.T[F.id](F));
    for(const L of d.layers)if(L.send)L.send.rev=R4(L.send.rev*.7);
    registerVoice(id,{dur:d.dur,layers:d.layers,cls:'alert',gain:TRIM[id]||1,gap:fz.gap,duck:fz.duck});}
  const d=fit(fz.T.neutral());registerVoice('global.'+n,{dur:d.dur,layers:d.layers,cls:'alert',gain:TRIM['global.'+n]||1,gap:fz.gap,duck:fz.duck});
}
})();
