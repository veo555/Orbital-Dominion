#!/usr/bin/env python3
"""Assemble Orbital Dominion from src/ into its three distributions (pure Python, no dependencies).

  python3 build.py                 build everything
  python3 build.py standalone      only dist/orbital_dominion_v4.html
  python3 build.py pwa             only dist/pwa/
  python3 build.py store           only dist/store/index.html

  standalone  ONE self-contained HTML file (~0.55 MB): double-click it, host it anywhere (itch.io, a blog, an email
              attachment). Zero network requests, icons embedded as data: URIs, no service worker (browsers do not allow
              one from file://).
  pwa         dist/pwa/  index.html + manifest.webmanifest + sw.js (versioned, offline-first, update prompt) + icons +
              _headers (security headers / cache rules for Cloudflare Pages & Netlify). Deploy the folder to any HTTPS host.
  store       dist/store/index.html  for Capacitor / Cordova store wrappers: the optional-payment code is configured OFF
              and carries no payment URLs, which is what Apple 3.1.1 / Google Play payments policy expect of an app
              that does not use the store's own billing.

Optional payments (Stripe) are configured in src/support.config.json and are OFF unless you enable them there.

Minification (v5): the JavaScript, the CSS and the HTML body of every distribution go through tools/minify.js (comments and redundant whitespace only; no identifier is
renamed, so window.__RTS hooks and the tests keep working).  OD_MIN=0 disables it for debugging; the Node sim harness and tests/sim always load the readable sources.
"""
import base64, glob, hashlib, json, os, re, shutil, subprocess, sys

root = os.path.dirname(os.path.abspath(__file__))
src = os.path.join(root, 'src')
dist = os.environ.get('OD_DIST') or os.path.join(root, 'dist')   # OD_DIST: build somewhere else (tests build variants in a scratch dir)
read = lambda p: open(os.path.join(src, p), encoding='utf-8').read()
pkg = json.load(open(os.path.join(root, 'package.json'), encoding='utf-8'))
VERSION = pkg.get('version', '0.0.0')

js = ''.join(open(f, encoding='utf-8').read() + '\n' for f in sorted(glob.glob(os.path.join(src, 'js', '*.js'))))
css, body = read('style.css'), read('body.html')

MINIFY = os.environ.get('OD_MIN', '1') != '0'

