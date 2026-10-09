/* =========================================================================
   PORTRAITS — PORTRAIT_PAINT.actor: one painter that draws EVERY character in EVERY mode from `STORY.characters[id].look`.
   Rendering only (never touches simulation state); a pure function of (look, state, opts):
   no Math.random / Date — all variation comes from cnHash(characterSeed, i, j). Everything is vector code in unit space (1 unit = bust box height).

   Anatomy of the figure (back to front):  halo -> torso (per armour style) -> back hair / hood lining / cape -> neck -> torso front (gorget, collar, cowl)
   -> head group { ears, skull + shading, brows, eyes, nose, mouth with teeth + tongue + jaw drop, wrinkles, marks, mask / visor, hair front, hood rim, crown }.
   Faces are DERIVED, not stamped: jaw, chin, cheekbones, nose, eyes, brows, lips and ears come from build / age / side / role plus a per-character hash,
   so two characters with the same look data still read as different people. Expressions drive the eyelids, brows, cheeks, mouth corners, wrinkles and
   head tilt (see CPT_XT); `state.talk` drives the mouth opening and the jaw; `state.blink` the lids.
   Modes: bust | silhouette (rim-lit black) | shadow (hidden in the dark, glowing eyes) | hologram (cyan, scanlines, flicker).
   ========================================================================= */
