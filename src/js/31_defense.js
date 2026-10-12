/* =========================================================================
   31_DEFENSE (v6-G1 FORTIFY) — SIM-SIDE (no DOM / canvas / audio / wall clock; Math.random only through the existing popOut).
   docs/DESIGN_FORTIFY.md §3.
     team views      G.bt[t] / G.compT[t] / G.refCompT[t]: team t's blocked grid and its connected components (own gates are open for it).
                     While no gate exists they ARE G.blocked / G.comp / G.refComp (aliases), so the v5 behaviour is bit-identical.
     breach rule     a ground unit whose goal is walled off attacks the first enemy structure on the cheapest breach route (never freezes).
     self-seal rule  walls may not cut any own Hub off from the map centre (gates count as open for their owner).
     defence step    mines, Repair Batteries, Fortress cannons, Scanner Sweeps, Hub energy, Sensor radar queries.
     map features    neutral rock formations + one rich crystal field per side (skirmish maps that ask for them: newGame({mapFx:true})).
   ========================================================================= */
let FP_SEALED=false;                                   // set by findPath(): the goal lies outside the walker's component (read right after the call)
const SEAL_BUF=new Uint8Array(NN),SEAL_SEEN=new Uint8Array(NN);

/* ------------------------------------------------------------------ team views of the blocked grid */
function fortLabel(B,comp){
  comp.fill(0);let n=0;
  for(let i=0;i<NN;i++){if(B[i]||comp[i])continue;n++;let h=0,t=0;compQ[t++]=i;comp[i]=n;
    while(h<t){const c=compQ[h++],cx=c%MW,cy=(c/MW)|0;
      for(let k=0;k<8;k++){const nx=cx+DX[k],ny=cy+DY[k];if(nx<0||ny<0||nx>=MW||ny>=MH)continue;const ni=ny*MW+nx;if(B[ni]||comp[ni])continue;
        if(k>=4&&(B[cy*MW+nx]||B[ny*MW+cx]))continue;comp[ni]=n;compQ[t++]=ni;}}}
  return n;
}
function fortRefComp(team,comp){
  const hub=G.buildings.find(e=>!e.dead&&e.team===team&&e.type==='hub')||G.buildings.find(e=>!e.dead&&e.team===team&&!e.def.noWin);if(!hub)return 0;
  for(let y=hub.ty-1;y<=hub.ty+hub.h;y++)for(let x=hub.tx-1;x<=hub.tx+hub.w;x++){if(x<0||y<0||x>=MW||y>=MH)continue;if(comp[y*MW+x]>0)return comp[y*MW+x];}
  return 0;
}
function fortTeamBlocked(){
  G.blkVer=(G.blkVer||0)+1;
  let gates=null,walls=0;for(const b of G.buildings)if(!b.dead){if(b.def.wall||b.def.rock)walls++;if(b.def.gate&&b.team<2)(gates||(gates=[])).push(b);}
  G.wallN=walls;   // the breach rule is active only while walls, gates or rocks exist (without them a v5 game is bit-identical)
  if(!gates){G.bt=[G.blocked,G.blocked];G.compT=[G.comp,G.comp];G.refCompT=G.refComp;return;}
  if(!G.btA)G.btA=[new Uint8Array(NN),new Uint8Array(NN)];if(!G.compA)G.compA=[new Int32Array(NN),new Int32Array(NN)];
  const B=G.btA;B[0].set(G.blocked);B[1].set(G.blocked);
  for(const g of gates){const m=g.gmode||'auto';if(m==='closed')continue;
    for(let y=0;y<g.h;y++)for(let x=0;x<g.w;x++){const i=(g.ty+y)*MW+g.tx+x;if(m==='open'){B[0][i]=0;B[1][i]=0;}else B[g.team][i]=0;}}
  G.bt=[B[0],B[1]];G.compT=[G.compA[0],G.compA[1]];
  fortLabel(B[0],G.compA[0]);fortLabel(B[1],G.compA[1]);
  G.refCompT=[fortRefComp(0,G.compA[0]),fortRefComp(1,G.compA[1])];
  // a gate that now blocks a unit standing in it pushes the unit out (like a building going up)
  for(const g of gates){const x0=g.tx*TILE,y0=g.ty*TILE,x1=x0+g.w*TILE,y1=y0+g.h*TILE;
    for(const u of G.units){if(u.dead||u.hidden||u.flying)continue;if(u.x>x0-u.r&&u.x<x1+u.r&&u.y>y0-u.r&&u.y<y1+u.r&&!canStand(u.x,u.y,u.team))popOut(u);}}
}
/* tile -> structure lookup for the breach search (derived data, rebuilt whenever the blocked grid changes) */
const FTM={g:null,ver:-1,arr:new Int32Array(NN),list:[]};
function fortTileMap(){
  if(FTM.g===G&&FTM.ver===G.blkVer)return FTM;
  FTM.g=G;FTM.ver=G.blkVer;FTM.arr.fill(0);FTM.list.length=0;
  for(const b of G.buildings){if(b.dead||b.def.noBlock)continue;FTM.list.push(b);const k=FTM.list.length;
    for(let y=0;y<b.h;y++)for(let x=0;x<b.w;x++)FTM.arr[(b.ty+y)*MW+b.tx+x]=k;}
  return FTM;
}

