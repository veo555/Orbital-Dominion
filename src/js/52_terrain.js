/* =========================================================================
   ART (3/3) — terrain bake: height-aware ground, cliffs with cast shadows,
   boulders, ramps, landing pads, creep-camp ground, trails and battle decals
   ========================================================================= */
const MM=224; // minimap backing size
/* The ground bake is split in two so it can be repeated cheaply at other resolutions:
     terrainSetup()  the expensive, scale-independent part (noise + a quarter-resolution ground-colour map), run once per map
     terrainPaint()  a generator that draws every layer onto ANY context in world coordinates and yields between layers;
                     run to completion it produces the 1x base map, run onto a scaled + clipped context it produces a sharp tile.
   It consumes the same seeded random stream every time, so a tile is pixel-consistent with the base map. */
function terrainSetup(){
  const seed=G.seed,nA=makeNoise(mulberry32(seed+99)),nB=makeNoise(mulberry32(seed+313));
  const H=G.H,TT=G.TT,RAMP=G.RAMP;
  const tt=(x,y)=>x<0||y<0||x>=MW||y>=MH?3:TT[y*MW+x];
  /* occlusion map: how close to rocks / void a tile is */
  const occ=new Float32Array(NN);
  for(let y=0;y<MH;y++)for(let x=0;x<MW;x++){let s=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const t=tt(x+dx,y+dy);if(t===1||t===3)s+=(dx&&dy)?0.7:1;}occ[y*MW+x]=Math.min(1,s/4.5);}
  /* 1) per-pixel ground colour at quarter resolution, upscaled smoothly */
  const LS=4,LW=WW/LS,LH=WH/LS,lc=mkCanvas(LW,LH),lg2=lc.getContext('2d'),img=lg2.createImageData(LW,LH),d=img.data;
  const PAL=[[[132,102,72],[166,130,92]],[[104,98,96],[140,128,118]],[[78,96,120],[112,134,160]]];
  const hAt=(fx,fy)=>{const x0=Math.floor(fx),y0=Math.floor(fy),tx=fx-x0,ty=fy-y0,hc=H[clamp(Math.round(fy),0,MH-1)*MW+clamp(Math.round(fx),0,MW-1)];let s=0;
    for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){let v=H[clamp(y0+dy,0,MH-1)*MW+clamp(x0+dx,0,MW-1)];if(Math.abs(v-hc)>0.99)v=hc;s+=v*(dx?tx:1-tx)*(dy?ty:1-ty);}return s;};
  const oAt=(fx,fy)=>{const x0=Math.floor(fx),y0=Math.floor(fy),tx=fx-x0,ty=fy-y0;let s=0;
    for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++)s+=occ[clamp(y0+dy,0,MH-1)*MW+clamp(x0+dx,0,MW-1)]*(dx?tx:1-tx)*(dy?ty:1-ty);return s;};
  for(let py=0;py<LH;py++)for(let px=0;px<LW;px++){
    const fx=(px*LS+LS/2)/TILE-0.5,fy=(py*LS+LS/2)/TILE-0.5,ti=clamp(Math.round(fy),0,MH-1)*MW+clamp(Math.round(fx),0,MW-1),o=(py*LW+px)*4;
    if(TT[ti]===3){const n=nB(fx*.5,fy*.5);d[o]=10+n*14;d[o+1]=12+n*12;d[o+2]=26+n*24;d[o+3]=255;continue;}
    const hs=hAt(fx,fy),lv=clamp(Math.floor(hs),0,1),fr=hs-lv,pa=PAL[Math.min(2,lv)],pb=PAL[Math.min(2,lv+1)];
    const n1=nA(fx*.06,fy*.06),n2=nB(fx*.28+7,fy*.28+3),n3=nB(fx*1.3,fy*1.3),t=clamp(n1*0.75+n2*0.35,0,1);
    let r=lerp(lerp(pa[0][0],pa[1][0],t),lerp(pb[0][0],pb[1][0],t),fr),gg=lerp(lerp(pa[0][1],pa[1][1],t),lerp(pb[0][1],pb[1][1],t),fr),b=lerp(lerp(pa[0][2],pa[1][2],t),lerp(pb[0][2],pb[1][2],t),fr);
    const gr=(n3-0.5)*16;r+=gr;gg+=gr;b+=gr;
    /* macro variation: two very low-frequency fields shift the ground between warm dust and cool stone and breathe the brightness,
       so no region of the map looks like a copy of another (period ~ 90 tiles; the 128-cell noise table wraps far beyond the map) */
    const m1=nA(fx*.021+31,fy*.021+11)-.5,m2=nB(fx*.045+5,fy*.045+77)-.5;
    r*=1+m1*.30+m2*.08;gg*=1+m1*.10+m2*.12;b*=1-m1*.22+m2*.06;
    let sh=1-0.30*oAt(fx,fy);
    if(RAMP[ti]){const xi=ti%MW,yi=(ti/MW)|0,ax=Math.abs(H[yi*MW+Math.min(MW-1,xi+1)]-H[yi*MW+Math.max(0,xi-1)]),ay=Math.abs(H[Math.min(MH-1,yi+1)*MW+xi]-H[Math.max(0,yi-1)*MW+xi]);
      sh*=1.06+0.06*Math.sin((ax>=ay?fx:fy)*TAU*1.6);}
    d[o]=clamp(r*sh,0,255);d[o+1]=clamp(gg*sh,0,255);d[o+2]=clamp(b*sh,0,255);d[o+3]=255;
  }
  lg2.putImageData(img,0,0);
  return{seed,nA,nB,H,TT,RAMP,tt,occ,lc};
}
function* terrainPaint(g,T){
  const{seed,nA,nB,H,TT,RAMP,tt,lc}=T,R=mulberry32(seed*31+5);
  g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';g.drawImage(lc,0,0,WW,WH);
  g.lineJoin='round';g.lineCap='round';
  const T2P=(x,y)=>[x*TILE,y*TILE];
  yield 1;

  yield 2;
  /* 2) trails along the main lanes */
  const trail=(pts,w,col)=>{g.strokeStyle=col;g.lineWidth=w;g.beginPath();pts.forEach((p,i)=>{const[x,y]=T2P(p[0]+.5,p[1]+.5);i?g.lineTo(x,y):g.moveTo(x,y);});g.stroke();};
  for(const pl of CORRIDORS){const m=pl.map(p=>[MW-1-p[0],MH-1-p[1]]);
    for(const pts of[pl,m]){trail(pts,92,'rgba(255,236,200,.05)');trail(pts,56,'rgba(255,236,200,.06)');trail(pts,22,'rgba(0,0,0,.05)');}}

  yield 3;
  /* 3) ground details: speckles, cracks, craters, dune ripples, plateau panel seams */
  const onFloor=(x,y)=>{const t=tt(x/TILE|0,y/TILE|0);return t===0;};
  for(let i=0;i<9000;i++){const x=R()*WW,y=R()*WH;if(!onFloor(x,y))continue;
    g.fillStyle=R()<0.5?'rgba(0,0,0,0.14)':'rgba(255,238,210,0.09)';g.beginPath();g.ellipse(x,y,.8+R()*2.6,.6+R()*1.6,R()*3,0,TAU);g.fill();}
  for(let i=0;i<260;i++){const x=R()*WW,y=R()*WH;if(!onFloor(x,y)||H[tileOf(x,y)]>0)continue;
    g.strokeStyle='rgba(255,236,205,.07)';g.lineWidth=1.6;const L=24+R()*60,a=R()*0.5-0.25;
    g.beginPath();g.moveTo(x-L/2,y);g.quadraticCurveTo(x,y-8+R()*16,x+L/2,y+a*40);g.stroke();
    g.strokeStyle='rgba(0,0,0,.07)';g.beginPath();g.moveTo(x-L/2,y+3);g.quadraticCurveTo(x,y-5+R()*16,x+L/2,y+a*40+3);g.stroke();}
  for(let i=0;i<150;i++){const x=R()*WW,y=R()*WH;if(!onFloor(x,y))continue;const rad=7+R()*15;
    g.strokeStyle='rgba(0,0,0,.20)';g.lineWidth=2.2;g.beginPath();g.ellipse(x,y,rad,rad*.7,0,0,TAU);g.stroke();
    g.fillStyle='rgba(0,0,0,.06)';g.fill();
    g.strokeStyle='rgba(255,236,205,.10)';g.lineWidth=1.6;g.beginPath();g.ellipse(x,y+1.6,rad,rad*.7,0,.2,Math.PI);g.stroke();}
  for(let i=0;i<140;i++){const x=R()*WW,y=R()*WH;if(!onFloor(x,y))continue;const h=H[tileOf(x,y)];if(h>0)continue;
    const hue=R()<.5?'rgba(120,255,214,':'rgba(190,150,255,';g.fillStyle=hue+'.55)';const s=2+R()*3;g.beginPath();g.moveTo(x,y-s*2);g.lineTo(x+s,y);g.lineTo(x,y+s*.8);g.lineTo(x-s,y);g.closePath();g.fill();
    g.fillStyle=hue+'.12)';g.beginPath();g.arc(x,y,s*4,0,TAU);g.fill();}
  for(let y=0;y<MH;y+=2)for(let x=0;x<MW;x+=2){ // plateau plates: each 2x2-tile plate gets its own tint, seams only on some edges and only faintly (a regular grid read as tiling)
    if(tt(x,y)!==0||H[y*MW+x]<1||RAMP[y*MW+x])continue;
    const hi=H[y*MW+x]>=2,r1=R(),r2=R(),r3=R(),X=x*TILE,Y=y*TILE,S2=TILE*2;
    g.fillStyle=r1<.5?'rgba(255,255,255,'+(.012+r2*.05).toFixed(3)+')':'rgba(0,6,20,'+(.012+r2*.06).toFixed(3)+')';g.fillRect(X,Y,S2,S2);
    if(r3>.38){g.strokeStyle=hi?'rgba(10,20,40,.11)':'rgba(0,0,0,.055)';g.lineWidth=1;g.strokeRect(X+.5,Y+.5,S2,S2);
      g.strokeStyle=hi?'rgba(190,225,255,.07)':'rgba(255,255,255,.03)';g.beginPath();g.moveTo(X+1.5,Y+S2+1.5);g.lineTo(X+1.5,Y+1.5);g.lineTo(X+S2+1,Y+1.5);g.stroke();}
    if(hi&&r2<.12){g.fillStyle='rgba(120,200,255,.12)';g.fillRect(X+8,Y+8,S2-16,3);}}

  yield 4;
  /* 4) landing pads, resource fields, camp grounds, plazas */
  for(const s of G.sites){const x=s.cx*TILE,y=s.cy*TILE,own=s.owner>=0?G.teams[s.owner].pal:NEUTRAL_COL,mainS=s.main;
    const rad=(mainS?6.4:5.6)*TILE;
    g.fillStyle=rgr(g,x,y,rad*.2,rad,mainS?'rgba(120,170,220,.20)':'rgba(120,150,190,.12)','rgba(120,170,220,0)');g.beginPath();g.arc(x,y,rad,0,TAU);g.fill();
    g.strokeStyle=own.glow;g.globalAlpha=mainS?.28:.16;g.lineWidth=2;for(const k of[.62,.8,1]){g.beginPath();g.arc(x,y,rad*k*.9,0,TAU);g.stroke();}
    g.setLineDash([10,12]);g.beginPath();g.arc(x,y,rad*.7,0,TAU);g.stroke();g.setLineDash([]);
    for(let i=0;i<24;i++){const a=i/24*TAU;g.beginPath();g.moveTo(x+Math.cos(a)*rad*.9,y+Math.sin(a)*rad*.9);g.lineTo(x+Math.cos(a)*rad*(i%3?.95:1.02),y+Math.sin(a)*rad*(i%3?.95:1.02));g.stroke();}
    g.globalAlpha=1;}
  for(const r of G.res){if(r.type==='crystal'){g.fillStyle=rgr(g,r.x,r.y,2,34,'rgba(40,24,8,.28)','rgba(40,24,8,0)');g.beginPath();g.arc(r.x,r.y,34,0,TAU);g.fill();
      g.fillStyle=rgr(g,r.x,r.y,2,30,'rgba(255,200,90,.10)','rgba(255,200,90,0)');g.beginPath();g.arc(r.x,r.y,30,0,TAU);g.fill();}
    else{g.fillStyle=rgr(g,r.x,r.y,6,46,'rgba(10,4,24,.5)','rgba(10,4,24,0)');g.beginPath();g.arc(r.x,r.y,46,0,TAU);g.fill();}}
  const bones=(x,y,rad)=>{for(let i=0;i<9;i++){const a=R()*TAU,rr2=rad*(.35+R()*.6),bx=x+Math.cos(a)*rr2,by=y+Math.sin(a)*rr2,L=6+R()*8,ba=R()*TAU;
      g.strokeStyle='rgba(235,226,205,.55)';g.lineWidth=2.4;g.beginPath();g.moveTo(bx-Math.cos(ba)*L/2,by-Math.sin(ba)*L/2);g.lineTo(bx+Math.cos(ba)*L/2,by+Math.sin(ba)*L/2);g.stroke();
      g.fillStyle='rgba(235,226,205,.55)';g.beginPath();g.arc(bx+Math.cos(ba)*L/2,by+Math.sin(ba)*L/2,2,0,TAU);g.fill();}};
  for(const cp of G.camps){const rad=(cp.lvl>=3?5.2:3.6)*TILE;
    g.fillStyle=rgr(g,cp.x,cp.y,8,rad,'rgba(25,10,24,.55)','rgba(25,10,24,0)');g.beginPath();g.arc(cp.x,cp.y,rad,0,TAU);g.fill();
    g.strokeStyle='rgba(120,40,60,.35)';g.lineWidth=2.5;g.setLineDash([6,8]);g.beginPath();g.arc(cp.x,cp.y,rad*.82,0,TAU);g.stroke();g.setLineDash([]);bones(cp.x,cp.y,rad);}
  for(const n of G.neutrals){const x=n.x,y=n.y;
    if(n.type==='tower'){g.fillStyle='rgba(30,28,50,.35)';g.beginPath();g.arc(x,y,54,0,TAU);g.fill();g.strokeStyle='rgba(190,170,255,.25)';g.lineWidth=2;for(const k of[44,56]){g.beginPath();g.arc(x,y,k,0,TAU);g.stroke();}}
    else{rr(g,x-52,y-52,104,104,12,'rgba(70,50,24,.35)');g.strokeStyle='rgba(255,220,150,.14)';g.lineWidth=1.5;for(let i=-3;i<=3;i++){g.beginPath();g.moveTo(x-52,y+i*14);g.lineTo(x+52,y+i*14);g.stroke();}}}

  yield 5;
  /* 5) cliffs: cast shadows on the lower ground, then the rock faces */
  const D4=[[1,0],[-1,0],[0,1],[0,-1]];
  for(let y=0;y<MH;y++)for(let x=0;x<MW;x++){if(TT[y*MW+x]!==2)continue;const hi=H[y*MW+x];
    for(const[dx,dy]of D4){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=MW||ny>=MH)continue;const ni=ny*MW+nx;if(TT[ni]!==0||H[ni]>hi-0.99)continue;
      const bx=nx*TILE,by=ny*TILE,strong=(dx>0||dy>0)?0.50:0.26,L=TILE*(strong>.4?1.15:.8);let q;
      if(dx>0)q=g.createLinearGradient(bx,0,bx+L,0);else if(dx<0)q=g.createLinearGradient(bx+TILE,0,bx+TILE-L,0);else if(dy>0)q=g.createLinearGradient(0,by,0,by+L);else q=g.createLinearGradient(0,by+TILE,0,by+TILE-L);
      q.addColorStop(0,'rgba(8,10,22,'+strong+')');q.addColorStop(1,'rgba(8,10,22,0)');g.fillStyle=q;g.fillRect(bx,by,TILE,TILE);}}
  for(let y=0;y<MH;y++)for(let x=0;x<MW;x++){if(TT[y*MW+x]!==2)continue;const hi=H[y*MW+x];let vx=0,vy=0;
    for(const[dx,dy]of D4){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=MW||ny>=MH)continue;if(H[ny*MW+nx]<=hi-0.99){vx+=dx;vy+=dy;}}
    if(!vx&&!vy)continue;const L=Math.hypot(vx,vy);vx/=L;vy/=L;const cx=x*TILE+TILE/2,cy=y*TILE+TILE/2;
    const q=g.createLinearGradient(cx-vx*TILE*.62,cy-vy*TILE*.62,cx+vx*TILE*.62,cy+vy*TILE*.62);
    const tone=hi>=2?['#a9b9d2','#6f819e','#2b3447']:['#b3aba2','#7a7068','#2e2a2c'];
    q.addColorStop(0,tone[0]);q.addColorStop(.35,tone[1]);q.addColorStop(1,tone[2]);g.fillStyle=q;g.fillRect(x*TILE,y*TILE,TILE,TILE);
    g.strokeStyle='rgba(10,12,24,.30)';g.lineWidth=1.2;const px=-vy,py=vx;
    for(let k=0;k<4;k++){const o=(R()-.5)*TILE*.9,l0=-.2+R()*.4,l1=.35+R()*.45;g.beginPath();g.moveTo(cx+px*o+vx*TILE*l0,cy+py*o+vy*TILE*l0);g.lineTo(cx+px*o+vx*TILE*l1+ (R()-.5)*4,cy+py*o+vy*TILE*l1+(R()-.5)*4);g.stroke();}
    g.strokeStyle='rgba(255,255,255,.22)';g.lineWidth=1.4;g.beginPath();
    if(Math.abs(vx)>=Math.abs(vy)){const ex=vx>0?x*TILE+1:x*TILE+TILE-1;g.moveTo(ex,y*TILE);g.lineTo(ex,y*TILE+TILE);}else{const ey=vy>0?y*TILE+1:y*TILE+TILE-1;g.moveTo(x*TILE,ey);g.lineTo(x*TILE+TILE,ey);}g.stroke();}

  yield 6;
  /* 6) boulders: shadow, base, extruded top with rounded outer corners */
  const isR=(x,y)=>tt(x,y)===1;
  for(let y=0;y<MH;y++)for(let x=0;x<MW;x++)if(isR(x,y)){g.fillStyle='rgba(6,8,16,.34)';g.fillRect(x*TILE+3,y*TILE+8,TILE+4,TILE+2);}
  for(let y=0;y<MH;y++)for(let x=0;x<MW;x++)if(isR(x,y)){g.fillStyle='hsl(228,14%,'+(13+nA(x*.3,y*.3)*6).toFixed(1)+'%)';g.fillRect(x*TILE,y*TILE,TILE,TILE);}
  const cr=(a,b,cc)=>(!isR(a[0],a[1])&&!isR(b[0],b[1]))?11:(isR(cc[0],cc[1])?0:2);
  for(let y=0;y<MH;y++)for(let x=0;x<MW;x++)if(isR(x,y)){
    const n=nA(x*.3+9,y*.3+4),m=nB(x*1.1,y*1.1),X=x*TILE,Y=y*TILE-9,
      r0=cr([x-1,y],[x,y-1],[x-1,y-1]),r1=cr([x+1,y],[x,y-1],[x+1,y-1]),r2=cr([x+1,y],[x,y+1],[x+1,y+1]),r3=cr([x-1,y],[x,y+1],[x-1,y+1]);
    g.beginPath();g.moveTo(X+r0,Y);g.lineTo(X+TILE-r1,Y);g.arcTo(X+TILE,Y,X+TILE,Y+r1,r1||.01);g.lineTo(X+TILE,Y+TILE-r2);g.arcTo(X+TILE,Y+TILE,X+TILE-r2,Y+TILE,r2||.01);
    g.lineTo(X+r3,Y+TILE);g.arcTo(X,Y+TILE,X,Y+TILE-r3,r3||.01);g.lineTo(X,Y+r0);g.arcTo(X,Y,X+r0,Y,r0||.01);g.closePath();
    const q=g.createLinearGradient(X,Y,X+TILE,Y+TILE);q.addColorStop(0,'hsl(232,12%,'+(36+n*14+m*4).toFixed(1)+'%)');q.addColorStop(1,'hsl(228,14%,'+(20+n*8).toFixed(1)+'%)');g.fillStyle=q;g.fill();
    g.strokeStyle='rgba(5,7,14,.45)';g.lineWidth=1.2;g.stroke();
    if(!isR(x,y-1)){g.fillStyle='rgba(255,255,255,.13)';g.fillRect(X+r0,Y+1,TILE-r0-r1,2);}
    if(!isR(x-1,y)){g.fillStyle='rgba(255,255,255,.06)';g.fillRect(X+1,Y+r0,2,TILE-r0-r3);}
    if(R()<.55){g.strokeStyle='rgba(0,0,0,.28)';g.lineWidth=1.2;g.beginPath();const fx=X+4+R()*(TILE-8),fy=Y+4+R()*(TILE-8);g.moveTo(fx,fy);g.lineTo(fx+(R()-.5)*16,fy+(R()-.5)*16);g.lineTo(fx+(R()-.5)*22,fy+(R()-.5)*22);g.stroke();}
    if(R()<.4){g.fillStyle='rgba(255,255,255,.06)';g.beginPath();g.moveTo(X+4,Y+TILE-4);g.lineTo(X+10+R()*10,Y+4);g.lineTo(X+TILE-4,Y+8+R()*10);g.closePath();g.fill();}
    if(R()<.05){g.fillStyle='rgba(130,255,220,.5)';g.beginPath();g.moveTo(X+16,Y+6);g.lineTo(X+21,Y+18);g.lineTo(X+16,Y+24);g.lineTo(X+11,Y+18);g.closePath();g.fill();}}

  yield 7;
  /* 7) void rim with sparkles and a soft glow where the playable area ends */
  for(let y=0;y<MH;y++)for(let x=0;x<MW;x++){if(TT[y*MW+x]!==3)continue;
    for(let k=0;k<3;k++){g.fillStyle='rgba(190,210,255,'+(0.15+R()*0.5)+')';g.fillRect(x*TILE+R()*TILE,y*TILE+R()*TILE,1+R()*1.4,1+R()*1.4);}}
  for(let y=0;y<MH;y++)for(let x=0;x<MW;x++){if(TT[y*MW+x]===3)continue;
    for(const[dx,dy]of D4){if(tt(x+dx,y+dy)!==3)continue;const bx=x*TILE,by=y*TILE;let q;
      if(dx>0)q=g.createLinearGradient(bx+TILE,0,bx+TILE-14,0);else if(dx<0)q=g.createLinearGradient(bx,0,bx+14,0);else if(dy>0)q=g.createLinearGradient(0,by+TILE,0,by+TILE-14);else q=g.createLinearGradient(0,by,0,by+14);
      q.addColorStop(0,'rgba(120,150,255,.28)');q.addColorStop(1,'rgba(120,150,255,0)');g.fillStyle=q;g.fillRect(bx,by,TILE,TILE);}}

  yield 8;
  /* 8) ramp direction chevrons */
  for(let y=0;y<MH;y++)for(let x=0;x<MW;x++){if(!RAMP[y*MW+x]||(x+y)%3)continue;
    const ax=H[y*MW+Math.min(MW-1,x+1)]-H[y*MW+Math.max(0,x-1)],ay=H[Math.min(MH-1,y+1)*MW+x]-H[Math.max(0,y-1)*MW+x];
    if(Math.abs(ax)<.02&&Math.abs(ay)<.02)continue;const a=Math.atan2(-ay,-ax);const cx=x*TILE+16,cy=y*TILE+16;
    g.save();g.translate(cx,cy);g.rotate(a);g.strokeStyle='rgba(255,255,255,.17)';g.lineWidth=2;g.beginPath();g.moveTo(-4,-6);g.lineTo(3,0);g.lineTo(-4,6);g.stroke();g.restore();}

  yield 9;
}
function buildTerrain(){
  const T=terrainSetup(),c=mkCanvas(WW,WH),g=c.getContext('2d');
  for(const _ of terrainPaint(g,T)){}
  G.tInfo=T;G.terrainCv=c;G.decalAll=[];
  const mb=mkCanvas(MM*2,MM*2),mg=mb.getContext('2d');mg.imageSmoothingEnabled=true;mg.imageSmoothingQuality='high';mg.drawImage(c,0,0,MM*2,MM*2);G.mmBg=mb;
  if(typeof terrainReset==='function')terrainReset();
}
/* battle damage painted straight onto the baked terrain (and replayed onto sharp tiles, see 53_terrain_hd.js) */
function applyDecals(){
  if(!G.terrainCv||!G.decalDirty.length)return;
  const g=G.terrainCv.getContext('2d');
  for(const dd of G.decalDirty){
    if(tileTypeAt(dd.x,dd.y)===2)continue;
    const d={x:dd.x,y:dd.y,r:dd.r,k:dd.k,seed:(G.decalAll.length*2654435761+7)>>>0};
    G.decalAll.push(d);if(G.decalAll.length>500)G.decalAll.shift();   // older ones stay painted in the base map
    paintDecal(g,d);decalToTiles(d);
  }
  G.decalDirty.length=0;
}
function tileTypeAt(x,y){return G.TT[tileOf(x,y)];}
