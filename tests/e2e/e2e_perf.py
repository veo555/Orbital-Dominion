from playwright.sync_api import sync_playwright
import os, pathlib
ROOT=pathlib.Path(__file__).resolve().parents[2]
URL=os.environ.get('OD_URL') or (ROOT/'dist'/'orbital_dominion_v4.html').as_uri()
OUT=str(ROOT/'tests'/'out')+os.sep; os.makedirs(OUT,exist_ok=True)
def log(*a): print(*a,flush=True)
with sync_playwright() as p:
    b=p.chromium.launch(args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
    pg=b.new_page(viewport={'width':1366,'height':800})
    pg.add_init_script("window.__TEST='live'")
    pg.goto(URL); pg.wait_for_timeout(1000)
    pg.fill('#seedIn','25'); pg.click('#bStart'); pg.wait_for_timeout(800)
    pg.evaluate("()=>{const R=__RTS;R.ovPreset('autopilot');R.G.teams[0].c=3000;for(let i=0;i<30*500;i++)R.step();}")
    pg.keyboard.press('k'); pg.wait_for_timeout(500)
    log('state',pg.evaluate("()=>({t:__RTS.G.time|0,agents:__RTS.G.sw.agents.length,units:__RTS.G.units.filter(u=>!u.dead).length,sup:__RTS.G.teams[0].used})"))
    # simulation step cost with swarm on
    r=pg.evaluate("()=>{const R=__RTS;const t0=performance.now();for(let i=0;i<300;i++)R.step();const a=(performance.now()-t0)/300;R.G.sw.on=false;const t1=performance.now();for(let i=0;i<300;i++)R.step();const b=(performance.now()-t1)/300;R.G.sw.on=true;return {stepMsOn:a,stepMsOff:b}}")
    log('step ms (swarm on / off):',r)
    # real frame rate with panel open
    fps=pg.evaluate("()=>new Promise(res=>{let n=0;const t0=performance.now();function f(){n++;if(performance.now()-t0<3000)requestAnimationFrame(f);else res(n/3)}requestAnimationFrame(f)})")
    log('fps (headless software render, panel open, 1366x800):',round(fps,1))
    b.close()
