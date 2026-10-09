/* =========================================================================
   ART (2/3) — buildings, neutral structures, resources, glyphs and icons
   ========================================================================= */
const BTINT={meridian:'#4a6286',obsidian:'#4a3038',aurora:'#2f6068',neutral:'#5b5a68'};
function platform(g,w,h,col,tint){
  rr(g,-w/2,-h/2,w,h,7,'#0b1019');
  rr(g,-w/2+2,-h/2+2,w-4,h-4,6,lgr(g,-w/2,-h/2,w/2,h/2,tint||'#44546e',mix('#10151f',(tint&&tint.length===7?tint:'#44546e'),0.12)),OUT);
  g.strokeStyle='rgba(255,255,255,.13)';g.lineWidth=1;rrp(g,-w/2+4,-h/2+4,w-8,h-8,5);g.stroke();
  g.strokeStyle=col.base;g.globalAlpha=.85;g.lineWidth=1.7;rrp(g,-w/2+7,-h/2+7,w-14,h-14,4);g.stroke();g.globalAlpha=1;
  for(const sx of[-1,1])for(const sy of[-1,1])circ(g,sx*(w/2-4.5),sy*(h/2-4.5),1.5,'#a3b2c9');
}
function octa(r,ry,off){const p=[];for(let i=0;i<8;i++){const a=i/8*TAU+(off||TAU/16);p.push(Math.cos(a)*r,Math.sin(a)*(ry||r));}return p;}
function artBuilding(g,type,w,h,col,f){
  const hw=w/2,hh=h/2,tint=BTINT[f]||BTINT.meridian;
  platform(g,w,h,col,tint);
  switch(type){
    case'hub':{
      if(f==='obsidian'){
        const p=[];for(let i=0;i<16;i++){const a=i/16*TAU,r=i%2?32:57;p.push(Math.cos(a)*r,Math.sin(a)*r);}
        poly(g,p,lgr(g,-50,-50,50,50,'#4d343d','#0f080b'),OUT,1.4);
        circ(g,0,0,30,lgr(g,-20,-20,20,20,'#2c1c22','#0c0608'),OUT);
        for(let i=0;i<8;i++){const a=i/8*TAU+.2;g.strokeStyle=col.glow;g.globalAlpha=.7;g.lineWidth=1.6;g.beginPath();g.moveTo(Math.cos(a)*14,Math.sin(a)*14);g.lineTo(Math.cos(a+.15)*30,Math.sin(a+.15)*30);g.lineTo(Math.cos(a-.1)*48,Math.sin(a-.1)*48);g.stroke();g.globalAlpha=1;}
        g.strokeStyle=col.base;g.lineWidth=2;g.beginPath();g.arc(0,0,32,0,TAU);g.stroke();
        for(const sx of[-1,1])for(const sy of[-1,1]){poly(g,[sx*52,sy*52,sx*52-sx*14,sy*52,sx*52,sy*52-sy*14],lgr(g,0,0,sx*52,sy*52,'#33222a','#0d0709'),OUT);circ(g,sx*49,sy*49,3.5,col.glow);}
        circ(g,0,0,14,rgr(g,0,0,1,14,'#fff4',col.dark),OUT);
      }else if(f==='aurora'){
        circ(g,0,0,54,lgr(g,-40,-40,40,40,'#3d7480','#143036'),OUT,1.3);
        for(let i=0;i<6;i++){const a=i/6*TAU;ell(g,Math.cos(a)*38,Math.sin(a)*38,17,7.5,lgr(g,-8,-8,8,8,col.light,col.dark),OUT,a+Math.PI/2);}
        circ(g,0,0,36,lgr(g,-25,-25,25,25,'#2a5b66','#0e2227'),OUT);
        g.strokeStyle=col.glow;g.globalAlpha=.55;g.lineWidth=1.4;for(const r of[26,31,44]){g.beginPath();g.arc(0,0,r,0,TAU);g.stroke();}g.globalAlpha=1;
        poly(g,[0,-22,19,-11,19,11,0,22,-19,11,-19,-11],lgr(g,-18,-20,18,20,'#e9fff8',col.dark),OUT,1.2);
        poly(g,[0,-22,19,-11,0,0],'rgba(255,255,255,.32)');poly(g,[0,-22,-19,-11,0,0],'rgba(255,255,255,.12)');
        for(const sx of[-1,1])for(const sy of[-1,1]){circ(g,sx*49,sy*49,7,lgr(g,-5,-5,5,5,col.light,col.dark),OUT);circ(g,sx*49,sy*49,2.6,'#fff');}
      }else{
        poly(g,octa(54,54),lgr(g,-50,-50,50,50,'#7b8fae','#26364d'),OUT,1.4);
        poly(g,octa(46,46),lgr(g,-40,-40,40,40,'#53688a','#1e2c42'));
        circ(g,0,0,37,lgr(g,-26,-26,26,26,M3,M0),OUT);
        for(const sx of[-1,1])for(const sy of[-1,1]){circ(g,sx*47,sy*47,11.5,lgr(g,-9,-9,9,9,M3,M0),OUT);circ(g,sx*47,sy*47,6.2,col.base,OUT);circ(g,sx*47,sy*47,2.6,col.light);}
        rr(g,-9,38,18,18,2.4,M0,OUT);rr(g,-6,42,12,12,1.6,col.dark);
        circ(g,0,0,25,lgr(g,-17,-20,17,20,col.light,col.dark),OUT);
        circ(g,0,0,15.5,lgr(g,-10,-12,10,12,'#f1f7ff',col.base),OUT);
        g.strokeStyle='rgba(255,255,255,.4)';g.lineWidth=1;for(let i=0;i<8;i++){const a=i/8*TAU;g.beginPath();g.moveTo(Math.cos(a)*15.5,Math.sin(a)*15.5);g.lineTo(Math.cos(a)*25,Math.sin(a)*25);g.stroke();}
      }
      break;}
    case'generator':
      circ(g,0,0,21,lgr(g,-14,-14,14,14,M2,M0),OUT);
      for(let i=0;i<4;i++){const a=i/4*TAU+TAU/8;rr(g,Math.cos(a)*17-3,Math.sin(a)*17-3,6,6,1.5,col.base,OUT);}
      circ(g,0,0,14,lgr(g,-9,-9,9,9,'#0e1622','#243449'),OUT);
      g.strokeStyle='rgba(120,230,255,.35)';g.lineWidth=1;g.beginPath();g.arc(0,0,11,0,TAU);g.stroke();
      break;
    case'depot':
      circ(g,0,0,20,lgr(g,-14,-14,14,14,M3,M1),OUT);
      for(let i=0;i<12;i++){const a=i/12*TAU;g.beginPath();g.arc(0,0,17,a,a+TAU/24);g.strokeStyle=i%2?'#f2c230':'#1b1b1b';g.lineWidth=3;g.stroke();}
      circ(g,0,0,12.5,lgr(g,-9,-9,9,9,col.light,col.dark),OUT);rr(g,-6,-6,12,12,2,M0,OUT);line(g,-6,0,6,0,col.glow,1.3);line(g,0,-6,0,6,col.glow,1.3);
      for(const [x,y] of[[-19,19],[19,-19]])rr(g,x-5,y-5,10,10,1.5,lgr(g,x-5,y-5,x+5,y+5,'#b98a4a','#6b4a24'),OUT);
      break;
    case'siphon':
      circ(g,0,0,23,lgr(g,-16,-16,16,16,M2,M0),OUT);
      rr(g,-3.5,-24,7,48,2,M1,OUT);rr(g,-24,-3.5,48,7,2,M1,OUT);
      for(const sx of[-1,1])for(const sy of[-1,1]){circ(g,sx*17,sy*17,6.2,lgr(g,-5,-5,5,5,M3,M0),OUT);circ(g,sx*17,sy*17,3,col.base);}
      circ(g,0,0,12,lgr(g,-8,-8,8,8,'#3a2658','#150c26'),OUT);circ(g,0,0,7,'#8a5bff');
      break;
    case'habitat':
      circ(g,0,0,22.5,lgr(g,-16,-16,16,16,'#c5d6ea','#6d83a1'),OUT);
      for(let i=0;i<8;i++){const a=i/8*TAU;line(g,0,0,Math.cos(a)*22,Math.sin(a)*22,'rgba(30,45,70,.35)',1);}
      circ(g,0,0,15,lgr(g,-10,-10,10,10,'rgba(210,240,255,.95)','rgba(110,160,210,.9)'),'rgba(255,255,255,.4)');
      circ(g,-4,-5,5.5,'rgba(255,255,255,.28)');
      for(let i=0;i<8;i++){const a=i/8*TAU+.2;rr(g,Math.cos(a)*18.5-1.8,Math.sin(a)*18.5-1.8,3.6,3.6,.8,'#ffe9a6');}
      for(const [x,y] of[[-24,24],[24,24],[24,-24]])circ(g,x,y,4.4,'#3f8a4a',OUT);
      break;
    case'garrison':
      rr(g,-hw+11,-hh+11,w-22,h-22,4,lgr(g,-hw,-hh,hw,hh,M3,M1),OUT);
      rr(g,-30,-27,60,36,3,lgr(g,-30,-27,30,9,'#566a8a','#27344a'),OUT);
      for(let i=-2;i<=2;i++)line(g,i*11,-27,i*11,9,'rgba(0,0,0,.28)',1.2);
      rr(g,-15,10,30,25,3,'#0b1017',OUT);rr(g,-15,10,30,4.2,1.5,col.base);line(g,0,14,0,35,'rgba(255,255,255,.12)',1);
      for(const sx of[-1,1]){circ(g,sx*(hw-17),-hh+17,9,lgr(g,-7,-7,7,7,M3,M0),OUT);circ(g,sx*(hw-17),-hh+17,4.5,col.base);rr(g,sx*(hw-17)-1,-hh+4,2,8,.6,M4);}
      rr(g,-26,-23,52,5,1.5,col.base);
      break;
    case'armory':
      rr(g,-hw+11,-hh+11,w-22,h-22,4,lgr(g,-hw,-hh,hw,hh,M3,M1),OUT);
      circ(g,0,-3,27,lgr(g,-18,-18,18,18,'#6e84a6','#243248'),OUT);circ(g,0,-3,20,lgr(g,-14,-14,14,14,'#13202f','#2c4057'),OUT);
      for(const sx of[-1,1])for(let i=0;i<3;i++){rr(g,sx*34-3,-26+i*11,6,8,1.4,col.dark,OUT);}
      rr(g,-18,28,36,8,2,M0,OUT);for(let i=0;i<5;i++)rr(g,-15+i*7,29.5,5,5,1,col.base);
      break;
    case'forum':{
      platform(g,w,h,col,'#bdb3a0');
      circ(g,0,0,40,lgr(g,-28,-28,28,28,'#efe6d3','#b3a78f'),OUT);
      for(let i=0;i<10;i++){const a=i/10*TAU;circ(g,Math.cos(a)*35,Math.sin(a)*35,4.2,lgr(g,-3,-3,3,3,'#ffffff','#bdb29a'),OUT);}
      circ(g,0,0,27,lgr(g,-19,-19,19,19,col.light,col.dark),OUT);
      for(let i=0;i<12;i++){const a=i/12*TAU;line(g,0,0,Math.cos(a)*27,Math.sin(a)*27,'rgba(255,255,255,.18)',1);}
      circ(g,0,0,9,lgr(g,-6,-6,6,6,'#fff6d2','#d7a83a'),OUT);
      break;}
    case'exchange':
      rr(g,-hw+11,-hh+11,w-22,h-22,4,lgr(g,-hw,-hh,hw,hh,'#cdb98c','#7a6a48'),OUT);
      for(let i=0;i<8;i++)rr(g,-36+i*9,-32,9,26,0,i%2?col.base:'#f1ede3');
      rr(g,-36,-32,72,26,2,null,OUT);rr(g,-36,-8,72,3,0,'rgba(0,0,0,.25)');
      circ(g,0,12,14,lgr(g,-8,-8,8,8,'#ffe58a','#c68e1d'),OUT);g.fillStyle='#7a560c';g.font='bold 15px system-ui';g.textAlign='center';g.textBaseline='middle';g.fillText('$',0,13);
      for(const [x,y] of[[-30,22],[30,22],[-30,-40]])rr(g,x-6,y-5,12,10,1.5,lgr(g,x-6,y-5,x+6,y+5,'#a97c3e','#5e4020'),OUT);
      circ(g,30,-36,5.5,rgr(g,30,-36,0,6,'#fff',col.glow));
      break;
    case'foundry':
      rr(g,-hw+11,-hh+11,w-22,h-22,4,lgr(g,-hw,-hh,hw,hh,M3,M1),OUT);
      rr(g,-34,-30,28,38,3,lgr(g,-34,-30,-6,8,'#4a5870','#1d2636'),OUT);
      for(const x of[-27,-13]){rr(g,x-4,-40,8,18,2,'#161d29',OUT);rr(g,x-4,-40,8,3,1,'#6e7a90');}
      rr(g,6,-26,28,26,3,lgr(g,6,-26,34,0,'#59687f','#232e40'),OUT);circ(g,20,-13,8,'#0b1017');circ(g,20,-13,5,'#ff7a1c');
      rr(g,-34,14,68,12,2,'#2b3445',OUT);for(let i=0;i<9;i++)rr(g,-31+i*7.6,16.5,4,7,1,col.base);
      rr(g,-34,28,40,6,1.5,'#d0861c',OUT);
      break;
    case'airfield':
      rr(g,-hw+11,-hh+11,w-22,h-22,4,'#222e42',OUT);
      for(let i=-1;i<=1;i+=2){rr(g,i*17-8,-40,16,80,2,'#161e2c');for(let j=0;j<7;j++)rr(g,i*17-1,-36+j*11,2,6,.4,'#f2f2f2');}
      rr(g,-14,-14,28,28,4,lgr(g,-14,-14,14,14,col.light,col.dark),OUT);line(g,-8,0,8,0,'rgba(255,255,255,.7)',2);line(g,0,-8,0,8,'rgba(255,255,255,.7)',2);
      rr(g,hw-24,-hh+14,12,16,2,M2,OUT);circ(g,hw-18,-hh+22,3.2,col.glow);
      break;
    case'turret':
      circ(g,0,0,hw-7,lgr(g,-16,-16,16,16,M3,M0),OUT);circ(g,0,0,hw-12,lgr(g,-12,-12,12,12,M2,M0),OUT);
      for(let i=0;i<8;i++){const a=i/8*TAU;line(g,Math.cos(a)*10,Math.sin(a)*10,Math.cos(a)*(hw-8),Math.sin(a)*(hw-8),'rgba(0,0,0,.35)',1);}
      break;
  }
}
function buildingSprite(type,f){
  const k='b|'+type+'|'+f;if(spriteCache[k])return spriteCache[k];
  const d=BDEF[type],w=d.w*TILE,h=d.h*TILE,cvs=mkCanvas(w*SC,h*SC),g=cvs.getContext('2d');
  g.translate(w*SC/2,h*SC/2);g.scale(SC,SC);g.lineJoin='round';g.lineCap='round';
  artBuilding(g,type,w,h,facCol(f),f);
  spritePolish(cvs,'b');
  return spriteCache[k]={cv:cvs,w,h};
}
/* animated overlays — drawn each frame with the origin at the building centre */
function drawBuildingLive(g,b,t,col,f){
  const d=b.def,hw=d.w*TILE/2,hh=d.h*TILE/2,pulse=0.55+0.35*Math.sin(t*3+b.id);
  switch(b.type){
    case'hub':
      if(f==='meridian'){g.strokeStyle='#e8f3ff';g.lineWidth=2.2;g.lineCap='round';g.beginPath();g.moveTo(0,0);g.lineTo(Math.cos(t*1.6)*13,Math.sin(t*1.6)*13);g.stroke();circ(g,0,0,3.4,'#fff');}
      else if(f==='obsidian'){g.globalAlpha=0.45+0.4*Math.sin(t*2.4);circ(g,0,0,10,rgr(g,0,0,0,11,'#fff',col.glow));g.globalAlpha=1;}
      else{g.save();g.rotate(t*0.7);for(let i=0;i<3;i++){const a=i/3*TAU;circ(g,Math.cos(a)*30,Math.sin(a)*30,3,rgr(g,Math.cos(a)*30,Math.sin(a)*30,0,3.4,'#fff',col.glow));}g.restore();}
      if(b.garr.length){g.fillStyle='#ffe27a';g.font='bold 11px system-ui';g.textAlign='center';g.fillText('⛨'+b.garr.length,0,hh+13);}
      break;
    case'generator':g.globalAlpha=pulse;circ(g,0,0,9.5,rgr(g,0,0,0,10,'#e9ffff','rgba(80,200,255,.0)'));g.globalAlpha=1;
      g.strokeStyle='rgba(170,240,255,'+(0.4+0.4*Math.sin(t*9+b.id))+')';g.lineWidth=1;g.beginPath();g.moveTo(-6,-3);g.lineTo(-2,2);g.lineTo(2,-4);g.lineTo(6,3);g.stroke();break;
    case'siphon':for(let i=0;i<5;i++){const p=(t*0.7+i/5)%1;g.fillStyle='rgba(185,133,255,'+(0.6*(1-p))+')';circ(g,Math.sin(i*2.1+t)*5,-p*26,3+p*7);}break;
    case'habitat':for(let i=0;i<8;i++){if(Math.sin(t*0.6+i*7.1+b.id)>-0.2)continue;const a=i/8*TAU+.2;rr(g,Math.cos(a)*18.5-1.8,Math.sin(a)*18.5-1.8,3.6,3.6,.8,'#2a2f3a');}break;
    case'armory':g.save();g.translate(0,-3);g.rotate(t*0.9);line(g,0,0,17,0,col.light,2);circ(g,17,0,2.6,col.glow);g.restore();circ(g,hw-16,hh-16,2.8,Math.sin(t*4)>0?'#ff5959':'#5a1a1a');break;
    case'foundry':for(let i=0;i<4;i++){const p=(t*0.45+i/4)%1,x=i&1?-13:-27;g.fillStyle='rgba(190,190,200,'+(0.4*(1-p))+')';circ(g,x+Math.sin(t+i)*3,-40-p*26,4+p*9);}
      g.globalAlpha=0.5+0.3*Math.sin(t*5);circ(g,20,-13,6,'#ffc04a');g.globalAlpha=1;break;
    case'airfield':g.fillStyle='rgba(255,230,120,'+(0.35+0.55*Math.max(0,Math.sin(t*4)))+')';for(const y of[-40,-20,0,20,40]){circ(g,-31,y,1.7);circ(g,31,y,1.7);}break;
    case'exchange':{const a=(t*0.8)%TAU;circ(g,30+Math.cos(a)*2,-36+Math.sin(a)*2,2,'#fff');break;}
    case'forum':for(let i=0;i<10;i++){const a=i/10*TAU+t*0.3;g.globalAlpha=0.3+0.3*Math.sin(t*2+i);circ(g,Math.cos(a)*35,Math.sin(a)*35,2,'#fff');}g.globalAlpha=1;break;
    case'turret':g.save();g.rotate(b.ang||0);rr(g,-2,-3.4,hw+8,6.8,2.4,lgr(g,0,-3,0,3,'#3e4a60','#0d1219'),OUT);rr(g,hw+2,-4.2,5,8.4,1.6,'#0d1219');g.restore();
      circ(g,0,0,7.2,lgr(g,-5,-5,5,5,col.light,col.dark),OUT);circ(g,0,0,2.8,col.glow);break;
  }
}

