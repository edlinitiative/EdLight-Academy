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
jest.mock('../../components/ui/PressableScale', () => ({ __esModule: true, default: ({ children, onPress, accessibilityLabel, disabled }: any) => {
  const RN = require('react-native');
  return <RN.TouchableOpacity accessibilityLabel={accessibilityLabel} onPress={onPress} disabled={disabled}>{children}</RN.TouchableOpacity>;
} }));
jest.mock('../../utils/examCatalog', () => ({ fetchCatalogIndex: async () => [] }));
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

describe('teacher tools on native', () => {
  const teacherHome = { canTeach: true, classes: [{ id: 'c1', title: 'NS4 A', school: 'School', pending: false, teacher: true }] };
  const fixture = { id: 'f1', state: 'accepted', side: 'home', title: 'Défi', opponent: { title: 'NS4 B', school: 'Autre' }, startsAt: 1792500000000, endsAt: 1792600000000, teamSize: 3, aggregate: 'average', questionCount: 10, tid: 'fxf1', phase: 'final', mine: { score: 4000, counted: 3, members: 3, qualified: true, needed: 0 }, theirs: { score: 3000, counted: 3, members: 8, qualified: true, needed: 0 }, outcome: 'win' };
  const teacherDetail = {
    ...detail, teacher: true, classroom: { ...detail.classroom, code: 'ABC234' },
    pending: [{ uid: 'p1', name: 'Paul' }],
    members: [{ uid: 's1', name: 'Élève Un', xp: 20, completed: 0, house: null }],
    houses: [], fixtures: [fixture], fixtureCategories: [{ id: 'capitals', name: 'Capitales', nameHt: 'Kapital' }],
  };
  const analytics = { courses: [{ id: 'math-ns4', name: 'Maths NS4' }], courseId: 'math-ns4', shared: 1, notShared: 0,
    chapters: [{ id: 'U1', title: 'Fonctions', lessons: 2, counts: { none: 0, seen: 0, familiar: 0, proficient: 0, mastered: 1 }, percent: { none: 0, seen: 0, familiar: 0, proficient: 0, mastered: 100 }, avgPoints: 100, lessonRows: [] }],
    students: [{ uid: 's1', name: 'Élève Un', points: 100, levels: { U1: 'mastered' } }], weakest: [], assignments: [] };
  const texts = (view: any): string[] => view.root.findAllByType(Text).map((n: any) => [].concat(n.props.children).join(''));
  const press = (view: any, label: string) => act(async () => { view.root.findAllByType(TouchableOpacity).find((n: any) => n.props.accessibilityLabel === label).props.onPress(); });
  const openClass = async () => {
    let view: any;
    await act(async () => { view = renderer.create(<ClassesScreen navigation={{ navigate, goBack: jest.fn() }} />); });
    await press(view, 'Ouvrir');
    return view;
  };
  beforeEach(() => {
    useStore.setState({ user: { uid: 't1', name: 'Prof' }, language: 'fr' } as any);
    request.mockImplementation(async (action) => action === 'read' ? teacherDetail : action === 'analytics' ? analytics : action === 'home' ? teacherHome : { ok: true });
  });
  it('offers creation, approval, houses, fixtures, analytics and a confirmed archive', async () => {
    let view: any;
    await act(async () => { view = renderer.create(<ClassesScreen navigation={{ navigate, goBack: jest.fn() }} />); });
    expect(texts(view)).toContain('Créer une classe');
    await act(async () => view.unmount());
    view = await openClass();
    await press(view, 'Approuver'); // the Button mock exposes its visible label
    expect(request).toHaveBeenCalledWith('approve', { id: 'c1', studentUid: 'p1' });
    expect(texts(view).some((x) => x.includes('ABC234'))).toBe(true);
    expect(texts(view)).toContain('Maîtrisé 1 (100 %)');
    expect(texts(view)).toContain('Victoire de ta classe');
    expect(texts(view)).toContain('Publier un devoir');
    await press(view, 'Voir le classement');
    expect(navigate).toHaveBeenCalledWith('Tournois', { tournamentId: 'fxf1' });
    await press(view, 'Créer des maisons');
    await press(view, 'Enregistrer');
    expect(request).toHaveBeenCalledWith('houses-set', expect.objectContaining({ id: 'c1', mode: 'auto', houses: expect.arrayContaining([{ name: 'Toussaint', color: 'azure' }]) }));
    await press(view, 'Défier une autre classe');
    await press(view, 'Capitales');
    await press(view, 'Créer le défi');
    expect(request).toHaveBeenCalledWith('fixture-propose', expect.objectContaining({ id: 'c1', categories: ['capitals'], aggregate: 'average', teamSize: 5 }));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await press(view, 'Archiver');
    expect(alert).toHaveBeenCalled(); expect(request.mock.calls.some(([a]) => a === 'archive')).toBe(false);
    alert.mockRestore();
    await act(async () => view.unmount());
  });
  it('a student enters a fixture for their class, sees their house and re-accepts the disclosure', async () => {
    useStore.setState({ user: { uid: 's1', name: 'Élève' }, language: 'ht' } as any);
    const studentDetail = { ...detail, houses: [{ id: 'h1', name: 'Toussaint', color: 'azure', xp: 20, completed: 0, members: 1, rank: 1 }], myHouse: 'h1', consentCurrent: false,
      fixtures: [{ ...fixture, phase: 'open', outcome: null, joined: false }] };
    request.mockImplementation(async (action) => action === 'read' ? studentDetail : action === 'home' ? home : { ok: true, tid: 'fxf1' });
    let view: any;
    await act(async () => { view = renderer.create(<ClassesScreen navigation={{ navigate, goBack: jest.fn() }} />); });
    await press(view, 'Ouvri');
    expect(texts(view).some((x) => x.includes('Kay ou') && x.includes('Toussaint'))).toBe(true);
    await press(view, 'Antre nan match la');
    expect(request).toHaveBeenCalledWith('fixture-join', { id: 'c1', fixtureId: 'f1' });
    expect(navigate).toHaveBeenCalledWith('Tournois', { tournamentId: 'fxf1' });
    await press(view, 'Mwen dakò');
    expect(request).toHaveBeenCalledWith('share-mastery', { id: 'c1' });
    await act(async () => view.unmount());
  });
});
