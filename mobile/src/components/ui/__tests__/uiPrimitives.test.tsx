/**
 * The shared primitives every screen builds on: roles, labels and states
 * that VoiceOver/TalkBack read, plus the shared Reduce Motion source.
 */
import React from 'react';
import { AccessibilityInfo, Text } from 'react-native';
import useStore from '../../../contexts/store';
import Button from '../Button';
import Card from '../Card';
import PressableScale from '../PressableScale';
import { useReduceMotion, isReduceMotionOn, modalAnimation, __resetReduceMotionForTests } from '../../../utils/motion';

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
/** The outermost host-facing element carrying an accessibility role. */
const roleNode = (root: TestNode, role: string) =>
  root.findAll((n) => n.props?.accessibilityRole === role && typeof n.type !== 'string')[0];

beforeEach(() => {
  useStore.setState({ language: 'fr', theme: 'light' } as any);
  __resetReduceMotionForTests();
});
afterEach(() => {
  act(() => { while (mounted.length) mounted.pop()!.unmount(); });
  jest.restoreAllMocks();
});

describe('Button', () => {
  it('is a button named by its label', async () => {
    const onPress = jest.fn();
    const root = await render(<Button label="Commencer" onPress={onPress} />);
    const b = roleNode(root, 'button');
    expect(b.props.accessibilityLabel).toBe('Commencer');
    expect(b.props.accessibilityState).toEqual(expect.objectContaining({ disabled: false, busy: false }));
    act(() => { b.props.onPress(); });
    expect(onPress).toHaveBeenCalled();
  });

  it('announces disabled and does not fire', async () => {
    const onPress = jest.fn();
    const root = await render(<Button label="Envoyer" onPress={onPress} disabled />);
    const b = roleNode(root, 'button');
    expect(b.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    expect(b.props.onPress).toBeUndefined();
  });

  it('announces busy while loading (no double submit)', async () => {
    const onPress = jest.fn();
    const root = await render(<Button label="Envoyer" onPress={onPress} loading />);
    const b = roleNode(root, 'button');
    expect(b.props.accessibilityState).toEqual(expect.objectContaining({ busy: true, disabled: true }));
    expect(b.props.onPress).toBeUndefined();
  });

  it('caps the label scale so it never clips the control', async () => {
    const root = await render(<Button label="Commencer" />);
    const label = root.findAll((n) => n.props?.children === 'Commencer' && typeof n.type !== 'string')[0];
    expect(label.props.maxFontSizeMultiplier).toBeGreaterThan(1);
  });

  it('keeps the 44pt touch floor at every size', async () => {
    for (const size of ['sm', 'md', 'lg'] as const) {
      const root = await render(<Button label="x" size={size} />);
      const b = roleNode(root, 'button');
      const style = [b.props.style].flat(3).reduce((a: any, s: any) => ({ ...a, ...(s || {}) }), {});
      // sm is 40 high with PressableScale's 6pt hitSlop each side → ≥ 44 effective.
      const pressable = root.findAll((n) => n.props?.hitSlop && n.props?.accessibilityRole === 'button')[0];
      const slop = (pressable?.props.hitSlop?.top ?? 0) + (pressable?.props.hitSlop?.bottom ?? 0);
      expect(style.minHeight + slop).toBeGreaterThanOrEqual(44);
    }
  });
});

describe('Card', () => {
  it('is a plain view when not tappable', async () => {
    const root = await render(<Card><Text>Contenu</Text></Card>);
    expect(roleNode(root, 'button')).toBeUndefined();
  });

  it('is a labelled button when tappable', async () => {
    const root = await render(
      <Card onPress={() => {}} accessibilityLabel="Physique NS I" accessibilityHint="Ouvre le cours"><Text>x</Text></Card>,
    );
    const b = roleNode(root, 'button');
    expect(b.props.accessibilityLabel).toBe('Physique NS I');
    expect(b.props.accessibilityHint).toBe('Ouvre le cours');
  });
});

describe('Reduce Motion', () => {
  function Probe() {
    const r = useReduceMotion();
    return <Text>{r ? 'reduce' : 'full'}</Text>;
  }

  it('useReduceMotion follows the OS setting', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const root = await render(<Probe />);
    expect(root.findAll((n) => n.props?.children === 'reduce').length).toBeGreaterThan(0);
    expect(isReduceMotionOn()).toBe(true);
  });

  it('modals present instantly under Reduce Motion', () => {
    expect(modalAnimation(true, 'slide')).toBe('none');
    expect(modalAnimation(false, 'slide')).toBe('slide');
  });

  it('PressableScale still fires and keeps its role under Reduce Motion', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const onPress = jest.fn();
    const root = await render(
      <PressableScale onPress={onPress} haptic={false} accessibilityRole="button" accessibilityLabel="Ok"><Text>Ok</Text></PressableScale>,
    );
    const b = roleNode(root, 'button');
    act(() => { b.props.onPressIn?.({}); b.props.onPress(); b.props.onPressOut?.({}); });
    expect(onPress).toHaveBeenCalled();
  });
});
