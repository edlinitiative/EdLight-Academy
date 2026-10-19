/**
 * TournoisCreateForm — native tournament creation, at parity with the web
 * wizard (src/pages/tournois/TournoisCreate.tsx).
 *
 *  - "Rapide": the one-tap public preset (title + format, starts in 10 min).
 *  - "Personnaliser": every web option — format, categories, question count
 *    and time, start date/time, window/round/bracket lengths, bracket size,
 *    team rule and counted players, visibility (public / unlisted / private
 *    PIN room) and whether the organiser plays.
 *
 * The body is built by shared/tournois/creationInput (the same mapping the web
 * uses) and checked with the server's own validator before any request; the
 * calendar preview is the server's buildSchedule. TournoisPinCard is what the
 * organiser sees after creating a private or unlisted room.
 */
import React, { useRef, useState } from 'react';
import { Share, Text, TextInput, View } from 'react-native';
import { ArenaButton, ArenaPanel } from './ArenaKit';
import { arenaInputStyle } from './WorkspaceKit';
import {
  arenaColors as C,
  arenaRadius,
  arenaType,
} from '../../theme/arenaTheme';
import { TRIVIA_CATEGORIES } from '../../data/triviaData';
import {
  LIMITS,
  SECONDS_PER_QUESTION,
  formatPin,
  type TeamRule,
  type TournamentFormat,
  type Visibility,
} from '../../../../shared/tournois/config';
import {
  CREATION_CHOICES,
  defaultDraft,
  defaultStartAt,
  localDateParts,
  parseLocalDateTime,
  quickDraft,
  type TournamentDraft,
} from '../../../../shared/tournois/creationInput';
import { buildSchedule } from '../../../../shared/tournois/schedule';
import { haitiDate } from '../../../../shared/competition/labels';
import {
  checkCreation,
  formatLabel,
  shareUrl,
} from '../../services/tournoisService';

type T = (fr: string, ht: string) => string;

/** One labelled set of mutually exclusive choices. */
function Choices<V extends string | number>({
  label,
  value,
  options,
  onChange,
  stacked,
}: {
  label: string;
  value: V;
  options: Array<{ v: V; label: string }>;
  onChange: (v: V) => void;
  stacked?: boolean;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={[arenaType.label, { color: C.inkSoft }]}>{label}</Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        style={
          stacked
            ? { gap: 8 }
            : { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }
        }
      >
        {options.map((o) => (
          <ArenaButton
            key={String(o.v)}
            variant={value === o.v ? 'primary' : 'secondary'}
            selected={value === o.v}
            label={o.label}
            onPress={() => onChange(o.v)}
          />
        ))}
      </View>
    </View>
  );
}

