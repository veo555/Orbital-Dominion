/* =========================================================================
   CINEMATIC ART (ground + interior backgrounds) — CINE_PAINT.bg.surface / base / ruins / battlefield / bridge / hall.   Contract: docs/CINEMATIC_SPEC.md §5.4
   Loads after 64_cine_art.js (registry + cn* helpers) and before 66_cine.js. Rendering only: pure functions of (params, t, seed); no Math.random / Date;
   no state carried between frames. Every painter is a STATIC bake (fn.static=true: drawn once per scene and size into an oversized canvas that already covers
   S.fill) plus a light fn.anim (smoke, fire, banners, tracers, console lights ...: closed form in t) that is redrawn per frame.
   One look for all six: a layered painterly-vector landscape / room lit by ONE key light (sun, moon or lamp) with a warm-lit side and a cool-ambient side,
   atmospheric perspective (every distant layer fades toward the horizon colour), faction language (Meridian steel-blue, Obsidian ember-red black stone,
   Aurora pearl and teal), and the game's own plate art (artBuilding / artUnit) re-used on oblique-projected volumes so films match the game.
   Composition rule shared by all: keep x~0.28 and x~0.72 (where the actors stand) and the lower third calm; the busy things live in the middle band, the
   centre gap and at the outer edges.   Helpers are prefixed `cbg` and live in this IIFE (the game is one big scope: nothing here may leak).
   ========================================================================= */
