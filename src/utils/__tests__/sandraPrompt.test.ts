import {
  buildSandraSystemPrompt,
  SANDRA_LIMITS,
  type KbChunk,
  type PageContext,
} from '../../../api/_lib/sandraPrompt';

const lessonChunk: KbChunk = {
  text: 'Leçon: Les fonctions dérivées — objectifs: calculer la dérivée d\'un polynôme.',
  courseId: 'math-ns4',
  level: 'NS4',
  subject: 'Mathématiques',
  type: 'lesson',
  sourceId: 'course:math-ns4:lesson:derivees',
};

const quizChunk: KbChunk = {
  text: 'Question: Quelle est la dérivée de x² ? Réponse correcte: 2x.',
  courseId: 'math-ns4',
  level: 'NS4',
  subject: 'Mathématiques',
  type: 'quiz',
  sourceId: 'quiz:math-ns4:q12',
};

const examChunk: KbChunk = {
  text: 'Énoncé: Étudier les variations de f(x) = x³ - 3x. Démarche: dériver puis étudier le signe.',
  courseId: 'math-ns4',
  level: 'NS4',
  subject: 'Mathématiques',
  type: 'exam',
  sourceId: 'exam:bac-2024:q3',
};

describe('SANDRA_LIMITS', () => {
  it('exposes the shared limits contract', () => {
    expect(SANDRA_LIMITS).toEqual({
      maxMessageChars: 2000,
      historyTurns: 12,
      conversationCap: 100,
      topK: 6,
    });
  });
});

describe('buildSandraSystemPrompt', () => {
  it('includes the Sandra persona (name, EdLight Academy, NS level)', () => {
    const p = buildSandraSystemPrompt({ lang: 'fr', chunks: [] });
    expect(p).toContain('Sandra');
    expect(p).toContain('EdLight Academy');
    expect(p).toMatch(/NS/);
  });

  it('always states the base pedagogy rule (guide, do not hand out answers)', () => {
    const p = buildSandraSystemPrompt({ lang: 'fr', chunks: [] });
    expect(p).toContain('démarche');
    expect(p).toMatch(/ne donne jamais directement la réponse finale/i);
  });

  it('adds the graded-material warning when a chunk is a quiz', () => {
    const p = buildSandraSystemPrompt({ lang: 'fr', chunks: [quizChunk] });
    expect(p).toContain('[quiz]');
    expect(p).toMatch(/marqués \[quiz\] ou \[exam\]/);
    expect(p).toMatch(/matériel noté/i);
  });

  it('adds the graded-material warning when a chunk is an exam', () => {
    const p = buildSandraSystemPrompt({ lang: 'fr', chunks: [examChunk] });
    expect(p).toContain('[exam]');
    expect(p).toMatch(/marqués \[quiz\] ou \[exam\]/);
  });

  it('omits the graded-material warning when all chunks are lessons', () => {
    const p = buildSandraSystemPrompt({ lang: 'fr', chunks: [lessonChunk] });
    expect(p).not.toMatch(/marqués \[quiz\] ou \[exam\]/);
  });

  it('lists every chunk text under the "Contenu du cours" section with [type] tags', () => {
    const p = buildSandraSystemPrompt({ lang: 'fr', chunks: [lessonChunk, quizChunk, examChunk] });
    expect(p).toContain('Contenu du cours (référence)');
    expect(p).toContain(lessonChunk.text);
    expect(p).toContain(quizChunk.text);
    expect(p).toContain(examChunk.text);
    expect(p).toContain('1. [lesson]');
    expect(p).toContain('2. [quiz]');
    expect(p).toContain('3. [exam]');
  });

  it('includes the page context section when page.courseId is given', () => {
    const page: PageContext = { path: '/courses/math-ns4', courseId: 'math-ns4', lessonId: 'derivees' };
    const p = buildSandraSystemPrompt({ lang: 'fr', page, chunks: [] });
    expect(p).toContain('Contexte de la page');
    expect(p).toContain('math-ns4');
    expect(p).toContain('derivees');
    expect(p).toContain('/courses/math-ns4');
  });

  it('omits the page context section when no page is given', () => {
    const p = buildSandraSystemPrompt({ lang: 'fr', chunks: [] });
    expect(p).not.toContain('Contexte de la page');
  });

  it('instructs replying in French and mirroring Creole', () => {
    const p = buildSandraSystemPrompt({ lang: 'fr', chunks: [] });
    expect(p).toMatch(/réponds en français/i);
    expect(p).toMatch(/créole/i);
  });

  it('forces a Creole opener when lang is ht', () => {
    const ht = buildSandraSystemPrompt({ lang: 'ht', chunks: [] });
    expect(ht).toMatch(/commence ta réponse en créole haïtien/i);
    const fr = buildSandraSystemPrompt({ lang: 'fr', chunks: [] });
    expect(fr).not.toMatch(/commence ta réponse en créole haïtien/i);
  });

  it('always includes the platform FAQ with every route', () => {
    const p = buildSandraSystemPrompt({ lang: 'fr', chunks: [] });
    for (const route of ['/courses', '/exams', '/quizzes', '/dashboard', '/profile', '/contact']) {
      expect(p).toContain(route);
    }
  });

  it('teaches the study-plan and mock-exam features with markdown links', () => {
    const p = buildSandraSystemPrompt({ lang: 'fr', chunks: [] });
    expect(p).toContain('[/study-plan](/study-plan)');
    for (const level of ['/exams/9e', '/exams/terminale', '/exams/university']) {
      expect(p).toContain(level);
    }
    expect(p).toContain('markdown');
  });
});
