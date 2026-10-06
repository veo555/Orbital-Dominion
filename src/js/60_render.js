/* =========================================================================
   RENDERING — camera with zoom, layered world pass, smooth fog, night lighting,
   selection / order overlays and the minimap
   ========================================================================= */
let cv=null,ctx=null,mm=null,mmCtx=null,VW=1280,VH=720,DPR=1;
const cam={x:0,y:0,z:1,tz:1};
const FQ=4; // fog sub-resolution per tile
let fogCv=null,fogCtx=null,fogImg=null,fogA=null,fogAcc=0,lightCv=null,lightCtx=null;

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
function resizeView(){
  DPR=Math.min(2,window.devicePixelRatio||1);VW=window.innerWidth;VH=window.innerHeight;
  cv.width=Math.floor(VW*DPR);cv.height=Math.floor(VH*DPR);
  if(G)clampCam();
}

/* ------------------------------- fog ---------------------------------- */
function initFog(){
  fogCv=mkCanvas(MW*FQ,MH*FQ);fogCtx=fogCv.getContext('2d');fogImg=fogCtx.createImageData(MW*FQ,MH*FQ);
  fogA=new Float32Array(NN).fill(0.97);fogAcc=1;
}
function updateFog(dt,force){
  if(!G||!fogA)return;
  const v=G.vis[0];let changed=false;
  const k=Math.min(1,dt*7);
  for(let i=0;i<NN;i++){const s=v[i],tg=ui.demo?0:(s===2?0:s===1?0.5:0.97),d=tg-fogA[i];if(d>0.004||d<-0.004){fogA[i]+=d*k;changed=true;}else if(d!==0){fogA[i]=tg;}}
  fogAcc+=dt;
  if(!(changed||force)||fogAcc<0.05)return;
  fogAcc=0;const W=MW*FQ,data=fogImg.data;
  for(let py=0;py<MH*FQ;py++){
    const fy=(py+.5)/FQ-.5,y0=Math.floor(fy),ty=fy-y0,y1=Math.min(MH-1,y0+1),yy0=Math.max(0,y0);const sy=ty*ty*(3-2*ty);
    for(let px=0;px<W;px++){
      const fx=(px+.5)/FQ-.5,x0=Math.floor(fx),tx=fx-x0,x1=Math.min(MW-1,x0+1),xx0=Math.max(0,x0),sx=tx*tx*(3-2*tx);
      const a=fogA[yy0*MW+xx0],b=fogA[yy0*MW+x1],c=fogA[y1*MW+xx0],dd=fogA[y1*MW+x1];
      const val=(a+(b-a)*sx)*(1-sy)+(c+(dd-c)*sx)*sy,o=(py*W+px)*4;
      data[o]=5;data[o+1]=8;data[o+2]=18;data[o+3]=val*255;}}
  fogCtx.putImageData(fogImg,0,0);
}

