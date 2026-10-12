/* =========================================================================
   32_CARGO (v6-G1 FORTIFY) — one generic "units inside a host" system, used by the Bunker (structure) and the Dropship (unit).
   SIM-SIDE. State is plain JSON: host.cargo = [unit ids], unit.inside = host id (46_save.js round-trips it mid-load).
     size        a passenger's size is its supply (heroes 3); Titans (8) and flying units never load; a host holds def.cargo size
     bunker      tag rule def.cargoTag ('infantry'); passengers fire from inside with rangeOf(u) + half the bunker + FORT.bunkerRange
     dropship    order {t:'unload',x,y}: fly there, drop one passenger every FORT.unloadGap s onto free ground (team view);
                 order {t:'pickup',target}: fly to a friendly unit and take it aboard
     host death  a structure ejects its passengers (they live), a unit host kills them (kill() -> cargoHostDied)
     inside      hidden: not targetable, not in the spatial hash, no orders (setOrder ignores them), position = the host's, keeps supply and vision
   ========================================================================= */
function cargoSize(u){return Math.max(1,u.def.supply||1);}
function cargoHostOf(u){if(!u.inside)return null;for(const b of G.buildings)if(b.id===u.inside)return b;for(const h of G.units)if(h.id===u.inside)return h;return null;}
function cargoUsed(h){let n=0;if(h.cargo)for(const id of h.cargo){const u=G.units.find(z=>z.id===id);if(u)n+=cargoSize(u);}return n;}
function cargoCap(h){return h&&h.def.cargo||0;}
function cargoWhy(h,u){
  if(!h||h.dead||!cargoCap(h))return'Not a transport';if(h.kind==='building'&&!h.done)return'Under construction';
  if(!u||u.dead||u===h||u.team!==h.team)return'Cannot load';if(u.inside)return'Already inside';
  if(u.flying)return'Air units cannot load';if(u.def.creep)return'Cannot load';
  if(h.def.cargoTag&&!u.def.tags[h.def.cargoTag])return'Only infantry can enter a '+h.def.name;
  const s=cargoSize(u);if(s>4)return'Too large to load';if(cargoUsed(h)+s>cargoCap(h))return h.def.name+' is full';
  return'';
}
function cargoCan(h,u){return!cargoWhy(h,u);}
function cargoLoad(h,u){
  if(!cargoCan(h,u))return false;
  for(const x of u.oq)refundOrder(u,x);u.oq.length=0;refundOrder(u,u.order);
  releaseRes(u);if(u.garr)leaveGarrison(u);if(u.sieged){u.sieged=false;u.siegeT=0;}
  (h.cargo||(h.cargo=[])).push(u.id);u.inside=h.id;u.hidden=true;u.order={t:'idle'};u.path=null;u.target=null;u.breach=null;u.chasing=false;u.returning=false;u.moving=false;
  u.x=h.x;u.y=h.y;
  if(h.team===0)sfx('cargoLoad',h.x,h.y,h);
  if(h.team===0)uiDirty();return true;
}
/* place a passenger back in the world: next to a structure (rally side), or on free ground around (x,y) for a Dropship */
function cargoPlace(h,u,x,y,k){
  if(h.kind==='building'){const p=spawnPoint(h,u.def);u.x=p.x;u.y=p.y;return true;}
  const tx=clamp(x/TILE|0,0,MW-1),ty=clamp(y/TILE|0,0,MH-1),f=nearestFree(tx,ty,6,u.team);if(!f)return false;
  const a=(k||0)*2.39996,rr=(k||0)?7:0;u.x=(f[0]+.5)*TILE+Math.cos(a)*rr;u.y=(f[1]+.5)*TILE+Math.sin(a)*rr;
  if(!canStand(u.x,u.y,u.team)){u.x=(f[0]+.5)*TILE;u.y=(f[1]+.5)*TILE;}
  return true;
}
function cargoUnload(h,u,x,y,k){
  const i=h.cargo?h.cargo.indexOf(u.id):-1;if(i<0)return false;
  if(!cargoPlace(h,u,x===undefined?h.x:x,y===undefined?h.y:y,k))return false;
  h.cargo.splice(i,1);u.inside=0;u.hidden=false;u.path=null;u.lx=u.x;u.ly=u.y;goIdle(u);
  if(h.team===0)uiDirty();return true;
}
function cargoUnloadAll(h,x,y){
  if(!h.cargo||!h.cargo.length)return 0;let n=0;const ids=h.cargo.slice();
  for(const id of ids){const u=G.units.find(z=>z.id===id);if(!u){h.cargo.splice(h.cargo.indexOf(id),1);continue;}if(cargoUnload(h,u,x,y,n))n++;}
  if(n&&h.team===0)sfx('cargoUnload',h.x,h.y,h);
  return n;
}
/* kill() hook: e is a host that died, or a passenger killed while inside */
function cargoHostDied(e,by){
  if(e.inside){const h=cargoHostOf(e);if(h&&h.cargo){const i=h.cargo.indexOf(e.id);if(i>=0)h.cargo.splice(i,1);}e.inside=0;e.hidden=false;}
  if(!e.cargo||!e.cargo.length)return;
  const ids=e.cargo.slice();
  if(e.kind==='building'){for(const id of ids){const u=G.units.find(z=>z.id===id);if(!u)continue;const p=spawnPoint(e,u.def);u.inside=0;u.hidden=false;u.x=p.x;u.y=p.y;u.path=null;goIdle(u);}e.cargo.length=0;}
  else{e.cargo.length=0;for(const id of ids){const u=G.units.find(z=>z.id===id);if(!u||u.dead)continue;u.inside=0;u.hidden=false;u.x=e.x;u.y=e.y;kill(u,by);}}
}
/* ------------------------------------------------------------------ per-tick */
function cargoSync(){   // passengers ride with a moving host (vision stays right); hosts that vanished release their passengers
  for(const u of G.units){if(!u.inside||u.dead)continue;const h=cargoHostOf(u);
    if(!h||h.dead){u.inside=0;u.hidden=false;popOut(u);goIdle(u);continue;}u.x=h.x;u.y=h.y;}
}
function cargoInsideStep(u,dt){   // updateUnit for a passenger: Bunker passengers shoot from inside
  const h=cargoHostOf(u);if(!h||h.kind!=='building'||!h.def.fireFromInside||!h.done)return;
  const d=u.def;if(d.noWeapon||d.worker)return;
  const rg=rangeOf(u)+FORT.bunkerRange+Math.max(h.w,h.h)*TILE/2;
  if(u.target&&(!validTarget(u,u.target)||edgeDist(u,u.target)>rg))u.target=null;
  if(!u.target&&(G.tick+u.id)%5===0)u.target=acquire(u,rg);
  if(u.target){u.ang=Math.atan2(u.target.y-u.y,u.target.x-u.x);if(u.cd<=0)fire(u,u.target);}
}
function cargoLoadStep(u,dt){
  const o=u.order,h=o.host;
  if(!h||h.dead||!cargoCan(h,u)){finishOrder(u);return;}
  const near=h.kind==='building'?rectDist(u.x,u.y,h)<=u.r+16:hyp(h.x-u.x,h.y-u.y)<=u.r+h.r+22;
  if(near){cargoLoad(h,u);return;}
  if(h.kind==='building'){const p=approachPoint(h,u.x,u.y);navigate(u,p.x,p.y,dt,4);}else navigate(u,h.x,h.y,dt,4);
}
function cargoDropStep(u,dt){   // the Dropship flies to (o.x,o.y) and drops its passengers one by one
  const o=u.order;if(!u.cargo||!u.cargo.length){finishOrder(u);return;}
  if(!o.arr){if(navigate(u,o.x,o.y,dt,10)){o.arr=true;o.gt=0;o.k=0;}return;}
  o.gt-=dt;if(o.gt>0)return;o.gt=FORT.unloadGap;
  const id=u.cargo[0],p=G.units.find(z=>z.id===id);
  if(!p){u.cargo.shift();return;}
  if(cargoUnload(u,p,u.x,u.y,o.k++)){if(u.team===0)sfx('cargoUnload',u.x,u.y,u);}else{finishOrder(u);msg(u.team,'No room to unload here');}
  if(!u.cargo.length)finishOrder(u);
}
function cargoPickupStep(u,dt){   // the Dropship flies to a friendly unit and takes it aboard
  const o=u.order,t=o.target;
  if(!t||t.dead||t.inside||!cargoCan(u,t)){finishOrder(u);return;}
  if(hyp(t.x-u.x,t.y-u.y)<=u.r+t.r+22){cargoLoad(u,t);finishOrder(u);return;}
  navigate(u,t.x,t.y,dt,8);
}
/* ------------------------------------------------------------------ commands (UI, AI, tests) */
function cargoOrderLoad(units,h,queue){   // send units to a host; returns how many were sent
  let n=0,used=cargoUsed(h);
  for(const u of units){if(!cargoCan(h,u))continue;const s=cargoSize(u);if(used+s>cargoCap(h))break;used+=s;setOrder(u,{t:'load',host:h},queue);n++;}
  return n;
}
function cargoOrderUnload(h,x,y,queue){if(!h||h.dead||h.kind!=='unit'||!h.cargo||!h.cargo.length)return false;setOrder(h,{t:'unload',x,y,arr:false,gt:0,k:0},queue);return true;}
function cargoOrderPickup(h,t,queue){if(!h||h.kind!=='unit'||!cargoCan(h,t))return false;setOrder(h,{t:'pickup',target:t},queue);setOrder(t,{t:'load',host:h});return true;}
