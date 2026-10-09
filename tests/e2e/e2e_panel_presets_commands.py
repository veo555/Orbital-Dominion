from playwright.sync_api import sync_playwright
import os, pathlib
ROOT=pathlib.Path(__file__).resolve().parents[2]
URL=os.environ.get('OD_URL') or (ROOT/'dist'/'orbital_dominion_v4.html').as_uri()
OUT=str(ROOT/'tests'/'out')+os.sep; os.makedirs(OUT,exist_ok=True)
errs=[];reqs=[]
def log(*a): print(*a,flush=True)
with sync_playwright() as p:
    b=p.chromium.launch(args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
    pg=b.new_page(viewport={'width':1366,'height':800})
    pg.on('pageerror',lambda e: errs.append(('pageerror',str(e))))
    pg.on('console',lambda m: errs.append((m.type,m.text)) if m.type in('error','warning') else None)
    pg.on('requestfailed',lambda r: errs.append(('requestfailed',r.url[:80])))
    pg.on('request',lambda r: reqs.append(r.url[:70]) if not r.url.startswith(('file:','data:','blob:')) else None)
    pg.add_init_script("window.__TEST='live'")
    pg.goto(URL); pg.wait_for_timeout(1500)
    log('menu visible', pg.evaluate("()=>!document.getElementById('menu').classList.contains('hidden')"))
    pg.click('#bStart'); pg.wait_for_timeout(2500)
    log('hud', pg.evaluate("()=>({sw:document.getElementById('swSt').textContent,w:document.getElementById('swW').textContent,on:document.getElementById('swOnT').textContent,t:document.getElementById('clock').textContent})"))
    pg.screenshot(path=OUT+'g13_game.png')
    # open panel with K
    pg.keyboard.press('k'); pg.wait_for_timeout(500)
    log('panel open', pg.evaluate("()=>!document.getElementById('swPanel').classList.contains('hidden')"))
    pg.screenshot(path=OUT+'g13_panel.png')
    log('tabs', pg.evaluate("()=>[...document.querySelectorAll('#swTabs button')].map(b=>b.textContent)"))
    # presets
    for pr in ['manual','autopilot','advisor']:
        pg.click(f'[data-act="preset:{pr}"]'); pg.wait_for_timeout(120)
        log('preset',pr,pg.evaluate("()=>({chip:document.getElementById('swSt').textContent,mode:(__RTS.G.sw.on?'on':'off'),dom:JSON.stringify(__RTS.G.sw.dom)})"))
    # NL command
    pg.fill('#swIn','keep 14 miners'); pg.keyboard.press('Enter'); pg.wait_for_timeout(400)
    log('out1', pg.evaluate("()=>document.getElementById('swOut').innerText.slice(0,200)"))
    pg.fill('#swIn','build 2 generators'); pg.click('[data-act="send"]'); pg.wait_for_timeout(400)
    log('out2', pg.evaluate("()=>document.getElementById('swOut').innerText.slice(0,200)"))
    pg.fill('#swIn','blorp the frobnicator'); pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
    log('out3', pg.evaluate("()=>document.getElementById('swOut').innerText.slice(0,200)"))
    # example chip
    pg.click('#swEx button >> nth=0'); pg.wait_for_timeout(300)
    log('ex0 value', pg.evaluate("()=>document.getElementById('swIn').value"), '|', pg.evaluate("()=>document.getElementById('swOut').innerText.slice(0,120)"))
    log('standing', pg.evaluate("()=>JSON.stringify(__RTS.G.sw.pol)"))
    pg.screenshot(path=OUT+'g13_cmd.png')
    # tabs
    for tab in ['ro','mk','lg','ov']:
        btn=pg.query_selector(f'[data-act="tab:{tab}"]')
        if btn:
            btn.click(); pg.wait_for_timeout(300); pg.screenshot(path=OUT+f'g13_tab_{tab}.png')
            log('tab',tab,'ok; body len',pg.evaluate("()=>document.getElementById('swBody').innerText.length"))
        else: log('tab',tab,'MISSING')
    log('errors',errs); log('external',reqs)
    b.close()
