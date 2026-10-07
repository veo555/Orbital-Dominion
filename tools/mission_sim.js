#!/usr/bin/env node
/* Headless MISSION SIMULATOR: plays a campaign mission with the built-in AI controlling the PLAYER side and reports what happened.
     node tools/mission_sim.js <missionId|id,id|all> [--runs N] [--diff easy|normal|hard] [--cap SECONDS] [--json file] [--story path]
                               [--jobs N] [--det-cap SECONDS] [--no-det] [--wall SECONDS] [--rs-base N] [--optional id,id] [--quiet] [--progress]
   Every run is  newGame({campaign:mission, aiBoth:true, autoResume:true})  (the player's team 0 is driven by makeAI, exactly like the attract-mode demo),
   with a different seeded Math.random stream per run (tests/sim/simlib3.js: the RS env var; the map itself comes from the mission's fixed seed).
   Per mission it reports: win / defeat / stalled (no result by the cap) / crash rates (+ Wilson 95 % interval), win-time median/p10/p90, which triggers fired
   (fraction of runs, median time, lateness against the statically derived schedule), which objectives completed, the stars distribution, G.camp.errors,
   scripted spawns / strikes / unlocks (did they happen, land, take effect) and determinism (run 0 replayed in a second process: identical state hashes).
   `--story <file>`: a module exporting a story object (or a function returning one) with {missions,cine,radio}, e.g. tests/fixtures/story_min.js. Default: src/js/44_story_*.js.
   `SRC=<dir>`: load the simulation from another source tree (the mutation checks use this).
   THE AI IS A PROXY FOR A HUMAN: it plays a plain skirmish and knows nothing about scripted objectives. The numbers are sanity bounds, not a difficulty guarantee.
   Speed: ~1.5-2.5 k ticks/s per worker with --max-semi-space-size=64 (a 900 s mission ~ 15-25 s); the pool uses (CPUs - 1) worker processes. */
