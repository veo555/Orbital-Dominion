/* =========================================================================
   FORTIFY SOUND DESIGN (v6-G1) — voices for the defence structures, the Dropship and the defence events, in the voice DSL of 80_audio.js
   (the raw-layer style of the GLOBALS block in 81_sfx_world.js). No randomness here (the engine's seeded rng varies each instance), no DOM.
   Ids registered (each replaces the generic fallback of the same id):
     <wall|gate|gatev|bunker|cannon|flak|sensor|battery|mine>.place|done|die.<faction>   <cannon|flak>.fire.<faction>
     dropship.select|ack|ready|die.<faction>
     global.scan  global.mineBlast  global.cargoLoad  global.cargoUnload  global.gateOpen  global.gateClose  global.fortress  global.fortFire  global.batteryHeal
   Faction colour: one archetype per event, rendered per faction with a pitch factor (meridian 1, obsidian 0.78 + drive, aurora 1.4 + glassy FM),
   the same family rule as 81_sfx_world.js. Loudness: gains set by ear-free arithmetic against the class targets (ui -26, fire -22, impact -18,
   boom -14); NOT calibrated by tests/audio/world_gate.py (that gate covers the twelve v5 buildings) — listed as unverified in docs/DESIGN_FORTIFY.md.
   ========================================================================= */
