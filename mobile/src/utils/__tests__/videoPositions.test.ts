import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  formatResume, nextPositions, resumeSecondsFor, resumeSecondsFrom, saveVideoPosition, videoPositionsKey,
} from '../videoPositions';
import { youTubeEmbedUrl } from '../videoThumb';

describe('mobile video resume positions (same rules as the web)', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });

  it('saves per student and resumes after 15 s', async () => {
    await saveVideoPosition('alice', 'c:l1', 125.4, 600);
    expect(await resumeSecondsFor('alice', 'c:l1')).toBe(125);
    expect(await resumeSecondsFor('bob', 'c:l1')).toBe(0);
    expect(await resumeSecondsFor(null, 'c:l1')).toBe(0);
    expect(videoPositionsKey('alice')).not.toBe(videoPositionsKey(null));
  });

  it('forgets a finished video and ignores tiny positions', async () => {
    await saveVideoPosition('alice', 'c:l1', 300, 600);
    await saveVideoPosition('alice', 'c:l1', 590, 600);
    expect(await resumeSecondsFor('alice', 'c:l1')).toBe(0);
    expect(resumeSecondsFrom({ t: 10 })).toBe(0);
    expect(nextPositions({}, 'k', 3)).toEqual({});
  });

  it('is bounded', () => {
    let m = {};
    for (let i = 0; i < 230; i += 1) m = nextPositions(m, `c:${i}`, 60, 600);
    expect(Object.keys(m)).toHaveLength(200);
    expect(m).not.toHaveProperty('c:0');
    expect(m).toHaveProperty('c:229');
  });

  it('survives unreadable storage', async () => {
    await AsyncStorage.setItem(videoPositionsKey('alice'), '{nope');
    expect(await resumeSecondsFor('alice', 'c:l1')).toBe(0);
  });

  it('formats the resume label', () => {
    expect(formatResume(125)).toBe('2:05');
  });
});

describe('embed URL for resume', () => {
  it('adds start= and the widget protocol only when asked', () => {
    const url = youTubeEmbedUrl('abc', { autoplay: true, start: 125.9, jsapiOrigin: 'https://edlight-academy.web.app' });
    expect(url).toContain('&start=125');
    expect(url).toContain('&enablejsapi=1&origin=https%3A%2F%2Fedlight-academy.web.app');
    expect(url.startsWith('https://www.youtube-nocookie.com/embed/abc?')).toBe(true);
    expect(youTubeEmbedUrl('abc', { start: 0 })).not.toContain('start=');
  });
});
