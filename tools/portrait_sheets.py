#!/usr/bin/env python3
"""Portrait review sheets and the perceptual distinctness metric for the character portrait painter (src/js/64_portraits.js).

Renders busts straight through drawPortrait() (no other engine involved) in ONE Chromium page and lays the results out as PNG sheets in tests/out/portraits/portraits_*.png.
Look at them with the Read tool; the same module is imported by tests/e2e/e2e_portraits.py for the numeric checks.

  python3 tools/portrait_sheets.py                       # every sheet for the 13 fixture characters (+ the real story characters)
  python3 tools/portrait_sheets.py --sheets expr         # one sheet kind: expr | modes | chips | story | dist | all
  python3 tools/portrait_sheets.py --chars fx_idris,kaz  # restrict to characters (fixture ids are prefixed fx_)
  python3 tools/portrait_sheets.py --dist                # print the distinctness matrix (64 px) and exit 1 when a pair is too close

Environment: OD_URL=file://.../orbital_dominion_v3.html points at a scratch build (never rebuild the shared dist/ for this).
Distinctness metric (see `dist_features` / `pair_distance`): the bust is drawn at 64 px on ONE neutral background (so only the figure differs), then compared
    1. pixel term    mean absolute RGB difference of the 16x16 box-downsampled images (layout / silhouette / big colour masses), also taken mirrored-tolerant for 2 px of shift
    2. colour term   chi-square-like distance of the HSV histograms of the figure pixels (palette: skin, hair, armour, trim, eyes)
    3. structure     difference of the 16x16 luminance gradient-magnitude maps (hair shape, collar, hood, marks)
  combined = 0.5*pixel/PIXEL_REF + 0.3*colour/COLOUR_REF + 0.2*structure/STRUCT_REF  (references = the median distance between two unrelated fixture characters measured when the
  metric was written), so combined ~1.0 means "as different as a typical pair" and the gate demands >= MIN_PAIR for EVERY pair.
"""
import argparse, base64, io, json, os, pathlib, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'tests' / 'out' / 'portraits'
URL = os.environ.get('OD_URL') or (ROOT / 'dist' / 'orbital_dominion_v3.html').as_uri()
EXPR = ['neutral', 'talk', 'angry', 'smirk', 'sad', 'shock', 'smile', 'determined', 'laugh', 'scared', 'cold', 'weary']
MODES = ['bust', 'silhouette', 'shadow', 'hologram']