def minify(kind, text):
    """kind: 'js' | 'css'.  tools/minify.js (Node): comments + whitespace only.  Falls back to the readable text (with a warning) when Node is unavailable."""
    try:
        r = subprocess.run(['node', os.path.join(root, 'tools', 'minify.js'), kind, '-'], input=text.encode('utf-8'), stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        return r.stdout.decode('utf-8')
    except (OSError, subprocess.CalledProcessError) as e:
        sys.exit('build: minification failed (%s). Install Node, or build with OD_MIN=0 for a readable, unminified file.\n%s' % (type(e).__name__, getattr(e, 'stderr', b'').decode('utf-8', 'replace')))

def minify_html(text):
    """body.html: drop HTML comments and the indentation at the start of each line (browsers collapse that whitespace anyway; the body has no <pre>/<textarea>)."""
    assert '<pre' not in text and '<textarea' not in text, 'build: body.html contains <pre>/<textarea>: the HTML minifier must not touch their whitespace'
    text = re.sub(r'<!--.*?-->', '', text, flags=re.S)
    return '\n'.join(l.strip() for l in text.split('\n') if l.strip())

if MINIFY:
    js, css, body = minify('js', js), minify('css', css), minify_html(body)
    assert '</script' not in js.lower() and '<!--' not in js, 'build: the script text would end/escape the inline <script> element'
_sp = os.environ.get('OD_SUPPORT_CONFIG') or os.path.join(src, 'support.config.json')   # OD_SUPPORT_CONFIG: alternative payment config (tests, staging)
support = json.load(open(_sp, encoding='utf-8')) if os.path.exists(_sp) else {'enabled': False}

TITLE = 'Orbital Dominion — Real-Time Strategy'
DESC = ('A free real-time strategy game: three factions, a living colony economy and a swarm of autonomous agents. '
        'Plays in your browser on desktop, Android and iPhone; installable and works offline.')
THEME = '#08111f'
BG = '#050913'

def b64(path):
    return base64.b64encode(open(os.path.join(src, 'pwa', 'icons', path), 'rb').read()).decode()

def assemble(variant, build_id):
    sup = support if variant != 'store' else {'enabled': False}
    prelude = 'const BUILD=%s;\nconst SUPPORT_CFG=%s;\n' % (
        json.dumps({'variant': variant, 'id': build_id, 'version': VERSION}), json.dumps(sup, separators=(',', ':')))
    meta = f'''<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<title>{TITLE}</title>
<meta name="description" content="{DESC}">
<meta name="theme-color" content="{THEME}">
<meta name="color-scheme" content="dark">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Orbital Dominion">
<meta name="format-detection" content="telephone=no">
<meta property="og:type" content="website">
<meta property="og:title" content="Orbital Dominion">
<meta property="og:description" content="{DESC}">
<meta name="twitter:card" content="summary_large_image">'''
    if variant == 'pwa':
        links = '''<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" sizes="32x32" href="icons/favicon-32.png">
<link rel="icon" type="image/png" sizes="64x64" href="icons/favicon-64.png">
<link rel="apple-touch-icon" href="icons/apple-touch-180.png">
<meta property="og:image" content="icons/og-image.png">
<meta name="twitter:image" content="icons/og-image.png">'''
    else:  # standalone / store: nothing external, icons travel inside the file
        links = f'''<link rel="icon" type="image/png" sizes="64x64" href="data:image/png;base64,{b64('favicon-64.png')}">
<link rel="apple-touch-icon" href="data:image/png;base64,{b64('apple-touch-180.png')}">'''
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
{meta}
{links}
<style>
{css}
</style>
</head>
<body>
{body}
<script>
(function(){{
{prelude}{js}
}})();
</script>
</body>
</html>
'''

def write(path, data, mode='w'):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if isinstance(data, bytes):
        open(path, 'wb').write(data)
    else:
        open(path, 'w', encoding='utf-8').write(data)

def build_standalone(build_id):
    html = assemble('standalone', build_id)
    out = os.path.join(dist, 'orbital_dominion_v4.html')
    write(out, html)
    print('wrote', out, len(html.encode('utf-8')), 'bytes')

def build_store(build_id):
    html = assemble('store', build_id)
    out = os.path.join(dist, 'store', 'index.html')
    write(out, html)
    print('wrote', out, len(html.encode('utf-8')), 'bytes')

def build_pwa(build_id):
    d = os.path.join(dist, 'pwa')
    if os.path.isdir(d): shutil.rmtree(d)
    html = assemble('pwa', build_id)
    write(os.path.join(d, 'index.html'), html)
    manifest = {
        'id': './', 'name': 'Orbital Dominion', 'short_name': 'Orbital', 'description': DESC, 'lang': 'en',
        'start_url': './', 'scope': './', 'display': 'standalone', 'display_override': ['fullscreen', 'standalone'],
        'orientation': 'landscape', 'background_color': BG, 'theme_color': THEME, 'categories': ['games', 'entertainment'],
        'icons': [
            {'src': 'icons/icon-192.png', 'sizes': '192x192', 'type': 'image/png', 'purpose': 'any'},
            {'src': 'icons/icon-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'any'},
            {'src': 'icons/maskable-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'maskable'}]}
    write(os.path.join(d, 'manifest.webmanifest'), json.dumps(manifest, indent=2) + '\n')
    icons = ['icon-192.png', 'icon-512.png', 'maskable-512.png', 'apple-touch-180.png', 'favicon-32.png', 'favicon-64.png', 'og-image.png']
    os.makedirs(os.path.join(d, 'icons'), exist_ok=True)
    for f in icons:
        shutil.copy(os.path.join(src, 'pwa', 'icons', f), os.path.join(d, 'icons', f))
    precache = ['./', 'index.html', 'manifest.webmanifest'] + ['icons/' + f for f in icons if f != 'og-image.png']
    sw = read('pwa/sw.template.js').replace('__BUILD_ID__', build_id).replace('__PRECACHE__', json.dumps(precache))
    write(os.path.join(d, 'sw.js'), sw)
    # connect-src: only our own origin plus the payment backend (if any); Stripe-hosted pages are reached by navigation, not by fetch
    origins = ["'self'"]
    for key in ('checkoutEndpoint', 'verifyEndpoint', 'entitlementEndpoint'):
        u = support.get(key) or ''
        if u.startswith('https://'):
            o = '/'.join(u.split('/')[:3])
            if o not in origins: origins.append(o)
    csp = ("default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
           "media-src 'self' data: blob:; font-src 'self' data:; connect-src %s; manifest-src 'self'; worker-src 'self'; "
           "base-uri 'none'; form-action 'none'; frame-ancestors 'none'" % ' '.join(origins))
    write(os.path.join(d, '_headers'), f'''/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
  Content-Security-Policy: {csp}
/sw.js
  Cache-Control: no-cache
/index.html
  Cache-Control: no-cache
/manifest.webmanifest
  Cache-Control: no-cache
  Content-Type: application/manifest+json
/icons/*
  Cache-Control: public, max-age=31536000, immutable
''')
    print('wrote', d, '(index.html %d bytes, sw %s)' % (len(html.encode('utf-8')), build_id))

if __name__ == '__main__':
    which = sys.argv[1:] or ['standalone', 'pwa', 'store']
    # one build id for all variants: a hash of everything that ends up in the game
    build_id = hashlib.sha256((js + css + body + json.dumps(support, sort_keys=True) + VERSION).encode('utf-8')).hexdigest()[:10]
    for w in which:
        {'standalone': build_standalone, 'pwa': build_pwa, 'store': build_store}[w](build_id)
