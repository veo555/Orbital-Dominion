'use strict';
/* Orbital Dominion MCP: the match engine (no MCP code in here, so it is testable on its own).
   A Match wraps one headless simulation (tests/sim/simlib3.js loads the sim modules into a sandbox).
   - mode 'play'  : the client commands side A (team 0) against a built-in agent (side B), fog-honest observations only.
   - mode 'watch' : two built-in agents play each other; the client advances time and reads both sides.
   Every match is created with replay:true, so (setup code + the command log) reproduces it exactly: see exportLog()/replayLog(). */
const path = require('path');
const load = require(path.join(__dirname, '..', 'tests', 'sim', 'simlib3.js'));

const TICK = 30, MAX_MATCHES = 4, MAX_ADVANCE_S = 120, MAX_MATCH_S = 3600, MAX_CMDS = 40, MAX_LIST = 80;
const TIERS = ['easy', 'normal', 'hard', 'master'];
const FACTIONS = ['meridian', 'obsidian', 'aurora'];
const round = (x) => Math.round(x * 10) / 10;

class MatchError extends Error {}

class Match {
  constructor(id, setup) {
    this.id = id; this.setup = setup; this.mode = setup.aiBoth ? 'watch' : 'play';
    this.S = load();
    this.S.sandbox.Math.random = (() => { let s = (setup.seed * 2654435761) >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();   // cosmetic draws only: sim draws use the replay stream
    this.S.newGame(setup);
    this.G = this.S.G; this.log = []; this.msgSeen = 0; this.created = Date.now();
  }
  run(code) { return this.S.__run(code); }
  get tick() { return this.G.tick; }
  get time() { return this.G.time; }
  hash() { return this.run('replayHash()'); }
  code() { return this.run('replayCode()'); }
  messages() {   // sim -> player text ("Not enough crystals", ...) since the last call
    const all = this.S.sandbox.__toasts || [], out = all.slice(this.msgSeen, this.msgSeen + 20); this.msgSeen = all.length; return out;
  }
  /* ------------------------------------------------------------------ observation */
  state(opts) {
    opts = opts || {}; const G = this.G, R = (c) => this.run(c), out = {};
    out.match_id = this.id; out.mode = this.mode; out.replay_code = this.code();
    out.time_s = round(G.time); out.tick = G.tick; out.over = G.over || null;
    out.map = { width_tiles: R('MW'), height_tiles: R('MH'), note: 'All coordinates are TILES (x to the right, y down). 1 tile = 32 px. Your start is the nearest Hub.' };
    if (this.mode === 'watch') return Object.assign(out, this.watchState());
    const me = G.teams[0], hub = G.buildings.find((b) => b.team === 0 && b.type === 'hub' && !b.dead);
    out.you = { faction: me.faction, crystals: Math.floor(me.c), ether: Math.floor(me.e), supply: [me.used, me.cap], era: me.era,
      hero: { alive: !!me.hero.alive, level: me.hero.level }, start_tile: hub ? [hub.tx, hub.ty] : null, tech: this.techOf(me) };
    const own = G.units.filter((u) => !u.dead && u.team === 0), ownB = G.buildings.filter((b) => !b.dead && b.team === 0);
    const counts = {}; for (const u of own) counts[u.type] = (counts[u.type] || 0) + 1;
    out.your_unit_counts = counts;
    out.idle_workers = own.filter((u) => u.def.worker && u.order.t === 'idle').map((u) => u.id);
    const unitRow = (u) => ({ id: u.id, type: u.type, tile: [Math.floor(u.x / 32), Math.floor(u.y / 32)], hp: Math.round(100 * u.hp / u.maxhp), order: u.order.t + (u.order.t === 'gather' && u.carry ? '(carrying)' : '') });
    const fighters = own.filter((u) => !u.def.worker), workers = own.filter((u) => u.def.worker);
    const lim = opts.full ? 1e9 : MAX_LIST;
    out.your_army = fighters.slice(0, lim).map(unitRow); out.your_workers = opts.full ? workers.map(unitRow) : { count: workers.length, ids: workers.slice(0, 40).map((u) => u.id) };
    if (fighters.length > lim) out.your_army_truncated = fighters.length;
    out.your_buildings = ownB.map((b) => ({ id: b.id, type: b.type, tile: [b.tx, b.ty], size: [b.w, b.h], hp: Math.round(100 * b.hp / b.maxhp), done: b.done, progress: round(b.prog), queue: b.queue.map((q) => q.k + ':' + (q.id || q.to || '') + ' ' + Math.round(100 * q.t / q.total) + '%'),
      can_train: b.done ? R('prodList(G.buildings.find(x=>x.id===' + b.id + '))') : [] }));
    const vis = R('(function(){const o=[];for(const e of G.units){if(e.dead||e.team===0)continue;if(!seen(0,e))continue;o.push(e.id);}return o;})()');
    out.visible_enemies = vis.slice(0, lim).map((id) => { const e = G.units.find((u) => u.id === id); return { id: e.id, side: e.team === 1 ? 'enemy' : 'neutral', type: e.type, tile: [Math.floor(e.x / 32), Math.floor(e.y / 32)], hp: Math.round(100 * e.hp / e.maxhp) }; });
    out.known_enemy_buildings = G.buildings.filter((b) => !b.dead && b.team !== 0 && b.seen0).map((b) => ({ id: b.id, side: b.team === 1 ? 'enemy' : 'neutral', type: b.type, tile: [b.tx, b.ty], currently_visible: !!R('seen(0,G.buildings.find(x=>x.id===' + b.id + '))') }));
    out.resources = G.res.filter((r) => !r.dead && G.vis[0][r.ty * R('MW') + r.tx] > 0).map((r) => ({ id: r.id, type: r.type, tile: [r.tx, r.ty], remaining: Math.round(r.amount), has_siphon: !!r.siphon })).slice(0, 60);
    out.fog_note = 'You only see what your units and buildings see. Enemy positions are last-known for buildings, live for units in sight.';
    out.messages = this.messages();
    return out;
  }
  techOf(T) { const o = {}; for (const k of ['weapons', 'armor', 'stims']) if (T[k] !== undefined) o[k] = T[k]; return o; }
  watchState() {
    const G = this.G, side = (t) => {
      const T = G.teams[t], ai = G.ais[t], own = G.units.filter((u) => !u.dead && u.team === t), counts = {};
      for (const u of own) counts[u.type] = (counts[u.type] || 0) + 1;
      const army = this.run('aiArmyVal(G.units.filter(u=>!u.dead&&u.team===' + t + '&&!u.def.worker&&!u.def.trade))');
      return { faction: T.faction, tier: ai ? ai.tier : null, crystals: Math.floor(T.c), ether: Math.floor(T.e), supply: [T.used, T.cap], era: T.era, army_value: Math.round(army),
        workers: own.filter((u) => u.def.worker).length, bases: G.buildings.filter((b) => !b.dead && b.team === t && b.done && b.type === 'hub').length, units: counts,
        agent: ai ? { posture: ai.mil, economy: ai.eco, own_win_estimate: ai.V !== undefined ? round(ai.V) : null, predicted_fight_win: ai.pG !== undefined ? round(ai.pG) : null, attack_wave: ai.wave } : null };
    };
    return { side_a: side(0), side_b: side(1), note: 'Watch mode shows both sides (omniscient). Each agent\'s own win estimate comes from its fog-honest value model, so the two can disagree.', messages: [] };
  }
  /* ------------------------------------------------------------------ commands */
  need(cond, msg) { if (!cond) throw new MatchError(msg); }
  ownUnit(id) { const u = this.G.units.find((x) => x.id === id && !x.dead); this.need(u, 'no unit with id ' + id); this.need(u.team === 0, 'unit ' + id + ' is not yours'); return u; }
  ownBuilding(id) { const b = this.G.buildings.find((x) => x.id === id && !x.dead); this.need(b, 'no building with id ' + id); this.need(b.team === 0, 'building ' + id + ' is not yours'); return b; }
  entity(id) { const e = this.G.units.find((x) => x.id === id && !x.dead) || this.G.buildings.find((x) => x.id === id && !x.dead) || this.G.res.find((x) => x.id === id && !x.dead); this.need(e, 'no entity with id ' + id); return e; }
  apply(c) {   // one command; returns {ok, ...}; throws MatchError on invalid input
    this.need(this.mode === 'play', 'commands are only accepted in play mode');
    const S = this.S, G = this.G, px = (t) => (t + 0.5) * 32, tile = (v, name) => { this.need(Number.isInteger(v), name + ' must be an integer tile'); return v; };
    const inMap = (x, y) => { this.need(x >= 0 && y >= 0 && x < this.run('MW') && y < this.run('MH'), 'tile (' + x + ',' + y + ') is outside the map'); };
    const units = () => { this.need(Array.isArray(c.unit_ids) && c.unit_ids.length > 0 && c.unit_ids.length <= 60, 'unit_ids must list 1-60 of your unit ids'); return c.unit_ids.map((id) => this.ownUnit(id)); };
    const q = !!c.queue;
    switch (c.type) {
      case 'train': { const b = this.ownBuilding(c.building_id); this.need(b.done, 'building is not finished'); this.need(this.run('prodList(G.buildings.find(x=>x.id===' + b.id + '))').includes(c.unit), c.unit + ' cannot be trained here; this building trains: ' + this.run('prodList(G.buildings.find(x=>x.id===' + b.id + '))').join(', '));
        const r = this.run('reqUnit(0,' + JSON.stringify(c.unit) + ')'); this.need(r.ok, r.why); const ok = this.run('queueUnit(G.buildings.find(x=>x.id===' + b.id + '),' + JSON.stringify(c.unit) + ')'); this.need(ok, 'could not queue (queue full?)'); return { ok: true }; }
      case 'research': { const b = this.ownBuilding(c.building_id); this.need(b.done, 'building is not finished'); this.need(S.TECH[c.tech], 'unknown tech ' + c.tech + '; known: ' + Object.keys(S.TECH).join(', '));
        const ok = this.run('queueResearch(G.buildings.find(x=>x.id===' + b.id + '),' + JSON.stringify(c.tech) + ')'); this.need(ok, 'cannot research ' + c.tech + ' now (see messages)'); return { ok: true }; }
      case 'advance_era': { const b = this.ownBuilding(c.building_id); this.need(b.def.dropoff || b.type === 'hub', 'start an era upgrade at your Hub'); const ok = this.run('queueEra(G.buildings.find(x=>x.id===' + b.id + '))'); this.need(ok, 'cannot advance era now (see messages)'); return { ok: true }; }
      case 'hero': { const b = this.ownBuilding(c.building_id); const ok = this.run('queueHero(G.buildings.find(x=>x.id===' + b.id + '))'); this.need(ok, 'cannot train the hero now (see messages)'); return { ok: true }; }
      case 'build': { const w = this.ownUnit(c.worker_id); this.need(w.def.worker, 'only Haulers (workers) build'); const bt = c.building; this.need(S.BDEF[bt], 'unknown building ' + bt + '; known: ' + Object.keys(S.BDEF).join(', '));
        tile(c.tx, 'tx'); tile(c.ty, 'ty'); inMap(c.tx, c.ty); const rb = this.run('reqBuild(0,' + JSON.stringify(bt) + ')'); this.need(rb.ok, rb.why);
        this.need(this.run('canPlace(0,' + JSON.stringify(bt) + ',' + c.tx + ',' + c.ty + ')'), 'cannot place ' + bt + ' at (' + c.tx + ',' + c.ty + '): blocked, out of sight, not buildable terrain, or too far from your base; try another tile nearby');
        const ok = this.run('orderBuild(G.units.find(x=>x.id===' + w.id + '),' + JSON.stringify(bt) + ',' + c.tx + ',' + c.ty + ',' + q + ')'); this.need(ok, 'order refused (cost?)'); return { ok: true }; }
      case 'move': case 'attack_move': { const us = units(); tile(c.tx, 'tx'); tile(c.ty, 'ty'); inMap(c.tx, c.ty); const t = c.type === 'move' ? 'move' : 'attackmove';
        for (const u of us) S.setOrder(u, t === 'move' ? { t, x: px(c.tx), y: px(c.ty) } : { t, x: px(c.tx), y: px(c.ty), gs: 0 }, q); return { ok: true, units: us.length }; }
      case 'attack': { const us = units(); const e = this.entity(c.target_id); this.need(e.team !== 0 && (e.kind === 'unit' || e.kind === 'building'), 'target must be an enemy or neutral unit/building');
        this.need(this.run('seen(0,G.units.find(x=>x.id===' + e.id + ')||G.buildings.find(x=>x.id===' + e.id + '))') || e.seen0, 'you cannot see that target');
        let n = 0; for (const u of us) if (!u.def.noWeapon && !u.def.worker) { S.setOrder(u, { t: 'attack', target: e }, q); n++; } this.need(n > 0, 'none of those units can attack'); return { ok: true, units: n }; }
      case 'gather': { const us = units(); const r = G.res.find((x) => x.id === c.resource_id && !x.dead); this.need(r, 'no resource with id ' + c.resource_id); this.need(r.type === 'crystal' || (r.type === 'geyser' && r.siphon), 'geysers need a finished Siphon first');
        let n = 0; for (const u of us) if (u.def.worker) { S.setOrder(u, { t: 'gather', res: r, st: u.carry > 0 && u.carryType === (r.type === 'crystal' ? 'c' : 'e') ? 'ret' : 'go', hx: r.x, hy: r.y }, q); n++; } this.need(n > 0, 'only workers gather'); return { ok: true, units: n }; }
      case 'repair': { const us = units(); const e = this.entity(c.target_id); this.need(e.team === 0, 'repair only your own things'); let n = 0; for (const u of us) if (u.def.worker) { S.setOrder(u, { t: 'repair', target: e }, q); n++; } this.need(n > 0, 'only workers repair'); return { ok: true, units: n }; }
      case 'stop': { const us = units(); for (const u of us) { S.setOrder(u, { t: 'idle' }); this.run('goIdle(G.units.find(x=>x.id===' + u.id + '))'); } return { ok: true, units: us.length }; }
      case 'hold': { const us = units(); for (const u of us) S.setOrder(u, { t: 'hold' }); return { ok: true, units: us.length }; }
      case 'rally': { const b = this.ownBuilding(c.building_id); tile(c.tx, 'tx'); tile(c.ty, 'ty'); inMap(c.tx, c.ty); b.rally = { x: px(c.tx), y: px(c.ty) }; return { ok: true }; }
      default: throw new MatchError('unknown command type ' + c.type);
    }
  }
  commands(list) {
    this.need(Array.isArray(list) && list.length > 0 && list.length <= MAX_CMDS, 'send 1-' + MAX_CMDS + ' commands');
    return list.map((c, i) => { try { const r = this.apply(c); this.log.push({ tick: this.G.tick, cmd: c }); return Object.assign({ index: i }, r); } catch (e) { if (e instanceof MatchError) return { index: i, ok: false, error: e.message }; throw e; } });
  }
  /* ------------------------------------------------------------------ time */
  advance(seconds, stopOnAlert) {
    this.need(seconds >= 1 && seconds <= MAX_ADVANCE_S, 'seconds must be in [1, ' + MAX_ADVANCE_S + ']');
    const G = this.G; this.need(!G.over, 'the match is over (' + G.over + ')'); this.need(G.time + seconds <= MAX_MATCH_S + 1e-6, 'match time limit of ' + MAX_MATCH_S + ' s reached');
    const before = this.snapshot(), t0 = G.time, a0 = G.alertT; let stopped = null;
    const n = Math.round(seconds * TICK);
    for (let i = 0; i < n; i++) { this.S.step(); if (G.over) { stopped = 'game over: ' + G.over; break; } if (stopOnAlert && this.mode === 'play' && G.alertT > a0 && G.alertT >= t0) { stopped = 'under attack'; break; } }
    const after = this.snapshot(), ev = [];
    const lost = {}; for (const [id, t] of before.units) if (!after.units.has(id)) lost[t] = (lost[t] || 0) + 1;
    const lostB = {}; for (const [id, d] of before.buildings) if (!after.buildings.has(id)) lostB[d.type] = (lostB[d.type] || 0) + 1;
    const born = {}; for (const [id, t] of after.units) if (!before.units.has(id)) born[t] = (born[t] || 0) + 1;
    const done = []; for (const [id, d] of after.buildings) if (d.done && !(before.buildings.has(id) && before.buildings.get(id).done)) done.push(d.type);
    return { advanced_s: round(G.time - t0), time_s: round(G.time), stopped_early: stopped, units_lost: lost, buildings_lost: lostB, units_trained: born, buildings_finished: done, over: G.over || null };
  }
  snapshot() {   // ids and types of what the client can lose / gain: its own things in play mode, everything in watch mode
    const G = this.G, own = this.mode === 'play' ? 0 : -1, units = new Map(), buildings = new Map();
    for (const u of G.units) if (!u.dead && (own < 0 || u.team === own)) units.set(u.id, u.type);
    for (const b of G.buildings) if (!b.dead && (own < 0 || b.team === own)) buildings.set(b.id, { type: b.type, done: b.done });
    return { units, buildings };
  }
  exportLog() { return { format: 'orbital-dominion-mcp-log', v: 1, code: this.code(), tick: this.G.tick, final_hash: this.hash(), commands: this.log.map((x) => ({ tick: x.tick, cmd: x.cmd })) }; }
}

/* Re-run a log in a fresh match: advance to each command's tick, apply it, run to the final tick. Returns {hash, match}. */
function replayLog(log, parseCode) {
  const setup = parseCode(log.code); if (!setup) throw new MatchError('invalid replay code in log');
  setup.aiBoth = false; setup.replay = true;
  const m = new Match('replay', setup);
  const stepTo = (tick) => { while (m.G.tick < tick && !m.G.over) m.S.step(); };
  for (const x of log.commands) { stepTo(x.tick); m.apply(x.cmd); }
  stepTo(log.tick);
  return { hash: m.hash(), tick: m.G.tick, over: m.G.over || null, match: m };
}

class Engine {
  constructor() { this.matches = new Map(); this.seq = 0; this.parse = null; }
  parseCode(code) { const m = new Match('probe', { replay: true, aiBoth: true, seed: 1, faction: 'meridian', enemy: 'obsidian', diff: 'normal', diffs: ['normal', 'normal'] }); const r = m.run('replayParse(' + JSON.stringify(String(code)) + ')'); return r; }
  newMatch(o) {
    if (this.matches.size >= MAX_MATCHES) throw new MatchError('too many open matches (' + MAX_MATCHES + '); end one with od_end_match');
    let setup;
    if (o.code) { const p = this.parseCode(o.code); if (!p) throw new MatchError('invalid replay code'); setup = p; if (o.mode === 'play') { setup.aiBoth = false; setup.diff = setup.diffs[1]; } }
    else {
      const fa = o.faction || 'meridian', fb = o.enemy || FACTIONS.find((f) => f !== fa), ta = o.your_tier || o.tier_a || 'hard', tb = o.tier || o.tier_b || 'normal';
      if (!FACTIONS.includes(fa) || !FACTIONS.includes(fb) || fa === fb) throw new MatchError('factions must be two different ones of ' + FACTIONS.join(', '));
      if (!TIERS.includes(ta) || !TIERS.includes(tb)) throw new MatchError('tiers must be one of ' + TIERS.join(', '));
      const seed = o.seed === undefined ? Math.floor(Math.random() * 1e9) : o.seed; if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) throw new MatchError('seed must be an integer 0..4294967295');
      const watch = o.mode === 'watch';
      setup = { replay: true, aiBoth: watch, seed, faction: fa, enemy: fb, diff: watch ? ta : tb, diffs: watch ? [ta, tb] : [tb, tb], mapFx: o.rocks !== false, arsenalOff: [false, false] };
    }
    const id = 'm' + (++this.seq); const m = new Match(id, setup); this.matches.set(id, m); return m;
  }
  get(id) { const m = this.matches.get(id); if (!m) throw new MatchError('unknown match_id ' + id + '; create one with od_new_match'); return m; }
  end(id) { this.get(id); this.matches.delete(id); return { ended: id }; }
  catalog(faction) {
    const m = new Match('cat', { replay: true, aiBoth: true, seed: 1, faction: faction || 'meridian', enemy: FACTIONS.find((f) => f !== (faction || 'meridian')), diff: 'normal', diffs: ['normal', 'normal'] });
    const S = m.S, ids = m.run('Object.keys(UDEF)'), bids = m.run('Object.keys(BDEF)'), fac = faction || 'meridian';
    const units = ids.filter((k) => m.run('unitFacOK(0,' + JSON.stringify(k) + ')') && !S.UDEF[k].creep && !S.UDEF[k].hero).map((k) => { const d = S.UDEF[k]; return { id: k, name: d.name, role: d.role || null, cost: d.cost, supply: d.supply, build_seconds: d.time, era: d.era, hp: d.hp, damage: d.dmg || 0, range: d.range || 0, flying: !!d.flying, worker: !!d.worker, requires: d.req || null, description: d.desc }; });
    const buildings = bids.filter((k) => !S.BDEF[k].rock).map((k) => { const d = S.BDEF[k]; return { id: k, name: d.name, size: [d.w, d.h], cost: d.cost, build_seconds: d.time, era: d.era, hp: d.hp, requires: d.req || null, trains: m.run('prodList({type:' + JSON.stringify(k) + ',team:0,def:BDEF[' + JSON.stringify(k) + ']})'), description: d.desc }; });
    const eras = [1, 2, 3].map((n) => { const e = S.ERAS[n]; return { era: n, name: e.name, upgrade_cost: e.cost || null, upgrade_seconds: e.time || null }; });
    return { faction: fac, units, buildings, eras, techs: Object.keys(S.TECH), note: 'Start: one Hub and 6 Haulers. Haulers mine crystals automatically; build Generators for supply, a Garrison for infantry, an Armory for upgrades. Win by destroying every enemy structure.' };
  }
}
module.exports = { Engine, Match, MatchError, replayLog, TIERS, FACTIONS, MAX_ADVANCE_S, MAX_CMDS };
