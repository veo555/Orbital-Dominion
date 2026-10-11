/* =========================================================================
   SYSTEMS — unit behaviour, construction/repair, heroes, creeps, economy
   ========================================================================= */
function msg(team,t,cls){if(team===0&&G&&!G.ais[0]){toast(t,cls||'bad');if(cls!=='good')sfx(/Generators|Supply/.test(t)?'supply':'err');}}
function moraleMul(team){return 0.85+0.30*(G.teams[team].morale/100);}
function heroUnit(team){const H=G.teams[team].hero;if(!H.alive)return null;for(const u of G.units)if(u.id===H.uid&&!u.dead)return u;return null;}

/* ---------------------------- unit behaviour ------------------------- */
function engage(u,t,dt){
  const ed=edgeDist(u,t),rg=rangeOf(u);
  if(ed<=rg){u.path=null;u.ang=Math.atan2(t.y-u.y,t.x-u.x);if(u.cd<=0&&u.stunned<=0&&u.siegeT<=0)fire(u,t);}
  else if(!u.sieged){let gx=t.x,gy=t.y;if(t.kind==='building'){const p=approachPoint(t,u.x,u.y);gx=p.x;gy=p.y;}
    navigate(u,gx,gy,dt,t.kind==='building'?3:Math.max(4,rg*0.7));}
}
function updateUnit(u,dt){
  const d=u.def,o=u.order;
  if(u.cd>0)u.cd-=dt;if(u.repathCd>0)u.repathCd-=dt;if(u.flash>0)u.flash-=dt;if(u.revealT>0)u.revealT-=dt;if(u.healFx>0)u.healFx-=dt;
  if(u.siegeT>0)u.siegeT-=dt;if(u.provoked>0)u.provoked-=dt;
  for(let i=0;i<3;i++)if(u.cds[i]>0)u.cds[i]-=dt;
  recalcBuffs(u,dt);u.moving=false;
  if(d.hero){u.mana=Math.min(heroMaxMana(u),u.mana+(1.1+0.12*G.teams[u.team].hero.level)*dt);if(u.hp<u.maxhp&&G.time-u.lastHit>6)u.hp=Math.min(u.maxhp,u.hp+u.maxhp*0.006*dt);}
  if(d.heal)menderStep(u,dt);
  if(u.stunned>0)return;
  if(u.hidden){if(o.t==='gather'&&!u.garr)gatherStep(u,dt);return;}
  if(u.team===2){creepStep(u,dt);return;}
  const isArmed=!d.noWeapon&&!d.worker||d.worker;
  switch(o.t){
    case'idle':{
      if(d.worker||d.noWeapon)break;
      if(u.sieged&&u.target&&(!validTarget(u,u.target)||edgeDist(u,u.target)>rangeOf(u)))u.target=null;
      if(!validTarget(u,u.target))u.target=null;
      if(!u.target&&(G.tick+u.id)%6===0)u.target=acquire(u,u.sieged?rangeOf(u):Math.max(rangeOf(u)+45,170));
      if(u.target){
        if(!u.sieged&&hyp(u.x-u.home.x,u.y-u.home.y)>rangeOf(u)+260){u.target=null;u.returning=true;}
        else{engage(u,u.target,dt);u.chasing=true;break;}}
      if(u.chasing||u.returning){if(navigate(u,u.home.x,u.home.y,dt,12)){u.returning=false;u.chasing=false;u.path=null;}else u.returning=true;}
      break;}
    case'hold':{
      if(u.target&&(!validTarget(u,u.target)||edgeDist(u,u.target)>rangeOf(u)))u.target=null;
      if(!u.target&&!d.noWeapon&&(G.tick+u.id)%4===0)u.target=acquire(u,rangeOf(u));
      if(u.target){u.ang=Math.atan2(u.target.y-u.y,u.target.x-u.x);if(u.cd<=0&&u.siegeT<=0)fire(u,u.target);}
      break;}
    case'move':if(navigate(u,o.x,o.y,dt,6,o.gs))finishOrder(u);break;
    case'attackmove':{
      if(d.noWeapon||d.worker){if(navigate(u,o.x,o.y,dt,10,o.gs))finishOrder(u);break;}
      if(!validTarget(u,u.target))u.target=null;
      if(!u.target&&(G.tick+u.id)%5===0)u.target=acquire(u,rangeOf(u)+80);
      if(u.target)engage(u,u.target,dt);
      else if(navigate(u,o.x,o.y,dt,10,o.gs))finishOrder(u);
      break;}
    case'attack':{
      if(!validTarget(u,o.target)){
        const lp=o.target&&!o.target.dead?{x:o.target.x,y:o.target.y}:null;
        if(lp&&!d.worker&&!d.noWeapon)setOrder(u,{t:'attackmove',x:lp.x,y:lp.y,gs:0});else finishOrder(u);break;}
      u.target=o.target;engage(u,o.target,dt);break;}
    case'gather':gatherStep(u,dt);break;
    case'build':buildStep(u,dt);break;
    case'repair':repairStep(u,dt);break;
    case'trade':tradeStep(u,dt);break;
    case'garrison':garrisonStep(u,dt);break;
    case'cast':castStep(u,dt);break;
  }
}
function creepStep(u,dt){
  const d=u.def;
  if(!validTarget(u,u.target))u.target=null;
  const awake=G.daylight>0.3||u.provoked>0;
  if(!u.target&&awake&&(G.tick+u.id)%6===0)u.target=acquire(u,u.provoked>0?300:175);
  if(u.target){
    if(hyp(u.x-u.home.x,u.y-u.home.y)>440){u.target=null;u.provoked=0;}
    else{engage(u,u.target,dt);return;}}
  if(hyp(u.x-u.home.x,u.y-u.home.y)>14){navigate(u,u.home.x,u.home.y,dt,10);u.hp=Math.min(u.maxhp,u.hp+u.maxhp*0.1*dt);}
  else if(u.hp<u.maxhp)u.hp=Math.min(u.maxhp,u.hp+u.maxhp*0.05*dt);
}
function menderStep(u,dt){
  u.energy=Math.min(100,u.energy+0.8*dt);u.healT=Math.max(0,(u.healT||0)-dt);
  if(u.energy<2||u.hidden)return;
  let best=null,bs=2;
  forNear(u.x,u.y,150,e=>{if(e.team!==u.team||e.dead||e===u||e.hidden||!e.def.tags.bio||e.hp>=e.maxhp)return;
    if(hyp(e.x-u.x,e.y-u.y)>140)return;const f=e.hp/e.maxhp;if(f<bs){bs=f;best=e;}});
  if(best){const h=Math.min(best.maxhp-best.hp,14*dt);best.hp+=h;u.energy-=h/3;best.healFx=0.3;u.healT=0.25;u.healTarget=best;
    if(best.ag&&u.ag&&G.sw&&G.sw.pay)agPeer(best,u,h*G.sw.pol.healFee);}
}
function garrisonStep(u,dt){
  const o=u.order,hub=o.hub;
  if(!hub||hub.dead||!hub.done){finishOrder(u);return;}
  if(rectDist(u.x,u.y,hub)<=u.r+14){
    if(hub.garr.length<15){releaseRes(u);hub.garr.push(u.id);u.garr=hub.id;u.hidden=true;u.path=null;}else finishOrder(u);
    return;}
  const p=approachPoint(hub,u.x,u.y);navigate(u,p.x,p.y,dt,4);
}
function callToArms(team,hub){
  if(!hub||!hub.done)return;
  if(hub.garr.length){ // release
    const ids=hub.garr.slice();
    for(const id of ids){const u=G.units.find(z=>z.id===id);if(!u)continue;
      const saved=u.saved;leaveGarrison(u);u.saved=null;
      if(saved&&saved.res&&!saved.res.dead)setOrder(u,saved);else{const r=nearestRes(u.x,u.y,'crystal',false,900);if(r)setOrder(u,{t:'gather',res:r,st:'go',hx:r.x,hy:r.y});else goIdle(u);}}
    hub.garr=[];if(team===0)sfx('click');uiDirty();return;}
  let n=0;
  for(const u of G.units){if(u.dead||u.team!==team||!u.def.worker||u.hidden||hyp(u.x-hub.x,u.y-hub.y)>1000)continue;if(n>=15)break;
    const saved=u.order.t==='gather'&&u.order.res&&!u.order.res.dead?{t:'gather',res:u.order.res,st:u.carry>0?'ret':'go',hx:u.order.hx,hy:u.order.hy}:null;
    setOrder(u,{t:'garrison',hub});u.saved=saved;n++;}
  if(team===0){sfx('alert',undefined,undefined,hub);toast('Call to Arms: Haulers are sheltering in the Hub','good');}
  uiDirty();
}