# ------------------------------------------------------------------------------ page side
PAGE_JS = r"""
window.__PS = (()=>{
  const R=__RTS;
  const BGS={
    mid:  (g,w,h)=>{const q=g.createLinearGradient(0,0,0,h);q.addColorStop(0,'#33425e');q.addColorStop(1,'#141b2a');g.fillStyle=q;g.fillRect(0,0,w,h);},
    flat: (g,w,h)=>{g.fillStyle='#2a3142';g.fillRect(0,0,w,h);},
    lit:  (g,w,h)=>{const q=g.createRadialGradient(w*.3,h*.25,h*.05,w*.5,h*.5,h*.9);q.addColorStop(0,'#ffe8c0');q.addColorStop(.5,'#d9a870');q.addColorStop(1,'#6a4a3a');g.fillStyle=q;g.fillRect(0,0,w,h);},
    dark: (g,w,h)=>{const q=g.createRadialGradient(w*.5,h*.4,h*.1,w*.5,h*.5,h*.9);q.addColorStop(0,'#1a1f2c');q.addColorStop(1,'#04060a');g.fillStyle=q;g.fillRect(0,0,w,h);},
    holo: (g,w,h)=>{const q=g.createLinearGradient(0,0,0,h);q.addColorStop(0,'#071426');q.addColorStop(1,'#020912');g.fillStyle=q;g.fillRect(0,0,w,h);}
  };
  /* one portrait on a w x h canvas; the bust box is h*boxH tall, centred at (w*cx, h*cy), torso reaching the bottom edge */
  function draw(j){
    const w=j.w,h=j.h,cv=document.createElement('canvas');cv.width=w;cv.height=h;const g=cv.getContext('2d');
    (BGS[j.bg]||BGS.mid)(g,w,h);
    const bh=h*(j.boxH||.9),cx=w*(j.cx==null?.5:j.cx),cy=h*(j.cy==null?.5:j.cy);
    const o={W:w,H:h,bottom:h,face:j.face||'r',mode:j.mode||'bust',talk:j.talk||0,blink:j.blink||0,t:j.t==null?1.3:j.t};
    if(j.key)o.key=j.key; if(j.rim)o.rim=j.rim; if(j.lights)o.lights=j.lights;
    R.drawPortrait(g,j.id,j.expr||'neutral',cx,cy,bh,o);
    return cv;
  }
  function png(j){return draw(j).toDataURL('image/png');}
  function many(jobs){return jobs.map(png);}
  /* timing of one portrait draw in ms (median of n, after a warm-up so layer caches are filled); a 1x1 readback after each draw forces the software rasteriser to finish the work */
  function bench(j,n){const cv=draw(j),g=cv.getContext('2d'),ts=[];const bh=cv.height*(j.boxH||.9);
    for(let i=0;i<n;i++){const t0=performance.now();R.drawPortrait(g,j.id,j.expr||'neutral',cv.width/2,cv.height/2,bh,{W:cv.width,H:cv.height,bottom:cv.height,face:j.face||'r',mode:j.mode||'bust',t:1+i*.033,talk:j.talk||0,blink:j.blink||0});g.getImageData(0,0,1,1);ts.push(performance.now()-t0);}
    ts.sort((a,b)=>a-b);return ts[ts.length>>1];}
  return{draw,png,many,bench,BGS};
})();
"""

def load_chars(spec):
    code = "const m=require(process.argv[1]);const o=typeof m==='function'?m():m;process.stdout.write(JSON.stringify(o.characters))"
    r = subprocess.run(['node', '-e', code, str(ROOT / 'tests' / 'fixtures' / 'story_min.js')], capture_output=True, text=True, cwd=str(ROOT))
    if r.returncode: sys.exit('node could not load the fixture:\n' + r.stderr)
    return json.loads(r.stdout)

def open_page(p, extra_init=None, fixture=True):
    """Start Chromium, load the build, add the 13 fixture characters as fx_<id> (the real story's characters stay untouched), install the page helpers."""
    b = p.chromium.launch(args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 1280, 'height': 720}, device_scale_factor=1)
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: errs.append('console.' + m.type + ': ' + m.text) if m.type == 'error' else None)
    pg.add_init_script("window.__TEST='live'")
    pg.goto(URL); pg.wait_for_function("()=>!!(window.__RTS&&window.__RTS.drawPortrait&&window.__RTS.PORTRAIT_PAINT)", timeout=15000)
    if fixture:
        ch = load_chars('min')
        pg.evaluate("(c)=>{for(const k in c){const o=c[k];o.id='fx_'+k;__RTS.STORY.characters['fx_'+k]=o;}}", ch)
    pg.evaluate(PAGE_JS)
    return b, pg, errs

def story_ids(pg):
    return pg.evaluate("()=>Object.keys(__RTS.STORY.characters).filter(k=>!k.startsWith('fx_')&&k!=='narrator'&&__RTS.STORY.characters[k].look)")

def fixture_ids(pg):
    return pg.evaluate("()=>Object.keys(__RTS.STORY.characters).filter(k=>k.startsWith('fx_'))")

def render(pg, jobs):
    out = pg.evaluate("(j)=>__PS.many(j)", jobs)
    errs = pg.evaluate("()=>__RTS.PORTRAIT_PAINT.errors.slice()")
    if errs: raise RuntimeError('portrait painter threw: ' + '; '.join(errs[:3]))
    return [Image.open(io.BytesIO(base64.b64decode(u.split(',', 1)[1]))).convert('RGB') for u in out]

