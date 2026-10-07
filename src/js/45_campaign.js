/* =========================================================================
   CAMPAIGN RUNTIME — headless-safe (no DOM, no audio, no wall clock, no Math.random). Contract: docs/CAMPAIGN_SPEC.md §3 + §7.
   Everything a mission can do is DATA (conditions / actions from 43_vocab.js) interpreted here, deterministically:
     • one `G.camp` object holds all mission state (flags, objectives, trigger bookkeeping, locks, event queue, result);
     • conditions are evaluated at 5 Hz (every 6th tick); malformed data never throws — it is logged once to G.camp.errors and evaluates false;
     • UI-facing effects are EVENTS: pushed to G.camp.events and delivered to onCampaignEvent(e) (76_campaign_ui.js);
     • `cine` is blocking: G.camp.hold=true until the UI calls campaignResume(id); step() in 30_systems.js does not advance while hold is set.
   Hooks called from the sim: campaignOpts (newGame), campaignInit (end of newGame), campaignStep (once per tick), campaignEnd (endGame),
   campLocked (reqBuild/reqUnit/queueEra/queueHero/orderBuild), campNoDefaultEnd (building-death rule), campNote (trained/built counters),
   campCreepKilled (camp tracking), campReveal (updateVision), campDaylight (dayNight).
   All internals live in the CR closure so no other module's names can collide; only the functions below it are global-in-the-IIFE.
   ========================================================================= */