(()=>{
const CPT_HY=-.12;            // head centre y (unit = bust box height, origin = box centre)
const CPT_HS=1.1;             // head scale (a big head reads better at 64 px)
const CPT_FS=.022;            // facial features sit this far toward the facing side (3/4 turn)
const CPT_HAIR=['short','long','shaved','crest','braid','hood','bald','bun','mane'];
const CPT_ARM=['plate','coat','robe','suit','rags','crown','hood'];
const CPT_BLD={slight:{sw:.34,nw:.07,jw:.9,hs:.97,ear:.92},lean:{sw:.4,nw:.078,jw:1,hs:1,ear:1},broad:{sw:.49,nw:.096,jw:1.1,hs:1.03,ear:1.05},massive:{sw:.57,nw:.112,jw:1.2,hs:1.06,ear:1.1}};

/* ------------------------------------ expression rig ------------------------------------
   bi/bo near brow inner/outer raise (+ up, 1 = .017 h) · bi2/bo2 far brow (default = near) · pull brows toward the nose · li/lo upper-lid opening at the inner / outer third (1 = relaxed)
   sq lower-lid squint 0..1 · iris iris scale · pup pupil scale · gz gaze down · mc/mc2 mouth corner lift near/far (+ up, 1 = .0185 h) · mw mouth width · op baseline opening 0..1
   teeth 0..1 · dip middle of the mouth sags (+) · up upper-lip lift (snarl) · thin thin lips · cheek cheek raise · nl nasolabial depth · fur brow furrow · fh forehead lines · bag eye bags
   tilt head roll (rad, + = clockwise on screen when facing right) · ch chin raised (+) · sh shoulders raised (+) · rnd round 'O' mouth · wet glossy eyes · sweat · clench jaw muscle */
const CPT_X0={bi:0,bo:0,bi2:null,bo2:null,pull:0,li:1,lo:1,sq:0,iris:1,pup:1,gz:0,mc:0,mc2:null,mw:1,op:0,teeth:0,dip:0,up:0,thin:0,cheek:0,nl:.12,fur:0,fh:0,bag:0,tilt:0,ch:0,sh:0,rnd:0,wet:0,sweat:0,clench:0};
const CPT_XT={
  neutral:   {bo:-.2,li:.96,lo:.96,mc:-.05},
  talk:      {bi:.25,bo:.1,op:.08,mc:.05},
  angry:     {bi:-1.5,bo:.7,pull:.014,li:.38,lo:.8,sq:.4,mc:-.9,mw:1.02,op:.13,teeth:1,up:.7,nl:1,fur:1,fh:.15,tilt:-.03,ch:-.5,sh:.3,cheek:.15,clench:.7},
  smirk:     {bi:.1,bo:.2,bi2:1.1,bo2:1.4,li:.7,lo:.78,sq:.3,mc:1.3,mc2:-.2,mw:.96,dip:-.3,nl:.55,cheek:.4,tilt:.07,ch:.6,iris:.95},
  sad:       {bi:1.6,bo:-.8,li:.95,lo:.5,mc:-1.2,mw:.84,thin:.2,nl:.55,fur:.5,fh:.45,tilt:.085,ch:-.7,sh:-.7,gz:.45,wet:1,dip:.3},
  shock:     {bi:1.7,bo:2.1,li:1.6,lo:1.6,iris:.76,pup:.8,mc:0,mw:.52,op:1,teeth:.3,rnd:1,fh:1,tilt:-.02,ch:.5,sh:.9,nl:.05,gm:1.2},
  smile:     {bi:.4,bo:.6,li:.9,lo:.8,sq:.55,mc:1.35,mw:1.16,op:.2,teeth:1,dip:.8,cheek:.9,nl:.75,tilt:.03,fh:.1},
  determined:{bi:-1.3,bo:.1,pull:.01,li:.7,lo:.9,sq:.3,mc:-.4,mw:1.06,thin:.5,nl:.55,fur:.8,ch:.55,sh:.3,clench:1,tilt:-.015},
  laugh:     {bi:.55,bo:.8,li:.3,lo:.3,sq:1,mc:1.7,mw:1.3,op:.92,teeth:1,dip:1,cheek:1,nl:1,tilt:-.06,ch:.8,fh:.3,sh:.3,gm:1.1},
  scared:    {bi:1.8,bo:.3,pull:.01,li:1.5,lo:1.4,iris:.86,pup:1.5,mc:-.55,mw:1.0,op:.36,teeth:1,thin:.3,nl:.35,fur:.85,fh:.9,ch:-.25,sh:.9,sweat:1,tilt:.02},
  cold:      {bi:-.5,bo:.3,pull:.004,li:.4,lo:.4,sq:.05,iris:.95,mc:.0,mw:.78,thin:1,nl:.25,tilt:-.05,ch:1,gz:.15},
  weary:     {bi:1,bo:-.5,li:.5,lo:.34,mc:-.55,mw:.9,nl:.5,bag:1.3,tilt:.06,ch:-.6,sh:-.9,gz:.35,fh:.2}
};
const cptXc={},cptXa={};
const cptRig=n=>cptXc[n]||(cptXc[n]=Object.assign({},CPT_X0,CPT_XT[n]||CPT_XT.neutral));
/* small portraits (avatar chips, 100 px) exaggerate the expression: deviations from the relaxed face are scaled up so the mood survives the resolution */
function cptRigLod(n,lod){
  const X=cptRig(n);if(lod<.05)return X;const k=1+.75*lod,key=n+'|'+lod.toFixed(2);let o=cptXa[key];if(o)return o;
  o=Object.assign({},X);for(const q of['bi','bo','bi2','bo2','pull','mc','mc2','sq','bag','fur','cheek','nl','dip','wet','up','clench','tilt','ch','sh'])if(o[q]!=null)o[q]=X[q]*k;
  o.li=Math.max(.18,Math.min(1.8,1+(X.li-1)*k));o.lo=Math.max(.18,Math.min(1.8,1+(X.lo-1)*k));o.mw=1+(X.mw-1)*k;o.op=Math.min(1,X.op*(1+.4*lod));
  return cptXa[key]=o;
}

/* ------------------------------------ colour mapping per mode ------------------------------------ */
const cptPC={silhouette:new Map(),shadow:new Map(),hologram:new Map()};
function cptPmap(mode){
  const M=cptPC[mode];if(!M)return null;
  return c=>{let r=M.get(c);if(r)return r;const v=cnCol(c),a=v[3];
    if(mode==='silhouette')r=a>=.995?'#04060b':cnRGB(4,6,11,a);
    else if(mode==='shadow')r=cnRGB(v[0]*.13+3,v[1]*.13+4,v[2]*.14+9,a);
    else{const l=Math.pow(cnLum(v),.72);r=cnRGB(6+l*150,40+l*208,58+l*197,a);}
    if(M.size>800)M.clear();M.set(c,r);return r;};
}
const cptF=(R,c)=>R.P?R.P(c):c;
const cptSt=(R,st)=>R.P?st.map(s=>[s[0],R.P(s[1])]):st;
const cptLG=(R,x0,y0,x1,y1,st)=>cnLG(R.g,x0,y0,x1,y1,cptSt(R,st));
const cptRG=(R,x,y,r0,r1,st)=>cnRG(R.g,x,y,r0,r1,cptSt(R,st));
const cptRn=(D,i,j)=>cnHash(D.seed,i,j);
const cptQ=(t,a,b,c)=>{const u=1-t;return u*u*a+2*u*t*b+t*t*c;};
const cptDot=(g,x,y,r)=>{if(r>0){g.beginPath();g.arc(x,y,r,0,TAU);}else g.beginPath();};
const cptEll=(g,x,y,rx,ry,rot)=>{g.beginPath();if(rx>0&&ry>0)g.ellipse(x,y,rx,ry,rot||0,0,TAU);};

/* ------------------------------------ resolve a character (cached, pure) ------------------------------------ */
function cptResolve(id){
  const ST=typeof STORY!=='undefined'?STORY:null,ch=(ST&&ST.characters&&ST.characters[id])||{},L0=ch.look||{};
  const key=id+'|'+(ch.side||'')+'|'+(ch.faction||'')+'|'+(ch.role||'')+'|'+JSON.stringify(L0);
  let D=cptCache.get(key);if(D)return D;
  const hr=L0.hair,hair=typeof hr==='string'?{style:hr}:(hr||{}),ar=L0.armor,arm=typeof ar==='string'?{style:ar}:(ar||{});
  const hairStyle=CPT_HAIR.includes(hair.style)?hair.style:'short',armStyle=CPT_ARM.includes(arm.style)?arm.style:'plate';
  const skin=L0.skin||'#c58c6a',age=L0.age==='old'||L0.age==='young'?L0.age:'adult',bd=CPT_BLD[L0.build]||CPT_BLD.lean,old=age==='old'?1:0,young=age==='young'?1:0;
  const seed=cnHashStr(id),r=i=>cnHash(seed,i,101);
  const evil=(ch.side==='evil'||ch.role==='villain')?1:(ch.role==='lieutenant'||ch.role==='rival')?.6:ch.side==='good'?-.45:0;
  const lum=cnLum(skin);
  let hc=hair.color||'#2a2a30';if(old)hc=cnMix(hc,'#d8dae2',.66);
  const hcDark=cnLum(hc)<.2;
  const ac=arm.col||'#3d8bff',tr=arm.trim||'#a6ceff',ec=L0.eyes||'#66ccff';
  const marks=Array.isArray(L0.mark)?L0.mark.filter(Boolean):(L0.mark?[L0.mark]:[]);
  const fac=FACTIONS[ch.faction]?ch.faction:null;
  const bw=1+evil*.04,mass=bd.jw-1;
  D={id,kid:id+'#'+cnHashStr(key).toString(36),seed,hairStyle,armStyle,age,old,young,bd,evil,marks,
    hood:hairStyle==='hood'||armStyle==='hood',crown:armStyle==='crown',faction:fac,facCol:cnFac(fac||ch.faction),emblem:L0.emblem||'faction',
    skin,skHi:cnMix(skin,'#fff2e2',.3),skLt:cnMix(skin,'#ffffff',.5),skLo:cnMix(skin,lum>.4?'#7a2e28':'#2a0c10',.34),skDp:cnMix(skin,'#1c0608',.66),
    lip:lum>.45?cnMix(skin,'#b8404e',.46):lum>.25?cnMix(skin,'#8a2e3e',.42):cnMix(skin,'#4e1a28',.38),blush:cnMix(skin,'#e0606a',.55),
    hc,hcHi:hcDark?cnMix(hc,'#8296c8',.5):cnShade(hc,.34),hcLo:cnShade(hc,-.5),hcMd:cnShade(hc,-.22),
    browC:cnLum(hc)>.5?cnMix(hc,'#4a3a30',old?.25:.55):cnShade(hc,-.15),
    ec,ecLo:cnShade(ec,-.55),ecHi:cnShade(ec,.4),
    ac,tr,acLo:cnShade(ac,-.5),acMd:cnShade(ac,-.25),acHi:cnShade(ac,.3),acHi2:cnShade(ac,.55),trLo:cnShade(tr,-.45),trHi:cnShade(tr,.4),
    gold:cnMix(tr,'#f2c64e',.62),
    /* face DNA */
    wN:.162*bd.hs*(.91+.18*r(1))*(1+.06*young),wF:.184*bd.hs*(.91+.18*r(1))*(1+.01*r(2))*(1+.06*young),jN:.128*bd.jw*(.82+.36*r(3))+evil*.006+.012*young,jF:.136*bd.jw*(.82+.36*r(3))+evil*.006+.012*young,
    cw:.056+.03*r(4)+mass*.05+evil*.006+.02*young,sq:cnC01(.28+evil*.45+mass*1.5+.5*(r(5)-.5)+young*.1),
    cheek:cnC01(.35+.5*r(6)+old*.25+evil*.18),hollow:cnC01(old*.55+evil*.25+(bd===CPT_BLD.slight?.15:0)+.2*r(7)-young*.2),
    bt:(.0075+.0042*r(8)+evil*.0016+old*.003)*(1+.15*mass),browLen:.95+.2*r(9),
    es:(.9+.22*r(10))*(young?1.17:old?.93:1)*(1-evil*.04),et:(r(11)-.35)*.012+evil*.005-old*.004,
    noseW:.03+.012*r(12)+.003*mass,noseL:.088+.014*r(13),noseUp:(r(14)-.5)*.012,
    lipF:cnC01(.62+.45*r(15)-old*.3+young*.12),mw:.058+.014*r(16)+.004*mass,mouthY:.151+.006*(r(17)-.5),lipV:.92+.16*r(18),
    ear:(.038+.03*r(19))*bd.ear,lash:cnC01(.4+.5*r(20)),
    fh:.014*(r(21)-.5)+old*.012,gap:.5+r(22),
    hv:Number.isInteger(hair.variant)&&hair.variant>=0?hair.variant%12:Math.floor(r(23)*12),sv:Number.isInteger(hair.variant)&&hair.variant>=0?hair.variant%8:Math.floor(r(23)*12)%4+4*Math.floor(r(36)*2),dch:(r(24)-.5)*.034-.022*young,swk:.93+.14*r(26),nwk:.9+.2*r(27),hy:CPT_HY+(r(28)-.5)*.036,hs:CPT_HS*(.94+.12*r(29))*(1+.05*young),hxk:.93+.14*r(34)+.03*young,hyk:.94+.12*r(35)-.05*young,tb:(r(30)-.5)*.09,dx:(r(31)-.5)*.02,bp:3.7+1.5*r(32),bph:r(33)*TAU};
  /* tight layer rectangles (blits cost per pixel, so a layer only covers what this look can paint) */
  const mane=hairStyle==='mane',halo=marks.includes('halo'),back=mane||halo||D.hood||hairStyle==='long'||hairStyle==='braid'||hairStyle==='bun';
  D.hw=Math.max(bd.sw*(armStyle==='crown'?1.12:1)*1.24,mane?.62:halo?.44:D.hood?.44:hairStyle==='long'?.46:hairStyle==='braid'?.4:.3,.42);
  D.by0=(mane||halo||hairStyle==='bun')?-.88:(D.hood||hairStyle==='crest'||armStyle==='crown'||hairStyle==='braid'||hairStyle==='long')?-.67:-.55;
  D.bodyY0=back?D.by0:-.08;
  D.hrect=D.hood?[-.36,-.45,.72,.8]:mane?[-.4,-.36,.8,.66]:hairStyle==='long'?[-.32,-.32,.64,.66]:hairStyle==='crest'?[-.3,-.48,.6,.58]:[-.27,-.4,.54,.54];
  if(cptCache.size>96)cptCache.clear();cptCache.set(key,D);return D;
}
const cptCache=new Map();

/* ------------------------------------ the render state ------------------------------------ */
const CPT_STEPS=[56,72,96,128,160,200,256,320,400,512,640,800,960];
function cptStep(v){for(let i=0;i<CPT_STEPS.length;i++)if(CPT_STEPS[i]>=v*.97)return CPT_STEPS[i];return CPT_STEPS[CPT_STEPS.length-1];}
function cptCalcA(D,jd){const dc=D.dch||0;return{yt:-.25,wN:D.wN,wF:D.wF,jN:D.jN,jF:D.jF,jy:.112+jd*.5+dc*.5,cy:.232+jd+dc,cw:D.cw+jd*.06,sq:D.sq};}
/* R = everything a drawing function needs. Lighting, jaw and resolution are QUANTISED here so that a cached layer is identical to a fresh one. */
function cptMakeR(g,D,st,o,cx,cy,h,dir,mode,resMul){
  let m=null;try{m=g.getTransform();}catch(e){}
  const sc=m?(Math.hypot(m.a,m.b)||1):1,res=cptStep(h*sc*(resMul||1)),lod=cnC01((250-res)/190);
  const W=o.W||(g.canvas&&g.canvas.width)||1280,H=o.H||(g.canvas&&g.canvas.height)||720;
  const dx=m?m.a*cx+m.c*cy+m.e:cx,dy=m?m.b*cx+m.d*cy+m.f:cy,key=o.key;
  let lx,ly,rimCol,rimA;
  if(key&&key.x!=null){let vx=key.x*W-dx,vy=key.y*H-dy;const d=Math.hypot(vx,vy)||1;vx/=d;vy/=d;lx=vx*dir;ly=vy*.85;rimCol=o.rim||key.col||'#bcd4ff';rimA=.95*cnC01((key.a==null?.6:key.a)*1.25+.2);}
  else{lx=-.55*dir;ly=-.62;rimCol=o.rim||'#cfe0ff';rimA=o.rim?.85:.26;}
  const q10=v=>Math.sign(v)*Math.round(Math.abs(v)*10)/10;lx=q10(lx);ly=q10(ly);rimA=Math.round(rimA*20)/20;   // symmetric rounding: a mirrored light gives a mirrored picture
  const X=cptRigLod(st.expr,lod),tk=cnC01(st.talk||0),bl=cnC01(st.blink||0),open=cnC01(X.op<.5?X.op+tk*(1-X.op*.6):X.op*(1-.5*tk)+.1*tk),   // speech opens a closed mouth; a wide-open one (shock, laugh) chatters between wide and about half
    openQ=Math.round(open*8)/8,gmax=.062*D.lipV*(X.gm||1);
  const jd=(mode==='silhouette'||mode==='shadow')?0:openQ*gmax*.8;
  const R={g,D,X,tilt:X.tilt+D.tb,expr:cptXc[st.expr]?st.expr:'neutral',dir,res,lod,lx,ly,ls:lx>=0?1:-1,lm:cnC01(Math.abs(lx)*1.15+.22),rimCol,rimA,lkey:lx+','+ly+','+rimCol+','+rimA,key,lights:(Array.isArray(o.lights)?o.lights:[]).filter(l=>l&&l.a>.05),mode,
    sil:mode==='silhouette',shd:mode==='shadow',holo:mode==='hologram',P:cptPmap(mode),px:1/res,t:st.t||0,tk,blink:bl,open,openQ,gap:open*gmax,gapQ:openQ*gmax,gmax,jd,cx,cy,h,sc,o,W,H,dx,dy};
  const sw=D.bd.sw*D.swk*(D.armStyle==='crown'?1.12:D.armStyle==='hood'?1.08:D.armStyle==='suit'?.94:1)*(1-.1*D.young);   // children: narrower shoulders under a bigger head
  let yb=Math.max(.52,((o.bottom==null?cy+h*.5:o.bottom)-cy)/h);
  if(m&&m.d>1e-4){const yf=((H-m.f)/m.d-cy)/h+.16;if(yf<yb)yb=Math.max(.52,Math.ceil(yf/.04)*.04);}
  R.sw=sw;R.nw=D.bd.nw*D.nwk;R.yN=.2;R.yS=.256;R.B=yb;R.A=cptCalcA(D,jd);
  R.eye=[-1,1].map(s=>{const near=s>0,ew=.05*D.es*(near?.9:1.05)*(1+.22*lod);return{s,near,ew,eh:.0285*D.es*(1+.4*lod),ex:CPT_FS+s*.079*(near?.93:1.05),ey:-.012};});
  return R;
}

/* ------------------------------------ small drawing helpers ------------------------------------ */
/* idle breathing, a closed form of the time: the chest rises and widens a hair, the head follows with less amplitude and a slow sway */
function cptBreath(R){const D=R.D,a=TAU*(R.t||0)/D.bp+D.bph,k=R.o&&R.o.S&&R.o.S.rm?.4:1;return{b:Math.sin(a)*k,sw:Math.sin(a*.37+D.bph*2.1)*k};}
const cptBrXf=(g,R,b)=>{g.translate(0,R.B);g.scale(1+.0045*b,1+.006*b);g.translate(0,-R.B);};
function cptHeadXf(R,fn){const g=R.g,D=R.D,br=R.br;g.save();const sy=D.hs*D.hyk;g.translate(D.dx,D.hy+.2*sy-(br?.0035*br.b:0));g.rotate(R.tilt*(R.sil?.6:1)+(br?.006*br.sw:0));g.translate(0,-.2*sy);g.scale(D.hs*D.hxk,sy);fn();g.restore();}
function cptHeadPath(R){
  const g=R.g,A=R.A;g.beginPath();g.moveTo(0,A.yt);
  g.bezierCurveTo(A.wN*.58,A.yt,A.wN,-.15,A.wN,-.035);
  g.bezierCurveTo(A.wN,.03,A.jN+.012,A.jy-.045,A.jN,A.jy);
  g.bezierCurveTo(A.jN-.006,A.jy+.04+(1-A.sq)*.03,A.cw+.03*(1-A.sq),A.cy-.004,A.cw,A.cy);
  g.bezierCurveTo(A.cw*.5,A.cy+.009,-A.cw*.5,A.cy+.009,-A.cw,A.cy);
  g.bezierCurveTo(-A.cw-.03*(1-A.sq),A.cy-.004,-A.jF+.006,A.jy+.04+(1-A.sq)*.03,-A.jF,A.jy);
  g.bezierCurveTo(-A.jF-.012,A.jy-.045,-A.wF,.03,-A.wF,-.035);
  g.bezierCurveTo(-A.wF,-.15,-A.wF*.58,A.yt,0,A.yt);g.closePath();
}
/* inner rim light along the edge that faces (dx,dy); path is re-run for clip and stroke */
function cptRim(R,pathFn,x0,y0,x1,y1,wd,a,col,dx,dy,sf){
  if(R.sil||!(a>0))return;const g=R.g;if(dx==null){dx=R.lx;dy=R.ly;}const l=Math.hypot(dx,dy)||1;dx/=l;dy/=l;
  const mx=(x0+x1)/2,my=(y0+y1)/2,L=Math.abs(dx)*(x1-x0)/2+Math.abs(dy)*(y1-y0)/2;
  g.save();pathFn();g.clip();g.globalCompositeOperation='lighter';
  g.strokeStyle=cnLG(g,mx+dx*L,my+dy*L,mx-dx*L*.15,my-dy*L*.15,[[0,cptF(R,cnA(col,a))],[1,cptF(R,cnA(col,0))]]);
  g.lineWidth=wd*2;g.lineJoin='round';(sf||pathFn)();g.stroke();g.restore();
}
function cptRimLights(R,pathFn,x0,y0,x1,y1,wd,sf){cptRim(R,pathFn,x0,y0,x1,y1,wd,R.rimA*(R.shd?.55:1),R.rimCol,null,null,sf);}
function cptOutline(R,pathFn,col,a,wd){
  if(R.sil)return;const g=R.g;pathFn();g.lineJoin='round';g.strokeStyle=cptF(R,cnA(col,a));g.lineWidth=Math.max(wd,R.px*(.9+R.lod*.9));g.stroke();
}
function cptStrokes(R,list,col,a,w){
  const g=R.g;g.strokeStyle=cptF(R,cnA(col,a));g.lineWidth=w;g.beginPath();for(const s of list){g.moveTo(s[0],s[1]);g.quadraticCurveTo(s[2],s[3],s[4],s[5]);}g.stroke();
}
/* shadow cast by a shape onto the skin: the shape, shifted down, clipped to the head */
function cptCast(R,pathFn,dy,a,dx){
  if(R.sil)return;const g=R.g;g.save();cptHeadPath(R);g.clip();g.translate(dx||0,dy);pathFn();g.fillStyle=cptF(R,cnA(R.D.skDp,a));g.fill();g.restore();
}

/* ====================================================================================================
   TORSO — one painter per armour style. phase 0 = body (behind the neck), phase 1 = front pieces (in front of the neck) + emblem.
   ==================================================================================================== */
function cptShouldersPath(R,sw,yN,yS,B){
  const g=R.g,nw=R.nw;g.beginPath();g.moveTo(-sw*1.03,B);g.lineTo(-sw*1.01,yS+.08);
  g.bezierCurveTo(-sw*1.01,yS+.012,-sw*.93,yS-.014,-sw*.74,yS-.024);g.bezierCurveTo(-sw*.5,yS-.038,-nw*1.9,yN+.014,-nw*1.12,yN-.006);
  g.lineTo(nw*1.12,yN-.006);g.bezierCurveTo(nw*1.9,yN+.014,sw*.5,yS-.038,sw*.74,yS-.024);g.bezierCurveTo(sw*.93,yS-.014,sw*1.01,yS+.012,sw*1.01,yS+.08);g.lineTo(sw*1.03,B);g.closePath();
}
/* the two shoulder edges only (no segment across the neck): outline and rim light are stroked along this, so no line ever crosses the neck or the collar */
function cptShouldersEdge(R,sw,yN,yS,B){
  const g=R.g,nw=R.nw;g.beginPath();g.moveTo(-sw*1.03,B);g.lineTo(-sw*1.01,yS+.08);
  g.bezierCurveTo(-sw*1.01,yS+.012,-sw*.93,yS-.014,-sw*.74,yS-.024);g.bezierCurveTo(-sw*.5,yS-.038,-nw*1.9,yN+.014,-nw*1.12,yN-.006);
  g.moveTo(nw*1.12,yN-.006);g.bezierCurveTo(nw*1.9,yN+.014,sw*.5,yS-.038,sw*.74,yS-.024);g.bezierCurveTo(sw*.93,yS-.014,sw*1.01,yS+.012,sw*1.01,yS+.08);g.lineTo(sw*1.03,B);
}
function cptLitX(R,w,st){return cptLG(R,R.ls*w,0,-R.ls*w,0,st);}         // gradient across x: lit side first
function cptTorso(R,phase){
  const D=R.D,g=R.g;
  if(phase===0){
    cptShouldersPath(R,R.sw,R.yN,R.yS,R.B);g.fillStyle=cptLG(R,0,R.yN,0,R.B,[[0,D.acMd],[1,D.acLo]]);g.fill();
    ({plate:cptPlate0,coat:cptCoat0,robe:cptRobe0,suit:cptSuit0,rags:cptRags0,crown:cptCrown0,hood:cptHoodBody0}[D.armStyle]||cptPlate0)(R);
    /* lighting over the whole body: shadow side darker, lit side a touch lighter, darker toward the bottom */
    g.save();cptShouldersPath(R,R.sw*1.03,R.yN,R.yS,R.B);g.clip();
    g.fillStyle=cptLitX(R,R.sw*1.1,[[0,'rgba(255,255,255,.07)'],[.5,'rgba(0,0,0,0)'],[1,'rgba(2,4,12,.42)']]);g.fillRect(-.8,0,1.6,1);
    g.fillStyle=cptLG(R,0,R.yS,0,R.B,[[0,'rgba(0,0,0,0)'],[1,'rgba(2,4,12,.35)']]);g.fillRect(-.8,0,1.6,1);g.restore();
  }else{
    ({plate:cptPlate1,coat:cptCoat1,robe:cptRobe1,suit:cptSuit1,rags:cptRags1,crown:cptCrown1,hood:cptHoodBody1}[D.armStyle]||cptPlate1)(R);
    cptEmblem(R);
    const sp=()=>cptShouldersPath(R,R.sw*1.03,R.yN,R.yS,R.B),se=()=>cptShouldersEdge(R,R.sw*1.03,R.yN,R.yS,R.B);
    cptOutline(R,se,D.acLo,.55,.0035);cptRimLights(R,sp,-R.sw,R.yS-.04,R.sw,R.B,.011,se);
  }
}
/* chest plate, pauldrons, gorget */
function cptPauldron(R,s,w,hh,x0,y0){
  const g=R.g,D=R.D;g.save();g.translate(x0,y0);g.rotate(s*.26);
  for(let i=2;i>=0;i--){const k=1-i*.17,yb=i*hh*.5;
    g.beginPath();g.moveTo(-w*k,yb+hh*.1);g.bezierCurveTo(-w*k,yb-hh*1.1*k,w*k,yb-hh*1.1*k,w*k,yb+hh*.1);g.bezierCurveTo(w*k*.6,yb+hh*.5,-w*k*.6,yb+hh*.5,-w*k,yb+hh*.1);g.closePath();
    g.fillStyle=cptLG(R,0,yb-hh*.9*k,0,yb+hh*.5,[[0,D.acHi],[.4,D.ac],[1,D.acLo]]);g.fill();
    g.strokeStyle=cptF(R,D.tr);g.lineWidth=Math.max(.0045,R.px*1.1);g.stroke();
    g.beginPath();g.moveTo(-w*k*.7,yb-hh*.35*k);g.quadraticCurveTo(0,yb-hh*.95*k,w*k*.5,yb-hh*.55*k);g.strokeStyle=cptF(R,cnA('#fff',.38));g.lineWidth=Math.max(.004,R.px);g.stroke();}
  g.fillStyle=cptF(R,D.trHi);for(const x of[-.55,0,.55]){cptDot(g,x*w,-hh*.38,Math.max(.006,w*.06));g.fill();}
  g.restore();
}
function cptPlate0(R){
  const g=R.g,D=R.D,sw=R.sw,yN=R.yN,B=R.B;
  g.beginPath();g.moveTo(-sw*.68,yN+.034);g.bezierCurveTo(-sw*.46,yN+.0,-sw*.2,yN+.04,0,yN+.066);g.bezierCurveTo(sw*.2,yN+.04,sw*.46,yN+.0,sw*.68,yN+.034);g.lineTo(sw*.84,B);g.lineTo(-sw*.84,B);g.closePath();
  g.fillStyle=cptLitX(R,sw*.85,[[0,D.acHi],[.4,D.ac],[1,D.acLo]]);g.fill();g.strokeStyle=cptF(R,D.tr);g.lineWidth=Math.max(.005,R.px*1.2);g.stroke();
  g.save();g.clip();g.fillStyle=cptLG(R,0,yN,0,B,[[0,'rgba(255,255,255,.14)'],[.5,'rgba(0,0,0,0)'],[1,'rgba(0,0,0,.3)']]);g.fillRect(-.8,0,1.6,1);
  g.strokeStyle=cptF(R,cnA('#000',.45));g.lineWidth=.007;g.beginPath();g.moveTo(0,yN+.07);g.lineTo(0,B);g.stroke();
  g.strokeStyle=cptF(R,cnA('#fff',.35));g.lineWidth=.004;g.beginPath();g.moveTo(-R.ls*.012,yN+.07);g.lineTo(-R.ls*.012,B);g.stroke();
  g.strokeStyle=cptF(R,cnA(D.tr,.8));g.lineWidth=Math.max(.0045,R.px);for(const s of[-1,1]){g.beginPath();g.moveTo(s*sw*.08,yN+.1);g.quadraticCurveTo(s*sw*.3,yN+.12,s*sw*.5,yN+.27);g.stroke();g.beginPath();g.moveTo(s*sw*.1,yN+.2);g.quadraticCurveTo(s*sw*.32,yN+.22,s*sw*.6,B);g.stroke();}
  g.restore();
  const w=sw*.46,hh=.1+sw*.06;for(const s of[-1,1])cptPauldron(R,s,w,hh,s*sw*.86,R.yS+.012);
}
function cptPlate1(R){
  const g=R.g,D=R.D,nw=R.nw,yN=R.yN;
  g.beginPath();g.moveTo(-nw*1.62,yN-.03);g.bezierCurveTo(-nw*1.7,yN+.05,-nw*.7,yN+.092,0,yN+.094);g.bezierCurveTo(nw*.7,yN+.092,nw*1.7,yN+.05,nw*1.62,yN-.03);g.lineTo(nw*1.3,yN-.046);g.bezierCurveTo(nw*1.2,yN+.02,nw*.5,yN+.045,0,yN+.045);g.bezierCurveTo(-nw*.5,yN+.045,-nw*1.2,yN+.02,-nw*1.3,yN-.046);g.closePath();
  g.fillStyle=cptLitX(R,nw*1.7,[[0,D.acHi2],[.4,D.acHi],[1,D.acLo]]);g.fill();g.strokeStyle=cptF(R,D.tr);g.lineWidth=Math.max(.0045,R.px*1.1);g.stroke();
  g.strokeStyle=cptF(R,cnA('#fff',.4));g.lineWidth=Math.max(.003,R.px*.8);g.beginPath();g.moveTo(-nw*1.3,yN+.004);g.bezierCurveTo(-nw*.8,yN+.06,nw*.8,yN+.06,nw*1.3,yN+.004);g.stroke();
}
/* coat: lapels, stand collar, buttons, cross strap, shirt */
function cptCoat0(R){
  const g=R.g,D=R.D,sw=R.sw,nw=R.nw,yN=R.yN,B=R.B,sh=cnMix('#e6e8ee',D.tr,.2);
  g.beginPath();g.moveTo(-nw*1.25,yN-.005);g.lineTo(nw*1.25,yN-.005);g.lineTo(.0,yN+.27);g.closePath();g.fillStyle=cptLG(R,0,yN,0,yN+.27,[[0,sh],[1,cnShade(sh,-.4)]]);g.fill();
  for(const s of[-1,1]){        // coat front panels + lapels
    g.beginPath();g.moveTo(s*nw*1.2,yN-.01);g.lineTo(s*sw*.62,yN+.045);g.lineTo(s*sw*.9,B);g.lineTo(s*.012,B);g.lineTo(s*.012,yN+.27);g.closePath();
    g.fillStyle=cptLitX(R,sw,[[0,D.acHi],[.5,D.ac],[1,D.acMd]]);g.fill();
    g.beginPath();g.moveTo(s*nw*1.15,yN-.008);g.lineTo(s*sw*.52,yN+.05);g.lineTo(s*sw*.3,yN+.19);g.lineTo(s*.014,yN+.27);g.lineTo(s*nw*.5,yN+.07);g.closePath();
    g.fillStyle=cptLG(R,s*sw*.5,yN,s*.02,yN+.27,[[0,D.acHi],[1,D.ac]]);g.fill();g.strokeStyle=cptF(R,D.tr);g.lineWidth=Math.max(.0045,R.px*1.1);g.stroke();}
  g.strokeStyle=cptF(R,D.acLo);g.lineWidth=.005;g.beginPath();g.moveTo(0,yN+.27);g.lineTo(0,B);g.stroke();
  g.fillStyle=cptF(R,D.tr);for(const s of[-1,1])for(let i=0;i<3;i++){cptDot(g,s*.055,yN+.33+i*.07,.0125);g.fill();}
  g.fillStyle=cptF(R,cnA('#fff',.6));for(const s of[-1,1])for(let i=0;i<3;i++){cptDot(g,s*.055-.003,yN+.327+i*.07,.004);g.fill();}
  g.save();cptShouldersPath(R,sw*1.03,yN,R.yS,B);g.clip();           // leather cross strap with a buckle
  const sx0=-sw*.84,sy0=yN+.1,sx1=sw*.95,sy1=B*.92;
  g.lineCap='butt';g.strokeStyle=cptLG(R,0,sy0,0,sy1,[[0,'#3a2e28'],[1,'#1c1512']]);g.lineWidth=.034;g.beginPath();g.moveTo(sx0,sy0);g.lineTo(sx1,sy1);g.stroke();
  g.strokeStyle=cptF(R,cnA('#fff',.2));g.lineWidth=.004;g.beginPath();g.moveTo(sx0,sy0-.014);g.lineTo(sx1,sy1-.014);g.stroke();g.strokeStyle=cptF(R,cnA(D.tr,.55));g.lineWidth=.0028;g.setLineDash([.012,.01]);g.beginPath();g.moveTo(sx0,sy0+.011);g.lineTo(sx1,sy1+.011);g.stroke();g.setLineDash([]);
  const bt=.45,bx=sx0+(sx1-sx0)*bt,by=sy0+(sy1-sy0)*bt;g.fillStyle=cptLG(R,bx-.02,by-.02,bx+.02,by+.02,[[0,D.trHi],[1,D.trLo]]);g.fillRect(bx-.022,by-.026,.044,.052);g.fillStyle=cptF(R,'#1c1512');g.fillRect(bx-.013,by-.017,.026,.034);
  g.restore();
  g.save();for(const s of[-1,1]){g.strokeStyle=cptF(R,cnA(D.tr,.65));g.lineWidth=Math.max(.004,R.px);g.beginPath();g.moveTo(s*sw*.74,R.yS-.02);g.lineTo(s*sw*.86,R.yS+.1);g.stroke();}g.restore();
}
function cptCoat1(R){
  const g=R.g,D=R.D,nw=R.nw,yN=R.yN;
  for(const s of[-1,1]){g.beginPath();g.moveTo(s*nw*.9,yN+.05);g.lineTo(s*nw*1.22,yN-.015);g.lineTo(s*nw*1.5,yN-.11);g.lineTo(s*nw*.95,yN-.1);g.lineTo(s*nw*.62,yN-.03);g.closePath();
    g.fillStyle=cptLitX(R,nw*2,[[0,D.acHi],[1,D.acMd]]);g.fill();g.strokeStyle=cptF(R,D.tr);g.lineWidth=Math.max(.004,R.px);g.stroke();
    g.strokeStyle=cptF(R,cnA('#fff',.3));g.lineWidth=.003;g.beginPath();g.moveTo(s*nw*1.5,yN-.108);g.lineTo(s*nw*.96,yN-.098);g.stroke();}
}
/* robe: soft shoulders, drape folds, V opening with inner garment and collar bands */
function cptRobe0(R){
  const g=R.g,D=R.D,sw=R.sw*1.04,nw=R.nw,yN=R.yN,B=R.B,inner=cnMix(D.tr,D.ac,.35);
  g.beginPath();g.moveTo(-sw*1.1,B);g.lineTo(-sw*1.07,R.yS+.1);g.bezierCurveTo(-sw*1.05,R.yS-.015,-sw*.8,R.yS-.045,-sw*.55,yN+.012);g.lineTo(sw*.55,yN+.012);g.bezierCurveTo(sw*.8,R.yS-.045,sw*1.05,R.yS-.015,sw*1.07,R.yS+.1);g.lineTo(sw*1.1,B);g.closePath();
  g.fillStyle=cptLitX(R,sw*1.1,[[0,D.acHi],[.45,D.ac],[1,D.acLo]]);g.fill();
  g.save();g.clip();   // vertical drape folds
  for(let i=0;i<7;i++){const x=(-.9+i*.3)*sw+(cptRn(D,i,30)-.5)*.04,w=.05+.04*cptRn(D,i,31),dk=i%2;
    g.beginPath();g.moveTo(x,yN+.05);g.bezierCurveTo(x+.03,yN+.18,x-.03,B*.6,x+.01*(i-3),B);g.lineTo(x+w,B);g.bezierCurveTo(x+w-.03,B*.6,x+w+.03,yN+.18,x+w*.4,yN+.05);g.closePath();
    g.fillStyle=dk?cptF(R,cnA(D.acLo,.28)):cptF(R,cnA(D.acHi,.16));g.fill();}
  g.restore();
  g.beginPath();g.moveTo(-nw*1.1,yN-.008);g.lineTo(nw*1.1,yN-.008);g.lineTo(.0,yN+.3);g.closePath();g.fillStyle=cptLG(R,0,yN,0,yN+.3,[[0,cnShade(inner,.15)],[1,cnShade(inner,-.45)]]);g.fill();
  g.strokeStyle=cptF(R,cnA(D.trLo,.8));g.lineWidth=.005;g.beginPath();g.moveTo(0,B);g.lineTo(0,yN+.3);g.stroke();
  g.beginPath();g.moveTo(-sw*1.0,B*.82);g.quadraticCurveTo(0,B*.74,sw*1.0,B*.82);g.lineTo(sw*1.0,B*.9);g.quadraticCurveTo(0,B*.82,-sw*1.0,B*.9);g.closePath();g.fillStyle=cptF(R,cnA(D.trLo,.9));g.fill();   // sash
}
function cptRobe1(R){
  const g=R.g,D=R.D,nw=R.nw,yN=R.yN,sw=R.sw;
  for(const s of[-1,1]){g.beginPath();g.moveTo(s*nw*1.05,yN-.012);g.lineTo(s*nw*1.9,yN-.005);g.lineTo(s*.034,yN+.31);g.lineTo(s*.004,yN+.3);g.closePath();
    g.fillStyle=cptLG(R,s*nw*1.9,yN,s*.02,yN+.3,[[0,D.trHi],[1,D.tr]]);g.fill();g.strokeStyle=cptF(R,D.trLo);g.lineWidth=Math.max(.003,R.px*.8);g.stroke();}
  g.fillStyle=cptF(R,cnA('#fff',.18));g.beginPath();g.moveTo(-nw*1.1,yN-.01);g.lineTo(-nw*1.5,yN-.003);g.lineTo(-nw*1.9,yN+.1);g.lineTo(-nw*1.3,yN+.015);g.closePath();g.fill();
}
/* suit: seams, mock collar, shoulder panels, glowing piping */
function cptSuit0(R){
  const g=R.g,D=R.D,sw=R.sw,nw=R.nw,yN=R.yN,B=R.B;
  g.save();cptShouldersPath(R,sw*1.03,yN,R.yS,B);g.clip();
  g.fillStyle=cptLitX(R,sw*1.1,[[0,D.acHi],[.45,D.ac],[1,D.acLo]]);g.fillRect(-1,0,2,2);
  for(const s of[-1,1]){g.beginPath();g.moveTo(s*sw*.52,R.yS-.04);g.quadraticCurveTo(s*sw*1.05,R.yS-.02,s*sw*1.08,R.yS+.13);g.lineTo(s*sw*.84,R.yS+.14);g.quadraticCurveTo(s*sw*.7,R.yS+.04,s*sw*.5,R.yS+.0);g.closePath();
    g.fillStyle=cptLG(R,0,R.yS-.04,0,R.yS+.14,[[0,D.acHi],[1,D.acLo]]);g.fill();g.strokeStyle=cptF(R,D.acLo);g.lineWidth=.004;g.stroke();}
  g.strokeStyle=cptF(R,D.tr);g.lineWidth=Math.max(.005,R.px*1.2);for(const s of[-1,1]){g.beginPath();g.moveTo(s*nw*1.3,yN+.0);g.lineTo(s*sw*.3,yN+.17);g.lineTo(s*sw*.26,B);g.stroke();}
  g.strokeStyle=cptF(R,cnA(D.acLo,.9));g.lineWidth=.004;g.beginPath();g.moveTo(0,yN+.06);g.lineTo(0,B);g.stroke();
  g.fillStyle=cptF(R,cnA(D.tr,.85));g.beginPath();g.moveTo(-.07,yN+.2);g.lineTo(.07,yN+.2);g.lineTo(.06,yN+.27);g.lineTo(-.06,yN+.27);g.closePath();g.fill();
  g.restore();
  if(!R.sil){cnGlow(g,0,yN+.235,.08,D.tr,.35);}
}
function cptSuit1(R){
  const g=R.g,D=R.D,nw=R.nw,yN=R.yN;
  g.beginPath();g.moveTo(-nw*1.45,yN+.02);g.lineTo(-nw*1.3,yN-.085);g.quadraticCurveTo(0,yN-.06,nw*1.3,yN-.085);g.lineTo(nw*1.45,yN+.02);g.quadraticCurveTo(0,yN+.065,-nw*1.45,yN+.02);g.closePath();
  g.fillStyle=cptLitX(R,nw*1.6,[[0,D.acHi],[.5,D.ac],[1,D.acLo]]);g.fill();g.strokeStyle=cptF(R,D.tr);g.lineWidth=Math.max(.0045,R.px*1.1);g.stroke();
  g.strokeStyle=cptF(R,cnA(D.tr,.7));g.lineWidth=.003;g.beginPath();g.moveTo(-nw*1.4,yN-.03);g.quadraticCurveTo(0,yN+.02,nw*1.4,yN-.03);g.stroke();
}
/* rags: torn layered cloth, patches, straps, a frayed scarf */
function cptRagEdge(R,pts,y0,amp,i0){const D=R.D,g=R.g;for(let i=0;i<pts.length;i++){const p=pts[i],j=(cptRn(D,i0+i,40)-.5)*amp;if(i)g.lineTo(p[0]+j*.5,p[1]+j);}}
function cptRags0(R){
  const g=R.g,D=R.D,sw=R.sw,nw=R.nw,yN=R.yN,B=R.B;
  g.save();cptShouldersPath(R,sw*1.03,yN,R.yS,B);g.clip();
  g.fillStyle=cptLG(R,0,yN,0,B,[[0,cnShade(D.ac,-.2)],[1,cnShade(D.ac,-.55)]]);g.fillRect(-1,0,2,2);
  const tones=[D.ac,D.acMd,cnMix(D.ac,D.tr,.35),D.acLo];
  for(let k=0;k<4;k++){const y0=yN+.03+k*.085,x0=-sw*(1.05-k*.04),x1=sw*(1.05-k*.06);g.beginPath();g.moveTo(x0,y0+cptRn(D,k,41)*.03);
    for(let i=1;i<=8;i++){const x=x0+(x1-x0)*i/8;g.lineTo(x,y0+(cptRn(D,k*10+i,42)-.3)*.05-(i%2?.012:0));}
    g.lineTo(x1,B+.05);g.lineTo(x0,B+.05);g.closePath();g.fillStyle=cptLitX(R,sw,[[0,cnShade(tones[k],.12)],[1,cnShade(tones[k],-.3)]]);g.fill();
    g.strokeStyle=cptF(R,cnA('#000',.45));g.lineWidth=Math.max(.0035,R.px*.9);g.beginPath();g.moveTo(x0,y0);for(let i=1;i<=8;i++){const x=x0+(x1-x0)*i/8;g.lineTo(x,y0+(cptRn(D,k*10+i,42)-.3)*.05-(i%2?.012:0));}g.stroke();}
  g.fillStyle=cptF(R,cnA(D.tr,.75));const px=-sw*.3,py=yN+.22;g.fillRect(px,py,.1,.08);g.strokeStyle=cptF(R,cnA('#000',.6));g.setLineDash([.008,.008]);g.lineWidth=.003;g.strokeRect(px+.006,py+.006,.088,.068);g.setLineDash([]);   // patch + stitches
  g.strokeStyle=cptF(R,'#2a1c14');g.lineWidth=.026;g.beginPath();g.moveTo(-sw*.8,yN+.0);g.lineTo(sw*.7,B);g.stroke();g.strokeStyle=cptF(R,cnA(D.tr,.5));g.lineWidth=.004;g.beginPath();g.moveTo(-sw*.8+.01,yN);g.lineTo(sw*.7+.01,B);g.stroke();   // strap
  g.fillStyle=cptF(R,cnA('#000',.18));for(let i=0;i<9;i++){cptEll(g,(cptRn(D,i,43)-.5)*sw*1.8,yN+.05+cptRn(D,i,44)*(B-yN-.05),.02+.03*cptRn(D,i,45),.015+.02*cptRn(D,i,46),cptRn(D,i,47)*3);g.fill();}   // grime
  g.restore();
}
function cptRags1(R){
  const g=R.g,D=R.D,nw=R.nw,yN=R.yN,c=cnMix(D.tr,D.ac,.45);
  g.beginPath();g.moveTo(-nw*1.7,yN-.01);g.quadraticCurveTo(-nw*1.9,yN+.06,-nw*1.2,yN+.085);for(let i=0;i<=6;i++){const x=-nw*1.2+nw*2.4*i/6;g.lineTo(x,yN+.088+(i%2?.02:0)+cptRn(D,i,48)*.015);}g.quadraticCurveTo(nw*1.9,yN+.06,nw*1.7,yN-.01);g.lineTo(nw*1.3,yN-.04);g.quadraticCurveTo(0,yN+.03,-nw*1.3,yN-.04);g.closePath();
  g.fillStyle=cptLitX(R,nw*1.8,[[0,cnShade(c,.15)],[1,cnShade(c,-.4)]]);g.fill();g.strokeStyle=cptF(R,cnA('#000',.5));g.lineWidth=Math.max(.0035,R.px*.9);g.stroke();
  g.strokeStyle=cptF(R,cnA(cnShade(c,-.4),.9));g.lineWidth=.004;g.beginPath();for(let i=0;i<4;i++){const x=-nw*.9+i*nw*.6;g.moveTo(x,yN+.09);g.lineTo(x+(cptRn(D,i,49)-.5)*.02,yN+.14+cptRn(D,i,50)*.03);}g.stroke();
}
/* crown style: regal mantle with an ermine collar and a jewelled clasp */
function cptCrown0(R){
  const g=R.g,D=R.D,sw=R.sw,nw=R.nw,yN=R.yN,B=R.B;
  g.beginPath();g.moveTo(-sw*1.12,B);g.lineTo(-sw*1.1,R.yS+.06);g.bezierCurveTo(-sw*1.08,R.yS-.04,-sw*.85,R.yS-.07,-sw*.5,yN-.0);g.lineTo(sw*.5,yN-.0);g.bezierCurveTo(sw*.85,R.yS-.07,sw*1.08,R.yS-.04,sw*1.1,R.yS+.06);g.lineTo(sw*1.12,B);g.closePath();
  g.fillStyle=cptLitX(R,sw*1.1,[[0,D.acHi],[.5,D.ac],[1,D.acLo]]);g.fill();
  g.save();g.clip();g.strokeStyle=cptF(R,cnA(D.gold,.8));g.lineWidth=Math.max(.005,R.px*1.2);for(const s of[-1,1]){g.beginPath();g.moveTo(s*sw*.78,R.yS+.02);g.quadraticCurveTo(s*sw*.62,R.yS+.2,s*sw*.55,B);g.stroke();}
  g.strokeStyle=cptF(R,cnA(D.acLo,.35));g.lineWidth=.007;for(let i=0;i<5;i++){const x=(-.8+i*.4)*sw;g.beginPath();g.moveTo(x,yN+.1);g.quadraticCurveTo(x+.03,B*.6,x-.01,B);g.stroke();}g.restore();
  g.fillStyle=cptLG(R,0,yN+.07,0,yN+.28,[[0,cnShade(D.acLo,.1)],[1,cnShade(D.acLo,-.4)]]);g.beginPath();g.moveTo(-nw*1.7,yN+.0);g.lineTo(nw*1.7,yN);g.lineTo(.055,yN+.3);g.lineTo(-.055,yN+.3);g.closePath();g.fill();
}
function cptCrown1(R){
  const g=R.g,D=R.D,nw=R.nw,yN=R.yN,sw=R.sw,fur='#efe8dc',N=13,rx=sw*.74;
  const edge=k=>({x:-Math.cos(Math.PI*k)*rx,y:yN+.03+Math.sin(Math.PI*k)*.07-Math.pow(Math.abs(k-.5)*2,3)*.035});
  for(let i=0;i<N;i++){const p=edge(i/(N-1)),r=.036+.004*Math.sin(Math.PI*i/(N-1));cptDot(g,p.x,p.y+.014,r);g.fillStyle=cptLG(R,0,p.y-r,0,p.y+r*1.5,[[0,'#fffaf0'],[1,cnShade(fur,-.32)]]);g.fill();}
  g.beginPath();for(let i=0;i<=N;i++){const p=edge(i/N);i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y);}for(let i=N;i>=0;i--){const p=edge(i/N);g.lineTo(p.x*.5,p.y-.052+Math.sin(Math.PI*i/N)*.0-.0);}g.closePath();
  g.fillStyle=cptLG(R,0,yN-.03,0,yN+.12,[[0,cnShade(fur,-.1)],[.5,'#fffaf0'],[1,fur]]);g.fill();
  g.fillStyle=cptF(R,'#2a2530');for(let i=0;i<9;i++){const k=(i+.5)/9,p=edge(k);g.beginPath();g.ellipse(p.x*.88,p.y-.01-(i%2)*.02,.0055,.0095,.3,0,TAU);g.fill();}
  g.fillStyle=cptLG(R,0,yN+.06,0,yN+.18,[[0,D.trHi],[.4,D.gold],[1,cnShade(D.gold,-.5)]]);cptDot(g,0,yN+.15,.034);g.fill();g.strokeStyle=cptF(R,cnShade(D.gold,-.55));g.lineWidth=.004;g.stroke();
  g.fillStyle=cptRG(R,-.006,yN+.142,0,.02,[[0,D.ecHi],[1,D.ecLo]]);cptDot(g,0,yN+.15,.019);g.fill();g.fillStyle=cptF(R,cnA('#fff',.8));cptDot(g,-.007,yN+.142,.005);g.fill();
}
/* hood style: heavy cloak with a draped cowl */
function cptHoodBody0(R){
  const g=R.g,D=R.D,sw=R.sw*1.04,nw=R.nw,yN=R.yN,B=R.B;
  g.beginPath();g.moveTo(-sw*1.1,B);g.lineTo(-sw*1.06,R.yS+.1);g.bezierCurveTo(-sw*1.04,R.yS-.02,-sw*.78,R.yS-.05,-sw*.5,yN);g.lineTo(sw*.5,yN);g.bezierCurveTo(sw*.78,R.yS-.05,sw*1.04,R.yS-.02,sw*1.06,R.yS+.1);g.lineTo(sw*1.1,B);g.closePath();
  g.fillStyle=cptLitX(R,sw*1.1,[[0,D.acHi],[.5,D.ac],[1,D.acLo]]);g.fill();
  g.save();g.clip();for(let i=0;i<6;i++){const x=(-.85+i*.34)*sw,w=.07+.05*cptRn(D,i,53);g.beginPath();g.moveTo(x,yN+.08);g.bezierCurveTo(x+.05,B*.5,x-.04,B*.75,x+.02,B);g.lineTo(x+w,B);g.bezierCurveTo(x+w-.05,B*.75,x+w+.04,B*.5,x+w*.3,yN+.08);g.closePath();g.fillStyle=i%2?cptF(R,cnA(D.acLo,.3)):cptF(R,cnA(D.acHi,.14));g.fill();}g.restore();
}
function cptHoodBody1(R){
  const g=R.g,D=R.D,nw=R.nw,yN=R.yN,sw=R.sw;
  g.beginPath();g.moveTo(-nw*2.3,yN-.02);g.bezierCurveTo(-nw*2.6,yN+.09,-nw*1.2,yN+.13,0,yN+.12);g.bezierCurveTo(nw*1.2,yN+.13,nw*2.6,yN+.09,nw*2.3,yN-.02);g.lineTo(nw*1.4,yN-.04);g.bezierCurveTo(nw*.8,yN+.04,-nw*.8,yN+.04,-nw*1.4,yN-.04);g.closePath();
  g.fillStyle=cptLitX(R,nw*2.6,[[0,D.acHi],[.45,D.acMd],[1,D.acLo]]);g.fill();g.strokeStyle=cptF(R,cnA(D.acLo,.8));g.lineWidth=Math.max(.004,R.px);g.stroke();
  g.strokeStyle=cptF(R,cnA(D.acLo,.5));g.lineWidth=.005;g.beginPath();for(let i=0;i<5;i++){const x=-nw*1.8+i*nw*.9;g.moveTo(x,yN+.0);g.quadraticCurveTo(x*.9,yN+.07,x*.7,yN+.115);}g.stroke();
  g.fillStyle=cptLG(R,0,yN+.1,0,yN+.18,[[0,D.trHi],[1,cnShade(D.tr,-.4)]]);cptDot(g,0,yN+.145,.024);g.fill();g.strokeStyle=cptF(R,D.trLo);g.lineWidth=.003;g.stroke();
}

/* ------------------------------------ chest emblem (a real shape, big enough for 64 px) ------------------------------------ */
function cptEmblem(R){
  const D=R.D,g=R.g;if(R.sil||D.emblem==='none')return;
  const kind=D.emblem==='faction'?(D.faction||'ring'):D.emblem,r=.05*(1+.45*R.lod),x=-.15-R.sw*.04,y=.4+.0;
  const c=D.emblem==='crown'||D.emblem==='sun'?'#ffd45a':D.facCol.light,c2=D.emblem==='crown'||D.emblem==='sun'?'#b8861c':D.facCol.base;
  g.save();g.translate(x,y);
  g.fillStyle=cptRG(R,0,0,0,r*1.35,[[0,'rgba(8,10,20,.9)'],[1,'rgba(8,10,20,.78)']]);cptDot(g,0,0,r*1.32);g.fill();g.strokeStyle=cptF(R,cnA(c,.9));g.lineWidth=Math.max(.0045,R.px*1.1);g.stroke();
  g.scale(r,r);g.lineJoin='round';g.fillStyle=cptF(R,c);g.strokeStyle=cptF(R,c);const lw=Math.max(.2,R.px/r*1.4);
  if(kind==='meridian'){g.beginPath();g.moveTo(-.72,-.78);g.lineTo(.72,-.78);g.lineTo(.72,.1);g.quadraticCurveTo(.72,.66,0,.98);g.quadraticCurveTo(-.72,.66,-.72,.1);g.closePath();g.fill();
    g.strokeStyle=cptF(R,c2);g.lineWidth=.3;g.beginPath();g.moveTo(-.4,.12);g.lineTo(0,-.38);g.lineTo(.4,.12);g.stroke();g.beginPath();g.moveTo(-.4,.5);g.lineTo(0,.0);g.lineTo(.4,.5);g.stroke();}
  else if(kind==='obsidian'){g.beginPath();g.moveTo(-.95,-.8);g.lineTo(-.4,-.05);g.lineTo(0,-1);g.lineTo(.4,-.05);g.lineTo(.95,-.8);g.lineTo(.62,.55);g.lineTo(0,1);g.lineTo(-.62,.55);g.closePath();g.fill();
    g.fillStyle=cptF(R,c2);g.beginPath();g.moveTo(0,-.35);g.lineTo(.2,.15);g.lineTo(0,.6);g.lineTo(-.2,.15);g.closePath();g.fill();}
  else if(kind==='aurora'){g.lineWidth=.3;g.beginPath();g.arc(0,0,.78,0,TAU);g.stroke();g.beginPath();g.arc(0,0,.42,0,TAU);g.fill();g.fillStyle=cptF(R,c2);cptDot(g,.17,-.1,.36);g.fill();
    g.lineWidth=.2;g.strokeStyle=cptF(R,c);for(let i=0;i<4;i++){const a=-Math.PI/2+(i-1.5)*.5;g.beginPath();g.moveTo(Math.cos(a)*.95,Math.sin(a)*.95);g.lineTo(Math.cos(a)*1.25,Math.sin(a)*1.25);g.stroke();}}
  else if(kind==='crown'){g.beginPath();g.moveTo(-.9,.55);g.lineTo(-.9,-.45);g.lineTo(-.45,.05);g.lineTo(0,-.8);g.lineTo(.45,.05);g.lineTo(.9,-.45);g.lineTo(.9,.55);g.closePath();g.fill();g.fillStyle=cptF(R,c2);g.fillRect(-.9,.3,1.8,.26);}
  else if(kind==='sun'){cptDot(g,0,0,.5);g.fill();g.lineWidth=.22;for(let i=0;i<8;i++){const a=i*Math.PI/4;g.beginPath();g.moveTo(Math.cos(a)*.72,Math.sin(a)*.72);g.lineTo(Math.cos(a)*1.05,Math.sin(a)*1.05);g.stroke();}g.fillStyle=cptF(R,c2);cptDot(g,0,0,.22);g.fill();}
  else{g.lineWidth=.28;g.beginPath();for(let i=0;i<6;i++){const a=i*Math.PI/3+.5;g.lineTo(Math.cos(a)*.8,Math.sin(a)*.8);}g.closePath();g.stroke();cptDot(g,0,0,.24);g.fill();}
  g.restore();
}

/* ------------------------------------ neck ------------------------------------ */
function cptNeck(R){
  const g=R.g,D=R.D,nw=R.nw,yN=R.yN;
  g.beginPath();g.moveTo(-nw,R.D.hy+.05);g.lineTo(-nw*1.06,yN+.03);g.quadraticCurveTo(0,yN+.07,nw*1.06,yN+.03);g.lineTo(nw,R.D.hy+.05);g.closePath();
  g.fillStyle=cptLitX(R,nw*1.3,[[0,D.skin],[.55,D.skin],[1,D.skLo]]);g.fill();
  g.save();g.clip();g.fillStyle=cptLG(R,0,R.D.hy+.12,0,yN-.01,[[0,cnA(D.skDp,.8)],[.5,cnA(D.skDp,.36)],[1,cnA(D.skDp,0)]]);g.fillRect(-.3,-.2,.6,.5);
  g.strokeStyle=cptF(R,cnA(D.skLo,.5));g.lineWidth=.004;g.beginPath();g.moveTo(-nw*.55,yN-.09);g.lineTo(-nw*.1,yN-.01);g.moveTo(nw*.55,yN-.09);g.lineTo(nw*.1,yN-.01);g.stroke();g.restore();   // sterno-mastoid hints
}

/* ====================================================================================================
   HEAD — ears, skull, shading, features, hair, hood rim, crown
   ==================================================================================================== */
function cptEars(R){
  const g=R.g,D=R.D,A=R.A,hidden=D.hood&&0;
  for(const s of[-1,1]){const far=s<0,w=far?A.wF:A.wN,sz=D.ear/.05*(far?1:.8),ex=s*(w-(far?.002:.016)),ey=.02;
    g.save();g.translate(ex,ey);g.rotate(-s*.1);
    const rx=.0225*sz,ry=.046*sz;cptEll(g,s*rx*.55,0,rx,ry,0);g.fillStyle=cptLG(R,-rx,0,rx*2,0,[[0,D.skLo],[.5,D.skin],[1,D.skLo]]);g.fill();
    cptEll(g,s*rx*.5,.004*sz,rx*.5,ry*.6,0);g.fillStyle=cptF(R,cnA(D.skDp,.5));g.fill();
    g.strokeStyle=cptF(R,cnA(D.skHi,.55));g.lineWidth=Math.max(.0035,R.px*.8);g.beginPath();g.ellipse(s*rx*.55,0,rx*.9,ry*.9,0,s>0?-1.2:Math.PI-1.0,s>0?1.2:Math.PI+1.0);g.stroke();
    g.restore();}
}
function cptFaceBase(R){
  const g=R.g,D=R.D,A=R.A,ls=R.ls;
  cptHeadPath(R);g.fillStyle=cptLG(R,ls*.2,-.1,-ls*.2,.1,[[0,D.skHi],[.38,D.skin],[1,D.skLo]]);g.fill();
  g.save();cptHeadPath(R);g.clip();
  /* sculpting: forehead light, brow shadow, cheek hollows, cheekbone light, jaw + chin shading, temple shadow on the unlit side */
  g.fillStyle=cptRG(R,CPT_FS*.5+ls*.03,-.14,0,.12,[[0,cnA(D.skLt,.28)],[1,cnA(D.skLt,0)]]);g.fillRect(-.3,-.3,.6,.4);
  g.fillStyle=cptLG(R,0,A.jy-.02,0,A.cy+.012,[[0,cnA(D.skDp,0)],[1,cnA(D.skDp,.42)]]);g.fillRect(-.3,A.jy-.05,.6,.3);                      // under the jaw
  g.fillStyle=cptLG(R,-ls*A.wF*1.05,0,-ls*A.wF*.25,0,[[0,cnA(D.skDp,.34+.12*R.lm)],[1,cnA(D.skDp,0)]]);g.fillRect(-.3,-.3,.6,.6);          // shadow side of the face
  for(const s of[-1,1]){const cxk=s*(s>0?A.wN:A.wF)*.58+CPT_FS*.6;
    g.fillStyle=cptRG(R,cxk,.08,0,.07,[[0,cnA(D.skDp,.22*D.hollow+.06)],[1,cnA(D.skDp,0)]]);g.fillRect(cxk-.1,0,.2,.2);                                    // hollow under the cheekbone
    g.fillStyle=cptRG(R,cxk,.03,0,.06,[[0,cnA(D.skLt,.2+.22*D.cheek*(s===R.ls?1:.4))],[1,cnA(D.skLt,0)]]);g.fillRect(cxk-.1,-.05,.2,.2);}   // cheekbone highlight
  /* blush for cheerful faces */
  if(R.X.cheek>.2){g.fillStyle=cptRG(R,CPT_FS+.095,.06,0,.06,[[0,cnA(D.blush,.28*R.X.cheek)],[1,cnA(D.blush,0)]]);g.fillRect(.0,-.05,.25,.2);g.fillStyle=cptRG(R,CPT_FS-.095,.06,0,.06,[[0,cnA(D.blush,.28*R.X.cheek)],[1,cnA(D.blush,0)]]);g.fillRect(-.25,-.05,.25,.2);}
  /* jaw muscle when clenched, chin highlight */
  if(R.X.clench>0){g.strokeStyle=cptF(R,cnA(D.skDp,.28*R.X.clench));g.lineWidth=.006;for(const s of[-1,1]){const j=s>0?A.jN:A.jF;g.beginPath();g.moveTo(s*(j+.012),A.jy-.05);g.quadraticCurveTo(s*(j-.015),A.jy-.01,s*(j-.03),A.jy+.015);g.stroke();}}
  g.fillStyle=cptRG(R,CPT_FS,A.cy-.03,0,.04,[[0,cnA(D.skLt,.2)],[1,cnA(D.skLt,0)]]);g.fillRect(-.1,A.cy-.08,.2,.1);
  g.restore();
}
function cptNose(R){
  const g=R.g,D=R.D,ls=R.ls,nx=CPT_FS+.004,ny=D.noseL-.004+R.X.ch*0,nW=D.noseW,sl=-ls;
  /* bridge shading on the unlit side, base shadow */
  g.beginPath();g.moveTo(nx+sl*.004,-.022);g.lineTo(nx+sl*(nW*.5),ny-.02);g.lineTo(nx+sl*(nW*1.15),ny+.004);g.lineTo(nx+sl*.002,ny+.01);g.closePath();g.fillStyle=cptLG(R,nx,-.02,nx+sl*.04,ny,[[0,cnA(D.skLo,.04)],[1,cnA(D.skLo,.42)]]);g.fill();
  g.strokeStyle=cptF(R,cnA(D.skLt,.4));g.lineWidth=Math.max(.0045,R.px);g.beginPath();g.moveTo(nx-sl*.004,-.01);g.lineTo(nx-sl*.003,ny-.022);g.stroke();
  g.fillStyle=cptRG(R,nx+.007-sl*.003,ny-.007,0,.02,[[0,cnA(D.skLt,.45)],[1,cnA(D.skLt,0)]]);cptEll(g,nx+.007,ny-.006,.022,.02,0);g.fill();                      // tip highlight
  g.fillStyle=cptRG(R,nx+.004,ny+.012,0,.05,[[0,cnA(D.skDp,.4)],[1,cnA(D.skDp,0)]]);cptEll(g,nx+.004,ny+.014,.052,.02,0);g.fill();                                     // under the nose
  g.strokeStyle=cptF(R,cnA(D.skLo,.75));g.lineWidth=Math.max(.0045,R.px*1.1);g.beginPath();                                                                           // nostril wings
  g.moveTo(nx-nW*1.05,ny-.016);g.quadraticCurveTo(nx-nW*1.4,ny+.004,nx-nW*.7,ny+.011);g.moveTo(nx+nW*.9,ny-.016);g.quadraticCurveTo(nx+nW*1.15,ny+.004,nx+nW*.62,ny+.011);g.stroke();
  g.fillStyle=cptF(R,cnA(D.skDp,.85));for(const s of[-1,1]){cptEll(g,nx+s*nW*.5+.005,ny+.011,.0095,.0052,s*.3);g.fill();}
}
function cptEyeShape(R,e,L){   // eye outline path (open) for lid values L
  const g=R.g,{s,ex,ey,ew,eh}=e,D=R.D,X=R.X,b=R.blink;
  const li=L.li*(1-b)-.28*b,lo=L.lo*(1-b)-.28*b,low=Math.max(.06,(.5-X.sq*.42)*(1-b*.85))+(X.bag?.08*X.bag:0);
  const I={x:ex-s*ew,y:ey+.004+D.et*.4},O={x:ex+s*ew,y:ey-D.et-.002},dx=O.x-I.x;
  const yUi=I.y-eh*li*1.33,yUo=O.y-eh*lo*1.33,yLo=O.y+eh*low*1.33,yLi=I.y+eh*low*1.33;
  g.beginPath();g.moveTo(I.x,I.y);g.bezierCurveTo(I.x+dx*.3,yUi,I.x+dx*.72,yUo,O.x,O.y);g.bezierCurveTo(I.x+dx*.74,yLo,I.x+dx*.28,yLi,I.x,I.y);g.closePath();
  e.I=I;e.O=O;e.yUi=yUi;e.yUo=yUo;e.dx=dx;e.low=low;
}
function cptEye(R,e,glowOnly){
  const g=R.g,D=R.D,X=R.X,{s,ex,ey,ew,eh,near}=e,glowEye=D.marks.includes('glow-eye')&&!near;
  const L={li:X.li,lo:X.lo};
  if(!glowOnly){
    g.fillStyle=cptRG(R,ex,ey-.012,0,Math.max(.01,ew*1.9),[[0,cnA(D.skDp,.34)],[1,cnA(D.skDp,0)]]);cptEll(g,ex,ey-.014,ew*1.9,eh*2.7,0);g.fill();   // socket
  }
  cptEyeShape(R,e,L);
  const ir=.0262*D.es*X.iris*(1+.15*R.lod),pr=ir*.42*X.pup,ix=ex+ew*.2*(near?1:.8),iy=ey+X.gz*eh*.72-eh*.04;
  if(glowOnly){   // shadow mode: the eye is just a light
    g.save();g.globalCompositeOperation='lighter';cptEyeShape(R,e,L);g.fillStyle=cnA(D.ec,.95);g.fill();g.restore();
    cnGlow(g,ix,iy,ew*3.2,D.ec,.55);cnGlow(g,ix,iy,ew*1.2,D.ecHi,.8,{core:.9});return;}
  g.save();g.clip();
  g.fillStyle=cptLG(R,0,ey-eh*1.3,0,ey+eh*.9,[[0,'#a9a7ad'],[.32,'#f1f0f2'],[1,'#d6d4da']]);g.fillRect(ex-ew*1.3,ey-eh*2,ew*2.6,eh*4);
  if(glowEye){g.fillStyle=cptF(R,'#f4f6fa');g.fillRect(ex-ew*1.3,ey-eh*2,ew*2.6,eh*4);g.fillStyle=cptRG(R,ix,iy,0,ir*1.25,[[0,'#ffffff'],[.3,D.ecHi],[.75,D.ec],[1,D.ecLo]]);cptDot(g,ix,iy,ir*1.2);g.fill();g.fillStyle=cptF(R,cnA('#fff',.95));cptDot(g,ix,iy,ir*.3);g.fill();}
  else{
    g.fillStyle=cptRG(R,ix,iy,ir*.2,ir*1.04,[[0,D.ecHi],[.55,D.ec],[.88,D.ecLo],[1,'#0c1018']]);cptDot(g,ix,iy,ir*1.04);g.fill();
    g.fillStyle=cptF(R,cnA(D.ecHi,.3));g.beginPath();g.arc(ix,iy+ir*.1,ir*.9,.25,Math.PI-.25);g.arc(ix,iy+ir*.1,ir*.5,Math.PI-.25,.25,true);g.closePath();g.fill();
    g.fillStyle=cptF(R,'#05070b');cptDot(g,ix,iy,pr);g.fill();
    g.fillStyle=cptF(R,'rgba(255,255,255,.95)');cptEll(g,ix+R.ls*ir*.34,iy-ir*.34,ir*.26,ir*.3,0);g.fill();cptDot(g,ix-R.ls*ir*.3,iy+ir*.38,ir*.11);g.fillStyle=cptF(R,'rgba(255,255,255,.45)');g.fill();}
  g.fillStyle=cptLG(R,0,e.yUi<e.yUo?e.yUi:e.yUo,0,ey+eh*.2,[[0,'rgba(30,14,16,.55)'],[1,'rgba(30,14,16,0)']]);g.fillRect(ex-ew*1.3,ey-eh*2.5,ew*2.6,eh*3.2);   // lid shadow on the eyeball
  if(X.wet){g.strokeStyle=cptF(R,'rgba(255,255,255,.7)');g.lineWidth=Math.max(.0045,R.px*1.2);g.beginPath();g.moveTo(e.I.x+s*ew*.25,ey+eh*.5);g.quadraticCurveTo(ex,ey+eh*.85,e.O.x-s*ew*.3,ey+eh*.45);g.stroke();}
  g.restore();
  /* lids */
  const b=R.blink,lw=(.0062+.0026*D.lash)*(1+.9*R.lod);
  g.strokeStyle=cptF(R,cnMix(D.skDp,'#000',.35));g.lineWidth=lw;g.lineCap='round';g.beginPath();g.moveTo(e.I.x,e.I.y);g.bezierCurveTo(e.I.x+e.dx*.3,e.yUi,e.I.x+e.dx*.72,e.yUo,e.O.x,e.O.y);
  g.lineTo(e.O.x+s*.011,e.O.y-.007-D.et*.5);g.stroke();
  const cr=.012+eh*.32*Math.min(1.2,Math.max(0,Math.min(X.li,X.lo)*(1-b)));if(!R.lod||R.lod<.7){g.strokeStyle=cptF(R,cnA(D.skLo,.62));g.lineWidth=Math.max(.0035,R.px*.9);g.beginPath();g.moveTo(e.I.x+s*ew*.35,e.I.y-cr*.7);g.bezierCurveTo(e.I.x+e.dx*.34,e.yUi-cr*1.35,e.I.x+e.dx*.7,e.yUo-cr*1.3,e.O.x+s*ew*.1,e.O.y-cr*.55);g.stroke();}   // lid crease
  g.strokeStyle=cptF(R,cnA(D.skDp,.34));g.lineWidth=Math.max(.0032,R.px*.8);g.beginPath();g.moveTo(e.I.x,e.I.y);g.bezierCurveTo(e.I.x+e.dx*.28,ey+eh*e.low*1.33,e.I.x+e.dx*.74,ey+eh*e.low*1.33,e.O.x,e.O.y);g.stroke();
  const bag=Math.max(X.bag,D.old*.55);if(bag>0){g.strokeStyle=cptF(R,cnA(D.skDp,.34*bag));g.lineWidth=.007;g.beginPath();g.moveTo(ex-ew*.8,ey+eh*e.low*1.25+.012);g.quadraticCurveTo(ex,ey+eh*e.low*1.25+.034,ex+ew*.85,ey+eh*e.low*1.2+.008);g.stroke();
    g.fillStyle=cptRG(R,ex,ey+.032,0,ew*1.1,[[0,cnA(D.skDp,.26*bag)],[1,cnA(D.skDp,0)]]);cptEll(g,ex,ey+.032,ew*1.1,.02,0);g.fill();}
  if(X.cheek>.3&&!R.lod){g.strokeStyle=cptF(R,cnA(D.skLo,.4*X.cheek));g.lineWidth=.0032;g.beginPath();for(let i=0;i<3;i++){const a=(i-1)*.45;g.moveTo(e.O.x+s*.012,e.O.y+.004);g.lineTo(e.O.x+s*(.03+.004*i),e.O.y+.004+Math.sin(a)*.02);}g.stroke();}   // crow's feet
  if(glowEye&&!R.sil){cnGlow(g,ix,iy,ew*2.6,D.ec,.42);cnGlow(g,ix,iy,ew*.8,D.ecHi,.5,{core:.35});}
}
function cptBrowPts(R,e){
  const D=R.D,X=R.X,{s,ex,ey,ew,near}=e,bi=near?X.bi:(X.bi2==null?X.bi:X.bi2),bo=near?X.bo:(X.bo2==null?X.bo:X.bo2),bY=ey-.066-.002*(1-D.es);
  const xi=ex-s*(ew*.9+X.pull),xo=ex+s*ew*1.28*D.browLen,yi=bY-bi*.017,yo=bY-bo*.017+.007;
  return{xi,yi,xo,yo,xm:ex+s*ew*.1,ym:(yi*.4+yo*.6)-.0095-.003*Math.max(0,X.fh)-.004*Math.max(0,(bi+bo)*.25)};
}
function cptBrows(R){
  const g=R.g,D=R.D,X=R.X;
  for(const e of R.eye){const p=cptBrowPts(R,e),s=e.s,tb=D.bt*(1+.95*R.lod)*(D.old?1.25:1),N=8,top=[],bot=[];
    for(let i=0;i<=N;i++){const k=i/N,x=cptQ(k,p.xi,p.xm,p.xo),y=cptQ(k,p.yi,p.ym,p.yo),dx=2*((1-k)*(p.xm-p.xi)+k*(p.xo-p.xm)),dy=2*((1-k)*(p.ym-p.yi)+k*(p.yo-p.ym)),l=Math.hypot(dx,dy)||1,nx=-dy/l,ny=dx/l,th=tb*(1.0-.62*Math.pow(k,1.25))*(k<.12?.82+k*1.5:1)*(1+.5*X.fur*(1-k));
      const sg=ny<0?1:-1;top.push([x+nx*sg*th*.5,y+ny*sg*th*.5]);bot.push([x-nx*sg*th*.5,y-ny*sg*th*.5]);}
    g.beginPath();g.moveTo(top[0][0],top[0][1]);for(let i=1;i<=N;i++)g.lineTo(top[i][0],top[i][1]);for(let i=N;i>=0;i--)g.lineTo(bot[i][0],bot[i][1]);g.closePath();
    g.fillStyle=cptF(R,D.browC);g.fill();g.strokeStyle=cptF(R,cnA(D.browC,.55));g.lineWidth=Math.max(.0025,R.px*.6);g.stroke();}
}
/* mouth: lips, teeth, tongue, corners — all driven by the expression rig and the talk amplitude */
function cptMouthGeom(R,op){
  const D=R.D,X=R.X,mx=CPT_FS+.002,my=D.mouthY,hw=D.mw*X.mw*(1-.2*op)*(X.rnd?(1-.2*op):1);
  const cN=-(X.mc)*.0185*(1-.18*op),cF=-((X.mc2==null?X.mc:X.mc2))*.0185*(1-.18*op),xl=mx-hw*1.06,xr=mx+hw*.94,yl=my+cF,yr=my+cN,mid=my+X.dip*.0075-X.mc*.0035;
  return{mx,my,hw,xl,xr,yl,yr,yc:2*mid-(yl+yr)/2};
}
function cptMouth(R){
  const g=R.g,D=R.D,X=R.X,gap=R.gap,A=R.A,lod=R.lod,MG=cptMouthGeom(R,R.open),mx=MG.mx,my=MG.my,hw=MG.hw,xl=MG.xl,xr=MG.xr,yl=MG.yl,yr=MG.yr,yc=MG.yc;
  const U=t=>({x:cptQ(t,xl,mx,xr),y:cptQ(t,yl,yc,yr)});
  const prof=t=>Math.pow(Math.sin(Math.PI*t),.7);                // opening profile along the mouth
  const lipT=(.0125+.009*D.lipF)*(1-.5*X.thin)*(1-.2*D.old),lipB=(.017+.013*D.lipF)*(1-.4*X.thin)*(1-.2*D.old);
  const N=12;
  const gt=R.shd?0:1;
  /* philtrum + under-lip shadow */
  g.fillStyle=cptRG(R,mx,my+lipB+gap+.014,0,.05,[[0,cnA(D.skDp,.28)],[1,cnA(D.skDp,0)]]);cptEll(g,mx,my+gap+lipB+.016,.06,.02,0);g.fill();
  /* interior */
  if(gap>.002||X.teeth>.6){
    const gp=Math.max(gap,.009*X.teeth),Lw=t=>{const u=U(t);return{x:u.x,y:u.y+gp*prof(t)};};
    g.beginPath();for(let i=0;i<=N;i++){const p=U(i/N);i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y);}for(let i=N;i>=0;i--){const p=Lw(i/N);g.lineTo(p.x,p.y);}g.closePath();
    g.save();g.fillStyle=cptLG(R,0,my-.01,0,my+gp+.01,[[0,'#2a0a10'],[1,'#4a1218']]);g.fill();g.clip();
    const tt=Math.min(gp*.62,.016+.006*X.teeth),th=X.teeth>=.5||gp>.014;
    if(th){   // upper teeth
      g.beginPath();for(let i=0;i<=N;i++){const p=U(i/N);i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y);}for(let i=N;i>=0;i--){const p=U(i/N);g.lineTo(p.x,p.y+tt*(.55+.45*prof(i/N)));}g.closePath();
      g.fillStyle=cptLG(R,0,my-.004,0,my+tt+.004,[[0,'#cfc8c2'],[.3,'#f6f1ea'],[1,'#e2dbd2']]);g.fill();
      if(X.teeth>.5&&gp<.03){g.beginPath();for(let i=0;i<=N;i++){const p=U(i/N),q=Lw(i/N);i?g.lineTo(p.x+0,q.y-tt*.5*(.6+.4*prof(i/N))+.0):g.moveTo(p.x,q.y-tt*.5);}for(let i=N;i>=0;i--){const q=Lw(i/N);g.lineTo(q.x,q.y+.002);}g.closePath();g.fillStyle=cptLG(R,0,my,0,my+gp,[[0,'#ece6de'],[1,'#c9c1b8']]);g.fill();}   // lower teeth when the lips are only parted
      g.strokeStyle=cptF(R,'rgba(120,100,100,.5)');g.lineWidth=Math.max(.0022,R.px*.55);g.beginPath();for(let i=1;i<9;i++){const k=i/9,p=U(k);g.moveTo(p.x,p.y);g.lineTo(p.x,p.y+tt*.9);}g.stroke();
    }
    if(gp>.022){g.beginPath();g.ellipse(mx+.004,my+gp*.95,hw*.58,gp*.52,0,0,TAU);g.fillStyle=cptLG(R,0,my+gp*.4,0,my+gp*1.2,[[0,'#8c2c3a'],[1,'#c4535f']]);g.fill();g.strokeStyle=cptF(R,'rgba(60,10,20,.55)');g.lineWidth=.0025;g.beginPath();g.moveTo(mx-hw*.3,my+gp*.9);g.lineTo(mx+hw*.35,my+gp*.84);g.stroke();}
    g.restore();
  }
  const gp2=Math.max(gap,(X.teeth>.6&&gap<=.002)?.009*X.teeth:0);
  const Lw=t=>{const u=U(t);return{x:u.x,y:u.y+gp2*prof(t)};};
  /* lower lip */
  g.beginPath();for(let i=0;i<=N;i++){const p=Lw(i/N);i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y);}for(let i=N;i>=0;i--){const p=Lw(i/N);g.lineTo(p.x,p.y+lipB*Math.pow(Math.sin(Math.PI*Math.min(.97,Math.max(.03,i/N))),.8)+.002);}g.closePath();
  g.fillStyle=cptLG(R,0,my,0,my+gp2+lipB,[[0,cnShade(D.lip,-.05)],[.55,D.lip],[1,cnShade(D.lip,-.22)]]);g.fill();
  g.strokeStyle=cptF(R,cnA(cnShade(D.lip,.55),.55));g.lineWidth=Math.max(.0028,R.px*.7);g.beginPath();for(let i=3;i<=9;i++){const p=Lw(i/N);i===3?g.moveTo(p.x,p.y+lipB*.5+.0):g.lineTo(p.x,p.y+lipB*.5);}g.stroke();   // lower-lip highlight
  /* upper lip with a cupid's bow */
  g.beginPath();for(let i=0;i<=N;i++){const p=U(i/N);i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y);}
  for(let i=N;i>=0;i--){const k=i/N,p=U(k),bow=1-.35*Math.exp(-Math.pow((k-.5)*7,2))+.18*Math.exp(-Math.pow((k-.38)*9,2))+.18*Math.exp(-Math.pow((k-.62)*9,2));g.lineTo(p.x,p.y-lipT*Math.pow(Math.sin(Math.PI*Math.min(.97,Math.max(.03,k))),.6)*bow*(1+X.up*.0)-X.up*.003*prof(k));}
  g.closePath();g.fillStyle=cptLG(R,0,my-lipT,0,my+.002,[[0,cnShade(D.lip,-.12)],[1,cnShade(D.lip,-.3)]]);g.fill();
  /* seam + corners */
  g.strokeStyle=cptF(R,cnA(cnShade(D.lip,-.7),gap>.004?.4:.92));g.lineWidth=Math.max(.0034,R.px*(1+lod*.9)*.95);g.lineCap='round';g.beginPath();for(let i=0;i<=N;i++){const p=U(i/N);i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y);}g.stroke();
  g.strokeStyle=cptF(R,cnA(D.skDp,.5));g.lineWidth=Math.max(.003,R.px*.8);g.beginPath();g.moveTo(xl-.002,yl-.005*(X.mc2==null?X.mc:X.mc2)*.3);g.lineTo(xl-.007,yl-(X.mc2==null?X.mc:X.mc2)*.006);g.moveTo(xr+.002,yr-.005*X.mc*.3);g.lineTo(xr+.007,yr-X.mc*.006);g.stroke();
  /* chin crease / mentalis shadow when the lip is pushed up (sad, determined) */
  const cc=Math.max(0,-X.mc*.5)+X.thin*.2+X.clench*.2;if(cc>.2){g.strokeStyle=cptF(R,cnA(D.skLo,.38*Math.min(1,cc)));g.lineWidth=.005;g.beginPath();g.moveTo(mx-.03,my+gap+lipB+.018);g.quadraticCurveTo(mx,my+gap+lipB+.027,mx+.03,my+gap+lipB+.018);g.stroke();}
}
function cptWrinkles(R){
  const g=R.g,D=R.D,X=R.X,old=D.old,A=R.A;if(R.lod>.85)return;
  const fh=Math.max(X.fh,old*.55,X.fur*.2);g.lineCap='round';
  if(fh>.05&&!D.marks.includes('visor')){g.strokeStyle=cptF(R,cnA(D.skLo,.38*Math.min(1,fh)));g.lineWidth=Math.max(.0038,R.px*.9);g.beginPath();
    for(let i=0;i<3;i++){const y=-.152+i*.016+D.fh-X.fh*.01,w=(.09-i*.012)*(.8+.3*cptRn(D,i,60));g.moveTo(CPT_FS-w,y+.004);g.quadraticCurveTo(CPT_FS,y-.006-X.fh*.004,CPT_FS+w,y+.004);}g.stroke();}
  if(X.fur>.1){g.strokeStyle=cptF(R,cnA(D.skDp,.5*X.fur));g.lineWidth=Math.max(.0045,R.px*1.1);g.beginPath();g.moveTo(CPT_FS-.014,-.07);g.lineTo(CPT_FS-.012,-.038);g.moveTo(CPT_FS+.014,-.07);g.lineTo(CPT_FS+.012,-.038);g.stroke();}
  const nl=Math.max(X.nl,old*.55);if(nl>.1){g.strokeStyle=cptF(R,cnA(D.skLo,.52*Math.min(1,nl)));g.lineWidth=Math.max(.0045,R.px*1.1);g.beginPath();
    for(const s of[-1,1]){const w=s>0?.96:1.04,mg=cptMouthGeom(R,R.openQ),ex=s>0?mg.xr:mg.xl;g.moveTo(CPT_FS+s*D.noseW*1.25*w,.078);g.quadraticCurveTo(CPT_FS+s*(D.noseW*1.7+.012+X.cheek*.012)*w,.115,ex+s*.012,mg.my+.004-(s>0?X.mc:(X.mc2==null?X.mc:X.mc2))*.002);}g.stroke();}
  if(old>.5){g.strokeStyle=cptF(R,cnA(D.skLo,.3));g.lineWidth=.0035;g.beginPath();for(const s of[-1,1]){g.moveTo(s*.13,.0);g.quadraticCurveTo(s*.115,.03,s*.1,.06);}g.stroke();}
  if(X.sweat){const sx=CPT_FS+.108,sy=-.125;g.fillStyle=cptRG(R,sx-.002,sy,0,.014,[[0,'rgba(240,250,255,.95)'],[1,'rgba(150,200,230,.7)']]);g.beginPath();g.moveTo(sx,sy-.026);g.quadraticCurveTo(sx+.013,sy-.002,sx,sy+.011);g.quadraticCurveTo(sx-.013,sy-.002,sx,sy-.026);g.fill();}
}
/* marks */
function cptMarksFace(R){
  const g=R.g,D=R.D,A=R.A,ls=R.ls;
  for(const m of D.marks){
    if(m==='scar-l'){g.save();if(D.marks.includes('mask')){g.beginPath();g.rect(-.4,-.4,.8,.43);g.clip();}const p=[[CPT_FS+.13,-.115],[CPT_FS+.118,-.07],[CPT_FS+.1,-.02],[CPT_FS+.092,.03],[CPT_FS+.075,.075]];
      const path=()=>{g.beginPath();g.moveTo(p[0][0],p[0][1]);for(let i=1;i<p.length;i++)g.quadraticCurveTo(p[i][0]+.006*(i%2?1:-1),(p[i][1]+p[i-1][1])/2,p[i][0],p[i][1]);};
      g.save();g.lineCap='round';path();g.strokeStyle=cptF(R,cnA(D.skDp,.5));g.lineWidth=.0115;g.stroke();path();g.strokeStyle=cptF(R,cnMix(D.skin,'#f0b0a8',.55));g.lineWidth=.0072;g.stroke();path();g.strokeStyle=cptF(R,cnA('#fff',.35));g.lineWidth=.0022;g.stroke();
      g.strokeStyle=cptF(R,cnA(D.skDp,.8));g.lineWidth=Math.max(.003,R.px*.8);g.beginPath();for(let i=0;i<7;i++){const k=(i+.5)/7,q=p[Math.floor(k*(p.length-1))],q2=p[Math.min(p.length-1,Math.floor(k*(p.length-1))+1)],f=k*(p.length-1)-Math.floor(k*(p.length-1)),x=q[0]+(q2[0]-q[0])*f,y=q[1]+(q2[1]-q[1])*f;g.moveTo(x-.009,y-.002);g.lineTo(x+.009,y+.003);}g.stroke();g.restore();g.restore();}
    else if(m==='tattoo'){const c=cnLum(D.ec)>.78?cnMix(D.ec,'#000',.4):D.ec,sx=-CPT_FS*0;g.save();g.fillStyle=cptF(R,cnA(c,.9));
      for(let i=0;i<3;i++){const x=CPT_FS-.115-i*.0,y=.0+i*.02;g.beginPath();g.moveTo(x-.045+i*.004,y+.012);g.lineTo(x+.04-i*.006,y-.012);g.lineTo(x+.03-i*.006,y+.002);g.lineTo(x-.04+i*.004,y+.028);g.closePath();g.fill();}
      for(let i=0;i<4;i++){cptDot(g,CPT_FS-.1+i*.02,-.095-i*.004,.0055);g.fill();}g.beginPath();g.moveTo(CPT_FS-.14,-.11);g.lineTo(CPT_FS-.07,-.13);g.lineTo(CPT_FS-.12,-.095);g.closePath();g.fill();g.restore();}
    else if(m==='cracks'&&!R.sil){g.save();cptHeadPath(R);g.clip();g.lineCap='round';g.lineJoin='round';g.globalCompositeOperation='lighter';
      const pts=[];let x=CPT_FS+.03+(cptRn(D,1,70)-.5)*.1,y=-.24;pts.push([x,y]);for(let i=1;i<9;i++){x+=(cptRn(D,i,71)-.4)*.05;y+=.04+cptRn(D,i,72)*.02;pts.push([x,y]);}
      const br=[[3,-1],[5,1]];const draw=(w,a,col)=>{g.strokeStyle=cnA(col,a);g.lineWidth=w;g.beginPath();g.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)g.lineTo(pts[i][0],pts[i][1]);
        for(const [k,s] of br){let bx=pts[k][0],by=pts[k][1];g.moveTo(bx,by);for(let j=0;j<3;j++){bx+=s*(.018+cptRn(D,k*3+j,73)*.02);by+=.014+cptRn(D,k*3+j,74)*.015;g.lineTo(bx,by);}}g.stroke();};
      draw(.016,.22,D.ec);draw(.0065,.7,D.ec);draw(.0022,.95,'#ffffff');g.restore();}
  }
}
function cptMaskVisor(R){
  const g=R.g,D=R.D,A=R.A,ey=-.012;
  if(D.marks.includes('mask')){
    const ink=cnMix('#252a33',D.tr,.2),edge=cnMix(ink,D.tr,.55),topY=ey+.045;
    g.save();cptHeadPath(R);g.clip();
    g.beginPath();g.moveTo(-.3,topY+.03);g.quadraticCurveTo(-A.wF*.5,topY+.005,CPT_FS-.014,ey+.022);g.quadraticCurveTo(CPT_FS+.004,ey+.012,CPT_FS+.014,ey+.022);g.quadraticCurveTo(A.wN*.5,topY+.005,.3,topY+.03);g.lineTo(.3,.4);g.lineTo(-.3,.4);g.closePath();
    g.fillStyle=cptLitX(R,.2,[[0,cnShade(ink,.28)],[.5,ink],[1,cnShade(ink,-.4)]]);g.fill();
    g.clip();g.strokeStyle=cptF(R,cnA(edge,.9));g.lineWidth=.007;g.beginPath();g.moveTo(-.3,topY+.03);g.quadraticCurveTo(-A.wF*.5,topY+.005,CPT_FS-.014,ey+.022);g.quadraticCurveTo(CPT_FS+.004,ey+.012,CPT_FS+.014,ey+.022);g.quadraticCurveTo(A.wN*.5,topY+.005,.3,topY+.03);g.stroke();
    g.strokeStyle=cptF(R,cnA('#fff',.18));g.lineWidth=.004;g.beginPath();g.moveTo(CPT_FS+.002,ey+.03);g.lineTo(CPT_FS+.002,.2);g.stroke();
    g.strokeStyle=cptF(R,cnA('#000',.45));g.lineWidth=.003;g.beginPath();g.moveTo(CPT_FS-.12,.1);g.quadraticCurveTo(CPT_FS-.06,.13,CPT_FS-.02,.2);g.moveTo(CPT_FS+.12,.1);g.quadraticCurveTo(CPT_FS+.06,.13,CPT_FS+.02,.2);g.stroke();
    const glow=.2+.8*R.tk;for(let i=0;i<4;i++){const y=.133+i*.016+R.jd*.4,w=.05-i*.005;g.fillStyle=cptF(R,'#0a0c10');g.fillRect(CPT_FS-w,y,w*2,.008);if(!R.sil&&!R.holo){g.fillStyle=cnA(D.ec,glow*(.9-i*.12));g.fillRect(CPT_FS-w+.004,y+.0015,w*2-.008,.0045);}}
    for(const s of[-1,1]){const fx=CPT_FS+s*(s>0?.1:.112),fy=.105;g.fillStyle=cptRG(R,fx,fy,0,.03,[[0,cnShade(ink,.35)],[1,cnShade(ink,-.4)]]);cptDot(g,fx,fy,.027);g.fill();g.strokeStyle=cptF(R,edge);g.lineWidth=.004;g.stroke();g.fillStyle=cptF(R,'#0a0c10');for(let k=-1;k<=1;k++){g.fillRect(fx-.014,fy+k*.008-.002,.028,.0035);}}
    g.restore();g.save();g.beginPath();g.rect(-.4,topY-.04,.8,.6);g.clip();cptHeadPath(R);g.strokeStyle=cptF(R,cnA(edge,.9));g.lineWidth=.014;g.stroke();g.restore();
  }
  if(D.marks.includes('visor')){
    const vy=ey+.0,vt=vy-.04,vb=vy+.034,xl=-A.wF-.008,xr=A.wN+.008,glass=cnMix('#06090f',D.ec,.22);
    const vp=()=>{g.beginPath();g.moveTo(xl,vt+.018);g.quadraticCurveTo(0,vt-.014,xr,vt+.018);g.lineTo(xr-.004,vb+.004);g.quadraticCurveTo(0,vb+.022,xl+.004,vb+.004);g.closePath();};
    if(!R.sil){g.save();vp();g.clip();for(const e of R.eye){}g.restore();}
    vp();g.fillStyle=cptLG(R,0,vt,0,vb,[[0,cnShade(glass,.25)],[.5,glass],[1,cnShade(glass,-.55)]]);g.fill();
    if(!R.sil){g.save();vp();g.clip();
      for(const e of R.eye){const hh=e.eh*Math.min(R.X.li,R.X.lo,1.1)*(1-R.blink*.9);cptEyeShape(R,e,{li:R.X.li,lo:R.X.lo});g.save();g.globalCompositeOperation='lighter';g.fillStyle=cptRG(R,e.ex,e.ey,0,e.ew,[[0,'#ffffff'],[.4,D.ecHi],[1,D.ec]]);g.fill();g.restore();cnGlow(g,e.ex,e.ey,e.ew*2.4,D.ec,.55);}
      g.fillStyle=cnA('#fff',.2);g.beginPath();g.moveTo(-.12,vt-.02);g.lineTo(-.06,vt-.02);g.lineTo(.0,vb+.03);g.lineTo(-.06,vb+.03);g.closePath();g.fill();g.fillStyle=cnA('#fff',.09);g.beginPath();g.moveTo(.0,vt-.02);g.lineTo(.03,vt-.02);g.lineTo(.07,vb+.03);g.lineTo(.04,vb+.03);g.closePath();g.fill();
      g.strokeStyle=cnA('#fff',.45);g.lineWidth=.0035;g.beginPath();g.moveTo(xl+.02,vt+.012);g.quadraticCurveTo(0,vt-.012,xr-.02,vt+.012);g.stroke();g.restore();}
    vp();g.strokeStyle=cptF(R,D.tr);g.lineWidth=Math.max(.006,R.px*1.4);g.stroke();
    g.fillStyle=cptF(R,D.trLo);for(const s of[-1,1]){cptEll(g,s>0?xr-.004:xl+.004,vy+.004,.01,.03,0);g.fill();}
  }
}
function cptHalo(R){
  const g=R.g,D=R.D,y=D.hy-.29,c='#ffe8a0';
  g.save();g.translate(0,y);if(!R.sil){cnGlow(g,0,.03,.34,'#ffd878',.5);}
  g.rotate(R.tilt*.4);g.beginPath();g.ellipse(0,0,.235,.072,0,0,TAU);g.strokeStyle=cptF(R,cnA('#ffd060',.35));g.lineWidth=.04;g.stroke();
  g.strokeStyle=cptLG(R,-.25,0,.25,0,[[0,cptF(R,'#e0a838')],[.5,cptF(R,'#fff4c0')],[1,cptF(R,'#e0a838')]]);g.lineWidth=.016;g.stroke();g.strokeStyle=cptF(R,cnA('#fff',.8));g.lineWidth=.005;g.stroke();g.restore();
}

