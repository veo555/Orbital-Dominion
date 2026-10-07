#!/usr/bin/env node
/* Static MISSION CHECKER — what tools/validate_story.js cannot see because it needs the real map and a running world.
     node tools/mission_check.js [missionId|id,id|all] [--story path] [--ticks 300] [--no-ascii] [--json file] [--strict] [--quiet]
   For every mission it builds the world (newGame({campaign}), the player idle, the enemy per `setup.foe`), simulates 300 ticks (10 s) and then checks:
     * every scripted `spawn` location: a ground tile connected to the player's base exists around the spawn anchor, and findPath from there reaches the player's Hub
       (flying units only need to be inside the map); prints path length and arrival time (ETA) of the wave
     * every `near` condition (heroNear, unitsNear): part of the circle is walkable ground connected to the base, and the centre is not in the void
     * every restriction / unlock / lock / start list names a real building, unit or tech; an unlock of something that was never locked; an objective, win or trigger
       that REQUIRES something (built / trained / count / era / hero) that is locked and never unlocked
     * text lengths: objective text (spec: <= 60 chars), radio lines used by the mission (<= 140), hints, title
     * win / lose: the mission can end (a win condition or the default rule), stars.par is positive and not earlier than the earliest scripted win
     * G.camp.errors after 300 ticks (unplaceable start buildings, unknown ids ... the runtime logs them instead of throwing), supply of the start army
   and prints an ASCII map with every scripted place marked (legend underneath). Exit 1 on any ERROR (with --strict WARN too).
   `--story <file>`: a story object from a module (tests/fixtures/*.js) instead of src/js/44_story_*.js. `SRC=<dir>`: another source tree. The map is the one of `setup.seed`.
   Coordinates are TILES (0..87); the ASCII map shows 1 char per tile wide and 2 tiles tall (a marker at tile (x,y) is drawn in column x, row floor(y/2)). */
'use strict';
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const sim = require(path.join(ROOT, 'tools', 'mission_sim.js'));
const SIMLIB = path.join(ROOT, 'tests', 'sim', 'simlib3.js');

const isArr = Array.isArray, isNum = (x) => typeof x === 'number' && isFinite(x), isStr = (x) => typeof x === 'string' && x.length > 0;
const LIMITS = { objText: 60, objTextWarn: 52, objTextMin: 6, radio: 140, hint: 100, title: 40, ticks: 300 };
const MARKS = 'ABCDFGIJKLMNOQRSUVWXYZabdefhijklmnoqstuvwxyz';   // marker alphabet: letters only, avoids the terrain glyphs H E T P c g p r and the creep digits 1 2 3

/* ------------------------------------------------------------------ collecting the scripted places */
function walkCond(c, visit, where) {
  if (!isArr(c) || !isStr(c[0])) return;
  visit(c, where);
  if (c[0] === 'all' || c[0] === 'any') for (let i = 1; i < c.length; i++) walkCond(c[i], visit, where);
  else if (c[0] === 'not') walkCond(c[1], visit, where);
}
function collect(m) {
  const conds = [], acts = [], roots = [];                       // conds: every (sub)condition {c, where, role}; roots: the top-level ones; acts: every action {a, where, trig}
  const addC = (c, where, role) => { if (isArr(c)) roots.push({ c, where, role }); walkCond(c, (x, w) => conds.push({ c: x, where: w, role }), where); };
  (isArr(m.objectives) ? m.objectives : []).forEach((o, i) => {
    if (!o || typeof o !== 'object') return;
    const w = 'objective ' + (o.id || i);
    addC(o.when, w + '.when', 'objective-when'); addC(o.done, w + '.done', o.kind === 'primary' ? 'primary' : 'objective'); addC(o.fail, w + '.fail', 'objective-fail');
  });
  (isArr(m.triggers) ? m.triggers : []).forEach((t, i) => {
    if (!t || typeof t !== 'object') return;
    const id = isStr(t.id) ? t.id : '#' + i;
    addC(t.when, 'trigger ' + id + '.when', 'trigger');
    (isArr(t.do) ? t.do : []).forEach((a, k) => { if (isArr(a) && isStr(a[0])) acts.push({ a, where: 'trigger ' + id + '.do[' + k + ']', trig: id }); });
  });
  addC(m.win, 'win', 'win'); addC(m.lose, 'lose', 'lose');
  return { conds, acts, roots };
}

