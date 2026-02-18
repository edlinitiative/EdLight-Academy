#!/usr/bin/env node
/**
 * Fix temporally-sensitive questions by anchoring them to their time period.
 * Instead of changing answers, we add the year/context INTO the question text
 * so the original answer stays correct and students know the time frame.
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
  console.log(`  ✓ [${examIdx}][${secIdx}][${qIdx}]`);
  console.log(`    Q: ${q.question.substring(0, 90)}`);
  console.log(`    A: ${q.correct}`);
}

console.log('Anchoring temporally-sensitive questions to their exam year…\n');

// ─────────────────────────────────────────────────────────────────────────────
// Exam 200 — Connaissances Générales 2025-2026
// ─────────────────────────────────────────────────────────────────────────────

// Trump opponent: anchor to 2016 election (original exam intent)
fix(200, 0, 21, {
  question: "Comment s'appelle le candidat qui a perdu les élections présidentielles américaines de 2016 face à Donald TRUMP ?",
  correct: "Hillary Clinton",
  temporal_note: "📅 Examen 2025-2026. La question originale disait « dernières joutes américaines » — précisée ici comme l'élection de 2016 (Hillary Clinton). En 2024, c'est Kamala Harris qui a perdu face à Trump.",
  explanation: "Lors de l'élection présidentielle américaine de 2016, Hillary Clinton a perdu face à Donald Trump.",
  hints: [
    "Cette élection a eu lieu en novembre 2016.",
    "Le candidat démocrate était une femme, ancienne secrétaire d'État.",
    "Elle s'appelle Hillary Clinton."
  ],
});

// French PM: anchor to January 2024
fix(200, 0, 4, {
  question: "Comment s'appelait le Premier Ministre français nommé en janvier 2024 ?",
  temporal_note: "📅 Examen 2025-2026. Gabriel Attal a été PM de janvier à septembre 2024. Depuis décembre 2024, c'est François Bayrou.",
  hints: [
    "Il a été nommé par le Président Emmanuel Macron.",
    "Il était le plus jeune Premier Ministre de la Ve République.",
    "Son nom est Gabriel Attal."
  ],
  scaffold_blanks: [
    {
      label: "Nom du Premier Ministre français (janvier 2024)",
      answer: "Gabriel Attal",
      alternatives: []
    }
  ],
  model_answer: "Le Premier Ministre français nommé en janvier 2024 s'appelle Gabriel Attal.",
  answer_parts: [
    {
      label: "Nom du Premier Ministre français (janvier 2024)",
      answer: "Gabriel Attal",
      alternatives: []
    }
  ],
  final_answer: "Gabriel Attal"
});

// FIFA Club World Cup 2025: question already mentions 2025, just update the answer + note
fix(200, 0, 20, {
  // question already says "en 2025" — no change needed
  temporal_note: "📅 Examen 2025-2026. La Coupe du Monde des Clubs FIFA 2025 a eu lieu en juin-juillet 2025 aux États-Unis. Le Real Madrid l'a remportée.",
  hints: [
    "La compétition a eu lieu aux États-Unis en été 2025.",
    "Le club vainqueur est l'un des plus grands clubs européens.",
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

// Haiti–Nicaragua: anchor to the specific match
fix(200, 0, 8, {
  question: "Citez le nom des deux joueurs qui ont marqué lors du match de qualification Haïti contre Nicaragua (éliminatoires Coupe du Monde 2018).",
  temporal_note: "📅 Examen 2025-2026. Match de qualification pour la Coupe du Monde 2018.",
});

// ─────────────────────────────────────────────────────────────────────────────
// Exam 309 — Culture générale 2015-2016
// ─────────────────────────────────────────────────────────────────────────────

// Oldest head of state: anchor to 2015
fix(309, 1, 0, {
  question: "En 2015, qui était le plus ancien Chef d'État en fonction dans le monde ?",
  correct: "ELISABETH II.",
  temporal_note: "📅 Examen 2015-2016. Élisabeth II est décédée le 8 septembre 2022 après 70 ans de règne.",
  hints: [
    "En 2015, elle régnait depuis plus de 60 ans.",
    "Elle était Reine du Royaume-Uni et du Commonwealth.",
    "Il s'agit d'Élisabeth II."
  ],
});

// EU member count: anchor to 2015
fix(309, 4, 21, {
  question: "En 2015, l'Union européenne comptait :",
  correct: "d",
  temporal_note: "📅 Examen 2015-2016. En 2015, l'UE comptait 28 pays. Depuis le Brexit (2020), elle en compte 27.",
  hints: [
    "La Croatie avait rejoint l'UE en 2013, portant le total à 28.",
    "Ce total inclut le Royaume-Uni, qui était encore membre en 2015.",
    "La réponse est 28 pays."
  ],
});

// Francophonie SG: anchor to 2015, revert answer
fix(309, 0, 2, {
  question: "En 2015, comment s'appelait la secrétaire générale de la Francophonie ?",
  correct: "Michaëlle Jean",
  temporal_note: "📅 Examen 2015-2016. Michaëlle Jean a occupé ce poste de 2015 à 2019. Depuis 2019, c'est Louise Mushikiwabo.",
  hints: [
    "Elle est d'origine haïtiano-canadienne.",
    "Elle a été Gouverneure générale du Canada avant ce poste.",
    "Il s'agit de Michaëlle Jean."
  ],
});

// OAS SG: anchor to 2015
fix(309, 1, 11, {
  question: "En 2015, comment s'appelait le secrétaire général de l'OEA ?",
  correct: "Luis Almagro.",
  temporal_note: "📅 Examen 2015-2016. Luis Almagro a été secrétaire général de l'OEA de 2015 à 2025.",
  hints: [
    "Il est d'origine uruguayenne.",
    "Il a pris ses fonctions en mai 2015.",
    "Il s'appelle Luis Almagro."
  ],
});

// ─────────────────────────────────────────────────────────────────────────────
// Exam 72 — Concours d'admission 2023
// ─────────────────────────────────────────────────────────────────────────────

// Paul Biya age: anchor to 2023
fix(72, 1, 6, {
  question: "En 2023, quel était le plus vieux dirigeant élu par son peuple dans le monde et quel âge avait-il ?",
  temporal_note: "📅 Examen 2023. Paul Biya, né le 13 février 1933, avait 90 ans en 2023.",
  scaffold_blanks: [
    { label: "Nom du dirigeant", answer: "Paul Biya", alternatives: [] },
    { label: "Pays du dirigeant", answer: "Cameroun", alternatives: [] },
    { label: "Âge du dirigeant (en 2023)", answer: "90 ans", alternatives: ["91 ans"] }
  ],
  model_answer: "En 2023, le plus vieux dirigeant élu était Paul Biya, président du Cameroun, âgé de 90 ans.",
  answer_parts: [
    { label: "Nom du dirigeant", answer: "Paul Biya", alternatives: [] },
    { label: "Pays du dirigeant", answer: "Cameroun", alternatives: [] },
    { label: "Âge du dirigeant (en 2023)", answer: "90 ans", alternatives: ["91 ans"] }
  ],
  final_answer: "Paul Biya, 90 ans",
});

// ─────────────────────────────────────────────────────────────────────────────
// Exam 151 — FMP 2021
// ─────────────────────────────────────────────────────────────────────────────

// Vice Dean: anchor to 2021
fix(151, 4, 3, {
  question: "En 2021, qui était la Vice Doyenne de la section Pharmacie ?",
  correct: "c",
  temporal_note: "📅 Examen 2021. Les postes administratifs universitaires changent régulièrement.",
});

// Write back
fs.writeFileSync(catalogPath, JSON.stringify(data));
console.log(`\n✅ Anchored ${fixCount} questions to their time period`);
