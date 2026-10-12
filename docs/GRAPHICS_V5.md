# Graphics v5.0 (track v5-B): pre-rendered 3D playfield

Rendering only. No simulation module was touched. The v4 notes are kept below (section "v4.0"); this section is what v5 changed.
Images: `docs/img/v5/` (`before-*` = v4.0 build, `after-*` = this branch, `sheet-*` = the baked sprites).

## Gap to a StarCraft II-class look (measured on the v4.0 screenshots)
1. Units and buildings were flat top-down vector drawings with a baked bevel: no visible height, roofs and walls could not be told apart, silhouettes read as discs.
2. Everything was drawn in one pass sorted by y with buildings under all units: a unit north of a tall building was painted over it.
3. Terrain was a brown/grey colour wash with faint speckle: no doodads, no water/crystal accents, boulder blocks read as dark rectangles, cliff faces were a gradient.
4. Fog edge followed the tile grid (stair steps); no atmospheric depth; selection rings and health bars were thick, soft and un-SC2.
5. Explosions were one radial gradient; shots had no muzzle flash.

## What changed
| Area | Change |
|---|---|
| 3D bake (`56_mesh3d.js`, ~9 KB) | A bake-time software rasteriser (no WebGL, no assets). Primitives: `box`, tapered prism `fr` (box / wedge / ridge), cylinder-cone `cy` (any axis), dome/ellipsoid `sp`, extruded polygon `ex`. Z-buffer, per-pixel shading: key light from the NW (same light the shadows follow) + hemispheric ambient + specular + rim + height term, a depth-buffer ambient-occlusion pass (overhangs, plate steps, turret bases) and a dark silhouette line. Emissive materials are unlit and also written to a glow mask (1/3 size, stretched bilinearly and added with `lighter` at draw time = bloom-ready). Oblique projection `screen y = y - 0.62 z`: the ground stays 1:1 with the terrain, roofs and south faces both show. |
| Recipes (`57_recipes.js`, ~22 KB) | Every unit (19 + 3 heroes), building (12), neutral structure (tower, trading post) and crystal is a short mesh recipe; the faction palette (steel + blue plates / carapace + red glowing veins + spikes / teal hulls + pale panels + gold trim) changes materials and adds faction parts. Units are drawn 1.2x their simulation size so they read at 0.7x zoom. The old vector sprite code (`artUnit`, `artBuilding`, `artNeutral`, `spritePolish`, ~28 KB) was deleted. |
| Lazy baking | Units: 16 facings (8 on battery), baked on first use (~2.4 ms median each in software), nearest baked facing is used as a placeholder while the frame bake budget (7 ms) is spent, and idle frames bake the missing facings and, afterwards, every building of both factions one per frame. Buildings: one bake per (type, faction). Turret heads are a separate rotating part. LRU: sprites are counted in pixels (cap 14 M, evict to 10 M). Bake scale `max(2, SC-1)` (2 on battery/balanced/high, 3 on ultra). |
| Draw order | Buildings and ground units share one depth sort (foot line), so a tall building hides what stands behind it and is overlapped by what stands in front. Flyers stay on top with a ground shadow gap. |
| Shadows | The baked footprint (plan projection of the mesh) is blurred once and pushed along the sun vector; building shadow length follows its height. |
| Terrain / scenery (`55_scenery.js`) | Deterministic doodads painted into the bake (so they replay identically into sharp tiles): grass/scrub tufts, pebbles, boulders with lit/shadow facets, crystal clusters with glow, dead trees, wrecks, and ether/lava pools with a live shimmer pass. Placement avoids sites, resources, camps, lanes. Richer ground palette, faceted rock tops with a south face and strata, cliff strata and a foot AO on south faces. |
| Fog | Two `[1 2 1]` blurs of the per-tile fog alpha before the bilinear upsample: the tile-quantised vision circle becomes a soft ~70 px falloff. |
| UI in the world | SC2-style segmented health bars, thin bright ground circle under units (thicker ellipse under buildings), muzzle flashes, fireball lobes + glowing debris + smoke column on big explosions, framed minimap with edge falloff, sky haze at the top of the screen. |

## Numbers (headless software raster, relative only, +-15 % noise on this shared machine)
`tools/perf.py --quality X --dpr 1 --frames 90` (render mean ms; v4.0 baseline in brackets):
| | zoom 1 | zoom 1.7 |
|---|---|---|
| high | 29.0-33.9 [26.3] (+10..29 %) | 47-48 [41.1] (+15 %) |
| battery | 17.6-18.1 [13.3-16.7] (noise band) | 17.2-18.8 [17.5-20.4] |
Bake cost (`tools/sprites3d.py`, 257 sprites = 3 factions x 22 units x 4 facings + 36 buildings + parts): total 1.5 s, unit facing 2.4 ms median (max 29 ms, GC), building 14 ms median (max 80 ms, the Aurora hub / exchange). Build size 1 444 932 -> 1 466 096 bytes (+21 KB; new code ~40 KB, deleted ~28 KB).

## Tests
`tests/e2e/e2e_visual.py` gained pixel assertions, each mutation-checked with `tools/mutate.py` (apply one edit, rebuild, run the gate, restore):
| assertion | mutation that makes it fail |
|---|---|
| a box's roof is >1.25x lighter than its south face; the dome side facing the light is >1.3x lighter than the shadow side | key light flipped (`L3` x or z sign): both fail |
| a Juggernaut baked at 0 / 90 / 180 degrees gives three different images | facing bin forced to 0: 0 % pixels differ |
| the emissive mask exists and adds light on the lit sprite | `em=0` in `bakeMesh`: gain -1 |
| a Titan north of a Garrison is hidden by its roof, one south of it is drawn over it | buildings drawn before all units: 36 of 36 px of the "hidden" region change (the first version of this test sampled an off-screen region and could not fail; it now has a validity control) |
| a selected unit gets green ring pixels on the ground (below the health bar) | `drawSelRing` returns: 0 -> 0 |
| the fog edge falls off over >= 48 px | blur passes removed: 40 px |
| damage: glowing orange cracks at 15 % hp | (v4 proof) |
`e2e_terrain.py`: the 2x/3x tile seam tolerance went from 16 to 24 (max diff) because scenery adds 1 px high-contrast rims that are sharper in a sharp tile than in the 1x reference (0.002 % of pixels).

## Not done / not verified
No GPU and no iOS WebKit here (the bake uses `ImageData`, `putImageData`, `drawImage`, `lighter`: all standard, unmeasured on device). No parallax shift of tall objects with zoom and no tilt-shift blur (only the sky haze and vignette). Cliffs are shaded faces (strata, lip, foot AO), not geometry: plateaus are not lifted. Animated hero-skill art is still the v4 effects. Recipes are a first pass: shapes are chunky and readable but not hand-tuned per angle.

---

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