def font(sz):
    for f in ('DejaVuSansMono.ttf', 'DejaVuSans.ttf', 'LiberationMono-Regular.ttf'):
        try: return ImageFont.truetype(f, sz)
        except Exception: pass
    return ImageFont.load_default()

def grid(imgs, labels, cols, pad=4, cap=14, bgc=(16, 18, 26), title=None):
    tw, th = imgs[0].size; rows = (len(imgs) + cols - 1) // cols; top = 18 if title else 0
    sh = Image.new('RGB', (cols * (tw + pad) + pad, top + rows * (th + cap + pad) + pad), bgc); d = ImageDraw.Draw(sh); f = font(10)
    if title: d.text((pad + 2, 3), title, fill=(220, 230, 250), font=font(12))
    for i, im in enumerate(imgs):
        x, y = pad + (i % cols) * (tw + pad), top + pad + (i // cols) * (th + cap + pad)
        sh.paste(im, (x, y))
        if labels and labels[i]: d.text((x + 2, y + th + 1), labels[i][:int(tw / 6.2)], fill=(170, 185, 210), font=f)
    return sh

# ------------------------------------------------------------------------------ distinctness metric
CHIP = 64
def chip_job(cid, expr='neutral', size=CHIP, **kw):
    """The avatar-chip convention used by the gate: a size x size canvas, bust box = 0.92 of it, centred slightly low so head and shoulders fill the chip."""
    j = {'id': cid, 'expr': expr, 'w': size, 'h': size, 'bg': 'flat', 'boxH': .96, 'cy': .58}; j.update(kw); return j

def _hsv(a):
    a = a.astype(np.float32) / 255; mx = a.max(2); mn = a.min(2); d = mx - mn + 1e-6
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) / 6
    return h % 1.0, d / (mx + 1e-6), mx

HEAD = (8, 0, 56, 48)   # the head box inside a 64 px chip (x0, y0, x1, y1): identity at avatar size lives in hair + face, so it gets its own, finer terms

def _cells(a, n):
    s = a.shape[0] // n
    return a[:n * s, :n * s].reshape(n, s, n, s, *a.shape[2:]).mean((1, 3))

def dist_features(img, bg=(42, 49, 66)):
    """Feature bundle of one 64 px chip: 16x16 colour thumbnail of the whole chip, 24x24 thumbnail + gradient map of the head box, figure-pixel HSV histogram."""
    a = np.asarray(img.convert('RGB'), dtype=np.float32)
    thumb = _cells(a, 16)
    x0, y0, x1, y1 = HEAD; hd = a[y0:y1, x0:x1]
    head = _cells(hd, 24)
    fig = (np.abs(a - np.array(bg, np.float32)).sum(2) > 30)               # pixels that are not the flat background
    h, sat, v = _hsv(a)
    hist = np.zeros((8, 3, 3), np.float32)
    hi = np.minimum((h * 8).astype(int), 7); si = np.minimum((sat * 3).astype(int), 2); vi = np.minimum((v * 3).astype(int), 2)
    np.add.at(hist, (hi[fig], si[fig], vi[fig]), 1)
    hist = hist.ravel() / max(1, hist.sum())
    lum = hd @ np.array([.299, .587, .114], np.float32)
    gy, gx = np.gradient(lum); gmap = _cells(np.hypot(gx, gy), 24)
    return {'thumb': thumb, 'head': head, 'hist': hist, 'gmap': gmap}

# medians of the four terms over the 13 fixture characters (python3 tools/portrait_sheets.py --calibrate): they only scale each term, so that a typical pair scores about 1.0
REF = {'pix': 24.5, 'head': 24.0, 'col': 1.3, 'struct': 7.0}
W = {'pix': .2, 'head': .4, 'col': .2, 'struct': .2}
MIN_PAIR = 0.45          # every pair of characters at 64 px
MIN_PAIR_48 = 0.40       # the 48 px chip (the LOD drops detail, so it gets a little less room)

