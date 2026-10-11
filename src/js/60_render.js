/* =========================================================================
   RENDERING — camera with zoom, layered world pass, smooth fog, night lighting,
   selection / order overlays and the minimap
   ========================================================================= */
let cv=null,ctx=null,mm=null,mmCtx=null,VW=1280,VH=720,DPR=1;
const cam={x:0,y:0,z:1,tz:1};
const FQ=4; // fog sub-resolution per tile
let fogCv=null,fogCtx=null,fogImg=null,fogA=null,fogS=null,fogT=null,fogN=null,fogAcc=0,lightCv=null,lightCtx=null;

function viewBottom(){return VH-BOTTOM;}
function clampCam(){
  const z=cam.z,vw=VW/z,vh=VH/z,top=TOPBAR/z,bot=BOTTOM/z;
  cam.x=WW+60<vw?(WW-vw)/2:clamp(cam.x,-30,WW-vw+30);
  cam.y=WH+top+bot<vh?(WH-vh)/2:clamp(cam.y,-top-8,WH-vh+bot+8);
}
function centerOn(x,y){cam.x=x-VW/cam.z/2;cam.y=y-(TOPBAR+(VH-BOTTOM-TOPBAR)/2)/cam.z;clampCam();}
function s2w(sx,sy){return{x:sx/cam.z+cam.x,y:sy/cam.z+cam.y};}
function w2s(wx,wy){return{x:(wx-cam.x)*cam.z,y:(wy-cam.y)*cam.z};}
function setZoom(nz,sx,sy){
  nz=clamp(nz,0.5,1.7);if(Math.abs(nz-cam.z)<1e-4)return;
  const px=sx===undefined?VW/2:sx,py=sy===undefined?VH/2:sy,w=s2w(px,py);cam.z=nz;cam.x=w.x-px/nz;cam.y=w.y-py/nz;clampCam();
}
function onScreen(x,y,pad){const z=cam.z;return x>cam.x-pad&&x<cam.x+VW/z+pad&&y>cam.y-pad&&y<cam.y+VH/z+pad;}
function entVisible(e){
  if(ui.demo)return true;
  if(e.team===0)return true;
  if(e.kind==='building')return e.seen0;
  return seen(0,e);
}
/* ---- responsive layout: <html> classes + measured HUD geometry (desktop, tablet, phone) ---- */
const rootEl=document.documentElement;
function applyLayoutClasses(){
  const W=window.innerWidth,H=window.innerHeight,small=Math.min(W,H)<600||H<500;
  rootEl.classList.toggle('compact',small);rootEl.classList.toggle('portrait',small&&H>W);
  return small;
}
function setTouchMode(on){
  if(ui.touchMode===on)return;
  ui.touchMode=on;rootEl.classList.toggle('touch',on);
  if(on)hideTip();
  measureHud();
}
function measureHud(){
  const hud=$('hud');if(!hud||hud.classList.contains('hidden'))return;
  const t=Math.ceil($('top').getBoundingClientRect().height),b=Math.ceil($('bottom').getBoundingClientRect().height);
  if(t<20||b<20||(t===TOPBAR&&b===BOTTOM))return;
  TOPBAR=t;BOTTOM=b;rootEl.style.setProperty('--tH',t+'px');rootEl.style.setProperty('--bH',b+'px');
  if(G)clampCam();
}
function resizeView(){
  applyLayoutClasses();
  DPR=Math.min(Q.dpr,window.devicePixelRatio||1);VW=window.innerWidth;VH=window.innerHeight;
  cv.width=Math.floor(VW*DPR);cv.height=Math.floor(VH*DPR);
  sizeMinimap();measureHud();
  if(G)clampCam();
}
function sizeMinimap(){   // backing store = on-screen size x DPR (drawMinimap draws in 224-unit space and scales)
  const w=$('mmWrap').clientWidth||MM,px=Math.max(64,Math.round(w*DPR));
  if(mm.width!==px){mm.width=px;mm.height=px;}
}

/* ------------------------------- fog ---------------------------------- */
function initFog(){
  fogCv=mkCanvas(MW*FQ,MH*FQ);fogCtx=fogCv.getContext('2d');fogImg=fogCtx.createImageData(MW*FQ,MH*FQ);
  fogA=new Float32Array(NN).fill(0.97);fogS=new Float32Array(NN);fogT=new Float32Array(NN);fogAcc=1;
  ptReset();
  /* two octaves of value noise that roughen the fog boundary (a fixed table: the edge shimmers with the map, never with time) */
  const n=makeNoise(mulberry32(7771)),W=MW*FQ,H=MH*FQ;fogN=new Float32Array(W*H);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)fogN[y*W+x]=n(x*.21,y*.21)*.65+n(x*.6+9,y*.6+3)*.35;
}
function updateFog(dt,force){
  if(!G||!fogA)return;
  const v=G.vis[0];let changed=false;
  const k=Math.min(1,dt*7);
  for(let i=0;i<NN;i++){const s=v[i],tg=ui.demo?0:(s===2?0:s===1?0.5:0.97),d=tg-fogA[i];if(d>0.004||d<-0.004){fogA[i]+=d*k;changed=true;}else if(d!==0){fogA[i]=tg;}}
  fogAcc+=dt;
  if(!(changed||force)||fogAcc<0.05)return;
  fogAcc=0;const W=MW*FQ,data=fogImg.data;
  fogS.set(fogA);for(let pass=0;pass<2;pass++){   // two [1 2 1] blurs: the vision circle is tile-quantised, the blur turns its stair steps into a soft falloff
    for(let y=0;y<MH;y++)for(let x=0;x<MW;x++){const i=y*MW+x;fogT[i]=(fogS[i-(x>0?1:0)]+2*fogS[i]+fogS[i+(x<MW-1?1:0)])*.25;}
    for(let y=0;y<MH;y++)for(let x=0;x<MW;x++){const i=y*MW+x;fogS[i]=(fogT[i-(y>0?MW:0)]+2*fogT[i]+fogT[i+(y<MH-1?MW:0)])*.25;}}
  for(let py=0;py<MH*FQ;py++){
    const fy=(py+.5)/FQ-.5,y0=Math.floor(fy),ty=fy-y0,y1=Math.min(MH-1,y0+1),yy0=Math.max(0,y0);const sy=ty*ty*(3-2*ty);
    for(let px=0;px<W;px++){
      const fx=(px+.5)/FQ-.5,x0=Math.floor(fx),tx=fx-x0,x1=Math.min(MW-1,x0+1),xx0=Math.max(0,x0),sx=tx*tx*(3-2*tx);
      const a=fogS[yy0*MW+xx0],b=fogS[yy0*MW+x1],c=fogS[y1*MW+xx0],dd=fogS[y1*MW+x1];
      let val=(a+(b-a)*sx)*(1-sy)+(c+(dd-c)*sx)*sy;const o=(py*W+px)*4,edge=4*val*(1-val);   // edge: 0 in clear / fully fogged areas, 1 on the boundary
      val=val+(fogN[py*W+px]-.5)*.42*edge;val=val<0?0:val>1?1:val;
      data[o]=5+14*edge;data[o+1]=8+22*edge;data[o+2]=18+40*edge;data[o+3]=val*255;}}
  fogCtx.putImageData(fogImg,0,0);
}