/* ---------------------------- neutral structures ----------------------- */
function artNeutral(g,type){
  const col=NEUTRAL_COL;
  if(type==='tower'){
    circ(g,0,0,29,lgr(g,-20,-20,20,20,'#6f7384','#232634'),OUT,1.3);
    circ(g,0,0,23,lgr(g,-16,-16,16,16,'#8b8fa4','#2f3345'),OUT);
    for(let i=0;i<8;i++){const a=i/8*TAU;line(g,Math.cos(a)*12,Math.sin(a)*12,Math.cos(a)*23,Math.sin(a)*23,'rgba(0,0,0,.3)',1.3);}
    circ(g,0,0,13,lgr(g,-9,-9,9,9,'#c9cbd8','#585c72'),OUT);circ(g,0,0,7,'#20232f',OUT);
  }else{
    rr(g,-30,-30,60,60,5,lgr(g,-30,-30,30,30,'#8a6f46','#473620'),OUT);
    for(let i=0;i<6;i++)line(g,-28,-24+i*10,28,-24+i*10,'rgba(0,0,0,.25)',1);
    for(let i=0;i<4;i++)rr(g,-26+i*13.5,-26,13.5,17,0,i%2?'#d9c9a4':'#a8343b');
    rr(g,-26,-26,54,17,1.6,null,OUT);
    rr(g,-24,-3,22,16,2,lgr(g,-24,-3,-2,13,'#b98a4a','#5c3f1c'),OUT);rr(g,2,-1,20,14,2,lgr(g,2,-1,22,13,'#b98a4a','#5c3f1c'),OUT);
    circ(g,-13,5,4,'#ffd45a',OUT);circ(g,12,6,4,'#6df0c8',OUT);
    circ(g,-20,22,6,lgr(g,-23,19,-17,25,'#8d5b2a','#4a2e14'),OUT);circ(g,-8,23,5,lgr(g,-11,20,-5,26,'#8d5b2a','#4a2e14'),OUT);
    line(g,22,-6,22,-26,'#cfcfd8',1.6);poly(g,[22,-26,31,-23,22,-20],'#e8b53a',OUT);
  }
}
function neutralSprite(type){
  const k='n|'+type;if(spriteCache[k])return spriteCache[k];
  const cvs=mkCanvas(64*SC,64*SC),g=cvs.getContext('2d');g.translate(32*SC,32*SC);g.scale(SC,SC);g.lineJoin='round';g.lineCap='round';
  artNeutral(g,type);return spriteCache[k]={cv:cvs,w:64,h:64};
}
function drawNeutralLive(g,n,t){
  const c=n.ctrl>=0?G.teams[n.ctrl].pal:NEUTRAL_COL;
  if(n.type==='tower'){
    g.globalAlpha=0.55+0.3*Math.sin(t*2);circ(g,0,0,5.5,rgr(g,0,0,0,6,'#fff',c.glow));g.globalAlpha=1;
    g.strokeStyle=c.glow;g.lineWidth=2.2;g.globalAlpha=n.ctrl>=0?.9:.35;g.beginPath();g.arc(0,0,27,0,TAU);g.stroke();g.globalAlpha=1;
    g.save();g.rotate(t*1.2);g.fillStyle='rgba(255,255,255,.18)';g.beginPath();g.moveTo(0,0);g.arc(0,0,60,-0.12,0.12);g.closePath();g.fill();g.restore();
  }else{
    const dm=n.demand;g.fillStyle='rgba(0,0,0,.6)';g.fillRect(-20,36,40,5);g.fillStyle=dm>0.66?'#ffd45a':dm>0.33?'#f0a040':'#e86a4a';g.fillRect(-19,37,38*dm,3);
  }
}

