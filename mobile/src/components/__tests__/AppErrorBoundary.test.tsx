import React from 'react';
import { Text } from 'react-native';
import AppErrorBoundary, { BOUNDARY_COPY, withTabBoundary } from '../AppErrorBoundary';
import useStore from '../../contexts/store';
import { setTelemetrySink, __resetTelemetryForTests } from '../../services/telemetry';

interface TestNode { props: Record<string, any>; findAll(p: (n: TestNode) => boolean): TestNode[] }
const renderer: { create(e: React.ReactElement): { root: TestNode; toJSON(): unknown } } = require('react-test-renderer');
const { act }: { act(cb: () => unknown): any } = require('react-test-renderer');

let shouldThrow = false;
function Bomb() {
  if (shouldThrow) throw new TypeError('x is not a function for student@example.com');
  return <Text>screen content</Text>;
}
const texts = (root: TestNode) =>
  root.findAll((n) => typeof n.props?.children === 'string').map((n) => n.props.children as string);
const press = (root: TestNode, label: string) =>
  act(() => root.findAll((n) => n.props?.accessibilityLabel === label && typeof n.props?.onPress === 'function')[0].props.onPress());

let sink: jest.Mock;
beforeEach(() => {
  __resetTelemetryForTests();
  sink = jest.fn();
  setTelemetrySink(sink);
  useStore.setState({ language: 'fr' } as any);
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  shouldThrow = false;
  jest.restoreAllMocks();
});

it('shows the FR recovery screen instead of a white screen, reports, and retries', () => {
  shouldThrow = true;
  let tree: any;
  act(() => { tree = renderer.create(<AppErrorBoundary boundary="root"><Bomb /></AppErrorBoundary>); });
  expect(texts(tree.root)).toEqual(expect.arrayContaining([BOUNDARY_COPY.fr.title, BOUNDARY_COPY.fr.retry]));
  expect(texts(tree.root)).not.toContain(BOUNDARY_COPY.fr.home);
  const report = sink.mock.calls.map(([e]) => e).find((e) => e.name === 'render_error');
  expect(report.detail).toEqual(expect.objectContaining({ boundary: 'root', fatal: false, errorKind: 'not_a_function' }));

  shouldThrow = false;
  press(tree.root, BOUNDARY_COPY.fr.retry);
  expect(texts(tree.root)).toContain('screen content');
});

it('a tab boundary offers "home" in Creole and navigates to the Dashboard tab', () => {
  useStore.setState({ language: 'ht' } as any);
  shouldThrow = true;
  const navigate = jest.fn();
  const CoursesTab = withTabBoundary(Bomb as any, 'Courses');
  let tree: any;
  act(() => { tree = renderer.create(<CoursesTab navigation={{ navigate }} />); });
  expect(texts(tree.root)).toEqual(expect.arrayContaining([BOUNDARY_COPY.ht.title, BOUNDARY_COPY.ht.home]));
  expect(sink.mock.calls.find(([e]) => e.name === 'render_error')[0].detail.boundary).toBe('Courses');
  shouldThrow = false;
  press(tree.root, BOUNDARY_COPY.ht.home);
  expect(navigate).toHaveBeenCalledWith('Dashboard');
  expect(texts(tree.root)).toContain('screen content');
});
