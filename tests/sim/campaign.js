// Campaign runtime tests (src/js/45_campaign.js + its hooks in 20_sim.js / 30_systems.js). Headless, no browser.
//   node tests/sim/campaign.js [group-filter]      e.g.  node tests/sim/campaign.js cond    (substring of a group title)
//   SRC=<dir> node tests/sim/campaign.js           run against another source tree (the mutation checks use this)
// One focused test per condition op and per action op against tests/fixtures/campaign_ops.js, plus: restrictions block queueing, the blocking-dispatch
// hold/resume protocol, malformed data, determinism (state hash incl. G.camp; spawn placement independent of Math.random), swarm-off inertness and the
// progress-save helpers. Exit code != 0 on any failure. A test that cannot fail is worthless (CLAUDE.md rule 15): see tests/out/campaign/mutation_report.txt.
const load = require('./simlib3.js');
const makeOps = require('../fixtures/campaign_ops.js');
const makeStory = require('../fixtures/story_min.js');
const SRC = process.env.SRC || undefined;
const FILTER = process.argv[2] || '';
const F = makeOps();
let fails = 0, passes = 0, curGroup = '';
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL  [' + curGroup + '] ' + m); } else { passes++; if (process.env.VERBOSE) console.log('ok    ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');
const near = (a, b, tol, m) => ok(Math.abs(a - b) <= tol, m + ' (got ' + a + ', want ' + b + ' ±' + tol + ')');
function group(title, fn) {
  if (FILTER && !title.toLowerCase().includes(FILTER.toLowerCase())) return;
  curGroup = title; const f0 = fails;
  try { fn(); } catch (e) { fails++; console.log('FAIL  [' + title + '] threw: ' + (e && e.stack || e)); }
  console.log((fails === f0 ? 'ok    ' : 'FAIL  ') + title);
}

/* ------------------------------------------------------------------ helpers */
function game(m, o) {
  o = o || {}; process.env.RS = String(o.rs || 7);
  const A = load(SRC); F.install(A);
  A.newGame(Object.assign({ campaign: m, autoResume: true }, o.opts || {}));
  return A;
}
const run = (A, secs) => { const n = Math.round(secs * 30); for (let i = 0; i < n; i++) { A.step(); if (A.G.over) break; } };
const ticks = (A, n) => { for (let i = 0; i < n; i++) A.step(); };
const tc = (t) => (t + 0.5) * 32;                                   // tile centre in pixels
const T = (A, i) => A.G.teams[i || 0];
const K = (A) => A.G.camp;
const flag = (A, n) => !!K(A).flags[n];
const hubOf = (A, team) => A.G.buildings.find(b => !b.dead && b.team === team && b.type === 'hub');
const mine = (A, type, tx, ty) => A.addUnit(type, 0, tc(tx), tc(ty));
const foe = (A, type, tx, ty) => A.addUnit(type, 1, tc(tx), tc(ty));
const alive = (A, team, type) => A.G.units.filter(u => !u.dead && u.team === team && (!type || u.type === type));
function findSpot(A, type, team, around) {
  const d = A.BDEF[type], h = hubOf(A, team), cx = around ? around[0] : h.tx, cy = around ? around[1] : h.ty;
  for (let r = 2; r < 18; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const tx = cx + dx, ty = cy + dy;
    if (A.canPlace(team, type, tx, ty, true) && !A.footprintBusy({ tx, ty, w: d.w, h: d.h }, null)) return { tx, ty };
  }
  return null;
}
const mk = (id, o) => F.base(id, o);
const trig = (when, extra) => [Object.assign({ id: 't', when, do: [['flag', 'hit', true]] }, extra || {})];
/* a hash over the whole simulation state plus the campaign state (everything but the mission data itself) */
function hash(A) {
  const G = A.G; let h = 2166136261 >>> 0;
  const mix = (v) => { const s = String(typeof v === 'number' ? Math.round(v * 1000) : v); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } };
  mix(G.tick); mix(G.time);
  for (const t of G.teams) for (const k of ['c', 'e', 'used', 'cap', 'kills', 'lost', 'era', 'mined', 'built', 'morale']) mix(t[k] || 0);
  for (const u of G.units) { mix(u.id); mix(u.type); mix(u.team); mix(u.x); mix(u.y); mix(u.hp); mix(u.order.t); mix(u.dead ? 1 : 0); }
  for (const b of G.buildings) { mix(b.id); mix(b.type); mix(b.team); mix(b.hp); mix(b.done ? 1 : 0); mix(b.queue.length); }
  for (const z of G.zones) { mix(z.x); mix(z.y); mix(z.t); mix(z.team); }
  if (G.ais[1]) { mix(G.ais[1].wave); mix(G.ais[1].attacking ? 1 : 0); mix(G.ais[1].P.base); }
  mix(G.rng());
  if (G.camp) { const c = Object.assign({}, G.camp); delete c.m; delete c.errSeen; delete c.aiBase; mix(JSON.stringify(c)); }
  return h.toString(16);
}

/* ===================================================================== SETUP */
group('setup: every field of mission.setup is applied', () => {
  const A = game(F.missions.setup), G = A.G, c = K(A), T0 = T(A, 0), T1 = T(A, 1);
  eq(c.errors, [], 'valid setup logs no errors');
  ok(G.seed === 1103 && G.teams[0].faction === 'aurora' && G.teams[1].faction === 'meridian', 'seed / factions taken from setup (newGame called with only {campaign})');
  ok(G.diff === 'hard' && G.ais[1].P.mult === A.DIFF.hard.mult, 'difficulty from setup.diff -> AI built from DIFF.hard');
  ok(T0.c === 777 && T0.e === 123 && T0.era === 2, 'player start resources and era');
  const hero = A.__run('heroUnit(0)');
  ok(hero && hero.type === 'hero_lyra' && T0.hero.alive, 'hero policy "start": the faction hero stands at the Hub');
  const hub = hubOf(A, 0), dist = (u) => Math.hypot(u.x - hub.x, u.y - hub.y) / 32;
  ok(alive(A, 0, 'rifleman').length === 5 && alive(A, 0, 'raptor').length === 2 && alive(A, 0, 'hauler').length === 8, 'extra start units created (5 rifleman, 2 raptor, 2 extra haulers on top of the 6)');
  ok(alive(A, 0, 'rifleman').every(u => dist(u) < 12 && A.canStand(u.x, u.y)), 'extra units stand on walkable ground within 12 tiles of the Hub');
  ok(alive(A, 0, 'hauler').filter(u => u.order.t === 'gather').length === 8, 'extra haulers go to work like the starting ones');
  ok(G.buildings.some(b => b.team === 0 && b.type === 'turret' && b.tx === 16 && b.ty === 72 && b.done), 'extra start building placed done');
  ok(G.buildings.some(b => b.team === 1 && b.type === 'turret' && b.tx === 68 && b.ty === 16 && b.done), 'foe.start.buildings placed for the enemy');
  A.step(); ok(T0.cap === 30, 'supplyBonus is added to the player cap (hub 10 + bonus 20), got ' + T0.cap);
  ok(A.reqBuild(0, 'foundry').why === 'Locked in this mission' && !A.reqBuild(0, 'foundry').ok, 'restrict.buildings locks the foundry even though it is affordable in era 2');
  ok(A.reqUnit(0, 'titan').why === 'Locked in this mission', 'restrict.units locks the titan');
  ok(A.campLocked(0, 'era', 3) === 'Locked in this mission' && A.campLocked(0, 'era', 2) === null, 'restrict.maxEra 2 locks era 3 only');
  ok(T1.c === 50 && T1.e === 60 && T1.era === 2 && alive(A, 1, 'rifleman').length === 3, 'foe.start resources / era / units');
  const B = c.aiBase, P = G.ais[1].P;
  ok(P.base === B.base * 2 && P.step === B.step * 2, 'foe.mods.waveMult scales base and step');
  ok(P.iv === B.iv * 0.5 && P.first === 100 && P.hero === false && P.air === false, 'foe.mods intervalMult / firstWave / hero / air');
  ok(G.sw.on === true, 'swarm "on"');
  ok(flag(A, 'prebuilt'), 'setup.flags are set at the start');
  A.step(); ok(G.daylight === 0 && Math.abs(G.sightMul - 0.62) < 1e-9, 'daylight "night" pins the cycle (daylight 0, sight x0.62)');
  run(A, 400); ok(G.daylight === 0, 'night stays pinned after 400 s (the cycle would be back at day)');
});
group('setup: opts override, defaults, foe.ai false, swarm off, daylight day', () => {
  let A = game(F.missions.setup, { opts: { seed: 5, diff: 'easy', faction: 'obsidian', enemy: 'aurora' } });
  ok(A.G.seed === 5 && A.G.diff === 'easy' && A.G.teams[0].faction === 'obsidian', 'explicit newGame opts win over setup (seed, diff, factions)');
  ok(A.G.ais[1].P.mult === A.DIFF.easy.mult, 'opts.diff builds the AI from DIFF.easy');
  ok(K(A).errors.some(e => /map seed 5 differs from setup.seed 1103/.test(e)), 'a seed that differs from setup.seed is reported (scripted tiles assume it)');
  const o = A.campaignOpts({ campaign: F.missions.setup }); ok(o.seed === 1103 && o.faction === 'aurora' && o.enemy === 'meridian' && o.diff === 'hard', 'campaignOpts fills seed/faction/enemy/diff');
  A = game(F.missions.waves);   // foe.ai false, swarm off, daylight cycle
  ok(A.G.ais[1] === null, 'foe.ai:false -> no enemy AI at all');
  ok(A.G.sw.on === false, 'swarm "off" -> G.sw.on false');
  A = game(F.base('d', { setup: { daylight: 'day' } })); run(A, 200);
  ok(A.G.daylight === 1 && A.G.sightMul === 1, 'daylight "day" pins full daylight at t=200 s (cycle value would be lower)');
  A = game(F.base('d', { setup: { daylight: 'cycle' } })); run(A, 200);
  ok(A.G.daylight < 1, 'daylight "cycle" leaves the normal cycle alone (' + A.G.daylight.toFixed(2) + ' at 200 s)');
  A = game(F.base('x', { setup: { swarm: undefined } })); ok(A.G.sw.on === false, 'an unspecified swarm value means off (campaign play never depends on the player settings)');
});

