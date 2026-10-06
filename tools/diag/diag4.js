const load=require('../../tests/sim/simlib3.js');const A=load();
const seed=+process.argv[2]||2, T0=+process.argv[3]||380, T1=+process.argv[4]||440;
const facs=['meridian','obsidian','aurora'];
A.newGame({seed,diff:'normal',faction:facs[seed%3],enemy:facs[(seed+1)%3]});const G=A.G;A.ovPreset('autopilot');
let trained=0;
for(let i=0;i<T1*30;i++){A.step();
  if(G.time>=T0&&i%(30*5)===0){
    const T=G.teams[0],B=G.buildings.filter(b=>!b.dead&&b.team===0&&b.done);
    const gq=B.filter(b=>b.type==='garrison').map(b=>b.queue.map(q=>q.id||q.k).join('+')||'-');
    const fq=B.filter(b=>b.type==='foundry'||b.type==='airfield').map(b=>b.type[0]+':'+(b.queue.map(q=>q.id||q.k).join('+')||'-'));
    const army=G.units.filter(u=>!u.dead&&u.team===0&&!u.def.worker&&!u.def.trade&&!u.def.noWeapon);
    const types={};for(const u of army)types[u.type]=(types[u.type]||0)+1;
    console.log(Math.round(G.time),'c',Math.round(T.c),'e',Math.round(T.e),'garrisons',gq.join(' | '),'|',fq.join(' '),'| army',JSON.stringify(types),'| minedC',Math.round(T.minedC));
  }
}
