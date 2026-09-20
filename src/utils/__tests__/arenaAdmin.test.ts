/**
 * The admin console's pure logic: what an author may save, what a host may
 * press, and how much of the month's authoring is still owed.
 *
 * Firestore and the API client are stubbed out — nothing here touches a
 * network. What is under test is the three pieces of judgement the console
 * makes on its own: validation that mirrors the server's, a control mapping
 * that defers to `canTransition`, and the progress counter that makes the
 * recurring cost of this format visible.
 */

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  onSnapshot: jest.fn(),
  orderBy: jest.fn(),
  query: jest.fn(),
  limit: jest.fn(),
}));

jest.mock('../../services/firebase', () => ({
  db: {},
  authedFetch: jest.fn(),
  getIdToken: jest.fn(),
}));

import {
  PROMPT_WARN_CHARS,
  PROMPT_TRUNCATE_CHARS,
  authoringProgress,
  controlPermission,
  nextBeat,
  validateQuestionDraft,
  type ArenaControl,
  type ArenaQuestionDraft,
  type ControlContext,
  validateTournamentDraft,
  blockerLines,
} from '../../services/arenaAdminService';
import { ARENA_STATES, type ArenaState } from '../../../shared/arena/state';

/** A draft that passes everything, so each test can break exactly one thing. */
const goodDraft = (over: Partial<ArenaQuestionDraft> = {}): Partial<ArenaQuestionDraft> => ({
  index: 0,
  prompt: 'Quelle est la capitale du département du Nord ?',
  promptHt: 'Ki kapital depatman Nò a ?',
  options: ['Cap-Haïtien', 'Gonaïves', 'Jacmel', 'Hinche'],
  optionsHt: ['Okap', 'Gonayiv', 'Jakmèl', 'Ench'],
  answerIndex: 0,
  explanation: 'Cap-Haïtien est le chef-lieu du Nord.',
  category: 'geographie',
  difficulty: 2,
  ...over,
});

const codes = (issues: Array<{ code: string }>) => issues.map((i) => i.code);

// ── Validation ──────────────────────────────────────────────────────────────

describe('question validation — four options, one of them right', () => {
  it('accepts a complete bilingual question with no complaint at all', () => {
    const v = validateQuestionDraft(goodDraft());
    expect(v.ok).toBe(true);
    expect(v.errors).toEqual([]);
    expect(v.warnings).toEqual([]);
  });

  it('refuses three options, because the delivered screen has exactly four buttons', () => {
    const v = validateQuestionDraft(goodDraft({ options: ['A', 'B', 'C'], optionsHt: [] }));
    expect(v.ok).toBe(false);
    expect(codes(v.errors)).toContain('option_count');
  });

  it('refuses five options for the same reason, so a fourth-and-a-half never ships', () => {
    const v = validateQuestionDraft(goodDraft({ options: ['A', 'B', 'C', 'D', 'E'], optionsHt: [] }));
    expect(codes(v.errors)).toContain('option_count');
  });

  it('refuses a blank option and says which one, because "option 3 is empty" is actionable and "invalid" is not', () => {
    const v = validateQuestionDraft(goodDraft({ options: ['Cap-Haïtien', 'Gonaïves', '   ', 'Hinche'], optionsHt: [] }));
    expect(v.ok).toBe(false);
    const empty = v.errors.find((e) => e.code === 'option_empty');
    expect(empty?.option).toBe(2);
  });

  it('refuses a correct index past the last option — a question nobody can get right', () => {
    expect(validateQuestionDraft(goodDraft({ answerIndex: 4 })).ok).toBe(false);
    expect(codes(validateQuestionDraft(goodDraft({ answerIndex: 4 })).errors))
      .toContain('answer_out_of_range');
  });

  it('refuses a negative correct index rather than letting -1 read as "unauthored"', () => {
    expect(codes(validateQuestionDraft(goodDraft({ answerIndex: -1 })).errors))
      .toContain('answer_out_of_range');
  });

  it('accepts the last option as the correct one, so the bounds are not off by one', () => {
    expect(validateQuestionDraft(goodDraft({ answerIndex: 3 })).ok).toBe(true);
  });

  it('refuses an empty prompt', () => {
    expect(codes(validateQuestionDraft(goodDraft({ prompt: '  ' })).errors)).toContain('prompt_empty');
  });

  it('refuses a prompt too short to be a question', () => {
    expect(codes(validateQuestionDraft(goodDraft({ prompt: 'Qui ?' })).errors)).toContain('prompt_short');
  });
});

