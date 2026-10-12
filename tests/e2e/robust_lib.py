"""Shared helpers for the v5 robustness gates (e2e_robust_core.py, e2e_robust_audio.py, e2e_robust_storage.py).

* pages that collect page errors / console errors (the intended '[guard] ...' log lines are separated from real console errors)
* MUTANT builds: a READABLE copy of the game (OD_MIN=0) with one exact source patch applied.  Every robustness feature has a patch that removes it; the gate then runs the
  same check against the mutant and demands that it FAILS ("a green test that cannot fail is worthless", CLAUDE.md rule 15).
"""
import os, pathlib, sys, tempfile, time
ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from readable_build import readable_html

URL = os.environ.get('OD_URL') or (ROOT / 'dist' / 'orbital_dominion_v4.html').as_uri()
_READABLE = None


def readable():
    global _READABLE
    if _READABLE is None:
        _READABLE = readable_html()
    return _READABLE


def mutant_url(patches):
    """patches: list of (old, new); each `old` must occur EXACTLY once in the readable build.  Returns a file:// URL."""
    html = readable()
    for old, new in patches:
        n = html.count(old)
        if n != 1:
            raise SystemExit(f'mutant patch target occurs {n} times (need exactly 1): {old[:90]!r} - update the patch in the robustness gate')
        html = html.replace(old, new)
    f = pathlib.Path(tempfile.mkdtemp(prefix='od_mutant_')) / 'build.html'
    f.write_text(html, encoding='utf-8')
    return f.as_uri()


class Rec:
    """collects pass/fail lines like the other gates"""
    def __init__(self):
        self.fails = []
        self.t0 = time.time()

    def ok(self, cond, msg):
        print(('ok    ' if cond else 'FAIL  ') + msg, flush=True)
        if not cond:
            self.fails.append(msg)

    def done(self, name):
        print(f'\n{"ALL " + name + " CHECKS PASSED" if not self.fails else "FAILED " + str(len(self.fails))} ({time.time() - self.t0:.0f} s)', flush=True)
        sys.exit(1 if self.fails else 0)


def open_page(browser, url, init=None, viewport=None, errs=None, guardlog=None, test='live'):
    """new page with window.__TEST set; page errors go to errs['page'], console errors to errs['console'] (lines starting with '[guard]' to errs['guard'])"""
    ctx = browser.new_context(viewport=viewport or {'width': 1366, 'height': 800})
    pg = ctx.new_page()
    e = errs if errs is not None else {}
    e.setdefault('page', []); e.setdefault('console', []); e.setdefault('guard', [])
    pg.on('pageerror', lambda x: e['page'].append(str(x)[:200]))
    def con(m):
        if m.type in ('error', 'warning'):
            (e['guard'] if m.text.startswith('[guard]') else e['console']).append(m.text[:200])
    pg.on('console', con)
    pg.add_init_script(f"window.__TEST={test!r}")
    if init:
        pg.add_init_script(init)
    pg.goto(url)
    return ctx, pg, e


def start_match(pg, wait=900):
    pg.wait_for_function("()=>!!(window.__RTS&&__RTS.G)", timeout=15000)
    pg.wait_for_timeout(600)
    pg.mouse.move(683, 400)
    pg.click('#bStart')
    pg.wait_for_timeout(wait)
    pg.wait_for_function("()=>!!(__RTS.G&&__RTS.ui.running&&!__RTS.ui.demo)", timeout=10000)


def tick(pg):
    return pg.evaluate("()=>__RTS.G.tick")
