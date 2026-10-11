/* =========================================================================
   RECIPES (v5) — every unit and building as a short list of mesh primitives (see 56_mesh3d.js), plus the lazy sprite bakers.
   Units face +x and are baked for 16 facings (8 on the battery tier), buildings once, turret heads as a separate rotating part.
   Faction identity: Meridian = squared steel plates + cool blue; Obsidian = dark carapace, red glowing veins, spikes;
   Aurora = sleek teal hulls, pale panels, gold trim, floating orbs.
   ========================================================================= */
const FMAT={meridian:{h:'#8896b0',d:'#26324a',a:'#e8f0ff'},obsidian:{h:'#4b323d',d:'#150b10',a:'#ff5a4a'},aurora:{h:'#3f8a96',d:'#10343a',a:'#e8c25a'},neutral:{h:'#6a5a88',d:'#2a2040',a:'#b79cff'}};
function bakeMats(B,c,f){const F=FMAT[f]||FMAT.neutral;
  return{h:B.m(F.h,.45,34),d:B.m(F.d,.25,16),t:B.m(c.base,.5,38),tl:B.m(c.light,.55,44),g:B.m(c.glow,0,1,1),a:B.m(F.a,.4,30),ae:B.m(F.a,0,1,1),
    s:B.m('#a9b4c6',.7,48),gl:B.m('#6ad4f2',.9,70),v:B.m('#46e4ff',0,1,1),w:B.m('#eef3fa',.5,40),am:B.m('#ffb347',0,1,1),k:B.m('#0d1118',.2,12),
    gd:B.m('#e5b94a',.8,50),br:B.m('#8a6a44',.3,20)};
}
const RU={
 hauler(B,M,f){B.box(0,-8.5,0,20,5.5,5,M.k);B.box(0,8.5,0,20,5.5,5,M.k);B.fr(-1.5,0,3,17,13,15,10,7,M.h);B.fr(-2.5,0,10,12,9,10,7,2,M.t);
  B.fr(5.5,0,3,6,9,4,7,6,M.h);B.box(8.4,0,6.5,1.2,5.4,2.2,M.v);B.box(-8,0,10,2.2,2.2,10,M.s);B.box(-4,0,19,10,2,1.6,M.s);B.box(-9.8,0,3,3,10,6,M.d);
  if(f==='obsidian'){B.cy(1,-5,10,1.5,0,6,5,M.ae);B.cy(1,5,10,1.5,0,6,5,M.ae);}else if(f==='aurora'){B.fr(-9,0,7,2,12,0.6,7,8,M.tl);}},
 rifleman(B,M,f){B.box(-1,-2.8,0,4,3.4,5,M.d);B.box(-1,2.8,0,4,3.4,5,M.d);B.fr(-.5,0,4,9,12,8,9,8,M.h);B.fr(.5,0,10,7,9,5,7,1.6,M.t);
  B.box(-1,-6.8,8,4.4,3.2,4.4,M.t);B.box(-1,6.8,8,4.4,3.2,4.4,M.t);B.sp(1.5,0,12.5,3.9,3.9,3.9,6,M.h);B.box(4.8,0,12.8,1.4,4,2,M.v);
  B.box(5,3.6,8.2,13,2.2,2.6,M.k);B.box(17.5,3.6,8.4,3,2.6,2,M.s);B.box(-4.5,0,5,3,6,6,M.d);
  if(f==='obsidian'){B.cy(0,-2.6,15,1.4,0,5.5,5,M.ae);B.cy(0,2.6,15,1.4,0,5.5,5,M.ae);}else if(f==='aurora'){B.fr(-6.5,0,3,2,9,0.6,5,10,M.tl);}},
 raptor(B,M,f){B.ex([14,0,5,-3.6,-3,-8.5,-10,-3,-8,0,-10,3,-3,8.5,5,3.6],1.5,5.5,M.h,.55);B.ex([8,0,2,-2.6,-4,-4.8,-7,-1.6,-7,1.6,-4,4.8,2,2.6],6.5,2.4,M.t,.6);
  for(const s of[-1,1]){B.fr(10,s*5.2,2,9,1.6,1,.8,3,M.w,3,s*2.6);B.fr(5,s*8,3,8,1.4,.8,.6,2.4,M.s,2,s*2);if(f==='obsidian')B.fr(-4,s*7,3,6,1.4,.4,.5,5,M.ae,-3,s*2);}
  B.box(6.2,-2,7,1.6,1.6,1,M.am);B.box(6.2,2,7,1.6,1.6,1,M.am);B.fr(-9,0,3,4,5,2,1,2,M.d);
  if(f==='aurora')B.fr(-4,0,8,10,1.2,1,.6,6,M.tl,-4,0);},
 rocketeer(B,M,f){B.box(-1,0,0,10,12,5,M.d);B.fr(0,0,4,10,11,8,9,8,M.h);B.fr(1,0,10,6,8,4,6,1.6,M.t);
  for(const s of[-1,1]){B.cy(-6,s*8.4,7,2.4,2.4,17,8,M.k,'x');B.cy(11,s*8.4,7,1.6,1.6,.8,8,M.am,'x');B.box(-2,s*5.6,5,5,2.5,4,M.h);}
  B.sp(1.6,0,13.4,4,4,4,6,M.h);B.box(5,0,13.6,1.4,4.4,2,M.am);B.box(-4.5,0,4,3,7,7,M.d);if(f==='obsidian')B.cy(-1,0,17,1.6,0,6,5,M.ae);},
 mender(B,M,f){B.box(-1,-2.8,0,4,3.4,5,M.d);B.box(-1,2.8,0,4,3.4,5,M.d);B.fr(-.5,0,4,9,11,8,9,8,M.w);B.fr(.5,0,10,6,8,4,6,1.4,M.t);
  B.box(-4.6,0,5,4,8,8,M.w);B.box(-6.7,0,8,.6,2,5,M.g);B.box(-6.7,0,9.5,.6,5,2,M.g);B.sp(1.5,0,12.5,3.8,3.8,3.8,6,M.w);B.box(4.6,0,12.8,1.4,4,2,M.g);
  B.sp(-1,0,22,2.6,2.6,2.6,6,M.g);B.cy(-1,0,15,.7,.7,5,5,M.s);B.box(5.5,-5,7,2,4,2,M.s);},
 howitzer(B,M,f){B.box(0,-10.5,0,26,6,6,M.k);B.box(0,10.5,0,26,6,6,M.k);B.fr(0,0,4,24,18,22,16,6,M.h);B.fr(-2,0,10,14,13,11,10,6,M.t);
  B.cy(4,0,14,3.4,2.6,12,8,M.d,'x');B.cy(16,0,14,2.6,3.4,8,8,M.s,'x');B.cy(24,0,14,3.8,3.8,3,8,M.k,'x');B.box(-7,0,16,6,8,3,M.d);B.box(-11,-4,4,3,3,4,M.d);B.box(-11,4,4,3,3,4,M.d);
  if(f==='obsidian'){B.cy(-3,-5,16,1.6,0,7,5,M.ae);B.cy(-3,5,16,1.6,0,7,5,M.ae);}else if(f==='aurora')B.fr(-9,0,8,3,16,1,10,6,M.tl);},
 juggernaut(B,M,f){for(const s of[-1,1]){B.fr(-1,s*11,0,9,6,8,5,10,M.d);B.box(3,s*11,0,12,7,3,M.k);B.fr(-2,s*14,9,10,5,8,4,8,M.t);B.cy(7,s*14,15,2.8,2.8,16,8,M.k,'x');B.cy(22,s*14,15,2,3.2,3,8,M.s,'x');}
  B.fr(-2,0,9,26,18,20,14,9,M.h);B.fr(-3,0,17,15,11,10,7,5,M.t);B.sp(6,0,17,6,6,4.6,7,M.d,true);B.box(10.4,0,19,1.4,6,2.2,M.v);B.box(-13,0,10,3,12,10,M.d);
  if(f==='obsidian')for(const s of[-1,1])B.cy(-8,s*6,21,2,0,9,5,M.ae);else if(f==='aurora')B.fr(-12,0,18,3,18,1,10,10,M.tl);},
 skiff(B,M,f){B.ex([15,0,6,-3.4,-7,-4.2,-11,0,-7,4.2,6,3.4],4,4.2,M.h,.5);B.fr(0,0,7,10,4,7,3,3,M.t,-1,0);
  for(const s of[-1,1]){B.fr(-2,s*10,4,12,10,6,1,1.6,M.t,-4,s*4);B.box(-9,s*4,4,5,2.6,2.6,M.d);B.box(-11.2,s*4,4.4,1.6,2,1.8,M.am);}
  B.sp(5,0,8,4.6,2.8,2.2,6,M.gl,true);if(f==='obsidian')for(const s of[-1,1])B.cy(10,s*3.4,6,1,0,6,4,M.ae,'x');},
 titan(B,M,f){for(const sx of[-1,1])for(const sy of[-1,1]){B.fr(sx*11,sy*14,0,9,7,8,6,12,M.d);B.box(sx*11+2,sy*14,0,13,10,3,M.k);}
  B.fr(0,0,10,36,30,30,24,12,M.h);B.fr(-3,0,22,24,20,16,14,7,M.t);B.sp(5,0,26,9,9,6,8,M.d,true);B.cy(10,0,28,4.2,3.4,22,10,M.d,'x');B.cy(31,0,28,3.4,5,4,10,M.s,'x');
  B.box(-18,0,12,4,22,14,M.d);B.sp(-2,0,30,3,3,2.4,6,M.g,true);for(const s of[-1,1]){B.fr(0,s*14,20,14,5,8,3,6,M.t);B.box(8,s*14,26,8,2,2,M.k);}
  if(f==='obsidian')for(let i=-2;i<=2;i++)B.cy(-10,i*5,24,1.8,0,8+(i&1)*3,5,M.ae);else if(f==='aurora'){B.fr(-14,0,22,4,26,1,14,10,M.tl);}},
 freighter(B,M,f){B.box(0,-9,0,24,5,5,M.k);B.box(0,9,0,24,5,5,M.k);B.fr(-2,0,3,26,16,24,14,5,M.h);B.box(-6,-3,8,11,8,8,M.t);B.box(-6,5,8,11,6,6,M.br);B.box(5,3,8,8,8,6,M.tl);
  B.fr(10,0,3,8,12,6,10,7,M.h);B.box(14,0,8,1,8,3,M.v);B.box(-1,0,8,0.8,0.8,0.8,M.d);if(f==='obsidian')B.cy(8,0,10,1.6,0,6,5,M.ae);},
 bulwark(B,M,f){B.box(-1,-7,0,12,6,7,M.d);B.box(-1,7,0,12,6,7,M.d);B.fr(-1,0,6,18,16,15,13,10,M.h);B.fr(-1,0,15,11,10,8,7,4,M.t);
  B.ex([9,-11,12,-6,12.5,6,9,11,6.5,8,6.5,-8],2,17,M.tl,.8);B.ex([10.4,-9,11.6,-5,12,5,10.4,9],14,2,M.g,1);B.sp(1,0,19,4.4,4.4,3.6,6,M.h,true);B.box(5,0,20,1.4,4.6,1.8,M.v);
  B.cy(4,5,12,1.4,1.4,10,6,M.k,'x');if(f==='obsidian')B.cy(-6,0,16,1.8,0,7,5,M.ae);},
 reaver(B,M,f){B.fr(0,0,3,10,12,8,9,9,M.h);B.fr(1,0,10,6,8,4,6,1.6,M.t);B.sp(2,0,14,4,4,3.6,6,M.d);B.box(5.4,0,14,1.4,5,1.6,M.am);B.box(-1,-3,0,4,3,4,M.d);B.box(-1,3,0,4,3,4,M.d);
  for(const s of[-1,1]){B.fr(4,s*8,6,5,4,2,2,4,M.h,0,0);B.fr(11,s*8.5,5,16,2.2,1,.6,3,M.s,5,s*1.5);B.fr(3,s*5,13,3,2,0.5,.5,8,M.ae,-2,s*2);}
  B.cy(0,-2.4,14,1.2,0,5,5,M.ae);B.cy(0,2.4,14,1.2,0,5,5,M.ae);if(f==='aurora')B.fr(-6,0,5,2,10,0.6,6,9,M.tl);},
 specter(B,M,f){B.box(-1,-2,0,3,2.6,6,M.d);B.box(-1,2,0,3,2.6,6,M.d);B.fr(-.5,0,5,7,8,5,6,9,M.h);B.fr(-5,0,3,3,10,1,5,11,M.d,-1,0);B.sp(1.2,0,14.5,3.4,3.4,3.6,6,M.h);B.box(4,0,15,1.2,3.6,1.4,M.g);
  B.fr(5,3.6,8,15,1.6,.6,.8,2.2,M.tl,2,0);B.box(-.5,-5.2,8,2.6,2.6,3,M.t);B.box(-.5,5.2,8,2.6,2.6,3,M.t);B.sp(-4,0,22,1.6,1.6,1.6,5,M.g);},
 crawler(B,M,f){B.sp(0,0,4,10,6.4,4.4,7,M.h);B.sp(2,0,7,6,4.2,2.6,6,M.t);B.sp(9,0,4,3.6,3,2.8,6,M.d);B.box(11.4,-1.6,3,1,.8,1,M.am);B.box(11.4,1.6,3,1,.8,1,M.am);
  for(let i=-1;i<=1;i++)for(const s of[-1,1])B.fr(i*5,s*7.4,0,1.6,5,1.2,1.6,5,M.d,0,s*1);for(const s of[-1,1])B.fr(12,s*2.4,2,4,.8,.4,.4,2,M.s,2,s*1.4);},
 spitter(B,M,f){B.sp(-2,0,4,8,5.4,4,7,M.h);B.sp(-4,0,7,6,4.4,5,7,M.g,true);B.sp(7,0,5,3.6,3,3,6,M.d);B.box(9.2,-1.4,5,1,.8,.8,M.am);B.box(9.2,1.4,5,1,.8,.8,M.am);B.cy(-8,0,6,1.2,3,6,6,M.t,'x');
  for(const s of[-1,1]){B.fr(0,s*6,0,1.6,4,1.2,1.6,4,M.d,0,s);B.fr(-5,s*5.6,0,1.6,4,1.2,1.6,4,M.d,0,s);}},
 brute(B,M,f){for(const s of[-1,1]){B.fr(-3,s*9,0,7,6,6,5,8,M.d);B.fr(7,s*9,0,7,6,6,5,8,M.d);}B.sp(0,0,8,15,11,8,8,M.h);B.sp(1,0,13,10,8,5,7,M.t,true);B.sp(11,0,10,5,4.6,4.2,7,M.d);
  B.box(14.6,-1.8,11,1.4,1,1.2,M.am);B.box(14.6,1.8,11,1.4,1,1.2,M.am);for(const s of[-1,1]){B.cy(10,s*4.4,13,1.5,0,9,5,M.a);B.fr(2,s*13,6,9,5,6,4,8,M.d,6,s*2);}
  for(let i=-2;i<=2;i++)B.cy(-3,i*3,16,1.4,0,5+(i&1)*2,5,M.ae);},
 hero_idris(B,M,f){B.box(-1,-3.2,0,5,3.6,6,M.d);B.box(-1,3.2,0,5,3.6,6,M.d);B.fr(-.5,0,5,11,14,9,11,9,M.h);B.fr(.5,0,12,8,10,6,8,2,M.t);
  for(const s of[-1,1])B.fr(-1,s*8.6,10,6,5,4,3,5,M.t);B.sp(1.5,0,15,4.4,4.4,4.4,6,M.h);B.box(5.2,0,15.4,1.4,4.4,2.2,M.v);B.box(6,4,9.4,15,2.6,3,M.k);B.box(21,4,9.8,3.4,3,2.4,M.s);
  B.box(-6,0,5,2,8,10,M.d);B.cy(-7,-4,6,.7,.7,24,5,M.s);B.box(-7.4,-4,22,.6,9,6,M.t);B.box(-7.6,-4,23,.4,6,3,M.g);B.cy(1.5,0,19,1,0,6,5,M.gd);},
 hero_kaz(B,M,f){B.box(-1,-4,0,6,4.4,7,M.d);B.box(-1,4,0,6,4.4,7,M.d);B.fr(-1,0,6,13,16,11,13,11,M.h);B.fr(0,0,15,9,12,7,9,3,M.t);
  for(const s of[-1,1]){B.fr(0,s*10,12,7,6,5,4,6,M.t);B.cy(0,s*11,18,1.8,0,9,5,M.ae);B.fr(8,s*10,5,14,3,1,1,5,M.s,4,s*2);}
  B.sp(2,0,19,5,5,4.6,6,M.d);B.box(6.2,0,19.6,1.6,5,1.8,M.am);B.cy(2,-4,22,1.4,0,8,5,M.a);B.cy(2,4,22,1.4,0,8,5,M.a);B.box(-7,0,8,3,10,12,M.d);
  for(let i=-2;i<=2;i++)B.cy(-5,i*3,18,1.2,0,5+(i&1)*2,5,M.ae);B.fr(9,-12,3,3,3,2.4,2.4,22,M.k,0,0);B.fr(9,-12,22,10,2,1,1,8,M.s,0,-2);},
 hero_lyra(B,M,f){B.box(-1,-2.2,0,3.4,2.6,6,M.d);B.box(-1,2.2,0,3.4,2.6,6,M.d);B.fr(-.5,0,5,7,9,5,7,10,M.h);B.fr(-6,0,3,3,12,1,6,13,M.tl,-1,0);B.fr(.5,0,12,5,7,3,5,2,M.t);
  B.sp(1.4,0,17,3.6,3.6,3.8,6,M.w);B.box(4.4,0,17.4,1.2,3.8,1.6,M.g);B.fr(1.4,0,20,3,3,1,1,4,M.gd,0,0);
  for(let i=0;i<3;i++){const a=i/3*TAU;B.sp(-1+Math.cos(a)*10,Math.sin(a)*10,16+i*2,2.2,2.2,2.2,5,M.g);}B.box(5,4,9,12,1.4,1.4,M.tl);B.sp(17.5,4,9.7,1.8,1.8,1.8,5,M.g);}
};
/* turret head: a separate part so it can aim independently of the base */
const RP={turrethead(B,M,f){B.cy(0,0,0,9,8,7,10,M.h);B.cy(0,0,7,6.4,5,3,10,M.t);B.cy(2,-3,6,1.5,1.5,19,7,M.k,'x');B.cy(2,3,6,1.5,1.5,19,7,M.k,'x');B.cy(20,-3,6,2,2,2,7,M.am,'x');B.cy(20,3,6,2,2,2,7,M.am,'x');
  B.sp(0,0,10,3,3,2.4,6,M.g,true);B.box(-6,0,3,4,8,6,M.d);if(f==='obsidian')B.cy(-3,0,10,1.4,0,6,5,M.ae);}};