/* ================================================================ CONDITIONS */
group('cond: comparison operators (truth table on res c)', () => {
  const A = game(F.base('cmp', {})), t0 = T(A);
  const tbl = { '<': [1, 0, 0], '<=': [1, 1, 0], '==': [0, 1, 0], '>=': [0, 1, 1], '>': [0, 0, 1], '!=': [1, 0, 1] };   // value 99 / 100 / 101 against 100
  for (const op of Object.keys(tbl)) [99, 100, 101].forEach((v, i) => { t0.c = v; ok(A.campEvalCond(['res', 'c', op, 100]) === !!tbl[op][i], `res c ${op} 100 with c=${v} -> ${!!tbl[op][i]}`); });
  t0.e = 7; ok(A.campEvalCond(['res', 'e', '==', 7]) && !A.campEvalCond(['res', 'e', '==', 8]), 'res e reads ether');
  ok(A.campEvalCond(['all']) === true && A.campEvalCond(['any']) === false, 'empty all = true, empty any = false');
});
group('cond: all / any / not', () => {
  let A = game(mk('c_all', { triggers: trig(['all', ['res', 'c', '>=', 1000], ['flag', 'x']]) }));
  run(A, 1); ok(!A.campEvalCond(['all', ['res', 'c', '>=', 1000], ['flag', 'x']]), 'all: false at start');
  T(A).c = 1200; ok(!A.campEvalCond(['all', ['res', 'c', '>=', 1000], ['flag', 'x']]), 'all: one true is not enough');
  A.campDo(['flag', 'x', true]); ok(A.campEvalCond(['all', ['res', 'c', '>=', 1000], ['flag', 'x']]), 'all: both true -> true'); run(A, 0.5); ok(flag(A, 'hit'), 'all: a trigger on it fires');
  A = game(mk('c_any', { triggers: trig(['any', ['flag', 'x'], ['flag', 'y']]) })); run(A, 1);
  ok(!flag(A, 'hit'), 'any: false at start'); A.campDo(['flag', 'y', true]); run(A, 0.5); ok(flag(A, 'hit'), 'any: one true is enough');
  A = game(mk('c_not', { triggers: trig(['not', ['flag', 'x']]) })); run(A, 0.5);
  ok(flag(A, 'hit'), 'not: true while the flag is unset'); ok(!A.campEvalCond(['not', ['not', ['flag', 'x']]]) , 'not not x = x (false)');
  A.campDo(['flag', 'x', true]); ok(!A.campEvalCond(['not', ['flag', 'x']]), 'not: false once the flag is set');
});
group('cond: time (mission seconds, 5 Hz evaluation)', () => {
  let A = game(mk('c_time', { triggers: trig(['time', '>=', 0.5]) }));
  ticks(A, 17); ok(!flag(A, 'hit'), 'time: not yet at tick 17');
  ticks(A, 1); ok(flag(A, 'hit'), 'time >= 0.5 fires at the first evaluation after 0.5 s (tick 18 = 0.6 s)');
  near(K(A).fireT.t, 0.6, 0.01, 'conditions are evaluated every 6th tick (fired at 0.6 s, not at 0.5 s)');
  A = game(mk('c_time2', { triggers: trig(['time', '>=', 3]) })); ticks(A, 84); ok(!flag(A, 'hit'), 'time >= 3: false at 2.8 s'); ticks(A, 6); ok(flag(A, 'hit'), 'time >= 3: true at 3.0 s (float drift is tolerated)');
  A = game(mk('c_time3', {})); ok(A.campEvalCond(['time', '<', 1]) && !A.campEvalCond(['time', '>', 1]), 'time < 1 at the start');
});
group('cond: flag / after', () => {
  let A = game(mk('c_flag', { triggers: trig(['flag', 'x']) })); run(A, 1);
  ok(!flag(A, 'hit'), 'flag: unset -> false'); A.campDo(['flag', 'x', true]); run(A, 0.4); ok(flag(A, 'hit'), 'flag: set -> true');
  A.campDo(['flag', 'x', false]); ok(!A.campEvalCond(['flag', 'x']), 'flag: cleared -> false');
  A = game(mk('c_after', { triggers: trig(['after', 'f', 3]) })); A.campDo(['flag', 'f', true]);
  run(A, 2.8); ok(!A.campEvalCond(['after', 'f', 3]) && !flag(A, 'hit'), 'after f 3: false 2.8 s after the flag');
  run(A, 0.4); ok(A.campEvalCond(['after', 'f', 3]) && flag(A, 'hit'), 'after f 3: true 3 s after the flag');
  A.campDo(['flag', 'f', false]); ok(!A.campEvalCond(['after', 'f', 3]), 'after: false again when the flag is cleared');
  A.campDo(['flag', 'f', true]); ok(!A.campEvalCond(['after', 'f', 3]) && K(A).flagT.f > 3, 're-setting the flag restarts the timer (flagT = the new set time)');
  const t1 = K(A).flagT.f; run(A, 1); A.campDo(['flag', 'f', true]); ok(K(A).flagT.f === t1, 'setting an already-set flag keeps the original set time');
  ok(!A.campEvalCond(['after', 'never', 0]), 'after on an unset flag is false');
});
group('cond: count (alive census; army / worker / * / type; units and buildings)', () => {
  const A = game(mk('c_count', { triggers: trig(['count', 'unit', 'me', 'army', '>=', 8]) })), G = A.G;
  eq([6, 0, 6, 6].map((_, i) => [A.campEvalCond(['count', 'unit', 'me', 'worker', '==', 6]), A.campEvalCond(['count', 'unit', 'me', 'army', '==', 0]), A.campEvalCond(['count', 'unit', 'me', '*', '==', 6]), A.campEvalCond(['count', 'unit', 'me', 'hauler', '==', 6])][i]), [true, true, true, true], 'start: 6 workers, 0 army, 6 units, 6 haulers');
  ok(A.campEvalCond(['count', 'unit', 'enemy', 'worker', '==', 6]) && A.campEvalCond(['count', 'building', 'me', 'hub', '==', 1]) && A.campEvalCond(['count', 'building', 'enemy', '*', '==', 1]), 'enemy workers, my hubs and enemy buildings');
  for (let i = 0; i < 3; i++) mine(A, 'rifleman', 20 + i, 60);
  mine(A, 'mender', 24, 60);                                         // unarmed: not army
  ok(A.campEvalCond(['count', 'unit', 'me', 'army', '==', 3]), 'army = armed non-workers (3 riflemen; the Mender and the Haulers are not army)');
  A.addUnit('hero_idris', 0, tc(25), tc(60)); ok(A.campEvalCond(['count', 'unit', 'me', 'army', '==', 4]), 'a hero counts as army');
  ok(A.campEvalCond(['count', 'unit', 'me', 'worker', '==', 6]) && A.campEvalCond(['count', 'unit', 'me', '*', '==', 11]), 'worker / * counts follow');
  run(A, 1); ok(!flag(A, 'hit'), '3+hero = 4 < 8: the trigger has not fired');
  for (let i = 0; i < 4; i++) mine(A, 'raptor', 20 + i, 62);
  run(A, 0.5); ok(flag(A, 'hit'), 'army >= 8 fires the trigger');
  const gen = A.addBuilding('generator', 0, 20, 66, false); ok(A.campEvalCond(['count', 'building', 'me', 'generator', '==', 1]), 'count building includes buildings under construction (alive census)');
  A.kill(gen, 1); ok(A.campEvalCond(['count', 'building', 'me', 'generator', '==', 0]), 'a destroyed building is no longer counted');
});
group('cond: res / era / supply', () => {
  const A = game(mk('c_res', { triggers: trig(['res', 'c', '>=', 1000]) }));
  run(A, 1); ok(!flag(A, 'hit'), 'res c >= 1000 false at 500'); T(A).c = 1000; run(A, 0.4); ok(flag(A, 'hit'), 'res c >= 1000 true at 1000');
  ok(A.campEvalCond(['era', 'me', '==', 1]) && A.campEvalCond(['era', 'enemy', '==', 1]), 'era starts at 1 for both');
  T(A, 1).era = 3; ok(A.campEvalCond(['era', 'enemy', '>=', 3]) && !A.campEvalCond(['era', 'me', '>=', 2]), 'era reads the side it is asked about');
  for (let i = 0; i < 10; i++) mine(A, 'rifleman', 20 + i, 60);
  ticks(A, 1); ok(A.campEvalCond(['supply', 'me', '==', 16]), 'supply = used supply (6 haulers + 10 riflemen), got ' + T(A).used);
  ok(A.campEvalCond(['supply', 'enemy', '==', 6]), 'enemy supply (6 haulers)');
});
group('cond: hero alive / dead / level / heroNear', () => {
  let A = game(mk('c_hero', { setup: { start: { hero: 'available' } } }));
  ok(!A.campEvalCond(['hero', 'alive']) && !A.campEvalCond(['hero', 'dead']), 'hero not yet trained: neither alive nor dead');
  ok(A.campEvalCond(['hero', 'level', '==', 1]), 'hero level 1 by default');
  A = game(mk('c_hero2', { setup: { start: { hero: 'start' } }, triggers: trig(['hero', 'dead']) }));
  ok(A.campEvalCond(['hero', 'alive']) && !A.campEvalCond(['hero', 'dead']), 'start hero: alive');
  const u = A.__run('heroUnit(0)'); u.x = tc(40); u.y = tc(40);
  ok(A.campEvalCond(['heroNear', 40, 40, 1]) && !A.campEvalCond(['heroNear', 45, 40, 3]), 'heroNear: inside / outside the radius (tiles)');
  u.x = tc(40 + 3); ok(A.campEvalCond(['heroNear', 40, 40, 3]), 'heroNear: exactly r tiles away counts'); u.x = tc(40 + 3.2); ok(!A.campEvalCond(['heroNear', 40, 40, 3]), 'heroNear: 3.2 tiles away with r=3 does not');
  A.campDo(['herolevel', 4]); ok(A.campEvalCond(['hero', 'level', '>=', 4]) && !A.campEvalCond(['hero', 'level', '>=', 5]), 'hero level reads the hero level');
  A.kill(u, 1); ok(!A.campEvalCond(['hero', 'alive']) && A.campEvalCond(['hero', 'dead']), 'killed hero: dead (and not alive)'); ok(!A.campEvalCond(['heroNear', 40, 40, 100]), 'heroNear is false without a hero');
  ok(A.campEvalCond(['hero', 'level', '>=', 4]), 'the level survives the hero falling'); run(A, 0.5); ok(flag(A, 'hit'), 'a trigger on hero dead fires');
});
group('cond: kills / lost / structs', () => {
  const A = game(mk('c_kl', { triggers: trig(['kills', 'me', '>=', 1]) }));
  ok(A.campEvalCond(['kills', 'me', '==', 0]) && A.campEvalCond(['lost', 'me', '==', 0]), 'counters start at 0');
  const e = foe(A, 'rifleman', 40, 40); A.kill(e, 0);
  ok(A.campEvalCond(['kills', 'me', '==', 1]) && A.campEvalCond(['lost', 'enemy', '==', 1]) && A.campEvalCond(['kills', 'enemy', '==', 0]) && A.campEvalCond(['lost', 'me', '==', 0]), 'my kill raises my kills and the enemy lost');
  run(A, 0.5); ok(flag(A, 'hit'), 'a trigger on kills fires');
  const m1 = mine(A, 'rifleman', 41, 40); A.kill(m1, 1); ok(A.campEvalCond(['kills', 'enemy', '==', 1]) && A.campEvalCond(['lost', 'me', '==', 1]), 'the enemy kill raises its kills and my lost');
  ok(A.campEvalCond(['structs', 'me', '==', 1]) && A.campEvalCond(['structs', 'enemy', '==', 1]), 'structs counts alive buildings (the Hubs)');
  const g = A.addBuilding('generator', 0, 20, 66, true); ok(A.campEvalCond(['structs', 'me', '==', 2]), 'structs +1'); A.kill(g, 1); ok(A.campEvalCond(['structs', 'me', '==', 1]) && A.campEvalCond(['lost', 'me', '==', 2]), 'structs -1, a lost building counts in lost');
});
group('cond: camps (creep camps cleared by the player)', () => {
  const A = game(mk('c_camps', { triggers: trig(['camps', '>=', 1]) })), G = A.G;
  const units = (ci) => G.camps[ci].units.map(id => G.units.find(u => u.id === id));
  ok(A.campEvalCond(['camps', '==', 0]), 'no camp cleared at the start');
  const u0 = units(0); for (let i = 0; i < u0.length - 1; i++) A.kill(u0[i], 0);
  ok(A.campEvalCond(['camps', '==', 0]), 'a camp with one survivor is not cleared');
  for (const u of units(1)) A.kill(u, 1);
  ok(A.campEvalCond(['camps', '==', 0]), 'a camp cleared by the ENEMY does not count for the player');
  A.kill(u0[u0.length - 1], 0); ok(A.campEvalCond(['camps', '==', 1]), 'the last survivor killed by the player clears the camp');
  run(A, 0.5); ok(flag(A, 'hit'), 'camps >= 1 fires the trigger');
  for (const u of units(2)) A.kill(u, 0); ok(A.campEvalCond(['camps', '==', 2]), 'a second camp -> 2');
  eq(A.campaignSummary().campsCleared, 2, 'campaignSummary().campsCleared');
});
group('cond: unitsNear', () => {
  const A = game(mk('c_near', { triggers: trig(['unitsNear', 'me', 'army', 40, 40, 5, '>=', 2]) }));
  mine(A, 'rifleman', 40, 40); mine(A, 'rifleman', 43, 40); A.addUnit('rifleman', 0, tc(40 + 5.4), tc(40)); mine(A, 'hauler', 41, 41);
  ok(A.campEvalCond(['unitsNear', 'me', 'army', 40, 40, 5, '==', 2]), 'army within 5 tiles: 2 inside, the one 5.4 tiles away and the hauler do not count');
  ok(A.campEvalCond(['unitsNear', 'me', 'worker', 40, 40, 5, '==', 1]) && A.campEvalCond(['unitsNear', 'me', '*', 40, 40, 5, '==', 3]) && A.campEvalCond(['unitsNear', 'me', 'rifleman', 40, 40, 6, '==', 3]), 'worker / * / type filters and the radius');
  foe(A, 'raptor', 40, 41); ok(A.campEvalCond(['unitsNear', 'enemy', '*', 40, 40, 2, '==', 1]) && A.campEvalCond(['unitsNear', 'me', 'raptor', 40, 40, 2, '==', 0]), 'sides are separate');
  run(A, 0.5); ok(flag(A, 'hit'), 'the trigger fires');
});
group('cond: built (completed constructions) / trained / researched', () => {
  const A = game(F.missions.setup, { opts: { diff: 'normal' } }), G = A.G;
  ok(A.campEvalCond(['count', 'building', 'me', 'turret', '>=', 1]) && A.campEvalCond(['built', 'turret', '==', 0]), 'a building given by setup is not "built" by the player');
  const sp = findSpot(A, 'generator', 0), h = alive(A, 0, 'hauler')[0];
  ok(A.orderBuild(h, 'generator', sp.tx, sp.ty), 'build order accepted');
  ok(A.campEvalCond(['built', 'generator', '==', 0]), 'built: nothing finished yet');
  for (let i = 0; i < 30 * 60 && !A.campEvalCond(['built', 'generator', '>=', 1]); i++) A.step();
  ok(A.campEvalCond(['built', 'generator', '==', 1]), 'built generator counts once it is complete (t=' + G.time.toFixed(1) + ' s)');
  A.kill(G.buildings.find(b => b.type === 'generator' && b.team === 0), 1); ok(A.campEvalCond(['built', 'generator', '==', 1]), 'built is cumulative: a destroyed generator still counts');
  /* trained */
  const g = A.addBuilding('garrison', 0, findSpot(A, 'garrison', 0).tx, findSpot(A, 'garrison', 0).ty, true); G.teams[0].c = 2000;
  ok(A.campEvalCond(['trained', 'rifleman', '==', 0]), 'trained: none yet');
  ok(A.queueUnit(g, 'rifleman') && A.queueUnit(g, 'rifleman'), 'two riflemen queued');
  for (let i = 0; i < 30 * 40 && !A.campEvalCond(['trained', 'rifleman', '>=', 2]); i++) A.step();
  ok(A.campEvalCond(['trained', 'rifleman', '==', 2]) && A.campEvalCond(['trained', 'raptor', '==', 0]), 'trained rifleman == 2 (raptors 0), t=' + G.time.toFixed(1) + ' s');
  /* researched */
  const ar = A.addBuilding('armory', 0, findSpot(A, 'armory', 0).tx, findSpot(A, 'armory', 0).ty, true); G.teams[0].c = 2000; G.teams[0].e = 500;
  ok(!A.campEvalCond(['researched', 'weapons']), 'not researched yet'); ok(A.queueResearch(ar, 'weapons'), 'research queued');
  run(A, 45); ok(A.campEvalCond(['researched', 'weapons']) && !A.campEvalCond(['researched', 'armor']), 'researched weapons after its 40 s research time');
});
group('cond: hubs / mined / trade', () => {
  const A = game(mk('c_hubs', {})), G = A.G, T0 = T(A);
  ok(A.campEvalCond(['hubs', 'me', '==', 1]) && A.campEvalCond(['hubs', 'enemy', '==', 1]), 'one hub each');
  const site = G.sites.find(s => s.owner < 0 && A.canPlace(0, 'hub', s.tx, s.ty, true));
  const b = A.addBuilding('hub', 0, site.tx, site.ty, false); ok(A.campEvalCond(['hubs', 'me', '==', 1]), 'a hub under construction is not an operational hub');
  b.done = true; b.prog = 1; ok(A.campEvalCond(['hubs', 'me', '==', 2]), 'a finished hub counts');
  run(A, 60); ok(T0.minedC > 20, 'haulers mined something (' + Math.round(T0.minedC) + ')');
  ok(A.campEvalCond(['mined', 'c', '>=', T0.minedC - 0.5]) && !A.campEvalCond(['mined', 'c', '>', T0.minedC + 0.5]), 'mined c reads the lifetime crystals mined');
  T0.minedE = 123; ok(A.campEvalCond(['mined', 'e', '==', 123]), 'mined e reads ether');
  T0.tradeEarn = 150; ok(A.campEvalCond(['trade', '>=', 150]) && !A.campEvalCond(['trade', '>', 150]), 'trade reads the crystals earned on trade routes');
});
group('cond: obj and wave', () => {
  let A = game(F.missions.objectives);
  ok(A.campEvalCond(['obj', 'p1', 'active']) && !A.campEvalCond(['obj', 'p1', 'done']), 'obj: active at the start');
  A.campDo(['obj', 'p1', 'done']); ok(A.campEvalCond(['obj', 'p1', 'done']) && !A.campEvalCond(['obj', 'p1', 'active']), 'obj: done after the action');
  A = game(F.missions.aimod); ok(A.campEvalCond(['wave', '==', 0]), 'wave 0 at the start');
  run(A, 30); ok(A.G.ais[1].wave >= 1 && A.campEvalCond(['wave', '>=', 1]), 'wave counts the AI attack waves launched (real AI run, wave=' + A.G.ais[1].wave + ')');
  A = game(mk('nowave', {})); ok(A.campEvalCond(['wave', '==', 0]), 'wave is 0 without an AI');
});

