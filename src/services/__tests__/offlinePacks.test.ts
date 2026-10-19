/**
 * Offline revision packs (larger product additions item 4): manifest and
 * size estimates, download / update / remove, the budget that refuses rather
 * than evicts, integrity, and the build that produces the packs.
 */
import {
  buildPracticePacks,
  canDownloadNow,
  chunkedPackBlobStore,
  createPackLibrary,
  fnv1a,
  formatPackSize,
  memoryPackBlobStore,
  PackError,
  packYearsLabel,
  parsePackManifest,
  utf8Bytes,
  type PackEntry,
} from '../../../shared/offlinePacks';
import { buildExamPacks, buildManifest, fnv1a as buildFnv1a } from '../../../scripts/offline_packs_core.mjs';

function memoryIndex() {
  const m = new Map<string, string>();
  return {
    getItem: async (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: async (k: string, v: string) => { m.set(k, v); },
    removeItem: async (k: string) => { m.delete(k); },
    map: m,
  };
}

function exam(id: string, year: number, level = 'baccalaureat', subject = 'SVT', pad = 0) {
  return {
    exam_id: id, level, subject, year: String(year), exam_title: `Bac ${subject} ${year}`,
    _api_usage: { tokens: 123 }, _source_file: 'x.pdf',
    sections: [{ section_title: 'Partie A', questions: [{ type: 'multiple_choice', question: `Q ${id} ${'x'.repeat(pad)}`, options: ['a', 'b'], correct: 'a' }] }],
  };
}

function packFixture() {
  const [built] = buildExamPacks([exam('e1', 2024), exam('e2', 2023)], { now: 1 });
  return built as { entry: PackEntry; text: string };
}

describe('integrity and display helpers', () => {
  it('the build script and the clients hash the same way', () => {
    for (const s of ['', 'abc', 'Kreyòl é à ü — ∑', '{"a":1}', 'x'.repeat(5000)]) {
      expect(fnv1a(s)).toBe(buildFnv1a(s));
      expect(utf8Bytes(s)).toBe(Buffer.byteLength(s, 'utf8'));
    }
    expect(utf8Bytes('😀')).toBe(4);
  });

  it('shows the size before download in French notation', () => {
    expect(formatPackSize(350 * 1024)).toBe('≈ 350 Ko');
    expect(formatPackSize(1.24 * 1024 * 1024)).toBe('≈ 1,2 Mo');
    expect(formatPackSize(12 * 1024 * 1024)).toBe('≈ 12 Mo');
    expect(formatPackSize(10)).toBe('≈ 1 Ko');
    expect(packYearsLabel([2019, 2024], 'fr')).toBe('2019 à 2024');
    expect(packYearsLabel([2019, 2024], 'ht')).toBe('2019 rive 2024');
    expect(packYearsLabel([2020, 2020], 'fr')).toBe('2020');
  });

  it('wifi-only blocks cellular, offline blocks everything, unknown is allowed', () => {
    expect(canDownloadNow({ wifiOnly: true, connection: { isConnected: true, type: 'cellular' } })).toBe('wifi_required');
    expect(canDownloadNow({ wifiOnly: false, connection: { isConnected: true, type: 'cellular' } })).toBe('ok');
    expect(canDownloadNow({ wifiOnly: true, connection: { isConnected: true, type: 'wifi' } })).toBe('ok');
    expect(canDownloadNow({ wifiOnly: true, connection: { isConnected: true, type: 'unknown' } })).toBe('ok');
    expect(canDownloadNow({ wifiOnly: false, connection: { isConnected: false } })).toBe('offline');
    expect(canDownloadNow({ wifiOnly: false, connection: { isConnected: true, isInternetReachable: false } })).toBe('offline');
  });
});

describe('pack build (scripts/offline_packs_core.mjs)', () => {
  it('groups by level + subject, newest first, measures size and hash on the exact text', () => {
    const packs = buildExamPacks([exam('a', 2020), exam('b', 2024), exam('c', 2022, '9eme_af', 'Anglais')], { now: 5 });
    expect(packs.map((p: any) => p.entry.id)).toEqual(['exam-9af-anglais', 'exam-bac-svt']);
    const svt = packs[1];
    const body = JSON.parse(svt.text);
    expect(body.exams.map((e: any) => e.exam_id)).toEqual(['b', 'a']);
    expect(body.exams[0]._api_usage).toBeUndefined();
    expect(body.exams[0]._source_file).toBeUndefined();
    expect(svt.entry).toMatchObject({ kind: 'exam', items: 2, questionCount: 2, years: [2020, 2024] });
    expect(svt.entry.sizeBytes).toBe(Buffer.byteLength(svt.text));
    expect(svt.entry.hash).toBe(fnv1a(svt.text));
    expect(svt.entry.file).toBe(`exam-bac-svt.${svt.entry.hash}.json`);
  });

  it('splits a large subject into volumes under the cap, and is deterministic', () => {
    const many = Array.from({ length: 6 }, (_, i) => exam(`m${i}`, 2015 + i, 'baccalaureat', 'Mathématiques', 4000));
    const a = buildExamPacks(many, { maxPackBytes: 9000, now: 1 });
    const b = buildExamPacks([...many].reverse(), { maxPackBytes: 9000, now: 2 });
    expect(a.length).toBeGreaterThan(1);
    expect(a.map((p: any) => p.entry.id)).toEqual(a.map((_: any, i: number) => `exam-bac-mathematiques-${i + 1}`));
    a.forEach((p: any) => expect(p.entry.volumes).toBe(a.length));
    // Same content → same hash: an unchanged pack never shows "Mise à jour".
    expect(a.map((p: any) => p.entry.hash)).toEqual(b.map((p: any) => p.entry.hash));
    const manifest = parsePackManifest(JSON.stringify(buildManifest(a, 9)));
    expect(manifest?.packs).toHaveLength(a.length);
  });

  it('a manifest with junk entries keeps only valid ones', () => {
    const { entry } = packFixture();
    const m = parsePackManifest({ schema: 1, createdAt: 1, packs: [entry, { id: '../etc', kind: 'exam' }, { ...entry }, { ...entry, id: 'x2', file: '../../evil.json' }] });
    expect(m?.packs.map((p) => p.id)).toEqual([entry.id]);
    expect(parsePackManifest('<html>')).toBeNull();
    expect(parsePackManifest({ schema: 2, packs: [] })).toBeNull();
  });

  it('every real pack stays small enough for a metered phone', () => {
    const catalog = require('../../../public/exam_catalog.json');
    const packs = buildExamPacks(catalog, { now: 1 });
    const largestExam = Math.max(...catalog.map((e: any) => Buffer.byteLength(JSON.stringify(e))));
    expect(packs.length).toBeGreaterThan(20);
    for (const p of packs) expect(p.entry.sizeBytes).toBeLessThanOrEqual(Math.max(1_200_000, largestExam) + 200);
    // Every exam with questions is in exactly one pack.
    const ids = packs.flatMap((p: any) => JSON.parse(p.text).exams.map((e: any) => e.exam_id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('pack library', () => {
  const make = (budget = 10_000_000) => {
    const blobs = memoryPackBlobStore();
    const index = memoryIndex();
    return { blobs, index, lib: createPackLibrary({ blobs, index, budgetBytes: budget, now: () => 42 }) };
  };

  it('downloads, lists with sizes, finds an exam, and removes on request', async () => {
    const { lib, blobs } = make();
    const { entry, text } = packFixture();
    const stored = await lib.download(entry, async () => text);
    expect(stored).toMatchObject({ id: entry.id, sizeBytes: entry.sizeBytes, examIds: ['e1', 'e2'], downloadedAt: 42 });
    expect(await lib.usage()).toEqual({ usedBytes: entry.sizeBytes, budgetBytes: 10_000_000, count: 1 });
    expect(lib.statusOf(entry, await lib.list())).toBe('current');
    expect((await lib.findExam('e2'))?.exam.exam_id).toBe('e2');
    expect(await lib.findExam('nope')).toBeNull();
    await lib.remove(entry.id);
    expect(await lib.list()).toEqual([]);
    expect(blobs.size()).toBe(0);
    expect(await lib.findExam('e2')).toBeNull();
  });

  it('refuses a truncated download or the hosting fallback HTML', async () => {
    const { lib } = make();
    const { entry, text } = packFixture();
    await expect(lib.download(entry, async () => text.slice(0, -5))).rejects.toMatchObject({ code: 'integrity' });
    await expect(lib.download(entry, async () => '<!doctype html><html>…</html>')).rejects.toMatchObject({ code: 'integrity' });
    expect(await lib.list()).toEqual([]);
  });

  it('over budget: refuses BEFORE spending data and never evicts another pack', async () => {
    const first = packFixture();
    const { lib } = make(first.entry.sizeBytes + 10);
    await lib.download(first.entry, async () => first.text);
    const [other] = buildExamPacks([exam('z1', 2024, 'baccalaureat', 'Chimie')], { now: 1 });
    const fetchText = jest.fn(async () => other.text);
    await expect(lib.download(other.entry, fetchText)).rejects.toBeInstanceOf(PackError);
    await expect(lib.download(other.entry, fetchText)).rejects.toMatchObject({ code: 'budget' });
    expect(fetchText).not.toHaveBeenCalled();
    expect((await lib.list()).map((p) => p.id)).toEqual([first.entry.id]);
    expect(await lib.fits({ id: 'huge', sizeBytes: first.entry.sizeBytes + 11 })).toMatchObject({ ok: false, reason: 'too_large' });
  });

  it('an update replaces the old copy only once the new one is stored', async () => {
    const { lib, blobs } = make();
    const v1 = packFixture();
    await lib.download(v1.entry, async () => v1.text);
    const [v2] = buildExamPacks([exam('e1', 2024), exam('e2', 2023), exam('e3', 2025)], { now: 2 });
    expect(v2.entry.id).toBe(v1.entry.id);
    expect(lib.statusOf(v2.entry, await lib.list())).toBe('update');

    // A failed update (storage full) keeps v1 fully readable.
    const realWrite = blobs.write;
    blobs.write = async () => { throw new Error('quota'); };
    await expect(lib.install(v2.entry, v2.text)).rejects.toMatchObject({ code: 'storage' });
    blobs.write = realWrite;
    expect((await lib.list())[0].hash).toBe(v1.entry.hash);
    expect((await lib.findExam('e1'))?.exam.exam_id).toBe('e1');

    await lib.install(v2.entry, v2.text);
    expect((await lib.list())[0].hash).toBe(v2.entry.hash);
    expect((await lib.findExam('e3'))?.exam.exam_id).toBe('e3');
    expect(blobs.size()).toBe(1); // the old version's blob is gone
  });

  it('a pack the manifest no longer lists is kept (retired), never silently dropped', async () => {
    const { lib } = make();
    const v1 = packFixture();
    await lib.download(v1.entry, async () => v1.text);
    const retired = lib.retired({ schema: 1, createdAt: 1, packs: [] }, await lib.list());
    expect(retired.map((p) => p.id)).toEqual([v1.entry.id]);
    expect(await lib.list()).toHaveLength(1);
  });

  it('remove all clears every pack and blob', async () => {
    const { lib, blobs } = make();
    const v1 = packFixture();
    const [other] = buildExamPacks([exam('z1', 2024, 'baccalaureat', 'Chimie')], { now: 1 });
    await lib.download(v1.entry, async () => v1.text);
    await lib.download(other.entry, async () => other.text);
    expect(await lib.removeAll()).toBe(2);
    expect(await lib.list()).toEqual([]);
    expect(blobs.size()).toBe(0);
  });

  it('a blob that does not match its record is not trusted', async () => {
    const { lib, blobs, index } = make();
    const v1 = packFixture();
    await lib.download(v1.entry, async () => v1.text);
    await blobs.write(`${v1.entry.id}.${v1.entry.hash}`, v1.text.replace('e1', 'e9'));
    // A fresh library over the same storage (a relaunch) re-reads the blob.
    const fresh = createPackLibrary({ blobs, index, budgetBytes: 10_000_000 });
    expect(await fresh.findExam('e1')).toBeNull();
  });

  it('practice packs are built on the device with an exact size, and their rows read back', async () => {
    const rows = [
      ...Array.from({ length: 4 }, (_, i) => ({ id: `q${i}`, question: `Q${i}`, options: '["a","b"]', correct_answer: 'A', subject_code: 'CHEM-NSI', unit: 'U1', secret: 'x' })),
      { id: 'x', question: 'Q', subject_code: 'PHYS-NSI' },
    ];
    const packs = buildPracticePacks(rows, (code) => ({ title: code, level: code.split('-')[1], subject: code.split('-')[0] }), 7);
    expect(packs).toHaveLength(1); // PHYS has fewer than 3 questions
    expect(packs[0].entry).toMatchObject({ id: 'practice-chem-nsi', kind: 'practice', items: 4, sizeBytes: utf8Bytes(packs[0].text) });
    expect(JSON.parse(packs[0].text).questions[0].secret).toBeUndefined();
    const { lib } = make();
    await lib.install(packs[0].entry, packs[0].text);
    expect((await lib.practiceRows()).map((r) => r.id)).toEqual(['q0', 'q1', 'q2', 'q3']);
    expect((await lib.list())[0].subjectCodes).toEqual(['CHEM-NSI']);
  });
});

describe('chunked key/value blob store (AsyncStorage fallback)', () => {
  it('round-trips large text in chunks and a failed write leaves nothing half-written', async () => {
    const index = memoryIndex();
    const store = chunkedPackBlobStore(index, { chunkChars: 1024 });
    const text = 'é'.repeat(5000);
    await store.write('p.1', text);
    expect(await store.read('p.1')).toBe(text);
    expect([...index.map.keys()].filter((k) => k.includes('p.1:')).length).toBe(6); // 5 chunks + count
    await store.remove('p.1');
    expect(index.map.size).toBe(0);

    let calls = 0;
    const flaky = { ...index, setItem: async (k: string, v: string) => { calls += 1; if (calls === 3) throw new Error('full'); index.map.set(k, v); } };
    const store2 = chunkedPackBlobStore(flaky, { chunkChars: 1024 });
    await expect(store2.write('p.2', text)).rejects.toThrow('full');
    expect(await store2.read('p.2')).toBeNull();
    expect([...index.map.keys()].some((k) => k.includes('p.2'))).toBe(false);
  });
});
