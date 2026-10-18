# Evaluate it yourself in 15 minutes

For developers and researchers who want to check the claims instead of trusting them.

## 1. Look at it (2 min)
Open the play link from the README, press **Watch agents**, pick Master vs Hard, watch 3 minutes at 4x. Then press **Copy code** and open it again with `#watch=<code>`: you get the same match.

## 2. Run the fast checks (3 min)
```
python3 build.py && git diff --exit-code -- dist     # the shipped HTML is exactly what the sources build
node tests/sim/smoke.js                              # headless simulation checks
node tests/sim/replay.js                             # same code, same match (also with --mutants)
```

## 3. Run a tournament (1 min quick, ~10 min for the table below)
```
node tools/tournament.js --quick
node tools/tournament.js --tiers master,hard,normal --games 8 --cap 540 --seed0 7000 --out docs/results/tournament_example
```
Every ordered pair of tiers plays N games; sides and factions rotate. The report gives each pair's score with a 95 % Wilson interval and a Bradley-Terry Elo, and `games.csv` lists every game with its **replay code** and final state hash. Paste any code into "Watch agents" to see that exact match, or verify it headlessly (two of the 48 games below were re-run with a different `Math.random` stream and reproduced their final hash exactly).

### Example result (committed in `docs/results/tournament_example/`, seeds 7000-7047, 540 s cap)
| pair | games | score of first | 95 % interval |
|---|---|---|---|
| master vs hard | 16 | 68.8 % | [44.4 %, 85.8 %] |
| master vs normal | 16 | 59.4 % | [35.9 %, 79.2 %] |
| hard vs normal | 16 | 53.1 % | [30.6 %, 74.5 %] |

Bradley-Terry Elo (normal = 1000): master 1095, hard 993, normal 1000.

**Honest reading.** Every interval contains 50 %: with 16 games per pair these results do **not** separate the tiers, which agrees with the earlier league evaluation (`docs/AI_LEAGUE_RESULTS.md`: Master and Hard not separated). The point estimates are ordered as hoped for Master, not for Hard vs Normal. Nearly all games ended at the time cap and were decided by the material-share rule (share > 0.6 wins, < 0.4 loses, otherwise a draw), not by destroying a base, so the table measures who is ahead at 9 minutes, not who wins long games. A 24-game pair gives roughly +-0.2 on the score; to separate two close tiers you need several hundred games. Bot-vs-bot Elo is not human Elo.

## 4. Read the evidence and the limits
`docs/KNOWN_LIMITATIONS_AND_TEST_RESULTS.md` lists what was and was not verified (never on a real phone, nothing heard by a person, no human study). `docs/RESEARCH_AGENDA.md` has the studies still to run.

## 5. Try to break it
Tests are mutation-proofed (`node tests/sim/replay.js --mutants`, `node tests/sim/fortify.js --mutants`, `node tests/sim/arsenal.js --mutants`). If you find a check that cannot fail, that is a bug: please open an issue.
