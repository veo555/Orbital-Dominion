const load=require('../../tests/sim/simlib3.js');
const A=load();
const seed=+process.argv[2]||2, tt=+process.argv[3]||440;
const facs=['meridian','obsidian','aurora'];A.newGame({seed,diff:'normal',faction:facs[seed%3],enemy:facs[(seed+1)%3]});
const G=A.G;
A.__run(`globalThis.__K=[];var _k0=kill;kill=function(e,by){if(!e.dead&&e.kind==='unit'&&e.team===0)__K.push({t:G.time|0,type:e.type,by:by,role:e.ag?e.ag.role:'-',own:e.ag&&e.ag.free?'free':'own',x:e.x|0,y:e.y|0});return _k0(e,by);}`);
A.ovPreset('autopilot');
for(let i=0;i<tt*30;i++){A.step();if(G.over)break;}
const K=A.__run('__K');
const agg={};for(const k of K){const key='by'+k.by+' '+k.role;agg[key]=(agg[key]||0)+1;}
console.log(JSON.stringify(agg));
const byType={};for(const k of K){byType[k.type]=(byType[k.type]||0)+1;}console.log(JSON.stringify(byType));
console.log(K.map(k=>k.t+':'+k.type+'/'+k.by+'/'+k.role).join(' '));
