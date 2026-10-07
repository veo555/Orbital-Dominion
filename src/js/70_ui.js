/* =========================================================================
   UI (1/2) — state, selection, formations, context orders, command card
   ========================================================================= */
const SLOT_KEYS=['q','w','e','r','a','s','d','f','z','x','c','v'];
const ui={running:false,demo:false,sel:[],selSet:new Set(),activeType:null,menu:null,place:null,target:null,drag:null,mx:0,my:0,keys:{},groups:{},groupTap:{n:0,t:0},
  lastClick:{t:0,type:null,id:0},infoDirty:true,cmdDirty:true,mmDrag:false,midDrag:null,hover:null,pings:[],idleIdx:0,objOpen:true,panel:null,endAt:0,endRes:null,
  inc:[],lastInc:0,cmds:new Array(12).fill(null),lastAlert:-99,hintDone:{},seedOverride:null,lastAttackT:0,touchMode:false,selMode:false,qMode:false};

function uiDirty(){ui.infoDirty=ui.cmdDirty=true;}
function onVision(){ui.fogForce=true;}
function onStepEnd(){
  if(!G||ui.demo)return;
  if(G.alertT!==ui.lastAlert&&G.alertPos){ui.lastAlert=G.alertT;ui.pings.push({x:G.alertPos.x,y:G.alertPos.y,t:G.time,dur:3.2,col:'rgba(255,80,80,A)'});if(ui.pings.length>8)ui.pings.shift();}
  if(ui.pings.length&&G.time-ui.pings[0].t>ui.pings[0].dur)ui.pings.shift();
  if(G.time-ui.lastInc>=1){ui.lastInc=G.time;const T=G.teams[0];ui.inc.push({t:G.time,c:T.minedC+T.taxEarn+T.tradeEarn,e:T.minedE});if(ui.inc.length>40)ui.inc.shift();}
}
function onGameOver(res){platMatchStop();ui.endAt=performance.now()+2300;ui.endRes=res;sfx(res==='victory'?'win':'lose');say(res==='victory'?'Victory':'Defeat');}
function incomeRates(){
  const a=ui.inc;if(a.length<3)return{c:0,e:0};const f=a[0],l=a[a.length-1],dt=Math.max(1,l.t-f.t);
  return{c:(l.c-f.c)/dt*60,e:(l.e-f.e)/dt*60};
}
/* toast + speech */
const toastEl=()=>$('toast');
function toast(t,cls){
  const host=toastEl();if(!host||ui.demo)return;const el=document.createElement('div');el.className='tmsg'+(cls?' '+cls:'');el.textContent=t;host.appendChild(el);
  while(host.children.length>4)host.removeChild(host.firstChild);setTimeout(()=>{if(el.remove)el.remove();},3600);
  if(cls==='bad'){if(/Not enough crystals/.test(t))say('Not enough crystals');else if(/Not enough ether/.test(t))say('Not enough ether');else if(/Generators/.test(t))say('Supply blocked');else if(/Requires/.test(t)&&/Era/.test(t))say('New era required');}
}

