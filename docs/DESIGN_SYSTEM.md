# Design system — Orbital Dominion

One source of truth for every colour, size and behaviour of the interface. The tokens live in `src/style.css` (`:root`); the
numbers in the tables below are **computed from them** by `tools/design_check.py` (run `python3 tools/design_check.py --write` after
changing a colour), so the document cannot drift from the code.

## 1. Principles

1. **Dark-first, high-contrast.** A strategy game is read in short glances under pressure. Surfaces are a five-step "void navy"
   ramp; text is never below 4.5:1 and primary text is never below 7:1 (§3).
2. **One accent per match.** The interface accent (`--acc` / `--acc2`) follows the player's faction, so the HUD, buttons and
   selection glow all say *whose* colony this is. Everything else (surfaces, resources, semantic colours) is constant.
3. **Colour is never the only signal.** Resource chips carry an icon, supply turns red *and* pulses, buttons carry icons and
   badges, factions have distinct silhouettes. The colour-blind-safe mode (§4) additionally re-tints the two sides.
4. **Same data, three layouts.** Desktop, compact landscape (phone held sideways) and portrait (phone upright) are one
   component set with different geometry (§5). Nothing is hover-only; every tooltip is reachable by long-press.
5. **Resolution independent.** Sprites, terrain, icons, charts and the minimap are vector-drawn at run time and baked at the
   device's pixel density (see `docs/ARCHITECTURE.md` §9). No bitmap assets ship with the game.

## 2. Tokens

| Group | Token | Value | Use |
|---|---|---|---|
| Surface | `--bg-void` / `--bg` | `#04070d` / `#060a12` | canvas background, deepest wells |
| | `--panel` | `#0a1322` | HUD bars, floating panels |
| | `--panel2` | `#0f1c31` | cards, inputs, chips |
| | `--raise` / `--raise2` | `#16294a` / `#1e3a66` | hover / active, selected rows |
| Stroke | `--line` / `--line2` / `--line3` | `#1f3d63` / `#3f7bb8` / `#9bd6ff` | hairline / control border / hover + focus ring |
| Text | `--txt` / `--txt2` / `--dim` | `#e6f0fc` / `#b4c8e0` / `#8aa2bf` | primary / secondary / labels |
| Resource | `--cry` / `--eth` / `--sup` | `#f6c04a` / `#b985ff` / `#8fd0ff` | crystals / ether / supply |
| Semantic | `--ok` / `--warn` / `--bad` / `--info` | `#5be38a` / `#f2b84b` / `#ff6a6a` / `#5aa9ff` | success / caution / danger / information |
| Accent | `--acc`, `--acc2` (+ `-rgb` triplets) | faction colour / glow | set from JS by `setAccent()` |
| Shape | `--r1…--r4` | 5 / 8 / 12 / 18 px | controls / buttons / cards / sheets |
| Depth | `--sh1…--sh3`, `--hi` | shadows + 1 px inner highlight | elevation |
| Motion | `--ease`, `--t1`, `--t2` | `cubic-bezier(.2,.8,.2,1)`, 120 / 220 ms | transitions (disabled by reduce-motion) |
| Type | `--font` | `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, …` | tabular numerals everywhere (`font-variant-numeric`) |
| Safe area | `--sat/--sar/--sab/--sal` | `env(safe-area-inset-*)` | iPhone notch / home bar, Android cut-outs |
| Geometry | `--top`, `--bot`, `--mm`, `--tap` | nominal sizes | bar heights, minimap size, touch target |
| | `--tH`, `--bH` | **measured** by `measureHud()` | positions of panels, toasts, dock; also the camera's `TOPBAR` / `BOTTOM` |

Faction colours (data, `src/js/00_core.js`): Meridian `#3d8bff`, Obsidian `#ff4d4d`, Aurora `#27d3a2`; each has `light`, `dark`, `glow`
variants used by the sprite painter.

No fonts are downloaded: the system stack keeps the game at zero external requests and lets each platform use its native UI face.

## 3. Measured contrast and colour-blind safety

<!-- BEGIN GENERATED -->
### Surfaces and text (WCAG 2.x contrast ratio, higher is better)

| Token | Hex | Role | on `--bg` #060a12 | on `--panel` #0a1322 | on `--panel2` #0f1c31 | on `--raise` #16294a | Needs |
|---|---|---|---|---|---|---|---|
| `--txt` | #e6f0fc | primary text | 17.2:1 ✔ | 16.1:1 ✔ | 14.8:1 ✔ | 12.6:1 ✔ | 7:1 |
| `--txt2` | #b4c8e0 | secondary text | 11.6:1 ✔ | 10.9:1 ✔ | 10.0:1 ✔ | 8.5:1 ✔ | 7:1 |
| `--dim` | #8aa2bf | tertiary text / labels | 7.5:1 ✔ | 7.1:1 ✔ | 6.5:1 ✔ | 5.5:1 ✔ | 4.5:1 |
| `--cry` | #f6c04a | crystal figures | 11.8:1 ✔ | 11.1:1 ✔ | 10.2:1 ✔ | 8.7:1 ✔ | 4.5:1 |
| `--eth` | #b985ff | ether figures | 7.4:1 ✔ | 7.0:1 ✔ | 6.4:1 ✔ | 5.4:1 ✔ | 4.5:1 |
| `--sup` | #8fd0ff | supply figures | 11.9:1 ✔ | 11.2:1 ✔ | 10.3:1 ✔ | 8.7:1 ✔ | 4.5:1 |
| `--ok` | #5be38a | positive / success | 12.1:1 ✔ | 11.3:1 ✔ | 10.4:1 ✔ | 8.8:1 ✔ | 4.5:1 |
| `--warn` | #f2b84b | caution | 11.1:1 ✔ | 10.4:1 ✔ | 9.5:1 ✔ | 8.1:1 ✔ | 4.5:1 |
| `--bad` | #ff6a6a | danger / error | 7.1:1 ✔ | 6.7:1 ✔ | 6.1:1 ✔ | 5.2:1 ✔ | 4.5:1 |
| `--info` | #5aa9ff | information | 8.1:1 ✔ | 7.6:1 ✔ | 7.0:1 ✔ | 5.9:1 ✔ | 4.5:1 |
| `--acc2` | #5aa9ff | default accent (Meridian glow) | 8.1:1 ✔ | 7.6:1 ✔ | 7.0:1 ✔ | 5.9:1 ✔ | 4.5:1 |

