/* =========================================================================
   CINEMATIC ART (1/2) — the painter REGISTRY, shared helpers, shared palettes and default placeholder painters.
   Contract: docs/CINEMATIC_SPEC.md §5 (painter interfaces). This file loads FIRST among the cinematic modules:
     64_cine_art  (this)  <  64_cine_bg_ground  <  64_cine_bg_space  <  64_cine_portraits  <  64_cine_props  <  65_cine_fx  <  66_cine (engine)
   so every art file can assign into CINE_PAINT and call the cn* helpers at load time. Art files REPLACE entries; they never need to touch the engine.
   Rendering only: nothing here may read or write simulation state. Painters must be PURE functions of their arguments (no Math.random, no Date /
   performance.now, no state carried between calls) — use cnHash / cnR / cnVN / cnFbm with the `seed` argument and the time `t` argument instead.
   ========================================================================= */

/* ------------------------------------ 1. the registry ------------------------------------ */
const CINE_PAINT={
  bg:{},          // bg[kind]=(g,W,H,p,t,seed,S)     kind in CINE_BG        fn.static=true -> baked once per (scene,size); fn.anim=(...) optional per-frame overlay
  prop:{},        // prop[kind]=(g,x,y,size,p,t,seed,S)  kind in CINE_PROPS
  fx:{},          // fx[kind]=(g,W,H,e,t,seed,S)     kind in CINE_FX
  actor:null,     // actor=(g,charId,state,cx,cy,h,opts)   one painter for every character and every mode
  grade:null,     // grade=(g,W,H,G,t,seed,S)        colour grade of the finished frame (default implementation below)
  trans:{},       // trans[kind]=(g,W,H,k,dir,seed,S)   kind in CINE_TRANS
  errors:[],      // painter exceptions are caught by the engine, logged once and collected here (tests assert it stays empty)
  labels:true     // placeholders print a small debug label when true (real painters never do)
};

/* ------------------------------------ 2. numeric helpers ------------------------------------ */
const cnC01=x=>x<0?0:x>1?1:x;
const cnFrac=x=>x-Math.floor(x);
const cnSS=(a,b,x)=>{const t=cnC01((x-a)/((b-a)||1e-9));return t*t*(3-2*t);};                  // smoothstep(a,b,x)
const cnEaseF={lin:k=>k,in:k=>k*k,out:k=>1-(1-k)*(1-k),inout:k=>k*k*(3-2*k)};
const cnEase=(name,k)=>{k=cnC01(k);const f=cnEaseF[name];return f?f(k):k;};                       // name in CINE_EASE
const cnMap=(x,a,b,c,d)=>c+(d-c)*cnC01((x-a)/((b-a)||1e-9));                                      // linear remap, clamped

/* ------------------------------------ 3. seeded hash / noise (closed form, no state) ------------------------------------ */
/* integer mix -> uint32. Arguments are floored to int32, so pass integers (use Math.floor on floats yourself when you want cells). */
function cnH32(a,b,c,d){
  let h=(a|0)^0x9e3779b9;h=Math.imul(h^(h>>>16),0x85ebca6b);
  h^=(b|0)+0x7f4a7c15;h=Math.imul(h^(h>>>13),0xc2b2ae35);
  h^=(c|0)+0x165667b1;h=Math.imul(h^(h>>>16),0x27d4eb2f);
  h^=(d|0)+0x94d049bb;h=Math.imul(h^(h>>>15),0x85ebca6b);
  return(h^(h>>>16))>>>0;
}
const cnHash=(a,b,c,d)=>cnH32(a,b,c,d)/4294967296;                                                // float in [0,1)
const cnR=cnHash;                                                                                 // alias: cnR(seed,i,j) = j-th random number of particle i
function cnHashStr(s){s=String(s);let h=0x811c9dc5;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}   // FNV-1a -> uint32
const cnRng=mulberry32;                                                                           // sequential PRNG for static bakes: const r=cnRng(seed); r()
function cnVN(x,y,seed){                                                                           // 2-D value noise in [0,1)
  const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf),s=seed|0;
  const a=cnHash(xi,yi,s),b=cnHash(xi+1,yi,s),c=cnHash(xi,yi+1,s),d=cnHash(xi+1,yi+1,s);
  return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;
}
function cnFbm(x,y,seed,oct,lac,gain){                                                             // fractal value noise in [0,1)
  oct=oct||4;lac=lac||2;gain=gain||.5;let s=0,a=1,n=0;
  for(let i=0;i<oct;i++){s+=a*cnVN(x,y,(seed|0)+i*131);n+=a;x=x*lac+17.3;y=y*lac+9.1;a*=gain;}
  return s/n;
}
const cnN1=(x,seed)=>cnVN(x,.5,seed);                                                              // 1-D smooth noise (time flicker)
const cnFlicker=(t,seed,rate)=>cnVN(t*(rate||8),3.7,seed);                                         // 0..1 irregular flicker
function cnBlink(t,seed){                                                                          // eyelid closure 0..1 (blink every ~3 s, 17 % double blinks)
  const per=3.1,o=cnHash(seed,0,77)*per,u=t+o,k=Math.floor(u/per),ph=u-k*per,c=.2+cnHash(seed,k,78)*(per-.7);
  let v=Math.max(0,1-Math.abs(ph-c)/.085);
  if(cnHash(seed,k,79)<.17)v=Math.max(v,Math.max(0,1-Math.abs(ph-c-.3)/.085));
  return v;
}
const cnN=(n,S)=>Math.max(1,Math.round(n*(S&&S.part!=null?S.part:1)));                           // quality-scaled particle count (battery tier halves it)
const cnPhase=(t,period,i,seed)=>cnFrac(t/period+cnR(seed,i,9));                                    // looping 0..1 phase with a per-particle random offset

/* ------------------------------------ 4. colour ------------------------------------ */
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
const cnHSL=(h,s,l,a)=>'hsla('+(((h%360)+360)%360).toFixed(1)+','+(s*100).toFixed(1)+'%,'+(l*100).toFixed(1)+'%,'+(a==null?1:+cnC01(a).toFixed(3))+')';
const cnFac=f=>(FACTIONS[f]&&FACTIONS[f].col)||NEUTRAL_COL;                                        // faction colour set {base,light,dark,glow}; anything else -> neutral
/* theme tokens from style.css :root (title card, subtitles) — resolved once, with a fallback for non-DOM contexts */
const CN_TOKC={};
function cnTok(name,fb){
  if(CN_TOKC[name])return CN_TOKC[name];
  let v='';try{v=getComputedStyle(document.documentElement).getPropertyValue(name).trim();}catch(e){}
  return CN_TOKC[name]=v||fb;
}

/* ------------------------------------ 5. gradients (never throw) ------------------------------------ */
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
function cnRG2(g,x0,y0,r0,x1,y1,r1,stops){                                                          // two-circle radial gradient
  if(!cnFin(x0,y0,r0,x1,y1,r1))return typeof stops[0]==='string'?stops[0]:stops[0][1];
  return cnStops(g.createRadialGradient(x0,y0,Math.max(0,r0),x1,y1,Math.max(0,r1)),stops);
}

/* ------------------------------------ 6. scratch canvases ------------------------------------ */
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
/* soft contact shadow ellipse (ground units, props). a = peak alpha */
function cnShadow(g,x,y,rx,ry,a){
  if(!(rx>0)||!(ry>0))return;
  g.save();g.translate(x,y);g.scale(1,ry/rx);g.fillStyle=cnRG(g,0,0,0,rx,[[0,'rgba(0,0,0,'+(a==null?.45:a)+')'],[.6,'rgba(0,0,0,'+(a==null?.45:a)*.4+')'],[1,'rgba(0,0,0,0)']]);g.fillRect(-rx,-rx,rx*2,rx*2);g.restore();
}
/* small LRU of full-resolution canvases (vignette, grade overlay): a 1:1 blit costs ~0.3 ms, a scaled bilinear one ~2.2 ms in software raster, so these are baked at frame size */
const CN_FULL=new Map();
function cnFull(key,w,h,bake){
  let c=CN_FULL.get(key);
  if(c){CN_FULL.delete(key);CN_FULL.set(key,c);return c;}
  c=document.createElement('canvas');c.width=w;c.height=h;bake(c.getContext('2d'),w,h);CN_FULL.set(key,c);
  while(CN_FULL.size>5)CN_FULL.delete(CN_FULL.keys().next().value);return c;
}
/* whole-frame bloom: blurred, squared copy of the frame screened back on top. Skipped by the engine on the battery tier. g.canvas must be the frame buffer. */
function cnBloom(g,amt){
  const cv=g.canvas,W=cv.width,H=cv.height;if(!(amt>0)||W<32||H<32)return;
  const w1=Math.max(8,W>>3),h1=Math.max(8,H>>3),a=cnScratch('bloomA',w1,h1),ag=a.getContext('2d');
  ag.setTransform(1,0,0,1,0,0);ag.globalAlpha=1;ag.globalCompositeOperation='copy';ag.imageSmoothingEnabled=true;ag.imageSmoothingQuality='low';ag.drawImage(cv,0,0,w1,h1);
  ag.globalCompositeOperation='multiply';ag.drawImage(a,0,0);                                        // squaring keeps highlights, drops mid-tones
  const w2=Math.max(4,w1>>2),h2=Math.max(4,h1>>2),b=cnScratch('bloomB',w2,h2),bg=b.getContext('2d');   // wide halo at 1/32
  bg.setTransform(1,0,0,1,0,0);bg.globalCompositeOperation='copy';bg.imageSmoothingEnabled=true;bg.drawImage(a,0,0,w2,h2);
  ag.globalCompositeOperation='lighter';ag.globalAlpha=.9;ag.drawImage(b,0,0,w1,h1);ag.globalAlpha=1;       // tight + wide glow summed at the tiny size
  const w3=Math.max(8,W>>1),h3=Math.max(8,H>>1),c=cnScratch('bloomC',w3,h3),cg=c.getContext('2d');      // smooth up to half size (cheap: a quarter of the pixels) ...
  cg.setTransform(1,0,0,1,0,0);cg.globalAlpha=1;cg.globalCompositeOperation='copy';cg.imageSmoothingEnabled=true;cg.imageSmoothingQuality='low';cg.drawImage(a,0,0,w3,h3);
  g.save();g.setTransform(1,0,0,1,0,0);g.globalCompositeOperation='screen';g.imageSmoothingEnabled=false;g.globalAlpha=amt*.8;g.drawImage(c,0,0,W,H);g.restore();   // ... then 2x nearest: 2 px blocks inside a blur are invisible
}
/* cached vignette: transparent centre -> col at the corners. s = strength 0..1. lift (0..~.1) + liftCol add a faint veil that raises the blacks (filmic faded shadows) in the same pass */
function cnVignette(g,W,H,s,col,lift,liftCol){
  lift=lift>0?lift:0;s=s>0?cnC01(s):0;if(!s&&!lift)return;
  const key='vig'+W+'x'+H+'|'+col+'|'+Math.round(s*50)+'|'+(lift?lift+(liftCol||'#0a1430'):0);
  const c=cnFull(key,W,H,(q,w,h)=>{
    if(lift){q.fillStyle=cnA(liftCol||'#0a1430',lift);q.fillRect(0,0,w,h);}
    if(s){const r1=Math.hypot(w,h)/2;q.fillStyle=cnRG(q,w/2,h/2,r1*.38,r1*1.02,[[0,cnA(col,0)],[.55,cnA(col,.30*s)],[1,cnA(col,.92*s)]]);q.fillRect(0,0,w,h);}});
  g.save();g.globalAlpha=1;g.globalCompositeOperation='source-over';g.drawImage(c,0,0);g.restore();
}

