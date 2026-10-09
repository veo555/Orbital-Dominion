/* =========================================================================
   42_AI_AGENT — the T2 computer opponent (SIM-SIDE: headless, deterministic, no Math.random, no DOM, no wall clock).
   A hierarchical, parameterised policy whose parameter vector theta is tuned by a self-play league (tools/league/).
     perception   aiObserve      fog-honest: only seen(team,e) entities enter the AI; memory with timestamps; reaction delay
                  aiBelief       Bayesian structure-occupancy grid + enemy-army location density + pheromone fields (41_ai_lib.js)
     strategy     aiStrategy     value function V(s)=P(win|observation), posture choice (hold/attack/defend/harass) with hysteresis
     macro        aiMacro        priority list with money reservation: supply, workers, buildings, era, hero, research, units, trade
     workers      aiWorkers      Ideal Free Distribution over bases/siphons, repair via a demand pheromone
     tactics      aiArmy         Lanchester/ODE fight prediction for engage/retreat, focus fire, kiting, concave arc, boids moves
     limits       aiAct          token-bucket APM cap; every command to a selection costs one action
   State lives in G.ais[team] as plain data (+ typed arrays), so 46_save.js snapshots it; transient object lists live in AI_RT.
   The legacy v3 AI (40_ai.js: makeAIV3 / aiThinkV3) still drives campaign missions and is the league's anchor opponent.
   ========================================================================= */
const THETA_SPEC=[ // name, lo, hi  (theta is searched in the unit cube; decode maps u in [0,1] to lo + (hi-lo) u)
  ['wBase',12,22],['wMax',24,48],['wEther',2,6],['expandAt',100,600],['expandRate',0,1],
  ['era2',140,480],['era3',360,900],['gar',0.6,2.2],
  ['cLight',0,1],['cMelee',0,1],['cAnti',0,1],['cHeavy',0,1],['cArt',0,1],['cAir',0,1],['cSup',0,1],
  ['counter',0,1.5],['aggr',0.45,0.85],['retreat',0.12,0.45],['firstAtk',60,480],['atkSup',8,40],
  ['harass',0,1],['scout',0,1],['turret',0,1],['creep',0,1],['vW',0,2],['bank',0,1],['trade',0,1],['tech',0,1]];
const THETA_N=THETA_SPEC.length;
const AI_CLS={rifleman:'light',specter:'light',raptor:'melee',reaver:'melee',rocketeer:'anti',juggernaut:'heavy',bulwark:'heavy',titan:'heavy',howitzer:'art',skiff:'air',mender:'sup'};
const AI_CLASSES=['light','melee','anti','heavy','art','air','sup'];
const AI_CKEY={light:'cLight',melee:'cMelee',anti:'cAnti',heavy:'cHeavy',art:'cArt',air:'cAir',sup:'cSup'};
const AI_RT=[{},{}];                       // per-team transient caches (object lists), rebuilt at the start of every think
const AI_INV=new Uint8Array(BN),AI_TMP=new Float64Array(BN),AI_TMP2=new Float64Array(BN);
function reflect01(z){z=((z%2)+2)%2;return z>1?2-z:z;}
function thetaDecode(u){const o={};for(let i=0;i<THETA_N;i++){const[n,lo,hi]=THETA_SPEC[i];o[n]=lo+(hi-lo)*reflect01(u[i]);}return o;}
function aiTierCfg(name){const P=(typeof AI_PARAMS!=='undefined'&&AI_PARAMS.tiers)||{};return P[name]||P.normal||{think:0.45,apm:60,delay:0.3,micro:0,focus:1,kite:0,macro:0.85,useV:1};}
function aiThetaFor(tier,style,override){
  const base=override||tier.theta||(typeof AI_PARAMS!=='undefined'&&AI_PARAMS.theta0)||THETA_SPEC.map(()=>0.5),u=base.slice();
  const d=(typeof AI_PARAMS!=='undefined'&&AI_PARAMS.styles&&AI_PARAMS.styles[style])||{};
  for(let i=0;i<THETA_N;i++){const n=THETA_SPEC[i][0];if(d[n])u[i]=reflect01(u[i]+d[n]);else u[i]=reflect01(u[i]);}
  return u;
}
function aiVal(type){const d=UDEF[type]||BDEF[type];if(!d)return 50;if(d.creep)return(d.bounty||10)*3;return(d.cost?d.cost.c+d.cost.e:50)+(d.hero?100:0);}

/* ------------------------------------------------------------------ construction */
function makeAI(team,P,kind){kind=kind||(G&&G.aiKind)||'t2';return kind==='v3'?makeAIV3(team,P):makeAIT2(team,P);}
function aiThink(ai){if(ai.kind==='t2')aiThinkT2(ai);else aiThinkV3(ai);}
function makeAIT2(team,P,opt){
  opt=opt||P.t2||{};
  const T=G.teams[team],tierName=opt.tier||P.tier||'normal',tier=Object.assign({},aiTierCfg(tierName),opt.cfg||{});
  T.mult=opt.handicap||P.handicap||1;                                   // income handicap: 1.0 on every tier (the v3 'hard' +25 % cheat is gone)
  const style=FACTIONS[T.faction].style,u=aiThetaFor(tier,style,opt.theta);
  const ai={kind:'t2',team,enemy:1-team,tier:tierName,cfg:tier,style,thu:u,th:thetaDecode(u),
    P:{iv:tier.think,hero:tier.hero!==false,air:tier.air!==false},next:1+0.1*team,k:0,rs:(G.seed*2654435761+team*97+7)>>>0,
    apm:{rate:tier.apm/60,burst:Math.max(3,tier.apm/60*5),tok:3,t:0,n:0,denied:0},delay:tier.delay,
    mem:{u:{},b:{},camps:{},armySeenT:-99,heroLvl:0,heroT:-99,eraSeen:1},
    bel:{s:new Float32Array(BN),a:new Float64Array(BN),t:0},ph:{vis:new Float32Array(BN),dem:new Float32Array(BN),def:new Float32Array(BN)},
    mil:'hold',milT:0,tgt:null,atkN:0,atkCool:0,wave:0,attacking:false,V:0.5,pG:0.5,pL:-1,
    har:{ids:[],tgt:null,t:-99},scout:{id:0,tgt:-1,t:-99,last:-99},creep:null,lastCreep:0,
    stage:null,stageHub:0,res:{why:'',since:0},st:{thinks:0,engage:0,retreat:0,focus:0,kite:0,expand:0,cmds:0}};
  if(opt.noV)ai.cfg.useV=0;
  aiBeliefInit(ai);
  return ai;
}
function aiBeliefInit(ai){
  const s=ai.bel.s,a=ai.bel.a,em=G.sites[ai.enemy];
  for(let i=0;i<BN;i++)s[i]=0.003;
  const ci=bcell(em.cx*TILE,em.cy*TILE);s[ci]=0.99;
  for(let i=0;i<BN;i++)a[i]=0;a[ci]=1;                                   // the opponent's army starts at its (publicly known, mirrored) start site
  ai.bel.sites=[];for(const st of G.sites){if(st.main)continue;const x=st.cx*TILE,y=st.cy*TILE;
    ai.bel.sites.push({i:bcell(x,y),x,y,tx:st.tx,ty:st.ty,d:hyp(x-em.cx*TILE,y-em.cy*TILE),dOwn:hyp(x-G.sites[ai.team].cx*TILE,y-G.sites[ai.team].cy*TILE)});}
}

/* ------------------------------------------------------------------ actions (APM cap) */
function aiAct(ai){const by=ai.st.by||(ai.st.by={});if(ai.apm.tok<1){ai.apm.denied++;by['x'+ai.tag]=(by['x'+ai.tag]||0)+1;return false;}ai.apm.tok-=1;ai.apm.n++;ai.st.cmds++;by[ai.tag]=(by[ai.tag]||0)+1;return true;}
function aiSame(u,o){const p=u.order;if(p.t!==o.t)return false;
  if(o.t==='attack')return p.target===o.target;
  if(o.t==='move'||o.t==='attackmove')return hyp(p.x-o.x,p.y-o.y)<48;
  if(o.t==='gather')return p.res===o.res;return false;}
function aiOrder(ai,units,o){ // one command to one selection (a human: select + right-click)
  const L=[];for(const u of units)if(!u.dead&&!u.garr&&!u.sieged&&u.siegeT<=0&&!aiSame(u,o))L.push(u);
  if(!L.length)return true;if(!aiAct(ai))return false;
  for(const u of L)setOrder(u,Object.assign({},o));return true;
}

