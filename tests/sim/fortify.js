/* v6-G1 FORTIFY headless checks (docs/DESIGN_FORTIFY.md). Deterministic: Math.random is pinned per scenario.
     node tests/sim/fortify.js            all checks
     node tests/sim/fortify.js --mutants  CLAUDE.md rule 15: every check is re-run against a mutated copy of the sim source and must FAIL there
   Each check names the mutation that must break it (MUT below); a mutant that leaves its check green is reported as VACUOUS. */
'use strict';
const load=require('./simlib3.js');
const MUTANTS=process.argv.includes('--mutants');
let fails=0;const ok=(c,m)=>{console.log((c?'ok    ':'FAIL  ')+m);if(!c)fails++;return!!c;};
const pin=(S,seed)=>{let st=seed>>>0;S.sandbox.Math.random=function(){st=(st+0x6D2B79F5)>>>0;let t=st;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};};
function hashG(S){const G=S.G;let h=2166136261>>>0;const add=n=>{h^=Math.round(n*64)|0;h=Math.imul(h,16777619)>>>0;};
  add(G.tick);add(G.units.length);add(G.buildings.length);for(const u of G.units){add(u.x);add(u.y);add(u.hp);add(u.inside||0);}for(const b of G.buildings){add(b.hp);add(b.queue.length);add(b.cargo?b.cargo.length:0);}
  for(const t of G.teams){add(t.c||0);add(t.e||0);add(t.used||0);}let v=0;for(let i=0;i<G.vis[0].length;i++)if(G.vis[0][i]===2)v++;add(v);add(G.rng()*1e6);return h;}
/* a fresh game with an empty, flat 13x13 arena on the low ground; creeps removed, both sides rich */
function arena(xform,opts){
  const S=load(undefined,xform);pin(S,7);S.newGame(Object.assign({seed:5,faction:'aurora',enemy:'obsidian'},opts||{}));
  S.__run(`G.units=G.units.filter(u=>u.team<2);for(const c of G.camps)c.units=[];G.teams[0].c=G.teams[1].c=20000;G.teams[0].e=G.teams[1].e=20000;G.ais=[null,null];`);
  const A=S.__run(`(function(){for(let r=0;r<40;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){if(Math.max(Math.abs(dx),Math.abs(dy))!==r)continue;const cx=36+dx,cy=44+dy;let good=true;const h0=G.H[cy*MW+cx];
    for(let y=cy-6;y<=cy+6&&good;y++)for(let x=cx-6;x<=cx+6;x++){const i=y*MW+x;if(x<3||y<3||x>=MW-3||y>=MH-3||G.blocked[i]||G.RAMP[i]||G.H[i]!==h0){good=false;break;}}
    if(good)return{cx,cy};}return null;})()`);
  if(!A)throw new Error('no arena');
  S.__run(`for(let i=0;i<NN;i++)G.vis[0][i]=G.vis[1][i]=2;`);
  return{S,cx:A.cx,cy:A.cy,T:S.TILE};
}
const run=(S,n)=>{for(let i=0;i<n;i++)S.step();};
const C=(S,code)=>S.__run(code);
/* ring of wall tiles around (cx,cy) at Chebyshev radius r; gate (2x1, owner team) on the top side when gate=true */
function ring(S,cx,cy,r,team,gate){C(S,`(function(){for(let y=${cy}-${r};y<=${cy}+${r};y++)for(let x=${cx}-${r};x<=${cx}+${r};x++){if(Math.max(Math.abs(x-${cx}),Math.abs(y-${cy}))!==${r})continue;
  if(${gate?1:0}&&y===${cy}-${r}&&(x===${cx}||x===${cx}+1))continue;addBuilding('wall',${team},x,y,true);}
  if(${gate?1:0})addBuilding('gate',${team},${cx},${cy}-${r},true);rebuildBlocked();})()`);}

const CHECKS=[];
const check=(name,mut,fn)=>CHECKS.push({name,mut,fn});

