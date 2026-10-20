import {
  essayKind, planSlots, isStructuralLabel, essayChecklist, expectedIdeas, wordTarget, sujetKeyTerms, countWords,
} from '../../../../shared/essayWorkshop';

const philo = {
  type: 'essay',
  points: 20,
  question: "Suffit-il d'obéir à la raison pour être libre ?",
  answer_parts: [
    { label: 'La raison est-elle suffisante pour la liberté?', answer: 'La raison est-elle suffisante pour la liberté?' },
    { label: 'Thèse', answer: 'La raison permet de distinguer le bien du mal' },
    { label: 'Conclusion', answer: 'La liberté demande plus que la raison' },
  ],
};
const histoire = {
  type: 'essay',
  points: 10,
  question: 'Expliquez les causes de la chute de Duvalier.',
  answer_parts: [{ label: 'Crise économique', answer: 'Inflation et chômage' }, { label: 'Répression politique', answer: 'Les tontons macoutes' }],
};

describe('essay workshop rules', () => {
  it('picks the essay kind from the subject', () => {
    expect(essayKind(philo, 'Philosophie')).toBe('dissertation');
    expect(essayKind(histoire, 'Histoire-Géo')).toBe('histoire');
    expect(essayKind({ question: 'Write a letter' }, 'Anglais')).toBe('langue');
    expect(essayKind({ question: 'Bay opinyon ou' }, 'Kreyòl')).toBe('argumentatif');
  });

  it('builds the plan from STRUCTURE only — never the expected ideas', () => {
    const labels = planSlots(histoire, 'Histoire-Géo').map((s) => s.label.fr);
    expect(labels).toEqual(['Introduction', 'Contexte', 'Causes', 'Conséquences', 'Conclusion']);
    const all = JSON.stringify(planSlots(philo, 'Philosophie'));
    expect(all).not.toMatch(/distinguer le bien du mal|Inflation|macoutes/);
  });

  it('tells structural labels from content labels', () => {
    expect(isStructuralLabel('Thèse principale')).toBe(true);
    expect(isStructuralLabel('Conclusion')).toBe(true);
    expect(isStructuralLabel('Crise économique')).toBe(false);
  });

  it('reveals content ideas with their label, structural ones without', () => {
    expect(expectedIdeas(histoire)).toEqual([
      { label: 'Crise économique', idea: 'Inflation et chômage' },
      { label: 'Répression politique', idea: 'Les tontons macoutes' },
    ]);
    expect(expectedIdeas(philo)[1]).toEqual({ label: '', idea: 'La raison permet de distinguer le bien du mal' });
  });

  it('scales the word target with points', () => {
    expect(wordTarget(philo)).toBe(350);
    expect(wordTarget(histoire)).toBe(220);
  });

  it('checks the draft honestly', () => {
    const para = 'La raison guide nos choix et nous libère des passions qui nous dominent sans que nous le sachions vraiment.';
    const text = [para, `Cependant, ${para}`, `De plus, ${para}`, `En conclusion, donc, ${para}`].join('\n\n');
    const c = Object.fromEntries(essayChecklist(text, philo, 'Philosophie').map((x) => [x.key, x.ok]));
    expect(c).toMatchObject({ intro: true, paragraphs: true, connectors: true, conclusion: true });
    expect(c.length).toBe(countWords(text) >= 245);
    expect(essayChecklist('', philo, 'Philosophie').every((x) => !x.ok)).toBe(true);
  });

  it('highlights the sujet’s key words', () => {
    expect(sujetKeyTerms(philo)).toEqual(expect.arrayContaining(['raison', 'libre']));
  });
});
