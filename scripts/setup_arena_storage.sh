#!/usr/bin/env bash
#
# Provision the bucket that holds the Arena's parental consent forms.
#
# Run once, from the repo root:  bash scripts/setup_arena_storage.sh
#
# ── Why this is a script and not a console click ───────────────────────────
# It can be either. Firebase's own path is one click ("Get Started" in the
# Storage console), which provisions the DEFAULT bucket —
# `edlight-academy.firebasestorage.app`. That bucket cannot be created from
# gcloud: it carries a Google-owned domain name, and GCS refuses a
# domain-named bucket without domain verification we do not have.
#
# So the all-gcloud path creates a PLAINLY NAMED bucket and links it to
# Firebase with `:addFirebase`. The result is identical in every way that
# matters here — Firebase rules apply to it, the web SDK reads it, the Admin
# SDK writes it — it just is not the "default" one.
#
# Everything below is idempotent: run it twice and the second run reports
# what already exists and changes nothing.
#
set -euo pipefail

PROJECT="${FIREBASE_PROJECT:-edlight-academy}"
BUCKET="${ARENA_CONSENT_BUCKET:-edlight-academy-arena-consent}"
# Match Firestore's region so a consent form and the claim that points at it
# do not sit on opposite sides of the planet.
LOCATION="${ARENA_CONSENT_LOCATION:-us-central1}"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()  { printf '  ✓ %s\n' "$*"; }
no()  { printf '  ✗ %s\n' "$*" >&2; }

# ── 0 · Credentials ─────────────────────────────────────────────────────────
say "0 · Checking credentials"
if ! gcloud auth print-access-token >/dev/null 2>&1; then
  no "gcloud needs a fresh login. Run:  gcloud auth login"
  exit 1
fi
ACTIVE="$(gcloud config get-value account 2>/dev/null)"
ok "gcloud: $ACTIVE"
ok "project: $PROJECT"

# ── 1 · Billing ─────────────────────────────────────────────────────────────
# A GCS bucket needs billing on the project. Checked before anything is
# created, because the failure otherwise lands in the middle of the run with a
# message about permissions rather than about money.
say "1 · Checking billing"
if gcloud beta billing projects describe "$PROJECT" --format="value(billingEnabled)" 2>/dev/null | grep -qi true; then
  ok "billing is enabled"
else
  no "Billing is not enabled on $PROJECT (or the billing API is off)."
  no "Cloud Storage needs it. Enable it here, then re-run:"
  no "  https://console.cloud.google.com/billing/linkedaccount?project=$PROJECT"
  exit 1
fi

# ── 2 · APIs ────────────────────────────────────────────────────────────────
say "2 · Enabling APIs"
for api in storage.googleapis.com firebasestorage.googleapis.com; do
  if gcloud services list --enabled --project="$PROJECT" --filter="config.name:$api" --format="value(config.name)" | grep -q .; then
    ok "$api already enabled"
  else
    gcloud services enable "$api" --project="$PROJECT"
    ok "$api enabled"
  fi
done

# ── 3 · The bucket ──────────────────────────────────────────────────────────
say "3 · Creating the bucket"
if gcloud storage buckets describe "gs://$BUCKET" --project="$PROJECT" >/dev/null 2>&1; then
  ok "gs://$BUCKET already exists"
else
  # Uniform access: object ACLs are a second permission system that would sit
  # beside the Firebase rules and disagree with them.
  gcloud storage buckets create "gs://$BUCKET" \
    --project="$PROJECT" \
    --location="$LOCATION" \
    --uniform-bucket-level-access \
    --public-access-prevention
  ok "gs://$BUCKET created in $LOCATION"
fi

# ── 4 · Link it to Firebase ─────────────────────────────────────────────────
# This is what makes `firebase deploy --only storage` able to govern it and
# the client SDKs able to reach it under Firebase Auth.
say "4 · Linking the bucket to Firebase"
TOKEN="$(gcloud auth print-access-token)"
LINKED="$(curl -s -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer $TOKEN" \
  "https://firebasestorage.googleapis.com/v1beta/projects/$PROJECT/buckets/$BUCKET")"
if [ "$LINKED" = "200" ]; then
  ok "already linked to Firebase"
else
  RESP="$(curl -s -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{}' \
    "https://firebasestorage.googleapis.com/v1beta/projects/$PROJECT/buckets/$BUCKET:addFirebase")"
  if printf '%s' "$RESP" | grep -q '"error"'; then
    no "addFirebase failed:"
    printf '%s\n' "$RESP" >&2
    exit 1
  fi
  ok "linked to Firebase"
fi

# ── 5 · Rules ───────────────────────────────────────────────────────────────
say "5 · Deploying storage.rules"
firebase target:apply storage consent "$BUCKET" --project "$PROJECT"
firebase deploy --only storage --project "$PROJECT"
ok "rules deployed to gs://$BUCKET"

# ── 6 · What is left, and it is not code ────────────────────────────────────
say "Done. Two settings still to make, both outside this script:"
cat <<EOF

  1. Vercel — the server needs the bucket name:
       vercel env add FIREBASE_STORAGE_BUCKET production
       (paste: $BUCKET)
     then redeploy so the functions pick it up.

  2. src/index.html — window.EDLIGHT_FIREBASE_CONFIG.storageBucket must read
       "$BUCKET"
     It currently names the default bucket, which does not exist.

  Verify afterwards: claim a prize as a minor on a test account and upload a
  file. A refused upload means the rules did not land; a 503
  'storage_not_configured' means Vercel did not get the variable.

EOF
