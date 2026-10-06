const load=require('../../tests/sim/simlib3.js');
const A=load();
const seed=2,t0=+process.argv[2]||180,t1=+process.argv[3]||260;
const facs=['meridian','obsidian','aurora'];A.newGame({seed,diff:'normal',faction:facs[seed%3],enemy:facs[(seed+1)%3]});
const G=A.G;A.ovPreset('autopilot');
let last='';
for(let i=0;i<t1*30;i++){A.step();if(G.over)break;
 if(G.time>=t0&&i%(2*30)===0){
  const gens=G.buildings.filter(b=>!b.dead&&b.team===0&&b.type==='generator'&&!b.done);
  const out=gens.map(b=>{const ws=G.units.filter(u=>!u.dead&&u.team===0&&u.order.t==='build'&&(u.order.bld===b||(u.order.tx===b.tx&&u.order.ty===b.ty)));
   return b.id+' hp'+(b.hp|0)+' prog'+((b.prog||b.bp||0)).toFixed?.(2)+' nb'+b.nb+' ws['+ws.map(w=>w.id+':'+w.ag.role+'/'+(w.ag.st||'')+'/'+w.order.st).join(',')+']';}).join(' | ');
  if(out!==last){console.log(String(G.time|0).padStart(4),out);last=out;}
 }}
