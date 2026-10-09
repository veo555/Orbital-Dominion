#!/usr/bin/env python3
"""Render-cost probe (headless Chromium, SOFTWARE rasterisation -- numbers are pessimistic and only meaningful relative to each other).

  python3 tools/perf.py                       # default matrix
  python3 tools/perf.py --label after --dpr 1 2 --zoom 1 1.7

Measures: terrain bake time, sprite warm-up, and the mean / p95 of render() over N frames for a mid-game scene
(Autopilot, ~4 game minutes) at each (viewport, devicePixelRatio, zoom) combination. Also reports JS heap.
"""
import argparse, json, pathlib, statistics
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parents[1]

def pct(a, p):
    a = sorted(a); return a[min(len(a) - 1, int(len(a) * p))]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--label', default='run'); ap.add_argument('--url')
    ap.add_argument('--dpr', nargs='*', type=float, default=[1, 2]); ap.add_argument('--zoom', nargs='*', type=float, default=[1.0, 1.7])
    ap.add_argument('--size', default='1366x768'); ap.add_argument('--frames', type=int, default=60)
    ap.add_argument('--quality', default=None)
    a = ap.parse_args()
    url = a.url or (ROOT / 'dist' / 'orbital_dominion_v4.html').as_uri()
    w, h = map(int, a.size.split('x'))
    rows = []
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--no-sandbox', '--enable-precise-memory-info', '--autoplay-policy=no-user-gesture-required'])
        for dpr in a.dpr:
            ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=dpr)
            pg = ctx.new_page(); pg.add_init_script("window.__TEST='live'")
            errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(url); pg.wait_for_timeout(800); pg.mouse.move(w // 2, h // 2)
            if a.quality: pg.evaluate(f"()=>{{__RTS.setQualityMode('{a.quality}')}}")
            t_bake = pg.evaluate("""()=>{const R=__RTS;const t0=performance.now();R.startGame();return performance.now()-t0}""")
            pg.evaluate("()=>{const R=__RTS;R.ovPreset&&R.ovPreset('autopilot');for(let i=0;i<30*240;i++)R.step();}")
            for zoom in a.zoom:
                pg.evaluate(f"()=>{{const R=__RTS,hub=R.G.buildings.find(b=>b.team===0&&b.type==='hub');R.cam.z=R.cam.tz={zoom};R.centerOn(hub.x,hub.y);R.render(1)}}")
                # settle the sharp-tile stream (a no-op when the tier has none), then time the first draw of finished tiles separately
                first = pg.evaluate("()=>{const R=__RTS;for(let i=0;i<60&&(R.terrainStream(1e6),R.tch.pending>0);i++);const t0=performance.now();R.render(1);return performance.now()-t0}")
                ts = pg.evaluate(f"""()=>{{const R=__RTS,o=[];for(let i=0;i<{a.frames};i++){{const t0=performance.now();R.render(1+i*0.05);o.push(performance.now()-t0);}}return o}}""")
                heap = pg.evaluate("()=>performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576):-1")
                rows.append(dict(dpr=dpr, zoom=zoom, first_draw=round(first,1), tiles=pg.evaluate('()=>__RTS.tch.baked'), startGame_ms=round(t_bake), render_mean=round(statistics.mean(ts), 1), render_p95=round(pct(ts, .95), 1), heap_mb=heap, errors=errs[:2]))
            ctx.close()
        b.close()
    print(f'[{a.label}] {w}x{h}, {a.frames} frames each')
    print(f"{'dpr':>4} {'zoom':>5} {'startGame':>10} {'render mean':>12} {'render p95':>11} {'1st draw':>9} {'tiles':>6} {'heap MB':>8}")
    for r in rows: print(f"{r['dpr']:>4} {r['zoom']:>5} {r['startGame_ms']:>8}ms {r['render_mean']:>10}ms {r['render_p95']:>9}ms {r['first_draw']:>7}ms {r['tiles']:>6} {r['heap_mb']:>8} {r['errors'] or ''}")
    out = ROOT / 'tests' / 'out'; out.mkdir(parents=True, exist_ok=True)
    (out / f'perf_{a.label}.json').write_text(json.dumps(rows, indent=1))

if __name__ == '__main__':
    main()
