const load=require('../../tests/sim/simlib3.js');const A=load();
const seed=+process.argv[2]||2, T0=+process.argv[3]||405;
const facs=['meridian','obsidian','aurora'];
A.newGame({seed,diff:'normal',faction:facs[seed%3],enemy:facs[(seed+1)%3]});const G=A.G;A.ovPreset('autopilot');
for(let i=0;i<T0*30;i++){A.step();}
const R=c=>A.__run(c);
for(let k=0;k<6;k++){
  for(let i=0;i<30*4;i++)A.step();
  const T=G.teams[0];
  const B=G.buildings.filter(b=>!b.dead&&b.team===0&&b.done&&b.type==='garrison');
  console.log('t',Math.round(G.time),'c',Math.round(T.c),'e',Math.round(T.e),'used',T.used,'cap',T.cap,'saving',R('ovSaving()'),'saveUntil',Math.round(G.sw.ov.saveUntil),'dom.army',G.sw.dom.army,'sw.on',G.sw.on);
  for(const b of B.slice(0,3)){
    const list=R('prodList')(b);
    console.log('  garrison q',b.queue.length,list.map(id=>id+':'+JSON.stringify(A.reqUnit(0,id))).join(' '));
  }
  const c=R('ovCtx()');
  console.log('  ovCtx army',c&&c.army.length,'reserve calc: threat',G.sw.bb.threat?1:0,'armory',c&&c.doneN('armory'));
}
