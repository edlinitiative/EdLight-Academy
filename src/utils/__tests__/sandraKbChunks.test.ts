/**
 * Sandra knowledge-base chunker tests.
 *
 * The chunk builders in `scripts/sandra_kb_chunks.mjs` turn live Firestore
 * course/quiz docs and exam JSONs into flat, embeddable text chunks. These
 * tests lock in the shape of each chunk and the two data quirks that bite:
 *   - a quiz doc's `options` is a JSON *string*, not an array, and its
 *     `correct_answer` is a bare letter ("B") that must resolve to option text;
 *   - chunk text must be truncated to 1500 chars.
 */
import { chunkCourse, chunkQuiz, chunkExamQuestion, MAX_CHUNK_CHARS } from '../../../scripts/sandra_kb_chunks.mjs';

describe('chunkCourse', () => {
  const courseDoc = {
    id: 'chem-ns1',
    units: [
      {
        unitId: 'u1',
        title: 'La matière',
        order: 1,
        lessons: [
          { lessonId: 'chem-ns1-u1-l1', title: 'Les atomes', type: 'video', order: 1, objectives: 'Décrire la structure atomique' },
          { lessonId: 'chem-ns1-u1-l2', title: '', type: 'video', order: 2 }, // no title → skipped
          { lessonId: 'chem-ns1-u1-l3', title: 'Quiz atomes', type: 'quiz', order: 3 },
        ],
      },
    ],
  };

  it('emits one chunk per lesson that has a title, skipping title-less lessons', () => {
    const chunks = chunkCourse(courseDoc);
    expect(chunks).toHaveLength(2);
    expect(chunks.map((c: any) => c.sourceId)).toEqual(['chem-ns1-u1-l1', 'chem-ns1-u1-l3']);
  });

  it('tags each chunk as type "lesson" with course/level/subject derived from the id', () => {
    const [first] = chunkCourse(courseDoc);
    expect(first.type).toBe('lesson');
    expect(first.courseId).toBe('chem-ns1');
    expect(first.subject).toBe('chem');
    expect(first.level).toBe('ns1');
    expect(first.sourceId).toBe('chem-ns1-u1-l1');
  });

  it('includes the lesson title, unit title, level and objectives in the text', () => {
    const [first] = chunkCourse(courseDoc);
    expect(first.text).toContain('Les atomes');
    expect(first.text).toContain('La matière');
    expect(first.text).toContain('Décrire la structure atomique');
    expect(first.text.toLowerCase()).toContain('ns1');
  });

  it('tolerates a course with no units', () => {
    expect(chunkCourse({ id: 'math-ns2', units: [] })).toEqual([]);
    expect(chunkCourse({ id: 'math-ns2' })).toEqual([]);
  });
});

describe('chunkQuiz', () => {
  const quizDoc = {
    id: 'quiz-42',
    question: 'Quelle est la charge de l’électron ?',
    // options is a JSON STRING, not an array (live Firestore quirk).
    options: JSON.stringify(['Positive', 'Négative', 'Nulle', 'Variable']),
    // correct_answer is a bare LETTER (live Firestore quirk).
    correct_answer: 'B',
    explanation: 'L’électron porte une charge élémentaire négative.',
    subject_code: 'CHEM-NSI',
  };

  it('produces a single quiz chunk carrying the course guess and type "quiz"', () => {
    const chunks = chunkQuiz(quizDoc, 'chem-ns1');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe('quiz');
    expect(chunks[0].courseId).toBe('chem-ns1');
    expect(chunks[0].sourceId).toBe('quiz-42');
  });

  it('parses the JSON-string options and resolves the letter answer to option text', () => {
    const [chunk] = chunkQuiz(quizDoc, 'chem-ns1');
    expect(chunk.text).toContain('Positive');
    expect(chunk.text).toContain('Négative');
    // The bare "B" must resolve to the second option (index 1).
    expect(chunk.text).toContain('Négative');
    expect(chunk.text).toMatch(/[Bb].*Négative/s);
    expect(chunk.text).toContain('négative'); // explanation present
  });

  it('handles options already being an array and a full-text correct_answer', () => {
    const [chunk] = chunkQuiz(
      { id: 'q2', question: 'Q?', options: ['Oui', 'Non'], correct_answer: 'Oui' },
      'phys-ns3',
    );
    expect(chunk.text).toContain('Oui');
    expect(chunk.subject).toBe('phys');
    expect(chunk.level).toBe('ns3');
  });

  it('returns nothing for a quiz with no question text', () => {
    expect(chunkQuiz({ id: 'q3', question: '' }, 'chem-ns1')).toEqual([]);
    expect(chunkQuiz(null, 'chem-ns1')).toEqual([]);
  });
});

describe('chunkExamQuestion', () => {
  const q = {
    number: '1.a',
    type: 'short_answer',
    question: 'Expliquer en quoi consiste la drépanocytose.',
    hints: ['Pensez à l’hémoglobine.', 'La forme des globules rouges change.'],
    model_answer: 'La drépanocytose produit une hémoglobine S anormale.',
    explanation: 'Maladie génétique de l’hémoglobine.',
  };
  const meta = { examId: 'ex_abc', subject: 'SVT', level: 'baccalaureat', courseId: '' };

  it('produces one exam chunk with statement, démarche and solution', () => {
    const chunks = chunkExamQuestion(q, meta);
    expect(chunks).toHaveLength(1);
    const [c] = chunks;
    expect(c.type).toBe('exam');
    expect(c.text).toContain('drépanocytose');
    expect(c.text).toContain('hémoglobine'); // from hints/démarche
    expect(c.text).toContain('hémoglobine S'); // from solution
    expect(c.subject).toBe('svt');
  });

  it('builds a source id from the exam id and question number', () => {
    const [c] = chunkExamQuestion(q, meta);
    expect(c.sourceId).toContain('ex_abc');
    expect(c.sourceId).toContain('1.a');
  });

  it('returns nothing for an empty statement', () => {
    expect(chunkExamQuestion({ number: '2', question: '' }, meta)).toEqual([]);
    expect(chunkExamQuestion(null, meta)).toEqual([]);
  });

  it('disambiguates identical question numbers across sections via sectionNo', () => {
    const q1 = { number: '1', question: 'Question section A' };
    const q2 = { number: '1', question: 'Question section B' };
    const [a] = chunkExamQuestion(q1, { ...meta, sectionNo: 1 });
    const [b] = chunkExamQuestion(q2, { ...meta, sectionNo: 2 });
    expect(a.sourceId).not.toBe(b.sourceId);
    expect(a.sourceId).toContain('s1:');
    expect(b.sourceId).toContain('s2:');
  });
});

describe('chunk text truncation', () => {
  it('never emits chunk text longer than MAX_CHUNK_CHARS', () => {
    expect(MAX_CHUNK_CHARS).toBe(1500);
    const long = 'a'.repeat(5000);
    const [c] = chunkQuiz(
      { id: 'big', question: long, options: JSON.stringify([long, long]), correct_answer: 'A', explanation: long },
      'chem-ns1',
    );
    expect(c.text.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
  });
});
