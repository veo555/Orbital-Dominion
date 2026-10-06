const load=require('../../tests/sim/simlib3.js');
const A=load();
const seed=+process.argv[2]||2, tt=+process.argv[3]||440;
const facs=['meridian','obsidian','aurora'];A.newGame({seed,diff:'normal',faction:facs[seed%3],enemy:facs[(seed+1)%3]});
const G=A.G;A.ovPreset('autopilot');
for(let i=0;i<tt*30;i++){A.step();if(G.over)break;}
for(const tm of [0,1]){
  const T=G.teams[tm];const by={};let sup=0;
  for(const u of G.units)if(!u.dead&&u.team===tm){by[u.type]=(by[u.type]||0)+1;sup+=u.def.supply;}
  const bl={};for(const b of G.buildings)if(!b.dead&&b.team===tm){bl[b.type]=(bl[b.type]||0)+1;}
  console.log('TEAM',tm,'c',T.c|0,'e',T.e|0,'used',T.used,'cap',T.cap,'lost',T.lost,'kills',T.kills,'rl',T.rl,'rk',T.rk,'mined',T.minedC|0,T.minedE|0,'trained?',T.built);
  console.log('  units',JSON.stringify(by),'supSum',sup);
  console.log('  bld',JSON.stringify(bl));
}