describe('the prompt-length warning — a question nobody finishes reading', () => {
  it('says nothing at the threshold itself', () => {
    const v = validateQuestionDraft(goodDraft({ prompt: 'Q'.repeat(PROMPT_WARN_CHARS) }));
    expect(v.warnings).toEqual([]);
    expect(v.ok).toBe(true);
  });

  it('warns one character past it', () => {
    const v = validateQuestionDraft(goodDraft({ prompt: 'Q'.repeat(PROMPT_WARN_CHARS + 1) }));
    expect(codes(v.warnings)).toContain('prompt_long');
  });

  it('WARNS AND NEVER BLOCKS, because the server truncates rather than refusing — a block here would stop a save the server would have accepted', () => {
    const v = validateQuestionDraft(goodDraft({ prompt: 'Q'.repeat(PROMPT_WARN_CHARS + 50) }));
    expect(v.ok).toBe(true);
    expect(v.errors).toEqual([]);
  });

  it('escalates to "this will be cut" past the server ceiling, still without blocking', () => {
    const v = validateQuestionDraft(goodDraft({ prompt: 'Q'.repeat(PROMPT_TRUNCATE_CHARS + 1) }));
    expect(codes(v.warnings)).toContain('prompt_truncated');
    expect(v.ok).toBe(true);
  });
});

describe('Kreyòl is all four or none', () => {
  it('accepts no Kreyòl options at all', () => {
    expect(validateQuestionDraft(goodDraft({ optionsHt: [], promptHt: '' })).ok).toBe(true);
  });

  it('refuses two of four translated — a student reading in Kreyòl cannot tell a half-translation from a bug', () => {
    const v = validateQuestionDraft(goodDraft({ optionsHt: ['Okap', 'Gonayiv', '', ''] }));
    expect(v.ok).toBe(false);
    expect(codes(v.errors)).toContain('options_ht_partial');
  });

  it('warns when the options are translated but the prompt is not, because that reads as a bug too', () => {
    const v = validateQuestionDraft(goodDraft({ promptHt: '' }));
    expect(v.ok).toBe(true);
    expect(codes(v.warnings)).toContain('prompt_ht_missing');
  });
});

// ── Control permissions ─────────────────────────────────────────────────────

const ctx = (over: Partial<ControlContext> = {}): ControlContext => ({
  state: 'draft',
  index: -1,
  liveState: null,
  questionCount: 25,
  ...over,
});

const allowed = (control: ArenaControl, over: Partial<ControlContext> = {}) =>
  controlPermission(control, ctx(over)).allowed;

