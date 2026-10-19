import React from 'react';
import { Alert, Text, TouchableOpacity } from 'react-native';
import useStore from '../../contexts/store';
import ClassesScreen from '../ClassesScreen';
import { classRequest } from '../../services/classService';
const renderer = require('react-test-renderer');
const { act } = renderer;
jest.mock('../../services/classService', () => ({ classRequest: jest.fn() }));
jest.mock('@react-navigation/native', () => ({ useFocusEffect: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));
jest.mock('../../components/ui/Button', () => ({ __esModule: true, default: ({ label, onPress, disabled }: any) => {
  const RN = require('react-native');
  return <RN.TouchableOpacity accessibilityLabel={label} onPress={onPress} disabled={disabled}><RN.Text>{label}</RN.Text></RN.TouchableOpacity>;
} }));
const request = classRequest as jest.Mock;
const navigate = jest.fn();
const home = { canTeach: false, classes: [{ id: 'c1', title: 'NS4 A', school: 'School', pending: false, teacher: false }] };
const detail = {
  classroom: { id: 'c1', title: 'NS4 A', school: 'School', grade: 'NS4', archived: false, assignments: [{ id: 'a1', title: 'Maths', examId: 'exam1', level: 'terminale', dueAt: 1792500000000 }] },
  teacher: false, pending: [], members: [{ uid: 's1', name: 'Élève', xp: 20, completed: 0 }], completed: [], completionCounts: {}, scores: {}, week: '2026-10-19',
};
beforeEach(() => {
  jest.clearAllMocks(); useStore.setState({ user: { uid: 's1', name: 'Élève' }, language: 'fr' } as any);
  request.mockImplementation(async (action) => action === 'read' ? detail : home);
});
it('loads the native class with its own React runtime and opens the assigned exam', async () => {
  let view: any;
  await act(async () => { view = renderer.create(<ClassesScreen navigation={{ navigate, goBack: jest.fn() }} />); });
  const open = view.root.findAllByType(TouchableOpacity).find((n: any) => n.props.accessibilityLabel === 'Ouvrir');
  await act(async () => { open.props.onPress(); });
  expect(view.root.findAllByType(Text).some((n: any) => n.props.children === 'Tableau de la semaine')).toBe(true);
  const exam = view.root.findAllByType(TouchableOpacity).find((n: any) => n.props.accessibilityLabel === 'Ouvrir l’examen');
  act(() => exam.props.onPress());
  expect(navigate).toHaveBeenCalledWith('Main', { screen: 'Exams', params: { screen: 'ExamOverview', params: { examId: 'exam1', level: 'terminale' }, initial: false } });
  await act(async () => view.unmount());
});
it('requires a confirmation before leaving a class', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  let view: any;
  await act(async () => { view = renderer.create(<ClassesScreen navigation={{ navigate, goBack: jest.fn() }} />); });
  await act(async () => { view.root.findAllByType(TouchableOpacity).find((n: any) => n.props.accessibilityLabel === 'Ouvrir').props.onPress(); });
  act(() => view.root.findAllByType(TouchableOpacity).find((n: any) => n.props.accessibilityLabel === 'Quitter la classe').props.onPress());
  expect(alert).toHaveBeenCalled(); expect(request.mock.calls.some(([action]) => action === 'leave')).toBe(false);
  await act(async () => view.unmount()); alert.mockRestore();
});
