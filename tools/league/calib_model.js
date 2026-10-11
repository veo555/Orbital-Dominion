#!/usr/bin/env node
/* CALIBRATION OF THE PLANNER'S ABSTRACT MODEL (src/js/41_ai_mcts.js) against the real simulation.
     node tools/league/calib_model.js [--games 12] [--seed0 41001] [--cap 600] [--fit] [--out calib.json] [--spec '<agent spec>']
   1. Plays real T2-vs-T2 games headlessly and logs, every 10 s and for BOTH teams, the TRUE abstract state (aiPlanSide on the real
      state of each team + Lanchester dps/hp per value from the real unit stacks: privileged, offline only) and the team's macro
      behaviour in the next 20 s as a macro-action label (attack / harass / defend / expand / tech / mass / grow, read from the agent's
      posture and from what it actually built).
   2. For every start time t and horizon h in {60, 120} s: runs plStep from the true state at t with both sides' observed labels and
      compares the prediction with the true state at t + h: workers, army value, bank, bases, structures, material share.
      Baseline: persistence (state(t+h) = state(t)). Reported: mean absolute error, and the error relative to the baseline.
   3. --fit: coordinate descent on the model constants (log scale) on the games with even index, evaluated on the odd ones (held out);
      prints the fitted constants as JSON (paste into AI_PARAMS.plm through tools/league/export_params.js --plm).
   Uses one process (the league may be running). */
'use strict';
const fs = require('fs'), path = require('path');
const { sim, makeAgent } = require('./game.js');
const a = process.argv.slice(2), opt = { games: 12, seed0: 41001, cap: 600, fit: false, spec: '{"kind":"t2","tier":"master"}', spec1: null };
for (let i = 0; i < a.length; i++) { const k = a[i], v = () => a[++i];
  if (k === '--games') opt.games = +v(); else if (k === '--seed0') opt.seed0 = +v(); else if (k === '--cap') opt.cap = +v(); else if (k === '--fit') opt.fit = true;
  else if (k === '--out') opt.out = v(); else if (k === '--spec') opt.spec = v(); else if (k === '--spec1') opt.spec1 = v(); else if (k === '--load') opt.load = v(); }
const FAC = ['meridian', 'obsidian', 'aurora'];
const S = sim(process.env.OD_SRC || undefined), run = S.__run;
const PSN = run('PS_N'), PSLEN = run('PS_LEN'), IDX = JSON.parse(run('JSON.stringify({C:PS_C,E:PS_E,W:PS_W,H:PS_H,A:PS_A,ST:PS_ST,LOC:PS_LOC,TRV:PS_TRV,T:PS_T,ERA:PS_ERA,KIL:PS_KIL})'));
const ACT = JSON.parse(run('JSON.stringify(PL_ACTS)'));

