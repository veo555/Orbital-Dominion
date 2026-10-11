/* =========================================================================
   LIGHT & ATMOSPHERE (v4.0) — rendering only. Nothing in here reads or writes simulation state that the sim uses
   (it only READS G for positions / hp / daylight; every random number is Math.random, which render code may use).
     1. day/night grade as a per-channel MULTIPLY layer (ambient colour) + additive LIGHTS accumulated into a small
        light buffer (see drawLighting). Dusk is warm, night is moon-blue, lamps/crystals/projectiles/flashes restore it.
     2. sun-driven soft shadows: baked blurred silhouettes, direction and length follow the in-game time of day.
     3. a small render-only particle pool (projectile trails, impact sparks, smoke, embers, construction welding).
     4. bloom: downscaled + squared bright pass, added back with 'lighter' (tiered by Q.bloom).
   docs/GRAPHICS_V4.md has the maths.
   ========================================================================= */
const LT={n:0,cap:288,x:new Float32Array(288),y:new Float32Array(288),r:new Float32Array(288),a:new Float32Array(288),p:new Float32Array(288),s:new Array(288),
  amb:[255,255,255],ambStr:'rgb(255,255,255)',nd:0,sx:0,sy:1,sl:1,sa:.3,sp:{},puff:null,ring:null,
  bf:0,bok:false,b1:null,g1:null,b2:null,g2:null,b3:null,g3:null,b0:null,g0:null};
const AMB_STOPS=[[0,74,92,150],[.3,112,120,172],[.55,236,172,138],[.8,255,228,200],[1,255,255,255]];   // daylight -> multiply colour

/* soft light sprite with a wide plateau (cached per colour) */
function lightSprite(rgb){
  let c=LT.sp[rgb];if(c)return c;
  c=mkCanvas(64,64);const g=c.getContext('2d'),q=g.createRadialGradient(32,32,0,32,32,32);
  q.addColorStop(0,'rgba('+rgb+',1)');q.addColorStop(.22,'rgba('+rgb+',.82)');q.addColorStop(.5,'rgba('+rgb+',.42)');q.addColorStop(.78,'rgba('+rgb+',.12)');q.addColorStop(1,'rgba('+rgb+',0)');
  g.fillStyle=q;g.fillRect(0,0,64,64);return LT.sp[rgb]=c;
}
function puffSprite(){
  if(LT.puff)return LT.puff;
  const c=mkCanvas(32,32),g=c.getContext('2d'),q=g.createRadialGradient(16,16,0,16,16,16);
  q.addColorStop(0,'rgba(78,80,90,.6)');q.addColorStop(.55,'rgba(66,68,78,.32)');q.addColorStop(1,'rgba(60,62,70,0)');g.fillStyle=q;g.fillRect(0,0,32,32);return LT.puff=c;
}

/* once per frame: sun vector, shadow strength, ambient colour */
function lightFrame(){
  const d=G.daylight,a=TAU*(G.time/360-0.17);
  LT.nd=1-d;LT.sx=Math.sin(a)*0.9;LT.sy=0.55;           // sun in the east in the morning (ph<0): shadows fall west, then east in the evening
  LT.sl=0.85+0.9*Math.abs(Math.sin(a));                 // long near dawn / dusk, short at noon
  LT.sa=0.18+0.46*clamp(d*1.4,0,1);                      // moonlight still leaves a faint shadow
  let i=1;while(i<AMB_STOPS.length-1&&d>AMB_STOPS[i][0])i++;
  const s0=AMB_STOPS[i-1],s1=AMB_STOPS[i],k=clamp((d-s0[0])/(s1[0]-s0[0]),0,1);
  LT.amb[0]=Math.round(lerp(s0[1],s1[1],k));LT.amb[1]=Math.round(lerp(s0[2],s1[2],k));LT.amb[2]=Math.round(lerp(s0[3],s1[3],k));
  LT.ambStr='rgb('+LT.amb[0]+','+LT.amb[1]+','+LT.amb[2]+')';
}

