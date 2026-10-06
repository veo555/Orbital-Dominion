const load=require('./simlib3.js');
const A=load();
const seed=+process.argv[2]||7, mins=+process.argv[3]||10, diff=process.argv[4]||'normal';
const facs=['meridian','obsidian','aurora'];A.newGame({seed,diff,faction:facs[seed%3],enemy:facs[(seed+1)%3]});
const G=A.G;
A.ovPreset('autopilot');
const T=G.teams[0],E=G.teams[1];
const errs=[];
for(let m=0;m<mins*2;m++){
  try{for(let i=0;i<15*30;i++){A.step();if(G.over)break;}}catch(e){console.log('EXC',e.stack.split('\n').slice(0,4).join('\n'));break;}
  const cnt=(t,tm)=>G.units.filter(u=>!u.dead&&u.team===tm&&u.def.worker).length;
  const armyN=tm=>G.units.filter(u=>!u.dead&&u.team===tm&&!u.def.worker&&!u.def.trade&&!u.def.noWeapon).length;
  const roles={};for(const u of G.sw.agents)roles[u.ag.role]=(roles[u.ag.role]||0)+1;
  console.log(String(G.time|0).padStart(4),'ME c',T.c|0,'e',T.e|0,'sup',T.used+'/'+T.cap,'era',T.era,'W',cnt(0,0),'A',armyN(0),'B',G.buildings.filter(b=>!b.dead&&b.team===0).length,JSON.stringify(roles),'| EN c',E.c|0,'sup',E.used+'/'+E.cap,'era',E.era,'W',cnt(0,1),'A',armyN(1));
  if(G.over){console.log('OVER',G.over);break;}
}
const S=G.sw;
console.log('log tail:',S.log.slice(-12).map(l=>l.dom+': '+l.text).join('\n   '));
console.log('props',S.props.length,'ledger',JSON.stringify(Object.fromEntries(Object.entries(S.led).map(([k,v])=>[k,Math.round(v)]))));
