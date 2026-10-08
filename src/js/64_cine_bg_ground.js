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

/* local summits of a ridge layer (for lava glows, beacons, plumes). Cached: a pure function of its key */
const CBG_PK=new Map();
function cbgPeaks(C,L,amp,base,minK){
  const key=C.seed+'|'+C.W+'|'+C.H+'|'+C.E.bio+'|'+L+'|'+C.F.x+'|'+C.F.w;let r=CBG_PK.get(key);if(r)return r;
  const prof=cbgProfile(C.E.bio,L,C.seed+0),F=C.F,st=7,n=Math.ceil(F.w/st),hs=new Float32Array(n);r=[];
  for(let i=0;i<n;i++)hs[i]=prof((F.x+i*st)/C.H);
  for(let i=6;i<n-6;i++){let m=true;for(let j=-6;j<=6;j++)if(hs[i+j]>hs[i]+1e-6){m=false;break;}if(m&&hs[i]>minK)r.push({x:F.x+i*st,y:base-hs[i]*amp,h:hs[i]});}
  r=r.slice(0,40);if(CBG_PK.size>24)CBG_PK.clear();CBG_PK.set(key,r);return r;
}
/* ash worlds: glowing lava veins down the flanks of the nearer volcanoes and a leaning ash column (static) */
function cbgLava(g,C){
  const{E,H,W,u,hzY,seed,F}=C,night=E.night,k=night?1.3:E.tod==='day'?.55:.95;
  const layers=[{L:1,amp:H*.23,off:H*.004},{L:2,amp:H*.16,off:H*.012}];let tallest=null;
  g.save();g.globalCompositeOperation='lighter';g.lineCap='round';g.lineJoin='round';
  for(const l of layers){
    for(const pk of cbgPeaks(C,l.L,l.amp,hzY+l.off,.5)){
      cnGlow(g,pk.x,pk.y,H*.07*(1+l.L*.2),'#ff5a1a',.42*k);
      for(let sd=0;sd<3;sd++){
        const dir=(sd-1)*(.7+cnR(seed,pk.x|0,sd)*.4);let x=pk.x,y=pk.y+2;
        for(let j=0;j<9;j++){const nx=x+dir*H*.012+(cnR(seed,j+sd*9,(pk.x|0))-.5)*H*.012,ny=y+H*.012*(1+cnR(seed,j,sd+3)),a=(1-j/9)*.7*k;
          g.strokeStyle=cnA('#ff7a2a',a);g.lineWidth=Math.max(1,u*(1.8-j*.15));g.beginPath();g.moveTo(x,y);g.lineTo(nx,ny);g.stroke();x=nx;y=ny;}
      }
      if(!tallest||pk.y<tallest.y)tallest=pk;
    }
  }
  g.restore();
  if(tallest){      /* ash column */
    const T=tallest;
    for(let i=0;i<16;i++){const q=i/15,x=T.x+q*W*.12+Math.sin(q*5+seed)*W*.01,y=T.y-q*H*.36,r=H*(.018+.065*q);cbgPuff(g,x,y,r*1.3,E.sh('#2a2022',.35),.3*(1-q*.5));cbgPuff(g,x+(E.ld>0?r*.3:-r*.3),y-r*.1,r*.7,E.sh('#6a5a58',.9),.18*(1-q*.4));}
  }
}

