import React from 'react';
import { Alert, Share, Text, TouchableOpacity } from 'react-native';
import useStore from '../../contexts/store';
import ProgressShareScreen from '../ProgressShareScreen';
import AmbassadorScreen from '../AmbassadorScreen';
import { shareRequest } from '../../services/progressShareService';
import { ambassadorRequest } from '../../services/ambassadorService';
const renderer = require('react-test-renderer');
const { act } = renderer;
jest.mock('../../services/progressShareService', () => ({ shareRequest: jest.fn() }));
jest.mock('../../services/ambassadorService', () => ({ ambassadorRequest: jest.fn() }));
jest.mock('../../services/referralService', () => ({ logInviteSent: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));
jest.mock('../../components/ui/Button', () => ({ __esModule: true, default: ({ label, onPress, disabled, accessibilityLabel }: any) => {
  const RN = require('react-native');
  return <RN.TouchableOpacity accessibilityLabel={accessibilityLabel || label} onPress={onPress} disabled={disabled}><RN.Text>{label}</RN.Text></RN.TouchableOpacity>;
} }));
jest.setTimeout(60000);
const request = shareRequest as jest.Mock;
const nav = { navigate: jest.fn(), goBack: jest.fn() };
const press = (view: any, label: string) => view.root.findAllByType(TouchableOpacity).find((n: any) => n.props.accessibilityLabel === label).props.onPress();
const texts = (view: any) => view.root.findAllByType(Text).map((n: any) => [].concat(n.props.children).join('')).join('\n');

beforeEach(() => { jest.clearAllMocks(); useStore.setState({ user: { uid: 's1', name: 'Marie' }, language: 'fr' } as any); });

it('creates a link for the chosen duration, opens the share sheet with one sentence, and revokes after confirming', async () => {
  let shares: any[] = [];
  request.mockImplementation(async (action: string) => {
    if (action === 'list') return { shares };
    if (action === 'create') { shares = [{ id: 'h1', createdAt: Date.now(), expiresAt: Date.now() + 7 * 86400000, lastViewedAt: Date.now(), views: 2 }]; return { token: 'T'.repeat(32) }; }
    return { ok: true };
  });
  const sheet = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as any);
  let view: any;
  await act(async () => { view = renderer.create(<ProgressShareScreen navigation={nav} />); });
  expect(texts(view)).toContain('Aucun lien actif.');
  expect(texts(view)).toContain('jamais tes réponses');
  act(() => press(view, '7 jours'));
  await act(async () => { press(view, 'Créer et partager le lien'); });
  expect(request).toHaveBeenCalledWith('create', { days: 7 });
  expect(sheet).toHaveBeenCalledWith({ message: `Voici le suivi de mes progrès sur EdLight Academy : https://academy.edlight.org/suivi/${'T'.repeat(32)}` });
  expect(texts(view)).toContain('Ouvert 2 fois');
  const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons: any) => { buttons[1].onPress(); });
  await act(async () => { press(view, 'Désactiver'); });
  expect(alert).toHaveBeenCalled();
  expect(request).toHaveBeenCalledWith('revoke', { id: 'h1' });
  await act(async () => view.unmount());
  sheet.mockRestore(); alert.mockRestore();
});

it('the ambassador dashboard shows server figures in Kreyòl', async () => {
  useStore.setState({ language: 'ht' } as any);
  const s = { recruits: 4, retained: 2, retainedUnflagged: 2, pending: 1, notRetained: 1, flagged: 0 };
  (ambassadorRequest as jest.Mock).mockResolvedValue({ school: 'Lycée Pétion', code: 'ABC234', link: 'https://academy.edlight.org/?ref=ABC234', period: '2026-10',
    total: s, thisPeriod: s, schoolProgress: { week: null, allTime: { rank: 3, of: 40, totalXp: 5000, members: 20 } } });
  let view: any;
  await act(async () => { view = renderer.create(<AmbassadorScreen navigation={nav} />); });
  const all = texts(view);
  expect(all).toContain('Lycée Pétion');
  expect(all).toContain('ABC234');
  expect(all).toContain('3yèm sou 40');
  expect(all).toContain('Rekri aktif');
  await act(async () => view.unmount());
});

it('a student who is not an ambassador gets the pitch and opens EdLight Apply', async () => {
  const { Linking } = require('react-native');
  const { AMBASSADOR_APPLY_URL, AmbassadorError } = require('../../../../shared/ambassadors');
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  (ambassadorRequest as jest.Mock).mockRejectedValue(new AmbassadorError('forbidden'));
  let view: any;
  await act(async () => { view = renderer.create(<AmbassadorScreen navigation={nav} />); });
  expect(texts(view)).toContain('Devenir ambassadeur');
  expect(texts(view)).toContain('Au plus 2 ambassadeurs par école.');
  await act(async () => { press(view, 'Postuler sur EdLight Apply'); });
  expect(open).toHaveBeenCalledWith(AMBASSADOR_APPLY_URL);
  await act(async () => view.unmount());
  useStore.setState({ user: null, language: 'ht' } as any);
  await act(async () => { view = renderer.create(<AmbassadorScreen navigation={nav} />); });
  expect(texts(view)).toContain('Vin anbasadè');
  expect(texts(view)).toContain('Aplike sou EdLight Apply');
  await act(async () => view.unmount());
});
