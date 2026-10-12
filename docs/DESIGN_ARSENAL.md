# v6-G2 ARSENAL — design document

> **Progress note (keep current).** Status at the top, newest first.
> - [start] Inventory + gap analysis + decisions written (this file). Code: not started.
> Branch `worktree-agent-a0a408690751bfe6b`. The parallel track G1 FORTIFY (walls, gates, bunkers, cargo, dropship, sensors, mines, batteries, hub fortress) is **not** in this document.
> Everything below marked *(numbers)* is tuned against the duel simulator (`tests/sim/duel.js`); the final tables in §7 are the measured ones.

Task: "fully think through the buildings, items, arsenal, weapons; look through StarCraft 2 and compare what could be missing; go next level."
Scope of this track: combat units, unit abilities, upgrade tiers, tech structures, weapon/armor types and counters. Not: fortifications, transport, mines, detection structures.

---------------------------------------------------------------------------------------------------------------------

## 1. Inventory of the v5 roster (what is in the code today)

### 1.1 Units: 19 definitions (`UDEF`, `src/js/00_core.js`)

| group | ids | notes |
|---|---|---|
| economy (2) | `hauler`, `freighter` | hauler is the worker (builds, repairs, mines); freighter trades, unarmed |
| line infantry (4) | `rifleman`, `raptor`, `rocketeer`, `mender` | rifleman 55 hp ranged all-round, raptor melee anti-light, rocketeer +14 vs armored, mender heals bio + detects (energy 100) |
| heavy ground (3) | `howitzer`, `juggernaut`, `titan` | howitzer has Siege Mode (range 170 -> 350, splash, ground only), juggernaut 320 hp / armor 3, titan era III 900 hp / armor 4 splash |
| air (1) | `skiff` | the only flyer: 125 hp, hits air and ground, ignores terrain |
| faction uniques (3) | `bulwark` (Meridian), `reaver` (Obsidian), `specter` (Aurora) | bulwark `projArmor` 2 (extra armor vs ranged), reaver lifesteal .5, specter permanent cloak |
| heroes (3) | `hero_idris`, `hero_kaz`, `hero_lyra` | 3 skills each (aura / active / ultimate), mana, levels 1..6 |
| creeps (3) | `crawler`, `spitter`, `brute` | neutral camps |

Buildings: 12 (`BDEF`): hub, generator, depot, siphon, habitat, garrison (trains rifleman/raptor/rocketeer/mender + the faction unique), armory (researches weapons/armor/stims), forum, exchange, foundry (howitzer/juggernaut/titan), airfield (skiff), turret.
Techs: 6 (`TECH`): `weapons` (3 levels, +15 % damage each), `armor` (3 levels, +1 armor each), `stims` (1 level), `mining`, `compress`, `cargo` (1 level each).

### 1.2 Combat model (`20_sim.js` `fire/dmgVs/projHit/damageEnt`, `30_systems.js`)

* One damage number per attack: `base = dmg * (1 + .15 * weapons) * dmgMul`, plus **bonus damage** `bon` keyed by the target's **tags** (`light armored struct air bio mech`), then **flat armor** is subtracted (`max(1, a - armor - armorUpgrade - projArmor)`). No damage types, no percentage armor.
* Splash (`splash` px) hits **ground units and structures only**; flying units are never splashed. There is no air-splash and no minimum range.
* Siege Mode is a hard-coded special case (`toggleSiege`, field `def.siege`), Stim another (`useStim`, tech `stims`). The hero skills are a third, separate system (`SKILLS`, `castSkill`, `u.cds`, mana). There is **no generic ability concept**.
* Cloak: `def.cloak` (permanent) or the `cloak` buff; seen only inside a detector circle (`G.det`, built each tick from units/buildings with `def.detect`: mender 230, hub 200, turret 230). Attacking sets `revealT` 1.6 s.
* Shields do not exist. Structures have hp and armor only.
* Heal: the Mender spends energy for 14 hp/s on bio units; Meridian repairs for half price.
* Supply/economy: crystals, ether, supply cap 120, morale scales production speed (`moraleMul`) and mining.

### 1.3 The v5 roster as roles

| role | v5 answer | gap |
|---|---|---|
| cheap line | rifleman | ok |
| melee anti-light | raptor, reaver | ok |
| anti-armor | rocketeer (+14 vs armored) | also hits air, fragile; no armor-piercing specialist |
| anti-air | rifleman, rocketeer, bulwark, skiff, turret (everything "hits air") | **no AA specialist**, so air units have no hard counter |
| air superiority | skiff (does both) | **no air-to-air fighter**; air is a single unit |
| harass / scout | raptor, skiff | no cheap fast raider, no scouting identity |
| siege | howitzer (Siege Mode) | no min range, one unit, no Robotics-style building |
| caster / support | mender (heal), heroes | **no caster: no EMP, snipe, force field** |
| stealth | specter (permanent) | nothing in the air, no toggle/energy cost |
| detector | mender/turret/hub (ground, fixed) | **no detector flyer** |
| capital | titan (ground, era III) | **no capital ship** |
| shields/barriers | none | missing |
| upgrades | weapons/armor 3 levels, everything else 1 level | no unit-specific tiers (siege range, stim duration, cloak energy), no shield tier |

---------------------------------------------------------------------------------------------------------------------

## 2. Gap analysis against StarCraft II

