#!/usr/bin/env python3
"""
fix_exam_structure.py
─────────────────────
Uses Google Gemini to inspect and fix structural issues in exam_catalog.json.

Issues targeted:
  1. Duplicate section titles (subsections flattened)
  2. Instructions used as section titles (>80 chars)
  3. Bare labels (just "I", "A", "1" etc.)
  4. Too many sections (>10, often multiple exams merged)
  5. Null section titles
  6. Empty sections (0 questions, usually "Consignes")

For simple issues (null titles, empty sections only), fixes are applied
programmatically. Complex issues are sent to Gemini for restructuring.
"""

import json
import os
import sys
import time
import re
import copy
import requests

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "AIzaSyAcAXA91ta8NUPsGgmz7rLWDFdh61i1psM")
GEMINI_MODEL = "gemini-2.5-flash"
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"

CATALOG_PATH = "public/exam_catalog.json"
OUTPUT_PATH = "public/exam_catalog.json"
BACKUP_PATH = "public/exam_catalog.json.bak"

# ─── Helpers ──────────────────────────────────────────────────────────────────

def classify_exam(i, exam):
    """Return set of issue types for an exam."""
    sections = exam.get("sections") or []
    issues = set()
    
    if len(sections) > 10:
        issues.add("too_many")
    
    if any(s.get("section_title") is None for s in sections):
        issues.add("null_titles")
    
    if any(s.get("section_title") and len(s["section_title"]) > 80 for s in sections):
        issues.add("long_titles")
    
    titles = [s.get("section_title") for s in sections if s.get("section_title")]
    if len(titles) != len(set(titles)):
        issues.add("duplicate_titles")
    
    bare = [t for t in titles if t and t.strip() in
            ["I","II","III","IV","V","VI","A","B","C","D","E","F",
             "1","2","3","4","5","6","7","8","9","10"]]
    if bare:
        issues.add("bare_labels")
    
    if any(not (s.get("questions") or []) for s in sections):
        issues.add("empty_sections")
    
    return issues


def simple_fix(exam):
    """Apply programmatic fixes for simple issues (null titles, empty sections)."""
    exam = copy.deepcopy(exam)
    sections = exam.get("sections") or []
    fixed = []
    
    for idx, sec in enumerate(sections):
        questions = sec.get("questions") or []
        title = sec.get("section_title")
        
        # Remove truly empty sections with no questions (like "Consignes" with 0 qs)
        if not questions:
            # Keep if it has meaningful instructions that should be a preamble
            if sec.get("instructions"):
                # Merge instructions into next section
                if idx + 1 < len(sections):
                    next_sec = sections[idx + 1]
                    existing = next_sec.get("instructions") or ""
                    preamble = sec.get("instructions", "")
                    if existing:
                        next_sec["instructions"] = preamble + "\n\n" + existing
                    else:
                        next_sec["instructions"] = preamble
                    # Also carry the title if next section has none
                    if not next_sec.get("section_title") and title:
                        next_sec["section_title"] = title
            continue  # Skip empty section
        
        # Fix null section titles
        if title is None:
            title = f"Section {idx + 1}"
            sec["section_title"] = title
        
        fixed.append(sec)
    
    exam["sections"] = fixed
    return exam


def call_gemini(prompt, max_retries=3):
    """Call Gemini API with retry logic."""
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 65536,
            "responseMimeType": "application/json",
        }
    }
    
    for attempt in range(max_retries):
        try:
            resp = requests.post(GEMINI_URL, json=payload, timeout=120)
            if resp.status_code == 429:
                wait = min(60, 2 ** (attempt + 2))
                print(f"    Rate limited, waiting {wait}s...")
                time.sleep(wait)
                continue
            resp.raise_for_status()
            
            data = resp.json()
            text = data["candidates"][0]["content"]["parts"][0]["text"]
            return text
        except Exception as e:
            if attempt < max_retries - 1:
                wait = 2 ** (attempt + 1)
                print(f"    Error: {e}, retrying in {wait}s...")
                time.sleep(wait)
            else:
                raise
    return None


