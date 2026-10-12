"""Robustness gate, part 1: error boundaries, recovery dialog, boot failure, watchdog, camera / viewport guards (src/js/91_guard.js + the frame loop of 90_main.js).
   python3 tests/e2e/e2e_robust_core.py            (about 3 minutes; OD_URL=file://... points the REAL checks at a scratch build)

Every check is a FAULT-INJECTION test: it breaks something on purpose (window.__RTS.guard.inject(...) counters that make a frame stage throw, a boot fault, a slow sim
step, a NaN camera, a 0-size viewport, a DPR storm ...) and asserts that the game keeps running or shows the recovery dialog, with zero uncaught page errors where
the error is supposed to be handled.  Then the SAME check is run against a MUTANT (the readable build with the feature patched out, tests/e2e/robust_lib.py) and
must FAIL - otherwise the check cannot fail and proves nothing.
"""
import os, sys, pathlib, json
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from playwright.sync_api import sync_playwright
from robust_lib import *

R = Rec()


def alive_ticks(pg, ms=600):
    a = tick(pg); pg.wait_for_timeout(ms); return tick(pg) - a


# ---------------------------------------------------------------- checks: each returns (ok, message)
def chk_isolation(b, url):
    """a render / view / ui / sim error does not stop the others and does not escape as a page error"""
    ctx, pg, e = open_page(b, url)
    start_match(pg)
    base = alive_ticks(pg)
    pg.evaluate("()=>__RTS.guard.inject({render:2,view:1,ui:1,sim:1})")
    pg.wait_for_timeout(100)
    adv = alive_ticks(pg, 700)
    st = pg.evaluate("()=>({c:__RTS.guard.state.counts,t:__RTS.guard.state.tripped,dlg:!!document.getElementById('guardDlg')})")
    good = (not e['page'] and not st['t'] and not st['dlg'] and st['c']['render'] == 2 and st['c']['view'] == 1 and st['c']['ui'] == 1 and st['c']['sim'] == 1 and adv >= 10 and base >= 10)
    # during the render faults the sim must advance: check tick growth across a longer render fault burst (3 frames, still under the trip threshold)
    pg.evaluate("()=>__RTS.guard.reset()")
    t0 = tick(pg); pg.evaluate("()=>__RTS.guard.inject({render:3})"); pg.wait_for_timeout(500); t1 = tick(pg)
    good = good and (t1 - t0 >= 8) and not e['page']
    msg = f"counts {st['c']}, ticks/0.7s {adv}, ticks during a render burst {t1 - t0}, page errors {e['page'][:2]}, guard log lines {len(e['guard'])}"
    ctx.close(); return good, msg


