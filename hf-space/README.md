---
title: Orbital Dominion
emoji: 🛰️
colorFrom: blue
colorTo: indigo
sdk: static
pinned: false
license: mit
short_description: Watch AI agents fight in an open RTS research testbed
tags:
  - game
  - reinforcement-learning
  - multi-agent
  - self-play
  - rts
  - research
---

# Orbital Dominion: swarm agents as game design

A StarCraft-inspired real-time strategy game that doubles as an open research testbed. Everything runs in your browser from one HTML file: no server, no GPU, no language model, no network requests.

**What to try**
- Press **Watch agents** on the main menu to see two league-tuned agents play each other. A panel shows each agent's own win estimate, its reason for the current plan, and key moments. Every match has a short replay code.
- Or press **Start Mission** to play against the computer (press `H` for help). Works on phones too.

**Why it is interesting:** fog-honest, rate-limited agents tuned by league self-play (CMA-ES, prioritised fictitious self-play, Bradley-Terry ratings); deterministic, replayable matches; an MCP server so an AI client can play it through tools. An AlphaGo-style planner is implemented but ships **off**: it showed no measurable gain. No human study has been run yet, and it has not been tested on a real phone.

**Code, docs, tests, MCP server (MIT):** https://github.com/veo555/Orbital-Dominion
**Play on GitHub Pages:** https://veo555.github.io/Orbital-Dominion/

<sub>This Space serves the single-file build from the repository (`dist/orbital_dominion_v4.html`, copied to `index.html`).</sub>
