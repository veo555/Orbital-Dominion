"""Spectator mode + replay gate (Playwright + Chromium). Exit code != 0 on failure.
   python3 tests/e2e/e2e_spectate.py       (about 1 min)

Asserts: the menu opens "Watch agents"; bad codes / seeds are refused with a message; a valid code starts a match with that code; the panel fills
(stats, why lines, graph pixels, key moments); pause / speed / follow / fold / exit work with mouse and keyboard; a #watch=CODE link opens the match;
two runs of one code give the same state hash in the browser even when Math.random is replaced; a phone-sized touch layout keeps the panel inside
the screen with >= 40 px buttons; the result banner appears when a side wins; zero network requests and no page errors.
Limits: Chromium software rendering; what a person learns from watching is not measured here."""
import os, sys, pathlib
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parents[2]
URL = os.environ.get('OD_URL') or (ROOT / 'dist' / 'orbital_dominion_v4.html').as_uri()
CODE = 'OD1-424242-aurora-obsidian-master-hard-m'
fails = []; errs = []; reqs = []
def ok(c, m):
    print(('ok    ' if c else 'FAIL  ') + m, flush=True)
    if not c: fails.append(m)
def page(b, **kw):
    ctx = b.new_context(**kw); pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append(('pageerror', str(e))))
    pg.on('console', lambda m: errs.append((m.type, m.text)) if m.type == 'error' else None)
    pg.on('request', lambda r: reqs.append(r.url) if not r.url.startswith(('file:', 'data:', 'blob:')) else None)
    pg.add_init_script("window.__TEST='live'")
    return ctx, pg
def vis(pg, sel): return pg.evaluate("(s)=>{const e=document.querySelector(s);return !!e&&!e.classList.contains('hidden')}", sel)
def txt(pg, sel): return pg.evaluate("(s)=>document.querySelector(s).textContent", sel)

