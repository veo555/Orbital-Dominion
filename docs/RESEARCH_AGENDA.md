# Research agenda: protocols and open problems

Companion to `docs/RESEARCH_VISION.md`. Each study below is **unrun**; the protocol is a starting point for whoever runs it.
Keep the repository rule: no claim without numbers, and report intervals (a win rate over 24 games has a standard error of about 0.10).

## S1. Opponent quality (human rating)
* **Conditions:** campaign AI (scripted waves) vs league agent (Hard, Master). Same maps, same faction.
* **Design:** within-subject, blind, counterbalanced order, >= 20 players, 3 games each.
* **Measures:** 7-point ratings of challenge, fairness ("did it cheat?"), variety, "felt human"; objective game length and result.
* **Hypothesis:** league agent rated fairer and more varied at equal win rate.

## S2. Learning from agents
* **Conditions:** (a) watch 5 agent-vs-agent games (menu attract mode or a recorded seed) before playing, (b) advisor on, (c) control.
* **Measures:** economy and army value at minute 8 on a fixed seed before and after a 5-game training block; build-order distance to the agent's.
* **Hypothesis:** (a) and (b) improve minute-8 economy over control. Beware ceiling and learning-by-playing effects: use pre/post with a control.
* **Engineering status:** agent-vs-agent matches are already reproducible from a replay code (`docs/SPECTATE_AND_REPLAY.md`), so condition (a) can use one fixed match for everyone. Still missing: logging of human commands (needed to replay the participants' own games) and a measurement hook for minute-8 economy.

## S3. Delegation
* **Conditions:** Manual, Advisor, Autopilot-economy.
* **Measures:** action rate, time spent on the minimap vs the army, result vs the same opponent.

## S4. Agent science (no humans needed)
* **Harness:** `node tools/tournament.js` (see `docs/EVALUATE.md`) runs round-robin tournaments with Wilson intervals and a replay code per game; a first 48-game table is committed in `docs/results/tournament_example/`.
* Replace the strategy layer with: a neural policy trained by imitation of the current agent then RL fine-tuning, an evolutionary controller, a MCTS variant with a better abstract model. The harness is `tools/league/*`; the baseline to beat is Master at ~Elo 981-1042 (see `docs/AI_LEAGUE_RESULTS.md`).
* **Known weak spot:** the abstract model predicts the economy well but battles poorly (material share is about as predictable as "nothing changes"), which is the main reason the planner found little. A better battle model is the highest-value open problem.

## S5. Explainability
* Measure whether the "why" strings are used and understood: think-aloud sessions, or a quiz on what the agent will do next.

## Threats to validity (state them in any write-up)
Bot-vs-bot Elo is not human Elo; the game is small and has no human replay corpus; all current numbers come from one author's container and one simulator; the AI has never been compared with human players.