def build_gemini_prompt(exam, exam_index, issues):
    """Build the prompt for Gemini to restructure an exam."""
    
    # Build a compact representation (no need to send full question text for structure analysis)
    compact_sections = []
    for sec in exam.get("sections", []):
        qs = sec.get("questions") or []
        q_summary = []
        for q in qs:
            q_summary.append({
                "number": q.get("number"),
                "type": q.get("type"),
                "question_preview": (q.get("question") or "")[:120],
                "has_options": bool(q.get("options")),
                "has_correct": bool(q.get("correct")),
                "points": q.get("points"),
            })
        compact_sections.append({
            "section_title": sec.get("section_title"),
            "instructions": sec.get("instructions"),
            "question_count": len(qs),
            "questions_preview": q_summary,
        })
    
    issues_text = ", ".join(issues)
    
    prompt = f"""You are restructuring an exam from Haiti's education system (MENFP).
The exam JSON has structural issues: {issues_text}.

EXAM METADATA:
- Title: {exam.get('exam_title')}
- Level: {exam.get('level')}
- Subject: {exam.get('subject')}
- Year: {exam.get('year')}
- Index: {exam_index}

CURRENT SECTIONS:
{json.dumps(compact_sections, ensure_ascii=False, indent=2)}

YOUR TASK:
Analyze the section structure and return a JSON object with a "section_plan" array.
Each entry in section_plan should map current sections to a better structure.

Rules:
1. If sections with the same title appear multiple times (e.g. "II. Compétence linguistique" x3), they are SUBSECTIONS. Merge them under one parent section with subsection labels like "A.", "B.", "C." prepended to each question group. Rename the parent to include a subsection note.
   - Example: 3 sections all named "II. Compétence linguistique" → keep as one section "II. Compétence linguistique" but give instructions noting there are parts A, B, C.

2. If section titles are >80 characters, they are probably INSTRUCTIONS, not titles. Create a proper short title and move the text to instructions.
   - Example: "Correct mistakes whenever necessary." → title: "Correction d'erreurs", instructions: "Correct mistakes whenever necessary."

3. If section titles are bare labels like "I", "A", "1", try to infer a meaningful title from the question content, or create a descriptive one like "Partie A" or "Section I".

4. If there are WAY too many sections (>15), some may be multiple exams merged into one. In that case, note "SPLIT_RECOMMENDED" in the plan. But still restructure the sections as best you can.

5. Empty sections (0 questions) with instructions should have their instructions merged into the next section.

6. Null section titles should get meaningful names based on question content/type.

Return ONLY this JSON structure:
{{
  "analysis": "Brief description of what was wrong and what you fixed",
  "split_recommended": false,
  "section_plan": [
    {{
      "original_indices": [0],  // which original section indices to include
      "new_title": "I. Reading Comprehension",
      "new_instructions": "Read the passage and answer the questions.",
      "merge_strategy": "keep"  // "keep", "merge_into_previous", "rename_only"
    }}
  ]
}}

The section_plan must account for ALL original sections (every index from 0 to {len(compact_sections) - 1}).
"merge_into_previous" means fold those questions into the previous section_plan entry.
"keep" means output as a standalone section with the new title.
"rename_only" means just rename the title but keep it separate.
"""
    return prompt


def apply_gemini_plan(exam, plan):
    """Apply the Gemini-generated section plan to restructure the exam."""
    exam = copy.deepcopy(exam)
    original_sections = exam.get("sections", [])
    section_plan = plan.get("section_plan", [])
    
    if not section_plan:
        return exam
    
    new_sections = []
    
    for entry in section_plan:
        indices = entry.get("original_indices", [])
        new_title = entry.get("new_title", "Section")
        new_instructions = entry.get("new_instructions")
        strategy = entry.get("merge_strategy", "keep")
        
        if strategy == "merge_into_previous" and new_sections:
            # Merge questions into the last section
            for idx in indices:
                if idx < len(original_sections):
                    orig = original_sections[idx]
                    qs = orig.get("questions") or []
                    new_sections[-1]["questions"].extend(qs)
                    # Append instructions if any
                    if orig.get("instructions"):
                        existing = new_sections[-1].get("instructions") or ""
                        if existing:
                            new_sections[-1]["instructions"] = existing + "\n\n" + orig["instructions"]
                        else:
                            new_sections[-1]["instructions"] = orig["instructions"]
            continue
        
        # Collect all questions from the referenced original sections
        all_questions = []
        combined_instructions = []
        
        for idx in indices:
            if idx < len(original_sections):
                orig = original_sections[idx]
                qs = orig.get("questions") or []
                all_questions.extend(qs)
                if orig.get("instructions"):
                    combined_instructions.append(orig["instructions"])
        
        # Build the new section
        final_instructions = new_instructions
        if combined_instructions:
            orig_inst = "\n\n".join(combined_instructions)
            if final_instructions:
                final_instructions = final_instructions + "\n\n" + orig_inst
            else:
                final_instructions = orig_inst
        
        new_sec = {
            "section_title": new_title,
            "instructions": final_instructions,
            "questions": all_questions,
        }
        new_sections.append(new_sec)
    
    exam["sections"] = new_sections
    return exam


