from playwright.sync_api import sync_playwright
import collections
import os, pathlib
ROOT=pathlib.Path(__file__).resolve().parents[2]
URL=os.environ.get('OD_URL') or (ROOT/'dist'/'orbital_dominion_v3.html').as_uri()
OUT=str(ROOT/'tests'/'out')+os.sep; os.makedirs(OUT,exist_ok=True)
def log(*a): print(*a,flush=True)
with sync_playwright() as p:
    b=p.chromium.launch(args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
    for seed in [101,102,103,104,105,106]:
      pg=b.new_page(viewport={'width':1366,'height':800})
      pg.add_init_script("window.__TEST='live'")
      pg.goto(URL); pg.wait_for_timeout(800)
      pg.fill('#seedIn',str(seed))
      pg.click('#bStart'); pg.wait_for_timeout(800)
      pg.evaluate("""()=>{window.__st={};const t=document.getElementById('toast');const ap=t.appendChild.bind(t);t.appendChild=function(n){if(/Generators/.test(n.innerText||n.textContent)){const k=new Error().stack.split('\\n').slice(2,7).map(s=>s.trim().replace(/\\(.*\\//,'(').replace(/file:.*:(\\d+:\\d+)/,'$1')).join(' < ');window.__st[k]=(window.__st[k]||0)+1;}return ap(n);};}""")
      pg.evaluate("()=>{const R=__RTS;R.ovPreset('autopilot');for(let i=0;i<30*600;i++){R.step();}}")
      pg.wait_for_timeout(300)
      log(pg.evaluate("()=>JSON.stringify(window.__st,null,1)"))
      log('t',pg.evaluate("()=>[__RTS.G.time|0,__RTS.G.over,__RTS.G.teams[0].used,__RTS.G.teams[0].cap,__RTS.G.seed]"))
      pg.close()
    b.close()
