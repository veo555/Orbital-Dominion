/* =========================================================================
   UNIT VOICES — <unitType>.<event>.<faction> for every UNIT_TYPES x SFX_UNIT_EVENTS x factions (docs/AUDIO_SPEC.md §3, vocabulary: 43_vocab.js).
   19 unit types x 7 events (select ack fire melee die ready hit); meridian/obsidian/aurora for the 16 player units, 'wild' for the 3 creeps = 357 voices.

   HOW IT IS BUILT (all sounds are synthesised, nothing is downloaded, no randomness here: the engine's seeded rng drives the variation):
   * every (unit, event) is ONE archetype written once with a handful of PARTS in meridian reference pitch: T tone, K pluck/struck metal, H sustained horn/pad,
     Vo vowel (formant), B filtered noise, S sub thump, C click. Each part is rendered with the FACTION'S TIMBRE (§3 table):
       meridian  triangle/even-harmonic saw-ish partials through a lowpass, KS plucks, clean noise, short plate reverb, tuned to D major
       obsidian  detuned unison saws/squares + tanh drive (+ optional ring-mod), pink/brown noise, sub thumps, ~0.84x pitch, ~30 % longer decay, E phrygian
       aurora    FM bells (inharmonic ratio), modal glass partials, hp/bp shimmer noise, ~1.22x pitch, airy plate send, F-sharp lydian
       wild      creeps: formant (vowel) voices, band-passed noise, irregular click timing; explicit parameters, not transformed
   * so the three faction versions of a sound share contour and rhythm (recognisably the same unit) but have different spectra, attack, decay and pitch set.
   * loudness: TRIM (below) holds the per-voice gain that puts the ACTIVE-WINDOW RMS on the class target (ui -26, fire -22, impact -18, boom -14, alert -17),
     measured with audioAnalyse over seeds 0..5 by the offline probe (tests/audio/units_gate.py --calibrate rewrites the table).
   * fire voices: <= 0.36 s and <= 4 source nodes; select/ack <= 0.6 s; deaths <= 2.4 s.  Everything is a plain registerVoice() DSL voice (80_audio.js §8.2).
   The file is one closure: no new global names.
   ========================================================================= */
