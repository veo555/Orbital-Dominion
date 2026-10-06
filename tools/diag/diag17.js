const load=require('../../tests/sim/simlib3.js');
const A=load();
const seed=2;
const facs=['meridian','obsidian','aurora'];A.newGame({seed,diff:'normal',faction:facs[seed%3],enemy:facs[(seed+1)%3]});
const G=A.G;
A.__run(`globalThis.__Z=[];var _uz=updateZones;updateZones=function(dt){const pre=G.zones.filter(z=>z.type==='orbital'&&!z.fired);const cnt=pre.map(z=>G.units.filter(u=>!u.dead&&u.team!==z.team&&u.team<2&&hyp(u.x-z.x,u.y-z.y)<z.r).length);_uz(dt);pre.forEach((z,i)=>{if(z.fired)__Z.push({t:+G.time.toFixed(1),team:z.team,n:cnt[i],x:z.x|0,y:z.y|0});});}`);
A.__run(`globalThis.__C=[];var _cs=castSkill;castSkill=function(u,i,x,y){const r=_cs(u,i,x,y);if(r)__C.push({t:+G.time.toFixed(1),team:u.team,skill:u.type+':'+i,x:x|0,y:y|0});return r;}`);
A.ovPreset('autopilot');
for(let i=0;i<450*30;i++){A.step();if(G.over)break;}
console.log('orbital fires',JSON.stringify(A.__run('__Z')));
console.log('casts',JSON.stringify(A.__run('__C').filter(c=>c.team===1).slice(0,30)));