/* ------------------------------------ hair ------------------------------------ */
function cptHairFill(R,y0,y1){const D=R.D;return cptLG(R,R.ls*.12,y0,-R.ls*.12,y1,[[0,D.hcHi],[.3,D.hc],[1,D.hcLo]]);}
function cptCapPath(R,o){
  const g=R.g,A=R.A,v=o.vol,hl=o.hl,sb=o.sb,part=o.part,wF=A.wF,wN=A.wN;
  g.beginPath();g.moveTo(-wF-v*.7,sb);g.lineTo(-wF-v,-.035);
  if(o.flat){const ft=A.yt-v-.006,cr=.055;g.lineTo(-wF-v,ft+cr+.05);g.quadraticCurveTo(-wF-v,ft,-wF-v+cr,ft);g.lineTo(wN+v-cr,ft);g.quadraticCurveTo(wN+v,ft,wN+v,ft+cr+.05);g.lineTo(wN+v,-.035);}   // flat-top: square shoulders at the temples
  else{g.bezierCurveTo(-wF-v,-.15,-(wF+v)*.58,A.yt-v,0,A.yt-v);g.bezierCurveTo((wN+v)*.58,A.yt-v,wN+v,-.15,wN+v,-.035);}
  g.lineTo(wN+v*.7,sb);
  g.lineTo(wN-.012,sb);g.bezierCurveTo(wN-.006,-.1,wN*.84,hl[0]+.02,wN*.56,hl[0]);g.bezierCurveTo(wN*.3,hl[0]-.012,part+.06,hl[1]+.006,part,hl[1]);g.bezierCurveTo(part-.05,hl[1]-.002,-wF*.4,hl[2]-.006,-wF*.64,hl[2]);g.bezierCurveTo(-wF*.88,hl[2]+.01,-wF+.002,-.1,-wF+.006,-.075);g.lineTo(-wF+.006,sb);g.closePath();
}
function cptHairStrands(R,o,n,a){
  if(R.lod>.8)n=Math.ceil(n*.4);const g=R.g,D=R.D,A=R.A,L=[],H=[];
  for(let i=0;i<n;i++){const k=(i+.5)/n,ph=Math.PI*k,w=k<.5?A.wN:A.wF,bx=Math.cos(ph)*(w+o.vol)*(.7+.3*cptRn(D,i,80)),by=-.06-Math.sin(ph)*(.19+o.vol);
    const sx=o.part+(cptRn(D,i,81)-.5)*.05,sy=o.hl[1]+.002,ox=bx*1.05,oy=by-.012;(i%3?L:H).push([sx,sy,(sx+ox)/2+bx*.12,(sy+oy)/2-.03,ox,oy]);}
  cptStrokes(R,L,D.hcLo,.55*a,Math.max(.003,R.px*.8));cptStrokes(R,H,D.hcHi,.5*a,Math.max(.003,R.px*.8));
}
function cptHairCap(R,o,tex){
  const g=R.g,D=R.D,path=()=>cptCapPath(R,o);
  cptCast(R,path,.016,.32);cptCast(R,path,.032,.14);
  path();g.fillStyle=o.fill||cptHairFill(R,-.3,-.05);g.fill();
  g.save();path();g.clip();
  if(tex!==false)cptHairStrands(R,o,16,1);
  if(!R.sil){g.globalCompositeOperation='lighter';g.fillStyle=cptRG(R,R.ls*.07,-.2,0,.17,[[0,cnA(D.hcHi,.34)],[1,cnA(D.hcHi,0)]]);g.fillRect(-.3,-.35,.6,.35);}
  g.restore();
  if(!o.noEdge){cptOutline(R,path,D.hcLo,.6,.003);cptRimLights(R,path,-R.A.wF,R.A.yt-o.vol,R.A.wN,o.sb,.011);}
}
/* an extra hair mass laid over the cap (quiff, fringe): cast shadow, fill, strands, outline on the outer edge only */
function cptHairLobe(R,path,y0,y1,strands,edge){
  const g=R.g,D=R.D;cptCast(R,path,.014,.28);path();g.fillStyle=cptHairFill(R,y0,y1);g.fill();
  g.save();path();g.clip();if(strands)cptStrokes(R,strands,D.hcHi,.5,Math.max(.003,R.px*.8));
  if(!R.sil){g.globalCompositeOperation='lighter';g.fillStyle=cptRG(R,R.ls*.06,(y0+y1)/2-.02,0,.13,[[0,cnA(D.hcHi,.3)],[1,cnA(D.hcHi,0)]]);g.fillRect(-.3,y0-.1,.6,y1-y0+.2);}
  g.restore();if(edge)cptOutline(R,edge,D.hcLo,.6,.003);
}
/* swept-up front lock */
function cptQuiff(R){
  const g=R.g,A=R.A,wN=A.wN,wF=A.wF,path=()=>{g.beginPath();g.moveTo(-wF*.62,-.226);g.bezierCurveTo(-wF*.42,-.318,wN*.28,-.352,wN*.98,-.252);g.bezierCurveTo(wN*1.08,-.214,wN*.98,-.176,wN*.8,-.184);g.bezierCurveTo(wN*.6,-.246,-wF*.05,-.262,-wF*.62,-.226);g.closePath();};
  const edge=()=>{g.beginPath();g.moveTo(-wF*.62,-.226);g.bezierCurveTo(-wF*.42,-.318,wN*.28,-.352,wN*.98,-.252);g.bezierCurveTo(wN*1.08,-.214,wN*.98,-.176,wN*.8,-.184);};
  cptHairLobe(R,path,-.35,-.19,[[-wF*.4,-.245,-.0,-.31,wN*.55,-.3],[-wF*.2,-.25,.03,-.3,wN*.8,-.24],[-wF*.5,-.235,-.05,-.27,wN*.35,-.285]],edge);
}
/* a fringe: bangs falling over the forehead, jagged lower edge, longer toward the far side */
function cptFringe(R,yLow){
  const g=R.g,A=R.A,D=R.D,N=7,pts=[];
  for(let i=0;i<=N;i++){const k=i/N,x=A.wN*.98-(A.wN*.98+A.wF*.98)*k,y=yLow+.012*k+(i%2?.016:-.004)+(cptRn(D,i,87)-.5)*.008;pts.push([x,y]);}
  const path=()=>{g.beginPath();g.moveTo(-.1,-.215);g.lineTo(.1,-.215);g.lineTo(pts[0][0],pts[0][1]-.04);for(const p of pts)g.lineTo(p[0],p[1]);g.lineTo(-A.wF*.98,pts[N][1]-.05);g.closePath();};
  const edge=()=>{g.beginPath();g.moveTo(pts[0][0],pts[0][1]-.04);for(const p of pts)g.lineTo(p[0],p[1]);};
  g.save();cptHeadPath(R);g.clip();
  cptHairLobe(R,path,-.22,yLow,pts.filter((p,i)=>i%2===0).map(p=>[p[0]*.7,-.2,(p[0]*.7+p[0])/2,(-.2+p[1])/2,p[0],p[1]-.006]),edge);g.restore();
}
/* four more short cuts (curls, tousled spikes, slicked pompadour on shaved sides, flat-top), so the commonest style no longer makes twins */
function cptHairCurls(R){
  const g=R.g,D=R.D,A=R.A,N=12,P=[];
  for(let i=0;i<N;i++){const th=Math.PI*(i+.5)/N,c=Math.cos(th),sn=Math.sin(th);P.push({x:c*((c<0?A.wF:A.wN)+.024),y:-.06-sn*.222,r:.034+.014*cptRn(D,i,88)});}
  const lobe=()=>{g.beginPath();for(const p of P){g.moveTo(p.x+p.r,p.y);g.arc(p.x,p.y,p.r,0,TAU);}};
  cptCast(R,lobe,.016,.3);
  for(const p of P){cptDot(g,p.x,p.y,p.r);g.fillStyle=cptHairFill(R,-.3,-.05);g.fill();g.strokeStyle=cptF(R,cnA(D.hcLo,.62));g.lineWidth=Math.max(.0032,R.px*.9);g.stroke();}
  cptHairCap(R,{vol:.028,hl:[-.135,-.19,-.145],part:-.02,sb:.004,noEdge:1},false);
  if(!R.sil){g.save();g.lineCap='round';for(let i=0;i<N;i++){const p=P[i];g.strokeStyle=cnA(D.hcHi,.5);g.lineWidth=Math.max(.0032,R.px*.8);g.beginPath();g.arc(p.x,p.y,p.r*.62,Math.PI*(1.05+.2*R.ls),Math.PI*(1.55+.2*R.ls));g.stroke();g.strokeStyle=cnA(D.hcLo,.4);g.beginPath();g.arc(p.x,p.y,p.r*.4,.3,1.7);g.stroke();}g.restore();}
  cptRimLights(R,lobe,-A.wF-.05,-.3,A.wN+.05,-.02,.0045);
}
function cptHairTousle(R){
  const g=R.g,D=R.D,A=R.A,N=8;cptHairCap(R,{vol:.012,hl:[-.135,-.19,-.15],part:-.05,sb:.006});
  for(let i=0;i<N;i++){const th=Math.PI*(.1+.8*(i+.5)/N),c=Math.cos(th),sn=Math.sin(th),w=(c<0?A.wF:A.wN)*.97,bx=c*w,by=-.06-sn*.2,L=.028+.034*cptRn(D,i,89),tw=(cptRn(D,i,90)-.5)*.5,ang=Math.atan2(-sn*.8,c)+tw,nx=Math.cos(ang),ny=Math.sin(ang),tx=-ny,ty=nx,bw=.04+.012*cptRn(D,i,93);
    const tipx=bx+nx*L,tipy=by+ny*L,b0=[bx-tx*bw,by-ty*bw],b1=[bx+tx*bw,by+ty*bw],sp=()=>{g.beginPath();g.moveTo(b0[0],b0[1]);g.quadraticCurveTo(bx-tx*bw*.4+nx*L*.7,by-ty*bw*.4+ny*L*.7,tipx,tipy);g.quadraticCurveTo(bx+tx*bw*.4+nx*L*.7,by+ty*bw*.4+ny*L*.7,b1[0],b1[1]);};
    sp();g.closePath();g.fillStyle=cptHairFill(R,-.3,-.05);g.fill();sp();g.strokeStyle=cptF(R,cnA(D.hcLo,.7));g.lineWidth=Math.max(.0033,R.px*.9);g.stroke();
    if(!R.sil){g.strokeStyle=cnA(D.hcHi,.45);g.lineWidth=.0028;g.beginPath();g.moveTo(bx+tx*bw*.2,by+ty*bw*.2);g.lineTo(tipx-nx*.004,tipy-ny*.004);g.stroke();}}
}
function cptHairPomp(R){
  const g=R.g,A=R.A,wN=A.wN,wF=A.wF;cptHairCap(R,{vol:.006,hl:[-.17,-.205,-.175],part:0,sb:-.07});
  const path=()=>{g.beginPath();g.moveTo(-wF*.95,-.175);g.bezierCurveTo(-wF*1.02,-.27,-wF*.45,-.345,wN*.1,-.33);g.bezierCurveTo(wN*.7,-.32,wN*1.08,-.27,wN*1.0,-.18);g.bezierCurveTo(wN*.8,-.215,wN*.4,-.245,0,-.24);g.bezierCurveTo(-wF*.4,-.238,-wF*.8,-.19,-wF*.95,-.175);g.closePath();};
  const edge=()=>{g.beginPath();g.moveTo(-wF*.95,-.175);g.bezierCurveTo(-wF*1.02,-.27,-wF*.45,-.345,wN*.1,-.33);g.bezierCurveTo(wN*.7,-.32,wN*1.08,-.27,wN*1.0,-.18);};
  cptHairLobe(R,path,-.34,-.2,[[-wF*.85,-.2,-wF*.5,-.3,wN*.1,-.325],[-wF*.6,-.21,-wF*.2,-.28,wN*.5,-.31],[-wF*.3,-.22,.0,-.27,wN*.85,-.27],[wN*.1,-.235,wN*.5,-.25,wN*.92,-.22]],edge);
}
function cptHairFlat(R){
  const g=R.g,D=R.D,o={vol:.02,hl:[-.15,-.2,-.16],part:0,sb:-.01,flat:1};cptHairCap(R,o,false);
  if(R.sil)return;g.save();cptCapPath(R,o);g.clip();g.strokeStyle=cnA(D.hcLo,.45);g.lineWidth=.0026;g.beginPath();for(let i=0;i<46;i++){const x=-.2+.4*((i*.618)%1),y=-.31+.14*cptRn(D,i,91);g.moveTo(x,y);g.lineTo(x+.004,y+.02);}g.stroke();
  g.strokeStyle=cnA(D.hcHi,.4);g.beginPath();for(let i=0;i<30;i++){const x=-.18+.36*((i*.382+.1)%1),y=-.31+.1*cptRn(D,i,92);g.moveTo(x,y);g.lineTo(x+.003,y+.016);}g.stroke();g.restore();
}
function cptHairShort(R,o){
  const D=R.D,v=D.hv%4;
  if(o)return cptHairCap(R,Object.assign({vol:.018,hl:[-.135,-.19,-.15],part:-.06,sb:.006},o));
  if(D.sv>=4){const w=D.sv-4;return w===0?cptHairCurls(R):w===1?cptHairTousle(R):w===2?cptHairPomp(R):cptHairFlat(R);}
  if(v===1)return cptHairCap(R,{vol:.007,hl:[-.17,-.218,-.185],part:0,sb:-.02});
  cptHairCap(R,v===3?{vol:.02,hl:[-.12,-.18,-.135],part:-.03,sb:.008}:{vol:.018,hl:[-.135,-.19,-.15],part:-.06,sb:.006});
  if(v===2)cptQuiff(R);else if(v===3)cptFringe(R,-.112);
}
function cptHairShaved(R){const D=R.D,v=D.hv%3,o={vol:v===1?.012:.003,hl:v===2?[-.19,-.215,-.19]:[-.17,-.2,-.17],part:0,sb:-.065,fill:null};const k0=[.05,.0,.12][v],k1=[.4,.3,.46][v];o.fill=cptLG(R,0,-.27,0,-.1,[[0,cnMix(D.hc,D.skin,k0)],[1,cnMix(D.hc,D.skin,k1)]]);   // stubble: the hair colour shows through the scalp
  cptHairCap(R,o,false);const g=R.g;g.save();cptCapPath(R,o);g.clip();g.fillStyle=cptF(R,cnA(D.hcLo,.2));for(let i=0;i<40;i++){cptDot(g,(cptRn(D,i,82)-.5)*.34,-.27+cptRn(D,i,83)*.2,.0016);g.fill();}g.restore();}