with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
    ctx, pg = page(b, viewport={'width': 1366, 'height': 800})
    pg.goto(URL); pg.wait_for_timeout(900)
    pg.mouse.move(600, 400)
    ok(vis(pg, '#bWatch'), 'main menu offers "Watch agents"')
    pg.click('#bWatch'); pg.wait_for_timeout(150)
    ok(vis(pg, '#watchMenu') and not vis(pg, '#menu'), 'the Watch dialog opens')
    # refusals
    pg.fill('#wmCode', 'OD1-1-aurora-aurora-hard-hard-0'); pg.click('#wmGo'); pg.wait_for_timeout(100)
    ok(vis(pg, '#wmErr') and not vis(pg, '#spec'), 'a bad replay code is refused with a message (' + txt(pg, '#wmErr')[:40] + ')')
    pg.fill('#wmCode', ''); pg.select_option('#wmFb', pg.evaluate("()=>document.getElementById('wmFa').value")); pg.click('#wmGo'); pg.wait_for_timeout(100)
    ok(vis(pg, '#wmErr') and 'different' in txt(pg, '#wmErr'), 'the same faction on both sides is refused')
    pg.select_option('#wmFb', 'obsidian'); pg.select_option('#wmFa', 'aurora'); pg.fill('#wmSeed', 'abc'); pg.click('#wmGo'); pg.wait_for_timeout(100)
    ok(vis(pg, '#wmErr') and 'seed' in txt(pg, '#wmErr'), 'a non-numeric seed is refused')
    # start from a code
    pg.fill('#wmSeed', ''); pg.fill('#wmCode', CODE); pg.click('#wmGo'); pg.wait_for_timeout(500)
    ok(vis(pg, '#spec') and not vis(pg, '#watchMenu') and pg.evaluate("()=>__RTS.ui.spec===true&&__RTS.ui.demo===true"), 'a valid code starts the match with the spectator panel')
    ok(txt(pg, '#spCode') == CODE and pg.evaluate("()=>__RTS.replayCode()") == CODE, 'the panel shows the same code the game recorded')
    ok(pg.evaluate("()=>location.hash") == '#watch=' + CODE, 'the address bar carries #watch=<code>')
    ok(pg.evaluate("()=>!document.getElementById('hud')||document.getElementById('hud').classList.contains('hidden')"), 'the player HUD is hidden (nobody to command)')
    # run the sim forward quickly, then let the panel refresh
    for _ in range(8):
        pg.evaluate("()=>{const R=__RTS;for(let i=0;i<225;i++)R.step();}"); pg.wait_for_timeout(450)
    ok(pg.evaluate("()=>__RTS.SP.hist.length")>=5, 'the history graph has samples (%d)' % pg.evaluate("()=>__RTS.SP.hist.length"))
    rows = pg.evaluate("""()=>{const c=document.getElementById('spGraph'),g=c.getContext('2d'),d=g.getImageData(0,0,c.width,c.height).data;let r=0;for(let y=0;y<c.height;y++){let n=0;for(let x=0;x<c.width;x++)if(d[(y*c.width+x)*4+3]>0)n++;if(n>0)r++;}return r}""")
    ok(rows >= 8, 'the graph canvas holds curves, not just the 50%% line (%d painted rows)' % rows)
    ok(txt(pg, '#spT') != '0:00' and ':' in txt(pg, '#spT'), 'the match clock runs (' + txt(pg, '#spT') + ')')
    ok(all(txt(pg, '#spa%d' % i).strip() != '' and txt(pg, '#spb%d' % i).strip() != '' for i in range(6)), 'the stats table has numbers for both sides')
    ok(txt(pg, '#spWhyA').startswith('A: ') and len(txt(pg, '#spWhyA')) > 20 and txt(pg, '#spWhyB').startswith('B: '), 'each agent has a one-line "why": ' + txt(pg, '#spWhyA')[:70])
    ok('loses a base' not in txt(pg, '#spEv') and pg.evaluate("()=>document.querySelectorAll('#spEv li').length")>=1, 'key moments are listed, and none is a false "loses a base" at the start (' + txt(pg, '#spEv')[:60] + ')')
    # controls
    pg.click('#spPause'); pg.wait_for_timeout(100)
    ok(pg.evaluate("()=>__RTS.G.paused===true") and txt(pg, '#spPause') == 'Play', 'pause button pauses')
    t0 = pg.evaluate("()=>__RTS.G.tick"); pg.wait_for_timeout(400)
    ok(pg.evaluate("()=>__RTS.G.tick") == t0, 'while paused the simulation does not advance')
    pg.click('[data-sp="4"]'); pg.wait_for_timeout(100)
    ok(pg.evaluate("()=>__RTS.G.speed===4&&!__RTS.G.paused"), 'the 4x button sets speed and resumes')
    pg.keyboard.press('2'); ok(pg.evaluate("()=>__RTS.G.speed")==2, 'keyboard 2 sets speed 2x')
    pg.keyboard.press(' '); ok(pg.evaluate("()=>__RTS.G.paused"), 'Space pauses'); pg.keyboard.press(' ')
    pg.keyboard.press('f'); ok(pg.evaluate("()=>__RTS.SP.follow")==False, 'F switches to free camera')
    cx0 = pg.evaluate("()=>__RTS.cam.x")
    moved = 0
    for key in ('ArrowRight', 'ArrowLeft'):   # the camera may sit at a map edge: one of the two directions must move it
        x1 = pg.evaluate("()=>__RTS.cam.x"); pg.keyboard.down(key); pg.wait_for_timeout(500); pg.keyboard.up(key)
        moved = max(moved, abs(pg.evaluate("()=>__RTS.cam.x") - x1))
    ok(moved > 20, 'free camera: arrow keys pan (%d px)' % moved)
    x1 = pg.evaluate("()=>__RTS.cam.x") + 0 * cx0; y1 = pg.evaluate("()=>__RTS.cam.y")
    pg.mouse.move(300, 300); pg.mouse.down(); pg.mouse.move(380, 330, steps=4); pg.mouse.up()
    ok(abs(pg.evaluate("()=>__RTS.cam.x") - x1) + abs(pg.evaluate("()=>__RTS.cam.y") - y1) > 5, 'free camera: dragging pans')
    pg.click('#spFollow'); ok(pg.evaluate("()=>__RTS.SP.follow"), 'the Follow button turns following back on')
    pg.click('#spFold'); ok(pg.evaluate("()=>document.getElementById('spBody').offsetParent===null"), 'the panel folds'); pg.click('#spFold')
    # result banner
    pg.evaluate("()=>{__RTS.G.over='defeat';__RTS.specRefresh(true)}")
    ok(vis(pg, '#spRes') and 'Side B wins' in txt(pg, '#spRes'), 'a finished match shows the winner (' + txt(pg, '#spRes') + ')')
    # exit
    pg.keyboard.press('Escape'); pg.wait_for_timeout(500)
    ok(not vis(pg, '#spec') and vis(pg, '#menu') and pg.evaluate("()=>!__RTS.ui.spec&&location.hash===''"), 'Escape leaves spectator mode, back to the menu, link cleared')
    # determinism in the browser, with Math.random replaced two different ways
    h = []
    for k, seed in enumerate((1, 99991)):
        pg.evaluate("(s)=>{let a=s;Math.random=()=>{a=(a*1664525+1013904223)>>>0;return a/4294967296}}", seed)
        h.append(pg.evaluate("(c)=>{const R=__RTS;R.specStart(R.replayParse(c));R.G.paused=true;for(let i=0;i<2400;i++)R.step();return R.replayHash()}", CODE))   # one evaluate: the live loop cannot add ticks in between
    ok(h[0] == h[1] and h[0] != 0, 'the same code reaches the same state hash in the browser under two different Math.random streams (%s)' % h[0])
    ok(pg.evaluate("()=>JSON.stringify(__RTS.G.rcp.map(c=>c[0]))") == '[300,600,900,1200,1500,1800,2100,2400]', 'checkpoints every 10 s')
    ctx.close()

    # deep link
    ctx, pg = page(b, viewport={'width': 1366, 'height': 800})
    pg.goto(URL + '#watch=' + CODE); pg.wait_for_timeout(1200)
    ok(vis(pg, '#spec') and pg.evaluate("()=>__RTS.replayCode()") == CODE, 'opening the page with #watch=<code> starts that match')
    ctx.close()
    ctx, pg = page(b, viewport={'width': 1366, 'height': 800})
    pg.goto(URL + '#watch=nonsense'); pg.wait_for_timeout(800)
    ok(not vis(pg, '#spec') and vis(pg, '#menu'), 'an invalid #watch link falls back to the normal menu')
    ctx.close()

    # phone, landscape, touch
    ctx, pg = page(b, viewport={'width': 844, 'height': 390}, has_touch=True, is_mobile=True, device_scale_factor=2)
    pg.goto(URL); pg.wait_for_timeout(900)
    pg.tap('#bWatch'); pg.wait_for_timeout(200); pg.fill('#wmCode', CODE); pg.tap('#wmGo'); pg.wait_for_timeout(700)
    ok(vis(pg, '#spec'), 'phone: the match starts by tap')
    r = pg.evaluate("()=>{const e=document.getElementById('spec').getBoundingClientRect();return[e.left,e.top,e.right,e.bottom,innerWidth,innerHeight]}")
    ok(r[0] >= 0 and r[1] >= 0 and r[2] <= r[4] + 0.5 and r[3] <= r[5] + 0.5, 'phone landscape: the panel stays inside the screen %s' % [round(x) for x in r])
    small = pg.evaluate("()=>[...document.querySelectorAll('#spec button')].filter(b=>b.offsetParent&&(b.getBoundingClientRect().height<39.5||b.getBoundingClientRect().width<39.5)).map(b=>b.id||b.textContent)")
    ok(small == [], 'phone: all visible panel buttons are at least 40 px (%s)' % small)
    pg.tap('#spPause'); ok(pg.evaluate("()=>__RTS.G.paused"), 'phone: tap pauses')
    ctx.close()
    ctx, pg = page(b, viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True, device_scale_factor=2)
    pg.goto(URL); pg.wait_for_timeout(900)
    pg.tap('#bWatch'); pg.wait_for_timeout(200); pg.fill('#wmCode', CODE); pg.tap('#wmGo'); pg.wait_for_timeout(700)
    r = pg.evaluate("()=>{const e=document.getElementById('spec').getBoundingClientRect();return[e.left,e.top,e.right,e.bottom,innerWidth,innerHeight]}")
    ok(r[0] >= 0 and r[1] >= 0 and r[2] <= r[4] + 0.5 and r[3] <= r[5] + 0.5, 'phone portrait: the panel stays inside the screen %s' % [round(x) for x in r])
    ctx.close()
    b.close()

ok(reqs == [], 'zero network requests %s' % reqs[:3])
ok(errs == [], 'no page errors %s' % errs[:3])
print('\n%s' % ('ALL SPECTATE CHECKS PASSED' if not fails else '%d SPECTATE CHECK(S) FAILED' % len(fails)))
sys.exit(1 if fails else 0)
