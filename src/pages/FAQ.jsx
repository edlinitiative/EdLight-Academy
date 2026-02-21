import React from 'react';
import useStore from '../contexts/store';

const faqsFr = [
  {
    q: 'Comment commencer à apprendre ?',
    a: 'Cliquez sur “Commencer” sur la page d’accueil pour vous connecter, ou explorez les cours pour choisir une matière et un niveau NS. Ouvrez un cours pour suivre les unités et les leçons.'
  },
  {
    q: 'Où trouver des questions de pratique ?',
    a: 'Ouvrez la page Quiz pour la pratique par cours, niveau (NS I–IV) et unité. Dans un cours, vous pouvez aussi faire un “Quiz d’unité — 10 questions” après le dernier sous-chapitre.'
  },
  {
    q: 'Pourquoi n’y a-t-il pas de questions pour mon unité ?',
    a: 'Certaines unités sont encore en cours d’ajout. Essayez une autre unité du même cours ou un autre niveau. De nouvelles questions sont ajoutées régulièrement.'
  },
  {
    q: 'Est-ce que le format mathématique est pris en charge ?',
    a: 'Oui. Les questions et explications s’affichent avec le support mathématique afin que les équations s’affichent correctement.'
  },
  {
    q: 'Comment signaler un problème ou suggérer du contenu ?',
    a: 'Utilisez la page Contact pour nous envoyer un message. Indiquez le cours, l’unité et une brève description de ce dont vous avez besoin.'
  }
];

const faqsHt = [
  {
    q: 'Kijan pou mwen kòmanse aprann?',
    a: 'Klike “Kòmanse aprann” sou paj dakèy la pou konekte, oswa gade kou yo pou chwazi yon matyè ak nivo NS. Louvri yon kou pou swiv inite ak leson yo.'
  },
  {
    q: 'Kote mwen jwenn kesyon pratik yo?',
    a: 'Louvri paj Quiz yo pou pratik pa kou, nivo (NS I–IV), ak inite. Anndan yon kou, ou ka fè “Quiz Inite — 10 Kesyon” apre dènye sou-chapit la.'
  },
  {
    q: 'Poukisa pa gen kesyon pou inite mwen an?',
    a: 'Gen kèk inite nou poko fin ajoute. Esaye yon lòt inite nan menm kou a oswa yon lòt nivo. Nou ajoute nouvo kesyon regilyèman.'
  },
  {
    q: 'Èske nou sipòte ekriti matematik?',
    a: 'Wi. Kesyon ak eksplikasyon yo gen sipò pou fòmil matematik pou ekwasyon yo parèt byen.'
  },
  {
    q: 'Kijan pou mwen rapòte yon pwoblèm oswa pwopoze kontni?',
    a: 'Sèvi ak paj Kontak la pou voye yon mesaj. Mete kou a, inite a, epi yon ti deskripsyon sou sa ou bezwen an.'
  }
];

export default function FAQ() {
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const faqs = isCreole ? faqsHt : faqsFr;

  return (
    <section className="section">
      <div className="container">
        <div className="page-header">
          <div>
            <span className="page-header__eyebrow">{isCreole ? 'Repons rapid' : 'Réponses rapides'}</span>
            <h1>{isCreole ? 'Kesyon yo poze souvan (FAQ)' : 'Foire aux questions (FAQ)'}</h1>
            <p className="text-muted">
              {isCreole
                ? 'Repons pou kesyon moun poze sou kou yo, pratik, ak kòmanse.'
                : 'Réponses aux questions fréquentes sur les cours, la pratique et le démarrage.'}
            </p>
          </div>
        </div>

        <div className="grid" style={{ gap: '0.75rem' }}>
          {faqs.map((item, idx) => (
            <details key={idx} className="card" style={{ padding: '1rem' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{item.q}</summary>
              <p className="text-muted" style={{ marginTop: '0.75rem' }}>{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
