# Campaign & story — data model and runtime contract

Owners: story data `src/js/44_story_*.js` (WF1), runtime `src/js/45_campaign.js` + UI `src/js/76_campaign_ui.js` (WF4).
Vocabulary lives in `src/js/43_vocab.js` (machine-readable; the validator and the engines read it). Everything here is **data-only JSON-able literals** — no
functions in story data — so it can be validated, diffed, localised and (later) loaded from a file.

## 1. File layout and the `STORY` object

`44_story_a.js` declares the one global-in-IIFE:

```js
const STORY={
  meta:{title,tagline,version:1,rating:'PG-13',logline},
  world:{places:[{id,name,desc}],factions:{meridian:{...},obsidian:{...},aurora:{...}},glossary:[{term,desc}]},   // codex text (short)
  characters:{ idris:{...}, ... },     // §2
  acts:[{id:'act1',title,summary,missions:['m01','m02','m03']}, ...],   // 3 acts × 3 missions (MISSION_COUNT / ACT_COUNT)
  missions:[ ... ],                    // §3 (declared in 44_story_c_*.js with STORY.missions.push)
  dispatch:{ id:{id,kind,title,mood?,lines:[{who,text,style,expr?}]} },   // text dispatches, docs/DISPATCH_SPEC.md (declared in 44_story_b_dispatch_*.js: Object.assign(STORY.dispatch,{...}))
  radio:{ id:{who,text,style?,dur?} }, // in-mission comm lines (§4)
};
```
Other `44_story_*.js` files only `Object.assign(STORY.dispatch,{...})`, `STORY.missions.push(...)`, `Object.assign(STORY.radio,{...})` — so authors work in separate files without conflicts.
Files load alphabetically (`44_story_a` < `44_story_b_*` < `44_story_c_*` < `44_story_d_*`).

## 2. Characters

```js
idris:{
  id:'idris', name:'Marshal Idris Vale', short:'Idris', title:'Marshal of the Meridian Corps',
  side:'good'|'evil'|'gray', faction:'meridian'|'obsidian'|'aurora'|'neutral'|'none',
  role:'hero'|'villain'|'lieutenant'|'ally'|'mentor'|'civilian'|'narrator'|'rival',
  hero:'hero_idris'|null,                    // playable hero unit this character IS (idris/kaz/lyra only)
  bio:'2–4 sentences',  want:'what they want', flaw:'what holds them back', arc:'one sentence: how they change',
  voice:{pitch:1.0,rate:1.0,timbre:'smooth',formant:0.5,ttsPitch:0.8,ttsRate:1.0},   // see VOICE_KEYS in 43_vocab.js
  look:{skin:'#c58c6a',hair:{style:'short|long|shaved|crest|braid|hood|bald|bun|mane',color:'#222'},eyes:'#6cf',
        armor:{style:'plate|coat|robe|suit|rags|crown|hood',col:'#3d8bff',trim:'#a6ceff'},mark:['scar-l','tattoo','glow-eye','mask','visor','halo','cracks','none'],build:'lean|broad|slight|massive',age:'young|adult|old',emblem:'faction|none|crown|sun'},
  motif:'idris',                            // one of MOTIFS in 43_vocab.js
  quote:'a signature line'
}
```
Required characters (ids fixed): `idris`, `kaz`, `lyra` (the three heroes — their `hero` field names the unit), at least **one main villain** (`role:'villain'`, `side:'evil'`),
**one villain lieutenant**, a **worker-class everyman** (a Hauler pilot — the heart of the colony story; `role:'civilian'|'ally'`), and a `narrator`.
Total ≥ 12 characters, ≥ 4 `good`, ≥ 3 `evil`. Every `motif` is in `MOTIFS`; every character used in a dispatch / radio / bark exists here.
The **Overseer** is a rule-based colony dispatcher (CLAUDE.md rule 5): if it appears, it speaks in terse, procedural, non-sentient status lines and is never presented as understanding language.

## 3. Missions

