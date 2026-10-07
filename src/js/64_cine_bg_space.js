/* =========================================================================
   CINEMATIC ART (space backgrounds) — CINE_PAINT.bg.space / planet / orbit / array / void.   Contract: docs/CINEMATIC_SPEC.md §5.4
   Loads after 64_cine_art.js (registry + cn* helpers) and before 66_cine.js. Rendering only: pure functions of (params, t, seed); no Math.random / Date;
   no state carried between frames. Every painter is a STATIC bake (fn.static=true: drawn once per scene and size into an oversized canvas that already
   covers S.fill) plus a light fn.anim (twinkle, drifting dust, blinking nav lights, charging pulses) that is redrawn per frame.
   Composition rule shared by all five: leave x~0.28 and x~0.72 (where the actors stand) and the lower third calm and low-contrast; put the bright, busy
   things (nebula cores, sun bloom, station, ring structure) in the upper half, the centre gap and the outer edges.
   All helpers are prefixed `cbs` and live in this IIFE (the game is one big scope: nothing here may leak).
   ========================================================================= */
(()=>{
'use strict';

/* ------------------------------------------------ 1. table noise (fast: ~15 ns / sample, deterministic, built once at load) ------------------------------------------------ */
const CBS_NT=new Float32Array(65536);
for(let i=0;i<65536;i++)CBS_NT[i]=cnHash(i&255,i>>8,0x5ee01,3);
function cbsN(x,y){                                                              // value noise in [0,1), lattice period 256
  const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
  const i0=xi&255,i1=(xi+1)&255,j0=(yi&255)<<8,j1=((yi+1)&255)<<8;
  const a=CBS_NT[j0|i0],b=CBS_NT[j0|i1],c=CBS_NT[j1|i0],d=CBS_NT[j1|i1];
  return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;
}
function cbsFbm(x,y,oct,off,gain){                                                    // fractal noise in [0,1), octaves rotated against each other to hide the lattice
  let s=0,a=.5,n=0,cx=x+off*1.37,cy=y+off*.71;const gn=gain||.5;
  for(let i=0;i<oct;i++){s+=a*cbsN(cx,cy);n+=a;const nx=cx*1.93-cy*.37+3.1,ny=cx*.37+cy*1.93+7.7;cx=nx;cy=ny;a*=gn;}
  return s/n;
}
const cbsRidge=(x,y,oct,off)=>{const f=cbsFbm(x,y,oct,off);return 1-Math.abs(f*2-1);};      // 0..1, ridges where the noise crosses its middle
const cbsGx=(dx,dy,sx,sy)=>Math.exp(-(dx*dx/(sx*sx)+dy*dy/(sy*sy)));
const cbsL=(a,b,t)=>a+(b-a)*t;
const cbsRGB=c=>{const a=cnCol(c);return[a[0],a[1],a[2]];};
const cbsMix3=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const cbsSoft=c=>c<140?c:140+115*(1-Math.exp(-(c-140)/115));                      // soft shoulder instead of a hard clip
const cbsHex=(r,g,b,a)=>'rgba('+(r+.5|0)+','+(g+.5|0)+','+(b+.5|0)+','+(+cnC01(a==null?1:a).toFixed(3))+')';
function cbsRamp(pal,n){                                                         // dark -> mid -> light colour ramp as a flat table
  const c0=cbsRGB(pal[0]),c1=cbsRGB(pal[1]),c2=cbsRGB(pal[2]),o=new Float32Array(n*3);
  for(let i=0;i<n;i++){const m=i/(n-1),c=m<.5?cbsMix3(c0,c1,m*2):cbsMix3(c1,c2,(m-.5)*2);o[i*3]=c[0];o[i*3+1]=c[1];o[i*3+2]=c[2];}
  return o;
}
/* the two places the actors stand (x .28 / .72, bust from y .27 down) and the lower third: 0 = free, 1 = keep calm */
function cbsCalm(fx,fy){
  const a=cbsGx(fx-.28,fy-.66,.115,.30),b=cbsGx(fx-.72,fy-.66,.115,.30),low=cnSS(.58,.98,fy);
  return Math.min(1,Math.max(a,b)*.78+low*.62);
}

/* ------------------------------------------------ 2. nebula kinds: each returns emission I, ramp position m, extinction e through O ------------------------------------------------ */
/* (u,v) = (x/H, y/H) so features keep their shape on every aspect ratio; d = density 0..1; s = integer noise seed; K = per-scene layout constants */
const CBS_NEB={
  /* blue: reflection nebula — haze, billowing body and bright filament highlights around an embedded core, with soft dust lanes */
  blue(u,v,s,d,K,O){
    const wx=cbsFbm(u*.8+3.1,v*.8+1.2,3,s),wy=cbsFbm(u*.8+8.7,v*.8+4.4,3,s+5),qx=(wx-.5)*2.1,qy=(wy-.5)*2.1;
    const n=cbsFbm(u*1.1+qx,v*1.1+qy,5,s+9),det=cbsFbm(u*4.6+qx*2.5,v*4.6+qy*2.5,4,s+27),thr=.60-d*.2;
    const haze=cnSS(.3,.72,n)*.3,body=cnSS(thr,thr+.26,n),hi=Math.pow(cnSS(.6,.82,n*.62+det*.46),2.2);
    const core=cbsGx(u-K.cu,v-K.cv,.55,.36),lane=cnSS(.55,.9,cbsRidge(u*1.9+qy*1.1,v*1.9+qx*.6,4,s+21))*.5;
    O[0]=(haze*.55+body*(.3+.55*det)+hi*.55+core*(.3+.6*body))*(.55+d*.6);O[1]=.1+body*.32+hi*.5+core*.55;O[2]=lane*Math.min(1,haze*2.5+body)*.8;
  },
  /* red: emission filaments — thin bright ribbons (ridged noise) over a faint haze, like a supernova remnant */
  red(u,v,s,d,K,O){
    const wx=cbsFbm(u*1.1+1.7,v*1.1+9.2,3,s+7),wy=cbsFbm(u*1.1+5.3,v*1.1+2.1,3,s+11),q=2.3;
    const r=cbsRidge(u*1.35+(wx-.5)*q,v*1.35+(wy-.5)*q,5,s+3),haze=cnSS(.38,.78,cbsFbm(u*.7+(wx-.5),v*.7+(wy-.5),4,s+15));
    const fil=Math.pow(r,4.5)*(.35+.65*haze),cov=cnSS(.15,.55,d*.7+haze*.55);
    O[0]=(haze*.34+fil*1.15)*cov*(.7+d*.5);O[1]=.18+fil*.82+haze*.12;O[2]=cnSS(.55,.85,cbsFbm(u*2.4,v*2.4+3,3,s+31))*.35*haze;
  },
  /* teal: an expanding shell (planetary nebula): a ring of gas with inner glow, torn filaments and diffuse outer clouds, partly off frame */
  teal(u,v,s,d,K,O){
    const dx=u-K.cu,dy=(v-K.cv)/.84,rr=Math.sqrt(dx*dx+dy*dy),ang=Math.atan2(dy,dx),ca=Math.cos(ang),sa=Math.sin(ang);
    const br=cbsFbm(ca*1.5+4,sa*1.5+4,3,s+2),rs=K.r*(.86+.24*br),tk=K.r*(.09+.1*br);
    const rim=cbsFbm(u*3.4+ca*.8,v*3.4+sa*.8,4,s+9),shell=Math.exp(-Math.pow((rr-rs)/tk,2))*(.35+.9*cnSS(.25,.75,rim));
    const inner=cnSS(rs*1.05,0,rr)*(.22+.5*cbsFbm(u*2.2,v*2.2,4,s+4)),skin=Math.exp(-Math.pow((rr-rs*1.28)/(tk*2.6),2))*.32*cnSS(.35,.7,rim);
    const out=cnSS(.3,.85,cbsFbm(u*.9+(br-.5),v*.9+.3,4,s+13))*cnSS(rs*3.4,rs*.7,rr)*.24;
    O[0]=(shell*1.1+inner*.55+skin+out)*(.5+d*.6);O[1]=.14+shell*.5+inner*.3+skin*.3;O[2]=cnSS(.62,.85,cbsRidge(u*3.4,v*3.4,3,s+19))*shell*.3;
  },
  /* violet: a glowing backdrop with dark dust pillars silhouetted against it (absorption nebula) */
  violet(u,v,s,d,K,O){
    const wx=cbsFbm(u*.7+2.2,v*.7+6.1,3,s+4),g=cnSS(.25,.9,cbsFbm(u*.6+(wx-.5)*.8,v*.6,4,s+8)),gl=g*(.16+d*.26),det=cbsFbm(u*5.2,v*5.2,3,s+23);
    const pil=cbsFbm(u*2.1+(wx-.5)*1.3,v*.62+(wx-.5)*.5,5,s+14),dust=cnSS(.5-d*.1,.72,pil)*(.55+.45*cnSS(.2,.95,v));
    const rim=Math.max(0,cnSS(.46,.6,pil)-cnSS(.6,.74,pil))*.55;
    O[0]=(gl*(1-dust*.55)*(.75+.5*det)+rim*gl*.9+cbsGx(u-K.cu,v-K.cv,.5,.32)*.22);O[1]=.1+g*.42+rim*.3;O[2]=Math.min(.8,dust*.75);
  },
  /* gold: a galactic dust band — a luminous, mottled band with one meandering dark rift along it and a few dust globules; the star pass crowds stars along it */
  gold(u,v,s,d,K,O){
    const along=u*K.ca+v*K.sa,perp=-u*K.sa+v*K.ca-K.off,pw=perp+(cbsFbm(along*.9+2,perp*.5,3,s+6)-.5)*.3;
    const band=Math.exp(-pw*pw/(K.w*K.w)),wide=Math.exp(-pw*pw/(K.w*K.w*7)),irr=.45+.55*cnSS(.2,.8,cbsFbm(along*1.4,perp*2,4,s+25)),mott=cbsFbm(u*6,v*6,5,s+17,.58);
    const mer=(cbsFbm(along*2.2,3.3,3,s+51)-.5)*K.w*.55,rr=(pw-K.w*.2-mer)/(K.w*.3),rift=Math.exp(-rr*rr)*(.35+.65*cnSS(.3,.7,cbsFbm(along*3,5,3,s+57)))*.6;
    const glob=cnSS(.66,.84,cbsFbm(u*4.6+9,v*4.6,3,s+63))*band*.55;
    O[0]=(band*irr*(.45+.95*mott)*1.25+wide*.3)*(1-rift)*(1-glob*.55);O[1]=.08+band*irr*.75+wide*.2+mott*.1;O[2]=Math.min(.85,rift*.8+glob*.55);
  }
};
function cbsNebK(kind,p,W,H,seed){                                              // per-scene layout constants for a nebula kind (anchors away from the actor spots)
  const r=i=>cnHash(seed,i,0x4e2,5),asp=W/H,left=r(1)<.5;
  const cx=left?.16+r(2)*.14:.74+r(2)*.12,cy=.16+r(3)*.14;
  const ang=-.16+r(4)*.28;
  return{cu:cx*asp,cv:cy,r:(.26+r(5)*.1)+(kind==='teal'?.02:0),ca:Math.cos(ang),sa:Math.sin(ang),off:.2+r(6)*.14,w:.17+r(7)*.06,left};
}
/* quarter-resolution raster of: backdrop gradient + nebula emission + dust extinction -> opaque canvas drawn over S.fill; returns {ext(x,y)} for the star pass */
function cbsSpaceRaster(g,W,H,F,seed,S,kind,dens,drift,o){
  o=o||{};const pal=CN_NEBULA[kind]||null,fn=pal&&CBS_NEB[kind],asp=W/H,cap=Math.round(40000*(S.part||1));
  const cell=Math.max(4,Math.sqrt(F.w*F.h/cap)),cw=Math.max(8,Math.ceil(F.w/cell)),ch=Math.max(8,Math.ceil(F.h/cell));
  const top=cbsRGB(o.top||'#01020a'),bot=cbsRGB(o.bot||'#070c1e'),side=pal?cbsRGB(pal[0]):[8,14,36];
  g.fillStyle=cnLG(g,0,0,0,H,[[0,cbsHex(top[0],top[1],top[2])],[1,cbsHex(bot[0],bot[1],bot[2])]]);g.fillRect(F.x,F.y,F.w,F.h);
  const ext=new Float32Array(cw*ch);
  if(fn){
    const cv=cnScratch('cbsNeb',cw,ch),cx=cv.getContext('2d'),img=cx.createImageData(cw,ch),d=img.data,ramp=cbsRamp(pal,48),K=cbsNebK(kind,{},W,H,seed),O=[0,0,0],s=(seed&0xffff)+(kind.length*977);
    const ox=drift*.22,gain=(o.gain==null?1:o.gain)*(.28+dens*.8);
    for(let j=0;j<ch;j++){
      const y=F.y+(j+.5)*cell,v=y/H,fy=v,tt=cnC01(fy),br=top[0]+(bot[0]-top[0])*tt,bg=top[1]+(bot[1]-top[1])*tt,bb=top[2]+(bot[2]-top[2])*tt;
      for(let i=0;i<cw;i++){
        const x=F.x+(i+.5)*cell,uu=x/H,fx=x/W;fn(uu+ox,v,s,dens,K,O);
        const cm=1-.6*cbsCalm(fx,fy);let I=O[0]*cm*gain,e=O[2]*cm;if(I<0)I=0;
        const m=cnC01(O[1]),k=(m*47+.5|0)*3,o4=(j*cw+i)*4,sh=1-e;
        const tn=.18*cnC01(I*7);d[o4]=cbsSoft((br+side[0]*tn)*sh+ramp[k]*I*.92);d[o4+1]=cbsSoft((bg+side[1]*tn)*sh+ramp[k+1]*I*.92);d[o4+2]=cbsSoft((bb+side[2]*tn)*sh+ramp[k+2]*I*.92);d[o4+3]=255;
        ext[j*cw+i]=e;
      }
    }
    cx.putImageData(img,0,0);
    g.save();g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';g.drawImage(cv,F.x,F.y,F.w,F.h);g.restore();
  }
  return{cell,cw,ch,ext:(x,y)=>{const i=Math.min(cw-1,Math.max(0,((x-F.x)/cell)|0)),j=Math.min(ch-1,Math.max(0,((y-F.y)/cell)|0));return ext[j*cw+i];}};
}

/* ------------------------------------------------ 3. stars ------------------------------------------------ */
const CBS_STAR_COL=['#9db8ff','#c4d6ff','#eef4ff','#ffffff','#fff3d8','#ffdcae','#ffb99a'];
function cbsStarCol(r){return CBS_STAR_COL[r<.16?0:r<.34?1:r<.62?2:r<.72?3:r<.86?4:r<.95?5:6];}
/* n stars over F with a power-law brightness spread. weight(x,y) in 0..1 thins them out (dust lanes, calm zones); bright ones get a glow and some a diffraction cross */
function cbsStars(g,F,seed,n,u,weight,cut){
  g.save();
  for(let i=0;i<n;i++){
    const x=F.x+cnR(seed,i,1)*F.w,y=F.y+cnR(seed,i,2)*F.h;
    if(weight&&cnR(seed,i,3)>weight(x,y))continue;
    const m=Math.pow(cnR(seed,i,4),4.5),col=cbsStarCol(cnR(seed,i,5)),sz=(.5+m*1.5)*u,a=cnC01(.16+m*1.2);
    g.fillStyle=cnA(col,a);g.fillRect(x-sz/2,y-sz/2,sz,sz);
    if(m>.58){
      cnGlow(g,x,y,(3+m*8)*u,col,.05+m*.2);
      if(m>.985){g.fillStyle=cnA(col,.26);const L=(8+m*22)*u;g.fillRect(x-L,y-.35*u,L*2,.7*u);g.fillRect(x-.35*u,y-L,.7*u,L*2);g.fillStyle=cnA('#fff',.9);g.fillRect(x-1*u,y-1*u,2*u,2*u);}
    }
  }
  g.restore();
}
/* light twinkle layer (fn.anim): a few dozen brighter stars that breathe and may drift; same positions every frame */
function cbsTwinkle(g,F,seed,t,S,drift,n,ext){
  const u=S.u,amp=S.rm?.12:.38,sp=S.rm?.25:1,cnt=cnN(n,S);
  g.save();
  for(let i=0;i<cnt;i++){
    let x=F.x+cnR(seed,i,11)*F.w;const y=F.y+cnR(seed,i,12)*F.h;
    if(drift)x=F.x+((x-F.x+drift*S.W*.016*t*(.5+cnR(seed,i,13)))%F.w+F.w)%F.w;
    const m=.3+Math.pow(cnR(seed,i,14),1.6)*.7,col=cbsStarCol(cnR(seed,i,15)),ph=cnR(seed,i,16)*TAU,f=(1-amp)+amp*(.5+.5*Math.sin(t*sp*(.9+cnR(seed,i,17)*2.2)+ph));
    let a=m*f;if(ext)a*=1-Math.min(.85,ext(x,y)*1.2);
    const sz=(.9+m*1.1)*u;g.fillStyle=cnA(col,a*.9);g.fillRect(x-sz/2,y-sz/2,sz,sz);
    if(m>.9){g.fillStyle=cnA(col,a*.18);g.fillRect(x-sz*2.6,y-sz*.14,sz*5.2,sz*.28);g.fillRect(x-sz*.14,y-sz*2.6,sz*.28,sz*5.2);}
  }
  g.restore();
}
/* a couple of far galaxies (tiny tilted discs with a bright core) for empty-sky scenes */
function cbsGalaxies(g,F,W,H,seed,u,n){
  for(let i=0;i<n;i++){
    const x=W*(i%2?.62+cnR(seed,i,1)*.3:.06+cnR(seed,i,1)*.24),y=H*(.1+cnR(seed,i,2)*.26),rx=(9+cnR(seed,i,3)*14)*u,ry=rx*(.28+cnR(seed,i,4)*.3),rot=cnR(seed,i,5)*Math.PI,col=cnR(seed,i,6)<.5?'#bcd0ff':'#ffe2bc';
    g.save();g.translate(x,y);g.rotate(rot);g.scale(1,ry/rx);
    g.fillStyle=cnRG(g,0,0,0,rx,[[0,cnA(col,.5)],[.18,cnA(col,.28)],[.55,cnA(col,.07)],[1,cnA(col,0)]]);g.fillRect(-rx,-rx,rx*2,rx*2);
    g.strokeStyle=cnA(col,.12);g.lineWidth=rx*.28;g.beginPath();g.arc(0,0,rx*.62,.4,TAU*.6);g.stroke();g.beginPath();g.arc(0,0,rx*.62,TAU*.5+.4,TAU*1.1);g.stroke();
    g.restore();cnGlow(g,x,y,rx*.34,'#fff',.35);
  }
}
/* the calm veil: the lower third and the bottom edge sink toward deep space so portraits and subtitles read */
function cbsVeil(g,F,W,H,a){
  g.fillStyle=cnLG(g,0,H*.58,0,H,[[0,'rgba(2,4,12,0)'],[1,'rgba(2,4,12,'+a+')']]);g.fillRect(F.x,H*.58,F.w,F.y+F.h-H*.58);
}

/* ------------------------------------------------ 4. space ------------------------------------------------ */
function cbsSpaceBack(g,W,H,F,seed,S,kind,dens,drift,o){
  o=o||{};const R=cbsSpaceRaster(g,W,H,F,seed,S,kind,dens,drift,o),u=S.u,area=F.w*F.h/(W*H),k=S.tier==='battery'?.6:1;
  const base=Math.round((420+dens*560)*area*k*(o.starMul||1)*(kind==='gold'?1.9:1)),band=kind==='gold'?cbsNebK('gold',{},W,H,seed):null;
  const weight=(x,y)=>{let w=1-R.ext(x,y)*.9;w*=1-.3*cbsCalm(x/W,y/H);if(band){const per=Math.abs(-(x/H)*band.sa+(y/H)*band.ca-band.off);w*=.28+.72*Math.exp(-per*per/(band.w*band.w*2.2));}return w;};
  cbsStars(g,F,seed+7,base,u,weight);
  if(kind==='none'||dens<.25)cbsGalaxies(g,F,W,H,seed+19,u,kind==='none'?3:1);
  return R;
}
const SPACE=(g,W,H,p,t,seed,S)=>{
  const F=S.fill,kind=CN_NEBULA[p.nebula]?p.nebula:'none',dens=cnC01(p.density==null?.5:p.density);
  cbsSpaceBack(g,W,H,F,seed,S,kind,dens,+p.drift||0,null);
  cbsVeil(g,F,W,H,.3);
};
SPACE.static=true;
SPACE.anim=(g,W,H,p,t,seed,S)=>{
  const F=S.fill,kind=CN_NEBULA[p.nebula]?p.nebula:'none';
  cbsTwinkle(g,F,seed+101,t,S,+p.drift||0,46,null);
};
CINE_PAINT.bg.space=SPACE;

/* ------------------------------------------------ 5. void ------------------------------------------------ */
const VOID=(g,W,H,p,t,seed,S)=>{
  const F=S.fill,u=S.u,tint=/^#[0-9a-f]{3,8}$/i.test(p.tint||'')?p.tint:'#0b1630',gl=cnC01(p.glow==null?.3:p.glow),tc=cbsRGB(tint),lum=cnLum(tint);
  const dark=cbsHex(tc[0]*.06,tc[1]*.06,tc[2]*.07+3),mid=cbsHex(tc[0]*.18+3,tc[1]*.18+4,tc[2]*.2+7);
  cnFillBg(g,S,cnLG(g,0,F.y,0,F.y+F.h,[[0,dark],[.55,mid],[1,cbsHex(tc[0]*.04,tc[1]*.04,tc[2]*.05+2)]]));
  /* breathing haze: low-frequency noise in the tint colour, strongest in the upper middle and fading before the lower third */
  const cap=S.tier==='battery'?9000:20000,cell=Math.max(5,Math.sqrt(F.w*F.h/cap)),cw=Math.ceil(F.w/cell),ch=Math.ceil(F.h/cell),cv=cnScratch('cbsVoid',cw,ch),cx=cv.getContext('2d'),img=cx.createImageData(cw,ch),d=img.data,s=(seed&0xffff)+31;
  const lo=cbsHex(Math.min(255,tc[0]*1.7+46),Math.min(255,tc[1]*1.7+46),Math.min(255,tc[2]*1.7+50)),lc=cbsRGB(lo),lc2=cbsMix3(lc,[255-tc[0],255-tc[1],255-tc[2]],.3),amt=.48+gl*.62;
  for(let j=0;j<ch;j++)for(let i=0;i<cw;i++){
    const x=F.x+(i+.5)*cell,y=F.y+(j+.5)*cell,fx=x/W,fy=y/H,n=cbsFbm(x/H*1.1,y/H*1.1,4,s),n2=cbsFbm(x/H*.45+9,y/H*.45,3,s+5);
    const c=cbsGx(fx-.5,fy-.4,.36,.42),a=(c*1.35+.12)*(.35+.9*cnSS(.25,.85,n)*(.5+n2))*amt*(1-.55*cnSS(.55,1,fy))*(1-.35*cbsCalm(fx,fy));
    const o4=(j*cw+i)*4,e=cnC01(cnSS(.2,.8,Math.hypot((fx-.5)*1.15,fy-.42))+(n2-.5)*1.1+(n-.5)*.5);d[o4]=lc[0]+(lc2[0]-lc[0])*e;d[o4+1]=lc[1]+(lc2[1]-lc[1])*e;d[o4+2]=lc[2]+(lc2[2]-lc[2])*e;d[o4+3]=255*(1-Math.exp(-a*1.05));
  }
  cx.putImageData(img,0,0);g.save();g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';g.globalCompositeOperation='lighter';g.drawImage(cv,F.x,F.y,F.w,F.h);g.restore();
  /* soft volumetric shafts falling from above: five stacked layers per shaft give them feathered edges */
  g.save();g.globalCompositeOperation='lighter';
  for(let i=0;i<4;i++){
    const x0=W*(.18+i*.22+(cnR(seed,i,1)-.5)*.1),w=W*(.05+cnR(seed,i,2)*.05),sl=(cnR(seed,i,3)-.5)*.5,a=(.035+.06*gl)*(.6+cnR(seed,i,4)*.8);
    for(let q=0;q<5;q++){
      const k=1.5-q*.28,aa=a/5*(1+q*.35);
      g.fillStyle=cnLG(g,x0,0,x0+sl*H,H*.95,[[0,cnA(lo,aa)],[.7,cnA(lo,aa*.3)],[1,cnA(lo,0)]]);
      g.beginPath();g.moveTo(x0-w*.25*k,F.y);g.lineTo(x0+w*.25*k,F.y);g.lineTo(x0+sl*H*1.2+w*1.2*k,H);g.lineTo(x0+sl*H*1.2-w*1.2*k,H);g.closePath();g.fill();
    }
  }
  g.restore();
  /* bokeh discs and a fine dust: depth cues that stay out of the way */
  g.save();
  const nb=Math.round(16*(F.w*F.h)/(W*H)*(S.tier==='battery'?.6:1));
  for(let i=0;i<nb;i++){
    const x=F.x+cnR(seed,i,21)*F.w,y=F.y+cnR(seed,i,22)*F.h*.9,r=(8+Math.pow(cnR(seed,i,23),1.6)*50)*u,a=(.018+.05*cnR(seed,i,24))*(.4+gl*1.1)*(1-.6*cbsCalm(x/W,y/H));
    g.globalCompositeOperation='lighter';g.fillStyle=cnRG(g,x,y,r*.7,r,[[0,cnA(lo,a*.8)],[.9,cnA(lo,a*1.5)],[1,cnA(lo,0)]]);g.beginPath();g.arc(x,y,r,0,TAU);g.fill();
  }
  g.globalCompositeOperation='source-over';
  cbsStars(g,F,seed+5,Math.round(170*F.w*F.h/(W*H)*(S.tier==='battery'?.6:1)),u,(x,y)=>(.35+.65*(1-cbsCalm(x/W,y/H)))*(.5+.5*lum+.5*gl));
  g.restore();
  cbsVeil(g,F,W,H,.28);
};
VOID.static=true;
VOID.anim=(g,W,H,p,t,seed,S)=>{
  const F=S.fill,u=S.u,tint=/^#[0-9a-f]{3,8}$/i.test(p.tint||'')?p.tint:'#0b1630',gl=cnC01(p.glow==null?.3:p.glow),lo=cnMix(tint,'#ffffff',.4),n=cnN(70,S),sp=S.rm?.25:1;
  g.save();g.globalCompositeOperation='lighter';
  for(let i=0;i<n;i++){
    const ph=cnPhase(t*sp,26+cnR(seed,i,3)*22,i,seed),x=F.x+((cnR(seed,i,1)+ph*.05*(cnR(seed,i,6)-.5)*2)%1+1)%1*F.w,y=F.y+F.h*(1-ph),z=cnR(seed,i,4),r=(.55+z*1.6)*u;
    const a=(.12+.45*z)*Math.sin(ph*Math.PI)*(.4+gl*.9)*(1-.7*cbsCalm(x/W,y/H))*(.75+.25*Math.sin(t*sp*(1+z*2)+i));
    if(a<.01)continue;g.fillStyle=cnA(lo,a);g.fillRect(x-r/2,y-r/2,r,r);
  }
  g.restore();
};
CINE_PAINT.bg.void=VOID;


/* ------------------------------------------------ 6. planets: per-pixel sphere shader (real terminator, clouds, night side) ------------------------------------------------ */
/* The sphere is sampled with an azimuthal-equidistant map (u,v) = n.xy * asin(rho)/rho, so surface features stay the right size and foreshorten toward the limb,
   with no pole pinching and no seam. out[] = albedo rgb, emissive rgb, specular, cloud cover. */
const CBS_SPH_CAP=105000;
function cbsKit(type,pal,seed,freq,planet){
  const s=(seed&0xfff)+(type.length*131),c=k=>cbsRGB(pal[k]);
  const K={type,s,f:freq,ox:cnHash(seed,1,0x51)*60,oy:cnHash(seed,2,0x51)*60,cox:cnHash(seed,3,0x51)*40,coy:cnHash(seed,4,0x51)*40,cloud:[255,255,255],cloudA:.7,sea:.5,atmK:1,amb:.1,sx:(cnHash(seed,5,0x51)-.5)*1.1,sy:.12+(cnHash(seed,6,0x51)-.5)*.5,city:.8,pal};
  switch(type){
    case'azure':  K.deep=cbsMix3(c('dark'),[6,26,62],.55);K.shal=cbsMix3(c('base'),[96,196,226],.35);K.l1=c('land');K.l2=[176,150,98];K.rock=[104,92,80];K.snow=[240,246,250];K.sea=.5;K.cloudA=.72;K.city=.95;break;
    case'verdant':K.deep=[10,58,72];K.shal=[44,140,156];K.l1=c('land');K.l2=c('base');K.l3=c('light');K.rock=[118,102,74];K.snow=[238,246,240];K.sea=.4;K.cloudA=.6;K.city=.85;break;
    case'ember':  K.dark=cbsMix3(c('dark'),[28,10,8],.35);K.r1=c('base');K.r2=cbsMix3(c('light'),[200,120,60],.45);K.lava=[255,96,28];K.lava2=[255,214,110];K.cloud=[72,40,32];K.cloudA=.4;K.atmK=.8;K.city=.5;K.amb=.14;break;
    case'ice':    K.i1=c('base');K.i2=c('light');K.crack=[74,138,182];K.deep=[110,178,214];K.cloud=[236,248,255];K.cloudA=.5;K.city=.38;K.amb=.14;break;
    case'ashen':  K.dk=[56,52,60];K.lt=cbsMix3(c('base'),c('light'),.55);K.cloud=[160,150,140];K.cloudA=.3;K.city=.34;K.atmK=.5;K.amb=.22;break;
    case'violet': K.dk=c('dark');K.md=c('base');K.lt=c('light');K.cloudA=0;K.city=.5;K.amb=.1;K.atmK=1.25;break;
    default:      K.dk=[58,56,62];K.lt=[164,160,170];K.cloudA=0;K.city=0;K.atmK=0;K.amb=.12;                           // 'moon': airless grey rock
  }
  return K;
}
const CBS_SURF={
  azure(u,v,pa,o,K){
    const x=u*K.f+K.ox,y=v*K.f+K.oy,w=cbsFbm(x*.5+4,y*.5+9,2,K.s),h=cbsFbm(x+(w-.5)*.9,y+(w-.5)*.55,6,K.s+3,.55),sea=K.sea;
    const land=cnSS(sea-.005,sea+.008,h),dp=cnSS(sea-.24,sea,h),el=cnSS(sea,sea+.2,h),dry=cbsFbm(x*.6+11,y*.6+3,3,K.s+7),gr=cbsFbm(x*7,y*7,2,K.s+19);
    const ice=cnSS(.93,.985,Math.abs(pa)+(h-.5)*.16);
    let r,g,b,t=Math.pow(dp,1.9);r=K.deep[0]+(K.shal[0]-K.deep[0])*t;g=K.deep[1]+(K.shal[1]-K.deep[1])*t;b=K.deep[2]+(K.shal[2]-K.deep[2])*t;
    let lr=K.l1[0],lg=K.l1[1],lb=K.l1[2];const dd=cnSS(.42,.66,dry);lr+=(K.l2[0]-lr)*dd;lg+=(K.l2[1]-lg)*dd;lb+=(K.l2[2]-lb)*dd;
    const rk=el*.6;lr+=(K.rock[0]-lr)*rk;lg+=(K.rock[1]-lg)*rk;lb+=(K.rock[2]-lb)*rk;
    const beach=cnSS(sea+.025,sea,h)*land*.3;lr+=(214-lr)*beach;lg+=(196-lg)*beach;lb+=(150-lb)*beach;
    const tx=(gr-.5)*26;lr+=tx;lg+=tx;lb+=tx*.7;
    r+=(lr-r)*land;g+=(lg-g)*land;b+=(lb-b)*land;
    r+=(K.snow[0]-r)*ice;g+=(K.snow[1]-g)*ice;b+=(K.snow[2]-b)*ice;
    const cx_=x*.62+(w-.5)*1.5+K.cox,cy_=y*1.5+(w-.5)*.6+K.coy,cl=cbsFbm(cx_,cy_,6,K.s+13,.56);
    const cov=cnSS(.54,.76,cl)*K.cloudA*(.45+.9*cbsFbm(x*5.5,y*5.5,2,K.s+31)),sh=cnSS(.54,.76,cbsFbm(cx_+.05,cy_+.06,3,K.s+13))*(1-cov);
    o[0]=r*(1-.3*sh);o[1]=g*(1-.3*sh);o[2]=b*(1-.3*sh);o[3]=o[4]=o[5]=0;o[6]=(1-land)*(1-ice)*.9;o[7]=Math.min(.95,cov);
  },
  verdant(u,v,pa,o,K){
    const x=u*K.f+K.ox,y=v*K.f+K.oy,w=cbsFbm(x*.5+4,y*.5+9,2,K.s),h=cbsFbm(x+(w-.5)*.8,y+(w-.5)*.5,6,K.s+3,.55),sea=K.sea;
    const land=cnSS(sea-.005,sea+.008,h),dp=cnSS(sea-.22,sea,h),el=cnSS(sea+.02,sea+.26,h),mea=cbsFbm(x*1.7+3,y*1.7+8,4,K.s+9),gr=cbsFbm(x*8,y*8,2,K.s+19),ice=cnSS(.94,.99,Math.abs(pa)+(h-.5)*.12);
    let t=Math.pow(dp,1.6),r=K.deep[0]+(K.shal[0]-K.deep[0])*t,g=K.deep[1]+(K.shal[1]-K.deep[1])*t,b=K.deep[2]+(K.shal[2]-K.deep[2])*t;
    let m=cnSS(.4,.68,mea),lr=K.l1[0]+(K.l2[0]-K.l1[0])*m,lg=K.l1[1]+(K.l2[1]-K.l1[1])*m,lb=K.l1[2]+(K.l2[2]-K.l1[2])*m;
    const hi=cnSS(.62,.8,mea)*.5;lr+=(K.l3[0]-lr)*hi;lg+=(K.l3[1]-lg)*hi;lb+=(K.l3[2]-lb)*hi;
    const rk=el*.65;lr+=(K.rock[0]-lr)*rk;lg+=(K.rock[1]-lg)*rk;lb+=(K.rock[2]-lb)*rk;const tx=(gr-.5)*30;lr+=tx;lg+=tx;lb+=tx*.6;
    r+=(lr-r)*land;g+=(lg-g)*land;b+=(lb-b)*land;r+=(K.snow[0]-r)*ice;g+=(K.snow[1]-g)*ice;b+=(K.snow[2]-b)*ice;
    const cx_=x*.7+(w-.5)*1.4+K.cox,cy_=y*1.4+K.coy,cl=cbsFbm(cx_,cy_,6,K.s+13,.56),cov=cnSS(.55,.78,cl)*K.cloudA*(.45+.9*cbsFbm(x*5.5,y*5.5,2,K.s+31)),sh=cnSS(.55,.78,cbsFbm(cx_+.05,cy_+.06,3,K.s+13))*(1-cov);
    o[0]=r*(1-.3*sh);o[1]=g*(1-.3*sh);o[2]=b*(1-.3*sh);o[3]=o[4]=o[5]=0;o[6]=(1-land)*(1-ice)*.8;o[7]=Math.min(.95,cov);
  },
  ember(u,v,pa,o,K){
    const x=u*K.f+K.ox,y=v*K.f+K.oy,w=cbsFbm(x*.6+2,y*.6+5,2,K.s),h=cbsFbm(x+(w-.5)*1.1,y+(w-.5)*.7,6,K.s+3,.55),pl=cnSS(.4,.6,h),dun=cbsFbm(x*1.6,y*5.4,3,K.s+8),gr=cbsFbm(x*8,y*8,2,K.s+19);
    let r=K.dark[0]+(K.r1[0]-K.dark[0])*pl,g=K.dark[1]+(K.r1[1]-K.dark[1])*pl,b=K.dark[2]+(K.r1[2]-K.dark[2])*pl;
    const hi=cnSS(.55,.8,h)*.55+(dun-.5)*.4;r+=(K.r2[0]-r)*Math.max(0,hi);g+=(K.r2[1]-g)*Math.max(0,hi);b+=(K.r2[2]-b)*Math.max(0,hi);
    const tx=(gr-.5)*34;r+=tx;g+=tx*.7;b+=tx*.5;
    const rg=cbsRidge(x*1.3+(w-.5)*1.6,y*1.3+(w-.5)*.8,4,K.s+21),lv=cnSS(.9,.968,rg)*(1-pl*.5),lh=Math.pow(lv,.7);
    r*=1-lv*.75;g*=1-lv*.75;b*=1-lv*.75;
    o[0]=r;o[1]=g;o[2]=b;o[3]=(K.lava[0]+(K.lava2[0]-K.lava[0])*lh)*lv;o[4]=(K.lava[1]+(K.lava2[1]-K.lava[1])*lh)*lv;o[5]=(K.lava[2]+(K.lava2[2]-K.lava[2])*lh)*lv;o[6]=0;
    const cw=cbsFbm(x*.5+K.cox,y*1.8+K.coy,5,K.s+13,.55);o[7]=cnSS(.54,.78,cw)*K.cloudA;
  },
  ice(u,v,pa,o,K){
    const x=u*K.f+K.ox,y=v*K.f+K.oy,w=cbsFbm(x*.5+1,y*.5+7,2,K.s),h=cbsFbm(x+(w-.5),y+(w-.5)*.6,5,K.s+3,.55),fl=cbsFbm(x*3.6,y*3.6,3,K.s+5);
    let t=cnSS(.3,.7,h),r=K.i1[0]+(K.i2[0]-K.i1[0])*t,g=K.i1[1]+(K.i2[1]-K.i1[1])*t,b=K.i1[2]+(K.i2[2]-K.i1[2])*t;
    const dp=cnSS(.5,.28,h)*.6;r+=(K.deep[0]-r)*dp;g+=(K.deep[1]-g)*dp;b+=(K.deep[2]-b)*dp;
    const cr=cnSS(.92,.98,cbsRidge(x*2.1+(w-.5)*2,y*2.1,4,K.s+21))*.7;r+=(K.crack[0]-r)*cr;g+=(K.crack[1]-g)*cr;b+=(K.crack[2]-b)*cr;
    const cap=cnSS(.7,.9,Math.abs(pa)+(h-.5)*.2);r+=(250-r)*cap;g+=(252-g)*cap;b+=(255-b)*cap;
    const sh=(fl-.5)*34;r+=sh;g+=sh;b+=sh*.9;
    o[0]=r;o[1]=g;o[2]=b;o[3]=o[4]=o[5]=0;o[6]=.45;
    const cw=cbsFbm(x*.6+K.cox,y*1.5+K.coy,5,K.s+13,.55);o[7]=cnSS(.58,.8,cw)*K.cloudA;
  },
  ashen(u,v,pa,o,K){
    const x=u*K.f+K.ox,y=v*K.f+K.oy,w=cbsFbm(x*.5+1,y*.5+7,2,K.s),h=cbsFbm(x*1.2+(w-.5),y*1.2+(w-.5)*.6,6,K.s+3,.56),pl=cnSS(.42,.58,h),dt=cbsFbm(x*6,y*6,3,K.s+5),fn=cbsFbm(x*14,y*14,2,K.s+8);
    let t=pl*.8+(dt-.5)*.34+(fn-.5)*.12;const r=K.dk[0]+(K.lt[0]-K.dk[0])*t,g=K.dk[1]+(K.lt[1]-K.dk[1])*t,b=K.dk[2]+(K.lt[2]-K.dk[2])*t;
    const ember=cnSS(.985,.998,cbsRidge(x*2.6+(w-.5),y*2.6,4,K.s+21))*(1-pl*.5);
    o[0]=r;o[1]=g;o[2]=b;o[3]=255*ember*.4;o[4]=120*ember*.4;o[5]=40*ember*.4;o[6]=.06;
    const cw=cbsFbm(x*.7+K.cox,y*1.1+K.coy,4,K.s+13);o[7]=cnSS(.58,.8,cw)*K.cloudA;
  },
  violet(u,v,pa,o,K){
    const x=u*K.f+K.ox,y=v*K.f+K.oy,w=cbsFbm(x*.45+3,y*.45+9,3,K.s),lat=pa+(w-.5)*.2,tur=cbsFbm(x*.8+(w-.5)*2,lat*8,5,K.s+3,.55),b1=Math.sin(lat*13+(tur-.5)*3.4),b2=Math.sin(lat*31+(tur-.5)*5+1.3);
    let m=.5+.5*b1,l=cnSS(.3,.9,tur)*.6+.2*b2;
    let r=K.dk[0]+(K.md[0]-K.dk[0])*m,g=K.dk[1]+(K.md[1]-K.dk[1])*m,b=K.dk[2]+(K.md[2]-K.dk[2])*m;
    const pe=Math.max(0,l)*.8;r+=(K.lt[0]-r)*pe;g+=(K.lt[1]-g)*pe;b+=(K.lt[2]-b)*pe;
    const dx=(u-K.sx)/.34,dy=(v-K.sy)/.2,d=Math.sqrt(dx*dx+dy*dy),st=cnSS(1,.45,d),ring=Math.exp(-Math.pow((d-.62)/.16,2))*.7;
    r+=(K.lt[0]*1.02-r)*ring*.5+(K.dk[0]-r)*st*.45;g+=(K.lt[1]*1.02-g)*ring*.5+(K.dk[1]-g)*st*.45;b+=(K.lt[2]*1.02-b)*ring*.5+(K.dk[2]-b)*st*.45;
    o[0]=r;o[1]=g;o[2]=b;o[3]=o[4]=o[5]=0;o[6]=.18;o[7]=0;
  },
  moon(u,v,pa,o,K){
    const x=u*K.f+K.ox,y=v*K.f+K.oy,h=cbsFbm(x*1.2,y*1.2,5,K.s+3),pl=cnSS(.42,.58,h),dt=cbsFbm(x*6,y*6,3,K.s+5),t=pl*.75+(dt-.5)*.35;
    o[0]=K.dk[0]+(K.lt[0]-K.dk[0])*t;o[1]=K.dk[1]+(K.lt[1]-K.dk[1])*t;o[2]=K.dk[2]+(K.lt[2]-K.dk[2])*t;o[3]=o[4]=o[5]=0;o[6]=0;o[7]=0;
  }
};
/* sun vector from the lit fraction (phase) and the screen-space direction the light comes from (la) */
function cbsSun(ph,la){const lz=cnC01(ph)*2-1,sx=Math.sqrt(Math.max(0,1-lz*lz));return[Math.cos(la)*sx,Math.sin(la)*sx,lz];}
const cbsScale=g=>{try{const m=g.getTransform();return Math.max(1,Math.min(3,m.a));}catch(e){return 1;}};
/* the visible part of a disc of radius R at (cx,cy) inside the fill rectangle (design units), padded 1 unit */
function cbsRegion(cx,cy,R,F,pad){
  let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;const n=24;
  for(let k=0;k<=n;k++){
    const x=F.x+F.w*k/n,dx=x-cx;
    if(Math.abs(dx)<=R){const h=Math.sqrt(R*R-dx*dx),ya=cy-h,yb=cy+h;if(yb>=F.y&&ya<=F.y+F.h){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,Math.max(ya,F.y));y1=Math.max(y1,Math.min(yb,F.y+F.h));}}
    const y=F.y+F.h*k/n,dy=y-cy;
    if(Math.abs(dy)<=R){const h=Math.sqrt(R*R-dy*dy),xa=cx-h,xb=cx+h;if(xb>=F.x&&xa<=F.x+F.w){y0=Math.min(y0,y);y1=Math.max(y1,y);x0=Math.min(x0,Math.max(xa,F.x));x1=Math.max(x1,Math.min(xb,F.x+F.w));}}
  }
  if(!(x1>x0)||!(y1>y0))return null;
  x0=Math.max(F.x,x0-pad-F.w/n);x1=Math.min(F.x+F.w,x1+pad+F.w/n);y0=Math.max(F.y,y0-pad-F.h/n);y1=Math.min(F.y+F.h,y1+pad+F.h/n);
  return x1>x0+1&&y1>y0+1?{x:x0,y:y0,w:x1-x0,h:y1-y0}:null;
}
/* draws the shaded planet disc (clipped by a vector arc so the limb is razor sharp at any scale). o: {type,pal,L,seed,F,freq,atm,ring,axis,cap,tier} */
function cbsSphere(g,cx,cy,R,o){
  if(!(R>.5))return;const F=o.F,rg=cbsRegion(cx,cy,R,F,1);if(!rg)return;
  const type=CBS_SURF[o.type]?o.type:'moon',pal=o.pal,K=cbsKit(type,pal,o.seed,o.freq||2.4),surf=CBS_SURF[type],L=o.L,Lx=L[0],Ly=L[1],Lz=L[2],ax=o.axis||[0,-1,0],atm=o.atm?K.atmK:0;
  const cap=o.cap||CBS_SPH_CAP,sc=Math.max(.3,Math.min(cbsScale(g),Math.sqrt(cap/(rg.w*rg.h)))),rw=Math.max(2,Math.ceil(rg.w*sc)),rh=Math.max(2,Math.ceil(rg.h*sc));
  const cv=cnScratch('cbsSph',rw,rh),cx2=cv.getContext('2d'),img=cx2.createImageData(rw,rh),d=img.data,out=new Float64Array(8);
  const hazeK=o.haze==null?1:o.haze,tame=1-.6*(o.tame||0),Hx=Lx,Hy=Ly,Hz=Lz+1,Hl=Math.hypot(Hx,Hy,Hz)||1,hx=Hx/Hl,hy=Hy/Hl,hz=Hz/Hl,amb=K.amb,ph=(Lz+1)/2;
  const atmc=cbsRGB(pal.atm),twc=cbsMix3(atmc,[255,140,70],.55),amc=[.56,.7,1],sunc=[1,.97,.92],ring=o.ring,sharp=atm?[-.11,.8]:[-.03,.62],cld=K.cloud;
  /* ring geometry in the planet's frame: normal and the sun vector rotated into the ring frame */
  let rn=null,rl=null,rc=0,rs=0;
  if(ring){rc=Math.cos(-ring.psi);rs=Math.sin(-ring.psi);rl=[Lx*rc-Ly*rs,Lx*rs+Ly*rc,Lz];rn=ring.nrm;}
  for(let j=0;j<rh;j++){
    const dy=(rg.y+(j+.5)/sc-cy)/R;
    for(let i=0;i<rw;i++){
      const dx=(rg.x+(i+.5)/sc-cx)/R,o4=(j*rw+i)*4;let r2=dx*dx+dy*dy;
      if(r2>1.03){d[o4+3]=0;continue;}
      let nx=dx,ny=dy;if(r2>.9996){const k=Math.sqrt(.9996/r2);nx*=k;ny*=k;r2=.9996;}
      const nz=Math.sqrt(1-r2),rho=Math.sqrt(r2),k=rho>1e-4?Math.asin(rho)/rho:1,lam=nx*Lx+ny*Ly+nz*Lz,pa=nx*ax[0]+ny*ax[1]+nz*ax[2];
      surf(nx*k,ny*k,pa,out,K);
      let dif=cnSS(sharp[0],sharp[1],lam);
      if(ring){                                                                                                             // the ring's shadow on the planet: follow the sun ray to the ring plane
        const px=nx*rc-ny*rs,py=nx*rs+ny*rc,den=rn[0]*rl[0]+rn[1]*rl[1]+rn[2]*rl[2];
        if(Math.abs(den)>.02){const tt=-(rn[0]*px+rn[1]*py+rn[2]*nz)/den;if(tt>0){const qx=px+tt*rl[0],qy=py+tt*rl[1],qz=nz+tt*rl[2],rr=Math.sqrt(qx*qx+qy*qy+qz*qz);dif*=1-.9*ring.at(rr);}}
      }
      const day=cnSS(-.08,.4,lam);
      let r=out[0]*(amb*amc[0]+dif*sunc[0]),g=out[1]*(amb*amc[1]+dif*sunc[1]),b=out[2]*(amb*amc[2]+dif*sunc[2]);
      const cv_=out[7];
      if(cv_>0.001){const cd=cnSS(-.24,.6,lam),cs=cnC01(cd*1.02+amb*.7);r+=(cld[0]*cs-r)*cv_;g+=(cld[1]*cs-g)*cv_;b+=(cld[2]*cs-b)*cv_;}
      if(out[6]>.01&&lam>0){const nh=nx*hx+ny*hy+nz*hz;if(nh>0){const sp=Math.pow(nh,46)*out[6]*(1-cv_)*day*150;r+=sp*.9;g+=sp*.95;b+=sp;}}
      const em=(1-day*.85)*tame;r+=out[3]*em;g+=out[4]*em;b+=out[5]*em;
      if(atm){
        const fr=Math.pow(1-nz,2.8),lit=cnSS(-.4,.5,lam)*(1-.5*(1-ph)*0)+.14+(1-ph)*.22*cnSS(-.6,.2,lam),a1=fr*lit*atm*.82*hazeK;
        r+=atmc[0]*a1;g+=atmc[1]*a1;b+=atmc[2]*a1;
        const tw=Math.exp(-lam*lam/.03)*atm*(.3+.5*nz)*.17*(.35+(out[0]+out[1]+out[2])/560);r+=twc[0]*tw;g+=twc[1]*tw;b+=twc[2]*tw;
        const th=Math.pow(1-nz,9)*cnSS(-.1,.5,lam)*atm*1.1;r+=255*th*.6;g+=255*th*.7;b+=255*th*.8;
      }
      d[o4]=cbsSoft(r);d[o4+1]=cbsSoft(g);d[o4+2]=cbsSoft(b);d[o4+3]=255;
    }
  }
  cx2.putImageData(img,0,0);
  g.save();g.beginPath();g.arc(cx,cy,R,0,TAU);g.clip();g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';g.drawImage(cv,rg.x,rg.y,rg.w,rg.h);g.restore();
  return K;
}


/* ------------------------------------------------ 7. rings: ray-cast per pixel (back half behind the planet, front half over it, shadows both ways) ------------------------------------------------ */
function cbsRing(pal,seed,T,psi){
  const N=900,rin=1.3,rout=2.16,dens=new Float32Array(N),bri=new Float32Array(N),sd=seed&255,sT=Math.sin(T),cT=Math.cos(T);
  for(let i=0;i<N;i++){
    const u=i/(N-1);
    let b=u<.05?u/.05*.24:u<.19?.24:u<.23?.24+(u-.19)/.04*.62:u<.55?.86:u<.585?.86-(u-.55)/.035*.8:u<.64?.06:u<.68?.06+(u-.64)/.04*.5:u<.95?.56:.56*(1-(u-.95)/.05);
    const f1=cbsN(u*38+sd,.5),f2=cbsN(u*13+sd*3,2.5),f3=cbsN(u*80+sd*7,4.5);
    b*=.42+1.05*(f1*.55+f2*.45);b*=1-.9*Math.exp(-Math.pow((u-.8)/.011,2));b*=.9+.2*f3;
    dens[i]=cnC01(b);bri[i]=cnC01(.25+.75*(.55*f2+.45*f1));
  }
  return{rin,rout,T,psi,sT,cT,nrm:[0,-cT,sT],dens,bri,N,
    light:cbsMix3(cbsRGB(pal.light),[230,218,198],.72),dark:cbsMix3(cbsRGB(pal.dark),[118,100,88],.68),
    at(rr){const u=(rr-rin)/(rout-rin);if(u<0||u>1)return 0;const f=u*(N-1),i=f|0,w=f-i;return dens[i]+(dens[Math.min(N-1,i+1)]-dens[i])*w;}};
}
/* returns {cv,x,y,w,h} in the ring's own frame (x right along the major axis, y down the minor axis) or null when nothing is visible */
function cbsRingRaster(g,cx,cy,R,ring,L,F,cap){
  const c=Math.cos(ring.psi),s=Math.sin(ring.psi),ro=ring.rout*R,rm=ro*ring.sT;
  let lx0=1e9,ly0=1e9,lx1=-1e9,ly1=-1e9;
  for(const X of[F.x,F.x+F.w])for(const Y of[F.y,F.y+F.h]){const dx=X-cx,dy=Y-cy,lx=dx*c+dy*s,ly=-dx*s+dy*c;lx0=Math.min(lx0,lx);lx1=Math.max(lx1,lx);ly0=Math.min(ly0,ly);ly1=Math.max(ly1,ly);}
  const x0=Math.max(lx0,-ro),x1=Math.min(lx1,ro),y0=Math.max(ly0,-rm),y1=Math.min(ly1,rm);if(x1<=x0+1||y1<=y0+1)return null;
  const w=x1-x0,h=y1-y0,sc=Math.max(.3,Math.min(cbsScale(g),Math.sqrt(cap/(w*h)))),rw=Math.max(2,Math.ceil(w*sc)),rh=Math.max(2,Math.ceil(h*sc));
  const cv=cnScratch('cbsRing',rw,rh),cx2=cv.getContext('2d'),img=cx2.createImageData(rw,rh),d=img.data;
  const rc=Math.cos(-ring.psi),rs=Math.sin(-ring.psi),Ll=[L[0]*rc-L[1]*rs,L[0]*rs+L[1]*rc,L[2]],LN=Ll[0]*ring.nrm[0]+Ll[1]*ring.nrm[1]+Ll[2]*ring.nrm[2];
  const side=LN>0?1:.3,graze=.42+.58*cnC01(Math.abs(LN)*3.2),rin=ring.rin,span=ring.rout-ring.rin,N=ring.N,sT=ring.sT,cT=ring.cT,lt=ring.light,dk=ring.dark;
  for(let j=0;j<rh;j++){
    const b=(y0+(j+.5)/sc)/(R*sT);
    for(let i=0;i<rw;i++){
      const a=(x0+(i+.5)/sc)/R,rho2=a*a+b*b,o4=(j*rw+i)*4;
      if(rho2<rin*rin||rho2>ring.rout*ring.rout){d[o4+3]=0;continue;}
      const rho=Math.sqrt(rho2),fi=(rho-rin)/span*(N-1),idx=fi|0,fw=fi-idx,i2=idx+1<N?idx+1:idx,dn=ring.dens[idx]+(ring.dens[i2]-ring.dens[idx])*fw;if(dn<.012){d[o4+3]=0;continue;}
      const RL=a*Ll[0]+b*sT*Ll[1]+b*cT*Ll[2];let sh=0;if(RL<0)sh=cnSS(1.05,.94,Math.sqrt(Math.max(0,rho2-RL*RL)));
      const br=ring.bri[idx]+(ring.bri[i2]-ring.bri[idx])*fw,lv=.16+.9*side*graze*(1-sh*.94),k=lv;
      d[o4]=cbsSoft((dk[0]+(lt[0]-dk[0])*br)*k);d[o4+1]=cbsSoft((dk[1]+(lt[1]-dk[1])*br)*k);d[o4+2]=cbsSoft((dk[2]+(lt[2]-dk[2])*br)*k);d[o4+3]=255*dn*.94;
    }
  }
  cx2.putImageData(img,0,0);return{cv,x:x0,y:y0,w,h};
}
function cbsRingDraw(g,cx,cy,R,ring,rr,front){
  if(!rr)return;g.save();g.translate(cx,cy);g.rotate(ring.psi);
  if(front){g.beginPath();g.arc(0,0,R,0,TAU);g.clip();g.beginPath();g.rect(-1e5,0,2e5,1e5);g.clip();}
  g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';g.drawImage(rr.cv,rr.x,rr.y,rr.w,rr.h);g.restore();
}

/* ------------------------------------------------ 8. planet dressing: night-side lights, craters, atmosphere halo, moons ------------------------------------------------ */
/* clustered city lights on the night side, restricted to land (or whatever the surface function says is habitable) and faded in past the terminator */
function cbsCities(g,cx,cy,R,o,K,rg,u,dens){
  if(!(K.city>.02))return;const L=o.L,type=K.type,surf=CBS_SURF[type],out=new Float64Array(8),ax=o.axis||[0,-1,0],col=o.pal.city,sd=o.seed+0x77;
  const N=Math.min(3600,Math.round(rg.w*rg.h/(95*u*u))),kk=(dens==null?1:dens)*K.city;
  g.save();g.globalCompositeOperation='lighter';
  for(let i=0;i<N;i++){
    const x=rg.x+cnR(sd,i,1)*rg.w,y=rg.y+cnR(sd,i,2)*rg.h,dx=(x-cx)/R,dy=(y-cy)/R,r2=dx*dx+dy*dy;if(r2>.93)continue;
    const nz=Math.sqrt(1-r2);if(cnR(sd,i,3)>nz*1.05)continue;
    const lam=dx*L[0]+dy*L[1]+nz*L[2];if(lam>-.05)continue;
    const rho=Math.sqrt(r2),k=rho>1e-4?Math.asin(rho)/rho:1,uu=dx*k,vv=dy*k,pa=dx*ax[0]+dy*ax[1]+nz*ax[2];
    surf(uu,vv,pa,out,K);
    let ok;
    if(type==='azure'||type==='verdant')ok=out[6]<.28&&Math.abs(pa)<.84;else if(type==='ember')ok=out[3]<30&&out[0]>70;else if(type==='violet')ok=false;else ok=true;
    if(!ok)continue;
    const cl=cbsFbm(uu*K.f*2.8+7,vv*K.f*2.8+3,3,K.s+55),thr=type==='azure'||type==='verdant'?.5-.1*kk:.58-.06*kk;if(cl<thr)continue;
    const fade=cnSS(-.05,-.24,lam)*cnSS(0,.2,nz),n=2+Math.floor(cnR(sd,i,4)*6),rc=(.006+.016*cnR(sd,i,5))*R*(.5+.5*nz);
    for(let q=0;q<n;q++){
      const a=cnR(sd,i*13+q,6)*TAU,d=Math.sqrt(cnR(sd,i*13+q,7))*rc,px=x+Math.cos(a)*d,py=y+Math.sin(a)*d*(.5+.5*nz),sz=(.8+cnR(sd,i*13+q,8)*.9)*u,al=(.3+.65*cnR(sd,i*13+q,9))*fade;
      g.fillStyle=cnA(col,al);g.fillRect(px-sz/2,py-sz/2,sz,sz);
    }
    if(cnR(sd,i,10)<.3)cnGlow(g,x,y,(4+cnR(sd,i,11)*6)*u,col,.09*fade);
  }
  if(type==='violet'){                                                                                                  // gas giant: lightning storms flicker under the night-side cloud deck
    for(let i=0;i<40;i++){
      const x=rg.x+cnR(sd,i,41)*rg.w,y=rg.y+cnR(sd,i,42)*rg.h,dx=(x-cx)/R,dy=(y-cy)/R,r2=dx*dx+dy*dy;if(r2>.8)continue;
      const nz=Math.sqrt(1-r2),lam=dx*L[0]+dy*L[1]+nz*L[2];if(lam>-.12||cnR(sd,i,43)>.28)continue;
      cnGlow(g,x,y,(10+cnR(sd,i,44)*22)*u,'#e8d4ff',.09+.12*cnR(sd,i,45),{core:.4});
    }
  }
  g.restore();
}
/* craters as vector ellipses: lit rim toward the sun, dark bowl, foreshortened toward the limb */
function cbsCraters(g,cx,cy,R,o,rg,n,u){
  const L=o.L,sd=o.seed+0x31;g.save();g.beginPath();g.arc(cx,cy,R,0,TAU);g.clip();
  for(let i=0;i<n;i++){
    const x=rg.x+cnR(sd,i,1)*rg.w,y=rg.y+cnR(sd,i,2)*rg.h,dx=(x-cx)/R,dy=(y-cy)/R,r2=dx*dx+dy*dy;if(r2>.92)continue;
    const nz=Math.sqrt(1-r2),lam=dx*L[0]+dy*L[1]+nz*L[2],day=cnSS(-.02,.42,lam);if(day<.04)continue;
    const rc=R*(.012+.07*Math.pow(cnR(sd,i,3),2.3))*(.55+.45*nz),ang=Math.atan2(dy,dx),sx=rc,sy=Math.max(rc*.2,rc*nz);
    g.save();g.translate(x,y);g.rotate(ang+Math.PI/2);g.scale(sx/Math.max(1,sy),1);                                       // squash radially
    const rr=sy;g.fillStyle=cnRG(g,rr*.18,rr*.1,0,rr,[[0,'rgba(10,10,16,'+(.38*day)+')'],[.72,'rgba(10,10,16,'+(.22*day)+')'],[1,'rgba(10,10,16,0)']]);g.beginPath();g.arc(0,0,rr,0,TAU);g.fill();
    g.restore();
    g.save();g.translate(x,y);g.rotate(ang+Math.PI/2);g.scale(sx/Math.max(1,sy),1);g.lineWidth=Math.max(.6,rr*.12);
    const sl=Math.atan2(L[1],L[0])-(ang+Math.PI/2);g.strokeStyle=cnA('#ffffff',.2*day);g.beginPath();g.arc(0,0,rr*.96,sl-1.1,sl+1.1);g.stroke();
    g.strokeStyle='rgba(0,0,0,'+(.2*day)+')';g.beginPath();g.arc(0,0,rr*.96,sl+Math.PI-1,sl+Math.PI+1);g.stroke();g.restore();
  }
  g.restore();
}
/* atmosphere glow outside the limb: one two-circle gradient (thicker toward the sun, a thin skin on the far side) plus a faint even skin and a razor-thin bright limb line.
   Drawn outside the disc only (even-odd clip), additive. */
function cbsHalo(g,cx,cy,R,pal,L,str,thick,u,F){
  if(!(str>0))return;const l2=Math.hypot(L[0],L[1])||1,dx=L[0]/l2,dy=L[1]/l2,ph=(L[2]+1)/2,far=.07+.62*ph*ph,mid=.3+.55*ph,T=R*thick,off=T*.8*(1-.5*ph),ac=pal.atm;
  g.save();g.globalCompositeOperation='lighter';
  g.beginPath();g.rect(F.x,F.y,F.w,F.h);g.arc(cx,cy,R*.998,0,TAU,true);g.clip();
  const st=(k)=>{const o=[];for(let i=0;i<=8;i++){const f=i/8,a=k*Math.exp(-f*3.4)*(1-cnSS(.8,1,f)),c=cnMix(ac,'#ffffff',Math.max(0,.5-f*1.2));o.push([f,cnA(c,a)]);}return o;};
  g.fillStyle=cnRG2(g,cx,cy,R*.998,cx+dx*off,cy+dy*off,R+T*1.3,st(str*.55));g.fillRect(F.x,F.y,F.w,F.h);
  g.fillStyle=cnRG2(g,cx,cy,R*.998,cx,cy,R+T*.8,st(str*.2*(far+mid)));g.fillRect(F.x,F.y,F.w,F.h);
  g.restore();
  g.save();g.globalCompositeOperation='lighter';g.beginPath();g.rect(F.x,F.y,F.w,F.h);g.clip();
  g.strokeStyle=cnLG(g,cx+dx*R,cy+dy*R,cx-dx*R,cy-dy*R,[[0,cnA('#ffffff',.55*Math.min(1,str))],[.5,cnA(ac,.28*Math.min(1,str)*mid)],[1,cnA(ac,.06*Math.min(1,str))]]);g.lineWidth=Math.max(1,1.3*u);
  g.beginPath();g.arc(cx,cy,R+g.lineWidth*.3,0,TAU);g.stroke();
  g.restore();
}
function cbsMoon(g,x,y,r,L,seed,F,u,tier){
  if(r<2.5){g.fillStyle='#b8b4bc';g.fillRect(x-r,y-r,r*2,r*2);return;}
  const pal=CN_PLANET.ashen,K=cbsSphere(g,x,y,r,{type:'moon',pal,L,seed,F,freq:2.6,atm:false,cap:tier==='battery'?2500:6500});
  if(r>9)cbsCraters(g,x,y,r,{L,seed},{x:x-r,y:y-r,w:r*2,h:r*2},Math.round(10+r*.5),u);
}

/* ------------------------------------------------ 9. planet ------------------------------------------------ */
function cbsPlanetGeo(p,W,H){
  const size=Math.max(.3,Math.min(2.5,+p.size||1)),big=Math.max(0,size-1),R=H*.33*size;
  return{size,R,cx:W*(size<1?.58:.6+.07*big),cy:H*(size<1?.44:.47+.3*big)};
}
function cbsLightAng(){return -2.62;}
const PLANET=(g,W,H,p,t,seed,S)=>{
  const F=S.fill,u=S.u,type=CN_PLANET[p.planet]?p.planet:'azure',pal=CN_PLANET[type],G=cbsPlanetGeo(p,W,H),R=G.R,cx=G.cx,cy=G.cy,tier=S.tier;
  const nebula=CN_NEBULA[p.nebula]?p.nebula:'none',ph=p.phase==null?.62:cnC01(+p.phase),L=cbsSun(ph,cbsLightAng()),atm=p.atmosphere!==false&&p.atmosphere!==0;
  cbsSpaceBack(g,W,H,F,seed,S,nebula,.42,0,{starMul:.8});
  let ring=null,rr=null,axis=[0,-1,0];
  if(p.rings){const T=.31+cnHash(seed,1,0x71)*.12,psi=-.34+(cnHash(seed,2,0x71)-.5)*.2;ring=cbsRing(pal,seed,T,psi);axis=[ring.cT*Math.sin(psi),-ring.cT*Math.cos(psi),ring.sT];rr=cbsRingRaster(g,cx,cy,R,ring,L,F,Math.round(75000*S.part));cbsRingDraw(g,cx,cy,R,ring,rr,false);}
  const rg=cbsRegion(cx,cy,R,F,1),K=cbsSphere(g,cx,cy,R,{type,pal,L,seed,F,freq:2.4,atm,ring,axis,cap:Math.round(CBS_SPH_CAP*S.part)});
  if(rg&&K){
    if(type==='ashen')cbsCraters(g,cx,cy,R,{L,seed},rg,Math.round(26+R*.18),u);
    cbsCities(g,cx,cy,R,{L,seed,pal,axis},K,rg,u,1);
  }
  if(atm)cbsHalo(g,cx,cy,R,pal,L,(K?K.atmK:1)*.95*(1+.9*(1-ph)),Math.min(.17,80*u/R),u,F);
  if(ring)cbsRingDraw(g,cx,cy,R,ring,rr,true);
  /* moons: on slots clear of the planet and of the actor spots */
  const slots=[[.2,.17],[.9,.3],[.44,.1],[.08,.6]];let used=0;
  for(let q=0;q<slots.length&&used<(p.moons|0);q++){
    const mx=W*slots[q][0],my=H*slots[q][1],mr=Math.min(R*.34,H*(.03+.014*used+.012*cnHash(seed,q,0x72)));
    if(Math.hypot(mx-cx,my-cy)<R*(ring?2.3:1.25)+mr*2)continue;
    cbsMoon(g,mx,my,mr,L,seed+used*17,F,u,tier);used++;
  }
  cbsVeil(g,F,W,H,.34);
};
PLANET.static=true;
PLANET.anim=(g,W,H,p,t,seed,S)=>{cbsTwinkle(g,S.fill,seed+101,t,S,0,22,null);};
CINE_PAINT.bg.planet=PLANET;


/* ------------------------------------------------ 10. orbit: the limb of a world, a station, traffic ------------------------------------------------ */
function cbsOrbitGeo(p,W,H,seed){
  const limb=p.limb==='left'||p.limb==='right'||p.limb==='top'?p.limb:'bottom';
  let sgn=cnHash(seed,1,0x91)<.5?-1:1;if(limb==='left'||limb==='right')sgn=-1;                                              // vertical limbs: the sun always sits at the top end (keeps the glare out of the lower third)
  let cx,cy,R,ox,oy,tx,ty;
  if(limb==='bottom'){R=W*1.7;cx=W*(.5+.1*sgn);cy=H*.72+R;ox=0;oy=-1;tx=1;ty=0;}
  else if(limb==='top'){R=W*1.7;cx=W*(.5+.1*sgn);cy=H*.28-R;ox=0;oy=1;tx=1;ty=0;}
  else if(limb==='left'){R=H*1.35;cx=W*.225-R;cy=H*.42;ox=1;oy=0;tx=0;ty=1;}
  else{R=H*1.35;cx=W*.775+R;cy=H*.42;ox=-1;oy=0;tx=0;ty=1;}
  const lv=[tx*sgn*.95+ox*.12,ty*sgn*.95+oy*.12,.08],ll=Math.hypot(lv[0],lv[1],lv[2]),L=[lv[0]/ll,lv[1]/ll,lv[2]/ll];
  /* the point on the horizon nearest to the sun: where the light grazes the air */
  const sx=limb==='bottom'||limb==='top'?W*(sgn<0?.05:.95):(limb==='left'?W*.225:W*.775),sy=limb==='bottom'||limb==='top'?0:H*.12;
  let hx=sx,hy;
  if(limb==='bottom'||limb==='top'){const dx=sx-cx,h=Math.sqrt(Math.max(0,R*R-dx*dx));hy=limb==='bottom'?cy-h:cy+h;}
  else{const dy=sy-cy,h=Math.sqrt(Math.max(0,R*R-dy*dy));hy=sy;hx=limb==='left'?cx+h:cx-h;}
  return{limb,sgn,R,cx,cy,ox,oy,tx,ty,L,sun:{x:hx,y:hy},axis:[ox*.92,oy*.92,-.38]};
}
/* y of the horizon at screen x (bottom / top limb), or x at screen y (left / right limb) */
function cbsHorizon(G,v){
  const R=G.R;
  if(G.limb==='bottom'||G.limb==='top'){const dx=v-G.cx,h=Math.sqrt(Math.max(0,R*R-dx*dx));return G.limb==='bottom'?G.cy-h:G.cy+h;}
  const dy=v-G.cy,h=Math.sqrt(Math.max(0,R*R-dy*dy));return G.limb==='left'?G.cx+h:G.cx-h;
}
/* the sun coming up over the limb: a hot core, a wide warm veil and an anamorphic streak along the horizon */
function cbsSunrise(g,G,W,H,F,amt,u,tint){
  if(!(amt>0))return;const x=G.sun.x,y=G.sun.y,hor=G.limb==='bottom'||G.limb==='top',r=H*(.2+.3*amt);
  g.save();g.beginPath();g.rect(F.x,F.y,F.w,F.h);g.clip();
  cnGlow(g,x,y,r*1.7,tint,.3*amt,{add:true});cnGlow(g,x,y,r*.8,'#fff0d8',.72*amt,{core:1});
  g.globalCompositeOperation='lighter';
  const len=hor?W*.55:H*.55,t=(1.4+2.2*amt)*u;
  g.fillStyle=hor?cnLG(g,x-len*G.sgn*-.2,y,x+len*(G.sgn<0?1:-1),y,[[0,cnA('#fff4e0',.55*amt)],[.25,cnA(tint,.25*amt)],[1,cnA(tint,0)]]):cnLG(g,x,y,x,y+len,[[0,cnA('#fff4e0',.55*amt)],[.25,cnA(tint,.25*amt)],[1,cnA(tint,0)]]);
  if(hor)g.fillRect(Math.min(x,x+len*(G.sgn<0?1:-1)),y-t/2,len,t);else g.fillRect(x-t/2,y,t,len);
  g.restore();
}

/* ---- the station: spine truss, habitat module with a spun ring, solar wings, dish, spire, docking port. Lit from one side, planet-glow bounce from the other ---- */
const CBS_STEEL=['#d3dcec','#8794ad','#4b566e','#1c2338'];
function cbsStLights(sz){                                                                                                  // blinking lights in station units (shared by the bake and the anim)
  return[{x:-.5,y:0,c:'#ff4a3a',per:1.9,ph:.1,on:.55},{x:.5,y:0,c:'#4aff8a',per:1.9,ph:.1,on:.55},{x:-.455,y:-.15,c:'#ff4a3a',per:2.6,ph:.5,on:.18},{x:.0,y:-.062,c:'#ffffff',per:1.4,ph:.8,on:.07},
    {x:.38,y:.335,c:'#fff4d0',per:2.2,ph:.3,on:.09},{x:-.38,y:-.335,c:'#fff4d0',per:2.2,ph:1.1,on:.09},{x:.585,y:0,c:'#ffb24a',per:1.2,ph:.4,on:.4}];
}
function cbsStation(g,x,y,sz,rot,L,bounce){
  const c=Math.cos(rot),s=Math.sin(rot),lx=L[0]*c+L[1]*s,ly=-L[0]*s+L[1]*c,px=1/sz;
  g.save();g.translate(x,y);g.rotate(rot);g.scale(sz,sz);g.lineJoin='round';g.lineCap='round';
  const lit=(x0,y0,x1,y1,k)=>{const cxm=(x0+x1)/2,cym=(y0+y1)/2,e=Math.max(Math.abs(x1-x0)*Math.abs(lx),Math.abs(y1-y0)*Math.abs(ly),.001)*.5+.002;
    return cnLG(g,cxm+lx*e,cym+ly*e,cxm-lx*e,cym-ly*e,[[0,CBS_STEEL[0]],[.35,CBS_STEEL[1]],[.8,CBS_STEEL[2]],[1,cnMix(CBS_STEEL[3],bounce,.28)]]);};
  const rim=(w,a)=>{g.strokeStyle=cnA('#ffffff',a);g.lineWidth=w;};
  /* solar wings behind the module (parallelograms with a gold cell grid) */
  const wing=(wx,dir,w,h,skew)=>{
    const y0=dir*.03,y1=dir*(.03+h),pts=[[wx-w/2,y0],[wx+w/2,y0],[wx+w/2+skew,y1],[wx-w/2+skew,y1]];
    g.strokeStyle='#2a3350';g.lineWidth=px*1.4;g.beginPath();g.moveTo(wx,0);g.lineTo(wx+skew*.5,y1*.5);g.stroke();                       // boom
    g.fillStyle=cnLG(g,wx-lx*w,y0*(1-ly*.0)-ly*h*.5*dir,wx+lx*w,y1,[[0,'#3a68b8'],[.5,'#1f3f86'],[1,'#0f2150']]);
    g.beginPath();pts.forEach((q,i)=>i?g.lineTo(q[0],q[1]):g.moveTo(q[0],q[1]));g.closePath();g.fill();
    g.save();g.beginPath();pts.forEach((q,i)=>i?g.lineTo(q[0],q[1]):g.moveTo(q[0],q[1]));g.closePath();g.clip();
    g.strokeStyle='rgba(214,178,84,.46)';g.lineWidth=px*.7;
    for(let i=1;i<3;i++){const f=i/3;g.beginPath();g.moveTo(pts[0][0]+(pts[1][0]-pts[0][0])*f,y0);g.lineTo(pts[3][0]+(pts[2][0]-pts[3][0])*f,y1);g.stroke();}
    for(let i=1;i<7;i++){const f=i/7,yy=y0+(y1-y0)*f,off=skew*f;g.beginPath();g.moveTo(wx-w/2+off,yy);g.lineTo(wx+w/2+off,yy);g.stroke();}
    g.fillStyle='rgba(255,255,255,.13)';g.beginPath();g.moveTo(pts[0][0],y0);g.lineTo(pts[0][0]+w*.34,y0);g.lineTo(pts[3][0]+w*.62,y1);g.lineTo(pts[3][0]+w*.28,y1);g.closePath();g.fill();g.restore();
    g.strokeStyle='#0b1226';g.lineWidth=px*1.1;g.beginPath();pts.forEach((q,i)=>i?g.lineTo(q[0],q[1]):g.moveTo(q[0],q[1]));g.closePath();g.stroke();
    rim(px*.9,.38);g.beginPath();g.moveTo(pts[lx<0?1:0][0],y0);g.lineTo(pts[lx<0?2:3][0],y1);g.stroke();
  };
  for(const sg of[-1,1]){wing(sg*.37,-1,.13,.3,sg*.025);wing(sg*.37,1,.13,.3,-sg*.025);}
  for(const sg of[-1,1]){wing(sg*.215,-1,.05,.14,sg*.01);wing(sg*.215,1,.05,.14,-sg*.01);}
  /* spine truss */
  g.fillStyle=lit(-.5,-.016,.5,.016);g.fillRect(-.5,-.016,1,.032);g.strokeStyle='rgba(8,12,24,.7)';g.lineWidth=px*.8;
  for(let i=-10;i<=10;i++){g.beginPath();g.moveTo(i*.05,-.016);g.lineTo(i*.05+.025,.016);g.stroke();}
  rim(px,.5);g.beginPath();g.moveTo(-.5,ly>0?-.016:.016);g.lineTo(.5,ly>0?-.016:.016);g.stroke();
  /* habitat ring: back half, module, front half, spokes */
  const ring=(a0,a1)=>{g.strokeStyle=cnLG(g,0,-.07*Math.abs(ly)-.001,0,.07*Math.abs(ly)+.001,[[0,CBS_STEEL[1]],[1,CBS_STEEL[3]]]);g.lineWidth=.022;g.beginPath();g.ellipse(0,0,.215,.075,0,a0,a1);g.stroke();
    g.strokeStyle='rgba(255,255,255,.28)';g.lineWidth=px*.9;g.beginPath();g.ellipse(0,-.0,.226,.0825,0,a0,a1);g.stroke();};
  ring(Math.PI,TAU);
  g.fillStyle=lit(-.115,-.06,.115,.06);g.beginPath();g.moveTo(-.1,-.06);g.lineTo(.1,-.06);g.quadraticCurveTo(.125,-.06,.125,-.035);g.lineTo(.125,.035);g.quadraticCurveTo(.125,.06,.1,.06);g.lineTo(-.1,.06);g.quadraticCurveTo(-.125,.06,-.125,.035);g.lineTo(-.125,-.035);g.quadraticCurveTo(-.125,-.06,-.1,-.06);g.closePath();g.fill();
  g.strokeStyle='rgba(8,12,24,.75)';g.lineWidth=px;g.stroke();
  g.strokeStyle='rgba(8,12,24,.55)';g.lineWidth=px*.7;for(const gx of[-.07,.0,.07]){g.beginPath();g.moveTo(gx,-.06);g.lineTo(gx,.06);g.stroke();}
  rim(px,.5);g.beginPath();g.moveTo(-.1,ly>0?-.06:.06);g.lineTo(.1,ly>0?-.06:.06);g.stroke();
  ring(0,Math.PI);
  g.strokeStyle='#323b55';g.lineWidth=px*1.6;for(const a of[.55,1.35,1.8,2.6]){g.beginPath();g.moveTo(Math.cos(a)*.125,Math.sin(a)*.045);g.lineTo(Math.cos(a)*.205,Math.sin(a)*.07);g.stroke();}
  /* windows (warm) on the module and along the ring's near side */
  g.fillStyle='rgba(255,214,140,.9)';
  for(let i=0;i<8;i++)g.fillRect(-.092+i*.026,-.022,.011,.007);for(let i=0;i<7;i++)g.fillRect(-.078+i*.026,.016,.011,.006);
  for(let i=0;i<13;i++){const a=.2+i*(Math.PI-.4)/12;g.fillRect(Math.cos(a)*.215-.004,Math.sin(a)*.075-.002,.008,.004);}
  /* left: antenna dish and spire; right: docking module with a port frame */
  g.fillStyle=lit(-.62,-.01,-.5,.01);g.beginPath();g.ellipse(-.545,.02,.045,.014,-.5,0,TAU);g.fill();g.strokeStyle='#4b566e';g.lineWidth=px*1.2;g.beginPath();g.moveTo(-.5,.0);g.lineTo(-.535,.02);g.stroke();
  g.strokeStyle='#8794ad';g.lineWidth=px*1.4;g.beginPath();g.moveTo(-.455,-.016);g.lineTo(-.455,-.15);g.stroke();g.beginPath();g.moveTo(-.48,-.1);g.lineTo(-.43,-.1);g.stroke();
  g.fillStyle=lit(.5,-.034,.6,.034);g.fillRect(.5,-.034,.085,.068);g.fillStyle='#1c2338';g.fillRect(.585,-.04,.016,.08);g.strokeStyle='rgba(8,12,24,.7)';g.lineWidth=px*.8;g.strokeRect(.5,-.034,.085,.068);
  rim(px,.45);g.beginPath();g.moveTo(.5,ly>0?-.034:.034);g.lineTo(.585,ly>0?-.034:.034);g.stroke();
  g.restore();
}
function cbsStationAnim(g,x,y,sz,rot,t,S){
  const c=Math.cos(rot),s=Math.sin(rot),lights=cbsStLights(sz),u=S.u;g.save();g.globalCompositeOperation='lighter';
  for(const l of lights){
    const k=S.rm?.5:cnFrac((t+l.ph)/l.per)<l.on?1:.12,px=x+(l.x*c-l.y*s)*sz,py=y+(l.x*s+l.y*c)*sz;
    cnGlow(g,px,py,(3.2+.016*sz)*u*(k>.5?1.5:1),l.c,.18+.6*k,{core:k>.5?.7:0});
  }
  g.restore();
}
/* ---- background traffic: tiny silhouettes with an engine glow; sizes follow S.u ---- */
function cbsShip(g,x,y,len,rot,kind,L,bounce,eng){
  const c=Math.cos(rot),s=Math.sin(rot),lx=L[0]*c+L[1]*s,ly=-L[0]*s+L[1]*c;
  g.save();g.translate(x,y);g.rotate(rot);g.scale(len,len);g.lineJoin='round';
  const hull=kind===0?[[.5,0],[.18,-.05],[-.3,-.075],[-.5,-.05],[-.5,.05],[-.3,.075],[.18,.05]]:kind===1?[[.5,0],[.3,-.12],[-.1,-.16],[-.5,-.09],[-.5,.09],[-.1,.16],[.3,.12]]:[[.5,-.04],[.5,.04],[.1,.07],[-.5,.07],[-.5,-.07],[.1,-.07]];
  cnGlow(g,-.52,0,.38,eng,.5,{core:.7});
  g.fillStyle=cnLG(g,lx*.1,ly*.12,-lx*.1,-ly*.12,[[0,'#aab6cc'],[.45,'#59647c'],[1,cnMix('#1a2034',bounce,.3)]]);
  g.beginPath();hull.forEach((q,i)=>i?g.lineTo(q[0],q[1]):g.moveTo(q[0],q[1]));g.closePath();g.fill();
  g.strokeStyle='rgba(6,10,20,.8)';g.lineWidth=.012;g.stroke();
  if(kind===2){g.strokeStyle='rgba(6,10,20,.7)';g.lineWidth=.01;for(let i=-3;i<=2;i++){g.beginPath();g.moveTo(i*.14,-.07);g.lineTo(i*.14,.07);g.stroke();}}
  else{g.fillStyle='rgba(190,230,255,.85)';g.fillRect(kind===0?.2:.22,-.016,.1,.03);}
  g.fillStyle=eng;g.fillRect(-.53,-.032,.04,.064);g.restore();
}
function cbsTraffic(p,G,W,H,seed,u){
  const n=Math.max(0,Math.min(6,Math.round(+p.ships||0))),out=[],hor=G.limb==='bottom'||G.limb==='top';
  for(let i=0;i<n;i++){
    let px=0,py=0,ok=false;
    for(let tr=0;tr<14&&!ok;tr++){
      const a=cnR(seed,i*17+tr,0x92),b=cnR(seed,i*17+tr,0x93),high=cnR(seed,i,0x94)<.5;
      px=W*(.06+.88*a);
      if(hor){const hy=cbsHorizon(G,px);py=high?H*(.07+.17*b):hy-H*(.04+.12*b)*(G.limb==='bottom'?1:-1);}
      else{py=H*(.07+.86*b);const hx=cbsHorizon(G,py);px=high?W*(.3+.4*a):hx+(G.limb==='left'?1:-1)*W*(.05+.1*b);}
      const fx=px/W,fy=py/H;ok=!(fy>.25&&((fx>.17&&fx<.39)||(fx>.61&&fx<.83)))&&fx>.02&&fx<.98&&fy>.04&&fy<.95;
      if(ok){const d=Math.hypot(px-G.cx,py-G.cy);if(d<G.R*1.01&&(G.limb==='bottom'?py>cbsHorizon(G,px)-4*u:G.limb==='top'?py<cbsHorizon(G,px)+4*u:G.limb==='left'?px<cbsHorizon(G,py)+4*u:px>cbsHorizon(G,py)-4*u))ok=false;}
    }
    if(!ok)continue;
    const lead=(hor?G.sgn:1)*(cnR(seed,i,0x95)<.5?1:-1),rot=hor?(lead>0?0:Math.PI)+(cnR(seed,i,0x96)-.5)*.22:(lead>0?Math.PI/2:-Math.PI/2)+(cnR(seed,i,0x96)-.5)*.2;
    out.push({x:px,y:py,rot,len:(18+22*cnR(seed,i,0x97))*u,kind:Math.floor(cnR(seed,i,0x98)*3),ph:cnR(seed,i,0x99)*5});
    /* an escort next to the bigger ones */
    if(out[out.length-1].len>30*u&&cnR(seed,i,0x9a)<.6)out.push({x:px-Math.cos(rot)*34*u+Math.sin(rot)*10*u,y:py-Math.sin(rot)*34*u-Math.cos(rot)*10*u,rot,len:12*u,kind:1,ph:cnR(seed,i,0x9b)*5});
  }
  return out;
}
const cbsStationPos=(G,W,H)=>G.limb==='bottom'?[.54,.22]:G.limb==='top'?[.5,.5]:G.limb==='left'?[.62,.24]:[.38,.24];
const ORBIT=(g,W,H,p,t,seed,S)=>{
  const F=S.fill,u=S.u,type=CN_PLANET[p.planet]?p.planet:'azure',pal=CN_PLANET[type],G=cbsOrbitGeo(p,W,H,seed),glow=cnC01(p.glow==null?.5:+p.glow);
  cbsSpaceBack(g,W,H,F,seed,S,'none',.55,0,{top:'#01030c',bot:'#070d22',starMul:.9});
  const R=G.R,rg=cbsRegion(G.cx,G.cy,R,F,1),tier=S.tier,atm=true;
  const sunTint=cnMix(pal.atm,'#ffb878',.55);
  /* upper-air glow behind the limb, then the planet body, then the halo and the sunrise */
  const K=cbsSphere(g,G.cx,G.cy,R,{type,pal,L:G.L,seed,F,freq:2.4*Math.min(3.4,Math.pow(R/(H*.33),.7)),atm,ring:null,axis:G.axis,haze:.42,tame:1,cap:Math.round(125000*S.part)});
  if(K&&rg)cbsCities(g,G.cx,G.cy,R,{L:G.L,seed,pal,axis:G.axis},K,rg,u,.6+.8*glow);
  const hs=(.4+1.0*glow);cbsHalo(g,G.cx,G.cy,R,pal,G.L,hs*(K?K.atmK:1),Math.min(.2,95*u/R),u,F);
  cbsSunrise(g,G,W,H,F,glow,u,sunTint);
  /* the station and the traffic */
  const sp=cbsStationPos(G,W,H),bounce=pal.atm,toward=[G.cx-W*sp[0],G.cy-H*sp[1]],tl=Math.hypot(toward[0],toward[1])||1;
  if(p.station){
    const sz=H*.34,rot=(G.limb==='bottom'||G.limb==='top'?.1*G.sgn:Math.PI/2*.0+.12)+(cnR(seed,3,0x9c)-.5)*.06;
    cbsStation(g,W*sp[0],H*sp[1],sz,rot,G.L,bounce);
  }
  for(const sh of cbsTraffic(p,G,W,H,seed,u))cbsShip(g,sh.x,sh.y,sh.len,sh.rot,sh.kind,G.L,bounce,'#bfe8ff');
  cbsVeil(g,F,W,H,G.limb==='top'?.12:.22);
};
ORBIT.static=true;
ORBIT.anim=(g,W,H,p,t,seed,S)=>{
  const F=S.fill,u=S.u,G=cbsOrbitGeo(p,W,H,seed);
  cbsTwinkle(g,F,seed+101,t,S,0,24,null);
  if(p.station){const sp=cbsStationPos(G,W,H),sz=H*.34,rot=(G.limb==='bottom'||G.limb==='top'?.1*G.sgn:.12)+(cnR(seed,3,0x9c)-.5)*.06;cbsStationAnim(g,W*sp[0],H*sp[1],sz,rot,t,S);}
  for(const sh of cbsTraffic(p,G,W,H,seed,u)){
    const c=Math.cos(sh.rot),s=Math.sin(sh.rot),on=S.rm?1:(cnFrac((t+sh.ph)/1.7)<.14?1:.15);
    cnGlow(g,sh.x+(-.0*c)*sh.len,sh.y+(-.0*s)*sh.len-sh.len*.0,2.6*u,(sh.kind&1)?'#ff5a4a':'#5aff9a',.15+.55*on,{core:on>.5?.5:0});
  }
};
CINE_PAINT.bg.orbit=ORBIT;


/* ------------------------------------------------ 11. array: the great ring above a world (dormant / charging / firing / broken) ------------------------------------------------ */
const CBS_ARR={dormant:{lit:0,hot:'#5ac8ff',core:'#9ad0ff'},charging:{lit:.62,hot:'#ffd45a',core:'#fff0b8'},firing:{lit:1,hot:'#ff7a5a',core:'#fff4e8'},broken:{lit:0,hot:'#ff4a3a',core:'#ff7a5a'}};
const CBS_STEEL2=['#c4cee0','#7c88a2','#454f68','#1a2136'];
function cbsArrayGeo(p,W,H,seed){
  const st=CBS_ARR[p.state]?p.state:'dormant',ky=.34+.04*cnHash(seed,1,0xa1),Ro=H*.42;
  return{st,N:36,ky,Ro,Ri:Ro*.82,hw:H*.032,ax:W*.5,ay:H*.37,rot:.03+cnHash(seed,3,0xa1)*.05,
    gap:st==='broken'?{a0:-1.0+cnHash(seed,2,0xa1)*.4,span:1.2}:null};
}
const cbsInGap=(G,a)=>{if(!G.gap)return false;const d=((a-G.gap.a0)%TAU+TAU)%TAU;return d<G.gap.span;};
const cbsEll=(G,r,a,dy)=>[G.ax+Math.cos(a)*r,G.ay+(dy||0)+Math.sin(a)*r*G.ky];
/* one half of the ring: back (upper in the frame, inner walls visible) or front (lower, outer walls visible) */
function cbsArrayHalf(g,G,c,back){
  const{N,ky,Ro,Ri,hw,ax,ay}=G,step=TAU/N,u=c.u,st=G.st,A=CBS_ARR[st],la=Math.atan2(-.5,c.L[0]*.9);
  const poly=(a0,a1)=>{g.beginPath();g.ellipse(ax,ay,Ro,Ro*ky,0,a0,a1);g.ellipse(ax,ay,Ri,Ri*ky,0,a1,a0,true);g.closePath();};
  const wall=(r,a0,a1)=>{g.beginPath();g.ellipse(ax,ay,r,r*ky,0,a0,a1);g.ellipse(ax,ay+hw,r,r*ky,0,a1,a0,true);g.closePath();};
  for(let i=0;i<N;i++){
    const a0=i*step+G.rot+step*.06,a1=(i+1)*step+G.rot-step*.06,am=(a0+a1)/2,sn=Math.sin(am);
    if(back?sn>=0:sn<0)continue;if(cbsInGap(G,am))continue;
    const v=cnHash(c.seed,i,0xa2),lf=.5+.5*Math.cos(am-la),broken=st==='broken'&&v<.22;
    if(back){g.fillStyle=cnLG(g,0,ay-Ri*ky,0,ay-Ri*ky+hw*3,[[0,cnShade(CBS_STEEL2[1],-.15)],[1,CBS_STEEL2[3]]]);wall(Ri,a0,a1);g.fill();}
    else{g.fillStyle=cnLG(g,0,ay+Ro*ky*.9,0,ay+Ro*ky+hw*1.5,[[0,CBS_STEEL2[2]],[.55,cnMix(CBS_STEEL2[3],c.bounce,.22)],[1,cnMix(CBS_STEEL2[3],c.bounce,.5)]]);wall(Ro,a0,a1);g.fill();}
    const ox=ax+Math.cos(am)*Ro,oy=ay+Math.sin(am)*Ro*ky,ix=ax+Math.cos(am)*Ri,iy=ay+Math.sin(am)*Ri*ky;
    g.fillStyle=cnLG(g,ox,oy,ix,iy,[[0,cnShade(cnMix(CBS_STEEL2[1],CBS_STEEL2[0],lf*.75),(v-.5)*.16)],[.55,cnMix(CBS_STEEL2[1],CBS_STEEL2[2],.3+.4*(1-lf))],[1,cnMix(CBS_STEEL2[2],CBS_STEEL2[3],.55)]]);
    poly(a0,a1);g.fill();
    if(broken){g.fillStyle='rgba(8,10,18,.55)';poly(a0,a1);g.fill();}
    g.strokeStyle='rgba(6,10,20,.75)';g.lineWidth=u;g.stroke();
    g.strokeStyle=cnA('#ffffff',.14+.26*lf);g.lineWidth=u*.8;g.beginPath();g.ellipse(ax,ay,Ro-u*.6,(Ro-u*.6)*ky,0,a0,a1);g.stroke();
    /* centre seam + lens node every third segment */
    const nr=(Ro+Ri)/2,mx=ax+Math.cos(am)*nr,my=ay+Math.sin(am)*nr*ky;
    g.strokeStyle='rgba(8,12,24,.45)';g.lineWidth=u*.7;g.beginPath();g.moveTo(...cbsEll(G,Ri+(Ro-Ri)*.08,am));g.lineTo(...cbsEll(G,Ro-(Ro-Ri)*.08,am));g.stroke();
    if(i%3===1){
      const ord=(((am-G.rot+Math.PI/2)%TAU)+TAU)%TAU/TAU,lit=!broken&&(st==='firing'||(st==='charging'&&ord<A.lit));
      g.save();g.translate(mx,my);g.scale(1,ky*1.1);g.fillStyle='#0c1224';g.beginPath();g.arc(0,0,(Ro-Ri)*.3,0,TAU);g.fill();
      g.fillStyle=lit?A.hot:cnMix('#26354f',st==='broken'?'#552018':'#3a6aa8',.45);g.beginPath();g.arc(0,0,(Ro-Ri)*.2,0,TAU);g.fill();g.restore();
      if(lit)cnGlow(g,mx,my,(Ro-Ri)*1.0,A.hot,.42,{core:.6});
    }
    if(i%6===1&&!broken){                                                                                          // emitter pylons stand on the outer rim
      const[bx,by]=cbsEll(G,Ro*.975,am),bw=Ro*.026,tw=Ro*.012,hp=Ro*(.1+.03*v),ord=(((am-G.rot+Math.PI/2)%TAU)+TAU)%TAU/TAU,lit=st==='firing'||(st==='charging'&&ord<A.lit);
      g.fillStyle=cnLG(g,bx-bw,by,bx+bw,by,[[0,cnMix(CBS_STEEL2[0],CBS_STEEL2[1],.2)],[.5,CBS_STEEL2[1]],[1,CBS_STEEL2[3]]]);
      g.beginPath();g.moveTo(bx-bw,by);g.lineTo(bx+bw,by);g.lineTo(bx+tw,by-hp);g.lineTo(bx-tw,by-hp);g.closePath();g.fill();g.strokeStyle='rgba(6,10,20,.8)';g.lineWidth=u*.9;g.stroke();
      g.fillStyle=lit?A.hot:cnMix('#26354f','#3a6aa8',.5);g.beginPath();g.arc(bx,by-hp,tw*1.5,0,TAU);g.fill();
      if(lit)cnGlow(g,bx,by-hp,Ro*.07,A.hot,.7,{core:.8});
    }
  }
}
function cbsArraySpokes(g,G,c){
  const{ax,ay,ky,Ri,Ro}=G,u=c.u,hubR=Ro*.085;
  g.strokeStyle=cnLG(g,ax-Ro*.2,ay,ax+Ro*.2,ay,[[0,CBS_STEEL2[1]],[1,CBS_STEEL2[3]]]);g.lineWidth=Ro*.022;g.beginPath();g.ellipse(ax,ay,Ro*.22,Ro*.22*ky,0,0,TAU);g.stroke();g.strokeStyle=cnA('#ffffff',.25);g.lineWidth=u*.8;g.beginPath();g.ellipse(ax,ay,Ro*.232,Ro*.232*ky,0,3.3,5.2);g.stroke();
  for(let k=0;k<6;k++){
    const th=.26+k*TAU/6+G.rot;let r1=Ri*.99;
    if(cbsInGap(G,th)){r1=hubR*1.4+Ri*(.18+.3*cnHash(c.seed,k,0xa4));}
    const x0=ax+Math.cos(th)*hubR,y0=ay+Math.sin(th)*hubR*ky,x1=ax+Math.cos(th)*r1,y1=ay+Math.sin(th)*r1*ky,w=Ro*.016;
    g.save();g.lineCap='butt';
    g.strokeStyle=cnLG(g,x0,y0,x1,y1,[[0,CBS_STEEL2[2]],[1,CBS_STEEL2[1]]]);g.lineWidth=w*2.2;g.beginPath();g.moveTo(x0,y0);g.lineTo(x1,y1);g.stroke();
    g.strokeStyle='rgba(6,10,20,.55)';g.lineWidth=u*.8;g.setLineDash([u*3,u*5]);g.beginPath();g.moveTo(x0,y0);g.lineTo(x1,y1);g.stroke();g.setLineDash([]);
    g.strokeStyle=cnA('#ffffff',.22);g.lineWidth=u*.8;g.beginPath();g.moveTo(x0,y0-w*.5);g.lineTo(x1,y1-w*.5);g.stroke();
    if(c.st==='charging'||c.st==='firing'){g.globalCompositeOperation='lighter';g.strokeStyle=cnA(CBS_ARR[c.st].hot,c.st==='firing'?.5:.28);g.lineWidth=u*1.6;g.beginPath();g.moveTo(x0,y0);g.lineTo(x1,y1);g.stroke();}
    g.restore();
  }
}
function cbsArrayHub(g,G,c){
  const{ax,ay,Ro}=G,r=Ro*.085,u=c.u,st=G.st,A=CBS_ARR[st];
  g.save();g.translate(ax,ay);g.scale(1,.92);
  g.fillStyle=cnRG(g,-r*.3,-r*.35,r*.1,r*1.15,[[0,'#aab6cc'],[.5,'#56627c'],[1,'#141a2c']]);g.beginPath();g.arc(0,0,r,0,TAU);g.fill();
  g.strokeStyle='rgba(6,10,20,.85)';g.lineWidth=u;g.stroke();g.strokeStyle='rgba(255,255,255,.3)';g.lineWidth=u*.8;g.beginPath();g.arc(0,0,r-u*.6,3.5,4.9);g.stroke();
  g.fillStyle='#080c18';g.beginPath();g.arc(0,0,r*.6,0,TAU);g.fill();
  const hot=st==='firing'?1:st==='charging'?.72:st==='broken'?.12:.2;
  g.fillStyle=cnRG(g,0,0,0,r*.58,[[0,cnA('#ffffff',.18+.82*hot)],[.4,cnA(A.core,.3+.65*hot)],[1,cnA(A.hot,.15+.35*hot)]]);g.beginPath();g.arc(0,0,r*.54,0,TAU);g.fill();
  if(st==='broken'){g.strokeStyle='rgba(255,90,60,.7)';g.lineWidth=u*.9;g.beginPath();g.moveTo(-r*.5,-r*.3);g.lineTo(-r*.1,r*.05);g.lineTo(r*.2,-r*.1);g.lineTo(r*.52,r*.4);g.stroke();}
  g.restore();
}
function cbsArrayDebris(g,G,c){
  if(!G.gap)return;const{ax,ay,Ro,Ri,ky}=G,n=14,u=c.u,sd=c.seed;
  for(let i=0;i<n;i++){
    const ang=G.gap.a0+G.gap.span*(.05+.9*cnR(sd,i,0xb1))+(cnR(sd,i,0xb2)-.5)*.5,r=(Ri+Ro)/2+(cnR(sd,i,0xb3)-.25)*Ro*.7,x=ax+Math.cos(ang)*r,y=ay+Math.sin(ang)*r*ky+(cnR(sd,i,0xb4)-.4)*Ro*.22,sz=(5+Math.pow(cnR(sd,i,0xb5),2)*28)*u,rot=cnR(sd,i,0xb6)*TAU;
    g.save();g.translate(x,y);g.rotate(rot);const m=5+Math.floor(cnR(sd,i,0xb7)*3),pts=[];
    for(let k=0;k<m;k++){const a=k/m*TAU,rr=sz*(.5+.5*cnR(sd,i*9+k,0xb8));pts.push([Math.cos(a)*rr,Math.sin(a)*rr*(.45+.4*cnR(sd,i,0xb9))]);}
    g.fillStyle=cnLG(g,-sz*.5,-sz*.4,sz*.5,sz*.5,[[0,'#98a4bc'],[.5,'#4a556e'],[1,'#161c2e']]);g.beginPath();pts.forEach((q,k)=>k?g.lineTo(q[0],q[1]):g.moveTo(q[0],q[1]));g.closePath();g.fill();
    g.strokeStyle='rgba(6,10,20,.8)';g.lineWidth=u*.8;g.stroke();g.strokeStyle=cnA('#ffffff',.25);g.beginPath();g.moveTo(pts[0][0],pts[0][1]);g.lineTo(pts[1][0],pts[1][1]);g.stroke();g.restore();
    if(sz>14*u)cnGlow(g,x,y,sz*.9,'#ff6a3a',.16);
  }
  /* the torn ends: exposed girders and hot metal */
  for(const e of[G.gap.a0,G.gap.a0+G.gap.span]){
    const[x,y]=cbsEll(G,(Ro+Ri)/2,e);g.save();g.translate(x,y);g.strokeStyle='#2b3550';g.lineWidth=u*1.4;
    for(let k=0;k<5;k++){const a=cnR(sd,k+(e>0?9:0),0xbc)*TAU,l=(8+cnR(sd,k,0xbd)*16)*u;g.beginPath();g.moveTo(0,0);g.lineTo(Math.cos(a)*l,Math.sin(a)*l*.6);g.stroke();}
    g.restore();cnGlow(g,x,y,(Ro-Ri)*1.3,'#ff6a3a',.5,{core:.5});
  }
}
function cbsArrayBeam(g,G,c,impY,F){
  const{ax,ay,Ro}=G,u=c.u,A=CBS_ARR[G.st],hubR=Ro*.085,fire=G.st==='firing',y0=ay+hubR*.4,y1=fire?impY:ay+(impY-ay)*.42,wt=Ro*(fire?.05:.012),wb=Ro*(fire?.2:.05);
  g.save();g.globalCompositeOperation='lighter';
  const layer=(k,col,a)=>{g.fillStyle=cnLG(g,0,y0,0,y1,[[0,cnA(col,a)],[.8,cnA(col,a*.75)],[1,cnA(col,fire?a:0)]]);g.beginPath();g.moveTo(ax-wt*k,y0);g.lineTo(ax+wt*k,y0);g.lineTo(ax+wb*k,y1);g.lineTo(ax-wb*k,y1);g.closePath();g.fill();};
  if(fire){layer(3.2,A.hot,.14);layer(1.8,A.hot,.3);layer(1,'#ffc08a',.62);layer(.42,'#ffffff',.9);}else{layer(2.4,A.hot,.12);layer(1,A.hot,.3);layer(.4,A.core,.5);}
  g.restore();
}
const CBS_ARR_IMP=(G,H,oG)=>cbsHorizon(oG,G.ax)+H*.03;
const ARRAY=(g,W,H,p,t,seed,S)=>{
  const F=S.fill,u=S.u,type=CN_PLANET[p.planet]?p.planet:'azure',pal=CN_PLANET[type],G=cbsArrayGeo(p,W,H,seed),A=CBS_ARR[G.st],oG=cbsOrbitGeo({limb:'bottom'},W,H,seed);
  cbsSpaceBack(g,W,H,F,seed,S,cnHash(seed,9,0xa3)<.5?'violet':'blue',.5,0,{top:'#01030c',bot:'#060b20',starMul:.8});
  const R=oG.R,rg=cbsRegion(oG.cx,oG.cy,R,F,1),Kp=cbsSphere(g,oG.cx,oG.cy,R,{type,pal,L:oG.L,seed,F,freq:2.4*Math.min(3.4,Math.pow(R/(H*.33),.7)),atm:true,ring:null,axis:oG.axis,haze:.42,tame:1,cap:Math.round(100000*S.part)});
  if(Kp&&rg)cbsCities(g,oG.cx,oG.cy,R,{L:oG.L,seed,pal,axis:oG.axis},Kp,rg,u,.9);
  cbsHalo(g,oG.cx,oG.cy,R,pal,oG.L,.9*(Kp?Kp.atmK:1),Math.min(.2,95*u/R),u,F);
  cbsSunrise(g,oG,W,H,F,.42,u,cnMix(pal.atm,'#ffb878',.55));
  const c={u,seed,bounce:pal.atm,L:oG.L,st:G.st},impY=CBS_ARR_IMP(G,H,oG);
  if(G.st==='firing')cnGlow(g,G.ax,impY,H*.34,A.hot,.55,{core:.9,squash:.34});
  cbsArrayHalf(g,G,c,true);
  cbsArraySpokes(g,G,c);
  if(G.st==='firing'||G.st==='charging')cbsArrayBeam(g,G,c,impY,F);
  cbsArrayHub(g,G,c);
  if(G.st==='firing'||G.st==='charging')cnGlow(g,G.ax,G.ay,G.Ro*(G.st==='firing'?.8:.45),A.hot,G.st==='firing'?.5:.3,{core:G.st==='firing'?.9:.5});
  cbsArrayDebris(g,G,c);
  cbsArrayHalf(g,G,c,false);
  /* lit seam along the ring rim for the powered states */
  if(G.st==='firing'||G.st==='charging'){
    g.save();g.globalCompositeOperation='lighter';g.lineCap='round';
    const a0=G.rot-Math.PI/2,span=TAU*A.lit;
    for(const[w,al]of[[7,.07],[3.4,.16],[1.4,.5]]){g.strokeStyle=cnA(A.hot,al*(G.st==='firing'?1.2:1));g.lineWidth=w*u;g.beginPath();g.ellipse(G.ax,G.ay,G.Ri-u,(G.Ri-u)*G.ky,0,a0,a0+span);g.stroke();}
    g.restore();
  }
  cbsVeil(g,F,W,H,.3);
};
ARRAY.static=true;
ARRAY.anim=(g,W,H,p,t,seed,S)=>{
  const F=S.fill,u=S.u,G=cbsArrayGeo(p,W,H,seed),A=CBS_ARR[G.st],oG=cbsOrbitGeo({limb:'bottom'},W,H,seed),rm=S.rm,sp=rm?.3:1,impY=CBS_ARR_IMP(G,H,oG);
  cbsTwinkle(g,F,seed+101,t,S,0,22,null);
  g.save();g.globalCompositeOperation='lighter';
  const onRing=(a,r)=>cbsEll(G,r==null?(G.Ro+G.Ri)/2:r,a);
  if(G.st==='dormant'){
    for(let k=0;k<5;k++){const a=G.rot+k*TAU/5+.4,[x,y]=onRing(a),on=cnFrac((t*sp+k*.37)/2.6)<.2?1:.18;if(Math.sin(a)<-.0&&false)continue;cnGlow(g,x,y,5*u,A.hot,.12+.5*on,{core:on>.5?.6:0});}
    cnGlow(g,G.ax,G.ay,G.Ro*.1,A.core,.1+.08*Math.sin(t*sp*1.2),{});
  }else if(G.st==='charging'){
    const a0=G.rot-Math.PI/2,span=TAU*A.lit;
    for(let k=0;k<6;k++){const a=a0+cnFrac(t*sp*.16+k/6)*span,[x,y]=onRing(a,G.Ri-u*2);cnGlow(g,x,y,8*u,A.core,.55,{core:.8});}
    for(let k=0;k<6;k++){const th=.26+k*TAU/6+G.rot,f=cnFrac(t*sp*.5+k*.19),r=G.Ro*.085+(G.Ri*.99-G.Ro*.085)*(1-f),[x,y]=cbsEll(G,r,th);cnGlow(g,x,y,6*u,A.hot,.5*Math.sin(f*Math.PI),{core:.5});}
    cnGlow(g,G.ax,G.ay,G.Ro*(.22+.05*Math.sin(t*sp*2.4)),A.hot,.3,{core:.6});
  }else if(G.st==='firing'){
    const fl=rm?.75:.7+.3*cnFlicker(t,seed,18);
    g.strokeStyle=cnA('#ffffff',.55*fl);g.lineWidth=G.Ro*.03;g.lineCap='round';g.beginPath();g.moveTo(G.ax,G.ay+G.Ro*.04);g.lineTo(G.ax,impY);g.stroke();
    cnGlow(g,G.ax,G.ay,G.Ro*(.5+.08*fl),A.hot,.3*fl,{core:.7});
    for(let k=0;k<3;k++){const f=cnFrac(t*sp*.7+k/3);g.strokeStyle=cnA('#ffd2a8',.55*(1-f));g.lineWidth=(3.2*(1-f)+.8)*u;g.beginPath();g.ellipse(G.ax,impY,H*(.04+.38*f),H*(.04+.38*f)*.28,0,0,TAU);g.stroke();}
    cnGlow(g,G.ax,impY,H*(.18+.02*fl),'#ffd7a8',.5*fl,{core:.9,squash:.34});
    if(!rm)for(let k=0;k<10;k++){const f=cnFrac(t*1.3+k*.37+cnR(seed,k,0xc1)),a=-Math.PI*(.15+.7*cnR(seed,k,0xc2)),d=f*H*(.12+.14*cnR(seed,k,0xc3));g.fillStyle=cnA('#ffd08a',1-f);g.fillRect(G.ax+Math.cos(a)*d*1.6-u,impY+Math.sin(a)*d*.8-u+f*f*H*.05,2*u,2*u);}
  }else{                                                                                                            // broken: sparks at the torn ends, emergency lights, a dying hub
    for(const[ei,e]of[G.gap.a0,G.gap.a0+G.gap.span].entries()){
      const[x,y]=cbsEll(G,(G.Ro+G.Ri)/2,e),f=rm?.5:cnFlicker(t,seed+ei*7,11);
      cnGlow(g,x,y,(G.Ro-G.Ri)*(.9+.9*f),'#ff7a3a',.25+.5*f,{core:f>.55?.8:0});
      if(!rm){const b=Math.floor(t*9);for(let k=0;k<4;k++){if(cnR(seed,b*4+k+ei*50,0xc5)>.5)continue;const a=cnR(seed,b*4+k,0xc6)*TAU,l=(8+cnR(seed,b*4+k,0xc7)*18)*u;g.strokeStyle=cnA('#ffd08a',.9);g.lineWidth=1.3*u;g.beginPath();g.moveTo(x,y);g.lineTo(x+Math.cos(a)*l,y+Math.sin(a)*l*.7);g.stroke();}}
    }
    for(let k=0;k<4;k++){const a=G.rot+k*1.7+3.2;if(cbsInGap(G,a))continue;const[x,y]=onRing(a),on=cnFrac((t*sp+k*.6)/1.6)<.35?1:.1;cnGlow(g,x,y,5*u,'#ff3a2a',.1+.6*on,{core:on>.5?.6:0});}
    cnGlow(g,G.ax,G.ay,G.Ro*.07,'#ff5a3a',.1+.12*Math.sin(t*sp*3),{});
  }
  g.restore();
};
CINE_PAINT.bg.array=ARRAY;

/*@@ANCHOR@@*/
})();
