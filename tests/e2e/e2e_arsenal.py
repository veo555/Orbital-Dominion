"""ARSENAL browser gate (desktop + touch): build a Research Lab through the build menu, research Barrier Field tier I, train a Marksman from the Lab, select it and use
Snipe with targeting (desktop: click the card then click the enemy; touch: tap the card then tap the enemy), check cooldown sweep / energy cost / autocast switch on the card,
the info card lines, the help text, zero page errors and zero network requests.   python3 tests/e2e/e2e_arsenal.py   (OD_URL=file:///.../dist/orbital_dominion_v4.html)
Mutation proofs: tools/mutate.py (see docs/DESIGN_ARSENAL.md section 9)."""
import os, sys, pathlib
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parents[2]
URL = os.environ.get('OD_URL') or (ROOT / 'dist' / 'orbital_dominion_v4.html').as_uri()
fails = []; errs = []; reqs = []
def ok(c, m):
    print(('ok    ' if c else 'FAIL  ') + m, flush=True)
    if not c: fails.append(m)

def card(pg, name):
    pg.evaluate("()=>{__RTS.renderCmdCard()}")
    return pg.evaluate("(n)=>__RTS.ui.cmds.findIndex(c=>c&&c.name.indexOf(n)===0)", name)

def press(pg, touch, i):
    sel = f'#cmd .cb[data-i="{i}"]'
    if touch: pg.touchscreen.tap(*center(pg, sel))
    else: pg.click(sel)
    pg.wait_for_timeout(120)

def center(pg, sel):
    r = pg.evaluate("(s)=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return[r.left+r.width/2,r.top+r.height/2]}", sel)
    return r

