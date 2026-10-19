#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Test tooling is isolated from the shipped Firebase SDK and package lock.
export COMPETITION_TEST_TOOLS="${COMPETITION_TEST_TOOLS:-${TMPDIR:-/tmp}/edlight-competition-tools}"
if [[ ! -x "$COMPETITION_TEST_TOOLS/node_modules/.bin/firebase" ]]; then
  npm install --prefix "$COMPETITION_TEST_TOOLS" --no-audit --no-fund firebase-tools@15.34.0 @firebase/rules-unit-testing@6.0.0 firebase@13.0.0
fi
if [[ -z "${JAVA_HOME:-}" && -d /opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home ]]; then
  export JAVA_HOME=/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home
  export PATH="$JAVA_HOME/bin:$PATH"
fi
"$COMPETITION_TEST_TOOLS/node_modules/.bin/firebase" emulators:exec \
  --config firebase.competition-test.json --only firestore --project demo-edlight-competition \
  'node scripts/test_competition_rules.cjs && npx jest --config jest.competition-emulator.config.cjs --runInBand'