/* 1. wall line placement: cost, skipped tiles, self-seal refusal */
check('wall line',[`c:50,e:0},time:8,sight:90`,`c:5,e:0},time:8,sight:90`],(xf)=>{
  const{S,cx,cy}=arena(xf);
  C(S,`addBuilding('generator',0,${cx}+2,${cy}-4,true)`);   // a 2x2 obstacle on the line (tiles cx+2..cx+3, row cy-4..cy-3)
  const w=S.addUnit('hauler',0,(cx-6)*32+16,(cy-4)*32+16);const c0=S.G.teams[0].c;
  const r=C(S,`fortPlaceLine(0,[G.units.find(u=>u.id===${w.id})],fortLineTiles(${cx}-5,${cy}-4,${cx}+5,${cy}-4),false,true)`);
  const paid=c0-S.G.teams[0].c;
  let a=ok(r.ok&&r.n===9&&r.skipped===2,'wall line: 11 tiles, 2 blocked by a structure are skipped, 9 ordered (n='+r.n+', skipped='+r.skipped+')');
  a=ok(paid===9*50,'wall line: paid 9 x 50 crystals up front ('+paid+')')&&a;
  run(S,30*110);
  const walls=S.G.buildings.filter(b=>b.type==='wall'&&b.done).length;
  a=ok(walls===9,'wall line: one Hauler builds the 9 segments one after another ('+walls+' done after 110 s)')&&a;
  // self-seal: a closed ring around the own hub is refused (the last segment that would close it)
  const S2=load(undefined,xf);pin(S2,7);S2.newGame({seed:5,faction:'aurora',enemy:'obsidian'});C(S2,`G.teams[0].c=99999;for(let i=0;i<NN;i++)G.vis[0][i]=2`);
  const hub=S2.G.buildings.find(b=>b.team===0&&b.type==='hub');
  const sealed=C(S2,`(function(){const h=G.buildings.find(b=>b.id===${hub.id}),t=[];for(let y=h.ty-3;y<=h.ty+h.h+2;y++)for(let x=h.tx-3;x<=h.tx+h.w+2;x++){if(x===h.tx-3||x===h.tx+h.w+2||y===h.ty-3||y===h.ty+h.h+2)if(!G.blocked[y*MW+x])t.push(y*MW+x);}return fortSealOK(0,t);})()`);
  a=ok(sealed===false,'self-seal: a closed wall ring around your own Hub is refused (fortSealOK=false)')&&a;
  return a;});

/* 2. gate team-aware pathing */
check('gate pathing',[`else B[g.team][i]=0;`,`else{}`],(xf)=>{
  const{S,cx,cy,T}=arena(xf);ring(S,cx,cy,3,0,true);
  const inX=cx*T+16,inY=cy*T+16,outX=cx*T+16,outY=(cy-7)*T+16;
  const p0=C(S,`(function(){const p=findPath(${inX},${inY},${outX},${outY},0);return{sealed:FP_SEALED,n:p?p.length:-1,end:p&&p.length?p[p.length-1]:null};})()`);
  const p1=C(S,`(function(){const p=findPath(${outX},${outY},${inX},${inY},1);return{sealed:FP_SEALED};})()`);
  let a=ok(!p0.sealed&&p0.n>0&&Math.abs(p0.end.x-outX)<2&&Math.abs(p0.end.y-outY)<2,'gate auto: the owner paths out through its gate');
  a=ok(p1.sealed===true,'gate auto: an enemy finds the enclosure sealed')&&a;
  // walk it: an own rifleman inside reaches the outside; an enemy one outside never gets in
  const u0=S.addUnit('rifleman',0,inX,inY),u1=S.addUnit('rifleman',1,outX,outY);
  S.setOrder(u0,{t:'move',x:outX,y:outY});S.setOrder(u1,{t:'move',x:inX,y:inY});run(S,30*20);
  a=ok(Math.hypot(u0.x-outX,u0.y-outY)<40,'gate auto: own Rifleman walked out through the gate ('+Math.round(Math.hypot(u0.x-outX,u0.y-outY))+' px from goal)')&&a;
  const inside=Math.max(Math.abs(u1.x/T-cx-.5),Math.abs(u1.y/T-cy-.5))<3;
  a=ok(!inside,'gate auto: the enemy Rifleman stayed outside')&&a;
  // closed: the owner is blocked too; open: the enemy may pass
  C(S,`fortGateMode(G.buildings.find(b=>b.type==='gate'),'closed');rebuildBlocked()`);
  const pc=C(S,`(findPath(${inX},${inY},${outX},${outY},0),FP_SEALED)`);
  C(S,`fortGateMode(G.buildings.find(b=>b.type==='gate'),'open');rebuildBlocked()`);
  const po=C(S,`(findPath(${outX},${outY},${inX},${inY},1),FP_SEALED)`);
  a=ok(pc===true&&po===false,'gate closed blocks the owner, gate open lets the enemy through')&&a;
  return a;});

