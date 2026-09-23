/**
 * /tournois/nouveau — the creation wizard.
 *
 * Four short steps: the shape, the questions, the calendar, who plays and who
 * watches. The student picks CATEGORIES and counts, never questions — the
 * server draws them and keeps the keys (so the creator can play fair). The
 * calendar preview is computed with the same `buildSchedule` the server runs,
 * so what the wizard shows is what the server will store.
 */
import CategoryIcon from '../../components/CategoryIcon';
import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CalendarDays, Layers, Radio, Swords, Sparkles } from '../../components/icons';
import useStore from '../../contexts/store';
import { useTrivia } from '../../hooks/useTrivia';
import { TRIVIA_CATEGORIES } from '../../data/triviaData';
import {
  LIMITS,
  SECONDS_PER_QUESTION,
  validateTournamentInput,
  type TeamRule,
  type TournamentFormat,
  type Visibility,
} from '../../../shared/tournois/config';
import { buildSchedule } from '../../../shared/tournois/schedule';
import { createTournament, errorMessage } from '../../services/tournoisService';
import { formatWhen, useLang } from './parts';
import './Tournois.css';

const ALLOWED = TRIVIA_CATEGORIES.map((c) => c.id);

function defaultStart(): string {
  const d = new Date(Date.now() + 20 * 60_000);
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type Opt = string | number;

function Toggles({ value, options, onChange, label }: {
  value: Opt; options: Array<{ v: Opt; label: string }>; label: string;
  // The option list is the type guard: onChange only ever receives one of its `v`s.
  onChange: (v: any) => void;
}) {
  return (
    <div className="tn-toggles" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.v)} type="button" className="tn-toggle" aria-pressed={value === o.v} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function TournoisCreate() {
  const { t, isCreole } = useLang();
  const navigate = useNavigate();
  const user = useStore((s) => s.user);
  const storedGrade = useStore((s) => s.grade);
  const toggleAuthModal = useStore((s) => s.toggleAuthModal);
  const { profile } = useTrivia();

  const [step, setStep] = useState(0);
  const [format, setFormat] = useState<TournamentFormat>('live');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categories, setCategories] = useState<string[]>(['maths_eclair', 'sciences']);
  const [questionCount, setQuestionCount] = useState(10);
  const [secondsPerQuestion, setSeconds] = useState(15);
  const [start, setStart] = useState(defaultStart);
  const [windowHours, setWindowHours] = useState(24);
  const [roundCount, setRoundCount] = useState(5);
  const [roundHours, setRoundHours] = useState(24);
  const [maxPlayers, setMaxPlayers] = useState(16);
  const [teamRule, setTeamRule] = useState<TeamRule>('solo');
  const [teamSize, setTeamSize] = useState(5);
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [creatorPlays, setCreatorPlays] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const input = useMemo(() => ({
    title, description, format, teamRule: format === 'bracket' ? 'solo' : teamRule, teamSize, visibility, categories,
    questionCount, secondsPerQuestion, startsAt: new Date(start).getTime(),
    windowHours, roundCount, roundHours: format === 'bracket' ? Math.min(roundHours, LIMITS.bracketRoundHours.max) : roundHours,
    maxPlayers: format === 'bracket' ? maxPlayers : undefined, creatorPlays,
  }), [title, description, format, teamRule, teamSize, visibility, categories, questionCount, secondsPerQuestion, start, windowHours, roundCount, roundHours, maxPlayers, creatorPlays]);

  const check = useMemo(() => validateTournamentInput(input, Date.now(), ALLOWED), [input]);
  const bad = new Set(check.ok === false ? check.errors : []);
  const schedule = check.ok === true ? buildSchedule(check.config) : null;

  const STEP_FIELDS: string[][] = [
    ['title', 'format'],
    ['categories', 'questionCount', 'secondsPerQuestion'],
    ['startsAt', 'windowHours', 'roundCount', 'roundHours', 'maxPlayers'],
    ['visibility'],
  ];
  const stepOk = STEP_FIELDS[step].every((f) => !bad.has(f));

  if (!user?.uid) {
    return (
      <section className="tn">
        <div className="tn__narrow tn-card" style={{ textAlign: 'center' }}>
          <h1 style={{ marginTop: 0 }}>{t('Créer un tournoi', 'Kreye yon tounwa')}</h1>
          <p className="tn-muted">{t('Connecte-toi pour créer un tournoi — il est lié à ton compte.', 'Konekte pou w kreye yon tounwa — li mare ak kont ou.')}</p>
          <button type="button" className="button button--primary" onClick={toggleAuthModal}>{t('Se connecter', 'Konekte')}</button>
        </div>
      </section>
    );
  }

  const submit = async () => {
    if (check.ok !== true) return;
    setBusy(true);
    setError(null);
    const res = await createTournament({
      ...input,
      displayName: profile?.leaderboard?.displayName || undefined,
      school: profile?.leaderboard?.school || undefined,
      grade: storedGrade || undefined,
    });
    setBusy(false);
    if (res.ok && res.data?.tid) navigate(`/tournois/${res.data.tid}?nouveau=1`);
    else setError(errorMessage(res.error, isCreole));
  };

  const FORMATS: Array<{ v: TournamentFormat; icon: React.ReactNode; name: string; blurb: string }> = [
    { v: 'live', icon: <Radio size={18} />, name: t('En direct', 'An dirèk'), blurb: t('Tout le monde en même temps, à l’heure fixée. Une question à l’écran, podium entre chaque.', 'Tout moun an menm tan, a lè ou fikse a. Yon kesyon sou ekran, podyòm apre chak.') },
    { v: 'window', icon: <CalendarDays size={18} />, name: t('Fenêtre ouverte', 'Fenèt louvri'), blurb: t('Ouvert d’une heure à deux semaines. Chacun joue une manche chronométrée quand il veut.', 'Louvri yon èdtan rive de semèn. Chak moun jwe yon manch kwonometre lè li vle.') },
    { v: 'rounds', icon: <Layers size={18} />, name: t('Manches', 'Manch'), blurb: t('Plusieurs manches à la suite (ex. une par jour). Les points s’additionnent.', 'Plizyè manch youn apre lòt (egz. youn pa jou). Pwen yo adisyone.') },
    { v: 'bracket', icon: <Swords size={18} />, name: t('Élimination directe', 'Eliminasyon dirèk'), blurb: t('Duels en tableau : le meilleur score de chaque match passe au tour suivant.', 'Dyèl nan tablo : pi bon nòt chak match pase nan pwochen tou a.') },
  ];

  const qOptions = (format === 'live' ? [5, 10, 15, 20, 30] : [5, 10, 15, 20]).map((n) => ({ v: n, label: String(n) }));

  return (
    <section className="tn">
      <div className="tn__narrow">
        <Link to="/tournois" className="tn-muted" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <ArrowLeft size={15} aria-hidden="true" /> {t('Tournois', 'Tounwa')}
        </Link>
        <h1 style={{ margin: '0.6rem 0 0', letterSpacing: '-0.03em' }}>{t('Nouveau tournoi', 'Nouvo tounwa')}</h1>
        <div className="tn-steps" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => <span key={i} className={i <= step ? 'is-on' : ''} />)}
        </div>

        <div className="tn-card">
          {step === 0 && (
            <>
              <div className={`tn-field${bad.has('title') && title ? ' is-bad' : ''}`}>
                <label htmlFor="tn-title">{t('Nom du tournoi', 'Non tounwa a')}</label>
                <input id="tn-title" type="text" maxLength={LIMITS.titleMax} value={title} onChange={(e) => setTitle(e.target.value)}
                  placeholder={t('Ex. Défi des NS3 du vendredi', 'Egz. Defi NS3 vandredi')} />
              </div>
              <div className="tn-field">
                <label htmlFor="tn-desc">{t('Message aux joueurs (facultatif)', 'Mesaj pou jwè yo (si ou vle)')}</label>
                <textarea id="tn-desc" maxLength={LIMITS.descriptionMax} value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div className="tn-field">
                <span className="tn-field__label">{t('Format', 'Fòma')}</span>
                <div className="tn-choices">
                  {FORMATS.map((f) => (
                    <button key={f.v} type="button" className="tn-choice" aria-pressed={format === f.v} onClick={() => setFormat(f.v)}>
                      <span className="tn-choice__icon" aria-hidden="true">{f.icon}</span>
                      <strong>{f.name}</strong>
                      <small>{f.blurb}</small>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className={`tn-field${bad.has('categories') ? ' is-bad' : ''}`}>
                <span className="tn-field__label">{t('Catégories', 'Kategori')}</span>
                <span className="tn-field__hint">{t('Les questions sont tirées au hasard dans ces banques, à parts égales.', 'Kesyon yo tire o aza nan bank sa yo, an pati egal.')}</span>
                <div className="tn-toggles" role="group" aria-label={t('Catégories', 'Kategori')}>
                  {TRIVIA_CATEGORIES.map((c) => {
                    const on = categories.includes(c.id);
                    return (
                      <button key={c.id} type="button" className="tn-toggle" aria-pressed={on}
                        onClick={() => setCategories((cs) => (on ? cs.filter((x) => x !== c.id) : [...cs, c.id]))}>
                        <CategoryIcon id={c.id} size={16} /> {isCreole ? c.nameHt : c.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="tn-field">
                <span className="tn-field__label">{format === 'live' ? t('Nombre de questions', 'Kantite kesyon') : t('Questions par manche', 'Kesyon pa manch')}</span>
                <Toggles value={questionCount} options={qOptions} onChange={setQuestionCount} label={t('Nombre de questions', 'Kantite kesyon')} />
              </div>
              <div className="tn-field">
                <span className="tn-field__label">{t('Temps par question', 'Tan pa kesyon')}</span>
                <Toggles value={secondsPerQuestion} options={SECONDS_PER_QUESTION.map((s) => ({ v: s as number, label: `${s} s` }))} onChange={setSeconds} label={t('Temps par question', 'Tan pa kesyon')} />
                <span className="tn-field__hint">{t('Réponse juste dans la première moitié du temps : 1000 pts ; ensuite : 500.', 'Bon repons nan premye mwatye tan an : 1000 pwen ; apre : 500.')}</span>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className={`tn-field${bad.has('startsAt') ? ' is-bad' : ''}`}>
                <label htmlFor="tn-start">{format === 'live' ? t('Début du direct', 'Kòmansman an dirèk la') : t('Ouverture', 'Ouvèti')}</label>
                <input id="tn-start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
                {bad.has('startsAt') && <span className="tn-error">{t('Au moins 2 minutes à l’avance, au plus 60 jours.', 'Omwen 2 minit davans, pa plis pase 60 jou.')}</span>}
              </div>
              {format === 'window' && (
                <div className="tn-field">
                  <span className="tn-field__label">{t('Durée', 'Dire')}</span>
                  <Toggles value={windowHours} onChange={setWindowHours} label={t('Durée', 'Dire')} options={[
                    { v: 3, label: t('3 heures', '3 èdtan') }, { v: 24, label: t('1 jour', '1 jou') }, { v: 72, label: t('3 jours', '3 jou') },
                    { v: 168, label: t('1 semaine', '1 semèn') }, { v: 336, label: t('2 semaines', '2 semèn') },
                  ]} />
                </div>
              )}
              {format === 'rounds' && (
                <>
                  <div className="tn-field">
                    <span className="tn-field__label">{t('Nombre de manches', 'Kantite manch')}</span>
                    <Toggles value={roundCount} onChange={setRoundCount} label={t('Nombre de manches', 'Kantite manch')}
                      options={[2, 3, 5, 7, 10].map((n) => ({ v: n, label: String(n) }))} />
                  </div>
                  <div className="tn-field">
                    <span className="tn-field__label">{t('Durée de chaque manche', 'Dire chak manch')}</span>
                    <Toggles value={roundHours} onChange={setRoundHours} label={t('Durée de chaque manche', 'Dire chak manch')} options={[
                      { v: 1, label: t('1 heure', '1 èdtan') }, { v: 24, label: t('1 jour', '1 jou') }, { v: 48, label: t('2 jours', '2 jou') }, { v: 168, label: t('1 semaine', '1 semèn') },
                    ]} />
                  </div>
                </>
              )}
              {format === 'bracket' && (
                <>
                  <div className="tn-field">
                    <span className="tn-field__label">{t('Durée de chaque tour', 'Dire chak tou')}</span>
                    <Toggles value={Math.min(roundHours, 72)} onChange={setRoundHours} label={t('Durée de chaque tour', 'Dire chak tou')} options={[
                      { v: 1, label: t('1 heure', '1 èdtan') }, { v: 6, label: t('6 heures', '6 èdtan') }, { v: 24, label: t('1 jour', '1 jou') }, { v: 48, label: t('2 jours', '2 jou') },
                    ]} />
                  </div>
                  <div className="tn-field">
                    <span className="tn-field__label">{t('Joueurs maximum', 'Maksimòm jwè')}</span>
                    <Toggles value={maxPlayers} onChange={setMaxPlayers} label={t('Joueurs maximum', 'Maksimòm jwè')}
                      options={[4, 8, 16, 32, 64].map((n) => ({ v: n, label: String(n) }))} />
                    <span className="tn-field__hint">{t('Le tableau est tiré à l’ouverture, par ordre d’inscription ; les premiers inscrits reçoivent les exemptions.', 'Tablo a tire lè l louvri, dapre lòd enskripsyon ; premye enskri yo jwenn egzanpsyon yo.')}</span>
                  </div>
                </>
              )}
              {schedule && (
                <div className="tn-field">
                  <span className="tn-field__label">{t('Calendrier généré', 'Orè nou jenere a')}</span>
                  <ul className="tn-timeline">
                    {format === 'live' ? (
                      <>
                        <li><span>{t('Début', 'Kòmansman')}</span><span>{formatWhen(schedule.startsAt, isCreole)}</span></li>
                        <li><span>{t('Fin (environ)', 'Fen (apeprè)')}</span><span>{formatWhen(schedule.endsAt, isCreole)}</span></li>
                      </>
                    ) : schedule.rounds.slice(0, 10).map((r) => (
                      <li key={r.index}>
                        <span>{format === 'window' ? t('Fenêtre', 'Fenèt') : format === 'bracket' ? t(`Tour ${r.index + 1} (max.)`, `Tou ${r.index + 1} (maks.)`) : t(`Manche ${r.index + 1}`, `Manch ${r.index + 1}`)}</span>
                        <span>{formatWhen(r.opensAt, isCreole)} → {formatWhen(r.closesAt, isCreole)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {step === 3 && (
            <>
              {format !== 'bracket' && (
                <div className="tn-field">
                  <span className="tn-field__label">{t('Qui affronte qui ?', 'Kiyès kont kiyès ?')}</span>
                  <Toggles value={teamRule} onChange={setTeamRule} label={t('Équipes', 'Ekip')} options={[
                    { v: 'solo', label: t('Chacun pour soi', 'Chak moun pou tèt li') },
                    { v: 'school', label: t('École contre école', 'Lekòl kont lekòl') },
                    { v: 'grade', label: t('Classe contre classe', 'Klas kont klas') },
                  ]} />
                  {teamRule !== 'solo' && (
                    <>
                      <span className="tn-field__hint">{t('Comme à l’Arène : chaque équipe compte ses meilleurs joueurs, pas le nombre d’inscrits.', 'Tankou nan Arèn nan : chak ekip konte pi bon jwè li yo, pa kantite enskri.')}</span>
                      <Toggles value={teamSize} onChange={setTeamSize} label={t('Joueurs comptés', 'Jwè ki konte')}
                        options={[3, 5].map((n) => ({ v: n, label: t(`${n} meilleurs`, `${n} pi bon`) }))} />
                    </>
                  )}
                </div>
              )}
              <div className="tn-field">
                <span className="tn-field__label">{t('Visibilité', 'Vizibilite')}</span>
                <div className="tn-choices">
                  {([
                    ['public', t('Public', 'Piblik'), t('Listé sur /tournois. Tout le monde peut regarder en direct.', 'Parèt sou /tounwa. Tout moun ka gade an dirèk.')],
                    ['unlisted', t('Non listé', 'Pa nan lis'), t('Seuls ceux qui ont le lien ou le PIN peuvent regarder et jouer.', 'Se sèlman moun ki gen lyen an oswa PIN nan ki ka gade epi jwe.')],
                    ['private', t('Privé', 'Prive'), t('Seuls les joueurs entrés avec le PIN voient le tournoi.', 'Se sèlman jwè ki antre ak PIN nan ki wè tounwa a.')],
                  ] as Array<[Visibility, string, string]>).map(([v, name, blurb]) => (
                    <button key={v} type="button" className="tn-choice" aria-pressed={visibility === v} onClick={() => setVisibility(v)}>
                      <strong>{name}</strong>
                      <small>{blurb}</small>
                    </button>
                  ))}
                </div>
              </div>
              <div className="tn-field">
                <span className="tn-field__label">{t('Et toi ?', 'E ou menm ?')}</span>
                <Toggles value={creatorPlays ? 'play' : 'host'} onChange={(v) => setCreatorPlays(v === 'play')} label={t('Rôle', 'Wòl')} options={[
                  { v: 'play', label: t('Je joue aussi', 'M ap jwe tou') },
                  { v: 'host', label: t('J’organise seulement', 'M ap òganize sèlman') },
                ]} />
                <span className="tn-field__hint">{t('Même l’organisateur ne voit pas les réponses : les questions sont tirées par le serveur.', 'Menm òganizatè a pa wè repons yo : sèvè a ki tire kesyon yo.')}</span>
              </div>
            </>
          )}

          {error && <p className="tn-error" role="alert">{error}</p>}

          <div className="tn-wizard__nav">
            {step > 0 ? (
              <button type="button" className="button button--ghost" onClick={() => setStep((s) => s - 1)}>
                <ArrowLeft size={16} aria-hidden="true" /> {t('Retour', 'Retounen')}
              </button>
            ) : <span />}
            {step < 3 ? (
              <button type="button" className="button button--primary" disabled={!stepOk} onClick={() => setStep((s) => s + 1)}>
                {t('Suivant', 'Swivan')} <ArrowRight size={16} aria-hidden="true" />
              </button>
            ) : (
              <button type="button" className="button button--primary" disabled={check.ok !== true || busy} onClick={submit}>
                <Sparkles size={16} aria-hidden="true" /> {busy ? t('Création…', 'Ap kreye…') : t('Créer le tournoi', 'Kreye tounwa a')}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
