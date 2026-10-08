/* =========================================================================
   CINEMATIC FX (2/2): fx painters, transitions, colour grade and the title card.
   Contract: docs/CINEMATIC_SPEC.md sections 5.6 (fx), 5.8 (transitions, grade), 5.10 (helpers).
   Load order: 64_cine_art (registry, helpers, placeholders) < 64_cine_bg_* < 64_cine_portraits < 64_cine_props < THIS < 66_cine (engine).
   Every entry here REPLACES a placeholder (assignment into the registry). Nothing is exported except through CINE_PAINT.

   Rules the painters keep (checked by tests/e2e/e2e_cine.py and tools/cine_contact.py):
   - Pure: the picture depends only on (params, t, seed, S). No Math.random, no Date, no performance.now, no state from earlier frames.
     Caches (sprites, overlays) are keyed by their inputs only, so a cache hit and a cold bake give the same pixels.
   - Alpha: g.globalAlpha is preset to S.a by the engine. Colours given as rgba() are NOT multiplied by S.a again; a painter that
     sets g.globalAlpha itself multiplies by S.a (cfxAl does).
   - Reduced motion (S.rm): flashes are capped near 0.15 of the frame, glitch draws nothing, heat has no jitter, pulses are slower.
   - Battery tier (S.part = 0.5): particle counts go through cnN(); heat uses coarser slices, the grade skips its optional pass.
   ========================================================================= */
