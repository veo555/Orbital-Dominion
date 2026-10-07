# Audio — engine, sound design matrix, music, voices and the objective test gates

Owners (WF2): `80_audio.js` (engine + synth kit + SFX dispatcher), `81_sfx_lib.js` (voice specs), `82_music.js` (sequencer, adaptive mixer), `83_music_data.js` (themes, cues, leitmotifs),
`84_voice.js` (speech: TTS profiles + synthesized blip voices), `85_sound_lab.js` (audition UI). Vocabulary: `src/js/43_vocab.js`. No audio files, no network: everything is synthesized with WebAudio.

**Honesty rule.** A sound cannot be judged by ear in this environment. Quality is therefore defined by *measurable* properties (§6: level, spectrum, envelope, distinctness, tempo, key, loop continuity, determinism)
plus a human-audition surface (the Sound Lab, §7). Docs and the final report must say that subjective taste is untested.

## 1. Engine architecture
* One `BaseAudioContext` abstraction: all voice/music code takes a context handle `A` (`{ctx,dest,rng,t0}`), so the same code plays live (`AudioContext`) and renders offline (`OfflineAudioContext`) for tests.
* Bus graph: `voices → (pan) → bus{sfx|ui|voice|amb|cine|music} → master(duck/limiter: DynamicsCompressor + soft clip WaveShaper) → destination`. Sends: one shared **reverb** (synthesized impulse response, 2 s, filtered noise decay) and one **tempo-able delay**.
* Polyphony governance: per-name cooldowns (existing `SFXGAP` idea, generalised), a global cap (live ≤ 40 simultaneous source nodes for SFX, ≤ 24 for music), priority classes (alerts/voice > hero > boom > fire > ui), distance attenuation + equal-power pan from camera-relative position, “unit-spam” compression (N simultaneous identical shots → one voice with louder gain + slight detune, not N voices).
* Seeded randomness: each voice instance takes a deterministic `rng` (mulberry32 from `(voiceId, instance counter)`); offline renders are bit-reproducible. **Never `Date.now`/`Math.random` inside a voice builder.**
* Mobile: lazy context creation on first gesture, `resume()` on every gesture until `running`, `suspend()` when hidden (`75_platform.js` already pauses the match), no per-frame allocations in the scheduler, noise/IR buffers are created once.
* Test hook: `AUD.log` ring buffer (last 200 events `{t,name,voice,who,faction,x,y}`) and `audioStats()`; exposed on `window.__RTS.AUD` under `__TEST`.

## 2. Public API (kept names stay valid)
```
audioInit()  applyVolumes()  toggleMute()  say(txt)
sfx(name,x,y,who)                 // name ∈ SFX_GLOBAL ∪ unit events ∪ 'skill:<id>' ∪ building events; who = entity | {type,faction,team}
sfxUnit(type,ev,x,y,faction)      // direct: ev ∈ SFX_UNIT_EVENTS
sfxBuilding(type,ev,x,y,faction)  // ev ∈ SFX_BUILDING_EVENTS
cineSfx(name)                     // CINE_SFX, non-positional
speak(charId,text,{style,onEnd})  // 84_voice; returns {dur}
speakStop()
musicPlay(cue,opts)  musicStop(fade)  musicScene({faction,era,intensity,night,mood})  musicStinger(cue)  musicDuck(amount,ms)  musicMood(m)
audioRender(spec,seconds,sampleRate) -> Promise<{sampleRate,channels:[Float32Array]}>   // offline; spec = {sfx:'rifleman.fire.obsidian'} | {cue:'intro',section?} | {motif:'idris'}
audioVoices() -> [ids]            // every registered SFX voice id (for tests / Sound Lab)
```
Voice id grammar: `<unitType>.<event>.<faction>` (e.g. `rifleman.fire.obsidian`), `<buildingType>.<event>.<faction>`, `skill.<id>`, `ui.<name>`, `global.<name>`, `cine.<name>`.

## 3. SFX sound-design matrix (what must exist; see the identity rules)
Every unit type in `UNIT_TYPES` × events `SFX_UNIT_EVENTS` (where meaningful) × `SFX_FACTIONS` timbre. Each combination resolves to a **distinct voice** (a base archetype per unit × a faction timbre transform).

