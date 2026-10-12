/* =========================================================================
   ARSENAL SOUND DESIGN (v6) — the voices of the new unit abilities and weapons. Same voice DSL and loudness rules as 81_sfx_world.js (docs/AUDIO_SPEC.md §8).
   Ids are skill.<name> (the Sound Lab lists them under Heroes & skills > Skills; the sim calls sfx('skill.emp'), sfx('skill.snipe'), sfx('skill.flak')... from 33_abilities.js and 20_sim.js fire()).
     flak sprint pounce pounceHit snipe            fire class  (<= 0.35 s, <= 4 source nodes)
     overcharge emp scan barrage lanceCharge burrowIn burrowOut     impact class
     lanceHit                                      boom class  (<= 2.5 s)
   The units themselves use the engine's generic fire / melee / select / die voices (the per-faction unit voice matrix of 81_sfx_units.js is v5 content; adding the 11 new units to it
   is listed in docs/DESIGN_ARSENAL.md §8). LOUDNESS: TRIM holds the per-voice gain that puts the ACTIVE-WINDOW RMS on the class target (fire -22, impact -18, boom -14); it is written by
   tests/audio/arsenal_gate.py --calibrate and checked by the same gate. No randomness here (the engine's seeded rng drives the variation), no DOM; one closure, no new global names.
   ========================================================================= */