'use strict';
const path = require('path'), os = require('os'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const SIMLIB = path.join(ROOT, 'tests', 'sim', 'simlib3.js');
const STORYLIB = path.join(ROOT, 'tests', 'sim', 'storylib.js');
const TICK_HZ = 30, CHECK_TICKS = 900;                    // determinism checkpoints every 30 s of game time
const DEFAULTS = { runs: 8, detCap: 300, wall: 900 };

/* ----------------------------------------------------------------------------- small utils */
const clone = (o) => o === undefined ? undefined : JSON.parse(JSON.stringify(o));
const isArr = Array.isArray, isNum = (x) => typeof x === 'number' && isFinite(x), isStr = (x) => typeof x === 'string' && x.length > 0;
function pct(arr, p) {
  if (!arr.length) return null;
  const a = arr.slice().sort((x, y) => x - y); if (a.length === 1) return a[0];
  const i = (a.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return a[lo] + (a[hi] - a[lo]) * (i - lo);
}
function wilson(k, n, z) {                                  // Wilson score interval for a proportion (honest about tiny samples)
  z = z || 1.96; if (!n) return [0, 1];
  const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [Math.max(0, (c - h) / d), Math.min(1, (c + h) / d)];
}
function strHash(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }
function runSeed(id, run, base) {                           // the (non-zero) Math.random seed of one run: scattered, never 0
  let x = (strHash(String(id)) ^ Math.imul((run | 0) + 1, 0x9E3779B1) ^ Math.imul((base | 0) + 1, 0x85EBCA6B)) >>> 0;
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d) >>> 0; x ^= x >>> 15; return (x >>> 0) || 1;
}
const r1 = (x) => x === null || x === undefined ? null : Math.round(x * 10) / 10;
function defaultCap(m) {                                    // game seconds before a run counts as "stalled": 2 x par (a human gets 3 stars at par; the AI is slower), 600..2400 s
  const par = m && m.stars && m.stars.par;
  return Math.round(isNum(par) && par > 0 ? Math.min(2400, Math.max(600, par * 2)) : 1200);
}

/* ----------------------------------------------------------------------------- story access */
/* returns {missions,cine,radio,external}. `external` = the story came from --story (it replaces the one in the sandbox); otherwise it is src/js/44_story_*.js */
function loadStoryData(storyPath, src) {
  if (storyPath) {
    const m = require(path.resolve(storyPath)), s = typeof m === 'function' ? m() : m;
    return { missions: s.missions || [], cine: s.cine || {}, radio: s.radio || {}, external: true, raw: s };
  }
  const L = require(STORYLIB)(src || process.env.SRC || undefined), s = L.STORY;
  return { missions: s.missions || [], cine: s.cine || {}, radio: s.radio || {}, external: false, raw: s };
}
function injectStory(A, S) {
  if (!S.external) return;
  const st = A.STORY;
  for (const k of Object.keys(st.cine)) delete st.cine[k];
  for (const k of Object.keys(st.radio)) delete st.radio[k];
  Object.assign(st.cine, clone(S.cine)); Object.assign(st.radio, clone(S.radio));
  st.missions.length = 0; for (const m of S.missions) st.missions.push(clone(m));
}

/* ----------------------------------------------------------------------------- static schedule model */
/* When is a trigger EXPECTED to fire, if that is decided by the clock alone? Walks `time` / `flag` / `after` / `all` / `any` / `obj done` conditions through
   flags that are set by other clock-driven triggers. Returns null whenever anything player-dependent (units, resources, positions ...) is involved.
   Used by the balance gate (scripted waves must arrive on time) and by tools/mission_check.js (par vs. earliest possible win). */
function scheduleModel(m) {
  const trig = isArr(m && m.triggers) ? m.triggers : [], objs = isArr(m && m.objectives) ? m.objectives : [];
  const setters = {}, clearers = new Set(), init = (m && m.setup && m.setup.flags) || {};
  for (const t of trig) if (t && isArr(t.do)) for (const a of t.do) if (isArr(a) && a[0] === 'flag' && isStr(a[1])) { if (a[2] === true) (setters[a[1]] = setters[a[1]] || []).push(t); else clearers.add(a[1]); }
  const memo = new Map(), busy = new Set();
  function cond(c) {
    if (!isArr(c) || !isStr(c[0])) return null;
    switch (c[0]) {
      case 'time': return (c[1] === '>=' || c[1] === '>' || c[1] === '==') && isNum(c[2]) ? c[2] : null;
      case 'flag': return flagTime(c[1]);
      case 'after': { const f = flagTime(c[1]); return f === null || !isNum(c[2]) ? null : f + c[2]; }
      case 'all': { let mx = 0; for (let i = 1; i < c.length; i++) { const v = cond(c[i]); if (v === null) return null; mx = Math.max(mx, v); } return c.length > 1 ? mx : null; }
      case 'any': { let mn = Infinity; for (let i = 1; i < c.length; i++) { const v = cond(c[i]); if (v === null) return null; mn = Math.min(mn, v); } return mn === Infinity ? null : mn; }
      case 'obj': { if (c[2] !== 'done') return null; const o = objs.find(x => x && x.id === c[1]); return o ? cond(o.done) : null; }
    }
    return null;
  }
  function flagTime(f) {
    if (!isStr(f) || clearers.has(f)) return null;
    let best = init[f] ? 0 : Infinity;
    for (const t of setters[f] || []) { const x = trigTime(t); if (x === null) return null; best = Math.min(best, x); }
    return best === Infinity ? null : best;
  }
  function trigTime(t) {
    if (memo.has(t)) return memo.get(t);
    if (busy.has(t)) return null; busy.add(t);
    const w = cond(t.when), v = w === null ? null : w + (isNum(t.delay) && t.delay > 0 ? t.delay : 0);
    busy.delete(t); memo.set(t, v); return v;
  }
  return {
    cond, flagTime,
    trigger: (i) => (trig[i] && typeof trig[i] === 'object') ? trigTime(trig[i]) : null,                 // expected first firing (mission seconds) or null
    every: (i) => { const t = trig[i]; return t && isNum(t.every) && t.every > 0 ? t.every : 0; }
  };
}

/* ----------------------------------------------------------------------------- state hash (bit-exact reproducibility) */
function stateHash(A) {
  const G = A.G; let h = 2166136261 >>> 0;
  const mix = (v) => { const s = String(typeof v === 'number' ? Math.round(v * 1000) : v); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } };
  mix(G.tick); mix(G.time);
  for (const t of G.teams) for (const k of ['c', 'e', 'used', 'cap', 'kills', 'lost', 'era', 'mined', 'built', 'morale']) mix(t[k] || 0);
  for (const u of G.units) { mix(u.id); mix(u.type); mix(u.team); mix(u.x); mix(u.y); mix(u.hp); mix(u.order.t); mix(u.dead ? 1 : 0); }
  for (const b of G.buildings) { mix(b.id); mix(b.type); mix(b.team); mix(b.hp); mix(b.done ? 1 : 0); mix(b.queue.length); }
  for (const z of G.zones) { mix(z.x); mix(z.y); mix(z.t); mix(z.team); }
  for (const a of G.ais) if (a) { mix(a.wave); mix(a.attacking ? 1 : 0); mix(a.P.base); }
  if (G.camp) { const c = Object.assign({}, G.camp); delete c.m; delete c.errSeen; delete c.aiBase; mix(JSON.stringify(c)); }
  return h.toString(16);
}

