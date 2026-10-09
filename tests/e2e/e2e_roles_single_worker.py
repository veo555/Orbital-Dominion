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
    pg.on('request',lambda r: reqs.append(r.url[:70]) if not r.url.startswith(('file:','data:','blob:')) else None)
    pg.add_init_script("window.__TEST='live'")
    pg.goto(URL); pg.wait_for_timeout(1200)
    pg.click('#bStart'); pg.wait_for_timeout(1200)
    names=lambda: pg.evaluate("()=>__RTS.ui.cmds.map((c,i)=>c?i+':'+c.name:null).filter(Boolean)")
    info=lambda n=500: pg.evaluate("()=>document.getElementById('info').innerText.replace(/\\n+/g,' | ').slice(0,%d)"%n)
    toast=lambda: pg.evaluate("()=>[...document.querySelectorAll('#toast > *')].map(e=>e.innerText).join(' || ')")
    def clickcmd(name):
        idx=pg.evaluate("(n)=>__RTS.ui.cmds.findIndex(c=>c&&c.name===n)",name)
        if idx<0: log('  no cmd',name); return False
        pg.locator('#cmd > *').nth(idx).click(); pg.wait_for_timeout(300); return True
    pg.evaluate("()=>{const R=__RTS;R.setSel(R.G.units.filter(u=>!u.dead&&u.team===0&&u.def.worker).slice(0,3));}"); pg.wait_for_timeout(300)
    log('cmds',names())
    clickcmd('Enroll as Agents'); log('enrolled',pg.evaluate("()=>__RTS.G.sw.agents.length"),toast()[:100])
    clickcmd('Assign Role'); log('roles menu',names()); pg.screenshot(path=OUT+'g17_roles.png')
    clickcmd('Builder'); log('roles now',pg.evaluate("()=>__RTS.G.sw.agents.map(u=>u.ag.role+':'+u.ag.dm+':'+u.ag.why)"),toast()[:100])
    log('info',info(500))
    # Guard post: click role, then click map
    pg.keyboard.press('f'); pg.wait_for_timeout(300)
    if clickcmd('Guard'):
        log('guard armed: ui.target',pg.evaluate("()=>JSON.stringify(__RTS.ui.target)"),'| toast',toast()[:120])
        pg.mouse.click(700,300); pg.wait_for_timeout(500)
        log('guard set:',pg.evaluate("()=>__RTS.G.sw.agents.map(u=>[u.ag.role,u.ag.dm,JSON.stringify(u.ag.dir),u.order.t].join(':'))"))
    pg.screenshot(path=OUT+'g17_guard.png')
    # re-select one agent (via click on the minimap? use API), read info
    pg.evaluate("()=>{const R=__RTS;R.setSel([R.G.sw.agents[0]]);}"); pg.wait_for_timeout(400)
    log('single info',info(700))
    pg.screenshot(path=OUT+'g17_single.png')
    # manual order override: right-click map -> agent switches to dm=set?
    pg.mouse.click(500,420,button='right'); pg.wait_for_timeout(500)
    log('after right-click:',pg.evaluate("()=>{const u=__RTS.G.sw.agents[0];return [u.order.t,u.ag.dm,u.ag.role,u.ag.why]}"))
    clickcmd('Assign Role'); clickcmd('Auto'); 
    log('auto again:',pg.evaluate("()=>{const u=__RTS.G.sw.agents[0];return [u.ag.dm,u.ag.role]}"),toast()[:120])
    clickcmd('Release Agents'); log('released:',pg.evaluate("()=>__RTS.G.sw.agents.length"),toast()[:100])
    log('errors',errs); log('external',reqs)
    b.close()