(function(){
'use strict';
const HM=[1,.55,.2,.32,.06,.14,.03];                       // meridian partial set: fundamental + strong 2nd/4th (even-harmonic, "brass-and-servo")
const GLASS=[1,0,0,.3,0,0,.15],BELL=[1,2.76,5.4,8.93],BAR=[1,2.32,4.25,6.63],CLANG=[1,1.47,2.09,2.56,3.4];
const FP=[
  {id:'meridian',ix:0,pm:1,dm:1,rv:.1,room:'plate',base:62,sc:[0,2,4,5,7,9,11]},       // D4, D major
  {id:'obsidian',ix:1,pm:.78,dm:1.3,rv:0,room:'plate',base:52,sc:[0,1,3,5,7,8,10]},     // E3, E phrygian
  {id:'aurora',ix:2,pm:1.4,dm:1.2,rv:.2,room:'plate',base:66,sc:[0,2,4,6,7,9,11]},     // F#4, F# lydian
  {id:'wild',ix:3,pm:1,dm:1,rv:0,room:'plate',base:57,sc:[0,2,3,5,7,8,10]}];
const FPI={};for(const f of FP)FPI[f.id]=f;
const cfg=(F,o)=>{const r={};for(const k in o){const v=o[k];r[k]=Array.isArray(v)&&k!=='rt'?v[F.ix]:v;}return r;};
const fl=(a,o)=>{o=o||[];for(let i=0;i<a.length;i++){const x=a[i];if(Array.isArray(x))fl(x,o);else if(x)o.push(x);}return o;};
const nt=(F,d,oc)=>440*Math.pow(2,(F.base+F.sc[((d%7)+7)%7]+12*(Math.floor(d/7)+(oc||0))-69)/12);   // scale degree -> Hz in the faction's key
const snd=F=>F.rv>0?{rev:F.rv,room:F.room}:undefined;
const dflt=(v,d)=>v===undefined?d:v;
const R4=x=>Math.round(x*10000)/10000;

/* ------------------------------------------------------------------ parts (each returns layers) */
/* T tone: f, f2 glide target, t glide time, d decay, a attack, g gain, del delay; s (sustain 0..1) + len + r for held notes; abs: f is already in the faction's key; cut: filter scale;
   sine: pure sine for meridian; solo: one oscillator for obsidian; sq: square for obsidian/wild; ratio/idx: aurora FM; trem: {f,depth}; vib: cents; rm: ring-mod Hz (obsidian) */
function T(F,q){
  const o=cfg(F,q),ab=o.abs?1:F.pm,f=o.f*ab,f2=(o.f2||o.f)*ab,a=o.a||.003,del=o.del||0,g=dflt(o.g,1),sus=o.s>0,cut=o.cut||1;
  const d=(o.d||.1)*(sus?1:F.dm),len=sus?o.len:a+d+.01,tg=o.t||d,gl=f2!==f?{from:f,to:f2,t:tg}:undefined;
  const env=sus?{a,d:o.dd||.05,s:o.s,r:o.r||.05}:{a,d};
  const nyq=12000,tr=o.trem?{f:o.trem,depth:.6}:undefined,vb=o.vib?{f:5.6,cents:o.vib}:undefined;
  if(F.id==='meridian'){
    const L={k:'osc',f,pitch:gl,delay:del,dur:len,env,gain:g,trem:tr,vib:vb,send:snd(F)};
    if(o.sine)L.type='sine';else{L.harm=HM;L.filter={type:'lp',f0:Math.min(f*5*cut,nyq),f1:Math.max(f2*3*cut,250),t:tg};}
    return [L];
  }
  if(F.id==='obsidian'){
    return [{k:'osc',type:o.sq?'square':'sawtooth',f,pitch:gl,unison:o.solo?undefined:{n:2,spread:o.det||16},delay:del,dur:len,env,gain:g*(o.sq?.7:.85),
      filter:{type:'lp',f0:Math.min(f*4*cut,nyq),f1:Math.max(f2*2*cut,200),t:tg,q:.9},drive:dflt(o.drive,.45),rm:o.rm?{f:o.rm,depth:.55}:undefined,trem:tr,vib:vb}];
  }
  if(F.id==='aurora'){
    if(o.solo)return [{k:'osc',harm:GLASS,f,pitch:gl,delay:del,dur:len,env,gain:g*.9,trem:tr,vib:vb,send:snd(F)}];
    const ix=Math.min(o.idx||2.2,6000/(Math.max(f,f2)*(o.ratio||3.5)));
    return [{k:'fm',f,ratio:o.ratio||3.5,idx:{from:ix,to:ix*.04,t:sus?o.len*.6:d},pitch:gl,delay:del,dur:len,env:sus?{a,d:o.dd||.05,s:o.s,r:o.r||.05}:{a,d:d*1.15},gain:g*.85,trem:tr,vib:vb,send:snd(F)}];
  }
  return [{k:'osc',type:o.sq===0?'triangle':'square',f,pitch:gl,delay:del,dur:len,env,gain:g*.7,filter:{type:'lp',f0:Math.min(f*4*cut,nyq),f1:Math.max(f2*2*cut,200),t:tg},trem:tr,vib:vb}];
}
/* K pluck / struck: f, t60 ring time, g, del, n (aurora partial count), bright; modal:1 = struck metal/bell instead of a string */
function K(F,q){
  const o=cfg(F,q),f=o.f*(o.abs?1:F.pm),del=o.del||0,g=dflt(o.g,1),t60=(o.t60||.3)*F.dm,len=t60*1.15+.02,nn=o.n||3;
  if(F.id==='aurora'||o.modal){
    const rt=F.id==='aurora'?BELL:o.rt?o.rt:F.id==='obsidian'?CLANG:BAR;
    return [{k:'pluck',mode:'modal',f,ratios:rt.slice(0,Math.max(2,nn)),tilt:F.id==='aurora'?.55:.6,t60,damp:F.id==='obsidian'?1.2:.8,delay:del,dur:len,env:{d:len},gain:g*(F.id==='obsidian'?.8:1),
      drive:.3,send:snd(F)}];
  }
  const ob=F.id==='obsidian';
  return [{k:'pluck',mode:'ks',f,t60,damp:ob?.85:.45,bright:dflt(o.bright,ob?.35:.7),delay:del,dur:len,env:{d:len},gain:g,drive:ob?.3:.2,send:snd(F)}];
}
/* H held horn / pad: f, len, a, r, s, g, cut */
function H(F,q){
  const o=cfg(F,q),f=o.f*(o.abs?1:F.pm),del=o.del||0,g=dflt(o.g,1),a=o.a||.03,len=o.len||.4,env={a,d:.06,s:dflt(o.s,.75),r:o.r||.06},cut=o.cut||1;
  if(F.id==='obsidian')return [{k:'osc',type:'sawtooth',f,unison:{n:3,spread:24},delay:del,dur:len,env,gain:g*.8,filter:{type:'lp',f0:f*2*cut,f1:f*4.5*cut,t:a+.08,q:.9},drive:.35}];
  if(F.id==='aurora')return [{k:'osc',type:'triangle',f,unison:{n:3,spread:22,pan:.7},delay:del,dur:len,env,gain:g*.9,send:snd(F)}];
  return [{k:'osc',harm:HM,f,delay:del,dur:len,env,gain:g,filter:{type:'lp',f0:f*2*cut,f1:Math.min(f*5*cut,12000),t:a+.08,q:.9},send:snd(F)}];
}
/* Vo vowel (formant voice): f, vowel, to (+morph), d, a, g, scale (<1 bigger creature), s/len/r held, drive */
function Vo(F,q){
  const o=cfg(F,q),f=o.f*(o.abs?1:F.pm),del=o.del||0,g=dflt(o.g,1),a=o.a||.012,sus=o.s>0,d=(o.d||.15)*(sus?1:F.dm),len=sus?o.len:a+d+.01;
  const env=sus?{a,d:.06,s:o.s,r:o.r||.06}:{a,d},L={k:'formant',vowel:o.vowel||'a',to:o.to,morph:o.morph,f,delay:del,dur:len,env,gain:g};
  L.formants=KIT.vowels[L.vowel].map(v=>[v[0],v[1]*.5,v[2]]);   // half the resonator Q: a vowel-ish colour that does not swing in level when the seeded pitch/filter variation slides a harmonic across a formant
  const f2=(o.f2||o.f)*(o.abs?1:F.pm);if(f2!==f)L.pitch={from:f,to:f2,t:o.t||d};
  if(F.id==='obsidian'){L.src='sawtooth';L.scale=(o.scale||1)*.92;L.drive=dflt(o.drive,.4);}
  else if(F.id==='aurora'){L.src='square';L.scale=(o.scale||1)*1.12;L.vib={f:5.5,cents:28};L.drive=dflt(o.drive,.25);L.send=snd(F);}
  else if(F.id==='wild'){L.src=o.src||'sawtooth';L.scale=o.scale||1;if(o.drive)L.drive=o.drive;if(o.vib)L.vib={f:o.vibf||6,cents:o.vib};}
  else{L.src='triangle';L.scale=(o.scale||1)*1.04;}
  if(o.src)L.src=o.src;if(o.trem)L.trem={f:o.trem,depth:o.td||.7};
  return [L];
}
/* B filtered noise: type bp/lp/hp, f0->f1 over t, q, d, a, g, c colour, drive, trem (rapid patter); s/len/r/dd = held rumble */
function B(F,q){
  const o=cfg(F,q),del=o.del||0,g=dflt(o.g,1),a=o.a||.003,sus=o.s>0,d=(o.d||.1)*(sus?1:F.dm),ty=o.type||'bp',q0=o.q||1,f0=o.f0,f1=o.f1,len=sus?o.len:a+d+.01,tt=o.t||len;
  const env=sus?{a,d:o.dd||.1,s:o.s,r:o.r||.2}:{a,d},tr=o.trem?{f:o.trem,depth:o.td||.85}:undefined;
  if(F.id==='obsidian'){   // smashing metal: a rumble (lp) becomes broad mid-band grind, everything gets pink + drive
    const lp=ty==='lp',m=lp?2:1;
    return [{k:'noise',color:o.c==='brown'?'pink':(o.c||'pink'),delay:del,dur:len,env,gain:g*1.1,filter:{type:lp?'bp':ty,f0:f0*F.pm*m,f1:f1?f1*F.pm*m:undefined,t:tt,q:lp?.5:q0*.7},drive:dflt(o.drive,.3),trem:tr}];}
  if(F.id==='aurora'){   // crystalline: a rumble becomes an airy resonant wash, bands get a ringing resonance, highs get brighter
    const lp=ty==='lp',k=lp?Math.min(4.5,6500/f0):ty==='bp'?1.5:1.6;
    return [{k:'noise',color:'white',delay:del,dur:len,env,gain:g*.9,filter:{type:lp?'bp':ty,f0:f0*k,f1:f1?f1*k:undefined,t:tt,q:lp?1.4:ty==='bp'?Math.max(q0*2.2,2.5):q0},trem:tr,send:snd(F)}];}
  return [{k:'noise',color:o.c||(F.id==='wild'?'pink':'white'),delay:del,dur:len,env,gain:g,filter:{type:ty,f0,f1,t:tt,q:q0},trem:tr}];
}
/* S sub thump: f -> f2 pitch drop, d, g, del, a; s/len/r/dd = held sub (booms: a flat body keeps the transient from dominating the peak) */
function S(F,q){
  const o=cfg(F,q),f=o.f*F.pm,f2=(o.f2||o.f)*F.pm,del=o.del||0,g=dflt(o.g,1),a=o.a||.004,sus=o.s>0,k=F.id==='obsidian'?F.dm:F.id==='aurora'?.75:1,d=(o.d||.15)*k,len=sus?o.len:a+d+.01;
  const L={k:'osc',type:'sine',f,pitch:{from:f,to:f2,t:sus?len:d},delay:del,dur:len,env:sus?{a,d:o.dd||.1,s:o.s,r:o.r||.15}:{a,d},gain:g};
  if(F.id==='obsidian'){L.gain=g*1.1;L.drive=.5;}else if(F.id==='aurora'){L.gain=g*.65;L.send=snd(F);delete L.type;L.harm=GLASS;}
  return [L];
}
/* C click / transient: g, del, f */
function C(F,q){
  const o=cfg(F,q),del=o.del||0,g=dflt(o.g,1);
  if(F.id==='obsidian')return [{k:'noise',color:'pink',delay:del,dur:.03,env:{d:.022},gain:g*1.2,filter:{type:'lp',f0:3200,f1:1200,t:.02},drive:.5}];
  if(F.id==='aurora'){const f=o.f||3400;return [{k:'osc',type:'sine',f,pitch:{from:f,to:f*.75,t:.04},delay:del,dur:.05,env:{d:.04},gain:g*.6,send:snd(F)}];}
  if(F.id==='wild')return [{k:'noise',color:'white',delay:del,dur:.03,env:{d:.014},gain:g,filter:{type:'bp',f0:o.f||3200,q:2.5},drive:.35}];
  return [{k:'noise',color:'white',delay:del,dur:.02,env:{d:.009},gain:g,filter:{type:'hp',f0:o.f||4500}}];
}
const mkx=(o,...parts)=>Object.assign({},o,{layers:fl(parts)});
const mk=(dur,...parts)=>mkx({dur},...parts);
const tag=(Ls,k)=>{for(const L of Ls)L.only=[k];return Ls;};

/* ------------------------------------------------------------------ musical events: records -> parts */
const KD={
  chirp:(F,f,t,r)=>T(F,{abs:1,f:f*(r.g0||.8),f2:f,t:r.gt||.045,del:t,a:.003,d:r.len,g:r.g,cut:r.cut,ratio:r.ratio,sq:r.sq,solo:r.solo}),
  blip:(F,f,t,r)=>T(F,{abs:1,f,del:t,a:r.a||.003,d:r.len,g:r.g,cut:r.cut,ratio:r.ratio,sq:r.sq,sine:r.sine,solo:r.solo}),
  horn:(F,f,t,r)=>T(F,{abs:1,f,del:t,a:r.a||.02,s:r.s||.7,len:r.len,r:r.rel||.06,g:r.g,cut:r.cut||1.2,ratio:r.ratio||1,idx:r.idx||1.4,solo:r.solo,drive:r.drive,trem:r.trem}),
  pluck:(F,f,t,r)=>K(F,{abs:1,f,del:t,t60:r.len*2.2,g:r.g,n:2,bright:r.br}),
  bell:(F,f,t,r)=>K(F,{abs:1,f,del:t,t60:r.len*2,modal:1,g:r.g,n:3}),
  voc:(F,f,t,r)=>Vo(F,{abs:1,f,f2:r.f2?f*r.f2:undefined,del:t,vowel:r.vw||'a',to:r.to,a:r.a||.012,d:r.len,g:r.g,scale:r.sc,s:r.vs,len:r.vs?r.len:undefined}),
  hum:(F,f,t,r)=>H(F,{abs:1,f,del:t,len:r.len,a:r.a||.03,g:r.g,s:r.s,cut:r.cut})};
function mel(F,r,take){
  const degs=take===1&&r.d2?r.d2:r.d,st=r.st||.1,out=[];
  for(let i=0;i<degs.length;i++)out.push(KD[r.k](F,nt(F,degs[i],r.o||0),i*st,r));
  if(r.x)out.push(r.x(F,take));
  return out;
}
function MU(r){
  return F=>{
    const dur=r.dur||((r.d.length-1)*(r.st||.1)+r.len*1.6+.04);
    if(r.d2){const A0=tag(fl(mel(F,r,0)),0),A1=tag(fl(mel(F,r,1)),1);return {dur,variants:2,seq:true,layers:A0.concat(A1)};}
    return mk(dur,mel(F,r,0));
  };
}

/* ------------------------------------------------------------------ SELECT (<= 0.6 s, class ui): the unit's "voice" when picked */
const SKT=(F,o)=>B(F,Object.assign({type:'bp',f0:3200,q:2,trem:38,a:.004},o));   // creep skitter bed: band-passed noise chopped at leg-patter rate
const SELECT={
  hauler:MU({k:'chirp',d:[0,2],o:1,st:.1,len:.07,dur:.3,g0:.6,x:F=>[B(F,{type:'bp',f0:2600,q:3,d:.1,g:.15,del:.01}),B(F,{type:'hp',f0:6000,d:.1,g:.18,del:.2})]}),
  rifleman:MU({k:'blip',d:[0,4],o:0,st:.1,len:.09,dur:.26,x:F=>[C(F,{g:.35})]}),
  raptor:F=>mk(.3,Vo(F,{f:300,f2:220,vowel:'ae',to:'o',morph:.2,a:.02,d:.24,g:1}),B(F,{type:'bp',f0:1800,f1:900,q:1.5,d:.14,g:.35,del:.02})),
  rocketeer:MU({k:'blip',d:[0,0],o:1,st:.11,len:.05,sq:1,dur:.28,x:F=>[B(F,{type:'bp',f0:1800,q:1,a:.01,d:.26,g:.6})]}),
  mender:MU({k:'pluck',d:[0,2,4],o:1,st:.09,len:.14,dur:.5}),
  howitzer:F=>mk(.36,K(F,{f:900,t60:.1,modal:1,rt:[1,2.9,5.6],n:3,g:.8}),K(F,{f:900,del:.1,t60:.1,modal:1,rt:[1,2.9,5.6],n:3,g:.6}),T(F,{abs:1,f:nt(F,0,-1),a:.01,d:.26,g:.8,del:.14}),C(F,{g:.6,f:2500})),
  juggernaut:F=>mk(.42,S(F,{f:80,f2:50,d:.14,g:1}),B(F,{type:'hp',f0:2500,a:.02,d:.25,g:.35,del:.02}),T(F,{abs:1,f:nt(F,0,-1),a:.02,d:.26,g:.7,cut:.8,del:.1})),
  skiff:F=>mk(.42,T(F,{abs:1,f:nt(F,0,0),f2:nt(F,0,1)*1.5,t:.3,a:.04,d:.3,g:.8}),B(F,{type:'bp',f0:1500,f1:4200,t:.3,q:2,a:.08,d:.26,g:.5})),
  titan:F=>mk(.6,H(F,{abs:1,f:nt(F,0,-2),len:.52,a:.07,g:1,cut:.8}),S(F,{f:55,f2:42,d:.45,g:.9})),
  freighter:F=>mk(.5,T(F,{abs:1,f:nt(F,0,-1),a:.04,s:.75,len:.42,r:.1,g:1,trem:17,cut:.8}),H(F,{abs:1,f:nt(F,4,-1),len:.18,del:.28,a:.02,g:.6,s:.6})),
  bulwark:F=>mk(.46,T(F,{abs:1,f:nt(F,0,0),a:.02,s:.8,len:.3,r:.08,g:.8,trem:9,sine:1,solo:1}),K(F,{abs:1,f:nt(F,4,1),t60:.3,modal:1,n:3,g:.6,del:.1})),
  reaver:F=>mk(.36,Vo(F,{f:140,f2:110,vowel:'a',to:'o',morph:.25,a:.02,d:.3,g:1}),B(F,{c:'pink',type:'lp',f0:1600,f1:700,d:.25,g:.4}),C(F,{g:.35})),
  specter:F=>mk(.5,T(F,{abs:1,f:nt(F,0,1),a:.05,s:.7,len:.4,r:.12,g:.6,sine:1,solo:1,trem:6}),T(F,{abs:1,f:nt(F,0,1)*1.007,a:.06,s:.7,len:.4,r:.12,g:.5,sine:1,solo:1,trem:6.8}),B(F,{type:'bp',f0:3500,f1:2200,q:3,a:.08,d:.3,g:.3})),
  crawler:F=>mk(.26,SKT(F,{f0:3400,d:.22,g:1.2}),C(F,{g:.5,f:3000}),C(F,{g:.4,f:3800,del:.05}),C(F,{g:.45,f:2800,del:.09}),C(F,{g:.35,f:4200,del:.16}),Vo(F,{f:1900,vowel:'i',d:.1,a:.01,g:.25,del:.03})),
  spitter:F=>mk(.32,T(F,{f:300,f2:520,t:.2,d:.25,a:.02,g:.8,vib:70,sq:0}),B(F,{type:'bp',f0:700,f1:350,q:1.5,d:.25,g:.5}),Vo(F,{f:210,vowel:'o',to:'uh',morph:.2,d:.25,a:.03,g:.4,vib:60})),
  brute:F=>mk(.55,Vo(F,{f:68,f2:55,vowel:'a',to:'o',morph:.35,scale:.55,a:.05,d:.45,g:1,drive:.3}),S(F,{f:58,f2:42,d:.4,g:.7}),B(F,{c:'brown',type:'lp',f0:500,f1:200,d:.4,g:.4})),
  hero_idris:MU({k:'horn',d:[0,3,4],o:0,st:.12,len:.14,a:.015,dur:.56}),
  hero_kaz:F=>mk(.58,H(F,{abs:1,f:nt(F,0,-1),len:.52,a:.09,g:1,cut:.9}),T(F,{abs:1,f:nt(F,6,-1),a:.08,s:.5,len:.4,r:.1,g:.4,del:.1,cut:.8}),S(F,{f:75,f2:55,d:.3,g:.9})),
  hero_lyra:F=>mk(.58,Vo(F,{abs:1,f:nt(F,4,0),vowel:'o',to:'a',morph:.4,a:.08,s:.65,len:.46,r:.12,g:.9}),K(F,{abs:1,f:nt(F,0,1),t60:.5,modal:1,n:3,g:.7,del:.02}),K(F,{abs:1,f:nt(F,4,1),t60:.5,modal:1,n:3,g:.5,del:.14}))
};
/* ------------------------------------------------------------------ ACK (<= 0.3 s, class ui): command acknowledged, two takes alternate (seq) */
const ACK={
  hauler:MU({k:'chirp',d:[2],d2:[4],o:1,len:.07,dur:.14,g0:.7,x:F=>[B(F,{type:'hp',f0:6500,d:.05,g:.15,del:.06})]}),
  rifleman:MU({k:'blip',d:[0,2],d2:[0,4],o:0,st:.06,len:.07,dur:.17}),
  raptor:F=>mk(.16,Vo(F,{f:480,f2:360,vowel:'i',to:'e',morph:.1,a:.01,d:.12,g:1}),C(F,{g:.4,f:4800})),
  rocketeer:MU({k:'blip',d:[0,2],d2:[2,0],o:1,st:.06,len:.045,sq:1,dur:.15,x:F=>[B(F,{type:'bp',f0:1800,q:1,d:.14,g:.45})]}),
  mender:MU({k:'pluck',d:[4,7],d2:[2,6],o:1,st:.07,len:.1,dur:.26}),
  howitzer:F=>mk(.2,C(F,{g:.8,f:2200}),K(F,{f:900,t60:.08,modal:1,rt:[1,2.9,5.6],n:3,g:.6}),T(F,{abs:1,f:nt(F,2,-1),a:.006,d:.12,g:.8,cut:.8,del:.04})),
  juggernaut:F=>mk(.22,S(F,{f:90,f2:55,d:.1,g:1}),B(F,{type:'hp',f0:2500,d:.09,g:.35}),T(F,{abs:1,f:nt(F,0,-1),f2:nt(F,4,-1),t:.1,a:.006,d:.14,g:.6,cut:.8})),
  skiff:F=>mk(.18,T(F,{abs:1,f:nt(F,0,1),f2:nt(F,4,1),t:.1,a:.01,d:.14,g:.8}),B(F,{type:'bp',f0:2500,f1:4500,q:2,d:.12,g:.3})),
  titan:F=>mk(.3,H(F,{abs:1,f:nt(F,0,-2),len:.26,a:.04,g:1,cut:.7}),S(F,{f:50,f2:40,d:.22,g:.7})),
  freighter:F=>mk(.24,H(F,{abs:1,f:nt(F,4,-1),len:.2,a:.02,g:1,s:.65}),B(F,{c:'pink',type:'lp',f0:500,d:.18,g:.2})),
  bulwark:F=>mk(.22,K(F,{abs:1,f:nt(F,4,0),t60:.18,modal:1,n:3,g:1}),T(F,{abs:1,f:nt(F,0,-1),a:.01,d:.14,g:.4,sine:1,solo:1})),
  reaver:F=>mk(.18,Vo(F,{f:150,f2:120,vowel:'a',to:'o',morph:.12,a:.01,d:.14,g:1}),C(F,{g:.35})),
  specter:F=>mk(.2,T(F,{abs:1,f:nt(F,4,1),f2:nt(F,2,1),a:.015,d:.15,g:.6,sine:1,solo:1}),B(F,{type:'bp',f0:3800,q:3,a:.01,d:.14,g:.35})),
  crawler:F=>mk(.14,SKT(F,{d:.11,g:1.1}),C(F,{g:.5,f:3400}),C(F,{g:.35,f:4200,del:.045}),C(F,{g:.4,f:3000,del:.09})),
  spitter:F=>mk(.16,T(F,{f:360,f2:620,t:.1,d:.12,a:.01,g:.8,vib:60,sq:0}),B(F,{type:'bp',f0:800,q:2,d:.1,g:.4})),
  brute:F=>mk(.26,Vo(F,{f:75,f2:62,vowel:'o',scale:.55,a:.03,d:.2,g:1,drive:.3}),S(F,{f:60,f2:46,d:.2,g:.6})),
  hero_idris:MU({k:'horn',d:[0,4],d2:[0,3],o:0,st:.08,len:.1,a:.012,dur:.24}),
  hero_kaz:F=>mk(.26,H(F,{abs:1,f:nt(F,0,-1),len:.22,a:.03,g:1,cut:.9}),S(F,{f:80,f2:60,d:.16,g:.7})),
  hero_lyra:F=>mk(.28,Vo(F,{abs:1,f:nt(F,4,0),vowel:'o',a:.03,d:.2,g:.8}),K(F,{abs:1,f:nt(F,4,1),t60:.3,modal:1,n:3,g:.6}))
};
/* ------------------------------------------------------------------ FIRE (<= 0.36 s, <= 4 source nodes; class fire, heavy cannons class impact) */
const FIRE={
  hauler:F=>mk(.13,T(F,{f:760,f2:1150,d:.07,g:.5,a:.004}),B(F,{type:'hp',f0:5200,d:.045,g:.8}),C(F,{g:.35,f:3800})),
  rifleman:F=>mk(.17,T(F,{f:1900,f2:430,t:.07,d:.11,g:1}),C(F,{g:.5}),B(F,{type:'hp',f0:2800,d:.035,g:.3})),
  raptor:F=>mk(.24,B(F,{type:'bp',f0:700,f1:5200,t:.18,q:1.5,a:.05,d:.17,g:1}),Vo(F,{f:150,vowel:'ae',to:'uh',morph:.14,a:.02,d:.17,g:.5}),C(F,{g:.25,f:5200})),
  rocketeer:F=>mk(.34,S(F,{f:150,f2:55,d:.2,g:1}),B(F,{type:'lp',f0:3500,f1:600,t:.3,a:.02,d:.3,g:.9}),C(F,{g:.3})),
  mender:F=>mk(.33,K(F,{f:660,t60:.2,n:2,g:1}),K(F,{f:990,del:.08,t60:.2,n:2,g:.8})),
  howitzer:F=>mkx({dur:.36,cls:'impact'},S(F,{f:95,f2:34,d:.32,g:1}),B(F,{type:'bp',f0:1200,f1:350,t:.25,q:.8,d:.26,g:.6}),C(F,{g:.9,f:3000}),T(F,{f:1600,f2:900,d:.3,g:.4,sine:1,solo:1})),
  juggernaut:F=>mk(.3,T(F,{f:340,f2:110,t:.2,d:.22,g:1}),S(F,{f:70,f2:40,d:.2,g:.7}),C(F,{g:.4})),
  skiff:F=>mk(.2,T(F,{f:2600,f2:620,t:.13,d:.14,g:.8}),B(F,{type:'hp',f0:6000,d:.08,g:.4}),B(F,{type:'bp',f0:1800,f1:900,q:2,d:.18,g:.35})),
  titan:F=>mkx({dur:.36,cls:'impact'},S(F,{f:55,f2:24,d:.34,g:1}),B(F,{c:'brown',type:'lp',f0:500,f1:100,t:.33,d:.33,g:1}),T(F,{f:130,f2:60,d:.25,g:.5,solo:1})),
  freighter:F=>mk(.35,H(F,{f:110,len:.33,a:.025,s:.7,g:1}),B(F,{c:'pink',type:'lp',f0:600,d:.3,g:.2})),
  bulwark:F=>mk(.26,T(F,{f:620,f2:930,t:.2,d:.22,g:.9}),B(F,{type:'bp',f0:1200,q:6,d:.2,g:.5}),S(F,{f:120,f2:110,d:.2,g:.4})),
  reaver:F=>mk(.28,Vo(F,{f:170,vowel:'a',to:'ae',d:.25,g:1}),B(F,{type:'bp',f0:1500,f1:600,d:.2,g:.4}),C(F,{g:.3})),
  specter:F=>mk(.22,Vo(F,{f:200,vowel:'i',src:'noise',a:.01,d:.18,g:1.2}),T(F,{f:1700,f2:850,d:.15,g:.3,sine:1,solo:1})),
  crawler:F=>mk(.2,SKT(F,{d:.17,g:1.1}),C(F,{g:.45,f:3000}),C(F,{g:.4,f:2700,del:.115})),
  spitter:F=>mk(.22,T(F,{f:320,f2:700,t:.14,d:.15,g:.7,vib:80,sq:0}),B(F,{type:'hp',f0:3200,d:.1,g:.4}),Vo(F,{f:230,vowel:'o',d:.15,g:.35})),
  brute:F=>mk(.35,Vo(F,{f:75,f2:55,vowel:'a',scale:.55,a:.03,d:.3,g:1,drive:.35,trem:13}),B(F,{c:'brown',type:'lp',f0:400,d:.3,g:.5}),S(F,{f:60,f2:40,d:.25,g:.6})),
  hero_idris:F=>mk(.22,T(F,{f:1200,f2:260,t:.1,d:.18,g:1}),S(F,{f:90,f2:50,d:.15,g:.6}),C(F,{g:.45})),
  hero_kaz:F=>mk(.3,Vo(F,{f:120,f2:95,vowel:'a',to:'o',morph:.2,d:.26,a:.015,g:1,scale:.8,drive:.5}),B(F,{c:'pink',type:'bp',f0:1800,f1:900,d:.2,g:.5}),S(F,{f:70,f2:45,d:.22,g:.7})),
  hero_lyra:F=>mk(.3,T(F,{f:2400,f2:1300,t:.15,d:.28,g:.8,idx:1}),B(F,{type:'hp',f0:7000,d:.05,g:.25}),T(F,{f:3600,f2:2400,d:.2,g:.25,sine:1,solo:1}))
};
/* ------------------------------------------------------------------ MELEE (<= 0.34 s, class impact) */
const MELEE={
  hauler:F=>mk(.14,K(F,{f:900,t60:.12,modal:1,rt:[1,2.9,5.6],n:3,g:1}),C(F,{g:.4}),S(F,{f:140,f2:90,d:.06,g:.6})),
  rifleman:F=>mk(.14,S(F,{f:150,f2:80,d:.09,g:1}),B(F,{type:'lp',f0:1800,f1:700,d:.06,g:.6}),C(F,{g:.4})),
  raptor:F=>mk(.16,B(F,{type:'bp',f0:1500,f1:7000,t:.09,q:1.2,d:.09,g:1}),B(F,{type:'hp',f0:5000,d:.05,g:.4,del:.02}),Vo(F,{f:210,vowel:'ae',d:.1,g:.4})),
  rocketeer:F=>mk(.14,T(F,{f:420,f2:210,d:.07,g:1}),B(F,{type:'lp',f0:2500,d:.05,g:.6}),C(F,{g:.4})),
  mender:F=>mk(.16,K(F,{f:520,t60:.1,bright:.2,g:1}),S(F,{f:200,f2:120,d:.05,g:.5}),C(F,{g:.2,f:3000})),
  howitzer:F=>mk(.24,K(F,{f:420,t60:.16,modal:1,rt:[1,2.9,5.6],n:3,g:1}),S(F,{f:80,f2:50,d:.08,g:.6}),C(F,{g:.5,f:2500}),B(F,{type:'hp',f0:2500,d:.1,g:.3})),
  juggernaut:F=>mk(.28,S(F,{f:60,f2:35,d:.2,g:1}),K(F,{f:180,t60:.2,modal:1,rt:[1,1.6,2.7,4.1],n:4,g:.6}),B(F,{type:'hp',f0:2500,d:.18,g:.5})),
  skiff:F=>mk(.22,T(F,{f:1200,f2:300,t:.15,d:.18,g:1}),B(F,{type:'bp',f0:1500,q:3,d:.1,g:.4}),S(F,{f:120,f2:70,d:.1,g:.6,del:.08})),
  titan:F=>mk(.34,S(F,{f:45,f2:25,d:.3,g:1}),B(F,{c:'brown',type:'lp',f0:300,f1:80,t:.28,d:.3,g:1}),K(F,{f:120,t60:.25,modal:1,rt:[1,1.19,2.01],n:3,g:.5})),
  freighter:F=>mk(.2,S(F,{f:100,f2:50,d:.14,g:1}),B(F,{type:'bp',f0:500,f1:900,q:1.5,d:.16,g:.8,trem:24}),K(F,{f:220,t60:.15,modal:1,rt:[1,2.4,3.9],n:3,g:.4})),
  bulwark:F=>mk(.3,K(F,{f:520,t60:.3,modal:1,rt:[1,2,3,4],n:4,g:1}),T(F,{f:260,f2:180,d:.2,g:.6,sine:1,solo:1,rm:90}),S(F,{f:110,f2:70,d:.1,g:.6})),
  reaver:F=>mk(.2,B(F,{type:'bp',f0:2000,f1:6500,t:.1,q:1.5,d:.1,g:1}),T(F,{f:300,f2:900,d:.12,g:.5,del:.06,sine:1,solo:1,vib:30})),
  specter:F=>mk(.17,B(F,{type:'hp',f0:6000,d:.08,g:.8}),T(F,{f:2200,f2:1100,d:.14,g:.35,sine:1,solo:1})),
  crawler:F=>mk(.15,SKT(F,{f0:2500,d:.12,g:1.1}),C(F,{g:.5,f:2600}),C(F,{g:.45,f:3300,del:.035}),C(F,{g:.4,f:2900,del:.07})),
  spitter:F=>mk(.16,B(F,{type:'bp',f0:700,q:1,d:.08,g:1}),T(F,{f:260,f2:110,d:.1,g:.6,vib:60,sq:0})),
  brute:F=>mk(.3,S(F,{f:60,f2:35,d:.22,g:1}),B(F,{type:'lp',f0:700,d:.15,g:.6}),Vo(F,{f:70,vowel:'o',scale:.6,d:.15,g:.5})),
  hero_idris:F=>mk(.14,C(F,{g:.7}),B(F,{type:'hp',f0:3000,d:.05,g:.4}),T(F,{f:700,f2:300,d:.08,g:.5})),
  hero_kaz:F=>mk(.28,S(F,{f:90,f2:45,d:.2,g:1}),K(F,{f:240,t60:.25,modal:1,rt:[1,1.5,2.6],n:3,g:.6}),B(F,{c:'pink',type:'lp',f0:2500,d:.12,g:.7})),
  hero_lyra:F=>mk(.22,K(F,{f:1200,t60:.3,modal:1,n:3,g:1}),C(F,{g:.3}),T(F,{f:2400,d:.15,g:.3,sine:1,solo:1}))
};
/* ------------------------------------------------------------------ HIT (<= 0.3 s, class impact): the impact on this unit's armour */
const HIT={
  hauler:F=>mk(.1,K(F,{f:1400,t60:.08,modal:1,rt:[1,2.9,5.6],n:3,g:1}),S(F,{f:220,f2:130,d:.05,g:.6}),C(F,{g:.3})),
  rifleman:F=>mk(.12,S(F,{f:190,f2:100,d:.07,g:1}),B(F,{type:'lp',f0:2200,f1:900,d:.06,g:.6}),C(F,{g:.25})),
  raptor:F=>mk(.14,B(F,{type:'bp',f0:900,q:1.2,d:.08,g:.8}),Vo(F,{f:260,f2:200,vowel:'e',to:'a',d:.09,g:.7})),
  rocketeer:F=>mk(.12,S(F,{f:140,f2:75,d:.08,g:1}),B(F,{type:'hp',f0:2600,d:.05,g:.5})),
  mender:F=>mk(.12,K(F,{f:480,t60:.1,bright:.2,g:1}),S(F,{f:170,f2:100,d:.05,g:.5}),B(F,{type:'bp',f0:1500,d:.05,g:.3})),
  howitzer:F=>mk(.2,K(F,{f:200,t60:.2,modal:1,rt:[1,2.1,3.3],n:3,g:1}),S(F,{f:75,f2:45,d:.12,g:.8}),C(F,{g:.3})),
  juggernaut:F=>mk(.24,K(F,{f:140,t60:.28,modal:1,rt:[1,1.6,2.7,4.1],n:4,g:1}),S(F,{f:60,f2:38,d:.14,g:.6}),B(F,{type:'hp',f0:3000,d:.15,g:.5})),
  skiff:F=>mk(.14,K(F,{f:700,t60:.15,modal:1,rt:[1,2.5,4.8],n:3,g:1}),B(F,{type:'hp',f0:4000,d:.06,g:.5}),T(F,{f:1500,f2:700,d:.08,g:.3,solo:1})),
  titan:F=>mk(.3,K(F,{f:90,t60:.4,modal:1,rt:[1,1.19,2.01],n:3,g:1}),S(F,{f:45,f2:30,d:.25,g:1})),
  freighter:F=>mk(.22,K(F,{f:180,t60:.3,modal:1,rt:[1,2.4,3.9,6],n:4,g:1}),B(F,{type:'bp',f0:420,q:3,d:.15,g:.5}),C(F,{g:.3,f:3000})),
  bulwark:F=>mk(.18,T(F,{f:800,f2:500,d:.13,g:.9,sine:1,solo:1,rm:90}),K(F,{f:520,t60:.18,modal:1,rt:[1,2,3,4],n:4,g:.8}),C(F,{g:.3})),
  reaver:F=>mk(.14,Vo(F,{f:300,f2:200,vowel:'e',to:'a',d:.1,g:1}),B(F,{type:'bp',f0:2200,q:2,d:.06,g:.5}),S(F,{f:150,f2:90,d:.07,g:.5})),
  specter:F=>mk(.14,B(F,{type:'hp',f0:5000,f1:2500,t:.08,d:.1,g:.8}),T(F,{f:1800,f2:900,d:.12,g:.3,sine:1,solo:1})),
  crawler:F=>mk(.13,SKT(F,{f0:2400,d:.09,g:1}),C(F,{g:.5,f:2400}),C(F,{g:.4,f:3100,del:.03}),K(F,{f:1800,t60:.06,modal:1,n:3,g:.4})),
  spitter:F=>mk(.14,B(F,{type:'bp',f0:500,q:1.5,d:.09,g:1}),T(F,{f:260,f2:140,d:.08,g:.6,vib:60,sq:0})),
  brute:F=>mk(.2,Vo(F,{f:80,f2:60,vowel:'o',scale:.55,d:.14,g:1}),S(F,{f:70,f2:45,d:.12,g:.8}),B(F,{c:'brown',type:'lp',f0:500,d:.1,g:.5})),
  hero_idris:F=>mk(.14,K(F,{f:700,t60:.15,modal:1,rt:[1,2.7,4.7],n:3,g:1}),C(F,{g:.5,f:4000}),B(F,{type:'hp',f0:3500,d:.05,g:.3})),
  hero_kaz:F=>mk(.18,Vo(F,{f:100,f2:75,vowel:'o',d:.12,g:.8,scale:.8}),K(F,{f:240,t60:.2,modal:1,rt:[1,1.5,2.6],n:3,g:.7}),S(F,{f:80,f2:50,d:.08,g:.7})),
  hero_lyra:F=>mk(.2,K(F,{f:2000,t60:.3,modal:1,n:3,g:1}),B(F,{type:'hp',f0:6000,d:.04,g:.3}),T(F,{f:1500,d:.12,g:.3,sine:1,solo:1}))
};
/* ------------------------------------------------------------------ DIE (organic / mechanical / hero; impact <= 0.9 s, boom <= 2.4 s with a held body so the transient cannot dominate the peak, hero alert) */
const DIE={
  hauler:F=>mkx({dur:.5},T(F,{f:1100,f2:300,t:.35,d:.4,g:1}),B(F,{type:'lp',f0:4000,f1:500,t:.4,d:.4,g:.5}),S(F,{f:120,f2:60,d:.2,g:.8,del:.15})),
  rifleman:F=>mkx({dur:.6},Vo(F,{f:220,f2:110,vowel:'a',to:'o',morph:.4,a:.015,d:.45,g:1}),B(F,{type:'bp',f0:1200,d:.2,g:.4}),B(F,{type:'bp',f0:700,f1:400,a:.1,d:.3,g:.5,del:.15}),S(F,{f:100,f2:50,d:.25,g:.8,del:.1})),
  raptor:F=>mkx({dur:.55},Vo(F,{f:650,f2:250,vowel:'i',to:'e',morph:.3,a:.01,d:.4,g:1}),B(F,{type:'bp',f0:3000,f1:1200,q:2,d:.25,g:.5}),C(F,{g:.4,f:3800}),C(F,{g:.3,f:3200,del:.07})),
  rocketeer:F=>mkx({dur:.6},Vo(F,{f:200,f2:90,vowel:'a',to:'uh',morph:.4,a:.015,d:.3,g:.5}),B(F,{type:'lp',f0:3000,f1:300,d:.4,g:.9,del:.05}),S(F,{f:90,f2:45,d:.3,g:1,del:.05}),C(F,{g:.3,f:3000,del:.06})),
  mender:F=>mkx({dur:.8},K(F,{f:660,t60:.5,n:3,g:.8}),K(F,{f:495,t60:.5,n:3,g:.7,del:.12}),K(F,{f:330,t60:.5,n:3,g:.6,del:.26}),B(F,{type:'hp',f0:5000,d:.3,g:.2})),
  howitzer:F=>mkx({dur:1.2,cls:'boom'},C(F,{g:.35,f:3000}),C(F,{g:.25,f:2500,del:.04}),B(F,{type:'lp',f0:3500,f1:250,t:.95,a:.01,s:.45,dd:.2,len:.95,r:.5,g:1.3}),S(F,{f:80,f2:30,a:.01,s:.7,dd:.15,len:.9,r:.6,g:.5}),K(F,{f:900,t60:.5,modal:1,rt:[1,2.9,5.6],n:3,g:.25,del:.03}),B(F,{type:'hp',f0:4500,a:.05,d:.5,g:.35,del:.15})),
  juggernaut:F=>mkx({dur:1.5,cls:'boom'},S(F,{f:55,f2:26,a:.015,s:.7,dd:.2,len:.9,r:.5,g:.45}),B(F,{c:'brown',type:'lp',f0:600,f1:80,t:1.1,a:.02,s:.5,dd:.3,len:1.0,r:.5,g:.45}),K(F,{f:150,t60:.6,modal:1,rt:[1,1.6,2.7,4.1],n:4,g:.6,del:.08}),K(F,{f:230,t60:.45,modal:1,rt:[1,1.6,2.7,4.1],n:4,g:.5,del:.3}),K(F,{f:190,t60:.45,modal:1,rt:[1,1.6,2.7,4.1],n:4,g:.45,del:.55}),B(F,{type:'hp',f0:2000,a:.04,s:.4,dd:.2,len:.7,r:.4,g:[.4,.4,.7],del:.05}),B(F,{type:'bp',f0:1400,f1:700,t:.9,q:1,a:.05,s:.5,dd:.2,len:.9,r:.4,g:[.35,.35,.7],trem:22,del:.1})),
  skiff:F=>mkx({dur:1.3,cls:'boom'},T(F,{f:2200,f2:180,t:.9,s:.8,dd:.1,len:.9,r:.25,a:.01,g:.6}),B(F,{type:'lp',f0:4000,f1:300,t:.9,s:.5,dd:.2,len:.9,r:.3,g:.5}),S(F,{f:60,f2:35,a:.01,s:.6,dd:.1,len:.5,r:.3,del:.8,g:1.2})),
  titan:F=>mkx({dur:2.4,cls:'boom'},S(F,{f:40,f2:16,a:.04,s:.8,dd:.4,len:2,r:1.1,g:1}),B(F,{c:'brown',type:'lp',f0:300,f1:50,t:2.2,a:.08,s:.6,dd:.4,len:2.1,r:1.1,g:[1.1,1.1,2.2]}),T(F,{f:70,f2:24,t:2,a:.1,s:.7,dd:.3,len:1.8,r:1,g:.8,cut:.5}),K(F,{f:60,t60:2,modal:1,rt:[1,1.19,2.01],n:3,g:.3,del:.1}),S(F,{f:50,f2:22,a:.02,d:.7,del:1,g:.6})),
  freighter:F=>mkx({dur:1.7,cls:'boom'},T(F,{f:90,f2:40,t:1.1,s:.7,dd:.2,len:1.2,r:.5,a:.02,g:.8,trem:14}),B(F,{c:'brown',type:'lp',f0:700,f1:100,t:1.4,a:.02,s:.5,dd:.3,len:1.4,r:.6,g:1}),S(F,{f:60,f2:30,a:.02,s:.6,dd:.15,len:.8,r:.5,del:.6,g:1})),
  bulwark:F=>mkx({dur:1.2,cls:'boom'},T(F,{f:900,f2:60,t:.8,s:.7,dd:.15,len:.8,r:.3,a:.01,g:.8,sine:1,solo:1,rm:120}),B(F,{type:'lp',f0:2500,f1:200,t:.8,a:.01,s:.5,dd:.2,len:.8,r:.4,g:.3}),K(F,{f:200,t60:1,modal:1,rt:[1,2,3,4],n:4,g:.7,del:.02}),S(F,{f:70,f2:35,a:.01,s:.6,dd:.15,len:.6,r:.4,g:.9})),
  reaver:F=>mkx({dur:.7},Vo(F,{f:130,f2:50,vowel:'a',to:'uh',morph:.5,a:.02,d:.55,g:1,trem:18,drive:.5}),B(F,{c:'pink',type:'lp',f0:900,f1:250,d:.4,g:.5}),S(F,{f:100,f2:45,d:.3,g:.8,del:.2})),
  specter:F=>mkx({dur:.8},T(F,{f:2000,f2:200,t:.6,d:.6,g:.6,sine:1,solo:1}),B(F,{type:'bp',f0:3000,f1:400,t:.6,q:2,d:.6,g:.7,trem:24}),T(F,{f:1000,f2:150,t:.7,d:.7,g:.3,sine:1,solo:1,del:.05})),
  crawler:F=>mkx({dur:.35},Vo(F,{f:1500,f2:500,vowel:'i',to:'e',morph:.2,d:.22,a:.01,g:.9}),C(F,{g:.4,f:2800}),SKT(F,{f0:2000,trem:25,d:.3,g:.8}),B(F,{type:'bp',f0:2500,q:2,d:.15,g:.4,del:.1})),
  spitter:F=>mkx({dur:.5},T(F,{f:600,f2:150,t:.35,d:.35,g:.7,vib:70,sq:0}),B(F,{type:'bp',f0:900,f1:300,d:.4,g:.8}),Vo(F,{f:240,f2:110,vowel:'o',to:'uh',d:.35,g:.5,vib:60})),
  brute:F=>mkx({dur:.9},Vo(F,{f:80,f2:40,vowel:'a',to:'o',morph:.6,scale:.55,a:.04,d:.7,g:1,drive:.4}),B(F,{c:'brown',type:'lp',f0:500,f1:120,d:.7,g:.6}),S(F,{f:60,f2:30,d:.4,g:1,del:.35})),
  hero_idris:F=>mkx({dur:1.6,cls:'alert',prio:'hero',vary:{}},T(F,{abs:1,f:nt(F,4,0),f2:nt(F,0,-1),t:1.3,s:.7,len:1.3,a:.04,r:.3,g:1,cut:.8}),Vo(F,{abs:1,f:nt(F,0,0),vowel:'o',a:.1,s:.5,len:1.2,r:.3,g:.5}),K(F,{abs:1,f:nt(F,0,1),t60:1.2,modal:1,rt:[1,2.7,4.7],n:3,g:.6,del:.1}),K(F,{abs:1,f:nt(F,0,1),t60:1.2,modal:1,rt:[1,2.7,4.7],n:3,g:.5,del:.7})),
  hero_kaz:F=>mkx({dur:1.9,cls:'alert',prio:'hero',vary:{}},H(F,{abs:1,f:nt(F,0,0),len:1.5,a:.08,g:1,cut:.8}),S(F,{f:65,f2:30,d:.5,g:1,del:.3}),S(F,{f:60,f2:30,d:.5,g:.9,del:.75}),S(F,{f:55,f2:28,d:.6,g:.8,del:1.2}),B(F,{c:'brown',type:'lp',f0:600,f1:100,t:1.4,d:1.5,g:.3})),
  hero_lyra:F=>mkx({dur:2,cls:'alert',prio:'hero',vary:{}},K(F,{abs:1,f:nt(F,4,1),t60:.9,modal:1,n:3,g:.7}),K(F,{abs:1,f:nt(F,2,1),t60:.9,modal:1,n:3,g:.6,del:.15}),K(F,{abs:1,f:nt(F,0,1),t60:1.2,modal:1,n:3,g:.6,del:.3}),Vo(F,{abs:1,f:nt(F,0,0),vowel:'o',a:.15,s:.5,len:1.5,r:.5,g:.5}))
};
/* ------------------------------------------------------------------ READY (<= 0.6 s, class impact): unit trained, a short rising jingle in the faction's key that ends on a bell ring */
const RING=(deg,o,len)=>F=>K(F,{abs:1,f:nt(F,deg,o),t60:len||.3,modal:1,n:3,g:.5,del:.0});
const READY={
  hauler:F=>mk(.36,K(F,{f:420,t60:.1,modal:1,rt:[1,2.9,5.6],n:3,g:.9}),T(F,{abs:1,f:nt(F,4,1)*.5,f2:nt(F,4,1),t:.12,del:.06,a:.004,d:.16,g:.8}),B(F,{type:'hp',f0:5500,d:.12,g:.25,del:.2})),
  rifleman:MU({k:'blip',d:[0,2,4],o:0,st:.08,len:.08,dur:.34,x:F=>[C(F,{g:.4}),K(F,{abs:1,f:nt(F,4,1),t60:.25,modal:1,n:3,g:.4,del:.16})]}),
  raptor:MU({k:'voc',d:[0,2],o:1,st:.1,len:.1,vw:'ae',dur:.3,x:F=>[B(F,{type:'bp',f0:800,f1:4000,t:.12,q:1.2,d:.12,g:.4})]}),
  rocketeer:MU({k:'blip',d:[0,0,4],o:1,st:.08,len:.05,sq:1,dur:.3,x:F=>[B(F,{type:'bp',f0:1800,q:1,a:.01,d:.28,g:.55})]}),
  mender:MU({k:'pluck',d:[0,2,4,7],o:1,st:.07,len:.12,dur:.42}),
  howitzer:MU({k:'bell',d:[0,4],o:-1,st:.12,len:.22,dur:.46,x:F=>[S(F,{f:90,f2:60,d:.15,g:.8}),C(F,{g:.4,f:2500})]}),
  juggernaut:MU({k:'blip',d:[0,4],o:-1,st:.12,len:.16,sq:1,cut:.8,dur:.4,x:F=>[S(F,{f:70,f2:45,d:.2,g:.9})]}),
  skiff:F=>mk(.38,B(F,{type:'bp',f0:600,f1:6000,t:.3,q:1.2,a:.1,d:.25,g:1}),T(F,{abs:1,f:nt(F,0,0)*.5,f2:nt(F,7,1),t:.3,a:.06,d:.3,g:.5})),
  titan:MU({k:'horn',d:[0,4],o:-2,st:.2,len:.35,a:.04,dur:.6,x:F=>[S(F,{f:50,f2:40,d:.35,g:.8})]}),
  freighter:MU({k:'horn',d:[0,3],o:-1,st:.2,len:.22,a:.02,dur:.5,x:F=>[B(F,{c:'pink',type:'lp',f0:500,d:.3,g:.2})]}),
  bulwark:MU({k:'bell',d:[0,4,7],o:1,st:.1,len:.16,dur:.5,x:F=>[T(F,{abs:1,f:nt(F,0,0),f2:nt(F,0,1),t:.35,a:.02,s:.7,len:.4,r:.08,g:.4,sine:1,solo:1})]}),
  reaver:MU({k:'voc',d:[0,3],o:-1,st:.12,len:.14,vw:'a',to:'o',dur:.36,x:F=>[C(F,{g:.35})]}),
  specter:MU({k:'blip',d:[4,7],o:1,st:.1,len:.14,sine:1,solo:1,dur:.4,x:F=>[B(F,{type:'bp',f0:3800,q:3,a:.05,d:.25,g:.3})]}),
  crawler:F=>mk(.3,SKT(F,{d:.28,g:1.2,trem:30}),C(F,{g:.35,f:2800}),C(F,{g:.4,f:3300,del:.06}),C(F,{g:.45,f:3800,del:.11}),C(F,{g:.5,f:4400,del:.15}),Vo(F,{f:1200,f2:2400,vowel:'i',d:.15,del:.14,a:.01,g:.3})),
  spitter:F=>mk(.4,T(F,{f:220,f2:440,t:.3,d:.35,a:.04,g:.7,vib:70,sq:0}),B(F,{type:'bp',f0:500,f1:900,t:.3,q:1.5,d:.35,g:.6}),Vo(F,{f:200,vowel:'o',to:'e',morph:.3,d:.3,g:.4,vib:60})),
  brute:F=>mk(.55,Vo(F,{f:60,f2:80,vowel:'o',to:'a',morph:.4,scale:.55,a:.08,d:.45,g:1,drive:.3}),S(F,{f:50,f2:40,d:.4,g:.8}),B(F,{c:'brown',type:'lp',f0:400,d:.4,g:.4})),
  hero_idris:MU({k:'horn',d:[0,3,4],o:0,st:.12,len:.2,a:.015,dur:.58}),
  hero_kaz:MU({k:'horn',d:[0,6],o:-1,st:.2,len:.3,a:.04,dur:.58,x:F=>[S(F,{f:75,f2:50,d:.2,g:.9}),S(F,{f:75,f2:50,d:.2,g:.8,del:.2}),C(F,{g:.4})]}),
  hero_lyra:MU({k:'bell',d:[0,4,7,9],o:1,st:.1,len:.2,dur:.58,x:F=>[Vo(F,{abs:1,f:nt(F,4,0),vowel:'o',a:.08,s:.5,len:.4,r:.1,g:.3})]})
};

const EVT={select:SELECT,ack:ACK,fire:FIRE,melee:MELEE,die:DIE,ready:READY,hit:HIT};
const CLS={select:'ui',ack:'ui',fire:'fire',melee:'impact',die:'impact',ready:'impact',hit:'impact'};
const VARY={select:{pitch:.012,filter:.1,gain:.05},ack:{pitch:.012,filter:.1,gain:.05},ready:{pitch:.01,filter:.06}};
const RVS={select:.6,ack:.35,fire:0,melee:0,die:.6,ready:.6,hit:0};   // reverb send scale per event: a tail inside the loudness window would lower its RMS and force the transient over the peak limit
const CREEP={crawler:1,spitter:1,brute:1};
/*TRIM:BEGIN*/
const TRIM={'brute.ack':[0.1955],'brute.die':[0.5053],'brute.fire':[0.3662],'brute.hit':[0.5532],'brute.melee':[0.5241],'brute.ready':[0.4424],'brute.select':[0.1918],'bulwark.ack':[0.1692,0.1618,0.2165],'bulwark.die':[0.408,0.3824,0.5672],'bulwark.fire':[0.4084,0.2949,0.4282],'bulwark.hit':[0.366,0.4772,0.3878],'bulwark.melee':[0.3251,0.3724,0.3253],'bulwark.ready':[0.3458,0.3248,0.3414],'bulwark.select':[0.1615,0.1412,0.2498],'crawler.ack':[1.3028],'crawler.die':[3.3694],'crawler.fire':[2.6981],'crawler.hit':[0.9028],'crawler.melee':[2.997],'crawler.ready':[3.5595],'crawler.select':[1.2932],'freighter.ack':[0.1575,0.1113,0.2481],'freighter.die':[0.5999,0.3743,0.7246],'freighter.fire':[0.1971,0.1694,0.3172],'freighter.hit':[0.3555,0.4399,0.3502],'freighter.melee':[0.4432,0.332,0.6812],'freighter.ready':[0.3898,0.2475,0.3885],'freighter.select':[0.1961,0.1306,0.198],'hauler.ack':[0.4237,0.2257,0.4395],'hauler.die':[0.6072,0.3951,0.6753],'hauler.fire':[0.6718,0.4207,0.6586],'hauler.hit':[0.349,0.3675,0.3308],'hauler.melee':[0.3195,0.3456,0.3496],'hauler.ready':[0.7662,0.6836,0.7373],'hauler.select':[0.4446,0.2791,0.4022],'hero_idris.ack':[0.166,0.0962,0.1825],'hero_idris.die':[0.3445,0.2671,0.2961],'hero_idris.fire':[0.3596,0.2397,0.3858],'hero_idris.hit':[0.3323,0.4097,0.3296],'hero_idris.melee':[1.2295,0.6707,1.0911],'hero_idris.ready':[0.3313,0.2269,0.3603],'hero_idris.select':[0.1613,0.1028,0.1708],'hero_kaz.ack':[0.151,0.092,0.2135],'hero_kaz.die':[0.3052,0.2632,0.5729],'hero_kaz.fire':[0.4547,0.2466,0.2622],'hero_kaz.hit':[0.4843,0.3552,0.3823],'hero_kaz.melee':[0.4001,0.328,0.5392],'hero_kaz.ready':[0.3267,0.2178,0.3718],'hero_kaz.select':[0.1313,0.0943,0.2103],'hero_lyra.ack':[0.1843,0.2603,0.1674],'hero_lyra.die':[0.6168,0.5074,0.4545],'hero_lyra.fire':[0.4925,0.3981,0.4877],'hero_lyra.hit':[0.3465,0.4156,0.3418],'hero_lyra.melee':[0.3402,0.4117,0.3478],'hero_lyra.ready':[0.3175,0.3265,0.2947],'hero_lyra.select':[0.1326,0.115,0.0966],'howitzer.ack':[0.354,0.2318,0.3524],'howitzer.die':[0.899,0.4544,1.4449],'howitzer.fire':[0.5005,0.3229,0.9471],'howitzer.hit':[0.3255,0.3003,0.3469],'howitzer.melee':[0.3219,0.3246,0.3473],'howitzer.ready':[0.3305,0.3247,0.3561],'howitzer.select':[0.3025,0.2341,0.2846],'juggernaut.ack':[0.226,0.1118,0.4615],'juggernaut.die':[0.7629,0.5593,0.9778],'juggernaut.fire':[0.3104,0.2268,0.3668],'juggernaut.hit':[0.3672,0.4133,0.3588],'juggernaut.melee':[0.4469,0.3233,0.5264],'juggernaut.ready':[0.6495,0.3403,0.7314],'juggernaut.select':[0.2792,0.1808,0.3885],'mender.ack':[0.2573,0.1693,0.1619],'mender.die':[0.7675,0.5947,0.437],'mender.fire':[0.3734,0.3215,0.2268],'mender.hit':[0.4686,0.3622,0.3512],'mender.melee':[0.4515,0.378,0.3472],'mender.ready':[0.5911,0.3774,0.3408],'mender.select':[0.2322,0.1587,0.1402],'raptor.ack':[0.351,0.1577,0.2968],'raptor.die':[1.9704,0.4877,0.5614],'raptor.fire':[2.3276,0.3763,0.5204],'raptor.hit':[2.1969,0.5392,0.5489],'raptor.melee':[2.3966,0.6847,0.9551],'raptor.ready':[0.3587,0.4082,0.5404],'raptor.select':[0.6519,0.1832,0.2207],'reaver.ack':[1.0786,0.2374,0.294],'reaver.die':[0.936,0.4857,0.5998],'reaver.fire':[1.6447,0.3513,0.2819],'reaver.hit':[0.8473,0.3634,0.3718],'reaver.melee':[1.4408,0.9051,2.0179],'reaver.ready':[2.6821,0.645,0.5787],'reaver.select':[0.9399,0.2293,0.2138],'rifleman.ack':[0.3618,0.1841,0.3567],'rifleman.die':[0.9034,0.4137,0.4959],'rifleman.fire':[0.414,0.2987,0.3723],'rifleman.hit':[0.5333,0.34,1.0083],'rifleman.melee':[0.538,0.332,0.9039],'rifleman.ready':[0.7869,0.5388,0.7597],'rifleman.select':[0.4033,0.2039,0.3685],'rocketeer.ack':[0.4248,0.2311,0.4212],'rocketeer.die':[0.6169,0.3526,0.8757],'rocketeer.fire':[0.3425,0.2332,0.7479],'rocketeer.hit':[0.5147,0.3555,0.9965],'rocketeer.melee':[0.6183,0.4382,0.5874],'rocketeer.ready':[1.1922,0.6023,1.0538],'rocketeer.select':[0.5216,0.2573,0.4842],'skiff.ack':[0.3934,0.2303,0.4061],'skiff.die':[0.6042,0.4139,0.793],'skiff.fire':[0.5105,0.3883,0.4914],'skiff.hit':[0.3309,0.418,0.3379],'skiff.melee':[0.6549,0.4441,0.6115],'skiff.ready':[1.211,0.5068,1.1716],'skiff.select':[0.3299,0.207,0.3173],'specter.ack':[0.385,0.2973,0.64],'specter.die':[0.8656,0.7495,1.2388],'specter.fire':[1.0204,0.4191,0.5572],'specter.hit':[1.2192,0.8182,1.6375],'specter.melee':[1.2267,0.8983,1.7082],'specter.ready':[0.7101,0.4839,1.0316],'specter.select':[0.1969,0.188,0.2938],'spitter.ack':[0.4228],'spitter.die':[1.0126],'spitter.fire':[0.7434],'spitter.hit':[1.469],'spitter.melee':[1.5757],'spitter.ready':[1.0554],'spitter.select':[0.3893],'titan.ack':[0.1417,0.0802,0.171],'titan.die':[0.3431,0.2389,0.4938],'titan.fire':[0.4588,0.3069,0.9288],'titan.hit':[0.2953,0.2863,0.3552],'titan.melee':[0.4196,0.3083,0.6513],'titan.ready':[0.3375,0.195,0.3157],'titan.select':[0.1237,0.0793,0.1837]};
/*TRIM:END*/
for(const ev in EVT){
  const tab=EVT[ev];
  for(const u in tab){
    const facs=CREEP[u]?['wild']:['meridian','obsidian','aurora'],tr=TRIM[u+'.'+ev];
    for(const fid of facs){
      const F=FPI[fid],def=tab[u](F),meta={cls:def.cls||CLS[ev],gain:tr?tr[F.ix===3?0:F.ix]:1};
      for(const L of def.layers)if(L.send)L.send.rev=R4(L.send.rev*RVS[ev]);
      const o={dur:def.dur,layers:def.layers};
      if(def.variants){o.variants=def.variants;o.seq=def.seq;}
      let vy=def.vary||VARY[ev];
      if(!def.vary&&def.layers.some(L=>L.k==='formant'))vy=Object.assign({},vy||{pitch:.05,gain:.07},{filter:.05});   // formants: a sliding resonance would swing the level
      if(vy)o.vary=vy;
      if(u.indexOf('hero_')===0)o.prio=def.prio||'hero';
      registerVoice(u+'.'+ev+'.'+fid,Object.assign(o,meta));
    }
  }
}
})();
