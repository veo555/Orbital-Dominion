"""Optional-payments gate (Playwright + Chromium; every HTTPS endpoint is mocked, nothing touches Stripe). Exit code != 0 on failure.
   python3 tests/e2e/e2e_support.py        (about 40 s)

Builds payment-ENABLED variants into a scratch directory (OD_DIST / OD_SUPPORT_CONFIG) and checks:
  * the committed default build shows no payment UI and ignores ?supporter=...
  * payment-link mode: only valid https://buy.stripe.com/... links render; a tier opens its link in a new tab with noopener;
    returning with ?supporter=<tier> unlocks the cosmetic perks, strips the parameter from the URL and persists
  * checkout-API mode: the client posts only {tier}, follows ONLY a checkout.stripe.com URL, verifies a returning session id with the
    backend, and a revoked entitlement removes the perks
  * perks are cosmetic: the Supporter badge and extra interface themes (accent colour); nothing in the game state changes
  * the store build and a native (Capacitor) runtime never show payments, and the store HTML contains no payment URL
Limits: this proves the page's behaviour against a mocked backend; it cannot prove that a live Stripe account/Worker is configured."""
import json, os, pathlib, subprocess, sys, tempfile, shutil
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parents[2]
fails = []; errs = []; stray = []
def ok(c, m):
    print(('ok    ' if c else 'FAIL  ') + m, flush=True)
    if not c: fails.append(m)

TMP = pathlib.Path(tempfile.mkdtemp(prefix='od_support_'))
LINKS = {'coffee': 'https://buy.stripe.com/test_coffee', 'backer': 'https://buy.stripe.com/test_backer'}
def cfg(**kw):
    base = {'enabled': True, 'title': 'Support Orbital Dominion', 'blurb': 'Test blurb.', 'perks': ['Badge', 'Themes'],
            'tiers': [{'id': 'coffee', 'label': 'Coffee', 'amount': '$3', 'paymentLink': LINKS['coffee']},
                      {'id': 'backer', 'label': 'Backer', 'amount': '$9', 'paymentLink': LINKS['backer']},
                      {'id': 'sketchy', 'label': 'Sketchy', 'amount': '$1', 'paymentLink': 'https://evil.example/pay'},
                      {'id': 'plain', 'label': 'Plain', 'amount': '$1', 'paymentLink': 'http://buy.stripe.com/insecure'}],
            'checkoutEndpoint': '', 'verifyEndpoint': '', 'entitlementEndpoint': ''}
    base.update(kw); return base

def build(name, config, variants=('standalone',)):
    d = TMP / name; d.mkdir(); c = d / 'cfg.json'; c.write_text(json.dumps(config))
    env = dict(os.environ, OD_DIST=str(d / 'dist'), OD_SUPPORT_CONFIG=str(c))
    subprocess.run([sys.executable, str(ROOT / 'build.py'), *variants], env=env, check=True, capture_output=True)
    return d / 'dist'

builds = {
    'links': build('links', cfg(), ('standalone', 'store')),
    'api': build('api', cfg(checkoutEndpoint='https://pay.test/checkout', verifyEndpoint='https://pay.test/verify', entitlementEndpoint='https://pay.test/entitlement')),
}
default_html = ROOT / 'dist' / 'orbital_dominion_v3.html'
FILES = {'links': builds['links'] / 'orbital_dominion_v3.html', 'api': builds['api'] / 'orbital_dominion_v3.html'}

ALLOWED = ('https://pay.test/', 'https://checkout.stripe.com/', 'https://buy.stripe.com/')
def new_page(b, **kw):
    ctx = b.new_context(viewport={'width': 1366, 'height': 800}, **kw); pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append(('pageerror', str(e))))
    pg.on('console', lambda m: errs.append((m.type, m.text)) if m.type in ('error', 'warning') and 'net::ERR' not in m.text else None)
    pg.on('request', lambda r: stray.append(r.url[:90]) if not r.url.startswith(('file:', 'data:', 'blob:') + ALLOWED) else None)
    pg.add_init_script("window.__TEST='live'")
    ctx.route('https://checkout.stripe.com/**', lambda r: r.fulfill(status=200, content_type='text/html', body='<title>stripe checkout (mock)</title>'))
    ctx.route('https://buy.stripe.com/**', lambda r: r.fulfill(status=200, content_type='text/html', body='<title>stripe payment link (mock)</title>'))
    return ctx, pg
vis = lambda pg, i: pg.evaluate(f"()=>!document.getElementById('{i}').classList.contains('hidden')")