/* ================================================================== ACTIONS */
group('action: radio / mood / ping / flag (UI events)', () => {
  const A = game(mk('a_ui', {})), c = K(A);
  A.__run('globalThis.__campEv=[]');
  A.campDo(['radio', 'r1']); A.campDo(['mood', 'battle']); A.campDo(['ping', 30, 40, 'bad']); A.campDo(['flag', 'x', true]);
  const evs = A.__run('globalThis.__campEv');
  eq(evs.map(e => e.type), ['radio', 'mood', 'ping'], 'onCampaignEvent receives radio, mood, ping events in order (flag is silent)');
  ok(evs[0].id === 'r1' && evs[1].mood === 'battle' && evs[2].tx === 30 && evs[2].ty === 40 && evs[2].kind === 'bad', 'event payloads');
  ok(evs.every((e, i) => typeof e.n === 'number' && typeof e.t === 'number' && (i === 0 || e.n > evs[i - 1].n)), 'events carry an increasing sequence number n and the mission time t');
  ok(c.events.length >= 3 && c.events[c.events.length - 1].type === 'ping', 'events are also queued in G.camp.events');
  eq(c.radio.map(r => r.id), ['r1'], 'G.camp.radio keeps the radio history'); ok(c.mood === 'battle', 'G.camp.mood');
  ok(A.G.fx.some(f => f.kind === 'ping' && Math.abs(f.x - tc(30)) < 1 && Math.abs(f.y - tc(40)) < 1), 'ping also leaves a map ping fx');
  const d = A.campaignDrainEvents(); ok(d.length >= 3 && c.events.length === 0, 'campaignDrainEvents returns the backlog and clears it');
  ok(c.errors.length === 0, 'no errors logged'); A.campDo(['mood', 'glad']); ok(c.errors.length === 1 && c.mood === 'battle', 'an unknown mood is rejected and logged once');
  for (let i = 0; i < 400; i++) A.campDo(['radio', 'r2']); ok(c.events.length === 300 && c.events[299].n - c.events[0].n === 299, 'the event backlog is bounded to the newest 300');
  A.campDo(['flag', 'x', false]); ok(!flag(A, 'x') && !('x' in c.flagT), 'flag false clears the flag and its time');
  A.campDo(['mood', 'victory']); A.campDo(['mood', 'dread']); A.campDo(['mood', 'calm']); A.campDo(['mood', 'tension']); eq(c.mood, 'tension', 'all five moods are accepted');
});
group('action: spawn (where, order, sides)', () => {
  const A = game(F.missions.waves), G = A.G, hub0 = hubOf(A, 0), hub1 = hubOf(A, 1);
  const dTile = (u, x, y) => Math.hypot(u.x / 32 - x - .5, u.y / 32 - y - .5);
  run(A, 5.4);
  const raps = alive(A, 1, 'raptor'); ok(raps.length === 3, 'w1: 3 raptors spawned for the enemy'); const dist0 = raps.map(u => Math.hypot(u.x - hub0.x, u.y - hub0.y));
  ok(raps.every(u => u.y < 9 * 32 && Math.abs(u.x / 32 - 44) < 12 && A.canStand(u.x, u.y)), 'edge:N: near the middle of the north edge, on walkable ground');
  ok(raps.every(u => u.order.t === 'attackmove' && Math.abs(u.order.x - hub0.x) < 1 && Math.abs(u.order.y - hub0.y) < 1), 'order attack = attack-move on the opposing (player) hub');
  const slow = Math.min(...raps.map(u => u.def.speed)); ok(raps.every(u => Math.abs(u.order.gs - slow * 1.12) < 1e-9), 'the group is speed-capped like an AI wave (slowest x1.12)');
  run(A, 0.6); const rf = alive(A, 1, 'rifleman'); ok(rf.length === 2 && rf.every(u => dTile(u, 30, 40) < 6 && u.order.t === 'hold'), 'w2: 2 enemy riflemen around tile (30,40) on hold');
  run(A, 1); const me = alive(A, 0, 'rifleman'); ok(me.length === 4 && me.every(u => Math.hypot(u.x - hub0.x, u.y - hub0.y) / 32 < 12 && u.order.t === 'idle'), 'w3: 4 player riflemen around the base, idle (default order)');
  run(A, 1); const h1 = alive(A, 1, 'hauler'); ok(h1.length === 8 && h1.filter(u => u.order.t === 'gather').length === 8, 'w4: 2 enemy haulers at their base start gathering (6 + 2)');
  run(A, 1); const sk = alive(A, 1, 'skiff'); ok(sk.length === 2 && sk.every(u => u.x / 32 > 78) && sk.every(u => u.order.t === 'attackmove'), 'w5: skiffs (flying) from edge:E, attack order');
  run(A, 1); const md = alive(A, 0, 'mender'); ok(md.length === 1 && md[0].y / 32 > 78 && md[0].order.t === 'idle', 'w6: friendly Mender from edge:S, idle');
  eq(K(A).errors, [], 'no errors'); ok(A.__run('G.fx.some(f=>f.kind==="ring")'), 'an arrival ring fx is created');
  const raps2 = alive(A, 1, 'raptor'), d0 = (u) => Math.hypot(u.x - hub0.x, u.y - hub0.y);
  ok(raps2.length === 3 && raps2.every((u, i) => d0(u) < dist0[i] - 150), 'attack-moving raptors really march towards the player base (5.4 s after the spawn each is >150 px closer)');
  /* limits, heroes */
  A.campDo(['spawn', 'me', 'rifleman', 500, 'base']); ok(alive(A, 0, 'rifleman').length === 4 + 60, 'n is capped at 60 per action');
  A.campDo(['spawn', 'me', 'hero_idris', 3, 'base']); ok(alive(A, 0, 'hero_idris').length === 1 && T(A).hero.alive, 'the own faction hero can be spawned (once, n forced to 1)');
  const before = K(A).errors.length; A.campDo(['spawn', 'me', 'hero_idris', 1, 'base']); ok(K(A).errors.length === before + 1 && alive(A, 0, 'hero_idris').length === 1, 'a second hero is refused and logged');
});
group('action: spawn is placed with G.rng only (independent of Math.random)', () => {
  const pos = (rs) => { const A = game(F.missions.waves, { rs }); run(A, 5.4); return alive(A, 1, 'raptor').map(u => [Math.round(u.x * 100), Math.round(u.y * 100)]); };
  const a = pos(7), b = pos(99);
  ok(a.length === 3 && JSON.stringify(a) === JSON.stringify(b), 'the same spawn positions for two different Math.random streams (' + JSON.stringify(a) + ' vs ' + JSON.stringify(b) + ')');
});
group('action: give / take', () => {
  const A = game(mk('a_gt', {})), c = K(A), T0 = T(A); A.__run('globalThis.__campEv=[]');
  A.campDo(['give', 'c', 250]); ok(T0.c === 750, 'give c adds crystals');
  A.campDo(['give', 'e', 40]); ok(T0.e === 40, 'give e adds ether');
  A.campDo(['take', 'c', 100]); ok(T0.c === 650, 'take c subtracts'); A.campDo(['take', 'c', 1e6]); ok(T0.c === 0, 'take never goes below 0');
  A.campDo(['take', 'e', 15]); ok(T0.e === 25, 'take e');
  const ev = A.__run('globalThis.__campEv').filter(e => e.type === 'res'); eq(ev.map(e => e.delta), [250, 40, -100, -1e6, -15], 'res events carry the delta');
  A.campDo(['give', 'c', -5]); ok(T0.c === 0 && c.errors.length === 1, 'a negative amount is refused and logged');
  A.campDo(['give', 'c', 100]); ok(T(A, 1).c !== 100, 'give / take only change the player');
});
group('action: reveal (timed live vision in the fog)', () => {
  const A = game(mk('a_rev', {})), G = A.G, hub1 = hubOf(A, 1), ti = (tx, ty) => ty * 88 + tx;
  ok(G.vis[0][ti(75, 14)] === 0 && !A.seen(0, hub1), 'the enemy base starts in the dark (unexplored, unseen)');
  A.campDo(['reveal', 75, 14, 6]);
  ok(G.vis[0][ti(75, 14)] === 2 && A.seen(0, hub1) && hub1.seen0, 'reveal: tiles are visible now, the enemy hub can be seen');
  run(A, 4); ok(G.vis[0][ti(75, 14)] === 2 && A.seen(0, hub1), 'still visible after 4 s (default duration 8 s)');
  run(A, 5); ok(G.vis[0][ti(75, 14)] === 1 && !A.seen(0, hub1), 'after 9 s the live vision is gone but the area stays explored (1)');
  A.campDo(['reveal', 60, 60, 3, 2]); ok(G.vis[0][ti(60, 60)] === 2, 'reveal with an explicit 4th argument (seconds)'); run(A, 2.6); ok(G.vis[0][ti(60, 60)] === 1, '... which expires after 2 s');
  ok(K(A).reveals.length === 0, 'expired reveals are dropped');
});
group('action: aimod (absolute, relative to the AI baseline)', () => {
  const A = game(F.missions.aimod), G = A.G, c = K(A), B = c.aiBase, P = G.ais[1].P;
  ok(P.base === B.base * 0.05 && P.first === 1, 'foe.mods at setup: waveMult 0.05, firstWave 1');
  run(A, 5.4); ok(Math.abs(P.base - B.base * 3) < 1e-9 && Math.abs(P.step - B.step * 3) < 1e-9 && Math.abs(P.iv - B.iv * 2) < 1e-9 && P.first === 50 && P.hero === false && P.air === false, 'aimod waveMult 3 / intervalMult 2 / firstWave 50 / hero / air');
  run(A, 5); ok(Math.abs(P.base - B.base) < 1e-9 && Math.abs(P.iv - B.iv) < 1e-9 && P.first === 50, 'aimod {waveMult:1,intervalMult:1} returns to the baseline (not cumulative); firstWave keeps its explicit value');
  run(A, 2); ok(c.errors.some(e => /unknown aimod key "bogus"/.test(e)) && c.errors.some(e => /aimod\.waveMult/.test(e)), 'unknown keys / bad values are logged, not thrown');
  eq(Object.fromEntries(Object.entries(c.aiMods).sort()), { air: false, firstWave: 50, hero: false, intervalMult: 1, waveMult: 1 }, 'G.camp.aiMods records the last values applied');
  const A2 = game(F.missions.waves); A2.campDo(['aimod', { waveMult: 2 }]); ok(K(A2).errors.length === 0, 'aimod without an AI is a silent no-op');
});
group('action: strike (delayed damaging zone, reuses the orbital zone)', () => {
  const A = game(F.missions.strikes), G = A.G; A.__run('globalThis.__sfx=[];sfx=function(n){__sfx.push(n)}');
  const inA = mine(A, 'rifleman', 34, 50), outA = mine(A, 'rifleman', 34 + 4, 52), gar = A.addBuilding('garrison', 0, 33, 49, true), hp0 = gar.hp;
  const enemyIn = foe(A, 'rifleman', 38, 50); const k0 = T(A, 0).kills;
  const far = mine(A, 'rifleman', 20, 34);
  run(A, 2.4);
  const z = G.zones.filter(zz => zz.type === 'orbital'); ok(z.length >= 2, 'strike creates orbital zones');
  const z1 = z.find(zz => Math.abs(zz.x - tc(34)) < 1); ok(z1 && z1.team === 1 && z1.r === 96 && z1.dmg === 500 && z1.sdmg === 625 && Math.abs(z1.max - 4) < 1e-9, 'enemy strike (default side): team 1, radius 3 tiles = 96 px, 500 dmg (625 to buildings), 4 s delay');
  const z2 = z.find(zz => Math.abs(zz.x - tc(38)) < 1); ok(z2 && z2.team === 0 && z2.dmg === 400, 'a strike with side "me" belongs to the player');
  ok(A.__run('__sfx').includes('alert') && A.__run('__sfx').includes('boom'), 'sfx hook: the strike names its warning sound (default alert)');
  ok(G.fx.some(f => f.kind === 'ring' && Math.abs(f.r - 96) < 1), 'a warning ring fx is created'); ok(!inA.dead && !enemyIn.dead, 'nothing is hurt before the delay');
  run(A, 0.8); ok(enemyIn.dead && T(A, 0).kills === k0 + 1, 'the friendly strike (1 s) kills the enemy unit and credits the player');
  ok(!inA.dead, 'the 4 s enemy strike has not fired yet (t=3.2 s)'); run(A, 3); ok(inA.dead, 'the enemy strike kills the player unit inside the circle after its 4 s delay (fired at t=6 s)');
  ok(!outA.dead && !far.dead, 'units outside the circle are not hurt'); near(gar.hp, hp0 - 625, 1, 'a building takes the structure damage (dmg x1.25 = 625)');
  ok(T(A, 1).kills >= 1, 'kills are credited to the striking side');
  const e = A.__run('globalThis.__campEv').filter(x => x.type === 'strike'); ok(e.length === 3 && e[0].tx === 34 && e[0].delay === 4 && e[0].side === 'enemy', 'strike events (warning for the UI)');
  const A2 = game(F.missions.strikes), u = mine(A2, 'rifleman', 20, 30); run(A2, 2); ok(!u.dead && A2.G.zones.some(z => Math.abs(z.x - tc(20)) < 1), 'zero-delay strike: the zone exists at 2.0 s and waits the 0.1 s minimum'); run(A2, 0.3); ok(u.dead, 'zero-delay strike fires almost at once');
});
group('action: unlock / lock + restrictions block queueing', () => {
  const A = game(F.missions.restrict), G = A.G, T0 = T(A), L = 'Locked in this mission'; T0.c = 3000; T0.e = 1000;
  A.__run('globalThis.__toasts=[]');
  const hub = hubOf(A, 0), sp = findSpot(A, 'garrison', 0), h = alive(A, 0, 'hauler')[0], c0 = T0.c;
  ok(!A.reqBuild(0, 'garrison').ok && A.reqBuild(0, 'garrison').why === L, 'a locked building cannot be built: reqBuild says why');
  ok(A.orderBuild(h, 'garrison', sp.tx, sp.ty) === false && T0.c === c0, 'orderBuild on a locked building is refused and costs nothing (agents / Overseer too)');
  ok(A.reqBuild(0, 'generator').ok, 'unlisted buildings are fine');
  const gar = A.addBuilding('garrison', 0, sp.tx, sp.ty, true);   // placed by the test, bypassing the lock
  ok(A.queueUnit(gar, 'rocketeer') === false && gar.queue.length === 0 && A.reqUnit(0, 'rocketeer').why === L, 'a locked unit cannot be queued (reqUnit / queueUnit)');
  ok(A.queueUnit(gar, 'rifleman') === true, 'an unlocked unit queues normally');
  ok(A.queueHero(hub) === false && A.__run('__toasts').includes(L) && T0.hero.reviving === false, 'hero policy "none": queueHero returns false with the reason "Locked in this mission"');
  ok(A.campLocked(0, 'hero', 'hero_idris') === L, 'campLocked(team,"hero") reports it for the UI');
  ok(A.queueEra(hub) === false && A.__run('__toasts').filter(x => x === L).length >= 2, 'queueEra to a locked era is refused with the reason'); ok(T0.era === 1 && hub.queue.length === 0, '...and queues nothing');
  ok(A.campLocked(1, 'building', 'garrison') === null && A.campLocked(1, 'unit', 'rocketeer') === null && A.campLocked(1, 'era', 3) === null, 'restrictions bind only the player: the enemy is never locked');
  run(A, 20.4);
  ok(A.reqBuild(0, 'garrison').ok && A.reqUnit(0, 'rocketeer').why !== L, 'the unlock trigger frees the building and the unit');
  ok(A.reqBuild(0, 'turret').why === L, 'unlock is per id: the turret stays locked');
  ok(A.queueEra(hub) === true && hub.queue.some(q => q.k === 'era'), 'unlock era 2 lets queueEra start the advance'); A.cancelQueue(hub, hub.queue.findIndex(q => q.k === 'era'));
  A.campDo(['flag', 'relock', true]); run(A, 0.5);
  ok(A.reqBuild(0, 'garrison').why === L && A.campLocked(0, 'era', 2) === L, 'lock re-locks the building and the era');
  A.campDo(['flag', 'herook', true]); run(A, 0.5); ok(A.campLocked(0, 'hero', 'hero_idris') === null && A.queueHero(hub) === true, 'unlock unit <hero> lifts hero policy "none"');
  const s = A.campaignSummary(); ok(s.locks.buildings.includes('garrison') && s.locks.buildings.includes('turret') && s.locks.maxEra === 1 && s.locks.hero === 'available', 'campaignSummary().locks: ' + JSON.stringify(s.locks));
  const ev = A.__run('globalThis.__campEv').filter(e => e.type === 'unlock'); ok(ev.length >= 4 && ev[0].kind === 'building' && ev[0].id === 'garrison' && ev[0].locked === false, 'unlock events for the UI (uiDirty is called too)');
});
group('action: herolevel / heal', () => {
  const A = game(mk('a_hl', { setup: { start: { hero: 'start' } } })), G = A.G, hero = A.__run('heroUnit(0)');
  ok(hero.maxhp === 520, 'hero level 1: Marshal Idris 520 hp');
  A.campDo(['herolevel', 4]); ok(T(A).hero.level === 4 && hero.maxhp === Math.round(520 * (1 + 0.14 * 3)) && A.skillPoints(0) === 4, 'herolevel 4: level, max hp and 4 skill points');
  ok(T(A).hero.xp >= A.HERO_LVL_XP[4], 'xp is raised to the level threshold');
  A.campDo(['herolevel', 2]); ok(T(A).hero.level === 4, 'herolevel never lowers the level');
  A.campDo(['herolevel', 4]); A.campDo(['herolevel', 9]); ok(T(A).hero.level === 4 && K(A).errors.length === 1, 'out-of-range levels are refused and logged');
  /* heal */
  const a = mine(A, 'rifleman', 30, 30), b = mine(A, 'rifleman', 31, 30), far = mine(A, 'rifleman', 36, 30), e = foe(A, 'rifleman', 30, 31), g = A.addBuilding('garrison', 0, 28, 28, true);
  for (const u of [a, b, far, e]) u.hp = 5; g.hp = 100;
  A.campDo(['heal', 'me', 30, 30, 4]);
  ok(a.hp === a.maxhp && b.hp === b.maxhp && g.hp === g.maxhp, 'heal restores units and buildings of that side inside the radius to full');
  ok(far.hp === 5 && e.hp === 5, 'heal leaves units outside the radius and the other side alone');
  A.campDo(['heal', 'enemy', 30, 30, 4]); ok(e.hp === e.maxhp, 'heal enemy heals the enemy');
});
group('action: win / lose and objectives actions', () => {
  let A = game(mk('a_win', { triggers: [{ id: 'w', when: ['time', '>=', 1], do: [['radio', 'r1'], ['win'], ['flag', 'after_win', true]] }] }));
  run(A, 1.3); ok(A.G.over === 'victory' && K(A).result.reason === 'win' && flag(A, 'after_win'), 'win action ends the game as a victory (the rest of that trigger still runs)');
  A = game(mk('a_lose', { triggers: [{ id: 'l', when: ['time', '>=', 1], do: [['lose', 'convoy-lost']] }] }));
  run(A, 1.3); ok(A.G.over === 'defeat' && K(A).result.reason === 'convoy-lost', 'lose action ends the game as a defeat with the given reason id');
  A = game(F.missions.objectives);
  A.campDo(['obj', 'p2', 'show']); ok(A.campObjectives().some(o => o.id === 'p2' && o.state === 'active'), 'obj show reveals a hidden objective');
  A.campDo(['obj', 'b1', 'fail']); A.campDo(['obj', 'b1', 'done']); ok(A.campObjectives().find(o => o.id === 'b1').state === 'failed', 'obj fail then done: the first outcome is sticky');
  A.campDo(['obj', 'p1', 'done']); A.campDo(['obj', 'p1', 'fail']); ok(A.campObjectives().find(o => o.id === 'p1').state === 'done', 'obj done is sticky');
});

