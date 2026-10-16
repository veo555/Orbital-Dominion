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

## 4. Damage types, armor classes, counter design

Every target has exactly one **armor class** (`armorClassOf`, 33_abilities.js): `struct` (any building) > `massive` (tag; Titan, Dreadnought) > `air` (flying) > `armored` (tag) > `light` (everything else). `bio` and `mech` stay *tags* (bonus damage, healing, EMP, Snipe).
Every weapon has a **damage type** `dt`. The multiplier applies to `(damage + bonus)` **before** flat armor is subtracted; `pen` ignores that many armor points (never below 0). v5 units have no `dt` = **kinetic** = x1.0 against everything, which is the calibration baseline of the whole v5 roster (and why the campaign is bit-identical).

| damage type | light | armored | structure | air | massive | used by |
|---|---|---|---|---|---|---|
| Kinetic (v5 baseline) | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | all v5 units, Jackal, Mauler |
| Explosive | 0.95 | 1.15 | 1.20 | 1.00 | 1.00 | Flak Trooper, Sunderer (sieged), Dreadnought, Barrage |
| Energy | 1.15 | 0.85 | 0.85 | 1.15 | 0.90 | Interceptor, Phantom, Disruptor |
| Piercing (+pen) | 0.75 | 1.25 | 1.00 | 1.00 | 1.25 | Lancer (pen 3), Marksman (pen 1), Sunderer mobile (pen 1) |

The tests (`tests/sim/arsenal.js` section B) spell the matrix out independently of `DMGX`; a mutant that swaps two entries fails. The AI's combat predictor (`cmbDmg`, 41_ai_lib.js) applies the same multipliers and the same penetration, and models flak as splash on aircraft only (`aaSplash`); the test checks predictor = simulation for the new weapons.

Other combat rules added: **air splash** (`aaSplash`: flak hits only flyers, shells only ground), **minimum range** of deployed siege units (`siege.minr`: they can neither acquire nor keep a target closer than it), **shields** (`u.sh`, `b.sh`: absorb in `damageEnt` before hit points), a **toggled cloak that survives firing** (cost: 3 energy per shot).

## 5. Roster matrix: unit x role x faction x era

Costs are crystals+ether, supply, build time; era gates the producing building's unit. `hits` = G ground, A air.

| unit | role | produced at | factions | era | cost / supply | HP / armor | weapon (type, dps note) | abilities | hard counter | counters |
|---|---|---|---|---|---|---|---|---|---|---|
| Lancer | anti-armor infantry | Garrison | all | II | 100+50 / 2 | 110 / 1 | 30 piercing pen 3, cd 1.5, rng 145, G | - | Raptor, Reaver, Jackal (light rush), Sunderer (outranges) | Juggernaut, Bulwark-class armor, Mauler |
| Flak Trooper | anti-air specialist | Garrison | all | II | 90+40 / 2 | 70 / 0 | 8 (+9 air) explosive air-splash 44, rng 190, A only | - | every ground unit (cannot hit ground) | Skiff, Interceptor, Phantom, Dreadnought masses |
| Interceptor | air superiority | Airfield | all | II | 110+90 / 2 | 100 / 0 | 10 (+6 air) energy, cd .55, rng 150, A only | - | Flak, Riflemen, Turrets | Skiff, Phantom, Watcher |
| Watcher | detector flyer | Airfield | all | II | 60+60 / 1 | 55 / 0 | unarmed, detect 260, sight 320 | Pulse Scan | anything that hits air | reveals Specter / Phantom / burrowed Mauler |
| Dreadnought | capital ship | Airfield + Lab | all | III | 500+350 / 10 | 950 / 3 | 32 (+16 struct) explosive, rng 235, G+A | Orbital Lance | Interceptor/Flak/Rifleman masses | everything that cannot hit air |
| Sunderer | siege tank | Siege Works | Meridian | II | 175+125 / 3 | 190 / 2 | mobile 20 piercing; sieged 54 explosive splash 50, rng 390, min 120 | Siege Mode | Raptor/Reaver (inside min range), air | ranged infantry, Lancer |
| Disruptor | caster (EMP) | Lab | Meridian | II | 125+100 / 2 | 80 / 0 | 9 energy, rng 130, G+A | EMP Pulse | Rifleman, Raptor | Howitzer, Skiff, Interceptor, energy users |
| Jackal | fast raider / scout | Garrison | Obsidian | II | 70+0 / 1 | 62 / 0 | 5 (+2 light) kinetic, cd .45, rng 105, G | Sprint | Raptor, Rifleman | Haulers, Rocketeer, Marksman |
| Mauler | regenerating brawler | Garrison | Obsidian | II | 100+60 / 3 | 190 / 1 | 15 (+4 light), rng 55, G | Burrow | Lancer, Rocketeer, detector | Rifleman/Raptor mixes |
| Marksman | caster (Snipe) | Lab | Aurora | II | 125+100 / 2 | 72 / 0 | 14 piercing pen 1, rng 175, G | Snipe | Raptor, Jackal | Rocketeer, Lancer, Reaver, Specter |
| Phantom | cloaked ground-attack flyer | Airfield + Lab | Aurora | II | 150+125 / 3 | 135 / 0 | 13 energy, cd .65, rng 125, G only | Cloak | Rifleman, Bulwark, Flak, any detector | Raptor, Howitzer, Juggernaut, Titan (cannot hit air) |