/* ------------------------------------ 8. text with letter-spacing ------------------------------------ */
const CN_FONT='ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif';
const CN_SERIF='"Palatino Linotype",Palatino,"Book Antiqua",Georgia,"Times New Roman",serif';
/* o={size,font,weight,italic,track(em),align:'left|center|right',base,fill,stroke,lw,shadow:{col,blur,dy},glow:{col,blur}}  returns the drawn width */
function cnText(g,str,x,y,o){
  o=o||{};str=String(str);const size=o.size||24;
  g.font=(o.italic?'italic ':'')+(o.weight||'600')+' '+size+'px '+(o.font||CN_FONT);g.textBaseline=o.base||'alphabetic';g.textAlign='left';
  const chars=[...str],track=(o.track||0)*size;let widths=null,total;
  if(track){widths=chars.map(ch=>g.measureText(ch).width);total=widths.reduce((a,b)=>a+b,0)+track*(chars.length-1);}else total=g.measureText(str).width;
  const x0=o.align==='center'?x-total/2:o.align==='right'?x-total:x;
  g.save();
  if(o.shadow){g.shadowColor=o.shadow.col||'rgba(0,0,0,.7)';g.shadowBlur=o.shadow.blur||0;g.shadowOffsetY=o.shadow.dy||0;}
  if(o.glow){g.shadowColor=o.glow.col;g.shadowBlur=o.glow.blur;g.shadowOffsetY=0;}
  g.fillStyle=o.fill||'#fff';
  if(o.stroke){g.strokeStyle=o.stroke;g.lineWidth=o.lw||2;g.lineJoin='round';}
  if(!track){if(o.stroke)g.strokeText(str,x0,y);g.fillText(str,x0,y);}
  else{let cx=x0;for(let i=0;i<chars.length;i++){if(o.stroke)g.strokeText(chars[i],cx,y);g.fillText(chars[i],cx,y);cx+=widths[i]+track;}}
  g.restore();return total;
}
function cnWrap(g,str,maxW){                                                                         // greedy word wrap with the current g.font -> array of lines
  const words=String(str).split(/\s+/),lines=[];let cur='';
  for(const w of words){const t=cur?cur+' '+w:w;if(cur&&g.measureText(t).width>maxW){lines.push(cur);cur=w;}else cur=t;}
  if(cur)lines.push(cur);return lines;
}

/* ------------------------------------ 9. shared palettes (colour data so every art file agrees) ------------------------------------ */
const CN_PLANET={   // base lit colour, light = lit highlight, dark = night side, atm = atmosphere rim, city = night-side city lights, land = continent / feature colour
  azure :{base:'#2f78c8',light:'#8fd0ff',dark:'#0b2a5a',atm:'#7fc8ff',city:'#ffd9a0',land:'#3d9a6a'},
  ember :{base:'#c8481f',light:'#ffb070',dark:'#3a0c05',atm:'#ff8a50',city:'#ffcf80',land:'#7a2210'},
  verdant:{base:'#3f9a4a',light:'#b8f08a',dark:'#0d3a1c',atm:'#a8ffb0',city:'#fff0a8',land:'#2f6a30'},
  ice   :{base:'#9fd0e8',light:'#f0fbff',dark:'#2a5878',atm:'#cfeaff',city:'#bfe8ff',land:'#d8f0fa'},
  ashen :{base:'#6a6670',light:'#c8c4d0',dark:'#1a1820',atm:'#a8a4b4',city:'#ffb866',land:'#4a4650'},
  violet:{base:'#7a46c0',light:'#d8b0ff',dark:'#24104a',atm:'#c890ff',city:'#ffe0f0',land:'#522a8a'}
};
const CN_NEBULA={blue:['#0b1e5a','#2a5ad0','#9ad0ff'],red:['#3a0a10','#c02a2a','#ff9a70'],teal:['#06303a','#17a8a0','#9affe0'],violet:['#1c0a3a','#7a3ad0','#e0a0ff'],gold:['#3a2406','#d09a2a','#ffe8a0']};   // [dark, mid, light]; 'none' -> undefined
const CN_BIOME={    // sky = [zenith, horizon] (day), ground = [far, near], rock, accent
  dust   :{sky:['#6c7fa0','#e6c79a'],ground:['#a07c52','#4a3622'],rock:'#6a5038',accent:'#e0b070'},
  crystal:{sky:['#3a3a8a','#c0a0ff'],ground:['#4a3a7a','#1a1236'],rock:'#3a2c66',accent:'#9ae8ff'},
  ash    :{sky:['#3a3438','#8a7c78'],ground:['#5a5256','#1c181c'],rock:'#3a3236',accent:'#ff7a4a'},
  green  :{sky:['#4a8ad0','#cfeed8'],ground:['#4f9a48','#1e4a24'],rock:'#5a6a50',accent:'#d8f08a'},
  ice    :{sky:['#6a9ad0','#eaf6ff'],ground:['#cfe6f4','#7aa8c8'],rock:'#8aa8c0',accent:'#ffffff'}
};
const CN_TOD={      // sky gradient top->bottom, sun/moon colour, key-light direction (x,y in 0..1 frame coords), mood tint
  day  :{sky:['#2f6fc0','#a9d4ff'],sun:'#fff2c8',key:{x:.22,y:.08,col:'#fff2d0',a:.7},tint:null},
  dusk :{sky:['#1c1c4a','#ff8a4a'],sun:'#ff7a3a',key:{x:.88,y:.5,col:'#ff9a5a',a:.8},tint:'#ff7a3a'},
  night:{sky:['#02040e','#14224a'],sun:'#bcd4ff',key:{x:.5,y:0,col:'#7aa0ff',a:.45},tint:'#2a3a8a'},
  dawn :{sky:['#2a2a6a','#ffc0a0'],sun:'#ffc890',key:{x:.1,y:.52,col:'#ffc0a0',a:.7},tint:'#ff9a8a'}
};