describe('the run console follows the state machine, it does not have its own', () => {
  it('opens registration only from draft', () => {
    expect(allowed('openRegistration', { state: 'draft' })).toBe(true);
    ARENA_STATES.filter((s) => s !== 'draft').forEach((s) => {
      expect(allowed('openRegistration', { state: s })).toBe(false);
    });
  });

  it('opens the doors only from registration', () => {
    expect(allowed('openDoors', { state: 'registration' })).toBe(true);
    expect(allowed('openDoors', { state: 'draft' })).toBe(false);
    expect(allowed('openDoors', { state: 'doors' })).toBe(false);
  });

  it('starts only from doors — there is no starting a tournament straight out of the lobby', () => {
    expect(allowed('start', { state: 'doors' })).toBe(true);
    expect(allowed('start', { state: 'registration' })).toBe(false);
    expect(allowed('start', { state: 'live' })).toBe(false);
  });

  it('publishes provisional standings only from grading, never straight from live', () => {
    expect(allowed('publishProvisional', { state: 'grading' })).toBe(true);
    expect(allowed('publishProvisional', { state: 'live' })).toBe(false);
  });

  it('releases the prizes only from provisional, so the integrity review cannot be skipped by one click', () => {
    expect(allowed('finalise', { state: 'provisional' })).toBe(true);
    expect(allowed('finalise', { state: 'grading' })).toBe(false);
    expect(allowed('finalise', { state: 'live' })).toBe(false);
  });

  it('voids from anywhere except final, because a paid champion cannot be un-published by a state change', () => {
    ARENA_STATES.filter((s) => s !== 'final' && s !== 'void').forEach((s) => {
      expect(allowed('void', { state: s })).toBe(true);
    });
    expect(allowed('void', { state: 'final' })).toBe(false);
    expect(allowed('void', { state: 'void' })).toBe(false);
  });

  it('gives a reason with every refusal, so a disabled control can say why instead of just sitting there', () => {
    const p = controlPermission('start', ctx({ state: 'registration' }));
    expect(p.allowed).toBe(false);
    expect(p.reason).toBe('illegal_transition');
    expect(p.target).toBe('live');
  });

  it('offers no state-changing control at all once the tournament is final', () => {
    (['openRegistration', 'openDoors', 'start', 'publishProvisional', 'finalise', 'void'] as ArenaControl[])
      .forEach((c) => expect(allowed(c, { state: 'final' })).toBe(false));
  });
});

describe('freezing the roster — measurable at doors close and nowhere else', () => {
  it('is available while the doors are open', () => {
    expect(allowed('freezeRoster', { state: 'doors' })).toBe(true);
  });

  it('is refused everywhere else, because once the board ranks on a roster, re-freezing it unqualifies a school mid-stream', () => {
    ARENA_STATES.filter((s) => s !== 'doors').forEach((s) => {
      const p = controlPermission('freezeRoster', ctx({ state: s }));
      expect(p.allowed).toBe(false);
      expect(p.reason).toBe('not_doors');
    });
  });

  it('is not a state transition and reports no target', () => {
    expect(controlPermission('freezeRoster', ctx({ state: 'doors' })).target).toBeNull();
  });
});

describe('the safety override — the clock controls, which are not transitions', () => {
  it('is dead outside live, because there is no clock to override', () => {
    ARENA_STATES.filter((s) => s !== 'live').forEach((s) => {
      expect(allowed('forceClose', { state: s })).toBe(false);
      expect(allowed('forceNext', { state: s, liveState: 'closed', index: 0 })).toBe(false);
    });
  });

  it('closes an open question', () => {
    expect(allowed('forceClose', { state: 'live', index: 3, liveState: 'open' })).toBe(true);
  });

  it('will not close a question that is already closed', () => {
    const p = controlPermission('forceClose', ctx({ state: 'live', index: 3, liveState: 'closed' }));
    expect(p.allowed).toBe(false);
    expect(p.reason).toBe('no_open_question');
  });

  it('opens the next question only once the current one is closed, so the pause cannot be skipped onto a live window', () => {
    expect(allowed('forceNext', { state: 'live', index: 3, liveState: 'closed' })).toBe(true);
    const p = controlPermission('forceNext', ctx({ state: 'live', index: 3, liveState: 'open' }));
    expect(p.allowed).toBe(false);
    expect(p.reason).toBe('question_still_open');
  });

  it('opens the FIRST question when nothing has been delivered yet', () => {
    expect(allowed('forceNext', { state: 'live', index: -1, liveState: null })).toBe(true);
  });

  it('refuses both when the tournament points at a delivery document that is not there — that is corruption, and guessing costs a skipped or a reopened question', () => {
    const close = controlPermission('forceClose', ctx({ state: 'live', index: 4, liveState: null }));
    const next = controlPermission('forceNext', ctx({ state: 'live', index: 4, liveState: null }));
    expect(close.allowed).toBe(false);
    expect(next.allowed).toBe(false);
    expect(close.reason).toBe('live_document_missing');
    expect(next.reason).toBe('live_document_missing');
  });

  it('still allows the press after the last question closes, because that press is what ends the game', () => {
    expect(allowed('forceNext', { state: 'live', index: 24, liveState: 'closed', questionCount: 25 })).toBe(true);
  });

  it('refuses to start a tournament with no questions rather than opening an empty window', () => {
    const p = controlPermission('forceNext', ctx({ state: 'live', index: -1, liveState: null, questionCount: 0 }));
    expect(p.allowed).toBe(false);
    expect(p.reason).toBe('all_questions_delivered');
  });

  it('reports no target state, because closing a window is not a move on the state machine', () => {
    expect(controlPermission('forceClose', ctx({ state: 'live', index: 1, liveState: 'open' })).target).toBeNull();
  });
});

