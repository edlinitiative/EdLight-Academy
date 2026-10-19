/**
 * "Explique-moi" context (shared/explainContext.ts) and Sandra's prompt
 * section for it (api/_lib/sandraPrompt.ts buildExplainSection).
 */
import {
  EXPLAIN_DISCLOSURE,
  EXPLAIN_EVENT,
  EXPLAIN_LABEL,
  examAnswerText,
  examExpectedText,
  examQuestionContext,
  explainAskMessage,
  explainTelemetryDetail,
  sanitizeQuestionContext,
} from '../../../shared/explainContext';
import { sanitizeDiagnostic } from '../../../shared/telemetry';
import { buildExplainSection, buildSandraSystemPrompt } from '../../../api/_lib/sandraPrompt';

describe('sanitizeQuestionContext', () => {
  it('needs a question, bounds every field and keeps only safe ids', () => {
    expect(sanitizeQuestionContext({})).toBeUndefined();
    expect(sanitizeQuestionContext('x')).toBeUndefined();
    const ctx = sanitizeQuestionContext({
      surface: 'nope', question: 'Q'.repeat(5000), studentAnswer: 42, examId: 'bad id with spaces',
      questionId: 'q-1', status: 'weird', extra: 'drop me',
    })!;
    expect(ctx.surface).toBe('practice');
    expect(ctx.question).toHaveLength(1500);
    expect(ctx.studentAnswer).toBe('42');
    expect(ctx.examId).toBeUndefined();
    expect(ctx.questionId).toBe('q-1');
    expect(ctx.status).toBeUndefined();
    expect(ctx).not.toHaveProperty('extra');
  });

  it('drops a placeholder key instead of presenting it as the answer', () => {
    expect(sanitizeQuestionContext({ question: 'Q', expectedAnswer: 'Texte manquant' })!.expectedAnswer).toBeUndefined();
    expect(sanitizeQuestionContext({ question: 'Q', expectedAnswer: 'x = 2' })!.expectedAnswer).toBe('x = 2');
  });
});

describe('telemetry', () => {
  it('sends only allowlisted keys: surface, type, status, signedIn', () => {
    const ctx = sanitizeQuestionContext({
      surface: 'exam_results', question: 'Secret question', studentAnswer: 'my answer', expectedAnswer: 'key',
      questionType: 'short_answer', status: 'incorrect', examId: 'exam-1', subject: 'Mathématiques',
    })!;
    const detail = explainTelemetryDetail(ctx, true);
    expect(detail).toEqual({ surface: 'exam_results', type: 'short_answer', status: 'incorrect', signedIn: true });
    // The server-side filter keeps every one of them (no silent loss).
    const clean = sanitizeDiagnostic({ type: 'event', name: EXPLAIN_EVENT, timestamp: 1, detail });
    expect(clean?.detail).toEqual(detail);
    expect(JSON.stringify(clean)).not.toMatch(/Secret|my answer|exam-1|Math/);
  });
});

describe('copy', () => {
  it('is bilingual and never uses an em-dash', () => {
    const all = [explainAskMessage('fr'), explainAskMessage('ht'), EXPLAIN_LABEL.fr, EXPLAIN_LABEL.ht, EXPLAIN_DISCLOSURE.fr, EXPLAIN_DISCLOSURE.ht];
    for (const s of all) expect(s).not.toContain('—');
    expect(explainAskMessage('ht')).toMatch(/Eksplike m/);
    expect(EXPLAIN_LABEL).toEqual({ fr: 'Explique-moi', ht: 'Eksplike m' });
  });
});

describe('exam rows → readable text', () => {
  const mcq = { type: 'multiple_choice', question: 'Capitale ?', options: { a: 'Port-au-Prince', b: 'Cap-Haïtien' }, correct: 'a', explanation: 'Siège du gouvernement.' };

  it('MCQ: letter and option text on both sides', () => {
    expect(examAnswerText(mcq, 'b')).toBe('B) Cap-Haïtien');
    expect(examExpectedText(mcq)).toBe('A) Port-au-Prince');
  });

  it('flattens scaffold, proof and multi-blank answers', () => {
    expect(examAnswerText({ type: 'calculation' }, '{"scaffold":["2x = 4","x = 2"]}')).toBe('2x = 4 ; x = 2');
    expect(examAnswerText({ type: 'calculation' }, '{"steps":[{"math":"a"}],"finalAnswer":"b"}')).toBe('a ; b');
    expect(examAnswerText({ type: 'fill_blank' }, 'un|deux')).toBe('un ; deux');
  });

  it('falls back through the authored keys', () => {
    expect(examExpectedText({ final_answer: '12' })).toBe('12');
    expect(examExpectedText({ answer_parts: [{ label: 'a', answer: '1' }] })).toBe('a : 1');
    expect(examExpectedText({ model_answer: 'Modèle' })).toBe('Modèle');
  });

  it('builds the exam_results context', () => {
    const ctx = examQuestionContext({ question: mcq, answer: 'b', status: 'incorrect', subject: 'Histoire-Géo', examId: 'e1' })!;
    expect(ctx).toMatchObject({
      surface: 'exam_results', question: 'Capitale ?', studentAnswer: 'B) Cap-Haïtien',
      expectedAnswer: 'A) Port-au-Prince', explanation: 'Siège du gouvernement.', status: 'incorrect', examId: 'e1',
    });
  });
});

describe('Sandra prompt section', () => {
  const ctx = { question: 'Résoudre $x^2 = 4$', studentAnswer: 'x = 2', expectedAnswer: 'x = 2 ou x = -2', explanation: 'Deux racines.', status: 'partial', subject: 'Mathématiques' };

  it('grounds the steps in the key, says where the answer went wrong, in the student language', () => {
    const fr = buildExplainSection(ctx, 'fr');
    expect(fr).toContain("Réponse de l'élève (en partie juste) : x = 2");
    expect(fr).toContain('Réponse attendue (corrigé officiel) : x = 2 ou x = -2');
    expect(fr).toContain('étape par étape');
    expect(fr).toContain('ne les contredis pas');
    expect(buildExplainSection(ctx, 'ht')).toContain('créole haïtien');
  });

  it('is honest when no key exists', () => {
    const s = buildExplainSection({ question: 'Q' }, 'fr');
    expect(s).toContain('Aucun corrigé fiable');
    expect(s).toContain('aucune');
  });

  it('lifts the never-reveal rule for THIS question only', () => {
    const chunks = [{ text: 'Q', courseId: 'c', level: 'NS4', subject: 'Math', type: 'exam' as const, sourceId: 's' }];
    const withCtx = buildSandraSystemPrompt({ lang: 'fr', chunks, questionContext: ctx });
    expect(withCtx).toContain('ne révèle ni la réponse correcte');
    expect(withCtx).toContain('Exception');
    const without = buildSandraSystemPrompt({ lang: 'fr', chunks });
    expect(without).not.toContain('Exception');
    expect(without).not.toContain('Explique-moi :');
  });
});