function cptHairBald(R){
  const g=R.g,D=R.D,A=R.A;if(R.sil)return;g.save();cptHeadPath(R);g.clip();
  g.fillStyle=cptRG(R,R.ls*.07,-.2,0,.12,[[0,cnA('#fff',.32)],[1,cnA('#fff',0)]]);g.fillRect(-.3,-.35,.6,.3);
  g.fillStyle=cptLG(R,0,-.26,0,-.15,[[0,cnA(D.skDp,.2)],[1,cnA(D.skDp,0)]]);g.fillRect(-.3,-.3,.6,.15);g.restore();
  if(D.old){for(const s of[-1,1]){const w=s>0?A.wN:A.wF,tuft=()=>{g.beginPath();g.moveTo(s*(w-.006),-.062);g.bezierCurveTo(s*(w+.014),-.066,s*(w+.02),-.01,s*(w+.004),.03);g.bezierCurveTo(s*(w-.004),.02,s*(w-.012),-.03,s*(w-.014),-.056);g.closePath();};
    tuft();g.fillStyle=cptHairFill(R,-.08,.04);g.fill();g.strokeStyle=cptF(R,cnA(D.hcLo,.4));g.lineWidth=.0026;g.stroke();g.save();tuft();g.clip();cptStrokes(R,[[s*(w+.002),-.055,s*(w+.016),-.01,s*(w+.0),.026],[s*(w-.008),-.05,s*(w+.002),-.005,s*(w-.008),.02]],D.hcHi,.5,.0026);g.restore();}}
}
const cptLongK=D=>[1,1.3,.78][D.hv%3];   // length of long hair: shoulder / chest / bob
function cptHairLongBack(R){
  const g=R.g,D=R.D,A=R.A;
  const lk=cptLongK(D);for(const s of[1,-1]){const far=s<0,w=far?A.wF:A.wN,sp=(far?.095:.07)*(lk>1.1?1.1:lk<.9?.8:1),L=(far?.3:.27)*lk,nw=R.nw;
    const p=()=>{g.beginPath();g.moveTo(s*(w-.02),-.2);g.bezierCurveTo(s*(w+sp*.9),-.17,s*(w+sp),-.0,s*(w+sp*1.1),.12);g.bezierCurveTo(s*(w+sp*1.2),.2,s*(w+sp*.8),L,s*(w+.012),L+.02);g.bezierCurveTo(s*(w*.7),L-.01,s*nw*1.7,.2,s*(w-.02),.0);g.closePath();};
    p();g.fillStyle=cptLG(R,0,-.2,0,L,[[0,D.hcMd],[.6,D.hcLo],[1,cnShade(D.hc,-.7)]]);g.fill();
    g.save();p();g.clip();cptStrokes(R,[[s*(w+sp*.5),-.1,s*(w+sp*.9),.05,s*(w+sp*.5),.28],[s*(w+sp*.2),-.05,s*(w+sp*.4),.12,s*(w+sp*.1),.28]],D.hcHi,.4,.005);g.restore();
    cptOutline(R,p,D.hcLo,.5,.003);}
  g.beginPath();g.moveTo(-A.wF-.05,.0);g.bezierCurveTo(-A.wF-.062,-.2,-.12,-.292,.0,-.292);g.bezierCurveTo(.12,-.292,A.wN+.05,-.2,A.wN+.045,.0);g.closePath();g.fillStyle=cptF(R,D.hcLo);g.fill();
}
function cptHairLongFront(R){
  const g=R.g,D=R.D,A=R.A,lk=cptLongK(D);cptHairCap(R,{vol:.02,hl:[-.115,-.195,-.14],part:-.035,sb:.012});if(D.hv%3===2)cptFringe(R,-.118);
  for(const s of[1,-1]){const far=s<0,w=far?A.wF:A.wN,L=(far?.275:.26)*lk;
    const p=()=>{g.beginPath();g.moveTo(s*(w-.004),-.11);g.bezierCurveTo(s*(w+.03),-.06,s*(w+.036),.1,s*(w+.03),.18);g.bezierCurveTo(s*(w+.028),.23,s*(w*.8),L,s*(w*.62),L+.015);g.bezierCurveTo(s*(w*.58),.2,s*(w*.8),.06,s*(w-.03),-.04);g.bezierCurveTo(s*(w-.045),-.07,s*(w-.03),-.1,s*(w-.004),-.11);g.closePath();};
    p();g.fillStyle=cptHairFill(R,-.1,.25);g.fill();g.save();p();g.clip();cptStrokes(R,[[s*(w+.02),-.05,s*(w+.03),.1,s*(w*.9),.24],[s*(w-.005),-.03,s*(w+.0),.12,s*(w*.75),.25]],D.hcHi,.5,.004);cptStrokes(R,[[s*(w+.025),.0,s*(w+.034),.12,s*w,.25]],D.hcLo,.5,.004);g.restore();
    cptOutline(R,p,D.hcLo,.5,.003);}
}
function cptHairCrest(R){
  const g=R.g,D=R.D,A=R.A,o={vol:.004,hl:[-.165,-.2,-.17],part:0,sb:-.07};
  o.fill=cptLG(R,0,-.27,0,-.1,[[0,cnMix(D.hc,D.skin,.5)],[1,cnMix(D.hc,D.skin,.72)]]);cptHairCap(R,o,false);
  const N=5+D.hv%4,sp=[];
  for(let i=0;i<N;i++){const k=i/(N-1),rx=.085-.26*k,w=rx>0?A.wN:A.wF,ry=-.06-.19*Math.sqrt(Math.max(0,1-Math.pow(rx/(w+.004),2)))+.012,a=.02+.62*k,L=(.075+.085*Math.sin(Math.PI*(.12+.76*k)))*(.9+.2*cptRn(D,i,85));
    sp.push({rx,ry,tx:rx-Math.sin(a)*L,ty:ry-Math.cos(a)*L,w:.06-.012*k,bend:.022+.02*k});}
  g.beginPath();g.moveTo(sp[0].rx+.03,sp[0].ry+.02);for(const s of sp)g.lineTo(s.rx,s.ry-.012);g.lineTo(sp[N-1].rx-.03,sp[N-1].ry+.02);g.lineTo(sp[N-1].rx,sp[N-1].ry+.03);g.lineTo(sp[0].rx+.02,sp[0].ry+.035);g.closePath();g.fillStyle=cptF(R,D.hcLo);g.fill();
  for(let i=N-1;i>=0;i--){const s=sp[i],b0=[s.rx-s.w/2,s.ry+.012],b1=[s.rx+s.w/2,s.ry+.012];
    const path=()=>{g.beginPath();g.moveTo(b0[0],b0[1]);g.quadraticCurveTo(b0[0]+(s.tx-b0[0])*.4-s.bend,(b0[1]+s.ty)*.5+.01,s.tx,s.ty);g.quadraticCurveTo(b1[0]+(s.tx-b1[0])*.5-s.bend*.2,(b1[1]+s.ty)*.5-.01,b1[0],b1[1]);g.closePath();};
    path();g.fillStyle=cptLG(R,s.rx,s.ry,s.tx,s.ty,[[0,D.hcLo],[.5,D.hc],[1,i%2?D.hcHi:D.hc]]);g.fill();g.strokeStyle=cptF(R,cnA(D.hcLo,.8));g.lineWidth=Math.max(.0035,R.px*.9);g.stroke();
    if(!R.sil){g.save();path();g.clip();g.strokeStyle=cnA(D.hcHi,.55);g.lineWidth=.004;g.beginPath();g.moveTo(s.rx+s.w*.12,s.ry);g.quadraticCurveTo((s.rx+s.tx)/2-s.bend*.5,(s.ry+s.ty)/2,s.tx+.004,s.ty+.012);g.stroke();g.restore();}}
}
function cptHairBun(R){cptHairCap(R,{vol:.01,hl:[-.15,-.208,-.15],part:0,sb:-.035});}
function cptBunBack(R){
  const g=R.g,D=R.D,A=R.A,side=D.hv%2===1,bx=side?-A.wF-.045:-.045,by=side?-.085:-.292,r=side?.058:.058;
  if(!side){   // the gathered hair that leads up to the knot (behind the cap, so the join reads as hair, not as a ball on a stick)
    g.beginPath();g.moveTo(bx-.052,-.236);g.bezierCurveTo(bx-.034,-.27,bx-.03,by+.03,bx-.02,by+.02);g.lineTo(bx+.02,by+.02);g.bezierCurveTo(bx+.03,by+.03,bx+.05,-.27,bx+.07,-.236);g.closePath();
    g.fillStyle=cptLG(R,0,-.3,0,-.23,[[0,D.hcMd],[1,D.hc]]);g.fill();}
  g.fillStyle=cptRG(R,bx+R.ls*.02,by-.02,0,r*1.2,[[0,D.hcHi],[.5,D.hc],[1,D.hcLo]]);cptDot(g,bx,by,r);g.fill();g.strokeStyle=cptF(R,cnA(D.hcLo,.7));g.lineWidth=.003;g.stroke();
  g.save();cptDot(g,bx,by,r);g.clip();cptStrokes(R,[[bx-r,by-.01,bx,by-r*1.1,bx+r,by+.01],[bx-r*.9,by+.02,bx,by-r*.5,bx+r*.9,by+.03],[bx-r*.6,by+.05,bx,by+.0,bx+r*.6,by+.05]],D.hcLo,.5,.003);g.restore();
  g.fillStyle=cptF(R,D.tr);g.beginPath();if(side)g.ellipse(bx+r*.62,by,r*.2,r*.9,.2,0,TAU);else g.ellipse(bx,by+r*.78,r*.78,r*.14,0,0,TAU);g.fill();g.strokeStyle=cptF(R,D.trLo);g.lineWidth=.003;g.stroke();
}
function cptBraidBack(R){
  const g=R.g,D=R.D,A=R.A,N=13,sd=D.hv%2?1:-1,W=sd>0?A.wN:A.wF,x0=sd*W*.8,y0=-.09;
  const pt=k=>({x:cptQ(k,x0,sd*(W+.085),sd*(W+.06)),y:cptQ(k,y0,.12,.36)});
  for(let i=N-1;i>=0;i--){const k=i/(N-1),p=pt(k),p2=pt(Math.min(1,k+.04)),a=Math.atan2(p2.y-p.y,p2.x-p.x)||1.5,w=.034*(1-.4*k)+.004,l=.05,sd=i%2?1:-1;
    g.save();g.translate(p.x,p.y);g.rotate(a-Math.PI/2);g.translate(sd*w*.34,0);g.rotate(sd*-.5);
    cptEll(g,0,0,w*.62,l*.62,0);g.fillStyle=cptLG(R,-w*.6,0,w*.6,0,[[0,sd>0?D.hcMd:D.hcHi],[.6,D.hc],[1,D.hcLo]]);g.fill();g.strokeStyle=cptF(R,cnA(D.hcLo,.9));g.lineWidth=Math.max(.0032,R.px*.8);g.stroke();
    if(!R.sil){g.strokeStyle=cnA(D.hcHi,.55);g.lineWidth=.0028;g.beginPath();g.moveTo(0,-l*.4);g.lineTo(0,l*.4);g.stroke();}g.restore();}
  const e=pt(1);g.fillStyle=cptF(R,D.tr);g.beginPath();g.ellipse(e.x,e.y+.012,.025,.011,0,0,TAU);g.fill();g.strokeStyle=cptF(R,D.trLo);g.lineWidth=.003;g.stroke();
  g.fillStyle=cptF(R,D.hcMd);g.beginPath();g.moveTo(e.x-.02,e.y+.016);g.quadraticCurveTo(e.x,e.y+.06,e.x-.004,e.y+.085);g.quadraticCurveTo(e.x+.012,e.y+.05,e.x+.022,e.y+.016);g.closePath();g.fill();
}
function cptManeBack(R){
  const g=R.g,D=R.D,A=R.A,N=13;
  for(let pass=0;pass<2;pass++)for(let i=0;i<N;i++){const k=(i+(pass?.5:0))/(N-1),th=Math.PI*(1.1-k*1.2),c=Math.cos(th),sn=Math.sin(th),wr=(c<0?A.wF:A.wN)*.9,bx=c*wr,by=-.05-sn*.2;
    const nx=c,ny=-sn,tx=sn,ty=c,L=(.16+.13*cptRn(D,i+pass*20,86))*(pass?.7:1)*(1+.3*sn),droop=.12*Math.pow(1-sn,1.5)*(pass?.7:1),w=.085;
    const ex=bx+nx*L*.9,ey=by+ny*L*.9+droop,mx=bx+nx*L*.5,my=by+ny*L*.5+droop*.3;
    g.beginPath();g.moveTo(bx-tx*w*.5,by-ty*w*.5);g.quadraticCurveTo(mx-tx*w*.66,my-ty*w*.66,ex,ey);g.quadraticCurveTo(mx+tx*w*.66,my+ty*w*.66,bx+tx*w*.5,by+ty*w*.5);g.closePath();
    g.fillStyle=cptLG(R,bx,by,ex,ey,[[0,pass?D.hcMd:D.hcLo],[.55,pass?D.hc:D.hcMd],[1,pass?D.hcHi:D.hc]]);g.fill();g.strokeStyle=cptF(R,cnA(D.hcLo,.65));g.lineWidth=Math.max(.0032,R.px*.8);g.stroke();
    if(!R.sil&&pass){g.strokeStyle=cnA(D.hcHi,.5);g.lineWidth=.003;g.beginPath();g.moveTo(bx+nx*.02,by+ny*.02);g.quadraticCurveTo(mx,my,ex-nx*.02,ey-ny*.02-.0);g.stroke();}}
}
function cptManeFront(R){
  const g=R.g,D=R.D,A=R.A;cptHairCap(R,{vol:.03,hl:[-.14,-.205,-.15],part:-.02,sb:.02});
  for(const s of[1,-1]){const far=s<0,w=far?A.wF:A.wN;
    for(let i=0;i<3;i++){const y=-.05+i*.06,L=.07+.03*i+(far?.015:0);g.beginPath();g.moveTo(s*(w-.012),y-.05);g.bezierCurveTo(s*(w+.04),y-.04,s*(w+.07+L*.3),y+.02,s*(w+.03),y+L+.04);g.bezierCurveTo(s*(w+.02),y+L*.6,s*(w-.01),y+.04,s*(w-.03),y+.0);g.closePath();
      g.fillStyle=cptLG(R,s*w,y-.05,s*(w+.05),y+L,[[0,D.hcHi],[.6,D.hc],[1,D.hcLo]]);g.fill();g.strokeStyle=cptF(R,cnA(D.hcLo,.6));g.lineWidth=Math.max(.003,R.px*.8);g.stroke();}}
  for(let i=0;i<5;i++){const x=-.06+i*.05;g.beginPath();g.moveTo(x-.022,-.185+(i%2)*.004);g.lineTo(x+.002,-.145-(i%3)*.01);g.lineTo(x+.026,-.188);g.closePath();g.fillStyle=cptF(R,i%2?D.hc:D.hcHi);g.fill();}
}
/* hood: the lining + back behind the head, the cowl band in front of it */
function cptHoodOuter(R,g,keep){const A=R.A;if(!keep)g.beginPath();g.moveTo(-A.wF-.075,.2);g.bezierCurveTo(-A.wF-.12,.0,-A.wF-.1,-.28,-.1,-.372);g.bezierCurveTo(-.04,-.4,.04,-.405,.11,-.37);g.bezierCurveTo(A.wN+.11,-.28,A.wN+.12,.0,A.wN+.08,.2);g.lineTo(A.wN+.07,.31);g.bezierCurveTo(A.wN*.5,.34,-A.wF*.5,.34,-A.wF-.07,.31);g.closePath();}
function cptHoodOpen(R,g,keep){const A=R.A,j=R.jd;if(!keep)g.beginPath();g.moveTo(-A.wF-.02,-.02);g.bezierCurveTo(-A.wF-.025,-.2,-A.wF*.55,-.282,.0,-.286);g.bezierCurveTo(A.wN*.6,-.282,A.wN+.018,-.2,A.wN+.018,-.03);g.bezierCurveTo(A.wN+.022,.09,A.wN*.7,.26+j,.01,.28+j);g.bezierCurveTo(-A.wF*.7,.26+j,-A.wF-.025,.09,-A.wF-.02,-.02);g.closePath();}
function cptHoodBack(R){
  const g=R.g,D=R.D;cptHoodOuter(R,g);g.fillStyle=cptLG(R,0,-.4,0,.3,[[0,cnShade(D.acLo,.1)],[1,cnShade(D.acLo,-.5)]]);g.fill();
}
function cptHoodFront(R){
  const g=R.g,D=R.D,A=R.A,band=()=>{cptHoodOuter(R,g);cptHoodOpen(R,g,true);};
  g.save();g.beginPath();g.rect(-.5,-.5,1,1);g.clip();   // soft shadow of the rim onto the face
  g.save();cptHeadPath(R);g.clip();if(!R.sil){g.fillStyle=cptLG(R,0,-.26,0,.27,[[0,cnA(D.skDp,.58)],[.5,cnA(D.skDp,.18)],[1,cnA(D.skDp,.04)]]);g.fillRect(-.3,-.3,.6,.6);g.fillStyle=cptRG(R,CPT_FS,-.02,.12,.27,[[0,cnA(D.skDp,0)],[1,cnA(D.skDp,.36)]]);g.fillRect(-.3,-.3,.6,.6);}g.restore();g.restore();
  band();g.fillStyle=cptLG(R,R.ls*.3,-.35,-R.ls*.3,.1,[[0,D.acHi],[.45,D.ac],[1,D.acLo]]);g.fill('evenodd');
  g.save();band();g.clip('evenodd');
  g.strokeStyle=cptF(R,cnA(D.acLo,.55));g.lineWidth=.006;g.beginPath();for(let i=0;i<5;i++){const a=-2.5+i*.45;g.moveTo(Math.cos(a)*.31,-.02+Math.sin(a)*.34);g.quadraticCurveTo(Math.cos(a)*.26,-.02+Math.sin(a)*.29,Math.cos(a)*.215,-.02+Math.sin(a)*.245);}g.stroke();
  g.strokeStyle=cptF(R,cnA(D.acHi2,.35));g.lineWidth=.005;g.beginPath();g.moveTo(-.22,-.2);g.quadraticCurveTo(-.02,-.37,.2,-.25);g.stroke();
  g.restore();
  g.beginPath();g.moveTo(-A.wF-.02,-.02);g.bezierCurveTo(-A.wF-.025,-.2,-A.wF*.55,-.282,.0,-.286);g.bezierCurveTo(A.wN*.6,-.282,A.wN+.018,-.2,A.wN+.018,-.03);g.strokeStyle=cptF(R,cnA(D.acHi2,.5));g.lineWidth=Math.max(.004,R.px*1.1);g.stroke();
  const hp=()=>{cptHoodOuter(R,g);};cptOutline(R,hp,D.acLo,.6,.0035);cptRimLights(R,hp,-.3,-.4,.3,.3,.012);
  /* a few strands of hair at the brow when the hood is the hair style */
  if(D.hairStyle!=='bald'&&D.hairStyle!=='hood'&&0){}
}
function cptCrownDraw(R){
  const g=R.g,D=R.D,A=R.A,yb=D.hood?-.205:-.208,bow=.012,th=.04,xl=-A.wF*.97,xr=A.wN*.97,N=5,pts=[];
  const bandTop=x=>yb-th*.5+bow*(1-Math.pow(x/((x<0?A.wF:A.wN)*.97),2));
  const gold=D.gold,gl=cptLG(R,R.ls*.2,0,-R.ls*.2,0,[[0,D.trHi],[.35,gold],[1,cnShade(gold,-.55)]]);
  g.save();
  const cp=()=>{g.beginPath();g.moveTo(xl,yb-th*.5+.0);
    for(let i=0;i<N;i++){const k=i/(N-1),x=xl+(xr-xl)*k,h=.05+.05*Math.sin(Math.PI*(.1+.8*k)),hw=(xr-xl)/(N-1)*.34,bt=bandTop(x);const xa=x-hw,xb=x+hw;
      if(i===0)g.lineTo(xa,bandTop(xa)+0);else g.lineTo(xa,bandTop(xa));g.lineTo(x,bt-h);g.lineTo(xb,bandTop(xb));if(i<N-1){const xn=xl+(xr-xl)*(i+.5)/(N-1);g.quadraticCurveTo(xn,bandTop(xn)+.012,xl+(xr-xl)*(i+1)/(N-1)-hw,bandTop(xl+(xr-xl)*(i+1)/(N-1)-hw));}}
    g.lineTo(xr,yb+th*.5);g.quadraticCurveTo(0,yb+th*.5+bow*1.9,xl,yb+th*.5);g.closePath();};
  cptCast(R,cp,.02,.3);
  cp();g.fillStyle=gl;g.fill();g.strokeStyle=cptF(R,cnShade(gold,-.6));g.lineWidth=Math.max(.0042,R.px*1.1);g.stroke();
  g.save();cp();g.clip();g.strokeStyle=cptF(R,cnA('#fff',.5));g.lineWidth=.004;g.beginPath();g.moveTo(xl,yb-th*.3+bow*.3);g.quadraticCurveTo(0,yb-th*.3+bow*1.2,xr,yb-th*.3+bow*.3);g.stroke();
  g.strokeStyle=cptF(R,cnA(cnShade(gold,-.6),.5));g.lineWidth=.003;g.beginPath();g.moveTo(xl,yb+th*.2);g.quadraticCurveTo(0,yb+th*.2+bow*1.7,xr,yb+th*.2);g.stroke();g.restore();
  const gems=[[0,D.ec],[-.62,D.tr],[.62,D.tr]];for(const [f,c] of gems){const x=(f<0?A.wF:A.wN)*f*.95*(f?1:0)*(f<0?-1/ -1:1);}
  for(const f of[-.6,0,.6]){const x=f*(f<0?A.wF:A.wN),y=yb+bow*(1-f*f)*.9+.004,r=f?.0095:.0135;g.fillStyle=cptRG(R,x-.003,y-.003,0,r*1.2,[[0,'#ffffff'],[.35,D.ecHi],[1,D.ecLo]]);cptDot(g,x,y,r);g.fill();g.strokeStyle=cptF(R,cnShade(gold,-.6));g.lineWidth=.003;g.stroke();}
  const rimp=cp;cptRimLights(R,rimp,xl,yb-.12,xr,yb+th,.008);g.restore();
}
/* hair front dispatch */
function cptHairFront(R){
  const D=R.D,hd=D.hood;
  if(hd){if(D.hairStyle==='bald'||D.hairStyle==='shaved'){}else cptHairCap(R,{vol:.012,hl:[-.13,-.186,-.15],part:-.05,sb:-.01},true);return;}
  switch(D.hairStyle){case'short':cptHairShort(R);break;case'shaved':cptHairShaved(R);break;case'bald':cptHairBald(R);break;case'long':cptHairLongFront(R);break;case'crest':cptHairCrest(R);break;
    case'braid':cptHairCap(R,{vol:.012,hl:[-.15,-.212,-.15],part:0,sb:-.04});break;case'bun':cptHairBun(R);break;case'mane':cptManeFront(R);break;default:cptHairShort(R);}
}
function cptHairBack(R){
  const D=R.D;if(D.hood){cptHoodBack(R);return;}
  switch(D.hairStyle){case'long':cptHairLongBack(R);break;case'mane':cptManeBack(R);break;case'braid':cptBraidBack(R);break;case'bun':cptBunBack(R);break;}
}

