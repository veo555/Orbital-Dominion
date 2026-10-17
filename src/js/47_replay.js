/* =============================================================================
   47_REPLAY — SIM-SIDE (headless: no DOM / canvas / audio / wall clock; G.rng is never consumed here).
   An agent-vs-agent match is a pure function of its setup: newGame({replay:true,...}) seeds a second stream (G.rrng) for every
   sim-affecting random draw (see rnd() in 20_sim.js), so (setup, seed) reproduces the match bit for bit.  This module gives
   a short shareable CODE for a setup, a state hash, and checkpoints (tick, hash) every 10 s of game time so a replay can be
   VERIFIED (same hashes) instead of trusted.  Human-played matches are not replayable yet (their commands are not logged).
   Code format:  OD1-<seed>-<factionA>-<factionB>-<tierA>-<tierB>-<flags>   flags: m = rocks + rich fields (mapFx), a/b = arsenal off for side A / B, 0 = none.
   ============================================================================= */
const REPLAY_EVERY=300;   // ticks between checkpoints (10 s of game time)
function replayHash(){
  let h=2166136261>>>0;const add=n=>{h^=Math.round(n*64)|0;h=Math.imul(h,16777619)>>>0;};
  add(G.tick);add(G.units.length);add(G.buildings.length);
  for(const u of G.units){add(u.team);add(u.x);add(u.y);add(u.hp);}
  for(const b of G.buildings){add(b.team);add(b.hp);add(b.queue?b.queue.length:0);}
  for(const t of G.teams){add(t.c||0);add(t.e||0);add(t.used||0);}
  add(G.rrng?G.rrng.rngState():0);return h>>>0;
}
function replayTick(){if(G.tick%REPLAY_EVERY===0)(G.rcp||(G.rcp=[])).push([G.tick,replayHash()]);}
function replayCode(rp){
  rp=rp||G.rp;if(!rp)return null;const d=rp.diffs||[rp.diff,rp.diff],ao=rp.arsenalOff||[false,false];
  const fl=(rp.mapFx?'m':'')+(ao[0]?'a':'')+(ao[1]?'b':'')||'0';
  return['OD1',rp.seed,rp.faction,rp.enemy,d[0],d[1],fl].join('-');
}
function replayParse(code){   // -> newGame options, or null when the code is not valid
  const p=String(code||'').trim().split('-');if(p.length!==7||p[0]!=='OD1')return null;
  const seed=Number(p[1]);if(!Number.isInteger(seed)||seed<0||seed>4294967295)return null;
  if(!FACTION_IDS.includes(p[2])||!FACTION_IDS.includes(p[3])||p[2]===p[3])return null;
  if(!DIFF[p[4]]||!DIFF[p[5]])return null;if(!/^(0|[mab]+)$/.test(p[6]))return null;
  return{replay:true,aiBoth:true,seed,faction:p[2],enemy:p[3],diff:p[4],diffs:[p[4],p[5]],mapFx:p[6].includes('m'),arsenalOff:[p[6].includes('a'),p[6].includes('b')]};
}
function replayExport(){   // a self-describing record: setup + the checkpoints reached so far (+ result when over)
  if(!G.rp)return null;
  return{format:'orbital-dominion-replay',v:1,code:replayCode(),setup:G.rp,tick:G.tick,checkpoints:(G.rcp||[]).map(c=>c.slice()),
    result:G.over?{outcome:G.over,time:G.overT}:null};
}
