# Game design reference — Orbital Dominion v3

Tables below were generated from the live data tables (`UDEF`, `BDEF`, `SKILLS`, `FACTIONS`, `TECH`) in
`src/js/00_core.js`, not typed from memory. Change the data there, never here.

## 1. Premise and loop
1v1 real-time strategy on a seeded 88 × 88-tile map (3 height levels, ramps, creep camps, trading posts, crystal
fields, ether geysers). You and an AI start in opposite corners with a Command Hub and a few Haulers. Gather
**crystals** and **ether**, build **Generators** for supply (cap 120), advance through **three eras**, field an army,
and **destroy every enemy structure**. Lose all structures and you are out. A match is a 15–30 minute affair by design intent (an estimate: there is no human-playtest data; in the 18-minute headless test games 9 of 24 were still undecided).
Difficulty: Easy / Normal / Hard (attack timing, army size, hero use, creep-camp use and "smartness" differ).

Design pillars, in order:
1. **Readable StarCraft-style combat** — counters via armour classes, fog of war, high ground, detection, stims, heroes.
2. **Age-of-Empires-style progression** — eras gate units, buildings and upgrade levels.
3. **Caesar-style colony** — Habitats house colonists who pay taxes; morale scales mining/building/training speed 85–115 %.
4. **Patrizier-style trade** — an Exchange with a wandering, mean-reverting market price and Freighters running routes
   to neutral Trading Posts.
5. **Warcraft-III-style heroes and creeps** — one hero per faction, three skills, neutral camps that sleep at night.
6. **The v3 twist: the swarm.** Delegate as much or as little as you like, from "I command every unit" to "the Overseer
   plays the whole colony", switchable at any time.

## 2. Factions (3)
| Faction | Style | Bonuses | Unique unit | Hero (skills) |
|---|---|---|---|---|
| **Meridian Corps** | Fortress builders / turtle | Structures +20 % HP; repairs cost half | **Bulwark** shield-walker (armour 3, hits air) | Marshal Idris — Bulwark Banner, Suppressive Barrage, Orbital Strike |
| **Obsidian Collective** | Relentless aggressors / rush | Units train 8 % faster; cheaper Raptors | **Reaver** life-stealing berserker | Warlord Kaz — Bloodlust, Shockwave, Rampage |
| **Aurora Syndicate** | Merchants & shadows / trader | Trade profit +30 %; Haulers carry +1; Exchange −40 % cost | **Specter** permanently cloaked striker | Seer Lyra — Regeneration, Phase Veil, Singularity |

## 3. Eras
| Era | Name | Requirement | Unlocks |
|---|---|---|---|
| I | Landing | start | Hauler, Rifleman, Raptor; Hub, Generator, Depot, Siphon, Habitat, Garrison, Armory, Turret |
| II | Industrial | 300 crystals + 100 ether, Garrison, 40 s | Rocketeer, Mender, Howitzer, Juggernaut, Skiff, unique unit; Forum, Exchange, Foundry, Airfield; level-2 upgrades, Stims, Ether Compression, Cargo Hooks |
| III | Orbital | 500 crystals + 300 ether, Armory, 60 s | Titan; level-3 upgrades |
Each era also adds +5 morale.

## 4. Units (c = crystals, e = ether)
| Unit | Era | Cost | Supply | HP | Armour | Damage | Range | Notes |
|---|---|---|---|---|---|---|---|---|
| Hauler | I | 50c | 1 | 45 | 0 | 5 | 12 | Worker: gathers, builds, repairs |
| Rifleman | I | 50c | 1 | 55 | 0 | 7 | 135 | Hits air; stim-capable |
| Raptor | I | 75c 25e | 2 | 85 | 0 | 11 (+5 vs light) | 16 | Fast melee; no anti-air; stim-capable |
| Rocketeer | II | 100c 50e | 2 | 75 | 0 | 12 (+14 armoured, +6 structures) | 165 | Hits air |
| Mender | II | 75c 50e | 2 | 60 | 0 | — | — | Heals biological units; detector |
| Howitzer | II | 150c 125e | 3 | 95 | 1 | 22 splash | 170 | Siege; helpless up close |
| Juggernaut | II | 200c 100e | 4 | 320 | 3 | 26 (+6 light, +8 structures) | 95 | Tank |
| Skiff | II | 125c 100e | 2 | 125 | 0 | 14 (+4 light) | 140 | Flying; hits air |
| Titan | III | 400c 300e | 8 | 900 | 4 | 55 (+25 structures) | 215 | Splash; helpless up close |
| Freighter | II | 150c | 2 | 140 | 0 | — | — | Trade routes |
| Bulwark / Reaver / Specter | II | 150c 75e / 100c 50e / 125c 75e | 3 / 2 / 2 | 280 / 120 / 70 | 3 / 0 / 0 | 18 / 15 / 24 | 105 / 16 / 125 | Faction uniques |
| Heroes (3) | I | 250c 100e | 3 | 520 / 620 / 420 | 2 / 2 / 1 | 26 / 34 / 22 | 150 / 26 / 165 | One per faction, max level 6, revivable |
| Creeps (3) | — | — | — | 75 / 55 / 430 | 0 / 0 / 2 | 9 / 11 / 32 | 16 / 150 / 30 | Dune Crawler, Acid Spitter, Ancient Brute |

