"""Campaign UI gate (Playwright + Chromium). Exit code != 0 on failure.
   python3 tests/e2e/e2e_campaign.py            (about 2 minutes; OD_URL=file://... points it at a scratch build, E2E_SECTIONS=a,b runs only some sections)

The story is the generated, valid fixture tests/fixtures/story_min.js (9 missions, 31 dispatches) merged into __RTS.STORY, so the UI is tested against ANY valid mission
data and not against the real story. What is asserted (data and DOM, never "looks nice"):
  menu        skirmish #bStart still there; #bCamp / #bArchive appear only when the story has missions / dispatches (an EMPTY story hides them and opens nothing)
  chapter     title + tagline from STORY.meta, 3 acts x 3 mission cards, only mission 1 playable, difficulty saved in the campaign save, Esc / Back navigation, reset with confirmation
  flow        Play -> prologue dispatch card (first time) -> briefing dispatch card (Continue / Skip all, speaker chips, headings, transcript) -> briefing card (objectives, bonus, hints,
              stars rules) -> Start -> the mission runs from its own setup (seed, factions, difficulty from the save) -> campaign objectives replace the tutorial hints -> scripted trigger
              posts a radio line (strip text, queue <= 3, newer line of the same speaker replaces a queued one, auto-hide) -> bonus objective completes (state, toast, tracker) ->
              blocking `dispatch` holds the sim until the card is closed or skipped (also two queued cards) -> pause card shows mission + objectives + "Restart mission"
  end         forced victory -> debrief card (stars, time vs par, objectives, report) -> progress saved in localStorage (JSON asserted) -> Continue shows debrief + after dispatch ->
              chapter select with mission 2 unlocked; defeat: defeat dispatch, Retry / Chapter select, Restart, surrender (no dispatch); a reload keeps the progress;
              corrupt / foreign / unreadable storage never throws and is ignored
  archive     only the dispatches the player has read until the campaign is finished, then every one; Read re-opens the text and returns to the archive
  layouts     desktop 1366x768, tablet 1024x768, iPhone landscape 844x390, iPhone portrait 390x844, Pixel portrait 412x915: no horizontal overflow, primary buttons inside the
              viewport, 44 px targets on touch, a long dispatch scrolls inside its card, radio strip never over the minimap / command card / touch dock / objectives
  touch       a real touch tap path (tap Campaign, tap Play, tap the dispatch card's Continue button)
  keyboard    Enter / Space / Esc on the card (also with focus on the transcript), nothing leaks to the held game
  hygiene     zero page errors, zero console errors, zero network requests, G.camp.errors empty
MUTATION CONTROLS (CLAUDE.md rule 15): tests/out/campaign/ui_mutate.py breaks the built page in several ways (plus one comment-only control that must NOT fail) and requires this script to fail on each.
Limits: Chromium software raster; audio is a stub / not exercised; no real phone, no WebKit."""
import json, os, pathlib, subprocess, sys, time
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parents[2]
URL = os.environ.get('OD_URL') or (ROOT / 'dist' / 'orbital_dominion_v3.html').as_uri()
WANT = set(filter(None, os.environ.get('E2E_SECTIONS', '').split(',')))
fails = []; errs = []; reqs = []; T0 = time.time()
def ok(c, m):
    print(('ok    ' if c else 'FAIL  ') + m, flush=True)
    if not c: fails.append(m)
def note(m): print('note  ' + m, flush=True)
def want(s): return not WANT or s in WANT

r = subprocess.run(['node', '-e', "process.stdout.write(JSON.stringify(require(process.argv[1])()))", str(ROOT / 'tests' / 'fixtures' / 'story_min.js')], capture_output=True, text=True)
if r.returncode: sys.exit('node could not load the story fixture:\n' + r.stderr)
FIX = json.loads(r.stdout)
NDISP = len(FIX['dispatch']); KEY = 'orbital_dominion_v3_campaign'
MERGE = "(d)=>{Object.assign(__RTS.STORY,{meta:d.meta,world:d.world,characters:d.characters,acts:d.acts,missions:d.missions,dispatch:d.dispatch,radio:d.radio,barks:d.barks});__RTS.campSyncMenu();return __RTS.STORY.missions.length;}"

