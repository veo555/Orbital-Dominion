const load=require('../../tests/sim/simlib3.js');
const A=load();
const seed=+process.argv[2]||2, t0=+process.argv[3]||430, t1=+process.argv[4]||480, dt=+process.argv[5]||2;
const facs=['meridian','obsidian','aurora'];A.newGame({seed,diff:'normal',faction:facs[seed%3],enemy:facs[(seed+1)%3]});
const G=A.G;A.ovPreset('autopilot');
const T=G.teams[0];
let lastLost=0;
for(let i=0;i<t1*30;i++){
  A.step();if(G.over)break;
  if(G.time>=t0&&i%(dt*30)===0){
    const hubs=G.buildings.filter(b=>!b.dead&&b.team===0&&b.type==='hub');
    const armed=G.units.filter(u=>!u.dead&&u.team===0&&u.def.dmg&&!u.def.worker&&!u.def.trade);
    const en=G.units.filter(u=>!u.dead&&u.team===1&&u.def.dmg&&!u.def.worker&&!u.def.trade);
    const dh=(u)=>Math.min(...hubs.map(h=>Math.hypot(u.x-h.x,u.y-h.y)))|0;
    const D=G.sw.bb.def;
    const eclose=en.filter(u=>dh(u)<1000);
    let cx=0,cy=0;for(const u of eclose){cx+=u.x;cy+=u.y;}if(eclose.length){cx/=eclose.length;cy/=eclose.length;}
    const dEn=a=>eclose.length?Math.hypot(a.x-cx,a.y-cy)|0:-1;
    const dists=armed.map(dEn).sort((a,b)=>a-b);
    console.log(String(G.time|0).padStart(4),'armed',armed.length,'eclose',eclose.length,'| def',D?('on='+D.on+' go='+D.go+' n='+D.n+' have='+D.have+' ratio='+D.ratio.toFixed(2)+' eSup='+D.eSup):'-','| lost',T.lost-lastLost,'| myDistToEnemy',dists.slice(0,24).join(','),'| eEst',(G.sw.ov.eEst||0).toFixed(0));
    lastLost=T.lost;
  }
}
