import {
  LEGACY_VIDEO_POS_KEY, videoPositionsKey, readVideoPositions, saveVideoPosition, clearVideoPosition, resumeSecondsFor,
} from '../videoPositions';
import { readResumeSeconds } from '../../components/journey/home/homeJourney';

beforeEach(() => { localStorage.clear(); });

describe('video positions are per student', () => {
  it('two accounts on one browser never see each other’s position', () => {
    saveVideoPosition('alice', 'chem-ns1:L1', 252, 600);
    expect(resumeSecondsFor('alice', 'chem-ns1:L1')).toBe(252);
    expect(resumeSecondsFor('bob', 'chem-ns1:L1')).toBe(0);
    // Home reads the same per-uid bucket ("Reprend à 4:12").
    expect(readResumeSeconds('chem-ns1', 'L1', 'alice')).toBe(252);
    expect(readResumeSeconds('chem-ns1', 'L1', 'bob')).toBe(0);
  });

  it('guests keep their own bucket', () => {
    saveVideoPosition(null, 'chem-ns1:L1', 90, 600);
    expect(localStorage.getItem(videoPositionsKey(null))).toContain('chem-ns1:L1');
    expect(resumeSecondsFor(undefined, 'chem-ns1:L1')).toBe(90);
    expect(resumeSecondsFor('alice', 'chem-ns1:L1')).toBe(0);
  });

  it('keeps the thresholds: under 15 s or essentially finished is no resume; clear forgets', () => {
    saveVideoPosition('alice', 'a:1', 10, 600);
    expect(resumeSecondsFor('alice', 'a:1')).toBe(0);
    saveVideoPosition('alice', 'a:2', 590, 600);
    expect(readVideoPositions('alice')['a:2']).toBeUndefined();
    saveVideoPosition('alice', 'a:3', 120, 600);
    clearVideoPosition('alice', 'a:3');
    expect(resumeSecondsFor('alice', 'a:3')).toBe(0);
  });

  it('migrates the old device-wide map into the first signed-in student, once', () => {
    localStorage.setItem(LEGACY_VIDEO_POS_KEY, JSON.stringify({ 'chem-ns1:L1': { t: 252, d: 600 }, 'x:1': { t: 40, d: 0 } }));
    saveVideoPosition('alice', 'x:1', 300, 900); // her own newer entry wins
    expect(localStorage.getItem(LEGACY_VIDEO_POS_KEY)).toBeNull();
    expect(resumeSecondsFor('alice', 'chem-ns1:L1')).toBe(252);
    expect(resumeSecondsFor('alice', 'x:1')).toBe(300);
    // A second account on the same device inherits nothing.
    expect(resumeSecondsFor('bob', 'chem-ns1:L1')).toBe(0);
  });

  it('a guest read does not consume the legacy map', () => {
    localStorage.setItem(LEGACY_VIDEO_POS_KEY, JSON.stringify({ 'chem-ns1:L1': { t: 252, d: 600 } }));
    expect(resumeSecondsFor(null, 'chem-ns1:L1')).toBe(0);
    expect(localStorage.getItem(LEGACY_VIDEO_POS_KEY)).not.toBeNull();
    expect(readResumeSeconds('chem-ns1', 'L1', 'alice')).toBe(252);
  });

  it('survives unreadable storage', () => {
    localStorage.setItem(videoPositionsKey('alice'), '{not json');
    expect(resumeSecondsFor('alice', 'a:1')).toBe(0);
    saveVideoPosition('alice', 'a:1', 60, 600);
    expect(resumeSecondsFor('alice', 'a:1')).toBe(60);
  });
});
