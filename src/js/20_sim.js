/* =========================================================================
   SIMULATION CORE — state, entities, geometry, vision, pathfinding, orders
   ========================================================================= */
let G=null;
const NOGFX=(typeof window!=='undefined'&&window.__NOGFX);

function mkTeam(faction){
  return{c:500,e:0,used:0,cap:0,wl:0,al:0,stims:0,mining:0,compress:0,cargo:0,kills:0,lost:0,mined:0,minedC:0,minedE:0,mult:1,era:1,faction,pal:FACTIONS[faction].col,
    morale:62,mt:62,tax:1,rl:0,rk:0,colonists:0,hab:0,taxEarn:0,tradeEarn:0,tradeMul:faction==='aurora'?1.3:1,built:0,sold:0,
    hero:{alive:false,level:1,xp:0,sk:[0,0,0],uid:0,reviving:false},idleAlert:0};
}
function mkG(seed,diff,f0,f1){
  return{seed,diff,time:0,tick:0,nextId:1,units:[],buildings:[],res:[],neutrals:[],camps:[],proj:[],parts:[],fx:[],decals:[],zones:[],
    blocked:new Uint8Array(NN),vis:[new Uint8Array(NN),new Uint8Array(NN)],cells:Array.from({length:CW*CH},()=>[]),
    teams:[mkTeam(f0),mkTeam(f1),{c:0,e:0,used:0,cap:0,wl:0,al:0,pal:NEUTRAL_COL,faction:'neutral',era:1}],ais:[null,null],over:null,paused:false,speed:1,pathBudget:0,
    alertPos:null,alertT:-99,needBlocked:false,daylight:1,sightMul:1,mkt:{p:1,hist:[1],t:0,vol:0},rng:mulberry32(seed^0xabcdef),
    det:[[],[]],stats:[],statT:0,events:[],shake:0,terrainCv:null,mmBg:null,decalDirty:[],lastAlertT:-99,fightT:0,popups:0};
}
function newGame(opts){
  opts=opts||{};if(opts.campaign)opts=campaignOpts(opts);   // 45_campaign.js: seed/faction/enemy/diff default to the mission's setup
  const diff=opts.diff||'normal',f0=opts.faction||'meridian';
  let seed=opts.seed!==undefined?opts.seed:((Math.random()*1e9)|0),att=0,f1=opts.enemy&&opts.enemy!=='random'?opts.enemy:null;
  if(!f1){const others=FACTION_IDS.filter(f=>f!==f0);f1=others[Math.floor(mulberry32(seed+3)()*others.length)];}
  if(f1===f0)f1=FACTION_IDS.find(f=>f!==f0);
  do{G=mkG(seed+att*131,diff,f0,f1);genMap();att++;}while(!mapConnected()&&att<30);
  G.mapAttempts=att;
  for(let t=0;t<2;t++){
    const s=G.sites[t],hub=addBuilding('hub',t,s.tx,s.ty,true);
    for(let i=0;i<6;i++){const a=i/6*TAU+0.3,u=addUnit('hauler',t,s.cx*TILE+Math.cos(a)*92,s.cy*TILE+Math.sin(a)*92);
      const r=nearestRes(s.cx*TILE,s.cy*TILE,'crystal');if(r)setOrder(u,{t:'gather',res:r,st:'go',hx:r.x,hy:r.y});}
    G.teams[t].hubId=hub.id;
  }
  rebuildBlocked();
  G.ais[1]=makeAI(1,DIFF[diff]);
  if(opts.aiBoth)G.ais[0]=makeAI(0,DIFF[diff]);
  recalcTeams();
  for(let i=0;i<3;i++)updateVision();
  G.sampleT=0;
  swarmInit();
  if(opts.campaign)campaignInit(opts.campaign,opts);   // 45_campaign.js: applies the mission's setup, creates G.camp
  return G;
}

