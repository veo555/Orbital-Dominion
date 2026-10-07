#!/usr/bin/env python3
"""Cinematic contact sheets: the visual feedback loop for the cinematic engine and every painter (backgrounds, props, fx, portraits).

Loads a build in ONE Chromium page (no sleeps), optionally merges a fixture story into __RTS.STORY, then renders cineFrame(id, t) for the chosen films at the chosen
times and lays the frames out in a PNG grid (PIL) under tests/out/cine/.  Look at the PNG with the Read tool; critique it harshly; fix the painter; run again.

  python3 tools/cine_contact.py --cine showcase_bg_orbit --per-scene                    # one frame per scene (each showcase scene is one parameter variant)
  python3 tools/cine_contact.py --cine showcase_fx_explosion,showcase_fx_flare --n 4    # 4 evenly spaced frames per film
  python3 tools/cine_contact.py --cine 'showcase_expr_*' --times 0.9 --cols 4           # prefix glob (a trailing *); all 12 expressions of every character = 13 films
  python3 tools/cine_contact.py --cine intro --times 0,3,6 --size 1280x720 --single     # full-size frames, one PNG per time
  python3 tools/cine_contact.py --cine showcase_cam --viewport 844x390 --subs           # the player's full viewport layout (bars / portrait window) instead of the bare picture
  python3 tools/cine_contact.py --list                                                  # every film id with duration, scene count and kind
  python3 tools/cine_contact.py --stats                                                 # which painters are still placeholders, bake times

Options
  --fixture showcase|min|none|PATH   story data to merge before rendering (default showcase; PATH = a .js module (function or object) or .json with {characters,cine}).
                                     Fixtures are converted by node (tests/fixtures/*.js are CommonJS), so the page needs no network and no server.
  --story PATH                       same as --fixture PATH (the real story is already in the build; use this to preview a work-in-progress file)
  --cine ID[,ID...]                  film ids; 'all'; a trailing '*' is a prefix glob            (default: showcase_all)
  --times T[,T...]                   global film seconds        --n N  N frames at the centres of N equal segments (default 6)
  --per-scene                        one frame per scene at --scene-frac (default 0.55) of its length (overrides --n)
  --size WxH                         picture size in px (default 640x268 for sheets, 1280x536 for --single); aspect 2.39 unless you say otherwise
  --viewport WxH                     render the whole viewport canvas like the player (letterbox / portrait layout, bars); --size is then ignored
  --cols N  --out PATH  --single  --subs  --tier battery|balanced|high|ultra (default high)  --rm  --no-labels  --no-trans (skip scene in/out transitions: a frame at a scene start is
                                     otherwise black from the default fade-in)  --seed N  --url URL  --keep-going
Exit status 1 when any painter threw (listed at the end) or a requested film does not exist.
"""
import argparse, json, os, pathlib, subprocess, sys, time, base64, io, re
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'tests' / 'out' / 'cine'
FIX = {'showcase': ROOT / 'tests' / 'fixtures' / 'cine_showcase.js', 'min': ROOT / 'tests' / 'fixtures' / 'story_min.js'}

def load_fixture(spec):
    """Return {'characters':..,'cine':..} for a fixture name or file path (JS modules go through node, JSON is read directly)."""
    if spec in (None, '', 'none'): return None
    p = FIX.get(spec) or pathlib.Path(spec)
    if not p.is_absolute(): p = (pathlib.Path.cwd() / p) if (pathlib.Path.cwd() / p).exists() else ROOT / p
    if not p.exists(): sys.exit(f'fixture not found: {spec}')
    if p.suffix == '.json': return json.loads(p.read_text(encoding='utf-8'))
    code = "const m=require(process.argv[1]);const o=typeof m==='function'?m():m;process.stdout.write(JSON.stringify({characters:o.characters||{},cine:o.cine||{}}))"
    r = subprocess.run(['node', '-e', code, str(p)], capture_output=True, text=True, cwd=str(ROOT))
    if r.returncode: sys.exit('node could not load the fixture:\n' + r.stderr)
    return json.loads(r.stdout)

def font(sz):
    for f in ('DejaVuSansMono.ttf', 'DejaVuSans.ttf', 'LiberationMono-Regular.ttf'):
        try: return ImageFont.truetype(f, sz)
        except Exception: pass
    return ImageFont.load_default()

