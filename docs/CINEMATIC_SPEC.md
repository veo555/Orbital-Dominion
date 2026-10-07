# Cinematic engine — scene format and renderer contract

Owners: engine + art `src/js/64_cine_art.js`, `65_cine_fx.js`, `66_cine.js` (WF3); scripts in `STORY.cine` (WF1). Vocabulary: `src/js/43_vocab.js` (CINE_*).
These “videos” are **real-time, procedurally rendered canvas films** with synthesized score, subtitles and (optional) speech. They ship inside the HTML file (no video files), so they stay sharp at
any resolution. `cineExport()` additionally records one to a downloadable **WebM** (MediaRecorder on the cinematic canvas + the audio graph), for sharing on a website.

## 1. Scene format

```js
STORY.cine.intro={
  id:'intro', kind:'intro', title:'Landfall', music:'intro',          // MUSIC_CUES id (starts at t=0, may be changed per scene)
  letterbox:true, seed:7,                                              // 2.39:1 bars; seed feeds all procedural noise (determinism)
  scenes:[{
    id:'s1', dur:6.5,
    bg:{k:'orbit',planet:'azure',limb:'bottom',station:true,ships:3},   // CINE_BG: kind + its params (all optional, sensible defaults)
    cam:{from:{x:.5,y:.55,z:1.0,r:0},to:{x:.5,y:.5,z:1.25,r:0},ease:'inout'},     // normalised pan (0..1), zoom (0.5..3), roll (rad ±0.3)
    actors:[{id:'a1',char:'idris',at:[.28,.62],h:.78,face:'r',expr:'determined',mode:'bust',t0:.4,t1:6.5,move:{to:[.3,.62],ease:'out'}}],
    props:[{k:'ship',cls:'dropship',faction:'meridian',from:[-.1,.3],to:[.6,.5],scale:1,rot:.1,t0:0,t1:6,ease:'inout'},
           {k:'unit',type:'rifleman',faction:'meridian',from:[.3,.8],to:[.35,.8],scale:2.2,t0:0,t1:6}],
    fx:[{k:'stars',t0:0,t1:6.5,a:.9},{k:'flare',t0:2,t1:3,x:.7,y:.4,col:'#ffd9a0'},{k:'shake',t0:3,t1:4,a:.6}],
    lines:[{who:'idris',text:'We were never meant to stay on the ground.',t:.8,dur:3.4,style:'normal',expr:'determined'}],   // subtitle + speech; `who:'narrator'` allowed
    sfx:[{t:0.2,name:'whoosh'},{t:3.0,name:'rumble'}],
    music:{cue:'tension',section:0},                                    // optional change of cue at scene start
    title:{text:'ORBITAL DOMINION',sub:'The Ashen Crown',t0:4,t1:6.4}, // optional centred title card
    trans:{in:'fade',out:'cut',len:.6}
  }, ...]
}
```
Times `t`, `t0`, `t1`, `dur` are seconds **relative to the scene start**; ease ∈ `lin|in|out|inout`. Positions are normalised screen coordinates (0..1, origin top-left; props may start/end off-screen, e.g. `-0.1`).

## 2. Renderer contract (engine, WF3)

