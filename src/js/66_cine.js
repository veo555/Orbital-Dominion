/* =========================================================================
   CINEMATIC ENGINE — timeline, camera, layer compositor, colour grade, player overlay, export. Contract: docs/CINEMATIC_SPEC.md (§2 §3 §5).
   Rendering only. cineFrame(id,t,canvas,opts) is a PURE function of (film data, t, seed, opts): no Math.random, no Date / performance.now,
   no state carried between frames — the module-level Maps below are caches whose contents never change the pixels of a frame.
   Painters (backgrounds, props, fx, portraits, transitions, grade) live in the registry CINE_PAINT (64_cine_art.js and the art files).
   ========================================================================= */
const CNE={bgc:new Map(),endc:new Map(),run:null,seen:new Set(),grain:null,fid:new WeakMap(),fidN:0,stats:{bakes:0,bakeMs:0,frames:0,ends:0},safe:null,probe:null};
const CN_TALK=new WeakMap();
/* stage profiler (tests / tools: window.__RTS.CNE.prof={} then render; every stage forces a raster flush so the numbers are real) */
function cnPT(g,name,t0){const P=CNE.prof;if(!P)return 0;try{g.getImageData(0,0,1,1);}catch(e){}const n=performance.now();P[name]=(P[name]||0)+(n-t0);return n;}

const CN_DEPTH={bg:{zoom:1,pan:1,roll:1},far:{zoom:1.05,pan:1.05,roll:1},prop:{zoom:1.15,pan:1.15,roll:1},near:{zoom:1.35,pan:1.4,roll:1},actor:{zoom:.35,pan:.5,roll:.5}};
const CN_FX_ENV={explosion:[0,.25],flare:[.1,.3],lightning:[0,0],sparks:[0,.3],glitch:[0,0],pulse:[.3,.3],beam:[.12,.2]};   // fade-in / fade-out seconds by fx kind (default .3/.3; none at the very start / end of a scene)
const CN_ACOLD=['thought','narration'];                                                                                  // line styles whose speaker does not move his lips on screen
const CN_TIER_PART={battery:.5,balanced:.8,high:1,ultra:1.25};

/* ------------------------------------------ data access ------------------------------------------ */
const cnFilm=id=>typeof id==='string'?(STORY&&STORY.cine&&STORY.cine[id]):id;
const cnRM=()=>!!((typeof SET!=='undefined'&&SET.rm)||(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches));
function cnFid(fn){let n=CNE.fid.get(fn);if(!n){n=++CNE.fidN;CNE.fid.set(fn,n);}return n;}                              // identity of a painter function (cache keys)
function cineTimeline(c){                                                                                                // scenes are sequential: [{s,i,t0,t1,dur}], total
  const out=[];let t=0;(c.scenes||[]).forEach((s,i)=>{const d=Math.max(.05,+s.dur||0);out.push({s,i,t0:t,t1:t+d,dur:d});t+=d;});return{scenes:out,total:t};
}
function cnLocate(tl,t){
  const n=tl.scenes.length;t=cnC01(t/(tl.total||1))*tl.total;
  for(let i=0;i<n;i++){const e=tl.scenes[i];if(t<e.t1||i===n-1)return{i,local:Math.min(e.dur,Math.max(0,t-e.t0)),t};}
  return{i:0,local:0,t:0};
}
function cnOpts(o){
  o=o||{};const tier=o.tier||(typeof Q!=='undefined'&&Q.tier)||'high',bat=tier==='battery';
  return{tier,part:o.part!=null?o.part:(CN_TIER_PART[tier]||1),rm:o.rm!=null?!!o.rm:cnRM(),bloom:o.bloom!=null?!!o.bloom:!bat,grain:o.grain!=null?!!o.grain:!bat,res:o.res||1,
    seed:o.seed,noTrans:!!o.noTrans,frameOnly:!!o.frameOnly,subs:!!o.subs,title:o.title!==false,letterbox:o.letterbox,bars:o.bars,portrait:o.portrait};
}
const cnCall=(tag,fn,a,b,c,d,e,f,g,h)=>{try{fn(a,b,c,d,e,f,g,h);return true;}catch(err){cnFail(tag,err);return false;}};
function cnFail(tag,err){
  const m=tag+': '+(err&&err.message||err);
  if(CINE_PAINT.errors.indexOf(m)<0&&CINE_PAINT.errors.length<60){CINE_PAINT.errors.push(m);console.error('[cine] painter failed: '+m+(err&&err.stack?'\n'+err.stack.split('\n').slice(0,3).join('\n'):''));}
}
const cnReset=g=>{g.setTransform(1,0,0,1,0,0);g.globalAlpha=1;g.globalCompositeOperation='source-over';g.shadowBlur=0;g.shadowColor='rgba(0,0,0,0)';g.filter&&(g.filter==='none'||(g.filter='none'));g.lineWidth=1;g.setLineDash&&g.setLineDash([]);g.lineCap='butt';g.lineJoin='miter';g.textAlign='left';g.textBaseline='alphabetic';};

/* ------------------------------------------ transitions ------------------------------------------ */
function cnTrans(tl,i,rm){
  const e=tl.scenes[i],sc=e.s,T=sc.trans,first=i===0,last=i===tl.scenes.length-1;
  const norm=k=>!k||!CINE_TRANS.includes(k)?'cut':(rm&&k!=='cut'?'fade':k);
  const ink=norm(T&&T.in!==undefined?T.in:(first?'fade':'cut')),outk=norm(T&&T.out!==undefined?T.out:(last?'fade':'cut'));
  const len=T&&T.len!=null?+T.len:(!T&&first?0.6:!T&&last?0.8:0.6),L=Math.max(.08,Math.min(isFinite(len)?len:.6,e.dur*.45));
  return{in:{k:ink,len:L},out:{k:outk,len:L}};
}
/* ------------------------------------------ camera ------------------------------------------ */
const cnPose=(o,d)=>({x:o&&o.x!=null?o.x:d.x,y:o&&o.y!=null?o.y:d.y,z:o&&o.z!=null?o.z:d.z,r:o&&o.r!=null?o.r:d.r});
function cnCamEnds(sc){
  const cm=sc.cam,base={x:.5,y:.5,z:1,r:0};
  if(!cm)return{a:base,b:{x:.5,y:.5,z:1.04,r:0},ease:'lin'};            // no camera data: a barely perceptible push-in keeps still scenes alive
  const a=cnPose(cm.from,base);return{a,b:cnPose(cm.to,a),ease:cm.ease||'lin'};
}
function cnCam(sc,local,dur){const E=cnCamEnds(sc),k=cnEase(E.ease,local/dur);return{x:lerp(E.a.x,E.b.x,k),y:lerp(E.a.y,E.b.y,k),z:lerp(E.a.z,E.b.z,k),r:lerp(E.a.r,E.b.r,k)};}
function cnShake(sc,local,seed,rm){
  const o={x:0,y:0,r:0};if(rm||!sc.fx)return o;
  for(const e of sc.fx){
    if(e.k!=='shake')continue;const t0=e.t0||0,t1=e.t1==null?sc.dur:e.t1;if(local<t0||local>t1)continue;
    const u=(local-t0)/Math.max(.001,t1-t0),env=Math.min(1,u/.05)*Math.pow(1-u,.55)*(e.a==null?1:e.a),f=local*26;
    o.x+=(cnVN(f,1.3,seed)-.5)*2*env*.012;o.y+=(cnVN(f,7.7,seed+1)-.5)*2*env*.016;o.r+=(cnVN(f,3.1,seed+2)-.5)*2*env*.006;
  }
  return o;
}
/* margin (fractions of W,H) the cached background needs on every side so that no camera pose in this scene exposes an edge */
function cnMargins(sc,W,H,rm){
  const E=cnCamEnds(sc),poses=[E.a,E.b,{x:(E.a.x+E.b.x)/2,y:(E.a.y+E.b.y)/2,z:(E.a.z+E.b.z)/2,r:(E.a.r+E.b.r)/2}];
  let mx=0,my=0;
  for(const p of poses){
    const z=Math.max(.3,p.z),cr=Math.abs(Math.cos(p.r)),sr=Math.abs(Math.sin(p.r)),hx=(W/2*cr+H/2*sr)/z,hy=(W/2*sr+H/2*cr)/z,ox=(p.x-.5)*W,oy=(p.y-.5)*H;
    mx=Math.max(mx,(hx-W/2-ox)/W,(hx+ox-W/2)/W);my=Math.max(my,(hy-H/2-oy)/H,(hy+oy-H/2)/H);
  }
  const sh=!rm&&(sc.fx||[]).some(e=>e.k==='shake')?.03:0;                                    // camera-shake slack (shake is off under reduced motion)
  return{mx:Math.min(.7,Math.max(0,mx)+sh+.012),my:Math.min(.7,Math.max(0,my)+sh+.012),zmax:Math.max(E.a.z,E.b.z)};
}
function cnXf(g,W,H,cam,d){                                                                                              // world frame coordinates (0..W,0..H) -> screen, for a layer of depth d
  const z=1+(cam.z-1)*d.zoom;g.translate(W/2,H/2);g.rotate(cam.r*d.roll);g.scale(z,z);g.translate(-W/2-(cam.x-.5)*W*d.pan,-H/2-(cam.y-.5)*H*d.pan);
}
function cnProj(cam,W,H,x,y,d){                                                                                          // the same mapping for a single point (px) -> {x,y} screen px
  const z=1+(cam.z-1)*d.zoom,r=cam.r*d.roll,px=x-W/2-(cam.x-.5)*W*d.pan,py=y-H/2-(cam.y-.5)*H*d.pan,c=Math.cos(r),s=Math.sin(r);
  return{x:W/2+z*(px*c-py*s),y:H/2+z*(px*s+py*c)};
}