RENDER_JS = """
async ({id, times, w, h, opts, viewport}) => {
  const R = window.__RTS, c = R.STORY.cine[id], tl = R.cineTimeline(c), cv = document.createElement('canvas');
  cv.width = viewport ? viewport[0] : w; cv.height = viewport ? viewport[1] : h;
  const out = [];
  for (const t of times) {
    const t0 = performance.now();
    R.cineFrame(id, t, cv, Object.assign({frameOnly: !viewport}, opts));
    const ms = performance.now() - t0;
    const L = R.cnLocate(tl, t), e = tl.scenes[L.i], s = e.s, bg = s.bg || {};
    const ln = R.cineLineAt(id, t);
    out.push({t, ms, scene: s.id, i: L.i, local: L.local, dur: e.dur,
      bg: bg.k + (Object.keys(bg).length > 1 ? ' ' + Object.keys(bg).filter(k => k !== 'k').map(k => k + '=' + (typeof bg[k] === 'object' ? JSON.stringify(bg[k]) : bg[k])).join(' ') : ''),
      fx: (s.fx || []).map(f => f.k).join(','), props: (s.props || []).map(p => p.k + (p.cls || p.type || p.planet || p.shape || '')).join(','),
      actors: (s.actors || []).map(a => a.char + ':' + (a.expr || '') + (a.mode && a.mode !== 'bust' ? ':' + a.mode : '')).join(','), line: ln ? ln.style + ':' + ln.text.slice(0, 40) : '',
      png: cv.toDataURL('image/png')});
  }
  return out;
}
"""

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--fixture', default='showcase'); ap.add_argument('--story')
    ap.add_argument('--cine', default='showcase_all'); ap.add_argument('--times'); ap.add_argument('--n', type=int, default=6)
    ap.add_argument('--per-scene', action='store_true'); ap.add_argument('--scene-frac', type=float, default=.55)
    ap.add_argument('--size'); ap.add_argument('--viewport'); ap.add_argument('--cols', type=int); ap.add_argument('--out'); ap.add_argument('--single', action='store_true')
    ap.add_argument('--subs', action='store_true'); ap.add_argument('--tier', default='high'); ap.add_argument('--rm', action='store_true'); ap.add_argument('--no-labels', action='store_true'); ap.add_argument('--no-trans', action='store_true')
    ap.add_argument('--seed', type=int); ap.add_argument('--url'); ap.add_argument('--list', action='store_true'); ap.add_argument('--stats', action='store_true'); ap.add_argument('--keep-going', action='store_true')
    a = ap.parse_args()

    url = a.url or os.environ.get('OD_URL') or (ROOT / 'dist' / 'orbital_dominion_v3.html').as_uri()
    fx = load_fixture(a.story or a.fixture)
    wh = lambda s: tuple(int(x) for x in s.lower().split('x'))
    size = wh(a.size) if a.size else ((1280, 536) if a.single else (640, 268))
    viewport = wh(a.viewport) if a.viewport else None
    errs = []

    with sync_playwright() as p:
        b = p.chromium.launch(args=['--no-sandbox'])
        ctx = b.new_context(viewport={'width': 1280, 'height': 720}, device_scale_factor=1)
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
        pg.on('console', lambda m: errs.append('console.' + m.type + ': ' + m.text) if m.type in ('error',) else None)
        pg.add_init_script("window.__TEST='live'")
        pg.goto(url); pg.wait_for_function("()=>!!(window.__RTS&&window.__RTS.cineFrame&&window.__RTS.CINE_PAINT)", timeout=15000)
        if fx: pg.evaluate("(d)=>{Object.assign(__RTS.STORY.characters,d.characters);Object.assign(__RTS.STORY.cine,d.cine);}", fx)
        if a.no_labels: pg.evaluate("()=>{__RTS.CINE_PAINT.labels=false}")
        ids_all = pg.evaluate("()=>Object.keys(__RTS.STORY.cine)")

        if a.list:
            info = pg.evaluate("()=>Object.entries(__RTS.STORY.cine).map(([id,c])=>[id,c.kind,c.scenes.length,c.scenes.reduce((s,x)=>s+x.dur,0)])")
            for id, kind, n, d in info: print(f'{id:34s} {kind:10s} {n:3d} scenes  {d:6.1f} s')
            b.close(); return 0
        if a.stats and not a.cine:
            pass
        want = []
        for tok in [x for x in a.cine.split(',') if x]:
            if tok == 'all': want += ids_all
            elif tok.endswith('*'): want += [i for i in ids_all if i.startswith(tok[:-1])]
            else: want.append(tok)
        missing = [w for w in want if w not in ids_all]
        if missing:
            print('unknown film id(s): ' + ', '.join(missing) + '\n  known: ' + ', '.join(ids_all[:40]) + (' ...' if len(ids_all) > 40 else '')); b.close(); return 1
        if not want: print('no films selected'); b.close(); return 1

        opts = {'tier': a.tier, 'subs': a.subs}
        if a.rm: opts['rm'] = True
        if a.no_trans: opts['noTrans'] = True
        if a.seed is not None: opts['seed'] = a.seed
        frames = []   # (id, record)
        t_start = time.time()
        for id in want:
            dur = pg.evaluate("(id)=>__RTS.cineTimeline(__RTS.STORY.cine[id]).total", id)
            if a.times: ts = [float(x) for x in a.times.split(',')]
            elif a.per_scene:
                ts = pg.evaluate("([id,f])=>__RTS.cineTimeline(__RTS.STORY.cine[id]).scenes.map(e=>e.t0+e.dur*f)", [id, a.scene_frac])
            else: ts = [(i + .5) / a.n * dur for i in range(a.n)]
            ts = [min(max(t, 0), dur) for t in ts]
            recs = pg.evaluate(RENDER_JS, {'id': id, 'times': ts, 'w': size[0], 'h': size[1], 'opts': opts, 'viewport': list(viewport) if viewport else None})
            for r in recs: frames.append((id, r))
        stats = pg.evaluate("()=>__RTS.cineStats()")
        miss = pg.evaluate("()=>__RTS.cineCoverage()")
        b.close()

    # ---- output ----
    OUT.mkdir(parents=True, exist_ok=True)
    def img(rec): return Image.open(io.BytesIO(base64.b64decode(rec['png'].split(',', 1)[1]))).convert('RGB')
    stem = re.sub(r'[^A-Za-z0-9_.-]+', '_', want[0] + ('' if len(want) == 1 else f'_plus{len(want) - 1}'))
    written = []
    if a.single:
        for id, r in frames:
            f = pathlib.Path(a.out) if a.out and len(frames) == 1 else (pathlib.Path(a.out) if a.out and not a.out.endswith('.png') else OUT) / f'{id}_t{r["t"]:.2f}.png'
            if a.out and a.out.endswith('.png') and len(frames) > 1: f = pathlib.Path(a.out).with_name(f'{pathlib.Path(a.out).stem}_{id}_t{r["t"]:.2f}.png')
            f.parent.mkdir(parents=True, exist_ok=True); img(r).save(f); written.append(f)
    else:
        tw, th = (viewport or size)
        # thumbnails are drawn at most 640 px wide so a big sheet stays readable and small
        k = min(1.0, 640 / tw); tw2, th2 = int(tw * k), int(th * k)
        cols = a.cols or (3 if len(frames) > 3 else max(1, len(frames))); rows = (len(frames) + cols - 1) // cols
        cap = 46; pad = 6; ft = font(11)
        sheet = Image.new('RGB', (cols * (tw2 + pad) + pad, rows * (th2 + cap + pad) + pad), (18, 20, 28)); d = ImageDraw.Draw(sheet)
        for n, (id, r) in enumerate(frames):
            cx, cy = pad + (n % cols) * (tw2 + pad), pad + (n // cols) * (th2 + cap + pad)
            im = img(r)
            if k < 1: im = im.resize((tw2, th2), Image.LANCZOS)
            sheet.paste(im, (cx, cy))
            l1 = f'{id}  t={r["t"]:.2f}  {r["scene"]}  ({r["ms"]:.0f} ms)'
            l2 = f'bg {r["bg"]}'
            l3 = ' '.join(x for x in [('fx ' + r['fx']) if r['fx'] else '', ('props ' + r['props']) if r['props'] else '', ('who ' + r['actors']) if r['actors'] else ''] if x)
            for j, s in enumerate((l1, l2[:int(tw2 / 6.6)], l3[:int(tw2 / 6.6)])): d.text((cx + 2, cy + th2 + 2 + j * 14), s, fill=(200, 215, 235) if j == 0 else (140, 160, 190), font=ft)
        f = pathlib.Path(a.out) if a.out else OUT / f'contact_{stem}.png'
        if f.suffix != '.png': f = f / f'contact_{stem}.png'
        f.parent.mkdir(parents=True, exist_ok=True); sheet.save(f); written.append(f)

    ms = [r['ms'] for _, r in frames]
    print(f'rendered {len(frames)} frame(s) from {len(want)} film(s) in {time.time() - t_start:.1f}s   frame time avg {sum(ms) / len(ms):.0f} ms, max {max(ms):.0f} ms (software raster, relative only)')
    for f in written[:12]: print('wrote', f)
    if len(written) > 12: print(f'... and {len(written) - 12} more')
    if a.stats or True:
        ph = stats['placeholders']
        print('placeholders still in the registry: bg=' + ','.join(ph['bg']) + ' | prop=' + ','.join(ph['prop']) + ' | fx=' + ','.join(ph['fx']) + ' | actor=' + str(ph['actor']))
        if stats.get('bakeBy'): print('last bg bake ms: ' + ', '.join(f'{k} {v:.0f}' for k, v in sorted(stats['bakeBy'].items())))
    if miss: print('MISSING painters for vocabulary ids: ' + ', '.join(miss)); errs.append('missing painters')
    bad = list(stats['errors']) + errs
    if bad:
        print('PROBLEMS:'); [print('  - ' + e[:300]) for e in bad[:20]]
        return 0 if a.keep_going else 1
    return 0

if __name__ == '__main__':
    sys.exit(main())
