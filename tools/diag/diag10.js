const load=require('../../tests/sim/simlib3.js');
const A=load();
const facs=['meridian','obsidian','aurora'];A.newGame({seed:2,diff:'normal',faction:facs[2],enemy:facs[0]});
const G=A.G;A.ovPreset('autopilot');
for(let i=0;i<238*30;i++){A.step();
 if(G.time>=229&&i%15===0){const w=G.units.find(u=>u.id===152);
  console.log(G.time.toFixed(1),'role',w.ag.role,'st',w.ag.st,'why',w.ag.why,'order',w.order.t,w.order.st||'', 'hid',w.hidden,'garr',!!w.garr,'carry',w.carry,'|',G.sw.log.filter(l=>G.time-l.t<2).map(l=>l.text).join(';'));}}
