"""App-lifecycle gate (Playwright + Chromium). Exit code != 0 on failure.
   python3 tests/e2e/e2e_platform.py       (about 25 s)

Asserts on behaviour that makes the game feel like an app on a phone or in an installed PWA:
  * backgrounding the page auto-pauses a running match and shows the pause menu (and does nothing in the menu)
  * in an installed (standalone) app the system Back gesture opens the pause menu instead of leaving the match
  * an iPhone-class user agent gets the "Install on iPhone" instructions; a desktop tab gets Fullscreen, an installed app does not
  * Settings: quality choice persists across reloads; Reduce-motion toggles the html class
Limits: Chromium with an iPhone user-agent string; real iOS Safari behaviour (Add to Home Screen, audio session) is not tested here."""
import os, sys, pathlib
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parents[2]
URL = os.environ.get('OD_URL') or (ROOT / 'dist' / 'orbital_dominion_v4.html').as_uri()
fails = []; errs = []
def ok(c, m):
    print(('ok    ' if c else 'FAIL  ') + m, flush=True)
    if not c: fails.append(m)

IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

def page(b, **kw):
    ctx = b.new_context(**kw); pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append(('pageerror', str(e))))
    pg.on('console', lambda m: errs.append((m.type, m.text)) if m.type in ('error', 'warning') else None)
    pg.add_init_script("window.__TEST='live'")
    return ctx, pg

def hide_page(pg, hidden):
    pg.evaluate("(h)=>{Object.defineProperty(document,'hidden',{get:()=>h,configurable:true});document.dispatchEvent(new Event('visibilitychange'))}", hidden)

with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])

    # ---- desktop tab ------------------------------------------------------------------------------------
    ctx, pg = page(b, viewport={'width': 1366, 'height': 800})
    pg.goto(URL); pg.wait_for_timeout(900)
    ok(pg.evaluate("()=>!document.getElementById('bFull').classList.contains('hidden')"), 'desktop tab: Fullscreen button is offered')
    ok(pg.evaluate("()=>document.getElementById('bInstall').classList.contains('hidden')"), 'desktop file/tab: no Install button without an install prompt')
    hide_page(pg, True); pg.wait_for_timeout(200)
    ok(pg.evaluate("()=>!__RTS.G.paused"), 'hiding the page in the menu does not pause the demo')
    hide_page(pg, False)
    pg.evaluate("()=>__RTS.startGame()"); pg.wait_for_timeout(600)
    ok(pg.evaluate("()=>!__RTS.G.paused&&__RTS.ui.running"), 'match running')
    hide_page(pg, True); pg.wait_for_timeout(250)
    ok(pg.evaluate("()=>__RTS.G.paused===true&&!document.getElementById('pauseMenu').classList.contains('hidden')"), 'backgrounding the page auto-pauses the match and shows the pause menu')
    hide_page(pg, False); pg.wait_for_timeout(200)
    ok(pg.evaluate("()=>__RTS.G.paused===true"), 'returning to the page leaves the match paused (the player resumes deliberately)')
    pg.evaluate("()=>__RTS.togglePause()"); pg.wait_for_timeout(200)
    ok(pg.evaluate("()=>__RTS.G.paused===false"), 'Resume works')
    # settings persistence
    pg.evaluate("()=>{__RTS.setQualityMode('battery')}"); pg.evaluate("()=>{const e=document.getElementById('set_rm');e.checked=true;e.dispatchEvent(new Event('change'))}")
    ok(pg.evaluate("()=>document.documentElement.classList.contains('rm')"), 'Reduce motion toggles the html class')
    pg.reload(); pg.wait_for_timeout(900)
    ok(pg.evaluate("()=>__RTS.SET.quality==='battery'&&__RTS.Q.tier==='battery'&&!__RTS.Q.auto"), 'quality choice survives a reload')
    ok(pg.evaluate("()=>document.documentElement.classList.contains('rm')"), 'reduce-motion survives a reload')
    ctx.close()

    # ---- installed (standalone) app: Back = pause ---------------------------------------------------------------
    ctx, pg = page(b, viewport={'width': 844, 'height': 390}, device_scale_factor=3, is_mobile=True, has_touch=True)
    pg.add_init_script("Object.defineProperty(navigator,'standalone',{get:()=>true})")
    pg.goto(URL); pg.wait_for_timeout(900)
    ok(pg.evaluate("()=>document.getElementById('bFull').classList.contains('hidden')"), 'installed app: no Fullscreen button (already full-screen)')
    pg.evaluate("()=>__RTS.startGame()"); pg.wait_for_timeout(500)
    n0 = pg.evaluate("()=>history.length")
    ok(pg.evaluate("()=>!!history.state&&history.state.od===1"), 'installed app: a history entry guards the match')
    pg.evaluate("()=>history.back()"); pg.wait_for_timeout(400)
    ok(pg.evaluate("()=>__RTS.G.paused===true&&!document.getElementById('pauseMenu').classList.contains('hidden')"), 'installed app: system Back opens the pause menu instead of leaving')
    ok(pg.evaluate("()=>!!history.state&&history.state.od===1"), '...and the guard entry is restored for the next Back')
    ctx.close()

    # ---- iPhone user agent: install instructions ---------------------------------------------------------------------------
    ctx, pg = page(b, viewport={'width': 390, 'height': 844}, device_scale_factor=3, is_mobile=True, has_touch=True, user_agent=IPHONE_UA)
    pg.goto(URL); pg.wait_for_timeout(900)
    ok(pg.evaluate("()=>__RTS&&true") , 'iPhone UA: game boots')
    web = pg.evaluate("()=>/^https?:$/.test(location.protocol)")
    if web:
        ok(pg.evaluate("()=>!document.getElementById('bInstall').classList.contains('hidden')"), 'iPhone UA over http(s): Install button shows')
        pg.click('#bInstall'); pg.wait_for_timeout(250)
        ok(pg.evaluate("()=>!document.getElementById('iosHelp').classList.contains('hidden')"), 'Install opens the Add-to-Home-Screen instructions')
    else:
        print('      (file:// page: the iPhone install button is intentionally hidden; run against an http(s) URL with OD_URL to test it)')
    ctx.close()
    b.close()

ok(not errs, f'no console errors/warnings/page errors {errs[:3]}')
print('\nALL PLATFORM CHECKS PASSED' if not fails else f'\n{len(fails)} CHECK(S) FAILED:\n  ' + '\n  '.join(fails))
sys.exit(1 if fails else 0)
