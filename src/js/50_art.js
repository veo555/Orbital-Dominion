/* =========================================================================
   ART (1/3) — drawing helpers and cached unit sprites
   Light comes from the north-west. Every sprite is drawn once onto an offscreen
   canvas at SC× resolution and then rotated / blitted every frame.
   ========================================================================= */
let SC=3;const OUT='rgba(5,9,16,.85)',M0='#1b2330',M1='#2e3a4f',M2='#51607a',M3='#8696b0',M4='#cfd9e8';
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
/* HUD canvases are authored in CSS pixels (their width/height attributes); the backing store follows devicePixelRatio so
   charts, sparklines and the minimap stay crisp on retina and phone screens. Returns a context already scaled to CSS px. */
function hd(cv){
  if(!cv._lw){cv._lw=cv.width;cv._lh=cv.height;}
  const k=Math.min(3,window.devicePixelRatio||1),W=Math.round(cv._lw*k),H=Math.round(cv._lh*k);
  if(cv.width!==W||cv.height!==H){cv.width=W;cv.height=H;}
  const g=cv.getContext('2d');g.setTransform(k,0,0,k,0,0);return g;
}
function mkCanvas(w,h){const c=document.createElement('canvas');c.width=Math.max(1,Math.ceil(w));c.height=Math.max(1,Math.ceil(h));return c;}
