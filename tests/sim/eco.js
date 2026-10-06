// eco.js <seeds> <tmax> <js-snippet>  -- early-game economy metrics (deterministic, no battle noise before ~t=300)
const load=require('./simlib3.js');
const seeds=process.argv[2].split(',').map(Number),TM=+process.argv[3]||300,snip=process.argv[4]||'';
const facs=['meridian','obsidian','aurora'];
const rows=[];
for(const seed of seeds){
  const A=load();A.newGame({seed,diff:'normal',faction:facs[seed%3],enemy:facs[(seed+1)%3]});const G=A.G;
  if(snip)A.__run(snip);A.ovPreset('autopilot');
  const T=G.teams[0];let blocked=0,float=0,n=0,spent=0;const at={};
  for(let i=0;i<TM*30;i++){A.step();if(G.over)break;
    if(i%30===0){n++;if(T.used>=T.cap-1)blocked++;if(T.c>250)float+=T.c-250;}
    if(i%(30*60)===0&&i>0){const m=i/1800;at[m]=G.units.filter(u=>!u.dead&&u.team===0&&!u.def.worker&&u.def.dmg).reduce((s,u)=>s+u.def.supply,0);}}
  const as=G.units.filter(u=>!u.dead&&u.team===0&&!u.def.worker&&u.def.dmg).reduce((s,u)=>s+u.def.supply,0);
  rows.push({seed,blocked,float:Math.round(float/n),army:as,used:T.used,W:G.units.filter(u=>!u.dead&&u.team===0&&u.def.worker).length,B:G.buildings.filter(b=>!b.dead&&b.team===0).length,at});
}
const m=k=>(rows.reduce((s,r)=>s+r[k],0)/rows.length).toFixed(1);
console.log('blocked',m('blocked'),'float',m('float'),'army',m('army'),'used',m('used'),'W',m('W'),'B',m('B'));
console.log(rows.map(r=>r.seed+':'+r.army+'/'+r.blocked).join(' '));
