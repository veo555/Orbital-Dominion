const load=require('../../tests/sim/simlib3.js');
const seed=+process.argv[2]||33,TT=+process.argv[3]||355;const facs=['meridian','obsidian','aurora'];
const A=load();A.newGame({seed,diff:'normal',faction:facs[seed%3],enemy:facs[(seed+1)%3]});const G=A.G;
A.ovPreset('autopilot');
for(let i=0;i<TT*30;i++){A.step();if(G.over)break;}
for(const t of [0,1]){const T=G.teams[t];console.log('team',t,T.faction,'era',T.era,'keys',Object.keys(T).filter(k=>!['hero','queue'].includes(k)).map(k=>k+'='+(typeof T[k]==='object'?JSON.stringify(T[k]):T[k])).join(' ').slice(0,700));}
for(const t of [0,1]){const us=G.units.filter(u=>!u.dead&&u.team===t&&!u.def.worker&&u.def.dmg);const by={};for(const u of us){const k=u.type;by[k]=by[k]||{n:0,hp:0,dmg:0,arm:0,cd:0};by[k].n++;by[k].hp+=u.maxhp;by[k].dmg+=u.def.dmg;by[k].arm+=u.def.armor||0;}
 console.log('team',t,JSON.stringify(by));}
const u0=G.units.find(u=>!u.dead&&u.team===0&&u.type==='rifleman'),u1=G.units.find(u=>!u.dead&&u.team===1&&u.type==='rifleman');
for(const u of [u0,u1])if(u)console.log('rifle team',u.team,'maxhp',u.maxhp,'def.dmg',u.def.dmg,'armor field',u.armor,u.def.armor,'dmgMul?',Object.keys(u).filter(k=>/arm|dmg|atk|mul/i.test(k)).map(k=>k+'='+u[k]).join(' '));