**Faction timbre (the “team sound”)** — applied to every voice of that faction’s units and buildings, so you can tell whose army is firing with eyes closed:
| Faction | Palette | Character |
|---|---|---|
| Meridian Corps | clean sines/triangles + filtered saws, even harmonics, short plate reverb, tuned (D-based) pitches | disciplined, brass-and-servo, “engineered”, precise attack |
| Obsidian Collective | detuned saws/squares, noise bursts, waveshaper drive, ring-mod grit, lower pitch, longer decay, sub thumps | aggressive, crude, tribal, “smashing metal” |
| Aurora Syndicate | FM bells, glassy high partials, shimmering chorus, pentatonic pitch sets (F♯-based), long airy reverb, stereo width | ethereal, precise-yet-liquid, “crystalline” |
| wild (creeps) | formant (vowel) filters, band-passed noise, irregular timing | organic: clicks, hisses, gurgles, roars |

**Unit identities** (archetype — then colour by faction): `hauler` (worker!) servo chirps, pneumatic hiss, cargo clunk; `select` = friendly two-note chirp; `mine`/`deliver` ticks — the *workers have their own soundscape*;
`rifleman` pulse-rifle; `raptor` dash-whoosh + claw slash, vocal snarl; `rocketeer` launcher thoomp + hiss flight + radio “roger” blips; `mender` harp-like heal pluck + shimmer; `howitzer` deep cannon + distant whistle, siege-mode latch;
`juggernaut` heavy servo step + bolt cannon + heavy collapse; `skiff` jet whine with pitch glide + zap; `titan` colossal cannon, rumble, horn; `freighter` engine drone + horn; `bulwark` shield hum + resonant bolt;
`reaver` berserker snarl + blade slash + lifesteal slurp; `specter` phase shimmer + whisper bolt + cloak/decloak; `crawler` skitter clicks; `spitter` acid gurgle spit; `brute` deep roar + stomp;
`hero_idris` commanding brass-tone select/ack + rifle; `hero_kaz` war-horn + heavy hit; `hero_lyra` choir/bell + glass bolt.
**Events:** `select` (unit voice cue, ≤ 0.6 s), `ack` (command acknowledged: shorter variant, alternates 2 takes), `fire`, `melee`, `die` (organic vs mechanical vs hero), `ready` (trained), `hit` (impact on this unit type’s armour class).
**Buildings:** `place` (construction start), `done` (completion jingle in the faction’s key), `die` (collapse), `fire` (hub/turret); hub and generator have an ambient low hum that is audible only when the camera is near (≤ 1 voice).
**Hero skills** `skill.<id>`: barrage (incoming whistles + salvo), orbital (charging rising tone → beam crack → boom), shock (ground slam + shockwave sub), rampage (war roar + drums burst), veil (airy phase sweep), sing (gravity well: low swirl + rising shimmer), banner/bloodlust/regen (aura pulses).
**Global/UI:** click, err, tab, cancel, toast, coin, train, research, supply, alert (unit), alertBase (klaxon), level, era (faction fanfare), win, lose (faction-specific stingers), siege, cloak, heal, stim.
Loudness classes (RMS target at unit gain, §6): `ui` −26 dBFS, `fire` −22, `impact` −18, `boom` −14 (with transient), `voice` −20, `alert` −17, `cine` −18, `music` −20 (programme).

## 4. Music
* **Sequencer:** lookahead scheduler (100 ms timer, 0.6 s window) driven by `AudioContext.currentTime`; tempo from the cue; sample-accurate section starts; `musicScene()` crossfades **stems** (pad / bass / pulse-arp / lead / drums / perc / choir-pad) by `intensity` (0..1), `night` (0..1: darker voicing, lower register, slower filter), `era` (I sparse → III full orchestration, +tempo).
* **Themes (distinct identities):**
  * `theme_meridian` — D Dorian/major, 92–100 BPM, march feel: snare rudiments, timpani-like toms, brass-like filtered saw chords, “fortress” rising fourths/fifths motif, steady 4/4.
  * `theme_obsidian` — E Phrygian, 120–132 BPM, driving taiko/low toms, distorted sub-bass ostinato, metallic stabs, chant-like formant pad, syncopated 4/4, minor second tension.
  * `theme_aurora` — F♯ Lydian/pentatonic, 80–88 BPM, shuffle/swing hats, FM bell arpeggios, airy pad + sub, wide stereo, odd-bar phrasing (7/8 bridge or 5-bar phrases).
