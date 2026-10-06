/* =========================================================================
   AGENTS (v3) — per-unit autonomy.
   Every unit can be "enrolled" as an agent.  An enrolled agent carries a role
   (what it is meant to do), a directive (where / on what), a wallet, a skill
   level and gear.  A small brain (run ~3x per second per agent) turns the
   role into ordinary v2 orders, so pathing, combat, mining and building all
   keep their proven behaviour — the brain only decides *what to do next*.
   Reactive layer first (flee / clinic / gear), then the role's task layer.
   ========================================================================= */
let AGI=false;                               // true while the brain itself is issuing orders
function agDo(f){const p=AGI;AGI=true;try{return f();}finally{AGI=p;}}
function agSet(u,o,q){return agDo(()=>setOrder(u,o,q));}
function byId(id){
  const S=G.sw;let e=S&&S.ids.get(id);if(e&&!e.dead)return e;
  e=G.units.find(z=>z.id===id)||G.buildings.find(z=>z.id===id)||null;if(e&&S)S.ids.set(id,e);return e;}
function canRole(u,role){
  const R=ROLES[role],d=u.def;if(!R||d.hero||d.creep)return false;
  switch(R.k){
    case'worker':return !!d.worker;
    case'trade':return !!d.trade;
    case'armed':return !d.worker&&!d.noWeapon&&!d.trade&&!!d.dmg;
    case'heal':return !!d.heal;
    default:return true;}
}
function agDefaultRole(u){
  const d=u.def;
  if(d.trade)return'trade';if(d.heal)return'medic';
  if(d.worker){const o=u.order;return(o.t==='gather'&&o.res&&o.res.type==='geyser')?'ether':'mine';}
  if(!d.noWeapon&&d.dmg)return'guard';
  return'scout';
}
function agName(u){return u.def.name+' #'+String(u.id%100).padStart(2,'0');}
function mkAgent(u,o){
  o=o||{};
  const ag={auto:true,role:'free',dm:'auto',dir:{},wallet:0,earned:0,cost:0,spent:0,paid:0,delivered:0,kills:0,tasks:0,xp:0,lvl:o.lvl||1,gear:0,
    st:'',stt:0,why:'',manual:false,roleT:G.time,free:o.free||0,cid:0,pause:0,lastB:G.time,saved:null,rea:null,sc:null,pi:0,
    m:{spd:1,dmg:1,carry:0,arm:0,hp:1},born:G.time,name:o.name||agName(u),prev:null};
  u.ag=ag;agMods(u);
  ag.role=o.role||agDefaultRole(u);
  return ag;
}
function agEnroll(u,on,o){
  if(!u||u.team!==0||u.dead||u.def.hero||u.def.creep||u.team>1)return false;
  if(on){
    if(u.ag){if(u.ag.free&&!u.ag.auto)u.ag.auto=true;u.ag.auto=true;u.ag.manual=false;return true;}
    mkAgent(u,o);return true;}
  if(u.ag&&!u.ag.free){u.ag.auto=false;u.ag.st='';u.ag.manual=false;u.ag.why='';u.ag.cid&&econDropAgent(u);}
  return true;
}
/* set an explicit directive (role + parameters).  dir: {x,y,r} anchor | {pts:[..]} patrol | {tid} escort | {bid} building */
function agDirect(u,role,dir){
  if(!u.ag||!canRole(u,role))return false;
  const ag=u.ag;
  if(ag.cid&&role!=='gig')econDropAgent(u);
  ag.auto=true;ag.role=role;ag.dm='set';ag.dir=dir||{};ag.manual=false;ag.st='';ag.sc=null;ag.pi=0;ag.roleT=G.time;ag.why='';ag.pause=0;
  if(u.order.t!=='idle'&&u.order.t!=='build'&&!u.garr)agSet(u,{t:'idle'});
  if(u.order.t==='idle'){u.home={x:u.x,y:u.y};}
  return true;
}
function agAutoMode(u){ // hand the role choice back to the Overseer
  if(!u.ag)return;u.ag.dm='auto';u.ag.dir={};u.ag.auto=true;
}
/* ----------------------------- progression ----------------------------- */
function agMods(u){
  const ag=u.ag,d=u.def,L=ag.lvl-1,g=ag.gear,m=ag.m,workerish=d.worker||d.trade;
  if(workerish){m.carry=d.worker?Math.floor(L/2)+g:0;m.spd=1+0.02*L+0.04*g;m.hp=1+0.04*L+0.05*g;m.dmg=1;m.arm=0;}
  else{m.carry=0;m.dmg=1+0.04*L+0.06*g;m.arm=(g>=1?1:0)+(g>=3?1:0);m.hp=1+0.04*L+0.05*g;m.spd=1+0.01*g;}
  const r=u.hp/u.maxhp,nm=Math.round(d.hp*m.hp);if(nm!==u.maxhp){u.maxhp=nm;u.hp=Math.min(nm,Math.max(1,nm*r));}
}
function agXP(u,amt){
  const ag=u.ag;if(!ag||amt<=0)return;ag.xp+=amt;
  while(ag.lvl<AG_MAXLVL&&ag.xp>=AG_XP[ag.lvl+1]){
    ag.lvl++;agMods(u);G.fx.push({x:u.x,y:u.y-18,t:0,max:1.3,kind:'text',txt:'LVL '+ag.lvl,col:'#9fe8ff'});
    if(u.team===0&&G.sw.pol&&SET.swarmHints&&!u.ag.free&&ag.lvl===3&&!G.sw.toldLevel){G.sw.toldLevel=1;toast(ag.name+' reached level 3 — agents carry more and hit harder as they level.','good');}}
}
function gearCost(u,tier){const g=GEAR[tier];return g?Math.round(g.c*(0.8+0.2*Math.max(1,u.def.supply))):0;}
function agShop(u,ag){
  const T=G.teams[u.team],tier=ag.gear+1,g=GEAR[tier];if(!g||!G.sw.pay)return false;
  if(g.need&&!hasDone(u.team,g.need))return false;if(g.era&&T.era<g.era)return false;
  const c=gearCost(u,tier);if(ag.wallet<c)return false;
  ag.wallet-=c;T.c+=c;ag.spent+=c;ag.gear=tier;agMods(u);led('gear',c);
  G.fx.push({x:u.x,y:u.y-20,t:0,max:1.4,kind:'text',txt:'Gear '+g.n,col:'#ffd45a'});if(u.team===0)sfx('coin');
  return true;
}
/* ---------------------------- money in / out --------------------------- */
function agCommission(u,val){
  const ag=u.ag,S=G.sw;if(!ag||ag.free||!ag.auto||!S.pay||!S.pol.comm||val<=0)return 0;
  const T=G.teams[u.team],room=Math.max(0,WALLET_CAP-ag.wallet);let c=Math.min(val*S.pol.comm,room,T.c);if(c<=0.01)return 0;
  T.c-=c;ag.wallet+=c;ag.paid+=c;ag.cost+=c;led('comm',c);return c;
}
function agBonus(u,amt,kind){ // direct payment from the treasury (kill bounties, stipends)
  const ag=u.ag,S=G.sw,T=G.teams[u.team];if(!ag||ag.free||!ag.auto||!S.pay||amt<=0)return;
  const room=Math.max(0,WALLET_CAP-ag.wallet);amt=Math.min(amt,room,T.c);if(amt<=0.01)return;
  T.c-=amt;ag.wallet+=amt;ag.paid+=amt;ag.cost+=amt;led(kind||'bonus',amt);
}
function agPeer(from,to,amt){ // peer-to-peer payment between two agents (e.g. a patient pays the Medic)
  if(!from.ag||!to.ag||!G.sw.pay||amt<=0.01)return 0;
  const a=Math.min(amt,from.ag.wallet,Math.max(0,WALLET_CAP-to.ag.wallet));if(a<=0.01)return 0;
  from.ag.wallet-=a;from.ag.spent+=a;to.ag.wallet+=a;to.ag.earned+=a;led('peer',a);return a;
}
/* hooks called by the simulation */
function agDelivered(u,n,type){
  const ag=u.ag,T=G.teams[u.team];if(!ag)return;
  const val=n*T.mult*(type==='e'?1.25*G.mkt.p:1);
  ag.delivered+=n;ag.earned+=val;if(ag.auto)agXP(u,1.5+n*0.25);
  agCommission(u,val);
  if(ag.auto)agShop(u,ag);
  if(ag.cid)econDelivered(u,n,type);
}
function agTradeEarn(u,amt){const ag=u.ag;if(!ag)return;ag.earned+=amt;if(ag.auto)agXP(u,3);agCommission(u,amt);if(ag.auto)agShop(u,ag);}
function agKill(k,v){
  const ag=k.ag;if(!ag||k.dead)return;ag.kills++;
  const cc=v.def.cost||{c:v.def.bounty||0,e:0},val=0.35*(cc.c+cc.e);ag.earned+=val;
  if(ag.auto){agXP(k,v.def.supply*5+(v.team===2?v.def.xp*0.15:v.def.supply*2));
    if(v.team===2)agCommission(k,v.def.bounty||0);else agBonus(k,G.sw.pol.bounty*(cc.c+cc.e),'bounty');}
}
function agDied(u){
  const ag=u.ag;if(!ag)return;
  if(ag.wallet>1)led('lost',ag.wallet);
  econUnitDied(u);
}
/* ------------------------------ geometry ------------------------------- */
function ownHubs(team){const out=[];for(const b of G.buildings)if(!b.dead&&b.done&&b.team===team&&b.type==='hub')out.push(b);return out;}
function agHub(u){return nearestOwn(u.team,'hub',u.x,u.y);}
function stagePt(hub){
  const S=G.sw;let p=S.bb.stage[hub.id];if(p)return p;
  const dx=WW/2-hub.x,dy=WH/2-hub.y,l=hyp(dx,dy)||1,
    f=nearestFree(clamp((hub.x+dx/l*340)/TILE|0,3,MW-4),clamp((hub.y+dy/l*340)/TILE|0,3,MH-4),10);
  p=f?{x:(f[0]+.5)*TILE,y:(f[1]+.5)*TILE}:{x:hub.x,y:hub.y+120};S.bb.stage[hub.id]=p;return p;
}
/* where an idle agent stands around a rally point.  Big armies spread out: a hero's area spell (Suppressive Barrage: 90 damage in 130 px)
   deletes a tight blob of 55-HP riflemen, so the radius grows with the army (x1 at 0 units, x3 at 60+). */