/* ----------------------------- entities ------------------------------ */
function addUnit(type,team,x,y){
  const d=UDEF[type];
  const u={id:G.nextId++,kind:'unit',type,def:d,team,x,y,hp:d.hp,maxhp:d.hp,r:d.r,flying:d.flying,order:{t:'idle'},oq:[],path:null,pi:0,target:null,cd:0,ang:Math.random()*TAU,
    carry:0,carryType:null,hidden:false,inRes:null,ngx:0,ngy:0,repathCd:0,stuck:0,stuckT:0,lx:x,ly:y,flash:0,home:{x,y},chasing:false,returning:false,moving:false,dead:false,
    buffs:[],spdMul:1,atkMul:1,dmgMul:1,armAdd:0,stunned:0,revealT:0,cloaked:false,energy:d.energy||0,sieged:false,siegeT:0,cds:[0,0,0],mana:d.mana||0,camp:-1,provoked:0,garr:0,
    healFx:0,gsCap:0,lastHit:-99,bornT:G.time,wob:Math.random()*6};
  if(d.hero&&team<2){const H=G.teams[team].hero;H.alive=true;H.uid=u.id;heroApply(u,true);}
  G.units.push(u);return u;
}
function heroApply(u,full){
  const H=G.teams[u.team].hero,d=u.def,l=H.level,ratio=full?1:u.hp/u.maxhp;
  u.maxhp=Math.round(d.hp*(1+0.14*(l-1)));u.hp=full?u.maxhp:Math.min(u.maxhp,Math.round(u.maxhp*ratio));
  u.mana=Math.min(u.mana,heroMaxMana(u));if(full)u.mana=heroMaxMana(u)*0.6;
}
function heroMaxMana(u){return u.def.mana+10*(G.teams[u.team].hero.level-1);}
function addBuilding(type,team,tx,ty,done){
  const d=BDEF[type],mul=(team<2&&G.teams[team].faction==='meridian')?1.2:1,mhp=Math.round(d.hp*mul);
  const b={id:G.nextId++,kind:'building',type,def:d,team,tx,ty,w:d.w,h:d.h,x:(tx+d.w/2)*TILE,y:(ty+d.h/2)*TILE,hp:done?mhp:Math.round(mhp*0.1),maxhp:mhp,r:Math.max(d.w,d.h)*TILE/2,
    done:!!done,prog:done?1:0,queue:[],rally:null,cd:0,target:null,ang:0,flash:0,res:null,seen0:false,seen1:false,dead:false,flying:false,
    nb:0,_cnt:0,garr:[],revealT:0,cloaked:false,bornT:G.time,smoke:0,ghostHp:mhp,dmgFlash:0,tower:false};
  G.buildings.push(b);rebuildBlocked();
  if(type==='siphon'){const g=G.res.find(r=>!r.dead&&r.type==='geyser'&&r.tx===tx&&r.ty===ty);if(g){g.siphon=b;b.res=g;}}
  return b;
}
function rebuildBlocked(){
  const b=G.blocked;for(let i=0;i<NN;i++)b[i]=G.TT[i]!==0?1:0;
  for(const r of G.res){if(r.dead)continue;for(let y=0;y<r.h;y++)for(let x=0;x<r.w;x++)b[(r.ty+y)*MW+r.tx+x]=1;}
  for(const e of G.buildings){if(e.dead)continue;for(let y=0;y<e.h;y++)for(let x=0;x<e.w;x++)b[(e.ty+y)*MW+e.tx+x]=1;}
  for(const n of G.neutrals){for(let y=0;y<n.h;y++)for(let x=0;x<n.w;x++)b[(n.ty+y)*MW+n.tx+x]=1;}
  G.needBlocked=false;labelComps();
}
/* connected walkable regions — lets placement and pathing reject unreachable targets cheaply */
const compQ=new Int32Array(NN);
function labelComps(){
  const comp=G.comp||(G.comp=new Int32Array(NN)),b=G.blocked;comp.fill(0);let n=0;
  for(let i=0;i<NN;i++){if(b[i]||comp[i])continue;n++;let h=0,t=0;compQ[t++]=i;comp[i]=n;
    while(h<t){const c=compQ[h++],cx=c%MW,cy=(c/MW)|0;
      for(let k=0;k<8;k++){const nx=cx+DX[k],ny=cy+DY[k];if(nx<0||ny<0||nx>=MW||ny>=MH)continue;const ni=ny*MW+nx;if(b[ni]||comp[ni])continue;
        if(k>=4&&(b[cy*MW+nx]||b[ny*MW+cx]))continue;comp[ni]=n;compQ[t++]=ni;}}}
  G.nComp=n;G.refComp=[0,0];
  for(let t=0;t<2;t++){
    const hub=G.buildings.find(e=>!e.dead&&e.team===t&&e.type==='hub')||G.buildings.find(e=>!e.dead&&e.team===t);if(!hub)continue;
    out:for(let y=hub.ty-1;y<=hub.ty+hub.h;y++)for(let x=hub.tx-1;x<=hub.tx+hub.w;x++){if(x<0||y<0||x>=MW||y>=MH)continue;if(comp[y*MW+x]>0){G.refComp[t]=comp[y*MW+x];break out;}}}
}
function siteReach(team,tx,ty,w,h){
  const ref=G.refComp&&G.refComp[team];if(!ref)return true;
  for(let y=ty-1;y<=ty+h;y++)for(let x=tx-1;x<=tx+w;x++){if(x<0||y<0||x>=MW||y>=MH)continue;if(x>=tx&&x<tx+w&&y>=ty&&y<ty+h)continue;if(G.comp[y*MW+x]===ref)return true;}
  return false;
}
function nearestRes(x,y,type,freeOnly,maxD,team){
  let best=null,bd=maxD||1e9;
  for(const r of G.res){if(r.dead||r.type!==type||r.amount<=0)continue;if(freeOnly&&r.users.length>=r.cap)continue;
    if(type==='geyser'&&team!==undefined&&!geyserOK(r,team))continue;
    const d=hyp(r.x-x,r.y-y);if(d<bd){bd=d;best=r;}}
  return best;
}
function removeRes(r){r.dead=true;G.needBlocked=true;}

/* ----------------------------- geometry ------------------------------ */
function inMap(x,y){return x>=0&&y>=0&&x<MW&&y<MH;}
function freeT(x,y){return x>=0&&y>=0&&x<MW&&y<MH&&!G.blocked[y*MW+x];}
function tileOf(x,y){return clamp(y/TILE|0,0,MH-1)*MW+clamp(x/TILE|0,0,MW-1);}
function heightAt(x,y){return G.H[tileOf(x,y)];}
function canStand(x,y){const r=8,b=G.blocked;
  const x0=Math.floor((x-r)/TILE),x1=Math.floor((x+r)/TILE),y0=Math.floor((y-r)/TILE),y1=Math.floor((y+r)/TILE);
  if(x0<0||y0<0||x1>=MW||y1>=MH)return false;
  return!(b[y0*MW+x0]||b[y0*MW+x1]||b[y1*MW+x0]||b[y1*MW+x1]);}
function losClear(x0,y0,x1,y1){const d=hyp(x1-x0,y1-y0),n=Math.ceil(d/10);
  for(let i=1;i<=n;i++){const t=i/n;if(!canStand(x0+(x1-x0)*t,y0+(y1-y0)*t))return false;}return true;}
function nearestFree(tx,ty,maxR){
  if(freeT(tx,ty))return[tx,ty];
  for(let r=1;r<=maxR;r++){let best=null,bd=1e9;
    for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){if(Math.max(Math.abs(dx),Math.abs(dy))!==r)continue;
      if(freeT(tx+dx,ty+dy)){const d=dx*dx+dy*dy;if(d<bd){bd=d;best=[tx+dx,ty+dy];}}}
    if(best)return best;}
  return null;
}
function rectDist(px,py,e){const x0=e.tx*TILE,y0=e.ty*TILE,x1=x0+e.w*TILE,y1=y0+e.h*TILE;
  return hyp(Math.max(x0-px,0,px-x1),Math.max(y0-py,0,py-y1));}
function edgeDist(u,t){return t.kind==='unit'?hyp(t.x-u.x,t.y-u.y)-t.r:rectDist(u.x,u.y,t);}
function approachPoint(e,fx,fy){
  const x0=e.tx*TILE,y0=e.ty*TILE,x1=x0+e.w*TILE,y1=y0+e.h*TILE,nx=clamp(fx,x0,x1),ny=clamp(fy,y0,y1);
  let dx=fx-nx,dy=fy-ny,d=hyp(dx,dy);if(d<0.01){dx=0;dy=1;d=1;}
  return{x:nx+dx/d*10,y:ny+dy/d*10};}
function turn(a,b,k){let d=b-a;while(d>Math.PI)d-=TAU;while(d<-Math.PI)d+=TAU;return a+d*Math.min(1,k);}
function popOut(u){const f=nearestFree(clamp(u.x/TILE|0,0,MW-1),clamp(u.y/TILE|0,0,MH-1),8);
  if(f){u.x=(f[0]+.5)*TILE+(Math.random()-.5)*8;u.y=(f[1]+.5)*TILE+(Math.random()-.5)*8;}u.path=null;}

/* ----------------------------- pathfinding --------------------------- */
const gS=new Float32Array(NN),par=new Int32Array(NN),openSt=new Uint32Array(NN),closedSt=new Uint32Array(NN);
let stampN=0;const hN=[],hK=[];
const DX=[1,-1,0,0,1,1,-1,-1],DY=[0,0,1,-1,1,-1,1,-1];
function hPush(n,k){let i=hN.length;hN.push(n);hK.push(k);while(i>0){const p=(i-1)>>1;if(hK[p]<=k)break;hN[i]=hN[p];hK[i]=hK[p];i=p;}hN[i]=n;hK[i]=k;}
function hPop(){const top=hN[0],ln=hN.pop(),lk=hK.pop(),n=hN.length;
  if(n>0){let i=0;while(true){let c=2*i+1;if(c>=n)break;if(c+1<n&&hK[c+1]<hK[c])c++;if(hK[c]>=lk)break;hN[i]=hN[c];hK[i]=hK[c];i=c;}hN[i]=ln;hK[i]=lk;}
  return top;}