const CR=(function(){
  const LOCKMSG='Locked in this mission',EPS=1e-6,EVAL_TICKS=6,MAX_EVENTS=300,MAX_LOG=400,MAX_ERR=200,REVEAL_SECS=8;
  let K=null;                                                   // the G.camp being served by the current entry point
  const has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  const isNum=x=>typeof x==='number'&&isFinite(x),isStr=x=>typeof x==='string'&&x.length>0,isArr=Array.isArray,isObj=x=>x!==null&&typeof x==='object'&&!isArr(x);
  const tileC=t=>(t+0.5)*TILE;
  function bad(msg){throw{campErr:msg};}                        // malformed mission data: caught at the evaluation boundary
  function short(x){let s;try{s=JSON.stringify(x);}catch(e){s=String(x);}s=String(s);return s.length>90?s.slice(0,90)+'…':s;}
  function err(where,msg){                                      // log ONCE per distinct (where,msg)
    const C=G&&G.camp;if(!C)return;const key=where+'|'+msg;if(C.errSeen[key])return;C.errSeen[key]=1;
    if(C.errors.length<MAX_ERR)C.errors.push(where+': '+msg);
  }
  function guard(where,fn){try{return fn();}catch(e){err(typeof where==='function'?where():where,e&&e.campErr!==undefined?e.campErr:'internal: '+(e&&e.message||e));return undefined;}}   // `where` may be a function (built only on error)
  function note(k,data){const e=Object.assign({t:K.t,k},data);K.log.push(e);if(K.log.length>MAX_LOG)K.log.shift();}
  function emit(type,data){
    const e=Object.assign({n:K.evSeq++,t:K.t,type},data);
    K.events.push(e);if(K.events.length>MAX_EVENTS)K.events.shift();
    if(typeof onCampaignEvent==='function'){try{onCampaignEvent(e);}catch(x){err('onCampaignEvent','threw '+(x&&x.message||x));}}
    return e;
  }

  /* ------------------------------ argument checks ------------------------------ */
  const teamOf=s=>s==='me'?0:s==='enemy'?1:bad('side must be "me" or "enemy", got '+short(s));
  const num=x=>isNum(x)?x:bad('expected a number, got '+short(x));
  const nm=x=>isStr(x)?x:bad('expected a name, got '+short(x));
  const tx=x=>isNum(x)&&x>=0&&x<MW?x:bad('tile x out of range: '+short(x));
  const ty=y=>isNum(y)&&y>=0&&y<MH?y:bad('tile y out of range: '+short(y));
  const resKey=r=>r==='c'||r==='e'?r:bad('resource must be "c" or "e", got '+short(r));
  function cmpv(op,x,y){
    if(!isNum(y))bad('expected a number to compare with, got '+short(y));
    if(!isNum(x))bad('the compared value is not a finite number');   // (messages never embed live values: errors are logged once per distinct text)
    switch(op){case'<':return x<y-EPS;case'<=':return x<=y+EPS;case'==':return Math.abs(x-y)<=EPS;case'>=':return x>=y-EPS;case'>':return x>y+EPS;case'!=':return Math.abs(x-y)>EPS;}
    return bad('unknown comparison '+short(op));
  }
  const isArmy=u=>!u.def.worker&&!u.def.noWeapon&&u.def.dmg>0;     // "army" = armed non-worker (heroes count, Menders / Freighters do not)
  const typeOK=(kind,t)=>t==='*'||(kind==='unit'?(t==='army'||t==='worker'||(isStr(t)&&has(UDEF,t))):(isStr(t)&&has(BDEF,t)));
  const unitMatch=(u,t)=>t==='*'||(t==='army'?isArmy(u):t==='worker'?!!u.def.worker:u.type===t);
  function countUnits(team,t,cx,cy,r){
    let n=0;const R=r*TILE+EPS;
    for(const u of G.units){if(u.dead||u.team!==team||!unitMatch(u,t))continue;if(cx!==undefined&&hyp(u.x-cx,u.y-cy)>R)continue;n++;}
    return n;
  }
  function countBuildings(team,t,doneOnly){let n=0;for(const b of G.buildings)if(!b.dead&&b.team===team&&(t==='*'||b.type===t)&&(!doneOnly||b.done))n++;return n;}
  const hubOf=team=>G.buildings.find(b=>!b.dead&&b.team===team&&b.type==='hub')||G.buildings.find(b=>!b.dead&&b.team===team)||null;
  function campsCleared(){let n=0;for(const c of G.camps)if(c.cleared&&c.clearedBy===0)n++;return n;}

  /* --------------------------------- conditions --------------------------------- */
  function ev(c){
    if(!isArr(c)||!isStr(c[0]))bad('condition must be [op,...], got '+short(c));
    const op=c[0],T0=G.teams[0];
    switch(op){
      case'all':for(let i=1;i<c.length;i++)if(!ev(c[i]))return false;return true;
      case'any':for(let i=1;i<c.length;i++)if(ev(c[i]))return true;return false;
      case'not':if(c.length!==2)bad('not takes exactly one condition');return!ev(c[1]);
      case'time':return cmpv(c[1],K.t,c[2]);
      case'flag':nm(c[1]);return has(K.flags,c[1])&&!!K.flags[c[1]];
      case'after':nm(c[1]);num(c[2]);return has(K.flags,c[1])&&!!K.flags[c[1]]&&K.t-K.flagT[c[1]]>=c[2]-EPS;
      case'count':{const kind=c[1];if(kind!=='unit'&&kind!=='building')bad('count kind must be unit|building');const t=teamOf(c[2]);
        if(!typeOK(kind,c[3]))bad('unknown type '+short(c[3]));return cmpv(c[4],kind==='unit'?countUnits(t,c[3]):countBuildings(t,c[3],false),c[5]);}
      case'res':return cmpv(c[2],T0[resKey(c[1])],c[3]);
      case'era':return cmpv(c[2],G.teams[teamOf(c[1])].era,c[3]);
      case'supply':return cmpv(c[2],G.teams[teamOf(c[1])].used,c[3]);
      case'hero':{const H=T0.hero;if(c[1]==='alive')return!!H.alive;if(c[1]==='dead')return!H.alive&&(H.deaths||0)>0;
        if(c[1]==='level')return cmpv(c[2],H.level,c[3]);return bad('hero needs alive|dead|level');}
      case'heroNear':{const x=tileC(tx(c[1])),y=tileC(ty(c[2])),r=num(c[3]),u=heroUnit(0);return!!u&&hyp(u.x-x,u.y-y)<=r*TILE+EPS;}
      case'kills':return cmpv(c[2],G.teams[teamOf(c[1])].kills,c[3]);
      case'lost':return cmpv(c[2],G.teams[teamOf(c[1])].lost,c[3]);
      case'structs':return cmpv(c[2],countBuildings(teamOf(c[1]),'*',false),c[3]);
      case'camps':return cmpv(c[1],campsCleared(),c[2]);
      case'unitsNear':{const t=teamOf(c[1]);if(!typeOK('unit',c[2]))bad('unknown type '+short(c[2]));
        return cmpv(c[6],countUnits(t,c[2],tileC(tx(c[3])),tileC(ty(c[4])),num(c[5])),c[7]);}
      case'built':if(!isStr(c[1])||!has(BDEF,c[1]))bad('unknown building '+short(c[1]));return cmpv(c[2],K.cnt.built[0][c[1]]||0,c[3]);
      case'trained':if(!isStr(c[1])||!has(UDEF,c[1]))bad('unknown unit '+short(c[1]));return cmpv(c[2],K.cnt.trained[0][c[1]]||0,c[3]);
      case'researched':if(!isStr(c[1])||!has(TECH,c[1]))bad('unknown tech '+short(c[1]));return(T0[TECH[c[1]].key]||0)>=1;
      case'hubs':return cmpv(c[2],countBuildings(teamOf(c[1]),'hub',true),c[3]);
      case'mined':return cmpv(c[2],resKey(c[1])==='c'?T0.minedC:T0.minedE,c[3]);
      case'trade':return cmpv(c[1],T0.tradeEarn,c[2]);
      case'obj':{nm(c[1]);if(!has(K.obj,c[1]))bad('unknown objective '+short(c[1]));if(c[2]!=='active'&&c[2]!=='done'&&c[2]!=='failed')bad('obj state must be active|done|failed');return K.obj[c[1]].state===c[2];}
      case'wave':return cmpv(c[1],G.ais[1]?G.ais[1].wave:0,c[2]);
    }
    return bad('unknown condition op "'+op+'"');
  }
  const ec=(c,where)=>guard(()=>'cond '+where+' '+short(c),()=>!!ev(c))===true;   // any malformed part -> the whole condition is false

  /* ---------------------------------- flags / objectives ---------------------------------- */
  function setFlag(name,val){
    if(val){if(!has(K.flags,name)||!K.flags[name]){K.flags[name]=true;K.flagT[name]=K.t;note('flag',{name,v:true});}}
    else if(has(K.flags,name)&&K.flags[name]){K.flags[name]=false;delete K.flagT[name];note('flag',{name,v:false});}
  }
  function setObj(o,state,init){const st=K.obj[o.id];st.state=state;st.t=K.t;emit('obj',{id:o.id,state,kind:o.kind,text:o.text,init:!!init});
    if(state==='failed'&&o.kind==='primary'&&!K.pendingLose)K.pendingLose='objective:'+o.id;}
  function updObjectives(){
    for(const o of K.objs){
      const st=K.obj[o.id];if(st.state==='done'||st.state==='failed')continue;
      if(st.state==='hidden'){
        if(o.when&&ec(o.when,'objective '+o.id+'.when'))setObj(o,'active');
        else if(o.kind==='hidden'&&ec(o.done,'objective '+o.id+'.done')){setObj(o,'done');continue;}   // a secret objective reveals itself by being completed
        else continue;
      }
      if(ec(o.done,'objective '+o.id+'.done'))setObj(o,'done');
      else if(o.fail&&ec(o.fail,'objective '+o.id+'.fail'))setObj(o,'failed');
    }
  }

  /* ----------------------------------- placing units ----------------------------------- */
  function placeNear(cx,cy,r0,r1,flying){
    const ref=G.refComp&&G.refComp[0];
    for(let k=0;k<30;k++){
      const a=G.rng()*TAU,r=r0+G.rng()*(r1-r0),x=clamp(cx+Math.cos(a)*r,24,WW-24),y=clamp(cy+Math.sin(a)*r,24,WH-24);
      if(flying)return{x,y};
      if(!canStand(x,y))continue;
      if(ref&&G.comp&&G.comp[tileOf(x,y)]!==ref)continue;       // never drop ground units into a sealed-off pocket
      return{x,y};
    }
    const f=nearestFree(clamp(cx/TILE|0,0,MW-1),clamp(cy/TILE|0,0,MH-1),12);
    return f?{x:tileC(f[0]),y:tileC(f[1])}:{x:cx,y:cy};
  }
  function anchorFor(where,team,n){
    const spread=60+Math.sqrt(n)*26;
    if(where==='base'){const h=hubOf(team);if(!h)bad('side has no building to spawn at');const half=Math.max(h.w,h.h)*TILE/2;return{cx:h.x,cy:h.y,r0:half+28,r1:half+28+spread,tx:h.tx,ty:h.ty};}
    if(isArr(where)&&where.length===2)return{cx:tileC(tx(where[0])),cy:tileC(ty(where[1])),r0:0,r1:spread,tx:where[0],ty:where[1]};
    if(typeof where==='string'&&/^edge:[NESW]$/.test(where)){
      const e=where[5],cx=(e==='N'||e==='S')?WW/2:(e==='W'?3.5*TILE:WW-3.5*TILE),cy=(e==='W'||e==='E')?WH/2:(e==='N'?3.5*TILE:WH-3.5*TILE);
      return{cx,cy,r0:0,r1:spread,tx:Math.round(cx/TILE-0.5),ty:Math.round(cy/TILE-0.5)};}
    return bad('bad spawn location '+short(where));
  }
  function workerToCrystal(u,team){
    const h=hubOf(team);if(!h)return;
    const r=nearestRes(h.x,h.y,'crystal',true,700)||nearestRes(h.x,h.y,'crystal',false,700);
    if(r)setOrder(u,{t:'gather',res:r,st:'go',hx:r.x,hy:r.y});
  }
  /* create n units of `type` for `team` around an anchor; order: 'idle' (default) | 'hold' | 'attack' (attack-move on the opposing hub, like an AI wave) */
  function makeUnits(team,type,n,anc,order){
    const d=UDEF[type],out=[];
    for(let i=0;i<n;i++){const p=placeNear(anc.cx,anc.cy,anc.r0,anc.r1,d.flying),u=addUnit(type,team,p.x,p.y);
      if(team===0&&G.sw&&G.sw.on&&G.sw.pol.autoEnroll&&!d.hero)agEnroll(u,true);     // same rule as spawnUnit
      out.push(u);}
    if(order==='hold')for(const u of out)setOrder(u,{t:'hold'});
    else if(order==='attack'){
      const foe=hubOf(1-team)||nearestEnemyBuilding(anc.cx,anc.cy,team);
      let slow=1e9;for(const u of out)if(u.def.speed<slow)slow=u.def.speed;
      if(foe)for(const u of out){if(u.def.worker||u.def.noWeapon)setOrder(u,{t:'move',x:foe.x,y:foe.y,gs:0});else setOrder(u,{t:'attackmove',x:foe.x,y:foe.y,gs:slow<1e9?slow*1.12:0});}}
    else for(const u of out)if(u.def.worker)workerToCrystal(u,team);
    return out;
  }
  function checkUnitSpec(type,n,allowHero){
    if(!isStr(type)||!has(UDEF,type))bad('unknown unit type '+short(type));
    const d=UDEF[type];if(d.creep)bad('creep units cannot be given to a side: '+type);
    if(d.hero&&!allowHero)bad('hero units are not placed by unit lists: '+type);
    if(!isNum(n)||n<1)bad('unit count must be >= 1, got '+short(n));
    return Math.min(60,Math.floor(n));
  }

  /* ------------------------------------- setup ------------------------------------- */
  function startBuildings(team,list,where){
    for(const b of list){
      guard(where+' building '+short(b),()=>{
        if(!isObj(b)||!isStr(b.type)||!has(BDEF,b.type))bad('unknown building type');
        tx(b.tx);ty(b.ty);
        if(!canPlace(team,b.type,b.tx,b.ty,true)||footprintBusy({tx:b.tx,ty:b.ty,w:BDEF[b.type].w,h:BDEF[b.type].h},null))bad('cannot place '+b.type+' at ('+b.tx+','+b.ty+') on this map');
        addBuilding(b.type,team,b.tx,b.ty,true);});
    }
  }
  function startUnits(team,list,where){
    for(const e of list){
      guard(where+' units '+short(e),()=>{
        if(!isObj(e))bad('entry must be {type,n}');
        const n=checkUnitSpec(e.type,e.n,false),h=hubOf(team);if(!h)bad('no building to place units at');
        const half=Math.max(h.w,h.h)*TILE/2;
        makeUnits(team,e.type,n,{cx:h.x,cy:h.y,r0:half+24,r1:half+24+70+Math.sqrt(n)*26},'idle');});
    }
  }
  function applyMods(mods,where){
    const ai=G.ais[1];if(!ai||!K.aiBase)return;                    // foe.ai:false -> nothing to tune
    if(!isObj(mods))return bad('aimod needs an object');
    const B=K.aiBase,P=ai.P;
    for(const k in mods){
      const v=mods[k];
      guard(where+'.'+k,()=>{
        switch(k){
          case'waveMult':{const m=clamp(num(v),0.05,20);P.base=B.base*m;P.step=B.step*m;K.aiMods.waveMult=v;break;}
          case'intervalMult':{const m=clamp(num(v),0.05,20);P.iv=B.iv*m;K.aiMods.intervalMult=v;break;}
          case'firstWave':P.first=Math.max(0,num(v));K.aiMods.firstWave=v;break;
          case'hero':if(typeof v!=='boolean')bad('hero must be true|false');P.hero=v;K.aiMods.hero=v;break;
          case'air':if(typeof v!=='boolean')bad('air must be true|false');P.air=v;K.aiMods.air=v;break;
          default:bad('unknown aimod key "'+k+'" (waveMult|intervalMult|firstWave|hero|air)');}});
    }
  }
  function applySetup(m,opts){
    const s=isObj(m.setup)?m.setup:{},T0=G.teams[0],T1=G.teams[1];
    /* 0. map seed sanity: the mission's geography is part of its design */
    if(Number.isInteger(s.seed)){const base=G.seed-((G.mapAttempts||1)-1)*131;if(base!==s.seed)err('setup','map seed '+base+' differs from setup.seed '+s.seed+' (scripted tiles assume the setup seed)');}
    /* 1. difficulty (opts.diff wins over setup.diff) */
    guard('setup.diff',()=>{const want=opts.diff||s.diff;
      if(want!==undefined&&!has(DIFF,want))bad('unknown difficulty '+short(want));
      if(want&&want!==G.diff){G.diff=want;if(G.ais[1])G.ais[1]=makeAI(1,DIFF[want]);if(G.ais[0])G.ais[0]=makeAI(0,DIFF[want]);}});
    /* 2. initial flags */
    if(isObj(s.flags))for(const k in s.flags)if(s.flags[k])setFlag(k,true);
    /* 3. player start: resources, era, hero policy */
    const st=isObj(s.start)?s.start:{};
    guard('setup.start.c',()=>{if(st.c!==undefined)T0.c=Math.max(0,num(st.c));});
    guard('setup.start.e',()=>{if(st.e!==undefined)T0.e=Math.max(0,num(st.e));});
    guard('setup.start.era',()=>{if(st.era!==undefined){if(![1,2,3].includes(st.era))bad('start.era must be 1..3');T0.era=st.era;}});
    /* 4. extra buildings FIRST (so no unit is ever dropped inside a footprint), 5. hero policy, 6. extra start units, 7. supply bonus */
    if(isArr(st.buildings))startBuildings(0,st.buildings,'setup.start');
    guard('setup.start.hero',()=>{
      const pol=st.hero===undefined?'available':st.hero;if(!['none','available','start'].includes(pol))bad('start.hero must be none|available|start');
      K.heroPolicy=pol==='none'?'none':'available';
      if(pol==='start'){const h=hubOf(0),id=FACTIONS[T0.faction].hero;if(!h)bad('no hub to start the hero at');const p=spawnPoint(h,UDEF[id]);addUnit(id,0,p.x,p.y);}});
    if(isArr(st.units))startUnits(0,st.units,'setup.start');
    guard('setup.start.supplyBonus',()=>{if(st.supplyBonus!==undefined)K.supplyBonus=clamp(num(st.supplyBonus),0,200);});
    /* 8. restrictions */
    const rs=isObj(s.restrict)?s.restrict:{};
    for(const b of isArr(rs.buildings)?rs.buildings:[])guard('setup.restrict.buildings',()=>{if(isStr(b)&&has(BDEF,b))K.locks.building[b]=true;else bad('unknown restricted building '+short(b));});
    for(const u of isArr(rs.units)?rs.units:[])guard('setup.restrict.units',()=>{if(isStr(u)&&has(UDEF,u))K.locks.unit[u]=true;else bad('unknown restricted unit '+short(u));});
    guard('setup.restrict.maxEra',()=>{if(rs.maxEra!==undefined){if(![1,2,3].includes(rs.maxEra))bad('restrict.maxEra must be 1..3');K.maxEra=rs.maxEra;}});
    /* 9. the enemy side: start, AI on/off, AI tuning */
    const foe=isObj(s.foe)?s.foe:{},fs=isObj(foe.start)?foe.start:{};
    guard('setup.foe.start.c',()=>{if(fs.c!==undefined)T1.c=Math.max(0,num(fs.c));});
    guard('setup.foe.start.e',()=>{if(fs.e!==undefined)T1.e=Math.max(0,num(fs.e));});
    guard('setup.foe.start.era',()=>{if(fs.era!==undefined){if(![1,2,3].includes(fs.era))bad('foe.start.era must be 1..3');T1.era=fs.era;}});
    if(isArr(fs.buildings))startBuildings(1,fs.buildings,'setup.foe.start');
    if(isArr(fs.units))startUnits(1,fs.units,'setup.foe.start');
    if(foe.ai===false)G.ais[1]=null;
    K.aiBase=G.ais[1]?Object.assign({},G.ais[1].P):null;
    if(foe.mods!==undefined)guard('setup.foe.mods',()=>applyMods(foe.mods,'setup.foe.mods'));
    /* 10. swarm (Overseer) layer: 'off' is the inert v2 behaviour; an unspecified value is 'off' so campaign play never depends on the player's settings */
    if(G.sw){const on=s.swarm==='on';if(s.swarm!==undefined&&s.swarm!=='on'&&s.swarm!=='off')err('setup.swarm','must be "on" or "off", got '+short(s.swarm));
      G.sw.on=on&&!G.ais[0];}
    /* 11. daylight */
    if(s.daylight!==undefined&&!['cycle','night','day'].includes(s.daylight))err('setup.daylight','must be cycle|night|day, got '+short(s.daylight));
    else K.daylight=s.daylight||'cycle';
    /* finish: derived state (supply, blocked tiles, fog) */
    recalcTeams();for(let i=0;i<3;i++)updateVision();
    if(K.daylight!=='cycle')dayNight();
  }

  /* ------------------------------------- init / step / end ------------------------------------- */
  function init(m,opts){
    opts=opts||{};
    const C=G.camp={m:isObj(m)?m:{},id:isObj(m)?m.id:undefined,flags:{},flagT:{},obj:{},fired:{},fireT:{},t:0,t0:G.time,tick:0,events:[],evSeq:1,log:[],radio:[],errors:[],errSeen:{},
      hold:false,pendingCine:null,cineQ:[],autoResume:!!opts.autoResume,result:null,endReason:null,pendingLose:null,mood:'calm',
      locks:{building:{},unit:{}},maxEra:3,heroPolicy:'available',supplyBonus:0,daylight:'cycle',reveals:[],aiBase:null,aiMods:{},
      cnt:{built:[{},{},{}],trained:[{},{},{}]},trig:[],objs:[]};
    K=C;
    if(!isObj(m))err('mission','mission data must be an object, got '+short(m));
    /* objectives: valid ones only; ids are unique */
    for(const o of isArr(C.m.objectives)?C.m.objectives:[]){
      if(!isObj(o)||!isStr(o.id)){err('objectives','entry without an id: '+short(o));continue;}
      if(has(C.obj,o.id)){err('objectives','duplicate id '+o.id);continue;}
      if(!['primary','bonus','hidden'].includes(o.kind))err('objectives',o.id+': kind must be primary|bonus|hidden, got '+short(o.kind));
      C.objs.push(o);C.obj[o.id]={state:(o.when||o.kind==='hidden')?'hidden':'active',kind:o.kind,t:0};}
    applySetup(C.m,opts);
    for(const o of C.objs)if(C.obj[o.id].state==='active')emit('obj',{id:o.id,state:'active',kind:o.kind,text:o.text,init:true});
    note('init',{id:C.id});
    return C;
  }
  function wipeout(){return countBuildings(0,'hub',false)===0&&countUnits(0,'army')===0&&countUnits(0,'worker')===0;}
  function finish(res,reason){if(G.over)return;K.endReason=reason;endGame(res);}
  function runTriggers(){
    const list=K.m.triggers;if(!isArr(list))return;
    for(let i=0;i<list.length;i++){
      if(G.over)break;
      const T=list[i];if(!isObj(T)||!isArr(T.do)){err('trigger #'+i,'needs {when,do:[...]}');continue;}
      const id=isStr(T.id)?T.id:'#'+i,S=K.trig[i]||(K.trig[i]={n:0,due:-1,last:-1e9});
      const every=isNum(T.every)&&T.every>0?T.every:0,once=T.once!==undefined?!!T.once:!every;
      if(once&&S.n>0)continue;
      if(S.due<0){
        if(S.n>0&&every&&K.t<S.last+every-EPS)continue;
        if(!ec(T.when,'trigger '+id+'.when'))continue;
        S.due=K.t+(isNum(T.delay)&&T.delay>0?T.delay:0);}
      if(K.t>=S.due-EPS){
        S.due=-1;S.n++;S.last=K.t;K.fired[id]=S.n;K.fireT[id]=K.t;note('trigger',{id,n:S.n});
        runActions(T.do,'trigger '+id);}
    }
  }
  function evalAll(){
    updObjectives();
    runTriggers();
    if(G.over)return;
    updObjectives();
    const m=K.m;
    if(m.win&&ec(m.win,'win')){finish('victory','win');return;}
    if(m.lose&&ec(m.lose,'lose')){finish('defeat','lose');return;}
    if(K.pendingLose){finish('defeat',K.pendingLose);return;}
    if(!m.noDefaultLose&&wipeout())finish('defeat','wipeout');
  }
  function step(dt){
    K=G.camp;if(!K||K.result||G.over||K.hold)return;
    K.tick++;K.t=G.time-K.t0;
    if(K.tick%EVAL_TICKS!==0)return;
    guard('eval',evalAll);
  }
  function end(res){
    K=G.camp;if(!K||K.result)return;
    const win=res==='victory',t=G.time-K.t0,par=K.m.stars&&K.m.stars.par;
    const bonus=K.objs.filter(o=>o.kind==='bonus'),bonusDone=bonus.filter(o=>K.obj[o.id].state==='done').length;
    let stars=0;if(win){stars=1;if(bonusDone===bonus.length)stars++;if(isNum(par)&&t<=par+EPS)stars++;}
    let reason=K.endReason;
    if(!reason)reason=win?'structures':(countBuildings(0,'*',false)===0?'structures':'surrender');
    K.t=t;
    K.result={res,win,reason,t,stars,diff:G.diff,par:isNum(par)?par:null,bonusDone,bonusTotal:bonus.length,
      objectives:K.objs.filter(o=>K.obj[o.id].state!=='hidden').map(o=>({id:o.id,kind:o.kind,text:o.text,state:K.obj[o.id].state}))};
    note('end',{res,reason,stars});
    emit('end',{res,reason,stars,t});
  }

  /* -------------------------------------- actions -------------------------------------- */
  function runActions(list,where){
    for(const a of list)guard(()=>'action '+where+' '+short(a),()=>act(a));
  }
  function act(a){
    if(!isArr(a)||!isStr(a[0]))bad('action must be [op,...], got '+short(a));
    const op=a[0],T0=G.teams[0];
    switch(op){
      case'radio':{nm(a[1]);K.radio.push({id:a[1],t:K.t});if(K.radio.length>200)K.radio.shift();emit('radio',{id:a[1]});break;}
      case'cine':{nm(a[1]);
        if(!(typeof STORY!=='undefined'&&STORY&&STORY.cine&&has(STORY.cine,a[1])))bad('unknown cinematic '+short(a[1]));
        if(K.autoResume){note('cine',{id:a[1],auto:true});emit('cine',{id:a[1],hold:false});break;}
        K.cineQ.push(a[1]);
        if(K.cineQ.length===1){K.hold=true;K.pendingCine=a[1];note('cine',{id:a[1]});emit('cine',{id:a[1],hold:true});}
        break;}
      case'obj':{nm(a[1]);if(!has(K.obj,a[1]))bad('unknown objective '+short(a[1]));
        const o=K.objs.find(x=>x.id===a[1]),st=K.obj[a[1]];
        if(a[2]==='show'){if(st.state==='hidden')setObj(o,'active');}
        else if(a[2]==='done'){if(st.state==='hidden'||st.state==='active')setObj(o,'done');}
        else if(a[2]==='fail'){if(st.state==='hidden'||st.state==='active')setObj(o,'failed');}
        else bad('obj action must be show|done|fail');
        break;}
      case'flag':{nm(a[1]);if(typeof a[2]!=='boolean')bad('flag value must be true|false');setFlag(a[1],a[2]);break;}
      case'spawn':{
        const team=teamOf(a[1]),n=checkUnitSpec(a[2],a[3],true),type=a[2],d=UDEF[type],cnt=n;
        const order=isObj(a[5])&&a[5].order!==undefined?a[5].order:'idle';
        if(!['attack','idle','hold'].includes(order))bad('spawn order must be attack|idle|hold');
        const anc=anchorFor(a[4],team,cnt);
        let amount=cnt;
        if(d.hero){const H=G.teams[team].hero;if(d.faction!==G.teams[team].faction)bad('hero '+type+' does not belong to that side\'s faction');if(H.alive||H.reviving)bad('that side already has its hero in play');amount=1;}
        makeUnits(team,type,amount,anc,order);
        G.fx.push({x:anc.cx,y:anc.cy,t:0,max:0.7,kind:'ring',r:60,col:G.teams[team].pal.glow});
        emit('spawn',{side:a[1],utype:type,n:amount,tx:anc.tx,ty:anc.ty,where:a[4],order});
        break;}
      case'give':case'take':{const r=resKey(a[1]),n=num(a[2]);if(n<0)bad(op+' amount must be >= 0');
        if(op==='give')T0[r]+=n;else T0[r]=Math.max(0,T0[r]-n);emit('res',{res:r,delta:op==='give'?n:-n});break;}
      case'reveal':{const x=tx(a[1]),y=ty(a[2]),r=num(a[3]);if(r<=0)bad('reveal radius must be > 0');const dur=a[4]===undefined?REVEAL_SECS:num(a[4]);
        K.reveals.push({x:tileC(x),y:tileC(y),r:r*TILE,until:K.t+dur});updateVision();emit('reveal',{tx:x,ty:y,r});break;}
      case'ping':{const x=tx(a[1]),y=ty(a[2]),k=a[3];if(k!=='good'&&k!=='bad'&&k!=='info')bad('ping kind must be good|bad|info');
        G.fx.push({x:tileC(x),y:tileC(y),t:0,max:1.1,kind:'ping',col:k==='good'?'#7dffa8':k==='bad'?'#ff6a5a':'#7cc4ff'});emit('ping',{tx:x,ty:y,kind:k});break;}
      case'aimod':applyMods(a[1],'aimod');break;
      case'strike':{const x=tx(a[1]),y=ty(a[2]),r=num(a[3]),dmg=num(a[4]),delay=num(a[5]);
        if(r<=0||dmg<0||delay<0)bad('strike needs r > 0, dmg >= 0, delay >= 0');
        const sfxName=a[6]===undefined||a[6]===null?'alert':(isStr(a[6])?a[6]:bad('strike sfx must be a name')),sideRef=a[7]===undefined?'enemy':a[7],team=teamOf(sideRef);
        const px=tileC(x),py=tileC(y);
        G.zones.push({type:'orbital',x:px,y:py,r:r*TILE,t:0,max:Math.max(0.1,delay),team,dmg,sdmg:Math.round(dmg*1.25),fired:false});
        G.fx.push({x:px,y:py,t:0,max:0.9,kind:'ring',r:r*TILE,col:'#ff6a4a'});
        sfx(sfxName,px,py);
        emit('strike',{tx:x,ty:y,r,dmg,delay,side:sideRef});break;}
      case'mood':{if(!MOODS.includes(a[1]))bad('unknown mood '+short(a[1]));K.mood=a[1];emit('mood',{mood:a[1]});break;}
      case'win':finish('victory','win');break;
      case'lose':finish('defeat',isStr(a[1])?a[1]:bad('lose needs a reason id'));break;
      case'unlock':case'lock':{
        const kind=a[1],id=a[2],lockIt=op==='lock';
        if(kind==='building'){if(!isStr(id)||!has(BDEF,id))bad('unknown building '+short(id));if(lockIt)K.locks.building[id]=true;else delete K.locks.building[id];}
        else if(kind==='unit'){if(!isStr(id)||!has(UDEF,id))bad('unknown unit '+short(id));
          if(lockIt)K.locks.unit[id]=true;else delete K.locks.unit[id];
          if(UDEF[id].hero&&id===FACTIONS[T0.faction].hero)K.heroPolicy=lockIt?'none':'available';}
        else if(kind==='era'){if(id!==2&&id!==3)bad('era must be 2 or 3');K.maxEra=lockIt?Math.min(K.maxEra,id-1):Math.max(K.maxEra,id);}
        else bad('lock kind must be building|unit|era');
        emit('unlock',{kind,id,locked:lockIt});uiDirty();break;}
      case'herolevel':{const n=Math.floor(num(a[1]));if(n<1||n>HERO_MAXLVL)bad('hero level must be 1..'+HERO_MAXLVL);
        const H=T0.hero;if(n>H.level){H.level=n;H.xp=Math.max(H.xp,HERO_LVL_XP[n]);
          const u=heroUnit(0);if(u){heroApply(u,false);u.mana=heroMaxMana(u);G.fx.push({x:u.x,y:u.y,t:0,max:1.1,kind:'levelup',r:60});}}
        emit('herolevel',{level:H.level});uiDirty();break;}
      case'heal':{const t=teamOf(a[1]),x=tileC(tx(a[2])),y=tileC(ty(a[3])),r=num(a[4])*TILE;
        for(const u of G.units)if(!u.dead&&u.team===t&&hyp(u.x-x,u.y-y)<=r){u.hp=u.maxhp;u.healFx=0.6;}
        for(const b of G.buildings)if(!b.dead&&b.team===t&&rectDist(x,y,b)<=r){b.hp=b.maxhp;b.ghostHp=b.maxhp;}
        G.fx.push({x,y,t:0,max:0.9,kind:'ring',r,col:'#8affc0'});sfx('heal',x,y);break;}
      default:bad('unknown action op "'+op+'"');
    }
  }
  function resume(id){
    const C=G&&G.camp;if(!C||!C.hold)return false;K=C;
    if(id!==undefined&&id!==null&&id!==C.pendingCine)return false;       // a stale / wrong resume is ignored
    const done=C.cineQ.shift();note('cine-end',{id:done});
    if(C.cineQ.length){C.pendingCine=C.cineQ[0];emit('cine',{id:C.pendingCine,hold:true});}
    else{C.hold=false;C.pendingCine=null;}
    return true;
  }

  /* ----------------------------------- sim hooks / queries ----------------------------------- */
  function locked(team,kind,id){
    const C=G&&G.camp;if(!C||team!==0)return null;                         // restrictions bind the player's side only
    if(kind==='building')return C.locks.building[id]?LOCKMSG:null;
    if(kind==='unit')return C.locks.unit[id]?LOCKMSG:null;
    if(kind==='era')return id>C.maxEra?LOCKMSG:null;
    if(kind==='hero')return(C.heroPolicy==='none'||C.locks.unit[FACTIONS[G.teams[0].faction].hero])?LOCKMSG:null;
    return null;
  }
  function objectives(all){
    const C=G&&G.camp;if(!C)return[];
    return C.objs.filter(o=>all||C.obj[o.id].state!=='hidden').map(o=>({id:o.id,text:o.text,kind:o.kind,state:C.obj[o.id].state,t:C.obj[o.id].t}));
  }
  function summary(){
    const C=G&&G.camp;if(!C)return null;
    return{id:C.id,title:C.m.title,t:C.t,hold:C.hold,pendingCine:C.pendingCine,mood:C.mood,over:!!G.over,result:C.result?JSON.parse(JSON.stringify(C.result)):null,
      flags:Object.assign({},C.flags),objectives:objectives(true),fired:Object.assign({},C.fired),
      locks:{buildings:Object.keys(C.locks.building),units:Object.keys(C.locks.unit),maxEra:C.maxEra,hero:C.heroPolicy},supplyBonus:C.supplyBonus,daylight:C.daylight,
      aiMods:Object.assign({},C.aiMods),campsCleared:(G.camps?G.camps.filter(c=>c.cleared&&c.clearedBy===0).length:0),
      built:Object.assign({},C.cnt.built[0]),trained:Object.assign({},C.cnt.trained[0]),errors:C.errors.slice(),events:C.events.length};
  }
  return{init,step,end,resume,locked,objectives,summary,
    evalCond:c=>{K=G&&G.camp;if(!K)return false;return ec(c,'api');},
    doAction:a=>{K=G&&G.camp;if(!K)return false;let ok=false;guard(()=>'action api '+short(a),()=>{act(a);ok=true;});return ok;},
    noDefaultEnd:team=>{const C=G&&G.camp;if(!C||!C.m)return false;return team===0?!!C.m.noDefaultLose:team===1?!!C.m.noDefaultWin:false;},
    note:(kind,team,id)=>{const C=G.camp;if(!C||!C.cnt[kind]||team>2)return;const o=C.cnt[kind][team];o[id]=(o[id]||0)+1;},
    creepKilled:(e,by)=>{const cp=G.camps[e.camp];if(!cp||cp.cleared)return;
      for(const id of cp.units){const z=G.units.find(q=>q.id===id);if(z&&!z.dead)return;}
      cp.cleared=true;cp.clearedBy=by===undefined?-1:by;cp.clearT=G.time;},
    reveal:()=>{const C=G.camp;if(!C||!C.reveals.length)return;
      C.reveals=C.reveals.filter(r=>r.until>C.t-EPS);
      const v=G.vis[0];
      for(const r of C.reveals){const tr=r.r/TILE,cx=r.x/TILE,cy=r.y/TILE,x0=Math.max(0,Math.floor(cx-tr)),x1=Math.min(MW-1,Math.ceil(cx+tr)),y0=Math.max(0,Math.floor(cy-tr)),y1=Math.min(MH-1,Math.ceil(cy+tr)),r2=tr*tr;
        for(let yy=y0;yy<=y1;yy++)for(let xx=x0;xx<=x1;xx++){const dx=xx+.5-cx,dy=yy+.5-cy;if(dx*dx+dy*dy<=r2)v[yy*MW+xx]=2;}}},
    daylight:()=>{const C=G.camp;if(!C)return;
      if(C.daylight==='day'){G.daylight=1;G.sightMul=1;}else if(C.daylight==='night'){G.daylight=0;G.sightMul=lerp(0.62,1,0);}}};
})();