/* -------------------------------- resources ---------------------------- */
function crystalSprite(v){
  const k='c|'+v;if(spriteCache[k])return spriteCache[k];
  const cvs=mkCanvas(64*SC,64*SC),g=cvs.getContext('2d');g.translate(32*SC,36*SC);g.scale(SC,SC);g.lineJoin='round';
  const sets=[[[-8,6,-11,-8,-4,-19,0,-6],[2,7,0,-13,6,-23,11,-4],[-1,8,-4,-3,3,-10,9,3]],
    [[-9,5,-8,-11,-2,-17,1,-4],[3,7,2,-9,8,-20,12,-1],[-3,8,-6,0,-2,-8,4,4],[8,7,10,0,14,-6,15,5]],
    [[-6,6,-10,-6,-5,-15,-1,-3],[1,7,0,-15,5,-24,9,-5],[-12,8,-13,0,-9,-6,-6,5]]][v%3];
  g.fillStyle='rgba(0,0,0,.28)';g.beginPath();g.ellipse(2,8,16,6,0,0,TAU);g.fill();
  sets.forEach((p,i)=>{const hu=40+i*5;g.fillStyle=lgr(g,p[0],p[1],p[4],p[5],'hsl('+hu+',95%,70%)','hsl('+(hu-6)+',90%,42%)');
    g.beginPath();g.moveTo(p[0],p[1]);g.lineTo(p[2],p[3]);g.lineTo(p[4],p[5]);g.lineTo(p[6],p[7]);g.closePath();g.fill();g.strokeStyle='rgba(60,30,0,.55)';g.lineWidth=.9;g.stroke();
    g.fillStyle='rgba(255,255,255,.42)';g.beginPath();g.moveTo(p[2],p[3]);g.lineTo(p[4],p[5]);g.lineTo((p[4]+p[2])/2+1.8,(p[5]+p[3])/2+7);g.closePath();g.fill();});
  return spriteCache[k]={cv:cvs};
}
function drawCrystal(g,r,t){
  const f=0.55+0.45*Math.min(1,r.amount/r.max),sp=crystalSprite(Math.floor(r.seed)%3);
  g.save();g.translate(r.x,r.y);
  g.globalAlpha=.5;circ(g,0,-4,23*f,rgr(g,0,-4,2,23*f,'rgba(255,205,90,.45)','rgba(255,205,90,0)'));g.globalAlpha=1;
  g.scale(f,f);g.drawImage(sp.cv,-32,-36,64,64);
  const s=(Math.sin(t*2.2+r.seed*5)+1)/2;if(s>0.82){g.globalAlpha=(s-0.82)*5;const sx=Math.sin(r.seed*9)*7,sy=-13+Math.cos(r.seed*7)*5;line(g,sx-4,sy,sx+4,sy,'#fff',1.4);line(g,sx,sy-4,sx,sy+4,'#fff',1.4);g.globalAlpha=1;}
  g.restore();
}
function geyserBase(){
  const k='geyser';if(spriteCache[k])return spriteCache[k];
  const cvs=mkCanvas(80*SC,72*SC),g=cvs.getContext('2d');g.translate(40*SC,36*SC);g.scale(SC,SC);
  ell(g,0,1,28,23,rgr(g,0,1,8,28,'#05060a','#1a1424'));ell(g,0,0,22,17,rgr(g,0,0,2,22,'#3a2360','#120b20'),'#0a0710');
  ell(g,0,0,12,9,rgr(g,0,0,0,12,'#c9a0ff','#5b2fb0'));
  g.strokeStyle='rgba(0,0,0,.4)';g.lineWidth=1;for(let i=0;i<9;i++){const a=i/9*TAU;g.beginPath();g.moveTo(Math.cos(a)*22,Math.sin(a)*17);g.lineTo(Math.cos(a)*28,Math.sin(a)*23);g.stroke();}
  return spriteCache[k]={cv:cvs};
}
function drawGeyser(g,r,t){
  const sp=geyserBase();g.save();g.translate(r.x,r.y);g.drawImage(sp.cv,-40,-36,80,72);
  if(!r.siphon)for(let i=0;i<5;i++){const p=(t*0.45+i/5+r.seed)%1;g.fillStyle='rgba(205,160,255,'+(0.55*(1-p))+')';circ(g,Math.sin(i*3+t)*5,-p*28,3+p*7);}
  g.restore();
}

