#!/usr/bin/env node
/* "Obvious dumbness" probe for the AI-controlled sides: every 5 game seconds count idle workers, the bank, and STUCK units (a move /
   attack-move / gather order whose unit has not moved 8 px in 10 s and is not fighting), plus neutral creeps that left their camp.
     node tools/league/diag_agents.js '<spec0>' '<spec1>' [seeds=1,2] [capSec=600]
   Prints per side the mean idle-worker count, worker-seconds idle (% of all worker-seconds), mean crystals / ether banked, stuck-unit
   episodes, and the creep leash check. */
'use strict';
const { sim, makeAgent } = require('./game.js');
const a = process.argv.slice(2), s0 = JSON.parse(a[0] || '{"kind":"t2","tier":"master"}'), s1 = JSON.parse(a[1] || '{"kind":"t2","tier":"hard"}');
const seeds = (a[2] || '1,2').split(',').map(Number), cap = +a[3] || 600, FAC = ['meridian', 'obsidian', 'aurora'];
const S = sim(process.env.OD_SRC || undefined);
for (const seed of seeds) {
  let st = seed * 7919 + 13; S.sandbox.Math.random = function () { st = (st + 0x6D2B79F5) >>> 0; let t = st; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  S.newGame({ seed, faction: FAC[seed % 3], enemy: FAC[(seed + 1) % 3], diff: 'normal', aiBoth: true }); const G = S.G;
  G.ais[0] = makeAgent(S, s0, 0); G.ais[1] = makeAgent(S, s1, 1);
  const acc = [0, 1].map(() => ({ n: 0, idle: 0, wk: 0, c: 0, e: 0, stuck: 0, stuckIds: new Set() })), last = {}, creepFar = { n: 0, max: 0 };
  for (let i = 1; i <= cap * 30; i++) {
    S.step(); if (G.over) break;
    if (i % 150) continue;
    for (const t of [0, 1]) { const A = acc[t], T = G.teams[t]; A.n++; A.c += T.c; A.e += T.e;
      for (const u of G.units) { if (u.dead || u.team !== t) continue;
        if (u.def.worker) { A.wk++; if (u.order.t === 'idle' && !u.garr && !u.hidden) A.idle++; }
        const k = u.id, o = u.order.t, p = last[k];
        if ((o === 'move' || o === 'attackmove' || o === 'gather') && !u.target && !u.hidden && !u.garr) {
          if (p && G.time - p.t >= 10 && Math.hypot(u.x - p.x, u.y - p.y) < 8 && (o !== 'gather' || u.order.st === 'go')) { if (!A.stuckIds.has(k)) { A.stuck++; A.stuckIds.add(k); } last[k] = { x: u.x, y: u.y, t: G.time }; }
          else if (!p || Math.hypot(u.x - p.x, u.y - p.y) >= 8) last[k] = { x: u.x, y: u.y, t: G.time };
        } else last[k] = { x: u.x, y: u.y, t: G.time }; } }
    for (const u of G.units) if (!u.dead && u.team === 2 && u.camp !== undefined) { const c = G.camps.find(x => x.id === u.camp); if (c) { const d = Math.hypot(u.x - c.x, u.y - c.y); creepFar.n++; if (d > creepFar.max) creepFar.max = d; } }
  }
  for (const t of [0, 1]) { const A = acc[t]; console.log(`seed ${seed} team ${t} (${JSON.stringify(t ? s1 : s0).slice(0, 60)}): idle workers ${(A.idle / A.n).toFixed(2)} avg (${(100 * A.idle / Math.max(1, A.wk)).toFixed(1)} % of worker-time), bank c ${(A.c / A.n).toFixed(0)} e ${(A.e / A.n).toFixed(0)}, stuck units ${A.stuck}`); }
  console.log(`seed ${seed} creeps: farthest from camp ${creepFar.max.toFixed(0)} px`);
}