def open_page(b, w=1366, h=768, dpr=1, mobile=False, ctx=None, fresh=True):
    if ctx is None:
        ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=dpr, is_mobile=mobile, has_touch=mobile)
        ctx.add_init_script("window.__TEST='live'")
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append(('pageerror', str(e))))
    pg.on('console', lambda m: errs.append((m.type, m.text)) if m.type in ('error',) else None)
    pg.on('request', lambda r: reqs.append(r.url[:80]) if not r.url.startswith(('file:', 'data:', 'blob:')) else None)
    pg.goto(URL); pg.wait_for_function("()=>!!(window.__RTS&&window.__RTS.campOpen&&window.__RTS.G)", timeout=15000)
    pg.evaluate(MERGE, FIX)
    if not mobile: pg.mouse.move(w // 2, h // 2)   # a pointer parked at (0,0) would edge-scroll the camera away from the base
    return ctx, pg

def vis(pg, id): return pg.evaluate("id=>{const e=document.getElementById(id);return !!e&&!e.classList.contains('hidden')&&e.getClientRects().length>0}", id)
def wf(pg, js, t=8000, arg=None):
    try: pg.wait_for_function(js, arg=arg, timeout=t); return True
    except Exception: return False
def save(pg): return pg.evaluate("k=>{try{return JSON.parse(localStorage.getItem(k))}catch(e){return 'BAD'}}", KEY)
def card_open(pg): return pg.evaluate("()=>!!__RTS.CU.dp")
def read_card(pg, what, cid=None, key='Enter'):
    """wait for the dispatch card (the one named `cid` when given), press `key` (Enter = the focused Continue button), wait until THAT card is gone (a chained card may follow)"""
    good = wf(pg, "f=>{const d=__RTS.CU.dp;return !!d&&(!f||d.q[d.i]===f)&&!document.getElementById('campDispatch').classList.contains('hidden')}", 5000, cid)
    ok(good, f'{what}: the dispatch card opens' + (f' ({cid})' if cid else ''))
    rid = pg.evaluate("()=>{const d=__RTS.CU.dp;return d&&d.q[d.i]}")
    pg.keyboard.press(key)
    ok(wf(pg, "id=>{const d=__RTS.CU.dp;return !d||d.q[d.i]!==id}", 4000, rid), f'{what}: {key} closes the card')
def step(pg, n): pg.evaluate("n=>{const R=__RTS;for(let i=0;i<n;i++)R.step();}", n)
def mission_time(pg): return pg.evaluate("()=>__RTS.G.camp?__RTS.G.camp.t:-1")
def win_now(pg):
    pg.evaluate("()=>{const R=__RTS;for(const b of R.G.buildings.slice())if(b.team===1&&!b.dead)R.kill(b,0);}")
def lose_now(pg):
    pg.evaluate("()=>{const R=__RTS;for(const b of R.G.buildings.slice())if(b.team===0&&!b.dead)R.kill(b,1);}")
def text(pg, sel): return pg.evaluate("s=>{const e=document.querySelector(s);return e?e.textContent:null}", sel)   # textContent: innerText would apply the CSS text-transform (UPPERCASE headings / buttons)
def card_ids(pg): return pg.evaluate("()=>[...document.querySelectorAll('#cmBody .mc')].map(e=>e.dataset.m)")

# ===================================================================================================================================================
def sec_menu(b):
    print('--- menu: skirmish untouched, campaign buttons follow the story data', flush=True)
    ctx, pg = open_page(b)
    ok(vis(pg, 'bStart') and 'Start Mission' in text(pg, '#bStart'), 'the skirmish "Start Mission" button is still there')
    ok(vis(pg, 'bCamp') and vis(pg, 'bArchive'), '#bCamp "Campaign" and #bArchive appear when the story has missions and dispatches')
    # empty story: nothing to show, nothing to break
    saved = pg.evaluate("()=>{const S=__RTS.STORY,o={m:S.missions,c:S.dispatch};S.missions=[];S.dispatch={};__RTS.campSyncMenu();return true}")
    ok(not vis(pg, 'bCamp') and not vis(pg, 'bArchive'), 'with an empty STORY both buttons are hidden')
    pg.evaluate("()=>{__RTS.campOpen();__RTS.campOpenArchive();}")
    ok(not vis(pg, 'campMenu') and not vis(pg, 'archiveMenu') and vis(pg, 'menu'), 'with an empty STORY campOpen() opens nothing and the main menu stays')
    pg.evaluate(MERGE, FIX)
    ok(vis(pg, 'bCamp'), 'the buttons come back when the story is restored')
    # skirmish still starts and has the tutorial objectives, no campaign state
    pg.click('#bStart'); pg.wait_for_timeout(900)
    st = pg.evaluate("()=>({camp:!!__RTS.G.camp,run:__RTS.ui.running&&!__RTS.ui.demo,obj:document.getElementById('objectives').innerText,cls:document.getElementById('objectives').classList.contains('camp'),mission:!!__RTS.ui.campMission})")
    ok(st['run'] and not st['camp'] and not st['mission'] and not st['cls'], f'a skirmish has no campaign state {st}')
    ok('Haulers' in st['obj'], 'a skirmish still shows the tutorial objectives')
    pg.evaluate("()=>__RTS.togglePause()"); pg.wait_for_timeout(250)
    ok(not vis(pg, 'campPause') and text(pg, '#bRestart') == 'Restart (new map)', 'the skirmish pause menu has no mission block and keeps "Restart (new map)"')
    ctx.close()

def sec_flow(b):
    print('--- chapter select, dispatch cards, briefing, mission, radio, objectives, dispatch hold, pause', flush=True)
    ctx, pg = open_page(b)
    pg.click('#bCamp'); pg.wait_for_timeout(300)
    ok(vis(pg, 'campMenu') and not vis(pg, 'menu') or vis(pg, 'campMenu'), 'Campaign opens the chapter select')
    ok(text(pg, '#cmTitle') == FIX['meta']['title'] and text(pg, '#cmTag') == FIX['meta']['tagline'], 'title and tagline come from STORY.meta')
    ids = card_ids(pg); ok(ids == [m['id'] for m in FIX['missions']], f'9 mission cards in order {ids}')
    ok(pg.evaluate("()=>document.querySelectorAll('#cmBody .act').length") == 3, '3 acts')
    ok(pg.evaluate("()=>[...document.querySelectorAll('#cmBody .act')].every(a=>a.querySelectorAll('.mc').length===3)"), '3 mission cards per act')
    st = pg.evaluate("()=>[...document.querySelectorAll('#cmBody .mc')].map(e=>({open:!e.querySelector('[data-act^=\"play:\"]').disabled,locked:e.classList.contains('locked'),chips:e.querySelectorAll('.cu-fac').length,stars:e.querySelectorAll('.cu-stars i').length,face:!!e.querySelector('.cu-face')}))")
    ok(st[0]['open'] and not any(s['open'] for s in st[1:]), 'only mission 1 is playable on a fresh save')
    ok(all(s['chips'] == 2 and s['stars'] == 3 and s['face'] for s in st), 'every card has player + enemy faction chips, 3 star slots and a hero portrait chip')
    ok('Locked' in pg.evaluate("()=>document.querySelectorAll('#cmBody .mc')[1].innerText"), 'a locked card says why (win the previous mission)')
    ok('Begin' in text(pg, '#cmContinue'), 'Continue reads "Begin" before the first mission')
    # difficulty is saved in the campaign save
    pg.click('[data-act="diff:hard"]'); s = save(pg)
    ok(isinstance(s, dict) and s.get('diff') == 'hard', f'difficulty "hard" is written to the save {s}')
    pg.click('#campMenu [data-act="diff:easy"]'); pg.click('#campMenu [data-act="diff:normal"]')
    ok(save(pg)['diff'] == 'normal', 'difficulty is changed back to normal')
    # navigation: Esc backs out
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    ok(vis(pg, 'menu') and not vis(pg, 'campMenu'), 'Esc on the chapter select returns to the main menu')
    pg.click('#bCamp'); pg.wait_for_timeout(200)
    pg.click('#cmBack'); pg.wait_for_timeout(200)
    ok(vis(pg, 'menu') and not vis(pg, 'campMenu'), 'the Back button does the same')
    pg.click('#bCamp'); pg.wait_for_timeout(200)
    # first mission: prologue dispatch (first time), briefing dispatch, briefing card
    pg.click('[data-act="play:m01"]')
    ok(wf(pg, "()=>{const d=__RTS.CU.dp;return !!d&&d.q.join()==='intro,m01_brief'}", 4000), 'Play queues the prologue and the briefing dispatch')
    ok(wf(pg, "()=>!document.getElementById('campDispatch').classList.contains('hidden')&&document.activeElement&&document.activeElement.id==='dpNext'", 3000), 'the first card is on screen and Continue has the focus')
    dp = pg.evaluate("""()=>{const d=__RTS.STORY.dispatch.intro,card=document.getElementById('dpCard'),lines=d.lines.filter(l=>l.style!=='heading').length,heads=d.lines.filter(l=>l.style==='heading').length;
        return{title:document.getElementById('dpTitle').textContent,n:card.querySelectorAll('.dp-l').length,lines,h:card.querySelectorAll('.dp-h').length,heads,faces:card.querySelectorAll('.cu-face').length,skip:!!document.getElementById('dpSkip'),
        prog:card.querySelector('.cu-prog').textContent,first:card.querySelector('.dp-t').textContent,want:d.lines.find(l=>l.style!=='heading').text,
        scroll:getComputedStyle(document.getElementById('dpBody')).overflowY,anim:[...card.querySelectorAll('*')].some(e=>getComputedStyle(e).animationName!=='none')}}""")
    ok(dp['title'] == FIX['dispatch']['intro']['title'] and dp['n'] == dp['lines'] and dp['h'] == dp['heads'], f'the card shows the whole transcript at once: every line and heading, title from the data {dp["n"]}/{dp["lines"]} lines')
    ok(dp['first'] == dp['want'] and dp['faces'] >= 3, 'the first line is the first spoken line and speakers get portrait chips')
    ok(dp['skip'] and dp['prog'].endswith('1 / 2') and dp['scroll'] in ('auto', 'scroll') and not dp['anim'], f'two queued cards: "Skip all" is offered, the counter reads 1 / 2, the transcript scrolls, nothing animates {dp["prog"]}')
    read_card(pg, 'prologue', 'intro')
    ok(pg.evaluate("()=>!document.getElementById('dpSkip')"), 'on the last card of the chain there is no "Skip all"')
    read_card(pg, 'briefing dispatch', 'm01_brief')
    ok(wf(pg, "()=>!document.getElementById('campBrief').classList.contains('hidden')", 3000), 'the briefing card follows the briefing dispatch')
    s = save(pg); ok(s['seen'].get('intro') and s['seen'].get('m01_brief'), f'both dispatches are marked seen in the save {s["seen"]}')
    br = pg.evaluate("()=>document.getElementById('cbCard').innerText")
    ok('Destroy all enemy structures' in br and 'Train 6 riflemen' in br and 'Build Generators early.' in br, 'the briefing lists the primary + bonus objective and the hint')
    ok('Win the mission' in br and 'under 15:00' in br and 'bonus objective' in br, 'the briefing explains the three stars (win / bonus / par time)')
    ok('Foundry' in br and 'Titan' in br, 'the briefing lists what is locked at the start')
    ok(pg.evaluate("()=>document.querySelectorAll('#cbCard .cu-fac').length") == 2 and pg.evaluate("()=>!!document.querySelector('#cbCard .cu-face')"), 'the briefing shows both factions and the hero portrait')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    ok(vis(pg, 'campMenu') and not vis(pg, 'campBrief'), 'Esc on the briefing returns to the chapter select')
    pg.click('[data-act="play:m01"]')
    read_card(pg, 'briefing dispatch (the prologue is not repeated)', 'm01_brief')
    ok(wf(pg, "()=>!document.getElementById('campBrief').classList.contains('hidden')", 3000), 'briefing card again')
    pg.click('#cbCard [data-act="diff:hard"]'); ok(save(pg)['diff'] == 'hard', 'difficulty can be changed on the briefing card too')
    pg.click('#cbCard [data-act="diff:normal"]')
    pg.click('#cbStart'); pg.wait_for_timeout(1200)
    m = pg.evaluate("()=>{const R=__RTS,G=R.G;return {id:G.camp&&G.camp.id,run:R.ui.running&&!R.ui.demo,diff:G.diff,seed:G.seed,f:[G.teams[0].faction,G.teams[1].faction],hud:!document.getElementById('hud').classList.contains('hidden'),ov:document.querySelectorAll('.overlay:not(.hidden)').length,mis:R.ui.campMission&&R.ui.campMission.id,err:G.camp&&G.camp.errors.slice()}}")
    mm = FIX['missions'][0]['setup']
    ok(m['id'] == 'm01' and m['run'] and m['hud'] and m['ov'] == 0 and m['mis'] == 'm01', f'Start launches mission 1 and hides every overlay {m}')
    ok(m['diff'] == 'normal' and m['f'] == [mm['faction'], mm['enemy']], 'difficulty comes from the save, factions from the mission setup')
    ok(m['err'] == [], 'the runtime logged no data errors for the mission')
    obj = text(pg, '#objectives')
    obj_main = pg.evaluate("()=>[...document.querySelectorAll('#objectives > .ob')].map(e=>e.textContent).join(' | ')")
    fm = pg.evaluate("()=>[...document.querySelectorAll('#objectives .fm .ob')].map(e=>e.textContent)")
    ok('Destroy all enemy structures' in obj_main and 'Train 6 riflemen' in obj_main and 'Train Haulers' not in obj_main, 'campaign objectives replace the tutorial hints in the objective list')
    ok(any('Train Haulers' in t for t in fm) and len(fm) <= 2 and 'Field manual' in obj, f'mission 1 adds a Field manual block (at most 2 basics) {fm}')
    ok(pg.evaluate("()=>document.getElementById('objectives').classList.contains('camp')"), 'the tracker is in campaign mode')
    # scripted radio line at mission time 5 s
    ok(not vis(pg, 'campRadio'), 'no radio line before the trigger fires')
    step(pg, 30 * 6)
    expect = pg.evaluate("()=>{const S=__RTS.STORY,l=S.radio.r11,c=S.characters[l.who];return {text:l.text,who:c.short||c.name}}")
    ok(vis(pg, 'campRadio') and text(pg, '#crTxt') == expect['text'] and text(pg, '#crWho') == expect['who'], f'the trigger posts its radio line in the strip: {text(pg, "#crWho")}: {text(pg, "#crTxt")}')
    ok(pg.evaluate("()=>!!document.querySelector('#crFace img,#crFace .cu-face')"), 'the strip has a portrait chip')
    ok(wf(pg, "()=>document.getElementById('campRadio').classList.contains('hidden')", 8000), 'a lone radio line hides itself after its duration')
    # queue: one visible, <= 3 waiting, a newer line of the same speaker replaces the queued one
    q = pg.evaluate("""()=>{const R=__RTS;R.campRadioClear();const out=[];for(const id of['r11','r12','r13','r14','r21','r22'])R.campRadio(id);
        out.push(R.CU.radio.cur.id,R.CU.radio.q.map(x=>x.id).join(','));return out}""")
    ok(q == ['r11', 'r14,r21,r22'], f'radio queue: first line visible, max 3 waiting, oldest dropped beyond 3 {q}')
    # same-speaker replacement must be tested on its own: with <= 3 waiting lines the cap cannot hide a missing replacement (r12 and r21 are both lyra)
    q = pg.evaluate("""()=>{const R=__RTS;R.campRadioClear();for(const id of['r11','r12','r14','r21'])R.campRadio(id);
        return[R.CU.radio.cur.id,R.CU.radio.q.map(x=>x.id).join(',')]}""")
    ok(q == ['r11', 'r14,r21'], f'a newer line of the same speaker replaces her stale queued line (r12 -> r21) {q}')
    pg.evaluate("()=>{__RTS.CU.radio.left=0}"); pg.wait_for_timeout(250)
    ok(pg.evaluate("()=>__RTS.CU.radio.cur.id") == 'r14', 'the queue advances when the visible line has run out')
    pg.mouse.move(683, 140); pg.click('#campRadio', timeout=2000); pg.wait_for_timeout(100)
    ok(pg.evaluate("()=>__RTS.CU.radio.cur&&__RTS.CU.radio.cur.id") == 'r21', 'clicking / tapping the strip skips to the next line')
    pg.evaluate("()=>__RTS.campRadioClear()")
    ok(not vis(pg, 'campRadio'), 'the strip clears')
    # bonus objective: set the runtime counter the objective reads, let the 5 Hz evaluation pass run
    ok(pg.evaluate("()=>__RTS.G.camp.obj.o2.state") == 'active', 'bonus objective o2 starts active')
    pg.evaluate("()=>{__RTS.G.camp.cnt.trained[0].rifleman=6;}"); step(pg, 12)
    ok(pg.evaluate("()=>__RTS.G.camp.obj.o2.state") == 'done', 'the bonus objective completes (runtime state done)')
    ok('Bonus complete: Train 6 riflemen' in text(pg, '#toast'), 'a toast announces the completed bonus objective')
    ok(pg.evaluate("()=>!!document.querySelector('#objectives .ob.bonus.done')"), 'the tracker marks it done')
    # runtime events reach the UI
    ev = pg.evaluate("""()=>{const R=__RTS,n0=R.ui.pings.length;R.campDo(['ping',40,40,'info']);R.campDo(['strike',44,44,3,10,3]);R.campDo(['give','c',200]);R.campDo(['unlock','building','foundry']);R.campDo(['mood','battle']);
        const t=document.getElementById('toast').innerText;return {pings:R.ui.pings.length-n0,t,mood:R.G.camp.mood}}""")
    ok(ev['pings'] >= 2 and 'Incoming orbital strike' in ev['t'] and '+200 crystals' in ev['t'] and 'Unlocked: Foundry' in ev['t'], f'ping / strike / give / unlock events become pings and toasts {ev}')
    # blocking dispatches: the world stands still until the card is closed or skipped; two queued cards show one after the other
    tick0 = pg.evaluate("()=>{__RTS.campDo(['dispatch','i1']);__RTS.campDo(['dispatch','i2']);return __RTS.G.tick}")   # read in the same task: the live frame loop keeps stepping between two evaluate() calls
    ok(pg.evaluate("()=>__RTS.G.camp.hold&&!!__RTS.CU.dp&&__RTS.G.camp.pendingDispatch==='i1'"), 'a dispatch action holds the mission and opens the card')
    step(pg, 20); pg.wait_for_timeout(300)
    ok(pg.evaluate("t=>__RTS.G.tick===t", tick0), 'the simulation does not advance while the dispatch is held')
    pg.keyboard.down('w'); pg.wait_for_timeout(80); leaked = pg.evaluate("()=>!!__RTS.ui.keys.w"); pg.keyboard.up('w')
    ok(not leaked and pg.evaluate("()=>__RTS.CU.dp&&__RTS.CU.dp.q[__RTS.CU.dp.i]")=='i1', 'a held game hotkey does not reach the game while the card is open (and the card stays)')
    pg.keyboard.press('Enter')
    ok(wf(pg, "()=>!!__RTS.CU.dp&&__RTS.G.camp.pendingDispatch==='i2'", 3000), 'closing the first card shows the queued second card')
    ok(pg.evaluate("()=>__RTS.G.camp.hold"), 'the mission stays held between the two cards')
    pg.keyboard.press('Escape')
    ok(wf(pg, "()=>!__RTS.CU.dp&&!__RTS.G.camp.hold", 3000), 'Escape skips the last card and the mission resumes')
    step(pg, 5); ok(pg.evaluate("t=>__RTS.G.tick>t", tick0), 'and the simulation runs again')
    ok(not pg.evaluate("()=>__RTS.G.paused"), 'Escape on the card did not pause the game')
    s = save(pg); ok(s['seen'].get('i1') and s['seen'].get('i2'), 'in-mission dispatches are marked seen')
    pg.evaluate("()=>__RTS.campDo(['dispatch','no_such_dispatch'])"); pg.wait_for_timeout(300)
    ok(pg.evaluate("()=>!__RTS.G.camp.hold&&!__RTS.CU.dp"), 'an unknown dispatch id never freezes the game')
    # pause card
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    pc = text(pg, '#campPause')
    ok(vis(pg, 'pauseMenu') and vis(pg, 'campPause') and 'Mission 1' in pc and 'Destroy all enemy structures' in pc and 'Train 6 riflemen' in pc, 'the pause menu shows the mission title and its objectives')
    ok(text(pg, '#bRestart') == 'Restart mission' and text(pg, '#bToMenu') == 'Chapter select', 'the pause menu says "Restart mission" and "Chapter select"')
    pg.click('#bResume'); pg.wait_for_timeout(200)
    ok(not pg.evaluate("()=>__RTS.G.paused"), 'Resume continues the mission')
    # restart mission keeps the mission and rewinds the clock
    step(pg, 30 * 3); t1 = mission_time(pg)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200); pg.click('#bRestart'); pg.wait_for_timeout(900)
    ok(pg.evaluate("()=>__RTS.G.camp&&__RTS.G.camp.id")=='m01' and mission_time(pg) < t1 and mission_time(pg) < 3, 'Restart mission starts mission 1 again from t=0')
    ok(pg.evaluate("()=>document.querySelectorAll('.overlay:not(.hidden)').length") == 0, 'with no overlay left over')
    pg.close(); return ctx