/* --------------------------- gathering -------------------------------- */
function nearestDrop(u){
  let best=null,bd=1e9;
  for(const b of G.buildings){if(b.dead||!b.done||b.team!==u.team||!b.def.dropoff)continue;const d=hyp(b.x-u.x,b.y-u.y);if(d<bd){bd=d;best=b;}}
  return best;
}
function geyserOK(r,team){return r.type!=='geyser'||(r.siphon&&r.siphon.done&&!r.siphon.dead&&r.siphon.team===team);}
function findRes(u,type,x,y,freeOnly){
  let best=null,bd=620;
  for(const r of G.res){if(r.dead||r.type!==type||r.amount<=0)continue;if(freeOnly&&r.users.length>=r.cap)continue;if(!geyserOK(r,u.team))continue;
    const d=hyp(r.x-x,r.y-y);if(d<bd){bd=d;best=r;}}
  return best;
}
function gatherStep(u,dt){
  const o=u.order,T=G.teams[u.team];
  if(o.st==='work'){
    o.gt-=dt;
    if(o.gt<=0){const r=o.res;
      let n=r.type==='crystal'?5*(1+0.2*T.mining):4*(1+0.2*T.compress);n=Math.round(n)+2*T.cargo+(T.faction==='aurora'?1:0)+(u.ag?u.ag.m.carry:0);n=Math.min(n,Math.ceil(r.amount));
      const i=r.users.indexOf(u.id);if(i>=0)r.users.splice(i,1);u.inRes=null;
      if(u.hidden&&!u.garr){u.hidden=false;popOut(u);}
      u.carry=n;u.carryType=r.type==='crystal'?'c':'e';r.amount-=n;o.st='ret';u.path=null;sfx('mine',u.x,u.y,u);
      if(r.amount<=0)removeRes(r);}
    return;}
  if(o.st==='ret'){
    const hub=nearestDrop(u);if(!hub){goIdle(u);return;}
    if(rectDist(u.x,u.y,hub)<=u.r+11){
      if(u.carryType==='c'){T.c+=u.carry*T.mult;T.minedC+=u.carry;}else{T.e+=u.carry*T.mult;T.minedE+=u.carry;}T.mined+=u.carry;
      if(u.ag)agDelivered(u,u.carry,u.carryType);
      sfx('deliver',u.x,u.y,u);u.carry=0;o.st='go';u.path=null;return;}
    const p=approachPoint(hub,u.x,u.y);navigate(u,p.x,p.y,dt,4);return;}
  let res=o.res;
  if(!res&&u.carry>0){o.st='ret';return;}
  if(!res||res.dead||res.amount<=0||!geyserOK(res,u.team)){
    const alt=findRes(u,res?res.type:'crystal',o.hx!==undefined?o.hx:u.x,o.hy!==undefined?o.hy:u.y,false);
    if(alt){o.res=res=alt;}else{if(u.carry>0)o.st='ret';else goIdle(u);return;}}
  if(rectDist(u.x,u.y,res)<=u.r+11){
    if(res.users.length<res.cap){res.users.push(u.id);u.inRes=res;o.st='work';o.gt=(res.type==='crystal'?1.8:2.0)/moraleMul(u.team);u.path=null;
      if(res.type==='geyser'){u.hidden=true;u.x=res.x;u.y=res.y;}}
    else if(u.repathCd<=0){u.repathCd=0.5;const alt=findRes(u,res.type,o.hx,o.hy,true);if(alt&&alt!==res)o.res=alt;}
    return;}
  const p=approachPoint(res,u.x,u.y);navigate(u,p.x,p.y,dt,4);
}

