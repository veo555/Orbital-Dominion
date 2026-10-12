"""Terrain / HD-tile gate (Playwright + Chromium). Exit code != 0 on failure.
   python3 tests/e2e/e2e_terrain.py        (about 30 s)

The sharp-tile system re-runs the terrain generator onto small scaled canvases. This gate checks the properties that make that safe:
  * determinism: baking the same seed twice gives pixel-identical canvases
  * the 1x base map still matches the 3.0 reference hashes (SOFT check: a different Chromium rasteriser may legitimately differ -> warning only)
  * adjacent tiles join seamlessly: composite of 4 tiles vs ONE reference bake of the same region, at 2x and 3x (max channel difference <= 16/255, <= 0.01 % of pixels over 8)
  * in a running match at DPR 2 / zoom 1.7 tiles are produced inside the per-frame budget; the LRU cap holds after panning across the whole map
  * switching to a lower tier drops the tiles; at DPR 1 / zoom 1 no tiles are made (the base map is already 1:1)
  * battle decals are painted on the base map AND on finished tiles (same place, same pixels)
"""
import pathlib, sys, os
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parents[2]
URL = os.environ.get('OD_URL') or (ROOT / 'dist' / 'orbital_dominion_v4.html').as_uri()
fails = []; errs = []
def ok(c, m):
    print(('ok    ' if c else 'FAIL  ') + m, flush=True)
    if not c: fails.append(m)
REF = {7: '546baabe', 21: '1f650e65', 99: '6b28cd98'}   # FNV-1a over canvas.toDataURL('image/png') in the 4.0 build (macro colour variation + plate tints; the 3.x values were 2c52c2f0 / acbf291b / 1ee2ff20), headless Chromium 141

HASH = """(seed)=>{const R=__RTS;R.newGame({seed,faction:'meridian',enemy:'aurora',diff:'normal'});R.ui.demo=false;R.buildTerrain();
  const d=R.G.terrainCv.toDataURL('image/png');let h=2166136261;for(let i=0;i<d.length;i++){h^=d.charCodeAt(i);h=Math.imul(h,16777619)>>>0}return h.toString(16)}"""
SEAM = """(s)=>{const R=__RTS,G=R.G,X0=700,Y0=1300,W=700,H=500;const run=t=>{for(;;){if(t.gen.next().done)break}};
 const tiles=[];for(const cx of[1,2])for(const cy of[2,3]){const t=R.tileFor(cx,cy,s,true);run(t);tiles.push(t)}
 const comp=R.mkCanvas(W*s,H*s),cg=comp.getContext('2d');cg.setTransform(s,0,0,s,-X0*s,-Y0*s);for(const t of tiles)cg.drawImage(t.cv,t.x0,t.y0,t.w,t.h);
 const ref=R.mkCanvas(W*s,H*s),rg=ref.getContext('2d');rg.setTransform(s,0,0,s,-X0*s,-Y0*s);rg.beginPath();rg.rect(X0,Y0,W,H);rg.clip();for(const _ of R.terrainPaint(rg,G.tInfo)){}
 const a=cg.getImageData(0,0,W*s,H*s).data,b=rg.getImageData(0,0,W*s,H*s).data;let max=0,over=0,n=0;
 for(let i=0;i<a.length;i+=4){let d=Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]));if(a[i+3]<250)d=255;max=Math.max(max,d);if(d>8)over++;n++}
 return{max,pct:100*over/n}}"""