/* ---------------------------- hooks called by the simulation ---------------------------- */
function campaignInit(m,opts){return CR.init(m,opts);}
function campaignStep(dt){CR.step(dt);}
function campaignEnd(res){CR.end(res);}
function campLocked(team,kind,id){return CR.locked(team,kind,id);}
function campNoDefaultEnd(team){return CR.noDefaultEnd(team);}
function campNote(kind,team,id){CR.note(kind,team,id);}                 // kind 'trained' (spawnUnit) | 'built' (construction finished)
function campCreepKilled(e,by){CR.creepKilled(e,by);}                    // from kill(): a creep with e.camp>=0 died
function campReveal(){CR.reveal();}                                      // from updateVision(): applies `reveal` actions to the player's fog
function campDaylight(){CR.daylight();}                                  // from dayNight(): daylight 'day' / 'night' override
/* newGame(opts) calls this first when opts.campaign is set: seed / faction / enemy / diff default to the mission's setup (explicit opts win) */
function campaignOpts(o){
  const m=o&&o.campaign,s=m&&typeof m.setup==='object'&&m.setup?m.setup:{},r=Object.assign({},o);
  if(r.seed===undefined&&Number.isInteger(s.seed))r.seed=s.seed;
  if(!r.faction&&FACTION_IDS.includes(s.faction))r.faction=s.faction;
  if((!r.enemy||r.enemy==='random')&&FACTION_IDS.includes(s.enemy))r.enemy=s.enemy;
  if(!r.diff&&Object.prototype.hasOwnProperty.call(DIFF,s.diff))r.diff=s.diff;
  return r;
}

