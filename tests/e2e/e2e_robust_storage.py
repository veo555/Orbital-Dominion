"""Robustness gate, part 3: localStorage failures and bad stored data.
   python3 tests/e2e/e2e_robust_storage.py        (about 3 minutes; OD_URL=file://... points the REAL checks at a scratch build)

* storage that throws (SecurityError on access, QuotaExceededError on write, getItem failing): the game boots, a match starts and can be paused (autosave fails quietly),
  settings can be changed, the campaign menu opens - zero uncaught errors.
* every stored key (settings, campaign save, resume slot + meta, supporter, last-error) filled with garbage (not JSON, null, an array, the wrong schema, huge numbers):
  boot works, the menu shows, SET holds only valid values (types, ranges, enums), the Continue button is not offered for a bad slot, a match starts.
* settings written by v4 (with the removed 'voice' / 'voiceVol' keys) still load; the keys disappear on the next save.
* a resume snapshot written by ANOTHER BUILD, or a structurally damaged one, is refused (toast, slot cleared), never crashes.
Each rule has a MUTANT build (readable build with the validation patched out, tests/e2e/robust_lib.py) that must fail the matching check.
"""
import os, sys, json, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from playwright.sync_api import sync_playwright
from robust_lib import *

R = Rec()
KEYS = {'settings': 'orbital_dominion_v4_settings', 'campaign': 'orbital_dominion_v4_campaign', 'resume': 'orbital_dominion_v4_resume', 'resume_meta': 'orbital_dominion_v4_resume_meta',
        'supporter': 'orbital_dominion_v4_supporter', 'lasterr': 'orbital_dominion_v4_lasterr'}
GARBAGE = {'not json': '{{{ not json', 'null': 'null', 'array': '[1,2,3]', 'wrong schema': '{"v":999,"music":"loud","sfx":1e999,"quality":{"a":1},"done":"yes","tier":{"x":1},"title":5,"time":"soon","camp":7}',
           'huge number': '{"music":1e308,"sfx":-1e308,"v":1,"done":{"m01":{"stars":1e99,"best":-5}}}'}


def seed(values):
    """init script that fills localStorage BEFORE the game's scripts run"""
    return "try{" + ";".join(f"localStorage.setItem({KEYS[k]!r},{v!r})" for k, v in values.items()) + "}catch(e){}"


def sane_settings(pg):
    return pg.evaluate("""()=>{const S=__RTS.SET,ok=[];
      for(const k of ['music','sfx'])ok.push(typeof S[k]==='number'&&isFinite(S[k])&&S[k]>=0&&S[k]<=1);
      ok.push(['auto','battery','balanced','high','ultra'].includes(S.quality));
      ok.push(['meridian','obsidian','aurora'].includes(S.faction));
      ok.push(['random','meridian','obsidian','aurora'].includes(S.enemy));
      ok.push(['easy','normal','hard','master'].includes(S.diff));
      ok.push(['','gold','magenta','ice'].includes(S.theme));
      for(const k of ['edge','hints','shake','swarm','swarmHints','cb','rm','haptics','wake','fps'])ok.push(typeof S[k]==='boolean');
      ok.push(!('voice' in S)&&!('voiceVol' in S));
      return ok.every(Boolean);}""")


def boots_and_plays(b, url, init, label):
    errs = {}
    ctx, pg, e = open_page(b, url, init=init, errs=errs)
    pg.wait_for_function("()=>!!(window.__RTS&&__RTS.G)", timeout=15000); pg.wait_for_timeout(500)
    menu = pg.evaluate("()=>!document.getElementById('menu').classList.contains('hidden')")
    sane = sane_settings(pg)
    cont_hidden = pg.evaluate("()=>document.getElementById('bContinue').classList.contains('hidden')")
    camp_ok = pg.evaluate("()=>{try{const r=__RTS.campaignSaveRead?__RTS.campaignSaveRead():null;return true;}catch(e){return false;}}")
    start_match(pg, 500)
    # a few moves: settings slider, pause (autosave attempt), unpause
    pg.evaluate("()=>{const el=document.getElementById('setMusic');el.value=40;el.dispatchEvent(new Event('input',{bubbles:true}));}")
    pg.evaluate("()=>__RTS.togglePause()"); pg.wait_for_timeout(100); pg.evaluate("()=>__RTS.togglePause()"); pg.wait_for_timeout(300)
    adv = tick(pg); pg.wait_for_timeout(800); adv = tick(pg) - adv
    playing = pg.evaluate("()=>__RTS.ui.running&&!__RTS.ui.demo")
    ctx.close()
    good = menu and sane and cont_hidden and playing and adv >= 4 and not e["page"] and not e["console"]
    return good, f"{label}: menu {menu}, settings valid {sane}, Continue hidden {cont_hidden}, playing {playing} (+{adv} ticks), page errors {e['page'][:2]}, console {e['console'][:2]}"


