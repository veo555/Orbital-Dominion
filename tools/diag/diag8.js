const load=require('../../tests/sim/simlib3.js');
const A=load();
const seed=+process.argv[2]||2, t0=+process.argv[3]||250,t1=+process.argv[4]||460;
const facs=['meridian','obsidian','aurora'];A.newGame({seed,diff:'normal',faction:facs[seed%3],enemy:facs[(seed+1)%3]});
const G=A.G;A.ovPreset('autopilot');
const T=G.teams[0];
for(let i=0;i<t1*30;i++){A.step();if(G.over)break;
 if(G.time>=t0&&i%(10*30)===0){
  const pend=G.buildings.filter(b=>!b.dead&&b.team===0&&!b.done).map(b=>b.type+'@'+Math.round(b.prog!==undefined?b.prog*100:(b.bp||0)*100)).join(',');
  const bw=G.units.filter(u=>!u.dead&&u.team===0&&u.order.t==='build').length;
  const prodQ=G.buildings.filter(b=>!b.dead&&b.team===0&&b.done&&b.queue.length).length;
  const prodAll=G.buildings.filter(b=>!b.dead&&b.team===0&&b.done&&A.__run('(b=>prodList(b).length&&b.type!=="hub")')(b)).length;
  console.log(String(G.time|0).padStart(4),'c',T.c|0,'e',T.e|0,'sup',T.used+'/'+T.cap,'builders',bw,'prodB',prodAll,'busy',prodQ,'pending',pend,'|',G.sw.log.filter(l=>G.time-l.t<10&&/Generator|Garrison/.test(l.text)).map(l=>l.text).join(';'));
 }}
