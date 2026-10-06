from playwright.sync_api import sync_playwright
import os, pathlib
ROOT=pathlib.Path(__file__).resolve().parents[2]
URL=os.environ.get('OD_URL') or (ROOT/'dist'/'orbital_dominion_v3.html').as_uri()
OUT=str(ROOT/'tests'/'out')+os.sep; os.makedirs(OUT,exist_ok=True)
def log(*a): print(*a,flush=True)
with sync_playwright() as p:
    b=p.chromium.launch(args=['--no-sandbox'])
    for (w,h) in [(1366,768),(1280,720),(1180,700),(1100,700),(1024,640),(960,600),(900,600),(800,600),(700,600)]:
        pg=b.new_page(viewport={'width':w,'height':h})
        pg.add_init_script("window.__TEST='live'")
        pg.goto(URL); pg.wait_for_timeout(600)
        pg.click('#bStart'); pg.wait_for_timeout(600)
        m=pg.evaluate("""()=>{const t=document.getElementById('top');const kids=[...t.children].filter(e=>getComputedStyle(e).display!=='none');const last=kids[kids.length-1].getBoundingClientRect();return {over:t.scrollWidth>t.clientWidth,lastRight:Math.round(last.right),menuVisible:document.getElementById('bMenu').getBoundingClientRect().right<=innerWidth+1}}""")
        log(w,h,m)
        pg.screenshot(path=OUT+f'g21_{w}.png')
        pg.close()
    b.close()