```js
{ id:'m01', act:1, n:1, title, subtitle, place:'place id', synopsis:'1–2 sentences for the chapter card',
  briefing:'dispatchId'  // a dispatch of kind 'briefing' (or 'interlude'): characters set up the objective, shown as a text card before the briefing screen
  debrief:'dispatchId'   // kind 'debrief' — shown after the victory screen (Continue)
  defeat:'dispatchId'|null,  // optional kind 'defeat' short text, otherwise the generic retry screen
  after:'dispatchId'|null,   // optional interlude shown after the debrief (kind 'interlude'/'ending'); the ending is followed by the credits
  setup:{
    faction:'meridian', enemy:'obsidian', diff:'normal', seed:1101,        // seed FIXED per mission (the map is part of the level design)
    start:{c:400,e:0,era:1,hero:'none'|'available'|'start',units:[{type:'rifleman',n:4}],buildings:[{type:'turret',tx:20,ty:20}],supplyBonus:0},
    restrict:{buildings:['foundry','airfield'],units:['titan'],maxEra:2},     // anything listed is locked (greyed out with a reason) until an `unlock` action
    foe:{start:{c:0,e:0,era:1,units:[{type:'raptor',n:3}]},ai:true,mods:{waveMult:1,intervalMult:1,firstWave:380,hero:true,air:true}},   // the enemy side's start + AI tuning (`enemy` above is the faction id)
    swarm:'off'|'on',                                                   // Overseer layer (rule 5: 'off' must stay inert)
    daylight:'cycle'|'night'|'day'
  },
  objectives:[ {id:'o1',kind:'primary'|'bonus'|'hidden',text:'Short imperative, ≤ 60 chars',when:['flag','x']|null /*becomes visible*/,done:COND,fail:COND|null} ],
  triggers:[ {id:'t1',once:true,every:0,when:COND,delay:0,do:[ACTION,...]} ],
  win:COND, lose:COND,                                       // evaluated after triggers; `lose` ALWAYS includes player hub-and-army wipe-out unless noDefaultLose
  stars:{par:900},                                           // 1★ win · 2★ all bonus objectives · 3★ win under `par` seconds (game time)
  unlocks:{next:'m02'},
  hints:['one-line tips shown on the briefing card']
}
```
`COND`/`ACTION` are arrays `[op,...args]` — the exact ops and argument shapes are in `COND_OPS` / `ACTION_OPS` (43_vocab.js). Coordinates are **tiles** (map is 88×88), radii in tiles.
Player is always **team 0**, the enemy team 1; `me`/`enemy` resolve to those. Creeps (team 2) are never a side.

### Runtime semantics (45_campaign.js — headless-safe, no DOM, no wall clock, no `Math.random`)
* `newGame(opts)` with `opts.campaign=<mission>` calls `campaignInit(mission)` at the end of `newGame` (hook already in place): applies `setup` (resources, era, units, extra buildings, restrictions, AI mods, hero availability, swarm on/off, daylight), creates `G.camp={m,flags:{},flagT:{},obj:{},fired:{},t:0,log:[],radio:[],pendingCine:null,...}`.
* `campaignStep(dt)` is called once per sim tick from `step()` (hook in place). Conditions are evaluated every 6th tick (5 Hz); `radio`/`dispatch` actions enqueue UI events in `G.camp.events` (drained by the UI through `onCampaignEvent`), they never touch the DOM.
* The default “destroy all enemy structures” rule still applies unless the mission sets `noDefaultWin:true`; the default “you lost all structures” rule unless `noDefaultLose:true`.
* `win` / `lose` conditions and the `win`/`lose` actions call `endGame('victory'|'defeat')` once; `G.camp.result={res,reason,t,stars}` is stored for the debrief.
* Everything is deterministic: scripted spawns use `G.rng`; for a fixed seed + same player input the mission evolves identically (tests re-run a mission twice and compare a state hash).
* Restrictions (`restrict`) are enforced in the same functions that already check `era`/`req` (reqBuild/reqUnit): a locked item returns the reason `'Locked in this mission'`.

### Progress save (UI side, 76_campaign_ui.js)
`localStorage[CAMP_SAVEKEY]={v:1,done:{m01:{stars:2,best:812,diff:'normal'}},seen:{dispatchId:true},last:'m03',diff:'normal'}`; reads/writes are wrapped in try/catch; a corrupt value is discarded, never thrown on.
A mission is playable when its predecessor is `done` (or `last` flows); the whole campaign is replayable; the **Archive** (main menu) lists every `seen` dispatch and re-opens it as a text card (all open after the credits). Save format unchanged since 3.3: the v3 film ids are the dispatch ids, so old `seen` maps keep working.

