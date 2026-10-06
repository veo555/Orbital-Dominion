from playwright.sync_api import sync_playwright
import os, pathlib
ROOT=pathlib.Path(__file__).resolve().parents[2]
URL=os.environ.get('OD_URL') or (ROOT/'dist'/'orbital_dominion_v3.html').as_uri()
OUT=str(ROOT/'tests'/'out')+os.sep; os.makedirs(OUT,exist_ok=True)
errs=[]
def log(*a): print(*a,flush=True)
with sync_playwright() as p:
    b=p.chromium.launch(args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
    pg=b.new_page(viewport={'width':1440,'height':860})
    pg.on('pageerror',lambda e: errs.append(('pageerror',str(e))))
    pg.on('console',lambda m: errs.append((m.type,m.text)) if m.type in('error','warning') else None)
    pg.add_init_script("window.__TEST='live'")
    pg.goto(URL); pg.wait_for_timeout(1500); pg.screenshot(path=OUT+'g23_menu.png')
    pg.fill('#seedIn','24'); pg.click('#bStart'); pg.wait_for_timeout(1000)
    pg.evaluate("()=>{const R=__RTS;R.ovPreset('autopilot');R.G.teams[0].c=1200;for(let i=0;i<30*260;i++)R.step();}")
    pg.keyboard.press('F2'); pg.wait_for_timeout(500)
    pg.keyboard.press('k'); pg.wait_for_timeout(300)
    pg.screenshot(path=OUT+'g23_army_overseer.png')
    pg.click('[data-act="tab:ro"]'); pg.wait_for_timeout(300); pg.screenshot(path=OUT+'g23_roster.png')
    pg.click('[data-act="tab:lg"]'); pg.wait_for_timeout(300); pg.screenshot(path=OUT+'g23_ledger.png')
    log('errors',errs)
    b.close()
