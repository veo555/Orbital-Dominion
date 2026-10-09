/* CMA-ES (Covariance Matrix Adaptation Evolution Strategy), (mu/mu_w, lambda) with cumulative step-size adaptation (CSA),
   rank-one and rank-mu covariance updates — implemented from N. Hansen, "The CMA Evolution Strategy: A Tutorial" (arXiv:1604.00772),
   default strategy parameters of that tutorial (Table 1). Minimises f. Deterministic: its own mulberry32 + Box-Muller stream.
   The whole optimiser state is plain JSON (toJSON / fromJSON) so a league can checkpoint and resume it.
     const es = new CMAES({x0:[...], sigma0:0.15, lambda:12, seed:1});
     const X = es.ask();            // lambda candidate vectors
     es.tell(X, fvals);             // fvals[i] = f(X[i]) (lower is better)                                                         */
'use strict';
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
/* symmetric eigen-decomposition by cyclic Jacobi rotations: C = B diag(d) B^T */
function eigSym(C) {
  const n = C.length, A = C.map(r => r.slice()), V = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i === j ? 1 : 0));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0; for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p][q] * A[p][q];
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(A[p][q]) < 1e-300) continue;
      const th = (A[q][q] - A[p][p]) / (2 * A[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
      for (let k = 0; k < n; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
    }
  }
  return { d: A.map((r, i) => r[i]), B: V };
}
class CMAES {
  constructor(o) {
    if (o.__state) { Object.assign(this, o.__state); this._reseed(); return; }
    const n = o.x0.length; this.n = n; this.m = o.x0.slice(); this.sigma = o.sigma0 || 0.3; this.lambda = o.lambda || (4 + Math.floor(3 * Math.log(n)));
    this.mu = Math.floor(this.lambda / 2);
    const w = []; for (let i = 0; i < this.mu; i++) w.push(Math.log(this.mu + 0.5) - Math.log(i + 1));
    const sw = w.reduce((a, b) => a + b, 0); this.w = w.map(x => x / sw); this.mueff = 1 / this.w.reduce((a, b) => a + b * b, 0);
    const me = this.mueff;
    this.cs = (me + 2) / (n + me + 5); this.ds = 1 + 2 * Math.max(0, Math.sqrt((me - 1) / (n + 1)) - 1) + this.cs;
    this.cc = (4 + me / n) / (n + 4 + 2 * me / n); this.c1 = 2 / ((n + 1.3) * (n + 1.3) + me);
    this.cmu = Math.min(1 - this.c1, 2 * (me - 2 + 1 / me) / ((n + 2) * (n + 2) + me));
    this.chiN = Math.sqrt(n) * (1 - 1 / (4 * n) + 1 / (21 * n * n));
    this.pc = new Array(n).fill(0); this.ps = new Array(n).fill(0);
    this.C = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i === j ? 1 : 0));
    this.B = this.C.map(r => r.slice()); this.D = new Array(n).fill(1); this.gen = 0; this.evals = 0; this._rsv = (o.seed || 1) >>> 0; this._reseed();
    this.best = { f: Infinity, x: this.m.slice() };
  }
  _reseed() { let a = this._rsv >>> 0; this._r = () => { a = (a + 0x6D2B79F5) >>> 0; this._rsv = a; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  _gauss() { const u = Math.max(1e-12, this._r()), v = this._r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  ask() {
    const n = this.n, X = [];
    this._Y = [];
    for (let k = 0; k < this.lambda; k++) {
      const z = Array.from({ length: n }, () => this._gauss()), y = new Array(n).fill(0);
      for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s += this.B[i][j] * this.D[j] * z[j]; y[i] = s; }
      this._Y.push(y); X.push(this.m.map((mi, i) => mi + this.sigma * y[i]));
    }
    return X;
  }
  tell(X, f) {
    const n = this.n, idx = f.map((v, i) => i).sort((a, b) => f[a] - f[b]);
    this.evals += X.length; this.gen++;
    if (f[idx[0]] < this.best.f) this.best = { f: f[idx[0]], x: X[idx[0]].slice(), gen: this.gen };
    const Y = X.map(x => x.map((xi, i) => (xi - this.m[i]) / this.sigma));
    const yw = new Array(n).fill(0); for (let k = 0; k < this.mu; k++) { const y = Y[idx[k]]; for (let i = 0; i < n; i++) yw[i] += this.w[k] * y[i]; }
    const mOld = this.m.slice(); this.m = this.m.map((mi, i) => mi + this.sigma * yw[i]);
    // C^{-1/2} yw = B D^{-1} B^T yw
    const t1 = new Array(n).fill(0); for (let j = 0; j < n; j++) { let s = 0; for (let i = 0; i < n; i++) s += this.B[i][j] * yw[i]; t1[j] = s / this.D[j]; }
    const cy = new Array(n).fill(0); for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s += this.B[i][j] * t1[j]; cy[i] = s; }
    const a = Math.sqrt(this.cs * (2 - this.cs) * this.mueff);
    for (let i = 0; i < n; i++) this.ps[i] = (1 - this.cs) * this.ps[i] + a * cy[i];
    const psn = Math.sqrt(this.ps.reduce((s, v) => s + v * v, 0));
    const hs = psn / Math.sqrt(1 - Math.pow(1 - this.cs, 2 * this.gen)) < (1.4 + 2 / (n + 1)) * this.chiN ? 1 : 0;
    const b = Math.sqrt(this.cc * (2 - this.cc) * this.mueff);
    for (let i = 0; i < n; i++) this.pc[i] = (1 - this.cc) * this.pc[i] + hs * b * yw[i];
    const dh = (1 - hs) * this.cc * (2 - this.cc);
    for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
      let r = 0; for (let k = 0; k < this.mu; k++) { const y = Y[idx[k]]; r += this.w[k] * y[i] * y[j]; }
      const v = (1 - this.c1 - this.cmu) * this.C[i][j] + this.c1 * (this.pc[i] * this.pc[j] + dh * this.C[i][j]) + this.cmu * r;
      this.C[i][j] = v; this.C[j][i] = v;
    }
    this.sigma *= Math.exp((this.cs / this.ds) * (psn / this.chiN - 1));
    const E = eigSym(this.C); this.B = E.B; this.D = E.d.map(x => Math.sqrt(Math.max(1e-20, x)));
    void mOld;
  }
  toJSON() { const s = {}; for (const k of Object.keys(this)) if (k[0] !== '_' || k === '_rsv') s[k] = this[k]; return s; }
  static fromJSON(s) { return new CMAES({ __state: s }); }
}
module.exports = { CMAES, eigSym };