/* ----------------------------- selection -------------------------------- */
const SEL_PRI=e=>e.kind==='building'?9:e.def.hero?0:e.def.heal?2:e.def.worker?8:e.def.trade?7:1;
function setSel(arr){
  arr=arr.filter(e=>e&&!e.dead);
  arr.sort((a,b)=>SEL_PRI(a)-SEL_PRI(b));
  ui.sel=arr;ui.selSet=new Set(arr);ui.activeType=arr.length?arr[0].type:null;ui.menu=null;ui.infoDirty=ui.cmdDirty=true;
  if(ui.target&&ui.target.kind!=='rally'&&!arr.some(e=>e.team===0))ui.target=null;
}
function entityAt(wx,wy,padPx){
  let best=null,bd=1e9;const pad=(padPx===undefined?5:padPx)/cam.z;
  for(const u of G.units){if(u.dead||u.hidden||!entVisible(u))continue;
    const yy=u.flying?u.y-16:u.y,d=hyp(u.x-wx,yy-wy);if(d<=u.r+pad&&d<bd){bd=d;best=u;}}
  if(best)return best;
  for(const b of G.buildings){if(b.dead||!entVisible(b))continue;
    if(wx>=b.tx*TILE&&wx<=(b.tx+b.w)*TILE&&wy>=b.ty*TILE-4&&wy<=(b.ty+b.h)*TILE)return b;}
  for(const n of G.neutrals){if(!ui.demo&&G.vis[0][n.ty*MW+n.tx]===0)continue;if(wx>=n.tx*TILE&&wx<=(n.tx+n.w)*TILE&&wy>=n.ty*TILE&&wy<=(n.ty+n.h)*TILE)return n;}
  for(const r of G.res){if(r.dead||G.vis[0][clamp(r.ty,0,MH-1)*MW+clamp(r.tx,0,MW-1)]===0)continue;
    if(wx>=r.tx*TILE-4&&wx<=(r.tx+r.w)*TILE+4&&wy>=r.ty*TILE-4&&wy<=(r.ty+r.h)*TILE+4)return r;}
  return null;
}
function ownUnits(){return ui.sel.filter(e=>e.team===0&&e.kind==='unit');}
function ownBuildings(){return ui.sel.filter(e=>e.team===0&&e.kind==='building');}
function clickSelect(wx,wy,shift,now,ctrl,pre){
  const ent=pre!==undefined?pre:entityAt(wx,wy);
  if(!ent){if(!shift)setSel([]);return;}
  const dbl=ui.lastClick.id===ent.id&&now-ui.lastClick.t<380;ui.lastClick={t:now,type:ent.type,id:ent.id};
  if(ent.team===0&&(ent.kind==='unit'||ent.kind==='building')){
    if(dbl||ctrl){
      const list=ent.kind==='unit'?G.units.filter(u=>!u.dead&&!u.hidden&&u.team===0&&u.type===ent.type&&onScreen(u.x,u.y,0)):G.buildings.filter(b=>!b.dead&&b.team===0&&b.type===ent.type&&onScreen(b.x,b.y,0));
      setSel(list.slice(0,80));ui.lastClick.t=0;return;}
    if(shift){const cur=ui.sel.filter(e=>e.team===0&&e.kind===ent.kind);const i=cur.indexOf(ent);if(i>=0)cur.splice(i,1);else cur.push(ent);setSel(cur.slice(0,80));return;}
  }
  setSel([ent]);
}
function boxSelect(d,shift){
  const x0=Math.min(d.x0,d.x1),x1=Math.max(d.x0,d.x1),y0=Math.min(d.y0,d.y1),y1=Math.max(d.y0,d.y1);let found=[];
  for(const u of G.units){if(u.dead||u.hidden||u.team!==0)continue;const p=w2s(u.x,u.y-(u.flying?16:0));if(p.x>=x0&&p.x<=x1&&p.y>=y0&&p.y<=y1)found.push(u);}
  if(found.some(u=>!u.def.worker))found=found.filter(u=>!u.def.worker);
  if(found.length){const base=shift?ui.sel.filter(e=>e.kind==='unit'&&e.team===0):[];setSel(base.concat(found.filter(f=>!base.includes(f))).slice(0,100));}
  else if(!shift){
    const bl=[];for(const b of G.buildings){if(b.dead||b.team!==0)continue;const p=w2s(b.x,b.y);if(p.x>=x0&&p.x<=x1&&p.y>=y0&&p.y<=y1)bl.push(b);}
    if(bl.length){const t=bl[0].type;setSel(bl.filter(b=>b.type===t));}else setSel([]);}
}
function groupSet(n,add){
  const own=ui.sel.filter(e=>e.team===0);if(!own.length)return;
  const ids=add?(ui.groups[n]||[]).concat(own.map(e=>e.id)):own.map(e=>e.id);ui.groups[n]=Array.from(new Set(ids));
  toast((add?'Added to group ':'Group ')+n+' ('+ui.groups[n].length+')','good');ui.groupsDirty=true;sfx('click');
}
function groupEntities(n){
  const ids=ui.groups[n];if(!ids||!ids.length)return[];const set=new Set(ids),arr=[];
  for(const u of G.units)if(!u.dead&&set.has(u.id))arr.push(u);for(const b of G.buildings)if(!b.dead&&set.has(b.id))arr.push(b);return arr;
}
function groupRecall(n){
  const arr=groupEntities(n);if(!arr.length)return;const now=performance.now();
  if(ui.groupTap.n===n&&now-ui.groupTap.t<380){centerOn(arr.reduce((s,e)=>s+e.x,0)/arr.length,arr.reduce((s,e)=>s+e.y,0)/arr.length);}
  ui.groupTap={n,t:now};setSel(arr);
}
function idleWorkers(){return G.units.filter(u=>!u.dead&&u.team===0&&u.def.worker&&u.order.t==='idle'&&!u.hidden&&!u.garr);}
function selectIdle(){const l=idleWorkers();if(!l.length){toast('No idle Haulers','good');return;}ui.idleIdx=(ui.idleIdx+1)%l.length;const u=l[ui.idleIdx];setSel([u]);centerOn(u.x,u.y);}
function selectArmy(){const l=G.units.filter(u=>!u.dead&&u.team===0&&!u.def.worker&&!u.def.trade&&!u.hidden);if(!l.length){toast('No army units','bad');return;}setSel(l.slice(0,100));sfx('click');}
function selectHero(){const h=heroUnit(0);if(!h){toast('Your hero is not in play — train or revive at the Hub (W)','bad');return;}
  if(ui.sel.length===1&&ui.sel[0]===h)centerOn(h.x,h.y);else{setSel([h]);centerOn(h.x,h.y);}}