/* ----------------------------------------------------------------------------- ONE RUN */
/* spec: {mission, run, diff?, capSec, wallSec?, rsBase?, src?}  ->  a JSON-able record (see the fields below) */
function playRun(S, spec) {
  const t0 = Date.now(), m0 = S.missions.find(m => m && m.id === spec.mission);
  const rec = { mission: spec.mission, run: spec.run, rs: 0, res: 'crash', reason: null, t: 0, ticks: 0, wallMs: 0, stars: 0, bonus: [0, 0], par: null, diff: null,
    objs: {}, primaryOpen: [], fire: {}, errors: [], spawns: [], strikes: [], unlocks: [], unlockBad: [], radio: 0, evCount: {}, hashes: {}, k: [0, 0], l: [0, 0], crash: null, wall: false };
  if (!m0) { rec.crash = 'unknown mission ' + spec.mission; return rec; }
  const mission = clone(m0);
  rec.rs = runSeed(spec.mission, spec.run, spec.rsBase);
  process.env.RS = String(rec.rs);
  let A;
  try {
    A = require(SIMLIB)(spec.src || process.env.SRC || undefined);
    injectStory(A, S);
    A.newGame(Object.assign({ campaign: mission, aiBoth: true, autoResume: true }, spec.diff ? { diff: spec.diff } : {}));
  } catch (e) { rec.crash = 'newGame: ' + String(e && e.stack || e).split('\n').slice(0, 3).join(' | '); rec.wallMs = Date.now() - t0; return rec; }
  const G = A.G, K = G.camp, TILE = A.TILE, maxTicks = Math.ceil(spec.capSec * TICK_HZ), wallMs = (spec.wallSec || DEFAULTS.wall) * 1000;
  const heroId = A.FACTIONS[G.teams[0].faction].hero;
  const shadow = { b: new Set(Object.keys(K.locks.building)), u: new Set(Object.keys(K.locks.unit)), maxEra: K.maxEra, hero: K.heroPolicy === 'none' };
  const pendingStrikes = []; let evSeen = 0, firedSeen = {};
  const hyp = Math.hypot;
  const evArr = () => A.sandbox.__campEv || [];                 // simlib3's onCampaignEvent stub collects every event here (never truncated)

  function handleEvents(idBefore) {
    const arr = evArr(); if (evSeen >= arr.length) return;
    const fresh = arr.slice(evSeen); evSeen = arr.length;
    const touched = new Map();
    for (const e of fresh) {
      rec.evCount[e.type] = (rec.evCount[e.type] || 0) + 1;
      if (e.type === 'radio') rec.radio++;
      else if (e.type === 'spawn') {
        const team = e.side === 'me' ? 0 : 1;
        let made = 0; for (const u of G.units) if (u.id >= idBefore && u.team === team && u.type === e.utype) made++;
        rec.spawns.push({ t: r1(e.t), side: e.side, utype: e.utype, n: e.n, where: e.where, order: e.order, made, idBefore });
      } else if (e.type === 'strike') {
        const px = (e.tx + 0.5) * TILE, py = (e.ty + 0.5) * TILE, R = e.r * TILE;
        let zone = null; for (let i = G.zones.length - 1; i >= 0; i--) { const z = G.zones[i]; if (z.type === 'orbital' && z.x === px && z.y === py && !z.fired) { zone = z; break; } }
        let exposed = 0; const zt = zone ? zone.team : (e.side === 'me' ? 0 : 1);
        for (const u of G.units) if (!u.dead && u.team !== zt && hyp(u.x - px, u.y - py) <= R) exposed++;
        for (const b of G.buildings) if (!b.dead && b.team !== zt) { const dx = Math.max(b.tx * TILE - px, 0, px - (b.tx + b.w) * TILE), dy = Math.max(b.ty * TILE - py, 0, py - (b.ty + b.h) * TILE); if (hyp(dx, dy) <= R) exposed++; }
        const s = { t: r1(e.t), tx: e.tx, ty: e.ty, r: e.r, dmg: e.dmg, delay: e.delay, side: e.side, exposed, landedT: null, missed: false, hadZone: !!zone };
        rec.strikes.push(s); pendingStrikes.push({ s, zone, due: e.t + Math.max(0.1, e.delay) + 1.5 });
      } else if (e.type === 'unlock') {
        const id = e.id, k = e.kind, heroU = k === 'unit' && id === heroId;
        let was;
        if (k === 'building') was = shadow.b.has(id); else if (k === 'unit') was = shadow.u.has(id) || (heroU && shadow.hero); else was = id > shadow.maxEra;
        if (e.locked) {
          if (k === 'building') shadow.b.add(id); else if (k === 'unit') { shadow.u.add(id); if (heroU) shadow.hero = true; } else shadow.maxEra = Math.min(shadow.maxEra, id - 1);
        } else {
          if (k === 'building') shadow.b.delete(id); else if (k === 'unit') { shadow.u.delete(id); if (heroU) shadow.hero = false; } else shadow.maxEra = Math.max(shadow.maxEra, id);
        }
        rec.unlocks.push({ t: r1(e.t), kind: k, id, locked: e.locked, noop: e.locked ? was : !was });
        touched.set(k + ':' + id, e);
      }
    }
    for (const e of touched.values()) {                          // the claim of the LAST unlock/lock event of the step must match the live restriction state
      const k = e.kind, id = e.id;
      const msg = k === 'building' ? A.campLocked(0, 'building', id) : k === 'era' ? A.campLocked(0, 'era', id)
        : (id === heroId ? A.campLocked(0, 'hero', id) : A.campLocked(0, 'unit', id));
      if (!!msg !== !!e.locked) rec.unlockBad.push({ t: r1(e.t), kind: k, id, claimed: e.locked ? 'locked' : 'unlocked', actual: msg ? 'locked' : 'unlocked' });
    }
  }
  function pollFired() {
    for (const id of Object.keys(K.fired)) {
      if (K.fired[id] !== firedSeen[id]) { firedSeen[id] = K.fired[id]; const a = rec.fire[id] || (rec.fire[id] = []); if (a.length < 60) a.push(r1(K.fireT[id])); }
    }
  }
  function pollStrikes() {
    for (const p of pendingStrikes) {
      if (p.s.landedT !== null || p.s.missed) continue;
      if (p.zone && p.zone.fired) p.s.landedT = r1(K.t);
      else if (K.t > p.due) p.s.missed = true;
    }
  }

  try {
    handleEvents(0);                                             // events delivered during newGame (initial objectives)
    while (G.tick < maxTicks && !G.over) {
      if (K.hold) A.campaignResume();                            // never stand still (autoResume normally prevents this)
      const idBefore = G.nextId;
      A.step();
      if (K.tick % 6 === 0) pollFired();
      handleEvents(idBefore);
      if (pendingStrikes.length) pollStrikes();
      if (G.tick % CHECK_TICKS === 0) rec.hashes[G.tick] = stateHash(A);
      if ((G.tick & 255) === 0 && Date.now() - t0 > wallMs) { rec.wall = true; break; }
      if (spec.stopTick && G.tick >= spec.stopTick) break;
    }
    pollFired(); pollStrikes();
  } catch (e) { rec.crash = String(e && e.stack || e).split('\n').slice(0, 4).join(' | '); }

  const R = K.result;
  rec.ticks = G.tick; rec.wallMs = Date.now() - t0;
  rec.res = rec.crash ? 'crash' : G.over ? G.over : rec.wall ? 'wall' : 'stalled';
  rec.t = r1(R ? R.t : K.t); rec.reason = R ? R.reason : null; rec.stars = R ? R.stars : 0; rec.diff = G.diff;
  rec.par = R ? R.par : (mission.stars && isNum(mission.stars.par) ? mission.stars.par : null);
  rec.bonus = R ? [R.bonusDone, R.bonusTotal] : [K.objs.filter(o => o.kind === 'bonus' && K.obj[o.id].state === 'done').length, K.objs.filter(o => o.kind === 'bonus').length];
  for (const o of K.objs) {
    const st = K.obj[o.id].state, e = { kind: o.kind, state: st, t: r1(K.obj[o.id].t) };
    /* objectives are only re-evaluated at 5 Hz: a victory by the default "all enemy structures destroyed" rule ends the game inside kill(), before the objective that says the same thing was updated */
    if (st === 'active' || st === 'hidden') { try { if (o.done && A.campEvalCond(o.done)) e.end = true; } catch (x) { /* malformed: already in errors */ } }
    rec.objs[o.id] = e;
  }
  if (rec.res === 'victory') rec.primaryOpen = K.objs.filter(o => o.kind === 'primary' && rec.objs[o.id].state !== 'done' && !rec.objs[o.id].end).map(o => o.id);
  rec.errors = K.errors.slice();
  rec.k = [G.teams[0].kills, G.teams[1].kills]; rec.l = [G.teams[0].lost, G.teams[1].lost];
  rec.hashes.end = stateHash(A) + '@' + G.tick;
  for (const p of pendingStrikes) if (p.s.landedT === null && !p.s.missed) p.s.unresolved = true;
  return rec;
}