## 5. Buildings
Hub 400c (4×4, HP 1500, +10 supply, shoots, trains Haulers and Hero) · Generator 100c (+8 supply) · Depot 75c (forward
drop-off, mining/compression/cargo research) · Ether Siphon 75c (on a geyser) · Habitat 100c (10 colonists, taxes) ·
Garrison 150c (infantry + unique unit) · Armory 100c 50e (weapons, plating, stims) · Defense Turret 100c (detector) ·
**Era II:** Forum 125c (+6 morale, max 3 count) · Exchange 150c 50e (market, Freighters) · Foundry 150c 100e
(Howitzer, Juggernaut, Titan) · Airfield 150c 100e (Skiff).

Research: Weapon Systems (+15 % damage/level, 3 levels), Plating (+1 armour/level, 3 levels), Combat Stims (Overdrive:
+50 % speed and fire rate for 8 s at 12 HP), Mining Lasers (+20 % crystals/trip), Ether Compression (+20 % ether/trip),
Cargo Hooks (+2 carried).

## 6. Systems
* **Fog of war / vision / height**: low ground cannot see high ground; flyers can, and capturing a neutral **Watchtower** (stand a unit next to it) reveals the map around it. Attacking reveals
  briefly. Neutral **Trading Posts** are the Freighter route endpoints. Cloaked units (Specter, Phase Veil) are revealed only near detectors (Menders, Turrets, Hubs).
* **Day/night**: a day lasts 6 minutes; creep camps sleep at night unless provoked; night lighting pass in the renderer.
* **Morale** = 56 + tax effect + Forums (+6 each, max 3) + era bonus + hero − recent losses + recent kills.
  Colonists settle above 45 morale and leave below. Taxes: Low / Normal / High (`T` cycles).
* **Market**: crystals ↔ ether at a shared price that wanders (mean-reverting with a slow seasonal swing) and moves 3.5 %
  per trade. Freighters pay `0.6 × route length × post demand` outbound plus a return cargo.
* **Heroes**: XP from kills and camps; aura, active and ultimate (`Z` to learn, then the command card).
* **Counters**: Raptors/Reavers shred light infantry and lose to Juggernauts and splash; Rocketeers crush armour and
  air; Howitzers/Titans wreck structures but are helpless in melee; Skiffs ignore terrain but lose to Riflemen,
  Rocketeers and Turrets; Menders heal biological units.

## 7. The swarm layer (what is new in v3)
* **Individual**: select units → *Enroll as Agents* → pick one of 12 roles on the command card: Miner, Etherworker,
  Builder, Mechanic, Trader, Scout, Guard, Patrol, Hunter, Raider, Escort, Medic (point roles ask for a spot or unit).
  The info card shows what the agent is doing and **why**. Right-click overrides; the agent resumes afterwards.
* **Collective**: the Overseer (7 domains, each off / advise / act; presets Autopilot / Advisor / Manual; master switch `J`).
  Speak to it: "keep 14 miners", "guard the natural with 4 riflemen", "scout the map", "hunt creeps",
  "hire 2 miners by the day", "take jobs", "status", "why".
* **Economy**: agents have wallets (5 % commission on deliveries, 5 % kill bounty, field-clinic fees, gear Mk I–III,
  skill levels). **Marketplace**: freelancers join on Minute / Hour / Day / Month / per-Task billing at a floating wage
  index; the job board lets your agents earn crystals from neutral clients. See ARCHITECTURE §4.3 for the maths.
* **Honest framing for store copy**: the Overseer is a rule-based decision system and parser, not a generative AI model.

## 8. Controls (desktop, current)
Left click/drag select · right click context command · Shift queue · double-click / Ctrl-click select type ·
`Q W E R / A S D F / Z X C V` command card · Ctrl+1…9 groups · F1/F2/F3 idle worker / army / hero · Space last alert ·
Backspace hub · wheel zoom · middle-drag/arrows/edges pan · Alt health bars · `M` economy · `T` tax · `O` objectives ·
`K` swarm panel · `J` swarm master switch · `Enter` or `/` command box · `+`/`−` speed · `P`/`Esc` pause · `H` help.
**Touch:** a full gesture scheme exists (3.1) — see `docs/TOUCH_SPEC.md`.

## 9. Content gaps worth knowing before store launch
Single-player vs AI only (no campaign, no multiplayer); one map size; no tutorial beyond the objectives list and
help screen; English only; no achievements, no save/load.
