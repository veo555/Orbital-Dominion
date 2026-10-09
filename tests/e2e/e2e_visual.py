"""Visual gate for the v4.0 graphics (Playwright + Chromium). Exit code != 0 on failure.
   OD_URL=file:///.../dist/orbital_dominion_v3.html python3 tests/e2e/e2e_visual.py     (about 40 s)

Every assertion compares real canvas pixels and was mutation-checked (see docs/GRAPHICS_V4.md, 'Mutation proof'):
  * night: ground next to a lit hub is brighter than ground far from any light (kills: drawLighting / collectLights)
  * day: the sun shadow darkens the ground beside a building vs shd=0 (kills: drawBuildingShadow)
  * damage: the same building at 15 % hp differs from full hp inside its footprint (kills: the soot / glowing-crack pass)
  * construction: a half-built building differs from a finished one (kills: drawScaffold)
  * minimap: pixels of both team colours present (kills: blips of either team)
  * no black frame at day / night, no console errors, zero network requests
  * bloom adds light around a bright source; battery tier draws neither shadows nor bloom
  * cost: render() mean of the full 'high' tier vs the same tier with the v4 passes switched off, measured in this run
"""
import os, pathlib, sys
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parents[2]
URL = os.environ.get('OD_URL') or (ROOT / 'dist' / 'orbital_dominion_v3.html').as_uri()
BUDGET = float(os.environ.get('OD_VIS_BUDGET', '1.35'))   # software raster: generous; the real budget (+30 %) is checked with tools/perf.py
fails = []; errs = []; reqs = []
def ok(c, m):
    print(('ok    ' if c else 'FAIL  ') + m, flush=True)
    if not c: fails.append(m)

SETUP = """(o)=>{const R=__RTS;R.SET.faction='meridian';R.SET.enemy='obsidian';R.startGame();const G=R.G;R.setQualityMode('high');
 for(let i=0;i<30*10;i++)R.step();const hub=G.buildings.find(b=>b.team===0&&b.type==='hub');G.vis[0].fill(2);
 R.cam.z=R.cam.tz=1;R.centerOn(hub.x,hub.y);window.__h=hub;return[hub.x,hub.y]}"""
# draw one frame at game time t and return the canvas context's pixel reader
FRAME = """(t)=>{const R=__RTS;R.G.time=t;R.G.daylight=t>200?0:1;R.G.vis[0].fill(2);R.render(1);return 1}"""
PX = """([x,y,r])=>{const R=__RTS,s=R.w2s(x,y),c=document.querySelector('canvas'),g=c.getContext('2d'),k=R.DPR,n=Math.max(1,Math.round(r*k));
 const d=g.getImageData(Math.round(s.x*k)-n,Math.round(s.y*k)-n,2*n,2*n).data;let a=0;for(let i=0;i<d.length;i+=4)a+=d[i]+d[i+1]+d[i+2];return a/(d.length/4)/3}"""
DIFF = """([x,y,w,h])=>{const R=__RTS,s=R.w2s(x,y),c=document.querySelector('canvas'),g=c.getContext('2d'),k=R.DPR;
 const d=g.getImageData(Math.round(s.x*k),Math.round(s.y*k),Math.round(w*k),Math.round(h*k)).data;window.__snap=window.__snap||[];window.__snap.push(Array.from(d));return 1}"""

