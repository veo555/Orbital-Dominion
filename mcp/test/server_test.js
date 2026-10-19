/* End-to-end MCP test: spawns the real server over stdio and talks to it with the official MCP client.
     node mcp/test/server_test.js */
'use strict';
const path = require('path');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok    ' : 'FAIL  ') + m); if (!c) fails++; };
const J = (r) => JSON.parse(r.content[0].text);
(async () => {
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(__dirname, '..', 'server.js')], stderr: 'pipe' });
  const client = new Client({ name: 'od-test', version: '1.0.0' });
  await client.connect(transport);
  const tools = (await client.listTools()).tools.map((t) => t.name).sort();
  ok(JSON.stringify(tools) === JSON.stringify(['od_advance', 'od_catalog', 'od_command', 'od_end_match', 'od_log', 'od_new_match', 'od_state', 'od_verify_log']), 'the 8 tools are listed: ' + tools.join(' '));
  const t0 = (await client.listTools()).tools.find((t) => t.name === 'od_new_match');
  ok(t0.description.length > 100 && t0.inputSchema && t0.inputSchema.properties.mode, 'tools carry descriptions and JSON schemas');
  const prompts = (await client.listPrompts()).prompts.map((p) => p.name); ok(prompts.includes('play_a_match'), 'the play_a_match prompt is offered');
  const cat = J(await client.callTool({ name: 'od_catalog', arguments: { faction: 'obsidian' } })); ok(cat.units.length > 5 && cat.buildings.length > 5, 'od_catalog returns units and buildings');
  const nm = J(await client.callTool({ name: 'od_new_match', arguments: { mode: 'play', faction: 'aurora', enemy: 'meridian', tier: 'easy', seed: 11 } }));
  ok(/^m\d+$/.test(nm.match_id) && nm.replay_code === 'OD1-11-aurora-meridian-easy-easy-m', 'od_new_match returns an id and code: ' + nm.replay_code);
  const id = nm.match_id, hub = nm.state.your_buildings[0];
  const c1 = J(await client.callTool({ name: 'od_command', arguments: { match_id: id, commands: [{ type: 'train', building_id: hub.id, unit: 'hauler' }, { type: 'train', building_id: hub.id, unit: 'rifleman' }] } }));
  ok(c1.results[0].ok === true && c1.results[1].ok === false && c1.results[1].error, 'od_command: one valid, one invalid command each get a result');
  const adv = J(await client.callTool({ name: 'od_advance', arguments: { match_id: id, seconds: 30 } })); ok(adv.advanced_s === 30 && adv.units_trained.hauler === 1, 'od_advance 30 s trains the Hauler');
  const st = J(await client.callTool({ name: 'od_state', arguments: { match_id: id } })); ok(st.time_s === 30 && st.visible_enemies.length === 0, 'od_state: clock and fog');
  const bad = await client.callTool({ name: 'od_advance', arguments: { match_id: id, seconds: 1000 } }); ok(bad.isError === true, 'out-of-range seconds is an error result (' + bad.content[0].text.slice(0, 60).replace(/\n/g, ' ') + ')');
  const unk = await client.callTool({ name: 'od_state', arguments: { match_id: 'zzz' } }); ok(unk.isError === true && /unknown match_id/.test(unk.content[0].text), 'unknown match id is a clear error');
  const strict = await client.callTool({ name: 'od_command', arguments: { match_id: id, commands: [{ type: 'train', building_id: hub.id, unit: 'hauler', evil: 'x' }] } }); ok(strict.isError === true, 'unexpected fields in a command are rejected');
  const log = J(await client.callTool({ name: 'od_log', arguments: { match_id: id } })); ok(log.commands.length === 1 && log.code === nm.replay_code, 'od_log holds the one accepted command');
  const ver = J(await client.callTool({ name: 'od_verify_log', arguments: { log } })); ok(ver.reproduced === true, 'od_verify_log reproduces the match from the log (hash ' + ver.hash + ')');
  const forged = JSON.parse(JSON.stringify(log)); forged.final_hash = (log.final_hash + 1) >>> 0; const ver2 = J(await client.callTool({ name: 'od_verify_log', arguments: { log: forged } })); ok(ver2.reproduced === false, 'control: a forged final hash is NOT reported as reproduced');
  const w = J(await client.callTool({ name: 'od_new_match', arguments: { mode: 'watch', faction: 'aurora', enemy: 'obsidian', your_tier: 'master', tier: 'hard', seed: 424242 } }));
  await client.callTool({ name: 'od_advance', arguments: { match_id: w.match_id, seconds: 60 } });
  const ws = J(await client.callTool({ name: 'od_state', arguments: { match_id: w.match_id } })); ok(ws.side_a && ws.side_b && ws.side_a.agent.posture, 'watch mode over MCP shows both agents');
  const end = J(await client.callTool({ name: 'od_end_match', arguments: { match_id: id } })); ok(end.ended === id, 'od_end_match closes a match');
  await client.close();
  console.log('\n' + (fails ? fails + ' MCP SERVER CHECK(S) FAILED' : 'ALL MCP SERVER CHECKS PASSED')); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('FAIL  exception: ' + (e && e.stack || e)); process.exit(1); });
