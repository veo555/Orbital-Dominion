#!/bin/bash
# A/B balance comparison of two source trees over the same seeds (headless, Autopilot vs built-in Normal AI).
#   tools/ab.sh <srcDirA> <srcDirB> [firstSeed=21] [lastSeed=44] [gameMinutes=18]
# Example (compare working tree against a saved copy):  tools/ab.sh ../old_src/js src/js
# Output: tests/out/ab_A.txt and tests/out/ab_B.txt  (one line per match; see tests/sim/match2.js)
# Each match is ~1-3 min wall clock; A and B run in parallel. Use >= 24 seeds: SE of a win-rate on 24 matches is ~0.10.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
A="$(cd "${1:?srcDirA}" && pwd)"; B="$(cd "${2:?srcDirB}" && pwd)"; S0="${3:-21}"; S1="${4:-44}"; M="${5:-18}"   # resolve BEFORE changing directory
cd "$ROOT/tests/sim"; mkdir -p "$ROOT/tests/out"
SEEDS=$(seq -s, "$S0" "$S1")
RS=11 SRC="$A" node match2.js "$SEEDS" "$M" normal "" > "$ROOT/tests/out/ab_A.txt" 2>&1 &
RS=11 SRC="$B" node match2.js "$SEEDS" "$M" normal "" > "$ROOT/tests/out/ab_B.txt" 2>&1 &
wait
for f in A B; do
  echo "== $f: $(grep -c 'seed' "$ROOT/tests/out/ab_$f.txt") matches;" \
       "$(grep -c ' victory' "$ROOT/tests/out/ab_$f.txt") victory, $(grep -c ' defeat' "$ROOT/tests/out/ab_$f.txt") defeat, $(grep -c ' draw' "$ROOT/tests/out/ab_$f.txt") undecided, $(grep -c 'EXC' "$ROOT/tests/out/ab_$f.txt") exceptions"
done
echo "Per-match lines are in tests/out/ab_A.txt and ab_B.txt (column after the factions = result)."
