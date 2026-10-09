"""Touch / phone gate (Playwright + Chromium device emulation). Exit code != 0 on failure.
   python3 tests/e2e/e2e_touch.py            (about 40 s)

Emulates an iPhone-class landscape phone and a Pixel-class portrait phone: viewport, devicePixelRatio, touch input
(real Input.dispatchTouchEvent multi-touch via the DevTools protocol). It asserts on game state, not on pixels:
  HUD geometry (map share of the screen, nothing wider than the viewport), tap-select, tap-to-command, pan with
  one finger, pinch zoom with two, long-press box-select, command-card taps, building placement with the confirm bar,
  minimap jump, long-press help sheet, no stuck hover tooltips, zero console errors, zero network requests.
Limits: this is Chromium emulating a phone. It is not WebKit/iOS Safari and not a real device."""
import os, sys, pathlib
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parents[2]
URL = os.environ.get('OD_URL') or (ROOT / 'dist' / 'orbital_dominion_v4.html').as_uri()
fails = []; errs = []; reqs = []
def ok(c, m):
    print(('ok    ' if c else 'FAIL  ') + m, flush=True)
    if not c: fails.append(m)

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
    def tap(self, x, y): self.t('touchStart', [(x, y)]); self.pg.wait_for_timeout(40); self.t('touchEnd', []); self.pg.wait_for_timeout(120)
    def drag(self, x0, y0, x1, y1, steps=8, hold=0):
        self.t('touchStart', [(x0, y0)])
        if hold: self.pg.wait_for_timeout(hold)
        for i in range(1, steps + 1):
            self.t('touchMove', [(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps)]); self.pg.wait_for_timeout(16)
        self.pg.wait_for_timeout(120); self.t('touchEnd', []); self.pg.wait_for_timeout(120)
    def pinch(self, cx, cy, d0, d1, steps=8):
        self.t('touchStart', [(cx - d0 / 2, cy), (cx + d0 / 2, cy)])
        for i in range(1, steps + 1):
            d = d0 + (d1 - d0) * i / steps
            self.t('touchMove', [(cx - d / 2, cy), (cx + d / 2, cy)]); self.pg.wait_for_timeout(16)
        self.t('touchEnd', []); self.pg.wait_for_timeout(120)
    def ev(self, js): return self.pg.evaluate(js)

