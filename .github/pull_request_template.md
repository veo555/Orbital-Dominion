## What and why

## Checks (see CONTRIBUTING.md)
- [ ] `python3 build.py` run and `dist/` committed
- [ ] `node tests/sim/smoke.js` and the sim test for the area I touched pass
- [ ] New tests were shown to fail on a broken copy of the code (`--mutants` or by hand)
- [ ] Balance / AI changes: >= 24 seeds, interval reported
- [ ] No new network requests; no new `Math.random` in sim modules (use `rnd()` / `G.rng`)