/* ------------------------------------ layer cache ------------------------------------
   Static layers (everything behind the head, the skin, the hair / hood / crown overlay, whole silhouettes and shadows) are painted once into an offscreen
   canvas and blitted. A cache key contains EVERYTHING the layer depends on (look, expression, quantised lighting, jaw bucket, resolution bucket), a layer is
   always rendered before it is blitted, and nothing time-dependent is drawn into one, so a frame is identical whether the cache was warm or cold. */
const cptLC=new Map();let cptLPx=0;
function cptLayer(key,ux0,uy0,uw,uh,res,build){
  let e=cptLC.get(key);if(e){cptLC.delete(key);cptLC.set(key,e);return e;}
  const w=Math.max(4,Math.ceil(uw*res)),h=Math.max(4,Math.ceil(uh*res)),cv=document.createElement('canvas');cv.width=w;cv.height=h;
  const c=cv.getContext('2d');c.setTransform(res,0,0,res,-ux0*res,-uy0*res);c.lineJoin='round';c.lineCap='round';build(c,w,h);
  e={cv,ux0,uy0,uw:w/res,uh:h/res,px:w*h};cptLC.set(key,e);cptLPx+=e.px;
  while((cptLC.size>900||cptLPx>24e6)&&cptLC.size>1){const k=cptLC.keys().next().value,o=cptLC.get(k);cptLC.delete(k);cptLPx-=o.px;}
  return e;
}
const cptSub=(R,c,x)=>Object.assign({},R,{g:c,lights:[],blink:0,tk:0,t:0,br:null},x||{});
const cptBlit=(R,e)=>R.g.drawImage(e.cv,e.ux0,e.uy0,e.uw,e.uh);