/* ------------------------------------------ scene look: time of day, faction, key light, grade ------------------------------------------ */
function cnTod(sc){
  const b=sc.bg||{};if(b.time)return b.time;
  switch(b.k){case'space':case'planet':case'orbit':case'array':return'space';case'bridge':case'hall':case'map':return'interior';case'void':return'void';default:return'day';}
}
function cnFaction(sc){
  const b=sc.bg||{};let f=b.faction||(b.k==='hall'?(b.style==='forbidden'?'obsidian':b.style):null)||(b.sides&&b.sides[0]);
  if(!FACTIONS[f]){f=null;const a=(sc.actors||[])[0],ch=a&&STORY.characters&&STORY.characters[a.char];if(ch&&FACTIONS[ch.faction])f=ch.faction;}
  return f;
}
function cnKey(sc,tod,fac){
  const b=sc.bg||{},T=CN_TOD[tod];let key=T?Object.assign({},T.key):{x:.5,y:.1,col:'#cfe0ff',a:.5};
  switch(b.k){
    case'orbit':{const pal=CN_PLANET[b.planet]||CN_PLANET.azure,p={bottom:[.5,1.1],top:[.5,-.1],left:[-.1,.5],right:[1.1,.5]}[b.limb]||[.5,1.1];key={x:p[0],y:p[1],col:pal.atm,a:.7};break;}
    case'planet':key={x:.25,y:.3,col:'#d6e8ff',a:.55};break;
    case'space':key={x:.8,y:.15,col:'#cfe0ff',a:.5};break;
    case'bridge':key={x:.5,y:0,col:b.alert?'#ff4a3a':cnFac(b.faction).light,a:.5};break;
    case'hall':key={x:.5,y:0,col:{cold:'#bcd8ff',warm:'#ffd0a0',blood:'#ff4a3a'}[b.light]||'#bcd8ff',a:.55};break;
    case'void':key={x:.5,y:.5,col:b.tint||'#7ac8ff',a:.5};break;
    case'map':key={x:.5,y:.2,col:cnFac(b.faction).light,a:.5};break;
    case'array':key={x:.5,y:.15,col:{dormant:'#9ab0d0',charging:'#ffd45a',firing:'#ff7a5a',broken:'#a08080'}[b.state]||'#9ab0d0',a:.6};break;
  }
  return key;
}
function cnCueAt(c,tl,i){let cue=c.music;for(let k=0;k<=i;k++){const m=tl.scenes[k].s.music;if(m&&m.cue)cue=m.cue;}return cue;}
function cnGradeFor(c,tl,i,tod,fac){
  const sc=tl.scenes[i].s,b=sc.bg||{},cue=cnCueAt(c,tl,i),G={tint:null,tintA:0,top:null,bot:null,splitA:0,sat:1,lift:0,liftCol:null,bloom:.22,vig:.5,grain:.06};
  switch(tod){
    case'night':G.tint='#1d3a8a';G.tintA=.4;G.bloom=.32;G.vig=.62;G.lift=.05;break;
    case'dusk':G.tint='#ff7a3a';G.tintA=.34;G.bloom=.3;break;
    case'dawn':G.tint='#ff9a8a';G.tintA=.28;G.bloom=.28;break;
    case'space':G.tint='#14224e';G.tintA=.22;G.bloom=.36;G.vig=.55;break;
    case'void':G.bloom=.5;G.vig=.45;break;
    case'interior':G.vig=.58;break;
  }
  if(fac==='aurora'){G.top='#27d3c8';G.bot='#ff9a4a';G.splitA=.4;}
  else if(fac==='meridian'){G.top='#3d7fe0';G.bot='#b8c8e0';G.splitA=.32;}
  else if(fac==='obsidian'){G.top='#8a1414';G.bot='#ff6a2a';G.splitA=.4;G.tint=G.tint||'#ff3a1a';G.tintA=Math.max(G.tintA,.16);G.vig=Math.max(G.vig,.6);}
  if(b.k==='bridge'&&b.alert){G.tint='#ff2a2a';G.tintA=.26;}
  if(b.k==='hall'){G.tint=G.tint||{cold:'#6a9aff',warm:'#ffa860',blood:'#ff2a1a'}[b.light];G.tintA=Math.max(G.tintA,.2);}
  if(b.k==='battlefield'||b.k==='ruins'){G.vig=Math.max(G.vig,.6);G.lift=Math.max(G.lift,.02);}
  if(cue==='tragedy'||cue==='sting_defeat'){G.sat=.42;G.tint='#8aa0b8';G.tintA=.3;G.vig=.7;}else if(cue==='dread'){G.sat=.7;G.vig=.68;}else if(cue==='betrayal'){G.sat=.78;G.tint='#7a1a2a';G.tintA=.2;}
  if(sc.grade)Object.assign(G,sc.grade);
  return G;
}

/* ------------------------------------------ lip-sync + lines ------------------------------------------ */
function cnTalkTrack(ln){
  const key=ln.text+'|'+ln.dur;let c=CN_TALK.get(ln);if(c&&c.key===key)return c;
  const words=String(ln.text||'').split(/\s+/).filter(Boolean),units=[];let tot=0;
  for(const w of words){const s=Math.max(1,(w.match(/[aeiouy]+/gi)||[]).length),pz=/[.!?…]$/.test(w)?1.4:/[,;:—-]$/.test(w)?.7:0;units.push({s,start:tot,pz});tot+=s+pz;}
  c={key,units,tot,sp:Math.min(Math.max(.4,(+ln.dur||2)-.15),tot*.215+.15),seed:cnHashStr(ln.text||'')};CN_TALK.set(ln,c);return c;
}
function cnTalk(ln,tl){                                                                                                  // mouth opening 0..1 at seconds `tl` into the line (closed form from the text)
  const c=cnTalkTrack(ln);if(tl<0||tl>c.sp||!c.tot)return 0;
  const u=tl/c.sp*c.tot;let wi=0;while(wi<c.units.length-1&&c.units[wi+1].start<=u)wi++;
  const w=c.units[wi],x=u-w.start;if(x>=w.s)return 0;
  const j=Math.floor(x),ph=x-j,amp=.45+.55*cnHash(c.seed,wi,j),att=cnSS(0,.06,tl)*cnSS(0,.12,c.sp-tl);
  return Math.pow(Math.sin(Math.PI*ph),.7)*amp*att;
}
function cnLineAt(sc,local){for(const ln of sc.lines||[])if(local>=ln.t&&local<ln.t+(ln.dur||0))return ln;return null;}
function cineLineAt(id,t){const c=cnFilm(id);if(!c)return null;const tl=cineTimeline(c),L=cnLocate(tl,t);return cnLineAt(tl.scenes[L.i].s,L.local);}

/* ------------------------------------------ the per-frame painter context S ------------------------------------------ */
function cnMakeS(R,W,H,cam){
  return{W,H,u:H/540,aspect:W/H,part:R.o.part,tier:R.o.tier,rm:R.o.rm,cam,tod:R.tod,faction:R.fac,key:R.key,lights:R.lights,ts:R.local,sceneIdx:R.i,seed:R.seed,
    fill:null,a:1,env:1,k:0,pos:null,pos2:null,zoom:cam.z,from:null,static:false};
}
/* the bright events of this instant (flares, explosions, lightning, beams) as normalised point lights — for painters that relight themselves */
function cnLights(sc,local){
  const out=[];
  for(const e of sc.fx||[]){
    if(e.k!=='flare'&&e.k!=='explosion'&&e.k!=='lightning'&&e.k!=='beam'&&e.k!=='pulse')continue;
    const t0=e.t0||0,t1=e.t1==null?sc.dur:e.t1;if(local<t0||local>t1)continue;
    const u=(local-t0)/Math.max(.001,t1-t0),a=(e.a==null?1:e.a)*(e.k==='explosion'||e.k==='lightning'?Math.max(0,1-u*1.6):Math.sin(Math.PI*cnC01(u)));
    out.push({x:e.x==null?.5:e.x,y:e.y==null?.5:e.y,col:e.col||(e.k==='explosion'?'#ff9a4a':e.k==='lightning'?'#cfe0ff':'#ffd9a0'),a,r:e.r||.4});
  }
  return out;
}