(()=>{
/* ------------------------------------------ caches: keyed by inputs only ------------------------------------------ */
const CFX_SPR=new Map(),CFX_FULL=new Map();
function cfxCache(key,w,h,bake,full){                                     // small LRU: sprites (64/96 px) and full-frame overlays (few, large)
  const M=full?CFX_FULL:CFX_SPR,cap=full?6:72;
  let c=M.get(key);
  if(c){M.delete(key);M.set(key,c);return c;}
  c=mkCanvas(w,h);bake(c.getContext('2d'),c.width,c.height);M.set(key,c);
  while(M.size>cap)M.delete(M.keys().next().value);
  return c;
}
/* soft sprites: 'glow' (white-hot core, coloured halo), 'core' (small hot dot), 'halo' (soft colour only), 'mote' (dust), 'flake' (snow),
   'ghost' (lens-ghost disc with a bright rim), 'puff' (smoke: noise-shaped, 96 px, lit from above; v picks one of four shapes). */
function cfxSpr(kind,col,v){
  const sz=kind==='puff'?96:64;
  return cfxCache(kind+'|'+col+'|'+(v|0),sz,sz,(q,w,h)=>{
    const c=cnCol(col),cx=w/2,cy=h/2,R=w/2;
    if(kind==='puff'){
      const img=q.createImageData(w,h),d=img.data,sd=((v|0)+1)*131+17;
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const dx=(x+.5-cx)/R,dy=(y+.5-cy)/R,r=Math.sqrt(dx*dx+dy*dy),n=cnFbm(x/w*4.6,y/h*4.6,sd,5,2.2,.55);
        const a=cnSS(1.02,.26,r+(n-.5)*1.15),lum=1.14-.46*(y/h)+.14*(n-.5),o=(y*w+x)*4;
        d[o]=Math.min(255,c[0]*lum);d[o+1]=Math.min(255,c[1]*lum);d[o+2]=Math.min(255,c[2]*lum);d[o+3]=255*a;
      }
      q.putImageData(img,0,0);return;
    }
    let st;
    switch(kind){
      case'glow':st=[[0,'rgba(255,255,255,1)'],[.1,cnA(c,.95)],[.3,cnA(c,.42)],[.6,cnA(c,.11)],[1,cnA(c,0)]];break;
      case'core':st=[[0,'rgba(255,255,255,1)'],[.22,'rgba(255,255,255,.7)'],[.42,cnA(c,.35)],[1,cnA(c,0)]];break;
      case'halo':st=[[0,cnA(c,.85)],[.2,cnA(c,.5)],[.55,cnA(c,.12)],[1,cnA(c,0)]];break;
      case'mote':st=[[0,cnA(c,1)],[.35,cnA(c,.7)],[.7,cnA(c,.2)],[1,cnA(c,0)]];break;
      case'flake':st=[[0,'rgba(255,255,255,1)'],[.45,'rgba(255,255,255,.7)'],[.8,'rgba(255,255,255,.15)'],[1,'rgba(255,255,255,0)']];break;
      case'ghost':st=[[0,cnA(c,.1)],[.68,cnA(c,.22)],[.87,cnA(c,.85)],[.94,cnA(c,.3)],[1,cnA(c,0)]];break;
      default:st=[[0,cnA(c,1)],[1,cnA(c,0)]];
    }
    q.fillStyle=cnRG(q,cx,cy,0,R,st);q.fillRect(0,0,w,h);
  });
}
/* draw a sprite centred on (x,y) with radius r (the sprite's full extent is 2r). The caller sets the alpha. */
const cfxPut=(g,s,x,y,r)=>{if(r>0&&isFinite(x)&&isFinite(y))g.drawImage(s,x-r,y-r,r*2,r*2);};
/* alpha for a sprite draw: a is the local alpha, multiplied by the entry's master alpha (globalAlpha is about to be replaced) */
const cfxAl=(g,S,a)=>{g.globalAlpha=cnC01(a)*S.a;};
/* a smoke volume: a dark body (source-over) with a lit rim (additive) offset upward, so the top of every puff catches the light */
function cfxPuff(g,S,v,x,y,r,al,body){
  if(al<=0||!(r>0))return;
  cfxAl(g,S,al);cfxPut(g,cfxSpr('puff',body,v),x,y,r);
  g.save();g.globalCompositeOperation='lighter';cfxAl(g,S,al*.32);cfxPut(g,cfxSpr('puff','#56627e',v),x,y-r*.22,r*.9);g.restore();
}
/* anchor of an fx entry in screen px: the camera-projected point, else the entry's own 0..1 position, else the default */
const cfxAt=(e,S,W,H,dx,dy)=>S.pos||{x:W*(e.x==null?dx:e.x),y:H*(e.y==null?dy:e.y)};
/* faction colour from the scene (S.faction), else the fallback */
const cfxFac=(S,k,fb)=>S.faction?cnFac(S.faction)[k]:fb;
/* normalised 0..1 wrap */
const cfxWrap=x=>x-Math.floor(x);

/* ============================================================================================================
   FX
   ============================================================================================================ */
const PF=CINE_PAINT.fx;

/* stars: three depth layers (pinpoint, halo, bright with diffraction spikes), slow drift and twinkle. Screen space. */
PF.stars=(g,W,H,e,t,seed,S)=>{
  const u=S.u,dir=e.dir==null?-.35:e.dir,sp=(e.spd==null?1:e.spd)*(S.rm?.35:1),dx=Math.cos(dir),dy=Math.sin(dir),dn=e.n==null?1:e.n;
  const LY=[{n:150,sz:.8,a:.5,v:.004,tw:.7},{n:44,sz:1.3,a:.75,v:.009,tw:1.1},{n:9,sz:2.2,a:1,v:.016,tw:1.6}];
  g.save();
  for(let li=0;li<LY.length;li++){
    const L=LY[li],n=cnN(L.n*dn,S),sd=seed+li*7919;
    for(let i=0;i<n;i++){
      const r1=cnR(sd,i,1),r2=cnR(sd,i,2),r3=cnR(sd,i,3),r4=cnR(sd,i,4),r5=cnR(sd,i,5),r6=cnR(sd,i,6);
      const x=cfxWrap(r1+t*sp*L.v*dx)*W,y=cfxWrap(r2+t*sp*L.v*dy)*H;
      const tw=S.rm?.82+.18*Math.sin(t*L.tw*(.6+r4*1.4)+r5*TAU):.5+.5*Math.sin(t*L.tw*(.6+r4*1.4)+r5*TAU);
      const col=r6<.14?'#ffd9b0':r6>.86?'#c4dcff':'#ffffff';
      if(li===0){g.globalAlpha=S.a;g.fillStyle=cnA(col,L.a*tw*(.7+.3*r3));const s=L.sz*u*(.8+.4*r3);g.fillRect(x-s/2,y-s/2,s,s);}
      else if(li===1){g.globalAlpha=S.a;g.fillStyle=cnA(col,L.a*tw);const s=L.sz*u;g.fillRect(x-s/2,y-s/2,s,s);cfxAl(g,S,L.a*tw*.75);cfxPut(g,cfxSpr('halo',col),x,y,3.4*u*L.sz);}
      else{
        cfxAl(g,S,L.a*tw);cfxPut(g,cfxSpr('glow',col),x,y,6.5*u*L.sz);
        const len=(14+10*r3)*u*L.sz*(.7+.3*tw),A=.5*tw;
        g.globalAlpha=S.a;
        g.fillStyle=cnLG(g,x-len,0,x+len,0,[[0,cnA(col,0)],[.5,cnA(col,A)],[1,cnA(col,0)]]);g.fillRect(x-len,y-u*.5,len*2,u);
        g.fillStyle=cnLG(g,0,y-len,0,y+len,[[0,cnA(col,0)],[.5,cnA(col,A)],[1,cnA(col,0)]]);g.fillRect(x-u*.5,y-len,u,len*2);
      }
    }
  }
  g.restore();
  g.globalAlpha=S.a;
};

/* dust: soft motes drifting through light. Near motes are large and soft (bokeh), far motes small and crisp; motes near the key light catch
   more light. Two additive light shafts run from the key light (downward when the key sits at the centre). */
PF.dust=(g,W,H,e,t,seed,S)=>{
  const u=S.u,col=e.col||'#ffe6c0',K=S.key||{x:.5,y:.1,col:col,a:.5},kx=K.x*W,ky=K.y*H,kc=K.col||col,dn=e.n==null?1:e.n;
  g.save();g.globalCompositeOperation='lighter';
  const vx=W*.5-kx,vy=H*.5-ky,base=Math.hypot(vx,vy)>H*.08?Math.atan2(vy,vx):Math.PI/2;
  for(const sh of[[-.16,.11,.13],[.09,.07,.09]]){
    const ang=base+sh[0]+Math.sin(t*.09+sh[0]*9)*.02,L=Math.max(W,H)*1.4,ex=kx+Math.cos(ang)*L,ey=ky+Math.sin(ang)*L,px=-Math.sin(ang)*W*sh[1]*.5,py=Math.cos(ang)*W*sh[1]*.5;
    g.fillStyle=cnLG(g,kx,ky,ex,ey,[[0,cnA(kc,sh[2])],[.6,cnA(kc,sh[2]*.35)],[1,cnA(kc,0)]]);
    g.beginPath();g.moveTo(kx,ky);g.lineTo(ex+px,ey+py);g.lineTo(ex-px,ey-py);g.closePath();g.fill();
  }
  g.restore();
  const n=cnN(96*dn,S),spr=cfxSpr('mote',col);
  for(let i=0;i<n;i++){
    const r1=cnR(seed,i,1),r2=cnR(seed,i,2),r3=cnR(seed,i,3),r4=cnR(seed,i,4),r5=cnR(seed,i,5),r6=cnR(seed,i,6),d=r4;
    const x=cfxWrap(r1+t*(.004+.01*d)*(S.rm?.4:1)+Math.sin(t*.25+r3*TAU)*.006)*W,y=cfxWrap(r2+Math.sin(t*(.18+.12*r5)+r3*TAU)*.012)*H;
    const br=1-cnC01(Math.hypot(x-kx,y-ky)/(Math.max(W,H)*.7)),tw=.72+.28*Math.sin(t*(.6+r6)+r5*TAU);
    const r=(.8+2.4*d*d+.3*r6)*u;
    cfxAl(g,S,Math.min(1,(.3+.8*d)*(.35+.65*br)*tw));cfxPut(g,spr,x,y,r*3.2);
  }
  g.globalAlpha=S.a;
};

/* embers: sparks lifted from below, swaying and flickering, each a hot core inside a warm halo. */
PF.embers=(g,W,H,e,t,seed,S)=>{
  const u=S.u,col=e.col||'#ff9a4a',sp=e.spd==null?1:e.spd,n=cnN(64*(e.n==null?1:e.n),S),warm=cfxSpr('glow',col),hot=cfxSpr('core','#ffe2a0');
  g.save();g.globalCompositeOperation='lighter';
  for(let i=0;i<n;i++){
    const r1=cnR(seed,i,1),r2=cnR(seed,i,2),r3=cnR(seed,i,3),r4=cnR(seed,i,4),r5=cnR(seed,i,5),r6=cnR(seed,i,6);
    const ph=cnFrac(t*sp/(3.2+3.4*r3)+r6),x=(.06+.88*r1)*W+Math.sin(t*(.7+r4)*sp+r5*TAU)*W*(.012+.012*r2)+ph*W*.02*(r2-.5),y=H*(1.03-ph*1.14);
    const life=cnSS(0,.08,ph)*(1-cnSS(.6,1,ph));
    if(life<=.01)continue;
    const fl=.72+.28*cnVN(t*(5+3*r4)*sp+i*3.1,4.3,seed),r=(2.2+3*r5)*u*(1-.4*ph);
    cfxAl(g,S,1*life*fl);cfxPut(g,hot,x,y,r*.8);
    cfxAl(g,S,.65*life*fl);cfxPut(g,warm,x,y,r*4);
  }
  g.restore();
  g.globalAlpha=S.a;
};

/* rain: three layers of slanted streaks (thin and faint far, thick and bright near), batched into one path per layer, with a wet mist at the bottom. */
PF.rain=(g,W,H,e,t,seed,S)=>{
  const u=S.u,dir=e.dir==null?.22:e.dir,col=e.col||'#c4d8ff',dn=e.n==null?1:e.n,rm=S.rm?.8:1;
  const LY=[{n:80,len:.028,w:.75,a:.2,sp:1.6},{n:110,len:.042,w:1.05,a:.3,sp:1.2},{n:58,len:.07,w:1.6,a:.46,sp:.9}];
  g.save();g.lineCap='round';
  for(let li=0;li<LY.length;li++){
    const L=LY[li],n=cnN(L.n*dn,S),sd=seed+li*4241,len=L.len*H;
    g.strokeStyle=cnA(col,L.a*rm);g.lineWidth=L.w*u;g.beginPath();
    for(let i=0;i<n;i++){
      const ph=cnFrac(t*L.sp/(.5+.35*cnR(sd,i,3))+cnR(sd,i,9)),x=(cnR(sd,i,1)*1.5-.25)*W+ph*H*dir*1.4,y=ph*H*1.16-H*.08;
      g.moveTo(x-dir*len,y-len);g.lineTo(x,y);
    }
    g.stroke();
  }
  g.fillStyle=cnLG(g,0,H*.76,0,H,[[0,cnA(col,0)],[1,cnA(col,.12*rm)]]);g.fillRect(0,H*.76,W,H*.24);
  g.restore();
};

/* snow: three depth layers of soft flakes falling with a wind wobble; the near layer is large and soft (bokeh). */
PF.snow=(g,W,H,e,t,seed,S)=>{
  const u=S.u,col=e.col||'#eef6ff',dn=e.n==null?1:e.n,wind=(e.dir==null?.02:e.dir*.1),spr=cfxSpr('flake',col);
  const LY=[{n:120,r:.9,a:.38,sp:.09,bok:0},{n:70,r:1.8,a:.55,sp:.14,bok:0},{n:26,r:3.6,a:.42,sp:.22,bok:1}];
  g.save();
  for(let li=0;li<LY.length;li++){
    const L=LY[li],n=cnN(L.n*dn,S),sd=seed+li*6151;
    for(let i=0;i<n;i++){
      const r1=cnR(sd,i,1),r2=cnR(sd,i,2),r3=cnR(sd,i,3),r4=cnR(sd,i,4),r5=cnR(sd,i,5),r6=cnR(sd,i,6);
      const ph=cnFrac(t*L.sp*(.7+.6*r3)+r2),y=ph*H*1.08-H*.04;
      const x=cfxWrap(r1+t*wind*(.6+r4)+Math.sin(t*(.25+.2*r5)+r6*TAU)*.012)*W*1.02-W*.01;
      const r=L.r*u*(.85+.4*r5);
      cfxAl(g,S,L.a*(.7+.3*Math.sin(t*(.7+r4)+r6*TAU)));
      cfxPut(g,spr,x,y,r*(L.bok?2.6:1.9));
    }
  }
  g.restore();
  g.globalAlpha=S.a;
};

/* lightning: a strike every ~1.25 s (jittered, closed form per strike), a midpoint-displaced main channel (32 segments) with three forks, a
   bright re-strike flicker, a bloom along the channel, an impact glow and a broad cool sky wash. Under reduced motion the wash is capped near 0.15. */
PF.lightning=(g,W,H,e,t,seed,S)=>{
  const u=S.u,col=e.col||'#d4e6ff',P=1.25/Math.max(.25,e.n==null?1:e.n),k0=Math.floor(t/P);
  let st=null;
  for(let k=k0-1;k<=k0;k++){if(k<0)continue;const a=t-(k*P+cnR(seed,k,1)*P*.5);if(a>=0&&a<.42)st={k,a};}
  if(!st)return;
  const m=st.a<.05?1:st.a<.085?.3:st.a<.12?.85:st.a<.2?.45*(1-(st.a-.12)/.08):0;
  if(m<=0)return;
  const sd=seed+st.k*977,rm=S.rm?.6:1;
  const x0=e.x!=null?e.x*W+(cnR(sd,1,2)-.5)*W*.04:W*(.12+.76*cnR(sd,1,1)),y1=e.y!=null?e.y*H:H*(.56+.3*cnR(sd,2,1));
  let pts=[[x0,-H*.03],[x0+(cnR(sd,3,1)-.5)*W*.05,y1]],amp=H*.12;
  for(let lv=0;lv<5;lv++){                                                                   // midpoint displacement: 32 segments
    const Q=[];for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1],id=lv*41+i;Q.push(a);Q.push([(a[0]+b[0])/2+(cnR(sd,id,5)-.5)*amp,(a[1]+b[1])/2+(cnR(sd,id,6)-.5)*amp*.12]);}
    Q.push(pts[pts.length-1]);pts=Q;amp*=.5;
  }
  const br=[];
  for(let j=0;j<3;j++){                                                                     // forks: walk off the channel at an angle
    const si=Math.floor(3+cnR(sd,j,7)*(pts.length-7)),p0=pts[si],side=cnR(sd,j,8)<.5?-1:1;
    let x=p0[0],y=p0[1],a=Math.PI/2+side*(.35+.4*cnR(sd,j,9));const bp=[[x,y]];
    for(let s=0;s<6;s++){a+=(cnR(sd,j*9+s,10)-.5)*.8;const L=H*.05*(1-s*.11);x+=Math.cos(a)*L;y+=Math.sin(a)*L;bp.push([x,y]);}
    br.push(bp);
  }
  const path=(P2,w,c,al)=>{g.lineWidth=w;g.strokeStyle=cnA(c,al);g.beginPath();g.moveTo(P2[0][0],P2[0][1]);for(let i=1;i<P2.length;i++)g.lineTo(P2[i][0],P2[i][1]);g.stroke();};
  g.save();g.globalCompositeOperation='lighter';g.lineJoin='round';g.lineCap='round';
  const last=pts[pts.length-1],fl=(S.rm?Math.min(.15,.3*m):.3*m);
  g.fillStyle=cnRG(g,x0,0,0,W*.85,[[0,cnA(col,fl)],[.5,cnA(col,fl*.4)],[1,cnA(col,0)]]);g.fillRect(0,0,W,H);     // sky wash
  cnGlow(g,last[0],last[1],H*.22,col,.7*m*rm,{core:.7});                                                  // impact
  path(pts,30*u,col,.07*m*rm);path(pts,14*u,col,.12*m*rm);path(pts,4.5*u,col,.44*m*rm);path(pts,1.35*u,'#ffffff',.95*m*rm);
  for(const b of br){path(b,5*u,col,.3*m*rm);path(b,1*u,'#ffffff',.6*m*rm);}
  g.restore();
  g.globalAlpha=S.a;
};