const RB={
 hub(B,M,f,w,h){
  if(f==='obsidian'){const p=[];for(let i=0;i<16;i++){const a=i/16*TAU,r=i%2?34:60;p.push(Math.cos(a)*r,Math.sin(a)*r);}B.ex(p,0,12,M.h,.7);const q=[];for(let i=0;i<12;i++){const a=i/12*TAU+.1,r=i%2?18:36;q.push(Math.cos(a)*r,Math.sin(a)*r);}B.ex(q,12,12,M.d,.65);
    B.cy(0,0,22,15,5,16,10,M.d);B.cy(0,0,38,6,0,22,6,M.ae);for(let i=0;i<8;i++){const a=i/8*TAU;B.cy(Math.cos(a)*44,Math.sin(a)*44,6,3.2,0,22+(i&1)*8,5,M.d);B.sp(Math.cos(a)*44,Math.sin(a)*44,14,2,2,2,5,M.ae);}
    for(const sx of[-1,1])for(const sy of[-1,1]){B.fr(sx*52,sy*52,0,12,12,5,5,28,M.h);B.sp(sx*52,sy*52,28,3,3,3,6,M.ae);}B.cy(0,0,12,19,19,.8,16,M.ae);}
  else if(f==='aurora'){B.cy(0,0,0,58,52,6,22,M.d);B.cy(0,0,6,50,44,5,22,M.h);B.cy(0,0,11,38,30,10,18,M.tl);
    for(let i=0;i<6;i++){const a=i/6*TAU;B.sp(Math.cos(a)*42,Math.sin(a)*42,9,13,6,10,7,M.h,true);B.sp(Math.cos(a)*42,Math.sin(a)*42,18,4,4,3,6,M.g);}
    B.fr(0,0,21,24,24,0,0,34,M.w,0,0);B.sp(0,0,52,5,5,5,7,M.g);for(const sx of[-1,1])for(const sy of[-1,1]){B.fr(sx*50,sy*50,0,10,10,3,3,24,M.gd);B.sp(sx*50,sy*50,26,3.6,3.6,3.6,6,M.g);}
    for(let i=0;i<3;i++){const a=i/3*TAU;B.sp(Math.cos(a)*18,Math.sin(a)*18,38+i*3,3,3,3,6,M.gd);}}
  else{B.ex(Array.from({length:8},(_,i)=>[Math.cos(i/8*TAU+TAU/16)*60,Math.sin(i/8*TAU+TAU/16)*60]).flat(),0,10,M.d,.92);
    B.ex(Array.from({length:8},(_,i)=>[Math.cos(i/8*TAU+TAU/16)*50,Math.sin(i/8*TAU+TAU/16)*50]).flat(),10,8,M.h,.9);B.cy(0,0,18,36,30,10,16,M.h);B.cy(0,0,28,26,22,6,16,M.t);B.cy(0,0,34,18,16,10,14,M.h);B.sp(0,0,44,15,15,9,10,M.tl,true);B.sp(0,0,50,6,6,5,8,M.g);
    for(const sx of[-1,1])for(const sy of[-1,1]){B.cy(sx*47,sy*47,0,12,10,14,10,M.h);B.cy(sx*47,sy*47,14,8,8,2,10,M.t);B.sp(sx*47,sy*47,16,4.4,4.4,3.4,7,M.g,true);}
    B.fr(0,53,0,22,12,18,10,12,M.d);B.box(0,53,12,16,6,4,M.t);for(let i=0;i<4;i++)B.box(-16+i*10.6,-30,32,6,2,1.4,M.d);B.cy(0,0,30,2,1,26,6,M.s);B.cy(0,0,56,1,0,8,5,M.t);}},
 generator(B,M,f,w,h){B.cy(0,0,0,24,21,8,14,M.d);B.cy(0,0,8,17,15,10,14,M.h);B.cy(0,0,18,15,15,2.4,14,M.g);B.sp(0,0,20,10,10,9,8,M.gl,true);
  for(let i=0;i<4;i++){const a=i/4*TAU+TAU/8;B.cy(Math.cos(a)*19,Math.sin(a)*19,0,4,3.4,14,8,M.t);B.sp(Math.cos(a)*19,Math.sin(a)*19,14,2.8,2.8,2.6,6,M.g,true);}
  if(f==='obsidian')for(let i=0;i<4;i++){const a=i/4*TAU;B.cy(Math.cos(a)*10,Math.sin(a)*10,26,1.6,0,9,5,M.ae);}},
 depot(B,M,f,w,h){B.fr(0,0,0,56,56,54,54,4,M.d);B.fr(0,2,4,44,34,40,30,10,M.h);B.fr(0,2,14,38,28,34,24,2,M.t);B.box(0,-22,4,40,8,8,M.k);
  for(let i=0;i<8;i++)B.box(-21+i*6,-26,4,3,2,8.4,i&1?M.gd:M.k);B.fr(-18,20,4,12,10,10,9,9,M.br);B.fr(18,18,4,12,10,10,9,13,M.br);B.cy(-18,-20,4,3,3,26,6,M.s);B.box(-12,-20,28,18,2.4,2,M.s);B.sp(0,0,17,5,5,3,6,M.g,true);B.box(0,25,4,16,5,5,M.t);},
 siphon(B,M,f,w,h){B.cy(0,0,0,26,23,6,14,M.d);B.cy(0,0,6,15,13,3,14,M.k);B.cy(0,0,8,11,11,1.6,14,M.g);B.sp(0,0,8,9,9,10,8,M.g,true);
  for(const sx of[-1,1])for(const sy of[-1,1]){B.fr(sx*20,sy*20,0,6,6,2.4,2.4,24,M.t);B.sp(sx*20,sy*20,24,3.4,3.4,3.4,6,M.s);}B.box(0,0,24,38,3.6,3,M.s);B.box(0,0,24,3.6,38,3,M.s);B.cy(0,0,24,6,4,10,10,M.h);B.sp(0,0,34,3.4,3.4,3.4,6,M.g);},
 habitat(B,M,f,w,h){B.cy(0,0,0,26,24,5,16,M.d);B.sp(0,0,5,22,22,22,10,M.gl,true);B.cy(0,0,5,22,22,2,16,M.w);B.cy(0,0,12,24,23,1.6,16,M.w);
  for(let i=0;i<8;i++){const a=i/8*TAU+.2;B.box(Math.cos(a)*18,Math.sin(a)*18,5,3.6,3.6,5,M.ae);}for(const[x,y]of[[-25,24],[25,24],[25,-24]]){B.sp(x,y,2,4.4,4.4,5,6,B.m('#3f9a4a',.3,20));}
  B.sp(0,0,12,8,8,6,7,M.am,true);B.cy(0,0,26,.8,.8,7,5,M.s);},
 garrison(B,M,f,w,h){B.fr(0,0,0,w-6,h-6,w-10,h-10,5,M.d);B.fr(0,-6,5,70,52,64,48,17,M.h,0,0);B.fr(0,-6,22,66,48,54,34,8,M.t,0,2);B.fr(0,-6,30,52,30,44,22,2,M.h);
  B.box(0,21,5,28,3,18,M.k);B.box(0,22.6,19,28,1.4,3,M.g);for(let i=-2;i<=2;i++)B.box(i*11,-30,22,1.4,1.2,8,M.d);
  for(const s of[-1,1]){B.cy(s*36,-30,0,8,7,26,10,M.h);B.sp(s*36,-30,26,6,6,5,7,M.t,true);B.cy(s*36,-30,29,.7,.7,12,5,M.s);B.box(s*38,22,5,6,6,12,M.d);B.box(s*38,22.2,12,3,6,2,M.v);}
  B.cy(0,-6,32,6,5,4,10,M.s);B.box(0,-6,36,16,2,1.6,M.s);if(f==='obsidian')for(const s of[-1,1])B.cy(s*20,-6,30,2.4,0,12,5,M.ae);else if(f==='aurora'){B.fr(0,-6,34,40,2,1,1,8,M.gd);}},
 armory(B,M,f,w,h){B.fr(0,0,0,w-6,h-6,w-10,h-10,5,M.d);B.fr(0,6,5,64,38,58,34,14,M.h);B.fr(0,6,19,60,34,40,22,5,M.t);B.cy(0,-14,5,17,14,6,14,M.d);B.cy(0,-14,11,12,12,2,14,M.k);
  B.sp(0,-14,13,11,11,9,9,M.s,true);B.cy(0,-14,19,2,1.4,10,6,M.s);B.sp(0,-14,30,2.6,2.6,2.6,5,M.g);for(const s of[-1,1])for(let i=0;i<3;i++)B.box(s*36,-24+i*11,5,5,8,10,M.d);
  for(let i=0;i<5;i++)B.box(-14+i*7,32,5,5,3,5,i%2?M.t:M.tl);B.box(0,34,10,34,1,2,M.g);},
 forum(B,M,f,w,h){B.cy(0,0,0,46,44,4,24,M.w);B.cy(0,0,4,41,40,3,24,M.h);for(let i=0;i<10;i++){const a=i/10*TAU;B.cy(Math.cos(a)*36,Math.sin(a)*36,7,3.8,3.2,17,8,M.w);}
  B.cy(0,0,24,40,38,3,24,M.w);B.cy(0,0,27,30,26,5,20,M.t);B.sp(0,0,32,16,16,12,10,M.gd,true);B.sp(0,0,44,4,4,4,6,M.g);
  for(const s of[-1,1])B.fr(s*6,40,0,18,6,14,4,6,M.h);},
 exchange(B,M,f,w,h){B.fr(0,0,0,w-6,h-6,w-10,h-10,4,M.d);B.fr(0,2,4,72,56,68,52,16,M.h);B.fr(0,-22,20,76,18,72,12,4,M.t,0,-2);
  for(let i=0;i<8;i++)B.fr(-31.5+i*9,-23,20,9,16,9,14,3,i&1?M.w:M.t,0,0);B.cy(0,12,20,15,15,3,14,M.gd);B.sp(0,12,22,14,14,8,10,M.gd,true);B.sp(0,12,30,3,3,3,6,M.g);
  for(const[x,y]of[[-30,24],[30,24],[-28,-4]])B.fr(x,y,4,12,10,10,8,10,M.br);B.cy(30,-36,20,.8,.8,16,5,M.s);B.sp(30,-36,36,3,3,3,6,M.g);},
 foundry(B,M,f,w,h){B.fr(0,0,0,w-6,h-6,w-10,h-10,4,M.d);B.fr(-6,2,4,64,52,60,48,24,M.h);B.fr(-6,2,28,56,44,50,38,3,M.t);B.fr(26,4,4,24,34,22,30,14,M.d);
  for(const x of[-30,-16]){B.cy(x,-16,28,5,4,26,9,M.k);B.cy(x,-16,54,4,4,2,9,M.am);}B.box(14,24,4,10,3,14,M.d);B.box(14,25.6,10,8,1.6,8,M.am);B.box(-6,30,4,50,8,6,M.k);for(let i=0;i<8;i++)B.box(-28+i*7.4,30,10,4,6,1.2,M.t);
  B.fr(38,4,18,10,24,8,20,8,M.k);B.sp(34,2,18,5,5,4,6,M.am);},
 airfield(B,M,f,w,h){B.fr(0,0,0,w-6,h-6,w-10,h-10,2.5,M.d);for(const s of[-1,1]){B.box(s*20,0,2.5,18,80,.8,M.k);for(let j=0;j<7;j++){B.box(s*20,-34+j*11,3.3,2,6,.4,M.w);B.box(s*28.4,-34+j*11,3.3,1.4,1.4,1.4,M.am);}}
  B.fr(0,0,2.5,26,26,24,24,12,M.h);B.fr(0,0,14,28,28,22,22,3,M.t);B.sp(0,0,17,8,8,4,7,M.s,true);B.box(0,0,17,12,1.4,1,M.w);B.box(0,0,17,1.4,12,1,M.w);
  B.cy(34,-34,2.5,5,4,26,9,M.h);B.sp(34,-34,28.5,6.4,6.4,5,8,M.gl,true);B.sp(34,-34,35,1.6,1.6,1.6,5,M.g);},
 turret(B,M,f,w,h){B.ex(Array.from({length:8},(_,i)=>[Math.cos(i/8*TAU+TAU/16)*27,Math.sin(i/8*TAU+TAU/16)*27]).flat(),0,6,M.d,.9);B.cy(0,0,6,20,17,5,12,M.h);B.cy(0,0,11,15,13,2,12,M.t);
  for(let i=0;i<8;i++){const a=i/8*TAU;B.box(Math.cos(a)*24,Math.sin(a)*24,6,4,4,3,M.k);}if(f==='obsidian')for(let i=0;i<4;i++){const a=i/4*TAU+TAU/8;B.cy(Math.cos(a)*22,Math.sin(a)*22,6,2,0,10,5,M.ae);}}
};
const RN={post(B,M){B.fr(0,0,0,58,58,56,56,4,M.d);B.fr(0,-8,4,50,34,46,30,14,M.br);for(let i=0;i<6;i++)B.fr(-22.5+i*9,-8,18,9,34,9,28,5,i&1?M.w:B.m('#a8343b',.4,30),0,-2);
  B.fr(-12,16,4,14,12,12,10,12,M.br);B.fr(10,18,4,12,10,10,9,9,M.br);B.sp(-12,16,16,6,6,3,6,M.gd,true);B.sp(10,18,13,4,4,3,5,B.m('#6df0c8',.5,30));B.cy(24,-24,4,.9,.9,24,5,M.s);B.fr(24,-24,22,1,12,1,6,6,M.gd,6,0);B.sp(0,0,22,3,3,3,5,M.g);},
 tower(B,M){B.cy(0,0,0,29,26,6,14,M.d);B.cy(0,0,6,22,18,10,12,M.h);B.cy(0,0,16,14,10,14,10,M.d);B.sp(0,0,30,9,9,8,8,M.tl,true);B.sp(0,0,32,4,4,4,6,M.g);for(let i=0;i<4;i++){const a=i/4*TAU;B.fr(Math.cos(a)*22,Math.sin(a)*22,0,5,5,2,2,16,M.s);B.sp(Math.cos(a)*22,Math.sin(a)*22,16,2.4,2.4,2.4,5,M.g);}}};

