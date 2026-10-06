const load=require('../../tests/sim/simlib3.js');
const A=load();
const seed=+process.argv[2]||3,tt=+process.argv[3]||360;
const facs=['meridian','obsidian','aurora'];A.newGame({seed,diff:'normal',faction:facs[seed%3],enemy:facs[(seed+1)%3]});
const G=A.G;A.ovPreset('autopilot');
for(let i=0;i<tt*30;i++){A.step();if(G.over)break;
 if(i%(30*30)===0&&i>0){const a=G.teams[0].hero,b=G.teams[1].hero;console.log(G.time|0,'me hero alive',a.alive,'lvl',a.level,'xp',a.xp|0,'| en alive',b.alive,'lvl',b.level,'xp',b.xp|0,'creeps',G.teams[0].creeps||0,'/',G.teams[1].creeps||0);}}
