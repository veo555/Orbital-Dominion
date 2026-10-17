# Hybrid strategy: open-source research core, optional paid layer

Decision (17 Oct 2026): build reputation with an open, honest research project first; keep a small paid or supporter layer as an option that is decided by evidence, not hope. This file records the reasoning, the rules, and the tripwires, so the decision can be revisited with numbers.

## 1. What stays open (MIT, forever)
The simulator, the agents, the league and replay tooling, the tests, the docs, the spectator mode, the single-file and PWA builds. Anyone may use, fork, study and publish results. This is what builds a name as a builder and thinker.

## 2. What may be paid (optional, later, never pay-to-win)
Already implemented and **off by default** (`docs/MONETIZATION.md`): a Support button with cosmetic extras (badge, interface themes). Candidate additions, all cosmetic or convenience, none affecting balance (CLAUDE.md rule 13):
* Supporter tiers on the web build (Stripe-hosted pages, no secrets in the page).
* A paid **store build** (Google Play / App Store) with the same game, store-friendly packaging and support: the code stays open, the convenience and the listing are the product. Many open-source games do this.
* Extra cosmetic packs, an extended campaign, hosted tools (for example a leaderboard of league agents or a replay gallery) if there is demand.
Never sell in-game currency, advantages, or anything that changes an agent's or a player's strength.

## 3. Protecting the name without closing the code
MIT covers the code and does not grant rights to the name or logo. `TRADEMARKS.md` says forks are welcome but must not present themselves as the official game. This is a statement of intent, not legal advice; if a store release becomes real, consider registering the name and read the store policies on repackaged open-source apps. Code already published under MIT cannot be re-licensed retroactively, so any future "source-available" decision would apply only to new work.

## 4. Sequence and tripwires
| Phase | Goal | Done when |
|---|---|---|
| 0 | Public repo + playable Pages link | repo public, Pages live, README GIF |
| 1 | 10-20 real testers (desktop + phones) | playtest reports filed, top 5 bugs fixed |
| 2 | One small human study (S1 or S2, `docs/RESEARCH_AGENDA.md`) | data + a short write-up published |
| 3 | Decide on the app | tripwires below evaluated |

**Go for a store release only if most of these hold after phase 1-2** (suggested thresholds, adjust them before looking at the data so you cannot talk yourself into a result):
* >= 30 % of testers start a second session without being asked.
* The game runs at an acceptable frame rate on at least two real phones (it has never been run on one).
* Organic plays: a few hundred distinct sessions with no paid promotion.
* At least a handful of people ask for a phone version.

**Stop / stay open-source-only if:** retention is low, phone performance is poor and not quickly fixable, or the research track is producing more value (citations, contacts, invitations) than the game track. That is a good outcome, not a failure.

## 5. Costs to remember
Apple Developer Program 99 USD per year, Google Play 25 USD once; review cycles, privacy forms, support load, and the mobile RTS genre's high acquisition cost. None of this is needed for phases 0-2.

## 6. Reputation checklist (what compounds)
Reproducible results with intervals; honest limits in the README; a short technical report (arXiv or a game-AI workshop); replication-friendly replay codes; responsive issue handling; a tagged release for each milestone.