/* ------------------------------------------ backgrounds ------------------------------------------ */
function cnBgParams(bg){const k=bg&&bg.k;return Object.assign({},CN_BG_DEF[k]||{},bg||{});}
function cnBgSig(R,W,H,mx,my,rs,fn){return W+'x'+H+'|'+rs+'|'+mx.toFixed(3)+','+my.toFixed(3)+'|'+R.seed+'|'+cnFid(fn)+'|'+(CINE_PAINT.labels?1:0)+'|'+R.o.tier+'|'+JSON.stringify(R.sc.bg||null);}
function cnBakeBg(R,W,H,fn,p,mx,my,rs,key){
  const cw=Math.ceil(W*(1+2*mx)*rs),ch=Math.ceil(H*(1+2*my)*rs),cv=mkCanvas(cw,ch),g=cv.getContext('2d');
  const S=cnMakeS(R,W,H,{x:.5,y:.5,z:1,r:0});S.fill={x:-mx*W,y:-my*H,w:W*(1+2*mx),h:H*(1+2*my)};S.static=true;S.ts=0;S.lights=[];     // a baked frame must not depend on WHEN it was baked: no time, no transient lights
  g.setTransform(rs,0,0,rs,mx*W*rs,my*H*rs);g.fillStyle='#000';g.fillRect(S.fill.x,S.fill.y,S.fill.w,S.fill.h);
  const tb=performance.now();g.save();cnCall('bg:'+p.k,fn,g,W,H,p,0,R.seed,S);g.restore();
  g.setTransform(1,0,0,1,0,0);g.globalAlpha=1;g.globalCompositeOperation='source-over';
  if(mx>0||my>0){                                                                                                    // safety net: if a painter left the bleed margin transparent, stretch the frame edge into it
    const fx=Math.round(mx*W*rs),fy=Math.round(my*H*rs),fw=Math.round(W*rs),fh=Math.round(H*rs);g.globalCompositeOperation='destination-over';g.imageSmoothingEnabled=false;
    g.drawImage(cv,fx,fy,1,fh,0,fy,fx,fh);g.drawImage(cv,fx+fw-1,fy,1,fh,fx+fw,fy,cw-fx-fw,fh);
    g.drawImage(cv,0,fy,cw,1,0,0,cw,fy);g.drawImage(cv,0,fy+fh-1,cw,1,0,fy+fh,cw,ch-fy-fh);g.globalCompositeOperation='source-over';
  }
  CNE.stats.bakes++;CNE.stats.bakeMs=performance.now()-tb;(CNE.stats.bakeBy=CNE.stats.bakeBy||{})[p.k]=CNE.stats.bakeMs;CNE.bgc.set(key,{cv,mx,my});
  while(CNE.bgc.size>4)CNE.bgc.delete(CNE.bgc.keys().next().value);
  return CNE.bgc.get(key);
}
function cnBgPlan(R,W,H){                                                                                                // margin + cache resolution for this scene at this size
  const M=cnMargins(R.sc,W,H,R.o.rm);let rs=R.o.tier==='battery'?1:Math.min(2,Math.max(1,M.zmax));
  const px=W*H*(1+2*M.mx)*(1+2*M.my);if(px*rs*rs>9e6)rs=Math.max(.6,Math.sqrt(9e6/px));
  return{mx:M.mx,my:M.my,rs:Math.round(rs*4)/4};
}
function cnBgBake(R,W,H){                                                                                                // (also called ahead of time by the player) returns the cache entry or null for animated painters
  const sc=R.sc,p=cnBgParams(sc.bg),fn=CINE_PAINT.bg[p.k];if(!fn||fn.static!==true)return null;
  const P=cnBgPlan(R,W,H),key=cnBgSig(R,W,H,P.mx,P.my,P.rs,fn);let e=CNE.bgc.get(key);
  if(e){CNE.bgc.delete(key);CNE.bgc.set(key,e);return e;}
  return cnBakeBg(R,W,H,fn,p,P.mx,P.my,P.rs,key);
}
function cnDrawBg(g,W,H,R,cam,S){
  const sc=R.sc,p=cnBgParams(sc.bg),fn=CINE_PAINT.bg[p.k];
  if(!fn||fn.static!==true){g.fillStyle='#000';g.fillRect(0,0,W,H);}                                      // (a cached background always covers the whole frame: margins are sized for every pose)
  if(!fn)return;
  g.save();cnReset(g);cnXf(g,W,H,cam,CN_DEPTH.bg);
  if(fn.static===true){
    const e=cnBgBake(R,W,H);
    if(e){g.imageSmoothingEnabled=true;g.imageSmoothingQuality='low';g.drawImage(e.cv,-e.mx*W,-e.my*H,W*(1+2*e.mx),H*(1+2*e.my));}
    if(typeof fn.anim==='function'){const P=cnBgPlan(R,W,H);S.fill={x:-P.mx*W,y:-P.my*H,w:W*(1+2*P.mx),h:H*(1+2*P.my)};S.static=false;cnCall('bg.anim:'+p.k,fn.anim,g,W,H,p,R.local,R.seed,S);}
  }else{
    const P=cnBgPlan(R,W,H);S.fill={x:-P.mx*W,y:-P.my*H,w:W*(1+2*P.mx),h:H*(1+2*P.my)};S.static=false;
    g.fillStyle='#000';g.fillRect(S.fill.x,S.fill.y,S.fill.w,S.fill.h);cnCall('bg:'+p.k,fn,g,W,H,p,R.local,R.seed,S);
  }
  g.restore();
}

/* ------------------------------------------ props ------------------------------------------ */
function cnPropState(p,local,dur){
  const t0=p.t0||0,t1=p.t1==null?dur:p.t1,from=p.from||p.at||[.5,.5],to=p.to||from;
  const moving=!!(p.to&&p.from&&(to[0]!==from[0]||to[1]!==from[1]));
  const k=moving?cnEase(p.ease||'lin',(local-t0)/Math.max(.001,t1-t0)):0;
  let vis=local>=t0&&(moving||local<=t1),a=1;
  if(vis){const fi=t0>.05?cnC01((local-t0)/.25):1,fo=(!moving&&t1<dur-.05)?cnC01((t1-local)/.25):1;a=fi*fo;}
  return{vis,a,x:lerp(from[0],to[0],k),y:lerp(from[1],to[1],k),moving,dx:to[0]-from[0],dy:to[1]-from[1],t0,t1};
}
function cnDrawProps(g,W,H,R,cam,S,front){
  const sc=R.sc,list=sc.props;if(!list||!list.length)return;
  const idx=[];for(let i=0;i<list.length;i++)if(((list[i].z||0)>=1)===front)idx.push(i);
  idx.sort((a,b)=>((list[a].z||0)-(list[b].z||0))||(a-b));
  for(const i of idx){
    const q=list[i],fn=CINE_PAINT.prop[q.k];if(!fn)continue;
    const st=cnPropState(q,R.local,R.ent.dur);if(!st.vis)continue;
    const dep=front?CN_DEPTH.near:(q.z||0)<0?CN_DEPTH.far:CN_DEPTH.prop,size=H*.25*(q.scale==null?1:q.scale),X=st.x*W,Y=st.y*H;
    const sp=cnProj(cam,W,H,X,Y,dep),zz=1+(cam.z-1)*dep.zoom,m=size*Math.max(1,zz)*1.4+30;
    if(sp.x<-m||sp.x>W+m||sp.y<-m||sp.y>H+m)continue;                                                                // off-screen: not worth a painter call
    const flip=st.moving&&st.dx<0&&Math.abs(st.dx)>Math.abs(st.dy)*.3,pp=Object.assign({},CN_PROP_DEF[q.k]||{},q);
    pp.a=(q.a==null?1:q.a);pp.flip=flip;pp.vx=st.moving?st.dx*W/Math.max(.001,st.t1-st.t0):0;pp.vy=st.moving?st.dy*H/Math.max(.001,st.t1-st.t0):0;pp.rot=q.rot||0;
    S.a=pp.a*st.a;S.ts=R.local;S.k=cnC01((R.local-st.t0)/Math.max(.001,st.t1-st.t0));
    g.save();cnReset(g);cnXf(g,W,H,cam,dep);g.globalAlpha=S.a;
    g.translate(X,Y);if(flip)g.scale(-1,1);g.rotate(pp.rot);g.translate(-X,-Y);
    cnCall('prop:'+q.k,fn,g,X,Y,size,pp,Math.max(0,R.local-st.t0),cnH32(R.seed,i,0x9709,1),S);
    g.restore();
  }
  S.a=1;
}