(function(){
'use strict';
/*TRIM:BEGIN*/
const TRIM={'skill.burrowIn':0.4959,'skill.burrowOut':0.4961,'skill.emp':0.5147,'skill.flak':0.4674,'skill.lanceCharge':0.9731,'skill.lanceHit':0.7157,'skill.overcharge':0.4255,'skill.pounce':0.9347,'skill.pounceHit':0.3424,'skill.salvo':0.5672,'skill.scan':0.6017,'skill.snipe':1.2935,'skill.sprint':0.9953};
/*TRIM:END*/
const O=(type,f,o)=>Object.assign({k:'osc',type,f},o),Z=(color,o)=>Object.assign({k:'noise',color},o),M=(f,ratio,idx,o)=>Object.assign({k:'fm',f,ratio,idx},o);
const lp=(f0,f1,t,q)=>({type:'lp',f0,f1,t,q}),hp=(f0,f1,t)=>({type:'hp',f0,f1,t}),bp=(f0,f1,t,q)=>({type:'bp',f0,f1,t,q});
const fit=d=>{let m=d.dur;for(const L of d.layers)m=Math.max(m,(L.delay||0)+(L.dur||0));d.dur=Math.round(m*100)/100;return d;};
const V={
  /* ---- fire (-22) */
  'skill.flak':{cls:'fire',dur:.2,gap:60,vary:{pitch:.08,gain:.08},layers:[Z('white',{dur:.05,env:{d:.04},filter:hp(2500),gain:.7}),O('sawtooth',280,{pitch:{from:320,to:90,t:.14},dur:.16,env:{d:.14},filter:lp(2400)}),O('sine',720,{delay:.03,pitch:{from:900,to:300,t:.1},dur:.1,env:{d:.09},gain:.35})]},
  'skill.sprint':{cls:'fire',dur:.3,gap:150,layers:[Z('pink',{dur:.28,env:{a:.06,d:.2},filter:bp(1800,5200,.25,2),gain:.8}),O('triangle',400,{pitch:{from:400,to:1100,t:.25},dur:.28,env:{a:.02,d:.24},gain:.35})]},
  'skill.pounce':{cls:'fire',dur:.26,gap:120,layers:[Z('white',{dur:.2,env:{a:.02,d:.18},filter:bp(900,3000,.2,1.5)}),O('sawtooth',140,{pitch:{from:140,to:300,t:.18},dur:.22,env:{d:.2},filter:lp(1500),gain:.5})]},
  'skill.pounceHit':{cls:'fire',dur:.2,gap:100,vary:{pitch:.06,gain:.08},layers:[O('sine',130,{pitch:{from:150,to:60,t:.1},dur:.16,env:{d:.15}}),Z('white',{dur:.08,env:{d:.07},filter:lp(2200),gain:.7})]},
  'skill.snipe':{cls:'fire',dur:.34,gap:150,layers:[Z('white',{dur:.03,env:{d:.025},filter:hp(2000),gain:.5}),O('square',1500,{pitch:{from:1600,to:500,t:.06},dur:.08,env:{d:.07},filter:lp(3500),gain:.3}),O('sine',700,{delay:.02,pitch:{from:900,to:420,t:.25},dur:.3,env:{d:.28},gain:.5,send:{rev:.3,room:'hall'}})]},
  /* ---- impact (-18) */
  'skill.overcharge':{cls:'impact',dur:.55,gap:200,layers:[O('sine',220,{pitch:{from:220,to:440,t:.35},dur:.5,env:{a:.05,d:.45}}),M(660,2,{from:2,to:.1},{dur:.4,env:{a:.01,d:.38},gain:.5,send:{rev:.15,room:'plate'}}),Z('white',{dur:.2,env:{d:.18},filter:hp(5000),gain:.25})]},
  'skill.emp':{cls:'impact',dur:.7,gap:200,layers:[Z('white',{dur:.5,env:{a:.005,d:.45},filter:bp(2800,300,.4,3),gain:.7}),O('square',1400,{pitch:{from:1400,to:200,t:.5},dur:.55,env:{d:.5},filter:lp(3200),gain:.35,trem:{f:38,depth:.6}}),O('sine',70,{pitch:{from:90,to:40,t:.4},dur:.45,env:{d:.42}})]},
  'skill.scan':{cls:'impact',dur:.7,gap:300,layers:[O('sine',1200,{dur:.5,env:{a:.005,d:.48}}),O('sine',1800,{delay:.18,dur:.4,env:{d:.38},gain:.4}),Z('pink',{dur:.5,env:{a:.1,d:.4},filter:bp(4000,0,0,5),gain:.2})]},
  'skill.salvo':{cls:'impact',dur:.9,gap:400,layers:[Z('white',{dur:.8,env:{a:.15,d:.6},filter:bp(1800,600,.7,2),gain:.5}),O('sine',90,{pitch:{from:60,to:40,t:.8},dur:.85,env:{a:.1,d:.7},gain:.8}),O('sawtooth',480,{pitch:{from:900,to:300,t:.5},dur:.55,env:{a:.02,d:.5},filter:lp(2000),gain:.2})]},
  'skill.lanceCharge':{cls:'impact',dur:1.4,gap:600,layers:[O('sawtooth',160,{pitch:{from:160,to:900,t:1.4},dur:1.4,env:{a:.05,d:1.3},filter:lp(900,4000,1.4),gain:.5}),M(440,3,{from:.5,to:3,t:1.3},{dur:1.4,env:{a:.1,d:1.2},gain:.4}),Z('pink',{dur:1.3,env:{a:.5,d:.7},filter:hp(3000),gain:.3})]},
  'skill.burrowIn':{cls:'impact',dur:.5,gap:200,layers:[Z('brown',{dur:.45,env:{a:.02,d:.4},filter:lp(700,200,.4),gain:.9}),O('sine',70,{pitch:{from:80,to:35,t:.4},dur:.45,env:{d:.42}}),Z('white',{dur:.2,env:{d:.18},filter:bp(1500,0,0,1.2),gain:.3})]},
  'skill.burrowOut':{cls:'impact',dur:.45,gap:200,layers:[Z('brown',{dur:.4,env:{a:.01,d:.35},filter:lp(500,1400,.3),gain:.9}),O('sine',50,{pitch:{from:40,to:90,t:.2},dur:.35,env:{d:.3}}),Z('white',{delay:.05,dur:.2,env:{d:.18},filter:bp(2000,0,0,1),gain:.35})]},
  /* ---- boom (-14) */
  'skill.lanceHit':{cls:'boom',dur:1.1,gap:300,layers:[Z('white',{dur:.9,env:{a:.004,d:.85},filter:lp(2400,200,.8),gain:.8}),O('sine',60,{pitch:{from:90,to:28,t:.7},dur:.9,env:{a:.005,d:.85},gain:1}),M(220,2,{from:5,to:.1,t:.3},{dur:.5,env:{d:.45},gain:.3}),Z('brown',{delay:.03,dur:1,env:{a:.02,d:.9},filter:lp(250),gain:.9})]}
};
for(const id in V){const d=fit(V[id]);registerVoice(id,Object.assign({},d,{gain:TRIM[id]||1}));}
})();