def sec_end(b, ctx=None):
    print('--- victory, debrief, save, unlock, defeat, retry, reload, corrupt saves', flush=True)
    ctx, pg = open_page(b)
    pg.click('#bCamp'); pg.wait_for_timeout(200)
    pg.evaluate("()=>{const R=__RTS;R.CU.save=null;R.campLaunch(R.STORY.missions[0]);}"); pg.wait_for_timeout(900)
    step(pg, 30 * 8)
    pg.evaluate("()=>{__RTS.G.camp.cnt.trained[0].rifleman=6;}"); step(pg, 12)
    win_now(pg)
    res = pg.evaluate("()=>{const r=__RTS.G.camp.result;return r&&{res:r.res,stars:r.stars,t:r.t,reason:r.reason}}")
    ok(res and res['res'] == 'victory' and res['stars'] == 3, f'destroying every enemy structure wins with 3 stars (win + bonus + under par) {res}')
    ok(not vis(pg, 'campDebrief'), 'the debrief waits for the end-of-match pause')
    ok(wf(pg, "()=>!document.getElementById('campDebrief').classList.contains('hidden')", 6000), 'the debrief card appears')
    d = text(pg, '#cdCard')
    ok('Victory' in d and 'par 15:00' in d and 'Bonus objectives 1 / 1' in d and 'Under par time' in d and 'Battle report' in d, 'the debrief shows result, time against par, bonus count and the battle report')
    ok(pg.evaluate("()=>document.querySelectorAll('#cdCard .cd-stars i.on').length") == 3, 'the debrief shows 3 stars')
    ok(pg.evaluate("()=>document.querySelectorAll('#cdCard .ol li.done').length>=4&&!document.querySelector('#cdCard .ol li.fail')"), 'every objective of the won mission reads done')
    ok('New mission unlocked: Mission 2' in d, 'the debrief announces the unlocked mission')
    s = save(pg)
    ok(isinstance(s, dict) and s['v'] == 1 and s['done']['m01']['stars'] == 3 and isinstance(s['done']['m01']['best'], int) and s['done']['m01']['diff'] == 'normal' and s['last'] == 'm02', f'progress is saved in localStorage {json.dumps(s)[:160]}')
    # Continue: debrief dispatch, after dispatch, then the chapter select with mission 2 open
    pg.click('#cdGo')
    read_card(pg, 'debrief dispatch', 'm01_win'); read_card(pg, 'after dispatch (interlude)', 'i1')
    ok(wf(pg, "()=>!document.getElementById('campMenu').classList.contains('hidden')", 4000), 'after the dispatches the chapter select opens')
    ok(pg.evaluate("()=>!__RTS.G.camp&&__RTS.ui.demo"), 'the finished mission is gone (menu background match)')
    st = pg.evaluate("()=>[...document.querySelectorAll('#cmBody .mc')].slice(0,3).map(e=>({open:!e.querySelector('[data-act^=\"play:\"]').disabled,stars:e.querySelectorAll('.cu-stars i.on').length,next:e.classList.contains('next')}))")
    ok(st[0]['stars'] == 3 and st[1]['open'] and st[1]['next'] and not st[2]['open'], f'mission 1 shows 3 stars, mission 2 is unlocked and highlighted {st}')
    ok('Continue' in text(pg, '#cmContinue') and '2.' in text(pg, '#cmContinue'), 'Continue now points at mission 2')
    s = save(pg); ok(s['seen'].get('m01_win') and s['seen'].get('i1'), 'debrief and after dispatch are marked seen')
    # defeat path on mission 2 (give it a defeat dispatch in the data)
    pg.evaluate("()=>{__RTS.STORY.missions[1].defeat='defeat';}")
    pg.click('[data-act="play:m02"]'); read_card(pg, 'briefing dispatch (mission 2)', 'm02_brief')
    ok(wf(pg, "()=>!document.getElementById('campBrief').classList.contains('hidden')", 3000), 'mission 2 briefing')
    pg.click('#cbStart'); pg.wait_for_timeout(900); step(pg, 60)
    ok(pg.evaluate("()=>__RTS.G.camp.id")=='m02' and pg.evaluate("()=>__RTS.G.teams[0].faction")==FIX['missions'][1]['setup']['faction'], 'mission 2 runs with its own setup')
    lose_now(pg)
    ok(pg.evaluate("()=>__RTS.G.camp.result&&__RTS.G.camp.result.res")=='defeat', 'losing every structure is a defeat')
    ok(wf(pg, "()=>!!__RTS.CU.dp&&__RTS.CU.dp.q[0]==='defeat'", 6000), 'the mission defeat dispatch is shown first')
    pg.keyboard.press('Escape')
    ok(wf(pg, "()=>!document.getElementById('campDebrief').classList.contains('hidden')&&!__RTS.CU.dp", 4000), 'then the defeat card appears')
    d = text(pg, '#cdCard')
    ok('Defeat' in d and 'Retry mission' in d and 'Chapter select' in d and not pg.evaluate("()=>document.querySelector('#cdCard .cd-stars')"), 'the defeat card offers Retry and Chapter select and shows no stars')
    s2 = save(pg); ok('m02' not in s2['done'] and s2['last'] == 'm02', 'a defeat changes nothing in the save')
    pg.click('#cdRetry'); pg.wait_for_timeout(900)
    ok(pg.evaluate("()=>__RTS.G.camp&&__RTS.G.camp.id==='m02'&&__RTS.G.time<2&&__RTS.ui.running&&!__RTS.G.over")  and pg.evaluate("()=>document.querySelectorAll('.overlay:not(.hidden)').length")==0, 'Retry restarts mission 2 immediately')
    # surrender: no defeat dispatch, the card says so
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    pg.click('#bSurr'); pg.click('#bSurr')
    ok(wf(pg, "()=>!document.getElementById('campDebrief').classList.contains('hidden')", 6000), 'surrendering reaches the defeat card')
    ok(not card_open(pg) and 'surrender' in text(pg, '#cdCard'), 'surrender skips the defeat dispatch and says why')
    pg.keyboard.press('Escape')
    ok(wf(pg, "()=>!document.getElementById('campMenu').classList.contains('hidden')", 3000), 'Esc on the defeat card returns to the chapter select')
    ok(pg.evaluate("()=>!__RTS.ui.campMission"), 'campaign state is cleared when back in the menu')
    # pause menu "Chapter select" from a running mission
    pg.click('[data-act="play:m02"]'); read_card(pg, 'briefing dispatch', 'm02_brief'); pg.click('#cbStart'); pg.wait_for_timeout(700)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200); pg.click('#bToMenu'); pg.wait_for_timeout(600)
    ok(vis(pg, 'campMenu') and pg.evaluate("()=>!__RTS.ui.campMission&&!__RTS.G.camp"), 'pause > Chapter select leaves the mission and opens the chapter select')
    # reset with confirmation
    pg.click('#cmReset'); ok(vis(pg, 'cmConfirm'), 'Reset progress asks for confirmation')
    pg.keyboard.press('Escape'); ok(not vis(pg, 'cmConfirm') and vis(pg, 'campMenu'), 'Esc closes only the confirmation')
    pg.click('#cmReset'); pg.click('#cmResetNo'); ok(save(pg)['done'].get('m01'), 'Cancel keeps the progress')
    pg.click('#cmReset'); pg.click('#cmResetYes')
    s = save(pg); ok(s['done'] == {} and s['seen'] == {} and s['last'] is None, f'confirmed reset clears progress and seen dispatches {s}')
    ok(card_ids(pg) == [m['id'] for m in FIX['missions']] and pg.evaluate("()=>[...document.querySelectorAll('#cmBody .mc')].filter(e=>!e.querySelector('[data-act^=\"play:\"]').disabled).length") == 1, 'only mission 1 is playable again')
    # reload keeps progress: write a save, reload the page
    pg.evaluate("k=>localStorage.setItem(k,JSON.stringify({v:1,done:{m01:{stars:2,best:700,diff:'hard'},m02:{stars:3,best:650,diff:'normal'}},seen:{intro:true},last:'m03',diff:'hard'}))", KEY)
    pg.reload(); pg.wait_for_function("()=>!!(window.__RTS&&window.__RTS.campOpen&&window.__RTS.G)", timeout=15000); pg.evaluate(MERGE, FIX)
    pg.click('#bCamp'); pg.wait_for_timeout(300)
    st = pg.evaluate("()=>[...document.querySelectorAll('#cmBody .mc')].slice(0,4).map(e=>({open:!e.querySelector('[data-act^=\"play:\"]').disabled,stars:e.querySelectorAll('.cu-stars i.on').length}))")
    ok([x['stars'] for x in st] == [2, 3, 0, 0] and [x['open'] for x in st] == [True, True, True, False], f'after a reload the stars and unlocked missions persist {st}')
    ok(pg.evaluate("()=>document.querySelector('#cmDiff .btn.sel').dataset.act") == 'diff:hard', 'and so does the difficulty')
    # corrupt / foreign / unreadable storage
    def cold(val):
        pg.evaluate("([k,v])=>{if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v)}", [KEY, val])
        pg.reload(); pg.wait_for_function("()=>!!(window.__RTS&&window.__RTS.campOpen&&window.__RTS.G)", timeout=15000); pg.evaluate(MERGE, FIX)
        pg.click('#bCamp'); pg.wait_for_timeout(200)
        return pg.evaluate("()=>[...document.querySelectorAll('#cmBody .mc')].map(e=>({open:!e.querySelector('[data-act^=\"play:\"]').disabled,stars:e.querySelectorAll('.cu-stars i.on').length}))")
    n0 = len(errs)
    for label, val in (('not JSON', '{oops'), ('a string', '"hello"'), ('wrong version', json.dumps({'v': 7, 'done': {'m01': {'stars': 3}}, 'last': 'm09'})), ('an array', '[1,2,3]')):
        st = cold(val)
        ok(len(st) == 9 and sum(x['open'] for x in st) == 1 and sum(x['stars'] for x in st) == 0, f'a corrupt save ({label}) is ignored: a fresh campaign')
    st = cold(json.dumps({'v': 1, 'done': {'m01': {'stars': 99, 'best': -5, 'diff': 'zzz'}, '<b>': {'stars': 3}, 'm02': 5, 'm03': None}, 'seen': {'<img>': True, 'intro': True}, 'last': '<script>', 'diff': 'nightmare'}))
    ok(len(st) == 9 and st[0]['stars'] == 3 and st[1]['open'] and not st[2]['open'], f'a half-corrupt save keeps only its valid parts (stars clamped to 3) {st[:3]}')
    ok(pg.evaluate("()=>!document.getElementById('campMenu').innerHTML.includes('<script')&&!document.querySelector('#cmBody b')"), 'nothing from a hostile save reaches the DOM')
    pg.add_init_script("Storage.prototype.getItem=function(){throw new Error('blocked')};Storage.prototype.setItem=function(){throw new Error('quota')};")
    pg.reload(); pg.wait_for_function("()=>!!(window.__RTS&&window.__RTS.campOpen&&window.__RTS.G)", timeout=15000); pg.evaluate(MERGE, FIX)
    pg.click('#bCamp'); pg.wait_for_timeout(200)
    ok(len(card_ids(pg)) == 9, 'with unreadable / unwritable storage the chapter select still works')
    pg.evaluate("()=>{const R=__RTS;R.campLaunch(R.STORY.missions[0]);}"); pg.wait_for_timeout(700)
    step(pg, 30 * 8); pg.evaluate("()=>{__RTS.G.camp.cnt.trained[0].rifleman=6;}"); step(pg, 12); win_now(pg)
    ok(wf(pg, "()=>!document.getElementById('campDebrief').classList.contains('hidden')", 6000), 'a mission can be won with unwritable storage')
    mem = pg.evaluate("()=>({saved:__RTS.CU.saveFailed,done:Object.keys(__RTS.CU.save.done)})")
    ok(mem['saved'] and mem['done'] == ['m01'], f'progress is kept in memory for the session {mem}')
    bad = [e for e in errs[n0:] if 'blocked' not in str(e) and 'quota' not in str(e)]
    ok(not bad, f'none of that threw a page error {bad[:2]}')
    errs[n0:] = [e for e in errs[n0:] if e not in bad and False]   # the injected storage errors are expected; keep real ones
    ctx.close()

