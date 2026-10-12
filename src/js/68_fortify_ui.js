/* =========================================================================
   68_FORTIFY_UI (v6-G1 FORTIFY) — the defence layer's UI: command-card entries, wall-line and gate placement (mouse and touch),
   load / unload / scan targeting, info-panel lines, world and minimap overlays, glyphs, help text. UI/RENDER-SIDE: it never writes
   simulation state except through the same order functions the rest of the UI uses (orderBuild, fortPlaceLine, cargoOrder*, fortScan...).
   Hooks (one line each): 51_art_b glyph default, 60_render drawGhost/drawBuilding/render/minimap/entVisible, 70_ui buildCommands/contextCommand/
   beginPlace/updatePlaceGhost/tryPlace/setRally, 71_hud renderInfo/queue icon/hudUpdate, 72_menus help, 74_touch tap/context/labels, 90_main mouse/applyTarget.
   ========================================================================= */
/* ------------------------------------------------------------------ glyphs (command-card icons) */
function fortGlyph(g,name){
  const S=(c,w)=>{g.strokeStyle=c;g.lineWidth=w||3.2;};
  switch(name){
    case'defence':S('#9fd0ff');g.beginPath();g.moveTo(-14,12);g.lineTo(-14,-4);g.lineTo(-9,-4);g.lineTo(-9,-9);g.lineTo(-4,-9);g.lineTo(-4,-4);g.lineTo(4,-4);g.lineTo(4,-9);g.lineTo(9,-9);g.lineTo(9,-4);g.lineTo(14,-4);g.lineTo(14,12);g.closePath();g.stroke();g.beginPath();g.moveTo(-3,12);g.lineTo(-3,4);g.lineTo(3,4);g.lineTo(3,12);g.stroke();return true;
    case'load':S('#8affc0');g.beginPath();g.moveTo(0,-14);g.lineTo(0,6);g.moveTo(-7,-1);g.lineTo(0,6);g.lineTo(7,-1);g.stroke();rr(g,-12,8,24,6,2);return true;
    case'unload':S('#ffd45a');g.beginPath();g.moveTo(0,6);g.lineTo(0,-14);g.moveTo(-7,-7);g.lineTo(0,-14);g.lineTo(7,-7);g.stroke();rr(g,-12,8,24,6,2);return true;
    case'unloadHere':S('#ffd45a');g.beginPath();g.arc(0,2,9,0,TAU);g.stroke();g.beginPath();g.moveTo(0,-14);g.lineTo(0,2);g.stroke();g.fillStyle='#ffd45a';g.beginPath();g.arc(0,2,3,0,TAU);g.fill();return true;
    case'gateOpen':S('#8affc0');g.beginPath();g.moveTo(-13,12);g.lineTo(-13,-10);g.moveTo(13,12);g.lineTo(13,-10);g.moveTo(-13,-10);g.lineTo(-6,-4);g.moveTo(13,-10);g.lineTo(6,-4);g.stroke();return true;
    case'gateClose':S('#ff9a8a');g.beginPath();g.moveTo(-13,12);g.lineTo(-13,-10);g.moveTo(13,12);g.lineTo(13,-10);g.stroke();g.lineWidth=2.4;for(let y=-8;y<=10;y+=6){g.beginPath();g.moveTo(-13,y);g.lineTo(13,y);g.stroke();}return true;
    case'gateAuto':S('#9fe8ff');g.beginPath();g.moveTo(-13,12);g.lineTo(-13,-10);g.moveTo(13,12);g.lineTo(13,-10);g.stroke();g.lineWidth=2.4;g.setLineDash([3,3]);g.beginPath();g.moveTo(-13,1);g.lineTo(13,1);g.stroke();g.setLineDash([]);g.fillStyle='#8affc0';g.beginPath();g.moveTo(-4,-6);g.lineTo(4,-1);g.lineTo(-4,4);g.closePath();g.fill();return true;
    case'scan':S('#7cd8ff');g.beginPath();g.arc(0,0,13,0,TAU);g.stroke();g.lineWidth=1.6;g.beginPath();g.arc(0,0,7,0,TAU);g.stroke();g.lineWidth=3;g.beginPath();g.moveTo(0,0);g.lineTo(11,-7);g.stroke();g.fillStyle='#ff6a5a';g.beginPath();g.arc(-6,5,2.4,0,TAU);g.fill();return true;
    case'fortress':S('#ffd27a');g.beginPath();g.moveTo(-14,13);g.lineTo(-14,-2);g.lineTo(-8,-8);g.lineTo(8,-8);g.lineTo(14,-2);g.lineTo(14,13);g.closePath();g.stroke();g.beginPath();g.moveTo(0,-8);g.lineTo(0,-15);g.moveTo(0,-11);g.lineTo(12,-15);g.stroke();return true;
    case'salvage':S('#ffe27a');g.beginPath();g.moveTo(-12,8);g.lineTo(-12,-6);g.lineTo(12,-6);g.lineTo(12,8);g.stroke();g.beginPath();g.moveTo(0,-14);g.lineTo(0,3);g.moveTo(-6,-3);g.lineTo(0,3);g.lineTo(6,-3);g.stroke();g.font='bold 11px system-ui';g.textAlign='center';g.fillStyle='#ffe27a';g.fillText('75%',0,15);return true;
    case'pickup':S('#8affc0');g.beginPath();g.moveTo(-12,-6);g.lineTo(12,-6);g.lineTo(6,-12);g.moveTo(12,-6);g.lineTo(6,0);g.stroke();g.beginPath();g.arc(-4,8,5,0,TAU);g.stroke();return true;
  }
  return false;
}