def chk_trip(b, url):
    """repeated errors: pause + autosave + recovery dialog; Continue from autosave, Main menu and Reload all work"""
    ctx, pg, e = open_page(b, url)
    start_match(pg)
    pg.evaluate("()=>{localStorage.removeItem('orbital_dominion_v4_resume');localStorage.removeItem('orbital_dominion_v4_resume_meta');}")
    pg.evaluate("()=>__RTS.guard.inject({render:60})")
    try: pg.wait_for_selector('#guardDlg', timeout=4000)
    except Exception: ctx.close(); return False, f"no recovery dialog after 60 render faults (page errors {e['page'][:2]})"
    st = pg.evaluate("()=>({paused:__RTS.G.paused,tripped:__RTS.guard.state.tripped,saved:!!localStorage.getItem('orbital_dominion_v4_resume'),meta:!!localStorage.getItem('orbital_dominion_v4_resume_meta'),auto:__RTS.guard.state.autosaved,"
                     "btn:['guardReload','guardContinue','guardMenu'].map(i=>!!document.getElementById(i)),vis:document.getElementById('guardDlg').getBoundingClientRect().width>100,title:document.getElementById('guardTtl').textContent})")
    n1 = pg.evaluate("()=>__RTS.guard.state.counts.render"); pg.wait_for_timeout(500); n2 = pg.evaluate("()=>__RTS.guard.state.counts.render")
    t1 = tick(pg); pg.wait_for_timeout(300); t2 = tick(pg)
    good = st['paused'] and st['tripped'] and st['saved'] and st['meta'] and st['auto'] and all(st['btn']) and st['vis'] and n2 == n1 and t1 == t2
    msg = f"dialog {st['title']!r}, paused {st['paused']}, autosave {st['saved']}/{st['meta']}, buttons {st['btn']}, error spam stopped {n1}->{n2}, sim frozen {t1}->{t2}"
    if not good: ctx.close(); return False, msg
    # Continue from autosave
    pg.evaluate("()=>__RTS.guard.inject({render:0})")
    pg.click('#guardContinue'); pg.wait_for_timeout(900)
    c = pg.evaluate("()=>({dlg:!!document.getElementById('guardDlg'),running:__RTS.ui.running&&!__RTS.ui.demo,paused:__RTS.G.paused,tripped:__RTS.guard.state.tripped,units:__RTS.G.units.length})")
    good = not c['dlg'] and c['running'] and c['paused'] and not c['tripped'] and c['units'] > 5
    msg += f"; Continue -> {c}"
    if not good: ctx.close(); return False, msg
    pg.evaluate("()=>{__RTS.togglePause()}"); pg.wait_for_timeout(100)
    adv = alive_ticks(pg, 500); good = adv >= 8; msg += f"; the restored match plays on ({adv} ticks)"
    if not good: ctx.close(); return False, msg
    # trip again -> Main menu
    pg.evaluate("()=>__RTS.guard.inject({render:60})"); pg.wait_for_selector('#guardDlg', timeout=4000)
    pg.evaluate("()=>__RTS.guard.inject({render:0})")
    pg.click('#guardMenu'); pg.wait_for_timeout(900)
    m = pg.evaluate("()=>({dlg:!!document.getElementById('guardDlg'),menu:!document.getElementById('menu').classList.contains('hidden'),demo:__RTS.ui.demo,tripped:__RTS.guard.state.tripped})")
    adv = alive_ticks(pg, 500)
    good = not m['dlg'] and m['menu'] and m['demo'] and not m['tripped'] and adv >= 8
    msg += f"; Main menu -> {m}, demo ticks {adv}"
    if not good: ctx.close(); return False, msg
    # trip in the menu demo -> Reload really reloads
    pg.evaluate("()=>__RTS.guard.inject({render:60})"); pg.wait_for_selector('#guardDlg', timeout=4000)
    pg.evaluate("()=>{window.__marker=1}")
    with pg.expect_navigation(timeout=15000): pg.click('#guardReload')
    pg.wait_for_function("()=>!!(window.__RTS&&__RTS.G)", timeout=15000)
    fresh = pg.evaluate("()=>window.__marker===undefined&&!document.getElementById('guardDlg')")
    good = fresh; msg += f"; Reload -> fresh page {fresh}"
    ctx.close(); return good, msg


def chk_global(b, url):
    """a burst of uncaught errors (event handlers, timers, rejections) is logged and trips the breaker too"""
    ctx, pg, e = open_page(b, url)
    start_match(pg)
    pg.evaluate("()=>{for(let i=0;i<8;i++)setTimeout(()=>{throw new Error('flood '+i)},i);for(let i=0;i<2;i++)Promise.reject(new Error('rej '+i));}")
    try: pg.wait_for_selector('#guardDlg', timeout=4000); dlg = True
    except Exception: dlg = False
    st = pg.evaluate("()=>({g:__RTS.guard.state.counts.global,paused:__RTS.G.paused})")
    ctx.close()
    return dlg and st['g'] >= 6 and st['paused'], f"dialog {dlg}, global errors counted {st['g']}, paused {st['paused']}"


def chk_boot(b, url):
    """boot() throwing shows the 'could not start' dialog (Reload) instead of a dead page, with no uncaught error"""
    ctx, pg, e = open_page(b, url, init="window.__FAULT_BOOT=true")
    try: pg.wait_for_selector('#guardDlg', timeout=6000); dlg = True
    except Exception: dlg = False
    info = pg.evaluate("()=>({t:(document.getElementById('guardTtl')||{}).textContent,rel:!!document.getElementById('guardReload'),cont:!!document.getElementById('guardContinue')})") if dlg else {}
    ctx.close()
    return dlg and info.get('t') == 'The game could not start' and info.get('rel') and not info.get('cont') and not e['page'], f"dialog {dlg} {info}, page errors {e['page'][:2]}"


