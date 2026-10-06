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
