import AsyncStorage from '@react-native-async-storage/async-storage';

let mockNext = 'denied';
const mockPerm = { status: 'undetermined', canAskAgain: true };
const mockRequest = jest.fn(async () => {
  mockPerm.status = mockNext;
  mockPerm.canAskAgain = false;
  return { status: mockNext };
});

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ ...mockPerm })),
  requestPermissionsAsync: (...a: any[]) => (mockRequest as any)(...a),
  setNotificationChannelAsync: jest.fn(async () => {}),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  scheduleNotificationAsync: jest.fn(async () => 'id-1'),
  AndroidImportance: { HIGH: 4, DEFAULT: 3 },
  SchedulableTriggerInputTypes: { DAILY: 'daily', WEEKLY: 'weekly' },
}));
jest.mock('../pushService', () => ({ registerForPushNotifications: jest.fn(async () => null) }));

import * as Notifications from 'expo-notifications';
import { Linking } from 'react-native';
import { askForNotifications, setStudyReminder, requestPermissions } from '../notificationService';
import { registerPromptHost, usePromptState } from '../../settings/notificationPrompt';

/** Answer the pre-prompt sheet the moment it appears. */
function answerSheet(confirm: boolean) {
  const unsub = usePromptState.subscribe((s) => {
    if (s.request) { unsub(); s.request.resolve(confirm); }
  });
}

let unregister: () => void;
beforeEach(async () => {
  await AsyncStorage.clear();
  mockPerm.status = 'undetermined'; mockPerm.canAskAgain = true;
  mockNext = 'denied';
  jest.clearAllMocks();
  unregister = registerPromptHost();
  jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined as any);
});
afterEach(() => unregister());

describe('askForNotifications', () => {
  it('the legacy requestPermissions() no longer opens the OS dialog', async () => {
    expect(await requestPermissions()).toBe(false);
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('"Pas maintenant" on the explanation → the OS is never asked', async () => {
    answerSheet(false);
    expect(await askForNotifications('profile')).toBe('declined');
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('"Activer" → OS dialog once; granted turns the preference on', async () => {
    mockNext = 'granted';
    answerSheet(true);
    expect(await askForNotifications('study-reminder')).toBe('granted');
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(await AsyncStorage.getItem('@edlight:notifications_enabled')).toBe('true');
    // already granted → no sheet, no dialog
    expect(await askForNotifications('arena-event')).toBe('granted');
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it('after a denial: settings path, never a second OS dialog', async () => {
    answerSheet(true);
    expect(await askForNotifications('profile')).toBe('denied');
    expect(mockRequest).toHaveBeenCalledTimes(1);

    answerSheet(true); // "Ouvrir les réglages"
    expect(await askForNotifications('profile')).toBe('blocked');
    expect(usePromptState.getState().request).toBeNull();
    expect(Linking.openSettings).toHaveBeenCalledTimes(1);
    expect(mockRequest).toHaveBeenCalledTimes(1);

    // Silent variant for callers that show their own state.
    expect(await askForNotifications('arena-event', { offerSettings: false })).toBe('blocked');
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it('Android 13 style "can ask again" after one refusal is still never re-prompted', async () => {
    await AsyncStorage.setItem('@edlight:notif_os_prompt_shown', '1');
    mockPerm.status = 'undetermined'; mockPerm.canAskAgain = true;
    answerSheet(false);
    expect(await askForNotifications('profile')).toBe('blocked');
    expect(mockRequest).not.toHaveBeenCalled();
  });
});

describe('setStudyReminder', () => {
  it('choosing a time asks (with explanation) and schedules one daily reminder', async () => {
    mockNext = 'granted';
    answerSheet(true);
    expect(await setStudyReminder(19)).toBe('granted');
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const arg = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(arg.trigger).toMatchObject({ type: 'daily', hour: 19, minute: 0 });
    expect(arg.content.data).toEqual({ type: 'study-reminder' });
    expect(await AsyncStorage.getItem('@edlight:study_reminder_hour')).toBe('19');
  });

  it('"off" never asks for permission', async () => {
    expect(await setStudyReminder(null)).toBe('off');
    expect(mockRequest).not.toHaveBeenCalled();
    expect(usePromptState.getState().request).toBeNull();
    expect(await AsyncStorage.getItem('@edlight:study_reminder_hour')).toBe('off');
  });
});