def chk_watchdog(b, url):
    """a sim step that takes 300 ms, again and again, sheds work (2 steps / 40 ms budget per frame) instead of freezing the page; recovers when steps are fast again"""
    ctx, pg, e = open_page(b, url)
    start_match(pg)
    pg.evaluate("()=>{window.__fc=0;(function f(){window.__fc++;requestAnimationFrame(f)})()}")
    pg.evaluate("()=>{__RTS.G.speed=3}")           # a fast game makes the step loop want many steps per frame
    pg.evaluate("()=>__RTS.guard.inject({stepMs:300})")
    pg.wait_for_timeout(5000)
    st = pg.evaluate("()=>({shed:__RTS.guard.state.shed,events:__RTS.guard.state.shedEvents,fc:window.__fc,last:__RTS.guard.state.lastStepMs})")
    import time
    t = time.time(); pg.evaluate("()=>1"); rt = time.time() - t
    good = st['shed'] and st['fc'] >= 8 and st['last'] < 1200 and rt < 2.0
    msg = f"shed {st['shed']} ({st['events']} event), {st['fc']} frames in 5 s, last frame's sim time {st['last']:.0f} ms, page round trip {rt * 1000:.0f} ms"
    if not good: ctx.close(); return False, msg
    pg.evaluate("()=>{__RTS.guard.inject({stepMs:0});__RTS.G.speed=1}")
    pg.wait_for_function("()=>!__RTS.guard.state.shed", timeout=40000)
    msg += "; back to normal mode after fast frames"
    ctx.close(); return True, msg


def chk_camera(b, url):
    ctx, pg, e = open_page(b, url)
    start_match(pg)
    pg.evaluate("()=>{const c=__RTS.cam;c.x=NaN;c.y=Infinity;c.z=NaN;c.tz=NaN;}")
    pg.wait_for_timeout(400)
    st = pg.evaluate("()=>({fin:[__RTS.cam.x,__RTS.cam.y,__RTS.cam.z,__RTS.cam.tz].every(Number.isFinite),z:__RTS.cam.z,n:__RTS.guard.state.counts.camera,r:__RTS.guard.state.counts.render})")
    pg.evaluate("()=>{__RTS.cam.z=__RTS.cam.tz=-3;__RTS.cam.x=1e308*10;}"); pg.wait_for_timeout(300)
    st2 = pg.evaluate("()=>[__RTS.cam.x,__RTS.cam.y,__RTS.cam.z,__RTS.cam.tz].every(Number.isFinite)&&__RTS.cam.z>0")
    adv = alive_ticks(pg, 400)
    ctx.close()
    return st['fin'] and st['z'] > 0 and st['n'] >= 1 and st2 and adv >= 6 and not e['page'], f"camera repaired {st}, again {st2}, ticks {adv}, page errors {e['page'][:2]}"


def chk_viewport(b, url):
    ctx, pg, e = open_page(b, url)
    start_match(pg)
    before = pg.evaluate("()=>({w:document.getElementById('game').width,h:document.getElementById('game').height})")
    # 1. a 0-size viewport (hidden iframe / transient state): the canvas keeps its last good size, nothing throws, the sim goes on
    pg.evaluate("()=>{window.__d=['innerWidth','innerHeight','devicePixelRatio'].map(k=>[k,Object.getOwnPropertyDescriptor(window,k)]);Object.defineProperty(window,'innerWidth',{value:0,configurable:true});Object.defineProperty(window,'innerHeight',{value:0,configurable:true});window.dispatchEvent(new Event('resize'));}")
    pg.wait_for_timeout(300)
    z = pg.evaluate("()=>({w:document.getElementById('game').width,h:document.getElementById('game').height,fin:[__RTS.cam.x,__RTS.cam.y,__RTS.cam.z].every(Number.isFinite)})")
    adv = alive_ticks(pg, 300)
    # 2. back to normal: the canvas follows
    pg.evaluate("()=>{for(const [k,d] of window.__d)if(k!=='devicePixelRatio'){if(d)Object.defineProperty(window,k,d);else delete window[k];}window.dispatchEvent(new Event('resize'));}")
    pg.wait_for_timeout(300)
    back = pg.evaluate("()=>({w:document.getElementById('game').width,iw:window.innerWidth,d:__RTS.DPR})")
    # 3. nonsense DPR values never reach the canvas
    dprs = []
    for v in ('0', 'NaN', '-2', 'Infinity', '1.5'):
        pg.evaluate(f"()=>{{Object.defineProperty(window,'devicePixelRatio',{{get:()=>{v},configurable:true}});window.dispatchEvent(new Event('resize'));}}")
        pg.wait_for_timeout(120)
        dprs.append(pg.evaluate("()=>({w:document.getElementById('game').width,d:__RTS.DPR})"))
    pg.evaluate("()=>{const d=window.__d.find(x=>x[0]==='devicePixelRatio')[1];if(d)Object.defineProperty(window,'devicePixelRatio',d);else delete window.devicePixelRatio;window.dispatchEvent(new Event('resize'));}"); pg.wait_for_timeout(200)
    dpr_ok = all(x['w'] > 0 and x['d'] > 0 and x['d'] < 100 for x in dprs)
    # 4. an orientation-change storm: 80 events in ~100 ms become a handful of real resizes, and the final size is right
    runs0 = pg.evaluate("()=>__RTS.guard.state.rvRuns||0")
    pg.evaluate("()=>{for(let i=0;i<40;i++){window.dispatchEvent(new Event('resize'));window.dispatchEvent(new Event('orientationchange'));}}")
    pg.set_viewport_size({'width': 800, 'height': 1200}); pg.wait_for_timeout(120)
    pg.set_viewport_size({'width': 1280, 'height': 640}); pg.wait_for_timeout(500)
    runs = pg.evaluate("()=>(__RTS.guard.state.rvRuns||0)") - runs0
    fin = pg.evaluate("()=>({w:document.getElementById('game').width,iw:window.innerWidth,d:__RTS.DPR})")
    storm_ok = runs <= 12 and fin['w'] == int(fin['iw'] * fin['d'])
    ctx.close()
    good = (z['w'] == before['w'] and z['h'] == before['h'] and z['fin'] and adv >= 4 and back['w'] == int(back['iw'] * back['d']) and dpr_ok and storm_ok and not e['page'])
    return good, f"0-size kept {before} -> {z}, ticks {adv}; restored {back}; DPR sweep {[(x['w'], round(x['d'], 2)) for x in dprs]}; storm: {runs} real resizes, final {fin}; page errors {e['page'][:2]}"


