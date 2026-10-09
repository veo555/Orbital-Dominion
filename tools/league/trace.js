/* Diagnostic trace of one game: every N game-seconds print both sides' economy / army / posture.
     node tools/league/trace.js seed f0 f1 '<spec0>' '<spec1>' [capSec] [everySec] */
'use strict';
const { sim, makeAgent, score } = require('./game.js');
const a = process.argv.slice(2);
const seed = +a[0] || 1, f0 = a[1] || 'meridian', f1 = a[2] || 'obsidian';
const s0 = JSON.parse(a[3] || '{"kind":"t2"}'), s1 = JSON.parse(a[4] || '{"kind":"v3","diff":"normal"}'), cap = +a[5] || 540, every = +a[6] || 30;
const S = sim(); let st = seed * 7919 + 13; S.sandbox.Math.random = function () { st = (st + 0x6D2B79F5) >>> 0; let t = st; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
S.newGame({ seed, faction: f0, enemy: f1, diff: 'normal', aiBoth: true }); const G = S.G;
G.ais[0] = makeAgent(S, s0, 0); G.ais[1] = makeAgent(S, s1, 1);
const row = (t) => {
  const T = G.teams[t], ai = G.ais[t]; let W = 0, A = 0; const comp = {};
  for (const u of G.units) if (!u.dead && u.team === t) { if (u.def.worker) W++; else if (!u.def.trade) { A += u.def.supply; comp[u.type] = (comp[u.type] || 0) + 1; } }
  const bl = {}; for (const b of G.buildings) if (!b.dead && b.team === t) bl[b.type] = (bl[b.type] || 0) + (b.done ? 1 : 0.1);
  const x = ai && ai.kind === 't2' ? ` mil=${ai.mil} pG=${ai.pG.toFixed(2)} pL=${(+ai.pL).toFixed(2)} V=${ai.V.toFixed(2)} cmds=${ai.st.cmds} den=${ai.apm.denied} eng=${ai.st.engage} ret=${ai.st.retreat} foc=${ai.st.focus} kite=${ai.st.kite} sc=${ai.scout.id ? 1 : 0} by=${JSON.stringify(ai.st.by||{}).replace(/"/g,'')}` : (ai ? ` wave=${ai.wave} att=${ai.attacking}` : '');
  return `T${t} c=${T.c | 0} e=${T.e | 0} sup=${T.used}/${T.cap} W=${W} A=${A} era=${T.era} k/l=${T.kills}/${T.lost} sc=${score(G, t) | 0} ${JSON.stringify(bl).replace(/"/g, '')} ${JSON.stringify(comp).replace(/"/g, '')}${x}`;
};
for (let i = 1; i <= cap * 30; i++) {
  S.step(); if (G.over) { console.log('OVER', G.over, G.time | 0); break; }
  if (i % (every * 30) === 0) { console.log('t=' + (G.time | 0)); console.log(' ' + row(0)); console.log(' ' + row(1)); }
}