/* ====================================================== TRIGGERS / TIMERS */
group('triggers: once / every / delay / after / latching', () => {
  const A = game(F.missions.timers), c = K(A);
  run(A, 2.4); ok(flag(A, 'a') && c.fired.once === 1, 'once (default): fired');
  run(A, 10); ok(c.fired.once === 1, 'once: never fires again');
  const B = game(F.missions.timers), cb = K(B); run(B, 10.9); eq(cb.fired.every, 2, 'every:5, once:false, when time>=1: fired at 1 s and 6 s by 10.9 s');
  run(B, 10.4); eq(cb.fired.every, 5, '... and at 11, 16, 21 s: 5 firings by 21.3 s'); near(cb.fireT.every, 21, 0.25, 'last firing time');
  const C = game(F.missions.timers); run(C, 6.8); ok(!flag(C, 'delayed'), 'delay 4 after the condition at 3 s: not yet at 6.8 s'); run(C, 0.6); ok(flag(C, 'delayed'), 'fired at 7 s');
  ok(!flag(C, 'pulse'), 'the pulse flag is long gone'); ok(flag(C, 'latched_fired'), 'delay is latched: the condition was only true for 0.4 s but the trigger still fired after its 2 s delay');
  const D = game(F.missions.timers); run(D, 4.9); ok(!flag(D, 'after_fired'), 'after f 3: not yet'); run(D, 0.5); ok(flag(D, 'after_fired'), 'after f 3 (flag set at 2 s) fires at 5 s');
  const E = game(F.missions.timers), ce = K(E); E.campDo(['flag', 'go', true]); run(E, 1.1); ok(ce.fired.repeat >= 5 && ce.fired.repeat <= 7, 'once:false without every: fires at every evaluation (5 Hz) while true: ' + ce.fired.repeat);
  E.campDo(['flag', 'go', false]); const n = ce.fired.repeat; run(E, 1); eq(ce.fired.repeat, n, '... and stops when the condition ends');
});
group('triggers: order, same-pass visibility, game over stops them', () => {
  const m = mk('o', { triggers: [
    { id: 'late', when: ['flag', 'first'], do: [['flag', 'second', true]] },       // listed BEFORE the trigger that sets "first": sees it one pass later
    { id: 'first', when: ['time', '>=', 1], do: [['flag', 'first', true]] },
    { id: 'chain', when: ['flag', 'first'], do: [['flag', 'chained', true]] }] });
  const A = game(m), c = K(A); run(A, 1); ok(flag(A, 'first') && flag(A, 'chained') && !flag(A, 'second'), 'a later trigger sees a flag set earlier in the same pass; an earlier one only on the next pass');
  run(A, 0.3); ok(flag(A, 'second'), 'the earlier-listed trigger fires on the following pass');
  const B = game(mk('e', { triggers: [{ id: 'a', when: ['time', '>=', 1], do: [['win']] }, { id: 'b', when: ['time', '>=', 1], do: [['flag', 'b_ran', true]] }] }));
  run(B, 1.5); ok(B.G.over === 'victory' && !flag(B, 'b_ran'), 'after a win, later triggers do not run');
  const tk = K(B).tick; run(B, 1); ok(K(B).tick === tk, 'campaignStep is inert once the game is over');
});

