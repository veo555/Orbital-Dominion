/* EXPERT ITERATION, the learning half (AlphaGo Zero: "MCTS as a policy-improvement operator").
   The planner's root visit distribution pi(a|s) is the training target of the policy prior
       p_phi(a|s) = softmax_a( (u_theta(s,a) + phi_a . x(s)) / T )      (T = 0.6, illegal actions masked; 41_ai_mcts.js plPrior)
   u_theta are the league-tuned theta utilities (fixed: theta also drives the low-level controllers), phi is a 7 x 12 linear POLICY HEAD.
   Loss (AlphaGo Zero's policy term, plus L2):   L(phi) = mean_i KL(pi_i || p_phi(.|s_i)) + c ||phi||^2
   convex in phi; minimised by Adam on the exact gradient  dL/dphi_a = mean_i (p_ia - pi_ia) x_i / T + 2 c phi_a.
   Promotion gate (AlphaGo Zero's evaluator): a candidate replaces the incumbent only if it scores >= 55 % over >= 24 mirrored games.
   Pure functions; tested in tests/sim/ai_mcts.js. */
'use strict';
const NA = 7, XN = 12, TEMP = 0.6;
function probs(u, x, m, phi, out) {
  let mx = -1e18; for (let a = 0; a < NA; a++) { if (!m[a]) { out[a] = -1e18; continue; } let z = u[a]; if (phi) for (let j = 0; j < XN; j++) z += phi[a][j] * x[j]; out[a] = z / TEMP; if (out[a] > mx) mx = out[a]; }
  let S = 0; for (let a = 0; a < NA; a++) { out[a] = m[a] ? Math.exp(out[a] - mx) : 0; S += out[a]; } for (let a = 0; a < NA; a++) out[a] /= S; return out;
}
/* mean KL(pi || p_phi) over samples {x, u, m, pi} */
function klLoss(samples, phi) {
  const p = new Float64Array(NA); let L = 0, n = 0;
  for (const s of samples) { probs(s.u, s.x, s.m, phi, p); let k = 0; for (let a = 0; a < NA; a++) if (s.pi[a] > 0) k += s.pi[a] * Math.log(s.pi[a] / Math.max(1e-12, p[a])); L += k; n++; }
  return n ? L / n : 0;
}
/* fit phi (warm start phi0) by Adam; returns {phi, before, after} */
function fitHead(samples, o) {
  o = o || {}; const c = o.l2 === undefined ? 1e-3 : o.l2, iters = o.iters || 400, lr = o.lr || 0.05;
  const phi = (o.phi0 ? o.phi0.map(r => r.slice()) : Array.from({ length: NA }, () => new Array(XN).fill(0)));
  const m1 = phi.map(r => r.map(() => 0)), m2 = phi.map(r => r.map(() => 0)), p = new Float64Array(NA), g = phi.map(r => r.map(() => 0));
  const before = klLoss(samples, phi);
  for (let it = 1; it <= iters; it++) {
    for (const r of g) r.fill(0);
    for (const s of samples) { probs(s.u, s.x, s.m, phi, p); for (let a = 0; a < NA; a++) { if (!s.m[a]) continue; const d = (p[a] - s.pi[a]) / TEMP; if (d === 0) continue; for (let j = 0; j < XN; j++) g[a][j] += d * s.x[j]; } }
    for (let a = 0; a < NA; a++) for (let j = 0; j < XN; j++) {
      const gr = g[a][j] / samples.length + 2 * c * phi[a][j];
      m1[a][j] = 0.9 * m1[a][j] + 0.1 * gr; m2[a][j] = 0.999 * m2[a][j] + 0.001 * gr * gr;
      phi[a][j] -= lr * (m1[a][j] / (1 - Math.pow(0.9, it))) / (Math.sqrt(m2[a][j] / (1 - Math.pow(0.999, it))) + 1e-8);
    }
  }
  for (const r of phi) for (let j = 0; j < XN; j++) r[j] = +r[j].toFixed(5);
  return { phi, before, after: klLoss(samples, phi) };
}
/* top-1 agreement between the prior's favourite and the search's most visited action */
function agreement(samples, phi) { const p = new Float64Array(NA); let k = 0; for (const s of samples) { probs(s.u, s.x, s.m, phi, p); let a = 0, b = 0; for (let i = 1; i < NA; i++) { if (p[i] > p[a]) a = i; if (s.pi[i] > s.pi[b]) b = i; } if (a === b) k++; } return samples.length ? k / samples.length : 0; }
/* the promotion gate: score = wins + draws/2 of the candidate over n games */
function gate(score, n, o) { o = o || {}; const thr = o.thr === undefined ? 0.55 : o.thr, nMin = o.nMin || 24; return n >= nMin && score / n >= thr; }
module.exports = { fitHead, klLoss, agreement, gate, probs, NA, XN };
