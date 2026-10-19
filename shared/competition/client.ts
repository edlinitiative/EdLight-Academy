/** Bounded API transport. Mutation retries retain their operation ID at the form. */
export class WorkspaceError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export const operationId = () =>
  `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
export function createCompetitionClient(options: {
  base: string;
  token: () => Promise<string | null>;
  track?: (
    name: string,
    detail: Record<string, string | number | boolean>,
  ) => void;
}) {
  const failed = new Set<string>();
  return async (action: string, values: Record<string, unknown> = {}) => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();
    const track = (detail: Record<string, string | number | boolean>) => {
      try {
        options.track?.('competition_action', detail);
      } catch {
        /* diagnostics are best effort */
      }
    };
    track({ action, outcome: 'started' });
    try {
      const response = await Promise.race([
        (async () => {
          const token = await options.token();
          const response = await fetch(`${options.base}/api/competition`, {
            method: 'POST',
            signal: controller.signal,
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ action, ...values }),
          });
          const body = await response.json();
          return { ok: response.ok, body };
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new WorkspaceError('receipt_unknown'));
          }, 8000);
        }),
      ]);
      const body = response.body;
      if (!response.ok)
        throw new WorkspaceError(body.error || 'service_unavailable');
      if (failed.delete(action)) track({ action, outcome: 'recovered' });
      track({
        action,
        outcome: 'confirmed',
        durationMs: Date.now() - startedAt,
      });
      return body;
    } catch (error) {
      failed.add(action);
      const code = error instanceof WorkspaceError ? error.code : 'network';
      track({ action, outcome: code, durationMs: Date.now() - startedAt });
      throw error instanceof WorkspaceError
        ? error
        : new WorkspaceError('network');
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}
export function workspaceError(code: string, ht: boolean): string {
  const messages: Record<string, [string, string]> = {
    unauthorized: [
      'Connectez-vous pour continuer. Votre destination est conservée.',
      'Konekte pou kontinye. Destinasyon ou konsève.',
    ],
    forbidden: [
      'Ce compte n’a pas accès à cette action.',
      'Kont sa a pa gen aksè ak aksyon sa a.',
    ],
    wrong_account: [
      'Cette invitation appartient à un autre compte.',
      'Envitasyon sa a pou yon lòt kont.',
    ],
    membership_pending: [
      'L’affiliation scolaire doit être approuvée avant cette action.',
      'Afilyasyon lekòl la dwe apwouve anvan aksyon sa a.',
    ],
    roster_not_ready: [
      'Il faut trois membres acceptés, éligibles et confirmés.',
      'Fòk gen twa manm aksepte, kalifye ak konfime.',
    ],
    conflicting_entry: [
      'Un titulaire est déjà inscrit avec une autre entrée dans cet événement.',
      'Yon titilè deja enskri ak yon lòt antre nan evènman sa a.',
    ],
    roster_locked: [
      'La composition est verrouillée. Avant la clôture, retirez l’inscription pour la modifier.',
      'Konpozisyon an bloke. Anvan fen enskripsyon, retire li pou modifye li.',
    ],
    receipt_unknown: [
      'La confirmation tarde. Réessayez sans changer les champs : le serveur retrouvera la même opération.',
      'Konfimasyon an pran tan. Eseye ankò san chanje chan yo : sèvè a ap jwenn menm operasyon an.',
    ],
    network: [
      'Connexion interrompue. Votre saisie est conservée ; réessayez.',
      'Koneksyon an koupe. Sa ou antre a konsève ; eseye ankò.',
    ],
    event_closed: [
      'Les inscriptions sont fermées ou l’événement a changé.',
      'Enskripsyon yo fèmen oswa evènman an chanje.',
    ],
    required: ['Complétez les champs requis.', 'Ranpli chan obligatwa yo.'],
    result_not_final: [
      'Le résultat n’est pas encore final et confirmé.',
      'Rezilta a poko final ak konfime.',
    ],
    approval_required: [
      'L’organisateur doit approuver votre entrée.',
      'Òganizatè a dwe apwouve antre ou.',
    ],
    invitation_required: [
      'L’organisateur doit inviter cette entrée.',
      'Òganizatè a dwe envite antre sa a.',
    ],
    not_found: [
      'Cette destination est introuvable.',
      'Nou pa jwenn destinasyon sa a.',
    ],
  };
  const specific = messages[code];
  return specific
    ? specific[ht ? 1 : 0]
    : ht
      ? `Aksyon an pa konfime (${code}). Verifye kondisyon yo epi eseye ankò.`
      : `Action non confirmée (${code}). Vérifiez les conditions puis réessayez.`;
}
