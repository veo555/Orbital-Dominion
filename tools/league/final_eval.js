#!/usr/bin/env node
/* Final evaluation of the league result: named matchups, each N mirrored seed pairs (2N games), results appended to a JSON file after
   every matchup (an interrupted run resumes and skips finished matchups). Bradley-Terry Elo over all games, anchored at v3-hard = 1000.
     node tools/league/final_eval.js <plan.json> <out.json>
   plan.json: {agents:{name:spec,...}, matchups:[[A,B,nPairs,capSec?],...], seed0?:number}
   spec kinds: {kind:'t2',tier,theta?,cfg?,noV?}, {kind:'v3',diff}, {kind:'autopilot'} (team 0 only: sides are not swapped, factions are). */
'use strict';
const fs = require('fs'), pool = require('./pool.js'), { wilson, eloOf, bradleyTerry } = require('./stats.js');
const FAC = ['meridian', 'obsidian', 'aurora'];
const [planF, outF] = process.argv.slice(2);
const plan = JSON.parse(fs.readFileSync(planF, 'utf8'));
const out = fs.existsSync(outF) ? JSON.parse(fs.readFileSync(outF, 'utf8')) : { results: {}, games: [] };
(async () => {
  const P = pool(3); const s0 = plan.seed0 || 5001;
  for (const [A, B, n, cap] of plan.matchups) {
    const key = A + ' vs ' + B; if (out.results[key]) { console.log('skip (done) ' + key); continue; }
    const a = plan.agents[A], b = plan.agents[B], auto = a.kind === 'autopilot', jobs = [], t0 = Date.now();
    for (let k = 0; k < n; k++) {
      const seed = s0 + k, fa = FAC[k % 3], fb = FAC[(k + 1 + (Math.floor(k / 3) % 2)) % 3];
      jobs.push({ seed, f0: fa, f1: fb, a0: a, a1: b, cap: cap || 600, tag: 'A0' });
      if (auto) jobs.push({ seed: seed + 500, f0: fb, f1: fa, a0: a, a1: b, cap: cap || 600, tag: 'A0' });
      else jobs.push({ seed, f0: fb, f1: fa, a0: b, a1: a, cap: cap || 600, tag: 'A1' });
    }
    const res = await P.map(jobs);
    let k = 0, w = 0, d = 0, l = 0, adj = 0, err = 0, tsum = 0; const fac = {};
    for (const r of res) {
      if (r.error) { err++; console.error(r.error); continue; }
      const sA = r.job.tag === 'A0' ? r.r0 : 1 - r.r0, fA = r.job.tag === 'A0' ? r.job.f0 : r.job.f1;
      k += sA; if (sA === 1) w++; else if (sA === 0) l++; else d++; if (r.adjudicated) adj++; tsum += r.t;
      (fac[fA] || (fac[fA] = [0, 0]))[0] += sA; fac[fA][1]++;
      out.games.push({ a: A, b: B, s: sA, seed: r.job.seed, f0: r.job.f0, f1: r.job.f1, side: r.job.tag, t: r.t, adj: r.adjudicated, share: r.job.tag === 'A0' ? r.share0 : +(1 - r.share0).toFixed(3) });
    }
    const N = w + d + l, ci = wilson(k, N);
    out.results[key] = { A, B, N, w, d, l, err, adj, score: +(k / N).toFixed(4), ci: ci.map(x => +x.toFixed(4)), elo: Math.round(eloOf(k / N)), meanT: Math.round(tsum / Math.max(1, N)),
      byFaction: Object.fromEntries(Object.entries(fac).map(([f, v]) => [f, +(v[0] / v[1]).toFixed(3)])), wallS: Math.round((Date.now() - t0) / 1000) };
    const names = [...new Set(out.games.flatMap(g => [g.a, g.b]))];
    out.elo = bradleyTerry(names, out.games, names.includes('v3-hard') ? 'v3-hard' : names[0], 1000);
    fs.writeFileSync(outF, JSON.stringify(out, null, 1));
    const R = out.results[key];
    console.log(`${key}: ${R.N} games ${R.w}W ${R.d}D ${R.l}L score ${(100 * R.score).toFixed(1)}% [${(100 * R.ci[0]).toFixed(1)}, ${(100 * R.ci[1]).toFixed(1)}] Elo ${R.elo} adj ${R.adj} meanT ${R.meanT}s errors ${R.err} wall ${R.wallS}s`);
  }
  P.close();
  console.log('BT Elo (v3-hard = 1000): ' + JSON.stringify(out.elo));
})();