(function(){
'use strict';
const O=(type,f,o)=>Object.assign({k:'osc',type,f},o),Z=(color,o)=>Object.assign({k:'noise',color},o),M=(f,ratio,idx,o)=>Object.assign({k:'fm',f,ratio,idx},o);
const D=(f,ratios,o)=>{const t=(o&&o.t60)||.4,r=Object.assign({k:'pluck',mode:'modal',f,ratios,tilt:.4,damp:.3},o);r.t60=t;r.dur=t+.06;r.env={a:.002,d:.01,s:1,r:.05};return r;};
const lp=(f0,f1,t,q)=>({type:'lp',f0,f1,t,q}),hp=f0=>({type:'hp',f0}),bp=(f0,f1,t,q)=>({type:'bp',f0,f1,t,q});
const BAR=[1,2.32,4.25,6.63],BELL=[1,2.76,5.4,8.93],CLANG=[1,1.47,2.09,2.56,3.4];
const FAC=[{id:'meridian',pm:1,drv:0,mat:BAR},{id:'obsidian',pm:.78,drv:.45,mat:CLANG},{id:'aurora',pm:1.4,drv:0,mat:BELL}];
const fit=d=>{let m=d.dur||0;for(const L of d.layers)m=Math.max(m,(L.delay||0)+(L.dur||0));d.dur=Math.round(m*100)/100;return d;};
/* archetypes: (F) -> {dur,layers}; F.pm scales pitch, F.drv adds grit, F.mat is the struck material */
const thump=(F,f,g,del)=>O('sine',f*F.pm,{pitch:{from:f*F.pm,to:f*F.pm*.5,t:.12},delay:del||0,dur:.16,env:{d:.14},gain:g||1,drive:F.drv});
const strike=(F,f,g,del,t)=>D(f*F.pm,F.mat,{t60:t||.25,delay:del||0,gain:g||.8,drive:F.drv*.5});
const hiss=(g,del,d)=>Z('white',{delay:del||0,dur:(d||.12)+.01,env:{d:d||.12},gain:g||.4,filter:hp(4500)});
const rumble=(g,len,del)=>Z('brown',{delay:del||0,dur:len,env:{a:.01,d:len*.8},gain:g||.8,filter:lp(1600,120,len*.8)});
const ARCH={
  place:F=>({dur:.4,layers:[thump(F,120,1),strike(F,300,.7,.05,.18),hiss(.25,.08),thump(F,140,.7,.2)]}),
  done:{
    wall:F=>({dur:.35,layers:[strike(F,220,.9,0,.22),thump(F,90,.8)]}),
    gate:F=>({dur:.6,layers:[O('sawtooth',90*F.pm,{pitch:{from:90*F.pm,to:180*F.pm,t:.35},dur:.4,env:{a:.02,d:.36},gain:.5,filter:lp(900),drive:F.drv}),strike(F,440,.7,.35,.2)]}),
    bunker:F=>({dur:.6,layers:[thump(F,100,1),strike(F,260,.8,.1,.3),strike(F,330,.6,.25,.3)]}),
    cannon:F=>({dur:.55,layers:[O('square',180*F.pm,{pitch:{from:180*F.pm,to:420*F.pm,t:.2},dur:.24,env:{d:.22},gain:.35,filter:lp(2000)}),strike(F,520,.7,.2,.3),thump(F,110,.6,.2)]}),
    flak:F=>({dur:.55,layers:[O('triangle',600*F.pm,{pitch:{from:600*F.pm,to:1200*F.pm,t:.25},dur:.28,env:{d:.26},gain:.4}),strike(F,780,.6,.25,.25)]}),
    sensor:F=>({dur:.8,layers:[M(660*F.pm,3,{from:2,to:.2},{dur:.25,env:{d:.24},gain:.5}),M(990*F.pm,3,{from:2,to:.2},{delay:.22,dur:.4,env:{d:.38},gain:.45,send:{rev:.2,room:'plate'}})]}),
    battery:F=>({dur:.7,layers:[O('sine',220*F.pm,{pitch:{from:220*F.pm,to:660*F.pm,t:.4},dur:.45,env:{a:.05,d:.4},gain:.5}),strike(F,880,.5,.38,.3)]}),
    mine:F=>({dur:.25,layers:[O('sine',1400*F.pm,{dur:.06,env:{d:.05},gain:.35}),O('sine',1400*F.pm,{delay:.1,dur:.06,env:{d:.05},gain:.3})]})},
  die:F=>({dur:1.1,layers:[hiss(.4,0,.08),thump(F,80,1),rumble(.7,.9,.02),strike(F,180,.5,.15,.4),strike(F,240,.4,.4,.35)]}),
  fire:{
    cannon:F=>({dur:.3,layers:[thump(F,95,1),Z('pink',{dur:.2,env:{d:.18},gain:.6,filter:lp(2400,300,.18)}),hiss(.25,0,.05)]}),
    flak:F=>({dur:.28,layers:[O('sawtooth',1600*F.pm,{pitch:{from:1600*F.pm,to:500*F.pm,t:.12},dur:.16,env:{d:.14},gain:.4,filter:lp(5000)}),hiss(.35,0,.18)]})}
};
const CLS={place:'impact',done:'impact',die:'impact',fire:'fire'},GAIN={place:.55,done:.5,die:.45,fire:.4};
const TYPES=['wall','gate','gatev','bunker','cannon','flak','sensor','battery','mine'];
for(const F of FAC)for(const ty of TYPES)for(const ev of['place','done','die','fire']){
  let a=ARCH[ev];if(typeof a!=='function'){const k=ty==='gatev'?'gate':ty;a=a[k];if(!a)continue;}
  const d=fit(a(F));registerVoice(ty+'.'+ev+'.'+F.id,{dur:d.dur,layers:d.layers,cls:CLS[ev],gain:GAIN[ev]*(F.id==='obsidian'?.8:1),vary:{pitch:.03,filter:.08,gain:.05}});}
/* Dropship: engine drone + acknowledgement chirps */
const DS={
  select:F=>({dur:.35,layers:[O('sawtooth',110*F.pm,{dur:.3,env:{a:.03,d:.27},gain:.35,filter:lp(900),drive:F.drv}),O('sine',880*F.pm,{delay:.05,dur:.12,env:{d:.1},gain:.25})]}),
  ack:F=>({dur:.3,layers:[O('sine',660*F.pm,{dur:.08,env:{d:.07},gain:.35}),O('sine',990*F.pm,{delay:.09,dur:.1,env:{d:.09},gain:.3}),Z('white',{dur:.25,env:{a:.02,d:.22},gain:.15,filter:bp(1800,600,.2,1.5)})]}),
  ready:F=>({dur:.6,layers:[Z('white',{dur:.55,env:{a:.15,d:.38},gain:.35,filter:bp(400,2400,.5,1.2)}),O('sine',523*F.pm,{delay:.3,dur:.2,env:{d:.18},gain:.3})]}),
  die:F=>({dur:1.2,layers:[thump(F,70,1),rumble(.8,1.0),O('sawtooth',900*F.pm,{pitch:{from:900*F.pm,to:120*F.pm,t:.8},dur:.85,env:{d:.8},gain:.3,filter:lp(3000)})]})};
for(const F of FAC)for(const ev in DS){const d=fit(DS[ev](F));registerVoice('dropship.'+ev+'.'+F.id,{dur:d.dur,layers:d.layers,cls:ev==='die'?'boom':'ui',gain:ev==='die'?.5:.6});}
/* defence events */
const GL={
  scan:{cls:'impact',dur:1.2,layers:[M(440,2.01,{from:3,to:.2},{pitch:{from:300,to:900,t:.6},dur:.8,env:{a:.05,d:.7},gain:.45,send:{rev:.25,room:'plate'}}),Z('white',{dur:1.0,env:{a:.3,d:.65},gain:.18,filter:bp(800,5000,.9,2)}),O('sine',1760,{delay:.6,dur:.4,env:{d:.38},gain:.2})]},
  mineBlast:{cls:'boom',dur:1.0,layers:[O('sine',70,{pitch:{from:120,to:40,t:.3},dur:.4,env:{d:.38},gain:1,drive:.3}),Z('pink',{dur:.7,env:{d:.6},gain:.8,filter:lp(3000,250,.5)}),Z('white',{dur:.1,env:{d:.08},gain:.5,filter:hp(3000)})]},
  cargoLoad:{cls:'ui',dur:.3,layers:[O('triangle',520,{pitch:{from:700,to:420,t:.12},dur:.14,env:{d:.12},gain:.5}),D(330,BAR,{delay:.12,t60:.12,gain:.6})]},
  cargoUnload:{cls:'ui',dur:.3,layers:[O('triangle',420,{pitch:{from:420,to:700,t:.12},dur:.14,env:{d:.12},gain:.5}),D(392,BAR,{delay:.12,t60:.12,gain:.6})]},
  gateOpen:{cls:'ui',dur:.45,layers:[O('sawtooth',140,{pitch:{from:140,to:280,t:.3},dur:.32,env:{a:.02,d:.3},gain:.35,filter:lp(1200)}),Z('white',{dur:.3,env:{d:.28},gain:.15,filter:bp(2500,600,.3,1.2)})]},
  gateClose:{cls:'ui',dur:.45,layers:[O('sawtooth',280,{pitch:{from:280,to:120,t:.3},dur:.32,env:{a:.02,d:.3},gain:.35,filter:lp(1200)}),D(180,BAR,{delay:.3,t60:.14,gain:.7})]},
  fortress:{cls:'impact',dur:1.2,layers:[O('sawtooth',73,{dur:1.0,env:{a:.05,d:.2,s:.6,r:.3},gain:.5,filter:lp(500,1800,.6),unison:{n:2,spread:10}}),D(220,BAR,{delay:.2,t60:.6,gain:.7}),D(330,BAR,{delay:.5,t60:.6,gain:.6}),O('sine',55,{dur:1.0,env:{a:.05,d:.9},gain:.6})]},
  fortFire:{cls:'fire',dur:.32,layers:[O('sine',85,{pitch:{from:140,to:50,t:.2},dur:.25,env:{d:.23},gain:1}),Z('pink',{dur:.22,env:{d:.2},gain:.6,filter:lp(2200,250,.2)})]},
  batteryHeal:{cls:'fire',dur:.4,gap:250,layers:[O('sine',880,{pitch:{from:660,to:1320,t:.3},dur:.32,env:{a:.03,d:.28},gain:.25}),Z('white',{dur:.3,env:{a:.05,d:.24},gain:.08,filter:hp(6000)})]}
};
for(const id in GL){const d=fit(GL[id]);registerVoice('global.'+id,Object.assign({},d,{gain:GL[id].cls==='boom'?.6:.5}));}
})();