def sec_archive(b):
    print('--- Archive (dispatches already read)', flush=True)
    ctx, pg = open_page(b)
    pg.evaluate("()=>__RTS.campDispatch(['i3','i4','i5'])"); pg.wait_for_timeout(200)
    ok(card_open(pg) and not pg.evaluate("()=>!!__RTS.campSaveGet().seen.i4"), 'a chain of three cards is open and the later ones are not seen yet')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    sn = pg.evaluate("()=>Object.keys(__RTS.campSaveGet().seen).sort().join()")
    ok(not card_open(pg) and sn == 'i3,i4,i5', f'Escape ("Skip all") closes the whole chain and marks every skipped card as read so it can be re-read in the archive ({sn})')
    pg.evaluate("k=>localStorage.setItem(k,JSON.stringify({v:1,done:{m01:{stars:1,best:900,diff:'normal'}},seen:{intro:true,i1:true,m01_brief:true},last:'m02',diff:'normal'}))", KEY)
    pg.click('#bArchive'); pg.wait_for_timeout(300)
    ok(vis(pg, 'archiveMenu'), 'Archive opens')
    n = pg.evaluate("()=>({open:document.querySelectorAll('#arBody .xr:not(.lock)').length,lock:[...document.querySelectorAll('#arBody .xr.lock')].reduce((a,e)=>a+(+e.dataset.locked||0),0)})")
    ok(n['open'] == 3 and n['lock'] == NDISP - 3, f'before the ending only the dispatches already read are listed ({n}, total {NDISP})')
    ok('3 of %d read' % NDISP in text(pg, '#arTag'), 'the header counts the dispatches read')
    pg.click('[data-act="read:m01_brief"]')
    ok(wf(pg, "()=>!!__RTS.CU.dp&&!document.getElementById('campDispatch').classList.contains('hidden')", 3000), 'Read opens the dispatch card')
    t = pg.evaluate("()=>document.getElementById('dpBody').textContent"); want = [l['text'] for l in FIX['dispatch']['m01_brief']['lines']]
    ok(all(w in t for w in want), 'the card shows every line of the stored dispatch again (re-readable)')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    ok(vis(pg, 'archiveMenu') and not vis(pg, 'campDispatch') and not card_open(pg), 'closing the card returns to the archive')
    pg.click('[data-act="read:intro"]'); read_card(pg, 'archive Read', 'intro')
    ok(vis(pg, 'archiveMenu'), 'the archive is still open after reading')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    ok(vis(pg, 'menu') and not vis(pg, 'archiveMenu'), 'Esc leaves the archive')
    # finishing the campaign (all missions done) opens everything
    pg.evaluate("([k,ids])=>{const d={};ids.forEach(i=>d[i]={stars:3,best:600,diff:'normal'});localStorage.setItem(k,JSON.stringify({v:1,done:d,seen:{},last:'m09',diff:'normal'}))}", [KEY, [m['id'] for m in FIX['missions']]])
    pg.click('#bArchive'); pg.wait_for_timeout(300)
    n = pg.evaluate("()=>({open:document.querySelectorAll('#arBody .xr:not(.lock)').length,lock:document.querySelectorAll('#arBody .xr.lock').length})")
    ok(n['open'] == NDISP and n['lock'] == 0, f'after the campaign every dispatch is open ({n})')
    ok('complete' in text(pg, '#arTag').lower(), 'and the header says so')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
    pg.click('#bCamp'); pg.wait_for_timeout(200)
    ok('complete' in text(pg, '#cmProg').lower() and 'Replay' in text(pg, '#cmContinue'), 'the chapter select shows "campaign complete" and Continue becomes Replay')
    ok('Read prologue' in text(pg, '#cmIntro') and 'Watch' not in pg.evaluate("()=>document.body.innerText"), 'the prologue button says "Read prologue"; no "Watch" wording is left')
    pg.click('#cmIntro'); read_card(pg, 'Read prologue', 'intro')
    ok(vis(pg, 'campMenu'), 'the chapter select is still open after the prologue')
    ctx.close()

