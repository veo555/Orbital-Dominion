#!/usr/bin/env node
/* A tiny scripted client for the engine (no language model): shows the whole play loop and gives a baseline that an LLM player can try to beat.
     node mcp/examples/scripted_player.js [seed] [tier]        e.g. seed 7, tier easy
   Strategy: Haulers to 12, a Generator whenever supply is close to the cap, a Garrison, then Riflemen in waves; attack-move the mirrored map corner, then
   whatever enemy building it has seen.  It is deliberately simple and a WEAK baseline: on seeds 7-9 against Easy it loses its Hub (it hoards crystals and attacks into the enemy base). A language-model player, or you, should beat it. */
const { Engine } = require('../engine.js');
const seed = +(process.argv[2] || 7), tier = process.argv[3] || 'easy';
const E = new Engine(), m = E.newMatch({ mode: 'play', faction: 'meridian', enemy: 'obsidian', tier, seed });
const run = (c) => m.commands(c);
let turn = 0, attacking = false; const spots = [[5, 0], [-3, 0], [0, 5], [0, -3], [6, 3], [-4, 4], [8, 0], [0, 8], [-6, 0], [0, -6], [8, 5], [-6, 5], [5, -5], [-7, -3]];
let spotIdx = 0;
function tryBuild(s, type) {
  const w = s.your_workers.ids.find((id) => !m.G.units.find((u) => u.id === id).order.t.startsWith('build')) || s.your_workers.ids[0], hub = s.your_buildings.find((b) => b.type === 'hub');
  for (let k = 0; k < spots.length; k++) { const [dx, dy] = spots[(spotIdx + k) % spots.length]; const r = run([{ type: 'build', worker_id: w, building: type, tx: hub.tile[0] + dx, ty: hub.tile[1] + dy }]); if (r[0].ok) { spotIdx = (spotIdx + k + 1) % spots.length; return true; } }
  return false;
}
while (!m.G.over && m.time < 1500 && turn++ < 400) {
  const s = m.state(), hub = s.your_buildings.find((b) => b.type === 'hub'); if (!hub) break;
  const workers = s.your_workers.count, army = s.your_army.length, sup = s.you.supply;
  const has = (t) => s.your_buildings.some((b) => b.type === t), done = (t) => s.your_buildings.some((b) => b.type === t && b.done), building = (t) => s.your_buildings.some((b) => b.type === t && !b.done);
  const idle = s.idle_workers; if (idle.length) { const r = s.resources.find((x) => x.type === 'crystal'); if (r) run([{ type: 'gather', unit_ids: idle, resource_id: r.id }]); }
  if (workers < 12 && hub.queue.length < 2) run([{ type: 'train', building_id: hub.id, unit: 'hauler' }]);
  if (sup[0] >= sup[1] - 6 && sup[1] < 100 && s.your_buildings.filter((b) => b.type === 'generator' && !b.done).length < 2 && s.you.crystals >= 100) tryBuild(s, 'generator');
  if (s.your_buildings.filter((b) => b.type === 'garrison').length < (s.you.crystals > 900 ? 4 : s.you.crystals > 450 ? 3 : army >= 6 ? 2 : 1) && s.you.crystals >= 150 && done('generator') && !building('garrison')) tryBuild(s, 'garrison');
  const gars = s.your_buildings.filter((b) => b.type === 'garrison' && b.done), gar = gars[0];
  for (const g of gars) if (g.queue.length < 3) run([{ type: 'train', building_id: g.id, unit: 'rifleman' }, { type: 'train', building_id: g.id, unit: 'rifleman' }]);
  const ids = s.your_army.map((u) => u.id);
  if (!attacking && army >= 34) attacking = true;
  if (attacking && ids.length) {
    const target = s.known_enemy_buildings.find((b) => b.side === 'enemy') || s.visible_enemies.find((e) => e.side === 'enemy');
    const [tx, ty] = target ? target.tile : [Math.max(2, s.map.width_tiles - hub.tile[0] - 2), Math.max(2, s.map.height_tiles - hub.tile[1] - 2)];
    run([{ type: 'attack_move', unit_ids: ids.slice(0, 60), tx: Math.min(tx, s.map.width_tiles - 1), ty: Math.min(ty, s.map.height_tiles - 1) }]);
    if (army < 5) attacking = false;
  } else if (ids.length) { const rally = { tx: hub.tile[0] + 6, ty: hub.tile[1] + 4 }; if (gar) run([{ type: 'rally', building_id: gar.id, tx: rally.tx, ty: rally.ty }]); }
  if (process.env.DBG2) console.error(Math.round(m.time), "army", army, "w", workers, "c", s.you.crystals, "sup", sup.join("/"), "att", attacking, "foes", s.visible_enemies.filter(e=>e.side==="enemy").length);
  const adv = m.advance(15, true);
  if (adv.stopped_early === 'under attack') { const st = m.state(), foe = st.visible_enemies.find((e) => e.side === 'enemy'); const ids2 = st.your_army.map((u) => u.id); if (ids2.length) run([{ type: 'attack_move', unit_ids: ids2.slice(0, 60), tx: foe ? foe.tile[0] : hub.tile[0], ty: foe ? foe.tile[1] : hub.tile[1] }]); attacking = false; m.advance(5, false); }
}
const f = m.state(); if (process.env.DBG) console.error(JSON.stringify({turn, over: m.G.over, hubs: f.your_buildings.map(b=>b.type+":"+b.hp), enemies: f.visible_enemies.length, msgs: f.messages}));
console.log(JSON.stringify({ code: m.code(), result: m.G.over || (f.your_buildings.some((b) => b.type === 'hub') ? 'no result (turn or time cap)' : 'lost its Hub (the match continues with what is left)'), time_s: Math.round(m.time), your_army: f.your_army ? f.your_army.length : 0, commands_logged: m.log.length, final_hash: m.hash() }));
