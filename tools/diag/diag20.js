const load=require('../../tests/sim/simlib3.js');
const A=load();
const seed=3;const facs=['meridian','obsidian','aurora'];A.newGame({seed,diff:'normal',faction:facs[seed%3],enemy:facs[(seed+1)%3]});
const G=A.G;A.ovPreset('autopilot');
for(let i=0;i<300*30;i++){A.step();}
console.log(G.sw.log.map(l=>(l.t|0)+' '+l.dom+': '+l.text).filter(x=>!/Train a Hauler|Train a R|Shift/.test(x)).join('\n'));