/* beam: an orbital beam / laser column (shimmering, three strokes), a bright emitter, an impact bloom with a ground ring and sparks thrown off. */
PF.beam=(g,W,H,e,t,seed,S)=>{
  const u=S.u,p=cfxAt(e,S,W,H,.5,0),q=S.pos2||{x:p.x,y:H*.92},col=e.col||cfxFac(S,'light','#9ad8ff'),ch=cnEase('out',cnC01(t/.24)),rm=S.rm?.6:1;
  const wid=(6.5+1.6*Math.sin(t*9.7+seed%7))*u*ch,N=18,P2=[];
  for(let i=0;i<=N;i++){
    const f=i/N,jit=(cnVN(f*5.5+t*3.2,seed%997*.01,seed)-.5)*wid*2.6*Math.sin(Math.PI*f);
    P2.push([p.x+(q.x-p.x)*f+jit,p.y+(q.y-p.y)*f]);
  }
  const stroke=(w,c,al)=>{g.lineWidth=w;g.strokeStyle=cnA(c,al);g.beginPath();g.moveTo(P2[0][0],P2[0][1]);for(let i=1;i<P2.length;i++)g.lineTo(P2[i][0],P2[i][1]);g.stroke();};
  g.save();g.globalCompositeOperation='lighter';g.lineCap='round';g.lineJoin='round';
  stroke(wid*5.5,col,.13*rm);stroke(wid*2,col,.42*rm);stroke(Math.max(.6,wid*.5),'#ffffff',.9*rm);
  cnGlow(g,p.x,p.y,H*.06*(.5+.5*ch),col,.8*ch,{core:.6});
  cnGlow(g,q.x,q.y,H*.14,col,.7*ch,{core:.8,squash:.45});
  const ph=cnFrac(t/.9),rr=H*(.03+.22*cnEase('out',ph));
  g.lineWidth=(2.5-1.5*ph)*u+.5;g.strokeStyle=cnA(col,.7*(1-ph)*rm);g.beginPath();g.ellipse(q.x,q.y,rr,rr*.28,0,0,TAU);g.stroke();
  for(let i=0;i<cnN(14,S);i++){
    const sd=seed+i*13,L=.5+.4*cnR(sd,i,3),tau=cnPhase(t,L,i,sd)*L,ang=-Math.PI/2+(cnR(sd,i,1)-.5)*2.4,v=H*(.25+.5*cnR(sd,i,2)),ph2=tau/L;
    const x=q.x+Math.cos(ang)*v*tau,y=q.y+Math.sin(ang)*v*tau+.5*H*1.6*tau*tau;
    g.fillStyle=cnA(col,.9*Math.pow(1-ph2,1.5)*rm);g.fillRect(x-1.2*u,y-1.2*u,2.4*u,2.4*u);
  }
  g.restore();
  g.globalAlpha=S.a;
};

/* explosion: a dusty smoke bank on the ground, a dark plume rising BEHIND the fire, a fireball built from five additive lumps (white-hot core,
   yellow-orange body) that cools to red as it fades, a flash, a thin shockwave on the ground plane and debris on ballistic arcs.
   Timed by the entry's own window t0..t1 (clamped to 0.7..2.6 s). */
