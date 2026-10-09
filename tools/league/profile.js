#!/usr/bin/env node
/* CPU profile of the AI inside the headless sim: total tick cost and the share spent in aiThink, per side.
     node tools/league/profile.js '<spec0>' '<spec1>' [seeds=1,2,3] [capSec=480]
   aiThink is wrapped from the outside (the sim code is not changed); timing uses process.hrtime in this tool, never in the sim.
   Reports per game: ms per tick (whole step incl. AI), AI ms per tick per side, worst single think (ms), thinks per game-second. */
'use strict';
const { sim, makeAgent } = require('./game.js');
function profile(spec0, spec1, seed, cap, src) {
  const S = sim(src), sb = S.sandbox; let st = seed * 7919 + 13;
  sb.Math.random = function () { st = (st + 0x6D2B79F5) >>> 0; let t = st; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const FAC = ['meridian', 'obsidian', 'aurora'];
  S.newGame({ seed, faction: FAC[seed % 3], enemy: FAC[(seed + 1) % 3], diff: 'normal', aiBoth: true }); const G = S.G;
  G.ais[0] = makeAgent(S, spec0, 0); G.ais[1] = makeAgent(S, spec1, 1);
  const orig = sb.aiThink, acc = [0, 0], worst = [0, 0], n = [0, 0];
  sb.aiThink = function (ai) { const t0 = process.hrtime.bigint(); orig(ai); const dt = Number(process.hrtime.bigint() - t0) / 1e6; acc[ai.team] += dt; n[ai.team]++; if (dt > worst[ai.team]) worst[ai.team] = dt; };
  const t0 = process.hrtime.bigint(); let ticks = 0;
  for (let i = 0; i < cap * 30; i++) { S.step(); ticks++; if (G.over) break; }
  const tot = Number(process.hrtime.bigint() - t0) / 1e6;
  sb.aiThink = orig;
  return { seed, ticks, msTick: tot / ticks, ai0: acc[0] / ticks, ai1: acc[1] / ticks, worst0: worst[0], worst1: worst[1], hz0: n[0] / (ticks / 30), hz1: n[1] / (ticks / 30), units: G.units.length };
}
module.exports = { profile };
if (require.main === module) {
  const a = process.argv.slice(2), s0 = JSON.parse(a[0] || '{"kind":"t2","tier":"master"}'), s1 = JSON.parse(a[1] || '{"kind":"v3","diff":"hard"}');
  const seeds = (a[2] || '1,2,3').split(',').map(Number), cap = +a[3] || 480;
  const rows = seeds.map(s => profile(s0, s1, s, cap));
  const m = k => rows.reduce((s, r) => s + r[k], 0) / rows.length;
  for (const r of rows) console.log(`seed ${r.seed}: ${r.ticks} ticks  ${r.msTick.toFixed(3)} ms/tick  AI0 ${r.ai0.toFixed(4)}  AI1 ${r.ai1.toFixed(4)} ms/tick  worst think ${r.worst0.toFixed(2)} / ${r.worst1.toFixed(2)} ms  thinks/s ${r.hz0.toFixed(2)} / ${r.hz1.toFixed(2)}  units ${r.units}`);
  console.log(`MEAN ms/tick ${m('msTick').toFixed(3)}  AI0 ${m('ai0').toFixed(4)} (${(100 * m('ai0') / m('msTick')).toFixed(1)}%)  AI1 ${m('ai1').toFixed(4)} (${(100 * m('ai1') / m('msTick')).toFixed(1)}%)  worst ${Math.max(...rows.map(r => r.worst0)).toFixed(2)} / ${Math.max(...rows.map(r => r.worst1)).toFixed(2)} ms`);
}