/* ------------------------------------------------------------------ command card */
const GATE_MODES={auto:'Auto: your units pass, enemies are blocked.',open:'Open: everyone passes, enemies included.',closed:'Closed: nobody passes, your units included.'};
function fortCmdUnits(c,mk,units,act,T){
  const hasWorker=units.some(u=>u.def.worker);
  if(hasWorker&&!c[6])mk(6,{icon:'g:defence',name:'Defence Structures',tip:'Walls (drag a line), Gates, Bunkers, Cannon Towers, Anti-Air Batteries, Sensor Towers, Repair Batteries and Mines.',ok:true,run:()=>{ui.menu='build3';ui.cmdDirty=true;sfx('tab');}});
  const ds=units.filter(u=>u.def.cargo);
  if(ds.length){const n=ds.reduce((s,u)=>s+(u.cargo?u.cargo.length:0),0);
    mk(3,{icon:'g:pickup',name:'Load',tip:'Pick up a friendly ground unit: click it (it walks to the Dropship, the Dropship flies to it). Selected units can also right-click the Dropship.',ok:true,run:()=>beginTarget('load')});
    mk(5,{icon:'g:unload',name:'Unload at…',tip:'Fly to a point and drop the passengers one by one.',ok:n>0,why:'Nothing aboard',badge:n||'',run:()=>beginTarget('unload')});
    mk(6,{icon:'g:unloadHere',name:'Unload Here',tip:'Drop every passenger where the Dropship is now.',ok:n>0,why:'Nothing aboard',run:()=>{for(const d of ds)cargoOrderUnload(d,d.x,d.y);sfx('click');}});}
}
function fortCmdBuilding(c,mk,b,T){
  if(b.type==='hub'){
    const why=fortScanWhy(0);
    mk(5,{icon:'g:scan',name:'Scanner Sweep',cost:{c:0,e:0,mana:FORT.scan.energy},tip:'Reveal an area ('+Math.round(FORT.scan.r/TILE)+' tiles) for '+FORT.scan.t+' s, cloaked units and mines included. Costs '+FORT.scan.energy+' Hub energy (Hubs regain '+FORT.hubEnergyRate+'/s). Click the map or the minimap.',
      ok:!why,why,run:()=>beginTarget('scan')});
    if(!b.fort){const w=fortressWhy(b),F=FORT.fortress;
      mk(6,{icon:'g:fortress',name:'Fortress Upgrade',cost:F.cost,time:F.time,tip:'Permanent: +50% HP, +'+F.armor+' armor and a heavy splash cannon ('+F.dmg+' dmg, range '+F.range+', ground). Cannot be undone. Requires Era II and an Armory.',ok:!w,why:w,run:()=>queueFortress(b)});}}
  if(b.def.gate){const m=b.gmode||'auto';
    mk(0,{icon:'g:gateOpen',name:'Open Gate',tip:GATE_MODES.open,ok:true,badge:m==='open'?'●':'',run:()=>ownBuildings().filter(x=>x.def.gate).forEach(x=>fortGateMode(x,'open'))});
    mk(1,{icon:'g:gateClose',name:'Close Gate',tip:GATE_MODES.closed,ok:true,badge:m==='closed'?'●':'',run:()=>ownBuildings().filter(x=>x.def.gate).forEach(x=>fortGateMode(x,'closed'))});
    mk(2,{icon:'g:gateAuto',name:'Auto Gate',tip:GATE_MODES.auto+' (default)',ok:true,badge:m==='auto'?'●':'',run:()=>ownBuildings().filter(x=>x.def.gate).forEach(x=>fortGateMode(x,'auto'))});}
  if(b.def.cargo){const n=b.cargo?b.cargo.length:0;
    mk(0,{icon:'g:unload',name:'Unload All',tip:'Everyone inside steps out next to the '+b.def.name+'.',ok:n>0,why:'Empty',badge:n||'',run:()=>{for(const x of ownBuildings())if(x.def.cargo)cargoUnloadAll(x);}});
    mk(8,{icon:'g:salvage',name:'Salvage',tip:'Dismantle the '+b.def.name+' and recover '+Math.round(b.def.salvage*100)+'% of its cost. Passengers step out.',ok:true,run:()=>{const L=ownBuildings().filter(x=>x.def.salvage);for(const x of L)fortSalvage(x);setSel([]);}});}
}
/* right-click / tap with units selected: load into an own Bunker or Dropship; a Dropship selection picks a unit up */
function fortContext(ent,units,shift){
  if(!ent||ent.team!==0||!units.length)return false;
  if(ent.def&&ent.def.cargo&&(ent.kind==='building'?ent.done:true)){
    const L=units.filter(u=>u!==ent&&cargoCan(ent,u));
    if(!L.length){const w=units.find(u=>u!==ent);if(w&&!(ent.kind==='building'&&ent.hp<ent.maxhp&&units.some(u=>u.def.worker))){const why=cargoWhy(ent,w);if(why&&!units.every(u=>u.def.worker)){msg(0,why);return true;}}return false;}
    const n=cargoOrderLoad(L,ent,shift);if(n){ping(ent.x,ent.y,'#8affc0');sfx('ack',undefined,undefined,L[0]);if(n<L.length)msg(0,ent.def.name+' is full');}
    const rest=units.filter(u=>!L.includes(u)&&u!==ent);if(rest.length)issueGroup(rest,ent.x,ent.y+TILE*1.5,'move',shift);
    return true;}
  if(ent.kind==='unit'){const ds=units.filter(u=>u.def.cargo&&u!==ent);
    if(ds.length&&units.every(u=>u.def.cargo)){for(const d of ds)if(cargoOrderPickup(d,ent,shift)){ping(ent.x,ent.y,'#8affc0');sfx('ack',undefined,undefined,d);return true;}msg(0,cargoWhy(ds[0],ent)||'Cannot load');return true;}}
  return false;
}
function fortContextTarget(ent,units){   // touch: tapping an own transport with loadable units selected is an order, not a selection
  if(!ent||ent.team!==0||!ent.def||!ent.def.cargo)return false;
  return units.some(u=>u!==ent&&cargoCan(ent,u));
}
function fortRally(r,ent){if(ent&&ent.kind==='building'&&ent.team===0&&ent.def.cargo&&ent.done)r.host=ent;return r;}

