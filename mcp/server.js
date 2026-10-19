#!/usr/bin/env node
'use strict';
/* Orbital Dominion MCP server (stdio). Lets an MCP client (Claude, Grok, Cursor, ...) play or watch the game through tools.
   Run:  node mcp/server.js     (after `cd mcp && npm install`)     See mcp/README.md.
   The game itself contains no language model; this adapter only exposes the headless simulation. Everything is local: no network. */
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const { Engine, MatchError, replayLog, TIERS, FACTIONS, MAX_ADVANCE_S, MAX_CMDS } = require('./engine.js');

const engine = new Engine();
const text = (o) => ({ content: [{ type: 'text', text: typeof o === 'string' ? o : JSON.stringify(o) }] });
const fail = (msg) => ({ isError: true, content: [{ type: 'text', text: msg }] });
const guard = (fn) => async (args) => { try { return text(await fn(args)); } catch (e) { if (e instanceof MatchError) return fail(e.message); return fail('internal error: ' + (e && e.message)); } };

const server = new McpServer({ name: 'orbital-dominion', version: '0.1.0' });

server.registerTool('od_catalog', {
  title: 'Game catalog', description: 'List the units, buildings, eras and techs of Orbital Dominion for a faction (costs, build times, what each building trains). Read this first to plan a build order. Static data; no match needed.',
  inputSchema: { faction: z.enum(FACTIONS).optional().describe('meridian (fortress builders), obsidian (aggressors) or aurora (merchants and shadows). Default meridian.') },
  annotations: { readOnlyHint: true, idempotentHint: true } }, guard(async ({ faction }) => engine.catalog(faction)));

server.registerTool('od_new_match', {
  title: 'Start a match',
  description: 'Start a new real-time strategy match. mode "play": YOU command side A (you start with a Hub and 6 Haulers) against a built-in agent of the chosen tier; destroy every enemy structure to win. mode "watch": two built-in agents play each other and you only advance time. Every match has a short replay code; the same code (and, in play mode, the same commands) reproduces the match exactly. Returns the match id and the first observation.',
  inputSchema: {
    mode: z.enum(['play', 'watch']).default('play'),
    faction: z.enum(FACTIONS).optional().describe('Your faction (side A).'), enemy: z.enum(FACTIONS).optional().describe('Opponent faction (side B); must differ.'),
    tier: z.enum(TIERS).optional(),
    your_tier: z.enum(TIERS).optional().describe('watch mode only: the tier of side A.'),
    seed: z.number().int().min(0).max(4294967295).optional().describe('Map seed; omit for random.'),
    rocks: z.boolean().optional().describe('Rocks and rich crystal fields on the map (default true).'),
    code: z.string().max(100).optional().describe('A replay code like OD1-424242-aurora-obsidian-master-hard-m; overrides the other setup fields.') },
  annotations: { readOnlyHint: false, openWorldHint: false } }, guard(async (a) => { const m = engine.newMatch(a); return { match_id: m.id, replay_code: m.code(), state: m.state() }; }));

server.registerTool('od_state', {
  title: 'Observe the match', description: 'Fog-honest observation of the match (play mode: only what your units and buildings can see; watch mode: both sides with each agent\'s own win estimate and posture). Coordinates are tiles. Set full:true for every unit (long).',
  inputSchema: { match_id: z.string(), full: z.boolean().optional() }, annotations: { readOnlyHint: true } }, guard(async ({ match_id, full }) => engine.get(match_id).state({ full })));