/* ---------------------------- unit / building draw -------------------- */
function drawBar(x,y,w,frac,col,h){
  h=h||3;ctx.fillStyle='rgba(0,0,0,.72)';ctx.fillRect(x-1,y-1,w+2,h+2);
  ctx.fillStyle=col||(frac>0.5?'#58e68b':frac>0.25?'#f0c040':'#ff5d5d');ctx.fillRect(x,y,w*clamp(frac,0,1),h);
  ctx.fillStyle='rgba(255,255,255,.18)';ctx.fillRect(x,y,w*clamp(frac,0,1),h/2);
}
function selCol(e){return e.team===0?'#6dff9d':e.team===1?'#ff6b6b':'#ffd45a';}
function drawBuilding(b,t){
  if(!onScreen(b.x,b.y,b.r+40))return;
  const f=G.teams[b.team].faction,col=G.teams[b.team].pal,w=b.w*TILE,h=b.h*TILE,sp=buildingSprite(b.type,f),sel=ui.selSet.has(b),vis=b.team===0||ui.demo||seen(0,b);
  ctx.save();ctx.translate(b.x,b.y);
  ctx.fillStyle='rgba(0,0,0,.30)';rrp(ctx,-w/2+6,-h/2+9,w,h,8);ctx.fill();
  if(!b.done){
    ctx.globalAlpha=0.38;ctx.drawImage(sp.cv,-w/2,-h/2,w,h);ctx.globalAlpha=1;
    ctx.save();ctx.beginPath();ctx.rect(-w/2-2,h/2-h*b.prog,w+4,h*b.prog+2);ctx.clip();ctx.drawImage(sp.cv,-w/2,-h/2,w,h);ctx.restore();
    ctx.strokeStyle='rgba(255,214,110,.75)';ctx.lineWidth=1.6;ctx.setLineDash([6,5]);ctx.strokeRect(-w/2+2,-h/2+2,w-4,h-4);ctx.setLineDash([]);
    ctx.strokeStyle='rgba(255,214,110,.35)';ctx.lineWidth=1;for(let i=1;i<4;i++){ctx.beginPath();ctx.moveTo(-w/2+2,-h/2+i*h/4);ctx.lineTo(w/2-2,-h/2+i*h/4);ctx.stroke();}
    ctx.strokeStyle='rgba(255,170,60,.85)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-w/2,h/2-h*b.prog);ctx.lineTo(w/2,h/2-h*b.prog);ctx.stroke();
  }else{
    ctx.drawImage(sp.cv,-w/2,-h/2,w,h);drawBuildingLive(ctx,b,t,col,f);
    const dmg=1-b.hp/b.maxhp;
    if(dmg>0.35){ctx.fillStyle='rgba(10,6,4,'+(0.12+0.3*(dmg-0.35)/0.65)+')';rrp(ctx,-w/2+3,-h/2+3,w-6,h-6,6);ctx.fill();
      ctx.strokeStyle='rgba(0,0,0,.55)';ctx.lineWidth=1.4;ctx.beginPath();const sd=b.id*7;for(let i=0;i<3+Math.floor(dmg*4);i++){const x=Math.sin(sd+i*2.3)*w*.36,y=Math.cos(sd*1.3+i*1.9)*h*.36;ctx.moveTo(x,y);ctx.lineTo(x+Math.sin(i*4+sd)*9,y+Math.cos(i*3+sd)*9);ctx.lineTo(x+Math.sin(i*5+sd)*14,y+Math.cos(i*2+sd)*14);}ctx.stroke();}
  }
  if(b.dmgFlash>0){ctx.fillStyle='rgba(255,255,255,'+(b.dmgFlash*1.6)+')';rrp(ctx,-w/2+2,-h/2+2,w-4,h-4,7);ctx.fill();}
  if(!vis){ctx.fillStyle='rgba(6,10,20,.25)';rrp(ctx,-w/2,-h/2,w,h,7);ctx.fill();}
  if(sel||ui.hover===b){ctx.strokeStyle=selCol(b);ctx.lineWidth=sel?2.2:1.2;ctx.globalAlpha=sel?1:.6;const k=12;
    for(const sx of[-1,1])for(const sy of[-1,1]){const x=sx*(w/2+3),y=sy*(h/2+3);ctx.beginPath();ctx.moveTo(x-sx*k,y);ctx.lineTo(x,y);ctx.lineTo(x,y-sy*k);ctx.stroke();}ctx.globalAlpha=1;}
  ctx.restore();
}
function drawUnit(u,t){
  const d=u.def,f=u.team===2?'neutral':G.teams[u.team].faction,sp=unitSprite(u.type,f),pal=u.team===2?NEUTRAL_COL:G.teams[u.team].pal,sel=ui.selSet.has(u);
  ctx.save();ctx.translate(u.x,u.y);
  if(u.cloaked)ctx.globalAlpha=(u.team===0||ui.demo)?0.4+0.12*Math.sin(t*5+u.id):0.55;
  if(u.flying){ctx.fillStyle='rgba(0,0,0,.26)';ctx.beginPath();ctx.ellipse(7,22,d.r*.95,d.r*.5,0,0,TAU);ctx.fill();}
  else{ctx.fillStyle='rgba(0,0,0,.30)';ctx.beginPath();ctx.ellipse(1.5,3.5,d.r*1.0,d.r*.62,0,0,TAU);ctx.fill();}
  if(d.hero){ctx.strokeStyle=pal.glow;ctx.globalAlpha=(ctx.globalAlpha||1)*(.45+.2*Math.sin(t*3));ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,3,d.r+7,d.r*.62+6,0,0,TAU);ctx.stroke();ctx.globalAlpha=u.cloaked?.42:1;}
  if(sel||ui.hover===u){ctx.strokeStyle=selCol(u);ctx.lineWidth=sel?1.8:1.1;ctx.globalAlpha=sel?1:.6;ctx.beginPath();ctx.ellipse(0,3,d.r+4,d.r*.7+3,0,0,TAU);ctx.stroke();ctx.globalAlpha=u.cloaked?.42:1;}
  if(u.flying)ctx.translate(0,-16+Math.sin(t*3+u.id)*1.6);
  if(hasBuff(u,'rampage')){ctx.fillStyle='rgba(255,60,40,.22)';circ(ctx,0,0,d.r+8);}
  if(hasBuff(u,'stim')){ctx.fillStyle='rgba(120,255,190,.2)';circ(ctx,0,0,d.r+6);}
  ctx.rotate(u.ang);
  if(d.siege&&(u.sieged||u.siegeT>0)){const k=u.sieged?Math.min(1,1-u.siegeT/1.6):Math.max(0,u.siegeT/1.2);
    ctx.fillStyle='#232c3a';ctx.strokeStyle=OUT;ctx.lineWidth=1;for(const sx of[-1,1])for(const sy of[-1,1]){ctx.beginPath();ctx.rect(sx*(9+8*k)-4,sy*(10+6*k)-3,8,6);ctx.fill();ctx.stroke();}}
  if(u.type==='skiff'){ctx.fillStyle='rgba(255,170,60,'+(0.55+0.3*Math.sin(t*30+u.id))+')';circ(ctx,-12,0,2.6+Math.sin(t*25));}
  ctx.drawImage(sp.cv,-sp.S/2,-sp.S/2,sp.S,sp.S);
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
    if(f.kind==='ring'){const p=f.t/f.max;ctx.strokeStyle=f.col;ctx.globalAlpha=1-p;ctx.lineWidth=3;ctx.beginPath();ctx.arc(f.x,f.y,f.r*(0.3+0.7*p),0,TAU);ctx.stroke();ctx.fillStyle=f.col;ctx.globalAlpha=(1-p)*.08;ctx.fill();ctx.globalAlpha=1;}
    else if(f.kind==='ping'){const p=f.t/f.max;ctx.strokeStyle=f.col;ctx.globalAlpha=1-p;ctx.lineWidth=2;ctx.beginPath();ctx.arc(f.x,f.y,6+18*p,0,TAU);ctx.stroke();ctx.beginPath();ctx.arc(f.x,f.y,3,0,TAU);ctx.stroke();ctx.globalAlpha=1;}
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
  ctx.save();ctx.translate(cx,cy);ctx.globalAlpha=p.ok?0.78:0.45;ctx.drawImage(sp.cv,-d.w*TILE/2,-d.h*TILE/2,d.w*TILE,d.h*TILE);ctx.restore();
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

