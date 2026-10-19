/** Shared French/Creole task composition; renderers retain platform conventions. */
import { TRIVIA_CATEGORY_IDS } from './workspaceCategories';
export type Copy = [string, string];
export type Field = {
  key: string;
  label: Copy;
  type?: 'text' | 'number' | 'date' | 'long' | 'select';
  required?: boolean;
  options?: Array<{ value: string; label: Copy }>;
  value?: string;
};
export interface Task {
  id: string;
  label: Copy;
  action: string;
  values?: Record<string, unknown>;
  fields?: Field[];
  confirm?: Copy;
}
export interface Destination {
  label: Copy;
  path: string;
}
export interface Panel {
  title: Copy;
  paragraphs?: Copy[];
  rows?: Copy[];
  links?: Destination[];
  tasks?: Task[];
}
export interface WorkspacePage {
  title: Copy;
  panels: Panel[];
}
export type WorkspaceTarget =
  | { kind: 'home' }
  | { kind: 'event' | 'team' | 'invite' | 'league' | 'school'; id: string };
const c = (fr: string, ht = fr): Copy => [fr, ht];
const field = (
  key: string,
  fr: string,
  ht: string,
  type: Field['type'] = 'text',
  value?: string,
): Field => ({ key, label: c(fr, ht), type, value, required: true });
const select = (
  key: string,
  label: Copy,
  options: Array<[string, string, string]>,
  value: string,
): Field => ({
  key,
  label,
  type: 'select',
  required: true,
  value,
  options: options.map(([v, fr, ht]) => ({ value: v, label: c(fr, ht) })),
});
const nameField = field('name', 'Nom de l’équipe', 'Non ekip la');
const schoolField = field('schoolKey', 'École approuvée', 'Lekòl ki apwouve');
const personField = field(
  'recipientUid',
  'Identifiant d’invitation du destinataire',
  'Idantifyan envitasyon moun nan',
);
const eventPath = (id: string) => `/arena/evenements/${id}`;
const teamPath = (id: string) => `/arena/equipes/${id}`;
const date = (ms: number) =>
  new Date(ms).toLocaleString('fr-HT', {
    timeZone: 'America/Port-au-Prince',
    dateStyle: 'medium',
    timeStyle: 'short',
  }) + ' (Haïti / Ayiti)';
