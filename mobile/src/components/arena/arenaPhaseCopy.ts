/**
 * One sentence per phase, shared by the spectator header and the live screen,
 * so the player and the viewer are told the same thing in the same words.
 */
import type { LivePhase } from '../../utils/arenaViewState';

type T = (fr: string, ht: string) => string;

export function phaseLine(opts: {
  phase: LivePhase;
  state: string | null;
  questionNumber: number | null;
  questionCount: number;
  secondsLeft: number | null;
  revealed: boolean;
  t: T;
}): string {
  const { phase, state, questionNumber: n, questionCount: total, secondsLeft, revealed, t } = opts;
  const of = n != null && total > 0 ? `${n} / ${total}` : n != null ? String(n) : '';
  switch (phase) {
    case 'loading': return t('Chargement…', 'N ap chaje…');
    case 'unavailable': return t('Événement indisponible', 'Evènman pa disponib');
    case 'denied': return t('Accès refusé', 'Aksè refize');
    case 'reconnecting': return t('Reconnexion…', 'N ap rekonekte…');
    case 'waitingStart': return t('Les portes sont ouvertes — la partie va commencer', 'Pòt yo louvri — pati a pral kòmanse');
    case 'questionLoading': return t(`Question ${of} en préparation`, `Kesyon ${of} ap prepare`);
    case 'question':
      return secondsLeft != null
        ? t(`Question ${of} — se ferme dans ${secondsLeft} s`, `Kesyon ${of} — l ap fèmen nan ${secondsLeft} s`)
        : t(`Question ${of}`, `Kesyon ${of}`);
    case 'interval':
      return revealed
        ? t(`Question ${of} — réponse révélée`, `Kesyon ${of} — repons lan parèt`)
        : t('Réponses verrouillées — révélation imminente', 'Repons yo fèmen — n ap revele l talè');
    case 'ended':
      if (state === 'grading') return t('Calcul des scores', 'N ap kalkile nòt yo');
      if (state === 'final') return t('Résultats officiels', 'Rezilta ofisyèl');
      return t('Résultats provisoires — vérification en cours', 'Rezilta pwovizwa — verifikasyon ap fèt');
    default: return '';
  }
}