// ── Authoring progress ──────────────────────────────────────────────────────

describe('authoring progress — the monthly bill, made visible', () => {
  const rows = (authored: number, total: number) =>
    Array.from({ length: total }, (_, i) => ({ authored: i < authored }));

  it('counts only the rows that actually carry an answer key', () => {
    const p = authoringProgress(rows(18, 25), 25);
    expect(p.authored).toBe(18);
    expect(p.total).toBe(25);
    expect(p.remaining).toBe(7);
    expect(p.percent).toBe(72);
    expect(p.complete).toBe(false);
  });

  it('counts a draft row with no key as work still owed, not as work done', () => {
    const p = authoringProgress([{ authored: true }, { authored: false }, {}], 25);
    expect(p.authored).toBe(1);
    expect(p.remaining).toBe(24);
  });

  it('reports complete at exactly the tournament\'s questionCount', () => {
    const p = authoringProgress(rows(25, 25), 25);
    expect(p.complete).toBe(true);
    expect(p.remaining).toBe(0);
    expect(p.percent).toBe(100);
  });

  it('never reports negative work remaining, and flags the overshoot instead — more rows than questionCount is a mismatch someone should see', () => {
    const p = authoringProgress(rows(27, 27), 25);
    expect(p.remaining).toBe(0);
    expect(p.over).toBe(true);
    expect(p.percent).toBe(100);
  });

  it('accepts a bare count, for the places that already know the number', () => {
    expect(authoringProgress(18, 25).remaining).toBe(7);
  });

  it('does not divide by zero on a tournament that has not said how many it wants', () => {
    const p = authoringProgress(rows(3, 3), 0);
    expect(p.percent).toBe(0);
    expect(p.complete).toBe(false);
    expect(p.remaining).toBe(0);
  });

  it('starts an empty tournament at nothing done and everything owed', () => {
    const p = authoringProgress([], 25);
    expect(p.authored).toBe(0);
    expect(p.remaining).toBe(25);
    expect(p.percent).toBe(0);
  });
});

// ── What happens next ───────────────────────────────────────────────────────

describe('the next beat — the line a host reads instead of guessing', () => {
  const NOW = 1_700_000_000_000;
  const PAUSE = 10_000;

  it('counts down to the close while a question is open', () => {
    const beat = nextBeat(
      { state: 'live', index: 2, questionCount: 25 },
      { state: 'open', closesAt: NOW + 7_000, closedAt: 0 },
      PAUSE, NOW,
    );
    expect(beat).toEqual({ kind: 'closes', inMs: 7_000 });
  });

  it('counts down to the next open during the pause, which is where late answers land', () => {
    const beat = nextBeat(
      { state: 'live', index: 2, questionCount: 25 },
      { state: 'closed', closesAt: NOW - 4_000, closedAt: NOW - 4_000 },
      PAUSE, NOW,
    );
    expect(beat).toEqual({ kind: 'opens', inMs: 6_000 });
  });

  it('never counts below zero once the beat is due, so an overdue clock reads "now" rather than negative', () => {
    const beat = nextBeat(
      { state: 'live', index: 2, questionCount: 25 },
      { state: 'open', closesAt: NOW - 3_000, closedAt: 0 },
      PAUSE, NOW,
    );
    expect(beat.inMs).toBe(0);
  });

  it('says grading is next once the last question has closed, not another question', () => {
    const beat = nextBeat(
      { state: 'live', index: 24, questionCount: 25 },
      { state: 'closed', closesAt: NOW - 1_000, closedAt: NOW - 1_000 },
      PAUSE, NOW,
    );
    expect(beat.kind).toBe('grading');
  });

  it('is idle outside live, where no clock is running', () => {
    (['draft', 'registration', 'doors', 'grading', 'provisional', 'final', 'void'] as ArenaState[])
      .forEach((state) => {
        expect(nextBeat({ state, index: 0, questionCount: 25 }, null, PAUSE, NOW).kind).toBe('idle');
      });
  });
});

