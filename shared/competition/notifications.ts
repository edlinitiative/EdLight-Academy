/**
 * Competition notification vocabulary shared by the server (inbox records and
 * push copy), the "Mon activité" panel and the app's notification-tap router.
 *
 * A notification carries a typed target reference and the action that
 * happened — never a free-form navigation target, a score or an answer. The
 * destination is rebuilt from (targetKind, targetId) and the screen resolves
 * the current permissions itself.
 */
export type InboxTargetKind = 'event' | 'team' | 'invite' | 'league' | 'school';

export type InboxAction =
  | 'created'
  | 'draft_saved'
  | 'published'
  | 'following'
  | 'invited'
  | 'invite_accepted'
  | 'invite_declined'
  | 'invite_revoked'
  | 'joined'
  | 'captain_transferred'
  | 'member_left'
  | 'recruitment_requested'
  | 'recruitment_accepted'
  | 'recruitment_declined'
  | 'membership_requested'
  | 'membership_approved'
  | 'membership_revoked'
  | 'host_approved'
  | 'host_revoked'
  | 'roster_saved'
  | 'confirm_requested'
  | 'starter_confirmed'
  | 'roster_ready'
  | 'registered'
  | 'withdrawn'
  | 'entry_approved'
  | 'entry_refused'
  | 'cohost_granted'
  | 'cohost_removed'
  | 'announcement'
  | 'postponed'
  | 'reconfirm_needed'
  | 'cancelled'
  | 'no_contest'
  | 'closed'
  | 'result_released'
  | 'result_confirmed'
  | 'dispute_opened'
  | 'dispute_resolved'
  | 'league_invited'
  | 'league_enrolled'
  | 'league_consent'
  | 'fixtures_scheduled'
  | 'fixture_updated'
  | 'source_changed'
  | 'ownership_received'
  | 'owner_missing'
  | 'report_received'
  | 'reports_waiting'
  | 'event_starting'
  | 'event_starting_soon'
  | 'registration_closing'
  | 'team_roles_set'
  | 'authority_received'
  | 'relay_turn';

type Pair = [string, string];

