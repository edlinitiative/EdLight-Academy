import { getIdToken } from './firebase';
import { createAmbassadorClient } from '../../shared/ambassadors';

export const ambassadorRequest = createAmbassadorClient('', getIdToken);
