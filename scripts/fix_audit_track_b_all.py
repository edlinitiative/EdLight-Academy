#!/usr/bin/env python3
"""Track B (all subjects): apply explicit English->French label translations.

Unlike the Mathématiques pilot (scripts/fix_audit_track_b_math.py, which uses
ordered regex RULES), the remaining subjects are translated with *explicit*
per-label override maps — one JSON file per subject group under
``scripts/track_b_overrides/<group>.json`` — produced by reviewing every
candidate label. Explicit maps eliminate any risk of regex mistranslation for
domain vocabulary (chemistry, biology, physics, Spanish, Kreyòl, humanities).

Each override file is a flat object ``{ "<english label>": "<french label>" }``.
Math / scientific notation in the French value is wrapped in ``$...$`` so the
front-end MathText component renders it through KaTeX.

Usage:
    python scripts/fix_audit_track_b_all.py            # dry-run + report
    python scripts/fix_audit_track_b_all.py --apply    # write the catalog
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CATALOG = ROOT / "public" / "exam_catalog.json"
OVERRIDES_DIR = ROOT / "scripts" / "track_b_overrides"

# Subjects already handled by the Math pilot — never re-touched here.
DONE_SUBJECTS = {"Mathématiques"}
# Subjects whose labels are intentionally English / out of scope.
SKIP_SUBJECTS = {"Anglais"}


def load_overrides() -> dict[str, str]:
    """Merge every ``<group>.json`` (skipping ``_input_*`` helper files)."""
    merged: dict[str, str] = {}
    for path in sorted(OVERRIDES_DIR.glob("*.json")):
        if path.name.startswith("_"):
            continue
        raw = json.loads(path.read_text(encoding="utf-8"))
        table = raw.get("overrides", raw) if isinstance(raw, dict) else {}
        for en, fr in table.items():
            if not isinstance(en, str) or not isinstance(fr, str):
                continue
            if en == fr:
                continue  # no-op
            if en in merged and merged[en] != fr:
                print(f"  ! conflicting translation for {en!r}: "
                      f"{merged[en]!r} vs {fr!r} ({path.name})", file=sys.stderr)
            merged[en] = fr
    return merged


def iter_label_holders(data):
    for e in data:
        subj = e.get("subject") or ""
        if subj in DONE_SUBJECTS or subj in SKIP_SUBJECTS or e.get("language") == "en":
            continue
        for sec in e.get("sections") or []:
            for q in sec.get("questions") or []:
                for key in ("scaffold_blanks", "answer_parts"):
                    for p in q.get(key) or []:
                        if isinstance(p, dict) and isinstance(p.get("label"), str):
                            yield subj, p


# --- strict residual-English guardrail (strong signals only) -----------------
_ENGLISH_OF = re.compile(r"\b\w+ of \b", re.I)
_STRONG_EN = re.compile(
    r"\b(of|the|and|with|find|calculate|solve|show|prove|value|values|"
    r"balanced|equation|reaction|compound|mixture|yield|cells?|gene|blood|"
    r"name|number|meaning|definition|opposite|increase|decrease|difference|"
    r"translation|conjugation|verb|noun|sentence|supply|demand|cost|profit)\b",
    re.I,
)
_FR_OK = re.compile(
    r"\b(de|du|des|la|le|les|une?|et|en|pour|avec|dans|sur|au|aux|par|à|"
    r"valeur|valeurs|équation|réaction|composé|mélange|rendement|nombre|nom|"
    r"définition|différence|traduction|conjugaison|verbe|nom|phrase|"
    r"profit|profits|coût|coûts|offre|demande|recette|recettes|"
    r"el|los|las|por|para|con)\b",
    re.I,
)


def residual_english(s: str) -> bool:
    plain = re.sub(r"\$[^$]*\$", " ", s)  # notation inside $...$ is not prose
    if _ENGLISH_OF.search(plain):
        return True
    for w in _STRONG_EN.findall(plain):
        if not _FR_OK.match(w):
            return True
    return False


def katex_issues(s: str) -> list[str]:
    issues: list[str] = []
    if s.count("$") % 2:
        issues.append("odd-$")
    if "\\\\" in s:
        issues.append("double-backslash")
    if s.count("{") != s.count("}"):
        issues.append("brace-mismatch")
    for seg in re.findall(r"\$([^$]*)\$", s):
        if re.search(r"[\^_]-?\d{2,}(?![\d}])", seg):
            issues.append("unbraced-multidigit")
    return issues


def main() -> int:
    apply = "--apply" in sys.argv
    overrides = load_overrides()
    print(f"Loaded {len(overrides)} distinct override translations "
          f"from {OVERRIDES_DIR.name}/")

    data = json.loads(CATALOG.read_text(encoding="utf-8"))

    changed = 0
    by_subject: dict[str, int] = {}
    residuals: dict[str, str] = {}
    katex_bad: list[tuple[str, list[str]]] = []
    for subj, p in iter_label_holders(data):
        before = p["label"]
        after = overrides.get(before, before)
        if after != before:
            p["label"] = after
            changed += 1
            by_subject[subj] = by_subject.get(subj, 0) + 1
            bad = katex_issues(after)
            if bad:
                katex_bad.append((after, bad))
        # whatever the final label is, flag if it still reads English
        if residual_english(after):
            residuals.setdefault(after, subj)

    print(f"Label occurrences rewritten: {changed}")
    print("By subject:")
    for s, n in sorted(by_subject.items(), key=lambda kv: -kv[1]):
        print(f"  {s:32} {n:5d}")

    if katex_bad:
        print(f"\n!! KaTeX structural issues: {len(katex_bad)}")
        for s, b in katex_bad[:30]:
            print(f"   {b} {s!r}")

    print(f"\nResidual English (strict gate): {len(residuals)} distinct")
    for s, subj in sorted(residuals.items())[:80]:
        print(f"   [{subj}] {s!r}")

    if apply:
        if residuals or katex_bad:
            print("\n!! Residual English or KaTeX issues present — ABORTING write.",
                  file=sys.stderr)
            return 1
        CATALOG.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(f"\nWrote {CATALOG.name} ({changed} labels rewritten).")
    else:
        print("\n(dry-run — no file written; pass --apply to write)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