function heur(x,y,gx,gy){const dx=Math.abs(x-gx),dy=Math.abs(y-gy);return dx+dy-0.5858*Math.min(dx,dy);}
function findPath(sx,sy,gx,gy){
  const s=nearestFree(clamp(sx/TILE|0,0,MW-1),clamp(sy/TILE|0,0,MH-1),4);if(!s)return null;
  let gtx=clamp(gx/TILE|0,0,MW-1),gty=clamp(gy/TILE|0,0,MH-1);
  const g0=nearestFree(gtx,gty,10);if(!g0)return null;
  let snapped=g0[0]!==gtx||g0[1]!==gty;gtx=g0[0];gty=g0[1];
  const start=s[1]*MW+s[0];let goal=gty*MW+gtx;
  if(G.comp&&G.comp[goal]!==G.comp[start]){ // goal is in a sealed-off region: head for the nearest reachable tile instead
    let bt=-1,bd=1e9;const R=14;
    for(let dy=-R;dy<=R;dy++)for(let dx=-R;dx<=R;dx++){const x=gtx+dx,y=gty+dy;if(x<0||y<0||x>=MW||y>=MH)continue;const i=y*MW+x;if(G.comp[i]!==G.comp[start])continue;const d2=dx*dx+dy*dy;if(d2<bd){bd=d2;bt=i;}}
    if(bt<0)return[];gtx=bt%MW;gty=(bt/MW)|0;goal=bt;snapped=true;}
  if(start===goal)return[{x:snapped?(gtx+.5)*TILE:gx,y:snapped?(gty+.5)*TILE:gy}];
  stampN++;hN.length=0;hK.length=0;
  gS[start]=0;par[start]=-1;openSt[start]=stampN;
  let best=start,bestH=heur(s[0],s[1],gtx,gty);hPush(start,bestH);
  const blocked=G.blocked;let iter=0;
  while(hN.length&&iter<9000){
    const cur=hPop();if(closedSt[cur]===stampN)continue;closedSt[cur]=stampN;iter++;
    if(cur===goal){best=goal;break;}
    const cx=cur%MW,cy=(cur/MW)|0,hh=heur(cx,cy,gtx,gty);if(hh<bestH){bestH=hh;best=cur;}
    for(let k=0;k<8;k++){
      const nx=cx+DX[k],ny=cy+DY[k];if(nx<0||ny<0||nx>=MW||ny>=MH)continue;
      const ni=ny*MW+nx;if(blocked[ni]||closedSt[ni]===stampN)continue;
      if(k>=4&&(blocked[cy*MW+nx]||blocked[ny*MW+cx]))continue;
      const ng=gS[cur]+(k<4?1:1.4142);
      if(openSt[ni]!==stampN||ng<gS[ni]){openSt[ni]=stampN;gS[ni]=ng;par[ni]=cur;hPush(ni,ng+heur(nx,ny,gtx,gty));}
    }
  }
  const tiles=[];let c=best;while(c!==-1&&c!==start){tiles.push(c);c=par[c];}tiles.reverse();
  const pts=tiles.map(i=>({x:((i%MW)+.5)*TILE,y:(((i/MW)|0)+.5)*TILE}));
  if(best===goal&&!snapped&&pts.length)pts[pts.length-1]={x:gx,y:gy};
  const out=[];let ax=sx,ay=sy,i=0;
  while(i<pts.length){let j=pts.length-1;while(j>i&&!losClear(ax,ay,pts[j].x,pts[j].y))j--;out.push(pts[j]);ax=pts[j].x;ay=pts[j].y;i=j+1;}
  return out;
}
/* length (tiles) of the real walking route — used for trade profit */
function pathLength(ax,ay,bx,by){
  const p=findPath(ax,ay,bx,by);if(!p||!p.length)return hyp(bx-ax,by-ay)/TILE;
  let L=0,x=ax,y=ay;for(const q of p){L+=hyp(q.x-x,q.y-y);x=q.x;y=q.y;}return L/TILE;
}

/* ------------------------------ vision ------------------------------- */
function isDetected(team,e){
  const L=G.det[team];if(!L)return false;
  for(let i=0;i<L.length;i++){const d=L[i],dx=e.x-d.x,dy=e.y-d.y;if(dx*dx+dy*dy<=d.r*d.r)return true;}
  return false;
}
function inFog(team,e){
  const v=G.vis[team];
  if(e.kind==='building'){for(const x of[e.tx,e.tx+e.w-1])for(const y of[e.ty,e.ty+e.h-1])if(v[y*MW+x]===2)return true;return false;}
  return v[tileOf(e.x,e.y)]===2;
}
function seen(team,e){
  if(team===2)return!e.cloaked;
  if(e.team===team)return true;
  if(e.revealT>0&&!e.cloaked)return true;
  if(!inFog(team,e))return false;
  if(e.cloaked&&!isDetected(team,e))return false;
  return true;
}
function updateVision(){
  for(let t=0;t<2;t++){const v=G.vis[t];for(let i=0;i<NN;i++)if(v[i]===2)v[i]=1;}
  const sm=G.sightMul,vh=G.vh;
  const mark=(t,x,y,r,uh,all)=>{const v=G.vis[t],tr=r/TILE,cx=x/TILE,cy=y/TILE,x0=Math.max(0,Math.floor(cx-tr)),x1=Math.min(MW-1,Math.ceil(cx+tr)),
    y0=Math.max(0,Math.floor(cy-tr)),y1=Math.min(MH-1,Math.ceil(cy+tr)),r2=tr*tr;
    for(let yy=y0;yy<=y1;yy++)for(let xx=x0;xx<=x1;xx++){const dx=xx+.5-cx,dy=yy+.5-cy;if(dx*dx+dy*dy<=r2){const i=yy*MW+xx;if(all||vh[i]<=uh+0.51)v[i]=2;}}};
  for(const u of G.units){if(u.dead||u.team>1)continue;
    mark(u.team,u.x,u.y,u.def.sight*sm,u.flying?9:G.H[tileOf(u.x,u.y)],u.flying);}
  for(const b of G.buildings){if(b.dead)continue;mark(b.team,b.x,b.y,(b.done?b.def.sight:120)*sm,G.H[tileOf(b.x,b.y)],false);}
  for(const n of G.neutrals){if(n.type==='tower'&&n.ctrl>=0)mark(n.ctrl,n.x,n.y,20*TILE,9,true);}
  if(G.camp&&G.camp.reveals.length)campReveal();   // mission `reveal` actions: timed live vision for the player
  for(const b of G.buildings){if(b.dead)continue;
    if(b.team===1&&!b.seen0&&inFog(0,b))b.seen0=true;
    if(b.team===0&&!b.seen1&&inFog(1,b))b.seen1=true;}
}