/* 3. a walled-in target: the enemy attacks the wall, never freezes; 6 Riflemen break a 600-HP segment in ~15 s */
check('breach',[`const b=fortBreachSearch(u,gx,gy);if(b)u.breach=b;`,`void 0;`],(xf)=>{
  const{S,cx,cy,T}=arena(xf);ring(S,cx,cy,2,0,false);
  C(S,`addBuilding('generator',0,${cx},${cy},true)`);
  const R=[];for(let i=0;i<6;i++)R.push(S.addUnit('rifleman',1,(cx-7+i)*T+16,(cy+7)*T+16));
  for(const u of R)S.setOrder(u,{t:'attackmove',x:cx*T+32,y:cy*T+32,gs:0});
  const nW=()=>S.G.buildings.filter(b=>b.type==='wall'&&!b.dead).length,w0=nW();
  let first=-1,frozen=0,win=[],last=R.map(u=>({x:u.x,y:u.y,cd:u.cd}));
  for(let t=0;t<30*90;t++){S.step();if(first<0&&nW()<w0)first=t/30;
    if(t%30===29){R.forEach((u,i)=>{if(u.dead)return;const moved=Math.hypot(u.x-last[i].x,u.y-last[i].y)>2,fired=u.cd>0||u.target;if(!moved&&!fired&&u.order.t!=='idle')frozen++;last[i]={x:u.x,y:u.y,cd:u.cd};});}
    if(S.G.buildings.every(b=>b.type!=='generator'||b.dead))break;}
  const genDead=S.G.buildings.every(b=>b.type!=='generator'||b.dead);
  let a=ok(first>0,'breach: sealed-in target -> the enemy Riflemen destroy a wall segment ('+(first>0?first.toFixed(1)+' s':'never')+')');
  a=ok(genDead,'breach: ...and then the target inside')&&a;
  a=ok(frozen===0,'breach: no Rifleman ever stood still without firing while it had an order ('+frozen+' frozen unit-seconds)')&&a;
  // timing: 6 Riflemen already in range of one segment
  const{S:S2,cx:x2,cy:y2}=arena(xf);C(S2,`addBuilding('wall',0,${x2},${y2},true)`);const wl=S2.G.buildings.find(b=>b.type==='wall');
  for(let i=0;i<6;i++){const u=S2.addUnit('rifleman',1,(x2-2+i%3)*T+16,(y2+3+(i/3|0))*T+16);S2.setOrder(u,{t:'attack',target:wl});}
  let tk=0;while(!wl.dead&&tk<30*60){S2.step();tk++;}
  a=ok(tk/30>=15&&tk/30<=20,'balance: 6 Riflemen kill a 640-HP armor-2 wall segment in '+(tk/30).toFixed(1)+' s (target 15-20 s)')&&a;
  return a;});

