const load=require('../../tests/sim/simlib3.js');
const seed=+process.argv[2]||3,TM=+process.argv[3]||400;const facs=['meridian','obsidian','aurora'];
const A=load();A.newGame({seed,diff:'normal',faction:facs[seed%3],enemy:facs[(seed+1)%3]});const G=A.G;
A.__run(`globalThis.__ST={};var _m=msg;msg=function(team,t,c){if(team===0&&t==='Build more Generators'){const k=new Error().stack.split('\\n').slice(2,6).map(s=>s.trim().replace(/\\(.*sim.js:/,'(')).join(' < ');__ST[k]=(__ST[k]||0)+1;}return _m(team,t,c);}`);
A.ovPreset('autopilot');
for(let i=0;i<TM*30;i++){A.step();if(G.over)break;}
console.log('t',G.time|0,'over',G.over,JSON.stringify(A.__run('__ST'),null,1));
const T=G.teams[0];console.log('used',T.used,'cap',T.cap);
