// match2.js <seeds> <mins> <diff> <js-after-preset>   (RS env = random seed for Math.random)
const load=require('./simlib3.js');
const seeds=(process.argv[2]||'1,2,3').split(',').map(Number), mins=+process.argv[3]||12, diff=process.argv[4]||'normal', snip=process.argv[5]||'';
const facs=['meridian','obsidian','aurora'];
for(const seed of seeds){
  const A=load(process.env.SRC||undefined);const f0=facs[seed%3],f1=facs[(seed+1)%3];
  A.newGame({seed,diff,faction:f0,enemy:f1});const G=A.G;A.ovPreset('autopilot');if(snip)A.__run(snip);
  let res='draw';const cp={};
  try{for(let i=0;i<mins*60*30;i++){A.step();if(G.over){res=G.over;break;}
    if(i%(30*60)===0&&i>0){const m=i/1800;const s=tm=>G.units.filter(u=>!u.dead&&u.team===tm&&!u.def.worker&&!u.def.trade&&u.def.dmg).reduce((n,u)=>n+u.def.supply,0);cp[m]=s(0)+'/'+s(1);}}}catch(e){res='EXC '+e.message.slice(0,80);}
  const T=G.teams[0],E=G.teams[1];
  console.log('seed',seed,f0.slice(0,3),'v',f1.slice(0,3),res.padEnd(8),'t='+(G.time|0),'era',T.era+'/'+E.era,'k/l',T.kills+'/'+T.lost,'enemy k/l',E.kills+'/'+E.lost,'bld',G.buildings.filter(b=>!b.dead&&b.team===0).length+'/'+G.buildings.filter(b=>!b.dead&&b.team===1).length,'armySup@min',JSON.stringify(cp).replace(/"/g,''));
}
