"""Sound Lab gate (Playwright + Chromium). Exit code != 0 on failure.   python3 tests/e2e/e2e_soundlab.py     (about 1 minute; OD_URL=file://... points it at a scratch build)
   python3 tests/e2e/e2e_soundlab.py --ref     run the gate against tests/audio/ref_soundlab.js injected into the build (the reference lab: proves the gate CAN pass; the controls use it
                                               automatically whenever the real lab is missing)

docs/AUDIO_SPEC.md §7: "Settings -> 'Sound lab' opens a panel listing every SFX voice (grouped Units / Buildings / Heroes / UI / Cinematic) with play buttons and a faction switch, and every
music cue/section with play/stop and a live intensity slider; character voices can read a sample line. It also shows live meters (peak/RMS from an AnalyserNode). Touch-friendly (44 px targets),
keyboard accessible, zero network."  The spec fixes behaviour, not markup, so the DOM contract below is what this gate (and tests/audio/ref_soundlab.js) uses - like the `data-act` contract of
CLAUDE.md rule 7. Anything it cannot find is reported as missing, never skipped.

THE SOUND LAB DOM CONTRACT
  entry         a visible button inside #setMenu whose accessible name matches /sound lab/i (native <button> or tabindex >= 0); activating it opens the lab
  root          #soundLab (or [data-sound-lab]); visible when open, role=dialog (or region) with an accessible name; Escape closes it (and calls musicStop + speakStop); the settings overlay is shown again
  voices        one  <button data-voice="<voice id>">  for EVERY id of audioVoices() (rows hidden by the current faction filter may be in the DOM or rendered when that faction is selected: the
                union over the faction views must cover the registry); each lies inside an element  data-group="Units|Buildings|Heroes|UI|Cinematic"  matching its id
                (hero_* and skill.* = Heroes, <building>.* = Buildings, other unit types = Units, ui.* / global.* = UI, cine.* = Cinematic). Pressing it plays THAT voice (audioPlay(id,...) or the
                sfx path: the engine log must show the id)
  faction       buttons  data-faction="meridian|obsidian|aurora|wild"; choosing one shows only that faction's rows (all visible faction rows end in .<faction>) or plays that faction's version
  music         <button data-cue="<MUSIC_CUES id>"> for every cue: first press musicPlay(id,...), second press musicStop; cues with sections (intro) also have >= 5 buttons
                data-cue="intro" data-section="0..4" calling musicPlay('intro',{section:n}); <input type=range data-lab="intensity"> calls musicScene({intensity: 0..1}) while it moves
  characters    <button data-char="<STORY.characters id>"> for every character: pressing it calls speak(id, <non-empty sample line>, ...)
  meters        elements data-meter="peak" / "rms" whose rendering CHANGES while a sound plays (read from the engine: audioMeter() / an AnalyserNode) and rests when nothing plays
  accessibility every visible interactive element has an accessible name (text, aria-label, label, title); keyboard: Tab reaches a voice button, Enter and Space play it, the focused element
                has a visible focus indicator; no horizontal overflow at 390x844 and 844x390; every visible interactive element is >= 44 x 44 CSS px at those phone sizes
  hygiene       zero network requests, zero page errors / console errors
CONTROLS (CLAUDE.md rule 15): each check is re-run on the open lab after a deliberate DAMAGE and MUST then fail: 30 px buttons, a quarter of the rows deleted, nameless buttons, dead handlers
  (voices, cues), tabindex=-1 everywhere, a muted engine (meters cannot move), no sound played (meters at rest), a missing faction switch.
Limits: it observes the DOM and the calls the lab makes; it cannot judge layout beauty, wording or whether audition sounds good. Chromium only (no WebKit / real phone)."""
import os, re, sys, json, time, pathlib, tempfile, argparse, collections, urllib.request
from urllib.parse import unquote, urlparse
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
URL = os.environ.get('OD_URL') or (ROOT / 'dist' / 'orbital_dominion_v3.html').as_uri()
AUDIO = ROOT / 'tests' / 'audio'
OUT = ROOT / 'tests' / 'out' / 'audio'; OUT.mkdir(parents=True, exist_ok=True)
ap = argparse.ArgumentParser(); ap.add_argument('--ref', action='store_true'); ARGS = ap.parse_args()
T0 = time.time(); fails = []; errs = []; reqs = []