/* ------------------------------------------------------------------ placement rules */
function fortMineAt(tx,ty){for(const b of G.buildings)if(!b.dead&&b.def.mine&&b.tx===tx&&b.ty===ty)return b;return null;}
function fortPlaceOK(team,type,tx,ty){
  const d=BDEF[type];
  if(d.mine)return !fortMineAt(tx,ty);
  if(d.gate||team>1)return true;                       // a gate is open for its owner: it can never seal the owner in
  const tiles=[];for(let y=0;y<d.h;y++)for(let x=0;x<d.w;x++)tiles.push((ty+y)*MW+tx+x);
  return fortSealOK(team,tiles);
}
/* would blocking `tiles` (indices) cut any own Hub off from the map centre? true = still connected (legal) */
function fortSealOK(team,tiles){
  const hubs=G.buildings.filter(b=>!b.dead&&b.team===team&&b.type==='hub');if(!hubs.length)return true;
  const S=SEAL_BUF,V=SEAL_SEEN;S.set(blkOf(team));for(const i of tiles)if(i>=0&&i<NN)S[i]=1;V.fill(0);
  let c=-1;{const cx=MW>>1,cy=MH>>1;for(let r=0;r<12&&c<0;r++)for(let dy=-r;dy<=r&&c<0;dy++)for(let dx=-r;dx<=r;dx++){const i=(cy+dy)*MW+cx+dx;if(!S[i]){c=i;break;}}}
  if(c<0)return true;
  let h=0,t=0;compQ[t++]=c;V[c]=1;
  while(h<t){const k=compQ[h++],kx=k%MW,ky=(k/MW)|0;
    for(let j=0;j<8;j++){const nx=kx+DX[j],ny=ky+DY[j];if(nx<0||ny<0||nx>=MW||ny>=MH)continue;const ni=ny*MW+nx;if(S[ni]||V[ni])continue;
      if(j>=4&&(S[ky*MW+nx]||S[ny*MW+kx]))continue;V[ni]=1;compQ[t++]=ni;}}
  for(const hb of hubs){let ok=false;
    for(let y=hb.ty-1;y<=hb.ty+hb.h&&!ok;y++)for(let x=hb.tx-1;x<=hb.tx+hb.w;x++){if(x<0||y<0||x>=MW||y>=MH)continue;if(V[y*MW+x]){ok=true;break;}}
    if(!ok)return false;}
  return true;
}
function fortMineCount(team){
  let n=0;for(const b of G.buildings)if(!b.dead&&b.team===team&&b.def.mine)n++;
  for(const u of G.units){if(u.dead||u.team!==team||!u.def.worker)continue;
    const o=u.order;if(o.t==='build'&&o.type==='mine'&&!o.bld&&o.paid)n++;for(const q of u.oq)if(q.t==='build'&&q.type==='mine'&&q.paid)n++;}
  return n;
}
/* 8-connected Bresenham line of tiles from (x0,y0) to (x1,y1), at most `max` tiles */
function fortLineTiles(x0,y0,x1,y1,max){
  max=max||24;const out=[];let dx=Math.abs(x1-x0),dy=-Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1,err=dx+dy,x=x0,y=y0;
  for(;;){out.push([x,y]);if(out.length>=max||x===x1&&y===y1)break;const e2=2*err;if(e2>=dy){err+=dy;x+=sx;}if(e2<=dx){err+=dx;y+=sy;}}
  return out;
}
/* legality of a wall line: per tile (canPlace without the seal rule) and then the seal rule for all legal tiles at once */
function fortLinePlan(team,tiles,ignoreFog){
  const ok=[],bad=[],seen=new Set();
  for(const[tx,ty]of tiles){const k=ty*MW+tx;if(seen.has(k))continue;seen.add(k);
    let good=tx>=2&&ty>=2&&tx<MW-2&&ty<MH-2;
    if(good){const i=ty*MW+tx;good=!G.blocked[i]&&!G.RAMP[i]&&(ignoreFog||team!==0||G.vis[0][i]!==0)&&!fortMineAt(tx,ty)&&siteReach(team,tx,ty,1,1);}
    if(good)for(const u of G.units)if(!u.dead&&u.team===team&&u.def.worker){const o=u.order;if(o.t==='build'&&!o.bld&&o.tx===tx&&o.ty===ty){good=false;break;}if(u.oq.some(q=>q.t==='build'&&q.tx===tx&&q.ty===ty)){good=false;break;}}
    (good?ok:bad).push([tx,ty]);}
  const sealOK=ok.length?fortSealOK(team,ok.map(([x,y])=>y*MW+x)):true;
  return{ok,bad,sealOK};
}
/* order a wall line: legal segments are split over the workers in contiguous runs (<= 12 queued orders each) and queued like shift-orders */
function fortPlaceLine(team,workers,tiles,queue,ignoreFog){
  const T=G.teams[team],c=bCost(team,'wall');
  const L=reqBuild(team,'wall');if(!L.ok)return{ok:false,n:0,why:L.why};
  const P=fortLinePlan(team,tiles,ignoreFog);
  if(!P.ok.length)return{ok:false,n:0,why:'No free tile on that line'};
  if(!P.sealOK)return{ok:false,n:0,why:'That would seal your base in: leave a gap or build a Gate'};
  const afford=c.c>0?Math.floor(T.c/c.c):P.ok.length,list=P.ok.slice(0,Math.min(afford,P.ok.length));
  if(!list.length)return{ok:false,n:0,why:'Not enough crystals'};
  const W=workers.filter(u=>!u.dead&&u.def.worker&&!u.inside);if(!W.length)return{ok:false,n:0,why:'No Hauler selected'};
  const per=Math.min(12,Math.ceil(list.length/W.length));let n=0;
  const free=W.slice();
  for(let i=0;i<list.length&&free.length;i+=per){
    const run=list.slice(i,i+per),sx=(run[0][0]+.5)*TILE,sy=(run[0][1]+.5)*TILE;
    free.sort((a,b)=>hyp(a.x-sx,a.y-sy)-hyp(b.x-sx,b.y-sy)||a.id-b.id);const w=free.shift();
    const room=12-w.oq.length;let first=null,last=null;
    for(let k=0;k<run.length&&k<room;k++){const q=k>0||(queue&&w.order.t!=='idle');
      if(!orderBuild(w,'wall',run[k][0],run[k][1],q))break;n++;
      const o=q&&w.oq.length?w.oq[w.oq.length-1]:w.order;if(!first)first=o;last=o;}
    if(first&&last&&last!==first&&first.after){last.after=first.after;first.after=null;}}
  return{ok:n>0,n,skipped:P.bad.length};
}