/* ------------------------------ API for the UI, tools and tests ------------------------------ */
/* cinematic protocol: the UI plays the cinematic named in the 'cine' event, then calls campaignResume(id). Returns true if it resumed. */
function campaignResume(id){return CR.resume(id);}
function campaignDrainEvents(){const C=G&&G.camp;if(!C)return[];const e=C.events;C.events=[];return e;}
function campaignSummary(){return CR.summary();}
function campObjectives(all){return CR.objectives(all);}                  // [{id,text,kind,state,t}] visible objectives (all=true: also the not-yet-revealed ones)
function campEvalCond(c){return CR.evalCond(c);}                          // evaluate a COND against the live game (tools, tests, UI hints)
function campDo(a){return CR.doAction(a);}                                // run ONE action now (tests, debug)

/* ------------------------------- progress save (pure helpers) ------------------------------- */
/* localStorage[CAMP_SAVEKEY]={v:1,done:{m01:{stars:2,best:812,diff:'normal'}},seen:{cineId:true},last:'m03',diff:'normal'} — see docs/CAMPAIGN_SPEC.md §7.5 */
function emptyCampaignSave(){return{v:1,done:{},seen:{},last:null,diff:'normal'};}
function campaignSaveSanitize(raw){                                      // total: any input -> a valid save object (corrupt parts are dropped, never thrown on)
  const s=emptyCampaignSave();
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.v!==1)return s;
  const idOK=x=>typeof x==='string'&&/^[A-Za-z0-9_\-]{1,48}$/.test(x),dOK=x=>typeof x==='string'&&Object.prototype.hasOwnProperty.call(DIFF,x);
  if(raw.done&&typeof raw.done==='object'&&!Array.isArray(raw.done))for(const k of Object.keys(raw.done)){
    const e=raw.done[k];if(!idOK(k)||!e||typeof e!=='object')continue;
    const stars=typeof e.stars==='number'&&isFinite(e.stars)?Math.max(0,Math.min(3,Math.floor(e.stars))):0;
    s.done[k]={stars,best:typeof e.best==='number'&&isFinite(e.best)&&e.best>=0?Math.round(e.best):null,diff:dOK(e.diff)?e.diff:'normal'};}
  if(raw.seen&&typeof raw.seen==='object'&&!Array.isArray(raw.seen))for(const k of Object.keys(raw.seen))if(idOK(k)&&raw.seen[k])s.seen[k]=true;
  if(idOK(raw.last))s.last=raw.last;
  if(dOK(raw.diff))s.diff=raw.diff;
  return s;
}
function campaignNextId(missionId,story){
  const ms=((story||STORY).missions)||[],i=ms.findIndex(m=>m&&m.id===missionId);if(i<0)return null;
  const n=ms[i].unlocks&&ms[i].unlocks.next;
  if(typeof n==='string'&&n)return n;
  return ms[i+1]?ms[i+1].id:null;
}
/* returns the NEW save after a finished mission (the input is never mutated). Defeats change nothing. A victory: stars max-merge, best time = minimum,
   the difficulty of the best-starred run is kept, and the next mission is unlocked (save.last = furthest unlocked mission). */