/* ------------------------------------------------------------------ perception (fog honest) */
function aiRectInView(v,r){for(const x of[r.tx,r.tx+r.w-1])for(const y of[r.ty,r.ty+r.h-1])if(v[y*MW+x]!==2)return false;return true;}
function aiObserve(ai,R){
  const team=ai.team,M=ai.mem,now=G.time,v=G.vis[team];
  R.vis=[];R.en=[];R.enB=[];R.creeps=[];
  for(const u of G.units){
    if(u.dead||u.team===team||u.hidden)continue;
    if(!seen(team,u))continue;                                           // THE gate: nothing about an unseen enemy enters the AI
    if(u.team===2){R.creeps.push(u);continue;}
    let r=M.u[u.id];
    if(!r)r=M.u[u.id]={type:u.type,x:u.x,y:u.y,hp:u.hp,mhp:u.maxhp,t:now,first:now};
    else{if(now-r.t>3)r.first=now;r.type=u.type;r.x=u.x;r.y=u.y;r.hp=u.hp;r.mhp=u.maxhp;r.t=now;}
    R.vis.push(u);if(now-r.first>=ai.delay-1e-9)R.en.push(u);           // reaction delay: a new sighting is acted on only after `delay` s
    if(!u.def.worker&&!u.def.trade)M.armySeenT=now;
    if(u.def.hero){M.heroT=now;M.heroLvl=Math.max(1,Math.round(((u.maxhp/u.def.hp)-1)/0.14)+1);}
    if(u.def.era>M.eraSeen)M.eraSeen=u.def.era;
  }
  for(const id in M.u){const r=M.u[id];if(r.t===now)continue;const age=now-r.t;
    if(age>80){delete M.u[id];continue;}
    // vanished in plain view: it was seen moments ago and every point it could have reached since is visible -> it died
    // (what a player sees as an explosion). Units can also vanish into a geyser or a garrison; those are workers and are re-seen.
    if(age<2){const d=UDEF[r.type],rad=(d?d.speed:90)*age+24;let all=v[tileOf(r.x,r.y)]===2;
      for(let k=0;k<6&&all;k++){const a=k*1.0472;if(v[tileOf(clamp(r.x+Math.cos(a)*rad,0,WW-1),clamp(r.y+Math.sin(a)*rad,0,WH-1))]!==2)all=false;}
      if(all&&!(d&&d.cloak)){delete M.u[id];M.killsSeen=(M.killsSeen||0)+1;}}}
  for(const b of G.buildings){if(b.dead||b.team===team||b.team>1)continue;if(!seen(team,b))continue;
    let r=M.b[b.id];if(!r)r=M.b[b.id]={type:b.type,x:b.x,y:b.y,tx:b.tx,ty:b.ty,w:b.w,h:b.h,hp:b.hp,mhp:b.maxhp,done:b.done,t:now};
    else{r.hp=b.hp;r.mhp=b.maxhp;r.done=b.done;r.t=now;}
    R.enB.push(b);if(b.def.era>M.eraSeen)M.eraSeen=b.def.era;}
  for(const id in M.b){const r=M.b[id];if(r.t!==now&&aiRectInView(v,r))delete M.b[id];}   // the spot is in plain view and empty: destroyed
  for(const c of G.camps){                                               // creep camps: positions are map knowledge; who is alive is not
    if(v[tileOf(c.x,c.y)]!==2)continue;
    let alive=false;for(const z of R.creeps)if(z.camp===c.id){alive=true;break;}
    M.camps[c.id]={alive,t:now};}
}
function aiEnemyRecs(ai,maxAge,combatOnly){const out=[],now=G.time;for(const id in ai.mem.u){const r=ai.mem.u[id];if(now-r.t>maxAge)continue;const d=UDEF[r.type];if(!d)continue;if(combatOnly&&(d.worker||d.trade||d.noWeapon&&!d.heal))continue;out.push(r);}return out;}

/* ------------------------------------------------------------------ own state */
function aiOwn(ai,R){
  const team=ai.team;R.B=[];R.U=[];R.workers=[];R.army=[];R.hubs=[];R.prod=[];R.hero=null;
  for(const b of G.buildings)if(!b.dead&&b.team===team){R.B.push(b);if(b.type==='hub'&&b.done)R.hubs.push(b);if(b.done&&b.type!=='hub'&&b.type!=='exchange'&&prodList(b).length)R.prod.push(b);}
  for(const u of G.units)if(!u.dead&&u.team===team){R.U.push(u);if(u.def.worker)R.workers.push(u);else if(!u.def.trade){R.army.push(u);if(u.def.hero)R.hero=u;}}
}
function aiStacksOf(list,team,hpOf){
  const by={},T=G.teams[team],H=T.hero;for(const u of list){const k=u.type;const e=by[k]||(by[k]={n:0,hp:0});e.n++;e.hp+=hpOf?hpOf(u):u.hp;}
  const out=[];for(const k in by){const e=by[k];const s=cmbStackOf(k,e.n,{wl:T.wl,al:T.al,hp:e.hp/e.n,lvl:H?H.level:1,meridian:T.faction==='meridian'});s.cost=aiVal(k);out.push(s);}
  return out;
}
function aiArmyVal(list){let s=0;for(const u of list){const d=UDEF[u.type];if(d&&!d.worker&&!d.trade)s+=aiVal(u.type)*Math.max(0.15,u.hp/(u.mhp||u.maxhp||d.hp));}return s;}

/* ------------------------------------------------------------------ belief + pheromones (2-4 Hz) */
function aiBelief(ai,R){
  const team=ai.team,v=G.vis[team],s=ai.bel.s,a=ai.bel.a,now=G.time,M=ai.mem;
  const dt=Math.max(0.1,now-(ai.bel.t||0));ai.bel.t=now;
  for(let i=0;i<BN;i++){const tx=Math.min(MW-1,(i%BW)*BC+(BC>>1)),ty=Math.min(MH-1,((i/BW)|0)*BC+(BC>>1));AI_INV[i]=v[ty*MW+tx]===2?1:0;}
  // structures: Bayes with an imperfect sensor where we look, hazard prior (the enemy expands over time) where we do not
  const det=AI_TMP2;det.fill(0);for(const id in M.b){const r=M.b[id];det[bcell(r.x,r.y)]=1;}
  const prior=AI_TMP;prior.fill(0.003);
  for(const st of ai.bel.sites){const tExp=170+st.d/9;prior[st.i]=Math.max(prior[st.i],0.7*sigm((now-tExp)/70));}
  for(let i=0;i<BN;i++){
    if(det[i])s[i]=Math.max(s[i],0.99);
    else if(AI_INV[i])s[i]=bayesOcc(s[i],false,0.92,0.002);
    else s[i]=hazard(s[i],prior[i],1-Math.pow(0.97,dt));}
  // enemy army location density: diffusion (movement model), pull toward its structures, negative / positive information
  const k=Math.min(0.24,0.12*dt);diffuse(a,BW,BH,k,AI_TMP);
  let ss=0;for(let i=0;i<BN;i++)ss+=s[i];if(ss>0)for(let i=0;i<BN;i++)a[i]=0.97*a[i]+0.03*s[i]/ss;
  let seenV=0;const obs=AI_TMP2;obs.fill(0);
  for(const u of R.vis){if(u.def.worker||u.def.trade)continue;const w=aiVal(u.type);obs[bcell(u.x,u.y)]+=w;seenV+=w;}
  if(seenV>0){for(let i=0;i<BN;i++)a[i]=0.4*a[i]+0.6*obs[i]/seenV;}
  else densityObserve(a,AI_INV,0.85);
  // pheromones: coverage (stigmergic scouting) evaporates, so cells nobody looked at for a while become attractive again
  const pv=ai.ph.vis;phStep(pv,BW,BH,1-Math.pow(0.985,dt),0,AI_TMP);for(let i=0;i<BN;i++)if(AI_INV[i])pv[i]=1;
  // defence demand: perceived enemies near our structures deposit, evaporation + diffusion aggregate repeated alarms
  const pd=ai.ph.def;phStep(pd,BW,BH,1-Math.pow(0.6,dt),0.08,AI_TMP);
  for(const e of R.en){if(e.def.worker||e.def.trade)continue;let near=false;for(const b of R.B)if(hyp(e.x-b.x,e.y-b.y)<620){near=true;break;}
    if(near)phDeposit(pd,bcell(e.x,e.y),aiVal(e.type)/100,50);}
  // repair / build demand: damaged own structures (no enemy around) and unfinished ones deposit
  const pm=ai.ph.dem;phStep(pm,BW,BH,1-Math.pow(0.7,dt),0.05,AI_TMP);
  for(const b of R.B){if(b.done&&b.hp<b.maxhp*0.8)phDeposit(pm,bcell(b.x,b.y),(b.maxhp-b.hp)/150,40);}
}