/* ------------------------------------------------------------------ breach rule */
function fortSealed(u,gx,gy){
  if(!G.wallN||u.flying||u.team>1)return;const d=u.def;if(d.noWeapon||d.worker||!d.ground)return;
  const o=u.order.t;if(!(o==='attack'||o==='attackmove'||o==='idle'&&u.target))return;
  if(u.breach&&!u.breach.dead)return;if((u.brT||0)>G.time)return;u.brT=G.time+FORT.breachCd;
  const b=fortBreachSearch(u,gx,gy);if(b)u.breach=b;
}
/* A* in which enemy (and, at double cost, neutral) structure tiles are passable at a premium; the first such tile on the route names the breach target */
function fortBreachSearch(u,gx,gy){
  const team=u.team,B=blkOf(team),M=fortTileMap(),own=M.arr,list=M.list;
  const pass=i=>{if(!B[i])return 0;const k=own[i];if(!k)return -1;const b=list[k-1];if(b.team===team)return -1;return b.team===2?2:1;};
  const s=nearestFree(clamp(u.x/TILE|0,0,MW-1),clamp(u.y/TILE|0,0,MH-1),4,team);if(!s)return null;
  let gtx=clamp(gx/TILE|0,0,MW-1),gty=clamp(gy/TILE|0,0,MH-1);
  if(pass(gty*MW+gtx)<0){let f=null;for(let r=1;r<=3&&!f;r++)for(let dy=-r;dy<=r&&!f;dy++)for(let dx=-r;dx<=r;dx++){const x=gtx+dx,y=gty+dy;if(x<0||y<0||x>=MW||y>=MH)continue;if(pass(y*MW+x)>=0){f=[x,y];break;}}if(!f)return null;gtx=f[0];gty=f[1];}
  const start=s[1]*MW+s[0],goal=gty*MW+gtx;if(start===goal)return null;
  stampN++;hN.length=0;hK.length=0;gS[start]=0;par[start]=-1;openSt[start]=stampN;hPush(start,heur(s[0],s[1],gtx,gty));
  let iter=0,found=false;const pen=FORT.breachCost;
  while(hN.length&&iter<FORT.breachIter){
    const cur=hPop();if(closedSt[cur]===stampN)continue;closedSt[cur]=stampN;iter++;
    if(cur===goal){found=true;break;}
    const cx=cur%MW,cy=(cur/MW)|0;
    for(let k=0;k<8;k++){const nx=cx+DX[k],ny=cy+DY[k];if(nx<0||ny<0||nx>=MW||ny>=MH)continue;const ni=ny*MW+nx;if(closedSt[ni]===stampN)continue;
      const p=pass(ni);if(p<0)continue;if(k>=4&&(pass(cy*MW+nx)<0||pass(ny*MW+cx)<0))continue;
      const ng=gS[cur]+(k<4?1:1.4142)+(p?pen*p:0);
      if(openSt[ni]!==stampN||ng<gS[ni]){openSt[ni]=stampN;gS[ni]=ng;par[ni]=cur;hPush(ni,ng+heur(nx,ny,gtx,gty));}}}
  if(!found)return null;
  const tiles=[];let c=goal;while(c!==-1&&c!==start){tiles.push(c);c=par[c];}tiles.reverse();
  for(const i of tiles){const k=own[i];if(!k||!B[i])continue;const b=list[k-1];if(b.team!==team)return b;}   // the first blocker on the cheapest breach route
  return null;
}
/* per-unit hook (updateUnit, after the creep branch): cargo orders, then the breach target. true = this tick is handled */
function fortUnitStep(u,dt){
  const o=u.order;
  if(o.t==='load'){cargoLoadStep(u,dt);return true;}
  if(o.t==='unload'){cargoDropStep(u,dt);return true;}
  if(o.t==='pickup'){cargoPickupStep(u,dt);return true;}
  const b=u.breach;if(!b)return false;
  if(b.dead||b.team===u.team||!(o.t==='attack'||o.t==='attackmove'||o.t==='idle')||o.t==='attack'&&o.target===b||u.def.noWeapon){u.breach=null;return false;}
  if(u.target&&validTarget(u,u.target)&&edgeDist(u,u.target)<=rangeOf(u))return false;           // fight what is in range first
  if(o.t==='attack'&&validTarget(u,o.target)&&edgeDist(u,o.target)<=rangeOf(u))return false;
  if(o.t==='idle'&&!u.target){u.breach=null;return false;}
  engage(u,b,dt);return true;
}