* **Pure frames.** `cineFrame(id,t,canvas,opts)` paints the exact image at global time `t` from `(STORY.cine[id], t, seed)` only — no wall clock, no `Math.random`, no state carried between frames (particles are closed-form from seeds). This makes frames testable, diffable and screenshot-able, and makes seeking/skipping trivial.
* **Player.** `cinePlay(id,{onEnd,skippable:true,muted:false,from:0})` shows `#cineOverlay` (full-viewport `<canvas id="cine">`, DOM subtitle strip `#cineSub` with `role="status"`, progress hairline, “Skip ▸▸” button that appears on pointer move/tap, `Esc`/`Space` skips, gamepad-free). A cinematic NEVER blocks input forever: skip works at every moment, including while fonts/speech load; `visibilitychange` pauses the clock (music + time).
* **Sizing.** DPR-aware (cap 2.5), letterboxed to 2.39:1 inside any viewport (phones in portrait get a taller 16:9→ crop with the safe-area insets; subtitles stay inside the safe area), re-layout on resize/orientation.
* **Performance budget.** ≥ 45 fps on the software-rendered headless Chromium at 1280×720 is the *gate for relative cost*; on real phones aim for 30 fps using `Q.fps`/quality tiers (`62_quality.js`): tier ‘battery’ halves particles and skips bloom. Backgrounds are cached per (scene, size) into offscreen canvases; only actors/props/fx redraw per frame.
* **Reduced motion** (`SET.rm`): no shake, no flashes, no strobing glitch; cuts/fades only; camera moves become slow cross-fades.
* **Audio coupling.** At start the player calls `musicPlay(cue)` (fade 0.4 s), per-scene cue changes crossfade, `sfx` entries call `cineSfx(name)`, each `line` calls `speak(who,text,{style})` and sets `musicDuck(0.45)` while speech is audible. At the end the previous in-game music is restored.
* **Subtitles** are always shown (accessibility; TTS is best-effort, many devices have no voices). Character name + colour chip (their faction colour) precedes each line; style `radio` adds a static-crackle frame; `whisper` dims; `shout` enlarges; `narration` is italic with no portrait.
* **Portraits** (`drawPortrait(g,charId,expr,cx,cy,h,opts)` in 64_cine_art): vector busts generated from `STORY.characters[id].look`; every character is visually distinct at 64 px (avatar chips) and at full-screen; expressions in `CINE_EXPR`; `mode:'silhouette'` (rim-lit black), `'shadow'` (villain hidden in dark, glowing eyes), `'hologram'` (scanlines, cyan tint, jitter). Lip-sync: mouth opens with the speech amplitude envelope of the voice blips while a line is active.
* **Backgrounds** (`CINE_BG`): each kind is a painter `(g,W,H,params,t,seed)`; space/planet/orbit/array scenes must look rich (nebula noise, atmosphere rim light, ring shadows, city lights on the night side, station geometry), ground scenes use the game’s own sprite painters (`artUnit`, `artBuilding`, `unitSprite`, `buildingSprite`) for props so the film matches the game’s look.
* **FX** (`CINE_FX`) are layered on top of bg/props/actors in a fixed order (bg → props → actors → fx → vignette → grade → letterbox → title/subtitles).
* **Colour grade** per scene derived from bg + time-of-day (teal/orange for Aurora, steel-blue for Meridian, ember-red for Obsidian, desaturated for tragedy); film grain subtle and seeded.

## 3. Engine API (global functions inside the IIFE)
```
cinePlay(id,opts) -> {stop(),skip(),pause(),resume(),t(),done:Promise}
cineStop()          cineActive() -> bool        cineDuration(id) -> seconds (sum of scenes minus nothing: scenes are sequential)
cineFrame(id,t,canvas,opts)                       // pure still
cineExport(id,{w:1280,h:720,fps:30,bitrate:4e6,onProgress}) -> Promise<Blob|null>   // null when MediaRecorder/captureStream are unavailable (Safari/iOS < 17)
cineGallery() -> [{id,title,kind,len,seen}]       // for the Extras menu
```
`opts.record` paths must not play audio twice or leave the live overlay visible: export renders off-screen faster than real time only for video frames; audio is captured in real time, so export takes ≈ the film’s duration (progress callback).

## 4. Tests the engine must ship (WF3 + WF5)
1. `tests/e2e/e2e_cine.py` — plays the intro at 1280×720, 844×390 (landscape phone) and 390×844 (portrait): overlay visible, subtitle text matches the data, skip works (click, Esc, Space), game state untouched, zero page errors/network requests, `cineFrame(id,t)` twice ⇒ identical pixel hash, every `CINE_BG`/`CINE_FX`/`CINE_PROPS` entry renders without throwing and produces non-uniform pixels (a test **mutated** to a blank painter must fail).
2. `tools/cine_contact.py` — renders a contact sheet (PNG grid of N frames per cinematic) into `tests/out/cine/` for visual review by agents and humans.
3. Export test at tiny size (320×180, 2 s): a non-empty `video/webm` Blob (skipped with a printed notice if the browser cannot record).

## 5. Painter interfaces & engine internals

Written by the engine owner for the art agents (portraits, space backgrounds, ground backgrounds, props, fx). **Everything here describes code that exists and is tested**
(`src/js/64_cine_art.js` = registry + helpers + placeholders, `src/js/66_cine.js` = engine, `tests/e2e/e2e_cine.py` = gate). You never need to read the player code:
you replace entries in one registry, call the shared helpers, and look at the result with `tools/cine_contact.py`.

### 5.1 Loading order, file ownership, scope

Files load alphabetically into the single game IIFE:

```
64_cine_art.js        registry CINE_PAINT, helpers (cn*), palettes (CN_*), PLACEHOLDER painters for every vocabulary id     <- engine owner
64_cine_bg_ground.js  suggested: surface, base, battlefield, ruins (+ bridge, hall, map if nobody else takes them)             <- ground agent
64_cine_bg_space.js   suggested: space, planet, orbit, array, void                                                           <- space agent
64_cine_portraits.js  CINE_PAINT.actor (every character, every mode)                                                         <- portrait agent
64_cine_props.js      CINE_PAINT.prop.*                                                                                      <- props agent
65_cine_fx.js         CINE_PAINT.fx.*                                                                                        <- fx agent
66_cine.js            the engine (never touch)
```
* **Replace, do not extend.** `CINE_PAINT.bg.planet = function(...){...}` overwrites the placeholder. A real painter has no `placeholder` property, so `cineStats().placeholders` shrinks.
* **Scope.** All art files share one scope. Wrap yours in `(()=>{ ... })();` and keep helpers inside it; any top-level `const`/`function` you add must be unique across the whole game (prefix with your file's initials, e.g. `cpt` portraits, `cbs` bg-space, `cbg` bg-ground, `cpr` props, `cfx` fx). The code is not in strict mode, so a bare `function` declaration in a `{}` block leaks.
* **Use the game's own art** where it fits: `artUnit(g,type,col,faction)`, `artBuilding(g,type,w,h,col,faction)` (`w,h = BDEF[type].w*TILE, .h*TILE`), `FACTIONS[f].col` (`{base,light,dark,glow}`), `NEUTRAL_COL`, `UDEF`, `BDEF`, the drawing helpers `rr circ ell poly line lgr rgr` of `50_art.js`. Both art functions draw around the origin and expect `g.lineJoin='round'`, `lineCap='round'`; scale the context yourself (see the placeholder `prop.unit` / `prop.building`). Vector code stays crisp at any zoom — do not blit small cached sprites.
* **Colours** come from `CN_PLANET`, `CN_NEBULA`, `CN_BIOME`, `CN_TOD`, `FACTIONS` and the character `look` data; token colours for UI-like drawing via `cnTok('--txt','#e6f0fc')`.

### 5.2 Purity rules for every painter (the engine and the tests depend on them)

1. **Pure function of its arguments.** No `Math.random`, `Date`, `performance.now`, no module-level mutable state that changes the picture, nothing carried from the previous frame. Randomness = `cnHash(seed, i, j, k)` (or `cnR`), `cnVN`/`cnFbm` noise, or a `cnRng(seed)` (mulberry32) **inside a static bake only**, where call order is fixed. Time = the `t` argument.
2. **Particles are closed form**: position = f(seed, i, t). `cnPhase(t,period,i,seed)` gives a looping 0..1 phase with a per-particle offset; `cnR(seed,i,j)` the j-th random number of particle i. Count them with `cnN(n,S)` (battery tier halves it).
3. **Never throw.** The engine catches and logs once (`CINE_PAINT.errors`, `console.error`) and the gate fails on any error. Guard against `p.xyz` being undefined: parameters are optional, defaults are applied only for the vocabulary keys (5.4).
4. **Leave the context as you found it** or use `g.save()/g.restore()` yourself; the engine also saves/restores and resets `globalAlpha / compositeOperation / shadow / dash / textAlign` around every call, so you cannot poison the next layer, but you can poison your own later drawing.
5. **Any `W:H`.** The frame is 2.39:1 in landscape, 16:9 in portrait phones (and 16:9-ish when the film has `letterbox:false`). Compose for 2.39:1 and keep everything that matters inside the central 16:9 (x between 0.125 and 0.875 of the width at 2.39:1). Sizes in px must scale with the frame: use `S.u` (`= H/540`, 1.0 at a 540 px tall frame) for stroke widths, particle radii and font sizes.
6. **Do not print debugging text** except through the placeholder pattern `cnLabel` (it is gated by `CINE_PAINT.labels`; real painters should not draw labels at all).

### 5.3 The registry and exact signatures

```js
const CINE_PAINT = { bg:{}, prop:{}, fx:{}, actor:null, grade:null, trans:{}, errors:[], labels:true };
```

| Registry entry | Signature | Called |
|---|---|---|
| `bg[kind]` (kind in `CINE_BG`) | `(g, W, H, p, t, seed, S) => void` | once per scene and size when `fn.static===true` (t = 0), otherwise every frame (t = scene-local seconds) |
| `bg[kind].anim` (optional) | `(g, W, H, p, t, seed, S) => void` | every frame, drawn over the baked static part (same coordinates); use for twinkle, windows, drifting clouds |
| `prop[kind]` (kind in `CINE_PROPS`) | `(g, x, y, size, p, t, seed, S) => void` | every frame the prop is visible and on screen |
| `fx[kind]` (kind in `CINE_FX`) | `(g, W, H, e, t, seed, S) => void` | every frame inside the entry's `[t0,t1]` |
| `actor` | `(g, charId, state, cx, cy, h, opts) => void` | every frame per visible actor |
| `grade` | `(g, W, H, G, t, seed, S) => void` | once per frame after the vignette (a complete default exists) |
| `trans[kind]` (kind in `CINE_TRANS`) | `(g, W, H, k, dir, seed, S) => void` | every frame of a transition |

Declare the static flag **explicitly** on every background: `fn.static = true` (deterministic, time independent: baked once into an offscreen canvas and re-used for every frame and every camera pose) or `fn.static = false` (animated: redrawn every frame — expensive; prefer a static `fn` plus a light `fn.anim`). The gate fails a background that declares neither.

Common to all painters:
* `g` is a 2D context whose canvas is the **frame buffer** `W x H` device pixels (one picture, no letterbox, no subtitles). `g.canvas` is that buffer, so effects that need the picture drawn so far (glitch, heat haze) can `g.drawImage(g.canvas, ...)`.
* `seed` is a uint32 that is unique per (film seed, scene, layer entry): same data => same seed => same picture. Pass it to `cnHash`/`cnR`/`cnVN`.
* **`S`** is the painter context, **shared and mutated by the engine between calls: read it, never keep it, never write it.**

```
S.W, S.H        frame size in px (same as the W,H arguments)          S.u        unit scale = H/540 (use for line widths, radii, font px)
S.aspect        W/H                                                   S.seed     the same seed that was passed as the argument
S.part          particle multiplier (battery .5, balanced .8, high 1, ultra 1.25)    S.tier  'battery'|'balanced'|'high'|'ultra'
S.rm            true under reduced motion: no flashes, no strobing, no shake, calmer motion (your painter must obey; the engine already removes camera shake)
S.cam           {x,y,z,r} current camera (normalised pan, zoom, roll in rad); identity for a static bake
S.tod           'day'|'dusk'|'night'|'dawn' | 'space'|'interior'|'void'  (the bg's `time` param, else derived from the bg kind)
S.faction       'meridian'|'obsidian'|'aurora'|null   (bg.faction / hall style / battlefield sides[0] / first actor's faction)
S.key           key light {x,y,col,a}: x,y in 0..1 of the frame (may lie outside), col css colour, a 0..1 — the direction the scene is lit from; actors rim-light with it
S.lights        point lights active NOW from the fx list: [{x,y,col,a,r}] normalised (flare/explosion/lightning/beam/pulse); [] inside a static bake
S.ts            scene-local seconds (0 inside a static bake)           S.sceneIdx scene number inside the film
S.fill          (backgrounds only) {x,y,w,h}: the rectangle you MUST cover, see 5.4
S.static        (backgrounds) true while baking, false while drawing a frame
S.a, S.env, S.k (props, fx) master alpha = entry.a * fade envelope (g.globalAlpha is already set to S.a), the envelope alone, and progress 0..1 across the entry's [t0,t1]
S.pos, S.pos2   (fx) screen px {x,y} of entry x,y and of entry `to`, already projected through the camera (null when the entry has no x/y / no `to`)
S.zoom          effective background zoom (fx / props can scale sizes with it)
S.from          (transitions) the incoming-scene source canvas, see 5.8
```

### 5.4 Backgrounds `bg[kind](g,W,H,p,t,seed,S)`

* **Coordinates:** the design frame is `(0,0)-(W,H)`. `p` = the scene's `bg` object **with vocabulary defaults applied** (`CN_BG_DEF[kind]`, e.g. `p.nebula` defaults to `'blue'`, `p.rings` to `false`); arrays (`features`, `sides`, `marks`, `focus`) are shared with the story data: never mutate them. Unknown extra keys are possible; ignore them.
* **Bleed:** camera pans, zooms out and rolls reveal area outside the frame. The engine bakes an oversized canvas and calls you with `S.fill = {x,y,w,h}` (e.g. `x=-0.12*W`): **paint opaque pixels over all of `S.fill`**, not just `0..W x 0..H` — start with `cnFillBg(g,S,gradientOrColour)` and extend sky / ground / stars to the edge of `S.fill`. If you do not, the engine stretches the frame's edge pixels into the margin as a safety net (visible as streaks during pans). The margin is 0 for a locked-off scene and up to about 0.5 for a strong zoom-out.
* **Resolution:** a static bake may be rendered at up to 2x resolution (the engine applies the scale to `g` for you; you keep drawing in `W x H` units). The cost of a bake grows with the zoom of the scene, so keep it light: **budget <= 150 ms at 1280x536 and 1x zoom** in the software-raster test browser (the gate prints a note above 200 ms). Bake expensive noise at low resolution (see `cnNebula`, which samples a quarter-resolution field and upscales) and avoid per-pixel loops over the full frame.
* **Static vs animated:** put everything that never changes into the static `fn`; put twinkle, flicker, smoke, windows, scan lines into `fn.anim` (cheap, `<= 2 ms`). In the static pass `t` is always 0 and `S.ts`/`S.lights` are empty: nothing may depend on when the bake happens.
* **Look:** the engine grades the picture afterwards (teal/orange for Aurora, steel blue for Meridian, ember red for Obsidian, desaturated for tragedy cues, tod tints, vignette, bloom, grain), so paint **neutral, well-exposed, slightly flat** backgrounds with real depth (gradients, atmospheric perspective, light sources) rather than pre-graded ones. Leave readable calm space around x = 0.28 and 0.72 (typical actor positions) and in the lower third.
* Parameter meaning is in `CINE_BG` (`src/js/43_vocab.js`): ranges `'0..1'`, enums, `bool`, `[x,y]`, `[{x,y,k}]`. Use `S.key`, `S.tod`, `S.faction` to stay consistent with the grade and the actors.

### 5.5 Props `prop[kind](g,x,y,size,p,t,seed,S)`

* Each prop entry in a scene: `{k, cls|type|faction|planet|shape (kind params), at|from,to, scale, rot, t0, t1, ease, a, col, z}` (see section 1; the validator allows exactly these keys).
* **The engine has already done the placement**: the context is translated to the layer's camera transform, rotated by `p.rot` around `(x,y)` and mirrored when the prop moves leftwards (`p.flip===true`, a prop that "faces +x" therefore always leads with its nose). Draw **centred on `(x,y)`**, facing **+x**, top-down for units and buildings (like the game's own sprites) and side-on for ships.
* **`size`** = `H*0.25*scale` px, the nominal bounding diameter: `scale:1` is a quarter of the frame height. Scale your art so that `size` is its natural extent (a dropship's length, a planet's diameter, a unit sprite's diameter ~ `size`, a building's longer side). A planet / moon prop may be much larger (`scale` up to ~3).
* `p` = the entry with defaults (`CN_PROP_DEF[kind]`): `p.cls, p.type, p.faction, p.planet, p.shape, p.col` (override colour, may be undefined), `p.a`, `p.scale`, `p.z`, plus engine-computed `p.vx, p.vy` (px per second while it moves, else 0), `p.flip`, `p.rot` (already applied: do not rotate again).
* **`t`** = seconds since the prop's own `t0` (>= 0); `S.ts` scene time; `S.k` progress along its `[t0,t1]` window. Props with `from`/`to` move over `[t0,t1]` then hold at `to`; static props (`at`) are visible during `[t0,t1]`. Fades of 0.25 s are applied through `g.globalAlpha` (`S.a`).
* **Depth:** `z < 0` far layer (parallax 1.05), default mid layer (1.15), `z >= 1` drawn **in front of the actors** with stronger parallax (zoom 1.35, pan 1.4). Off-screen props are culled before your painter runs.
* Make every **variant distinct** (the gate prints a note when two variants of one kind render identically): `ship.cls` x `faction`, each `unit.type`, each `building.type`, `planet.planet`, `holo.shape`, `banner/crowd.faction`.
* Ground a prop with `cnShadow(g,x,y+size*.35,size*.4,size*.12,.4)` when it sits on a surface; use `cnGlow` for engine flames and lights.