/* ---- lights: collected into preallocated typed arrays, no per-frame allocation ---- */
function lightPush(x,y,r,spr,a,pool){
  if(LT.n>=LT.cap)return;const i=LT.n++;LT.x[i]=x;LT.y[i]=y;LT.r[i]=r;LT.a[i]=a;LT.p[i]=pool;LT.s[i]=spr;
}
function collectLights(t){
  LT.n=0;const warm=lightSprite('255,214,150'),cyan=lightSprite('130,226,255'),amber=lightSprite('255,196,96'),viol=lightSprite('186,130,255'),fire=lightSprite('255,150,70'),cool=lightSprite('190,210,255');
  for(const bd of G.buildings){
    if(bd.dead||!entVisible(bd)||!onScreen(bd.x,bd.y,260))continue;
    if(bd.done){
      const rad=bd.type==='hub'?240:bd.type==='turret'?150:bd.type==='generator'?125:bd.w>=3?135:95;
      lightPush(bd.x,bd.y,rad,bd.type==='generator'?cyan:warm,bd.type==='hub'?1:.9,bd.type==='hub'?.3:.2);
      lightPush(bd.x,bd.y,rad*.55,lightSprite(rgbOf(G.teams[bd.team].pal.glow)),.55,.18);
      if(bd.hp<bd.maxhp*.3)lightPush(bd.x+Math.sin(t*9+bd.id)*5,bd.y,80,fire,.8+.2*Math.sin(t*23+bd.id),.4);
    }else lightPush(bd.x,bd.y,90,warm,.7,.2);
  }
  for(const r of G.res){if(r.dead||!onScreen(r.x,r.y,120))continue;if(!ui.demo&&G.vis[0][clamp(r.ty,0,MH-1)*MW+clamp(r.tx,0,MW-1)]===0)continue;
    lightPush(r.x,r.y,r.type==='crystal'?78:96,r.type==='crystal'?amber:viol,r.type==='crystal'?.6:.7,.35);}
  for(const nt of G.neutrals)if(nt.type==='tower'&&onScreen(nt.x,nt.y,200))lightPush(nt.x,nt.y,nt.ctrl>=0?175:95,viol,.7,.2);
  let n=0;
  for(const u of G.units){
    if(u.dead||u.hidden||u.team>1||!onScreen(u.x,u.y,120)||!entVisible(u))continue;
    if(u.def.hero)lightPush(u.x,u.y,160,lightSprite(rgbOf(G.teams[u.team].pal.glow)),.8,.3);
    else if(n<56){lightPush(u.x,u.y,u.def.supply>=3?80:54,cool,.42,0);n++;}
  }
  for(const f of G.fx)if(f.kind==='flash'||f.kind==='beam')lightPush(f.x,f.y,f.r*3.2,fire,.9*(1-f.t/f.max),.5);
  for(const p of G.proj){if(!onScreen(p.x,p.y,80))continue;
    lightPush(p.x,p.y,p.kind==='rocket'||p.kind==='shell'?70:46,p.kind==='acid'?lightSprite('190,255,100'):p.kind==='bolt'?lightSprite(rgbOf(p.team<2?G.teams[p.team].pal.glow:NEUTRAL_COL.glow)):fire,.75,.5);}
}
/* replaces the old destination-out night overlay. Light buffer L = ambient + sum(lights) (clamped at 1.0 per channel by the
   'lighter' blend); the scene is then multiplied by L, so unlit ground keeps `ambient` of its brightness and lit ground keeps all of it. */
