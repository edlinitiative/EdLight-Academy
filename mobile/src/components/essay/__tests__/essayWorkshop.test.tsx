/**
 * The essay workshop flow on the phone: plan → write → practice feedback →
 * rewrite. The plan never shows the expected ideas; the practice grade comes
 * from the same grader the paper uses; rounds are capped.
 */
import React, { useState } from 'react';
import EssayWorkshop, { emptyWorkshop, MAX_ROUNDS, type WorkshopState } from '../EssayWorkshop';
import useStore from '../../../contexts/store';

interface TestNode { props: Record<string, any>; children: any[]; findAll(p: (n: TestNode) => boolean): TestNode[] }
const renderer: { create(e: React.ReactElement): { root: TestNode; toJSON(): any } } = require('react-test-renderer');
const { act }: { act(cb: () => unknown): any } = require('react-test-renderer');

const mockPost = jest.fn();
jest.mock('../../../services/essayGrading', () => ({ postEssayForGrading: (...a: unknown[]) => mockPost(...a) }));
jest.mock('../../ExamFigure', () => 'ExamFigure');

const question = {
  type: 'essay',
  points: 20,
  question: "Suffit-il d'obéir à la raison pour être libre ?",
  answer_parts: [{ label: 'Thèse', answer: 'SECRET_MODEL_ANSWER' }],
};

let latest: WorkshopState = emptyWorkshop();
function Host() {
  const [state, setState] = useState<WorkshopState>(emptyWorkshop());
  const [text, setText] = useState('');
  latest = state;
  return <EssayWorkshop question={question} subject="Philosophie" value={text} onChange={setText} state={state} onState={setState} />;
}

const allText = (tree: { toJSON(): any }) => JSON.stringify(tree.toJSON());
const byLabel = (root: TestNode, label: string) =>
  root.findAll((n) => n.props?.accessibilityLabel === label && typeof n.props?.onPress === 'function')[0];
const input = (root: TestNode, label: string) =>
  root.findAll((n) => n.props?.accessibilityLabel === label && typeof n.props?.onChangeText === 'function')[0];

// Full renders of a long screen: slow under a parallel suite, not broken.
jest.setTimeout(30000);

beforeEach(() => {
  useStore.setState({ language: 'fr', user: { uid: 'u1' } } as any);
  mockPost.mockReset();
});

it('walks plan → write → feedback → rewrite without ever showing the model answer first', async () => {
  let tree: any;
  act(() => { tree = renderer.create(<Host />); });
  const root = () => tree.root as TestNode;

  // 1. Plan: structural slots with method hints, never the model answer.
  const planText = allText(tree);
  expect(planText).toContain('Thèse');
  expect(planText).toContain('Antithèse');
  expect(planText).not.toContain('SECRET_MODEL_ANSWER');
  act(() => input(root(), 'Thèse : ton idée').props.onChangeText('La raison libère des passions'));
  expect(latest.plan.ideas.these).toBe('La raison libère des passions');

  // 2. Write.
  act(() => byLabel(root(), 'Rédiger').props.onPress());
  expect(latest.step).toBe('write');
  expect(allText(tree)).toContain('Ta liste');
  const essay = Array.from({ length: 8 }, () => 'Cependant la raison guide nos choix et nous libère.').join(' ');
  act(() => input(root(), 'Ta rédaction').props.onChangeText(essay));

  // 3. Practice feedback from the shared grader.
  mockPost.mockResolvedValue({ graded: true, score: '13/20', strengths: ['Bonne amorce'], improvements: ['Ton antithèse reprend la thèse'], criteria: [{ label: 'Structure', level: 1 }] });
  await act(async () => { await byLabel(root(), 'Obtenir un retour').props.onPress(); });
  expect(mockPost).toHaveBeenCalledTimes(1);
  expect(mockPost.mock.calls[0][0]).toMatchObject({ answer: essay, type: 'essay', subject: 'Philosophie' });
  expect(latest.step).toBe('feedback');
  expect(latest.rounds).toBe(1);
  const fb = allText(tree);
  expect(fb).toContain('13/20');
  expect(fb).toContain('Une chose à corriger maintenant');
  expect(fb).toContain('Ton antithèse reprend la thèse');
  expect(fb).not.toContain('SECRET_MODEL_ANSWER');

  // Rewrite, then the last round; after MAX_ROUNDS no more feedback button.
  act(() => byLabel(root(), 'Réécrire').props.onPress());
  expect(latest.step).toBe('write');
  await act(async () => { await byLabel(root(), 'Obtenir un retour').props.onPress(); });
  expect(latest.rounds).toBe(MAX_ROUNDS);
  act(() => byLabel(root(), 'Garder ma copie').props.onPress());
  expect(byLabel(root(), 'Obtenir un retour')).toBeUndefined();
});

it('keeps the student on the write step with a message when the grader fails', async () => {
  let tree: any;
  act(() => { tree = renderer.create(<Host />); });
  const root = () => tree.root as TestNode;
  act(() => byLabel(root(), 'Rédiger').props.onPress());
  act(() => input(root(), 'Ta rédaction').props.onChangeText(Array.from({ length: 40 }, () => 'mot').join(' ')));
  mockPost.mockRejectedValue(new Error('network'));
  await act(async () => { await byLabel(root(), 'Obtenir un retour').props.onPress(); });
  expect(latest.step).toBe('write');
  expect(latest.rounds).toBe(0);
  expect(allText(tree)).toContain('Le retour n’a pas pu être généré');
});
