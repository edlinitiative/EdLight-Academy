/**
 * The words of the practice journey, FR + HT (store language, inline t()).
 * Every sentence here is a fact about what the code does — no invented timer,
 * no grade the mode does not have, no promise of a save that is not made.
 */
import type { AnswerStatusKind, SessionMode } from './session';

export type Tx = (fr: string, ht: string) => string;

export function answerStatusLabel(kind: AnswerStatusKind, t: Tx): string {
  switch (kind) {
    case 'correct': return t('Correct', 'Kòrèk');
    case 'incorrect': return t('Incorrect', 'Pa kòrèk');
    case 'partial': return t('Partiellement correct', 'Kòrèk an pati');
    case 'unanswered': return t('Sans réponse', 'San repons');
    case 'ungraded': return t('Non corrigée automatiquement', 'Pa korije otomatikman');
    default: return '';
  }
}

/** "1 question" / "3 questions" in French; Creole does not pluralise. */
export function questionsLabel(n: number, t: Tx): string {
  return t(`${n} question${n > 1 ? 's' : ''}`, `${n} kesyon`);
}

/** What a mode does, before it starts (LJ-07). */
export function modeRules(mode: SessionMode, count: number, t: Tx): string[] {
  if (mode === 'quiz') {
    return [
      t(`${questionsLabel(count, t)}, l’une après l’autre. Tu vois toujours où tu en es.`,
        `${count} kesyon, youn apre lòt. Ou toujou wè ki kote ou ye.`),
      t('Un seul essai par question, puis la correction : la bonne réponse et l’explication quand elle existe.',
        'Yon sèl esè pa kesyon, apre sa koreksyon an : bon repons lan ak eksplikasyon an si genyen.'),
      t('À la fin : ton score (bonnes réponses) et la correction de chaque question.',
        'Nan fen : nòt ou (bon repons) ak koreksyon chak kesyon.'),
      t('Pas de chrono. Ce n’est pas un examen.', 'Pa gen kwonomèt. Se pa yon egzamen.'),
    ];
  }
  return [
    t('Une question à la fois, au hasard dans ce chapitre, autant que tu veux.',
      'Yon kesyon alafwa, o aza nan chapit sa a, otan ou vle.'),
    t('Correction tout de suite après chaque réponse.', 'Koreksyon touswit apre chak repons.'),
    t('Tu t’arrêtes quand tu veux avec « Terminer » et tu vois ton bilan.',
      'Ou kanpe lè ou vle ak « Fini » epi ou wè rezilta ou.'),
    t('Pas de score, pas de chrono.', 'Pa gen nòt, pa gen kwonomèt.'),
  ];
}

/** What is kept — the same facts before the session and after it. */
export function saveNote(signedIn: boolean, t: Tx): string {
  return signedIn
    ? t('Les questions ratées vont dans ta Révision : sur ce téléphone tout de suite, puis dans ton compte dès que le réseau le permet.',
      'Kesyon ou rate yo ale nan Revizyon ou : sou telefòn sa a touswit, epi nan kont ou depi rezo a pèmèt.')
    : t('Sans compte, tes erreurs restent seulement sur ce téléphone, dans Révision.',
      'San kont, erè ou yo rete sèlman sou telefòn sa a, nan Revizyon.');
}

/** Offline honesty (audit #16). */
export function offlineNote(online: boolean | null, t: Tx): string {
  return online === false
    ? t('Hors ligne : ces questions sont déjà sur ton téléphone, tu peux t’entraîner. L’envoi vers ton compte reprendra au retour du réseau.',
      'San rezo : kesyon sa yo deja sou telefòn ou, ou ka antrene. Voye nan kont ou ap rekòmanse lè rezo a tounen.')
    : t('Fonctionne hors ligne : ces questions sont gardées sur ton téléphone.',
      'Mache san rezo : kesyon sa yo kenbe sou telefòn ou.');
}