function drawLighting(t){
  const d=G.daylight;if(d>=0.985)return;
  const nd=LT.nd,LQ=Q.lit>=3?4:Q.lit>=2?5:6,lw=Math.ceil(VW/LQ),lh=Math.ceil(VH/LQ);
  if(!lightCv||lightCv.width!==lw||lightCv.height!==lh){lightCv=mkCanvas(lw,lh);lightCtx=lightCv.getContext('2d');}
  const g=lightCtx;g.setTransform(1,0,0,1,0,0);g.globalCompositeOperation='source-over';g.globalAlpha=1;g.fillStyle=LT.ambStr;g.fillRect(0,0,lw,lh);
  const lights=nd>0.1;
  if(lights){
    collectLights(t);const k=cam.z/LQ,ga=clamp(nd*1.7,0,1);g.globalCompositeOperation='lighter';
    for(let i=0;i<LT.n;i++){const sr=LT.r[i]*k,sx=(LT.x[i]-cam.x)*k,sy=(LT.y[i]-cam.y)*k;g.globalAlpha=LT.a[i]*ga;g.drawImage(LT.s[i],sx-sr,sy-sr,sr*2,sr*2);}
    g.globalAlpha=1;g.globalCompositeOperation='source-over';
  }
  ctx.setTransform(DPR,0,0,DPR,0,0);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='low';
  ctx.globalCompositeOperation='multiply';ctx.drawImage(lightCv,0,0,VW,VH);ctx.globalCompositeOperation='source-over';
  if(lights&&Q.lit>=3){   // coloured light pools: accumulated in a second small buffer, then added once (hundreds of full-resolution additive blits were the expensive part)
    if(!LT.pcv||LT.pcv.width!==lw||LT.pcv.height!==lh){LT.pcv=mkCanvas(lw,lh);LT.pg=LT.pcv.getContext('2d');}
    const pg=LT.pg,k=cam.z/LQ;pg.setTransform(1,0,0,1,0,0);pg.globalCompositeOperation='source-over';pg.clearRect(0,0,lw,lh);pg.globalCompositeOperation='lighter';
    for(let i=0;i<LT.n;i++){const pl=LT.p[i];if(pl<=0)continue;const sr=LT.r[i]*.9*k,sx=(LT.x[i]-cam.x)*k,sy=(LT.y[i]-cam.y)*k;pg.globalAlpha=pl;pg.drawImage(LT.s[i],sx-sr,sy-sr,sr*2,sr*2);}
    pg.globalAlpha=1;ctx.globalCompositeOperation='lighter';ctx.globalAlpha=clamp(nd*1.4,0,1)*.38;ctx.drawImage(LT.pcv,0,0,VW,VH);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
  }
}

/* ---------------------------------- shadows ---------------------------------- */
/* blurred black silhouette of a sprite, baked once, lazily, 1 px per world unit (it is blurred, so no more is needed). */
function shadowOf(sp,w,h){   // blurred ground footprint of a sprite (sp.fp, or its own alpha for legacy sprites), cached on the sprite
  if(sp.sh)return sp.sh;
  const x0=sp.x0===undefined?-w/2:sp.x0,y0=sp.y0===undefined?-h/2:sp.y0,W=sp.w||w,Hh=sp.h||h;
  const P=Math.round(5+Math.min(W,Hh)*.08),cw=Math.ceil(W)+2*P,ch=Math.ceil(Hh)+2*P,c=mkCanvas(cw,ch),g=c.getContext('2d'),off=cw*3;
  g.shadowColor='#000';g.shadowBlur=P*.8;g.shadowOffsetX=off;g.drawImage(sp.fp||sp.cv,P-off,P,W,Hh);
  return sp.sh={cv:c,P,x0,y0,w:W,h:Hh};
}
/* a building shadow, drawn with the origin at the building centre (before the sprite). Stacked copies along the sun vector fake the long soft tail;
   the tail length follows the building's height. */