PF.explosion=(g,W,H,e,t,seed,S)=>{
  const u=S.u,p=cfxAt(e,S,W,H,.5,.7),col=e.col||'#ffa860',cap=S.rm?.15:1,T=e.t1!=null?Math.max(.7,Math.min(2.6,e.t1-(e.t0||0))):1.8,k=cnC01(t/T);
  const R=H*(.05+.3*cnEase('out',cnC01(k/.45))),hot=(1-cnSS(.25,.75,k))*(S.rm?.5:1),cool=cnSS(.3,.85,k),env=cnSS(0,S.rm?.2:.05,k)*(1-cnSS(.8,1,k));   // reduced motion: the fireball swells in over 0.4 s instead of popping, and its white-hot phase is held to half strength
  // 1. a dusty bank of smoke along the ground, behind everything
  const bank=cnSS(.08,.4,k)*(1-cnSS(.55,1,k));
  if(bank>0){g.save();g.translate(p.x,p.y+H*.02);g.scale(1,.3);cfxAl(g,S,.45*bank);cfxPut(g,cfxSpr('puff','#1b1e26',1),0,0,R*1.4);g.restore();}
  // 2. the plume: dark volumes that rise and spread, drawn BEFORE the fire so the fireball is never masked
  for(let i=0;i<cnN(6,S);i++){
    const sd=seed+i*37,d=.26+.22*cnR(sd,i,1),s=cnC01((k-d)/.62);if(s<=0)continue;
    const x=p.x+(cnR(sd,i,2)-.5)*R*(1+1.8*s),y=p.y-R*.1-s*H*(.22+.24*cnR(sd,i,4)),r=H*(.05+.1*s)*(.8+.4*cnR(sd,i,5));
    cfxPuff(g,S,i%4,x,y,r,.62*Math.pow(1-s,.7)*cnC01(s*5),'#1b1e26');
  }
  g.globalAlpha=S.a;
  // 3. the fireball: additive lumps (white-hot core, yellow-orange body), a red bloom, and a deep red glow while it cools
  if(R>0&&env>0){
    g.save();g.globalCompositeOperation=S.rm?'source-over':'lighter';                        // reduced motion: no additive stacking, so the lumps cannot burn out to white
    const fire=cfxSpr('glow','#ffb860'),red=cfxSpr('halo','#c8481e'),core=cfxSpr('core','#fff2d6');
    g.beginPath();                                                                           // the body: a turbulent disc, its edge shaped by noise that evolves as it swells
    for(let i=0;i<=36;i++){
      const a=i/36*TAU,rn=1+.2*(cnVN(Math.cos(a)*1.6+k*2.4,Math.sin(a)*1.6+1.3,seed)-.5)*2+.08*Math.sin(a*3+k*5),x=p.x+Math.cos(a)*R*rn,y=p.y+Math.sin(a)*R*rn*.92-R*.05*k;
      if(i)g.lineTo(x,y);else g.moveTo(x,y);
    }
    g.closePath();g.globalAlpha=S.a*.9*env*hot;
    g.fillStyle=cnRG(g,p.x,p.y,0,R*1.25,[[0,'#fffbee'],[.22,'#ffe08a'],[.5,'#ff8a2e'],[.72,'rgba(180,58,14,.55)'],[.9,'rgba(120,20,6,.18)'],[1,'rgba(60,8,2,0)']]);g.fill();
    g.globalAlpha=S.a;
    for(let i=0;i<4;i++){
      const sd=seed+i*19,ang=i/4*TAU+cnR(sd,i,1)*1.2,off=R*(.25+.25*cnR(sd,i,2))*(.4+.6*k),
        bx=p.x+Math.cos(ang)*off,by=p.y+Math.sin(ang)*off*.6-R*.12*k,br=R*(.4+.22*cnR(sd,i,3));
      cfxAl(g,S,.8*env*hot);cfxPut(g,fire,bx,by,br);
    }
    cfxAl(g,S,.9*env*hot*(S.rm?.5:1));cfxPut(g,core,p.x,p.y,R*.42);
    cfxAl(g,S,.6*env*cool);cfxPut(g,red,p.x,p.y-R*.1,R*.9);
    g.restore();
  }
  g.globalAlpha=S.a;
  // 4. flash: a short white-hot point of light (capped under reduced motion)
  const fl=cnC01(1-k/.2);
  if(fl>0)cnGlow(g,p.x,p.y,H*(.2+.12*fl),'#fff6e0',Math.min(cap,.9*fl),{core:1});
  // 5. the shockwave on the ground plane: a soft band with a thin hot edge
  const rs=H*(.05+.6*cnEase('out',k)),ra=Math.pow(1-k,1.4);
  if(ra>0){
    g.save();g.globalCompositeOperation='lighter';g.beginPath();g.ellipse(p.x,p.y,rs,rs*.26,0,0,TAU);
    g.lineWidth=(10*(1-k)+1)*u;g.strokeStyle=cnA(col,.14*ra);g.stroke();
    g.lineWidth=(1.6*(1-k)+.5)*u;g.strokeStyle=cnA('#ffe6c4',.7*ra);g.stroke();
    g.restore();
  }
  // 6. debris on ballistic arcs (time scaled to the default 1.8 s so long windows do not send it off-screen)
  const tt=t*1.8/T,dA=S.rm?.45:.9;                                                              // reduced motion: source-over at half strength (streaks leave the origin together and would burn out)
  g.save();g.globalCompositeOperation=S.rm?'source-over':'lighter';g.lineCap='round';
  for(let i=0;i<cnN(22,S);i++){
    const sd=seed+i*53,ang=-Math.PI/2+(cnR(sd,i,1)-.5)*2.8,v=H*(.5+.9*cnR(sd,i,2)),life=1.8*(.7+.5*cnR(sd,i,3));
    if(tt<0||tt>life)continue;
    const tb=Math.max(0,tt-.05),x=p.x+Math.cos(ang)*v*tt,y=p.y+Math.sin(ang)*v*tt+.5*H*1.9*tt*tt,x0=p.x+Math.cos(ang)*v*tb,y0=p.y+Math.sin(ang)*v*tb+.5*H*1.9*tb*tb;
    g.strokeStyle=cnA('#ffbe70',dA*(1-tt/life)*(1-cnSS(.6,1,k)));g.lineWidth=(1.4+1.6*cnR(sd,i,4))*u;
    g.beginPath();g.moveTo(x0,y0);g.lineTo(x,y);g.stroke();
  }
  g.restore();
  g.globalAlpha=S.a;
};

/* flare: a lens flare. A source bloom, an anamorphic streak across the frame, six lens ghosts on the axis through the frame centre, a
   faint halo ring and a six-ray starburst. The flare blooms in over 0.3 s and shimmers slightly. */
PF.flare=(g,W,H,e,t,seed,S)=>{
  const u=S.u,p=cfxAt(e,S,W,H,.22,.32),c0=e.col||'#ffe2b0',rr=e.r||1,C={x:W*.5,y:H*.5},rm=S.rm?.7:1;
  const I=cnEase('out',cnC01(t/.32))*(.9+.1*cnVN(t*2.7,1.9,seed)),dx=C.x-p.x,dy=C.y-p.y;
  const GH=[[.5,.03,'#7ae8ff',.16],[.92,.075,'#ffb070',.09],[1.28,.022,'#c8a0ff',.16],[1.6,.1,'#8affa6',.05],[1.86,.05,'#ffd27a',.11],[2.25,.13,'#7ab8ff',.035]];
  g.save();g.globalCompositeOperation='lighter';
  for(const q of GH){g.globalAlpha=q[3]*I*rm*S.a;cfxPut(g,cfxSpr('ghost',q[2]),p.x+dx*q[0],p.y+dy*q[0],q[1]*H*rr);}
  g.globalAlpha=.16*I*rm*S.a;g.fillStyle=cnRG(g,p.x,p.y,H*.12,H*.26,[[0,cnA(c0,0)],[.5,cnA(c0,.6)],[.85,cnA('#9ad0ff',.25)],[1,cnA('#9ad0ff',0)]]);
  g.fillRect(p.x-H*.26,p.y-H*.26,H*.52,H*.52);
  g.globalAlpha=S.a;cnGlow(g,p.x,p.y,H*.2*rr,c0,.9*I*rm,{core:.85});
  g.fillStyle=cnLG(g,p.x-W*.5,0,p.x+W*.5,0,[[0,cnA(c0,0)],[.5,cnA(c0,.22*I*rm)],[.56,cnA(c0,.22*I*rm)],[1,cnA(c0,0)]]);g.fillRect(0,p.y-u*1.5,W,u*3);
  g.fillStyle=cnLG(g,p.x-W*.5,0,p.x+W*.5,0,[[0,cnA('#ffffff',0)],[.5,cnA('#ffffff',.5*I*rm)],[1,cnA('#ffffff',0)]]);g.fillRect(0,p.y-u*.45,W,u*.9);
  g.lineCap='round';
  for(let i=0;i<6;i++){
    const a=.5+i*Math.PI/6+.08*Math.sin(t*.5+i),L=H*(.2+.1*cnR(seed,i,2))*rr,ex=p.x+Math.cos(a)*L,ey=p.y+Math.sin(a)*L;
    g.strokeStyle=cnLG(g,p.x,p.y,ex,ey,[[0,cnA('#ffffff',.5*I*rm)],[1,cnA(c0,0)]]);g.lineWidth=1.2*u;g.beginPath();g.moveTo(p.x,p.y);g.lineTo(ex,ey);g.stroke();
  }
  g.restore();
  g.globalAlpha=S.a;
};

/* rings: three concentric shockwaves on the ground plane (squashed ellipses) racing out and fading, each with a bright leading edge and a
   soft wake; the source flares on every pulse. */