def ok(c, m):
    print(('ok    ' if c else 'FAIL  ') + m, flush=True)
    if not c: fails.append(m)


def note(m): print('note  ' + m, flush=True)


def vocab(name):
    t = (ROOT / 'src' / 'js' / '43_vocab.js').read_text(encoding='utf-8')
    m = re.search(r'const ' + name + r'=\[(.*?)\];', t, re.S)
    return re.findall(r"'([^']+)'", re.sub(r'//[^\n]*', '', m.group(1)))


UNITS, BUILDINGS, FACS = vocab('UNIT_TYPES'), vocab('BUILDING_TYPES'), vocab('SFX_FACTIONS')


def group_of(vid):
    s = vid.split('.')
    if s[0] == 'cine': return 'cinematic'
    if s[0] in ('ui', 'global'): return 'ui'
    if s[0] == 'skill' or s[0].startswith('hero_'): return 'heroes'
    if s[0] in BUILDINGS: return 'buildings'
    if s[0] in UNITS: return 'units'
    return '?'


PROBED = ['musicPlay', 'musicStop', 'musicScene', 'musicStinger', 'musicDuck', 'musicMood', 'speak', 'speakStop']
AUDIO_WRAPPERS = ['audioPlay']


def probe(html):
    """log every call of the music / voice functions and of the engine's audioPlay wrapper into window.__WL (a COPY of the build)"""
    missing = []
    for n in PROBED:
        ms = list(re.finditer(r'function\s+' + n + r'\s*\(([^)]*)\)\s*\{', html))
        if len(ms) != 1: missing.append(f'{n} ({len(ms)} declarations)'); continue
        e = ms[0].end(); html = html[:e] + "window.__WL.push({f:'%s',a:Array.prototype.slice.call(arguments)});" % n + html[e:]
    for n in AUDIO_WRAPPERS:
        ms = list(re.finditer(r'function\s+' + n + r'\s*\(([^)]*)\)\s*\{return AUDIO\.' + n, html))
        if len(ms) != 1: missing.append(f'{n} wrapper ({len(ms)})'); continue
        e = html.index('{', ms[0].start()) + 1; html = html[:e] + "window.__WL.push({f:'%s',a:Array.prototype.slice.call(arguments)});" % n + html[e:]
    i = html.rindex('\nboot();'); html = html[:i] + '\nwindow.__EV=(s)=>eval(s);' + html[i:]   # eval hook: the test reaches closure-private functions (speakStop is not exported)
    return html, missing


def boot(b, html_text, viewport, touch=False, ref=False, track=False):
    f = pathlib.Path(tempfile.mkdtemp(prefix='od_soundlab_')) / 'build.html'; f.write_text(html_text, encoding='utf-8')
    ctx = b.new_context(viewport=viewport, device_scale_factor=2 if touch else 1, is_mobile=touch, has_touch=touch)
    pg = ctx.new_page()
    if track:
        pg.on('pageerror', lambda e: errs.append(('pageerror', str(e))))
        pg.on('console', lambda m: errs.append((m.type, m.text)) if m.type in ('error', 'warning') else None)
        pg.on('request', lambda r: reqs.append(r.url[:80]) if not r.url.startswith(('file:', 'data:', 'blob:')) else None)
    pg.add_init_script("window.__TEST='live';window.__WL=[];")
    pg.goto(f.as_uri()); pg.wait_for_function("()=>!!(window.__RTS&&window.__RTS.AUD)", timeout=15000); pg.wait_for_timeout(500)
    if touch: pg.touchscreen.tap(60, 60)
    else: pg.mouse.click(60, 60)
    pg.wait_for_timeout(250)
    pg.add_script_tag(content=(AUDIO / 'soundlab_page.js').read_text(encoding='utf-8'))
    if ref: pg.add_script_tag(content=(AUDIO / 'ref_soundlab.js').read_text(encoding='utf-8'))
    return ctx, pg


def tap(pg, touch, loc):
    (loc.tap if touch else loc.click)(timeout=4000)


