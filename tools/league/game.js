/* Headless game between two agent specs (used by the league, the evaluations and tests/sim/ai_*.js).
     spec = {kind:'v3', diff:'easy'|'normal'|'hard'}                      the legacy wave AI (40_ai.js) incl. its income multiplier
          | {kind:'t2', tier:'easy'|'normal'|'hard'|'master', theta:[...unit cube], cfg:{...tier overrides}, noV:bool}
   playGame({seed, f0, f1, a0, a1, cap, rs, log, src}) -> {r0 (1 win / 0 loss / 0.5 draw for team 0), t, over, share0, adjudicated, feats, cmds}
   Draw rule at the cap: material score share (army + structures + workers + bank + era); share > 0.6 wins, < 0.4 loses, else a draw.
   Each game pins its own Math.random stream (rs), so a game's result does not depend on which games ran before it in the process. */
'use strict';
const path = require('path');
const SIMLIB = path.join(__dirname, '..', '..', 'tests', 'sim', 'simlib3.js');
const cache = {};
function sim(src) {
  const k = src || '';
  if (!cache[k]) { const S = require(SIMLIB)(src || undefined); try { S.__vf0 = S.__run('typeof AI_PARAMS!=="undefined"?JSON.parse(JSON.stringify(AI_PARAMS.vf)):null'); } catch (e) { S.__vf0 = null; } cache[k] = S; }
  return cache[k];
}
function pin(S, rs) { let s = rs >>> 0; S.sandbox.Math.random = function () { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function makeAgent(S, spec, team) {
  const run = S.__run;
  if (spec.kind === 'v3') return run(`makeAIV3(${team},DIFF[${JSON.stringify(spec.diff || 'normal')}])`);
  const o = { tier: spec.tier || 'normal' };
  if (spec.theta) o.theta = spec.theta; if (spec.cfg) o.cfg = spec.cfg; if (spec.noV) o.noV = true; if (spec.handicap) o.handicap = spec.handicap;
  return run(`makeAIT2(${team},DIFF[${JSON.stringify(o.tier)}]||DIFF.normal,${JSON.stringify(o)})`);
}
function score(G, t) {
  let s = 0; const T = G.teams[t];
  for (const u of G.units) if (!u.dead && u.team === t) { const d = u.def; s += d.worker ? 50 : (d.cost ? d.cost.c + d.cost.e : 0) * Math.max(0.2, u.hp / u.maxhp); }
  for (const b of G.buildings) if (!b.dead && b.team === t) { const d = b.def; s += (d.cost.c + d.cost.e) * (b.done ? 1 : b.prog) * Math.max(0.3, b.hp / b.maxhp); }
  return s + 0.3 * (T.c + T.e) + 200 * (T.era - 1);
}
/* privileged features: the same definitions as aiFeatures (42_ai_agent.js) but with the TRUE opponent state (training-time analysis only) */
function privFeatures(S, team) {
  const G = S.G, en = 1 - team, T = G.teams[team], E = G.teams[en];
  const side = (t) => { let V = 0, W = 0, St = 0, H = 0; for (const u of G.units) if (!u.dead && u.team === t) { if (u.def.worker) W++; else if (!u.def.trade) V += (u.def.cost.c + u.def.cost.e + (u.def.hero ? 100 : 0)) * Math.max(0.15, u.hp / u.maxhp); }
    for (const b of G.buildings) if (!b.dead && b.team === t) { St += b.def.cost.c + b.def.cost.e; if (b.type === 'hub') H++; } return { V, W, St, H }; };
  const a = side(team), e = side(en);
  return [Math.log((a.V + 100) / (e.V + 100)), Math.log((a.W + 2) / (e.W + 2)), a.H - e.H, T.era - E.era, G.time / 600, (a.V - e.V) / 1000, T.used / 120, Math.log((T.c + T.e + 100) / 100),
    (T.hero.alive ? T.hero.level : 0) - (E.hero.alive ? E.hero.level : 0), (T.kills - (T.creeps || 0) - T.lost) / 20, Math.log((a.St + 400) / (e.St + 400))];
}
function playGame(o) {
  const S = sim(o.src), run = S.__run;
  pin(S, o.rs === undefined ? (o.seed * 7919 + 13) : o.rs);
  // the value function in use: o.vf (league phases differ; null -> V = 0.5) or, when absent, the one shipped in 41_ai_params.js
  if (run('typeof AI_PARAMS') !== 'undefined') run(`AI_PARAMS.vf=${JSON.stringify(o.vf === undefined ? S.__vf0 : o.vf)}`);
  S.newGame({ seed: o.seed, faction: o.f0, enemy: o.f1, diff: 'normal', aiBoth: true });
  const G = S.G;
  G.ais[0] = makeAgent(S, o.a0, 0); G.ais[1] = makeAgent(S, o.a1, 1);
  const cap = (o.cap || 540) * 30, every = (o.logEvery || 15) * 30, feats = [];
  for (let i = 0; i < cap; i++) {
    S.step(); if (G.over) break;
    if (o.log && i % every === every - 1) for (let t = 0; t < 2; t++) { const ai = G.ais[t]; if (ai && ai.kind === 't2') feats.push({ t: G.time, team: t, f: run(`aiFeatures(G.ais[${t}])`), p: privFeatures(S, t) }); }
  }
  let r0, adj = false; const s0 = score(G, 0), s1 = score(G, 1), share0 = s0 / Math.max(1, s0 + s1);
  if (G.over) r0 = G.over === 'victory' ? 1 : 0;           // 'victory' = team 0 destroyed every team-1 building
  else { adj = true; r0 = share0 > 0.6 ? 1 : share0 < 0.4 ? 0 : 0.5; }
  const cmds = [0, 1].map(t => G.ais[t] && G.ais[t].st ? G.ais[t].st.cmds : null);
  return { r0, t: Math.round(G.time), over: !!G.over, share0: +share0.toFixed(3), adjudicated: adj, feats, cmds };
}
module.exports = { playGame, sim, score, privFeatures, makeAgent };
if (require.main === module) {  // quick CLI: node tools/league/game.js seed f0 f1 '<spec0 json>' '<spec1 json>' [capSec]
  const a = process.argv.slice(2);
  const t0 = Date.now();
  const r = playGame({ seed: +a[0] || 1, f0: a[1] || 'meridian', f1: a[2] || 'obsidian', a0: JSON.parse(a[3] || '{"kind":"t2"}'), a1: JSON.parse(a[4] || '{"kind":"v3","diff":"normal"}'), cap: +a[5] || 540 });
  delete r.feats; console.log(JSON.stringify(r), (Date.now() - t0) + 'ms');
}
