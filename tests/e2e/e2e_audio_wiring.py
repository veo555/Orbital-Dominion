"""Audio wiring gate (Playwright + Chromium). Exit code != 0 on failure.   python3 tests/e2e/e2e_audio_wiring.py     (about 1-2 minutes; OD_URL=file://... points it at a scratch build)

Do the game's events REACH the audio engine, with the right arguments?  (docs/AUDIO_SPEC.md §2/§3/§4, docs/CINEMATIC_SPEC.md §5.11, docs/CAMPAIGN_SPEC.md §3.4)
It drives the REAL game code in an instrumented COPY of the build (the source is never touched):
  * every call of musicPlay / musicStop / musicScene / musicStinger / musicDuck / musicMood / speak / speakStop is logged (the function declarations are wrapped in the copy;
    they must therefore stay plain `function name(...){}` declarations - the engine's own sfx family is observed through AUD.log, which records sfx / sfxUnit / sfxBuilding / cineSfx)
  * window.__EV(s)=eval(s) gives the scenarios access to the closure (kill, castSkill, damageEnt, campDo ...)

WHAT MUST BE WIRED (each line below is one check; the contract is the spec, the thresholds are in the scenario code tests/audio/wiring_page.js)
  sim -> sfx(name,x,y,who)   a unit that fires (shoot/bolt/rocket/shell/acid/melee) passes ITSELF as `who` (entity -> type + faction), so <type>.fire|melee.<faction> plays; a unit/building that
                             dies (boom/boomBig), a trained unit (done), a finished building (done), a building placed (place), a selected unit (select), an acknowledged order (ack) and a cast
                             hero skill (skill:<id>) all pass the entity that the sound belongs to.  Creeps are faction 'wild'.
  ui / sim -> global sounds  err (refused command), train, click (panel button), alert (base attacked), level (hero), win / lose (game over)
  vocabulary                 every SFX_GLOBAL name has at least one call site in the sources (a sound nothing can trigger is dead content)
  match -> musicScene        the running match tells the music engine the player's faction, era, intensity (combat) and night; musicStinger plays sting_victory / sting_defeat / sting_era / sting_hero /
                             sting_alarm; the menu plays the `title` cue
  campaign                   a mission's `mood` action reaches the music (musicMood / musicScene({mood}) / musicPlay(<cue>)), its `radio` action is voiced with speak(who,text,{style}), its `strike`
                             action warns through sfx
  cinematics                 cinePlay starts the film's music cue, plays every scene sfx through cineSfx (voice cine.<name>), speaks every line with speak(who,text,{style}) and ducks the music;
                             stopping it calls speakStop and musicStop
CONTROLS (CLAUDE.md rule 15: a check that cannot fail is worthless):
  * NEGATIVE: in a copy where the sfx wrapper drops its 4th argument, every `who` check MUST fail
  * POSITIVE: in a copy with the minimal reference wiring (additive one-line patches, listed in REF_PATCHES) every check whose patch applied MUST pass.  A patch whose target text no longer exists
    means the real code was changed (probably wired): that patch is skipped and the real build is judged on its own.
Limits: observes calls, not sound; it cannot tell that the right sound was chosen musically, only that the right function got the right entity / cue.  No real device audio."""
import os, re, sys, json, time, pathlib, subprocess, tempfile, collections, urllib.request
from urllib.parse import unquote, urlparse
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
URL = os.environ.get('OD_URL') or (ROOT / 'dist' / 'orbital_dominion_v3.html').as_uri()
OUT = ROOT / 'tests' / 'out' / 'audio'; OUT.mkdir(parents=True, exist_ok=True)
AUDIO = ROOT / 'tests' / 'audio'
T0 = time.time(); fails = []; errs = []; reqs = []


def ok(c, m):
    print(('ok    ' if c else 'FAIL  ') + m, flush=True)
    if not c: fails.append(m)


def note(m): print('note  ' + m, flush=True)


