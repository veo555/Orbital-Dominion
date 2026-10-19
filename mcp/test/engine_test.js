/* MCP engine tests (no MCP transport): fog honesty, command validation, determinism / replay of a command log, watch mode, limits.
     node mcp/test/engine_test.js            checks
     node mcp/test/engine_test.js --mutants  CLAUDE.md rule 15: each check must FAIL on a mutated copy of the engine */
'use strict';
const fs = require('fs'), path = require('path'), Module = require('module');
const MUT = process.argv.includes('--mutants');
const ENGINE = path.join(__dirname, '..', 'engine.js');
function loadEngine(xform) {
  if (!xform) return require(ENGINE);
  const src = xform(fs.readFileSync(ENGINE, 'utf8')); const m = new Module(ENGINE, module); m.filename = ENGINE; m.paths = Module._nodeModulePaths(path.dirname(ENGINE)); m._compile(src, ENGINE); return m.exports;
}
function suite(xform) {
  const fails = []; let n = 0; const ok = (c, msg) => { n++; if (!c) fails.push(msg); if (!MUT) console.log((c ? 'ok    ' : 'FAIL  ') + msg); };
  const { Engine, replayLog } = loadEngine(xform);
  const E = new Engine();
  /* ---- play mode: fog and observation */
  const m = E.newMatch({ mode: 'play', faction: 'meridian', enemy: 'obsidian', tier: 'easy', seed: 7 });
  let s = m.state();
  ok(s.mode === 'play' && s.replay_code === 'OD1-7-meridian-obsidian-easy-easy-m', 'play match has a replay code: ' + s.replay_code);
  ok(s.visible_enemies.length === 0 && s.known_enemy_buildings.length === 0, 'at the start no enemy unit or building is visible (fog)');
  ok(s.your_buildings.length === 1 && s.your_buildings[0].type === 'hub' && s.your_workers.count === 6, 'you start with one Hub and 6 Haulers');
  const hub = s.your_buildings[0], enemyHub = m.G.buildings.find((b) => b.team === 1 && b.type === 'hub');
  ok(!JSON.stringify(s).includes('"id":' + enemyHub.id + ','), 'the enemy Hub id is not leaked in the observation');
  ok(s.resources.every((r) => Math.abs(r.tile[0] - hub.tile[0]) < 60) && !s.resources.some((r) => Math.hypot(r.tile[0] - enemyHub.tx, r.tile[1] - enemyHub.ty) < 6), 'resource list only holds explored patches (none at the enemy base)');
  ok(s.you.crystals === 500 || s.you.crystals > 0, 'starting resources are reported (' + s.you.crystals + ')');
  /* ---- commands: valid and invalid */
  let r = m.commands([{ type: 'train', building_id: hub.id, unit: 'hauler' }]); ok(r[0].ok === true, 'train a Hauler at the Hub');
  r = m.commands([{ type: 'train', building_id: hub.id, unit: 'rifleman' }]); ok(r[0].ok === false && /cannot be trained here/.test(r[0].error), 'a Rifleman cannot be trained at a Hub: ' + r[0].error);
  r = m.commands([{ type: 'train', building_id: enemyHub.id, unit: 'hauler' }]); ok(r[0].ok === false && /not yours|no building/.test(r[0].error), 'cannot command the enemy\'s building');
  r = m.commands([{ type: 'move', unit_ids: [enemyHub.id], tx: 5, ty: 5 }]); ok(r[0].ok === false, 'cannot order something that is not your unit');
  r = m.commands([{ type: 'move', unit_ids: s.your_workers.ids.slice(0, 1), tx: 99999, ty: 5 }]); ok(r[0].ok === false && /outside the map/.test(r[0].error), 'out-of-map tile refused');
  r = m.commands([{ type: 'build', worker_id: s.your_workers.ids[0], building: 'nonsense', tx: 1, ty: 1 }]); ok(r[0].ok === false && /unknown building/.test(r[0].error), 'unknown building refused');
  r = m.commands([{ type: 'build', worker_id: s.your_workers.ids[0], building: 'generator', tx: hub.tile[0] + 0.5, ty: 3 }]); ok(r[0].ok === false, 'non-integer tile refused');
  let threw = false; try { m.commands([]); } catch (e) { threw = true; } ok(threw, 'empty command list is refused');
  threw = false; try { m.commands(new Array(41).fill({ type: 'stop', unit_ids: [1] })); } catch (e) { threw = true; } ok(threw, 'more than 40 commands refused');
  const crystalsBefore = m.state().you.crystals; r = m.commands([{ type: 'train', building_id: hub.id, unit: 'hauler' }, { type: 'train', building_id: hub.id, unit: 'hauler' }, { type: 'train', building_id: hub.id, unit: 'hauler' }, { type: 'train', building_id: hub.id, unit: 'hauler' }, { type: 'train', building_id: hub.id, unit: 'hauler' }, { type: 'train', building_id: hub.id, unit: 'hauler' }]);
  ok(r.filter((x) => x.ok).length < 6 && r.some((x) => !x.ok), 'the queue limit refuses the excess trains (' + r.filter((x) => x.ok).length + ' of 6 accepted)');
  /* ---- time, economy, a build */
  let a = m.advance(30, true); ok(a.advanced_s === 30 && Object.keys(a.units_trained).length > 0, 'advance 30 s: units trained ' + JSON.stringify(a.units_trained));
  const w = m.state().your_workers.ids[0]; let placed = false;
  for (const [dx, dy] of [[5, 0], [-3, 0], [0, 5], [0, -3], [6, 3], [-4, 4]]) { r = m.commands([{ type: 'build', worker_id: w, building: 'generator', tx: hub.tile[0] + dx, ty: hub.tile[1] + dy }]); if (r[0].ok) { placed = true; break; } }
  ok(placed, 'a Generator can be placed near the Hub');
  a = m.advance(40, true); ok(a.buildings_finished.includes('generator'), 'the Generator finishes and is reported: ' + JSON.stringify(a.buildings_finished));
  s = m.state(); ok(s.you.supply[1] > 10 && s.your_buildings.some((b) => b.type === 'generator' && b.done), 'supply cap grew with the Generator (' + s.you.supply.join('/') + ')');
  threw = false; try { m.advance(0.5); } catch (e) { threw = true; } ok(threw, 'advancing less than 1 s is refused');
  threw = false; try { m.advance(500); } catch (e) { threw = true; } ok(threw, 'advancing more than 120 s is refused');
  /* ---- replay of the command log */
  const log = m.exportLog(), rep = replayLog(log, (c) => E.parseCode(c));
  ok(log.commands.length >= 3 && rep.hash === log.final_hash && rep.tick === log.tick, 'the command log replays to the same state hash (' + log.final_hash + ')');
  const tampered = JSON.parse(JSON.stringify(log)); tampered.commands.pop(); const rep2 = replayLog(tampered, (c) => E.parseCode(c));
  ok(rep2.hash !== log.final_hash, 'control: a log with a command removed does NOT reproduce (the check can fail)');
  /* ---- watch mode */
  const w2 = E.newMatch({ mode: 'watch', faction: 'aurora', enemy: 'obsidian', your_tier: 'master', tier: 'hard', seed: 424242 });
  threw = false; r = w2.commands.bind(w2); try { w2.commands([{ type: 'stop', unit_ids: [1] }]); } catch (e) { threw = true; } const rr = (() => { try { return w2.commands([{ type: 'stop', unit_ids: [1] }]); } catch (e) { return e; } })();
  ok(threw || (Array.isArray(rr) && rr[0].ok === false) || rr instanceof Error, 'commands are refused in watch mode');
  const wa = w2.advance(60); const ws = w2.state();
  ok(ws.side_a && ws.side_b && ws.side_a.agent && ws.side_a.agent.posture && ws.side_b.agent.own_win_estimate !== undefined, 'watch mode reports both sides and each agent\'s posture and own win estimate');
  ok(w2.code() === 'OD1-424242-aurora-obsidian-master-hard-m' && wa.advanced_s === 60, 'watch match code and clock');
  const w3 = E.newMatch({ code: 'OD1-424242-aurora-obsidian-master-hard-m', mode: 'watch' }); w3.advance(60);
  ok(w3.hash() === w2.hash(), 'a watch match started from its code reaches the same hash as the original');
  /* ---- limits and errors */
  threw = false; try { E.get('nope'); } catch (e) { threw = true; } ok(threw, 'unknown match id refused');
  threw = false; try { E.newMatch({ mode: 'play', faction: 'aurora', enemy: 'aurora' }); } catch (e) { threw = true; } ok(threw, 'same faction on both sides refused');
  threw = false; try { E.newMatch({ code: 'garbage' }); } catch (e) { threw = true; } ok(threw, 'invalid replay code refused');
  E.end(m.id); E.end(w2.id); E.end(w3.id); const open = []; threw = false; try { for (let i = 0; i < 5; i++) open.push(E.newMatch({ mode: 'watch', seed: i + 1 })); } catch (e) { threw = true; } ok(threw && open.length === 4, 'at most 4 matches can be open');
  const cat = E.catalog('aurora'); ok(cat.units.some((u) => u.id === 'hauler') && cat.buildings.some((b) => b.id === 'garrison' && b.trains.includes('rifleman')), 'catalog lists units and what buildings train');
  return { fails, n };
}
if (!MUT) { const r = suite(); console.log('\n' + (r.n - r.fails.length) + ' checks passed, ' + r.fails.length + ' failed'); if (r.fails.length) { console.log('FAILED:\n  ' + r.fails.join('\n  ')); process.exit(1); } console.log('ALL MCP ENGINE CHECKS PASSED'); }
else {
  const M = [
    ['fog leak: all enemy units listed', (c) => c.replace("if (!seen(0,e))continue;o.push(e.id)", "o.push(e.id)").replace("if(!seen(0,e))continue;o.push(e.id);", "o.push(e.id);")],
    ['enemy buildings always known', (c) => c.replace('b.team !== 0 && b.seen0)', 'b.team !== 0)')],
    ['can command enemy buildings', (c) => c.replace("this.need(b.team === 0, 'building ' + id + ' is not yours');", '')],
    ['commands skip the production check', (c) => c.replace("this.need(this.run('prodList(G.buildings.find(x=>x.id===' + b.id + '))').includes(c.unit)", "this.need(true")],
    ['commands not logged', (c) => c.replace('this.log.push({ tick: this.G.tick, cmd: c });', '')],
    ['log tick not recorded correctly', (c) => c.replace('this.log.push({ tick: this.G.tick, cmd: c })', 'this.log.push({ tick: 0, cmd: c })')],
    ['unlimited open matches', (c) => c.replace('if (this.matches.size >= MAX_MATCHES)', 'if (false)')],
    ['no advance limit', (c) => c.replace('this.need(seconds >= 1 && seconds <= MAX_ADVANCE_S', 'this.need(true')],
    ['map bounds not checked', (c) => c.replace("this.need(x >= 0 && y >= 0 && x < this.run('MW') && y < this.run('MH'), 'tile (' + x + ',' + y + ') is outside the map');", '')],
    ['finished buildings never reported', (c) => c.replace('if (d.done && !(before.buildings.has(id) && before.buildings.get(id).done)) done.push(d.type);', '')],
  ];
  let bad = 0;
  for (const [name, fn] of M) { let caught; try { const r = suite((c) => { const o = fn(c); if (o === c) throw new Error('mutation did not apply: ' + name); return o; }); caught = r.fails.length > 0; } catch (e) { if (/did not apply/.test(String(e))) throw e; caught = true; } console.log((caught ? 'ok    ' : 'NOT CAUGHT ') + 'mutant: ' + name); if (!caught) bad++; }
  if (bad) { console.log(bad + ' MUTANT(S) NOT CAUGHT'); process.exit(1); } console.log('ALL MUTANTS CAUGHT');
}
