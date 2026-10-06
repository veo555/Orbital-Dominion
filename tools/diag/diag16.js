const load=require('../../tests/sim/simlib3.js');
const A=load();
const seed=2;
const facs=['meridian','obsidian','aurora'];A.newGame({seed,diff:'normal',faction:facs[seed%3],enemy:facs[(seed+1)%3]});
const G=A.G;
A.__run(`globalThis.__K=[];var _k0=kill;kill=function(e,by){if(!e.dead&&e.kind==='unit'&&e.team===0)__K.push({t:+G.time.toFixed(1),type:e.type,by:by,la:e.lastAtk?(e.lastAtk.kind+':'+(e.lastAtk.type||'')):'none',x:e.x|0,y:e.y|0,zones:G.zones.filter(z=>z.type==='orbital').map(z=>z.team+'@'+(z.x|0)+','+(z.y|0)+' t'+z.t.toFixed(1)).join(';')});return _k0(e,by);}`);
A.ovPreset('autopilot');
for(let i=0;i<410*30;i++){A.step();if(G.over)break;}
const K=A.__run('__K').filter(k=>k.t>=392&&k.t<=406);
for(const k of K)console.log(JSON.stringify(k));
