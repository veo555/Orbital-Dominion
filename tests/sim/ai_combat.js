/* The combat predictor against the REAL simulation (about 30 s).
     node tests/sim/ai_combat.js
   Runs tools/league/calib_combat.js on 240 fresh random skirmishes (seed 11, not used for fitting the shipped constants) and checks that
   the shipped predictor (41_ai_params.js combat) is informative and calibrated on them: held-out log-loss well below the coin-flip 0.693,
   accuracy >= 80 %, and confident predictions are right (P > 0.9 -> observed >= 0.85, P < 0.1 -> observed <= 0.15).
   CONTROL (rule 15): the same checks on the same skirmishes with the predictor's sign flipped must fail. */
'use strict';
const cp = require('child_process'), path = require('path'), fs = require('fs'), os = require('os');
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok    ' : 'FAIL  ') + m); if (!c) fails++; };
const tmp = path.join(os.tmpdir(), 'od-calib-' + process.pid + '.json');
cp.execFileSync(process.execPath, [path.join(__dirname, '..', '..', 'tools', 'league', 'calib_combat.js'), '240', '11', '--json', tmp], { stdio: ['ignore', 'ignore', 'inherit'] });
const D = JSON.parse(fs.readFileSync(tmp, 'utf8')); fs.unlinkSync(tmp);
const S = D.summary, rows = D.rows, c = S.shipped.params, sig = (x) => 1 / (1 + Math.exp(-x));
function check(sign, label, expectPass) {
  const ps = rows.map(r => sig(sign * (c.kOde * r.m + c.kL * r.ls))), ys = rows.map(r => r.y);
  let ll = 0, acc = 0, n = 0; const hi = [], lo = [];
  ps.forEach((p, i) => { const q = Math.min(1 - 1e-6, Math.max(1e-6, p)); ll -= ys[i] * Math.log(q) + (1 - ys[i]) * Math.log(1 - q); if (ys[i] !== 0.5) { n++; if ((p > 0.5) === (ys[i] === 1)) acc++; } if (p > 0.9) hi.push(ys[i]); if (p < 0.1) lo.push(ys[i]); });
  ll /= ps.length; acc /= n; const mh = hi.reduce((a, b) => a + b, 0) / Math.max(1, hi.length), ml = lo.reduce((a, b) => a + b, 0) / Math.max(1, lo.length);
  const pass = ll < 0.45 && acc >= 0.8 && mh >= 0.85 && ml <= 0.15;
  ok(expectPass ? pass : !pass, `${label}: log-loss ${ll.toFixed(3)} (coin flip 0.693), accuracy ${(100 * acc).toFixed(1)} %, P>0.9 -> ${(100 * mh).toFixed(0)} % won (${hi.length}), P<0.1 -> ${(100 * ml).toFixed(0)} % won (${lo.length})` + (expectPass ? '' : ' -> rejected as it should be'));
}
check(1, 'shipped predictor on 240 fresh real-sim skirmishes', true);
check(-1, 'CONTROL: sign-flipped predictor', false);
console.log(`info  ODE-only log-loss ${S.ode.logloss}, Lanchester-only ${S.lanchester.logloss}, refit blend ${S.blendFit.logloss} (k ${JSON.stringify(S.blend)}), mean fight ${S.meanDur}s`);
console.log(fails ? `\n${fails} COMBAT CHECK(S) FAILED` : '\nALL COMBAT CHECKS PASSED'); process.exit(fails ? 1 : 0);