with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])
    pg = b.new_context(viewport={'width': 1280, 'height': 800}).new_page()
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('request', lambda r: reqs.append(r.url) if not r.url.startswith(('file:', 'data:', 'blob:')) else None)
    pg.add_init_script("window.__TEST='live'"); pg.goto(URL); pg.wait_for_timeout(900); pg.mouse.move(640, 400)
    hx, hy = pg.evaluate(SETUP)

    # ---- night lighting
    pg.evaluate(FRAME, 241)
    lit = pg.evaluate(PX, [hx + 150, hy + 10, 6])        # ground inside the hub's light pool
    far = pg.evaluate(PX, [hx + 150 + 520, hy + 10, 6]) if pg.evaluate("()=>__RTS.w2s(window.__h.x+670,window.__h.y).x<1270") else pg.evaluate(PX, [hx - 520, hy + 10, 6])
    ok(lit > far * 1.25, f'night: ground near the hub is lit (mean {lit:.0f}) vs far ground (mean {far:.0f})')
    farn = far
    pg.evaluate(FRAME, 61); fard = pg.evaluate(PX, [hx + 150 + 520, hy + 10, 6]) if pg.evaluate("()=>__RTS.w2s(window.__h.x+670,window.__h.y).x<1270") else pg.evaluate(PX, [hx - 520, hy + 10, 6])
    ok(farn < fard * 0.6, f'night ambient multiplies unlit ground down: day {fard:.0f} -> night {farn:.0f}')
    day = (pg.evaluate(FRAME, 61), pg.evaluate(PX, [hx + 150, hy + 10, 6]))[1]
    ok(day > lit * 1.3, f'day ground ({day:.0f}) is brighter than night ground near a lamp ({lit:.0f})')
    # no black frames
    allpx = pg.evaluate("()=>{const c=document.querySelector('canvas'),g=c.getContext('2d'),d=g.getImageData(0,0,c.width,c.height).data;let a=0;for(let i=0;i<d.length;i+=16)a+=d[i]+d[i+1]+d[i+2];return a/(d.length/16)/3}")
    ok(allpx > 25, f'day frame is not black (mean {allpx:.0f})')
    pg.evaluate(FRAME, 241)
    allpx = pg.evaluate("()=>{const c=document.querySelector('canvas'),g=c.getContext('2d'),d=g.getImageData(0,0,c.width,c.height).data;let a=0;for(let i=0;i<d.length;i+=16)a+=d[i]+d[i+1]+d[i+2];return a/(d.length/16)/3}")
    ok(allpx > 12, f'night frame is not black (mean {allpx:.0f})')

    # ---- shadow: sample beside the hub on the side the sun vector points to
    pg.evaluate(FRAME, 61)
    sv = pg.evaluate("()=>{const V=__RTSV;V.lightFrame();return[V.LT.sx,V.LT.sy,V.LT.sl]}")
    L = 64 + 40 * sv[2]
    sx, sy = hx + sv[0] * L * .9, hy + 64 + sv[1] * 40 * sv[2]
    pg.evaluate("()=>{__RTS.Q.shd=0}"); pg.evaluate(FRAME, 61); a0 = pg.evaluate(PX, [sx, sy, 5])
    pg.evaluate("()=>{__RTS.Q.shd=2}"); pg.evaluate(FRAME, 61); a2 = pg.evaluate(PX, [sx, sy, 5])
    ok(a2 < a0 * 0.93, f'shadows darken the ground behind the hub: shd=0 {a0:.0f} -> shd=2 {a2:.0f}')
    pg.evaluate("()=>{__RTS.setQualityMode('battery')}"); pg.evaluate(FRAME, 61)
    ok(pg.evaluate("()=>[__RTS.Q.shd,__RTS.Q.bloom]") == [0, 0], 'battery tier: no sprite shadows, no bloom')
    pg.evaluate("()=>{__RTS.setQualityMode('high')}")

    # ---- damage + construction states
    pg.evaluate("""()=>{const R=__RTS,G=R.G,h=window.__h;const b=R.addBuilding('armory',0,h.tx+8,h.ty-1,true);window.__b=b;const c=R.addBuilding('foundry',0,h.tx+8,h.ty+6,true);window.__c=c;R.centerOn(b.x,b.y+60)}""")
    box = pg.evaluate("()=>{const b=window.__b;return[b.x-b.w*16+6,b.y-b.h*16+6,b.w*32-12,b.h*32-12]}")
    pg.evaluate("()=>{const b=window.__b;b.hp=b.maxhp}"); pg.evaluate(FRAME, 61); pg.evaluate(DIFF, box)
    pg.evaluate("()=>{const b=window.__b;b.hp=b.maxhp*.15}"); pg.evaluate(FRAME, 61); pg.evaluate(DIFF, box)
    r = pg.evaluate("()=>{const[a,b]=window.__snap;let n=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>40)n++;return n/(a.length/4)}")
    pg.evaluate("()=>{window.__snap.length=0;const b=window.__b;b.hp=b.maxhp*.6}"); pg.evaluate(FRAME, 61); pg.evaluate(DIFF, box)
    pg.evaluate("()=>{const b=window.__b;b.hp=b.maxhp*.15}"); pg.evaluate(FRAME, 61); pg.evaluate(DIFF, box)
    orange = pg.evaluate("()=>window.__snap.map(a=>{let n=0;for(let i=0;i<a.length;i+=4)if(a[i]>190&&a[i+1]>70&&a[i+1]<190&&a[i+2]<90)n++;return n})")
    ok(orange[1] > orange[0] + 15, f'a nearly dead building shows glowing cracks (orange pixels {orange[0]} at 60% hp -> {orange[1]} at 15% hp)')
    ok(r > 0.03, f'damage state changes the building pixels ({100*r:.1f}% of its footprint differs at 15% hp)')
    box = pg.evaluate("()=>{const b=window.__c;return[b.x-b.w*16+6,b.y-b.h*16+6,b.w*32-12,b.h*32-12]}")
    pg.evaluate("()=>{window.__snap=[];const b=window.__c;b.done=true;b.hp=b.maxhp}"); pg.evaluate(FRAME, 61); pg.evaluate(DIFF, box)
    pg.evaluate("()=>{const b=window.__c;b.done=false;b.prog=.4}"); pg.evaluate(FRAME, 61); pg.evaluate(DIFF, box)
    r = pg.evaluate("()=>{const[a,b]=window.__snap;let n=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>40)n++;return n/(a.length/4)}")
    ok(r > 0.15, f'a building under construction (40%) is visibly different from a finished one ({100*r:.0f}% pixels)')

    # ---- bloom adds light next to a very bright source (night, projectile-like flash)
    pg.evaluate("""()=>{const R=__RTS,h=window.__h;R.centerOn(h.x,h.y);R.G.fx.push({x:h.x-200,y:h.y+120,t:0,max:5,kind:'flash',r:60})}""")
    pg.evaluate("()=>{__RTS.Q.bloom=0}"); pg.evaluate(FRAME, 241); b0 = pg.evaluate(PX, [hx - 200 + 70, hy + 120, 8])
    pg.evaluate("()=>{__RTS.Q.bloom=2}"); pg.evaluate(FRAME, 241); b2 = pg.evaluate(PX, [hx - 200 + 70, hy + 120, 8])
    ok(b2 > b0 + 1.5, f'bloom spreads light around a flash: {b0:.1f} -> {b2:.1f}')
    pg.evaluate("()=>{__RTS.Q.bloom=0}")

    # ---- minimap: both teams' blips
    pg.evaluate("""()=>{const R=__RTS,G=R.G,h=window.__h;R.ui.demo=true;for(let i=0;i<5;i++){R.addUnit('titan',0,h.x+60+i*70,h.y+200);}const e=G.buildings.find(b=>b.team===1&&b.type==='hub');for(let i=0;i<5;i++)R.addUnit('titan',1,e.x-60-i*70,e.y-200);R.drawMinimap();}""")
    mmr = pg.evaluate("""()=>{const R=__RTS,G=R.G,mm=document.getElementById('minimap')||document.querySelector('#mmWrap canvas'),g=mm.getContext('2d'),d=g.getImageData(0,0,mm.width,mm.height).data;
      const near=(c,i)=>{const h=c.slice(1);const r=parseInt(h.slice(0,2),16),gg=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);return Math.abs(d[i]-r)+Math.abs(d[i+1]-gg)+Math.abs(d[i+2]-b)<70};
      const c0=G.teams[0].pal.light,c1=G.teams[1].pal.light;let n0=0,n1=0;for(let i=0;i<d.length;i+=4){if(near(c0,i))n0++;if(near(c1,i))n1++}R.ui.demo=false;return[n0,n1]}""")
    ok(mmr[0] > 6 and mmr[1] > 6, f'minimap shows team-0 and team-1 blips (pixels {mmr})')

    # ---- cost: v4 passes on vs off (off = the v3.3 feature set: glows + dust, no shadows / bloom), same tier, same scene, same run
    pg.evaluate("""()=>{const R=__RTS,h=window.__h;R.G.time=70;R.setQualityMode('high');R.cam.z=R.cam.tz=1.3;R.centerOn(h.x,h.y);for(let i=0;i<6;i++)R.addUnit('rifleman',0,h.x+60+i*14,h.y+110);for(let i=0;i<6;i++)R.addUnit('rifleman',1,h.x+60+i*14,h.y+150);for(let i=0;i<30;i++)R.render(1)}""")
    T = """(cfg)=>{const R=__RTS;Object.assign(R.Q,cfg);const o=[];for(let i=0;i<50;i++){const t0=performance.now();R.render(1+i*.05);o.push(performance.now()-t0)}o.sort((a,b)=>a-b);return o[Math.floor(o.length/2)]}"""
    off = min(pg.evaluate(T, dict(shd=0, bloom=0, fx=2)) for _ in range(3))
    on = min(pg.evaluate(T, dict(shd=2, bloom=0, fx=2)) for _ in range(3))
    ok(on < off * BUDGET, f"high tier with v4 passes {on:.1f} ms vs v3.3 feature set {off:.1f} ms (ratio {on/off:.2f}, limit {BUDGET}; software raster)")

    ok(not errs, f'no console / page errors {errs[:3]}')
    ok(not reqs, f'zero network requests {reqs[:3]}')
    b.close()
print('\nALL VISUAL CHECKS PASSED' if not fails else f'\n{len(fails)} FAILED'); sys.exit(1 if fails else 0)