function compareDet(a, b) {                                      // run replayed twice: every common checkpoint (and the end state, if both stopped on the same tick) must match
  if (!a || !b) return { checked: 0, ok: null, detail: 'not run' };
  if (a.crash || b.crash) return { checked: 0, ok: false, detail: 'a run crashed' };
  let checked = 0;
  for (const k of Object.keys(a.hashes)) {
    if (k === 'end') continue;
    if (b.hashes[k] === undefined) continue;
    checked++; if (a.hashes[k] !== b.hashes[k]) return { checked, ok: false, detail: 'state hash differs at tick ' + k };
  }
  if (a.ticks === b.ticks) { checked++; if (a.hashes.end !== b.hashes.end) return { checked, ok: false, detail: 'end state differs at tick ' + a.ticks }; }
  if (a.res !== b.res && a.ticks === b.ticks) return { checked, ok: false, detail: 'result differs: ' + a.res + ' vs ' + b.res };
  return { checked, ok: checked > 0 ? true : null, detail: checked ? checked + ' state hashes identical' : 'no common checkpoint (run shorter than 30 s)' };
}

/* ----------------------------------------------------------------------------- aggregation */
function aggregate(mission, recs, opts) {
  opts = opts || {};
  const main = recs.filter(r => !r.det), det = recs.find(r => r.det && r.run === 0), first = main.find(r => r.run === 0);
  const n = main.length, cnt = (f) => main.filter(f).length;
  const win = main.filter(r => r.res === 'victory'), defeat = main.filter(r => r.res === 'defeat'), stalled = main.filter(r => r.res === 'stalled' || r.res === 'wall'), crash = main.filter(r => r.res === 'crash');
  const model = scheduleModel(mission), optionalSet = new Set(opts.optional || []);
  const rate = (k) => n ? k / n : 0;
  const A = { id: mission.id, title: mission.title || '', faction: mission.setup && mission.setup.faction, enemy: mission.setup && mission.setup.enemy, diff: main[0] ? main[0].diff : (mission.setup && mission.setup.diff),
    par: mission.stars && isNum(mission.stars.par) ? mission.stars.par : null, cap: opts.cap, runs: n,
    count: { win: win.length, defeat: defeat.length, stalled: stalled.length, crash: crash.length },
    rate: { win: rate(win.length), defeat: rate(defeat.length), stalled: rate(stalled.length), crash: rate(crash.length) },
    winCI: wilson(win.length, n), tWin: { median: r1(pct(win.map(r => r.t), 0.5)), p10: r1(pct(win.map(r => r.t), 0.1)), p90: r1(pct(win.map(r => r.t), 0.9)) },
    tEnded: { median: r1(pct(main.filter(r => r.res === 'victory' || r.res === 'defeat').map(r => r.t), 0.5)) },
    stars: [0, 1, 2, 3].map(s => cnt(r => r.stars === s)), reasons: {}, triggers: [], objectives: [], errors: [], crashes: [], primaryOpenOnWin: 0,
    spawns: { seen: 0, short: [], late: 0 }, strikes: { seen: 0, landed: 0, missed: [], unresolved: 0, empty: 0 }, unlocks: { seen: 0, noop: [], bad: [] },
    determinism: compareDet(first, det), perf: { ticks: 0, wallMs: 0, ticksPerSec: 0 }, radio: { median: pct(main.map(r => r.radio), 0.5) } };
  for (const r of main) {
    const key = r.res + (r.reason ? ':' + r.reason : ''); A.reasons[key] = (A.reasons[key] || 0) + 1;
    for (const e of r.errors) { const x = A.errors.find(q => q.msg === e); if (x) x.runs++; else A.errors.push({ msg: e, runs: 1 }); }
    if (r.crash) { const x = A.crashes.find(q => q.msg === r.crash); if (x) x.runs++; else A.crashes.push({ msg: r.crash, runs: 1 }); }
    if (r.res === 'victory' && r.primaryOpen.length) A.primaryOpenOnWin++;
    for (const s of r.spawns) { A.spawns.seen++; if (s.made < s.n) A.spawns.short.push({ run: r.run, t: s.t, utype: s.utype, n: s.n, made: s.made, where: s.where }); }
    for (const s of r.strikes) { A.strikes.seen++; if (s.landedT !== null) { A.strikes.landed++; if (!s.exposed) A.strikes.empty++; } else if (s.missed || !s.hadZone) A.strikes.missed.push({ run: r.run, t: s.t, tx: s.tx, ty: s.ty, delay: s.delay, zone: s.hadZone }); else A.strikes.unresolved++; }
    for (const u of r.unlocks) { A.unlocks.seen++; if (u.noop) A.unlocks.noop.push({ run: r.run, t: u.t, kind: u.kind, id: u.id, locked: u.locked }); }
    for (const u of r.unlockBad) A.unlocks.bad.push(Object.assign({ run: r.run }, u));
    A.perf.ticks += r.ticks; A.perf.wallMs += r.wallMs;
  }
  if (det) { A.perf.ticks += det.ticks; A.perf.wallMs += det.wallMs; }
  A.perf.ticksPerSec = A.perf.wallMs ? Math.round(A.perf.ticks / A.perf.wallMs * 1000) : 0;
  /* triggers */
  (isArr(mission.triggers) ? mission.triggers : []).forEach((t, i) => {
    if (!t || typeof t !== 'object') return;
    const id = isStr(t.id) ? t.id : '#' + i, firedIn = main.filter(r => r.fire[id] && r.fire[id].length), exp = model.trigger(i), ev = model.every(i);
    const doOps = isArr(t.do) ? t.do.map(a => isArr(a) ? a[0] : null) : [];
    const late = []; for (const r of firedIn) if (exp !== null) late.push(r.fire[id][0] - exp);
    const onTime = []; // every-triggers: expected k-th firing = exp + k*every
    if (exp !== null && ev) for (const r of firedIn) r.fire[id].forEach((ft, k) => onTime.push(ft - (exp + k * ev)));
    const eligible = exp === null ? [] : main.filter(r => r.t >= exp + 5.4), missing = eligible.filter(r => !(r.fire[id] && r.fire[id].length));   // runs that lasted past (schedule + tolerance) and still did not fire it
    A.triggers.push({ id, index: i, runs: firedIn.length, frac: rate(firedIn.length), tMedian: r1(pct(firedIn.map(r => r.fire[id][0]), 0.5)), expected: exp === null ? null : r1(exp), every: ev || 0, eligible: eligible.length, missing: missing.length,
      lateMax: late.length ? r1(Math.max.apply(null, late)) : null, lateMin: late.length ? r1(Math.min.apply(null, late)) : null, everyDev: onTime.length ? r1(Math.max.apply(null, onTime.map(Math.abs))) : null,
      optional: !!t.optional || optionalSet.has(id), spawn: doOps.includes('spawn'), strike: doOps.includes('strike'), unlock: doOps.includes('unlock') || doOps.includes('lock') });
  });
  /* objectives */
  for (const o of isArr(mission.objectives) ? mission.objectives : []) {
    if (!o || !isStr(o.id)) continue;
    const dn = main.filter(r => r.objs[o.id] && r.objs[o.id].state === 'done'), fl = main.filter(r => r.objs[o.id] && r.objs[o.id].state === 'failed');
    const stale = main.filter(r => r.objs[o.id] && r.objs[o.id].state !== 'done' && r.objs[o.id].end);   // true in the final state but never recorded as done (see playRun)
    A.objectives.push({ id: o.id, kind: o.kind, text: o.text, done: dn.length, frac: rate(dn.length), tMedian: r1(pct(dn.map(r => r.objs[o.id].t), 0.5)), failed: fl.length, staleDone: stale.length, fracEff: rate(dn.length + stale.length) });
  }
  A.ok = !A.crashes.length;
  return A;
}

