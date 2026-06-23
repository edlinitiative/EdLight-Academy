#!/usr/bin/env python3
"""
Deploy Firestore composite indexes from firestore.indexes.json using the
Firestore Admin REST API with a service-account credential.

This bypasses the `firebase deploy --only firestore:indexes` path, which (with
this project's Admin SDK service account) fails on the Service Usage
API-enablement probe — a permission the SA lacks. The Firestore Admin API
itself only needs the datastore scope, which the SA does have.

It is idempotent: existing equivalent indexes are detected and skipped; only
missing ones are created.

Usage:
  GOOGLE_APPLICATION_CREDENTIALS=~/.config/firebase-sa.json \
    python scripts/deploy_firestore_indexes.py
"""
import json
import os
import sys
import time

from google.oauth2 import service_account
import google.auth.transport.requests as gt
import requests

PROJECT = "edlight-academy"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEXES_FILE = os.path.join(ROOT, "firestore.indexes.json")
SA = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS",
                    os.path.expanduser("~/.config/firebase-sa.json"))
BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)"


def token():
    creds = service_account.Credentials.from_service_account_file(
        SA, scopes=["https://www.googleapis.com/auth/datastore"])
    creds.refresh(gt.Request())
    return creds.token


def field_sig(fields):
    """Normalized comparable signature of an index's fields (excluding __name__)."""
    sig = []
    for f in fields:
        path = f.get("fieldPath")
        if path == "__name__":
            continue
        order = f.get("order")
        arr = f.get("arrayConfig")
        sig.append((path, order or arr))
    return tuple(sig)


def list_existing(tok):
    url = f"{BASE}/collectionGroups/-/indexes"
    out = {}
    r = requests.get(url, headers={"Authorization": f"Bearer {tok}"})
    r.raise_for_status()
    for ix in r.json().get("indexes", []):
        cg = ix["name"].split("/collectionGroups/")[1].split("/indexes/")[0]
        out.setdefault(cg, []).append({
            "sig": field_sig(ix.get("fields", [])),
            "scope": ix.get("queryScope", "COLLECTION"),
            "state": ix.get("state"),
        })
    return out


def create_index(tok, cg, fields, scope="COLLECTION"):
    url = f"{BASE}/collectionGroups/{cg}/indexes"
    body = {"queryScope": scope, "fields": [
        {k: v for k, v in f.items()} for f in fields
    ]}
    r = requests.post(url, headers={
        "Authorization": f"Bearer {tok}",
        "Content-Type": "application/json",
    }, data=json.dumps(body))
    if r.status_code >= 400:
        raise RuntimeError(f"{r.status_code}: {r.text}")
    return r.json()


def main():
    with open(INDEXES_FILE, encoding="utf-8") as f:
        desired = json.load(f).get("indexes", [])

    tok = token()
    existing = list_existing(tok)
    print(f"Project {PROJECT}: {sum(len(v) for v in existing.values())} "
          f"composite index(es) currently live.")

    created = 0
    skipped = 0
    for ix in desired:
        cg = ix["collectionGroup"]
        fields = ix["fields"]
        scope = ix.get("queryScope", "COLLECTION")
        sig = field_sig(fields)
        have = any(e["sig"] == sig and e.get("scope", "COLLECTION") == scope
                   for e in existing.get(cg, []))
        label = ", ".join(f"{p} {o}" for p, o in sig)
        scope_tag = "" if scope == "COLLECTION" else f" ({scope})"
        if have:
            print(f"  ✓ exists  [{cg}]{scope_tag} {label}")
            skipped += 1
            continue
        print(f"  + create  [{cg}]{scope_tag} {label}")
        try:
            create_index(tok, cg, fields, scope)
            created += 1
        except RuntimeError as e:
            # 409 = already exists (race / __name__ variant)
            if "409" in str(e) or "ALREADY_EXISTS" in str(e):
                print(f"    (already exists)")
                skipped += 1
            else:
                print(f"    FAILED: {e}", file=sys.stderr)
                return 1
        time.sleep(0.5)

    print(f"\nDone. created={created}, already-present={skipped}, "
          f"desired={len(desired)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
