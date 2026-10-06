#!/usr/bin/env python3
"""Render the app icons and the social-share image from src/pwa/icon.svg with Chromium (so the committed PNGs need no
image tooling at build time).   python3 tools/make_icons.py      -> src/pwa/icons/*.png

  icon-192.png / icon-512.png    purpose "any"  (rounded plate, transparent corners)
  maskable-512.png               purpose "maskable": full-bleed plate, emblem inside the 80 % safe zone
  apple-touch-180.png            iOS home-screen icon (opaque, iOS applies its own rounding)
  favicon-32.png / favicon-64.png
  og-image.png                   1200x630 link-preview card for sharing the page
"""
import pathlib, re
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parents[1]
SVG = (ROOT / 'src' / 'pwa' / 'icon.svg').read_text(encoding='utf-8')
OUT = ROOT / 'src' / 'pwa' / 'icons'; OUT.mkdir(parents=True, exist_ok=True)

def variant(plate_rx, emblem_scale):
    s = SVG.replace('rx="116"', f'rx="{plate_rx}"')
    if emblem_scale != 1:
        k = emblem_scale; c = 256 * (1 - k)
        s = s.replace('<g id="emblem">', f'<g id="emblem" transform="translate({c} {c}) scale({k})">')
    return s

def shot(pg, svg, size, name, omit_bg=True):
    pg.set_viewport_size({'width': size, 'height': size})
    pg.set_content(f'<html><body style="margin:0;background:transparent">{svg.replace("width=\"512\" height=\"512\"", f"width=\"{size}\" height=\"{size}\"")}</body></html>')
    pg.wait_for_timeout(60)
    pg.screenshot(path=str(OUT / name), omit_background=omit_bg, clip={'x': 0, 'y': 0, 'width': size, 'height': size})
    print('wrote', name, size)

with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])
    pg = b.new_page(device_scale_factor=1)
    shot(pg, variant(116, 1), 192, 'icon-192.png'); shot(pg, variant(116, 1), 512, 'icon-512.png')
    shot(pg, variant(0, 0.78), 512, 'maskable-512.png', omit_bg=False)
    shot(pg, variant(0, 0.9), 180, 'apple-touch-180.png', omit_bg=False)
    shot(pg, variant(116, 1), 32, 'favicon-32.png'); shot(pg, variant(116, 1), 64, 'favicon-64.png')
    # 1200x630 share card
    pg.set_viewport_size({'width': 1200, 'height': 630})
    card = variant(116, 1).replace('width="512" height="512"', 'width="360" height="360"').replace('fill="url(#bg)"', 'fill="none"')   # no plate on the card
    pg.set_content(f'''<html><body style="margin:0;width:1200px;height:630px;background:radial-gradient(900px 500px at 25% 40%,#14305c,#060b16 70%);font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#e6f0fc;display:flex;align-items:center;gap:56px;padding:0 80px;box-sizing:border-box">
      <div style="flex:none">{card}</div>
      <div><div style="font-size:84px;font-weight:800;letter-spacing:8px;line-height:1.02;background:linear-gradient(90deg,#fff,#7fb8ff);-webkit-background-clip:text;color:transparent">ORBITAL<br>DOMINION</div>
      <div style="margin-top:22px;font-size:30px;letter-spacing:4px;color:#8aa2bf">REAL-TIME STRATEGY</div>
      <div style="margin-top:18px;font-size:28px;color:#b4c8e0;max-width:620px;line-height:1.35">Three factions, a living colony economy and a swarm of autonomous agents. Free to play in your browser, on desktop and phone.</div></div></body></html>''')
    pg.wait_for_timeout(120)
    pg.screenshot(path=str(OUT / 'og-image.png'), clip={'x': 0, 'y': 0, 'width': 1200, 'height': 630}); print('wrote og-image.png')
    b.close()