v5 units keep their rows (Rifleman line infantry, Raptor melee anti-light, Rocketeer anti-armor/air, Mender healer, Howitzer artillery, Juggernaut heavy walker, Skiff light fighter, Titan siege walker, Bulwark/Reaver/Specter uniques) and gain abilities: Overdrive (Rifleman, Raptor), Siege Mode (Howitzer), Pounce (Raptor, Reaver), Overcharge (Bulwark), Cloak toggle (Specter), Barrage (Titan).
Per faction (new, trainable): **Meridian** 7 (Lancer, Flak, Interceptor, Watcher, Dreadnought, Sunderer, Disruptor), **Obsidian** 7 (+Jackal, Mauler instead of Sunderer, Disruptor), **Aurora** 7 (+Marksman, Phantom). Build pages: Lab and Siege Works are on the second build page (6 of 8 slots).

## 6. Abilities, upgrades, buildings

**Framework** (`src/js/33_abilities.js`, table `ABIL`): targeting `self | toggle | point | unit`, cooldown, optional energy cost, tech gate, autocast flag with a deterministic `want(u)` rule per ability, command-card slot (stim 3, others 5, autocast switch 6), cooldown sweep and `mana`-style cost chip in the card. Orders: `{t:'abil'}` (walks into range, queueable with Shift). State is plain data: `u.ab[id] = {cd,on,t,auto}`, `u.energy/emax`, `u.sh`, zones `G.zones` (`lance`, `scan`, `barrage`). A manual toggle takes the unit off autocast for that ability.

| ability | units | target | cost / cooldown | effect |
|---|---|---|---|---|
| Overdrive (Stim) | Rifleman, Raptor | self | 12/12/6 HP, tiers I-III duration 8/11/14 s | +50 % speed and fire rate; needs Combat Stims |
| Siege Mode | Howitzer, Sunderer | toggle | deploy 1.6 s | range, splash; Sunderer min range 120; Siege Optics +60/+120 |
| Cloak | Specter, Phantom | toggle | 1.2 energy/s (Cloak Cells -25/-50 %), 3 per shot while cloaked | invisible outside detectors; autocast on by default |
| Pounce | Raptor, Reaver | unit (ground) | 14 s | 3x speed leap, 18 damage + 0.5 s stun |
| Sprint | Jackal | self | 20 s | +70 % speed 4 s |
| Overcharge | Bulwark | self | 30 s | 90 shield points + 3 armor, 8 s |
| EMP Pulse | Disruptor | point r105 | 60 energy / 12 s | -70 energy/mana, shields gone, cloak broken, mech slowed 35 % + 25 damage |
| Snipe | Marksman | unit (bio) | 50 energy / 8 s | 130 damage ignoring armor (70 vs heroes) |
| Burrow | Mauler | toggle | 3 s | cloaked, immobile, mute, +6 HP/s |
| Orbital Lance | Dreadnought | unit | 100 energy / 40 s | 1.6 s charge, 260 damage (420 structures) |
| Pulse Scan | Watcher | point r220 | 50 energy / 25 s | reveals everything, cloaks included, 8 s |
| Barrage | Titan | point r95 | 50 energy / 45 s | six shells over 3.6 s |

**Upgrades** (`TECH`, tiers with growing cost/time and era gates; `T.<key>` counts the level): Weapons I-III and Plating I-III (v5), **Combat Stims I-III** (v5 had one level), **Barrier Field I-III** (Lab: structure shield 120/260/420, Hubs x2, 14/s after 5 s without damage), **Cloak Cells I-II**, **Energy Cells I-II** (+30/+60 energy, +30/+60 % regeneration), **Siege Optics I-II** (Foundry/Siege Works). Research buttons show the level badge; the unit info card shows damage type, armor class, abilities (cooldown / ON / auto) and the upgrades that apply to the unit.
**Buildings**: Research Lab (3x3, era II, needs Armory; trains Disruptor/Marksman; research; unlocks Dreadnought) and Siege Works (3x3, era II, needs Foundry; Sunderer; Optics). Airfield and Foundry keep their v5 role and now say it on their cards.
**Campaign lock**: `G.teams[t].arsOff` (set by `arsenalInit` at newGame): campaign missions start with both sides on the v5 roster unless `setup.arsenal` is true; locked = new units/buildings/techs/abilities, stims tier II-III, new unit lists in Garrison/Airfield/Foundry; the Specter keeps its permanent cloak. The same switch is the "v5 AI snapshot" of the balance tests.
**AI**: new unit classes derive their weight from existing theta keys (`aa`<-cAnti, `cast`<-cSup, `det`<-cSup, `cap`<-cHeavy) and observation rules (AA share follows seen enemy air, a Watcher when cloakers were seen and no detector exists, ~1 caster per 10 supply, a capital ship when rich in Era III); a within-class tie-break prefers the better Lanchester counter. Hard/Master switch autocast on for their units once (rules in `ABIL.want`); Siege goes through `aiSiege` (APM charged). Detector flyers follow the army. Lab / Siege Works / Barrier / Optics / Cloak Cells / Energy Cells are built and researched when the army can use them. Easy/Normal keep the spawn defaults.
**Detection coordination (for the lead)**: `detectorsCover(team,x,y)` in 33_abilities.js is the shared helper; `isDetected(team,e)` in 20_sim.js is now a one-line wrapper over it, and Pulse Scan zones add detectors through `arsenalDetectors()` (called at the end of `buildDetectors`). G1's `isDetectedBy(team,unit)` can wrap `detectorsCover` or replace the body of `isDetected`; nothing in this track calls `isDetectedBy`.

## 7. (filled in as implemented) balance evidence: duel matrix, AI win rates

## 8. Unverified / known limits
