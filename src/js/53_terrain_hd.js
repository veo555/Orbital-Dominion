/* =========================================================================
   ART (3b/3) — sharp terrain tiles
   The base ground is baked once at 1 world px = 1 canvas px. On a retina screen or when zoomed in that bitmap is stretched
   2-3x and the panel seams, rings and speckles go soft next to the (vector-sharp) sprites. Here the same generator
   (terrainPaint) is re-run onto small canvases at 2x / 3x, clipped to one tile, only for the tiles the camera can see
   and only while DPR x zoom > 1.2. One generator stage runs per step inside a small per-frame time budget, so there are
   no long frames; until a tile is ready the 1x base shows through, then the tile fades in by simply being drawn on top.
   Memory is bounded (LRU). Rendering only: the simulation never reads this.
   ========================================================================= */
const TCH=512,TPAD=6;   // tile edge and overlap, in world px (the overlap hides seams between tiles)
const tch={map:new Map(),cap:14,frame:0,baked:0,pending:0,stageMs:0,lastScale:0};

function terrainReset(){for(const t of tch.map.values())t.cv.width=0;tch.map.clear();tch.pending=0;tch.baked=0;}
function terrainQualityChanged(){terrainReset();}
function terrainChunkInfo(){return' · tiles '+tch.baked+'/'+tch.map.size+(tch.pending?' (+'+tch.pending+')':'');}
function tileScaleWanted(){
  if(Q.hires<1)return 0;
  const need=DPR*cam.z;if(need<1.2)return 0;
  return(Q.hires>=2&&need>2.3)?3:2;
}
function tileFor(cx,cy,s,create){
  const k=cx+','+cy+','+s;let t=tch.map.get(k);
  if(t||!create)return t;
  const x0=cx*TCH-TPAD,y0=cy*TCH-TPAD,w=Math.min(WW,(cx+1)*TCH+TPAD)-x0,h=Math.min(WH,(cy+1)*TCH+TPAD)-y0;
  const cv=mkCanvas(w*s,h*s),g=cv.getContext('2d');
  g.setTransform(s,0,0,s,-x0*s,-y0*s);g.beginPath();g.rect(x0,y0,w,h);g.clip();
  t={k,cx,cy,s,x0,y0,w,h,cv,g,gen:terrainPaint(g,G.tInfo),done:false,last:0};
  tch.map.set(k,t);return t;
}
/* advance tile generators (nearest the screen centre first) for at most `ms` milliseconds */
function terrainStream(ms){
  if(!G||!G.tInfo||!Q.hires)return;
  const s=tileScaleWanted();if(!s){tch.pending=0;return;}
  const z=cam.z,vx0=cam.x,vy0=cam.y,vx1=cam.x+VW/z,vy1=cam.y+VH/z,mx=(vx0+vx1)/2,my=(vy0+vy1)/2;
  const c0=Math.max(0,Math.floor(vx0/TCH)),c1=Math.min(Math.ceil(WW/TCH)-1,Math.floor(vx1/TCH)),r0=Math.max(0,Math.floor(vy0/TCH)),r1=Math.min(Math.ceil(WH/TCH)-1,Math.floor(vy1/TCH));
  const want=[];
  for(let cy=r0;cy<=r1;cy++)for(let cx=c0;cx<=c1;cx++){
    // only worth a tile if some of it has been explored (otherwise it is black fog)
    if(!ui.demo&&!tileExplored(cx,cy))continue;
    const t=tileFor(cx,cy,s,false);if(t&&t.done){t.last=tch.frame;continue;}
    want.push({cx,cy,d:Math.hypot((cx+.5)*TCH-mx,(cy+.5)*TCH-my)});
  }
  tch.pending=want.length;
  if(!want.length)return;
  want.sort((a,b)=>a.d-b.d);
  const t0=performance.now();
  for(const w of want){
    const t=tileFor(w.cx,w.cy,s,true);t.last=tch.frame;
    while(!t.done&&performance.now()-t0<ms){
      const r=t.gen.next();
      if(r.done){t.done=true;tch.baked++;replayDecals(t);}
    }
    if(performance.now()-t0>=ms)break;
  }
  // memory bound: drop the least recently useful tiles
  if(tch.map.size>tch.cap){
    const arr=[...tch.map.values()].sort((a,b)=>a.last-b.last);
    for(const t of arr){if(tch.map.size<=tch.cap)break;if(t.last===tch.frame)continue;t.cv.width=0;tch.map.delete(t.k);if(t.done)tch.baked--;}
  }
}
function tileExplored(cx,cy){
  const v=G.vis[0],tx0=Math.floor(cx*TCH/TILE),ty0=Math.floor(cy*TCH/TILE),tx1=Math.min(MW-1,Math.floor(((cx+1)*TCH-1)/TILE)),ty1=Math.min(MH-1,Math.floor(((cy+1)*TCH-1)/TILE));
  for(let y=ty0;y<=ty1;y+=2)for(let x=tx0;x<=tx1;x+=2)if(v[y*MW+x]>0)return true;
  return false;
}
/* draw every finished tile over the 1x base (world transform already applied by the caller) */
function drawTerrainTiles(ctx,vx0,vy0,vx1,vy1){
  const s=tileScaleWanted();if(!s)return;
  tch.frame++;
  const c0=Math.max(0,Math.floor(vx0/TCH)),c1=Math.min(Math.ceil(WW/TCH)-1,Math.floor(vx1/TCH)),r0=Math.max(0,Math.floor(vy0/TCH)),r1=Math.min(Math.ceil(WH/TCH)-1,Math.floor(vy1/TCH));
  for(let cy=r0;cy<=r1;cy++)for(let cx=c0;cx<=c1;cx++){
    const t=tileFor(cx,cy,s,false)||tileFor(cx,cy,s===3?2:3,false);
    if(t&&t.done){t.last=tch.frame;ctx.drawImage(t.cv,t.x0,t.y0,t.w,t.h);}
  }
}