// ── The tournament creation form ────────────────────────────────────────────

describe('validateTournamentDraft', () => {
  const base = { tournamentId: 'sept-2026', title: 'Arène de septembre', startsAt: 1_800_000_000_000 };
  const fields = (d: any) => validateTournamentDraft(d, false).map((i) => i.field);

  it('accepts a complete draft', () => {
    expect(validateTournamentDraft(base, false)).toEqual([]);
  });

  it('refuses an id that would not survive a URL', () => {
    for (const id of ['', 'sept 2026', 'sept/2026', '-sept', 'é2026', 'x'.repeat(65)]) {
      expect(fields({ ...base, tournamentId: id })).toContain('tournamentId');
    }
  });

  it('accepts the ids the server accepts', () => {
    for (const id of ['a', 'sept-2026', 'SEPT_2026', '2026']) {
      expect(fields({ ...base, tournamentId: id })).not.toContain('tournamentId');
    }
  });

  /*
   * The rule worth stating twice. `rankSchools` reads qualification off the
   * pool it is handed, so a tournament scoring five with only three required
   * present would call a school qualified on a pool that cannot fill its own
   * counting five — discovered on a stream, not in review.
   */
  it('refuses fewer players present than the number that score', () => {
    expect(fields({ ...base, teamSize: 5, minPlayers: 3 })).toContain('minPlayers');
    expect(fields({ ...base, teamSize: 5, minPlayers: 5 })).not.toContain('minPlayers');
    expect(fields({ ...base, teamSize: 5, minPlayers: 8 })).not.toContain('minPlayers');
  });

  it('refuses doors that open after the first question', () => {
    expect(fields({ ...base, doorsAt: base.startsAt + 1 })).toContain('doorsAt');
    expect(fields({ ...base, doorsAt: base.startsAt - 600_000 })).not.toContain('doorsAt');
  });

  it('refuses a missing start time and a too-short title', () => {
    expect(fields({ ...base, startsAt: 0 })).toContain('startsAt');
    expect(fields({ ...base, title: 'A' })).toContain('title');
  });

  it('writes its messages in the reader’s language', () => {
    const fr = validateTournamentDraft({ ...base, title: '' }, false)[0].message;
    const ht = validateTournamentDraft({ ...base, title: '' }, true)[0].message;
    expect(fr).not.toBe(ht);
  });
});

/*
 * The finalise refusal a host reads at 22:40. "Finalisation refused" sends
 * them looking; the rank and the reason are the whole message.
 */
describe('blockerLines', () => {
  it('leads with the rank, in both languages', () => {
    const [fr] = blockerLines([{ rank: 1, uids: ['w1'], why: 'claim_unresolved' }], 'fr');
    const [ht] = blockerLines([{ rank: 1, uids: ['w1'], why: 'claim_unresolved' }], 'ht');
    expect(fr).toBe('rang 1 : réclamation non vérifiée (1)');
    expect(ht).toBe('ran 1 : reklamasyon ki pa verifye (1)');
    expect(fr).not.toBe(ht);
  });

  it('says how many people a tie concerns', () => {
    const [line] = blockerLines([{ rank: 2, uids: ['a', 'b'], why: 'tie_unresolved' }], 'fr');
    expect(line).toContain('(2)');
  });

  it('has copy for every reason the gate can return', () => {
    const reasons = [
      'tie_unresolved', 'claim_unresolved', 'prize_unassigned',
      'unreviewed_flags', 'disqualified_holder',
    ] as const;
    for (const why of reasons) {
      const [fr] = blockerLines([{ rank: 1, uids: [], why }], 'fr');
      expect(fr).not.toContain(why);
    }
  });

  it('is empty when nothing blocks', () => {
    expect(blockerLines([], 'fr')).toEqual([]);
  });
});
