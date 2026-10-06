#!/bin/bash
# Run two halves of a seed list in parallel with a JS snippet applied after the Autopilot preset (balance experiments).
#   tools/run_snippet_batch.sh <label> <seedsA> <seedsB> <minutes> '<js snippet evaluated in sim scope>'
# Example: tools/run_snippet_batch.sh nostim 1,2,3,4 5,6,7,8 18 'UDEF.rifleman.dmg+=1'
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT/tests/sim"; mkdir -p "$ROOT/tests/out"
RS=7 node match2.js "$2" "$4" normal "$5" > "$ROOT/tests/out/out_$1_a.txt" 2>&1 &
RS=7 node match2.js "$3" "$4" normal "$5" > "$ROOT/tests/out/out_$1_b.txt" 2>&1 &
wait
cat "$ROOT/tests/out/out_$1_a.txt" "$ROOT/tests/out/out_$1_b.txt" | sort
