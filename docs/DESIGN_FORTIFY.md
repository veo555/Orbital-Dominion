# v6-G1 FORTIFY — defensive structures, cargo, detection, map features

> **PROGRESS NOTE (top of file, kept current).** Status: design written; implementation in progress on branch
> `worktree-agent-ac919c421dccf1637`. See §9 for what has shipped, what is unverified and the measured numbers.

Track scope: buildings, walls, garrison/transport ("cargo"), detection and information, mines, a repair battery,
neutral map features, the skirmish AI's use of all of it, and the UI on desktop and touch. Combat units, unit
abilities and upgrade tiers are the parallel G2 ARSENAL track (only the Dropship transport is built here).

---

## 1. Inventory — what the game has (read from the v5 source)

### 1.1 Structures (`BDEF`, `00_core.js`)

| id | name | size | HP / armor | cost (c/e) | era / req | role |
|---|---|---|---|---|---|---|
| hub | Command Hub | 4x4 | 1500 / 1 | 400 | I | drop-off, Haulers, hero, eras; bolt 8 dmg r235 ground+air, detects 200; **Call to Arms** shelters 15 Haulers (+3 dmg each) |
| generator | Generator | 2x2 | 350 / 1 | 100 | I | +8 supply |
| depot | Depot | 2x2 | 400 / 1 | 75 | I | drop-off, gathering upgrades |
| siphon | Ether Siphon | 2x2 | 450 / 1 | 75 | I | on a geyser |
| habitat | Habitat | 2x2 | 300 / 0 | 100 | I / hub | colonists, taxes |
| garrison | Garrison | 3x3 | 1000 / 1 | 150 | I / hub | infantry + faction unique |
| armory | Armory | 3x3 | 750 / 1 | 100/50 | I / garrison | weapons, plating, stims |
| forum | Forum | 3x3 | 600 / 1 | 125 | II | morale |
| exchange | Exchange | 3x3 | 700 / 1 | 150/50 | II | market, Freighters |
| foundry | Foundry | 3x3 | 900 / 1 | 150/100 | II / armory | Howitzer, Juggernaut, Titan |
| airfield | Airfield | 3x3 | 850 / 1 | 150/100 | II / armory | Skiff |
| turret | Defense Turret | 2x2 | 320 / 2 | 100 | I / garrison | 14 dmg/0.7 s r195, ground+air, **detects 230** |

Faction structure traits: Meridian structures +20 % HP and half-price repairs; Aurora Exchange −40 %.

### 1.2 Units (`UDEF`) relevant to defence
Rifleman, Rocketeer (+6 vs structures), Mender (detects 230), Raptor/Reaver (melee), Howitzer (siege: 52 dmg +25 vs
structures, r350, splash), Juggernaut (+8 vs structures), Skiff (air), Titan (+25 vs structures, splash), Bulwark,
Specter (**permanently cloaked**), heroes; neutral creeps. Tags: light, armored, struct, air, bio, mech.

### 1.3 Mechanics already present
* Pathing: one shared `G.blocked` grid (terrain, resources, every building, neutral towers/posts), connected-component
  labels `G.comp` (8-connected, no corner cutting), A* with a per-tick budget of 16 searches, sealed goals snap to the
  nearest reachable tile within 14 tiles (or the unit simply does not move).
* Detection: `G.det[team]` = list of detector circles (Hub, Turret, Mender); `seen()` hides cloaked units unless
  detected. No scan ability, no radar.
* Garrison: only the Hub's Call to Arms (Haulers hide inside, `u.garr`).
* Repair: Haulers repair structures and mechanical units (resource cost); Menders heal bio.
* Rally points on production buildings (to ground, a crystal patch, a Trading Post).
* Build menu: two pages (`BUILD_PAGES`), placement ghost one building at a time, shift keeps placing.
* AI (`42_ai_agent.js`, skirmish T2): fog-honest; builds Turrets by theta (`th.turret`), Call to Arms when a hub
  defence is hopeless; no walls; nothing breaks walls (there were none).

## 2. Gap analysis against StarCraft II

