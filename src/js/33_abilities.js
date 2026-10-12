/* =========================================================================
   33_ABILITIES (v6 ARSENAL) — generic unit abilities, shields/barriers, damage types, tech effects, arsenal on/off per team.
   SIM-SIDE: headless, deterministic, no DOM / canvas / audio / wall clock / Math.random (G.rng only).  Plain data in the game state:
     u.ab[id] = {cd,on,t,auto,...}   per-unit ability state (cooldown s, toggle on, timer, autocast flag)
     u.energy / u.emax               energy pool of casters (regenerates in abilTick)
     u.sh / u.shMax / u.shExp / u.shT  shield points (Overcharge: timed; structures: Barrier Field), last-hit time
     u.root / u.mute                 burrowed: cannot move / cannot fire
     G.zones {type:'lance'|'scan'|'barrage'}  timed area effects, advanced by arsenalZones() before updateZones()
     G.teams[t].arsOff               true = this side plays the v5 roster only (campaign missions, the "legacy AI" in balance tests)
   The tables ABIL (static, saved by name through saveRoots()), DMGX and the unit/building/tech data are in 06_content_units.js.
   Hooks into the v5 files (one line each): addUnit (abInit), updateUnit (abilTick + order 'abil'), setOrder (abOnOrder), step (arsenalZones, arsenalStep),
   damageEnt (shieldHit), dmgVs/fire/projHit (damage type, pen, air splash), recalcBuffs (cloakBase), navigate (root), fire (mute), validTarget/acquire (min range),
   prodList (arsenalProd), reqUnit/reqBuild/orderBuild (locks), techNext (tier cap), isDetected (detectorsCover), newGame (arsenalInit).
   ========================================================================= */
const BARRIER=[0,120,260,420],OPTICS=[0,60,120],CLOAKDRAIN=[1,.75,.5],EMAXADD=[0,30,60],EREGMUL=[1,1.3,1.6],STIMDUR=[8,8,11,14],STIMHP=[12,12,12,6];
const LOCKMSG_ARS='Locked in this mission';

/* ---------------------------- arsenal switch, locks, availability ---------------------------- */
function arsenalOn(team){const T=G.teams[team];return!(T&&T.arsOff);}
function arsenalInit(opts){          // end of newGame: campaign missions get the v5 roster unless setup.arsenal; opts.arsenalOff = [bool,bool] (balance tests: the "legacy AI")
  opts=opts||{};let off=[false,false];
  if(opts.campaign){const m=opts.campaign,s=m&&typeof m.setup==='object'&&m.setup?m.setup:{};if(!s.arsenal)off=[true,true];}
  if(Array.isArray(opts.arsenalOff))off=[!!opts.arsenalOff[0],!!opts.arsenalOff[1]];
  for(let t=0;t<2;t++)G.teams[t].arsOff=off[t];
}
function arsenalLocked(team,kind,id){   // reason string or null
  if(team>1||arsenalOn(team))return null;
  const d=kind==='unit'?UDEF[id]:kind==='building'?BDEF[id]:kind==='tech'?TECH[id]:null;
  return d&&d.arsenal?LOCKMSG_ARS:null;
}
function unitFacOK(team,id){const d=UDEF[id];return!d.fac||team>1||d.fac.indexOf(G.teams[team].faction)>=0;}
function arsenalProd(b,list){            // prodList hook: add the new units of this building, drop what this team may not train
  const add=b.def&&b.def.prodAdd;if(add)list=list.concat(add);
  const team=b.team;if(team===undefined||team>1||!list.length)return list;
  let any=false;for(const id of list)if(UDEF[id].arsenal){any=true;break;}
  if(!any)return list;
  const f=G.teams[team].faction,on=arsenalOn(team);
  return list.filter(id=>{const d=UDEF[id];return!d.arsenal||(on&&(!d.fac||d.fac.indexOf(f)>=0));});
}
function techCap(T,id){const R=TECH[id];return T.arsOff&&R.base!==undefined?R.base:R.lv.length;}   // tiers available to this team
function techLv(team,key){const T=G.teams[team];return T?(T[key]|0):0;}