/* ============================================================== OBJECTIVES */
group('objectives: visibility, sticky done / fail, bonus fail, secret, chain', () => {
  const A = game(F.missions.objectives), c = K(A); A.__run('globalThis.__campEv=[]');
  const st = () => Object.fromEntries(A.campObjectives(true).map(o => [o.id, o.state]));
  eq(st(), { p1: 'active', p2: 'hidden', b1: 'active', b2: 'active', h1: 'hidden', chain: 'hidden' }, 'initial states (when:null -> active; when / kind hidden -> hidden)');
  eq(A.campObjectives().map(o => o.id), ['p1', 'b1', 'b2'], 'campObjectives() lists only the visible ones, in mission order');
  ok(A.campObjectives()[0].text === 'Primary one' && A.campObjectives()[0].kind === 'primary', 'text and kind are included');
  A.campDo(['flag', 'p1done', true]); run(A, 0.4); ok(st().p1 === 'done' && st().chain === 'active', 'p1 done; "chain" (when obj p1 done) becomes visible in the same pass');
  A.campDo(['flag', 'b1done', true]); run(A, 0.4); ok(st().b1 === 'done', 'bonus done');
  A.campDo(['flag', 'b1fail', true]); run(A, 0.4); ok(st().b1 === 'done', 'done is sticky: a later fail condition changes nothing');
  A.campDo(['flag', 'show2', true]); run(A, 0.4); ok(st().p2 === 'active', 'p2 appears when its `when` becomes true');
  T(A).c = 1500; run(A, 0.4); ok(st().b2 === 'done', 'a resource objective completes');
  A.campDo(['flag', 'h1done', true]); run(A, 0.4); ok(st().h1 === 'done' && A.campObjectives().some(o => o.id === 'h1'), 'a secret objective reveals itself by being completed');
  const ev = A.__run('globalThis.__campEv').filter(e => e.type === 'obj'); ok(ev.some(e => e.id === 'p1' && e.state === 'done' && e.kind === 'primary' && e.text === 'Primary one'), 'obj events carry id/state/kind/text');
  ok(ev.some(e => e.id === 'p2' && e.state === 'active'), 'obj event when an objective becomes visible');
  const B = game(F.missions.objectives); B.campDo(['flag', 'b1fail', true]); run(B, 0.4); ok(B.campObjectives().find(o => o.id === 'b1').state === 'failed' && !B.G.over, 'a failing BONUS objective is allowed: the mission goes on');
  const init = B.__run('globalThis.__campEv').filter(e => e.type === 'obj' && e.init); ok(init.length === 3 && init.every(e => e.state === 'active'), 'objectives visible at the start emit init events');
});
group('objectives: a failing primary loses the mission', () => {
  const A = game(F.missions.objFail); run(A, 1); ok(!A.G.over, 'running');
  A.campDo(['flag', 'p1fail', true]); run(A, 0.4);
  ok(A.G.over === 'defeat' && K(A).result.reason === 'objective:p1', 'primary objective failed -> defeat, reason objective:p1');
  eq(K(A).result.objectives.map(o => [o.id, o.state]), [['p1', 'failed'], ['b1', 'active']], 'the result lists the objective states');
});

