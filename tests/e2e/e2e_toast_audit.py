from playwright.sync_api import sync_playwright
import collections
import os, pathlib
ROOT=pathlib.Path(__file__).resolve().parents[2]
URL=os.environ.get('OD_URL') or (ROOT/'dist'/'orbital_dominion_v4.html').as_uri()
OUT=str(ROOT/'tests'/'out')+os.sep; os.makedirs(OUT,exist_ok=True)
errs=[]
def log(*a): print(*a,flush=True)
with sync_playwright() as p:
    b=p.chromium.launch(args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
    pg=b.new_page(viewport={'width':1366,'height':800})
    pg.on('pageerror',lambda e: errs.append(('pageerror',str(e))))
    pg.on('console',lambda m: errs.append((m.type,m.text)) if m.type in('error','warning') else None)
    pg.add_init_script("window.__TEST='live'")
    pg.goto(URL); pg.wait_for_timeout(1200)
    pg.click('#bStart'); pg.wait_for_timeout(1000)
    pg.evaluate("""()=>{window.__toasts=[];new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes)if(n.nodeType===1)window.__toasts.push([Math.floor(__RTS.G.time),n.className,n.innerText]);}).observe(document.getElementById('toast'),{childList:true});}""")
    pg.evaluate("()=>{const R=__RTS;R.ovPreset('autopilot');for(let i=0;i<30*600;i++){R.step();if(i%15===0){R.G.teams[0].c+=0;}}}")
    pg.wait_for_timeout(500)
    ts=pg.evaluate("()=>window.__toasts")
    cnt=collections.Counter((c,t) for _,c,t in ts)
    log('total toasts in 600 s of Autopilot:',len(ts))
    for (c,t),n in cnt.most_common(25): log(n,c,t[:90])
    log('t',pg.evaluate("()=>__RTS.G.time|0"),'over',pg.evaluate("()=>__RTS.G.over"))
    log('errors',errs)
    b.close()