/* ------------------------------------------------------------------ features + value function */
const AI_FEATS=['logArmyRatio','logWorkerRatio','baseDiff','eraDiff','time','armyDiffK','supply','logBank','heroDiff','killDiff','logStructRatio'];
function aiFeatures(ai,R){
  const team=ai.team,T=G.teams[team],now=G.time,M=ai.mem;
  let Va=0,Wa=0,Sa=0;for(const u of G.units)if(!u.dead&&u.team===team){if(u.def.worker)Wa++;else if(!u.def.trade)Va+=aiVal(u.type)*Math.max(0.15,u.hp/u.maxhp);}
  let hubsA=0;for(const b of G.buildings)if(!b.dead&&b.team===team){Sa+=aiVal(b.type);if(b.type==='hub')hubsA++;}
  const recs=aiEnemyRecs(ai,90,false);let Ve=0,We=0;for(const r of recs){const d=UDEF[r.type];if(d.worker)We++;else if(!d.trade)Ve+=aiVal(r.type)*Math.max(0.15,r.hp/r.mhp);}
  let Se=0,hubsE=0;for(const id in M.b){const r=M.b[id];Se+=aiVal(r.type);if(r.type==='hub')hubsE++;}
  hubsE=Math.max(1,hubsE);We=Math.max(We,6);
  const heroA=T.hero.alive?T.hero.level:0,heroE=now-M.heroT<120?M.heroLvl:0;
  return[Math.log((Va+100)/(Ve+100)),Math.log((Wa+2)/(We+2)),hubsA-hubsE,T.era-M.eraSeen,now/600,(Va-Ve)/1000,T.used/120,Math.log((T.c+T.e+100)/100),heroA-heroE,(T.kills-(T.creeps||0)-T.lost)/20,Math.log((Sa+400)/(Se+400))];
}
function aiValue(ai,R){if(!ai.cfg.useV)return 0.5;const m=typeof AI_PARAMS!=='undefined'?AI_PARAMS.vf:null;return m?vfEval(m,aiFeatures(ai,R)):0.5;}

/* ------------------------------------------------------------------ strategy layer (postures) */
function aiThreat(ai,R){ // perceived enemy combat units near our structures
  const L=[];for(const e of R.en){if(e.def.worker||e.def.trade)continue;for(const b of R.B)if(hyp(e.x-b.x,e.y-b.y)<(b.type==='hub'?650:480)){L.push(e);break;}}
  return L;
}
function aiAttackTarget(ai,R){ // best known enemy structure: value / (1 + known defence), minus distance
  const M=ai.mem,st=ai.stage||R.hubs[0]||R.B[0];let best=null,bs=-1e9;
  for(const id in M.b){const r=M.b[id];let thr=0;
    for(const id2 in M.b){const q=M.b[id2];if((q.type==='turret'||q.type==='hub')&&q.done&&hyp(q.x-r.x,q.y-r.y)<260)thr+=q.type==='turret'?1:0.5;}
    const val=r.type==='hub'?3:(prodList({type:r.type,team:ai.enemy,def:BDEF[r.type]}).length?1.6:r.type==='turret'?0.6:1);
    const s=val/(1+thr)-hyp(r.x-st.x,r.y-st.y)/2500;if(s>bs){bs=s;best={x:r.x,y:r.y,id:+id};}}
  if(best)return best;
  // nothing remembered: go where the belief says structures most likely are
  const s=ai.bel.s;let bi=-1,bp=0.2;for(let i=0;i<BN;i++)if(s[i]>bp){bp=s[i];bi=i;}
  if(bi>=0)return{x:bcx(bi),y:bcy(bi),id:0};
  const em=G.sites[ai.enemy];return{x:em.cx*TILE,y:em.cy*TILE,id:0};
}
function aiStrategy(ai,R){
  const th=ai.th,now=G.time,T=G.teams[ai.team];
  ai.V=aiValue(ai,R);
  const army=R.army.filter(u=>!ai.har.ids.includes(u.id)&&u.id!==ai.scout.id);
  const own=aiStacksOf(army,ai.team);
  const recs=aiEnemyRecs(ai,90,true),known=aiArmyVal(recs);
  const myVal=aiArmyVal(army.map(u=>({type:u.type,hp:u.hp,mhp:u.maxhp})));
  const en=aiStacksOf(recs,ai.team);
  // phantom army: what we have not seen is not nothing. The longer the opponent's army has been out of sight, the closer the
  // estimate moves to a symmetric prior (the opponent spends like we do), expressed as Riflemen-equivalents.
  const stale=Math.min(1,Math.max(0,now-ai.mem.armySeenT)/90),prior=0.8*myVal*(0.5+0.5*stale);
  if(prior>known+50){const s=cmbStackOf('rifleman',(prior-known)/50,{wl:T.wl,al:T.al});s.cost=50;en.push(s);}
  ai.pG=own.length?cmbPredict(own,en).p:0;
  const thr=aiThreat(ai,R),thrV=aiArmyVal(thr.map(u=>({type:u.type,hp:u.hp,mhp:u.maxhp})));
  ai.thrV=thrV;
  // economic posture: 'mass' (army first, no greed) while a stronger enemy army has been seen recently or we are under attack
  ai.eco=(thrV>150||(ai.pG<0.45&&known>0.6*myVal&&now-ai.mem.armySeenT<75))?'mass':'grow';
  const sup=army.reduce((n,u)=>n+u.def.supply,0);
  const prev=ai.mil;
  // 1. defence has priority when something real is at our structures
  if(thrV>=120||thr.some(e=>!e.def.worker)&&thrV>=60&&R.army.length<3){
    if(ai.mil!=='defend'){ai.mil='defend';ai.milT=now;}
    const c=centroid(thr);ai.tgt={x:c.x,y:c.y,id:0};}
  else if(ai.mil==='defend'&&now-ai.milT>4){ai.mil='hold';ai.milT=now;}
  // 2. attack decision: predicted win probability against the estimated army, V(s) shifts the threshold (adaptive aggression)
  if(ai.mil==='hold'&&now>th.firstAtk&&now>ai.atkCool){
    const U=(ai.pG-th.aggr)+0.25*th.vW*(ai.V-0.5);
    if((U>0&&sup>=th.atkSup)||T.used>=MAXSUP-8&&sup>=30){ai.mil='attack';ai.milT=now;ai.tgt=aiAttackTarget(ai,R);ai.atkN=army.length;ai.wave++;ai.attacking=true;}}
  else if(ai.mil==='attack'){
    const alive=army.length;
    if(alive<Math.max(3,ai.atkN*0.35)||ai.pG<th.retreat*0.8){ai.mil='retreat';ai.milT=now;ai.atkCool=now+20;ai.st.retreat++;}
    else if(now-ai.milT>3){const t=aiAttackTarget(ai,R);if(!ai.tgt||hyp(t.x-ai.tgt.x,t.y-ai.tgt.y)>200&&(!ai.mem.b[ai.tgt.id]))ai.tgt=t;}}
  else if(ai.mil==='retreat'&&now-ai.milT>8){ai.mil='hold';ai.milT=now;}
  if(ai.mil!=='attack')ai.attacking=false;
  if(prev!==ai.mil)ai.lastOrderT=-99;
  // 3. harassment squad (fast units) against the least defended known mining base
  aiHarassPlan(ai,R);
}
function aiHarassPlan(ai,R){
  const th=ai.th,now=G.time,H=ai.har;
  H.ids=H.ids.filter(id=>R.army.some(u=>u.id===id));
  if(H.ids.length&&(now-H.t>75)){H.ids=[];H.tgt=null;}
  if(H.ids.length||th.harass<0.3||now<200||ai.mil==='defend'||now-H.t<60+120*(1-th.harass))return;
  const fast=R.army.filter(u=>(u.type==='raptor'||u.type==='reaver'||u.type==='skiff')&&u.hp>u.maxhp*0.8);
  if(fast.length<4)return;
  let best=null,bs=-1e9;for(const id in ai.mem.b){const r=ai.mem.b[id];if(r.type!=='hub')continue;let thr=0;for(const id2 in ai.mem.b){const q=ai.mem.b[id2];if(q.type==='turret'&&hyp(q.x-r.x,q.y-r.y)<300)thr++;}
    const s=-thr*2-hyp(r.x-G.sites[ai.enemy].cx*TILE,r.y-G.sites[ai.enemy].cy*TILE)/-1500;if(s>bs){bs=s;best=r;}}
  if(!best){const em=G.sites[ai.enemy];best={x:em.cx*TILE,y:em.cy*TILE};}
  const n=Math.min(fast.length,Math.round(4+4*th.harass));H.ids=fast.slice(0,n).map(u=>u.id);H.tgt={x:best.x,y:best.y};H.t=now;
}