def vocab(name):
    t = (ROOT / 'src' / 'js' / '43_vocab.js').read_text(encoding='utf-8')
    m = re.search(r'const ' + name + r'=\[(.*?)\];', t, re.S)
    return re.findall(r"'([^']+)'", re.sub(r'//[^\n]*', '', m.group(1)))


SFX_GLOBAL, CINE_SFX = vocab('SFX_GLOBAL'), vocab('CINE_SFX')
PROBED = ['musicPlay', 'musicStop', 'musicScene', 'musicStinger', 'musicDuck', 'musicMood', 'speak', 'speakStop']


# ------------------------------------------------------------------ the instrumented copies
def probe(html):
    """wrap the declarations of the music/voice functions with a logger; add the eval hook before boot()"""
    missing = []
    for n in PROBED:
        ms = list(re.finditer(r'function\s+' + n + r'\s*\(([^)]*)\)\s*\{', html))
        if len(ms) != 1: missing.append(f'{n} ({len(ms)} declarations)'); continue
        e = ms[0].end(); html = html[:e] + "window.__WL.push({f:'%s',a:Array.prototype.slice.call(arguments),t:performance.now()});" % n + html[e:]
    i = html.rindex('\nboot();')
    html = html[:i] + '\nwindow.__EV=(s)=>eval(s);' + html[i:]
    return html, missing


# minimal reference wiring: (name, old, new, [member ids it makes pass])   - additive one-liners that show what a correct call site looks like
REF_PATCHES = [
    ('fire (ranged) passes the attacker', "sfx(d.proj==='bullet'?'shoot':d.proj==='rocket'?'rocket':d.proj==='shell'?'shell':d.proj==='acid'?'acid':'bolt',src.x,src.y);",
     "sfx(d.proj==='bullet'?'shoot':d.proj==='rocket'?'rocket':d.proj==='shell'?'shell':d.proj==='acid'?'acid':'bolt',src.x,src.y,src);", ['fire.rifleman', 'fire.rocketeer', 'fire.howitzer', 'fire.juggernaut', 'fire.skiff', 'fire.spitter']),
    ('fire (melee) passes the attacker', "sfx('melee',src.x,src.y);", "sfx('melee',src.x,src.y,src);", ['fire.raptor', 'fire.crawler', 'fire.brute']),
    ('unit death passes the unit', "explode(e.x,e.y,false,e.flying);sfx('boom',e.x,e.y);", "explode(e.x,e.y,false,e.flying);sfx('boom',e.x,e.y,e);", ['die.unit', 'die.creep']),
    ('building death passes the building', "explode(e.x,e.y,true);sfx('boomBig',e.x,e.y);", "explode(e.x,e.y,true);sfx('boomBig',e.x,e.y,e);", ['die.building']),
    ('trained unit passes the unit', "if(q.k==='u'){spawnUnit(b,q.id);if(b.team===0&&!G.ais[0])sfx('done');}", "if(q.k==='u'){const nu=spawnUnit(b,q.id);if(b.team===0&&!G.ais[0])sfx('done',b.x,b.y,nu);}", ['ready']),
    ('finished building passes the building', "toast(d.name+' complete','good');sfx('done');", "toast(d.name+' complete','good');sfx('done',b.x,b.y,b);", ['bdone']),
    ('placed building passes the building', "if(u.team===0&&!G.ais[0])sfx('place');uiDirty();}", "if(u.team===0&&!G.ais[0])sfx('place',b.x,b.y,b);uiDirty();}", ['place']),
    ('ack passes the first unit', "ping(x,y,kind==='attack'?'#ff6a5a':'#6dff9d');sfx('ack');", "ping(x,y,kind==='attack'?'#ff6a5a':'#6dff9d');sfx('ack',x,y,units[0]);", ['ack.group']),
    ('selection plays the select voice', "ui.sel=arr;ui.selSet=new Set(arr);ui.activeType=arr.length?arr[0].type:null;", "if(arr.length&&arr[0].kind==='unit'&&arr[0].team===0)sfx('select',arr[0].x,arr[0].y,arr[0]);ui.sel=arr;ui.selSet=new Set(arr);ui.activeType=arr.length?arr[0].type:null;", ['select']),
    ('a cast skill plays skill.<id>', "function castSkill(u,i,x,y){\n  if(!canCast(u,i))return false;", "function castSkill(u,i,x,y){\n  if(!canCast(u,i))return false;sfx('skill:'+skillOf(u,i).id,x,y,u);", ['skill']),
    ('the match loop feeds musicScene', "function frame(ts){\n  requestAnimationFrame(frame);",
     "function frame(ts){\n  requestAnimationFrame(frame);if(G&&!ui.demo&&(ts-(window.__mst||0))>400){window.__mst=ts;musicScene({faction:G.teams[0].faction,era:G.teams[0].era,intensity:(G.time-G.fightT<9)?1:0.2,night:1-G.daylight});}", ['music.faction', 'music.era', 'music.fight', 'music.night']),
    ('game over plays a sting', "function onGameOver(res){", "function onGameOver(res){musicStinger(res==='victory'?'sting_victory':'sting_defeat');", ['sting.victory', 'sting.defeat']),
    ('an era-up plays sting_era', "sfx('era');say('Era advanced');", "sfx('era');musicStinger('sting_era');say('Era advanced');", ['sting.era']),
    ('a hero arriving plays sting_hero', "say(q.revive?'Hero revived':'Hero ready');", "musicStinger('sting_hero');say(q.revive?'Hero revived':'Hero ready');", ['sting.hero']),
    ('an attack on the base plays sting_alarm', "sfx('alert');say('Your forces are under attack');", "sfx('alert');musicStinger('sting_alarm');say('Your forces are under attack');", ['sting.alarm']),
    ('the menu plays the title cue', "function toMenu(){stopSpeech();", "function toMenu(){musicPlay('title');stopSpeech();", ['title']),
    ('the campaign UI voices radio and mood', "function onCampaignEvent(e){}", "function onCampaignEvent(e){if(e&&e.type==='mood')musicMood(e.mood);if(e&&e.type==='radio'){const r=STORY.radio&&STORY.radio[e.id];if(r)speak(r.who,r.text,{style:r.style});}}", ['camp.mood', 'camp.radio']),
]
NOWHO = ("function sfx(name,x,y,who){return AUDIO.sfx(name,x,y,who);}", "function sfx(name,x,y,who){return AUDIO.sfx(name,x,y);}")