/* ------------------------ construction & repair ----------------------- */
function buildStep(u,dt){
  const o=u.order,d=BDEF[o.type];let b=o.bld;
  if(!b){
    const site={tx:o.tx,ty:o.ty,w:d.w,h:d.h},rd=rectDist(u.x,u.y,site);
    if(rd>u.r+11){const p=approachPoint(site,u.x,u.y);
      if(navigate(u,p.x,p.y,dt,4)){o.nf=(o.nf||0)+1;if(o.nf>25){msg(u.team,'Cannot reach that site');refundOrder(u,o);o.paid=false;finishBuild(u,o);}}else o.nf=0;
      return;}
    if(!canPlace(u.team,o.type,o.tx,o.ty,true)||footprintBusy(site,u)){
      msg(u.team,'Cannot build here');refundOrder(u,o);o.paid=false;finishBuild(u,o);return;}
    b=addBuilding(o.type,u.team,o.tx,o.ty,false);ejectUnits(b);o.bld=b;o.paid=false;G.teams[u.team].built++;
    if(u.team===0&&!G.ais[0])sfx('place',undefined,undefined,b);uiDirty();}
  if(b.dead||b.done){finishBuild(u,o);return;}
  if(rectDist(u.x,u.y,b)>u.r+15){const p=approachPoint(b,u.x,u.y);navigate(u,p.x,p.y,dt,4);return;}
  b._cnt++;u.ang=turn(u.ang,Math.atan2(b.y-u.y,b.x-u.x),dt*8);if(u.ag&&G.tick%30===0)agXP(u,0.6);
  if(G.tick%10===0)addPart(u.x+Math.cos(u.ang)*12,u.y+Math.sin(u.ang)*12,(Math.random()-.5)*30,-20-Math.random()*20,0.4,2.5,'#9fe8ff',1);
}
function footprintBusy(site,self){ // enemy/friendly ground units standing on the site (other than the builder) are pushed out later, but other buildings block
  for(const e of G.buildings){if(e.dead)continue;if(site.tx<e.tx+e.w&&site.tx+site.w>e.tx&&site.ty<e.ty+e.h&&site.ty+site.h>e.ty)return true;}
  return false;
}
function finishBuild(u,o){
  if(!u.oq.length&&o.after&&o.after.res&&!o.after.res.dead)setOrder(u,o.after);else finishOrder(u);
}
function repairStep(u,dt){
  const o=u.order,t=o.target;
  if(!t||t.dead||t.hp>=t.maxhp||t.team!==u.team||(t.kind==='building'&&!t.done)){finishOrder(u);return;}
  const near=t.kind==='unit'?edgeDist(u,t)<=u.r+8:rectDist(u.x,u.y,t)<=u.r+12;
  if(!near){if(t.kind==='unit')navigate(u,t.x,t.y,dt,u.r+t.r+4);else{const p=approachPoint(t,u.x,u.y);navigate(u,p.x,p.y,dt,4);}return;}
  const T=G.teams[u.team],ratio=(t.kind==='building'?0.5:0.25)*(T.faction==='meridian'?0.5:1),cost=t.def.cost;
  const dh=Math.min(t.maxhp-t.hp,11*dt*moraleMul(u.team)),cc=cost.c*ratio*dh/t.maxhp,ce=cost.e*ratio*dh/t.maxhp;
  if(T.c<cc||T.e<ce){msg(u.team,'Not enough resources to repair');finishOrder(u);return;}
  T.c-=cc;T.e-=ce;t.hp+=dh;u.ang=turn(u.ang,Math.atan2(t.y-u.y,t.x-u.x),dt*8);
  if(G.tick%6===0)addPart(u.x+Math.cos(u.ang)*12,u.y+Math.sin(u.ang)*12,(Math.random()-.5)*40,-25,0.3,2.5,'#ffe27a',1);
}