### 5.6 FX `fx[kind](g,W,H,e,t,seed,S)`

* The engine draws fx **in screen space** (identity transform) after props and actors, in list order, only while `t0 <= scene time <= t1` (defaults `0` and the scene length). `shake` is **engine-only** (it moves the camera; the registry entry is an empty function — do not implement it).
* `e` = the story's fx entry. Conventions every fx painter must honour (all optional): `a` intensity 0..1 (default 1; already folded into `S.a` and `g.globalAlpha`), `x,y` anchor in 0..1 of the frame (use **`S.pos`**, which is already projected through the camera, and fall back to the frame centre when null), `to:[x,y]` second anchor (`S.pos2`), `col` css colour, `n` density multiplier (default 1), `dir` angle in radians (rain, snow, sparks), `spd` speed multiplier, `r` size multiplier, `seed` (the engine already derives one per entry; honour `e.seed` only through the `seed` argument).
* **`t`** = seconds since `e.t0`. One-shots (`explosion`, `flare`, `lightning`, `sparks`, `glitch`, `beam`) animate from `t=0`; ambient fx loop. `S.env` (0..1) is the engine's fade in/out, applied only when the entry does not start at the scene start / end at the scene end: default 0.3 s in and out; `explosion` 0 / 0.25, `flare` 0.1 / 0.3, `lightning` 0 / 0, `sparks` 0 / 0.3, `glitch` 0 / 0, `beam` 0.12 / 0.2 (`CN_FX_ENV` in `66_cine.js`); `S.k` is the progress across `[t0,t1]`.
* **Alpha:** `g.globalAlpha` is preset to `S.a`. If you set your own alpha, **multiply by `S.a`**. Additive light uses `g.globalCompositeOperation='lighter'` (the engine resets it afterwards).
* **Reduced motion (`S.rm`)**: no full-frame flashes (cap `lightning`/`explosion` flash alpha at ~0.15), no strobing `glitch` (draw nothing), no jitter in `heat`; calm motion is fine.
* **Budget** <= 3 ms per frame for everything active at once at 1280x720; counts through `cnN(n,S)`.
* `glitch` and `heat` read back the current picture with `g.drawImage(g.canvas, sx,sy,sw,sh, dx,dy,sw,sh)`; that is allowed and fast.