/* ----------------------------------------------------------------------------- worker pool */
function buildJobs(S, ids, o) {
  const jobs = [], n = o.runs || DEFAULTS.runs;
  for (const id of ids) {
    const m = S.missions.find(x => x.id === id), cap = o.cap || defaultCap(m);
    for (let i = 0; i < n; i++) jobs.push({ mission: id, run: i, capSec: cap, diff: o.diff || null, wallSec: o.wall, rsBase: o.rsBase || 0 });
    if (o.det !== false) jobs.push({ mission: id, run: 0, det: true, capSec: Math.min(cap, o.detCap || DEFAULTS.detCap), diff: o.diff || null, wallSec: o.wall, rsBase: o.rsBase || 0 });
  }
  // longest first keeps the pool busy to the end
  return jobs.map((j, i) => ({ j, i })).sort((a, b) => (b.j.capSec - a.j.capSec) || (a.i - b.i)).map(x => x.j);
}
function defaultJobs() { return Math.max(1, Math.min(os.cpus().length - 1, 8)); }
/* runs every job; resolves to the list of records. jobsN <= 1 with o.inproc runs everything in this process. */
function runJobs(S, jobs, o) {
  o = o || {};
  const out = [], total = jobs.length; let done = 0;
  const tick = (rec) => { done++; out.push(rec); if (o.onResult) o.onResult(rec, done, total); };
  const jobsN = Math.max(1, Math.min(o.jobs || defaultJobs(), total || 1));
  if (o.inproc || total <= 1) {
    for (const j of jobs) { let rec; try { rec = Object.assign(playRun(S, j), j.det ? { det: true } : {}); } catch (e) { rec = crashRec(j, e); } tick(rec); }
    return Promise.resolve(out);
  }
  return new Promise((resolve) => {
    const queue = jobs.slice(), live = new Set();
    function spawn() {
      const w = cp.fork(__filename, ['--worker'], { execArgv: ['--max-semi-space-size=64'], stdio: ['ignore', 'inherit', 'inherit', 'ipc'], env: process.env });
      w.cur = null; live.add(w);
      w.on('message', (msg) => {
        if (msg.type === 'ready') return next(w);
        if (msg.type === 'result') { const j = w.cur; w.cur = null; tick(Object.assign(msg.rec, j && j.det ? { det: true } : {})); next(w); }
      });
      w.on('exit', (code) => {
        live.delete(w);
        if (w.cur) { tick(crashRec(w.cur, 'worker process died (exit ' + code + ')')); w.cur = null; if (queue.length) spawn(); }
        if (!live.size && !queue.length) resolve(out);
      });
      w.send({ type: 'init', storyPath: o.storyPath || null, src: o.src || process.env.SRC || null });
    }
    function next(w) {
      const j = queue.shift();
      if (!j) { w.kill(); return; }
      w.cur = j; w.send({ type: 'job', job: j });
    }
    for (let i = 0; i < jobsN; i++) spawn();
  });
}
function crashRec(j, e) {
  return { mission: j.mission, run: j.run, det: !!j.det, rs: 0, res: 'crash', crash: String(e && e.stack || e).split('\n').slice(0, 3).join(' | '), t: 0, ticks: 0, wallMs: 0, stars: 0, bonus: [0, 0], objs: {}, primaryOpen: [], fire: {}, errors: [], spawns: [], strikes: [], unlocks: [], unlockBad: [], radio: 0, evCount: {}, hashes: {}, k: [0, 0], l: [0, 0] };
}
/* the whole pipeline: select missions, run, aggregate. Resolves to {missions:[aggregate...], records, perf} */
async function simulate(S, ids, o) {
  const jobs = buildJobs(S, ids, o);
  const t0 = Date.now(), recs = await runJobs(S, jobs, o);
  const missions = ids.map(id => {
    const m = S.missions.find(x => x.id === id), cap = (jobs.find(j => j.mission === id) || {}).capSec;
    return aggregate(m, recs.filter(r => r.mission === id), { cap, optional: o.optional });
  });
  const ticks = missions.reduce((s, m) => s + m.perf.ticks, 0), cpuMs = missions.reduce((s, m) => s + m.perf.wallMs, 0);
  return { missions, records: recs, perf: { wallMs: Date.now() - t0, cpuMs, ticks, ticksPerSecPerWorker: cpuMs ? Math.round(ticks / cpuMs * 1000) : 0, jobs: Math.min(o.jobs || defaultJobs(), jobs.length) } };
}

