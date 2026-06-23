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
import { Trophy, Crown, Medal, Flame, ChevronRight, ShieldCheck } from 'lucide-react';
import useStore from '../contexts/store';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { useTrivia } from '../hooks/useTrivia';
import './Leaderboard.css';

function defaultAlias(user) {
  const name = user?.name || user?.displayName || '';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Élève';
  const first = parts[0];
  const initial = parts.length > 1 ? ` ${parts[parts.length - 1][0].toUpperCase()}.` : '';
  return `${first}${initial}`;
}

function RankBadge({ rank }) {
  if (rank === 1) return <span className="lb-rank lb-rank--gold"><Crown size={14} /></span>;
  if (rank === 2) return <span className="lb-rank lb-rank--silver"><Medal size={14} /></span>;
  if (rank === 3) return <span className="lb-rank lb-rank--bronze"><Medal size={14} /></span>;
  return <span className="lb-rank">{rank}</span>;
}

export default function Leaderboard({ variant = 'full', max = 25 }) {
  const navigate = useNavigate();
  const { user, language } = useStore();
  const isCreole = language === 'ht';
  const t = (fr, ht) => (isCreole ? ht : fr);

  const { entries, myEntry, myRank, isLoading } = useLeaderboard(variant === 'compact' ? 5 : max);
  const { profile, level, setLeaderboardOptIn, isAuthed } = useTrivia();

  const optedIn = !!profile?.leaderboard?.optedIn;
  const mySchool = profile?.leaderboard?.school || null;

  const [scope, setScope] = useState('national'); // 'national' | 'school'
  const [showJoin, setShowJoin] = useState(false);
  const [alias, setAlias] = useState(defaultAlias(user));
  const [school, setSchool] = useState(mySchool || '');
  const [saving, setSaving] = useState(false);

  const visible = useMemo(() => {
    if (scope === 'school' && mySchool) {
      return entries.filter((e) => e.school && e.school === mySchool);
    }
    return entries;
  }, [entries, scope, mySchool]);

  const join = async () => {
    setSaving(true);
    try {
      await setLeaderboardOptIn({
        optedIn: true,
        displayName: (alias || defaultAlias(user)).slice(0, 24),
        school: school.trim() || null,
      });
      setShowJoin(false);
    } finally {
      setSaving(false);
    }
  };

  const compact = variant === 'compact';

  return (
    <div className={`leaderboard ${compact ? 'leaderboard--compact' : ''}`}>
      <div className="leaderboard__header">
        <h3 className="leaderboard__title">
          <Trophy size={17} /> {t('Classement de la semaine', 'Klasman semèn nan')}
        </h3>
        {compact && (
          <button className="leaderboard__more" onClick={() => navigate('/profile')}>
            {t('Voir tout', 'Wè tout')} <ChevronRight size={14} />
          </button>
        )}
      </div>

      {!compact && (
        <div className="leaderboard__scopes" role="tablist">
          <button
            role="tab"
            aria-selected={scope === 'national'}
            className={`leaderboard__scope ${scope === 'national' ? 'is-active' : ''}`}
            onClick={() => setScope('national')}
          >
            {t('National', 'Nasyonal')}
          </button>
          <button
            role="tab"
            aria-selected={scope === 'school'}
            className={`leaderboard__scope ${scope === 'school' ? 'is-active' : ''}`}
            onClick={() => setScope('school')}
          >
            {t('Mon école', 'Lekòl mwen')}
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="leaderboard__loading">
          {Array.from({ length: compact ? 3 : 5 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 44, borderRadius: 10, marginBottom: 8 }} />
          ))}
        </div>
      ) : visible.length > 0 ? (
        <ol className="leaderboard__list">
          {visible.map((e) => {
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
        <div className="leaderboard__empty">
          <p className="text-muted">
            {scope === 'school' && !mySchool
              ? t('Ajoutez votre école pour voir son classement.', 'Ajoute lekòl ou pou wè klasman li.')
              : t('Personne pour le moment — soyez le premier !', 'Pèsòn poko la — se ou ki premye !')}
          </p>
        </div>
      )}

      {/* Viewer's own rank line when they're not in the visible slice */}
      {!compact && optedIn && myEntry && !visible.some((e) => e.id === user?.uid) && (
        <div className="leaderboard__self">
          <RankBadge rank={myRank} />
          <span className="leaderboard__name">
            {myEntry.displayName} <span className="leaderboard__you">{t('vous', 'ou')}</span>
          </span>
          <span className="leaderboard__xp"><Flame size={12} /> {myEntry.xp || 0}</span>
        </div>
      )}

      {/* Opt-in management */}
      {isAuthed && !optedIn && !compact && (
        <div className="leaderboard__join">
          {!showJoin ? (
            <>
              <p className="leaderboard__join-pitch">
                <ShieldCheck size={15} />
                {t(
                  'Rejoignez le classement avec un pseudo — vous restez anonyme.',
                  'Antre nan klasman an ak yon ti non — ou rete anonim.',
                )}
              </p>
              <button className="button button--primary button--pill" onClick={() => setShowJoin(true)}>
                {t('Rejoindre le classement', 'Antre nan klasman')}
              </button>
            </>
          ) : (
            <div className="leaderboard__form">
              <label className="leaderboard__field">
                <span>{t('Pseudo affiché', 'Non yo afiche')}</span>
                <input
                  className="input-field"
                  value={alias}
                  maxLength={24}
                  onChange={(e) => setAlias(e.target.value)}
                  placeholder={defaultAlias(user)}
                />
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
              <div className="leaderboard__form-actions">
                <button className="button button--ghost button--pill" onClick={() => setShowJoin(false)} disabled={saving}>
                  {t('Annuler', 'Anile')}
                </button>
                <button className="button button--primary button--pill" onClick={join} disabled={saving}>
                  {saving ? t('…', '…') : t('Confirmer', 'Konfime')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {compact && isAuthed && (
        <div className="leaderboard__compact-foot">
          {optedIn ? (
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