/* ------------------------------------------------------------------ checks of one mission */
function checkMission(S, mission, opts) {
  opts = opts || {};
  const F = [], add = (level, rule, msg) => F.push({ level, rule, msg });
  const res = { id: mission.id, title: mission.title, findings: F, places: [], ascii: null, info: {} };
  process.env.RS = '1';
  let A;
  try {
    A = require(SIMLIB)(opts.src || process.env.SRC || undefined);
    sim.injectStory(A, S);
    A.newGame({ campaign: sim.clone(mission), autoResume: true });
  } catch (e) { add('ERROR', 'newGame', 'newGame({campaign}) threw: ' + String(e && e.stack || e).split('\n').slice(0, 2).join(' | ')); return res; }
  const G = A.G, K = G.camp, TILE = A.TILE, MW = A.MW, MH = A.MH, UDEF = A.UDEF, BDEF = A.BDEF, WW = MW * TILE, WH = MH * TILE;
  const s = mission.setup || {};
  /* simulate: the player stands still, haulers mine, the enemy follows its setup */
  const nTicks = opts.ticks || LIMITS.ticks;
  try { for (let i = 0; i < nTicks && !G.over; i++) A.step(); } catch (e) { add('ERROR', 'simulate', 'the simulation threw within ' + nTicks + ' ticks: ' + String(e && e.message || e)); }
  for (const e of K.errors) add('ERROR', 'runtime', 'G.camp.errors after ' + G.tick + ' ticks: ' + e);
  if (G.over) add('WARN', 'ends-early', 'the mission already ended (' + G.over + ', ' + (K.result ? K.result.reason : '?') + ') within ' + G.tick + ' ticks with the player idle');

  const comp = G.comp, ref = (G.refComp && G.refComp[0]) || 0, TT = G.TT;
  const hubOf = (team) => G.buildings.find(b => !b.dead && b.team === team && b.type === 'hub') || G.buildings.find(b => !b.dead && b.team === team) || null;
  const h0 = hubOf(0), h1 = hubOf(1);
  if (!h0) add('ERROR', 'setup', 'the player has no building after ' + G.tick + ' ticks');
  const tileOK = (t) => isNum(t) && t >= 0 && t < MW;
  const idx = (tx, ty) => Math.max(0, Math.min(MH - 1, Math.floor(ty))) * MW + Math.max(0, Math.min(MW - 1, Math.floor(tx)));
  const walk = (tx, ty) => comp[idx(tx, ty)] === ref && ref > 0;      // walkable AND connected to the player's base
  const tileName = (tx, ty) => { const t = TT[idx(tx, ty)]; return t === 3 ? 'void' : t === 1 ? 'rock' : t === 2 ? 'cliff' : G.blocked[idx(tx, ty)] ? 'blocked' : G.RAMP[idx(tx, ty)] ? 'ramp' : 'floor'; };
  /* walkable connected tiles whose centre lies within [r0,r1] pixels of (cx,cy) */
  function groundTiles(cx, cy, r0, r1) {
    let n = 0; const x0 = Math.max(0, Math.floor((cx - r1) / TILE)), x1 = Math.min(MW - 1, Math.ceil((cx + r1) / TILE)), y0 = Math.max(0, Math.floor((cy - r1) / TILE)), y1 = Math.min(MH - 1, Math.ceil((cy + r1) / TILE));
    let best = null, bd = 1e18;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = (x + .5) * TILE, py = (y + .5) * TILE, d = Math.hypot(px - cx, py - cy);
      if (d < r0 - 1e-6 || d > r1 + 1e-6 || comp[y * MW + x] !== ref || !A.canStand(px, py)) continue;
      n++; if (d < bd) { bd = d; best = { x: px, y: py }; }
    }
    return { n, best };
  }

  const { conds, acts, roots } = collect(mission);
  const marks = [];                                               // scripted places for the legend / map
  const mark = (kind, label, tx, ty, extra) => { marks.push(Object.assign({ kind, label, tx, ty, ch: MARKS[marks.length] || '*' }, extra || {})); return marks[marks.length - 1]; };

  /* ---- spawns ---- */
  for (const { a, where } of acts) {
    if (a[0] !== 'spawn') continue;
    const [, side, type, n, wh, op] = a, team = side === 'me' ? 0 : side === 'enemy' ? 1 : -1, d = UDEF[type], order = op && op.order || 'idle';
    if (team < 0 || !d || !isNum(n)) continue;                    // malformed: the validator / runtime errors say so
    const cnt = Math.min(60, Math.floor(n)), spread = 60 + Math.sqrt(cnt) * 26;
    let cx, cy, r0 = 0, r1 = spread, label = side + ' ' + cnt + ' ' + type + ' @ ' + (isArr(wh) ? '[' + wh + ']' : wh) + (order !== 'idle' ? ' (' + order + ')' : '');
    const hub = team === 0 ? h0 : h1;
    if (wh === 'base') { if (!hub) { add('ERROR', 'spawn', where + ': ' + side + ' has no building to spawn at "base"'); continue; } cx = hub.x; cy = hub.y; const half = Math.max(hub.w, hub.h) * TILE / 2; r0 = half + 28; r1 = half + 28 + spread; }
    else if (isArr(wh) && wh.length === 2) { if (!tileOK(wh[0]) || !tileOK(wh[1])) { add('ERROR', 'spawn', where + ': spawn tile ' + JSON.stringify(wh) + ' is outside the map'); continue; } cx = (wh[0] + .5) * TILE; cy = (wh[1] + .5) * TILE; }
    else if (/^edge:[NESW]$/.test(wh)) { const e = wh[5]; cx = (e === 'N' || e === 'S') ? WW / 2 : (e === 'W' ? 3.5 * TILE : WW - 3.5 * TILE); cy = (e === 'W' || e === 'E') ? WH / 2 : (e === 'N' ? 3.5 * TILE : WH - 3.5 * TILE); }
    else continue;
    const tx = Math.floor(cx / TILE), ty = Math.floor(cy / TILE), mk = mark('spawn', where + ': ' + label, tx, ty, { r: r1 / TILE, units: type });
    if (d.flying) { mk.note = 'flying: no ground path needed'; continue; }
    const g = groundTiles(cx, cy, r0, r1);
    mk.ground = g.n;
    if (!g.n) {
      const f = A.__run('nearestFree(' + tx + ',' + ty + ',12)');
      add('ERROR', 'spawn', where + ' (' + label + '): no walkable ground connected to the player\'s base within ' + (r1 / TILE).toFixed(1) + ' tiles of ' + (isArr(wh) ? '[' + wh + ']' : wh) + ' (' + tileName(tx, ty) + ' at tile (' + tx + ',' + ty + ')); the runtime falls back to ' + (f ? 'tile (' + f[0] + ',' + f[1] + ')' : 'the anchor itself') + ', which may be a sealed-off pocket');
      continue;
    }
    if (g.n < cnt * 2) add('WARN', 'spawn', where + ' (' + label + '): only ' + g.n + ' free ground tile(s) around the spawn point for ' + cnt + ' units (cramped, units may stack)');
    const target = team === 0 ? h1 : h0;                           // where the wave is headed: the opposing Hub
    if (target && g.best) {
      const p = A.findPath(g.best.x, g.best.y, target.x, target.y);
      if (!p || !p.length) add('ERROR', 'spawn', where + ' (' + label + '): findPath from tile (' + Math.floor(g.best.x / TILE) + ',' + Math.floor(g.best.y / TILE) + ') to the ' + (team === 0 ? 'enemy' : 'player') + ' Hub found no path');
      else {
        const last = p[p.length - 1], miss = Math.hypot(last.x - target.x, last.y - target.y) / TILE;
        const len = A.pathLength(g.best.x, g.best.y, target.x, target.y), eta = len * TILE / (d.speed * (order === 'attack' ? 1.12 : 1));
        mk.path = Math.round(len); mk.eta = Math.round(eta);
        if (miss > target.w / 2 + 3) add('WARN', 'spawn', where + ' (' + label + '): the path ends ' + miss.toFixed(1) + ' tiles short of the ' + (team === 0 ? 'enemy' : 'player') + ' Hub (search budget exhausted: a very long way round?)');
        if (order === 'attack' && eta > 240) add('WARN', 'spawn', where + ' (' + label + '): the wave needs ~' + Math.round(eta) + ' s to arrive (path ' + Math.round(len) + ' tiles)');
      }
    }
  }
  /* ---- near conditions and other positional conditions ---- */
  for (const { c, where } of conds) {
    if (c[0] !== 'heroNear' && c[0] !== 'unitsNear') continue;
    const [tx, ty, r] = c[0] === 'heroNear' ? [c[1], c[2], c[3]] : [c[3], c[4], c[5]];
    if (!tileOK(tx) || !tileOK(ty) || !isNum(r) || r <= 0) continue;
    const label = c[0] + ' (' + tx + ',' + ty + ') r ' + r + (c[0] === 'unitsNear' ? ' ' + c[1] + ' ' + c[2] : '');
    const mk = mark('near', where + ': ' + label, tx, ty, { r });
    const ground = c[0] === 'unitsNear' && UDEF[c[2]] && UDEF[c[2]].flying;
    const g = groundTiles((tx + .5) * TILE, (ty + .5) * TILE, 0, r * TILE);
    mk.ground = g.n;
    if (g.best && h0 && !ground) { const len = A.pathLength(h0.x, h0.y, g.best.x, g.best.y); if (len > 0) mk.path = Math.round(len); }   // distance from the player's Hub to the nearest standable tile of the circle (info for the designer)
    if (TT[idx(tx, ty)] === 3) add('ERROR', 'near', where + ' (' + label + '): the centre is in the void');
    if (!g.n && !ground) add('ERROR', 'near', where + ' (' + label + '): no walkable ground connected to the player\'s base inside the circle (centre is ' + tileName(tx, ty) + '): the condition can never become true for ground units');
    else if (!ground && !walk(tx, ty)) add('WARN', 'near', where + ' (' + label + '): the centre tile is ' + tileName(tx, ty) + ' (not standable); only the edge of the circle is reachable');
  }
  for (const { a, where } of acts) {
    const op = a[0];
    if (op === 'ping' || op === 'reveal' || op === 'strike' || op === 'heal') {
      const [tx, ty, r] = op === 'heal' ? [a[2], a[3], a[4]] : [a[1], a[2], a[3]];
      if (!tileOK(tx) || !tileOK(ty)) continue;
      const mk = mark(op, where + ': ' + op + ' (' + tx + ',' + ty + ')', tx, ty, { r: op === 'ping' || !isNum(r) ? 0 : r });
      if ((op === 'ping' || op === 'reveal') && TT[idx(tx, ty)] === 3) add('WARN', 'place', where + ': ' + op + ' at (' + tx + ',' + ty + ') points into the void');
      if (op === 'strike' && isNum(r) && (tx - r < -1 || tx + r > MW + 1 || ty - r < -1 || ty + r > MH + 1)) add('WARN', 'place', where + ': strike circle sticks out of the map');
    }
  }
  for (const [team, list, w] of [[0, (s.start || {}).buildings, 'setup.start.buildings'], [1, ((s.foe || {}).start || {}).buildings, 'setup.foe.start.buildings']])
    for (const b of isArr(list) ? list : []) if (b && tileOK(b.tx) && tileOK(b.ty) && BDEF[b.type]) mark('building', w + ': ' + b.type + ' (' + b.tx + ',' + b.ty + ')' + (team ? ' enemy' : ''), b.tx, b.ty, { r: 0 });

  /* ---- names: restrictions, start lists, conditions, actions ---- */
  const rs = s.restrict || {}, st = s.start || {}, foeS = (s.foe || {}).start || {};
  const realB = (id) => isStr(id) && Object.prototype.hasOwnProperty.call(BDEF, id), realU = (id) => isStr(id) && Object.prototype.hasOwnProperty.call(UDEF, id);
  for (const b of isArr(rs.buildings) ? rs.buildings : []) if (!realB(b)) add('ERROR', 'names', 'setup.restrict.buildings: "' + b + '" is not a building');
  for (const u of isArr(rs.units) ? rs.units : []) if (!realU(u)) add('ERROR', 'names', 'setup.restrict.units: "' + u + '" is not a unit');
  if (rs.maxEra !== undefined && ![1, 2, 3].includes(rs.maxEra)) add('ERROR', 'names', 'setup.restrict.maxEra must be 1, 2 or 3');
  for (const [w, list, kind] of [['setup.start.units', st.units, 'u'], ['setup.foe.start.units', foeS.units, 'u'], ['setup.start.buildings', st.buildings, 'b'], ['setup.foe.start.buildings', foeS.buildings, 'b']])
    for (const e of isArr(list) ? list : []) if (!e || !(kind === 'u' ? realU(e.type) : realB(e.type))) add('ERROR', 'names', w + ': "' + (e && e.type) + '" is not a ' + (kind === 'u' ? 'unit' : 'building'));
  const lockedB = new Set((isArr(rs.buildings) ? rs.buildings : []).filter(realB)), lockedU = new Set((isArr(rs.units) ? rs.units : []).filter(realU)), maxEra0 = [1, 2, 3].includes(rs.maxEra) ? rs.maxEra : 3;
  const heroId = A.FACTIONS[G.teams[0].faction].hero, heroLocked0 = st.hero === 'none';
  const unlockedB = new Set(), unlockedU = new Set(); let unlockEra = 0, lockActs = [];
  for (const { a, where } of acts) {
    if (a[0] !== 'unlock' && a[0] !== 'lock') continue;
    const [, kind, id] = a;
    if (kind === 'building' && !realB(id)) add('ERROR', 'names', where + ': ' + a[0] + ' building "' + id + '" does not exist');
    else if (kind === 'unit' && !realU(id)) add('ERROR', 'names', where + ': ' + a[0] + ' unit "' + id + '" does not exist');
    else if (kind === 'era' && ![2, 3].includes(id)) add('ERROR', 'names', where + ': ' + a[0] + ' era must be 2 or 3');
    else if (!['building', 'unit', 'era'].includes(kind)) add('ERROR', 'names', where + ': ' + a[0] + ' kind must be building|unit|era');
    if (a[0] === 'unlock') { if (kind === 'building') unlockedB.add(id); else if (kind === 'unit') unlockedU.add(id); else if (kind === 'era') unlockEra = Math.max(unlockEra, id); }
    else lockActs.push({ kind, id });
  }
  for (const { a, where } of acts) {                              // an unlock that cannot do anything
    if (a[0] !== 'unlock') continue;
    const [, kind, id] = a;
    if (!((kind === 'building' && realB(id)) || (kind === 'unit' && realU(id)) || (kind === 'era' && [2, 3].includes(id)))) continue;   // unknown ids are reported under "names"
    const wasLocked = kind === 'building' ? (lockedB.has(id) || lockActs.some(l => l.kind === kind && l.id === id)) : kind === 'unit' ? (lockedU.has(id) || lockActs.some(l => l.kind === kind && l.id === id) || (id === heroId && heroLocked0))
      : kind === 'era' ? (id > maxEra0 || lockActs.some(l => l.kind === 'era')) : true;
    if (!wasLocked) add('WARN', 'unlocks', where + ': unlock ' + kind + ' ' + id + ' has no effect: it is never locked (add it to setup.restrict, or drop the action)');
  }
  for (const { c, where } of conds) {
    if (c[0] === 'count' && isStr(c[1]) && c[3] !== '*') { const ok = c[1] === 'unit' ? (c[3] === 'army' || c[3] === 'worker' || realU(c[3])) : realB(c[3]); if (!ok) add('ERROR', 'names', where + ': count ' + c[1] + ' type "' + c[3] + '" does not exist'); }
    if (c[0] === 'unitsNear' && c[2] !== '*' && c[2] !== 'army' && c[2] !== 'worker' && !realU(c[2])) add('ERROR', 'names', where + ': unitsNear type "' + c[2] + '" does not exist');
    if (c[0] === 'built' && !realB(c[1])) add('ERROR', 'names', where + ': built "' + c[1] + '" is not a building');
    if (c[0] === 'trained' && !realU(c[1])) add('ERROR', 'names', where + ': trained "' + c[1] + '" is not a unit');
    if (c[0] === 'researched' && !Object.prototype.hasOwnProperty.call(A.TECH, c[1])) add('ERROR', 'names', where + ': researched "' + c[1] + '" is not a tech');
  }
  /* required but locked for ever */
  const positive = (cmp, n) => isNum(n) && ((cmp === '>=' && n >= 1) || (cmp === '>' && n >= 0) || (cmp === '==' && n >= 1));
  for (const { c, where, role } of conds) {
    const crit = role === 'primary' || role === 'win', lvl = crit ? 'ERROR' : 'WARN', need = [];
    if (c[0] === 'built' && positive(c[2], c[3])) need.push(['building', c[1]]);
    if (c[0] === 'trained' && positive(c[2], c[3])) need.push(['unit', c[1]]);
    if (c[0] === 'count' && c[2] === 'me' && positive(c[4], c[5])) need.push([c[1], c[3]]);
    if (c[0] === 'unitsNear' && c[1] === 'me' && positive(c[6], c[7])) need.push(['unit', c[2]]);
    if (c[0] === 'era' && c[1] === 'me' && (c[2] === '>=' && c[3] > maxEra0 || c[2] === '>' && c[3] + 1 > maxEra0 || c[2] === '==' && c[3] > maxEra0) && unlockEra < (c[2] === '>' ? c[3] + 1 : c[3]))
      add(lvl, 'locked', where + ': needs era ' + c[3] + ' but restrict.maxEra is ' + maxEra0 + ' and no action unlocks it');
    if ((c[0] === 'hero' && (c[1] === 'alive' || c[1] === 'level') || c[0] === 'heroNear') && heroLocked0 && !unlockedU.has(heroId)) add(lvl, 'locked', where + ': needs the hero but setup.start.hero is "none" and no action unlocks ' + heroId);
    for (const [k, id] of need) if ((k === 'building' && lockedB.has(id) && !unlockedB.has(id)) || (k === 'unit' && lockedU.has(id) && !unlockedU.has(id)))
      add(lvl, 'locked', where + ': needs ' + k + ' "' + id + '" which is restricted and never unlocked');
  }
  for (const b of lockedB) if (['hub', 'generator', 'depot'].includes(b) && !unlockedB.has(b)) add('WARN', 'restrict', 'setup.restrict locks "' + b + '" for the whole mission: the player cannot ' + (b === 'generator' ? 'raise the supply cap' : b === 'depot' ? 'build a drop-off' : 'expand'));
  if (st.era !== undefined && st.era > maxEra0) add('WARN', 'restrict', 'setup.start.era ' + st.era + ' is above restrict.maxEra ' + maxEra0);

  /* ---- texts ---- */
  const seenText = {};
  for (const o of isArr(mission.objectives) ? mission.objectives : []) {
    if (!o || !isStr(o.text)) continue;
    const L = o.text.length, w = 'objective ' + o.id;
    if (L > LIMITS.objText) add('ERROR', 'text', w + ': text is ' + L + ' chars (limit ' + LIMITS.objText + ')');
    else if (L > LIMITS.objTextWarn) add('WARN', 'text', w + ': text is ' + L + ' chars, close to the ' + LIMITS.objText + '-char limit (may wrap in the HUD)');
    if (L < LIMITS.objTextMin) add('WARN', 'text', w + ': text "' + o.text + '" is very short');
    if (/\s$|^\s/.test(o.text)) add('WARN', 'text', w + ': text has leading/trailing spaces');
    if (seenText[o.text]) add('WARN', 'text', w + ': same text as objective ' + seenText[o.text]); else seenText[o.text] = o.id;
  }
  const radioIds = new Set(); for (const { a } of acts) if (a[0] === 'radio' && isStr(a[1])) radioIds.add(a[1]);
  for (const id of radioIds) { const r = S.radio && S.radio[id]; if (!r) add('ERROR', 'text', 'radio line "' + id + '" does not exist'); else if (isStr(r.text) && r.text.length > LIMITS.radio) add('ERROR', 'text', 'radio "' + id + '" is ' + r.text.length + ' chars (limit ' + LIMITS.radio + ')'); }
  (isArr(mission.hints) ? mission.hints : []).forEach((h, i) => { if (typeof h === 'string' && h.length > LIMITS.hint) add('WARN', 'text', 'hint #' + i + ' is ' + h.length + ' chars (a one-line tip, <= ' + LIMITS.hint + ')'); });
  if (isStr(mission.title) && mission.title.length > LIMITS.title) add('WARN', 'text', 'title is ' + mission.title.length + ' chars (chapter card, <= ' + LIMITS.title + ')');

  /* ---- win / lose / par ---- */
  const hasWin = mission.win && isArr(mission.win), hasDefaultWin = !mission.noDefaultWin;
  if (!hasWin && !hasDefaultWin) add('ERROR', 'ends', 'the mission cannot be won: no `win` condition and noDefaultWin is set');
  if (!hasWin && hasDefaultWin) add('INFO', 'ends', 'no `win` condition: victory only by destroying every enemy structure (the default rule)');
  const model = sim.scheduleModel(mission), winAt = hasWin ? model.cond(mission.win) : null, par = mission.stars && mission.stars.par;
  res.info.winSchedule = winAt;
  if (!isNum(par) || par <= 0) add('WARN', 'par', 'stars.par is missing or not positive: no 3-star speed bonus');
  else {
    if (winAt !== null && winAt > par) add('ERROR', 'par', 'par ' + par + ' s is earlier than the earliest scripted win (' + Math.round(winAt) + ' s): 3 stars are impossible');
    if (par < 60) add('WARN', 'par', 'par ' + par + ' s is very short');
  }
  /* ---- player start: supply / units ---- */
  const T0 = G.teams[0];
  if (T0.used > T0.cap) add('WARN', 'setup', 'the start army uses ' + T0.used + ' supply but the cap is ' + T0.cap + ': nothing can be trained until a Generator is built (supplyBonus ' + (st.supplyBonus || 0) + ')');
  if (isArr(st.units)) for (const e of st.units) if (e && realU(e.type) && UDEF[e.type].flying === false) {
    const have = G.units.filter(u => !u.dead && u.team === 0 && u.type === e.type).length; if (have < e.n) add('ERROR', 'setup', 'setup.start.units: ' + e.n + ' ' + e.type + ' requested but ' + have + ' exist after setup');
  }
  const ai = G.ais[1];
  res.info.enemyAI = ai ? { firstWave: Math.round(ai.P.first), base: Math.round(ai.P.base * 10) / 10, step: ai.P.step, hero: ai.P.hero, air: ai.P.air } : null;
  res.info.hubs = { player: h0 ? [h0.tx, h0.ty] : null, enemy: h1 ? [h1.tx, h1.ty] : null };
  res.info.seed = G.seed; res.info.ticks = G.tick;
  if (ai && ai.P.first < 120) add('WARN', 'setup', 'the enemy AI launches its first wave after ' + Math.round(ai.P.first) + ' s (foe.mods.firstWave / difficulty): very early');
  /* clock timeline of the scripted events (INFO) */
  const tl = []; (isArr(mission.triggers) ? mission.triggers : []).forEach((t, i) => { const e = model.trigger(i); if (e !== null && e <= 3600 && t && isArr(t.do)) tl.push({ t: e, id: isStr(t.id) ? t.id : '#' + i, ops: t.do.map(a => isArr(a) ? a[0] : '?').join(',') }); });
  tl.sort((x, y) => x.t - y.t); res.info.timeline = tl;
  if (tl.length >= 2) { let gap = 0, at = 0; for (let i = 1; i < tl.length; i++) if (tl[i].t - tl[i - 1].t > gap) { gap = tl[i].t - tl[i - 1].t; at = tl[i - 1].t; } if (gap > 150) add('INFO', 'pace', 'longest quiet stretch between clock-driven scripted events: ' + Math.round(gap) + ' s after t=' + Math.round(at) + ' s (the player-driven triggers may fill it)'); }

  /* ---- can it ever be true? (static) ---- */
  const setFlags = new Set(Object.keys(s.flags || {}).filter(k => s.flags[k]));
  for (const { a } of acts) if (a[0] === 'flag' && isStr(a[1]) && a[2] === true) setFlags.add(a[1]);
  const objIds = new Set((isArr(mission.objectives) ? mission.objectives : []).filter(o => o && isStr(o.id)).map(o => o.id));
  function never(c) {                                             // returns a reason string when the condition can provably never be true, else null
    if (!isArr(c) || !isStr(c[0])) return null;
    switch (c[0]) {
      case 'flag': return isStr(c[1]) && !setFlags.has(c[1]) ? 'flag "' + c[1] + '" is never set' : null;
      case 'after': return isStr(c[1]) && !setFlags.has(c[1]) ? 'flag "' + c[1] + '" is never set' : null;
      case 'obj': return isStr(c[1]) && !objIds.has(c[1]) ? 'objective "' + c[1] + '" does not exist' : null;
      case 'all': for (let i = 1; i < c.length; i++) { const r = never(c[i]); if (r) return r; } return null;
      case 'any': { if (c.length < 2) return null; let r0 = null; for (let i = 1; i < c.length; i++) { const r = never(c[i]); if (!r) return null; r0 = r0 || r; } return r0; }
    }
    return null;
  }
  for (const { c, where, role } of roots) {
    const why = never(c); if (!why) continue;
    if (role === 'win' || role === 'primary') add('ERROR', 'unreachable', where + ' can never be true: ' + why + (role === 'win' ? ' (the mission cannot be won that way)' : ' (a primary objective that cannot be completed)'));
    else if (role === 'trigger') add('WARN', 'unreachable', where + ' can never be true: ' + why + ' (the trigger never fires)');
  }
  const horizon = Math.max(3600, 4 * (isNum(par) ? par : 0));
  (isArr(mission.triggers) ? mission.triggers : []).forEach((t, i) => { const e = model.trigger(i); if (e !== null && e > horizon && !(t && t.optional)) add('WARN', 'schedule', 'trigger ' + (t && t.id || '#' + i) + ' is scheduled at ' + Math.round(e) + ' s, far beyond any plausible mission length (par ' + (par || '?') + ' s): it will never fire'); });
  /* ---- dry run: every condition and every action once, on a scratch world, to harvest what the runtime would log (unknown ids, bad coordinates ...) ---- */
  try {
    process.env.RS = '2';
    const B = require(SIMLIB)(opts.src || process.env.SRC || undefined); sim.injectStory(B, S);
    B.newGame({ campaign: sim.clone(mission), autoResume: true }); for (let i = 0; i < 30; i++) B.step();
    const KB = B.G.camp, seenE = new Set(KB.errors);
    const harvest = (where) => { for (const e of KB.errors) if (!seenE.has(e)) { seenE.add(e); if (!/already has its hero in play|has no building to spawn/.test(e)) add('ERROR', 'runtime', 'dry run of ' + where + ' -> ' + e.replace(/^(action|cond) api /, '$1 ')); } };
    for (const { c, where } of roots) { B.campEvalCond(c); harvest(where); }
    for (const { a, where } of acts) { if (a[0] === 'win' || a[0] === 'lose') { if (a[0] === 'lose' && !isStr(a[1])) add('ERROR', 'runtime', where + ': lose needs a reason id'); continue; } B.campDo(a); harvest(where); }
  } catch (e) { add('ERROR', 'runtime', 'the dry run threw: ' + String(e && e.message || e)); }

  /* ---- ASCII map ---- */
  res.places = marks;
  if (opts.ascii !== false) res.ascii = asciiMap(A, G, marks, h0, h1);
  return res;
}