/* ------------------------------------------------------------------ targeting */
const FORT_TARGETS={scan:'Scanner Sweep: click the map or the minimap',load:'Load: click a friendly ground unit',unload:'Unload: click where to drop the cargo'};
const FORT_TARGETS_TOUCH={scan:'Tap where to scan (map or minimap)',load:'Tap a friendly unit to pick up',unload:'Tap where to drop the cargo'};
function fortTargetLabel(kind){return ui.touchMode?FORT_TARGETS_TOUCH[kind]:FORT_TARGETS[kind];}
function fortApplyTarget(k,wx,wy,shift){
  if(k==='scan'){if(fortScan(0,wx,wy))ping(wx,wy,'#7cd8ff');return true;}
  if(k==='unload'){const ds=ownUnits().filter(u=>u.def.cargo&&u.cargo&&u.cargo.length);for(const d of ds)cargoOrderUnload(d,wx,wy,shift);if(ds.length){ping(wx,wy,'#ffd45a');sfx('ack',undefined,undefined,ds[0]);}else msg(0,'Nothing aboard');return true;}
  if(k==='load'){const e=entityAt(wx,wy,ui.touchMode?TP.PAD:5),ds=ownUnits().filter(u=>u.def.cargo);
    if(e&&e.kind==='unit'&&e.team===0&&ds.length){for(const d of ds)if(cargoOrderPickup(d,e,shift)){ping(e.x,e.y,'#8affc0');sfx('ack',undefined,undefined,d);return true;}msg(0,cargoWhy(ds[0],e)||'Cannot load that');}
    else msg(0,'Pick a friendly ground unit');return true;}
  return false;
}