def story_fixture():
    code = "const m=require(process.argv[1])();process.stdout.write(JSON.stringify({characters:m.characters,cine:m.cine,radio:m.radio,missions:m.missions}))"
    r = subprocess.run(['node', '-e', code, str(ROOT / 'tests' / 'fixtures' / 'story_min.js')], capture_output=True, text=True, cwd=str(ROOT))
    if r.returncode: sys.exit('node could not load tests/fixtures/story_min.js:\n' + r.stderr)
    return json.loads(r.stdout)


FX = story_fixture()
ATT_RANGED = [('rifleman', 0), ('rocketeer', 0), ('howitzer', 0), ('juggernaut', 0), ('skiff', 0), ('spitter', 2)]
ATT_MELEE = [('raptor', 0), ('crawler', 2), ('brute', 2)]


def run_page(b, html_text, label, track=False):
    """boot the (instrumented) build, start a match and run every scenario; returns the observations"""
    f = pathlib.Path(tempfile.mkdtemp(prefix='od_audio_wire_')) / 'build.html'; f.write_text(html_text, encoding='utf-8')
    pg = b.new_page(viewport={'width': 1366, 'height': 800})
    if track:
        pg.on('pageerror', lambda e: errs.append(('pageerror', str(e))))
        pg.on('console', lambda m: errs.append((m.type, m.text)) if m.type in ('error', 'warning') else None)
        pg.on('request', lambda r: reqs.append(r.url[:80]) if not r.url.startswith(('file:', 'data:', 'blob:')) else None)
    pg.add_init_script("window.__TEST='live';window.__WL=[];")
    pg.goto(f.as_uri()); pg.wait_for_function("()=>!!(window.__RTS&&window.__EV)", timeout=15000); pg.wait_for_timeout(500)
    pg.mouse.click(400, 300); pg.wait_for_timeout(250)           # the user gesture that creates the AudioContext
    pg.add_script_tag(content=(AUDIO / 'wiring_page.js').read_text(encoding='utf-8'))

    def fresh():
        pg.evaluate("()=>{window.OW.reset();__RTS.showOverlay('menu');}"); pg.click('#bStart'); pg.wait_for_timeout(900)
        pg.evaluate("()=>{__RTS.G.paused=true;}")
    obs = {'label': label, 'meta': pg.evaluate("()=>({faction:null})")}
    def S(key, js, arg=None):
        try: obs[key] = pg.evaluate(js, arg) if arg is not None else pg.evaluate(js)
        except Exception as e: obs[key] = {'error': str(e)[:300]}
    fresh(); obs['faction'] = pg.evaluate("()=>__RTS.G.teams[0].faction")
    obs['fire'] = {}
    for t, team in ATT_RANGED + ATT_MELEE: S('fire.' + t, "([t,te])=>OW.fire(t,te)", [t, team])
    S('die.unit', "()=>OW.die('unit','rifleman',0)"); S('die.creep', "()=>OW.die('unit','crawler',2)"); S('die.building', "()=>OW.die('building','depot',0)")
    S('ready', "()=>OW.ready()"); S('bdone', "()=>OW.buildingDone()"); S('place', "()=>OW.place()"); S('selectack', "()=>OW.selectAck()"); S('skills', "()=>OW.skills()")
    S('globals', "()=>OW.globals()")
    S('musicScene', "()=>OW.musicScene()")
    for k in ('era', 'alarm', 'hero'):
        # the music director allows one sting_alarm per 25 game seconds per match and the 'globals' scenario above already attacked the base: the alarm gets a fresh match
        if k == 'alarm': fresh()
        S('sting.' + k, "(k)=>OW.stingers(k)", k)
    S('title', "()=>OW.title()")
    S('campaign', "(fx)=>OW.campaign(fx)", FX)
    S('cine', "(fx)=>OW.cine(fx,'intro')", FX)
    fresh(); S('sting.victory', "()=>OW.stingers('victory')"); obs['win'] = pg.evaluate("()=>__RTS.AUD.log.map(l=>l.name)")
    fresh(); S('sting.defeat', "()=>OW.stingers('defeat')"); obs['lose'] = pg.evaluate("()=>__RTS.AUD.log.map(l=>l.name)")
    pg.close()
    return obs


