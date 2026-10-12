#!/usr/bin/env python3
"""Sprite sheets of the pre-rendered 3D units/buildings (and per-type bake times):
   python3 tools/sprites3d.py --out DIR [--url URL] [--zoom 3]
Writes DIR/units_<faction>.png (every unit at 4 facings), DIR/buildings.png (every building x 3 factions), DIR/bake_times.json."""
import argparse, json, pathlib, base64
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parents[1]
JS_UNITS = """([f,Z,H0,H1])=>{const V=window.__RTSV,R=__RTS;const types=Object.keys(V.RU).slice(H0,H1);const A=[0,.8,1.57,3.14];
 const cw=100*Z,ch=100*Z,c=document.createElement('canvas');c.width=cw*A.length;c.height=ch*types.length;const g=c.getContext('2d');g.fillStyle='#4a5a6a';g.fillRect(0,0,c.width,c.height);
 types.forEach((t,i)=>A.forEach((a,j)=>{const ff=(R.UDEF&&R.UDEF[t]&&R.UDEF[t].creep)?'neutral':f;V.resetBake();const sp=V.unitSprite(t,ff,a);g.save();g.translate(j*cw+cw/2,i*ch+ch*.62);g.scale(Z,Z);g.drawImage(sp.cv,sp.x0,sp.y0,sp.w,sp.h);g.restore();}));
 return c.toDataURL();}"""
JS_BLD = """([Z])=>{const V=window.__RTSV;const types=Object.keys(V.RB);const F=['meridian','obsidian','aurora'];const cw=190*Z,ch=170*Z;
 const c=document.createElement('canvas');c.width=cw*F.length;c.height=ch*Math.ceil(types.length/1);const g=c.getContext('2d');g.fillStyle='#4a5a6a';g.fillRect(0,0,c.width,c.height);
 types.forEach((t,i)=>F.forEach((f,j)=>{V.resetBake();const sp=V.buildingSprite(t,f);g.save();g.translate(j*cw+cw/2,i*ch+ch*.6);g.scale(Z,Z);g.drawImage(sp.cv,sp.x0,sp.y0,sp.w,sp.h);g.restore();}));
 return c.toDataURL();}"""
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('--out', default='tests/out/sprites'); ap.add_argument('--url'); ap.add_argument('--zoom', type=float, default=2)
    a = ap.parse_args(); out = pathlib.Path(a.out); out.mkdir(parents=True, exist_ok=True)
    url = a.url or (ROOT / 'dist' / 'orbital_dominion_v4.html').as_uri()
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--no-sandbox']); pg = b.new_page(viewport={'width': 1200, 'height': 800})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.add_init_script("window.__TEST='live'")
        pg.goto(url); pg.wait_for_timeout(800)
        pg.evaluate("()=>{const R=__RTS;R.startGame();window.__RTSV.setBakeLog(window.__bk={});}")
        for f in ('meridian', 'obsidian', 'aurora'):
            for k, (h0, h1) in enumerate(((0, 10), (10, 22))):
                d = pg.evaluate(JS_UNITS, [f, a.zoom, h0, h1]); (out / f'units_{f}{k}.png').write_bytes(base64.b64decode(d.split(',')[1]))
        d = pg.evaluate(JS_BLD, [a.zoom]); (out / 'buildings.png').write_bytes(base64.b64decode(d.split(',')[1]))
        bk = pg.evaluate("()=>window.__bk"); (out / 'bake_times.json').write_text(json.dumps(bk, indent=0))
        tot = sum(sum(v) for v in bk.values()); print('bakes', sum(len(v) for v in bk.values()), 'total ms', round(tot), 'errors', errs)
        b.close()
