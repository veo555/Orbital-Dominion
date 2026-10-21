# Production roadmap (what is done, what is not)

Status 2026-10-21. Complements `docs/STORE_RELEASE_ROADMAP.md` (store rules) and `docs/QA_CHECKLIST.md` (gates).

## Done and automatically gated
Deterministic sim + replays; desktop/touch/PWA/platform e2e gates in Chromium emulation; payment-free `store` variant; zero-network assertion;
CI on every push (build reproducibility, design tokens, smoke, replay, MCP, research suites); public web build via GitHub Pages; MIT licence; privacy statement (`PRIVACY.md`).

## Not done — and only a person with a device/account can do it
| Item | Why it blocks | Owner |
|---|---|---|
| Run on a real low-end Android + an iPhone (the S0 spike) | Never measured on hardware; headless fps is software raster | you |
| Human playtests (≥ 10 players, use the `Playtest report` issue form) | No human data exists; bot Elo ≠ human skill | you + testers |
| Hosted privacy URL, store listing text/screens, age-rating questionnaire | Store submission prerequisites | you |
| Developer accounts (Google Play: closed test ≥ 12 testers × 14 days for new personal accounts; Apple) | Calendar-bound | you |
| In-app About / Feedback / Privacy entry | Adding a menu button re-flows the three HUD layouts; do it with `tools/shots.py` on all layouts and the `e2e_touch` 44 px gate | next code change |
| Accessibility audit with real assistive tech | Only emulated palette/reduce-motion tested | you |

## Store listing draft (edit before use)
**Title:** Orbital Dominion — Space RTS · **Short (≤80):** Command a fleet vs. rule-based AI agents. Watch them play each other.
**Full:** A StarCraft-inspired real-time strategy game in one small file. Build a base, harvest, tech up, fight fog-of-war battles, then switch to Watch mode to see two AI agents duel with live win-chance and reasons. No ads, no tracking, works offline. The AI is rule-based and league-tuned (no language model).
**Do not claim:** "AI-powered by LLM", "perfect", rankings vs. humans, or anything about payments in the `store` build.