/* ----------------------------------------------------------------------------- text report */
const P = (x) => x === null || x === undefined ? '-' : Math.round(x * 100) + '%';
const S0 = (x) => x === null || x === undefined ? '-' : Math.round(x) + 's';
function formatMission(a) {
  const L = [], d = a.determinism;
  L.push('== ' + a.id + (a.title ? ' "' + a.title + '"' : '') + '   ' + (a.faction || '?') + ' vs ' + (a.enemy || '?') + '   diff ' + a.diff + '   par ' + S0(a.par) + '   cap ' + S0(a.cap) + '   runs ' + a.runs);
  L.push('   result    win ' + P(a.rate.win) + ' (' + a.count.win + '/' + a.runs + ', 95% CI ' + P(a.winCI[0]) + '-' + P(a.winCI[1]) + ')   defeat ' + P(a.rate.defeat) + ' (' + a.count.defeat + ')   stalled ' + P(a.rate.stalled) + ' (' + a.count.stalled + ')' + (a.count.crash ? '   CRASH ' + a.count.crash : ''));
  L.push('   win time  median ' + S0(a.tWin.median) + '  p10 ' + S0(a.tWin.p10) + '  p90 ' + S0(a.tWin.p90) + (a.par && a.tWin.median !== null ? '   (median = ' + Math.round(a.tWin.median / a.par * 100) + '% of par)' : ''));
  L.push('   stars     0:' + a.stars[0] + '  1:' + a.stars[1] + '  2:' + a.stars[2] + '  3:' + a.stars[3] + '     ends: ' + Object.keys(a.reasons).map(k => k + ' x' + a.reasons[k]).join(', '));
  L.push('   objectives  ' + (a.objectives.map(o => o.id + '(' + o.kind[0] + ') ' + P(o.frac) + (o.tMedian !== null ? '@' + S0(o.tMedian) : '') + (o.staleDone ? '[+' + o.staleDone + ' true at the end only]' : '')).join('   ') || 'none'));
  const tr = a.triggers.map(t => t.id + ' ' + P(t.frac) + (t.tMedian !== null ? '@' + S0(t.tMedian) : '') + (t.expected !== null && t.lateMax !== null ? '[sched ' + S0(t.expected) + ', ' + (t.lateMax >= 0 ? '+' : '') + t.lateMax + 's]' : '') + (t.optional ? '(opt)' : ''));
  L.push('   triggers    ' + (tr.join('   ') || 'none'));
  const never = a.triggers.filter(t => !t.runs); if (never.length) L.push('   NEVER FIRED ' + never.map(t => t.id + (t.optional ? '(optional)' : '')).join(', '));
  L.push('   scripted    spawns ' + a.spawns.seen + (a.spawns.short.length ? ' (' + a.spawns.short.length + ' SHORT)' : '') + '   strikes ' + a.strikes.landed + '/' + a.strikes.seen + ' landed' + (a.strikes.missed.length ? ' (' + a.strikes.missed.length + ' MISSED)' : '') + '   unlocks ' + a.unlocks.seen + (a.unlocks.bad.length ? ' (' + a.unlocks.bad.length + ' NOT EFFECTIVE)' : '') + (a.unlocks.noop.length ? ' (' + a.unlocks.noop.length + ' no-op)' : '') + '   radio ' + (a.radio.median === null ? '-' : a.radio.median) + '/run');
  L.push('   errors      ' + (a.errors.length ? a.errors.map(e => e.msg + ' (x' + e.runs + ')').join(' ; ') : 'none') + (a.crashes.length ? '   CRASHES: ' + a.crashes.map(e => e.msg).join(' ; ') : ''));
  L.push('   determinism ' + (d.ok === true ? 'OK' : d.ok === false ? 'MISMATCH' : 'n/a') + ' (' + d.detail + ')   speed ' + a.perf.ticksPerSec + ' ticks/s/worker');
  return L.join('\n');
}