/* ------------------------- trade routes (Patrizier) -------------------- */
function nearestOwn(team,type,x,y){let best=null,bd=1e9;for(const b of G.buildings){if(b.dead||!b.done||b.team!==team||b.type!==type)continue;const d=hyp(b.x-x,b.y-y);if(d<bd){bd=d;best=b;}}return best;}
function tradeStep(u,dt){
  const o=u.order,post=o.post,T=G.teams[u.team];
  if(!post||post.dead){finishOrder(u);return;}
  const ex=nearestOwn(u.team,'exchange',u.x,u.y);
  if(!ex){msg(u.team,'Freighters need an Exchange');finishOrder(u);return;}
  const target=o.st==='toPost'?post:ex;
  if(rectDist(u.x,u.y,target)<=u.r+14){
    const dist=pathLength(ex.x,ex.y,post.x,post.y);
    if(o.st==='toPost'){
      const pay=Math.round(0.6*dist*post.demand*T.tradeMul);T.c+=pay;T.tradeEarn+=pay;post.demand=Math.max(0.15,post.demand-0.12);if(u.ag)agTradeEarn(u,pay);
      G.fx.push({x:u.x,y:u.y-16,t:0,max:1.6,kind:'text',txt:'+'+pay,col:'#ffd45a'});if(u.team===0)sfx('trade',undefined,undefined,u);
      o.st='toEx';}
    else{
      const pay=Math.round(0.25*dist*T.tradeMul);T.c+=pay;T.tradeEarn+=pay;if(u.ag)agTradeEarn(u,pay);
      G.fx.push({x:u.x,y:u.y-16,t:0,max:1.6,kind:'text',txt:'+'+pay,col:'#ffd45a'});if(u.team===0)sfx('coin',undefined,undefined,u);
      o.st='toPost';}
    u.path=null;return;}
  const p=approachPoint(target,u.x,u.y);navigate(u,p.x,p.y,dt,4);
}
function mktTrade(team,act,amt){
  amt=amt||100;const T=G.teams[team],m=G.mkt,fee=T.faction==='aurora'?1.05:1.10,k=1.035;
  switch(act){
    case'buyE':{const c=amt*m.p*fee;if(T.c<c)return false;T.c-=c;T.e+=amt;m.p*=k;break;}
    case'sellE':{if(T.e<amt)return false;T.e-=amt;T.c+=amt*m.p/fee;m.p/=k;break;}
    case'buyC':{const c=amt/m.p*fee;if(T.e<c)return false;T.e-=c;T.c+=amt;m.p/=k;break;}
    case'sellC':{if(T.c<amt)return false;T.c-=amt;T.e+=amt/m.p/fee;m.p*=k;break;}
    default:return false;}
  m.p=clamp(m.p,0.55,1.9);m.vol++;return true;
}
function gauss(){const r=G.rng;return Math.sqrt(-2*Math.log(Math.max(1e-9,r())))*Math.cos(TAU*r());}