### 5.7 Actors / portraits `actor(g,charId,state,cx,cy,h,opts)`

```
charId   key of STORY.characters (look data, section 2 of docs/CAMPAIGN_SPEC.md: skin, hair{style,color}, eyes, armor{style,col,trim}, mark[], build, age, emblem, faction)
state    { expr: 'neutral'|'talk'|'angry'|'smirk'|'sad'|'shock'|'smile'|'determined'|'laugh'|'scared'|'cold'|'weary',      // CINE_EXPR, always valid
           mode: 'bust'|'silhouette'|'shadow'|'hologram',                                                                  // CINE_ACTOR_MODES
           talk: 0..1,   // mouth opening right now: closed-form lip-sync from the line text; 0 when silent; use it for the mouth in EVERY expression
           blink: 0..1,  // eyelids closed amount right now (a 0.17 s blink about every 3 s); 0 = open
           face: 'l'|'r',// the side the character looks towards: mirror horizontally when 'l'
           t: seconds }  // scene time, for idle motion (breathing, hair, hologram flicker); the engine already adds a tiny bob / sway
cx, cy   centre of the bust box in px; h = box height in px (a bust with h = 0.8*H is the common close-up)
opts     { W, H,         frame size in px
           bottom,       px y the torso must extend down to (>= the frame bottom): draw the body down to it so the bust never floats
           seed, u,      per-actor seed (stable for the whole scene) and unit scale (H/540)
           key, lights, rim,   S.key / S.lights (see 5.3) and rim = css rim-light colour from the key light: use it for rim highlights and silhouette edges
           tod, faction, S }
```
* **One function draws every character**, from `look` data: it must work for *any* valid look (13 different fixture looks in `tests/fixtures/story_min.js`, and the real story's). Every character has to be distinguishable at 64 px (avatar chips: `drawPortrait` is also used by the campaign UI) and good at full-screen; faces: expressions from `state.expr`, mouth from `state.talk`, eyelids from `state.blink`.
* `expr:'talk'` is a neutral face with slightly parted lips; the engine passes `talk>0` when a line is being spoken (styles `thought` and `narration` do not move the lips).
* **Modes:** `bust` normal; `silhouette` rim-lit black (use `opts.rim`); `shadow` villain hidden in the dark with glowing eyes (the `look.eyes` colour, additive glow); `hologram` cyan tint, scanlines, flicker/jitter from `state.t`, slightly transparent.
* The engine animates nothing but position, fades (0.35 s in/out at `t0`/`t1`) and the idle bob; **everything inside the face and body is yours**. Budget <= 2 ms per portrait at 1280x720.
* Public wrapper kept for the UI: `drawPortrait(g,charId,expr,cx,cy,h,opts)` builds `state` from `opts` (`face, mode, talk, blink, t`) and calls `CINE_PAINT.actor`; `opts` may also carry `bottom`, `seed`, `key`, `rim`.

### 5.8 Transitions and grade (engine-owned, replaceable)

* `trans[kind](g,W,H,k,dir,seed,S)`, `k` 0..1 linear. **`dir:'in'`**: the new scene is already in `g`. `fade` = from black, `flash` = from white (`S.from` null); `wipe`, `iris`, `glitch` reveal the new scene over `S.from` = the **previous scene's last frame** (a black canvas for the first scene), a `W x H` canvas: draw it where the old picture still shows. **`dir:'out'`**: `g` holds the scene; take it to black (white for `flash`), `S.from` null. Under reduced motion the engine substitutes `fade` for every kind except `cut`.
* **Where `in`/`out` apply** (`scene.trans = {in,out,len}`; `len` default 0.6 s, clamped to 45 % of the scene): `in` plays over the first `len` seconds of the scene, `out` over the last `len` seconds; `cut` = nothing. A scene without `trans`: the first scene fades in from black (0.6 s), the last fades out (0.8 s), the others cut. Scenes are sequential; transitions do not overlap or lengthen a film.
* `grade(g,W,H,G,t,seed,S)`: `G = {tint,tintA, top,bot,splitA, sat, lift,liftCol, bloom, vig, grain}` derived per scene from time of day, faction, bridge alert, cues (`tragedy`, `dread`, `betrayal`) and an optional `scene.grade` override object with the same keys. The default implementation applies `sat`, a split-tone (`top` shadows / `bot` highlights) and `tint` with blend modes; `lift`, `vig`, `bloom`, `grain` are applied by the engine (vignette, a screen-blended bloom on tiers above battery, seeded 24 fps film grain).

### 5.9 The frame, layer order, budgets

```
bg (cached, camera-transformed, + bg.anim)   -> props (z<1) -> actors -> props (z>=1) -> fx -> vignette(+lift) -> grade -> bloom -> grain -> radio crackle (radio lines)
   -> scene in/out transition -> [window blit with letterbox bars] -> title card -> subtitles (DOM in the player, burned in for export / stills)
```
* **Camera** `scene.cam = {from:{x,y,z,r}, to:{...}, ease}` (defaults `x,y = .5`, `z = 1`, `r = 0`; no `cam` at all = a 4 % push-in over the scene). Layers move with depth: background pan x1.0 / zoom x1.0; props pan x1.15 / zoom x1.15; **actors pan x0.5 / zoom x0.35 / roll x0.5** so portraits stay readable; far props 1.05, foreground props 1.4. Shake (`fx` `shake`, `a` 0..1) is added to the pose of all layers; roll is limited to +-0.3 rad.
* **Seeds:** `scene seed = hash(film.seed ?? 1, sceneIndex, scene.id)`; each painter gets `hash(sceneSeed, layer, entryIndex)`. Same film data => bit-identical frames, even after the baked caches are dropped (tested).
* **Performance budget (1280x720, software raster, the headless test browser = relative cost only):** engine overhead measured at about 10 ms per 1280x536 frame on the *high* tier (about 4.5 ms on *battery*: no bloom, no grain, cheaper blend) with placeholder painters — camera-transformed background blit 2.3, grade 1-3, bloom 2.4, grain 1.5, vignette 0.3, final blit 0.4; the whole frame must stay <= 22 ms (>= 45 fps). That leaves painter budgets of: animated bg <= 2 ms, props <= 2 ms, actors <= 2 ms each (<= 4 ms total), fx <= 3 ms, static bg bake <= 150 ms. Remember that full-frame draws with a smoothing *scale* are the expensive operation in software raster (2 ms each at 1280x536 vs 0.3 ms for a 1:1 blit): bake large overlays at frame size and draw them 1:1. Real phones render at 30 fps through `Q.fps`; the player also steps its own render scale down when frames run slow. Check with `python3 tools/cine_contact.py` (prints ms per frame) or the stage profiler: set `__RTS.CNE.prof={}` (needs `window.__TEST='live'`), render some frames with `__RTS.cineFrame`, read per-stage milliseconds back from `__RTS.CNE.prof`, then set it to `null`.

### 5.10 Shared helpers (all in `64_cine_art.js`, available to every later file)

```
numeric   cnC01(x) cnFrac(x) cnSS(a,b,x) smoothstep · cnEase(name,k) name in CINE_EASE · cnMap(x,a,b,c,d) clamped remap
hash      cnH32(a,b,c,d) -> uint32 · cnHash(a,b,c,d) = cnR(...) -> [0,1) · cnHashStr(str) · cnRng(seed) -> mulberry32 (sequential; static bakes only)
noise     cnVN(x,y,seed) value noise · cnFbm(x,y,seed,oct,lac,gain) · cnN1(x,seed) · cnFlicker(t,seed,rate) · cnBlink(t,seed) 0..1 eyelid
particles cnN(n,S) quality-scaled count · cnPhase(t,period,i,seed) looping 0..1 phase
colour    cnCol(css)->[r,g,b,a] (cached: never mutate) · cnA(css,alpha) · cnRGB(r,g,b,a) · cnMix(a,b,t) · cnShade(c,k -1..1) · cnLum(c) · cnHSL(h,s,l,a) · cnFac(faction)->{base,light,dark,glow} · cnTok('--token',fallback)
gradient  cnLG(g,x0,y0,x1,y1,stops) · cnRG(g,x,y,r0,r1,stops) · cnRG2(g,x0,y0,r0,x1,y1,r1,stops)   stops = [[pos,css],...] or ['#a','#b'] / ['#a','#mid','#b']; never throw, return a colour string for degenerate input
light     cnGlow(g,x,y,r,col,a,{core,add,squash}) additive soft glow · cnShadow(g,x,y,rx,ry,a) contact shadow · cnVignette(g,W,H,s,col,lift,liftCol) · cnBloom(g,amt) (frame-buffer bloom)
text      cnText(g,str,x,y,{size,font,weight,italic,track(em),align,base,fill,stroke,lw,shadow:{col,blur,dy},glow:{col,blur}}) -> width · cnWrap(g,str,maxW) -> lines · CN_FONT, CN_SERIF
scenery   cnStars(g,x,y,w,h,seed,n,{u,twinkle:t,tint}) · cnNebula(g,x,y,w,h,seed,pal,{density,scale,alpha,warp,cell}) (static bakes) · cnSphere(g,x,y,r,pal,{phase,light,seed,detail,atm,night}) lit planet/moon
background cnFillBg(g,S,style) · cnScratch(name,w,h) reusable offscreen canvas (contents undefined, do not nest the same name; engine names 'fb*' are reserved) · cnLabel(g,W,H,txt,S) · cnParam(p)
palettes  CN_PLANET[azure|ember|verdant|ice|ashen|violet] = {base,light,dark,atm,city,land} · CN_NEBULA[blue|red|teal|violet|gold] = [dark,mid,light] · CN_BIOME[dust|crystal|ash|green|ice] = {sky,ground,rock,accent}
          CN_TOD[day|dusk|night|dawn] = {sky,sun,key,tint} · CN_BG_DEF / CN_PROP_DEF vocabulary defaults
```
Look at the placeholders in `64_cine_art.js` for working examples of every pattern (static bake with bleed fill, anim overlay, closed-form particles, expression table, mode handling).

### 5.11 Player and engine behaviour you can rely on (and the audio hooks it calls)

* `cineFrame(id|film, t, canvas?, opts?)` is pure; `opts = {frameOnly, tier, part, rm, bloom, grain, res, seed, noTrans, subs, title, letterbox, portrait, w, h}`. `frameOnly:true` makes the picture fill the whole canvas (what the contact tool uses); otherwise the canvas is treated as the viewport (letterbox bars, portrait window). `cineTimeline(film) -> {scenes:[{s,i,t0,t1,dur}],total}`; `cineLineAt(id,t)`; `cineCoverage()` lists vocabulary ids without a painter; `cineStats()`.
* `cinePlay(id,{onEnd,skippable,muted,from})` -> `{stop,skip,pause,resume,t,done}`; `onEnd` and `done` receive `{id,reason:'done'|'skipped'|'stopped'|'replaced'|'missing',skipped,t,total}`; the match (`G.paused`) is held during the film and restored **before** `onEnd` runs, so `onEnd` may start a mission. `90_main.js frame()` skips all game rendering while `cineActive()`.
* Skip: Skip button (appears on pointer move / tap / any key, fades after 2.5 s, >= 44 px), `Esc`/`Space`/`Enter`, double-tap or 0.75 s press-and-hold on touch, Android Back / history back. All other keys are swallowed while a film plays. `visibilitychange`/`pagehide` pause the clock, the audio context and speech.
* Audio calls, each guarded by `typeof` and `try/catch` (the audio overhaul may be absent): `musicPlay(cue,{fade,section,crossfade,film})` at start and per scene `music`; `cineSfx(name)` per `sfx` entry at its time; `speak(who,text,{style,expr})` per line; `musicDuck(0.45, ms)` per line (amount = gain multiplier held for `ms`, then released by the audio engine); at the end `speakStop()`, `musicStop(0.8)` and, if the audio engine defines them, `musicState()` before / `musicRestore(state)` after to bring back the in-game music. `cineExport` additionally uses `audioCaptureStream()` (a `MediaStream` of the master bus) when defined.
* Reduced motion = `SET.rm` or `prefers-reduced-motion`: no camera shake, no flashes / wipes / glitches (all become fades), camera moves become a slow cross-fade between the first and the last pose, radio crackle off.

### 5.12 How to work (the feedback loop)

```
OD_DIST=<scratch>/dist python3 build.py standalone                       # never a bare build.py: it overwrites the shared dist/
export OD_URL=file://<scratch>/dist/orbital_dominion_v3.html
python3 tools/cine_contact.py --cine showcase_bg_planet --per-scene --out <scratch>/planet.png     # then LOOK at the PNG (Read tool), criticise, fix, repeat
python3 tools/cine_contact.py --cine 'showcase_expr_*' --times 0.9 --cols 4 --size 480x201           # every expression of every character
python3 tools/cine_contact.py --cine showcase_props --per-scene --cols 3 ; --cine 'showcase_fx_*' --times 1.2 ; --cine showcase_modes --per-scene
python3 tools/cine_contact.py --cine showcase_cam --viewport 844x390 --subs                          # the player's own layout on a phone
python3 tools/cine_contact.py ... --no-trans --tier battery --rm                                       # without transitions (a frame at a scene start is otherwise black), other quality tier, reduced motion
python3 tests/e2e/e2e_cine.py                                                                          # the gate: painters render non-uniform pixels, mutation controls, purity, player
```
Showcase film ids (`tests/fixtures/cine_showcase.js`, merged automatically by the tool): `showcase_bg_<kind>` (every background kind with 4-8 parameter variants, one per scene), `showcase_props` (every ship class x faction, every unit and building type, planets, moon, station, beacon, crystal, array, banners, holo shapes, crowds), `showcase_props_moving`, `showcase_fx_<kind>` (two scenes each: default and variant), `showcase_expr_<char>` (12 expressions, one per scene, 13 characters), `showcase_modes`, `showcase_trans`, `showcase_cam`, `showcase_title`, `showcase_subs`, `showcase_all` (one scene of everything), `showcase_mini` (2 s, export test). `--stats` / the end of every run lists which painters are still placeholders.