/* ------------------------------------ 10. starfield, nebula, sphere (reused by backgrounds, props, fx) ------------------------------------ */
/* static starfield over the rect (x,y,w,h). n = star count, o={u:unit scale, twinkle:t (seconds) for animated twinkle, tint:0..1 colour variation} */
function cnStars(g,x,y,w,h,seed,n,o){
  o=o||{};const u=o.u||1,tw=o.twinkle,tint=o.tint==null?.6:o.tint;
  g.save();
  for(let i=0;i<n;i++){
    const px=x+cnR(seed,i,1)*w,py=y+cnR(seed,i,2)*h,m=cnR(seed,i,3),size=(m>.985?1.9:m>.9?1.2:.7)*u;
    let a=.35+.65*cnR(seed,i,4);if(tw!=null)a*=.65+.35*Math.sin(tw*(1.2+cnR(seed,i,5)*2.4)+cnR(seed,i,6)*TAU);
    const tc=cnR(seed,i,7);g.fillStyle=tc<.18*tint?cnA('#ffcfa0',a):tc<.4*tint?cnA('#a8c8ff',a):cnA('#ffffff',a);
    g.fillRect(px-size/2,py-size/2,size,size);
    if(m>.985){g.fillStyle=cnA('#cfe0ff',a*.35);g.fillRect(px-size*3.2,py-size*.18,size*6.4,size*.36);g.fillRect(px-size*.18,py-size*3.2,size*.36,size*6.4);}
  }
  g.restore();
}
/* baked nebula (static bakes only: costs ~30 ms at 1280x720). pal=[dark,mid,light], o={density 0..1,scale,alpha,warp,cell(px per sample)} */
function cnNebula(g,x,y,w,h,seed,pal,o){
  if(!pal)return;o=o||{};
  const cell=o.cell||Math.max(3,Math.round(w/240)),cw=Math.max(8,Math.ceil(w/cell)),ch=Math.max(8,Math.ceil(h/cell));
  const cv=cnScratch('nebula',cw,ch),cx=cv.getContext('2d'),img=cx.createImageData(cw,ch),d=img.data;
  const c0=cnCol(pal[0]),c1=cnCol(pal[1]),c2=cnCol(pal[2]),sc=(o.scale||1)*2.4,dens=o.density==null?.55:o.density,wp=o.warp==null?1.6:o.warp,al=o.alpha==null?.9:o.alpha,asp=h/w;
  const thr=.62-dens*.3;
  for(let j=0;j<ch;j++)for(let i=0;i<cw;i++){
    const nx=i/cw*sc,ny=j/cw*sc,wx=cnFbm(nx+5.2,ny+1.3,seed,3),wy=cnFbm(nx+1.7,ny+9.2,seed+7,3),n=cnFbm(nx+wp*(wx-.5),ny+wp*(wy-.5),seed+3,5);
    const v=cnSS(thr,thr+.38,n),o4=(j*cw+i)*4,m=cnSS(0,.55,v),hl=cnSS(.55,1,v);
    d[o4]=c0[0]+(c1[0]-c0[0])*m+(c2[0]-c1[0])*hl;d[o4+1]=c0[1]+(c1[1]-c0[1])*m+(c2[1]-c1[1])*hl;d[o4+2]=c0[2]+(c1[2]-c0[2])*m+(c2[2]-c1[2])*hl;d[o4+3]=255*Math.pow(v,1.25)*al;
  }
  cx.putImageData(img,0,0);
  g.save();g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';g.drawImage(cv,x,y,w,h);g.restore();
}
/* lit sphere with terminator and atmosphere rim. pal from CN_PLANET. o={phase 0..1 lit fraction, light angle (rad, direction the light comes from), seed, detail:false, atm:0..1 rim strength, night:true city lights} */
function cnSphere(g,x,y,r,pal,o){
  if(!(r>0))return;o=o||{};
  const ph=o.phase==null?.62:cnC01(o.phase),la=o.light==null?-2.3:o.light,lx=Math.cos(la),ly=Math.sin(la);
  g.save();g.beginPath();g.arc(x,y,r,0,TAU);g.clip();
  g.fillStyle=cnRG2(g,x+lx*r*.38,y+ly*r*.38,r*.04,x,y,r*1.08,[[0,pal.light],[.42,pal.base],[1,pal.dark]]);g.fillRect(x-r,y-r,r*2,r*2);
  if(o.detail!==false){
    const rg=cnRng(o.seed||1);g.globalAlpha=.34;
    for(let i=0;i<16;i++){const by=y+(rg()*2-1)*r*.92,bh=r*(.03+rg()*.1),bw=Math.sqrt(Math.max(0,r*r-(by-y)*(by-y)));g.fillStyle=rg()<.5?pal.land:pal.dark;g.beginPath();g.ellipse(x+(rg()-.5)*r*.25,by,bw*(.5+rg()*.5),bh,0,0,TAU);g.fill();}
    g.globalAlpha=1;
  }
  const D=r*(2.35*ph*ph+.02);                                                                          // shadow disc slides off as the lit fraction grows
  g.fillStyle=cnRG(g,x-lx*D,y-ly*D,r*.78,r*1.34,[[0,'rgba(2,4,10,.96)'],[.72,'rgba(2,4,10,.92)'],[1,'rgba(2,4,10,0)']]);g.fillRect(x-r*1.6,y-r*1.6,r*3.2,r*3.2);
  if(o.night){g.globalCompositeOperation='lighter';for(let i=0;i<46;i++){const a=cnR(o.seed||1,i,1)*TAU,d=Math.sqrt(cnR(o.seed||1,i,2))*r*.9,px=x+Math.cos(a)*d,py=y+Math.sin(a)*d;
      if(((px-x)*lx+(py-y)*ly)>0)continue;g.fillStyle=cnA(pal.city,.5);g.fillRect(px,py,Math.max(1,r*.012),Math.max(1,r*.012));}}
  g.restore();
  const at=o.atm==null?1:o.atm;
  if(at>0){g.save();g.globalCompositeOperation='lighter';g.fillStyle=cnRG(g,x,y,r*.94,r*1.16,[[0,cnA(pal.atm,0)],[.38,cnA(pal.atm,.5*at)],[1,cnA(pal.atm,0)]]);g.fillRect(x-r*1.2,y-r*1.2,r*2.4,r*2.4);g.restore();}
}

/* ------------------------------------ 11. frame-aware helpers for painters ------------------------------------ */
/* fill the whole area a background must cover (S.fill, which extends past the frame so camera moves never expose an edge) */
function cnFillBg(g,S,style){const F=S.fill;g.fillStyle=style;g.fillRect(F.x,F.y,F.w,F.h);}
/* small debug label used by placeholder painters */
function cnLabel(g,W,H,txt,S){
  if(!CINE_PAINT.labels)return;const u=(S&&S.u)||1,f=Math.max(9,11*u);
  g.save();g.font='600 '+f+'px '+CN_FONT;g.textBaseline='bottom';const w=g.measureText(txt).width+8*u;
  g.fillStyle='rgba(0,0,0,.45)';g.fillRect(8*u,H-8*u-f-4*u,w,f+6*u);g.fillStyle='rgba(220,235,255,.85)';g.fillText(txt,12*u,H-9*u);g.restore();
}
const cnParam=p=>Object.keys(p).filter(k=>k!=='k').map(k=>k+'='+(typeof p[k]==='object'?JSON.stringify(p[k]):p[k])).join(' ');

/* ------------------------------------ 12. vocabulary defaults (what a painter receives in `p` when the story omits a parameter) ------------------------------------ */
const CN_BG_DEF={
  space:{nebula:'blue',density:.5,drift:0},
  planet:{planet:'azure',rings:false,phase:.62,size:1,moons:0,atmosphere:true,nebula:'none'},
  orbit:{planet:'azure',limb:'bottom',station:false,ships:0,glow:.5},
  surface:{biome:'dust',time:'day',features:[]},
  base:{faction:'meridian',time:'day',state:'calm'},
  bridge:{faction:'meridian',alert:false,view:'space'},
  hall:{style:'meridian',light:'cold'},
  battlefield:{biome:'dust',time:'day',intensity:.5,sides:['meridian','obsidian']},
  ruins:{biome:'dust',time:'dusk'},
  array:{state:'dormant',planet:'azure'},
  void:{tint:'#0b1630',glow:.3},
  map:{focus:[.5,.5],marks:[],faction:'neutral'}
};
const CN_PROP_DEF={
  ship:{cls:'dropship',faction:'meridian'},unit:{type:'rifleman',faction:'meridian'},building:{type:'hub',faction:'meridian'},planet:{planet:'azure'},moon:{},station:{},beacon:{},crystal:{},array:{},
  banner:{faction:'meridian'},holo:{shape:'planet'},crowd:{faction:'meridian'}
};