/* ------------------------------------------ actors ------------------------------------------ */
function cnDrawActors(g,W,H,R,cam,S){
  const sc=R.sc,list=sc.actors,fn=CINE_PAINT.actor;if(!list||!list.length||!fn)return;
  const dur=R.ent.dur,ln=cnLineAt(sc,R.local);
  list.forEach((a,i)=>{
    const t0=a.t0||0,t1=a.t1==null?dur:a.t1;if(R.local<t0||R.local>t1)return;
    const fi=t0>.05?cnC01((R.local-t0)/.35):1,fo=t1<dur-.05?cnC01((t1-R.local)/.35):1,al=fi*fo;if(al<=0)return;
    const at=a.at||[.5,.62],mv=a.move,mt0=mv&&mv.t0!=null?mv.t0:t0,mt1=mv&&mv.t1!=null?mv.t1:t1,mk=mv&&mv.to?cnEase(mv.ease||'inout',(R.local-mt0)/Math.max(.001,mt1-mt0)):0;
    const x=lerp(at[0],mv&&mv.to?mv.to[0]:at[0],mk)*W,y0=lerp(at[1],mv&&mv.to?mv.to[1]:at[1],mk)*H,h=(a.h==null?.8:a.h)*H;
    const seed=cnH32(R.seed,i,cnHashStr(a.char||''),0xac7),ph=cnHash(seed,5,5)*TAU,bob=Math.sin(R.local*1.1+ph)*h*.004,sway=Math.sin(R.local*.7+ph)*.004;
    const mine=ln&&ln.who===a.char?ln:null,sty=mine&&(mine.style||'normal'),talking=mine&&CN_ACOLD.indexOf(sty)<0;
    let talk=talking?cnTalk(mine,R.local-mine.t):0;if(sty==='shout')talk=Math.min(1,talk*1.25);else if(sty==='whisper')talk*=.6;
    const st={expr:(mine&&mine.expr)||a.expr||'neutral',mode:a.mode||'bust',talk,blink:cnBlink(R.local,seed),face:a.face==='l'?'l':'r',t:R.local};
    const o={W,H,bottom:H*1.3,seed,u:S.u,key:R.key,lights:R.lights,rim:R.key?cnA(R.key.col,.9):null,tod:R.tod,faction:R.fac,S};
    g.save();cnReset(g);cnXf(g,W,H,cam,CN_DEPTH.actor);g.globalAlpha=al;g.translate(x,y0+bob);g.rotate(sway);g.translate(-x,-(y0+bob));
    cnCall('actor:'+(a.char||'?'),fn,g,a.char,st,x,y0+bob,h,o);g.restore();
  });
}

/* ------------------------------------------ fx ------------------------------------------ */
function cnDrawFx(g,W,H,R,cam,S){
  const sc=R.sc,list=sc.fx;if(!list||!list.length)return;const dur=R.ent.dur;
  list.forEach((e,i)=>{
    if(e.k==='shake')return;const fn=CINE_PAINT.fx[e.k];if(!fn)return;
    const t0=e.t0||0,t1=e.t1==null?dur:e.t1;if(R.local<t0||R.local>t1)return;
    const env=CN_FX_ENV[e.k]||[.3,.3],fi=t0>.05&&env[0]>0?cnC01((R.local-t0)/env[0]):1,fo=t1<dur-.05&&env[1]>0?cnC01((t1-R.local)/env[1]):1;
    S.env=fi*fo;S.a=(e.a==null?1:e.a)*S.env;S.ts=R.local;S.k=cnC01((R.local-t0)/Math.max(.001,t1-t0));S.zoom=cam.z;
    S.pos=e.x!=null||e.y!=null?cnProj(cam,W,H,(e.x==null?.5:e.x)*W,(e.y==null?.5:e.y)*H,CN_DEPTH.bg):null;
    S.pos2=Array.isArray(e.to)?cnProj(cam,W,H,e.to[0]*W,e.to[1]*H,CN_DEPTH.bg):null;
    g.save();cnReset(g);g.globalAlpha=S.a;cnCall('fx:'+e.k,fn,g,W,H,e,R.local-t0,e.seed!=null?e.seed|0:cnH32(R.seed,i,0xf3,2),S);g.restore();
  });
  S.a=1;S.pos=S.pos2=null;S.env=1;
}

/* ------------------------------------------ post: grain, radio crackle ------------------------------------------ */
function cnGrainTile(){
  if(CNE.grain)return CNE.grain;const n=160,c=mkCanvas(n,n),x=c.getContext('2d'),im=x.createImageData(n,n),d=im.data;
  for(let i=0;i<n*n;i++){const v=Math.round(128+(cnHash(i,11,3)+cnHash(i,12,3)+cnHash(i,13,3)-1.5)*150);d[i*4]=d[i*4+1]=d[i*4+2]=v;d[i*4+3]=255;}
  x.putImageData(im,0,0);return CNE.grain=c;
}
function cnGrain(g,W,H,t,seed,amt,u){
  const tile=cnGrainTile(),sz=Math.round(160*Math.max(1,Math.round(u))),f=Math.floor(t*24);let ox=-cnHash(f,seed,1)*sz,oy=-cnHash(f,seed,2)*sz;
  g.save();g.globalCompositeOperation='overlay';g.globalAlpha=amt;g.imageSmoothingEnabled=false;
  for(let y=oy;y<H;y+=sz)for(let x=ox;x<W;x+=sz)g.drawImage(tile,x,y,sz,sz);g.restore();
}
function cnRadio(g,W,H,t,seed,k,u){                                                                                      // static-crackle frame for `radio` lines (closed form; none under reduced motion is handled by the caller)
  const f=Math.floor(t*14);g.save();g.globalAlpha=k;
  g.fillStyle=cnRG(g,W/2,H/2,Math.min(W,H)*.42,Math.hypot(W,H)*.55,[[0,'rgba(60,200,255,0)'],[1,'rgba(60,200,255,.16)']]);g.fillRect(0,0,W,H);
  for(let i=0;i<5;i++){const y=cnHash(seed,f,i)*H,h=(1+cnHash(seed,f,i+9)*2)*u;g.fillStyle='rgba(200,235,255,'+(.05+cnHash(seed,f,i+19)*.1)+')';g.fillRect(0,y,W,h);}
  for(let i=0;i<46;i++){const x=cnHash(seed,f,i+31)*W,y=cnHash(seed,f,i+77)*H,s=(1+cnHash(seed,f,i+120)*2.4)*u;g.fillStyle='rgba(230,245,255,'+(.12+cnHash(seed,f,i+150)*.3)+')';g.fillRect(x,y,s*3,s);}
  const on=Math.floor(t*2)%2===0;g.fillStyle=on?'rgba(255,90,80,.9)':'rgba(255,90,80,.25)';g.beginPath();g.arc(W*.04+8*u,H*.07+4*u,3.2*u,0,TAU);g.fill();
  g.font='700 '+(10*u)+'px '+CN_FONT;g.fillStyle='rgba(200,235,255,.85)';g.textBaseline='middle';g.fillText('RADIO',W*.04+16*u,H*.07+4.5*u);
  g.restore();
}

