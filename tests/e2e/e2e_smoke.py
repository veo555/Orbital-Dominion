"""Browser regression gate (Playwright + Chromium). Exit code != 0 on failure.
   python3 tests/e2e/e2e_smoke.py            (about 40 s; needs `pip install playwright` and a Chromium)
Asserts: boots with no console errors / page errors, makes ZERO network requests, starts a match, Autopilot plays 150 game-seconds,
the Swarm panel + tabs + natural-language box work, hotkeys do not leak out of the command box, settings toggle the master switch,
and the top bar is not clipped at common desktop widths."""
import os, sys, pathlib
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parents[2]
URL = os.environ.get('OD_URL') or (ROOT / 'dist' / 'orbital_dominion_v3.html').as_uri()
fails = []; errs = []; reqs = []
def ok(c, m):
    print(('ok    ' if c else 'FAIL  ') + m, flush=True)
    if not c: fails.append(m)

with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
    pg = b.new_page(viewport={'width': 1366, 'height': 800})
    pg.on('pageerror', lambda e: errs.append(('pageerror', str(e))))
    pg.on('console', lambda m: errs.append((m.type, m.text)) if m.type in ('error', 'warning') else None)
    pg.on('request', lambda r: reqs.append(r.url[:80]) if not r.url.startswith(('file:', 'data:', 'blob:')) else None)
    pg.add_init_script("window.__TEST='live'")
    pg.goto(URL); pg.wait_for_timeout(1200)
    ok(pg.evaluate("()=>!document.getElementById('menu').classList.contains('hidden')"), 'main menu visible')
    pg.click('#bStart'); pg.wait_for_timeout(1500)
    ok(pg.evaluate("()=>!!(window.__RTS&&__RTS.G&&__RTS.G.units.length>0)"), 'match started, units exist')

    # Autopilot through the panel
    pg.keyboard.press('k'); pg.wait_for_timeout(300)
    ok(pg.evaluate("()=>!document.getElementById('swPanel').classList.contains('hidden')"), 'K opens the Swarm panel')
    pg.click('[data-act="preset:autopilot"]'); pg.wait_for_timeout(150)
    ok(pg.evaluate("()=>__RTS.G.sw.on===true"), 'Autopilot preset turns the swarm on')
    pg.evaluate("()=>{const R=__RTS;for(let i=0;i<30*150;i++)R.step();}"); pg.wait_for_timeout(300)
    st = pg.evaluate("()=>({t:__RTS.G.time|0,agents:__RTS.G.sw.agents.length,army:__RTS.G.units.filter(u=>!u.dead&&u.team===0&&!u.def.worker&&u.def.dmg).length,b:__RTS.G.buildings.filter(x=>!x.dead&&x.team===0).length})")
    ok(st['t'] >= 150 and st['agents'] >= 8 and st['b'] >= 3, f'Autopilot played 150 s: {st}')

    for tab in ['ro', 'mk', 'lg', 'ov']:
        sel = f'[data-act="tab:{tab}"]'
        ok(bool(pg.query_selector(sel)), f'tab {tab} present')
        # click through the selector, not a held element handle: the panel re-renders (innerHTML) a few times per second and a
        # handle taken a moment earlier can be detached by then ("Element is not attached to the DOM"); the selector is re-resolved
        # and retried by Playwright. (The unmodified v3 build failed this step in 2 of 6 runs with the handle version.)
        pg.click(sel); pg.wait_for_timeout(200)
        ok(pg.evaluate("()=>document.getElementById('swBody').innerText.length")>20, f'tab {tab} renders content')
    pg.fill('#swIn', 'keep 14 miners'); pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
    ok('miner' in pg.evaluate("()=>document.getElementById('swOut').innerText").lower(), 'natural-language command answered in the panel')
    pg.click('#swIn'); pg.keyboard.type('kjpmt '); pg.wait_for_timeout(200)
    ok(pg.evaluate("()=>[__RTS.ui.panel,__RTS.G.paused]") == ['swarm', False], 'hotkey letters typed in the command box do not leak to the game')
    pg.fill('#swIn', ''); pg.keyboard.press('Escape'); pg.wait_for_timeout(150)   # fill() focuses the box; Esc blurs it
    ok(pg.evaluate("()=>document.activeElement&&document.activeElement.id")!='swIn', 'Esc leaves the command box')

    # master switch
    pg.keyboard.press('j'); pg.wait_for_timeout(300)
    ok(pg.evaluate("()=>__RTS.G.sw.on")==False, 'J switches the swarm AI off')
    pg.keyboard.press('j'); pg.wait_for_timeout(300)
    ok(pg.evaluate("()=>__RTS.G.sw.on")==True, 'J switches it on again')

    # pause / escape semantics
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    ok(pg.evaluate("()=>[__RTS.ui.panel,__RTS.G.paused]")[1] == False, 'first Esc closes the panel, does not pause')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    ok(pg.evaluate("()=>__RTS.G.paused")==True, 'second Esc pauses')
    pg.click('#bResume'); pg.wait_for_timeout(200)

    # top bar not clipped at common widths
    for (w, h) in [(1366, 768), (1280, 720), (1100, 700), (1024, 640)]:
        q = b.new_page(viewport={'width': w, 'height': h}); q.add_init_script("window.__TEST='live'")
        q.goto(URL); q.wait_for_timeout(500); q.click('#bStart'); q.wait_for_timeout(500)
        m = q.evaluate("()=>{const t=document.getElementById('top');return {over:t.scrollWidth>t.clientWidth,menu:document.getElementById('bMenu').getBoundingClientRect().right<=innerWidth+1}}")
        ok(not m['over'] and m['menu'], f'top bar fits at {w}x{h}')
        q.close()

    ok(not errs, f'no console errors/warnings/page errors {errs[:3]}')
    ok(not reqs, f'zero network requests {reqs[:3]}')
    b.close()
print('\n' + (f'{len(fails)} FAILURE(S)' if fails else 'ALL E2E CHECKS PASSED'))
sys.exit(1 if fails else 0)