# ===================================================================================================================================================
VIEWS = [('desktop 1366x768', 1366, 768, 1, False), ('tablet 1024x768', 1024, 768, 2, True), ('iPhone landscape 844x390', 844, 390, 3, True), ('iPhone portrait 390x844', 390, 844, 3, True), ('Pixel portrait 412x915', 412, 915, 2.625, True)]
RECT = "id=>{const e=document.getElementById(id);if(!e)return null;const r=e.getBoundingClientRect();return[r.left,r.top,r.right,r.bottom]}"
def inside(r, w, h): return r is not None and r[0] >= -1 and r[1] >= -1 and r[2] <= w + 1 and r[3] <= h + 1
def hit(a, b): return a is not None and b is not None and a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]

def sec_layout(b):
    print('--- layouts: no overflow, primary buttons inside the viewport, 44 px touch targets, radio strip clear of the HUD', flush=True)
    for name, w, h, dpr, mob in VIEWS:
        ctx, pg = open_page(b, w, h, dpr, mob)
        pg.evaluate("k=>localStorage.setItem(k,JSON.stringify({v:1,done:{m01:{stars:3,best:600,diff:'normal'},m02:{stars:2,best:800,diff:'hard'}},seen:{intro:true,i1:true},last:'m03',diff:'normal'}))", KEY)
        def check(screen, ids, card=None, scope=None):
            sw = pg.evaluate("()=>document.documentElement.scrollWidth<=innerWidth+1&&document.body.scrollWidth<=innerWidth+1")
            rs = {i: pg.evaluate(RECT, i) for i in ids}
            ok(sw and all(inside(r, w, h) for r in rs.values()), f'{name} / {screen}: no horizontal overflow, {", ".join("#"+i for i in ids)} inside the viewport')
            if card:
                c = pg.evaluate("s=>{const e=document.querySelector(s);const r=e.getBoundingClientRect();return[r.left,r.top,r.right,r.bottom,e.scrollWidth>e.clientWidth+1]}", card)
                ok(inside(c[:4], w, h) and not c[4], f'{name} / {screen}: the card fits the viewport without horizontal scrolling')
                # the card clips (overflow:hidden) and its body scrolls, so a too-wide grid would not show up in the card's own scrollWidth: look at the body and at every child
                ov = pg.evaluate("""s=>{const c=document.querySelector(s),cr=c.getBoundingClientRect(),bad=[];
                    for(const e of c.querySelectorAll('*')){if(e.offsetParent===null||!e.getClientRects().length)continue;const r=e.getBoundingClientRect();if(r.width>0&&r.right>cr.right+1)bad.push((e.className&&e.className.baseVal===undefined?e.className:e.tagName)+':'+Math.round(r.right-cr.right))}
                    const sw=[...c.querySelectorAll('.cu-body')].filter(b=>b.scrollWidth>b.clientWidth+1).map(b=>b.id||b.className);return{bad:bad.slice(0,4),sw}}""", card)
                ok(not ov['bad'] and not ov['sw'], f'{name} / {screen}: nothing inside the card sticks out to the right and its body does not scroll sideways {ov}')
            if mob:
                small = pg.evaluate("s=>[...document.querySelectorAll(s+' .btn')].filter(e=>e.offsetParent!==null&&!e.disabled&&e.getBoundingClientRect().height<43.5).map(e=>e.textContent)", scope or card or 'body')
                ok(not small, f'{name} / {screen}: every button is >= 44 px tall {small[:3]}')
        pg.wait_for_timeout(300)
        check('main menu', ['bCamp', 'bStart', 'bHelp', 'bSet', 'bArchive'], scope='#menu .mfoot')   # the skirmish option rows above are not part of this task
        pg.evaluate("()=>__RTS.campOpen()"); pg.wait_for_timeout(300)
        check('chapter select', ['cmContinue', 'cmBack'], '#campMenu .card')
        sc = pg.evaluate("()=>{const e=document.getElementById('cmBody');return e.scrollHeight>e.clientHeight}")
        ok(sc or w > 1000, f'{name} / chapter select: the mission list scrolls inside the card on small screens')
        pg.evaluate("()=>{const R=__RTS;R.campShowBrief(R.STORY.missions[2]);}"); pg.wait_for_timeout(250)
        check('briefing', ['cbStart'], '#campBrief .card')
        pg.evaluate("()=>__RTS.campOpenArchive()"); pg.wait_for_timeout(250)
        check('archive', ['arBack'], '#archiveMenu .card')
        pg.evaluate("""()=>{const R=__RTS,ls=[];for(let i=0;i<34;i++)ls.push({who:['idris','kaz','pip','narrator'][i%4],text:'Line '+i+' of a long transcript that has to scroll inside the card and never sideways, with a few more words to wrap on a phone.',style:i%4===3?'narration':i%5===0?'radio':'normal',expr:'determined'});
            ls.splice(5,0,{who:'narrator',text:'NIGHT 8 - the Lamp Tower rubble',style:'heading'});R.STORY.dispatch.longtest={id:'longtest',kind:'ending',title:'A long dispatch',mood:'finale',lines:ls};R.campDispatch(['longtest','credits'])}"""); pg.wait_for_timeout(300)
        check('dispatch card', ['dpNext', 'dpSkip'], '#campDispatch .card')
        sc = pg.evaluate("()=>{const e=document.getElementById('dpBody');return{scrolls:e.scrollHeight>e.clientHeight+4,fits:e.getBoundingClientRect().bottom<=document.getElementById('dpNext').getBoundingClientRect().top+1}}")
        ok(sc['scrolls'] and sc['fits'], f'{name} / dispatch card: a long transcript scrolls inside the card above the footer buttons {sc}')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        ok(not card_open(pg) and vis(pg, 'archiveMenu'), f'{name} / dispatch card: Escape closes the whole chain and returns to the previous screen')
        pg.evaluate("()=>{const R=__RTS;R.hideOverlays();R.campLaunch(R.STORY.missions[2]);}"); pg.wait_for_timeout(1000)
        step(pg, 30 * 6)
        ok(vis(pg, 'campRadio'), f'{name} / match: the radio strip is visible')
        rs = pg.evaluate("()=>{const q=id=>{const e=document.getElementById(id);if(!e||e.offsetParent===null&&getComputedStyle(e).position!=='fixed')return null;const s=getComputedStyle(e);if(s.display==='none')return null;const r=e.getBoundingClientRect();return[r.left,r.top,r.right,r.bottom]};return{radio:q('campRadio'),mm:q('mmWrap'),cmd:q('cmd'),dock:q('touchDock'),obj:q('objectives'),info:q('info'),top:q('top')}}")
        ok(inside(rs['radio'], w, h), f'{name} / match: the radio strip is inside the viewport {rs["radio"]}')
        bad = [k for k in ('mm', 'cmd', 'dock', 'obj') if hit(rs['radio'], rs[k])]
        ok(not bad, f'{name} / match: the radio strip does not cover the {", ".join(bad) or "minimap, command card, touch dock or objectives"}')
        ok(rs['radio'][1] >= rs['top'][3] - 1, f'{name} / match: the radio strip sits below the top bar')
        tr = pg.evaluate("()=>{const o=document.getElementById('objectives'),r=o.getBoundingClientRect();return{text:o.innerText.length>5,w:r.width,h:r.height}}")
        ok(tr['text'] and tr['h'] > 20, f'{name} / match: the objective tracker is not empty {tr}')
        pg.evaluate("()=>__RTS.togglePause()"); pg.wait_for_timeout(250)
        rs = {i: pg.evaluate(RECT, i) for i in ('bResume', 'bRestart', 'bToMenu', 'bSurr')}
        ok(all(inside(r, w, h) for r in rs.values()), f'{name} / pause: Resume, Restart mission, Chapter select and Surrender are all reachable without scrolling {rs}')
        ok('Mission 3' in text(pg, '#campPause'), f'{name} / pause: the mission block is shown')
        pg.evaluate("()=>__RTS.togglePause()")
        pg.evaluate("()=>{__RTS.G.camp.cnt.trained[0].rifleman=6}"); step(pg, 12); win_now(pg); pg.evaluate("()=>{__RTS.ui.endAt=0}")
        ok(wf(pg, "()=>!document.getElementById('campDebrief').classList.contains('hidden')", 5000), f'{name} / debrief opens')
        check('debrief', ['cdGo', 'cdRetry'], '#campDebrief .card')
        ctx.close()