/* --------------------------- spatial hash ---------------------------- */
function rebuildCells(){
  for(const c of G.cells)c.length=0;
  for(const u of G.units){if(u.dead||u.hidden)continue;G.cells[clamp(u.y/CS|0,0,CH-1)*CW+clamp(u.x/CS|0,0,CW-1)].push(u);}
}
function forNear(x,y,rad,fn){
  const c0=clamp((x-rad)/CS|0,0,CW-1),c1=clamp((x+rad)/CS|0,0,CW-1),r0=clamp((y-rad)/CS|0,0,CH-1),r1=clamp((y+rad)/CS|0,0,CH-1);
  for(let cy=r0;cy<=r1;cy++)for(let cx=c0;cx<=c1;cx++){const a=G.cells[cy*CW+cx];for(let i=0;i<a.length;i++)fn(a[i]);}
}

/* ------------------------------ economy ------------------------------ */
function afford(T,c){return T.c>=c.c&&T.e>=c.e;}
function pay(T,c){T.c-=c.c;T.e-=c.e;}
function refund(team,c){const T=G.teams[team];T.c+=c.c;T.e+=c.e;}
function hasDone(team,type){for(const b of G.buildings)if(!b.dead&&b.team===team&&b.done&&b.type===type)return true;return false;}
function countB(team,type,doneOnly){let n=0;for(const b of G.buildings)if(!b.dead&&b.team===team&&b.type===type&&(!doneOnly||b.done))n++;return n;}
function bCost(team,id){
  const d=BDEF[id],T=G.teams[team];let c={c:d.cost.c,e:d.cost.e};
  if(id==='exchange'&&T.faction==='aurora'){c.c=Math.round(c.c*0.6);c.e=Math.round(c.e*0.6);}
  return c;
}
function uCost(team,id){
  const d=UDEF[id],T=G.teams[team];let c={c:d.cost.c,e:d.cost.e};
  if(id==='raptor'&&T.faction==='obsidian'){c.c=60;c.e=15;}
  return c;
}
function uTime(team,id){let t=UDEF[id].time;if(G.teams[team].faction==='obsidian')t*=0.92;return t;}
function reqBuild(team,id){
  const d=BDEF[id],T=G.teams[team];
  if(G.camp){const L=campLocked(team,'building',id);if(L)return{ok:false,why:L};}
  if(T.era<d.era)return{ok:false,why:'Requires Era '+ERAS[d.era].rom};
  if(d.req&&!hasDone(team,d.req))return{ok:false,why:'Requires '+BDEF[d.req].name};
  const c=bCost(team,id);if(T.c<c.c)return{ok:false,why:'Not enough crystals'};if(T.e<c.e)return{ok:false,why:'Not enough ether'};return{ok:true};}
function reqUnit(team,id){
  const d=UDEF[id],T=G.teams[team];
  if(G.camp){const L=campLocked(team,'unit',id);if(L)return{ok:false,why:L};}
  if(T.era<d.era)return{ok:false,why:'Requires Era '+ERAS[d.era].rom};
  if(id==='titan'&&!hasDone(team,'foundry'))return{ok:false,why:'Requires Foundry'};
  const c=uCost(team,id);if(T.c<c.c)return{ok:false,why:'Not enough crystals'};if(T.e<c.e)return{ok:false,why:'Not enough ether'};
  if(T.used+d.supply>T.cap)return{ok:false,why:T.cap>=MAXSUP?'Supply limit reached':'Build more Generators'};return{ok:true};}
