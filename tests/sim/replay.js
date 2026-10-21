/* REPLAY (47_replay.js) headless gate: a replay-enabled match is a pure function of (setup, seed).
     node tests/sim/replay.js            checks
     node tests/sim/replay.js --mutants  rule 15: each check is re-run on a mutated copy of the sources and must FAIL there */
'use strict';
const load=require('./simlib3.js');
const MUTANTS=process.argv.includes('--mutants');
const rng=seed=>{let st=seed>>>0;return function(){st=(st+0x6D2B79F5)>>>0;let t=st;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};};
function run(xform,setup,mathSeed,ticks){
  const S=load(undefined,xform);S.sandbox.Math.random=rng(mathSeed);
  S.newGame(setup);for(let i=0;i<ticks;i++)S.step();
  return{S,cps:JSON.stringify(S.G.rcp||[]),h:S.__run('replayHash()')};
}
function suite(xform){
  const fails=[];let n=0;const ok=(c,m)=>{n++;if(!c)fails.push(m);if(!MUTANTS)console.log((c?'ok    ':'FAIL  ')+m);};
  const SU={replay:true,aiBoth:true,seed:424242,faction:'aurora',enemy:'obsidian',diff:'hard',diffs:['master','hard'],mapFx:true};
  const T=5400;   // 3 minutes of game time
  const a=run(xform,SU,1,T),b=run(xform,SU,987654,T);
  ok(JSON.parse(a.cps).length===T/300,'checkpoints: one per 10 s ('+JSON.parse(a.cps).length+')');
  ok(a.cps===b.cps&&a.h===b.h,'same setup + seed, two different Math.random streams: identical checkpoints and final hash ('+a.h+')');
  const c=run(xform,Object.assign({},SU,{seed:424243}),1,T);
  ok(c.h!==a.h,'control: a different seed gives a different match');
  const nr=Object.assign({},SU);delete nr.replay;
  const d=run(xform,nr,1,T),e=run(xform,nr,987654,T);
  ok(d.h!==e.h,'control: without replay:true the Math.random stream still matters (so the check above can fail)');
  ok(a.S.G.rp&&a.S.G.rp.diffs.join()==='master,hard','setup recorded in G.rp (per-side tiers)');
  ok(a.S.G.ais[0].tier==='master'&&a.S.G.ais[1].tier==='hard','per-side tiers applied to the two agents');
  {const S1=load(undefined,xform),S2=load(undefined,xform);S1.newGame(SU);S2.newGame(Object.assign({},SU,{seed:SU.seed+1}));
    ok(S1.G.rrng.rngState()!==S2.G.rrng.rngState(),'the replay stream is seeded from the game seed (two seeds, two streams)');
    const h0=S1.__run('replayHash()');S1.G.units[0].x+=5;ok(S1.__run('replayHash()')!==h0,'the state hash reacts to a unit moving 5 px');}
  /* code round trip + validation */
  const code=a.S.__run('replayCode()');
  ok(code==='OD1-424242-aurora-obsidian-master-hard-m','code: '+code);
  const P=a.S.__run('JSON.stringify(replayParse('+JSON.stringify(code)+'))'),Q=JSON.parse(P);
  ok(Q&&Q.seed===424242&&Q.faction==='aurora'&&Q.enemy==='obsidian'&&Q.diffs.join()==='master,hard'&&Q.mapFx===true&&Q.replay&&Q.aiBoth,'code parses back to the same setup');
  const bad=['','OD2-1-aurora-obsidian-hard-hard-0','OD1-x-aurora-obsidian-hard-hard-0','OD1-1-aurora-aurora-hard-hard-0','OD1-1-aurora-foo-hard-hard-0','OD1-1-aurora-obsidian-god-hard-0','OD1-1-aurora-obsidian-hard-hard-z','OD1-1-aurora-obsidian-hard-hard','OD1--5-aurora-obsidian-hard-hard-0'];
  ok(bad.every(s=>a.S.__run('replayParse('+JSON.stringify(s)+')')===null),'code: 9 malformed codes are rejected');
  /* replay from the code reproduces the match */
  const f=run(xform,Q,555,T);ok(f.cps===a.cps&&f.h===a.h,'a match started from its CODE reproduces every checkpoint');
  /* save / restore keeps the replay stream */
  const S=load(undefined,xform);S.sandbox.Math.random=rng(3);S.newGame(SU);for(let i=0;i<1800;i++)S.step();
  const snap=S.gameSnapshot();for(let i=0;i<1800;i++)S.step();const hA=S.__run('replayHash()');
  S.sandbox.Math.random=rng(77);S.gameRestore(snap);for(let i=0;i<1800;i++)S.step();
  ok(S.__run('replayHash()')===hA,'save at 60 s, restore, run 60 s: same hash as without the round trip');
  const ex=a.S.__run('JSON.stringify(replayExport())'),X=JSON.parse(ex);
  ok(X.format==='orbital-dominion-replay'&&X.code===code&&X.checkpoints.length===T/300&&X.tick===T,'export record carries code, tick and checkpoints');
  /* match of the day / surprise generator */
  {const g=d=>JSON.parse(a.S.__run('JSON.stringify(replayDailySetup('+d+'))')),code=o=>a.S.__run('replayCode('+JSON.stringify(o)+')');
   const D=20000,x=g(D),y=g(D),z=g(D+1);
   ok(JSON.stringify(x)===JSON.stringify(y),'daily setup: same day, same match');
   ok(JSON.stringify(x)!==JSON.stringify(z),'daily setup: the next day is a different match');
   ok(a.S.__run('JSON.stringify(replayParse(replayCode(replayDailySetup('+D+'))))')===JSON.stringify(x),'daily setup survives a code round trip (valid, parseable)');
   const days=[];for(let d=D;d<D+200;d++)days.push(g(d));
   ok(days.every(o=>o.faction!==o.enemy),'daily setup: two different factions on every one of 200 days');
   ok(days.every(o=>['hard','master'].includes(o.diffs[0])&&['hard','master'].includes(o.diffs[1])),'daily setup: only Hard/Master agents (no lopsided matches)');
   const fids=JSON.parse(a.S.__run('JSON.stringify(FACTION_IDS)'));ok(fids.every(f=>days.some(o=>o.faction===f))&&fids.every(f=>days.some(o=>o.enemy===f)),'daily setup: every faction appears on both sides within 200 days');
   ok(new Set(days.map(o=>o.seed)).size>190,'daily setup: map seeds do not repeat');
   const sp=JSON.parse(a.S.__run('JSON.stringify(replaySetupFromSeed(5,["normal"]))'));ok(sp.diffs.join()==='normal,normal','surprise generator respects the tier list');}
  return{fails,n};
}
if(!MUTANTS){const r=suite();console.log('\n'+(r.n-r.fails.length)+' checks passed, '+r.fails.length+' failed');if(r.fails.length){console.log('FAILED:\n  '+r.fails.join('\n  '));process.exit(1);}console.log('ALL REPLAY CHECKS PASSED');}
else{
  const M=[
    ['sim draw back to Math.random',c=>c.replace('function rnd(){return G&&G.rrng?G.rrng():Math.random();}','function rnd(){return Math.random();}')],
    ['replay stream not seeded from the game seed',c=>c.replace('G.rrng=mulberry32(seed^0x5bd1e995)','G.rrng=mulberry32(12345)')],
    ['hash ignores unit positions',c=>c.replace('add(u.x);add(u.y);add(u.hp);}','add(u.hp);}')],
    ['code drops the second tier',c=>c.replace("d[0],d[1],fl","d[0],d[0],fl")],
    ['parse accepts any faction pair',c=>c.replace("||p[2]===p[3])return null","||false)return null")],
    ['daily setup ignores the day',c=>c.replace("Math.imul(day|0,2654435761)^0x0D15EA5E","0x0D15EA5E")],
    ['daily setup may pick the same faction twice',c=>c.replace("while(fb===fa)","while(false)")],
    ['daily setup allows easy agents',c=>c.replace("['hard','master']);}","['easy','hard','master']);}")],
    ['save drops every random stream',c=>c.replace("if(typeof v[k]==='function'&&!v[k].rngState)continue;","if(typeof v[k]==='function')continue;")],
  ];
  let bad=0;for(const[name,fn]of M){let caught;try{const r=suite(c=>{const o=fn(c);if(o===c)throw new Error('mutation did not apply: '+name);return o;});caught=r.fails.length>0;}catch(e){caught=!/did not apply/.test(String(e));if(!caught)throw e;}
    console.log((caught?'ok    ':'NOT CAUGHT ')+'mutant: '+name);if(!caught)bad++;}
  if(bad){console.log(bad+' MUTANT(S) NOT CAUGHT');process.exit(1);}console.log('ALL MUTANTS CAUGHT');
}