function spreadPt(u,a,rad,noScale){
  const S=G.sw,n=(S&&S.bb.summary&&S.bb.summary.army)||0;
  if(!noScale)rad*=1+Math.min(2,n/30);
  const ang=u.id*2.399,f=0.3+0.7*((u.id*7)%10)/10;
  for(let k=0;k<4;k++){
    const r=rad*f*Math.pow(0.7,k),x=a.x+Math.cos(ang+k*0.9)*r,y=a.y+Math.sin(ang+k*0.9)*r;
    if(u.flying||canStand(x,y))return{x,y};}
  return{x:a.x,y:a.y};
}
function anchorOf(u,ag){
  const D=ag.dir;
  if(D.x!==undefined)return{x:D.x,y:D.y};
  if(D.bid){const b=byId(D.bid);if(b&&!b.dead)return{x:b.x,y:b.y};}
  const hub=agHub(u)||ownHubs(u.team)[0];
  if(hub)return stagePt(hub);
  return{x:u.x,y:u.y};
}
function campAlive(c){for(const id of c.units){const z=byId(id);if(z&&!z.dead)return true;}return false;}
function dpsOf(u){const d=u.def;return d.dmg?(d.dmg*(u.dmgMul||1))/(d.cd||1):0;}
function lanch(list){let a=0,h=0;for(const u of list){a+=dpsOf(u);h+=u.hp+u.def.armor*12;}return a*h;}
function agThreat(u,rad){
  let best=null,bd=1e9;
  forNear(u.x,u.y,rad,e=>{
    if(e.team===u.team||e.dead||e.hidden)return;
    const d=e.def;if(d.noWeapon||!d.dmg)return;
    if(e.team===2&&!(G.daylight>0.3||e.provoked>0))return;
    const dd=hyp(e.x-u.x,e.y-u.y);if(dd>rad||dd>=bd)return;
    if(!seen(u.team,e))return;bd=dd;best=e;});
  return best;
}
/* Combat Stims: +50% speed and fire rate for 8 s (about x2.25 in Lanchester terms) at 12 HP; the built-in AI never uses them, the swarm does */
function agStim(u){
  if(!G.teams[u.team].stims||!u.def.stim||u.hp<u.maxhp*0.5||hasBuff(u,'stim'))return false;
  if(!agThreat(u,260))return false;
  return useStim(u);
}
/* snipe the enemy hero: its area spells (Shockwave, Barrage: 50–90 damage in 130 px) delete a clump of 55-HP riflemen.  But a hero is
   expensive to kill (620+ HP, armor 2: a 7-damage Rifleman needs ~125 hits), and units that run past the enemy line to reach one die
   for nothing — so the focus is taken only when the units already close to the hero can kill it within ~4 s. */