function prodList(b){
  if(b.type==='garrison'){const T=G.teams[b.team];return['rifleman','raptor','rocketeer','mender',FACTIONS[T.faction].unique];}
  return b.def.prod||[];
}
function queueUnit(b,id){
  if(!b.done||b.dead)return false;
  const T=G.teams[b.team],d=UDEF[id];
  if(b.queue.length>=5){msg(b.team,'Queue is full');return false;}
  const r=reqUnit(b.team,id);if(!r.ok){msg(b.team,r.why);return false;}
  pay(T,uCost(b.team,id));T.used+=d.supply;b.queue.push({k:'u',id,t:0,total:uTime(b.team,id)});
  if(b.team===0)sfx('train');uiDirty();return true;
}
function techLevel(T,id){return T[TECH[id].key]||0;}
function techNext(T,id){const R=TECH[id],lvl=techLevel(T,id);return lvl<R.lv.length?R.lv[lvl]:null;}
function queueResearch(b,id){
  const T=G.teams[b.team],R=TECH[id],L=techNext(T,id);
  if(!L){msg(b.team,'Fully researched');return false;}
  if(b.queue.some(q=>q.k==='r'&&q.id===id)){msg(b.team,'Already researching');return false;}
  if(T.era<L.era){msg(b.team,'Requires Era '+ERAS[L.era].rom);return false;}
  if(!afford(T,L)){msg(b.team,T.c<L.c?'Not enough crystals':'Not enough ether');return false;}
  if(b.queue.length>=5){msg(b.team,'Queue is full');return false;}
  pay(T,L);b.queue.push({k:'r',id,t:0,total:L.time});if(b.team===0)sfx('train');uiDirty();return true;
}
function queueEra(b){
  const T=G.teams[b.team];if(T.era>=3){msg(b.team,'Highest era reached');return false;}
  const E=ERAS[T.era+1];
  if(G.camp){const L=campLocked(b.team,'era',T.era+1);if(L){msg(b.team,L);return false;}}
  if(b.queue.some(q=>q.k==='era')||G.buildings.some(x=>!x.dead&&x.team===b.team&&x.queue.some(q=>q.k==='era'))){msg(b.team,'Already advancing');return false;}
  if(!afford(T,E.cost)){msg(b.team,T.c<E.cost.c?'Not enough crystals':'Not enough ether');return false;}
  if(T.era===1&&!hasDone(b.team,'garrison')){msg(b.team,'Requires Garrison');return false;}
  if(T.era===2&&!hasDone(b.team,'armory')){msg(b.team,'Requires Armory');return false;}
  pay(T,E.cost);b.queue.push({k:'era',to:T.era+1,t:0,total:E.time});if(b.team===0)sfx('train');uiDirty();return true;
}
function queueHero(b){
  const T=G.teams[b.team],H=T.hero,id=FACTIONS[T.faction].hero,d=UDEF[id];
  if(G.camp){const L=campLocked(b.team,'hero',id);if(L){msg(b.team,L);return false;}}   // mission hero policy 'none'
  if(H.alive||H.reviving||b.queue.some(q=>q.k==='hero')||G.buildings.some(x=>!x.dead&&x.team===b.team&&x.queue.some(q=>q.k==='hero'))){msg(b.team,'Hero already in play');return false;}
  const dead=H.deaths>0,cost=dead?{c:150+30*H.level,e:50+15*H.level}:d.cost,time=dead?30+5*H.level:d.time;
  if(!afford(T,cost)){msg(b.team,T.c<cost.c?'Not enough crystals':'Not enough ether');return false;}
  if(T.used+d.supply>T.cap){msg(b.team,'Build more Generators');return false;}
  pay(T,cost);T.used+=d.supply;b.queue.push({k:'hero',t:0,total:time,revive:dead});H.reviving=true;if(b.team===0)sfx('train');uiDirty();return true;
}
function heroCost(team){const T=G.teams[team],H=T.hero,id=FACTIONS[T.faction].hero;return H.deaths>0?{c:150+30*H.level,e:50+15*H.level}:UDEF[id].cost;}
function cancelQueue(b,i){
  const q=b.queue[i];if(!q)return;const T=G.teams[b.team];
  if(q.k==='u')refund(b.team,uCost(b.team,q.id));
  else if(q.k==='r'){const R=TECH[q.id];refund(b.team,R.lv[techLevel(T,q.id)]);}
  else if(q.k==='era')refund(b.team,ERAS[q.to].cost);
  else if(q.k==='hero'){refund(b.team,heroCost(b.team));T.hero.reviving=false;}
  b.queue.splice(i,1);uiDirty();
}
function spawnPoint(b,d){
  const base=b.rally?Math.atan2(b.rally.y-b.y,b.rally.x-b.x):Math.PI/2,hw=b.w*TILE/2,hh=b.h*TILE/2;
  for(let k=0;k<26;k++){
    const a=base+((k&1)?1:-1)*Math.ceil(k/2)*0.38,c=Math.cos(a),s=Math.sin(a);
    const t=Math.min(Math.abs(c)>1e-4?hw/Math.abs(c):1e9,Math.abs(s)>1e-4?hh/Math.abs(s):1e9);
    for(const ex of[0,12,26]){const dd=t+d.r+6+ex,x=b.x+c*dd,y=b.y+s*dd;if(d.flying||canStand(x,y))return{x,y};}
  }
  return{x:b.x,y:b.y+hh+20};
}
function spawnUnit(b,id){
  const d=UDEF[id],p=spawnPoint(b,d),u=addUnit(id,b.team,p.x,p.y);
  const enroll=b.team===0&&G.sw&&G.sw.pol.autoEnroll&&!d.hero;
  if(b.rally){const r=b.rally;
    if(r.res&&!r.res.dead&&d.worker)setOrder(u,{t:'gather',res:r.res,st:'go',hx:r.res.x,hy:r.res.y});
    else if(r.post&&d.trade)setOrder(u,{t:'trade',post:r.post,st:'toPost'});
    else if(d.worker)setOrder(u,{t:'move',x:r.x,y:r.y});
    else if(!d.noWeapon||d.heal)setOrder(u,{t:'attackmove',x:r.x,y:r.y,gs:0});
    else setOrder(u,{t:'move',x:r.x,y:r.y});}
  else if(b.type==='hub'&&d.worker){const r=nearestRes(b.x,b.y,'crystal',true,700)||nearestRes(b.x,b.y,'crystal',false,700);if(r)setOrder(u,{t:'gather',res:r,st:'go',hx:r.x,hy:r.y});}
  if(enroll)agEnroll(u,true);
  if(G.camp)campNote('trained',b.team,id);   // `trained` condition counter (45_campaign.js)
  return u;
}
function recalcTeams(){
  for(let t=0;t<2;t++){const T=G.teams[t];T.used=0;T.cap=0;T.hab=0;}
  for(const u of G.units)if(!u.dead&&u.team<2&&!(u.ag&&u.ag.free))G.teams[u.team].used+=u.def.supply;
  for(const b of G.buildings){if(b.dead)continue;const T=G.teams[b.team];
    if(b.done&&b.def.supply)T.cap+=b.def.supply;
    if(b.done&&b.type==='habitat')T.hab++;
    for(const q of b.queue){if(q.k==='u')T.used+=UDEF[q.id].supply;else if(q.k==='hero')T.used+=3;}}
  if(G.camp&&G.camp.supplyBonus)G.teams[0].cap+=G.camp.supplyBonus;   // mission setup.start.supplyBonus (still limited by MAXSUP)
  for(let t=0;t<2;t++)G.teams[t].cap=Math.min(MAXSUP,G.teams[t].cap);
}

/* ------------------------------ buffs -------------------------------- */
function addBuff(u,k,v,t){
  for(const b of u.buffs)if(b.k===k){if(v>=b.v)b.v=v;if(t>b.t)b.t=t;return;}
  u.buffs.push({k,v,t});
}
function hasBuff(u,k){for(const b of u.buffs)if(b.k===k&&b.t>0)return true;return false;}
function buffVal(u,k){let v=0;for(const b of u.buffs)if(b.k===k&&b.t>0&&b.v>v)v=b.v;return v;}
function recalcBuffs(u,dt){
  let spd=1,atk=1,dmg=1,arm=0,stun=0;
  for(let i=u.buffs.length-1;i>=0;i--){const b=u.buffs[i];b.t-=dt;if(b.t<=0){u.buffs.splice(i,1);continue;}
    switch(b.k){
      case'slow':spd*=1-b.v;break;case'haste':spd*=1+b.v;break;case'stim':spd*=1.5;atk*=1.5;break;
      case'bloodlust':atk*=1+b.v;break;case'rampage':spd*=1.4;dmg*=1.4;break;
      case'banner':arm+=b.v;break;case'stun':stun=Math.max(stun,b.t);break;
    }}
  if(u.def.hero){const l=G.teams[u.team].hero.level;dmg*=1+0.10*(l-1);arm+=Math.floor((l-1)/2);}
  if(u.ag){const m=u.ag.m;spd*=m.spd;dmg*=m.dmg;arm+=m.arm;}
  u.spdMul=spd;u.atkMul=atk;u.dmgMul=dmg;u.armAdd=arm;u.stunned=stun;
  u.cloaked=!!((u.def.cloak||hasBuff(u,'cloak'))&&u.revealT<=0);
}

