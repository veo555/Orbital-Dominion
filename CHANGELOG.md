# Changelog
## 6.2.0
* Watch mode, more fun: **📅 Match of the day** (one deterministic Hard/Master match per UTC day, the same for everyone — share the date, not a code), **🎲 Surprise me** (random factions, tiers and map), and **Call the winner** (pick A or B before 1:30 of game time; a streak, best streak and record are kept in your browser only).
* `replaySetupFromSeed` / `replayDailySetup` in `47_replay.js`, covered by 8 new headless checks and 3 new mutants; 11 new browser checks.
## 6.1.0
* Replay determinism: `rnd()` stream, replay codes (`OD1-…`), per-side tiers, checkpoint hashes (`47_replay.js`).
* Spectator mode "Watch agents": win-chance graph, per-agent reasons, `#watch=<code>` deep links (`75_spectate.js`).
* `tools/tournament.js`: agent tournaments with Wilson intervals, Bradley–Terry ratings, replay codes.
* MCP server (`mcp/`): play or watch via tools, fog-honest observations, command-log verification.
* Research: `research/manager-diligence`, `research/quant-lab` (numpy only, mutation-tested).
* v6 content merged: FORTIFY (walls, gates, bunkers, mines, detection) and ARSENAL (new units, tiers).
* Hosting: GitHub Pages (PWA), Hugging Face Space and tournament dataset.
## 6.0 and earlier
See `docs/` (v4 research report, v5 graphics/AI notes, `docs/KNOWN_LIMITATIONS_AND_TEST_RESULTS.md`).
