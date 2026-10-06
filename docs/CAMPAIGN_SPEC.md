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
  cine:{ id:{...} },                   // cinematics, docs/CINEMATIC_SPEC.md (declared in 44_story_b_*.js: Object.assign(STORY.cine,{...}))
  radio:{ id:{who,text,style?,dur?} }, // in-mission comm lines (§4)
  barks:{ charId:{select:[..],ack:[..],levelup:[..],fall:[..]} }   // optional hero voice lines (spoken via 84_voice)
};
```
Other `44_story_*.js` files only `Object.assign(STORY.cine,{...})`, `STORY.missions.push(...)`, `Object.assign(STORY.radio,{...})` — so authors work in separate files without conflicts.
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
Total ≥ 12 characters, ≥ 4 `good`, ≥ 3 `evil`. Every `motif` is in `MOTIFS`; every character used in a cinematic / radio / bark exists here.
The **Overseer** is a rule-based colony dispatcher (CLAUDE.md rule 5): if it appears, it speaks in terse, procedural, non-sentient status lines and is never presented as understanding language.

## 3. Missions

```js
{ id:'m01', act:1, n:1, title, subtitle, place:'place id', synopsis:'1–2 sentences for the chapter card',
  briefing:'cineId'  // a CINE of kind 'briefing' (or 'interlude'): characters set up the objective
  debrief:'cineId'   // kind 'debrief' — played after victory
  defeat:'cineId'|null,  // optional kind 'defeat' short scene, otherwise the generic retry screen
  after:'cineId'|null,   // optional interlude played after the debrief (kind 'interlude'/'ending')
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
* `campaignStep(dt)` is called once per sim tick from `step()` (hook in place). Conditions are evaluated every 6th tick (5 Hz); `radio`/`cine` actions enqueue UI events in `G.camp.events` (drained by the UI through `onCampaignEvent`), they never touch the DOM.
* The default “destroy all enemy structures” rule still applies unless the mission sets `noDefaultWin:true`; the default “you lost all structures” rule unless `noDefaultLose:true`.
* `win` / `lose` conditions and the `win`/`lose` actions call `endGame('victory'|'defeat')` once; `G.camp.result={res,reason,t,stars}` is stored for the debrief.
* Everything is deterministic: scripted spawns use `G.rng`; for a fixed seed + same player input the mission evolves identically (tests re-run a mission twice and compare a state hash).
* Restrictions (`restrict`) are enforced in the same functions that already check `era`/`req` (reqBuild/reqUnit): a locked item returns the reason `'Locked in this mission'`.

### Progress save (UI side, 76_campaign_ui.js)
`localStorage[CAMP_SAVEKEY]={v:1,done:{m01:{stars:2,best:812,diff:'normal'}},seen:{cineId:true},last:'m03',diff:'normal'}`; reads/writes are wrapped in try/catch; a corrupt value is discarded, never thrown on.
A mission is playable when its predecessor is `done` (or `last` flows); the whole campaign is replayable; “Cinematics” gallery lists every `seen` cinematic (all unlocked after the credits).

## 4. In-mission dialogue (“radio”)
`STORY.radio[id]={who:'charId',text:'≤ 140 chars',style:'radio'|'normal'|'shout'|'whisper',dur:4}` — shown as a portrait + caption strip (DOM, near the top-centre, never over the minimap or command card), voiced by `speak()`; the `radio` action queues them (at most one visible; a queue of ≤ 3, newer lines for the same speaker replace stale ones). A mission needs ≥ 4 radio lines.

## 5. Structure & quantity gates (enforced by tools/validate_story.js)
* exactly 3 acts × 3 missions; every mission has `briefing` + `debrief` cinematics of the right `kind` and ≥ 2 primary objectives or one primary + one bonus.
* ≥ 1 `intro` (55–95 s), ≥ 6 `interlude`s, ≥ 1 `ending` (70–130 s) + 1 `credits`, ≥ 1 `defeat`; every id reachable from some mission/menu.
* Good vs evil is explicit: the final mission’s enemy side is the villain’s; the ending resolves the villain, the three heroes, and the worker everyman.
* Every referenced id exists (characters, cine, radio, objectives, flags set somewhere, music cues, sfx names, unit/building types); every coordinate is inside the map; every `faction`/`enemy` is valid and `enemy !== faction`.
* Timing: scene durations, line readability (`dur ≥ chars/CINE_LIMITS.readCps`), no overlapping lines in a scene, scene lines inside the scene, totals within `CINE_LIMITS.total[kind]`.
* Content: original fictional setting, PG-13 (no gratuitous gore), no real-world groups/brands, no slurs.

## 6. Authoring checklist for the mission designer
1. Pick `seed`; open the map with `tools/map_preview.js` (WF4 provides) to read the geography; place scripted events at real, reachable tiles.
2. Give the player a reason to act every 60–90 s (a trigger, a radio line, a wave); the story beat and the gameplay beat must coincide (the villain’s taunt arrives when the wave arrives).
3. Balance by simulation: `tests/sim/campaign_balance.js` runs the mission with the built-in AI on the player side (aiBoth) over ≥ 24 seeds-of-play (different `Math.random` streams) at the mission’s difficulty; the win rate target is 55–85 % for `normal` (a human beats the AI more often than the AI itself does), < 15 % for a trivial mission would mean the mission is broken.
