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
        idx=pg.evaluate("(n)=>__RTS.ui.cmds.findIndex(c=>c&&c.name.startsWith(n))",name)
        if idx<0: log('  no cmd',name,names()); return False
        pg.locator('#cmd > *').nth(idx).click(); pg.wait_for_timeout(300); return True
    # build an army quickly: autopilot for 200 s then switch to Manual preset
    pg.evaluate("()=>{const R=__RTS;R.ovPreset('autopilot');R.G.teams[0].c=3000;for(let i=0;i<30*200;i++)R.step();R.ovPreset('manual');}"); pg.wait_for_timeout(300)
    log('time',pg.evaluate("()=>__RTS.G.time|0"),'army',pg.evaluate("()=>__RTS.G.units.filter(u=>!u.dead&&u.team===0&&!u.def.worker&&u.def.dmg).length"),'agents',pg.evaluate("()=>__RTS.G.sw.agents.length"),'on',pg.evaluate("()=>__RTS.G.sw.on"))
    pg.keyboard.press('F2'); pg.wait_for_timeout(300)
    log('sel',pg.evaluate("()=>__RTS.ui.sel.length"),names())
    log('info',info(300))
    # AI is off: roles should still be settable? press J to turn on then assign
    pg.keyboard.press('j'); pg.wait_for_timeout(600)
    clickcmd('Assign Role'); log('roles menu',names()); pg.screenshot(path=OUT+'g18_roles.png')
    if clickcmd('Guard'):
        log('guard armed: ui.target',pg.evaluate("()=>JSON.stringify(__RTS.ui.target)"),'| toast',toast()[:140])
        pg.mouse.click(700,300); pg.wait_for_timeout(600)
        log('guard set:',pg.evaluate("()=>{const a=__RTS.G.sw.agents.filter(u=>u.def.dmg&&!u.def.worker);return [a.length,a[0]&&[a[0].ag.role,a[0].ag.dm,JSON.stringify(a[0].ag.dir)].join(':')]}"),'| toast',toast()[:140])
    pg.keyboard.press('F2'); pg.wait_for_timeout(300)
    pg.keyboard.press('f'); pg.wait_for_timeout(300); log('role menu 2',names())
    if clickcmd('Patrol'):
        pg.mouse.click(500,250); pg.wait_for_timeout(300); pg.mouse.click(800,450); pg.wait_for_timeout(300)
        log('patrol state',pg.evaluate("()=>JSON.stringify(__RTS.ui.target)"),'toast',toast()[:140])
        pg.keyboard.press('Enter'); pg.wait_for_timeout(200)
        log('patrol pts',pg.evaluate("()=>{const a=__RTS.G.sw.agents.filter(u=>u.def.dmg&&!u.def.worker);return [a[0].ag.role,JSON.stringify(a[0].ag.dir)].join(':')}"))
    pg.screenshot(path=OUT+'g18_after.png')
    pg.evaluate("()=>{const R=__RTS;R.setSel([R.G.sw.agents.find(u=>u.def.dmg&&!u.def.worker)]);}"); pg.wait_for_timeout(300)
    log('single',info(600))
    pg.screenshot(path=OUT+'g18_single.png')
    # Roster tab in panel with fused view
    pg.keyboard.press('k'); pg.wait_for_timeout(300); pg.click('[data-act="tab:ro"]'); pg.wait_for_timeout(300); pg.screenshot(path=OUT+'g18_roster.png')
    log('roster',pg.evaluate("()=>document.getElementById('swBody').innerText.replace(/\\n+/g,' | ').slice(0,500)"))
    log('errors',errs); log('external',reqs)
    b.close()
