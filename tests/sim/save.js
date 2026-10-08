/* Save/restore contract (src/js/46_save.js). RS pins the Math.random stream so two runs are comparable; the restored run replays the same stream from the same position.
   For several seeds / factions / campaign missions: run T1 ticks, snapshot, then (a) continue N ticks from the live game, (b) restore the snapshot and continue N ticks. Hashes must be identical. */
'use strict';
const load=require('./simlib3.js');
let fails=0;const ok=(c,m)=>{console.log((c?'ok    ':'FAIL  ')+m);if(!c)fails++;};
function hash(S){const G=S.G;let h=2166136261>>>0;const add=n=>{h^=Math.round(n*64)|0;h=Math.imul(h,16777619)>>>0;};
  add(G.tick);add(G.units.length);add(G.buildings.length);for(const u of G.units){add(u.x);add(u.y);add(u.hp);}for(const b of G.buildings){add(b.hp);add(b.queue.length);}
  for(const t of G.teams){add(t.c||0);add(t.e||0);add(t.used||0);}add(G.rng()*1e6);if(G.camp){add(G.camp.t||0);add(Object.keys(G.camp.flags||{}).length);}return h;}
function pinnedRandom(S,seed){let s=seed>>>0;S.sandbox.Math.random=function(){s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};return()=>s;}
function scenario(name,opts,T1,N){
  const S=load();const mathR=S.sandbox.Math;let st=7;mathR.random=function(){st=(st+0x6D2B79F5)>>>0;let t=st;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
  S.newGame(opts);for(let i=0;i<T1;i++)S.step();
  const snap=S.gameSnapshot(),stSave=st,kb=Math.round(snap.length/1024);
  for(let i=0;i<N;i++)S.step();const hA=hash(S),tickA=S.G.tick;
  st=stSave;const G2=S.gameRestore(snap);
  ok(!!G2,name+': snapshot restores ('+kb+' KB)');
  for(let i=0;i<N;i++)S.step();const hB=hash(S);
  ok(hA===hB&&S.G.tick===tickA,name+': '+N+' ticks after restore give the same state hash as without the round trip ('+hA.toString(16)+' / '+hB.toString(16)+')');
  return{S,snap};
}
scenario('skirmish meridian/aurora',{seed:5,faction:'meridian',enemy:'aurora'},900,600);
scenario('skirmish obsidian/meridian AI-vs-AI',{seed:21,faction:'obsidian',enemy:'meridian',aiBoth:true},1500,900);
{ // static identity survives
  const S=load();S.newGame({seed:5,faction:'meridian',enemy:'aurora'});for(let i=0;i<300;i++)S.step();
  S.gameRestore(S.gameSnapshot());const G=S.G;
  ok(G.units.every(u=>u.def===S.UDEF[u.type])&&G.buildings.every(b=>b.def===S.BDEF[b.type]),'u.def / b.def are the shared UDEF / BDEF entries again');
  ok(G.terrainCv===null&&G.mmBg===null,'render caches are dropped (buildTerrain() remakes them)');
}
{ // rejects garbage
  const S=load();S.newGame({seed:5});
  ok(S.gameRestore('{')===null&&S.gameRestore('{"v":99}')===null&&S.gameRestore('{"v":1,"root":{"r":0},"nodes":[{"o":{}}]}')===null,'garbage / wrong version / wrong shape -> null, no exception');
}
{ // CONTROLS (CLAUDE.md rule 15): the comparison must be able to fail
  const S=load();let st=7;S.sandbox.Math.random=function(){st=(st+0x6D2B79F5)>>>0;let t=st;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
  S.newGame({seed:5,faction:'meridian',enemy:'aurora'});for(let i=0;i<900;i++)S.step();
  const snap=S.gameSnapshot(),stSave=st;for(let i=0;i<600;i++)S.step();const hA=hash(S);
  const run=(mut)=>{st=stSave;const o=JSON.parse(snap);mut(o);S.gameRestore(JSON.stringify(o));for(let i=0;i<600;i++)S.step();return hash(S);};
  ok(run(()=>{})===hA,'control: the untouched snapshot reproduces the hash');
  ok(run(o=>{const n=o.nodes.find(x=>x.o&&x.o.kind==='unit'&&x.o.team===0);n.o.hp=1;})!==hA,'control: tampering one unit\'s hp changes the outcome');
  ok(run(o=>{const g=o.nodes[o.root.r].o;const n=o.nodes[g.rng.g!==undefined?0:0];g.rng={g:12345};})!==hA,'control: a different G.rng state changes the outcome');
}
// campaign missions
const Lst=require('./storylib.js')();
for(const m of Lst.STORY.missions.slice(0,3)){
  scenario('campaign '+m.id,{campaign:m,aiBoth:true,autoResume:true},1200,600);
}
console.log(fails?'\n'+fails+' SAVE CHECK(S) FAILED':'\nALL SAVE CHECKS PASSED');process.exit(fails?1:0);