/* ------------------------------- damage types / armor classes ------------------------------- */
function armorClassOf(e){          // one of ACLASSES (06_content_units.js)
  if(e.kind==='building')return'struct';
  const d=e.def;if(d.tags.massive)return'massive';return e.flying?'air':d.tags.armored?'armored':'light';
}
function dtOf(u){const d=u.def;return(u.sieged&&d.siege&&d.siege.dt)||d.dt;}
function dmgMult(dt,cls){return dt&&dt!=='kin'?DMGX[dt][cls]:1;}
function tooClose(src,t){const s=src.sieged&&src.def.siege;return!!(s&&s.minr&&edgeDist(src,t)<s.minr);}   // deployed artillery cannot hit what is next to it
function siegeRangeAdd(u){return u.team<2?OPTICS[G.teams[u.team].optics|0]:0;}
function cloakHold(u){const c=u.ab&&u.ab.cloak;if(!c||!c.on)return false;u.energy=Math.max(0,u.energy-3);return true;}   // firing while cloaked costs 3 energy per shot
function cloakBase(u){const d=u.def;return d.cloak&&!(d.cloakTog&&arsenalOn(u.team));}   // v5: permanent cloak; with the arsenal the Specter cloaks by toggle (energy drain)

/* --------------------------------- detection (shared helper) --------------------------------- */
/* True if any detector of `team` covers the point: units/buildings with def.detect plus Pulse Scan zones (G.det[team] is rebuilt every tick by buildDetectors()).
   isDetected(team,e) in 20_sim.js is defined on top of it; the G1 track's isDetectedBy(team,unit) can wrap it as well. */
function detectorsCover(team,x,y){
  const L=G.det[team];if(!L)return false;
  for(let i=0;i<L.length;i++){const d=L[i],dx=x-d.x,dy=y-d.y;if(dx*dx+dy*dy<=d.r*d.r)return true;}
  return false;
}
function arsenalDetectors(){       // buildDetectors hook: Pulse Scan zones detect for their team
  for(const z of G.zones)if(z.type==='scan'&&z.team<2)G.det[z.team].push({x:z.x,y:z.y,r:z.r});
}

/* ----------------------------------------- helpers ----------------------------------------- */
const hpf=u=>u.hp/u.maxhp;
function foesNear(u,r,pred){            // visible enemy units within r (cap 40): bounded work for the autocast rules
  const L=[];forNear(u.x,u.y,r,e=>{if(L.length>=40||e.team===u.team||e.dead||e.hidden||hyp(e.x-u.x,e.y-u.y)>r)return;if(e.team===2&&u.team<2&&!e.provoked)return;if(!seen(u.team,e))return;if(!pred||pred(e))L.push(e);});
  return L;
}
function bestCluster(u,list,rad){let best=null,bn=0;for(const c of list){let n=0;for(const e of list)if(hyp(e.x-c.x,e.y-c.y)<=rad)n++;if(n>bn){bn=n;best=c;}}return{c:best,n:bn};}
function emaxOf(u){const d=u.def,T=G.teams[u.team];return d.energy?d.energy+(u.team<2?EMAXADD[T.reactor|0]:0):0;}
function eregenOf(u){const d=u.def,T=G.teams[u.team];return(d.eregen||.7)*(u.team<2?EREGMUL[T.reactor|0]:1);}
function cloakDrain(u){return 1.2*(u.team<2?CLOAKDRAIN[G.teams[u.team].cloakcell|0]:1);}
function stimDurOf(team){return STIMDUR[Math.min(3,G.teams[team].stims|0)];}

/* ------------------------------------ the ability table ------------------------------------ */
/* tgt: 'self' (instant), 'toggle' (on/off), 'point' (ground), 'unit' (enemy unit);  energy = cost (toggles: minimum to switch on);  slot = command-card slot;
   arsenal: unavailable on a team with arsOff;  gate: {tech,lv} needs research;  auto0: autocast on at spawn;  autoOK: offers the autocast switch;
   want(u): the deterministic rule used by autocast and the Master/Hard AI -> null | true/false (toggles) | {x,y,tgt} (targeted). */