## 4. In-mission dialogue (“radio”)
`STORY.radio[id]={who:'charId',text:'≤ 140 chars',style:'radio'|'normal'|'shout'|'whisper',dur:4}` — shown as a portrait + caption strip (DOM, near the top-centre, never over the minimap or command card), voiced by `speak()`; the `radio` action queues them (at most one visible; a queue of ≤ 3, newer lines for the same speaker replace stale ones). A mission needs ≥ 4 radio lines.

## 5. Structure & quantity gates (enforced by tools/validate_story.js)
* exactly 3 acts × 3 missions; every mission has `briefing` + `debrief` dispatches of the right `kind` and ≥ 2 primary objectives or one primary + one bonus.
* exactly 1 `intro`, 9 `briefing`s, 9 `debrief`s, ≥ 6 `interlude`s, ≥ 1 `ending` + 1 `credits`, ≥ 1 `defeat`; every id reachable from some mission/menu.
* Good vs evil is explicit: the final mission’s enemy side is the villain’s; the ending resolves the villain, the three heroes, and the worker everyman.
* Every referenced id exists (characters, dispatch, radio, objectives, flags set somewhere, music cues, sfx names, unit/building types); every coordinate is inside the map; every `faction`/`enemy` is valid and `enemy !== faction`.
* Dispatch lines: every `who` is a character id or `narrator`, `style` ∈ `LINE_STYLES`, `expr` ∈ `PORTRAIT_EXPR`, text ≤ `DISPATCH_LIMITS.lineMax` (150) chars, ≤ `linesMax` lines per dispatch, headings are spoken by `narrator`.
* Content: original fictional setting, PG-13 (no gratuitous gore), no real-world groups/brands, no slurs.

## 6. Authoring checklist for the mission designer
1. Pick `seed`; open the map with `tools/map_preview.js` (WF4 provides) to read the geography; place scripted events at real, reachable tiles.
2. Give the player a reason to act every 60–90 s (a trigger, a radio line, a wave); the story beat and the gameplay beat must coincide (the villain’s taunt arrives when the wave arrives).
3. Balance by simulation: `tests/sim/campaign_balance.js` runs the mission with the built-in AI on the player side (aiBoth) over ≥ 24 seeds-of-play (different `Math.random` streams) at the mission’s difficulty; the win rate target is 55–85 % for `normal` (a human beats the AI more often than the AI itself does), < 15 % for a trivial mission would mean the mission is broken.

## 7. Runtime reference (`src/js/45_campaign.js`)

Everything the UI (`76_campaign_ui.js`, menus, HUD), the tools and the tests may rely on. Verified by `node tests/sim/campaign.js` (fixtures: `tests/fixtures/campaign_ops.js`); the tests are mutation-checked (`tests/out/campaign/mutation_report.txt`, runner `tests/out/campaign/mutate.js`).
The runtime is **headless** (no DOM, canvas, audio, wall clock or `Math.random`); its only outputs are state in `G.camp`, state in the sim (units, resources, zones…) and **events**. Every internal lives in the `CR` closure; the functions in §7.9 are the public surface.

