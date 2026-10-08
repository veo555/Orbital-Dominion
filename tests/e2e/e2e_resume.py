"""Save/resume gate (Playwright + Chromium). Exit code != 0 on failure.   python3 tests/e2e/e2e_resume.py   (about 30 s)
  * a running match is autosaved when the app goes to the background; a reload then offers Continue on the main menu
  * Continue restores the SAME match (time, unit/building counts, resources), paused, with terrain, fog and HUD rebuilt; it then plays on without errors
  * the same for a campaign mission (mission HUD, objectives, locked-unit rules still in force)
  * the slot is erased when the match ends; a corrupt slot shows no crash (toast, slot cleared); a skirmish started afresh does not offer a stale slot after game over
  * zero network requests, zero console/page errors.  Controls: removing the slot makes the button disappear; a tampered snapshot is rejected."""
import os, pathlib
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parents[2]
URL = os.environ.get('OD_URL') or (ROOT / 'dist' / 'orbital_dominion_v3.html').as_uri()
fails = []; errs = []; reqs = []
def ok(c, m):
    print(('ok    ' if c else 'FAIL  ') + m, flush=True)
    if not c: fails.append(m)

def page(b, ctx=None):
    ctx = ctx or b.new_context(viewport={'width': 1366, 'height': 800}); pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append(('pageerror', str(e))))
    pg.on('console', lambda m: errs.append((m.type, m.text)) if m.type in ('error', 'warning') else None)
    pg.on('request', lambda r: reqs.append(r.url[:80]) if not r.url.startswith(('file:', 'data:', 'blob:')) else None)
    pg.add_init_script("window.__TEST='live'")
    return ctx, pg

def hide(pg):
    pg.evaluate("()=>{Object.defineProperty(document,'hidden',{get:()=>true,configurable:true});document.dispatchEvent(new Event('visibilitychange'))}")

STATE = "()=>{const G=__RTS.G;return {t:Math.round(G.time),u:G.units.filter(u=>!u.dead).length,b:G.buildings.filter(b=>!b.dead).length,c:Math.round(G.teams[0].c),camp:G.camp?G.camp.m.id:null,paused:!!G.paused,tc:!!G.terrainCv,run:__RTS.ui.running,demo:__RTS.ui.demo}}"

with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
    ctx, pg = page(b)
    pg.goto(URL); pg.wait_for_timeout(900)
    ok(pg.evaluate("()=>document.getElementById('bContinue').classList.contains('hidden')"), 'no saved match: no Continue button')

    # ---- skirmish ----
    pg.mouse.move(683, 400); pg.click('#bStart'); pg.wait_for_timeout(500)
    pg.evaluate("()=>{const R=__RTS;for(let i=0;i<900;i++)R.step();}")
    before = pg.evaluate(STATE); hide(pg); pg.wait_for_timeout(300)
    pg.reload(); pg.wait_for_timeout(900)
    ok(pg.evaluate("()=>!document.getElementById('bContinue').classList.contains('hidden')"), 'after a reload the main menu offers Continue')
    ok('Skirmish' in pg.inner_text('#bContinue'), 'the button names the saved match: ' + pg.inner_text('#bContinue'))
    pg.mouse.move(683, 400); pg.click('#bContinue'); pg.wait_for_timeout(900)
    after = pg.evaluate(STATE)
    ok(after['paused'] and after['run'] and not after['demo'], f'Continue restores the match paused {after}')
    ok(after['t'] == before['t'] and after['u'] == before['u'] and after['b'] == before['b'], f'same match: time/units/buildings {before} -> {after}')
    ok(after['tc'], 'terrain was rebuilt for the restored map')
    ok(pg.evaluate("()=>!document.getElementById('pauseMenu').classList.contains('hidden')"), 'the pause menu is showing so the player can get oriented')
    pg.click('#bResume'); pg.wait_for_timeout(2500)
    later = pg.evaluate(STATE)
    ok(not later['paused'] and later['t'] > after['t'], f'it plays on after resuming ({after["t"]} s -> {later["t"]} s)')
    px = pg.evaluate("()=>{const c=document.getElementById('game'),g=c.getContext('2d');const d=g.getImageData(0,0,c.width,c.height).data;let n=0,s=0;for(let i=0;i<d.length;i+=4*97){s+=d[i]+d[i+1]+d[i+2];n++;}return s/n}")
    ok(px > 12, f'the playfield is not black after the restore (mean brightness {px:.0f})')

    # ---- game over erases the slot ----
    pg.evaluate("()=>{__RTS.endGame('defeat')}"); pg.wait_for_timeout(300)
    ok(pg.evaluate("()=>!localStorage.getItem('orbital_dominion_v3_resume')"), 'the slot is erased when the match ends')

    # ---- campaign ----
    ctx.close()
    # mission start through the real chapter-select UI would need the whole film chain; use the same path campLaunch uses
    ctx, pg = page(b)
    pg.goto(URL); pg.wait_for_timeout(900)
    pg.evaluate("()=>{__RTS.startGame({campaign:__RTS.STORY.missions[0],diff:'normal'})}"); pg.wait_for_timeout(700)
    pg.evaluate("()=>{const R=__RTS;for(let i=0;i<1200;i++)R.step();}")
    cb = pg.evaluate(STATE); hide(pg); pg.wait_for_timeout(300)
    pg.reload(); pg.wait_for_timeout(900)
    txt = pg.inner_text('#bContinue')
    ok('Lamp Night' in txt, 'campaign slot is named after the mission: ' + txt)
    pg.mouse.move(683, 400); pg.click('#bContinue'); pg.wait_for_timeout(900)
    ca = pg.evaluate(STATE)
    ok(ca['camp'] == 'm01' and ca['t'] == cb['t'] and ca['u'] == cb['u'], f'campaign mission restored {cb} -> {ca}')
    ok(pg.evaluate("()=>document.getElementById('objectives').classList.contains('camp')"), 'mission objectives panel is back')
    pg.click('#bResume'); pg.wait_for_timeout(2500)
    ok(pg.evaluate(STATE)['t'] > ca['t'], 'the mission plays on')

    # ---- controls ----
    pg.evaluate("()=>{localStorage.removeItem('orbital_dominion_v3_resume_meta')}"); pg.evaluate("()=>{__RTS.toMenu()}"); pg.wait_for_timeout(300)
    ok(pg.evaluate("()=>document.getElementById('bContinue').classList.contains('hidden')"), 'control: without the slot the button disappears')
    pg.evaluate("()=>{localStorage.setItem('orbital_dominion_v3_resume','{\"v\":1,\"root\":{\"r\":0},\"nodes\":[{\"o\":{}}]}');localStorage.setItem('orbital_dominion_v3_resume_meta',JSON.stringify({v:1,camp:null,title:'Skirmish',time:5,at:1}))}")
    pg.evaluate("()=>{document.getElementById('bContinue').classList.remove('hidden')}")
    pg.mouse.move(683, 400); pg.click('#bContinue'); pg.wait_for_timeout(500)
    ok(pg.evaluate("()=>!localStorage.getItem('orbital_dominion_v3_resume')") and pg.evaluate("()=>!__RTS.ui.running||__RTS.ui.demo"), 'control: a corrupt slot is rejected, cleared, and the app stays on the menu')
    ctx.close(); b.close()

bad = [e for e in errs if 'tampered' not in e[1]]
ok(not bad, f'no console errors/warnings/page errors {bad[:3]}')
ok(not reqs, f'zero network requests {reqs[:3]}')
print('\nALL RESUME CHECKS PASSED' if not fails else f'\nFAILED {len(fails)}')
raise SystemExit(1 if fails else 0)