/* ------------------------------------------------------------------ defence step (once per tick, after the units) */
function fortStep(dt){
  if(G.scans&&G.scans.length){for(const s of G.scans)s.t-=dt;if(G.scans.some(s=>s.t<=0))G.scans=G.scans.filter(s=>s.t>0);}
  for(const b of G.buildings){
    if(b.dead)continue;const d=b.def;
    if(b.type==='hub'){if(b.energy===undefined)b.energy=FORT.hubEnergy0;if(b.done)b.energy=Math.min(FORT.hubEnergyMax,b.energy+FORT.hubEnergyRate*dt);if(b.scd>0)b.scd-=dt;if(b.fort&&b.done)fortressFire(b,dt);continue;}
    if(!b.done)continue;
    if(d.mine){b.cloaked=true;if((G.tick+b.id)%3===0)mineCheck(b);continue;}
    if(d.healRate){if(b.healT>0)b.healT-=dt;if((G.tick+b.id)%8===0)batteryPulse(b,8*dt);}
  }
  cargoSync();
}
function mineCheck(m){
  const d=m.def,R=d.trigger;let hit=false;
  forNear(m.x,m.y,R+24,e=>{if(hit||e.dead||e.hidden||e.flying||e.team===m.team)return;if(hyp(e.x-m.x,e.y-m.y)-e.r<=R)hit=true;});
  if(!hit)return;
  m.dead=true;G.needBlocked=true;
  forNear(m.x,m.y,d.blast+30,e=>{if(e.dead||e.hidden||e.flying||e.team===m.team)return;if(hyp(e.x-m.x,e.y-m.y)-e.r<=d.blast)damageEnt(e,dmgVs(d.dmg,d.bon,e,false),m.team,m);});
  G.fx.push({x:m.x,y:m.y,t:0,max:0.45,kind:'ring',r:d.blast,col:'#ffb15a'});explode(m.x,m.y,false);G.decalDirty.push({x:m.x,y:m.y,r:d.blast*0.7,k:'scorch'});
  G.shake=Math.max(G.shake,3);sfx('mineBlast',m.x,m.y,m);
  G.events.push({t:G.time,team:m.team,txt:'Mine detonated'});
}
function batteryPulse(b,dt){
  const d=b.def,T=G.teams[b.team],R=d.healRange;let best=null,bf=0.999;
  forNear(b.x,b.y,R+30,e=>{if(e.dead||e.hidden||e.team!==b.team||e.hp>=e.maxhp)return;if(hyp(e.x-b.x,e.y-b.y)-e.r>R)return;const f=e.hp/e.maxhp;if(f<bf){bf=f;best=e;}});
  for(const e of G.buildings){if(e.dead||e===b||e.team!==b.team||!e.done||e.hp>=e.maxhp)continue;if(rectDist(b.x,b.y,e)>R)continue;const f=e.hp/e.maxhp;if(f<bf){bf=f;best=e;}}
  if(!best){b.healId=0;return;}
  const per=d.healCost*(T.faction==='meridian'?0.5:1);let h=Math.min(best.maxhp-best.hp,d.healRate*dt);
  if(per>0&&T.e<h*per)h=T.e/per;if(h<=0.01){b.healId=0;return;}
  T.e-=h*per;best.hp+=h;b.healId=best.id;b.healT=0.35;if(best.kind==='unit')best.healFx=0.3;
  if((G.tick+b.id)%24===0)sfx('batteryHeal',b.x,b.y,b);
}
function fortressFire(b,dt){
  const F=FORT.fortress;if(b.fcd>0){b.fcd-=dt;}
  let t=b.ftgt;
  if(t&&(t.dead||t.hidden||t.flying||!seen(b.team,t)||(t.kind==='unit'?hyp(t.x-b.x,t.y-b.y)-t.r:rectDist(b.x,b.y,t))>F.range))t=b.ftgt=null;
  if(!t&&(G.tick+b.id)%6===0){let bd=1e9;
    forNear(b.x,b.y,F.range+24,e=>{if(e.team===b.team||e.dead||e.hidden||e.flying)return;const dd=hyp(e.x-b.x,e.y-b.y)-e.r;if(dd>F.range||!seen(b.team,e))return;const s=dd+(e.def.worker?40:0);if(s<bd){bd=s;t=e;}});
    b.ftgt=t||null;}
  if(!t||b.fcd>0)return;
  const T=G.teams[b.team],base=F.dmg*(1+0.15*(T.wl||0));b.fcd=F.cd;b.fang=Math.atan2(t.y-b.y,t.x-b.x);
  G.proj.push({x:b.x,y:b.y-22,sx:b.x,sy:b.y,t,tx:t.x,ty:t.y,sp:F.pspd,kind:'shell',team:b.team,base,bon:F.bon,splash:F.splash,src:b,life:4,total:Math.max(1,hyp(t.x-b.x,t.y-b.y)),dead:false});
  sfx('fortFire',b.x,b.y,{type:'fortress',team:b.team});G.shake=Math.max(G.shake,1.5);
}