def run(p, name, w, h, dpr):
    print(f'--- {name} {w}x{h} @{dpr}x', flush=True)
    b = p.chromium.launch(args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
    ph = Phone(b, w, h, dpr); pg = ph.pg
    pg.goto(URL); pg.wait_for_timeout(1000)
    ok(ph.ev("()=>document.documentElement.classList.contains('compact')"), f'{name}: compact layout class')
    ok(ph.ev("()=>document.documentElement.classList.contains('touch')"), f'{name}: touch mode on (coarse pointer)')
    # menu is reachable and fits (no horizontal overflow, Start visible)
    ok(ph.ev("()=>document.documentElement.scrollWidth<=innerWidth+1"), f'{name}: menu has no horizontal overflow')
    r = ph.ev("()=>{const r=document.getElementById('bStart').getBoundingClientRect();return[r.left,r.top,r.right,r.bottom,innerWidth,innerHeight]}")
    ok(r[0] >= 0 and r[2] <= r[4] and r[1] >= 0 and r[3] <= r[5], f'{name}: Start button inside the viewport {r}')
    ph.tap((r[0] + r[2]) / 2, (r[1] + r[3]) / 2); pg.wait_for_timeout(1500)
    ok(ph.ev("()=>!!(__RTS.G&&__RTS.G.units.length>0&&__RTS.ui.running&&!__RTS.ui.demo)"), f'{name}: tapping Start begins the mission')
    pg.evaluate("()=>{const R=__RTS;for(let i=0;i<30*30;i++)R.step();R.G.speed=0.05;}"); pg.wait_for_timeout(300)   # near-freeze the live loop: moving units made tap points stale (the old flaky 'double-tap'/'move order' failures)

    # ---- geometry --------------------------------------------------------------------------------
    g = ph.ev("()=>({top:document.getElementById('top').getBoundingClientRect().height,bot:document.getElementById('bottom').getBoundingClientRect().height,vw:innerWidth,vh:innerHeight,sw:document.documentElement.scrollWidth})")
    share = (g['vh'] - g['top'] - g['bot']) / g['vh']
    print(f"      top {g['top']:.0f}px + bottom {g['bot']:.0f}px of {g['vh']}px -> map share {share*100:.0f}%")
    ok(share >= (0.58 if w > h else 0.70), f'{name}: map area is {share*100:.0f}% of the screen (needs >= {58 if w > h else 70}%)')
    cam = ph.ev("()=>({t:__RTS.TOPBAR,b:__RTS.BOTTOM})")
    ok(abs(cam['t'] - g['top']) <= 1 and abs(cam['b'] - g['bot']) <= 1, f"{name}: camera geometry equals the DOM bars (TOPBAR {cam['t']} vs {g['top']:.0f}, BOTTOM {cam['b']} vs {g['bot']:.0f})")
    ok(g['sw'] <= g['vw'] + 1, f'{name}: no horizontal page overflow in game')
    over = ph.ev("()=>{const bad=[];for(const el of document.querySelectorAll('#top > *, #bottom > *, #cmd > .cb')){if(el.offsetParent===null)continue;const r=el.getBoundingClientRect();if(r.right>innerWidth+1||r.left<-1||r.bottom>innerHeight+1)bad.push(el.id||el.className)}return bad}")
    ok(not over, f'{name}: no HUD element is clipped by the viewport {over}')
    small = ph.ev("()=>[...document.querySelectorAll('#cmd .cb:not(.empty)')].filter(e=>{const r=e.getBoundingClientRect();return Math.min(r.width,r.height)<40}).length")
    ok(small == 0, f'{name}: every command button is >= 40 CSS px')

    # ---- tap select / command ---------------------------------------------------------------------
    # The target unit is stopped first: a mining Hauler drifts while the finger travels, and a tap offset from a moving unit
    # can land on a crystal patch or the Hub (where "gather"/"deliver" is the correct response, not "move").
    hid = ph.ev("()=>{const R=__RTS,u=R.G.units.find(u=>u.team===0&&u.type==='hauler'&&!u.dead);u.order={t:'idle'};u.oq=[];R.centerOn(u.x,u.y);R.render(1);const s=R.w2s(u.x,u.y);return{id:u.id,x:s.x,y:s.y}}")
    ph.tap(hid['x'], hid['y']); pg.wait_for_timeout(200)
    ok(ph.ev(f"()=>__RTS.ui.sel.length===1&&__RTS.ui.sel[0].id=={hid['id']}"), f'{name}: tap selects the Hauler under the finger')
    ok(ph.ev("()=>{const r=document.getElementById('tip');return r.classList.contains('hidden')}"), f'{name}: no stuck tooltip after a tap')
    # a screen point with verified empty ground (no unit / building / resource / neutral within the touch pad), inside the map area
    spot = ph.ev(f"""()=>{{const R=__RTS,u=R.ui.sel[0],s0=R.w2s(u.x,u.y);
      for(let r=80;r<=200;r+=20)for(let a=0;a<12;a++){{const x=s0.x+Math.cos(a/12*6.283)*r,y=s0.y+Math.sin(a/12*6.283)*r;
        if(x<40||x>innerWidth-120||y<{g['top']}+30||y>innerHeight-{g['bot']}-30)continue;
        const w=R.s2w(x,y);if(R.entityAt(w.x,w.y,40)===null&&R.canStand(w.x,w.y))return{{x,y}}}}return null}}""")
    ok(spot is not None, f'{name}: found empty ground near the unit')
    if spot:
        ph.tap(spot['x'], spot['y']); pg.wait_for_timeout(200)
        ok(ph.ev(f"()=>{{const u=__RTS.G.units.find(u=>u.id=={hid['id']});return u.order.t==='move'}}"), f'{name}: tapping empty ground with a unit selected issues a move order')

    # ---- double-tap: every Hauler on screen; hold on a unit: add it to the selection -----------------------------------------
    two = ph.ev("""()=>{const R=__RTS,hs=R.G.units.filter(u=>u.team===0&&u.type==='hauler'&&!u.dead);for(const u of hs){u.order={t:'idle'};u.oq=[]}
      const cx=hs.reduce((a,u)=>a+u.x,0)/hs.length,cy=hs.reduce((a,u)=>a+u.y,0)/hs.length;R.cam.z=R.cam.tz=0.8;R.centerOn(cx,cy);R.setSel([]);R.render(1);
      const pts=hs.map(u=>({id:u.id,...R.w2s(u.x,u.y)})).filter(p=>p.x>30&&p.x<innerWidth-130&&p.y>"""+str(g['top'])+"""+20&&p.y<innerHeight-"""+str(g['bot'])+"""-20);return{n:hs.length,pts}}""")
    if len(two['pts']) >= 2:
        a, c = two['pts'][0], two['pts'][1]
        n2 = 0
        for _try in range(5):   # the game's double-tap window is 380 ms of wall clock; two Playwright round trips on a loaded CI box can exceed it, so retry (a broken feature still fails all 5)
            ph.ev("()=>{__RTS.setSel([]);__RTS.ui.lastClick={t:0,type:null,id:0}}")
            ph.tap(a['x'], a['y']); ph.tap(a['x'], a['y']); pg.wait_for_timeout(150)
            n2 = ph.ev("()=>__RTS.ui.sel.length")
            if n2 >= 2: break
        ok(n2 >= 2, f'{name}: double-tap selects every Hauler on screen ({n2} selected)')
        ph.ev(f"()=>{{const R=__RTS,u=R.G.units.find(u=>u.id=={a['id']});R.setSel([u])}}"); pg.wait_for_timeout(100)
        ph.drag(c['x'], c['y'], c['x'], c['y'], steps=1, hold=520); pg.wait_for_timeout(150)
        ids = ph.ev("()=>__RTS.ui.sel.map(e=>e.id).sort((a,b)=>a-b)")
        ok(ids == sorted([a['id'], c['id']]), f'{name}: holding a unit adds it to the selection {ids}')
        ph.ev("()=>__RTS.setSel([])")
    else:
        ok(False, f'{name}: not enough Haulers on screen for the double-tap test ({len(two["pts"])})')

    # ---- control groups without a keyboard: the "+" chip stores the selection, a group chip recalls it --------------------------
    ph.ev("()=>{const R=__RTS;R.ui.groups={};const hs=R.G.units.filter(u=>u.team===0&&u.type==='hauler'&&!u.dead).slice(0,3);R.setSel(hs)}"); pg.wait_for_timeout(900)
    add = ph.ev("()=>{const e=document.querySelector('#groups .gchip.add');if(!e)return null;const r=e.getBoundingClientRect();return[r.left+r.width/2,r.top+r.height/2,r.width,r.height]}")
    ok(add is not None and min(add[2], add[3]) >= 34, f'{name}: a touch-sized "+" chip appears while units are selected {add}')
    if add:
        ph.tap(add[0], add[1]); pg.wait_for_timeout(200)
        ok(ph.ev("()=>(__RTS.ui.groups[1]||[]).length===3"), f'{name}: tapping "+" saves the selection as group 1')
        ph.ev("()=>__RTS.setSel([])"); pg.wait_for_timeout(900)
        chip = ph.ev("()=>{const e=document.querySelector('#groups .gchip[data-grp=\"1\"]');if(!e)return null;const r=e.getBoundingClientRect();return[r.left+r.width/2,r.top+r.height/2]}")
        ok(chip is not None, f'{name}: group 1 shows as a chip')
        if chip:
            ph.tap(*chip); pg.wait_for_timeout(200)
            ok(ph.ev("()=>__RTS.ui.sel.length===3"), f'{name}: tapping the group chip recalls the three units')
    ph.ev("()=>{__RTS.ui.groups={};__RTS.setSel([])}")

    # ---- pan ----------------------------------------------------------------------------------------
    c0 = ph.ev("()=>({x:__RTS.cam.x,y:__RTS.cam.y})")
    ph.drag(w * 0.5, g['top'] + 60, w * 0.5 - 140, g['top'] + 60 + 20); pg.wait_for_timeout(500)
    c1 = ph.ev("()=>({x:__RTS.cam.x,y:__RTS.cam.y})")
    ok(c1['x'] - c0['x'] > 60, f"{name}: one-finger drag pans the camera (dx={c1['x']-c0['x']:.0f} world px)")

    # ---- pinch zoom ---------------------------------------------------------------------------------
    z0 = ph.ev("()=>__RTS.cam.z"); ph.pinch(w * 0.5, g['top'] + 80, 60, 180); z1 = ph.ev("()=>__RTS.cam.z")
    ok(z1 > z0 * 1.2, f'{name}: pinch-out zooms in ({z0:.2f} -> {z1:.2f})')
    ph.pinch(w * 0.5, g['top'] + 80, 200, 60); z2 = ph.ev("()=>__RTS.cam.z")
    ok(z2 < z1 * 0.8, f'{name}: pinch-in zooms out ({z1:.2f} -> {z2:.2f})')

    # ---- long-press box select -----------------------------------------------------------------------
    ph.ev("()=>{const R=__RTS;R.setSel([]);const hub=R.G.buildings.find(b=>b.team===0&&b.type==='hub');R.cam.z=R.cam.tz=1;R.centerOn(hub.x,hub.y);R.render(1)}")
    for _ in range(40): pg.evaluate("()=>__RTS.step()")
    box = ph.ev("()=>{const R=__RTS;const us=R.G.units.filter(u=>u.team===0&&u.type==='hauler'&&!u.dead).map(u=>R.w2s(u.x,u.y));const x0=Math.min(...us.map(p=>p.x))-30,y0=Math.min(...us.map(p=>p.y))-30,x1=Math.max(...us.map(p=>p.x))+30,y1=Math.max(...us.map(p=>p.y))+30;return[x0,y0,x1,y1,us.length]}")
    ph.drag(box[0], box[1], box[2], box[3], steps=10, hold=520)
    n = ph.ev("()=>__RTS.ui.sel.length")
    ok(n >= 3, f'{name}: hold-then-drag box-selects several units ({n} selected)')
    ph.ev("()=>__RTS.setSel([])")

    # ---- command card tap + targeting + placement ------------------------------------------------------
    ph.ev("()=>{const R=__RTS,u=R.G.units.find(u=>u.team===0&&u.type==='hauler'&&!u.dead);R.setSel([u])}"); pg.wait_for_timeout(400)
    bpos = ph.ev("()=>{const el=document.querySelector('#cmd .cb[data-i=\"0\"]');const r=el.getBoundingClientRect();return[r.left+r.width/2,r.top+r.height/2]}")
    ph.tap(*bpos); pg.wait_for_timeout(200)
    ok(ph.ev("()=>!!__RTS.ui.target&&__RTS.ui.target.kind==='move'"), f'{name}: command-card tap arms Move targeting')
    ok(ph.ev("()=>!document.getElementById('placeBar').classList.contains('hidden')"), f'{name}: targeting shows the cancel bar')
    ph.tap(w * 0.5, g['top'] + 70); pg.wait_for_timeout(200)
    ok(ph.ev("()=>!__RTS.ui.target"), f'{name}: tapping the map completes the targeted order')
    # placement: pick a legal spot near the hub, drag the ghost there, confirm with the check button
    spot = ph.ev("()=>{const R=__RTS,hub=R.G.buildings.find(b=>b.team===0&&b.type==='hub');R.centerOn(hub.x,hub.y);R.render(1);for(let r=4;r<10;r++)for(let a=0;a<16;a++){const tx=Math.round(hub.tx+2+Math.cos(a/16*6.28)*r),ty=Math.round(hub.ty+2+Math.sin(a/16*6.28)*r);if(R.canPlace(0,'generator',tx,ty)){const s=R.w2s((tx+1)*32,(ty+1)*32);if(s.x>20&&s.x<innerWidth-20&&s.y>innerHeight*0.2&&s.y<innerHeight*0.55)return{tx,ty,x:s.x,y:s.y}}}return null}")
    if spot:
        before = ph.ev("()=>__RTS.G.buildings.filter(b=>b.team===0&&b.type==='generator').length")
        ph.ev("()=>{const R=__RTS;R.beginPlace('generator')}"); pg.wait_for_timeout(200)
        ok(ph.ev("()=>!!__RTS.ui.place"), f'{name}: build menu arms placement')
        ph.drag(spot['x'], spot['y'] + 46 + 20, spot['x'], spot['y'] + 46, steps=4); pg.wait_for_timeout(150)   # ghost sits 46 px above the finger
        gh = ph.ev("()=>({tx:__RTS.ui.place.tx,ty:__RTS.ui.place.ty,ok:__RTS.ui.place.ok})")
        ok(abs(gh['tx'] - spot['tx']) <= 1 and abs(gh['ty'] - spot['ty']) <= 1, f"{name}: dragging moves the placement ghost ({gh} vs {spot['tx']},{spot['ty']})")
        go = ph.ev("()=>{const r=document.getElementById('plGo').getBoundingClientRect();return[r.left+r.width/2,r.top+r.height/2]}")
        ph.tap(*go); pg.wait_for_timeout(300)
        placed = ph.ev("()=>{const u=__RTS.G.units.find(u=>u.team===0&&u.type==='hauler'&&u.order.t==='build');return !!u}")
        ok(placed, f'{name}: the confirm button orders the build'); ph.ev("()=>{__RTS.ui.place=null}")
    else:
        ok(False, f'{name}: could not find a legal spot for the placement test')

    # ---- minimap -------------------------------------------------------------------------------------
    ph.ev("()=>{const R=__RTS;R.setSel([]);R.cam.z=R.cam.tz=1;R.centerOn(400,400)}"); pg.wait_for_timeout(100)
    m = ph.ev("()=>{const r=document.getElementById('mm').getBoundingClientRect();return[r.left,r.top,r.width,r.height]}")
    cb = ph.ev("()=>({x:__RTS.cam.x,y:__RTS.cam.y})")
    ph.tap(m[0] + m[2] * 0.8, m[1] + m[3] * 0.8); pg.wait_for_timeout(250)
    ca = ph.ev("()=>({x:__RTS.cam.x,y:__RTS.cam.y})")
    ok(ca['x'] > cb['x'] + 500 and ca['y'] > cb['y'] + 500, f'{name}: minimap tap jumps the camera ({cb["x"]:.0f},{cb["y"]:.0f}) -> ({ca["x"]:.0f},{ca["y"]:.0f})')

    # ---- long-press help sheet (must NOT fire the button's command) --------------------------------------
    ph.ev("()=>{const R=__RTS,u=R.G.units.find(u=>u.team===0&&u.type==='hauler'&&!u.dead);R.setSel([u]);R.setOrder?0:0;u.order={t:'move',x:u.x+300,y:u.y,gs:0};u.oq=[]}"); pg.wait_for_timeout(400)
    bpos = ph.ev("()=>{const el=document.querySelector('#cmd .cb[data-i=\"1\"]');const r=el.getBoundingClientRect();return[r.left+r.width/2,r.top+r.height/2]}")   # slot 1 = Stop
    ph.t('touchStart', [tuple(bpos)]); pg.wait_for_timeout(700)
    shown = ph.ev("()=>!document.getElementById('tip').classList.contains('hidden')&&document.getElementById('tip').textContent.length>5")
    ph.t('touchEnd', []); pg.wait_for_timeout(300)
    ok(shown, f'{name}: holding a command button shows its help sheet')
    ok(ph.ev("()=>__RTS.ui.sel[0].order.t==='move'"), f'{name}: ...and the held Stop button did not stop the unit')
    ph.tap(*bpos); pg.wait_for_timeout(250)
    ok(ph.ev("()=>__RTS.ui.sel[0].order.t!=='move'"), f'{name}: a plain tap on Stop does stop it')
    ph.ev("()=>__RTS.setSel([])")
    b.close()

with sync_playwright() as p:
    run(p, 'iphone-landscape', 844, 390, 3)
    run(p, 'pixel-portrait', 412, 915, 2.625)

ok(not errs, f'no console errors/warnings/page errors {errs[:3]}')
ok(not reqs, f'zero network requests {reqs[:3]}')
print('\nALL TOUCH CHECKS PASSED' if not fails else f'\n{len(fails)} CHECK(S) FAILED:\n  ' + '\n  '.join(fails))
sys.exit(1 if fails else 0)
