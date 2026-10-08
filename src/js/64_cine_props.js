/* =========================================================================
   CINEMATIC ART (props) — CINE_PAINT.prop.ship / unit / building / planet / moon / station / beacon / crystal / array / banner / holo / crowd.
   Contract: docs/CINEMATIC_SPEC.md §5.5.  Loads after 64_cine_art.js (registry, cn* helpers, palettes) and before 65_cine_fx.js / 66_cine.js.
   RENDERING ONLY and PURE: every painter is a function of (params, t, seed, S) — no Math.random, Date or performance.now, nothing carried between frames. Caches below hold
   pure functions of their key only (a baked planet texture, per-type unit extents) so a cold cache draws the identical picture.
   One look for all props: layered painterly vector, ONE key light (S.key, transformed into the prop's local frame so the lit side stays right after the engine has rotated
   and mirrored the layer), rim light on the lit edge, dark ink outline like the game's own sprites, additive glow for engines/windows/lamps, faction colour language
   (Meridian steel-blue + clean plates, Obsidian black-red + ember seams + blades, Aurora pearl + teal + curves), and the game's own art (artUnit / artBuilding) for
   units and buildings. Helpers are prefixed `cpr` and live in this IIFE. Sizes follow `size` (= H*.25*scale) and S.u (= H/540).
   ========================================================================= */