/* ------------------------------------------------------------------ placement: wall lines, gate orientation */
function fortPlaceInit(p){if(p&&BDEF[p.id].line){p.line=true;p.start=null;p.tiles=[];p.plan=null;}}
function fortMouseTile(){const w=s2w(ui.mx,ui.my);return[clamp(Math.floor(w.x/TILE),0,MW-1),clamp(Math.floor(w.y/TILE),0,MH-1)];}
/* called first by updatePlaceGhost: true = handled here (wall line); a gate picks its orientation and lets the normal ghost run */
function fortGhost(p){
  const d=BDEF[p.id];
  if(p.line){const cur=fortMouseTile(),s=p.start||cur;p.tiles=fortLineTiles(s[0],s[1],cur[0],cur[1],24);
    const P=fortLinePlan(0,p.tiles,false),c=bCost(0,p.id),T=G.teams[0],aff=c.c>0?Math.floor(T.c/c.c):P.ok.length;
    p.plan=P;p.n=Math.min(P.ok.length,aff);p.tx=cur[0];p.ty=cur[1];const r=reqBuild(0,p.id);
    p.ok=r.ok&&P.ok.length>0&&P.sealOK&&p.n>0;p.why=!r.ok?r.why:!P.ok.length?'Blocked':!P.sealOK?'Would seal your base in':p.n<=0?'Not enough crystals':'';
    return true;}
  if(d.gate){const w=s2w(ui.mx,ui.my),bl=(x,y)=>!inMap(x,y)||G.blocked[y*MW+x];
    const hx=Math.round(w.x/TILE-1),hy=Math.floor(w.y/TILE),vx=Math.floor(w.x/TILE),vy=Math.round(w.y/TILE-1);
    const okH=canPlace(0,'gate',hx,hy),okV=canPlace(0,'gatev',vx,vy);
    const sh=(bl(hx-1,hy)?1:0)+(bl(hx+2,hy)?1:0)+(okH?4:0),sv=(bl(vx,vy-1)?1:0)+(bl(vx,vy+2)?1:0)+(okV?4:0);   // a placeable orientation first, then the one whose ends touch walls
    if(sv>sh)p.id='gatev';else if(sh>sv)p.id='gate';}
  return false;
}
function fortLineDown(){const p=ui.place;if(!p||!p.line)return false;p.start=fortMouseTile();updatePlaceGhost();return true;}
function fortLineTap(sx,sy){const p=ui.place;ui.mx=sx;ui.my=sy;if(!p.start){p.start=fortMouseTile();}updatePlaceGhost();}
function fortLineLabel(p){
  const c=bCost(0,p.id);if(!p.start)return'Wall: tap the start of the line';
  return'Wall ×'+(p.n||0)+(p.plan&&p.plan.bad.length?' ('+p.plan.bad.length+' blocked)':'')+' — '+(p.n||0)*c.c+' ◆'+(p.ok?' — tap ✔ to build':' — '+(p.why||'blocked'));
}
function fortTryPlace(shift){
  const p=ui.place;if(!p||!p.line)return false;
  updatePlaceGhost();
  if(!p.ok){msg(0,'Cannot build here: '+(p.why||'blocked').toLowerCase());p.start=null;return true;}
  const ws=ownUnits().filter(u=>u.def.worker);if(!ws.length){ui.place=null;return true;}
  const r=fortPlaceLine(0,ws,p.tiles,shift,false);
  if(r.ok){const t=p.tiles[p.tiles.length-1];ping((t[0]+.5)*TILE,(t[1]+.5)*TILE,'#7cc4ff');sfx('click');if(r.skipped)toast(r.n+' wall segments ordered, '+r.skipped+' blocked tiles skipped','good');}
  else msg(0,r.why||'Cannot build here');
  if(!shift||!reqBuild(0,p.id).ok)ui.place=null;else{p.start=null;p.tiles=[];}
  return true;
}