### Faction and team colours on the dark UI surface `--panel2` #0f1c31

| Colour | Hex | Contrast on `--panel2` |
|---|---|---|
| Meridian Corps | #3d8bff | 5.1:1 ✔ |
| Obsidian Collective | #ff4d4d | 5.2:1 ✔ |
| Aurora Syndicate | #27d3a2 | 8.9:1 ✔ |
| Colour-blind "you" | #3d9bff | 6.0:1 ✔ |
| Colour-blind "enemy" | #ff9a1f | 8.0:1 ✔ |

### Can the two sides be told apart? CIEDE2000 colour difference under colour-vision deficiency

dE00 below ~10 = hard to tell apart at a glance; above ~25 = clearly different.

| Pair (you vs enemy) | normal | protanopia | deuteranopia | tritanopia | worst |
|---|---|---|---|---|---|
| Meridian vs Obsidian | 46 | 47 | 57 | 75 | **46** |
| Meridian vs Aurora | 46 | 45 | 39 | 17 | **17** |
| Obsidian vs Aurora | 73 | 25 | 18 | 74 | **18** |
| **Colour-blind-safe mode: blue vs orange** | 54 | 58 | 63 | 67 | **54** |
<!-- END GENERATED -->

**Reading the colour-vision table.** Each colour is converted to linear RGB, pushed through the Machado–Oliveira–Fernandes (2009)
severity-1.0 matrix for the deficiency, converted to CIELAB and compared with CIEDE2000. Two readings matter for design:
the default **Obsidian vs Aurora** (red vs green) and **Meridian vs Aurora** (blue vs teal) matchups fall to ΔE00 ≈ 17–18 for the
affected deficiency, i.e. noticeably harder to separate in a busy fight; the **blue/orange** pair never falls below the safe
band, which is why it is offered as a setting rather than hand-waved.

## 4. Accessibility features

| Feature | Where | Notes |
|---|---|---|
| Colour-blind-safe teams | Settings → "Colour-blind-safe team colours" | applied by re-colouring the two *shared* faction colour objects in place and flushing sprite caches (`applyTeamPalettes`); the accent follows |
| Reduce motion | Settings; also `prefers-reduced-motion` | no animations/transitions, no screen shake, no dust motes |
| Focus ring | `:focus-visible` | 2 px `--line3` outline for keyboard users |
| Touch targets | `html.touch` | command buttons ≥ 44 CSS px (phones), top-bar hit areas extended by ±7 px with a pseudo-element |
| No hover-only help | `74_touch.js` | long-press (450 ms) on any button opens its tooltip as a bottom sheet |
| Text size | layout modes | 12 px compact, 13 px desktop; inputs are 16 px so iOS Safari does not zoom on focus |
| Screen-reader basics | `aria-label` on icon-only buttons, `role="status"` on the payment message | the game canvas itself is not accessible to screen readers (honest limitation) |

## 5. Layout modes

`applyLayoutClasses()` (`60_render.js`) toggles classes on `<html>`; `measureHud()` then measures the bars and writes `--tH/--bH`
and the camera's `TOPBAR/BOTTOM`.

| Mode | Condition | Top bar | Bottom bar | Command card |
|---|---|---|---|---|
| desktop | min side ≥ 600 px and height ≥ 500 px | 1 row, 44 px | minimap 182 + info + card, 198 px | 4 × 3, hotkey letters |
| `compact` (landscape phone) | min side < 600 px or height < 500 px | 1 row, 44 px, secondary chips hidden | minimap 92 + info + card, ≈ 105 px | 6 × 2, 44 px buttons |
| `compact portrait` | compact and taller than wide | 2 rows (≈ 75 px), minimap 118 | info floats above the bar | 4 × 3, 48 px buttons |
| `touch` (additive) | last input was a finger/pen, or `pointer: coarse` | larger hit areas | — | hotkey letters hidden; touch dock (Hub, Select, Queue, Clear) |

Measured share of the screen left for the map (headless Chromium, `tests/e2e/e2e_touch.py`): iPhone-class landscape 844 × 390 →
**62 %** (was 38 % before the redesign); Pixel-class portrait 412 × 915 → **74 %**.

## 6. Icons and the logo

`src/pwa/icon.svg` is the single logo source (a ringed planet, a gold crystal, an ether-violet satellite). `tools/make_icons.py` renders
every size with Chromium into `src/pwa/icons/` (192/512 *any*, 512 *maskable* with the emblem inside the 80 % safe zone, 180 iOS,
favicons, 1200 × 630 share card). The PNGs are committed so the build needs no image tooling.

## 7. Changing the look

1. Edit the token in `src/style.css` `:root` (surfaces/semantic) or the faction colour in `00_core.js`.
2. `python3 tools/design_check.py --write` — it fails (exit 1) if a text colour drops below its contrast requirement or the colour-blind
   pair loses separation.
3. `python3 tools/shots.py --tag mychange` renders the menu and HUD on desktop, tablet and phone profiles into `tests/out/shots/`.