PF.rings=(g,W,H,e,t,seed,S)=>{
  const u=S.u,p=cfxAt(e,S,W,H,.5,.62),col=e.col||cfxFac(S,'light','#9ad8ff'),per=(2.6/(e.spd||1))*(S.rm?1.9:1),N=3;
  g.save();g.globalCompositeOperation='lighter';
  for(let i=0;i<N;i++){
    const ph=cnFrac(t/per+i/N),R=H*(.04+.66*cnEase('out',ph)),A=Math.pow(1-ph,1.5)*cnSS(0,.05,ph)*(S.rm?.6:1);
    if(A<=.003)continue;
    g.beginPath();g.ellipse(p.x,p.y,R,R*.3,0,0,TAU);
    g.strokeStyle=cnA(col,.2*A);g.lineWidth=(7*(1-ph)+1)*u;g.stroke();
    g.strokeStyle=cnA(col,.9*A);g.lineWidth=(1+1.4*(1-ph))*u;g.stroke();
  }
  g.restore();
  const pk=cnFrac(t/per);
  cnGlow(g,p.x,p.y,H*.09*(1+.5*(1-pk)),col,.5*(1-pk)*(S.rm?.7:1));
  g.globalAlpha=S.a;
};

/* scan: a holographic projection: a fine raster, a bright sweep band with a soft trailing edge and a hard leading line, HUD corner brackets and
   a few flickering data blocks (never under reduced motion). */
PF.scan=(g,W,H,e,t,seed,S)=>{
  const u=S.u,col=e.col||cfxFac(S,'light','#7ae8ff'),per=3.4/(e.spd||1);
  g.save();
  g.strokeStyle=cnA(col,.085);g.lineWidth=Math.max(1,u*.9);g.beginPath();
  const st=Math.max(2,Math.round(3.6*u));
  for(let y=0;y<H;y+=st){g.moveTo(0,y+.5);g.lineTo(W,y+.5);}
  g.stroke();
  const yb=cnFrac(t/per)*H*1.12-H*.06,bh=H*.12;
  g.fillStyle=cnLG(g,0,yb-bh,0,yb+bh*.12,[[0,cnA(col,0)],[.75,cnA(col,.12)],[.97,cnA(col,.34)],[1,cnA('#ffffff',.55)]]);
  g.fillRect(0,yb-bh,W,bh*1.12);
  g.fillStyle=cnA('#ffffff',.7);g.fillRect(0,yb,W,Math.max(1,u*1.3));
  const m=H*.045,L=H*.09;g.strokeStyle=cnA(col,.6);g.lineWidth=Math.max(1,u*1.6);g.beginPath();
  for(const c of[[m,m,1,1],[W-m,m,-1,1],[m,H-m,1,-1],[W-m,H-m,-1,-1]]){g.moveTo(c[0]+c[2]*L,c[1]);g.lineTo(c[0],c[1]);g.lineTo(c[0],c[1]+c[3]*L);}
  g.stroke();
  if(!S.rm){
    const f=Math.floor(t*12);
    for(let i=0;i<cnN(6,S);i++){
      if(cnHash(seed,f,i)>.45)continue;
      const x=cnHash(seed,f,i+9)*W,y=yb+(cnHash(seed,f,i+19)-.5)*bh*1.5;
      g.fillStyle=cnA(col,.22);g.fillRect(x,y,W*(.01+.04*cnHash(seed,f,i+29)),Math.max(1,u*2.2));
    }
  }
  g.restore();
  g.globalAlpha=S.a;
};

/* glitch: bursts of broken picture: thin slices of the frame shifted sideways (from one snapshot, so the shifts do not smear into each
   other), tinted slivers and a faint chromatic halo. Draws nothing under reduced motion (no strobing). */
PF.glitch=(g,W,H,e,t,seed,S)=>{
  if(S.rm)return;
  const b=cnVN(t*1.9,.5,seed+5),amp=cnSS(.58,.8,b),f=Math.floor(t*14),u=S.u;
  g.save();g.setTransform(1,0,0,1,0,0);g.globalAlpha=S.a;
  // tear lines: a few thin cyan and magenta slivers all the time, more of them inside a burst
  g.globalCompositeOperation='lighter';
  for(let i=0;i<cnN(2+Math.round(amp*4),S);i++){
    const y=cnHash(seed,f,i+90)*H,x0=cnHash(seed,f,i+100)*W*.7,w=W*(.1+.3*cnHash(seed,f,i+110));
    g.fillStyle=cnHash(seed,f,i+120)<.5?'rgba(40,255,220,'+(.14+.2*amp).toFixed(3)+')':'rgba(255,60,120,'+(.12+.18*amp).toFixed(3)+')';
    g.fillRect(x0,y,w,Math.max(1,u*(1+amp)));
  }
  g.globalCompositeOperation='source-over';
  if(b>=.58){                                                                                // a burst: displaced slices of the picture as it was (one snapshot)
    const N=cnN(10,S),snap=cnScratch('cfxsn',W,H),sg=snap.getContext('2d');
    sg.setTransform(1,0,0,1,0,0);sg.globalAlpha=1;sg.globalCompositeOperation='copy';sg.drawImage(g.canvas,0,0,W,H);sg.globalCompositeOperation='source-over';
    for(let i=0;i<N;i++){
      if(cnHash(seed,f,i)>amp)continue;
      const y=cnHash(seed,f,i+10)*H,h=H*(.006+.04*cnHash(seed,f,i+20)),dx=(cnHash(seed,f,i+30)-.5)*W*.1*amp;
      g.drawImage(snap,0,y,W,h,dx,y,W,h);
      const tx=cnHash(seed,f,i+60)*W*.6,tw=W*(.12+.25*cnHash(seed,f,i+65));
      g.globalCompositeOperation='lighter';g.fillStyle=cnHash(seed,f,i+40)<.5?'rgba(255,40,90,.07)':'rgba(40,255,220,.06)';g.fillRect(tx+dx,y,tw,h);g.globalCompositeOperation='source-over';
    }
    g.globalCompositeOperation='lighter';g.globalAlpha=S.a*.1*amp;g.drawImage(snap,2.5*u*amp,0,W,H);
    g.globalCompositeOperation='source-over';g.globalAlpha=S.a;
  }
  g.restore();
};

/* shake: engine-only. The camera offset is computed by the engine (cnShake in 66_cine.js: a closed-form, seeded value-noise offset with a
   0.05 s attack and a (1-u)^0.55 decay, off under reduced motion). The registry entry must stay empty: it draws nothing. */
PF.shake=function(){};

/* vignette: an elliptical falloff matched to the frame's aspect, tinted by e.col. The overlay is baked once per size and colour. */
PF.vignette=(g,W,H,e,t,seed,S)=>{
  const c=e.col||'#000000';
  const sp=cfxCache('vignette|'+W+'x'+H+'|'+c,W,H,(q,w,h)=>{
    q.setTransform(w/2,0,0,h/2,w/2,h/2);
    q.fillStyle=cnRG(q,0,0,0,1.45,[[0,cnA(c,0)],[.5,cnA(c,0)],[.8,cnA(c,.3)],[1.02,cnA(c,.62)],[1.42,cnA(c,.97)]]);
    q.fillRect(-2,-2,4,4);
  },true);
  g.save();g.setTransform(1,0,0,1,0,0);g.globalCompositeOperation='source-over';g.globalAlpha=cnC01(S.a);g.drawImage(sp,0,0,W,H);g.restore();
};

/* heat: heat shimmer above the ground: thin horizontal slices of the lower frame shifted by a travelling wave (stronger near the ground),
   over a warm haze. One snapshot of the rows is taken, then the slices are drawn from it. No jitter under reduced motion. */
PF.heat=(g,W,H,e,t,seed,S)=>{
  const u=S.u,A=S.a,y0=H*(e.y==null?.7:e.y),hh=Math.floor(H-y0);
  if(hh<=0)return;
  g.save();g.globalCompositeOperation='lighter';
  g.fillStyle=cnLG(g,0,y0,0,H,[[0,cnA('#ff9a5a',0)],[.6,cnA('#ff8a4a',.05)],[1,cnA('#ffa060',.12)]]);
  g.globalAlpha=A;g.fillRect(0,y0,W,hh);
  g.restore();
  if(S.rm)return;
  const sn=cnScratch('cfxhs',W,hh),sg=sn.getContext('2d');
  sg.setTransform(1,0,0,1,0,0);sg.globalAlpha=1;sg.globalCompositeOperation='copy';sg.drawImage(g.canvas,0,y0,W,hh,0,0,W,hh);sg.globalCompositeOperation='source-over';
  const step=Math.max(2,Math.round((S.tier==='battery'?4.5:3)*u)),n=Math.ceil(hh/step);
  g.save();g.setTransform(1,0,0,1,0,0);g.globalCompositeOperation='source-over';g.globalAlpha=1;
  for(let i=0;i<n;i++){
    const yy=i*step,h=Math.min(step,hh-yy),v=(i+1)/n,amp=(.5+.9*v*v)*(1.7*u+1)*A;
    const dx=Math.sin(yy*.08-t*5.4+cnVN(i*.21,t*1.3,seed)*5)*amp+(cnVN(i*.13+t*2.6,.4,seed+3)-.5)*amp;
    g.drawImage(sn,0,yy,W,h,dx,y0+yy,W,h);
  }
  g.restore();
};

