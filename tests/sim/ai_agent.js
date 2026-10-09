/* Agent-level tests of the T2 opponent (src/js/42_ai_agent.js). Headless, deterministic. About 3-5 minutes.
     node tests/sim/ai_agent.js [--quick]
   1. NO PEEKING: the AI's decisions and its whole state are a function of what its team has seen. From a mid-game snapshot the AI thinks
      twice: once on the true world, once after every enemy entity it cannot see has been moved / damaged / reinforced and the enemy's
      bank, era and upgrades changed. Commands and AI state must be identical.
      CONTROLS (rule 15): two mutated copies of the AI that peek (the seen() gate removed; the army estimate read from G.units) must fail.
   2. SEEN-EVER: every enemy unit / building in the AI's memory was visible to its team at some tick.
   3. DETERMINISM: AI-vs-AI (T2 master vs T2 hard) twice from the same (seed, Math.random stream) -> identical state hash; no Math.random
      in the T2 source.
   4. APM CAP: commands counted from the OUTSIDE (wrapped sim functions; identical orders in one think = one selection command) never
      exceed the token bucket bound burst + rate * W in any window W; CONTROL: a copy whose aiAct always says yes breaks the bound.
   5. SAVE: snapshot -> restore round trip with two T2 AIs gives the same state hash after 600 more ticks (46_save.js contract).
   6. CPU: AI time per tick of T2 master vs v3 hard measured in the same harness (relative, so machine-independent). */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { sim, makeAgent } = require(path.join(__dirname, '..', '..', 'tools', 'league', 'game.js'));