/* ------------------------------ abilities ----------------------------- */
function toggleSiege(u,forceOff){
  if(!u.def.siege)return;
  if(u.sieged&&(forceOff===true||forceOff===undefined)){u.sieged=false;u.siegeT=1.2;if(u.team===0)sfx('cancel',undefined,undefined,u);return;}
  if(!u.sieged&&forceOff!==true&&u.siegeT<=0){u.sieged=true;u.siegeT=1.6;u.path=null;u.order={t:'idle'};u.home={x:u.x,y:u.y};if(u.team===0)sfx('siege',undefined,undefined,u);}
}
function useStim(u){
  const T=G.teams[u.team];if(!T.stims||!u.def.stim)return false;if(hasBuff(u,'stim')||u.hp<=14)return false;
  u.hp-=12;addBuff(u,'stim',1,8);u.flash=0.15;return true;
}
function skillOf(u,i){return SKILLS[u.type]&&SKILLS[u.type][i];}
function castRange(u,i){const s=skillOf(u,i);return s?s.range:0;}
function canCast(u,i){
  const s=skillOf(u,i),H=G.teams[u.team].hero;
  return!!s&&!s.passive&&H.sk[i]>0&&u.cds[i]<=0&&u.mana>=s.mana;
}
function castSkill(u,i,x,y){
  if(!canCast(u,i))return false;
  const s=skillOf(u,i),T=G.teams[u.team],lv=T.hero.sk[i],team=u.team;
  if(s.target==='point'&&hyp(u.x-x,u.y-y)>s.range+8)return false;
  switch(u.type+':'+s.id){
    case'hero_idris:barrage':
      aoeEnemies(team,x,y,s.radius,e=>{damageEnt(e,30+20*lv,team,u);if(e.kind==='unit')addBuff(e,'slow',0.45,5);});
      G.fx.push({x,y,t:0,max:0.7,kind:'ring',r:s.radius,col:'#7cc4ff'});for(let k=0;k<5;k++)explode(x+(Math.random()-.5)*s.radius,y+(Math.random()-.5)*s.radius,false);sfx('skill:barrage',x,y,u);G.shake=Math.max(G.shake,4);break;
    case'hero_idris:orbital':
      G.zones.push({type:'orbital',x,y,r:s.radius,t:0,max:2.2,team,dmg:240,sdmg:300,fired:false});sfx('skill:orbital',x,y,u);break;
    case'hero_kaz:shock':
      aoeEnemies(team,x,y,s.radius,e=>{damageEnt(e,30+20*lv,team,u);if(e.kind==='unit')addBuff(e,'stun',1,0.8+0.4*lv);},true);
      G.fx.push({x,y,t:0,max:0.6,kind:'ring',r:s.radius,col:'#ff9a6a'});explode(x,y,true);sfx('skill:shock',x,y,u);G.shake=Math.max(G.shake,7);break;
    case'hero_kaz:rampage':
      aoeAllies(team,u.x,u.y,s.radius,a=>addBuff(a,'rampage',1,12));
      G.fx.push({x:u.x,y:u.y,t:0,max:0.9,kind:'ring',r:s.radius,col:'#ff4d4d'});sfx('skill:rampage',u.x,u.y,u);break;
    case'hero_lyra:veil':
      aoeAllies(team,u.x,u.y,s.radius,a=>{if(!a.def.hero||true){a.revealT=0;addBuff(a,'cloak',1,6+2*lv);}});
      G.fx.push({x:u.x,y:u.y,t:0,max:0.9,kind:'ring',r:s.radius,col:'#a8ffe6'});sfx('skill:veil',u.x,u.y,u);break;
    case'hero_lyra:sing':
      G.zones.push({type:'sing',x,y,r:s.radius,t:0,max:3,team,acc:0});sfx('skill:sing',x,y,u);break;
    default:return false;}
  u.mana-=s.mana;u.cds[i]=s.cd;u.revealT=Math.max(u.revealT,1.2);
  if(team===0)uiDirty();return true;
}
function castStep(u,dt){
  const o=u.order,s=skillOf(u,o.i);
  if(!s||!canCast(u,o.i)){finishOrder(u);return;}
  if(s.target==='self'||hyp(u.x-o.x,u.y-o.y)<=s.range){if(s.target!=='self')u.ang=Math.atan2(o.y-u.y,o.x-u.x);castSkill(u,o.i,o.x,o.y);finishOrder(u);return;}
  navigate(u,o.x,o.y,dt,Math.max(8,s.range-20));
}
function learnSkill(team,i){
  const T=G.teams[team],H=T.hero,u=heroUnit(team);if(!u)return false;
  const s=skillOf(u,i),used=H.sk[0]+H.sk[1]+H.sk[2];
  if(!s||H.sk[i]>=s.max||used>=H.level||H.level<s.req[H.sk[i]])return false;
  H.sk[i]++;if(team===0)sfx('click');uiDirty();return true;
}
function skillPoints(team){const H=G.teams[team].hero;return H.level-(H.sk[0]+H.sk[1]+H.sk[2]);}
function applyAuras(){
  for(let t=0;t<2;t++){const u=heroUnit(t);if(!u)continue;const H=G.teams[t].hero,lv=H.sk[0];if(lv<=0)continue;{const ask=skillOf(u,0);if(ask&&G.tick%120===0)sfx('skill:'+ask.id,u.x,u.y,u);}
    aoeAllies(t,u.x,u.y,300,a=>{
      if(u.type==='hero_idris')addBuff(a,'banner',lv,0.8);
      else if(u.type==='hero_kaz')addBuff(a,'bloodlust',0.08*lv,0.8);
      else if(u.type==='hero_lyra'&&a.hp<a.maxhp&&a.def.tags.bio)a.hp=Math.min(a.maxhp,a.hp+1.5*lv*0.5);});}
}
function updateZones(dt){
  for(const z of G.zones){
    z.t+=dt;
    if(z.type==='orbital'&&!z.fired&&z.t>=z.max){z.fired=true;
      aoeEnemies(z.team,z.x,z.y,z.r,e=>damageEnt(e,e.kind==='building'?z.sdmg:z.dmg,z.team,null));
      G.fx.push({x:z.x,y:z.y,t:0,max:0.9,kind:'beam',r:z.r});explode(z.x,z.y,true);G.shake=Math.max(G.shake,12);G.decalDirty.push({x:z.x,y:z.y,r:z.r*0.6,k:'scorch'});}
    else if(z.type==='sing'&&z.t<z.max){
      z.acc+=dt;const tick=z.acc>=0.25;if(tick)z.acc-=0.25;
      aoeEnemies(z.team,z.x,z.y,z.r,e=>{
        if(e.kind==='unit'){const dx=z.x-e.x,dy=z.y-e.y,d=hyp(dx,dy);if(d>14)moveUnit(e,dx/d*85*dt,dy/d*85*dt);e.path=null;}
        if(tick)damageEnt(e,e.kind==='building'?3:6.25,z.team,null);});}}
  G.zones=G.zones.filter(z=>z.t<z.max+(z.type==='orbital'?0.9:0));
}

