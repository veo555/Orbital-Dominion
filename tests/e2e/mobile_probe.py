"""Informational probe (not a pass/fail gate): how does the CURRENT build behave on phone-sized viewports with touch?
   Writes screenshots to tests/out/ and prints findings. Re-run after the touch/mobile work to see the difference."""
import os, pathlib
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parents[2]
URL = os.environ.get('OD_URL') or (ROOT / 'dist' / 'orbital_dominion_v4.html').as_uri()
OUT = ROOT / 'tests' / 'out'; OUT.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])
    for name, w, h, dpr in [('phone_landscape_844x390', 844, 390, 3), ('phone_landscape_932x430', 932, 430, 3), ('tablet_landscape_1180x820', 1180, 820, 2), ('phone_portrait_390x844', 390, 844, 3)]:
        ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=dpr, has_touch=True, is_mobile=True)
        pg = ctx.new_page(); pg.add_init_script("window.__TEST='live'")
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(URL); pg.wait_for_timeout(800)
        pg.screenshot(path=str(OUT / f'mobile_{name}_menu.png'))
        try:
            pg.tap('#bStart', timeout=3000)
        except Exception as e:
            print(name, 'start button tap FAILED:', str(e)[:80]); ctx.close(); continue
        pg.wait_for_timeout(1200)
        pg.screenshot(path=str(OUT / f'mobile_{name}_game.png'))
        info = pg.evaluate("""()=>{const r=id=>{const e=document.getElementById(id);if(!e)return null;const b=e.getBoundingClientRect();return [Math.round(b.left),Math.round(b.top),Math.round(b.width),Math.round(b.height)]};
          return {inner:[innerWidth,innerHeight],bottomBar:r('bottom'),cmdCard:r('cmd'),minimap:r('minimap')||r('mm'),canvasVisiblePx:Math.max(0,innerHeight-(r('bottom')?r('bottom')[3]:0)-(r('top')?r('top')[3]:0))}}""")
        # does a tap on the map select anything / does a one-finger drag pan or box-select? (current build: mouse events only)
        before = pg.evaluate("()=>[__RTS.cam.x,__RTS.cam.y]")
        pg.touchscreen.tap(w // 2, h // 2); pg.wait_for_timeout(150)
        sel_after_tap = pg.evaluate("()=>__RTS.ui.sel.length")
        print(f'{name}: layout {info}; selection after a tap on the map centre: {sel_after_tap}; page errors: {errs}')
        ctx.close()
    b.close()