/* ---------------------------- unit / building draw -------------------- */
function drawBar(x,y,w,frac,col,h){   // SC2-style: dark plate, fill in blocks (one block per ~4 px), top sheen
  h=h||3;frac=clamp(frac,0,1);const bh=h+1;
  ctx.fillStyle='rgba(4,8,16,.86)';ctx.fillRect(x-1,y-1,w+2,bh+1);
  const fw=w*frac;
  if(frac>0.002){ctx.fillStyle=col||(frac>0.5?'#4fe07e':frac>0.25?'#f0c040':'#ff4d4d');ctx.fillRect(x,y,fw,bh-1);
    ctx.fillStyle='rgba(255,255,255,.32)';ctx.fillRect(x,y,fw,Math.max(1,(bh-1)*.38));}
  const n=Math.max(2,Math.round(w/5)),st=w/n;ctx.fillStyle='rgba(4,8,16,.9)';
  for(let i=1;i<n;i++)ctx.fillRect(x+i*st-.5,y-1,1,bh+1);
  ctx.strokeStyle='rgba(255,255,255,.2)';ctx.lineWidth=.6;ctx.strokeRect(x-1,y-1,w+2,bh+1);
}
function selCol(e){return e.team===0?'#6dff9d':e.team===1?'#ff6b6b':'#ffd45a';}
/* selection ring: soft tinted disc, crisp outline, and (when selected) four bright arcs that slowly circle */
function drawSelRing(x,y,rx,ry,col,sel,t){   // SC2: a thin bright circle on the ground with a soft inner glow; hover = dimmer
  const pa=ctx.globalAlpha;ctx.globalAlpha=pa*(sel?.16:.08);ctx.fillStyle=col;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,TAU);ctx.fill();
  ctx.globalAlpha=pa*(sel?.35:.2);ctx.strokeStyle=col;ctx.lineWidth=sel?4:2.5;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,TAU);ctx.stroke();
  ctx.globalAlpha=pa*(sel?1:.65);ctx.lineWidth=sel?1.4:1;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,TAU);ctx.stroke();
  ctx.globalAlpha=pa;
}
/* building ground ring: thicker, an ellipse around the footprint with four brighter arcs on the diagonals */
function drawBldRing(w,h,col,sel){
  const rx=w*.6,ry=h*.6,pa=ctx.globalAlpha;ctx.fillStyle=col;ctx.strokeStyle=col;
  ctx.globalAlpha=pa*(sel?.12:.06);ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,0,TAU);ctx.fill();
  ctx.globalAlpha=pa*(sel?.3:.18);ctx.lineWidth=sel?7:4;ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,0,TAU);ctx.stroke();
  ctx.globalAlpha=pa*(sel?1:.6);ctx.lineWidth=sel?2.4:1.4;ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,0,TAU);ctx.stroke();
  ctx.globalAlpha=pa;
}
/* a building that is still going up: faint ghost, revealed from the ground upwards, blueprint grid above the build line,
   scaffold posts and a glowing weld line (sparks come from fxEmit) */