def _shift_min(A, B, n, k=1):
    """mean abs difference, minimised over +-k cell shifts (a half-pixel head bob is not a difference; a different layout is)"""
    best = 1e9
    for dy in range(-k, k + 1):
        for dx in range(-k, k + 1):
            a = A[max(0, dy):n + min(0, dy), max(0, dx):n + min(0, dx)]
            b = B[max(0, -dy):n + min(0, -dy), max(0, -dx):n + min(0, -dx)]
            best = min(best, float(np.abs(a - b).mean()))
    return best

def pair_terms(fa, fb):
    ha, hb = fa['hist'], fb['hist']
    return {'pix': _shift_min(fa['thumb'], fb['thumb'], 16), 'head': _shift_min(fa['head'], fb['head'], 24, 2),
            'col': float((((ha - hb) ** 2) / (ha + hb + 1e-4)).sum()), 'struct': _shift_min(fa['gmap'], fb['gmap'], 24, 2)}

def pair_distance(fa, fb):
    t = pair_terms(fa, fb)
    return sum(W[k] * t[k] / REF[k] for k in W)

def distance_matrix(feats):
    ids = list(feats); n = len(ids); M = np.zeros((n, n))
    for i in range(n):
        for j in range(i + 1, n): M[i, j] = M[j, i] = pair_distance(feats[ids[i]], feats[ids[j]])
    return ids, M

def closest_pairs(ids, M, k=6):
    pairs = [(M[i, j], ids[i], ids[j]) for i in range(len(ids)) for j in range(i + 1, len(ids))]
    return sorted(pairs)[:k]

def chip_features(pg, ids, size=CHIP, expr='neutral', **kw):
    imgs = render(pg, [chip_job(c, expr, size, **kw) for c in ids])
    if size != CHIP: imgs = [im.resize((CHIP, CHIP), Image.BOX) for im in imgs]
    return dict(zip(ids, [dist_features(im) for im in imgs])), imgs

# ------------------------------------------------------------------------------ sheets
def sheet_expr(pg, cid, size=(320, 340)):
    jobs = [{'id': cid, 'expr': e, 'w': size[0], 'h': size[1], 'bg': 'mid', 'boxH': .94, 'cy': .52} for e in EXPR]
    return grid(render(pg, jobs), EXPR, 4, title=f'{cid} - 12 expressions (bust, face r, t=1.3)')

def sheet_expr_all(pg, ids, size=(150, 160)):
    jobs = [{'id': c, 'expr': e, 'w': size[0], 'h': size[1], 'bg': 'mid', 'boxH': .94, 'cy': .52} for c in ids for e in EXPR]
    labels = [(c if i % 12 == 0 else '') for c in ids for i in range(12)]
    return grid(render(pg, jobs), labels, 12, pad=2, cap=12, title='expression x character matrix (rows = characters, columns = ' + ' '.join(EXPR) + ')')

def sheet_modes(pg, ids, size=(240, 250)):
    jobs, labels = [], []
    for c in ids:
        for m in MODES:
            jobs.append({'id': c, 'expr': 'determined' if m != 'shadow' else 'cold', 'w': size[0], 'h': size[1], 'boxH': .94, 'cy': .52, 'mode': m,
                         'bg': {'bust': 'mid', 'silhouette': 'lit', 'shadow': 'dark', 'hologram': 'holo'}[m],
                         'rim': '#ffd9a0' if m == 'silhouette' else None, 'key': {'x': .8, 'y': .2, 'col': '#ffd9a0', 'a': .8} if m != 'bust' else None})
            labels.append(f'{c} {m}')
    return grid(render(pg, jobs), labels, 4, title='4 modes x characters')

