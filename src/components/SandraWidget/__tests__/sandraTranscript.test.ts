import { MAX_MESSAGES, readDraft, readTranscript, writeDraft, writeTranscript } from '../sandraTranscript';

beforeEach(() => sessionStorage.clear());

describe('Sandra web transcript (CON-04)', () => {
  const msgs = [{ role: 'user' as const, text: 'Bonjou' }, { role: 'assistant' as const, text: 'Bonjou! Kijan m ka ede w?' }];

  it('restores for the same student and conversation only', () => {
    writeTranscript('alice', 'conv-1', msgs);
    expect(readTranscript('alice', 'conv-1')).toEqual(msgs);
    expect(readTranscript('bob', 'conv-1')).toEqual([]);
    expect(readTranscript('alice', 'conv-2')).toEqual([]);
    expect(readTranscript('alice', null)).toEqual([]);
    expect(readTranscript(null, 'conv-1')).toEqual([]);
  });

  it('an Explique-moi thread (written with no uid) clears instead of persisting', () => {
    writeTranscript('alice', 'conv-1', msgs);
    writeTranscript(null, 'conv-1', msgs);
    expect(readTranscript('alice', 'conv-1')).toEqual([]);
  });

  it('is bounded and drops junk', () => {
    const many = Array.from({ length: 70 }, (_, i) => ({ role: 'user' as const, text: `m${i}` }));
    writeTranscript('alice', 'c', many);
    const back = readTranscript('alice', 'c');
    expect(back).toHaveLength(MAX_MESSAGES);
    expect(back[back.length - 1].text).toBe('m69');
    sessionStorage.setItem('edlight:sandra:transcript', JSON.stringify({ uid: 'alice', convId: 'c', messages: [{ role: 'system', text: 'x' }, null] }));
    expect(readTranscript('alice', 'c')).toEqual([]);
  });

  it('keeps the half-typed question per account', () => {
    writeDraft('alice', 'Kisa yon fonksyon');
    expect(readDraft('alice')).toBe('Kisa yon fonksyon');
    expect(readDraft('bob')).toBe('');
    writeDraft('alice', '   ');
    expect(readDraft('alice')).toBe('');
  });
});