/* ========================================================= WIN / LOSE / STARS */
group('win / lose / defaults', () => {
  let A = game(mk('w1', {})); run(A, 1); A.campDo(['flag', 'done', true]); run(A, 0.4); ok(A.G.over === 'victory' && K(A).result.reason === 'win', 'win condition');
  A = game(mk('w2', { lose: ['res', 'c', '<', 10] })); run(A, 1); T(A).c = 0; run(A, 0.4); ok(A.G.over === 'defeat' && K(A).result.reason === 'lose', 'lose condition');
  A = game(mk('w3', { lose: ['flag', 'bad'] })); A.campDo(['flag', 'done', true]); A.campDo(['flag', 'bad', true]); run(A, 0.4); ok(A.G.over === 'victory', 'win and lose true in the same pass: victory takes precedence');
  /* default rules */
  A = game(mk('d1', {})); run(A, 1); for (const b of A.G.buildings.filter(b => b.team === 1)) A.kill(b, 0);
  ok(A.G.over === 'victory' && K(A).result.reason === 'structures', 'default rule: destroying every enemy structure wins (reason "structures")');
  A = game(mk('d2', { noDefaultWin: true })); run(A, 1); for (const b of A.G.buildings.filter(b => b.team === 1)) A.kill(b, 0); run(A, 1); ok(!A.G.over && A.campNoDefaultEnd(1) === true && A.campNoDefaultEnd(0) === false, 'noDefaultWin: the same event does not end the mission');
  A = game(mk('d3', {})); run(A, 1); for (const b of A.G.buildings.filter(b => b.team === 0)) A.kill(b, 1);
  ok(A.G.over === 'defeat' && K(A).result.reason === 'structures', 'default rule: losing every structure loses');
  A = game(mk('d4', { noDefaultLose: true })); run(A, 1); for (const b of A.G.buildings.filter(b => b.team === 0)) A.kill(b, 1);
  run(A, 3); ok(!A.G.over && A.campNoDefaultEnd(0) === true, 'noDefaultLose: no defeat from losing all structures, nor from the hub-and-army wipe-out');
  A = game(mk('d5', { setup: { start: { buildings: [{ type: 'turret', tx: 16, ty: 72 }] } } })); run(A, 1);
  A.kill(hubOf(A, 0), 1); run(A, 1); ok(!A.G.over, 'no hub left but workers alive (a turret stands): the mission goes on');
  A.campDo(['spawn', 'me', 'rifleman', 1, 'base']); for (const u of alive(A, 0)) if (u.def.worker) A.kill(u, 1); run(A, 1); ok(!A.G.over, 'no hub, no workers but an army unit left: still not a wipe-out');
  for (const u of alive(A, 0)) A.kill(u, 1);
  run(A, 0.4); ok(A.G.over === 'defeat' && K(A).result.reason === 'wipeout', 'hub, army and workers all gone (a turret still stands) -> defeat "wipeout"');
  A = game(mk('d6', { setup: { start: { buildings: [{ type: 'turret', tx: 16, ty: 72 }] } } })); A.endGame('defeat');
  ok(K(A).result.reason === 'surrender', 'endGame("defeat") with structures alive (the Surrender button) is recorded as "surrender"');
});
group('stars: 1 win, +1 all bonus objectives, +1 under par', () => {
  const play = (bonus, secs, win = true, extra) => { const A = game(mk('s', Object.assign({ stars: { par: 60 } }, extra || {}))); run(A, secs); if (bonus) A.campDo(['flag', 'bonus', true]); if (win) A.campDo(['flag', 'done', true]); else A.endGame('defeat'); run(A, 0.5); return K(A).result; };
  eq(play(true, 20).stars, 3, 'win + bonus + under par = 3 stars');
  eq(play(false, 20).stars, 2, 'win + under par, no bonus = 2 stars');
  eq(play(true, 70).stars, 2, 'win + bonus, over par = 2 stars');
  eq(play(false, 70).stars, 1, 'win only = 1 star');
  eq(play(true, 20, false).stars, 0, 'a defeat earns no stars');
  const r = play(true, 20); ok(r.win && r.res === 'victory' && r.bonusDone === 1 && r.bonusTotal === 1 && r.par === 60 && r.t > 19 && r.t < 22 && r.diff === 'normal', 'result: win, res, bonusDone/Total, par, t, diff');
  eq(r.objectives.map(o => [o.id, o.state]), [['p1', 'done'], ['b1', 'done']], 'result.objectives');
  const nb = play(false, 20, true, { objectives: [{ id: 'p1', kind: 'primary', text: 'P', when: null, done: ['flag', 'done'], fail: null }, { id: 'p2', kind: 'primary', text: 'P2', when: null, done: ['flag', 'done'], fail: null }] });
  eq(nb.stars, 3, 'a mission without bonus objectives grants the bonus star (vacuously)');
  eq(play(true, 20, true, { stars: {} }).stars, 2, 'no stars.par: the speed star cannot be earned');
  const A = game(mk('s2', {})); ok(K(A).result === null, 'no result while playing'); A.campDo(['flag', 'done', true]); run(A, 0.4); const ev = A.__run('globalThis.__campEv').filter(e => e.type === 'end'); ok(ev.length === 1 && ev[0].res === 'victory' && ev[0].stars >= 1, 'an end event is delivered');
});