/* ------------------------------ orders ------------------------------- */
function releaseRes(u){
  if(u.inRes){const i=u.inRes.users.indexOf(u.id);if(i>=0)u.inRes.users.splice(i,1);
    if(u.hidden&&!u.garr){u.hidden=false;popOut(u);}u.inRes=null;}
}
function leaveGarrison(u){
  if(!u.garr)return;
  const h=G.buildings.find(b=>b.id===u.garr);if(h){const i=h.garr.indexOf(u.id);if(i>=0)h.garr.splice(i,1);}
  u.garr=0;u.hidden=false;
  if(h){const p=spawnPoint(h,u.def);u.x=p.x;u.y=p.y;}else popOut(u);
}
function refundOrder(u,o){if(o&&o.t==='build'&&o.paid&&!o.bld)refund(u.team,bCost(u.team,o.type));}
function setOrder(u,o,q){
  if(u.ag&&!AGI)agManual(u,o,q);
  if(q&&u.order.t!=='idle'&&!u.garr){if(u.oq.length<12)u.oq.push(o);return;}
  for(const x of u.oq)refundOrder(u,x);u.oq.length=0;
  refundOrder(u,u.order);
  if(u.garr&&o.t!=='garrison')leaveGarrison(u);
  releaseRes(u);
  u.order=o;u.path=null;u.target=null;u.stuck=0;u.chasing=false;u.returning=false;
  if(o.t==='gather'&&u.carry>0&&u.carryType!==(o.res&&o.res.type==='crystal'?'c':'e'))u.carry=0;
  if(u.sieged&&(o.t==='move'||o.t==='attackmove'||o.t==='gather'||o.t==='build'))toggleSiege(u,true);
}
function goIdle(u){u.order={t:'idle'};u.path=null;u.target=null;u.home={x:u.x,y:u.y};u.chasing=false;u.returning=false;}
function finishOrder(u){
  releaseRes(u);u.path=null;u.target=null;u.stuck=0;u.chasing=false;u.returning=false;
  if(u.oq.length){u.order=u.oq.shift();return;}
  goIdle(u);
}
function orderBuild(u,type,tx,ty,q){
  const T=G.teams[u.team],c=bCost(u.team,type);
  if(G.camp&&campLocked(u.team,'building',type))return false;   // mission restriction (the UI already greys the button; this stops agents / the Overseer)
  if(!afford(T,c))return false;
  const prev=u.order,after=(!q&&prev.t==='gather')?{t:'gather',res:prev.res,st:u.carry>0?'ret':'go',hx:prev.hx,hy:prev.hy}:null;
  pay(T,c);
  setOrder(u,{t:'build',type,tx,ty,paid:true,st:'go',bld:null,after},q);return true;
}
function canPlace(team,type,tx,ty,ignoreFog){
  const d=BDEF[type];
  if(d.onGeyser){const g=G.res.find(r=>!r.dead&&r.type==='geyser'&&r.tx===tx&&r.ty===ty);
    if(!g||g.siphon)return false;if(team===0&&!ignoreFog&&G.vis[0][ty*MW+tx]===0)return false;return siteReach(team,tx,ty,2,2);}
  if(tx<2||ty<2||tx+d.w>MW-2||ty+d.h>MH-2)return false;
  const h0=G.H[ty*MW+tx];
  for(let y=0;y<d.h;y++)for(let x=0;x<d.w;x++){const i=(ty+y)*MW+tx+x;
    if(G.blocked[i]||G.RAMP[i]||G.H[i]!==h0)return false;
    if(team===0&&!ignoreFog&&G.vis[0][i]===0)return false;}
  return siteReach(team,tx,ty,d.w,d.h);
}
function ejectUnits(b){
  const x0=b.tx*TILE,y0=b.ty*TILE,x1=x0+b.w*TILE,y1=y0+b.h*TILE;
  for(const u of G.units){if(u.flying||u.hidden||u.dead)continue;
    if(u.x>x0-u.r&&u.x<x1+u.r&&u.y>y0-u.r&&u.y<y1+u.r)popOut(u);}
}

/* ------------------------------ movement ----------------------------- */
function moveUnit(u,dx,dy){
  if(u.flying){u.x=clamp(u.x+dx,8,WW-8);u.y=clamp(u.y+dy,8,WH-8);return;}
  const nx=u.x+dx;if(canStand(nx,u.y))u.x=nx;
  const ny=u.y+dy;if(canStand(u.x,ny))u.y=ny;
}
function navigate(u,gx,gy,dt,stopDist,cap){
  const d=u.def,dd=hyp(gx-u.x,gy-u.y);
  if(dd<=stopDist){u.path=null;return true;}
  if(u.stunned>0||u.sieged||u.siegeT>0)return false;
  let sp=d.speed*u.spdMul;if(cap&&cap<sp)sp=cap;const spd=sp*dt;u.moving=true;
  if(u.flying){const a=Math.atan2(gy-u.y,gx-u.x);u.ang=turn(u.ang,a,dt*10);const s=Math.min(spd,dd);moveUnit(u,Math.cos(a)*s,Math.sin(a)*s);return false;}
  const need=!u.path||Math.abs(u.ngx-gx)+Math.abs(u.ngy-gy)>28;
  if(need){
    if(dd<240&&losClear(u.x,u.y,gx,gy)){u.path=[{x:gx,y:gy}];u.pi=0;u.ngx=gx;u.ngy=gy;}
    else if(G.pathBudget>0&&(u.repathCd<=0||!u.path)){G.pathBudget--;u.path=findPath(u.x,u.y,gx,gy)||[];u.pi=0;u.ngx=gx;u.ngy=gy;u.repathCd=0.35;}
    else if(!u.path){u.moving=false;return false;}
  }
  const p=u.path;
  if(!p||u.pi>=p.length){u.path=null;return true;}
  const wp=p[u.pi],ddx=wp.x-u.x,ddy=wp.y-u.y,wd=hyp(ddx,ddy),a=Math.atan2(ddy,ddx);
  u.ang=turn(u.ang,a,dt*12);
  if(wd<=spd+0.5){moveUnit(u,ddx,ddy);u.pi++;}else moveUnit(u,ddx/wd*spd,ddy/wd*spd);
  u.stuckT+=dt;
  if(u.stuckT>=0.5){
    const moved=hyp(u.x-u.lx,u.y-u.ly);u.lx=u.x;u.ly=u.y;u.stuckT=0;
    if(moved<sp*0.12){u.stuck++;u.path=null;u.repathCd=0;if(u.stuck>=4&&dd<90){u.stuck=0;return true;}if(u.stuck>=8){u.stuck=0;u.x+=(Math.random()-.5)*6;u.y+=(Math.random()-.5)*6;}}
    else u.stuck=0;
  }
  return false;
}
function separate(){
  for(const u of G.units){
    if(u.dead||u.hidden)continue;
    if(!u.flying&&(G.tick+u.id)%15===0&&!canStand(u.x,u.y))popOut(u);
    forNear(u.x,u.y,36,v=>{
      if(v.id<=u.id||v.hidden||v.flying!==u.flying)return;
      const dx=v.x-u.x,dy=v.y-u.y,rr=u.r+v.r-1,d2=dx*dx+dy*dy;if(d2>=rr*rr)return;
      let d=Math.sqrt(d2),nx,ny;if(d<0.01){nx=Math.random()-.5;ny=Math.random()-.5;d=0.5;}else{nx=dx/d;ny=dy/d;}
      const ov=Math.min(4,rr-d);let wu=0.5,wv=0.5;
      if(u.moving&&!v.moving){wu=0.15;wv=0.85;}else if(!u.moving&&v.moving){wu=0.85;wv=0.15;}
      if(u.order.t==='hold'||u.sieged){wu=0;wv=1;}else if(v.order.t==='hold'||v.sieged){wv=0;wu=1;}
      if(v.team!==u.team&&u.team<2&&v.team<2){wu*=0.5;wv*=0.5;}
      moveUnit(u,-nx*ov*wu,-ny*ov*wu);moveUnit(v,nx*ov*wv,ny*ov*wv);});
  }
}