/* ------------------------------------------------ 5. ground plane: perspective bands, scatter, contact shadows ------------------------------------------------ */
function cbgGroundFill(g,C,o){
  o=o||{};const{F,E,H,W,u,hzY}=C,M=E.mat,y1=F.y+F.h;
  const farC=E.fog(E.sh(M.ground[0],.7),.45),midC=E.sh(cnMix(M.ground[0],M.ground[1],.5),.55),nearC=E.sh(M.ground[1],.35);
  g.fillStyle=cnLG(g,0,hzY,0,y1,[[0,farC],[.2,E.fog(midC,.12)],[.55,midC],[1,nearC]]);g.fillRect(F.x,hzY,F.w,y1-hzY);
  /* sun / moon sheen on the ground (specular on ice, dust haze elsewhere) */
  const sun=C.sun;if(sun){const a=E.bio==='ice'?.4:.2;g.save();g.globalCompositeOperation='lighter';g.fillStyle=cnRG(g,sun.x,hzY,0,W*.5,[[0,cnA(E.glow,a*E.T.gl)],[1,cnA(E.glow,0)]]);
    g.save();g.beginPath();g.rect(F.x,hzY,F.w,y1-hzY);g.clip();g.translate(0,hzY);g.scale(1,.22);g.translate(0,-hzY);g.fillRect(F.x,hzY-W*.5,F.w,W);g.restore();g.restore();}
  /* large soft light / dark patches break up the flat ground tone (cloud shadows, mineral stains, wind scour) */
  for(let i=0;i<18;i++){
    const k=Math.pow(cnR(C.seed,i,81),.75),y=hzY+(y1-hzY)*k*.95,x=F.x+cnR(C.seed,i,82)*F.w,rx=W*(.07+.18*cnR(C.seed,i,83))*(.35+k),ry=rx*.17*(.5+k),light=cnR(C.seed,i,84)<.5;
    g.save();g.translate(x,y);g.scale(1,ry/rx);g.fillStyle=cnRG(g,0,0,0,rx,[[0,light?cnA(E.sh(M.ground[0],1.15),.2):cnA(E.sh(M.ground[1],.05),.26)],[1,'rgba(0,0,0,0)']]);g.fillRect(-rx,-rx,rx*2,rx*2);g.restore();
  }
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
/* a context whose lighting is hazed toward the horizon colour: everything drawn through it recedes (atmospheric perspective) */
const CBG_FOGC=new WeakMap();
function cbgFogC(C,k){
  if(!(k>0))return C;let m=CBG_FOGC.get(C);if(!m){m={};CBG_FOGC.set(C,m);}
  const kk=Math.round(k*100);if(m[kk])return m[kk];
  const E=C.E,E2=Object.assign({},E,{sh:(c,a)=>E.fog(E.sh(c,a),k)});return m[kk]=Object.assign({},C,{E:E2});
}
function cbgDrawItems(g,C,items,mode,t){for(const it of items){const f=CBG_FEAT[it.f];if(!f)continue;const fn=f[mode];if(fn){g.save();fn(g,it.k?cbgFogC(C,it.k):C,it,t);g.restore();}}}

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
  if(bio==='ash')cbgLava(g,C);
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

/* ------------------------------------------------ 10. damage, rubble, crowds, string lights: shared by base / ruins / battlefield ------------------------------------------------ */
/* ragged top edge of something shot to pieces: points along [x0,x1]; yTop = the intact top, amp = the deepest bite */
function cbgJag(x0,x1,yTop,amp,seed,n){const p=[];for(let i=0;i<=n;i++){const k=i/n,r=cnR(seed,i,5);p.push([x0+(x1-x0)*k,yTop+amp*(i%2?.3+.7*r:.5*r)]);}return p;}
/* clip to everything BELOW that edge (the structure is then drawn inside the clip) */
function cbgClipJag(g,p,xa,xb,yb){g.beginPath();g.moveTo(xa,yb);g.lineTo(xa,p[0][1]);for(const q of p)g.lineTo(q[0],q[1]);g.lineTo(xb,p[p.length-1][1]);g.lineTo(xb,yb);g.closePath();g.clip();}
/* the fracture face: a dark inner shade, a lit chip line and bent rebar */
function cbgBreak(g,C,p,seed,rebar){
  const{E,u}=C;g.save();g.lineJoin='miter';g.lineCap='round';
  g.beginPath();p.forEach((q,i)=>i?g.lineTo(q[0],q[1]):g.moveTo(q[0],q[1]));
  g.strokeStyle='rgba(10,8,12,.5)';g.lineWidth=Math.max(2,u*3.4);g.stroke();
  g.translate(0,-u*1.3);g.strokeStyle=cnA(E.litCol,.4);g.lineWidth=Math.max(1,u);g.stroke();g.translate(0,u*1.3);
  if(rebar){g.strokeStyle='rgba(20,18,22,.9)';g.lineWidth=Math.max(1,u*1.5);
    for(let i=1;i<p.length-1;i++)if(cnR(seed,i,8)<.5){const q=p[i],L=(8+cnR(seed,i,9)*20)*u;g.beginPath();g.moveTo(q[0],q[1]);g.quadraticCurveTo(q[0]+(cnR(seed,i,10)-.5)*L*.7,q[1]-L*.6,q[0]+(cnR(seed,i,11)-.5)*L,q[1]-L);g.stroke();}}
  g.restore();
}
/* scorch: a soot bloom on a wall face */
function cbgSoot(g,C,x,y,rx,ry,a){g.save();g.translate(x,y);g.scale(1,ry/rx);g.fillStyle=cnRG(g,0,0,0,rx,[[0,'rgba(8,6,8,'+a+')'],[.55,'rgba(8,6,8,'+a*.5+')'],[1,'rgba(8,6,8,0)']]);g.fillRect(-rx,-rx,rx*2,rx*2);g.restore();}
/* a heap of collapsed masonry, plates and girders. wall = the colour of whatever fell */
function cbgRubble(g,C,x,y,s,seed,wall,o){
  o=o||{};const{E,u}=C,n=o.n||14;
  cbgEll(g,x,y+s*.03,s*1.2,s*.17);g.fillStyle=cnA(E.sh('#14100e',.25),.5);g.fill();
  g.fillStyle=cnLG(g,0,y-s*.32,0,y+s*.05,[[0,E.sh(cnMix(wall||E.mat.rock2,E.mat.ground[0],.3),.95)],[1,E.sh(cnMix(wall||E.mat.rock,'#000',.3),.12)]]);
  g.beginPath();g.moveTo(x-s*1.1,y+s*.04);g.quadraticCurveTo(x-s*.5,y-s*.36,x+s*.05,y-s*.32);g.quadraticCurveTo(x+s*.6,y-s*.3,x+s*1.1,y+s*.04);g.closePath();g.fill();
  for(let i=0;i<n;i++){const k=(cnR(seed,i,1)-.5)*2,px=x+k*s*.95,py=y-s*.27*(1-k*k)*cnR(seed,i,2)+s*.03,w=s*(.07+.14*cnR(seed,i,3));
    if(cnR(seed,i,4)<.5)cbgRock(g,C,px,py+w*.2,w,seed+i*3,wall?cnMix(wall,'#000',.2):null);
    else{g.save();g.translate(px,py);g.rotate((cnR(seed,i,5)-.5)*1.2);g.fillStyle=E.sh(wall||E.mat.rock2,.7);g.fillRect(-w,-w*.22,w*2,w*.44);g.fillStyle=E.sh(wall||E.mat.rock2,1.15);g.fillRect(-w,-w*.22,w*2,Math.max(1,u));g.restore();}}
  g.strokeStyle='rgba(16,14,18,.9)';g.lineCap='round';g.lineWidth=Math.max(1.5,u*2);
  for(let i=0;i<(o.beams==null?3:o.beams);i++){const bx=x+(cnR(seed,i,21)-.5)*s*1.4,L=s*(.4+.6*cnR(seed,i,22)),a=-Math.PI/2+(cnR(seed,i,23)-.5)*1.5;g.beginPath();g.moveTo(bx,y-s*.05);g.lineTo(bx+Math.cos(a)*L,y-s*.05+Math.sin(a)*L*.9);g.stroke();}
}
/* a crowd of tiny figures standing on the line y (backlit: dark bodies, a rim of warm light on the lit side). s = figure height */
function cbgCrowd(g,C,x0,x1,y,s,seed,cols,o){
  o=o||{};const{E,u,ld}=C,n=Math.round((x1-x0)/(s*.62)*(o.dense||1));
  for(let i=0;i<n;i++){
    const px=x0+(i+cnR(seed,i,1)*.8)/n*(x1-x0),py=y+(cnR(seed,i,2)-.4)*s*.9,z=.85+(py-y)/s*.18+cnR(seed,i,3)*.12,h=s*z,c=cols[(cnR(seed,i,4)*cols.length)|0],arm=cnR(seed,i,5)<(o.cheer==null?.45:o.cheer);
    cnShadow(g,px-ld*h*.1,py+h*.02,h*.28,h*.07,.35);
    g.fillStyle=E.sh(cnMix(c,'#10121a',.5),.4);
    g.beginPath();g.moveTo(px-h*.17,py);g.lineTo(px-h*.12,py-h*.62);g.quadraticCurveTo(px,py-h*.72,px+h*.12,py-h*.62);g.lineTo(px+h*.17,py);g.closePath();g.fill();
    g.beginPath();g.arc(px,py-h*.8,h*.115,0,TAU);g.fill();
    if(arm){g.strokeStyle=g.fillStyle;g.lineWidth=Math.max(1,h*.07);g.lineCap='round';g.beginPath();const sd=cnR(seed,i,6)<.5?-1:1;g.moveTo(px+sd*h*.1,py-h*.6);g.lineTo(px+sd*h*.24,py-h*(1.0+.12*cnR(seed,i,7)));g.stroke();}
    g.fillStyle=cnA(E.litCol,.35);g.fillRect(px+(ld>0?h*.03:-h*.1),py-h*.88,h*.07,h*.1);   // rim
  }
}
/* a sagging line of paper lanterns / pennants between two points; returns nothing, static pass */
function cbgStringLights(g,C,x0,y0,x1,y1,sag,n,cols,seed,o){
  o=o||{};const{E,u}=C,lamp=E.warmLamp;
  const P=k=>[x0+(x1-x0)*k,y0+(y1-y0)*k+Math.sin(k*Math.PI)*sag];
  g.strokeStyle=cnA(E.sh('#2a2630',.5),.8);g.lineWidth=Math.max(1,u*.9);g.beginPath();for(let i=0;i<=24;i++){const q=P(i/24);i?g.lineTo(q[0],q[1]):g.moveTo(q[0],q[1]);}g.stroke();
  const pts=[];
  for(let i=1;i<n;i++){
    const k=i/n,q=P(k),c=cols[(cnR(seed,i,1)*cols.length)|0],r=(o.r||5)*u*(.85+.3*cnR(seed,i,2));
    pts.push([q[0],q[1]+r,c,r]);
    if(o.flags){g.fillStyle=E.sh(c,.8);cbgPoly(g,[q[0]-r*.9,q[1],q[0]+r*.9,q[1],q[0],q[1]+r*2.4]);g.fill();}
    else{
      g.fillStyle=cnLG(g,q[0]-r,0,q[0]+r,0,[[0,E.sh(cnMix(c,'#fff',.2),.9+.4*lamp)],[1,E.sh(c,.5+.6*lamp)]]);
      g.beginPath();g.ellipse(q[0],q[1]+r*1.1,r*.8,r*1.1,0,0,TAU);g.fill();
      g.fillStyle=E.sh('#3a3030',.4);g.fillRect(q[0]-r*.3,q[1],r*.6,r*.35);g.fillRect(q[0]-r*.3,q[1]+r*2,r*.6,r*.3);
    }
  }
  if(!o.flags&&lamp>.15&&!C.bat)for(const q of pts)cnGlow(g,q[0],q[1],q[3]*(3+lamp*3),q[2],.4*lamp);
  return pts;
}

/* ------------------------------------------------ 11. base: Meridian fortress, Obsidian war-camp, Aurora domes ------------------------------------------------ */
const CBG_BASE_BIO={meridian:'dust',obsidian:'ash',aurora:'green'};
/* ---- Meridian ---- */
function cbgMerTop(g,C,x,y,w,d,P,col,seed,n){    // parapet slab + merlons on a box whose front-top edge is (x±w/2, y)
  const{E,u,ld}=C,xl=x-w/2,hs=Math.max(2,w*.07);
  cbgVol(g,C,x,y,w*1.1,hs,P.wall2,{d:d*1.1});
  const mw=w*1.1/n;
  for(let i=0;i<n;i++){const mx=xl-w*.05+i*mw+mw*.2,mh=Math.max(2,w*.1);g.fillStyle=E.sh(P.wall2,.7);g.fillRect(mx,y-hs-mh,mw*.6,mh);g.fillStyle=E.sh(P.wall2,1.2);g.fillRect(mx,y-hs-mh,mw*.6,Math.max(1,u));g.fillStyle='rgba(0,0,0,.18)';g.fillRect(mx+(ld>0?mw*.42:0),y-hs-mh,mw*.18,mh);}
}
CBG_FEAT.m_tower={
  st(g,C,it){
    const{E,u,ld}=C,{x,y,s,fac,seed,dmg}=it,P=cbgFacPal(fac),col=cnFac(fac),w=s,h=s*(it.hh||2.4),d=w*.42,xl=x-w/2;
    cbgCast(g,C,x,y,w,h,.8);
    g.save();let jag=null;
    if(dmg){jag=cbgJag(xl-w*.2,xl+w*1.3,y-h*(it.cut||.7),h*.2,seed,9);cbgClipJag(g,jag,xl-w*.5,xl+w*1.6,y+s);}
    cbgVol(g,C,x,y,w,h,cnMix(P.wall,'#1e2638',.1),{d});
    g.fillStyle=cnA(E.sh(P.dark,.25),.9);g.fillRect(xl,y-h*.09,w,h*.09);                       // plinth
    g.fillStyle=cnA(E.sh(col.base,.9),.95);g.fillRect(xl,y-h*.62,w,h*.035);g.fillStyle=cnA(col.light,.55);g.fillRect(xl,y-h*.62,w,Math.max(1,u*.8));
    cbgWindows(g,C,xl+w*.22,y-h*.56,w*.56,h*.38,3,5,E.night?'#ffe2a0':col.glow,seed,{p:dmg?.12:.85});
    g.strokeStyle='rgba(0,0,0,.2)';g.lineWidth=Math.max(1,u*.8);g.beginPath();for(let i=1;i<4;i++){g.moveTo(xl+w*i/4,y-h*.09);g.lineTo(xl+w*i/4,y-h*.96);}g.stroke();
    if(!dmg){
      cbgMerTop(g,C,x,y-h,w,d,P,col,seed,6);
      const tw=w*.7,th=w*.2,v=cbgPlanBox(g,C,'turret',fac,x,y-h-w*.16,tw,th,P.wall,{d:w*.3});     // gun turret: the game's turret plate is the roof
      const bx=v.roof.x,by=v.roof.y,dir=-ld||1;
      g.strokeStyle=E.sh('#10141c',.5);g.lineWidth=Math.max(2,w*.07);g.lineCap='butt';g.beginPath();g.moveTo(bx,by);g.lineTo(bx+dir*w*.78,by-w*.14);g.stroke();
      g.strokeStyle=cnA(E.litCol,.5);g.lineWidth=Math.max(1,w*.02);g.beginPath();g.moveTo(bx,by-w*.03);g.lineTo(bx+dir*w*.78,by-w*.17);g.stroke();
      g.strokeStyle=E.sh('#8a94a8',.7);g.lineWidth=Math.max(1,u*1.5);g.beginPath();g.moveTo(bx-dir*w*.2,by-th*.4);g.lineTo(bx-dir*w*.2,by-th-w*.5);g.stroke();
    }
    g.restore();
    if(dmg){cbgSoot(g,C,x,y-h*.7,w*.7,h*.22,.4);cbgBreak(g,C,jag,seed,true);}
    else cbgSoot(g,C,x+w*.2,y-h*.4,w*.5,h*.15,it.st==='siege'?.35:0);
  },
  an(g,C,it,t){
    const{E,ld}=C,{x,y,s,fac,seed,dmg}=it,w=s,h=s*(it.hh||2.4),col=cnFac(fac);if(dmg)return;
    const b=Math.max(0,Math.sin(t*2.4+it.i*1.9));cnGlow(g,x+(-ld||1)*w*.1,y-h-w*.7,w*.14,'#ff3a2a',.15+.85*b*b,{core:.6});
    if(it.st==='siege'){const k=Math.floor(t*2.3+it.i),ph=cnFrac(t*2.3+it.i);if(cnR(seed,k,31)<.6&&ph<.14)cnGlow(g,x+(-ld||1)*w*.85,y-h-w*.3,w*.5,'#ffd890',(1-ph/.14)*.9,{core:.8});}
  }
};
CBG_FEAT.m_wall={
  st(g,C,it){
    const{E,u,ld}=C,{x0,x1,y,h,fac,seed,dmg}=it,P=cbgFacPal(fac),col=cnFac(fac),w=x1-x0,xc=(x0+x1)/2,d=h*.6;
    cbgCast(g,C,xc,y,w,h,.7);
    g.save();let jag=null;
    if(dmg){jag=[];const n=Math.ceil(w/(h*.45));for(let i=0;i<=n;i++){const k=i/n,f=cnFbm(k*5+seed*.01,.7,seed,3),r=cnR(seed,i,5);jag.push([x0+w*k,y-h*(f>.5?1:.25+.6*r)*(i%2?.9:1)]);}cbgClipJag(g,jag,x0-w*.1,x1+w*.1,y+h);}
    cbgVol(g,C,xc,y,w,h,cnMix(P.wall,'#1e2638',.08),{d});
    g.fillStyle=cnA(E.sh(P.dark,.25),.9);g.fillRect(x0,y-h*.12,w,h*.12);
    g.fillStyle=cnA(E.sh(col.base,.9),.9);g.fillRect(x0,y-h*.72,w,h*.05);g.fillStyle=cnA(col.light,.45);g.fillRect(x0,y-h*.72,w,Math.max(1,u*.8));
    g.strokeStyle='rgba(0,0,0,.22)';g.lineWidth=Math.max(1,u*.8);g.beginPath();
    for(let xx=x0;xx<x1;xx+=h*1.15){g.moveTo(xx,y-h*.12);g.lineTo(xx,y-h*.97);}g.stroke();
    for(let xx=x0+h*.57;xx<x1;xx+=h*1.15){g.fillStyle=cnA(E.sh(P.wall2,.6),.95);g.fillRect(xx-h*.07,y-h,h*.14,h);g.fillStyle=cnA(E.sh(P.wall2,1.1),.5);g.fillRect(xx-h*.07,y-h,Math.max(1,u),h);}   // buttress ribs
    for(let xx=x0+h*.3;xx<x1;xx+=h*.57){const on=cnR(seed,(xx/h)|0,6)<(dmg?.15:.5+.5*E.warmLamp);g.fillStyle=on?cnA(col.glow,.85):'rgba(8,12,22,.8)';g.fillRect(xx-h*.09,y-h*.5,h*.18,h*.07);}   // gun ports
    if(!dmg){const mw=h*.26;g.fillStyle=E.sh(P.wall2,.85);for(let xx=x0;xx<x1;xx+=mw*1.7)g.fillRect(xx,y-h-h*.1,mw,h*.1);
      g.fillStyle=E.sh(P.wall2,1.2);for(let xx=x0;xx<x1;xx+=mw*1.7)g.fillRect(xx,y-h-h*.1,mw,Math.max(1,u));}
    g.restore();
    if(dmg){cbgBreak(g,C,jag,seed,true);for(let i=0;i<3;i++)cbgSoot(g,C,x0+w*(.2+.3*i)+cnR(seed,i,9)*h,y-h*.5,h*.8,h*.35,.35);}
    else if(it.st==='siege')for(let i=0;i<3;i++)cbgSoot(g,C,x0+w*cnR(seed,i,9),y-h*.5,h*.6,h*.3,.3);
  }
};
CBG_FEAT.m_gate={
  st(g,C,it){
    const{E,u,ld}=C,{x,y,s,fac,seed,dmg}=it,P=cbgFacPal(fac),col=cnFac(fac),gw=s,gh=s*.82;
    cbgCast(g,C,x,y,gw*1.5,gh*1.2,.7);
    g.save();let jag=null;if(dmg){jag=cbgJag(x-gw*1.2,x+gw*1.2,y-gh*1.6,gh*.5,seed,9);cbgClipJag(g,jag,x-gw*1.4,x+gw*1.4,y+s);}
    for(const sd of[-1,1])cbgVol(g,C,x+sd*gw*.72,y,gw*.5,gh*1.55,cnMix(P.wall,'#1e2638',.12),{d:gw*.3});    // pylons
    cbgVol(g,C,x,y-gh,gw*1.95,gh*.55,cnMix(P.wall,'#1e2638',.05),{d:gw*.34});                              // lintel
    const ox=x-gw/2,oy=y-gh;
    g.fillStyle=cnLG(g,0,oy,0,y,[[0,'#04070e'],[1,cnMix(col.dark,'#000',.4)]]);g.fillRect(ox,oy,gw,gh);
    if(!dmg){
      g.save();g.globalCompositeOperation='lighter';
      g.fillStyle=cnLG(g,0,oy,0,y,[[0,cnA(col.glow,.18)],[1,cnA(col.glow,.5)]]);g.fillRect(ox,oy,gw,gh);
      g.strokeStyle=cnA(col.light,.4);g.lineWidth=Math.max(1,u);g.beginPath();for(let i=1;i<9;i++){g.moveTo(ox+gw*i/9,oy);g.lineTo(ox+gw*i/9,y);}g.stroke();
      g.restore();
      cnGlow(g,x,y-gh*.5,gw*1.1,col.glow,.3+.25*E.warmLamp);
      for(const sd of[-1,1]){cbgLamp(g,C,x+sd*gw*.64,y-gh*1.02,s*.05,col.glow,.6);}
      g.fillStyle=cnA(E.sh(col.base,.9),.95);g.fillRect(x-gw*.97,y-gh*1.28,gw*1.94,gh*.06);
    }
    g.restore();
    if(dmg)cbgBreak(g,C,jag,seed,true);
  },
  an(g,C,it,t){if(it.dmg)return;const{x,y,s,fac}=it,col=cnFac(fac),gw=s,gh=s*.82;g.save();g.globalCompositeOperation='lighter';
    const sc=cnFrac(t*.5);g.fillStyle=cnLG(g,0,y-gh*(1-sc)-gh*.1,0,y-gh*(1-sc)+gh*.06,[[0,cnA(col.light,0)],[.5,cnA(col.light,.35)],[1,cnA(col.light,0)]]);g.fillRect(x-gw/2,y-gh*(1-sc)-gh*.1,gw,gh*.16);g.restore();}
};
CBG_FEAT.m_dome={
  st(g,C,it){
    const{E,u,ld}=C,{x,y,s,fac,seed,dmg}=it,P=cbgFacPal(fac),col=cnFac(fac),r=s;
    cbgCast(g,C,x,y,r*1.7,r*1.1,.8);
    g.save();let jag=null;if(dmg){jag=cbgJag(x-r*1.1,x+r*1.1,y-r*.8,r*.5,seed,8);cbgClipJag(g,jag,x-r*1.3,x+r*1.3,y+r);}
    cbgVol(g,C,x,y,r*2.1,r*.3,cnMix(P.wall,'#202838',.18),{d:r*.5});
    const cy=y-r*.3;
    g.fillStyle=cnLG(g,x-r,cy,x+r,cy,ld>0?[[0,E.sh('#eef4ff',1.15)],[.5,E.sh(P.wall2,.55)],[1,E.sh(P.wall,.05)]]:[[0,E.sh(P.wall,.05)],[.5,E.sh(P.wall2,.55)],[1,E.sh('#eef4ff',1.15)]]);
    g.beginPath();g.ellipse(x,cy,r,r*.88,0,Math.PI,TAU);g.fill();
    g.strokeStyle='rgba(0,0,0,.2)';g.lineWidth=Math.max(1,u*.8);g.beginPath();for(const k of[-.62,-.3,0,.3,.62]){g.moveTo(x+k*r,cy);g.quadraticCurveTo(x+k*r*.9,cy-r*.6,x,cy-r*.88);}g.stroke();
    g.fillStyle=cnA(E.sh(col.base,.9),.9);g.fillRect(x-r,cy-r*.12,r*2,r*.06);
    cbgLamp(g,C,x,cy-r*.45,r*.1,col.glow,.5);
    g.restore();if(dmg)cbgBreak(g,C,jag,seed,false);
  }
};
CBG_FEAT.m_keep={
  st(g,C,it){
    const{E,u,ld}=C,{x,y,s,fac,seed,dmg}=it,P=cbgFacPal(fac),col=cnFac(fac),w1=s*2.5,h1=s*.62,d1=s*.9,sh1=ld*d1*.5;
    cbgCast(g,C,x,y,w1,s*1.9,.9);
    g.save();let jag=null;
    if(dmg){jag=cbgJag(x-w1*.55,x+w1*.55,y-h1-d1*.2-s*.45,s*.55,seed,13);cbgClipJag(g,jag,x-w1,x+w1,y+s);}
    const v1=cbgPlanBox(g,C,'garrison',fac,x,y,w1,h1,cnMix(P.wall,'#1e2638',.1),{d:d1});
    const wy=y-h1;
    g.fillStyle=cnA(E.sh(col.base,.9),.95);g.fillRect(x-w1/2,wy+h1*.1,w1,h1*.1);g.fillStyle=cnA(col.light,.45);g.fillRect(x-w1/2,wy+h1*.1,w1,Math.max(1,u*.8));
    cbgWindows(g,C,x-w1*.45,wy+h1*.32,w1*.9,h1*.3,18,2,E.night?'#ffe2a0':col.glow,seed,{p:dmg?.1:.9});
    g.strokeStyle='rgba(0,0,0,.2)';g.lineWidth=Math.max(1,u*.8);g.beginPath();for(let i=1;i<12;i++){g.moveTo(x-w1/2+w1*i/12,wy+h1*.2);g.lineTo(x-w1/2+w1*i/12,y-h1*.1);}g.stroke();
    const w2=w1*.56,h2=s*.82,d2=d1*.62,y2=y-h1-d1*.3,x2=x+sh1*.3;
    const v2=cbgPlanBox(g,C,'hub',fac,x2,y2,w2,h2,cnMix(P.wall,'#1e2638',0),{d:d2});
    const wy2=y2-h2;
    g.fillStyle=cnA(E.sh(col.base,.9),.95);g.fillRect(x2-w2/2,wy2+h2*.08,w2,h2*.07);
    cbgWindows(g,C,x2-w2*.42,wy2+h2*.25,w2*.84,h2*.5,9,4,E.night?'#ffe2a0':col.glow,seed+3,{p:dmg?.1:.8});
    if(!dmg){
      const r=v2.roof,rx=w2*.17;
      g.fillStyle=cnLG(g,r.x-rx,r.y-rx,r.x+rx,r.y+rx*.5,ld>0?[[0,E.sh('#e8f2ff',1.1)],[1,E.sh(P.wall2,.2)]]:[[0,E.sh(P.wall2,.2)],[1,E.sh('#e8f2ff',1.1)]]);
      g.beginPath();g.ellipse(r.x,r.y,rx,rx*.42,0,0,TAU);g.fill();g.beginPath();g.ellipse(r.x,r.y-rx*.18,rx*.82,rx*.8,0,Math.PI,TAU);g.fill();
      g.fillStyle=cnRG(g,r.x,r.y-rx*.4,0,rx*.8,[[0,cnA('#ffffff',.9)],[.5,cnA(col.glow,.8)],[1,cnA(col.base,.5)]]);g.beginPath();g.ellipse(r.x,r.y-rx*.2,rx*.55,rx*.5,0,Math.PI,TAU);g.fill();
      cnGlow(g,r.x,r.y-rx*.3,rx*2.4,col.glow,.35+.2*E.warmLamp);
      const mx=r.x+w2*.3,my=r.y+d2*.1;g.strokeStyle=E.sh('#9aa4b8',.7);g.lineWidth=Math.max(1.5,u*2);g.beginPath();g.moveTo(mx,my);g.lineTo(mx,my-s*1.1);g.stroke();
      g.strokeStyle=E.sh('#cfd8e8',1);g.lineWidth=Math.max(1,u*1.3);g.beginPath();g.ellipse(mx+s*.05,my-s*.82,s*.24,s*.09,-.5,0,TAU);g.stroke();g.beginPath();g.moveTo(mx+s*.05,my-s*.82);g.lineTo(mx+s*.24,my-s*.94);g.stroke();
    }
    g.restore();
    if(dmg){cbgBreak(g,C,jag,seed,true);cbgSoot(g,C,x,y-h1*1.5,w1*.3,s*.4,.4);}
  },
  an(g,C,it,t){if(it.dmg)return;const{x,y,s,fac,ld}=it,w1=s*2.5,h1=s*.62,d1=s*.9,w2=w1*.56,y2=y-h1-d1*.3,x2=x+ld*d1*.5*.3,d2=d1*.62,sh2=ld*d2*.5,mx=x2+sh2/2+w2*.3,my=y2-s*.82-d2/2+d2*.1;
    const b=Math.max(0,Math.sin(t*3.0));cnGlow(g,mx,my-s*1.12,s*.15,'#ff3a2a',.2+.8*b*b,{core:.6});}
};
/* ---- Obsidian: black stone, iron spikes, ember light ---- */
/* glowing ember cracks running down a face (additive) */
function cbgCracks(g,C,x0,y0,x1,y1,seed,n,a,col){
  g.save();g.globalCompositeOperation='lighter';g.lineJoin='round';g.lineCap='round';
  for(let i=0;i<n;i++){
    let x=x0+(x1-x0)*cnR(seed,i,1),y=y0+(y1-y0)*cnR(seed,i,2)*.45;const L=(y1-y0)*(.25+.5*cnR(seed,i,3)),pts=[[x,y]];
    for(let j=0;j<6;j++){x+=(cnR(seed,i*7+j,4)-.5)*(x1-x0)*.08;y+=L/6;pts.push([x,y]);}
    g.beginPath();pts.forEach((q,j)=>j?g.lineTo(q[0],q[1]):g.moveTo(q[0],q[1]));
    g.strokeStyle=cnA(col,a*.3);g.lineWidth=Math.max(2,C.u*3.2);g.stroke();g.strokeStyle=cnA(cnMix(col,'#fff',.45),a);g.lineWidth=Math.max(1,C.u*.9);g.stroke();
  }
  g.restore();
}
/* a curved black thorn: base width w, tip at (x+lean, y-h) */
function cbgThorn(g,C,x,y,w,h,lean,col,seed,o){
  o=o||{};const{E,u,ld}=C,n=8,L=[],R=[];
  for(let i=0;i<=n;i++){const k=i/n,wk=(1-Math.pow(k,.8))*w/2,bend=lean*k*k;L.push([x-wk+bend,y-h*k]);R.push([x+wk+bend,y-h*k]);}
  const lit=E.sh(cnMix(col,'#fff',.12),.9),mid=E.sh(col,.28),dk=E.sh(col,.03);
  g.beginPath();for(let i=0;i<=n;i++)i?g.lineTo(L[i][0],L[i][1]):g.moveTo(L[i][0],L[i][1]);for(let i=n;i>=0;i--)g.lineTo(R[i][0],R[i][1]);g.closePath();
  g.fillStyle=cnLG(g,x-w/2,0,x+w/2,0,ld>0?[[0,lit],[.45,mid],[1,dk]]:[[0,dk],[.55,mid],[1,lit]]);g.fill();
  for(let j=1;j<=3;j++){const k=j*.2+.05,sd=(j+cnH32(seed,j,1,1))%2?1:-1,q=sd>0?R[Math.round(k*n)]:L[Math.round(k*n)],bl=w*(.55-j*.1);
    g.fillStyle=sd*ld>0?lit:dk;cbgPoly(g,[q[0],q[1],q[0]+sd*bl,q[1]-bl*1.5,q[0]-sd*w*.02,q[1]-bl*.55]);g.fill();}
  g.strokeStyle=cnA(E.litCol,.42);g.lineWidth=Math.max(1,u);g.beginPath();const E1=ld>0?L:R;E1.forEach((q,i)=>i?g.lineTo(q[0],q[1]):g.moveTo(q[0],q[1]));g.stroke();
  if(o.ember){g.save();g.globalCompositeOperation='lighter';g.strokeStyle=cnA('#ff7a3a',.55*o.ember);g.lineWidth=Math.max(1,w*.07);g.beginPath();g.moveTo(x,y);for(let i=1;i<=n;i++)g.lineTo(x+lean*Math.pow(i/n,2),y-h*i/n*.92);g.stroke();
    cnGlow(g,x+lean,y-h*.96,Math.max(4,w*.55),'#ff6a2a',.6*o.ember);g.restore();}
}
CBG_FEAT.o_spire={
  st(g,C,it){const{E}=C,{x,y,s,fac,seed,dmg}=it,P=cbgFacPal(fac);cbgCast(g,C,x,y,s*.5,s*3.4,.6);
    if(dmg){cbgThorn(g,C,x,y,s*.5,s*1.5,s*.1,P.wall,seed,{});cbgRubble(g,C,x+s*.3,y,s*.4,seed,P.wall,{n:6,beams:1});}
    else{cbgThorn(g,C,x,y,s*.55,s*3.4,s*(cnR(seed,1,2)-.5)*.5,P.wall,seed,{ember:.7});}},
  an(g,C,it,t){if(it.dmg)return;const{x,y,s,seed}=it,lean=s*(cnR(seed,1,2)-.5)*.5;cnGlow(g,x+lean,y-s*3.3,s*.4,'#ff6a2a',.35+.4*cnFlicker(t,seed,6));}
};
CBG_FEAT.o_citadel={
  st(g,C,it){
    const{E,u,ld}=C,{x,y,s,fac,seed,dmg}=it,P=cbgFacPal(fac),col=cnFac(fac),em='#ff7a3a',w1=s*3.1,h1=s*.78,d1=s*.95,sh1=ld*d1*.5,dark=cnMix(P.wall,'#0a0608',.25);
    cbgCast(g,C,x,y,w1,s*2.3,1);
    g.save();let jag=null;
    if(dmg){jag=cbgJag(x-w1*.6,x+w1*.6,y-h1-d1*.2-s*.6,s*.7,seed,13);cbgClipJag(g,jag,x-w1,x+w1,y+s);}
    const v1=cbgPlanBox(g,C,'garrison',fac,x,y,w1,h1,dark,{d:d1});
    const wy=y-h1;
    /* battered skirt + ember seams */
    g.fillStyle=cnA(E.sh('#0a0608',.2),.85);cbgPoly(g,[x-w1/2-s*.06,y,x+w1/2+s*.06,y,x+w1/2,y-h1*.22,x-w1/2,y-h1*.22]);g.fill();
    g.fillStyle=cnA(E.sh(P.wall2,.7),.6);for(let i=0;i<9;i++){const bx=x-w1/2+w1*(i+.5)/9;cbgPoly(g,[bx-s*.1,wy,bx+s*.1,wy,bx+s*.06,y-h1*.2,bx-s*.06,y-h1*.2]);g.fill();}
    g.save();g.globalCompositeOperation='lighter';
    for(let i=0;i<9;i++){const bx=x-w1/2+w1*(i+.5)/9,fl=.7+.3*cnR(seed,i,3);g.fillStyle=cnLG(g,0,wy+h1*.2,0,y-h1*.28,[[0,cnA(em,0)],[.5,cnA(em,.75*fl)],[1,cnA('#ffd890',.9*fl)]]);g.fillRect(bx-s*.014,wy+h1*.2,s*.028,h1*.5);}
    g.restore();
    cbgCracks(g,C,x-w1/2,wy,x+w1/2,y,seed,10,.55,em);
    const w2=w1*.58,h2=s*1.05,d2=d1*.62,y2=y-h1-d1*.28,x2=x+sh1*.28;
    const v2=cbgPlanBox(g,C,'foundry',fac,x2,y2,w2,h2,dark,{d:d2});
    const wy2=y2-h2;
    /* furnace maw */
    const mw=w2*.34,mh=h2*.62;
    g.fillStyle=cnLG(g,0,y2-mh,0,y2,[[0,'#2a0a06'],[.6,'#a8300c'],[1,'#ffb050']]);rr(g,x2-mw/2,y2-mh,mw,mh,mw*.45,g.fillStyle);
    g.fillStyle='#0a0406';for(let i=-2;i<=2;i++)g.fillRect(x2+i*mw*.17-s*.012,y2-mh,s*.024,mh);
    cnGlow(g,x2,y2-mh*.4,mw*1.6,em,.5);
    cbgCracks(g,C,x2-w2/2,wy2,x2+w2/2,y2,seed+5,6,.5,em);
    g.fillStyle=cnA(E.sh(P.wall2,.5),.9);g.fillRect(x2-w2/2,wy2+h2*.05,w2,h2*.07);
    /* jaws on the roof edge */
    if(!dmg){
      const r=v2.roof;
      for(let i=0;i<9;i++){const bx=x2-w2*.46+w2*.92*i/8,bh=s*(.12+.1*cnR(seed,i,5));g.fillStyle=E.sh(i%2?P.wall:P.wall2,.5);cbgPoly(g,[bx-s*.05,y2-h2,bx+s*.05,y2-h2,bx,y2-h2-bh]);g.fill();}
      cbgThorn(g,C,r.x,r.y+d2*.1,s*.5,s*2.5,-s*.12*ld,P.wall,seed+1,{ember:1});
      cbgThorn(g,C,r.x-w2*.34,r.y+d2*.2,s*.34,s*1.55,-s*.2,P.wall,seed+2,{ember:.8});
      cbgThorn(g,C,r.x+w2*.34,r.y+d2*.2,s*.34,s*1.7,s*.2,P.wall,seed+3,{ember:.8});
      for(const sd of[-1,1])cbgThorn(g,C,x+sd*w1*.46+sh1*.4,y-h1-d1*.1,s*.3,s*1.1,sd*s*.12,P.wall,seed+sd+9,{ember:.6});
    }
    g.restore();
    if(dmg){cbgBreak(g,C,jag,seed,true);cbgSoot(g,C,x,y-h1*1.6,w1*.3,s*.5,.45);}
  },
  an(g,C,it,t){const{x,y,s,seed,dmg}=it,{ld}=C,w1=s*3.1,h1=s*.78,d1=s*.95,w2=w1*.58,y2=y-h1-d1*.28,x2=x+ld*d1*.5*.28,h2=s*1.05,mh=h2*.62,mw=w2*.34;
    const fl=cnFlicker(t,seed,7);cnGlow(g,x2,y2-mh*.4,mw*1.3,'#ff8a3a',.2+.35*fl);
    if(dmg)return;const r={x:x2+ld*d1*.62*.5/2,y:y2-h2-d1*.62/2};cnGlow(g,r.x,r.y-s*2.45,s*.45,'#ff6a2a',.3+.4*cnFlicker(t,seed+1,6));
    cbgPlume(g,t,x2-w2*.18,y2-h2-s*.1,{n:7,per:6,h:s*2.2,r0:s*.1,r1:s*.5,wind:.5,col:'#1a1416',a:.4},seed);}
};
CBG_FEAT.o_palisade={
  st(g,C,it){
    const{E,u,ld}=C,{x0,x1,y,h,fac,seed,dmg}=it,P=cbgFacPal(fac),w=x1-x0,sw=h*.16,n=Math.ceil(w/(sw*.82));
    cbgCast(g,C,(x0+x1)/2,y,w,h*.9,.7);
    /* earth berm */
    g.fillStyle=cnLG(g,0,y-h*.3,0,y+h*.05,[[0,E.sh(cnMix('#2a2024',E.mat.ground[1],.4),.6)],[1,E.sh('#120c10',.2)]]);
    g.beginPath();g.moveTo(x0,y+h*.05);for(let xx=x0;xx<=x1;xx+=h*.3)g.lineTo(xx,y-h*.12-h*.08*cnFbm(xx/h*.7,1.1,seed,2));g.lineTo(x1,y+h*.05);g.closePath();g.fill();
    for(let i=0;i<n;i++){
      const px=x0+(i+.5)/n*w,r=cnR(seed,i,1);if(dmg&&r<.3)continue;
      let sh=h*(.75+.45*cnR(seed,i,2));if(dmg)sh*=.35+.65*cnR(seed,i,3);
      const tilt=(cnR(seed,i,4)-.5)*.1*(dmg?3:1),tx=px+tilt*sh;
      g.fillStyle=cnLG(g,px-sw/2,0,px+sw/2,0,ld>0?[[0,E.sh('#5a4a50',.9)],[.5,E.sh('#2a2226',.3)],[1,E.sh('#120c10',.03)]]:[[0,E.sh('#120c10',.03)],[.5,E.sh('#2a2226',.3)],[1,E.sh('#5a4a50',.9)]]);
      cbgPoly(g,[px-sw/2,y,px+sw/2,y,tx+sw*.5,y-sh*.82,tx,y-sh,tx-sw*.5,y-sh*.82]);g.fill();
      g.strokeStyle=cnA(E.litCol,.28);g.lineWidth=Math.max(1,u*.8);g.beginPath();g.moveTo(px+(ld>0?-sw/2:sw/2),y);g.lineTo(tx+(ld>0?-sw*.5:sw*.5),y-sh*.82);g.lineTo(tx,y-sh);g.stroke();
    }
    /* iron bands + rivets */
    for(const k of[.32,.62]){g.fillStyle=cnA(E.sh('#2e2428',.55),.95);g.fillRect(x0,y-h*k-h*.03,w,h*.06);g.fillStyle=cnA(E.sh('#8a7a80',.9),.4);g.fillRect(x0,y-h*k-h*.03,w,Math.max(1,u*.9));
      g.fillStyle=cnA(E.sh('#8a7a80',.8),.6);for(let xx=x0+h*.07;xx<x1;xx+=h*.2)g.fillRect(xx,y-h*k-h*.008,Math.max(1,u*1.4),Math.max(1,u*1.4));}
    g.save();g.globalCompositeOperation='lighter';for(let i=0;i<n;i+=1){if(cnR(seed,i,7)<.82||dmg)continue;const px=x0+(i+.5)/n*w;cnGlow(g,px,y-h*(.8+.3*cnR(seed,i,2)),h*.07,'#ff7a3a',.5);}g.restore();
  }
};
CBG_FEAT.o_gate={
  st(g,C,it){
    const{E,u,ld}=C,{x,y,s,fac,seed,dmg}=it,P=cbgFacPal(fac),gw=s,gh=s*.85,em='#ff7a3a';
    cbgCast(g,C,x,y,gw*1.6,gh*2,.8);
    g.save();let jag=null;if(dmg){jag=cbgJag(x-gw*1.2,x+gw*1.2,y-gh*1.5,gh*.7,seed,9);cbgClipJag(g,jag,x-gw*1.6,x+gw*1.6,y+s);}
    /* opening: furnace-lit passage */
    g.fillStyle=cnLG(g,0,y-gh,0,y,[[0,'#0a0406'],[.55,'#4a1208'],[1,dmg?'#5a1a0a':'#c8480e']]);g.fillRect(x-gw/2,y-gh,gw,gh);
    g.fillStyle='#0a0406';for(let i=-3;i<=3;i++)g.fillRect(x+i*gw*.14-s*.012,y-gh,s*.024,gh*(dmg&&i%2?.6:1));
    cnGlow(g,x,y-gh*.35,gw*1.2,em,.45+.3*E.warmLamp);
    for(const sd of[-1,1]){
      cbgVol(g,C,x+sd*gw*.72,y,gw*.5,gh*1.55,cnMix(P.wall,'#0a0608',.3),{d:gw*.3});
      g.fillStyle=cnA(E.sh('#0a0608',.2),.8);cbgPoly(g,[x+sd*gw*.97,y,x+sd*gw*1.1,y,x+sd*gw*1.0,y-gh*.2,x+sd*gw*.5,y-gh*.2]);
      cbgCracks(g,C,x+sd*gw*.47,y-gh*1.5,x+sd*gw*.97,y,seed+sd,3,.5,em);
      if(!dmg){cbgThorn(g,C,x+sd*gw*.72,y-gh*1.55,gw*.4,gh*1.5,-sd*gw*.38,P.wall,seed+sd+4,{ember:.9});cbgThorn(g,C,x+sd*gw*.9,y-gh*1.5,gw*.2,gh*.7,sd*gw*.2,P.wall,seed+sd+6,{ember:.6});}
    }
    cbgVol(g,C,x,y-gh,gw*1.6,gh*.3,cnMix(P.wall,'#0a0608',.25),{d:gw*.34});
    if(!dmg){g.fillStyle=E.sh('#1a1216',.4);for(let i=0;i<7;i++){const bx=x-gw*.78+gw*1.56*i/6;cbgPoly(g,[bx-gw*.045,y-gh*1.3,bx+gw*.045,y-gh*1.3,bx,y-gh*1.3-gh*.22]);g.fill();}}
    g.restore();if(dmg)cbgBreak(g,C,jag,seed,true);
  },
  an(g,C,it,t){const{x,y,s,seed}=it,gw=s,gh=s*.85;cnGlow(g,x,y-gh*.35,gw*1.0,'#ffa050',.12+.3*cnFlicker(t,seed,8));}
};
CBG_FEAT.o_brazier={
  st(g,C,it){
    const{E,u,ld}=C,{x,y,s,seed}=it;cbgCast(g,C,x,y,s*.5,s*1.4,.4);
    g.strokeStyle=E.sh('#2a2226',.5);g.lineWidth=Math.max(1.5,s*.08);g.lineCap='round';g.beginPath();g.moveTo(x-s*.34,y);g.lineTo(x-s*.1,y-s*1.0);g.moveTo(x+s*.34,y);g.lineTo(x+s*.1,y-s*1.0);g.moveTo(x,y+s*.05);g.lineTo(x,y-s*1.0);g.stroke();
    g.fillStyle=cnLG(g,x-s*.4,0,x+s*.4,0,ld>0?[[0,E.sh('#6a5a60',.9)],[1,E.sh('#1a1216',.05)]]:[[0,E.sh('#1a1216',.05)],[1,E.sh('#6a5a60',.9)]]);
    g.beginPath();g.moveTo(x-s*.4,y-s*1.0);g.quadraticCurveTo(x-s*.34,y-s*.72,x,y-s*.7);g.quadraticCurveTo(x+s*.34,y-s*.72,x+s*.4,y-s*1.0);g.closePath();g.fill();
    g.fillStyle='#ffb060';g.beginPath();g.ellipse(x,y-s*1.0,s*.4,s*.1,0,0,TAU);g.fill();
    cnGlow(g,x,y-s*1.05,s*1.7,'#ff7a30',.4);cnGlow(g,x,y+s*.02,s*1.2,'#ff7a30',.25,{squash:.3});
  },
  an(g,C,it,t){const{x,y,s,seed}=it,fl=cnFlicker(t,seed,9),fl2=cnFlicker(t,seed+3,13);g.save();g.globalCompositeOperation='lighter';
    for(let j=0;j<3;j++){const k=[.3,.2,.12][j],hh=s*([.75,.55,.38][j])*(.85+.3*[fl,fl2,fl][j]);g.fillStyle=cnLG(g,0,y-s*1-hh,0,y-s*1,[[0,cnA(j?'#fff0b0':'#ff5a20',0)],[.5,cnA(j?'#ffc060':'#ff6a20',.6)],[1,cnA(j?'#fff0b0':'#ffb050',.9)]]);
      g.beginPath();g.moveTo(x-s*k*1.4,y-s*1.0);g.quadraticCurveTo(x-s*k*.5+(fl-.5)*s*.2,y-s*1.0-hh*.5,x+(fl2-.5)*s*.15,y-s*1.0-hh);g.quadraticCurveTo(x+s*k*.5,y-s*1.0-hh*.5,x+s*k*1.4,y-s*1.0);g.closePath();g.fill();}
    cnGlow(g,x,y-s*1.15,s*(1.3+.4*fl),'#ff8a3a',.2+.3*fl);
    for(let i=0;i<4;i++){const ph=cnPhase(t,1.6+cnR(seed,i,1),i,seed);g.fillStyle=cnA('#ffc070',(1-ph)*.9);g.fillRect(x+Math.sin(ph*5+i)*s*.3,y-s*1.1-ph*s*1.6,Math.max(1,C.u),Math.max(1,C.u));}
    g.restore();}
};
CBG_FEAT.o_tent={
  st(g,C,it){
    const{E,u,ld}=C,{x,y,s,fac,seed,dmg}=it,col=cnFac(fac),w=s*1.5,h=s*(dmg?.55:1.05);cbgCast(g,C,x,y,w,h,.7);
    const c='#2a2226',ex=ld>0?x+w/2:x-w/2,sh=ld*w*.2;
    g.fillStyle=E.sh(cnMix(c,'#000',.2),.05);cbgPoly(g,[x,y-h,ex,y,ex+sh,y-w*.12,x+sh,y-h-w*.1]);g.fill();
    g.fillStyle=cnLG(g,x-w/2,0,x+w/2,0,ld>0?[[0,E.sh(c,.9)],[1,E.sh(c,.2)]]:[[0,E.sh(c,.2)],[1,E.sh(c,.9)]]);
    g.beginPath();g.moveTo(x-w/2,y);g.lineTo(x-w*.05,y-h);g.lineTo(x+w*.05,y-h);g.lineTo(x+w/2,y);g.quadraticCurveTo(x,y-h*.18,x-w/2,y);g.fill();
    g.strokeStyle=cnA(E.sh(col.base,.7),.95);g.lineWidth=Math.max(1.5,u*2.2);g.beginPath();g.moveTo(x-w/2,y);g.lineTo(x-w*.05,y-h);g.moveTo(x+w/2,y);g.lineTo(x+w*.05,y-h);g.stroke();
    g.fillStyle=cnLG(g,0,y-h*.5,0,y,[[0,'#1a0806'],[1,E.warmLamp>.3?'#c8480e':'#3a1a12']]);cbgPoly(g,[x-w*.12,y,x-w*.04,y-h*.52,x+w*.04,y-h*.52,x+w*.12,y]);g.fill();
    if(E.warmLamp>.3)cnGlow(g,x,y-h*.2,w*.7,'#ff8a40',.3*E.warmLamp);
    g.strokeStyle=E.sh('#1a1216',.4);g.lineWidth=Math.max(1,u*1.6);g.beginPath();g.moveTo(x,y-h);g.lineTo(x+w*.02,y-h-s*.5);g.stroke();
    if(!dmg){g.fillStyle=E.sh(col.base,.6);cbgPoly(g,[x+w*.02,y-h-s*.5,x+w*.02+s*.32,y-h-s*.4,x+w*.02,y-h-s*.3]);g.fill();}
  }
};
CBG_FEAT.o_banner={
  st(g,C,it){const{E,u}=C,{x,y,s,dmg}=it,hgt=s*2.8;cbgCast(g,C,x,y,s*.08,hgt,.5);
    cbgTube(g,C,x,y,x,y-hgt,Math.max(2,s*.05),'#2a2226');cbgThorn(g,C,x,y-hgt,s*.1,s*.3,0,'#2a2226',it.seed,{});
    g.fillStyle=E.sh('#1a1216',.3);g.fillRect(x-s*.09,y-hgt*.62,s*.18,s*.06);g.fillRect(x-s*.09,y-hgt*.98,s*.18,s*.06);},
  an(g,C,it,t){
    const{E,u}=C,{x,y,s,fac,i,dmg}=it,col=cnFac(fac),hgt=s*2.8,top=y-hgt*.98,cw=s*.62,ch=hgt*.36*(dmg?.6:1),n=10;
    const wv=k=>Math.sin(t*2.6-k*5+i)*s*.07*(.3+k)+Math.sin(t*4.7-k*9+i*2)*s*.02*k;
    g.save();
    for(let j=0;j<n;j++){const k0=j/n,k1=(j+1)/n,sl=cbgCl((wv(k1)-wv(k0))*9/cw,-.9,.9),yb=(k,a)=>top+ch*(.9+.1*Math.sin(a*7+i))*k;
      g.fillStyle=E.sh(cnMix(col.dark,'#1a0608',.4),.55+sl*.4);const x0=x+s*.08+wv(k0),x1=x+s*.08+wv(k1);
      cbgPoly(g,[x0,top+k0*ch*.1,x1,top+k1*ch*.1,x1+wv(k1)*.2,top+ch*(.82+.2*cnR(i,j+1,3))+k1*ch*.1,x0+wv(k0)*.2,top+ch*(.82+.2*cnR(i,j,3))+k0*ch*.1]);g.fill();}
    const cx=x+s*.08+cw*.5+wv(.5),cy=top+ch*.42;g.fillStyle=cnA(E.sh(col.light,.9),.85);
    cbgPoly(g,[cx-s*.1,cy+s*.16,cx,cy-s*.16,cx+s*.1,cy+s*.16,cx,cy+s*.06]);g.fill();
    g.restore();}
};
/* ---- Aurora: pearl domes, glass, slender spires, teal light ---- */
const CBG_PEARL='#e8efec',CBG_LAV='#9aa6c0';
CBG_FEAT.a_plaza={
  st(g,C,it){
    const{E,u,ld}=C,{x,y,s,fac,seed}=it,col=cnFac(fac),rx=s,ry=s*.2;
    cbgEll(g,x,y,rx*1.04,ry*1.12);g.fillStyle=cnA(E.sh('#2a3a3a',.2),.6);g.fill();
    cbgEll(g,x,y,rx,ry);g.fillStyle=cnLG(g,0,y-ry,0,y+ry,[[0,E.sh(CBG_PEARL,.9)],[1,E.sh(cnMix(CBG_PEARL,CBG_LAV,.4),.6)]]);g.fill();
    for(const k of[.9,.62,.34]){cbgEll(g,x,y,rx*k,ry*k);g.strokeStyle=cnA(E.sh(col.base,.95),.85);g.lineWidth=Math.max(1,u*(k>.8?1.6:1.1));g.stroke();}
    g.save();g.globalCompositeOperation='lighter';g.strokeStyle=cnA(col.glow,.35);g.lineWidth=Math.max(1,u*.8);g.beginPath();for(let i=0;i<12;i++){const a=i/12*TAU;g.moveTo(x+Math.cos(a)*rx*.34,y+Math.sin(a)*ry*.34);g.lineTo(x+Math.cos(a)*rx*.9,y+Math.sin(a)*ry*.9);}g.stroke();g.restore();
  }
};
CBG_FEAT.a_dome={
  st(g,C,it){
    const{E,u,ld}=C,{x,y,s,fac,seed,dmg}=it,col=cnFac(fac),r=s,dh=r*.3;
    cbgCast(g,C,x,y,r*1.9,r*1.3,.75);
    g.save();let jag=null;if(dmg){jag=cbgJag(x-r*1.1,x+r*1.1,y-r*.9,r*.6,seed,9);cbgClipJag(g,jag,x-r*1.3,x+r*1.3,y+r);}
    /* drum with arched glass bays */
    g.fillStyle=cnLG(g,x-r,0,x+r,0,ld>0?[[0,E.sh(CBG_PEARL,1.05)],[.6,E.sh(CBG_PEARL,.5)],[1,E.sh(CBG_LAV,.1)]]:[[0,E.sh(CBG_LAV,.1)],[.4,E.sh(CBG_PEARL,.5)],[1,E.sh(CBG_PEARL,1.05)]]);
    g.fillRect(x-r*1.04,y-dh,r*2.08,dh);
    const nb=9;for(let i=0;i<nb;i++){const bx=x-r*.94+r*1.88*(i+.5)/nb,bw=r*1.88/nb*.5,lit=cnR(seed,i,3)<(.35+.65*E.warmLamp);
      g.fillStyle=lit?cnA(col.glow,.85):cnA(E.sh('#2a4a4a',.3),.9);g.beginPath();g.moveTo(bx-bw/2,y-dh*.08);g.lineTo(bx-bw/2,y-dh*.62);g.quadraticCurveTo(bx,y-dh*.98,bx+bw/2,y-dh*.62);g.lineTo(bx+bw/2,y-dh*.08);g.closePath();g.fill();
      if(lit&&!C.bat)cnGlow(g,bx,y-dh*.45,bw*1.6,col.glow,.2*E.warmLamp+.06);}
    g.fillStyle=cnA(E.sh(col.base,.9),.9);g.fillRect(x-r*1.06,y-dh*1.04,r*2.12,dh*.1);g.fillStyle=cnA('#fff',.35);g.fillRect(x-r*1.06,y-dh*1.04,r*2.12,Math.max(1,u*.8));
    g.fillStyle=cnA(E.sh(CBG_LAV,.2),.7);g.fillRect(x-r*1.06,y-dh*.1,r*2.12,dh*.1);
    /* dome */
    const cy=y-dh*1.04,lx=x-ld*r*.42,ly=cy-r*.6;
    g.fillStyle=cnRG2(g,lx,ly,r*.05,x,cy-r*.15,r*1.1,[[0,E.sh('#ffffff',1.15)],[.35,E.sh(CBG_PEARL,.8)],[.75,E.sh(cnMix(CBG_PEARL,CBG_LAV,.55),.28)],[1,E.sh(CBG_LAV,.08)]]);
    g.beginPath();g.ellipse(x,cy,r,r*.95,0,Math.PI,TAU);g.fill();
    g.save();g.beginPath();g.ellipse(x,cy,r,r*.95,0,Math.PI,TAU);g.clip();
    /* glass panels: teal-tinted lozenges */
    for(let j=0;j<4;j++)for(let i=-4;i<=4;i++){const q=(i+(j%2)*.5)/4.5,px=x+q*r*(1-j*.2),py=cy-r*(.2+j*.2);if(Math.abs(q)>1-j*.2)continue;
      g.fillStyle=cnA(cnMix(col.base,'#ffffff',.3),.1+.07*((i+j)%2));g.beginPath();g.ellipse(px,py,r*.1,r*.07,0,0,TAU);g.fill();}
    g.strokeStyle=cnA(E.sh(CBG_LAV,.2),.4);g.lineWidth=Math.max(1,u*.8);g.beginPath();for(const k of[-.7,-.4,-.15,.15,.4,.7]){g.moveTo(x+k*r,cy);g.quadraticCurveTo(x+k*r*.85,cy-r*.65,x,cy-r*.95);}g.stroke();
    for(const k of[.3,.55,.78]){g.beginPath();g.ellipse(x,cy-r*k*.2,r*Math.sqrt(1-k*k),r*.1,0,Math.PI,TAU);g.stroke();}
    g.restore();
    if(!dmg){const fy=cy-r*.95;g.strokeStyle=E.sh(CBG_PEARL,.9);g.lineWidth=Math.max(1.5,r*.03);g.beginPath();g.moveTo(x,fy);g.lineTo(x,fy-r*.42);g.stroke();
      g.fillStyle=cnRG(g,x,fy-r*.46,0,r*.07,[[0,'#ffffff'],[1,col.glow]]);g.beginPath();g.arc(x,fy-r*.46,r*.06,0,TAU);g.fill();cnGlow(g,x,fy-r*.46,r*.3,col.glow,.6);}
    /* the glowing seam where dome meets drum */
    g.save();g.globalCompositeOperation='lighter';g.strokeStyle=cnA(col.glow,.45);g.lineWidth=Math.max(1.5,u*2);g.beginPath();g.moveTo(x-r,cy);g.lineTo(x+r,cy);g.stroke();g.restore();
    g.restore();if(dmg){cbgBreak(g,C,jag,seed,false);cbgSoot(g,C,x,y-r*.6,r*.5,r*.3,.35);}
  },
  an(g,C,it,t){if(it.dmg)return;const{x,y,s,fac}=it,col=cnFac(fac),r=s,dh=r*.3,cy=y-dh*1.04;cnGlow(g,x,cy-r*.95-r*.46,r*(.3+.05*Math.sin(t*2.2+it.i)),col.glow,.35+.25*Math.sin(t*2.2+it.i));}
};
CBG_FEAT.a_spire={
  st(g,C,it){
    const{E,u,ld}=C,{x,y,s,fac,seed,dmg}=it,col=cnFac(fac),h=s*(it.hh||5),bw=s*.34;
    cbgCast(g,C,x,y,s*.4,h,.7);
    g.save();let jag=null;if(dmg){jag=cbgJag(x-bw,x+bw,y-h*.55,h*.1,seed,6);cbgClipJag(g,jag,x-bw*2,x+bw*2,y+s);}
    const wk=k=>bw/2*(1-Math.pow(k,.7))+s*.012,sx=k=>x+Math.sin(k*3.1+seed)*s*.12*k;
    const L=[],R=[];for(let i=0;i<=16;i++){const k=i/16;L.push([sx(k)-wk(k),y-h*k]);R.push([sx(k)+wk(k),y-h*k]);}
    g.beginPath();L.forEach((q,i)=>i?g.lineTo(q[0],q[1]):g.moveTo(q[0],q[1]));for(let i=16;i>=0;i--)g.lineTo(R[i][0],R[i][1]);g.closePath();
    g.fillStyle=cnLG(g,x-bw/2,0,x+bw/2,0,ld>0?[[0,E.sh('#ffffff',1.1)],[.5,E.sh(CBG_PEARL,.55)],[1,E.sh(CBG_LAV,.1)]]:[[0,E.sh(CBG_LAV,.1)],[.5,E.sh(CBG_PEARL,.55)],[1,E.sh('#ffffff',1.1)]]);g.fill();
    g.save();g.globalCompositeOperation='lighter';
    for(let i=1;i<=5;i++){const k=i/6.2,w=wk(k)*1.15;g.strokeStyle=cnA(col.glow,.8-.1*i);g.lineWidth=Math.max(1.5,u*2);g.beginPath();g.ellipse(sx(k),y-h*k,w,w*.28,0,0,Math.PI);g.stroke();g.strokeStyle=cnA(col.glow,.2);g.lineWidth=Math.max(3,u*5);g.stroke();}
    g.restore();
    /* flying buttress arcs at the foot */
    g.strokeStyle=E.sh(CBG_PEARL,.8);g.lineWidth=Math.max(1.5,s*.04);g.lineCap='round';for(const sd of[-1,1]){g.beginPath();g.moveTo(x+sd*s*.5,y);g.quadraticCurveTo(x+sd*s*.38,y-h*.2,x+sd*bw*.4,y-h*.3);g.stroke();}
    g.restore();
    if(!dmg){const tx=sx(1),ty=y-h;g.fillStyle=cnRG(g,tx,ty-s*.12,0,s*.14,[[0,'#ffffff'],[.5,col.glow],[1,cnA(col.base,.5)]]);g.beginPath();g.arc(tx,ty-s*.1,s*.1,0,TAU);g.fill();cnGlow(g,tx,ty-s*.1,s*.6,col.glow,.55);}
    else cbgBreak(g,C,jag,seed,false);
  },
  an(g,C,it,t){if(it.dmg)return;const{x,y,s,fac,seed}=it,col=cnFac(fac),h=s*(it.hh||5),tx=x+Math.sin(3.1+seed)*s*.12;const p=.5+.5*Math.sin(t*1.8+it.i*1.7);cnGlow(g,tx,y-h-s*.1,s*(.5+.4*p),col.glow,.25+.4*p,{core:.6});
    for(let k=0;k<3;k++){const ph=cnPhase(t,3,k,seed),q=ph;cnGlow(g,x,y-h*q,s*.18,col.glow,(1-q)*.35*Math.sin(q*Math.PI)*2);}}
};
CBG_FEAT.a_arch={
  st(g,C,it){
    const{E,u}=C,{x0,x1,y,h,fac,seed,dmg}=it,col=cnFac(fac),w=x1-x0;
    const P=k=>[x0+w*k,y-Math.sin(k*Math.PI)*h];
    g.lineCap='round';g.strokeStyle=E.sh(CBG_PEARL,.8);g.lineWidth=Math.max(2,h*.1);g.beginPath();for(let i=0;i<=24;i++){const q=P(i/24);i?g.lineTo(q[0],q[1]):g.moveTo(q[0],q[1]);}g.stroke();
    g.strokeStyle=cnA('#fff',.5);g.lineWidth=Math.max(1,u);g.beginPath();for(let i=0;i<=24;i++){const q=P(i/24);i?g.lineTo(q[0],q[1]-h*.05):g.moveTo(q[0],q[1]-h*.05);}g.stroke();
    g.save();g.globalCompositeOperation='lighter';g.strokeStyle=cnA(col.glow,.5);g.lineWidth=Math.max(1,u*1.4);g.beginPath();for(let i=0;i<=24;i++){const q=P(i/24);i?g.lineTo(q[0],q[1]+h*.05):g.moveTo(q[0],q[1]+h*.05);}g.stroke();
    for(let i=1;i<10;i++){const q=P(i/10);cnGlow(g,q[0],q[1]+h*.07,h*.16,col.glow,.4);}g.restore();
  }
};

const CBG_FACS=['meridian','obsidian','aurora'];
/* ---- states: fires, rubble, crowds, string lights ---- */
CBG_FEAT.c_rubble={st(g,C,it){const P=cbgFacPal(it.fac);cbgRubble(g,C,it.x,it.y,it.s,it.seed,cnMix(P.wall,'#000',.15),{n:it.n||14,beams:it.beams});}};
CBG_FEAT.c_fire={
  st(g,C,it){
    const{E,u}=C,{x,y,s,seed,fac}=it,P=cbgFacPal(fac);
    cbgRubble(g,C,x,y,s,seed,cnMix(P.wall,'#000',.3),{n:7,beams:2});
    cnGlow(g,x,y-s*.3,s*2.2,'#ff6a20',.35+.2*E.warmLamp);cnGlow(g,x,y,s*1.6,'#ff6a20',.3,{squash:.28});
    g.save();g.globalCompositeOperation='lighter';g.fillStyle=cnA('#ff9a40',.65);cbgEll(g,x,y-s*.12,s*.4,s*.12);g.fill();g.restore();
  },
  an(g,C,it,t){
    const{E}=C,{x,y,s,seed}=it,fl=cnFlicker(t,seed,9),sp=C.S.rm?.4:1;g.save();g.globalCompositeOperation='lighter';
    for(let j=0;j<4;j++){const px=x+(j-1.5)*s*.28,hh=s*(.5+.5*cnR(seed,j,1))*(.8+.35*cnFlicker(t,seed+j,10*sp)),w=s*.2;
      g.fillStyle=cnLG(g,0,y-s*.15-hh,0,y-s*.15,[[0,cnA('#ff5a20',0)],[.45,cnA('#ff7a24',.6)],[1,cnA('#ffd070',.85)]]);
      g.beginPath();g.moveTo(px-w,y-s*.15);g.quadraticCurveTo(px-w*.5+(fl-.5)*w,y-s*.15-hh*.5,px+(cnFlicker(t,seed+j,7*sp)-.5)*w,y-s*.15-hh);g.quadraticCurveTo(px+w*.5,y-s*.15-hh*.5,px+w,y-s*.15);g.closePath();g.fill();}
    cnGlow(g,x,y-s*.3,s*(1.6+.4*fl),'#ff8a3a',.15+.22*fl);
    for(let i=0;i<4;i++){const ph=cnPhase(t*sp,1.6+cnR(seed,i,1),i,seed);g.fillStyle=cnA('#ffc070',(1-ph)*.9);g.fillRect(x+Math.sin(ph*5+i)*s*.5,y-s*.3-ph*s*2,Math.max(1,C.u),Math.max(1,C.u));}
    g.restore();
    cbgPlume(g,t*sp,x,y-s*.5,{n:9,per:6,h:s*5,r0:s*.18,r1:s*1.1,wind:.55,sway:s*.3,col:E.night?'#2a2830':'#22201f',a:.5},seed);
  }
};
CBG_FEAT.c_crowd={st(g,C,it){const{E}=C,c=cnFac(it.fac);cbgCrowd(g,C,it.x0,it.x1,it.y,it.s,it.seed,[c.base,c.light,'#e8c070','#c8d0e0',c.dark],{cheer:it.cheer==null?.5:it.cheer});}};
CBG_FEAT.c_lights={
  st(g,C,it){const c=cnFac(it.fac);cbgStringLights(g,C,it.x0,it.y0,it.x1,it.y1,it.sag,it.n,it.flags?[c.base,c.light,'#e8c070','#ffffff']:['#ffb050','#ff7a50','#ffd070',c.glow],it.seed,{r:it.r||5,flags:it.flags});}
};
/* ---- layouts: pure functions of (faction, state, size, seed) so the static bake and the animation agree ---- */
function cbgBaseLayout(C){
  const{W,H,F,seed,hz,fac}=C,st=C.state,R=st==='ruined'?1:0,items=[];
  const add=(f,x,y,s,k,ex)=>items.push(Object.assign({f,x:W*x,y:H*y,s:H*s,k:k||0,i:items.length,seed:cnH32(seed,items.length,3,3),fac,dmg:R,st},ex||{}));
  const addR=(f,x0,x1,y,h,k,ex)=>items.push(Object.assign({f,x0:x0,x1:x1,y:H*y,h:H*h,x:0,s:H*h,k:k||0,i:items.length,seed:cnH32(seed,items.length,3,3),fac,dmg:R,st},ex||{}));
  const flagsOn=!R;
  if(fac==='meridian'){
    add('m_dome',.07,hz+.05,.07,.38);add('m_dome',.93,hz+.055,.06,.4);add('m_dome',.3,hz+.04,.04,.46);add('m_dome',.69,hz+.04,.04,.46);
    add('tower',.19,hz+.05,.11,.4);add('tower',.82,hz+.052,.09,.4);
    add('m_keep',.5,.668,.2,.1);
    const yW=.745,hw=.12,gx=.5,gwid=.082;
    addR('m_wall',F.x,W*(gx-gwid*.75),yW,hw,0);addR('m_wall',W*(gx+gwid*.75),F.x+F.w,yW,hw,0);
    add('m_gate',gx,yW,.2,0);
    const TW=[[.115,.19,2.1,.62],[.885,.19,2.1,.74],[.318,.135,1.7,.8],[.682,.135,1.7,.5]];
    TW.forEach((q,j)=>{add('m_tower',q[0],yW+.012,q[1],0,{hh:q[2],cut:q[3]});
      if(flagsOn&&j<2)add('banner',q[0]+(j?-.02:.02),yW+.012-q[1]*q[2]-q[1]*.3,.05,0,{sy:H*(yW+.02)});});
    if(st==='ruined'){add('c_rubble',.115,yW+.05,.12,0,{n:12});add('c_rubble',.62,yW+.05,.1,0,{n:10,beams:2});add('c_rubble',.37,yW+.04,.08,0,{n:8});}
  }else if(fac==='obsidian'){
    add('o_spire',.06,hz+.045,.1,.42);add('o_spire',.23,hz+.03,.07,.46);add('o_spire',.77,hz+.03,.07,.46);add('o_spire',.94,hz+.05,.12,.4);
    add('o_citadel',.5,.672,.205,.1);
    const yP=.745;addR('o_palisade',F.x,W*.435,yP,.1,0);addR('o_palisade',W*.565,F.x+F.w,yP,.1,0);add('o_gate',.5,yP,.17,0);
    add('o_tent',.17,.7,.085,.06);add('o_tent',.83,.7,.09,.06);add('o_tent',.31,.705,.06,.1);add('o_tent',.69,.705,.06,.1);
    [[.08,.752,.075],[.92,.756,.08],[.335,.745,.06],[.665,.745,.06]].forEach((q,j)=>{if(!R||j%2)add('o_banner',q[0],q[1],q[2],0);});
    [[.2,.775,.07],[.8,.78,.07],[.37,.768,.06],[.63,.768,.06],[.12,.79,.075],[.88,.795,.075]].forEach(q=>{if(!R||q[0]<.3)add('o_brazier',q[0],q[1],q[2],0);});
    if(R){add('c_rubble',.3,.76,.1,0,{n:12});add('c_rubble',.72,.77,.12,0,{n:12,beams:2});}
  }else{
    add('a_spire',.13,hz+.05,.06,.45,{hh:5.8});add('a_spire',.29,hz+.04,.05,.5,{hh:4.6});add('a_spire',.71,hz+.04,.05,.5,{hh:4.6});add('a_spire',.87,hz+.05,.06,.45,{hh:5.4});
    add('a_plaza',.5,.775,.62,0);
    add('a_dome',.3,.69,.12,.12);add('a_dome',.7,.69,.12,.12);
    add('a_dome',.5,.72,.235,0);
    add('a_spire',.105,.752,.092,0,{hh:5.2});add('a_spire',.895,.757,.092,0,{hh:4.8});
    addR('a_arch',W*.125,W*.3,.69,.05,.1);addR('a_arch',W*.7,W*.875,.69,.05,.1);
    if(R){add('c_rubble',.5,.77,.14,0,{n:14});add('c_rubble',.27,.74,.07,0,{n:8});}
  }
  /* state props common to all */
  if(st==='siege'){
    const f=[[.22,.775,.07],[.4,.8,.06],[.62,.79,.08],[.8,.78,.07]];f.forEach(q=>add('c_fire',q[0],q[1],q[2],0));
  }else if(st==='ruined'){
    add('c_fire',.25,.80,.045,0);add('c_fire',.77,.81,.05,0);
  }else if(st==='celebration'){
    const y0=fac==='aurora'?.5:.5;
    add('c_crowd',.3,.82,.05,0,{x0:W*.18,x1:W*.82,y:H*.865,cheer:.55});
    const tops=fac==='meridian'?[[.115,.38],[.318,.52],[.682,.52],[.885,.38]]:fac==='obsidian'?[[.06,.4],[.23,.45],[.77,.45],[.94,.4]]:[[.105,.3],[.29,.34],[.71,.34],[.895,.3]];
    for(let i=0;i<3;i++)add('c_lights',0,0,0,0,{x0:W*tops[i][0],y0:H*tops[i][1],x1:W*tops[i+1][0],y1:H*tops[i+1][1],sag:H*(.05+.02*(i%2)),n:i===1?14:9,fac,sy:H*.9});
    add('c_lights',0,0,0,0,{x0:W*tops[0][0]-W*.12,y0:H*(tops[0][1]+.14),x1:W*tops[0][0],y1:H*tops[0][1],sag:H*.03,n:7,flags:true,sy:H*.9});
    add('c_lights',0,0,0,0,{x0:W*tops[3][0],y0:H*tops[3][1],x1:W*tops[3][0]+W*.12,y1:H*(tops[3][1]+.14),sag:H*.03,n:7,flags:true,sy:H*.9});
    add('c_lights',0,0,0,0,{x0:W*.2,y0:H*.62,x1:W*.8,y1:H*.62,sag:H*.07,n:22,flags:true,r:4.5,sy:H*.9});
  }
  return items.sort((a,b)=>(a.sy==null?a.y:a.sy)-(b.sy==null?b.y:b.sy));
}
function cbgRoad(g,C,xc,yTop,wTop,wBot){
  const{F,E}=C,y1=F.y+F.h,M=E.mat;
  g.fillStyle=cnLG(g,0,yTop,0,y1,[[0,cnA(E.sh(cnMix(M.ground[0],'#ffffff',.18),.95),.75)],[1,cnA(E.sh(cnMix(M.ground[1],'#ffffff',.16),.5),.55)]]);
  g.beginPath();g.moveTo(xc-wTop/2,yTop);g.lineTo(xc+wTop/2,yTop);g.lineTo(xc+wBot/2,y1);g.lineTo(xc-wBot/2,y1);g.closePath();g.fill();
  g.strokeStyle=cnA(E.sh(M.ground[1],.2),.35);g.lineWidth=Math.max(1,C.u*1.2);g.beginPath();g.moveTo(xc-wTop*.5,yTop);g.lineTo(xc-wBot*.5,y1);g.moveTo(xc+wTop*.5,yTop);g.lineTo(xc+wBot*.5,y1);g.stroke();
}
/* siege sky: smoke banks lying on the horizon, a brown-red cast, and dark attacking dropships with hot engines */
function cbgSmokeBanks(g,C,a){
  const{F,E,H,W,hzY,seed,u}=C;
  g.fillStyle=cnLG(g,0,hzY-H*.55,0,hzY+H*.02,[[0,cnA('#3a1a14',0)],[.7,cnA('#4a2218',a*.5)],[1,cnA('#6a2c18',a*.8)]]);g.fillRect(F.x,hzY-H*.55,F.w,H*.58);
  const n=Math.round(22*F.w/W);
  for(let i=0;i<n;i++){const x=F.x+cnR(seed,i,61)*F.w,y=hzY-H*(.02+.32*Math.pow(cnR(seed,i,62),1.6)),r=H*(.07+.16*cnR(seed,i,63));
    cbgPuff(g,x,y,r*1.5,E.sh('#2a2022',.35),a*.5*(1-(hzY-y)/(H*.4)*.5));cbgPuff(g,x-E.ld*r*.2,y-r*.15,r*.9,E.sh('#6a5654',.9),a*.22);}
}
function cbgSiegeShips(g,C,col){
  const{E,H,W,hzY,seed,u}=C;
  for(let i=0;i<4;i++){
    const x=W*(.1+.8*cnR(seed,i,71)),y=H*(.1+.22*cnR(seed,i,72)),L=H*(.07+.08*cnR(seed,i,73)),rot=(cnR(seed,i,74)-.5)*.3+(x>W*.5?.18:-.18),flip=x>W*.5?-1:1;
    g.save();g.translate(x,y);g.rotate(rot);g.scale(flip,1);
    cnGlow(g,-L*.55,0,L*.55,col,.55);cnGlow(g,-L*.75,0,L*.3,'#ffd8a0',.5);
    g.fillStyle=E.fog('#1a1a22',.38);cbgShipPath(g,L);g.fill();
    g.fillStyle=cnA(E.glow,.25);cbgShipPath(g,L);g.save();g.clip();g.fillRect(-L*.55,-L*.3,L*1.1,L*.12);g.restore();
    g.restore();
    g.save();g.globalCompositeOperation='lighter';g.fillStyle=cnLG(g,x-flip*L*.5,y,x-flip*L*3,y+L*.5,[[0,cnA(col,.18)],[1,cnA(col,0)]]);g.beginPath();g.moveTo(x-flip*L*.5,y-L*.06);g.lineTo(x-flip*L*3,y+L*.5);g.lineTo(x-flip*L*.5,y+L*.06);g.fill();g.restore();
  }
}
/* closed-form tracer fire: bolts from a spawn box to a target box. Returns nothing; call from fn.anim */
function cbgTracers(g,C,t,o){
  const{W,H,u,seed,S}=C,n=cnN(o.n,S),sp=S.rm?.5:1;g.save();g.globalCompositeOperation='lighter';g.lineCap='round';
  for(let i=0;i<n;i++){
    const per=o.per*(.7+.6*cnR(seed,i,50)),tt=t*sp/per+cnR(seed,i,51),cyc=Math.floor(tt),ph=tt-cyc,life=o.life||.16;
    const sd=cnH32(seed,i,cyc,9),a=o.from,b=o.to;
    const sx=a[0]+(a[2]-a[0])*cnHash(sd,1,0),sy=a[1]+(a[3]-a[1])*cnHash(sd,2,0),ex=b[0]+(b[2]-b[0])*cnHash(sd,3,0),ey=b[1]+(b[3]-b[1])*cnHash(sd,4,0);
    if(ph<life){
      const k=ph/life,hx=sx+(ex-sx)*k,hy=sy+(ey-sy)*k,k2=Math.max(0,k-.22),tx=sx+(ex-sx)*k2,ty=sy+(ey-sy)*k2;
      g.strokeStyle=cnLG(g,tx,ty,hx,hy,[[0,cnA(o.col,0)],[1,cnA(o.col,.9)]]);g.lineWidth=Math.max(1,u*(o.w||1.8));g.beginPath();g.moveTo(tx,ty);g.lineTo(hx,hy);g.stroke();
      g.strokeStyle=cnA('#ffffff',.55);g.lineWidth=Math.max(1,u*.7);g.beginPath();g.moveTo(hx-(hx-tx)*.25,hy-(hy-ty)*.25);g.lineTo(hx,hy);g.stroke();
    }else if(ph<life+.06&&!S.rm){const k=(ph-life)/.06;cnGlow(g,ex,ey,H*.05*(1+k),o.hit||'#ffb070',(1-k)*.7,{core:.7});}
  }
  g.restore();
}
function cbgFireworks(g,C,t,o){
  const{W,H,u,seed,S}=C,n=o.n||4,rm=S.rm;g.save();g.globalCompositeOperation='lighter';
  for(let i=0;i<n;i++){
    const per=3.4+cnR(seed,i,91)*1.8,tt=t/per+cnR(seed,i,92),cyc=Math.floor(tt),ph=tt-cyc,life=.42;if(ph>life)continue;
    const k=ph/life,sd=cnH32(seed,i,cyc,11),cx=W*(.12+.76*cnHash(sd,1,0)),cy=H*(.1+.22*cnHash(sd,2,0)),R=H*(.1+.09*cnHash(sd,3,0)),col=o.cols[(cnHash(sd,4,0)*o.cols.length)|0];
    const e=1-Math.pow(1-k,2.4),a=Math.pow(1-k,1.25),m=cnN(30,S);
    if(k<.16&&!rm)cnGlow(g,cx,cy,R*1.3,col,.5*(1-k/.16),{core:.8});
    cnGlow(g,cx,cy,R*(.6+e*.5),col,.12*a);
    for(let j=0;j<m;j++){const ang=j/m*TAU+cnHash(sd,j,5)*.3,d=R*e*(.82+.18*cnHash(sd,j,6)),px=cx+Math.cos(ang)*d,py=cy+Math.sin(ang)*d+k*k*H*.09;
      const tx=cx+Math.cos(ang)*d*.9,ty=cy+Math.sin(ang)*d*.9+k*k*H*.07;
      g.strokeStyle=cnA(col,a*.9);g.lineWidth=Math.max(1,u*1.3);g.beginPath();g.moveTo(tx,ty);g.lineTo(px,py);g.stroke();
      if(j%3===0)cnGlow(g,px,py,u*5,col,a*.5);}
    for(let j=0;j<m>>1;j++){const ang=j/(m>>1)*TAU+.2,d=R*e*.5;g.fillStyle=cnA('#ffffff',a*.6);g.fillRect(cx+Math.cos(ang)*d,cy+Math.sin(ang)*d+k*k*H*.05,Math.max(1,u),Math.max(1,u));}
  }
  g.restore();
}
function cbgConfetti(g,C,t,o){
  const{W,H,u,seed,S,F}=C,n=cnN(o.n,S),sp=S.rm?.35:1;g.save();
  for(let i=0;i<n;i++){
    const per=7+cnR(seed,i,81)*5,ph=cnPhase(t*sp,per,i,seed),x=F.x+((cnR(seed,i,82)+Math.sin(ph*6+i)*.02)%1)*F.w,y=-H*.05+ph*H*1.1,fl=Math.cos(t*sp*5+i*2.3),c=o.cols[(cnR(seed,i,83)*o.cols.length)|0],s=(2.4+2.6*cnR(seed,i,84))*u;
    g.save();g.translate(x,y);g.rotate(t*sp*(cnR(seed,i,85)-.5)*4+i);g.scale(1,Math.abs(fl)*.9+.1);g.fillStyle=cnA(c,.9);g.fillRect(-s,-s*.5,s*2,s);g.restore();
  }
  g.restore();
}
function cbgAshFall(g,C,t,n,col,wind){
  const{W,H,u,seed,S,F}=C;n=cnN(n,S);const sp=S.rm?.35:1;g.save();
  for(let i=0;i<n;i++){const per=9+cnR(seed,i,86)*8,ph=cnPhase(t*sp,per,i,seed),x=F.x+((cnR(seed,i,87)+ph*(wind||.05)+Math.sin(ph*9+i)*.01)%1+1)%1*F.w,y=-H*.03+ph*H*1.06,s=(1+2*cnR(seed,i,88))*u;
    g.fillStyle=cnA(col,.25+.4*cnR(seed,i,89));g.save();g.translate(x,y);g.rotate(ph*6+i);g.fillRect(-s,-s*.45,s*2,s*.9);g.restore();}
  g.restore();
}
/* ---- painter ---- */
function cbgBaseCtx(g,W,H,p,seed,S){
  const fac=CBG_FACS.includes(p.faction)?p.faction:'meridian',state=['calm','siege','ruined','celebration'].includes(p.state)?p.state:'calm';
  const bio=cbgBio(p.biome&&CBG_MAT[p.biome]?p.biome:CBG_BASE_BIO[fac]),tod=cbgTod(p.time),C=cbgCtx(g,W,H,Object.assign({},p,{faction:fac}),seed,S,.57,bio,tod);
  C.state=state;C.fac=fac;return C;
}
const BASE=(g,W,H,p,t,seed,S)=>{
  const C=cbgBaseCtx(g,W,H,p,seed,S),{E,F}=C,fac=C.fac,state=C.state;
  cbgSky(g,C);
  const att=fac==='obsidian'?'#6ab4ff':'#ff6a4a';
  if(state==='siege'){cbgSmokeBanks(g,C,.8);cbgSiegeShips(g,C,att);}
  cbgFarLand(g,C,{amp:.8,near:true});
  if(E.bio==='ash')cbgLava(g,C);
  if(state==='siege'||state==='ruined')cbgSmokeBanks(g,C,state==='siege'?.6:.45);
  cbgGroundFill(g,C,{bands:6});
  cbgScatter(g,C,{n:26});
  if(fac==='meridian')cbgRoad(g,C,W*.5,H*.745,W*.075,W*.3);
  const items=cbgBaseLayout(C);
  g.fillStyle=cnLG(g,0,C.hzY,0,C.hzY+H*.12,[[0,cnA(E.haze,.3)],[1,cnA(E.haze,0)]]);g.fillRect(F.x,C.hzY,F.w,H*.12);
  cbgDrawItems(g,C,items,'st');
  if(state==='ruined'){g.fillStyle=cnA('#6a665c',.1);g.fillRect(F.x,F.y,F.w,F.h);}
};
BASE.static=true;
BASE.anim=(g,W,H,p,t,seed,S)=>{
  const C=cbgBaseCtx(g,W,H,p,seed,S),items=cbgBaseLayout(C),{E,state,fac,F}=C;
  cbgDrawItems(g,C,items,'an',t);
  if(state==='siege'){
    const att=fac==='obsidian'?'#6ab4ff':'#ff6a4a',def=fac==='obsidian'?'#ff7a3a':fac==='aurora'?'#7affd8':'#8ac8ff';
    cbgTracers(g,C,t,{n:7,per:2.6,from:[W*.05,H*.08,W*.95,H*.3],to:[W*.1,H*.5,W*.9,H*.72],col:att,hit:att});
    cbgTracers(g,C,t+.9,{n:4,per:3.2,from:[W*.2,H*.45,W*.8,H*.5],to:[W*.1,H*.12,W*.9,H*.3],col:def,hit:def,w:1.4});
  }
  if(state==='celebration'){
    const c=cnFac(fac);cbgFireworks(g,C,t,{n:E.tod==='day'?0:4,cols:[c.glow,c.light,'#ffd870','#ffffff']});
    cbgConfetti(g,C,t,{n:46,cols:[c.base,c.light,'#ffd870','#ffffff',c.glow]});
  }
  if(state==='ruined')cbgAshFall(g,C,t,28,E.night?'#8a8a98':'#4a4440',.05);
};
CINE_PAINT.bg.base=BASE;

/* ------------------------------------------------ 12. ruins ------------------------------------------------ */
/* biome growth that moves into the broken things: moss and trees, snow, drifted sand, crystal, lava seams */
function cbgBush(g,C,x,y,s,seed){
  const{E,ld}=C,base=cnMix('#4c8a3a',E.mat.ground[0],.25);
  cnShadow(g,x-ld*s*.2,y+s*.04,s*1.1,s*.2,.35);
  for(let i=0;i<6;i++){const px=x+(cnR(seed,i,1)-.5)*s*1.2,py=y-s*(.18+.4*cnR(seed,i,2)),r=s*(.32+.22*cnR(seed,i,3));
    g.fillStyle=cnRG(g,px+ld*-r*.3,py-r*.35,0,r*1.1,[[0,E.sh(cnMix(base,'#d8f08a',.4),1.05)],[.55,E.sh(base,.45)],[1,E.sh(cnMix(base,'#0a2010',.5),.1)]]);g.beginPath();g.arc(px,py,r,0,TAU);g.fill();}
}
function cbgTree(g,C,x,y,s,seed){
  const{E,ld,u}=C,h=s*3.2;cbgCast(g,C,x,y,s*.5,h,.7);
  g.fillStyle=cnLG(g,x-s*.2,0,x+s*.2,0,ld>0?[[0,E.sh('#8a6a48',.9)],[1,E.sh('#2a1e14',.1)]]:[[0,E.sh('#2a1e14',.1)],[1,E.sh('#8a6a48',.9)]]);
  cbgPoly(g,[x-s*.2,y,x+s*.2,y,x+s*.1,y-h*.55,x+s*.04,y-h*.8,x-s*.04,y-h*.8,x-s*.1,y-h*.55]);g.fill();
  g.strokeStyle=E.sh('#4a3626',.4);g.lineWidth=Math.max(1.5,s*.1);g.lineCap='round';g.beginPath();g.moveTo(x,y-h*.5);g.lineTo(x-s*.7,y-h*.82);g.moveTo(x,y-h*.58);g.lineTo(x+s*.75,y-h*.86);g.stroke();
  const base=cnMix('#4c8a3a',E.mat.ground[0],.2);
  for(let i=0;i<7;i++){const a=i/7*TAU+cnR(seed,i,1),px=x+Math.cos(a)*s*.85*(.5+cnR(seed,i,2)*.5),py=y-h*.82+Math.sin(a)*s*.6*(.5+cnR(seed,i,3)*.5),r=s*(.55+.3*cnR(seed,i,4));
    g.fillStyle=cnRG(g,px-ld*r*.45,py-r*.45,0,r*1.15,[[0,E.sh(cnMix(base,'#e0f4a0',.45),1.1)],[.55,E.sh(base,.45)],[1,E.sh(cnMix(base,'#0a2010',.5),.1)]]);g.beginPath();g.arc(px,py,r,0,TAU);g.fill();}
}
function cbgSnow(g,C,x,y,w,h,seed){
  const{E,ld}=C;g.fillStyle=cnLG(g,x-w/2,0,x+w/2,0,ld>0?[[0,E.sh('#ffffff',1.15)],[.55,E.sh('#e6f0fa',.7)],[1,E.sh('#a8bedc',.25)]]:[[0,E.sh('#a8bedc',.25)],[.45,E.sh('#e6f0fa',.7)],[1,E.sh('#ffffff',1.15)]]);
  g.beginPath();g.moveTo(x-w/2,y);g.bezierCurveTo(x-w*.4,y-h*1.15,x-w*.1,y-h*1.3,x+w*.05,y-h*1.0);g.bezierCurveTo(x+w*.2,y-h*1.25,x+w*.4,y-h*.8,x+w/2,y);g.closePath();g.fill();
}
function cbgDrift(g,C,x,y,w,h,seed){
  const{E,ld}=C,c=cnMix(E.mat.ground[0],E.mat.rock2,.25);
  g.fillStyle=cnLG(g,x-w/2,0,x+w/2,0,ld>0?[[0,E.sh(c,1.2)],[.55,E.sh(c,.65)],[1,E.sh(cnMix(c,'#000',.3),.2)]]:[[0,E.sh(cnMix(c,'#000',.3),.2)],[.45,E.sh(c,.65)],[1,E.sh(c,1.2)]]);
  g.beginPath();g.moveTo(x-w/2,y);g.bezierCurveTo(x-w*.3,y-h*.9,x-w*.1,y-h*1.1,x+w*.1,y-h*.8);g.bezierCurveTo(x+w*.25,y-h*.6,x+w*.4,y-h*.3,x+w/2,y);g.closePath();g.fill();
}
function cbgGrowth(g,C,x,y,s,seed,k){
  const E=C.E,bio=E.bio;k=k==null?1:k;
  if(bio==='green'){cbgBush(g,C,x,y,s*.5,seed);if(k>.5)cbgBush(g,C,x+s*.55,y+s*.02,s*.35,seed+4);}
  else if(bio==='ice'){cbgSnow(g,C,x,y+s*.03,s*1.5,s*.5,seed);}
  else if(bio==='dust'){cbgDrift(g,C,x,y+s*.04,s*1.6,s*.45,seed);}
  else if(bio==='crystal'){const hues=[272,188,300];for(let i=0;i<4;i++)cbgShard(g,C,x+(i-1.5)*s*.28,y+s*.02*(i%2),s*.2,s*(.4+.35*cnR(seed,i,1)),(cnR(seed,i,2)-.5)*s*.2,hues[i%3],seed);
    cnGlow(g,x,y-s*.3,s*1.1,'#b88aff',.3);}
  else{cbgCracks(g,C,x-s*.9,y-s*.1,x+s*.9,y+s*.55,seed,3,.5,'#ff6a2a');cnGlow(g,x,y,s*1.3,'#ff5a1a',.3,{squash:.3});}
}
/* ruin furniture */
function cbgFlutes(g,C,x,y,w,h,pal,seed,broken){
  const{E,u,ld}=C;cbgCast(g,C,x,y,w,h,.8);
  g.save();let top=y-h;
  g.fillStyle=cnLG(g,x-w/2,0,x+w/2,0,ld>0?[[0,E.sh(pal.hi,1.1)],[.45,E.sh(pal.mid,.55)],[1,E.sh(pal.dk,.08)]]:[[0,E.sh(pal.dk,.08)],[.55,E.sh(pal.mid,.55)],[1,E.sh(pal.hi,1.1)]]);
  if(broken){const j=[[x-w/2,y],[x-w/2,top+h*.12],[x-w*.25,top-h*.02],[x-w*.08,top+h*.1],[x+w*.12,top-h*.06],[x+w/2,top+h*.14],[x+w/2,y]];g.beginPath();j.forEach((q,i)=>i?g.lineTo(q[0],q[1]):g.moveTo(q[0],q[1]));g.closePath();g.fill();
    g.strokeStyle='rgba(10,8,12,.5)';g.lineWidth=Math.max(1.5,u*2.4);g.beginPath();j.slice(1,6).forEach((q,i)=>i?g.lineTo(q[0],q[1]):g.moveTo(q[0],q[1]));g.stroke();
    g.strokeStyle=cnA(E.litCol,.4);g.lineWidth=Math.max(1,u);g.beginPath();j.slice(1,6).forEach((q,i)=>i?g.lineTo(q[0],q[1]-u):g.moveTo(q[0],q[1]-u));g.stroke();}
  else{g.fillRect(x-w/2,top,w,h);g.fillStyle=E.sh(pal.hi,1.0);cbgEll(g,x,top,w*.62,w*.18);g.fill();g.fillStyle=cnA('#000',.2);g.fillRect(x-w*.62,top-w*.06,w*1.24,w*.12);}
  g.strokeStyle='rgba(0,0,0,.18)';g.lineWidth=Math.max(1,u*.8);g.beginPath();for(let i=-2;i<=2;i++){g.moveTo(x+i*w*.17,y);g.lineTo(x+i*w*.17,top+h*.14);}g.stroke();
  g.fillStyle=E.sh(pal.mid,.45);g.fillRect(x-w*.62,y-h*.06,w*1.24,h*.06);g.fillStyle=cnA(E.litCol,.3);g.fillRect(x-w*.62,y-h*.06,w*1.24,Math.max(1,u));
  g.restore();
}
CBG_FEAT.r_column={
  st(g,C,it){const P=cbgFacPal(it.fac),{x,y,s,seed}=it,pal=it.fac==='aurora'?{hi:CBG_PEARL,mid:'#b8c4cc',dk:CBG_LAV}:it.fac==='obsidian'?{hi:'#6a5a60',mid:'#3a2e34',dk:'#120c10'}:{hi:'#9aa8c0',mid:'#6a7890',dk:'#2a3650'};
    cbgFlutes(g,C,x,y,s*.4,s*(it.hh||2.2),pal,seed,true);
    cbgRubble(g,C,x+s*.3,y+s*.02,s*.45,seed,pal.mid,{n:6,beams:0});
    if(it.grow)cbgGrowth(g,C,x-s*.1,y,s*.7,seed,.4);}
};
CBG_FEAT.r_toppled={
  st(g,C,it){
    const{E,u,ld}=C,{x,y,s,seed,fac}=it,P=cbgFacPal(fac),L=s*3.2,w=s*.55,dir=it.dir||1;
    cbgCast(g,C,x,y,L,w*1.2,.5);
    g.save();g.translate(x,y-w*.45);g.scale(dir,1);
    const seg=7;
    for(let i=0;i<seg;i++){const x0=-L/2+L*i/seg,x1=-L/2+L*(i+1)/seg,k0=i/seg,k1=(i+1)/seg,h0=w*(1-k0*.5)/2,h1=w*(1-k1*.5)/2;
      g.fillStyle=cnLG(g,0,-h0,0,h0,[[0,E.sh(cnMix(P.wall2,'#fff',.1),1.15)],[.5,E.sh(P.wall,.55)],[1,E.sh(P.dark,.1)]]);cbgPoly(g,[x0,-h0,x1,-h1,x1,h1,x0,h0]);g.fill();
      g.fillStyle=i%2?'rgba(0,0,0,.14)':'rgba(255,255,255,.05)';cbgPoly(g,[x0,-h0,x1,-h1,x1,h1,x0,h0]);g.fill();
      g.strokeStyle='rgba(0,0,0,.35)';g.lineWidth=Math.max(1,u);g.beginPath();g.moveTo(x1,-h1);g.lineTo(x1,h1);g.stroke();}
    g.fillStyle=cnA(E.sh(P.glow,.5),.7);for(let i=0;i<5;i++){const xx=-L*.4+i*L*.15;g.fillRect(xx,-w*.12,L*.02,w*.08);}
    const bj=cbgJag(L/2-s*.02,L/2+s*.02,-w*.25,w*.5,seed,5);g.fillStyle='#0a0810';cbgPoly(g,[L/2,-w*.25,L/2+s*.1,-w*.12,L/2+s*.05,w*.3,L/2,w*.25]);g.fill();
    g.strokeStyle='rgba(20,18,22,.9)';g.lineWidth=Math.max(1.5,u*1.8);g.lineCap='round';for(let i=0;i<4;i++){g.beginPath();g.moveTo(L/2+s*.04,-w*.2+i*w*.13);g.quadraticCurveTo(L/2+s*.3,-w*.3+i*w*.14,L/2+s*(.35+.1*i),-w*.1+i*w*.1);g.stroke();}
    g.restore();
    cbgRubble(g,C,x+dir*L*.52,y,s*.5,seed,P.wall,{n:7,beams:0});
  }
};
CBG_FEAT.r_rib={
  st(g,C,it){
    const{E,u,ld}=C,{x,y,s,seed,fac}=it,col=cnFac(fac),R=s;cbgCast(g,C,x,y,R*1.6,R*.8,.6);
    const pal=fac==='aurora'?[CBG_PEARL,CBG_LAV]:fac==='obsidian'?['#4a3a40','#140e12']:['#8494b0','#2a3650'];
    for(let i=0;i<6;i++){
      const a=cnR(seed,i,1),px=x+(i-2.5)*R*.3,rx=R*(.5+.45*cnR(seed,i,2)),top=R*(.5+.7*cnR(seed,i,3)),cut=(.35+.65*cnR(seed,i,4)),sd=i<3?-1:1;
      g.strokeStyle=E.sh(pal[1],.2);g.lineWidth=Math.max(2,R*.045);g.lineCap='round';g.beginPath();
      for(let j=0;j<=14;j++){const k=j/14*cut,ang=k*Math.PI/2,qx=px-sd*rx*(1-Math.cos(ang))*.6,qy=y-Math.sin(ang)*top;j?g.lineTo(qx,qy):g.moveTo(qx,qy);}g.stroke();
      g.strokeStyle=cnA(E.sh(pal[0],1.05),.8);g.lineWidth=Math.max(1,R*.015);g.beginPath();
      for(let j=0;j<=14;j++){const k=j/14*cut,ang=k*Math.PI/2,qx=px-sd*rx*(1-Math.cos(ang))*.6-ld*R*.015,qy=y-Math.sin(ang)*top-R*.012;j?g.lineTo(qx,qy):g.moveTo(qx,qy);}g.stroke();
    }
    cbgRubble(g,C,x,y+R*.02,R*.55,seed,pal[0],{n:8,beams:1});
  }
};
CBG_FEAT.r_mast={
  st(g,C,it){const{x,y,s}=it,dir=it.dir||1;g.save();g.translate(x,y);g.rotate(.17*dir);CBG_FEAT.tower.st(g,Object.assign({},C),{x:0,y:0,s,seed:it.seed,i:it.i,fac:it.fac},0);g.restore();cbgRubble(g,C,x+dir*s*.2,y,s*.4,it.seed,'#6a7890',{n:5,beams:1});}
};
/* the sky colour behind a point at height y (what shows through a hole in a wall) */
function cbgSkyAt(C,y){const{E,hzY}=C,t=cbgCl(y/hzY,0,1);return t<.5?cnMix(E.sky[0],E.sky[1],t*2):cnMix(E.sky[1],E.sky[2],(t-.5)*2);}
/* a shattered wall: stepped broken top, window holes that show the sky, courses, rebar, a rubble ramp at each end */
CBG_FEAT.r_wall={
  st(g,C,it){
    const{E,u,ld}=C,{x,y,s,seed,fac}=it,w=s*(it.ww||2.6),h=s*(it.hh||1.6),dark=it.dark||0,xl=x-w/2;
    const col=dark?cnMix(fac==='obsidian'?'#3a2e34':fac==='aurora'?'#9aa6b0':'#5a6a86','#000',dark):(fac==='obsidian'?'#3a2e34':fac==='aurora'?'#c4d0d0':'#5a6a86');
    cbgCast(g,C,x,y,w,h,.9);
    /* stepped profile */
    const n=7,top=[];let cur=.55+.45*cnR(seed,0,1);
    for(let i=0;i<=n;i++){const k=i/n;if(i%2===0)cur=.18+.82*Math.pow(cnR(seed,i,2),.8);const hv=h*(i===0||i===n?cur*.7+.15:cur);top.push([xl+w*k,y-hv]);if(i<n&&cnR(seed,i,3)<.5)top.push([xl+w*(k+.5/n),y-hv*(.75+.25*cnR(seed,i,4))]);}
    g.beginPath();g.moveTo(xl,y);for(const q of top)g.lineTo(q[0],q[1]);g.lineTo(xl+w,y);g.closePath();
    g.fillStyle=cnLG(g,xl,0,xl+w,0,ld>0?[[0,E.sh(cnMix(col,'#fff',.1),1.0)],[.55,E.sh(col,.5)],[1,E.sh(col,.1)]]:[[0,E.sh(col,.1)],[.45,E.sh(col,.5)],[1,E.sh(cnMix(col,'#fff',.1),1.0)]]);g.fill();
    g.save();g.clip();
    g.fillStyle=cnLG(g,0,y-h,0,y,[[0,'rgba(0,0,0,0)'],[1,'rgba(0,0,0,.4)']]);g.fillRect(xl,y-h,w,h);
    /* courses */
    g.strokeStyle='rgba(0,0,0,.2)';g.lineWidth=Math.max(1,u*.8);g.beginPath();for(let k=1;k<12;k++){const yy=y-h*k/12;g.moveTo(xl,yy);g.lineTo(xl+w,yy);}for(let k=0;k<30;k++){const yy=y-h*(cnR(seed,k,5)),xx=xl+w*cnR(seed,k,6);g.moveTo(xx,yy);g.lineTo(xx,yy-h/12);}g.stroke();
    /* holes: arched / square windows, see-through */
    const nh=Math.max(1,Math.round(w/(h*.9)));
    for(let i=0;i<nh;i++){
      const hx=xl+w*(i+.5)/nh+(cnR(seed,i,7)-.5)*w*.06,hw=h*(.2+.1*cnR(seed,i,8)),hh=h*(.3+.18*cnR(seed,i,9)),hy=y-h*(.2+.22*cnR(seed,i,10))-hh;
      g.fillStyle=cnLG(g,0,hy,0,hy+hh,[[0,cnMix(cbgSkyAt(C,hy),'#fff',.1)],[1,cnMix(cbgSkyAt(C,hy+hh),E.haze,.3)]]);
      g.beginPath();g.moveTo(hx-hw/2,hy+hh);g.lineTo(hx-hw/2,hy+hw/2);g.arc(hx,hy+hw/2,hw/2,Math.PI,TAU);g.lineTo(hx+hw/2,hy+hh);g.closePath();g.fill();
      g.fillStyle='rgba(0,0,0,.45)';g.beginPath();g.moveTo(hx+(ld>0?hw/2:-hw/2),hy+hh);g.lineTo(hx+(ld>0?hw/2:-hw/2),hy+hw/2);g.lineTo(hx+(ld>0?hw/2:-hw/2)-(ld>0?1:-1)*hw*.22,hy+hw*.55);g.lineTo(hx+(ld>0?hw/2:-hw/2)-(ld>0?1:-1)*hw*.22,hy+hh);g.closePath();g.fill();
      g.fillStyle='rgba(0,0,0,.3)';g.fillRect(hx-hw/2,hy+hh-hh*.08,hw,hh*.08);
    }
    g.restore();
    g.strokeStyle='rgba(10,8,12,.55)';g.lineWidth=Math.max(2,u*3);g.lineJoin='miter';g.beginPath();top.forEach((q,i)=>i?g.lineTo(q[0],q[1]):g.moveTo(q[0],q[1]));g.stroke();
    g.strokeStyle=cnA(E.litCol,.5);g.lineWidth=Math.max(1,u);g.beginPath();top.forEach((q,i)=>i?g.lineTo(q[0],q[1]-u*1.2):g.moveTo(q[0],q[1]-u*1.2));g.stroke();
    /* rebar and a hanging slab */
    g.strokeStyle='rgba(18,16,20,.9)';g.lineWidth=Math.max(1,u*1.5);g.lineCap='round';
    for(let i=1;i<top.length-1;i++)if(cnR(seed,i,11)<.45){const q=top[i],L=h*(.08+.14*cnR(seed,i,12));g.beginPath();g.moveTo(q[0],q[1]);g.quadraticCurveTo(q[0]+(cnR(seed,i,13)-.5)*L,q[1]-L*.6,q[0]+(cnR(seed,i,14)-.5)*L*1.4,q[1]-L);g.stroke();}
    cbgSoot(g,C,xl+w*.3,y-h*.55,w*.25,h*.3,.35+.1*dark);
    /* rubble ramps */
    cbgRubble(g,C,xl+w*.02,y+h*.01,h*.5,seed,col,{n:9,beams:1});cbgRubble(g,C,xl+w*.98,y+h*.01,h*.42,seed+3,col,{n:8,beams:0});
    if(it.grow)cbgGrowth(g,C,x,y,h*.7,seed,.6);
  }
};
function cbgRuinsLayout(C){
  const{W,H,F,seed,hz,fac}=C,items=[],bio=C.E.bio;
  const add=(f,x,y,s,k,ex)=>items.push(Object.assign({f,x:W*x,y:H*y,s:H*s,k:k||0,i:items.length,seed:cnH32(seed,items.length,3,3),fac,dmg:1,st:'ruined'},ex||{}));
  const addR=(f,x0,x1,y,h,k,ex)=>items.push(Object.assign({f,x0:x0,x1:x1,y:H*y,h:H*h,x:0,s:H*h,k:k||0,i:items.length,seed:cnH32(seed,items.length,3,3),fac,dmg:1,st:'ruined'},ex||{}));
  const sd=cnR(seed,7,7)<.5?-1:1;       // which side the big remnant leans to
  if(fac==='meridian'){
    add('m_dome',.08,hz+.05,.07,.38);add('tower',.92,hz+.05,.1,.4);add('m_dome',.35,hz+.04,.04,.46);
    add('m_keep',.5+sd*.03,.675,.19,.1);
    addR('m_wall',F.x,W*.32,.76,.115,0);addR('m_wall',W*.7,F.x+F.w,.755,.1,0);
    add('m_tower',.13,.77,.17,0,{hh:2.1,cut:.5});add('m_tower',.9,.765,.16,0,{hh:2.0,cut:.78});
  }else if(fac==='obsidian'){
    add('o_spire',.07,hz+.045,.1,.42);add('o_spire',.93,hz+.05,.1,.4);add('o_spire',.34,hz+.03,.06,.46);
    add('o_citadel',.5+sd*.03,.675,.2,.1);
    addR('o_palisade',F.x,W*.34,.755,.09,0);addR('o_palisade',W*.68,F.x+F.w,.76,.09,0);
    add('o_tent',.18,.72,.08,.05);add('o_banner',.9,.77,.07,0,{});
  }else{
    add('a_spire',.12,hz+.05,.06,.42,{hh:5.2});add('a_spire',.9,hz+.045,.06,.42,{hh:5});add('a_spire',.36,hz+.04,.045,.46,{hh:4.2});
    add('a_dome',.5+sd*.03,.72,.22,0);add('a_dome',.2,.7,.11,.1);add('a_dome',.83,.7,.1,.1);
    add('a_spire',.1,.77,.085,0,{hh:4.6});add('a_spire',.92,.775,.085,0,{hh:3.8});
  }
  /* shared remnants: stumps, a rib cage, a toppled shaft, a leaning mast, shattered walls (big dark ones frame the corners), rubble, growth */
  add('r_column',.39,.745,.13,0,{hh:1.5,grow:1});add('r_column',.62,.752,.13,0,{hh:1.9});add('r_column',.665,.765,.11,0,{hh:.9,grow:1});
  add('r_wall',.24,.775,.1,.05,{ww:2.8,hh:1.7,fac,grow:1});add('r_wall',.77,.78,.09,.05,{ww:2.4,hh:1.4,fac});
  add('r_toppled',.3+sd*.04,.83,.1,0,{dir:sd,fac});
  add('r_rib',.82,.8,.15,0);
  add('r_mast',.05,.8,.12,0,{dir:-1});
  add('c_rubble',.52,.8,.1,0,{n:12,beams:2});add('c_rubble',.9,.88,.07,0,{n:9});
  add('r_wall',-.01,.99,.24,0,{ww:2.0,hh:2.6,fac,dark:.55,sy:H*1.5});add('r_wall',1.01,1.0,.27,0,{ww:1.8,hh:2.3,fac,dark:.6,sy:H*1.5});
  if(cnR(seed,9,9)<.55&&bio!=='crystal')add('wreck',.14,.835,.09,0,{dmg:0});
  return items.sort((a,b)=>(a.sy==null?a.y:a.sy)-(b.sy==null?b.y:b.sy));
}
const RUINS=(g,W,H,p,t,seed,S)=>{
  const bio=cbgBio(p.biome),tod=cbgTod(p.time),fac=CBG_FACS.includes(p.faction)?p.faction:CBG_FACS.includes(S.faction)?S.faction:CBG_FACS[cnH32(seed,3,3,3)%3];
  const C=cbgCtx(g,W,H,Object.assign({},p,{faction:fac}),seed,S,.57,bio,tod),{E,F}=C;C.fac=fac;C.state='ruined';
  cbgSky(g,C);cbgSmokeBanks(g,C,.38);
  cbgFarLand(g,C,{amp:.85,near:true});if(bio==='ash')cbgLava(g,C);
  cbgGroundFill(g,C,{bands:7,dune:bio==='dust'});cbgScatter(g,C,{n:36});
  const items=cbgRuinsLayout(C);
  g.fillStyle=cnLG(g,0,C.hzY,0,C.hzY+H*.12,[[0,cnA(E.haze,.3)],[1,cnA(E.haze,0)]]);g.fillRect(F.x,C.hzY,F.w,H*.12);
  cbgDrawItems(g,C,items,'st');
  /* growth at the feet of the big remnants */
  for(const it of items)if(it.f==='m_keep'||it.f==='o_citadel'||it.f==='a_dome'&&it.s>H*.15)cbgGrowth(g,C,it.x-it.s*.9,it.y+it.s*.02,it.s*.9,it.seed,1),cbgGrowth(g,C,it.x+it.s*1.1,it.y+it.s*.04,it.s*.8,it.seed+3,.5);
  if(bio==='green')cbgTree(g,C,W*.72,H*.78,H*.05,seed+9);
};
RUINS.static=true;
RUINS.anim=(g,W,H,p,t,seed,S)=>{
  const bio=cbgBio(p.biome),tod=cbgTod(p.time),fac=CBG_FACS.includes(p.faction)?p.faction:CBG_FACS.includes(S.faction)?S.faction:CBG_FACS[cnH32(seed,3,3,3)%3];
  const C=cbgCtx(g,W,H,Object.assign({},p,{faction:fac}),seed,S,.57,bio,tod),{E,F}=C;C.fac=fac;C.state='ruined';
  const items=cbgRuinsLayout(C);cbgDrawItems(g,C,items,'an',t);
  /* thin smoke wisps from the rubble */
  const sp=S.rm?.4:1;
  for(let i=0;i<3;i++)cbgPlume(g,t*sp,W*(.2+.3*i+.1*cnR(seed,i,5)),H*(.78+.03*i),{n:6,per:9,h:H*.24,r0:H*.006,r1:H*.03,wind:.5,col:E.night?'#8a90a8':'#7a7470',a:.22},seed+i*5);
  cbgAshFall(g,C,t,bio==='ice'?44:30,bio==='ice'?'#ffffff':bio==='ash'?'#9a8a88':bio==='crystal'?'#c8a8ff':bio==='green'?'#e8f0b0':E.night?'#8a8a98':'#6a5a4a',bio==='ice'?.02:.07);
  if(bio==='ash'||tod==='night'&&fac==='obsidian'){g.save();g.globalCompositeOperation='lighter';const n=cnN(16,S);for(let i=0;i<n;i++){const ph=cnPhase(t*sp,5+cnR(seed,i,3)*4,i,seed),x=F.x+((cnR(seed,i,1)+ph*.05)%1)*F.w,y=H*(.78-ph*.5);g.fillStyle=cnA('#ff9a4a',(1-ph)*.8);g.fillRect(x,y,Math.max(1,S.u*1.2),Math.max(1,S.u*1.2));}g.restore();}
};
CINE_PAINT.bg.ruins=RUINS;

/* ------------------------------------------------ 13. battlefield ------------------------------------------------ */
const CBG_BF_MIX={
  meridian:[['rifleman',.36],['rocketeer',.16],['bulwark',.16],['juggernaut',.12],['howitzer',.1],['mender',.1]],
  obsidian:[['raptor',.32],['reaver',.24],['rifleman',.16],['juggernaut',.14],['titan',.08],['raptor',.06]],
  aurora :[['rifleman',.3],['specter',.3],['rocketeer',.14],['mender',.1],['juggernaut',.08],['specter',.08]]
};
const cbgPick=(mix,r)=>{let a=0;for(const m of mix){a+=m[1];if(r<=a)return m[0];}return mix[0][0];};
/* a game unit sprite stood up in the scene: drawn through a scratch canvas so the haze / evening tone can be laid over just the sprite. kk = px per world unit */
function cbgUnit(g,C,type,fac,x,y,kk,flip,o){
  o=o||{};const E=C.E,d=UDEF[type];if(!d||typeof artUnit!=='function')return;
  const r=(d.r||9)*kk,box=Math.max(8,Math.ceil(r*3.8)),cx=box/2,cy=box/2*.9,sq=o.sq||.78,ex=r*.22;
  const cv=cnScratch('cbgU',box,box),q=cv.getContext('2d');
  q.setTransform(1,0,0,1,0,0);q.globalCompositeOperation='source-over';q.globalAlpha=1;q.clearRect(0,0,box,box);
  const draw=dy=>{q.save();q.translate(cx,cy+dy);q.scale((flip?-1:1)*kk,kk*sq);q.lineJoin='round';q.lineCap='round';artUnit(q,type,cnFac(fac),fac);q.restore();};
  if(!o.flat){draw(ex);q.globalCompositeOperation='source-atop';q.fillStyle='rgba(6,8,16,.62)';q.fillRect(0,0,box,box);q.globalCompositeOperation='source-over';}   // the body under the roof: thickness
  draw(0);
  q.globalCompositeOperation='source-atop';
  if(o.dead){q.fillStyle='rgba(10,8,10,.72)';q.fillRect(0,0,box,box);}
  const tone=E.tod==='night'?['#0a1436',.5]:E.tod==='dusk'?['#5a1c30',.22]:E.tod==='dawn'?['#5a3048',.14]:['#000000',0];
  if(tone[1]>0){q.fillStyle=cnA(tone[0],tone[1]);q.fillRect(0,0,box,box);}
  if(o.fog>0){q.fillStyle=cnA(E.haze,o.fog);q.fillRect(0,0,box,box);}
  const sh=o.shadow==null?1:o.shadow;
  if(sh>0){const L=r*(1.1+E.T.len*.6);g.save();g.fillStyle=cnLG(g,x,y,x-C.ld*L,y+r*.05,[[0,'rgba(8,6,14,'+(E.T.dark*sh*(E.night?.7:1))+')'],[1,'rgba(8,6,14,0)']]);
    g.beginPath();g.ellipse(x-C.ld*L*.5,y+r*.12,L*.55+r*.2,r*.28,0,0,TAU);g.fill();g.restore();}
  g.save();g.imageSmoothingEnabled=true;g.imageSmoothingQuality='medium';g.drawImage(cv,x-cx,y-cy-r*.1,box,box);g.restore();
  return r;
}
/* layout: pure function of (params, size, seed) */
function cbgBfLayout(C){
  const{W,H,F,seed,hz,p}=C,I=cbgCl(p.intensity==null?.5:+p.intensity,0,1),sides=Array.isArray(p.sides)&&p.sides.length>=2?p.sides:['meridian','obsidian'];
  const fs=[CBG_FACS.includes(sides[0])?sides[0]:'meridian',CBG_FACS.includes(sides[1])?sides[1]:'obsidian'];
  const units=[],L=[{y:hz+.055,kk:H*.0021,n:Math.round(8+11*I),span:.4},{y:hz+.125,kk:H*.0034,n:Math.round(4+6*I),span:.36},{y:hz+.215,kk:H*.0054,n:Math.round(2+2*I),span:.5}];
  for(let sd=0;sd<2;sd++){
    const fac=fs[sd],dir=sd?-1:1,mix=CBG_BF_MIX[fac];
    L.forEach((l,li)=>{
      for(let i=0;i<l.n;i++){
        const q=(i+.5)/l.n,jit=(cnR(seed,sd*100+li*20+i,1)-.5)*.5/l.n;
        let xf=li===2?(sd?.97-.2*q:.03+.2*q):.5-dir*(.055+(.02*li)+l.span*(q+jit));
        const y=l.y+(cnR(seed,sd*100+li*20+i,2)-.5)*.03+(li===2?(cnR(seed,i,5)-.5)*.02:0),type=cbgPick(mix,cnR(seed,sd*100+li*20+i,3));
        units.push({x:W*xf,y:H*y,kk:l.kk*(.9+.2*cnR(seed,sd*100+li*20+i,4)),type,fac,flip:!!sd,li,sd,i:units.length,r:UDEF[type].r||9});
      }
    });
  }
  units.sort((a,b)=>a.y-b.y);
  /* craters / explosions / fires / smoke columns */
  const ex=[],ne=Math.round(2+7*I);for(let i=0;i<ne;i++)ex.push({x:W*(.2+.6*cnR(seed,i,11)),y:H*(hz+.05+.17*cnR(seed,i,12)),i,per:3+cnR(seed,i,13)*3});
  const sm=[],ns=Math.round(1+4*I);for(let i=0;i<ns;i++)sm.push({x:W*(.1+.8*cnR(seed,i,14)),y:H*(hz+.03+.08*cnR(seed,i,15)),i});
  const husks=[],nh=Math.round(1+3*I);for(let i=0;i<nh;i++)husks.push({x:W*(.18+.64*cnR(seed,i,16)),y:H*(hz+.1+.12*cnR(seed,i,17)),i,type:['juggernaut','howitzer','bulwark','titan'][(cnR(seed,i,18)*4)|0],sd:cnR(seed,i,19)<.5?0:1});
  const ban=[0,1].map(sd=>({x:W*(.5-(sd?-1:1)*.17),y:H*(hz+.105),s:H*.11,fac:fs[sd],i:sd,seed:seed+sd}));
  return{units,ex,sm,husks,fs,I,ban};
}
const BF_FIRE=(g,C,x,y,s,seed,t,sp)=>{
  const fl=cnFlicker(t,seed,9);g.save();g.globalCompositeOperation='lighter';
  for(let j=0;j<3;j++){const px=x+(j-1)*s*.32,hh=s*(.5+.5*cnR(seed,j,1))*(.8+.35*cnFlicker(t,seed+j,10*sp)),w=s*.22;
    g.fillStyle=cnLG(g,0,y-hh,0,y,[[0,cnA('#ff5a20',0)],[.45,cnA('#ff7a24',.6)],[1,cnA('#ffd070',.85)]]);
    g.beginPath();g.moveTo(px-w,y);g.quadraticCurveTo(px-w*.5+(fl-.5)*w,y-hh*.5,px+(cnFlicker(t,seed+j,7*sp)-.5)*w,y-hh);g.quadraticCurveTo(px+w*.5,y-hh*.5,px+w,y);g.closePath();g.fill();}
  cnGlow(g,x,y-s*.2,s*(1.5+.4*fl),'#ff8a3a',.15+.22*fl);g.restore();
};
const BATTLEFIELD=(g,W,H,p,t,seed,S)=>{
  const bio=cbgBio(p.biome),tod=cbgTod(p.time),C=cbgCtx(g,W,H,p,seed,S,.56,bio,tod),{E,F}=C,B=cbgBfLayout(C),I=B.I;
  C.fac=B.fs[0];
  cbgSky(g,C);
  g.fillStyle=cnLG(g,0,C.hzY-H*.6,0,C.hzY+H*.02,[[0,cnA('#2a1a18',0)],[1,cnA('#4a2418',.15+.3*I)]]);g.fillRect(F.x,C.hzY-H*.6,F.w,H*.62);
  cbgSmokeBanks(g,C,.25+.5*I);
  cbgFarLand(g,C,{amp:.8,near:true});
  if(bio==='ash')cbgLava(g,C);
  /* the two sides' rear structures, hazed, on the horizon */
  const R=[];
  [[0,.07],[1,.93]].forEach(([sd,xf])=>{const fac=B.fs[sd];
    if(fac==='meridian'){R.push({f:'m_dome',x:W*xf,y:H*(C.hz+.05),s:H*.07,k:.4},{f:'tower',x:W*(xf+(sd?-.07:.07)),y:H*(C.hz+.052),s:H*.1,k:.42});}
    else if(fac==='obsidian'){R.push({f:'o_spire',x:W*xf,y:H*(C.hz+.05),s:H*.1,k:.4},{f:'o_spire',x:W*(xf+(sd?-.06:.06)),y:H*(C.hz+.04),s:H*.07,k:.44});}
    else{R.push({f:'a_spire',x:W*xf,y:H*(C.hz+.05),s:H*.06,k:.4,hh:5.6},{f:'a_dome',x:W*(xf+(sd?-.08:.08)),y:H*(C.hz+.05),s:H*.06,k:.44});}});
  R.forEach((r,i)=>Object.assign(r,{i:i,seed:cnH32(seed,i,5,5),fac:r.f.startsWith('m_')||r.f==='tower'?'meridian':r.f.startsWith('o_')?'obsidian':'aurora',dmg:I>.6?1:0,st:'siege'}));
  cbgDrawItems(g,C,R,'st');
  cbgGroundFill(g,C,{bands:6});cbgScatter(g,C,{n:30});
  /* scorched ground, craters */
  for(const e of B.ex){
    const r=H*(.02+.025*(e.y/H-C.hz)*3)*(.8+.4*cnR(seed,e.i,20));cbgSoot(g,C,e.x,e.y,r*3.4,r*.9,.45);
    cbgEll(g,e.x,e.y,r*1.25,r*.38);g.fillStyle=cnA(E.sh(E.mat.ground[1],.5),.8);g.fill();cbgEll(g,e.x,e.y+r*.06,r,r*.28);g.fillStyle=cnA('#0a0608',.7);g.fill();
    g.strokeStyle=cnA(E.sh(cnMix(E.mat.ground[0],'#fff',.2),.9),.5);g.lineWidth=Math.max(1,C.u);g.beginPath();g.ellipse(e.x,e.y-r*.02,r*1.25,r*.38,0,Math.PI*1.05,Math.PI*1.95);g.stroke();
  }
  /* burnt-out husks of big machines */
  for(const h of B.husks){const fac=B.fs[h.sd];cbgUnit(g,C,h.type,fac,h.x,h.y,H*(.0017+.0045*(h.y/H-C.hz)),h.sd===1,{dead:true,shadow:.9,fog:.12});cnGlow(g,h.x,h.y-H*.01,H*.05,'#ff5a1a',.3);}
  /* troops, far to near */
  const sorted=B.units;
  for(const u of sorted){
    const fog=u.li===0?.34:u.li===1?.14:0,dark=u.li===2?.35:0;
    cbgUnit(g,C,u.type,u.fac,u.x,u.y,u.kk,u.flip,{fog,shadow:1});
    if(dark>0){}
  }
  /* standards: a banner pole with each army */
  for(const it of B.ban){g.save();CBG_FEAT.banner.st(g,C,it);g.restore();}
  /* foreground: dark rubble / wreck silhouettes in the corners */
  for(let i=0;i<5;i++){const sd2=i%2?1:-1,x=sd2<0?F.x+cnR(seed,i,41)*W*.12:F.x+F.w-cnR(seed,i,41)*W*.12,y=H*(.94+.06*cnR(seed,i,42)),s=H*(.05+.06*cnR(seed,i,43));cbgRock(g,C,x,y,s,seed+i*5,cnMix(E.mat.rock,'#000',.55));}
  g.fillStyle=cnLG(g,0,C.hzY,0,C.hzY+H*.14,[[0,cnA(E.haze,.4)],[1,cnA(E.haze,0)]]);g.fillRect(F.x,C.hzY,F.w,H*.14);
  /* dust hanging over the field */
  g.fillStyle=cnLG(g,0,C.hzY+H*.04,0,C.hzY+H*.24,[[0,cnA(cnMix(E.haze,E.mat.ground[0],.4),.0)],[.35,cnA(cnMix(E.haze,E.mat.ground[0],.4),.22*(.4+I))],[1,cnA(cnMix(E.haze,E.mat.ground[0],.4),0)]]);g.fillRect(F.x,C.hzY+H*.04,F.w,H*.2);
};
BATTLEFIELD.static=true;
BATTLEFIELD.anim=(g,W,H,p,t,seed,S)=>{
  const bio=cbgBio(p.biome),tod=cbgTod(p.time),C=cbgCtx(g,W,H,p,seed,S,.56,bio,tod),{E,F}=C,B=cbgBfLayout(C),I=B.I,sp=S.rm?.4:1;
  C.fac=B.fs[0];
  const att=['#ff6a4a','#6ab4ff','#7affd8'],cl=B.fs.map(f=>f==='obsidian'?'#ff6a4a':f==='meridian'?'#7ab8ff':'#7affd8');
  /* smoke columns */
  for(const m of B.sm){const T=H*(.3+.2*cnR(seed,m.i,31));cbgPlume(g,t*sp,m.x,m.y,{n:14,per:12,h:T,r0:H*.012,r1:H*.07,wind:.6,sway:H*.02,col:E.night?'#1a1820':'#2a2426',a:.5},seed+m.i*7);
    cnGlow(g,m.x,m.y,H*.05,'#ff6a20',.35+.25*cnFlicker(t*sp,seed+m.i,6));}
  for(const h of B.husks)BF_FIRE(g,C,h.x,h.y-H*.006,H*.025,seed+h.i*3,t*sp,sp);
  for(const it of B.ban){g.save();CBG_FEAT.banner.an(g,C,it,t);g.restore();}
  /* explosions: a fireball + shock ring + a column of smoke, once per period */
  for(const e of B.ex){
    const tt=t*sp/e.per+cnR(seed,e.i,21),cyc=Math.floor(tt),ph=tt-cyc,life=.34;if(ph>life||cnR(seed,e.i*13+cyc,22)>(.25+.75*I))continue;
    const k=ph/life,sd=cnH32(seed,e.i,cyc,5),ex=e.x+(cnHash(sd,1,0)-.5)*W*.06,ey=e.y,R=H*(.045+.03*(e.y/H-C.hz)*3)*(.9+.4*cnHash(sd,2,0));
    const fb=Math.pow(k,.45),fa=Math.pow(1-k,1.1);
    if(!S.rm&&k<.12)cnGlow(g,ex,ey-R*.3,R*3.4,'#ffd9a0',(1-k/.12)*.5,{core:.9});
    cnGlow(g,ex,ey-R*.5*fb,R*1.5*(.4+fb),'#ff8a3a',.7*fa,{core:.6});
    cbgPuff(g,ex,ey-R*(.6+1.6*k),R*(.6+1.1*k),E.night?'#2a2228':'#3a2c28',.6*Math.min(1,k*5)*(1-k*.4));
    g.save();g.globalCompositeOperation='lighter';g.strokeStyle=cnA('#ffd9a0',.5*fa);g.lineWidth=Math.max(1,S.u*1.4);g.beginPath();g.ellipse(ex,ey,R*2.2*fb,R*.55*fb,0,0,TAU);g.stroke();
    for(let j=0;j<10;j++){const a=-Math.PI*(.15+.7*cnHash(sd,j,3)),d=R*(1+2.8*fb)*(.5+cnHash(sd,j,4)*.7);g.fillStyle=cnA('#ffc070',fa);g.fillRect(ex+Math.cos(a)*d,ey+Math.sin(a)*d*1.3+k*k*R*2,Math.max(1,S.u*1.5),Math.max(1,S.u*1.5));}
    g.restore();
  }
  /* tracers crossing the gap, both ways */
  const n=Math.round(4+18*I);
  for(let sd=0;sd<2;sd++){const dir=sd?-1:1,xa=.5-dir*.2,xb=.5+dir*.2;
    cbgTracers(g,C,t+sd*.7,{n:Math.round(n/2),per:2.2,from:[W*Math.min(xa,xa-dir*.06),H*(C.hz+.04),W*Math.max(xa,xa-dir*.06),H*(C.hz+.22)],to:[W*Math.min(xb,xb+dir*.05),H*(C.hz+.05),W*Math.max(xb,xb+dir*.05),H*(C.hz+.2)],col:cl[sd],hit:cl[sd],life:.12,w:1.5});}
  /* muzzle flashes on the front rows */
  if(!S.rm&&I>0){g.save();g.globalCompositeOperation='lighter';
    for(const u of B.units){if(u.li===2)continue;const k=Math.floor(t*(3+4*I)+u.i*1.7),on=cnR(seed,k,u.i+400)<(.1+.35*I)&&cnFrac(t*(3+4*I)+u.i*1.7)<.3;if(!on)continue;
      const dir=u.flip?-1:1,r=u.r*u.kk;cnGlow(g,u.x+dir*r*1.3,u.y-r*.2,r*1.1,'#ffd890',.8,{core:.8});}
    g.restore();}
  /* a strike craft crossing the sky now and then (closed form: one pass per period) */
  const per=14,ph=cnFrac(t*sp/per+cnR(seed,1,33)),fx=W*(-.1+1.2*ph),fy=H*(.14+.06*Math.sin(ph*5)),dirF=1;
  if(ph>0&&ph<1){const L=H*.03;g.save();g.translate(fx,fy);g.rotate(.05*Math.sin(ph*6));g.fillStyle=E.fog('#1a1a22',.3);cbgShipPath(g,L);g.fill();cnGlow(g,-L*.55,0,L*.5,'#ffd8a0',.6);g.restore();}
  cbgAshFall(g,C,t,24,E.night?'#8a8a98':'#5a4a40',.06);
  g.save();g.globalCompositeOperation='lighter';const ne=cnN(18,S);for(let i=0;i<ne;i++){const ph2=cnPhase(t*sp,4+cnR(seed,i,3)*4,i,seed),x=F.x+((cnR(seed,i,1)+ph2*.04)%1)*F.w,y=H*(.74-ph2*.5);g.fillStyle=cnA('#ff9a4a',(1-ph2)*.8*(.3+I));g.fillRect(x,y,Math.max(1,S.u*1.2),Math.max(1,S.u*1.2));}g.restore();
};
CINE_PAINT.bg.battlefield=BATTLEFIELD;

/* ------------------------------------------------ 14. interiors: shared room geometry ------------------------------------------------ */
/* One-point-perspective room box. (u,v,z): u 0..1 left wall -> right wall, v 0..1 ceiling -> floor, z 0..1 near plane (= the frame) -> back wall.
   z < 0 reaches out past the frame, so the shell can cover any bleed margin and the picture inside the frame never depends on it. */
function cbgRoomGeo(W,H,o){
  o=o||{};const rho=o.rho||.6,vp={x:W*(o.vx==null?.5:o.vx),y:H*(o.vy==null?.45:o.vy)},N={x0:0,y0:0,x1:W,y1:H};
  const B={x0:vp.x+(N.x0-vp.x)*rho,x1:vp.x+(N.x1-vp.x)*rho,y0:vp.y+(N.y0-vp.y)*rho,y1:vp.y+(N.y1-vp.y)*rho},k=1/rho-1,T=z=>(1-1/(1+z*k))/(1-rho);
  const P=(u,v,z)=>{const t=T(z),xa=N.x0+(B.x0-N.x0)*t,xb=N.x1+(B.x1-N.x1)*t,ya=N.y0+(B.y0-N.y0)*t,yb=N.y1+(B.y1-N.y1)*t;return[xa+(xb-xa)*u,ya+(yb-ya)*v];};
  return{vp,N,B,P,T,zN:-.55/k,uvp:(vp.x-N.x0)/(N.x1-N.x0),vvp:(vp.y-N.y0)/(N.y1-N.y0),rho,
    sc:z=>1/(1+z*k)};      // screen scale of things at depth z (1 at the frame, rho at the back wall)
}
const cbgQ=(g,G,pts)=>{g.beginPath();pts.forEach((q,i)=>{const p=G.P(q[0],q[1],q[2]);i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1]);});g.closePath();};
/* box in room coordinates: draws the faces that face the eye (inner side, top or underside, front). cols = {front,side,top} */
function cbgBox3(g,C,G,u0,u1,v0,v1,z0,z1,cols,o){
  o=o||{};const eyeU=G.uvp,eyeV=G.vvp;
  if(o.side!==false){const su=u1<eyeU?u1:u0>eyeU?u0:null;if(su!=null){const sg=u1<eyeU?1:-1;cbgQ(g,G,[[su,v0,z0],[su,v0,z1],[su,v1,z1],[su,v1,z0]]);g.fillStyle=cols.side;g.fill();}}
  if(v0>eyeV){cbgQ(g,G,[[u0,v0,z0],[u1,v0,z0],[u1,v0,z1],[u0,v0,z1]]);g.fillStyle=cols.top;g.fill();}
  else if(v1<eyeV){cbgQ(g,G,[[u0,v1,z0],[u1,v1,z0],[u1,v1,z1],[u0,v1,z1]]);g.fillStyle=cols.top;g.fill();}
  cbgQ(g,G,[[u0,v0,z0],[u1,v0,z0],[u1,v1,z0],[u0,v1,z0]]);g.fillStyle=cols.front;g.fill();
}
/* palettes: wall / panel / floor / ceiling / light strip / accent / glow / screen */
const CBG_BR={
  meridian:{wall:'#34445e',wall2:'#566a8c',floor:'#151c2c',ceil:'#26324a',strip:'#d8ebff',acc:'#3d8bff',glow:'#7ab8ff',scr:'#5ac8ff',metal:'#8a9ab4'},
  obsidian:{wall:'#1c1417',wall2:'#3a2a2e',floor:'#0b080a',ceil:'#130d10',strip:'#ff6a3a',acc:'#ff4d4d',glow:'#ff6a3a',scr:'#ff7a4a',metal:'#5a4a50'},
  aurora  :{wall:'#9fb6b6',wall2:'#e0ecea',floor:'#6f8c8c',ceil:'#c8d8d6',strip:'#9dffe2',acc:'#27d3a2',glow:'#4dffd0',scr:'#7affe0',metal:'#d8e6e4'},
  neutral :{wall:'#4a4540',wall2:'#6e665a',floor:'#1c1a18',ceil:'#2a2622',strip:'#ffd890',acc:'#c8a060',glow:'#ffc870',scr:'#ffd890',metal:'#8a8274'}
};
function cbgBrPal(fac,alert){
  const b=CBG_BR[fac]||CBG_BR.meridian,p=Object.assign({},b);
  if(alert){p.strip='#ff4030';p.glow='#ff3a2a';p.scr='#ff7a60';p.acc='#ff3030';p.wall=cnMix(b.wall,'#3a1210',.35);p.ceil=cnMix(b.ceil,'#2a0c0c',.4);}
  return p;
}
/* an on-screen panel: glowing glass with UI lines. q = [[u,v,z]x4] clockwise from top-left; kind = which pattern */
function cbgScreen(g,C,G,pts,pal,seed,kind,k){
  const{u,E}=C;cbgQ(g,G,pts);g.fillStyle=cnLG(g,0,G.P(pts[0][0],pts[0][1],pts[0][2])[1],0,G.P(pts[3][0],pts[3][1],pts[3][2])[1],[[0,cnMix('#04080e',pal.scr,.28*k)],[1,cnMix('#02050a',pal.scr,.12*k)]]);g.fill();
  g.save();cbgQ(g,G,pts);g.clip();
  const A=G.P(pts[0][0],pts[0][1],pts[0][2]),Bp=G.P(pts[1][0],pts[1][1],pts[1][2]),Cc=G.P(pts[2][0],pts[2][1],pts[2][2]),D=G.P(pts[3][0],pts[3][1],pts[3][2]);
  const at=(a,b)=>{const x0=A[0]+(Bp[0]-A[0])*a,y0=A[1]+(Bp[1]-A[1])*a,x1=D[0]+(Cc[0]-D[0])*a,y1=D[1]+(Cc[1]-D[1])*a;return[x0+(x1-x0)*b,y0+(y1-y0)*b];};
  g.lineCap='round';
  const rows=kind==='graph'?0:5+((cnH32(seed,1,1,1)%4));
  for(let i=0;i<rows;i++){const b=(i+.7)/(rows+.4),w=.25+.65*cnR(seed,i,3),a0=.06+.2*cnR(seed,i,4),p0=at(a0,b),p1=at(Math.min(.94,a0+w),b);
    g.strokeStyle=cnA(pal.scr,.55*k+.2);g.lineWidth=Math.max(1,u*1.1);g.beginPath();g.moveTo(p0[0],p0[1]);g.lineTo(p1[0],p1[1]);g.stroke();}
  if(kind==='graph'||kind==='mix'){g.strokeStyle=cnA(pal.scr,.9*k);g.lineWidth=Math.max(1,u*1.3);g.beginPath();for(let i=0;i<=12;i++){const q=at(.08+i/12*.84,.5+(cnVN(i*.7,seed%97,seed)-.5)*.7);i?g.lineTo(q[0],q[1]):g.moveTo(q[0],q[1]);}g.stroke();}
  if(kind==='ring'||kind==='mix'){const c=at(.5,.5),r=Math.min(Math.hypot(Bp[0]-A[0],Bp[1]-A[1]),Math.hypot(D[0]-A[0],D[1]-A[1]))*.3;g.strokeStyle=cnA(pal.scr,.8*k);g.lineWidth=Math.max(1,u*1.2);g.beginPath();g.ellipse(c[0],c[1],r,r*.8,0,0,TAU);g.stroke();g.beginPath();g.ellipse(c[0],c[1],r*.55,r*.44,0,0,TAU);g.stroke();}
  g.restore();
  g.strokeStyle=cnA(pal.metal,.7);g.lineWidth=Math.max(1,u*1.2);cbgQ(g,G,pts);g.stroke();
  const c=G.P((pts[0][0]+pts[2][0])/2,(pts[0][1]+pts[2][1])/2,(pts[0][2]+pts[2][2])/2);
  cnGlow(g,c[0],c[1],Math.hypot(Bp[0]-A[0],Bp[1]-A[1])*.9+u*8,pal.scr,.16*k);
}
/* seated crew seen from behind: chair back, shoulders, head; backlit by the screens */
function cbgCrew(g,C,G,u,v,z,pal,seed,sd){
  const p=G.P(u,v,z),s=G.sc(z)*C.H*.17,x=p[0],y=p[1],E=C.E;
  g.fillStyle=cnA('#06080e',.95);
  cbgEll(g,x,y+s*.32,s*.42,s*.3);g.fill();
  g.beginPath();g.moveTo(x-s*.36,y+s*.5);g.quadraticCurveTo(x-s*.42,y,x-s*.18,y-s*.04);g.lineTo(x+s*.18,y-s*.04);g.quadraticCurveTo(x+s*.42,y,x+s*.36,y+s*.5);g.closePath();g.fill();
  g.beginPath();g.arc(x,y-s*.2,s*.15,0,TAU);g.fill();
  g.fillStyle=cnA(pal.scr,.55);g.fillRect(x+(sd>0?-s*.38:s*.34),y-s*.02,s*.04,s*.32);g.fillRect(x+(sd>0?-s*.15:s*.1),y-s*.3,s*.05,s*.12);
}
/* the section ring of one rib at depth z: rectangle (meridian / neutral), spiked (obsidian), chamfered arch (aurora) */
function cbgRibRing(g,C,G,z,th,pal,fac,seed,fill){
  const c=fac==='aurora'?.2:0,P=G.P,o=[[c,0],[1-c,0],[1,c],[1,1],[0,1],[0,c]],i=[[c+th,th*1.2],[1-c-th,th*1.2],[1-th,c+th*.4],[1-th,1],[th,1],[th,c+th*.4]];
  g.beginPath();o.forEach((q,k)=>{const p=P(q[0],q[1],z);k?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1]);});g.closePath();
  for(let k=i.length-1;k>=0;k--){const p=P(i[k][0],i[k][1],z);k===i.length-1?g.moveTo(p[0],p[1]):g.lineTo(p[0],p[1]);}g.closePath();
  g.fillStyle=fill;g.fill('evenodd');
  g.strokeStyle='rgba(0,0,0,.5)';g.lineWidth=Math.max(1,C.u*G.sc(z)*1.2);g.stroke();
  /* inner rim light */
  g.strokeStyle=cnA(pal.glow,.5*G.sc(z)+.1);g.lineWidth=Math.max(1,C.u*G.sc(z)*1.4);g.beginPath();i.forEach((q,k)=>{const p=P(q[0],q[1],z);k?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1]);});g.closePath();g.stroke();
  if(fac==='obsidian'){g.fillStyle=cnMix(pal.wall2,'#000',.3);for(let k=0;k<9;k++){const uu=.12+.76*k/8,a=P(uu-.025,th*1.2,z),b=P(uu+.025,th*1.2,z),c2=P(uu,th*1.2+.07,z);cbgPoly(g,[a[0],a[1],b[0],b[1],c2[0],c2[1]]);g.fill();}}
}
function cbgBrShell(g,C,G,pal,fac,alert,seed){
  const{u,W,H,F}=C,{P,zN}=G;
  /* ceiling */
  {const a=P(.5,0,zN),b=P(.5,0,1);cbgQ(g,G,[[0,0,zN],[1,0,zN],[1,0,1],[0,0,1]]);g.fillStyle=cnLG(g,0,a[1],0,b[1],[[0,cnMix(pal.ceil,'#000',.7)],[.55,cnMix(pal.ceil,'#000',.35)],[1,cnMix(pal.ceil,pal.glow,.12)]]);g.fill();
   g.save();cbgQ(g,G,[[0,0,zN],[1,0,zN],[1,0,1],[0,0,1]]);g.clip();
   g.strokeStyle='rgba(0,0,0,.35)';g.lineWidth=Math.max(1,u);g.beginPath();for(const uu of[.15,.4,.6,.85]){const q0=P(uu,0,zN),q1=P(uu,0,1);g.moveTo(q0[0],q0[1]);g.lineTo(q1[0],q1[1]);}g.stroke();
   for(const uu of[.26,.5,.74]){cbgQ(g,G,[[uu-.022,0,zN],[uu+.022,0,zN],[uu+.022,0,1],[uu-.022,0,1]]);g.fillStyle=cnA(pal.strip,.95);g.fill();
     g.save();g.globalCompositeOperation='lighter';cbgQ(g,G,[[uu-.07,0,zN],[uu+.07,0,zN],[uu+.07,0,1],[uu-.07,0,1]]);g.fillStyle=cnLG(g,P(uu-.07,0,0)[0],0,P(uu+.07,0,0)[0],0,[[0,cnA(pal.strip,0)],[.5,cnA(pal.strip,.2)],[1,cnA(pal.strip,0)]]);g.fill();g.restore();}
   g.restore();}
  /* floor: dark gloss with the strips mirrored in it */
  {const a=P(.5,1,zN),b=P(.5,1,1);cbgQ(g,G,[[0,1,zN],[1,1,zN],[1,1,1],[0,1,1]]);g.fillStyle=cnLG(g,0,a[1],0,b[1],[[0,cnMix(pal.floor,'#000',.4)],[.5,pal.floor],[1,cnMix(pal.floor,pal.glow,.16)]]);g.fill();
   g.save();cbgQ(g,G,[[0,1,zN],[1,1,zN],[1,1,1],[0,1,1]]);g.clip();
   g.globalCompositeOperation='lighter';for(const uu of[.26,.5,.74]){cbgQ(g,G,[[uu-.05,1,zN],[uu+.05,1,zN],[uu+.05,1,1],[uu-.05,1,1]]);g.fillStyle=cnLG(g,P(uu-.05,1,0)[0],0,P(uu+.05,1,0)[0],0,[[0,cnA(pal.strip,0)],[.5,cnA(pal.strip,.15)],[1,cnA(pal.strip,0)]]);g.fill();}
   g.globalCompositeOperation='source-over';
   cbgQ(g,G,[[.41,1,zN],[.59,1,zN],[.59,1,1],[.41,1,1]]);g.fillStyle=cnA(cnMix(pal.acc,'#000',.6),.5);g.fill();
   for(const uu of[.41,.59]){const q0=P(uu,1,zN),q1=P(uu,1,1);g.strokeStyle=cnA(pal.glow,.55);g.lineWidth=Math.max(1,u*1.4);g.beginPath();g.moveTo(q0[0],q0[1]);g.lineTo(q1[0],q1[1]);g.stroke();}
   g.strokeStyle='rgba(0,0,0,.4)';g.lineWidth=Math.max(1,u*.8);g.beginPath();for(let z=0;z<1;z+=.05){const q0=P(0,1,z),q1=P(1,1,z);g.moveTo(q0[0],q0[1]);g.lineTo(q1[0],q1[1]);}g.stroke();
   g.restore();}
  /* side walls */
  for(const sd of[0,1]){
    cbgQ(g,G,[[sd,0,zN],[sd,1,zN],[sd,1,1],[sd,0,1]]);
    const a=P(sd,.5,zN),b=P(sd,.5,1);g.fillStyle=cnLG(g,a[0],0,b[0],0,[[0,cnMix(pal.wall,'#000',.6)],[.5,cnMix(pal.wall,'#000',.3)],[1,cnMix(pal.wall2,pal.glow,.12)]]);g.fill();
    g.save();cbgQ(g,G,[[sd,0,zN],[sd,1,zN],[sd,1,1],[sd,0,1]]);g.clip();
    g.strokeStyle='rgba(0,0,0,.4)';g.lineWidth=Math.max(1,u);g.beginPath();for(const v of[.16,.56,.7]){const q0=P(sd,v,zN),q1=P(sd,v,1);g.moveTo(q0[0],q0[1]);g.lineTo(q1[0],q1[1]);}g.stroke();
    /* glowing seam */
    const s0=P(sd,.13,zN),s1=P(sd,.13,1);g.strokeStyle=cnA(pal.glow,.7);g.lineWidth=Math.max(1,u*1.6);g.beginPath();g.moveTo(s0[0],s0[1]);g.lineTo(s1[0],s1[1]);g.stroke();
    g.save();g.globalCompositeOperation='lighter';g.strokeStyle=cnA(pal.glow,.25);g.lineWidth=Math.max(3,u*6);g.stroke();g.restore();
    /* pipe run */
    const p0=P(sd,.62,zN),p1=P(sd,.62,1);g.strokeStyle=cnMix(pal.metal,'#000',.5);g.lineWidth=Math.max(2,u*5);g.beginPath();g.moveTo(p0[0],p0[1]);g.lineTo(p1[0],p1[1]);g.stroke();
    g.strokeStyle=cnA(pal.metal,.4);g.lineWidth=Math.max(1,u*1.2);g.beginPath();g.moveTo(p0[0],p0[1]-u*1.5);g.lineTo(p1[0],p1[1]-u*1.5);g.stroke();
    g.restore();
  }
  /* ribs, far to near */
  const zs=[.9,.78,.64,.5,.36,.22,.1,-.02];
  zs.forEach((z,i)=>{cbgRibRing(g,C,G,z,.05+.012*(1-G.sc(z)),pal,fac,seed,cnLG(g,P(0,0,z)[0],0,P(1,0,z)[0],0,[[0,cnMix(pal.wall2,'#000',.45)],[.5,cnMix(pal.wall2,'#000',.15)],[1,cnMix(pal.wall2,'#000',.45)]]));});
}
/* what is outside: the space painters re-used inside a clipped window (same planets and arrays as their own scenes) */
function cbgBrView(g,C,view,fac,seed,S,r){
  g.save();g.beginPath();g.rect(r.x,r.y,r.w,r.h);g.clip();
  g.fillStyle=cnLG(g,0,r.y,0,r.y+r.h,['#02040c','#0a1430']);g.fillRect(r.x,r.y,r.w,r.h);
  if(view==='none'){
    const pal=CBG_BR[fac]||CBG_BR.meridian;
    g.fillStyle=cnLG(g,0,r.y,0,r.y+r.h,[[0,'#0c1018'],[1,'#1a202c']]);g.fillRect(r.x,r.y,r.w,r.h);
    const n=3,pw=r.w/n;for(let i=0;i<n;i++){const x=r.x+i*pw;
      g.fillStyle=cnLG(g,x,0,x+pw,0,[[0,'#2a3242'],[.5,'#1c222e'],[1,'#2a3242']]);g.fillRect(x+pw*.03,r.y+r.h*.04,pw*.94,r.h*.92);
      g.strokeStyle='rgba(0,0,0,.45)';g.lineWidth=Math.max(1,C.u);g.beginPath();for(let k=1;k<9;k++){g.moveTo(x+pw*.03,r.y+r.h*(.04+.92*k/9));g.lineTo(x+pw*.97,r.y+r.h*(.04+.92*k/9));}g.stroke();
      for(const yy of[r.y+r.h*.04,r.y+r.h*.86]){g.save();g.beginPath();g.rect(x+pw*.03,yy,pw*.94,r.h*.1);g.clip();for(let k=-2;k<18;k++){g.fillStyle=k%2?'#d8b020':'#14110a';cbgPoly(g,[x+pw*.03+k*pw*.07,yy+r.h*.1,x+pw*.03+k*pw*.07+pw*.035,yy+r.h*.1,x+pw*.03+k*pw*.07+pw*.07,yy,x+pw*.03+k*pw*.07+pw*.035,yy]);g.fill();}g.restore();}
      cbgBrScreenFlat(g,C,x+pw*.3,r.y+r.h*.3,pw*.4,r.h*.3,pal,seed+i);}
  }else{
    const kind=view==='planet'?'planet':view==='array'?'array':'space',fn=CINE_PAINT.bg[kind];
    if(typeof fn==='function'&&!fn.placeholder){
      const s=r.h/C.H,Wd=r.w/s,Hd=C.H,planet={meridian:'azure',obsidian:'ember',aurora:'verdant',neutral:'ashen'}[fac]||'azure';
      const p2=Object.assign({},CN_BG_DEF[kind],kind==='planet'?{planet,size:.92,phase:.66,moons:1,rings:fac==='obsidian'}:kind==='array'?{planet,state:'dormant'}:{nebula:{meridian:'blue',obsidian:'red',aurora:'teal',neutral:'violet'}[fac]||'blue',density:.45});
      const S2=Object.assign({},S,{W:Wd,H:Hd,aspect:Wd/Hd,fill:{x:0,y:0,w:Wd,h:Hd},static:true,ts:0,lights:[]});
      g.translate(r.x,r.y);g.scale(s,s);g.save();g.beginPath();g.rect(0,0,Wd,Hd);g.clip();
      try{fn(g,Wd,Hd,p2,0,seed+11,S2);}catch(e){}
      g.restore();
    }else{cnStars(g,r.x,r.y,r.w,r.h,seed,160,{u:C.u});}
  }
  g.restore();
}
function cbgBrScreenFlat(g,C,x,y,w,h,pal,seed){
  g.fillStyle=cnA('#02060c',.8);g.fillRect(x,y,w,h);g.strokeStyle=cnA(pal.scr,.6);g.lineWidth=Math.max(1,C.u);g.strokeRect(x,y,w,h);
  for(let i=0;i<5;i++){const yy=y+h*(i+.8)/5.6,ww=w*(.3+.6*cnR(seed,i,3));g.fillStyle=cnA(pal.scr,.55);g.fillRect(x+w*.06,yy,ww*.88,Math.max(1,C.u*1.2));}
  g.fillStyle=cnA(pal.scr,.9);g.beginPath();g.arc(x+w*.88,y+h*.2,Math.max(2,C.u*3),0,TAU);g.fill();
}
const BRIDGE=(g,W,H,p,t,seed,S)=>{
  const fac=CBG_BR[p.faction]?p.faction:'meridian',alert=!!p.alert,view=['space','planet','none','array'].includes(p.view)?p.view:'space';
  const pal=cbgBrPal(fac,alert),G=cbgRoomGeo(W,H,{rho:.58,vy:.44}),F=S.fill,u=S.u,C={g,W,H,u,S,seed,F,bat:S.tier==='battery'},B=G.B,bw=B.x1-B.x0,bh=B.y1-B.y0;
  cnFillBg(g,S,'#04060c');
  cbgBrShell(g,C,G,pal,fac,alert,seed);
  /* back wall */
  g.fillStyle=cnLG(g,0,B.y0,0,B.y1,[[0,cnMix(pal.wall,'#000',.4)],[.7,cnMix(pal.wall,'#000',.2)],[1,cnMix(pal.floor,'#000',.1)]]);g.fillRect(B.x0-1,B.y0-1,bw+2,bh+2);
  const win={x:B.x0+bw*.06,y:B.y0+bh*.07,w:bw*.88,h:bh*.55};
  cbgBrView(g,C,view,fac,seed,S,win);
  /* glass: reflections, edge falloff, mullions, heavy frame */
  g.save();g.beginPath();g.rect(win.x,win.y,win.w,win.h);g.clip();
  g.fillStyle=cnLG(g,win.x,win.y,win.x+win.w*.5,win.y+win.h,[[0,'rgba(255,255,255,.07)'],[.25,'rgba(255,255,255,0)'],[.6,'rgba(255,255,255,.03)'],[.7,'rgba(255,255,255,0)']]);g.fillRect(win.x,win.y,win.w,win.h);
  g.fillStyle=cnRG(g,win.x+win.w/2,win.y+win.h/2,win.h*.4,win.w*.62,[[0,'rgba(0,0,0,0)'],[1,'rgba(2,4,10,.5)']]);g.fillRect(win.x,win.y,win.w,win.h);
  g.restore();
  for(const k of[1/3,2/3]){const mx=win.x+win.w*k;g.fillStyle=cnMix(pal.wall2,'#000',.5);g.fillRect(mx-bw*.007,win.y,bw*.014,win.h);g.fillStyle=cnA(pal.metal,.5);g.fillRect(mx-bw*.007,win.y,Math.max(1,u),win.h);}
  g.lineJoin='miter';g.strokeStyle=cnMix(pal.wall2,'#000',.25);g.lineWidth=Math.max(3,bw*.016);g.strokeRect(win.x,win.y,win.w,win.h);
  g.strokeStyle=cnA(pal.glow,.6);g.lineWidth=Math.max(1,u*1.4);g.strokeRect(win.x+bw*.008,win.y+bw*.008,win.w-bw*.016,win.h-bw*.016);
  g.strokeStyle='rgba(0,0,0,.6)';g.lineWidth=Math.max(1,u);g.strokeRect(win.x-bw*.008,win.y-bw*.008,win.w+bw*.016,win.h+bw*.016);
  /* helm bank under the window */
  const hb={x:B.x0+bw*.04,y:win.y+win.h+bh*.05,w:bw*.92,h:B.y1-(win.y+win.h+bh*.05)};
  g.fillStyle=cnLG(g,0,hb.y,0,hb.y+hb.h,[[0,cnMix(pal.wall2,'#000',.15)],[.18,cnMix(pal.wall,'#000',.4)],[1,cnMix(pal.floor,'#000',.2)]]);g.fillRect(hb.x,hb.y,hb.w,hb.h);
  g.fillStyle=cnA(pal.metal,.55);g.fillRect(hb.x,hb.y,hb.w,Math.max(1.5,u*2));g.fillStyle='rgba(0,0,0,.4)';g.fillRect(hb.x,hb.y+Math.max(1.5,u*2),hb.w,Math.max(1,u*2));
  const ns=7;for(let i=0;i<ns;i++){const sx=hb.x+hb.w*(i+.12)/ns,sw=hb.w*.76/ns,kinds=['mix','graph','ring','mix','graph','ring','mix'];
    const q=[[0,0],[1,0],[1,1],[0,1]].map(c=>[sx+c[0]*sw,hb.y+hb.h*(.2+c[1]*.4)]);
    g.fillStyle=cnA('#02050a',.9);g.fillRect(sx,hb.y+hb.h*.18,sw,hb.h*.46);g.fillStyle=cnLG(g,0,hb.y+hb.h*.2,0,hb.y+hb.h*.62,[[0,cnMix('#04080e',pal.scr,.25)],[1,cnMix('#02050a',pal.scr,.1)]]);g.fillRect(sx+sw*.04,hb.y+hb.h*.2,sw*.92,hb.h*.42);
    for(let k=0;k<4;k++){const yy=hb.y+hb.h*(.25+.1*k),ww=sw*(.3+.6*cnR(seed,i*5+k,3));g.fillStyle=cnA(pal.scr,.5);g.fillRect(sx+sw*.1,yy,ww*.8,Math.max(1,u*1.1));}
    g.strokeStyle=cnA(pal.metal,.6);g.lineWidth=Math.max(1,u);g.strokeRect(sx,hb.y+hb.h*.18,sw,hb.h*.46);
    cnGlow(g,sx+sw/2,hb.y+hb.h*.4,sw*.7,pal.scr,.12);
    for(let k=0;k<6;k++){g.fillStyle=cnA(k%3?pal.metal:pal.glow,.7);g.fillRect(sx+sw*(.1+.14*k),hb.y+hb.h*.74,sw*.09,hb.h*.07);}}
  /* side stations: consoles with their own screens, wall displays between the ribs (far to near so nearer ones overlap) */
  const bays=[[.78,.9],[.62,.74],[.46,.58],[.3,.42],[.14,.26]];
  for(const sd of[0,1]){
    bays.forEach((b,i)=>{
      const z0=b[0],z1=b[1],u0=sd?.87:0,u1=sd?1:.13,su=sd?.87:.13,k=5-i-1;
      cbgScreen(g,C,G,[[sd,.26,z0+.02],[sd,.26,z1-.02],[sd,.5,z1-.02],[sd,.5,z0+.02]],pal,seed+k*3+sd*11,['mix','graph','ring','mix','graph'][k],1);
      cbgBox3(g,C,G,u0,u1,.74,1.0,z0,z1,{front:cnMix(pal.wall,'#000',.55),side:cnMix(pal.wall2,'#000',.5),top:cnMix(pal.wall2,'#000',.12)});
      /* screen on the inner face + key strip on top */
      cbgScreen(g,C,G,[[su,.78,z0+.012],[su,.78,z1-.012],[su,.93,z1-.012],[su,.93,z0+.012]],pal,seed+k*7+sd*5,['graph','mix','ring','graph','mix'][k],1);
      cbgQ(g,G,[[sd?.9:.04,.74,z0+.015],[sd?.97:.1,.74,z0+.015],[sd?.97:.1,.74,z1-.015],[sd?.9:.04,.74,z1-.015]]);g.fillStyle=cnA('#04070c',.7);g.fill();
      for(let q=0;q<5;q++){const zz=z0+(z1-z0)*(q+.5)/5,c=G.P(sd?.935:.07,.74,zz),w=Math.max(1,G.sc(zz)*u*3);g.fillStyle=cnA(q%2?pal.glow:pal.metal,.8);g.fillRect(c[0]-w,c[1]-w*.5,w*2,w);}
      if((i+sd)%2===0&&cnR(seed,i,sd+40)<.8)cbgCrew(g,C,G,sd?.78:.22,.8,(z0+z1)/2+.01,pal,seed+i*5+sd,sd?-1:1);
    });
  }
  /* command dais, chair and the holo projector ring */
  cbgBox3(g,C,G,.36,.64,.94,1.0,.5,.88,{front:cnMix(pal.wall,'#000',.45),side:cnMix(pal.wall2,'#000',.5),top:cnMix(pal.wall2,'#000',.2)},{side:false});
  {const c=G.P(.5,.94,.62),s=G.sc(.62)*H*.17;
   g.fillStyle=cnA('#06080e',.96);g.beginPath();g.moveTo(c[0]-s*.3,c[1]);g.quadraticCurveTo(c[0]-s*.36,c[1]-s*.9,c[0]-s*.2,c[1]-s*1.2);g.lineTo(c[0]+s*.2,c[1]-s*1.2);g.quadraticCurveTo(c[0]+s*.36,c[1]-s*.9,c[0]+s*.3,c[1]);g.closePath();g.fill();
   g.strokeStyle=cnA(pal.glow,.5);g.lineWidth=Math.max(1,u*1.2);g.beginPath();g.moveTo(c[0]-s*.2,c[1]-s*1.2);g.quadraticCurveTo(c[0]-s*.36,c[1]-s*.9,c[0]-s*.3,c[1]);g.moveTo(c[0]+s*.2,c[1]-s*1.2);g.quadraticCurveTo(c[0]+s*.36,c[1]-s*.9,c[0]+s*.3,c[1]);g.stroke();}
  for(const k of[.07,.04]){const a=G.P(.5-k*3.4,.995,.46),b=G.P(.5+k*3.4,.995,.46);g.strokeStyle=cnA(pal.glow,.55);g.lineWidth=Math.max(1,u*1.4);g.beginPath();g.ellipse((a[0]+b[0])/2,a[1],(b[0]-a[0])/2,(b[0]-a[0])*.1,0,0,TAU);g.stroke();}
  /* light spill from the window onto the room */
  const wc={x:win.x+win.w/2,y:win.y+win.h/2},spill=view==='none'?pal.glow:view==='planet'?{meridian:'#8ac8ff',obsidian:'#ff8a50',aurora:'#b8ffb0',neutral:'#c8c4d0'}[fac]:'#a8c4ff';
  cnGlow(g,wc.x,wc.y+win.h*.5,win.w*.55,spill,view==='none'?.04:.16,{squash:.55});
  cnGlow(g,wc.x,B.y1,bw*.5,spill,.1,{squash:.2});
  /* alert: red housings in the ceiling corners */
  if(alert)for(const sd of[0,1]){const c=G.P(sd?.88:.12,.02,.45),r=G.sc(.45)*H*.03;g.fillStyle='#2a0806';cbgEll(g,c[0],c[1]+r*.2,r*1.3,r*.6);g.fill();cnGlow(g,c[0],c[1],r*5,'#ff2a1a',.35);g.fillStyle='#ff5a40';cbgEll(g,c[0],c[1],r*.7,r*.4);g.fill();}
  /* a vignette-ish falloff on the near edges keeps the actors' columns calm */
  g.fillStyle=cnLG(g,0,F.y+F.h*.55,0,F.y+F.h,[[0,'rgba(0,0,0,0)'],[1,'rgba(0,0,0,.35)']]);g.fillRect(F.x,F.y+F.h*.55,F.w,F.h*.45);
};
BRIDGE.static=true;
BRIDGE.anim=(g,W,H,p,t,seed,S)=>{
  const fac=CBG_BR[p.faction]?p.faction:'meridian',alert=!!p.alert,view=['space','planet','none','array'].includes(p.view)?p.view:'space';
  const pal=cbgBrPal(fac,alert),G=cbgRoomGeo(W,H,{rho:.58,vy:.44}),u=S.u,B=G.B,bw=B.x1-B.x0,bh=B.y1-B.y0,C={g,W,H,u,S,seed,bat:S.tier==='battery'};
  const win={x:B.x0+bw*.06,y:B.y0+bh*.07,w:bw*.88,h:bh*.55},hb={x:B.x0+bw*.04,y:win.y+win.h+bh*.05,w:bw*.92,h:B.y1-(win.y+win.h+bh*.05)};
  /* the view's own twinkle, drawn inside the window */
  const kind=view==='planet'?'planet':view==='array'?'array':view==='space'?'space':null,fn=kind&&CINE_PAINT.bg[kind];
  if(fn&&typeof fn.anim==='function'&&!fn.placeholder){const s=win.h/H,Wd=win.w/s,S2=Object.assign({},S,{W:Wd,H:H,aspect:Wd/H,fill:{x:0,y:0,w:Wd,h:H},static:false});
    g.save();g.beginPath();g.rect(win.x,win.y,win.w,win.h);g.clip();g.translate(win.x,win.y);g.scale(s,s);
    try{fn.anim(g,Wd,H,Object.assign({},CN_BG_DEF[kind],kind==='space'?{}:{planet:{meridian:'azure',obsidian:'ember',aurora:'verdant',neutral:'ashen'}[fac]}),t,seed+11,S2);}catch(e){}g.restore();}
  /* helm LEDs */
  g.save();g.globalCompositeOperation='lighter';
  const ns=7;for(let i=0;i<ns;i++){const sx=hb.x+hb.w*(i+.12)/ns,sw=hb.w*.76/ns;
    for(let k=0;k<6;k++){const on=cnFlicker(t*.5,seed+i*9+k,3)>.45;if(on)cnGlow(g,sx+sw*(.145+.14*k),hb.y+hb.h*.775,Math.max(3,u*5),k%3?pal.scr:pal.glow,.55);}
    const yy=hb.y+hb.h*(.25+.1*((Math.floor(t*1.3+i*.7))%4)),ww=sw*(.3+.6*cnR(seed,i*5+((Math.floor(t*1.3+i*.7))%4),3));g.fillStyle=cnA(pal.scr,.35);g.fillRect(sx+sw*.1,yy-1,ww*.8,Math.max(2,u*2));}
  /* side station screens scrolling */
  for(const sd of[0,1])for(let i=0;i<5;i++){const z=.2+i*.16,pt=G.P(sd?.87:.13,.85,z),r=G.sc(z)*H*.05,fl=cnFlicker(t,seed+i+sd*7,2);cnGlow(g,pt[0],pt[1],r,pal.scr,.1+.12*fl);
    for(let k=0;k<3;k++){const ph=cnFrac(t*.4+k*.33+i*.17+sd*.1),q=G.P(sd?.87:.13,.78+.15*ph,z+.03+.04*k);g.fillStyle=cnA(pal.scr,.4*(1-ph));g.fillRect(q[0]-r*.15,q[1],r*.3,Math.max(1,u));}}
  g.restore();
  /* the hologram over the dais: a slow wireframe globe + data ring */
  {const c=G.P(.5,.93,.46),R=G.sc(.46)*H*.07,tt=S.rm?t*.3:t;
   g.save();g.globalCompositeOperation='lighter';g.strokeStyle=cnA(pal.scr,.55);g.lineWidth=Math.max(1,u*1.1);
   const cy=c[1]-R*1.9;for(let k=0;k<3;k++){const a=tt*.5+k*Math.PI/3;g.beginPath();g.ellipse(c[0],cy,Math.abs(Math.cos(a))*R,R,0,0,TAU);g.stroke();}
   for(const lat of[-.5,0,.5]){g.beginPath();g.ellipse(c[0],cy+lat*R,R*Math.sqrt(1-lat*lat),R*.18*Math.sqrt(1-lat*lat),0,0,TAU);g.stroke();}
   g.fillStyle=cnLG(g,0,c[1]-R*3,0,c[1],[[0,cnA(pal.scr,0)],[1,cnA(pal.scr,.14)]]);cbgPoly(g,[c[0]-R*.9,cy+R,c[0]+R*.9,cy+R,c[0]+R*.5,c[1],c[0]-R*.5,c[1]]);g.fill();
   cnGlow(g,c[0],cy,R*2.4,pal.scr,.22+.06*Math.sin(tt*3));
   g.restore();}
  /* red alert: housings sweep, the room breathes (no strobing under reduced motion) */
  if(alert){
    const k=S.rm?.5:.5+.5*Math.sin(t*5.2),a=.07+.08*k;g.save();g.globalCompositeOperation='source-over';g.fillStyle=cnA('#ff1a10',a);g.fillRect(S.fill.x,S.fill.y,S.fill.w,S.fill.h);
    g.globalCompositeOperation='lighter';
    for(const sd of[0,1]){const c=G.P(sd?.88:.12,.02,.45),r=G.sc(.45)*H*.03,ang=S.rm?(sd?2.2:.9):t*3.4+(sd?Math.PI:0);
      g.fillStyle=cnLG(g,c[0],c[1],c[0]+Math.cos(ang)*H*.7,c[1]+Math.abs(Math.sin(ang))*H*.35+H*.1,[[0,cnA('#ff3a2a',.5*(S.rm?.6:1))],[1,cnA('#ff3a2a',0)]]);
      const L=H*.8,w=H*.1;g.beginPath();g.moveTo(c[0],c[1]);g.lineTo(c[0]+Math.cos(ang)*L-w,c[1]+H*.4);g.lineTo(c[0]+Math.cos(ang)*L+w,c[1]+H*.4);g.closePath();g.fill();
      cnGlow(g,c[0],c[1],r*(4+2*k),'#ff3a2a',.45);}
    g.restore();}
};
CINE_PAINT.bg.bridge=BRIDGE;