/* ====================================================================================================================
   PLACEHOLDER PAINTERS — gradients and labelled shapes so the engine, the player and the tests run end to end today.
   The art files REPLACE these by assigning into CINE_PAINT (see the loading order above). Do not extend them: replace them.
   ==================================================================================================================== */
{
const PB=CINE_PAINT.bg,PP=CINE_PAINT.prop,PF=CINE_PAINT.fx,PT=CINE_PAINT.trans;
const stat=(fn)=>{fn.static=true;fn.placeholder=true;return fn;};

/* ---- backgrounds ---- */
const skyOf=(tod)=>(CN_TOD[tod]||CN_TOD.day);
function ground(g,W,H,p,S,seed,hz){                                                                     // sky + sun + hills + ground band, shared by surface/base/battlefield/ruins
  const F=S.fill,tod=skyOf(p.time),bio=CN_BIOME[p.biome]||CN_BIOME.dust,night=p.time==='night';
  cnFillBg(g,S,cnLG(g,0,F.y,0,H*hz,[[0,tod.sky[0]],[1,tod.sky[1]]]));
  if(night)cnStars(g,F.x,F.y,F.w,H*hz-F.y,seed,140,{u:S.u});
  const sx=W*(p.time==='dusk'?.78:p.time==='dawn'?.2:.34),sy=H*(p.time==='day'?.2:p.time==='night'?.2:hz-.07);
  cnGlow(g,sx,sy,H*.5,tod.sun,.55);g.fillStyle=tod.sun;g.beginPath();g.arc(sx,sy,H*(night?.035:.04),0,TAU);g.fill();
  g.fillStyle=cnMix(bio.rock,tod.sky[1],.35);g.beginPath();g.moveTo(F.x,H*hz);
  for(let x=F.x;x<=F.x+F.w+8;x+=8)g.lineTo(x,H*hz-cnFbm(x/W*5,.5,seed,3)*H*.14);g.lineTo(F.x+F.w,H*hz);g.fill();
  cnFillBgRect(g,F.x,H*hz,F.w,F.y+F.h-H*hz,cnLG(g,0,H*hz,0,F.y+F.h,[[0,cnMix(bio.ground[0],tod.sky[1],.25)],[1,bio.ground[1]]]));
  if(tod.tint){g.globalAlpha=.16;g.fillStyle=tod.tint;g.fillRect(F.x,F.y,F.w,F.h);g.globalAlpha=1;}
  return bio;
}
function cnFillBgRect(g,x,y,w,h,st){g.fillStyle=st;g.fillRect(x,y,w,h);}
function box(g,x,y,w,h,col){g.fillStyle=cnShade(col,-.55);g.fillRect(x,y,w,h);g.fillStyle=col;g.fillRect(x,y,w,h*.86);g.fillStyle=cnShade(col,.3);g.fillRect(x,y,w,Math.max(1,h*.1));}

PB.space=stat((g,W,H,p,t,seed,S)=>{
  const F=S.fill;cnFillBg(g,S,cnLG(g,0,F.y,0,F.y+F.h,[[0,'#02030a'],[1,'#070b1c']]));
  const pal=CN_NEBULA[p.nebula];if(pal)cnNebula(g,F.x,F.y,F.w,F.h,seed,pal,{density:.3+p.density*.5,scale:1.7,alpha:.85});
  cnStars(g,F.x,F.y,F.w,F.h,seed+3,Math.round((140+p.density*480)*F.w*F.h/(W*H)),{u:S.u});
  cnLabel(g,W,H,'bg:space '+cnParam(p),S);
});
PB.planet=stat((g,W,H,p,t,seed,S)=>{
  PB.space(g,W,H,{nebula:p.nebula,density:.4,drift:0},t,seed,S);
  const pal=CN_PLANET[p.planet]||CN_PLANET.azure,r=H*.36*p.size,x=W*.64,y=H*.5;
  if(p.rings){g.save();g.translate(x,y);g.rotate(-.35);g.scale(1,.26);g.strokeStyle=cnA(pal.light,.55);g.lineWidth=r*.16;g.beginPath();g.arc(0,0,r*1.55,0,TAU);g.stroke();g.strokeStyle=cnA(pal.base,.45);g.lineWidth=r*.08;g.beginPath();g.arc(0,0,r*1.8,0,TAU);g.stroke();g.restore();}
  cnSphere(g,x,y,r,pal,{phase:p.phase,seed,atm:p.atmosphere?1:0,night:true});
  for(let i=0;i<p.moons;i++){const a=-2.6+i*1.1;cnSphere(g,x+Math.cos(a)*r*1.9,y+Math.sin(a)*r*1.1,r*(.1+.03*i),CN_PLANET.ashen,{phase:.7,seed:seed+i,atm:0});}
  cnLabel(g,W,H,'bg:planet '+cnParam(p),S);
});
PB.orbit=stat((g,W,H,p,t,seed,S)=>{
  PB.space(g,W,H,{nebula:'none',density:.5,drift:0},t,seed,S);
  const pal=CN_PLANET[p.planet]||CN_PLANET.azure,R=Math.max(W,H)*.95,lim={bottom:[W*.5,H*.72+R],top:[W*.5,H*.28-R],left:[W*.28-R,H*.5],right:[W*.72+R,H*.5]}[p.limb]||[W*.5,H*.72+R];
  const la={bottom:-1.2,top:1.2,left:0,right:Math.PI}[p.limb];
  cnSphere(g,lim[0],lim[1],R,pal,{phase:.8,light:la,seed,atm:1.2,night:true,detail:true});
  cnGlow(g,W*.5+(p.limb==='left'?-W*.2:p.limb==='right'?W*.2:0),H*.72+(p.limb==='top'?-H*.44:0),H*.5*(.4+p.glow),pal.atm,.25+p.glow*.3);
  if(p.station){const x=W*.72,y=H*.3;g.save();g.translate(x,y);g.rotate(.2);g.fillStyle='#8a97ad';g.fillRect(-H*.07,-H*.01,H*.14,H*.02);g.fillRect(-H*.012,-H*.05,H*.024,H*.1);g.strokeStyle='#cfd9e8';g.lineWidth=S.u;g.beginPath();g.ellipse(0,0,H*.04,H*.04,0,0,TAU);g.stroke();g.restore();}
  for(let i=0;i<Math.round(p.ships);i++){g.fillStyle='#cfd9e8';g.fillRect(W*(.15+cnR(seed,i,1)*.6),H*(.2+cnR(seed,i,2)*.35),H*.012,H*.004);}
  cnLabel(g,W,H,'bg:orbit '+cnParam(p),S);
});
PB.surface=stat((g,W,H,p,t,seed,S)=>{
  const bio=ground(g,W,H,p,S,seed,.6);
  (p.features||[]).forEach((f,i)=>{const x=W*(.12+.76*cnR(seed,i,1)),y=H*(.68+.2*cnR(seed,i,2)),c=f==='crystals'?'#9ae8ff':f==='geyser'?'#c9a0ff':f==='wreck'?'#5a4a44':'#8a97ad',s=H*(.05+.05*cnR(seed,i,3));
    if(f==='crystals'||f==='geyser'){g.fillStyle=c;g.beginPath();g.moveTo(x-s*.4,y);g.lineTo(x,y-s*1.6);g.lineTo(x+s*.4,y);g.fill();cnGlow(g,x,y-s,s*2,c,.4);}else box(g,x-s,y-s*.8,s*2,s*.8,c);});
  cnLabel(g,W,H,'bg:surface '+cnParam(p),S);
});
PB.base=stat((g,W,H,p,t,seed,S)=>{
  const c=cnFac(p.faction),bio=ground(g,W,H,{biome:'dust',time:p.time},S,seed,.64);
  for(let i=0;i<7;i++){const x=W*(.08+.84*i/6),s=H*(.05+.05*cnR(seed,i,1));box(g,x-s,H*.66-s*(p.state==='ruined'?.5:1),s*2,s*(p.state==='ruined'?.5:1),i%3?c.dark:c.base);}
  if(p.state==='siege'||p.state==='ruined'){g.fillStyle='rgba(20,10,8,.5)';g.fillRect(S.fill.x,S.fill.y,S.fill.w,S.fill.h);}
  cnLabel(g,W,H,'bg:base '+cnParam(p),S);
});
PB.bridge=stat((g,W,H,p,t,seed,S)=>{
  const c=cnFac(p.faction);cnFillBg(g,S,cnLG(g,0,S.fill.y,0,S.fill.y+S.fill.h,[[0,cnMix('#0a1222',c.dark,.25)],[1,'#04070d']]));
  const wx=W*.18,wy=H*.12,ww=W*.64,wh=H*.46;g.fillStyle='#02030a';g.fillRect(wx,wy,ww,wh);
  g.save();g.beginPath();g.rect(wx,wy,ww,wh);g.clip();
  if(p.view==='planet'||p.view==='array')cnSphere(g,wx+ww*.7,wy+wh*.6,wh*.55,CN_PLANET.azure,{phase:.7,seed});
  if(p.view!=='none')cnStars(g,wx,wy,ww,wh,seed,120,{u:S.u});
  g.restore();g.strokeStyle=cnA(c.light,.5);g.lineWidth=3*S.u;g.strokeRect(wx,wy,ww,wh);
  for(let i=0;i<6;i++)box(g,W*(.06+i*.16),H*.74,W*.12,H*.14,i%2?c.dark:cnShade(c.dark,-.3));
  if(p.alert){g.fillStyle='rgba(255,40,30,.18)';g.fillRect(S.fill.x,S.fill.y,S.fill.w,S.fill.h);}
  cnLabel(g,W,H,'bg:bridge '+cnParam(p),S);
});
PB.hall=stat((g,W,H,p,t,seed,S)=>{
  const lc={cold:'#9ac8ff',warm:'#ffc890',blood:'#ff4a3a'}[p.light]||'#9ac8ff',sc={meridian:'#3d8bff',obsidian:'#ff4d4d',aurora:'#27d3a2',forbidden:'#8a4aff'}[p.style]||'#3d8bff';
  cnFillBg(g,S,cnLG(g,0,S.fill.y,0,S.fill.y+S.fill.h,[[0,'#05070d'],[1,cnMix('#05070d',sc,.25)]]));
  for(let i=0;i<7;i++){const x=W*(.05+i*.15);g.fillStyle=cnA(sc,.5);g.fillRect(x,H*.05,W*.05,H*.8);g.fillStyle=cnA(lc,.18);g.fillRect(x,H*.05,W*.012,H*.8);}
  cnGlow(g,W*.5,H*.35,H*.7,lc,.25);g.fillStyle='rgba(0,0,0,.45)';g.fillRect(S.fill.x,H*.86,S.fill.w,S.fill.y+S.fill.h-H*.86);
  cnLabel(g,W,H,'bg:hall '+cnParam(p),S);
});
PB.battlefield=stat((g,W,H,p,t,seed,S)=>{
  ground(g,W,H,p,S,seed,.55);const sd=p.sides||['meridian','obsidian'];
  for(let i=0;i<Math.round(14+p.intensity*30);i++){const side=i%2,c=cnFac(sd[side]);g.fillStyle=c.base;const x=W*(side?.52+.4*cnR(seed,i,1):.08+.4*cnR(seed,i,1)),y=H*(.62+.3*cnR(seed,i,2));g.fillRect(x,y,H*.012,H*.012);}
  g.fillStyle=cnA('#1a1210',.25+.35*p.intensity);g.fillRect(S.fill.x,H*.4,S.fill.w,H*.18);
  cnLabel(g,W,H,'bg:battlefield '+cnParam(p),S);
});
PB.ruins=stat((g,W,H,p,t,seed,S)=>{
  ground(g,W,H,{biome:p.biome,time:p.time},S,seed,.62);
  for(let i=0;i<8;i++){const x=W*(.06+.88*i/7),s=H*(.05+.12*cnR(seed,i,1));g.fillStyle=cnShade('#5a5048',-.2+cnR(seed,i,2)*.3);g.beginPath();g.moveTo(x-s*.3,H*.7);g.lineTo(x-s*.2,H*.7-s*1.4);g.lineTo(x+s*.1,H*.7-s);g.lineTo(x+s*.3,H*.7);g.fill();}
  cnLabel(g,W,H,'bg:ruins '+cnParam(p),S);
});
PB.array=stat((g,W,H,p,t,seed,S)=>{
  PB.space(g,W,H,{nebula:'violet',density:.4,drift:0},t,seed,S);
  const pal=CN_PLANET[p.planet]||CN_PLANET.azure;cnSphere(g,W*.5,H*1.15,H*.7,pal,{phase:.8,seed,night:true});
  const hot={dormant:'#4a5a78',charging:'#ffd45a',firing:'#ff7a5a',broken:'#3a2a2a'}[p.state];g.strokeStyle=hot;g.lineWidth=H*.03;g.beginPath();g.arc(W*.5,H*.5,H*.3,Math.PI*1.05,Math.PI*1.95);g.stroke();
  if(p.state==='firing'||p.state==='charging')cnGlow(g,W*.5,H*.2,H*.45,hot,.6);
  cnLabel(g,W,H,'bg:array '+cnParam(p),S);
});
PB.void=stat((g,W,H,p,t,seed,S)=>{
  cnFillBg(g,S,'#02030a');cnGlow(g,W*.5,H*.5,Math.max(W,H)*.75,p.tint,.25+p.glow*.7,{add:false});cnGlow(g,W*.5,H*.5,H*.35,p.tint,p.glow*.6);
  cnLabel(g,W,H,'bg:void '+cnParam(p),S);
});
PB.map=stat((g,W,H,p,t,seed,S)=>{
  const c=cnFac(p.faction);cnFillBg(g,S,cnLG(g,0,S.fill.y,0,S.fill.y+S.fill.h,[[0,'#04070d'],[1,cnMix('#04070d',c.dark,.35)]]));
  g.strokeStyle=cnA(c.light,.12);g.lineWidth=S.u;for(let x=S.fill.x;x<S.fill.x+S.fill.w;x+=H/10){g.beginPath();g.moveTo(x,S.fill.y);g.lineTo(x,S.fill.y+S.fill.h);g.stroke();}
  for(let y=S.fill.y;y<S.fill.y+S.fill.h;y+=H/10){g.beginPath();g.moveTo(S.fill.x,y);g.lineTo(S.fill.x+S.fill.w,y);g.stroke();}
  g.fillStyle=cnA(c.base,.3);for(let i=0;i<9;i++)g.fillRect(W*(.1+cnR(seed,i,1)*.8),H*(.15+cnR(seed,i,2)*.7),W*.09,H*.1);
  const mc={friendly:'#5aa9ff',enemy:'#ff6a5a',objective:'#f6c04a',danger:'#ff9a3a'};
  for(const m of p.marks||[]){cnGlow(g,m.x*W,m.y*H,H*.06,mc[m.k]||'#fff',.7);g.fillStyle=mc[m.k]||'#fff';g.fillRect(m.x*W-H*.01,m.y*H-H*.01,H*.02,H*.02);}
  cnLabel(g,W,H,'bg:map '+cnParam(p),S);
});

/* ---- props (units and buildings use the game's own vector art) ---- */
const PH=(tag)=>(g,x,y,s,p,t,seed,S)=>{if(CINE_PAINT.labels){g.save();g.font='600 '+Math.max(9,s*.11)+'px '+CN_FONT;g.textAlign='center';g.fillStyle='rgba(230,240,255,.9)';g.fillText(tag,x,y+s*.62);g.restore();}};
PP.ship=(g,x,y,s,p,t,seed,S)=>{
  const c=cnFac(p.faction),L={dropship:1,frigate:1.5,carrier:2.4,shuttle:.7,wreck:1.2}[p.cls]||1,l=s*L,w=l*.3;
  g.save();g.translate(x,y);if(p.cls==='wreck'){g.rotate(.4);g.globalAlpha*=.75;}
  cnGlow(g,-l*.52,0,w*1.6,'#ffb36a',p.cls==='wreck'?0:.8);
  g.fillStyle=cnLG(g,0,-w,0,w,[[0,c.light],[.5,c.base],[1,c.dark]]);g.beginPath();g.moveTo(l*.5,0);g.lineTo(l*.1,-w*.5);g.lineTo(-l*.35,-w);g.lineTo(-l*.5,-w*.4);g.lineTo(-l*.5,w*.4);g.lineTo(-l*.35,w);g.lineTo(l*.1,w*.5);g.closePath();g.fill();
  g.strokeStyle='rgba(0,0,0,.6)';g.lineWidth=Math.max(1,s*.01);g.stroke();g.fillStyle='rgba(180,230,255,.8)';g.fillRect(l*.14,-w*.12,l*.2,w*.24);
  g.restore();PH('ship:'+p.cls)(g,x,y,s,p,t,seed,S);
};
PP.unit=(g,x,y,s,p,t,seed,S)=>{
  const f=p.faction,col=cnFac(f),k=s/42;cnShadow(g,x+s*.04,y+s*.1,s*.4,s*.16,.4);
  g.save();g.translate(x,y);g.scale(k,k);g.lineJoin='round';g.lineCap='round';artUnit(g,p.type,col,f);g.restore();
};
PP.building=(g,x,y,s,p,t,seed,S)=>{
  const d=BDEF[p.type]||BDEF.hub,w=d.w*TILE,h=d.h*TILE,k=s/Math.max(w,h),col=cnFac(p.faction);cnShadow(g,x+s*.05,y+s*.45,s*.55,s*.12,.4);
  g.save();g.translate(x,y);g.scale(k,k);g.lineJoin='round';g.lineCap='round';artBuilding(g,p.type,w,h,col,p.faction);g.restore();
};
PP.planet=(g,x,y,s,p,t,seed,S)=>{cnSphere(g,x,y,s*.5,CN_PLANET[p.planet]||CN_PLANET.azure,{phase:.7,seed});PH('planet:'+p.planet)(g,x,y,s,p,t,seed,S);};
PP.moon=(g,x,y,s,p,t,seed,S)=>{cnSphere(g,x,y,s*.4,CN_PLANET.ashen,{phase:.7,seed,atm:0});PH('moon')(g,x,y,s,p,t,seed,S);};
PP.station=(g,x,y,s,p,t,seed,S)=>{g.save();g.translate(x,y);g.rotate(t*.1);g.strokeStyle='#cfd9e8';g.lineWidth=Math.max(1,s*.03);g.beginPath();g.arc(0,0,s*.38,0,TAU);g.stroke();g.fillStyle='#8a97ad';g.fillRect(-s*.1,-s*.1,s*.2,s*.2);g.fillRect(-s*.5,-s*.02,s,s*.04);g.restore();PH('station')(g,x,y,s,p,t,seed,S);};
PP.beacon=(g,x,y,s,p,t,seed,S)=>{g.fillStyle='#4a5a78';g.fillRect(x-s*.03,y-s*.3,s*.06,s*.6);const a=.5+.5*Math.sin(t*4);cnGlow(g,x,y-s*.32,s*.45,p.col||'#ff7a5a',.35+.5*a);PH('beacon')(g,x,y,s,p,t,seed,S);};
PP.crystal=(g,x,y,s,p,t,seed,S)=>{const c=p.col||'#9ae8ff';cnGlow(g,x,y,s*.8,c,.4);for(let i=0;i<3;i++){const dx=(i-1)*s*.22,h=s*(.45+.2*cnR(seed,i,1));g.fillStyle=cnLG(g,x+dx-s*.1,y,x+dx+s*.1,y-h,[cnShade(c,-.5),cnShade(c,.4)]);g.beginPath();g.moveTo(x+dx-s*.1,y+s*.25);g.lineTo(x+dx,y+s*.25-h);g.lineTo(x+dx+s*.1,y+s*.25);g.fill();}PH('crystal')(g,x,y,s,p,t,seed,S);};
PP.array=(g,x,y,s,p,t,seed,S)=>{g.strokeStyle='#8a97ad';g.lineWidth=s*.05;g.beginPath();g.arc(x,y+s*.2,s*.4,Math.PI*1.05,Math.PI*1.95);g.stroke();g.fillStyle='#4a5a78';g.fillRect(x-s*.05,y+s*.1,s*.1,s*.3);PH('array')(g,x,y,s,p,t,seed,S);};
PP.banner=(g,x,y,s,p,t,seed,S)=>{const c=cnFac(p.faction);g.fillStyle='#8a97ad';g.fillRect(x-s*.015,y-s*.5,s*.03,s);g.beginPath();g.moveTo(x,y-s*.48);for(let i=0;i<=8;i++)g.lineTo(x+i/8*s*.4,y-s*.48+Math.sin(t*3+i*.7)*s*.02*i/8);for(let i=8;i>=0;i--)g.lineTo(x+i/8*s*.4,y-s*.1+Math.sin(t*3+i*.7)*s*.02*i/8);g.closePath();g.fillStyle=c.base;g.fill();g.fillStyle=c.light;g.beginPath();g.arc(x+s*.18,y-s*.29,s*.06,0,TAU);g.fill();PH('banner')(g,x,y,s,p,t,seed,S);};
PP.holo=(g,x,y,s,p,t,seed,S)=>{const c=p.col||'#5ae8ff',a=.55+.25*Math.sin(t*9);g.save();g.globalAlpha*=a;g.strokeStyle=c;g.lineWidth=Math.max(1,s*.015);g.shadowColor=c;g.shadowBlur=s*.1;g.beginPath();g.arc(x,y,s*.3,0,TAU);g.stroke();g.beginPath();g.ellipse(x,y,s*.3,s*.1,t*.5,0,TAU);g.stroke();g.beginPath();g.moveTo(x-s*.3,y);g.lineTo(x+s*.3,y);g.moveTo(x,y-s*.3);g.lineTo(x,y+s*.3);g.stroke();g.restore();PH('holo:'+p.shape)(g,x,y,s,p,t,seed,S);};
PP.crowd=(g,x,y,s,p,t,seed,S)=>{const c=cnFac(p.faction);for(let i=0;i<14;i++){const dx=(cnR(seed,i,1)-.5)*s*1.6,dy=(cnR(seed,i,2)-.3)*s*.5,r=s*.07;g.fillStyle=cnShade(c.dark,-.3);g.beginPath();g.ellipse(x+dx,y+dy+r*1.7,r*1.4,r*1.5,0,Math.PI,TAU);g.fill();g.fillStyle=cnShade(c.base,-.4);g.beginPath();g.arc(x+dx,y+dy,r,0,TAU);g.fill();}PH('crowd')(g,x,y,s,p,t,seed,S);};

/* ---- fx (S.a is the master alpha, S.pos the camera-projected anchor of e.x,e.y; S.u the unit scale) ---- */
const fxPos=(S,W,H,e)=>S.pos||{x:W*(e.x==null?.5:e.x),y:H*(e.y==null?.5:e.y)};
PF.stars=(g,W,H,e,t,seed,S)=>{g.globalAlpha=S.a;cnStars(g,0,0,W,H,seed+11,cnN(110,S),{u:S.u,twinkle:S.ts});g.globalAlpha=1;};
PF.dust=(g,W,H,e,t,seed,S)=>{const n=cnN(70*(e.n==null?1:e.n),S);for(let i=0;i<n;i++){const ph=cnPhase(t,16+cnR(seed,i,3)*10,i,seed);g.fillStyle=cnA(e.col||'#ffe8c8',S.a*(.15+.4*cnR(seed,i,4))*Math.sin(ph*Math.PI));g.beginPath();g.arc(cnR(seed,i,1)*W+ph*W*.12,cnR(seed,i,2)*H-ph*H*.05,(.6+cnR(seed,i,5)*1.8)*S.u,0,TAU);g.fill();}};
PF.embers=(g,W,H,e,t,seed,S)=>{const n=cnN(60,S);for(let i=0;i<n;i++){const ph=cnPhase(t,3+cnR(seed,i,3)*3,i,seed),x=cnR(seed,i,1)*W+Math.sin(t*1.3+i)*W*.02,y=H*(1.05-ph*1.1);cnGlow(g,x,y,(2+cnR(seed,i,5)*3)*S.u*3,e.col||'#ff9a4a',S.a*(1-ph)*.9);}};
PF.rain=(g,W,H,e,t,seed,S)=>{const n=cnN(130,S),a=e.dir==null?.25:e.dir;g.strokeStyle=cnA(e.col||'#bcd4ff',S.a*.35);g.lineWidth=S.u;g.beginPath();for(let i=0;i<n;i++){const ph=cnPhase(t,.55+cnR(seed,i,3)*.3,i,seed),x=cnR(seed,i,1)*W*1.3-W*.15+ph*H*a,y=ph*H*1.1-H*.05;g.moveTo(x,y);g.lineTo(x-H*a*.05,y-H*.05);}g.stroke();};
PF.snow=(g,W,H,e,t,seed,S)=>{const n=cnN(100,S);g.fillStyle=cnA(e.col||'#fff',S.a*.8);for(let i=0;i<n;i++){const ph=cnPhase(t,7+cnR(seed,i,3)*5,i,seed);g.beginPath();g.arc(cnR(seed,i,1)*W+Math.sin(t*.8+i)*W*.02,ph*H*1.1-H*.05,(.8+cnR(seed,i,5)*1.8)*S.u,0,TAU);g.fill();}};
PF.lightning=(g,W,H,e,t,seed,S)=>{const k=Math.floor(t*1.6),ph=cnFrac(t*1.6),f=Math.max(0,1-ph*5)*(cnR(seed,k,1)<.8?1:0),x0=W*(.2+.6*cnR(seed,k,2));if(f<=0)return;
  if(!S.rm){g.fillStyle=cnA('#cfe0ff',S.a*f*.5);g.fillRect(0,0,W,H);}g.strokeStyle=cnA('#fff',S.a*f);g.lineWidth=2*S.u;g.shadowColor='#9ac8ff';g.shadowBlur=14*S.u;g.beginPath();let x=x0,y=0;g.moveTo(x,y);for(let i=1;i<9;i++){x+=(cnR(seed,k*9+i,3)-.5)*W*.08;y=H*.12*i;g.lineTo(x,y);}g.stroke();g.shadowBlur=0;};
PF.beam=(g,W,H,e,t,seed,S)=>{const p=fxPos(S,W,H,e),q=S.pos2||{x:p.x,y:0},c=e.col||'#9ad8ff',w=(10+4*Math.sin(t*11))*S.u;g.save();g.globalCompositeOperation='lighter';g.lineCap='round';
  g.strokeStyle=cnA(c,S.a*.25);g.lineWidth=w*3;g.beginPath();g.moveTo(p.x,p.y);g.lineTo(q.x,q.y);g.stroke();g.strokeStyle=cnA('#fff',S.a*.9);g.lineWidth=w*.5;g.beginPath();g.moveTo(p.x,p.y);g.lineTo(q.x,q.y);g.stroke();g.restore();cnGlow(g,q.x,q.y,H*.12,c,S.a*.8);};
PF.explosion=(g,W,H,e,t,seed,S)=>{const p=fxPos(S,W,H,e),k=cnC01(t/1.6),r=H*(.06+.34*cnEase('out',k)),c=e.col||'#ff9a4a';
  cnGlow(g,p.x,p.y,r*2.2,c,S.a*(1-k)*.8,{core:.9});g.save();g.strokeStyle=cnA('#ffe8c0',S.a*(1-k));g.lineWidth=(6*(1-k)+1)*S.u;g.beginPath();g.arc(p.x,p.y,r*1.3,0,TAU);g.stroke();
  for(let i=0;i<cnN(18,S);i++){const a=cnR(seed,i,1)*TAU,d=r*(.6+cnR(seed,i,2)*1.4);g.fillStyle=cnA('#ffd080',S.a*(1-k));g.fillRect(p.x+Math.cos(a)*d,p.y+Math.sin(a)*d,2*S.u,2*S.u);}g.restore();};
PF.flare=(g,W,H,e,t,seed,S)=>{const p=fxPos(S,W,H,e),c=e.col||'#ffd9a0',r=H*.28*(e.r||1);cnGlow(g,p.x,p.y,r,c,S.a*.8,{core:.8});g.save();g.globalCompositeOperation='lighter';g.fillStyle=cnA(c,S.a*.35);g.fillRect(p.x-W*.35,p.y-H*.004*S.u,W*.7,H*.008*S.u);g.restore();};
PF.rings=(g,W,H,e,t,seed,S)=>{const p=fxPos(S,W,H,e);g.strokeStyle=cnA(e.col||'#9ad8ff',1);for(let i=0;i<4;i++){const ph=cnPhase(t,3,i*2.5,seed);g.globalAlpha=S.a*(1-ph)*.7;g.lineWidth=2*S.u;g.beginPath();g.ellipse(p.x,p.y,H*.1+ph*H*.7,(H*.1+ph*H*.7)*.35,0,0,TAU);g.stroke();}g.globalAlpha=1;};
PF.scan=(g,W,H,e,t,seed,S)=>{g.fillStyle=cnA(e.col||'#7ae8ff',S.a*.08);for(let y=0;y<H;y+=4*S.u)g.fillRect(0,y,W,S.u);const y=cnFrac(t/3)*H;g.fillStyle=cnLG(g,0,y-H*.06,0,y+H*.02,[[0,cnA(e.col||'#7ae8ff',0)],[.8,cnA(e.col||'#7ae8ff',S.a*.25)],[1,cnA('#fff',S.a*.5)]]);g.fillRect(0,y-H*.06,W,H*.08);};
PF.glitch=(g,W,H,e,t,seed,S)=>{if(S.rm)return;const f=Math.floor(t*14),cv=g.canvas;for(let i=0;i<cnN(7,S);i++){if(cnR(seed,f,i)>.55*(e.a==null?1:e.a)+.2)continue;const y=cnR(seed,f,i+20)*H,h=H*(.01+cnR(seed,f,i+40)*.07),dx=(cnR(seed,f,i+60)-.5)*W*.12;g.drawImage(cv,0,y,W,h,dx,y,W,h);}};
PF.shake=()=>{};     // handled by the engine (camera offset); nothing to draw
PF.vignette=(g,W,H,e,t,seed,S)=>{cnVignette(g,W,H,S.a,e.col||'#000');};
PF.heat=(g,W,H,e,t,seed,S)=>{if(S.rm)return;const cv=g.canvas,y0=H*.45,n=Math.round((H-y0)/4);for(let i=0;i<n;i++){const y=y0+i*4;g.drawImage(cv,0,y,W,4,Math.sin(t*3+i*.35)*2.2*S.u*S.a,y,W,4);}};
PF.pulse=(g,W,H,e,t,seed,S)=>{const p=fxPos(S,W,H,e),a=.5+.5*Math.sin(t*3);cnGlow(g,p.x,p.y,H*(.3+.2*a),e.col||'#7ac8ff',S.a*(.25+.4*a));};
PF.sparks=(g,W,H,e,t,seed,S)=>{const p=fxPos(S,W,H,e),n=cnN(34,S);g.save();g.globalCompositeOperation='lighter';g.lineCap='round';for(let i=0;i<n;i++){const ph=cnPhase(t,1.1+cnR(seed,i,3)*.8,i,seed),a=-Math.PI/2+(cnR(seed,i,1)-.5)*2.6,d=ph*H*(.15+cnR(seed,i,2)*.35);
  const x=p.x+Math.cos(a)*d,y=p.y+Math.sin(a)*d+ph*ph*H*.2;g.strokeStyle=cnA(e.col||'#ffd080',S.a*(1-ph));g.lineWidth=1.6*S.u;g.beginPath();g.moveTo(x,y);g.lineTo(x-Math.cos(a)*H*.02,y-Math.sin(a)*H*.02);g.stroke();}g.restore();};
PF.smoke=(g,W,H,e,t,seed,S)=>{const p=fxPos(S,W,H,e),n=cnN(16,S);for(let i=0;i<n;i++){const ph=cnPhase(t,6,i,seed),r=H*(.05+ph*.18);g.fillStyle=cnRG(g,p.x+Math.sin(ph*4+i)*W*.04,p.y-ph*H*.5,0,r,[[0,cnA(e.col||'#3a3a40',S.a*(1-ph)*.5)],[1,cnA(e.col||'#3a3a40',0)]]);g.fillRect(p.x-W,p.y-H*1.2,W*2,H*1.8);}};
PF.comets=(g,W,H,e,t,seed,S)=>{g.save();g.globalCompositeOperation='lighter';g.lineCap='round';for(let i=0;i<cnN(4,S);i++){const ph=cnPhase(t,2.6+i*.7,i,seed),x=W*(1.1-ph*1.3)-i*W*.07,y=H*(.05+ph*.5+cnR(seed,i,1)*.2);g.strokeStyle=cnLG(g,x,y,x+W*.12,y-H*.07,[[0,cnA('#fff',S.a*.9)],[1,cnA('#7ac8ff',0)]]);g.lineWidth=2.4*S.u;g.beginPath();g.moveTo(x,y);g.lineTo(x+W*.12,y-H*.07);g.stroke();}g.restore();};

/* ---- transitions: k 0..1 (linear). dir 'in': the NEW scene is already in g; for wipe / iris / glitch S.from holds the previous scene's last frame (a black canvas for the
   first scene) — composite it away. fade and flash come from black / white and get S.from=null. dir 'out': g holds this scene, take it to black (white for flash); S.from is null. ---- */
const black=(g,W,H,a)=>{g.globalAlpha=a;g.fillStyle='#000';g.fillRect(0,0,W,H);g.globalAlpha=1;};
PT.cut=()=>{};
PT.fade=(g,W,H,k,dir,seed,S)=>{k=cnEase('inout',k);black(g,W,H,dir==='in'?1-k:k);};     // fade = from / to black (a dip when the previous scene also fades out)
PT.flash=(g,W,H,k,dir,seed,S)=>{const a=dir==='in'?Math.pow(1-k,1.6):Math.pow(k,1.6);g.globalAlpha=a;g.fillStyle='#fff';g.fillRect(0,0,W,H);g.globalAlpha=1;};
PT.wipe=(g,W,H,k,dir,seed,S)=>{
  const d=(cnH32(seed,3,0,0)>>>4)&3,e=cnEase('inout',k),vert=d>1,rev=(d&1)===1,L=vert?H:W,edge=e*L;       // d: 0 left->right, 1 right->left, 2 top->bottom, 3 bottom->top
  // dir 'in': the OLD image survives on the side the edge has not reached; dir 'out': black covers the side the edge has passed
  const passed=rev?[L-edge,edge]:[0,edge],ahead=rev?[0,L-edge]:[edge,L-edge],r=dir==='in'?ahead:passed;
  g.save();g.beginPath();if(vert)g.rect(0,r[0],W,r[1]);else g.rect(r[0],0,r[1],H);g.clip();
  if(dir==='in')g.drawImage(S.from,0,0,W,H);else{g.fillStyle='#000';g.fillRect(0,0,W,H);}
  g.restore();
  const ep=rev?L-edge:edge;g.fillStyle='rgba(255,255,255,'+(.55*Math.sin(Math.PI*cnC01(k)))+')';if(vert)g.fillRect(0,ep-1,W,2);else g.fillRect(ep-1,0,2,H);
};
PT.glitch=(g,W,H,k,dir,seed,S)=>{
  const f=Math.floor(k*12),amt=dir==='in'?1-k:k,cv=g.canvas;
  for(let i=0;i<14;i++){if(cnR(seed,f,i)>amt*1.25)continue;const y=cnR(seed,f,i+30)*H,h=H*(.015+cnR(seed,f,i+50)*.1);
    if(dir==='in'&&S.from){g.drawImage(S.from,0,y,W,h,(cnR(seed,f,i+70)-.5)*W*.2*amt,y,W,h);}else{g.fillStyle=cnR(seed,f,i+90)<.5?'#000':cnA('#2affc8',.35);g.fillRect(0,y,W,h);}}
  if(dir==='out'&&amt>.85){g.globalAlpha=(amt-.85)/.15;g.fillStyle='#000';g.fillRect(0,0,W,H);g.globalAlpha=1;}
  if(amt>.15){g.save();g.globalCompositeOperation='lighter';g.globalAlpha=amt*.45;const sh=W*.012*amt;g.drawImage(cv,sh,0);g.drawImage(cv,-sh,0);g.restore();}
};
PT.iris=(g,W,H,k,dir,seed,S)=>{
  const e=cnEase('inout',k),R=Math.hypot(W,H)/2*1.02,cx=W/2,cy=H/2;
  g.save();g.beginPath();g.rect(0,0,W,H);
  if(dir==='in'){g.arc(cx,cy,R*e,0,TAU,true);g.clip('evenodd');g.drawImage(S.from,0,0,W,H);}
  else{g.arc(cx,cy,R*(1-e),0,TAU,true);g.clip('evenodd');g.fillStyle='#000';g.fillRect(0,0,W,H);}
  g.restore();
};

/* ---- colour grade (the real implementation; replaceable). G = {tint,tintA,top,bot,splitA,sat,lift,bloom,vig,grain} built by the engine per scene ---- */
CINE_PAINT.grade=function(g,W,H,G,t,seed,S){
  g.save();g.setTransform(1,0,0,1,0,0);g.globalAlpha=1;
  if(G.sat!=null&&G.sat<.97){g.globalCompositeOperation='saturation';g.globalAlpha=1-G.sat;g.fillStyle='#808080';g.fillRect(0,0,W,H);g.globalAlpha=1;}
  if((G.top&&G.splitA>0)||(G.tint&&G.tintA>0)){                                                          // split-tone + tint are static per scene: baked at frame size, ONE 1:1 blend pass per frame
    const key='grade'+W+'x'+H+'|'+G.top+'|'+G.bot+'|'+G.splitA+'|'+G.tint+'|'+G.tintA;
    const c=cnFull(key,W,H,(q,w,h)=>{
      if(G.tint&&G.tintA>0){q.globalAlpha=cnC01(G.tintA);q.fillStyle=G.tint;q.fillRect(0,0,w,h);q.globalAlpha=1;}
      if(G.top&&G.splitA>0){q.globalAlpha=cnC01(G.splitA);q.fillStyle=cnLG(q,0,0,0,h,[[0,G.top],[.55,cnA(G.top,0)],[.6,cnA(G.bot,0)],[1,G.bot]]);q.fillRect(0,0,w,h);q.globalAlpha=1;}});
    g.globalCompositeOperation=S&&(S.tier==='battery'||S.tier==='balanced')?'overlay':'soft-light';g.drawImage(c,0,0);   // soft-light costs ~1.6 ms more than overlay in software raster: the cheaper tiers use overlay
  }
  g.restore();
};

/* ---- actor (a placeholder bust built from the character's `look`; the portrait artist replaces the whole function) ---- */
const EXPR={   // brow: inner-end lift (+ = sad/worried, - = angry), raise: whole brow, eye: openness, mouth: shape id, mw: mouth width, my: mouth lift (+ = smile)
  neutral:{brow:0,raise:0,eye:1,mouth:'flat',my:0,mw:1},talk:{brow:0,raise:.02,eye:1,mouth:'flat',my:0,mw:1,part:.25},angry:{brow:-.55,raise:-.12,eye:.72,mouth:'frown',my:-.5,mw:1.05},
  smirk:{brow:-.12,raise:.04,eye:.85,mouth:'smirk',my:.5,mw:.9},sad:{brow:.6,raise:.05,eye:.75,mouth:'frown',my:-.7,mw:.8},shock:{brow:.2,raise:.35,eye:1.3,mouth:'o',my:0,mw:.6},
  smile:{brow:.05,raise:.05,eye:.85,mouth:'smile',my:.8,mw:1.1},determined:{brow:-.3,raise:-.06,eye:.85,mouth:'set',my:-.1,mw:1.05},laugh:{brow:.1,raise:.12,eye:.45,mouth:'laugh',my:1,mw:1.2},
  scared:{brow:.5,raise:.3,eye:1.25,mouth:'wob',my:-.3,mw:.8},cold:{brow:-.18,raise:-.04,eye:.6,mouth:'thin',my:0,mw:.8},weary:{brow:.35,raise:-.08,eye:.55,mouth:'flat',my:-.3,mw:.9}
};
CINE_PAINT.actor=function(g,id,st,cx,cy,h,o){
  o=o||{};const ch=(STORY.characters&&STORY.characters[id])||{},L=Object.assign({skin:'#c58c6a',hair:{style:'short',color:'#222'},eyes:'#66ccff',armor:{style:'plate',col:'#3d8bff',trim:'#a6ceff'},mark:['none'],build:'lean',age:'adult',emblem:'faction'},ch.look||{});
  const mode=st.mode||'bust',ex=EXPR[st.expr]||EXPR.neutral,dir=st.face==='l'?-1:1,sil=mode==='silhouette',shd=mode==='shadow',holo=mode==='hologram';
  const T=c=>sil?'#06080e':shd?cnMix(c,'#04050a',.9):holo?cnMix('#103a48','#7ae8ff',cnLum(c)):c;
  let tg=g,ox=0,oy=0,sc=null;
  if(mode!=='bust'){const S2=Math.ceil(h*1.4);sc=cnScratch('actor',S2,S2);tg=sc.getContext('2d');tg.setTransform(1,0,0,1,0,0);tg.clearRect(0,0,S2,S2);ox=S2/2;oy=S2/2;}
  const x=mode==='bust'?cx:ox,y=mode==='bust'?cy:oy,bottom=mode==='bust'?(o.bottom==null?cy+h/2:o.bottom):oy+h*.7;
  tg.save();tg.translate(x,y);tg.scale(dir,1);tg.lineJoin='round';tg.lineCap='round';
  const bw={slight:.27,lean:.33,broad:.43,massive:.5}[L.build]||.33,hy=-.13*h,hr=.17*h,A=L.armor||{},ac=A.col||'#3d8bff',tr=A.trim||'#a6ceff',hair=L.hair||{style:'short',color:'#222'};
  let hc=hair.color;if(L.age==='old')hc=cnMix(hc,'#cfd2d8',.6);
  /* torso + shoulders */
  tg.fillStyle=T(cnShade(ac,-.25));tg.beginPath();tg.moveTo(-bw*h,.2*h);tg.quadraticCurveTo(-bw*h*1.05,.12*h,-bw*h*.6,.08*h);tg.lineTo(bw*h*.6,.08*h);tg.quadraticCurveTo(bw*h*1.05,.12*h,bw*h,.2*h);tg.lineTo(bw*h*1.08,bottom-y);tg.lineTo(-bw*h*1.08,bottom-y);tg.closePath();tg.fill();
  tg.fillStyle=T(ac);tg.beginPath();tg.moveTo(-bw*h*.8,.19*h);tg.lineTo(-bw*h*.5,.1*h);tg.lineTo(bw*h*.5,.1*h);tg.lineTo(bw*h*.8,.19*h);tg.lineTo(bw*h*.9,bottom-y);tg.lineTo(-bw*h*.9,bottom-y);tg.closePath();tg.fill();
  if(A.style==='plate'||A.style==='crown'){for(const s of[-1,1]){tg.fillStyle=T(cnShade(ac,.12));tg.beginPath();tg.ellipse(s*bw*h*.92,.17*h,.1*h,.075*h,s*.3,0,TAU);tg.fill();tg.strokeStyle=T(tr);tg.lineWidth=Math.max(1,h*.008);tg.stroke();}}
  tg.strokeStyle=T(tr);tg.lineWidth=Math.max(1.2,h*.012);tg.beginPath();tg.moveTo(-bw*h*.5,.1*h);tg.lineTo(0,.24*h);tg.lineTo(bw*h*.5,.1*h);tg.stroke();
  if(L.emblem&&L.emblem!=='none'){const fc=ch.faction&&FACTIONS[ch.faction]?FACTIONS[ch.faction].col.base:tr;tg.fillStyle=T(L.emblem==='faction'?fc:L.emblem==='sun'?'#f6c04a':'#ffd45a');tg.beginPath();tg.arc(-bw*h*.45,.3*h,.03*h,0,TAU);tg.fill();}
  /* neck + head */
  tg.fillStyle=T(cnShade(L.skin,-.3));tg.fillRect(-.06*h,hy+.1*h,.12*h,.16*h);
  const hood=hair.style==='hood'||A.style==='hood';
  if(hair.style==='mane'){tg.fillStyle=T(hc);tg.beginPath();tg.ellipse(0,hy+.02*h,hr*1.6,hr*1.5,0,0,TAU);tg.fill();}
  if(hair.style==='long'||hair.style==='braid'){tg.fillStyle=T(hc);tg.beginPath();tg.ellipse(-hr*.15,hy+hr*.3,hr*1.12,hr*1.5,0,0,TAU);tg.fill();}
  if(hood){tg.fillStyle=T(cnShade(ac,-.35));tg.beginPath();tg.ellipse(0,hy,hr*1.35,hr*1.45,0,0,TAU);tg.fill();}
  tg.fillStyle=T(L.skin);tg.beginPath();tg.ellipse(0,hy,hr*.92,hr*1.18,0,0,TAU);tg.fill();
  if(hair.style==='short'||hair.style==='bun'||hair.style==='long'||hair.style==='braid'||hair.style==='mane'){tg.fillStyle=T(hc);tg.beginPath();tg.ellipse(0,hy-hr*.5,hr*.96,hr*.78,0,Math.PI,TAU);tg.fill();}
  if(hair.style==='crest'){tg.fillStyle=T(hc);tg.beginPath();tg.moveTo(-hr*.25,hy-hr*.9);tg.lineTo(0,hy-hr*1.75);tg.lineTo(hr*.3,hy-hr*.9);tg.fill();}
  if(hair.style==='bun'){tg.fillStyle=T(hc);tg.beginPath();tg.arc(0,hy-hr*1.35,hr*.35,0,TAU);tg.fill();}
  if(hair.style==='braid'){tg.fillStyle=T(hc);for(let i=0;i<5;i++){tg.beginPath();tg.arc(hr*1.05,hy+hr*.6+i*hr*.4,hr*.22,0,TAU);tg.fill();}}
  if(A.style==='crown'){tg.fillStyle=T('#ffd45a');tg.beginPath();tg.moveTo(-hr*.9,hy-hr*.7);for(let i=0;i<5;i++){tg.lineTo(-hr*.9+i*hr*.45,hy-hr*(i%2?1.35:1.8));tg.lineTo(-hr*.9+(i+.5)*hr*.45,hy-hr*.8);}tg.lineTo(hr*.9,hy-hr*.7);tg.closePath();tg.fill();}
  /* face */
  const ey=hy+hr*.05,exs=hr*.42,bl=Math.max(st.blink||0,0),eo=Math.max(.04,ex.eye*(1-bl));
  const marks=Array.isArray(L.mark)?L.mark:[L.mark];
  for(const s of[-1,1]){
    tg.fillStyle=T('#f4f6fa');tg.beginPath();tg.ellipse(s*exs,ey,hr*.22,hr*.16*eo,0,0,TAU);tg.fill();
    const glow=marks.includes('glow-eye')&&s===1;tg.fillStyle=T(L.eyes);tg.beginPath();tg.arc(s*exs+hr*.03,ey,hr*.1*Math.min(1,eo+.2),0,TAU);tg.fill();
    if((shd||glow)&&!sil){tg.save();tg.globalCompositeOperation='lighter';cnGlow(tg,s*exs,ey,hr*(shd?.7:.5),L.eyes,.9);tg.restore();}
    {const by=ey-hr*.36-ex.raise*hr,xi=s*(exs-hr*.24),xo=s*(exs+hr*.28);tg.strokeStyle=T(cnShade(hc,-.2));tg.lineWidth=Math.max(1.4,h*.014);tg.beginPath();tg.moveTo(xi,by-ex.brow*hr*.3);tg.lineTo(xo,by+ex.brow*hr*.12);tg.stroke();}
  }
  tg.fillStyle=T(cnShade(L.skin,-.18));tg.fillRect(-hr*.04,ey+hr*.1,hr*.08,hr*.28);
  const my=hy+hr*.72,mw=hr*.34*ex.mw,op=Math.max(st.talk||0,ex.part||0)*hr*.34+(ex.mouth==='o'?hr*.2:ex.mouth==='laugh'?hr*.26:0);
  tg.strokeStyle=T(cnShade(L.skin,-.55));tg.fillStyle=T('#2a0f12');tg.lineWidth=Math.max(1.4,h*.013);tg.beginPath();
  const lift=ex.my*hr*.1;
  if(op>hr*.03){tg.moveTo(-mw,my-lift*.4);tg.quadraticCurveTo(0,my-hr*.05-lift,mw,my-lift*.4);tg.quadraticCurveTo(0,my+op*1.6,-mw,my-lift*.4);tg.closePath();tg.fill();tg.stroke();}
  else if(ex.mouth==='smirk'){tg.moveTo(-mw,my);tg.quadraticCurveTo(0,my+hr*.04,mw*.6,my-hr*.05);tg.lineTo(mw,my-hr*.14);tg.stroke();}
  else{tg.moveTo(-mw,my-lift*.6);tg.quadraticCurveTo(0,my+lift*1.2,mw,my-lift*.6);tg.stroke();}
  /* age + marks */
  if(L.age==='old'){tg.strokeStyle=T(cnA(cnShade(L.skin,-.5),.5));tg.lineWidth=1;for(const s of[-1,1]){tg.beginPath();tg.moveTo(s*hr*.55,ey+hr*.2);tg.quadraticCurveTo(s*hr*.5,my-hr*.1,s*hr*.4,my+hr*.1);tg.stroke();}}
  if(marks.includes('scar-l')){tg.strokeStyle=T('#8a2a2a');tg.lineWidth=Math.max(1.4,h*.01);tg.beginPath();tg.moveTo(-exs-hr*.15,ey-hr*.5);tg.lineTo(-exs+hr*.2,ey+hr*.45);tg.stroke();}
  if(marks.includes('tattoo')){tg.strokeStyle=T(L.eyes);tg.lineWidth=Math.max(1.4,h*.01);for(let i=0;i<3;i++){tg.beginPath();tg.moveTo(exs+hr*.2+i*hr*.12,ey+hr*.35);tg.lineTo(exs+hr*.3+i*hr*.12,ey+hr*.75);tg.stroke();}}
  if(marks.includes('mask')){tg.fillStyle=T('#2a2f3a');tg.beginPath();tg.moveTo(-hr*.85,hy+hr*.35);tg.lineTo(hr*.85,hy+hr*.35);tg.lineTo(hr*.6,hy+hr*1.1);tg.lineTo(-hr*.6,hy+hr*1.1);tg.closePath();tg.fill();}
  if(marks.includes('visor')){tg.fillStyle=T(cnA(L.eyes,.85));tg.fillRect(-hr*.85,ey-hr*.18,hr*1.7,hr*.34);}
  if(marks.includes('halo')){tg.strokeStyle=T('#ffe8a0');tg.lineWidth=Math.max(1.5,h*.012);tg.beginPath();tg.ellipse(0,hy-hr*1.65,hr*.8,hr*.22,0,0,TAU);tg.stroke();}
  if(marks.includes('cracks')){tg.strokeStyle=T(L.eyes);tg.lineWidth=Math.max(1,h*.007);tg.beginPath();tg.moveTo(hr*.1,hy-hr*.8);tg.lineTo(hr*.35,hy-hr*.2);tg.lineTo(hr*.2,hy+hr*.1);tg.lineTo(hr*.5,hy+hr*.5);tg.stroke();}
  tg.restore();
  if(mode!=='bust'){
    const S2=sc.width,tx=tg;tx.save();tx.globalCompositeOperation='source-atop';
    if(holo){tx.fillStyle=cnLG(tx,0,0,0,S2,[[0,'rgba(120,240,255,.55)'],[1,'rgba(40,160,200,.35)']]);tx.fillRect(0,0,S2,S2);tx.globalCompositeOperation='destination-out';tx.fillStyle='rgba(0,0,0,.5)';for(let yy=0;yy<S2;yy+=4)tx.fillRect(0,yy,S2,2);}
    tx.restore();
    g.save();const jit=holo?(cnR(Math.floor((st.t||0)*18),7,1)<.1?(cnR(Math.floor((st.t||0)*18),7,2)-.5)*h*.04:0):0;g.drawImage(sc,cx-S2/2+jit,cy-oy);if(holo){g.globalCompositeOperation='lighter';g.globalAlpha=.4;g.drawImage(sc,cx-S2/2+jit,cy-oy);}g.restore();
  }
};
}
/* flag every placeholder so tools and tests can report which art is still missing (a replacement painter simply has no `placeholder` property) */
for(const r of[CINE_PAINT.bg,CINE_PAINT.prop,CINE_PAINT.fx])for(const k in r)r[k].placeholder=true;
CINE_PAINT.actor.placeholder=true;
/* ====================================================================================================================
   PUBLIC portrait entry point (also used for 64 px avatar chips by the campaign UI).
     drawPortrait(g,charId,expr,cx,cy,h,opts)   (cx,cy) = centre of the bust box, h = box height in px.
     opts: {face:'l'|'r', mode:'bust|silhouette|shadow|hologram', talk:0..1, blink:0..1, t:seconds, seed, bottom:px (torso extends to here), key, lights, rim, tod, faction, u}
   ==================================================================================================================== */
function drawPortrait(g,charId,expr,cx,cy,h,opts){
  const fn=CINE_PAINT.actor;if(!fn||!g||!(h>0))return;
  opts=opts||{};
  const st={expr:expr||'neutral',mode:opts.mode||'bust',talk:opts.talk||0,blink:opts.blink||0,face:opts.face||'r',t:opts.t||0};
  const o=Object.assign({W:g.canvas?g.canvas.width:0,H:g.canvas?g.canvas.height:0,bottom:cy+h*.5,seed:cnHashStr(charId),u:h/400,key:null,lights:[],rim:null,tod:'interior',faction:null},opts);
  try{fn(g,charId,st,cx,cy,h,o);}catch(e){if(CINE_PAINT.errors.length<50)CINE_PAINT.errors.push('actor: '+(e&&e.message));}
}