function drawBuildingShadow(sp,w,h,b){
  const sh=shadowOf(sp,w,h),P=sh.P,L=(8+(sp.hz||h*.4)*.9)*LT.sl,n=Q.shd>=3?3:Q.shd>=2?2:1,a=LT.sa*.95;
  for(let i=0;i<n;i++){const f=n>1?(i+1)/n:.6,o=L*f;ctx.globalAlpha=a*(1-i*.18);ctx.drawImage(sh.cv,sh.x0-P+LT.sx*o,sh.y0-P+LT.sy*o,sh.w+2*P,sh.h+2*P);}
  ctx.globalAlpha=1;
}
/* a unit shadow: the footprint of the baked facing, pushed along the sun vector (flyers: further, lighter) */
function drawUnitShadow(sp,u,d){
  const sh=shadowOf(sp,sp.w,sp.h),P=sh.P,k=(u.flying?24:(sp.hz||10)*.55+d.r*.3)*LT.sl;
  ctx.globalAlpha=LT.sa*(u.flying?.55:.85)*(ctx.globalAlpha||1);ctx.drawImage(sh.cv,sh.x0-P+LT.sx*k,sh.y0-P+LT.sy*k+(u.flying?4:0),sh.w+2*P,sh.h+2*P);ctx.globalAlpha=1;
}

/* ------------------------------ particle pool -------------------------------- */
/* kinds: 0 additive glow trail · 1 smoke puff · 2 ember (additive, rises) · 3 spark (additive streak) · 4 shockwave ring */
const PT={cap:640,n:0,x:new Float32Array(640),y:new Float32Array(640),vx:new Float32Array(640),vy:new Float32Array(640),l:new Float32Array(640),m:new Float32Array(640),
  sz:new Float32Array(640),k:new Uint8Array(640),s:new Array(640),seen:new WeakSet()};