/* ----------------------------------------------------------------------------- CLI */
function parseArgs(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], val = () => argv[++i];
    if (a === '--runs') o.runs = +val(); else if (a === '--full') o.runs = 24; else if (a === '--diff') o.diff = val(); else if (a === '--cap') o.cap = +val(); else if (a === '--json') o.json = val();
    else if (a === '--story') o.story = val(); else if (a === '--jobs') o.jobs = +val(); else if (a === '--det-cap') o.detCap = +val(); else if (a === '--no-det') o.det = false;
    else if (a === '--wall') o.wall = +val(); else if (a === '--rs-base') o.rsBase = +val(); else if (a === '--optional') o.optional = String(val()).split(',').filter(Boolean);
    else if (a === '--quiet') o.quiet = true; else if (a === '--progress') o.progress = true; else if (a === '--inproc') o.inproc = true; else if (a === '--mission') o._.push(val());
    else if (a === '--strict') o.strict = true; else if (a === '--ticks') o.ticks = +val(); else if (a === '--no-ascii') o.noAscii = true; else if (a === '--verbose') o.verbose = true; else if (a === '--require-missions') o.requireMissions = true; else if (a === '--help' || a === '-h') o.help = true; else if (a.startsWith('--')) o.unknown = (o.unknown || []).concat(a); else o._.push(a);
  }
  return o;
}
function selectMissions(S, spec) {
  const all = S.missions.map(m => m.id);
  if (!spec || !spec.length || spec.includes('all')) return { ids: all };
  const ids = []; for (const s of spec) for (const id of String(s).split(',').filter(Boolean)) ids.push(id);
  const bad = ids.filter(id => !all.includes(id));
  return { ids, bad, all };
}
function usage() {
  return 'usage: node tools/mission_sim.js <missionId|id,id|all> [--runs N=' + DEFAULTS.runs + ' (--full = 24)] [--diff easy|normal|hard] [--cap SECONDS] [--json file] [--story path]\n' +
    '       [--jobs N=' + defaultJobs() + '] [--det-cap SECONDS=' + DEFAULTS.detCap + '] [--no-det] [--wall SECONDS=' + DEFAULTS.wall + ' per run] [--rs-base N] [--optional trigId,trigId] [--progress] [--quiet] [--inproc]';
}
async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help || o.unknown) { console.error((o.unknown ? 'unknown option ' + o.unknown.join(' ') + '\n' : '') + usage()); process.exit(o.help ? 0 : 2); }
  if (o.diff && !['easy', 'normal', 'hard'].includes(o.diff)) { console.error('--diff must be easy|normal|hard'); process.exit(2); }
  const S = loadStoryData(o.story), sel = selectMissions(S, o._);
  if (!S.missions.length) { console.error('no missions in ' + (o.story || 'src/js/44_story_*.js') + ' yet'); process.exit(2); }
  if (sel.bad && sel.bad.length) { console.error('unknown mission id(s): ' + sel.bad.join(', ') + '   (have: ' + sel.all.join(', ') + ')'); process.exit(2); }
  o.storyPath = o.story ? path.resolve(o.story) : null;
  o.onResult = (rec, done, total) => {
    if (o.progress) process.stderr.write('[' + done + '/' + total + '] ' + rec.mission + (rec.det ? ' (det)' : ' run ' + rec.run) + ' ' + rec.res + (rec.reason ? ':' + rec.reason : '') + ' ' + rec.t + 's  ' + Math.round(rec.wallMs / 100) / 10 + 'w\n');
    else if (process.stderr.isTTY && !o.quiet) process.stderr.write('\r' + done + '/' + total + ' runs done   ');
  };
  const res = await simulate(S, sel.ids, o);
  if (process.stderr.isTTY && !o.progress && !o.quiet) process.stderr.write('\r' + ' '.repeat(30) + '\r');
  if (!o.quiet) {
    for (const a of res.missions) console.log(formatMission(a) + '\n');
    console.log('total ' + res.perf.ticks + ' ticks in ' + Math.round(res.perf.wallMs / 100) / 10 + ' s wall (' + res.perf.jobs + ' workers, ' + res.perf.ticksPerSecPerWorker + ' ticks/s per worker). The AI is a proxy for a human: these are sanity bounds, not a difficulty guarantee.');
  }
  if (o.json) { require('fs').mkdirSync(path.dirname(path.resolve(o.json)), { recursive: true }); require('fs').writeFileSync(o.json, JSON.stringify({ tool: 'mission_sim', args: { missions: sel.ids, runs: o.runs || DEFAULTS.runs, diff: o.diff || null, cap: o.cap || null, story: o.story || null }, perf: res.perf, missions: res.missions, records: res.records }, null, 1)); }
  process.exit(res.missions.some(a => a.count.crash) ? 3 : 0);
}

/* ----------------------------------------------------------------------------- worker entry */
if (require.main === module) {
  if (process.argv.includes('--worker')) {
    let S = null, src = null;
    process.on('message', (msg) => {
      if (msg.type === 'init') { try { S = loadStoryData(msg.storyPath, msg.src || undefined); src = msg.src || undefined; process.send({ type: 'ready' }); } catch (e) { process.send({ type: 'ready' }); S = { missions: [], cine: {}, radio: {}, external: false, err: String(e && e.stack || e) }; } }
      else if (msg.type === 'job') {
        let rec; try { rec = playRun(S, Object.assign({ src }, msg.job)); } catch (e) { rec = crashRec(msg.job, e); }
        process.send({ type: 'result', rec });
      }
    });
  } else main().catch((e) => { console.error(e && e.stack || e); process.exit(2); });
}

module.exports = { DEFAULTS, loadStoryData, injectStory, playRun, aggregate, compareDet, buildJobs, runJobs, simulate, scheduleModel, stateHash, defaultCap, defaultJobs,
  formatMission, parseArgs, selectMissions, pct, wilson, runSeed, clone };