function heroKillTime(h,team){
  if(h._fkT!==undefined&&G.time-h._fkT<0.4)return h._fk;
  let dps=0;const arm=(h.def.armor||0)+(h.armAdd||0);
  forNear(h.x,h.y,330,u=>{if(u.team!==team||u.dead||u.hidden||u.def.worker||u.def.heal||u.def.noWeapon||u.def.siege||!u.def.dmg||!canAttack(u.def,h))return;
    if(hyp(u.x-h.x,u.y-h.y)>u.def.range+u.r+h.r+90)return;
    const raw=u.def.dmg*(u.dmgMul||1),eff=Math.max(1,raw-arm);dps+=dpsOf(u)*eff/raw;});
  h._fk=dps>0?h.hp/dps:99;h._fkT=G.time;return h._fk;
}
function agFocus(u,ag){
  const d=u.def;if(d.heal||d.noWeapon||d.worker||d.siege||!d.dmg)return false;
  let hero=null,bd=1e9;
  forNear(u.x,u.y,520,e=>{if(e.team!==u.team&&!e.dead&&!e.hidden&&e.def.hero&&seen(u.team,e)&&canAttack(d,e)){const dd=hyp(e.x-u.x,e.y-u.y);if(dd<bd){bd=dd;hero=e;}}});
  if(!hero||heroKillTime(hero,u.team)>4||bd>d.range+u.r+hero.r+140)return false;
  ag.why='Focusing the enemy hero';
  if(u.order.t==='attack'&&u.order.target===hero)return true;
  agSet(u,{t:'attack',target:hero});return true;
}
/* ---------------------------- reactive layer --------------------------- */
function agReact(u,ag,dtb){
  const S=G.sw,T=G.teams[u.team],d=u.def;
  // 0. sidestep a telegraphed orbital strike: the beam lands 2.2 s after the warning ring appears
  if(ag.st==='dodge'){
    if(G.time<ag.stt)return true;
    ag.st='';return false;}
  if(!u.flying&&!u.sieged&&u.siegeT<=0){
    for(const z of G.zones){
      if(z.type!=='orbital'||z.fired||z.team===u.team||z.t>z.max-0.3)continue;
      const dd=hyp(u.x-z.x,u.y-z.y);if(dd>=z.r+8)continue;
      const l=dd||1,ux=dd?(u.x-z.x)/l:Math.cos(u.id),uy=dd?(u.y-z.y)/l:Math.sin(u.id),far=z.r+55+(u.id%5)*12;
      let tx=z.x+ux*far,ty=z.y+uy*far;
      if(!canStand(tx,ty)){const f=nearestFree(clamp(tx/TILE|0,2,MW-3),clamp(ty/TILE|0,2,MH-3),5);if(f){tx=(f[0]+.5)*TILE;ty=(f[1]+.5)*TILE;}}
      ag.st='dodge';ag.stt=G.time+Math.max(0.6,z.max-z.t+0.1);ag.why='Sidestepping an orbital strike';
      agSet(u,{t:'move',x:tx,y:ty});return true;}}
  // 1. non-combatants run for the Hub when armed enemies close in
  const frail=d.worker||d.noWeapon;
  const threat=(frail&&S.pol.flee)?agThreat(u,230):null;
  if(ag.st==='flee'){
    if(threat)ag.stt=G.time+4;
    if(G.time<ag.stt)return true;
    ag.st='';if(u.garr)leaveGarrison(u);
    const sv=ag.saved;ag.saved=null;
    if(sv&&sv.res&&!sv.res.dead)agSet(u,sv);else if(u.order.t==='garrison')agSet(u,{t:'idle'});
    return false;}
  if(threat){
    const hub=agHub(u);
    if(hub&&hyp(u.x-hub.x,u.y-hub.y)<900){
      ag.st='flee';ag.stt=G.time+4;ag.why='Taking cover in the Hub';
      const o=u.order;ag.saved=(o.t==='gather'&&o.res&&!o.res.dead)?{t:'gather',res:o.res,st:u.carry>0?'ret':'go',hx:o.hx,hy:o.hy}:null;
      agSet(u,{t:'garrison',hub});return true;}}
  // 2. field clinic: wounded agents walk to the Hub and pay for repairs out of their own wallet
  if(ag.st==='clinic'){
    const hub=agHub(u);
    if(!hub||G.time>ag.stt||u.hp>=u.maxhp*0.98){ag.st='';agShop(u,ag);return false;}
    if(rectDist(u.x,u.y,hub)>46){
      if(u.order.t!=='move'){const p=approachPoint(hub,u.x,u.y);agSet(u,{t:'move',x:p.x,y:p.y});}
      return true;}
    // at the clinic desk: 10 HP/s, fee per HP, wallet pays first, the colony subsidises the rest (policy)
    const want=Math.min(u.maxhp-u.hp,10*dtb),fee=S.pol.fee;
    let ok=want;
    if(S.pay&&fee>0){
      const pay=Math.min(want*fee,ag.wallet);ag.wallet-=pay;ag.spent+=pay;T.c+=pay;led('clinic',pay);
      const rest=want*fee-pay;
      if(rest>0.001){if(S.pol.subsidy){led('subsidy',rest);}else ok=pay/fee;}}
    if(ok>0){u.hp=Math.min(u.maxhp,u.hp+ok);u.healFx=0.3;}
    ag.why='Repairing at the clinic';
    return true;}
  if(S.pol.clinic&&!d.heal&&u.hp<u.maxhp*0.5&&G.time-u.lastHit>3&&u.order.t!=='build'){
    const hub=agHub(u);
    if(hub&&hyp(u.x-hub.x,u.y-hub.y)<1300&&!agThreat(u,150)){
      ag.st='clinic';ag.stt=G.time+45;ag.why='Heading to the clinic';ag.saved=null;
      const p=approachPoint(hub,u.x,u.y);agSet(u,{t:'move',x:p.x,y:p.y});return true;}}
  // 3. spare change: armed agents loitering near a Hub buy gear
  if(ag.wallet>=gearCost(u,ag.gear+1)&&u.order.t==='idle'&&G.tick%3===0){const hub=agHub(u);if(hub&&hyp(u.x-hub.x,u.y-hub.y)<420)agShop(u,ag);}
  return false;
}
/* -------------------------------- brain -------------------------------- */
function agBrain(u){
  const ag=u.ag,S=G.sw,dtb=Math.min(1,G.time-ag.lastB);ag.lastB=G.time;
  if(u.dead||!ag.auto||!S.on)return;
  if(u.hidden&&!u.garr)return;
  if(u.stunned>0||u.siegeT>0)return;
  if(ag.pause>G.time)return;
  if(ag.manual){
    if(u.order.t==='idle'&&!u.oq.length&&!u.garr){ag.manual=false;agReanchor(u,ag);}
    else return;}
  if(agReact(u,ag,dtb))return;
  const D=S.bb.def;if(D&&D.on&&D.ids.has(u.id)&&runDefend(u,ag,S,D))return;
  const R=RUN[ag.role];if(R)R(u,ag,S);
}
function agReanchor(u,ag){
  if(ag.rea&&(ag.role==='guard')&&canRole(u,'guard')){ag.dir={x:ag.rea.x,y:ag.rea.y,r:ag.dir.r};ag.why='Guard post moved';}
  ag.rea=null;
}
/* called from setOrder when the player (or a legacy system) gives an order to an enrolled unit */
function agManual(u,o,q){
  const ag=u.ag;if(!ag||!ag.auto)return;
  if(o.t==='idle'&&!q){ag.pause=G.time+20;ag.manual=false;ag.st='';return;}   // Stop: stay put for a while
  ag.manual=true;if(ag.st==='flee'||ag.st==='clinic')ag.st='';
  if(!q&&(o.t==='move'||o.t==='attackmove')&&o.x!==undefined)ag.rea={x:o.x,y:o.y};else if(!q)ag.rea=null;
}
/* ---------------------------- role: economy ---------------------------- */
function agPickRes(u,type){
  const drops=[];for(const b of G.buildings)if(!b.dead&&b.done&&b.team===u.team&&b.def.dropoff)drops.push(b);
  if(!drops.length)return null;
  const claims=new Map();
  for(const w of G.units){if(w.dead||w.team!==u.team||w===u)continue;const o=w.order;if(o.t==='gather'&&o.res&&o.st!=='work')claims.set(o.res,(claims.get(o.res)||0)+1);}
  let best=null,bs=1e9;
  for(const r of G.res){
    if(r.dead||r.type!==type||r.amount<=0)continue;
    if(type==='geyser'&&!geyserOK(r,u.team))continue;
    const load=r.users.length+(claims.get(r)||0);if(load>=r.cap+1)continue;
    let dh=1e9;for(const b of drops){const d=hyp(b.x-r.x,b.y-r.y);if(d<dh)dh=d;}
    if(dh>650)continue;
    const s=hyp(r.x-u.x,r.y-u.y)*0.5+dh+load*60;if(s<bs){bs=s;best=r;}}
  return best;
}
function runMine(u,ag,S,type){
  type=type||'crystal';const o=u.order;
  if(o.t==='gather'&&o.res&&!o.res.dead&&o.res.type===type){ag.why=type==='crystal'?'Mining crystals':'Extracting ether';return;}
  if(o.t!=='idle'&&o.t!=='gather')return;
  let r=agPickRes(u,type);
  if(!r&&type==='geyser'){S.bb.needSiphon=G.time;type='crystal';r=agPickRes(u,type);}
  if(!r){S.bb.needExpand=G.time;ag.why='No free resources in range';return;}
  ag.why=type==='crystal'?'Mining crystals':'Extracting ether';
  const same=(type==='crystal')===(u.carryType==='c');
  agSet(u,{t:'gather',res:r,st:(u.carry>0&&same)?'ret':'go',hx:r.x,hy:r.y});
}
function runBuild(u,ag,S){
  const o=u.order;if(o.t==='build'||o.t==='repair'){return;}
  if(o.t!=='idle'&&o.t!=='gather')return;
  const T=G.teams[u.team];let best=null,bs=1e9;
  for(const k of S.bb.tickets){
    if(k.by&&k.by!==u.id){const w=byId(k.by);if(w&&!w.dead&&w.order.t==='build'&&!w.order.bld)continue;}
    const c=bCost(u.team,k.type);if(!afford(T,c))continue;
    const s=hyp(u.x-k.px,u.y-k.py)-k.prio*250;if(s<bs){bs=s;best=k;}}
  if(best){
    const d=BDEF[best.type];
    if(!canPlace(u.team,best.type,best.tx,best.ty,true)||footprintBusy({tx:best.tx,ty:best.ty,w:d.w,h:d.h},u)){best.dead=true;}
    else if(agDo(()=>orderBuild(u,best.type,best.tx,best.ty))){best.by=u.id;ag.why='Building '+d.name;return;}}
  // no ticket: help finish a structure, then patch up damaged ones, else mine
  let nb=null,nd=1e9;
  for(const b of G.buildings){if(b.dead||b.team!==u.team)continue;
    if(!b.done&&b.nb<2){const dd=hyp(b.x-u.x,b.y-u.y);if(dd<700&&dd<nd){nd=dd;nb=b;}}}
  if(nb){ag.why='Helping build '+nb.def.name;agSet(u,{t:'build',type:nb.type,tx:nb.tx,ty:nb.ty,paid:false,st:'go',bld:nb,after:null});return;}
  if(runRepairJob(u,ag,S,0.8))return;
  runMine(u,ag,S,'crystal');ag.why='Mining (no construction tickets)';
}
function runRepairJob(u,ag,S,frac){
  const T=G.teams[u.team];if(T.c<60)return false;
  let best=null,bs=1e9;
  for(const b of G.buildings){if(b.dead||b.team!==u.team||!b.done||b.hp>=b.maxhp*frac)continue;const s=hyp(b.x-u.x,b.y-u.y)+b.hp/b.maxhp*300;if(s<bs&&s<1400){bs=s;best=b;}}
  if(!best)for(const m of G.units){if(m.dead||m.team!==u.team||m===u||!m.def.tags.mech||m.hp>=m.maxhp*frac)continue;const s=hyp(m.x-u.x,m.y-u.y)+m.hp/m.maxhp*300;if(s<bs&&s<700){bs=s;best=m;}}
  if(!best)return false;
  ag.why='Repairing '+best.def.name;agSet(u,{t:'repair',target:best});return true;
}
function runRepair(u,ag,S){
  const o=u.order;if(o.t==='repair')return;if(o.t!=='idle'&&o.t!=='gather')return;
  if(runRepairJob(u,ag,S,0.92))return;
  runMine(u,ag,S,'crystal');ag.why='Mining (nothing to repair)';
}
function runTrade(u,ag,S){
  const o=u.order;if(o.t==='trade')return;if(o.t!=='idle')return;
  const ex=nearestOwn(u.team,'exchange',u.x,u.y);
  if(!ex){S.bb.needExchange=G.time;ag.why='Needs an Exchange';return;}
  let best=null,bs=-1;
  const fr=S.agents.filter(f=>f!==u&&f.order.t==='trade');
  for(const p of G.neutrals){if(p.type!=='post')continue;
    let danger=0;for(const c of G.camps)if(campAlive(c)&&hyp(c.x-p.x,c.y-p.y)<260)danger+=0.25*c.lvl;
    const on=fr.filter(f=>f.order.post===p).length,s=(0.6*p.demand+0.25)/(1+danger)/(1+0.5*on);
    if(s>bs){bs=s;best=p;}}
  if(best){ag.why='Trade route to Post '+(best.id%9);agSet(u,{t:'trade',post:best,st:'toPost'});}
}
/* --------------------------- role: reconnaissance ---------------------- */
function runScout(u,ag,S){
  const o=u.order,cells=S.bb.cells;if(!cells)return;
  if(o.t==='idle')ag.sc=null;
  if(o.t!=='idle')return;
  let best=null,bs=-1;
  for(const c of cells){
    if(!c.reach&&!u.flying)continue;const age=G.time-c.seen;if(age<45)continue;
    const d=hyp(c.x-u.x,c.y-u.y);let danger=0;
    if(!u.flying){for(const cp of G.camps)if(cp._alive&&hyp(cp.x-c.x,cp.y-c.y)<300)danger+=0.45*cp.lvl;if(c.base)danger+=2;}
    else if(c.base)danger+=0.6;
    const s=Math.min(age,400)*c.w/(d+300)/(1+danger);if(s>bs){bs=s;best=c;}}
  if(best){ag.sc=best;ag.why='Scouting sector '+String.fromCharCode(65+best.gy)+(best.gx+1);agSet(u,{t:'move',x:best.x,y:best.y});}
  else ag.why='Map fully surveyed';
}
/* ----------------------------- role: warfare --------------------------- */
function runGuard(u,ag,S){
  const a=anchorOf(u,ag),r=ag.dir.r||200,o=u.order,al=S.bb.alarm;
  if(al&&S.pol.react&&hyp(al.x-a.x,al.y-a.y)<r+560&&!u.sieged){
    agStim(u);
    if(o.t!=='attackmove'||hyp(o.x-al.x,o.y-al.y)>150){ag.why='Answering an alarm';agSet(u,{t:'attackmove',x:al.x,y:al.y,gs:0});}
    return;}
  if(o.t!=='idle')return;
  const sp=spreadPt(u,a,r*0.55),d=hyp(u.x-sp.x,u.y-sp.y);
  if(d>r*0.45&&!u.target){ag.why='Moving to guard post';agSet(u,{t:'attackmove',x:sp.x,y:sp.y,gs:0});return;}
  ag.why='On guard';
  if(hyp(u.home.x-sp.x,u.home.y-sp.y)>6)u.home={x:sp.x,y:sp.y};
  if(u.def.siege&&!u.sieged&&u.siegeT<=0&&d<r)toggleSiege(u);
}
function runPatrol(u,ag,S){
  const o=u.order;if(o.t!=='idle')return;
  let pts=ag.dir.pts;
  if(!pts||pts.length<2){const hub=agHub(u);if(!hub)return;pts=[{x:hub.x,y:hub.y+110},stagePt(hub)];ag.dir.pts=pts;}
  ag.pi=(ag.pi||0)%pts.length;const p=pts[ag.pi];ag.pi++;
  ag.why='Patrolling ('+ag.pi+'/'+pts.length+')';agSet(u,{t:'attackmove',x:p.x,y:p.y,gs:0});
}
function runHunt(u,ag,S){
  const h=S.bb.hunt,o=u.order;
  if(h&&h.go&&h.camp&&h.ids.has(u.id)){
    const c=h.camp;
    if(o.t==='attackmove'&&Math.abs(o.x-c.x)<30&&Math.abs(o.y-c.y)<30)return;
    ag.why='Clearing creep camp (level '+c.lvl+')';agSet(u,{t:'attackmove',x:c.x,y:c.y,gs:h.slow||0});return;}
  if(o.t!=='idle')return;
  const st=h?h.stage:anchorOf(u,ag),sp=spreadPt(u,st,120);
  ag.why=h&&h.note?h.note:'Assembling the hunting party';
  if(hyp(u.x-sp.x,u.y-sp.y)>140)agSet(u,{t:'attackmove',x:sp.x,y:sp.y,gs:0});
}
function runAssault(u,ag,S){
  const A=S.bb.assault,o=u.order;
  if(!A){runGuard(u,ag,S);ag.why='Waiting for orders (no assault planned)';return;}
  if(A.go&&A.ids.has(u.id)&&A.tgt&&!A.tgt.dead){
      agStim(u);
  if(agFocus(u,ag))return;
    if(o.t==='attackmove'&&hyp(o.x-A.tgt.x,o.y-A.tgt.y)<60)return;
    if(o.t==='idle'||o.t==='attackmove'||o.t==='move'){ag.why='Assaulting the enemy base';agSet(u,{t:'attackmove',x:A.tgt.x,y:A.tgt.y,gs:A.slow||0});}
    return;}
  if(A.go&&A.ids.has(u.id)&&A.tgt&&A.tgt.dead&&o.t==='idle'){const t=nearestEnemyBuilding(u.x,u.y,0);if(t){ag.why='Mopping up';agSet(u,{t:'attackmove',x:t.x,y:t.y,gs:0});return;}}
  if(o.t!=='idle')return;
  const sp=spreadPt(u,A.stage,130);ag.why=A.go?'Reinforcing the stage':'Massing for the assault ('+A.have+'/'+A.need+')';
  if(hyp(u.x-sp.x,u.y-sp.y)>150)agSet(u,{t:'attackmove',x:sp.x,y:sp.y,gs:0});
}
function runEscort(u,ag,S){
  let t=ag.dir.tid?byId(ag.dir.tid):null;if(t&&(t.dead||t.team!==u.team))t=null;
  if(!t)t=heroUnit(u.team);
  if(!t||t===u){runGuard(u,ag,S);return;}
  const o=u.order,d=hyp(u.x-t.x,u.y-t.y);
  ag.why='Escorting '+t.def.name;
  if(o.t==='attackmove'&&hyp(o.x-t.x,o.y-t.y)<120)return;
  if(d>150&&(o.t==='idle'||o.t==='attackmove'||o.t==='move')){const sp=spreadPt(u,t,70,true);agSet(u,{t:'attackmove',x:sp.x,y:sp.y,gs:0});}
  else if(o.t==='idle'&&hyp(u.home.x-t.x,u.home.y-t.y)>40)u.home={x:t.x,y:t.y};
}
function runMedic(u,ag,S){
  const o=u.order;if(o.t!=='idle'&&o.t!=='move')return;
  let best=null,bs=2;
  forNear(u.x,u.y,520,e=>{if(e.team!==u.team||e.dead||e===u||e.hidden||!e.def.tags.bio||e.hp>=e.maxhp*0.92)return;
    const f=e.hp/e.maxhp+hyp(e.x-u.x,e.y-u.y)/2400;if(f<bs){bs=f;best=e;}});
  if(best){ag.why='Tending '+best.def.name;if(hyp(best.x-u.x,best.y-u.y)>90)agSet(u,{t:'move',x:best.x,y:best.y});return;}
  // otherwise trail the nearest armed group
  let cx=0,cy=0,n=0;
  forNear(u.x,u.y,700,e=>{if(e.team===u.team&&!e.dead&&!e.hidden&&!e.def.worker&&!e.def.noWeapon){cx+=e.x;cy+=e.y;n++;}});
  if(n){cx/=n;cy/=n;ag.why='Following the line';if(hyp(cx-u.x,cy-u.y)>130)agSet(u,{t:'move',x:cx+(Math.random()-.5)*50,y:cy+(Math.random()-.5)*50});return;}
  const hub=agHub(u);if(hub){ag.why='Standing by at the Hub';if(hyp(hub.x-u.x,hub.y-u.y)>200)agSet(u,{t:'move',x:hub.x,y:hub.y+100});}
}
function runFree(u,ag,S){ag.why='No directive';}
const RUN={mine:(u,a,S)=>runMine(u,a,S,'crystal'),ether:(u,a,S)=>runMine(u,a,S,'geyser'),build:runBuild,repair:runRepair,trade:runTrade,scout:runScout,
  guard:runGuard,patrol:runPatrol,hunt:runHunt,assault:runAssault,escort:runEscort,medic:runMedic,gig:(u,a,S)=>econRunGig(u,a,S),free:runFree};