/* ------------------------------------------------------------------ macro */
function aiFindSpot2(ai,type,R){
  const d=BDEF[type],hubs=R.hubs.length?R.hubs:[R.B[0]],em=G.sites[ai.enemy],ex=em.cx*TILE,ey=em.cy*TILE;
  let anchor=hubs[0];
  if(type==='turret'){let bd=1e18;for(const h of hubs){const dd=hyp(h.x-ex,h.y-ey);if(dd<bd){bd=dd;anchor=h;}}}
  else if(hubs.length>1&&(type==='generator'||type==='garrison'))anchor=hubs[ai.k%hubs.length];
  const reserved=pendingRects(R.workers);
  const anchors=[anchor];for(const h of hubs)if(h!==anchor)anchors.push(h);   // a full plateau: try the other bases, then any structure
  for(const b of R.B)if(b.type!=='hub'&&anchors.length<6&&b.done&&(b.type==='garrison'||b.type==='generator'))anchors.push(b);
  for(const an of anchors){
    const ax=an.x/TILE|0,ay=an.y/TILE|0,l=hyp(ex-an.x,ey-an.y)||1,ux=(ex-an.x)/l,uy=(ey-an.y)/l,RR=an===anchor?13:15;
    let best=null,bs=1e9;
    for(let dy=-RR;dy<=RR;dy++)for(let dx=-RR;dx<=RR;dx++){
      const r=hyp(dx,dy);if(r>RR+0.5)continue;
      let s=r+airand(ai)*2.5;if(r<5&&an.type==='hub')s+=8;
      if(type==='turret'){s-=(dx*ux+dy*uy)*1.1;if(r<4||r>10)s+=6;}
      else s+=(dx*ux+dy*uy)*0.35;                                      // keep the soft buildings on the far side of the base
      if(s>=bs)continue;
      const tx=ax+dx-(d.w>>1),ty=ay+dy-(d.h>>1),cx=(tx+d.w/2)*TILE,cy=(ty+d.h/2)*TILE;
      if(!spotOK(ai.team,type,tx,ty,d,reserved,cx,cy))continue;
      bs=s;best={tx,ty};}
    if(best)return best;}
  return null;
}
function aiFindExpansion2(ai,R){
  const own=G.sites[ai.team],em=G.sites[ai.enemy],reserved=pendingRects(R.workers);let best=null,bd=1e18;
  for(const st of ai.bel.sites){
    if(R.B.some(b=>b.type==='hub'&&hyp(b.x-st.x,b.y-st.y)<12*TILE))continue;
    if(ai.bel.s[st.i]>0.3)continue;                                     // believed (or known) to be taken
    let enemyNear=false;for(const id in ai.mem.b){const r=ai.mem.b[id];if(hyp(r.x-st.x,r.y-st.y)<14*TILE){enemyNear=true;break;}}if(enemyNear)continue;
    if(st.d<st.dOwn*0.9)continue;                                       // closer to the opponent's start than to ours
    if(reserved.some(q=>Math.abs(q.tx-st.tx)<6&&Math.abs(q.ty-st.ty)<6))continue;
    if(!canPlace(ai.team,'hub',st.tx,st.ty,true))continue;
    if(!G.res.some(r=>!r.dead&&r.type==='crystal'&&hyp(r.x-st.x,r.y-st.y)<9*TILE))continue;
    if(st.dOwn<bd){bd=st.dOwn;best={tx:st.tx,ty:st.ty};}}
  return best;
}
function aiFreeGeyser(ai,R){let best=null,bd=1e9;
  for(const r of G.res){if(r.dead||r.type!=='geyser'||r.siphon)continue;
    if(R.workers.some(w=>w.order.t==='build'&&w.order.type==='siphon'&&w.order.tx===r.tx&&w.order.ty===r.ty))continue;
    for(const h of R.hubs){const d=hyp(h.x-r.x,h.y-r.y);if(d<bd&&d<520){bd=d;best=r;}}}
  return best;}
function aiBuild2(ai,type,R){
  const d=BDEF[type];let spot=null;
  if(type==='siphon'){const g=aiFreeGeyser(ai,R);if(g)spot={tx:g.tx,ty:g.ty};}
  else if(type==='hub')spot=aiFindExpansion2(ai,R);
  else spot=aiFindSpot2(ai,type,R);
  if(!spot)return false;
  const cx=(spot.tx+d.w/2)*TILE,cy=(spot.ty+d.h/2)*TILE;let w=null,bd=1e9;
  for(const u of R.workers){if(u.order.t==='build'||u.order.t==='repair'||u.garr||u.id===ai.scout.id)continue;
    const dd=hyp(u.x-cx,u.y-cy)+(u.carry>0?150:0)+(u.order.t==='gather'&&u.order.st==='work'?60:0);if(dd<bd){bd=dd;w=u;}}
  if(!w||!aiAct(ai))return false;
  const ok=orderBuild(w,type,spot.tx,spot.ty);if(ok&&type==='hub')ai.st.expand++;return ok;
}
/* exchange efficiency of each producible class against the observed enemy mix (Lanchester attrition rates per unit of cost):
   off = sum_t share_t * dps(s->t) * cost_t / hp_t   (enemy value destroyed per second by one unit of type s)
   def = sum_t share_t * dps(t->s) / hp_s            (fraction of one s lost per second per enemy unit)
   eff = off / (def * cost_s)                                                                                       */