def count_questions(exam):
    """Count total questions in an exam."""
    total = 0
    for sec in exam.get("sections") or []:
        total += len(sec.get("questions") or [])
    return total


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("Loading exam catalog...")
    with open(CATALOG_PATH) as f:
        exams = json.load(f)
    
    print(f"Loaded {len(exams)} exams")
    
    # Classify all exams
    simple_indices = []
    gemini_indices = []
    ok_indices = []
    
    for i, exam in enumerate(exams):
        issues = classify_exam(i, exam)
        if not issues:
            ok_indices.append(i)
        elif issues & {"too_many", "duplicate_titles", "bare_labels", "long_titles"}:
            gemini_indices.append((i, issues))
        else:
            simple_indices.append((i, issues))
    
    print(f"\n  ✅ OK: {len(ok_indices)}")
    print(f"  🔧 Simple fixes: {len(simple_indices)}")
    print(f"  🤖 Need Gemini: {len(gemini_indices)}")
    
    # ── Phase 1: Simple programmatic fixes ────────────────────────────────────
    print("\n── Phase 1: Applying simple fixes ──")
    simple_fixed = 0
    for i, issues in simple_indices:
        original_q = count_questions(exams[i])
        exams[i] = simple_fix(exams[i])
        new_q = count_questions(exams[i])
        if original_q != new_q:
            print(f"  ⚠️  [{i}] Question count changed: {original_q} → {new_q}")
        simple_fixed += 1
    print(f"  Fixed {simple_fixed} exams programmatically")
    
    # ── Phase 2: Gemini-powered restructuring ─────────────────────────────────
    print(f"\n── Phase 2: Gemini restructuring ({len(gemini_indices)} exams) ──")
    
    gemini_success = 0
    gemini_fail = 0
    
    for batch_num, (i, issues) in enumerate(gemini_indices):
        exam = exams[i]
        title = (exam.get("exam_title") or "?")[:60]
        n_sections = len(exam.get("sections") or [])
        n_questions = count_questions(exam)
        
        print(f"\n  [{i}] {title}")
        print(f"       {n_sections} sections, {n_questions} questions | Issues: {issues}")
        
        try:
            prompt = build_gemini_prompt(exam, i, issues)
            response_text = call_gemini(prompt)
            
            if not response_text:
                print(f"       ❌ Empty Gemini response")
                gemini_fail += 1
                # Fall back to simple fix
                exams[i] = simple_fix(exam)
                continue
            
            # Parse JSON response
            try:
                plan = json.loads(response_text)
            except json.JSONDecodeError:
                # Try to extract JSON from markdown code blocks
                match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', response_text, re.DOTALL)
                if match:
                    plan = json.loads(match.group(1))
                else:
                    print(f"       ❌ Could not parse Gemini response")
                    gemini_fail += 1
                    exams[i] = simple_fix(exam)
                    continue
            
            analysis = plan.get("analysis", "No analysis")
            split = plan.get("split_recommended", False)
            
            print(f"       Analysis: {analysis[:100]}")
            if split:
                print(f"       ⚠️  Split recommended (keeping merged for now)")
            
            # Apply the plan
            restructured = apply_gemini_plan(exam, plan)
            new_q = count_questions(restructured)
            new_secs = len(restructured.get("sections", []))
            
            if new_q != n_questions:
                print(f"       ⚠️  Question count changed: {n_questions} → {new_q}! Using original + simple fix.")
                exams[i] = simple_fix(exam)
            else:
                exams[i] = restructured
                print(f"       ✅ {n_sections} → {new_secs} sections, {new_q} questions preserved")
                gemini_success += 1
            
        except Exception as e:
            print(f"       ❌ Error: {e}")
            gemini_fail += 1
            exams[i] = simple_fix(exam)
        
        # Rate limit: small delay between calls
        if batch_num < len(gemini_indices) - 1:
            time.sleep(1)
    
    print(f"\n── Gemini Results ──")
    print(f"  ✅ Success: {gemini_success}")
    print(f"  ❌ Failed (fell back to simple fix): {gemini_fail}")
    
    # ── Phase 3: Final validation ─────────────────────────────────────────────
    print("\n── Phase 3: Final validation ──")
    
    total_orig = sum(count_questions(e) for e in exams)
    
    # Check all exams have sections
    no_sections = sum(1 for e in exams if not (e.get("sections") or []))
    null_titles_remaining = 0
    empty_sections_remaining = 0
    
    for e in exams:
        for s in e.get("sections") or []:
            if s.get("section_title") is None:
                null_titles_remaining += 1
            if not (s.get("questions") or []):
                empty_sections_remaining += 1
    
    print(f"  Total questions across all exams: {total_orig}")
    print(f"  Exams with no sections: {no_sections}")
    print(f"  Remaining null section titles: {null_titles_remaining}")
    print(f"  Remaining empty sections: {empty_sections_remaining}")
    
    # ── Save ──────────────────────────────────────────────────────────────────
    print(f"\n── Saving ──")
    
    # Backup
    import shutil
    if os.path.exists(CATALOG_PATH):
        shutil.copy2(CATALOG_PATH, BACKUP_PATH)
        print(f"  Backup saved to {BACKUP_PATH}")
    
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(exams, f, ensure_ascii=False, indent=2)
    
    file_size = os.path.getsize(OUTPUT_PATH)
    print(f"  Saved to {OUTPUT_PATH} ({file_size / 1024 / 1024:.1f} MB)")
    print("\n✅ Done!")


if __name__ == "__main__":
    main()