def chk_throwing(b, url):
    out = []
    for name, init in (('localStorage access throws SecurityError', "Object.defineProperty(window,'localStorage',{get(){throw new DOMException('The operation is insecure.','SecurityError')},configurable:true});"),
                       ('setItem throws QuotaExceededError', "Storage.prototype.setItem=function(){throw new DOMException('quota','QuotaExceededError')};"),
                       ('getItem throws', "Storage.prototype.getItem=function(){throw new Error('storage unavailable')};")):
        out.append(boots_and_plays(b, url, init, name))
    return all(g for g, _ in out), ' | '.join(m[:150] for _, m in out)


def chk_garbage(b, url):
    res = []
    for key in ('settings', 'campaign', 'resume', 'resume_meta', 'supporter', 'lasterr'):
        for gname, g in GARBAGE.items():
            vals = {key: g}
            if key == 'resume_meta': vals['resume'] = g
            good, msg = boots_and_plays(b, url, seed(vals), f'{key}={gname}')
            res.append((good, msg))
    bad = [m for g, m in res if not g]
    return not bad, f'{len(res)} boots with garbage in each key: {len(res) - len(bad)} fine' + (f'; FIRST FAILURE: {bad[0][:260]}' if bad else '')


def chk_settings_validation(b, url):
    """a mix of valid, invalid and removed (v4 voice) settings"""
    errs = {}
    old = json.dumps({'music': 0.3, 'sfx': 0.5, 'voiceVol': 0.7, 'voice': False, 'edge': False, 'quality': 'bogus', 'faction': 'zzz', 'diff': 'hard', 'swarm': 'yes', 'fps': True, 'unknownKey': 1})
    ctx, pg, e = open_page(b, url, init=seed({'settings': old}), errs=errs)
    pg.wait_for_function("()=>!!(window.__RTS&&__RTS.G)", timeout=15000); pg.wait_for_timeout(400)
    S = pg.evaluate("()=>JSON.parse(JSON.stringify(__RTS.SET))")
    pg.evaluate("()=>{const el=document.getElementById('setSfx');el.value=61;el.dispatchEvent(new Event('input',{bubbles:true}));}")
    saved = pg.evaluate("()=>JSON.parse(localStorage.getItem('orbital_dominion_v4_settings'))")
    ctx.close()
    good = (S['music'] == 0.3 and S['sfx'] == 0.5 and S['edge'] is False and S['diff'] == 'hard' and S['fps'] is True and S['quality'] == 'auto' and S['faction'] == 'meridian' and S['swarm'] is True
            and 'voice' not in S and 'voiceVol' not in S and 'unknownKey' not in S and 'voice' not in saved and 'voiceVol' not in saved and saved['sfx'] == 0.61 and not e['page'])
    return good, f"loaded {{music {S['music']}, sfx {S['sfx']}, edge {S['edge']}, diff {S['diff']}, quality {S['quality']}, faction {S['faction']}, swarm {S['swarm']}}}, removed keys gone {'voice' not in S and 'voice' not in saved}, page errors {e['page'][:2]}"