/* ------------------------------------------ one layered frame of one scene (without transitions) ------------------------------------------ */
function cnPrep(c,tl,i,local,o){
  const ent=tl.scenes[i],sc=ent.s,tod=cnTod(sc),fac=cnFaction(sc),filmSeed=o.seed!=null?o.seed:(c.seed==null?1:c.seed);
  return{c,tl,ent,sc,i,local,o,tod,fac,key:cnKey(sc,tod,fac),lights:cnLights(sc,local),seed:cnH32(filmSeed|0,i,cnHashStr(sc.id||''),0x5ce)};
}
function cnLayers(g,W,H,R,cam){
  const sc=R.sc,S=cnMakeS(R,W,H,cam),G=cnGradeFor(R.c,R.tl,R.i,R.tod,R.fac);
  let tp=CNE.prof?performance.now():0;
  cnReset(g);
  cnDrawBg(g,W,H,R,cam,S);tp=cnPT(g,'bg',tp);
  cnDrawProps(g,W,H,R,cam,S,false);tp=cnPT(g,'props',tp);
  cnDrawActors(g,W,H,R,cam,S);tp=cnPT(g,'actors',tp);
  cnDrawProps(g,W,H,R,cam,S,true);tp=cnPT(g,'propsFront',tp);
  cnDrawFx(g,W,H,R,cam,S);tp=cnPT(g,'fx',tp);
  cnReset(g);cnVignette(g,W,H,G.vig,'#02050e',G.lift,G.liftCol);tp=cnPT(g,'vignette',tp);
  if(CINE_PAINT.grade){g.save();cnReset(g);cnCall('grade',CINE_PAINT.grade,g,W,H,G,R.local,R.seed,S);g.restore();}tp=cnPT(g,'grade',tp);
  if(R.o.bloom&&G.bloom>0){g.save();cnReset(g);cnCall('bloom',cnBloom,g,G.bloom);g.restore();}tp=cnPT(g,'bloom',tp);
  if(R.o.grain&&G.grain>0){g.save();cnReset(g);cnGrain(g,W,H,R.local+R.ent.t0,R.seed,G.grain,S.u);g.restore();}tp=cnPT(g,'grain',tp);
  const ln=cnLineAt(sc,R.local);
  if(ln&&ln.style==='radio'&&!R.o.rm){const k=Math.min(1,(R.local-ln.t)/.2,(ln.t+ln.dur-R.local)/.25);if(k>0){g.save();cnReset(g);cnRadio(g,W,H,R.local,R.seed,k,S.u);g.restore();}}
}
function cnSceneBody(g,W,H,R){                                                                                           // camera (+ shake) and, under reduced motion, a cross-fade instead of a move
  const sc=R.sc,dur=R.ent.dur,sh=cnShake(sc,R.local,R.seed,R.o.rm),E=cnCamEnds(sc);
  const camAt=p=>({x:p.x+sh.x,y:p.y+sh.y,z:p.z,r:p.r+sh.r});
  const moves=Math.abs(E.a.z-E.b.z)>.02||Math.abs(E.a.x-E.b.x)>.01||Math.abs(E.a.y-E.b.y)>.01||Math.abs(E.a.r-E.b.r)>.01;
  if(!R.o.rm||!moves){cnLayers(g,W,H,R,camAt(cnCam(sc,R.local,dur)));return;}
  const m=cnSS(.35,.65,R.local/dur);
  if(m<=0){cnLayers(g,W,H,R,camAt(E.a));return;}
  if(m>=1){cnLayers(g,W,H,R,camAt(E.b));return;}
  cnLayers(g,W,H,R,camAt(E.a));
  const s2=cnScratch('fb2',W,H),g2=s2.getContext('2d');cnLayers(g2,W,H,R,camAt(E.b));
  g.save();cnReset(g);g.globalAlpha=m;g.drawImage(s2,0,0);g.restore();
}
/* whole frame of scene i at `local`, including its in/out transitions */
function cnSceneFrame(g,W,H,c,tl,i,local,o){
  const R=cnPrep(c,tl,i,local,o);cnSceneBody(g,W,H,R);
  if(o.noTrans)return;
  const tr=cnTrans(tl,i,o.rm),dur=R.ent.dur,tseed=cnH32(R.seed,0x7a,1,1);
  if(tr.in.k!=='cut'&&local<tr.in.len){
    const k=cnC01(local/tr.in.len);let from=null;
    if(tr.in.k!=='flash'&&tr.in.k!=='fade')from=cnFromFrame(c,tl,i,W,H,o);                                         // fade / flash come from black / white; the others reveal the new scene over the previous scene's last frame
    cnTransPaint(g,W,H,tr.in.k,k,'in',tseed,from,o);
  }
  if(tr.out.k!=='cut'&&local>dur-tr.out.len)cnTransPaint(g,W,H,tr.out.k,cnC01((local-(dur-tr.out.len))/tr.out.len),'out',tseed+1,null,o);
}
function cnTransPaint(g,W,H,kind,k,dir,seed,from,o){
  const fn=CINE_PAINT.trans[kind];if(!fn)return;
  const S={from,rm:o.rm,u:H/540,W,H,part:o.part,tier:o.tier};
  g.save();cnReset(g);cnCall('trans:'+kind,fn,g,W,H,k,dir,seed,S);g.restore();
}
/* the last frame of the previous scene (source of a wipe / iris / glitch / dissolve into this one); black for the first scene. Cached per (scene, size). */
function cnFromFrame(c,tl,i,W,H,o){
  if(i<=0){const b=cnScratch('fbk',W,H),bg=b.getContext('2d');bg.setTransform(1,0,0,1,0,0);bg.globalAlpha=1;bg.globalCompositeOperation='source-over';bg.fillStyle='#000';bg.fillRect(0,0,W,H);return b;}
  const j=i-1,key=W+'x'+H+'|'+j+'|'+o.tier+'|'+(o.rm?1:0)+(o.bloom?'b':'')+(o.grain?'g':'')+'|'+(o.seed==null?'':o.seed)+'|'+(c.seed==null?1:c.seed)+'|'+(CINE_PAINT.labels?1:0)+'|'+JSON.stringify(tl.scenes[j].s)+'|'+tl.scenes[j].dur;
  let e=CNE.endc.get(key);
  if(e){CNE.endc.delete(key);CNE.endc.set(key,e);return e;}
  e=mkCanvas(W,H);const g=e.getContext('2d');cnSceneFrame(g,W,H,c,tl,j,tl.scenes[j].dur,Object.assign({},o,{frameOnly:true}));
  CNE.stats.ends++;CNE.endc.set(key,e);while(CNE.endc.size>3)CNE.endc.delete(CNE.endc.keys().next().value);return e;
}

/* ------------------------------------------ viewport layout ------------------------------------------ */
/* picture window inside a viewport (any units): landscape = 2.39:1 letterbox (or the viewport aspect clamped to 1.6..2.4 when the film asks for no bars),
   portrait = full width, 16:9, centred vertically (subtitles go into the black area underneath). */
function cnWindow(vw,vh,letterbox,portrait){
  const por=portrait!=null?portrait:vw<vh;let w,h;
  if(por){w=vw;h=vw*9/16;}
  else{const a=letterbox?2.39:Math.max(1.6,Math.min(2.4,vw/vh));w=vw;h=vw/a;if(h>vh){h=vh;w=vh*a;}}
  w=Math.round(w);h=Math.round(h);return{x:Math.round((vw-w)/2),y:Math.round((vh-h)/2),w,h,portrait:por,aspect:w/h};
}
function cnSafe(){                                                                                                       // resolved safe-area insets in CSS px
  try{
    if(!CNE.probe){const p=document.createElement('div');p.style.cssText='position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:var(--sat) var(--sar) var(--sab) var(--sal)';document.body.appendChild(p);CNE.probe=p;}
    const s=getComputedStyle(CNE.probe);return{t:parseFloat(s.paddingTop)||0,r:parseFloat(s.paddingRight)||0,b:parseFloat(s.paddingBottom)||0,l:parseFloat(s.paddingLeft)||0};
  }catch(e){return{t:0,r:0,b:0,l:0};}
}

/* ------------------------------------------ title card + canvas subtitles ------------------------------------------ */
function cnTitle(g,win,ti,local,dur,seed,rm){
  const t0=ti.t0==null?0:ti.t0,t1=ti.t1==null?dur:ti.t1;if(local<t0||local>t1||!ti.text)return;
  const fi=cnSS(0,.9,local-t0),fo=1-cnSS(0,.7,local-(t1-.7)),a=fi*fo;if(a<=0)return;
  const u=win.h/540,cx=win.x+win.w/2,cy=win.y+win.h*(ti.sub?.46:.5),k=cnEase('out',(local-t0)/2.2),track=rm?.2:lerp(.52,.2,k);
  g.font='300 100px '+CN_FONT;const n=[...ti.text].length,fs=Math.min(win.w*.07,win.h*.17,win.w*.9/(g.measureText(ti.text).width/100+.52*Math.max(0,n-1)));     // widest state (start tracking) must fit
  g.save();cnReset(g);g.beginPath();g.rect(win.x,win.y,win.w,win.h);g.clip();
  g.globalAlpha=a*.55;g.fillStyle=cnRG(g,cx,cy,0,win.w*.42,[[0,'rgba(2,4,10,.75)'],[1,'rgba(2,4,10,0)']]);g.fillRect(win.x,win.y,win.w,win.h);g.globalAlpha=a;
  cnText(g,ti.text,cx+fs*track*.5,cy,{size:fs,weight:'300',track,align:'center',base:'middle',fill:cnTok('--txt','#e6f0fc'),glow:{col:cnA(cnTok('--line3','#9bd6ff'),.55),blur:fs*.45}});
  const lw=win.w*.34*cnEase('out',(local-t0)/1.6);g.fillStyle=cnA(cnTok('--cry','#f6c04a'),.85);g.fillRect(cx-lw/2,cy+fs*.62,lw,Math.max(1,u*1.4));
  if(ti.sub){g.globalAlpha=a*cnSS(.5,1.4,local-t0);cnText(g,ti.sub,cx,cy+fs*1.2,{size:fs*.3,weight:'500',track:.32,align:'center',base:'middle',fill:cnTok('--txt2','#b4c8e0')});}
  g.restore();
}
const CN_SUBSTY={normal:{s:1,w:'500',i:false,a:1},radio:{s:.96,w:'500',i:false,a:1},whisper:{s:.88,w:'400',i:false,a:.72},shout:{s:1.2,w:'800',i:false,a:1},narration:{s:1,w:'400',i:true,a:.95},thought:{s:.96,w:'400',i:true,a:.8}};
function cnSubName(who){if(!who||who==='narrator')return null;const ch=STORY.characters&&STORY.characters[who];return ch?(ch.short||ch.name||who):who;}
function cnSubColor(who){const ch=STORY.characters&&STORY.characters[who];return(ch&&FACTIONS[ch.faction]&&FACTIONS[ch.faction].col.base)||NEUTRAL_COL.base;}
function cnDrawSubs(g,cw,ch,win,ln){                                                                                     // burned-in subtitles (export, stills); the live player uses the DOM strip instead
  if(!ln)return;const st=CN_SUBSTY[ln.style||'normal']||CN_SUBSTY.normal,por=win.portrait,fs=Math.max(12,Math.min(win.h*.052,cw*.045,30))*st.s,nm=cnSubName(ln.who),maxW=Math.min(win.w*(por?.92:.8),900*ch/540);
  g.save();cnReset(g);g.font=(st.i?'italic ':'')+st.w+' '+fs+'px '+CN_FONT;const lines=cnWrap(g,(ln.text||''),maxW),lh=fs*1.3,bh=lines.length*lh+fs*(nm?1.5:.5);
  const barB=ch-(win.y+win.h),y0=por?win.y+win.h+fs*1.2:(barB>=bh+fs*.8?win.y+win.h+(barB-bh)/2:win.y+win.h-bh-win.h*.05),cx=cw/2;
  if(!por&&barB<bh+fs*.8){g.fillStyle='rgba(2,4,10,.5)';g.fillRect(cx-maxW/2-fs*.6,y0-fs*.3,maxW+fs*1.2,bh+fs*.2);}
  let y=y0+fs*.2;g.globalAlpha=st.a;
  if(nm){g.fillStyle=cnSubColor(ln.who);g.beginPath();g.arc(cx-maxW/2+fs*.35,y+fs*.55,fs*.28,0,TAU);g.fill();g.font='700 '+(fs*.82)+'px '+CN_FONT;g.fillStyle=cnSubColor(ln.who);g.textBaseline='top';g.fillText(nm.toUpperCase()+(ln.style==='radio'?'  ·  RADIO':''),cx-maxW/2+fs*.9,y+fs*.12);y+=fs*1.5;}
  g.font=(st.i?'italic ':'')+st.w+' '+fs+'px '+CN_FONT;g.textBaseline='top';g.textAlign='center';g.fillStyle=cnTok('--txt','#e6f0fc');g.shadowColor='rgba(0,0,0,.8)';g.shadowBlur=fs*.3;
  for(const l of lines){g.fillText(l,cx,y);y+=lh;}
  g.restore();
}