/* ------------------------------------------------ 15. hall: throne / council chamber ------------------------------------------------ */
const CBG_HL={
  meridian :{wall:'#3a4864',wall2:'#6a7c9c',floor:'#1a2336',ceil:'#202a42',acc:'#3d8bff',trim:'#a6ceff',dark:'#0e1526',gem:'#7ab8ff'},
  obsidian :{wall:'#1a1316',wall2:'#33262b',floor:'#0b0709',ceil:'#0d090b',acc:'#ff5a3a',trim:'#ff8a4a',dark:'#050304',gem:'#ff7a3a'},
  aurora   :{wall:'#a8bcbc',wall2:'#e4efed',floor:'#7a9696',ceil:'#bccece',acc:'#27d3a2',trim:'#a8ffe6',dark:'#32504e',gem:'#6affd8'},
  forbidden:{wall:'#2a2630',wall2:'#4a4458',floor:'#0d0b11',ceil:'#09070d',acc:'#8a6aff',trim:'#c8b8ff',dark:'#040307',gem:'#a88aff'}
};
const CBG_HLIGHT={cold:{amb:'#7aa8ff',shaft:'#cfe2ff',a:.5,warm:0},warm:{amb:'#ffb050',shaft:'#ffe2a8',a:.55,warm:1},blood:{amb:'#ff3a2a',shaft:'#ff7058',a:.5,warm:.6}};
/* a pillar from floor to ceiling at (u,z): shaft, capital, base. kind: 'sq' | 'cyl' | 'crystal' | 'broken' */
function cbgPillar(g,C,G,u,z,rw,pal,st,L,seed,flip){
  const{u:us}=C,P=G.P,sc=G.sc(z),va=flip?2:1,vv=v=>flip?2-v:v;
  const xl=P(u-rw,0,z)[0],xr=P(u+rw,0,z)[0],yt=P(u,vv(0),z)[1],yb=P(u,vv(1),z)[1],w=xr-xl,left=u<.5;
  const T=(c,k)=>cnMix(c,'#000',k);
  const lit=cnMix(pal.wall2,L.amb,.12),mid=cnMix(pal.wall,L.amb,.1);
  const grad=(a,b,c)=>cnLG(g,xl,0,xr,0,left?[[0,a],[.55,b],[1,c]]:[[0,c],[.45,b],[1,a]]);
  g.save();
  if(st==='aurora'){
    g.fillStyle=cnLG(g,xl,0,xr,0,[[0,cnA(pal.wall,.75)],[.5,cnA(cnMix(pal.wall2,pal.acc,.35),.9)],[1,cnA(pal.wall,.75)]]);g.fillRect(xl,yt,w,yb-yt);
    g.save();g.globalCompositeOperation='lighter';g.fillStyle=cnLG(g,xl+w*.4,0,xl+w*.6,0,[[0,cnA(pal.gem,0)],[.5,cnA(pal.gem,.55)],[1,cnA(pal.gem,0)]]);g.fillRect(xl+w*.35,yt,w*.3,yb-yt);g.restore();
    g.strokeStyle=cnA('#ffffff',.5);g.lineWidth=Math.max(1,us*sc*1.2);g.beginPath();g.moveTo(left?xr-w*.1:xl+w*.1,yt);g.lineTo(left?xr-w*.1:xl+w*.1,yb);g.stroke();
    for(const k of[.12,.88]){const y=yt+(yb-yt)*k;g.fillStyle=cnA(pal.trim,.7);g.fillRect(xl-w*.18,y-w*.07,w*1.36,w*.14);}
  }else if(st==='obsidian'){
    const j=n=>Math.sin(n*12.9898+seed*.1)*.5+.5;
    g.beginPath();g.moveTo(xl,yb);for(let i=0;i<=10;i++){const k=i/10,y=yb-(yb-yt)*k;g.lineTo(xl-w*(.05+.1*cnR(seed,i,3)),y);}g.lineTo(xl,yt);g.lineTo(xr,yt);for(let i=10;i>=0;i--){const k=i/10,y=yb-(yb-yt)*k;g.lineTo(xr+w*(.05+.1*cnR(seed,i,4)),y);}g.lineTo(xr,yb);g.closePath();
    g.fillStyle=grad(cnMix(pal.wall2,L.amb,.2),cnMix(pal.wall,'#000',.2),pal.dark);g.fill();
    g.save();g.clip();g.fillStyle=cnLG(g,0,yt,0,yb,[[0,'rgba(0,0,0,.5)'],[.5,'rgba(0,0,0,0)'],[1,'rgba(0,0,0,.4)']]);g.fillRect(xl-w,yt,w*3,yb-yt);g.restore();
    cbgCracks(g,C,xl,yt+(yb-yt)*.1,xr,yb-(yb-yt)*.05,seed+Math.round(z*100),4,.7*sc+.2,pal.acc);
    for(const k of[0,1]){const y=k?yb-(yb-yt)*.06:yt+(yb-yt)*.03;g.fillStyle=cnMix(pal.wall2,'#000',.3);g.fillRect(xl-w*.3,y-w*.12,w*1.6,w*.24);}
    g.fillStyle=cnMix(pal.wall2,'#000',.25);for(let i=0;i<4;i++){const px=xl-w*.2+w*1.4*(i+.5)/4;cbgPoly(g,[px-w*.1,yt+w*.12,px+w*.1,yt+w*.12,px,yt+w*.12+w*.5]);g.fill();}
  }else if(st==='forbidden'){
    const cut=cnR(seed,Math.round(z*50)+(u>.5?7:0),2)<.35,top=cut?yt+(yb-yt)*(.2+.5*cnR(seed,Math.round(z*50),3)):yt;
    g.beginPath();g.moveTo(xl-w*.05,yb);g.lineTo(xl,top+(cut?(yb-yt)*.04:0));if(cut){g.lineTo(xl+w*.3,top-w*.1);g.lineTo(xl+w*.5,top+w*.2);g.lineTo(xr-w*.2,top-w*.15);}
    g.lineTo(xr,top+(cut?(yb-yt)*.03:0));g.lineTo(xr+w*.05,yb);g.closePath();
    g.fillStyle=grad(cnMix(pal.wall2,L.amb,.2),cnMix(pal.wall,'#000',.1),pal.dark);g.fill();
    g.save();g.clip();g.strokeStyle='rgba(0,0,0,.35)';g.lineWidth=Math.max(1,us*sc*1.2);for(let k=1;k<8;k++){const y=yb-(yb-yt)*k/8+(cnR(seed,k,5)-.5)*w*.1;g.beginPath();g.moveTo(xl,y);g.lineTo(xr,y+(cnR(seed,k,6)-.5)*w*.2);g.stroke();}
    g.fillStyle=cnLG(g,0,top,0,yb,[[0,'rgba(0,0,0,.3)'],[.6,'rgba(0,0,0,0)'],[1,'rgba(0,0,0,.45)']]);g.fillRect(xl-w,top,w*3,yb-top);g.restore();
    if(!flip){g.save();g.globalCompositeOperation='lighter';const gy=yt+(yb-yt)*.45;g.strokeStyle=cnA(pal.acc,.55*sc+.15);g.lineWidth=Math.max(1,us*sc*1.4);g.beginPath();g.arc((xl+xr)/2,gy,w*.3,0,TAU);g.stroke();
      for(let k=0;k<6;k++){const a=k/6*TAU;g.beginPath();g.moveTo((xl+xr)/2+Math.cos(a)*w*.3,gy+Math.sin(a)*w*.3);g.lineTo((xl+xr)/2+Math.cos(a)*w*.42,gy+Math.sin(a)*w*.42);g.stroke();}g.restore();}
  }else{   // meridian: square steel pier with panels and a light line
    g.fillStyle=grad(lit,mid,T(pal.wall,.55));g.fillRect(xl,yt,w,yb-yt);
    g.fillStyle=cnA('#000',.18);g.fillRect(xl+w*.18,yt+(yb-yt)*.16,w*.64,(yb-yt)*.66);
    g.strokeStyle=cnA(pal.trim,.35);g.lineWidth=Math.max(1,us*sc);g.strokeRect(xl+w*.18,yt+(yb-yt)*.16,w*.64,(yb-yt)*.66);
    g.fillStyle=cnA(pal.trim,.85);g.fillRect(left?xr-w*.14:xl+w*.04,yt+(yb-yt)*.2,w*.1,(yb-yt)*.58);
    for(const k of[.04,.9]){g.fillStyle=cnMix(pal.wall2,'#000',.25);g.fillRect(xl-w*.18,yt+(yb-yt)*k,w*1.36,(yb-yt)*.06);}
  }
  /* base shadow */
  g.restore();
}
/* flat banner on a side wall between two depths: top v0, bottom v1 */
function cbgWallBanner(g,C,G,sd,z0,z1,v0,v1,col,trim,seed,rag){
  const P=G.P;cbgQ(g,G,[[sd,v0,z0],[sd,v0,z1],[sd,v1,z1],[sd,v1,z0]]);
  if(rag){const a=P(sd,v0,z0),b=P(sd,v0,z1),c=P(sd,v1,z1),d=P(sd,v1,z0);g.beginPath();g.moveTo(a[0],a[1]);g.lineTo(b[0],b[1]);const n=7;for(let i=0;i<=n;i++){const k=1-i/n,x=c[0]+(d[0]-c[0])*(1-k),y=c[1]+(d[1]-c[1])*(1-k)+(i%2?0:1)*(c[1]-b[1])*.12*(.5+cnR(seed,i,3));g.lineTo(x,y);}g.closePath();}
  g.fillStyle=cnLG(g,0,P(sd,v0,z0)[1],0,P(sd,v1,z0)[1],[[0,col],[1,cnMix(col,'#000',.45)]]);g.fill();
  g.strokeStyle=cnA(trim,.6);g.lineWidth=Math.max(1,C.u*G.sc((z0+z1)/2)*1.5);cbgQ(g,G,[[sd,v0,z0],[sd,v0,z1]]);g.stroke();
  const c=P(sd,v0+(v1-v0)*.4,(z0+z1)/2),r=Math.abs(P(sd,v0,z0)[0]-P(sd,v0,z1)[0])*.22;
  g.strokeStyle=cnA(trim,.8);g.lineWidth=Math.max(1,C.u*G.sc((z0+z1)/2)*1.6);g.beginPath();g.ellipse(c[0],c[1],r*.6,r,0,0,TAU);g.stroke();
  g.beginPath();g.moveTo(c[0]-r*.4,c[1]+r*.25);g.lineTo(c[0],c[1]-r*.45);g.lineTo(c[0]+r*.4,c[1]+r*.25);g.stroke();
}
const HALL=(g,W,H,p,t,seed,S)=>{
  const st=CBG_HL[p.style]?p.style:'meridian',lt=CBG_HLIGHT[p.light]?p.light:'cold',pal=CBG_HL[st],L=CBG_HLIGHT[lt],G=cbgRoomGeo(W,H,{rho:.46,vy:.47}),F=S.fill,u=S.u,P=G.P,B=G.B,bw=B.x1-B.x0,bh=B.y1-B.y0;
  const C={g,W,H,u,S,seed,F,bat:S.tier==='battery'},M=c=>cnMix(c,L.amb,.16);
  cnFillBg(g,S,'#04040a');
  /* back wall */
  g.fillStyle=cnLG(g,0,B.y0,0,B.y1,[[0,M(cnMix(pal.wall,'#000',.5))],[.7,M(cnMix(pal.wall,'#000',.25))],[1,M(cnMix(pal.floor,'#000',0))]]);g.fillRect(B.x0-1,B.y0-1,bw+2,bh+2);
  /* floor */
  {const a=P(.5,1,G.zN),b=P(.5,1,1);cbgQ(g,G,[[0,1,G.zN],[1,1,G.zN],[1,1,1],[0,1,1]]);g.fillStyle=cnLG(g,0,a[1],0,b[1],[[0,cnMix(M(pal.floor),'#000',.45)],[.55,M(pal.floor)],[1,cnMix(M(pal.floor),L.amb,.2)]]);g.fill();
   g.save();cbgQ(g,G,[[0,1,G.zN],[1,1,G.zN],[1,1,1],[0,1,1]]);g.clip();
   g.strokeStyle='rgba(0,0,0,.35)';g.lineWidth=Math.max(1,u*.8);g.beginPath();for(let z=0;z<1;z+=.07){const q0=P(0,1,z),q1=P(1,1,z);g.moveTo(q0[0],q0[1]);g.lineTo(q1[0],q1[1]);}for(let k=1;k<10;k++){const q0=P(k/10,1,G.zN),q1=P(k/10,1,1);g.moveTo(q0[0],q0[1]);g.lineTo(q1[0],q1[1]);}g.stroke();
   /* runner carpet / inlay */
   cbgQ(g,G,[[.4,1,G.zN],[.6,1,G.zN],[.6,1,.8],[.4,1,.8]]);g.fillStyle=st==='aurora'?cnA(pal.acc,.25):st==='forbidden'?cnA(pal.acc,.1):cnA(cnMix(pal.acc,'#000',.55),.8);g.fill();
   for(const uu of[.4,.6]){const q0=P(uu,1,G.zN),q1=P(uu,1,.8);g.strokeStyle=cnA(pal.trim,st==='forbidden'?.2:.5);g.lineWidth=Math.max(1,u*1.3);g.beginPath();g.moveTo(q0[0],q0[1]);g.lineTo(q1[0],q1[1]);g.stroke();}
   g.restore();}
  /* ceiling */
  {const a=P(.5,0,G.zN),b=P(.5,0,1);cbgQ(g,G,[[0,0,G.zN],[1,0,G.zN],[1,0,1],[0,0,1]]);g.fillStyle=cnLG(g,0,a[1],0,b[1],[[0,cnMix(M(pal.ceil),'#000',.7)],[.6,cnMix(M(pal.ceil),'#000',.4)],[1,M(pal.ceil)]]);g.fill();}
  /* side walls */
  for(const sd of[0,1]){
    cbgQ(g,G,[[sd,0,G.zN],[sd,1,G.zN],[sd,1,1],[sd,0,1]]);const a=P(sd,.5,G.zN),b=P(sd,.5,1);
    g.fillStyle=cnLG(g,a[0],0,b[0],0,[[0,cnMix(M(pal.wall),'#000',.6)],[.5,cnMix(M(pal.wall),'#000',.35)],[1,cnMix(M(pal.wall2),'#000',.25)]]);g.fill();
    g.save();cbgQ(g,G,[[sd,0,G.zN],[sd,1,G.zN],[sd,1,1],[sd,0,1]]);g.clip();
    g.strokeStyle='rgba(0,0,0,.3)';g.lineWidth=Math.max(1,u);g.beginPath();for(const v of[.62,.78]){const q0=P(sd,v,G.zN),q1=P(sd,v,1);g.moveTo(q0[0],q0[1]);g.lineTo(q1[0],q1[1]);}g.stroke();
    g.restore();
  }
  /* light wells in the vault (the shafts they throw are drawn after the dais). meridian / aurora: three; obsidian: two slits; forbidden: only the oculus */
  const dirL=cnR(seed,5,5)<.5?1:-1,bays=[[.12,.26],[.3,.44],[.48,.62],[.66,.8]],wells=st==='forbidden'?[]:st==='obsidian'?[[.3,.36,.4,.6],[.62,.68,.4,.6]]:[[.22,.3,.34,.66],[.44,.52,.34,.66],[.66,.74,.34,.66]];
  for(const w of wells){cbgQ(g,G,[[w[2],0,w[0]],[w[3],0,w[0]],[w[3],0,w[1]],[w[2],0,w[1]]]);g.fillStyle=cnMix(L.shaft,'#ffffff',.5);g.fill();const c=P((w[2]+w[3])/2,0,(w[0]+w[1])/2);cnGlow(g,c[0],c[1],G.sc((w[0]+w[1])/2)*H*.2,L.shaft,.6);
    g.strokeStyle=cnMix(M(pal.wall2),'#000',.3);g.lineWidth=Math.max(2,u*3*G.sc(w[0]));cbgQ(g,G,[[w[2],0,w[0]],[w[3],0,w[0]],[w[3],0,w[1]],[w[2],0,w[1]]]);g.stroke();}
  /* banners / hangings on the side walls */
  if(st==='meridian'||st==='obsidian'){for(const sd of[0,1])bays.forEach((b,i)=>{if(i>2)return;const z0=b[1]-.02,z1=b[1]+.06,c=cnFac(st);cbgWallBanner(g,C,G,sd,z0,z1,.12,st==='obsidian'?.7:.62,cnMix(c.base,'#000',st==='obsidian'?.55:.15),c.light,seed+i+sd*9,st==='obsidian');});}
  /* back wall furniture: dais, throne / table / pedestal / monolith */
  hallBack(g,C,G,pal,st,L,seed,M);
  /* light shafts (additive) + the pools they leave on the floor */
  g.save();g.globalCompositeOperation='lighter';
  for(const w of wells){
    const d=dirL*.2,pts=[P(w[2],0,w[0]),P(w[3],0,w[0]),P(w[3],0,w[1]),P(w[2],0,w[1]),P(w[2]+d,1,w[0]+.06),P(w[3]+d,1,w[0]+.06),P(w[3]+d,1,w[1]+.1),P(w[2]+d,1,w[1]+.1)];
    const hull=cbgHull(pts),top=P((w[2]+w[3])/2,0,(w[0]+w[1])/2),bot=P((w[2]+w[3])/2+d,1,(w[0]+w[1])/2+.08);
    g.fillStyle=cnLG(g,top[0],top[1],bot[0],bot[1],[[0,cnA(L.shaft,L.a*.5)],[.6,cnA(L.shaft,L.a*.16)],[1,cnA(L.shaft,L.a*.06)]]);
    g.beginPath();hull.forEach((q,i)=>i?g.lineTo(q[0],q[1]):g.moveTo(q[0],q[1]));g.closePath();g.fill();
    cbgQ(g,G,[[w[2]+d,1,w[0]+.06],[w[3]+d,1,w[0]+.06],[w[3]+d,1,w[1]+.1],[w[2]+d,1,w[1]+.1]]);g.fillStyle=cnA(L.shaft,L.a*.32);g.fill();
  }
  g.restore();
  hallPillars(g,C,G,pal,st,L,seed,M,lt);
  /* style ambient: overall tint + near-edge falloff */
  g.fillStyle=cnA(L.amb,.1);g.fillRect(F.x,F.y,F.w,F.h);
  g.fillStyle=cnLG(g,0,F.y+F.h*.5,0,F.y+F.h,[[0,'rgba(0,0,0,0)'],[1,'rgba(0,0,0,.4)']]);g.fillRect(F.x,F.y+F.h*.5,F.w,F.h*.5);
};