function ptAdd(k,x,y,vx,vy,life,size,spr){
  const cap=Math.min(PT.cap,Math.floor(640*Q.part));if(PT.n>=cap)return;
  const i=PT.n++;PT.k[i]=k;PT.x[i]=x;PT.y[i]=y;PT.vx[i]=vx;PT.vy[i]=vy;PT.l[i]=life;PT.m[i]=life;PT.sz[i]=size;PT.s[i]=spr;
}
function ptStep(dt){
  for(let i=0;i<PT.n;){
    PT.l[i]-=dt;
    if(PT.l[i]<=0){const j=--PT.n;if(i!==j){PT.k[i]=PT.k[j];PT.x[i]=PT.x[j];PT.y[i]=PT.y[j];PT.vx[i]=PT.vx[j];PT.vy[i]=PT.vy[j];PT.l[i]=PT.l[j];PT.m[i]=PT.m[j];PT.sz[i]=PT.sz[j];PT.s[i]=PT.s[j];}PT.s[j]=null;continue;}
    const k=PT.k[i];
    if(k===1){PT.vx[i]*=1-1.2*dt;PT.vy[i]=PT.vy[i]*(1-1.2*dt)-10*dt;}else if(k===3){PT.vx[i]*=1-3*dt;PT.vy[i]*=1-3*dt;}else if(k===2){PT.vy[i]-=22*dt;}
    PT.x[i]+=PT.vx[i]*dt;PT.y[i]+=PT.vy[i]*dt;i++;
  }
}
function ptReset(){PT.n=0;PT.s.fill(null);}
function ptDraw(){
  if(!PT.n)return;const puff=puffSprite();
  for(let i=0;i<PT.n;i++){if(PT.k[i]!==1)continue;const a=PT.l[i]/PT.m[i],r=PT.sz[i]*(1.3-.8*a);if(!onScreen(PT.x[i],PT.y[i],r))continue;ctx.globalAlpha=Math.min(1,a*1.4)*.8;ctx.drawImage(puff,PT.x[i]-r,PT.y[i]-r,r*2,r*2);}
  ctx.globalCompositeOperation='lighter';
  for(let i=0;i<PT.n;i++){
    const k=PT.k[i];if(k===1)continue;const a=PT.l[i]/PT.m[i],x=PT.x[i],y=PT.y[i];if(!onScreen(x,y,PT.sz[i]*2+20))continue;
    if(k===4){const r=PT.sz[i]*(1-a*a);ctx.globalAlpha=a*.8;ctx.strokeStyle='rgba(255,214,160,1)';ctx.lineWidth=2+3*a;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.stroke();continue;}
    if(k===3){ctx.globalAlpha=Math.min(1,a*1.6);ctx.strokeStyle=PT.s[i];ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-PT.vx[i]*.045,y-PT.vy[i]*.045);ctx.stroke();continue;}
    const r=PT.sz[i]*(k===0?(.5+.5*a):1);ctx.globalAlpha=(k===0?.55:.8)*a;ctx.drawImage(PT.s[i],x-r,y-r,r*2,r*2);
  }
  ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
}
/* emitters: looks at the sim state read-only and feeds the pool. Called once per frame while the game runs. */
function fxEmit(dt,t){
  const R=Math.random,gl=glowSprite,nd=LT.nd;
  for(const p of G.proj){
    if(!onScreen(p.x,p.y,40))continue;
    const kind=p.kind;
    if(!PT.seen.has(p)){PT.seen.add(p);   // muzzle flash: a hot core, a coloured halo and two sparks along the barrel
      const a=Math.atan2(p.ty-p.y,p.tx-p.x),ca=Math.cos(a),sa=Math.sin(a),pc=p.team<2?G.teams[p.team].pal.glow:'#ffd27a';
      if(kind!=='shell'){ptAdd(0,p.x+ca*7,p.y+sa*7,0,0,.1,kind==='bolt'?26:20,gl(kind==='bolt'?rgbOf(pc):'255,214,130'));ptAdd(0,p.x+ca*7,p.y+sa*7,0,0,.06,10,gl('255,255,235'));
        for(let i=0;i<2;i++){const sp=140+R()*120,sj=(R()-.5)*.5;ptAdd(3,p.x+ca*8,p.y+sa*8,Math.cos(a+sj)*sp,Math.sin(a+sj)*sp,.12+R()*.1,0,'rgba(255,230,160,1)');}}
      else{ptAdd(0,p.x,p.y,0,0,.14,34,gl('255,190,110'));for(let i=0;i<3;i++)ptAdd(1,p.x,p.y,(R()-.5)*24,(R()-.5)*24,.8,8+R()*4,null);}}
    if(kind==='bolt')ptAdd(0,p.x,p.y,0,0,.28,13,gl(rgbOf((p.team<2?G.teams[p.team].pal:NEUTRAL_COL).glow)));
    else if(kind==='rocket'){ptAdd(0,p.x,p.y,0,0,.22,11,gl('255,170,90'));if(R()<.7)ptAdd(1,p.x,p.y,(R()-.5)*14,(R()-.5)*14,.7,6+R()*3,null);}
    else if(kind==='shell'){const pr=clamp(1-hyp(p.tx-p.x,p.ty-p.y)/p.total,0,1);ptAdd(0,p.x,p.y-Math.sin(pr*Math.PI)*58,0,0,.3,10,gl('255,190,110'));}
    else if(kind==='acid')ptAdd(0,p.x,p.y,0,0,.25,9,gl('190,255,100'));
    else if(kind==='bullet'&&R()<.5)ptAdd(0,p.x,p.y,0,0,.14,6,gl('255,226,150'));
  }
  for(const f of G.fx){   // hero skills / area effects: a burst of sparks in the effect colour along the rim
    if(f.kind!=='ring'||f.r<40||f.t>.05||PT.seen.has(f)||!onScreen(f.x,f.y,f.r))continue;PT.seen.add(f);
    const n=Math.min(18,6+(f.r/12|0));for(let i=0;i<n;i++){const a=i/n*TAU+R()*.3,v=40+R()*60;ptAdd(3,f.x+Math.cos(a)*f.r*.35,f.y+Math.sin(a)*f.r*.35,Math.cos(a)*v*2,Math.sin(a)*v*2,.35+R()*.3,0,f.col);}
  }
  for(const f of G.fx){
    if(f.kind!=='flash'||PT.seen.has(f))continue;PT.seen.add(f);
    if(!onScreen(f.x,f.y,100))continue;const big=f.r>=60,n=big?14:6;
    for(let i=0;i<n;i++){const a=R()*TAU,v=60+R()*(big?260:140);ptAdd(3,f.x,f.y,Math.cos(a)*v,Math.sin(a)*v,.28+R()*.3,0,R()<.5?'rgba(255,224,150,1)':'rgba(255,160,80,1)');}
    if(big){for(let i=0;i<8;i++){const a=R()*TAU,d=R()*f.r*.35;ptAdd(0,f.x+Math.cos(a)*d,f.y+Math.sin(a)*d,Math.cos(a)*30,Math.sin(a)*30,.5+R()*.35,f.r*(.7+R()*.5),gl(R()<.5?'255,150,60':'255,200,110'));}   // fireball lobes
      for(let i=0;i<10;i++){const a=R()*TAU,v=40+R()*130;ptAdd(2,f.x,f.y,Math.cos(a)*v,Math.sin(a)*v-30,.7+R()*.7,9,gl('255,140,60'));}                  // glowing debris
      for(let i=0;i<4;i++)ptAdd(1,f.x+(R()-.5)*18,f.y,(R()-.5)*10,-26-R()*22,1.8+R()*.8,16+R()*10,null);                                                  // smoke column
      ptAdd(4,f.x,f.y,0,0,.45,f.r*1.3,null);for(let i=0;i<6;i++){const a=R()*TAU,v=10+R()*34;ptAdd(1,f.x+Math.cos(a)*10,f.y+Math.sin(a)*10,Math.cos(a)*v,Math.sin(a)*v-8,1.1+R()*.8,12+R()*8,null);}}
    else if(R()<.5)ptAdd(1,f.x,f.y,(R()-.5)*12,-6,.7,6+R()*4,null);
  }
  for(const b of G.buildings){
    if(b.dead||!entVisible(b)||!onScreen(b.x,b.y,90))continue;
    const w=b.w*TILE,h=b.h*TILE;
    if(!b.done){   // welding sparks on the build line + a little dust at the foot
      if(R()<dt*16){const y=b.y+h/2-h*b.prog;ptAdd(3,b.x+(R()-.5)*w*.8,y,(R()-.5)*120,-30-R()*70,.25+R()*.2,0,'rgba(255,214,120,1)');}
      if(R()<dt*3)ptAdd(1,b.x+(R()-.5)*w,b.y+h/2,(R()-.5)*10,-4,.9,7+R()*5,null);
      continue;
    }
    const fr=b.hp/b.maxhp;
    if(fr<.55){const rate=(.55-fr)*9;if(R()<rate*dt)ptAdd(1,b.x+(R()-.5)*w*.6,b.y+(R()-.5)*h*.5,(R()-.5)*10,-12,1.4+R(),9+R()*8,null);}
    if(fr<.3&&R()<dt*(.3-fr)*60)ptAdd(2,b.x+(R()-.5)*w*.6,b.y+(R()-.5)*h*.5,(R()-.5)*20,-10,.6+R()*.5,10,gl('255,140,60'));
  }
  for(const u of G.units){
    if(u.dead||u.hidden||u.team>1||!entVisible(u)||!onScreen(u.x,u.y,40))continue;
    if(u.hp<u.maxhp*.35&&u.def.supply>=2&&R()<dt*3)ptAdd(1,u.x,u.y-(u.flying?16:0),(R()-.5)*10,-8,.9,5+R()*3,null);
  }
  if(nd>.3)for(const r of G.res){if(r.dead||r.type!=='crystal'||!onScreen(r.x,r.y,60)||R()>dt*.5)continue;
    if(!ui.demo&&G.vis[0][clamp(r.ty,0,MH-1)*MW+clamp(r.tx,0,MW-1)]===0)continue;ptAdd(2,r.x+(R()-.5)*14,r.y-4,(R()-.5)*6,-6,1.2,5,gl('255,200,100'));}
}

