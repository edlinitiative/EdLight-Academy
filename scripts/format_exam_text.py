#!/usr/bin/env python3
"""
format_exam_text.py
───────────────────
Cleans up exam_catalog.json text formatting in two passes:

Pass 1  (deterministic, no API):
  • Remove duplicated first-line in instructions
  • Normalise whitespace / blank lines
  • Separate the "directive" (e.g. "Read the text… (40%)")
    from the reading passage body using a blank line
  • Strip leading sub-exercise labels from question text
    when the label is already captured in sectionTitle

Pass 2  (Gemini, with --gemini flag):
  • For long instructions (>400 chars), ask Gemini to add
    proper Markdown paragraph breaks and formatting
  • Reads GEMINI_API_KEY from .env file or environment
  • Saves progress every 20 items to avoid data loss
"""

import json, os, re, sys, time, copy, argparse, shutil, textwrap, requests

CATALOG   = "public/exam_catalog.json"
OUTPUT    = "public/exam_catalog.json"
BACKUP    = "public/exam_catalog.json.bak2"

# ─── Load API key from .env or environment ────────────────────────────────────

def load_gemini_key():
    """Read GEMINI_API_KEY from environment or .env file."""
    key = os.environ.get("GEMINI_API_KEY")
    if key:
        return key
    env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line.startswith("GEMINI_API_KEY="):
                    return line.split("=", 1)[1].strip()
    return None

GEMINI_API_KEY = load_gemini_key()
GEMINI_MODEL = "gemini-2.0-flash"

# ─── Helpers ──────────────────────────────────────────────────────────────────

def dedup_first_line(text: str) -> str:
    """If the first non-blank line is repeated verbatim as the second, drop it."""
    lines = text.split("\n")
    stripped = [l.strip() for l in lines]
    non_blank = [(i, s) for i, s in enumerate(stripped) if s]
    if len(non_blank) >= 2:
        i0, s0 = non_blank[0]
        i1, s1 = non_blank[1]
        if s0 == s1:
            # Remove the duplicate (first occurrence)
            lines.pop(i0)
    return "\n".join(lines)


def normalise_whitespace(text: str) -> str:
    """Collapse 3+ consecutive blank lines to 2; strip trailing spaces."""
    text = re.sub(r"[ \t]+$", "", text, flags=re.MULTILINE)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


# Match common directive lines: "Read the text… (40%)" / "Answer… (20 pts)"
_DIRECTIVE_RE = re.compile(
    r"^(.{15,120}(?:\(\d+\s*(?:pts?|%|points?|marks?)\.*\))\s*)$",
    re.IGNORECASE | re.MULTILINE,
)


def separate_directive(text: str) -> str:
    """Ensure a blank line after the directive before the passage body."""
    m = _DIRECTIVE_RE.search(text)
    if not m:
        return text
    end = m.end()
    after = text[end:]
    if after and not after.startswith("\n\n"):
        text = text[:end].rstrip() + "\n\n" + after.lstrip("\n")
    return text


# Strip leading sub-exercise label that's already in the section context
_LABEL_PREFIX_RE = re.compile(
    r"^(?:[A-Z][\.\)]\s*)?(?:(?:Fill|Choose|Complete|Change|Put|Read|Write|Match|"
    r"Answer|Translate|Identify|Turn|Rewrite|Give|Use|Explain|Find|Underline|"
    r"Define|Circle|Correct|Combine|Transform|Classify|List|Name)[^\n]{5,80}"
    r"(?:\(\d+\s*(?:pts?|%|points?|marks?)\.*\))\s*)\n+",
    re.IGNORECASE,
)


def strip_embedded_label(question_text: str) -> str:
    """Remove the repeated exercise-header line from question text."""
    return _LABEL_PREFIX_RE.sub("", question_text, count=1)


# ─── Pass 1: deterministic cleanup ───────────────────────────────────────────

def pass1(exams):
    stats = {"dedup": 0, "directive_sep": 0, "label_strip": 0}

    for exam in exams:
        for sec in exam.get("sections") or []:
            instr = sec.get("instructions") or ""
            original = instr

            instr = dedup_first_line(instr)
            instr = separate_directive(instr)
            instr = normalise_whitespace(instr)

            if instr != original.strip():
                if dedup_first_line(original) != original:
                    stats["dedup"] += 1
                if separate_directive(original) != original:
                    stats["directive_sep"] += 1
                sec["instructions"] = instr

            for q in sec.get("questions") or []:
                qt = q.get("question") or ""
                cleaned = strip_embedded_label(qt)
                if cleaned != qt:
                    q["question"] = cleaned.strip()
                    stats["label_strip"] += 1

    return stats


# ─── Pass 2: Gemini formatting for long passages ─────────────────────────────

