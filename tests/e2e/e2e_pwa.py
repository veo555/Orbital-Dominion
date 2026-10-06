"""PWA gate (Playwright + Chromium against a real local HTTP server). Exit code != 0 on failure.
   python3 tests/e2e/e2e_pwa.py            (about 35 s; builds nothing -- run `python3 build.py` first)

Serves dist/pwa over http://127.0.0.1:<port> and checks what an installed web app needs:
  * the manifest (name, scope, display, 192/512/maskable icons) and that every precached file exists
  * Chrome's own installability verdict (DevTools protocol Page.getInstallabilityErrors == [])
  * the service worker registers, activates and precaches the app shell
  * RELOAD WITH THE NETWORK OFF boots the game, and a match starts and runs offline
  * an updated service worker waits, shows the "new version ready" banner, and only reloads when the player taps it
  * an iPhone user-agent over http(s) gets the Install button and the Add-to-Home-Screen instructions
  * no console errors, and no request ever leaves the origin
Limits: Chromium on Linux. It does not test Safari/WebKit, a real install, or HTTP caching headers (see dist/pwa/_headers)."""
import json, os, pathlib, sys, threading, functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parents[2]
PWA = ROOT / 'dist' / 'pwa'
fails = []; errs = []; offsite = []
def ok(c, m):
    print(('ok    ' if c else 'FAIL  ') + m, flush=True)
    if not c: fails.append(m)

STATE = {'sw_version': 0}
class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=str(PWA), **k)
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache'); super().end_headers()
    def do_GET(self):
        if self.path.split('?')[0] == '/sw.js' and STATE['sw_version'] > 0:   # simulate a deployment of a new build
            body = (PWA / 'sw.js').read_text(encoding='utf-8')
            import re
            body = re.sub(r"const CACHE = 'od-[0-9a-f]+'", f"const CACHE = 'od-updated{STATE['sw_version']}'", body).encode()
            self.send_response(200); self.send_header('Content-Type', 'text/javascript'); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body); return
        super().do_GET()

srv = ThreadingHTTPServer(('127.0.0.1', 0), H); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f'http://127.0.0.1:{port}/'
IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

def hook(pg):
    pg.on('pageerror', lambda e: errs.append(('pageerror', str(e))))
    pg.on('console', lambda m: errs.append((m.type, m.text)) if m.type in ('error', 'warning') else None)
    pg.on('request', lambda r: offsite.append(r.url[:90]) if not r.url.startswith((BASE, 'data:', 'blob:')) else None)
    pg.add_init_script("window.__TEST='live'")

