#!/usr/bin/env python3
"""
Deploy Firestore security rules from firestore.rules using the Firebase Rules
REST API with a service-account credential.

Companion to deploy_firestore_indexes.py. It exists for the same reason:
`firebase deploy --only firestore:rules` fails on this project's Admin SDK
service account because of the Service Usage API-enablement probe. The Firebase
Rules API itself only needs the cloud-platform scope, which the SA has.

Steps:
  1. Create a new ruleset from the local firestore.rules file.
  2. Point the live `cloud.firestore` release at that ruleset (update if it
     already exists, otherwise create it).

Usage:
  GOOGLE_APPLICATION_CREDENTIALS=~/.config/firebase-sa.json \
    python scripts/deploy_firestore_rules.py
"""
import json
import os
import sys

from google.oauth2 import service_account
import google.auth.transport.requests as gt
import requests

PROJECT = "edlight-academy"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RULES_FILE = os.path.join(ROOT, "firestore.rules")
SA = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS",
                    os.path.expanduser("~/.config/firebase-sa.json"))
BASE = f"https://firebaserules.googleapis.com/v1/projects/{PROJECT}"
RELEASE_NAME = f"projects/{PROJECT}/releases/cloud.firestore"


def token():
    creds = service_account.Credentials.from_service_account_file(
        SA, scopes=["https://www.googleapis.com/auth/cloud-platform"])
    creds.refresh(gt.Request())
    return creds.token


def create_ruleset(tok, source):
    body = {"source": {"files": [{"name": "firestore.rules", "content": source}]}}
    r = requests.post(f"{BASE}/rulesets", headers={
        "Authorization": f"Bearer {tok}",
        "Content-Type": "application/json",
    }, data=json.dumps(body))
    if r.status_code >= 400:
        raise RuntimeError(f"create ruleset {r.status_code}: {r.text}")
    return r.json()["name"]


def release(tok, ruleset_name):
    # Try to update the existing release; fall back to creating it.
    upd = requests.patch(
        f"{BASE}/releases/cloud.firestore",
        headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"},
        data=json.dumps({"release": {"name": RELEASE_NAME, "rulesetName": ruleset_name}}),
    )
    if upd.status_code < 400:
        return "updated"
    crt = requests.post(
        f"{BASE}/releases",
        headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"},
        data=json.dumps({"name": RELEASE_NAME, "rulesetName": ruleset_name}),
    )
    if crt.status_code < 400:
        return "created"
    raise RuntimeError(
        f"release update {upd.status_code}: {upd.text}\n"
        f"release create {crt.status_code}: {crt.text}"
    )


def main():
    source = open(RULES_FILE, encoding="utf-8").read()
    tok = token()
    print(f"Project {PROJECT}: publishing {RULES_FILE} ({len(source)} bytes)")
    ruleset_name = create_ruleset(tok, source)
    print(f"  ruleset created: {ruleset_name}")
    action = release(tok, ruleset_name)
    print(f"  cloud.firestore release {action} -> active")
    print("Done.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except RuntimeError as e:
        print(f"FAILED: {e}", file=sys.stderr)
        sys.exit(1)