/* ------------------------------- night -------------------------------- */
function drawNight(t){
  const nd=1-G.daylight;if(nd<0.04)return;
  const LQ=5,lw=Math.ceil(VW/LQ),lh=Math.ceil(VH/LQ);
  if(!lightCv||lightCv.width!==lw||lightCv.height!==lh){lightCv=mkCanvas(lw,lh);lightCtx=lightCv.getContext('2d');}
  const g=lightCtx,k=cam.z/LQ,warm=clamp((G.daylight-0.1)/0.5,0,1);
  g.globalCompositeOperation='source-over';
  const r=Math.round(lerp(10,60,warm)),gr=Math.round(lerp(16,34,warm)),b=Math.round(lerp(46,40,warm)),a=0.18+0.5*Math.pow(nd,1.1);
  g.fillStyle='rgba('+r+','+gr+','+b+','+a+')';g.clearRect(0,0,lw,lh);g.fillRect(0,0,lw,lh);
  g.globalCompositeOperation='destination-out';
  const hole=(x,y,rad,al)=>{const sx=(x-cam.x)*k,sy=(y-cam.y)*k,sr=rad*k;if(sx<-sr||sy<-sr||sx>lw+sr||sy>lh+sr)return;
    const q=g.createRadialGradient(sx,sy,0,sx,sy,sr);q.addColorStop(0,'rgba(0,0,0,'+al+')');q.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=q;g.fillRect(sx-sr,sy-sr,sr*2,sr*2);};
  let n=0;
  for(const bd of G.buildings){if(bd.dead||!bd.done||!entVisible(bd))continue;
    const rad=bd.type==='hub'?230:bd.type==='turret'?150:bd.type==='generator'?110:bd.w>=3?130:90;hole(bd.x,bd.y,rad,0.85);}
  for(const nt of G.neutrals)if(nt.type==='tower')hole(nt.x,nt.y,nt.ctrl>=0?170:90,0.7);
  for(const u of G.units){if(u.dead||u.hidden||u.team>1||!onScreen(u.x,u.y,100)||!entVisible(u))continue;
    if(u.def.hero)hole(u.x,u.y,150,0.85);else if(n<70){hole(u.x,u.y,u.def.supply>=3?80:55,0.55);n++;}}
  for(const f of G.fx)if(f.kind==='flash')hole(f.x,f.y,f.r*3.2,0.8*(1-f.t/f.max));
  for(const p of G.proj)hole(p.x,p.y,45,0.6);
  g.globalCompositeOperation='source-over';
  ctx.imageSmoothingEnabled=true;ctx.setTransform(DPR,0,0,DPR,0,0);ctx.drawImage(lightCv,0,0,VW,VH);
  // warm additive glows
  ctx.setTransform(DPR*cam.z,0,0,DPR*cam.z,-cam.x*cam.z*DPR,-cam.y*cam.z*DPR);ctx.globalCompositeOperation='lighter';
  for(const bd of G.buildings){if(bd.dead||!bd.done||!entVisible(bd)||!onScreen(bd.x,bd.y,160))continue;
    const pal=G.teams[bd.team].pal,rad=bd.type==='hub'?120:bd.w>=3?80:55;const q=ctx.createRadialGradient(bd.x,bd.y,0,bd.x,bd.y,rad);q.addColorStop(0,'rgba(255,230,170,'+(0.17*nd)+')');q.addColorStop(1,'rgba(255,200,120,0)');ctx.fillStyle=q;ctx.fillRect(bd.x-rad,bd.y-rad,rad*2,rad*2);}
  ctx.globalCompositeOperation='source-over';
}

