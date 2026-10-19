import { getIdToken } from './firebase';
import { createCompetitionClient } from '../../shared/competition/client';
import { trackEvent } from '../utils/telemetry';
export const competitionRequest = createCompetitionClient({
  base: '',
  token: getIdToken,
  track: trackEvent,
});