/* pulse: a heartbeat: a sharp 'lub' and a softer 'dub' per second and a bit: a gentle whole-frame lift, a glow at the source and an echo ring
   per beat. Reduced motion halves the amplitude and doubles the period. */
PF.pulse=(g,W,H,e,t,seed,S)=>{
  const u=S.u,p=cfxAt(e,S,W,H,.5,.5),col=e.col||cfxFac(S,'base','#7ac8ff'),per=(1.25/(e.spd||1))*(S.rm?2:1),ph=cnFrac(t/per);
  const beat=Math.exp(-Math.pow((ph-.06)/.055,2))+.55*Math.exp(-Math.pow((ph-.3)/.07,2)),amp=S.rm?.5:1;
  g.save();g.globalCompositeOperation='lighter';
  g.fillStyle=cnA(col,.05*beat*amp);g.fillRect(0,0,W,H);
  cnGlow(g,p.x,p.y,H*(.2+.12*beat),col,(.24+.36*beat)*amp,{core:.5*beat});
  const rk=cnC01((ph-.06)/.6);
  g.lineWidth=(1.5+3*(1-rk))*u;g.strokeStyle=cnA(col,.38*amp*(1-rk)*(1-rk));g.beginPath();g.ellipse(p.x,p.y,H*(.04+.42*rk),H*(.04+.42*rk)*.5,0,0,TAU);g.stroke();
  g.restore();
  g.globalAlpha=S.a;
};

/* sparks: a welding burst: two bursts of ballistic streaks (a fan of 34, then 16) with gravity and short trails, each with a hot head early on. */
PF.sparks=(g,W,H,e,t,seed,S)=>{
  const u=S.u,p=cfxAt(e,S,W,H,.5,.6),col=e.col||'#ffc27a',hot='#fff4d8';
  g.save();g.globalCompositeOperation='lighter';g.lineCap='round';
  for(const b of[{t:0,n:34,v:1,s:0},{t:.42,n:16,v:.7,s:101}]){
    const tau0=t-b.t;if(tau0<0)continue;
    for(let i=0;i<cnN(b.n,S);i++){
      const sd=seed+b.s+i*29,L=.7+.6*cnR(sd,i,3);if(tau0>L)continue;
      const ang=-Math.PI/2+(cnR(sd,i,1)-.5)*2.7,v=H*(.5+.9*cnR(sd,i,2))*b.v,gy=H*1.7;
      const X=s=>p.x+Math.cos(ang)*v*s,Y=s=>p.y+Math.sin(ang)*v*s+.5*gy*s*s,al=Math.pow(1-tau0/L,1.25);
      g.strokeStyle=cnA(col,al);g.lineWidth=(1.1+1.3*cnR(sd,i,4))*u;
      g.beginPath();g.moveTo(X(Math.max(0,tau0-.028)),Y(Math.max(0,tau0-.028)));g.lineTo(X(tau0),Y(tau0));g.stroke();
      if(tau0<.2){cfxAl(g,S,(1-tau0/.2)*.9);cfxPut(g,cfxSpr('core',hot),X(tau0),Y(tau0),(2.6-1.6*tau0/.2)*u);g.globalAlpha=S.a;}
    }
  }
  g.restore();
  g.globalAlpha=S.a;
};

/* smoke: a column of dark, cool puffs rising from the source, each on its own loop (grow, drift, thin out) and lit from above; the sway follows the wind. */
PF.smoke=(g,W,H,e,t,seed,S)=>{
  const u=S.u,p=cfxAt(e,S,W,H,.5,.8),body=e.col||'#2a303c',rise=e.r||1;
  for(let i=0;i<cnN(8,S);i++){
    const sd=seed+i*67,per=5.5+3*cnR(sd,i,3),ph=cnFrac(t/per+cnR(sd,i,9));
    const sway=Math.sin(t*(.35+.2*cnR(sd,i,4))+i*1.7)*W*.018*(.4+ph);
    const x=p.x+(cnR(sd,i,1)-.5)*W*.1+sway,y=p.y-ph*H*.62*rise,r=H*(.06+.16*ph)*(.8+.4*cnR(sd,i,5));
    cfxPuff(g,S,i%4,x,y,r,.5*Math.sin(Math.PI*ph)*(.8+.2*ph),body);
  }
  g.globalAlpha=S.a;
};

/* comets: streaks across the sky: a tapered tail with a gradient, a white-hot head with a coloured halo and a few sparkles along the tail. */
PF.comets=(g,W,H,e,t,seed,S)=>{
  const u=S.u,col=e.col||'#e4f2ff',dirA=e.dir==null?.46:e.dir,ux=-Math.cos(dirA),uy=Math.sin(dirA),dl=Math.hypot(ux,uy),vx=ux/dl,vy=uy/dl;
  for(let i=0;i<cnN(4,S);i++){
    const sd=seed+i*211,per=2.6+.8*i+cnR(sd,i,3)*.8,ph=cnFrac(t/per+cnR(sd,i,9)),al=Math.pow(Math.sin(Math.PI*ph),1.4);
    if(al<=.01)continue;
    const L=W*1.3,sx=W*(1.1-.22*cnR(sd,i,1)),sy=H*(-.1+.3*cnR(sd,i,2)),hx=sx+vx*ph*L,hy=sy+vy*ph*L,Lt=W*(.08+.08*cnR(sd,i,4)),ex=hx-vx*Lt,ey=hy-vy*Lt,w=2.4*u*(1+cnR(sd,i,6));
    g.save();g.globalCompositeOperation='lighter';
    g.fillStyle=cnLG(g,hx,hy,ex,ey,[[0,cnA('#ffffff',.85*al)],[.25,cnA(col,.4*al)],[1,cnA(col,0)]]);
    g.beginPath();g.moveTo(hx+vy*w,hy-vx*w);g.lineTo(ex,ey);g.lineTo(hx-vy*w,hy+vx*w);g.closePath();g.fill();
    cfxAl(g,S,al);cfxPut(g,cfxSpr('glow',col),hx,hy,H*.04+5*u);
    for(let j=1;j<=4;j++){const f=j/5,jx=(cnR(sd,j,7)-.5)*w*2.2;cfxAl(g,S,al*(1-f)*.8);cfxPut(g,cfxSpr('core',col),hx-vx*Lt*f+vy*jx,hy-vy*Lt*f-vx*jx,1.6*u*(1-f*.5));}
    g.restore();
  }
  g.globalAlpha=S.a;
};

/* ============================================================================================================
   TRANSITIONS (k 0..1 linear; dir 'in' = the new scene is already in g, S.from holds the previous frame; dir 'out' = g holds this scene)
   ============================================================================================================ */
const PT=CINE_PAINT.trans;
PT.cut=()=>{};
/* fade: from / to black with an in-out ease */
PT.fade=(g,W,H,k,dir,seed,S)=>{const e=cnEase('inout',k);g.globalAlpha=dir==='in'?1-e:e;g.fillStyle='#000';g.fillRect(0,0,W,H);g.globalAlpha=1;};
/* flash: from / to white with a bright centre, the light falls off to a faint blue-white at the edges */
PT.flash=(g,W,H,k,dir,seed,S)=>{
  const a=dir==='in'?Math.pow(1-k,1.7):Math.pow(k,1.7);if(a<=0)return;
  g.fillStyle=cnRG(g,W*.5,H*.5,0,Math.hypot(W,H)*.6,[[0,'rgba(255,255,255,1)'],[.55,'rgba(255,255,255,1)'],[1,'rgba(214,232,255,1)']]);
  g.globalAlpha=a;g.fillRect(0,0,W,H);g.globalAlpha=1;
};
/* wipe: a directional wipe (one of four directions by seed) with a feathered edge and a light seam. The old picture (in) or black (out) is
   feathered over the moving edge; the seam is a thin additive line on the edge. */