server.registerTool('od_command', {
  title: 'Issue commands (play mode)', description: 'Issue up to ' + MAX_CMDS + ' commands at the current moment (they take effect as time advances). Each command is an object with a "type": train{building_id,unit} | research{building_id,tech} | advance_era{building_id} | hero{building_id} | build{worker_id,building,tx,ty,queue?} | move{unit_ids,tx,ty,queue?} | attack_move{unit_ids,tx,ty,queue?} | attack{unit_ids,target_id,queue?} | gather{unit_ids,resource_id,queue?} | repair{unit_ids,target_id} | stop{unit_ids} | hold{unit_ids} | rally{building_id,tx,ty}. Coordinates are tiles. Returns one result per command ({ok} or {error}); invalid commands change nothing.',
  inputSchema: { match_id: z.string(), commands: z.array(z.object({ type: z.enum(['train', 'research', 'advance_era', 'hero', 'build', 'move', 'attack_move', 'attack', 'gather', 'repair', 'stop', 'hold', 'rally']),
      building_id: z.number().int().optional(), unit: z.string().max(40).optional(), tech: z.string().max(40).optional(), worker_id: z.number().int().optional(), building: z.string().max(40).optional(),
      unit_ids: z.array(z.number().int()).max(60).optional(), target_id: z.number().int().optional(), resource_id: z.number().int().optional(),
      tx: z.number().int().optional(), ty: z.number().int().optional(), queue: z.boolean().optional() }).strict()).min(1).max(MAX_CMDS) },
  annotations: { readOnlyHint: false, destructiveHint: false } }, guard(async ({ match_id, commands }) => ({ results: engine.get(match_id).commands(commands) })));

server.registerTool('od_advance', {
  title: 'Advance game time', description: 'Run the match forward by N seconds of game time (1 to ' + MAX_ADVANCE_S + '). In play mode it stops early if your side comes under attack (stop_on_alert, default true) so you can react. Returns what changed: units and buildings lost or finished.',
  inputSchema: { match_id: z.string(), seconds: z.number().min(1).max(MAX_ADVANCE_S).default(10), stop_on_alert: z.boolean().optional() }, annotations: { readOnlyHint: false } },
  guard(async ({ match_id, seconds, stop_on_alert }) => engine.get(match_id).advance(seconds, stop_on_alert !== false)));

server.registerTool('od_log', {
  title: 'Export replay log', description: 'Export the replay log of a match: its replay code, every command with the tick it was applied, and the final state hash. Feed it to od_verify_log to prove the match reproduces.',
  inputSchema: { match_id: z.string() }, annotations: { readOnlyHint: true } }, guard(async ({ match_id }) => engine.get(match_id).exportLog()));

server.registerTool('od_verify_log', {
  title: 'Verify a replay log', description: 'Re-run a replay log from scratch (play mode logs from od_log) and report whether the final state hash matches. Takes a few seconds.',
  inputSchema: { log: z.object({ format: z.literal('orbital-dominion-mcp-log'), v: z.literal(1), code: z.string().max(100), tick: z.number().int().min(0).max(108000), final_hash: z.number(),
    commands: z.array(z.object({ tick: z.number().int().min(0), cmd: z.record(z.any()) })).max(5000) }) }, annotations: { readOnlyHint: true } },
  guard(async ({ log }) => { const r = replayLog(log, (c) => engine.parseCode(c)); return { reproduced: r.hash === log.final_hash, hash: r.hash, expected: log.final_hash, tick: r.tick }; }));

server.registerTool('od_end_match', { title: 'End a match', description: 'Close a match and free its memory (at most 4 matches can be open).', inputSchema: { match_id: z.string() }, annotations: { destructiveHint: false } },
  guard(async ({ match_id }) => engine.end(match_id)));

server.registerPrompt('play_a_match', { title: 'Play a match of Orbital Dominion', description: 'A short plan for playing well through the tools' },
  () => ({ messages: [{ role: 'user', content: { type: 'text', text: [
    'You are playing Orbital Dominion through MCP tools. Plan: 1) od_catalog for your faction. 2) od_new_match mode "play" against a Normal agent.',
    '3) Loop: od_state, then od_command (train Haulers from the Hub until about 14, build a Generator before you hit the supply cap, then a Garrison, then soldiers), then od_advance 10-20 seconds.',
    '4) Scout with one fast unit; keep your army together; defend when od_advance reports an attack; attack when your army is clearly larger. Win by destroying every enemy structure.',
    'Coordinates are tiles. You only see what your units see (fog of war). Explain your reasoning briefly each turn so a human can learn from it.'].join('\n') } }] }));

(async () => { await server.connect(new StdioServerTransport()); })();