function campaignSaveUpdate(save,missionId,result,story){
  const s=campaignSaveSanitize(save);
  if(typeof missionId!=='string'||!missionId||!result||typeof result!=='object'||!(result.res==='victory'||result.win===true))return s;
  const prev=s.done[missionId],stars=Math.max(1,Math.min(3,Math.floor(Number(result.stars))||1)),t=Number(result.t),tt=isFinite(t)&&t>=0?Math.round(t):null;
  const diff=typeof result.diff==='string'&&Object.prototype.hasOwnProperty.call(DIFF,result.diff)?result.diff:s.diff;
  const best=prev&&prev.best!==null?(tt!==null?Math.min(prev.best,tt):prev.best):tt;
  s.done[missionId]={stars:Math.max(prev?prev.stars:0,stars),best,diff:(!prev||stars>prev.stars)?diff:prev.diff};
  const ms=((story||STORY).missions)||[],idx=id=>ms.findIndex(m=>m&&m.id===id),nxt=campaignNextId(missionId,story);
  if(nxt){if(s.last===null||idx(nxt)>idx(s.last)||idx(s.last)<0)s.last=nxt;}
  else if(s.last===null||idx(missionId)>idx(s.last))s.last=missionId;
  return s;
}
function campaignCanPlay(save,missionId,story){
  const s=campaignSaveSanitize(save),ms=((story||STORY).missions)||[],i=ms.findIndex(m=>m&&m.id===missionId);
  if(i<0)return false;
  if(i===0||s.done[missionId]||s.last===missionId)return true;
  return!!s.done[ms[i-1].id];
}
function campaignSaveRead(store){try{const raw=(store||localStorage).getItem(CAMP_SAVEKEY);return raw?campaignSaveSanitize(JSON.parse(raw)):emptyCampaignSave();}catch(e){return emptyCampaignSave();}}
function campaignSaveWrite(save,store){try{(store||localStorage).setItem(CAMP_SAVEKEY,JSON.stringify(campaignSaveSanitize(save)));return true;}catch(e){return false;}}