/* -------------------------------- world ------------------------------- */
function render(t,dt){
  ctx.setTransform(DPR,0,0,DPR,0,0);ctx.fillStyle='#04060b';ctx.fillRect(0,0,VW,VH);
  if(!G||!G.terrainCv)return;
  applyDecals();
  const z=cam.z;let sx=0,sy=0;
  if(G.shake>0&&SET.shake&&!ui.demo){sx=(Math.random()-.5)*G.shake;sy=(Math.random()-.5)*G.shake;}
  const tx=-(cam.x+sx)*z*DPR,ty=-(cam.y+sy)*z*DPR;
  ctx.setTransform(DPR*z,0,0,DPR*z,Math.round(tx),Math.round(ty));
  ctx.imageSmoothingEnabled=true;
  const vx0=Math.max(0,cam.x),vy0=Math.max(0,cam.y),vx1=Math.min(WW,cam.x+VW/z+2),vy1=Math.min(WH,cam.y+VH/z+2);
  if(vx1>vx0&&vy1>vy0){const x0=Math.floor(vx0),y0=Math.floor(vy0),w=Math.ceil(vx1)-x0,h=Math.ceil(vy1)-y0;ctx.drawImage(G.terrainCv,x0,y0,w,h,x0,y0,w,h);}
  // resources and neutral structures
  for(const r of G.res){if(r.dead||!onScreen(r.x,r.y,50))continue;if(!ui.demo&&G.vis[0][clamp(r.ty,0,MH-1)*MW+clamp(r.tx,0,MW-1)]===0)continue;
    if(r.type==='crystal')drawCrystal(ctx,r,t);else drawGeyser(ctx,r,t);
    if(ui.selSet.has(r)||ui.hover===r){ctx.strokeStyle=ui.selSet.has(r)?'#ffe28a':'rgba(255,226,138,.55)';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(r.x,r.y+4,r.w*TILE*.62,r.w*TILE*.45,0,0,TAU);ctx.stroke();}}
  for(const n of G.neutrals){if(!onScreen(n.x,n.y,60))continue;if(!ui.demo&&G.vis[0][(n.ty)*MW+n.tx]===0)continue;
    const sp=neutralSprite(n.type);ctx.save();ctx.translate(n.x,n.y);ctx.fillStyle='rgba(0,0,0,.3)';rrp(ctx,-26,-20,60,60,10);ctx.fill();ctx.drawImage(sp.cv,-32,-32,64,64);drawNeutralLive(ctx,n,t);
    if(ui.selSet.has(n)||ui.hover===n){ctx.strokeStyle=ui.selSet.has(n)?'#ffe28a':'rgba(255,226,138,.55)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,36,0,TAU);ctx.stroke();}ctx.restore();}
  drawFxUnder(t);drawOrders();swDrawWorld(t);
  const bl=[];for(const b of G.buildings)if(!b.dead&&entVisible(b))bl.push(b);bl.sort((a,b)=>a.y-b.y);for(const b of bl)drawBuilding(b,t);
  const gu=[],au=[];
  for(const u of G.units){if(u.dead||u.hidden||!onScreen(u.x,u.y,50)||!entVisible(u))continue;(u.flying?au:gu).push(u);}
  gu.sort((a,b)=>a.y-b.y);for(const u of gu)drawUnit(u,t);
  for(const p of G.parts){if(p.kind!==2||!onScreen(p.x,p.y,20))continue;const a=p.life/p.max;ctx.fillStyle='rgba(60,64,72,'+(0.42*a)+')';circ(ctx,p.x,p.y,p.size*(1.6-a*0.6));}
  for(const p of G.proj)drawProj(p,t);
  for(const p of G.parts){if(p.kind===2||!onScreen(p.x,p.y,20))continue;const a=p.life/p.max;
    if(p.kind===3){ctx.fillStyle=p.col;ctx.globalAlpha=Math.min(1,a);circ(ctx,p.x,p.y,p.size*.7);}
    else{ctx.globalAlpha=Math.min(1,a*1.6);ctx.fillStyle=p.col;circ(ctx,p.x,p.y,p.size*(0.4+a*0.6));}ctx.globalAlpha=1;}
  drawFxOver(t);
  au.sort((a,b)=>a.y-b.y);for(const u of au)drawUnit(u,t);
  if(!ui.demo&&fogCv){ctx.imageSmoothingEnabled=true;ctx.drawImage(fogCv,0,0,MW*FQ,MH*FQ,0,0,WW,WH);}
  drawBars();
  if(!ui.demo)drawGhost(t);
  drawTargeting(t);
  if(G.daylight<0.98)drawNight(t);
  ctx.setTransform(DPR,0,0,DPR,0,0);
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
  const S=MM,k=S/WW,g=mmCtx;
  g.clearRect(0,0,S,S);g.drawImage(G.mmBg,0,0);
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
    g.fillStyle=u.team===2?'#ff9a5a':G.teams[u.team].pal.light;g.fillRect(u.x*k-1.3,u.y*k-1.3,u.def.supply>=3||u.def.hero?3.6:2.6,u.def.supply>=3||u.def.hero?3.6:2.6);}
  if(!ui.demo&&fogCv){g.imageSmoothingEnabled=true;g.drawImage(fogCv,0,0,S,S);}
  for(const p of ui.pings){const a=(G.time-p.t),pr=a/p.dur;if(pr>1)continue;g.strokeStyle=p.col.replace('A',String(1-pr));g.lineWidth=2;g.beginPath();g.arc(p.x*k,p.y*k,3+pr*18,0,TAU);g.stroke();}
  g.strokeStyle='#fff';g.lineWidth=1.2;g.strokeRect(cam.x*k+.5,cam.y*k+.5,VW/cam.z*k,(VH-BOTTOM)/cam.z*k);
}