function asciiMap(A, G, marks, h0, h1) {
  const MW = A.MW, MH = A.MH, T = A.TILE, rows = [];
  for (let y = 0; y < MH; y += 2) { const row = []; for (let x = 0; x < MW; x++) { const i = y * MW + x, t = G.TT[i]; row.push(t === 3 ? '~' : t === 1 ? '#' : t === 2 ? '^' : G.RAMP[i] ? ':' : '.'); } rows.push(row); }
  const put = (x, y, c) => { x = Math.round(x); y = Math.floor(y / 2); if (rows[y] && rows[y][x] !== undefined) rows[y][x] = c; };
  for (const r of G.res) put(r.tx, r.ty, r.type === 'crystal' ? 'c' : 'g');
  for (const n of G.neutrals) put(n.tx + 1, n.ty + 1, n.type === 'post' ? 'P' : 'T');
  for (const c of G.camps) put(c.x / T, c.y / T, String(c.lvl));
  if (h0) put(h0.tx + h0.w / 2, h0.ty + h0.h / 2, 'H'); if (h1) put(h1.tx + h1.w / 2, h1.ty + h1.h / 2, 'E');
  for (const m of marks) put(m.tx, m.ty, m.ch);
  const head = '   ' + Array.from({ length: MW }, (_, x) => x % 10 === 0 ? String(x / 10 % 10) : ' ').join('') + '   (column = tile x; each row = 2 tiles, label = tile y)';
  const out = [head]; rows.forEach((r, k) => out.push(String(k * 2).padStart(2) + ' ' + r.join('')));
  out.push('   ~ void  # rock  ^ cliff  : ramp  . floor   H your Hub  E enemy Hub  1/2/3 creep camp  T tower  P post  c crystal  g geyser   letters/digits = scripted places (legend below)');
  return out.join('\n');
}

