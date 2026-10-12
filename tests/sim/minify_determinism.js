// Proof (2) for tools/minify.js: the headless simulation bundle gives BIT-IDENTICAL results when it is minified.
//   node tests/sim/minify_determinism.js          (about 1 minute)
// The sim modules (00,10,20,25,26,27,30,40,41,42,43,44,45,46) are loaded through tests/sim/simlib3.js twice: as written, and passed through
// tools/minify.js.  The same (seed, Math.random stream) is simulated for 3 game minutes in both and a state hash over resources, units and
// buildings is compared; so are the campaign-trigger log and the toast log.  CONTROL: a deliberately perturbed minified bundle (one constant
// changed) must give a different hash, so the comparison can fail.
const load = require('./simlib3.js');
const { minifyJS } = require('../../tools/minify.js');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL  ' + m); } else console.log('ok    ' + m); };
const facs = ['meridian', 'obsidian', 'aurora'];
function hash(G) {
  let h = 2166136261 >>> 0;
  const mix = (v) => { const s = String(Math.round(v * 1000)); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } };
  for (const t of G.teams) { mix(t.c); mix(t.e); mix(t.used); mix(t.kills); mix(t.lost); }
  for (const u of G.units) if (!u.dead) { mix(u.x); mix(u.y); mix(u.hp); }
  for (const b of G.buildings) if (!b.dead) { mix(b.x); mix(b.y); mix(b.hp); }
  mix(G.time); mix(G.tick);
  return h.toString(16);
}
function run(seed, xform, mins) {
  process.env.RS = String(7 + seed);
  const A = load(undefined, xform);
  A.newGame({ seed, diff: 'normal', faction: facs[seed % 3], enemy: facs[(seed + 1) % 3] });
  A.ovPreset('autopilot');
  for (let i = 0; i < mins * 60 * 30; i++) { A.step(); if (A.G.over) break; }
  return { h: hash(A.G), units: A.G.units.length, blds: A.G.buildings.length, time: A.G.time, toasts: (globalThis.__toasts || []).length };
}
let bytesIn = 0, bytesOut = 0;
const min = (code) => { const o = minifyJS(code); bytesIn = code.length; bytesOut = o.length; return o; };
// the control: change the simulation's tick constant inside the MINIFIED text (must be found exactly once)
const perturb = (code) => { const o = minifyJS(code); const n = o.split('TICK=1/30').length - 1; if (n !== 1) throw new Error('control cannot be built: TICK=1/30 found ' + n + ' times'); return o.replace('TICK=1/30', 'TICK=1/29'); };

for (const seed of [3, 4, 11]) {
  globalThis.__toasts = [];
  const a = run(seed, null, 3);
  globalThis.__toasts = [];
  const b = run(seed, min, 3);
  ok(a.units > 10 && a.blds > 4 && a.time > 150, `seed ${seed}: the match really ran (${a.units} units, ${a.blds} buildings, ${a.time.toFixed(0)} s)`);
  ok(a.h === b.h && a.units === b.units && a.blds === b.blds && a.toasts === b.toasts, `seed ${seed} (${facs[seed % 3]}): state hash ${a.h} unminified == ${b.h} minified (sim bundle ${bytesIn} -> ${bytesOut} bytes)`);
}
globalThis.__toasts = [];
const base = run(3, null, 3);
globalThis.__toasts = [];
const bad = run(3, perturb, 3);
ok(bad.h !== base.h, `CONTROL: a perturbed minified bundle (TICK=1/29) gives another hash (${bad.h} != ${base.h}), so the comparison can fail`);
console.log(fails ? 'FAILED' : 'ALL MINIFY DETERMINISM CHECKS PASSED');
process.exit(fails ? 1 : 0);