### 7.1 Lifecycle
1. **Start a mission:** `newGame({campaign:mission, diff:'normal'|…, aiBoth?, autoResume?})`. `newGame` first calls `campaignOpts(opts)`: `seed`, `faction`, `enemy` and `diff` default to `mission.setup.*` (an explicit value in `opts` wins; `opts.diff` is the player's chosen difficulty and overrides `setup.diff`). After the normal skirmish setup (hub + 6 haulers per side) `newGame` calls `campaignInit(mission, opts)`.
2. **Setup order** (fixed, so the result is reproducible; everything random uses `G.rng`): difficulty → `setup.flags` → player `start.c/e/era` → `start.buildings` (placed `done:true`; they are placed **before** any unit so nothing spawns inside a footprint; an unplaceable tile logs an error and is skipped) → hero policy → `start.units` (ring around the Hub, ground units only on walkable ground connected to the main base; haulers go mining) → `start.supplyBonus` → restrictions → `foe.start` (`c`,`e`,`era`, then `buildings`, then `units`; the enemy extras are an addition to the spec) → `foe.ai:false` ⇒ `G.ais[1]=null` → `foe.mods` → swarm → daylight → fog refresh. After `campaignInit` the objectives that are visible at the start have already been announced (`obj` events with `init:true`, delivered **synchronously inside `newGame`**).
3. **Every sim tick** `step()` calls `campaignStep()`. `G.camp.t` (mission seconds) = `G.time − t0` is updated every tick; **conditions are evaluated every 6th tick (5 Hz, i.e. at mission times 0.2 k s)**. One evaluation = *objectives → triggers (array order) → objectives again → win → lose → failed-primary-objective → default wipe-out rule*. Effects of a trigger (flags, spawns, locks…) are visible to later triggers in the same pass and to earlier ones on the next pass.
4. **End:** `endGame(res)` (from a `win` / `lose` condition or action, a failed primary objective, the default rules, or the UI's Surrender button) calls `campaignEnd(res)` **before** `onGameOver(res)`, which fills `G.camp.result` and emits the `end` event. After that `campaignStep` is inert.
5. `autoResume:true` (headless tests only) lets dispatch cards pass without holding the game (§7.4). Do **not** set it in the shipped game.

### 7.2 `G.camp` (exact fields)
| field | meaning |
|---|---|
| `m` | the mission object (never mutated) · `id` = `m.id` |
| `t` | mission seconds (float) · `t0` = `G.time` at start (0) · `tick` = number of `campaignStep` calls that ran (not counting held ticks) |
| `flags` `{name:true\|false}` · `flagT` `{name:t}` | flag values and the mission time each was set (only for flags that are set) |
| `obj` `{id:{state,kind,t}}` | `state` ∈ `hidden` (not revealed yet) · `active` · `done` · `failed`; `t` = time of the last change · `objs` = the valid objective definitions in mission order |
| `fired` `{triggerId:count}` · `fireT` `{triggerId:lastFireTime}` · `trig[i]` `{n,due,last}` | trigger bookkeeping (`due` = pending delayed firing time or −1); triggers without an `id` are keyed `'#<index>'` |
| `events` | bounded backlog (newest 300) of the events delivered to `onCampaignEvent` · `evSeq` next event number · `campaignDrainEvents()` returns and clears it |
| `log` | `[{t,k,…}]` bookkeeping trail (kinds `init`, `flag`, `trigger`, `dispatch`, `dispatch-end`, `end`), newest 400 |
| `radio` | `[{id,t}]` radio lines emitted (newest 200) · `mood` last mood (`'calm'` at start) |
| `hold` · `pendingDispatch` · `dispQ` | blocking-dispatch state (§7.4) · `autoResume` |
| `result` | `null` until the mission ends, then `{res:'victory'\|'defeat', win, reason, t, stars, diff, par, bonusDone, bonusTotal, objectives:[{id,kind,text,state}]}` |
| `errors` | one string per distinct data problem (`"where: message"`), logged once (≤ 200) — a valid mission has `errors.length===0` (the validator should be the first line of defence; the runtime never throws on bad data) |
| `locks` `{building:{id:true},unit:{id:true}}` · `maxEra` (1..3, eras above it are locked) · `heroPolicy` (`'available'`\|`'none'`) | restrictions (§7.7) |
| `supplyBonus` | added to the player's supply cap in `recalcTeams` (still ≤ `MAXSUP`) · `daylight` `'cycle'\|'day'\|'night'` |
| `reveals` | active `reveal` zones `[{x,y,r,until}]` (pixels / mission time) · `aiBase` the AI's `P` after the difficulty/style adjustments (baseline for `aimod`) · `aiMods` last `aimod` values applied |
| `cnt` | `{built:[{type:n}×3], trained:[{type:n}×3]}` per team (the `built` / `trained` conditions read team 0) |
| `endReason`, `pendingLose`, `evSeq`, `errSeen` | internal |

Also written by the runtime: `G.camps[i].cleared / clearedBy (team, −1 = other) / clearT` when every unit of a creep camp is dead.
`result.reason`: victory → `'win'` (mission `win` condition or `win` action), `'structures'` (default rule: every enemy structure destroyed); defeat → `'lose'` (mission `lose` condition), the author's id of a `lose` action, `'objective:<id>'` (a failed **primary** objective), `'wipeout'` (default rule), `'structures'` (default rule: all your structures destroyed), `'surrender'` (the UI called `endGame('defeat')` while you still had structures).

### 7.3 Events — `onCampaignEvent(e)`
Delivered **synchronously** from inside the sim (during `step()` or `newGame`), and also pushed on `G.camp.events`. A throwing handler is caught (logged in `errors`), it can never break the sim. Never mutate `e`. Every event has `n` (1,2,3… in delivery order), `t` (mission seconds) and `type`:
| `type` | extra fields | emitted by |
|---|---|---|
| `radio` | `id` — look the line up in `STORY.radio[id]` (`who,text,style,dur`) | `radio` action |
| `dispatch` | `id`, `hold` (`true` = the game is held until you call `campaignResume(id)`; `false` = autoResume) | `dispatch` action, and again for each queued dispatch when its turn comes |
| `obj` | `id`, `state` (`'active'` = just became visible, `'done'`, `'failed'`), `kind`, `text`, `init` (`true` for the ones visible at mission start; show the list, not a toast) | objective changes, `obj` action |
| `mood` | `mood` (`calm\|tension\|battle\|dread\|victory`) | `mood` action |
| `ping` | `tx`,`ty`,`kind` (`good\|bad\|info`) — a map ping fx (`G.fx` kind `ping`) is already created; UI: minimap blip / camera hint | `ping` action |
| `spawn` | `side`,`utype`,`n`,`tx`,`ty` (anchor tile),`where`,`order` | `spawn` action (informational: a ring fx is already created) |
| `res` | `res` (`c`\|`e`), `delta` (±) — toast “+200 crystals” | `give` / `take` |
| `reveal` | `tx`,`ty`,`r` | `reveal` action |
| `strike` | `tx`,`ty`,`r`,`dmg`,`delay`,`side` (`'enemy'`\|`'me'`) — a warning: siren / red minimap blip; the zone and a warning ring fx exist already | `strike` action |
| `unlock` | `kind` (`building\|unit\|era`), `id`, `locked` (`false` = unlocked, `true` = locked) — toast; the runtime calls `uiDirty()` | `unlock` / `lock` |
| `herolevel` | `level` | `herolevel` action |
| `end` | `res`,`reason`,`stars`,`t` — `G.camp.result` is complete | `campaignEnd` |
There are no events for `flag`, `aimod`, `heal`, `win`, `lose` (use `end`). An `end` event can arrive while a dispatch is still held (a trigger `[['dispatch',x],['win']]`): show the queued cards first, then the end screen (90_main.js does not call `showEnd` while `G.camp.hold`).

### 7.4 Blocking dispatch protocol (`dispatch` action; was `cine` in 3.x)
* `dispatch` queues the id on `dispQ`. If the queue was empty: `hold=true`, `pendingDispatch=id`, event `{type:'dispatch',id,hold:true}`. The rest of that trigger's actions still run (they are instantaneous); evaluation of the other triggers in the same pass continues.
* **While `G.camp.hold` is true `step()` returns immediately** (guard at the top of `step()` in `30_systems.js`: no tick, no `G.time`, no AI, no campaign evaluation). The UI frame loop **should also** skip the stepping loop and zero its accumulator while hold is set (`if(G.camp&&G.camp.hold){acc=0;}`), otherwise a burst of up to 14 catch-up steps runs right after the resume.
* The UI shows the dispatch card (`campDispatch` in 76_campaign_ui.js: Continue / Skip all / Esc all close it), then calls **`campaignResume(id)`** (the id from the event; with no argument it resumes the current one). It returns `true` if it resumed, `false` if nothing was held or `id` is not the pending one (a stale resume is harmless). If more cinematics are queued, the next one becomes `pendingDispatch`, its `dispatch` event is delivered **during that call**, and `hold` stays true; otherwise `hold=false` and the world runs again.
* Calling `campaignResume` synchronously from inside `onCampaignEvent` is supported (skip / auto-play).
* The card itself is a modal DOM overlay (`#campDispatch`): a static, scrollable transcript with portrait chips, no animation. While it is open the game keyboard is swallowed (Enter / Space continue, Esc skips the whole chain).
* A `dispatch` whose id is not in `STORY.dispatch` is logged to `errors` and **skipped** (never a soft-lock).
* Headless tests: `newGame({campaign:m, autoResume:true})` (or `G.camp.autoResume=true`): the event is delivered with `hold:false`, nothing is held.

### 7.5 Condition semantics (all numbers compared with ±1e−6; `cmp` ∈ `< <= == >= > !=`)
Sides: `me`=team 0 (the player), `enemy`=team 1; creeps (team 2) are never a side. A *tile* position means the **centre of tile (tx,ty)**; radii are in tiles; “within r” is `distance ≤ r`.
| op | exact meaning |
|---|---|
| `all …` / `any …` / `not c` | short-circuit; `all` of nothing = true, `any` of nothing = false; `not` needs exactly one condition. Any malformed part makes the **whole** top-level condition false (also under `not`) |
| `time cmp s` | mission seconds (`G.camp.t`) |
| `flag f` · `after f s` | flag is set · flag is set and `t − flagT[f] ≥ s` (setting an already-set flag keeps its time; clearing and re-setting restarts it) |
| `count unit\|building side type cmp n` | alive census. units: type = a unit id, `*` (all), `army` (armed non-workers: `!worker && !noWeapon && dmg>0`, heroes count, Menders/Freighters/Haulers do not) or `worker` (`def.worker`); units inside garrisons / geysers count. buildings: a building id or `*`; **includes buildings under construction** (like `structs`) |
| `res c\|e cmp n` | the player's current crystals / ether |
| `era side` · `supply side` | `T.era` · `T.used` (supply used, including queued units; refreshed every tick) |
| `hero alive` · `hero dead` · `hero level cmp n` | player hero: unit exists · it **has died at least once and is not alive now** (false before it was ever trained) · `hero.level` (persists while dead) |
| `heroNear tx ty r` | the player's hero is alive and within r tiles |
| `kills side` · `lost side` | team counters (units, buildings and creeps killed by that side · units + buildings that side lost) |
| `structs side` | alive buildings of that side (all states) — the default “destroy all structures” rule |
| `camps cmp n` | creep camps whose **last** unit was killed by the player (a camp finished by the enemy does not count) |
| `unitsNear side type tx ty r cmp n` | like `count unit`, restricted to the circle |
| `built bt cmp n` | **cumulative** number of buildings of that type the player has *completed* by construction: buildings given by `start.buildings` never count, a completed building that is destroyed later still counts |
| `trained ut cmp n` | cumulative units of that type the player produced in buildings (`spawnUnit`; includes hero (re)training; excludes scripted spawns and start units) |
| `researched id` | the player's tech `id` has level ≥ 1 |
| `hubs side cmp n` | **operational** (finished) Command Hubs alive |
| `mined c\|e cmp n` · `trade cmp n` | the player's lifetime mined crystals / ether (`minedC/minedE`) · crystals earned by freighter trade routes (`tradeEarn`) |
| `obj id state` | `active` (visible, not done/failed) · `done` · `failed`; an unknown id is an error (false) |
| `wave cmp n` | the enemy AI's `wave` counter (attack waves launched); 0 when the AI is off |

### 7.6 Action semantics
| action | exact effect |
|---|---|
| `radio id` | event `radio` (+ `G.camp.radio` history). Existence of the line is not checked here (the validator does) |
| `dispatch id` | §7.4 |
| `obj id show\|done\|fail` | `show`: hidden → active. `done` / `fail`: hidden or active → that state. **Done and failed are sticky** (the first outcome wins). Failing a *primary* objective loses the mission (`objective:<id>`); a failing bonus / hidden objective does not |
| `flag name bool` | set / clear (silent) |
| `spawn side type n where [{order}]` | `n` (cap 60) units around `where`: `'base'` = ring around that side's Hub · `[tx,ty]` = around that tile · `'edge:N\|E\|S\|W'` = around the **midpoint of that map edge**, 3.5 tiles inside it. Placement uses `G.rng` only (ground units only on walkable ground connected to the main base). `order`: `'idle'` (default; workers start mining) · `'hold'` · `'attack'` = attack-move on the opposing Hub (nearest enemy building if none), **speed-capped to the slowest unit ×1.12 exactly like an AI wave** (workers / unarmed units just move). Creep types are refused; a hero type only for a side of its own faction that has no hero in play (n forced to 1). With the enemy AI on, scripted enemy units are part of its army (it may reassign idle ones): use `foe.ai:false` for a fully scripted foe. Player units are auto-enrolled in the swarm exactly like trained ones |
| `give` / `take c\|e n` | player resources `+n` / `−n` (never below 0), `n ≥ 0`; event `res` |
| `reveal tx ty r [secs]` | **live vision for the player** inside the circle for 8 s (optional 4th argument = seconds, an addition); afterwards the tiles stay explored. Applied in `updateVision` via `campReveal()` |
| `ping tx ty good\|bad\|info` | event + a `G.fx` ping |
| `aimod {waveMult,intervalMult,firstWave,hero,air}` | adjusts the enemy AI's `P` live. **Absolute, relative to `G.camp.aiBase`** (the baseline after difficulty and faction-style adjustments), so repeating or restoring is safe: `P.base=aiBase.base·waveMult`, `P.step=aiBase.step·waveMult` (clamped 0.05–20), `P.iv=aiBase.iv·intervalMult`, `P.first=firstWave` (seconds, absolute), `P.hero`, `P.air` (booleans). Unknown keys / bad values are logged, others still apply. Silent no-op when `foe.ai:false`. `setup.foe.mods` uses the same function |
| `strike tx ty r dmg delay [sfx] [side]` | pushes an **orbital zone** (`G.zones`, the same object the hero's Orbital Strike uses; `updateZones` fires it): radius `r` tiles, `dmg` to units and **`round(dmg×1.25)` to structures**, after `max(0.1,delay)` s, damaging everything not on the striking side (creeps included). `side` (7th element, default `'enemy'`; `'me'` for friendly support). Calls `sfx(sfx||'alert',x,y)` once as the warning (the impact plays `boomBig`), a warning ring fx, and emits `strike`. Kills are credited to the striking side |
| `mood m` | event + `G.camp.mood` |
| `win` / `lose reason` | `endGame('victory')` / `endGame('defeat')` once; `reason` is stored in `result.reason` |
| `unlock` / `lock building\|unit\|era id` | edits `locks` / `maxEra` (`unlock era N`: `maxEra=max(maxEra,N)`; `lock era N`: `maxEra=min(maxEra,N−1)`); unlocking the player faction's hero unit id lifts hero policy `none` (locking it sets it); event `unlock` + `uiDirty()` |
| `herolevel n` | raises the player's hero level to n (never lowers; xp raised to the threshold; applies to a living hero immediately, else when it is trained; skill points follow) |
| `heal side tx ty r` | every unit and building of that side within r tiles → full hp (+ ring fx, `sfx('heal')`) |

### 7.7 Restrictions and hero policy
`campLocked(team, kind, id)` returns `'Locked in this mission'` or `null`; only **team 0** is ever locked (the enemy AI is shaped through `foe.*`). `kind`: `'building'` (checked by `reqBuild` and by `orderBuild`, so agents and the Overseer obey too), `'unit'` (`reqUnit` ⇒ `queueUnit`), `'era'` (id = the era being entered; `queueEra`), `'hero'` (id ignored; `queueHero` returns `false` and toasts the reason; the UI's hero button should show `campLocked(0,'hero')` as its reason). `restrict.maxEra:N` ⇒ `campLocked(0,'era',k)` for `k>N`. `start.hero`: `'none'` = locked; `'available'` (default) = normal; `'start'` = the faction hero stands at the Hub at the start. The swarm labour market can still hire freelancer *units* of a locked type (not covered).
`reqBuild/reqUnit` return `{ok:false, why:'Locked in this mission'}` — the existing greyed-out-with-reason UI shows it.

### 7.8 Objectives, win / lose, stars
* Objective visibility: `when:null` ⇒ visible (`active`) from the start; `when:COND` ⇒ `hidden` until it first becomes true (sticky); `kind:'hidden'` objectives always start hidden and are evaluated while hidden: they reveal themselves by being completed (or by `when` / `obj show`). `done` is checked before `fail` in each pass. `campObjectives()` lists the visible ones.
* `win` / `lose` conditions are evaluated each pass **after** the triggers; a `null` condition never fires. If both are true in the same pass **victory wins**. Then: a failed primary objective ⇒ defeat; then the default rule below.
* **Default rules** (unless the mission sets the flag): *all enemy structures destroyed* ⇒ victory (the existing building-death rule; `noDefaultWin:true` disables it) and *all your structures destroyed* ⇒ defeat (`noDefaultLose:true`). `noDefaultLose` also disables the **hub-and-army wipe-out** rule: no Hub alive **and** no armed unit **and** no worker ⇒ defeat `'wipeout'`. (A hub-less player with a few Haulers and < 400 crystals is not detected as lost: they can surrender.)
* **Stars** (only on victory): `1` + `1` if every `kind:'bonus'` objective is `done` (vacuously true when the mission has none) + `1` if `t ≤ stars.par` (no `par` ⇒ no speed star). `t` = mission seconds at the end.

### 7.9 Public functions (global inside the IIFE, usable by 70–90 and the tools)
| function | contract |
|---|---|
| `campaignInit(m,opts)`, `campaignStep(dt)`, `campaignEnd(res)`, `campLocked(team,kind,id)`, `campNoDefaultEnd(team)` | the hooks the sim calls (do not call them from the UI) |
| `campaignOpts(opts)` | pure; returns a copy of the `newGame` options with the mission's seed / faction / enemy / diff filled in |
| `campaignResume(id?)` | §7.4 · returns boolean |
| `campaignDrainEvents()` | returns and clears `G.camp.events` (use when polling instead of / in addition to the callback) |
| `campObjectives(all?)` | `[{id,text,kind,state,t}]` for the HUD (visible objectives; `all` also returns `state:'hidden'` ones) |
| `campaignSummary()` | JSON-able snapshot `{id,title,t,hold,pendingDispatch,mood,over,result,flags,objectives,fired,locks:{buildings,units,maxEra,hero},supplyBonus,daylight,aiMods,campsCleared,built,trained,errors,events}` or `null` without a campaign |
| `campEvalCond(c)` · `campDo(a)` | evaluate one condition / run one action against the live game (tools, tests, debug); malformed ⇒ `false` and logged. `campDo` returns whether the action ran |
| `campNote` `campCreepKilled` `campReveal` `campDaylight` | internal sim hooks |
The only sim → UI call the runtime makes is `onCampaignEvent(e)` (stubbed in `tests/sim/simlib3.js` and `76_campaign_ui.js`); `toast`/`sfx`/`uiDirty` are the existing stubs.

### 7.10 Progress save (pure helpers, no I/O except the two wrappers)
`localStorage[CAMP_SAVEKEY] = {v:1, done:{missionId:{stars:0..3,best:seconds|null,diff}}, seen:{dispatchId:true}, last:missionId|null, diff:'easy'|'normal'|'hard'}`.
* `emptyCampaignSave()` → a fresh `{v:1,done:{},seen:{},last:null,diff:'normal'}`.
* `campaignSaveSanitize(raw)` → a **valid** save from any input (non-object / wrong `v` ⇒ empty; bad entries dropped; stars clamped 0..3, best rounded, unknown difficulty ⇒ `'normal'`, ids must match `[A-Za-z0-9_-]{1,48}`). Total: never throws.
* `campaignSaveUpdate(save, missionId, result, story?)` → **new** save (input untouched). `result` = `G.camp.result`. Defeats and invalid results change nothing. Victory: `done[id].stars = max(old, new, 1)`, `best = min(old best, round(t))`, the difficulty of the best-starred run is kept, and the next mission is unlocked: `last` = `campaignNextId(id)` unless `last` is already further along (replaying an old mission never moves it back); the last mission leaves `last` on itself. `seen` is never touched (the UI owns it).
* `campaignNextId(missionId, story?)` → `mission.unlocks.next`, else the next mission in `STORY.missions`, else `null`.
* `campaignCanPlay(save, missionId, story?)` → `true` for the first mission, a mission already `done`, the `last` mission, or one whose predecessor (array order) is `done`; `false` for unknown ids. A corrupt save behaves like an empty one.
* `campaignSaveRead(store?)` / `campaignSaveWrite(save, store?)` → `localStorage` wrappers (try/catch inside; a corrupt or missing value ⇒ empty save; write returns `true/false`). `store` is injectable (`{getItem,setItem}`).
(`story` defaults to the global `STORY`; pass a story object to test with fixtures.)

### 7.11 Sim hooks, determinism, what is **not** verified
* Edits in shared files (each guarded by `G.camp`, so a game without `opts.campaign` is **bit-identical** to before — state hashes of 3 seeds × 3000 ticks, plain and Autopilot, match `HEAD`): `newGame` (`campaignOpts`), `queueHero`, `orderBuild`, `spawnUnit` (trained counter), `recalcTeams` (supply bonus), `updateVision` (`campReveal`), `kill` (creep camp tracking), `dayNight` (daylight override), `updateBuilding` (built counter), `step` (hold guard).
* Determinism: for a fixed seed, `Math.random` stream and player input the campaign state is bit-identical (state hash includes `G.camp`); scripted spawn positions depend on `G.rng` only. `addUnit` itself still draws two cosmetic `Math.random` values per unit (existing, BACKLOG B-20).
* Not covered / known: the real browser UI (76), real missions (44_*), `reveal`/`strike` visuals, the labour market can hire locked unit types, `swarm:'on'` missions are only smoke-tested (setup flag), `trade` is tested by field not by a real freighter run, the Overseer's `bbCells` assumes the player's Hub exists at tick 15 (a mission that deletes it earlier is out of contract).
