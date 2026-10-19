import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ArenaSoundEngine, STORAGE_KEY, loadSettings } from '../arenaSound';
import { COMPETITION_CUE_SOUND, playCompetitionCue } from '../competitionCues';
import { pressSoundToggle } from '../toggle';
import { MockAudioContext, memoryStorage } from './mockAudio';
import { SoundSetting } from '../../../pages/profile/ProfileSections';

// ProfileSections' data helpers reach Firebase; the switch needs none of them.
jest.mock('../../../services/firebase', () => ({}));
jest.mock('../../../services/authService', () => ({}));
jest.mock('../../../services/reviewService', () => ({}));
jest.mock('../../../services/masteryService', () => ({}));
jest.mock('../../../services/streakService', () => ({ STREAK_MILESTONES: [] }));
jest.mock('../../../components/UserAvatar', () => () => null);
jest.mock('../../../pages/profile/profileData', () => ({}));

const make = (storage = memoryStorage()) => ({
  storage,
  engine: new ArenaSoundEngine({ storage, createContext: () => new MockAudioContext() as unknown as AudioContext }),
});

describe('competition cues (roadmap P2 sound)', () => {
  it('maps the five cues onto distinct engine sounds (submission ≠ correctness)', () => {
    expect(COMPETITION_CUE_SOUND).toEqual({
      roundStart: 'reveal', locked: 'submitted', correct: 'correct', wrong: 'incorrect', podium: 'victory',
    });
    expect(new Set(Object.values(COMPETITION_CUE_SOUND)).size).toBe(5);
  });

  it('is silent by default: nothing plays until "Sons" is turned on', () => {
    const { engine } = make();
    const play = jest.spyOn(engine, 'play');
    for (const cue of ['roundStart', 'locked', 'correct', 'wrong', 'podium'] as const) {
      expect(playCompetitionCue(cue, engine)).toBe(false);
    }
    // The engine was asked, and refused every one: no voice was created.
    expect(play).toHaveBeenCalledTimes(5);
    expect(play.mock.results.every((r) => r.value.played === false)).toBe(true);
  });

  it('plays once on, and is silent again once off (muted) — persisted per device', () => {
    const { engine, storage } = make();
    pressSoundToggle(engine); // on
    expect(playCompetitionCue('correct', engine)).toBe(true);
    expect(loadSettings(storage)).toMatchObject({ enabled: true, muted: false });
    pressSoundToggle(engine); // off
    expect(playCompetitionCue('correct', engine)).toBe(false);
    // Next visit on this device keeps "off".
    const again = make(storage).engine;
    expect(playCompetitionCue('podium', again)).toBe(false);
  });

  it('never throws and ignores a missing cue', () => {
    expect(playCompetitionCue(null)).toBe(false);
    const broken = { play: () => { throw new Error('boom'); } };
    expect(playCompetitionCue('locked', broken)).toBe(false);
  });
});

describe('the "Sons" switch in Réglages', () => {
  it('defaults to off, turns on with a click and remembers it', () => {
    // The page's engine singleton is first created here, on clean storage.
    window.localStorage.clear();
    const t = (fr: string) => fr;
    render(<SoundSetting t={t} />);
    const sw = screen.getByRole('switch', { name: 'Sons' });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(sw);
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}')).toMatchObject({ enabled: true, muted: false });
    fireEvent.click(sw);
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}')).toMatchObject({ muted: true });
  });
});