/* ------------------------------------------ PUBLIC: pure still ------------------------------------------ */
/* cineFrame(id|film, t, canvas?, opts?) -> canvas.  Draws the exact image of global time t. canvas = the viewport (letterbox bars + picture window) unless opts.frameOnly,
   in which case the picture fills the whole canvas. opts: {tier,part,rm,bloom,grain,res,seed,noTrans,frameOnly,subs,title,letterbox,portrait} */
function cineFrame(id,t,canvas,opts){
  const c=cnFilm(id);if(!c||!c.scenes||!c.scenes.length)return canvas||null;
  const o=cnOpts(opts);if(!canvas){canvas=document.createElement('canvas');canvas.width=(opts&&opts.w)||1280;canvas.height=(opts&&opts.h)||720;}
  const g=canvas.getContext('2d'),cw=canvas.width,ch=canvas.height,tl=cineTimeline(c),L=cnLocate(tl,+t||0),sc=tl.scenes[L.i].s;
  const lb=o.letterbox!=null?o.letterbox:c.letterbox!==false,win=o.frameOnly?{x:0,y:0,w:cw,h:ch,portrait:false,aspect:cw/ch}:cnWindow(cw,ch,lb,o.portrait);
  const fw=Math.max(2,Math.round(win.w*o.res)),fh=Math.max(2,Math.round(win.h*o.res)),direct=o.frameOnly&&o.res===1;
  const fb=direct?canvas:cnScratch('fb',fw,fh),fg=direct?g:fb.getContext('2d');
  cnSceneFrame(fg,fw,fh,c,tl,L.i,L.local,o);
  if(!direct){
    const tb=CNE.prof?performance.now():0;
    g.setTransform(1,0,0,1,0,0);g.globalAlpha=1;g.globalCompositeOperation='source-over';
    if(!o.frameOnly){g.fillStyle='#000';g.fillRect(0,0,cw,ch);}
    g.imageSmoothingEnabled=true;g.imageSmoothingQuality='low';g.drawImage(fb,0,0,fw,fh,win.x,win.y,win.w,win.h);cnPT(g,'blit',tb);
  }
  if(o.title&&sc.title)cnTitle(g,win,sc.title,L.local,tl.scenes[L.i].dur,0,o.rm);
  if(o.subs)cnDrawSubs(g,cw,ch,win,cnLineAt(sc,L.local));
  CNE.stats.frames++;return canvas;
}
function cineDuration(id){const c=cnFilm(id);return c&&c.scenes?c.scenes.reduce((a,s)=>a+(+s.dur||0),0):0;}
/* every vocabulary id must have a painter (tests assert this) */
function cineCoverage(){
  const miss=[];
  for(const k of Object.keys(CINE_BG))if(typeof CINE_PAINT.bg[k]!=='function')miss.push('bg:'+k);
  for(const k of Object.keys(CINE_PROPS))if(typeof CINE_PAINT.prop[k]!=='function')miss.push('prop:'+k);
  for(const k of CINE_FX)if(typeof CINE_PAINT.fx[k]!=='function')miss.push('fx:'+k);
  for(const k of CINE_TRANS)if(typeof CINE_PAINT.trans[k]!=='function')miss.push('trans:'+k);
  if(typeof CINE_PAINT.actor!=='function')miss.push('actor');
  if(typeof CINE_PAINT.grade!=='function')miss.push('grade');
  return miss;
}
function cineStats(){return{bakes:CNE.stats.bakes,frames:CNE.stats.frames,ends:CNE.stats.ends,errors:CINE_PAINT.errors.slice(),bgCache:CNE.bgc.size,placeholders:{bg:Object.keys(CINE_PAINT.bg).filter(k=>CINE_PAINT.bg[k].placeholder),prop:Object.keys(CINE_PAINT.prop).filter(k=>CINE_PAINT.prop[k].placeholder),fx:Object.keys(CINE_PAINT.fx).filter(k=>CINE_PAINT.fx[k].placeholder),actor:!!(CINE_PAINT.actor&&CINE_PAINT.actor.placeholder)},bakeBy:Object.assign({},CNE.stats.bakeBy||{})};}

/* ------------------------------------------ audio coupling (every call is guarded: the audio engine may not exist yet) ------------------------------------------ */
const cnA_=(fn,...a)=>{try{return typeof fn==='function'?fn(...a):undefined;}catch(e){}};
function cnBuildEvents(c,tl){
  const ev=[];
  for(const e of tl.scenes){
    const s=e.s;ev.push({t:e.t0,k:'scene',i:e.i});
    (s.sfx||[]).forEach(x=>ev.push({t:e.t0+(+x.t||0),k:'sfx',name:x.name}));
    (s.lines||[]).forEach(l=>ev.push({t:e.t0+(+l.t||0),k:'line',ln:l}));
  }
  ev.sort((a,b)=>a.t-b.t||(a.k==='scene'?-1:1));return ev;
}
function cnStopSpeech(){cnA_(speakStop);try{if(typeof speechSynthesis!=='undefined')speechSynthesis.cancel();}catch(e){}}
function cnAudioSuspend(){try{if(typeof suspendAudio==='function')suspendAudio();else if(typeof AC!=='undefined'&&AC&&AC.state==='running')AC.suspend();}catch(e){}try{if(typeof speechSynthesis!=='undefined')speechSynthesis.pause();}catch(e){}}
function cnAudioResume(){cnA_(audioInit);try{if(typeof AC!=='undefined'&&AC&&AC.state==='suspended')AC.resume();}catch(e){}try{if(typeof speechSynthesis!=='undefined')speechSynthesis.resume();}catch(e){}}