/* ---------------------------------- bloom ------------------------------------ */
/* bright pass = downscale the finished frame, then x^6 per channel (three 'multiply' draws) so only the brightest pixels keep energy;
   the small result is stretched back with bilinear filtering (that IS the blur) and added with 'lighter'. */
function drawBloom(){
  if(Q.bloom<1||(LT.nd<.12&&!PT.n))return;   // by day the glow is invisible: skip the whole pass unless sparks / flashes are alive
  const W=cv.width,H=cv.height,qw=Math.max(8,W>>2),qh=Math.max(8,H>>2),bw=Math.max(8,W>>3),bh=Math.max(8,H>>3);
  if(!LT.b0||LT.b0.width!==qw||LT.b0.height!==qh||LT.b1.width!==bw||LT.b1.height!==bh){
    LT.b0=mkCanvas(qw,qh);LT.g0=LT.b0.getContext('2d');LT.b1=mkCanvas(bw,bh);LT.g1=LT.b1.getContext('2d');LT.b2=mkCanvas(bw,bh);LT.g2=LT.b2.getContext('2d');
    LT.b3=mkCanvas(Math.max(4,bw>>1),Math.max(4,bh>>1));LT.g3=LT.b3.getContext('2d');
  }
  const g0=LT.g0,g1=LT.g1,g2=LT.g2;
  LT.bf=(LT.bf+1)%3;   // the bright pass is refreshed every third frame (it is a blurry glow: a one-frame lag is invisible, and it cuts the full-frame readback to a third)
  if(LT.bf===0||!LT.bok){LT.bok=true;
  g0.globalCompositeOperation='copy';g0.drawImage(cv,0,0,qw,qh);
  g1.globalCompositeOperation='copy';g1.drawImage(LT.b0,0,0,bw,bh);
  g2.globalCompositeOperation='copy';g2.drawImage(LT.b1,0,0);g2.globalCompositeOperation='multiply';g2.drawImage(LT.b1,0,0);g2.drawImage(LT.b1,0,0);   // b2 = x^3
  g1.globalCompositeOperation='copy';g1.drawImage(LT.b2,0,0);g1.globalCompositeOperation='multiply';g1.drawImage(LT.b2,0,0);                         // b1 = x^6
  LT.g3.globalCompositeOperation='copy';LT.g3.drawImage(LT.b1,0,0,LT.b3.width,LT.b3.height);}
  const nd=LT.nd,str=(Q.bloom>=2?.9:.7)*(.2+.4*nd);
  ctx.setTransform(1,0,0,1,0,0);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='low';ctx.globalCompositeOperation='lighter';
  ctx.globalAlpha=Math.min(1,str);ctx.drawImage(LT.b1,0,0,W,H);
  if(Q.bloom>=2){ctx.globalAlpha=Math.min(1,str);ctx.drawImage(LT.b3,0,0,W,H);}
  ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
}

/* ------------------------------ baked sprite lighting ------------------------------ */
/* additive glow of a sprite's emissive mask (soft because the mask is stored at 1/3 size and upscaled bilinearly) */
function drawEmissive(sp,x,y,w,h,a){
  if(!sp.cv._em||Q.lit<1)return;const pa=ctx.globalAlpha;ctx.globalAlpha=pa*a;ctx.globalCompositeOperation='lighter';ctx.drawImage(sp.cv._em,x,y,w,h);ctx.globalCompositeOperation='source-over';ctx.globalAlpha=pa;
}

/* test-side hook (same convention as window.__RTS in 90_main.js): lets tests/e2e/e2e_visual.py reach the lighting internals. Not used by the game. */