function aiCounterEff(recs,list,team){
  const es=aiStacksOf(recs,team);let N=0;for(const t of es)N+=t.n;const eff={};
  for(const id of list){const c=AI_CLS[id];if(!c)continue;const s=cmbStackOf(id,1,{});let off=0,def=0;
    for(const t of es){const sh=t.n/N;off+=sh*cmbDmg(s,t)/s.cd*t.cost/t.hp;def+=sh*cmbDmg(t,s)/t.cd/s.hp;}
    const e=off/(Math.max(0.004,def)*aiVal(id));eff[c]=Math.max(eff[c]||0,e);}
  return eff;
}
function aiUnitPick(ai,R,b,spend){
  const th=ai.th,team=ai.team,list=prodList(b);
  // composition target: theta weights x counter multipliers from the OBSERVED enemy army (Lanchester effectiveness per cost)
  const recs=aiEnemyRecs(ai,150,true);
  const have={},tot={v:0};for(const c of AI_CLASSES)have[c]=0;
  for(const u of R.army){const c=AI_CLS[u.type];if(c){have[c]+=u.def.supply;tot.v+=u.def.supply;}}
  for(const x of R.prod)for(const q of x.queue)if(q.k==='u'){const c=AI_CLS[q.id];if(c){have[c]+=UDEF[q.id].supply;tot.v+=UDEF[q.id].supply;}}
  const W={};let wsum=0;
  for(const c of AI_CLASSES){W[c]=Math.max(0.02,th[AI_CKEY[c]]);}
  if(recs.length&&th.counter>0){const eff=aiCounterEff(recs,list,team);let me=0,n=0;for(const c in eff){me+=eff[c];n++;}
    if(n){me/=n;for(const c in eff)W[c]*=Math.pow(Math.max(0.05,eff[c]/me),th.counter);}}
  const menders=R.army.filter(u=>u.type==='mender').length,armySup=tot.v;
  if(menders>=Math.max(1,armySup/9))W.sup=0.001;
  for(const c of AI_CLASSES)wsum+=W[c];
  let best=null,bs=-1e9;
  for(const id of list){const c=AI_CLS[id];if(!c)continue;if(!reqUnit(team,id).ok)continue;const cc=uCost(team,id);if(cc.c>spend.c||cc.e>spend.e)continue;
    const want=W[c]/wsum,share=tot.v?have[c]/tot.v:0;const s=want-share+airand(ai)*0.02;if(s>bs){bs=s;best=id;}}
  return best;
}
function aiMacro(ai,R){
  const team=ai.team,T=G.teams[team],th=ai.th,now=G.time,cfg=ai.cfg,B=R.B,workers=R.workers,hubs=R.hubs;
  if(!hubs.length&&!B.length)return;
  const pend=t=>{let n=0;for(const w of workers)if(w.order.t==='build'&&!w.order.bld&&w.order.type===t)n++;return n;};
  const cnt=t=>{let n=0;for(const b of B)if(b.type===t)n++;return n+pend(t);};
  const doneN=t=>{let n=0;for(const b of B)if(b.type===t&&b.done)n++;return n;};
  const reserve={c:0,e:0};const spendable=()=>({c:T.c-reserve.c,e:T.e-reserve.e});
  const canSpend=c=>T.c-reserve.c>=c.c&&T.e-reserve.e>=c.e;
  const hold=(c)=>{reserve.c+=c.c;reserve.e+=c.e;};
  const threatened=(ai.thrV||0)>150;
  // tax (Caesar II rule kept from v3)
  if(T.morale<36&&T.tax>0)T.tax--;else if(T.morale>74&&T.tax<2)T.tax++;
  // stage point: in front of the most forward hub, towards the map centre
  const anchor=hubs.length?hubs.reduce((a,h)=>hyp(h.x-WW/2,h.y-WH/2)<hyp(a.x-WW/2,a.y-WH/2)?h:a,hubs[0]):B[0];
  if(!ai.stage||ai.stageHub!==anchor.id){const dx=WW/2-anchor.x,dy=WH/2-anchor.y,l=hyp(dx,dy)||1;
    const f=nearestFree(clamp((anchor.x+dx/l*300)/TILE|0,3,MW-4),clamp((anchor.y+dy/l*300)/TILE|0,3,MH-4),10);
    ai.stage=f?{x:(f[0]+.5)*TILE,y:(f[1]+.5)*TILE}:{x:anchor.x,y:anchor.y};ai.stageHub=anchor.id;}
  let building=0;for(const w of workers)if(w.order.t==='build'&&!w.order.bld)building++;
  // 1. supply
  const prodN=R.prod.length,genPend=B.filter(b=>b.type==='generator'&&!b.done).length+pend('generator');
  if(T.cap-T.used<=3+prodN*2+hubs.length&&T.cap<MAXSUP&&genPend<(T.cap>60?2:1)){
    if(T.c>=100&&building<3)aiBuild2(ai,'generator',R);else hold({c:100,e:0});}
  // 2. hero (before workers: the hub is nearly always training Haulers)
  if(ai.P.hero&&hubs.length&&!T.hero.alive&&!T.hero.reviving&&(doneN('garrison')>0||T.hero.deaths>0)&&now>90){
    const hc=heroCost(team),h0=hubs.find(h=>h.queue.length<2);
    if(h0&&canSpend(hc)&&T.used+3<=T.cap){if(aiAct(ai))queueHero(h0);}else if(T.hero.deaths>0||now<500)hold(hc);}
  // 3. workers (Ideal Free Distribution target: theta's per-base saturation; capped while we must out-produce an army we have seen)
  const sip=doneN('siphon');let wq=workers.length;for(const h of hubs)for(const q of h.queue)if(q.id==='hauler')wq++;
  let wantW=Math.min(th.wMax,hubs.length*th.wBase+sip*th.wEther+2);if(ai.eco==='mass')wantW=Math.min(wantW,Math.max(14,hubs.length*12+sip*2));
  for(const h of hubs){if(h.queue.length<1&&wq<wantW&&canSpend(uCost(team,'hauler'))&&reqUnit(team,'hauler').ok&&aiAct(ai)&&queueUnit(h,'hauler'))wq++;}
  if(wq<wantW&&ai.eco!=='mass')hold({c:50,e:0});
  const hero=R.hero;if(hero){while(skillPoints(team)>0){let ok=false;for(const i of[2,1,0])if(learnSkill(team,i)){ok=true;break;}if(!ok)break;}}
  // 4. era advancement (theta timings; deferred while a real attack is on unless overdue)
  const eraDue=T.era===1?th.era2:T.era===2?th.era3:1e9;
  if(T.era<3&&now>=eraDue&&(!threatened||now>eraDue+60)&&!B.some(x=>x.queue.some(q=>q.k==='era'))){
    const E=ERAS[T.era+1],gate=T.era===1?doneN('garrison')>0:doneN('armory')>0;
    if(gate){const h0=hubs.find(h=>h.queue.length===0)||hubs[0];if(h0&&canSpend(E.cost)){if(aiAct(ai))queueEra(h0);}else hold(E.cost);}}
  // 5. buildings: a priority list; an unaffordable high-priority item reserves its cost (lower items only spend the rest)
  // production capacity sized to income (IFD income model: ~98 crystals/min per miner up to saturation, ~52 ether/min per siphon worker);
  // one busy production building spends ~300/min, theta.gar scales how much of the income goes through production
  let inc=0;{let cw=0,ew=0;for(const w of workers)if(w.order.t==='gather'&&w.order.res){if(w.order.res.type==='geyser')ew++;else cw++;}inc=98*Math.min(cw,hubs.length*20)+52*ew;}
  ai.inc=inc;
  const otherProd=cnt('foundry')+cnt('airfield'),bankX=T.c>1600?2:T.c>900?1:0;
  const gwant=clamp(Math.round(th.gar*inc/300)-otherProd+bankX+(ai.eco==='mass'?1:0),1,9);
  const nb=Math.max(1,hubs.length);const sat=workers.length>=nb*th.wBase*0.85;
  let baseWant=1+(now>th.expandAt?1:0)+(now>th.expandAt+150+300*(1-th.expandRate)?1:0)+(now>th.expandAt+400+400*(1-th.expandRate)?1:0);
  if(sat&&now>th.expandAt*0.7)baseWant=Math.max(baseWant,hubs.length+1);
  baseWant=Math.min(4,Math.round(baseWant+th.vW*(ai.V-0.5)));
  const geys=G.res.filter(r=>!r.dead&&r.type==='geyser'&&R.hubs.some(h=>hyp(h.x-r.x,h.y-r.y)<520)).length;
  const sipWant=Math.min(geys,Math.max(1,Math.round((T.era>=2?2:1.5)*nb*(0.7+0.5*(th.cAnti+th.cHeavy+th.cAir+th.cArt)/2)))+(T.e<120&&T.c>500?1:0));
  const etherShort=T.c>1200&&T.e<200;                                  // floating crystals: the Exchange turns them into ether
  const seq=[
    ['garrison',cnt('garrison')<1&&(workers.length>=8||now>50),1],
    ['siphon',cnt('garrison')>=1&&cnt('siphon')<1,1],
    ['hub',cnt('hub')<baseWant&&workers.length>=10&&!threatened&&ai.eco!=='mass',1],
    ['armory',doneN('garrison')>0&&cnt('armory')<1&&(now>th.era2-100||th.tech>0.6||now>240),1],
    ['garrison',cnt('garrison')<gwant&&doneN('garrison')>0,th.bank>0.5?1:0],
    ['siphon',cnt('siphon')<sipWant&&doneN('garrison')>0,0],
    ['foundry',T.era>=2&&doneN('armory')>0&&cnt('foundry')<(th.cHeavy+th.cArt>0.6||now>620?Math.min(2,1+(T.c>1500?1:0)):0),1],
    ['airfield',ai.P.air&&T.era>=2&&doneN('armory')>0&&cnt('airfield')<(th.cAir>0.35?1+(T.c>1500?1:0):0),1],
    ['exchange',T.era>=2&&cnt('exchange')<1&&(th.trade>0.45||etherShort||now>720&&T.c>1200),0],
    ['depot',cnt('depot')<1&&(hubs.length>=2||th.tech>0.6)&&now>200,0],
    ['turret',doneN('garrison')>0&&cnt('turret')<Math.round(th.turret*2.6*nb)&&now>150,0],
    ['forum',T.era>=2&&cnt('forum')<(T.morale<55?2:0),0],
    ['habitat',th.trade>0.6&&cnt('habitat')<3&&now>300,0]];
  if(building<2+(hubs.length>1?1:0)){
    for(const[type,cond,must]of seq){
      if(!cond)continue;const d=BDEF[type];if(d.era>T.era)continue;if(d.req&&!doneN(d.req))continue;
      const c=bCost(team,type);
      if(canSpend(c)){if(aiBuild2(ai,type,R)){hold({c:0,e:0});break;}}
      else if(must||th.bank>0.65)hold(c);}}                              // reserve it; cheaper items below may still use the unreserved rest
  // 6. research
  for(const b of B){
    if(!b.done||b.queue.length)continue;
    if(b.type==='armory'){const ids=T.wl<=T.al?['weapons','armor','stims']:['armor','weapons','stims'];
      for(const id of ids){const L=techNext(T,id);if(!L||T.era<L.era)continue;if(id==='stims'&&!R.army.some(u=>u.def.stim))continue;
        if(canSpend({c:L.c+Math.round(250*(1-th.tech)),e:L.e})&&aiAct(ai)&&queueResearch(b,id))break;}}
    else if(b.type==='depot'){for(const id of['mining','cargo','compress']){const L=techNext(T,id);if(!L||T.era<L.era)continue;if(canSpend({c:L.c+100,e:L.e})&&aiAct(ai)&&queueResearch(b,id))break;}}}
  // 7. trade: freighters and the market
  const ex=B.find(b=>b.type==='exchange'&&b.done);
  if(ex){const fr=R.U.filter(u=>u.def.trade),frQ=ex.queue.filter(q=>q.id==='freighter').length,wantF=Math.round(th.trade*5);
    if(fr.length+frQ<wantF&&ex.queue.length<2&&!threatened&&canSpend(uCost(team,'freighter'))&&aiAct(ai))queueUnit(ex,'freighter');
    const posts=G.neutrals.filter(n=>n.type==='post');
    for(const f of fr){if(f.order.t!=='idle')continue;let best=null,bs=-1;
      for(const p of posts){const on=fr.filter(x=>x.order.t==='trade'&&x.order.post===p).length;if(on>=3)continue;const s=hyp(p.x-ex.x,p.y-ex.y)*p.demand/(1+on);if(s>bs){bs=s;best=p;}}
      if(best&&aiAct(ai))setOrder(f,{t:'trade',post:best,st:'toPost'});}
    if(T.c>1000&&T.e<250&&G.mkt.p<1.6){if(aiAct(ai))mktTrade(team,'buyE');}else if(T.e>1400&&T.c<250){if(aiAct(ai))mktTrade(team,'sellE');}}
  // 8. army production: whatever is not reserved (macro efficiency < 1 skips some buildings: the lower tiers' sloppy macro)
  const sp=spendable();
  for(const b of R.prod){
    if(b.queue.length>=2)continue;if(cfg.macro<1&&airand(ai)>cfg.macro)continue;
    const s=spendable();if(s.c<50)break;
    const id=aiUnitPick(ai,R,b,s);if(!id)continue;
    if(aiAct(ai))queueUnit(b,id);
    if(ai.stage&&(!b.rally||hyp(b.rally.x-ai.stage.x,b.rally.y-ai.stage.y)>90)){b.rally={x:ai.stage.x,y:ai.stage.y};}}
  void sp;
}

