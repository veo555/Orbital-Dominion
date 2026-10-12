#!/usr/bin/env python3
"""Visual scenario screenshots for graphics work:
   python3 tools/vshots.py --tag before --out DIR [--url URL] [--tier high] [--only early,fight] desktop iphone-land pixel-port
Scenarios: early base, mid fight, night fight (other faction), close zoom."""
import argparse, pathlib
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parents[1]
PROF = {'desktop': (1600, 900, 1, False), 'iphone-land': (844, 390, 3, True), 'pixel-port': (412, 915, 2.625, True)}
SETUP = """(o)=>{const R=__RTS;R.SET.faction=o.f;R.SET.enemy=o.e;R.startGame();const G=R.G;
 for(let i=0;i<30*o.pre;i++)R.step();
 const hub=G.buildings.find(b=>b.team===0&&b.type==='hub'),eh=G.buildings.find(b=>b.team===1&&b.type==='hub');
 if(o.fight){const mx=(hub.x+eh.x)/2,my=(hub.y+eh.y)/2;
  const A=['rifleman','rifleman','rifleman','rocketeer','rocketeer','mender','howitzer','juggernaut','raptor','raptor','titan'];
  for(let i=0;i<A.length;i++){const t=A[i];const a=R.addUnit(t,0,mx-70+(i%4)*26,my-40+Math.floor(i/4)*30),b=R.addUnit(t,1,mx+70+(i%4)*26,my-40+Math.floor(i/4)*30);
   if(a)R.issueGroup([a],{t:'attackmove',x:mx+90,y:my});if(b)R.issueGroup([b],{t:'attackmove',x:mx-90,y:my});}
  R.G.vis[0].fill(2);R.centerOn(mx,my);}
 else R.centerOn(hub.x+60,hub.y);
 if(o.base){const T=['garrison','armory','forum','exchange','foundry','airfield','generator','depot','habitat','turret'],P=[[-8,-9],[-3,-9],[3,-9],[9,-9],[-8,6],[-3,6],[4,6],[7,6],[10,6],[12,0]];
  T.forEach((t,i)=>{try{R.addBuilding(t,0,hub.tx+P[i][0],hub.ty+P[i][1],true)}catch(e){}});R.G.vis[0].fill(2);R.centerOn(hub.x+40,hub.y);}
 if(o.night)G.time=241;
 R.cam.z=R.cam.tz=o.z;R.clampCam();}"""
SCEN = [('early', {}), ('fight', dict(fight=True, pre=100)),
        ('night', dict(fight=True, pre=240, night=True, f='aurora', e='meridian')),
        ('obs', dict(f='obsidian', e='aurora', pre=120, z=1.3)),
        ('base', dict(base=True, pre=60, z=1.0, f='meridian', e='obsidian')),
        ('base2', dict(base=True, pre=60, z=1.0, f='obsidian', e='aurora')),
        ('base3', dict(base=True, pre=60, z=1.0, f='aurora', e='meridian')),
        ('zoom', dict(fight=True, pre=100, z=1.7, f='aurora', e='obsidian'))]


def run(p, url, name, outdir, tag, tier, scen):
    w, h, dpr, mob = PROF[name]
    b = p.chromium.launch(args=['--no-sandbox'])
    pg = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=dpr, is_mobile=mob, has_touch=mob).new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script("window.__TEST='live'")
    pg.goto(url)
    pg.wait_for_timeout(1200)
    if not mob:
        pg.mouse.move(w // 2, h // 2)
    for s in scen:
        o = dict(f='meridian', e='obsidian', pre=40, fight=False, night=False, z=1.0)
        o.update(s[1])
        pg.evaluate("(t)=>__RTS.setQualityMode(t)", tier)
        pg.evaluate(SETUP, o)
        pg.wait_for_timeout(300)
        pg.evaluate("()=>{const R=__RTS;for(let i=0;i<45;i++)R.step()}")
        pg.wait_for_timeout(900)
        f = outdir / f'{tag}_{name}_{s[0]}.png'
        pg.screenshot(path=str(f))
        print(f)
    print(name, 'errors', errs)
    b.close()


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('names', nargs='*')
    ap.add_argument('--tag', default='x')
    ap.add_argument('--out', default='tests/out/vshots')
    ap.add_argument('--url')
    ap.add_argument('--tier', default='high')
    ap.add_argument('--only', default='')
    a = ap.parse_args()
    out = pathlib.Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    url = a.url or (ROOT / 'dist' / 'orbital_dominion_v4.html').as_uri()
    sc = [s for s in SCEN if not a.only or s[0] in a.only.split(',')]
    with sync_playwright() as p:
        for n in a.names or ['desktop']:
            run(p, url, n, out, a.tag, a.tier, sc)