def sec_touch(b):
    print('--- touch: tap Campaign, tap Play, tap the dispatch Continue button', flush=True)
    ctx, pg = open_page(b, 844, 390, 3, True)
    def tap(sel):
        r = pg.evaluate("s=>{const r=document.querySelector(s).getBoundingClientRect();return[r.left+r.width/2,r.top+r.height/2]}", sel); pg.touchscreen.tap(r[0], r[1])
    tap('#bCamp'); ok(wf(pg, "()=>!document.getElementById('campMenu').classList.contains('hidden')", 3000), 'a tap on Campaign opens the chapter select')
    pg.evaluate("()=>document.getElementById('cmBody').querySelector('[data-act=\"play:m01\"]').scrollIntoView({block:'center'})"); pg.wait_for_timeout(200)
    tap('[data-act="play:m01"]'); ok(wf(pg, "()=>!!__RTS.CU.dp&&__RTS.CU.dp.q[__RTS.CU.dp.i]==='intro'", 4000), 'a tap on Play shows the prologue dispatch (touch)')
    pg.touchscreen.tap(400, 200); pg.wait_for_timeout(300)
    ok(card_open(pg), 'a tap on the transcript does not dismiss the card')
    tap('#dpNext'); ok(wf(pg, "()=>__RTS.CU.dp&&__RTS.CU.dp.q[__RTS.CU.dp.i]==='m01_brief'", 3000), 'tapping Continue shows the next card (touch)')
    tap('#dpNext'); ok(wf(pg, "()=>!__RTS.CU.dp", 3000), 'tapping Continue on the last card closes it (touch)')
    ok(wf(pg, "()=>!document.getElementById('campBrief').classList.contains('hidden')", 3000), 'the briefing card follows (touch)')
    tap('#cbStart'); pg.wait_for_timeout(1200)
    ok(pg.evaluate("()=>__RTS.G.camp&&__RTS.G.camp.id==='m01'&&__RTS.ui.touchMode"), 'a tap on Start launches the mission in touch mode')
    step(pg, 30 * 6); pg.mouse.move(0, 0)
    ok(pg.evaluate("()=>!!__RTS.CU.radio.cur&&__RTS.CU.radio.cur.id==='r11'") and vis(pg, 'campRadio'), 'the scripted radio line is on screen before the tap')
    r = pg.evaluate("()=>{const r=document.getElementById('campRadio').getBoundingClientRect();return[r.left+r.width/2,r.top+r.height/2]}")
    pg.touchscreen.tap(r[0], r[1]); pg.wait_for_timeout(200)       # tap the radio strip: skip
    ok(pg.evaluate("()=>!__RTS.CU.radio.cur")  and not vis(pg, 'campRadio'), 'a tap on the radio strip dismisses the line (touch)')
    ctx.close()


