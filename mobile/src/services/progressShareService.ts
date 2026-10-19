import { auth } from './firebase';
import { trackEvent } from './telemetry';
import { createProgressShareClient } from '../../../shared/progressShare';

export const shareRequest = createProgressShareClient('https://academy.edlight.org', () => auth.currentUser?.getIdToken() ?? Promise.resolve(null), trackEvent);