/* ------------------------------ buildings ----------------------------- */
function buildDetectors(){
  G.det[0].length=0;G.det[1].length=0;
  for(const u of G.units)if(!u.dead&&u.team<2&&u.def.detect&&!u.hidden)G.det[u.team].push({x:u.x,y:u.y,r:u.def.detect});
  for(const b of G.buildings)if(!b.dead&&b.done&&b.def.detect)G.det[b.team].push({x:b.x,y:b.y,r:b.def.detect});
}
function updateBuilding(b,dt){
  const d=b.def,T=G.teams[b.team];
  if(b.cd>0)b.cd-=dt;if(b.flash>0)b.flash-=dt;if(b.revealT>0)b.revealT-=dt;if(b.dmgFlash>0)b.dmgFlash-=dt;
  if(!b.done){
    if(b.nb>0){const dp=dt*(b.nb+2)/(3*d.time);b.prog=Math.min(1,b.prog+dp);b.hp=Math.min(b.maxhp,b.hp+b.maxhp*0.9*dp);}
    if(b.prog>=1){b.prog=1;b.done=true;if(G.camp)campNote('built',b.team,b.type);   // `built` condition counter (45_campaign.js)
      if(b.team===0&&!G.ais[0]){toast(d.name+' complete','good');sfx('done',undefined,undefined,b);}
      uiDirty();G.fx.push({x:b.x,y:b.y,t:0,max:0.8,kind:'ring',r:b.r*1.2,col:'#9fe8ff'});}
    return;}
  if(d.dmg){
    if(!validTarget(b,b.target)||edgeDist({x:b.x,y:b.y},b.target)>d.range)b.target=null;
    if(!b.target&&(G.tick+b.id)%6===0)b.target=acquire(b,d.range);
    if(b.target){b.ang=Math.atan2(b.target.y-b.y,b.target.x-b.x);if(b.cd<=0)fire(b,b.target);}
  }
  if(b.hp<b.maxhp*0.45&&G.tick%6===0)addPart(b.x+(Math.random()-.5)*b.w*TILE*0.6,b.y+(Math.random()-.5)*b.h*TILE*0.6,(Math.random()-.5)*8,-22,1.0,5+Math.random()*5,'#3a3f48',2);
  if(b.hp<b.maxhp*0.25&&G.tick%9===0)addPart(b.x+(Math.random()-.5)*b.w*TILE*0.5,b.y+(Math.random()-.5)*b.h*TILE*0.5,(Math.random()-.5)*10,-30,0.5,4,'#ff8a3a',1);
  const q=b.queue[0];
  if(q){
    q.t+=dt*moraleMul(b.team);
    if(q.t>=q.total){
      b.queue.shift();
      if(q.k==='u'){const nu=spawnUnit(b,q.id);if(b.team===0&&!G.ais[0])sfx('done',undefined,undefined,nu);}
      else if(q.k==='r'){const R=TECH[q.id];T[R.key]++;if(b.team===0&&!G.ais[0]){toast(R.name+' researched','good');sfx('research',undefined,undefined,b);}}
      else if(q.k==='era'){T.era=q.to;G.events.push({t:G.time,team:b.team,txt:'Era '+ERAS[q.to].rom});
        if(b.team===0&&!G.ais[0]){toast('Era '+ERAS[q.to].rom+': '+ERAS[q.to].name+' — new technology unlocked!','good');sfx('era',undefined,undefined,{faction:T.faction});}
        G.fx.push({x:b.x,y:b.y,t:0,max:1.4,kind:'ring',r:b.r*2.5,col:'#ffe27a'});}
      else if(q.k==='hero'){T.hero.reviving=false;const u=spawnUnit(b,FACTIONS[T.faction].hero);
        if(b.team===0&&!G.ais[0]){toast(u.def.name+' has arrived','good');sfx(q.revive?'heroRevive':'hero',undefined,undefined,u);}}
      uiDirty();}}
}
function neutralsStep(dt){
  for(const n of G.neutrals){
    if(n.type==='post'){n.demand=Math.min(1,n.demand+0.012*(1-n.demand)*dt+0.0003*dt);}
    else if(n.type==='tower'&&G.tick%5===0){
      let c0=0,c1=0;forNear(n.x,n.y,110,u=>{if(u.team>1||u.hidden)return;if(hyp(u.x-n.x,u.y-n.y)>100)return;if(u.team===0)c0++;else c1++;});
      const prev=n.ctrl;
      if(c0&&!c1)n.ctrl=0;else if(c1&&!c0)n.ctrl=1;else if(!c0&&!c1)n.ctrl=-1;
      if(prev!==n.ctrl&&n.ctrl===0&&!G.ais[0])toast('Watchtower captured','good');}
    n.pulse+=dt;}
}