/* what sits behind the head: halo, torso, back hair / hood lining, neck, torso front pieces (figure space) */
function cptBodyDraw(R){
  if(R.D.marks.includes('halo')&&!R.sil)cptHalo(R);
  cptTorso(R,0);cptHeadXf(R,()=>cptHairBack(R));cptNeck(R);cptTorso(R,1);
  if(!R.sil){const g=R.g,cy=R.D.hy+(.232+(R.D.dch||0)+.05)*R.D.hs*R.D.hyk;   // the chin's shadow on the neck, collar and chest: source-atop = only where the body already has pixels, so it can never fog the background
    g.save();g.globalCompositeOperation='source-atop';g.fillStyle=cptRG(R,0,cy+.02,.02,.18,[[0,cptF(R,'rgba(0,0,0,.4)')],[1,cptF(R,'rgba(0,0,0,0)')]]);cptEll(g,0,cy+.035,.2,.09,0);g.fill();g.restore();}
}
function cptLayerBody(R){
  const D=R.D,key='B|'+D.kid+'|'+R.mode+'|'+Math.round(R.tilt*100)+'|'+R.lkey+'|'+R.res+'|'+R.B;
  cptBlit(R,cptLayer(key,-D.hw,D.bodyY0,2*D.hw,R.B-D.bodyY0,R.res,c=>cptBodyDraw(cptSub(R,c))));
}
/* skin: chin shadow on the neck, ears, skull + shading, nose, wrinkles, head outline + rim (head-local space) */
function cptFaceDraw(R){
  const g=R.g,D=R.D,A=R.A;
  cptEars(R);cptFaceBase(R);
  if(!R.sil){g.save();cptHeadPath(R);g.clip();cptNose(R);cptWrinkles(R);g.restore();}
  const hp=()=>cptHeadPath(R);cptOutline(R,hp,D.skDp,.5,.003);cptRimLights(R,hp,-A.wF,A.yt,A.wN,A.cy,.011);
}
function cptLayerFace(R){
  const key='F|'+R.D.kid+'|'+R.mode+'|'+R.expr+'|'+R.openQ+'|'+R.lkey+'|'+R.res;
  cptBlit(R,cptLayer(key,-.27,-.27,.54,.64,R.res*CPT_HS,c=>cptFaceDraw(cptSub(R,c,{gap:R.gapQ,open:R.openQ}))));
}
/* static marks, hair, hood rim, crown (head-local space, drawn after the moving features) */
function cptHairDraw(R){
  const g=R.g,D=R.D;
  if(!R.sil){g.save();cptHeadPath(R);g.clip();cptMarksFace(R);g.restore();}
  cptHairFront(R);if(D.hood)cptHoodFront(R);if(D.crown)cptCrownDraw(R);
}
function cptLayerHair(R){
  const D=R.D,key='H|'+D.kid+'|'+R.mode+'|'+R.lkey+'|'+R.res;
  const hr=D.hrect;cptBlit(R,cptLayer(key,hr[0],hr[1],hr[2],hr[3],R.res*CPT_HS,c=>cptHairDraw(cptSub(R,c,{jd:0,A:cptCalcA(D,0),gap:0,open:0}))));
}
/* eyes + brows (by blink bucket) and mouth (by opening bucket): small layers, so the lip-sync and the blink cost a blit, not 150 path ops */
function cptEyesDraw(R,eyesOn){if(eyesOn)for(const e of R.eye)cptEye(R,e);cptBrows(R);}
function cptLayerEyes(R,eyesOn){
  const bq=Math.round(R.blink*8)/8,key='E|'+R.D.kid+'|'+R.mode+'|'+R.expr+'|'+(eyesOn?bq:'x')+'|'+R.lkey+'|'+R.res;
  cptBlit(R,cptLayer(key,-.22,-.17,.5,.27,R.res*CPT_HS,c=>cptEyesDraw(cptSub(R,c,{blink:bq}),eyesOn)));
}
function cptLayerMouth(R){
  const oq=Math.round(R.open*16)/16,key='M|'+R.D.kid+'|'+R.mode+'|'+R.expr+'|'+oq+'|'+R.lkey+'|'+R.res;
  cptBlit(R,cptLayer(key,-.13,.08,.3,.22,R.res*CPT_HS,c=>cptMouth(cptSub(R,c,{open:oq,gap:oq*R.gmax}))));
}
/* strongest live point light (explosion, lightning, flare ...): an extra rim pass, drawn live */
function cptLightRim(R){
  let b=null;for(const l of R.lights)if(!b||l.a>b.a)b=l;if(!b)return;
  let vx=b.x*R.W-R.dx,vy=b.y*R.H-R.dy;const d=Math.hypot(vx,vy)||1;vx=vx/d*R.dir;vy/=d;const col=b.col||'#ffd9a0',a=cnC01(b.a)*.85;
  cptRim(R,()=>cptShouldersPath(R,R.sw*1.03,R.yN,R.yS,R.B),-R.sw,R.yS-.04,R.sw,R.B,.011,a,col,vx,vy,()=>cptShouldersEdge(R,R.sw*1.03,R.yN,R.yS,R.B));
  cptHeadXf(R,()=>cptRim(R,()=>cptHeadPath(R),-R.A.wF,R.A.yt,R.A.wN,R.A.cy,.012,a,col,vx,vy));
}
/* one figure on R.g (unit space already set): cached layers + the parts that move */
function cptFigure(R,noEyes){
  const g=R.g,D=R.D,vis=D.marks.includes('visor');
  if(R.br){g.save();cptBrXf(g,R,R.br.b);cptLayerBody(R);g.restore();}else cptLayerBody(R);
  cptHeadXf(R,()=>{
    cptLayerFace(R);
    if(!R.sil){
      cptLayerEyes(R,!noEyes&&!vis);cptLayerMouth(R);
      if(vis||D.marks.includes('mask')){g.save();cptHeadPath(R);g.clip();cptMaskVisor(R);g.restore();}
    }
    cptLayerHair(R);
  });
  if(R.lights.length&&R.mode==='bust')cptLightRim(R);
}