# ------------------------------------------------------------------ judging: every member is (id, ok, message)
def entry_ok(e, who, fac):
    """(wired, why, resolved, why): wired = the entity (type + faction) reached sfx; resolved = it then found its own <type>.* voice (needs the voice content)"""
    if not e: return False, 'nothing reached sfx', False, 'nothing reached sfx'
    if e.get('who') != who: return False, f"sfx('{e['name']}') had who={e.get('who')} (expected {who})", False, 'not wired'
    if e.get('faction') != fac: return False, f"faction {e.get('faction')} (expected {fac})", False, 'not wired'
    own = (e.get('voice') or '').startswith(who + '.')
    return True, '', own, '' if own else f"{who}: sfx('{e['name']}') resolved to {e.get('voice')} - no {who}.* voice is registered for it"


def judge(o):
    C = []   # (group, member, ok, msg)
    def add(g, m, c, msg=''): C.append((g, m, bool(c), msg))
    def ent(g, m, e, who, fac, label=None):
        w, wm, r, rm = entry_ok(e, who, fac); add(g, m, w, (label or who) + ': ' + wm)
        if w: add('resolve', m + '.voice', r, rm)   # only counted once the entity is wired: this line is about voice CONTENT
    fac = o['faction']
    for t, team in ATT_RANGED + ATT_MELEE:
        r = o['fire.' + t]
        if 'error' in r: add('fire', 'fire.' + t, False, r['error']); continue
        ent('fire', 'fire.' + t, r['entry'], t, r['faction'])
    for k, ty in (('die.unit', 'rifleman'), ('die.creep', 'crawler'), ('die.building', 'depot')):
        r = o[k]
        if 'error' in r: add('die', k, False, r['error']); continue
        ent('die', k, r['entry'], ty, r['faction'])
    for k, ty, lab in (('ready', 'hauler', 'trained unit'), ('bdone', 'depot', 'finished building'), ('place', 'depot', 'placed building')):
        r = o[k]
        if 'error' in r: add('made', k, False, f'{lab}: {r["error"]}'); continue
        ent('made', k, r['entry'], ty, r['faction'], f'{lab} ({ty})')
    sa = o['selectack']
    if 'error' in sa: add('selack', 'select', False, sa['error']); add('selack', 'ack.group', False, sa['error'])
    else:
        ent('selack', 'select', sa['select'], 'rifleman', sa['faction'], 'select'); ent('selack', 'ack.group', sa['ack'], 'rifleman', sa['faction'], 'ack')
    ids = ['barrage', 'orbital', 'shock', 'rampage', 'veil', 'sing']
    for s in o['skills'] if isinstance(o['skills'], list) else []:
        if 'error' in s: add('skill', 'skill', False, f"{s['id']}: {s['error']}"); continue
        # the CASTER must be passed as `who` (checking the name alone passed with the who-dropping control)
        wired = any(l['name'] == 'skill:' + s['id'] and l.get('who') == s['hero'] for l in s['log']); own = any(l['voice'] == 'skill.' + s['id'] for l in s['log'])
        add('skill', 'skill', s['cast'] and wired, f"{s['id']}: " + ('did not cast' if not s['cast'] else 'sfx saw ' + ','.join(l['name'] for l in s['log']) if s['log'] else 'no sfx') + (' (expected sfx(\'skill:%s\',x,y,hero))' % s['id'] if s['cast'] and not wired else ''))
        if wired: add('resolve', 'skill.' + s['id'] + '.voice', own, f"skill:{s['id']} found no skill.{s['id']} voice")
    g = o['globals']
    if 'error' in g: add('glob', 'glob', False, g['error'])
    else:
        add('glob', 'err', g.get('err'), 'err: a refused command plays no `err`'); add('glob', 'train', g.get('train'), 'train: queueing plays no `train`')
        add('glob', 'click', g.get('click', {}).get('found') and 'click' in g['click']['names'], 'click: a Swarm-panel tab press plays no `click` ' + str(g.get('click')))
        add('glob', 'alert', g.get('alert'), 'alert: damaging a player building plays no `alert` ' + str(g.get('alertError', ''))); add('glob', 'level', g.get('level'), 'level: a hero level-up plays no `level` ' + str(g.get('levelError', '')))
    add('glob', 'win', 'win' in o['win'], f"win: ending the match as a victory played {o['win'][:6]}"); add('glob', 'lose', 'lose' in o['lose'], f"lose: ending the match as a defeat played {o['lose'][:6]}")
    ms = o['musicScene']
    if 'error' in ms: add('music', 'music.faction', False, ms['error'])
    else:
        calm, era2, fight, aft, night = ms.get('calm'), ms.get('era2'), ms.get('fight'), ms.get('afterFight'), ms.get('night')
        add('music', 'music.faction', calm and calm.get('faction') == fac and ms['calls'] > 0, f"musicScene while the match runs: {json.dumps(calm)} ({ms.get('calls')} calls in 0.9 s; the player's faction is {fac})")
        add('music', 'music.era', era2 and era2.get('era') == 2, f"era 1 -> 2: musicScene got {json.dumps(era2)}")
        add('music', 'music.fight', fight and aft and fight.get('intensity', 0) > 0.5 and aft.get('intensity', 1) < 0.5, f"combat raises the intensity and it falls again: during {json.dumps(fight)}, after {json.dumps(aft)} (G.time-G.fightT {ms.get('fightT')})")
        add('music', 'music.night', night and night.get('night', 0) > 0.5 and ms.get('daylight', 1) < 0.35, f"night (daylight {ms.get('daylight')}): musicScene got {json.dumps(night)}")
    for k, cue in (('victory', 'sting_victory'), ('defeat', 'sting_defeat'), ('era', 'sting_era'), ('hero', 'sting_hero'), ('alarm', 'sting_alarm')):
        r = o['sting.' + k]; calls = r.get('calls', []) if isinstance(r, dict) else []
        add('sting', 'sting.' + k, any(c['cue'] == cue for c in calls), f"{cue}: calls were {calls[:4] or 'none'}")
    t = o['title']; add('music', 'title', any(c['cue'] == 'title' and c['f'] == 'musicPlay' for c in t.get('calls', [])), f"menu: calls were {t.get('calls', [])[:4] or 'none'} (the `title` cue must play)")
    cp = o['campaign']
    if 'error' in cp: add('camp', 'camp.mood', False, cp['error']); add('camp', 'camp.radio', False, cp['error']); add('camp', 'strike', False, cp['error'])
    else:
        mood = any((e['f'] == 'musicMood' and e['a'][:1] == ['tension']) or (e['f'] == 'musicScene' and isinstance(e['a'][0], dict) and e['a'][0].get('mood') == 'tension') or (e['f'] == 'musicPlay' and e['a'][:1] == ['tension']) for e in cp.get('mood', []))
        add('camp', 'camp.mood', mood, f"mission action ['mood','tension']: music saw {[(e['f'], e['a'][:1]) for e in cp.get('mood', [])][:3] or 'nothing'} {cp.get('moodError', '')}")
        ex = cp.get('radioExpect', {}); sp = cp.get('radio', [])
        add('camp', 'camp.radio', any(s['who'] == ex.get('who') and s['text'] == ex.get('text') for s in sp), f"mission action ['radio',id]: speak saw {[(s['who'], (s['text'] or '')[:24]) for s in sp][:2] or 'nothing'}, expected {ex.get('who')}: {(ex.get('text') or '')[:24]} {cp.get('radioError', '')}")
        add('camp', 'strike', 'alert' in cp.get('strike', []), f"mission action strike: sfx saw {cp.get('strike')}")
    ci = o['cine']
    if 'error' in ci: add('cine', 'cine.music', False, ci['error'])
    else:
        allc = ci['all']; mp = [e for e in allc if e['f'] == 'musicPlay']
        add('cine', 'cine.music', any(e['a'][:1] == [ci['music']] for e in mp), f"cinePlay starts the film's cue `{ci['music']}`: musicPlay saw {[e['a'][:1] for e in mp][:3] or 'nothing'}")
        add('cine', 'cine.sfx', any(l['voice'] == 'cine.' + ci['firstSfx']['name'] for l in ci['midSfx']), f"scene sfx `{ci['firstSfx']['name']}` reaches cineSfx (voice cine.{ci['firstSfx']['name']}): saw {[l['voice'] for l in ci['midSfx']][:4] or 'nothing'}")
        sp = [e for e in ci['mid'] if e['f'] == 'speak']
        add('cine', 'cine.line', any(e['a'][0] == ci['firstLine']['who'] and e['a'][1] == ci['firstLine']['text'] for e in sp), f"the first line is spoken with speak(who,text,{{style}}): saw {[(e['a'][0], (e['a'][1] or '')[:20]) for e in sp][:2] or 'nothing'}")
        dk = [e for e in ci['mid'] if e['f'] == 'musicDuck']
        add('cine', 'cine.duck', any(abs((e['a'][0] or 0) - 0.45) < 0.01 and (e['a'][1] or 0) > 500 for e in dk), f"each line ducks the music: musicDuck saw {[e['a'] for e in dk][:2] or 'nothing'}")
        add('cine', 'cine.stop', any(e['f'] == 'speakStop' for e in allc) and any(e['f'] == 'musicStop' for e in allc), "cineStop() calls speakStop and musicStop")
    return C