/* 4. cargo: load/unload invariants, bunker infantry rule, dropship drop, host death rules, save mid-load */
check('cargo',[`(h.cargo||(h.cargo=[])).push(u.id);`,`(h.cargo||(h.cargo=[])).push(u.id,u.id);`],(xf)=>{
  const{S,cx,cy,T}=arena(xf);
  const bk=C(S,`addBuilding('bunker',0,${cx},${cy},true)`);
  const inf=[];for(let i=0;i<5;i++)inf.push(S.addUnit('rifleman',0,(cx-4+i)*T+16,(cy+5)*T+16));const rap=S.addUnit('raptor',0,(cx+3)*T,(cy+5)*T);
  const n=C(S,`cargoOrderLoad(G.units.filter(u=>u.team===0&&(u.type==='rifleman'||u.type==='raptor')),G.buildings.find(b=>b.type==='bunker'))`);
  run(S,30*2);
  const inv=()=>{const G=S.G,seen=new Map();for(const u of G.units){if(u.dead)continue;if(u.inside){const h=G.buildings.find(b=>b.id===u.inside)||G.units.find(z=>z.id===u.inside);if(!h||!h.cargo.includes(u.id))return false;}}
    for(const h of G.buildings.concat(G.units))if(h.cargo)for(const id of h.cargo){if(seen.has(id))return false;seen.set(id,1);const u=G.units.find(z=>z.id===id);if(!u||u.inside!==h.id)return false;}return true;};
  run(S,30*8);
  const bunker=S.G.buildings.find(b=>b.type==='bunker');
  let a=ok(n===4&&bunker.cargo.length===4,'bunker: 4 of 5 Riflemen sent and loaded, capacity 4 ('+bunker.cargo.length+')');
  a=ok(!bunker.cargo.includes(rap.id)&&!rap.inside,'bunker: a Raptor (not infantry) is refused')&&a;
  a=ok(inv(),'cargo invariant: every passenger is in exactly one host and every id listed once')&&a;
  const units0=S.G.units.length;
  const out=C(S,`cargoUnloadAll(G.buildings.find(b=>b.type==='bunker'))`);
  a=ok(out===4&&S.G.units.length===units0&&S.G.units.every(u=>!u.inside&&!u.hidden&&S.canStand(u.x,u.y)),'bunker: Unload All puts 4 units back on free ground, none lost or duplicated')&&a;
  // dropship: 2 Riflemen + a Howitzer (sizes 1+1+3), fly 14 tiles, drop
  const ds=S.addUnit('dropship',0,(cx-3)*T,(cy-3)*T),how=S.addUnit('howitzer',0,(cx-2)*T,(cy-4)*T);
  const L=[inf[0],inf[1],how];C(S,`cargoOrderLoad(G.units.filter(u=>[${L.map(u=>u.id)}].includes(u.id)),G.units.find(u=>u.id===${ds.id}))`);run(S,30*6);
  a=ok(ds.cargo&&ds.cargo.length===3,'dropship: loads 2 Riflemen + a Howitzer ('+(ds.cargo?ds.cargo.length:0)+' aboard, size '+C(S,`cargoUsed(G.units.find(u=>u.id===${ds.id}))`)+'/8)')&&a;
  const dx=(cx+6)*T,dy=(cy-2)*T;C(S,`cargoOrderUnload(G.units.find(u=>u.id===${ds.id}),${dx},${dy})`);run(S,30*12);
  a=ok(ds.cargo.length===0&&L.every(u=>!u.inside&&Math.hypot(u.x-dx,u.y-dy)<80),'dropship: unload at a point drops all three near it')&&a;
  // host death: dropship cargo dies, bunker cargo survives
  C(S,`cargoOrderLoad(G.units.filter(u=>u.id===${inf[0].id}),G.units.find(u=>u.id===${ds.id}))`);run(S,30*6);
  const lost0=S.G.teams[0].lost;S.kill(ds,1);
  a=ok(inf[0].dead&&S.G.teams[0].lost===lost0+2,'dropship destroyed: its passenger dies with it')&&a;
  C(S,`cargoOrderLoad(G.units.filter(u=>u.id===${inf[2].id}),G.buildings.find(b=>b.type==='bunker'))`);run(S,30*4);
  S.kill(S.G.buildings.find(b=>b.type==='bunker'),1);
  a=ok(!inf[2].dead&&!inf[2].inside&&!inf[2].hidden,'bunker destroyed: its passenger is ejected alive')&&a;
  // save / restore mid-load (the 46_save.js contract): snapshot while some are inside and some still walking in
  const{S:Sx,cx:x3,cy:y3}=arena(xf);C(Sx,`addBuilding('bunker',0,${x3},${y3},true)`);
  for(let i=0;i<4;i++)Sx.addUnit('rifleman',0,(x3-6+i*2)*T+16,(y3+6)*T+16);
  C(Sx,`cargoOrderLoad(G.units.filter(u=>u.team===0&&u.type==='rifleman'),G.buildings.find(b=>b.type==='bunker'))`);
  const cg=()=>(Sx.G.buildings.find(b=>b.type==='bunker').cargo||[]).length;let k=0;while(k<30*8&&cg()!==2){Sx.step();k++;}
  const inBefore=cg(),snap=Sx.gameSnapshot();
  let st=99;const rs=()=>{st=(st+0x6D2B79F5)>>>0;let t=st;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};Sx.sandbox.Math.random=rs;
  run(Sx,600);const hA=hashG(Sx);st=99;Sx.gameRestore(snap);run(Sx,600);const hB=hashG(Sx);
  a=ok(inBefore===2&&hA===hB&&cg()===4,'save mid-load (2 inside, 2 walking in): 20 s after restore = 20 s without the round trip, then 4 aboard ('+hA.toString(16)+'/'+hB.toString(16)+')')&&a;
  return a;});