/* ------------------------------------ special modes ------------------------------------ */
function cptCrescent(E,src,ox,oy,col,wpx){   // E = the part of `src` within wpx of its edge that faces the light (-ox,-oy = shift away from the light)
  const e=E.getContext('2d');e.setTransform(1,0,0,1,0,0);e.globalAlpha=1;e.globalCompositeOperation='copy';e.drawImage(src,0,0);
  e.globalCompositeOperation='destination-out';e.drawImage(src,-ox*wpx,-oy*wpx);e.globalCompositeOperation='source-in';e.fillStyle=col;e.fillRect(0,0,E.width,E.height);e.globalCompositeOperation='source-over';
}
function cptScratchSetup(c,w,h,res,mir,D){c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.globalCompositeOperation='source-over';c.clearRect(0,0,w,h);c.setTransform(mir*res,0,0,res,D.hw*res,-D.by0*res);c.lineJoin='round';c.lineCap='round';}
/* rim-lit black: parts are painted black, then a crescent of the light colour along every edge that faces the key (torso, then head over it) */
function cptSilBuild(R,c,w,h){
  const D=R.D,res=R.res,A=cnScratch('cptA',w,h),a=A.getContext('2d'),B=cnScratch('cptB',w,h),b=B.getContext('2d'),E=cnScratch('cptE',w,h);
  const ll=Math.hypot(R.lx,R.ly)||1,ox=R.lx/ll,oy=R.ly/ll;
  const rim=(src,dst)=>{for(const[wd,al]of[[.05,.26],[.017,1]]){cptCrescent(E,src,ox,oy,cnA(R.rimCol,Math.min(1,al*(R.rimA+.1))),wd*res);dst.setTransform(1,0,0,1,0,0);dst.globalAlpha=1;dst.globalCompositeOperation='source-over';dst.drawImage(E,0,0);}};
  cptScratchSetup(a,w,h,res,1,D);const Q=cptSub(R,a);cptBodyDraw(Q);rim(A,a);
  cptScratchSetup(b,w,h,res,1,D);const Q2=cptSub(R,b);cptHeadXf(Q2,()=>{cptFaceDraw(Q2);cptHairDraw(Q2);});rim(B,b);
  a.setTransform(1,0,0,1,0,0);a.globalCompositeOperation='source-over';a.drawImage(B,0,0);
  a.globalCompositeOperation='source-atop';a.fillStyle=cnLG(a,w*(.5+ox*.45),h*(.5+oy*.45),w*(.5-ox*.45),h*(.5-oy*.45),[[0,'rgba(70,90,130,.34)'],[1,'rgba(0,0,0,0)']]);a.fillRect(0,0,w,h);a.globalCompositeOperation='source-over';
  if(D.marks.includes('halo')){c.save();cptHalo(cptSub(R,c,{P:null,sil:false}));c.restore();}
  c.setTransform(1,0,0,1,0,0);c.drawImage(A,0,0);
}
/* hidden in the dark: the dark figure is nearly swallowed by a gradient, a faint rim and a cheekbone / brow glint remain; the eyes are live lights */
function cptShdBuild(R,c,w,h){
  const res=R.res,A=cnScratch('cptA',w,h),a=A.getContext('2d'),E=cnScratch('cptE',w,h);
  const ll=Math.hypot(R.lx,R.ly)||1,ox=R.lx/ll,oy=R.ly/ll;
  cptScratchSetup(a,w,h,res,1,R.D);const Q=cptSub(R,a,{gap:0,open:0});cptFigure(Q,true);
  a.setTransform(1,0,0,1,0,0);a.globalCompositeOperation='source-atop';
  a.fillStyle=cnLG(a,w*(.5+ox*.5),h*(.5+oy*.5),w*(.5-ox*.5),h*(.5-oy*.5),[[0,'rgba(2,3,8,.4)'],[.5,'rgba(2,3,8,.82)'],[1,'rgba(2,3,8,.95)']]);a.fillRect(0,0,w,h);a.globalCompositeOperation='source-over';
  cptCrescent(E,A,ox,oy,cnA(R.rimCol,.55),.014*res);a.drawImage(E,0,0);
  a.setTransform(res,0,0,res,R.D.hw*res,-R.D.by0*res);const Q2=cptSub(R,a);cptHeadXf(Q2,()=>{
    a.save();cptHeadPath(Q2);a.clip();a.globalCompositeOperation='lighter';a.strokeStyle=cnA(R.rimCol,.2);a.lineWidth=.007;a.lineCap='round';
    a.beginPath();a.moveTo(R.ls*.03,-.078);a.quadraticCurveTo(R.ls*.1,-.092,R.ls*.155,-.06);a.moveTo(R.ls*.06,.05);a.quadraticCurveTo(R.ls*.115,.044,R.ls*.16,.016);a.stroke();a.restore();});
  c.setTransform(1,0,0,1,0,0);c.drawImage(A,0,0);
}
let cptScanC=null;
function cptSpecial(R,g,cx,cy,h){
  const D=R.D,res=R.res;
  if(R.sil||R.shd){
    const key=(R.sil?'S|':'W|')+D.kid+'|'+(R.sil?Math.round(R.tilt*100):R.expr)+'|'+R.lkey+'|'+res+'|'+R.B;
    const e=cptLayer(key,-D.hw,D.by0,2*D.hw,R.B-D.by0,res,R.sil?(c,w,hh)=>cptSilBuild(R,c,w,hh):(c,w,hh)=>cptShdBuild(R,c,w,hh));
    g.save();g.translate(cx,cy);g.scale(R.dir*h,h);g.lineJoin='round';g.lineCap='round';
    g.save();if(R.br)cptBrXf(g,R,R.br.b);g.drawImage(e.cv,e.ux0,e.uy0,e.uw,e.uh);g.restore();
    if(R.shd){R.g=g;cptHeadXf(R,()=>{for(const q of R.eye)cptEye(R,q,true);});}
    g.restore();return;
  }
  /* hologram: the colour-mapped figure (cached layers) + moving features in a scratch canvas, then scanlines, a sweep band, flicker, jitter and an edge glow */
  const Wp=Math.ceil(2*D.hw*res),Hp=Math.ceil((R.B-D.by0)*res),A=cnScratch('cptA',Wp,Hp),a=A.getContext('2d'),t=R.t;
  cptScratchSetup(a,Wp,Hp,res,R.dir,D);R.g=a;cptFigure(R);
  a.setTransform(1,0,0,1,0,0);
  const sp=Math.max(1.5,res/150),per=sp*2,off=(t*14*sp)%per;
  if(!cptScanC||cptScanC.h!==per){const cv=document.createElement('canvas');cv.width=1;cv.height=Math.max(2,Math.round(per));const q=cv.getContext('2d');q.fillStyle='#000';q.fillRect(0,0,1,Math.max(1,Math.round(per/2)));cptScanC=cv;cv.h=per;}
  a.globalCompositeOperation='destination-out';a.save();a.translate(0,off-per);a.globalAlpha=.55;a.fillStyle=a.createPattern(cptScanC,'repeat');a.fillRect(0,0,Wp,Hp+per);a.restore();
  a.globalCompositeOperation='source-atop';a.fillStyle=cnLG(a,0,0,0,Hp,[[0,'rgba(120,250,255,.46)'],[1,'rgba(30,150,200,.22)']]);a.fillRect(0,0,Wp,Hp);a.globalCompositeOperation='lighter';a.drawImage(A,0,0);a.globalCompositeOperation='source-atop';
  const sy=((t*.35)%1.4-.2)*Hp;a.fillStyle=cnLG(a,0,sy-Hp*.08,0,sy+Hp*.02,[[0,'rgba(190,255,255,0)'],[.8,'rgba(190,255,255,.32)'],[1,'rgba(255,255,255,0)']]);a.fillRect(0,sy-Hp*.08,Wp,Hp*.1);a.globalCompositeOperation='source-over';
  const fl=.8+.2*cnFlicker(t,D.seed,14)+(cnHash(Math.floor(t*9),D.seed,3)<.07?-.3:0),jit=cnHash(Math.floor(t*14),D.seed,5)<.1?(cnHash(Math.floor(t*14),D.seed,6)-.5)*.05*h:0;
  const bx=cx-D.hw*h,by=cy+D.by0*h,bw=Wp/res*h,bh=Hp/res*h;
  const gw=Math.max(8,Math.ceil(Wp/9)),gh=Math.max(8,Math.ceil(Hp/9)),G=cnScratch('cptG',gw,gh),gc=G.getContext('2d');       // soft edge glow: a 1/9 size copy blown back up behind the figure
  gc.setTransform(1,0,0,1,0,0);gc.globalAlpha=1;gc.globalCompositeOperation='copy';gc.imageSmoothingEnabled=true;gc.drawImage(A,0,0,gw,gh);
  a.globalCompositeOperation='destination-over';a.globalAlpha=.7;a.drawImage(G,-Wp*.045,-Hp*.03,Wp*1.09,Hp*1.06);a.globalAlpha=1;a.globalCompositeOperation='source-over';
  g.save();g.globalAlpha=fl;g.drawImage(A,bx+jit,by,bw,bh);g.restore();
  if(jit){g.save();g.globalAlpha=.3;g.globalCompositeOperation='lighter';g.drawImage(A,bx-jit*1.5,by,bw,bh);g.restore();}
  R.g=g;
}

/* ------------------------------------ the painter ------------------------------------ */
PORTRAIT_PAINT.actor=function cptActor(g,id,st,cx,cy,h,o){
  o=o||{};st=st||{};if(!(h>0)||!g)return;
  const D=cptResolve(id),mode=st.mode==='silhouette'||st.mode==='shadow'||st.mode==='hologram'?st.mode:'bust',dir=st.face==='l'?-1:1;
  const R=cptMakeR(g,D,st,o,cx,cy,h,dir,mode,mode==='hologram'?.55:1);R.br=cptBreath(R);
  g.save();
  try{
    if(mode==='bust'){g.translate(cx,cy);g.scale(dir*h,h);g.lineJoin='round';g.lineCap='round';cptFigure(R);}
    else cptSpecial(R,g,cx,cy,h);
  }finally{g.restore();}
};
})();