with sync_playwright() as p:
    # channel='chromium' = the full Chromium build: the default headless shell has no installability service and returns [] for ANY manifest
    # (verified with a deliberately broken one; the full build reports manifest-missing-suitable-icon for it)
    b = p.chromium.launch(channel='chromium', args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
    ctx = b.new_context(viewport={'width': 1366, 'height': 800}); pg = ctx.new_page(); hook(pg)

    # ---- manifest ---------------------------------------------------------------------------------------------
    pg.goto(BASE); pg.wait_for_timeout(1200)
    href = pg.evaluate("()=>{const l=document.querySelector('link[rel=manifest]');return l?l.getAttribute('href'):null}")
    ok(href == 'manifest.webmanifest', f'index.html links the manifest ({href})')
    m = json.loads((PWA / 'manifest.webmanifest').read_text())
    ok(m['display'] == 'standalone' and m['scope'] == './' and m['start_url'] == './' and m['name'] == 'Orbital Dominion', 'manifest: name, scope, start_url, display')
    purposes = {(i['sizes'], i.get('purpose')) for i in m['icons']}
    ok({('192x192', 'any'), ('512x512', 'any'), ('512x512', 'maskable')} <= purposes, f'manifest: 192 + 512 + maskable icons {sorted(purposes)}')
    ok(all((PWA / i['src']).is_file() for i in m['icons']), 'manifest: every icon file exists')
    sw = (PWA / 'sw.js').read_text()
    pre = json.loads(sw.split('const PRECACHE = ')[1].split(';')[0])
    ok(all((PWA / u).exists() for u in pre if u != './'), f'service worker: every precached file exists ({len(pre)} entries)')
    ok(pg.evaluate("()=>!!document.querySelector('meta[name=theme-color]')&&!!document.querySelector('link[rel=apple-touch-icon]')"), 'theme-color and apple-touch-icon present')

    # ---- Chrome's installability verdict -----------------------------------------------------------------------
    cdp = ctx.new_cdp_session(pg); cdp.send('Page.enable')
    inst = [e.get('errorId') for e in cdp.send('Page.getInstallabilityErrors').get('installabilityErrors', [])]
    inst = [e for e in inst if e != 'in-incognito']   # Playwright contexts are incognito-style; that is not a defect of the page
    ok(inst == [], f"Chrome reports the page installable (errors: {inst})")

    # ---- service worker ------------------------------------------------------------------------------------------
    sw_state = pg.evaluate("async()=>{const r=await navigator.serviceWorker.ready;await new Promise(res=>{if(r.active&&r.active.state==='activated')res();else r.active.addEventListener('statechange',()=>r.active.state==='activated'&&res())});return r.active.state}")
    ok(sw_state == 'activated', 'service worker registered and activated')
    cached = pg.evaluate("async()=>{const ks=await caches.keys();const c=await caches.open(ks[0]);return{ks,n:(await c.keys()).length}}")
    ok(cached['n'] >= len(pre) - 1 and cached['ks'][0].startswith('od-'), f"app shell precached: {cached['n']} entries in {cached['ks']}")
    pg.evaluate("()=>navigator.serviceWorker.controller||new Promise(r=>navigator.serviceWorker.addEventListener('controllerchange',r))"); pg.wait_for_timeout(300)

    # ---- offline -------------------------------------------------------------------------------------------------------
    pg.reload(); pg.wait_for_timeout(800)   # page is now controlled
    ctx.set_offline(True)
    pg.reload(); pg.wait_for_timeout(1500)
    ok(pg.evaluate("()=>!document.getElementById('menu').classList.contains('hidden')&&!!window.__RTS"), 'OFFLINE reload boots the game menu from the service-worker cache')
    pg.evaluate("()=>__RTS.startGame()"); pg.wait_for_timeout(700)
    pg.evaluate("()=>{const R=__RTS;for(let i=0;i<30*20;i++)R.step();}")
    ok(pg.evaluate("()=>__RTS.G.time>=20&&__RTS.G.units.length>0"), 'OFFLINE: a match starts and runs')
    ctx.set_offline(False)

    # ---- update flow -----------------------------------------------------------------------------------------------------
    STATE['sw_version'] = 1
    pg.evaluate("()=>__RTS.toMenu()"); pg.wait_for_timeout(300)
    pg.evaluate("async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update()}"); pg.wait_for_timeout(1500)
    ok(pg.evaluate("()=>{const b=document.getElementById('updBanner');return !!b&&!b.classList.contains('hidden')}"), 'a new service worker installs and WAITS: the update banner appears')
    ok(pg.evaluate("async()=>{const r=await navigator.serviceWorker.getRegistration();return !!r.waiting}"), '...the new worker is waiting (it has not replaced the running one)')
    pg.evaluate("()=>{window.__stay=1}")
    pg.click('#updBanner'); pg.wait_for_timeout(2500)
    ok(pg.evaluate("()=>window.__stay===undefined"), 'tapping the banner activates the update and reloads the page')
    ok(pg.evaluate("async()=>(await caches.keys()).some(k=>k.startsWith('od-updated'))&&!(await caches.keys()).some(k=>/^od-[0-9a-f]{10}$/.test(k))"), 'the old cache is deleted, the new one is in use')
    ctx.close()

    # ---- iPhone over http ------------------------------------------------------------------------------------------------------
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=3, is_mobile=True, has_touch=True, user_agent=IPHONE_UA)
    pg = ctx.new_page(); hook(pg); STATE['sw_version'] = 0
    pg.goto(BASE); pg.wait_for_timeout(1200)
    ok(pg.evaluate("()=>!document.getElementById('bInstall').classList.contains('hidden')"), 'iPhone UA over http: the Install button is shown')
    pg.click('#bInstall'); pg.wait_for_timeout(300)
    ok(pg.evaluate("()=>!document.getElementById('iosHelp').classList.contains('hidden')&&document.getElementById('iosHelp').innerText.includes('Add to Home Screen')"), 'Install opens the Add-to-Home-Screen instructions')
    ctx.close(); b.close()

ok(not errs, f'no console errors/warnings/page errors {errs[:3]}')
ok(not offsite, f'no request left the origin {offsite[:3]}')
srv.shutdown()
print('\nALL PWA CHECKS PASSED' if not fails else f'\n{len(fails)} CHECK(S) FAILED:\n  ' + '\n  '.join(fails))
sys.exit(1 if fails else 0)
