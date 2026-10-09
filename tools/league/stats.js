/* Statistics helpers for the league and the evaluations. */
'use strict';
/* Wilson score interval for a binomial proportion (draws count half: k = wins + draws/2). */
function wilson(k, n, z) {
  z = z || 1.96; if (!n) return [0, 1];
  const p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}
/* Elo difference implied by an expected score p (logistic, 400 scale) */
function eloOf(p) { p = Math.min(0.995, Math.max(0.005, p)); return -400 * Math.log10(1 / p - 1); }
/* Bradley-Terry maximum likelihood by the MM algorithm (Hunter 2004), draws counted as half a win each way.
   games: [{a, b, s}] with s = score of a (1 / 0.5 / 0). Returns Elo-scale ratings with the anchor fixed at anchorElo.
   A weak symmetric prior (one virtual draw against a reference player of strength 1) keeps unbeaten / winless players finite. */
function bradleyTerry(names, games, anchor, anchorElo) {
  const n = names.length, idx = new Map(names.map((x, i) => [x, i]));
  const W = new Float64Array(n), N = Array.from({ length: n }, () => new Float64Array(n));
  for (const g of games) { const i = idx.get(g.a), j = idx.get(g.b); if (i === undefined || j === undefined || i === j) continue; W[i] += g.s; W[j] += 1 - g.s; N[i][j]++; N[j][i]++; }
  let p = new Float64Array(n).fill(1);
  for (let it = 0; it < 2000; it++) {
    const q = new Float64Array(n); let delta = 0;
    for (let i = 0; i < n; i++) { let den = 0; for (let j = 0; j < n; j++) if (N[i][j]) den += N[i][j] / (p[i] + p[j]); den += 1 / (p[i] + 1);  // prior: one game vs a reference of strength 1
      q[i] = (W[i] + 0.5) / den; }
    let gm = 0; for (let i = 0; i < n; i++) gm += Math.log(q[i]); gm = Math.exp(gm / n); for (let i = 0; i < n; i++) { q[i] /= gm; delta = Math.max(delta, Math.abs(Math.log(q[i] / p[i]))); }
    p = q; if (delta < 1e-9) break;
  }
  const a = anchor !== undefined && idx.has(anchor) ? idx.get(anchor) : 0, base = 400 * Math.log10(p[a]);
  const out = {}; for (let i = 0; i < n; i++) out[names[i]] = Math.round((anchorElo || 1000) + 400 * Math.log10(p[i]) - base);
  return out;
}
/* sequential Elo update (K-factor), for the running league display */
function eloUpdate(R, a, b, s, K) { const ea = 1 / (1 + Math.pow(10, ((R[b] || 1000) - (R[a] || 1000)) / 400)); R[a] = (R[a] || 1000) + (K || 16) * (s - ea); R[b] = (R[b] || 1000) - (K || 16) * (s - ea); }
/* Prioritised fictitious self-play weights (AlphaStar, Vinyals et al. 2019): given win-rates p of the learner against each opponent,
   f_hard(p) = (1-p)^power focuses on opponents the learner cannot beat yet; f_var(p) = p(1-p) on opponents of similar strength. */
function pfsp(ps, mode, power) {
  const f = mode === 'var' ? ps.map(p => p * (1 - p)) : ps.map(p => Math.pow(1 - p, power || 2));
  const s = f.reduce((a, b) => a + b, 0); return s > 0 ? f.map(x => x / s) : ps.map(() => 1 / ps.length);
}
function mean(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0; }
module.exports = { wilson, eloOf, bradleyTerry, eloUpdate, pfsp, mean };