/* ---- battle damage: painted on the base map and replayed onto every sharp tile ---- */
function paintDecal(g,dd){
  const R=mulberry32(dd.seed),r=Math.max(10,dd.r);
  if(dd.k==='scorch'){g.fillStyle=rgr(g,dd.x,dd.y,1,r*1.25,'rgba(8,6,6,.42)','rgba(8,6,6,0)');g.beginPath();g.arc(dd.x,dd.y,r*1.25,0,TAU);g.fill();
    for(let i=0;i<4;i++){g.fillStyle='rgba(0,0,0,.22)';g.beginPath();g.arc(dd.x+(R()-.5)*r*1.6,dd.y+(R()-.5)*r*1.6,1+R()*2.4,0,TAU);g.fill();}}
  else{g.fillStyle=rgr(g,dd.x,dd.y,2,r*1.4,'rgba(18,14,12,.55)','rgba(18,14,12,0)');g.beginPath();g.arc(dd.x,dd.y,r*1.4,0,TAU);g.fill();
    for(let i=0;i<10;i++){const a=R()*TAU,rr2=R()*r*1.1,x=dd.x+Math.cos(a)*rr2,y=dd.y+Math.sin(a)*rr2,s=2+R()*5;
      g.fillStyle=R()<.5?'rgba(70,64,60,.9)':'rgba(40,36,34,.9)';g.beginPath();g.moveTo(x,y-s);g.lineTo(x+s,y+s*.4);g.lineTo(x-s*.6,y+s);g.closePath();g.fill();}}
}
function replayDecals(t){
  if(!G.decalAll)return;
  for(const dd of G.decalAll){const m=dd.r*1.6+12;if(dd.x<t.x0-m||dd.x>t.x0+t.w+m||dd.y<t.y0-m||dd.y>t.y0+t.h+m)continue;paintDecal(t.g,dd);}
}
function decalToTiles(dd){
  const m=dd.r*1.6+12;
  for(const t of tch.map.values()){if(!t.done)continue;if(dd.x<t.x0-m||dd.x>t.x0+t.w+m||dd.y<t.y0-m||dd.y>t.y0+t.h+m)continue;paintDecal(t.g,dd);}
}
