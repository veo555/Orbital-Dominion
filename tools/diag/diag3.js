const load=require('../../tests/sim/simlib3.js');const A=load();
const seed=+process.argv[2]||2, T0=+process.argv[3]||440, T1=+process.argv[4]||560;
const facs=['meridian','obsidian','aurora'];
A.newGame({seed,diff:'normal',faction:facs[seed%3],enemy:facs[(seed+1)%3]});const G=A.G;A.ovPreset('autopilot');
const R=(c)=>A.__run(c);
let lastLine='';
for(let i=0;i<T1*30;i++){A.step();
  if(G.time>=T0&&i%(30*10)===0){
    const T=G.teams[0],B=G.buildings.filter(b=>!b.dead&&b.team===0);
    const cnt={};for(const b of B)cnt[b.type]=(cnt[b.type]||0)+(b.done?1:0.01);
    const prod=B.filter(b=>b.done&&b.type!=='hub'&&b.type!=='exchange'&&b.def.prod&&b.def.prod.length);
    const army=G.units.filter(u=>!u.dead&&u.team===0&&!u.def.worker&&!u.def.trade&&!u.def.noWeapon);
    const en=G.units.filter(u=>!u.dead&&u.team===1&&!u.def.worker);
    console.log(Math.round(G.time),'c',Math.round(T.c),'e',Math.round(T.e),'sup',T.used+'/'+T.cap,'army',army.length,'enemy',en.length,'saving',R('ovSaving()'),'threat',G.sw.bb.threatN||0,'prodB',prod.map(b=>b.type+':'+b.queue.length).join(','),'| bld',JSON.stringify(cnt));
    console.log('   roles',JSON.stringify(army.reduce((m,u)=>(m[u.ag?u.ag.role:'none']=(m[u.ag?u.ag.role:'none']||0)+1,m),{})),'hunt',G.sw.bb.hunt&&JSON.stringify({go:G.sw.bb.hunt.go,note:G.sw.bb.hunt.note}),'assault',G.sw.bb.assault&&JSON.stringify({go:G.sw.bb.assault.go,have:G.sw.bb.assault.have,init:G.sw.bb.assault.init}));
    console.log('   last log:',G.sw.log.slice(-3).map(l=>l.text).join(' | '));
  }
}
