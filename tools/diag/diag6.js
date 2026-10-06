const load=require('../../tests/sim/simlib3.js');
const A=load();
const seed=+process.argv[2]||2, t0=+process.argv[3]||340, t1=+process.argv[4]||560, dt=+process.argv[5]||6;
const facs=['meridian','obsidian','aurora'];A.newGame({seed,diff:'normal',faction:facs[seed%3],enemy:facs[(seed+1)%3]});
const G=A.G;A.ovPreset('autopilot');
const T=G.teams[0];
let lastLost=0,lastKills=0;
for(let i=0;i<t1*30;i++){
  A.step();if(G.over)break;
  if(G.time>=t0&&i%(dt*30)===0){
    const hubs=G.buildings.filter(b=>!b.dead&&b.team===0&&b.type==='hub');
    const armed=G.units.filter(u=>!u.dead&&u.team===0&&u.def.dmg&&!u.def.worker&&!u.def.trade);
    const en=G.units.filter(u=>!u.dead&&u.team===1&&u.def.dmg&&!u.def.worker&&!u.def.trade);
    const near=(u)=>Math.min(...hubs.map(h=>Math.hypot(u.x-h.x,u.y-h.y)));
    const enNear=en.filter(u=>near(u)<700);
    const myNear=armed.filter(u=>near(u)<700);
    const roles={};for(const u of armed){const r=u.ag?(u.ag.st||u.ag.role):'-';roles[r]=(roles[r]||0)+1;}
    const bb=G.sw.bb;
    console.log(String(G.time|0).padStart(4),'myArmed',armed.length,'nearHub',myNear.length,'| enemy',en.length,'nearMyHub',enNear.length,'| thr',bb.threat?bb.threatN:0,'| lost',T.lost-lastLost,'kills',T.kills-lastKills,JSON.stringify(roles),'c',T.c|0,'e',T.e|0);
    lastLost=T.lost;lastKills=T.kills;
  }
}
