#!/usr/bin/env bash
# Runs the whole local test suite. Requires Git Bash (Windows) or bash.
# Usage: .harness/run-tests.sh
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

fail=0

echo "== validator negative tests =="
# Each case must make validate.mjs exit non-zero. A check that never fires
# is worse than no check, so these assert the failure mode explicitly.
node .harness/validate-negative.cjs "$ROOT" || fail=1

echo
echo "== pipeline edge cases =="
node .harness/edge-test.cjs "$ROOT" || fail=1

echo
echo "== retry loop vs a real remote =="
node .harness/retry-test.cjs "$ROOT" "${TMPDIR:-/tmp}/retry-suite" || fail=1

echo
echo "== determinism =="
node .harness/determinism-test.cjs "$ROOT" || fail=1

echo
if [ "$fail" -eq 0 ]; then
  echo "ALL SUITES PASSED"
else
  echo "SOME SUITES FAILED" >&2
fi
exit "$fail"