/** Short inbox label, and — only for actions worth interrupting someone — the push sentence. */
export const INBOX_ACTIONS: Record<InboxAction, { label: Pair; push?: Pair }> = {
  created: { label: ['Créé', 'Kreye'] },
  draft_saved: { label: ['Brouillon enregistré', 'Bouyon anrejistre'] },
  published: { label: ['Publié', 'Pibliye'] },
  following: { label: ['Suivi', 'Swivi'] },
  invited: {
    label: ['Invitation reçue', 'Ou resevwa yon envitasyon'],
    push: [
      'Tu es invité·e à rejoindre cette équipe.',
      'Yo envite w antre nan ekip sa a.',
    ],
  },
  invite_accepted: { label: ['Invitation acceptée', 'Envitasyon aksepte'] },
  invite_declined: { label: ['Invitation refusée', 'Envitasyon refize'] },
  invite_revoked: { label: ['Invitation retirée', 'Envitasyon retire'] },
  joined: { label: ['Membre de l’équipe', 'Manm ekip la'] },
  captain_transferred: { label: ['Tu es capitaine', 'Ou se kapitèn'] },
  member_left: { label: ['Un membre est parti', 'Yon manm kite ekip la'] },
  recruitment_requested: { label: ['Demande pour rejoindre', 'Demann pou antre'] },
  recruitment_accepted: { label: ['Demande acceptée', 'Demann aksepte'] },
  recruitment_declined: { label: ['Demande refusée', 'Demann refize'] },
  membership_requested: {
    label: ['Demande d’adhésion à l’école', 'Demann manm lekòl'],
  },
  membership_approved: {
    label: ['Adhésion approuvée', 'Manm apwouve'],
    push: [
      'Ton adhésion à l’école est approuvée.',
      'Lekòl la apwouve ou kòm manm.',
    ],
  },
  membership_revoked: {
    label: ['Adhésion retirée', 'Manm retire'],
    push: [
      'Ton adhésion à l’école a été retirée.',
      'Lekòl la retire ou kòm manm.',
    ],
  },
  host_approved: {
    label: ['Rôle d’organisateur approuvé', 'Wòl òganizatè apwouve'],
    push: ['Tu peux organiser pour ton école.', 'Ou ka òganize pou lekòl ou.'],
  },
  host_revoked: {
    label: ['Rôle d’organisateur retiré', 'Wòl òganizatè retire'],
    push: [
      'Ton rôle d’organisateur a été retiré.',
      'Yo retire wòl òganizatè ou.',
    ],
  },
  roster_saved: { label: ['Composition enregistrée', 'Konpozisyon anrejistre'] },
  confirm_requested: {
    label: ['Confirmation demandée', 'Yo mande konfimasyon'],
    push: [
      'Ton capitaine t’a ajouté·e : confirme ta place.',
      'Kapitèn ou mete w nan lis la : konfime plas ou.',
    ],
  },
  starter_confirmed: {
    label: ['Un titulaire a confirmé', 'Yon titilè konfime'],
  },
  roster_ready: {
    label: ['Équipe prête à inscrire', 'Ekip la pare pou enskri'],
    push: [
      'Tous les titulaires ont confirmé : termine l’inscription.',
      'Tout titilè yo konfime : fini enskripsyon an.',
    ],
  },
  registered: { label: ['Inscription confirmée', 'Enskripsyon konfime'] },
  withdrawn: { label: ['Inscription retirée', 'Enskripsyon retire'] },
  entry_approved: {
    label: ['Participation approuvée', 'Patisipasyon apwouve'],
    push: [
      'Ta participation est approuvée : termine l’inscription.',
      'Patisipasyon ou apwouve : fini enskripsyon an.',
    ],
  },
  entry_refused: {
    label: ['Participation refusée', 'Patisipasyon refize'],
    push: [
      'Ta participation n’a pas été approuvée.',
      'Patisipasyon ou pa apwouve.',
    ],
  },
  cohost_granted: {
    label: ['Co-organisateur', 'Ko-òganizatè'],
    push: [
      'Tu es maintenant co-organisateur de cet événement.',
      'Kounye a ou se ko-òganizatè evènman sa a.',
    ],
  },
  cohost_removed: { label: ['Co-organisation retirée', 'Ko-òganizasyon retire'] },
  ownership_received: {
    label: ['Organisation transférée', 'Òganizasyon transfere'],
    push: [
      'L’organisateur a quitté EdLight : tu gères maintenant cet événement.',
      'Òganizatè a kite EdLight : se ou ki jere evènman sa a kounye a.',
    ],
  },
  owner_missing: {
    label: ['Sans organisateur', 'San òganizatè'],
    push: [
      'Un événement sans organisateur demande une décision d’administrateur.',
      'Yon evènman san òganizatè bezwen yon desizyon administratè.',
    ],
  },
  // Admin-only (api/_lib/competition.ts `report-content`). The push never
  // carries the report's reason or the reporter: only that one is waiting.
  report_received: {
    label: ['Signalement à examiner', 'Siyalman pou egzamine'],
    push: [
      'Un signalement attend une décision de modération.',
      'Yon siyalman ap tann yon desizyon moderasyon.',
    ],
  },
  reports_waiting: {
    label: ['Nombreux signalements', 'Anpil siyalman'],
    push: [
      'Beaucoup de signalements arrivent : ouvre la modération pour les traiter.',
      'Anpil siyalman ap rive : louvri moderasyon an pou trete yo.',
    ],
  },
  announcement: {
    label: ['Nouvelle annonce', 'Nouvo anons'],
    push: [
      'L’organisateur a publié une annonce.',
      'Òganizatè a pibliye yon anons.',
    ],
  },
  postponed: {
    label: ['Reporté', 'Ranvwaye'],
    push: [
      'L’événement est reporté. Vérifie la nouvelle date.',
      'Evènman an ranvwaye. Gade nouvo dat la.',
    ],
  },
  reconfirm_needed: {
    label: ['Reporté : à reconfirmer', 'Ranvwaye : konfime ankò'],
    push: [
      'Nouvelle date : reconfirme ton inscription.',
      'Nouvo dat : konfime enskripsyon ou ankò.',
    ],
  },
  cancelled: {
    label: ['Annulé', 'Anile'],
    push: ['Cet événement est annulé.', 'Evènman sa a anile.'],
  },
  no_contest: {
    label: ['Sans résultat', 'San rezilta'],
    push: [
      'Cet événement est annulé sans résultat.',
      'Evènman sa a anile san rezilta.',
    ],
  },
  closed: { label: ['Clôturé', 'Fèmen'] },
  result_released: {
    label: ['Résultat publié', 'Rezilta pibliye'],
    push: [
      'Le résultat est publié. Tu peux le consulter.',
      'Rezilta a pibliye. Ou ka gade l.',
    ],
  },
  result_confirmed: {
    label: ['Résultat confirmé', 'Rezilta konfime'],
    push: ['Le résultat est confirmé.', 'Rezilta a konfime.'],
  },
  dispute_opened: {
    label: ['Contestation reçue', 'Kontestasyon resevwa'],
    push: [
      'Un participant conteste le résultat.',
      'Yon patisipan konteste rezilta a.',
    ],
  },
  dispute_resolved: {
    label: ['Contestation traitée', 'Kontestasyon trete'],
    push: [
      'Ta contestation a reçu une réponse.',
      'Kontestasyon ou a gen yon repons.',
    ],
  },
  league_invited: {
    label: ['Invitation en ligue', 'Envitasyon nan lig'],
    push: [
      'Ton équipe est invitée dans cette ligue.',
      'Yo envite ekip ou nan lig sa a.',
    ],
  },
  league_enrolled: {
    label: ['Équipe inscrite à la ligue', 'Ekip la enskri nan lig la'],
  },
  league_consent: { label: ['Accord du capitaine', 'Kapitèn lan dakò'] },
  fixtures_scheduled: {
    label: ['Calendrier publié', 'Kalandriye pibliye'],
    push: [
      'Le calendrier des matchs est publié.',
      'Kalandriye match yo pibliye.',
    ],
  },
  fixture_updated: {
    label: ['Match mis à jour', 'Match la chanje'],
    push: [
      'Un match de ton équipe a été mis à jour.',
      'Yon match ekip ou a chanje.',
    ],
  },
  source_changed: { label: ['Résultat source modifié', 'Rezilta sous la chanje'] },
  // Scheduled reminders (api/_lib/competitionReminders): sent by the cron, not by a person.
  event_starting: {
    label: ['Commence dans 1 heure', 'Kòmanse nan 1 èdtan'],
    push: [
      'Ton événement commence dans 1 heure.',
      'Evènman ou an ap kòmanse nan 1 èdtan.',
    ],
  },
  event_starting_soon: {
    label: ['Commence dans 10 minutes', 'Kòmanse nan 10 minit'],
    push: [
      'Ton événement commence dans 10 minutes. Sois prêt·e !',
      'Evènman ou an ap kòmanse nan 10 minit. Pare w !',
    ],
  },
  registration_closing: {
    label: ['Inscriptions bientôt closes', 'Enskripsyon ap fèmen talè'],
    push: [
      'Les inscriptions ferment bientôt : confirme ta place ou termine l’inscription.',
      'Enskripsyon yo ap fèmen talè : konfime plas ou oswa fini enskripsyon an.',
    ],
  },
  // Shared-answer and relay team play (api/tournois/_team.ts, `team-roles`).
  team_roles_set: {
    label: ['Rôles de l’équipe à confirmer', 'Wòl ekip la pou konfime'],
    push: [
      'Ton capitaine a fixé les rôles de l’équipe : vérifie et confirme le tien.',
      'Kapitèn ou fikse wòl ekip la : gade epi konfime pa w la.',
    ],
  },
  authority_received: {
    label: ['Tu tiens la réponse de l’équipe', 'Se ou ki kenbe repons ekip la'],
    push: [
      'Tu envoies maintenant la réponse de ton équipe.',
      'Se ou ki voye repons ekip ou a kounye a.',
    ],
  },
  relay_turn: {
    label: ['Ton tour de relais', 'Tou relè ou'],
    push: [
      'C’est ton tour de relais : commence avant la limite.',
      'Se tou relè ou : kòmanse anvan limit la.',
    ],
  },
};

export function isInboxAction(value: unknown): value is InboxAction {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(INBOX_ACTIONS, value);
}

export const shouldPush = (action: InboxAction) => !!INBOX_ACTIONS[action].push;

const SEGMENTS: Record<InboxTargetKind, string> = {
  event: 'evenements',
  team: 'equipes',
  invite: 'invitations',
  league: 'ligues',
  school: 'ecoles',
};

/** The one internal path a target opens — the same routes the web and app already resolve. */
export function inboxPath(kind: InboxTargetKind, targetId: string): string {
  return `/arena/${SEGMENTS[kind]}/${encodeURIComponent(targetId)}`;
}

export function isInboxTargetKind(value: unknown): value is InboxTargetKind {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(SEGMENTS, value);
}

/** Push title/body: the record's own title plus one fixed sentence. Nothing private is ever interpolated. */
export function pushCopy(
  action: InboxAction,
  title: string,
  ht: boolean,
): { title: string; body: string } {
  const entry = INBOX_ACTIONS[action];
  const body = (entry.push ?? entry.label)[ht ? 1 : 0];
  return { title: title.slice(0, 80) || (ht ? 'Arèn EdLight' : 'Arène EdLight'), body };
}
