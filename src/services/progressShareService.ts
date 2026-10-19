import { getIdToken } from './firebase';
import { trackEvent } from '../utils/telemetry';
import { createProgressShareClient } from '../../shared/progressShare';

export const shareRequest = createProgressShareClient('', getIdToken, trackEvent);
