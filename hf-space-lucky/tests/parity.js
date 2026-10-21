// node tests/parity.js [--mutants]: JS port must equal the Python reference to <=1e-9; --mutants breaks lucky.js and demands failure.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ref = JSON.parse(fs.readFileSync(path.join(__dirname, 'parity.json'), 'utf8'));
function run(src) {
  const m = { exports: {} }; vm.runInNewContext(src, { module: m, Math, Infinity, NaN, Array }, {}); const L = m.exports; const bad = [];
  const eq = (n, a, b, tol) => { if (!(Math.abs(a - b) <= tol)) bad.push(n + ': ' + a + ' vs ' + b); };
  ref.cdf.forEach(([x, v]) => eq('cdf ' + x, L.normCdf(x), v, 1e-12));
  ref.ppf.forEach(([p, v]) => eq('ppf ' + p, L.normPpf(p), v, 1e-9));
  ref.ems.forEach(([n, v, e]) => eq('emax ' + n, L.expectedMaxSharpe(n, v), e, 1e-9));
  ref.cases.forEach((c, i) => { eq('psr0 #' + i, L.psr(c.r, 0), c.psr0, 1e-9); eq('psr bench #' + i, L.psr(c.r, 0.1), c.psr_b, 1e-9); eq('dsr #' + i, L.dsr(c.r, 50, 0.03), c.dsr, 1e-9); });
  const e = L.experiment(50, 36, 200, 1); // statistical shape check: best-of-50 zero-skill is fooled often, DSR almost never
  if (!(e.naive > 0.8 && e.deflated < 0.05 && e.meanBestAnnual > 1.0 && e.meanBestAnnual < 1.7)) bad.push('experiment shape ' + JSON.stringify(e));
  return bad;
}
const src = fs.readFileSync(path.join(__dirname, '..', 'lucky.js'), 'utf8');
if (!process.argv.includes('--mutants')) { const b = run(src); console.log(b.length ? 'FAIL\n' + b.join('\n') : 'PARITY OK (cdf, ppf, expected-max Sharpe, PSR, DSR vs Python; experiment shape)'); process.exit(b.length ? 1 : 0); }
const muts = [['(1 - EG) * normPpf(1 - 1 / n)', '(1 - EG) * normPpf(1 - 1 / (n+1))'], ['(mo.kurt - 1) / 4', '(mo.kurt - 3) / 4'], ['s1 = Math.sqrt(ss / (n - 1))', 's1 = Math.sqrt(ss / n)'],
  ['f = 1 - mo.skew * sr', 'f = 1 + mo.skew * sr'], ['Math.sqrt(r.length - 1)', 'Math.sqrt(r.length)'], ['term *= -ax * ax / n', 'term *= ax * ax / n'], ['v /= (N - 1)', 'v /= N * 4'], ['if (o.deflated > 0.95)', 'if (o.naive > 0.95)']];
let miss = 0; for (const [a, b] of muts) { if (!src.includes(a)) { console.log('SKIP', a); miss++; continue; } const bad = run(src.replace(a, b)); console.log((bad.length ? 'caught  ' : 'NOT CAUGHT  ') + a); if (!bad.length) miss++; }
console.log(miss ? miss + ' MUTANTS NOT CAUGHT' : 'ALL MUTANTS CAUGHT'); process.exit(miss ? 1 : 0);