/* ------------------------------ lazy sprite bakers ------------------------------ */
const meshCache={};
let bakeMs=0,bakeFrame=0,bakeLog=null;   // bakeLog (tests/perf): per-kind bake times in ms
function meshFor(kind,type,f,w,h){
  const k=kind+'|'+type+'|'+f;if(meshCache[k])return meshCache[k];
  const B=Mesh3(),c=f==='neutral'?NEUTRAL_COL:FACTIONS[f].col,M=bakeMats(B,c,f);
  (kind==='u'?RU:kind==='p'?RP:kind==='n'?RN:RB)[type](B,M,f,w,h);
  B.bd=meshBounds(B);return meshCache[k]=B;
}
let spritePx=0,spriteTick=0;
function lruTouch(sp){sp.lu=++spriteTick;return sp;}
function lruAdd(sp){
  spritePx+=sp.cv.width*sp.cv.height*2;
  if(spritePx<14e6)return;
  const ks=Object.keys(spriteCache).filter(k=>spriteCache[k].lu&&spriteCache[k].cv).sort((a,b)=>spriteCache[a].lu-spriteCache[b].lu);let px=0;
  for(const k of ks)px+=spriteCache[k].cv.width*spriteCache[k].cv.height*2;
  for(const k of ks){if(px<10e6)break;const s=spriteCache[k];px-=s.cv.width*s.cv.height*2;s.cv.width=s.cv.height=0;if(s.fp)s.fp.width=s.fp.height=0;delete spriteCache[k];}
  spritePx=px;
}
function bakeSprite(kind,type,f,yaw,sc,w,h){
  const t0=performance.now(),M=meshFor(kind,type,f,w,h),bd=M.bd,pad=3,
    x0=Math.floor(bd[2]-pad),x1=Math.ceil(bd[3]+pad),y0=Math.floor(bd[4]-K3*bd[1]-pad),y1=Math.ceil(bd[5]+pad),
    R=Math.ceil(bd[0]+pad),X0=kind==='u'||kind==='p'?-R:x0,X1=kind==='u'||kind==='p'?R:x1,Y0=kind==='u'||kind==='p'?Math.floor(-R-K3*bd[1]):y0,Y1=kind==='u'||kind==='p'?R:y1,
    W=Math.ceil((X1-X0)*sc),H=Math.ceil((Y1-Y0)*sc),ox=-X0*sc,oy=-Y0*sc,r=bakeMesh(M,yaw,W,H,ox,oy,sc);
  r.fp=bakeFootprint(M,yaw,W,H,ox,oy,sc);r.x0=X0;r.y0=Y0;r.w=X1-X0;r.h=Y1-Y0;r.hz=bd[1];r.S=Math.max(r.w,r.h);
  if(bakeLog)(bakeLog[kind+'|'+type+'|'+f]=bakeLog[kind+'|'+type+'|'+f]||[]).push(+(performance.now()-t0).toFixed(1));
  bakeMs+=performance.now()-t0;return r;
}
function nbins(){return Q.tier==='battery'?8:16;}
const idleKeys=[];
function unitSprite(type,f,ang){
  const nb=nbins(),a=ang||0,bin=Math.round((((a%TAU)+TAU)%TAU)/TAU*nb)%nb,sc=Math.max(2,SC-1),k='u|'+type+'|'+f+'|'+nb+'|'+bin;
  let sp=spriteCache[k];if(sp)return lruTouch(sp);
  if(bakeMs>7){   // frame bake budget used up: borrow the nearest facing that is already baked (placeholder) and finish the exact one in idle time
    for(let d=1;d<=nb/2;d++)for(const s of[1,-1]){const o=spriteCache['u|'+type+'|'+f+'|'+nb+'|'+(((bin+s*d)%nb)+nb)%nb];if(o)return lruTouch(o);}}
  sp=spriteCache[k]=lruTouch(bakeSprite('u',type,f,bin/nb*TAU,sc));lruAdd(sp);
  const ik=type+'|'+f;if(!idleKeys.includes(ik)&&idleKeys.length<80)idleKeys.push(ik);
  return sp;
}
/* called once per frame after drawing: when the frame was cheap, bake the next missing facing of any type that has been seen */
function bakeIdle(){
  if(bakeMs>3||!idleKeys.length||(Q.msAvg&&Q.msAvg>24))return;
  const nb=nbins(),sc=Math.max(2,SC-1);
  for(let i=0;i<idleKeys.length;i++){const[t,f]=idleKeys[i].split('|');
    for(let b=0;b<nb;b++){const k='u|'+t+'|'+f+'|'+nb+'|'+b;if(spriteCache[k])continue;
      const sp=spriteCache[k]=lruTouch(bakeSprite('u',t,f,b/nb*TAU,sc));lruAdd(sp);return;}
    idleKeys.splice(i--,1);}
}
function partSprite(type,f,ang){   // turret heads etc.: same facing bins as units
  const nb=nbins(),bin=Math.round((((ang%TAU)+TAU)%TAU)/TAU*nb)%nb,k='p|'+type+'|'+f+'|'+nb+'|'+bin;
  return spriteCache[k]||(lruAdd(spriteCache[k]=bakeSprite('p',type,f,bin/nb*TAU,Math.max(2,SC-1))),lruTouch(spriteCache[k]));
}
function buildingSprite(type,f){
  const k='b|'+type+'|'+f;let sp=spriteCache[k];if(sp)return lruTouch(sp);
  const d=BDEF[type];sp=spriteCache[k]=lruTouch(bakeSprite('b',type,f,0,Math.min(SC,3),d.w*TILE,d.h*TILE));lruAdd(sp);return sp;
}
function neutralSprite(type){
  const k='n|'+type;let sp=spriteCache[k];if(sp)return lruTouch(sp);
  sp=spriteCache[k]=lruTouch(bakeSprite('n',type,'neutral',0,Math.min(SC,3)));lruAdd(sp);return sp;
}

/* test-side hook (same convention as window.__RTS in 90_main.js): lets tests/e2e/e2e_visual.py reach the lighting / bake internals. Not used by the game. */
if(window.__TEST)window.__RTSV={LT,PT,shadowOf,lightFrame,collectLights,drawLighting,drawBloom,drawEmissive,buildingSprite,unitSprite,partSprite,bakeSprite,meshFor,RU,RB,RN,spriteCache,bakeMats,bakeMesh,Mesh3,K3,setBakeLog:v=>{bakeLog=v;},resetBake:()=>{bakeMs=0;},lightSprite,ptAdd,ptStep,fxEmit,AMB_STOPS};