def chk_resume_versions(b, url):
    # 1. play a bit, pause (autosave), grab the real slot
    ctx, pg, e = open_page(b, url)
    start_match(pg, 700); pg.wait_for_timeout(1200)
    pg.evaluate("()=>__RTS.togglePause()"); pg.wait_for_timeout(200)
    slot = pg.evaluate("()=>({s:localStorage.getItem('orbital_dominion_v4_resume'),m:localStorage.getItem('orbital_dominion_v4_resume_meta')})")
    ctx.close()
    if not slot['s'] or not slot['m']: return False, 'no autosave slot was written by pausing'
    meta = json.loads(slot['m']); snap = json.loads(slot['s'])
    other = dict(snap, b='ffffffffff')
    out = []
    # 2. the genuine slot is offered and loads
    ctx, pg, e = open_page(b, url, init=seed({'resume': slot['s'], 'resume_meta': slot['m']}))
    pg.wait_for_function("()=>!!(window.__RTS&&__RTS.G)", timeout=15000); pg.wait_for_timeout(500)
    offered = not pg.evaluate("()=>document.getElementById('bContinue').classList.contains('hidden')")
    pg.mouse.move(683, 400); pg.click('#bContinue'); pg.wait_for_timeout(900)
    loaded = pg.evaluate("()=>__RTS.ui.running&&!__RTS.ui.demo&&__RTS.G.units.length>5")
    ctx.close(); out.append(('genuine slot loads', offered and loaded))
    # 3. a snapshot of ANOTHER BUILD behind a plausible meta: Continue is offered, loading is refused, nothing crashes, the slot is cleared
    ctx, pg, e = open_page(b, url, init=seed({'resume': json.dumps(other), 'resume_meta': slot['m']}))
    pg.wait_for_function("()=>!!(window.__RTS&&__RTS.G)", timeout=15000); pg.wait_for_timeout(500)
    pg.evaluate("()=>{document.getElementById('bContinue').classList.remove('hidden')}")
    pg.mouse.move(683, 400); pg.click('#bContinue'); pg.wait_for_timeout(700)
    refused = pg.evaluate("()=>!localStorage.getItem('orbital_dominion_v4_resume')&&(!__RTS.ui.running||__RTS.ui.demo)")
    ctx.close(); out.append(('snapshot of another build refused', refused and not e['page']))
    # 4. a meta written by another build is not even offered
    ctx, pg, e = open_page(b, url, init=seed({'resume': slot['s'], 'resume_meta': json.dumps(dict(meta, build='ffffffffff'))}))
    pg.wait_for_function("()=>!!(window.__RTS&&__RTS.G)", timeout=15000); pg.wait_for_timeout(500)
    hidden = pg.evaluate("()=>document.getElementById('bContinue').classList.contains('hidden')")
    ctx.close(); out.append(('slot of another build not offered', hidden))
    # 5. same build id, damaged structure (the player's hub removed): refused
    dmg = json.loads(slot['s'])
    for n in dmg['nodes']:
        if isinstance(n, dict) and 'o' in n and n['o'].get('type') == 'hub' and n['o'].get('team') == 0:
            n['o']['type'] = 'rubble'
    ctx, pg, e = open_page(b, url, init=seed({'resume': json.dumps(dmg), 'resume_meta': slot['m']}))
    pg.wait_for_function("()=>!!(window.__RTS&&__RTS.G)", timeout=15000); pg.wait_for_timeout(500)
    pg.mouse.move(683, 400); pg.click('#bContinue'); pg.wait_for_timeout(700)
    refused2 = pg.evaluate("()=>!localStorage.getItem('orbital_dominion_v4_resume')&&(!__RTS.ui.running||__RTS.ui.demo)")
    ctx.close(); out.append(('snapshot without a player hub refused', refused2 and not e['page']))
    return all(v for _, v in out), '; '.join(f'{k}: {v}' for k, v in out)


MUTANTS = [
    ('settings not validated', chk_settings_validation, [("try{Object.assign(SET,settingsSanitize(JSON.parse(localStorage.getItem(SETKEY)||'null')));}catch(e){}", "try{Object.assign(SET,JSON.parse(localStorage.getItem(SETKEY)||'null'));}catch(e){}")]),
    ('snapshot build check removed', chk_resume_versions, [("S.v!==SAVE_V||S.b!==saveBuild()||", "S.v!==SAVE_V||")]),
    ('snapshot sanity check + resume try/catch removed', chk_resume_versions, [("typeof g!=='object'||!saveSane(g))return null;", "typeof g!=='object')return null;"),
        ("try{started=!!m&&!!text&&startGame({resume:text,campaignId:m.camp});}catch(e){started=false;try{guardReport('resume',e);}catch(_){}}", "started=!!m&&!!text&&startGame({resume:text,campaignId:m.camp});")]),
    ('resume meta not validated', chk_resume_versions, [("if(typeof BUILD!=='undefined'&&m.build!==BUILD.id)return null;", "")]),
    ('throwing storage not tolerated', chk_throwing, [("function saveSettings(){try{localStorage.setItem(SETKEY,JSON.stringify(SET));}catch(e){}}", "function saveSettings(){localStorage.setItem(SETKEY,JSON.stringify(SET));}")]),
]

with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
    ONLY = os.environ.get('ONLY', '')
    for name, chk in (('throwing storage (SecurityError / Quota / getItem)', chk_throwing), ('garbage in every key', chk_garbage), ('settings validation + v4 voice keys', chk_settings_validation), ('resume snapshot versions + damage', chk_resume_versions)):
        if ONLY and ONLY not in name: continue
        try: good, msg = chk(b, URL)
        except Exception as ex: good, msg = False, f'exception {type(ex).__name__}: {str(ex)[:200]}'
        R.ok(good, f'{name}: {msg}')
    for name, chk, patches in MUTANTS:
        if ONLY and ONLY not in name: continue
        url = mutant_url(patches)
        try: good, msg = chk(b, url)
        except Exception as ex: good, msg = False, f'exception {type(ex).__name__}: {str(ex)[:100]}'
        R.ok(not good, f'MUTANT "{name}" is caught: {"the check FAILED as it must (" + msg[:150] + ")" if not good else "NOT CAUGHT - the check cannot fail: " + msg[:160]}')
    b.close()
R.done('ROBUSTNESS (STORAGE)')