* **Campaign cues** (all ids in `MUSIC_CUES`): `title`, `intro` (78 s, **sectioned**: A quiet planet-rise → B colony theme → C villain reveal → D war → E title hit), `hope`, `mystery`, `tension`, `dread`, `villain`, `march`, `battle`, `tragedy`, `betrayal`, `reunion`, `dawn`, `finale` (90 s, resolves all leitmotifs), `credits`, and the stings.
* **Leitmotifs** (`MOTIFS`): `idris` (noble rising 4th→5th, brass), `kaz` (low tritone-flavoured stomp, taiko + horn; later a major-mode variant after his turn), `lyra` (pentatonic bell/choir, floating), `villain` (descending chromatic cluster over a pedal, detuned low saws + sub), `worker` (small cheerful 4-note figure on pluck/marimba-like FM), `colony` (warm pad hymn), `array` (huge slow 3-note tolling), `hope` (resolution of `colony`). A motif is a function `(key,mode,voice)->notes` so cues can restate it in any key/instrument; the finale states all of them.
* **Cue data format** (83_music_data.js): `{id,tempo,beats:4,key:'D',mode:'dorian',loop,len,sections:[{name,bars,chords:[…],stems:{pad:'…',bass:'…',arp:'…',lead:'…',drums:'…'},motif?,mix:{…}}]}` with patterns as compact strings (`'x..x..x.'`, scale-degree arrays) — readable and diffable.
* Music stays under speech: `musicDuck()`; stings play over (never stop) the running cue.

## 5. Voices (84_voice.js)
`speak(charId,text,{style})`: (1) if `SET.voice` and `speechSynthesis` has voices — pick a voice by character profile (`ttsPitch/ttsRate`, preferred language/gender hints from the character’s `voice`), apply style (`radio` narrower band via a short filter-less rate/pitch tweak, `whisper` lower volume, `shout` higher); (2) always render a **synthesized speech-like blip stream** (one blip per syllable of the text, pitch contour from punctuation, timbre/formant from `voice`, duration from the cadence) on the `voice` bus — audible even when TTS is absent — so each character *sounds* distinct with zero downloads; (3) return an estimated duration so cinematics can pace lines. The announcer (`say`) keeps its existing behaviour and rate limits. Unit/hero **barks** (`STORY.barks`) are spoken the same way, at low volume.

## 6. Objective gates (tests/e2e/e2e_audio.py + tests/audio/*.js — all offline renders in Chromium)
For **every** voice id in `audioVoices()` (rendered at 44.1 kHz, ≤ 6 s):
1. finite samples (no NaN/Inf), peak ≤ 0.98 (−0.2 dBFS), not silent (RMS ≥ −60 dBFS over its active window), |DC| < 0.01, first-sample |x| < 0.05 and last 20 ms < −60 dBFS (no clicks), duration within the voice’s declared bound.
2. loudness inside its class window (±4 dB of the class target), computed as active-window RMS.
3. **deterministic**: two renders with the same seed have an identical FNV-1a hash over the quantised samples.
4. **distinct**: feature vector = [log-spectrum in 20 Bark-like bands, spectral centroid, flatness, attack time (10→90 %), decay time (−20 dB), zero-cross rate, pitch-contour slope]; z-normalised across the corpus; pairwise Euclidean distance ≥ τ for (a) every pair of unit types in the same event class, (b) the three faction variants of the same unit/event, (c) the nine skills. τ is calibrated so that deliberately cloned voices (control pair) FAIL it — the test asserts the control fails.
For **every** music cue (render the first min(len, 24) s; full-length for the intro/finale in a longer, optional job):
5. non-silent, peak ≤ 0.98, no NaN, programme loudness window −26…−14 dBFS RMS, crest factor in range, **no dead air** longer than 1.5 s for looping cues.
6. **tempo** (onset-envelope autocorrelation) within ±3 % of the declared tempo (or a clean 2×/½×), **key** (chroma vs Krumhansl–Kessler profiles) equals the declared key for ≥ 80 % of cues (the rest must be declared modal/atonal), faction themes are mutually distinct on chroma + centroid + onset density.
7. loop seam: for `loop:true` cues render 2 loops and compare the last 0.25 s energy envelope vs the first 0.25 s of the second pass — step < 6 dB, no click.
8. determinism as in 3.
**Controls:** every metric test has a *mutation control* (silence, clipped square, white noise, duplicated voice) that must be rejected.

## 7. Sound Lab (85_sound_lab.js)
Settings → “Sound lab” opens a panel listing every SFX voice (grouped Units / Buildings / Heroes / UI / Cinematic) with ▶ buttons and a faction switch, and every music cue/section with play/stop and a live intensity slider; character voices can read a sample line. It also shows live meters (peak/RMS from an AnalyserNode). Touch-friendly (44 px targets), keyboard accessible, zero network.

