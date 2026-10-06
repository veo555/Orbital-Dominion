const load=require('../../tests/sim/simlib3.js');
const seed=+process.argv[2]||39,T0=+process.argv[3]||80,T1=+process.argv[4]||200;const facs=['meridian','obsidian','aurora'];
const A=load();A.newGame({seed,diff:'normal',faction:facs[seed%3],enemy:facs[(seed+1)%3]});const G=A.G;
A.__run(`globalThis.__S={};var _os=ovSave;ovSave=function(){const b=Math.floor(G.time/10)*10;const k=new Error().stack.split('\\n')[2].trim().replace(/.*sim.js:/,'L');(__S[b]=__S[b]||{})[k]=((__S[b]||{})[k]||0)+1;return _os();}`);
A.ovPreset('autopilot');
for(let i=0;i<T1*30;i++){A.step();
 if(G.time>=T0&&i%300===0){const T=G.teams[0];console.log(G.time|0,'c',T.c|0,'e',T.e|0,'sup',T.used+'/'+T.cap,'saving',A.__run('ovSaving()'),'prod queues',G.buildings.filter(b=>!b.dead&&b.team===0&&b.done&&b.type==='garrison').map(b=>b.queue.length).join(','),'bld',G.buildings.filter(b=>!b.dead&&b.team===0).map(b=>b.type[0]+(b.done?'':'*')).join(''));}}
console.log(JSON.stringify(A.__run('__S'),null,0));
