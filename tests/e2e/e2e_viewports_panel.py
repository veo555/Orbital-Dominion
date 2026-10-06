from playwright.sync_api import sync_playwright
import os, pathlib
ROOT=pathlib.Path(__file__).resolve().parents[2]
URL=os.environ.get('OD_URL') or (ROOT/'dist'/'orbital_dominion_v3.html').as_uri()
OUT=str(ROOT/'tests'/'out')+os.sep; os.makedirs(OUT,exist_ok=True)
errs=[]
def log(*a): print(*a,flush=True)
with sync_playwright() as p:
    b=p.chromium.launch(args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
    for (w,h) in [(1024,640),(800,600),(1920,1080)]:
        pg=b.new_page(viewport={'width':w,'height':h})
        pg.on('pageerror',lambda e: errs.append(('pageerror',str(e))))
        pg.on('console',lambda m: errs.append((m.type,m.text)) if m.type in('error','warning') else None)
        pg.add_init_script("window.__TEST='live'")
        pg.goto(URL); pg.wait_for_timeout(1000)
        pg.click('#bStart'); pg.wait_for_timeout(1000)
        pg.evaluate("()=>{const R=__RTS;R.ovPreset('autopilot');R.G.teams[0].c=1500;for(let i=0;i<30*150;i++)R.step();}")
        pg.keyboard.press('k'); pg.wait_for_timeout(500)
        pg.click('[data-act="tab:mk"]'); pg.wait_for_timeout(300)
        pg.screenshot(path=OUT+f'g20_{w}.png')
        m=pg.evaluate("""()=>{const r=e=>{const b=document.getElementById(e).getBoundingClientRect();return [Math.round(b.left),Math.round(b.top),Math.round(b.right),Math.round(b.bottom)]};
          return {panel:r('swPanel'),top:r('top'),bottom:r('bottom'),sw:[innerWidth,innerHeight],hscroll:document.documentElement.scrollWidth>innerWidth,topWrap:document.getElementById('top').scrollWidth>document.getElementById('top').clientWidth}}""")
        log(w,h,m)
        pg.close()
    log('errors',errs)
    b.close()
