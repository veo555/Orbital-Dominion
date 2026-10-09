#!/usr/bin/env node
/* Calibrate the combat predictor (41_ai_lib.js: cmbSimulate / cmbPredict) against the REAL simulation.
     node tools/league/calib_combat.js [n=300] [seed=1] [--json out.json]
   Random skirmishes: two random armies (2-14 units each from all producible types, random weapon/armor upgrades 0-2 per side,
   sometimes a hero of level 1-5) are placed 440 px apart on open ground at the map centre (creeps removed, no AI, no buildings),
   ordered to attack-move into each other and simulated for up to 60 s. Outcome: side A wins if it has units left and B has none;
   at the time limit the side with the larger remaining fraction of its starting value wins.
   The predictor's margin m (ODE) is mapped to P(A wins) = sigmoid(k m); k is fitted by 1-D logistic regression on the first half and
   evaluated on the second half (log-loss, Brier, accuracy, reliability table). Also reported: the closed-form Lanchester
   strength ratio as a baseline predictor. Deterministic for a given seed. */
'use strict';
const { sim } = require('./game.js');
const a = process.argv.slice(2); const N = +a[0] || 300, SEED = +a[1] || 1, jsonOut = a.includes('--json') ? a[a.indexOf('--json') + 1] : null;
const S = sim(), run = S.__run;
let st = SEED * 1013904223 >>> 0; const R = () => { st = (st + 0x6D2B79F5) >>> 0; let t = st; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
S.sandbox.Math.random = R;
const TYPES = ['rifleman', 'rifleman', 'raptor', 'rocketeer', 'mender', 'howitzer', 'juggernaut', 'skiff', 'titan', 'bulwark', 'reaver', 'specter'];
const HEROES = ['hero_idris', 'hero_kaz', 'hero_lyra'];
const sigm = (x) => 1 / (1 + Math.exp(-x));
const rows = [];
for (let n = 0; n < N; n++) {
  S.newGame({ seed: 7, faction: 'meridian', enemy: 'obsidian', diff: 'normal', aiBoth: true }); const G = S.G;
  G.ais[0] = null; G.ais[1] = null;
  for (const u of G.units) u.dead = true; G.units = []; G.proj = [];
  for (const b of G.buildings) b.dead = true; G.buildings = []; run('rebuildBlocked()');
  G.daylight = 1; const cx = 43.5 * 32, cy = 43.5 * 32;
  const army = (team) => {
    const T = G.teams[team]; T.wl = Math.floor(R() * 3); T.al = Math.floor(R() * 3); T.hero = { alive: false, level: 1 + Math.floor(R() * 5), xp: 0, sk: [0, 0, 0], uid: 0, reviving: false };
    const n = 2 + Math.floor(R() * 13), list = [];
    for (let i = 0; i < n; i++) list.push(TYPES[Math.floor(R() * TYPES.length)]);
    if (R() < 0.25) list.push(HEROES[Math.floor(R() * 3)]);
    const x0 = cx + (team ? 220 : -220), out = [];
    list.forEach((t, i) => { let x = x0 + ((i % 4) - 1.5) * 26 * (team ? 1 : -1), y = cy + (Math.floor(i / 4) - 1.5) * 26;
      if (!S.canStand(x, y)) { const f = run(`nearestFree(${Math.floor(x / 32)},${Math.floor(y / 32)},6)`); if (f) { x = (f[0] + .5) * 32; y = (f[1] + .5) * 32; } }
      out.push(S.addUnit(t, team, x, y)); });
    return out;
  };
  const A = army(0), B = army(1);
  run('recalcTeams()'); for (let i = 0; i < 3; i++) run('updateVision()');
  const pred = run('(()=>{const L0=G.units.filter(u=>u.team===0),L1=G.units.filter(u=>u.team===1);const a=aiStacksOf(L0,0),b=aiStacksOf(L1,1);const r=cmbSimulate(a,b);return{m:r.margin,w:r.win,ls:Math.log(cmbStrength(a,b)+1)-Math.log(cmbStrength(b,a)+1)};})()');
  for (const u of A) S.setOrder(u, { t: 'attackmove', x: cx + 260, y: cy, gs: 0 });
  for (const u of B) S.setOrder(u, { t: 'attackmove', x: cx - 260, y: cy, gs: 0 });
  const val = (L) => L.reduce((s, u) => s + (u.dead ? 0 : (u.def.cost.c + u.def.cost.e + (u.def.hero ? 100 : 0)) * u.hp / u.maxhp), 0);
  const vA0 = val(A), vB0 = val(B);
  let t = 0;
  for (; t < 60 * 30; t++) { S.step(); const a0 = A.some(u => !u.dead), b0 = B.some(u => !u.dead); if (!a0 || !b0) break; }
  const ra = val(A) / vA0, rb = val(B) / vB0, aliveA = A.some(u => !u.dead), aliveB = B.some(u => !u.dead);
  const y = aliveA && !aliveB ? 1 : aliveB && !aliveA ? 0 : (ra > rb ? 1 : ra < rb ? 0 : 0.5);
  rows.push({ m: pred.m, ls: pred.ls, y, t: +(t / 30).toFixed(1), nA: A.length, nB: B.length, A: A.map(u => u.type).join(','), B: B.map(u => u.type).join(',') });
}
// fit k on the first half (1-D logistic regression through the origin: symmetric by construction), evaluate on the second half
function fitK(xs, ys) { let k = 1; for (let it = 0; it < 100; it++) { let g = 0, h = 1e-9; for (let i = 0; i < xs.length; i++) { const p = sigm(k * xs[i]); g += (p - ys[i]) * xs[i]; h += p * (1 - p) * xs[i] * xs[i]; } const s = g / h; k -= s; if (Math.abs(s) < 1e-9) break; } return k; }
const half = Math.floor(rows.length / 2), tr = rows.slice(0, half), te = rows.slice(half);
const kOde = fitK(tr.map(r => r.m), tr.map(r => r.y)), kL = fitK(tr.map(r => r.ls), tr.map(r => r.y));
const evalP = (ps, ys) => { let ll = 0, br = 0, acc = 0, n = 0; for (let i = 0; i < ps.length; i++) { const p = Math.min(1 - 1e-6, Math.max(1e-6, ps[i])); ll += -(ys[i] * Math.log(p) + (1 - ys[i]) * Math.log(1 - p)); br += (p - ys[i]) ** 2; if (ys[i] !== 0.5) { n++; if ((p > 0.5) === (ys[i] === 1)) acc++; } } return { logloss: +(ll / ps.length).toFixed(4), brier: +(br / ps.length).toFixed(4), acc: +(acc / Math.max(1, n)).toFixed(3) }; };
const rel = (ps, ys) => { const b = []; for (let i = 0; i < 10; i++) { const idx = ps.map((p, j) => [p, j]).filter(([p]) => p >= i / 10 && (i === 9 ? p <= 1 : p < (i + 1) / 10)).map(([, j]) => j); if (idx.length) b.push({ bin: (i / 10).toFixed(1) + '-' + ((i + 1) / 10).toFixed(1), n: idx.length, pred: +(idx.reduce((s, j) => s + ps[j], 0) / idx.length).toFixed(3), obs: +(idx.reduce((s, j) => s + ys[j], 0) / idx.length).toFixed(3) }); } return b; };
// 2-feature logistic blend (no intercept: the predictor must be antisymmetric in A and B)
function fit2(X, ys) { let w = [0, 0]; for (let it = 0; it < 100; it++) { const g = [0, 0], H = [[1e-9, 0], [0, 1e-9]]; for (let i = 0; i < X.length; i++) { const p = sigm(w[0] * X[i][0] + w[1] * X[i][1]), e = p - ys[i], v = p * (1 - p);
  for (let a = 0; a < 2; a++) { g[a] += e * X[i][a]; for (let b = 0; b < 2; b++) H[a][b] += v * X[i][a] * X[i][b]; } }
  const det = H[0][0] * H[1][1] - H[0][1] * H[1][0], s0 = (H[1][1] * g[0] - H[0][1] * g[1]) / det, s1 = (H[0][0] * g[1] - H[1][0] * g[0]) / det; w = [w[0] - s0, w[1] - s1]; if (Math.abs(s0) + Math.abs(s1) < 1e-10) break; } return w; }
const wB = fit2(tr.map(r => [r.m, r.ls]), tr.map(r => r.y));
const yT = te.map(r => r.y), pO = te.map(r => sigm(kOde * r.m)), pL = te.map(r => sigm(kL * r.ls)), pB = te.map(r => sigm(wB[0] * r.m + wB[1] * r.ls));
const shipped = run('JSON.stringify(AI_PARAMS.combat)'), cS = JSON.parse(shipped), pS = te.map(r => sigm(cS.kOde * r.m + cS.kL * r.ls));
const out = { n: rows.length, kOde: +kOde.toFixed(3), kLanchester: +kL.toFixed(3), blend: { kOde: +wB[0].toFixed(3), kL: +wB[1].toFixed(3) }, ode: evalP(pO, yT), lanchester: evalP(pL, yT), blendFit: evalP(pB, yT), shipped: Object.assign({ params: cS }, evalP(pS, yT)), base: evalP(yT.map(() => 0.5), yT),
  reliability: rel(pS, yT), drawFrac: +(rows.filter(r => r.y === 0.5).length / rows.length).toFixed(3), meanDur: +(rows.reduce((s, r) => s + r.t, 0) / rows.length).toFixed(1),
  worst: te.map((r, i) => ({ r, err: Math.abs(pS[i] - r.y) })).sort((x, y) => y.err - x.err).slice(0, 8).map(x => ({ A: x.r.A, B: x.r.B, m: +x.r.m.toFixed(3), y: x.r.y })) };
console.log(JSON.stringify(out, null, 1));
if (jsonOut) require('fs').writeFileSync(jsonOut, JSON.stringify({ summary: out, rows }, null, 1));