/* ------------------------------- stepping ------------------------------ */
function swarmInit(){
  G.sw={
    on:SET.swarm!==false&&!G.ais[0],pay:true,
    pol:{comm:0.05,flee:true,clinic:true,subsidy:true,fee:0.2,react:true,bounty:0.05,autoEnroll:false,hunt:false,assault:false,assaultMin:10,
      keepWorkers:0,quota:{},healFee:0.1},
    dom:{supply:'advise',eco:'advise',alloc:'advise',army:'advise',tech:'advise',trade:'advise',labor:'advise'},
    bb:{tickets:[],alarm:null,hunt:null,assault:null,needSiphon:0,needExpand:0,needExchange:0,cells:null,stage:{},summary:{}},
    agents:[],ids:new Map(),props:[],log:[],propSeq:1,stand:[],toldLevel:0,
    led:{comm:0,wage:0,gear:0,clinic:0,subsidy:0,bounty:0,bonus:0,peer:0,lost:0,gig:0,fee:0,escrow:0,sold:0,tips:0},ledT:[],ledNow:{}};
  econInit();ovInit();
}
function led(kind,amt){const S=G.sw;if(!S)return;S.led[kind]=(S.led[kind]||0)+amt;S.ledNow[kind]=(S.ledNow[kind]||0)+amt;}
function agentsStep(dt){
  const S=G.sw;if(!S)return;
  if(G.tick%15===0){
    S.agents=G.units.filter(u=>u.ag&&!u.dead&&u.team===0);
    S.ids=new Map();for(const u of G.units)S.ids.set(u.id,u);for(const b of G.buildings)S.ids.set(b.id,b);}
  if(!S.on)return;
  const A=S.agents;
  for(let i=0;i<A.length;i++){const u=A[i];if(!u.dead&&u.ag.auto&&(G.tick+u.id)%10===0)agBrain(u);}
}
function swarmStep(dt){
  const S=G.sw;if(!S)return;
  bbUpdate();agentsStep(dt);econStep(dt);ovStep(dt);
}
