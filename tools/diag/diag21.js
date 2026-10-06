const load=require('../../tests/sim/simlib3.js');
const A=load();
const seed=+process.argv[2]||3,t0=+process.argv[3]||350,t1=+process.argv[4]||390,dt=+process.argv[5]||1;
const facs=['meridian','obsidian','aurora'];A.newGame({seed,diff:'normal',faction:facs[seed%3],enemy:facs[(seed+1)%3]});
const G=A.G;A.ovPreset('autopilot');
const stat=(tm,cx,cy,R)=>{const us=G.units.filter(u=>!u.dead&&u.team===tm&&u.def.dmg&&!u.def.worker&&!u.def.trade&&Math.hypot(u.x-cx,u.y-cy)<R);
 let x=0,y=0;for(const u of us){x+=u.x;y+=u.y;}if(us.length){x/=us.length;y/=us.length;}
 let sd=0;for(const u of us)sd+=(u.x-x)**2+(u.y-y)**2;sd=us.length?Math.sqrt(sd/us.length):0;
 const eng=us.filter(u=>u.target&&!u.target.dead).length;
 const hp=us.length?us.reduce((n,u)=>n+u.hp/u.maxhp,0)/us.length:0;
 const sup=us.reduce((n,u)=>n+u.def.supply,0);
 return{n:us.length,sup,x:x|0,y:y|0,sd:sd|0,eng,hp:hp.toFixed(2)};};
for(let i=0;i<t1*30;i++){A.step();if(G.over)break;
 if(G.time>=t0&&i%(dt*30)===0){
  const en=G.units.filter(u=>!u.dead&&u.team===1&&u.def.dmg&&!u.def.worker&&!u.def.trade);
  // enemy wave centroid = enemies nearest our hub
  const hub=G.buildings.find(b=>!b.dead&&b.team===0&&b.type==='hub');
  const near=en.filter(u=>Math.hypot(u.x-hub.x,u.y-hub.y)<1500);
  if(!near.length){console.log(String(G.time|0),'no enemy within 1500');continue;}
  let cx=0,cy=0;for(const u of near){cx+=u.x;cy+=u.y;}cx/=near.length;cy/=near.length;
  const e=stat(1,cx,cy,700),m=stat(0,cx,cy,700);
  const hero=en.find(u=>u.def.hero),mh=G.units.find(u=>!u.dead&&u.team===0&&u.def.hero);
  console.log(String(G.time|0).padStart(4),'ME',JSON.stringify(m).replace(/"/g,''),'| EN',JSON.stringify(e).replace(/"/g,''),'| dist',Math.hypot(m.x-e.x,m.y-e.y)|0,'| D',G.sw.bb.def?('go='+G.sw.bb.def.go+' r='+G.sw.bb.def.ratio.toFixed(2)):'-','eHero',hero?(hero.hp|0)+'/'+(hero.maxhp|0):'-');
 }}
