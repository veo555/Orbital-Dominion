"""v6-G1 FORTIFY browser gate (Playwright 1.56 + the preinstalled Chromium). Exit code != 0 on failure.
   python3 tests/e2e/e2e_fortify.py             desktop (mouse + keys) and two phones (real touch events through CDP)
   python3 tests/e2e/e2e_fortify.py --mutants   CLAUDE.md rule 15: builds mutated copies of the game into a scratch dir and checks that
                                                each mutant makes its check FAIL (a mutant that passes is reported VACUOUS)
Desktop: D opens the Defence page, Q arms the Wall, press-drag-release draws a 6-tile line (6 build orders, 300 crystals), the Gate ghost
places a gate, right-clicking an own Bunker with 3 Riflemen loads them, the Hub's S + a minimap click starts a Scanner Sweep.
Touch (iPhone landscape, Pixel portrait): command-card taps, two-tap wall line + the confirm bar, tap a Bunker with infantry selected to load,
Scanner Sweep by tapping the minimap; every command button and the confirm button >= 40 CSS px.
Always: zero page errors / console errors, zero network requests."""
import os, sys, re, shutil, subprocess, pathlib, tempfile
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parents[2]
URL = os.environ.get('OD_URL') or (ROOT / 'dist' / 'orbital_dominion_v4.html').as_uri()
fails = []; errs = []; reqs = []
def ok(c, m):
    print(('ok    ' if c else 'FAIL  ') + m, flush=True)
    if not c: fails.append(m)
    return bool(c)

SETUP = """()=>{const R=__RTS,G=R.G;G.speed=0.05;G.teams[0].c=G.teams[0].e=5000;for(let i=0;i<88*88;i++)if(G.vis[0][i]===0)G.vis[0][i]=1;
  const hub=G.buildings.find(b=>b.team===0&&b.type==='hub');
  if(!G.buildings.some(b=>b.team===0&&b.type==='garrison'))R.addBuilding('garrison',0,hub.tx-6,hub.ty-1,true);
  for(const u of G.units)if(u.team===0){u.order={t:'idle'};u.oq=[];}
  R.cam.z=R.cam.tz=1;R.centerOn(hub.x,hub.y);R.render(1);return{hx:hub.tx,hy:hub.ty};}"""
# a horizontal row of 6 free, explored, level tiles near the hub, fully on screen (inside the map area between the HUD bars)
FIND_ROW = """()=>{const R=__RTS,F=window.__RTSF,G=R.G,hub=G.buildings.find(b=>b.team===0&&b.type==='hub'),c=[];
  for(let dy=-12;dy<=12;dy++)for(let dx=-16;dx<=12;dx++)c.push([dx,dy]);c.sort((a,b)=>Math.hypot(a[0]+3,a[1])-Math.hypot(b[0]+3,b[1]));
  for(const[dx,dy]of c){const tx=hub.tx+2+dx,ty=hub.ty+2+dy;if(Math.abs(dy)<4&&dx>-9&&dx<4)continue;
    const t=[];for(let k=0;k<6;k++)t.push([tx+k,ty]);
    const a=R.w2s((t[0][0]+.5)*32,(t[0][1]+.5)*32),b=R.w2s((t[5][0]+.5)*32,(t[5][1]+.5)*32);
    if(a.x<60||b.x>innerWidth-60||a.y<R.TOPBAR+40||a.y>innerHeight-R.BOTTOM-40)continue;
    const P=F.fortLinePlan(0,t,false);if(P.ok.length!==6||!P.sealOK)continue;
    if(t.some(([x,y])=>R.entityAt((x+.5)*32,(y+.5)*32,4)))continue;return{t,a,b};}return null}"""
WALL_ORDERS = "()=>{let n=0;for(const u of __RTS.G.units){if(u.team!==0)continue;for(const o of[u.order].concat(u.oq))if(o.t==='build'&&o.type==='wall')n++;}return n}"

