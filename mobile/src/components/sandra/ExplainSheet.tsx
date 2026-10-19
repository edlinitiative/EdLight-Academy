/**
 * ExplainProvider — "Explique-moi" on a missed question opens Sandra in a
 * sheet, pre-seeded with the question, the student's answer, the key and the
 * authored explanation (structured `questionContext` on /api/chat).
 *
 * It is the SAME chat (SandraScreen, sandraService, /api/chat, the chat rate
 * limit), presented as a sheet rather than the root `Sandra` route because the
 * corrections live inside RN Modals (Révision, a lesson's exercises): a root
 * route would open underneath them. A nested Modal presents above its host.
 *
 * Mount once per surface, around the corrections:
 *   <ExplainProvider> … <Correction …/> … </ExplainProvider>
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Modal } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import useStore from '../../contexts/store';
import { trackEvent } from '../../services/telemetry';
import {
  EXPLAIN_EVENT,
  explainAskMessage,
  explainTelemetryDetail,
  sanitizeQuestionContext,
  type QuestionContext,
} from '../../../../shared/explainContext';
import { ExplainContext, type ExplainFn } from './explainContext';

type SandraScreenComponent = typeof import('../../screens/SandraScreen').default;

/**
 * Required on first open, not at import: every practice surface mounts this
 * provider, and the chat screen (with its Firebase and trivia imports) should
 * not ride along in their module graph until a student actually asks.
 */
function loadSandraScreen(): SandraScreenComponent {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../../screens/SandraScreen').default;
}

export function ExplainProvider({ children }: { children: React.ReactNode }) {
  const signedIn = useStore((s) => !!s.user);
  const language = useStore((s) => s.language);
  const [active, setActive] = useState<{ ctx: QuestionContext; seq: number } | null>(null);

  const open = useCallback<ExplainFn>((raw) => {
    const ctx = sanitizeQuestionContext(raw);
    if (!ctx) return;
    trackEvent(EXPLAIN_EVENT, explainTelemetryDetail(ctx, true));
    setActive((prev) => ({ ctx, seq: (prev?.seq ?? 0) + 1 }));
  }, []);

  const value = useMemo(() => (signedIn ? open : null), [signedIn, open]);
  const close = useCallback(() => setActive(null), []);
  const lang: 'fr' | 'ht' = language === 'ht' ? 'ht' : 'fr';

  return (
    <ExplainContext.Provider value={value}>
      {children}
      <Modal visible={!!active} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
        <SafeAreaProvider>
          {active ? (
            <ExplainChat
              key={active.seq}
              onClose={close}
              initialAsk={explainAskMessage(lang)}
              questionContext={active.ctx}
            />
          ) : null}
        </SafeAreaProvider>
      </Modal>
    </ExplainContext.Provider>
  );
}

function ExplainChat(props: React.ComponentProps<SandraScreenComponent>) {
  const SandraScreen = loadSandraScreen();
  return <SandraScreen {...props} />;
}

export default ExplainProvider;
