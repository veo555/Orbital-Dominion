// Headless regression gate for the simulation core + swarm layer. Exit code != 0 on failure.
//   node tests/sim/smoke.js            (about 1-2 minutes)
// Checks: (1) no exceptions and sane invariants over several seeds / all three factions with Autopilot,
//         (2) bit-exact determinism for a fixed (seed, RS) pair, (3) swarm OFF leaves the player side inert
//         and the enemy AI still plays, (4) the Overseer's natural-language parser answers (and rejects nonsense).
const load = require('./simlib3.js');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL  ' + m); } else console.log('ok    ' + m); };
const facs = ['meridian', 'obsidian', 'aurora'];
const fin = (x) => typeof x === 'number' && isFinite(x);

function run(seed, mins, opts = {}) {
  process.env.RS = String(opts.rs || 7);
  const A = load();
  A.newGame({ seed, diff: opts.diff || 'normal', faction: facs[seed % 3], enemy: facs[(seed + 1) % 3] });
  const G = A.G;
  if (opts.swarmOff) A.__run('G.sw.on=false');
  else A.ovPreset(opts.preset || 'autopilot');
  let exc = null;
  try { for (let i = 0; i < mins * 60 * 30; i++) { A.step(); if (G.over) break; } } catch (e) { exc = e; }
  return { A, G, exc };
}
function snapshot(G) {
  let h = 2166136261 >>> 0;
  const mix = (v) => { const s = String(Math.round(v * 100)); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } };
  for (const t of G.teams) { mix(t.c); mix(t.e); mix(t.used); mix(t.kills); mix(t.lost); }
  for (const u of G.units) if (!u.dead) { mix(u.x); mix(u.y); mix(u.hp); }
  for (const b of G.buildings) if (!b.dead) { mix(b.x); mix(b.y); mix(b.hp); }
  return h.toString(16);
}

// (1) invariants
for (const seed of [3, 4, 5, 11, 12, 13]) {
  const { G, exc } = run(seed, 5);
  ok(!exc, `seed ${seed} (${facs[seed % 3]}): 5 game-min Autopilot, no exception` + (exc ? ' -> ' + exc.message : ''));
  if (exc) continue;
  const bad = [];
  for (const t of G.teams) if (!fin(t.c) || !fin(t.e) || t.c < -1e-6 || t.e < -1e-6) bad.push('resource ' + t.c + '/' + t.e);
  for (const u of G.units) if (!u.dead && (!fin(u.x) || !fin(u.y) || !fin(u.hp))) bad.push('unit NaN ' + u.type);
  for (const t of G.teams) if (t.used > t.cap + 0.001 && t.used > 10) bad.push('supply over cap ' + t.used + '/' + t.cap);
  const led = G.sw && G.sw.led ? Object.values(G.sw.led) : [];
  for (const v of led) if (!fin(v)) bad.push('ledger NaN');
  for (const a of (G.sw && G.sw.agents) || []) if (!fin(a.ag.wallet)) bad.push('wallet NaN');
  ok(bad.length === 0, `seed ${seed}: invariants (finite/non-negative resources, positions, supply<=cap, wallets)` + (bad.length ? ' -> ' + bad.slice(0, 3).join('; ') : ''));
}

// (2) determinism
{
  const a = run(7, 4), b = run(7, 4), c = run(7, 4, { rs: 99 });
  const sa = snapshot(a.G), sb = snapshot(b.G), sc = snapshot(c.G);
  ok(sa === sb, `determinism: same seed + same RS -> identical state hash (${sa} vs ${sb})`);
  console.log(`info  different RS gives hash ${sc} (${sc === sa ? 'same' : 'different'}) - Math.random() is still used by the Overseer/placement code`);
}

// (3) swarm off
{
  const { G, exc } = run(9, 4, { swarmOff: true });
  ok(!exc, 'swarm OFF: 4 game-min, no exception');
  const mine = G.units.filter(u => !u.dead && u.team === 0).length;
  ok((G.sw ? G.sw.agents.length : 0) === 0, 'swarm OFF: no agents enrolled');
  const E = G.teams[1];
  ok(G.units.filter(u => !u.dead && u.team === 1).length > 8, 'enemy AI keeps playing (units alive: ' + G.units.filter(u => !u.dead && u.team === 1).length + ', yours: ' + mine + ')');
}

// (3b) swarm-OFF equivalence with the v2 baseline: with the same seeded Math.random stream, the v3 build with the swarm
//      switched off must reproduce v2's enemy-side state exactly (the whole v3 layer is inert when off).
{
  const loadV2 = require('./simlibv2.js');
  const facsE = ['meridian', 'obsidian', 'aurora'];
  for (const seed of [1, 2, 3]) {
    const sig = (A) => { const G = A.G, E = G.teams[1]; return [Math.round(E.c), Math.round(E.e), E.used, E.cap, E.kills, E.lost, G.units.filter(u => !u.dead && u.team === 1).length, G.buildings.filter(b => !b.dead && b.team === 1).length].join(','); };
    process.env.RS = '5';
    const a = loadV2(); a.newGame({ seed, diff: 'normal', faction: facsE[seed % 3], enemy: facsE[(seed + 1) % 3] });
    for (let i = 0; i < 300 * 30; i++) a.step();
    process.env.RS = '5';
    const b = load(); b.newGame({ seed, diff: 'normal', faction: facsE[seed % 3], enemy: facsE[(seed + 1) % 3] });
    b.__run('G.sw&&(G.sw.on=false)');
    for (let i = 0; i < 300 * 30; i++) b.step();
    ok(sig(a) === sig(b), `swarm OFF == v2 baseline on seed ${seed} after 300 s (enemy c,e,used,cap,kills,lost,units,buildings: ${sig(b)})`);
  }
}

// (4) natural-language parser (rule-based, not an LLM): known phrases succeed, nonsense fails cleanly, empty input is handled.
//     Market/army-dependent phrases may legitimately be refused (no listing, no money, nobody to command) - those must still
//     answer in words and must never hit the internal-error branch ("Something went wrong").
{
  const { A, G, exc } = run(5, 6);
  ok(!exc, 'parser fixture game (6 game-min) runs');
  const must = [['status', true], ['keep 14 miners', true], ['scout the map', true],
                ['hunt creeps', true], ['autopilot', true], ['blorp the frobnicator', false], ['', false]];
  const soft = ['build 2 generators', 'hire 2 miners by the day', 'hire a miner by the hour', 'take jobs'];
  for (const [txt, want] of must) {
    let r = null;
    try { r = A.ovCommand(txt, {}); } catch (e) { ok(false, `ovCommand(${JSON.stringify(txt)}) threw: ${e.message}`); continue; }
    ok(r && typeof r.say === 'string' && r.say.length > 0 && !/Something went wrong/.test(r.say), `ovCommand(${JSON.stringify(txt)}) answers in words`);
    ok(want ? r.fail === 0 && r.ok > 0 : r.fail > 0, `ovCommand(${JSON.stringify(txt)}) -> ${want ? 'accepted' : 'rejected'} (ok=${r.ok}, fail=${r.fail})`);
  }
  for (const txt of soft) {
    let r = null;
    try { r = A.ovCommand(txt, {}); } catch (e) { ok(false, `ovCommand(${JSON.stringify(txt)}) threw: ${e.message}`); continue; }
    ok(r && r.say.length > 0 && !/Something went wrong/.test(r.say), `ovCommand(${JSON.stringify(txt)}) answers in words (ok=${r.ok}, fail=${r.fail}: ${r.say.slice(0, 70)})`);
  }
}

console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL SIM CHECKS PASSED');
process.exit(fails ? 1 : 0);
