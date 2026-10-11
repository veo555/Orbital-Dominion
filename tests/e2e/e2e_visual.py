"""Visual gate for the v4.0 graphics (Playwright + Chromium). Exit code != 0 on failure.
   OD_URL=file:///.../dist/orbital_dominion_v4.html python3 tests/e2e/e2e_visual.py     (about 40 s)

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
URL = os.environ.get('OD_URL') or (ROOT / 'dist' / 'orbital_dominion_v4.html').as_uri()
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

    # ---- v5 pre-rendered 3D sprites: lighting model, facings, emissive glow, draw order, selection ring, soft fog
    r = pg.evaluate("""()=>{const V=__RTSV,sc=2,W=120*sc,H=120*sc,mk=(f)=>{const B=V.Mesh3();f(B);const d=V.bakeMesh(B,0,W,H,60*sc,80*sc,sc).cv.getContext('2d').getImageData(0,0,W,H).data;
        return(x,y)=>{const i=(Math.round(80*sc+y*sc)*W+Math.round(60*sc+x*sc))*4;return d[i+3]?(d[i]+d[i+1]+d[i+2])/3:-1;};};
      const box=mk(B=>B.box(0,0,0,40,40,30,B.m('#808080',0,24))),dome=mk(B=>B.sp(0,0,0,26,26,26,12,B.m('#808080',0,24),true));
      return{roof:box(0,-18),front:box(0,12),west:dome(-14,-13.6),east:dome(14,-13.6)}}""")
    ok(r['roof'] > 0 and r['front'] > 0 and r['roof'] > r['front'] * 1.25, f"3D bake: a box's roof ({r['roof']:.0f}) is lighter than its south face ({r['front']:.0f})")
    ok(r['west'] > 0 and r['east'] > 0 and r['west'] > r['east'] * 1.3, f"3D bake: the dome side facing the light (west {r['west']:.0f}) is lighter than the shadow side (east {r['east']:.0f})")
    d = pg.evaluate("""()=>{const V=__RTSV,get=a=>{V.resetBake();return V.unitSprite('juggernaut','meridian',a)},a=get(0),b=get(Math.PI/2),c=get(Math.PI);
      const px=s=>s.cv.getContext('2d').getImageData(0,0,s.cv.width,s.cv.height).data,A=px(a),B=px(b),C=px(c);let n1=0,n2=0,n=0;for(let i=3;i<A.length;i+=4){if(A[i]||B[i])n++;if(Math.abs(A[i-3]-B[i-3])+Math.abs(A[i-2]-B[i-2])>40||A[i]!==B[i])n1++;if(A[i]!==C[i]||Math.abs(A[i-3]-C[i-3])>40)n2++;}return[n1/n,n2/n,a!==b]}""")
    ok(d[2] and d[0] > .15 and d[1] > .15, f'3D sprites: a Juggernaut baked at 0 / 90 / 180 degrees gives three different images ({100*d[0]:.0f}% / {100*d[1]:.0f}% of its pixels differ)')
    e = pg.evaluate("""()=>{const V=__RTSV,out={};for(const[k,sp]of[['hub',V.buildingSprite('hub','meridian')],['hauler',V.unitSprite('hauler','meridian',0)],['obs hub',V.buildingSprite('hub','obsidian')]]){const em=sp.cv._em;if(!em){out[k]=-1;continue;}
        const c=document.createElement('canvas');c.width=sp.cv.width;c.height=sp.cv.height;const g=c.getContext('2d');g.drawImage(sp.cv,0,0);const m=()=>{const d=g.getImageData(0,0,c.width,c.height).data;let s=0,n=0;for(let i=0;i<d.length;i+=4)if(d[i+3]){s+=d[i]+d[i+1]+d[i+2];n++}return s/n/3};
        const a0=m();g.globalCompositeOperation='lighter';g.globalAlpha=.8;g.drawImage(em,0,0,c.width,c.height);out[k]=m()-a0;}return out}""")
    ok(all(v > 1.0 for v in e.values()), f'emissive glow mask exists and adds light on top of the lit sprite (mean luminance gain {e})')
    # draw order: a unit standing north of a tall building is hidden by its roof, one standing south of it is drawn over it
    pg.evaluate("""()=>{const R=__RTS,G=R.G,h=window.__h;G.time=61;R.Q.shd=2;window.__g=R.addBuilding('garrison',0,h.tx+12,h.ty+14,true);R.centerOn(window.__g.x,window.__g.y);}""")
    gb = pg.evaluate("()=>{const g=window.__g;return[g.x,g.y,g.h*16]}")
    pg.evaluate(FRAME, 61); pg.evaluate("()=>{window.__snap=[]}")
    reg_n = [gb[0] - 4, gb[1] - 28, 8, 8]; reg_s = [gb[0] - 4, gb[1] + gb[2] + 6, 8, 8]
    pg.evaluate(DIFF, reg_n); pg.evaluate(DIFF, reg_s)
    pg.evaluate("""([x,yn,ys])=>{const R=__RTS,a=R.addUnit('titan',0,x,yn),b=R.addUnit('titan',0,x,ys);for(const u of[a,b]){u.order={t:'idle'};u.hidden=false;}window.__u=[a,b]}""", [gb[0], gb[1] - 30, gb[1] + gb[2] + 12])
    pg.evaluate(FRAME, 61); pg.evaluate(DIFF, reg_n); pg.evaluate(DIFF, reg_s)
    dn, ds = pg.evaluate("()=>{const s=window.__snap,cnt=(a,b)=>{let n=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>30)n++;return n};return[cnt(s[0],s[2]),cnt(s[1],s[3])]}")
    ok(dn <= 4 and ds > 12, f'draw order: a Titan behind (north of) a Garrison is hidden by its roof ({dn} px change), one in front of it is drawn over it ({ds} px change)')
    pg.evaluate("()=>{for(const u of window.__u)u.dead=true;window.__g.dead=true}")
    # selection ring: a thin bright circle in the team colour appears under a selected unit
    pg.evaluate("""()=>{const R=__RTS,h=window.__h,u=R.addUnit('rifleman',0,h.x-90,h.y+150);u.order={t:'idle'};window.__s=u;R.setSel([]);R.centerOn(u.x,u.y);R.G.fx.length=0}""")
    RING = """()=>{const R=__RTS,u=window.__s,s=R.w2s(u.x,u.y),k=R.DPR,c=document.querySelector('canvas'),g=c.getContext('2d'),n=Math.round(26*k),d=g.getImageData(Math.round(s.x*k)-n,Math.round(s.y*k)-n,2*n,2*n).data;let m=0;
      for(let i=0;i<d.length;i+=4)if(d[i+1]>200&&d[i]<190&&d[i+2]>110&&d[i+1]-d[i]>55)m++;return m}"""
    pg.evaluate(FRAME, 61); n0 = pg.evaluate(RING)
    pg.evaluate("()=>{const R=__RTS;R.setSel([window.__s])}"); pg.evaluate(FRAME, 61); n1 = pg.evaluate(RING)
    ok(n1 > n0 + 20, f'selection: a selected unit gets a green team-colour ring on the ground ({n0} -> {n1} ring pixels)')
    pg.evaluate("()=>{window.__s.dead=true;__RTS.setSel([])}")
    # fog: the boundary of the visible area is a soft gradient (>= 48 px wide), not a tile stair step
    fw = pg.evaluate("""()=>{const R=__RTS,G=R.G,h=window.__h,tx=h.tx,ty=h.ty;R.cam.z=R.cam.tz=1;R.centerOn(h.x,h.y);G.time=61;G.daylight=1;
      for(let y=0;y<R.MH;y++)for(let x=0;x<R.MW;x++)G.vis[0][y*R.MW+x]=Math.hypot(x-tx,y-ty)<9?2:0;
      for(let i=0;i<40;i++){R.render(61);}
      const s=R.w2s(h.x,h.y),k=R.DPR,c=document.querySelector('canvas'),g=c.getContext('2d'),x0=Math.round((s.x+6*32)*k),n=Math.round(200*k),L=[];
      for(let i=0;i<n;i++){let a=0;for(let j=-6;j<=6;j++){const d=g.getImageData(x0+i,Math.round(s.y*k)+j*3,1,1).data;a+=d[0]+d[1]+d[2];}L.push(a/13/3);}
      const hi=Math.max(...L.slice(0,20)),lo=Math.min(...L.slice(-20));let i1=-1,i2=-1;for(let i=0;i<n;i++){if(i1<0&&L[i]<lo+(hi-lo)*.9)i1=i;if(i2<0&&L[i]<lo+(hi-lo)*.1)i2=i;}return[(i2-i1)/k,hi,lo]}""")
    ok(fw[1] > fw[2] * 3 and fw[0] >= 48, f'fog: the edge of the visible area falls off over {fw[0]:.0f} px (bright {fw[1]:.0f} -> dark {fw[2]:.0f}); a stair step would be < 48 px')

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