def sheet_chips(pg, ids):
    rows = []
    for size in (48, 64, 96, 128):
        jobs = [chip_job(c, 'neutral', size) for c in ids]
        rows.append(render(pg, jobs))
    n = len(ids); pad = 4; W = pad + n * (128 + pad); H = pad + sum(s + pad for s in (48, 64, 96, 128)) + 14 * 4 + 20
    sh = Image.new('RGB', (W, H), (16, 18, 26)); d = ImageDraw.Draw(sh); f = font(10); y = 18
    d.text((pad + 2, 3), 'avatar chips at 48 / 64 / 96 / 128 px (neutral)', fill=(220, 230, 250), font=font(12))
    for size, imgs in zip((48, 64, 96, 128), rows):
        for i, im in enumerate(imgs): sh.paste(im, (pad + i * (128 + pad), y))
        y += size + pad
        for i, c in enumerate(ids): d.text((pad + i * (128 + pad) + 2, y - 1), c[:20], fill=(150, 165, 190), font=f)
        y += 14
    return sh

def sheet_chip_expr(pg, ids, size=64):
    jobs = [chip_job(c, e, size) for c in ids for e in EXPR]
    return grid(render(pg, jobs), None, 12, pad=3, cap=0, title=f'{size} px chips: rows = characters, columns = {" ".join(EXPR)}')

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--sheets', default='all'); ap.add_argument('--chars'); ap.add_argument('--dist', action='store_true'); ap.add_argument('--out', default=str(OUT))
    ap.add_argument('--no-story', action='store_true'); ap.add_argument('--calibrate', action='store_true')
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    out = pathlib.Path(a.out); out.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        b, pg, errs = open_page(p)
        fx = fixture_ids(pg); st = [] if a.no_story else story_ids(pg)
        if a.chars: fx = [c for c in a.chars.split(',') if c in fx or c in st]; st = [c for c in st if c in fx]
        kinds = a.sheets.split(',') if a.sheets != 'all' else ['expr', 'modes', 'chips', 'story', 'dist']
        wrote = []
        def save(im, name): f = out / name; im.save(f); wrote.append(f)
        if 'expr' in kinds:
            for c in fx[:13]: save(sheet_expr(pg, c), f'portraits_expr_{c[3:] if c.startswith("fx_") else c}.png')
            save(sheet_expr_all(pg, fx), 'portraits_expr_matrix.png')
            save(sheet_chip_expr(pg, fx), 'portraits_chip_expr_matrix.png')
        if 'modes' in kinds: save(sheet_modes(pg, fx), 'portraits_modes.png')
        if 'chips' in kinds: save(sheet_chips(pg, fx), 'portraits_chips.png')
        if 'story' in kinds and st:
            save(sheet_chips(pg, st), 'portraits_story_chips.png'); save(sheet_modes(pg, st), 'portraits_story_modes.png'); save(sheet_expr_all(pg, st), 'portraits_story_expr_matrix.png')
        if a.dist or 'dist' in kinds:
            for name, ids in (('fixture', fx), ('story', st)):
                if len(ids) < 2: continue
                feats, imgs = chip_features(pg, ids)
                names, M = distance_matrix(feats)
                print(f'--- {name}: {len(ids)} characters, 64 px, combined distance (1.0 = typical pair; gate >= {MIN_PAIR})')
                for d_, x, y in closest_pairs(names, M, 8): print(f'   {d_:5.2f}  {x} / {y}')
                off = M[np.triu_indices(len(ids), 1)]
                print(f'   min {off.min():.2f}  median {np.median(off):.2f}  max {off.max():.2f}')
                if a.calibrate:
                    T = [pair_terms(feats[names[i]], feats[names[j]]) for i in range(len(names)) for j in range(i + 1, len(names))]
                    print('   median terms', {k: round(float(np.median([t[k] for t in T])), 3) for k in W})
                big = Image.new('RGB', (len(ids) * 70 + 4, 76), (16, 18, 26))
                for i, im in enumerate(imgs): big.paste(im, (4 + i * 70, 6))
                save(big, f'portraits_dist_{name}.png')
        b.close()
    for f in wrote: print('wrote', f)
    bad = [e for e in errs]
    if bad: print('PAGE ERRORS:'); [print('  ' + e[:240]) for e in bad[:10]]
    return 1 if bad else 0

if __name__ == '__main__':
    sys.exit(main())