/* ------------------------------------------------------------------ detection, scans, radar */
function isDetectedBy(team,e){return isDetected(team,e);}   // public: e (cloaked unit or mine) is inside a detector circle of `team` (Hub, Turret, Mender, active scan; G2's Watcher adds itself to G.det)
function fortDetectors(){for(const s of G.scans)if(s.team<2)G.det[s.team].push({x:s.x,y:s.y,r:s.r});}
function fortVision(){
  for(const s of G.scans){if(s.team>1)continue;const v=G.vis[s.team],tr=s.r/TILE,cx=s.x/TILE,cy=s.y/TILE,r2=tr*tr;
    for(let y=Math.max(0,Math.floor(cy-tr));y<=Math.min(MH-1,Math.ceil(cy+tr));y++)for(let x=Math.max(0,Math.floor(cx-tr));x<=Math.min(MW-1,Math.ceil(cx+tr));x++){const dx=x+.5-cx,dy=y+.5-cy;if(dx*dx+dy*dy<=r2)v[y*MW+x]=2;}}
}
function fortScanHub(team){let best=null;for(const b of G.buildings)if(!b.dead&&b.team===team&&b.type==='hub'&&b.done&&(b.energy||0)>=FORT.scan.energy&&!(b.scd>0)&&(!best||b.energy>best.energy))best=b;return best;}
function fortScanWhy(team){
  if(G.camp){const L=campLocked(team,'building','scan');if(L)return L;}
  return fortScanHub(team)?'':'Needs a Hub with '+FORT.scan.energy+' energy';
}
function fortScan(team,x,y){
  const why=fortScanWhy(team);if(why){msg(team,why);return false;}
  const h=fortScanHub(team),S=FORT.scan;h.energy-=S.energy;h.scd=S.cd;
  (G.scans||(G.scans=[])).push({team,x:clamp(x,0,WW),y:clamp(y,0,WH),r:S.r,t:S.t,t0:S.t});
  G.fx.push({x,y,t:0,max:1.0,kind:'ring',r:S.r,col:'#7cd8ff'});sfx('scan',x,y,{team});
  if(team<2){G.det[team].push({x,y,r:S.r});fortVisionNow(team);}
  if(team===0)uiDirty();return true;
}
function fortVisionNow(team){fortVision();if(team===0&&typeof onVision==='function')onVision();}
let FSB={tick:-1,g:null,list:[]};
function fortSensorBlips(team){
  if(FSB.tick===G.tick&&FSB.g===G&&FSB.team===team)return FSB.list;
  const S=G.buildings.filter(b=>!b.dead&&b.done&&b.team===team&&b.def.radar),out=[];
  if(S.length)for(const u of G.units){if(u.dead||u.hidden||u.team===team||u.team>1)continue;if(seen(team,u))continue;if(u.cloaked&&!isDetected(team,u))continue;
    for(const s of S)if(hyp(u.x-s.x,u.y-s.y)<=s.def.radar){out.push({x:u.x,y:u.y,id:u.id,air:!!u.flying});break;}}
  FSB={tick:G.tick,g:G,team,list:out};return out;
}

