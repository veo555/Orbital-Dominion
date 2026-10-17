# Launch kit

Everything below is a draft for you to edit with your own voice. The play link and repository link below are filled in (`https://veo555.github.io/Orbital-Dominion/`, `https://github.com/veo555/Orbital-Dominion`); confirm the play link opens for you before posting. Post only claims the repository supports; the honest limits are part of the pitch.

## 0. Before you post (checklist)
- [x] Repo is public and renamed to Orbital-Dominion; [ ] description + topics set (`rts game-ai multi-agent alphastar swarm-intelligence starcraft html5-game reinforcement-learning`)
- [ ] Pages is live and `https://veo555.github.io/Orbital-Dominion/#watch=OD1-424242-aurora-obsidian-master-hard-m` opens a match
- [ ] A release is tagged (`v6.1.0`) with `orbital_dominion_v4.html` and `orbital_dominion_pwa.zip` attached
- [ ] You have played the link yourself on a phone
- [ ] You can answer comments for the first 3-4 hours after posting

## 1. Show HN
**Title:** Show HN: An RTS where AI agents play each other, in one 1.3 MB HTML file

**Text:**
I built a small StarCraft-style RTS as a research testbed for putting AI agents into gameplay: as opponents, as delegates you can hand parts of the game to, and as something you can watch to learn from. It runs entirely in the browser (one HTML file, no server, no GPU, no language model).

- Agents are fog-honest (they only know what they have scouted), rate-limited like a human (action cap, reaction delay), and tuned by league self-play (CMA-ES, prioritised fictitious self-play, Bradley-Terry ratings). Inspired by AlphaStar, scaled to a laptop.
- "Watch agents" lets you pick two tiers/factions and see each agent's own win estimate over time, why it is doing what it does, and key moments. Every match has a short replay code and a #watch= link; the simulator is deterministic, so the same code is the same match.
- Honest bits: an AlphaGo-style planner is in the code but switched off because it showed no measurable gain; Master and Hard tiers are not statistically separated; nobody has run a human study yet; I have not tested it on a real phone. The README and docs list the limits.

Play: https://veo555.github.io/Orbital-Dominion/  Code (MIT): https://github.com/veo555/Orbital-Dominion
Happy to talk about the agent design, the league results, or the determinism/replay tooling.

## 2. r/MachineLearning ([Project])
**Title:** [P] A reproducible RTS testbed for league self-play and agents-as-teachers (single HTML file, deterministic replays)

**Text:** short version of the above, plus: the research questions (Q1-Q4 in `docs/RESEARCH_VISION.md`), what is measured (`docs/AI_LEAGUE_RESULTS.md`: Elo, Wilson intervals, an expert-iteration run with a null result), the open problem (the abstract model predicts economy well but not battles, which is why the planner finds little) and an invitation: "drop your own agent into `tools/league/`; the baseline to beat is Master".

## 3. r/gamedev (Showoff Saturday) / r/rts / r/starcraft
**Title:** I made a StarCraft-inspired RTS you can watch AI agents play (and play yourself), free and open source

Lead with the GIF (`docs/img/spectate.gif`), then three sentences: what it is, what is unusual (agents explain themselves, replay codes, runs on a phone browser), where to play. Ask for blunt feedback and point at the tester guide.

## 4. itch.io page (optional, free)
Upload `orbital_dominion_v4.html` as an HTML5 game ("This file will be played in the browser"), tag: strategy, rts, ai, open-source. Description = the Show HN text. Screenshots from `docs/img/`.

## 5. Short thread (X / Mastodon / Bluesky)
1/ I built an RTS where AI agents play each other, in one HTML file. https://veo555.github.io/Orbital-Dominion/
2/ Pick two agents, watch their own win estimates diverge as they scout. Every match has a code: same code, same game.
3/ Inspired by AlphaStar's league training, scaled to a laptop. No LLM. Honest limits in the README.
4/ MIT licensed. Drop in your own agent: https://github.com/veo555/Orbital-Dominion

## 6. Reaching researchers
Game-AI venues with workshop or demo tracks: IEEE Conference on Games (CoG), AAAI AIIDE, FDG. A 6-8 page report (system, league results with intervals, spectator/replay design, limits, proposed studies) is a realistic submission; the repository already contains the raw material (`docs/RESEARCH_VISION.md`, `docs/AI_LEAGUE_RESULTS.md`, `docs/RESEARCH_AGENDA.md`). Post a preprint (arXiv cs.AI or cs.MA) once you have one real human-study number.

## 7. Timeline (suggested)
- Day 0: public + Pages + release tag; self-test on phone.
- Day 1-3: send the tester guide to 10-20 people (friends, StarCraft / game-AI communities); fix the top bugs.
- Day 4-7: Show HN + Reddit posts on a weekday morning (US time), answer every comment.
- Week 2-6: run study S1 or S2; publish the numbers; write the report.
- Week 6-8: apply the tripwires in `docs/HYBRID_STRATEGY.md`.