PT.wipe=(g,W,H,k,dir,seed,S)=>{
  const d=(cnH32(seed,3,0,0)>>>4)&3,vert=d>1,rev=(d&1)===1,L=vert?H:W,F=Math.max(10,L*.07),e=cnEase('inout',k),u=H/540;
  const ed=e*(L+F)-F/2;
  const G2=(q,v0,v1,a0,a1)=>{const s=[[0,'rgba(0,0,0,'+a0+')'],[1,'rgba(0,0,0,'+a1+')']];return vert?cnLG(q,0,v0,0,v1,s):cnLG(q,v0,0,v1,0,s);};
  if(dir==='in'){
    if(!S.from)return;
    const wp=cnScratch('cfxwp',W,H),wq=wp.getContext('2d');
    wq.setTransform(1,0,0,1,0,0);wq.globalAlpha=1;wq.globalCompositeOperation='copy';wq.drawImage(S.from,0,0,W,H);
    wq.globalCompositeOperation='destination-in';wq.fillStyle=rev?G2(wq,L-ed-F/2,L-ed+F/2,1,0):G2(wq,ed-F/2,ed+F/2,0,1);wq.fillRect(0,0,W,H);
    wq.globalCompositeOperation='source-over';
    g.save();g.setTransform(1,0,0,1,0,0);g.globalAlpha=1;g.drawImage(wp,0,0,W,H);g.restore();
  }else{
    g.save();g.setTransform(1,0,0,1,0,0);g.globalAlpha=1;
    g.fillStyle=rev?G2(g,L-ed-F/2,L-ed+F/2,0,1):G2(g,ed-F/2,ed+F/2,1,0);g.fillRect(0,0,W,H);g.restore();
  }
  const seam=rev?L-ed:ed,sa=.5*Math.sin(Math.PI*cnC01(k));
  if(sa>0){g.save();g.setTransform(1,0,0,1,0,0);g.globalAlpha=1;g.globalCompositeOperation='lighter';g.fillStyle=cnA('#cfe8ff',sa);
    if(vert)g.fillRect(0,seam-u,W,2*u);else g.fillRect(seam-u,0,2*u,H);g.restore();}
};
/* glitch: the old picture (in) or black (out) breaks into displaced slices, with a veil that takes over at the ends */
PT.glitch=(g,W,H,k,dir,seed,S)=>{
  const u=H/540,f=Math.floor(k*16),amt=dir==='in'?1-k:k,old=dir==='in'?S.from:null;
  g.save();g.setTransform(1,0,0,1,0,0);g.globalAlpha=1;
  if(old){g.globalAlpha=cnSS(.45,1,amt);g.drawImage(old,0,0,W,H);}
  else{const bl=cnSS(.55,1,amt);if(bl>0){g.globalAlpha=bl;g.fillStyle='#000';g.fillRect(0,0,W,H);}}
  g.globalAlpha=1;
  for(let i=0;i<cnN(20,S);i++){
    if(cnHash(seed,f,i)>amt*1.2)continue;
    const y=cnHash(seed,f,i+30)*H,h=H*(.01+.09*cnHash(seed,f,i+50)),dx=(cnHash(seed,f,i+70)-.5)*W*.2*(.3+amt);
    if(old)g.drawImage(old,0,y,W,h,dx,y,W,h);else{g.fillStyle='#000';g.fillRect(0,y,W,h);}
  }
  for(let i=0;i<3;i++){
    if(cnHash(seed,f,i+90)>amt)continue;
    g.fillStyle=cnHash(seed,f,i+99)<.5?'rgba(40,255,220,.35)':'rgba(255,60,120,.3)';
    g.fillRect(0,cnHash(seed,f,i+95)*H,W,Math.max(1,u*2));
  }
  g.restore();
};
/* iris: a circular reveal (in: the new scene opens from the centre) or close (out: black closes in), with a light rim on the iris edge */
PT.iris=(g,W,H,k,dir,seed,S)=>{
  const e=cnEase('inout',k),R=Math.hypot(W,H)/2*1.02,cx=W/2,cy=H/2,u=H/540,rr=dir==='in'?R*e:R*(1-e);
  g.save();g.setTransform(1,0,0,1,0,0);g.globalAlpha=1;
  g.beginPath();g.rect(0,0,W,H);g.arc(cx,cy,rr,0,TAU,true);g.clip('evenodd');
  if(dir==='in'){if(S.from)g.drawImage(S.from,0,0,W,H);}else{g.fillStyle='#000';g.fillRect(0,0,W,H);}
  g.restore();
  const ra=Math.sin(Math.PI*cnC01(k))*.9;
  if(ra>0&&rr>0){
    g.save();g.setTransform(1,0,0,1,0,0);g.globalAlpha=1;g.globalCompositeOperation='lighter';
    g.beginPath();g.arc(cx,cy,rr,0,TAU);g.lineWidth=9*u;g.strokeStyle=cnA('#9fd8ff',.16*ra);g.stroke();
    g.lineWidth=1.6*u;g.strokeStyle=cnA('#e8f6ff',.8*ra);g.stroke();
    g.restore();
  }
};

/* ============================================================================================================
   COLOUR GRADE (per scene, from the engine's G: bg kind, time of day, faction, cues)
   ============================================================================================================ */
/* the shadow lift and the highlight cast when the scene does not give its own colours, per time of day */
const CFX_TOD_LIFT={day:'#1f3a5c',dusk:'#3a1c36',night:'#0c1c48',dawn:'#2e2140',space:'#0a1638',interior:'#1a1620',void:'#0c1024'};
const CFX_TOD_GAIN={day:'#ffffff',dusk:'#ffd8b0',night:'#d4e4ff',dawn:'#ffe0d0',space:'#e8f0ff',interior:'#fff4e8',void:'#e8ecff'};
/* colour c mixed toward white by a (rgb 0..255) */
const cfxMixW=(c,a)=>{const q=cnCol(c);return[255+(q[0]-255)*a,255+(q[1]-255)*a,255+(q[2]-255)*a];};
const cfxMul=(p,q)=>[p[0]*q[0]/255,p[1]*q[1]/255,p[2]*q[2]/255];
CINE_PAINT.grade=function(g,W,H,G,t,seed,S){
  const tod=(S&&S.tod)||'day';
  g.save();g.setTransform(1,0,0,1,0,0);g.globalAlpha=1;g.globalCompositeOperation='source-over';
  if(G.sat!=null&&G.sat<.97){                                                                    // 1. desaturation (tragedy, dread, betrayal)
    g.globalCompositeOperation='saturation';g.globalAlpha=1-cnC01(G.sat);g.fillStyle='#808080';g.fillRect(0,0,W,H);
    g.globalAlpha=1;g.globalCompositeOperation='source-over';
  }
  const lc=G.top||CFX_TOD_LIFT[tod]||null,la=G.top?cnC01(G.splitA||0)*.5:.18;              // 2. shadows lift toward the shadow colour (screen)
  if(lc&&la>0){
    const L=cfxCache('grade-lift|'+W+'x'+H+'|'+lc+'|'+la.toFixed(3),W,H,(q,w,h)=>{q.fillStyle=cnA(lc,la);q.fillRect(0,0,w,h);},true);
    g.globalCompositeOperation='screen';g.drawImage(L,0,0,W,H);
  }
  let gc=G.bot&&G.splitA>0?cfxMixW(G.bot,cnC01(G.splitA)):cfxMixW(CFX_TOD_GAIN[tod]||'#ffffff',1);   // 3. highlights are cast toward the highlight colour and the tint multiplies over everything (multiply)
  if(G.tint&&G.tintA>0)gc=cfxMul(gc,cfxMixW(G.tint,cnC01(G.tintA)));
  if(gc[0]<254||gc[1]<254||gc[2]<254){
    const key='grade-gain|'+W+'x'+H+'|'+gc.map(v=>Math.round(v)).join(',');
    const Gn=cfxCache(key,W,H,(q,w,h)=>{q.fillStyle='rgb('+Math.round(gc[0])+','+Math.round(gc[1])+','+Math.round(gc[2])+')';q.fillRect(0,0,w,h);},true);
    g.globalCompositeOperation='multiply';g.drawImage(Gn,0,0,W,H);
  }
  g.restore();
};