| SC2 mechanic | what it gives SC2 | in Orbital Dominion v5 | decision |
|---|---|---|---|
| Supply-depot walls, lowering depots | cheap choke control vs early rushes, lets own units through | none; supply buildings are 2x2 and cannot open | **Wall segment** (1x1, line-drawn) + **Gate** (2x1/1x2, open / closed / auto team-aware). Walls give no supply (generators stay the supply source; keeps the economy untouched). |
| Bunker | protects infantry, +1 range, salvage | Hub Call to Arms for workers only | **Bunker** (4 slots, infantry only, +1 tile range, salvage 75 %, rally-load). |
| Planetary Fortress | immobile hub with armor + splash cannon | the Hub has a light bolt | **Fortress** hub upgrade (one-way, +50 % HP, +3 armor, heavy splash cannon r300). There is no lift-off in this game, so "cannot lift" is moot; the trade is cost and permanence. |
| Missile Turret / Spore | anti-air + detection | Defense Turret (both, detects) | keep the Turret (all-round + detection), add **Anti-Air Battery** (air only, long range) and **Cannon Tower** (ground only, short range, heavy) so static defence has roles. |
| Photon Cannon / Spine Crawler | static ground defence | Turret | covered by Cannon Tower (faction flavour via art/sfx). |
| Sensor Tower | radar blips beyond vision | Watchtowers (neutral, real vision) | **Sensor Tower**: 30-tile radar, red blips for enemy units (no detail, no fog reveal, cloaked units only if detected). |
| Scanner Sweep (Orbital) | reveal + detect anywhere, energy | none | **Scanner Sweep**: Hub ability, 50 energy (Hubs regenerate 0.5 energy/s, max 100, start 50), 8-tile radius, reveals fog **and** detects for 10 s, target on map or minimap (tap on touch). |
| Spider / Widow mines, burrow | hidden area denial, needs detection | none | **Proximity Mine** (1x1, cloaked once armed, 1.2-tile trigger vs enemy ground units, splash, single use, 12 per player). |
| Shield Battery / Medivac / SCV repair | static sustain | Hauler repair, Mender | **Repair Battery**: heals the most-hurt friendly unit or structure in 6 tiles for ether, visible beam. |
| Detection rules (Observer, Raven, Oracle revelation) | cloak counterplay | Mender/Turret/Hub | `isDetectedBy(team,unit)` exported for G2's Watcher; scans and Sensor-free detection as above. |
| Load / unload transports (Medivac, Warp Prism, Bunker) | drops, protection | none | generic **cargo** system used by Bunker and **Dropship** (8 slots, flying, Airfield). |
| Destructible rocks, rich minerals | map texture, alternative paths | none | **Rocks** (neutral 2x2, 2000 HP, only attacked on purpose, never auto-acquired) and one **rich crystal field** per side (4 patches x 2600, +40 % per trip) — skirmish/random maps only via `newGame({mapFx:true})`; campaign maps bit-identical. |
| Repair | SCV repair | present | walls/gates/bunkers repairable as structures (Meridian half price) — reuses `repairStep`. |
| Rally | rally to units/structures | ground/crystal/post | added: rally onto an own Bunker = new infantry auto-load (rally-load). |
| AI wall-offs, AI breaking walls | AI must not freeze vs walls | n/a | unit-level **breach rule** for everybody (below) + Hard/Master AI walls its main ramp when a rush is expected; Normal+ builds Bunkers/Repair Batteries near threatened expansions. |
| Creep, Nydus, Lift-off | race identity | not applicable | **cut** (not this game's identity). |

## 3. Decisions and rules

### 3.1 Team-aware pathing (gates)
* `G.blocked` stays "blocked for everybody" (terrain, resources, buildings incl. **closed-for-anyone** gate tiles);
  creeps and placement use it unchanged.
* `G.bt[t]` (t = 0, 1) is team t's view: identical to `G.blocked` except the team's own gates in mode `auto` or
  `open` are passable, and an enemy gate in mode `open` is passable. While no gate exists, `G.bt[t] === G.blocked`
  and `G.compT[t] === G.comp` (aliases: zero cost, bit-identical behaviour to v5).
* `canStand`, `losClear`, `freeT`, `nearestFree`, `findPath` take an optional `team`; units pass their own team.
  The A* inner loop is unchanged (it reads one array chosen before the loop), so the per-tick path budget and
  determinism are unchanged.
* Gate modes: **auto** (default; owner passes, enemies blocked), **open** (everyone passes), **closed** (nobody).
  Switching to a mode that blocks a unit standing in the gate pushes that unit out (same `popOut` as construction).

### 3.2 Breach rule (walled-in targets)
When a ground unit with a ground weapon wants to reach a goal that is not in its team's connected component
(`findPath` reports "sealed"), it runs one **breach search** (A* in which enemy *and neutral* structure tiles are
passable at +14 cost per tile, terrain stays blocked; budgeted like a normal path, re-searched at most every 1.5 s).
The first enemy structure tile on that route is the **breach target**: the nearest blocker on the cheapest route,
which is the blocker on the straight route when the ground is open. The unit attacks it (engage) and resumes its
order when it falls. Units never freeze (they always have a target or a reachable path) and do not oscillate (the
breach target is kept until it dies or the goal becomes reachable). Neutral rocks count as blockers for the
breach search **only** when no enemy structure is on the route (rocks are not auto-acquired otherwise).

### 3.3 Self-seal rule
A player may not seal their own Hubs in: placing a wall/gate (line or single) is refused when, with the new tiles
blocked, a team-view flood fill from every own Hub no longer reaches the map centre. Gates count as passable for the
owner, so "wall + gate" is always legal. Structures can never be placed on the map edge (`canPlace`), and map
generation never places player walls, so the start-of-game connectivity guarantee (`mapConnected`) is untouched.

### 3.4 Cargo
`host.cargo = [unit ids]`, `unit.inside = hostId`, unit hidden (not targetable, not in the spatial hash, keeps
vision at the host's position, keeps supply). Size = unit supply (Titan and flyers cannot load). Bunker: 4 slots,
`infantry` tag only (Rifleman, Rocketeer, Mender, Specter, Idris, Lyra); passengers fire from inside with
+1 tile range. Dropship: 8 slots, any ground unit up to size 4. Host death: Bunker ejects (units survive),
Dropship kills its cargo (SC2 rule). Salvage (Bunker): ejects, refunds 75 %. Orders to a unit inside are ignored
except unload. Everything is plain JSON (ids), so `46_save.js` round-trips mid-load.

### 3.5 Detection
`isDetectedBy(team,e)` = e is inside a detector circle of `team` (Hub 200, Turret 230, Mender 230, an active scan
256). Cloaked units/mines are only hit by a team that detects them (the existing `seen()` gate). Sensor Towers do
**not** detect.

### 3.6 Campaign
All new ids (`wall gate gatev bunker cannon flak sensor battery mine dropship`, plus the `fortress` and `scan` hub
abilities) are **locked in campaign missions by default** (`campLocked` treats them as locked unless a mission
`unlock`s them). Mission data, `G.camp.locks` and the v3 AI are unchanged; campaign maps never get rocks or rich
fields.

## 4. Numbers (method in §6)

| id | size | HP / armor | cost c/e | time | era / req | weapon / effect |
|---|---|---|---|---|---|---|
| wall | 1x1 | 600 / 2 | 50 / 0 | 8 | I / – | — (Meridian 720 HP) |
| gate / gatev | 2x1 / 1x2 | 900 / 2 | 100 / 0 | 14 | I / – | open / closed / auto |
| bunker | 2x2 | 550 / 2 | 100 / 0 | 22 | I / garrison | 4 infantry slots, +32 px range |
| cannon | 2x2 | 420 / 2 | 125 / 0 | 24 | I / garrison | 30 dmg (+12 armored) / 1.4 s, r160, ground only |
| flak | 2x2 | 300 / 1 | 100 / 25 | 22 | I / garrison | 18 dmg (+6 air) / 0.8 s, r255, air only |
| sensor | 2x2 | 220 / 0 | 100 / 75 | 25 | II / armory | radar 30 tiles |
| battery | 2x2 | 300 / 1 | 100 / 50 | 24 | I / garrison | heals 18 HP/s in 6 tiles, 0.2 ether/HP (Meridian 0.1) |
| mine | 1x1 | 40 / 0 | 30 / 10 | 6 | I / garrison | 60 (+25 light) splash 52 px, trigger 38 px, max 12 |
| fortress | (hub) | +50 % HP, +3 armor | 250 / 150 | 50 | II / armory | cannon 40 (+10 armored) splash 34, r300, 2.0 s, ground |
| scan | (hub) | 50 energy | — | — | I | 256 px, 10 s, reveal + detect |
| dropship | unit | 150 / 1, speed 125 | 100 / 100 | 28 | II / airfield | 8 cargo slots, unarmed, 2 supply |
| rocks | 2x2 | 2000 / 1 | neutral | — | map | blocks a corridor (alternative route always exists) |

Wall target from the brief: six Riflemen (7 dmg / 0.75 s) vs armor 2 → 6 × 5 / 0.75 = 40 dps → 600 HP in **15 s**
(Meridian 720 HP: 18 s). Howitzer (sieged, +25 vs structures) 75 per shot, Titan 78 per shot: a segment in 8 shots.

## 5. AI (skirmish T2 only; v3 campaign AI unchanged)
Parameters (`AI_FORT` in `43_ai_fortify.js`, deterministic, AI RNG only):
* **Bunker / Repair Battery** — Normal, Hard, Master: when the perceived threat at a non-main Hub (or any Hub while
  `ai.mil==='defend'`) exceeds 150 value, build one Bunker toward the enemy (max 1 per Hub, 2 total) and, from Era I
  with a Garrison, one Repair Battery (max 1 per Hub); idle infantry within 9 tiles load into a Bunker that has room
  while the threat lasts and unload when it is gone.
* **Wall** — Hard, Master only: when a rush is expected (enemy style `rush`, or enemy army seen before 4:00) and
  before 6:00, wall the top of the main ramp: one Gate in the middle, Wall segments on the rest (at most 8 tiles,
  once per game).
* **Enemy walls** — handled by the unit-level breach rule; the AI's attack target scoring ranks walls/gates/mines
  low (value 0.3) so armies do not wander to remote wall segments.

## 6. Balance method
* Cost efficiency vs units: the combat predictor (`cmbStackOf`/`cmbPredict`, `41_ai_lib.js`) evaluates each
  static defence (as a `static` stack) against equal-cost groups of Riflemen, Raptors, Rocketeers, Juggernauts
  and Skiffs; a structure should win against its target role at equal cost and lose against its counter
  (`tests/sim/fortify_balance.js` prints the table).
* Headless A/B (`tests/sim/fortify_ab.js`): T2-vs-T2 mirrored skirmish games, AI with defence vs AI with defence
  disabled (`AI_FORT.off`), ≥ 24 games, Wilson 95 % CI on the win rate. Results in §9.

## 7. UI
* Workers: **Defence** page on the command card (slot D): Wall, Gate, Bunker, Cannon Tower, Anti-Air Battery,
  Sensor Tower, Repair Battery, Mine.
* Wall line: desktop press-drag-release draws a tile-snapped 8-connected line; ghost per segment (green = legal,
  red = skipped), total cost label; the line is split over the selected Haulers and queued (shift-queue style).
  Touch: first tap = start, later taps / drag = end, ✓ in the placement bar builds.
* Gate auto-orients (2x1 vs 1x2) toward the adjacent blocked tiles. Gate card: Open (Q), Close (W), Auto (E).
* Bunker: right-click/tap it with infantry = load; card Unload All (Q), Salvage (Z). Dropship: Load (R, then a
  unit), Unload at point (S), Unload here (D); right-click/tap the Dropship with units = load.
* Hub: Scanner Sweep (S) with a target cursor (works on the minimap and on touch), Fortress upgrade (D).

## 7b. Files
`05_content_defense.js` (data), `31_defense.js` (team pathing, breach, defence step, detection, scan, mines,
battery, fortress, gates), `32_cargo.js` (cargo), `43_ai_fortify.js` (AI), `58_recipes_fortify.js` (3D recipes),
`68_fortify_ui.js` (command card, placement, overlays, info), `81_sfx_fortify.js` (voices). One-line hooks in
`10_map 20_sim 30_systems 42_ai_agent 45_campaign 46_save 51_art_b 60_render 70_ui 71_hud 72_menus 74_touch 90_main`.

## 8. Cut / deferred
Lift-off, creep, burrow for units (G2 abilities), AI use of Dropships (not required), AI Sensor/scan use.

## 9. Results
(filled in at the end of the track)
