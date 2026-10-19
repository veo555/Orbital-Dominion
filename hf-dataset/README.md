---
license: mit
pretty_name: Orbital Dominion agent tournament (48 replayable games)
size_categories:
  - n<1K
task_categories:
  - reinforcement-learning
tags:
  - multi-agent
  - self-play
  - rts
  - game-ai
  - evaluation
  - replays
---

# Orbital Dominion: agent tournament results (48 replayable games)

Results of a round-robin between three built-in agent tiers (`master`, `hard`, `normal`) of the open-source RTS testbed **Orbital Dominion** (https://github.com/veo555/Orbital-Dominion). Eight games per ordered pair of tiers; sides and factions rotate; 540 s cap; seeds 7000-7047.

## Files
- `games.csv`: one row per game.
- `report.md`: scores with 95% Wilson intervals and a Bradley-Terry Elo.

## Columns of `games.csv`
`tierA, tierB, factionA, factionB, seed, result_for_A` (1 win / 0.5 draw / 0 loss for side A), `adjudicated` (1 = decided by the material-share rule at the cap, not by destroying a base), `game_seconds`, `material_share_A`, `replay_code`, `final_state_hash`.

## Replaying a game
Every `replay_code` (for example `OD1-7000-meridian-obsidian-master-hard-m`) reproduces that exact match: paste it into **Watch agents** in the game (https://veo555.github.io/Orbital-Dominion/) or open `https://veo555.github.io/Orbital-Dominion/#watch=<code>`. `final_state_hash` lets you verify a headless re-run (see `docs/EVALUATE.md` in the repository). Replays are valid for the same build of the game.

## Result (and how to read it)
| pair | games | score of first | 95% interval |
|---|---|---|---|
| master vs hard | 16 | 68.8% | [44.4%, 85.8%] |
| master vs normal | 16 | 59.4% | [35.9%, 79.2%] |
| hard vs normal | 16 | 53.1% | [30.6%, 74.5%] |

Every interval contains 50%: **these games do not separate the tiers**. Almost all games ended at the time cap and were decided by material share, so this measures who is ahead at 9 minutes, not who wins long games. Bot-vs-bot Elo is not human Elo. No human has played against these agents in a study.

## Limitations and intended use
Small sample, one simulator, bot-vs-bot only. Intended for replication, for testing evaluation methods on a deterministic game, and as a baseline for new agents. Not a benchmark of general intelligence.