/* ------------------------------------------------------------------ workers: Ideal Free Distribution + demand pheromone */
function aiWorkers(ai,R){
  const team=ai.team,T=G.teams[team],th=ai.th,hubs=R.hubs;if(!hubs.length)return;
  const free=R.workers.filter(w=>!w.garr&&w.id!==ai.scout.id&&w.order.t!=='build'&&w.order.t!=='repair');
  // shadow price of ether: high while we are short of it, low when it piles up
  const lamE=T.e<150?1.6:T.e<400?1.0:T.e<900?0.45:0.12;
  const sites=[];
  for(const h of hubs){if(!G.res.some(r=>!r.dead&&r.type==='crystal'&&hyp(r.x-h.x,r.y-h.y)<560))continue;sites.push({kind:'c',h,sat:16,rate:98,w:1,n:0,L:[]});}
  for(const b of R.B)if(b.type==='siphon'&&b.done&&b.res&&!b.res.dead)sites.push({kind:'e',s:b,res:b.res,sat:Math.round(th.wEther),rate:52,w:lamE*1.25,n:0,L:[]});
  if(!sites.length)return;
  const idle=[];
  for(const w of free){
    if(w.order.t!=='gather'||!w.order.res){idle.push(w);continue;}
    const r=w.order.res;let site=null;
    if(r.type==='geyser')site=sites.find(s=>s.kind==='e'&&s.res===r);
    else{let bd=1e9;for(const s of sites)if(s.kind==='c'){const d=hyp(s.h.x-r.x,s.h.y-r.y);if(d<bd){bd=d;site=s;}}}
    if(site){site.n++;site.L.push(w);}else idle.push(w);}
  const want=ifdAlloc(sites,free.length);
  const send=(w,s)=>{let r=null;if(s.kind==='e')r=s.res;else r=nearestRes(s.h.x,s.h.y,'crystal',true,560)||nearestRes(s.h.x,s.h.y,'crystal',false,560);
    if(!r)return false;const o={t:'gather',res:r,st:w.carry>0&&(w.carryType==='c')===(r.type==='crystal')?'ret':'go',hx:r.x,hy:r.y};
    if(!aiAct(ai))return false;setOrder(w,o);s.n++;return true;};
  for(const w of idle){let b=null,bg=-1;for(let i=0;i<sites.length;i++){const g=want[i]-sites[i].n;if(g>bg){bg=g;b=sites[i];}}if(b&&!send(w,b))break;}
  // rebalance: move workers from the most over-allocated site to the most under-allocated (one selection per move)
  for(let k=0;k<2;k++){let hi=-1,lo=-1,hd=1,ld=-1;
    for(let i=0;i<sites.length;i++){const d=sites[i].n-want[i];if(d>hd){hd=d;hi=i;}if(-d>ld&&d<0){ld=-d;lo=i;}}
    if(hi<0||lo<0)break;const S=sites[hi];const mv=S.L.filter(w=>w.carry===0||sites[lo].kind==='c'&&w.carryType==='c').slice(0,Math.min(hd-1,ld));if(!mv.length)break;
    let r=null;const D=sites[lo];if(D.kind==='e')r=D.res;else r=nearestRes(D.h.x,D.h.y,'crystal',true,560)||nearestRes(D.h.x,D.h.y,'crystal',false,560);if(!r)break;
    if(!aiAct(ai))break;for(const w of mv){setOrder(w,{t:'gather',res:r,st:w.carry>0?'ret':'go',hx:r.x,hy:r.y});S.n--;D.n++;S.L.splice(S.L.indexOf(w),1);}}
  // repair: send up to two miners to the strongest repair-demand cell (ant-colony style demand pheromone), only when safe
  if((ai.thrV||0)<60&&T.c>200&&!R.workers.some(w=>w.order.t==='repair')){
    const pm=ai.ph.dem;let bi=-1,bv=1.2;for(let i=0;i<BN;i++)if(pm[i]>bv){bv=pm[i];bi=i;}
    if(bi>=0){let tgt=null,bd=1e9;for(const b of R.B)if(b.done&&b.hp<b.maxhp*0.85){const d=hyp(b.x-bcx(bi),b.y-bcy(bi));if(d<bd){bd=d;tgt=b;}}
      if(tgt){const c=free.filter(w=>w.order.t==='gather'&&w.carry===0).sort((a,b)=>hyp(a.x-tgt.x,a.y-tgt.y)-hyp(b.x-tgt.x,b.y-tgt.y)).slice(0,2);
        if(c.length&&aiAct(ai))for(const w of c)setOrder(w,{t:'repair',target:tgt});}}}
}

/* ------------------------------------------------------------------ scouting (belief x staleness) */
function aiScout(ai,R){
  const th=ai.th,now=G.time,S=ai.scout;
  let u=S.id?R.U.find(x=>x.id===S.id):null;
  if(S.id&&!u){S.id=0;S.last=now;}
  const period=35+170*(1-th.scout);
  if(!u){
    if(now<60+70*(1-th.scout)||now-S.last<period||ai.mil==='defend')return;
    const cands=R.army.filter(x=>(x.type==='raptor'||x.type==='skiff'||x.type==='reaver'||x.type==='rifleman')&&!ai.har.ids.includes(x.id)&&x.hp>x.maxhp*0.7);
    cands.sort((a,b)=>b.def.speed-a.def.speed);
    u=cands[0]||(now<420&&R.workers.length>9?R.workers.find(w=>w.order.t==='gather'&&w.carry===0):null);
    if(!u)return;S.id=u.id;S.t=now;S.tgt=-1;}
  const s=ai.bel.s,pv=ai.ph.vis;
  const done=S.tgt>=0&&hyp(u.x-bcx(S.tgt),u.y-bcy(S.tgt))<160;
  if(u.hp<u.maxhp*0.55||now-S.t>(u.def.worker?60:110)){ // back to work
    if(u.def.worker){const r=nearestRes(R.hubs[0]?R.hubs[0].x:u.x,R.hubs[0]?R.hubs[0].y:u.y,'crystal',true,700);if(r&&aiAct(ai))setOrder(u,{t:'gather',res:r,st:'go',hx:r.x,hy:r.y});}
    else if(ai.stage&&aiAct(ai))setOrder(u,{t:'move',x:ai.stage.x,y:ai.stage.y});
    S.id=0;S.last=now;return;}
  if(S.tgt<0||done||u.order.t==='idle'){
    let bi=-1,bs=-1e9;
    for(let i=0;i<BN;i++){const x=bcx(i),y=bcy(i);const t=G.TT[tileOf(x,y)];if(t===3)continue;
      const site=ai.bel.sites.some(q=>q.i===i)?0.5:0;
      const sc=(1-pv[i])*(0.12+s[i]+site)-hyp(x-u.x,y-u.y)/3200;if(sc>bs){bs=sc;bi=i;}}
    if(bi>=0&&aiAct(ai)){S.tgt=bi;setOrder(u,{t:'move',x:bcx(bi),y:bcy(bi)});}}
}