const QUICK = process.argv.includes('--quick');
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok    ' : 'FAIL  ') + m); if (!c) fails++; };
const SRC = path.join(__dirname, '..', '..', 'src', 'js');
function pinRandom(S, seed) { let s = seed >>> 0; S.sandbox.Math.random = function () { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function start(S, seed, f0, f1, a0, a1) { pinRandom(S, seed * 7919 + 13); S.newGame({ seed, faction: f0, enemy: f1, diff: 'normal', aiBoth: true }); S.G.ais[0] = makeAgent(S, a0, 0); S.G.ais[1] = makeAgent(S, a1, 1); return S.G; }
function mutatedTree(edits) { // a temporary copy of the sim sources with string edits applied to 42_ai_agent.js
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-ai-mut-'));
  for (const f of fs.readdirSync(SRC)) if (/^(00|10|20|25|26|27|30|40|41|42|43|44|45|46)_/.test(f)) {
    let t = fs.readFileSync(path.join(SRC, f), 'utf8');
    if (f === '42_ai_agent.js') for (const [a, b] of edits) { if (!t.includes(a)) throw new Error('mutation anchor not found: ' + a.slice(0, 60)); t = t.replace(a, b); }
    fs.writeFileSync(path.join(dir, f), t);
  }
  return dir;
}
const COMMANDS = ['setOrder', 'queueUnit', 'orderBuild', 'queueEra', 'queueHero', 'queueResearch', 'castSkill', 'callToArms', 'toggleSiege', 'mktTrade', 'learnSkill', 'setTax'];
const idOf = (v) => v && typeof v === 'object' ? (v.id !== undefined ? '#' + v.id : JSON.stringify(v, (k, x) => x && typeof x === 'object' && x.id !== undefined && k ? '#' + x.id : x)) : JSON.stringify(v);
function recorder(S) { // wrap the sim's command functions; returns {log, stop}
  const sb = S.sandbox, saved = {}, log = []; let depth = 0;
  for (const n of COMMANDS) { const f = sb[n]; saved[n] = f; sb[n] = function (...a) { if (depth === 0) log.push(n + '(' + a.map(idOf).join(',') + ')'); depth++; try { return f.apply(this, a); } finally { depth--; } }; }
  return { log, stop: () => { for (const n of COMMANDS) sb[n] = saved[n]; } };
}
const stateOf = (ai) => JSON.stringify(ai, (k, v) => ArrayBuffer.isView(v) ? Array.from(v).map(x => +x.toFixed(9)) : v);

/* ---------------------------------------------------------------- 1. no peeking */
function hideAndScramble(S, team) { // mutate everything the AI's team cannot see
  const G = S.G, run = S.__run, en = 1 - team, v = G.vis[team]; let s = 99; const r = () => (s = (s * 1103515245 + 12345) >>> 0) / 4294967296;
  const hiddenSpot = () => { for (let k = 0; k < 500; k++) { const tx = 2 + Math.floor(r() * 84), ty = 2 + Math.floor(r() * 84); if (v[ty * 88 + tx] !== 2 && S.canStand((tx + .5) * 32, (ty + .5) * 32)) return [(tx + .5) * 32, (ty + .5) * 32]; } return null; };
  let moved = 0, added = 0, hurt = 0;
  for (const u of G.units) { if (u.dead || u.team !== en) continue; if (S.seen(team, u) && !u.hidden) continue;
    if (!u.hidden) { const p = hiddenSpot(); if (p) { u.x = p[0]; u.y = p[1]; u.revealT = 0; moved++; } } u.hp = Math.max(1, u.hp * 0.5); hurt++; }
  for (const t of ['titan', 'skiff', 'juggernaut', 'raptor', 'rocketeer', 'specter']) { const p = hiddenSpot(); if (p) { const u = S.addUnit(t, en, p[0], p[1]); u.revealT = 0; added++; } }
  for (const b of G.buildings) { if (b.dead || b.team !== en || S.seen(team, b)) continue; b.hp = Math.max(1, b.hp * 0.3); hurt++; }
  const E = G.teams[en]; E.c += 5000; E.e += 3000; E.wl = 3; E.al = 3; E.era = 3; E.kills += 50; if (E.hero) E.hero.level = 6;
  run('rebuildCells()');
  // every mutated entity is still invisible to the AI's team
  const leaked = G.units.filter(u => !u.dead && u.team === en && !u.hidden && u.revealT <= 0 && S.seen(team, u) && (u.hp < u.maxhp * 0.51 || u.bornT === G.time)).length;
  return { moved, added, hurt, leaked };
}
function noPeek(src, label, expectSame) {
  const S = sim(src); const G = start(S, 31, 'meridian', 'obsidian', { kind: 't2', tier: 'master' }, { kind: 't2', tier: 'master' });
  for (let i = 0; i < 330 * 30; i++) { S.step(); if (G.over) break; }
  const snap = S.gameSnapshot(), team = 1, K = 16;
  const think = (mut) => {
    S.gameRestore(snap); const G2 = S.G; S.__run('rebuildCells()'); let info = null;
    if (mut) info = hideAndScramble(S, team);
    const rec = recorder(S), ai = G2.ais[team];
    try { for (let k = 0; k < K; k++) { G2.time += ai.P.iv; S.__run(`aiThink(G.ais[${team}])`); } } finally { rec.stop(); }
    return { log: rec.log, st: stateOf(G2.ais[team]), info };
  };
  const A = think(false), B = think(true);
  if (expectSame) {
    ok(A.log.length >= 5, `${label}: the AI acted in the probe (${A.log.length} commands in ${K} thinks) - not a vacuous comparison`);
    ok(B.info.moved + B.info.added + B.info.hurt > 10 && B.info.leaked === 0, `${label}: hidden world scrambled (${B.info.moved} enemy units moved in fog, ${B.info.added} added, ${B.info.hurt} damaged, enemy bank/era/upgrades changed; none became visible)`);
    const firstDiff = A.log.findIndex((x, i) => x !== B.log[i]);
    ok(A.log.length === B.log.length && firstDiff < 0, `${label}: identical command stream with and without the hidden changes` + (firstDiff >= 0 ? ` (first difference at #${firstDiff}: ${A.log[firstDiff]} vs ${B.log[firstDiff]})` : ''));
    ok(A.st === B.st, `${label}: identical AI state (memory, beliefs, pheromones, postures) with and without the hidden changes`);
  } else {
    const same = A.log.join('|') === B.log.join('|') && A.st === B.st;
    ok(!same, `${label}: CONTROL - a peeking AI is caught (commands ${A.log.join('|') === B.log.join('|') ? 'same' : 'differ'}, state ${A.st === B.st ? 'same' : 'differs'})`);
  }
}
noPeek(undefined, 'no-peek', true);
{
  const d1 = mutatedTree([['if(!seen(team,u))continue;', '']]);
  const d2 = mutatedTree([['function aiEnemyRecs(ai,maxAge,combatOnly){const out=[]', 'function aiEnemyRecs(ai,maxAge,combatOnly){const out=[];for(const u of G.units)if(!u.dead&&u.team===ai.enemy&&!u.def.worker&&!u.def.trade)out.push({type:u.type,x:u.x,y:u.y,hp:u.hp,mhp:u.maxhp,t:G.time});return out;const out0=[]']]);
  try { noPeek(d1, 'mutation "no seen() gate"', false); noPeek(d2, 'mutation "army estimate read from G.units"', false); }
  finally { fs.rmSync(d1, { recursive: true, force: true }); fs.rmSync(d2, { recursive: true, force: true }); }
}

/* ---------------------------------------------------------------- 2. seen-ever invariant */
{
  const S = sim(); const G = start(S, 32, 'aurora', 'meridian', { kind: 't2', tier: 'hard' }, { kind: 'v3', diff: 'hard' });
  const seenU = new Set(), seenB = new Set(); let maxMem = 0;
  for (let i = 0; i < (QUICK ? 240 : 420) * 30; i++) {
    S.step(); if (G.over) break;
    for (const u of G.units) if (!u.dead && u.team === 1 && S.seen(0, u)) seenU.add(u.id);
    for (const b of G.buildings) if (!b.dead && b.team === 1 && S.seen(0, b)) seenB.add(b.id);
    if (i % 300 === 0) { const ai = G.ais[0]; maxMem = Math.max(maxMem, Object.keys(ai.mem.u).length);
      const badU = Object.keys(ai.mem.u).filter(id => !seenU.has(+id)), badB = Object.keys(ai.mem.b).filter(id => !seenB.has(+id));
      if (badU.length || badB.length) { ok(false, `seen-ever at t=${G.time | 0}: memory holds never-seen ids ${badU.concat(badB).slice(0, 5)}`); break; } }
  }
  ok(maxMem > 0, `seen-ever: every remembered enemy unit/building was visible at some tick (peak memory ${maxMem} units, ${seenB.size} buildings ever seen)`);
}

/* ---------------------------------------------------------------- 3. determinism */
{
  const hash = (G) => { let h = 2166136261 >>> 0; const add = (n) => { h ^= Math.round(n * 64) | 0; h = Math.imul(h, 16777619) >>> 0; };
    add(G.tick); for (const u of G.units) { add(u.x); add(u.y); add(u.hp); } for (const b of G.buildings) add(b.hp); for (const t of G.teams) { add(t.c || 0); add(t.e || 0); }
    for (const ai of G.ais) if (ai && ai.kind === 't2') { add(ai.st.cmds); add(ai.k); add(ai.rs); } return h.toString(16); };
  const runOnce = () => { const S = sim(); const G = start(S, 33, 'obsidian', 'aurora', { kind: 't2', tier: 'master' }, { kind: 't2', tier: 'hard' }); for (let i = 0; i < (QUICK ? 150 : 240) * 30; i++) { S.step(); if (G.over) break; } return hash(G); };
  const h1 = runOnce(), h2 = runOnce();
  ok(h1 === h2, `determinism: T2 master vs T2 hard, same seed and Math.random stream -> same hash (${h1} / ${h2})`);
  const src = fs.readFileSync(path.join(SRC, '41_ai_lib.js'), 'utf8') + fs.readFileSync(path.join(SRC, '42_ai_agent.js'), 'utf8') + fs.readFileSync(path.join(SRC, '41_ai_params.js'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  ok(!/Math\.random|Date\.|performance\.now/.test(code), 'the T2 sources use no Math.random, Date or performance.now (G-seeded mulberry32 only)');
}

/* ---------------------------------------------------------------- 4. APM cap, measured from the outside */
function apmProbe(src, tier, secs) {
  const S = sim(src); const G = start(S, 34, 'meridian', 'aurora', { kind: 't2', tier }, { kind: 'v3', diff: 'hard' });
  const sb = S.sandbox, orig = sb.aiThink, times = []; let inThink = false;
  const rec = recorder(S); rec.log.length = 0;
  sb.aiThink = function (ai) { if (ai.team !== 0) return orig(ai); const n0 = rec.log.length; inThink = true; try { orig(ai); } finally { inThink = false; }
    const L = rec.log.slice(n0); rec.log.length = n0; // group identical setOrder payloads issued in one think into one selection command
    const keys = new Set(); for (const x of L) keys.add(x.startsWith('setOrder(') ? 'setOrder' + x.slice(x.indexOf(',')) : x + '|' + keys.size);
    for (let i = 0; i < keys.size; i++) times.push(G.time); };
  for (let i = 0; i < secs * 30; i++) { S.step(); if (G.over) break; rec.log.length = 0; }
  sb.aiThink = orig; rec.stop();
  const cfg = G.ais[0].cfg, rate = cfg.apm / 60, burst = Math.max(3, rate * 5); let worst = 0, worstW = 0;
  for (const W of [1, 5, 10, 30]) { let j = 0; for (let i = 0; i < times.length; i++) { while (times[i] - times[j] > W) j++; const n = i - j + 1, bound = burst + rate * W + 1; if (n / bound > worst) { worst = n / bound; worstW = W; } } }
  return { n: times.length, apm: times.length / (G.time / 60), cap: cfg.apm, worst, worstW };
}
for (const tier of QUICK ? ['master'] : ['easy', 'master']) {
  const r = apmProbe(undefined, tier, QUICK ? 180 : 300);
  ok(r.n > 50 && r.worst <= 1, `APM cap ${tier}: ${r.n} commands, ${r.apm.toFixed(0)} per minute on average (cap ${r.cap}); worst window ${r.worstW}s at ${(100 * r.worst).toFixed(0)}% of the token-bucket bound`);
}
{
  const d = mutatedTree([['function aiAct(ai){', 'function aiAct(ai){ai.apm.tok=1e9;']]);
  try { const r = apmProbe(d, 'easy', 180); ok(r.worst > 1, `CONTROL: an aiAct that never refuses breaks the bound (worst ${(100 * r.worst).toFixed(0)}% in a ${r.worstW}s window, ${r.apm.toFixed(0)}/min vs cap ${r.cap})`); }
  finally { fs.rmSync(d, { recursive: true, force: true }); }
}

/* ---------------------------------------------------------------- 5. save round trip with two T2 AIs */
{
  const S = sim(); let st = 7; S.sandbox.Math.random = function () { st = (st + 0x6D2B79F5) >>> 0; let t = st; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  S.newGame({ seed: 35, faction: 'aurora', enemy: 'obsidian', diff: 'normal', aiBoth: true }); const G = S.G;
  G.ais[0] = makeAgent(S, { kind: 't2', tier: 'master' }, 0); G.ais[1] = makeAgent(S, { kind: 't2', tier: 'hard' }, 1);
  for (let i = 0; i < 1500; i++) S.step();
  const snap = S.gameSnapshot(), stSave = st, ai0 = stateOf(S.G.ais[0]);
  const hash = (G) => { let h = 0; for (const u of G.units) h = (h * 31 + Math.round(u.x * 8) + Math.round(u.hp)) | 0; for (const t of G.teams) h = (h * 31 + Math.round((t.c || 0) * 8)) | 0; return h + ':' + G.ais[0].st.cmds + ':' + G.ais[1].st.cmds + ':' + G.ais[0].k; };
  for (let i = 0; i < 600; i++) S.step(); const hA = hash(S.G);
  st = stSave; S.gameRestore(snap); ok(stateOf(S.G.ais[0]) === ai0, 'save: the T2 AI state (memory, typed-array beliefs, pheromones) restores exactly');
  for (let i = 0; i < 600; i++) S.step(); const hB = hash(S.G);
  ok(hA === hB, `save: T2 master vs T2 hard, 600 ticks after restore give the same state hash (${hA} / ${hB})`);
}

/* ---------------------------------------------------------------- 6. CPU (relative) */
{
  const { profile } = require(path.join(__dirname, '..', '..', 'tools', 'league', 'profile.js'));
  const secs = QUICK ? 240 : 360;
  const a = profile({ kind: 't2', tier: 'master' }, { kind: 'v3', diff: 'hard' }, 3, secs), b = profile({ kind: 'v3', diff: 'hard' }, { kind: 'v3', diff: 'hard' }, 3, secs);
  const simA = a.msTick - a.ai0 - a.ai1, isolated = (simA + a.ai0 + a.ai1) / (simA + b.ai0 + a.ai1);
  console.log(`info  ms/tick: T2-master game ${a.msTick.toFixed(3)} (T2 AI ${a.ai0.toFixed(4)}, worst think ${a.worst0.toFixed(1)} ms) | v3-hard game ${b.msTick.toFixed(3)} (v3 AI ${b.ai0.toFixed(4)}, worst ${b.worst0.toFixed(1)} ms)`);
  ok(isolated <= 1.25, `CPU: replacing the v3-hard AI by T2 master costs ${((isolated - 1) * 100).toFixed(1)} % of the total tick time (budget +25 %)`);
  ok(a.worst0 < 40, `CPU: worst single T2 think ${a.worst0.toFixed(1)} ms (bound 40 ms; v3 hard worst ${b.worst0.toFixed(1)} ms)`);
}
console.log(fails ? `\n${fails} AI AGENT CHECK(S) FAILED` : '\nALL AI AGENT CHECKS PASSED'); process.exit(fails ? 1 : 0);