/* 5. bunker range bonus */
check('bunker range',[`const rg=rangeOf(u)+FORT.bunkerRange+Math.max(h.w,h.h)*TILE/2;`,`const rg=rangeOf(u);`],(xf)=>{
  const{S,cx,cy,T}=arena(xf);
  const bk=C(S,`addBuilding('bunker',0,${cx},${cy},true)`);const bx=(cx+1)*T,by=(cy+1)*T;
  const tgt=S.addUnit('juggernaut',1,bx+185,by);S.setOrder(tgt,{t:'hold'});tgt.hp=tgt.maxhp=5000;
  const r=S.addUnit('rifleman',0,bx,by+40);C(S,`cargoOrderLoad(G.units.filter(u=>u.id===${r.id}),G.buildings.find(b=>b.type==='bunker'))`);run(S,30*6);
  const hp1=tgt.hp;
  let a=ok(r.inside&&hp1<5000,'bunker: a Rifleman inside hits a target 185 px from the bunker centre (range 135 + 32 + 32): '+Math.round(5000-hp1)+' dmg');
  // control: the same Rifleman holding position at the bunker's edge does not reach it
  const{S:S2,cx:x2,cy:y2}=arena(xf);const t2=S2.addUnit('juggernaut',1,(x2+1)*T+185,(y2+1)*T);S2.setOrder(t2,{t:'hold'});t2.hp=t2.maxhp=5000;
  const r2=S2.addUnit('rifleman',0,(x2+1)*T+32,(y2+1)*T);S2.setOrder(r2,{t:'hold'});run(S2,30*6);
  a=ok(t2.hp===5000,'control: without the bunker the same Rifleman at the bunker edge cannot reach it')&&a;
  return a;});

/* 6. detection: isDetectedBy and cloaked targets */
check('detection',[`function isDetectedBy(team,e){return isDetected(team,e);}`,`function isDetectedBy(team,e){return true;}`],(xf)=>{
  const{S,cx,cy,T}=arena(xf);
  const sp=S.addUnit('specter',1,cx*T,cy*T);S.setOrder(sp,{t:'hold'});sp.hp=sp.maxhp=3000;
  const r=S.addUnit('rifleman',0,cx*T,cy*T+140);S.setOrder(r,{t:'hold'});run(S,30*4);   // 140 px: inside the Rifleman's reach (135 + 9), outside the Specter's (125 + 8), so firing never reveals it
  let a=ok(C(S,`isDetectedBy(0,G.units.find(u=>u.id===${sp.id}))`)===false&&sp.hp===3000,'cloaked Specter: not detected, not hit');
  C(S,`addBuilding('turret',0,${cx}+3,${cy}+3,true)`);run(S,30*4);
  a=ok(C(S,`isDetectedBy(0,G.units.find(u=>u.id===${sp.id}))`)===true&&sp.hp<3000,'next to a Turret: detected and hit ('+Math.round(3000-sp.hp)+' dmg)')&&a;
  return a;});

/* 7. mines: invisible to the enemy, trigger on enemy ground units only, single use, limit 12 */
check('mines',[`if(hyp(e.x-m.x,e.y-m.y)-e.r<=R)hit=true;`,`if(hyp(e.x-m.x,e.y-m.y)-e.r<=R)hit=false;`],(xf)=>{
  const{S,cx,cy,T}=arena(xf);
  C(S,`addBuilding('mine',0,${cx},${cy},true)`);run(S,3);const m=S.G.buildings.find(b=>b.type==='mine');
  let a=ok(m.cloaked&&!S.seen(1,m)&&S.seen(0,m),'mine: armed mines are cloaked; the enemy cannot see it, the owner can');
  const own=S.addUnit('rifleman',0,cx*T+16,cy*T-60);S.setOrder(own,{t:'move',x:cx*T+16,y:cy*T+70});run(S,30*3);
  a=ok(!m.dead,'mine: own units walk over it safely')&&a;
  const en=S.addUnit('rifleman',1,cx*T+16,cy*T+120);S.setOrder(en,{t:'hold'});run(S,30*2);
  a=ok(!m.dead&&en.target!==m,'mine: an enemy Rifleman nearby neither sees nor shoots it')&&a;
  S.setOrder(en,{t:'move',x:cx*T+16,y:cy*T-100});let t=0;while(!m.dead&&t<30*6){S.step();t++;}
  a=ok(m.dead&&en.dead,'mine: an enemy walking over it sets it off and dies (60+25 dmg vs 55 HP) after '+(t/30).toFixed(1)+' s')&&a;
  C(S,`G.buildings=G.buildings.filter(b=>b.type!=='mine');addBuilding('garrison',0,${cx}-4,${cy}-5,true)`);for(let i=0;i<12;i++)C(S,`addBuilding('mine',0,${cx}-5+${i},${cy}+4,true)`);
  a=ok(S.reqBuild(0,'mine').ok===false&&/limit/i.test(S.reqBuild(0,'mine').why),'mine: limit of 12 per player ('+S.reqBuild(0,'mine').why+')')&&a;
  return a;});