# ---------------------------------------------------------------- mutants: (name, check, patches)
MUTANTS = [
    ('render stage unguarded', chk_isolation, [("guardRun('render',frameRender,dt,t);", "frameRender(dt,t);")]),
    ('breaker never trips', chk_trip, [("S.errTimes.length>S.cfg.max", "S.errTimes.length>1e9")]),
    ('no autosave on trip', chk_trip, [("saved=typeof resumeWrite==='function'&&!!resumeWrite();", "saved=false;")]),
    ('global error handler missing', chk_global, [("window.addEventListener('error',e=>{", "window.addEventListener('xerror',e=>{"), ("window.addEventListener('unhandledrejection',e=>{", "window.addEventListener('xunhandledrejection',e=>{")]),
    ('boot not guarded', chk_boot, [("function boot(){try{guardInstall();bootInner();}catch(e){guardBootFailed(e);}}", "function boot(){guardInstall();bootInner();}")]),
    ('no shedding, no frame budget', chk_watchdog, [("if(now-t0>budget)break;", ""), ("if(++S.slowFrames>=3)guardShed(true);", "")]),
    ('camera not repaired', chk_camera, [("function guardCam(){\n", "function guardCam(){return;\n")]),
    ('viewport always accepted', chk_viewport, [("return w>=8&&h>=8&&isFinite(w)&&isFinite(h)&&(d===undefined||(d>0&&isFinite(d)));", "return true;")]),
    ('resize storm not coalesced', chk_viewport, [("if(now-S.rvT<30){if(!S.rvQ)", "if(false){if(!S.rvQ)")]),
]

CHECKS = [('error isolation (render/view/ui/sim faults)', chk_isolation), ('breaker + recovery dialog + autosave + Continue/Menu/Reload', chk_trip), ('global error flood', chk_global),
          ('boot failure dialog', chk_boot), ('slow-step watchdog / shed mode', chk_watchdog), ('NaN / Infinity camera', chk_camera), ('0-size viewport, DPR sweep, orientation storm', chk_viewport)]

with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
    ONLY = os.environ.get('ONLY', '')          # ONLY=viewport runs just the checks / mutants whose name contains it (development aid)
    for name, chk in CHECKS:
        if ONLY and ONLY not in name: continue
        try: good, msg = chk(b, URL)
        except Exception as ex: good, msg = False, f'exception {type(ex).__name__}: {str(ex)[:200]}'
        R.ok(good, f'{name}: {msg}')
    for name, chk, patches in MUTANTS:
        if ONLY and ONLY not in name: continue
        url = mutant_url(patches)
        try: good, msg = chk(b, url)
        except Exception as ex: good, msg = False, f'exception {type(ex).__name__}'
        R.ok(not good, f'MUTANT "{name}" is caught: {"the check FAILED as it must (" + msg[:140] + ")" if not good else "NOT CAUGHT - the check cannot fail: " + msg[:160]}')
    b.close()
R.done('ROBUSTNESS (CORE)')