/* ------------------------------------------------------------------ info panel */
function fortInfo(e){
  if(!e||!e.def)return'';const d=e.def,own=e.team===0;let h='';
  const icons=list=>'<div class="chips">'+list.map(u=>'<span class="chipx">'+u.def.name+'</span>').join('')+'</div>';
  const pass=x=>(x.cargo||[]).map(id=>G.units.find(z=>z.id===id)).filter(Boolean);
  if(e.kind==='building'){
    if(e.type==='hub'&&own){const en=e.energy===undefined?FORT.hubEnergy0:e.energy;h+=bar(en/FORT.hubEnergyMax,'mana','Energy '+Math.floor(en)+' / '+FORT.hubEnergyMax+' (scan '+FORT.scan.energy+')');
      if(e.fort)h+='<div class="st"><b>Fortress</b> · armor +'+FORT.fortress.armor+' · cannon '+FORT.fortress.dmg+' dmg, range '+FORT.fortress.range+'</div>';}
    else if(e.type==='hub'&&e.fort)h+='<div class="st"><b>Fortress</b></div>';
    if(d.gate)h+='<div class="st">Mode: <b>'+({auto:'Auto',open:'Open',closed:'Closed'}[e.gmode||'auto'])+'</b> — '+GATE_MODES[e.gmode||'auto']+'</div>';
    if(d.cargo&&(own||e.cargo&&e.cargo.length)){const L=pass(e);h+='<div class="st">Inside: <b>'+cargoUsed(e)+'</b> / '+d.cargo+(own?' · range +1 tile while inside':'')+'</div>'+(own&&L.length?icons(L):'');}
    if(d.mine&&own)h+='<div class="st">'+(e.done?'Armed — invisible to the enemy unless detected':'Arming…')+' · '+fortMineCount(0)+' / '+d.limit+' mines</div>';
    if(d.healRate&&own)h+='<div class="st">Repairs '+d.healRate+' HP/s · '+(d.healCost*(G.teams[0].faction==='meridian'?0.5:1))+' ether per HP'+(e.healT>0?' · <b>repairing</b>':'')+'</div>';
    if(d.radar&&own)h+='<div class="st">Radar contacts: <b>'+fortSensorBlips(0).length+'</b> within '+Math.round(d.radar/TILE)+' tiles</div>';
  }else if(d.cargo&&own){const L=pass(e);h+='<div class="st">Cargo: <b>'+cargoUsed(e)+'</b> / '+d.cargo+'</div>'+(L.length?icons(L):'');}
  return h;
}
function fortHud(){   // passengers leave the selection (they cannot be ordered while inside)
  if(ui.sel.some(e=>e.inside)){setSel(ui.sel.filter(e=>!e.inside));}
}

