const load=require('../../tests/sim/simlib3.js');
const seed=+process.argv[2]||39,T1=+process.argv[3]||110;const facs=['meridian','obsidian','aurora'];
const A=load();A.newGame({seed,diff:'normal',faction:facs[seed%3],enemy:facs[(seed+1)%3]});const G=A.G;
A.ovPreset('autopilot');
const seen=new Set();
for(let i=0;i<T1*30;i++){A.step();
  for(const b of G.buildings)if(b.team===0&&!b.dead){const k=b.id+(b.done?'d':'s');if(!seen.has(k)){seen.add(k);console.log((G.time).toFixed(1),b.type,b.done?'DONE':'started','prog',b.prog.toFixed(2));}}}
console.log(G.sw.log.slice(0,40).map(l=>l.t.toFixed(0)+' '+l.dom+': '+l.text).join('\n'));
const T=G.teams[0];console.log('c',T.c|0,'workers',G.units.filter(u=>!u.dead&&u.team===0&&u.def.worker).length);