def desktop(p):
    print('--- desktop 1366x800', flush=True)
    b = p.chromium.launch(args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
    pg = b.new_page(viewport={'width': 1366, 'height': 800})
    pg.on('pageerror', lambda e: errs.append(('pageerror', str(e))))
    pg.on('console', lambda m: errs.append((m.type, m.text)) if m.type in ('error', 'warning') else None)
    pg.on('request', lambda r: reqs.append(r.url[:80]) if not r.url.startswith(('file:', 'data:', 'blob:')) else None)
    pg.add_init_script("window.__TEST='live'")
    pg.goto(URL); pg.wait_for_timeout(1200)
    pg.click('#bStart'); pg.wait_for_timeout(1500)
    pg.mouse.move(683, 380)   # a headless pointer at (0,0) would edge-scroll the camera away
    pg.evaluate(SETUP); pg.wait_for_timeout(200)
    hid = pg.evaluate("()=>{const R=__RTS,u=R.G.units.find(u=>u.team===0&&u.type==='hauler');R.setSel([u]);R.renderCmdCard();return u.id}")
    pg.wait_for_timeout(150)
    pg.keyboard.press('d'); pg.wait_for_timeout(150)
    ok(pg.evaluate("()=>__RTS.ui.menu")=='build3', 'desktop: D opens the Defence page')
    names = pg.evaluate("()=>__RTS.ui.cmds.map(c=>c&&c.name)")
    ok(names[:8] == ['Wall (per segment)', 'Gate', 'Bunker', 'Cannon Tower', 'Anti-Air Battery', 'Sensor Tower', 'Repair Battery', 'Proximity Mine'], f'desktop: the Defence page lists the 8 structures {names[:8]}')
    row = pg.evaluate(FIND_ROW)
    ok(row is not None, 'desktop: found a free 6-tile row on screen')
    if row:
        pg.keyboard.press('q'); pg.wait_for_timeout(150)
        ok(pg.evaluate("()=>!!(__RTS.ui.place&&__RTS.ui.place.line)"), 'desktop: Q arms the Wall in line mode')
        c0 = pg.evaluate("()=>__RTS.G.teams[0].c")
        a, z = row['a'], row['b']
        pg.mouse.move(a['x'], a['y']); pg.wait_for_timeout(80); pg.mouse.down()
        for i in range(1, 9): pg.mouse.move(a['x'] + (z['x'] - a['x']) * i / 8, a['y'] + (z['y'] - a['y']) * i / 8); pg.wait_for_timeout(30)
        pg.wait_for_timeout(120)
        lbl = pg.evaluate("()=>__RTS.ui.place&&__RTS.ui.place.n")
        ok(lbl == 6, f'desktop: dragging previews 6 segments ({lbl})')
        pg.mouse.up(); pg.wait_for_timeout(200)
        n = pg.evaluate(WALL_ORDERS); paid = c0 - pg.evaluate("()=>__RTS.G.teams[0].c")
        ok(n == 6 and paid == 300, f'desktop: release orders 6 wall segments for 300 crystals ({n} orders, {paid} paid)')
        ok(pg.evaluate("()=>__RTS.ui.place===null"), 'desktop: placement mode ends after the line')
        # gate: arm it, hover a spot right above the line, click
        pg.evaluate(f"()=>{{const R=__RTS;R.setSel([R.G.units.find(u=>u.id=={hid})]);R.ui.menu='build3';R.renderCmdCard()}}"); pg.wait_for_timeout(100)
        pg.keyboard.press('w'); pg.wait_for_timeout(100)
        gp = pg.evaluate("()=>{const R=__RTS,hub=R.G.buildings.find(b=>b.team===0&&b.type==='hub');"
          "for(let r=5;r<16;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){if(Math.max(Math.abs(dx),Math.abs(dy))!==r)continue;const tx=hub.tx+dx,ty=hub.ty+dy;"
          "if(!R.canPlace(0,'gate',tx,ty)||!R.canPlace(0,'gatev',tx,ty))continue;const s=R.w2s((tx+1)*32,(ty+.5)*32);"
          "if(s.x<60||s.x>innerWidth-60||s.y<R.TOPBAR+40||s.y>innerHeight-R.BOTTOM-40)continue;return s;}return null}")
        ok(gp is not None, 'desktop: found a free gate spot on screen')
        if gp: pg.mouse.move(gp['x'], gp['y']); pg.wait_for_timeout(150); pg.mouse.down(); pg.mouse.up(); pg.wait_for_timeout(200)
        ok(pg.evaluate("()=>__RTS.G.units.some(u=>u.team===0&&[u.order].concat(u.oq).some(o=>o.t==='build'&&(o.type==='gate'||o.type==='gatev')))"), 'desktop: the Gate ghost places a gate build order')
    # bunker: three Riflemen, right-click the Bunker
    bk = pg.evaluate("""()=>{const R=__RTS,G=R.G,hub=G.buildings.find(b=>b.team===0&&b.type==='hub');R.ui.place=null;R.ui.target=null;const b=R.addBuilding('bunker',0,hub.tx+6,hub.ty+5,true);
      const L=[];for(let i=0;i<3;i++)L.push(R.addUnit('rifleman',0,(hub.tx+5+i)*32,(hub.ty+9)*32));R.setSel(L);R.centerOn(b.x,b.y);R.render(1);const s=R.w2s(b.x,b.y);return{x:s.x,y:s.y,id:b.id}}""")
    pg.wait_for_timeout(100); pg.mouse.click(bk['x'], bk['y'], button='right'); pg.wait_for_timeout(150)
    ok(pg.evaluate("()=>__RTS.G.units.filter(u=>u.team===0&&u.type==='rifleman'&&u.order.t==='load').length")==3, 'desktop: right-clicking an own Bunker with 3 Riflemen orders them in')
    pg.evaluate("()=>{for(let i=0;i<30*6;i++)__RTS.step()}")
    ok(pg.evaluate(f"()=>(__RTS.G.buildings.find(b=>b.id=={bk['id']}).cargo||[]).length")==3, 'desktop: ...and they are inside after 6 s')
    # scan: select the Hub, S, click the enemy base on the minimap
    pg.evaluate("()=>{const R=__RTS,h=R.G.buildings.find(b=>b.team===0&&b.type==='hub');h.energy=100;R.setSel([h]);R.renderCmdCard()}"); pg.wait_for_timeout(150)
    pg.keyboard.press('s'); pg.wait_for_timeout(120)
    ok(pg.evaluate("()=>__RTS.ui.target&&__RTS.ui.target.kind")=='scan', 'desktop: S on a Hub arms the Scanner Sweep')
    mm = pg.evaluate("()=>{const r=document.getElementById('mm').getBoundingClientRect(),s=__RTS.G.sites[1];return{x:r.left+s.cx*32/2816*r.width,y:r.top+s.cy*32/2816*r.height}}")
    pg.mouse.click(mm['x'], mm['y']); pg.wait_for_timeout(150)
    sc = pg.evaluate("()=>{const G=__RTS.G,s=(G.scans||[])[0],e=G.sites[1];return s?{team:s.team,d:Math.hypot(s.x-e.cx*32,s.y-e.cy*32)}:null}")
    ok(sc is not None and sc['team'] == 0 and sc['d'] < 120, f'desktop: a minimap click scans the enemy base {sc}')
    pg.evaluate("()=>{__RTS.G.speed=1;__RTS.render(1)}"); pg.wait_for_timeout(400)
    if os.environ.get('FORT_SHOTS'):
        pg.screenshot(path=os.environ['FORT_SHOTS'] + '/fortify_desktop.png')
    b.close()

class Phone:
    def __init__(self, browser, w, h, dpr):
        self.ctx = browser.new_context(viewport={'width': w, 'height': h}, device_scale_factor=dpr, is_mobile=True, has_touch=True)
        self.pg = self.ctx.new_page(); self.w, self.h = w, h
        self.pg.on('pageerror', lambda e: errs.append(('pageerror', str(e))))
        self.pg.on('console', lambda m: errs.append((m.type, m.text)) if m.type in ('error', 'warning') else None)
        self.pg.on('request', lambda r: reqs.append(r.url[:80]) if not r.url.startswith(('file:', 'data:', 'blob:')) else None)
        self.pg.add_init_script("window.__TEST='live'")
        self.cdp = self.ctx.new_cdp_session(self.pg)
    def t(self, typ, pts):
        self.cdp.send('Input.dispatchTouchEvent', {'type': typ, 'touchPoints': [{'x': x, 'y': y, 'id': i} for i, (x, y) in enumerate(pts)]})
    def tap(self, x, y): self.t('touchStart', [(x, y)]); self.pg.wait_for_timeout(40); self.t('touchEnd', []); self.pg.wait_for_timeout(150)
    def ev(self, js): return self.pg.evaluate(js)
    def btn(self, sel):
        r = self.ev("()=>{const e=document.querySelector('" + sel + "');if(!e||e.offsetParent===null)return null;const r=e.getBoundingClientRect();return[r.left+r.width/2,r.top+r.height/2,r.width,r.height]}")
        return r

def phone(p, name, w, h, dpr):
    print(f'--- {name} {w}x{h} @{dpr}x', flush=True)
    b = p.chromium.launch(args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
    ph = Phone(b, w, h, dpr); pg = ph.pg
    pg.goto(URL); pg.wait_for_timeout(1000)
    r = ph.btn('#bStart'); ph.tap(r[0], r[1]); pg.wait_for_timeout(1500)
    ok(ph.ev("()=>!!(__RTS.G&&__RTS.ui.running&&!__RTS.ui.demo&&__RTS.ui.touchMode)"), f'{name}: match running in touch mode')
    ph.ev(SETUP); pg.wait_for_timeout(200)
    ph.ev("()=>{const R=__RTS,u=R.G.units.find(u=>u.team===0&&u.type==='hauler');R.setSel([u]);R.renderCmdCard()}"); pg.wait_for_timeout(200)
    d = ph.btn('#cmd .cb[data-i="6"]')
    ok(d is not None and min(d[2], d[3]) >= 40, f'{name}: the Defence button is on the card and >= 40 px {d and [round(d[2]),round(d[3])]}')
    if d:
        ph.tap(d[0], d[1]); pg.wait_for_timeout(200)
        ok(ph.ev("()=>__RTS.ui.menu")=='build3', f'{name}: tapping Defence opens the page')
        small = ph.ev("()=>[...document.querySelectorAll('#cmd .cb:not(.empty)')].filter(e=>{const r=e.getBoundingClientRect();return Math.min(r.width,r.height)<40}).length")
        ok(small == 0, f'{name}: every Defence-page button is >= 40 CSS px')
        wb = ph.btn('#cmd .cb[data-i="0"]'); ph.tap(wb[0], wb[1]); pg.wait_for_timeout(200)
        ok(ph.ev("()=>!!(__RTS.ui.place&&__RTS.ui.place.line)"), f'{name}: tapping Wall arms line placement')
        lift = ph.ev("()=>__RTS.TP.LIFT")
        ph.ev("()=>{const R=__RTS,hub=R.G.buildings.find(b=>b.team===0&&b.type==='hub');R.cam.z=R.cam.tz=0.7;R.centerOn(hub.x,hub.y);R.render(1)}"); pg.wait_for_timeout(100)
        row = ph.ev(FIND_ROW)
        ok(row is not None, f'{name}: found a free 6-tile row on screen')
        if row:
            a, z = row['a'], row['b']
            c0 = ph.ev("()=>__RTS.G.teams[0].c")
            ph.tap(a['x'], a['y'] + lift); ph.tap(z['x'], z['y'] + lift); pg.wait_for_timeout(200)
            st = ph.ev("()=>{const p=__RTS.ui.place;return p?{s:p.start,n:p.n,ok:p.ok}:null}")
            ok(st and st['s'] == row['t'][0] and st['n'] == 6, f'{name}: two taps set start and end, 6 segments previewed {st}')
            go = ph.btn('#plGo')
            ok(go is not None and min(go[2], go[3]) >= 40, f'{name}: the confirm button is visible and >= 40 px {go and [round(go[2]),round(go[3])]}')
            if go: ph.tap(go[0], go[1]); pg.wait_for_timeout(250)
            n = ph.ev(WALL_ORDERS); paid = c0 - ph.ev("()=>__RTS.G.teams[0].c")
            ok(n == 6 and paid == 300, f'{name}: confirm orders 6 wall segments for 300 crystals ({n}, {paid})')
    # bunker by tap
    bk = ph.ev("""()=>{const R=__RTS,G=R.G,hub=G.buildings.find(b=>b.team===0&&b.type==='hub');R.ui.place=null;R.ui.target=null;const b=R.addBuilding('bunker',0,hub.tx-2,hub.ty+6,true);
      const L=[];for(let i=0;i<2;i++)L.push(R.addUnit('rifleman',0,(hub.tx-3+i)*32,(hub.ty+10)*32));R.setSel(L);R.centerOn(b.x,b.y);R.render(1);const s=R.w2s(b.x,b.y);return{x:s.x,y:s.y,id:b.id}}""")
    pg.wait_for_timeout(150)
    ph.tap(bk['x'], bk['y'])
    ok(ph.ev("()=>__RTS.G.units.filter(u=>u.team===0&&u.type==='rifleman'&&u.order.t==='load').length")==2, f'{name}: tapping an own Bunker with 2 Riflemen selected orders them in')
    # scan by tapping the minimap
    ph.ev("()=>{const R=__RTS,h=R.G.buildings.find(b=>b.team===0&&b.type==='hub');h.energy=100;R.setSel([h]);R.renderCmdCard()}"); pg.wait_for_timeout(200)
    s5 = ph.btn('#cmd .cb[data-i="5"]')
    ok(s5 is not None, f'{name}: Scanner Sweep button on the Hub card')
    if s5:
        ph.tap(s5[0], s5[1]); pg.wait_for_timeout(150)
        lbl = ph.ev("()=>document.getElementById('plTxt').textContent")
        ok('scan' in lbl.lower(), f'{name}: the targeting bar says what to do ("{lbl}")')
        mm = ph.ev("()=>{const r=document.getElementById('mm').getBoundingClientRect(),s=__RTS.G.sites[1];return{x:r.left+s.cx*32/2816*r.width,y:r.top+s.cy*32/2816*r.height,w:r.width}}")
        ph.tap(mm['x'], mm['y'])
        ok(ph.ev("()=>(__RTS.G.scans||[]).filter(s=>s.team===0).length")==1, f'{name}: tapping the minimap scans there')
    if os.environ.get('FORT_SHOTS'):
        ph.ev("()=>{__RTS.G.speed=1;__RTS.render(1)}"); pg.wait_for_timeout(300)
        pg.screenshot(path=os.environ['FORT_SHOTS'] + f'/fortify_{name}.png')
    b.close()

def run_all():
    with sync_playwright() as p:
        desktop(p)
        phone(p, 'iphone-land', 844, 390, 3)
        phone(p, 'pixel-port', 412, 915, 2.625)
    ok(not [e for e in errs if e[0] in ('pageerror', 'error')], f'no page errors / console errors {errs[:4]}')
    ok(not reqs, f'zero network requests {reqs[:3]}')

# ---- mutation proofs: build a mutated copy of the game in a scratch dir and expect the matching check to fail ----
MUTANTS = [
    ('src/js/90_main.js', "if(fortLineDown())return;", "", 'desktop: dragging previews 6 segments'),
    ('src/js/74_touch.js', "if(ui.place.line){fortLineTap(sx,sy-TP.LIFT);return;}", "", 'two taps set start and end'),
    ('src/js/70_ui.js', "  if(fortContext(ent,units,shift))return;", "", 'right-clicking an own Bunker'),
    ('src/js/74_touch.js', "  if(fortContextTarget(ent,units))return true;", "", 'tapping an own Bunker'),
    ('src/js/90_main.js', "  if(fortApplyTarget(k,wx,wy,shift))return;", "", 'a minimap click scans the enemy base'),
]
def mutants():
    bad = 0
    for path, a, bb, expect in MUTANTS:
        tmp = pathlib.Path(tempfile.mkdtemp(prefix='fortmut_'))
        for d in ['src', 'tools']: shutil.copytree(ROOT / d, tmp / d)
        for f in ['build.py', 'package.json']: shutil.copy(ROOT / f, tmp / f)
        t = (tmp / path).read_text(encoding='utf-8'); assert t.count(a) == 1, (path, a); (tmp / path).write_text(t.replace(a, bb), encoding='utf-8')
        subprocess.run([sys.executable, str(tmp / 'build.py'), 'standalone'], check=True, stdout=subprocess.DEVNULL, env=dict(os.environ, OD_DIST=str(tmp / 'dist')))
        r = subprocess.run([sys.executable, __file__], capture_output=True, text=True, env=dict(os.environ, OD_URL=(tmp / 'dist' / 'orbital_dominion_v4.html').as_uri()))
        caught = any(l.startswith('FAIL') and expect in l for l in r.stdout.splitlines())
        print(('ok    mutant caught: ' if caught else 'VACUOUS  mutant passes: ') + path + ' :: ' + a[:60] + '  (expects FAIL on "' + expect + '")', flush=True)
        if not caught: bad += 1
        shutil.rmtree(tmp, ignore_errors=True)
    print('\nALL FORTIFY MUTANTS CAUGHT' if not bad else f'\n{bad} VACUOUS CHECK(S)'); sys.exit(1 if bad else 0)

if __name__ == '__main__':
    if '--mutants' in sys.argv: mutants()
    run_all()
    print('\nALL FORTIFY E2E CHECKS PASSED' if not fails else f'\n{len(fails)} FORTIFY E2E CHECK(S) FAILED'); sys.exit(1 if fails else 0)