/* 8. scanner sweep: reveals fog and detects for 10 s, costs 50 Hub energy */
check('scan',[`(G.scans||(G.scans=[])).push({team,x:clamp(x,0,WW),y:clamp(y,0,WH),r:S.r,t:S.t,t0:S.t});`,`void 0;`],(xf)=>{
  const S=load(undefined,xf);pin(S,7);S.newGame({seed:5,faction:'aurora',enemy:'obsidian'});C(S,'G.ais=[null,null]');run(S,30);
  const em=S.G.sites[1],x=em.cx*32,y=em.cy*32,i=Math.floor(em.cy)*88+Math.floor(em.cx);
  let a=ok(S.G.vis[0][i]!==2,'scan: the enemy main is in fog before');
  const hub=S.G.buildings.find(b=>b.team===0&&b.type==='hub'),e0=hub.energy;
  const sp=S.addUnit('specter',1,x+40,y+90);
  const okS=C(S,`fortScan(0,${x},${y})`);run(S,8);
  a=ok(okS&&S.G.vis[0][i]===2&&hub.energy<=e0-50+1,'scan: the target area is visible right after, 50 energy spent ('+e0.toFixed(0)+' -> '+hub.energy.toFixed(0)+')')&&a;
  a=ok(C(S,`isDetectedBy(0,G.units.find(u=>u.id===${sp.id}))`)&&S.seen(0,sp),'scan: a cloaked Specter inside is detected and visible')&&a;
  a=ok(C(S,`fortScan(0,${x},${y})`)===false,'scan: a second scan right away is refused (energy)')&&a;
  run(S,30*11);
  a=ok(S.G.vis[0][i]!==2&&!S.seen(0,sp),'scan: after 10 s the fog returns')&&a;
  return a;});

/* 9. repair battery: 18 HP/s, 0.2 ether per HP */
check('battery',[`healRate:18,healRange`,`healRate:2,healRange`],(xf)=>{
  const{S,cx,cy}=arena(xf,{faction:'aurora'});
  C(S,`addBuilding('battery',0,${cx},${cy},true);addBuilding('garrison',0,${cx}+3,${cy}-1,true)`);
  const g=S.G.buildings.find(b=>b.type==='garrison');g.hp=g.maxhp-400;const h0=g.hp,e0=S.G.teams[0].e;
  run(S,30*10);const dh=g.hp-h0,de=e0-S.G.teams[0].e;
  let a=ok(dh>=18*10*0.9&&dh<=18*10*1.05,'battery: heals '+(dh/10).toFixed(1)+' HP/s (spec 18)');
  a=ok(Math.abs(de-0.2*dh)<1,'battery: costs '+(de/dh).toFixed(3)+' ether per HP (spec 0.2)')&&a;
  return a;});

/* 10. hub upgrade: Fortress is one-way; cancel refunds */
check('fortress',[`b.fort=true;b.maxhp=Math.round(b.maxhp*F.hpMul);`,`b.maxhp=Math.round(b.maxhp*F.hpMul);`],(xf)=>{
  const{S,cx,cy}=arena(xf);
  const hub=S.G.buildings.find(b=>b.team===0&&b.type==='hub');
  let a=ok(C(S,`queueFortress(G.buildings.find(b=>b.id===${hub.id}))`)===false,'fortress: refused in Era I / without an Armory');
  C(S,`G.teams[0].era=2;addBuilding('armory',0,${cx},${cy},true)`);
  const c0=S.G.teams[0].c;C(S,`queueFortress(G.buildings.find(b=>b.id===${hub.id}))`);C(S,`cancelQueue(G.buildings.find(b=>b.id===${hub.id}),G.buildings.find(b=>b.id===${hub.id}).queue.length-1)`);
  a=ok(S.G.teams[0].c===c0&&!hub.fort,'fortress: cancelling the upgrade refunds it in full')&&a;
  const mh=hub.maxhp;C(S,`queueFortress(G.buildings.find(b=>b.id===${hub.id}))`);run(S,30*52);
  a=ok(hub.fort&&hub.maxhp===Math.round(mh*1.5)&&hub.armAdd===3,'fortress: done after 50 s: HP '+mh+' -> '+hub.maxhp+', armor +'+hub.armAdd)&&a;
  a=ok(C(S,`queueFortress(G.buildings.find(b=>b.id===${hub.id}))`)===false&&hub.queue.length===0,'fortress: one-way (a second upgrade is refused)')&&a;
  const e=S.addUnit('juggernaut',1,hub.x+240,hub.y);S.setOrder(e,{t:'hold'});const h0=e.hp;run(S,30*5);
  a=ok(e.hp<h0,'fortress: its cannon hits a ground target 240 px away ('+Math.round(h0-e.hp)+' dmg in 5 s)')&&a;
  return a;});

