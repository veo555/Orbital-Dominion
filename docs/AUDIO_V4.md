# Audio v4.0 (track T6): measured mix, spatial polish, music levels, optional voice pack

> **v5 note (speech removed).** v5 has no spoken audio of any kind: `84_voice.js` (speech synthesis, character voices, barks, the announcer `say()`), the Voice slider and
> toggle in Settings, the voice bus and the optional ElevenLabs voice-pack pipeline (`tools/voicepack`, its loader, its tests) were deleted. The campaign radio strip and the
> dispatch cards are silent text (the toast area is an `aria-live` region for screen readers). Music, stingers and all sound effects are unchanged; the music bus still
> ducks under alert-class sounds. Old saved settings with `voice` / `voiceVol` keys load without error (unknown keys are ignored). Sections 4 and 7 below describe v4 history.

**Honesty rule.** Nobody has listened to any of this: not the author (an AI), not a human reviewer. Every claim below is a *measurement* made with the headless offline
renderer (`audioRender` / `audioMixdown`, 44.1 kHz, deterministic) and a BS.1770-4 loudness meter that is itself verified (below). Whether it sounds good, on a phone speaker, is untested.

## 1. Measurement tooling (new)
| file | what |
|---|---|
| `tests/audio/bs1770.js` | ITU-R BS.1770-4 K-weighting, gated integrated loudness (LUFS-I), momentary/short-term, LRA, 4x-oversampled true peak. Works in Node and in the page. |
| `tests/audio/bs1770_test.js` | proves the meter: analytic answers (997 Hz -20 dBFS stereo = -20.00 LUFS, one channel = -23.01, EBU 3341 case 1 = -23.00), gating cases, true peak of an fs/4 sine, **agreement with ffmpeg `ebur128`** (-21.18 vs -21.2 LUFS, -13.86 vs -13.8 dBTP), and three mutation controls (no K-weighting / no gating / no oversampling must each fail a known answer). |
| `tests/audio/mix_page.js`, `tests/e2e/e2e_audio_mix.py` | renders every voice by class, cues, four mix scenarios through the **shipped master chain**, the duck envelope, the reverb rooms, distance and variation; `--report out.json` writes every number. |
| `audioMixdown(tracks, seconds, sr, {chain, ducks, vol})` (80_audio.js) | offline mix of pre-rendered tracks through the same bus gains, the same ducking functions and the same `masterChain()` the live graph uses (`chain:'v3'` = old chain, kept only to reproduce the "before" numbers). |

Scenarios (all use real engine voices, seeded RNG): **calm** (music at intensity 0.25 + 5 clicks), **battle** (music 0.9, 14 shots/s, impacts, a boom every ~1.2 s), **burst500**
(500 sfx calls inside 3 s on top of battle music; the live engine would merge/cap most of them, here every one sounds: a worst case), **voiceOver** (a radio line in a 10 shots/s fight).