## 8. Engine reference (voice DSL, registry, kit)
Everything below is implemented in `src/js/80_audio.js` and verified by `tests/e2e/e2e_audio_engine.py` (the numbers quoted are measurements from that test). Content modules (`81_sfx_lib.js`, `82_music.js`, `83_music_data.js`, `84_voice.js`, `85_sound_lab.js`) only **register** things and call the functions listed here; all engine internals are private to a closure, so nothing here can collide with another module's names.

### 8.1 Globals a content module may use
`registerVoice(id,def[,meta])` `registerRenderer(kind,fn)` `audioVoices(opt)` `audioRender(spec,seconds,sr)` `audioOffline(seconds,sr,build[,opt])` `audioA(bus)` `audioBus(bus)` `audioDuck(bus,amount,ms)` `audioDelay(bus,time,fb)` `audioOnReady(fn)` `audioPlay(idOrDef,opt)` `audioStats()` `audioMeter()` `audioAnalyse(channels,sr)` `audioHash(channels[,exact])` `audioClasses()` `audioLegacyScore(on)` `KIT` `AUD` `AC` (live `AudioContext`, `null` until the first gesture) and the public API of §2. The old helpers `tone()` / `noiseBurst()` / `busSfx` / `busMusic` / `musicFx` still exist. Test hook: `window.__RTS.AUD` (§8.9).

### 8.2 Voice definition (declarative DSL)
```js
registerVoice('rifleman.fire.obsidian',{
  dur:0.22, cls:'fire',            // dur: nominal length in s (REQUIRED); cls: ui|fire|impact|boom|voice|alert|cine|music|amb (default fire)
  gain:1,                          // voice gain (linear), multiplies every layer; tune it until audioAnalyse hits the class target (§8.6)
  gap:45, poly:5,                  // cooldown ms per voice id / max simultaneous instances (defaults from the class, §8.5)
  prio:'hero', range:1.5,          // optional: priority class name or 0..7; audibility radius multiplier (boom class defaults to 1.5)
  duck:0.35,                       // optional: duck the music bus by this fraction while the voice plays (alert .35, voice .45, others 0)
  vary:{pitch:0.05,filter:0.12,gain:0.08},   // seeded per-instance variation (+-fraction). Defaults per class; use vary:{} for exact pitch (measurements!)
  variants:3, seq:false,           // p.variant in [0,variants): chosen with the seeded rng, or cycled 0,1,2,0.. when seq:true (alternating `ack` takes)
  tail:2.5,                        // optional: seconds of tail after dur (default: computed from reverb/delay sends); used by audioRender
  layers:[ {k:'osc',...}, {k:'noise',...}, ... ]
});
```
`registerVoice` throws on an unknown class, a missing `dur`/`layers` or an unknown layer kind; re-registering an id replaces it (and invalidates the resolution caches). Returns the id.

**Common layer fields** (all optional): `delay` s from voice start (0) · `dur` s (default `voice.dur - delay`) · `gain` linear peak amplitude (1) or `db` · `env:{a,d,s,r}` · `pitch` · `filter` · `drive` · `rm` · `trem` · `vib` · `send` · `pan` · `only:[variants]` / `skip:[variants]`.
* `env` — attack `a` (>= 2 ms is enforced, linear from 0), decay `d` (exponential to the sustain level), sustain `s` as a fraction of peak (**0 = percussive**: decays to -80 dB, layer ends at `a+d`), release `r` (only when `s>0`; sustain holds until `dur - r`). Default `{a:.002, d:dur-a, s:0}` = a clean exponential decay over the layer. The graph always ends in exact silence (no clicks; asserted).
* `pitch` (osc/fm/formant/pluck-ks) — `{from,to,t,curve:'exp'|'lin',hold}` Hz glide (`t` default = layer length; `hold` keeps `from` first), or `{st:-12}` semitones relative to `f`, or `{pts:[[t,hz],...]}` piecewise. Measured: glide 1000 -> 250 Hz follows the exponential curve within 0.1 %.
* `filter` — `{type:'lp'|'hp'|'bp'|'notch'|'peak'|'ls'|'hs'|'ap', f0, f1, t, q, g, curve}` or an array (chained). `f0->f1` is an exponential sweep over `t` s (default layer length). **`q` is always linear Q** (0.707 = flat); the engine converts to dB for lp/hp. `g` = dB for peak/shelf. Cutoffs are multiplied by `p.fmul` (variation).
* `drive` 0..1 — tanh waveshaper before the envelope (odd harmonics; 0.8 gives H3 only -10 dB under H1). `rm:{f,depth:1,type}` — ring modulation by a carrier (depth 1 = pure ring-mod: carrier removed, sidebands at `x±f`; <1 = amplitude modulation). `trem:{f,depth}` — tremolo (depth 0.8 modulates 5x). `vib:{f,cents}` — vibrato (osc/formant).
* `send:{rev:0..1, room:'plate'|'hall'|'air', dly:0..1}` — post-envelope sends to the shared reverb / delay of the voice's bus. **Calibrated**: `rev:1` returns wet energy = dry energy for every room (measured +-0.03 dB), so 0.15-0.3 is a normal amount; `dly:1` = -3 dB. Rooms: plate (0.9 s, bright), hall (2.0 s, default), air (3.2 s, dark and diffuse). The delay time is `audioDelay`'s (default 0.3125 s).
* `pan` -1..1 — static pan added to the positional pan of the instance.

