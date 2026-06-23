import {
  computeReadiness,
  readinessBand,
  aggregateExamResultsBySubject,
  masteryToSubjectStats,
  mergeSubjectStats,
  READINESS_BANDS,
} from '../readinessService';

describe('readinessBand', () => {
  it('maps scores to the correct band', () => {
    expect(readinessBand(0).id).toBe('start');
    expect(readinessBand(39).id).toBe('start');
    expect(readinessBand(40).id).toBe('building');
    expect(readinessBand(59).id).toBe('building');
    expect(readinessBand(60).id).toBe('ontrack');
    expect(readinessBand(74).id).toBe('ontrack');
    expect(readinessBand(75).id).toBe('almost');
    expect(readinessBand(89).id).toBe('almost');
    expect(readinessBand(90).id).toBe('ready');
    expect(readinessBand(100).id).toBe('ready');
  });

  it('clamps out-of-range input', () => {
    expect(readinessBand(-10).id).toBe('start');
    expect(readinessBand(150).id).toBe('ready');
  });

  it('exposes ordered bands', () => {
    const mins = READINESS_BANDS.map((b) => b.min);
    expect(mins).toEqual([...mins].sort((a, b) => a - b));
  });
});

describe('computeReadiness', () => {
  it('returns an empty, no-data summary when nothing is provided', () => {
    const r = computeReadiness({ subjectStats: [], coefficients: {} });
    expect(r.overall).toBe(0);
    expect(r.hasData).toBe(false);
    expect(r.band.id).toBe('start');
    expect(r.subjects).toHaveLength(0);
    expect(r.focus).toBeNull();
    expect(r.strongest).toBeNull();
  });

  it('computes a coefficient-weighted overall score', () => {
    const r = computeReadiness({
      subjectStats: [
        { subject: 'Mathématiques', pct: 80, attempts: 2 },
        { subject: 'Physique', pct: 40, attempts: 1 },
      ],
      coefficients: { 'Mathématiques': 5, 'Physique': 4 },
    });
    // (80*5 + 40*4) / (5+4) = 560/9 = 62.2 -> 62
    expect(r.overall).toBe(62);
    expect(r.hasData).toBe(true);
    expect(r.band.id).toBe('ontrack');
  });

  it('orders subjects by coefficient (highest first)', () => {
    const r = computeReadiness({
      subjectStats: [{ subject: 'Physique', pct: 50, attempts: 1 }],
      coefficients: { 'Mathématiques': 5, 'Physique': 4, 'Français': 2 },
    });
    expect(r.subjects[0].subject).toBe('Mathématiques');
    expect(r.subjects.map((s) => s.coeff)).toEqual([5, 4, 2]);
  });

  it('recommends focus by highest impact (coefficient × gap)', () => {
    const r = computeReadiness({
      subjectStats: [
        { subject: 'Mathématiques', pct: 80, attempts: 2 }, // impact 5*20 = 100
        { subject: 'Physique', pct: 40, attempts: 1 },      // impact 4*60 = 240
      ],
      coefficients: { 'Mathématiques': 5, 'Physique': 4 },
    });
    expect(r.focus?.subject).toBe('Physique');
    expect(r.strongest?.subject).toBe('Mathématiques');
  });

  it('surfaces an un-started high-coefficient subject as focus', () => {
    const r = computeReadiness({
      subjectStats: [{ subject: 'Français', pct: 70, attempts: 1 }],
      coefficients: { 'Mathématiques': 5, 'Français': 2 },
    });
    // Mathématiques has no data (pct 0) and the highest coefficient -> focus.
    expect(r.focus?.subject).toBe('Mathématiques');
    expect(r.focus?.hasData).toBe(false);
    // Only Français has data, so it drives the (single-subject) overall.
    expect(r.overall).toBe(70);
  });

  it('does not nag about an already-excellent subject', () => {
    const r = computeReadiness({
      subjectStats: [{ subject: 'Mathématiques', pct: 95, attempts: 3 }],
      coefficients: { 'Mathématiques': 5 },
    });
    expect(r.focus).toBeNull();
    expect(r.band.id).toBe('ready');
  });
});

describe('aggregateExamResultsBySubject', () => {
  it('averages results per subject, preferring the explicit subject field', () => {
    const results = [
      { id: 'e1', percentage: 80 },
      { id: 'e2', percentage: 60 },
      { id: 'e3', subject: 'Physique', percentage: 50 },
    ];
    const byId = { e1: 'Mathématiques', e2: 'Mathématiques', e3: 'Chimie' };
    const out = aggregateExamResultsBySubject(results, byId);
    expect(out['Mathématiques']).toEqual({ pct: 70, attempts: 2 });
    // r.subject ('Physique') wins over the catalog mapping ('Chimie')
    expect(out['Physique']).toEqual({ pct: 50, attempts: 1 });
    expect(out['Chimie']).toBeUndefined();
  });

  it('ignores results with no resolvable subject or percentage', () => {
    const out = aggregateExamResultsBySubject(
      [{ id: 'x', percentage: 90 }, { id: 'e1' }],
      { e1: 'Maths' },
    );
    expect(out['Maths']).toBeUndefined(); // missing percentage
    expect(Object.keys(out)).toHaveLength(0);
  });
});

describe('masteryToSubjectStats', () => {
  it('drops subjects with no practice attempts', () => {
    const out = masteryToSubjectStats({
      'Maths': { pct: 60, attempts: 4 },
      'Physique': { pct: 0, attempts: 0 },
    });
    expect(out['Maths']).toEqual({ pct: 60, attempts: 4 });
    expect(out['Physique']).toBeUndefined();
  });
});

describe('mergeSubjectStats', () => {
  it('blends sources weighted by attempts', () => {
    const merged = mergeSubjectStats(
      { 'Maths': { pct: 80, attempts: 3 } },
      { 'Maths': { pct: 50, attempts: 1 } },
    );
    const maths = merged.find((m) => m.subject === 'Maths');
    // (80*3 + 50*1) / (3+1) = 290/4 = 72.5 -> 73
    expect(maths.pct).toBe(73);
    expect(maths.attempts).toBe(4);
  });

  it('handles a single source and ignores nullish sources', () => {
    const merged = mergeSubjectStats(null, { 'Chimie': { pct: 42, attempts: 2 } }, undefined);
    expect(merged).toEqual([{ subject: 'Chimie', pct: 42, attempts: 2 }]);
  });
});