const ABIL={
  stim:{name:'Overdrive',icon:'stim',tgt:'self',slot:3,cd:0,gate:{tech:'stims',lv:1},autoOK:true,
    tip:'Stim (R): +50% speed and fire rate. Tier I: 8s for 12 HP, II: 11s, III: 14s for 6 HP. Requires Combat Stims.',
    want:u=>!hasBuff(u,'stim')&&hpf(u)>.62&&u.hp>30&&foesNear(u,200,e=>!e.def.worker).length>=2},
  siege:{name:'Siege Mode',icon:'siege',tgt:'toggle',slot:5,cd:0,autoOK:true,
    tip:'Siege Mode (S): deploys for a much longer range, splash and heavy structure damage, but cannot move. Sunderers cannot hit targets closer than their minimum range. Ground targets only.',
    want:u=>{                       // deploy when the nearest ground enemy is beyond the mobile range but inside the sieged range; fold up when nothing is left to shoot at
      const sg=u.def.siege,R=sg.range+siegeRangeAdd(u),minr=sg.minr||0;let nd=1e9,inb=1e9;
      forNear(u.x,u.y,R+60,e=>{if(e.team===u.team||e.dead||e.hidden||e.flying||(e.team===2&&!e.provoked)||!seen(u.team,e))return;const d=hyp(e.x-u.x,e.y-u.y)-e.r;if(d<nd)nd=d;if(d>=minr&&d<inb)inb=d;});
      for(const b of G.buildings){if(b.dead||b.team===u.team||!seen(u.team,b))continue;const d=rectDist(u.x,u.y,b);if(d<nd)nd=d;if(d>=minr&&d<inb)inb=d;}
      if(!u.sieged)return nd>u.def.range+25&&nd<=R-15&&(u.order.t==='idle'||!u.target)?true:null;
      return inb>R+40||(nd<minr&&inb>R)?false:null;}},
  cloak:{name:'Cloak',icon:'cloak',tgt:'toggle',slot:5,cd:1.5,energy:15,arsenal:true,auto0:true,autoOK:true,
    tip:'Cloak (S): invisible outside detector range. Drains energy while active (Cloak Cells research reduces it). Attacking reveals the unit for a moment.',
    want:u=>{const near=foesNear(u,520).length>0;return near?(u.energy>=18):false;}},
  pounce:{name:'Pounce',icon:'pounce',tgt:'unit',slot:5,cd:14,range:230,arsenal:true,autoOK:true,
    tip:'Pounce (S): leap at a ground target at triple speed and hit it for 18 damage plus a short stun.',
    want:u=>{if(u.def.range>30||u.order.t==='move')return null;const t=u.target&&!u.target.dead&&u.target.kind==='unit'&&!u.target.flying?u.target:null;
      if(!t)return null;const d=edgeDist(u,t);return d>70&&d<220?{tgt:t,x:t.x,y:t.y}:null;}},
  sprint:{name:'Sprint',icon:'sprint',tgt:'self',slot:5,cd:20,dur:4,arsenal:true,autoOK:true,
    tip:'Sprint (S): +70% movement speed for 4s.',
    want:u=>hpf(u)<.55&&foesNear(u,160).length>0||(u.order.t==='move'&&hyp(u.order.x-u.x,u.order.y-u.y)>400&&foesNear(u,200).length>0)},
  overcharge:{name:'Overcharge',icon:'overcharge',tgt:'self',slot:5,cd:30,dur:8,arsenal:true,autoOK:true,
    tip:'Overcharge (S): a 90 point shield and +3 armor for 8s.',
    want:u=>hpf(u)<.8&&foesNear(u,170,e=>!e.def.worker).length>=2},
  emp:{name:'EMP Pulse',icon:'emp',tgt:'point',slot:5,cd:12,range:250,radius:105,energy:60,arsenal:true,autoOK:true,
    tip:'EMP Pulse (S): drains 70 energy and mana, destroys shields and barriers, breaks cloaks, slows mechanical units for 5s and deals 25 damage to them.',
    want:u=>{const L=foesNear(u,u.def.range+120+0,e=>e.energy>20||e.sh>0||e.def.tags.mech&&!e.def.worker||e.cloaked);if(L.length<2&&!(L.length&&(L[0].def.hero||L[0].def.heal)))return null;
      const k=bestCluster(u,L,ABIL.emp.radius*.8);return k.c&&hyp(k.c.x-u.x,k.c.y-u.y)<=ABIL.emp.range?{x:k.c.x,y:k.c.y}:null;}},
  snipe:{name:'Snipe',icon:'snipe',tgt:'unit',slot:5,cd:8,range:300,energy:50,arsenal:true,autoOK:true,
    tip:'Snipe (S): 130 damage to one biological unit, ignoring armor (70 against heroes). Costs 50 energy.',
    want:u=>{let best=null,bs=-1;for(const e of foesNear(u,ABIL.snipe.range,e=>e.kind==='unit'&&e.def.tags.bio&&!e.def.creep)){const s=(e.def.hero?.5:1)*(e.hp<=130?2:1)*(e.def.cost.c+e.def.cost.e)/(1+e.hp/200);if(s>bs){bs=s;best=e;}}
      return best&&best.hp>=45?{tgt:best,x:best.x,y:best.y}:null;}},
  burrow:{name:'Burrow',icon:'burrow',tgt:'toggle',slot:5,cd:3,arsenal:true,autoOK:true,
    tip:'Burrow (S): hides underground — cloaked, regenerates 6 HP/s, but cannot move or attack. Detectors expose it. Press again to surface.',
    want:u=>{const near=foesNear(u,230).length;const on=u.ab.burrow.on;return on?(hpf(u)>.92||near===0&&hpf(u)>.7?false:null):(hpf(u)<.4&&near>0?true:null);}},
  lance:{name:'Orbital Lance',icon:'lance',tgt:'unit',slot:5,cd:40,range:360,energy:100,arsenal:true,autoOK:true,
    tip:'Orbital Lance (S): after a 1.6s charge, a lance of light deals 260 damage (420 to structures) to the target. Costs 100 energy.',
    want:u=>{let best=null,bs=-1;for(const e of foesNear(u,ABIL.lance.range)){const s=(e.def.hero?400:0)+e.hp+(e.def.cost.c+e.def.cost.e)*.5;if(s>bs&&e.hp>=120){bs=s;best=e;}}
      if(!best)for(const b of G.buildings){if(b.dead||b.team===u.team||!b.done||!seen(u.team,b)||edgeDist(u,b)>ABIL.lance.range)continue;if(b.hp>=300){best=b;break;}}
      return best?{tgt:best,x:best.x,y:best.y}:null;}},
  scan:{name:'Pulse Scan',icon:'scan',tgt:'point',slot:5,cd:25,range:420,radius:220,dur:8,energy:50,arsenal:true,autoOK:false,
    tip:'Pulse Scan (S): lights up an area for 8s. Everything inside is visible, cloaks included. Costs 50 energy.'},
  barrage:{name:'Barrage',icon:'barrage',tgt:'point',slot:5,cd:45,range:330,radius:95,energy:50,arsenal:true,autoOK:true,
    tip:'Barrage (S): six shells rain on an area over 3.6s (55 explosive damage each, 75 to structures).',
    want:u=>{const L=foesNear(u,ABIL.barrage.range-30,e=>!e.flying);if(L.length<3)return null;const k=bestCluster(u,L,ABIL.barrage.radius*.7);return k.c&&k.n>=3?{x:k.c.x,y:k.c.y}:null;}}
};
for(const k in ABIL)ABIL[k].id=k;