**Layer kinds**
| `k` | parameters | notes |
|---|---|---|
| `osc` | `type` sine/square/sawtooth/triangle or `harm:[1,.5,.3]` (custom partials), `f`, `detune` cents, `unison:{n,spread,pan}` | `unison`: n detuned copies (spread = total +-cents, `pan` = stereo spread), level 1/sqrt(n). Pitch measured to 0.01 Hz. |
| `noise` | `color` white/pink/brown, `rate` (playback rate = spectral shift) | all colours are RMS -10.5 dBFS at gain 1 (a sine is -3 dBFS); pink/brown tilt 3/6 dB per octave (measured). Start offset is drawn from the seeded rng. |
| `fm` | `f`, `ratio` (modulator/carrier), `idx` number or `{from,to,t}` (index = peak deviation / modulator frequency), `type`, `mtype` | modulator follows the carrier's `pitch`; ratio 2 / index 2 puts energy only at odd multiples of the carrier (measured). |
| `pluck` | `mode:'ks'` (default; Karplus–Strong string): `f`, `t60` ring time s, `damp` 0..1 loss, `bright` 0..1 excitation; `mode:'modal'` (struck bar/bell): `f`, `n` or `ratios:[..]`, `inh`, `tilt`, `t60`, `damp` | KS is tuned to < 0.1 % (buffers are synthesised once per (N,t60,damp,bright,len) and cached; the first call of a new note costs ~1 ms). Modal partials land on the requested ratios exactly. |
| `formant` | `src` sawtooth/square/triangle/noise, `f`, `vowel` a/e/i/o/u/ae/uh/er or `formants:[[hz,q,gain],..]`, `to`+`morph` (glide to another vowel), `scale` (<1 = bigger creature), `kq`, `vib` | parallel band-pass resonators; vowel `a` vs `i` shift their energy between F1 and F2 by > 20 dB (measured). |

