import { getIdToken } from './firebase';
import { trackEvent } from '../utils/telemetry';
import { createClassClient } from '../../shared/classClient';
export const classRequest = createClassClient('', getIdToken, trackEvent);
