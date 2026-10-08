#!/usr/bin/env node
/* WALKTHROUGH BOTS for the missions the stock AI cannot judge (scripted stealth / escort / hold / sacrifice missions: tests/sim/campaign_balance.js reports "AI cannot judge").
   Each bot is a crude hand-written player that follows the mission's intended route. It proves WINNABILITY (the scripted objectives can be completed and the win condition fires),
   NOT difficulty: a bot is neither a novice nor an expert. Seeds pin Math.random (RS), so the result is reproducible.
     node tests/sim/campaign_walkthrough.js [m05,m06,...] [--seeds 1,2,3]
   m05 Glass Market  escort Lyra (+ Specters) to the Census Hall (24,15), stay 30 s, leave for Wick Post (13,34)
   m06 The Third Bell  attack-move the army onto the Axis (hero stays back), dodge the two announced strikes, hold until 660 s, pull out before 720 s
   m08 Patience  walk the hauler and escort to Tallow (rest 20 s), Wick, the Axis
   m09 The Closing  the stock AI breaks the garrison and Foci; at that point the hero is walked to the Axis and held there (needs >= 1 of 3 seeds: the AI also loses the Hub in some runs) */
'use strict';
const path = require('path');
const mk = require('./simlib3.js'), STORY = require('./storylib.js')().STORY;
const want = (process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'm05,m06,m08,m09').split(',');
const si = process.argv.indexOf('--seeds'), SEEDS = si > 0 ? process.argv[si + 1].split(',').map(Number) : [1, 2, 3];
const mission = id => JSON.parse(JSON.stringify(STORY.missions.find(x => x.id === id)));
const objs = S => Object.fromEntries(S.__run('campObjectives(true)').map(o => [o.id, o.state]));
function play(id, seed, brain, maxSec) {
  process.env.RS = String(seed);
  const S = mk(), m = mission(id);
  S.newGame({ campaign: m, autoResume: brain.aiBoth, aiBoth: !!brain.aiBoth });
  if (brain.aiBoth) S.G.ais[0] = S.__run('makeAI(0,DIFF.normal)');
  const G = S.G, T = S.TILE, st = brain.init ? brain.init(S, m) : {};
  for (let i = 0; i < 30 * maxSec && !G.over; i++) {
    S.step(); if (i % 30 === 0) brain.tick(S, G, T, G.time, st, m);
  }
  return { res: G.over, t: Math.round(G.time), objs: objs(S) };
}
const mine = G => G.units.filter(u => !u.dead && u.team === 0);
const BOTS = {
  m05: { max: 400, tick(S, G, T, t, st) {
    if (t < 2) return; const O = objs(S), my = mine(G), h = my.find(u => u.def.hero);
    const dest = O.o_copy === 'done' ? [13, 34] : [24, 15];
    for (const u of my) S.setOrder(u, { t: 'attackmove', x: (dest[0] + .5) * T, y: (dest[1] + .5) * T }); } },
  m06: { max: 800, init(S, m) { // 3 Meridian turrets ring the Axis: the army clears them first; announced strikes (trigger time + delay) are dodged
      const sk = []; for (const t of m.triggers) for (const a of t.do) if (a[0] === 'strike' && a[7] === 'me') sk.push({ t0: t.when[2], x: a[1], y: a[2], r: a[3], d: a[4] / 30 }); return { sk }; },
    tick(S, G, T, t, st) {
      const hz = st.sk.filter(s => t >= s.t0 - 1 && t <= s.t0 + s.d + 6);
      for (const u of mine(G)) {
        const ux = u.x / T, uy = u.y / T; let flee = null;
        for (const h of hz) { const d = Math.hypot(ux - h.x, uy - h.y); if (d < h.r + 4) { const a = Math.atan2(uy - h.y, ux - h.x); flee = { x: h.x + Math.cos(a) * (h.r + 8), y: h.y + Math.sin(a) * (h.r + 8) }; } }
        if (flee) { S.setOrder(u, { t: 'move', x: flee.x * T, y: flee.y * T }); continue; }
        if (t < 650) { const d = u.def.hero ? { x: 41, y: 47 } : { x: 44, y: 44 + ((u.id % 5) - 2) * 1.2 };
          S.setOrder(u, u.def.hero ? { t: 'move', x: d.x * T, y: d.y * T } : { t: 'attackmove', x: d.x * T, y: d.y * T }); }
        else if (t >= 690 && Math.hypot(ux - 44, uy - 70) > 3) S.setOrder(u, { t: 'move', x: 44 * T, y: 70 * T }); } } },
  m08: { max: 300, init: () => ({ wp: 0, wait: 0 }), tick(S, G, T, t, st) {
    const WP = [[14, 50, 24], [29, 37, 0], [37, 41, 0], [44, 44, 0]], my = mine(G), h = my.find(u => u.def.worker); if (t < 3 || !h) return;
    const w = WP[st.wp]; if (Math.hypot(h.x / T - w[0], h.y / T - w[1]) < 2.5) { st.wait++; if (st.wait >= w[2] && st.wp < 3) { st.wp++; st.wait = 0; } }
    const d = WP[st.wp];
    for (const u of my) { const want = u.def.worker ? { t: 'move', x: d[0] * T, y: d[1] * T } : { t: 'attackmove', x: (d[0] - 2.5 + (u.id * 7) % 5) * T, y: (d[1] - 2.5 + (u.id * 3) % 5) * T };
      if (!u.order || u.order.t === 'idle' || u._wp !== st.wp) { S.setOrder(u, want); u._wp = st.wp; } } } },
  m09: { max: 1700, aiBoth: true, init: () => ({ took: false }), tick(S, G, T, t, st) {
    if (!st.took && objs(S).o_garrison === 'done') st.took = true; if (!st.took) return;
    const h = mine(G).find(u => u.def.hero); if (h && Math.hypot(h.x / T - 44, h.y / T - 44) > 2) S.setOrder(h, { t: 'move', x: 44 * T, y: 44 * T });
    const p = mine(G).find(u => u.def.worker); if (p && Math.hypot(p.x / T - 32, p.y / T - 44) > 3 && (!p.order || p.order.t === 'idle')) S.setOrder(p, { t: 'move', x: 32 * T, y: 44 * T }); } }
};
let fails = 0;
for (const id of want) {
  const r = SEEDS.map(s => play(id, s, BOTS[id], BOTS[id].max)), wins = r.filter(x => x.res === 'victory').length, need = id === 'm09' ? 1 : SEEDS.length;
  const ok = wins >= need; if (!ok) fails++;
  console.log((ok ? 'ok    ' : 'FAIL  ') + id + ' ' + STORY.missions.find(x => x.id === id).title + ': bot wins ' + wins + '/' + SEEDS.length + ' (need ' + need + ') in ' + r.map(x => x.t + 's ' + x.res).join(', '));
}
console.log(fails ? '\nWALKTHROUGH FAILED' : '\nALL WALKTHROUGHS WON (winnability only: a bot says nothing about difficulty)'); process.exit(fails ? 1 : 0);
