const load=require('../../tests/sim/simlib3.js');
const seed=+process.argv[2]||39,T0=+process.argv[3]||36,T1=+process.argv[4]||56;const facs=['meridian','obsidian','aurora'];
const A=load();A.newGame({seed,diff:'normal',faction:facs[seed%3],enemy:facs[(seed+1)%3]});const G=A.G;
A.ovPreset('autopilot');
let who=null;
for(let i=0;i<T1*30;i++){A.step();
  if(G.time>=T0&&i%30===0){
    const bw=G.units.filter(u=>!u.dead&&u.team===0&&u.order.t==='build');
    const hub=G.buildings.find(b=>b.team===0&&b.type==='hub');
    console.log(G.time|0,bw.map(u=>u.id+':'+u.order.type+' st='+u.order.st+' at('+(u.x|0)+','+(u.y|0)+') tgt('+(u.order.tx*32+16|0)+','+(u.order.ty*32+16|0)+') d='+(Math.hypot(u.x-(u.order.tx*32+16),u.y-(u.order.ty*32+16))|0)+' carry='+u.carry+' path='+(u.path?u.path.length:0)).join(' | '),'hub',hub.x|0,hub.y|0);}}