export const copyFor = (copy: Copy, ht: boolean) => copy[ht ? 1 : 0];
export function workspacePage(
  target: WorkspaceTarget,
  data: any,
  mine: any,
  now: number,
): WorkspacePage {
  if (target.kind === 'home') {
    const panels: Panel[] = [];
    if (mine) {
      panels.push({
        title: c('Mon activité', 'Aktivite mwen'),
        paragraphs: [
          c(
            `Mon identifiant d’invitation : ${mine.uid}`,
            `Idantifyan envitasyon mwen : ${mine.uid}`,
          ),
        ],
        links: [
          ...(mine.inbox || []).map((row: any) => ({
            label: c(row.title),
            path:
              row.kind === 'team'
                ? teamPath(row.targetId)
                : row.kind === 'invite'
                  ? `/arena/invitations/${row.targetId}`
                  : row.kind === 'league'
                    ? `/arena/ligues/${row.targetId}`
                    : eventPath(row.targetId),
          })),
          ...(mine.myTournaments || []).map((row: any) => ({
            label: c(row.title),
            path: `/tournois/${row.tid}`,
          })),
        ],
      });
      panels.push({
        title: c('Mes équipes', 'Ekip mwen yo'),
        links: (mine.teams || []).map((team: any) => ({
          label: c(team.name),
          path: teamPath(team.id),
        })),
        tasks: mine.creationEnabled
          ? [
              {
                id: 'new-team',
                action: 'team-create',
                label: c('Créer une équipe', 'Kreye yon ekip'),
                fields: [
                  nameField,
                  { ...schoolField, required: false },
                  select(
                    'visibility',
                    c('Recrutement', 'Rekritman'),
                    [
                      [
                        'private',
                        'Sur invitation seulement',
                        'Sou envitasyon sèlman',
                      ],
                      [
                        'school',
                        'Demandes de mon école approuvée',
                        'Demann lekòl mwen ki apwouve',
                      ],
                    ],
                    'private',
                  ),
                ],
              },
            ]
          : [],
      });
      panels.push({
        title: c('Mon école', 'Lekòl mwen'),
        rows: (mine.memberships || []).map((m: any) =>
          c(`${m.schoolKey} · ${m.status}`),
        ),
        tasks: [
          {
            id: 'membership',
            action: 'membership-request',
            label: c(
              'Demander la vérification de mon école',
              'Mande verifikasyon lekòl mwen',
            ),
            fields: [schoolField],
          },
        ],
      });
      const host =
        mine.admin || mine.roles?.some((r: any) => r.status === 'approved');
      panels.push({
        title: c('Organiser', 'Òganize'),
        paragraphs: [
          c(
            'Les nouveaux événements sont limités à 60 joueurs. Les équipes répondent indépendamment avec trois titulaires. Internet est nécessaire.',
            'Nouvo evènman yo limite a 60 jwè. Ekip yo reponn endepandamman ak twa titilè. Entènèt nesesè.',
          ),
        ],
        tasks: [
          {
            id: 'event-create',
            action: 'event-save',
            label: c('Préparer un événement', 'Prepare yon evènman'),
            fields: eventFields(host, now),
          },
          ...(host
            ? [
                {
                  id: 'member-review',
                  action: 'membership-review',
                  label: c(
                    'Vérifier une affiliation scolaire',
                    'Verifye afilyasyon lekòl',
                  ),
                  fields: [
                    schoolField,
                    personField,
                    select(
                      'approve',
                      c('Décision', 'Desizyon'),
                      [
                        ['true', 'Approuver', 'Apwouve'],
                        ['false', 'Révoquer', 'Revoke'],
                      ],
                      'true',
                    ),
                  ],
                },
                {
                  id: 'league-create',
                  action: 'league-create',
                  label: c('Créer une saison pilote', 'Kreye yon sezon pilòt'),
                  fields: [
                    field(
                      'title',
                      'Nom de la saison / division',
                      'Non sezon / divizyon an',
                    ),
                    select(
                      'sourcePolicy',
                      c('Règles fixes des rencontres', 'Règ fiks rankont yo'),
                      [
                        [
                          'app_quiz_10x20_window24',
                          'Quiz : 10 questions, 20 secondes, fenêtre de 24 h',
                          'Kiz : 10 kesyon, 20 segonn, fenèt 24 è',
                        ],
                        [
                          'external_100_points_v1',
                          'Activité externe : même barème de 0 à 100 points',
                          'Aktivite ekstèn : menm echèl 0 rive 100 pwen',
                        ],
                      ],
                      'app_quiz_10x20_window24',
                    ),
                    schoolField,
                    select(
                      'public',
                      c('Audience', 'Odyans'),
                      [
                        ['false', 'Privée', 'Prive'],
                        ['true', 'Publique', 'Piblik'],
                      ],
                      'false',
                    ),
                  ],
                },
              ]
            : []),
          ...(mine.admin
            ? [
                {
                  id: 'school-host',
                  action: 'school-host-review',
                  label: c(
                    'Autoriser un organisateur scolaire',
                    'Otorize yon òganizatè lekòl',
                  ),
                  fields: [
                    schoolField,
                    personField,
                    select(
                      'approve',
                      c('Décision', 'Desizyon'),
                      [
                        ['true', 'Approuver', 'Apwouve'],
                        ['false', 'Révoquer', 'Revoke'],
                      ],
                      'true',
                    ),
                  ],
                },
              ]
            : []),
        ],
      });
    }
    panels.push({
      title: c('Découvrir une compétition', 'Dekouvri yon konpetisyon'),
      paragraphs: [
        c(
          'Le championnat officiel, les tournois entre amis et les événements d’organisateurs ont leurs propres règles. Un groupe scolaire de scores n’est pas une équipe inscrite.',
          'Chanpyona ofisyèl la, tounwa ant zanmi ak evènman òganizatè yo gen pwòp règ yo. Yon gwoup nòt lekòl pa yon ekip ki enskri.',
        ),
      ],
      links: [
        ...(data.events || []).map((e: any) => ({
          label: c(
            `${e.title} · ${e.hostName} · ${e.entryMode === 'named_team' ? '3 joueurs / équipe' : 'individuel'} · ${date(e.startsAt)}`,
          ),
          path: eventPath(e.id),
        })),
        ...(data.summaries || []).map((s: any) => ({
          label: c(`${s.title} · ${s.host} · ${s.format}`),
          path: s.href,
        })),
        ...(data.leagues || []).map((l: any) => ({
          label: c(l.title),
          path: `/arena/ligues/${l.id}`,
        })),
      ],
      rows: !(data.events?.length || data.summaries?.length)
        ? [
            c(
              'Aucun événement disponible dans cette page. La pratique reste disponible dans Jeux.',
              'Pa gen evènman disponib nan paj sa a. Pratik toujou disponib nan Jwèt.',
            ),
          ]
        : [],
    });
    if (mine?.membershipRequests?.length)
      panels.push({
        title: c('Affiliations à vérifier', 'Afilyasyon pou verifye'),
        tasks: mine.membershipRequests.map((r: any) => ({
          id: `membership-${r.schoolKey}-${r.uid}`,
          action: 'membership-review',
          label: c(`${r.schoolKey} · ${r.uid}`),
          values: { schoolKey: r.schoolKey, recipientUid: r.uid },
          fields: [
            select(
              'approve',
              c('Décision', 'Desizyon'),
              [
                ['true', 'Approuver', 'Apwouve'],
                ['false', 'Refuser / révoquer', 'Refize / revoke'],
              ],
              'true',
            ),
          ],
        })),
      });
    if (mine?.moderationReports?.length)
      panels.push({
        title: c('Modération privée', 'Moderasyon prive'),
        tasks: mine.moderationReports.map((r: any) => ({
          id: `moderate-${r.id}`,
          action: 'moderation-review',
          label: c(`${r.kind} · ${r.reason}`),
          values: { reportId: r.id },
          fields: [
            field(
              'resolution',
              'Décision et justification',
              'Desizyon ak jistifikasyon',
              'long',
            ),
            select(
              'hide',
              c('Accès public', 'Aksè piblik'),
              [
                ['true', 'Retirer de la découverte', 'Retire nan dekouvèt'],
                ['false', 'Conserver', 'Konsève'],
              ],
              'true',
            ),
          ],
        })),
      });
    if (data.schools?.length) {
      for (const panel of panels)
        for (const task of panel.tasks || [])
          for (const f of task.fields || [])
            if (f.key === 'schoolKey') {
              f.type = 'select';
              f.options = data.schools.map((s: any) => ({
                value: s.key,
                label: c(s.name),
              }));
            }
      panels.push({
        title: c('Parcourir une école', 'Dekouvri yon lekòl'),
        links: data.schools.slice(0, 100).map((s: any) => ({
          label: c(s.name),
          path: `/arena/ecoles/${encodeURIComponent(s.key)}`,
        })),
      });
    }
    if (mine && !mine.creationEnabled)
      for (const panel of panels)
        panel.tasks = panel.tasks?.filter(
          (task) =>
            !['team-create', 'event-save', 'league-create'].includes(
              task.action,
            ),
        );
    return { title: c('Compétitions', 'Konpetisyon'), panels };
  }
  if (target.kind === 'school')
    return {
      title: c(data.schoolKey),
      panels: [
        {
          title: c('Événements de cette école', 'Evènman lekòl sa a'),
          links: data.events.map((e: any) => ({
            label: c(e.title),
            path: eventPath(e.id),
          })),
        },
        {
          title: c('Équipes ouvertes aux demandes', 'Ekip ki ouvè pou demann'),
          paragraphs: !data.member
            ? [
                c(
                  'La liste de recrutement est réservée aux membres approuvés.',
                  'Lis rekritman an rezève pou manm ki apwouve yo.',
                ),
              ]
            : [],
          links: data.teams.map((team: any) => ({
            label: c(`${team.name} · ${team.memberCount}`),
            path: teamPath(team.id),
          })),
          tasks: !data.member
            ? [
                {
                  id: 'school-membership',
                  action: 'membership-request',
                  label: c('Demander mon affiliation', 'Mande afilyasyon mwen'),
                  values: { schoolKey: target.id },
                },
              ]
            : [],
        },
      ],
    };
  if (target.kind === 'invite') {
    const invite = data.invite;
    return {
      title: c('Invitation d’équipe', 'Envitasyon ekip'),
      panels: [
        {
          title: c(invite.teamName),
          rows: [c(`${invite.status} · ${date(invite.expiresAt)}`)],
          tasks:
            invite.status === 'pending'
              ? [
                  {
                    id: 'accept',
                    action: 'invite-respond',
                    label: c('Accepter l’invitation', 'Aksepte envitasyon an'),
                    values: { inviteId: target.id, accept: true },
                  },
                  {
                    id: 'decline',
                    action: 'invite-respond',
                    label: c('Décliner', 'Refize'),
                    values: { inviteId: target.id, accept: false },
                  },
                  {
                    id: 'block',
                    action: 'block-inviter',
                    label: c(
                      'Bloquer les prochaines invitations de cet expéditeur',
                      'Bloke lòt envitasyon moun sa a',
                    ),
                    values: { recipientUid: invite.senderUid },
                  },
                ]
              : [],
          links:
            invite.status === 'accepted'
              ? [
                  {
                    label: c('Ouvrir l’équipe', 'Louvri ekip la'),
                    path: teamPath(invite.teamId),
                  },
                ]
              : [],
        },
      ],
    };
  }
  if (target.kind === 'team') {
    const team = data.team;
    const captain = team.captainUid === mine?.uid;
    const requestTasks: Task[] = [
      ...(data.canRequest
        ? [
            {
              id: 'request-membership',
              action: 'recruitment-request',
              label: c(
                'Demander à rejoindre cette équipe',
                'Mande antre nan ekip sa a',
              ),
              values: { teamId: target.id },
            },
          ]
        : []),
      ...(data.requests || []).map((r: any) => ({
        id: `recruit-${r.uid}`,
        action: 'recruitment-review',
        label: c(`Demande / Demann : ${r.publicName}`),
        values: { teamId: target.id, recipientUid: r.uid },
        fields: [
          select(
            'approve',
            c('Décision', 'Desizyon'),
            [
              ['true', 'Accepter', 'Aksepte'],
              ['false', 'Refuser', 'Refize'],
            ],
            'true',
          ),
        ],
      })),
      ...(data.invites || [])
        .filter((i: any) => i.status === 'pending')
        .map((i: any) => ({
          id: `revoke-${i.id}`,
          action: 'invite-revoke',
          label: c(
            `Révoquer invitation / Revoke envitasyon : ${i.recipientUid}`,
          ),
          values: { inviteId: i.id },
        })),
      ...(captain
        ? [
            {
              id: 'visibility',
              action: 'team-visibility',
              label: c('Recrutement de l’équipe', 'Rekritman ekip la'),
              values: { teamId: target.id },
              fields: [
                select(
                  'visibility',
                  c('Disponibilité', 'Disponibilite'),
                  [
                    ['private', 'Sur invitation', 'Sou envitasyon'],
                    ['school', 'Demandes de l’école', 'Demann lekòl'],
                  ],
                  'private',
                ),
              ],
            },
          ]
        : []),
    ];
    return {
      title: c(team.name),
      panels: [
        {
          title: c('Demandes et invitations', 'Demann ak envitasyon'),
          tasks: requestTasks,
        },
        {
          title: c('Membres et capitaine', 'Manm ak kapitèn'),
          rows: (team.members || []).map((uid: string) =>
            c(
              `${uid}${uid === team.captainUid ? ' · Capitaine / Kapitèn' : ''}`,
            ),
          ),
          paragraphs: [
            c(
              'L’appartenance à cette équipe ne vaut pas inscription à un événement. Chaque titulaire devra confirmer sa participation.',
              'Lè ou nan ekip sa a sa pa vle di ou enskri nan yon evènman. Chak titilè dwe konfime patisipasyon li.',
            ),
          ],
          tasks: captain
            ? [
                {
                  id: 'invite',
                  action: 'team-invite',
                  label: c('Inviter un membre', 'Envite yon manm'),
                  values: { teamId: target.id },
                  fields: [personField],
                },
                {
                  id: 'transfer',
                  action: 'team-transfer',
                  label: c('Transférer le capitanat', 'Transfere wòl kapitèn'),
                  values: { teamId: target.id },
                  fields: [
                    select(
                      'recipientUid',
                      c('Nouveau capitaine', 'Nouvo kapitèn'),
                      team.members
                        .filter((u: string) => u !== mine.uid)
                        .map((u: string) => [u, u, u]),
                      '',
                    ),
                  ],
                },
                {
                  id: 'league-consent',
                  action: 'league-consent',
                  label: c(
                    'Confirmer une invitation à une ligue',
                    'Konfime yon envitasyon lig',
                  ),
                  values: { teamId: target.id },
                  fields: [
                    field('leagueId', 'Code de la saison', 'Kòd sezon an'),
                  ],
                },
              ]
            : team.members?.includes(mine?.uid)
              ? [
                  {
                    id: 'leave',
                    action: 'team-leave',
                    label: c('Quitter l’équipe', 'Kite ekip la'),
                    values: { teamId: target.id },
                    confirm: c(
                      'Les compositions et résultats des événements passés seront conservés.',
                      'Konpozisyon ak rezilta ansyen evènman yo ap konsève.',
                    ),
                  },
                ]
              : [],
        },
        reportPanel('team', target.id),
      ],
    };
  }
  if (target.kind === 'league') return leaguePage(target.id, data);
  return eventPage(target.id, data, mine, now);
}
function eventFields(host: boolean, now: number): Field[] {
  return [
    field('title', 'Nom de l’événement', 'Non evènman an'),
    {
      ...field('description', 'Description', 'Deskripsyon', 'long'),
      required: false,
    },
    select(
      'entryMode',
      c('Participation', 'Patisipasyon'),
      [
        ['individual', 'Individuelle', 'Endividyèl'],
        ['named_team', 'Équipes de trois', 'Ekip twa moun'],
      ],
      'individual',
    ),
    select(
      'format',
      c('Format', 'Fòma'),
      [
        ['live', 'En direct', 'An dirèk'],
        ['window', 'Fenêtre de jeu', 'Fenèt jwèt'],
        ['rounds', 'Manches individuelles', 'Manch endividyèl'],
        ['bracket', 'Élimination individuelle', 'Eliminasyon endividyèl'],
      ],
      'window',
    ),
    field(
      'startsAt',
      'Début (date et heure locales)',
      'Kòmansman (dat ak lè lokal)',
      'date',
      new Date(now + 86400000).toISOString(),
    ),
    field(
      'registrationClosesAt',
      'Clôture des inscriptions',
      'Fen enskripsyon',
      'date',
      new Date(now + 82800000).toISOString(),
    ),
    field(
      'windowHours',
      'Durée de la fenêtre en heures',
      'Dire fenèt la an èdtan',
      'number',
      '24',
    ),
    select(
      'category',
      c('Questions de culture générale', 'Kesyon kilti jeneral'),
      TRIVIA_CATEGORY_IDS.map(([id, fr, ht]) => [id, fr, ht]),
      TRIVIA_CATEGORY_IDS[0][0],
    ),
    select(
      'audience',
      c('Qui peut regarder ?', 'Ki moun ki ka gade?'),
      [
        ['public', 'Public', 'Piblik'],
        ['school', 'École approuvée', 'Lekòl apwouve'],
        ['private', 'Participants et organisateurs', 'Patisipan ak òganizatè'],
      ],
      'public',
    ),
    select(
      'entryPolicy',
      c('Inscription', 'Enskripsyon'),
      [
        [
          'open',
          'Éligibles sans approbation',
          'Moun ki kalifye san apwobasyon',
        ],
        ['approval', 'Approbation de l’organisateur', 'Apwobasyon òganizatè'],
        ['invitation', 'Invitation de l’organisateur', 'Envitasyon òganizatè'],
      ],
      'open',
    ),
    { ...schoolField, required: false },
    {
      ...field(
        'department',
        'Département à parcourir (facultatif)',
        'Depatman pou dekouvri (si ou vle)',
      ),
      required: false,
    },
    select(
      'delivery',
      c('Déroulement', 'Dewoulman'),
      [
        ['online', 'Quiz en ligne', 'Kiz sou entènèt'],
        ...(host
          ? ([
              [
                'physical',
                'Quiz en présentiel avec internet',
                'Kiz an pèsòn ak entènèt',
              ],
              [
                'external',
                'Activité avec résultat déclaré',
                'Aktivite ak rezilta deklare',
              ],
            ] as Array<[string, string, string]>)
          : []),
      ],
      'online',
    ),
    ...['venue', 'instructions', 'externalUrl'].map((key, i) => ({
      ...field(
        key,
        [
          'Lieu réservé aux inscrits',
          'Instructions aux inscrits',
          'Lien HTTPS d’inscription externe',
        ][i],
        [
          'Kote pou moun ki enskri',
          'Enstriksyon pou moun ki enskri',
          'Lyen HTTPS enskripsyon ekstèn',
        ][i],
      ),
      required: false,
    })),
    ...(host
      ? ['rewardDescription', 'rewardProvider', 'rewardContact'].map(
          (key, i) => ({
            ...field(
              key,
              [
                'Prix externe facultatif',
                'Fournisseur du prix',
                'Contact pour le prix',
              ][i],
              ['Pri ekstèn si genyen', 'Founisè pri', 'Kontak pou pri'][i],
            ),
            required: false,
          }),
        )
      : []),
  ];
}
function reportPanel(kind: string, targetId: string): Panel {
  return {
    title: c('Signaler un problème', 'Siyale yon pwoblèm'),
    tasks: [
      {
        id: 'report',
        action: 'report-content',
        label: c('Envoyer un signalement privé', 'Voye yon rapò prive'),
        values: { kind, targetId },
        fields: [field('reason', 'Motif', 'Rezon', 'long')],
      },
    ],
  };
}
function eventPage(
  eventId: string,
  data: any,
  mine: any,
  now: number,
): WorkspacePage {
  const e = data.event,
    manager = data.role === 'manager',
    open = e.state === 'published' && now < e.registrationClosesAt;
  const teams = (mine?.teams || []).filter(
    (team: any) => team.captainUid === mine.uid,
  );
  const panels: Panel[] = [
    {
      title: c(e.title),
      paragraphs: [
        c(e.description),
        c(
          `${e.hostName} · ${e.hostKind === 'school' ? 'Organisateur scolaire approuvé' : 'Organisé par des étudiants'}`,
        ),
        c(
          e.delivery === 'external'
            ? `Activité externe / Aktivite ekstèn · ${e.entryMode === 'named_team' ? '3 participants / patisipan' : 'Individuel / Endividyèl'} · score déclaré de 0 à 100 / nòt deklare 0 rive 100`
            : `${e.entryMode === 'named_team' ? '3 titulaires · réponses indépendantes · somme des points · absents = zéro' : 'Individuel'} · ${e.config.format} · ${e.config.questionCount} questions · ${e.config.secondsPerQuestion} s/question`,
        ),
        c(
          `Début / Kòmansman : ${date(e.config.startsAt)} · Inscriptions / Enskripsyon : ${date(e.registrationClosesAt)}`,
        ),
        c(
          `Audience / Odyans : ${e.audience} · Internet requis / Entènèt nesesè · ${e.state}`,
        ),
        c(
          e.reward
            ? `Prix externe / Pri ekstèn : ${e.reward.description} · ${e.reward.provider} · ${e.reward.contact}`
            : 'Sans prix matériel / San pri materyèl',
        ),
      ],
      rows: [
        ...(e.venue ? [c(e.venue)] : []),
        ...(e.instructions ? [c(e.instructions)] : []),
        ...data.announcements.map((a: any) => c(a.message)),
      ],
      links: e.tournamentId
        ? [
            {
              label: c(
                data.role === 'participant'
                  ? 'Jouer / reprendre / résultats'
                  : 'Regarder le quiz et les résultats',
                data.role === 'participant'
                  ? 'Jwe / reprann / rezilta'
                  : 'Gade kiz la ak rezilta yo',
              ),
              path: `/tournois/${e.tournamentId}`,
            },
          ]
        : e.externalUrl
          ? [
              {
                label: c(
                  'Ouvrir l’inscription externe — retournez ici pour le suivi',
                  'Louvri enskripsyon ekstèn — retounen isit pou swivi',
                ),
                path: e.externalUrl,
              },
            ]
          : [],
      tasks: [],
    },
  ];
  if (e.delivery === 'external')
    panels[0].paragraphs!.push(
      c(
        'Le suivi dans EdLight ne confirme pas votre inscription auprès du site externe. Suivez ses instructions et sa confirmation. Les scores seront déclarés par l’organisateur.',
        'Swivi nan EdLight pa konfime enskripsyon ou sou sit ekstèn nan. Swiv enstriksyon ak konfimasyon li yo. Òganizatè a ap deklare nòt yo.',
      ),
    );
  if (data.rewards?.length)
    panels.push({
      title: c(
        'Remise du prix — déclaration de l’organisateur',
        'Livrezon pri — deklarasyon òganizatè',
      ),
      rows: data.rewards.map((r: any) => c(`${r.entryId} · ${r.status}`)),
    });
  if (mine && e.state !== 'draft')
    panels[0].tasks!.push({
      id: 'follow',
      action: 'event-follow',
      label: data.following
        ? c('Ne plus suivre cet événement', 'Pa swiv evènman sa a ankò')
        : c('Suivre sans s’inscrire', 'Swiv san enskri'),
      values: { eventId, follow: !data.following },
    });
  if (data.namedTeams?.length)
    panels.push({
      title: c(
        data.engineState === 'finished'
          ? 'Résultat des équipes'
          : 'Classement en cours des équipes',
        data.engineState === 'finished'
          ? 'Rezilta ekip yo'
          : 'Klasman ekip yo an kou',
      ),
      rows: data.namedTeams.map((r: any) =>
        c(
          `${r.rank}. ${r.label} · ${r.points} pts · ${r.missing} absents / absan`,
        ),
      ),
    });
  if (open && mine) {
    if (!data.eligible)
      panels[0].paragraphs!.push(
        c(
          'Votre affiliation doit être approuvée avant inscription. Regarder ne vous inscrit pas.',
          'Afilyasyon ou dwe apwouve anvan enskripsyon. Gade pa enskri ou.',
        ),
      );
    panels[0].tasks!.push(
      e.entryMode === 'individual'
        ? {
            id: 'entry-draft',
            action: 'roster-save',
            label:
              e.delivery === 'external'
                ? c(
                    'Ajouter ma participation au suivi EdLight',
                    'Ajoute patisipasyon mwen nan swivi EdLight',
                  )
                : c('Préparer mon inscription', 'Prepare enskripsyon mwen'),
            values: { eventId },
          }
        : {
            id: 'roster',
            action: 'roster-save',
            label: c('Choisir trois titulaires', 'Chwazi twa titilè'),
            values: { eventId },
            fields: [
              select(
                'teamId',
                c('Mon équipe', 'Ekip mwen'),
                teams.map((team: any) => [team.id, team.name, team.name]),
                '',
              ),
              field(
                'starters',
                'Trois identifiants de membres séparés par des virgules',
                'Twa idantifyan manm separe ak vigil',
              ),
            ],
          },
    );
  }
  for (const entry of data.entries) {
    const tasks: Task[] = [];
    if (entry.state === 'draft' && open) {
      if (
        entry.starters.includes(mine?.uid) &&
        !entry.confirmed.includes(mine.uid)
      )
        tasks.push({
          id: `confirm-${entry.id}`,
          action: 'entry-confirm',
          label: c('Confirmer ma participation', 'Konfime patisipasyon mwen'),
          values: { eventId, entryId: entry.id },
        });
      if (entry.captainUid === mine?.uid)
        tasks.push({
          id: `register-${entry.id}`,
          action: 'entry-register',
          label:
            e.delivery === 'external'
              ? c(
                  'Confirmer le suivi EdLight et la composition',
                  'Konfime swivi EdLight ak konpozisyon',
                )
              : c(
                  'Inscrire et verrouiller la composition',
                  'Enskri epi bloke konpozisyon an',
                ),
          values: { eventId, entryId: entry.id },
          confirm: c(
            'Les trois titulaires doivent avoir confirmé. Cette action réserve une place.',
            'Twa titilè yo dwe konfime. Aksyon sa a rezève yon plas.',
          ),
        });
      if (manager && e.entryPolicy !== 'open')
        tasks.push({
          id: `approve-${entry.id}`,
          action: 'entry-approve',
          label: c(
            'Approuver / inviter cette entrée',
            'Apwouve / envite antre sa a',
          ),
          values: { eventId, entryId: entry.id, approve: true },
        });
    }
    if (entry.state === 'registered' && open && entry.captainUid === mine?.uid)
      tasks.push({
        id: `withdraw-${entry.id}`,
        action: 'entry-withdraw',
        label: c(
          'Retirer l’inscription pour modifier la composition',
          'Retire enskripsyon pou modifye konpozisyon an',
        ),
        values: { eventId, entryId: entry.id },
        confirm: c(
          'La place sera libérée. Il faudra confirmer et inscrire de nouveau.',
          'Plas la ap libere. Fòk ou konfime epi enskri ankò.',
        ),
      });
    panels.push({
      title: c(entry.label),
      rows: [
        c(
          `${entry.state} · ${entry.confirmed.length}/${entry.starters.length} confirmations`,
        ),
        ...entry.starters.map((s: string) =>
          c(
            `${s} · ${entry.confirmed.includes(s) ? 'Confirmé / Konfime' : 'À confirmer / Pou konfime'}`,
          ),
        ),
      ],
      tasks,
    });
  }
  if (e.delivery === 'external')
    panels.push({
      title: c(
        `Résultat déclaré par l’organisateur · ${e.resultStatus}`,
        `Rezilta òganizatè deklare · ${e.resultStatus}`,
      ),
      rows: e.resultRows.map((r: any) => c(`${r.label || r.entryId} · ${r.score} pts`)),
    });
  if (mine && data.role === 'participant')
    panels.push({
      title: c('Contester un résultat', 'Konteste yon rezilta'),
      tasks: [
        {
          id: 'dispute',
          action: 'event-dispute',
          label: c('Envoyer une contestation', 'Voye yon kontestasyon'),
          values: { eventId },
          fields: [field('reason', 'Motif privé', 'Rezon prive', 'long')],
        },
      ],
    });
  if (manager) panels.push(...organizerPanels(eventId, e, data));
  if (data.role === 'checkin' || manager)
    panels.push({
      title: c('Accueil des inscrits', 'Akèy moun ki enskri'),
      tasks:
        e.delivery === 'physical'
          ? [
              {
                id: 'checkin',
                action: 'checkin',
                label: c('Confirmer une présence', 'Konfime yon prezans'),
                values: { eventId },
                fields: [personField],
              },
            ]
          : [],
    });
  panels.push(reportPanel('event', eventId));
  return { title: c(e.title), panels };
}
function organizerPanels(eventId: string, e: any, data: any): Panel[] {
  const values = { eventId };
  const tasks: Task[] = [];
  if (e.state === 'draft')
    tasks.push({
      id: 'edit-draft',
      action: 'event-save',
      label: c('Modifier le brouillon', 'Modifye bouyon an'),
      values: { eventId, revision: e.revision },
      fields: eventFields(e.hostKind === 'school', Date.now()).map((f) => ({
        ...f,
        value:
          f.type === 'date'
            ? new Date(({ ...e, ...e.config } as any)[f.key]).toISOString()
            : String(
                (
                  {
                    ...e,
                    ...e.config,
                    category: e.config.categories[0],
                    rewardDescription: e.reward?.description,
                    rewardProvider: e.reward?.provider,
                    rewardContact: e.reward?.contact,
                  } as any
                )[f.key] ??
                  f.value ??
                  '',
              ),
      })),
    });
  if (e.state === 'draft')
    tasks.push({
      id: 'publish',
      action: 'event-publish',
      label: c(
        'Publier les règles et ouvrir les inscriptions',
        'Pibliye règ yo epi louvri enskripsyon',
      ),
      values: { ...values, revision: e.revision },
      confirm: c(
        'Vérifiez horaires, audience et règles avant publication.',
        'Verifye orè, odyans ak règ yo anvan piblikasyon.',
      ),
    });
  if (e.state === 'published')
    tasks.push(
      {
        id: 'announce',
        action: 'event-announce',
        label: c('Publier une annonce', 'Pibliye yon anons'),
        values,
        fields: [
          field(
            'message',
            'Annonce aux participants',
            'Anons pou patisipan yo',
            'long',
          ),
        ],
      },
      {
        id: 'postpone',
        action: 'event-postpone',
        label: c('Reporter avant le début', 'Ranvwaye anvan kòmansman'),
        values,
        fields: [field('startsAt', 'Nouveau début', 'Nouvo kòmansman', 'date')],
        confirm: c(
          'Chaque inscrit devra confirmer de nouveau. Les anciennes places seront libérées.',
          'Chak moun ki enskri dwe konfime ankò. Ansyen plas yo ap libere.',
        ),
      },
      {
        id: 'close',
        action: 'event-close',
        label: c(
          'Clôturer après résultat confirmé',
          'Fèmen apre rezilta konfime',
        ),
        values,
      },
      {
        id: 'cancel',
        action: 'event-cancel',
        label: c('Annuler l’événement', 'Anile evènman an'),
        values,
        confirm: c(
          'Les participants verront l’annulation. Les archives sont conservées.',
          'Patisipan yo ap wè anilasyon an. Achiv yo konsève.',
        ),
      },
      {
        id: 'void',
        action: 'event-no-contest',
        label: c(
          'Déclarer sans résultat sportif',
          'Deklare san rezilta espòtif',
        ),
        values,
        confirm: c(
          'Aucune victoire ni qualification ne sera attribuée.',
          'Pa gen viktwa ni kalifikasyon ki ap bay.',
        ),
      },
    );
  tasks.push({
    id: 'cohost',
    action: 'event-cohost',
    label: c('Gérer un co-organisateur', 'Jere yon ko-òganizatè'),
    values,
    fields: [
      personField,
      select(
        'role',
        c('Rôle', 'Wòl'),
        [
          ['checkin', 'Accueil seulement', 'Akèy sèlman'],
          ['manage', 'Gestion de l’événement', 'Jesyon evènman'],
          ['remove', 'Retirer l’accès', 'Retire aksè'],
        ],
        'checkin',
      ),
    ],
  });
  if (e.delivery === 'external' && e.state !== 'draft')
    tasks.push(
      {
        id: 'report-result',
        action: 'event-report-result',
        label: c('Déclarer les scores externes', 'Deklare nòt ekstèn yo'),
        values: { ...values, revision: e.resultRevision },
        fields: [
          field(
            'rows',
            'Une ligne par entrée : code, score',
            'Yon liy pa antre : kòd, nòt',
            'long',
          ),
        ],
      },
      {
        id: 'confirm-result',
        action: 'event-confirm-result',
        label: c('Confirmer le résultat déclaré', 'Konfime rezilta deklare a'),
        values: { ...values, revision: e.resultRevision },
      },
    );
  if (e.reward)
    tasks.push({
      id: 'reward',
      action: 'reward-update',
      label: c('Mettre à jour la remise du prix', 'Mete livrezon pri ajou'),
      values,
      fields: [
        field(
          'entryId',
          'Code de l’entrée bénéficiaire',
          'Kòd antre benefisyè a',
        ),
        select(
          'status',
          c('Remise déclarée par l’organisateur', 'Livrezon òganizatè deklare'),
          [
            ['eligible', 'Éligible', 'Kalifye'],
            ['fulfillment_pending', 'Remise en attente', 'Livrezon annatant'],
            ['fulfilled', 'Remis', 'Livre'],
            ['disputed', 'Contesté', 'Konteste'],
          ],
          'fulfillment_pending',
        ),
      ],
    });
  return [
    {
      title: c('Console organisateur', 'Konsòl òganizatè'),
      paragraphs: [c(`Code de l’événement / Kòd evènman : ${eventId}`)],
      links: [
        {
          label: c(
            'Ouvrir l’écran public sans commandes privées',
            'Louvri ekran piblik san kòmand prive',
          ),
          path: `https://academy.edlight.org/arena/ecran/${eventId}`,
        },
      ],
      tasks,
    },
    ...data.disputes.map((d: any) => ({
      title: c('Contestation privée', 'Kontestasyon prive'),
      rows: [c(d.reason), c(d.state)],
      tasks:
        d.state === 'open'
          ? [
              {
                id: `resolve-${d.id}`,
                action: 'dispute-resolve',
                label: c('Répondre et résoudre', 'Reponn epi rezoud'),
                values: { eventId, disputeId: d.id },
                fields: [
                  field(
                    'resolution',
                    'Décision et justification',
                    'Desizyon ak jistifikasyon',
                    'long',
                  ),
                ],
              },
            ]
          : [],
    })),
  ];
}
function leaguePage(leagueId: string, data: any): WorkspacePage {
  const league = data.league,
    values = { leagueId, revision: league.revision };
  const tasks: Task[] = [];
  if (data.invitedTeams?.length && league.state === 'draft')
    tasks.push({
      id: 'consent',
      action: 'league-consent',
      label: c('Accepter les règles de cette saison', 'Aksepte règ sezon sa a'),
      values: { leagueId },
      fields: [
        select(
          'teamId',
          c('Mon équipe invitée', 'Ekip mwen ki envite'),
          data.invitedTeams.map((team: any) => [
            team.id,
            team.label,
            team.label,
          ]),
          '',
        ),
      ],
    });
  if (data.manager && league.state === 'closed')
    tasks.push({
      id: 'reopen',
      action: 'league-reopen',
      label: c(
        'Rouvrir pour corriger un résultat',
        'Relouvri pou korije yon rezilta',
      ),
      values,
      fields: [
        field('reason', 'Motif de réouverture', 'Rezon relouvri', 'long'),
      ],
    });
  if (data.manager && league.state === 'draft')
    tasks.push(
      {
        id: 'league-invite',
        action: 'league-invite',
        label: c(
          'Inviter une équipe à lire les règles',
          'Envite yon ekip li règ yo',
        ),
        values: { leagueId },
        fields: [field('teamId', 'Code de l’équipe', 'Kòd ekip la')],
      },
      {
        id: 'enroll',
        action: 'league-enroll',
        label: c('Ajouter une équipe consentante', 'Ajoute yon ekip ki dakò'),
        values,
        fields: [field('teamId', 'Code de l’équipe', 'Kòd ekip la')],
      },
      {
        id: 'start',
        action: 'league-start',
        label: c('Publier les rencontres', 'Pibliye rankont yo'),
        values,
        fields: [
          field('startsAt', 'Première journée', 'Premye jounen', 'date'),
          field(
            'intervalHours',
            'Heures entre journées',
            'Èdtan ant jounen yo',
            'number',
            '168',
          ),
        ],
      },
    );
  if (data.manager && league.state === 'active')
    tasks.push({
      id: 'league-close',
      action: 'league-close',
      label: c('Clôturer la saison', 'Fèmen sezon an'),
      values,
    });
  return {
    title: c(league.title),
    panels: [
      {
        title: c('Règles de la division', 'Règ divizyon an'),
        paragraphs: [
          c(
            'Victoire 3 · nul 1 · défaite 0. Égalités : différence de points, puis points marqués, puis rang partagé. Les résultats contestés ne donnent pas de points. Trois titulaires confirmés à chaque rencontre.',
            'Viktwa 3 · nil 1 · defèt 0. Egalite : diferans pwen, apre sa pwen make, apre sa ran pataje. Rezilta konteste pa bay pwen. Twa titilè konfime nan chak rankont.',
          ),
          c(`Code de saison / Kòd sezon : ${leagueId} · ${league.state}`),
          c(
            league.sourcePolicy === 'external_100_points_v1'
              ? 'Activité externe, barème identique de 0 à 100 points par équipe / Aktivite ekstèn, menm echèl 0 rive 100 pwen pa ekip'
              : 'Quiz : 10 questions de culture générale, 20 s/question, fenêtre de 24 h / Kiz : 10 kesyon kilti jeneral, 20 s/kesyon, fenèt 24 è',
          ),
        ],
        tasks,
      },
      {
        title: c(
          league.state === 'closed'
            ? 'Classement final'
            : 'Classement en cours',
          league.state === 'closed' ? 'Klasman final' : 'Klasman an kou',
        ),
        rows: data.table.map((r: any) =>
          c(
            `${r.rank}. ${r.label} · ${r.points} pts · ${r.played} joués / jwe · ${r.remaining} restants / rete · ${r.wins}/${r.draws}/${r.losses}`,
          ),
        ),
      },
      ...league.fixtures.map((f: any) => ({
        title: c(
          `${league.entrants.find((e: any) => e.id === f.home)?.label} / ${league.entrants.find((e: any) => e.id === f.away)?.label}`,
        ),
        rows: [
          c(
            `${date(f.startsAt)} · ${f.status} · ${f.homeScore ?? '—'} / ${f.awayScore ?? '—'}`,
          ),
        ],
        tasks:
          data.manager && league.state === 'active'
            ? [
                ...(!f.sourceKey
                  ? [
                      {
                        id: `link-${f.id}`,
                        action: 'fixture-link',
                        label: c(
                          'Lier un événement brouillon avant toute inscription',
                          'Lye yon evènman bouyon anvan nenpòt enskripsyon',
                        ),
                        values: { ...values, fixtureId: f.id },
                        fields: [
                          field(
                            'eventId',
                            'Code du brouillon (même école, équipes de trois, même horaire)',
                            'Kòd bouyon (menm lekòl, ekip twa moun, menm orè)',
                          ),
                        ],
                      },
                    ]
                  : []),
                {
                  id: `fixture-${f.id}`,
                  action: 'fixture-update',
                  label: c('Gérer cette rencontre', 'Jere rankont sa a'),
                  values: { ...values, fixtureId: f.id },
                  fields: [
                    select(
                      'status',
                      c('Décision', 'Desizyon'),
                      [
                        ['postponed', 'Reportée', 'Ranvwaye'],
                        ['scheduled', 'Programmée', 'Pwograme'],
                        ['disputed', 'Contestée', 'Konteste'],
                        ['no_contest', 'Sans résultat', 'San rezilta'],
                        [
                          'final',
                          'Importer le résultat final de l’événement',
                          'Enpòte rezilta final evènman an',
                        ],
                      ],
                      'postponed',
                    ),
                    {
                      ...field(
                        'eventId',
                        'Code de l’événement source (résultat final)',
                        'Kòd evènman sous (rezilta final)',
                      ),
                      required: false,
                    },
                    {
                      ...field(
                        'startsAt',
                        'Nouvelle date si reportée',
                        'Nouvo dat si ranvwaye',
                        'date',
                      ),
                      required: false,
                    },
                    field(
                      'reason',
                      'Justification conservée dans le journal',
                      'Jistifikasyon ki konsève nan jounal',
                      'long',
                    ),
                  ],
                },
              ]
            : [],
      })),
      reportPanel('league', leagueId),
    ],
  };
}
export function taskPayload(
  task: Task,
  input: Record<string, string>,
  now: number,
): Record<string, unknown> {
  const values: Record<string, unknown> = { ...task.values };
  for (const f of task.fields || []) {
    const value =
      f.type === 'date' &&
      (input[`${f.key}Date`] !== undefined ||
        input[`${f.key}Time`] !== undefined)
        ? `${input[`${f.key}Date`] ?? (input[f.key] || '').slice(0, 10)}T${input[`${f.key}Time`] ?? '00:00'}`
        : (input[f.key] ?? f.value ?? '');
    if (!value && !f.required) continue;
    if (f.required && !value.trim()) throw new Error('required');
    values[f.key] =
      f.type === 'date'
        ? new Date(value).getTime()
        : f.type === 'number'
          ? Number(value)
          : value;
  }
  for (const key of ['approve', 'public', 'hide'])
    if (values[key] !== undefined)
      values[key] = values[key] === 'true' || values[key] === true;
  if (task.action === 'roster-save' && values.starters)
    values.starters = String(values.starters)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  if (task.action === 'event-report-result')
    values.rows = String(values.rows)
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [entryId, score] = line.split(',');
        return { entryId: entryId.trim(), score: Number(score) };
      });
  if (task.action === 'event-save') {
    values.config = {
      title: values.title,
      description: values.description || '',
      format: values.format,
      visibility: 'private',
      teamRule: 'solo',
      categories: [values.category],
      questionCount: 10,
      secondsPerQuestion: 20,
      startsAt: values.startsAt ?? now + 86400000,
      windowHours: values.windowHours ?? 24,
      roundHours: values.windowHours ?? 24,
      roundCount: 2,
      maxPlayers: 30,
      creatorPlays: false,
    };
    if (values.rewardDescription)
      values.reward = {
        description: values.rewardDescription,
        provider: values.rewardProvider,
        contact: values.rewardContact,
      };
  }
  return { action: task.action, ...values };
}