### 8.3 Hand-written voices (escape hatch)
```js
registerVoice('hub.done.meridian',(A,t,p)=>{
  KIT.layer(A,t,{k:'osc',type:'triangle',f:KIT.hz('D4'),env:{d:.4}},p);      // any DSL layer from code
  const o=A.ctx.createOscillator(),g=A.ctx.createGain();                       // or raw nodes
  o.frequency.value=KIT.hz('A4')*p.pitch;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.2*A.vg,t+.003);g.gain.exponentialRampToValueAtTime(.0001,t+.5);
  o.connect(g);g.connect(A.out);KIT.go(A,o,t,t+.52);                           // KIT.go(A,src,start,stop[,offset]) starts, stops and accounts the node
},{dur:.5,cls:'impact',gain:1,variants:1});                                    // meta = the same fields as a DSL voice (dur REQUIRED)
```
* `A = {ctx, dest, out, t0, off, rng, dur, vg, p, bus}`: `ctx` the BaseAudioContext (live or Offline); `dest` the bus input; **`out`** where voices connect (the instance pan node, or the bus); `t0` start time; `off` true when rendering offline; `rng()` seeded float in [0,1); `vg` = voice gain × instance volume — **multiply raw-node gains by `A.vg`** (DSL layers and `KIT.layer` do it for you); `dur` the voice's `dur`.
* `p = {vol,pan,rng,faction,pitch,fmul,variant,seed,t0}`: `vol` instance volume (distance, spam boost, variation), `pan`, `faction` ('meridian'|'obsidian'|'aurora'|'wild'), `pitch` multiplier (multiply every frequency by it), `fmul` filter-cutoff multiplier, `variant` index, `seed` instance counter.
* **Rules.** (1) Use only `p.rng()` / `A.rng()` for randomness — never `Math.random`, `Date`, `performance.now` (the test stubs them to throw during renders). (2) Build everything synchronously; `A`/`p` are reused by the engine, never keep them. (3) Start every source with `KIT.go` (it counts nodes for the polyphony cap and disconnects them when they end). (4) **Read `A.out` / `A.dest` once per node you connect** (`x.connect(A.out)`); do not cache it and connect several nodes to the cached value: offline, each read returns a fresh 1-input leaf so the mix is bit-reproducible (see 8.7). (5) Envelopes: start value before every ramp, attack >= 2 ms, decay to 0.0001, sources stopped.
* `KIT`: `layer(A,t,layer,p)` `osc/noise/fm/pluck/formant(A,t,layer,p)` · `env(param,t,peak,env,len)` · `pitch(param,t,f,pitchSpec,len,mul)` · `filter(A,t,spec,len,p)` · `shaper(A,amount)` · `ring(A,t0,spec,stop,node)` · `wave(A,layer)` (PeriodicWave from `harm`) · `noiseBuf(A,color)` · `rev(A,room)` / `dly(A)` (send inputs) · `send(A,node,{rev,dly,room})` · `go(A,src,t0,t1[,offset])` · `hz('D#4'|midi)` · `notes(freqs,step,layerTemplate)` -> layers (arpeggios/jingles) · `rng(seed)` mulberry32 · `hash(str)` FNV-1a · `vowels`.

### 8.4 Registry and name resolution
* Id grammar: `<unitType>.<event>.<faction>`, `<buildingType>.<event>.<faction>`, `skill.<id>`, `ui.<name>`, `global.<name>`, `cine.<name>`. `audioVoices({prefix,cls,fallback:false,info:true})` lists ids (or `{id,cls,dur,tail,gain,fallback,bus,prio}`).
* `sfx(name,x,y,who)` resolves **exact id** -> **voice derived from `who`** -> **generic**. `who` = an entity (`{type,team,kind}`; faction = `G.teams[team].faction`, team 2 / neutrals = `'wild'`) or `{type,faction}`. Derived id = `<who.type>.<event>.<faction>` where the event comes from `name`: `select ack fire melee die ready hit place done` are themselves; legacy `shoot bolt rocket shell acid` -> `fire`; `boom boomBig` -> `die`; `done` -> `ready` for a unit, `done` for a building. `fire` falls back to `melee` and `melee` to `fire` of the same unit. `'skill:barrage'` -> `skill.barrage`. Generic = `ui.<name>` then `global.<name>`.
* **Generic fallbacks exist for every legacy name, every `SFX_GLOBAL` name and every `CINE_SFX` name** (`global.<name>`, `cine.<name>`, flagged `fallback:true`, ported from the original synth and level-calibrated). They are played with a faction pitch bias (meridian 1, obsidian 0.84, aurora 1.22, wild 0.72) until a content voice exists. **Register a voice with the same id (or `ui.<name>` for a UI sound) and it takes precedence automatically.**
* `sfxUnit(type,ev,x,y,faction)` / `sfxBuilding(type,ev,x,y,faction)` resolve `<type>.<ev>.<faction>` directly (generic fallback by event: select, ack, fire->shoot, melee, die->boom (building: boomBig), ready->done, hit->melee, place, done, building fire->bolt). `cineSfx(name)` plays `cine.<name>` non-positionally on the cine bus.
* **Integration note:** the sim still calls `sfx('shoot',x,y)` etc. without `who`; unit/faction voices are only reached when the call site passes the entity as the 4th argument (`sfx('shoot',src.x,src.y,src)`, `sfx('boom',e.x,e.y,e)`, `sfx('ack',x,y,unit)`, `sfx('done',x,y,building)` ...). That edit belongs to whoever owns the call sites (`20_sim.js`, `30_systems.js`, `70_ui.js`).
* `registerRenderer(kind,fn)`: offline renderer for spec key `kind` (`'cue'` for `{cue:id,section?}`, `'motif'` for `{motif:id}`); `fn(spec,seconds,sr)` returns `{sampleRate,channels}` or a Promise of it (use `audioOffline`). Registering `'cue'` switches the engine's built-in fallback score off (see 8.8).

