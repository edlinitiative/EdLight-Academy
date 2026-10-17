// arenaHubCopy reads formatCountdown from the Firestore service; keep Firebase out.
jest.mock('../../services/arenaService', () => ({ formatCountdown: () => '00:00' }));

import { stateStatus, statusLabelText, watchStatus } from '../arenaStatus';
import { ARENA_STATES } from '../../../../shared/arena/state';
import { hubEventCopy } from '../../components/arena/arenaHubCopy';

const fr = (f: string) => f;

describe('tournament status badge (M5)', () => {
  it('maps every tournament state to its own explicit label', () => {
    const labels = ARENA_STATES.map((s) => statusLabelText(stateStatus(s), fr));
    expect(labels).toEqual([
      'Bientôt', 'Inscriptions ouvertes', 'Portes ouvertes', 'En direct',
      'Calcul des scores', 'Provisoire', 'Officiel', 'Annulé',
    ]);
  });

  it('only calls the live state "En direct"', () => {
    for (const s of ARENA_STATES) {
      if (s === 'live') continue;
      expect(stateStatus(s)).not.toBe('live');
    }
    expect(stateStatus(null)).toBe('soon');
    expect(stateStatus('something-new')).toBe('soon');
  });

  it('says reconnecting over any state when the data is not current', () => {
    expect(watchStatus({ state: 'live', stale: true, reconnecting: false })).toBe('reconnecting');
    expect(watchStatus({ state: 'final', stale: false, reconnecting: true })).toBe('reconnecting');
    expect(watchStatus({ state: 'doors', stale: false, reconnecting: false })).toBe('doors');
    expect(watchStatus({ state: 'registration', stale: false, reconnecting: false })).toBe('registration');
  });

  it('has a Creole label for every badge', () => {
    const ht = (_f: string, h: string) => h;
    for (const s of ARENA_STATES) expect(statusLabelText(stateStatus(s), ht)).toBeTruthy();
    expect(statusLabelText('doors', ht)).toBe('Pòt yo louvri');
  });

  it('the hub card uses the same explicit badges', () => {
    const tour = (state: string) => ({ state, startsAt: 0, doorsAt: 0 });
    expect(hubEventCopy('open', tour('registration'), 0, fr).pill).toBe('registration');
    expect(hubEventCopy('open', tour('doors'), 0, fr).pill).toBe('doors');
    expect(hubEventCopy('rejoin', tour('doors'), 0, fr).pill).toBe('doors');
    expect(hubEventCopy('results', tour('grading'), 0, fr).pill).toBe('grading');
    expect(hubEventCopy('results', tour('provisional'), 0, fr).pill).toBe('provisional');
    expect(hubEventCopy('results', tour('final'), 0, fr).pill).toBe('final');
  });
});
