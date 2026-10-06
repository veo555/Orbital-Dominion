#!/bin/bash
# Full local gate. Exit code != 0 if anything fails. About 5 minutes.
#   build -> design tokens -> simulation smoke -> desktop browser -> touch/phone -> app lifecycle -> PWA -> payments (client) -> payments (Worker)
set -e
cd "$(dirname "$0")/.."
python3 build.py
python3 tools/design_check.py > /dev/null && echo "design requirements met (tools/design_check.py)"
node tests/sim/smoke.js
python3 tests/e2e/e2e_smoke.py
python3 tests/e2e/e2e_touch.py
python3 tests/e2e/e2e_terrain.py
python3 tests/e2e/e2e_platform.py
python3 tests/e2e/e2e_pwa.py
python3 tests/e2e/e2e_support.py
(cd server/stripe-worker && node --test test/worker.test.mjs)
echo "ALL GATES PASSED"