function goHub(){const h=G.buildings.find(b=>b.team===0&&b.type==='hub'&&!b.dead);if(h){centerOn(h.x,h.y);}}

/* ----------------------------- formations ------------------------------- */
function formationSpots(n,x,y,dx,dy,sp){
  const cols=Math.max(1,Math.ceil(Math.sqrt(n*1.6))),px=-dy,py=dx,spots=[];
  for(let i=0;i<n;i++){const r=Math.floor(i/cols),c=i%cols,inRow=Math.min(cols,n-r*cols),ox=(c-(inRow-1)/2)*sp,oy=-r*sp;spots.push({x:x+px*ox+dx*oy,y:y+py*ox+dy*oy,front:-oy});}
  return spots;
}
function ping(x,y,col){G.fx.push({x,y,t:0,max:0.55,kind:'ping',col});}
function issueGroup(units,x,y,kind,queue){
  if(!units.length)return;
  units=units.filter(u=>!(u.sieged&&false));
  const cx=units.reduce((s,u)=>s+u.x,0)/units.length,cy=units.reduce((s,u)=>s+u.y,0)/units.length;
  let dx=x-cx,dy=y-cy;const dd=hyp(dx,dy);if(dd<1){dx=0;dy=-1;}else{dx/=dd;dy/=dd;}
  const sp=Math.max(22,Math.max(...units.map(u=>u.r))*2+6);
  const spots=formationSpots(units.length,x,y,dx,dy,sp).sort((a,b)=>b.front-a.front);
  const sorted=units.slice().sort((a,b)=>hyp(a.x-x,a.y-y)-hyp(b.x-x,b.y-y));
  const gs=dd>260?Math.min(...units.filter(u=>!u.def.worker||units.every(w=>w.def.worker)).map(u=>u.def.speed)):0;
  sorted.forEach((u,i)=>{let p=spots[i];
    if(!u.flying){const tx=clamp(p.x/TILE|0,0,MW-1),ty=clamp(p.y/TILE|0,0,MH-1);if(G.blocked[ty*MW+tx]){const f=nearestFree(tx,ty,6);if(f)p={x:(f[0]+.5)*TILE,y:(f[1]+.5)*TILE};}}
    const t=kind==='attack'&&!u.def.worker&&!u.def.noWeapon?'attackmove':'move';
    setOrder(u,{t,x:p.x,y:p.y,gs:gs&&!u.def.worker?gs:0},queue);});
  ping(x,y,kind==='attack'?'#ff6a5a':'#6dff9d');sfx('ack');
}
function setRally(b,wx,wy,ent){
  let r={x:wx,y:wy,res:null,post:null};
  if(ent){
    if(ent.kind==='building'&&ent.team===0&&ent.type==='siphon'&&ent.res)ent=ent.res;
    if(ent.kind==='res'&&(ent.type==='crystal'||geyserOK(ent,0)))r={x:ent.x,y:ent.y,res:ent,post:null};
    else if(ent.kind==='neutral'&&ent.type==='post')r={x:ent.x,y:ent.y,res:null,post:ent};}
  b.rally=r;ping(r.x,r.y,'#7cffb0');sfx('click');
}
function gatherOrder(u,res){return{t:'gather',res,st:u.carry>0&&u.carryType===(res.type==='crystal'?'c':'e')?'ret':'go',hx:res.x,hy:res.y};}
function contextCommand(wx,wy,shift){
  const own=ui.sel.filter(e=>e.team===0);if(!own.length)return;
  let ent=entityAt(wx,wy);
  if(own[0].kind==='building'){for(const b of own)if(b.kind==='building'&&b.done&&(b.def.prod||prodList(b).length))setRally(b,wx,wy,ent);return;}
  const units=own.filter(e=>e.kind==='unit');if(!units.length)return;
  const workers=units.filter(u=>u.def.worker),fighters=units.filter(u=>!u.def.noWeapon&&!u.def.worker),freighters=units.filter(u=>u.def.trade);
  // an own finished Ether Siphon means "work the geyser underneath" — this is the ether-harvest fix
  if(ent&&ent.kind==='building'&&ent.team===0&&ent.type==='siphon'&&ent.done&&ent.res&&!ent.res.dead&&workers.length)ent=ent.res;
  if(ent&&ent.kind==='res'){
    const others=units.filter(u=>!u.def.worker);
    for(const u of workers){if(ent.type==='geyser'&&!geyserOK(ent,0)){setOrder(u,{t:'move',x:ent.x,y:ent.y+TILE},shift);msg(0,'Build an Ether Siphon on the geyser first');continue;}setOrder(u,gatherOrder(u,ent),shift);}
    if(others.length)issueGroup(others,ent.x,ent.y+TILE,'move',shift);
    ping(ent.x,ent.y,'#f6c04a');sfx('ack');return;}
  if(ent&&ent.team!==0&&ent.team!==undefined&&(ent.kind==='unit'||ent.kind==='building')){
    for(const u of units){if(!u.def.noWeapon&&!u.def.worker&&canAttack(u.def,ent))setOrder(u,{t:'attack',target:ent},shift);else if(!u.def.worker||units.length===workers.length)setOrder(u,{t:'move',x:ent.x,y:ent.y},shift);}
    ping(ent.x,ent.y,'#ff6a5a');sfx('ack');return;}
  if(ent&&ent.kind==='neutral'){
    if(ent.type==='post'&&freighters.length){
      if(!hasDone(0,'exchange')){msg(0,'Freighters need an Exchange first');}
      else{for(const u of freighters)setOrder(u,{t:'trade',post:ent,st:'toPost'},shift);ping(ent.x,ent.y,'#ffd45a');sfx('ack');}
      const rest=units.filter(u=>!u.def.trade);if(rest.length)issueGroup(rest,ent.x,ent.y+TILE*1.6,'move',shift);return;}
    issueGroup(units,ent.x,ent.y+TILE*1.6,'move',shift);return;}
  if(ent&&ent.kind==='building'&&ent.team===0){
    if(!ent.done&&workers.length){for(const u of workers)setOrder(u,{t:'build',type:ent.type,tx:ent.tx,ty:ent.ty,paid:false,st:'go',bld:ent,after:null},shift);ping(ent.x,ent.y,'#7cc4ff');sfx('ack');return;}
    if(ent.done&&ent.hp<ent.maxhp&&workers.length){for(const u of workers)setOrder(u,{t:'repair',target:ent},shift);ping(ent.x,ent.y,'#7cc4ff');sfx('ack');return;}
    if(ent.done&&ent.def.dropoff&&workers.some(u=>u.carry>0)){for(const u of workers.filter(w=>w.carry>0))setOrder(u,{t:'gather',res:null,st:'ret',hx:u.x,hy:u.y},shift);}
  }
  if(ent&&ent.kind==='unit'&&ent.team===0&&ent.hp<ent.maxhp&&ent.def.tags.mech&&!ent.def.worker&&workers.length&&!workers.includes(ent)){
    for(const u of workers)setOrder(u,{t:'repair',target:ent},shift);ping(ent.x,ent.y,'#7cc4ff');sfx('ack');return;}
  issueGroup(units,wx,wy,'move',shift);
}
function beginTarget(kind){ui.target={kind};ui.place=null;}
function beginPlace(id){
  const r=reqBuild(0,id);if(!r.ok){msg(0,r.why);return;}
  ui.place={id,tx:0,ty:0,ok:false,why:''};ui.target=null;
  if(ui.touchMode){ui.mx=VW/2;ui.my=TOPBAR+(VH-TOPBAR-BOTTOM)/2;}
  updatePlaceGhost();
}
function updatePlaceGhost(){
  const p=ui.place;if(!p)return;const d=BDEF[p.id],w=s2w(ui.mx,ui.my),wx=w.x,wy=w.y;
  if(d.onGeyser){let best=null,bd=3.2*TILE;for(const r of G.res){if(r.dead||r.type!=='geyser')continue;const dd=hyp(r.x-wx,r.y-wy);if(dd<bd){bd=dd;best=r;}}
    if(best){p.tx=best.tx;p.ty=best.ty;p.ok=canPlace(0,p.id,p.tx,p.ty);}else{p.tx=Math.round(wx/TILE-1);p.ty=Math.round(wy/TILE-1);p.ok=false;}}
  else{p.tx=Math.round(wx/TILE-d.w/2);p.ty=Math.round(wy/TILE-d.h/2);p.ok=canPlace(0,p.id,p.tx,p.ty);}
  p.why='';
  if(!p.ok){let unexp=false,ramp=false,step=false;const h0=G.H[clamp(p.ty,0,MH-1)*MW+clamp(p.tx,0,MW-1)];
    for(let y=0;y<d.h;y++)for(let x=0;x<d.w;x++){const tx=p.tx+x,ty=p.ty+y;if(!inMap(tx,ty))continue;const i=ty*MW+tx;if(G.vis[0][i]===0)unexp=true;if(G.RAMP[i])ramp=true;if(G.H[i]!==h0)step=true;}
    p.why=d.onGeyser?'Needs an ether geyser':(unexp?'Unexplored':ramp?'Cannot build on a ramp':step?'Uneven ground':'Blocked');}
}
function tryPlace(shift){
  const p=ui.place;if(!p)return;
  if(!p.ok){msg(0,'Cannot build here: '+(p.why||'blocked').toLowerCase());return;}
  const ws=ownUnits().filter(u=>u.def.worker);if(!ws.length){ui.place=null;return;}
  const d=BDEF[p.id],cx=(p.tx+d.w/2)*TILE,cy=(p.ty+d.h/2)*TILE;
  ws.sort((a,b)=>(a.carry>0)-(b.carry>0)||hyp(a.x-cx,a.y-cy)-hyp(b.x-cx,b.y-cy));
  const r=reqBuild(0,p.id);if(!r.ok){msg(0,r.why);ui.place=null;return;}
  if(orderBuild(ws[0],p.id,p.tx,p.ty,shift&&ws[0].order.t!=='idle')){ping(cx,cy,'#7cc4ff');sfx('click');}
  if(!shift||!reqBuild(0,p.id).ok)ui.place=null;
}
function cancelConstruction(b){
  if(b.done||b.dead||b.team!==0)return;const c=bCost(0,b.type);refund(0,{c:Math.floor(c.c*0.75),e:Math.floor(c.e*0.75)});
  b.dead=true;G.needBlocked=true;if(b.res)b.res.siphon=null;explode(b.x,b.y,false);sfx('click');toast('Construction cancelled — 75% refunded','good');setSel(ui.sel.filter(e=>e!==b));
}
function cmdStop(){for(const u of ownUnits()){setOrder(u,{t:'idle'});goIdle(u);}sfx('click');}
function cmdHold(){for(const u of ownUnits()){if(u.def.worker||u.def.noWeapon){setOrder(u,{t:'idle'});goIdle(u);}else setOrder(u,{t:'hold'});}sfx('click');}
function castHero(i){
  const h=heroUnit(0);if(!h)return;const s=skillOf(h,i);if(!s||s.passive)return;
  if(!canCast(h,i)){const H=G.teams[0].hero;toast(H.sk[i]<=0?'Learn this skill first (Z)':h.cds[i]>0?'Skill is recharging':'Not enough mana','bad');return;}
  if(s.target==='self'){setOrder(h,{t:'cast',i,x:h.x,y:h.y});}else beginTarget('skill'+i);
}
/* production: choose the building with the shortest queue among the selection */
function pickBuilding(pred){
  const bs=ownBuildings().filter(b=>b.done&&pred(b));if(!bs.length)return null;bs.sort((a,b)=>a.queue.length-b.queue.length);return bs[0];
}