GROUPS = [('fire', 'sim: a unit that fires passes itself as `who` and reaches its <type>.fire|melee.<faction> voice'), ('die', 'sim: a dying unit / creep / building passes itself (boom / boomBig -> <type>.die.<faction>)'),
          ('made', 'sim: a trained unit, a finished building and a placed building pass themselves (done / place -> <type>.ready|done|place.<faction>)'), ('selack', 'ui: selecting a unit plays its select voice, ordering it plays its ack voice'),
          ('skill', 'sim: every active hero skill is cast through sfx(\'skill:<id>\',x,y,hero)'), ('resolve', 'end to end: every wired entity above then plays THEIR OWN voice (<type>.<event>.<faction> / skill.<id>) - needs the voice content of 81_sfx_*.js'), ('glob', 'ui/sim: err, train, click, alert, level, win and lose reach sfx'),
          ('music', 'match -> musicScene carries faction / era / combat intensity / night; the menu plays `title`'), ('sting', 'musicStinger plays sting_victory / defeat / era / hero / alarm'),
          ('camp', 'campaign: `mood` reaches the music, `radio` is voiced by speak(who,text,{style}), `strike` warns through sfx'), ('cine', 'cinematics: music cue, scene sfx via cineSfx, lines via speak + duck, stop -> speakStop + musicStop')]