### 8.5 Playback governance (live)
Order of checks in `sfx()`: no voice -> `nosound`; no context -> `noctx`; muted -> `muted`; demo/menu non-positional -> `skip`; context not running -> `suspended`; position outside the view (+160 px × `range`) -> `culled`; cooldown (`gap` ms per voice id) -> **`merge`**; `poly` instances of this voice alive -> `poly`; node budget -> `cap`; else `play`. Each outcome is counted in `AUD.counters` and logged.
* **Unit-spam compression:** calls merged inside the cooldown are counted; the next voice that does play carries them as gain `×(1+min(.7,.22·log2(1+n)))` and pitch `×(1-.012·min(n,3))` — 40 simultaneous riflemen make one louder, slightly lower shot, not 40 voices (tested: 40 calls -> 1 voice, 39 merged).
* **Cap:** at most `AUD.cap` = 40 live source nodes for sfx/ui/voice/amb/cine, `AUD.capMusic` = 24 for music. A voice is admitted when `nodes + its node count <= cap × limit(priority)`; limits: amb .35, fire .6, impact .7, boom .8, hero .9, **ui .9 (deliberately high: button feedback must survive a big fight)**, cine/voice/alert 1.0. So under load alerts/voices/cinematics/booms still play while fire is refused (tested: fire saturated at 24 nodes, alert and click still admitted). Nodes are counted by `KIT.go` and released on `ended`; layer gains, pans and send gains of a finished instance are disconnected.
* Class defaults: ui gap 30/poly 3 · fire 45/5 · impact 60/4 · boom 90/3, range 1.5 · voice 250/2, duck .45 · alert 400/2, duck .35 · cine 0/6 · amb 1000/1. Priorities (stealing is not implemented): amb 0 < ui 1 < fire 2 < impact 3 < boom 4 < hero 5 < cine 6 < voice/alert 7 (`prio:'hero'`).
* Position: `pan = clamp((x-camX)/(halfView),-1,1)·0.8`, `vol = clamp(1.15 - dist/(1.3·(halfView+160)), .25, 1)` (as the original engine). Hot path cost measured: a merged / culled / who-resolved `sfx()` call = 0.4–0.8 µs.
* Buses: `sfx` `ui` `amb` `cine` follow `SET.sfx`, `voice` follows **`SET.voiceVol`** (default 0.9; slider `#setVoice` in Settings), `music` follows `SET.music`; master = DynamicsCompressor (-12 dB, 3.5:1) -> soft clip (never above 0.97) -> destination. Mute = master gain 0 (nothing is created while muted). `SET.voice` stays the announcer (speech synthesis) switch; the announcer volume is `SET.voiceVol` and it ducks the music.
* Lifecycle: the context is created on the first `pointerdown/mousedown/touchend/keydown/click` (or `audioInit()`), resumed on every gesture until `running`, suspended when the page is hidden and resumed when visible; no voice is queued while it is not running.

### 8.6 Loudness classes and the calibration workflow
Targets are active-window RMS dBFS at unit gain (`audioClasses()`): ui -26, fire -22, impact -18, boom -14, voice -20, alert -17, cine -18, music -20, **amb -30 (added)**. `audioAnalyse(channels,sr)` -> `{finite,peak,rmsDb,activeDb,start,end,dc,first,tailDb,dur}`: active window = 10 ms frames within 40 dB of the loudest one; `activeDb` is the RMS over it (both channels), `first` = max |x[0]|, `tailDb` = RMS of the last 20 ms.
Workflow: `const r=await audioRender({sfx:id,seed:0},0,44100); const a=audioAnalyse(r.channels,r.sampleRate);` then multiply the voice `gain` by `10^((target-a.activeDb)/20)`. Level is linear in `gain`, so one correction lands within ~0.01 dB (that is how the 61 fallback voices were trimmed; they all measure within 0.01 dB of target, peak <= 0.95, |DC| <= 0.003). Mind the **peak**: if `peak > 0.98` at the target RMS the sound is too spiky — flatten the transient (lower the sub/noise burst gain, lengthen the attack to 5–10 ms, use a sustain envelope) instead of lowering the gain. `vary` (pitch/filter/gain) is applied by `audioRender` with the given `seed`; pass `vary:{}` in a `{voice:def}` spec to measure the exact sound.

