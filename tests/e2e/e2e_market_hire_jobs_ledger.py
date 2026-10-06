from playwright.sync_api import sync_playwright
import os, pathlib
ROOT=pathlib.Path(__file__).resolve().parents[2]
URL=os.environ.get('OD_URL') or (ROOT/'dist'/'orbital_dominion_v3.html').as_uri()
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
    pg.click('#bStart'); pg.wait_for_timeout(1500)
    toast=lambda: pg.evaluate("()=>[...document.querySelectorAll('#toast > *')].map(e=>e.innerText).join(' || ')")
    st=lambda: pg.evaluate("()=>({t:__RTS.G.time|0,c:Math.floor(__RTS.G.teams[0].c),ctr:__RTS.G.sw.eco.ctr.map(c=>c.id+':'+c.cad+':'+c.state+':'+c.notice),free:__RTS.G.sw.eco.free.length,units:__RTS.G.units.filter(u=>!u.dead&&u.team===0).length,agents:__RTS.G.sw.agents.length})")
    pg.keyboard.press('k'); pg.wait_for_timeout(300)
    pg.click('[data-act="preset:autopilot"]')
    pg.evaluate("()=>{const R=__RTS;R.G.teams[0].c=2500;R.G.teams[0].e=400;for(let i=0;i<30*150;i++)R.step();}")
    pg.wait_for_timeout(300)
    log('state',st())
    pg.click('[data-act="tab:mk"]'); pg.wait_for_timeout(300)
    # find a hire button that is not flagged off
    info=pg.evaluate("()=>[...document.querySelectorAll('#swBody [data-act^=\"hire:\"]')].map(b=>[b.dataset.act,b.className])")
    log('hire btn classes sample',info[:8])
    ok=[i[0] for i in info if 'off' not in i[1]]
    log('enabled hire buttons',len(ok),ok[:4])
    if ok:
        pg.click(f'#swBody [data-act="{ok[0]}"]'); pg.wait_for_timeout(400)
        log('after hire',ok[0],st(),'toast:',toast())
    # a second one, hourly
    info=pg.evaluate("()=>[...document.querySelectorAll('#swBody [data-act^=\"hire:\"]')].map(b=>[b.dataset.act,b.className])")
    ok=[i[0] for i in info if 'off' not in i[1] and i[0].endswith(':hour')]
    if ok:
        pg.click(f'#swBody [data-act="{ok[0]}"]'); pg.wait_for_timeout(400); log('after hourly',ok[0],st(),'toast:',toast())
    # task menu
    tm=pg.evaluate("()=>[...document.querySelectorAll('#swBody [data-act^=\"taskmenu:\"]')].map(b=>[b.dataset.act,b.className])")
    log('taskmenu',tm[:3])
    tmok=[t[0] for t in tm if 'off' not in t[1]]
    if tmok:
        pg.click(f'#swBody [data-act="{tmok[0]}"]'); pg.wait_for_timeout(300)
        ht=pg.evaluate("()=>[...document.querySelectorAll('#swBody [data-act^=\"hiretask:\"]')].map(b=>[b.dataset.act,b.className])")
        log('hiretask options',ht[:4])
        if ht:
            pg.click(f'#swBody [data-act="{ht[0][0]}"]'); pg.wait_for_timeout(400); log('after task hire',st(),'toast:',toast())
    pg.screenshot(path=OUT+'g15_after_hire.png')
    pg.click('[data-act="mk:ctr"]'); pg.wait_for_timeout(300); pg.screenshot(path=OUT+'g15_ctr.png')
    log('contracts',pg.evaluate("()=>document.getElementById('swBody').innerText.replace(/\\n+/g,' | ').slice(300,900)"))
    for kind in ['notice','now']:
        fb=pg.evaluate("()=>[...document.querySelectorAll('#swBody [data-act^=\"fire:\"]')].map(b=>b.dataset.act)")
        c=[f for f in fb if f.endswith(kind)]
        if c:
            pg.click(f'#swBody [data-act="{c[0]}"]'); pg.wait_for_timeout(400); log('fire',c[0],st(),'toast:',toast())
    # jobs: after autopilot we have armed units
    pg.click('[data-act="mk:jobs"]'); pg.wait_for_timeout(300)
    jb=pg.evaluate("()=>[...document.querySelectorAll('#swBody [data-act^=\"accept:\"]')].map(b=>[b.dataset.act,b.className])")
    log('accept btns',jb)
    for a,cl in jb:
        if 'off' in cl: continue
        pg.click(f'#swBody [data-act="{a}"]'); pg.wait_for_timeout(400)
        log('accept',a,'toast:',toast(),'jobs',pg.evaluate("()=>__RTS.G.sw.eco.jobs.map(j=>j.id+':'+j.state+':'+j.cad)"))
        break
    pg.screenshot(path=OUT+'g15_jobs.png')
    # let some time pass in real time and look at ledger
    pg.evaluate("()=>{for(let i=0;i<30*120;i++)__RTS.step();}"); pg.wait_for_timeout(300)
    pg.click('[data-act="tab:lg"]'); pg.wait_for_timeout(300); pg.screenshot(path=OUT+'g15_ledger.png')
    log('ledger',pg.evaluate("()=>document.getElementById('swBody').innerText.replace(/\\n+/g,' | ').slice(0,500)"))
    log('state',st())
    log('errors',errs); log('external',reqs)
    b.close()
