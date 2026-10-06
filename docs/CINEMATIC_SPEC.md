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