/* ------------------------------------------ runner: clock, audio events, match hold; shared by the player and the exporter ------------------------------------------ */
function cnRunner(c,id,opts,io){
  const tl=cineTimeline(c),total=tl.total,events=cnBuildEvents(c,tl),muted=!!opts.muted;
  let resolve;const done=new Promise(r=>{resolve=r;});
  const R={id,c,tl,total,t:Math.max(0,Math.min(total,+opts.from||0)),paused:false,holds:{},ended:false,painted:false,last:0,raf:0,ei:0,gp:null,gref:null,prevFocus:null,lastDraw:-1,perf:0,pAcc:0,pN:0,o:null,done};
  R.api={stop(){R.finish('stopped');},skip(){R.skip();},pause(){R.hold('api',true);},resume(){R.hold('api',false);},t(){return R.t;},done};
  R.skippable=opts.skippable!==false;
  R.skip=()=>{if(!R.skippable||R.ended)return;R.finish('skipped');};
  R.hold=(k,on)=>{
    if(R.ended)return;const was=R.paused;R.holds[k]=!!on;R.paused=Object.keys(R.holds).some(x=>R.holds[x]);
    if(R.paused&&!was){R.last=0;if(!muted)cnAudioSuspend();}else if(!R.paused&&was){if(!muted)cnAudioResume();}
  };
  R.audioStart=()=>{
    if(muted)return;
    if(c.music)cnA_(musicPlay,c.music,{fade:.4,film:id});
    let cue=null;for(const e of tl.scenes)if(e.t0<=R.t&&e.s.music&&e.s.music.cue)cue=e.s.music;if(cue&&R.t>0)cnA_(musicPlay,cue.cue,{section:cue.section,fade:.4,film:id});
    while(R.ei<events.length&&events[R.ei].t<R.t-.001)R.ei++;
  };
  R.fire=()=>{
    while(R.ei<events.length&&events[R.ei].t<=R.t){
      const e=events[R.ei++];if(muted)continue;const stale=R.t-e.t>.6;
      if(e.k==='scene'){const m=tl.scenes[e.i].s.music;if(m&&m.cue&&e.t>0)cnA_(musicPlay,m.cue,{section:m.section,fade:.8,crossfade:true,film:id});}
      else if(stale)continue;
      else if(e.k==='sfx')cnA_(cineSfx,e.name);
      else if(e.k==='line'){const l=e.ln;cnA_(speak,l.who,l.text,{style:l.style||'normal',expr:l.expr});cnA_(musicDuck,.45,Math.round(((+l.dur||2)+.25)*1000));}
    }
  };
  R.hold0=()=>{if(typeof G!=='undefined'&&G){R.gref=G;R.gp=G.paused;G.paused=true;}};
  R.release=()=>{if(R.gref&&typeof G!=='undefined'&&G===R.gref)R.gref.paused=R.gp;R.gref=null;};
  R.perfNote=ms=>{                                                                                                       // adaptive resolution: only ever steps DOWN (never flaps)
    if(!io.adaptive)return;R.pAcc+=ms;R.pN++;if(R.pAcc<1600)return;const mean=R.pAcc/R.pN;R.pAcc=0;R.pN=0;
    const target=(typeof Q!=='undefined'&&Q.fps===30)?33.4:16.7;if(mean>target*1.9&&R.perf<2){R.perf++;io.onPerf&&io.onPerf(R.perf);}
  };
  R.tick=ts=>{
    if(R.ended)return;R.raf=requestAnimationFrame(R.tick);
    if(R.paused){R.last=0;return;}
    if(!R.painted){const t0=performance.now();io.draw(R);R.painted=true;R.last=ts;R.audioStart();io.afterDraw&&io.afterDraw(R);return;}
    if(!R.last)R.last=ts;let dt=(ts-R.last)/1000;R.last=ts;if(!(dt>0))dt=0;
    R.t+=dt;R.fire();if(io.onTime)io.onTime(R);
    const fin=R.t>=total;if(fin)R.t=total;
    const cap=(typeof Q!=='undefined'&&Q.fps)||0;
    if(fin||!cap||ts-R.lastDraw>=1000/cap-2){const t0=performance.now();io.draw(R);R.lastDraw=ts;R.perfNote(performance.now()-t0+dt*0);io.afterDraw&&io.afterDraw(R);}
    if(fin)R.finish('done');
  };
  R.start=()=>{
    R.hold0();if(io.start)io.start(R);
    if(typeof document!=='undefined'){R.vis=()=>R.hold('hidden',document.hidden);document.addEventListener('visibilitychange',R.vis);window.addEventListener('pagehide',R.vis);}
    R.raf=requestAnimationFrame(R.tick);
  };
  R.finish=reason=>{
    if(R.ended)return;R.ended=true;cancelAnimationFrame(R.raf);
    if(R.vis){document.removeEventListener('visibilitychange',R.vis);window.removeEventListener('pagehide',R.vis);}
    if(!muted){cnStopSpeech();cnA_(musicStop,.8);if(R.musicState&&typeof musicRestore==='function')cnA_(musicRestore,R.musicState);}
    if(R.paused&&!muted)cnAudioResume();
    if(io.stop)io.stop(R,reason);
    R.release();if(CNE.run===R)CNE.run=null;CNE.seen.add(id);
    const info={id,reason,skipped:reason==='skipped',t:R.t,total};resolve(info);
    if(opts.onEnd){try{opts.onEnd(info);}catch(e){console.error('[cine] onEnd threw: '+(e&&e.message));}}
  };
  return R;
}

/* ------------------------------------------ player overlay ------------------------------------------ */
function cnDom(){
  const ov=$('cineOverlay');if(!ov)return null;
  return CNE.dom&&CNE.dom.ov===ov?CNE.dom:(CNE.dom={ov,cv:$('cine'),sub:$('cineSub'),skip:$('cineSkip'),hint:$('cineHint'),prog:$('cineProg')&&$('cineProg').firstElementChild});
}
function cnSubSet(D,ln){
  const el=D.sub;el.textContent='';if(!ln){el.className='';return;}
  const sty=ln.style||'normal',box=document.createElement('div'),nm=cnSubName(ln.who);
  box.className='cs-box cs-'+sty;
  if(nm){const who=document.createElement('span');who.className='cs-who';const chip=document.createElement('i');chip.className='cs-chip';chip.style.background=cnSubColor(ln.who);
    const b=document.createElement('b');b.textContent=nm;who.appendChild(chip);who.appendChild(b);if(sty==='radio'){const tg=document.createElement('em');tg.textContent='RADIO';who.appendChild(tg);}box.appendChild(who);}
  const tx=document.createElement('span');tx.className='cs-txt';tx.textContent=ln.text||'';box.appendChild(tx);el.appendChild(box);
}
function cnLayoutDom(R,D){
  const vw=window.innerWidth,vh=window.innerHeight,dpr=Math.max(1,Math.min(2.5,window.devicePixelRatio||1,(typeof Q!=='undefined'&&Q.dpr)||2.5));
  let k=dpr;const px=vw*vh*dpr*dpr;if(px>4.6e6)k=Math.sqrt(4.6e6/(vw*vh));
  const W=Math.round(vw*k),H=Math.round(vh*k);if(D.cv.width!==W||D.cv.height!==H){D.cv.width=W;D.cv.height=H;}
  const lb=R.c.letterbox!==false,win=cnWindow(vw,vh,lb),sf=cnSafe(),fs=Math.max(14,Math.min(win.h*.052,vw*.045,30));
  R.win=win;R.k=k;R.vw=vw;R.vh=vh;
  const s=D.sub.style,barB=vh-(win.y+win.h);
  if(win.portrait){s.top=(win.y+win.h+12)+'px';s.height=Math.max(40,vh-(win.y+win.h)-12-sf.b-60)+'px';s.alignItems='flex-start';s.bottom='auto';}
  else if(barB>=fs*3.2+sf.b){s.top=(win.y+win.h)+'px';s.height=(barB-sf.b)+'px';s.alignItems='center';s.bottom='auto';}
  else{const bot=Math.min(vh-sf.b-8,win.y+win.h-win.h*.04);s.top=Math.max(0,bot-win.h*.3)+'px';s.height=(win.h*.3)+'px';s.alignItems='flex-end';s.bottom='auto';}
  s.left='0';s.right='0';s.setProperty('--cs-fs',fs+'px');s.setProperty('--cs-w',Math.min(win.w*(win.portrait?.92:.8),900)+'px');
  D.ov.classList.toggle('cine-portrait',win.portrait);
  const hint=D.hint;if(win.portrait&&!R.hintShown){R.hintShown=true;hint.classList.remove('hidden');hint.style.top=Math.max(8,sf.t+8)+'px';clearTimeout(R.hintT);R.hintT=setTimeout(()=>hint.classList.add('hidden'),5000);}
  else if(!win.portrait){hint.classList.add('hidden');}
}
function cinePlay(id,opts){
  opts=opts||{};const c=cnFilm(id),D=cnDom(),idstr=typeof id==='string'?id:(c&&c.id)||'film';
  if(!c||!c.scenes||!c.scenes.length||!D){
    const info={id:idstr,reason:'missing',skipped:false,t:0,total:0};if(opts.onEnd)setTimeout(()=>{try{opts.onEnd(info);}catch(e){}},0);
    return{stop(){},skip(){},pause(){},resume(){},t(){return 0;},done:Promise.resolve(info)};
  }
  if(CNE.run)CNE.run.finish('replaced');
  const hs={};let tapT=0,downT=0,holdTimer=0,skipTimer=0;
  const showSkip=()=>{if(!R.skippable)return;D.skip.classList.add('on');clearTimeout(skipTimer);skipTimer=setTimeout(()=>{if(document.activeElement!==D.skip)D.skip.classList.remove('on');},2500);};
  const io={adaptive:true,
    onPerf(l){R.o=Object.assign({},R.o,{res:l>=2?.75:1,bloom:false,grain:l<2&&R.o.grain,part:Math.max(.35,R.o.part*.65)});},
    start(R){
      R.o=cnOpts({subs:false});R.prevFocus=document.activeElement;
      if(typeof musicState==='function')R.musicState=cnA_(musicState);
      D.ov.classList.remove('hidden');D.ov.setAttribute('aria-label','Cinematic: '+(c.title||idstr));D.skip.classList.toggle('hidden',!R.skippable);D.skip.classList.remove('on');
      cnLayoutDom(R,D);cnSubSet(D,null);R.subLine=null;try{D.ov.focus({preventScroll:true});}catch(e){}
      hs.key=e=>{e.stopImmediatePropagation();if(e.key==='Escape'||e.key===' '||e.key==='Spacebar'||e.key==='Enter'){e.preventDefault();R.skip();}else showSkip();};
      hs.move=()=>showSkip();
      hs.down=e=>{showSkip();if(e.pointerType==='mouse'||e.target===D.skip)return;const n=performance.now();if(n-tapT<350){R.skip();return;}tapT=n;downT=n;clearTimeout(holdTimer);holdTimer=setTimeout(()=>R.skip(),750);};
      hs.up=()=>{clearTimeout(holdTimer);};
      hs.skipClick=e=>{e.preventDefault();e.stopPropagation();R.skip();};
      hs.resize=()=>{if(R.ended)return;cnLayoutDom(R,D);R.last=0;if(R.painted)io.draw(R);};
      hs.pop=()=>{if(!R.ended){R.skip();try{if(typeof PLAT!=='undefined'&&PLAT.installed)history.pushState({od:1},'');}catch(err){}}};
      hs.keyup=e=>{if(!R.ended)e.stopImmediatePropagation();};window.addEventListener('keydown',hs.key,true);window.addEventListener('keyup',hs.keyup,true);
      D.ov.addEventListener('pointermove',hs.move);D.ov.addEventListener('pointerdown',hs.down);D.ov.addEventListener('pointerup',hs.up);D.ov.addEventListener('pointercancel',hs.up);
      D.skip.addEventListener('click',hs.skipClick);D.skip.addEventListener('focus',showSkip);
      window.addEventListener('resize',hs.resize);window.addEventListener('orientationchange',hs.resize);window.addEventListener('popstate',hs.pop);
      if(window.visualViewport)window.visualViewport.addEventListener('resize',hs.resize);
      try{const cap=window.Capacitor&&Capacitor.Plugins&&Capacitor.Plugins.App;if(cap&&cap.addListener)hs.cap=cap.addListener('backButton',()=>{if(!R.ended)R.skip();});}catch(e){}
      if(R.skippable)setTimeout(showSkip,0);
    },
    draw(R){
      const o=R.o;cineFrame(c,R.t,D.cv,{tier:o.tier,part:o.part,rm:o.rm,bloom:o.bloom,grain:o.grain,res:o.res,subs:false});
      const L=cnLocate(R.tl,R.t),ln=cnLineAt(R.tl.scenes[L.i].s,L.local);
      if(ln!==R.subLine){R.subLine=ln;cnSubSet(D,ln);}
      if(D.prog)D.prog.style.transform='scaleX('+(R.t/R.total)+')';
    },
    afterDraw(R){                                                                                                          // ahead-of-time work, at most one item per frame, scheduled while the scene is still fading in (hitches hide in the dark)
      const L=cnLocate(R.tl,R.t),e=R.tl.scenes[L.i],nx=R.tl.scenes[L.i+1];if(!nx)return;
      if(R.prep===undefined||R.prepScene!==L.i){R.prep=0;R.prepScene=L.i;}
      const o=R.o,win=cnWindow(D.cv.width,D.cv.height,R.c.letterbox!==false),dw=Math.max(2,Math.round(win.w*o.res)),dh=Math.max(2,Math.round(win.h*o.res));
      if(R.prep===0&&L.local>=Math.min(.12,e.dur*.2)){R.prep=1;try{cnBgBake(cnPrep(R.c,R.tl,nx.i,0,o),dw,dh);}catch(err){cnFail('prebake',err);}return;}   // next scene's background
      if(R.prep===1&&L.local>=Math.min(1,e.dur*.5)){R.prep=2;                                                          // the frame a wipe / iris / glitch into the next scene starts from
        const k=cnTrans(R.tl,nx.i,o.rm).in.k;if(k==='cut'||k==='fade'||k==='flash')return;try{cnFromFrame(R.c,R.tl,nx.i,dw,dh,Object.assign({},o,{frameOnly:true}));}catch(err){cnFail('prebake-from',err);}}
    },
    stop(R,reason){
      window.removeEventListener('keydown',hs.key,true);window.removeEventListener('keyup',hs.keyup,true);window.removeEventListener('resize',hs.resize);window.removeEventListener('orientationchange',hs.resize);window.removeEventListener('popstate',hs.pop);
      if(window.visualViewport)window.visualViewport.removeEventListener('resize',hs.resize);
      D.ov.removeEventListener('pointermove',hs.move);D.ov.removeEventListener('pointerdown',hs.down);D.ov.removeEventListener('pointerup',hs.up);D.ov.removeEventListener('pointercancel',hs.up);
      D.skip.removeEventListener('click',hs.skipClick);D.skip.removeEventListener('focus',showSkip);
      try{if(hs.cap&&hs.cap.remove)hs.cap.remove();else if(hs.cap&&hs.cap.then)hs.cap.then(h=>h&&h.remove&&h.remove());}catch(e){}
      clearTimeout(holdTimer);clearTimeout(skipTimer);clearTimeout(R.hintT);
      D.ov.classList.add('hidden');D.skip.classList.remove('on');D.hint.classList.add('hidden');cnSubSet(D,null);
      try{const g=D.cv.getContext('2d');g.setTransform(1,0,0,1,0,0);g.fillStyle='#000';g.fillRect(0,0,D.cv.width,D.cv.height);}catch(e){}
      try{if(R.prevFocus&&R.prevFocus.focus&&document.contains(R.prevFocus))R.prevFocus.focus({preventScroll:true});}catch(e){}
    }};
  const R=cnRunner(c,idstr,opts,io);CNE.run=R;R.start();return R.api;
}
function cineActive(){return !!CNE.run;}
function cineStop(){if(CNE.run)CNE.run.finish('stopped');}

