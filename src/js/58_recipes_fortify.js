/* =========================================================================
   58_RECIPES_FORTIFY (v6-G1) — 3D mesh recipes for the defence structures, the Dropship and the rotating weapon heads
   (same primitives and materials as 57_recipes.js; RENDER-ONLY). Every structure stands on a plinth that fills its footprint at z = 0,
   so its contact shadow and the terrain meet (grounded). Faction identity: Meridian squared steel + blue light, Obsidian dark carapace
   with red veins and spikes, Aurora sleek teal panels with gold trim and floating orbs.
   ========================================================================= */
function fxGate(B,M,f,w,h){   // two pylons at the ends of the long axis and a low threshold between them; the barrier itself is drawn live (68_fortify_ui.js)
  const lx=w>=h,L=(lx?w:h)/2-8,P=(a,b)=>lx?[a,b]:[b,a];
  {const[x,y]=P(0,0);B.fr(x,y,0,w-2,h-2,w-4,h-4,2.5,M.d);B.box(x,y,2.5,lx?w-20:6,lx?6:h-20,1.4,M.k);}
  for(const s of[-1,1]){const[x,y]=P(s*L,0);
    if(f==='obsidian'){B.fr(x,y,0,15,15,7,7,30,M.h);B.cy(x,y,30,2.4,0,9,5,M.ae);B.cy(x,y,12,7.5,7.5,1.6,8,M.ae);}
    else if(f==='aurora'){B.cy(x,y,0,8,6,26,12,M.tl);B.cy(x,y,26,6.5,6.5,1.6,12,M.gd);B.sp(x,y,33,4,4,4,8,M.g);}
    else{B.box(x,y,0,14,14,28,M.h);B.box(x,y,28,15,15,3,M.t);B.box(x,y,10,15,15,1.5,M.g);}
    const[ex,ey]=P(s*(L-8),0);B.box(ex,ey,6,lx?2:5,lx?5:2,18,M.v);}
}
Object.assign(RB,{
 wall(B,M,f,w,h){
  if(f==='obsidian'){B.fr(0,0,0,31,31,25,25,12,M.d);B.fr(0,0,12,25,25,16,16,9,M.h);for(const s of[-1,1])B.cy(s*6,s*-4,20,2.2,0,9,5,M.ae);B.box(0,0,6,31.5,4,1.2,M.ae);}
  else if(f==='aurora'){B.fr(0,0,0,31,31,29,29,3,M.d);B.fr(0,0,3,26,20,22,16,17,M.tl);B.box(0,0,20,22,16,1.2,M.gd);B.sp(0,0,23,3,3,3,7,M.g);}
  else{B.fr(0,0,0,31,31,30,30,4,M.d);B.box(0,0,4,27,27,14,M.h);B.box(0,0,18,29,29,3,M.t);B.box(0,0,12,28,28,1.4,M.g);for(const sx of[-1,1])for(const sy of[-1,1])B.box(sx*10,sy*10,21,3,3,1.2,M.s);}},
 gate(B,M,f,w,h){fxGate(B,M,f,w,h);},
 gatev(B,M,f,w,h){fxGate(B,M,f,w,h);},
 bunker(B,M,f,w,h){B.fr(0,0,0,w-2,h-2,w-6,h-6,4,M.d);
  if(f==='obsidian'){const p=[];for(let i=0;i<10;i++){const a=i/10*TAU,r=i%2?22:27;p.push(Math.cos(a)*r,Math.sin(a)*r);}B.ex(p,4,15,M.h,.8);B.cy(0,0,19,16,10,6,10,M.d);for(let i=0;i<5;i++){const a=i/5*TAU+.3;B.cy(Math.cos(a)*22,Math.sin(a)*22,14,2.2,0,10,5,M.ae);}B.box(0,23,10,20,3,3,M.ae);}
  else if(f==='aurora'){B.cy(0,0,4,27,24,14,16,M.tl);B.sp(0,0,18,22,22,10,12,M.h,true);B.cy(0,0,18,24,24,1.5,16,M.gd);B.box(0,24,11,22,3,2.6,M.g);B.sp(0,0,28,3.4,3.4,3.4,7,M.g);}
  else{B.fr(0,0,4,52,52,46,46,16,M.h);B.fr(0,0,20,46,46,36,36,5,M.t);B.box(0,23.5,11,32,2,3.2,M.k);B.box(23.5,0,11,2,32,3.2,M.k);B.box(0,23.8,12,30,1,1.2,M.g);for(const sx of[-1,1])for(const sy of[-1,1])B.box(sx*21,sy*21,20,6,6,4,M.s);}},
 cannon(B,M,f,w,h){B.ex(Array.from({length:8},(_,i)=>[Math.cos(i/8*TAU+TAU/16)*29,Math.sin(i/8*TAU+TAU/16)*29]).flat(),0,6,M.d,.9);B.cy(0,0,6,22,19,6,12,M.h);B.cy(0,0,12,17,15,2,12,M.t);
  for(let i=0;i<4;i++){const a=i/4*TAU+TAU/8;B.box(Math.cos(a)*23,Math.sin(a)*23,6,6,6,5,M.k);}if(f==='obsidian')for(let i=0;i<4;i++){const a=i/4*TAU;B.cy(Math.cos(a)*24,Math.sin(a)*24,6,2.2,0,11,5,M.ae);}else if(f==='aurora')B.cy(0,0,12,19,19,1.2,16,M.gd);},
 flak(B,M,f,w,h){B.fr(0,0,0,w-4,h-4,w-10,h-10,5,M.d);B.cy(0,0,5,18,14,10,12,M.h);B.cy(0,0,15,12,12,2,12,M.t);for(const sx of[-1,1])for(const sy of[-1,1])B.box(sx*22,sy*22,5,6,6,8,f==='obsidian'?M.ae:M.s);
  if(f==='aurora')B.cy(0,0,15,13,13,1.2,14,M.gd);},
 sensor(B,M,f,w,h){B.fr(0,0,0,w-6,h-6,w-12,h-12,5,M.d);B.cy(0,0,5,13,10,8,10,M.h);B.cy(0,0,13,3,2.2,34,8,M.s);
  if(f==='aurora'){B.cy(0,0,47,15,12,2,16,M.tl);B.sp(0,0,49,5,5,5,8,M.g);for(let i=0;i<3;i++){const a=i/3*TAU;B.sp(Math.cos(a)*14,Math.sin(a)*14,52,2.4,2.4,2.4,6,M.gd);}}
  else if(f==='obsidian'){B.fr(0,0,45,30,6,22,3,6,M.h);B.cy(-13,0,48,1.6,0,8,5,M.ae);B.cy(13,0,48,1.6,0,8,5,M.ae);B.sp(0,0,52,3,3,3,6,M.ae);}
  else{B.fr(0,0,45,30,30,10,10,8,M.t);B.sp(0,0,53,4,4,4,7,M.g);B.box(0,0,47,32,3,1.4,M.w);}},
 battery(B,M,f,w,h){B.fr(0,0,0,w-4,h-4,w-10,h-10,4,M.d);B.cy(0,0,4,17,14,10,12,M.h);
  for(let i=0;i<4;i++){const a=i/4*TAU+TAU/8;B.cy(Math.cos(a)*20,Math.sin(a)*20,4,4,3,16,8,f==='aurora'?M.tl:M.t);B.sp(Math.cos(a)*20,Math.sin(a)*20,20,3,3,3,6,M.g);}
  B.cy(0,0,14,9,9,10,10,M.k);B.sp(0,0,24,9,9,9,10,M.g);if(f==='obsidian')B.cy(0,0,30,2.6,0,10,5,M.ae);else if(f==='aurora')B.cy(0,0,14,12,12,1.2,14,M.gd);},
 mine(B,M,f,w,h){B.cy(0,0,0,10,9,2.6,12,M.d);B.cy(0,0,2.6,7,6,1.6,12,f==='aurora'?M.tl:M.h);B.sp(0,0,4,2.6,2.6,1.8,6,f==='obsidian'?M.ae:M.g);for(let i=0;i<4;i++){const a=i/4*TAU+.4;B.box(Math.cos(a)*7.5,Math.sin(a)*7.5,2.6,2,2,1.2,M.k);}},
 rocks(B,M,f,w,h){const r=B.m('#6e6457',.25,14),r2=B.m('#544b41',.2,12),r3=B.m('#857a6b',.3,18);
  B.fr(0,0,0,32,32,26,26,6,r2);B.sp(-4,-3,6,12,11,13,8,r,true);B.sp(6,4,5,9,9,10,7,r3,true);B.sp(-6,7,4,7,6,7,6,r2,true);B.sp(7,-7,4,6,6,6,6,r,true);B.sp(-1,1,17,5,5,5,6,r3,true);}
});
Object.assign(RP,{
 cannonhead(B,M,f){B.cy(0,0,0,11,10,8,12,M.h);B.cy(0,0,8,8,6,3,12,M.t);B.cy(3,0,6,3.4,3,22,10,M.k,'x');B.cy(25,0,6,4.2,4.2,3,10,M.d,'x');B.box(-7,0,3,6,12,8,M.d);if(f==='obsidian')B.cy(-3,0,11,1.6,0,7,5,M.ae);else B.sp(0,0,11,2.6,2.6,2,6,M.g,true);},
 flakhead(B,M,f){B.cy(0,0,0,8,7,6,10,M.h);for(const s of[-1,1]){B.box(4,s*7,6,16,7,8,M.t);for(const k of[-1.6,1.6])B.cy(12,s*7+k,8,1.4,1.4,1.2,6,M.am,'x');}B.box(-6,0,4,5,8,6,M.d);if(f==='obsidian')B.cy(-2,0,9,1.4,0,6,5,M.ae);},
 fortgun(B,M,f){B.cy(0,0,0,12,11,7,12,M.d);B.cy(0,0,7,9,8,3,12,M.t);for(const s of[-1,1])B.cy(4,s*4,6,2.4,2.2,26,9,M.k,'x');B.box(-8,0,4,8,14,8,M.h);B.sp(0,0,10,3,3,2.4,6,f==='obsidian'?M.ae:M.g,true);}
});
RU.dropship=function(B,M,f){
  B.ex([20,0,14,-6,-8,-9,-16,-6,-16,6,-8,9,14,6],4,8,M.h,.6);B.fr(2,0,12,18,10,12,7,3,M.t,-1,0);B.sp(13,0,10,5,4,3,7,M.gl,true);
  for(const s of[-1,1]){B.fr(-4,s*12,6,14,6,10,3,2,M.t,-2,s*2);B.cy(-4,s*15,4,4.4,4.4,7,10,M.d,'x');B.cy(-11,s*15,4,3.4,3.4,1,10,M.am,'x');}
  B.box(-13,0,6,4,10,6,M.d);B.box(-15.5,0,7,1,7,3,M.am);
  if(f==='obsidian')for(const s of[-1,1])B.cy(6,s*5,12,1.2,0,6,4,M.ae);else if(f==='aurora'){B.fr(-6,0,12,10,14,1,8,6,M.tl);B.sp(-2,0,18,2,2,2,6,M.gd);}
};