/* ------------------------------------------------------------------ CLI */
function formatResult(r, o) {
  const L = [], inf = r.info;
  L.push('=== ' + r.id + (r.title ? ' "' + r.title + '"' : '') + (inf.seed !== undefined ? '   seed ' + inf.seed + '   player Hub ' + JSON.stringify(inf.hubs.player) + '  enemy Hub ' + JSON.stringify(inf.hubs.enemy) + (inf.enemyAI ? '   enemy AI: first wave ' + inf.enemyAI.firstWave + ' s' : '   enemy AI off') : ''));
  if (r.ascii && !o.noAscii) L.push(r.ascii);
  if (r.places.length) { L.push('scripted places:'); for (const m of r.places) L.push('  ' + (m.ch || '?') + '  ' + m.label + (m.r ? '   r ' + (Math.round(m.r * 10) / 10) + ' tiles' : '') + (m.ground !== undefined ? '   ground tiles ' + m.ground : '') + (m.path !== undefined ? '   path ' + m.path + ' tiles' + (m.eta !== undefined ? ', ETA ' + m.eta + ' s' : ' from your Hub') : '') + (m.note ? '   ' + m.note : '')); }
  if (inf.timeline && inf.timeline.length && !o.noAscii) L.push('clock-driven timeline: ' + inf.timeline.map(e => Math.round(e.t) + 's ' + e.id).join(' | '));
  for (const f of r.findings) L.push('  ' + (f.level + '    ').slice(0, 5) + ' ' + (f.rule + '            ').slice(0, 12) + ' ' + f.msg);
  const e = r.findings.filter(f => f.level === 'ERROR').length, w = r.findings.filter(f => f.level === 'WARN').length;
  L.push(e || w ? '  -> ' + e + ' error(s), ' + w + ' warning(s)' : '  -> clean');
  return L.join('\n');
}
function main() {
  const o = sim.parseArgs(process.argv.slice(2));
  if (!o.ticks) o.ticks = LIMITS.ticks;
  if (o.help || o.unknown) { console.error((o.unknown ? 'unknown option ' + o.unknown.join(' ') + '\n' : '') + 'usage: node tools/mission_check.js [missionId|id,id|all] [--story path] [--ticks N=' + LIMITS.ticks + '] [--no-ascii] [--json file] [--strict] [--quiet]'); process.exit(o.help ? 0 : 2); }
  const S = sim.loadStoryData(o.story), sel = sim.selectMissions(S, o._);
  if (!S.missions.length) { console.log('mission_check: ' + (o.story || 'STORY') + ' has no missions yet: nothing to check'); process.exit(o.requireMissions ? 1 : 0); }
  if (sel.bad && sel.bad.length) { console.error('unknown mission id(s): ' + sel.bad.join(', ') + '   (have: ' + sel.all.join(', ') + ')'); process.exit(2); }
  const results = sel.ids.map(id => checkMission(S, S.missions.find(m => m.id === id), { ticks: o.ticks, ascii: !o.noAscii }));
  let ne = 0, nw = 0;
  for (const r of results) { ne += r.findings.filter(f => f.level === 'ERROR').length; nw += r.findings.filter(f => f.level === 'WARN').length; }
  if (!o.quiet) { for (const r of results) console.log(formatResult(r, o) + '\n'); console.log('mission_check: ' + results.length + ' mission(s), ' + ne + ' error(s), ' + nw + ' warning(s)'); }
  if (o.json) { fs.mkdirSync(path.dirname(path.resolve(o.json)), { recursive: true }); fs.writeFileSync(o.json, JSON.stringify(results.map(r => ({ id: r.id, findings: r.findings, places: r.places, info: r.info })), null, 1)); }
  process.exit(ne || (o.strict && nw) ? 1 : 0);
}
if (require.main === module) main();
module.exports = { checkMission, collect, asciiMap, formatResult, LIMITS };
