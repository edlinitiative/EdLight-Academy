/**
 * Leaderboard — weekly XP competition
 * ───────────────────────────────────
 * Privacy-first: learners are only listed if they opt in, and aliases default
 * to a first-name + initial (never the full account name). Scope can be filtered
 * to the learner's school. Degrades gracefully when empty/offline.
 *
 * Variants:
 *   • 'compact' — top 5 + the viewer's rank (dashboard widget)
 *   • 'full'    — top 25, scope tabs, and opt-in management (profile)
 */

import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Crown, Medal, Flame, ChevronRight, ChevronDown, ShieldCheck, Pencil } from 'lucide-react';
import useStore from '../contexts/store';
import { useLeaderboard, useCollectives } from '../hooks/useLeaderboard';
import { useTrivia } from '../hooks/useTrivia';
import { isValidAlias } from '../services/leaderboardService';
import { HAITI_DEPARTMENTS, OTHER_CITY, citiesOf, findCity } from '../data/haitiGeo';
import { aggregateBy, normalizeName } from '../../shared/leaderboardAgg';
import './Leaderboard.css';

// First name only — the board is publicly readable, so never expose any part
// of the last name (not even an initial). Empty when the account has no name:
// we never invent a pseudo, the learner is asked to pick one.
function defaultAlias(user) {
  const name = user?.name || user?.displayName || '';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return parts[0] || '';
}

// Anonymized example ranking shown when the board is still empty so the feature
// never looks dead. Always clearly labelled as an example — never blended with
// real entries.
const SAMPLE_LEADERBOARD = [
  { rank: 1, displayName: 'Marie', level: 7, xp: 1240 },
  { rank: 2, displayName: 'Jean', level: 6, xp: 1080 },
  { rank: 3, displayName: 'Naïka', level: 5, xp: 920 },
  { rank: 4, displayName: 'Samuel', level: 4, xp: 760 },
  { rank: 5, displayName: 'Wideline', level: 4, xp: 640 },
];

function RankBadge({ rank }) {
  if (rank === 1) return <span className="lb-rank lb-rank--gold"><Crown size={14} /></span>;
  if (rank === 2) return <span className="lb-rank lb-rank--silver"><Medal size={14} /></span>;
  if (rank === 3) return <span className="lb-rank lb-rank--bronze"><Medal size={14} /></span>;
  return <span className="lb-rank">{rank}</span>;
}

