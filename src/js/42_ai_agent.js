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
  ['harass',0,1],['scout',0,1],['turret',0,1],['creep',0,1],['vW',0,2],['bank',0,1],['trade',0,1],['tech',0,1],['prior',0.6,1.4]];
const THETA_N=THETA_SPEC.length;
const AI_CLS={rifleman:'light',specter:'light',raptor:'melee',reaver:'melee',rocketeer:'anti',juggernaut:'heavy',bulwark:'heavy',titan:'heavy',howitzer:'art',skiff:'air',mender:'sup'};
for(const k in UDEF)if(UDEF[k].aiCls&&!AI_CLS[k])AI_CLS[k]=UDEF[k].aiCls;   // v6: the new units carry their class in UDEF (06_content_units.js)
/* v6 classes without a theta weight of their own (the league's 29-number vector is frozen): aa / cast / det / cap borrow a theta key and are then set by observation rules in aiUnitPick */
const AI_CLASSES=['light','melee','anti','heavy','art','air','sup','aa','cast','det','cap'];
const AI_CKEY={light:'cLight',melee:'cMelee',anti:'cAnti',heavy:'cHeavy',art:'cArt',air:'cAir',sup:'cSup',aa:'cAnti',cast:'cSup',det:'cSup',cap:'cHeavy'};
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
    P:{iv:tier.think,hero:tier.hero!==false,air:tier.air!==false,wave:1,first:0},next:1+0.1*team,k:0,rs:(G.seed*2654435761+team*97+7)>>>0,
    apm:{rate:tier.apm/60,burst:Math.max(3,tier.apm/60*5),tok:3,t:0,n:0,denied:0},delay:tier.delay,
    mem:{u:{},b:{},camps:{},armySeenT:-99,heroLvl:0,heroT:-99,eraSeen:1},
    bel:{s:new Float32Array(BN),a:new Float64Array(BN),t:0},ph:{vis:new Float32Array(BN),dem:new Float32Array(BN),def:new Float32Array(BN)},
    mil:'hold',milT:0,tgt:null,atkN:0,grp:[],eng:{},atkCool:0,wave:0,attacking:false,V:0.5,pG:0.5,pL:-1,
    har:{ids:[],tgt:null,t:-99},scout:{id:0,tgt:-1,t:-99,last:-99},creep:null,lastCreep:0,
    stage:null,stageHub:0,res:{why:'',since:0},st:{thinks:0,engage:0,retreat:0,focus:0,kite:0,expand:0,cmds:0}};
  if(opt.noV)ai.cfg.useV=0;
  if(ai.cfg.plan&&ai.cfg.plan.sims>0)ai.pl={a:-1,at:0,w:0,K:Math.max(1,ai.cfg.plan.K|0),N:[],W:[],P:[],root:null,est:null,t0:0,n:0,pi:[],q:[],why:'',
    rs:(G.seed*1597334677+team*7919+11)>>>0,log:ai.cfg.plan.log?[]:null};
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
function aiStacksOf(list,team,hpOf){ // list: unit objects (own, or currently visible enemies: their buffs such as a Banner aura are visible) or memory records
  const by={},T=G.teams[team],H=T.hero;for(const u of list){const k=u.type;const e=by[k]||(by[k]={n:0,hp:0,arm:0});e.n++;e.hp+=hpOf?hpOf(u):u.hp;e.arm+=u.armAdd||0;}
  const out=[];for(const k in by){const e=by[k];const s=cmbStackOf(k,e.n,{wl:T.wl,al:T.al,hp:e.hp/e.n,lvl:H?H.level:1,meridian:T.faction==='meridian'});s.armor+=e.arm/e.n;s.cost=aiVal(k);out.push(s);}
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
function aiVF(ai){return ai.cfg.vf||(typeof AI_PARAMS!=='undefined'?AI_PARAMS.vf:null);}   // per-agent V(s) (league candidates) or the shipped one
function aiValue(ai,R){if(!ai.cfg.useV)return 0.5;const m=aiVF(ai);return m?vfEval(m,aiFeatures(ai,R)):0.5;}

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
/* ------------------------------------------------------------------ macro planner glue (search itself: 41_ai_mcts.js) */
/* per-value Lanchester coefficients of a list of stacks against an opposing list: d = dps per value, h = hp per value */
function aiDH(S,E){const det=S.some(s=>s.detect);let dps=0,hp=0,v=0;
  for(const s of S){let d=0,w=0;for(const e of E){if(e.cloak&&!det)continue;const x=cmbDmg(s,e);if(x>0){d+=x/s.cd*e.n;}w+=e.n;}dps+=s.n*(w?d/w:0);hp+=s.n*s.hp;v+=s.n*(s.cost||50);}
  return v>0?[dps/v,hp/v]:[0.187,1.1];}
/* one side of an abstract state from that team's TRUE state. The AI calls it only for its own team; tools/league/calib_model.js also
   calls it for the opponent (privileged, offline calibration of the model - never inside the AI) */
const AI_FAST={raptor:1,reaver:1,skiff:1,jackal:1,phantom:1,interceptor:1};
function aiPlanSide(s,o,team,th){
  const T=G.teams[team];let hubT=0,prodT=0,eraT=0,upT=0,St=0,tur=0,H=0,sip=0,P=0,W=0,A=0,F=0;
  for(const b of G.buildings){if(b.dead||b.team!==team)continue;St+=aiVal(b.type);
    if(b.done){if(b.type==='turret')tur++;else if(b.type==='hub')H++;else if(b.type==='siphon')sip++;else if(b.type==='garrison'||b.type==='foundry'||b.type==='airfield')P++;}
    else{if(b.type==='hub')hubT=Math.max(hubT,(1-b.prog)*70);else if(b.type==='garrison'||b.type==='foundry'||b.type==='airfield')prodT=Math.max(prodT,(1-b.prog)*45);}
    for(const q of b.queue){if(q.k==='era')eraT=Math.max(eraT,Math.max(1,q.total-q.t));if(q.k==='r'&&(q.id==='weapons'||q.id==='armor'))upT=Math.max(upT,Math.max(1,q.total-q.t));}}
  for(const u of G.units){if(u.dead||u.team!==team)continue;
    if(u.def.worker){W++;if(u.order.t==='build'&&!u.order.bld&&u.order.type==='hub')hubT=Math.max(hubT,85);}
    else if(!u.def.trade){const v=aiVal(u.type)*Math.max(0.15,u.hp/u.maxhp);A+=v;if(AI_FAST[u.type])F+=v;}}
  s[o+PS_C]=T.c;s[o+PS_E]=T.e;s[o+PS_W]=W;s[o+PS_H]=H;s[o+PS_HT]=hubT;s[o+PS_SIP]=sip;s[o+PS_P]=P;s[o+PS_PT]=prodT;s[o+PS_ERA]=T.era;s[o+PS_ERT]=eraT;
  s[o+PS_A]=A;s[o+PS_TUR]=tur;s[o+PS_ST]=St;s[o+PS_KIL]=1000*(T.kills-(T.creeps||0)-T.lost)/20;s[o+PS_UP]=T.wl+T.al;s[o+PS_UPT]=upT;
  s[o+PS_WMX]=th?th.wMax:36;s[o+PS_A0]=A;s[o+PS_HERO]=T.hero.alive?T.hero.level:0;s[o+PS_FST]=A>0?F/A:0;
}
/* the abstract root: our side from our own (true) state, the opponent's from MEMORY and the BELIEF GRID only (fog-honest),
   plus the point estimate `est` from which plWorld samples K determinised worlds */
function aiPlanRoot(ai,R,own,en,known,myVal,stale){
  const s=new Float64Array(PS_LEN),T=G.teams[ai.team],th=ai.th,now=G.time,M=ai.mem,o=0,p=PS_N;
  aiPlanSide(s,o,ai.team,th);
  const dhO=aiDH(own,en),dhE=aiDH(en,own);
  s[o+PS_A]=myVal;s[o+PS_A0]=myVal;s[o+PS_D]=dhO[0];s[o+PS_HP]=dhO[1];s[o+PS_LOC]=ai.mil==='attack'?1:0;s[o+PS_TRV]=0;
  // the opponent: what we remember (buildings, units <= 90 s old) + the phantom estimate for what we have not seen
  let eH=0,eSt=0,eTur=0,eP=0,eW=0,eF=0,eK=0;const known_h=[];
  for(const id in M.b){const r=M.b[id];eSt+=aiVal(r.type);if(r.type==='hub'){eH++;known_h.push(r);}if(r.type==='turret'&&r.done)eTur++;if(r.type==='garrison'||r.type==='foundry'||r.type==='airfield')eP++;}
  for(const r of aiEnemyRecs(ai,90,false)){const d=UDEF[r.type];if(d.worker)eW++;else if(!d.trade){const v=aiVal(r.type);eK+=v;if(AI_FAST[r.type])eF+=v;}}
  const emain=G.sites[ai.enemy],sites=[];let mainKnown=false;
  for(const h of known_h)if(hyp(h.x-emain.cx*TILE,h.y-emain.cy*TILE)<10*TILE)mainKnown=true;
  if(!mainKnown)eH++;                                                   // the main base is public knowledge (mirrored start)
  for(const st of ai.bel.sites){if(known_h.some(h=>hyp(h.x-st.x,h.y-st.y)<12*TILE))continue;if(R.B.some(b=>b.type==='hub'&&hyp(b.x-st.x,b.y-st.y)<12*TILE))continue;
    if(st.d<st.dOwn)sites.push(+Math.min(0.95,ai.bel.s[st.i]).toFixed(4));}
  const eA=Math.max(known,th.prior*myVal*(0.4+0.6*stale));
  const est={A:eA,known,stale,W:Math.max(eW,s[o+PS_W]*0.95),Wseen:eW,H:eH,sites,era:T.era,eraSeen:M.eraSeen,St:Math.max(eSt,s[o+PS_ST]*0.85),P:Math.max(eP,s[o+PS_P]*0.9),c:150};
  s[p+PS_C]=est.c;s[p+PS_E]=0.6*est.c;s[p+PS_W]=est.W;s[p+PS_H]=eH;s[p+PS_SIP]=Math.max(1,s[o+PS_SIP]);s[p+PS_P]=est.P;s[p+PS_ERA]=M.eraSeen;
  s[p+PS_A]=eA;s[p+PS_D]=dhE[0];s[p+PS_HP]=dhE[1];s[p+PS_TUR]=eTur;s[p+PS_LOC]=(ai.thrV||0)>=120?1:0;s[p+PS_ST]=est.St;s[p+PS_UP]=T.wl+T.al;
  s[p+PS_WMX]=36;s[p+PS_A0]=eA;s[p+PS_HERO]=now-M.heroT<120?M.heroLvl:0;s[p+PS_FST]=eK>0?eF/eK:0.2;s[PS_T]=now;
  return{s,est};
}
function aiPlanConf(ai){
  const C0=ai.cfg.plan,RT=AI_RT[ai.team];
  if(!RT.thE||RT.thEf!==G.teams[ai.enemy].faction){const P=typeof AI_PARAMS!=='undefined'?AI_PARAMS:{};RT.thE=thetaDecode(aiThetaFor({theta:P.theta0},FACTIONS[G.teams[ai.enemy].faction].style));RT.thEf=G.teams[ai.enemy].faction;}
  const pol=typeof AI_PARAMS!=='undefined'&&AI_PARAMS.pol?AI_PARAMS.pol:null;
  return{K:plK(),th:ai.th,thE:RT.thE,phi:C0.phi||(pol&&pol.phi)||null,vf:ai.cfg.useV?aiVF(ai):null,c:C0.c||1.5,lam:C0.lam===undefined?0.5:C0.lam,
    D:20,depth:C0.depth||3,tEnd:ai.pl.t0+(C0.hz||100),noise:!!C0.noise};
}
/* one time slice of the planner (called from aiStrategy, i.e. at 1-2 Hz): search ceil(K/slices) determinised worlds; after K worlds
   the root visit counts decide the macro-action. All planner state lives in ai.pl as plain data (save/resume). */
function aiPlan(ai,R,own,en,army,known,myVal,stale){
  const C0=ai.cfg.plan,pl=ai.pl,now=G.time;if(!pl)return;
  if(C0.every>1&&((pl.tick=(pl.tick||0)+1)%C0.every))return;                 // CPU budget: search on every n-th strategy think only
  if(!pl.root||pl.w>=pl.K){const r=aiPlanRoot(ai,R,own,en,known,myVal,stale);pl.root=Array.from(r.s);pl.est=r.est;pl.w=0;pl.t0=now;
    pl.N=new Array(PL_NA).fill(0);pl.W=new Array(PL_NA).fill(0);
    const C=aiPlanConf(ai);pl.P=Array.from(plPrior(r.s,0,C.th,C.phi));}
  const C=aiPlanConf(ai),rng=()=>airand(pl),per=Math.ceil(pl.K/Math.max(1,C0.slices||1)),sims=Math.max(1,Math.round(C0.sims/pl.K));
  for(let k=0;k<per&&pl.w<pl.K;k++){
    const s=plWorld(Float64Array.from(pl.root),pl.est,rng),r=plSearch(s,C,rng,sims,Float64Array.from(pl.P));
    for(let a=0;a<PL_NA;a++){pl.N[a]+=r.N[a];pl.W[a]+=r.W[a];}pl.w++;}
  if(pl.w<pl.K)return;
  // decision: the most visited macro-action (training: sampled with N^(1/tau)); pi = the visit distribution (expert-iteration target)
  let tot=0;for(let a=0;a<PL_NA;a++)tot+=pl.N[a];
  pl.pi=pl.N.map(n=>+(n/Math.max(1,tot)).toFixed(4));pl.q=pl.N.map((n,a)=>n>0?+(pl.W[a]/n).toFixed(4):-1);
  let a=0;for(let b=1;b<PL_NA;b++)if(pl.N[b]>pl.N[a])a=b;
  if(C0.tau>0){const w=pl.N.map(n=>Math.pow(n,1/C0.tau));let S=0;for(const x of w)S+=x;let x=airand(pl)*S;for(a=0;a<PL_NA-1;a++){x-=w[a];if(x<=0)break;}while(a>0&&pl.N[a]<=0)a--;}
  // trust region: the search overrides the league-tuned rules only where it clearly disagrees with them. aT = the theta rules' own
  // favourite (argmax of the theta utilities); the override needs a Q margin (or, if the search never tried aT, half of all visits)
  const root=Float64Array.from(pl.root),u=plUtil(root,0,ai.th),m=plLegal(root,0);let aT=-1;for(let b=0;b<PL_NA;b++)if(m[b]&&(aT<0||u[b]>u[aT]))aT=b;
  const margin=C0.margin===undefined?0.03:C0.margin;
  const dev=a!==aT&&(pl.N[aT]>0?pl.q[a]-pl.q[aT]>=margin:pl.N[a]>=0.5*tot);
  const na=dev?a:-1;if(na!==pl.a)pl.at=now;pl.a=na;pl.top=a;pl.aT=aT;pl.n++;if(dev)pl.dev=(pl.dev||0)+1;
  pl.why=(dev?PL_ACTS[a]+' (search override)':PL_ACTS[aT]+' (rules; search agrees or is unsure)')+': est. win '+Math.round(100*Math.max(0,pl.q[a]))+'%'+(aT!==a?' vs '+PL_ACTS[aT]+' '+(pl.N[aT]>0?Math.round(100*pl.q[aT])+'%':'(not searched)'):'');
  if(pl.log){const x=plX(root,0);pl.log.push({t:+now.toFixed(1),x:Array.from(x,v=>+v.toFixed(4)),u:Array.from(u,v=>+v.toFixed(4)),m:Array.from(m),pi:pl.pi,a,aT});}
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
  const stale=Math.min(1,Math.max(0,now-ai.mem.armySeenT)/90),prior=th.prior*myVal*(0.4+0.6*stale);
  if(prior>known+50){const s=cmbStackOf('rifleman',(prior-known)/50,{wl:T.wl,al:T.al});s.cost=50;en.push(s);}
  ai.pG=own.length?cmbPredict(own,en).p:0;
  const thr=aiThreat(ai,R),thrV=aiArmyVal(thr.map(u=>({type:u.type,hp:u.hp,mhp:u.maxhp})));
  ai.thrV=thrV;
  // economic posture: 'mass' (army first, no greed) while a stronger enemy army has been seen recently or we are under attack
  ai.eco=(thrV>150||(ai.pG<0.45&&known>0.6*myVal&&now-ai.mem.armySeenT<75))?'mass':'grow';
  const sup=army.reduce((n,u)=>n+u.def.supply,0);
  // macro planner (41_ai_mcts.js): when the tier has a search budget, the most-visited macro-action of the PUCT search sets the posture
  if(ai.cfg.plan&&ai.cfg.plan.sims>0){aiPlan(ai,R,own,en,army,known,myVal,stale);}
  const PA=ai.pl&&ai.pl.a>=0?ai.pl.a:-1;
  if(PA>=0&&thrV<=150)ai.eco=(PA===PA_MASS||PA===PA_ATTACK||PA===PA_HARASS||PA===PA_DEFEND&&ai.pG<0.5)?'mass':'grow';
  const prev=ai.mil;
  // 1. defence has priority when something real is at our structures
  if(thrV>=120||thr.some(e=>!e.def.worker)&&thrV>=60&&R.army.length<3){
    if(ai.mil!=='defend'){ai.mil='defend';ai.milT=now;}
    const c=centroid(thr);ai.tgt={x:c.x,y:c.y,id:0};}
  else if(ai.mil==='defend'&&now-ai.milT>4){ai.mil='hold';ai.milT=now;}
  // 2. attack decision: predicted win probability against the estimated army, V(s) shifts the threshold (adaptive aggression)
  const wv=ai.P.wave===undefined?1:Math.max(0.05,ai.P.wave);              // campaign waveMult: < 1 = smaller, rarer attacks
  if(ai.mil==='hold'&&(PA>=0||now>th.firstAtk)&&now>ai.atkCool&&now>=(ai.P.first||0)){
    const U=(ai.pG-th.aggr)+0.25*th.vW*(ai.V-0.5);
    if((PA>=0?PA===PA_ATTACK&&sup>=6/wv:U>0&&sup>=th.atkSup/wv)||T.used>=MAXSUP-8&&sup>=30/wv){ai.mil='attack';ai.milT=now;ai.tgt=aiAttackTarget(ai,R);ai.atkN=army.length;ai.wave++;ai.attacking=true;ai.grp=army.map(u=>u.id);}}
  else if(ai.mil==='attack'){
    const g=new Set(ai.grp||[]),alive=army.filter(u=>g.has(u.id)).length;
    if(alive<Math.max(3,ai.atkN*0.35)||ai.pG<th.retreat*0.8||PA===PA_DEFEND){ai.mil='retreat';ai.milT=now;ai.atkCool=now+20;ai.st.retreat++;}
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
  const planH=ai.pl&&ai.pl.a===PA_HARASS;                              // the planner may order a raid regardless of theta's harass rule
  if(H.ids.length||ai.mil==='defend'||(planH?now-H.t<30:th.harass<0.3||now<200||now-H.t<60+120*(1-th.harass)))return;
  const fast=R.army.filter(u=>(u.type==='raptor'||u.type==='reaver'||u.type==='skiff'||u.type==='jackal'||u.type==='phantom')&&u.hp>u.maxhp*0.8);
  if(fast.length<(planH?3:4))return;
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
  for(const id of list){const c=AI_CLS[id];if(!c||UDEF[id].arsenal&&UDEF[id].noWeapon)continue;const s=cmbStackOf(id,1,{});let off=0,def=0;
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
  /* v6 observation rules (fog-honest: only what aiEnemyRecs remembers): AA when enemy air was seen, a detector when enemy cloakers were seen, one caster per ~8 supply of army, a capital ship when rich */
  {let air=0,cl=0,all=0;for(const r of recs){const d=UDEF[r.type];if(!d||d.worker||d.trade)continue;const v=aiVal(r.type);all+=v;if(d.flying)air+=v;if(d.cloak||d.abil&&d.abil.indexOf('cloak')>=0)cl+=v;}
   const T=G.teams[team];
   W.aa=0.02+Math.min(0.9,all>0?1.4*air/all:0);
   W.det=cl>0&&have.det<2&&menders<1?0.5:0.02;
   W.cast=armySup>=16&&have.cast/Math.max(1,tot.v)<0.12?Math.max(0.12,0.5*th.cSup):0.02;
   W.cap=T.era>=3&&T.c>=650&&T.e>=420&&have.cap<1+(T.c>1800?1:0)*2?Math.max(0.25,0.9*th.cHeavy):0.02;}
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
  if(T.morale<36&&T.tax>0){if(aiAct(ai))setTax(team,T.tax-1);}else if(T.morale>74&&T.tax<2){if(aiAct(ai))setTax(team,T.tax+1);}
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
  for(const h of hubs){if(cfg.macro<1&&airand(ai)>cfg.macro)continue;if(h.queue.length<1&&wq<wantW&&canSpend(uCost(team,'hauler'))&&reqUnit(team,'hauler').ok&&aiAct(ai)&&queueUnit(h,'hauler'))wq++;}
  if(wq<wantW&&ai.eco!=='mass')hold({c:50,e:0});
  const hero=R.hero;if(hero&&skillPoints(team)>0&&ai.apm.tok>=1){for(const i of[2,1,0])if(learnSkill(team,i)){aiAct(ai);break;}}
  // 4. era advancement (theta timings; deferred while a real attack is on unless overdue)
  const PA=ai.pl&&ai.pl.a>=0?ai.pl.a:-1;
  const eraDue=PA===PA_TECH?Math.min(now,T.era===1?th.era2:T.era===2?th.era3:1e9):T.era===1?th.era2:T.era===2?th.era3:1e9;
  if(T.era<3&&now>=eraDue&&(!threatened||now>eraDue+60)&&!B.some(x=>x.queue.some(q=>q.k==='era'))){
    const E=ERAS[T.era+1],gate=T.era===1?doneN('garrison')>0:doneN('armory')>0;
    if(gate){const h0=hubs.find(h=>h.queue.length===0)||hubs[0];if(h0&&canSpend(E.cost)){if(aiAct(ai))queueEra(h0);}else hold(E.cost);}}
  // 5. buildings: a priority list; an unaffordable high-priority item reserves its cost (lower items only spend the rest)
  // production capacity sized to income (IFD income model: ~98 crystals/min per miner up to saturation, ~52 ether/min per siphon worker);
  // one busy production building spends ~300/min, theta.gar scales how much of the income goes through production
  let inc=0;{let cw=0,ew=0;for(const w of workers)if(w.order.t==='gather'&&w.order.res){if(w.order.res.type==='geyser')ew++;else cw++;}inc=98*Math.min(cw,hubs.length*20)+52*ew;}
  ai.inc=inc;
  const otherProd=cnt('foundry')+cnt('airfield'),bankX=T.c>1600?2:T.c>900?1:0;
  const gwant=clamp(Math.round(th.gar*inc/300)-otherProd+bankX+(ai.eco==='mass'?1:0)+(PA===PA_MASS||PA===PA_ATTACK?1:0),1,9);
  const nb=Math.max(1,hubs.length);const sat=workers.length>=nb*th.wBase*0.85;
  let baseWant=1+(now>th.expandAt?1:0)+(now>th.expandAt+150+300*(1-th.expandRate)?1:0)+(now>th.expandAt+400+400*(1-th.expandRate)?1:0);
  if(sat&&now>th.expandAt*0.7)baseWant=Math.max(baseWant,hubs.length+1);
  baseWant=Math.min(4,Math.round(baseWant+th.vW*(ai.V-0.5)));
  if(PA===PA_EXPAND)baseWant=Math.min(4,Math.max(baseWant,hubs.length+1));else if(PA===PA_MASS||PA===PA_ATTACK||PA===PA_DEFEND)baseWant=Math.min(baseWant,hubs.length);
  const geys=G.res.filter(r=>!r.dead&&r.type==='geyser'&&R.hubs.some(h=>hyp(h.x-r.x,h.y-r.y)<520)).length;
  const sipWant=Math.min(geys,Math.max(1,Math.round((T.era>=2?2:1.5)*nb*(0.7+0.5*(th.cAnti+th.cHeavy+th.cAir+th.cArt)/2)))+(T.e<120&&T.c>500?1:0));
  const etherShort=T.c>1200&&T.e<200;                                  // floating crystals: the Exchange turns them into ether
  const ars=arsenalOn(team),labNeed=ars&&(T.faction!=='obsidian'||th.tech>0.6);   // v6: Meridian / Aurora want their caster early; Obsidian only when it techs
  const seq=[
    ['garrison',cnt('garrison')<1&&(workers.length>=8||now>50),1],
    ['siphon',cnt('garrison')>=1&&cnt('siphon')<1,1],
    ['hub',cnt('hub')<baseWant&&workers.length>=10&&!threatened&&(ai.eco!=='mass'||PA===PA_EXPAND),1],
    ['armory',doneN('garrison')>0&&cnt('armory')<1&&(now>th.era2-100||th.tech>0.6||now>240||PA===PA_TECH),1],
    ['garrison',cnt('garrison')<gwant&&doneN('garrison')>0,th.bank>0.5?1:0],
    ['siphon',cnt('siphon')<sipWant&&doneN('garrison')>0,0],
    ['foundry',T.era>=2&&doneN('armory')>0&&cnt('foundry')<(th.cHeavy+th.cArt>0.6||now>620?Math.min(2,1+(T.c>1500?1:0)):0),1],
    ['airfield',ai.P.air&&T.era>=2&&doneN('armory')>0&&cnt('airfield')<(th.cAir>0.35?1+(T.c>1500?1:0):0),1],
    ['lab',ars&&T.era>=2&&doneN('armory')>0&&cnt('lab')<1&&(now>th.era2+150||T.era>=3||labNeed)&&!threatened,0],                    // v6: casters, Barrier Field, Dreadnought
    ['siegeworks',ars&&T.faction==='meridian'&&T.era>=2&&doneN('foundry')>0&&cnt('siegeworks')<(th.cArt>0.3||th.cHeavy>0.5?1:0)&&now>420&&!threatened,0],
    ['exchange',T.era>=2&&cnt('exchange')<1&&(th.trade>0.45||etherShort||now>720&&T.c>1200),0],
    ['depot',cnt('depot')<1&&(hubs.length>=2||th.tech>0.6)&&now>200,0],
    ['turret',doneN('garrison')>0&&cnt('turret')<Math.round(th.turret*2.6*nb)+(PA===PA_DEFEND?nb:0)&&now>150,PA===PA_DEFEND?1:0],
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
        if(canSpend({c:L.c+(PA===PA_TECH?0:Math.round(250*(1-th.tech))),e:L.e})&&aiAct(ai)&&queueResearch(b,id))break;}}
    else if(b.type==='depot'){for(const id of['mining','cargo','compress']){const L=techNext(T,id);if(!L||T.era<L.era)continue;if(canSpend({c:L.c+100,e:L.e})&&aiAct(ai)&&queueResearch(b,id))break;}}
    else if(b.type==='lab'||b.type==='siegeworks'||b.type==='foundry'){   // v6 lines: only what this army can use
      const own=u=>R.army.some(x=>x.def.abil&&x.def.abil.indexOf(u)>=0);
      const ids=b.type==='lab'?['barrier',own('cloak')?'cloakcell':'',R.army.some(x=>x.def.energy&&!x.def.heal)?'reactor':'']:['optics'];
      for(const id of ids){if(!id||!TECH[id]||TECH[id].arsenal&&!ars)continue;if(id==='optics'&&!own('siege'))continue;const L=techNext(T,id);if(!L||T.era<L.era)continue;
        if(canSpend({c:L.c+Math.round(250*(1-th.tech)),e:L.e})&&aiAct(ai)&&queueResearch(b,id))break;}}}
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
    if(b.queue.length>=2)continue;const mEff=cfg.macro*Math.min(1,ai.P.wave===undefined?1:ai.P.wave);if(mEff<1&&airand(ai)>mEff)continue;
    const s=spendable();if(s.c<50)break;
    const id=aiUnitPick(ai,R,b,s);if(!id)continue;
    if(aiAct(ai))queueUnit(b,id);
    if(ai.stage&&(!b.rally||hyp(b.rally.x-ai.stage.x,b.rally.y-ai.stage.y)>90)&&aiAct(ai)){b.rally={x:ai.stage.x,y:ai.stage.y};}}
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
    const cands=R.army.filter(x=>(x.type==='raptor'||x.type==='skiff'||x.type==='reaver'||x.type==='rifleman'||x.type==='jackal'||x.type==='interceptor')&&!ai.har.ids.includes(x.id)&&x.hp>x.maxhp*0.7);
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
  for(const u of army){
    if(u.def.siege&&u.type!=='howitzer'){   // v6 siege units (Sunderer): the shared deploy / fold rule of the ability table (minimum range aware)
      if(u.siegeT>0||u.garr)continue;const w=ABIL.siege.want(u);if((w===true&&!u.sieged||w===false&&u.sieged)&&aiAct(ai))toggleSiege(u);continue;}
    if(u.type!=='howitzer')continue;
    let nd=1e9;for(const e of R.en){if(e.flying)continue;const d=hyp(e.x-u.x,e.y-u.y);if(d<nd)nd=d;}
    for(const b of R.enB){const d=rectDist(u.x,u.y,b);if(d<nd)nd=d;}
    if(!u.sieged&&nd>195&&nd<=335&&u.siegeT<=0&&(u.order.t==='idle'||!u.target)){if(aiAct(ai))toggleSiege(u);}
    else if(u.sieged&&nd>380&&u.siegeT<=0){if(aiAct(ai))toggleSiege(u,true);}}
}
/* one group's local engagement: returns true when the group is in contact (and has been handled) */
function aiGroupFight(ai,R,units,home,key){
  if(!units.length)return false;
  const now=G.time,th=ai.th,cfg=ai.cfg,c=centroid(units),E=ai.eng||(ai.eng={});
  const en=aiNearEnemies(ai,R,c.x,c.y,520),st=aiStaticNear(ai,R,c.x,c.y,380);
  if(!en.length&&!st.length){if(E[key]&&now-(E[key+'T']||0)>2)E[key]=false;return false;}
  const mine=units.filter(u=>hyp(u.x-c.x,u.y-c.y)<640);
  const atHome=R.B.some(b=>hyp(b.x-c.x,b.y-c.y)<560);
  const ownSt=atHome?R.B.filter(b=>b.done&&b.def.dmg&&hyp(b.x-c.x,b.y-c.y)<520):null;
  const p=aiLocalP(ai,mine,en,st,ownSt);ai.pL=p;
  // fight or flight with hysteresis (engaged: leave below th.retreat; not yet engaged: only enter above th.aggr-0.1).
  // Fleeing only pays when there is somewhere better to fight: never from our own base, and not from faster pursuers already in range.
  // Before contact the group may decline a fight it expects to lose (p < aggr-0.1); after contact it only disengages below th.retreat
  // and only if it can outrun the enemy units in range (otherwise turning round just feeds free kills to faster pursuers).
  let contact=false,vE=0,nE=0;for(const e of en){if(e.def.worker)continue;let near=false;for(const u of mine)if(hyp(e.x-u.x,e.y-u.y)<Math.max(rangeOf(u),e.def.range||0)+60){near=true;break;}
    if(near){contact=true;vE+=e.def.speed;nE++;}}
  let vM=0;for(const u of mine)vM+=u.def.speed*u.spdMul;vM/=mine.length;
  const flee=!atHome&&(contact?(p<th.retreat&&vM>=0.9*vE/Math.max(1,nE)):p<th.aggr-0.1);
  if(flee){ // retreat along the potential field (home attracts, enemies repel)
    const dir=fieldDir(c,home,en.map(e=>({x:e.x,y:e.y,w:aiVal(e.type)/100})),1.4);
    if(aiOrder(ai,mine,{t:'move',x:clamp(c.x+dir.x*420,40,WW-40),y:clamp(c.y+dir.y*420,40,WH-40)})){E[key]=false;ai.st.retreat++;
      if(key==='atk'&&ai.mil==='attack'){ai.mil='retreat';ai.milT=now;ai.atkCool=now+18;}}
    return true;}
  if(!E[key]){E[key]=true;E[key+'T']=now;ai.st.engage++;
    if(cfg.micro&&en.length&&mine.length>=6){ // concave: sub-groups of four take slots on an arc facing the enemy
      const ec=centroid(en),rad=Math.max(90,0.75*mine.reduce((s,u)=>s+rangeOf(u),0)/mine.length),slots=arcSlots(c,ec,rad,Math.ceil(mine.length/4));
      const sorted=mine.slice().sort((a,b)=>Math.atan2(a.y-ec.y,a.x-ec.x)-Math.atan2(b.y-ec.y,b.x-ec.x));
      for(let i=0;i<slots.length;i++)aiOrder(ai,sorted.slice(i*4,i*4+4),{t:'attackmove',x:slots[i].x,y:slots[i].y,gs:0});}
    else aiOrder(ai,mine,{t:'attackmove',x:(en[0]||st[0]).x,y:(en[0]||st[0]).y,gs:0});
    return true;}
  E[key+'T']=now;
  if(cfg.kite)aiKite(ai,R,mine,en,home);
  if(cfg.focus)aiFocus(ai,mine,en);
  if(cfg.micro){const hurt=mine.filter(u=>(u.def.hero?u.hp<u.maxhp*0.3:u.hp<u.maxhp*0.22)&&en.some(e=>hyp(e.x-u.x,e.y-u.y)<220));
    if(hurt.length)aiOrder(ai,hurt,{t:'move',x:home.x,y:home.y});}
  const idle=mine.filter(u=>u.order.t==='idle'||u.order.t==='move'&&u.order.x===home.x&&u.hp>u.maxhp*0.5);
  if(idle.length&&en.length){const e=en[0];aiOrder(ai,idle,{t:'attackmove',x:e.x,y:e.y,gs:0});}
  return true;
}
/* march in formation: cohesion (regroup when strung out), alignment (group speed = slowest member), boids-style sub-group offsets */
function aiMarch(ai,units,goal){
  if(!units.length)return;const c=centroid(units),now=G.time;
  const sp=spreadOf(units,c),R0=60+22*Math.sqrt(units.length);
  if(sp>R0*2.2&&hyp(c.x-goal.x,c.y-goal.y)>700){ // no chokepoint stringing: the stragglers close up before the push goes on
    aiOrder(ai,units.filter(u=>hyp(u.x-c.x,u.y-c.y)>R0),{t:'move',x:c.x,y:c.y,gs:0});return;}
  if(now-(ai.marchT||0)<3&&units.every(u=>u.order.t==='attackmove'))return;   // re-plan the formation at most every 3 s (APM)
  ai.marchT=now;let slow=1e9;for(const u of units)if(u.def.speed<slow)slow=u.def.speed;const gs=slow<1e9?slow*1.1:0;
  if(!ai.cfg.micro||units.length<8){aiOrder(ai,units,{t:'attackmove',x:goal.x,y:goal.y,gs});return;}
  const sorted=units.slice().sort((a,b)=>Math.atan2(a.y-c.y,a.x-c.x)-Math.atan2(b.y-c.y,b.x-c.x)),k=Math.ceil(units.length/4);
  const subs=[];for(let i=0;i<k;i++)subs.push(sorted.slice(i*4,i*4+4));
  const T=boidsTargets(subs.map(L=>centroid(L)),goal,0.5);
  for(let i=0;i<k;i++)aiOrder(ai,subs[i],{t:'attackmove',x:clamp(T[i].x,40,WW-40),y:clamp(T[i].y,40,WH-40),gs});
}
function aiArmy(ai,R){
  const now=G.time,team=ai.team;
  const all0=R.army.filter(u=>u.id!==ai.scout.id&&!u.garr);
  const all=all0.filter(u=>u.def.aiCls!=='det'),dets=all0.filter(u=>u.def.aiCls==='det');   // v6: detector flyers follow the army instead of marching in front of it
  const harIds=ai.har.ids,crewIds=ai.creep?ai.creep.ids:[];
  const har=all.filter(u=>harIds.includes(u.id)),crew=all.filter(u=>crewIds.includes(u.id));
  const rest=all.filter(u=>!harIds.includes(u.id)&&!crewIds.includes(u.id));
  const home=ai.stage||(R.hubs[0]?{x:R.hubs[0].x,y:R.hubs[0].y}:{x:R.B[0].x,y:R.B[0].y});
  aiAbilities(ai,all);
  aiSiege(ai,R,all);
  if(R.hero)aiHeroCast2(ai,R.hero,R);
  if(ai.mil==='attack'&&ai.tgt){
    // the attack group fights / marches; new units gather at the stage and join in batches (no reinforcement trickle)
    const g=new Set(ai.grp||[]),grp=rest.filter(u=>g.has(u.id)),res=rest.filter(u=>!g.has(u.id));
    ai.grp=grp.map(u=>u.id);
    if(!aiGroupFight(ai,R,grp,home,'atk'))aiMarch(ai,grp,ai.tgt);
    if(!aiGroupFight(ai,R,res,home,'home')){
      if(grp.length&&res.length>=Math.max(5,grp.length*0.3)){const c=centroid(grp);if(aiOrder(ai,res,{t:'attackmove',x:c.x,y:c.y,gs:0}))for(const u of res)ai.grp.push(u.id);}
      else{const away=res.filter(u=>u.order.t==='idle'&&hyp(u.x-home.x,u.y-home.y)>300);if(away.length)aiOrder(ai,away,{t:'attackmove',x:home.x,y:home.y,gs:0});}}}
  else{
    ai.grp=[];
    if(!aiGroupFight(ai,R,rest,home,'home')){
      if(ai.mil==='defend'&&ai.tgt){aiOrder(ai,rest.filter(u=>hyp(u.x-ai.tgt.x,u.y-ai.tgt.y)<2600),{t:'attackmove',x:ai.tgt.x,y:ai.tgt.y,gs:0});}
      else{const away=rest.filter(u=>hyp(u.x-home.x,u.y-home.y)>300&&(u.order.t==='idle'||ai.mil==='retreat'));
        if(away.length)aiOrder(ai,away,{t:ai.mil==='retreat'?'move':'attackmove',x:home.x,y:home.y,gs:0});}}}
  // Call to Arms when the defence of a hub is hopeless; release the haulers once the threat is gone
  for(const h of R.hubs){
    if(h.garr.length){if((ai.thrV||0)<30&&aiAct(ai))callToArms(team,h);continue;}
    if(ai.mil!=='defend')continue;
    const thr=R.en.filter(e=>!e.def.worker&&hyp(e.x-h.x,e.y-h.y)<420);
    if(thr.length>=4&&aiLocalP(ai,rest.filter(u=>hyp(u.x-h.x,u.y-h.y)<600),thr,[],[h])<0.3){if(aiAct(ai))callToArms(team,h);}}
  aiCrew(ai,R,har,crew,home);
  if(dets.length){const g=rest.filter(u=>!u.def.noWeapon&&u.def.speed<=130),c=g.length?centroid(g):home,far=dets.filter(u=>hyp(u.x-c.x,u.y-c.y)>110);if(far.length)aiOrder(ai,far,{t:'move',x:c.x-30,y:c.y});}
  if(ai.mil==='hold'&&ai.k%4===1)aiCreepPlan(ai,R,rest);
}
/* Hard / Master micro for the unit abilities (33_abilities.js): the deterministic rules live in ABIL[id].want and run as autocast; the AI only flips the switch, once per unit
   (Easy / Normal keep the spawn defaults: only the cloak toggle is on). Siege is handled by aiSiege (APM-charged). */
