# Optional offline voice-pack pipeline (ElevenLabs or any other recordings)

The game ships with a synthesized speech engine (`src/js/84_voice.js`) and needs nothing else. This folder lets **you** replace the synthesized voices of story characters with
recordings, **offline and optionally**. Nothing in the game, in the build or in the test-suite calls ElevenLabs; there is no key in the repository; the generated audio is
never committed (`voicepack_work/` and `voicepack/` are git-ignored; `pack.py` refuses to write into `src/ dist/ docs/ tests/ tools/`).

## Licence situation (read before you spend a credit)
* The ElevenLabs **free plan has no commercial licence** (as of the research behind this tool: ~10,000 credits/month, about one credit per character, roughly ten minutes of
  speech; attribution may be required; API access on the free plan has been reported as restricted or revoked for abusive traffic). **Audio made on the free plan must not
  be shipped in a Google Play / App Store release.** It is fine for private play-testing.
* A paid plan may include commercial use; whether it covers a game, which voices (library voices have their own terms) and what attribution is required is decided by the
  *current* terms. **Verify them yourself.** This tool does not and cannot grant or check any licence; `pack.py --plan-licence free|paid|own|unknown` only records what you
  declare in `manifest.json` and in the generated `README.md`.
* The Overseer is a rule-based system in the story; its flat synthesized voice is the design, so its lines are skipped unless `--include-synth-only`.

## Steps (all offline except step 2)
```
node   tools/voicepack/extract_lines.js                 # -> lines.json, voices.json, plan.json   (prints characters, credits, months)
# create the voices in your own account from voices.json (description text per character), write their ids to tools/voicepack/voice_ids.json:  {"idris":"<voice_id>", ...}
python3 tools/voicepack/render_elevenlabs.py --dry-run                      # offline: what would be sent
ELEVENLABS_API_KEY=... python3 tools/voicepack/render_elevenlabs.py --month 1   # your key, from the environment only
python3 tools/voicepack/pack.py --raw voicepack_work/raw --out voicepack_work/voicepack --plan-licence free --zip
```
Measured on the current story: 474 unique lines, 440 recordable, 19,182 characters = about 2 months of the free quota (priority order: hero/villain/narrator story beats,
hero radio, other radio, other film lines, barks). `plan.json` lists the lines per month; `render_elevenlabs.py --month N` sends exactly those.
`render_elevenlabs.py` caches by `sha256(voice, model, text, settings, format)`, so it can be stopped and resumed, only changed lines are re-rendered, and `--budget` refuses to send more
characters than you allow. It rate-limits (`--min-interval`), honours `Retry-After`, stops cleanly on 401/403/quota, sends the key only to `api.elevenlabs.io`, and never prints or stores it.

## Using the pack in the game
Settings > Sound lab > **Voice pack**: "Load voice pack..." and select `manifest.json` together with the `audio/*` files (or the `voicepack.zip`). The game verifies the SHA-256 of every
file against the manifest and ignores any file that does not match; lines that are in the pack play the recording on the voice bus (the music ducks, the subtitle path is
unchanged); every other line keeps the synthesized voice. A pack served next to the page can be loaded with `?voicepack=voicepack/` (relative, same origin only); without that
parameter, and without a loaded pack, the game makes no request at all. See `docs/AUDIO_V4.md`.