/* convex hull of a few screen points (monotone chain) */
function cbgHull(pts){
  const p=pts.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]),cr=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]),lo=[],up=[];
  for(const q of p){while(lo.length>1&&cr(lo[lo.length-2],lo[lo.length-1],q)<=0)lo.pop();lo.push(q);}
  for(let i=p.length-1;i>=0;i--){const q=p[i];while(up.length>1&&cr(up[up.length-2],up[up.length-1],q)<=0)up.pop();up.push(q);}
  up.pop();lo.pop();return lo.concat(up);
}
/* dais, steps and what stands on them */
function hallBack(g,C,G,pal,st,L,seed,M){
  const{u,H}=C,P=G.P,B=G.B,bw=B.x1-B.x0,bh=B.y1-B.y0,sc=G.sc(.9)*H;
  /* wall feature behind the seat */
  if(st==='meridian'){
    const c=P(.5,.42,1),r=bh*.2;g.strokeStyle=cnA(pal.trim,.7);g.lineWidth=Math.max(1.5,u*2.5);g.beginPath();g.arc(c[0],c[1],r,0,TAU);g.stroke();g.beginPath();g.arc(c[0],c[1],r*.78,0,TAU);g.stroke();
    g.beginPath();g.moveTo(c[0]-r*.45,c[1]+r*.3);g.lineTo(c[0],c[1]-r*.5);g.lineTo(c[0]+r*.45,c[1]+r*.3);g.lineWidth=Math.max(2,u*4);g.stroke();
    cnGlow(g,c[0],c[1],r*2,pal.acc,.3);
    for(const sd of[-1,1]){const x=c[0]+sd*bw*.34;g.fillStyle=cnA(cnMix(pal.acc,'#000',.3),.9);g.fillRect(x-bw*.03,B.y0+bh*.05,bw*.06,bh*.5);g.fillStyle=cnA(pal.trim,.6);g.fillRect(x-bw*.03,B.y0+bh*.05,bw*.06,Math.max(1,u*1.5));}
  }else if(st==='obsidian'){
    const c=P(.5,.45,1),r=bh*.34;cnGlow(g,c[0],c[1],r*2.4,pal.acc,.5);
    g.strokeStyle=cnA(pal.acc,.5);g.lineWidth=Math.max(1.5,u*2.5);g.beginPath();for(let k=0;k<3;k++){const a=-Math.PI/2+k*TAU/3;g.moveTo(c[0]+Math.cos(a)*r*.2,c[1]+Math.sin(a)*r*.2);g.lineTo(c[0]+Math.cos(a)*r,c[1]+Math.sin(a)*r);}g.stroke();
    g.beginPath();g.arc(c[0],c[1],r*.8,0,TAU);g.stroke();
  }else if(st==='aurora'){
    const c=P(.5,.4,1),r=bh*.3;
    for(let k=0;k<12;k++){const a0=k/12*TAU,a1=(k+1)/12*TAU;g.fillStyle=cnA(k%3===0?pal.acc:k%3===1?'#e8fff6':'#ffe0a0',.5);g.beginPath();g.moveTo(c[0],c[1]);g.arc(c[0],c[1],r,a0,a1);g.closePath();g.fill();}
    g.strokeStyle=cnA(pal.wall2,.9);g.lineWidth=Math.max(1.5,u*2.4);g.beginPath();g.arc(c[0],c[1],r,0,TAU);g.stroke();for(let k=0;k<12;k++){g.moveTo(c[0],c[1]);g.lineTo(c[0]+Math.cos(k/12*TAU)*r,c[1]+Math.sin(k/12*TAU)*r);}g.stroke();
    cnGlow(g,c[0],c[1],r*1.8,pal.gem,.45);
  }else{
    const x0=B.x0+bw*.39,x1=B.x0+bw*.61,y0=B.y0+bh*.06,y1=B.y1;
    g.fillStyle=cnLG(g,x0,0,x1,0,[[0,cnMix(M(pal.wall2),'#000',.45)],[.5,cnMix(M(pal.wall),'#000',.15)],[1,cnMix(M(pal.wall2),'#000',.55)]]);
    g.beginPath();g.moveTo(x0,y1);g.lineTo(x0+(x1-x0)*.04,y0+bh*.06);g.lineTo(x0+(x1-x0)*.3,y0);g.lineTo(x0+(x1-x0)*.7,y0+bh*.03);g.lineTo(x1,y0+bh*.1);g.lineTo(x1,y1);g.closePath();g.fill();
    g.strokeStyle=cnA(pal.trim,.3);g.lineWidth=Math.max(1,u*1.5);g.beginPath();g.moveTo(x0,y0+bh*.2);g.lineTo(x1,y0+bh*.2);g.stroke();
    const c={x:(x0+x1)/2,y:y0+bh*.42},r=(x1-x0)*.32;
    g.save();g.globalCompositeOperation='lighter';g.strokeStyle=cnA(pal.acc,.8);g.lineWidth=Math.max(1.5,u*2.2);g.beginPath();g.arc(c.x,c.y,r,0,TAU);g.stroke();g.beginPath();g.arc(c.x,c.y,r*.62,0,TAU);g.stroke();
    for(let k=0;k<8;k++){const a=k/8*TAU;g.beginPath();g.moveTo(c.x+Math.cos(a)*r*.62,c.y+Math.sin(a)*r*.62);g.lineTo(c.x+Math.cos(a)*r*1.18,c.y+Math.sin(a)*r*1.18);g.stroke();}
    g.beginPath();g.moveTo(c.x,c.y-r*.4);g.lineTo(c.x+r*.35,c.y+r*.3);g.lineTo(c.x-r*.35,c.y+r*.3);g.closePath();g.stroke();
    g.fillStyle=cnA(pal.acc,.14);g.beginPath();g.arc(c.x,c.y,r*1.3,0,TAU);g.fill();g.restore();
    cnGlow(g,c.x,c.y,r*3,pal.acc,.3);
  }
  /* the dais: three low steps */
  const steps=[[.26,.74,.9,.8],[.3,.7,.85,.86],[.34,.66,.8,.92]];
  const col=(k)=>({front:cnMix(M(pal.wall),'#000',.35+k*.02),side:cnMix(M(pal.wall),'#000',.5),top:cnMix(M(pal.wall2),'#000',.15-k*.03)});
  steps.slice().reverse().forEach((s,i)=>{cbgBox3(g,C,G,s[0],s[1],s[2],1,s[3],.97,col(i),{side:false});const a=P(s[0],s[2],s[3]),b=P(s[1],s[2],s[3]);g.fillStyle=cnA(pal.trim,st==='forbidden'?.18:.45);g.fillRect(a[0],a[1],b[0]-a[0],Math.max(1,u*1.4));});
  const top=.8,zc=.945,c=P(.5,top,zc),S0=G.sc(zc)*H*.3;
  if(st==='meridian'){
    cbgBox3(g,C,G,.34,.66,.74,.8,.88,.95,{front:cnMix(M(pal.wall2),'#000',.35),side:cnMix(M(pal.wall2),'#000',.5),top:cnMix(M(pal.wall2),pal.trim,.1)},{side:false});
    for(let i=0;i<7;i++){const q=P(.37+.26*i/6,top,.975),sw=S0*.2;g.fillStyle=cnA('#070b14',.95);g.beginPath();g.moveTo(q[0]-sw*.5,q[1]);g.lineTo(q[0]-sw*.5,q[1]-sw*1.4);g.quadraticCurveTo(q[0],q[1]-sw*1.7,q[0]+sw*.5,q[1]-sw*1.4);g.lineTo(q[0]+sw*.5,q[1]);g.closePath();g.fill();g.fillStyle=cnA(pal.trim,.5);g.fillRect(q[0]-sw*.5,q[1]-sw*1.4,sw,Math.max(1,u*1.2));}
    cnGlow(g,c[0],c[1]-S0*.5,S0*1.2,pal.trim,.18,{squash:.5});
  }else if(st==='obsidian'){
    cnGlow(g,c[0],c[1]-S0*.8,S0*2.4,pal.acc,.5);
    const spk=[[-.24,0],[-.28,-1.15],[-.14,-.78],[-.11,-1.55],[0,-.95],[.11,-1.55],[.14,-.78],[.28,-1.15],[.24,0]];
    g.beginPath();spk.forEach((q,i)=>i?g.lineTo(c[0]+q[0]*S0,c[1]+q[1]*S0):g.moveTo(c[0]+q[0]*S0,c[1]+q[1]*S0));g.closePath();g.fillStyle=cnLG(g,0,c[1]-S0*1.5,0,c[1],[[0,'#1a1214'],[1,'#050304']]);g.fill();
    g.strokeStyle=cnA(pal.acc,.7);g.lineWidth=Math.max(1,u*1.5);g.stroke();
    g.fillStyle='#08050a';g.fillRect(c[0]-S0*.34,c[1]-S0*.34,S0*.68,S0*.34);g.fillStyle=cnA(pal.acc,.5);g.fillRect(c[0]-S0*.34,c[1]-S0*.34,S0*.68,Math.max(1,u*1.5));
    for(const sd of[-1,1]){const x=c[0]+sd*S0*.78;g.fillStyle='#08050a';g.fillRect(x-S0*.04,c[1]-S0*.62,S0*.08,S0*.62);g.beginPath();g.moveTo(x-S0*.17,c[1]-S0*.62);g.lineTo(x+S0*.17,c[1]-S0*.62);g.lineTo(x+S0*.1,c[1]-S0*.46);g.lineTo(x-S0*.1,c[1]-S0*.46);g.closePath();g.fill();cnGlow(g,x,c[1]-S0*.7,S0*.9,'#ff7a30',.4);}
  }else if(st==='aurora'){
    g.fillStyle=cnLG(g,c[0]-S0*.3,0,c[0]+S0*.3,0,[[0,M(pal.wall2)],[.5,M('#ffffff')],[1,M(pal.wall)]]);g.fillRect(c[0]-S0*.3,c[1]-S0*.2,S0*.6,S0*.2);cbgEll(g,c[0],c[1]-S0*.2,S0*.3,S0*.07);g.fill();
    for(let i=0;i<7;i++){const k=i/6-.5,hh=S0*(.7+.5*(1-Math.abs(k)*1.4))*(.8+.3*cnR(seed,i,3)),x=c[0]+k*S0*.9,w=S0*.1;
      g.fillStyle=cnLG(g,x-w,0,x+w,0,[[0,cnA(pal.wall2,.9)],[.5,cnA(pal.gem,.85)],[1,cnA(pal.wall,.8)]]);cbgPoly(g,[x-w,c[1]-S0*.2,x-w*.5,c[1]-S0*.2-hh*.82,x,c[1]-S0*.2-hh,x+w*.5,c[1]-S0*.2-hh*.82,x+w,c[1]-S0*.2]);g.fill();
      g.strokeStyle=cnA('#fff',.6);g.lineWidth=Math.max(1,u);g.stroke();}
    cnGlow(g,c[0],c[1]-S0*.7,S0*1.5,pal.gem,.5);
  }else{
    g.save();g.globalCompositeOperation='lighter';g.strokeStyle=cnA(pal.acc,.6);g.lineWidth=Math.max(1,u*1.5);
    cbgEll(g,c[0],c[1]+S0*.02,S0*.9,S0*.18);g.stroke();cbgEll(g,c[0],c[1]+S0*.02,S0*.55,S0*.11);g.stroke();g.restore();
  }
}
/* pillars, rib rings, braziers, chains: far to near */
function hallPillars(g,C,G,pal,st,L,seed,M,lt){
  const{u,H}=C,P=G.P,zs=[.8,.58,.36,.14,-.06],rw=st==='aurora'?.022:st==='obsidian'?.036:st==='forbidden'?.032:.03,pp=Object.assign({},pal,{glow:pal.trim,wall:M(pal.wall),wall2:M(pal.wall2)});
  /* reflections in the floor first */
  g.save();cbgQ(g,G,[[0,1,G.zN],[1,1,G.zN],[1,1,1],[0,1,1]]);g.clip();g.globalAlpha=st==='aurora'?.28:st==='forbidden'?.1:.16;
  for(const z of zs)for(const uu of[.085,.915])cbgPillar(g,C,G,uu,z,rw,pp,st,L,seed+Math.round(z*100),true);
  g.restore();
  [.69,.47,.25,.03].concat(zs).sort((a,b)=>b-a).forEach(z=>{
    const isP=zs.includes(z);
    if(!isP||st==='aurora')cbgRibRing(g,C,G,z,.04+.01*(1-G.sc(z)),pp,st==='aurora'?'aurora':st==='obsidian'?'obsidian':'meridian',seed,cnLG(g,P(0,0,z)[0],0,P(1,0,z)[0],0,[[0,cnMix(M(pal.wall2),'#000',.5)],[.5,cnMix(M(pal.wall2),'#000',.25)],[1,cnMix(M(pal.wall2),'#000',.5)]]));
    if(isP)for(const uu of[.085,.915])cbgPillar(g,C,G,uu,z,rw,pp,st,L,seed+Math.round(z*100)+(uu>.5?3:0),false);
  });
  if(st==='obsidian'){for(const z of[.74,.56,.38])for(const sd of[.2,.8]){const c=P(sd,1,z),s=G.sc(z)*H*.16;
    g.fillStyle='#0a0608';g.fillRect(c[0]-s*.06,c[1]-s*.9,s*.12,s*.9);g.beginPath();g.moveTo(c[0]-s*.3,c[1]-s*.9);g.lineTo(c[0]+s*.3,c[1]-s*.9);g.lineTo(c[0]+s*.2,c[1]-s*.62);g.lineTo(c[0]-s*.2,c[1]-s*.62);g.closePath();g.fill();
    cnGlow(g,c[0],c[1]-s*1.0,s*2.2,'#ff7a30',.4);cnGlow(g,c[0],c[1],s*1.4,'#ff7a30',.2,{squash:.25});}}
  if(st==='forbidden'){
    /* the oculus beam: one cold shaft from the vault to the floor, and chains */
    const a1=P(.46,0,.58),a2=P(.54,0,.58),b1=P(.4,1,.56),b2=P(.6,1,.56);g.save();g.globalCompositeOperation='lighter';
    g.fillStyle=cnLG(g,0,a1[1],0,b1[1],[[0,cnA(L.shaft,.0)],[.15,cnA(L.shaft,.2*L.a)],[1,cnA(L.shaft,.06*L.a)]]);g.beginPath();g.moveTo(a1[0],a1[1]);g.lineTo(a2[0],a2[1]);g.lineTo(b2[0],b2[1]);g.lineTo(b1[0],b1[1]);g.closePath();g.fill();
    const fc=P(.5,1,.56);g.fillStyle=cnRG(g,fc[0],fc[1],0,(b2[0]-b1[0])*.5,[[0,cnA(L.shaft,.35*L.a)],[1,cnA(L.shaft,0)]]);g.save();g.translate(fc[0],fc[1]);g.scale(1,.2);g.translate(-fc[0],-fc[1]);g.fillRect(b1[0],fc[1]-(b2[0]-b1[0])*.5,b2[0]-b1[0],b2[0]-b1[0]);g.restore();g.restore();
    g.strokeStyle='rgba(8,8,12,.9)';g.lineWidth=Math.max(1,u*1.6);for(const q of[[.2,.7],[.78,.62],[.3,.4],[.7,.34],[.5,.22]]){const a=P(q[0],0,q[1]),len=(P(q[0],.45,q[1])[1]-a[1]);g.beginPath();g.moveTo(a[0],a[1]);g.lineTo(a[0],a[1]+len);g.stroke();g.setLineDash([Math.max(2,u*3),Math.max(2,u*3)]);g.lineWidth=Math.max(2,u*3);g.stroke();g.setLineDash([]);g.lineWidth=Math.max(1,u*1.6);}
  }
  if(st==='aurora'){g.save();g.globalCompositeOperation='lighter';for(let i=0;i<7;i++){const q=P(.2+.6*cnR(seed,i,3),0,.15+.7*cnR(seed,i,4)),s=G.sc(.5)*H*.03*(.5+cnR(seed,i,5));
      g.fillStyle=cnLG(g,0,q[1],0,q[1]+s*4,[[0,cnA(pal.gem,.7)],[1,cnA(pal.gem,0)]]);cbgPoly(g,[q[0]-s*.5,q[1],q[0]+s*.5,q[1],q[0],q[1]+s*4]);g.fill();cnGlow(g,q[0],q[1]+s,s*4,pal.gem,.3);}g.restore();}
}
HALL.static=true;
HALL.anim=(g,W,H,p,t,seed,S)=>{
  const st=CBG_HL[p.style]?p.style:'meridian',lt=CBG_HLIGHT[p.light]?p.light:'cold',pal=CBG_HL[st],L=CBG_HLIGHT[lt],G=cbgRoomGeo(W,H,{rho:.46,vy:.47}),u=S.u,P=G.P,sp=S.rm?.3:1;
  g.save();g.globalCompositeOperation='lighter';
  /* dust in the light */
  const n=cnN(st==='forbidden'?46:34,S),lit=st==='meridian'||st==='aurora'?[0,1]:[cnR(seed,5,5)<.5?0:1];
  for(let i=0;i<n;i++){
    const sd=lit[i%lit.length],dir=sd?-1:1,ph=cnPhase(t*sp,14+cnR(seed,i,3)*10,i,seed),uu=st==='forbidden'?.4+.2*cnR(seed,i,1):sd+dir*(.04+.3*cnR(seed,i,1)),zz=.1+.8*cnR(seed,i,2),vv=st==='forbidden'?ph:.25+.75*ph;
    if(st!=='forbidden'&&vv<.3)continue;const q=P(uu+Math.sin(ph*9+i)*.01,vv,zz),r=G.sc(zz)*u*(1+1.6*cnR(seed,i,4)),a=Math.sin(ph*Math.PI)*.5*L.a;
    g.fillStyle=cnA(L.shaft,a);g.beginPath();g.arc(q[0],q[1],r,0,TAU);g.fill();}
  /* style pulses */
  const B=G.B,bw=B.x1-B.x0,bh=B.y1-B.y0;
  if(st==='obsidian'){for(const z of[.74,.56,.38])for(const sd of[.2,.8]){const c=P(sd,1,z),s=G.sc(z)*H*.16,fl=cnFlicker(t*sp,seed+Math.round(z*50)+sd*9,9),fl2=cnFlicker(t*sp,seed+Math.round(z*70)+sd*5,13);
      for(let j=0;j<3;j++){const hh=s*([1.0,.74,.5][j])*(.8+.4*[fl,fl2,fl][j]),w=s*[.26,.17,.1][j];g.fillStyle=cnLG(g,0,c[1]-s*.62-hh,0,c[1]-s*.62,[[0,cnA(j?'#fff0b0':'#ff5a20',0)],[.5,cnA(j?'#ffc060':'#ff6a20',.6)],[1,cnA(j?'#fff0b0':'#ffb050',.9)]]);
        g.beginPath();g.moveTo(c[0]-w,c[1]-s*.62);g.quadraticCurveTo(c[0]-w*.4+(fl-.5)*w,c[1]-s*.62-hh*.5,c[0]+(fl2-.5)*w*.5,c[1]-s*.62-hh);g.quadraticCurveTo(c[0]+w*.4,c[1]-s*.62-hh*.5,c[0]+w,c[1]-s*.62);g.closePath();g.fill();}
      cnGlow(g,c[0],c[1]-s*.9,s*(2+.5*fl),'#ff8a3a',.2+.2*fl);}
    const tc=P(.5,.8,.945),S0=G.sc(.945)*H*.3;cnGlow(g,tc[0],tc[1]-S0*.8,S0*(2.4+.2*Math.sin(t*sp*1.4)),pal.acc,.12+.06*Math.sin(t*sp*1.4));}
  else if(st==='forbidden'){const x0=B.x0+bw*.39,x1=B.x0+bw*.61,c={x:(x0+x1)/2,y:B.y0+bh*.06+bh*.42},r=(x1-x0)*.32,k=.5+.5*Math.sin(t*sp*1.1);
    cnGlow(g,c.x,c.y,r*2.6,pal.acc,.14+.18*k);g.strokeStyle=cnA(pal.trim,.3+.3*k);g.lineWidth=Math.max(1,u*1.4);g.beginPath();g.arc(c.x,c.y,r*(1.05+.04*k),0,TAU);g.stroke();
    for(let i=0;i<5;i++){const ph=cnPhase(t*sp,6,i,seed),a=cnR(seed,i,7)*TAU;cnGlow(g,c.x+Math.cos(a)*r*(1.2+ph),c.y+Math.sin(a)*r*(1.2+ph)-ph*r,u*5,pal.acc,(1-ph)*.5);}}
  else if(st==='aurora'){const c=P(.5,.4,1),r=bh*.3,k=.5+.5*Math.sin(t*sp*1.3);cnGlow(g,c[0],c[1],r*(1.6+.2*k),pal.gem,.12+.14*k);
    const tc=P(.5,.8,.945),S0=G.sc(.945)*H*.3,oy=tc[1]-S0*(1.5+.08*Math.sin(t*sp*1.7));cnGlow(g,tc[0],oy,S0*.7,'#ffffff',.5,{core:.8});g.strokeStyle=cnA('#ffffff',.55);g.lineWidth=Math.max(1,u*1.2);g.beginPath();g.ellipse(tc[0],oy,S0*.24,S0*.06,t*sp*.8,0,TAU);g.stroke();}
  else{const c=P(.5,.42,1),r=bh*.2,k=.5+.5*Math.sin(t*sp*1.2);cnGlow(g,c[0],c[1],r*(1.8+.1*k),pal.acc,.14+.08*k);}
  g.restore();
};
CINE_PAINT.bg.hall=HALL;

/*@@END@@*/
})();