/* ------------------------------------------ state ------------------------------------------ */
function abInit(u){                     // addUnit hook
  const d=u.def;u.ab={};
  for(const id of d.abil)u.ab[id]={cd:0,on:false,t:0,auto:!!ABIL[id].auto0};
  u.emax=d.energy||0;if(d.energy&&d.estart!==undefined)u.energy=d.estart;
}
function abOn(u,id){if(id==='siege')return!!u.sieged;const s=u.ab&&u.ab[id];return!!(s&&s.on);}
function abCheck(u,id){                 // '' = usable now, else the reason
  const A=ABIL[id],s=u.ab&&u.ab[id];
  if(!A||!s)return'This unit has no such ability';
  if(A.arsenal&&!arsenalOn(u.team))return LOCKMSG_ARS;
  if(A.gate&&(G.teams[u.team][TECH[A.gate.tech].key]|0)<A.gate.lv)return'Research '+TECH[A.gate.tech].name+' at the Armory';
  if(u.stunned>0)return'Stunned';
  if(id==='siege'){if(!u.def.siege)return'No siege mode';return u.siegeT>0?'Deploying':'';}
  if(s.cd>0)return'Recharging';
  const on=abOn(u,id);
  if(A.energy&&!(A.tgt==='toggle'&&on)&&u.energy<A.energy)return'Not enough energy';
  if(id==='stim'&&(hasBuff(u,'stim')||u.hp<=STIMHP[Math.min(3,G.teams[u.team].stims|0)]+2))return hasBuff(u,'stim')?'Already active':'Too wounded';
  return'';
}
function abTargetOK(u,id,t){            // target rules of the targeted abilities
  const A=ABIL[id];if(A.tgt!=='unit')return true;
  if(!t||t.dead||t.hp<=0||t.team===u.team||t.hidden)return false;
  if(id==='snipe')return t.kind==='unit'&&!!t.def.tags.bio&&t.team!==u.team;
  if(id==='pounce')return t.kind==='unit'&&!t.flying;
  return true;
}
function abUse(u,id,x,y,tgt){           // execute now (range is the caller's job: abilStep / autocast check it). Returns true when it fired
  if(abCheck(u,id))return false;
  const A=ABIL[id],s=u.ab[id],team=u.team;
  if(A.tgt==='unit'&&!abTargetOK(u,id,tgt))return false;
  switch(id){
    case'stim':if(!useStim(u))return false;if(team===0)sfx('stim');break;
    case'siege':toggleSiege(u);return true;
    case'cloak':{if(s.on){s.on=false;if(team===0)sfx('cloak',u.x,u.y,u);}else{s.on=true;u.revealT=0;if(team===0)sfx('cloak',u.x,u.y,u);}s.cd=A.cd;return true;}
    case'burrow':{if(s.on){s.on=false;u.root=0;u.mute=0;u.revealT=Math.max(u.revealT,.8);G.fx.push({x:u.x,y:u.y,t:0,max:.5,kind:'ring',r:26,col:'#caa070'});sfx('burrowOut',u.x,u.y,u);}
      else{s.on=true;u.root=1;u.mute=1;u.path=null;u.target=null;G.fx.push({x:u.x,y:u.y,t:0,max:.5,kind:'ring',r:26,col:'#caa070'});sfx('burrowIn',u.x,u.y,u);}s.cd=A.cd;return true;}
    case'sprint':addBuff(u,'haste',.7,A.dur);G.fx.push({x:u.x,y:u.y,t:0,max:.4,kind:'ring',r:20,col:'#ffe27a'});sfx('sprint',u.x,u.y,u);break;
    case'overcharge':addBuff(u,'banner',3,A.dur);u.sh=90;u.shMax=90;u.shExp=G.time+A.dur;u.shT=G.time;G.fx.push({x:u.x,y:u.y,t:0,max:.7,kind:'ring',r:34,col:'#8fd0ff'});sfx('overcharge',u.x,u.y,u);break;
    case'pounce':{s.t=1.8;s.tid=tgt.id;addBuff(u,'haste',1.4,1.8);u.order={t:'attack',target:tgt};u.path=null;u.target=tgt;sfx('pounce',u.x,u.y,u);break;}
    case'emp':{
      aoeEnemies(team,x,y,A.radius,e=>{
        if(e.kind==='unit'){
          if(e.energy>0)e.energy=Math.max(0,e.energy-70);if(e.def.hero)e.mana=Math.max(0,e.mana-70);
          e.sh=0;e.shExp=0;if(e.def.tags.mech){addBuff(e,'slow',.35,5);damageEnt(e,25,team,u);}else addBuff(e,'slow',.15,2);
          e.revealT=Math.max(e.revealT,3);if(e.ab&&e.ab.cloak&&e.ab.cloak.on){e.ab.cloak.on=false;e.ab.cloak.cd=3;}
          G.fx.push({x:e.x,y:e.y-6,t:0,max:.5,kind:'ring',r:14,col:'#9fe8ff'});}
        else{e.sh=0;e.shT=G.time;}});
      G.fx.push({x,y,t:0,max:.8,kind:'ring',r:A.radius,col:'#6ad4f2'});explode(x,y,false);sfx('emp',x,y,u);break;}
    case'snipe':{
      const dmg=tgt.def.hero?70:130;damageEnt(tgt,dmg,team,u);
      G.fx.push({x:tgt.x,y:tgt.y,t:0,max:.35,kind:'shot',x0:u.x,y0:u.y,col:'#fff3c0'});G.fx.push({x:tgt.x,y:tgt.y-10,t:0,max:1.1,kind:'text',txt:'-'+dmg,col:'#ffe27a'});
      u.revealT=Math.max(u.revealT,1.6);sfx('snipe',u.x,u.y,u);break;}
    case'lance':
      G.zones.push({type:'lance',x:tgt.x,y:tgt.y,sx:u.x,sy:u.y,sid:u.id,tid:tgt.id,r:40,t:0,max:1.6,team,fired:false});u.revealT=Math.max(u.revealT,2);sfx('lanceCharge',u.x,u.y,u);break;
    case'scan':
      G.zones.push({type:'scan',x,y,r:A.radius,t:0,max:A.dur,team});G.fx.push({x,y,t:0,max:.9,kind:'ring',r:A.radius,col:'#a8e6ff'});sfx('scan',x,y,u);break;
    case'barrage':
      G.zones.push({type:'barrage',x,y,r:A.radius,t:0,max:3.6,acc:0.55,n:0,team,sid:u.id});sfx('barrage',x,y,u);break;
    default:return false;
  }
  if(A.energy)u.energy-=A.energy;
  s.cd=A.cd;if(team===0)uiDirty();return true;
}
function abOnOrder(u,o){               // setOrder hook: a move / attack order surfaces a burrowed unit
  const s=u.ab&&u.ab.burrow;
  if(s&&s.on&&(o.t==='move'||o.t==='attackmove'||o.t==='attack'||o.t==='gather')){s.on=false;u.root=0;u.mute=0;s.cd=1;u.revealT=Math.max(u.revealT,.8);sfx('burrowOut',u.x,u.y,u);}
}
function abilCommand(units,id,x,y,tgt,queue){   // the UI / tests: one command to a selection. Returns the number of units that accepted it
  const A=ABIL[id];let n=0;if(!A)return 0;
  if(A.tgt==='self'||A.tgt==='toggle'){
    const L=units.filter(u=>u.ab&&u.ab[id]);
    if(A.tgt==='toggle'){const on=L.some(u=>abOn(u,id));for(const u of L){if(on===abOn(u,id)&&!abCheck(u,id)&&abUse(u,id))n++;}}   // all on, or all off
    else for(const u of L)if(abUse(u,id))n++;
    return n;}
  const L=units.filter(u=>u.ab&&u.ab[id]&&!abCheck(u,id)||u.ab&&u.ab[id]&&queue&&!abCheck(u,id));
  let best=null,bd=1e9;                  // targeted: the READY unit nearest to the target casts; the others keep their orders
  for(const u of units){if(!u.ab||!u.ab[id]||abCheck(u,id))continue;const d=hyp(u.x-x,u.y-y);if(d<bd){bd=d;best=u;}}
  void L;
  if(!best)return 0;
  if(A.tgt==='unit'&&!abTargetOK(best,id,tgt))return-1;
  setOrder(best,{t:'abil',id,x,y,tgt:tgt||null},queue);return 1;
}
function abilStep(u,dt){                // order 'abil': walk into range, then cast
  const o=u.order,A=ABIL[o.id];
  if(!A||!u.ab||!u.ab[o.id]){finishOrder(u);return;}
  let tx=o.x,ty=o.y,t=null;
  if(A.tgt==='unit'){t=o.tgt;if(!abTargetOK(u,o.id,t)||!seen(u.team,t)){finishOrder(u);return;}tx=t.x;ty=t.y;}
  const d=A.tgt==='unit'?edgeDist(u,t):hyp(tx-u.x,ty-u.y);
  if(d<=A.range){
    const why=abCheck(u,o.id);if(why){if(u.team===0&&!G.ais[0])msg(0,why);finishOrder(u);return;}
    u.ang=Math.atan2(ty-u.y,tx-u.x);
    if(abUse(u,o.id,tx,ty,t)&&o.id==='pounce')return;      // pounce replaced the order with an attack
    finishOrder(u);return;}
  navigate(u,tx,ty,dt,Math.max(6,A.range-16));
}