def run(p, touch):
    tag = 'touch' if touch else 'desktop'
    b = p.chromium.launch(args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
    ctx = b.new_context(viewport={'width': 844, 'height': 390} if touch else {'width': 1366, 'height': 800}, device_scale_factor=2 if touch else 1, is_mobile=touch, has_touch=touch)
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append((tag, 'pageerror', str(e))))
    pg.on('console', lambda m: errs.append((tag, m.type, m.text)) if m.type in ('error', 'warning') else None)
    pg.on('request', lambda r: reqs.append(r.url[:80]) if not r.url.startswith(('file:', 'data:', 'blob:')) else None)
    pg.add_init_script("window.__TEST='live'")
    pg.goto(URL); pg.wait_for_timeout(900)
    pg.evaluate("()=>{__RTS.SET.faction='aurora';__RTS.SET.enemy='meridian';__RTS.startGame()}"); pg.wait_for_timeout(900)
    if not touch: pg.mouse.move(683, 400)
    # economy + prerequisites (the Armory is not what is under test)
    pg.evaluate("""()=>{const R=__RTS,G=R.G,T=G.teams[0],h=G.buildings.find(b=>b.team===0&&b.type==='hub');T.c=5000;T.e=5000;T.era=2;
      R.addBuilding('generator',0,Math.round(h.x/32)+6,Math.round(h.y/32)-3,true);R.addBuilding('generator',0,Math.round(h.x/32)+8,Math.round(h.y/32)-3,true);R.addBuilding('generator',0,Math.round(h.x/32)+10,Math.round(h.y/32)-3,true);
      R.addBuilding('garrison',0,Math.round(h.x/32)-12,Math.round(h.y/32)+4,true);R.addBuilding('armory',0,Math.round(h.x/32)-12,Math.round(h.y/32)-1,true);
      G.vis[0].fill(2);R.recalcTeams();return 1}""")
    # --- build the Lab through the build menu
    pg.evaluate("()=>{const R=__RTS,h=R.G.units.find(u=>u.team===0&&u.def.worker);R.setSel([h]);R.hudUpdate&&R.hudUpdate(0.1);}"); pg.wait_for_timeout(300)
    bi = card(pg, 'Advanced Structures'); ok(bi >= 0, f'{tag}: the worker has an Advanced Structures card')
    press(pg, touch, bi); pg.wait_for_timeout(200)
    li = card(pg, 'Research Lab'); ok(li >= 0, f'{tag}: the Research Lab is on the second build page')
    ok(pg.evaluate("()=>__RTS.ui.cmds.filter(c=>c).length")<=12 and pg.evaluate("()=>__RTS.BUILD_PAGES.every(p=>p.length<=8)"), f'{tag}: build pages stay within the 12-slot card (44 px targets are checked by e2e_touch)')
    press(pg, touch, li)
    ok(pg.evaluate("()=>!!__RTS.ui.place&&__RTS.ui.place.id==='lab'"), f'{tag}: choosing the Lab enters placement mode')
    spot = pg.evaluate("""()=>{const R=__RTS,h=R.G.buildings.find(b=>b.team===0&&b.type==='hub');for(let r=8;r<22;r++)for(let k=0;k<24;k++){const a=k/24*6.283,tx=Math.round(h.x/32+Math.cos(a)*r)-1,ty=Math.round(h.y/32+Math.sin(a)*r)-1;if(R.canPlace(0,'lab',tx,ty,true))return[tx,ty];}return null}""")
    pg.evaluate("([tx,ty])=>{const R=__RTS;R.ui.place.tx=tx;R.ui.place.ty=ty;R.ui.place.ok=true;R.tryPlace(false);}", spot)
    ok(pg.evaluate("()=>__RTS.G.units.some(u=>u.order.t==='build'&&u.order.type==='lab')||__RTS.G.buildings.some(b=>b.type==='lab'&&b.team===0)"), f'{tag}: the Lab is ordered')
    pg.evaluate("()=>{const R=__RTS;for(let i=0;i<30*400&&!R.G.buildings.some(b=>b.type==='lab'&&b.done&&b.team===0);i++)R.step();}")
    ok(pg.evaluate("()=>__RTS.G.buildings.some(b=>b.type==='lab'&&b.done&&b.team===0)"), f'{tag}: the Lab is finished')
    # --- research + train from the Lab card
    pg.evaluate("()=>{const R=__RTS,l=R.G.buildings.find(b=>b.type==='lab'&&b.team===0);R.setSel([l]);R.hudUpdate&&R.hudUpdate(0.1);}"); pg.wait_for_timeout(300)
    ri = card(pg, 'Barrier Field'); mi = card(pg, 'Marksman')
    ok(ri >= 0 and mi >= 0, f'{tag}: the Lab card offers Barrier Field and (Aurora) the Marksman, no Disruptor: ' + str(pg.evaluate("()=>__RTS.ui.cmds.filter(c=>c).map(c=>c.name)")))
    ok(pg.evaluate("()=>!__RTS.ui.cmds.some(c=>c&&c.name==='Disruptor')"), f'{tag}: faction-exclusive: no Disruptor for Aurora')
    pg.evaluate("()=>{__RTS.renderCmdCard()}")
    press(pg, touch, ri); press(pg, touch, mi)
    q = pg.evaluate("()=>__RTS.G.buildings.find(b=>b.type==='lab'&&b.team===0).queue.map(x=>x.k+':'+x.id)")
    ok(q == ['r:barrier', 'u:marksman'], f'{tag}: both items are queued at the Lab: {q}')
    pg.evaluate("()=>{const R=__RTS;for(let i=0;i<30*70;i++)R.step();}")
    st = pg.evaluate("()=>({bar:__RTS.G.teams[0].barrier,m:__RTS.G.units.filter(u=>u.type==='marksman'&&u.team===0&&!u.dead).length,sh:__RTS.G.buildings.filter(b=>b.team===0&&b.done&&b.sh>0).length})")
    ok(st['bar'] == 1 and st['m'] == 1 and st['sh'] >= 3, f'{tag}: Barrier Field I researched, Marksman trained, structures shielded: {st}')
    # --- ability with targeting
    pg.evaluate("""()=>{const R=__RTS,G=R.G,m=G.units.find(u=>u.type==='marksman'&&u.team===0),h=G.buildings.find(b=>b.team===0&&b.type==='hub');
      m.x=h.x+120;m.y=h.y+160;m.energy=100;const ht=(x,y)=>G.H[Math.floor(y/32)*R.MW+Math.floor(x/32)];let ex=m.x+150,ey=m.y;
      for(let k=0;k<24;k++){const an=k/24*6.283,x=m.x+Math.cos(an)*150,y=m.y+Math.sin(an)*150;if(R.canStand(x,y)&&ht(x,y)===ht(m.x,m.y)&&R.canStand((x+m.x)/2,(y+m.y)/2)){ex=x;ey=y;break;}}   // same height level: units on low ground cannot see high ground
      const e=R.addUnit('raptor',1,ex,ey);e.order={t:'hold'};e.hp=e.maxhp;window.__e=e.id;G.vis[0].fill(2);
      R.cam.z=R.cam.tz=1.4;R.centerOn((m.x+ex)/2,(m.y+ey)/2);R.setSel([m]);R.hudUpdate&&R.hudUpdate(0.1);for(let i=0;i<8;i++)R.step();}"""); pg.wait_for_timeout(400)
    si = card(pg, 'Snipe'); ai = card(pg, 'Autocast')
    ok(si >= 0 and ai >= 0, f'{tag}: Snipe and the Autocast switch are on the command card (slots {si}, {ai})')
    ok(si == 5 and ai == 6, f'{tag}: slot contract: ability on slot 5 (S), autocast switch on slot 6 (D)')
    ok(pg.evaluate("(i)=>__RTS.ui.cmds[i].cost.mana===50&&__RTS.ui.cmds[i].ok", si), f'{tag}: Snipe shows its energy cost (50) and is ready')
    ok(touch or 'Marksman' in pg.evaluate("()=>document.getElementById('info').innerText") and 'Piercing' in pg.evaluate("()=>document.getElementById('info').innerText") and 'Snipe' in pg.evaluate("()=>document.getElementById('info').innerText"), f'{tag}: the info card shows role, damage type and abilities (desktop; the phone info strip is compact and is checked by screenshot)')
    press(pg, touch, si)
    ok(pg.evaluate("()=>__RTS.ui.target&&__RTS.ui.target.kind==='abil:snipe'"), f'{tag}: the button enters target mode (abil:snipe)')
    pg.wait_for_timeout(600)   # touch: taps right after a card press are suppressed for a moment (74_touch.js)
    for attempt in range(3):   # tap tests are load-sensitive (CLAUDE.md): retry while the target mode is still open
        pos = pg.evaluate("()=>{const e=__RTS.G.units.find(u=>u.id===window.__e);const s=__RTS.w2s(e.x,e.y);return[s.x,s.y]}")
        if touch and attempt == 0: pg.touchscreen.tap(pos[0], pos[1])
        elif touch: pg.evaluate('([x,y])=>__RTS.tpTap(x,y)', pos)   # the controller's own tap entry (e2e_touch.py uses it too) when the synthetic touch was lost
        else: pg.mouse.click(pos[0], pos[1])
        pg.wait_for_timeout(200)
        if os.environ.get('ARS_DEBUG'): print('   tap', tag, attempt, pos, pg.evaluate("()=>[!!__RTS.ui.target,!!__RTS.ui.place,__RTS.ui.sel.map(e=>e.type),__RTS.G.paused,__RTS.TP.mode]"))
        if not pg.evaluate("()=>!!__RTS.ui.target"): break
    pg.wait_for_timeout(150); pg.evaluate("()=>{for(let i=0;i<40;i++)__RTS.step();}")
    r = pg.evaluate("()=>{const e=__RTS.G.units.find(u=>u.id===window.__e),m=__RTS.G.units.find(u=>u.type==='marksman'&&u.team===0);return{dead:!e||e.dead,cd:m.ab.snipe.cd,en:m.energy}}")
    ok(r['dead'] and r['cd'] > 0 and r['en'] < 70, f'{tag}: the targeted Snipe killed the Raptor, started its cooldown and spent energy: {r}')
    pg.evaluate("()=>{__RTS.renderCmdCard();}"); pg.wait_for_timeout(150)
    sweep = pg.evaluate("(i)=>parseFloat(document.querySelector('#cmd .cb[data-i=\"'+i+'\"] .cd').style.height||'0')", si)
    ok(sweep > 0, f'{tag}: the card shows a cooldown sweep ({sweep:.0f} %)')
    press(pg, touch, ai)
    ok(pg.evaluate("()=>__RTS.G.units.find(u=>u.type==='marksman'&&u.team===0).ab.snipe.auto===true"), f'{tag}: the Autocast switch turns autocast on')
    pg.screenshot(path=str(ROOT / 'tests' / 'out' / f'arsenal_{tag}_game.png'))
    # help text
    pg.evaluate("()=>{__RTS.showOverlay('helpMenu')}"); pg.wait_for_timeout(200)
    h = pg.evaluate("()=>document.getElementById('helpBody').textContent")
    ok('Arsenal: abilities' in h and 'Damage types and armor classes' in h and 'tap the button, then tap the target' in h, f'{tag}: How to play documents abilities, damage types and the touch flow')
    pg.screenshot(path=str(ROOT / 'tests' / 'out' / f'arsenal_{tag}.png'))
    b.close()

with sync_playwright() as p:
    run(p, False); run(p, True)
ok(not errs, 'zero page errors / console errors' + (' - ' + str(errs[:3]) if errs else ''))
ok(not reqs, 'zero network requests' + (' - ' + str(reqs[:3]) if reqs else ''))
print('\nFAILED: %d' % len(fails) if fails else '\nALL ARSENAL E2E CHECKS PASSED')
sys.exit(1 if fails else 0)
