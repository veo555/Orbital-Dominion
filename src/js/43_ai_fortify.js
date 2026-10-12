/* =========================================================================
   43_AI_FORTIFY (v6-G1 FORTIFY) — the skirmish T2 opponent's use of the defence layer. SIM-SIDE, deterministic (AI rng airand only),
   bounded, parameter-driven (no league training): docs/DESIGN_FORTIFY.md §5. The legacy v3 AI (campaign missions) never calls this.
     bunker + battery  Normal / Hard / Master: a Hub under pressure (defence-demand pheromone ai.ph.def at the Hub, i.e. the threat map,
                       or perceived enemy value near it) gets one Bunker toward the enemy and one Repair Battery; nearby idle infantry
                       load into the Bunker while the pressure lasts and come out when it is gone
     ramp wall         Hard / Master: when a rush is expected (rush-style opponent, or its army seen before AI_FORT.rushSeenBy) and before
                       AI_FORT.wallBy, wall the top of the main ramp once: a Gate in the middle, Wall segments on the rest
   Enemy walls need nothing here: every unit follows the breach rule (31_defense.js).
   ========================================================================= */
const AI_FORT={off:false,
  defTiers:{normal:1,hard:1,master:1},wallTiers:{hard:1,master:1},
  every:4,                      // run on every 4th think (about every 1.8 s)
  thrPh:1.5,thrVal:150,         // pressure at a Hub: pheromone >= thrPh (~150 value deposited) or perceived enemy value within 650 px >= thrVal
  bunkerMax:2,batteryMax:2,     // per game, alive or being built; at most one of each within 10 tiles of a Hub
  bunkerDist:6,                 // tiles from the Hub toward the enemy start
  loadR:14*TILE,calm:30,        // infantry within loadR of a Bunker loads under pressure; unload when the Hub's perceived threat < calm
  rushSeenBy:240,wallBy:360,wallMax:8};
function aiFortify(ai,R){
  if(AI_FORT.off||ai.kind!=='t2'||!R.hubs.length)return;
  const dT=AI_FORT.defTiers[ai.tier],wT=AI_FORT.wallTiers[ai.tier];if(!dT&&!wT)return;
  if(ai.k%AI_FORT.every!==1)return;
  const team=ai.team,T=G.teams[team],now=G.time,F=ai.fort||(ai.fort={wall:0,rushT:-1,built:{bunker:0,battery:0}});
  if(F.rushT<0&&R.en.some(e=>!e.def.worker&&!e.def.trade))F.rushT=now;
  const pressure=[];
  for(const h of R.hubs){let v=0;for(const e of R.en)if(!e.def.worker&&!e.def.trade&&hyp(e.x-h.x,e.y-h.y)<650)v+=aiVal(e.type);
    const ph=ai.ph.def[bcell(h.x,h.y)]||0;pressure.push({h,v,ph,hot:ph>=AI_FORT.thrPh||v>=AI_FORT.thrVal});}
  if(dT){
    for(const P of pressure){
      const h=P.h,main=h===R.hubs[0];
      if(P.hot&&(!main||ai.mil==='defend')){
        if(aiFortNear(R,'bunker',h)<1&&aiFortCount(R,'bunker')<AI_FORT.bunkerMax&&reqBuild(team,'bunker').ok&&T.c>=bCost(team,'bunker').c+50){if(aiFortBuild(ai,R,'bunker',h))break;}
        else if(aiFortNear(R,'battery',h)<1&&aiFortCount(R,'battery')<AI_FORT.batteryMax&&reqBuild(team,'battery').ok&&T.c>=150&&T.e>=100){if(aiFortBuild(ai,R,'battery',h))break;}}}
    // load / unload infantry
    for(const b of R.B){if(b.type!=='bunker'||!b.done)continue;
      let P=null,bd=1e9;for(const p of pressure){const d=hyp(p.h.x-b.x,p.h.y-b.y);if(d<bd){bd=d;P=p;}}if(!P)continue;
      if(P.hot&&P.v>0&&cargoUsed(b)<cargoCap(b)){
        const L=R.army.filter(u=>!u.inside&&u.order.t!=='load'&&cargoCan(b,u)&&hyp(u.x-b.x,u.y-b.y)<AI_FORT.loadR&&!ai.har.ids.includes(u.id)&&!(ai.mil==='attack'&&(ai.grp||[]).includes(u.id))&&!(ai.creep&&ai.creep.ids.includes(u.id)));
        if(L.length&&aiAct(ai))cargoOrderLoad(L,b);}
      else if(b.cargo&&b.cargo.length&&P.v<AI_FORT.calm&&P.ph<AI_FORT.thrPh*0.5){if(aiAct(ai))cargoUnloadAll(b);}}
  }
  if(wT&&!F.wall&&now<AI_FORT.wallBy){
    const rush=FACTIONS[G.teams[ai.enemy].faction].style==='rush'||F.rushT>=0&&F.rushT<AI_FORT.rushSeenBy;
    if(rush&&T.c>=250)F.wall=aiFortWall(ai,R)?1:(now>AI_FORT.wallBy-30?-1:0);
  }
}
function aiFortCount(R,type){let n=0;for(const b of R.B)if(b.type===type)n++;for(const w of R.workers){const o=w.order;if(o.t==='build'&&!o.bld&&o.type===type)n++;}return n;}
function aiFortNear(R,type,h){let n=0;for(const b of R.B)if(b.type===type&&hyp(b.x-h.x,b.y-h.y)<10*TILE)n++;
  for(const w of R.workers){const o=w.order;if(o.t==='build'&&!o.bld&&o.type===type&&hyp((o.tx+1)*TILE-h.x,(o.ty+1)*TILE-h.y)<10*TILE)n++;}return n;}
