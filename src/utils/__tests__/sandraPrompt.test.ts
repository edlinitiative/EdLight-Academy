import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

  it('always teaches every Sandra tool by name', () => {
    const p = buildSandraSystemPrompt({ lang: 'fr', chunks: [] });
    for (const tool of ['get_student_progress', 'recommend_exams', 'save_study_plan', 'email_study_plan']) {
      expect(p).toContain(tool);
    }
  });

  it('teaches email_study_plan: explicit request only, needs a plan, check inbox+spam, ics attachment', () => {
    const p = buildSandraSystemPrompt({ lang: 'fr', chunks: [] });
    expect(p).toMatch(/email_study_plan[\s\S]*explicitement/i);
    expect(p).toMatch(/email_study_plan[\s\S]*plan existe déjà/i);
    expect(p).toMatch(/\(\.ics\)/);
    expect(p).toMatch(/boîte de réception/i);
    expect(p).toMatch(/spam/i);
  });

  it('requires consulting progress before advising and gathering plan inputs before saving', () => {
    const p = buildSandraSystemPrompt({ lang: 'fr', chunks: [] });
    expect(p).toMatch(/get_student_progress[\s\S]*avant de conseiller/i);
    expect(p).toMatch(/matières[\s\S]*semaines[\s\S]*minutes/i);
    expect(p).toMatch(/ne suppose jamais/i);
  });

  it('states the ask-before-replace rule for confirmReplace', () => {
    const p = buildSandraSystemPrompt({ lang: 'fr', chunks: [] });
    expect(p).toContain('confirmReplace');
    expect(p).toMatch(/demande à l'élève s'il veut le remplacer avant/i);
  });

  it('shares the /study-plan link after saving and forbids inventing tool results', () => {
    const p = buildSandraSystemPrompt({ lang: 'fr', chunks: [] });
    expect(p).toMatch(/sauvegarde réussie[\s\S]*\[\/study-plan\]\(\/study-plan\)/i);
    expect(p).toMatch(/n'invente jamais le résultat d'un outil/i);
  });
});

/**
 * Sandra's declared scope drifted away from the platform once already: the
 * persona claimed she served "NS1 à NS4" in four subjects while the catalog
 * carried three levels and seventeen subjects, so a student asking about
 * philosophie or histoire-géo was talking to a tutor instructed that the
 * subject was not hers. Nothing failed when that happened — the prompt is
 * prose, and prose does not typecheck.
 *
 * These tests read the real catalog. Add a subject to the catalog without
 * naming it in the persona and this suite fails, which is the entire point.
 */
describe('declared scope tracks the real catalog', () => {
  const catalog: Array<{ subject?: string; level?: string }> = JSON.parse(
    readFileSync(join(__dirname, '../../../public/exam_catalog_index.json'), 'utf8'),
  );

  /** Lowercase + strip accents, so 'Français' and 'francais' compare equal. */
  const norm = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

  /**
   * Catalog labels the persona names differently, because it writes prose
   * rather than reciting database values. Left = catalog, right = the wording
   * that counts as covering it.
   */
  const ALIASES: Record<string, string> = {
    kreyol: 'creole',
    'histoire-geo': 'histoire-geographie',
    economie: 'sciences economiques',
    'art & musique': 'art et musique',
  };

  /**
   * Catalog labels that name no single subject: 'Mixed' and the comma-joined
   * multi-subject papers. Nothing to declare, so they are exempt.
   */
  const NOT_A_SUBJECT = new Set(['mixed', 'mathematiques, chimie, physique, comprehension de texte']);

  const subjects = [...new Set(catalog.map((e) => e.subject || '').filter(Boolean))];
  const levels = [...new Set(catalog.map((e) => e.level || '').filter(Boolean))];

  it.each(subjects)('names %s among the subjects it covers', (subject) => {
    const key = norm(subject);
    if (NOT_A_SUBJECT.has(key)) return;
    const expected = ALIASES[key] ?? key;
    const prompt = norm(buildSandraSystemPrompt({ lang: 'fr', chunks: [] }));
    expect(prompt).toContain(expected);
  });

  it('covers every exam level in the catalog, not just the Bac', () => {
    // Guards the specific regression: the persona used to stop at NS4.
    expect(levels.sort()).toEqual(['9eme_af', 'baccalaureat', 'universite']);
    const p = buildSandraSystemPrompt({ lang: 'fr', chunks: [] });
    expect(p).toMatch(/7e ann[ée]e fondamentale/i); // lower bound
    expect(p).toMatch(/terminale/i); // the Bac
    expect(p).toMatch(/universit[ée]|pr[ée]fac/i); // concours
  });

  it('never tells Sandra a subject is outside her domain', () => {
    const p = buildSandraSystemPrompt({ lang: 'fr', chunks: [] });
    expect(p).toMatch(/ne réponds jamais qu'une matière sort de ton domaine/i);
  });
});

/**
 * The formatting rule used to say to "avoid" headings, bold and bullets
 * "sauf quand une liste rend vraiment les étapes plus claires" — a soft verb
 * with a self-judged exception. Every sampled transcript took the exception
 * and opened with `* **Mathématiques** :`. These assertions pin the wording on
 * purpose: for a prompt, the text IS the behaviour, so a reword should have to
 * be deliberate rather than incidental.
 */
describe('formatting rules are unconditional', () => {
  const p = () => buildSandraSystemPrompt({ lang: 'fr', chunks: [] });

  it('bans headings, bold and bullet lists outright', () => {
    expect(p()).toMatch(/n'utilise NI titre, NI sous-titre, NI texte en gras, NI liste à puces/i);
  });

  it('bounds the single permitted exception', () => {
    expect(p()).toMatch(/quatre étapes au maximum/i);
  });

  it('does not reintroduce the open-ended list exception', () => {
    expect(p()).not.toMatch(/sauf quand une liste/i);
  });

  it('still allows the two markups that carry meaning: links and LaTeX', () => {
    expect(p()).toMatch(/liens markdown/i);
    expect(p()).toMatch(/LaTeX/);
  });
});