/* ============================================================================================================
   TITLE CARD (drawn by the engine's cnTitle through CINE_PAINT.title; see the hook note in the report)
   Big letter-spaced caps with an engraved look (dark outline, chrome-like vertical gradient with a hard horizon line, drop shadow, accent
   glow), a glint that sweeps across once, an optional subtitle flanked by gold rules. System font stack only (CN_FONT). Sizes scale with
   the picture window: from a 320 px phone to 4K.
   ============================================================================================================ */
/* width of str in em (per-character sum + tracking between letters) */
function cfxMeasure(){return cnScratch('cfxmeas',4,4).getContext('2d');}                   // a 2D context used only to measure text
function cfxEm(q,str,track){q.font='600 100px '+CN_FONT;const ch=[...str];let w=0;for(const c of ch)w+=q.measureText(c).width;return w/100+track*Math.max(0,ch.length-1);}
/* the largest size at which every line fits maxW (and the cap fsMax) */
function cfxFit(q,lines,maxW,fsMax,track){let fs=fsMax;for(const s of lines){const em=cfxEm(q,s,track);if(em>0)fs=Math.min(fs,maxW/em);}return Math.max(8,fs);}
/* letter-spaced line on q (font and baseline already set); returns the drawn width */
function cfxTrack(q,str,cx,y,fs,track,fill,stroke,lw){
  const ch=[...str],wd=ch.map(c=>q.measureText(c).width),tot=wd.reduce((a,b)=>a+b,0)+track*fs*Math.max(0,ch.length-1);
  let x=cx-tot/2;
  if(stroke){q.strokeStyle=stroke;q.lineWidth=lw;q.lineJoin='round';for(let i=0;i<ch.length;i++){q.strokeText(ch[i],x,y);x+=wd[i]+track*fs;}x=cx-tot/2;}
  if(fill){q.fillStyle=fill;for(let i=0;i<ch.length;i++){q.fillText(ch[i],x,y);x+=wd[i]+track*fs;}}
  return tot;
}
/* one title line: drawn into a transparent scratch (outline, chrome fill, glint), then composited with a drop shadow, an accent glow and the crisp copy */
function cfxTitleLine(g,str,cx,cy,fs,trk,a,sheen,acc){
  const pad=fs*.6,sw=Math.ceil(cfxEm(cfxMeasure(),str,trk)*fs+pad*2),sh=Math.ceil(fs*1.3+pad*2),sc=cnScratch('cfxti',sw,sh),q=sc.getContext('2d');
  q.setTransform(1,0,0,1,0,0);q.globalAlpha=1;q.globalCompositeOperation='source-over';q.clearRect(0,0,sw,sh);
  q.font='600 '+fs+'px '+CN_FONT;q.textBaseline='middle';q.textAlign='left';
  const mid=sh/2,fill=cnLG(q,0,mid-fs*.5,0,mid+fs*.5,[[0,'#ffffff'],[.46,'#eef6ff'],[.5,'#9cc0e6'],[1,'#5a84b4']]);
  cfxTrack(q,str,sw/2,mid,fs,trk,fill,'rgba(3,6,14,.92)',Math.max(1,fs*.055));
  if(sheen!=null){
    q.globalCompositeOperation='source-atop';const bx=sw*(-.2+1.4*sheen),bw=sw*.2;
    q.fillStyle=cnLG(q,bx,0,bx+bw,0,[[0,'rgba(255,255,255,0)'],[.5,'rgba(255,255,255,.9)'],[1,'rgba(255,255,255,0)']]);
    q.fillRect(0,0,sw,sh);q.globalCompositeOperation='source-over';
  }
  const dx=Math.round(cx-sw/2),dy=Math.round(cy-sh/2);
  g.save();g.setTransform(1,0,0,1,0,0);g.globalAlpha=a;
  g.shadowColor='rgba(0,0,0,.75)';g.shadowBlur=fs*.16;g.shadowOffsetY=fs*.07;g.drawImage(sc,dx,dy);
  g.shadowColor=cnA(acc,.55);g.shadowBlur=fs*.55;g.shadowOffsetY=0;g.drawImage(sc,dx,dy);
  g.shadowColor='rgba(0,0,0,0)';g.shadowBlur=0;g.shadowOffsetY=0;g.drawImage(sc,dx,dy);
  g.restore();
}
CINE_PAINT.title=function(g,win,ti,local,dur,seed,rm){
  if(!ti||!ti.text)return;
  const t0=ti.t0==null?0:+ti.t0,t1=ti.t1==null?dur:+ti.t1;
  if(!(local>=t0&&local<=t1))return;
  const fi=cnSS(0,.9,local-t0),fo=1-cnSS(0,.7,local-(t1-.7)),a=fi*fo;
  if(!(a>0))return;
  const u=Math.max(.5,win.h/540),maxW=win.w*.86,k=cnEase('out',(local-t0)/2.2),trk=rm?.2:lerp(.52,.2,k);
  const acc=cnTok('--line3','#9bd6ff'),gold=cnTok('--cry','#f6c04a');
  const txt=String(ti.text).toUpperCase(),subT=ti.sub?String(ti.sub).toUpperCase():'';
  const q=cfxMeasure();
  const fsMax=win.h*.165,words=txt.split(' ');
  let lines=[txt],fs=cfxFit(q,lines,maxW,fsMax,.52);
  if(fs<fsMax*.5&&words.length>1){                                                             // too long for one line: two balanced lines when that is larger
    let best=null;
    for(let i=1;i<words.length;i++){const A=words.slice(0,i).join(' '),B=words.slice(i).join(' '),f=cfxFit(q,[A,B],maxW,fsMax,.52);if(!best||f>best.f)best={f,lines:[A,B]};}
    if(best&&best.f>fs){lines=best.lines;fs=best.f;}
  }
  const lh=fs*1.08,fsS=subT?Math.max(8,Math.min(fs*.3,cfxFit(q,[subT],maxW,fs*.3,.34))):0;
  const block=lines.length*lh+(subT?fsS*2.3:0),cx=win.x+win.w/2,top=win.y+win.h*.5-block/2+(1-k)*fs*.3;
  g.save();g.setTransform(1,0,0,1,0,0);g.globalAlpha=1;g.globalCompositeOperation='source-over';
  g.beginPath();g.rect(win.x,win.y,win.w,win.h);g.clip();
  g.globalAlpha=a*.6;g.save();g.translate(cx,top+block/2);g.scale(win.w*.5,Math.max(block*.9,fs*1.6));
  g.fillStyle=cnRG(g,0,0,0,1,[[0,'rgba(2,4,10,.7)'],[.6,'rgba(2,4,10,.38)'],[1,'rgba(2,4,10,0)']]);g.fillRect(-1,-1,2,2);g.restore();
  for(let i=0;i<lines.length;i++){
    const sheen=!rm&&local-t0-1>=0&&local-t0-1<=1.6?(local-t0-1)/1.6:null;
    cfxTitleLine(g,lines[i],cx,top+lh*(i+.5),fs,trk,a,sheen,acc);
  }
  if(subT){
    const sy=top+lines.length*lh+fsS*1.15,sa=a*cnSS(.5,1.4,local-t0);
    g.save();g.globalAlpha=sa;g.font='600 '+fsS+'px '+CN_FONT;g.textBaseline='middle';g.textAlign='left';
    g.shadowColor='rgba(0,0,0,.8)';g.shadowBlur=fsS*.5;
    const sw=cfxTrack(g,subT,cx,sy,fsS,.34,cnTok('--txt2','#b4c8e0'),null,0);
    g.shadowBlur=0;g.shadowOffsetY=0;
    const rw=win.w*.13*cnEase('out',cnC01((local-t0-.6)/1.2)),gap=fsS*.9;
    g.fillStyle=cnA(gold,.85*sa);
    g.fillRect(cx-sw/2-gap-rw,sy-u*.6,rw,Math.max(1,u*1.2));g.fillRect(cx+sw/2+gap,sy-u*.6,rw,Math.max(1,u*1.2));
    g.restore();
  }else{
    const ra=cnEase('out',cnC01((local-t0)/1.6));
    g.globalAlpha=a*ra;
    const rw=win.w*.34*ra;g.fillStyle=cnA(gold,.85);
    g.fillRect(cx-rw/2,top+lines.length*lh+fs*.12,rw,Math.max(1,u*1.4));
  }
  g.restore();
};
})();