/* ------------------------------------------------------------------ Hub upgrade, gates */
function fortressWhy(b){
  const T=G.teams[b.team],F=FORT.fortress;
  if(G.camp){const L=campLocked(b.team,'building','fortress');if(L)return L;}
  if(b.fort)return'Already a Fortress';if(!b.done)return'Under construction';
  if(b.queue.some(q=>q.k==='fort'))return'Upgrading';
  if(T.era<F.era)return'Requires Era '+ERAS[F.era].rom;if(!hasDone(b.team,F.req))return'Requires '+BDEF[F.req].name;
  if(b.queue.length>=5)return'Queue is full';
  if(!afford(T,F.cost))return T.c<F.cost.c?'Not enough crystals':'Not enough ether';
  return'';
}
function queueFortress(b){
  const why=fortressWhy(b);if(why){msg(b.team,why);return false;}
  const F=FORT.fortress;pay(G.teams[b.team],F.cost);b.queue.push({k:'fort',t:0,total:F.time});if(b.team===0){sfx('train',undefined,undefined,b);uiDirty();}return true;
}
function fortressDone(b){
  const F=FORT.fortress,r=b.hp/b.maxhp;b.fort=true;b.maxhp=Math.round(b.maxhp*F.hpMul);b.hp=Math.max(1,Math.round(b.maxhp*r));b.ghostHp=b.maxhp;b.armAdd=(b.armAdd||0)+F.armor;b.fcd=0;
  G.fx.push({x:b.x,y:b.y,t:0,max:1.2,kind:'ring',r:b.r*2,col:'#ffd27a'});G.events.push({t:G.time,team:b.team,txt:'Fortress'});
  if(b.team===0&&!G.ais[0]){toast('Command Hub fortified','good');sfx('fortress',b.x,b.y,b);}
  uiDirty();
}
function fortGateMode(b,mode){
  if(!b||b.dead||!b.def.gate||['auto','open','closed'].indexOf(mode)<0)return false;
  if((b.gmode||'auto')===mode)return true;b.gmode=mode;G.needBlocked=true;
  if(b.team===0)sfx(mode==='closed'?'gateClose':'gateOpen',b.x,b.y,b);uiDirty();return true;
}
function fortSalvage(b){
  if(!b||b.dead||!b.done||!b.def.salvage)return false;
  if(b.cargo&&b.cargo.length)cargoUnloadAll(b);
  const c=bCost(b.team,b.type);refund(b.team,{c:Math.floor(c.c*b.def.salvage),e:Math.floor(c.e*b.def.salvage)});
  b.dead=true;G.needBlocked=true;explode(b.x,b.y,false);if(b.team===0){sfx('cancel',b.x,b.y,b);uiDirty();}return true;
}

