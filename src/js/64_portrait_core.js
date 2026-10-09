/* =========================================================================
   PORTRAIT CORE — the shared cn* helpers (colour, hash, gradients, scratch canvases, glow) and the public drawPortrait() entry point.
   v4.0: the cinematic engine, backgrounds, props and fx are gone; what remains is what the character portrait painter (64_portraits.js) needs.
   Loads FIRST among the portrait modules:  64_portrait_core (this)  <  64_portraits  (assigns PORTRAIT_PAINT.actor)
   Rendering only: nothing here may read or write simulation state. Painters must be PURE functions of their arguments (no Math.random, no Date /
   performance.now, no state carried between calls) — use cnHash / cnVN with the `seed` argument instead.
   ========================================================================= */

/* ------------------------------------ the registry ------------------------------------ */
const PORTRAIT_PAINT={
  actor:null,     // actor=(g,charId,state,cx,cy,h,opts)   one painter for every character and every mode (64_portraits.js)
  errors:[]       // painter exceptions are caught by drawPortrait, logged once and collected here (tests assert it stays empty)
};

/* ------------------------------------ numeric helpers, seeded hash / noise (closed form, no state) ------------------------------------ */
const cnC01=x=>x<0?0:x>1?1:x;
/* integer mix -> uint32. Arguments are floored to int32, so pass integers (use Math.floor on floats yourself when you want cells). */
function cnH32(a,b,c,d){
  let h=(a|0)^0x9e3779b9;h=Math.imul(h^(h>>>16),0x85ebca6b);
  h^=(b|0)+0x7f4a7c15;h=Math.imul(h^(h>>>13),0xc2b2ae35);
  h^=(c|0)+0x165667b1;h=Math.imul(h^(h>>>16),0x27d4eb2f);
  h^=(d|0)+0x94d049bb;h=Math.imul(h^(h>>>15),0x85ebca6b);
  return(h^(h>>>16))>>>0;
}
const cnHash=(a,b,c,d)=>cnH32(a,b,c,d)/4294967296;                                                // float in [0,1)
function cnHashStr(s){s=String(s);let h=0x811c9dc5;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}   // FNV-1a -> uint32
function cnVN(x,y,seed){                                                                           // 2-D value noise in [0,1)
  const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf),s=seed|0;
  const a=cnHash(xi,yi,s),b=cnHash(xi+1,yi,s),c=cnHash(xi,yi+1,s),d=cnHash(xi+1,yi+1,s);
  return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;
}
const cnFlicker=(t,seed,rate)=>cnVN(t*(rate||8),3.7,seed);                                         // 0..1 irregular flicker

/* ------------------------------------ colour ------------------------------------ */
const CN_COLC=new Map();
function cnCol(c){                                                                                 // any '#rgb' '#rrggbb' '#rrggbbaa' 'rgb()' 'rgba()' -> [r,g,b,a] (cached: never mutate the result)
  if(Array.isArray(c))return c;
  let r=CN_COLC.get(c);if(r)return r;
  let a=[0,0,0,1];const s=String(c==null?'':c).trim().toLowerCase();
  if(s[0]==='#'){
    if(s.length===4||s.length===5)a=[parseInt(s[1]+s[1],16),parseInt(s[2]+s[2],16),parseInt(s[3]+s[3],16),s.length===5?parseInt(s[4]+s[4],16)/255:1];
    else if(s.length>=7)a=[parseInt(s.slice(1,3),16),parseInt(s.slice(3,5),16),parseInt(s.slice(5,7),16),s.length>=9?parseInt(s.slice(7,9),16)/255:1];
  }else{
    const m=/^rgba?\(([^)]+)\)$/.exec(s);
    if(m){const p=m[1].split(',').map(parseFloat);a=[p[0]||0,p[1]||0,p[2]||0,p.length>3&&isFinite(p[3])?p[3]:1];}
    else if(s==='white')a=[255,255,255,1];else if(s==='transparent')a=[0,0,0,0];
  }
  for(let i=0;i<4;i++)if(!isFinite(a[i]))a[i]=i<3?0:1;
  if(CN_COLC.size>800)CN_COLC.clear();
  CN_COLC.set(c,a);return a;
}
const cnA=(c,al)=>{const a=cnCol(c);return'rgba('+(a[0]+.5|0)+','+(a[1]+.5|0)+','+(a[2]+.5|0)+','+(+cnC01(al).toFixed(3))+')';};          // colour with alpha `al` (replaces its alpha)
const cnRGB=(r,g,b,a)=>'rgba('+(r+.5|0)+','+(g+.5|0)+','+(b+.5|0)+','+(+cnC01(a==null?1:a).toFixed(3))+')';
function cnMix(a,b,t){const x=cnCol(a),y=cnCol(b);t=cnC01(t);return'rgba('+(x[0]+(y[0]-x[0])*t+.5|0)+','+(x[1]+(y[1]-x[1])*t+.5|0)+','+(x[2]+(y[2]-x[2])*t+.5|0)+','+(+(x[3]+(y[3]-x[3])*t).toFixed(3))+')';}
const cnShade=(c,k)=>k<0?cnMix(c,'#000',-k):cnMix(c,'#fff',k);                                    // k in -1..1: toward black / toward white
const cnLum=c=>{const a=cnCol(c);return(.2126*a[0]+.7152*a[1]+.0722*a[2])/255;};
const cnFac=f=>(FACTIONS[f]&&FACTIONS[f].col)||NEUTRAL_COL;                                        // faction colour set {base,light,dark,glow}; anything else -> neutral