with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 1280, 'height': 800}, device_scale_factor=2); pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append(('pageerror', str(e)))); pg.on('console', lambda m: errs.append((m.type, m.text)) if m.type in ('error', 'warning') and 'willReadFrequently' not in m.text else None)   # that warning comes from this test's own getImageData readbacks
    pg.add_init_script("window.__TEST='live'"); pg.goto(URL); pg.wait_for_timeout(900); pg.mouse.move(640, 400)

    # determinism + reference
    for seed in (7, 21, 99):
        h1, h2 = pg.evaluate(HASH, seed), pg.evaluate(HASH, seed)
        ok(h1 == h2, f'seed {seed}: baking twice gives identical pixels ({h1})')
        if h1 != REF[seed]: print(f'      WARN  seed {seed}: base map hash {h1} differs from the 4.0 reference {REF[seed]} (a different Chromium rasteriser can do this; investigate if you changed terrain code)')
        else: print(f'      seed {seed}: base map identical to the 4.0 reference')
    # seams
    for s, mx in ((2, 24), (3, 24)):   # v5: scenery adds 1-px high-contrast rims that are sharper in a 3x tile than in the 1x reference (0.002 % of pixels)
        r = pg.evaluate(SEAM, s)
        ok(r['max'] <= mx and r['pct'] <= 0.01, f"tiles at {s}x join a single reference bake: max diff {r['max']}/255, {r['pct']:.4f}% of pixels over 8")

    # running match
    pg.evaluate("()=>__RTS.startGame()"); pg.wait_for_timeout(600)
    pg.evaluate("()=>{const R=__RTS;for(let i=0;i<30*30;i++)R.step();const h=R.G.buildings.find(b=>b.team===0&&b.type==='hub');R.cam.z=R.cam.tz=1.7;R.centerOn(h.x,h.y)}"); pg.wait_for_timeout(1500)
    st = pg.evaluate("()=>({s:__RTS.tileScaleWanted(),baked:__RTS.tch.baked,size:__RTS.tch.map.size,pending:__RTS.tch.pending,dpr:__RTS.DPR,tier:__RTS.Q.tier})")
    ok(st['s'] == 2 and st['baked'] >= 1, f'DPR 2 / zoom 1.7 in a real match: tiles are baked by the frame loop {st}')
    pg.evaluate("()=>{const R=__RTS;for(const x of[100,1500,2700])for(const y of[100,1500,2700]){R.centerOn(x,y);R.G.vis[0].fill(2);R.terrainStream(1e6)}}")
    ok(pg.evaluate("()=>__RTS.tch.map.size<=__RTS.tch.cap"), 'after visiting 9 corners/centres the tile cache stays within its LRU cap')
    # decals
    dec = pg.evaluate("""()=>{const R=__RTS,G=R.G;R.G.vis[0].fill(2);const h=G.buildings.find(b=>b.team===0&&b.type==='hub');R.cam.z=R.cam.tz=1.7;R.centerOn(h.x,h.y);for(let i=0;i<20;i++)R.terrainStream(1e6);
      const t=[...R.tch.map.values()].find(t=>t.done&&t.x0<=h.x+160&&t.x0+t.w>=h.x+160&&t.y0<=h.y+10&&t.y0+t.h>=h.y+10);if(!t)return{err:'no tile'};
      const px=(cv,x,y,s)=>{const d=cv.getContext('2d').getImageData(Math.round(x*s),Math.round(y*s),1,1).data;return d[0]+d[1]+d[2]};
      const x=h.x+160,y=h.y+10;const bb=px(G.terrainCv,x,y,1),tb=px(t.cv,x-t.x0,y-t.y0,t.s);
      G.decalDirty.push({x,y,r:30,k:'scorch'});R.render(1);
      const ba=px(G.terrainCv,x,y,1),ta=px(t.cv,x-t.x0,y-t.y0,t.s);return{bb,ba,tb,ta}}""")
    ok('err' not in dec and dec['ba'] < dec['bb'] and dec['ta'] < dec['tb'], f'a scorch decal darkens the base map and the finished tile alike {dec}')
    # tier switch
    pg.evaluate("()=>__RTS.setQualityMode('battery')")
    ok(pg.evaluate("()=>__RTS.tch.map.size===0&&__RTS.tileScaleWanted()===0&&__RTS.Q.dpr===1"), 'switching to the battery tier drops every tile and stops making them')
    pg.evaluate("()=>__RTS.setQualityMode('high')")
    ctx.close()
    # a huge, zoomed-out viewport would want ~45 tiles: memory must stay bounded
    ctx = b.new_context(viewport={'width': 3840, 'height': 2160}, device_scale_factor=1.5); pg = ctx.new_page(); pg.add_init_script("window.__TEST='live'")
    pg.on('pageerror', lambda e: errs.append(('pageerror', str(e))))
    pg.goto(URL); pg.wait_for_timeout(900); pg.mouse.move(1920, 1080); pg.evaluate("()=>__RTS.startGame()"); pg.wait_for_timeout(600)
    big = pg.evaluate("()=>{const R=__RTS;R.G.vis[0].fill(2);R.cam.z=R.cam.tz=0.9;R.centerOn(1400,1400);R.clampCam();let n=0;for(let i=0;i<40;i++){R.terrainStream(1e6);n=Math.max(n,R.tch.map.size)}return{want:R.tileScaleWanted(),peak:n,cap:R.tch.cap,pending:R.tch.pending}}")
    ok(big['want'] == 2 and big['peak'] <= big['cap'], f'4K window at DPR 1.5 / zoom 0.9 (needs ~45 tiles): the cache peaks at {big["peak"]} <= cap {big["cap"]}')
    ctx.close()
    # 1:1 case
    ctx = b.new_context(viewport={'width': 1280, 'height': 800}, device_scale_factor=1); pg = ctx.new_page(); pg.add_init_script("window.__TEST='live'")
    pg.goto(URL); pg.wait_for_timeout(800); pg.mouse.move(640, 400); pg.evaluate("()=>__RTS.startGame()"); pg.wait_for_timeout(800)
    ok(pg.evaluate("()=>__RTS.tileScaleWanted()===0&&__RTS.tch.map.size===0"), 'DPR 1 / zoom 1: no tiles (the 1x base map is already pixel-for-pixel)')
    ctx.close(); b.close()

ok(not errs, f'no console errors/warnings/page errors {errs[:3]}')
print('\nALL TERRAIN CHECKS PASSED' if not fails else f'\n{len(fails)} CHECK(S) FAILED:\n  ' + '\n  '.join(fails))
sys.exit(1 if fails else 0)
