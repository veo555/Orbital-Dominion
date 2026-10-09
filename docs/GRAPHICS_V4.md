# Graphics v4.0 (track T3)

Rendering only. No simulation module was touched; everything is procedural canvas code in the single file, no external assets, no network.
Files: `54_light.js` (new), `60_render.js`, `62_quality.js`, `50_art.js`/`51_art_b.js` (one `spritePolish` call each), `52_terrain.js`.

## Weaknesses found (before, `docs/img/v4/before-*.png`)
1. Night was a brown/orange `destination-out` fog: muddy, no colour, lights were holes not light.
2. Shadows were offset dark rectangles/ellipses, identical at all times of day.
3. Terrain read as tiled: regular 2x2-tile plate seams on every plateau, no large-scale colour variation.
4. Fog edge followed the tile grid (blocky stair steps).
5. Sprites flat: no edge occlusion or bevel; damaged buildings only got a dark overlay; construction was a dashed box.
6. Hard rectangular health bars, thin selection ellipses, plain rings; minimap blips unreadable on busy ground.
7. Projectiles had no trails, impacts no sparks/smoke/shockwave.

## What changed
| Area | Change |
|---|---|
| Lighting | `drawLighting`: light buffer `L = ambient(daylight) + sum(light sprites)` (per-channel clamp via `'lighter'`), scene multiplied by `L` (`'multiply'`). Ambient colour is a 5-stop ramp (moon blue 74,92,150 -> dusk orange 236,172,138 -> white). Lights: buildings, crystals, geysers, towers, heroes, units (cool), flashes, projectiles, burning buildings. Ultra adds coloured pools in a second small buffer. |
| Shadows | Blurred silhouette baked once per sprite (`shadowBlur` trick, so it works on Safari without `ctx.filter`). Direction/length follow game time: `a = 2pi(t/360-0.17)`, vector `(0.9 sin a, 0.55)`, length factor `0.85+0.9|sin a|`, alpha `0.18+0.46*min(1,1.4 daylight)`. Buildings draw 1/2/3 stacked copies along the vector (tier), units 1 copy with their heading, plus a contact blob. |
| Sprites | `spritePolish` at bake: inner edge occlusion, top-left rim + bottom-right lip (buildings), directional key light (buildings) or rotation-free dome light (units). |
| Damage / build | <45 % hp: soot gradient and flickering glowing cracks (additive), smoke at hp<55 %, embers + fire light at <30 %. Construction: ghost, bottom-up reveal, blueprint grid above the build line, scaffold posts/braces, weld line, welding sparks, dust. |
| FX | Render-only particle pool (640 typed-array slots, no per-frame allocation): additive trails for bolts/rockets/shells/acid/bullets, rocket smoke, impact sparks + shockwave + smoke plume, hero-skill ring sparks, crystal glints at night. Reduce-motion disables the pool. |
| Terrain | Two low-frequency noise fields modulate warm/cool and brightness (period ~45-95 tiles); plate seams drawn only on ~60 % of plates, much fainter, each plate tinted individually. Fog boundary roughened by a fixed 2-octave noise table and given a misty rim. |
| UI-in-world | Rounded health/progress bars with sheen, selection ring = tinted disc + outline + rotating dashes, softer rings/pings, minimap blips with dark halo and corner-marked camera frustum. |
| Bloom (ultra) | Frame -> 1/4 -> 1/8 canvas; `x^6` via `'multiply'` draws (bright pass); upscaled bilinearly with `'lighter'`; refreshed every 3rd frame; skipped by day unless particles are alive. Ultra adds a 1/16 level. |

## Tiers (`62_quality.js`)
| tier | lit | shd | bloom | particles (fx) |
|---|---|---|---|---|
| battery | 1: ambient + 6 px light cells | 0 (old blob) | 0 | none (fx 0) |
| balanced | 2: 5 px cells | 1 copy | 0 | none (fx 1) |
| high | 2 | 2 copies | 0 | yes (fx 2) |
| ultra | 3: 4 px cells + colour pools | 3 copies | 2 levels | yes, x1.3 |

## Performance (headless software raster, relative only; machine shared, +-10 % noise)
`tools/perf.py --quality X --dpr 1 --frames 90`, autopilot scene at 4 min (night), render mean ms:
| | v3.3 | v4.0 |
|---|---|---|
| high, zoom 1 | 22.9 | 28.9 (+26 %) |
| high, zoom 1.7 | 34.5 | 44.4 (+29 %) |
| battery, zoom 1 | 16.4 / 18.1 | 18.1 / 19.4 (+8..10 %, within run-to-run noise) |
| battery, zoom 1.7 | 20.6 / 19.5 | 20.9 / 23.6 |
`startGame` +100..300 ms (terrain noise). Bloom costs ~+4 ms in software, which is why it is ultra only. Ultra was not measured against the 30 % budget. Real GPUs were not available.

## Tests
`tests/e2e/e2e_visual.py` (pixel assertions on canvas readback). Mutation proof, run by disabling code and watching it fail: `drawLighting` disabled -> "day brighter than night near lamp" fails; `drawBuildingShadow` disabled -> shadow check fails; `drawScaffold` disabled -> construction check fails; `drawBloom` disabled -> bloom check fails; crack/soot pass disabled -> glowing-cracks check fails (orange pixels 50 -> 0). `e2e_terrain.py` reference hashes updated (soft check).

## Not verified
No real GPU, no iOS WebKit (`shadowBlur`, `multiply`/`lighter` blends are standard but unmeasured there), no real phone frame times. Ultra tier perf. Colour-blind check only through `design_check.py` (team colours untouched).
