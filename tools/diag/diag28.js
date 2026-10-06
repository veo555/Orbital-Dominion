const load=require('../../tests/sim/simlib3.js');
const seed=+process.argv[2]||33,T0=+process.argv[3]||355,T1=+process.argv[4]||372,patch=process.argv[5]||'';const facs=['meridian','obsidian','aurora'];
const A=load();A.newGame({seed,diff:'normal',faction:facs[seed%3],enemy:facs[(seed+1)%3]});const G=A.G;
if(patch)A.__run(patch);
A.__run(`globalThis.__K={};var _k1=kill;kill=function(e,by){if(!e.dead&&e.kind==='unit'&&(e.team===0||e.team===1)){const k=Math.floor(G.time);(__K[k]=__K[k]||[0,0])[e.team]++;}return _k1(e,by);}`);
A.ovPreset('autopilot');
const hyp=Math.hypot;
for(let i=0;i<T1*30;i++){A.step();if(G.over)break;
 if(G.time>=T0&&i%30===0){
  const mine=G.units.filter(u=>!u.dead&&u.team===0&&!u.def.worker&&u.def.dmg),en=G.units.filter(u=>!u.dead&&u.team===1&&!u.def.worker&&u.def.dmg);
  let eng=0,atk=0,far=0,tgtHero=0,tgtNone=0,stun=0;
  for(const u of mine){let dn=1e9;for(const e of en){const d=hyp(u.x-e.x,u.y-e.y);if(d<dn)dn=d;}
    if(dn<u.def.range+40)eng++;else far++;
    if(u.order.t==='attack'||u.target){atk++;const t=u.target;if(t&&t.def&&t.def.hero)tgtHero++;}
    if(u.stunned>0)stun++;}
  const ehero=en.find(e=>e.def.hero);const mh=mine.find(u=>u.def.hero);
  console.log((G.time|0),'mine',mine.length,'inRange',eng,'far',far,'attacking',atk,'->hero',tgtHero,'| en',en.length,'kaz hp',ehero?ehero.hp|0:'-','hero dist to my centroid',ehero?(hyp(ehero.x-mine.reduce((s,u)=>s+u.x,0)/mine.length,ehero.y-mine.reduce((s,u)=>s+u.y,0)/mine.length)|0):'-','| kills/s so far',JSON.stringify(A.__run('__K[Math.floor(G.time)-1]||0')));}}
console.log(JSON.stringify(A.__run('__K')));
