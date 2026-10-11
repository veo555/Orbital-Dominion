/* =========================================================================
   VISUAL FX — vignette + colour grade, additive glows, depth-parallax dust.
   Rendering only. Gated by the quality tier (Q.fx) and by the Reduce-motion setting; none of it touches the simulation.
     fx >= 1  vignette and a very light cool-top / warm-bottom grade
     fx >= 2  additive glow sprites on crystals, geysers, projectiles, heroes and hubs; drifting dust motes
   ========================================================================= */
const FX={vig:null,vw:0,vh:0,glow:{},motes:[],px:0,py:0,init:false};

function fxVignette(){
  const w=Math.max(16,Math.ceil(VW/6)),h=Math.max(16,Math.ceil(VH/6));
  if(FX.vig&&FX.vw===w&&FX.vh===h)return FX.vig;
  const c=mkCanvas(w,h),g=c.getContext('2d'),r1=Math.hypot(w,h)/2;
  const q=g.createRadialGradient(w/2,h/2,r1*0.46,w/2,h/2,r1);
  q.addColorStop(0,'rgba(2,6,16,0)');q.addColorStop(.7,'rgba(2,6,16,.20)');q.addColorStop(1,'rgba(2,5,14,.52)');
  g.fillStyle=q;g.fillRect(0,0,w,h);
  const l=g.createLinearGradient(0,0,0,h);l.addColorStop(0,'rgba(120,160,230,.17)');l.addColorStop(.28,'rgba(100,140,215,.05)');l.addColorStop(.55,'rgba(0,0,0,0)');l.addColorStop(1,'rgba(255,170,90,.05)');   // distance haze at the top of the screen (tilted camera), warm bounce at the bottom
  g.fillStyle=l;g.fillRect(0,0,w,h);
  FX.vw=w;FX.vh=h;return FX.vig=c;
}
function drawGrade(){
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='low';
  ctx.drawImage(fxVignette(),0,0,VW,VH);
}

/* soft round glow, cached per colour */
function glowSprite(rgb){
  let c=FX.glow[rgb];if(c)return c;
  c=mkCanvas(64,64);const g=c.getContext('2d'),q=g.createRadialGradient(32,32,0,32,32,32);
  q.addColorStop(0,'rgba('+rgb+',.95)');q.addColorStop(.28,'rgba('+rgb+',.42)');q.addColorStop(.62,'rgba('+rgb+',.1)');q.addColorStop(1,'rgba('+rgb+',0)');
  g.fillStyle=q;g.fillRect(0,0,64,64);return FX.glow[rgb]=c;
}
const rgbOf=h=>{h=h.replace('#','');return parseInt(h.slice(0,2),16)+','+parseInt(h.slice(2,4),16)+','+parseInt(h.slice(4,6),16);};
function glowAt(x,y,rad,rgb,a){ctx.globalAlpha=a;ctx.drawImage(glowSprite(rgb),x-rad,y-rad,rad*2,rad*2);}
/* world-space pass: called with the world transform active, after units and before the fog */
function drawGlows(t){
  const prev=ctx.globalCompositeOperation;ctx.globalCompositeOperation='lighter';
  const vis=(x,y)=>ui.demo||G.vis[0][clamp(y/TILE|0,0,MH-1)*MW+clamp(x/TILE|0,0,MW-1)]>0;
  for(const r of G.res){
    if(r.dead||!onScreen(r.x,r.y,60)||!vis(r.x,r.y))continue;
    if(r.type==='crystal')glowAt(r.x,r.y-4,38+3*Math.sin(t*1.7+r.id),'255,196,84',0.2+0.07*Math.sin(t*2.1+r.id*1.7));
    else glowAt(r.x,r.y,52+4*Math.sin(t*1.3+r.id),'176,120,255',0.22+0.08*Math.sin(t*1.9+r.id));
  }
  for(const b of G.buildings){
    if(b.dead||!b.done||b.type!=='hub'||!onScreen(b.x,b.y,120)||!entVisible(b))continue;
    glowAt(b.x,b.y,86,rgbOf(G.teams[b.team].pal.glow),0.10+0.03*Math.sin(t*1.2+b.id));
  }
  for(const u of G.units){
    if(u.dead||u.hidden||!u.def.hero||!onScreen(u.x,u.y,80)||!entVisible(u))continue;
    glowAt(u.x,u.y-(u.flying?16:0),46,rgbOf(G.teams[u.team<2?u.team:0].pal.glow),0.13+0.04*Math.sin(t*3+u.id));
  }
  for(const p of G.proj){
    if(!onScreen(p.x,p.y,40))continue;
    const pal=p.team<2?G.teams[p.team].pal:NEUTRAL_COL;
    if(p.kind==='bolt')glowAt(p.x,p.y,20,rgbOf(pal.glow),0.55);
    else if(p.kind==='bullet')glowAt(p.x,p.y,12,'255,226,150',0.5);
    else if(p.kind==='rocket')glowAt(p.x,p.y,22,'255,170,90',0.6);
    else if(p.kind==='acid')glowAt(p.x,p.y,16,'190,255,100',0.5);
    else if(p.kind==='shell'){const pr=clamp(1-hyp(p.tx-p.x,p.ty-p.y)/p.total,0,1);glowAt(p.x,p.y-Math.sin(pr*Math.PI)*58,24,'255,180,90',0.55);}
  }
  ctx.globalAlpha=1;ctx.globalCompositeOperation=prev;
}

/* a few dozen specks of dust that drift and slide against the map as the camera moves, which gives the flat top-down view some depth */
function drawMotes(dt){
  const n=Math.round(46*Q.part);
  if(!FX.init||FX.motes.length!==n){
    FX.motes.length=0;const R=mulberry32(12345);
    for(let i=0;i<n;i++)FX.motes.push({x:R()*VW,y:R()*VH,z:0.25+R()*0.75,ph:R()*TAU});
    FX.px=cam.x;FX.py=cam.y;FX.init=true;
  }
  const dx=(cam.x-FX.px)*cam.z,dy=(cam.y-FX.py)*cam.z;FX.px=cam.x;FX.py=cam.y;
  const g=ctx;g.fillStyle='rgb(200,222,255)';
  for(const m of FX.motes){
    m.x+=-dx*(0.35+0.55*m.z)+(7+10*m.z)*dt;m.y+=-dy*(0.35+0.55*m.z)+(2.5*Math.sin(m.ph+G.time*.4)+3*m.z)*dt;
    if(m.x<-4)m.x+=VW+8;else if(m.x>VW+4)m.x-=VW+8;if(m.y<-4)m.y+=VH+8;else if(m.y>VH+4)m.y-=VH+8;
    g.globalAlpha=(0.05+0.11*m.z)*(0.6+0.4*Math.sin(m.ph+G.time*.8));
    g.beginPath();g.arc(m.x,m.y,0.7+1.7*m.z,0,TAU);g.fill();
  }
  g.globalAlpha=1;
}