def report(C, prefix=''):
    res = {}
    for g, title in GROUPS:
        mem = [c for c in C if c[0] == g]
        if not mem: continue
        bad = [c for c in mem if not c[2]]
        res[g] = (not bad, mem)
        ok(not bad, prefix + title + f' ({len(mem) - len(bad)}/{len(mem)})' + ('' if not bad else ' - ' + ' | '.join(c[3][:170] for c in bad[:4]) + (f' | ... +{len(bad)-4} more' if len(bad) > 4 else '')))
    return res


# ------------------------------------------------------------------ static: does every vocabulary name have a call site?
def balanced_args(text, i):
    d = 0; j = i
    while j < len(text):
        ch = text[j]
        if ch == '(': d += 1
        elif ch == ')':
            d -= 1
            if d == 0: return text[i + 1:j]
        j += 1
    return ''


def call_sites():
    files = [f for f in sorted((ROOT / 'src' / 'js').glob('*.js')) if not re.match(r'(8\d|43)_', f.name)]
    names = collections.defaultdict(list); fn_sites = collections.Counter()
    for f in files:
        t = f.read_text(encoding='utf-8')
        for m in re.finditer(r'\b(sfx|sfxUnit|sfxBuilding|cineSfx)\(', t):
            a = balanced_args(t, m.end() - 1)
            for q in re.findall(r"'([^']+)'", a): names[q].append(f.name)
            fn_sites[m.group(1)] += 1
        for fn in ('musicScene', 'musicStinger', 'musicPlay', 'musicMood', 'speak', 'cineSfx', 'sfxUnit', 'sfxBuilding'):
            fn_sites['ref:' + fn] += len(re.findall(r'(?<![\w.])' + fn + r'\b(?!\s*:)', t))
    return names, fn_sites