/* ---------------------------- command card ------------------------------ */
function hitsText(d){return d.air&&d.ground?'ground & air':d.air?'air only':'ground only';}
function bonText(d){const k=Object.keys(d.bon||{});return k.map(t=>'+'+d.bon[t]+' vs '+TAGNAME[t]).join(', ');}
function buildCommands(){
  const c=new Array(12).fill(null);if(!G||!ui.sel.length)return c;
  const first=ui.sel[0];if(first.team!==0)return c;
  const T=G.teams[0];
  const mk=(i,o)=>{o.hk=SLOT_KEYS[i];c[i]=o;};
  if(first.kind==='unit'){
    const units=ownUnits(),act=units.find(u=>u.type===ui.activeType)||units[0],d=act.def,hasWorker=units.some(u=>u.def.worker);
    if(ui.menu==='build'||ui.menu==='build2'){
      const page=BUILD_PAGES[ui.menu==='build'?0:1];
      page.forEach((id,i)=>{const bd=BDEF[id],r=reqBuild(0,id),cost=bCost(0,id);
        mk(i,{icon:'b:'+id+':'+T.faction,name:bd.name,cost,time:bd.time,tip:bd.desc,ok:r.ok,why:r.why,supply:bd.supply?'+'+bd.supply+' supply':'',def:bd,isB:true,run:()=>beginPlace(id)});});
      mk(11,{icon:'g:back',name:'Back',tip:'Return to unit commands.',ok:true,run:()=>{ui.menu=null;ui.cmdDirty=true;}});
      return c;}
    if(ui.menu==='roles'&&G.sw){
      const ru=units.filter(u=>!u.def.hero&&!u.def.creep);
      let roles=ROLE_ORDER.filter(r=>ru.some(u=>canRole(u,r)));if(roles.length>10)roles=ROLE_ORDER.filter(r=>canRole(act,r));
      roles.forEach((r,i)=>{const R=ROLES[r],n=ru.filter(u=>u.ag&&u.ag.auto&&u.ag.role===r).length;
        mk(i,{icon:'r:'+r,name:R.n,tip:R.d+(SW_POINT_ROLES[r]?' <br><span class=\'ok\'>Then click a spot on the map'+(r==='escort'?' (a friendly unit)':'')+'.</span>':r==='assault'?' <br><span class=\'warn\'>Marches on the enemy base immediately.</span>':''),ok:true,badge:n||'',run:()=>{swAssignRole(r);ui.menu=null;}});});
      mk(10,{icon:'g:auto',name:'Auto — Overseer decides',tip:'Hand the choice back: the Overseer assigns these units by price signal and need.',ok:true,run:()=>{swAutoMode(ru);ui.menu=null;}});
      mk(11,{icon:'g:back',name:'Back',tip:'Return to unit commands.',ok:true,run:()=>{ui.menu=null;ui.cmdDirty=true;}});
      return c;}
    if(ui.menu==='learn'&&d.hero){
      const H=T.hero;
      for(let i=0;i<3;i++){const s=SKILLS[act.type][i],lv=H.sk[i],can=lv<s.max&&skillPoints(0)>0&&H.level>=s.req[lv];
        mk(5+i,{icon:'g:'+s.id,name:'Learn '+s.name,tip:s.desc(Math.min(s.max,lv+1))+(lv>=s.max?' (maxed)':' — requires hero level '+s.req[Math.min(lv,s.req.length-1)]+'.'),ok:can,why:lv>=s.max?'Maxed':skillPoints(0)<=0?'No skill points':'Requires hero level '+s.req[lv],badge:lv+'/'+s.max,run:()=>{learnSkill(0,i);ui.cmdDirty=true;}});}
      mk(11,{icon:'g:back',name:'Back',tip:'Return to unit commands.',ok:true,run:()=>{ui.menu=null;ui.cmdDirty=true;}});
      return c;}
    mk(0,{icon:'g:move',name:'Move',tip:'Move to a location. Right-click does this too. Shift queues waypoints.',ok:true,run:()=>beginTarget('move')});
    mk(1,{icon:'g:stop',name:'Stop',tip:'Cancel all orders.',ok:true,run:cmdStop});
    mk(2,{icon:'g:hold',name:'Hold Position',tip:'Stay put and fire at anything in range.',ok:true,run:cmdHold});
    if(units.some(u=>!u.def.noWeapon&&!u.def.worker))mk(4,{icon:'g:attack',name:'Attack-Move',tip:'Advance and engage everything on the way.',ok:true,run:()=>beginTarget('attack')});
    if(hasWorker){
      mk(3,{icon:'g:repair',name:'Repair',tip:'Repair a damaged structure or mechanical unit. Costs '+(T.faction==='meridian'?'half of ':'')+'a share of its price. Right-click a damaged ally also repairs.',ok:true,run:()=>beginTarget('repair')});
      mk(8,{icon:'g:build',name:'Build Structure',tip:'Basic structures: Hub, Generator, Siphon, Depot, Garrison, Armory, Habitat, Turret.',ok:true,run:()=>{ui.menu='build';ui.cmdDirty=true;}});
      mk(9,{icon:'g:build2',name:'Advanced Structures',tip:'Era II structures: Forum, Exchange, Foundry, Airfield.',ok:T.era>=2||true,run:()=>{ui.menu='build2';ui.cmdDirty=true;}});
      const hub=G.buildings.find(b=>b.team===0&&b.type==='hub'&&b.done&&!b.dead);
      if(hub)mk(10,{icon:'g:call',name:hub.garr.length?'Release Haulers':'Call to Arms',tip:'Up to 15 Haulers shelter inside the Hub and add +3 damage each to its cannon. Press again to release them.',ok:true,run:()=>callToArms(0,hub)});
    }
    if(act.def.stim)mk(3,{icon:'g:stim',name:'Overdrive',tip:'Stim: +50% speed and fire rate for 8s at 12 HP. Requires Combat Stims.',ok:T.stims>0,why:'Research Combat Stims at the Armory',run:()=>{for(const u of units)if(u.def.stim)useStim(u);sfx('click');}});
    if(act.def.siege)mk(5,{icon:'g:siege',name:units.some(u=>u.sieged)?'Unsiege':'Siege Mode',tip:'Siege Mode (S): range 350, splash and heavy structure damage, but immobile. Ground targets only.',ok:true,run:()=>{const on=units.some(u=>u.sieged);for(const u of units)if(u.def.siege)toggleSiege(u,on?true:false);}});
    if(act.def.trade)mk(3,{icon:'g:trade',name:'Trade Route',tip:'Pick a Trading Post. The Freighter shuttles between it and your Exchange. Profit grows with distance and with the post\'s demand.',ok:hasDone(0,'exchange'),why:'Requires an Exchange',run:()=>beginTarget('trade')});
    if(d.hero){
      const H=T.hero,sp=skillPoints(0);
      mk(3,{icon:'g:learn',name:'Learn Skills',tip:'Spend skill points. The hero gains one point per level.',ok:sp>0,why:'No skill points',badge:sp>0?sp:'',run:()=>{ui.menu='learn';ui.cmdDirty=true;}});
      for(let i=0;i<3;i++){const s=SKILLS[act.type][i],lv=H.sk[i];
        mk(5+i,{icon:'g:'+s.id,name:s.name+(s.passive?' (aura)':''),tip:s.desc(Math.max(1,lv)),ok:s.passive?false:canCast(act,i),why:s.passive?'Passive aura':lv<=0?'Not learned (Z)':act.cds[i]>0?'Recharging':'Not enough mana',
          cost:s.mana?{c:0,e:0,mana:s.mana}:null,badge:lv>0?'★'.repeat(lv):'',cd:()=>s.cd?clamp(act.cds[i]/s.cd,0,1):0,run:()=>castHero(i)});}
    }
    const cand=units.filter(u=>!u.def.hero&&!u.def.creep);
    if(cand.length&&G.sw){
      const enr=cand.filter(u=>u.ag&&u.ag.auto),allIn=enr.length===cand.length;
      mk(11,{icon:'g:agent',name:allIn?'Release Agents':'Enroll as Agents',tip:allIn?'Return these units to plain orders. They keep their level and gear.':'Make these units autonomous agents: they choose and carry out work themselves (mine, build, guard, scout…), earn a wallet, level up and buy gear. J switches the whole Swarm AI on or off; Enter lets you instruct the Overseer in words.',ok:true,badge:enr.length||'',run:()=>swEnrollToggle(units)});
      if(enr.length&&!c[7])mk(7,{icon:'g:roles',name:'Assign Role',tip:'Give the agents a specific job: Miner, Etherworker, Builder, Guard, Patrol, Hunter, Raider, Escort, Medic… or leave it to the Overseer.',ok:true,run:()=>{ui.menu='roles';ui.cmdDirty=true;}});
    }
    return c;
  }
  if(first.kind!=='building')return c;
  const b=ownBuildings().find(x=>x.type===ui.activeType)||first;
  if(!b.done){mk(9,{icon:'g:cancel',name:'Cancel Construction',tip:'Stop building and recover 75% of the cost.',ok:true,run:()=>cancelConstruction(b)});return c;}
  let i=0;
  const prod=prodList(b);
  for(const id of prod){const d=UDEF[id],r=reqUnit(0,id),q=ownBuildings().reduce((s,x)=>s+x.queue.filter(z=>z.k==='u'&&z.id===id).length,0);
    mk(i++,{icon:'u:'+id+':'+T.faction,name:d.name,cost:uCost(0,id),time:uTime(0,id),tip:d.desc,ok:r.ok,why:r.why,supply:d.supply+' supply',def:d,badge:q||'',run:()=>{const bb=pickBuilding(x=>prodList(x).includes(id)&&x.queue.length<5)||b;queueUnit(bb,id);}});}
  if(b.type==='hub'){
    const hid=FACTIONS[T.faction].hero,hd=UDEF[hid],H=T.hero,hc=heroCost(0);
    const hLock=G.camp?campLocked(0,'hero',hid):null,busy=H.alive||H.reviving,ok=!busy&&!hLock&&afford(T,hc)&&T.used+hd.supply<=T.cap;   // hLock: campaign hero policy 'none'
    mk(i++,{icon:'u:'+hid+':'+T.faction,name:(H.deaths>0?'Revive ':'Train ')+hd.name,cost:hc,time:H.deaths>0?30+5*H.level:hd.time,tip:hd.desc+' Levels up by fighting; gains skills and auras.',ok,def:hd,supply:'3 supply',
      why:hLock||(H.alive?'Hero is in play':H.reviving?'Hero is being trained':!afford(T,hc)?(T.c<hc.c?'Not enough crystals':'Not enough ether'):'Build more Generators'),run:()=>queueHero(b)});
    if(T.era<3){const E=ERAS[T.era+1],eLock=G.camp?campLocked(0,'era',T.era+1):null,ok2=!eLock&&afford(T,E.cost)&&(T.era===1?hasDone(0,'garrison'):hasDone(0,'armory'))&&!G.buildings.some(x=>!x.dead&&x.team===0&&x.queue.some(q=>q.k==='era'));
      mk(i++,{icon:'g:era',name:'Advance to Era '+E.rom+': '+E.name,cost:E.cost,time:E.time,tip:'Unlocks '+(T.era===1?'Rocketeers, Menders, Howitzers, Juggernauts, Skiffs, the Forum, Exchange, Foundry, Airfield and unique units.':'Titans, level 3 upgrades and +5 morale per era.')+' Needs '+(T.era===1?'a Garrison.':'an Armory.'),ok:ok2,
        why:eLock||(G.buildings.some(x=>!x.dead&&x.team===0&&x.queue.some(q=>q.k==='era'))?'Already advancing':!hasDone(0,T.era===1?'garrison':'armory')?'Requires '+(T.era===1?'Garrison':'Armory'):T.c<E.cost.c?'Not enough crystals':'Not enough ether'),run:()=>queueEra(b)});}
    mk(i++,{icon:'g:call',name:b.garr.length?'Release Haulers':'Call to Arms',tip:'Up to 15 Haulers shelter inside the Hub; each adds +3 damage to the Hub cannon. Press again to release them.',ok:true,badge:b.garr.length||'',run:()=>callToArms(0,b)});
  }
  if(b.def.research)for(const id of b.def.research){const R=TECH[id],lv=techLevel(T,id),L=techNext(T,id),qd=ownBuildings().some(x=>x.queue.some(q=>q.k==='r'&&q.id===id));
    if(!L){mk(i++,{icon:'g:'+R.icon,name:R.name+' (max)',tip:R.desc,ok:false,why:'Fully researched',run:()=>{}});continue;}
    mk(i++,{icon:'g:'+R.icon,name:R.name+(R.lv.length>1?' '+['I','II','III'][lv]:''),cost:{c:L.c,e:L.e},time:L.time,tip:R.desc,ok:afford(T,L)&&!qd&&T.era>=L.era,badge:lv?'Lv'+lv:'',
      why:qd?'Already researching':T.era<L.era?'Requires Era '+ERAS[L.era].rom:T.c<L.c?'Not enough crystals':'Not enough ether',run:()=>{const bb=pickBuilding(x=>x.def.research&&x.def.research.includes(id)&&!x.queue.some(q=>q.k==='r'&&q.id===id)&&x.queue.length<5);if(bb)queueResearch(bb,id);}});}
  if(b.type==='exchange')mk(i++,{icon:'g:market',name:'Open Market',tip:'Trade crystals and ether on the shared market (M). Prices follow a random walk; your own trades move the price.',ok:true,run:()=>togglePanel('eco')});
  if(b.type==='habitat'||b.type==='forum')mk(i++,{icon:'g:tax',name:'Economy Panel',tip:'Open the economy panel: morale, taxes and colonists (M).',ok:true,run:()=>togglePanel('eco')});
  if(b.queue.length)mk(9,{icon:'g:cancel',name:'Cancel Last',tip:'Cancel the last queued item (full refund).',ok:true,run:()=>{const bb=ownBuildings().filter(x=>x.queue.length).sort((x,y)=>y.queue.length-x.queue.length)[0];if(bb)cancelQueue(bb,bb.queue.length-1);}});
  if(prod.length||b.type==='hub')mk(10,{icon:'g:rally',name:'Set Rally Point',tip:'New units go here. Right-click does this too — rally on a crystal or an Ether Siphon and Haulers start mining automatically.',ok:true,run:()=>beginTarget('rally')});
  return c;
}
function runCmd(i){
  const c=ui.cmds[i];if(!c)return;
  if(!c.ok){if(c.why){toast(c.why,'bad');sfx('err');}return;}
  c.run();ui.cmdDirty=true;
}
