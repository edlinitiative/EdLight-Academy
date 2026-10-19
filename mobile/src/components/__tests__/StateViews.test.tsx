/**
 * Shared state components: the roles, labels and actions screen readers and
 * students rely on. Snapshot-free on purpose — these assert behaviour.
 */
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import useStore from '../../contexts/store';
import { LoadingState, ListSkeleton, ErrorState, EmptyState, InlineError, Skeleton } from '../StateViews';
import { __resetReduceMotionForTests } from '../../utils/motion';

jest.mock('@react-native-community/netinfo', () => {
  let state = { isConnected: true, isInternetReachable: true };
  return {
    __setState: (s: any) => { state = s; },
    fetch: jest.fn(() => Promise.resolve(state)),
    addEventListener: jest.fn(() => () => {}),
  };
});
const NetInfo = require('@react-native-community/netinfo');

interface TestNode { type: any; props: Record<string, any>; findAll(p: (n: TestNode) => boolean): TestNode[] }
const renderer: { create(e: React.ReactElement): { root: TestNode; unmount(): void } } = require('react-test-renderer');
const { act }: { act(cb: () => unknown): any } = require('react-test-renderer');

const mounted: { unmount(): void }[] = [];
async function render(el: React.ReactElement) {
  let tree: any;
  await act(async () => { tree = renderer.create(el); });
  mounted.push(tree);
  return tree.root as TestNode;
}
afterEach(() => {
  act(() => { while (mounted.length) mounted.pop()!.unmount(); });
  jest.restoreAllMocks();
});
const byRole = (root: TestNode, role: string) =>
  root.findAll((n) => n.props?.accessibilityRole === role && typeof n.type !== 'string');
const texts = (root: TestNode) =>
  root.findAll((n) => typeof n.props?.children === 'string').map((n) => n.props.children as string);

beforeEach(() => {
  useStore.setState({ language: 'fr', theme: 'light' } as any);
  NetInfo.__setState({ isConnected: true, isInternetReachable: true });
  __resetReduceMotionForTests();
});

describe('LoadingState / ListSkeleton', () => {
  it('announces one busy progressbar with a localized label', async () => {
    const root = await render(<LoadingState />);
    const bar = byRole(root, 'progressbar')[0];
    expect(bar.props.accessibilityLabel).toBe('Chargement…');
    expect(bar.props.accessibilityState).toEqual({ busy: true });
  });

  it('ListSkeleton carries the custom label and hides its blocks', async () => {
    useStore.setState({ language: 'ht' } as any);
    const root = await render(<ListSkeleton rows={2} label="Ap chèche…" />);
    const bar = byRole(root, 'progressbar')[0];
    expect(bar.props.accessibilityLabel).toBe('Ap chèche…');
    const hidden = root.findAll((n) => n.props?.importantForAccessibility === 'no-hide-descendants' && typeof n.type === 'string');
    expect(hidden.length).toBeGreaterThan(0);
  });
});

describe('ErrorState', () => {
  it('is an alert with a labelled Retry and a way back', async () => {
    const retry = jest.fn();
    const back = jest.fn();
    const root = await render(
      <ErrorState title="Cours indisponible" onRetry={retry} secondaryLabel="Retour" onSecondary={back} />,
    );
    const alert = byRole(root, 'alert')[0];
    expect(alert.props.accessibilityLabel).toContain('Cours indisponible');
    const buttons = byRole(root, 'button');
    const retryBtn = buttons.find((b) => b.props.accessibilityLabel === 'Réessayer')!;
    const backBtn = buttons.find((b) => b.props.accessibilityLabel === 'Retour')!;
    expect(retryBtn).toBeTruthy();
    expect(backBtn).toBeTruthy();
    act(() => { retryBtn.props.onPress(); });
    act(() => { backBtn.props.onPress(); });
    expect(retry).toHaveBeenCalledTimes(1);
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('switches to the offline copy when NetInfo reports no connection', async () => {
    NetInfo.__setState({ isConnected: false, isInternetReachable: false });
    const root = await render(<ErrorState title="Cours indisponible" onRetry={() => {}} />);
    expect(texts(root)).toContain('Tu es hors ligne');
    expect(texts(root)).not.toContain('Cours indisponible');
  });

  it('honours screen-specific offline copy in Creole', async () => {
    useStore.setState({ language: 'ht' } as any);
    const root = await render(<ErrorState offline offlineTitle="Pa gen rezo" />);
    expect(texts(root)).toContain('Pa gen rezo');
  });
});

describe('EmptyState', () => {
  it('has a header and an actionable CTA button', async () => {
    const go = jest.fn();
    const root = await render(<EmptyState title="Aucun cours" ctaLabel="Voir les cours" onCta={go} />);
    expect(byRole(root, 'header').length).toBeGreaterThan(0);
    const cta = byRole(root, 'button').find((b) => b.props.accessibilityLabel === 'Voir les cours')!;
    act(() => { cta.props.onPress(); });
    expect(go).toHaveBeenCalled();
  });
});

describe('InlineError', () => {
  it('keeps the section small: an alert line plus Retry', async () => {
    const retry = jest.fn();
    const root = await render(<InlineError message="Le classement n’a pas pu être chargé." onRetry={retry} />);
    expect(byRole(root, 'alert')[0].props.accessibilityLabel).toBe('Le classement n’a pas pu être chargé.');
    const btn = byRole(root, 'button').find((b) => b.props.accessibilityLabel === 'Réessayer')!;
    act(() => { btn.props.onPress(); });
    expect(retry).toHaveBeenCalled();
  });
});

describe('Skeleton under Reduce Motion', () => {
  async function sweeps(reduce: boolean) {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(reduce);
    const root = await render(<Skeleton width={100} height={10} />);
    // Fire a layout so the sweep would otherwise mount.
    const block = root.findAll((n) => typeof n.props?.onLayout === 'function')[0];
    await act(async () => { block.props.onLayout({ nativeEvent: { layout: { width: 100, height: 10 } } }); });
    // The sweep is the only element carrying a `colors` gradient prop.
    return root.findAll((n) => Array.isArray(n.props?.colors) && typeof n.type !== 'string').length;
  }

  it('sweeps normally', async () => {
    expect(await sweeps(false)).toBeGreaterThan(0);
  });

  it('renders a static block (no sweep) when the OS asks for less motion', async () => {
    expect(await sweeps(true)).toBe(0);
  });
});
