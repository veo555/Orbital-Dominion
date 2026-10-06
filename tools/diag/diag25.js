const load=require('../../tests/sim/simlib3.js');
const A=load();
const seed=+process.argv[2]||3;const T0=+process.argv[3]||340,T1=+process.argv[4]||385;const facs=['meridian','obsidian','aurora'];A.newGame({seed,diff:'normal',faction:facs[seed%3],enemy:facs[(seed+1)%3]});
const G=A.G;
A.__run(`globalThis.__C=[];var _cs=castSkill;castSkill=function(u,i,x,y){const r=_cs(u,i,x,y);if(r)__C.push({t:+G.time.toFixed(1),team:u.team,skill:u.type+':'+i,x:x|0,y:y|0});return r;}
globalThis.__D={};var _k0=kill;kill=function(e,by){if(!e.dead&&e.kind==='unit'&&e.team===0){const k=Math.floor(G.time);__D[k]=(__D[k]||0)+1;}return _k0(e,by);}`);
A.ovPreset('autopilot');
const hyp=Math.hypot;
for(let i=0;i<T1*30;i++){A.step();if(G.over)break;
  if(G.time>=T0&&i%60===0){
    const mine=G.units.filter(u=>!u.dead&&u.team===0&&!u.def.worker&&u.def.dmg);
    const en=G.units.filter(u=>!u.dead&&u.team===1&&!u.def.worker&&u.def.dmg);
    const c=a=>a.length?[a.reduce((s,u)=>s+u.x,0)/a.length|0,a.reduce((s,u)=>s+u.y,0)/a.length|0]:null;
    const bb=G.sw.bb;
    const orders={};for(const u of mine){const k=(u.ag?u.ag.role:'-')+':'+u.order.t;orders[k]=(orders[k]||0)+1;}
    const eb=G.buildings.filter(b=>!b.dead&&b.team===1);
    const hub=G.buildings.find(b=>!b.dead&&b.team===0&&b.type==='hub');
    const eh=G.buildings.find(b=>!b.dead&&b.team===1&&b.type==='hub');
    console.log((G.time|0),'mine',mine.length,JSON.stringify(c(mine)),'hp',mine.reduce((s,u)=>s+u.hp,0)|0,'| en',en.length,JSON.stringify(c(en)),'hp',en.reduce((s,u)=>s+u.hp,0)|0,'| myHub',hub&&[hub.x|0,hub.y|0],'enHub',eh&&[eh.x|0,eh.y|0],'|',JSON.stringify(orders),'thr',bb.threat?bb.threatN:0,'eEst',G.sw.ov.eEst|0);
  }}
console.log('casts',JSON.stringify(A.__run('__C')));
console.log('deaths/s',JSON.stringify(A.__run('__D')));
const en=G.units.filter(u=>!u.dead&&u.team===1&&u.def.dmg);const by={};for(const u of en)by[u.type]=(by[u.type]||0)+1;console.log('enemy',JSON.stringify(by));
console.log('log tail:',G.sw.log.slice(-14).map(l=>(l.t|0)+' '+l.dom+': '+l.text).join('\n   '));
