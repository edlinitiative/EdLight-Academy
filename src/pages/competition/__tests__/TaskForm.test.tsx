import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
jest.mock('../../../services/competitionService', () => ({
  competitionRequest: jest.fn(),
}));
import { TaskForm } from '../CompetitionWorkspace';
import { WorkspaceError } from '../../../../shared/competition/client';
const task = {
  id: 'publish',
  action: 'event-publish',
  label: ['Publier', 'Pibliye'] as [string, string],
  values: { eventId: 'event', revision: 1 },
};
beforeEach(() => sessionStorage.clear());
it('prevents duplicate taps and retains the original mutation after an ambiguous timeout and refreshed revision', async () => {
  let reject: (error: Error) => void = () => undefined;
  const execute = jest
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<void>((_, fail) => {
          reject = fail;
        }),
    )
    .mockResolvedValue(undefined);
  const view = render(
    <TaskForm task={task} uid="a" ht={false} execute={execute} />,
  );
  fireEvent.click(screen.getByText('Publier', { selector: 'summary' }));
  const button = screen.getByRole('button', { name: 'Publier' });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(execute).toHaveBeenCalledTimes(1);
  reject(new WorkspaceError('receipt_unknown'));
  await screen.findByRole('alert');
  view.rerender(
    <TaskForm
      task={{ ...task, values: { eventId: 'event', revision: 2 } }}
      uid="a"
      ht={false}
      execute={execute}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Publier' }));
  await waitFor(() => expect(execute).toHaveBeenCalledTimes(2));
  expect(execute.mock.calls[1][0].values.revision).toBe(1);
  expect(execute.mock.calls[1][2]).toBe(execute.mock.calls[0][2]);
});
it('requires a second deliberate confirmation for destructive actions', async () => {
  const execute = jest.fn().mockResolvedValue(undefined);
  render(
    <TaskForm
      task={{
        ...task,
        confirm: [
          'Cette action annule l’événement.',
          'Aksyon sa a anile evènman an.',
        ],
      }}
      uid="a"
      ht={false}
      execute={execute}
    />,
  );
  fireEvent.click(screen.getByText('Publier', { selector: 'summary' }));
  fireEvent.click(screen.getByRole('button', { name: 'Publier' }));
  expect(execute).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
  await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
});