/* ------------------------------ economy ------------------------------- */
function economyStep(dt){
  const m=G.mkt;
  // market: mean-reverting log-price (Ornstein–Uhlenbeck) with slow seasonal anchor
  const mu=1+0.15*Math.sin(G.time/110);m.p+=0.018*(mu-m.p)*dt+0.010*Math.sqrt(dt)*gauss();m.p=clamp(m.p,0.55,1.9);
  m.t+=dt;if(m.t>=3){m.t=0;m.hist.push(m.p);if(m.hist.length>90)m.hist.shift();}
  for(let t=0;t<2;t++){
    const T=G.teams[t];
    let forums=0;for(const b of G.buildings)if(!b.dead&&b.team===t&&b.done&&b.type==='forum')forums++;
    const hero=T.hero.alive?4:0;
    T.mt=clamp(56+TAX[T.tax].mor+6*Math.min(3,forums)+5*(T.era-1)+hero-Math.min(18,T.rl*1.5)+Math.min(10,T.rk*0.6),5,100);
    T.morale+=clamp(T.mt-T.morale,-2*dt,2*dt);
    T.rl*=Math.exp(-dt/45);T.rk*=Math.exp(-dt/45);
    const cap=T.hab*BDEF.habitat.cap;
    if(T.morale>=45&&T.colonists<cap)T.colonists=Math.min(cap,T.colonists+dt/3);else if(T.colonists>cap||T.morale<25)T.colonists=Math.max(0,T.colonists-dt*0.7);
    const inc=T.colonists*TAX[T.tax].inc*dt;T.c+=inc;T.taxEarn+=inc;
  }
}
function setTax(team,lv){G.teams[team].tax=clamp(lv,0,2);uiDirty();}
function dayNight(){
  G.daylight=clamp(0.5+0.85*Math.cos(TAU*(G.time/360-0.17)),0,1);
  G.sightMul=lerp(0.62,1,G.daylight);
  if(G.camp)campDaylight();   // mission setup.daylight 'day' / 'night' pins the cycle
}
function sampleStats(){
  const s={t:G.time};
  for(let t=0;t<2;t++){const T=G.teams[t];let army=0,work=0;
    for(const u of G.units)if(!u.dead&&u.team===t){if(u.def.worker)work++;else army+=u.def.supply;}
    s['a'+t]=army;s['w'+t]=work;s['m'+t]=T.mined;s['k'+t]=T.kills;s['e'+t]=T.era;s['tr'+t]=T.tradeEarn+T.taxEarn;}
  G.stats.push(s);
}
function endGame(res){
  if(G.over)return;G.over=res;G.overT=G.time;sampleStats();
  if(G.camp)campaignEnd(res);
  if(!G.ais[0])onGameOver(res);
}