/* 11. campaign: every new id is locked; a mission can unlock it */
check('campaign lock',[`if(FORT_NEW[id]&&!(C.allowNew&&C.allowNew[id]))return LOCKMSG;`,`void 0;`],(xf)=>{
  const S=load(undefined,xf);const L=require('./storylib.js')();const m=L.STORY.missions[0];
  pin(S,7);S.newGame({campaign:m,aiBoth:true,autoResume:true});
  const ids=['wall','gate','bunker','cannon','flak','sensor','battery','mine'];
  let a=ok(ids.every(id=>/Locked/.test(S.campLocked(0,'building',id)||''))&&/Locked/.test(S.campLocked(0,'unit','dropship')||'')&&/Locked/.test(S.campLocked(0,'building','scan')||''),'campaign: walls, gates, bunkers, towers, batteries, mines, the Dropship and the Scanner are locked');
  C(S,`campDo(['unlock','building','wall'])`);
  a=ok(!S.campLocked(0,'building','wall')&&!!S.campLocked(0,'building','bunker'),'campaign: a mission `unlock` opens exactly that id')&&a;
  return a;});

/* 12. map features: rocks + rich field only when asked, connectivity kept, campaign never */
check('map features',[`if(G.mapFx)fortMapFeatures(rnd);`,`void 0;`],(xf)=>{
  let a=true,rocks=0;
  for(const seed of[1,2,3,4,5,6]){const S=load(undefined,xf);pin(S,7);S.newGame({seed,mapFx:true});
    const n=S.G.buildings.filter(b=>b.type==='rocks').length;rocks+=n;
    a=ok(S.mapConnected()&&S.G.res.some(r=>r.rich),'mapFx seed '+seed+': '+n+' rock blocks, map connected, rich field present')&&a;}
  a=ok(rocks>0,'mapFx: rocks were placed on some maps ('+rocks+' blocks over 6 seeds)')&&a;
  const S=load(undefined,xf);pin(S,7);S.newGame({seed:3});a=ok(!S.G.buildings.some(b=>b.type==='rocks')&&!S.G.res.some(r=>r.rich),'without mapFx: no rocks, no rich field')&&a;
  const L=require('./storylib.js')();const S3=load(undefined,xf);pin(S3,7);S3.newGame({campaign:L.STORY.missions[0],mapFx:true,aiBoth:true,autoResume:true});
  a=ok(!S3.G.buildings.some(b=>b.type==='rocks'),'campaign + mapFx: never any rocks')&&a;
  return a;});

