#!/usr/bin/env node
/**
 * Fix temporally-sensitive questions in exam_catalog.json
 * Adds temporal_note field and corrects outdated answers.
 */

const fs = require('fs');
const path = require('path');

const catalogPath = path.join(__dirname, '..', 'public', 'exam_catalog.json');
const data = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

let fixCount = 0;

function fix(examIdx, secIdx, qIdx, updates) {
  const q = data[examIdx]?.sections?.[secIdx]?.questions?.[qIdx];
  if (!q) {
    console.warn(`  ⚠ Not found: data[${examIdx}].sections[${secIdx}].questions[${qIdx}]`);
    return;
  }
  Object.assign(q, updates);
  fixCount++;
  console.log(`  ✓ [${examIdx}][${secIdx}][${qIdx}] ${(q.question || '').substring(0, 60)}…`);
}

console.log('Fixing temporally-sensitive questions…\n');

// ── 1. Elisabeth II (died Sep 2022) ──────────────────────────────────────────
fix(309, 1, 0, {
  temporal_note: "⚠️ Question datée (2015-2016). La réponse originale était Élisabeth II, décédée le 8 septembre 2022. En 2026, le monarque régnant le plus longtemps est le Sultan de Brunei, Hassanal Bolkiah (depuis 1967).",
  correct: "ELISABETH II.",  // Keep original for grading fidelity
});

// ── 2. Trump's opponent (2016→2024) ─────────────────────────────────────────
fix(200, 0, 21, {
  temporal_note: "⚠️ Question ambiguë. L'examen (2025-2026) dit « dernières joutes américaines ». En 2016 c'était Hillary Clinton ; en 2024, c'était Kamala Harris. La réponse acceptée ici correspond à 2024.",
  correct: "Kamala Harris",
  explanation: "Lors de l'élection présidentielle américaine de 2024, Kamala Harris a perdu face à Donald Trump. L'examen faisait probablement référence aux élections de 2016 (Hillary Clinton), mais « dernières joutes » en 2025 désigne 2024.",
  hints: [
    "Ces élections sont les plus récentes avant la date de l'examen.",
    "Le candidat qui a perdu était la vice-présidente sortante.",
    "Elle fut la première femme vice-présidente des États-Unis."
  ],
});

// ── 3. EU member count (28→27 after Brexit) ────────────────────────────────
fix(309, 4, 21, {
  temporal_note: "⚠️ Question datée (2015-2016). À cette époque, l'UE comptait 28 pays. Depuis le Brexit (31 janvier 2020), l'UE compte 27 États membres. La réponse « d) 28 pays » était correcte en 2015, mais ne l'est plus.",
  correct: "d",  // Keep original — the MCQ options haven't changed
});

// ── 4. French PM (Gabriel Attal → François Bayrou) ─────────────────────────
fix(200, 0, 4, {
  temporal_note: "⚠️ Réponse susceptible de changer. Gabriel Attal était Premier Ministre de janvier à septembre 2024. Depuis décembre 2024, le Premier Ministre est François Bayrou.",
  hints: [
    "Le Premier Ministre est le chef du gouvernement français.",
    "Il a été nommé par le Président de la République en décembre 2024.",
    "Son nom est François Bayrou."
  ],
  scaffold_blanks: [
    {
      label: "Nom du Premier Ministre français",
      answer: "François Bayrou",
      alternatives: ["Gabriel Attal"]
    }
  ],
  model_answer: "Le Premier Ministre français s'appelle François Bayrou (depuis décembre 2024). L'examen original mentionnait Gabriel Attal.",
  answer_parts: [
    {
      label: "Nom du Premier Ministre français",
      answer: "François Bayrou",
      alternatives: ["Gabriel Attal"]
    }
  ],
  final_answer: "François Bayrou"
});

// ── 5. FIFA Club World Cup 2025 (now completed) ────────────────────────────
fix(200, 0, 20, {
  temporal_note: "⚠️ Cet événement a eu lieu en juin-juillet 2025. Le Real Madrid a remporté la première édition de la Coupe du Monde des Clubs FIFA 2025.",
  hints: [
    "La compétition a eu lieu aux États-Unis en été 2025.",
    "Le club vainqueur est un grand club européen espagnol.",
    "C'est le Real Madrid."
  ],
  scaffold_blanks: [
    {
      label: "Club vainqueur de la Coupe du Monde des Clubs 2025",
      answer: "Real Madrid",
      alternatives: ["Manchester City"]
    }
  ],
  model_answer: "Le Real Madrid a remporté la première édition de la Coupe du Monde des Clubs FIFA 2025.",
  answer_parts: [
    {
      label: "Club vainqueur",
      answer: "Real Madrid",
      alternatives: ["Manchester City"]
    }
  ],
  final_answer: "Real Madrid"
});

// ── 6. Paul Biya age (91→92+) ───────────────────────────────────────────────
fix(72, 1, 6, {
  temporal_note: "⚠️ Réponse variable selon la date. Paul Biya, né le 13 février 1933, a 93 ans en février 2026. Son statut de « plus vieux dirigeant élu » peut aussi changer.",
});

// ── 7. Francophonie SG (Michaëlle Jean → Louise Mushikiwabo) ────────────────
fix(309, 0, 2, {
  temporal_note: "⚠️ Question datée (2015-2016). Michaëlle Jean était secrétaire générale de 2015 à 2019. Depuis janvier 2019, c'est Louise Mushikiwabo.",
  correct: "Louise Mushikiwabo",
  hints: [
    "La Francophonie est une organisation internationale réunissant des pays francophones.",
    "La secrétaire générale actuelle est d'origine rwandaise.",
    "Elle s'appelle Louise Mushikiwabo, en poste depuis 2019."
  ],
});

// ── 8. OAS Secretary General (Almagro → ended term) ─────────────────────────
fix(309, 1, 11, {
  temporal_note: "⚠️ Question datée (2015-2016). Luis Almagro a été secrétaire général de l'OEA de 2015 à 2025. Vérifiez le titulaire actuel du poste.",
});

// ── 9. Vice Dean of Pharmacy ────────────────────────────────────────────────
fix(151, 4, 3, {
  temporal_note: "⚠️ Question datée. Les postes administratifs universitaires changent régulièrement. La réponse « Magalie Saint Hilaire » correspondait à l'année de l'examen (2021).",
});

// ── 10. Haiti–Nicaragua match (no date) ─────────────────────────────────────
fix(200, 0, 8, {
  temporal_note: "⚠️ Cette question fait référence à un match spécifique sans préciser la date. Les buteurs Duckens Nazon et Carnejy Antoine correspondent au match de qualification 2018.",
});

// Write back
fs.writeFileSync(catalogPath, JSON.stringify(data));
console.log(`\n✅ Fixed ${fixCount} questions in exam_catalog.json`);
