#!/usr/bin/env python3
"""Cinematic PROP sheets: every prop kind x variant, rendered through the REAL engine (cineFrame) on a mid-grey and on a space background.

  OD_DIST=<scratch>/dist python3 build.py standalone
  OD_URL=file://<scratch>/dist/orbital_dominion_v3.html python3 tools/props_sheets.py                   # all sheets, grey + space, into tests/out/cine/props_*.png
  python3 tools/props_sheets.py --sheet ships,units_meridian --bg space --t 1.4                      # a subset / one background / another time
  python3 tools/props_sheets.py --list

Each sheet is ONE film scene whose props are laid out on a grid (the engine places, flips and rotates them exactly like in a real film), so what you see is what a
story gets. The grey background is a flat #7f7f7f (no light cues); the space background is the real `space` painter. The key light of both is the engine's
space key (upper right) unless --bgkind says otherwise.   Exit status 1 on painter errors.
"""
import argparse, base64, io, json, os, pathlib, sys
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'tests' / 'out' / 'cine'
F = ['meridian', 'obsidian', 'aurora']
UNITS = ['hauler', 'rifleman', 'raptor', 'rocketeer', 'mender', 'howitzer', 'juggernaut', 'skiff', 'titan', 'freighter', 'bulwark', 'reaver', 'specter', 'crawler', 'spitter', 'brute', 'hero_idris', 'hero_kaz', 'hero_lyra']
BUILDINGS = ['hub', 'generator', 'depot', 'siphon', 'habitat', 'garrison', 'armory', 'forum', 'exchange', 'foundry', 'airfield', 'turret']
PLANETS = ['azure', 'ember', 'verdant', 'ice', 'ashen', 'violet']
SHAPES = ['planet', 'ring', 'cross', 'skull', 'crown', 'map', 'sigil']
CLS = ['shuttle', 'dropship', 'frigate', 'carrier', 'wreck']

def sheets():
    S = {}
    # name: (cols, rows, prop scale, [(label, entry)...])
    S['ships'] = (3, 5, .5, [(f'{c} {f}', {'k': 'ship', 'cls': c, 'faction': f}) for c in CLS for f in F])
    for c, sc in (('shuttle', 3.6), ('dropship', 3.0), ('frigate', 1.9), ('carrier', 1.15), ('wreck', 2.2)):
        S['ship_' + c] = (3, 1, sc, [(f'{c} {f}', {'k': 'ship', 'cls': c, 'faction': f}) for f in F], (1600, 540))
    for f in F:
        S['units_' + f] = (5, 4, .8, [(f'{u} {f}', {'k': 'unit', 'type': u, 'faction': f}) for u in UNITS])
        S['buildings_' + f] = (4, 3, .75, [(f'{b} {f}', {'k': 'building', 'type': b, 'faction': f}) for b in BUILDINGS])
    S['units_tilt'] = (5, 2, .8, [(f'{u} tilt', {'k': 'unit', 'type': u, 'faction': 'meridian', 'tilt': .66}) for u in ['hauler','rifleman','juggernaut','titan','freighter','brute','hero_kaz','howitzer','mender','reaver']])
    S['planets'] = (4, 2, 1.0, [(f'planet {p}', {'k': 'planet', 'planet': p}) for p in PLANETS] + [('moon', {'k': 'moon'}), ('station', {'k': 'station'})])
    S['station_big'] = (2, 1, 2.2, [('station', {'k': 'station'}), ('station violet', {'k': 'station', 'col': '#b79cff'})], (1600, 540))
    S['array_states'] = (4, 1, 2.0, [(f'array {st}', {'k': 'array', 'state': st}) for st in ('dormant', 'charging', 'firing', 'broken')], (1600, 450))
    S['misc'] = (4, 2, 1.0, [('beacon', {'k': 'beacon'}), ('beacon warm', {'k': 'beacon', 'col': '#ffb060'}), ('beacon unlit', {'k': 'beacon', 'col': '#2d2b30'}), ('beacon red', {'k': 'beacon', 'col': '#ff5a4a'}),
                             ('crystal', {'k': 'crystal'}), ('crystal cyan', {'k': 'crystal', 'col': '#7ae8ff'}), ('crystal violet', {'k': 'crystal', 'col': '#b79cff'}), ('array', {'k': 'array'})])
    S['beacons'] = (6, 1, 1.4, [('beacon', {'k': 'beacon'}), ('warm', {'k': 'beacon', 'col': '#ffb060'}), ('unlit', {'k': 'beacon', 'col': '#2d2b30'}), ('dim teal', {'k': 'beacon', 'col': '#33524e'}), ('cyan', {'k': 'beacon', 'col': '#7ae8ff'}), ('tiny warm .16', {'k': 'beacon', 'col': '#ffb35c', 'scale': .12})], (1600, 360))
    S['banners'] = (3, 1, 1.2, [(f'banner {f}', {'k': 'banner', 'faction': f}) for f in F])
    S['holo'] = (4, 2, 1.0, [(f'holo {s}', {'k': 'holo', 'shape': s}) for s in SHAPES] + [('holo ring gold', {'k': 'holo', 'shape': 'ring', 'col': '#f6c04a'})])
    S['crowd'] = (1, 3, 3.0, [(f'crowd {f}', {'k': 'crowd', 'faction': f}) for f in F])
    return S