/* ------------------------------------ gradients (never throw) ------------------------------------ */
function cnStops(q,st){
  if(typeof st[0]==='string')st=st.length===2?[[0,st[0]],[1,st[1]]]:[[0,st[0]],[.5,st[1]],[1,st[2]]];
  for(const s of st){let p=+s[0];p=p<0?0:p>1?1:(p||0);try{q.addColorStop(p,typeof s[1]==='string'?s[1]:cnRGB(...cnCol(s[1])));}catch(e){q.addColorStop(p,'rgba(0,0,0,0)');}}
  return q;
}
const cnFin=(...a)=>{for(let i=0;i<a.length;i++)if(!isFinite(a[i]))return false;return true;};
/* linear gradient. stops = [[pos,css],...]  or  ['#a','#b'] / ['#a','#mid','#b'] shorthand. Returns a CSS colour string instead if the geometry is not finite. */
function cnLG(g,x0,y0,x1,y1,stops){
  if(!cnFin(x0,y0,x1,y1))return typeof stops[0]==='string'?stops[0]:stops[0][1];
  if(x0===x1&&y0===y1)y1+=1e-3;
  return cnStops(g.createLinearGradient(x0,y0,x1,y1),stops);
}
/* radial gradient (concentric circles) */
function cnRG(g,x,y,r0,r1,stops){
  if(!cnFin(x,y,r0,r1)||r1<=0)return typeof stops[0]==='string'?stops[0]:stops[0][1];
  return cnStops(g.createRadialGradient(x,y,Math.max(0,r0),x,y,Math.max(r1,r0+1e-3)),stops);
}

/* ------------------------------------ scratch canvas, glow ------------------------------------ */
const CN_SCR={};
function cnScratch(name,w,h){                                                                       // reusable canvas (contents undefined, resized on demand). Do not nest two uses of the same name.
  w=Math.max(1,Math.ceil(w));h=Math.max(1,Math.ceil(h));
  let c=CN_SCR[name];
  if(!c){c=CN_SCR[name]=document.createElement('canvas');c.width=w;c.height=h;}
  else if(c.width!==w||c.height!==h){c.width=w;c.height=h;}
  return c;
}

/* ------------------------------------ 7. light, glow, bloom, shadow ------------------------------------ */
/* additive soft glow; a = peak alpha, o = {core:0..1 white-hot centre, add:false for normal blending, squash:y-scale} */
function cnGlow(g,x,y,r,col,a,o){
  if(!(r>0)||!(a>0)||!cnFin(x,y,r))return;
  o=o||{};const c=cnCol(col);
  g.save();g.globalCompositeOperation=o.add===false?'source-over':'lighter';
  if(o.squash){g.translate(x,y);g.scale(1,o.squash);x=0;y=0;}
  g.fillStyle=cnRG(g,x,y,0,r,[[0,cnA(c,a)],[.12,cnA(c,a*.8)],[.3,cnA(c,a*.4)],[.55,cnA(c,a*.14)],[.8,cnA(c,a*.04)],[1,cnA(c,0)]]);
  g.fillRect(x-r,y-r,r*2,r*2);
  if(o.core){g.fillStyle=cnRG(g,x,y,0,r*.22,[[0,cnA('#fff',a*o.core)],[1,cnA('#fff',0)]]);g.fillRect(x-r*.22,y-r*.22,r*.44,r*.44);}
  g.restore();
}
/* ====================================================================================================================
   PUBLIC portrait entry point (also used for 64 px avatar chips by the campaign UI).
     drawPortrait(g,charId,expr,cx,cy,h,opts)   (cx,cy) = centre of the bust box, h = box height in px.
     opts: {face:'l'|'r', mode:'bust|silhouette|shadow|hologram', talk:0..1, blink:0..1, t:seconds, seed, bottom:px (torso extends to here), key, lights, rim, tod, faction, u}
   ==================================================================================================================== */
function drawPortrait(g,charId,expr,cx,cy,h,opts){
  const fn=PORTRAIT_PAINT.actor;if(!fn||!g||!(h>0))return;
  opts=opts||{};
  const st={expr:expr||'neutral',mode:opts.mode||'bust',talk:opts.talk||0,blink:opts.blink||0,face:opts.face||'r',t:opts.t||0};
  const o=Object.assign({W:g.canvas?g.canvas.width:0,H:g.canvas?g.canvas.height:0,bottom:cy+h*.5,seed:cnHashStr(charId),u:h/400,key:null,lights:[],rim:null,tod:'interior',faction:null},opts);
  try{fn(g,charId,st,cx,cy,h,o);}catch(e){if(PORTRAIT_PAINT.errors.length<50)PORTRAIT_PAINT.errors.push('actor: '+(e&&e.message));}
}
