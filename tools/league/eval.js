#!/usr/bin/env node
/* Head-to-head evaluation of two agent specs with mirrored sides (each seed is played twice, A as team 0 then A as team 1, with the
   factions swapped along with the sides), reported as A's score with a Wilson 95 % interval and the implied Elo difference.
     node tools/league/eval.js '<specA>' '<specB>' [nSeeds=12] [seed0=1001] [capSec=540] [--src-b DIR] [--json out.json]
   e.g.  node tools/league/eval.js '{"kind":"t2","tier":"normal"}' '{"kind":"v3","diff":"normal"}' 12
   2 x nSeeds games; at most 3 worker processes. */
'use strict';
const pool = require('./pool.js'), { wilson, eloOf } = require('./stats.js');
const FAC = ['meridian', 'obsidian', 'aurora'];
async function evaluate(A, B, o) {
  o = o || {}; const n = o.n || 12, s0 = o.seed0 || 1001, cap = o.cap || 540, P = o.pool || pool(o.workers || 3);
  const jobs = [];
  for (let k = 0; k < n; k++) {
    const seed = s0 + k, fa = FAC[k % 3], fb = FAC[(k + 1 + (k / 3 | 0) % 2) % 3];
    jobs.push({ seed, f0: fa, f1: fb, a0: A, a1: B, cap, src: o.src, tag: 'A0' });
    jobs.push({ seed, f0: fb, f1: fa, a0: B, a1: A, cap, src: o.src, tag: 'A1' });
  }
  const res = await P.map(jobs); if (!o.pool) P.close();
  let k = 0, w = 0, d = 0, l = 0, adj = 0, err = 0; const rows = [];
  for (const r of res) {
    if (r.error) { err++; console.error(r.error); continue; }
    const sA = r.job.tag === 'A0' ? r.r0 : 1 - r.r0; k += sA; if (sA === 1) w++; else if (sA === 0) l++; else d++; if (r.adjudicated) adj++;
    rows.push({ seed: r.job.seed, side: r.job.tag, fac: r.job.tag === 'A0' ? r.job.f0 : r.job.f1, s: sA, t: r.t, adj: r.adjudicated, share: r.job.tag === 'A0' ? r.share0 : +(1 - r.share0).toFixed(3) });
  }
  const N = w + d + l, ci = wilson(k, N);
  return { N, w, d, l, adj, err, score: N ? k / N : 0, ci, elo: Math.round(eloOf(N ? k / N : 0.5)), rows };
}
module.exports = { evaluate };
if (require.main === module) {
  const a = process.argv.slice(2), opt = {};
  for (let i = 0; i < a.length; i++) if (a[i] === '--src-b') { opt.srcB = a[++i]; a.splice(i - 1, 2); i -= 2; } else if (a[i] === '--json') { opt.json = a[++i]; a.splice(i - 1, 2); i -= 2; }
  const A = JSON.parse(a[0]), B = JSON.parse(a[1]);
  const t0 = Date.now();
  evaluate(A, B, { n: +a[2] || 12, seed0: +a[3] || 1001, cap: +a[4] || 540 }).then(r => {
    const byFac = {}; for (const x of r.rows) { const f = byFac[x.fac] || (byFac[x.fac] = [0, 0]); f[0] += x.s; f[1]++; }
    console.log(`A=${a[0]}  B=${a[1]}`);
    console.log(`games ${r.N} (errors ${r.err}): A ${r.w}W ${r.d}D ${r.l}L  score ${(100 * r.score).toFixed(1)}%  95% CI [${(100 * r.ci[0]).toFixed(1)}, ${(100 * r.ci[1]).toFixed(1)}]  Elo diff ${r.elo}  adjudicated ${r.adj}  wall ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    console.log('A by faction: ' + Object.entries(byFac).map(([f, v]) => f + ' ' + (v[0] / v[1] * 100).toFixed(0) + '% of ' + v[1]).join(', '));
    console.log('per game (seed side faction score t adj share): ' + r.rows.sort((x, y) => x.seed - y.seed).map(x => `${x.seed}${x.side}:${x.fac.slice(0, 3)}:${x.s}:${x.t}${x.adj ? 'a' : ''}:${x.share}`).join(' '));
    if (opt.json) require('fs').writeFileSync(opt.json, JSON.stringify(r, null, 1));
  });
}