/* ---------------------------------- per-unit tick (updateUnit hook) ---------------------------------- */
function abilTick(u,dt){
  const d=u.def,ab=u.ab;if(!ab)return;
  for(const id in ab){const s=ab[id];if(s.cd>0)s.cd-=dt;}
  if(d.energy){u.emax=emaxOf(u);if(u.energy<u.emax)u.energy=Math.min(u.emax,u.energy+eregenOf(u)*dt);else if(u.energy>u.emax)u.energy=u.emax;}
  if(u.shExp&&G.time>=u.shExp){u.sh=0;u.shExp=0;}
  if(d.regen&&u.hp<u.maxhp&&G.time-u.lastHit>5)u.hp=Math.min(u.maxhp,u.hp+d.regen*dt);
  const c=ab.cloak;
  if(c&&c.on){
    if(!arsenalOn(u.team)){c.on=false;}
    else{u.energy-=cloakDrain(u)*dt;if(u.energy<=0){u.energy=0;c.on=false;c.cd=3;sfx('cloak',u.x,u.y,u);}else addBuff(u,'cloak',1,.25);}}
  const b=ab.burrow;
  if(b&&b.on){addBuff(u,'cloak',1,.25);u.root=1;u.mute=1;if(u.hp<u.maxhp)u.hp=Math.min(u.maxhp,u.hp+6*dt);}
  const p=ab.pounce;
  if(p&&p.t>0){
    p.t-=dt;const t=G.units.find(z=>z.id===p.tid);   // (rare: once per pounce)
    if(!t||t.dead){p.t=0;}
    else if(edgeDist(u,t)<=u.r+10){p.t=0;damageEnt(t,18,u.team,u);addBuff(t,'stun',1,.5);G.fx.push({x:t.x,y:t.y,t:0,max:.35,kind:'ring',r:20,col:'#ffb36a'});sfx('pounceHit',t.x,t.y,t);}}
  // autocast: one rule check per ability every 6 ticks (staggered by id), never while stunned / hidden / in a manual targeted order
  if(u.hidden||u.stunned>0||(G.tick+u.id)%6!==0)return;
  const ot=u.order.t;if(ot!=='idle'&&ot!=='attackmove'&&ot!=='hold'&&ot!=='attack'&&ot!=='move')return;
  for(const id in ab){
    const s=ab[id],A=ABIL[id];if(!s.auto||!A.want||(s.cd>0&&A.tgt!=='toggle'))continue;
    if(A.arsenal&&!arsenalOn(u.team))continue;
    const w=A.want(u);if(w===null||w===undefined||w===false&&A.tgt!=='toggle')continue;
    if(A.tgt==='toggle'){const on=abOn(u,id);if(w===!on&&!abCheck(u,id)){abUse(u,id);}continue;}
    if(A.tgt==='self'){if(w===true)abUse(u,id);continue;}
    if(w&&typeof w==='object'){
      if(A.tgt==='unit'){if(edgeDist(u,w.tgt)<=A.range)abUse(u,id,w.x,w.y,w.tgt);}
      else if(hyp(w.x-u.x,w.y-u.y)<=A.range)abUse(u,id,w.x,w.y);}
  }
}

