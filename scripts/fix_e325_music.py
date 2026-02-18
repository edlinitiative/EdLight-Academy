import json

with open('public/exam_catalog.json', 'r') as f:
    data = json.load(f)

exam = data[325]
fixed = 0
for si, sec in enumerate(exam.get('sections', [])):
    for qi, q in enumerate(sec.get('questions', [])):
        for field in ('question', 'model_answer', 'scaffold_text'):
            val = q.get(field, '') or ''
            # \text was mangled: \t became literal tab (chr 9)
            flat_b = '$^\text{b}$'   # contains literal tab
            flat_sharp = '$^\text{#}$'  # contains literal tab
            # Also handle $^\flat$ and $^\#$ variants
            needs_fix = any(p in val for p in [flat_b, flat_sharp, '$^\\flat$', '$^\\#$'])
            if needs_fix:
                new_val = (val
                    .replace(flat_b, '\u266D')
                    .replace(flat_sharp, '\u266F')
                    .replace('$^\\flat$', '\u266D')
                    .replace('$^\\#$', '\u266F')
                )
                q[field] = new_val
                fixed += 1
                print(f"Fixed S{si}Q{qi} field={field}")
                print(f"  Before: {repr(val[:120])}")
                print(f"  After:  {repr(new_val[:120])}")

print(f"\nTotal fixes: {fixed}")

with open('public/exam_catalog.json', 'w') as f:
    json.dump(data, f, ensure_ascii=False)
print("Saved!")