/* ------------------------------------------ export to WebM ------------------------------------------ */
function cineExport(id,o){
  o=o||{};const c=cnFilm(id);
  if(!c||!c.scenes||!c.scenes.length||typeof MediaRecorder==='undefined'||!HTMLCanvasElement.prototype.captureStream)return Promise.resolve(null);
  const w=o.w||1280,h=o.h||720,fps=o.fps||30,idstr=typeof id==='string'?id:(c.id||'film');
  const cnv=document.createElement('canvas');cnv.width=w;cnv.height=h;
  let stream;try{stream=cnv.captureStream(fps);}catch(e){return Promise.resolve(null);}
  let as=null;try{as=typeof audioCaptureStream==='function'&&!o.muted?audioCaptureStream():null;}catch(e){as=null;}
  const at=as&&as.getAudioTracks?as.getAudioTracks():[];if(at.length)at.forEach(tr=>stream.addTrack(tr));
  const cand=at.length?['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm']:['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
  const mime=cand.find(m=>{try{return MediaRecorder.isTypeSupported(m);}catch(e){return false;}});if(!mime)return Promise.resolve(null);
  let rec;try{rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:o.bitrate||4e6});}catch(e){return Promise.resolve(null);}
  if(CNE.run)CNE.run.finish('replaced');
  return new Promise(resolve=>{
    const chunks=[];let aborted=false,lastP=-1;
    rec.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data);};
    rec.onerror=()=>resolve(null);
    rec.onstop=()=>{const b=new Blob(chunks,{type:'video/webm'});resolve(!aborted&&b.size>0?b:null);};
    const io={adaptive:false,
      start(R){R.o=cnOpts({subs:true,tier:o.tier||'high',rm:o.rm});if(o.signal)o.signal.addEventListener('abort',()=>{aborted=true;R.finish('stopped');});},
      draw(R){const op=R.o;cineFrame(c,R.t,cnv,{tier:op.tier,part:op.part,rm:op.rm,bloom:op.bloom,grain:op.grain,subs:true});
        if(o.onProgress){const p=Math.round(R.t/R.total*50)/50;if(p!==lastP){lastP=p;try{o.onProgress(p);}catch(e){}}}},
      stop(R,reason){setTimeout(()=>{try{if(rec.state!=='inactive')rec.stop();else resolve(null);}catch(e){resolve(null);}},reason==='done'?160:0);if(o.onProgress&&reason==='done')try{o.onProgress(1);}catch(e){}}};
    const R=cnRunner(c,idstr,{muted:o.muted,skippable:false,onEnd:()=>{}},io);CNE.run=R;
    try{rec.start(250);}catch(e){CNE.run=null;resolve(null);return;}
    R.start();
  });
}

/* ------------------------------------------ gallery, init, test hooks ------------------------------------------ */
function cineGallery(){
  let saved={};try{const s=JSON.parse(localStorage.getItem(CAMP_SAVEKEY)||'null');if(s&&s.seen)saved=s.seen;}catch(e){}
  return Object.keys(STORY.cine).map(id=>({id,title:STORY.cine[id].title,kind:STORY.cine[id].kind,len:cineDuration(id),seen:!!(saved[id]||CNE.seen.has(id))}));
}
function cineInit(){
  if(window.__TEST&&window.__RTS)Object.assign(window.__RTS,{CINE_PAINT,CNE,cineTimeline,cineCoverage,cineStats,cineLineAt,drawPortrait,cnWindow,cnLocate,cnGradeFor,cnTrans,cnCam,cnMargins,cnTalk,cnHash,cnH32,CINE_BG,CINE_FX,CINE_PROPS,CINE_TRANS,CINE_EXPR,CINE_ACTOR_MODES,CINE_SFX});
}