RENDER_JS = """
async ({sheet, W, H, bg, bgkind, t, rm, tier, cam}) => {
  const R = window.__RTS, P = R.CINE_PAINT;
  if (bg === 'grey') { const f = (g, W, H, p, tt, seed, S) => { g.fillStyle = '#7f7f7f'; g.fillRect(S.fill.x, S.fill.y, S.fill.w, S.fill.h); }; f.static = true; P.bg[bgkind] = f; }
  P.labels = false;
  const [cols, rows, k, items] = sheet;
  const props = items.map(([label, e], i) => Object.assign({}, e, {at: [((i % cols) + .5) / cols, (Math.floor(i / cols) + .5) / rows], scale: (e.scale || 1) * k, t0: 0, t1: 6}));
  const film = {id: 'sheet', kind: 'interlude', title: 'sheet', seed: 3, scenes: [{id: 's', dur: 6, bg: {k: bgkind}, cam: cam || {from: {x: .5, y: .5, z: 1, r: 0}, to: {x: .5, y: .5, z: 1, r: 0}}, props, fx: [], actors: [], lines: [], sfx: [], trans: {in: 'cut', out: 'cut', len: .3}}]};
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const t0 = performance.now();
  R.cineFrame(film, t, cv, {frameOnly: true, noTrans: true, tier, rm});
  const ms = performance.now() - t0;
  const t1 = performance.now(); R.cineFrame(film, t, cv, {frameOnly: true, noTrans: true, tier, rm}); const ms2 = performance.now() - t1;
  return {png: cv.toDataURL('image/png'), ms, ms2, errors: P.errors.slice()};
}
"""

def font(sz):
    for f in ('DejaVuSansMono.ttf', 'DejaVuSans.ttf'):
        try: return ImageFont.truetype(f, sz)
        except Exception: pass
    return ImageFont.load_default()

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--sheet'); ap.add_argument('--bg', default='grey,space'); ap.add_argument('--bgkind', default='space'); ap.add_argument('--t', type=float, default=1.2)
    ap.add_argument('--size', default='1600x900'); ap.add_argument('--rm', action='store_true'); ap.add_argument('--tier', default='high'); ap.add_argument('--out', default=str(OUT))
    ap.add_argument('--url'); ap.add_argument('--list', action='store_true'); ap.add_argument('--labels', action='store_true', default=True); ap.add_argument('--prefix', default='props_')
    a = ap.parse_args()
    SH = sheets()
    if a.list:
        for k, v in SH.items(): print(f'{k:22s} {len(v[3])} items')
        return 0
    want = a.sheet.split(',') if a.sheet else list(SH)
    for w in want:
        if w not in SH: sys.exit('unknown sheet ' + w)
    W0, H0 = (int(x) for x in a.size.split('x'))
    url = a.url or os.environ.get('OD_URL') or (ROOT / 'dist' / 'orbital_dominion_v3.html').as_uri()
    outd = pathlib.Path(a.out); outd.mkdir(parents=True, exist_ok=True)
    bad = []
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--no-sandbox'])
        for bg in a.bg.split(','):
            ctx = b.new_context(viewport={'width': 1280, 'height': 720}, device_scale_factor=1)
            pg = ctx.new_page()
            errs = []
            pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
            pg.on('console', lambda m: errs.append('console.' + m.type + ': ' + m.text) if m.type == 'error' else None)
            pg.add_init_script("window.__TEST='live'")
            pg.goto(url); pg.wait_for_function("()=>!!(window.__RTS&&window.__RTS.cineFrame&&window.__RTS.CINE_PAINT)", timeout=20000)
            for name in want:
                cols, rows, k, items = SH[name][:4]
                W, H = SH[name][4] if len(SH[name]) > 4 else (W0, H0)
                r = pg.evaluate(RENDER_JS, {'sheet': [cols, rows, k, items], 'W': W, 'H': H, 'bg': bg, 'bgkind': a.bgkind, 't': a.t, 'rm': a.rm, 'tier': a.tier, 'cam': None})
                im = Image.open(io.BytesIO(base64.b64decode(r['png'].split(',', 1)[1]))).convert('RGB')
                d = ImageDraw.Draw(im); ft = font(13)
                for i, (label, e) in enumerate(items):
                    cx, cy = (i % cols) * W / cols, (i // cols) * H / rows
                    d.text((cx + 6, cy + 4), label, fill=(255, 255, 255), font=ft, stroke_width=2, stroke_fill=(0, 0, 0))
                f = outd / f'{a.prefix}{name}_{bg}.png'; im.save(f)
                print(f'{name:20s} {bg:6s} first {r["ms"]:6.0f} ms  repeat {r["ms2"]:5.1f} ms  -> {f}')
                bad += r['errors']
            bad += errs; ctx.close()
        b.close()
    if bad:
        print('PROBLEMS:'); [print('  - ' + str(e)[:300]) for e in dict.fromkeys(bad)]
        return 1
    return 0

if __name__ == '__main__':
    sys.exit(main())
