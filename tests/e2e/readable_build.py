"""Helper for the E2E scripts that INSTRUMENT the game's source text (tests/e2e/e2e_audio_wiring.py, e2e_soundlab.py).

They wrap `function name(...){` declarations and patch exact source lines, which needs the readable (unminified) bundle.  The shipped build is minified
(tools/minify.js, OD_MIN=1 by default), so these scripts build a throw-away READABLE copy with OD_MIN=0 into a scratch directory and instrument that.
(The minified build itself is exercised by every other browser gate, and tests/minify + tests/sim/minify_determinism.js prove the minifier.)
"""
import os, pathlib, subprocess, sys, tempfile

ROOT = pathlib.Path(__file__).resolve().parents[2]


def readable_html():
    d = tempfile.mkdtemp(prefix='od_readable_')
    env = dict(os.environ, OD_MIN='0', OD_DIST=d)
    r = subprocess.run([sys.executable, str(ROOT / 'build.py'), 'standalone'], env=env, capture_output=True, text=True, cwd=str(ROOT))
    if r.returncode:
        sys.exit('readable build failed:\n' + r.stdout + r.stderr)
    return (pathlib.Path(d) / 'orbital_dominion_v4.html').read_text(encoding='utf-8')