/* ================================================== DISPATCHES (hold/resume) */
group('dispatch: blocking hold / resume protocol', () => {
  const A = game(F.missions.dispatch, { opts: { autoResume: false } }), c = K(A), G = A.G;
  run(A, 1.3); ok(c.errors.some(e => /unknown dispatch "no_such_dispatch"/.test(e)) && !c.hold && flag(A, 'after_baddispatch'), 'an unknown dispatch id is logged and skipped: it never freezes the game');
  A.__run('globalThis.__campEv=[]'); run(A, 1);
  ok(c.hold === true && c.pendingDispatch === 'ops_dispatch', 'dispatch: hold is set and the first dispatch is pending');
  const ev = A.__run('globalThis.__campEv'); ok(ev.filter(e => e.type === 'dispatch').length === 1 && ev[0].id === 'ops_dispatch' && ev[0].hold === true, 'only the first dispatch event is delivered; the second waits for the resume');
  ok(flag(A, 'after_dispatch') && c.radio.some(r => r.id === 'r1'), 'the other actions of that trigger already ran');
  const tk = G.tick, tm = G.time, ct = c.t; ticks(A, 90);
  ok(G.tick === tk && G.time === tm && c.t === ct, 'the world stands still while held (step() returns at once): tick, time and mission time unchanged');
  ok(A.campaignResume('wrong') === false && c.hold === true, 'a resume for another id is ignored');
  ok(A.campaignResume('ops_dispatch') === true && c.hold === true && c.pendingDispatch === 'ops_dispatch2', 'resume: the second dispatch of the queue becomes pending and is announced');
  ok(A.__run('globalThis.__campEv').filter(e => e.type === 'dispatch').map(e => e.id).join() === 'ops_dispatch,ops_dispatch2', 'the second dispatch event is delivered on the first resume');
  ok(A.campaignResume() === true && c.hold === false && c.pendingDispatch === null, 'resume() without an id resumes the current one: hold released');
  ok(A.campaignResume() === false, 'resume when nothing is held returns false');
  ticks(A, 12); ok(G.tick === tk + 12 && !flag(A, 't3'), 'time runs again'); run(A, 1); ok(flag(A, 't3'), 'later triggers (time >= 3) fire only after the hold');
  const B = game(F.missions.dispatch, { opts: { autoResume: true } }); run(B, 2.4);
  ok(B.G.camp.hold === false && B.__run('globalThis.__campEv').filter(e => e.type === 'dispatch').length === 2 && B.G.camp.fired.c1 === 1, 'autoResume (headless tests): dispatch events are delivered but nothing is held');
  const C = game(F.missions.dispatch, { opts: { autoResume: false } }); let seen = 0;
  C.__run('onCampaignEvent=function(e){globalThis.__campEv.push(e);if(e.type==="dispatch")campaignResume(e.id);}'); C.__run('globalThis.__campEv=[]'); run(C, 3.5);
  ok(!C.G.camp.hold && flag(C, 't3') && C.__run('globalThis.__campEv').filter(e => e.type === 'dispatch').length === 2, 'a UI that resumes synchronously from inside onCampaignEvent works (re-entrancy)');
});

/* ======================================================= MALFORMED DATA */
group('malformed data never crashes: logged once, evaluates false', () => {
  const A = game(F.missions.malformed), c = K(A); let exc = null;
  try { run(A, 20); } catch (e) { exc = e; }
  ok(!exc, 'a mission full of malformed conditions / actions / setup runs 20 s without throwing' + (exc ? ' -> ' + exc.message : ''));
  ok(flag(A, 'survived') && !flag(A, 'x'), 'the valid trigger fires; no malformed trigger ever fires');
  const n = c.errors.length; ok(n >= 60 && n < 200, 'every distinct problem is logged (' + n + ' errors)');
  run(A, 20); eq(c.errors.length, n, 'errors are logged ONCE: 20 more seconds add nothing');
  ok(new Set(c.errors).size === c.errors.length, 'no duplicate messages');
  const has = (re) => c.errors.some(e => re.test(e));
  ok(has(/unknown condition op "bogus"/) && has(/side must be "me" or "enemy"/) && has(/unknown comparison "~"/) && has(/unknown objective "missing"/) && has(/unknown tech "magic"/) && has(/unknown action op "bogus"/) && has(/spawn order must be/) && has(/hero units are not placed/) && has(/cannot place turret/) && has(/unknown difficulty/), 'representative messages are present and readable');
  ok(!A.campEvalCond(['flag']) && !A.campEvalCond(null) && !A.campEvalCond('x') && !A.campEvalCond(['count']) && !A.campEvalCond(['not', ['bogus']]), 'malformed conditions evaluate false through the public evaluator (and `not` of garbage is not true)');
  ok(A.campDo(['bogus']) === false && A.campDo(['flag', 'y', true]) === true, 'campDo reports success / failure');
  const I = game(F.missions.malformed); ok(T(I).c === 500 && T(I).era === 1 && K(I).heroPolicy === 'available' && K(I).supplyBonus === 0 && I.G.diff === 'normal', 'invalid setup values are ignored and leave the defaults (c, era, hero policy, supply bonus, difficulty)');
  ok(K(I).errors.some(e => /unknown difficulty/.test(e)) && alive(I, 0, 'rifleman').length === 0 && K(I).locks.building.nope === undefined, 'bad entries create nothing');
  /* whole-mission garbage */
  for (const bad of [5, 'x', [], {}, { setup: 5, objectives: 'x', triggers: {}, win: 3 }, { setup: { start: 5, restrict: 'x', foe: 3, flags: 4 }, objectives: [null], triggers: [{ when: 5, do: [] }] }]) {
    const B = game(bad); let e2 = null; try { run(B, 2); } catch (e) { e2 = e; }
    ok(!e2 && K(B) && Array.isArray(K(B).errors) && !B.G.over, 'garbage mission ' + JSON.stringify(bad) + ' does not crash and the game runs on');
  }
  for (const bad of [null, undefined]) { const B = game(bad); let e2 = null; try { run(B, 1); } catch (e) { e2 = e; } ok(!e2 && K(B) === undefined, 'newGame({campaign:' + bad + '}) is just a plain game'); }
  { process.env.RS = '7'; const P = load(SRC); P.newGame({ seed: 1101 }); P.campaignInit(null, {}); ok(P.G.camp.errors.some(e => /mission data must be an object/.test(e)), 'campaignInit(null) on a plain game is reported, not thrown'); run(P, 1); }
  const D = game(mk('u', { triggers: [{ id: 't', when: ['time', '>=', 0.4], do: [['radio', 'r1']] }] })); D.G.camp.m.triggers.push(undefined, null, 5, 'x'); run(D, 1); ok(K(D).fired.t === 1, 'junk entries inside the trigger list are skipped');
  const E = game(mk('v', {})); E.__run('onCampaignEvent=function(){throw new Error("ui broke")}'); E.campDo(['radio', 'r1']); ok(K(E).errors.some(x => /onCampaignEvent: threw ui broke/.test(x)), 'a throwing UI callback cannot break the simulation');
});

/* ====================================================== DETERMINISM / INERT */
group('determinism: same seed + same input -> identical state hash incl. G.camp', () => {
  const play = (rs) => {
    const A = game(F.missions.setup, { rs, opts: { diff: 'normal' } }), G = A.G;
    for (let i = 0; i < 3600; i++) {
      if (i === 100) { const h = alive(A, 0, 'hauler')[0], sp = findSpot(A, 'generator', 0); A.orderBuild(h, 'generator', sp.tx, sp.ty); }
      if (i === 200) A.campDo(['spawn', 'enemy', 'raptor', 4, 'edge:W', { order: 'attack' }]);
      if (i === 300) A.campDo(['strike', 20, 70, 4, 200, 3, 'alert', 'enemy']);
      if (i === 400) A.campDo(['flag', 'go', true]);
      if (i === 450) A.campDo(['reveal', 60, 40, 5]);
      A.step();
    }
    return { h: hash(A), A };
  };
  const a = play(7), b = play(7), c = play(99);
  ok(a.h === b.h, 'two runs with the same seed, Math.random stream and scripted input are bit-identical (' + a.h + ' vs ' + b.h + ')');
  ok(a.A.G.camp.events.length > 3 && Object.keys(a.A.G.camp.flags).length > 0, 'the hash covers real campaign state (' + a.A.G.camp.events.length + ' events)');
  console.log('info  a different Math.random stream gives hash ' + c.h + (c.h === a.h ? ' (same)' : ' (different: the AI still uses Math.random, see BACKLOG B-20)'));
});
group('inert: a mission that changes nothing equals a plain newGame with the swarm off', () => {
  const sig = (A) => { const G = A.G, E = G.teams[1]; return [Math.round(E.c), Math.round(E.e), E.used, E.cap, E.kills, E.lost, G.units.filter(u => !u.dead && u.team === 1).length, G.buildings.filter(b => !b.dead && b.team === 1).length, G.units.filter(u => !u.dead && u.team === 0).length, Math.round(G.teams[0].c)].join(','); };
  for (const seed of [1101, 1102]) {
    const m = F.missions.plain; m.setup.seed = seed;
    const camp = game(m, { rs: 5 }); for (let i = 0; i < 4500; i++) camp.step();
    process.env.RS = '5'; const plain = load(SRC); plain.newGame({ seed, faction: 'meridian', enemy: 'obsidian', diff: 'normal', aiKind: 'v3' });  /* campaigns keep the v3 AI, so the plain game must use it too */ plain.__run('G.sw&&(G.sw.on=false)'); for (let i = 0; i < 4500; i++) plain.step();
    ok(hash(plain) !== undefined && sig(camp) === sig(plain), `seed ${seed}: campaign(swarm off, no events) == plain game, swarm off, after 150 s (${sig(camp)})`);
    const strip = (A) => { const G = A.G; let h = 0; for (const u of G.units) h = (h * 31 + Math.round(u.x * 10) + Math.round(u.y * 10) * 7 + Math.round(u.hp)) >>> 0; for (const b of G.buildings) h = (h * 31 + Math.round(b.hp)) >>> 0; return h + ':' + G.nextId; };
    ok(strip(camp) === strip(plain), `seed ${seed}: every unit position / hp / building hp is identical too (${strip(camp)})`);
    ok(camp.G.camp.errors.length === 0 && camp.G.sw.agents.length === 0 && camp.G.sw.on === false, 'swarm off: no agents, G.sw.on false, no campaign errors');
  }
  /* and against the v2 baseline, like smoke.js does for the plain game */
  const loadV2 = require('./simlibv2.js'), sig2 = (A) => { const G = A.G, E = G.teams[1]; return [Math.round(E.c), Math.round(E.e), E.used, E.cap, E.kills, E.lost, G.units.filter(u => !u.dead && u.team === 1).length, G.buildings.filter(b => !b.dead && b.team === 1).length].join(','); };
  process.env.RS = '5'; const v2 = loadV2(); v2.newGame({ seed: 1101, diff: 'normal', faction: 'meridian', enemy: 'obsidian' }); for (let i = 0; i < 300 * 30; i++) v2.step();
  const m = F.missions.plain; m.setup.seed = 1101; const camp = game(m, { rs: 5 }); for (let i = 0; i < 300 * 30; i++) camp.step();
  ok(sig2(v2) === sig2(camp), 'swarm-off mission == v2 baseline on the enemy side after 300 s (' + sig2(camp) + ')');
});
group('hooks: no campaign -> the base sim does not know the campaign exists', () => {
  process.env.RS = '5'; const A = load(SRC); A.newGame({ seed: 4, faction: 'meridian', enemy: 'obsidian' });
  ok(A.G.camp === undefined, 'no G.camp without opts.campaign'); ticks(A, 300);
  ok(A.campLocked(0, 'building', 'hub') === null && A.campaignSummary() === null && A.campObjectives().length === 0 && A.campaignDrainEvents().length === 0 && A.campEvalCond(['flag', 'x']) === false && A.campDo(['flag', 'x', true]) === false && A.campaignResume() === false, 'every API function is safe to call without a campaign');
  ok(A.reqBuild(0, 'generator').ok, 'reqBuild unaffected');
});