with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])        # no autoplay flag: the real autoplay policy applies
    html = None
    if URL.startswith('file:'): html = pathlib.Path(unquote(urlparse(URL).path)).read_text(encoding='utf-8')
    else: html = urllib.request.urlopen(URL, timeout=10).read().decode('utf-8')
    real, missing = probe(html)
    ok(not missing, 'the music / voice functions are plain `function` declarations (so calls to them can be observed)' + (f' - NOT FOUND exactly once: {missing}' if missing else ''))

    # ---------------------------------------------------------------- 1. the real build
    t1 = time.time(); obs = run_page(b, real, 'real', track=True); note(f'scenarios ran in {time.time()-t1:.0f} s')
    C = judge(obs); res = report(C)
    (OUT / 'audio_wiring.json').write_text(json.dumps({'observations': obs, 'checks': [{'group': g, 'id': m, 'ok': k, 'msg': s} for g, m, k, s in C]}, indent=1, default=str))

    # ---------------------------------------------------------------- 2. static call-site coverage
    names, fn = call_sites()
    dead = [n for n in SFX_GLOBAL if n not in names]
    ok(not dead, f'every SFX_GLOBAL name has a call site in the sources ({len(SFX_GLOBAL) - len(dead)}/{len(SFX_GLOBAL)})' + (f' - NO call site for: {", ".join(dead)}' if dead else ''))
    reach = {'sfx': fn['sfx'] > 0, 'sfxUnit/sfxBuilding': (fn['ref:sfxUnit'] + fn['ref:sfxBuilding'] > 0) or (res.get('fire', (False,))[0] and res.get('made', (False,))[0]), 'cineSfx': fn['ref:cineSfx'] > 0, 'musicScene': fn['ref:musicScene'] > 0, 'speak': fn['ref:speak'] > 0}
    ok(all(reach.values()), 'every audio entry point is reachable from game code: ' + ', '.join(f"{k} {'yes' if v else 'NO'}" for k, v in reach.items()) + f"  (call sites: sfx {fn['sfx']}, musicScene {fn['ref:musicScene']}, speak {fn['ref:speak']}, cineSfx {fn['ref:cineSfx']}, musicStinger {fn['ref:musicStinger']})")

    # ---------------------------------------------------------------- 3. controls
    if NOWHO[0] in html:
        nw, _ = probe(html.replace(NOWHO[0], NOWHO[1])); on = run_page(b, nw, 'nowho'); Cn = judge(on)
        whog = [c for c in Cn if c[0] in ('fire', 'die', 'made', 'selack', 'skill')]; still = [c for c in whog if c[2]]
        ok(not still, f'CONTROL (negative): with the sfx wrapper dropping its `who` argument every entity check fails ({len(whog) - len(still)}/{len(whog)} rejected)' + ('' if not still else ' - STILL PASSING: ' + ', '.join(c[1] for c in still)))
        nonwho = [c for c in Cn if c[0] == 'glob' and c[1] in ('err', 'click')]
        ok(all(c[2] for c in nonwho) or not all(c[2] for c in C if c[0] == 'glob' and c[1] in ('err', 'click')), 'CONTROL: dropping `who` leaves the non-entity sounds (err, click) as they were')
    else: ok(False, 'CONTROL (negative): the sfx wrapper text changed, the control cannot be built - update NOWHO in tests/e2e/e2e_audio_wiring.py')
    applied = []; rh = html
    for name, old, new, mem in REF_PATCHES:
        if rh.count(old) == 1: rh = rh.replace(old, new); applied.append((name, mem))
    skipped = [n for n, o, nn, m in REF_PATCHES if n not in [a[0] for a in applied]]
    if applied:
        rp, _ = probe(rh); rr = run_page(b, rp, 'reference'); Cr = judge(rr); want = {m for _, mem in applied for m in mem}
        got = [c for c in Cr if c[1] in want]; bad = [c for c in got if not c[2]]
        ok(bool(got) and not bad, f'CONTROL (positive): with the minimal reference wiring ({len(applied)} one-line patches) the {len(got)} wired checks pass - the checks CAN pass' + ('' if not bad else ' - STILL FAILING: ' + ' | '.join(c[3][:150] for c in bad[:4])))
    if skipped: note(f'reference patches not applicable (the target text is gone - already wired in the real code, or changed): {", ".join(skipped)}')
    b.close()

ok(not reqs, f'zero network requests {reqs[:3]}')
ok(not errs, f'zero page errors / console errors / warnings {errs[:3]}')
print(f'{"FAILED" if fails else "ALL OK"} ({time.time()-T0:.0f} s, {len(fails)} failures)')
sys.exit(1 if fails else 0)
