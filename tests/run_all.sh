#!/bin/bash
# Full local gate: build -> simulation smoke -> browser smoke.  Exit code != 0 if anything fails.
set -e
cd "$(dirname "$0")/.."
python3 build.py
node tests/sim/smoke.js
python3 tests/e2e/e2e_smoke.py
echo "ALL GATES PASSED"