function FieldError({ text }: { text: string | null }) {
  return text ? (
    <Text
      accessibilityRole="alert"
      style={[arenaType.status, { color: C.danger }]}
    >
      {text}
    </Text>
  ) : null;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 12 }}>
      <Text accessibilityRole="header" style={[arenaType.title, { color: C.ink }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}

export default function TournoisCreateForm({
  ht,
  busy,
  serverFields,
  onSubmit,
  now = Date.now,
}: {
  ht: boolean;
  busy: boolean;
  /** Fields the API refused (`invalid` + `fields`), shown like local errors. */
  serverFields?: string[];
  /** Resolves true once the tournament exists. */
  onSubmit: (draft: TournamentDraft) => Promise<boolean>;
  now?: () => number;
}) {
  const t: T = (fr, creole) => (ht ? creole : fr);
  const [mode, setMode] = useState<'quick' | 'custom'>('quick');
  const [draft, setDraft] = useState<TournamentDraft>(() => defaultDraft(now()));
  const [when, setWhen] = useState(() => localDateParts(draft.startsAt));
  const [tried, setTried] = useState(false);
  /**
   * The exact draft of an unconfirmed submission: a retry after a lost
   * receipt resends it unchanged (same operation id), any edit drops it.
   */
  const pending = useRef<TournamentDraft | null>(null);

  const edit = (patch: Partial<TournamentDraft>) => {
    pending.current = null;
    setDraft((d) => ({ ...d, ...patch }));
  };
  const editWhen = (patch: Partial<typeof when>) => {
    pending.current = null;
    setWhen((w) => ({ ...w, ...patch }));
  };

  const full: TournamentDraft =
    mode === 'quick'
      ? quickDraft(draft.title, draft.format, TRIVIA_CATEGORIES[0].id, now())
      : { ...draft, startsAt: parseLocalDateTime(when.date, when.time) };
  const verdict = checkCreation(full, now());
  const bad = new Set([
    ...(verdict.ok ? [] : verdict.errors),
    ...(serverFields || []),
  ]);
  // The calendar preview does not wait for a name: it is checked with a
  // stand-in title so it shows as soon as the dates are valid.
  const timing =
    mode === 'custom'
      ? verdict.ok
        ? verdict
        : checkCreation({ ...full, title: 'Aperçu' }, now())
      : null;
  const schedule = timing?.ok ? buildSchedule(timing.config) : null;
  const errorFor = (field: string): string | null => {
    if (!bad.has(field) || (field === 'title' && !tried && !draft.title))
      return null;
    switch (field) {
      case 'title':
        return t(
          `Le nom doit avoir ${LIMITS.titleMin} à ${LIMITS.titleMax} caractères.`,
          `Non an dwe gen ${LIMITS.titleMin} a ${LIMITS.titleMax} karaktè.`,
        );
      case 'categories':
        return t('Choisis au moins une catégorie.', 'Chwazi omwen yon kategori.');
      case 'startsAt':
        return t(
          'Date AAAA-MM-JJ et heure HH:MM, au moins 2 minutes à l’avance, au plus 60 jours.',
          'Dat AAAA-MM-JJ ak lè HH:MM, omwen 2 minit davans, pa plis pase 60 jou.',
        );
      default:
        return t('Choisis une option.', 'Chwazi yon opsyon.');
    }
  };

  const submit = async () => {
    setTried(true);
    if (!verdict.ok || busy) return;
    pending.current ??= full;
    if (await onSubmit(pending.current)) pending.current = null;
  };

  const FORMATS: Array<{ v: TournamentFormat; blurb: string }> = [
    { v: 'live', blurb: t('Tout le monde en même temps, à l’heure fixée. Une question à l’écran, podium entre chaque.', 'Tout moun an menm tan, a lè ou fikse a. Yon kesyon sou ekran, podyòm apre chak.') },
    { v: 'window', blurb: t('Ouvert d’une heure à deux semaines. Chacun joue une manche chronométrée quand il veut.', 'Louvri yon èdtan rive de semèn. Chak moun jwe yon manch kwonometre lè li vle.') },
    { v: 'rounds', blurb: t('Plusieurs manches à la suite (ex. une par jour). Les points s’additionnent.', 'Plizyè manch youn apre lòt (egz. youn pa jou). Pwen yo adisyone.') },
    { v: 'bracket', blurb: t('Duels en tableau : le meilleur score de chaque match passe au tour suivant.', 'Dyèl nan tablo : pi bon nòt chak match pase nan pwochen tou a.') },
  ];
  const VISIBILITY: Array<{ v: Visibility; name: string; blurb: string }> = [
    { v: 'public', name: t('Public', 'Piblik'), blurb: t('Listé dans Tournois. Tout le monde peut regarder en direct.', 'Parèt nan Tounwa. Tout moun ka gade an dirèk.') },
    { v: 'unlisted', name: t('Non listé', 'Pa nan lis'), blurb: t('Seuls ceux qui ont le lien ou le PIN peuvent regarder et jouer.', 'Se sèlman moun ki gen lyen an oswa PIN nan ki ka gade epi jwe.') },
    { v: 'private', name: t('Privé (PIN)', 'Prive (PIN)'), blurb: t('Salle de classe : seuls les joueurs entrés avec le PIN voient le tournoi.', 'Sal klas : se sèlman jwè ki antre ak PIN nan ki wè tounwa a.') },
  ];
  const hours = (h: number) =>
    h % 168 === 0
      ? t(`${h / 168} semaine${h > 168 ? 's' : ''}`, `${h / 168} semèn`)
      : h % 24 === 0
        ? t(`${h / 24} jour${h > 24 ? 's' : ''}`, `${h / 24} jou`)
        : t(`${h} heure${h > 1 ? 's' : ''}`, `${h} èdtan`);
  const counts =
    draft.format === 'live'
      ? CREATION_CHOICES.liveQuestionCounts
      : CREATION_CHOICES.roundQuestionCounts;
  const when2 = (ms: number) => haitiDate(ms)[ht ? 1 : 0];

  return (
    <ArenaPanel style={{ gap: 18 }}>
      <Choices
        label={t('Type de tournoi', 'Kalite tounwa')}
        value={mode}
        onChange={(v) => {
          pending.current = null;
          setMode(v);
        }}
        options={[
          { v: 'quick', label: t('Rapide', 'Rapid') },
          { v: 'custom', label: t('Personnaliser', 'Pèsonalize') },
        ]}
      />

      <View style={{ gap: 8 }}>
        <Text style={[arenaType.label, { color: C.inkSoft }]}>
          {t('Nom du tournoi', 'Non tounwa a')}
        </Text>
        <TextInput
          accessibilityLabel={t('Nom du tournoi', 'Non tounwa a')}
          placeholder={t('Ex. Défi des NS3 du vendredi', 'Egz. Defi NS3 vandredi')}
          placeholderTextColor={C.muted}
          value={draft.title}
          onChangeText={(title) => edit({ title })}
          maxLength={LIMITS.titleMax}
          style={arenaInputStyle}
        />
        <FieldError text={errorFor('title')} />
      </View>

      <Choices
        stacked
        label={t('Format', 'Fòma')}
        value={draft.format}
        onChange={(format) =>
          edit({
            format,
            // Live allows 30 questions, the other formats 20.
            questionCount:
              format !== 'live' && draft.questionCount > LIMITS.roundQuestions.max
                ? LIMITS.roundQuestions.max
                : draft.questionCount,
          })
        }
        options={FORMATS.map((f) => ({ v: f.v, label: formatLabel(f.v, ht) }))}
      />
      <Text style={[arenaType.status, { color: C.muted }]}>
        {FORMATS.find((f) => f.v === draft.format)?.blurb}
      </Text>

      {mode === 'quick' ? (
        <Text style={[arenaType.body, { color: C.inkSoft }]}>
          {t(
            'Public · chacun pour soi · début dans 10 minutes · 10 questions de 20 secondes · fenêtre ou manches de 24 h. Pour une salle privée avec PIN, des équipes ou une date précise : Personnaliser.',
            'Piblik · chak moun pou tèt li · kòmanse nan 10 minit · 10 kesyon 20 segonn · fenèt oswa manch 24 è. Pou yon sal prive ak PIN, ekip oswa yon dat egzat : Pèsonalize.',
          )}
        </Text>
      ) : (
        <>
          <View style={{ gap: 8 }}>
            <Text style={[arenaType.label, { color: C.inkSoft }]}>
              {t('Message aux joueurs (facultatif)', 'Mesaj pou jwè yo (si ou vle)')}
            </Text>
            <TextInput
              accessibilityLabel={t('Message aux joueurs (facultatif)', 'Mesaj pou jwè yo (si ou vle)')}
              value={draft.description}
              onChangeText={(description) => edit({ description })}
              maxLength={LIMITS.descriptionMax}
              multiline
              style={[arenaInputStyle, { minHeight: 88, textAlignVertical: 'top' }]}
            />
          </View>

          <Section title={t('Questions', 'Kesyon')}>
            <Text style={[arenaType.label, { color: C.inkSoft }]}>
              {t('Catégories', 'Kategori')}
            </Text>
            <Text style={[arenaType.status, { color: C.muted }]}>
              {t(
                'Les questions sont tirées au hasard dans ces banques, à parts égales.',
                'Kesyon yo tire o aza nan bank sa yo, an pati egal.',
              )}
            </Text>
            <View
              accessibilityLabel={t('Catégories', 'Kategori')}
              style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
            >
              {TRIVIA_CATEGORIES.map((c) => {
                const on = draft.categories.includes(c.id);
                return (
                  <ArenaButton
                    key={c.id}
                    variant={on ? 'primary' : 'secondary'}
                    selected={on}
                    label={ht ? c.nameHt : c.name}
                    onPress={() =>
                      edit({
                        categories: on
                          ? draft.categories.filter((x) => x !== c.id)
                          : [...draft.categories, c.id],
                      })
                    }
                  />
                );
              })}
            </View>
            <FieldError text={errorFor('categories')} />
            <Choices
              label={
                draft.format === 'live'
                  ? t('Nombre de questions', 'Kantite kesyon')
                  : t('Questions par manche', 'Kesyon pa manch')
              }
              value={draft.questionCount}
              onChange={(questionCount) => edit({ questionCount })}
              options={counts.map((n) => ({ v: n as number, label: String(n) }))}
            />
            <Choices
              label={t('Temps par question', 'Tan pa kesyon')}
              value={draft.secondsPerQuestion}
              onChange={(secondsPerQuestion) => edit({ secondsPerQuestion })}
              options={SECONDS_PER_QUESTION.map((s) => ({ v: s as number, label: `${s} s` }))}
            />
          </Section>

          <Section title={t('Calendrier', 'Orè')}>
            <Text style={[arenaType.label, { color: C.inkSoft }]}>
              {draft.format === 'live'
                ? t('Début du direct', 'Kòmansman an dirèk la')
                : t('Ouverture', 'Ouvèti')}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              <TextInput
                accessibilityLabel={t('Date de début (année-mois-jour)', 'Dat kòmansman (ane-mwa-jou)')}
                placeholder="AAAA-MM-JJ"
                placeholderTextColor={C.muted}
                keyboardType="numbers-and-punctuation"
                maxLength={10}
                value={when.date}
                onChangeText={(date) => editWhen({ date })}
                style={[arenaInputStyle, { flexGrow: 3, minWidth: 140 }]}
              />
              <TextInput
                accessibilityLabel={t('Heure de début (heures:minutes)', 'Lè kòmansman (èdtan:minit)')}
                placeholder="HH:MM"
                placeholderTextColor={C.muted}
                keyboardType="numbers-and-punctuation"
                maxLength={5}
                value={when.time}
                onChangeText={(time) => editWhen({ time })}
                style={[arenaInputStyle, { flexGrow: 2, minWidth: 96 }]}
              />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <ArenaButton
                variant="secondary"
                label={t('Dans 20 min', 'Nan 20 minit')}
                onPress={() => editWhen(localDateParts(defaultStartAt(now())))}
              />
              <ArenaButton
                variant="secondary"
                label={t('Demain 18 h', 'Demen 6 è aswè')}
                onPress={() => {
                  const d = new Date(now());
                  d.setDate(d.getDate() + 1);
                  d.setHours(18, 0, 0, 0);
                  editWhen(localDateParts(d.getTime()));
                }}
              />
            </View>
            <Text style={[arenaType.status, { color: C.muted }]}>
              {t('Date et heure locales de votre appareil.', 'Dat ak lè lokal aparèy ou.')}
            </Text>
            <FieldError text={errorFor('startsAt')} />
            {draft.format === 'window' ? (
              <Choices
                label={t('Durée', 'Dire')}
                value={draft.windowHours}
                onChange={(windowHours) => edit({ windowHours })}
                options={CREATION_CHOICES.windowHours.map((h) => ({ v: h as number, label: hours(h) }))}
              />
            ) : null}
            {draft.format === 'rounds' ? (
              <>
                <Choices
                  label={t('Nombre de manches', 'Kantite manch')}
                  value={draft.roundCount}
                  onChange={(roundCount) => edit({ roundCount })}
                  options={CREATION_CHOICES.roundCounts.map((n) => ({ v: n as number, label: String(n) }))}
                />
                <Choices
                  label={t('Durée de chaque manche', 'Dire chak manch')}
                  value={draft.roundHours}
                  onChange={(roundHours) => edit({ roundHours })}
                  options={CREATION_CHOICES.roundHours.map((h) => ({ v: h as number, label: hours(h) }))}
                />
              </>
            ) : null}
            {draft.format === 'bracket' ? (
              <>
                <Choices
                  label={t('Durée de chaque tour', 'Dire chak tou')}
                  value={Math.min(draft.roundHours, LIMITS.bracketRoundHours.max)}
                  onChange={(roundHours) => edit({ roundHours })}
                  options={CREATION_CHOICES.bracketRoundHours.map((h) => ({ v: h as number, label: hours(h) }))}
                />
                <Choices
                  label={t('Joueurs maximum', 'Maksimòm jwè')}
                  value={draft.maxPlayers}
                  onChange={(maxPlayers) => edit({ maxPlayers })}
                  options={CREATION_CHOICES.bracketPlayers.map((n) => ({ v: n as number, label: String(n) }))}
                />
                <Text style={[arenaType.status, { color: C.muted }]}>
                  {t(
                    'Le tableau est tiré à l’ouverture, par ordre d’inscription ; les premiers inscrits reçoivent les exemptions.',
                    'Tablo a tire lè l louvri, dapre lòd enskripsyon ; premye enskri yo jwenn egzanpsyon yo.',
                  )}
                </Text>
              </>
            ) : null}
            {schedule ? (
              <View
                style={{
                  gap: 6,
                  padding: 12,
                  borderRadius: arenaRadius.tile,
                  backgroundColor: C.surfaceRaised,
                }}
              >
                <Text style={[arenaType.label, { color: C.inkSoft }]}>
                  {t('Calendrier généré (heure d’Haïti)', 'Orè nou jenere a (lè Ayiti)')}
                </Text>
                {(draft.format === 'live'
                  ? [
                      [t('Début', 'Kòmansman'), when2(schedule.startsAt)],
                      [t('Fin (environ)', 'Fen (apeprè)'), when2(schedule.endsAt)],
                    ]
                  : schedule.rounds.slice(0, 10).map((r) => [
                      draft.format === 'window'
                        ? t('Fenêtre', 'Fenèt')
                        : draft.format === 'bracket'
                          ? t(`Tour ${r.index + 1} (max.)`, `Tou ${r.index + 1} (maks.)`)
                          : t(`Manche ${r.index + 1}`, `Manch ${r.index + 1}`),
                      `${when2(r.opensAt)} → ${when2(r.closesAt)}`,
                    ])
                ).map(([name, value]) => (
                  <Text key={name} style={[arenaType.status, { color: C.ink }]}>
                    {name} : {value}
                  </Text>
                ))}
              </View>
            ) : null}
          </Section>

          <Section title={t('Joueurs', 'Jwè')}>
            {draft.format !== 'bracket' ? (
              <>
                <Choices<TeamRule>
                  stacked
                  label={t('Qui affronte qui ?', 'Kiyès kont kiyès ?')}
                  value={draft.teamRule}
                  onChange={(teamRule) => edit({ teamRule })}
                  options={[
                    { v: 'solo', label: t('Chacun pour soi', 'Chak moun pou tèt li') },
                    { v: 'school', label: t('École contre école', 'Lekòl kont lekòl') },
                    { v: 'grade', label: t('Classe contre classe', 'Klas kont klas') },
                  ]}
                />
                {draft.teamRule !== 'solo' ? (
                  <>
                    <Text style={[arenaType.status, { color: C.muted }]}>
                      {t(
                        'Comme à l’Arène : chaque équipe compte ses meilleurs joueurs, pas le nombre d’inscrits.',
                        'Tankou nan Arèn nan : chak ekip konte pi bon jwè li yo, pa kantite enskri.',
                      )}
                    </Text>
                    <Choices
                      label={t('Joueurs comptés', 'Jwè ki konte')}
                      value={draft.teamSize}
                      onChange={(teamSize) => edit({ teamSize })}
                      options={CREATION_CHOICES.teamSizes.map((n) => ({
                        v: n as number,
                        label: t(`${n} meilleurs`, `${n} pi bon`),
                      }))}
                    />
                  </>
                ) : null}
              </>
            ) : null}
            <Choices<Visibility>
              stacked
              label={t('Visibilité', 'Vizibilite')}
              value={draft.visibility}
              onChange={(visibility) => edit({ visibility })}
              options={VISIBILITY.map((o) => ({ v: o.v, label: o.name }))}
            />
            <Text style={[arenaType.status, { color: C.muted }]}>
              {VISIBILITY.find((o) => o.v === draft.visibility)?.blurb}
            </Text>
            <Choices
              label={t('Et toi ?', 'E ou menm ?')}
              value={draft.creatorPlays ? 'play' : 'host'}
              onChange={(v) => edit({ creatorPlays: v === 'play' })}
              options={[
                { v: 'play', label: t('Je joue aussi', 'M ap jwe tou') },
                { v: 'host', label: t('J’organise seulement', 'M ap òganize sèlman') },
              ]}
            />
            <Text style={[arenaType.status, { color: C.muted }]}>
              {t(
                'Même l’organisateur ne voit pas les réponses : les questions sont tirées par le serveur.',
                'Menm òganizatè a pa wè repons yo : sèvè a ki tire kesyon yo.',
              )}
            </Text>
          </Section>
        </>
      )}

      {tried && bad.size > 0 ? (
        <FieldError text={t('Vérifiez les champs signalés.', 'Verifye chan ki make yo.')} />
      ) : null}
      <ArenaButton
        label={busy ? t('Création…', 'Ap kreye…') : t('Créer le tournoi', 'Kreye tounwa a')}
        busy={busy}
        onPress={() => {
          void submit();
        }}
      />
    </ArenaPanel>
  );
}

/** After creating a private or unlisted room: the PIN, big, with copy/share. */
export function TournoisPinCard({
  tid,
  pin,
  title,
  visibility,
  ht,
}: {
  tid: string;
  pin: string;
  title: string;
  visibility: Visibility;
  ht: boolean;
}) {
  const t: T = (fr, creole) => (ht ? creole : fr);
  const link = shareUrl({ id: tid, pin, visibility });
  const spoken = pin.split('').join(' ');
  return (
    <ArenaPanel style={{ gap: 12 }}>
      <Text accessibilityRole="header" style={[arenaType.title, { color: C.ink }]}>
        {visibility === 'private'
          ? t('Salle privée créée', 'Sal prive a kreye')
          : t('Tournoi non listé créé', 'Tounwa ki pa nan lis la kreye')}
      </Text>
      <Text style={[arenaType.label, { color: C.inkSoft }]}>
        {t('PIN du tournoi', 'PIN tounwa a')}
      </Text>
      <Text
        selectable
        testID="tournament-pin"
        accessibilityLabel={`PIN ${spoken}`}
        maxFontSizeMultiplier={1.3}
        style={[arenaType.score, { color: C.gold, textAlign: 'center' }]}
      >
        {formatPin(pin)}
      </Text>
      <Text style={[arenaType.body, { color: C.inkSoft }]}>
        {t(
          'Donne ce PIN à tes élèves : dans Tournois, ils touchent « Rejoindre avec un PIN ». Appui long sur le PIN ou le lien pour copier.',
          'Bay elèv ou yo PIN sa a : nan Tounwa, yo peze « Antre ak yon PIN ». Peze lontan sou PIN nan oswa lyen an pou kopye.',
        )}
      </Text>
      <Text selectable style={[arenaType.status, { color: C.signal }]}>
        {link}
      </Text>
      <ArenaButton
        label={t('Copier ou partager le PIN', 'Kopye oswa pataje PIN nan')}
        accessibilityHint={t(
          'Ouvre le menu de partage, qui permet aussi de copier.',
          'Louvri meni pataj la, ki pèmèt kopye tou.',
        )}
        onPress={() => {
          void Share.share({ message: pin });
        }}
      />
      <ArenaButton
        variant="secondary"
        label={t('Partager le lien d’invitation', 'Pataje lyen envitasyon an')}
        onPress={() => {
          void Share.share({
            message: t(
              `Rejoins mon tournoi « ${title} » avec le PIN ${formatPin(pin)} : ${link}`,
              `Vin jwe nan tounwa mwen "${title}" ak PIN ${formatPin(pin)} : ${link}`,
            ),
          });
        }}
      />
    </ArenaPanel>
  );
}
