/* =========================================================================
   MUSIC LEVEL TRIM (docs/AUDIO_V4.md). The 18 programme cues were written with ad-hoc `gain` values and measured between -13.9 and -20.8 LUFS-I (ITU-R BS.1770, 12 s at intensity 0.75, era 2,
   tests/e2e/e2e_audio_mix.py --cues all): a 7 LU spread, so every scene change was a volume change. This table multiplies each cue's `gain` so the programme sits at -17.5 LUFS-I (+-2 LU gate).
   Stings are left as written (they are meant to stand out over the running cue). Re-fit with:  python3 tests/e2e/e2e_audio_mix.py --no-voices --no-scen --cues all --report r.json  (values are 10^((-17.5 - LUFS)/20) from the UNtrimmed
   measurement; to re-fit after a content change, divide by the current factor first). Pure data, no audio code.
   ========================================================================= */
const MUSIC_LEVEL_TRIM={"theme_meridian": 0.917, "theme_obsidian": 0.832, "theme_aurora": 1.013, "title": 1.126, "intro": 1.33, "hope": 0.663, "mystery": 0.981, "tension": 0.895, "dread": 1.235, "villain": 1.47, "march": 0.856, "battle": 1.017, "tragedy": 1.045, "betrayal": 1.004, "reunion": 0.977, "dawn": 0.928, "finale": 1.081, "credits": 0.991};
for(const id in MUSIC_LEVEL_TRIM){const d=MUSIC_DATA[id];if(d)d.gain=(d.gain===undefined?1:d.gain)*MUSIC_LEVEL_TRIM[id];}
/* INTENSITY LIFT: measured at intensity 0.1 / 0.5 / 0.9 the Meridian and Aurora themes were -18.0/-18.2/-17.8 and -16.9/-16.3/-18.0 LUFS-I (the arrangement changes texture, not level); a combat layer should also be
   louder than the calm layer. intGain = stem multiplier at intensity 0 and 1 (linear in between); 0.75 stays at about unity so the -17.5 trim above still holds there. */
const MUSIC_INT_GAIN={theme_meridian:[0.72,1.04],theme_aurora:[0.62,1.2]};
for(const id in MUSIC_INT_GAIN){const d=MUSIC_DATA[id];if(d)d.intGain=MUSIC_INT_GAIN[id];}