## 2. Master chain, loudness, ducking (80_audio.js)
Before (v3): one DynamicsCompressor (-12 dB, 3.5:1) -> soft clip (ceiling 0.97). The browser's compressor adds automatic make-up gain, so it *raised* quiet material by +3.1 dB while peaks still reached the ceiling.
After (v4): glue compressor (-18 dB, 2.6:1, 10 ms / 220 ms) -> trim (-4.2 dB, cancels the automatic make-up so the chain is +2.0 dB at low level) -> limiter (-4 dB, 20:1, 1 ms attack, the browser's ~6 ms look-ahead) -> soft clip with a -1.2 dBFS asymptote.
Static transfer (1 kHz sine, dB gain by input level -50..0 dBFS): v3 +3.1 +3.1 +3.1 +3.1 +3.1 +1.7 +0.1 -2.0; v4 +2.0 +2.0 +2.0 +2.0 +1.3 -0.9 -2.6 -4.4.

| scenario | v3 chain, original content (first measurement) | v4 chain, final content |
|---|---|---|
| calm: LUFS-I / true peak | -20.4 LUFS / -5.9 dBTP | **-24.1** / -7.8 dBTP |
| battle | -12.9 LUFS / **-0.70 dBTP** | **-15.1** / -2.2 dBTP |
| burst500 | -11.0 LUFS (short-term max -6.3) / **-0.59 dBTP** | **-13.7** (short-term max -8.8) / -1.9 dBTP |
| voiceOver | -13.6 LUFS / -1.15 dBTP | -15.8 / -3.1 dBTP |
No sample >= 0.999 in any scenario in either chain; the gate is true peak <= -1.0 dBTP on all four, and the v3 chain **fails** it on burst500 (mutation control, rule 15).
The "v3 chain on today's content" numbers (calm -23.0, battle -13.0 / -0.70 dBTP, burst -10.4 / -0.58 dBTP) isolate the chain: it is the chain, not the trimmed music, that buys ~2 dB of true-peak headroom and ~2 LU less loudness in a dense fight.

**Speech over a fight.** Voice lines now duck the music by 0.7 (-10.4 dB measured) and the battle buses (`sfx`, `amb`) by 0.4 (alerts and UI are never ducked) through one function (`audioDuckVoice`, used by `speak()` and the announcer),
and the voice bus has a +5 dB mix trim (`VBOOST` 1.8 x the slider). Measured: speech -14.3 LUFS-I sits **+4.0 LU over a 10 shots/s fight background** (gate >= 3) and +18 LU over the ducked music alone (gate >= 9).
Before this change the line sat at -0.4..+1 LU over the fight. Ducking envelope (one shared implementation for live and offline): attack 40 ms, hold, 900 ms linear release; measured x0.52 during a 0.5 duck, x1.00 after, x0.77 half-way through the release.

Raw voices (unchanged content, per loudness class, mean active level vs target; true-peak max): alert -17.2/-17 (TP -0.4); amb -30.0/-30; boom -15.0/-14 (TP -0.4); cine -18.2/-18 (TP +0.1); fire -22.0/-22 (TP -2.7); impact -18.2/-18 (TP +0.6);
ui -26.0/-26 (TP -2.4). Spectral centroid (Hz): fire 1529, impact 1211, ui 1099, boom 804, alert 815, cine 1248; sub (<120 Hz) share of boom: -3 dB re total (the explosions already carry a sub thump layer, so they were not rebuilt).
Tail (time to -50 dB): fire median 0.14 s, ui 0.31, impact 0.32, boom 1.06, alert 1.32, longest cine.siren 3.5 s. Raw true peaks above 0 dBTP (inter-sample): turret.done.aurora +0.61, impact max +0.6, cine.glitch +0.15 - the master chain absorbs them.

## 3. Spatial (80_audio.js)
A positioned voice now also gets (besides pan and volume) a low-pass that falls exponentially from 16 kHz to 2.2 kHz with distance and a reverb send from -26 dB to -9 dB re dry (`SPAT`). Layers that carry their own `pan` (the stereo-wide faction voices) are routed through the same filter (found by measurement: `skiff.fire.aurora` ignored distance until fixed).
Measured near -> far: rifleman.fire.meridian centroid 1750 -> 1579 Hz, tail (time to -50 dB) 0.07 -> 0.47 s; skiff.fire.aurora 3039 -> 2609 Hz; hero_lyra.fire.aurora 3425 -> 2744 Hz.
Reverb rooms: `plate/hall/air` (content) plus the room presets `open` (default for the distance send, RT60 0.64 s, 20 ms pre-delay), `canyon` (1.50 s, 60 ms slap), `cave` (2.22 s); their return gains are calibrated so send 1.0 returns wet = dry within 0.03 dB (gate). `audioRoom(name)` selects the distance-send room.
**Not done:** a Schroeder/FDN reverb (the convolver with a synthesized IR stays); nothing in the game calls `audioRoom()` per mission yet (there is no biome concept in the gameplay code; only the cinematics had one).

## 4. Variation
A low-discrepancy (golden-ratio) pitch/filter sequence was implemented and **reverted**: the per-voice `TRIM` gains of the content voices were fitted against the existing seeded draws, and the new sequence pushed 5-6 headroom-limited voices over 0.98 on some seeds (`units_gate.py`: 0 failures before, 6 after). What exists is now measured: over 30 consecutive instances of `rifleman.fire.meridian` and `hero_lyra.hit.aurora` the centroid spread is 8.7 % / 9.2 % and at most 10 % of neighbouring pairs are within 0.4 % (gate <= 15 %; a control of identical instances fails it).

## 5. Music
18 programme cues measured -13.9 (hope) .. -20.8 (villain) LUFS-I, a 6.9 LU spread (BS.1770, 12 s, intensity 0.75): every scene change was a volume change. `83_music_trim.js` multiplies each cue's `gain` so they sit at **-17.5 LUFS-I** (after: all 18 within 0.1 LU of it; this is a fit to the same measurement, so the equality is by construction - the independent checks are the unchanged tempo/key/seam/dead-air gates of `e2e_audio.py`).
Stings are untouched (-14.4..-17.7). No programme cue has dead air > 1.5 s, |DC| < 0.002, raw true peak <= -2.3 dBTP.
Adaptivity, measured as LUFS-I at intensity 0.1 / 0.5 / 0.9: theme_obsidian -24.6 / -18.0 / -17.6 (already layered by level); theme_meridian was -18.0 / -18.2 / -17.8 and theme_aurora -16.9 / -16.3 / -18.0 (texture changes, level does not follow combat). New cue field `intGain:[at 0, at 1]` (82_music.js) lifts the stems with intensity; after: meridian -20.4 / -19.3 / -17.8, aurora -20.3 / -17.1 / -16.8 (gate: monotonic and >= 1.5 LU span).
Night darkens the themes (centroid at night: meridian 280 Hz, obsidian 108, aurora 201 vs 299 / 117 / 240 by day). Transitions: the director crossfades with `at:'bar'` (already beat-aligned); a key/tempo-continuity audit of all cue pairs was **not** done.
Not addressed: spectral holes / harsh 2-5 kHz: the 2-5 kHz energy share of the music is -17..-38 dB (no resonance found); among SFX the aurora/wild voices concentrate energy at 2-5 kHz (`hero_lyra.hit/fire.aurora`, `skiff.fire.aurora`, `global.coin`, `specter.melee.aurora`, `crawler.*.wild`: 2-5 kHz share -0.4..-1 dB, centroid 3-4 kHz). They are "glassy" by design; they were measured and listed, not changed.

## 6. Synthesized speech
Only mix-level work: the ducking and voice-bus trim above, a recorded-line path (below). `84_voice.js` already prefers `speechSynthesis` voices with per-character pitch/rate and always renders the blip stream; the text of a radio line is shown by the UI (`76_campaign_ui.js`) independent of audio, so subtitles are always on. `tests/audio/voice_gate.py --quick` has 18 failing checks both on the code before this track and after it (style/prosody/sweep measurements and live-timing checks; identical lists, diffed): they were **not** triaged further.

## 8. Gate triage (first run of `tests/audio/*`)
* `selftest.js`, `bs1770_test.js`, `units_gate.py` (279 voices), `e2e_audio.py` voices: pass. `world_gate.py`: **fails, pre-existing**: building `die.aurora` voices of foundry/garrison/hub are not distinct enough (z 0.54 < tau) and `exchange.done.obsidian` peaks at 0.999 (a hand-built layer the TRIM does not scale); six other raw peaks over 0.98 were fixed with their TRIM entries.
* `e2e_audio.py`: one **stale control** fixed (the "duplicated voice" pair differed by 1.0-1.14 z through id-seeded variation and a noise start offset; the corpus was "the first 20 fallback voices", a set that shrank); `e2e_audio_engine.py`: the voice-bus expectation now includes the x1.8 trim.
* Intermittent in baseline and not reproduced on a quiet machine: the engine test's "orphaned nodes never retired" mutation (needs an idle CPU).