/* --------------------------------- glyphs ------------------------------ */
function glyph(g,name){
  g.lineCap='round';g.lineJoin='round';g.lineWidth=3.2;g.strokeStyle='#d4e8ff';g.fillStyle='#d4e8ff';
  switch(name){
    case'move':g.beginPath();g.moveTo(-15,0);g.lineTo(11,0);g.moveTo(1,-10);g.lineTo(12,0);g.lineTo(1,10);g.stroke();break;
    case'stop':rr(g,-11,-11,22,22,3,'#ff8a8a');break;
    case'hold':g.beginPath();g.moveTo(0,-15);g.lineTo(13,-8);g.lineTo(11,7);g.lineTo(0,15);g.lineTo(-11,7);g.lineTo(-13,-8);g.closePath();g.stroke();break;
    case'attack':g.strokeStyle='#ff9a8a';g.beginPath();g.arc(0,0,9,0,TAU);g.moveTo(-16,0);g.lineTo(-5,0);g.moveTo(16,0);g.lineTo(5,0);g.moveTo(0,-16);g.lineTo(0,-5);g.moveTo(0,16);g.lineTo(0,5);g.stroke();break;
    case'build':g.beginPath();g.arc(0,0,8,0,TAU);g.stroke();for(let i=0;i<8;i++){const a=i/8*TAU;g.moveTo(Math.cos(a)*8,Math.sin(a)*8);g.lineTo(Math.cos(a)*14,Math.sin(a)*14);}g.stroke();break;
    case'build2':g.strokeStyle='#ffd88a';g.beginPath();g.moveTo(-14,10);g.lineTo(-14,-4);g.lineTo(-4,-12);g.lineTo(-4,-2);g.lineTo(6,-10);g.lineTo(6,0);g.lineTo(14,-6);g.lineTo(14,10);g.closePath();g.stroke();break;
    case'back':g.beginPath();g.moveTo(13,0);g.lineTo(-11,0);g.moveTo(-1,-10);g.lineTo(-12,0);g.lineTo(-1,10);g.stroke();break;
    case'rally':g.beginPath();g.moveTo(-9,14);g.lineTo(-9,-14);g.stroke();g.fillStyle='#7cffb0';g.beginPath();g.moveTo(-9,-14);g.lineTo(13,-7);g.lineTo(-9,0);g.closePath();g.fill();break;
    case'cancel':g.strokeStyle='#ff8a8a';g.beginPath();g.moveTo(-10,-10);g.lineTo(10,10);g.moveTo(10,-10);g.lineTo(-10,10);g.stroke();break;
    case'repair':g.strokeStyle='#ffe27a';g.beginPath();g.moveTo(-12,12);g.lineTo(3,-3);g.stroke();g.beginPath();g.arc(7,-7,7,0.9,TAU-0.2);g.stroke();break;
    case'siege':g.strokeStyle='#ffb36a';rr(g,-12,2,24,8,2);g.beginPath();g.moveTo(-6,2);g.lineTo(-6,-6);g.lineTo(14,-12);g.stroke();for(const x of[-12,12]){g.beginPath();g.moveTo(x,10);g.lineTo(x*1.3,15);g.stroke();}break;
    case'stim':g.strokeStyle='#8affc0';g.beginPath();g.moveTo(-3,-14);g.lineTo(-10,3);g.lineTo(-1,3);g.lineTo(-5,15);g.lineTo(10,-4);g.lineTo(1,-4);g.lineTo(5,-14);g.closePath();g.stroke();break;
    case'call':g.strokeStyle='#ffd45a';g.beginPath();g.moveTo(-13,2);g.lineTo(0,-12);g.lineTo(13,2);g.moveTo(-9,2);g.lineTo(-9,13);g.lineTo(9,13);g.lineTo(9,2);g.stroke();g.beginPath();g.moveTo(-3,13);g.lineTo(-3,6);g.lineTo(3,6);g.lineTo(3,13);g.stroke();break;
    case'trade':g.strokeStyle='#ffd45a';g.beginPath();g.moveTo(-14,-5);g.lineTo(10,-5);g.moveTo(4,-11);g.lineTo(12,-5);g.lineTo(4,1);g.moveTo(14,6);g.lineTo(-10,6);g.moveTo(-4,0);g.lineTo(-12,6);g.lineTo(-4,12);g.stroke();break;
    case'market':g.strokeStyle='#ffd45a';g.beginPath();g.moveTo(-14,12);g.lineTo(-8,-2);g.lineTo(-2,5);g.lineTo(5,-8);g.lineTo(14,-12);g.stroke();g.beginPath();g.arc(14,-12,2,0,TAU);g.fill();break;
    case'era':g.strokeStyle='#ffe27a';g.beginPath();g.moveTo(0,-15);g.lineTo(5,-5);g.lineTo(15,-4);g.lineTo(8,4);g.lineTo(10,14);g.lineTo(0,9);g.lineTo(-10,14);g.lineTo(-8,4);g.lineTo(-15,-4);g.lineTo(-5,-5);g.closePath();g.stroke();break;
    case'hero':g.strokeStyle='#ffe27a';g.beginPath();g.moveTo(-12,8);g.lineTo(-12,-6);g.lineTo(-6,0);g.lineTo(0,-10);g.lineTo(6,0);g.lineTo(12,-6);g.lineTo(12,8);g.closePath();g.stroke();g.beginPath();g.moveTo(-12,13);g.lineTo(12,13);g.stroke();break;
    case'learn':g.strokeStyle='#8affc0';g.beginPath();g.moveTo(0,-13);g.lineTo(0,13);g.moveTo(-13,0);g.lineTo(13,0);g.stroke();g.beginPath();g.arc(0,0,15,0,TAU);g.lineWidth=1.6;g.stroke();break;
    case'tax':g.strokeStyle='#ffd45a';g.beginPath();g.arc(0,0,12,0,TAU);g.stroke();g.font='bold 17px system-ui';g.textAlign='center';g.textBaseline='middle';g.fillStyle='#ffd45a';g.fillText('$',0,1);break;
    case'wpn':g.strokeStyle='#ffb36a';g.beginPath();g.moveTo(-12,12);g.lineTo(10,-10);g.moveTo(2,-12);g.lineTo(12,-12);g.lineTo(12,-2);g.stroke();break;
    case'arm':g.strokeStyle='#8fd0ff';g.beginPath();g.moveTo(0,-14);g.lineTo(12,-8);g.lineTo(10,6);g.lineTo(0,14);g.lineTo(-10,6);g.lineTo(-12,-8);g.closePath();g.moveTo(-6,-1);g.lineTo(0,5);g.lineTo(7,-5);g.stroke();break;
    case'gem':g.strokeStyle='#ffd45a';g.beginPath();g.moveTo(-10,-4);g.lineTo(-5,-12);g.lineTo(5,-12);g.lineTo(10,-4);g.lineTo(0,13);g.closePath();g.moveTo(-10,-4);g.lineTo(10,-4);g.stroke();break;
    case'eth':g.strokeStyle='#c9a0ff';g.beginPath();g.moveTo(0,-14);g.quadraticCurveTo(13,2,0,13);g.quadraticCurveTo(-13,2,0,-14);g.stroke();break;
    case'cargo':g.strokeStyle='#d6b27a';rr(g,-12,-9,24,18,2);g.beginPath();g.moveTo(-12,-1);g.lineTo(12,-1);g.moveTo(0,-9);g.lineTo(0,-1);g.stroke();break;
    case'banner':g.strokeStyle='#8fd0ff';g.beginPath();g.moveTo(-8,14);g.lineTo(-8,-14);g.stroke();g.beginPath();g.moveTo(-8,-14);g.lineTo(13,-8);g.lineTo(-8,-1);g.stroke();g.fillStyle='rgba(143,208,255,.35)';g.fill();break;
    case'barrage':g.strokeStyle='#ffb36a';for(let i=-1;i<=1;i++){g.beginPath();g.moveTo(i*9-4,-14);g.lineTo(i*9+3,3);g.stroke();g.beginPath();g.arc(i*9+3,7,3,0,TAU);g.stroke();}break;
    case'orbital':g.strokeStyle='#ff7a5a';g.beginPath();g.arc(0,8,8,0,TAU);g.stroke();g.beginPath();g.moveTo(0,-15);g.lineTo(0,0);g.stroke();g.lineWidth=1.6;g.beginPath();g.moveTo(-5,-11);g.lineTo(0,-15);g.lineTo(5,-11);g.stroke();break;
    case'bloodlust':g.strokeStyle='#ff7a6a';g.beginPath();g.moveTo(0,-14);g.quadraticCurveTo(12,0,0,14);g.quadraticCurveTo(-12,0,0,-14);g.stroke();g.beginPath();g.moveTo(0,-6);g.quadraticCurveTo(5,0,0,7);g.quadraticCurveTo(-5,0,0,-6);g.fillStyle='#ff7a6a';g.fill();break;
    case'shock':g.strokeStyle='#ffb36a';for(const r of[6,11,16]){g.beginPath();g.arc(0,2,r,Math.PI*1.1,Math.PI*1.9);g.stroke();}g.beginPath();g.moveTo(-4,10);g.lineTo(4,10);g.stroke();break;
    case'rampage':g.strokeStyle='#ff5a4a';g.beginPath();g.moveTo(-13,12);g.lineTo(-4,-13);g.lineTo(0,2);g.lineTo(5,-13);g.lineTo(13,12);g.stroke();break;
    case'regen':g.strokeStyle='#8affc0';g.lineWidth=4;g.beginPath();g.moveTo(0,-12);g.lineTo(0,12);g.moveTo(-12,0);g.lineTo(12,0);g.stroke();break;
    case'veil':g.strokeStyle='#a8ffe6';g.setLineDash([3,3]);g.beginPath();g.arc(0,0,12,0,TAU);g.stroke();g.setLineDash([]);g.beginPath();g.arc(0,0,5,0,TAU);g.stroke();break;
    case'sing':g.strokeStyle='#c9a0ff';g.beginPath();for(let a=0;a<14;a+=.3){const r=1+a*1.05;g.lineTo(Math.cos(a)*r,Math.sin(a)*r);}g.stroke();break;
    case'idle':g.strokeStyle='#ffe27a';g.beginPath();g.arc(0,0,12,0,TAU);g.stroke();g.beginPath();g.moveTo(0,-6);g.lineTo(0,1);g.lineTo(5,4);g.stroke();break;
    case'army':g.strokeStyle='#9fd0ff';g.beginPath();g.moveTo(-12,13);g.lineTo(-12,-4);g.lineTo(-4,-12);g.lineTo(4,-12);g.lineTo(12,-4);g.lineTo(12,13);g.stroke();g.beginPath();g.moveTo(0,-12);g.lineTo(0,13);g.stroke();break;
    case'tower':g.strokeStyle='#cbb8ff';g.beginPath();g.moveTo(-7,13);g.lineTo(-5,-6);g.lineTo(5,-6);g.lineTo(7,13);g.moveTo(-9,-6);g.lineTo(9,-6);g.stroke();g.beginPath();g.arc(0,-11,3,0,TAU);g.fill();break;
    case'swarm':{g.strokeStyle='#9fe8ff';g.lineWidth=2.2;const P=[[0,-11],[-11,8],[11,8],[0,0]];g.beginPath();g.moveTo(P[0][0],P[0][1]);g.lineTo(P[1][0],P[1][1]);g.lineTo(P[2][0],P[2][1]);g.closePath();g.moveTo(0,-11);g.lineTo(0,0);g.moveTo(-11,8);g.lineTo(0,0);g.moveTo(11,8);g.lineTo(0,0);g.stroke();g.fillStyle='#9fe8ff';for(const p of P){g.beginPath();g.arc(p[0],p[1],3.6,0,TAU);g.fill();}break;}
    case'agent':{g.strokeStyle='#9fe8ff';g.lineWidth=2.6;g.beginPath();g.arc(0,0,13,0,TAU);g.stroke();g.setLineDash([3,4]);g.beginPath();g.arc(0,0,8,0,TAU);g.stroke();g.setLineDash([]);g.fillStyle='#9fe8ff';g.beginPath();g.arc(0,0,3.4,0,TAU);g.fill();g.fillStyle='#ffe27a';g.beginPath();g.arc(10,-10,3,0,TAU);g.fill();break;}
    case'auto':{g.strokeStyle='#9fe8ff';g.lineWidth=3;g.beginPath();g.arc(0,0,10,0.4,TAU*0.5+0.1);g.stroke();g.beginPath();g.arc(0,0,10,TAU*0.5+0.4,TAU+0.1);g.stroke();g.fillStyle='#9fe8ff';g.beginPath();g.moveTo(-14,3);g.lineTo(-6,3);g.lineTo(-10,-4);g.closePath();g.fill();g.beginPath();g.moveTo(14,-3);g.lineTo(6,-3);g.lineTo(10,4);g.closePath();g.fill();break;}
    case'roles':{g.strokeStyle='#ffd45a';g.lineWidth=2.6;g.beginPath();g.moveTo(0,-12);g.lineTo(0,0);g.moveTo(0,0);g.lineTo(-10,10);g.moveTo(0,0);g.lineTo(10,10);g.stroke();g.fillStyle='#ffd45a';for(const p of[[0,-12],[-10,10],[10,10]]){g.beginPath();g.arc(p[0],p[1],4,0,TAU);g.fill();}break;}
    default:g.beginPath();g.arc(0,0,10,0,TAU);g.stroke();
  }
}
function iconURL(spec){
  if(iconCache[spec])return iconCache[spec];
  const c=mkCanvas(128,128),g=c.getContext('2d');g.scale(2,2);   // authored on a 64 px grid, stored at 2x so it is sharp on retina screens
  const bg=g.createLinearGradient(0,0,0,64);bg.addColorStop(0,'#223d63');bg.addColorStop(1,'#0b1628');g.fillStyle=bg;g.fillRect(0,0,64,64);
  const p=spec.split(':');g.save();g.translate(32,32);
  if(p[0]==='u'){const sp=unitSprite(p[1],p[2]||'meridian'),s=Math.min(1.9,50/sp.S);g.scale(s,s);g.rotate(-0.6);g.drawImage(sp.cv,-sp.S/2,-sp.S/2,sp.S,sp.S);}
  else if(p[0]==='b'){const sp=buildingSprite(p[1],p[2]||'meridian'),s=52/Math.max(sp.w,sp.h);g.scale(s,s);g.drawImage(sp.cv,-sp.w/2,-sp.h/2,sp.w,sp.h);}
  else if(p[0]==='n'){const sp=neutralSprite(p[1]);g.scale(0.8,0.8);g.drawImage(sp.cv,-32,-32,64,64);}
  else if(p[0]==='r'){const R=ROLES[p[1]]||ROLES.free;g.fillStyle=R.col;g.beginPath();g.arc(0,0,21,0,TAU);g.fill();g.strokeStyle='rgba(0,0,0,.55)';g.lineWidth=2.4;g.stroke();g.fillStyle='#06121f';g.font='bold 27px system-ui';g.textAlign='center';g.textBaseline='middle';g.fillText(R.g,0,1.5);}
  else glyph(g,p[1]);
  g.restore();const url=c.toDataURL();iconCache[spec]=url;return url;
}