(()=>{
'use strict';

/* ------------------------------------------------ 1. small helpers ------------------------------------------------ */
const cbgL=(a,b,t)=>a+(b-a)*t;
const cbgRGB=c=>{const a=cnCol(c);return[a[0],a[1],a[2]];};
const cbgCl=(v,a,b)=>v<a?a:v>b?b:v;
const cbgPoly=(g,p)=>{g.beginPath();g.moveTo(p[0],p[1]);for(let i=2;i<p.length;i+=2)g.lineTo(p[i],p[i+1]);g.closePath();};
const cbgEll=(g,x,y,rx,ry,rot)=>{g.beginPath();g.ellipse(x,y,Math.max(.01,rx),Math.max(.01,ry),rot||0,0,TAU);};
/* a soft round puff (smoke, steam, dust, glow without the additive blend) */
function cbgPuff(g,x,y,r,col,a){if(!(a>.004)||!(r>.5))return;g.fillStyle=cnRG(g,x,y,0,r,[[0,cnA(col,a)],[.5,cnA(col,a*.55)],[1,cnA(col,0)]]);g.fillRect(x-r,y-r,r*2,r*2);}
/* multiply a colour by an rgb triple (light model) */
function cbgMul(c,m,k){c=cbgRGB(c);k=k==null?1:k;return cnRGB(c[0]*m[0]*k,c[1]*m[1]*k,c[2]*m[2]*k,1);}

/* ------------------------------------------------ 2. environment: sky, light, materials per biome x time of day ------------------------------------------------ */
const CBG_SKY={     // [zenith, mid, horizon]
  dust   :{day:['#5d7db0','#b5aa9c','#f0d3a6'],dusk:['#2b2f66','#b05f78','#ffb06a'],night:['#04061a','#101a3c','#343a5e'],dawn:['#3c3e80','#cc92a2','#ffd6a8']},
  crystal:{day:['#3c44a2','#8070d0','#dcc4ff'],dusk:['#1c1858','#8a3ea2','#ff94c4'],night:['#03031c','#160f50','#3e2e90'],dawn:['#2c2c8a','#a884d6','#ffd8ec']},
  ash    :{day:['#403c40','#75625e','#b88c68'],dusk:['#1c1416','#63302c','#ff7430'],night:['#050304','#1c0e10','#4e1c16'],dawn:['#2c2228','#82504a','#ffa468']},
  green  :{day:['#3d80d4','#92c8f2','#e2f6ea'],dusk:['#2b2a66','#d4647c','#ffb870'],night:['#030818','#0c1c42','#1e3c54'],dawn:['#3c5e9e','#eaaaac','#ffe4b4']},
  ice    :{day:['#4d8ad4','#acd4f4','#f2fbff'],dusk:['#2c3c7e','#ac9acc','#ffcaa8'],night:['#040a26','#0e2c5e','#3c6c9e'],dawn:['#3c5ea2','#c4b4dc','#ffeed6']}
};
const CBG_FAR={dust:'#94705a',crystal:'#52408f',ash:'#52403f',green:'#4d7a78',ice:'#5a7ea6'};
const CBG_MAT={     // ground far/near, rock, rock2 (lighter strata), accent
  dust   :{ground:['#a8835c','#5e4429'],rock:'#7e5e41',rock2:'#a07a52',accent:'#e0b070'},
  crystal:{ground:['#5a4a90','#221a46'],rock:'#4a3b80',rock2:'#6e5aae',accent:'#9ae8ff'},
  ash    :{ground:['#625860','#221e22'],rock:'#40383c',rock2:'#5e4e4e',accent:'#ff7a4a'},
  green  :{ground:['#59a050','#27552c'],rock:'#68725c',rock2:'#82906e',accent:'#d8f08a'},
  ice    :{ground:['#d6eaf8','#88b2d2'],rock:'#8eaac6',rock2:'#b8d0e4',accent:'#ffffff'}
};
const CBG_TOD={     // lit / amb are multipliers applied to material colours; sun = disc position (frame fractions; y null = just above the horizon)
  day  :{lit:[1.12,1.05,.92],amb:[.50,.58,.76],sx:.20,sy:.14,sr:.030,sc:'#fff4d4',gl:.60,len:.5,dark:.30,str:0},
  dusk :{lit:[1.34,.90,.62],amb:[.38,.36,.58],sx:.80,sy:null,sr:.052,sc:'#ff9a48',gl:.75,len:1.9,dark:.36,str:.35},
  night:{lit:[.52,.62,1.0],amb:[.18,.22,.40],sx:.66,sy:.17,sr:.036,sc:'#dce8ff',gl:.45,len:.9,dark:.20,str:1},
  dawn :{lit:[1.28,.98,.82],amb:[.42,.42,.62],sx:.17,sy:null,sr:.044,sc:'#ffc690',gl:.70,len:1.5,dark:.32,str:.25}
};
const cbgBio=b=>CBG_MAT[b]?b:'dust';
const cbgTod=t=>CBG_TOD[t]?t:'day';
/* surface colour under the scene light: a = how directly lit (0 shadow .. 1 full light) */
function cbgSh(E,col,a){const c=cbgRGB(col),L=E.T.lit,A=E.T.amb,k=cbgCl(a,0,1.4);return cnRGB(c[0]*(A[0]+(L[0]-A[0])*k),c[1]*(A[1]+(L[1]-A[1])*k),c[2]*(A[2]+(L[2]-A[2])*k),1);}
function cbgEnv(bio,tod,S,key){
  bio=cbgBio(bio);tod=cbgTod(tod);
  const T=CBG_TOD[tod],sky=CBG_SKY[bio][tod],M=CBG_MAT[bio],E={bio,tod,T,sky,mat:M,night:tod==='night',ld:T.sx<.5?1:-1};
  E.haze=tod==='night'?cnMix(sky[2],sky[1],.35):sky[2];
  E.lit=cnRGB(255*T.lit[0],255*T.lit[1],255*T.lit[2],1);E.litCol=tod==='night'?'#9ab4ff':tod==='day'?'#fff0cc':tod==='dusk'?'#ff9a52':'#ffc496';
  E.glow=tod==='night'?'#a8c4ff':tod==='day'?'#fff4d0':tod==='dusk'?'#ff8c40':'#ffbe90';
  E.warmLamp=tod==='day'?.0:tod==='dawn'?.45:tod==='dusk'?.8:1;      // how much artificial light shows
  E.sh=(c,a)=>cbgSh(E,c,a);E.fog=(c,k)=>cnMix(c,E.haze,k);
  return E;
}
/* the painter context shared by every function below */
function cbgCtx(g,W,H,p,seed,S,hz,bio,tod){
  const E=cbgEnv(bio,tod,S),F=S.fill;
  return{g,W,H,F,S,E,u:S.u,ld:E.ld,seed,hz,hzY:H*hz,p,fac:(p&&p.faction)||S.faction||'meridian',bat:S.tier==='battery'};
}
/* camera-independent frame helper: x of frame fraction */
const cbgX=(C,f)=>C.W*f;

/* ------------------------------------------------ 3. sky ------------------------------------------------ */
/* planet ring: back half behind the globe, front half over it. cx,cy = centre, r = globe radius */
function cbgRingedPlanet(g,C,cx,cy,r,pal,tilt,lightA){
  const ring=(front)=>{
    g.save();g.translate(cx,cy);g.rotate(tilt);g.scale(1,.3);
    const bands=[[1.38,1.58,.0,.42],[1.62,1.74,.0,.22],[1.78,2.08,.0,.5],[2.14,2.2,.0,.3]];
    for(const b of bands){
      g.beginPath();g.arc(0,0,r*(b[0]+b[1])/2,front?0:Math.PI,front?Math.PI:TAU);
      g.lineWidth=r*(b[1]-b[0]);g.strokeStyle=cnA(cnMix(pal.light,'#ffffff',.25),b[3]*(front?1:.8));g.stroke();
    }
    g.restore();
  };
  ring(false);
  cnSphere(g,cx,cy,r,pal,{phase:.78,light:lightA,seed:C.seed+5,atm:.9,detail:true});
  /* ring shadow band across the globe */
  g.save();g.beginPath();g.arc(cx,cy,r*.995,0,TAU);g.clip();g.translate(cx,cy);g.rotate(tilt);g.scale(1,.3);
  g.strokeStyle='rgba(5,4,20,.38)';g.lineWidth=r*.42;g.beginPath();g.arc(0,0,r*1.08,0,Math.PI);g.stroke();g.restore();
  ring(true);
}
function cbgSky(g,C){
  const{F,E,H,W,u,hzY,S}=C,T=E.T,sk=E.sky,night=E.night;
  cnFillBg(g,S,cnLG(g,0,-H*.12,0,hzY,[[0,sk[0]],[.5,sk[1]],[1,sk[2]]]));
  /* stars (night full, dusk/dawn a few) */
  if(T.str>0){
    const n=Math.round((night?330:70)*T.str*F.w*F.h/(W*H)*(C.bat?.6:1));
    g.save();g.globalAlpha=night?1:.55;cnStars(g,F.x,F.y,F.w,hzY-F.y,C.seed+3,n,{u,tint:.8});g.restore();
  }
  /* sun / moon placement: never hidden behind the far ridge */
  const sx=W*T.sx,sy=T.sy==null?hzY-H*.075:H*T.sy,sr=H*T.sr;C.sun={x:sx,y:sy,r:sr};
  /* biome sky furniture drawn before the sun so the sun glow sits on top */
  if(E.bio==='crystal'){
    const side=E.ld>0?1:-1,px=W*(.5+side*.31),py=H*.24,r=H*(night?.2:.24);
    cbgRingedPlanet(g,C,px,py,r,{base:'#8a62d0',light:'#e2c8ff',dark:'#1a0e44',atm:'#c8a4ff',land:'#6a46b0',city:'#fff'},-.34,E.ld>0?-.4:-2.7);
    /* second, small icy moon */
    cnSphere(g,W*(.5-side*.34),H*.12,H*.035,CN_PLANET.ice,{phase:.7,light:E.ld>0?-.5:-2.6,seed:C.seed+9,atm:0});
  }else if(E.bio==='dust'){
    cnSphere(g,W*(.56+(night?.05:0)),H*(night?.34:.2),H*.016,CN_PLANET.ashen,{phase:.8,light:E.ld>0?-.5:-2.6,seed:C.seed+8,atm:0,detail:false});
    cnSphere(g,W*.4,H*.12,H*.011,CN_PLANET.ashen,{phase:.6,light:E.ld>0?-.5:-2.6,seed:C.seed+6,atm:0,detail:false});
  }else if(E.bio==='ash'){
    /* huge dim red companion star sunk in the smoke */
    const ex=W*(.5-E.ld*.3),ey=H*.3,er=H*(night?.1:.085);
    cnGlow(g,ex,ey,H*.6,'#ff5a2a',night?.3:.16);
    g.save();g.globalAlpha=night?1:.6;cnSphere(g,ex,ey,er,CN_PLANET.ember,{phase:.72,light:E.ld>0?-.5:-2.6,seed:C.seed+12,atm:.8,detail:true});g.restore();
  }else if(E.bio==='green'||E.bio==='ice'){
    g.save();g.globalAlpha=night?1:.5;cnSphere(g,W*(.5-E.ld*.26),H*(night?.2:.28),H*.03,CN_PLANET.ashen,{phase:.7,light:E.ld>0?-.5:-2.6,seed:C.seed+6,atm:0});g.restore();
  }
  /* sun or moon */
  const gl=cnA(E.glow,1);
  if(night){
    cnGlow(g,sx,sy,H*.55,E.glow,.34);
    cnSphere(g,sx,sy,sr,CN_PLANET.ashen,{phase:.82,light:E.ld>0?-.6:-2.55,seed:C.seed+4,atm:0});
    cnGlow(g,sx,sy,sr*2.4,'#dce8ff',.28);
  }else{
    cnGlow(g,sx,sy,H*(T.gl>.7?1.05:.8),E.glow,T.gl*.55,{squash:E.tod==='day'?1:.62});
    cnGlow(g,sx,sy,H*.3,E.glow,.5);
    g.fillStyle=cnRG(g,sx,sy,0,sr*1.25,[[0,'#ffffff'],[.62,cnA(T.sc,1)],[.8,cnA(T.sc,.9)],[1,cnA(T.sc,0)]]);g.beginPath();g.arc(sx,sy,sr*1.25,0,TAU);g.fill();
    if(E.tod!=='day'){      /* low sun: light fan + horizon flare */
      g.save();g.globalCompositeOperation='lighter';
      for(let i=0;i<13;i++){
        const a=-Math.PI/2+(cnR(C.seed,i,1)-.5)*2.5,L=H*(.8+cnR(C.seed,i,2)*.9),w=.018+cnR(C.seed,i,3)*.03,al=.035+cnR(C.seed,i,4)*.04;
        g.fillStyle=cnLG(g,sx,sy,sx+Math.cos(a)*L,sy+Math.sin(a)*L,[[0,cnA(E.glow,al*1.6)],[1,cnA(E.glow,0)]]);
        g.beginPath();g.moveTo(sx,sy);g.lineTo(sx+Math.cos(a-w)*L,sy+Math.sin(a-w)*L);g.lineTo(sx+Math.cos(a+w)*L,sy+Math.sin(a+w)*L);g.closePath();g.fill();
      }
      g.fillStyle=cnLG(g,sx-W*.5,0,sx+W*.5,0,[[0,cnA(E.glow,0)],[.5,cnA(E.glow,.34)],[1,cnA(E.glow,0)]]);g.fillRect(sx-W*.5,sy-H*.006,W,H*.012);
      g.restore();
    }
    if(E.bio==='ice'&&E.tod==='day'){      /* halo and sun dogs */
      g.save();g.globalCompositeOperation='lighter';g.strokeStyle='rgba(255,255,255,.2)';g.lineWidth=H*.012;g.beginPath();g.arc(sx,sy,H*.3,0,TAU);g.stroke();
      g.strokeStyle='rgba(255,230,200,.1)';g.lineWidth=H*.02;g.beginPath();g.arc(sx,sy,H*.316,0,TAU);g.stroke();
      for(const d of[-1,1])cnGlow(g,sx+d*H*.3,sy,H*.028,'#fff4d8',.55);
      g.restore();
    }
  }
  /* clouds: flat-bottomed stratus streaks, lit from the sun side */
  if(E.bio!=='ash'||!night)cbgClouds(g,C,E.bio==='dust'?5:E.bio==='ash'?9:E.bio==='ice'?6:E.bio==='crystal'?7:9);
  /* ice night: aurora curtains (static pass; fn.anim adds the slow shimmer) */
  if(E.bio==='ice'&&night)cbgAurora(g,C,0);
  /* horizon haze */
  g.fillStyle=cnLG(g,0,hzY-H*.3,0,hzY+H*.02,[[0,cnA(E.haze,0)],[.7,cnA(E.haze,.5)],[1,cnA(E.haze,.85)]]);g.fillRect(F.x,hzY-H*.3,F.w,H*.33);
}
function cbgClouds(g,C,n){
  const{F,E,H,W,u,hzY,seed}=C,night=E.night,tod=E.tod;
  const topC=E.sh('#ffffff',tod==='day'?1.05:.98),botC=E.sh(tod==='dusk'||tod==='dawn'?cnMix(E.sky[2],'#b04a64',.4):'#8d9bbd',night?.9:.5);
  g.save();
  const cnt=Math.round(n*F.w/W);
  for(let i=0;i<cnt;i++){
    const x=F.x+cnR(seed,i,31)*F.w,yy=hzY-H*(.1+cnR(seed,i,32)*.4),L=H*(.3+cnR(seed,i,33)*.6),h=H*(.016+cnR(seed,i,34)*.03),al=(.3+cnR(seed,i,35)*.45)*(night?.5:1);
    for(let layer=0;layer<2;layer++){
      const col=layer?topC:botC;
      for(let k=0;k<8;k++){
        const q=k/7,fx=(q-.5)*L+(cnR(seed,i*9+k,40)-.5)*L*.1,r=h*(.8+1.5*Math.sin(q*Math.PI)*(.5+cnR(seed,i*9+k,41)*.7)),dy=layer?-h*.3:h*.2;
        g.save();g.translate(x+fx,yy+dy);g.scale(1,.34);
        g.fillStyle=cnRG(g,0,0,0,r*2.4,[[0,cnA(col,al*(layer?.75:.6))],[.55,cnA(col,al*(layer?.3:.26))],[1,cnA(col,0)]]);g.fillRect(-r*2.4,-r*2.4,r*4.8,r*4.8);g.restore();
      }
    }
  }
  g.restore();
}
/* aurora curtains (ice night). phase t shifts the curtain bottoms; the static bake uses t=0 and a faint copy */
function cbgAurora(g,C,t){
  const{F,H,W,hzY,seed}=C;g.save();g.globalCompositeOperation='lighter';
  for(let b=0;b<3;b++){
    const y0=hzY-H*(.22+b*.07),cols=['#5affc8','#7ab8ff','#b08aff'][b];
    for(let x=F.x;x<F.x+F.w;x+=H*.012){
      const n=cnFbm(x/H*.9+b*4,t*.12+b,seed+b,3),h=H*(.2+.28*n),yb=y0+Math.sin(x/H*2.3+b*2+t*.35)*H*.035,a=(.05+.08*cnFbm(x/H*3+b,3.1,seed+7,2))*(t?1:.9);
      g.fillStyle=cnLG(g,0,yb-h,0,yb,[[0,cnA(cols,0)],[.7,cnA(cols,a)],[1,cnA(cols,a*1.6)]]);g.fillRect(x,yb-h,H*.0125,h);
    }
  }
  g.restore();
}

/* ------------------------------------------------ 4. ridge layers (the workhorse of every landscape) ------------------------------------------------ */
/* profile function per biome: u = x/H  ->  0..1 height. L = layer index (0 = farthest) */
function cbgProfile(bio,L,s){
  switch(bio){
    case'dust':return u=>{const f=cnFbm(u*(.7+L*.25)+L*13.1,.37,s+L*7,4);return .1*f+.46*cnSS(.50,.56,f)+.34*cnSS(.62,.68,f)+.03*cnFbm(u*9,L,s+3,2);};
    case'crystal':return u=>{
      const f=cnFbm(u*(.9+L*.3)+L*5.7,.21,s+L*11,5),r=1-Math.abs(2*f-1);let h=.12+.42*Math.pow(r,1.8);
      const w=.2,q=u/w+L*.37,ci=Math.floor(q),fr=q-ci,hs=cnHash(s,ci,L);
      if(hs<.4){const c=.3+.4*cnHash(s,ci,L+9),hw=.05+.05*hs,d=Math.abs(fr-c)*w/hw;h=Math.max(h,.2+.55*cnHash(s,ci,L+3)*Math.max(0,1-d)+.2*Math.max(0,1-d));}
      return h;};
    case'ash':return u=>{
      const w=.7+.2*L,q=u/w+L*.43,ci=Math.floor(q),fr=q-ci,hv=cnHash(s,ci,L+21);let h=.08+.3*Math.pow(1-Math.abs(2*cnFbm(u*2.1+L*9,.6,s+L,5)-1),1.5);
      if(hv<.55){const c=.25+.5*cnHash(s,ci,L+22),dx=Math.abs(fr-c)*w,hh=.2+.46*hv,cone=hh*Math.pow(Math.max(0,1-dx/(w*.34)),1.2);const cr=w*.035;h=Math.max(h,cone+.06-(dx<cr?hh*.13*(1-dx/cr):0));}
      return h;};
    case'green':return L===0?(u=>.18+.5*Math.pow(1-Math.abs(2*cnFbm(u*1.2+3,.3,s,5)-1),1.3)):(u=>.1+.5*cnFbm(u*(.7+L*.2)+L*4,.3,s+L,4));
    default:return u=>.1+.72*Math.pow(1-Math.abs(2*cnFbm(u*(1.1+L*.1)+L*6,.4,s+L,5)-1),1.8);   // ice
  }
}
/* o: {prof, base(y px), amp(px), top/bot colours, step, strip(depth px), snow:{col,depth}, rim:colour|null, fogK} */
function cbgRidge(g,C,o){
  const{F,E,H,u,ld}=C,step=o.step||Math.max(2,2.4*u),n=Math.ceil(F.w/step)+2,ys=new Float32Array(n),H1=H;
  let top=1e9;
  for(let i=0;i<n;i++){const x=F.x+i*step,y=o.base-o.prof(x/H1)*o.amp;ys[i]=y;if(y<top)top=y;}
  const bottom=o.bottom==null?o.base+H*.04:o.bottom;
  g.beginPath();g.moveTo(F.x,bottom);for(let i=0;i<n;i++)g.lineTo(F.x+i*step,ys[i]);g.lineTo(F.x+(n-1)*step,bottom);g.closePath();
  g.fillStyle=cnLG(g,0,top,0,Math.max(top+1,o.base),[[0,o.top],[.55,o.mid||cnMix(o.top,o.bot,.55)],[1,o.bot]]);g.fill();
  /* slope shading strips: the side of every crest that faces the light is brightened, the other side darkened */
  const sd=o.strip||o.amp*.55,litG=cnLG(g,0,top,0,top+sd,[[0,o.lit],[1,cnA(o.lit,0)]]),shG=cnLG(g,0,top,0,top+sd,[[0,o.shade],[1,cnA(o.shade,0)]]);
  g.save();
  for(let i=1;i<n-1;i++){
    const sl=(ys[i-1]-ys[i+1])/(2*step),k=cbgCl(ld*sl*(o.slopeK||1.6),-1,1);
    if(Math.abs(k)<.07)continue;
    g.globalAlpha=Math.abs(k)*(k>0?(o.litA==null?.65:o.litA):(o.shA==null?.6:o.shA));g.fillStyle=k>0?litG:shG;
    const x=F.x+i*step,yt=ys[i];g.fillRect(x-.3,yt,step+.6,sd);
  }
  g.globalAlpha=1;
  if(o.snow){    /* snow caps: the highest part of every peak turns white, with a ragged lower edge, shaded per face */
    const sn=o.snow,ds=new Float32Array(n);
    for(let i=0;i<n;i++){const x=F.x+i*step,hgt=(o.base-ys[i])/o.amp;ds[i]=sn.depth*cnSS(sn.from,sn.from+.3,hgt)*(.5+cnFbm(x/H*3.4,.7,C.seed+3,3)*.9);}
    for(let i=0;i<n-1;i++){
      if(ds[i]<.8&&ds[i+1]<.8)continue;
      const i0=Math.max(0,i-3),i1=Math.min(n-1,i+4),sl=cbgCl(ld*(ys[i0]-ys[i1])/((i1-i0)*step)*1.5,-1,1),x=F.x+i*step;
      g.fillStyle=cnMix(sn.shade,sn.lit,.5+.5*sl);cbgPoly(g,[x,ys[i],x+step+.4,ys[i+1],x+step+.4,ys[i+1]+ds[i+1],x,ys[i]+ds[i]]);g.fill();
    }
  }
  if(o.rim){
    g.strokeStyle=o.rim;g.lineWidth=Math.max(1,1.1*u);g.lineJoin='round';g.beginPath();let on=false;
    for(let i=1;i<n-1;i++){const sl=(ys[i-1]-ys[i+1])/(2*step),k=ld*sl;if(k>.12){if(!on){g.moveTo(F.x+i*step,ys[i]);on=true;}else g.lineTo(F.x+i*step,ys[i]);}else on=false;}
    g.globalAlpha=.55;g.stroke();g.globalAlpha=1;
  }
  g.restore();
  return{ys,step,top};
}
/* height (px above o.base) of a layer at x, used to keep suns and features clear of / on top of terrain */
const cbgHAt=(prof,x,H,amp)=>prof(x/H)*amp;

/* the standard far-landscape stack. returns the ridge profiles so callers can look up heights */
function cbgFarLand(g,C,opt){
  opt=opt||{};const{E,H,hzY,u}=C,M=E.mat,bio=E.bio,amp0=opt.amp||1,gt=E.fog(E.sh(M.ground[0],.7),.45);
  const layers=[
    {L:0,amp:H*.30*amp0,fog:.5,off:0},{L:1,amp:H*.23*amp0,fog:.36,off:H*.004},{L:2,amp:H*.16*amp0,fog:.2,off:H*.012}
  ];
  if(opt.near)layers.push({L:3,amp:H*.09*amp0,fog:.1,off:H*.026});
  const out=[],snowy=bio==='ice'||(bio==='green'&&opt.alps!==false);
  for(const l of layers){
    const prof=cbgProfile(bio,l.L,C.seed+(opt.seedOff||0)),k=l.fog;
    const rockC=cnMix(CBG_FAR[bio],M.rock,.2+l.L*.2);
    const topC=E.fog(E.sh(cnMix(M.rock2,rockC,.45+l.L*.1),.85),k),mid=E.fog(E.sh(rockC,.45),k+.06);
    const r=cbgRidge(g,C,{prof,base:hzY+l.off,amp:l.amp,bottom:hzY+H*.06,top:topC,mid,bot:E.fog(gt,Math.max(0,.35-k*.3)),
      lit:E.fog(E.sh(bio==='ice'?'#ffffff':M.rock2,1.35),k*.7),shade:E.fog(E.sh(rockC,-.05),k*.5),litA:.72*(1-k*.4),shA:.66*(1-k*.3),
      strip:l.amp*.75,rim:cnA(E.litCol,.55*(1-k)),
      snow:snowy&&(bio==='ice'||l.L===0)?{from:.46,depth:l.amp*.42,lit:E.fog(E.sh('#ffffff',1.1),k*.6),shade:E.fog(E.sh('#b4c8ec',.12),k*.5)}:null});
    out.push({prof,base:hzY+l.off,amp:l.amp,L:l.L,r});
  }
  return out;
}

/* ------------------------------------------------ 5. ground plane: perspective bands, scatter, contact shadows ------------------------------------------------ */
function cbgGroundFill(g,C,o){
  o=o||{};const{F,E,H,W,u,hzY}=C,M=E.mat,y1=F.y+F.h;
  const farC=E.fog(E.sh(M.ground[0],.7),.45),midC=E.sh(cnMix(M.ground[0],M.ground[1],.5),.55),nearC=E.sh(M.ground[1],.35);
  g.fillStyle=cnLG(g,0,hzY,0,y1,[[0,farC],[.2,E.fog(midC,.12)],[.55,midC],[1,nearC]]);g.fillRect(F.x,hzY,F.w,y1-hzY);
  /* sun / moon sheen on the ground (specular on ice, dust haze elsewhere) */
  const sun=C.sun;if(sun){const a=E.bio==='ice'?.4:.2;g.save();g.globalCompositeOperation='lighter';g.fillStyle=cnRG(g,sun.x,hzY,0,W*.5,[[0,cnA(E.glow,a*E.T.gl)],[1,cnA(E.glow,0)]]);
    g.save();g.beginPath();g.rect(F.x,hzY,F.w,y1-hzY);g.clip();g.translate(0,hzY);g.scale(1,.22);g.translate(0,-hzY);g.fillRect(F.x,hzY-W*.5,F.w,W);g.restore();g.restore();}
  /* perspective bands: crest lines get steadily larger toward the viewer (dunes / terraces / drifts) */
  const nb=o.bands||7,amp=(o.dune?2.3:1)*H*.012;
  for(let i=0;i<nb;i++){
    const k=(i+1)/(nb+1),yb=hzY+(y1-hzY)*Math.pow(k,1.7)*.92+H*.012,a=amp*(.5+k*2.2),fr=(1.1+k*.9)/(1+(o.dune?.6:0));
    const phase=cnR(C.seed,i,61)*50,step=Math.max(3,3*u),n=Math.ceil(F.w/step)+2,ys=new Float32Array(n);
    for(let j=0;j<n;j++){const x=F.x+j*step;ys[j]=yb-(cnFbm(x/H*fr*.8+phase,i*3.1,C.seed+i,3)-.4)*a*(o.dune?1.5:1);}
    const cLit=E.sh(cnMix(M.ground[0],M.ground[1],k*.8),.95-k*.12),cSh=E.sh(cnMix(M.ground[0],M.ground[1],k*.8+.1),.25);
    const calm=cnSS(.72,.98,(yb-hzY)/(y1-hzY));       // the lower third stays quiet
    g.beginPath();g.moveTo(F.x,y1);for(let j=0;j<n;j++)g.lineTo(F.x+j*step,ys[j]);g.lineTo(F.x+(n-1)*step,y1);g.closePath();
    g.fillStyle=cnLG(g,0,yb-a,0,yb+(y1-yb)*.42,[[0,E.fog(cLit,(1-k)*.4)],[.12,E.fog(cnMix(cLit,cSh,.35),(1-k)*.3)],[1,E.fog(cnMix(cLit,cSh,.25),0)]]);g.globalAlpha=1-calm*.5;g.fill();g.globalAlpha=1;
    /* crest rim light and slip-face shade */
    const sd=Math.max(a*3,H*.02),lg=cnLG(g,0,yb-a,0,yb-a+sd,[[0,cnA(E.sh('#ffffff',1),.5)],[1,cnA('#ffffff',0)]]),sg=cnLG(g,0,yb-a,0,yb-a+sd,[[0,cnA(cbgMul(M.ground[1],E.T.amb,.7),.55)],[1,cnA('#000',0)]]);
    for(let j=1;j<n-1;j++){
      const sl=(ys[j-1]-ys[j+1])/(2*step),kk=cbgCl(C.ld*sl*(o.dune?3:2.2),-1,1);if(Math.abs(kk)<.1)continue;
      g.globalAlpha=Math.abs(kk)*(kk>0?.34:.44)*(1-calm*.6)*(.35+k*.65);g.fillStyle=kk>0?lg:sg;g.fillRect(F.x+j*step-.3,ys[j],step+.6,sd);
    }
    g.globalAlpha=1;
  }
}
/* a faceted rock: s = half width. lit side toward the light */
function cbgRock(g,C,x,y,s,seed,col){
  const{E,ld}=C,n=6,pts=[];
  for(let i=0;i<n;i++){const a=Math.PI+i/(n-1)*Math.PI+(cnR(seed,i,1)-.5)*.3,r=s*(.8+cnR(seed,i,2)*.35);pts.push(x+Math.cos(a)*r,y+Math.sin(a)*r*(.95+.3*cnR(seed,i,3)));}
  pts.push(x+s*.95,y,x-s*.95,y);
  const rock=col||E.mat.rock,ctr=[x-ld*s*.25,y-s*.4];
  cnShadow(C.g,x-ld*s*.35,y+s*.08,s*1.25,s*.26,.32*(E.T.dark/.3));
  C.g.fillStyle=cnLG(C.g,x-ld*s,y-s,x+ld*s*.8,y+s*.2,[[0,E.sh(col||E.mat.rock2,1)],[.5,E.sh(rock,.45)],[1,E.sh(rock,.05)]]);cbgPoly(C.g,pts);C.g.fill();
  /* facet: shadow half */
  C.g.fillStyle=cnA(E.sh(rock,0),.5);C.g.beginPath();C.g.moveTo(x+ld*s*.1,y-s*.9);C.g.lineTo(x-ld*s*.95,y);C.g.lineTo(x+ld*s*.1,y);C.g.closePath();C.g.fill();
}
function cbgScatter(g,C,o){
  o=o||{};const{F,E,H,W,u,hzY,seed}=C,bio=E.bio,M=E.mat,y1=F.y+F.h,n=Math.round((o.n||46)*(F.w/W));
  for(let i=0;i<n;i++){
    const k=Math.pow(cnR(seed,i,71),.8),y=hzY+H*.02+(y1-hzY-H*.02)*k,x=F.x+cnR(seed,i,72)*F.w,d=(y-hzY)/(H*.5),s=H*(.004+.03*d*(.4+cnR(seed,i,73)))+u;
    /* keep the lower third calm: small, low contrast, and not under the actor columns */
    if(y>H*.8&&cnR(seed,i,74)<.65)continue;
    g.save();g.globalAlpha=cbgCl(1-cnSS(.8,1.05,y/H)*.6,.3,1);
    if(bio==='green'&&cnR(seed,i,75)<.55){          // grass tufts
      g.strokeStyle=E.sh(cnMix('#7ac060',M.ground[0],cnR(seed,i,76)*.5),.85);g.lineWidth=Math.max(1,u*.9);g.lineCap='round';g.beginPath();
      for(let b=0;b<5;b++){const dx=(b-2)*s*.35;g.moveTo(x+dx*.4,y);g.quadraticCurveTo(x+dx*.7,y-s*1.2,x+dx*1.3+(cnR(seed,i,b)-.5)*s,y-s*(1.4+cnR(seed,i,b+7)*1.5));}g.stroke();
    }else if(bio==='ash'&&cnR(seed,i,77)<.22){       // lava seam / ember specks
      g.globalCompositeOperation='lighter';cnGlow(g,x,y,s*3,'#ff6a2a',.35+.3*cnR(seed,i,78));g.fillStyle='#ffb070';g.fillRect(x-s*.3,y-s*.1,s*.6,Math.max(1,s*.12));
    }else if(bio==='crystal'&&cnR(seed,i,79)<.2){    // small glowing shards
      const c=E.mat.accent;g.fillStyle=cnLG(g,x,y-s*2,x,y,[[0,cnMix(c,'#fff',.4)],[1,cnA(cnMix(c,'#5a3aa0',.5),.9)]]);cbgPoly(g,[x-s*.4,y,x-s*.1,y-s*1.8,x+s*.5,y]);g.fill();
      g.globalCompositeOperation='lighter';cnGlow(g,x,y-s*.8,s*3,c,.4);
    }else if(bio==='ice'&&cnR(seed,i,80)<.3){        // snow ripples
      g.strokeStyle=cnA('#ffffff',.5);g.lineWidth=Math.max(1,u);g.beginPath();g.ellipse(x,y,s*2.4,s*.35,0,Math.PI*1.1,Math.PI*1.9);g.stroke();
    }else cbgRock(g,C,x,y,s*(bio==='ice'?.8:1),seed+i*7,null);
    g.restore();
  }
}
/* soft long shadow cast along the ground away from the light: base (x, y) width w, object height h */
function cbgCast(g,C,x,y,w,h,k){
  const{E,ld,u}=C,len=h*E.T.len*(k==null?1:k)*.9,a=E.T.dark*(E.night?.7:1);
  const tx=x-ld*len,ty=y+len*.05+h*.02;
  g.save();g.fillStyle=cnLG(g,x,y,tx,ty,[[0,'rgba(8,6,16,'+a+')'],[1,'rgba(8,6,16,0)']]);
  g.beginPath();g.moveTo(x-w/2,y);g.lineTo(x+w/2,y);g.lineTo(tx+w*.18,ty+h*.012);g.lineTo(tx-w*.18,ty-h*.01);g.closePath();g.fill();g.restore();
}

/* ------------------------------------------------ 6. volumes: oblique boxes, game plates as roofs, windows, lamps ------------------------------------------------ */
/* oblique box: front face (lit side gradient), top face, one side face (toward the shadow side). x = centre, y = ground line of the front face. returns geometry */
function cbgVol(g,C,x,y,w,h,col,o){
  o=o||{};const{E,ld,u}=C,d=o.d==null?w*.35:o.d,sh=ld*d*.5,xl=x-w/2,xr=x+w/2;
  const front=cnLG(g,xl,0,xr,0,ld>0?[[0,E.sh(col,.95)],[1,E.sh(col,.5)]]:[[0,E.sh(col,.5)],[1,E.sh(col,.95)]]);
  /* side face on the shadow side */
  const sx=ld>0?xr:xl;
  g.fillStyle=E.sh(cnMix(col,'#000',.12),.08);cbgPoly(g,[sx,y,sx,y-h,sx+sh,y-h-d,sx+sh,y-d]);g.fill();
  g.fillStyle=front;g.fillRect(xl,y-h,w,h);
  /* top face (brightest) */
  g.fillStyle=E.sh(cnMix(col,'#fff',.1),1.1);cbgPoly(g,[xl,y-h,xr,y-h,xr+sh,y-h-d,xl+sh,y-h-d]);g.fill();
  /* ambient occlusion at the base and under the top edge */
  g.fillStyle=cnLG(g,0,y-h*.22,0,y,[[0,'rgba(0,0,0,0)'],[1,'rgba(0,0,0,.32)']]);g.fillRect(xl,y-h*.22,w,h*.22);
  g.fillStyle='rgba(0,0,0,.18)';g.fillRect(xl,y-h,w,Math.max(1,u*1.2));
  g.strokeStyle=cnA(E.litCol,.35);g.lineWidth=Math.max(1,u);g.beginPath();g.moveTo(xl,y-h);g.lineTo(xr,y-h);g.stroke();
  return{xl,xr,top:y-h,sh,d,roof:{x:x+sh/2,y:y-h-d/2}};
}
/* a game building plate re-used as the oblique roof of a volume, with extruded walls under it. type = BDEF id */
function cbgPlanBox(g,C,type,fac,x,y,w,h,col,o){
  o=o||{};const{E,ld,u}=C,bd=BDEF[type]||BDEF.generator,pw=bd.w*TILE,ph=bd.h*TILE,s=w/pw,d=o.d==null?ph*s*.5:o.d,sh=ld*d*.5;
  const wall=col||cnFac(fac).dark;
  const v=cbgVol(g,C,x,y,w,h,wall,{d});
  /* the roof plate: game art squashed into the parallelogram */
  g.save();g.beginPath();g.moveTo(x-w/2,y-h);g.lineTo(x+w/2,y-h);g.lineTo(x+w/2+sh,y-h-d);g.lineTo(x-w/2+sh,y-h-d);g.closePath();g.clip();
  g.transform(s,0,-sh/ph,d/ph,x+sh/2,y-h-d/2);g.lineJoin='round';g.lineCap='round';
  g.filter='none';artBuilding(g,type,pw,ph,cnFac(fac),fac);
  g.restore();
  /* light the plate: a warm / cool wash so it sits in the scene's light */
  g.save();g.globalAlpha=.3;g.fillStyle=E.sh('#ffffff',.9);g.globalCompositeOperation='multiply';g.beginPath();g.moveTo(x-w/2,y-h);g.lineTo(x+w/2,y-h);g.lineTo(x+w/2+sh,y-h-d);g.lineTo(x-w/2+sh,y-h-d);g.closePath();g.fill();g.restore();
  v.s=s;return v;
}
/* rows of small windows on a wall face. lit probability rises toward night */
function cbgWindows(g,C,x,y,w,h,cols,rows,col,seed,o){
  o=o||{};const{E,u}=C,ww=w/(cols*1.9),wh=h/(rows*1.9),lampK=E.warmLamp;
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
    const px=x+(c+.5)/cols*w-ww/2,py=y+(r+.5)/rows*h-wh/2,on=cnR(seed,r*17+c,5)<(o.p==null?.25+.7*lampK:o.p);
    if(on){g.fillStyle=cnMix(col,'#ffffff',.25);g.fillRect(px,py,ww,wh);if(lampK>.3&&!C.bat)cnGlow(g,px+ww/2,py+wh/2,Math.max(ww,wh)*2.6,col,.18*lampK);}
    else{g.fillStyle=E.sh('#10161f',.3);g.fillRect(px,py,ww,wh);g.fillStyle=cnA(E.sky[2],.18);g.fillRect(px,py,ww,wh*.4);}
  }
}
/* a lamp: bright spot + glow. night / dusk = strong, day = a pale dot */
function cbgLamp(g,C,x,y,r,col,a){const k=C.E.warmLamp;g.fillStyle=cnMix(col,'#ffffff',.5);g.beginPath();g.arc(x,y,Math.max(1,r*.35),0,TAU);g.fill();if(k>0)cnGlow(g,x,y,r*(2+k*3),col,(a==null?.7:a)*(.35+.65*k));}
/* a smoke / steam column rising from (x,y): closed form; n puffs; call from fn.anim */
function cbgPlume(g,t,x,y,o,seed){
  const n=o.n||10,per=o.per||7,H=o.h||100,r0=o.r0||6,r1=o.r1||38,wind=o.wind||0,col=o.col||'#3a3640',a0=o.a==null?.5:o.a;
  for(let i=0;i<n;i++){
    const ph=cnPhase(t,per,i,seed),sw=Math.sin(ph*5+i*1.7)*(o.sway==null?r1*.35:o.sway);
    const r=r0+(r1-r0)*Math.pow(ph,.7),a=a0*Math.sin(Math.min(1,ph*5)*Math.PI/2)*Math.pow(1-ph,1.15);
    cbgPuff(g,x+sw+wind*ph*ph*H*.6,y-ph*H,r,col,a);
  }
}

/* ------------------------------------------------ 7. surface features (side-on, game plates as roofs where they exist) ------------------------------------------------ */
function cbgFacPal(f){
  const c=cnFac(f);
  return f==='obsidian'?{wall:'#2c2328',wall2:'#4a3a40',trim:c.base,glow:c.glow,acc:c.light,dark:'#140e12'}
        :f==='aurora'?{wall:'#c4d6d4',wall2:'#9db8b8',trim:c.base,glow:c.glow,acc:'#f2e4bc',dark:'#4a6a6a'}
        :{wall:'#5a6a86',wall2:'#8494b0',trim:c.base,glow:c.glow,acc:c.light,dark:'#2a3650'};
}
function cbgTube(g,C,x0,y0,x1,y1,w,col){
  const E=C.E,dx=x1-x0,dy=y1-y0,L=Math.hypot(dx,dy)||1,nx=-dy/L,ny=dx/L,sg=(nx*(-C.ld*.5)+ny*(-.85))>0?1:-1,h=w/2;
  g.fillStyle=cnLG(g,x0+nx*h*sg,y0+ny*h*sg,x0-nx*h*sg,y0-ny*h*sg,[[0,E.sh(cnMix(col,'#fff',.15),1.05)],[.45,E.sh(col,.6)],[1,E.sh(col,.08)]]);
  cbgPoly(g,[x0+nx*h,y0+ny*h,x1+nx*h,y1+ny*h,x1-nx*h,y1-ny*h,x0-nx*h,y0-ny*h]);g.fill();
}
/* a faceted resource crystal in the game's amber, vector at any size */
function cbgShard(g,C,x,y,w,h,lean,hue,seed){
  const E=C.E,ld=C.ld,tip=[x+lean,y-h],bl=[x-w/2,y],br=[x+w/2,y],ml=[x-w*.56+lean*.35,y-h*.5],mr=[x+w*.5+lean*.4,y-h*.45],bm=[x+lean*.08,y+h*.03];
  const lit=C.E.night?.55:1;
  const cTop=cnHSL(hue,.95,.72*lit+.1),cMid=cnHSL(hue-3,.92,.52*lit+.08),cLo=cnHSL(hue-8,.9,.3*lit+.06);
  const facL=[bl[0],bl[1],ml[0],ml[1],tip[0],tip[1],bm[0],bm[1]],facR=[bm[0],bm[1],tip[0],tip[1],mr[0],mr[1],br[0],br[1]];
  const litL=ld>0;
  g.fillStyle=cnLG(g,0,tip[1],0,y,[[0,litL?cTop:cMid],[1,litL?cMid:cLo]]);cbgPoly(g,facL);g.fill();
  g.fillStyle=cnLG(g,0,tip[1],0,y,[[0,litL?cMid:cTop],[1,litL?cLo:cMid]]);cbgPoly(g,facR);g.fill();
  g.strokeStyle='rgba(60,25,0,.5)';g.lineWidth=Math.max(.8,C.u*.9);g.lineJoin='round';cbgPoly(g,[bl[0],bl[1],ml[0],ml[1],tip[0],tip[1],mr[0],mr[1],br[0],br[1]]);g.stroke();
  g.beginPath();g.moveTo(tip[0],tip[1]);g.lineTo(bm[0],bm[1]);g.stroke();
  g.fillStyle='rgba(255,255,255,.5)';cbgPoly(g,[tip[0],tip[1],ml[0]+w*.04,ml[1]-h*.02,tip[0]-w*.02+(litL?-1:1)*w*.08,tip[1]+h*.32]);g.fill();
}
const CBG_FEAT={};
/* ---- hub: the colony's command hub, game plate on a stepped steel body, radar mast, landing lights ---- */
CBG_FEAT.hub={
  st(g,C,it){
    const{E,u,ld}=C,{x,y,s,fac}=it,P=cbgFacPal(fac),col=cnFac(fac),w=s*2.15,h=s*.52,d=s*.78;
    cbgCast(g,C,x,y,w*1.1,s*1.3);
    /* landing apron + ring lights on the ground in front */
    cbgEll(g,x,y+s*.16,w*.84,s*.215);g.fillStyle=cnLG(g,0,y-s*.05,0,y+s*.4,[[0,E.sh('#8a94a8',.7)],[1,E.sh('#4a5468',.4)]]);g.fill();
    for(const k of[1,.72,.44]){cbgEll(g,x,y+s*.16,w*.82*k,s*.2*k);g.strokeStyle=cnA(E.sh('#e8eefa',.9),k===1?.6:.25);g.lineWidth=Math.max(1,u*(k===1?1.4:1));g.stroke();}
    for(let i=0;i<16;i++){const a=i/16*TAU,px=x+Math.cos(a)*w*.82,py=y+s*.16+Math.sin(a)*s*.2;if(Math.sin(a)<-.1)continue;cbgLamp(g,C,px,py,s*.03,i%4?col.glow:'#ffffff',.4);}
    /* plinth */
    cbgVol(g,C,x,y,w*1.16,s*.08,cnMix(P.wall,'#202838',.5),{d:d*.78});
    /* main body: the game's hub plate is the roof */
    const v=cbgPlanBox(g,C,'hub',fac,x,y-s*.08,w,h,cnMix(P.wall,'#202838',.15),{d});
    const wy=y-s*.08-h;
    /* wall details: faction band, seams, window strip, entrance */
    g.fillStyle=cnA(E.sh(col.base,.9),.95);g.fillRect(x-w/2,wy+h*.08,w,h*.1);g.fillStyle=cnA(col.light,.5);g.fillRect(x-w/2,wy+h*.08,w,Math.max(1,u*.8));
    g.strokeStyle='rgba(0,0,0,.22)';g.lineWidth=Math.max(1,u*.8);g.beginPath();for(let i=1;i<10;i++){g.moveTo(x-w/2+w*i/10,wy+h*.2);g.lineTo(x-w/2+w*i/10,wy+h*.95);}g.stroke();
    cbgWindows(g,C,x-w*.46,wy+h*.28,w*.92,h*.26,16,1,E.tod==='night'?'#ffe2a0':col.glow,it.seed,{p:E.tod==='day'?.5:.9});
    const dw=w*.15,dh=h*.46;g.fillStyle=cnLG(g,0,y-s*.08-dh,0,y-s*.08,[[0,'#05080e'],[1,cnMix(col.glow,'#000',.4)]]);rr(g,x-dw/2,y-s*.08-dh,dw,dh,dw*.3,g.fillStyle);
    g.fillStyle=cnA(col.glow,.65);g.fillRect(x-dw*.42,y-s*.08-dh*.1,dw*.84,dh*.1);cnGlow(g,x,y-s*.08-dh*.2,dw*1.3,col.glow,.22+.3*E.warmLamp);
    /* roof: dome, mast, dish */
    const r=v.roof,rx=w*.13;
    g.fillStyle=cnLG(g,r.x-rx,r.y-rx,r.x+rx,r.y+rx*.5,ld>0?[[0,E.sh('#e8f2ff',1.1)],[1,E.sh(P.wall2,.2)]]:[[0,E.sh(P.wall2,.2)],[1,E.sh('#e8f2ff',1.1)]]);
    g.beginPath();g.ellipse(r.x,r.y,rx,rx*.42,0,0,TAU);g.fill();
    g.beginPath();g.ellipse(r.x,r.y-rx*.18,rx*.82,rx*.8,0,Math.PI,TAU);g.fill();
    g.fillStyle=cnRG(g,r.x,r.y-rx*.4,0,rx*.8,[[0,cnA('#ffffff',.9)],[.5,cnA(col.glow,.8)],[1,cnA(col.base,.5)]]);g.beginPath();g.ellipse(r.x,r.y-rx*.2,rx*.55,rx*.5,0,Math.PI,TAU);g.fill();
    cnGlow(g,r.x,r.y-rx*.3,rx*2.2,col.glow,.35+.2*E.warmLamp);
    const mx=r.x+w*.3,my=r.y+d*.1;g.strokeStyle=E.sh('#9aa4b8',.7);g.lineWidth=Math.max(1.4,u*1.8);g.beginPath();g.moveTo(mx,my);g.lineTo(mx,my-s*.95);g.stroke();
    g.strokeStyle=E.sh('#cfd8e8',1);g.lineWidth=Math.max(1,u*1.2);g.beginPath();g.ellipse(mx+s*.04,my-s*.72,s*.2,s*.075,-.5,0,TAU);g.stroke();
    g.beginPath();g.moveTo(mx+s*.04,my-s*.72);g.lineTo(mx+s*.2,my-s*.82);g.stroke();
    /* habitat domes either side */
    for(const sd of[-1,1]){
      const hx=x+sd*w*.78,hy=y+s*.03,hr=s*.34;cbgCast(g,C,hx,hy,hr*1.6,hr,.8);
      g.fillStyle=cnLG(g,hx-hr,hy-hr,hx+hr,hy,ld>0?[[0,E.sh('#e8eefa',1.15)],[.5,E.sh(P.wall2,.5)],[1,E.sh(P.wall,.05)]]:[[0,E.sh(P.wall,.05)],[.5,E.sh(P.wall2,.5)],[1,E.sh('#e8eefa',1.15)]]);
      g.beginPath();g.ellipse(hx,hy,hr,hr*.92,0,Math.PI,TAU);g.fill();g.fillRect(hx-hr,hy-hr*.04,hr*2,hr*.1);
      g.strokeStyle='rgba(0,0,0,.2)';g.lineWidth=Math.max(1,u*.8);g.beginPath();g.moveTo(hx,hy);g.lineTo(hx,hy-hr*.92);g.moveTo(hx-hr*.5,hy);g.quadraticCurveTo(hx-hr*.45,hy-hr*.6,hx,hy-hr*.92);g.moveTo(hx+hr*.5,hy);g.quadraticCurveTo(hx+hr*.45,hy-hr*.6,hx,hy-hr*.92);g.stroke();
      cbgLamp(g,C,hx,hy-hr*.35,hr*.12,col.glow,.5);
    }
    /* cable / pipe run to the generators and crates */
    for(let i=0;i<4;i++){const cx=x+w*(.62+.07*(i%2))+i*s*.11,cw=s*.2,ch=s*.17;cbgVol(g,C,cx+w*.12,y+s*.07,cw,ch,i%2?'#7a6a4a':'#5c6a7a',{d:cw*.5});}
  },
  an(g,C,it,t){
    const{E,u}=C,{x,y,s,fac}=it,col=cnFac(fac),w=s*2.15,h=s*.52,d=s*.78,sh=C.ld*d*.5,rx=w*.13;
    const mx=x+sh/2+w*.3,my=y-s*.08-h-d/2+d*.1;
    const b=Math.max(0,Math.sin(t*3.2));cnGlow(g,mx,my-s*.97,s*.14,'#ff3a2a',.25+.75*b*b,{core:.6});
    /* rotating beacon on the dome */
    const a=t*1.6;cnGlow(g,x+sh/2+Math.cos(a)*rx*.5,y-s*.08-h-d/2-rx*.8,s*.07,col.glow,.4+.4*Math.sin(a));
    /* ring-light chase on the apron */
    if(E.warmLamp>.2)for(let i=0;i<16;i++){const aa=i/16*TAU;if(Math.sin(aa)<-.1)continue;const k=cnFrac(t*.7-i/16);cnGlow(g,x+Math.cos(aa)*w*.82,y+s*.16+Math.sin(aa)*s*.2,s*.06,'#fff',.5*Math.pow(1-k,3)*E.warmLamp);}
  }
};
/* ---- generators: three plate-roofed power units, cooling stacks, a pipe run, status lights ---- */
CBG_FEAT.generators={
  st(g,C,it){
    const{E,u,ld}=C,{x,y,s,fac}=it,P=cbgFacPal(fac),col=cnFac(fac);
    const units=[[-.78,.03,.82,.58],[.12,-.01,.7,.78],[.86,.05,.5,.42]];
    cbgCast(g,C,x,y,s*2.4,s*.9);
    units.forEach((q,i)=>{
      const ux=x+q[0]*s,uy=y+q[1]*s,uw=q[2]*s,uh=q[3]*s;
      cbgPlanBox(g,C,'generator',fac,ux,uy,uw,uh,cnMix(P.wall,'#1c2230',.25),{d:uw*.55});
      /* louvers + status strip */
      g.strokeStyle='rgba(0,0,0,.3)';g.lineWidth=Math.max(1,u);g.beginPath();for(let k=0;k<6;k++){const ly=uy-uh*.2-k*uh*.1;g.moveTo(ux-uw*.4,ly);g.lineTo(ux+uw*.4,ly);}g.stroke();
      g.fillStyle=cnA(col.glow,.8);g.fillRect(ux-uw*.4,uy-uh*.9,uw*.8,Math.max(2,uh*.045));
      if(i===1)cbgLamp(g,C,ux,uy-uh*.5,uw*.12,col.glow,.6);
    });
    /* cooling stacks */
    for(const sx of[-.55,.4]){const hx=x+sx*s,hy=y-s*.55,hh=s*(.55+.25*(sx>0));cbgTube(g,C,hx,hy,hx,hy-hh,s*.13,'#6a7488');g.fillStyle=E.sh('#1a1e28',.3);cbgEll(g,hx,hy-hh,s*.065,s*.025);g.fill();}
    /* pipe run across the tops */
    cbgTube(g,C,x-.78*s,y-s*.6,x+.12*s,y-.74*s,s*.07,'#8a94a8');cbgTube(g,C,x+.12*s,y-.74*s,x+.86*s,y-.42*s,s*.07,'#8a94a8');
    /* ground cables */
    g.strokeStyle='rgba(10,12,18,.8)';g.lineWidth=Math.max(1.5,u*2);g.lineCap='round';g.beginPath();g.moveTo(x-.3*s,y+s*.04);g.bezierCurveTo(x-.1*s,y+s*.16,x+.3*s,y+s*.1,x+.55*s,y+s*.06);g.stroke();
  },
  an(g,C,it,t){
    const{E}=C,{x,y,s,fac}=it,col=cnFac(fac),units=[[-.78,.03,.82,.58],[.12,-.01,.7,.78],[.86,.05,.5,.42]];
    units.forEach((q,i)=>{const ux=x+q[0]*s,uy=y+q[1]*s,uh=q[3]*s,bl=cnFlicker(t,it.seed+i,5);cnGlow(g,ux+q[2]*s*.3,uy-uh*.9,s*.1,bl>.5?col.glow:'#ffd45a',.3+.5*bl);});
    for(const sx of[-.55,.4]){const hx=x+sx*s,hy=y-s*.55-s*(.55+.25*(sx>0));cbgPlume(g,t,hx,hy,{n:6,per:4.5,h:s*1.1,r0:s*.05,r1:s*.2,wind:.5,col:E.tod==='night'?'#9aa4c0':'#d8dce8',a:.34},it.seed+(sx>0?5:0));}
    /* arcing spark between the pipes */
    const k=Math.floor(t*3),ph=cnFrac(t*3);if(cnR(it.seed,k,3)<.45){const a=Math.max(0,1-ph*4);cnGlow(g,x+.12*s+(cnR(it.seed,k,4)-.5)*s*.5,y-.74*s,s*.12,'#bfe8ff',a*.8,{core:.8});}
  }
};
/* ---- crystals: a harvestable cluster in the game's amber ---- */
CBG_FEAT.crystals={
  st(g,C,it){
    const{E,u,ld}=C,{x,y,s,seed}=it,n=7;
    cbgCast(g,C,x,y,s*1.4,s*1.0,.7);
    cbgEll(g,x,y+s*.03,s*1.1,s*.2);g.fillStyle=cnA(cnMix(E.mat.ground[1],'#ffb040',.15),.5);g.fill();
    cnGlow(g,x,y-s*.5,s*1.6,'#ffb030',.28+.28*E.warmLamp,{squash:.8});
    const list=[];
    for(let i=0;i<n;i++){const k=i/(n-1)-.5,hh=s*(.55+.75*cnR(seed,i,1))*(1-Math.abs(k)*.9),ww=s*(.2+.14*cnR(seed,i,2));list.push({x:x+k*s*1.15+(cnR(seed,i,3)-.5)*s*.12,y:y+s*(.02+.06*cnR(seed,i,4)),w:ww,h:hh,lean:k*s*.25+(cnR(seed,i,5)-.5)*s*.12,hue:42+cnR(seed,i,6)*10});}
    list.sort((a,b)=>b.y-a.y?0:0);
    for(const c of list.slice().sort((a,b)=>Math.abs(b.x-x)-Math.abs(a.x-x)))cbgShard(g,C,c.x,c.y,c.w,c.h,c.lean,c.hue,seed);
    for(let i=0;i<5;i++)cbgRock(g,C,x+(cnR(seed,i,11)-.5)*s*1.5,y+s*(.04+.08*cnR(seed,i,12)),s*(.05+.07*cnR(seed,i,13)),seed+i,null);
    cnGlow(g,x,y,s*.9,'#ffc860',.15*E.warmLamp,{squash:.3});
  },
  an(g,C,it,t){
    const{x,y,s,seed}=it;
    for(let i=0;i<5;i++){const ph=cnPhase(t,2.4+cnR(seed,i,1),i,seed),a=Math.sin(ph*Math.PI),px=x+(cnR(seed,i,2)-.5)*s*1.1,py=y-s*(.25+.8*cnR(seed,i,3));
      if(a<.2)continue;g.save();g.globalCompositeOperation='lighter';g.strokeStyle=cnA('#fff4d0',a*.9);g.lineWidth=Math.max(1,C.u);g.beginPath();const r=s*.05*a;g.moveTo(px-r,py);g.lineTo(px+r,py);g.moveTo(px,py-r);g.lineTo(px,py+r);g.stroke();cnGlow(g,px,py,r*1.4,'#ffe8a0',a*.5);g.restore();}
  }
};
/* ---- geyser: ether vent with a violet plume ---- */
CBG_FEAT.geyser={
  st(g,C,it){
    const{E,u}=C,{x,y,s,seed}=it,rx=s*.72,ry=rx*.26;
    cbgEll(g,x,y,rx*1.18,ry*1.25);g.fillStyle=cnA(E.sh('#120c1c',.2),.8);g.fill();
    /* rim rocks: back half first so the lip reads as a crater */
    for(let i=0;i<9;i++){const a=Math.PI+i/8*Math.PI;cbgRock(g,C,x+Math.cos(a)*rx*1.05,y+Math.sin(a)*ry*1.05,s*(.07+.06*cnR(seed,i,1)),seed+i,null);}
    cbgEll(g,x,y,rx,ry);g.fillStyle=cnRG(g,x,y,0,rx,[[0,'#d8b8ff'],[.3,'#7a3ad0'],[.7,'#2a1250'],[1,'#0a0612']]);g.fill();
    cnGlow(g,x,y,rx*2.2,'#a070ff',.35+.25*E.warmLamp,{squash:.5});
    for(let i=0;i<7;i++){const a=i/6*Math.PI;cbgRock(g,C,x+Math.cos(a)*rx*1.08,y+Math.sin(a)*ry*1.1,s*(.06+.07*cnR(seed,i+20,1)),seed+i*3,null);}
    g.save();g.globalCompositeOperation='lighter';cbgEll(g,x,y,rx*.5,ry*.5);g.fillStyle=cnA('#e8d0ff',.7);g.fill();g.restore();
  },
  an(g,C,it,t){
    const{x,y,s,seed}=it;g.save();
    cbgPlume(g,t,x,y,{n:16,per:3.2,h:s*3.2,r0:s*.1,r1:s*.62,wind:.35,sway:s*.09,col:'#cfa8ff',a:.38},seed);
    g.globalCompositeOperation='lighter';cbgPlume(g,t,x,y,{n:9,per:2.2,h:s*2.2,r0:s*.06,r1:s*.3,wind:.25,sway:s*.06,col:'#ffffff',a:.22},seed+7);
    g.restore();
  }
};
/* ---- wreck: a crashed hull in two pieces, furrow, debris, smoke ---- */
function cbgShipPath(g,L){      /* dropship side silhouette, nose +x, units of L around the centre */
  const P=[[.53,.02],[.45,-.04],[.33,-.088],[.21,-.13],[.09,-.135],[-.04,-.12],[-.2,-.125],[-.3,-.125],[-.37,-.27],[-.47,-.27],[-.45,-.12],[-.53,-.1],[-.54,.035],[-.46,.08],[-.3,.09],[-.12,.1],[.14,.09],[.36,.065]];
  g.beginPath();P.forEach((p,i)=>i?g.lineTo(p[0]*L,p[1]*L):g.moveTo(p[0]*L,p[1]*L));g.closePath();
}
CBG_FEAT.wreck={
  st(g,C,it){
    const{E,u,ld}=C,{x,y,s,fac,seed}=it,P=cbgFacPal(fac),col=cnFac(fac),L=s*3.4,Ox=x,Oy=y-L*.1;
    /* furrow + scattered plates behind the tail */
    cbgEll(g,x-L*.7,y+s*.02,L*.55,s*.09);g.fillStyle=cnA(E.sh('#14100c',.2),.55);g.fill();
    for(let i=0;i<10;i++){const dx=-L*(.55+cnR(seed,i,1)*.9),dy=(cnR(seed,i,2)-.2)*s*.18,w=s*(.05+.12*cnR(seed,i,3));
      g.save();g.translate(x+dx,y+dy+s*.03);g.rotate((cnR(seed,i,4)-.5)*.9);g.fillStyle=E.sh(i%3?P.wall:P.dark,.7);g.fillRect(-w,-w*.18,w*2,w*.36);g.fillStyle=E.sh(P.wall2,1.1);g.fillRect(-w,-w*.18,w*2,Math.max(1,u));g.restore();}
    cbgCast(g,C,x,y,L*.8,s*.8,.7);
    /* the hull, drawn once per piece */
    const hull=()=>{
      cbgShipPath(g,L);
      g.fillStyle=cnLG(g,0,-L*.27,0,L*.1,[[0,E.sh(cnMix(P.wall2,'#fff',.2),1.2)],[.5,E.sh(P.wall,.7)],[1,E.sh(P.dark,.12)]]);g.fill();
      g.save();cbgShipPath(g,L);g.clip();
      /* stub wing under the belly */
      g.fillStyle=E.sh(P.wall2,.55);cbgPoly(g,[L*.04,L*.03,-L*.2,L*.18,-L*.33,L*.18,-L*.19,L*.03]);g.fill();
      g.strokeStyle='rgba(0,0,0,.28)';g.lineWidth=Math.max(1,u);g.beginPath();for(let i=-6;i<=6;i++){g.moveTo(i*L*.082,-L*.28);g.lineTo(i*L*.082,L*.11);}g.moveTo(-L*.54,-.0*L);g.lineTo(L*.53,.0);g.stroke();
      g.fillStyle=cnA(col.base,.95);g.fillRect(-L*.55,-L*.045,L*1.1,L*.03);g.fillStyle=cnA(col.light,.55);g.fillRect(-L*.55,-L*.045,L*1.1,Math.max(1,u*.8));
      for(let i=0;i<7;i++){const sx=-L*.5+cnR(seed,i,9)*L;g.fillStyle=cnLG(g,sx,0,sx+L*.13,0,[[0,'rgba(10,6,4,.55)'],[1,'rgba(10,6,4,0)']]);g.fillRect(sx,-L*.28,L*.13,L*.4);}
      g.fillStyle=cnA(col.base,.9);g.fillRect(-L*.47,-L*.27,L*.1,L*.04);
      g.restore();
      /* canopy */
      g.fillStyle=cnLG(g,0,-L*.135,0,-L*.05,[[0,'#a6dcff'],[1,'#1f4570']]);cbgPoly(g,[L*.325,-L*.085,L*.21,-L*.128,L*.1,-L*.131,L*.19,-L*.056,L*.3,-L*.052]);g.fill();
      g.strokeStyle='rgba(255,255,255,.8)';g.lineWidth=Math.max(1,u);g.beginPath();g.moveTo(L*.24,-L*.115);g.lineTo(L*.27,-L*.07);g.moveTo(L*.17,-L*.12);g.lineTo(L*.22,-L*.062);g.stroke();
      cbgShipPath(g,L);g.strokeStyle='rgba(8,8,12,.65)';g.lineWidth=Math.max(1,u*1.3);g.stroke();
      /* engine bell */
      g.fillStyle=E.sh('#10141c',.4);cbgEll(g,-L*.535,-L*.032,L*.018,L*.058);g.fill();
    };
    const piece=(clip,rot,dx,dy)=>{g.save();g.translate(Ox+dx,Oy+dy);g.rotate(rot);g.beginPath();clip.forEach((p,i)=>i?g.lineTo(p[0]*L,p[1]*L):g.moveTo(p[0]*L,p[1]*L));g.closePath();g.clip();hull();g.restore();};
    /* dark interior in the gap */
    g.fillStyle='#07090e';cbgPoly(g,[Ox-L*.2,Oy-L*.12,Ox-L*.02,Oy-L*.1,Ox+L*.03,Oy+L*.09,Ox-L*.16,Oy+L*.12]);g.fill();
    g.strokeStyle=E.sh('#5a6478',.8);g.lineWidth=Math.max(1,u*1.5);g.beginPath();for(let i=0;i<5;i++){g.moveTo(Ox-L*.19+i*L*.003,Oy-L*.11+i*L*.045);g.lineTo(Ox-L*.02+i*L*.01,Oy-L*.09+i*L*.04);}g.stroke();
    cnGlow(g,Ox-L*.08,Oy,L*.16,'#ff6a20',.55+.2*E.warmLamp);
    /* front piece (nose down) and rear piece (tail up) with jagged break edges */
    piece([[-.13,-.5],[-.13,-.09],[-.095,-.05],[-.14,-.01],[-.09,.035],[-.13,.08],[-.13,.5],[.7,.5],[.7,-.5]],.075,L*.075,L*.02);
    piece([[-.62,-.5],[.0,-.5],[.0,-.1],[-.045,-.06],[-.0,-.02],[-.05,.03],[-.02,.07],[-.02,.5],[-.62,.5]],.13,-L*.07,-L*.03);
    /* dust mound burying the nose + rocks + crater lip */
    g.fillStyle=cnLG(g,0,y-s*.4,0,y+s*.1,[[0,E.sh(cnMix(E.mat.ground[0],E.mat.rock2,.4),.95)],[1,E.sh(E.mat.ground[1],.4)]]);
    g.beginPath();g.moveTo(x+L*.3,y+s*.1);g.quadraticCurveTo(x+L*.42,y-s*.36,x+L*.62,y-s*.02);g.lineTo(x+L*.72,y+s*.1);g.closePath();g.fill();
    for(let i=0;i<5;i++)cbgRock(g,C,x+L*(.3+.4*cnR(seed,i,21)),y+s*(.02+.07*cnR(seed,i,22)),s*(.06+.08*cnR(seed,i,23)),seed+i,null);
  },
  an(g,C,it,t){
    const{x,y,s,seed}=it,L=s*3.4,bx=x-L*.08,by=y-L*.1;
    g.save();cbgPlume(g,t,bx,by-L*.03,{n:14,per:6,h:s*3.2,r0:s*.1,r1:s*.55,wind:.55,sway:s*.12,col:'#2c282a',a:.55},seed);
    cbgPlume(g,t,x-L*.33,by-L*.2,{n:7,per:5,h:s*1.8,r0:s*.05,r1:s*.3,wind:.4,col:'#3a3436',a:.4},seed+4);
    g.globalCompositeOperation='lighter';
    const fl=cnFlicker(t,seed,9);cnGlow(g,bx,by,s*.5,'#ff7a30',.25+.4*fl);cnGlow(g,bx+s*.05,by+s*.06,s*.24,'#ffc060',.25+.4*fl);
    for(let i=0;i<5;i++){const ph=cnPhase(t,1.6+i*.3,i,seed);cnGlow(g,bx+(cnR(seed,i,1)-.5)*s*.3,by-ph*s*1.0,s*.05,'#ffb060',(1-ph)*.9);}
    g.restore();
  }
};
/* ---- towers: lattice masts with dishes and a blinking beacon ---- */
CBG_FEAT.tower={
  st(g,C,it){
    const{E,u,ld}=C,{x,y,s,seed}=it,hgt=s*2.4,wb=s*.2,wt=s*.05,col=E.sh('#8a94a8',.8),dark=E.sh('#1c2230',.1);
    cbgCast(g,C,x,y,wb,hgt,.5);
    /* guy wires */
    g.strokeStyle=cnA(E.sh('#aab4c8',.7),.35);g.lineWidth=Math.max(1,u*.8);g.beginPath();for(const sd of[-1,1]){g.moveTo(x,y-hgt*.78);g.lineTo(x+sd*s*.95,y+s*.03);}g.stroke();
    /* legs */
    for(const sd of[-1,1]){g.strokeStyle=sd===-ld?dark:col;g.lineWidth=Math.max(1.4,u*1.8);g.beginPath();g.moveTo(x+sd*wb/2,y);g.lineTo(x+sd*wt/2,y-hgt);g.stroke();}
    /* cross bracing */
    g.strokeStyle=cnA(E.sh('#6a7488',.7),.9);g.lineWidth=Math.max(1,u*.9);g.beginPath();
    const nb=9;for(let i=0;i<nb;i++){const k0=i/nb,k1=(i+1)/nb,w0=cbgL(wb,wt,k0)/2,w1=cbgL(wb,wt,k1)/2;const y0=y-hgt*k0,y1=y-hgt*k1;g.moveTo(x-w0,y0);g.lineTo(x+w1,y1);g.moveTo(x+w0,y0);g.lineTo(x-w1,y1);g.moveTo(x-w1,y1);g.lineTo(x+w1,y1);}g.stroke();
    /* platform + dishes */
    const py=y-hgt*.7,pw=cbgL(wb,wt,.7);g.fillStyle=E.sh('#4a5468',.6);g.fillRect(x-pw*.9,py-s*.015,pw*1.8,s*.03);
    g.strokeStyle=E.sh('#cfd8e8',1);g.lineWidth=Math.max(1,u*1.2);g.fillStyle=cnA(E.sh('#aab4c8',.9),.8);
    g.beginPath();g.ellipse(x+pw*.9,py-s*.1,s*.05,s*.14,-.3,0,TAU);g.fill();g.stroke();
    g.beginPath();g.ellipse(x-pw*.9,py-s*.34,s*.04,s*.11,.4,0,TAU);g.fill();g.stroke();
    g.strokeStyle=E.sh('#8a94a8',.8);g.beginPath();g.moveTo(x,y-hgt);g.lineTo(x,y-hgt-s*.35);g.stroke();
    g.fillStyle=E.sh('#b8c2d4',1);g.fillRect(x-s*.015,y-hgt-s*.02,s*.03,s*.05);
    cbgLamp(g,C,x+pw*.9,py-s*.1,s*.03,'#ffb060',.4);
  },
  an(g,C,it,t){const{x,y,s,seed}=it,hgt=s*2.4,b=Math.max(0,Math.sin(t*2.6+it.i*1.3));cnGlow(g,x,y-hgt-s*.36,s*.18,'#ff3a2a',.2+.8*b*b,{core:.7});}
};
/* ---- banners: a row of poles, cloth waving in the wind ---- */
CBG_FEAT.banner={
  st(g,C,it){
    const{E,u}=C,{x,y,s}=it,hgt=s*2.1;
    cbgCast(g,C,x,y,s*.06,hgt,.5);
    cbgTube(g,C,x,y,x,y-hgt,Math.max(2,s*.04),'#b8a98a');
    g.fillStyle=E.sh('#f0e0a8',1.1);g.beginPath();g.arc(x,y-hgt-s*.02,Math.max(2,s*.045),0,TAU);g.fill();
    cbgEll(g,x,y+s*.01,s*.1,s*.03);g.fillStyle=E.sh('#2a2622',.3);g.fill();
  },
  an(g,C,it,t){
    const{E,u}=C,{x,y,s,fac}=it,col=cnFac(fac),hgt=s*2.1,cw=s*1.0,ch=s*.62,top=y-hgt+s*.04;
    const wave=k=>(Math.sin(t*3.1-k*5.2+it.i)*s*.05+Math.sin(t*5.3-k*9+it.i*2)*s*.015)*k;
    const T=k=>top+wave(k)*.6,B=k=>top+ch*(1-.1*k)+wave(k)*.6+k*k*s*.04,X=k=>x+k*cw;
    const NS=9,kE=.86;g.save();
    for(let i=0;i<NS;i++){
      const k0=i/NS*kE,k1=(i+1)/NS*kE,sl=(wave(k1)-wave(k0))/(X(k1)-X(k0))*14,sh=cbgCl(.62+sl*.8,.18,1.15);
      g.fillStyle=E.sh(col.base,sh);cbgPoly(g,[X(k0),T(k0),X(k1),T(k1),X(k1),B(k1),X(k0),B(k0)]);g.fill();
    }
    g.fillStyle=E.sh(col.base,.5+cbgCl((wave(1)-wave(kE))/(X(1)-X(kE))*14,-.4,.4));cbgPoly(g,[X(kE),T(kE),X(1),T(1),X(.93),(T(.93)+B(.93))/2+ch*.04,X(1),B(1),X(kE),B(kE)]);g.fill();
    g.fillStyle=cnA(E.sh(col.light,1.1),.8);g.fillRect(x,top-1,cw*.03,ch*1.02);
    for(let i=0;i<NS;i++){const k0=i/NS*kE,k1=(i+1)/NS*kE;g.fillStyle=cnA(E.sh(col.light,1.0),.35);cbgPoly(g,[X(k0),T(k0),X(k1),T(k1),X(k1),T(k1)+ch*.07,X(k0),T(k0)+ch*.07]);g.fill();}
    const kx=.4,sx=X(kx),sy=(T(kx)+B(kx))/2;g.strokeStyle=cnA(E.sh(col.light,1.15),.9);g.lineWidth=Math.max(1,u*1.6);g.beginPath();g.arc(sx,sy,ch*.2,0,TAU);g.stroke();
    g.beginPath();g.moveTo(sx-ch*.12,sy+ch*.06);g.lineTo(sx,sy-ch*.12);g.lineTo(sx+ch*.12,sy+ch*.06);g.stroke();
    g.restore();
  }
};
/* ---- tents: a field camp around a fire ---- */
CBG_FEAT.tents={
  st(g,C,it){
    const{E,u,ld}=C,{x,y,s,seed,fac}=it,col=cnFac(fac),canvas=['#9a9a7c','#8a8a70','#a8a288'];
    const specs=[[-.95,.05,1.1,.9],[.55,-.02,1.3,1.05],[-.2,.14,.8,.62]];
    cbgCast(g,C,x,y,s*2.8,s*1.1,.8);
    specs.forEach((q,i)=>{
      const tx=x+q[0]*s,ty=y+q[1]*s,w=q[2]*s,h=q[3]*s*.9,d=w*.5,sh=ld*d*.55,c=cnMix(canvas[i%3],'#fff',.05);
      /* side plane (shadow side) then gable */
      const ex=ld>0?tx+w/2:tx-w/2;
      g.fillStyle=E.sh(cnMix(c,'#000',.1),.1);cbgPoly(g,[tx,ty-h,ex,ty,ex+sh,ty-d*.5,tx+sh,ty-h-d*.5]);g.fill();
      g.fillStyle=cnLG(g,tx-w/2,0,tx+w/2,0,ld>0?[[0,E.sh(c,1.0)],[1,E.sh(c,.45)]]:[[0,E.sh(c,.45)],[1,E.sh(c,1.0)]]);cbgPoly(g,[tx-w/2,ty,tx,ty-h,tx+w/2,ty]);g.fill();
      /* door glow */
      const dw=w*.24,dh=h*.55;g.fillStyle=cnLG(g,0,ty-dh,0,ty,[[0,E.warmLamp>.3?cnMix('#ffc060','#3a2a18',1-E.warmLamp*.9):'#1a1812'],[1,E.warmLamp>.3?cnMix('#ffd890','#5a3a1a',1-E.warmLamp):'#2a241a']]);
      cbgPoly(g,[tx-dw/2,ty,tx,ty-dh,tx+dw/2,ty]);g.fill();
      g.strokeStyle=cnA(col.base,.9);g.lineWidth=Math.max(1.5,u*2.2);g.beginPath();g.moveTo(tx-w/2,ty);g.lineTo(tx,ty-h);g.lineTo(tx+w/2,ty);g.stroke();
      g.strokeStyle='rgba(0,0,0,.35)';g.lineWidth=Math.max(1,u);g.beginPath();g.moveTo(tx-w/2,ty);g.lineTo(tx,ty-h);g.lineTo(tx+w/2,ty);g.stroke();
      /* guy ropes + pegs */
      g.strokeStyle=cnA(E.sh('#c8c0a8',.8),.5);g.lineWidth=Math.max(1,u*.7);g.beginPath();g.moveTo(tx,ty-h);g.lineTo(tx-w*.8,ty+s*.02);g.moveTo(tx,ty-h);g.lineTo(tx+w*.8,ty+s*.02);g.stroke();
      if(E.warmLamp>.3)cnGlow(g,tx,ty-dh*.3,w*.9,'#ffb860',.3*E.warmLamp);
    });
    /* fire ring, logs, crates, a lantern pole */
    cbgEll(g,x+s*.1,y+s*.17,s*.2,s*.055);g.fillStyle=cnA('#1c1814',.8);g.fill();
    for(let i=0;i<6;i++){const a=i/6*TAU;cbgRock(g,C,x+s*.1+Math.cos(a)*s*.17,y+s*.17+Math.sin(a)*s*.045,s*.032,seed+i,null);}
    cbgVol(g,C,x+s*1.4,y+s*.04,s*.26,s*.2,'#6a5a3c',{d:s*.14});cbgVol(g,C,x+s*1.62,y+s*.07,s*.2,s*.15,'#5a6a7a',{d:s*.1});
    cbgTube(g,C,x-s*1.45,y+s*.06,x-s*1.45,y-s*.7,Math.max(2,s*.03),'#8a7a5a');cbgLamp(g,C,x-s*1.45,y-s*.72,s*.07,'#ffc870',.7);
    cnGlow(g,x+s*.1,y+s*.12,s*.9,'#ff9a40',.26*E.warmLamp,{squash:.5});
  },
  an(g,C,it,t){
    const{E}=C,{x,y,s,seed}=it,k=cnFlicker(t,seed,10),fx=x+s*.1,fy=y+s*.16;
    g.save();g.globalCompositeOperation='lighter';
    cnGlow(g,fx,fy-s*.08,s*(.5+.15*k),'#ff8a30',(.25+.25*k)*(.5+.5*E.warmLamp));
    for(let i=0;i<7;i++){const ph=cnPhase(t,.9+cnR(seed,i,1)*.5,i,seed),px=fx+(cnR(seed,i,2)-.5)*s*.14*(1-ph),py=fy-ph*s*.5;
      g.fillStyle=cnA(ph<.4?'#ffd890':'#ff8a30',(1-ph)*.9);const r=s*.04*(1-ph*.6);g.beginPath();g.ellipse(px,py,r*.7,r*1.5,0,0,TAU);g.fill();}
    for(let i=0;i<5;i++){const ph=cnPhase(t,2.2+cnR(seed,i,3),i+9,seed);g.fillStyle=cnA('#ffc070',(1-ph)*.8);g.fillRect(fx+Math.sin(ph*6+i)*s*.14,fy-s*.2-ph*s*1.1,Math.max(1,C.u),Math.max(1,C.u));}
    g.restore();
    cbgPlume(g,t,fx,fy-s*.45,{n:6,per:5,h:s*1.2,r0:s*.04,r1:s*.2,wind:.6,col:'#4a4448',a:.18},seed+3);
  }
};
const CBG_PRIO={hub:0,wreck:1,geyser:2,generators:3,crystals:4,tents:5};
/* layout: pure function of (params, size, seed) so the static bake and the animation agree */
function cbgSurfLayout(p,W,H,seed,fac,hz,bio){
  const feats=Array.isArray(p.features)?p.features.filter(f=>typeof f==='string'):[],items=[];
  const slots=[[.5,.3],[.16,.62],[.85,.5],[.37,.08],[.66,.04],[.06,.3],[.96,.34],[.58,.72]];
  const order=feats.map((f,i)=>({f,i})).filter(o=>CBG_PRIO[o.f]!=null).sort((a,b)=>CBG_PRIO[a.f]-CBG_PRIO[b.f]||a.i-b.i);
  let k=0;
  for(const o of order){
    const sl=slots[k++%slots.length],d=sl[1],dj=(cnR(seed,o.i,91)-.5)*.04;
    items.push({f:o.f,x:W*(sl[0]+dj),y:H*(hz+.052+.1*d),s:H*(.15+.13*d)*(o.f==='tents'?.82:o.f==='wreck'?.9:o.f==='hub'?1.3:1),d,i:o.i,seed:cnH32(seed,o.i,7,7),fac});
  }
  feats.forEach((f,fi)=>{
    if(f==='banners')[[.1,.1],[.5,.5],[.9,.28]].forEach((q,j)=>{const d=q[1];items.push({f:'banner',x:W*(q[0]+(cnR(seed,j,92)-.5)*.04),y:H*(hz+.055+.1*d),s:H*(.115+.07*d),d,i:j+40,seed:cnH32(seed,j,8,8),fac});});
    if(f==='towers'){items.push({f:'tower',x:W*(.08+(cnR(seed,1,93)-.5)*.03),y:H*(hz+.045),s:H*.2,d:0,i:60,seed:cnH32(seed,1,9,9),fac});items.push({f:'tower',x:W*(.9+(cnR(seed,2,93)-.5)*.03),y:H*(hz+.07),s:H*.26,d:.2,i:61,seed:cnH32(seed,2,9,9),fac});items.push({f:'tower',x:W*(.43+(cnR(seed,3,93)-.5)*.04),y:H*(hz+.024),s:H*.13,d:0,i:62,seed:cnH32(seed,3,9,9),fac});}
  });
  return items.sort((a,b)=>a.y-b.y);
}
function cbgDrawItems(g,C,items,mode,t){for(const it of items){const f=CBG_FEAT[it.f];if(!f)continue;const fn=f[mode];if(fn){g.save();fn(g,C,it,t);g.restore();}}}

/* ------------------------------------------------ 8. terrain features that are not objects: cliffs, dunes ------------------------------------------------ */
function cbgCliffs(g,C){
  const{F,E,H,W,u,hzY,seed,ld}=C,M=E.mat,right=ld>0,dir=right?1:-1,xe=right?W*.7:W*.3,base=hzY+H*.24,top=H*.03,far=right?F.x+F.w:F.x,ice=E.bio==='ice';
  const rockC=ice?'#4a6e98':M.rock,rock2=ice?'#9bbde0':M.rock2,M1=40,edge=[];
  for(let j=0;j<=M1;j++){const k=j/M1,off=k*W*.1+(cnFbm(k*5+1.3,.4,seed+5,4)-.5)*W*.1+Math.sin(k*13+seed)*W*.006+(cnR(seed,j,3)<.18?W*.012:0);edge.push([xe+dir*off,base-(base-top)*k]);}
  const tp=[];for(let j=1;j<=14;j++){const k=j/14,xx=edge[M1][0]+(far-edge[M1][0])*k;tp.push([xx,top+(cnFbm(k*4+seed*.01,.8,seed+9,4)-.35)*H*.16*(1-k*.5)]);}
  const outline=edge.concat(tp);
  g.save();g.beginPath();g.moveTo(far,base+H*.06);g.lineTo(edge[0][0],base+H*.06);outline.forEach(q=>g.lineTo(q[0],q[1]));g.lineTo(far,top-H*.2);g.closePath();
  const lit=[[0,E.sh(rock2,1.2)],[.4,E.sh(rockC,.55)],[1,E.sh(rockC,.06)]];
  g.fillStyle=cnLG(g,xe,0,xe+dir*W*.3,0,lit);g.fill();g.clip();
  /* low-poly rock plates: lit near the inner edge, dark deeper in */
  for(let q=0;q<90;q++){
    const dd=Math.pow(cnR(seed,q,1),1.5),cx=xe+dir*(dd*W*.32)+dir*W*.03,cy=top+(base-top)*cnR(seed,q,2),sz=H*(.04+.14*cnR(seed,q,3)),a0=cnR(seed,q,4)*TAU;
    const litP=cnR(seed,q,5)<.62-dd*.45,al=.12+.22*cnR(seed,q,6);
    g.fillStyle=cnA(litP?E.sh(rock2,1.3):E.sh(rockC,-.05),al);
    g.beginPath();for(let v=0;v<3;v++){const aa=a0+v*TAU/3+(cnR(seed,q*3+v,7)-.5)*.8,rr2=sz*(.6+.6*cnR(seed,q*3+v,8));g.lineTo(cx+Math.cos(aa)*rr2*.8,cy+Math.sin(aa)*rr2*1.3);}g.closePath();g.fill();
  }
  /* strata and cracks */
  g.lineCap='round';
  for(let b2=0;b2<16;b2++){const yy=top+(base-top)*(b2/16)+(cnR(seed,b2,11)-.5)*H*.02;g.strokeStyle=cnA(b2%2?E.sh(rockC,-.1):E.sh(rock2,.9),.16);g.lineWidth=Math.max(1,u*(1+2*cnR(seed,b2,12)));g.beginPath();g.moveTo(Math.min(xe,far)-W,yy+H*.02);g.lineTo(Math.max(xe,far)+W,yy-H*.01);g.stroke();}
  for(let q=0;q<22;q++){const xx=xe+dir*W*.26*Math.pow(cnR(seed,q,13),1.4),yy=top+(base-top)*cnR(seed,q,14);g.strokeStyle=cnA(E.sh('#0a0c14',.2),.35);g.lineWidth=Math.max(1,u);g.beginPath();g.moveTo(xx,yy);g.lineTo(xx+(cnR(seed,q,15)-.5)*W*.02,yy+H*(.05+.12*cnR(seed,q,16)));g.stroke();}
  /* snow / dust on the upper faces */
  const sn=ice?'#ffffff':E.sh(cnMix(M.ground[0],'#fff',.2),1.1);
  g.beginPath();g.moveTo(edge[M1][0]+dir*W*.002,edge[M1][1]);for(const q of tp)g.lineTo(q[0],q[1]);g.lineTo(far,top-H*.1);g.lineTo(edge[M1][0],top-H*.1);g.closePath();g.fillStyle=cnA(sn,.0);
  for(let j=22;j<=M1;j++){const k=j/M1,q0=edge[j-1],q1=edge[j],dpt=H*(.02+.05*cnFbm(k*9,.2,seed+4,2))*cnSS(.5,.8,k)*(ice?1.6:.7);if(dpt<2)continue;g.fillStyle=cnA(sn,ice?.95:.5);cbgPoly(g,[q0[0],q0[1],q1[0],q1[1],q1[0]+dir*W*.05,q1[1]+dpt,q0[0]+dir*W*.05,q0[1]+dpt]);g.fill();}
  g.fillStyle=cnA(sn,ice?.95:.45);g.beginPath();g.moveTo(far,top+H*.3);tp.slice().reverse().forEach(q=>g.lineTo(q[0],q[1]));g.lineTo(edge[M1][0],edge[M1][1]);g.lineTo(edge[M1][0]+dir*W*.1,edge[M1][1]+H*.12);g.lineTo(far,top+H*.25);g.closePath();g.fill();
  /* haze at the foot */
  g.fillStyle=cnLG(g,0,base-H*.4,0,base+H*.05,[[0,cnA(E.haze,0)],[1,cnA(E.haze,.5)]]);g.fillRect(Math.min(xe,far)-W,base-H*.4,W*3,H*.46);
  g.restore();
  g.save();g.strokeStyle=cnA(E.litCol,.6);g.lineWidth=Math.max(1.2,1.5*u);g.lineJoin='round';g.beginPath();outline.forEach((q,j)=>j?g.lineTo(q[0],q[1]):g.moveTo(q[0],q[1]));g.stroke();g.restore();
  /* cast shadow of the massif and talus boulders at its foot */
  cbgCast(g,C,edge[0][0]+dir*W*.1,base,W*.3,H*.5,.55);
  for(let i=0;i<18;i++){const bx=xe+dir*(-W*.06+cnR(seed,i,21)*W*.3),by=base+H*(.0+.05*cnR(seed,i,22));cbgRock(g,C,bx,by,H*(.02+.045*cnR(seed,i,23)),seed+i,ice?'#5a7eaa':null);}
}
/* ------------------------------------------------ 9. surface painter ------------------------------------------------ */
const SURFACE=(g,W,H,p,t,seed,S)=>{
  const bio=cbgBio(p.biome),tod=cbgTod(p.time),hz=.6,C=cbgCtx(g,W,H,p,seed,S,hz,bio,tod),E=C.E,F=C.F;
  const feats=Array.isArray(p.features)?p.features:[];
  cbgSky(g,C);
  const ridges=cbgFarLand(g,C,{amp:feats.includes('cliffs')?1.15:1,near:true,groundTop:E.fog(E.sh(E.mat.ground[0],.7),.45)});
  cbgGroundFill(g,C,{dune:feats.includes('dunes'),bands:feats.includes('dunes')?6:7});
  cbgScatter(g,C,{n:feats.includes('dunes')?24:50});
  if(feats.includes('cliffs'))cbgCliffs(g,C);
  const items=cbgSurfLayout(p,W,H,seed,C.fac,hz,bio);
  cbgDrawItems(g,C,items,'st');
  /* foreground: dark rocks framing the lower corners (kept out of the actor columns) */
  for(let i=0;i<6;i++){const sd=i%2?1:-1,x=sd<0?F.x+cnR(seed,i,41)*W*.13:F.x+F.w-cnR(seed,i,41)*W*.13,y=H*(.93+.07*cnR(seed,i,42)),s=H*(.05+.06*cnR(seed,i,43));cbgRock(g,C,x,y,s,seed+i*5,cnMix(E.mat.rock,'#000',.5));}
  /* final atmosphere: warm / cool wash toward the light and a fine ground haze under the horizon */
  g.fillStyle=cnLG(g,0,C.hzY,0,C.hzY+H*.12,[[0,cnA(E.haze,.35)],[1,cnA(E.haze,0)]]);g.fillRect(F.x,C.hzY,F.w,H*.12);
};
SURFACE.static=true;
SURFACE.anim=(g,W,H,p,t,seed,S)=>{
  const bio=cbgBio(p.biome),tod=cbgTod(p.time),hz=.6,C=cbgCtx(g,W,H,p,seed,S,hz,bio,tod),E=C.E,F=C.F;
  const items=cbgSurfLayout(p,W,H,seed,C.fac,hz,bio);
  cbgDrawItems(g,C,items,'an',t);
  if(bio==='ice'&&E.night){g.save();g.globalAlpha=.55;cbgAurora(g,C,t);g.restore();}
  /* wind-blown grit / snow / ash crossing the ground */
  const n=cnN(26,S),sp=S.rm?.3:1,col=bio==='ice'?'#ffffff':bio==='ash'?'#9a8a88':E.sh(E.mat.rock2,1);
  g.save();g.lineCap='round';g.lineWidth=Math.max(1,S.u);
  for(let i=0;i<n;i++){
    const ph=cnPhase(t*sp,9+cnR(seed,i,3)*8,i,seed),x=F.x+((cnR(seed,i,1)+ph*.9)%1)*F.w,y=C.hzY+H*(.03+.4*cnR(seed,i,2))+Math.sin(ph*9+i)*H*.006,a=.2*Math.sin(ph*Math.PI);
    g.strokeStyle=cnA(col,a);g.beginPath();g.moveTo(x,y);g.lineTo(x-H*.04*(.5+cnR(seed,i,4)),y+H*.002);g.stroke();
  }
  g.restore();
};
CINE_PAINT.bg.surface=SURFACE;

/*@@END@@*/
})();