/* ------------------------------------------------------------------ drawing (world space; ctx is in world coordinates) */
function fortDrawGhost(t){
  const p=ui.place;if(!p||!p.line)return false;const f=G.teams[0].faction,sp=buildingSprite(p.id,f),P=p.plan;if(!P)return true;
  const okSet=new Set(P.ok.slice(0,p.n).map(([x,y])=>y*MW+x));
  for(const[x,y]of p.tiles){const i=y*MW+x,good=okSet.has(i),cx=(x+.5)*TILE,cy=(y+.5)*TILE;
    if(good){ctx.save();ctx.translate(cx,cy);ctx.globalAlpha=P.sealOK?0.72:0.4;ctx.drawImage(sp.cv,sp.x0,sp.y0,sp.w,sp.h);ctx.restore();}
    ctx.fillStyle=good&&P.sealOK?'rgba(80,255,140,.26)':'rgba(255,70,70,.38)';ctx.fillRect(x*TILE,y*TILE,TILE-1,TILE-1);}
  const e=p.tiles[p.tiles.length-1],c=bCost(0,p.id),lbl=(p.n||0)+' × '+c.c+' = '+(p.n||0)*c.c+' ◆'+(p.ok?'':' — '+p.why);
  ctx.font='bold 12px system-ui';ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.lineWidth=3;ctx.strokeStyle='rgba(0,0,0,.8)';ctx.strokeText(lbl,(e[0]+1.2)*TILE,e[1]*TILE-4);ctx.fillStyle=p.ok?'#bfffd4':'#ffb0b0';ctx.fillText(lbl,(e[0]+1.2)*TILE,e[1]*TILE-4);
  return true;
}
/* per building (drawBuilding, translated to the building's centre): gate barrier, rotating weapon heads */
function fortDrawBuilding(b,t,f){
  const d=b.def;if(!b.done)return;
  if(d.gate){const m=b.gmode||'auto',col=G.teams[b.team].pal,lx=b.w>=b.h,L=(lx?b.w:b.h)*TILE/2-14;
    if(m!=='open'){ctx.save();const a=m==='closed'?0.85:0.35+0.15*Math.sin(t*4+b.id);ctx.globalAlpha=a;ctx.strokeStyle=m==='closed'?'#ff7a5a':col.glow;ctx.lineWidth=m==='closed'?5:3;
      for(let k=0;k<3;k++){const z=-8-k*7;ctx.beginPath();if(lx){ctx.moveTo(-L,z);ctx.lineTo(L,z);}else{ctx.moveTo(0,-L+z);ctx.lineTo(0,L+z);}ctx.stroke();}ctx.restore();}}
  const head=b.type==='cannon'?'cannonhead':b.type==='flak'?'flakhead':b.type==='hub'&&b.fort?'fortgun':null;
  if(head){const ang=b.type==='hub'?(b.fang||0):(b.ang||0),hd=partSprite(head,f,ang),oy=b.type==='hub'?-sp_hubTop(b,f):-8*K3;ctx.drawImage(hd.cv,hd.x0,hd.y0+oy,hd.w,hd.h);drawEmissive(hd,hd.x0,hd.y0+oy,hd.w,hd.h,.8);}
}
function sp_hubTop(b,f){const sp=buildingSprite('hub',f);return sp.hz*K3*0.62;}
function fortDrawWorld(t){
  if(!G)return;
  // Scanner Sweeps (own always; the enemy's are seen as a warning ring in your fog too)
  if(G.scans)for(const s of G.scans){const p=1-s.t/(s.t0||10),col=s.team===0?'124,216,255':'255,120,90';
    ctx.strokeStyle='rgba('+col+','+(0.55*(1-p*0.6))+')';ctx.lineWidth=2;ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,TAU);ctx.stroke();
    const a=t*2.2;ctx.strokeStyle='rgba('+col+',.35)';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(s.x,s.y);ctx.lineTo(s.x+Math.cos(a)*s.r,s.y+Math.sin(a)*s.r);ctx.stroke();}
  // Sensor Tower radar blips: units you do not see
  for(const q of fortSensorBlips(0)){if(!onScreen(q.x,q.y,20))continue;const k=0.55+0.45*Math.sin(t*5+q.id);
    ctx.fillStyle='rgba(255,70,60,'+(0.35+0.4*k)+')';ctx.beginPath();ctx.moveTo(q.x,q.y-7);ctx.lineTo(q.x+6,q.y);ctx.lineTo(q.x,q.y+7);ctx.lineTo(q.x-6,q.y);ctx.closePath();ctx.fill();
    ctx.strokeStyle='rgba(255,140,120,.8)';ctx.lineWidth=1;ctx.stroke();}
  // Repair Battery beams
  for(const b of G.buildings){if(b.dead||!b.def.healRate||!(b.healT>0)||!b.healId||!entVisible(b))continue;
    const e=G.units.find(u=>u.id===b.healId)||G.buildings.find(x=>x.id===b.healId);if(!e||e.dead||!onScreen(e.x,e.y,200))continue;
    const k=0.6+0.4*Math.sin(t*18);ctx.strokeStyle='rgba(125,255,200,'+(0.5*k+0.3)+')';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(b.x,b.y-22);ctx.lineTo(e.x,e.y-(e.kind==='unit'?4:10));ctx.stroke();
    ctx.strokeStyle='rgba(255,255,255,.75)';ctx.lineWidth=1;ctx.stroke();}
  // range rings of a selected own Bunker / Sensor
  if(ui.sel.length===1&&ui.sel[0].team===0&&ui.sel[0].kind==='building'){const b=ui.sel[0];
    const rg=b.def.cargo?135+FORT.bunkerRange+b.w*TILE/2:b.def.radar||b.def.healRange||(b.fort?FORT.fortress.range:0);
    if(rg){ctx.strokeStyle='rgba(255,255,255,.22)';ctx.setLineDash([4,6]);ctx.lineWidth=1.4;ctx.beginPath();ctx.arc(b.x,b.y,rg,0,TAU);ctx.stroke();ctx.setLineDash([]);}}
  // targeting previews
  const tg=ui.target;if(tg&&(tg.kind==='scan'||tg.kind==='unload')){const w=s2w(ui.mx,ui.my);
    if(tg.kind==='scan'){ctx.strokeStyle='rgba(124,216,255,.85)';ctx.fillStyle='rgba(124,216,255,.10)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(w.x,w.y,FORT.scan.r,0,TAU);ctx.fill();ctx.stroke();}
    else{ctx.strokeStyle='rgba(255,212,90,.9)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(w.x,w.y,22,0,TAU);ctx.stroke();ctx.beginPath();ctx.moveTo(w.x,w.y-30);ctx.lineTo(w.x,w.y-6);ctx.stroke();}}
}
function fortDrawMinimap(g,k){
  if(!G||ui.demo)return;
  for(const q of fortSensorBlips(0)){g.fillStyle='#ff5a4a';g.fillRect(q.x*k-1.6,q.y*k-1.6,3.2,3.2);}
  if(G.scans)for(const s of G.scans){g.strokeStyle=s.team===0?'rgba(124,216,255,.9)':'rgba(255,120,90,.8)';g.lineWidth=1.2;g.beginPath();g.arc(s.x*k,s.y*k,s.r*k,0,TAU);g.stroke();}
}

/* ------------------------------------------------------------------ in-game help */
const FORT_HELP_HTML=`
<h3>Defence <small>(Hauler → Defence, key D)</small></h3><div class="keys">
<div><b>Wall</b><span>Drag a line (touch: tap start, tap end, ✔). Haulers build the segments one after another; blocked tiles are skipped. You cannot wall your own Hub in — leave a gap or build a Gate.</span></div>
<div><b>Gate</b><span>Turns to fit between walls. Auto: your units pass, enemies are blocked · Open · Closed (Q W E)</span></div>
<div><b>Bunker</b><span>Right-click it with infantry (Riflemen, Rocketeers, Menders, Specters, ranged heroes): 4 inside, +1 tile range, protected. Unload All (Q) · Salvage 75% (Z) · rally a Garrison onto it to auto-load</span></div>
<div><b>Towers</b><span>Turret (ground + air, detects) · Cannon Tower (ground, heavy, short) · Anti-Air Battery (air only, long range)</span></div>
<div><b>Sensor Tower</b><span>Red radar blips for enemy units within 30 tiles (no detail, no fog lifted)</span></div>
<div><b>Repair Battery</b><span>Repairs the most damaged friendly unit or structure nearby, for ether</span></div>
<div><b>Mine</b><span>Invisible to the enemy unless detected; blows up under enemy ground units. 12 per player</span></div>
<div><b>Hub: S / D</b><span>Scanner Sweep (50 energy: reveals and detects an area for 10 s, map or minimap) · Fortress upgrade (permanent)</span></div>
<div><b>Dropship</b><span>Airfield, Era II. Right-click it with units to load; R picks a unit up, S unloads at a point, D unloads here</span></div>
<div><b>Walled in?</b><span>Attack-moving units break through the wall or gate in their way. Sieged Howitzers and Titans crush walls</span></div>
</div>`;

if(typeof window!=='undefined'&&window.__TEST)window.__RTSF={fortPlaceLine,fortLineTiles,fortLinePlan,fortSealOK,fortScan,fortGateMode,fortSalvage,queueFortress,cargoOrderLoad,cargoOrderUnload,cargoOrderPickup,cargoUnloadAll,cargoUsed,cargoCan,isDetectedBy,fortSensorBlips,FORT,FORT_NEW,AI_FORT,fortMineCount,fortGhost,fortTryPlace,fortLineLabel};