/* ------------------------------- combat ------------------------------ */
function canAttack(def,t){return t.flying?def.air:def.ground;}
function validTarget(src,t){return!!t&&!t.dead&&t.hp>0&&t.team!==src.team&&!t.hidden&&canAttack(src.def,t)&&seen(src.team,t);}
function rangeOf(u){const d=u.def;return u.sieged&&d.siege?d.siege.range:d.range;}
function bonOf(u){const d=u.def;return u.sieged&&d.siege&&d.siege.bon?d.siege.bon:d.bon;}
function splashOf(u){const d=u.def;return u.sieged&&d.siege?d.siege.splash:(d.splash||0);}
function baseDmgOf(u){
  const d=u.def,T=G.teams[u.team];let b=u.sieged&&d.siege?d.siege.dmg:d.dmg;
  if(u.kind==='building'&&u.type==='hub')b+=3*u.garr.length;
  return b*(1+0.15*(T.wl||0))*(u.dmgMul||1);
}
function cdOf(u){const d=u.def;return((u.sieged&&d.siege)?d.siege.cd:d.cd)/(u.atkMul||1);}
function dmgVs(base,bon,tgt,ranged){
  let a=base;for(const k in bon)if(tgt.def.tags[k])a+=bon[k];
  let arm=tgt.def.armor+(tgt.armAdd||0);if(tgt.kind==='unit'&&tgt.team<2)arm+=G.teams[tgt.team].al||0;
  if(ranged&&tgt.def.projArmor)arm+=tgt.def.projArmor;
  return Math.max(1,a-arm);
}
function acquire(u,range){
  let best=null,bs=1e9;const d=u.def;
  forNear(u.x,u.y,range+24,e=>{
    if(e.team===u.team||e.dead||e.hidden||!canAttack(d,e))return;
    const dd=hyp(e.x-u.x,e.y-u.y)-e.r;if(dd>range||!seen(u.team,e))return;
    let s=dd;if(e.def.worker)s+=40;else if(e.def.noWeapon)s+=90;if(e.def.hero)s-=15;if(s<bs){bs=s;best=e;}});
  if(d.ground&&u.team<2||d.ground&&u.team===2){
    for(const b of G.buildings){
      if(b.team===u.team||b.dead)continue;const dd=rectDist(u.x,u.y,b);if(dd>range||!seen(u.team,b))continue;
      const s=dd+(b.def.dmg?0:140);if(s<bs){bs=s;best=b;}}}
  return best;
}
function fire(src,t){
  const d=src.def;src.cd=cdOf(src);src.ang=Math.atan2(t.y-src.y,t.x-src.x);src.revealT=1.6;
  const base=baseDmgOf(src),bon=bonOf(src),spl=splashOf(src);
  if(d.proj){
    const c=Math.cos(src.ang),s=Math.sin(src.ang),lift=src.flying?10:0;
    G.proj.push({x:src.x+c*10,y:src.y+s*10-lift,sx:src.x,sy:src.y,t,tx:t.x,ty:t.y,sp:d.pspd,kind:d.proj,team:src.team,base,bon,splash:spl,src,life:4,total:Math.max(1,hyp(t.x-src.x,t.y-src.y)),dead:false});
    sfx(d.proj==='bullet'?'shoot':d.proj==='rocket'?'rocket':d.proj==='shell'?'shell':d.proj==='acid'?'acid':'bolt',src.x,src.y);
    addPart(src.x+c*12,src.y+s*12,0,0,0.09,5,d.proj==='bolt'?G.teams[src.team].pal.light:(d.proj==='acid'?'#c8ff6a':'#ffe9a0'),1);
    if(src.kind==='unit'&&d.proj==='shell'&&src.type==='howitzer'||d.proj==='shell'&&src.type==='titan')G.shake=Math.max(G.shake,2);
  }else{
    const dmg=dmgVs(base,bon,t,false),dealt=damageEnt(t,dmg,src.team,src);
    if(d.lifesteal&&src.kind==='unit'){src.hp=Math.min(src.maxhp,src.hp+dealt*d.lifesteal);src.healFx=0.4;}
    sfx('melee',src.x,src.y);addPart(t.x,t.y,0,0,0.12,5,'#fff',1);
  }
  if(src.kind==='unit'&&hasBuff(src,'cloak'))src.buffs=src.buffs.filter(b=>b.k!=='cloak');
}
function damageEnt(e,amt,from,srcEnt){
  if(e.dead)return 0;const real=Math.min(amt,e.hp);e.hp-=amt;e.flash=0.12;e.lastHit=G.time;if(srcEnt&&srcEnt.ag)e.lastAtk=srcEnt;
  if(e.team===0&&from!==0)alertPlayer(e);
  if(e.team===2&&e.kind==='unit'&&from!==2)provokeCamp(e,srcEnt);
  if(e.kind==='building')e.dmgFlash=0.2;
  if(e.hp<=0)kill(e,from);
  return real;
}
function provokeCamp(e,src){
  e.provoked=10;
  if(e.camp<0)return;
  const camp=G.camps[e.camp];
  for(const id of camp.units){const c=G.units.find(x=>x.id===id);if(c&&!c.dead){c.provoked=10;if(src&&!src.dead)c.target=src;}}
}
function alertPlayer(e){
  if(G.ais[0])return;
  G.alertPos={x:e.x,y:e.y};G.alertT=G.time;G.fightT=G.time;
  if(G.time-G.lastAlertT>9){G.lastAlertT=G.time;toast(e.kind==='building'?'Your base is under attack!':'Your forces are under attack!','bad');sfx('alert');say('Your forces are under attack');}
}
function giveXP(team,x,y,amt){
  if(team>1)return;const H=G.teams[team].hero;if(!H.alive||H.level>=HERO_MAXLVL)return;
  const u=G.units.find(z=>z.id===H.uid);if(!u||u.dead)return;
  if(hyp(u.x-x,u.y-y)>720)return;
  H.xp+=amt;
  while(H.level<HERO_MAXLVL&&H.xp>=HERO_LVL_XP[H.level+1]){
    H.level++;heroApply(u,false);u.hp=Math.min(u.maxhp,u.hp+u.maxhp*0.25);u.mana=heroMaxMana(u);
    G.fx.push({x:u.x,y:u.y,t:0,max:1.1,kind:'levelup',r:60});
    if(team===0&&!G.ais[0]){toast(u.def.name+' reached level '+H.level+'!  Press Z to learn a skill.','good');sfx('level');say('Hero level up');}
    G.events.push({t:G.time,team,txt:'Hero level '+H.level});
  }
}
function kill(e,by){
  if(e.dead)return;e.dead=true;e.hp=0;
  if(e.kind==='unit'){
    releaseRes(e);if(e.garr)leaveGarrison(e);
    if(e.ag)agDied(e);if(e.lastAtk&&e.lastAtk.ag&&e.team!==e.lastAtk.team)agKill(e.lastAtk,e);
    const T=G.teams[e.team];
    if(by!==undefined&&by!==e.team&&by<2)G.teams[by].kills++;
    if(e.team<2){T.lost++;T.rl+=e.def.supply;
      if(by!==undefined&&by<2&&by!==e.team){const k=G.teams[by];k.rk+=e.def.supply;giveXP(by,e.x,e.y,Math.round((e.def.cost.c+e.def.cost.e)*0.4)+(e.def.hero?150:0));}
      if(e.def.hero){const H=T.hero;H.alive=false;H.deaths=(H.deaths||0)+1;H.reviving=false;if(e.team===0&&!G.ais[0]){toast('Your hero has fallen. Revive them at the Hub.','bad');say('Hero has fallen');}G.events.push({t:G.time,team:e.team,txt:'Hero fell'});}
    }else if(by!==undefined&&by<2){
      const K=G.teams[by];K.c+=e.def.bounty;K.kills++;K.creeps=(K.creeps||0)+1;giveXP(by,e.x,e.y,e.def.xp);
      G.fx.push({x:e.x,y:e.y-14,t:0,max:1.3,kind:'text',txt:'+'+e.def.bounty,col:'#ffd45a'});
    }
    explode(e.x,e.y,false,e.flying);sfx('boom',e.x,e.y);
    G.decalDirty.push({x:e.x,y:e.y,r:e.r*1.5,k:'scorch'});
    if(G.camp&&e.team===2&&e.camp>=0)campCreepKilled(e,by);   // `camps` condition: who cleared which creep camp
  }else{
    G.needBlocked=true;explode(e.x,e.y,true);sfx('boomBig',e.x,e.y);G.shake=Math.max(G.shake,8);
    if(by!==undefined&&by!==e.team&&by<2){G.teams[by].kills++;giveXP(by,e.x,e.y,60);}
    G.teams[e.team].lost++;G.teams[e.team].rl+=3;
    G.decalDirty.push({x:e.x,y:e.y,r:e.r*1.3,k:'rubble'});
    if(e.res)e.res.siphon=null;
    for(const id of e.garr){const u=G.units.find(z=>z.id===id);if(u){u.garr=0;u.hidden=false;popOut(u);u.saved=null;goIdle(u);}}
    for(const u of G.units)if(u.hidden&&u.inRes&&u.inRes.siphon===e){releaseRes(u);goIdle(u);}
    if(e.queue.length){const T=G.teams[e.team];for(const q of e.queue)if(q.k==='hero')T.hero.reviving=false;}
    if(!G.buildings.some(b=>!b.dead&&b.team===e.team&&b!==e)&&!(G.camp&&campNoDefaultEnd(e.team))){endGame(e.team===0?'defeat':'victory');}
  }
}
function projHit(p){
  const enemyOf=e=>e.team!==p.team&&!e.dead;
  if(p.splash){
    forNear(p.x,p.y,p.splash+36,e=>{
      if(!enemyOf(e)||e.flying||e.hidden)return;
      if(hyp(e.x-p.x,e.y-p.y)-e.r<=p.splash)damageEnt(e,dmgVs(p.base,p.bon,e,true),p.team,p.src);});
    for(const b of G.buildings){if(!enemyOf(b))continue;if(rectDist(p.x,p.y,b)<=p.splash)damageEnt(b,dmgVs(p.base,p.bon,b,true),p.team,p.src);}
    G.fx.push({x:p.x,y:p.y,t:0,max:0.35,kind:'ring',r:p.splash,col:'#ffb15a'});explode(p.x,p.y,false);sfx('boom',p.x,p.y);
    G.decalDirty.push({x:p.x,y:p.y,r:p.splash*0.7,k:'scorch'});
  }else if(p.t&&!p.t.dead){
    damageEnt(p.t,dmgVs(p.base,p.bon,p.t,true),p.team,p.src);
    addPart(p.x,p.y,0,0,0.14,p.kind==='rocket'?9:5,p.kind==='bolt'?G.teams[p.team].pal.light:(p.kind==='acid'?'#c8ff6a':'#ffd27a'),1);
    if(p.kind==='rocket')explode(p.x,p.y,false);
  }
}
function addPart(x,y,vx,vy,life,size,col,kind){if(G.parts.length>900)return;G.parts.push({x,y,vx,vy,life,max:life,size,col,kind:kind||0});}
function explode(x,y,big,air){
  const n=big?36:12;
  for(let i=0;i<n;i++){const a=Math.random()*TAU,sp=(big?180:90)*Math.random();
    addPart(x,y,Math.cos(a)*sp,Math.sin(a)*sp,0.35+Math.random()*(big?0.9:0.45),(big?6:3)+Math.random()*4,Math.random()<0.5?'#ffb347':'#ff6a3d',1);}
  for(let i=0;i<(big?16:4);i++){const a=Math.random()*TAU,sp=40*Math.random();
    addPart(x,y,Math.cos(a)*sp,Math.sin(a)*sp-10,0.8+Math.random()*0.9,5+Math.random()*7,'#3a3f48',2);}
  G.fx.push({x,y,t:0,max:big?0.55:0.28,kind:'flash',r:big?90:28});
  if(big&&!air)for(let i=0;i<6;i++){const a=Math.random()*TAU;addPart(x,y,Math.cos(a)*60,Math.sin(a)*60,1.4,3,'#7a6a58',3);}
}
function aoeEnemies(team,x,y,r,fn,groundOnly){
  forNear(x,y,r+30,e=>{if(e.team===team||e.dead||e.hidden)return;if(groundOnly&&e.flying)return;if(hyp(e.x-x,e.y-y)-e.r<=r)fn(e);});
  for(const b of G.buildings){if(b.team===team||b.dead)continue;if(rectDist(x,y,b)<=r)fn(b);}
}
function aoeAllies(team,x,y,r,fn){forNear(x,y,r+30,e=>{if(e.team!==team||e.dead||e.hidden)return;if(hyp(e.x-x,e.y-y)<=r)fn(e);});}