/* ------------------------------------------------------------------ tactics */
function aiNearEnemies(ai,R,x,y,rad){const L=[];for(const e of R.en){if(e.def.worker&&!e.target)continue;if(hyp(e.x-x,e.y-y)<rad)L.push(e);}return L;}
function aiStaticNear(ai,R,x,y,rad){const L=[];for(const b of R.enB)if(b.done&&b.def.dmg&&hyp(b.x-x,b.y-y)<rad+b.def.range)L.push(b);return L;}
function aiLocalP(ai,mine,enemies,statics,ownStatics){
  if(!enemies.length&&!statics.length)return 1;
  const own=aiStacksOf(mine,ai.team);const en=aiStacksOf(enemies,ai.team);
  if(ownStatics)for(const b of ownStatics){const s=cmbStackOf(b.type,1,{hp:b.hp,garr:b.garr?b.garr.length:0,meridian:G.teams[ai.team].faction==='meridian'});s.cost=aiVal(b.type);own.push(s);}
  for(const b of statics){const s=cmbStackOf(b.type,1,{hp:b.hp,garr:b.garr?b.garr.length:0});s.cost=aiVal(b.type);en.push(s);}
  return cmbPredict(own,en).p;
}
function aiFocus(ai,mine,enemies){ // focus fire: threat per remaining HP, kill-securing; overkill-aware greedy assignment
  const ranged=mine.filter(u=>!u.def.noWeapon&&rangeOf(u)>=90&&!u.sieged&&!u.def.hero);if(ranged.length<3||!enemies.length)return 0;
  const sc=enemies.map(e=>{let dps=0;if(e.def.dmg)dps=e.def.dmg/(e.def.cd||1);const v=(dps+1)*(1+(e.def.hero?0.5:0)+(e.def.heal?1.2:0))/Math.max(10,e.hp);return{e,v};}).sort((a,b)=>b.v-a.v);
  const used=new Set();let groups=0;
  for(const{e}of sc){if(groups>=3)break;
    const L=ranged.filter(u=>!used.has(u.id)&&canAttack(u.def,e)&&hyp(u.x-e.x,u.y-e.y)<rangeOf(u)+90).sort((a,b)=>hyp(a.x-e.x,a.y-e.y)-hyp(b.x-e.x,b.y-e.y));
    let dmg=0;const G2=[];for(const u of L){if(dmg>=e.hp*1.25)break;G2.push(u);dmg+=dmgVs(baseDmgOf(u),bonOf(u),e,!!u.def.proj);}
    if(G2.length<2)continue;for(const u of G2)used.add(u.id);
    if(aiOrder(ai,G2,{t:'attack',target:e}))groups++;else break;}
  if(groups)ai.st.focus+=groups;return groups;
}
function aiKite(ai,R,mine,enemies,home){ // stutter step: ranged units step back from melee while their weapon reloads
  const melee=enemies.filter(e=>e.def.range<=30&&e.def.ground);if(!melee.length)return 0;
  const K=mine.filter(u=>!u.def.noWeapon&&rangeOf(u)>=100&&!u.sieged&&u.cd>0.25&&melee.some(e=>hyp(e.x-u.x,e.y-u.y)<u.r+e.r+55));
  if(K.length<2)return 0;const c=centroid(K),dir=fieldDir(c,home,melee.map(e=>({x:e.x,y:e.y,w:1})),0.6);
  if(aiOrder(ai,K,{t:'move',x:c.x+dir.x*75,y:c.y+dir.y*75})){ai.st.kite++;return 1;}return 0;
}
function aiSiege(ai,R,army){
  for(const u of army){if(u.type!=='howitzer')continue;
    let nd=1e9;for(const e of R.en){if(e.flying)continue;const d=hyp(e.x-u.x,e.y-u.y);if(d<nd)nd=d;}
    for(const b of R.enB){const d=rectDist(u.x,u.y,b);if(d<nd)nd=d;}
    if(!u.sieged&&nd>195&&nd<=335&&u.siegeT<=0&&(u.order.t==='idle'||!u.target)){if(aiAct(ai))toggleSiege(u);}
    else if(u.sieged&&nd>380&&u.siegeT<=0){if(aiAct(ai))toggleSiege(u,true);}}
}
function aiArmy(ai,R){
  const now=G.time,th=ai.th,cfg=ai.cfg,team=ai.team;
  const all=R.army.filter(u=>u.id!==ai.scout.id&&!u.garr);
  const harIds=ai.har.ids,har=all.filter(u=>harIds.includes(u.id)),crew=ai.creep?all.filter(u=>ai.creep.ids.includes(u.id)):[];
  const army=all.filter(u=>!harIds.includes(u.id)&&!(ai.creep&&ai.creep.ids.includes(u.id)));
  const home=ai.stage||(R.hubs[0]?{x:R.hubs[0].x,y:R.hubs[0].y}:{x:R.B[0].x,y:R.B[0].y});
  aiSiege(ai,R,all);
  if(R.hero)aiHeroCast2(ai,R.hero,R);
  // local engagements: the predictor decides fight or flight, with hysteresis between th.aggr and th.retreat
  const c=centroid(army);
  if(c){
    const en=aiNearEnemies(ai,R,c.x,c.y,520),st=aiStaticNear(ai,R,c.x,c.y,380);
    if(en.length||st.length){
      const mine=army.filter(u=>hyp(u.x-c.x,u.y-c.y)<640);
      const atHome=R.B.some(b=>hyp(b.x-c.x,b.y-c.y)<560);
      const ownSt=atHome?R.B.filter(b=>b.done&&b.def.dmg&&hyp(b.x-c.x,b.y-c.y)<520):null;
      const p=aiLocalP(ai,mine,en,st,ownSt);ai.pL=p;
      // fleeing only pays when there is somewhere better to fight: never from our own base, and not from faster pursuers already in range
      let chased=0;for(const e of en)if(e.def.speed>95&&hyp(e.x-c.x,e.y-c.y)<200)chased++;
      const flee=!atHome&&chased<mine.length*0.5&&(ai.engaged?p<th.retreat:p<th.aggr-0.1);
      if(flee){ // retreat along the potential field (home attracts, enemies repel)
        const dir=fieldDir(c,home,en.map(e=>({x:e.x,y:e.y,w:aiVal(e.type)/100})),1.4);
        if(aiOrder(ai,mine,{t:'move',x:clamp(c.x+dir.x*420,40,WW-40),y:clamp(c.y+dir.y*420,40,WH-40)})){ai.engaged=false;ai.st.retreat++;if(ai.mil==='attack'){ai.mil='retreat';ai.milT=now;ai.atkCool=now+18;}}
        return aiCrew(ai,R,har,crew,home);}
      if(!ai.engaged){ai.engaged=true;ai.st.engage++;ai.engT=now;
        if(cfg.micro&&en.length&&mine.length>=6){ // concave: sub-groups of four take slots on an arc facing the enemy
          const ec=centroid(en),rad=Math.max(90,0.75*mine.reduce((s,u)=>s+rangeOf(u),0)/mine.length),slots=arcSlots(c,ec,rad,Math.ceil(mine.length/4));
          const sorted=mine.slice().sort((a,b)=>Math.atan2(a.y-ec.y,a.x-ec.x)-Math.atan2(b.y-ec.y,b.x-ec.x));
          for(let i=0;i<slots.length;i++)aiOrder(ai,sorted.slice(i*4,i*4+4),{t:'attackmove',x:slots[i].x,y:slots[i].y,gs:0});}
        else aiOrder(ai,mine,{t:'attackmove',x:(en[0]||st[0]).x,y:(en[0]||st[0]).y,gs:0});}
      else{
        if(cfg.kite)aiKite(ai,R,mine,en,home);
        if(cfg.focus)aiFocus(ai,mine,en);
        if(cfg.micro){const hurt=mine.filter(u=>(u.def.hero?u.hp<u.maxhp*0.3:u.hp<u.maxhp*0.22)&&en.some(e=>hyp(e.x-u.x,e.y-u.y)<220));
          if(hurt.length)aiOrder(ai,hurt,{t:'move',x:home.x,y:home.y});}
        const idle=mine.filter(u=>u.order.t==='idle'||u.order.t==='move'&&u.order.x===home.x&&u.hp>u.maxhp*0.5);
        if(idle.length&&en.length){const e=en[0];aiOrder(ai,idle,{t:'attackmove',x:e.x,y:e.y,gs:0});}}
      return aiCrew(ai,R,har,crew,home);}
    if(ai.engaged&&now-(ai.engT||0)>2)ai.engaged=false;}
  // no contact: execute the posture
  if(ai.mil==='defend'&&ai.tgt){const near=army.filter(u=>hyp(u.x-ai.tgt.x,u.y-ai.tgt.y)<2600);aiOrder(ai,near,{t:'attackmove',x:ai.tgt.x,y:ai.tgt.y,gs:0});
    // Call to Arms when the defence is hopeless and the hub is hit
    for(const h of R.hubs){const thr=R.en.filter(e=>!e.def.worker&&hyp(e.x-h.x,e.y-h.y)<420);
      if(thr.length>=4&&h.garr.length===0&&aiLocalP(ai,army.filter(u=>hyp(u.x-h.x,u.y-h.y)<600),thr,[])<0.3){if(aiAct(ai))callToArms(team,h);}}}
  else if(ai.mil==='attack'&&ai.tgt&&c){
    const sp=spreadOf(army,c),R0=60+22*Math.sqrt(army.length);
    if(sp>R0*2.2&&hyp(c.x-ai.tgt.x,c.y-ai.tgt.y)>700){ // cohesion: regroup at the centroid before pushing on (no chokepoint stringing)
      const far=army.filter(u=>hyp(u.x-c.x,u.y-c.y)>R0);aiOrder(ai,far,{t:'move',x:c.x,y:c.y,gs:0});}
    else{let slow=1e9;for(const u of army)if(u.def.speed<slow)slow=u.def.speed;
      aiOrder(ai,army,{t:'attackmove',x:ai.tgt.x,y:ai.tgt.y,gs:slow<1e9?slow*1.1:0});}}
  else if(ai.mil==='retreat'||ai.mil==='hold'){
    const away=army.filter(u=>hyp(u.x-home.x,u.y-home.y)>300&&(u.order.t==='idle'||ai.mil==='retreat'));
    if(away.length)aiOrder(ai,away,{t:ai.mil==='retreat'?'move':'attackmove',x:home.x,y:home.y,gs:0});
    for(const h of R.hubs)if(h.garr.length&&(ai.thrV||0)<30){if(aiAct(ai))callToArms(team,h);}}
  aiCrew(ai,R,har,crew,home);
  if(ai.mil==='hold')aiCreepPlan(ai,R,army);
}
function aiCrew(ai,R,har,crew,home){
  const H=ai.har;
  if(har.length&&H.tgt){const c=centroid(har),en=aiNearEnemies(ai,R,c.x,c.y,420).filter(e=>!e.def.worker),st=aiStaticNear(ai,R,c.x,c.y,300);
    const p=en.length||st.length?aiLocalP(ai,har,en,st):1;
    if(p<0.45||har.reduce((s,u)=>s+u.hp/u.maxhp,0)/har.length<0.45){aiOrder(ai,har,{t:'move',x:home.x,y:home.y});H.ids=[];H.tgt=null;}
    else{const wk=R.en.filter(e=>e.def.worker&&hyp(e.x-c.x,e.y-c.y)<360);
      if(wk.length){wk.sort((a,b)=>a.hp-b.hp);aiOrder(ai,har,{t:'attack',target:wk[0]});}
      else aiOrder(ai,har,{t:'attackmove',x:H.tgt.x,y:H.tgt.y,gs:0});}}
  if(ai.creep){const C=ai.creep,camp=G.camps[C.camp],K=ai.mem.camps[C.camp];
    const hero=R.hero;
    if(!hero||G.time>C.until||hero.hp<hero.maxhp*0.35||K&&!K.alive&&G.time-K.t<1||ai.mil!=='hold'){
      aiOrder(ai,crew,{t:'move',x:home.x,y:home.y});ai.creep=null;ai.lastCreep=G.time;}
    else aiOrder(ai,crew,{t:'attackmove',x:camp.x,y:camp.y,gs:0});}
}
function aiCreepPlan(ai,R,army){
  const th=ai.th,now=G.time,hero=R.hero;
  if(ai.creep||!hero||th.creep<0.35||now-ai.lastCreep<30+60*(1-th.creep)||hero.hp<hero.maxhp*0.8||(ai.thrV||0)>0)return;
  const H=G.teams[ai.team].hero,anchor=R.hubs[0]||R.B[0];let best=null,bd=1e9;
  const crew=army.filter(u=>u.type!=='howitzer'&&u.type!=='titan'&&!u.def.noWeapon).slice(0,10);
  for(const c of G.camps){const K=ai.mem.camps[c.id];if(K&&!K.alive)continue;
    const st=aiStacksOf(crew,ai.team),cs=CAMP_TYPES[c.lvl].reduce((m,t)=>{m[t]=(m[t]||0)+1;return m;},{});
    const en=[];for(const t in cs){const s=cmbStackOf(t,cs[t],{});s.cost=aiVal(t);en.push(s);}
    if(H.level<(c.lvl===3?4:1))continue;if(cmbPredict(st,en).p<0.85)continue;
    const d=hyp(c.x-anchor.x,c.y-anchor.y);if(d<bd&&d<1600){bd=d;best=c;}}
  if(!best)return;
  ai.creep={camp:best.id,until:now+80,ids:crew.map(u=>u.id)};
}
function aiHeroCast2(ai,h,R){ // v3's cluster logic, fed with perceived enemies only
  const team=ai.team;if(h.stunned>0)return;
  const en=R.en.filter(e=>hyp(e.x-h.x,e.y-h.y)<520&&!e.def.worker),bld=R.enB.filter(b=>hyp(b.x-h.x,b.y-h.y)<540);
  const cluster=(list,rad)=>{let best=null,bn=0;for(const c of list){let n=0;for(const e of list)if(hyp(e.x-c.x,e.y-c.y)<=rad)n++;if(n>bn){bn=n;best=c;}}return{c:best,n:bn};};
  for(let i=2;i>=1;i--){
    if(!canCast(h,i))continue;const s=skillOf(h,i);
    if(s.target==='point'){const pool=en.length?en:bld,cl=cluster(pool,s.radius*0.8),need=i===2?(en.length?4:3):2;
      if(cl.c&&cl.n>=need&&hyp(cl.c.x-h.x,cl.c.y-h.y)<=s.range){if(aiAct(ai))castSkill(h,i,cl.c.x,cl.c.y);return;}}
    else{let allies=0;forNear(h.x,h.y,s.radius,a=>{if(a.team===team&&!a.dead&&!a.def.worker)allies++;});
      if(allies>=5&&en.length>=3){if(aiAct(ai))castSkill(h,i,h.x,h.y);return;}}}
}

/* ------------------------------------------------------------------ the think loop (time-sliced) */
function aiThinkT2(ai){
  const R=AI_RT[ai.team],now=G.time;
  aiOwn(ai,R);if(!R.B.length)return;
  ai.apm.tok=Math.min(ai.apm.burst,ai.apm.tok+ai.apm.rate*Math.max(0,now-ai.apm.t));ai.apm.t=now;
  aiObserve(ai,R);
  ai.k++;ai.st.thinks++;
  if(ai.k%2===0){aiBelief(ai,R);aiStrategy(ai,R);}else{ai.tag='mac';aiMacro(ai,R);}
  if(ai.k%4===3){ai.tag='wrk';aiWorkers(ai,R);ai.tag='sct';aiScout(ai,R);}
  ai.tag='arm';aiArmy(ai,R);
}
