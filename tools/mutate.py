#!/usr/bin/env python3
"""Mutation proof helper for the visual gate: apply one textual mutation to a source file, rebuild, run the gate, print the FAIL lines, restore.
   python3 tools/mutate.py src/js/56_mesh3d.js "L3=[-.5,-.6,.62]" "L3=[-.5,-.6,-.62]"   [--test tests/e2e/e2e_visual.py]
Exit 0 when the gate FAILED (the mutation was caught)."""
import subprocess, sys, pathlib, os
ROOT = pathlib.Path(__file__).resolve().parents[1]
f, old, new = sys.argv[1:4]
test = sys.argv[5] if len(sys.argv) > 5 and sys.argv[4] == '--test' else 'tests/e2e/e2e_visual.py'
p = ROOT / f; src = p.read_text()
assert old in src, 'mutation anchor not found'
try:
    p.write_text(src.replace(old, new, 1))
    subprocess.run([sys.executable, 'build.py'], cwd=ROOT, capture_output=True, check=True)
    env = dict(os.environ, OD_URL=(ROOT / 'dist' / 'orbital_dominion_v4.html').as_uri())
    r = subprocess.run([sys.executable, test], cwd=ROOT, env=env, capture_output=True, text=True, timeout=280)
    for l in r.stdout.splitlines():
        if l.startswith('FAIL'): print(l)
    print('gate exit code', r.returncode, '(mutation caught)' if r.returncode else '(NOT caught!)')
finally:
    p.write_text(src)
    subprocess.run([sys.executable, 'build.py'], cwd=ROOT, capture_output=True)
sys.exit(0 if r.returncode else 1)
