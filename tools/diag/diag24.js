const load=require('../../tests/sim/simlib3.js');
const A=load();
const seed=+process.argv[2]||12,t0=+process.argv[3]||72,t1=+process.argv[4]||125;
const facs=['meridian','obsidian','aurora'];A.newGame({seed,diff:'normal',faction:facs[seed%3],enemy:facs[(seed+1)%3]});
const G=A.G;A.ovPreset('autopilot');
for(let i=0;i<t1*30;i++){A.step();
 if(G.time>=t0&&i%(3*30)===0){
  const gens=G.buildings.filter(b=>!b.dead&&b.team===0&&b.type==='generator'&&!b.done);
  const bw=G.units.filter(u=>!u.dead&&u.team===0&&u.order.t==='build');
  console.log(String(G.time|0),'gens',gens.map(b=>b.id+' prog'+b.prog.toFixed(2)+' nb'+b.nb).join(','),'| builders',bw.map(w=>w.id+':'+w.order.type+'/'+w.order.st+(w.order.bld?'@'+(w.order.bld.prog||0).toFixed(2):'')+' d='+(Math.hypot(w.x-(w.order.tx*32||0),w.y-(w.order.ty*32||0))|0)).join(' ; '));}}
