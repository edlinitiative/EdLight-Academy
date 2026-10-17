/**
 * Bridge between notificationService.askForNotifications (non-React) and the
 * pre-prompt sheet (components/ui/NotificationPrePromptSheet). The service
 * posts a request and awaits the student's answer; the sheet renders whatever
 * request is current. If no sheet is mounted the service falls back to a
 * native Alert, so asking never silently does nothing.
 */
import { create } from 'zustand';
import type { NotificationAskReason } from './notificationPermission';

export interface PromptRequest {
  id: number;
  reason: NotificationAskReason;
  mode: 'ask' | 'settings';
  resolve: (confirmed: boolean) => void;
}

interface PromptState {
  request: PromptRequest | null;
  /** number of mounted sheets — the service checks it before relying on one */
  hosts: number;
}

export const usePromptState = create<PromptState>(() => ({ request: null, hosts: 0 }));

let nextId = 1;

export function hasPromptHost(): boolean {
  return usePromptState.getState().hosts > 0;
}

/** Show the sheet; resolves true on the confirm button, false otherwise. */
export function showPrePrompt(reason: NotificationAskReason, mode: 'ask' | 'settings'): Promise<boolean> {
  return new Promise((resolve) => {
    const prev = usePromptState.getState().request;
    prev?.resolve(false); // a newer request replaces an unanswered one
    const id = nextId++;
    usePromptState.setState({
      request: {
        id,
        reason,
        mode,
        resolve: (ok) => {
          if (usePromptState.getState().request?.id === id) usePromptState.setState({ request: null });
          resolve(ok);
        },
      },
    });
  });
}

export function registerPromptHost(): () => void {
  usePromptState.setState((s) => ({ hosts: s.hosts + 1 }));
  return () => usePromptState.setState((s) => ({ hosts: Math.max(0, s.hosts - 1) }));
}