/* ------------------------------------- shields + barrier + zones ------------------------------------- */
function shieldHit(e,amt){              // damageEnt hook: shield points absorb first
  const a=Math.min(e.sh,amt);e.sh-=a;e.shT=G.time;if(e.sh<=0.0001){e.sh=0;if(e.shExp)e.shExp=0;}
  return amt-a;
}
function arsenalStep(dt){               // step() hook: structure barrier upkeep (every 3rd tick)
  if(G.tick%3!==0)return;const k=dt*3;
  for(const b of G.buildings){
    if(b.dead||!b.done||b.team>1)continue;
    const lv=G.teams[b.team].barrier|0;if(lv<=0&&!b.shMax)continue;
    const cap=lv>0?BARRIER[lv]*(b.type==='hub'?2:1):0;
    if((b.shMax||0)!==cap){b.sh=Math.max(0,(b.sh||0)+cap-(b.shMax||0));b.shMax=cap;}
    if(b.sh<cap&&G.time-(b.shT||-99)>5)b.sh=Math.min(cap,b.sh+14*k);
  }
}
function findEnt(id){for(const u of G.units)if(u.id===id)return u;for(const b of G.buildings)if(b.id===id)return b;return null;}
function arsenalZones(dt){              // step() hook, BEFORE updateZones() (which advances z.t and drops expired zones)
  for(const z of G.zones){
    if(z.type==='lance'){
      const t=findEnt(z.tid);if(t&&!t.dead){z.x=t.x;z.y=t.y;}const s=findEnt(z.sid);if(s&&!s.dead){z.sx=s.x;z.sy=s.y;}
      if(!z.fired&&z.t+dt>=z.max){z.fired=true;
        if(t&&!t.dead){damageEnt(t,t.kind==='building'?420:260,z.team,s||null);G.fx.push({x:t.x,y:t.y,t:0,max:.9,kind:'beam',r:46});explode(t.x,t.y,true);G.shake=Math.max(G.shake,6);sfx('lanceHit',t.x,t.y,{team:z.team});}}}
    else if(z.type==='scan'){
      forNear(z.x,z.y,z.r+30,e=>{if(e.team===z.team||e.dead||e.hidden||hyp(e.x-z.x,e.y-z.y)>z.r)return;e.revealT=Math.max(e.revealT,.4);});
      for(const b of G.buildings)if(!b.dead&&b.team!==z.team&&rectDist(z.x,z.y,b)<=z.r)b.revealT=Math.max(b.revealT,.4);}
    else if(z.type==='barrage'){
      z.acc+=dt;
      if(z.acc>=0.6&&z.n<6){z.acc-=0.6;z.n++;
        const a=G.rng()*TAU,r=Math.sqrt(G.rng())*z.r,sx=z.x+Math.cos(a)*r,sy=z.y+Math.sin(a)*r;
        aoeEnemies(z.team,sx,sy,42,e=>{if(e.flying)return;const dmg=dmgVs(55,{struct:20},e,true,'exp',0);damageEnt(e,dmg,z.team,null);},true);
        G.fx.push({x:sx,y:sy,t:0,max:.35,kind:'ring',r:42,col:'#ffb15a'});explode(sx,sy,false);sfx('boom',sx,sy,{team:z.team});G.decalDirty.push({x:sx,y:sy,r:20,k:'scorch'});}}
  }
}