def sec_finale(b):
    print('--- the last mission: debrief, ending, credits, then everything is unlocked', flush=True)
    ctx, pg = open_page(b)
    ids = [m['id'] for m in FIX['missions']]
    d = {i: {'stars': 2, 'best': 700, 'diff': 'normal'} for i in ids[:-1]}
    pg.evaluate("([k,v])=>localStorage.setItem(k,JSON.stringify(v))", [KEY, {'v': 1, 'done': d, 'seen': {}, 'last': 'm09', 'diff': 'normal'}])
    pg.click('#bCamp'); pg.wait_for_timeout(250)
    ok('complete' not in text(pg, '#cmProg').lower(), 'with the last mission still open the campaign is not complete')
    pg.click('[data-act="play:m09"]'); read_card(pg, 'briefing dispatch (mission 9)', 'm09_brief')
    pg.click('#cbStart'); pg.wait_for_timeout(900); step(pg, 30 * 8)
    ok(pg.evaluate("()=>__RTS.G.camp.id")=='m09', 'mission 9 runs')
    win_now(pg)
    ok(wf(pg, "()=>!document.getElementById('campDebrief').classList.contains('hidden')", 6000), 'the debrief card appears')
    t = text(pg, '#cdCard')
    ok('Final mission complete' in t and 'New mission unlocked' not in t, 'the last debrief announces the ending instead of a new mission')
    s = save(pg); ok(s['done']['m09']['stars'] >= 1 and s['last'] == 'm09', f'the last mission is saved and `last` stays on it {s["last"]}')
    ok(not s['seen'].get('credits'), 'the credits are not marked seen before they play')
    pg.click('#cdGo')
    read_card(pg, 'debrief dispatch', 'm09_win'); read_card(pg, 'ending', 'ending'); read_card(pg, 'credits', 'credits')
    ok(wf(pg, "()=>!document.getElementById('campMenu').classList.contains('hidden')", 4000), 'after the credits the chapter select opens')
    s = save(pg); ok(s['seen'].get('credits') and s['seen'].get('ending'), 'the ending and the credits are marked seen')
    ok('complete' in text(pg, '#cmProg').lower(), 'the chapter select says the campaign is complete')
    pg.keyboard.press('Escape'); pg.click('#bArchive'); pg.wait_for_timeout(300)
    n = pg.evaluate("()=>({open:document.querySelectorAll('#arBody .xr:not(.lock)').length,lock:document.querySelectorAll('#arBody .xr.lock').length})")
    ok(n['open'] == NDISP and n['lock'] == 0, f'the archive opens every dispatch after the credits ({n})')
    ctx.close()

