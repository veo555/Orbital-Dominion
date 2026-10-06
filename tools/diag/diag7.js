const load=require('../../tests/sim/simlib3.js');
const A=load();
const seed=+process.argv[2]||2, tt=+process.argv[3]||420;
const facs=['meridian','obsidian','aurora'];A.newGame({seed,diff:'normal',faction:facs[seed%3],enemy:facs[(seed+1)%3]});
const G=A.G;A.ovPreset('autopilot');
const T=G.teams[0];
for(let i=0;i<tt*30;i++){A.step();if(G.over)break;}
console.log('t',G.time|0,'c',T.c|0,'e',T.e|0,'sup',T.used+'/'+T.cap,'era',T.era);
const bl={};for(const b of G.buildings)if(!b.dead&&b.team===0){const k=b.type+(b.done?'':'*');bl[k]=(bl[k]||0)+1;}
console.log(JSON.stringify(bl));
for(const b of G.buildings)if(!b.dead&&b.team===0&&b.done&&A.__run('prodList')&&A.__run('(b=>prodList(b).length)')(b))console.log(b.type,b.id,'queue',JSON.stringify(b.queue.map(q=>q.id)),'list',A.__run('(b=>prodList(b))')(b).join(','));
const ids=['rifleman','raptor','rocketeer','howitzer','juggernaut','skiff','titan','bulwark','reaver','specter','mender'];
for(const id of ids){try{const r=A.reqUnit(0,id);console.log(id,JSON.stringify(r),JSON.stringify(A.__run('uCost(0,"'+id+'")')));}catch(e){}}
console.log('ovSaving',A.__run('ovSaving()'),'saveUntil',A.__run('G.sw.ov.saveUntil'),'saveStart',A.__run('G.sw.ov.saveStart'));
console.log('props',A.__run('G.sw.props.length'),'dom',JSON.stringify(A.__run('G.sw.dom')));
console.log(A.__run('G.sw.log.slice(-15).map(l=>(l.t|0)+" "+l.dom+": "+l.text).join("\\n")'));
