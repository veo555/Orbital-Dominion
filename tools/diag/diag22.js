const load=require('../../tests/sim/simlib3.js');
const A=load();
const seed=+process.argv[2]||3;const TT=+process.argv[3]||380;const facs=['meridian','obsidian','aurora'];A.newGame({seed,diff:'normal',faction:facs[seed%3],enemy:facs[(seed+1)%3]});
const G=A.G;
A.__run(`globalThis.__C=[];var _cs=castSkill;castSkill=function(u,i,x,y){const r=_cs(u,i,x,y);if(r)__C.push({t:+G.time.toFixed(1),team:u.team,skill:u.type+':'+i,x:x|0,y:y|0});return r;}
globalThis.__D={};var _k0=kill;kill=function(e,by){if(!e.dead&&e.kind==='unit'&&e.team===0){const k=Math.floor(G.time);__D[k]=(__D[k]||0)+1;}return _k0(e,by);}`);
A.ovPreset('autopilot');
for(let i=0;i<TT*30;i++){A.step();if(G.over)break;}
console.log('casts',JSON.stringify(A.__run('__C')));
console.log('deaths/s',JSON.stringify(A.__run('__D')));
const en=G.units.filter(u=>!u.dead&&u.team===1&&u.def.dmg);const by={};for(const u of en)by[u.type]=(by[u.type]||0)+1;console.log('enemy',JSON.stringify(by));
const T=G.teams[1];console.log('enemy upgrades',JSON.stringify(T.up||T.tech||Object.keys(T).filter(k=>/up|tech|res/i.test(k))));
const M=G.teams[0];console.log('my upgrades',JSON.stringify(M.up||M.tech));