/* 13. save round trip and determinism with the whole defence layer in play */
check('save+determinism',[`const SAVE_SKIP={terrainCv:1,mmBg:1,tInfo:1};`,`const SAVE_SKIP={terrainCv:1,mmBg:1,tInfo:1,scans:1};`],(xf)=>{
  const mk=()=>{const{S,cx,cy,T}=arena(xf);ring(S,cx,cy,3,0,true);
    C(S,`addBuilding('bunker',0,${cx}-1,${cy}-1,true);addBuilding('battery',0,${cx}+1,${cy}+1,true);addBuilding('mine',0,${cx}+6,${cy},true);addBuilding('cannon',0,${cx}-5,${cy}-6,true)`);
    for(let i=0;i<3;i++)S.addUnit('rifleman',0,(cx-1+i)*T,(cy)*T);C(S,`cargoOrderLoad(G.units.filter(u=>u.team===0&&u.type==='rifleman').slice(0,2),G.buildings.find(b=>b.type==='bunker'))`);
    for(let i=0;i<6;i++){const u=S.addUnit('rifleman',1,(cx+9)*T,(cy-3+i)*T);S.setOrder(u,{t:'attackmove',x:cx*T,y:cy*T,gs:0});}
    C(S,`fortScan(0,${(cx+12)*T},${(cy+12)*T})`);   // an active Scanner Sweep is part of the saved state
    return S;};
  const A=mk();run(A,30*3);const snap=A.gameSnapshot();
  let st=1234;const rnd=()=>{st=(st+0x6D2B79F5)>>>0;let t=st;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
  A.sandbox.Math.random=rnd;run(A,30*4);let hA=hashG(A);run(A,30*16);hA=hA+'.'+hashG(A);
  st=1234;A.gameRestore(snap);run(A,30*4);let hB=hashG(A);run(A,30*16);hB=hB+'.'+hashG(A);
  let a=ok(hA===hB,'save: walls + gate + bunker with cargo + battery + mine + 6 attackers: 4 s and 20 s after restore = without ('+hA+' / '+hB+')');
  const B=mk();B.sandbox.Math.random=(()=>{let s=1234;return()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};})();
  const C2=mk();C2.sandbox.Math.random=(()=>{let s=1234;return()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};})();
  run(B,30*23);run(C2,30*23);
  a=ok(hashG(B)===hashG(C2),'determinism: two runs of the same scenario give the same hash ('+hashG(B).toString(16)+')')&&a;
  return a;});

/* 14. the AI uses the defence layer (counts in 10-minute AI-vs-AI games) */
check('AI uses defence',[`if(AI_FORT.off||ai.kind!=='t2'||!R.hubs.length)return;`,`return;`],(xf)=>{
  const tot={bunker:0,battery:0,wall:0,gate:0,gatev:0};let loads=0;
  for(const[seed,f0,f1]of[[11,'meridian','obsidian'],[12,'aurora','obsidian'],[13,'obsidian','meridian'],[14,'meridian','aurora']]){
    const S=load(undefined,xf);pin(S,seed);S.newGame({seed,faction:f0,enemy:f1,aiBoth:true,diff:'hard'});
    const seen={};for(let t=0;t<30*600;t++){S.step();if(t%30===0){for(const b of S.G.buildings)if(tot[b.type]!==undefined)seen[b.id]=b.type;for(const b of S.G.buildings)if(b.cargo&&b.cargo.length)loads++;}if(S.G.over)break;}
    const c={};for(const id in seen)c[seen[id]]=(c[seen[id]]||0)+1;for(const k in c)tot[k]+=c[k];
    console.log('      seed '+seed+' '+f0+' vs '+f1+': '+JSON.stringify(c)+' t='+Math.round(S.G.time)+'s');}
  let a=ok(tot.wall>0&&tot.gate+tot.gatev>0,'AI (hard) walls its ramp against a rush: '+tot.wall+' wall segments, '+(tot.gate+tot.gatev)+' gates over 4 games');
  a=ok(tot.bunker+tot.battery>0,'AI builds Bunkers / Repair Batteries under pressure: '+tot.bunker+' bunkers, '+tot.battery+' batteries; bunker-occupied seconds '+loads)&&a;
  return a;});

/* ------------------------------------------------------------------ runner */
const only=(process.argv.find(a=>a.startsWith('--only='))||'').slice(7);
for(const c of CHECKS){if(only&&!c.name.includes(only))continue;
  console.log('--- '+c.name);let r;try{r=c.fn(null);}catch(e){console.log(e.stack);r=false;fails++;}
  if(MUTANTS){const[a,b]=c.mut;const xf=code=>{const n=code.split(a).length-1;if(n!==1)throw new Error('mutation target not unique ('+n+'): '+a);return code.replace(a,b);};
    const before=fails;console.log('    mutant: '+a.slice(0,70)+' -> '+b.slice(0,40));let mr;try{mr=c.fn(xf);}catch(e){mr=false;}fails=before;
    if(mr){console.log('VACUOUS  '+c.name+': the mutant passes');fails++;}else console.log('ok    mutant of "'+c.name+'" is caught');}}
console.log(fails?'\n'+fails+' FORTIFY CHECK(S) FAILED':'\nALL FORTIFY CHECKS PASSED');process.exit(fails?1:0);
