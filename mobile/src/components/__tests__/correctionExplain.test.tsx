/**
 * "Explique-moi" under a mobile correction: shown on a wrong answer when the
 * surface allows it, with the question, the student's pick, the key and the
 * authored explanation; absent on a right answer, in a scored quiz (no
 * surface), and without a provider (signed out).
 */
import React from 'react';
import { Correction } from '../journey/practice/Answer';
import { ExplainContext } from '../sandra/explainContext';
import useStore from '../../contexts/store';

interface TestNode { props: Record<string, any>; findAll(p: (n: TestNode) => boolean): TestNode[] }
const renderer: { create(e: React.ReactElement): { root: TestNode } } = require('react-test-renderer');
const { act }: { act(cb: () => unknown): any } = require('react-test-renderer');

jest.mock('../MathText', () => {
  const { Text } = require('react-native');
  const Mock = ({ text }: { text: string }) => <Text>{text}</Text>;
  return { __esModule: true, default: Mock, MathText: Mock, HAS_MATH: /\$/ };
});

const t = (fr: string) => fr;
const item = {
  id: 'chem-12', question: 'Masse molaire de l’eau ?', options: ['16 g/mol', '18 g/mol', '20 g/mol'],
  correctIndex: 1, explanation: '2 × 1 + 16 = 18.', subjectCode: 'CHEM',
};

const explainButtons = (root: TestNode) =>
  root.findAll((n) => typeof n.props?.accessibilityLabel === 'string'
    && n.props.accessibilityLabel.startsWith('Explique-moi')
    && typeof n.props?.onPress === 'function');

function mount(explain: jest.Mock | null, props: Partial<React.ComponentProps<typeof Correction>> = {}) {
  let r: { root: TestNode } | undefined;
  act(() => {
    r = renderer.create(
      <ExplainContext.Provider value={explain}>
        <Correction item={item} entry={{ selected: 0 }} t={t} explainSurface="revision" {...props} />
      </ExplainContext.Provider>,
    );
  });
  return r!.root;
}

beforeEach(() => { useStore.setState({ language: 'fr' } as any); });

it('opens Explique-moi with the structured question on a wrong answer', () => {
  const explain = jest.fn();
  const root = mount(explain);
  const [button] = explainButtons(root);
  expect(button.props.accessibilityLabel).toContain('Sandra reçoit la question');
  act(() => button.props.onPress());
  expect(explain).toHaveBeenCalledWith({
    surface: 'revision',
    question: 'Masse molaire de l’eau ?',
    studentAnswer: '16 g/mol',
    expectedAnswer: '18 g/mol',
    explanation: '2 × 1 + 16 = 18.',
    subject: 'CHEM',
    questionType: 'mcq',
    status: 'incorrect',
    questionId: 'chem-12',
  });
});

it('is absent on a right answer, without a surface, and without a provider', () => {
  expect(explainButtons(mount(jest.fn(), { entry: { selected: 1 } }))).toHaveLength(0);
  expect(explainButtons(mount(jest.fn(), { explainSurface: undefined }))).toHaveLength(0);
  expect(explainButtons(mount(null))).toHaveLength(0);
});