def open_lab(pg, touch=False):
    """Settings -> Sound lab; returns (found_entry, opened, entry_keyboard_ok)"""
    pg.evaluate("()=>__RTS.showOverlay('menu')")
    tap(pg, touch, pg.locator('#bSet')); pg.wait_for_timeout(200)
    ent = pg.locator('#setMenu').get_by_role('button', name=re.compile(r'sound\s*lab', re.I))
    if ent.count() == 0: ent = pg.locator('#setMenu').get_by_text(re.compile(r'sound\s*lab', re.I))
    if ent.count() == 0: return False, False, False
    kb = ent.first.evaluate("e=>e.tagName==='BUTTON'||e.tabIndex>=0")
    ent.first.scroll_into_view_if_needed(); tap(pg, touch, ent.first); pg.wait_for_timeout(350)
    st = pg.evaluate("()=>SL.state()")
    return True, bool(st.get('visible')), kb


# ---------------------------------------------------------------- the checks: each returns (ok, message) so the controls can re-run them on a damaged lab
def chk_structure(pg):
    st = pg.evaluate("()=>SL.state()")
    if not st.get('visible'): return False, 'the lab root (#soundLab / [data-sound-lab]) is not visible'
    good = st['role'] in ('dialog', 'region', 'group') and bool(st['label'])
    return good, f"root role={st['role']!r} accessible name={st['label']!r}"


def chk_listing(pg):
    reg = pg.evaluate("()=>__RTS.AUD.voices()"); ids = set(pg.evaluate("()=>SL.voiceIds()"))
    facs = pg.evaluate("()=>SL.attr('[data-faction]','data-faction')")
    for f in facs:
        pg.evaluate("(f)=>{const e=SL.root().querySelector('[data-faction=\"'+f+'\"]');if(e)e.click();}", f); ids |= set(pg.evaluate("()=>SL.voiceIds()"))
    missing = [i for i in reg if i not in ids]
    grp = pg.evaluate("()=>SL.groupOf()")
    wrong = [i for i in reg if i in grp and grp[i] != group_of(i)]
    nogrp = [i for i in reg if i in grp and grp[i] is None]
    good = not missing and not wrong and not nogrp
    msg = f'{len(reg) - len(missing)}/{len(reg)} registered voices have a [data-voice] button'
    if missing: msg += f' - MISSING {len(missing)}: {", ".join(missing[:5])}'
    if nogrp or wrong: msg += f' - group wrong/absent for {len(wrong) + len(nogrp)}: ' + ', '.join(f'{i} in {grp.get(i)!r} (expected {group_of(i)})' for i in (wrong + nogrp)[:4])
    return good, msg


def played(pg, vid):
    return pg.evaluate("""(id)=>{const w=SL.wl('audioPlay').some(e=>e.a[0]===id||(e.a[0]&&e.a[0].id===id)),l=__RTS.AUD.log.some(e=>e.voice===id);return w||l;}""", vid)