with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])

    # ---- default (committed) build: payments are off ---------------------------------------------------------------
    ctx, pg = new_page(b)
    pg.goto(default_html.as_uri() + '?supporter=coffee'); pg.wait_for_timeout(900)
    ok(not vis(pg, 'bSupport'), 'default build: no Support button')
    ok(pg.evaluate("()=>localStorage.getItem('orbital_dominion_v3_supporter')") is None and not vis(pg, 'supBadge'), 'default build: ?supporter=coffee is ignored (no unlock, nothing stored)')
    ctx.close()

    # ---- payment-link mode ------------------------------------------------------------------------------------------------
    ctx, pg = new_page(b)
    pg.goto(FILES['links'].as_uri()); pg.wait_for_timeout(900)
    ok(vis(pg, 'bSupport'), 'links mode: Support button is offered')
    pg.click('#bSupport'); pg.wait_for_timeout(250)
    tiers = pg.evaluate("()=>[...document.querySelectorAll('#supTiers .tier')].map(b=>b.dataset.tier)")
    ok(tiers == ['coffee', 'backer'], f'only valid https://buy.stripe.com links render as options {tiers} (an off-site and an http link were dropped)')
    ok('Stripe' in pg.inner_text('#supportMenu') and 'never sees' in pg.inner_text('#supportMenu'), 'dialog states that Stripe handles the card')
    with ctx.expect_event('page') as popup:
        pg.click('.tier[data-tier="coffee"]')
    pop = popup.value; pop.wait_for_load_state()
    ok(pop.url == LINKS['coffee'], f'a tier opens its Stripe link in a new tab ({pop.url})')
    ok(pg.evaluate("()=>window.opener===null")  and pop.evaluate("()=>window.opener===null"), 'the new tab has no opener (noopener)')
    ctx.close()

    # honour-system return
    ctx, pg = new_page(b)
    pg.goto(FILES['links'].as_uri() + '?supporter=backer'); pg.wait_for_timeout(1000)
    ok(vis(pg, 'supBadge'), 'returning with ?supporter=backer shows the Supporter badge')
    ok(pg.evaluate("()=>location.search===''"), '...and removes the parameter from the address bar')
    pg.evaluate("()=>document.getElementById('bSet').click()"); pg.wait_for_timeout(200)
    ok(vis(pg, 'themeRow'), 'supporters get the interface-theme setting')
    before = pg.evaluate("()=>getComputedStyle(document.documentElement).getPropertyValue('--acc').trim()")
    pg.select_option('#set_theme', 'gold'); pg.wait_for_timeout(150)
    after = pg.evaluate("()=>getComputedStyle(document.documentElement).getPropertyValue('--acc').trim()")
    ok(before != after and after.lower() == '#e0a526', f'theme changes the UI accent ({before} -> {after})')
    pg.reload(); pg.wait_for_timeout(900)
    ok(vis(pg, 'supBadge') and pg.evaluate("()=>getComputedStyle(document.documentElement).getPropertyValue('--acc').trim().toLowerCase()") == '#e0a526', 'badge and theme persist across a reload')
    # cosmetic only (Math.random is pinned: ~30 sim calls are still unseeded, BACKLOG B-20): a match plays identically (same seed -> same state hash with and without the supporter flag)
    h1 = pg.evaluate("()=>{const R=__RTS;let a=12345;Math.random=()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296};R.newGame({seed:5,faction:'meridian',enemy:'aurora'});for(let i=0;i<300;i++)R.step();return JSON.stringify([R.G.teams[0].c,R.G.teams[0].used,R.G.units.length])}")
    pg.evaluate("()=>{localStorage.removeItem('orbital_dominion_v3_supporter')}"); pg.reload(); pg.wait_for_timeout(800)
    h2 = pg.evaluate("()=>{const R=__RTS;let a=12345;Math.random=()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296};R.newGame({seed:5,faction:'meridian',enemy:'aurora'});for(let i=0;i<300;i++)R.step();return JSON.stringify([R.G.teams[0].c,R.G.teams[0].used,R.G.units.length])}")
    ok(not vis(pg, 'supBadge'), 'without the stored flag the badge is gone')
    ok(h1 == h2, f'perks are cosmetic: identical game state with and without them ({h1})')
    ctx.close()

    # ---- checkout-API mode -----------------------------------------------------------------------------------------------------
    posted = []; state = {'verify_ok': True, 'entitled': True, 'checkout_url': 'https://checkout.stripe.com/c/pay/cs_test_abc'}
    def mock_backend(route):
        r = route.request; path = r.url.split('https://pay.test')[1]
        hdr = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json'}
        if r.method == 'OPTIONS': return route.fulfill(status=204, headers=hdr)
        if path.startswith('/checkout'): posted.append(json.loads(r.post_data or '{}')); return route.fulfill(status=200, headers=hdr, body=json.dumps({'ok': True, 'url': state['checkout_url']}))
        if path.startswith('/verify'): posted.append({'verify': path}); return route.fulfill(status=200, headers=hdr, body=json.dumps({'ok': True, 'tier': 'backer', 'token': 'tok.sig'}) if state['verify_ok'] else json.dumps({'ok': False}))
        if path.startswith('/entitlement'): posted.append({'ent': json.loads(r.post_data or '{}')}); return route.fulfill(status=200, headers=hdr, body=json.dumps({'ok': True, 'valid': state['entitled']}))
        route.fulfill(status=404, headers=hdr, body='{}')
    ctx, pg = new_page(b); ctx.route('https://pay.test/**', mock_backend)
    pg.goto(FILES['api'].as_uri()); pg.wait_for_timeout(900)
    ok(vis(pg, 'bSupport'), 'api mode: Support button is offered')
    pg.click('#bSupport'); pg.wait_for_timeout(250)
    pg.click('.tier[data-tier="backer"]'); pg.wait_for_timeout(900)
    ok(posted and posted[0] == {'tier': 'backer'}, f'the client sends only the tier name to the backend {posted[:1]}')
    ok(pg.url.startswith('https://checkout.stripe.com/'), f'the browser is sent to Stripe-hosted checkout ({pg.url})')
    ctx.close()
    # a hostile/compromised backend cannot redirect somewhere else
    ctx, pg = new_page(b); state['checkout_url'] = 'https://evil.example/phish'; ctx.route('https://pay.test/**', mock_backend)
    pg.goto(FILES['api'].as_uri()); pg.wait_for_timeout(900); pg.click('#bSupport'); pg.click('.tier[data-tier="coffee"]'); pg.wait_for_timeout(800)
    ok(pg.url.startswith('file:'), 'a checkout URL that is not on checkout.stripe.com is never followed')
    ok('Could not start checkout' in pg.inner_text('#supMsg'), '...and the player sees a plain error message')
    ctx.close()
    # return from a paid session: verify, unlock, then a refund revokes
    ctx, pg = new_page(b); ctx.route('https://pay.test/**', mock_backend); posted.clear(); state['entitled'] = True
    pg.goto(FILES['api'].as_uri() + '?supporter=cs_test_abcdef12345'); pg.wait_for_timeout(1500)
    ok(any('verify' in x and 'cs_test_abcdef12345' in x['verify'] for x in posted), 'a returning session id is verified with the backend')
    ok(vis(pg, 'supBadge') and pg.evaluate("()=>location.search===''"), 'verified payment unlocks the perks and cleans the URL')
    state['entitled'] = False; posted.clear()
    pg.reload(); pg.wait_for_timeout(5500)
    ok(any('ent' in x and x['ent'].get('token') == 'tok.sig' for x in posted), 'the stored token is re-validated once per session')
    ok(not vis(pg, 'supBadge'), 'a revoked (refunded) entitlement removes the perks')
    ctx.close()
    # a malformed session id never reaches the backend
    ctx, pg = new_page(b); ctx.route('https://pay.test/**', mock_backend); posted.clear()
    pg.goto(FILES['api'].as_uri() + '?supporter=../../etc/passwd'); pg.wait_for_timeout(1000)
    ok(not posted and not vis(pg, 'supBadge'), 'a malformed ?supporter= value is ignored without any request')
    ctx.close()

    # ---- store build / native runtime ----------------------------------------------------------------------------------------------
    store_html = (builds['links'] / 'store' / 'index.html')
    ctx, pg = new_page(b); pg.goto(store_html.as_uri()); pg.wait_for_timeout(900)
    ok(not vis(pg, 'bSupport'), 'store build: no Support button even with payments configured')
    txt = store_html.read_text(encoding='utf-8')
    ok(LINKS['coffee'] not in txt and 'test_backer' not in txt, 'store build: the payment links are not in the file')
    ctx.close()
    ctx, pg = new_page(b); pg.add_init_script("window.Capacitor={isNativePlatform:()=>true,Plugins:{}}")
    pg.goto(FILES['links'].as_uri()); pg.wait_for_timeout(900)
    ok(not vis(pg, 'bSupport'), 'native (Capacitor) runtime: no Support button')
    ctx.close(); b.close()

ok(not errs, f'no console errors/warnings/page errors {errs[:3]}')
ok(not stray, f'no request outside the mocked endpoints {stray[:3]}')
shutil.rmtree(TMP, ignore_errors=True)
print('\nALL SUPPORT CHECKS PASSED' if not fails else f'\n{len(fails)} CHECK(S) FAILED:\n  ' + '\n  '.join(fails))
sys.exit(1 if fails else 0)
