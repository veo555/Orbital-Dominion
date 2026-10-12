/* =========================================================================
   ART (2/3) — buildings, neutral structures, resources, glyphs and icons
   ========================================================================= */
/* animated overlays — drawn each frame with the origin at the building's ground centre; heights go through Z() so they sit on the 3D roofs */
const Zs=z=>-z*K3;
function drawBuildingLive(g,b,t,col,f){
  const d=b.def,hh=d.h*TILE/2,pulse=0.55+0.35*Math.sin(t*3+b.id),lit=Q.lit>=1;
  const glow=(x,y,r,c,a)=>{if(!lit)return;g.globalAlpha=a;g.globalCompositeOperation='lighter';g.drawImage(glowSprite(c),x-r,y-r,r*2,r*2);g.globalCompositeOperation='source-over';g.globalAlpha=1;};
  switch(b.type){
    case'hub':
      if(f==='meridian'){g.strokeStyle='#e8f3ff';g.lineWidth=2;g.lineCap='round';g.beginPath();g.moveTo(0,Zs(52));g.lineTo(Math.cos(t*1.6)*12,Zs(52)+Math.sin(t*1.6)*8);g.stroke();glow(0,Zs(52),16,'120,190,255',.5+.3*Math.sin(t*2));}
      else if(f==='obsidian')glow(0,Zs(46),30,'255,90,70',.45+.35*Math.sin(t*2.4));
      else glow(0,Zs(54),26,'77,255,208',.45+.3*Math.sin(t*2));
      if(b.garr.length){g.fillStyle='#ffe27a';g.font='bold 11px system-ui';g.textAlign='center';g.fillText('⛨'+b.garr.length,0,hh+13);}
      break;
    case'generator':glow(0,Zs(24),22,'90,210,255',pulse);g.strokeStyle='rgba(170,240,255,'+(0.4+0.4*Math.sin(t*9+b.id))+')';g.lineWidth=1;g.beginPath();g.moveTo(-6,Zs(24)-3);g.lineTo(-2,Zs(24)+2);g.lineTo(2,Zs(24)-4);g.lineTo(6,Zs(24)+3);g.stroke();break;
    case'siphon':for(let i=0;i<5;i++){const p=(t*0.7+i/5)%1;g.fillStyle='rgba(185,133,255,'+(0.6*(1-p))+')';circ(g,Math.sin(i*2.1+t)*5,Zs(10)-p*26,3+p*7);}glow(0,Zs(10),20,'160,100,255',.4);break;
    case'armory':g.save();g.translate(0,-14+Zs(29));g.rotate(t*0.9);line(g,0,0,12,0,col.light,2);circ(g,12,0,2,col.glow);g.restore();break;
    case'foundry':for(let i=0;i<4;i++){const p=(t*0.45+i/4)%1,x=i&1?-16:-30;g.fillStyle='rgba(190,190,200,'+(0.4*(1-p))+')';circ(g,x+Math.sin(t+i)*3,-16+Zs(56)-p*26,4+p*9);}
      glow(14,25+Zs(10),16,'255,150,50',.5+.3*Math.sin(t*5));break;
    case'airfield':for(let j=0;j<7;j++){const on=Math.max(0,Math.sin(t*4-j*.7));glow(28.4,-34+j*11+Zs(4),5,'255,230,120',.35+.6*on);glow(-28.4+0,-34+j*11+Zs(4),5,'255,230,120',.35+.6*on);}break;
    case'exchange':{const a=(t*0.8)%TAU;circ(g,30+Math.cos(a)*2,-36+Zs(37)+Math.sin(a)*2,2,'#fff');break;}
    case'forum':for(let i=0;i<10;i++){const a=i/10*TAU+t*0.3;g.globalAlpha=0.3+0.3*Math.sin(t*2+i);circ(g,Math.cos(a)*22,Zs(34)+Math.sin(a)*14,1.8,'#fff');}g.globalAlpha=1;break;
  }
}

/* ---------------------------- neutral structures ----------------------- */
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
function crystalSprite(v){return neutralSprite('cr'+(v%3));}
function drawCrystal(g,r,t){
  const f=0.55+0.45*Math.min(1,r.amount/r.max),sp=crystalSprite(Math.floor(r.seed)%3);
  g.save();g.translate(r.x,r.y);
  g.globalAlpha=.5;circ(g,0,-4,23*f,rgr(g,0,-4,2,23*f,'rgba(255,205,90,.45)','rgba(255,205,90,0)'));g.globalAlpha=1;
  g.scale(f,f);if(Q.shd>0)drawBuildingShadow(sp,0,0);g.drawImage(sp.cv,sp.x0,sp.y0,sp.w,sp.h);drawEmissive(sp,sp.x0,sp.y0,sp.w,sp.h,.8);
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
    default:if(typeof fortGlyph==='function'&&fortGlyph(g,name))break;g.beginPath();g.arc(0,0,10,0,TAU);g.stroke();   // 68_fortify_ui.js glyphs
  }
}
function iconURL(spec){
  if(iconCache[spec])return iconCache[spec];
  const c=mkCanvas(128,128),g=c.getContext('2d');g.scale(2,2);   // authored on a 64 px grid, stored at 2x so it is sharp on retina screens
  const bg=g.createLinearGradient(0,0,0,64);bg.addColorStop(0,'#223d63');bg.addColorStop(1,'#0b1628');g.fillStyle=bg;g.fillRect(0,0,64,64);
  const p=spec.split(':');g.save();g.translate(32,32);
  if(p[0]==='u'){const sp=unitSprite(p[1],p[2]||'meridian',.5),s=Math.min(1.9,54/sp.S);g.scale(s,s);g.drawImage(sp.cv,-sp.w/2,-sp.h/2,sp.w,sp.h);}
  else if(p[0]==='b'){const sp=buildingSprite(p[1],p[2]||'meridian'),s=54/Math.max(sp.w,sp.h);g.scale(s,s);g.drawImage(sp.cv,-sp.w/2,-sp.h/2,sp.w,sp.h);}
  else if(p[0]==='n'){const sp=neutralSprite(p[1]);g.scale(0.8,0.8);g.drawImage(sp.cv,-sp.w/2,-sp.h/2,sp.w,sp.h);}
  else if(p[0]==='r'){const R=ROLES[p[1]]||ROLES.free;g.fillStyle=R.col;g.beginPath();g.arc(0,0,21,0,TAU);g.fill();g.strokeStyle='rgba(0,0,0,.55)';g.lineWidth=2.4;g.stroke();g.fillStyle='#06121f';g.font='bold 27px system-ui';g.textAlign='center';g.textBaseline='middle';g.fillText(R.g,0,1.5);}
  else glyph(g,p[1]);
  g.restore();const url=c.toDataURL();iconCache[spec]=url;return url;
}
