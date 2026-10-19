import { auth } from './firebase';
import { createAmbassadorClient } from '../../../shared/ambassadors';

export const ambassadorRequest = createAmbassadorClient('https://academy.edlight.org', () => auth.currentUser?.getIdToken() ?? Promise.resolve(null));