/* ------------------------------------------------------------------ map features (skirmish/random maps only: G.mapFx) */
/* rock formations: a line of 1x1 rock blocks straight across a corridor (10_map.js CORRIDORS), both ends against rock or cliff, mirrored for the other
   side; a formation is kept only if the map stays connected without that corridor (mapConnected with the rocks as terrain). */
function fortMapFeatures(rnd){
  const TT=G.TT,occ=new Uint8Array(NN);
  for(const r of G.res)for(let y=0;y<r.h;y++)for(let x=0;x<r.w;x++)occ[(r.ty+y)*MW+r.tx+x]=1;
  for(const n of G.neutrals)for(let y=-1;y<=n.h;y++)for(let x=-1;x<=n.w;x++){const i=(n.ty+y)*MW+n.tx+x;if(i>=0&&i<NN)occ[i]=1;}
  const near=(x,y)=>G.camps.some(c=>hyp(c.x/TILE-x,c.y/TILE-y)<4.5)||G.sites.some(s=>hyp(s.cx-x,s.cy-y)<8);
  const floor=(x,y,h0)=>x>=3&&y>=3&&x<MW-3&&y<MH-3&&TT[y*MW+x]===0&&!G.RAMP[y*MW+x]&&!occ[y*MW+x]&&G.H[y*MW+x]===h0;
  const wallT=(x,y)=>x<0||y<0||x>=MW||y>=MH||TT[y*MW+x]!==0;
  const line=(cx,cy,ux,uy)=>{const x0=Math.round(cx),y0=Math.round(cy);if(TT[y0*MW+x0]!==0)return null;const h0=G.H[y0*MW+x0],out=[[x0,y0]];
    for(const d of[1,-1]){let k=1;for(;k<=5;k++){const x=Math.round(cx+ux*k*d),y=Math.round(cy+uy*k*d);if(wallT(x,y))break;if(!floor(x,y,h0))return null;out.push([x,y]);}if(k>5)return null;}
    if(!floor(x0,y0,h0)||out.length<2||out.length>9||out.some(([x,y])=>near(x,y)))return null;return out;};
  const cands=[];
  for(const c of CORRIDORS)for(let k=0;k<c.length-1;k++){const[ax,ay]=c[k],[bx,by]=c[k+1],l=hyp(bx-ax,by-ay);if(l<6)continue;
    for(const f of[0.35,0.5,0.65]){const cx=lerp(ax,bx,f),cy=lerp(ay,by,f),ux=-(by-ay)/l,uy=(bx-ax)/l;
      const L=line(cx,cy,ux,uy),M=line(MW-1-cx,MH-1-cy,ux,uy);if(L&&M)cands.push({L,M,k:rnd()});}}
  cands.sort((a,b)=>a.k-b.k);
  let placed=0;
  for(const c of cands){if(placed>=2)break;
    const all=c.L.concat(c.M);if(all.some(([x,y])=>occ[y*MW+x]||TT[y*MW+x]!==0))continue;
    for(const[x,y]of all)TT[y*MW+x]=1;
    const okConn=mapConnected();
    for(const[x,y]of all)TT[y*MW+x]=0;
    if(!okConn)continue;
    for(const[x,y]of all){addBuilding('rocks',2,x,y,true);occ[y*MW+x]=1;}
    placed++;}
  G.rocksPlaced=placed;
}
