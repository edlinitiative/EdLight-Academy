import { auth } from './firebase';
import { trackEvent } from './telemetry';
import { createClassClient } from '../../../shared/classClient';
export const classRequest = createClassClient('https://academy.edlight.org', () => auth.currentUser?.getIdToken() ?? Promise.resolve(null), trackEvent);
