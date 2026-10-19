# Orbital Dominion over MCP: let an AI play (or watch) the game

An [MCP](https://modelcontextprotocol.io) server that exposes the game's headless, deterministic simulation as tools. Any MCP client (Claude, Cursor, Grok when it supports MCP, your own script) can:

* **play** a full real-time-strategy match as side A against a built-in agent (Easy, Normal, Hard or Master), seeing only what its units see (**fog of war is enforced**), or
* **watch** two built-in agents play each other and read each agent's posture and its own win estimate.

Why it is interesting: it turns the project's research question into something you can run. *How does a language-model player compare with the league-tuned agents, and what does it do with the "why" text?* The game itself still contains **no language model**; this adapter only lets an outside client drive it. Everything runs locally over stdio; nothing is sent anywhere.

## Install and run
```
git clone https://github.com/veo555/Orbital-Dominion
cd Orbital-Dominion/mcp && npm install
node server.js            # speaks MCP over stdio; your client starts it for you
```
Requires Node 18+ (tested on 22).

### Client configuration
Claude Code: `claude mcp add orbital-dominion -- node /absolute/path/to/Orbital-Dominion/mcp/server.js`

Claude Desktop / Cursor (`mcpServers` in the client's JSON config):
```json
{ "mcpServers": { "orbital-dominion": { "command": "node", "args": ["/absolute/path/to/Orbital-Dominion/mcp/server.js"] } } }
```
Then ask: *"Use the play_a_match prompt: start a match against a Normal agent and try to win. Explain each decision briefly."*

## Tools
| tool | what it does |
|---|---|
| `od_catalog` | units, buildings, eras, techs for a faction (costs, build times, what each building trains) |
| `od_new_match` | `mode` play or watch, factions, tier(s), seed, or a replay `code`; returns `match_id`, `replay_code` and the first observation |
| `od_state` | fog-honest observation (tiles, hp %, queues, visible enemies, last-known enemy buildings, explored resources); watch mode shows both sides |
| `od_command` | up to 40 commands: `train`, `research`, `advance_era`, `hero`, `build`, `move`, `attack_move`, `attack`, `gather`, `repair`, `stop`, `hold`, `rally`; one result per command, invalid commands change nothing |
| `od_advance` | run 1-120 s of game time; stops early when your side is attacked; reports units/buildings lost, trained, finished |
| `od_log` / `od_verify_log` | export every accepted command with its tick plus the final state hash, and re-run it from scratch to prove it reproduces |
| `od_end_match` | free a match (at most 4 open) |

A prompt, `play_a_match`, gives a short plan and asks the model to explain its reasoning.

## Properties
* **Fog-honest:** an observation never contains an enemy unit you cannot see; enemy buildings appear only after you have seen them. Tested, with a mutant that leaks the enemy and must fail.
* **Reproducible:** a play match is `replay code + command log`. `od_verify_log` re-runs it and compares a state hash (tested, including a forged hash that must be rejected).
* **Bounded:** at most 4 matches, 120 s per advance, 3600 s per match, 40 commands per call, strict input schemas (unknown fields are rejected).
* **Local:** stdio only, no network, no filesystem access beyond loading the game's own source.

## Tests
```
cd mcp && npm test                       # engine checks + a real MCP client talking to the real server over stdio
node test/engine_test.js --mutants       # each check must FAIL on a mutated copy of the engine (10 mutants)
node examples/scripted_player.js 7 easy  # a scripted (non-LLM) client playing a whole game through the engine
```

## Limits (honest)
* The scripted example player is a **weak baseline**: on seeds 7-9 against Easy it loses its Hub. Nobody has yet measured how language-model players do.
* Observations are JSON text; a long game produces long states (armies are capped at 80 entries unless `full:true`).
* Only the first-class orders listed above are exposed: no abilities (stim, siege...), walls or cargo yet. Those exist in the simulation and are good first contributions.
* Local stdio only. A remote (HTTPS) deployment, which some marketplaces require, is not built; see the notes in `docs/MCP_MARKETPLACE.md`.
