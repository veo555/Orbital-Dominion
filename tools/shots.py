#!/usr/bin/env python3
"""Screenshot harness: renders the built game on emulated desktop / phone / tablet viewports.

  python3 tools/shots.py                       # default matrix -> tests/out/shots/
  python3 tools/shots.py --tag after iphone-land pixel-port desktop
  python3 tools/shots.py --url http://localhost:8080/index.html desktop

Device profiles are plain viewport + devicePixelRatio + touch flags (Chromium only; this is an emulation of
size, DPR and touch input -- it is NOT WebKit, so iOS-Safari-specific behaviour still needs a real iPhone).
"""
import argparse, os, pathlib, sys
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
PROFILES = {
    # name: (width, height, dpr, mobile/touch)
    'desktop':      (1920, 1080, 1, False),
    'laptop':       (1366, 768, 1, False),
    'retina':       (1440, 900, 2, False),
    'ipad-land':    (1180, 820, 2, True),
    'iphone-land':  (844, 390, 3, True),     # iPhone 14 landscape (CSS px)
    'iphone-port':  (390, 844, 3, True),
    'iphonese-land': (667, 375, 2, True),
    'pixel-land':   (915, 412, 2.625, True),  # Pixel 7 landscape
    'pixel-port':   (412, 915, 2.625, True),
}
DEFAULT = ['desktop', 'iphone-land', 'pixel-port']

def shoot(p, url, name, tag, outdir, states):
    w, h, dpr, mobile = PROFILES[name]
    b = p.chromium.launch(args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
    ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=dpr, is_mobile=mobile, has_touch=mobile)
    pg = ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.add_init_script("window.__TEST='live'")
    pg.goto(url); pg.wait_for_timeout(1500)
    if not mobile: pg.mouse.move(w // 2, h // 2)   # a pointer parked at (0,0) would edge-scroll the camera away from the base
    out = []
    def snap(state):
        f = outdir / f'{tag}_{name}_{state}.png'
        pg.screenshot(path=str(f)); out.append(f)
    if 'menu' in states: snap('menu')
    if any(s in states for s in ('game', 'swarm', 'eco', 'pause', 'select')):
        pg.evaluate("()=>{__RTS.startGame()}"); pg.wait_for_timeout(900)
        pg.evaluate("()=>{const R=__RTS;for(let i=0;i<30*40;i++)R.step();}"); pg.wait_for_timeout(500)
        if 'game' in states: snap('game')
        if 'select' in states:
            pg.evaluate("()=>{const R=__RTS,h=R.G.units.find(u=>u.team===0&&u.type==='hauler');R.setSel([h]);}"); pg.wait_for_timeout(500)
            snap('select')
        if 'swarm' in states:
            pg.evaluate("()=>{__RTS.togglePanel('swarm')}"); pg.wait_for_timeout(500); snap('swarm')
            pg.evaluate("()=>{__RTS.togglePanel('swarm')}")
        if 'eco' in states:
            pg.evaluate("()=>{__RTS.togglePanel('eco')}"); pg.wait_for_timeout(400); snap('eco')
            pg.evaluate("()=>{__RTS.togglePanel('eco')}")
        if 'pause' in states:
            pg.evaluate("()=>{__RTS.togglePause()}"); pg.wait_for_timeout(300); snap('pause')
    b.close()
    return out, errs

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('names', nargs='*')
    ap.add_argument('--tag', default='shot')
    ap.add_argument('--url')
    ap.add_argument('--states', default='menu,game,select,swarm,eco,pause')
    a = ap.parse_args()
    url = a.url or (ROOT / 'dist' / 'orbital_dominion_v3.html').as_uri()
    outdir = ROOT / 'tests' / 'out' / 'shots'; outdir.mkdir(parents=True, exist_ok=True)
    states = a.states.split(',')
    with sync_playwright() as p:
        for n in (a.names or DEFAULT):
            if n not in PROFILES: sys.exit(f'unknown profile {n}; choose from {list(PROFILES)}')
            files, errs = shoot(p, url, n, a.tag, outdir, states)
            print(n, 'errors:', errs if errs else 'none')
            for f in files: print('  ', f)

if __name__ == '__main__':
    main()
