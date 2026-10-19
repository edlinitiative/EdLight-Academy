/**
 * French / Kreyòl message for every error code the competition API can return
 * (api/competition.ts + api/_lib/competition.ts) plus the client-side codes
 * (network, receipt_unknown, required). A jest test parses the API sources
 * and fails when a thrown code has no entry here.
 */
type Pair = [string, string];

const same = (pair: Pair, ...codes: string[]) =>
  Object.fromEntries(codes.map((code) => [code, pair])) as Record<string, Pair>;

export const COMPETITION_ERROR_MESSAGES: Record<string, Pair> = {
  // ── Account and access ────────────────────────────────────────────────
  unauthorized: [
    "Connectez-vous pour continuer. Votre destination est conservée.",
    "Konekte pou kontinye. Destinasyon ou konsève.",
  ],
  forbidden: [
    "Ce compte n’a pas accès à cette action.",
    "Kont sa a pa gen aksè ak aksyon sa a.",
  ],
  invalid_ids: [
    "Ces notifications n’ont pas pu être marquées comme lues. Actualisez puis réessayez.",
    "Nou pa t ka make notifikasyon sa yo kòm li. Rafrechi epi eseye ankò.",
  ],
  wrong_account: [
    "Cette invitation appartient à un autre compte.",
    "Envitasyon sa a pou yon lòt kont.",
  ],
  captain_required: [
    "Seul le capitaine de l’équipe peut faire cette action.",
    "Se sèlman kapitèn ekip la ki ka fè aksyon sa a.",
  ],
  captain_consent_required: [
    "Le capitaine de l’équipe doit d’abord accepter les règles de la saison.",
    "Kapitèn ekip la dwe aksepte règ sezon an anvan.",
  ],
  verified_host_required: [
    "Seul un organisateur scolaire approuvé peut faire cette action.",
    "Se sèlman yon òganizatè lekòl ki apwouve ki ka fè aksyon sa a.",
  ],
  host_role_revoked: [
    "Le rôle d’organisateur scolaire de ce compte a été retiré.",
    "Yo retire wòl òganizatè lekòl kont sa a.",
  ],
  participant_required: [
    "Seuls les participants inscrits peuvent faire cette action.",
    "Se sèlman patisipan ki enskri ki ka fè aksyon sa a.",
  ],
  pilot_not_enabled: [
    "La création est fermée pendant cette phase pilote.",
    "Kreyasyon fèmen pandan faz pilòt sa a.",
  ],
  pilot_capacity_exceeded: [
    "Pendant la phase pilote, un événement est limité à 60 joueurs.",
    "Pandan faz pilòt la, yon evènman limite a 60 jwè.",
  ],
  rate_limit_exceeded: [
    "Trop de demandes d’un coup. Patientez un instant puis réessayez.",
    "Twòp demann an menm tan. Tann yon ti moman epi eseye ankò.",
  ],

  // ── Schools and memberships ───────────────────────────────────────────
  membership_pending: [
    "L’affiliation scolaire doit être approuvée avant cette action.",
    "Afilyasyon lekòl la dwe apwouve anvan aksyon sa a.",
  ],
  already_approved: [
    "Cette affiliation scolaire est déjà approuvée.",
    "Afilyasyon lekòl sa a deja apwouve.",
  ],
  school_required: [
    "Choisissez d’abord une école approuvée.",
    "Chwazi yon lekòl ki apwouve anvan.",
  ],
  school_unavailable: [
    "Cette école n’est pas disponible pour les compétitions.",
    "Lekòl sa a pa disponib pou konpetisyon.",
  ],
  invalid_school: [
    "Cette école n’est pas reconnue. Choisissez-la dans la liste.",
    "Nou pa rekonèt lekòl sa a. Chwazi l nan lis la.",
  ],
  invalid_department: [
    "Ce département n’est pas reconnu.",
    "Nou pa rekonèt depatman sa a.",
  ],

  // ── Teams, invitations and recruitment ────────────────────────────────
  already_member: [
    "Cette personne fait déjà partie de l’équipe.",
    "Moun sa a deja nan ekip la.",
  ],
  team_full: [
    "L’équipe a atteint le nombre maximal de membres.",
    "Ekip la gen kantite manm maksimòm lan deja.",
  ],
  team_not_found: ["Cette équipe est introuvable.", "Nou pa jwenn ekip sa a."],
  team_ineligible: [
    "L’équipe doit être de la même école que la saison et compter au moins trois membres.",
    "Ekip la dwe soti nan menm lekòl ak sezon an epi gen omwen twa manm.",
  ],
  transfer_captain_first: [
    "Transférez d’abord le rôle de capitaine à un autre membre.",
    "Transfere wòl kapitèn nan bay yon lòt manm anvan.",
  ],
  recipient_not_found: [
    "Aucun compte ne correspond à ce code d’invitation.",
    "Pa gen okenn kont ki koresponn ak kòd envitasyon sa a.",
  ],
  invite_code_unknown: [
    "Code d’invitation inconnu. Vérifiez les caractères avec la personne.",
    "Nou pa rekonèt kòd envitasyon sa a. Verifye karaktè yo ak moun nan.",
  ],
  invalid_recipient: [
    "Vous ne pouvez pas vous choisir vous-même ici.",
    "Ou pa ka chwazi tèt ou isit la.",
  ],
  invitation_unavailable: [
    "Cette personne ne peut pas recevoir d’invitation de votre part.",
    "Moun sa a pa ka resevwa envitasyon nan men ou.",
  ],
  invitation_not_found: [
    "Cette invitation est introuvable.",
    "Nou pa jwenn envitasyon sa a.",
  ],
  invitation_expired: [
    "Cette invitation a expiré. Demandez-en une nouvelle au capitaine.",
    "Envitasyon sa a ekspire. Mande kapitèn nan yon lòt.",
  ],
  ...same(
    [
      "Cette invitation a déjà reçu une réponse.",
      "Envitasyon sa a deja gen yon repons.",
    ],
    "invitation_accepted",
    "invitation_declined",
  ),
  invitation_revoked: [
    "Le capitaine a retiré cette invitation.",
    "Kapitèn nan retire envitasyon sa a.",
  ],
  invitation_pending: [
    "Cette invitation attend encore une réponse.",
    "Envitasyon sa a toujou ap tann yon repons.",
  ],
  recruitment_unavailable: [
    "Cette équipe n’accepte pas de demande de votre part pour le moment.",
    "Ekip sa a pa aksepte demann ou pou kounye a.",
  ],
  request_unavailable: [
    "Cette demande a déjà été traitée.",
    "Yo deja trete demann sa a.",
  ],
  name_required: [
    "Donnez un nom d’au moins trois caractères.",
    "Bay yon non ki gen omwen twa karaktè.",
  ],
  invalid_members: [
    "La liste des membres n’est pas valide.",
    "Lis manm yo pa valab.",
  ],
  member_unavailable: [
    "Un des membres choisis n’est plus disponible.",
    "Youn nan manm ou chwazi yo pa disponib ankò.",
  ],

  // ── Entries and rosters ───────────────────────────────────────────────
  roster_not_ready: [
    "Il faut trois membres acceptés, éligibles et confirmés.",
    "Fòk gen twa manm aksepte, kalifye ak konfime.",
  ],
  roster_incomplete: [
    "Choisissez trois membres différents de l’équipe.",
    "Chwazi twa manm diferan nan ekip la.",
  ],
  invalid_roster: [
    "Cette composition n’est pas valide pour cet événement.",
    "Konpozisyon sa a pa valab pou evènman sa a.",
  ],
  conflicting_entry: [
    "Un titulaire est déjà inscrit avec une autre entrée dans cet événement.",
    "Yon titilè deja enskri ak yon lòt antre nan evènman sa a.",
  ],
  roster_locked: [
    "La composition est verrouillée. Avant la clôture, retirez l’inscription pour la modifier.",
    "Konpozisyon an bloke. Anvan fen enskripsyon, retire li pou modifye li.",
  ],
  draft_required: [
    "Cette entrée n’est plus en préparation.",
    "Antre sa a pa an preparasyon ankò.",
  ],
  not_registered: [
    "Cette personne n’est pas inscrite à l’événement.",
    "Moun sa a pa enskri nan evènman an.",
  ],
  entry_not_found: [
    "Cette entrée est introuvable ou n’est pas inscrite.",
    "Nou pa jwenn antre sa a oswa li pa enskri.",
  ],
  event_full: ["L’événement est complet.", "Evènman an plen."],
  approval_required: [
    "L’organisateur doit approuver votre entrée.",
    "Òganizatè a dwe apwouve antre ou.",
  ],
  invitation_required: [
    "L’organisateur doit inviter cette entrée.",
    "Òganizatè a dwe envite antre sa a.",
  ],

  // ── Events ────────────────────────────────────────────────────────────
  event_closed: [
    "Les inscriptions sont fermées ou l’événement a changé.",
    "Enskripsyon yo fèmen oswa evènman an chanje.",
  ],
  event_started: ["L’événement a déjà commencé.", "Evènman an kòmanse deja."],
  already_started: [
    "C’est déjà commencé : cette action n’est plus possible.",
    "Sa kòmanse deja : aksyon sa a pa posib ankò.",
  ],
  already_closed: [
    "Cet événement est déjà clôturé.",
    "Evènman sa a deja fèmen.",
  ],
  title_required: ["Donnez un titre à l’événement.", "Bay evènman an yon tit."],
  message_required: [
    "Écrivez le message de l’annonce.",
    "Ekri mesaj anons lan.",
  ],
  invalid_config: [
    "Les réglages de l’événement ne sont pas valides. Vérifiez chaque champ.",
    "Paramèt evènman an pa valab. Verifye chak chan.",
  ],
  invalid_schedule: [
    "Les dates ne sont pas valides. Le début doit être dans le futur.",
    "Dat yo pa valab. Kòmansman an dwe nan lavni.",
  ],
  invalid_deadline: [
    "La clôture des inscriptions doit précéder le début.",
    "Fen enskripsyon an dwe vini anvan kòmansman an.",
  ],
  schedule_expired: [
    "Cette date est déjà passée. Choisissez une nouvelle date.",
    "Dat sa a pase deja. Chwazi yon nouvo dat.",
  ],
  not_enough_questions: [
    "Il n’y a pas assez de questions dans cette catégorie.",
    "Pa gen ase kesyon nan kategori sa a.",
  ],
  unsupported_mode: [
    "Les équipes de trois jouent seulement en direct ou en fenêtre de jeu.",
    "Ekip twa moun jwe sèlman an dirèk oswa nan yon fenèt jwèt.",
  ],
  external_url_required: [
    "Ajoutez le lien HTTPS de l’inscription externe.",
    "Ajoute lyen HTTPS enskripsyon ekstèn nan.",
  ],
  external_event_required: [
    "Cette action concerne seulement les activités externes publiées.",
    "Aksyon sa a se pou aktivite ekstèn ki pibliye sèlman.",
  ],
  reward_provider_required: [
    "Précisez le fournisseur et le contact du prix.",
    "Presize founisè ak kontak pri a.",
  ],
  rewards_external_only: [
    "Un prix matériel n’est possible que pour une activité avec résultat déclaré.",
    "Yon pri materyèl posib sèlman pou yon aktivite ak rezilta deklare.",
  ],
  no_reward: [
    "Cet événement n’a pas de prix déclaré.",
    "Evènman sa a pa gen pri ki deklare.",
  ],
  checkin_unavailable: [
    "L’accueil des inscrits est réservé aux événements en présentiel publiés.",
    "Akèy moun ki enskri se pou evènman an pèsòn ki pibliye sèlman.",
  ],
  cohost_limit: [
    "Cet événement a déjà le nombre maximal de co-organisateurs.",
    "Evènman sa a gen kantite ko-òganizatè maksimòm lan deja.",
  ],
  invalid_role: ["Choisissez un rôle valide.", "Chwazi yon wòl ki valab."],
  invalid_kind: [
    "Ce type de signalement n’est pas reconnu.",
    "Nou pa rekonèt kalite rapò sa a.",
  ],
  reason_required: [
    "Expliquez le motif en quelques mots.",
    "Esplike rezon an an kèk mo.",
  ],
  resolution_required: [
    "Écrivez la décision et sa justification.",
    "Ekri desizyon an ak jistifikasyon li.",
  ],
  result_not_final: [
    "Le résultat n’est pas encore final et confirmé.",
    "Rezilta a poko final ak konfime.",
  ],
  result_not_ready: [
    "Le résultat de l’événement n’est pas encore prêt.",
    "Rezilta evènman an poko pare.",
  ],
  report_required: [
    "Déclarez d’abord les scores avant de les confirmer.",
    "Deklare nòt yo anvan ou konfime yo.",
  ],
  invalid_result: [
    "Chaque score doit être entre 0 et 100, pour des entrées inscrites.",
    "Chak nòt dwe ant 0 ak 100, pou antre ki enskri.",
  ],
  invalid_status: [
    "Choisissez un statut valide.",
    "Chwazi yon estati ki valab.",
  ],
  unresolved_disputes: [
    "Résolvez d’abord les contestations ouvertes.",
    "Rezoud kontestasyon ki louvri yo anvan.",
  ],

  // ── Leagues ───────────────────────────────────────────────────────────
  league_unavailable: [
    "Cette saison n’est pas disponible.",
    "Sezon sa a pa disponib.",
  ],
  league_closed: ["Cette saison est clôturée.", "Sezon sa a fèmen."],
  already_active: ["Cette saison est déjà ouverte.", "Sezon sa a deja louvri."],
  already_enrolled: [
    "Cette équipe participe déjà à la saison.",
    "Ekip sa a deja nan sezon an.",
  ],
  enrollment_closed: [
    "Les inscriptions à cette saison sont fermées.",
    "Enskripsyon nan sezon sa a fèmen.",
  ],
  unresolved_fixtures: [
    "Des rencontres attendent encore un résultat ou une décision.",
    "Gen rankont ki toujou ap tann yon rezilta oswa yon desizyon.",
  ],
  fixture_not_found: [
    "Cette rencontre est introuvable.",
    "Nou pa jwenn rankont sa a.",
  ],
  fixture_already_linked: [
    "Un événement est déjà lié à cette rencontre.",
    "Gen yon evènman ki deja lye ak rankont sa a.",
  ],
  fixture_schedule_mismatch: [
    "L’horaire de l’événement ne correspond pas à celui de la rencontre.",
    "Orè evènman an pa koresponn ak orè rankont lan.",
  ],
  fixture_source_not_declared: [
    "Liez d’abord un événement source à cette rencontre.",
    "Lye yon evènman sous ak rankont sa a anvan.",
  ],
  incompatible_fixture: [
    "Cet événement ne correspond pas aux équipes de la rencontre.",
    "Evènman sa a pa koresponn ak ekip rankont lan.",
  ],
  incompatible_scoring_policy: [
    "Le barème de cet événement ne correspond pas à celui de la saison.",
    "Echèl nòt evènman sa a pa koresponn ak pa sezon an.",
  ],
  incompatible_source: [
    "Cet événement ne peut pas servir de source pour cette saison.",
    "Evènman sa a pa ka sèvi kòm sous pou sezon sa a.",
  ],
  source_already_counted: [
    "Le résultat de cet événement compte déjà pour une autre rencontre.",
    "Rezilta evènman sa a deja konte pou yon lòt rankont.",
  ],

  // ── Admin console: competition switches ───────────────────────────────
  not_admin: [
    "Réservé aux administrateurs.",
    "Se administratè sèlman ki ka fè sa.",
  ],
  invalid_changes: [
    "Réglage invalide.",
    "Paramèt sa a pa valab.",
  ],

  // ── Shared-answer and relay team play ─────────────────────────────────
  team_modes_not_enabled: [
    "La réponse commune et le relais ne sont pas encore ouverts.",
    "Repons komen ak relè poko louvri.",
  ],
  team_mode_requires_teams: [
    "La réponse commune et le relais demandent des équipes de trois.",
    "Repons komen ak relè mande ekip twa moun.",
  ],
  invalid_roles: [
    "Choisissez des rôles différents parmi les trois titulaires.",
    "Chwazi wòl diferan pami twa titilè yo.",
  ],
  roles_locked: [
    "Les rôles sont figés depuis le début de l’épreuve.",
    "Wòl yo fikse depi konpetisyon an kòmanse.",
  ],
  not_a_starter: [
    "Seuls les trois titulaires inscrits de l’équipe peuvent jouer ici.",
    "Se sèlman twa titilè ki enskri nan ekip la ki ka jwe la a.",
  ],
  authority_stale: [
    "La réponse de l’équipe est passée à un coéquipier. Votre écran est à jour.",
    "Repons ekip la pase bay yon lòt manm. Ekran ou ajou kounye a.",
  ],
  not_authority_holder: [
    "Un coéquipier envoie la réponse de l’équipe. Proposez-lui votre idée.",
    "Se yon lòt manm ki voye repons ekip la. Pwopoze l lide ou.",
  ],
  holder_present: [
    "Le porteur de la réponse est toujours connecté. Réessayez s’il ne répond plus.",
    "Moun ki kenbe repons lan toujou konekte. Eseye ankò si li pa reponn ankò.",
  ],
  not_your_turn: [
    "Ce n’est pas votre tour de relais.",
    "Se pa tou relè ou.",
  ],
  turn_not_open: [
    "Votre tour de relais n’est pas encore ouvert.",
    "Tou relè ou poko louvri.",
  ],
  team_answer_exists: [
    "Votre équipe a déjà répondu à cette question.",
    "Ekip ou a deja reponn kesyon sa a.",
  ],
  team_not_started: [
    "L’épreuve n’a pas encore commencé.",
    "Konpetisyon an poko kòmanse.",
  ],
  team_client_required: [
    "Ce mode d’équipe demande la dernière version d’EdLight. Mettez l’application à jour ou jouez sur le site.",
    "Mòd ekip sa a mande dènye vèsyon EdLight. Mete aplikasyon an ajou oswa jwe sou sit la.",
  ],
  not_team_mode: [
    "Cet événement se joue en réponses individuelles.",
    "Evènman sa a jwe ak repons endividyèl.",
  ],
  ...same(
    ["Cette épreuve est annulée.", "Konpetisyon sa a anile."],
    "cancelled",
  ),
  ...same(
    ["Trop tard pour cette question.", "Twò ta pou kesyon sa a."],
    "answers_closed",
  ),
  ...same(
    [
      "Aucune partie ouverte en ce moment. Vérifiez l’horaire.",
      "Pa gen pati ki louvri kounye a. Gade orè a.",
    ],
    "no_open_round",
    "not_started",
    "invalid_round",
  ),
  ...same(
    [
      "Cette réponse ne correspond pas à la question en cours. Votre écran est mis à jour.",
      "Repons sa a pa koresponn ak kesyon kounye a. Ekran ou ap mete ajou.",
    ],
    "invalid_input",
    "not_live",
    "live_format",
    "question_not_found",
  ),
  ...same(
    [
      "La correction s’ouvre à la fin de l’épreuve.",
      "Koreksyon an ap louvri lè konpetisyon an fini.",
    ],
    "not_closed",
    "no_attempt",
  ),

  // ── Requests, retries and service ─────────────────────────────────────
  revision_conflict: [
    "La page a changé entre-temps. Actualisez puis recommencez.",
    "Paj la chanje pandan tan sa a. Rafrechi l epi rekòmanse.",
  ],
  operation_conflict: [
    "Cette opération a déjà été envoyée avec d’autres valeurs. Rouvrez le formulaire.",
    "Yo te deja voye operasyon sa a ak lòt valè. Relouvri fòmilè a.",
  ],
  receipt_unknown: [
    "La confirmation tarde. Réessayez sans changer les champs : le serveur retrouvera la même opération.",
    "Konfimasyon an pran tan. Eseye ankò san chanje chan yo : sèvè a ap jwenn menm operasyon an.",
  ],
  network: [
    "Connexion interrompue. Votre saisie est conservée ; réessayez.",
    "Koneksyon an koupe. Sa ou antre a konsève ; eseye ankò.",
  ],
  ...same(
    [
      "Le service est momentanément indisponible. Réessayez dans un instant.",
      "Sèvis la pa disponib pou kounye a. Eseye ankò nan yon ti moman.",
    ],
    "service_unavailable",
    "server_misconfigured",
  ),
  required: ["Complétez les champs requis.", "Ranpli chan obligatwa yo."],
  not_found: [
    "Cette destination est introuvable.",
    "Nou pa jwenn destinasyon sa a.",
  ],
  ...same(
    [
      "Cette demande n’est pas reconnue. Actualisez la page.",
      "Nou pa rekonèt demann sa a. Rafrechi paj la.",
    ],
    "invalid_action",
    "invalid_id",
    "invalid_cursor",
    "method_not_allowed",
  ),
};
