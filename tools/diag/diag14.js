const load=require('../../tests/sim/simlib3.js');
const A=load();
const seed=2,t0=+process.argv[2]||240,t1=+process.argv[3]||330;
const facs=['meridian','obsidian','aurora'];A.newGame({seed,diff:'normal',faction:facs[seed%3],enemy:facs[(seed+1)%3]});
const G=A.G;A.ovPreset('autopilot');
for(let i=0;i<t1*30;i++){A.step();
 if(G.time>=t0&&i%(3*30)===0){
  const h=G.sw.bb.hunt;
  if(h&&h.go&&h.camp){
   const c=h.camp;const cu=c.units.map(id=>G.units.find(u=>u.id===id)).filter(u=>u&&!u.dead);
   const mem=G.units.filter(u=>!u.dead&&h.ids.has(u.id));
   const near=mem.filter(u=>Math.hypot(u.x-c.x,u.y-c.y)<260);
   const L=A.__run('lanch')(cu),M=A.__run('lanch')(mem);
   console.log(String(G.time|0),'camp lvl',c.lvl,'units',cu.map(u=>u.type+':'+(u.hp|0)).join(','),'| party',mem.length,'near',near.length,'ratio',(M/Math.max(1,L)).toFixed(2),'day',G.daylight.toFixed(2),'dist',mem.length?(Math.hypot(mem[0].x-c.x,mem[0].y-c.y)|0):'-');
  } else if(h) console.log(String(G.time|0),'hunt idle:',h.note);
 }}