function drawScaffold(sp,b,w,h,t){
  const rx=sp.x0,ry=sp.y0,rw=sp.w,rh=sp.h,top=ry+rh-rh*b.prog;
  ctx.globalAlpha=0.28;ctx.drawImage(sp.cv,rx,ry,rw,rh);ctx.globalAlpha=1;
  ctx.save();ctx.beginPath();ctx.rect(rx-2,top,rw+4,rh*b.prog+2);ctx.clip();ctx.drawImage(sp.cv,rx,ry,rw,rh);ctx.restore();
  ctx.save();ctx.beginPath();ctx.rect(-w/2,-h/2,w,h);ctx.clip();   // blueprint grid on the footprint, scaffold posts at the corners
  ctx.fillStyle='rgba(60,130,200,.14)';ctx.fillRect(-w/2,-h/2,w,h);
  ctx.strokeStyle='rgba(150,220,255,.3)';ctx.lineWidth=1;ctx.beginPath();for(let x=-w/2+TILE/2;x<w/2;x+=TILE/2){ctx.moveTo(x,-h/2);ctx.lineTo(x,h/2);}for(let y=-h/2+TILE/2;y<h/2;y+=TILE/2){ctx.moveTo(-w/2,y);ctx.lineTo(w/2,y);}ctx.stroke();
  ctx.restore();
  const hz=sp.hz*K3*b.prog+4;ctx.strokeStyle='rgba(224,178,84,.9)';ctx.lineWidth=2;ctx.beginPath();
  for(const sx of[-1,1])for(const sy of[-1,1]){const x=sx*(w/2-1),y=sy*(h/2-1);ctx.moveTo(x,y);ctx.lineTo(x,y-hz);ctx.moveTo(x,y-hz);ctx.lineTo(x-sx*8,y-hz);}ctx.stroke();
  ctx.lineWidth=1.1;ctx.strokeStyle='rgba(224,178,84,.55)';ctx.beginPath();for(let y=h/2-8;y>h/2-hz;y-=12){ctx.moveTo(-w/2+1,y);ctx.lineTo(w/2-1,y-6);}ctx.stroke();
  const g=ctx.createLinearGradient(0,top-8,0,top+3);g.addColorStop(0,'rgba(255,190,90,0)');g.addColorStop(.7,'rgba(255,200,110,.55)');g.addColorStop(1,'rgba(255,240,200,.95)');
  ctx.fillStyle=g;ctx.fillRect(rx+rw*.1,top-8,rw*.8,11);
}
/* a half-size flat-colour copy of a sprite's silhouette (damage darkening, hit flash, remembered-structure tint) */
function silMask(sp,col){const k=sp.cv,c=mkCanvas(Math.max(1,k.width>>1),Math.max(1,k.height>>1)),g=c.getContext('2d');g.drawImage(k,0,0,c.width,c.height);g.globalCompositeOperation='source-in';g.fillStyle=col;g.fillRect(0,0,c.width,c.height);return c;}
function drawBuilding(b,t){
  if(!onScreen(b.x,b.y,b.r+40))return;
  const f=G.teams[b.team].faction,col=G.teams[b.team].pal,w=b.w*TILE,h=b.h*TILE,sp=buildingSprite(b.type,f),sel=ui.selSet.has(b),vis=b.team===0||ui.demo||seen(0,b);
  ctx.save();ctx.translate(b.x,b.y);
  if(Q.shd>0)drawBuildingShadow(sp,w,h,b);else{ctx.fillStyle='rgba(0,0,0,.30)';rrp(ctx,-w/2+6,-h/2+9,w,h,8);ctx.fill();}
  if(sel||ui.hover===b)drawBldRing(w,h,selCol(b),sel);
  if(!b.done){
    drawScaffold(sp,b,w,h,t);
  }else{
    ctx.drawImage(sp.cv,sp.x0,sp.y0,sp.w,sp.h);drawEmissive(sp,sp.x0,sp.y0,sp.w,sp.h,.55+.3*Math.sin(t*2.2+b.id));
    ctx.save();ctx.translate(0,-sp.hz*K3*.8);drawBuildingLive(ctx,b,t,col,f);ctx.restore();
    if(b.type==='turret'){const hd=partSprite('turrethead',f,b.ang||0);ctx.drawImage(hd.cv,hd.x0,hd.y0-8*K3,hd.w,hd.h);drawEmissive(hd,hd.x0,hd.y0-8*K3,hd.w,hd.h,.8);}
    const dmg=1-b.hp/b.maxhp;
    if(dmg>0.35){const k=(dmg-.35)/.65;ctx.globalAlpha=.14+.34*k;ctx.drawImage(sp.dk||(sp.dk=silMask(sp,'#0a0604')),sp.x0,sp.y0,sp.w,sp.h);ctx.globalAlpha=1;
      ctx.save();ctx.translate(0,-sp.hz*K3*.7);
      const crk=()=>{ctx.beginPath();const sd=b.id*7;for(let i=0;i<3+Math.floor(dmg*4);i++){const x=Math.sin(sd+i*2.3)*w*.36,y=Math.cos(sd*1.3+i*1.9)*h*.36;ctx.moveTo(x,y);ctx.lineTo(x+Math.sin(i*4+sd)*9,y+Math.cos(i*3+sd)*9);ctx.lineTo(x+Math.sin(i*5+sd)*14,y+Math.cos(i*2+sd)*14);}ctx.stroke();};
      ctx.strokeStyle='rgba(0,0,0,.55)';ctx.lineWidth=1.4;crk();
      if(dmg>0.55){ctx.globalCompositeOperation='lighter';ctx.strokeStyle='rgba(255,'+(110+60*Math.sin(t*17+b.id))+',40,'+(0.35+0.5*(dmg-0.55)/0.45)+')';ctx.lineWidth=1.6;crk();ctx.globalCompositeOperation='source-over';}   // glowing cracks that flicker as it burns down
      ctx.restore();}
  }
  if(b.dmgFlash>0){ctx.globalAlpha=Math.min(1,b.dmgFlash*1.6);ctx.drawImage(sp.wh||(sp.wh=silMask(sp,'#fff')),sp.x0,sp.y0,sp.w,sp.h);ctx.globalAlpha=1;}
  if(!vis){ctx.globalAlpha=.25;ctx.drawImage(sp.fgm||(sp.fgm=silMask(sp,'#060a14')),sp.x0,sp.y0,sp.w,sp.h);ctx.globalAlpha=1;}
  if(sel||ui.hover===b){ctx.strokeStyle=selCol(b);ctx.lineWidth=sel?2.2:1.2;ctx.globalAlpha=sel?1:.6;const k=12;
    for(const sx of[-1,1])for(const sy of[-1,1]){const x=sx*(w/2+3),y=sy*(h/2+3);ctx.beginPath();ctx.moveTo(x-sx*k,y);ctx.lineTo(x,y);ctx.lineTo(x,y-sy*k);ctx.stroke();}ctx.globalAlpha=1;}
  ctx.restore();
}
function drawUnit(u,t){
  const d=u.def,f=u.team===2?'neutral':G.teams[u.team].faction,sp=unitSprite(u.type,f,u.ang),pal=u.team===2?NEUTRAL_COL:G.teams[u.team].pal,sel=ui.selSet.has(u);
  ctx.save();ctx.translate(u.x,u.y);
  if(u.cloaked)ctx.globalAlpha=(u.team===0||ui.demo)?0.4+0.12*Math.sin(t*5+u.id):0.55;
  if(Q.shd>0){drawUnitShadow(sp,u,d);if(!u.flying){ctx.fillStyle='rgba(0,0,0,.22)';ctx.beginPath();ctx.ellipse(0,3,d.r*.8,d.r*.5,0,0,TAU);ctx.fill();}}   // soft sun shadow + a small contact blob
  else if(u.flying){ctx.fillStyle='rgba(0,0,0,.26)';ctx.beginPath();ctx.ellipse(7,22,d.r*.95,d.r*.5,0,0,TAU);ctx.fill();}
  else{ctx.fillStyle='rgba(0,0,0,.30)';ctx.beginPath();ctx.ellipse(1.5,3.5,d.r*1.0,d.r*.62,0,0,TAU);ctx.fill();}
  if(d.hero){ctx.strokeStyle=pal.glow;ctx.globalAlpha=(ctx.globalAlpha||1)*(.45+.2*Math.sin(t*3));ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,3,d.r+7,d.r*.62+6,0,0,TAU);ctx.stroke();ctx.globalAlpha=u.cloaked?.42:1;}
  if(sel||ui.hover===u){drawSelRing(0,3,d.r+4,d.r*.7+3,selCol(u),sel,t);ctx.globalAlpha=u.cloaked?.42:1;}
  if(u.flying)ctx.translate(0,-16+Math.sin(t*3+u.id)*1.6);
  if(hasBuff(u,'rampage')){ctx.fillStyle='rgba(255,60,40,.22)';circ(ctx,0,0,d.r+8);}
  if(hasBuff(u,'stim')){ctx.fillStyle='rgba(120,255,190,.2)';circ(ctx,0,0,d.r+6);}
  ctx.rotate(u.ang);
  if(d.siege&&(u.sieged||u.siegeT>0)){const k=u.sieged?Math.min(1,1-u.siegeT/1.6):Math.max(0,u.siegeT/1.2);
    ctx.fillStyle='#232c3a';ctx.strokeStyle=OUT;ctx.lineWidth=1;for(const sx of[-1,1])for(const sy of[-1,1]){ctx.beginPath();ctx.rect(sx*(9+8*k)-4,sy*(10+6*k)-3,8,6);ctx.fill();ctx.stroke();}}
  if(u.type==='skiff'){ctx.fillStyle='rgba(255,170,60,'+(0.55+0.3*Math.sin(t*30+u.id))+')';circ(ctx,-12,0,2.6+Math.sin(t*25));}
  ctx.rotate(-u.ang);ctx.drawImage(sp.cv,sp.x0,sp.y0,sp.w,sp.h);drawEmissive(sp,sp.x0,sp.y0,sp.w,sp.h,.75);ctx.rotate(u.ang);
  if(u.type==='hauler'&&u.carry>0){ctx.fillStyle=u.carryType==='c'?'#f6c04a':'#b985ff';ctx.beginPath();ctx.moveTo(-8,-3.4);ctx.lineTo(-12.4,0);ctx.lineTo(-8,3.4);ctx.lineTo(-5.4,0);ctx.closePath();ctx.fill();ctx.strokeStyle=OUT;ctx.lineWidth=.8;ctx.stroke();}
  if(u.type==='hauler'&&u.order.t==='build'&&u.order.bld&&!u.order.bld.done&&rectDist(u.x,u.y,u.order.bld)<u.r+18){ctx.strokeStyle='#9fe8ff';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(12,0);ctx.lineTo(18+Math.sin(t*30)*2,Math.sin(t*20)*3);ctx.stroke();}
  if(u.flash>0){ctx.fillStyle='rgba(255,255,255,.45)';circ(ctx,0,0,d.r);}
  if(u.healFx>0){ctx.fillStyle='rgba(120,255,190,'+(u.healFx*.9)+')';circ(ctx,0,0,d.r+2);}
  ctx.restore();
  if(u.stunned>0){ctx.save();ctx.translate(u.x,u.y-d.r-(u.flying?24:8));ctx.fillStyle='#ffe66b';for(let i=0;i<3;i++){const a=t*6+i*2.1;circ(ctx,Math.cos(a)*7,Math.sin(a)*2.4,1.8);}ctx.restore();}
  if(d.heal&&u.healT>0&&u.healTarget&&!u.healTarget.dead){ctx.strokeStyle='rgba(125,255,200,.85)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(u.x,u.y);ctx.lineTo(u.healTarget.x,u.healTarget.y);ctx.stroke();ctx.strokeStyle='rgba(255,255,255,.7)';ctx.lineWidth=.8;ctx.stroke();}  if(u.ag)swDrawBadge(u,t);
}
function drawBars(){
  const showAll=!!ui.keys.alt;
  for(const u of G.units){
    if(u.dead||u.hidden||!onScreen(u.x,u.y,30)||!entVisible(u))continue;
    const sel=ui.selSet.has(u);if(!(sel||u.hp<u.maxhp||showAll||u.def.hero))continue;
    const d=u.def,w=Math.max(18,d.r*2+8),y=u.y-d.r-(u.flying?26:10);
    drawBar(u.x-w/2,y,w,u.hp/u.maxhp,u.team===2?'#ffd45a':u.team===1?'#ff6b6b':null,d.hero?4:3);
    if(d.hero){const H=G.teams[u.team].hero;ctx.fillStyle='rgba(0,0,0,.75)';ctx.beginPath();ctx.arc(u.x-w/2-6,y+2,6.5,0,TAU);ctx.fill();ctx.fillStyle='#ffe27a';ctx.font='bold 9px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(H.level,u.x-w/2-6,y+2.5);}
    else if(d.energy&&sel){drawBar(u.x-w/2,y+5,w,u.energy/100,'#6ab8ff',2);}
    if(d.hero&&sel){drawBar(u.x-w/2,y+6,w,u.mana/heroMaxMana(u),'#5aa9ff',2);}
  }
  for(const b of G.buildings){
    if(b.dead||!onScreen(b.x,b.y,b.r+30)||!entVisible(b))continue;
    const w=b.w*TILE,sel=ui.selSet.has(b);
    if(sel||b.hp<b.maxhp||showAll)drawBar(b.x-w/2,b.y-b.h*TILE/2-9,w,b.hp/b.maxhp,b.team===1?'#ff6b6b':null);
    if(!b.done)drawBar(b.x-w/2,b.y+b.h*TILE/2+4,w,b.prog,'#7cc4ff');
    else if(b.queue.length&&b.team===0){const q=b.queue[0];drawBar(b.x-w/2,b.y+b.h*TILE/2+4,w,q.t/q.total,q.k==='era'?'#ffe27a':'#f6c04a');}
  }
}
function drawProj(p,t){
  if(!onScreen(p.x,p.y,30))return;
  const ang=Math.atan2(p.ty-p.y,p.tx-p.x),pal=p.team<2?G.teams[p.team].pal:NEUTRAL_COL;
  ctx.save();ctx.translate(p.x,p.y);
  if(p.kind==='shell'){const pr=clamp(1-hyp(p.tx-p.x,p.ty-p.y)/p.total,0,1),h=Math.sin(pr*Math.PI)*58;
    ctx.fillStyle='rgba(0,0,0,.3)';circ(ctx,0,0,3.4);ctx.translate(0,-h);ctx.fillStyle='rgba(255,170,60,.35)';circ(ctx,0,0,7);ctx.fillStyle='#ffd27a';circ(ctx,0,0,3.6);ctx.fillStyle='#fff';circ(ctx,0,0,1.8);}
  else{ctx.rotate(ang);
    if(p.kind==='bullet'){ctx.strokeStyle='rgba(255,226,140,.35)';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-12,0);ctx.lineTo(3,0);ctx.stroke();ctx.strokeStyle='#fff3c0';ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(-9,0);ctx.lineTo(3,0);ctx.stroke();}
    else if(p.kind==='rocket'){ctx.fillStyle='#e8eef5';ctx.fillRect(-5,-1.6,9,3.2);ctx.fillStyle='#ff6a3d';ctx.fillRect(2.5,-1.6,2,3.2);ctx.fillStyle='rgba(255,170,60,.9)';circ(ctx,-7,0,2.8);ctx.fillStyle='rgba(255,220,120,.4)';circ(ctx,-9,0,5);}
    else if(p.kind==='acid'){ctx.fillStyle='rgba(180,255,80,.35)';circ(ctx,0,0,6);ctx.fillStyle='#caff5c';circ(ctx,0,0,3);ctx.fillStyle='#f6ffb8';circ(ctx,-1,-1,1.2);}
    else{ctx.strokeStyle=pal.glow;ctx.globalAlpha=.4;ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(-12,0);ctx.lineTo(4,0);ctx.stroke();ctx.globalAlpha=1;
      ctx.strokeStyle=pal.light;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-10,0);ctx.lineTo(4,0);ctx.stroke();ctx.strokeStyle='#fff';ctx.lineWidth=1.1;ctx.beginPath();ctx.moveTo(-6,0);ctx.lineTo(4,0);ctx.stroke();}}
  ctx.restore();
}
function drawFxUnder(t){
  for(const f of G.fx){
    if(f.kind==='ring'){const p=f.t/f.max,r=f.r*(0.3+0.7*p);ctx.strokeStyle=f.col;ctx.globalAlpha=(1-p)*.5;ctx.lineWidth=7*(1-p)+1;ctx.beginPath();ctx.arc(f.x,f.y,r,0,TAU);ctx.stroke();   // soft outer band
      ctx.globalAlpha=1-p;ctx.lineWidth=2.2;ctx.beginPath();ctx.arc(f.x,f.y,r,0,TAU);ctx.stroke();ctx.fillStyle=f.col;ctx.globalAlpha=(1-p)*.1;ctx.fill();ctx.globalAlpha=1;}
    else if(f.kind==='ping'){const p=f.t/f.max;ctx.strokeStyle=f.col;ctx.globalAlpha=(1-p)*.9;ctx.lineWidth=2;ctx.beginPath();ctx.arc(f.x,f.y,6+20*p,0,TAU);ctx.stroke();ctx.globalAlpha=1-p;ctx.lineWidth=1.4;ctx.beginPath();ctx.arc(f.x,f.y,3+8*p*p,0,TAU);ctx.stroke();ctx.fillStyle=f.col;ctx.globalAlpha=(1-p)*.25;circ(ctx,f.x,f.y,2.4);ctx.globalAlpha=1;}
    else if(f.kind==='levelup'){const p=f.t/f.max;ctx.strokeStyle='#ffe27a';ctx.globalAlpha=1-p;ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(f.x,f.y+4,f.r*(.3+.7*p),f.r*(.3+.7*p)*.6,0,0,TAU);ctx.stroke();
      const q=ctx.createLinearGradient(f.x,f.y-90*p-30,f.x,f.y);q.addColorStop(0,'rgba(255,230,120,0)');q.addColorStop(1,'rgba(255,230,120,.55)');ctx.fillStyle=q;ctx.fillRect(f.x-14,f.y-90*p-30,28,90*p+30);ctx.globalAlpha=1;}
  }
  for(const z of G.zones){
    if(z.type==='orbital'){const p=clamp(z.t/z.max,0,1);ctx.strokeStyle='rgba(255,80,60,'+(0.55+0.3*Math.sin(t*14))+')';ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(z.x,z.y,z.r,0,TAU);ctx.stroke();
      ctx.fillStyle='rgba(255,60,40,'+(0.05+0.12*p)+')';ctx.fill();ctx.beginPath();ctx.arc(z.x,z.y,z.r*(1-p*.85),0,TAU);ctx.strokeStyle='rgba(255,210,160,.8)';ctx.lineWidth=1.5;ctx.stroke();
      ctx.beginPath();ctx.moveTo(z.x-z.r,z.y);ctx.lineTo(z.x+z.r,z.y);ctx.moveTo(z.x,z.y-z.r);ctx.lineTo(z.x,z.y+z.r);ctx.strokeStyle='rgba(255,100,70,.35)';ctx.lineWidth=1;ctx.stroke();}
    else if(z.type==='sing'){const p=z.t/z.max;ctx.save();ctx.translate(z.x,z.y);ctx.rotate(t*3);
      for(let i=0;i<4;i++){ctx.strokeStyle='rgba(190,140,255,'+(0.5-0.1*i)+')';ctx.lineWidth=2.2;ctx.beginPath();for(let a=0;a<5.2;a+=.25){const r=z.r*(1-a/6)*(1-.15*i);ctx.lineTo(Math.cos(a+i*1.57)*r,Math.sin(a+i*1.57)*r);}ctx.stroke();}
      ctx.fillStyle=rgr(ctx,0,0,0,40,'rgba(20,0,40,.9)','rgba(120,60,200,0)');ctx.beginPath();ctx.arc(0,0,40,0,TAU);ctx.fill();ctx.restore();}
  }
}
function drawFxOver(t){
  for(const f of G.fx){
    if(f.kind==='flash'){const p=f.t/f.max,q=ctx.createRadialGradient(f.x,f.y,0,f.x,f.y,f.r*(0.5+p));q.addColorStop(0,'rgba(255,236,170,'+(0.95*(1-p))+')');q.addColorStop(.4,'rgba(255,150,60,'+(0.5*(1-p))+')');q.addColorStop(1,'rgba(255,100,40,0)');ctx.fillStyle=q;ctx.fillRect(f.x-f.r*2,f.y-f.r*2,f.r*4,f.r*4);}
    else if(f.kind==='beam'){const p=f.t/f.max;ctx.globalAlpha=1-p;const w=f.r*(0.55+0.4*p),q=ctx.createLinearGradient(f.x-w,0,f.x+w,0);q.addColorStop(0,'rgba(255,120,60,0)');q.addColorStop(.35,'rgba(255,230,190,.9)');q.addColorStop(.5,'#fff');q.addColorStop(.65,'rgba(255,230,190,.9)');q.addColorStop(1,'rgba(255,120,60,0)');ctx.fillStyle=q;ctx.fillRect(f.x-w,f.y-1400,w*2,1400);
      ctx.fillStyle=rgr(ctx,f.x,f.y,0,f.r*1.4,'rgba(255,240,200,.85)','rgba(255,120,40,0)');ctx.beginPath();ctx.arc(f.x,f.y,f.r*1.4,0,TAU);ctx.fill();ctx.globalAlpha=1;}
    else if(f.kind==='text'){const p=f.t/f.max;ctx.globalAlpha=1-p*p;ctx.font='bold 13px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=3;ctx.strokeStyle='rgba(0,0,0,.8)';ctx.strokeText(f.txt,f.x,f.y-p*26);ctx.fillStyle=f.col;ctx.fillText(f.txt,f.x,f.y-p*26);ctx.globalAlpha=1;}
  }
}
function drawOrders(){
  const own=ui.sel.filter(e=>e.kind==='unit'&&e.team===0).slice(0,30);
  const pt=o=>{switch(o.t){case'move':case'attackmove':case'cast':return{x:o.x,y:o.y};case'attack':case'repair':return o.target&&!o.target.dead?{x:o.target.x,y:o.target.y}:null;
    case'gather':return o.res&&!o.res.dead?{x:o.res.x,y:o.res.y}:null;case'build':return{x:(o.tx+BDEF[o.type].w/2)*TILE,y:(o.ty+BDEF[o.type].h/2)*TILE};case'trade':return o.post?{x:o.post.x,y:o.post.y}:null;
    case'garrison':return o.hub?{x:o.hub.x,y:o.hub.y}:null;}return null;};
  const colOf=o=>o.t==='attack'||o.t==='attackmove'?'rgba(255,110,90,.75)':o.t==='gather'||o.t==='trade'?'rgba(255,220,100,.7)':o.t==='build'||o.t==='repair'?'rgba(120,200,255,.75)':'rgba(120,255,170,.65)';
  ctx.lineWidth=1.2;ctx.setLineDash([5,5]);
  for(const u of own){let px=u.x,py=u.y;const list=[u.order].concat(u.oq);
    for(const o of list){const p=pt(o);if(!p)continue;ctx.strokeStyle=colOf(o);ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(p.x,p.y);ctx.stroke();ctx.fillStyle=colOf(o);ctx.setLineDash([]);circ(ctx,p.x,p.y,2.6);ctx.setLineDash([5,5]);px=p.x;py=p.y;}}
  ctx.setLineDash([]);
  for(const e of ui.sel){if(e.kind==='building'&&e.team===0&&e.rally){ctx.strokeStyle='rgba(124,255,176,.6)';ctx.lineWidth=1.5;ctx.setLineDash([6,6]);ctx.beginPath();ctx.moveTo(e.x,e.y);ctx.lineTo(e.rally.x,e.rally.y);ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle='#7cffb0';circ(ctx,e.rally.x,e.rally.y,4);line(ctx,e.rally.x,e.rally.y,e.rally.x,e.rally.y-14,'#7cffb0',1.5);poly(ctx,[e.rally.x,e.rally.y-14,e.rally.x+9,e.rally.y-11,e.rally.x,e.rally.y-8],'#7cffb0');}}
  const hero=ui.sel.length===1&&ui.sel[0].def&&ui.sel[0].def.hero&&ui.sel[0].team===0?ui.sel[0]:null;
  if(hero&&G.teams[0].hero.sk[0]>0){ctx.strokeStyle='rgba(255,255,255,.18)';ctx.lineWidth=1.5;ctx.setLineDash([3,7]);ctx.beginPath();ctx.arc(hero.x,hero.y,300,0,TAU);ctx.stroke();ctx.setLineDash([]);}
}
function tileOKFor(id,tx,ty,h0){
  if(tx<2||ty<2||tx>=MW-2||ty>=MH-2)return false;const i=ty*MW+tx;
  return !G.blocked[i]&&!G.RAMP[i]&&G.H[i]===h0&&G.vis[0][i]!==0;
}
function drawGhost(t){
  const p=ui.place;if(!p)return;const d=BDEF[p.id],f=G.teams[0].faction,sp=buildingSprite(p.id,f);
  if(d.onGeyser){for(const r of G.res){if(r.type==='geyser'&&!r.dead&&!r.siphon&&G.vis[0][r.ty*MW+r.tx]>0){ctx.strokeStyle='rgba(210,160,255,.85)';ctx.lineWidth=2;ctx.setLineDash([6,5]);ctx.strokeRect(r.tx*TILE,r.ty*TILE,TILE*2,TILE*2);ctx.setLineDash([]);}}}
  const cx=(p.tx+d.w/2)*TILE,cy=(p.ty+d.h/2)*TILE;
  ctx.save();ctx.translate(cx,cy);ctx.globalAlpha=p.ok?0.78:0.45;ctx.drawImage(sp.cv,sp.x0,sp.y0,sp.w,sp.h);ctx.restore();
  const h0=G.H[clamp(p.ty,0,MH-1)*MW+clamp(p.tx,0,MW-1)];
  for(let y=0;y<d.h;y++)for(let x=0;x<d.w;x++){const ok=d.onGeyser?p.ok:tileOKFor(p.id,p.tx+x,p.ty+y,h0);ctx.fillStyle=ok?'rgba(80,255,140,.26)':'rgba(255,70,70,.38)';ctx.fillRect((p.tx+x)*TILE,(p.ty+y)*TILE,TILE-1,TILE-1);}
  ctx.strokeStyle=p.ok?'#5dff9a':'#ff5d5d';ctx.lineWidth=2;ctx.strokeRect(p.tx*TILE,p.ty*TILE,d.w*TILE,d.h*TILE);
  if(d.detect||d.range){const rg=d.range||d.detect;ctx.strokeStyle='rgba(255,255,255,.28)';ctx.setLineDash([4,6]);ctx.beginPath();ctx.arc(cx,cy,rg,0,TAU);ctx.stroke();ctx.setLineDash([]);}
  if(!p.ok&&p.why){ctx.font='bold 12px system-ui';ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.lineWidth=3;ctx.strokeStyle='rgba(0,0,0,.8)';ctx.strokeText(p.why,p.tx*TILE,p.ty*TILE-6);ctx.fillStyle='#ffb0b0';ctx.fillText(p.why,p.tx*TILE,p.ty*TILE-6);}
}
function drawTargeting(t){
  const tg=ui.target;if(!tg)return;
  const w=s2w(ui.mx,ui.my);
  if(tg.kind.startsWith('skill')){const hero=heroUnit(0),i=+tg.kind.slice(5),s=hero&&skillOf(hero,i);if(!s)return;
    ctx.strokeStyle='rgba(255,255,255,.3)';ctx.setLineDash([6,6]);ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(hero.x,hero.y,s.range,0,TAU);ctx.stroke();ctx.setLineDash([]);
    const inR=hyp(hero.x-w.x,hero.y-w.y)<=s.range;ctx.strokeStyle=inR?'rgba(255,150,100,.95)':'rgba(255,150,100,.45)';ctx.fillStyle='rgba(255,100,60,.12)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(w.x,w.y,s.radius,0,TAU);ctx.fill();ctx.stroke();}
}

/* -------------------------------- world ------------------------------- */
function render(t,dt){
  ctx.setTransform(DPR,0,0,DPR,0,0);ctx.fillStyle='#04060b';ctx.fillRect(0,0,VW,VH);
  if(!G||!G.terrainCv)return;
  bakeMs=0;applyDecals();lightFrame();
  const z=cam.z;let sx=0,sy=0;
  if(G.shake>0&&SET.shake&&!SET.rm&&!ui.demo){sx=(Math.random()-.5)*G.shake;sy=(Math.random()-.5)*G.shake;}
  const tx=-(cam.x+sx)*z*DPR,ty=-(cam.y+sy)*z*DPR;
  ctx.setTransform(DPR*z,0,0,DPR*z,Math.round(tx),Math.round(ty));
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='low';   // terrain + fog are large, changing textures: cheap bilinear
  const vx0=Math.max(0,cam.x),vy0=Math.max(0,cam.y),vx1=Math.min(WW,cam.x+VW/z+2),vy1=Math.min(WH,cam.y+VH/z+2);
  if(vx1>vx0&&vy1>vy0){const x0=Math.floor(vx0),y0=Math.floor(vy0),w=Math.ceil(vx1)-x0,h=Math.ceil(vy1)-y0;ctx.drawImage(G.terrainCv,x0,y0,w,h,x0,y0,w,h);drawTerrainTiles(ctx,vx0,vy0,vx1,vy1);}
  ctx.imageSmoothingQuality=Q.smooth;   // sprites are small and static, baked at SC x: mip-mapped downsampling removes shimmer
  // resources and neutral structures
  for(const r of G.res){if(r.dead||!onScreen(r.x,r.y,50))continue;if(!ui.demo&&G.vis[0][clamp(r.ty,0,MH-1)*MW+clamp(r.tx,0,MW-1)]===0)continue;
    if(r.type==='crystal')drawCrystal(ctx,r,t);else drawGeyser(ctx,r,t);
    if(ui.selSet.has(r)||ui.hover===r){ctx.strokeStyle=ui.selSet.has(r)?'#ffe28a':'rgba(255,226,138,.55)';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(r.x,r.y+4,r.w*TILE*.62,r.w*TILE*.45,0,0,TAU);ctx.stroke();}}
  for(const n of G.neutrals){if(!onScreen(n.x,n.y,60))continue;if(!ui.demo&&G.vis[0][(n.ty)*MW+n.tx]===0)continue;
    const sp=neutralSprite(n.type);ctx.save();ctx.translate(n.x,n.y);if(Q.shd>0)drawBuildingShadow(sp,64,64);else{ctx.fillStyle='rgba(0,0,0,.3)';rrp(ctx,-26,-20,60,60,10);ctx.fill();}ctx.drawImage(sp.cv,sp.x0,sp.y0,sp.w,sp.h);drawEmissive(sp,sp.x0,sp.y0,sp.w,sp.h,.7);ctx.save();ctx.translate(0,-sp.hz*K3*.8);drawNeutralLive(ctx,n,t);ctx.restore();
    if(ui.selSet.has(n)||ui.hover===n){ctx.strokeStyle=ui.selSet.has(n)?'#ffe28a':'rgba(255,226,138,.55)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,36,0,TAU);ctx.stroke();}ctx.restore();}
  drawPools(t);drawFxUnder(t);drawOrders();swDrawWorld(t);
  const gu=[],au=[];   // buildings and ground units share one depth sort (key = the foot line, so a tall building hides what stands behind it and is overlapped by what stands in front)
  for(const b of G.buildings)if(!b.dead&&entVisible(b))gu.push(b);
  for(const u of G.units){if(u.dead||u.hidden||!onScreen(u.x,u.y,50)||!entVisible(u))continue;(u.flying?au:gu).push(u);}
  gu.sort((a,b)=>(a.kind==='building'?a.y+a.h*TILE*.5:a.y)-(b.kind==='building'?b.y+b.h*TILE*.5:b.y));for(const e of gu)e.kind==='building'?drawBuilding(e,t):drawUnit(e,t);
  for(const p of G.parts){if(p.kind!==2||!onScreen(p.x,p.y,20))continue;const a=p.life/p.max;ctx.fillStyle='rgba(60,64,72,'+(0.42*a)+')';circ(ctx,p.x,p.y,p.size*(1.6-a*0.6));}
  for(const p of G.proj)drawProj(p,t);
  for(const p of G.parts){if(p.kind===2||!onScreen(p.x,p.y,20))continue;const a=p.life/p.max;
    if(p.kind===3){ctx.fillStyle=p.col;ctx.globalAlpha=Math.min(1,a);circ(ctx,p.x,p.y,p.size*.7);}
    else{ctx.globalAlpha=Math.min(1,a*1.6);ctx.fillStyle=p.col;circ(ctx,p.x,p.y,p.size*(0.4+a*0.6));}ctx.globalAlpha=1;}
  drawFxOver(t);
  if(Q.fx>=2){if(!G.paused&&!SET.rm&&dt>0)fxEmit(dt,t);ptStep(Math.min(dt||0,.05));ptDraw();}
  au.sort((a,b)=>a.y-b.y);for(const u of au)drawUnit(u,t);
  if(Q.fx>=2)drawGlows(t);
  bakeIdle();
  ctx.imageSmoothingQuality='low';
  if(!ui.demo&&fogCv){ctx.imageSmoothingEnabled=true;ctx.drawImage(fogCv,0,0,MW*FQ,MH*FQ,0,0,WW,WH);}
  drawBars();
  if(!ui.demo)drawGhost(t);
  drawTargeting(t);
  if(G.daylight<0.985)drawLighting(t);
  if(Q.bloom>0&&!ui.demo)drawBloom();
  ctx.setTransform(DPR,0,0,DPR,0,0);
  if(!ui.demo){if(Q.fx>=1)drawGrade();if(Q.fx>=2&&!SET.rm)drawMotes(dt);}
  if(ui.touchMode)touchOverlay(ctx);
  // drag box
  if(ui.drag&&(Math.abs(ui.drag.x1-ui.drag.x0)>4||Math.abs(ui.drag.y1-ui.drag.y0)>4)){
    const x=Math.min(ui.drag.x0,ui.drag.x1),y=Math.min(ui.drag.y0,ui.drag.y1),w=Math.abs(ui.drag.x1-ui.drag.x0),h=Math.abs(ui.drag.y1-ui.drag.y0);
    ctx.fillStyle='rgba(110,255,160,.10)';ctx.fillRect(x,y,w,h);ctx.strokeStyle='#6dff9d';ctx.lineWidth=1;ctx.strokeRect(x+.5,y+.5,w,h);}
  if(ui.target&&!ui.target.kind.startsWith('skill')){const lbl={attack:'Attack-move',move:'Move',rally:'Set rally point',repair:'Repair',trade:'Trade route: click a Trading Post'}[ui.target.kind]||swTargetLabel(ui.target.kind)||'Target';
    ctx.font='12px system-ui';ctx.textAlign='left';ctx.fillStyle='rgba(255,255,255,.92)';ctx.lineWidth=3;ctx.strokeStyle='rgba(0,0,0,.7)';ctx.strokeText(lbl+' — click, right-click cancels',ui.mx+16,ui.my-10);ctx.fillText(lbl+' — click, right-click cancels',ui.mx+16,ui.my-10);}
  if(ui.demo){ /* cinematic vignette */
    const q=ctx.createRadialGradient(VW/2,VH/2,VH*.35,VW/2,VH/2,VH*.95);q.addColorStop(0,'rgba(0,0,0,0)');q.addColorStop(1,'rgba(0,0,0,.55)');ctx.fillStyle=q;ctx.fillRect(0,0,VW,VH);}
}

/* ------------------------------- minimap ------------------------------ */
function drawMinimap(){
  if(!G||!G.mmBg||!mmCtx)return;
  const S=MM,k=S/WW,g=mmCtx,sc=mm.width/MM;
  g.setTransform(sc,0,0,sc,0,0);g.clearRect(0,0,S,S);g.drawImage(G.mmBg,0,0,S,S);
  g.fillStyle='rgba(6,10,20,.28)';g.fillRect(0,0,S,S);
  const vs=ui.demo?null:G.vis[0];
  for(const r of G.res){if(r.dead||(vs&&vs[r.ty*MW+r.tx]===0))continue;g.fillStyle=r.type==='crystal'?'#f6c04a':'#b985ff';g.fillRect(r.x*k-1,r.y*k-1,r.type==='crystal'?2.4:3.4,r.type==='crystal'?2.4:3.4);}
  for(const n of G.neutrals){if(vs&&vs[n.ty*MW+n.tx]===0)continue;const c=n.ctrl>=0?G.teams[n.ctrl].pal.base:(n.type==='post'?'#e8b53a':'#bba8ff');
    g.fillStyle=c;g.strokeStyle='#000';g.lineWidth=1;g.beginPath();if(n.type==='tower'){g.moveTo(n.x*k,n.y*k-4);g.lineTo(n.x*k+4,n.y*k);g.lineTo(n.x*k,n.y*k+4);g.lineTo(n.x*k-4,n.y*k);g.closePath();}else g.arc(n.x*k,n.y*k,3.4,0,TAU);g.fill();g.stroke();}
  for(const cp of G.camps){const tile=clamp(cp.y/TILE|0,0,MH-1)*MW+clamp(cp.x/TILE|0,0,MW-1);if(vs&&vs[tile]===0)continue;
    const alive=vs&&vs[tile]===2?cp.units.some(id=>{const u=G.units.find(z=>z.id===id);return u&&!u.dead;}):cp.seenAlive;if(vs&&vs[tile]===2)cp.seenAlive=alive;if(!ui.demo&&!alive)continue;
    g.fillStyle='rgba(255,120,60,.9)';g.beginPath();g.arc(cp.x*k,cp.y*k,3,0,TAU);g.fill();g.strokeStyle='#000';g.lineWidth=.8;g.stroke();}
  for(const b of G.buildings){if(b.dead||(b.team===1&&!ui.demo&&!b.seen0))continue;g.fillStyle=G.teams[b.team].pal.base;g.fillRect(b.tx*TILE*k,b.ty*TILE*k,Math.max(3,b.w*TILE*k),Math.max(3,b.h*TILE*k));
    g.strokeStyle='rgba(0,0,0,.8)';g.lineWidth=.7;g.strokeRect(b.tx*TILE*k,b.ty*TILE*k,Math.max(3,b.w*TILE*k),Math.max(3,b.h*TILE*k));}
  for(const u of G.units){if(u.dead||u.hidden||(u.team!==0&&!ui.demo&&!seen(0,u)))continue;if(u.team===2&&!ui.demo)continue;
    const bs=u.def.supply>=3||u.def.hero?3.8:2.6;g.fillStyle='rgba(2,6,14,.85)';g.fillRect(u.x*k-bs/2-.8,u.y*k-bs/2-.8,bs+1.6,bs+1.6);
    g.fillStyle=u.team===2?'#ff9a5a':G.teams[u.team].pal.light;g.fillRect(u.x*k-bs/2,u.y*k-bs/2,bs,bs);}
  if(!ui.demo&&fogCv){g.imageSmoothingEnabled=true;g.drawImage(fogCv,0,0,S,S);}
  for(const p of ui.pings){const a=(G.time-p.t),pr=a/p.dur;if(pr>1)continue;g.strokeStyle=p.col.replace('A',String(1-pr));g.lineWidth=2;g.beginPath();g.arc(p.x*k,p.y*k,3+pr*18,0,TAU);g.stroke();}
  const fx0=cam.x*k+.5,fy0=cam.y*k+.5,fw=VW/cam.z*k,fh=(VH-BOTTOM)/cam.z*k;
  g.strokeStyle='rgba(0,0,0,.65)';g.lineWidth=3;g.strokeRect(fx0,fy0,fw,fh);g.strokeStyle='#fff';g.lineWidth=1.2;g.strokeRect(fx0,fy0,fw,fh);
  g.strokeStyle='rgba(255,255,255,.9)';g.lineWidth=2;g.beginPath();for(const[sx,sy]of[[0,0],[1,0],[0,1],[1,1]]){const x=fx0+sx*fw,y=fy0+sy*fh,dx=sx?-4:4,dy=sy?-4:4;g.moveTo(x+dx,y);g.lineTo(x,y);g.lineTo(x,y+dy);}g.stroke();
}