def chk_play(pg, touch=False, n=30):
    vis = pg.evaluate("()=>SL.visibleVoiceIds()")
    if not vis: return False, 'no visible [data-voice] button to press'
    by = collections.defaultdict(list)
    for i in vis: by[group_of(i)].append(i)
    sample = []
    for g, l in by.items(): sample += [l[0], l[len(l) // 2], l[-1]]
    sample += vis[::max(1, len(vis) // n)]
    sample = list(dict.fromkeys(sample))[:n + 10]; bad = []
    for vid in sample:
        pg.evaluate("(id)=>{SL.clearWl();SL.scrollTo(id);}", vid)
        try: tap(pg, touch, pg.locator(f'[data-voice="{vid}"]').first)
        except Exception as e: bad.append(f'{vid} (not clickable: {str(e)[:40]})'); continue
        pg.wait_for_timeout(40)
        if not played(pg, vid): bad.append(vid)
    return not bad, f'pressing {len(sample)} sampled voice buttons plays that voice' + (f' - NOT played: {", ".join(bad[:5])}' if bad else '')


def chk_faction(pg):
    facs = pg.evaluate("()=>SL.attr('[data-faction]','data-faction')")
    if not set(['meridian', 'obsidian', 'aurora']).issubset(facs): return False, f'faction switch buttons found: {facs} (need data-faction meridian, obsidian, aurora)'
    bad = []
    for f in ('obsidian', 'aurora'):
        pg.evaluate("(f)=>SL.root().querySelector('[data-faction=\"'+f+'\"]').click()", f); pg.wait_for_timeout(60)
        vis = [i for i in pg.evaluate("()=>SL.visibleVoiceIds()") if len(i.split('.')) == 3 and i.split('.')[2] in FACS]
        if not vis: bad.append(f'{f}: no faction row visible'); continue
        if all(i.endswith('.' + f) for i in vis): continue                       # design A: the switch filters the rows
        pg.evaluate("(id)=>{SL.clearWl();SL.scrollTo(id);}", vis[0]); pg.locator(f'[data-voice="{vis[0]}"]').first.click(); pg.wait_for_timeout(60)
        r = pg.evaluate("()=>({w:SL.wl('audioPlay').map(e=>[typeof e.a[0]==='string'?e.a[0]:(e.a[0]&&e.a[0].id)||null,(e.a[1]||{}).faction||null]),l:__RTS.AUD.log.map(e=>e.voice)})")
        if not any((x[0] or '').endswith('.' + f) or x[1] == f for x in r['w']) and not any((v or '').endswith('.' + f) for v in r['l']): bad.append(f'{f}: rows of other factions stay visible and pressing {vis[0]} played {r}')   # design B: the switch changes what plays
    pg.evaluate("()=>SL.root().querySelector('[data-faction=\"meridian\"]').click()")
    return not bad, 'the faction switch shows / plays only the chosen faction' + (f' - {"; ".join(bad[:2])}' if bad else '')


def chk_cues(pg, touch=False):
    cues = pg.evaluate("()=>Object.keys(__RTS.MUSIC_CUES)"); missing = []; nostop = []; noplay = []
    for c in cues:
        sel = f'[data-cue="{c}"]:not([data-section])'
        if pg.locator(sel).count() == 0: missing.append(c); continue
        pg.evaluate("()=>SL.clearWl()")
        try:
            pg.locator(sel).first.scroll_into_view_if_needed(); tap(pg, touch, pg.locator(sel).first); pg.wait_for_timeout(40)
            if not pg.evaluate("(c)=>SL.wl('musicPlay').some(e=>e.a[0]===c)", c): noplay.append(c); continue
            tap(pg, touch, pg.locator(sel).first); pg.wait_for_timeout(40)
            if not pg.evaluate("()=>SL.wl('musicStop').length>0"): nostop.append(c)
        except Exception as e: noplay.append(c + ' (' + str(e)[:30] + ')')
    secs = pg.locator('[data-cue="intro"][data-section]').count(); secbad = 0
    for s in range(min(secs, 5)):
        pg.evaluate("()=>SL.clearWl()")
        try:
            loc = pg.locator(f'[data-cue="intro"][data-section="{s}"]').first; loc.scroll_into_view_if_needed(); tap(pg, touch, loc); pg.wait_for_timeout(40)
            if not pg.evaluate("(s)=>SL.wl('musicPlay').some(e=>e.a[0]==='intro'&&e.a[1]&&+e.a[1].section===s)", s): secbad += 1
        except Exception: secbad += 1
    pg.evaluate("()=>__RTS.musicStop(0.1)")
    good = not missing and not nostop and not noplay and secs >= 5 and not secbad
    return good, f'{len(cues) - len(missing) - len(noplay)}/{len(cues)} cue buttons play (and stop on a second press); intro has {secs} section buttons' + (f' - missing {missing[:4]}' if missing else '') + (f' - no musicPlay {noplay[:4]}' if noplay else '') + (f' - no musicStop {nostop[:3]}' if nostop else '') + (f' - {secbad} section buttons do not play their section' if secbad else '') + ('' if secs >= 5 else ' - need >= 5 section buttons')


def chk_intensity(pg):
    n = pg.locator('input[type=range][data-lab="intensity"]').count()
    if n == 0: return False, 'no <input type=range data-lab="intensity">'
    vals = []
    for v in (20, 90):
        pg.evaluate("()=>SL.clearWl()")
        pg.evaluate("(v)=>{const e=SL.root().querySelector('input[data-lab=\"intensity\"]');e.value=e.min===''?v:(+e.min+(+e.max-+e.min)*v/100);e.dispatchEvent(new Event('input',{bubbles:true}));}", v)
        pg.wait_for_timeout(40)
        vals.append(pg.evaluate("()=>SL.wl('musicScene').map(e=>e.a[0]&&e.a[0].intensity)"))
    good = any(abs((x if x is not None else -9) - 0.2) < 0.07 for x in vals[0]) and any(abs((x if x is not None else -9) - 0.9) < 0.07 for x in vals[1])
    return good, f'the intensity slider drives musicScene({{intensity}}): 20 % -> {vals[0][:2]}, 90 % -> {vals[1][:2]}'


def chk_chars(pg, touch=False):
    chars = pg.evaluate("()=>Object.keys(__RTS.STORY.characters||{})")
    if not chars: return False, 'STORY.characters is empty: there are no character voices to list'
    missing = [c for c in chars if pg.locator(f'[data-char="{c}"]').count() == 0]; bad = []
    for c in chars[:6]:
        if c in missing: continue
        pg.evaluate("()=>SL.clearWl()")
        try:
            loc = pg.locator(f'[data-char="{c}"]').first; loc.scroll_into_view_if_needed(); tap(pg, touch, loc); pg.wait_for_timeout(40)
        except Exception: bad.append(c); continue
        if not pg.evaluate("(c)=>SL.wl('speak').some(e=>e.a[0]===c&&typeof e.a[1]==='string'&&e.a[1].trim().length>3)", c): bad.append(c)
    return not missing and not bad, f'{len(chars) - len(missing)}/{len(chars)} characters have a [data-char] button; pressing {min(6, len(chars))} of them calls speak(id, sample line)' + (f' - missing {missing[:4]}' if missing else '') + (f' - no speak for {bad[:3]}' if bad else '')


def chk_meters(pg, trigger=True, mute=False):
    n = pg.locator('[data-meter]').count()
    if n == 0: return False, 'no [data-meter] element'
    # nothing else may be playing: stop the cue, speech and the engine's fallback score, let the tail die out
    pg.evaluate("()=>{__RTS.musicStop(0);__EV('speakStop')();__RTS.AUD.legacyScore(false);__RTS.AUD.reset(true);}")
    if mute: pg.evaluate("()=>{if(!__RTS.AUD.stats().muted)__RTS.AUD.mute();}")
    # STALE-TEST FIX: musicStop() fades the running cue but lets one-shot STINGERS (sting_*) ring out by design, and the preceding cue check has just pressed every cue button including all
    # the stingers - at rest means "no music player left", so wait for them (a sting is a few seconds long) instead of a fixed 1.5 s; the meter ballistics then need ~1.5 s to reach -inf.
    try: pg.wait_for_function("()=>__RTS.MUSIC.stats().players.length===0&&__RTS.AUD.stats().activeNodesMusic===0", timeout=25000)
    except Exception: pass   # still ringing: the 'rests' assertion below then fails and says so
    pg.wait_for_timeout(1500); rest = []
    for _ in range(3): rest.append(pg.evaluate("()=>SL.meters()")); pg.wait_for_timeout(100)
    still = rest[0] == rest[1] == rest[2]
    if trigger: pg.evaluate("()=>{__RTS.AUD.play('global.boomBig');}")
    seen = []
    for _ in range(14): pg.wait_for_timeout(45); seen.append(pg.evaluate("()=>SL.meters()"))
    if mute: pg.evaluate("()=>{if(__RTS.AUD.stats().muted)__RTS.AUD.mute();}")
    moved = any(x != rest[2] for x in seen)
    return moved and still, f'{n} meter element(s): the rendering ' + ('rests while nothing plays' if still else 'keeps changing although nothing plays') + ' and ' + ('changes while a sound plays' if moved else 'does NOT change while a sound plays')


def chk_names(pg):
    nl = pg.evaluate("()=>SL.nameless()"); n = pg.evaluate("()=>SL.interactive().length")
    return not nl, f'all {n} visible interactive elements have an accessible name' + (f' - NAMELESS {len(nl)}: {nl[:2]}' if nl else '')


def chk_touch(pg):
    sm = pg.evaluate("()=>SL.small(44)"); n = pg.evaluate("()=>SL.interactive().length")
    return not sm and n > 0, f'all {n} visible interactive elements are >= 44 x 44 px' + (f' - {len(sm)} TOO SMALL: ' + ', '.join(f"{x['tag']} {x['name']!r} {x['w']}x{x['h']}" for x in sm[:4]) if sm else '')


def chk_overflow(pg):
    st = pg.evaluate("()=>SL.state()")
    return st['overflowX'] <= 1 and st['docOverflowX'] <= 1 and st['w'] <= st['vw'] + 1, f"no horizontal overflow (root {st['w']:.0f} px in a {st['vw']} px viewport, scroll overflow {st['overflowX']}/{st['docOverflowX']})"


def chk_keyboard(pg, entry_kb=True):
    pg.evaluate("()=>{if(document.activeElement)document.activeElement.blur();SL.clearWl();}")
    reached = None
    for _ in range(60):
        pg.keyboard.press('Tab'); f = pg.evaluate("()=>SL.focus()")
        if f['voice']: reached = f; break
    if not reached: return False, 'Tab never reaches a voice button inside the lab (60 presses)'
    ring = reached['outline'] or ''
    visible_ring = not (ring.startswith('none') and ring.rstrip().endswith('none')) and ring.strip() != ''
    vid = reached['voice']; pg.evaluate("()=>SL.clearWl()"); pg.keyboard.press('Enter'); pg.wait_for_timeout(60); enter = played(pg, vid)
    pg.keyboard.press('Tab')
    for _ in range(6):
        f = pg.evaluate("()=>SL.focus()")
        if f['voice']: break
        pg.keyboard.press('Tab')
    vid2 = f['voice']; pg.evaluate("()=>SL.clearWl()"); pg.keyboard.press(' '); pg.wait_for_timeout(60); space = bool(vid2) and played(pg, vid2)
    return enter and space and visible_ring and entry_kb, f"keyboard: Tab reaches {vid}, Enter plays it ({enter}), Space plays the next one ({space}), focus indicator {ring.strip()[:40]!r} ({'ok' if visible_ring else 'NONE'}), the Settings entry is reachable ({entry_kb})"


def chk_escape(pg):
    pg.evaluate("()=>{SL.clearWl();__RTS.musicPlay('title');__RTS.speak('x','hello there');}")
    pg.keyboard.press('Escape'); pg.wait_for_timeout(250)
    st = pg.evaluate("()=>SL.state()"); w = pg.evaluate("()=>SL.wl('musicStop','speakStop').map(e=>e.f)")
    return (not st.get('visible')) and 'musicStop' in w and 'speakStop' in w, f"Escape closes the lab (visible: {st.get('visible')}) and stops music + speech ({sorted(set(w))})"


def run_checks(pg, touch, mode, entry_kb, label, res):
    """the full check list on an OPEN lab"""
    def add(name, r): res.append((label + ': ' + name, r[0], r[1])); ok(r[0], f'{label}: {name} - {r[1]}')
    add('structure', chk_structure(pg)); add('accessible names', chk_names(pg)); add('44 px targets', chk_touch(pg)); add('no horizontal overflow', chk_overflow(pg))
    if mode == 'full':
        add('every voice listed + grouped', chk_listing(pg)); add('voice buttons play their voice', chk_play(pg, touch)); add('faction switch', chk_faction(pg)); add('music cues + sections', chk_cues(pg, touch))
        add('intensity slider', chk_intensity(pg)); add('character voices', chk_chars(pg, touch)); add('live meters', chk_meters(pg)); add('keyboard', chk_keyboard(pg, entry_kb)); add('Escape closes + stops', chk_escape(pg))


with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])
    html = pathlib.Path(unquote(urlparse(URL).path)).read_text(encoding='utf-8') if URL.startswith('file:') else urllib.request.urlopen(URL, timeout=10).read().decode('utf-8')
    inst, missing = probe(html)
    ok(not missing, 'the music / voice functions and the audioPlay wrapper are plain declarations (calls to them can be observed)' + (f' - NOT FOUND exactly once: {missing}' if missing else ''))

    # ---------------------------------------------------------------- 1. desktop: the full check list
    ctx, pg = boot(b, inst, {'width': 1366, 'height': 800}, ref=ARGS.ref, track=True)
    found, opened, kb = open_lab(pg)
    ok(found, 'Settings has a "Sound lab" entry (a button inside #setMenu named /sound lab/i)' + ('' if found else ' - NOT FOUND: 85_sound_lab.js is still the stub'))
    ok(opened, 'activating it opens the lab (#soundLab visible)')
    real = found and opened
    res = []
    if real: run_checks(pg, False, 'full', kb, 'desktop', res)
    ctx.close()
    # ---------------------------------------------------------------- 2. phones: layout, targets, touch operation
    if real:
        for name, vp in (('phone portrait 390x844', {'width': 390, 'height': 844}), ('phone landscape 844x390', {'width': 844, 'height': 390})):
            ctx, pg = boot(b, inst, vp, touch=True, ref=ARGS.ref, track=True)
            f2, o2, k2 = open_lab(pg, True)
            ok(f2 and o2, f'{name}: the lab opens by tapping Settings -> Sound lab')
            if f2 and o2:
                run_checks(pg, True, 'layout', k2, name, res)
                r = chk_play(pg, True, 6); ok(r[0], f'{name}: tapping voice buttons plays them - {r[1]}')
            ctx.close()

    # ---------------------------------------------------------------- 3. controls: every check must fail on a damaged lab
    use_ref = ARGS.ref or not real
    if use_ref and not ARGS.ref: note('the real lab is missing: the controls run against the reference lab (tests/audio/ref_soundlab.js) so the checks are still shown to be able to fail')
    def damaged(name, js, check, phone=False, **kw):
        vp = {'width': 390, 'height': 844} if phone else {'width': 1366, 'height': 800}
        ctx, pg = boot(b, inst, vp, touch=phone, ref=use_ref)
        f2, o2, k2 = open_lab(pg, phone)
        if not (f2 and o2): ok(False, f'CONTROL {name}: the lab did not open'); ctx.close(); return
        if js: pg.evaluate(js)
        r = check(pg, **kw); ctx.close()
        ok(r[0] is False, f'CONTROL damage "{name}" is caught: ' + (r[1][:150] if r[0] is False else 'NOT CAUGHT (the check cannot fail): ' + r[1][:120]))
    HIDE = "(()=>{const s=document.createElement('style');s.textContent=%s;document.head.appendChild(s);})()"
    damaged('30 px buttons', HIDE % json.dumps("#soundLab button,[data-sound-lab] button,#soundLab input,[data-sound-lab] input{min-height:0!important;height:30px!important;min-width:0!important;width:70px!important}"), chk_touch, phone=True)
    damaged('a quarter of the voice rows deleted', "()=>{SL.root().querySelectorAll('[data-voice]').forEach((e,i)=>{if(i%4===0)e.remove();});}", chk_listing)
    damaged('nameless buttons', "()=>{SL.root().querySelectorAll('[data-voice]').forEach((e,i)=>{if(i%7===0){e.textContent='';e.removeAttribute('aria-label');e.removeAttribute('title');}});}", chk_names)
    damaged('dead voice buttons', "()=>{SL.root().querySelectorAll('[data-voice]').forEach(e=>e.replaceWith(e.cloneNode(true)));}", chk_play)
    damaged('dead cue buttons', "()=>{SL.root().querySelectorAll('[data-cue]').forEach(e=>e.replaceWith(e.cloneNode(true)));}", chk_cues)
    damaged('tabindex=-1 everywhere', "()=>{SL.root().querySelectorAll('button,input,select').forEach(e=>e.tabIndex=-1);}", chk_keyboard)
    damaged('no faction switch', "()=>{SL.root().querySelectorAll('[data-faction]').forEach(e=>e.remove());}", chk_faction)
    damaged('no character buttons', "()=>{SL.root().querySelectorAll('[data-char]').forEach(e=>e.remove());}", chk_chars)
    damaged('intensity slider removed', "()=>{SL.root().querySelectorAll('[data-lab=\"intensity\"]').forEach(e=>e.remove());}", chk_intensity)
    damaged('no sound plays (meters at rest)', None, chk_meters, trigger=False)
    damaged('engine muted (meters cannot move)', None, chk_meters, mute=True)
    damaged('lab covers 1.5x the viewport width', "()=>{SL.root().style.width='150vw';SL.root().firstElementChild&&(SL.root().firstElementChild.style.width='150vw');}", chk_overflow, phone=True)
    b.close()

ok(not reqs, f'zero network requests {reqs[:3]}')
ok(not errs, f'zero page errors / console errors / warnings {errs[:3]}')
(OUT / 'soundlab_report.json').write_text(json.dumps([{'check': a, 'ok': k, 'msg': m} for a, k, m in res], indent=1))
print(f'{"FAILED" if fails else "ALL OK"} ({time.time()-T0:.0f} s, {len(fails)} failures)')
sys.exit(1 if fails else 0)