function aiFortWorker(ai,R,x,y){let w=null,bd=1e9;
  for(const u of R.workers){if(u.order.t==='build'||u.order.t==='repair'||u.garr||u.inside||u.id===ai.scout.id)continue;const dd=hyp(u.x-x,u.y-y)+(u.carry>0?150:0);if(dd<bd){bd=dd;w=u;}}
  return w;}
function aiFortBuild(ai,R,type,h){
  const d=BDEF[type],em=G.sites[ai.enemy],ex=em.cx*TILE,ey=em.cy*TILE,l=hyp(ex-h.x,ey-h.y)||1,ux=(ex-h.x)/l,uy=(ey-h.y)/l;
  const gx=h.x/TILE+ux*AI_FORT.bunkerDist*(type==='battery'?0.6:1),gy=h.y/TILE+uy*AI_FORT.bunkerDist*(type==='battery'?0.6:1),reserved=pendingRects(R.workers);
  let best=null,bs=1e9;
  for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){
    const tx=Math.round(gx+dx-d.w/2),ty=Math.round(gy+dy-d.h/2),cx=(tx+d.w/2)*TILE,cy=(ty+d.h/2)*TILE,s=hyp(dx,dy)+airand(ai)*0.5;
    if(s>=bs)continue;if(hyp(cx-h.x,cy-h.y)<3.2*TILE)continue;if(!spotOK(ai.team,type,tx,ty,d,reserved,cx,cy))continue;bs=s;best={tx,ty};}
  if(!best)return false;
  const w=aiFortWorker(ai,R,(best.tx+1)*TILE,(best.ty+1)*TILE);if(!w||!aiAct(ai))return false;
  return orderBuild(w,type,best.tx,best.ty);
}
/* the top of the main ramp: main-plateau floor tiles 4-adjacent to a ramp tile, reached from the main Hub over the plateau */
function aiFortRampLine(team){
  const s=G.sites[team],hub=G.buildings.find(b=>!b.dead&&b.team===team&&b.type==='hub'&&hyp(b.x-s.cx*TILE,b.y-s.cy*TILE)<6*TILE);if(!hub)return null;
  const h0=G.H[(s.cy)*MW+s.cx],seen=new Uint8Array(NN),q=[],line=[];
  for(let y=hub.ty-1;y<=hub.ty+hub.h;y++)for(let x=hub.tx-1;x<=hub.tx+hub.w;x++){const i=y*MW+x;if(G.TT[i]===0&&!G.RAMP[i]&&G.H[i]===h0&&!seen[i]){seen[i]=1;q.push(i);}}
  for(let k=0;k<q.length&&k<NN;k++){const c=q[k],cx=c%MW,cy=(c/MW)|0;let edge=false;
    for(let j=0;j<4;j++){const nx=cx+DX[j],ny=cy+DY[j];if(nx<0||ny<0||nx>=MW||ny>=MH)continue;const ni=ny*MW+nx;
      if(G.RAMP[ni]){edge=true;continue;}if(seen[ni]||G.TT[ni]!==0||G.H[ni]!==h0)continue;seen[ni]=1;q.push(ni);}
    if(edge)line.push([cx,cy]);}
  if(!line.length)return null;
  // the edge can be L / U shaped (plateau floor beside the ramp's top corners): the gate goes in the middle of its longest straight run
  const runs={};for(const p of line){(runs['x'+p[0]]||(runs['x'+p[0]]=[])).push(p);(runs['y'+p[1]]||(runs['y'+p[1]]=[])).push(p);}
  let best=null;for(const k of Object.keys(runs).sort()){const r=runs[k].slice().sort((a,b)=>k[0]==='x'?a[1]-b[1]:a[0]-b[0]);
    let s0=0;for(let i=1;i<=r.length;i++){if(i<r.length&&(k[0]==='x'?r[i][1]-r[i-1][1]:r[i][0]-r[i-1][0])===1)continue;const seg=r.slice(s0,i);if(!best||seg.length>best.seg.length)best={seg,horiz:k[0]==='y'};s0=i;}}
  return{line,run:best.seg,horiz:best.horiz};
}
function aiFortWall(ai,R){
  const team=ai.team,L=aiFortRampLine(team);if(!L||L.run.length<2||L.line.length<3||L.line.length>AI_FORT.wallMax)return false;
  const m=Math.max(0,Math.floor((L.run.length-2)/2)),g=L.run[m],g2=L.run[m+1],gType=L.horiz?'gate':'gatev';   // the gate lies along the run, in its middle
  if(!reqBuild(team,gType).ok||!canPlace(team,gType,Math.min(g[0],g2[0]),Math.min(g[1],g2[1]),true))return false;
  const walls=L.line.filter(p=>p!==g&&p!==g2);
  if(!fortLinePlan(team,walls,true).sealOK)return false;
  const w=aiFortWorker(ai,R,(g[0]+.5)*TILE,(g[1]+.5)*TILE);if(!w||!aiAct(ai))return false;
  if(!orderBuild(w,gType,Math.min(g[0],g2[0]),Math.min(g[1],g2[1])))return false;
  fortPlaceLine(team,[w],walls,true,true);
  ai.st.wall=(ai.st.wall||0)+1;return true;
}
