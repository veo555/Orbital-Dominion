/* Unit tests for the T2 opponent's maths (src/js/41_ai_lib.js) and the league tools (tools/league/*.js). Headless, deterministic, ~5 s.
     node tests/sim/ai_lib.js
   Each property is paired with a CONTROL (CLAUDE.md rule 15): a deliberately wrong input or implementation must fail the same check. */
'use strict';
const load = require('./simlib3.js');
const path = require('path');
const { CMAES } = require(path.join(__dirname, '..', '..', 'tools', 'league', 'cmaes.js'));
const ST = require(path.join(__dirname, '..', '..', 'tools', 'league', 'stats.js'));
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok    ' : 'FAIL  ') + m); if (!c) fails++; };
const S = load(), L = (n) => S.__run(n);
const near = (a, b, e) => Math.abs(a - b) <= (e || 1e-9);

/* ---- 1. Bayes occupancy update */
{
  const bayesOcc = L('bayesOcc');
  const p = 0.3, pd = 0.9, pf = 0.02;
  const miss = bayesOcc(p, false, pd, pf), hit = bayesOcc(p, true, pd, pf);
  ok(near(miss, p * (1 - pd) / (p * (1 - pd) + (1 - p) * (1 - pf))), `Bayes, no detection: P=${miss.toFixed(4)} equals P(1-pd)/(P(1-pd)+(1-P)(1-pf))`);
  ok(near(hit, p * pd / (p * pd + (1 - p) * pf)), `Bayes, detection: P=${hit.toFixed(4)} equals P pd/(P pd+(1-P) pf)`);
  ok(miss < p && hit > p, 'looking and seeing nothing lowers the belief, a sighting raises it');
  let q = 0.5; for (let i = 0; i < 20; i++) q = bayesOcc(q, false, pd, pf); ok(q < 1e-15, 'twenty empty looks drive the belief to ~0');
  ok(near(bayesOcc(0.4, false, 0, 0), 0.4), 'a blind sensor (pd=0, pf=0) carries no information: the belief is unchanged');
  ok(!near(bayesOcc(0.4, false, 0.9, 0), 0.4), 'CONTROL: a working sensor does change it');
  const hz = L('hazard'); let h = 0; for (let i = 0; i < 200; i++) h = hz(h, 0.6, 0.05); ok(near(h, 0.6, 1e-3), 'hazard prior converges to its long-run prior q');
}
/* ---- 2. diffusion and pheromone invariants */
{
  const diffuse = L('diffuse'), phStep = L('phStep'), densityObserve = L('densityObserve'), gsum = L('gsum');
  const W = 22, H = 22, n = W * H, a = new Float64Array(n), tmp = new Float64Array(n);
  let s = 7; const r = () => (s = (s * 1103515245 + 12345) >>> 0) / 4294967296;
  for (let i = 0; i < n; i++) a[i] = r() < 0.1 ? r() * 10 : 0;
  const m0 = gsum(a); for (let k = 0; k < 500; k++) diffuse(a, W, H, 0.24, tmp);
  ok(near(gsum(a), m0, 1e-9 * m0), `diffusion conserves mass over 500 steps (${m0.toFixed(6)} -> ${gsum(a).toFixed(6)})`);
  ok(Math.min(...a) >= 0, 'diffusion with k <= 0.25 keeps every cell non-negative');
  const mx = Math.max(...a), mn = Math.min(...a); ok(mx - mn < 0.05 * m0 / n * 10, 'long diffusion flattens towards the mean');
  const mask = new Uint8Array(n).fill(1); for (let i = 0; i < n; i += 3) mask[i] = 0;
  const b = new Float64Array(n); for (let i = 0; i < n; i++) b[i] = mask[i] ? 1 + (i % 5) : 0;
  const mb = gsum(b); for (let k = 0; k < 200; k++) diffuse(b, W, H, 0.2, tmp, mask);
  ok(near(gsum(b), mb, 1e-9 * mb) && b.every((v, i) => mask[i] || v === 0), 'masked diffusion conserves mass and never fills blocked cells');
  const c = new Float64Array(n).fill(1); const rho = 0.1; phStep(c, W, H, rho, 0.2, tmp);
  ok(near(gsum(c), n * (1 - rho), 1e-9 * n), 'pheromone step: total mass decays by exactly (1-rho) per step without deposits');
  const leak = new Float64Array(n).fill(1); for (let k = 0; k < 10; k++) { for (let i = 0; i < n; i++) leak[i] *= 1; diffuse(leak, W, H, 0.3, tmp); }
  const bad = new Float64Array(n); bad[0] = 1; diffuse(bad, W, H, 0.6, tmp);
  ok(Math.min(...bad) < 0, 'CONTROL: an unstable rate (k=0.6 > 0.25) produces negative cells, so the non-negativity check can fail');
  const d = new Float64Array(n).fill(1 / n), view = new Uint8Array(n); for (let i = 0; i < n / 2; i++) view[i] = 1;
  densityObserve(d, view, 0.85);
  ok(near(gsum(d), 1, 1e-12) && d[0] < d[n - 1], 'negative information: viewed-and-empty cells lose mass, the density renormalises to 1');
}
/* ---- 3. combat predictor */
{
  const st = (type, n, o) => L('cmbStackOf')(type, n, o || {});
  const sim = L('cmbSimulate'), pred = L('cmbPredict');
  // homogeneous square law: riflemen vs riflemen, A0=20, B0=10 -> survivors sqrt(A0^2 - B0^2) = 17.3 (same alpha = beta)
  const A = [st('rifleman', 20)], B = [st('rifleman', 10)];
  A[0].range = B[0].range = 0; // no range delay: pure Lanchester ODE
  const r = sim(A, B, { dt: 0.05, tmax: 200 }); const surv = r.remA * 20;
  ok(r.win === 1 && Math.abs(surv - Math.sqrt(400 - 100)) < 0.6, `Lanchester square law: 20 vs 10 identical units leave ${surv.toFixed(2)} (analytic ${Math.sqrt(300).toFixed(2)})`);
  const lin = 20 - 10; ok(Math.abs(surv - lin) > 5, `CONTROL: the linear law (${lin} survivors) is clearly distinguishable`);
  const p1 = pred([st('rifleman', 12)], [st('rifleman', 6)]).p, p2 = pred([st('rifleman', 6)], [st('rifleman', 12)]).p;
  ok(p1 > 0.9 && p2 < 0.1 && near(p1 + p2, 1, 1e-9), `predictor is antisymmetric and confident on a 2:1 mirror (${p1.toFixed(3)} / ${p2.toFixed(3)})`);
  const pc = pred([st('raptor', 8)], [st('skiff', 3)]).p; ok(pc < 0.1, `counters: melee Raptors cannot hit air Skiffs (P=${pc.toFixed(3)})`);
  const cl1 = pred([st('rifleman', 6)], [st('specter', 3)]).p, cl2 = pred([st('rifleman', 6), st('mender', 1)], [st('specter', 3)]).p;
  ok(cl1 < 0.1 && cl2 > cl1 + 0.3, `cloak: Specters are untouchable without a detector (P=${cl1.toFixed(3)}), a Mender changes that (P=${cl2.toFixed(3)})`);
  const up = pred([st('rifleman', 10, { wl: 2 })], [st('rifleman', 10)]).p; ok(up > 0.75, `upgrades count: +2 weapons wins the mirror (P=${up.toFixed(3)})`);
}
/* ---- 4. Ideal Free Distribution */
{
  const alloc = L('ifdAlloc'), total = L('ifdTotal'), gain = L('ifdGain');
  const sites = [{ kind: 'c', sat: 16, rate: 98, w: 1 }, { kind: 'c', sat: 16, rate: 98, w: 1 }, { kind: 'e', sat: 3, rate: 52, w: 1.6 }, { kind: 'e', sat: 4, rate: 52, w: 0.5 }];
  let allOpt = true, maxGap = 0;
  for (const N of [1, 5, 10, 17, 25, 33, 41, 50]) {
    const n = alloc(sites, N), T = total(sites, n);
    let best = -1; // brute force over all allocations (sites 2,3 small; sites 0,1 fill the rest)
    for (let e1 = 0; e1 <= Math.min(N, 8); e1++) for (let e2 = 0; e2 + e1 <= Math.min(N, 10); e2++) for (let c1 = 0; c1 <= N - e1 - e2; c1++) {
      const c2 = N - e1 - e2 - c1; const v = total(sites, [c1, c2, e1, e2]); if (v > best) best = v; }
    if (Math.abs(T - best) > 1e-9) allOpt = false;
    // IFD condition: no worker gains by moving (marginal gain of the last worker >= next-worker gain anywhere else)
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (i !== j && n[i] > 0) maxGap = Math.max(maxGap, gain(sites[j], n[j]) - gain(sites[i], n[i] - 1));
  }
  ok(allOpt, 'greedy marginal allocation equals the brute-force optimum for 8 worker counts');
  ok(maxGap <= 1e-9, 'Ideal Free Distribution: no worker can raise its income by switching site');
  const naive = [25, 0, 0, 0], g = alloc(sites, 25); ok(total(sites, g) > total(sites, naive) + 100, `CONTROL: putting all 25 on one field is clearly worse (${total(sites, naive).toFixed(0)} vs ${total(sites, g).toFixed(0)})`);
}
/* ---- 5. value function evaluation */
{
  const vf = L('vfEval');
  ok(near(vf(null, [1, 2]), 0.5), 'no model -> V = 0.5');
  const m = { kind: 'lr', w: [2, -1], b: 0.5, mu: [1, 0], sd: [2, 1] };
  const z = 0.5 + 2 * (3 - 1) / 2 - 1 * 0.5; ok(near(vf(m, [3, 0.5]), 1 / (1 + Math.exp(-z))), 'logistic V(s) = sigmoid(b + w . (f - mu)/sd)');
  const mlp = { kind: 'mlp', W1: [[1, 0], [0, 1]], b1: [0, 0], w2: [1, -1], b2: 0, mu: [0, 0], sd: [1, 1] };
  ok(near(vf(mlp, [0.3, 0.3]), 0.5) && vf(mlp, [1, 0]) > 0.5, 'tanh MLP V(s) evaluates (symmetric input -> 0.5)');
}
/* ---- 6. swarm geometry */
{
  const boids = L('boidsTargets'), arc = L('arcSlots'), field = L('fieldDir');
  const units = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 0, y: 40 }, { x: 40, y: 40 }];
  const T = boids(units, { x: 1000, y: 1000 }, 0.5); const c = T.reduce((s, p) => ({ x: s.x + p.x / 4, y: s.y + p.y / 4 }), { x: 0, y: 0 });
  ok(near(c.x, 1000, 1e-9) && near(c.y, 1000, 1e-9) && near(Math.hypot(T[0].x - T[3].x, T[0].y - T[3].y), 0.5 * Math.hypot(40, 40), 1e-9), 'boids formation: centred on the goal, cohesion halves the spread');
  const s = arc({ x: 0, y: 0 }, { x: 500, y: 0 }, 100, 5); ok(s.every(p => near(Math.hypot(p.x - 500, p.y), 100, 1e-9)) && s[0].x < 500, 'concave arc: every slot at the radius, on our side of the enemy');
  const f = field({ x: 0, y: 0 }, { x: -100, y: 0 }, [{ x: 50, y: 0, w: 1 }], 1); ok(f.x < -0.9, 'potential field: home attracts and the threat repels (same direction here)');
}
/* ---- 7. CMA-ES on known functions */
{
  const sphere = (x) => x.reduce((s, v) => s + v * v, 0), rosen = (x) => { let s = 0; for (let i = 0; i < x.length - 1; i++) s += 100 * (x[i + 1] - x[i] * x[i]) ** 2 + (1 - x[i]) ** 2; return s; };
  let es = new CMAES({ x0: new Array(10).fill(1), sigma0: 0.5, seed: 3 }), g = 0;
  for (; g < 600 && es.best.f > 1e-10; g++) { const X = es.ask(); es.tell(X, X.map(sphere)); if (g === 30) es = CMAES.fromJSON(JSON.parse(JSON.stringify(es))); }
  ok(es.best.f <= 1e-10, `CMA-ES: 10-D sphere to 1e-10 in ${g} generations (with a JSON checkpoint/restore at generation 30)`);
  es = new CMAES({ x0: new Array(8).fill(0), sigma0: 0.5, seed: 5 }); g = 0;
  for (; g < 3000 && es.best.f > 1e-8; g++) { const X = es.ask(); es.tell(X, X.map(rosen)); }
  ok(es.best.f <= 1e-8 && es.best.x.every(v => Math.abs(v - 1) < 1e-3), `CMA-ES: 8-D Rosenbrock to its optimum (1,...,1) in ${g} generations`);
  const r1 = new CMAES({ x0: [1, 2], sigma0: 0.3, seed: 9 }), r2 = new CMAES({ x0: [1, 2], sigma0: 0.3, seed: 9 });
  ok(JSON.stringify(r1.ask()) === JSON.stringify(r2.ask()), 'CMA-ES sampling is deterministic for a seed');
  const rs = new CMAES({ x0: new Array(10).fill(1), sigma0: 0.5, seed: 3 }); for (let k = 0; k < 60; k++) { const X = rs.ask(); rs.tell(X, X.map(() => 0)); }
  ok(sphere(rs.m) > 1, 'CONTROL: with a flat (uninformative) fitness the mean does not reach the optimum');
}
/* ---- 8. PFSP, Wilson, Bradley-Terry */
{
  const w = ST.pfsp([0.9, 0.5, 0.1], 'hard', 2); ok(w[2] > w[1] && w[1] > w[0] && near(w.reduce((a, b) => a + b, 0), 1, 1e-12), 'PFSP f_hard=(1-p)^2: hardest opponent most likely, weights sum to 1');
  const v = ST.pfsp([0.9, 0.5, 0.1], 'var'); ok(v[1] > v[0] && near(v[0], v[2], 1e-12), 'PFSP f_var=p(1-p): even matches most likely');
  ok(near(ST.pfsp([0.75], 'hard', 2)[0], 1), 'PFSP with one opponent -> probability 1');
  const ci = ST.wilson(12, 24); ok(ci[0] < 0.5 && ci[1] > 0.5 && near(ci[0] + ci[1], 1, 1e-12), `Wilson 95% CI of 12/24 is symmetric around 0.5 [${ci.map(x => x.toFixed(3))}]`);
  const ci2 = ST.wilson(20, 24); ok(ci2[0] > 0.6, 'Wilson: 20/24 is significantly above 0.5');
  const games = []; for (let i = 0; i < 300; i++) { games.push({ a: 'A', b: 'B', s: i % 4 ? 1 : 0 }); games.push({ a: 'B', b: 'C', s: i % 4 ? 1 : 0 }); }
  const R = ST.bradleyTerry(['A', 'B', 'C'], games, 'C', 1000), d = Math.round(ST.eloOf(0.75));
  ok(Math.abs(R.B - R.C - d) < 15 && Math.abs(R.A - R.B - d) < 15, `Bradley-Terry: a 75 % score is ${d} Elo; ladder A ${R.A} > B ${R.B} > C ${R.C} (transitive A-C gap ${R.A - R.C})`);
}
console.log(fails ? `\n${fails} AI LIB CHECK(S) FAILED` : '\nALL AI LIB CHECKS PASSED'); process.exit(fails ? 1 : 0);
