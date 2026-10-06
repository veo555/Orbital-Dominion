# Touch controls — specification and test map

Implemented in `src/js/74_touch.js` (Pointer Events, `pointerType` `touch` and `pen`); mouse input keeps using the original handlers in
`90_main.js`. Verified by `tests/e2e/e2e_touch.py` (real multi-touch through the DevTools protocol on emulated iPhone and Pixel
profiles). **Verified in Chromium emulation only — not on real iOS/Android hardware** (see §6).

## 1. Gestures

| Gesture | Where | Result | Test |
|---|---|---|---|
| Drag one finger | map | pan the camera, with inertia on release | "one-finger drag pans the camera" |
| Pinch / spread | map | zoom about the fingers' midpoint (0.5 – 1.7×), two-finger drag pans | "pinch-out zooms in", "pinch-in zooms out" |
| Tap own unit/building | map | select it (hit radius = unit radius + 16 px) | "tap selects the Hauler under the finger" |
| Double-tap own unit | map | select every unit of that type on screen | "double-tap selects every Hauler on screen" |
| Tap ground / enemy / crystal / structure with units selected | map | the desktop **right-click** command (move, attack, gather, repair, rally, deliver) | "tapping empty ground … issues a move order" |
| Tap with only buildings selected | map | tapping empty ground deselects (rally points use the *Set Rally Point* button) | — |
| Hold ≈ 0.4 s, then drag | map | box-select (progress ring is drawn while holding) | "hold-then-drag box-selects several units" |
| Hold on a unit, release | map | add/remove it from the selection (shift-click) | "holding a unit adds it to the selection" |
| Drag on / tap the minimap | minimap | jump the camera | "minimap tap jumps the camera" |
| Hold on the minimap | minimap | move order / rally point (right-click) | — |
| Tap a command button | card | run it; placement and targeting commands arm the map | "command-card tap arms Move targeting" |
| Hold a button ≈ 0.45 s | any button | its tooltip as a bottom sheet; the button does **not** fire | "holding a command button shows its help sheet", "…did not stop the unit" |

**Placement.** Choosing a structure shows its ghost mid-screen; drag to move it (it sits 46 px above the finger so it stays visible),
then tap ✔ to build or ✕ to cancel (`#placeBar`). Targeting commands show a cancel bar instead.

## 2. Touch dock (bottom-right)

| Button | Does |
|---|---|
| Hub | jump to the Command Hub (Backspace) |
| Select | toggle box-select mode: one-finger drag draws a box, two fingers pan/zoom |
| Queue | next order is appended (Shift-queue); resets after one use |
| Clear | clear selection and cancel placement/targeting |

## 3. Everything that has a hotkey on desktop

F1 idle Hauler / F2 army / F3 hero → top-bar buttons; Space (jump to last alert) → tap the red alert ping on the minimap; groups → chips above the
minimap (tap recall); `M` economy → tap the morale chip; `K`/`J` Swarm → the AI chip and AI on/off button; Esc/P pause → ☰ button or the system
Back gesture (installed app); `H` help → pause menu; speed → ×-button.

## 4. Browser behaviours switched off

`touch-action: none` on the canvas and minimap, `overscroll-behavior: none`, `-webkit-touch-callout: none`, `user-select: none` (inputs excepted),
context menu suppressed, **iOS** `gesturestart/change/end` and multi-touch `touchmove` cancelled (iOS ignores `user-scalable=no`), double-tap zoom
cancelled, text inputs are 16 px so iOS does not zoom on focus.

## 5. Why a long-press suppression window exists

iOS Safari may deliver a synthetic click right after a long-press. Once a help sheet is open, the next click within 120 ms of the release is
swallowed. (An earlier 500 ms window also swallowed legitimate quick taps; `e2e_touch.py` guards both directions.)

## 6. Not verified

Real devices (any), Safari/WebKit, Firefox, pen pressure, 120 Hz displays, one-handed play ergonomics, tap-miss rate with real thumbs (the backlog asks for
< 10 % over ≥ 8 playtesters — not measured), haptics (`navigator.vibrate` is unsupported on iOS Safari and silently skipped).