function playLogged(seed, k) {
  let st = seed * 7919 + 13; S.sandbox.Math.random = function () { st = (st + 0x6D2B79F5) >>> 0; let t = st; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const f0 = FAC[k % 3], f1 = FAC[(k + 1 + (k / 3 | 0) % 2) % 3];
  S.newGame({ seed, faction: f0, enemy: f1, diff: 'normal', aiBoth: true }); const G = S.G;
  G.ais[0] = makeAgent(S, JSON.parse(opt.spec), 0); G.ais[1] = makeAgent(S, JSON.parse(opt.spec1 || opt.spec), 1);
  const rec = [];
  for (let i = 1; i <= opt.cap * 30; i++) {
    S.step(); if (G.over) break;
    if (i % 300 === 0) rec.push(JSON.parse(run(`(()=>{const s=new Float64Array(PS_LEN);aiPlanSide(s,0,0,G.ais[0].th);aiPlanSide(s,PS_N,1,G.ais[1].th);s[PS_T]=G.time;
      const st=[0,1].map(t=>aiStacksOf(G.units.filter(u=>!u.dead&&u.team===t&&!u.def.worker&&!u.def.trade),t));
      const d0=aiDH(st[0],st[1]),d1=aiDH(st[1],st[0]);s[PS_D]=d0[0];s[PS_HP]=d0[1];s[PS_N+PS_D]=d1[0];s[PS_N+PS_HP]=d1[1];
      const lab=G.ais.map((ai,t)=>({mil:ai.mil,har:ai.har.ids.length>0,eco:ai.eco,hubs:G.buildings.filter(b=>!b.dead&&b.team===t&&b.type==='hub').length+G.units.filter(w=>!w.dead&&w.team===t&&w.order.t==='build'&&!w.order.bld&&w.order.type==='hub').length,
        tech:G.buildings.some(b=>!b.dead&&b.team===t&&b.queue.some(q=>q.k==='era'||q.k==='r')),pl:ai.pl?ai.pl.a:-1}));
      s[PS_LOC]=G.ais[0].mil==='attack'?1:0;s[PS_N+PS_LOC]=G.ais[1].mil==='attack'?1:0;
      return JSON.stringify({s:Array.from(s),lab});})()`)));
  }
  return { seed, f0, f1, rec, over: G.over || null };
}
/* the macro-action label of team t over the 20-s window starting at record i */
function label(g, i, t) {
  const r = g.rec, L = r[i].lab[t], L2 = (r[i + 1] || r[i]).lab[t], L3 = (r[i + 2] || r[i + 1] || r[i]).lab[t];
  if (L.pl >= 0) return L.pl;                                              // a planning agent: its chosen macro-action
  if (L.mil === 'attack' || L2.mil === 'attack') return 4;
  if (L.har || L2.har) return 6;
  if (L.mil === 'defend' || L2.mil === 'defend') return 5;
  if (L3.hubs > L.hubs) return 1;
  if (L.tech || L2.tech) return 2;
  if (L.eco === 'mass') return 3;
  return 0;
}
const SC = { W: 6, A: 600, B: 500, H: 0.6, ST: 1000, share: 0.08 };    // error scales (normalise the variables before summing)
function vars(s, o) { return { W: s[o + IDX.W], A: s[o + IDX.A], B: Math.max(0, s[o + IDX.C]) + Math.max(0, s[o + IDX.E]), H: s[o + IDX.H], ST: s[o + IDX.ST] }; }
const plShareF = run('plShare');
function share(s) { return plShareF(s); }
(function main() {
  const t0 = Date.now(); let games;
  if (opt.load) games = JSON.parse(fs.readFileSync(opt.load, 'utf8'));
  else { games = []; for (let k = 0; k < opt.games; k++) { games.push(playLogged(opt.seed0 + k, k)); process.stderr.write(`game ${k + 1}/${opt.games} (${games[k].rec.length} records) ${Math.round((Date.now() - t0) / 1000)}s\n`); } }
  if (opt.out) fs.writeFileSync(opt.out, JSON.stringify(games));
  const step = run('plStep'), F64 = run('Float64Array');
  // games carry plain arrays; convert the records once into sandbox Float64Arrays
  for (const g of games) for (const r of g.rec) { const x = new F64(PSLEN); for (let j = 0; j < PSLEN; j++) x[j] = r.s[j]; r.s = x; }
  const predict2 = (g, i, h, K) => { const s = new F64(PSLEN); s.set(g.rec[i].s); for (let k = 0; k < h / 20; k++) { const j = Math.min(g.rec.length - 1, i + 2 * k); step(s, label(g, j, 0), label(g, j, 1), K, 20); } return s; };
  const K0 = JSON.parse(run('JSON.stringify(plK())'));
  const labs = {}; for (const g of games) for (let i = 0; i < g.rec.length; i++) for (const t of [0, 1]) { const l = ACT[label(g, i, t)]; labs[l] = (labs[l] || 0) + 1; }
  console.log('labels (team-records): ' + JSON.stringify(labs));
  const train = games.filter((_, i) => i % 2 === 0), test = games.filter((_, i) => i % 2 === 1);
  const ev = (G2, K) => evaluate2(G2, K, [60, 120], predict2);
  console.log('current constants, all games: ' + JSON.stringify(ev(games, K0)));
  if (opt.fit) {
    const keys = ['inc', 'einc', 'prod', 'eng', 'raid', 'wk', 'wt', 'sup', 'trav', 'ret', 'har', 'eraQ', 'gar', 'oth'];
    let K = Object.assign({}, K0), best = obj(train, K, predict2);
    for (let pass = 0; pass < 4; pass++) {
      for (const k of keys) for (const f of [1.5, 1 / 1.5, 1.2, 1 / 1.2, 1.07, 1 / 1.07]) {
        const K2 = Object.assign({}, K); K2[k] = K[k] * f; const L = obj(train, K2, predict2);
        if (L < best - 1e-6) { best = L; K = K2; }
      }
      console.log(`fit pass ${pass + 1}: train loss ${best.toFixed(4)}`);
    }
    for (const k of Object.keys(K)) K[k] = +(+K[k]).toPrecision(4);
    console.log('fitted constants: ' + JSON.stringify(K));
    console.log('held-out games, before: ' + JSON.stringify(ev(test, K0)));
    console.log('held-out games, after:  ' + JSON.stringify(ev(test, K)));
  }
  console.log(`wall ${Math.round((Date.now() - t0) / 1000)} s`);
})();
function obj(games, K, pr) { const r = evaluate2(games, K, [60, 120], pr); return r[60].loss + r[120].loss; }
function evaluate2(games, K, hs, pr) {
  const out = {};
  for (const h of hs) {
    const err = {}, base = {}; let n = 0;
    for (const v of Object.keys(SC)) { err[v] = 0; base[v] = 0; }
    for (const g of games) for (let i = 0; i + h / 10 < g.rec.length; i += 2) {
      const sp = pr(g, i, h, K), s1 = g.rec[i + h / 10].s, s0 = g.rec[i].s;
      for (const o of [0, PSN]) { const p = vars(sp, o), y = vars(s1, o), b = vars(s0, o);
        for (const v of ['W', 'A', 'B', 'H', 'ST']) { err[v] += Math.abs(p[v] - y[v]); base[v] += Math.abs(b[v] - y[v]); } }
      err.share += 2 * Math.abs(share(sp) - share(s1)); base.share += 2 * Math.abs(share(s0) - share(s1)); n += 2;
    }
    const r = { n }; let tot = 0, totB = 0;
    for (const v of Object.keys(SC)) { r[v] = +(err[v] / n).toFixed(3); r[v + '_base'] = +(base[v] / n).toFixed(3); tot += err[v] / n / SC[v]; totB += base[v] / n / SC[v]; }
    r.loss = +tot.toFixed(4); r.lossBase = +totB.toFixed(4); out[h] = r;
  }
  return out;
}
module.exports = { label, evaluate2, vars, SC };
