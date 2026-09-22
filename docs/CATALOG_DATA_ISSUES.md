# Catalogue data issues — backlog

Known **content/data** problems in the `courses` Firestore collection (not UI
bugs). These need a data fix or a migration pass, not a React change.

`public/catalog.json` is a straight dump of that collection
(`scripts/export_catalog.mjs`), so anything wrong here is wrong in production
for both web and mobile — re-exporting will not fix it. Surfaced September 2026
while building unit-level UI on /courses.

---

## 1. `math-ns4` is tagged as level `ns3`

**What:** The course `math-ns4` ("Mathématiques NS4") carries
`level_id: 'ns3'`. Mathématiques therefore has **two NS3 entries and no NS4**.

```
math-ns1 | level_id: ns1 | Mathématiques NS1
math-ns2 | level_id: ns2 | Mathématiques NS2
math-ns3 | level_id: ns3 | Mathématiques NS3
math-ns4 | level_id: ns3 | Mathématiques NS4   ← wrong
```

**Why it matters beyond cosmetics:** any UI that groups by level renders two
identical "NS3" rows and silently drops NS4 (33 lessons). It also breaks
grade-appropriate matching — an NS4 student is not matched to `math-ns4` by
`gradeProfile()`, which is the mechanism the whole grade-led catalogue and
practice emphasis relies on.

**Status:** _Not fixed._ UI derives the level from the course `id` when
`level_id` disagrees, so the display is correct, but the underlying document is
still wrong and anything else reading `level_id` is still wrong with it.

**Fix:** set `level_id: 'ns4'` on `courses/math-ns4` in Firestore, then re-run
`scripts/export_catalog.mjs`.

---

## 2. `phys-ns2` units are duplicated

**What:** Each chapter appears as several separate unit documents of 2 lessons
each, instead of one unit holding all its lessons:

```
Chapitre 1: Lumière et optique · 2 leçons     ×5
Chapitre 2: Circuits électriques · 2 leçons   ×5
Chapitre 3: Électrostatique · 2 leçons        ×4
Chapitre 4: Magnétisme · 2 leçons             ×4
Chapitre 5: Énergie et transformations · 2 leçons ×4
```

It looks like the importer created one unit per pair of lessons and reused the
chapter title, rather than grouping lessons under their chapter.

**Why it matters:** a unit-level UI shows five identical "Chapitre 1" rows.
Lower urgency than #1 only because all four Physique courses are still
`coming_soon` — but it must be fixed **before Physique launches**, and the same
importer may have produced the same shape in `phys-ns1/3/4`, which should be
checked at the same time.

**Status:** _Not fixed, not worked around._

---

## 3. Physique is authored but entirely unlaunched

**What:** All four Physique courses carry `coming_soon: true`. 151 lessons are
authored and none are live. Real live totals are therefore **331 lessons across
3 subjects**, not 4.

**Why it is here:** not a bug — recorded because several mockups and drafts have
quoted Physique lesson counts as though the subject were live, and because the
launch is the natural moment to fix #2 above.
