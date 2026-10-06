/* =========================================================================
   ART (1/3) — drawing helpers and cached unit sprites
   Light comes from the north-west. Every sprite is drawn once onto an offscreen
   canvas at SC× resolution and then rotated / blitted every frame.
   ========================================================================= */
const SC=3,OUT='rgba(5,9,16,.85)',M0='#1b2330',M1='#2e3a4f',M2='#51607a',M3='#8696b0',M4='#cfd9e8';
const spriteCache={},iconCache={},mixCache={};
function mix(a,b,t){const k=a+b+t;if(mixCache[k])return mixCache[k];const pa=parseInt(a.slice(1),16),pb=parseInt(b.slice(1),16);
  return mixCache[k]='rgb('+Math.round(lerp(pa>>16,pb>>16,t))+','+Math.round(lerp((pa>>8)&255,(pb>>8)&255,t))+','+Math.round(lerp(pa&255,pb&255,t))+')';}
function rrp(g,x,y,w,h,r){r=Math.min(r,w/2,h/2);g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath();}
function rr(g,x,y,w,h,r,fill,stroke,lw){rrp(g,x,y,w,h,r);if(fill){g.fillStyle=fill;g.fill();}if(stroke){g.strokeStyle=stroke;g.lineWidth=lw||1;g.stroke();}}
function circ(g,x,y,r,fill,stroke,lw){g.beginPath();g.arc(x,y,r,0,TAU);if(fill){g.fillStyle=fill;g.fill();}if(stroke){g.strokeStyle=stroke;g.lineWidth=lw||1;g.stroke();}}
function ell(g,x,y,rx,ry,fill,stroke,rot){g.beginPath();g.ellipse(x,y,rx,ry,rot||0,0,TAU);if(fill){g.fillStyle=fill;g.fill();}if(stroke){g.strokeStyle=stroke;g.lineWidth=1;g.stroke();}}
function poly(g,p,fill,stroke,lw){g.beginPath();g.moveTo(p[0],p[1]);for(let i=2;i<p.length;i+=2)g.lineTo(p[i],p[i+1]);g.closePath();if(fill){g.fillStyle=fill;g.fill();}if(stroke){g.strokeStyle=stroke;g.lineWidth=lw||1;g.stroke();}}
function line(g,x0,y0,x1,y1,col,w){g.beginPath();g.moveTo(x0,y0);g.lineTo(x1,y1);g.strokeStyle=col;g.lineWidth=w||1;g.lineCap='round';g.stroke();}
function lgr(g,x0,y0,x1,y1,c0,c1,cm){const q=g.createLinearGradient(x0,y0,x1,y1);q.addColorStop(0,c0);if(cm)q.addColorStop(0.5,cm);q.addColorStop(1,c1);return q;}
function rgr(g,x,y,r0,r1,c0,c1){const q=g.createRadialGradient(x,y,r0,x,y,r1);q.addColorStop(0,c0);q.addColorStop(1,c1);return q;}
function facCol(f){return f==='neutral'||!FACTIONS[f]?NEUTRAL_COL:FACTIONS[f].col;}
function mkCanvas(w,h){const c=document.createElement('canvas');c.width=Math.max(1,Math.ceil(w));c.height=Math.max(1,Math.ceil(h));return c;}

