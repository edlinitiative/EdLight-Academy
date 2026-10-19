import { restoreChapterDraft, serializeChapterDraft, chapterDraftKey, CHAPTER_DRAFT_TTL_MS } from '../chapterTestDraft';
import type { PracticeCard } from '../practiceCards';

const card = (id: string): PracticeCard => ({ id, question: `Q${id}`, options: ['a', 'b', 'c'], correctIndex: 0, answer: 'a', lessonNo: 1 });
const pool = ['1', '2', '3', '4'].map(card);
const NOW = 1_900_000_000_000;

describe('chapter test draft (L-8)', () => {
  it('restores the same draw, answers and position for its owner', () => {
    const raw = serializeChapterDraft('alice', [pool[2], pool[0]], { 3: 1 }, 1, NOW);
    const r = restoreChapterDraft(raw, 'alice', pool, NOW + 1000);
    expect(r?.cards.map((c) => c.id)).toEqual(['3', '1']);
    expect(r?.answers).toEqual({ 3: 1 });
    expect(r?.idx).toBe(1);
  });

  it('never restores another account\'s test (shared phone, F1 rule)', () => {
    const raw = serializeChapterDraft('alice', [pool[0]], { 1: 2 }, 0, NOW);
    expect(restoreChapterDraft(raw, 'bob', pool, NOW)).toBeNull();
    expect(restoreChapterDraft(raw, null, pool, NOW)).toBeNull();
  });

  it('discards a draw the bank can no longer rebuild, a stale draft, or garbage', () => {
    const raw = serializeChapterDraft('alice', [pool[0], card('gone')], {}, 0, NOW);
    expect(restoreChapterDraft(raw, 'alice', pool, NOW)).toBeNull();
    const old = serializeChapterDraft('alice', [pool[0]], {}, 0, NOW);
    expect(restoreChapterDraft(old, 'alice', pool, NOW + CHAPTER_DRAFT_TTL_MS + 1)).toBeNull();
    expect(restoreChapterDraft('{nope', 'alice', pool, NOW)).toBeNull();
  });

  it('drops out-of-range answers and clamps the position', () => {
    const raw = serializeChapterDraft('alice', [pool[0], pool[1]], { 1: 9, 2: 2 }, 7, NOW);
    const r = restoreChapterDraft(raw, 'alice', pool, NOW);
    expect(r?.answers).toEqual({ 2: 2 });
    expect(r?.idx).toBe(1);
  });

  it('keys by chapter', () => {
    expect(chapterDraftKey('CHEM-NS1', 2)).toBe('edlight-chapter-test-CHEM-NS1-2');
  });
});