(()=>{
'use strict';

/* ------------------------------------------------ 1. shared helpers ------------------------------------------------ */
const cprC=(v,a,b)=>v<a?a:v>b?b:v;
const cprL=(a,b,t)=>a+(b-a)*t;
/* the key light as seen from the prop's own (rotated, mirrored, zoomed) frame: a unit vector pointing TO the light, plus its colour and strength */
function cprLight(g,x,y,S){
  S=S||{W:1280,H:720};const k=S.key;let lx=-.55,ly=-.8;const col=(k&&k.col)||'#cfe0ff',a=k&&k.a!=null?k.a:.5;
  try{
    const m=g.getTransform(),sx=m.a*x+m.c*y+m.e,sy=m.b*x+m.d*y+m.f;
    let dx=(k?k.x*S.W:S.W*.3)-sx,dy=(k?k.y*S.H:-S.H*.2)-sy;const d=Math.hypot(dx,dy);
    if(d>S.H*.03){dx/=d;dy/=d;const det=m.a*m.d-m.b*m.c;if(Math.abs(det)>1e-9){lx=(m.d*dx-m.c*dy)/det;ly=(-m.b*dx+m.a*dy)/det;const l=Math.hypot(lx,ly)||1;lx/=l;ly/=l;}}
  }catch(e){}
  return{x:lx,y:ly,col,a};
}
function cprSm(g,P,closed,k){                                                  // smooth closed/open curve through flat points [x0,y0,x1,y1,...] (Catmull-Rom as cubic Beziers)
  const n=P.length/2;k=k==null?1:k;g.beginPath();g.moveTo(P[0],P[1]);
  const at=i=>closed?((i%n)+n)%n:(i<0?0:i>n-1?n-1:i),segs=closed?n:n-1;
  for(let i=0;i<segs;i++){
    const a=at(i-1),b=at(i),c=at(i+1),d=at(i+2);
    g.bezierCurveTo(P[b*2]+(P[c*2]-P[a*2])*k/6,P[b*2+1]+(P[c*2+1]-P[a*2+1])*k/6,P[c*2]-(P[d*2]-P[b*2])*k/6,P[c*2+1]-(P[d*2+1]-P[b*2+1])*k/6,P[c*2],P[c*2+1]);
  }
  if(closed)g.closePath();
}
function cprPoly(g,P,open){g.beginPath();g.moveTo(P[0],P[1]);for(let i=2;i<P.length;i+=2)g.lineTo(P[i],P[i+1]);if(!open)g.closePath();}
/* gradient whose first stop is on the lit side of the box (x0,y0)-(x1,y1) */
function cprLit(g,L,x0,y0,x1,y1,stops){
  const cx=(x0+x1)/2,cy=(y0+y1)/2,ex=Math.abs(L.x)*(x1-x0)/2+Math.abs(L.y)*(y1-y0)/2+1e-4;
  return cnLG(g,cx+L.x*ex,cy+L.y*ex,cx-L.x*ex,cy-L.y*ex,stops);
}
const cprBox=P=>{let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(let i=0;i<P.length;i+=2){if(P[i]<x0)x0=P[i];if(P[i]>x1)x1=P[i];if(P[i+1]<y0)y0=P[i+1];if(P[i+1]>y1)y1=P[i+1];}return{x0,y0,x1,y1};};
const cprDark=c=>cnMix(c,'#05070d',.55);

/* faction hull palettes: hi (lit plating) > mid > lo (shadow plating) > deep (belly / interior); glass [bright, mid, dark]; eng = exhaust colour, core = hot core, win = window light */
const CPR_PAL={
  meridian:{hi:'#e8f0fc',mid:'#8fa5c8',lo:'#36486a',deep:'#141d31',glass:['#d4f6ff','#3f8cc0','#0c2943'],eng:'#8fcfff',core:'#f0f8ff',win:'#ffe0a0'},
  obsidian:{hi:'#9a6672',mid:'#4e343d',lo:'#28191f',deep:'#0c0709',glass:['#ffb090','#b02e24','#380806'],eng:'#ff7a3a',core:'#ffe2b4',win:'#ff6040'},
  aurora  :{hi:'#fdfffe',mid:'#c4e0da',lo:'#648f8d',deep:'#1d3d40',glass:['#effffa','#5fdcc4','#10564f'],eng:'#6dffdc',core:'#f4fffc',win:'#d8fff4'}
};
function cprPal(f,col){
  const b=CPR_PAL[f]||CPR_PAL.meridian,c=cnFac(CPR_PAL[f]?f:'meridian'),tr=col||c.base;
  const o=Object.assign({},b,{trim:tr,trimHi:col?cnShade(col,.42):c.light,trimLo:col?cnShade(col,-.5):c.dark,glow:col||c.glow,out:'rgba(5,9,16,.88)'});
  if(col)o.eng=cnMix(b.eng,col,.55);
  return o;
}
const cprFar=P=>({hi:cnMix(P.hi,P.deep,.55),mid:cnMix(P.mid,P.deep,.6),lo:cnMix(P.lo,P.deep,.55),deep:P.deep,glass:P.glass,eng:P.eng,core:P.core,win:P.win,trim:cnMix(P.trim,P.deep,.5),trimHi:cnMix(P.trimHi,P.deep,.5),trimLo:P.trimLo,glow:P.glow,out:P.out});

/* a lit body: shaded fill along the light, optional clipped inner detail, rim light on the lit edge, ink outline. K = painter kit {g,L,P,lw,...}; returns its bbox */
function cprHull(K,pts,o){
  o=o||{};const g=K.g,L=K.L,P=o.pal||K.P,B=cprBox(pts);
  if(K.xr&&(B.x1<K.xr[0]||B.x0>K.xr[1]))return B;                                                                // wreck pieces draw only the parts of the hull inside their slice
  const path=()=>o.sharp?cprPoly(g,pts):cprSm(g,pts,true,o.k);
  const ka=L.a,hi=cnMix(P.hi,L.col,.16*ka),rw=o.rim==null?.0075:o.rim;
  g.save();path();
  g.fillStyle=cprLit(g,L,B.x0,B.y0,B.x1,B.y1,[[0,hi],[.34,P.mid],[.74,P.lo],[1,P.deep]]);g.fill();
  g.clip();
  if(o.inner)o.inner(B);
  if(K.wr)cprWreck(K,B);
  if(rw>0){g.save();g.translate(-L.x*rw,-L.y*rw);path();g.lineWidth=rw*1.9;g.strokeStyle=cnA(L.col,cprC(.16+.5*ka,0,.7));g.stroke();g.restore();}
  g.restore();
  if(!o.noOutline){path();g.lineWidth=K.lw;g.strokeStyle=P.out;g.stroke();}
  return B;
}
/* wreck pass (inside a hull's own clip): soot, scorch marks, and the torn edges of the break (shadowed depth, bare rim, hot metal) */
function cprWreck(K,B){
  const g=K.g,sd=K.seed;
  g.fillStyle='rgba(8,6,6,.34)';g.fillRect(B.x0,B.y0,B.x1-B.x0,B.y1-B.y0);
  for(let i=0;i<3;i++){const sx=B.x0+cnR(sd,i,21)*(B.x1-B.x0),sy=B.y0+cnR(sd,i,22)*(B.y1-B.y0),r=.04+.05*cnR(sd,i,23);g.fillStyle=cnRG(g,sx,sy,0,r,[[0,'rgba(0,0,0,.5)'],[1,'rgba(0,0,0,0)']]);g.fillRect(sx-r,sy-r,r*2,r*2);}
  if(B.x1-B.x0>.25)for(let i=0;i<2;i++){                                                                       // breaches: dark holes with a hot rim
    const bx=B.x0+(.2+.6*cnR(sd,i,24))*(B.x1-B.x0),by=B.y0+(.3+.4*cnR(sd,i,25))*(B.y1-B.y0),r=.016+.016*cnR(sd,i,26),pts=[];
    for(let k=0;k<7;k++){const a=k/7*TAU,rr=r*(.55+.9*cnR(sd,i*9+k,27));pts.push(bx+Math.cos(a)*rr*1.5,by+Math.sin(a)*rr);}
    cprPoly(g,pts);g.fillStyle='#07060a';g.fill();g.lineWidth=.004;g.strokeStyle='rgba(255,130,60,.8)';g.stroke();g.lineWidth=.011;g.strokeStyle='rgba(255,120,50,.18)';g.stroke();}
  for(const J of K.wr.J){
    g.beginPath();g.moveTo(J[0][0],J[0][1]);for(const q of J)g.lineTo(q[0],q[1]);
    g.lineWidth=.05;g.strokeStyle='rgba(6,4,4,.85)';g.stroke();g.lineWidth=.016;g.strokeStyle='rgba(70,50,44,.9)';g.stroke();
    g.lineWidth=.006;g.strokeStyle=cnA('#ff8a40',.65+.25*cnFlicker(K.t,sd+J.length,7));g.stroke();
  }
}
/* seeded panel seams (clipped by the caller's current clip) */
function cprSeams(K,B,nx,ny,a,salt){
  const g=K.g,s=K.seed+(salt|0),lw=K.lw*.7,hx=K.L.x>0?lw:-lw,xs=[];
  for(let i=1;i<nx;i++)xs.push([B.x0+(B.x1-B.x0)*(i+(cnR(s,i,1)-.5)*.5)/nx,(cnR(s,i,2)-.5)*.02]);
  g.save();g.lineWidth=lw;g.strokeStyle='rgba(6,10,20,'+a+')';g.beginPath();
  for(const q of xs){g.moveTo(q[0],B.y0);g.lineTo(q[0]+q[1],B.y1);}
  for(let j=1;j<ny;j++){const y=B.y0+(B.y1-B.y0)*(j+(cnR(s,j,3)-.5)*.4)/ny;g.moveTo(B.x0,y);g.lineTo(B.x1,y+(cnR(s,j,4)-.5)*.01);}
  g.stroke();g.strokeStyle=cnA(K.L.col,.08+.1*K.L.a);g.beginPath();                                          // faint highlight beside each seam, on the lit side
  for(const q of xs){g.moveTo(q[0]+hx,B.y0);g.lineTo(q[0]+q[1]+hx,B.y1);}
  g.stroke();g.restore();
}
/* a row of windows; pOn = share lit; col = light colour */
function cprWin(K,x0,x1,y,n,w,h,col,pOn,salt){
  const g=K.g;
  for(let i=0;i<n;i++){
    const x=x0+(x1-x0)*(i+.5)/n,on=cnR(K.seed+(salt|0),i,31)<pOn,fl=on?(.8+.2*cnFlicker(K.t*.3+i,K.seed+i,2)):0;
    g.fillStyle=on?cnA(col,.55+.45*fl):'rgba(8,12,22,.6)';g.fillRect(x-w/2,y-h/2,w,h);
  }
  g.save();g.globalCompositeOperation='lighter';g.fillStyle=cnA(col,.1);g.fillRect(x0-w,y-h*1.6,x1-x0+w*2,h*3.2);g.restore();
}
/* blinking navigation light */
function cprNav(K,x,y,col,per,on,ph){
  if(K.dead)return;
  const k=K.rm?.55:(cnFrac((K.t+ph)/per)<on?1:.12);
  K.g.save();K.g.globalCompositeOperation='lighter';cnGlow(K.g,x,y,Math.max(.011,3*K.u/K.len)*(k>.5?1.6:1),col,.15+.7*k,{core:k>.5?.7:0});K.g.restore();
}
/* engine: bell + exhaust plume trailing toward -x + glow. r = half height of the exit; o = {len, thrust, i, col, core, bell} */
function cprEngine(K,x,y,r,o){
  if(K.xr&&(x>K.xr[1]+.05||x<K.xr[0]-.25))return;
  o=o||{};const g=K.g,P=o.pal||K.P,th=o.thrust==null?K.thrust:o.thrust,col=o.col||P.eng,core=o.core||P.core,fl=.86+.14*cnFlicker(K.t,K.seed+(o.i|0)*17,24);
  if(th>.02&&!K.dead){
    const Ln=r*(o.len||8)*(.35+.9*th)*fl,wd=r*(.75+.25*th);
    g.save();g.globalCompositeOperation='lighter';
    g.fillStyle=cnLG(g,x,0,x-Ln,0,[[0,cnA(col,.7)],[.3,cnA(col,.34)],[1,cnA(col,0)]]);
    g.beginPath();g.moveTo(x,y-wd);g.quadraticCurveTo(x-Ln*.5,y-wd*1.25,x-Ln,y);g.quadraticCurveTo(x-Ln*.5,y+wd*1.25,x,y+wd);g.closePath();g.fill();
    g.fillStyle=cnLG(g,x,0,x-Ln*.62,0,[[0,cnA(core,.95)],[.4,cnA(col,.5)],[1,cnA(col,0)]]);
    g.beginPath();g.moveTo(x,y-wd*.5);g.quadraticCurveTo(x-Ln*.3,y-wd*.45,x-Ln*.62,y);g.quadraticCurveTo(x-Ln*.3,y+wd*.45,x,y+wd*.5);g.closePath();g.fill();
    cnGlow(g,x-r*.4,y,r*(2.6+2.2*th),col,.55+.3*th,{core:.8});
    g.restore();
  }
  if(o.bell!==false){                                                         // nozzle bell (flaring to the rear), drawn over the plume root
    g.save();g.beginPath();g.moveTo(x+r*1.5,y-r*.7);g.lineTo(x+r*.05,y-r*1.05);g.lineTo(x+r*.05,y+r*1.05);g.lineTo(x+r*1.5,y+r*.7);g.closePath();
    g.fillStyle=cnLG(g,0,y-r,0,y+r,[[0,cnShade(P.mid,.15)],[.5,P.lo],[1,P.deep]]);g.fill();g.lineWidth=K.lw*.9;g.strokeStyle=P.out;g.stroke();
    g.fillStyle=cnA(P.hi,.35);g.fillRect(x+r*.05,y-r*1.0,r*1.4,r*.2);g.restore();
  }
}

/* ------------------------------------------------ 2. ships (side-on, facing +x, unit space: length 1, nose at +.5) ------------------------------------------------ */
const CPR_SHIPLEN={shuttle:.7,dropship:1,frigate:1.55,carrier:2.5,wreck:1.5};
const SHIP={};

/* ---- dropship ---- */
SHIP.dropship={};
SHIP.dropship.meridian=K=>{
  const g=K.g,P=K.P,fp=K.fP;
  /* far side: pylon, nacelle, tail fin, darker */
  cprHull(K,[-.01,-.12,.1,-.12,-.03,-.25,-.15,-.25],{pal:fp,sharp:true,rim:0});
  cprEngine(K,-.235,-.285,.026,{pal:fp,i:1,thrust:K.thrust*.85});
  cprHull(K,[-.23,-.318,.0,-.318,.02,-.3,.02,-.255,-.0,-.24,-.23,-.24,-.245,-.255,-.245,-.3],{pal:fp,rim:0,k:.7});
  cprHull(K,[-.5,-.07,-.5,-.23,-.41,-.21,-.34,-.12],{pal:fp,sharp:true,rim:0});
  /* fuselage */
  cprHull(K,[-.5,-.075,-.44,-.122,-.3,-.138,-.05,-.142,.15,-.132,.32,-.098,.44,-.046,.508,.022,.47,.076,.36,.116,.15,.14,-.1,.15,-.32,.136,-.46,.106,-.5,.04],{k:.95,inner:B=>{
    g.fillStyle=cnA(K.P.trim,.9);g.fillRect(-.5,.018,.84,.03);g.fillStyle=cnA(K.P.trimHi,.7);g.fillRect(-.5,.018,.84,.006);
    g.fillStyle=cnA(K.P.deep,.35);g.fillRect(-.5,.1,1.1,.06);
    cprSeams(K,B,7,2,.5,1);
    g.strokeStyle='rgba(6,10,20,.7)';g.lineWidth=K.lw*.9;g.strokeRect(-.11,-.085,.15,.15);g.beginPath();g.moveTo(-.035,-.085);g.lineTo(-.035,.065);g.stroke();
    g.fillStyle=K.P.trim;g.beginPath();g.arc(-.3,-.045,.026,0,TAU);g.fill();g.strokeStyle=K.P.out;g.lineWidth=K.lw*.8;g.stroke();g.fillStyle=cnA('#fff',.8);g.fillRect(-.31,-.06,.02,.03);
    cprWin(K,.1,.2,-.02,3,.022,.016,K.P.win,.8,3);
  }});
  /* canopy */
  g.save();cprSm(g,[.435,-.048,.37,-.092,.285,-.116,.245,-.098,.31,-.05,.4,-.026],true,1);
  g.fillStyle=cnLG(g,.25,-.12,.4,-.02,[[0,K.P.glass[0]],[.45,K.P.glass[1]],[1,K.P.glass[2]]]);g.fill();g.clip();
  g.fillStyle='rgba(255,255,255,.4)';g.beginPath();g.moveTo(.27,-.108);g.lineTo(.36,-.088);g.lineTo(.33,-.08);g.lineTo(.26,-.098);g.closePath();g.fill();g.restore();
  cprSm(g,[.435,-.048,.37,-.092,.285,-.116,.245,-.098,.31,-.05,.4,-.026],true,1);g.lineWidth=K.lw*.9;g.strokeStyle=K.P.out;g.stroke();
  /* near tail fin, pylon and engine nacelle */
  cprHull(K,[-.5,-.075,-.5,-.235,-.41,-.215,-.33,-.125],{sharp:true,inner:B=>{g.fillStyle=cnA(K.P.trim,.9);g.fillRect(B.x0,B.y0,.05,B.y1-B.y0);}});
  cprHull(K,[.0,-.125,.12,-.125,-.02,-.265,-.15,-.265],{sharp:true,inner:B=>cprSeams(K,B,2,2,.5,5)});
  cprHull(K,[-.25,-.328,.0,-.332,.03,-.31,.035,-.268,.0,-.248,-.25,-.248,-.265,-.268,-.265,-.31],{k:.7,inner:B=>{g.fillStyle=cnA(K.P.trim,.85);g.fillRect(B.x0,-.298,B.x1-B.x0,.014);cprSeams(K,B,4,1,.45,9);}});
  cprEngine(K,-.268,-.289,.03,{i:2});
  cprEngine(K,-.5,.02,.024,{i:3,thrust:K.thrust*.7,len:6});
  cprNav(K,-.452,-.21,'#ff4a3a',1.9,.18,.2);cprNav(K,.49,.03,'#4aff8a',1.9,.18,.2);cprNav(K,-.1,.146,'#ffffff',1.4,.08,.6);
};
SHIP.dropship.obsidian=K=>{
  const g=K.g,P=K.P,fp=K.fP;
  cprHull(K,[.0,-.11,-.2,-.28,-.3,-.25,-.24,-.12],{pal:fp,sharp:true,rim:0});                                 // far dorsal blade
  cprHull(K,[-.12,.12,-.27,.25,-.36,.2,-.3,.1],{pal:fp,sharp:true,rim:0});                                     // far ventral blade
  cprHull(K,[-.5,-.065,-.4,-.13,-.12,-.125,.1,-.118,.34,-.05,.525,.016,.36,.078,.12,.118,-.18,.158,-.46,.115],{sharp:true,inner:B=>{
    g.strokeStyle=cnA(K.P.trim,.9);g.lineWidth=K.lw*1.4;g.beginPath();g.moveTo(-.46,-.09);g.lineTo(-.1,-.095);g.lineTo(.22,-.07);g.lineTo(.46,.0);g.stroke();
    g.beginPath();g.moveTo(-.42,.105);g.lineTo(-.1,.12);g.lineTo(.25,.065);g.stroke();
    g.fillStyle=cnA(K.P.deep,.5);g.fillRect(-.5,.07,1.1,.1);cprSeams(K,B,8,2,.6,2);
    g.fillStyle=cnA(K.P.glow,.7);for(let i=0;i<4;i++){g.fillRect(-.3+i*.038,-.032,.022,.01);}                    // vent slits
    g.fillStyle=cnA(K.P.trimHi,.35);g.beginPath();g.moveTo(.12,-.118);g.lineTo(.34,-.05);g.lineTo(.3,-.045);g.lineTo(.1,-.1);g.closePath();g.fill();
  }});
  g.save();cprPoly(g,[.3,-.05,.42,-.01,.36,-.002,.26,-.03]);g.fillStyle=cnLG(g,.26,-.05,.4,0,[[0,K.P.glass[0]],[.5,K.P.glass[1]],[1,K.P.glass[2]]]);g.fill();g.lineWidth=K.lw*.8;g.strokeStyle=K.P.out;g.stroke();g.restore();
  cprHull(K,[.02,-.115,-.22,-.115,-.34,-.34,-.2,-.31,-.06,-.2],{sharp:true,inner:B=>{g.strokeStyle=cnA(K.P.trim,.95);g.lineWidth=K.lw*1.3;g.beginPath();g.moveTo(-.2,-.13);g.lineTo(-.31,-.32);g.stroke();cprSeams(K,B,3,3,.55,4);}});
  cprHull(K,[-.1,.125,-.3,.125,-.4,.265,-.26,.25],{sharp:true,inner:B=>{g.strokeStyle=cnA(K.P.trim,.9);g.lineWidth=K.lw*1.2;g.beginPath();g.moveTo(-.22,.14);g.lineTo(-.34,.255);g.stroke();}});
  cprEngine(K,-.5,-.035,.022,{i:1,len:9,bell:false});cprEngine(K,-.5,.035,.022,{i:2,len:9,bell:false});
  g.fillStyle=cnA(K.P.glow,.9);g.fillRect(-.505,-.06,.012,.1);
  cprNav(K,-.3,-.335,'#ff3a2a',1.6,.3,.1);cprNav(K,.5,.016,'#ff6a3a',2.2,.2,.7);
};
SHIP.dropship.aurora=K=>{
  const g=K.g,P=K.P,fp=K.fP;
  cprHull(K,[-.02,-.1,-.12,-.2,-.3,-.29,-.47,-.31,-.33,-.25,-.2,-.16,-.15,-.1],{pal:fp,rim:0,k:.8});
  cprHull(K,[-.52,-.012,-.4,-.058,-.2,-.103,.06,-.112,.3,-.077,.46,-.022,.528,.018,.44,.062,.28,.097,.02,.116,-.24,.102,-.42,.062],{k:1,inner:B=>{
    g.strokeStyle=cnA(K.P.trim,.95);g.lineWidth=K.lw*1.6;g.beginPath();g.moveTo(.42,.0);g.bezierCurveTo(.2,.03,-.1,.045,-.46,.012);g.stroke();
    g.strokeStyle=cnA(K.P.trimHi,.55);g.lineWidth=K.lw*3.6;g.globalAlpha=.35;g.stroke();g.globalAlpha=1;
    g.fillStyle=cnA(K.P.deep,.25);g.fillRect(-.55,.07,1.2,.1);cprSeams(K,B,6,1,.3,3);
    g.fillStyle=cnA(K.P.trimLo,.7);g.beginPath();g.arc(-.12,-.02,.02,0,TAU);g.fill();
  }});
  g.save();cprSm(g,[.46,-.026,.36,-.07,.22,-.1,.28,-.06,.4,-.012],true,1);g.fillStyle=cnLG(g,.2,-.1,.44,0,[[0,K.P.glass[0]],[.5,K.P.glass[1]],[1,K.P.glass[2]]]);g.fill();g.lineWidth=K.lw*.8;g.strokeStyle=K.P.out;g.stroke();g.restore();
  cprHull(K,[.0,-.108,-.1,-.225,-.27,-.318,-.46,-.34,-.33,-.265,-.22,-.19,-.14,-.108],{k:.8,inner:B=>{g.strokeStyle=cnA(K.P.trim,.9);g.lineWidth=K.lw*1.3;g.beginPath();g.moveTo(-.08,-.13);g.bezierCurveTo(-.16,-.22,-.28,-.28,-.42,-.325);g.stroke();}});
  g.save();g.globalCompositeOperation='lighter';cnGlow(g,-.3,.075,.07,K.P.glow,.7,{core:.8});g.restore();
  g.save();g.globalCompositeOperation='lighter';g.strokeStyle=cnA(K.P.eng,.9);g.lineWidth=K.lw*2.2;g.beginPath();g.ellipse(-.512,0,.018,.056,0,0,TAU);g.stroke();g.restore();
  cprEngine(K,-.515,0,.03,{i:1,len:7,bell:false});
  cprNav(K,-.4,-.33,'#ffffff',2.4,.1,.5);cprNav(K,.51,.02,K.P.glow,2.6,.2,.2);
};

/* ---- shuttle ---- */
SHIP.shuttle={};
SHIP.shuttle.meridian=K=>{
  const g=K.g,fp=K.fP;
  cprHull(K,[-.12,-.14,.04,-.14,.06,-.3,-.08,-.3],{pal:fp,sharp:true,rim:0});
  cprHull(K,[-.5,-.12,-.46,-.17,-.3,-.18,.18,-.17,.34,-.12,.46,-.04,.5,.04,.42,.13,.1,.17,-.38,.16,-.5,.12],{k:.4,inner:B=>{
    g.fillStyle=cnA(K.P.trim,.9);g.fillRect(-.52,.0,1.05,.04);g.fillStyle=cnA(K.P.deep,.35);g.fillRect(-.52,.1,1.1,.1);
    cprSeams(K,B,6,2,.5,6);g.strokeStyle='rgba(6,10,20,.7)';g.lineWidth=K.lw;g.strokeRect(-.28,-.1,.2,.2);cprWin(K,-.22,-.14,-.02,2,.028,.02,K.P.win,.7,9);
  }});
  g.save();cprPoly(g,[.2,-.15,.36,-.1,.44,-.03,.22,-.04]);g.fillStyle=cnLG(g,.2,-.15,.4,0,[[0,K.P.glass[0]],[.5,K.P.glass[1]],[1,K.P.glass[2]]]);g.fill();g.lineWidth=K.lw*.9;g.strokeStyle=K.P.out;g.stroke();g.restore();
  cprHull(K,[-.12,-.17,.06,-.17,.08,-.34,-.06,-.34],{sharp:true,inner:B=>{g.fillStyle=cnA(K.P.trim,.9);g.fillRect(B.x0,-.26,B.x1-B.x0,.03);}});
  cprEngine(K,-.5,-.02,.07,{i:1,len:6,thrust:K.thrust});cprEngine(K,-.4,.14,.03,{i:2,len:4,thrust:K.thrust*.5});
  cprNav(K,-.06,-.34,'#ff4a3a',1.7,.2,.1);cprNav(K,.49,.04,'#4aff8a',1.7,.2,.1);
};
SHIP.shuttle.obsidian=K=>{
  const g=K.g,fp=K.fP;
  cprHull(K,[-.05,-.1,-.3,-.34,-.46,-.3,-.35,-.1],{pal:fp,sharp:true,rim:0});
  cprHull(K,[-.5,-.1,-.36,-.16,.06,-.14,.3,-.06,.52,.04,.3,.1,.0,.16,-.34,.16,-.5,.1],{sharp:true,inner:B=>{
    g.strokeStyle=cnA(K.P.trim,.9);g.lineWidth=K.lw*1.5;g.beginPath();g.moveTo(-.46,-.07);g.lineTo(.0,-.1);g.lineTo(.4,.0);g.stroke();
    g.fillStyle=cnA(K.P.deep,.5);g.fillRect(-.52,.09,1.2,.1);cprSeams(K,B,6,2,.6,7);g.fillStyle=cnA(K.P.glow,.7);for(let i=0;i<3;i++)g.fillRect(-.28+i*.05,.0,.03,.012);
  }});
  g.save();cprPoly(g,[.2,-.07,.38,-.02,.3,.0,.16,-.04]);g.fillStyle=cnLG(g,.16,-.07,.36,0,[[0,K.P.glass[0]],[.5,K.P.glass[1]],[1,K.P.glass[2]]]);g.fill();g.restore();
  cprHull(K,[-.05,-.15,-.3,-.15,-.4,-.35,-.22,-.32],{sharp:true,inner:B=>{g.strokeStyle=cnA(K.P.trim,.9);g.lineWidth=K.lw*1.3;g.beginPath();g.moveTo(-.2,-.17);g.lineTo(-.34,-.33);g.stroke();}});
  cprEngine(K,-.5,-.03,.05,{i:1,len:7,bell:false});cprEngine(K,-.5,.05,.04,{i:2,len:6,bell:false});g.fillStyle=cnA(K.P.glow,.9);g.fillRect(-.505,-.09,.012,.2);
  cprNav(K,-.4,-.34,'#ff3a2a',1.5,.3,.2);
};
SHIP.shuttle.aurora=K=>{
  const g=K.g,fp=K.fP;
  cprHull(K,[-.06,-.12,-.2,-.24,-.4,-.3,-.3,-.2,-.18,-.12],{pal:fp,rim:0,k:.8});
  cprHull(K,[-.5,-.02,-.4,-.1,-.2,-.16,.12,-.16,.36,-.1,.52,.02,.38,.1,.1,.16,-.22,.15,-.42,.09],{k:1,inner:B=>{
    g.strokeStyle=cnA(K.P.trim,.95);g.lineWidth=K.lw*1.8;g.beginPath();g.moveTo(.42,.0);g.bezierCurveTo(.1,.05,-.2,.06,-.46,.0);g.stroke();
    g.fillStyle=cnA(K.P.deep,.25);g.fillRect(-.55,.09,1.2,.1);cprSeams(K,B,5,1,.3,8);
  }});
  g.save();cprSm(g,[.4,-.04,.28,-.12,.1,-.14,.2,-.06,.34,-.01],true,1);g.fillStyle=cnLG(g,.1,-.14,.4,0,[[0,K.P.glass[0]],[.5,K.P.glass[1]],[1,K.P.glass[2]]]);g.fill();g.lineWidth=K.lw*.8;g.strokeStyle=K.P.out;g.stroke();g.restore();
  cprHull(K,[-.04,-.14,-.18,-.25,-.36,-.32,-.46,-.31,-.3,-.23,-.16,-.14],{k:.8,inner:B=>{g.strokeStyle=cnA(K.P.trim,.9);g.lineWidth=K.lw*1.4;g.beginPath();g.moveTo(-.1,-.16);g.bezierCurveTo(-.2,-.24,-.32,-.29,-.42,-.3);g.stroke();}});
  g.save();g.globalCompositeOperation='lighter';g.strokeStyle=cnA(K.P.eng,.9);g.lineWidth=K.lw*2.4;g.beginPath();g.ellipse(-.51,.0,.02,.075,0,0,TAU);g.stroke();g.restore();
  cprEngine(K,-.515,.0,.045,{i:1,len:6,bell:false});cprNav(K,.5,.02,K.P.glow,2.4,.2,.3);
};

/* ---- frigate ---- */
SHIP.frigate={};
SHIP.frigate.meridian=K=>{
  const g=K.g,fp=K.fP;
  /* far-side sponson */
  cprHull(K,[-.02,.05,.14,.05,.17,.082,.0,.09],{pal:fp,sharp:true,rim:0});
  /* main hull: stepped armoured deck, wedge prow */
  cprHull(K,[-.5,-.056,-.455,-.082,-.34,-.088,-.3,-.072,-.04,-.072,.02,-.086,.26,-.086,.33,-.07,.505,-.03,.51,.004,.42,.032,.3,.05,.0,.062,-.3,.07,-.44,.07,-.5,.05],{sharp:true,inner:B=>{
    g.fillStyle=cnA(K.P.trim,.92);g.fillRect(-.52,-.01,1.04,.016);g.fillStyle=cnA(K.P.trimHi,.7);g.fillRect(-.52,-.01,1.04,.003);
    g.fillStyle=cnA(K.P.deep,.4);g.fillRect(-.52,.036,1.1,.05);
    g.fillStyle=cnA(K.P.mid,.6);for(let i=0;i<5;i++)g.fillRect(-.02+i*.1,-.086,.07,.012);                                        // armour blocks on the deck
    cprSeams(K,B,22,2,.55,2);
    g.fillStyle=cnA(K.P.deep,.6);for(let i=0;i<6;i++)g.fillRect(-.16+i*.016,-.066,.01,.014);                                    // missile cells
    cprWin(K,-.46,-.3,.03,7,.012,.008,K.P.win,.65,5);
    g.fillStyle=cnA(K.P.trim,.95);g.beginPath();g.moveTo(.36,-.032);g.lineTo(.46,-.012);g.lineTo(.36,-.006);g.closePath();g.fill();    // prow wedge marking
  }});
  /* bridge tower */
  cprHull(K,[-.37,-.088,-.37,-.118,-.34,-.138,-.15,-.138,-.12,-.12,-.1,-.088],{sharp:true,rim:.005,inner:B=>{
    g.fillStyle=cnA(K.P.deep,.65);g.fillRect(B.x0,-.126,B.x1-B.x0,.016);cprWin(K,-.36,-.13,-.118,15,.009,.007,K.P.win,.9,7);
    g.fillStyle=cnA(K.P.trim,.9);g.fillRect(B.x0,-.1,B.x1-B.x0,.007);}});
  g.strokeStyle=K.P.hi;g.lineWidth=K.lw*1.1;g.beginPath();g.moveTo(-.22,-.138);g.lineTo(-.22,-.19);g.moveTo(-.25,-.172);g.lineTo(-.19,-.172);g.moveTo(-.28,-.138);g.lineTo(-.3,-.162);g.stroke();
  g.save();g.translate(-.17,-.157);g.fillStyle=K.P.mid;g.beginPath();g.ellipse(0,0,.02,.007,-.3,0,TAU);g.fill();g.lineWidth=K.lw*.7;g.strokeStyle=K.P.out;g.stroke();g.restore();
  /* turrets: base dome + twin barrels */
  for(const tx of[.12,.24]){cprHull(K,[tx-.03,-.086,tx-.026,-.108,tx+.026,-.108,tx+.03,-.086],{k:.4,rim:.004});g.fillStyle=K.P.deep;g.fillRect(tx+.016,-.102,.085,.012);g.fillRect(tx+.016,-.1,.085,.003);g.fillStyle=K.P.mid;g.fillRect(tx+.08,-.106,.02,.02);}
  cprHull(K,[.02,.062,.07,.062,.075,.088,.0,.088],{sharp:true,rim:.004});
  for(let i=0;i<3;i++)cprEngine(K,-.5,-.034+i*.034,.017,{i:i+1,len:10,thrust:K.thrust});
  cprNav(K,-.49,-.058,'#ff4a3a',1.9,.18,.2);cprNav(K,.505,.0,'#4aff8a',1.9,.18,.2);cprNav(K,-.22,-.19,'#ffffff',1.3,.08,.5);
};
SHIP.frigate.obsidian=K=>{
  const g=K.g,fp=K.fP;
  cprHull(K,[-.1,.06,-.2,.15,-.3,.13,-.28,.06],{pal:fp,sharp:true,rim:0});
  cprHull(K,[-.5,-.04,-.42,-.09,-.3,-.07,-.24,-.16,-.17,-.075,-.05,-.075,.0,-.15,.07,-.075,.2,-.085,.34,-.06,.52,.0,.38,.04,.16,.058,.0,.07,-.12,.14,-.2,.065,-.36,.06,-.5,.05],{sharp:true,inner:B=>{
    g.strokeStyle=cnA(K.P.trim,.95);g.lineWidth=K.lw*1.5;g.beginPath();g.moveTo(-.46,-.06);g.lineTo(-.2,-.07);g.lineTo(.2,-.065);g.lineTo(.46,-.0);g.stroke();
    g.fillStyle=cnA(K.P.deep,.45);g.fillRect(-.52,.03,1.2,.12);cprSeams(K,B,16,2,.6,4);
    g.fillStyle=cnA(K.P.glow,.8);for(let i=0;i<7;i++)g.fillRect(-.38+i*.07,-.02,.035,.008);
    g.fillStyle=cnA(K.P.trimHi,.3);g.beginPath();g.moveTo(.2,-.085);g.lineTo(.34,-.06);g.lineTo(.3,-.05);g.lineTo(.18,-.07);g.closePath();g.fill();
  }});
  g.save();cprPoly(g,[.34,-.03,.44,-.005,.36,0,.3,-.02]);g.fillStyle=cnA(K.P.glow,.9);g.fill();g.restore();
  g.save();g.globalCompositeOperation='lighter';cnGlow(g,.37,-.012,.03,K.P.glow,.8,{core:.6});g.restore();
  for(const[tx,ty]of[[.18,-.085],[.3,-.065]]){cprHull(K,[tx-.022,ty,tx-.02,ty-.02,tx+.02,ty-.02,tx+.022,ty],{sharp:true,rim:.004});g.fillStyle=K.P.deep;g.fillRect(tx,ty-.016,.07,.008);}
  for(let i=0;i<3;i++)cprEngine(K,-.5,-.03+i*.03,.014,{i:i+1,len:11,bell:false});g.fillStyle=cnA(K.P.glow,.9);g.fillRect(-.504,-.05,.01,.1);
  cprNav(K,-.24,-.16,'#ff3a2a',1.4,.3,.2);cprNav(K,.05,-.15,'#ff3a2a',1.4,.3,.6);
};
SHIP.frigate.aurora=K=>{
  const g=K.g,fp=K.fP;
  /* floating blades above the hull, joined by light */
  g.save();g.globalCompositeOperation='lighter';g.strokeStyle=cnA(K.P.eng,.35);g.lineWidth=K.lw*1.6;g.beginPath();g.moveTo(-.15,-.07);g.lineTo(-.15,-.13);g.moveTo(.12,-.07);g.lineTo(.12,-.12);g.stroke();g.restore();
  cprHull(K,[-.34,-.15,-.12,-.19,.14,-.18,.3,-.13,.1,-.145,-.1,-.15],{pal:fp,k:.9,rim:0});
  cprHull(K,[-.5,.0,-.38,-.045,-.18,-.072,.08,-.085,.32,-.062,.5,-.004,.34,.035,.08,.06,-.2,.058,-.4,.04],{k:1,inner:B=>{
    g.strokeStyle=cnA(K.P.trim,.95);g.lineWidth=K.lw*1.8;g.beginPath();g.moveTo(.44,-.004);g.bezierCurveTo(.2,.018,-.2,.02,-.46,.0);g.stroke();
    g.strokeStyle=cnA(K.P.trimHi,.4);g.lineWidth=K.lw*4;g.stroke();
    g.fillStyle=cnA(K.P.deep,.25);g.fillRect(-.55,.04,1.2,.06);cprSeams(K,B,10,1,.25,2);
    for(let i=0;i<6;i++){g.fillStyle=cnA(K.P.trimLo,.7);g.beginPath();g.arc(-.3+i*.12,-.04,.011,0,TAU);g.fill();}
  }});
  cprHull(K,[-.36,-.145,-.14,-.185,.14,-.178,.3,-.128,.12,-.152,-.12,-.158],{k:.9,inner:B=>{g.strokeStyle=cnA(K.P.trim,.9);g.lineWidth=K.lw*1.3;g.beginPath();g.moveTo(.26,-.133);g.bezierCurveTo(.1,-.165,-.1,-.172,-.3,-.152);g.stroke();}});
  g.save();g.globalCompositeOperation='lighter';cnGlow(g,.5,-.004,.05,K.P.eng,.8,{core:.8});cnGlow(g,-.15,-.17,.04,K.P.glow,.5);g.restore();
  g.save();g.globalCompositeOperation='lighter';g.strokeStyle=cnA(K.P.eng,.9);g.lineWidth=K.lw*2.2;g.beginPath();g.ellipse(-.505,.0,.014,.05,0,0,TAU);g.stroke();g.restore();
  cprEngine(K,-.51,.0,.026,{i:1,len:10,bell:false});
  cprNav(K,-.4,-.045,'#ffffff',2.2,.1,.1);
};

/* ---- carrier ---- */
SHIP.carrier={};
SHIP.carrier.meridian=K=>{
  const g=K.g,fp=K.fP;
  /* lower hull / sponsons (far) */
  cprHull(K,[-.3,.05,.2,.05,.26,.09,-.2,.1],{pal:fp,sharp:true,rim:0});
  /* main hull: flat flight deck, angled bow, big engine cowl */
  cprHull(K,[-.52,-.045,-.47,-.068,-.4,-.072,.36,-.072,.44,-.056,.505,-.016,.5,.012,.44,.04,.36,.058,-.04,.07,-.3,.074,-.44,.07,-.52,.052],{sharp:true,inner:B=>{
    g.fillStyle=cnA(K.P.deep,.5);g.fillRect(-.54,.035,1.1,.06);g.fillStyle=cnA(K.P.trim,.92);g.fillRect(-.54,-.012,1.08,.011);g.fillStyle=cnA(K.P.trimHi,.7);g.fillRect(-.54,-.012,1.08,.002);
    cprSeams(K,B,40,3,.5,2);
    g.fillStyle=cnA(K.P.deep,.7);for(let i=0;i<6;i++)g.fillRect(-.34+i*.1,.006,.065,.02);                                       // hangar mouths
    g.save();g.globalCompositeOperation='lighter';g.fillStyle=cnA(K.P.win,.55);for(let i=0;i<6;i++)g.fillRect(-.34+i*.1+.004,.012,.057,.01);g.restore();
    cprWin(K,-.48,-.36,-.038,9,.008,.006,K.P.win,.6,6);cprWin(K,.16,.42,-.038,17,.008,.006,K.P.win,.6,7);cprWin(K,-.46,.3,.05,36,.006,.005,K.P.win,.45,8);
    g.fillStyle=cnA('#fff',.55);for(let i=0;i<22;i++)g.fillRect(-.4+i*.036,-.071,.012,.004);                                      // deck edge lights
  }});
  /* island */
  cprHull(K,[-.24,-.072,-.24,-.1,-.2,-.125,-.12,-.125,-.09,-.1,-.08,-.072],{sharp:true,rim:.005,inner:B=>{g.fillStyle=cnA(K.P.deep,.65);g.fillRect(B.x0,-.112,B.x1-B.x0,.014);cprWin(K,-.235,-.09,-.105,12,.008,.006,K.P.win,.85,9);g.fillStyle=cnA(K.P.trim,.9);g.fillRect(B.x0,-.082,B.x1-B.x0,.007);}});
  cprHull(K,[-.2,-.125,-.19,-.145,-.13,-.145,-.12,-.125],{sharp:true,rim:.004,inner:B=>{g.fillStyle=cnA(K.P.deep,.6);g.fillRect(B.x0,-.138,B.x1-B.x0,.01);}});
  g.strokeStyle=K.P.hi;g.lineWidth=K.lw;g.beginPath();g.moveTo(-.16,-.145);g.lineTo(-.16,-.2);g.moveTo(-.19,-.18);g.lineTo(-.13,-.18);g.moveTo(-.12,-.145);g.lineTo(-.1,-.175);g.stroke();
  g.save();g.translate(-.15,-.16);g.fillStyle=K.P.mid;g.beginPath();g.ellipse(0,0,.024,.008,-.25,0,TAU);g.fill();g.lineWidth=K.lw*.7;g.strokeStyle=K.P.out;g.stroke();g.restore();
  /* aircraft parked on the deck, and a gantry */
  for(let i=0;i<5;i++){const x=-.02+i*.085;g.fillStyle=K.P.mid;g.beginPath();g.moveTo(x-.028,-.072);g.lineTo(x-.02,-.087);g.lineTo(x+.012,-.09);g.lineTo(x+.033,-.08);g.lineTo(x+.033,-.072);g.closePath();g.fill();g.lineWidth=K.lw*.7;g.strokeStyle=K.P.out;g.stroke();g.fillStyle=cnA(K.P.glass[1],.9);g.fillRect(x+.012,-.086,.014,.007);}
  g.strokeStyle=K.P.mid;g.lineWidth=K.lw*1.3;g.beginPath();g.moveTo(.4,-.072);g.lineTo(.4,-.11);g.lineTo(.44,-.11);g.lineTo(.44,-.065);g.stroke();
  for(let i=0;i<5;i++)cprEngine(K,-.52,-.04+i*.02,.011,{i:i+1,len:14});
  cprNav(K,-.5,-.065,'#ff4a3a',2.4,.18,.2);cprNav(K,.5,-.0,'#4aff8a',2.4,.18,.2);cprNav(K,-.16,-.2,'#ffffff',1.6,.07,.5);
};
SHIP.carrier.obsidian=K=>{
  const g=K.g,fp=K.fP;
  cprHull(K,[-.5,-.05,-.4,-.085,-.3,-.065,-.24,-.13,-.16,-.07,-.04,-.07,.04,-.15,.11,-.07,.26,-.08,.38,-.06,.52,.0,.4,.035,.16,.06,.0,.1,-.14,.13,-.28,.07,-.4,.065,-.5,.05],{sharp:true,inner:B=>{
    g.strokeStyle=cnA(K.P.trim,.95);g.lineWidth=K.lw*1.5;g.beginPath();g.moveTo(-.46,-.06);g.lineTo(-.28,-.07);g.lineTo(.0,-.06);g.lineTo(.3,-.065);g.lineTo(.48,-.005);g.stroke();
    g.fillStyle=cnA(K.P.deep,.5);g.fillRect(-.52,.04,1.2,.1);cprSeams(K,B,30,3,.6,3);
    g.fillStyle=cnA(K.P.glow,.85);for(let i=0;i<12;i++)g.fillRect(-.4+i*.055,-.008+((i&1)?.016:0),.03,.007);
    g.save();g.globalCompositeOperation='lighter';g.fillStyle=cnA(K.P.glow,.12);g.fillRect(-.45,-.025,.9,.05);g.restore();
  }});
  g.strokeStyle=K.P.trim;g.lineWidth=K.lw*1.2;g.beginPath();g.moveTo(-.24,-.13);g.lineTo(-.25,-.2);g.moveTo(.04,-.15);g.lineTo(.045,-.23);g.stroke();
  g.save();g.globalCompositeOperation='lighter';cnGlow(g,-.25,-.2,.02,K.P.glow,.8);cnGlow(g,.045,-.23,.02,K.P.glow,.8);cnGlow(g,.5,.0,.05,K.P.glow,.7,{core:.5});g.restore();
  for(let i=0;i<4;i++)cprEngine(K,-.5,-.035+i*.024,.011,{i:i+1,len:14,bell:false});g.fillStyle=cnA(K.P.glow,.9);g.fillRect(-.504,-.05,.01,.1);
  cprNav(K,-.44,-.08,'#ff3a2a',1.5,.3,.2);cprNav(K,.2,-.08,'#ff3a2a',1.5,.3,.7);
};
SHIP.carrier.aurora=K=>{
  const g=K.g,fp=K.fP;
  cprHull(K,[-.5,.0,-.42,-.045,-.25,-.075,.0,-.088,.26,-.075,.44,-.04,.52,.004,.42,.03,.2,.052,-.05,.064,-.28,.056,-.44,.035],{k:1,inner:B=>{
    g.strokeStyle=cnA(K.P.trim,.95);g.lineWidth=K.lw*1.9;g.beginPath();g.moveTo(.46,-.004);g.bezierCurveTo(.2,.014,-.2,.022,-.47,.0);g.stroke();
    g.strokeStyle=cnA(K.P.trimHi,.4);g.lineWidth=K.lw*4;g.stroke();
    g.fillStyle=cnA(K.P.deep,.22);g.fillRect(-.55,.034,1.2,.07);cprSeams(K,B,22,1,.25,4);
    cprWin(K,-.36,.34,.026,34,.006,.006,K.P.win,.8,3);
  }});
  for(let i=0;i<7;i++){const x=-.32+i*.1,r=.022+.008*cnR(K.seed,i,2);g.save();g.beginPath();g.ellipse(x,-.074,r*1.4,r,0,Math.PI,TAU);g.fillStyle=cnLG(g,x,-.095,x,-.074,[[0,cnA(K.P.glass[0],.9)],[1,cnA(K.P.glass[1],.8)]]);g.fill();g.lineWidth=K.lw*.8;g.strokeStyle=K.P.out;g.stroke();g.restore();g.save();g.globalCompositeOperation='lighter';cnGlow(g,x,-.082,r*2.2,K.P.glow,.28);g.restore();}
  g.save();g.globalCompositeOperation='lighter';g.strokeStyle=cnA(K.P.eng,.5);g.lineWidth=K.lw*2;g.beginPath();g.ellipse(-.1,0,.04,.14,0,0,TAU);g.stroke();g.strokeStyle=cnA(K.P.eng,.18);g.lineWidth=K.lw*7;g.stroke();g.restore();   // the halo ring
  g.save();g.globalCompositeOperation='lighter';cnGlow(g,.52,.004,.05,K.P.eng,.8,{core:.8});g.restore();
  for(let i=0;i<3;i++){g.save();g.globalCompositeOperation='lighter';g.strokeStyle=cnA(K.P.eng,.9);g.lineWidth=K.lw*2.2;g.beginPath();g.ellipse(-.505,-.02+i*.022,.01,.02,0,0,TAU);g.stroke();g.restore();cprEngine(K,-.51,-.02+i*.022,.012,{i:i+1,len:14,bell:false});}
  cprNav(K,-.44,-.04,'#ffffff',2.6,.1,.3);
};

/* ---- the wreck: a broken frigate in three drifting pieces, jagged torn edges with exposed ribs, fires, smoke, loose plates ---- */
SHIP.wreck=(K,f)=>{
  const g=K.g,sd=K.seed,fk=CPR_PAL[f]?f:'meridian',draw=SHIP.frigate[fk];
  const c1=-.2+(cnHash(sd,1,1)-.5)*.08,c2=.14+(cnHash(sd,2,1)-.5)*.1;
  const jag=(c,salt)=>{const a=[];for(let i=0;i<=12;i++)a.push([c+(cnHash(sd,i,salt)-.5)*.075+(cnHash(sd,i>>1,salt+50)-.5)*.05,-.34+i*.057]);return a;};
  const J1=jag(c1,11),J2=jag(c2,12);
  const piece=(xl,xr,Jl,Jr,tx,ty,rot,px)=>{
    g.save();g.translate(tx,ty);g.translate(px,0);g.rotate(rot);g.translate(-px,0);
    g.save();g.beginPath();                                                                                              // clip: between the two torn edges
    if(Jl){g.moveTo(Jl[0][0],Jl[0][1]);for(const q of Jl)g.lineTo(q[0],q[1]);}else{g.moveTo(-.9,-.4);g.lineTo(-.9,.4);}
    if(Jr){for(let i=Jr.length-1;i>=0;i--)g.lineTo(Jr[i][0],Jr[i][1]);}else{g.lineTo(.9,.4);g.lineTo(.9,-.4);}
    g.closePath();g.clip();
    draw(Object.assign({},K,{wr:{J:[Jl,Jr].filter(Boolean)},xr:[xl-.02,xr+.02]}));
    g.restore();
    for(const J of[Jl,Jr]){if(!J)continue;                                                                               // girders sticking out of the break
      g.strokeStyle='#1c1614';g.lineWidth=K.lw*2;g.lineCap='round';g.beginPath();
      for(let i=4;i<=8;i++){const q=J[i],l=.025+.07*cnHash(sd,i+(J===Jl?0:20),13),an=(J===Jl?Math.PI:0)+(cnHash(sd,i,14)-.5)*.9;g.moveTo(q[0],q[1]);g.lineTo(q[0]+Math.cos(an)*l,q[1]+Math.sin(an)*l*.6);}
      g.stroke();}
    g.restore();
  };
  piece(c1,c2,J1,J2,.0,.04,.05,0);                                                                                       // mid section sags
  piece(-.55,c1,null,J1,-.07,.015,.12,c1);                                                                               // stern, pitched down
  piece(c2,.55,J2,null,.08,-.035,-.1,c2);                                                                                // bow, pitched up
  /* fires in the breaks, smoke, sparks */
  const fl=K.rm?.7:(.7+.3*cnFlicker(K.t,sd,9));
  g.save();g.globalCompositeOperation='lighter';
  for(const[J,m]of[[J1,0],[J2,1]])for(let i=0;i<3;i++){const q=J[4+i*2];cnGlow(g,q[0]+(m?.05:-.04),q[1],.055+.02*fl,'#ff7a30',.55*fl,{core:.7});}
  cnGlow(g,(c1+c2)/2,0,.17,'#ff4a20',.2*fl);
  if(!K.rm)for(let i=0;i<cnN(14,K.S);i++){const ph=cnPhase(K.t,1.4+cnR(sd,i,3),i,sd),a=-1.3+cnR(sd,i,4)*2.6,d=ph*(.08+.16*cnR(sd,i,5)),J=i&1?J2:J1,q=J[4+(i%5)];g.fillStyle=cnA('#ffd080',(1-ph)*.9);g.fillRect(q[0]+Math.cos(a)*d-.002,q[1]+Math.sin(a)*d-.002+ph*ph*.06,.004,.004);}
  g.restore();
  for(let i=0;i<cnN(9,K.S);i++){const ph=cnPhase(K.t,7,i,sd),J=i&1?J2:J1,q=J[4+(i%5)],sx=q[0]-ph*.3,sy=q[1]-ph*.12;g.fillStyle=cnRG(g,sx,sy,0,.04+ph*.09,[[0,cnA('#1c1616',.55*(1-ph))],[1,cnA('#1c1616',0)]]);g.fillRect(sx-.15,sy-.15,.3,.3);}
  /* loose plates drifting through the gaps */
  for(let i=0;i<6;i++){const a=cnR(sd,i,8)*TAU+K.t*(.25+.25*cnR(sd,i,9))*(i&1?1:-1),cx=(i&1?c2:c1)+(cnR(sd,i,10)-.5)*.16,x=cx+Math.sin(K.t*.3+i)*.01,y=(cnR(sd,i,11)-.5)*.3+Math.cos(K.t*.25+i*2)*.008,s=.014+.022*cnR(sd,i,12);
    g.save();g.translate(x,y);g.rotate(a);cprHull(K,[-s,-s*.5,s*.8,-s*.7,s,s*.5,-s*.4,s*.7],{sharp:true,rim:.003,pal:K.fP});g.restore();}
};

/* ---- the painter ---- */
const CPR_SHIPSY={shuttle:1,dropship:1,frigate:1.25,carrier:1.45,wreck:1.25};     // vertical stretch: long hulls get body, the plan view stays authored at unit length
function cprShip(g,x,y,size,p,t,seed,S){
  const cls=CPR_SHIPLEN[p.cls]?p.cls:'dropship',fk=CPR_PAL[p.faction]?p.faction:'meridian',len=size*CPR_SHIPLEN[cls];
  const L=cprLight(g,x,y,S),sp=Math.hypot(p.vx||0,p.vy||0)/Math.max(1,size);
  let P=cprPal(fk,p.col);
  if(cls==='wreck'){const ch='#1a1514';P=Object.assign({},P,{hi:cnMix(P.hi,ch,.5),mid:cnMix(P.mid,ch,.55),lo:cnMix(P.lo,ch,.5),trim:cnMix(P.trim,ch,.55),trimHi:cnMix(P.trimHi,ch,.55),glow:cnMix(P.glow,ch,.4),win:cnMix(P.win,ch,.7)});}
  const thrust=cls==='wreck'?0:cprC(.34+sp*.55,0,1.2),ph=cnHash(seed,1,7)*TAU,rm=!!(S&&S.rm);
  const bob=rm?0:Math.sin(t*.8+ph)*.006*len,pit=rm?0:Math.sin(t*.55+ph*1.7)*.009;
  const K={g,L,P,fP:cprFar(P),len,lw:Math.max(.0032,.95/len),u:(S&&S.u)||1,t,seed,thrust,rm,S,dead:cls==='wreck'};
  g.save();g.translate(x,y+bob);g.rotate(pit);g.scale(len,len*CPR_SHIPSY[cls]);g.lineJoin='round';g.lineCap='round';
  if(cls==='wreck')SHIP.wreck(K,fk);else(SHIP[cls][fk]||SHIP[cls].meridian)(K);
  g.restore();
}
CINE_PAINT.prop.ship=cprShip;

/* ------------------------------------------------ 3. units: the game's own vector sprite (artUnit) at film scale, grounded and lit ------------------------------------------------ */
/* bounding box of each sprite in sprite units [x0,x1,y0,y1] (measured from the drawing code in 50_art.js; heroes and creeps included) */
const CPR_UE={hauler:[-9.5,14.2,-10.5,10.5],rifleman:[-7,18,-8.6,8.6],raptor:[-11,17,-11,11],rocketeer:[-8,8,-12.5,12.5],mender:[-14.2,5.8,-11,9],howitzer:[-15,27,-14,14],juggernaut:[-14,26,-17,17],skiff:[-12,16,-17,17],
  titan:[-23.6,42,-23.6,23.6],freighter:[-16,15,-9.5,9.5],bulwark:[-12.5,21,-14,14],reaver:[-12,19,-11.4,11.4],specter:[-15,22,-9.6,9.6],crawler:[-10,13.6,-11.4,11.4],spitter:[-12.4,13.5,-10,10],brute:[-17.5,24,-13,13],
  hero_idris:[-18,22,-11,11],hero_kaz:[-12.4,25,-16.4,16.4],hero_lyra:[-18,21.4,-13,13]};
/* small lights on each sprite [x,y,radius,colour|null=faction glow] — they get an additive glow so visors, engines and lamps read at night and in dusk light */
const CPR_UG={hauler:[[6,0,3.4,'#42d1ff']],rifleman:[[4.3,0,3,'#3de0ff']],raptor:[[6,-2,2.4,'#ffe36b'],[6,2,2.4,'#ffe36b']],rocketeer:[[4.4,0,3,'#ffb347'],[6.5,-9.9,2.4,'#ffb24a'],[6.5,9.9,2.4,'#ffb24a']],mender:[[4.6,0,3,'#7dffcf'],[-12.5,-9.4,2.8,'#7dffcf']],
  howitzer:[[-1,0,3,null]],juggernaut:[[4.5,0,3.6,'#bfeaff']],skiff:[[4,0,3.4,'#bff4ff'],[-10.4,0,5,'#8fd0ff']],titan:[[-3,0,8,null],[1.4,13.5,2,'#ffb24a'],[1.4,-13.5,2,'#ffb24a']],freighter:[[11.5,0,3.2,'#bfeaff'],[-14.8,-4,2.4,'#ffb347'],[-14.8,4,2.4,'#ffb347']],
  bulwark:[[12,0,4,null],[1,0,2.6,null]],reaver:[[6.5,-1.9,2.2,'#ff3a3a'],[6.5,1.9,2.2,'#ff3a3a']],specter:[[4.1,0,2.8,null],[19,2,3,null]],crawler:[[7.6,-1.8,1.8,'#ff7a1a'],[7.6,1.8,1.8,'#ff7a1a']],spitter:[[-4.5,0,5,'#d6ff7a'],[11,0,2.4,'#caff5c']],
  brute:[[12.4,-2,2,'#ff3b1f'],[12.4,2,2,'#ff3b1f']],hero_idris:[[5,0,3.6,'#42d1ff'],[20,3,2.6,'#ffd15a']],hero_kaz:[[5.6,0,3.4,'#ff4020']],hero_lyra:[[5,0,3.2,null],[19,-2,4.4,null],[-6,10.6,2.6,null],[-6,-10.6,2.6,null]]};
function cprUnit(g,x,y,size,p,t,seed,S){
  const type=UDEF[p.type]?p.type:'rifleman',fk=FACTIONS[p.faction]?p.faction:'meridian',def=UDEF[type],col=def.creep?NEUTRAL_COL:cnFac(fk);
  const e=CPR_UE[type]||[-12,12,-12,12],bw=e[1]-e[0],bh=e[3]-e[2],D=Math.max(bw,bh),k=size/(30*Math.sqrt(D/30)),cx=(e[0]+e[1])/2,cy=(e[2]+e[3])/2;
  const L=cprLight(g,x,y,S),rm=!!(S&&S.rm),sp=Math.hypot(p.vx||0,p.vy||0)/Math.max(1,size),mv=sp>.03,fly=type==='skiff',ph=cnHash(seed,1,7)*TAU;
  const bob=rm?0:fly?Math.sin(t*1.7+ph)*.012*size:0,breath=rm?1:1+.01*Math.sin(t*1.5+ph),sway=rm?0:(fly?Math.sin(t*1.1+ph)*.035:Math.sin(t*.9+ph)*.012+(mv&&def.creep?Math.sin(t*10)*.035:0));
  const hgt=fly?10:def.hero?3.2:2.4;
  /* contact shadow, pushed away from the light (higher things throw it further) */
  cnShadow(g,x-L.x*hgt*k,y-L.y*hgt*k*.6+bh*k*.04+(fly?size*.1:0),bw*k*(fly?.5:.55),bh*k*(fly?.22:.5),fly?.3:.42);
  /* dust behind a moving ground unit */
  if(mv&&!fly&&!rm){const n=cnN(7,S);for(let i=0;i<n;i++){const phs=cnPhase(t,.9,i,seed),ox=-(bw*.4+phs*bw*1.1)*k,oy=(cnR(seed,i,3)-.5)*bh*.5*k-phs*size*.06,r=(.08+phs*.2)*size*.5;
    g.fillStyle=cnRG(g,x+ox,y+oy,0,r,[[0,cnA(cnMix('#8a7a68',L.col,.25),.28*(1-phs))],[1,cnA('#8a7a68',0)]]);g.fillRect(x+ox-r,y+oy-r,r*2,r*2);}}
  g.save();g.translate(x,y+bob);g.rotate(sway);g.scale(k*breath,k*breath);g.translate(-cx,-cy);g.lineJoin='round';g.lineCap='round';
  if(fly){g.save();g.globalCompositeOperation='lighter';const fl=.8+.2*cnFlicker(t,seed,22);cnGlow(g,-14,0,9*fl,'#8fd0ff',.6,{core:.7});g.restore();}
  artUnit(g,type,col,fk);
  g.globalCompositeOperation='lighter';
  const G=CPR_UG[type]||[];for(const q of G)cnGlow(g,q[0],q[1],q[2]*2.6,q[3]||col.glow,.5+.12*Math.sin(t*3+q[0]),{core:.5});
  if(def.hero)cnGlow(g,0,0,D*.75,col.glow,.16+.05*Math.sin(t*2+ph));
  g.restore();
}
CINE_PAINT.prop.unit=cprUnit;

/* ------------------------------------------------ 4. buildings: the game's plate as the roof of an oblique volume (same construction as the ground backgrounds) ------------------------------------------------ */
const CPR_BH={hub:.5,generator:.56,depot:.32,siphon:.52,habitat:.38,garrison:.46,armory:.42,forum:.27,exchange:.42,foundry:.56,airfield:.14,turret:.38};   // wall height / plate width
const CPR_WALL={meridian:['#8ea2c4','#51627f','#1d2740'],obsidian:['#6a4a54','#33222a','#120a0e'],aurora:['#f1fffb','#b4d0cc','#4e7a78']};                 // lit / mid / shadow wall colours
function cprBuilding(g,x,y,size,p,t,seed,S){
  const type=BDEF[p.type]?p.type:'hub',fk=FACTIONS[p.faction]?p.faction:'meridian',d0=BDEF[type],col=cnFac(fk),W3=CPR_WALL[fk],L=cprLight(g,x,y,S),rm=!!(S&&S.rm);
  const pw=d0.w*TILE,ph=d0.h*TILE,Wd=size*.86,s=Wd/pw,dp=ph*s*.5,h=Wd*(CPR_BH[type]||.34),sg=L.x<0?1:-1,sh=sg*dp*.42,ka=L.a;
  const yb=y+(h+dp)/2,ph0=cnHash(seed,1,7)*TAU,x0=x-Wd/2,x1=x+Wd/2,yt=yb-h;
  const lit=(a,b)=>cnMix(a,L.col,.12*ka*b);
  /* cast shadow on the ground, away from the light */
  {const sx=-L.x*h*1.15,sy=h*.1,fp=[[x0,yb],[x1,yb],[x1+sh,yb-dp],[x0+sh,yb-dp]];
   g.save();g.beginPath();
   for(const o of[[0,0],[sx,sy]]){g.moveTo(fp[0][0]+o[0],fp[0][1]+o[1]);for(let i=1;i<4;i++)g.lineTo(fp[i][0]+o[0],fp[i][1]+o[1]);g.closePath();}
   g.moveTo(x0,yb);g.lineTo(x1,yb);g.lineTo(x1+sx,yb+sy);g.lineTo(x0+sx,yb+sy);g.closePath();
   g.fillStyle=cnLG(g,x,0,x+sx*1.2,0,[[0,'rgba(4,6,12,.5)'],[1,'rgba(4,6,12,.12)']]);g.fill();g.restore();}
  g.save();g.lineJoin='round';g.lineCap='round';
  /* side face (shadow side) */
  {const sx0=sg>0?x1:x0;g.beginPath();g.moveTo(sx0,yb);g.lineTo(sx0,yt);g.lineTo(sx0+sh,yt-dp);g.lineTo(sx0+sh,yb-dp);g.closePath();
   g.fillStyle=cnLG(g,0,yt-dp,0,yb,[[0,cnMix(W3[2],L.col,.04)],[1,cnShade(W3[2],-.35)]]);g.fill();g.lineWidth=Math.max(1,.0035*size);g.strokeStyle='rgba(5,9,16,.8)';g.stroke();}
  /* front face: lit gradient across the wall, plinth, trim band, seams, per-type openings */
  g.beginPath();g.rect(x0,yt,Wd,h);
  g.fillStyle=cnLG(g,L.x<0?x0:x1,0,L.x<0?x1:x0,0,[[0,lit(W3[0],1)],[.5,W3[1]],[1,W3[2]]]);g.fill();
  g.save();g.clip();
  g.fillStyle=cnLG(g,0,yt,0,yb,[[0,'rgba(255,255,255,.1)'],[.25,'rgba(0,0,0,0)'],[.8,'rgba(0,0,0,.12)'],[1,'rgba(0,0,0,.42)']]);g.fillRect(x0,yt,Wd,h);
  g.fillStyle='rgba(5,9,16,.5)';g.fillRect(x0,yb-h*.1,Wd,h*.1);
  g.fillStyle=cnA(col.base,.95);g.fillRect(x0,yt+h*.07,Wd,h*.07);g.fillStyle=cnA(col.light,.7);g.fillRect(x0,yt+h*.07,Wd,Math.max(1,h*.012));
  g.strokeStyle='rgba(5,9,16,.38)';g.lineWidth=Math.max(1,.003*size);g.beginPath();const nv=Math.max(3,d0.w*2);for(let i=1;i<nv;i++){const xx=x0+Wd*i/nv;g.moveTo(xx,yt+h*.14);g.lineTo(xx,yb-h*.1);}g.stroke();
  const open=(cx,cy,w,hh,warm,a)=>{g.fillStyle='#07090f';g.fillRect(cx-w/2,cy-hh/2,w,hh);if(warm){g.save();g.globalCompositeOperation='lighter';const gg=cnLG(g,0,cy-hh/2,0,cy+hh/2,[[0,cnA(warm,.5*a)],[1,cnA(warm,.15*a)]]);g.fillStyle=gg;g.fillRect(cx-w/2+1,cy-hh/2+1,w-2,hh-2);g.restore();}g.strokeStyle='rgba(5,9,16,.8)';g.lineWidth=Math.max(1,.003*size);g.strokeRect(cx-w/2,cy-hh/2,w,hh);};
  const my=yt+h*.55,warm='#ffd890';
  switch(type){
    case'hub':open(x,yb-h*.34,Wd*.22,h*.5,warm,1);for(const sx of[-1,1])for(let i=0;i<3;i++)open(x+sx*Wd*(.22+i*.08),my,Wd*.04,h*.2,warm,.8);break;
    case'generator':for(let i=0;i<5;i++){g.fillStyle=cnA('#7ae8ff',.5+.3*Math.sin(t*3+i));g.fillRect(x0+Wd*(.14+i*.17),my-h*.12,Wd*.1,h*.4);}break;
    case'depot':open(x,yb-h*.3,Wd*.3,h*.42,warm,.6);for(let i=0;i<8;i++){g.fillStyle=i&1?'#f2c230':'#1b1b1b';g.beginPath();g.moveTo(x0+Wd*i/8,yb-h*.1);g.lineTo(x0+Wd*(i+1)/8,yb-h*.1);g.lineTo(x0+Wd*(i+1)/8-Wd*.03,yb);g.lineTo(x0+Wd*i/8-Wd*.03,yb);g.closePath();g.fill();}break;
    case'siphon':for(let i=0;i<3;i++){g.fillStyle=cnLG(g,x0+Wd*(.2+i*.28),0,x0+Wd*(.34+i*.28),0,[[0,'#7f8aa6'],[1,'#2c3448']]);g.fillRect(x0+Wd*(.2+i*.28),yt+h*.2,Wd*.14,h*.8);}g.fillStyle=cnA('#8a5bff',.6);g.fillRect(x0,my,Wd,h*.05);break;
    case'habitat':for(let i=0;i<6;i++){g.fillStyle=cnA('#ffe9a6',.9);g.beginPath();g.arc(x0+Wd*(.12+i*.15),my,h*.075,0,TAU);g.fill();}break;
    case'garrison':open(x,yb-h*.3,Wd*.2,h*.42,'#ff9a5a',.5);for(const sx of[-1,1])open(x+sx*Wd*.3,my,Wd*.07,h*.18,warm,.8);break;
    case'armory':for(let i=0;i<4;i++)open(x-Wd*.3+i*Wd*.2,my,Wd*.09,h*.22,warm,.9);break;
    case'forum':for(let i=0;i<4;i++){const cx=x0+Wd*(.14+i*.24);g.fillStyle='#07090f';g.beginPath();g.moveTo(cx-Wd*.05,yb-h*.1);g.lineTo(cx-Wd*.05,my);g.arc(cx,my,Wd*.05,Math.PI,0);g.lineTo(cx+Wd*.05,yb-h*.1);g.closePath();g.fill();g.fillStyle=cnA('#ffe0a0',.2);g.fill();}break;
    case'exchange':for(let i=0;i<5;i++)open(x0+Wd*(.14+i*.18),my,Wd*.1,h*.3,'#ffd45a',.9);break;
    case'foundry':open(x-Wd*.12,yb-h*.3,Wd*.3,h*.44,'#ff7a1c',1.2*(.75+.25*cnFlicker(t,seed,6)));for(let i=0;i<3;i++)open(x+Wd*(.22+i*.1),my,Wd*.05,h*.16,'#ff9a4a',.7);break;
    case'airfield':open(x,yb-h*.3,Wd*.6,h*.4,'#9ac8ff',.45);break;
    case'turret':open(x,yb-h*.3,Wd*.2,h*.34,null,0);break;
  }
  g.restore();
  g.lineWidth=Math.max(1,.0035*size);g.strokeStyle='rgba(5,9,16,.8)';g.strokeRect(x0,yt,Wd,h);
  /* the plate as the roof: game art squashed into the parallelogram */
  g.save();g.beginPath();g.moveTo(x0,yt);g.lineTo(x1,yt);g.lineTo(x1+sh,yt-dp);g.lineTo(x0+sh,yt-dp);g.closePath();g.clip();
  g.transform(s,0,-sh/ph,dp/ph,x+sh/2,yt-dp/2);g.lineJoin='round';g.lineCap='round';
  artBuilding(g,type,pw,ph,col,fk);
  cprRoofLive(g,type,pw,ph,col,t,seed,rm);
  g.restore();
  /* light on the roof: a wash from the key side, a falloff on the far side */
  g.save();g.beginPath();g.moveTo(x0,yt);g.lineTo(x1,yt);g.lineTo(x1+sh,yt-dp);g.lineTo(x0+sh,yt-dp);g.closePath();g.clip();
  g.fillStyle=cnLG(g,L.x<0?x0:x1,0,L.x<0?x1:x0,0,[[0,cnA(L.col,.2*ka)],[.5,'rgba(0,0,0,0)'],[1,'rgba(4,6,14,.22)']]);g.fillRect(x0-Wd*.1,yt-dp,Wd*1.3,dp);g.restore();
  g.lineWidth=Math.max(1,.0035*size);g.strokeStyle='rgba(5,9,16,.85)';g.beginPath();g.moveTo(x0,yt);g.lineTo(x1,yt);g.lineTo(x1+sh,yt-dp);g.lineTo(x0+sh,yt-dp);g.closePath();g.stroke();
  g.strokeStyle=cnA(L.col,.35*ka+.1);g.beginPath();g.moveTo(x0,yt);g.lineTo(x1,yt);g.stroke();
  /* things that stand on the roof */
  const rx=x+sh/2,ry=yt-dp/2;cprRoofThing(g,type,rx,ry,Wd*1.2,h,dp,col,fk,L,t,seed,rm,S);
  g.restore();
}
/* the game's own live overlays (drawBuildingLive), in plate coordinates, drawn inside the roof clip */
function cprRoofLive(g,type,pw,ph,col,t,seed,rm){
  const hw=pw/2,hh=ph/2,pulse=.55+.35*Math.sin(t*3+seed%7),k=rm?.4:1;g.save();
  switch(type){
    case'hub':g.globalAlpha=.85;g.strokeStyle='#e8f3ff';g.lineWidth=2.2;g.beginPath();g.moveTo(0,0);g.lineTo(Math.cos(t*1.6*k)*13,Math.sin(t*1.6*k)*13);g.stroke();break;
    case'generator':g.globalAlpha=pulse;g.fillStyle=cnRG(g,0,0,0,10,[[0,'#e9ffff'],[1,'rgba(80,200,255,0)']]);g.beginPath();g.arc(0,0,10,0,TAU);g.fill();break;
    case'siphon':for(let i=0;i<4;i++){const q=(t*.7+i/4)%1;g.fillStyle='rgba(185,133,255,'+(.5*(1-q))+')';g.beginPath();g.arc(Math.sin(i*2.1+t)*5,-q*14,3+q*6,0,TAU);g.fill();}break;
    case'armory':g.save();g.translate(0,-3);g.rotate(t*.9*k);g.strokeStyle=col.light;g.lineWidth=2;g.beginPath();g.moveTo(0,0);g.lineTo(17,0);g.stroke();g.fillStyle=col.glow;g.beginPath();g.arc(17,0,2.6,0,TAU);g.fill();g.restore();break;
    case'airfield':g.fillStyle='rgba(255,230,120,'+(.35+.55*Math.max(0,Math.sin(t*4)))+')';for(const yy of[-40,-20,0,20,40]){g.beginPath();g.arc(-31,yy,1.7,0,TAU);g.arc(31,yy,1.7,0,TAU);g.fill();}break;
    case'forum':for(let i=0;i<10;i++){const a=i/10*TAU+t*.3*k;g.globalAlpha=.3+.3*Math.sin(t*2+i);g.fillStyle='#fff';g.beginPath();g.arc(Math.cos(a)*35,Math.sin(a)*35,2,0,TAU);g.fill();}break;
    case'turret':break;
  }
  g.restore();
}
function cprRoofThing(g,type,rx,ry,W,h,dp,col,fk,L,t,seed,rm,S){
  const u=W/150,pl=Math.sin(t*3+seed%9)*.5+.5,k=rm?.4:1;g.save();g.lineJoin='round';g.lineCap='round';
  const mast=(hh,w)=>{g.fillStyle=cnLG(g,rx-w,0,rx+w,0,[[0,'#cfd9e8'],[1,'#3a465c']]);g.fillRect(rx-w,ry-hh,w*2,hh);g.lineWidth=Math.max(1,u*.8);g.strokeStyle='rgba(5,9,16,.8)';g.strokeRect(rx-w,ry-hh,w*2,hh);};
  switch(type){
    case'hub':
      if(fk==='obsidian'){g.fillStyle=cnLG(g,0,ry-W*.34,0,ry,[[0,'#6a4a54'],[1,'#1a0f13']]);cprPoly(g,[rx-W*.05,ry,rx-W*.02,ry-W*.3,rx+W*.02,ry-W*.3,rx+W*.05,ry]);g.fill();g.lineWidth=u;g.strokeStyle='rgba(5,9,16,.85)';g.stroke();cnGlow(g,rx,ry-W*.32,W*.12,col.glow,.5+.35*pl,{core:.7});}
      else if(fk==='aurora'){cnGlow(g,rx,ry-W*.2+Math.sin(t*1.2)*W*.01,W*.14,col.glow,.7,{core:.8});g.strokeStyle=cnA(col.light,.8);g.lineWidth=u*1.4;g.beginPath();g.ellipse(rx,ry-W*.2,W*.09,W*.03,t*.7*k,0,TAU);g.stroke();}
      else{mast(W*.26,W*.012);g.save();g.translate(rx,ry-W*.26);g.fillStyle='#e6eef9';g.beginPath();g.ellipse(0,0,W*.07*Math.abs(Math.cos(t*1.2*k))+W*.012,W*.02,-.3,0,TAU);g.fill();g.lineWidth=u*.8;g.strokeStyle='rgba(5,9,16,.8)';g.stroke();g.restore();cnGlow(g,rx,ry-W*.27,W*.05,col.glow,.4+.5*pl,{core:.6});}
      break;
    case'generator':g.fillStyle=cnLG(g,rx-W*.09,0,rx+W*.09,0,[[0,'#4a5870'],[.5,'#9aa8c0'],[1,'#2a3446']]);g.fillRect(rx-W*.09,ry-W*.18,W*.18,W*.18);g.lineWidth=u;g.strokeStyle='rgba(5,9,16,.8)';g.strokeRect(rx-W*.09,ry-W*.18,W*.18,W*.18);
      cnGlow(g,rx,ry-W*.2,W*.16,'#7ae8ff',.5+.4*pl,{core:.8});g.strokeStyle='rgba(190,245,255,'+(.4+.4*pl)+')';g.lineWidth=u*1.4;g.beginPath();{let ax=rx-W*.07,ay=ry-W*.2;g.moveTo(ax,ay);for(let i=1;i<=4;i++){ax=rx-W*.07+i*W*.035;ay=ry-W*.2+(cnR(seed,Math.floor(t*10)+i,5)-.5)*W*.06;g.lineTo(ax,ay);}}g.stroke();break;
    case'depot':g.strokeStyle='#b7c2d6';g.lineWidth=u*2;g.beginPath();g.moveTo(rx+W*.2,ry);g.lineTo(rx+W*.2,ry-W*.16);g.lineTo(rx-W*.04,ry-W*.2);g.stroke();g.strokeStyle='#ffcf5a';g.lineWidth=u;g.beginPath();g.moveTo(rx-W*.04,ry-W*.2);g.lineTo(rx-W*.04,ry-W*.1);g.stroke();g.fillStyle='#d6a24a';g.fillRect(rx-W*.07,ry-W*.1,W*.06,W*.05);break;
    case'siphon':g.strokeStyle='#8a97b0';g.lineWidth=u*2;g.beginPath();g.moveTo(rx-W*.09,ry);g.lineTo(rx,ry-W*.3);g.lineTo(rx+W*.09,ry);g.moveTo(rx-W*.06,ry-W*.1);g.lineTo(rx+W*.06,ry-W*.1);g.moveTo(rx-W*.035,ry-W*.2);g.lineTo(rx+W*.035,ry-W*.2);g.stroke();cnGlow(g,rx,ry-W*.3,W*.1,'#a46bff',.5+.4*pl,{core:.7});
      for(let i=0;i<5;i++){const q=cnFrac(t*.5+i/5);g.fillStyle=cnA('#cda0ff',.5*(1-q));g.beginPath();g.arc(rx+Math.sin(i*3+t)*W*.02,ry-W*.3-q*W*.25,(.012+q*.03)*W,0,TAU);g.fill();}break;
    case'habitat':{const r=W*.17;g.beginPath();g.ellipse(rx,ry,r,r*.8,0,Math.PI,TAU);g.closePath();g.fillStyle=cnLG(g,rx-r,ry-r,rx+r,ry,[[0,'rgba(220,245,255,.92)'],[.5,'rgba(130,180,225,.85)'],[1,'rgba(50,80,130,.9)']]);g.fill();g.lineWidth=u*1.2;g.strokeStyle='rgba(5,9,16,.8)';g.stroke();
      g.fillStyle='rgba(255,255,255,.45)';g.beginPath();g.ellipse(rx-r*.35,ry-r*.45,r*.28,r*.14,-.6,0,TAU);g.fill();for(let i=0;i<5;i++){g.fillStyle=cnA('#ffe9a6',.7);g.fillRect(rx-r*.7+i*r*.35,ry-r*.25,u*2.2,u*2.2);}break;}
    case'garrison':{g.strokeStyle='#cfcfd8';g.lineWidth=u*1.6;g.beginPath();g.moveTo(rx-W*.3,ry+dp*.2);g.lineTo(rx-W*.3,ry-W*.3);g.stroke();cprFlag(g,rx-W*.3,ry-W*.3,W*.2,W*.12,col,t,seed);break;}
    case'armory':g.fillStyle=cnA('#ff4a3a',Math.sin(t*4)>0?.95:.3);g.beginPath();g.arc(rx+W*.25,ry,u*3,0,TAU);g.fill();if(Math.sin(t*4)>0)cnGlow(g,rx+W*.25,ry,W*.06,'#ff4a3a',.6);break;
    case'forum':for(let i=0;i<5;i++){const a=i/5*TAU+t*.4*k;cnGlow(g,rx+Math.cos(a)*W*.1,ry-W*.12+Math.sin(a)*W*.03,W*.05,'#ffe6a0',.5);}break;
    case'exchange':cnGlow(g,rx+W*.28,ry-W*.1,W*.1,'#ffd45a',.35+.25*pl,{core:.6});g.fillStyle='#ffd45a';g.beginPath();g.ellipse(rx+W*.28,ry-W*.1,W*.045*Math.abs(Math.cos(t*1.5*k))+W*.006,W*.045,0,0,TAU);g.fill();g.lineWidth=u;g.strokeStyle='rgba(120,80,10,.9)';g.stroke();break;
    case'foundry':for(const cx of[-.27,-.14]){const px=rx+W*cx;g.fillStyle=cnLG(g,px-W*.035,0,px+W*.035,0,[[0,'#59687f'],[1,'#161d29']]);g.fillRect(px-W*.035,ry-W*.2,W*.07,W*.2);g.lineWidth=u;g.strokeStyle='rgba(5,9,16,.8)';g.strokeRect(px-W*.035,ry-W*.2,W*.07,W*.2);}
      if(!rm)for(let i=0;i<cnN(8,S);i++){const q=cnPhase(t,3.4,i,seed),px=rx+W*(i&1?-.27:-.14)+Math.sin(q*5+i)*W*.025;g.fillStyle=cnRG(g,px,ry-W*.2-q*W*.3,0,(.02+q*.06)*W,[[0,cnA('#8a8690',.5*(1-q))],[1,cnA('#8a8690',0)]]);g.fillRect(px-W*.1,ry-W*.2-q*W*.3-W*.1,W*.2,W*.2);}
      cnGlow(g,rx-W*.2,ry-W*.2,W*.06,'#ff9a4a',.5*(.7+.3*cnFlicker(t,seed,7)));break;
    case'airfield':g.fillStyle='#8a97ad';g.fillRect(rx+W*.3,ry-W*.1,W*.05,W*.1);g.fillStyle='#bfeaff';g.fillRect(rx+W*.28,ry-W*.14,W*.09,W*.05);cnGlow(g,rx+W*.325,ry-W*.12,W*.04,col.glow,.6);break;
    case'turret':{g.save();g.translate(rx,ry-W*.06);g.rotate(-.25+Math.sin(t*.5+seed%5)*.12*k);g.fillStyle=cnLG(g,0,-W*.03,0,W*.03,[[0,'#8fa0be'],[1,'#2a3346']]);g.fillRect(-W*.02,-W*.025,W*.34,W*.05);g.fillStyle='#10161f';g.fillRect(W*.28,-W*.035,W*.07,W*.07);g.fillStyle='rgba(255,255,255,.28)';g.fillRect(-W*.02,-W*.025,W*.3,W*.008);g.lineWidth=u;g.strokeStyle='rgba(5,9,16,.85)';g.strokeRect(-W*.02,-W*.025,W*.34,W*.05);g.restore();
      g.beginPath();g.arc(rx,ry-W*.06,W*.06,0,TAU);g.fillStyle=cnLG(g,rx-W*.05,ry-W*.1,rx+W*.05,ry,[[0,col.light],[1,col.dark]]);g.fill();g.lineWidth=u*1.2;g.strokeStyle='rgba(5,9,16,.85)';g.stroke();cnGlow(g,rx,ry-W*.06,W*.04,col.glow,.6);break;}
  }
  g.restore();
}
/* a waving flag: closed-form cloth ripple, pole at (x,y) top, hanging to the right */
function cprFlag(g,x,y,w,h,col,t,seed){
  const n=10,A=h*.09;g.save();
  const wave=(i,s)=>Math.sin(t*3+i*.75+s)*A*(i/n);
  g.beginPath();g.moveTo(x,y);for(let i=1;i<=n;i++)g.lineTo(x+i/n*w,y+wave(i,0)+i/n*h*.08);for(let i=n;i>=0;i--)g.lineTo(x+i/n*w,y+h*(1-.12*i/n)+wave(i,.5));g.closePath();
  g.fillStyle=cnLG(g,x,y,x+w,y+h,[[0,col.light],[.35,col.base],[1,col.dark]]);g.fill();g.lineWidth=Math.max(1,h*.02);g.strokeStyle='rgba(5,9,16,.8)';g.stroke();
  g.restore();
}
CINE_PAINT.prop.building=cprBuilding;

/* ------------------------------------------------ 5. planet and moon: a baked albedo disc (pure function of type + resolution), lit per frame ------------------------------------------------ */
const CPR_TEX=new Map();                                                                      // type|R -> canvas. A pure function of its key: a cold cache draws the same picture.
const cprRGB=c=>{const a=cnCol(c);return[a[0],a[1],a[2]];};
const cprMixRGB=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const cprSS=cnSS;
/* surface colour of one planet kind at sphere coordinates (u: longitude 0..1, v: latitude 0..1, w: noise-space helper) */
function cprSurf(type,u,v,lat,sd,P){
  const cl=Math.cos(lat),x=u*cl,y=v*2;
  switch(type){
    case'azure':case'verdant':{
      const el=cnFbm(x*5.2+3,y*5.2,sd,5),ocean=type==='azure'?.5:.4,land=cprSS(ocean,ocean+.035,el);
      const deep=cprMixRGB(cprRGB('#0b2f6a'),cprRGB(P.base),cprSS(.15,ocean,el)*.9),shallow=cprRGB('#3fa0c8');
      let ocn=cprMixRGB(deep,shallow,cprSS(ocean-.1,ocean,el)*.7);
      const hi=cprSS(ocean+.08,ocean+.3,el),lowland=cprRGB(P.land),dry=cprRGB(type==='azure'?'#9a9a62':'#6aa04a'),mount=cprRGB(type==='azure'?'#8a8070':'#8a9a6a');
      let lnd=cprMixRGB(cprMixRGB(lowland,dry,cnFbm(x*9,y*9,sd+4,3)*.8),mount,hi*.8);
      let c=cprMixRGB(ocn,lnd,land);
      const pole=cprSS(1.18,1.38,Math.abs(lat)+(cnFbm(x*14,y*14,sd+8,3)-.5)*.3);c=cprMixRGB(c,[240,248,255],pole);
      const cd=cnFbm(x*6+9,y*7,sd+9,5),cloud=cprSS(.5,.76,cd)*(type==='azure'?.78:.62);c=cprMixRGB(c,[250,252,255],cloud);
      return c;}
    case'ember':{
      const el=cnFbm(x*4+1,y*4,sd,5),rock=cprMixRGB(cprRGB('#210a06'),cprRGB(P.base),cprSS(.3,.75,el)*.65);
      const rg=1-Math.abs(cnFbm(x*5+4,y*5,sd+3,4)*2-1),crack=cprSS(.84,.97,rg),rg2=1-Math.abs(cnFbm(x*11+2,y*11,sd+6,3)*2-1),c2=cprSS(.88,.99,rg2)*.6;
      let c=cprMixRGB(rock,cprRGB('#ff8a3a'),Math.min(1,crack+c2));c=cprMixRGB(c,[255,230,160],cprSS(.96,1,rg)*.8);
      const ash=cprSS(.55,.8,cnFbm(x*5+9,y*6,sd+9,4))*.35;return cprMixRGB(c,[60,40,36],ash);}
    case'ice':{
      let c=cprMixRGB(cprRGB('#f0fbff'),cprRGB(P.base),cprSS(.3,.8,cnFbm(x*3,y*6,sd,4))*.55);
      const rg=1-Math.abs(cnFbm(x*7+2,y*7,sd+3,4)*2-1);c=cprMixRGB(c,cprRGB('#3a7098'),cprSS(.9,.99,rg)*.7);
      c=cprMixRGB(c,[255,255,255],cprSS(.55,.8,cnFbm(x*4+9,y*3,sd+9,4))*.5);return c;}
    case'ashen':case'moon':{
      const base=type==='moon'?cprRGB('#cbc7d0'):cprRGB(P.base),el=cnFbm(x*6,y*6,sd,5);let c=cprMixRGB(cprMixRGB(base,cprRGB('#2a2830'),.3),base,cprSS(.3,.7,el));
      if(type==='moon')c=cprMixRGB(c,[70,68,80],cprSS(.5,.62,cnFbm(x*2.2+5,y*2.2,sd+2,4))*.55);                                   // maria
      const g=14,gu=x*g,gv=y*g*.5,ci=Math.floor(gu),cj=Math.floor(gv),hx=cnHash(sd,ci,cj),hy=cnHash(sd,ci,cj+99),rr=cnHash(sd,ci,cj+7);
      if(rr<.62){const cx=ci+.25+hx*.5,cy=cj+.25+hy*.5,rad=.18+.28*cnHash(sd,ci,cj+3),d=Math.hypot(gu-cx,gv-cy)/rad;
        if(d<1)c=cprMixRGB(c,[20,18,24],.4*(1-d*d)*(d<.86?1:0)+(d>.86?.0:0));
        if(d>.8&&d<1.06){const k=cprSS(.8,.92,d)*(1-cprSS(.96,1.06,d));c=cprMixRGB(c,[240,236,246],.35*k);}}
      return c;}
    case'violet':{
      const warp=cnFbm(x*2+3,y*9,sd,4)-.5,b=Math.sin((y*5.4+warp*.9)*TAU)*.5+.5,b2=Math.sin((y*13+warp*2)*TAU)*.5+.5;
      let c=cprMixRGB(cprMixRGB(cprRGB(P.dark),cprRGB(P.base),b),cprRGB(P.light),b2*.45*cprSS(.35,.9,b));
      const sx=(u-.56)*cl*2.2,sy=(v-.62)*3.6,e=Math.hypot(sx,sy);if(e<.55){const k=1-cprSS(.2,.55,e);c=cprMixRGB(c,cprRGB('#f4d8ff'),k*.65*(.6+.4*Math.sin(Math.atan2(sy,sx)*3+e*14)));}
      return cprMixRGB(c,[255,255,255],cprSS(.62,.85,cnFbm(x*3+9,y*12,sd+9,3))*.18);}
  }
  return cprRGB(P.base);
}
function cprPlanetTex(type,R){
  const key=type+'|'+R;let cv=CPR_TEX.get(key);if(cv){CPR_TEX.delete(key);CPR_TEX.set(key,cv);return cv;}
  const N=R*2;cv=document.createElement('canvas');cv.width=cv.height=N;const c=cv.getContext('2d'),img=c.createImageData(N,N),d=img.data,P=CN_PLANET[type]||CN_PLANET.ashen,sd=cnHashStr('planet:'+type)&0xffff;
  const tilt=.32,ct=Math.cos(tilt),st=Math.sin(tilt);
  for(let j=0;j<N;j++)for(let i=0;i<N;i++){
    const nx=(i+.5-R)/R,ny=(j+.5-R)/R,rr=nx*nx+ny*ny;if(rr>1.002)continue;
    const nz=Math.sqrt(Math.max(0,1-rr)),ry=ny*ct-nz*st,rz=ny*st+nz*ct,lon=Math.atan2(nx,rz),lat=Math.asin(cprC(ry,-1,1));
    const col=cprSurf(type,lon/TAU+.5,lat/Math.PI+.5,lat,sd,P),o=(j*N+i)*4,a=cprC((1-Math.sqrt(rr))*R*.9+.5,0,1);
    d[o]=col[0];d[o+1]=col[1];d[o+2]=col[2];d[o+3]=a*255;
  }
  c.putImageData(img,0,0);CPR_TEX.set(key,cv);while(CPR_TEX.size>8)CPR_TEX.delete(CPR_TEX.keys().next().value);return cv;
}
/* one lit sphere: albedo disc + terminator + limb + atmosphere + night-side lights. o={r, moon:true, atm:0..1} */
function cprSphere(g,x,y,r,type,L,t,seed,S,o){
  o=o||{};const pal=CN_PLANET[type]||CN_PLANET.ashen,ka=L.a;
  let zoom=1;try{const m=g.getTransform();zoom=Math.hypot(m.a,m.b)||1;}catch(e){}
  const need=r*zoom,R=need>200?256:need>130?192:need>70?128:72,tex=cprPlanetTex(type,R);
  const atm=o.atm==null?1:o.atm;
  if(atm>0){cnGlow(g,x,y,r*1.55,pal.atm,.16*atm);}
  g.save();g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';g.drawImage(tex,x-r,y-r,r*2,r*2);
  g.beginPath();g.arc(x,y,r,0,TAU);g.clip();
  const ph=o.phase==null?.64:o.phase,D=r*(2.35*ph*ph+.02);
  g.fillStyle=cnRG(g,x+L.x*r*.34,y+L.y*r*.34,r*.15,r*1.2,[[0,cnA(L.col,.1+.14*ka)],[.45,'rgba(0,0,0,0)'],[1,'rgba(0,4,16,.42)']]);g.fillRect(x-r,y-r,r*2,r*2);   // key tint + limb darkening
  g.fillStyle=cnRG(g,x-L.x*D,y-L.y*D,r*.7,r*1.4,[[0,'rgba(2,4,12,.93)'],[.4,'rgba(2,4,12,.9)'],[.62,'rgba(2,4,12,.62)'],[.82,'rgba(2,4,12,.22)'],[1,'rgba(2,4,12,0)']]);g.fillRect(x-r*1.6,y-r*1.6,r*3.2,r*3.2);   // terminator
  if(o.gloss){g.globalCompositeOperation='lighter';cnGlow(g,x+L.x*r*.42,y+L.y*r*.42,r*.35,'#ffffff',.14*ka,{add:true});}
  if(!o.moon){                                                                                  // city lights on the night side
    g.globalCompositeOperation='lighter';const n=Math.round(60*(S&&S.part||1));
    for(let i=0;i<n;i++){const a=cnR(seed,i,1)*TAU,d=Math.sqrt(cnR(seed,i,2))*r*.92,px=x+Math.cos(a)*d,py=y+Math.sin(a)*d;if(((px-x)*L.x+(py-y)*L.y)>-r*.18)continue;g.fillStyle=cnA(pal.city,.3+.3*cnR(seed,i,3));g.fillRect(px,py,Math.max(1,r*.008),Math.max(1,r*.008));}
  }
  g.restore();
  if(atm>0){g.save();g.globalCompositeOperation='lighter';
    g.fillStyle=cnRG(g,x,y,r*.93,r*1.17,[[0,cnA(pal.atm,0)],[.34,cnA(pal.atm,.22*atm)],[1,cnA(pal.atm,0)]]);g.fillRect(x-r*1.2,y-r*1.2,r*2.4,r*2.4);
    g.beginPath();g.rect(x-r*1.3,y-r*1.3,r*2.6,r*2.6);g.arc(x,y,r*.98,0,TAU,true);g.clip('evenodd');                      // brighter on the lit limb
    cnGlow(g,x+L.x*r*.98,y+L.y*r*.98,r*.6,pal.atm,.6*atm*ka+.05);
    g.restore();}
}
CINE_PAINT.prop.planet=(g,x,y,size,p,t,seed,S)=>{const L=cprLight(g,x,y,S);cprSphere(g,x,y,size*.5,CN_PLANET[p.planet]?p.planet:'azure',L,t,seed,S,{gloss:p.planet==='azure'||p.planet==='ice'});};
CINE_PAINT.prop.moon=(g,x,y,size,p,t,seed,S)=>{const L=cprLight(g,x,y,S);cprSphere(g,x,y,size*.42,'moon',L,t,seed,S,{moon:true,atm:0,phase:.58});};

/* ------------------------------------------------ 6. station: a spun habitat ring on a central spine, solar wings, lit windows ------------------------------------------------ */
const CPR_STEEL={hi:'#e3ebf7',mid:'#8c9bb8',lo:'#3d4966',deep:'#141b2e',out:'rgba(5,9,16,.88)'};
function cprStation(g,x,y,size,p,t,seed,S){
  const acc=p.col||'#ffd48a',warm=!!p.col,rm=!!(S&&S.rm);
  g.save();g.translate(x,y);g.rotate(-.16);g.scale(size,size);g.lineJoin='round';g.lineCap='round';
  const L=cprLight(g,0,0,S),K={g,L,P:CPR_STEEL,lw:Math.max(.003,.9/size),len:size,seed,t,u:(S&&S.u)||1,rm};
  const spin=rm?0:t*.14,Rx=.47,Ry=.155,hw=.034,N=30,rimC=L.col;
  /* faint halo of the accent colour: a lamp in the dark */
  if(warm)cnGlow(g,0,0,.9,acc,.1+.04*Math.sin(t*1.3));
  /* solar wings on a boom below the hub (behind everything) */
  for(const sx of[-1,1]){
    g.save();g.translate(sx*.2,.3);const w=.15,h=.07;
    g.beginPath();g.moveTo(-w/2,-h/2);g.lineTo(w/2,-h/2);g.lineTo(w/2+sx*.015,h/2);g.lineTo(-w/2+sx*.015,h/2);g.closePath();
    g.fillStyle=cprLit(g,L,-w/2,-h/2,w/2,h/2,[[0,'#4a7ad0'],[.5,'#1f3f86'],[1,'#0c1a46']]);g.fill();g.clip();
    g.strokeStyle='rgba(224,190,100,.5)';g.lineWidth=K.lw*.7;g.beginPath();for(let i=1;i<5;i++){g.moveTo(-w/2+w*i/5,-h/2);g.lineTo(-w/2+w*i/5+sx*.015,h/2);}for(let j=1;j<3;j++){g.moveTo(-w/2,-h/2+h*j/3);g.lineTo(w/2,-h/2+h*j/3);}g.stroke();
    g.fillStyle='rgba(255,255,255,.14)';g.fillRect(-w/2,-h/2,w*.35,h);g.restore();
    g.beginPath();g.moveTo(sx*.2-.075,.3-.035);g.lineTo(sx*.2+.075,.3-.035);g.lineTo(sx*.2+.075+sx*.015,.3+.035);g.lineTo(sx*.2-.075+sx*.015,.3+.035);g.closePath();g.lineWidth=K.lw;g.strokeStyle='rgba(5,9,16,.85)';g.stroke();
  }
  g.strokeStyle='#4b566e';g.lineWidth=K.lw*2.2;g.beginPath();g.moveTo(-.4,.3);g.lineTo(.4,.3);g.stroke();
  /* the ring: back half (inner wall seen through), then spine + spokes, then the front half */
  const seg=(i,front)=>{
    const a0=i/N*TAU,a1=(i+1)/N*TAU,am=(a0+a1)/2,sn=Math.sin(am);if(front?sn<0:sn>=0)return;
    const pa=a0+spin,mid=cnC01(.5+.5*Math.cos(am-Math.atan2(-L.y,L.x))*(L.a>.05?1:0)),pan=cnHash(seed,((i-Math.floor(spin/TAU*N))%N+N)%N,5);
    const ox0=Math.cos(a0)*Rx,oy0=Math.sin(a0)*Ry,ox1=Math.cos(a1)*Rx,oy1=Math.sin(a1)*Ry,ix0=Math.cos(a0)*(Rx-.055),iy0=Math.sin(a0)*(Ry-.02),ix1=Math.cos(a1)*(Rx-.055),iy1=Math.sin(a1)*(Ry-.02);
    if(front){                                                                                // outer wall under the top face
      g.beginPath();g.moveTo(ox0,oy0);g.lineTo(ox1,oy1);g.lineTo(ox1,oy1+hw);g.lineTo(ox0,oy0+hw);g.closePath();
      g.fillStyle=cnLG(g,0,oy0,0,oy0+hw,[[0,cnMix(CPR_STEEL.mid,rimC,.08*mid)],[1,CPR_STEEL.deep]]);g.fill();g.lineWidth=K.lw*.7;g.strokeStyle='rgba(5,9,16,.8)';g.stroke();
      for(let k=0;k<2;k++){const on=cnHash(seed+7,((i+Math.floor(spin/TAU*N*1.7))%N+N)%N,k+31)<.55,fa=a0+(a1-a0)*(.3+.4*k),wx=Math.cos(fa)*Rx,wy=Math.sin(fa)*Ry+hw*.5;
        g.fillStyle=on?cnA(warm?acc:'#ffe2a0',.9):'rgba(8,12,22,.7)';g.fillRect(wx-.004,wy-.003,.008,.006);}
    }
    g.beginPath();g.moveTo(ox0,oy0);g.lineTo(ox1,oy1);g.lineTo(ix1,iy1);g.lineTo(ix0,iy0);g.closePath();
    const sh=cnMix(CPR_STEEL.lo,CPR_STEEL.hi,.25+.65*mid*(.75+.25*pan));g.fillStyle=front?sh:cnMix(sh,CPR_STEEL.deep,.35);g.fill();
    g.lineWidth=K.lw*.7;g.strokeStyle='rgba(5,9,16,.7)';g.stroke();
    if(pan<.3){g.fillStyle='rgba(255,255,255,.08)';g.fill();}
  };
  for(let i=0;i<N;i++)seg(i,false);
  /* spine: a vertical tube with banded modules, a dish and a docking cone on top */
  cprHull(K,[-.05,-.3,-.05,.32,.05,.32,.05,-.3],{sharp:true,rim:.004,inner:B=>{g.fillStyle='rgba(5,9,16,.45)';for(let i=0;i<9;i++)g.fillRect(-.06,-.28+i*.065,.12,.006);g.fillStyle=cnA(warm?acc:'#9ad8ff',.5);g.fillRect(-.012,-.2,.024,.4);}});
  cprHull(K,[-.07,-.12,-.07,.08,.07,.08,.07,-.12],{k:.3,rim:.005,inner:B=>{g.fillStyle='rgba(5,9,16,.5)';g.fillRect(-.08,-.04,.16,.008);cprWin(K,-.055,.055,-.07,5,.012,.008,warm?acc:'#ffe2a0',.9,3);}});
  cprHull(K,[-.03,-.3,-.01,-.37,.01,-.37,.03,-.3],{sharp:true,rim:.003});
  g.strokeStyle='#8c9bb8';g.lineWidth=K.lw*1.4;g.beginPath();g.moveTo(0,-.37);g.lineTo(0,-.44);g.moveTo(-.025,-.42);g.lineTo(.025,-.42);g.stroke();
  g.save();g.translate(-.09,-.31);g.rotate(-.5);g.fillStyle=CPR_STEEL.mid;g.beginPath();g.ellipse(0,0,.04,.013,0,0,TAU);g.fill();g.lineWidth=K.lw*.8;g.strokeStyle='rgba(5,9,16,.85)';g.stroke();g.restore();
  g.strokeStyle='#323b55';g.lineWidth=K.lw*2.4;                                                  // spokes to the near side of the ring
  for(const a of[.5,1.4,1.75,2.6]){g.beginPath();g.moveTo(Math.cos(a)*.07,Math.sin(a)*.026);g.lineTo(Math.cos(a)*(Rx-.055),Math.sin(a)*(Ry-.02));g.stroke();}
  for(let i=0;i<N;i++)seg(i,true);
  /* running lights and the accent glow */
  g.save();g.globalCompositeOperation='lighter';
  const bl=(per,on,ph)=>rm?.55:(cnFrac((t+ph)/per)<on?1:.12);
  cnGlow(g,0,-.44,.03,'#ff4a3a',.2+.7*bl(1.8,.2,.1),{core:.6});cnGlow(g,-.47,0,.026,'#ff4a3a',.2+.6*bl(2.6,.2,.6));cnGlow(g,.47,0,.026,'#4aff8a',.2+.6*bl(2.6,.2,1.2));cnGlow(g,0,.33,.026,'#ffffff',.2+.6*bl(1.4,.08,.4));
  if(warm){cnGlow(g,0,0,.36,acc,.1);for(let i=0;i<10;i++){const a=i/10*TAU+spin;cnGlow(g,Math.cos(a)*Rx*.98,Math.sin(a)*Ry*.98,.03,acc,.22);}}
  g.restore();
  g.restore();
}
CINE_PAINT.prop.station=cprStation;

/* ------------------------------------------------ 7. beacon: a lamp mast that breathes (dark colours = an unlit lamp) ------------------------------------------------ */
function cprBeacon(g,x,y,size,p,t,seed,S){
  const col=p.col||'#ff8a5a',lum=cnLum(col),on=cnSS(.16,.46,lum),L=cprLight(g,x,y,S),ph=cnHash(seed,1,7)*TAU,u=(S&&S.u)||1,rm=!!(S&&S.rm);
  const H=size*.92,yb=y+size*.46,yt=yb-H,w=Math.max(size*.05,1.1*u),lamp=Math.max(size*.075,2*u);
  const fl=rm?0:(cnFlicker(t,seed,6)-.5)*.16,br=on*cprC(.82+.18*Math.sin(t*1.9+ph)+fl,0,1.15);
  cnShadow(g,x-L.x*size*.12,yb+size*.01,size*.2,size*.045,.42);
  /* soft cone of light on the ground below a lit lamp */
  if(on>.4){g.save();g.globalCompositeOperation='lighter';g.fillStyle=cnLG(g,0,yt,0,yb,[[0,cnA(col,.16*br)],[1,cnA(col,0)]]);g.beginPath();g.moveTo(x-lamp*.8,yt+lamp);g.lineTo(x+lamp*.8,yt+lamp);g.lineTo(x+size*.34,yb);g.lineTo(x-size*.34,yb);g.closePath();g.fill();g.restore();}
  g.save();g.lineJoin='round';g.lineCap='round';
  /* mast: tapered, with a footing, braces and a lit side */
  const base=size*.07;
  g.beginPath();g.moveTo(x-base,yb);g.lineTo(x-w,yt+lamp*1.6);g.lineTo(x+w,yt+lamp*1.6);g.lineTo(x+base,yb);g.closePath();
  g.fillStyle=cprLit(g,L,x-base,yt,x+base,yb,[[0,'#8a97b0'],[.5,'#4a566e'],[1,'#1a2234']]);g.fill();g.lineWidth=Math.max(1,.012*size);g.strokeStyle='rgba(5,9,16,.85)';g.stroke();
  if(size>40){g.strokeStyle='rgba(5,9,16,.5)';g.lineWidth=Math.max(1,.008*size);g.beginPath();for(let i=0;i<5;i++){const f=.15+i*.17,yy=yb-H*f;g.moveTo(x-cprL(base,w,f),yy);g.lineTo(x+cprL(base,w,f),yy-H*.07);}g.stroke();}
  g.fillStyle='#232b3e';g.beginPath();g.ellipse(x,yb,size*.12,size*.03,0,0,TAU);g.fill();g.lineWidth=Math.max(1,.01*size);g.strokeStyle='rgba(5,9,16,.8)';g.stroke();
  /* lamp head: a short barrel with a lens */
  const hy=yt+lamp*.8;
  g.beginPath();g.rect(x-lamp*.8,hy-lamp*.9,lamp*1.6,lamp*1.8);g.fillStyle=cnLG(g,x-lamp,0,x+lamp,0,[[0,'#7a869e'],[1,'#1c2438']]);g.fill();g.stroke();
  g.beginPath();g.arc(x,hy,lamp*.62,0,TAU);
  g.fillStyle=on>0?cnRG(g,x-lamp*.18,hy-lamp*.18,lamp*.05,lamp*.72,[[0,cnMix('#ffffff',col,.15)],[.45,cnA(col,.4+.6*br)],[1,cnShade(col,-.55)]]):cnLG(g,x-lamp,hy-lamp,x+lamp,hy+lamp,['#3a4254','#0c0f18']);
  g.fill();g.lineWidth=Math.max(1,.01*size);g.strokeStyle='rgba(5,9,16,.85)';g.stroke();
  if(on<.4){g.fillStyle='rgba(255,255,255,.22)';g.beginPath();g.ellipse(x-lamp*.2,hy-lamp*.25,lamp*.22,lamp*.13,-.5,0,TAU);g.fill();g.strokeStyle=cnA(L.col,.5*L.a);g.lineWidth=Math.max(1,.01*size);g.beginPath();g.arc(x,hy,lamp*.62,Math.atan2(L.y,L.x)-.8,Math.atan2(L.y,L.x)+.8);g.stroke();}   // an unlit lens only catches the key light
  g.restore();
  if(on>0){
    g.save();g.globalCompositeOperation='lighter';
    cnGlow(g,x,hy,Math.max(lamp*5.5,size*.34)*(.8+.2*br),col,.62*br,{core:.9});cnGlow(g,x,hy,Math.max(lamp*14,size*.9),col,.14*br);
    if(br>.7){g.strokeStyle=cnA(col,.5*(br-.5));g.lineWidth=Math.max(1,.012*size);g.beginPath();g.moveTo(x-lamp*5*br,hy);g.lineTo(x+lamp*5*br,hy);g.moveTo(x,hy-lamp*4*br);g.lineTo(x,hy+lamp*4*br);g.stroke();}
    g.restore();
  }
}
CINE_PAINT.prop.beacon=cprBeacon;

/* ------------------------------------------------ 8. crystal: the game's amber crystal cluster, faceted, glowing from inside ------------------------------------------------ */
function cprCrystal(g,x,y,size,p,t,seed,S){
  const col=p.col||'#ffc83d',L=cprLight(g,x,y,S),rm=!!(S&&S.rm),yb=y+size*.4,n=7,u=(S&&S.u)||1,gl=.8+.2*Math.sin(t*1.3+cnHash(seed,2,2)*TAU);
  cnGlow(g,x,y-size*.05,size*.95,col,.34*gl);
  cnShadow(g,x-L.x*size*.1,yb+size*.02,size*.5,size*.1,.45);
  const hi=cnMix(col,'#ffffff',.55),mid=col,lo=cnMix(col,'#220a00',.6),sh=[];
  for(let i=0;i<n;i++){const k=n===1?0:i/(n-1)-.5,dx=k*.62+(cnHash(seed,i,1)-.5)*.1,h=(.5+.5*Math.cos(k*Math.PI*1.35))*(.52+.4*cnHash(seed,i,2))+.12,w=.1+.07*cnHash(seed,i,3);sh.push({dx,h,w,lean:(cnHash(seed,i,4)-.5)*.16-k*.14,z:Math.abs(k)+cnHash(seed,i,5)*.3});}
  sh.sort((a,b)=>b.z-a.z);
  g.save();g.lineJoin='round';g.lineCap='round';
  /* rubble at the foot */
  for(let i=0;i<5;i++){const rx=x+(cnHash(seed,i,6)-.5)*size*.8,ry=yb+size*.01*(cnHash(seed,i,7)),r=size*(.03+.04*cnHash(seed,i,8));g.fillStyle=cnLG(g,rx-r,ry-r,rx+r,ry+r,['#5a5048','#1a1512']);g.beginPath();g.ellipse(rx,ry,r*1.3,r*.8,0,0,TAU);g.fill();}
  for(const s of sh){
    const bx=x+s.dx*size,h=s.h*size,w=s.w*size,tx=bx+s.lean*size,ty=yb-h,lw=Math.max(.8*u,size*.005);
    const BL=[bx-w/2,yb],BR=[bx+w/2,yb],SL=[bx-w/2+s.lean*size*.55,yb-h*.7],SR=[bx+w/2+s.lean*size*.55,yb-h*.7],MB=[bx+w*.05,yb+w*.1],MS=[bx+s.lean*size*.55+w*.05,yb-h*.68];
    const lf=cnC01(.5-.45*L.x),rf=1-lf;
    const faces=[[[BL,MB,MS,SL],lf],[[MB,BR,SR,MS],rf],[[SL,MS,[tx,ty]],cnC01(lf+.12)],[[MS,SR,[tx,ty]],cnC01(rf+.12)]];
    for(const[f,k]of faces){g.beginPath();g.moveTo(f[0][0],f[0][1]);for(let i=1;i<f.length;i++)g.lineTo(f[i][0],f[i][1]);g.closePath();
      g.fillStyle=cprLit(g,{x:0,y:-1},bx-w,ty,bx+w,yb,[[0,cnMix(mid,hi,k*.9)],[.55,cnMix(lo,mid,.35+k*.7)],[1,cnMix(lo,'#000',.2)]]);g.fill();g.lineWidth=lw;g.strokeStyle='rgba(60,28,0,.6)';g.stroke();}
    g.save();g.globalCompositeOperation='lighter';g.beginPath();g.moveTo(BL[0],BL[1]);g.lineTo(MB[0],MB[1]);g.lineTo(BR[0],BR[1]);g.lineTo(SR[0],SR[1]);g.lineTo(tx,ty);g.lineTo(SL[0],SL[1]);g.closePath();g.clip();
    g.fillStyle=cnRG(g,bx,yb-h*.32,0,h*.6,[[0,cnA(hi,.5*gl)],[1,cnA(col,0)]]);g.fillRect(bx-w*2,ty,w*4,h+w);g.restore();
    g.strokeStyle=cnA('#ffffff',.55*(.4+L.a));g.lineWidth=lw;g.beginPath();g.moveTo(SL[0],SL[1]);g.lineTo(tx,ty);g.moveTo(MS[0],MS[1]);g.lineTo(tx,ty);g.stroke();      // lit edges
  }
  g.restore();
  /* sparkles at the tips */
  if(!rm)for(let i=0;i<3;i++){const s=sh[sh.length-1-i],ph=cnPhase(t,2.4+i*.7,i,seed),a=Math.max(0,Math.sin(ph*Math.PI*2))**6;if(a<.05)continue;const px=x+s.dx*size+s.lean*size,py=yb-s.h*size*.92,r=size*(.06+.05*a);
    g.save();g.globalCompositeOperation='lighter';g.strokeStyle=cnA('#fff8e0',a);g.lineWidth=Math.max(1,u);g.beginPath();g.moveTo(px-r,py);g.lineTo(px+r,py);g.moveTo(px,py-r);g.lineTo(px,py+r);g.stroke();cnGlow(g,px,py,r*.9,'#fff2c0',.6*a,{core:.8});g.restore();}
}
CINE_PAINT.prop.crystal=cprCrystal;

/* ------------------------------------------------ 9. array: a small version of the great ring (dormant / charging / firing / broken) ------------------------------------------------ */
const CPR_AM=['#d2c4aa','#8f8171','#4b433c','#221d1b','#0b0909'];
const CPR_AS={dormant:{lit:0,hot:'#5ac8ff',core:'#c4ecff'},charging:{lit:.62,hot:'#ffc23c',core:'#fff2c0'},firing:{lit:1,hot:'#ff7a44',core:'#fff6ea'},broken:{lit:0,hot:'#ff4a3a',core:'#ff8a5a'}};
function cprArray(g,x,y,size,p,t,seed,S){
  const st=CPR_AS[p.state]?p.state:'dormant',A=Object.assign({},CPR_AS[st]),rm=!!(S&&S.rm);if(p.col){A.hot=p.col;A.core=cnShade(p.col,.65);}
  g.save();g.translate(x,y);g.scale(size,size);g.lineJoin='round';g.lineCap='round';
  const L=cprLight(g,0,0,S),u=((S&&S.u)||1)/size,lw=Math.max(.0028,u),N=26,Ro=.5,Ri=.38,ky=.3,hw=.05,ay=-.2,rot=.03,step=TAU/N,la=Math.atan2(L.y*2.2,L.x);
  const gap=st==='broken'?{a0:-2.5+cnHash(seed,1,1)*.4,span:1.0}:null,inGap=a=>gap&&((((a-gap.a0)%TAU)+TAU)%TAU)<gap.span;
  const P=(r,a,z)=>[Math.cos(a)*r,ay+Math.sin(a)*r*ky+(z||0)];
  const pow=(a)=>st==='firing'||(st==='charging'&&((((a-rot+Math.PI/2)%TAU)+TAU)%TAU)/TAU<A.lit);
  const sp=rm?.3:1,pulse=.5+.5*Math.sin(t*sp*1.3);
  cnGlow(g,0,ay,.95,A.hot,st==='firing'?.2:.06);
  const half=back=>{
    for(let i=0;i<N;i++){
      const a0=i*step+rot+step*.05,a1=(i+1)*step+rot-step*.05,am=(a0+a1)/2,sn=Math.sin(am);if(back?sn>=0:sn<0)continue;if(inGap(am))continue;
      const v=cnHash(seed,i,0xa2),lf=.5+.5*Math.cos(am-la),dead=st==='broken'&&v<.18,pw=!dead&&pow(am);
      const o0=P(Ro,a0),o1=P(Ro,a1),i0=P(Ri,a0),i1=P(Ri,a1);
      if(back){const q0=P(Ri,a0,hw),q1=P(Ri,a1,hw);g.fillStyle='#05070c';cprPoly(g,[i0[0],i0[1],i1[0],i1[1],q1[0],q1[1],q0[0],q0[1]]);g.fill();g.strokeStyle=cnMix(CPR_AM[2],CPR_AM[1],.2+.6*lf);g.lineWidth=lw*1.3;g.beginPath();g.moveTo(i0[0],i0[1]);g.lineTo(q1[0],q1[1]);g.moveTo(i1[0],i1[1]);g.lineTo(q0[0],q0[1]);g.stroke();}
      else{const w0=P(Ro,a0,hw),w1=P(Ro,a1,hw);cprPoly(g,[o0[0],o0[1],o1[0],o1[1],w1[0],w1[1],w0[0],w0[1]]);g.fillStyle=cnLG(g,0,o0[1],0,w0[1],[[0,cnMix(CPR_AM[1],CPR_AM[0],lf*.65)],[.5,cnMix(CPR_AM[2],CPR_AM[1],.4*lf)],[1,CPR_AM[4]]]);g.fill();g.lineWidth=lw;g.strokeStyle='rgba(6,5,5,.75)';g.stroke();
        if(!dead&&cnHash(seed,i,0xa5)>.35){const wp=P(Ro,a0+(a1-a0)*.5,hw*.45);g.fillStyle=st==='firing'?'rgba(255,200,144,.92)':'rgba(255,216,144,.85)';g.fillRect(wp[0]-.004,wp[1]-.003,.008,.006);}}
      cprPoly(g,[o0[0],o0[1],o1[0],o1[1],i1[0],i1[1],i0[0],i0[1]]);
      g.fillStyle=cnLG(g,o0[0],o0[1],i0[0],i0[1],[[0,cnMix(CPR_AM[1],CPR_AM[0],lf*.8)],[.5,cnMix(CPR_AM[1],CPR_AM[2],.35+.4*(1-lf))],[1,cnMix(CPR_AM[2],CPR_AM[3],.55)]]);g.fill();
      if(dead){g.fillStyle='rgba(8,6,6,.55)';g.fill();}
      g.strokeStyle='rgba(6,5,5,.8)';g.lineWidth=lw;g.stroke();
      const mid=P((Ro+Ri)/2,a0),mid1=P((Ro+Ri)/2,a1);g.strokeStyle=pw?cnA(A.hot,.9):dead?'rgba(60,40,30,.4)':st==='dormant'?cnA(A.hot,.28):cnA('#7a6a58',.45);g.lineWidth=lw*1.2;g.beginPath();g.moveTo(mid[0],mid[1]);g.lineTo(mid1[0],mid1[1]);g.stroke();
      if(i%3===1){const nm=P((Ro+Ri)/2,am);g.fillStyle='#0b0e16';g.beginPath();g.ellipse(nm[0],nm[1],.026,.026*ky*1.2,0,0,TAU);g.fill();g.fillStyle=pw?A.hot:cnMix('#26354f',st==='broken'?'#552018':'#3a6aa8',.45);g.beginPath();g.ellipse(nm[0],nm[1],.017,.017*ky*1.2,0,0,TAU);g.fill();if(pw)cnGlow(g,nm[0],nm[1],.08,A.hot,.4,{core:.6});}
      if(i%4===1&&!dead){const b=P(Ro*.965,am),hp=.13+.04*v,bw=.016;g.fillStyle=cnLG(g,b[0]-bw,0,b[0]+bw,0,[[0,cnMix(CPR_AM[0],CPR_AM[1],.3+.4*(1-lf))],[1,CPR_AM[3]]]);cprPoly(g,[b[0]-bw,b[1],b[0]+bw,b[1],b[0]+bw*.35,b[1]-hp*.85,b[0]-bw*.35,b[1]-hp*.85]);g.fill();g.lineWidth=lw;g.strokeStyle='rgba(8,6,6,.85)';g.stroke();
        g.fillStyle=pw?A.core:cnMix('#243b52',A.hot,.2);cprPoly(g,[b[0],b[1]-hp*1.04,b[0]+bw*.8,b[1]-hp*.9,b[0],b[1]-hp*.76,b[0]-bw*.8,b[1]-hp*.9]);g.fill();
        if(pw)cnGlow(g,b[0],b[1]-hp*.9,.07,A.hot,.7,{core:.8});else if(st==='dormant'){const on=cnFrac((t*sp+i*.37)/2.6)<.2?1:.18;cnGlow(g,b[0],b[1]-hp*.9,.03,A.hot,.12+.5*on);}}
    }
  };
  half(true);
  /* spokes to the hub */
  g.strokeStyle=cnLG(g,-.12,0,.12,0,[[0,CPR_AM[1]],[1,CPR_AM[3]]]);g.lineWidth=.014;g.beginPath();g.ellipse(0,ay,.12,.12*ky,0,0,TAU);g.stroke();
  for(let k=0;k<6;k++){const th=.26+k*TAU/6+rot;if(inGap(th))continue;const a=P(.08,th),b=P(Ri*.99,th);g.strokeStyle='rgba(5,6,10,.75)';g.lineWidth=.02;g.beginPath();g.moveTo(a[0],a[1]);g.lineTo(b[0],b[1]);g.stroke();g.strokeStyle=cnMix(CPR_AM[2],CPR_AM[1],.5);g.lineWidth=lw*2;g.stroke();if(st==='charging'||st==='firing'){g.save();g.globalCompositeOperation='lighter';g.strokeStyle=cnA(A.hot,.4);g.lineWidth=lw*2.4;g.stroke();g.restore();}}
  /* focusing ring below on the beam axis (back half), the beam, the front half */
  const fy=ay+.52,fr=.17,ry=fr*ky*1.15,by=ay+.18;
  const focus=front=>{g.save();g.lineCap='butt';const a0=front?0:Math.PI,a1=front?Math.PI:TAU;g.strokeStyle='rgba(5,5,8,.85)';g.lineWidth=fr*.16;g.beginPath();g.ellipse(0,fy,fr,ry,0,a0,a1);g.stroke();g.strokeStyle=cnLG(g,-fr,0,fr,0,[[0,CPR_AM[1]],[.5,CPR_AM[2]],[1,CPR_AM[3]]]);g.lineWidth=fr*.11;g.stroke();g.strokeStyle=cnA(A.hot,.2+.6*(st==='firing'?1:st==='charging'?.5:.12*pulse));g.lineWidth=fr*.04;g.beginPath();g.ellipse(0,fy,fr*.93,ry*.93,0,a0,a1);g.stroke();g.restore();};
  focus(false);
  if(st==='firing'||st==='charging'){const fire=st==='firing',y0=by,y1=fire?.95:by+.2,wt=fire?.05:.008,wb=fire?.16:.03;g.save();g.globalCompositeOperation='lighter';
    const trap=(k,c,a)=>{g.fillStyle=cnLG(g,-wb*k,0,wb*k,0,[[0,cnA(c,0)],[.3,cnA(c,a*.5)],[.5,cnA(c,a)],[.7,cnA(c,a*.5)],[1,cnA(c,0)]]);g.beginPath();g.moveTo(-wt*k,y0);g.lineTo(wt*k,y0);g.lineTo(wb*k,y1);g.lineTo(-wb*k,y1);g.closePath();g.fill();};
    if(fire){trap(3.4,A.hot,.2);trap(2,A.hot,.4);trap(1.2,'#ffb27a',.65);trap(.55,'#fff0dc',.92);}else{trap(2.4,A.hot,.14);trap(1,A.core,.5);}
    g.restore();}
  focus(true);
  /* hub and barrel */
  g.save();g.translate(0,ay);g.scale(1,.9);const hr=.09;g.fillStyle=cnRG(g,-hr*.3,-hr*.35,hr*.1,hr*1.15,[[0,CPR_AM[0]],[.5,CPR_AM[2]],[1,CPR_AM[4]]]);g.beginPath();g.arc(0,0,hr,0,TAU);g.fill();g.lineWidth=lw;g.strokeStyle='rgba(6,5,5,.85)';g.stroke();
  g.fillStyle='#060709';g.beginPath();g.arc(0,0,hr*.6,0,TAU);g.fill();const hot=st==='firing'?1:st==='charging'?.75:st==='broken'?.1:.22+.15*pulse;
  g.fillStyle=cnRG(g,0,0,0,hr*.58,[[0,cnA('#ffffff',.2+.8*hot)],[.4,cnA(A.core,.3+.65*hot)],[1,cnA(A.hot,.15+.35*hot)]]);g.beginPath();g.arc(0,0,hr*.54,0,TAU);g.fill();g.restore();
  g.fillStyle=cnLG(g,-.045,0,.045,0,[[0,cnMix(CPR_AM[0],CPR_AM[1],.4)],[.5,CPR_AM[1]],[1,CPR_AM[3]]]);cprPoly(g,[-.045,ay+.06,.045,ay+.06,.032,by,-.032,by]);g.fill();g.lineWidth=lw;g.strokeStyle='rgba(6,5,5,.85)';g.stroke();
  half(false);
  g.save();g.globalCompositeOperation='lighter';
  if(st==='dormant'||st==='broken'){for(let k=0;k<2;k++){const a=rot-Math.PI/2+cnFrac(t*sp*.05+k*.5)*TAU;if(inGap(a))continue;const q=P((Ro+Ri)/2,a);cnGlow(g,q[0],q[1],.05,st==='broken'?'#ff5a3a':A.hot,.4,{core:.6});}}
  if(st==='charging'||st==='firing'){cnGlow(g,0,by,st==='firing'?.3:.15,A.hot,st==='firing'?.6:.34,{core:.8});const span=TAU*(st==='firing'?1:A.lit);for(const[w,al]of[[.02,.07],[.009,.16],[.004,.5]]){g.strokeStyle=cnA(A.hot,al);g.lineWidth=w;g.beginPath();const c0=P(Ri,rot-Math.PI/2);g.ellipse(0,ay,Ri-.004,(Ri-.004)*ky,0,rot-Math.PI/2,rot-Math.PI/2+span);g.stroke();}}
  if(gap)for(const e of[gap.a0,gap.a0+gap.span]){const q=P((Ro+Ri)/2,e),f=rm?.5:cnFlicker(t,seed+(e>0?7:0),11);cnGlow(g,q[0],q[1],.09,'#ff7a3a',.25+.5*f,{core:f>.55?.8:0});}
  g.restore();
  g.restore();
}
CINE_PAINT.prop.array=cprArray;

/* ------------------------------------------------ 10. banner: a faction standard on a pole, cloth rippling in closed form (streams behind it when it moves) ------------------------------------------------ */
function cprBanner(g,x,y,size,p,t,seed,S){
  const fk=FACTIONS[p.faction]?p.faction:'meridian',c=cnFac(fk),L=cprLight(g,x,y,S),u=((S&&S.u)||1),rm=!!(S&&S.rm),ph=cnHash(seed,1,7)*TAU;
  const mv=Math.hypot(p.vx||0,p.vy||0)/Math.max(1,size)>.05,dir=mv?-1:1,top=y-size*.5,yb=y+size*.5;
  const cw=size*(fk==='aurora'?.78:.62),ch=size*(fk==='obsidian'?.5:fk==='aurora'?.34:.42),px=x-dir*size*.0,cy0=top+size*.05;
  const wind=rm?.35:1,A=ch*(mv?.2:.1)*wind,sp=(mv?5.2:2.6)*(rm?.4:1);
  cnShadow(g,x-L.x*size*.1,yb+size*.01,size*.16,size*.035,.4);
  g.save();g.lineJoin='round';g.lineCap='round';
  /* pole: lit cylinder, ground mound, a finial that tells the faction */
  const pw=Math.max(size*.018,1.2*u);
  g.fillStyle=cnLG(g,x-pw,0,x+pw,0,L.x<0?[[0,'#e6edf8'],[.5,'#8d9ab2'],[1,'#2a3348']]:[[0,'#2a3348'],[.5,'#8d9ab2'],[1,'#e6edf8']]);g.fillRect(x-pw,top,pw*2,size);g.lineWidth=Math.max(1,.006*size);g.strokeStyle='rgba(5,9,16,.8)';g.strokeRect(x-pw,top,pw*2,size);
  g.fillStyle='#3a3228';g.beginPath();g.ellipse(x,yb,size*.07,size*.02,0,0,TAU);g.fill();
  const fin=fk==='obsidian'?'#ff7a5a':fk==='aurora'?'#e8fff6':'#ffd45a';g.fillStyle=fin;g.lineWidth=Math.max(1,.006*size);g.strokeStyle='rgba(5,9,16,.8)';
  if(fk==='obsidian'){g.beginPath();g.moveTo(x,top-size*.09);g.lineTo(x+pw*2.2,top+size*.01);g.lineTo(x-pw*2.2,top+size*.01);g.closePath();g.fill();g.stroke();}
  else if(fk==='aurora'){g.beginPath();g.arc(x,top-size*.025,size*.03,0,TAU);g.fill();g.stroke();g.beginPath();g.arc(x,top-size*.025,size*.05,Math.PI*1.1,Math.PI*1.9);g.strokeStyle=fin;g.lineWidth=Math.max(1,.01*size);g.stroke();}
  else{g.beginPath();g.arc(x,top-size*.015,size*.032,0,TAU);g.fill();g.stroke();}
  /* cloth: n strips, top and bottom edge ripple with a phase that travels away from the pole; trailing edge shape per faction */
  const n=18,wave=(f,o)=>Math.sin(t*sp+f*5.2+o+ph)*A*Math.pow(f,.85)+Math.sin(t*sp*1.7+f*9.1+o)*A*.25*f;
  const tail=f=>fk==='obsidian'?ch*(1-.5*f)+(Math.floor(f*6)%2?0:ch*.1)*f:fk==='aurora'?ch*(1+.9*f*f):ch*(1-(f>.82?(1-Math.abs((f-.91)/.09))*.0:0)); // bottom edge length as a function of f
  const topE=f=>cy0+wave(f,0),botE=f=>{let b=cy0+tail(f)+wave(f,.6);if(fk==='meridian'&&f>.8)b-=ch*.32*cnSS(.8,1,f);return b;};
  const X=f=>x+dir*(pw+f*cw);
  g.beginPath();g.moveTo(X(0),topE(0));for(let i=1;i<=n;i++){const f=i/n;g.lineTo(X(f),topE(f));}
  for(let i=n;i>=0;i--){const f=i/n;g.lineTo(X(f),botE(f));}g.closePath();
  g.fillStyle=cnLG(g,x,cy0,x+dir*cw,cy0+ch,fk==='obsidian'?[[0,'#4a2f38'],[.5,'#1c1015'],[1,'#0a0608']]:fk==='aurora'?[[0,'#fbfffd'],[.5,'#9fe8d6'],[1,c.dark]]:[[0,c.light],[.45,c.base],[1,c.dark]]);g.fill();
  g.save();g.clip();
  /* faction trim and emblem, carried by the cloth */
  const ex=X(.45),ey=(topE(.45)+botE(.45))/2,sl=(topE(.5)-topE(.4))/(cw*.1),er=Math.min(cw,ch)*.28;
  g.fillStyle=cnA(fk==='obsidian'?c.base:fk==='aurora'?c.base:'#ffffff',.9);g.fillRect(Math.min(X(0),X(1)),cy0,cw+pw,ch*.07+Math.abs(A)*0);   // header band (shifted by the wave through the clip)
  g.translate(ex,ey);g.rotate(Math.atan(sl)*.6);g.scale(Math.cos(Math.atan(sl)*.5),1);
  if(fk==='meridian'){g.fillStyle='#ffffff';g.beginPath();g.moveTo(0,-er*1.1);g.lineTo(er*.9,-er*.55);g.lineTo(er*.9,er*.3);g.lineTo(0,er*1.1);g.lineTo(-er*.9,er*.3);g.lineTo(-er*.9,-er*.55);g.closePath();g.fill();g.fillStyle=c.base;g.beginPath();g.moveTo(0,-er*.8);g.lineTo(er*.62,-er*.4);g.lineTo(er*.62,er*.2);g.lineTo(0,er*.8);g.lineTo(-er*.62,er*.2);g.lineTo(-er*.62,-er*.4);g.closePath();g.fill();g.fillStyle='#ffffff';g.fillRect(-er*.08,-er*.5,er*.16,er);g.fillRect(-er*.4,-er*.08,er*.8,er*.16);}
  else if(fk==='obsidian'){g.strokeStyle=c.glow;g.fillStyle=c.base;g.lineWidth=Math.max(1,er*.12);g.beginPath();g.arc(0,0,er*.55,0,TAU);g.stroke();for(let i=0;i<8;i++){const a=i/8*TAU+Math.PI/8;g.beginPath();g.moveTo(Math.cos(a-.2)*er*.6,Math.sin(a-.2)*er*.6);g.lineTo(Math.cos(a)*er*1.15,Math.sin(a)*er*1.15);g.lineTo(Math.cos(a+.2)*er*.6,Math.sin(a+.2)*er*.6);g.closePath();g.fill();}g.fillStyle=c.light;g.beginPath();g.arc(0,0,er*.2,0,TAU);g.fill();}
  else{g.strokeStyle=c.dark;g.lineWidth=Math.max(1,er*.12);g.beginPath();g.arc(0,0,er*.62,0,TAU);g.stroke();g.fillStyle=c.base;g.beginPath();g.moveTo(-er*.5,er*.35);g.quadraticCurveTo(-er*.2,-er*.9,er*.55,-er*.45);g.quadraticCurveTo(er*.1,-er*.1,-er*.5,er*.35);g.closePath();g.fill();g.fillStyle='#ffffff';g.beginPath();g.arc(er*.2,er*.28,er*.17,0,TAU);g.fill();}
  g.restore();
  /* ripple shading: bright where the cloth faces the light, dark in the troughs; edge highlight */
  g.save();g.beginPath();g.moveTo(X(0),topE(0));for(let i=1;i<=n;i++){const f=i/n;g.lineTo(X(f),topE(f));}for(let i=n;i>=0;i--){const f=i/n;g.lineTo(X(f),botE(f));}g.closePath();g.clip();
  for(let i=0;i<n;i++){const f0=i/n,f1=(i+1)/n,sl2=(wave(f1,0)-wave(f0,0))/(cw/n),k=cprC(sl2*-1.6*(dir),-1,1);g.fillStyle=k>0?cnA(L.col,.2*k*(.4+L.a)):cnA('#05070e',.34*-k);g.beginPath();g.moveTo(X(f0),topE(f0));g.lineTo(X(f1),topE(f1));g.lineTo(X(f1),botE(f1));g.lineTo(X(f0),botE(f0));g.closePath();g.fill();}
  g.restore();
  g.beginPath();g.moveTo(X(0),topE(0));for(let i=1;i<=n;i++){const f=i/n;g.lineTo(X(f),topE(f));}for(let i=n;i>=0;i--){const f=i/n;g.lineTo(X(f),botE(f));}g.closePath();g.lineWidth=Math.max(1,.008*size);g.strokeStyle='rgba(5,9,16,.82)';g.stroke();
  g.restore();
}
CINE_PAINT.prop.banner=cprBanner;

/* ------------------------------------------------ 11. holo: glowing wireframes (planet / ring / cross / skull / crown / map / sigil) with a scan band, scanlines, flicker and rare glitch tears ------------------------------------------------ */
const CPR_SHAPES=['planet','ring','cross','skull','crown','map','sigil'];
function cprGl(c,lw,col,a,draw){c.beginPath();draw();c.strokeStyle=cnA(col,a*.2);c.lineWidth=lw*3.6;c.stroke();c.strokeStyle=cnA(col,a*.85);c.lineWidth=lw;c.stroke();c.strokeStyle=cnA('#ffffff',a*.4);c.lineWidth=lw*.38;c.stroke();}
function cprEllipse(c,cx,cy,rx,ry,a0,a1){c.moveTo(cx+Math.cos(a0)*rx,cy+Math.sin(a0)*ry);const n=Math.max(8,Math.ceil(Math.abs(a1-a0)/TAU*48));for(let i=1;i<=n;i++){const a=a0+(a1-a0)*i/n;c.lineTo(cx+Math.cos(a)*rx,cy+Math.sin(a)*ry);}}
/* tiny 3-D wireframe: verts [[x,y,z]...], edges [[i,j]...]; rotate about y by ry, about x by rx, orthographic; back edges dimmer */
function cprWire(c,V,E,ry,rx,lw,col,a,sc){
  const cy=Math.cos(ry),sy=Math.sin(ry),cx=Math.cos(rx),sx=Math.sin(rx),P=V.map(v=>{const x1=v[0]*cy+v[2]*sy,z1=-v[0]*sy+v[2]*cy,y2=v[1]*cx-z1*sx,z2=v[1]*sx+z1*cx;return[x1*(sc||1),y2*(sc||1),z2];});
  for(const pass of[0,1]){c.beginPath();for(const e of E){const A=P[e[0]],B=P[e[1]],front=(A[2]+B[2])/2>=0;if((pass===1)!==front)continue;c.moveTo(A[0],A[1]);c.lineTo(B[0],B[1]);}
    c.strokeStyle=cnA(col,a*(pass?.2:.07));c.lineWidth=lw*3.6;c.stroke();c.strokeStyle=cnA(col,a*(pass?.9:.35));c.lineWidth=lw;c.stroke();if(pass){c.strokeStyle=cnA('#ffffff',a*.4);c.lineWidth=lw*.38;c.stroke();}}
}
const CPR_HOLO={
  planet:(c,H)=>{
    const r=.34,tau=.38,ct=Math.cos(tau),st=Math.sin(tau),spin=H.t*.45;
    cprGl(c,H.lw,H.col,.95,()=>{cprEllipse(c,0,0,r,r,0,TAU);});
    for(let i=-3;i<=3;i++){const ph=i*Math.PI/8,rx=r*Math.cos(ph),cy=-r*Math.sin(ph)*ct,ry=rx*st;cprGl(c,H.lw*.8,H.col,i===0?.9:.5,()=>{cprEllipse(c,0,cy,rx,ry,0,TAU);});}
    for(let j=0;j<6;j++){const lam=j*Math.PI/6+spin,rx=r*Math.abs(Math.sin(lam));cprGl(c,H.lw*.8,H.col,.45,()=>{cprEllipse(c,0,0,Math.max(.004,rx),r,0,TAU);});}
    cprGl(c,H.lw*.8,H.col,.9,()=>{c.moveTo(0,-r*1.18);c.lineTo(0,r*1.18);});
    const ring=cnHSL?0:0;cprGl(c,H.lw*.9,H.col,.6,()=>{cprEllipse(c,0,0,r*1.38,r*1.38*.3,0,TAU);});
    const a=H.t*.7;for(const[rr,al,w]of[[1.38,1,.03]]){const mx=Math.cos(a)*r*rr,my=Math.sin(a)*r*rr*.3;cnGlow(c,mx,my,.045,H.col,.9*al,{core:.8});}
    c.fillStyle=cnA('#fff',.8);for(let i=0;i<16;i++){const lon=cnR(H.seed,i,1)*TAU+spin,lat=(cnR(H.seed,i,2)-.5)*2.2,x=Math.cos(lat)*Math.sin(lon),z=Math.cos(lat)*Math.cos(lon);if(z<0)continue;const y=-Math.sin(lat)*ct+z*st*.0;c.globalAlpha=.4+.5*z;c.fillRect(x*r-.004,y*r-.004,.008,.008);}c.globalAlpha=1;
  },
  ring:(c,H)=>{
    const ky=.36,Ro=.47,Ri=.35,th=.045,spin=H.t*.12,N=64;
    for(const[R,dy]of[[Ro,-th],[Ro,th],[Ri,-th],[Ri,th]])cprGl(c,H.lw,H.col,R===Ro?.95:.75,()=>{cprEllipse(c,0,dy,R,R*ky,0,TAU);});
    cprGl(c,H.lw*.7,H.col,.55,()=>{for(let k=0;k<N;k++){const a=k/N*TAU+spin,s=Math.sin(a),cs=Math.cos(a);c.moveTo(cs*Ri,s*Ri*ky-th);c.lineTo(cs*Ro,s*Ro*ky-th);c.moveTo(cs*Ri,s*Ri*ky+th);c.lineTo(cs*Ro,s*Ro*ky+th);c.moveTo(cs*Ro,s*Ro*ky-th);c.lineTo(cs*Ro,s*Ro*ky+th);}});
    cprGl(c,H.lw*.8,H.col,.6,()=>{for(let k=0;k<72;k++){const a=k/72*TAU-spin*2,s=Math.sin(a),cs=Math.cos(a),l=k%6===0?1.09:1.04;c.moveTo(cs*Ro*1.02,s*Ro*1.02*ky);c.lineTo(cs*Ro*l,s*Ro*l*ky);}});
    cprGl(c,H.lw,H.col,.8,()=>{cprEllipse(c,0,0,Ri*.8,Ri*.8*ky,spin*3,spin*3+2.4);cprEllipse(c,0,0,Ri*.8,Ri*.8*ky,spin*3+3.3,spin*3+5.4);});
    const a=H.t*.5;cnGlow(c,Math.cos(a)*(Ro+Ri)/2,Math.sin(a)*(Ro+Ri)/2*ky,.07,H.col,.9,{core:.8});
  },
  cross:(c,H)=>{
    const a=.14,b=.46,p=[[-a,-b],[a,-b],[a,-a],[b,-a],[b,a],[a,a],[a,b],[-a,b],[-a,a],[-b,a],[-b,-a],[-a,-a]],d=.1,V=[],E=[];
    for(const z of[-d,d])for(const q of p)V.push([q[0],q[1],z]);
    for(let i=0;i<12;i++){E.push([i,(i+1)%12]);E.push([12+i,12+(i+1)%12]);E.push([i,12+i]);}
    cprWire(c,V,E,H.t*.7,.22,H.lw,H.col,.95,.9);
  },
  crown:(c,H)=>{
    const V=[],E=[],n=24,R=.34;for(let i=0;i<n;i++){const a=i/n*TAU;V.push([Math.cos(a)*R,.12,Math.sin(a)*R]);}for(let i=0;i<n;i++)E.push([i,(i+1)%n]);
    const pk=5;for(let k=0;k<pk*2;k++){const a=k/(pk*2)*TAU,h=k%2===0?-.3:-.12,rr=k%2===0?R*1.04:R;V.push([Math.cos(a)*rr,h,Math.sin(a)*rr]);}
    const o=n;for(let k=0;k<pk*2;k++){E.push([o+k,o+(k+1)%(pk*2)]);if(k%2===0){const ai=Math.round(k/(pk*2)*n)%n;E.push([o+k,ai]);E.push([o+k,(ai+1)%n]);}}
    for(let i=0;i<n;i++){V.push([Math.cos(i/n*TAU)*R*.96,.02,Math.sin(i/n*TAU)*R*.96]);E.push([n+pk*2+i,n+pk*2+(i+1)%n]);}
    cprWire(c,V,E,H.t*.5,.32,H.lw,H.col,.95,1);
    const cy=Math.cos(H.t*.5),sy=Math.sin(H.t*.5);for(let k=0;k<pk*2;k+=2){const a=k/(pk*2)*TAU,x=Math.cos(a)*R*1.04,z=Math.sin(a)*R*1.04,x1=x*cy+z*sy,z1=-x*sy+z*cy,y=-.3*Math.cos(.32)-z1*Math.sin(.32);cnGlow(c,x1,y,.035,H.col,.8*(z1>0?1:.4),{core:.8});}
  },
  skull:(c,H)=>{
    const sw=Math.cos(Math.sin(H.t*.6)*.45),X=v=>v*sw;
    cprGl(c,H.lw,H.col,.95,()=>{c.moveTo(X(-.26),.12);c.bezierCurveTo(X(-.4),-.1,X(-.36),-.44,X(0),-.46);c.bezierCurveTo(X(.36),-.44,X(.4),-.1,X(.26),.12);c.lineTo(X(.22),.2);c.lineTo(X(.2),.34);c.lineTo(X(-.2),.34);c.lineTo(X(-.22),.2);c.closePath();});
    for(const s of[-1,1]){cprGl(c,H.lw,H.col,.95,()=>{c.save();c.translate(X(s*.14),-.06);c.scale(sw,1);cprEllipse(c,0,0,.09,.075,0,TAU);c.restore();});cnGlow(c,X(s*.14),-.06,.04,H.col,.35);}
    cprGl(c,H.lw,H.col,.9,()=>{c.moveTo(X(0),.03);c.lineTo(X(-.04),.13);c.lineTo(X(0),.11);c.lineTo(X(.04),.13);c.closePath();});
    cprGl(c,H.lw*.8,H.col,.7,()=>{for(let i=-3;i<=3;i++){c.moveTo(X(i*.052),.22);c.lineTo(X(i*.052),.34);}c.moveTo(X(-.2),.26);c.lineTo(X(.2),.26);});
    cprGl(c,H.lw*.7,H.col,.5,()=>{c.moveTo(X(-.3),-.08);c.lineTo(X(-.22),.1);c.moveTo(X(.3),-.08);c.lineTo(X(.22),.1);c.moveTo(X(.1),-.45);c.lineTo(X(.16),-.34);c.lineTo(X(.12),-.28);});
  },
  map:(c,H)=>{
    const ky=.46,pr=(u,v)=>{const f=.88+.24*(v+.5);return[u*.95*f,v*.9*ky+.0];};
    const quad=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]].map(q=>pr(q[0],q[1]));
    cprGl(c,H.lw*1.2,H.col,.95,()=>{c.moveTo(quad[0][0],quad[0][1]);for(let i=1;i<4;i++)c.lineTo(quad[i][0],quad[i][1]);c.closePath();});
    cprGl(c,H.lw*.6,H.col,.28,()=>{for(let i=1;i<10;i++){const u=-.5+i/10,a=pr(u,-.5),b=pr(u,.5);c.moveTo(a[0],a[1]);c.lineTo(b[0],b[1]);}for(let j=1;j<7;j++){const v=-.5+j/7,a=pr(-.5,v),b=pr(.5,v);c.moveTo(a[0],a[1]);c.lineTo(b[0],b[1]);}});
    for(let k=0;k<4;k++){const cx=(cnR(H.seed,k,1)-.5)*.7,cv=(cnR(H.seed,k,2)-.5)*.6,rad=.1+.1*cnR(H.seed,k,3);for(let lv=0;lv<3;lv++)cprGl(c,H.lw*.7,H.col,.55-lv*.12,()=>{const r=rad*(1-lv*.3);for(let i=0;i<=28;i++){const a=i/28*TAU,w=1+.38*(cnFbm(Math.cos(a)*1.3+k*5,Math.sin(a)*1.3+lv,H.seed,3)-.5)*2,q=pr(cx+Math.cos(a)*r*w,cv+Math.sin(a)*r*w*.8);if(i)c.lineTo(q[0],q[1]);else c.moveTo(q[0],q[1]);}c.closePath();});}
    const sweep=cnFrac(H.t/3.2)*1.2-.1;cprGl(c,H.lw*1.1,H.col,.5,()=>{const a=pr(-.5+sweep,-.5),b=pr(-.5+sweep,.5);c.moveTo(a[0],a[1]);c.lineTo(b[0],b[1]);});
    for(let k=0;k<6;k++){const q=pr((cnR(H.seed,k,5)-.5)*.86,(cnR(H.seed,k,6)-.5)*.8),pu=.5+.5*Math.sin(H.t*3+k*1.7);cnGlow(c,q[0],q[1],.04+.02*pu,H.col,.8,{core:.9});cprGl(c,H.lw*.7,H.col,.6,()=>{c.moveTo(q[0],q[1]);c.lineTo(q[0],q[1]-.05-.04*cnR(H.seed,k,7));});}
    const eb=pr(0,.5);cprGl(c,H.lw*.8,H.col,.4,()=>{cprEllipse(c,0,eb[1]+.12,.18,.05,0,TAU);c.moveTo(-.18,eb[1]+.12);c.lineTo(quad[3][0]*.5,quad[3][1]);c.moveTo(.18,eb[1]+.12);c.lineTo(quad[2][0]*.5,quad[2][1]);});
  },
  sigil:(c,H)=>{
    const sp=H.t*.18;
    cprGl(c,H.lw*1.1,H.col,.95,()=>{cprEllipse(c,0,0,.44,.44,0,TAU);});cprGl(c,H.lw*.9,H.col,.8,()=>{cprEllipse(c,0,0,.37,.37,0,TAU);});
    cprGl(c,H.lw*.7,H.col,.6,()=>{for(let k=0;k<72;k++){const a=k/72*TAU,l=k%6===0?.065:.03;c.moveTo(Math.cos(a)*.44,Math.sin(a)*.44);c.lineTo(Math.cos(a)*(.44+l),Math.sin(a)*(.44+l));}});
    cprGl(c,H.lw*.8,H.col,.7,()=>{for(let k=0;k<8;k++){const a=k/8*TAU-sp*1.5,r0=.385,r1=.425,w=.07,q=cnR(H.seed,k,1);c.moveTo(Math.cos(a-w)*r0,Math.sin(a-w)*r0);c.lineTo(Math.cos(a)*r1,Math.sin(a)*r1);c.lineTo(Math.cos(a+w)*r0,Math.sin(a+w)*r0);if(q>.5){c.moveTo(Math.cos(a)*r0,Math.sin(a)*r0);c.lineTo(Math.cos(a+.02)*r1*.97,Math.sin(a+.02)*r1*.97);}}});
    cprGl(c,H.lw*1.1,H.col,.9,()=>{for(let k=0;k<5;k++){const a0=-Math.PI/2+sp+k*2*TAU/5,a1=-Math.PI/2+sp+(k+1)*2*TAU/5;if(!k)c.moveTo(Math.cos(a0)*.3,Math.sin(a0)*.3);c.lineTo(Math.cos(a1)*.3,Math.sin(a1)*.3);}c.closePath();});
    cprGl(c,H.lw*.7,H.col,.5,()=>{cprEllipse(c,0,0,.13,.13,0,TAU);cprEllipse(c,0,0,.21,.21,-sp*2,-sp*2+2.1);cprEllipse(c,0,0,.21,.21,-sp*2+3.14,-sp*2+5.2);});
    cprGl(c,H.lw,H.col,.95,()=>{c.moveTo(-.08,0);c.quadraticCurveTo(0,-.07,.08,0);c.quadraticCurveTo(0,.07,-.08,0);});cnGlow(c,0,0,.05,H.col,.9,{core:.9});
  }
};
function cprHolo(g,x,y,size,p,t,seed,S){
  const col=p.col||'#5ae8ff',shape=CPR_HOLO[p.shape]?p.shape:'planet',rm=!!(S&&S.rm);
  let zoom=1;try{const m=g.getTransform();zoom=Math.hypot(m.a,m.b)||1;}catch(e){}
  const pad=1.3,side=Math.max(24,Math.min(1100,Math.ceil(size*pad*zoom))),k=side/pad;
  const cv=cnScratch('cprHolo',side,side),c=cv.getContext('2d');
  c.setTransform(1,0,0,1,0,0);c.globalCompositeOperation='source-over';c.globalAlpha=1;c.clearRect(0,0,side,side);
  c.translate(side/2,side/2);c.scale(k,k);c.lineJoin='round';c.lineCap='round';c.globalCompositeOperation='lighter';
  const H={t,seed,col,lw:Math.max(1.5/k,.0045)};
  CPR_HOLO[shape](c,H);
  /* scan band (brightens the lines it crosses) and scanlines (carve the lines), then flicker */
  c.setTransform(1,0,0,1,0,0);c.globalCompositeOperation='source-atop';
  const by=cnFrac(t/(rm?6:2.8)+cnHash(seed,3,3))*side*1.4-side*.2,bh=side*.14;
  c.fillStyle=cnLG(c,0,by-bh,0,by+bh*.4,[[0,cnA('#fff',0)],[.75,cnA(cnMix(col,'#ffffff',.5),.55)],[1,cnA('#fff',0)]]);c.fillRect(0,by-bh,side,bh*1.4);
  c.globalCompositeOperation='destination-out';
  const pat=cnScratch('cprHoloPat',1,3),pg=pat.getContext('2d');pg.setTransform(1,0,0,1,0,0);pg.clearRect(0,0,1,3);pg.fillStyle='rgba(0,0,0,.42)';pg.fillRect(0,0,1,1);
  c.fillStyle=c.createPattern(pat,'repeat');c.fillRect(0,0,side,side);
  const fl=rm?.92:.82+.18*cnFlicker(t,seed,14)+(cnHash(seed,Math.floor(t*18),5)<.03?-.35:0);
  g.save();g.globalCompositeOperation='lighter';g.globalAlpha*=cprC(fl,.3,1);
  const sz=size*pad,gx=x-sz/2,gy=y-sz/2;
  const gl=!rm&&cnHash(seed,Math.floor(t*9),8)<.05;                                            // a rare glitch: one band slides sideways
  if(gl){const sy=cnHash(seed,Math.floor(t*9),9)*side*.8,sh=side*(.05+.08*cnHash(seed,Math.floor(t*9),10)),dx=(cnHash(seed,Math.floor(t*9),11)-.5)*sz*.12;
    g.drawImage(cv,0,0,side,sy,gx,gy,sz,sy/side*sz);g.drawImage(cv,0,sy,side,sh,gx+dx,gy+sy/side*sz,sz,sh/side*sz);g.drawImage(cv,0,sy+sh,side,side-sy-sh,gx,gy+(sy+sh)/side*sz,sz,(side-sy-sh)/side*sz);}
  else g.drawImage(cv,gx,gy,sz,sz);
  cnGlow(g,x,y,size*.7,col,.1);
  g.restore();
}
CINE_PAINT.prop.holo=cprHolo;

/*@@END@@*/
})();