export default function Leaderboard({ variant = 'full', max = 25, periodToggle = false }) {
  const navigate = useNavigate();
  const { user, language } = useStore();
  const isCreole = language === 'ht';
  const t = (fr, ht) => (isCreole ? ht : fr);

  const [period, setPeriod] = useState('week'); // 'week' | 'all'
  const { entries, myEntry, myRank, isLoading, refetch } = useLeaderboard(
    variant === 'compact' ? 5 : max,
    periodToggle ? (period as any) : 'week',
  );
  const { profile, level, setLeaderboardOptIn, isAuthed } = useTrivia();

  const optedIn = !!profile?.leaderboard?.optedIn;
  const mySchool = profile?.leaderboard?.school || null;
  const myCity = profile?.leaderboard?.city || null;
  const myDepartment = profile?.leaderboard?.department || null;
  // Opted in but no usable pseudo (legacy "." etc.) → hidden from the board
  // until they pick one; we surface a prompt instead.
  const needsAlias = optedIn && !isValidAlias(profile?.leaderboard?.displayName);

  const [scope, setScope] = useState('national'); // 'school' | 'city' | 'national'
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [alias, setAlias] = useState(defaultAlias(user));
  const [school, setSchool] = useState(mySchool || '');
  // Ville is picked département → ville so everyone spells it the same way and
  // the Ville ranking actually groups classmates. OTHER_CITY unlocks free text.
  const [department, setDepartment] = useState('');
  const [cityChoice, setCityChoice] = useState('');
  const [customCity, setCustomCity] = useState('');
  const [saving, setSaving] = useState(false);

  const deptCities = citiesOf(department);

  // Seed the form from the (async-loaded) profile every time it opens, so
  // editing always starts from what's currently saved. Legacy free-typed
  // cities are remapped onto the canonical commune when they match one.
  const openForm = () => {
    setAlias(profile?.leaderboard?.displayName || defaultAlias(user));
    setSchool(mySchool || '');
    const savedDept = profile?.leaderboard?.department || '';
    const known = myCity ? findCity(myCity) : null;
    if (known) {
      setDepartment(known.department);
      setCityChoice(known.city);
      setCustomCity('');
    } else {
      setDepartment(savedDept);
      setCityChoice(myCity ? OTHER_CITY : '');
      setCustomCity(myCity || '');
    }
    setShowForm(true);
  };

  const pickDepartment = (name) => {
    setDepartment(name);
    // Diaspora has no commune list → jump straight to the free-text field.
    setCityChoice(name && citiesOf(name).length === 0 ? OTHER_CITY : '');
    setCustomCity('');
  };

  // École / Ville are collective boards: schools (or cities) ranked against
  // each other by their members' total XP. National stays an individual board.
  const collectiveField: 'school' | 'city' | 'department' | null =
    scope === 'school' ? 'school' : scope === 'city' ? 'city' : scope === 'department' ? 'department' : null;

  const collectivePeriod = periodToggle ? (period as 'week' | 'all') : 'week';
  // Exhaustive ranking from the server (counts every learner, not just the
  // fetched top-N). Only queried when a collective tab is open.
  const { groups: serverGroups, isLoading: collLoading } = useCollectives(
    collectiveField || 'school',
    collectivePeriod,
    !!collectiveField,
  );

  // Prefer the exhaustive server ranking; fall back to a local aggregate over
  // the fetched entries if the endpoint is unreachable so the board still works.
  const groups = useMemo(() => {
    if (!collectiveField) return [];
    return serverGroups.length ? serverGroups : aggregateBy(entries, collectiveField, 50);
  }, [collectiveField, serverGroups, entries]);

  // The normalized key of the viewer's own school/city, so we can highlight
  // their collective in the ranking (null when they haven't set one).
  const myGroupKey = useMemo(() => {
    if (!collectiveField) return null;
    const mine = collectiveField === 'school' ? mySchool : collectiveField === 'city' ? myCity : myDepartment;
    return mine ? normalizeName(mine) : null;
  }, [collectiveField, mySchool, myCity, myDepartment]);

  const changeScope = (next: string) => {
    setScope(next);
    setExpandedKey(null); // collapse any open drill-down when switching boards
  };

  const aliasOk = isValidAlias(alias.trim());

  const save = async () => {
    if (!aliasOk) return; // Confirmer is disabled, but belt-and-braces
    setSaving(true);
    try {
      const city = cityChoice === OTHER_CITY ? customCity.trim() : cityChoice;
      await setLeaderboardOptIn({
        optedIn: true,
        displayName: alias.trim().slice(0, 24),
        school: school.trim() || null,
        city: city || null,
        department: department || null,
      });
      setShowForm(false);
      refetch(); // so the École/Ville tabs reflect the new info right away
    } finally {
      setSaving(false);
    }
  };

  const compact = variant === 'compact';

  return (
    <div className={`leaderboard ${compact ? 'leaderboard--compact' : ''}`}>
      <div className="leaderboard__header">
        <h3 className="leaderboard__title">
          <Trophy size={17} />{' '}
          {periodToggle && period === 'all'
            ? t('Classement général', 'Klasman jeneral')
            : t('Classement de la semaine', 'Klasman semèn nan')}
        </h3>
        {compact && (
          <button className="leaderboard__more" onClick={() => navigate('/profile')}>
            {t('Voir tout', 'Wè tout')} <ChevronRight size={14} />
          </button>
        )}
      </div>

      {periodToggle && (
        <div className="leaderboard__periods" role="tablist">
          <button
            role="tab"
            aria-selected={period === 'week'}
            className={`leaderboard__scope ${period === 'week' ? 'is-active' : ''}`}
            onClick={() => setPeriod('week')}
          >
            {t('Cette semaine', 'Semèn sa a')}
          </button>
          <button
            role="tab"
            aria-selected={period === 'all'}
            className={`leaderboard__scope ${period === 'all' ? 'is-active' : ''}`}
            onClick={() => setPeriod('all')}
          >
            {t('Tous les temps', 'Tout tan')}
          </button>
        </div>
      )}

      {!compact && (
        <div className="leaderboard__scopes" role="tablist">
          <button
            role="tab"
            aria-selected={scope === 'school'}
            className={`leaderboard__scope ${scope === 'school' ? 'is-active' : ''}`}
            onClick={() => changeScope('school')}
          >
            {t('École', 'Lekòl')}
          </button>
          <button
            role="tab"
            aria-selected={scope === 'city'}
            className={`leaderboard__scope ${scope === 'city' ? 'is-active' : ''}`}
            onClick={() => changeScope('city')}
          >
            {t('Ville', 'Vil')}
          </button>
          <button
            role="tab"
            aria-selected={scope === 'department'}
            className={`leaderboard__scope ${scope === 'department' ? 'is-active' : ''}`}
            onClick={() => changeScope('department')}
          >
            {t('Département', 'Depatman')}
          </button>
          <button
            role="tab"
            aria-selected={scope === 'national'}
            className={`leaderboard__scope ${scope === 'national' ? 'is-active' : ''}`}
            onClick={() => changeScope('national')}
          >
            {t('National', 'Nasyonal')}
          </button>
        </div>
      )}

      {isLoading || (collectiveField && collLoading && groups.length === 0) ? (
        <div className="leaderboard__loading">
          {Array.from({ length: compact ? 3 : 5 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 44, borderRadius: 10, marginBottom: 8 }} />
          ))}
        </div>
      ) : collectiveField ? (
        // ── Collective board: schools / cities ranked by total member XP ──
        groups.length > 0 ? (
          <>
            <ol className="leaderboard__list leaderboard__groups">
              {groups.map((g) => {
                const isMine = myGroupKey != null && g.key === myGroupKey;
                const open = expandedKey === g.key;
                const memberWord = g.members === 1 ? t('élève', 'elèv') : t('élèves', 'elèv');
                return (
                  <li key={g.key} className={`leaderboard__group ${isMine ? 'is-me' : ''}`}>
                    <button
                      type="button"
                      className="leaderboard__group-head"
                      aria-expanded={open}
                      onClick={() => setExpandedKey(open ? null : g.key)}
                    >
                      <RankBadge rank={g.rank} />
                      <span className="leaderboard__name">
                        {g.label}
                        {isMine && <span className="leaderboard__you">{t('vous', 'ou')}</span>}
                      </span>
                      <span className="leaderboard__group-meta">
                        {g.members} {memberWord}
                      </span>
                      <span className="leaderboard__xp">
                        <Flame size={12} /> {g.totalXp}
                      </span>
                      <ChevronDown size={15} className={`leaderboard__chevron ${open ? 'is-open' : ''}`} />
                    </button>
                    {open && (
                      <ol className="leaderboard__members">
                        {g.topMembers.map((m, i) => {
                          const isMe = m.uid === user?.uid;
                          return (
                            <li key={m.uid || i} className={`leaderboard__member ${isMe ? 'is-me' : ''}`}>
                              <span className="leaderboard__member-rank">{i + 1}</span>
                              <span className="leaderboard__name">
                                {m.displayName || 'Élève'}
                                {isMe && <span className="leaderboard__you">{t('vous', 'ou')}</span>}
                              </span>
                              <span className="leaderboard__xp">
                                <Flame size={12} /> {m.xp || 0}
                              </span>
                            </li>
                          );
                        })}
                      </ol>
                    )}
                  </li>
                );
              })}
            </ol>
            {/* Not yet in any ranked collective → nudge to add school/city. */}
            {!myGroupKey && isAuthed && !showForm && (
              <button className="leaderboard__edit" onClick={openForm}>
                <Pencil size={13} />
                {scope === 'school'
                  ? t('Ajoutez votre école pour y figurer', 'Ajoute lekòl ou pou parèt ladan l')
                  : scope === 'city'
                  ? t('Ajoutez votre ville pour y figurer', 'Ajoute vil ou pou parèt ladan l')
                  : t('Ajoutez votre département pour y figurer', 'Ajoute depatman ou pou parèt ladan l')}
              </button>
            )}
          </>
        ) : (
          <div className="leaderboard__empty">
            <p className="text-muted">
              {scope === 'school'
                ? t('Aucune école classée pour le moment.', 'Poko gen lekòl klase.')
                : scope === 'city'
                ? t('Aucune ville classée pour le moment.', 'Poko gen vil klase.')
                : t('Aucun département classé pour le moment.', 'Poko gen depatman klase.')}
            </p>
            {isAuthed && !showForm && (
              <button className="button button--primary leaderboard__empty-cta" onClick={openForm}>
                {scope === 'school'
                  ? t('Ajouter mon école', 'Ajoute lekòl mwen')
                  : scope === 'city'
                  ? t('Ajouter ma ville', 'Ajoute vil mwen')
                  : t('Ajouter mon département', 'Ajoute depatman mwen')}
              </button>
            )}
          </div>
        )
      ) : entries.length > 0 ? (
        // ── National board: individual learners ──
        <ol className="leaderboard__list">
          {entries.map((e) => {
            const isMe = e.id === user?.uid;
            return (
              <li key={e.id} className={`leaderboard__row ${isMe ? 'is-me' : ''}`}>
                <RankBadge rank={e.rank} />
                <span className="leaderboard__name">
                  {e.displayName || 'Élève'}
                  {isMe && <span className="leaderboard__you">{t('vous', 'ou')}</span>}
                </span>
                <span className="leaderboard__level" title={t('Niveau', 'Nivo')}>
                  {t('Niv.', 'Niv.')} {e.level || 1}
                </span>
                <span className="leaderboard__xp">
                  <Flame size={12} /> {e.xp || 0}
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="leaderboard__empty leaderboard__empty--sample">
          <ol className="leaderboard__list leaderboard__list--sample" aria-hidden="true">
            {SAMPLE_LEADERBOARD.slice(0, compact ? 3 : 5).map((e) => (
              <li key={e.rank} className="leaderboard__row">
                <RankBadge rank={e.rank} />
                <span className="leaderboard__name">{e.displayName}</span>
                <span className="leaderboard__level">{t('Niv.', 'Niv.')} {e.level}</span>
                <span className="leaderboard__xp"><Flame size={12} /> {e.xp}</span>
              </li>
            ))}
          </ol>
          <p className="leaderboard__sample-note text-muted">
            {t('Exemple — gagnez des XP cette semaine pour apparaître ici.', 'Egzanp — ranmase XP semèn sa a pou parèt isit la.')}
          </p>
        </div>
      )}

      {/* Viewer's own rank line (national board only) when off-slice */}
      {!compact && scope === 'national' && optedIn && myEntry && !entries.some((e) => e.id === user?.uid) && (
        <div className="leaderboard__self">
          <RankBadge rank={myRank} />
          <span className="leaderboard__name">
            {myEntry.displayName} <span className="leaderboard__you">{t('vous', 'ou')}</span>
          </span>
          <span className="leaderboard__xp"><Flame size={12} /> {myEntry.xp || 0}</span>
        </div>
      )}

      {/* Opt-in + profile (alias / school / city) management */}
      {isAuthed && !compact && (
        <div className="leaderboard__join">
          {showForm ? (
            <div className="leaderboard__form">
              <label className="leaderboard__field">
                <span>{t('Pseudo affiché', 'Ti non pou afiche')}</span>
                <input
                  className="input-field"
                  value={alias}
                  maxLength={24}
                  onChange={(e) => setAlias(e.target.value)}
                  placeholder={defaultAlias(user) || t('Votre pseudo', 'Ti non ou')}
                />
                {!aliasOk && (
                  <span className="leaderboard__field-error">
                    {t(
                      'Choisissez un pseudo (au moins une lettre) pour apparaître dans le classement.',
                      'Chwazi yon ti non (omwen yon lèt) pou parèt nan klasman an.',
                    )}
                  </span>
                )}
              </label>
              <label className="leaderboard__field">
                <span>{t('École (optionnel)', 'Lekòl (opsyonèl)')}</span>
                <input
                  className="input-field"
                  value={school}
                  maxLength={60}
                  onChange={(e) => setSchool(e.target.value)}
                  placeholder={t('Nom de votre école', 'Non lekòl ou')}
                />
              </label>
              <label className="leaderboard__field">
                <span>{t('Département (optionnel)', 'Depatman (opsyonèl)')}</span>
                <select
                  className="input-field"
                  value={department}
                  onChange={(e) => pickDepartment(e.target.value)}
                >
                  <option value="">{t('— Choisir —', '— Chwazi —')}</option>
                  {HAITI_DEPARTMENTS.map((d) => (
                    <option key={d.name} value={d.name}>{d.name}</option>
                  ))}
                </select>
              </label>
              {department && (
                <label className="leaderboard__field">
                  <span>{t('Ville (optionnel)', 'Vil (opsyonèl)')}</span>
                  {deptCities.length > 0 && (
                    <select
                      className="input-field"
                      value={cityChoice}
                      onChange={(e) => { setCityChoice(e.target.value); setCustomCity(''); }}
                    >
                      <option value="">{t('— Choisir —', '— Chwazi —')}</option>
                      {deptCities.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                      <option value={OTHER_CITY}>{t('Autre ville…', 'Lòt vil…')}</option>
                    </select>
                  )}
                  {cityChoice === OTHER_CITY && (
                    <input
                      className="input-field"
                      value={customCity}
                      maxLength={60}
                      onChange={(e) => setCustomCity(e.target.value)}
                      placeholder={t('Nom de votre ville', 'Non vil ou')}
                    />
                  )}
                </label>
              )}
              <div className="leaderboard__form-actions">
                <button className="button button--ghost" onClick={() => setShowForm(false)} disabled={saving}>
                  {t('Annuler', 'Anile')}
                </button>
                <button className="button button--primary" onClick={save} disabled={saving || !aliasOk}>
                  {saving ? t('…', '…') : t('Confirmer', 'Konfime')}
                </button>
              </div>
            </div>
          ) : !optedIn ? (
            <>
              <p className="leaderboard__join-pitch">
                <ShieldCheck size={15} />
                {t(
                  'Rejoignez le classement avec un pseudo — vous restez anonyme.',
                  'Antre nan klasman an ak yon ti non — ou rete anonim.',
                )}
              </p>
              <button className="button button--primary" onClick={openForm}>
                {t('Rejoindre le classement', 'Antre nan klasman')}
              </button>
            </>
          ) : needsAlias ? (
            <>
              <p className="leaderboard__join-pitch leaderboard__join-pitch--warn">
                <Pencil size={15} />
                {t(
                  'Il vous manque un pseudo — choisissez-en un pour apparaître dans le classement.',
                  'Ou manke yon ti non — chwazi youn pou parèt nan klasman an.',
                )}
              </p>
              <button className="button button--primary" onClick={openForm}>
                {t('Choisir un pseudo', 'Chwazi yon ti non')}
              </button>
            </>
          ) : (
            <button className="leaderboard__edit" onClick={openForm}>
              <Pencil size={13} />
              {t('Modifier mon pseudo, mon école ou ma ville', 'Chanje ti non mwen, lekòl mwen oswa vil mwen')}
            </button>
          )}
        </div>
      )}

      {compact && isAuthed && (
        <div className="leaderboard__compact-foot">
          {needsAlias ? (
            <button className="leaderboard__more" onClick={() => navigate('/profile')}>
              {t('Choisir un pseudo →', 'Chwazi yon ti non →')}
            </button>
          ) : optedIn ? (
            <span className="text-muted">
              {myRank
                ? t(`Vous êtes #${myRank} cette semaine`, `Ou nan #${myRank} semèn sa a`)
                : t('Jouez pour grimper !', 'Jwe pou ou monte !')}
            </span>
          ) : (
            <button className="leaderboard__more" onClick={() => navigate('/profile')}>
              {t('Rejoindre →', 'Antre →')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
