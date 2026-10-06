const load=require('../../tests/sim/simlib3.js');
const A=load();
const seed=+process.argv[2]||3,t0=+process.argv[3]||40,t1=+process.argv[4]||200;
const facs=['meridian','obsidian','aurora'];A.newGame({seed,diff:'normal',faction:facs[seed%3],enemy:facs[(seed+1)%3]});
const G=A.G;A.ovPreset('autopilot');
const row=(tm)=>{const T=G.teams[tm];const bl={};for(const b of G.buildings)if(!b.dead&&b.team===tm){const k=b.type[0]+b.type[1]+(b.done?'':'*');bl[k]=(bl[k]||0)+1;}
 const q=G.buildings.filter(b=>!b.dead&&b.team===tm&&b.done&&b.type==='garrison'&&b.queue.length).length;
 const army=G.units.filter(u=>!u.dead&&u.team===tm&&!u.def.worker&&u.def.dmg).length;
 return 'c'+(T.c|0)+' e'+(T.e|0)+' used'+T.used+'/'+T.cap+' A'+army+' gq'+q+' '+JSON.stringify(bl).replace(/"/g,'');};
for(let i=0;i<t1*30;i++){A.step();
 if(G.time>=t0&&i%(10*30)===0)console.log(String(G.time|0).padStart(4),'ME',row(0),'\n    EN',row(1));}