/* ================================================================ INTEGRATION */
group('integration: hero training counts as trained; summary shape; aiBoth keeps the swarm off', () => {
  const A = game(mk('i_hero', { setup: { start: { hero: 'available' } }, triggers: trig(['trained', 'hero_idris', '>=', 1]) })), hub = hubOf(A, 0); T(A).c = 1000; T(A).e = 500;
  ok(A.queueHero(hub) === true, 'a hero is trainable under policy "available"'); run(A, 40);
  ok(A.campEvalCond(['trained', 'hero_idris', '==', 1]) && A.campEvalCond(['hero', 'alive']) && flag(A, 'hit'), 'trained hero_idris counts the trained hero (t=' + A.G.time.toFixed(0) + ' s)');
  const s = A.campaignSummary(), j = JSON.parse(JSON.stringify(s)); eq(j, s, 'campaignSummary is JSON-able');
  ok(s.id === 'i_hero' && typeof s.t === 'number' && s.hold === false && s.over === false && s.result === null && Array.isArray(s.objectives) && s.locks && s.errors.length === 0 && s.trained.hero_idris === 1 && s.fired.t === 1, 'campaignSummary fields');
  const B = game(F.missions.setup, { opts: { aiBoth: true } }); ok(B.G.ais[0] && B.G.sw.on === false, 'aiBoth: swarm stays off even when the mission says "on" (the AI plays the player side)');
  let exc = null; try { run(B, 20); } catch (e) { exc = e; } ok(!exc && K(B).errors.length === 0, 'a mission runs with the AI on both sides');
});
group('integration: story_min missions play out with the built-in AI on both sides', () => {
  const S = makeStory(), out = [];
  for (const idx of [0, 3]) {
    const m = S.missions[idx]; process.env.RS = '7'; const A = load(SRC); Object.assign(A.STORY.dispatch, S.dispatch); Object.assign(A.STORY.radio, S.radio);
    A.newGame({ campaign: m, aiBoth: true, autoResume: true }); let exc = null;
    try { for (let i = 0; i < 30 * 60 * 8 && !A.G.over; i++) A.step(); } catch (e) { exc = e; }
    const c = K(A);
    ok(!exc, m.id + ': 8 game-minutes without an exception' + (exc ? ' -> ' + exc.stack : ''));
    eq(c.errors, [], m.id + ': a valid mission logs no data errors');
    ok(c.fired.t1 === 1 && flag(A, 'started') && c.radio.some(r => r.id === m.triggers[0].do[0][1]), m.id + ': the 5 s trigger fired (radio + flag)');
    ok(c.fired.t2 === 1 && A.__run('G.units.some(u=>u.team===1)'), m.id + ': the 60 s wave trigger fired');
    ok(c.fired.t3 === 1 && c.fired.t4 === 1 && A.campLocked(0, 'building', 'foundry') === null, m.id + ': army>=8 and era>=2 triggers fired; the era-2 trigger unlocked the foundry (' + JSON.stringify(c.fired) + ')');
    ok(!A.G.over || (c.result && ['victory', 'defeat'].includes(c.result.res) && c.result.stars >= 0 && c.result.stars <= 3), m.id + ': if it ended, the result is complete (' + (A.G.over || 'still running') + ')');
    out.push(m.id + ':' + (A.G.over || 'running') + '@' + Math.round(A.G.time) + 's');
  }
  console.log('info  story_min with AI on both sides: ' + out.join(', '));
});

/* ============================================================= SAVE HELPERS */
group('save: emptyCampaignSave / sanitize / update / canPlay / read / write', () => {
  const S = makeStory(), ids = S.missions.map(m => m.id), A = load(SRC);
  const E = A.emptyCampaignSave(); eq(E, { v: 1, done: {}, seen: {}, last: null, diff: 'normal' }, 'emptyCampaignSave shape'); ok(A.emptyCampaignSave() !== E, 'a fresh object each time');
  /* sanitize */
  for (const raw of [null, undefined, 5, 'x', [], {}, { v: 2 }, { v: 1, done: 5, seen: 'x', last: 7, diff: 'ultra' }]) eq(A.campaignSaveSanitize(raw), E, 'sanitize(' + JSON.stringify(raw) + ') -> an empty save');
  const dirty = A.campaignSaveSanitize({ v: 1, done: { m01: { stars: 9, best: -3, diff: 'hard' }, 'bad id!': { stars: 1 }, m02: { stars: 'x', best: null }, m03: 5, m04: { stars: 2.7, best: 812.4 } }, seen: { a: 1, b: 0, 'c d': 1 }, last: 'm03', diff: 'easy' });
  eq(dirty, { v: 1, done: { m01: { stars: 3, best: null, diff: 'hard' }, m02: { stars: 0, best: null, diff: 'normal' }, m04: { stars: 2, best: 812, diff: 'normal' } }, seen: { a: true }, last: 'm03', diff: 'easy' }, 'sanitize repairs / drops corrupt parts');
  /* update */
  const frozen = JSON.parse(JSON.stringify(E)), r1 = A.campaignSaveUpdate(E, 'm01', { res: 'victory', stars: 2, t: 812.4, diff: 'normal' }, S);
  eq(E, frozen, 'campaignSaveUpdate never mutates its input');
  eq(r1, { v: 1, done: { m01: { stars: 2, best: 812, diff: 'normal' } }, seen: {}, last: 'm02', diff: 'normal' }, 'first victory: stars, rounded best time, next mission unlocked');
  const r2 = A.campaignSaveUpdate(r1, 'm01', { res: 'victory', stars: 3, t: 700, diff: 'hard' }, S);
  eq(r2.done.m01, { stars: 3, best: 700, diff: 'hard' }, 'a better run raises stars, lowers best time, takes its difficulty'); eq(r2.last, 'm02', 'replaying an old mission does not move `last`');
  const r3 = A.campaignSaveUpdate(r2, 'm01', { res: 'victory', stars: 1, t: 900, diff: 'easy' }, S);
  eq(r3.done.m01, { stars: 3, best: 700, diff: 'hard' }, 'a worse run changes nothing (stars max-merge, best time minimum, diff of the best run)');
  const r4 = A.campaignSaveUpdate(r3, 'm01', { res: 'victory', stars: 3, t: 650, diff: 'easy' }, S); eq(r4.done.m01, { stars: 3, best: 650, diff: 'hard' }, 'a faster run at equal stars lowers the time and keeps the difficulty of the starred run');
  eq(A.campaignSaveUpdate(r3, 'm02', { res: 'defeat', stars: 0, t: 100 }, S), r3, 'a defeat changes nothing'); eq(A.campaignSaveUpdate(r3, 'm02', null, S), r3, 'a missing result changes nothing'); eq(A.campaignSaveUpdate(r3, '', { res: 'victory', stars: 1, t: 1 }, S), r3, 'an empty mission id changes nothing');
  eq(A.campaignSaveUpdate(r3, 'm02', { win: true, stars: 0, t: 'x' }, S).done.m02, { stars: 1, best: null, diff: 'normal' }, 'a victory is at least one star; a bad time is dropped (best null)');
  let s = E; ids.forEach((id, i) => { s = A.campaignSaveUpdate(s, id, { res: 'victory', stars: 1, t: 100 + i, diff: 'normal' }, S); });
  eq(s.last, 'm09', 'finishing the last mission keeps `last` on it'); eq(Object.keys(s.done), ids, 'all nine done');
  eq(A.campaignNextId('m09', S), null, 'no next mission after the last'); eq(A.campaignNextId('m03', S), 'm04', 'campaignNextId follows unlocks.next'); eq(A.campaignNextId('nope', S), null, '... null for an unknown id');
  const S2 = makeStory(); delete S2.missions[1].unlocks; eq(A.campaignNextId('m02', S2), 'm03', 'without unlocks.next the next mission in order');
  /* canPlay */
  ok(A.campaignCanPlay(E, 'm01', S) && !A.campaignCanPlay(E, 'm02', S) && !A.campaignCanPlay(E, 'm09', S), 'fresh save: only the first mission is playable');
  ok(A.campaignCanPlay(r1, 'm02', S) && !A.campaignCanPlay(r1, 'm03', S), 'after m01: m02 unlocked, m03 not');
  ok(A.campaignCanPlay(r1, 'm01', S), 'a done mission is replayable'); ok(!A.campaignCanPlay(E, 'nope', S) && !A.campaignCanPlay(null, 'm05', S) && A.campaignCanPlay('garbage', 'm01', S), 'unknown ids are not playable; a corrupt save behaves like an empty one');
  ok(A.campaignCanPlay({ v: 1, done: {}, seen: {}, last: 'm05', diff: 'normal' }, 'm05', S), 'the `last` mission is playable');
  /* read / write */
  const store = {}, fake = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } };
  eq(A.campaignSaveRead(fake), E, 'read from an empty store -> empty save'); ok(A.campaignSaveWrite(r2, fake) === true && A.CAMP_SAVEKEY in store, 'write stores under CAMP_SAVEKEY'); eq(A.campaignSaveRead(fake), r2, 'read returns what was written');
  store[A.CAMP_SAVEKEY] = '{not json'; eq(A.campaignSaveRead(fake), E, 'corrupt JSON in the store -> empty save, never thrown'); store[A.CAMP_SAVEKEY] = '{"v":1,"done":{"m01":{"stars":99}}}'; eq(A.campaignSaveRead(fake).done.m01.stars, 3, 'a hostile value is clamped');
  ok(A.campaignSaveWrite(r2, { setItem() { throw new Error('quota'); } }) === false && A.campaignSaveRead({ getItem() { throw new Error('denied'); } }) !== null, 'storage errors are swallowed');
});

console.log(`\n${passes} checks passed, ${fails} failed`);
console.log(fails ? `${fails} FAILURE(S)` : 'ALL CAMPAIGN CHECKS PASSED');
process.exit(fails ? 1 : 0);