function aiAbilities(ai,army){
  if(ai.tier!=='hard'&&ai.tier!=='master')return;
  for(const u of army){if(!u.ab||u.aiAuto)continue;u.aiAuto=1;for(const id in u.ab)if(ABIL[id].autoOK&&id!=='siege')u.ab[id].auto=true;}
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

/* ------------------------------------------------------------------ the player's advisor (27_overseer.js, swarm ON only)
   The same fog-honest perception, belief grid, value function V(s) and planner, run for the PLAYER's team without any command
   authority: it only explains the Overseer's proposals ("win chance 54 % -> 61 %: expanding now"). Plain data in G.sw.adv. */
function aiAdvisorMake(team){
  const P=typeof AI_PARAMS!=='undefined'?AI_PARAMS:{},tier=Object.assign({},aiTierCfg('master'),{plan:{sims:96,K:2,slices:1,c:1.5,lam:0.5}});
  const u=aiThetaFor({theta:P.theta0},FACTIONS[G.teams[team].faction].style);
  const ai={kind:'adv',team,enemy:1-team,tier:'advisor',cfg:tier,th:thetaDecode(u),delay:0.3,mem:{u:{},b:{},camps:{},armySeenT:-99,heroLvl:0,heroT:-99,eraSeen:1},
    bel:{s:new Float32Array(BN),a:new Float64Array(BN),t:0},ph:{vis:new Float32Array(BN),dem:new Float32Array(BN),def:new Float32Array(BN)},
    mil:'hold',thrV:0,V:0.5,har:{ids:[]},scout:{id:0},q:null,qN:null,t:-99,
    pl:{a:-1,w:0,K:2,N:[],W:[],P:[],root:null,est:null,t0:0,n:0,rs:(G.seed*2246822519+team*31+5)>>>0}};
  aiBeliefInit(ai);return ai;
}
function aiAdvise(ai){
  const R={},now=G.time;aiOwn(ai,R);if(!R.B.length)return;aiObserve(ai,R);aiBelief(ai,R);
  ai.V=aiValue(ai,R);
  const army=R.army,own=aiStacksOf(army,ai.team),recs=aiEnemyRecs(ai,90,true),known=aiArmyVal(recs),myVal=aiArmyVal(army.map(u=>({type:u.type,hp:u.hp,mhp:u.maxhp})));
  const en=aiStacksOf(recs,ai.team),stale=Math.min(1,Math.max(0,now-ai.mem.armySeenT)/90),prior=ai.th.prior*myVal*(0.4+0.6*stale);
  if(prior>known+50){const s=cmbStackOf('rifleman',(prior-known)/50,{wl:G.teams[ai.team].wl,al:G.teams[ai.team].al});s.cost=50;en.push(s);}
  const thr=aiThreat(ai,R);ai.thrV=aiArmyVal(thr.map(u=>({type:u.type,hp:u.hp,mhp:u.maxhp})));
  const r=aiPlanRoot(ai,R,own,en,known,myVal,stale),pl=ai.pl;pl.t0=now;
  const C=aiPlanConf(ai),rng=()=>airand(pl),N=new Array(PL_NA).fill(0),W=new Array(PL_NA).fill(0),P=plPrior(r.s,0,C.th,C.phi);
  for(let k=0;k<pl.K;k++){const res=plSearch(plWorld(r.s,r.est,rng),C,rng,Math.round(ai.cfg.plan.sims/pl.K),Float64Array.from(P));for(let a=0;a<PL_NA;a++){N[a]+=res.N[a];W[a]+=res.W[a];}}
  ai.qN=N;ai.q=N.map((n,a)=>n>0?+(W[a]/n).toFixed(3):-1);ai.t=now;pl.n++;
}
/* the explanation of a proposal of macro-action kind k: estimated win chance without it (status quo 'grow') and with it */
function aiAdviceWhy(ai,k,verb){
  if(!ai||!ai.q)return'';const a=PL_ACTS.indexOf(k),b=PA_GROW;if(a<0||ai.q[a]<0)return'';
  const base=ai.q[b]>=0?ai.q[b]:ai.V,pa=Math.round(100*base),pb=Math.round(100*ai.q[a]);
  return'win chance '+pa+' % -> '+pb+' %: '+verb+(pb<pa?' (the planner advises against it now)':'');
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