/* ------------------------------- units -------------------------------- */
function artUnit(g,type,col,f){
  switch(type){
    case'hauler':{
      for(const sy of[-1,1]){rr(g,-9.5,sy<0?-10.5:4.5,19,6,2.6,M0,OUT);for(let x=-7.5;x<=8;x+=3)line(g,x,sy<0?-10:5,x,sy<0?-5.2:10,'rgba(255,255,255,.10)',1);}
      rr(g,-8.5,-7,17,14,4,lgr(g,-6,-7,6,7,col.light,col.dark),OUT);
      rr(g,-8,-4.2,6.5,8.4,1.6,M0);rr(g,-7.4,-3.6,5.2,7.2,1.2,M1);
      circ(g,2.5,0,4.4,lgr(g,-1,-4,6,4,'#f4f8fc','#8e9db2'),OUT);rr(g,3.4,-2.4,3,4.8,1.2,'#42d1ff');
      line(g,6.5,-4.2,12.5,-5.6,M3,2.2);line(g,6.5,4.2,12.5,5.6,M3,2.2);circ(g,12.8,-5.8,1.4,M4);circ(g,12.8,5.8,1.4,M4);
      break;}
    case'rifleman':{
      rr(g,3,1.6,14,3.2,1.2,'#0e131b');rr(g,14,1.2,4,4,1,M2);line(g,6,2.4,12,2.4,'rgba(255,255,255,.25)',.8);
      ell(g,0,0,7,8.6,lgr(g,-5,-7,5,7,M2,M0),OUT);
      ell(g,-.5,0,5.4,7.2,lgr(g,-4,-6,4,6,col.light,col.dark),OUT);
      if(f==='obsidian'){poly(g,[-1,-9.6,3,-6.5,-3,-6.4],col.light,OUT);poly(g,[-1,9.6,3,6.5,-3,6.4],col.light,OUT);}
      else if(f==='aurora'){ell(g,-4,0,4,5,col.dark,OUT);}
      else{ell(g,-.5,-6.6,3,1.8,col.light);ell(g,-.5,6.6,3,1.8,col.light);}
      circ(g,1.2,0,3.9,lgr(g,-2,-3,4,3,'#eef3f9','#8d9cb1'),OUT);rr(g,3,-1.8,2.6,3.6,1,'#3de0ff');
      break;}
    case'raptor':{
      poly(g,[13,0,4,-4,-3,-9.5,-11,-3,-9,0,-11,3,-3,9.5,4,4],lgr(g,-10,-9,12,9,col.dark,col.base),OUT);
      poly(g,[9,0,2,-3.5,-3,-6.4,-7.6,-1.8,-7.6,1.8,-3,6.4,2,3.5],lgr(g,-6,-6,8,6,col.light,col.base),OUT);
      for(const s of[-1,1]){poly(g,[7,s*4.2,17,s*8.8,10.5,s*3.1],'#eef3f9',OUT);poly(g,[3,s*6.5,10,s*11,5.6,s*5],'#c3cedc',OUT);}
      if(f==='obsidian')for(const s of[-1,1])poly(g,[-3,s*7,-9,s*11.5,-8,s*5],col.light,OUT);
      circ(g,6,-2,1.3,'#ffe36b');circ(g,6,2,1.3,'#ffe36b');
      break;}
    case'rocketeer':{
      rr(g,-8,-12.5,15,5.2,2,M0,OUT);rr(g,-8,7.3,15,5.2,2,M0,OUT);
      rr(g,-8,-12,14,2.2,1,M2);rr(g,-8,9.8,14,2.2,1,M2);circ(g,6.5,-9.9,1.8,'#ffb24a');circ(g,6.5,9.9,1.8,'#ffb24a');
      ell(g,0,0,7.6,8.4,lgr(g,-5,-7,5,7,M2,M0),OUT);ell(g,0,0,6,7.2,lgr(g,-4,-6,4,6,col.light,col.dark),OUT);
      circ(g,1.2,0,4.1,lgr(g,-2,-3,4,3,'#eef3f9','#8d9cb1'),OUT);rr(g,3.2,-1.9,2.5,3.8,1,'#ffb347');
      if(f==='obsidian')poly(g,[-6,0,-10,-3,-10,3],col.light,OUT);
      break;}
    case'mender':{
      ell(g,-2,0,7.4,8.6,lgr(g,-5,-7,5,7,'#f1f5fa','#a4b2c5'),OUT);
      ell(g,0,0,6,7.4,lgr(g,-4,-6,4,6,col.light,col.base),OUT);
      rr(g,-7.6,-4.6,6.2,9.2,1.5,'#f4f7fb',OUT);rr(g,-5.8,-.9,2.6,1.8,.5,'#e24a4a');rr(g,-5.0,-2.9,1.0,5.8,.5,'#e24a4a');
      circ(g,1.8,0,3.8,lgr(g,-1,-3,4,3,'#fbfdff','#9fb0c6'),OUT);rr(g,3.4,-1.8,2.4,3.6,1,'#7dffcf');
      line(g,-8,-6.5,-12,-9,M3,1.5);circ(g,-12.5,-9.4,1.7,'#7dffcf');
      break;}
    case'howitzer':{
      for(const sy of[-1,1]){rr(g,-15,sy<0?-14:7,30,7,3.2,M0,OUT);for(let x=-12;x<=13;x+=3.4)line(g,x,sy<0?-13.5:7.5,x,sy<0?-7.5:13.5,'rgba(255,255,255,.1)',1);}
      rr(g,-13,-9.5,26,19,4,lgr(g,-10,-9,10,9,col.light,col.dark),OUT);rr(g,-11,-7,15,14,3,lgr(g,-9,-7,5,7,col.base,col.dark));
      rr(g,3,-2.4,22,4.8,1.8,lgr(g,0,-2.4,0,2.4,'#3b475b','#10161f'),OUT);rr(g,21,-3.8,6,7.6,1.8,'#10161f',OUT);rr(g,-16,-4,6,8,2,M1,OUT);
      circ(g,-1,0,6.4,lgr(g,-5,-5,5,5,M3,M0),OUT);circ(g,-1,0,2.6,col.light);
      break;}
    case'juggernaut':{
      for(const sx of[-1,1])for(const sy of[-1,1]){line(g,sx*8,sy*8,sx*12,sy*13,M1,5);rr(g,sx*12-5,sy*13-3.5,10,7,2.6,M0,OUT);}
      poly(g,[15,0,8,-12,-7,-14,-14,-6,-14,6,-7,14,8,12],lgr(g,-12,-12,12,12,col.light,col.dark),OUT);
      poly(g,[11,0,6,-8.4,-6,-10,-10,-4,-10,4,-6,10,6,8.4],lgr(g,-9,-9,9,9,col.base,col.dark));
      rr(g,6,-16.4,19,5.4,2,lgr(g,0,-16,0,-11,'#3b475b','#10161f'),OUT);rr(g,6,11,19,5.4,2,lgr(g,0,11,0,16,'#3b475b','#10161f'),OUT);
      rr(g,21,-17,5,6.4,1.4,'#10161f');rr(g,21,10.6,5,6.4,1.4,'#10161f');
      rr(g,0,-5.2,9,10.4,3,lgr(g,0,-5,9,5,'#d4f4ff','#4f93b3'),OUT);line(g,3,-3,3,3,'rgba(255,255,255,.5)',1);
      if(f==='obsidian')for(const s of[-1,1])poly(g,[-4,s*12,-9,s*17.5,-9.5,s*10],col.light,OUT);
      break;}
    case'skiff':{
      poly(g,[16,0,2,-5,-9,-17,-6,-2,-12,0,-6,2,-9,17,2,5],lgr(g,-10,-17,14,17,M3,M0),OUT);
      poly(g,[12,0,0,-3.2,-7,-11.5,-4,0,-7,11.5,0,3.2],lgr(g,-8,-11,12,11,col.light,col.dark));
      line(g,-6,-9.8,2,-4,'rgba(255,255,255,.35)',.9);line(g,-6,9.8,2,4,'rgba(255,255,255,.35)',.9);
      ell(g,4,0,5.2,2.6,lgr(g,0,-3,8,3,'#e6fbff','#4a9ec0'),OUT);
      rr(g,-10.4,-2.6,3,5.2,1,M0);
      break;}
    case'titan':{
      for(const a of[0,1,2,3,4,5]){const an=a/6*TAU+TAU/12,lx=Math.cos(an)*17,ly=Math.sin(an)*17;line(g,Math.cos(an)*9,Math.sin(an)*9,lx,ly,M1,6.5);circ(g,lx*1.07,ly*1.07,5.4,M0,OUT);circ(g,lx*1.07,ly*1.07,2.4,M2);}
      poly(g,(()=>{const p=[];for(let i=0;i<8;i++){const a=i/8*TAU+TAU/16;p.push(Math.cos(a)*19.5,Math.sin(a)*18);}return p;})(),lgr(g,-16,-16,16,16,col.light,col.dark),OUT,1.3);
      poly(g,(()=>{const p=[];for(let i=0;i<8;i++){const a=i/8*TAU+TAU/16;p.push(Math.cos(a)*14,Math.sin(a)*13);}return p;})(),lgr(g,-12,-12,12,12,col.base,col.dark));
      rr(g,6,-4.6,34,9.2,3.4,lgr(g,0,-4.6,0,4.6,'#475268','#0d1219'),OUT);rr(g,34,-6.2,8,12.4,3,'#0d1219',OUT);rr(g,8,-3.2,24,1.8,.9,'rgba(255,255,255,.18)');
      rr(g,-3,-16.5,10,6,2,M0,OUT);rr(g,-3,10.5,10,6,2,M0,OUT);for(const s of[-1,1])for(let i=0;i<2;i++)circ(g,.6+i*4.2,s*13.5,1.5,'#ffb24a');
      circ(g,-3,0,7.2,rgr(g,-3,0,1,7.5,'#fff',col.glow),OUT);circ(g,-3,0,3.2,'#fff');
      if(f==='obsidian')for(const s of[-1,1])poly(g,[-12,s*10,-19,s*15,-16,s*6],col.light,OUT);
      break;}
    case'freighter':{
      rr(g,-14,-9.5,19,19,3.5,lgr(g,-12,-9,5,9,'#e9eef5','#8e9db2'),OUT);
      for(let i=0;i<3;i++)line(g,-10+i*5,-8.5,-10+i*5,8.5,'rgba(30,40,56,.35)',1);
      rr(g,-14,-9.5,19,4,2,col.base);rr(g,-14,5.5,19,4,2,col.base);circ(g,-4,0,3.2,col.light,OUT);
      rr(g,5,-8,10,16,4,lgr(g,6,-8,14,8,col.light,col.dark),OUT);rr(g,10,-5.2,4,10.4,1.8,'#bfeaff');
      rr(g,-16,-6.5,3,5,1,'#ffb347');rr(g,-16,1.5,3,5,1,'#ffb347');
      break;}
    case'bulwark':{
      for(const sx of[-1,1])for(const sy of[-1,1]){rr(g,sx*8-4.5,sy*10.4-3,9,6,2.4,M0,OUT);}
      poly(g,[11,0,6,-9.5,-6,-11,-12,-5,-12,5,-6,11,6,9.5],lgr(g,-10,-10,10,10,col.light,col.dark),OUT);
      poly(g,[7,0,4,-6,-5,-7.4,-8.4,-3,-8.4,3,-5,7.4,4,6],lgr(g,-8,-7,7,7,col.base,col.dark));
      g.beginPath();g.moveTo(10,-14);g.quadraticCurveTo(21,0,10,14);g.lineTo(7,11.5);g.quadraticCurveTo(15.5,0,7,-11.5);g.closePath();
      g.fillStyle=lgr(g,8,-14,18,14,'#eaf6ff',mix('#8bbdf0',col.base.length===7?col.base:'#3d8bff',.4));g.fill();g.strokeStyle=OUT;g.lineWidth=1;g.stroke();
      g.beginPath();g.moveTo(11,-10);g.quadraticCurveTo(18,0,11,10);g.strokeStyle=col.glow;g.lineWidth=1.3;g.globalAlpha=.85;g.stroke();g.globalAlpha=1;
      rr(g,-2,-3,9,6,2,M0,OUT);circ(g,1,0,2.4,col.glow);
      break;}
    case'reaver':{
      poly(g,[-12,0,-8,-4,-4,-8,0,-6.5,5,-8.4,10,-4,12,0,10,4,5,8.4,0,6.5,-4,8,-8,4],lgr(g,-11,-9,11,9,col.base,col.dark),OUT);
      for(let i=0;i<4;i++){const x=-8+i*4.2;poly(g,[x,-5.6,x+2.2,-11.4,x+3.2,-5],col.light,OUT);poly(g,[x,5.6,x+2.2,11.4,x+3.2,5],col.light,OUT);}
      for(const s of[-1,1]){poly(g,[7,s*3.6,19,s*7.6,12,s*1.6],lgr(g,7,0,19,s*7,'#ffffff','#a6b4c8'),OUT);poly(g,[8,s*5.4,14,s*10.8,10,s*4],'#cdd7e6',OUT);}
      circ(g,6.5,-1.9,1.4,'#ff3a3a');circ(g,6.5,1.9,1.4,'#ff3a3a');
      break;}
    case'specter':{
      g.beginPath();g.moveTo(10,0);g.quadraticCurveTo(0,-9.6,-10,-3.4);g.quadraticCurveTo(-14,0,-10,3.4);g.quadraticCurveTo(0,9.6,10,0);g.closePath();
      g.fillStyle=lgr(g,-12,-9,10,9,col.light,col.dark);g.fill();g.strokeStyle=OUT;g.lineWidth=1;g.stroke();
      ell(g,-.5,0,5,5.8,lgr(g,-4,-4,4,4,col.base,'#0d2b25'),OUT);
      rr(g,3,1.2,17,2.6,1.1,'#0b1116');rr(g,16,.8,6,3.4,1,col.glow);line(g,5,2.2,15,2.2,'rgba(255,255,255,.4)',.7);
      circ(g,1.5,-.4,3.4,lgr(g,-1,-3,4,3,'#2a3c3a','#0a1514'),OUT);rr(g,3,-1.6,2.2,2.6,.8,col.glow);
      line(g,-10,-3.2,-15,-5.5,col.glow,1.1);line(g,-10,3.2,-15,5.5,col.glow,1.1);
      break;}
    case'crawler':{
      for(const s of[-1,1])for(let i=0;i<3;i++){const x=-3+i*4.5;line(g,x,s*3,x+(i-1)*2.4,s*10.4,'#3b2c1c',1.8);line(g,x+(i-1)*2.4,s*10.4,x+(i-1)*2.4+3,s*11.4,'#241a10',1.4);}
      ell(g,-1.5,0,8.4,6,lgr(g,-6,-6,6,6,'#8d7a4a','#3d3220'),OUT);
      for(let i=0;i<4;i++)line(g,-6+i*3.4,-4.6,-6+i*3.4,4.6,'rgba(0,0,0,.28)',1.2);
      ell(g,6.4,0,4.4,3.8,lgr(g,3,-3,10,3,'#a28d58','#4f4128'),OUT);
      poly(g,[9,-2,13.6,-3.8,10.2,-.6],'#e9dfc0',OUT);poly(g,[9,2,13.6,3.8,10.2,.6],'#e9dfc0',OUT);
      circ(g,7.6,-1.8,1.1,'#ff7a1a');circ(g,7.6,1.8,1.1,'#ff7a1a');
      break;}
    case'spitter':{
      for(const s of[-1,1])for(let i=0;i<2;i++){const x=1+i*4.6;line(g,x,s*3,x+(i?2:-1),s*10,'#2e3a22',1.7);}
      ell(g,-4,0,8,7,lgr(g,-9,-7,3,7,'#7fa845','#2e4318'),OUT);ell(g,-4.5,0,5,4.6,rgr(g,-4.5,0,0,5.2,'#d6ff7a','#76c224'));
      ell(g,-4.5,-1.2,2.2,1.5,'rgba(255,255,255,.4)');
      ell(g,6,0,4,3.4,lgr(g,3,-3,9,3,'#8bb24c','#33491c'),OUT);rr(g,8,-1.3,5.5,2.6,1.2,'#caff5c');
      circ(g,6.8,-1.9,.9,'#f6ff9a');circ(g,6.8,1.9,.9,'#f6ff9a');
      break;}
    case'brute':{
      for(const s of[-1,1]){rr(g,6,s*9-3.6,13,7.2,3.4,lgr(g,6,s*9-3,19,s*9+3,'#7a5a6a','#2a1b25'),OUT);poly(g,[17,s*9-2,24,s*9,17,s*9+2],'#efe6d2',OUT);}
      ell(g,-2,0,15.5,13,lgr(g,-12,-12,12,12,'#8d6a7d','#2d1c28'),OUT);
      for(let i=0;i<5;i++){const a=-1.2+i*.6,x=-4+Math.cos(a)*6,y=Math.sin(a)*8.6;poly(g,[x,y,x-5.2,y+(a<0?-5:5),x-1.4,y+(a<0?-1:1)*1.2],'#d9cdb4',OUT);}
      ell(g,-2,0,9,8,lgr(g,-8,-8,8,8,'#a67e93','#43293a'));
      ell(g,10,0,6,5.4,lgr(g,6,-5,14,5,'#9a7388','#3a2332'),OUT);
      for(const s of[-1,1]){poly(g,[10,s*3.4,18,s*10.6,13.6,s*2],'#efe6d2',OUT);}
      circ(g,12.4,-2,1.3,'#ff3b1f');circ(g,12.4,2,1.3,'#ff3b1f');
      break;}
    case'hero_idris':{
      poly(g,[-4,-9,-18,-6,-15,0,-18,6,-4,9],lgr(g,-18,0,-3,0,mix('#16306b','#16306b',0),col.base),OUT);
      poly(g,[-6,-6,-15,-3,-13,0,-15,3,-6,6],'rgba(255,255,255,.12)');
      ell(g,0,0,9.4,11,lgr(g,-6,-9,7,9,'#aeb9cb','#2c374a'),OUT,0);
      ell(g,0,-8.6,4.8,3.4,lgr(g,-3,-11,3,-6,col.light,col.dark),OUT);ell(g,0,8.6,4.8,3.4,lgr(g,-3,6,3,11,col.light,col.dark),OUT);
      ell(g,-.4,0,6.6,7.8,lgr(g,-4,-6,4,6,col.light,col.dark),OUT);
      circ(g,1.4,0,4.4,lgr(g,-2,-3,4,3,'#fff4cc','#c79b3a'),OUT);rr(g,3.4,-2,3,4,1.2,'#42d1ff');
      poly(g,[-2,-1.4,-6,0,-2,1.4],'#ffd15a');
      rr(g,5,1.6,16,3.6,1.4,'#0e131b',OUT);rr(g,17,1.2,5,4.4,1.2,'#ffd15a',OUT);
      break;}
    case'hero_kaz':{
      for(const s of[-1,1]){poly(g,[5,s*7,22,s*11,25,s*5.4,10,s*2],lgr(g,5,0,25,s*8,'#ffffff','#9aa6ba'),OUT);poly(g,[8,s*9,18,s*13,20,s*8],'#cfd9e8',OUT);}
      ell(g,-1,0,11.4,12.6,lgr(g,-8,-10,9,10,'#5a2a2a','#1a0d0f'),OUT);
      for(let i=0;i<5;i++){const x=-8+i*3.6;poly(g,[x,-10,x+2.2,-16.4,x+3.6,-9.6],col.light,OUT);poly(g,[x,10,x+2.2,16.4,x+3.6,9.6],col.light,OUT);}
      ell(g,-.6,0,8.4,9.6,lgr(g,-6,-8,6,8,col.base,col.dark),OUT);
      circ(g,2,0,5,lgr(g,-2,-4,5,4,'#3a2b2e','#0e0709'),OUT);poly(g,[4,-5.6,10,-9.4,6.4,-3.6],'#efe6d2',OUT);poly(g,[4,5.6,10,9.4,6.4,3.6],'#efe6d2',OUT);
      rr(g,4,-1.6,3.2,3.2,1,'#ff4020');
      break;}
    case'hero_lyra':{
      for(let i=0;i<5;i++){const a=Math.PI+(i-2)*.38;poly(g,[-2,0,Math.cos(a)*18,Math.sin(a)*13,Math.cos(a+.2)*14,Math.sin(a+.2)*10],i%2?col.base:col.dark,OUT);}
      ell(g,0,0,8,9.6,lgr(g,-6,-8,6,8,col.light,col.dark),OUT);
      ell(g,0,-8,4,3,lgr(g,-3,-10,3,-6,'#f2fff9',col.base),OUT);ell(g,0,8,4,3,lgr(g,-3,6,3,10,'#f2fff9',col.base),OUT);
      circ(g,1.4,0,4.6,lgr(g,-2,-3,4,3,'#f4fffb','#8fd8c4'),OUT);rr(g,3.4,-1.8,2.6,3.6,1,col.glow);
      line(g,4,-4,18,-2,'#d9fff3',1.3);circ(g,19,-2,2.4,rgr(g,19,-2,0,3,'#fff',col.glow));
      for(const s of[-1,1])circ(g,-6,s*10.6,2.2,rgr(g,-6,s*10.6,0,2.4,'#fff',col.glow));
      break;}
    default:circ(g,0,0,8,col.base,OUT);
  }
}
function unitSprite(type,f){
  const k=type+'|'+f;if(spriteCache[k])return spriteCache[k];
  const d=UDEF[type],S=Math.ceil((d.r+(d.hero?18:type==='titan'?24:type==='brute'?14:12))*2),cvs=mkCanvas(S*SC,S*SC),g=cvs.getContext('2d');
  g.translate(S*SC/2,S*SC/2);g.scale(SC,SC);g.lineJoin='round';g.lineCap='round';
  artUnit(g,type,d.creep?NEUTRAL_COL:facCol(f),f);
  return spriteCache[k]={cv:cvs,S};
}
