import { auth } from './firebase';
import { createCompetitionClient } from '../../../shared/competition/client';
import { trackEvent } from './telemetry';
export const competitionRequest = createCompetitionClient({
  base: 'https://academy.edlight.org',
  token: () => auth.currentUser?.getIdToken() ?? Promise.resolve(null),
  track: trackEvent,
});
