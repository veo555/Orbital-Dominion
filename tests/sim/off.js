// off.js <srcdir> <seeds> <tmax> : swarm OFF; report enemy-side stats (identical to v2 when the v3 layer is inert).
// ALWAYS set RS (seeded Math.random), e.g.  RS=5 node off.js ../../src/js 1,2,3 300  vs  RS=5 LIB=./simlibv2.js node off.js ../../baseline/v2/src/js 1,2,3 300
const load=require(process.env.LIB||'./simlib3.js');
const dir=process.argv[2],seeds=process.argv[3].split(',').map(Number),TM=+process.argv[4]||300;
const facs=['meridian','obsidian','aurora'];
for(const seed of seeds){
  const A=load(dir);A.newGame({seed,diff:'normal',faction:facs[seed%3],enemy:facs[(seed+1)%3]});const G=A.G;
  try{A.__run('G.sw&&(G.sw.on=false)');}catch(e){}
  for(let i=0;i<TM*30;i++){A.step();if(G.over)break;}
  const E=G.teams[1];const eu=G.units.filter(u=>!u.dead&&u.team===1);
  console.log('seed',seed,'t',G.time|0,'enemy c',E.c|0,'e',E.e|0,'used',E.used,'cap',E.cap,'units',eu.length,'bld',G.buildings.filter(b=>!b.dead&&b.team===1).length,'kills',E.kills,'lost',E.lost,'| mine units',G.units.filter(u=>!u.dead&&u.team===0).length,'c',G.teams[0].c|0);
}