GEMINI_PROMPT_TEMPLATE = textwrap.dedent("""\
You are a text formatter for educational exam content displayed on a web platform.

I will give you a section's "instructions" field from an exam JSON. This text often
contains a reading passage mixed with a directive line. Your job is to return
ONLY the improved text (no JSON wrapper, no explanation) with these fixes:

1. Keep the directive line (e.g. "Read the text carefully…") as the FIRST paragraph.
2. Add a blank line before the passage title (if any).
3. Make the passage title a **bold** Markdown heading (use **Title**).
4. Ensure proper paragraph breaks between distinct paragraphs.
5. If there's a "Source:" or attribution line at the end, put it on its own line
   prefixed with *Source:* in italics.
6. Do NOT change any wording, do NOT add commentary, do NOT wrap in code blocks.
7. Preserve ALL original content. Only adjust whitespace and add minimal Markdown.

Here is the text to format:

---
{text}
---

Return ONLY the formatted text.
""")


def call_gemini(prompt, retries=3):
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
    )
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.1, "maxOutputTokens": 4096},
    }
    for attempt in range(retries):
        try:
            r = requests.post(url, json=body, timeout=60)
            if r.status_code == 429:
                wait = 2 ** (attempt + 2)
                print(f"       Rate limited, waiting {wait}s…")
                time.sleep(wait)
                continue
            r.raise_for_status()
            data = r.json()
            parts = data["candidates"][0]["content"]["parts"]
            return parts[0]["text"].strip()
        except Exception as exc:
            if attempt < retries - 1:
                time.sleep(2)
            else:
                print(f"       ❌ Gemini error: {exc}")
                return None
    return None


def save_progress(exams, path=OUTPUT):
    """Intermediate save so we don't lose work on interruption."""
    with open(path, "w", encoding="utf-8") as f:
        json.dump(exams, f, ensure_ascii=False, indent=2)


def pass2_gemini(exams, dry_run=False, limit=0):
    """Use Gemini to reformat long instructions (reading passages)."""
    if not GEMINI_API_KEY:
        print("  ⚠️  No GEMINI_API_KEY found in .env or environment — skipping Pass 2")
        return {"gemini_targets": 0, "gemini_success": 0, "gemini_fail": 0}

    targets = []
    for i, exam in enumerate(exams):
        for si, sec in enumerate((exam.get("sections") or [])):
            instr = (sec.get("instructions") or "").strip()
            if len(instr) > 400:
                targets.append((i, si, sec))

    if limit:
        targets = targets[:limit]

    print(f"\n── Pass 2: Gemini formatting ({len(targets)} long instructions) ──")
    if dry_run:
        print("  (dry-run mode — skipping API calls)")
        return {"gemini_targets": len(targets), "gemini_success": 0, "gemini_fail": 0}

    success = fail = 0
    for idx, (ei, si, sec) in enumerate(targets):
        instr = sec["instructions"]
        title = (sec.get("section_title") or "?")[:60]
        print(f"  [{idx+1}/{len(targets)}] exam {ei} §{si}: {title} ({len(instr)} chars)", end=" ", flush=True)

        prompt = GEMINI_PROMPT_TEMPLATE.format(text=instr)
        result = call_gemini(prompt)

        if result and len(result) > len(instr) * 0.5:
            # Sanity: result shouldn't be drastically shorter
            sec["instructions"] = result
            success += 1
            print("✅")
        else:
            fail += 1
            print("❌")

        # Save progress every 20 items
        if (idx + 1) % 20 == 0:
            save_progress(exams)
            print(f"  💾 Progress saved ({idx+1}/{len(targets)})")

        # Rate-limit: Tier 1 allows ~2000 req/min, minimal delay needed
        if idx < len(targets) - 1:
            time.sleep(0.3)

    print(f"\n  ✅ Success: {success}")
    print(f"  ❌ Failed:  {fail}")
    return {"gemini_targets": len(targets), "gemini_success": success, "gemini_fail": fail}


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Format exam_catalog.json text")
    parser.add_argument("--gemini", action="store_true", help="Run Gemini pass for long passages")
    parser.add_argument("--dry-run", action="store_true", help="Show what Gemini would do without calling API")
    parser.add_argument("--limit", type=int, default=0, help="Limit Gemini to first N targets (for testing)")
    args = parser.parse_args()

    print("Loading exam catalog…")
    with open(CATALOG, encoding="utf-8") as f:
        exams = json.load(f)
    print(f"  {len(exams)} exams loaded")

    # Backup
    if os.path.exists(CATALOG):
        shutil.copy2(CATALOG, BACKUP)
        print(f"  Backup → {BACKUP}")

    # Pass 1
    print("\n── Pass 1: Deterministic cleanup ──")
    stats1 = pass1(exams)
    print(f"  Deduplicated first-line: {stats1['dedup']}")
    print(f"  Directive separated:     {stats1['directive_sep']}")
    print(f"  Question label stripped:  {stats1['label_strip']}")

    # Pass 2 (optional)
    if args.gemini:
        pass2_gemini(exams, dry_run=args.dry_run, limit=args.limit)

    # Save
    print("\n── Saving ──")
    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(exams, f, ensure_ascii=False, indent=2)
    size = os.path.getsize(OUTPUT)
    print(f"  Written to {OUTPUT} ({size / 1024 / 1024:.1f} MB)")
    print("  Done ✓")


if __name__ == "__main__":
    main()
