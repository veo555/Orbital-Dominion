const load=require('../../tests/sim/simlib3.js');
const A=load();
const seed=2,t0=+process.argv[2]||380,t1=+process.argv[3]||420,dt=+process.argv[4]||2;
const facs=['meridian','obsidian','aurora'];A.newGame({seed,diff:'normal',faction:facs[seed%3],enemy:facs[(seed+1)%3]});
const G=A.G;A.ovPreset('autopilot');
const T=G.teams[0],E=G.teams[1];
const comp=(tm)=>{const by={};for(const u of G.units)if(!u.dead&&u.team===tm&&u.def.dmg&&!u.def.worker&&!u.def.trade){by[u.type]=(by[u.type]||0)+1;}return JSON.stringify(by);};
for(let i=0;i<t1*30;i++){A.step();
 if(G.time>=t0&&i%(dt*30)===0){
  const as=G.units.filter(u=>!u.dead&&u.team===0&&u.ag&&u.ag.role==='assault');
  const A_=G.sw.bb.assault;
  let cx=0,cy=0;for(const u of as){cx+=u.x;cy+=u.y;}if(as.length){cx/=as.length;cy/=as.length;}
  const eh=G.buildings.find(b=>!b.dead&&b.team===1&&b.type==='hub');
  const nearE=G.units.filter(u=>!u.dead&&u.team===1&&u.def.dmg&&!u.def.worker&&Math.hypot(u.x-cx,u.y-cy)<500).length;
  console.log(String(G.time|0),'asslt',as.length,'go',A_&&A_.go,'toEnemyHub',eh&&as.length?Math.hypot(cx-eh.x,cy-eh.y)|0:'-','enemyNear',nearE,'myArmy',comp(0),'| en',comp(1),'| ekills',T.kills,'elost',T.lost,'eEst',(G.sw.ov.eEst||0).toFixed(0));
 }}