/* ---------------------------- simulation step ------------------------- */
function step(){
  if(G.camp&&G.camp.hold)return;   // a blocking `dispatch` action card is open: the world stands still until campaignResume() (45_campaign.js)
  G.tick++;G.time+=TICK;G.pathBudget=16;
  dayNight();rebuildCells();recalcTeams();buildDetectors();
  for(const b of G.buildings){b.nb=b._cnt;b._cnt=0;}
  neutralsStep(TICK);
  for(const b of G.buildings)if(!b.dead)updateBuilding(b,TICK);
  for(const u of G.units)if(!u.dead)updateUnit(u,TICK);
  separate();
  for(const p of G.proj){
    const live=p.t&&!p.t.dead&&p.kind!=='shell';
    const tx=live?p.t.x:p.tx,ty=live?p.t.y:p.ty;
    const dx=tx-p.x,dy=ty-p.y,d=hyp(dx,dy),s=p.sp*TICK;p.life-=TICK;
    if(p.kind==='rocket'&&G.tick%2===0)addPart(p.x,p.y,0,0,0.3,3,'#bbb',2);
    if(d<=s||p.life<=0){p.x=tx;p.y=ty;p.dead=true;projHit(p);}else{p.x+=dx/d*s;p.y+=dy/d*s;}
  }
  for(const p of G.parts){p.x+=p.vx*TICK;p.y+=p.vy*TICK;p.vx*=0.95;p.vy*=0.95;p.life-=TICK;}
  for(const f of G.fx)f.t+=TICK;
  updateZones(TICK);
  for(let t=0;t<2;t++){const ai=G.ais[t];if(ai&&G.time>=ai.next){ai.next=G.time+ai.P.iv;aiThink(ai);}}
  economyStep(TICK);
  swarmStep(TICK);
  if(G.camp)campaignStep(TICK);   // 45_campaign.js: objectives, triggers, scripted events (5 Hz inside)
  if(G.tick%15===0)applyAuras();
  if(G.shake>0)G.shake=Math.max(0,G.shake-TICK*18);
  if(G.units.some(u=>u.dead))G.units=G.units.filter(u=>!u.dead);
  if(G.buildings.some(b=>b.dead))G.buildings=G.buildings.filter(b=>!b.dead);
  if(G.res.some(r=>r.dead))G.res=G.res.filter(r=>!r.dead);
  G.proj=G.proj.filter(p=>!p.dead);G.parts=G.parts.filter(p=>p.life>0);G.fx=G.fx.filter(f=>f.t<f.max);
  if(G.needBlocked)rebuildBlocked();
  if(G.tick%4===0){updateVision();onVision();}
  G.statT+=TICK;if(G.statT>=5){G.statT=0;sampleStats();}
  onStepEnd();
}
