#!/usr/bin/env bash
# One-shot go-live for Sandra's infrastructure. Run from anywhere:
#   bash scripts/sandra_go_live.sh
#
# Does three things, using the service account already pulled into .env.local:
#   1. Deploys Firestore rules + indexes (incl. the sandraKb vector indexes)
#   2. Builds the Sandra knowledge base (embeds courses/quizzes/exams → sandraKb)
#   3. Removes the temporary credential file on exit, success or failure
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env.local ]; then
  echo "ERROR: .env.local not found — run: npx vercel env pull .env.local" >&2
  exit 1
fi

SA_FILE="$(mktemp)"
trap 'rm -f "$SA_FILE"' EXIT

# Extract FIREBASE_SERVICE_ACCOUNT_JSON. `vercel env pull` serializes the
# value's real newlines (JSON pretty-printing) AND the private key's escaped
# \n into the same literal two-char "\n" — so: restore real newlines
# everywhere, then re-escape them only inside the private-key string literal,
# which is the one place raw newlines are invalid JSON. Never echo the value.
node -e '
const fs = require("fs");
const src = fs.readFileSync(".env.local", "utf8");
const m = src.match(/^FIREBASE_SERVICE_ACCOUNT_JSON="(.*)"\s*$/m);
if (!m) { console.error("FIREBASE_SERVICE_ACCOUNT_JSON not found in .env.local"); process.exit(1); }
const restored = m[1].replace(/\\"/g, "\"").replace(/\\n/g, "\n");
const repaired = restored.replace(
  /-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----\n?/,
  (key) => key.replace(/\n/g, "\\n"),
);
let sa;
try { sa = JSON.parse(repaired); }
catch { console.error("Could not parse FIREBASE_SERVICE_ACCOUNT_JSON (format not recognized)"); process.exit(1); }
if (!sa.project_id || !sa.private_key || !sa.client_email) { console.error("Service account JSON is missing required fields"); process.exit(1); }
fs.writeFileSync(process.argv[1], JSON.stringify(sa), { mode: 0o600 });
console.log("Service account OK for project: " + sa.project_id);
' "$SA_FILE"

GEMINI_API_KEY="$(node -e '
const src = require("fs").readFileSync(".env.local", "utf8");
const m = src.match(/^GEMINI_API_KEY="?([^"\n]*)"?\s*$/m);
if (!m || !m[1]) { console.error("GEMINI_API_KEY not found in .env.local"); process.exit(1); }
process.stdout.write(m[1]);
')"

if [ "${1:-}" = "--kb-only" ]; then
  echo "→ [1/2] Skipping rules/indexes deploy (--kb-only)"
else
  echo "→ [1/2] Deploying Firestore rules + indexes…"
  GOOGLE_APPLICATION_CREDENTIALS="$SA_FILE" \
    npx firebase deploy --only firestore:rules,firestore:indexes --project edlight-academy --non-interactive
fi

echo "→ [2/2] Building Sandra knowledge base…"
FIREBASE_SERVICE_ACCOUNT_JSON="$(cat "$SA_FILE")" \
  GEMINI_API_KEY="$GEMINI_API_KEY" \
  node scripts/build_sandra_kb.mjs

echo "✓ Sandra infrastructure is live (temp credentials removed)."