### 8.7 Offline rendering and determinism
* `audioRender(spec,seconds,sr)` -> `Promise<{sampleRate,channels:[L,R]}>` (stereo `OfflineAudioContext`, default 44.1 kHz). Specs: `{sfx:id|name,type?,faction?,x?,y?,vol?,pan?,pitch?,seed?,master?}` (type/faction act as `who`; `x,y` use the current camera for pan/volume), `{voice:def,meta?}` (any DSL def or builder, not registered), plus whatever renderers are registered (`{cue}`, `{motif}`). `seconds` defaults to `dur + tail`. The raw voice is rendered (no compressor, no class trim); `master:true` adds the soft clip.
* `audioOffline(seconds,sr,build(A,ctx)[,{master}])` is the same primitive for the music module: `build` must create **all** nodes synchronously; use `KIT.layer` / `A.out` / `A.dest` as usual.
* **Renders are bit-reproducible** (tested: 3 renders of 10 voices incl. noise, KS/modal pluck, formant, unison and reverb tails give identical float32 bits). Two browser behaviours had to be engineered around, which is why rules (4) of 8.3 matter: (a) Chromium sums a node's inputs in pointer-hash order and float addition is not associative, so any node with >= 3 inputs differs by 1 ulp between runs — offline, every mix point is a chain of 2-input adders (commutative, hence exact); (b) a reverb tail was cut at a random moment when the JS garbage collector took the unreferenced convolver — the render keeps the graph alive until it completes. `audioHash(channels)` = FNV-1a over 16-bit quantised samples (the §6.3 gate); `audioHash(channels,true)` hashes the raw float32 bits.
* Rendering touches no sim state and no wall clock: `audioRender` reads only `cam/VW/VH` (when `x,y` are given) and `G.teams` (faction), and never calls `Math.random`, `Date.now` or `performance.now`.

### 8.8 Music module hooks
`audioA('music')` -> persistent live handle for the music bus (`A.t0` = `ctx.currentTime`; set `A.dur` or pass `layer.dur`; seed `A.s` yourself or use your own rng) — schedule notes with `KIT.layer(A,time,layer)`; sources count against `AUD.capMusic`; `audioBus('music')` the bus input; `audioDuck('music'|'amb',amount,ms)` (what `musicDuck` should call; overlapping ducks combine); `audioDelay('music',timeSec,feedback)` retunes the music delay send to the tempo; `audioOnReady(fn)` runs `fn(ctx)` once the context exists (immediately if it already does). `registerRenderer('cue',fn)` / `('motif',fn)` for `audioRender`. Until a `'cue'` renderer is registered the engine plays its **fallback generative score** (the original algorithm, now on the music bus with a seeded rng); `audioLegacyScore(false)` switches it off explicitly. Announcer/speech ducking: `say()` ducks the music by 0.4.

### 8.9 Test hooks
`window.__RTS.AUD` (only under `__TEST`): `log` (getter: the last 200 calls `{t,name,voice,who,faction,x,y,pan,vol,r}`, `r` = outcome above), `counters` (`calls played merged poly capped culled muted noctx suspended skipped nosound errors renders says`), `cap`, `capMusic`, `activeNodes`, `activeNodesMusic`, `peakNodes`, `lastError`, `reset(all)` (zero counters + log; `all` also resets cooldowns/instance counters), `ctx` (getter: the live `AudioContext` or null) and the functions `sfx sfxUnit sfxBuilding cineSfx init mute stats registerVoice registerRenderer voices render play duck analyse hash offline classes resolve calcPos meter say tone noiseBurst audioA bus delay onReady legacyScore KIT` (the engine's internals are in a closure, so a test reaches the API through this object). `audioStats()` -> `{state,sampleRate,currentTime,muted,activeNodes,activeNodesMusic,peakNodes,cap,capMusic,masterGain,buses:{sfx,ui,voice,amb,cine,music} (volume),ducks:{...} (current duck gain per bus),voices,renderers,legacyScore,lastError,counters}`. A voice builder that throws is caught (counted in `errors`, `lastError`) and silenced after 3 failures; offline renders reject instead, so tests see the error.

### 8.10 Honest limits
Only structural and measured properties are claimed here: level, spectrum, pitch, determinism, governance, latency. Nobody has listened to any of it. The fallback voices are a faithful port of the original beeps with calibrated levels, not designed sounds; they were checked for distinct hashes, not for taste. Stealing of older voices, per-class mix trims, and HRTF/occlusion are not implemented. Headless Chromium proves the Web Audio graph builds and renders; it does not prove mobile loudness, latency or the iOS/Android lifecycle.