def sec_a11y(b):
    print('--- keyboard-only play and reduced motion', flush=True)
    ctx = b.new_context(viewport={'width': 1366, 'height': 768}, reduced_motion='reduce')
    ctx.add_init_script("window.__TEST='live'")
    ctx, pg = open_page(b, ctx=ctx)
    pg.focus('#bCamp'); pg.keyboard.press('Enter'); pg.wait_for_timeout(250)
    ok(vis(pg, 'campMenu') and pg.evaluate("()=>document.activeElement.id")=='cmContinue', 'Enter on Campaign opens the chapter select with focus on Continue')
    pg.keyboard.press('Enter')
    read_card(pg, 'prologue (keyboard, Enter on Continue)', 'intro')
    wf(pg, "()=>__RTS.CU.dp&&__RTS.CU.dp.q[__RTS.CU.dp.i]==='m01_brief'", 3000); pg.focus('#dpBody')
    read_card(pg, 'briefing dispatch (keyboard, Space with the focus on the transcript)', 'm01_brief', key='Space')
    ok(wf(pg, "()=>document.activeElement&&document.activeElement.id==='cbStart'", 3000), 'the briefing card focuses "Start mission"')
    pg.keyboard.press('Enter'); pg.wait_for_timeout(1000)
    ok(pg.evaluate("()=>__RTS.G.camp&&__RTS.G.camp.id==='m01'&&__RTS.ui.running&&!__RTS.ui.demo"), 'Enter starts the mission: the whole path works without a pointer')
    step(pg, 30 * 6)
    ok(vis(pg, 'campRadio'), 'the radio strip shows')
    ad = pg.evaluate("()=>{const f=s=>{const e=document.querySelector(s);return e?parseFloat(getComputedStyle(e).animationDuration)||0:-1};return{radio:f('#campRadio')}}")
    ok(0 <= ad['radio'] <= 0.001, f'with prefers-reduced-motion the radio strip animation is ~0 s ({ad})')
    pg.evaluate("()=>{const R=__RTS;R.G.camp.cnt.trained[0].rifleman=6;for(let i=0;i<12;i++)R.step();for(const b of R.G.buildings.slice())if(b.team===1&&!b.dead)R.kill(b,0);R.ui.endAt=0}")
    ok(wf(pg, "()=>!document.getElementById('campDebrief').classList.contains('hidden')", 6000), 'the debrief opens')
    ad = pg.evaluate("()=>{const e=document.querySelector('#cdCard .cd-stars i.on');return e?parseFloat(getComputedStyle(e).animationDuration)||0:-1}")
    ok(0 <= ad <= 0.001, f'with prefers-reduced-motion the star animation is ~0 s ({ad})')
    ok(pg.evaluate("()=>document.activeElement&&document.activeElement.id")=='cdGo', 'the debrief focuses Continue')
    ctx.close()

def sec_endhold(b):
    print('--- a mission that ends while a dispatch is held: the card is shown first, then the debrief', flush=True)
    ctx, pg = open_page(b)
    pg.evaluate("()=>{const R=__RTS;R.CU.save=null;R.campLaunch(R.STORY.missions[0]);}"); pg.wait_for_timeout(800)
    pg.evaluate("()=>{__RTS.campDo(['dispatch','i1']);__RTS.campDo(['win']);__RTS.ui.endAt=0}")
    ok(pg.evaluate("()=>!!__RTS.CU.dp&&__RTS.G.camp.hold&&__RTS.G.camp.result&&__RTS.G.camp.result.res==='victory'&&__RTS.G.camp.result.reason==='win'"), 'a trigger [dispatch, win] ends the mission while its card is held')
    pg.wait_for_timeout(700)
    ok(not vis(pg, 'campDebrief') and card_open(pg), 'the debrief waits for the dispatch card')
    read_card(pg, 'the held dispatch', 'i1')
    ok(wf(pg, "()=>!document.getElementById('campDebrief').classList.contains('hidden')", 4000), 'then the debrief card appears')
    ok('Victory' in text(pg, '#cdCard') and save(pg)['done'].get('m01'), 'with the victory saved')
    ok(not pg.evaluate("()=>__RTS.G.camp.hold"), 'and the mission is no longer held')
    ctx.close()

SECTIONS = [('menu', sec_menu), ('flow', sec_flow), ('end', sec_end), ('endhold', sec_endhold), ('archive', sec_archive), ('finale', sec_finale), ('a11y', sec_a11y), ('layout', sec_layout), ('touch', sec_touch)]
with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
    for name, fn in SECTIONS:
        if not want(name): continue
        try: fn(b)
        except Exception as e:
            import traceback; traceback.print_exc()
            ok(False, f'section {name} crashed: {type(e).__name__}: {str(e)[:200]}')
    real = [e for e in errs if not (e[0] == 'console' and False)]
    ok(not real, f'zero page errors / console errors {real[:3]}')
    ok(not reqs, f'zero network requests {reqs[:3]}')
    b.close()
print(f'\n{time.time() - T0:.0f} s  ' + (f'{len(fails)} FAILURE(S)' if fails else 'ALL E2E CHECKS PASSED'))
sys.exit(1 if fails else 0)