| SC2 | race | what it teaches | status in v5 | decision for this game |
|---|---|---|---|---|
| Marine / Zealot / Zergling | all | cheap line unit | rifleman / raptor | keep |
| Marauder | T | armored-bonus, slows | rocketeer (partial) | **Lancer** (armor-piercing, ground only) |
| Reaper | T | fast raider, scout, harass | raptor (melee) | **Jackal** (Obsidian) |
| Ghost | T | snipe, EMP, cloak | none | **Marksman** (snipe) + **Disruptor** (EMP) |
| Hellion / Baneling | T/Z | splash vs light | howitzer splash | not added (Reaver/Raptor already cover light) |
| Siege Tank | T | mobile / sieged modes, min range | howitzer | **Sunderer** (both modes, min range) + Siege Works |
| Thor / Hydralisk / Stalker | T/Z/P | ground AA | none | **Flak Trooper** (air-splash specialist) |
| Viking / Phoenix / Mutalisk | all | air superiority | skiff | **Interceptor** |
| Banshee | T | cloaked ground-attack flyer | none | **Phantom** (Aurora) |
| Raven / Overseer / Observer | all | detector + scans | none | **Watcher** (flying detector, Pulse Scan) |
| Battlecruiser / Carrier / Void Ray / Corruptor | all | capital | titan (ground) | **Dreadnought** (era III flyer) |
| Medivac | T | heal + transport | mender | transport belongs to G1 (cargo/dropship) |
| Sentry (Force Field) | P | terrain denial | none | **cut**: walls/gates (G1) cover the role |
| High Templar (Storm) | P | area burst | hero skills | cut: covered by Idris Barrage / Lance |
| Immortal (barrier) | P | shield vs burst | none | **Overcharge** on the Bulwark (shield + armor) |
| Colossus / Ultralisk / Roach | P/Z | tank, regen | juggernaut | **Mauler** (Obsidian: regen + **Burrow**) |
| Stim | T | burst for bio | stims tech | becomes ability + 3 tiers |
| Siege mode | T | deployed form | Howitzer | becomes ability (framework) |
| Cloak | T/P | energy-draining invisibility | specter (free) | cost: energy drain, toggle |
| Blink / Charge | P | gap closer | none | **Pounce** (raptor, reaver) |
| Burrow | Z | ambush / heal | none | **Burrow** (Mauler) |
| EMP | T | strips energy and shields | none | **EMP Pulse** (Disruptor) |
| Snipe | T | single-target burst vs bio | none | **Snipe** (Marksman) |
| Spawn Larva / Chrono | Z/P | macro | morale + Exchange | n/a (different economy) |
| Weapon/armor levels, Forge/Armory | all | 3 levels per class | weapons/armor 3 levels | keep; add **tiered unit-specific** lines |
| Shields (Protoss) | P | second health bar | none | **Barrier Field** (structures) + unit shields (Overcharge) |

Faction mapping (identity first):

* **Meridian** (industrial fortress builders): heavy, mechanical, siege and machinery. New: **Sunderer** (siege tank), **Disruptor** (EMP). Barrier Field and Siege Optics are their natural upgrades.
* **Obsidian** (aggressive biomech swarm): fast, cheap, regenerating. New: **Jackal** (fast raider), **Mauler** (regen brawler, Burrow). Leap/Pounce on Raptor and Reaver.
* **Aurora** (shadowy merchants, energy): casters, stealth, air. New: **Marksman** (snipe), **Phantom** (cloaked ground-attack flyer). Specter gets a cloak toggle.
* **All factions** share the *role* units, drawn in the faction's art: **Lancer**, **Flak Trooper**, **Interceptor**, **Watcher**, **Dreadnought**. Every faction therefore has an answer to armor, air, stealth and a capital ship, but a different flavour of caster/siege/raid.

---------------------------------------------------------------------------------------------------------------------

## 3. Decisions (what is built, what is cut)

Shipped scope (details in the sections below): an ability framework (`33_abilities.js`), 11 new units, 2 new tech structures (Lab, Siege Works), 4 new tech lines + stims tiers, damage types x armor classes, structure Barrier shield and unit shields, AI integration, campaign lock, UI/help/sfx/art.

Cut (documented, not forgotten): Force Field (G1 walls), Storm, Medivac transport (G1), Chrono/Larva (no equivalent economy), per-class weapon/armor lines (they would stack with the existing global lines and inflate power; the existing 3-level global lines stay), "carrier"-style spawned units (needs a child-unit system).

Design rules used throughout:

1. **v5 behaviour is the baseline.** Every v5 unit keeps `dt` undefined = kinetic = all multipliers 1.0, and the campaign keeps the v5 roster bit for bit (`G.arsenalOff`).
2. **Everything with state is plain data** (`u.ab`, `u.sh`, `G.zones` entries, `T.<techkey>`); static tables (`ABIL`, `DMGX`, new `UDEF/BDEF/TECH` entries) are saved by name through `saveRoots()`.
3. **New sim code uses `G.rng` only** and runs inside `step()`.
4. **No new AI parameters**: the league theta vector stays 29 numbers. New unit classes derive their weight from existing keys plus observation rules.

---------------------------------------------------------------------------------------------------------------------

## 4. (filled in as implemented) damage types, armor classes, matrix

## 5. (filled in as implemented) roster matrix unit x role x faction x era

## 6. (filled in as implemented) abilities, upgrades, buildings

## 7. (filled in as implemented) balance evidence: duel matrix, AI win rates

## 8. Unverified / known limits
