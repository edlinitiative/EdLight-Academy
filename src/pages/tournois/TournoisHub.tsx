/**
 * /tournois — the tournaments hub.
 *
 * Create one, join one with a PIN, watch the public ones, find your own.
 * Ted, 2026-09-23: "allow people to create their own tournament and play …
 * people can loop in to see the game, they can decide to make the visibility
 * public or not." Only PUBLIC tournaments are listed here; unlisted and
 * private ones are reached by their link or PIN.
 */
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Radio, Trophy, Users, KeyRound, Eye } from '../../components/icons';
import useStore from '../../contexts/store';
import {
  formatLabel,
  listMine,
  listPublic,
  type MyTournament,
  type Tournament,
} from '../../services/tournoisService';
import { formatWhen, useLang } from './parts';
import './Tournois.css';

function StatePill({ t: tour }: { t: Pick<Tournament, 'state' | 'startsAt'> }) {
  const { t } = useLang();
  if (tour.state === 'running') return <span className="tn-pill tn-pill--live"><Radio size={12} aria-hidden="true" /> {t('En cours', 'Ap jwe')}</span>;
  if (tour.state === 'finished') return <span className="tn-pill tn-pill--done">{t('Terminé', 'Fini')}</span>;
  if (tour.state === 'cancelled') return <span className="tn-pill tn-pill--warn">{t('Annulé', 'Anile')}</span>;
  return <span className="tn-pill tn-pill--azure">{t('À venir', 'Pou vini')}</span>;
}

export function TournamentTile({ tour }: { tour: Tournament }) {
  const { t, isCreole } = useLang();
  return (
    <Link to={`/tournois/${tour.id}`} className="tn-tile">
      <div className="tn-tile__meta">
        <StatePill t={tour} />
        <span className="tn-pill">{formatLabel(tour.format, isCreole)}</span>
        {tour.teamRule === 'school' && <span className="tn-pill">{t('École vs école', 'Lekòl vs lekòl')}</span>}
        {tour.teamRule === 'grade' && <span className="tn-pill">{t('Classe vs classe', 'Klas vs klas')}</span>}
      </div>
      <p className="tn-tile__title">{tour.title}</p>
      <div className="tn-tile__meta">
        <span>{formatWhen(tour.startsAt, isCreole)}</span>
        <span aria-hidden="true">·</span>
        <span><Users size={13} aria-hidden="true" /> {tour.playerCount}</span>
        <span aria-hidden="true">·</span>
        <span>{t('par', 'pa')} {tour.creatorName}</span>
      </div>
    </Link>
  );
}

export default function TournoisHub() {
  const { t, isCreole } = useLang();
  const navigate = useNavigate();
  const user = useStore((s) => s.user);
  const toggleAuthModal = useStore((s) => s.toggleAuthModal);
  const [open, setOpen] = useState<Tournament[] | null>(null);
  const [finished, setFinished] = useState<Tournament[]>([]);
  const [mine, setMine] = useState<MyTournament[]>([]);
  const [pin, setPin] = useState('');
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let alive = true;
    listPublic('open').then((r) => alive && setOpen(r)).catch(() => { if (alive) { setOpen([]); setLoadError(true); } });
    listPublic('finished').then((r) => alive && setFinished(r)).catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!user?.uid) { setMine([]); return; }
    listMine(user.uid).then(setMine).catch(() => setMine([]));
  }, [user?.uid]);

  const goPin = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = pin.replace(/\D/g, '');
    if (clean.length === 6) navigate(`/tournois/rejoindre?pin=${clean}`);
  };

  const create = () => {
    if (!user?.uid) toggleAuthModal();
    else navigate('/tournois/nouveau');
  };

  return (
    <section className="tn">
      <div className="tn__wrap">
        <header className="tn-hero">
          <div className="tn-hero__top">
            <span className="tn-chip"><Trophy size={13} aria-hidden="true" /> {t('Tournois', 'Tounwa')}</span>
          </div>
          <h1>{t('Crée ton tournoi. On s’occupe du reste.', 'Kreye tounwa pa w. Nou okipe rès la.')}</h1>
          <p>
            {t(
              'Choisis le format — en direct, sur une journée ou deux semaines, par manches ou à élimination — et les catégories. Les questions et le calendrier sont générés pour toi ; tes amis rejoignent avec un PIN.',
              'Chwazi fòma a — an dirèk, sou yon jounen oswa de semèn, pa manch oswa eliminasyon — ak kategori yo. Nou jenere kesyon yo ak orè a pou ou ; zanmi w yo antre ak yon PIN.',
            )}
          </p>
          <div className="tn-hero__row">
            <div className="tn-hero__actions">
              <button type="button" className="tn-btn-glass" onClick={create}>
                <Plus size={16} aria-hidden="true" /> {t('Créer un tournoi', 'Kreye yon tounwa')}
              </button>
            </div>
          </div>
        </header>

        <div className="tn-split tn-section">
          <div>
            <div className="tn-section__head">
              <h2>{t('Tournois publics', 'Tounwa piblik')}</h2>
              <span><Eye size={13} aria-hidden="true" /> {t('ouverts aux spectateurs', 'louvri pou espektatè')}</span>
            </div>
            {open === null ? (
              <p className="tn-muted">{t('Chargement…', 'Ap chaje…')}</p>
            ) : open.length === 0 ? (
              <div className="tn-empty">
                {loadError
                  ? t('Impossible de charger la liste pour l’instant.', 'Nou pa ka chaje lis la kounye a.')
                  : t('Aucun tournoi public pour l’instant — lance le premier !', 'Pa gen tounwa piblik kounye a — lanse premye a !')}
              </div>
            ) : (
              <div className="tn-grid">
                {open.map((x) => <TournamentTile key={x.id} tour={x} />)}
              </div>
            )}

            {finished.length > 0 && (
              <div className="tn-section">
                <div className="tn-section__head"><h2>{t('Récemment terminés', 'Fèk fini')}</h2></div>
                <div className="tn-grid">
                  {finished.map((x) => <TournamentTile key={x.id} tour={x} />)}
                </div>
              </div>
            )}
          </div>

          <aside style={{ display: 'grid', gap: '1rem' }}>
            <form className="tn-card" onSubmit={goPin}>
              <div className="tn-section__head" style={{ marginBottom: '0.6rem' }}>
                <h2><KeyRound size={17} aria-hidden="true" /> {t('Rejoindre avec un PIN', 'Antre ak yon PIN')}</h2>
              </div>
              <div className="tn-pinform">
                <input
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={7}
                  placeholder="000 000"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/[^\d ]/g, ''))}
                  aria-label={t('PIN du tournoi', 'PIN tounwa a')}
                />
                <button type="submit" className="button button--primary" disabled={pin.replace(/\D/g, '').length !== 6}>
                  {t('Rejoindre', 'Antre')}
                </button>
              </div>
            </form>

            <div className="tn-card">
              <div className="tn-section__head" style={{ marginBottom: '0.6rem' }}>
                <h2>{t('Mes tournois', 'Tounwa mwen')}</h2>
              </div>
              {!user?.uid ? (
                <p className="tn-muted">
                  <button type="button" className="button button--ghost" onClick={toggleAuthModal}>{t('Se connecter', 'Konekte')}</button>
                </p>
              ) : mine.length === 0 ? (
                <p className="tn-muted">{t('Tu n’as encore créé ni rejoint aucun tournoi.', 'Ou poko kreye ni antre nan okenn tounwa.')}</p>
              ) : (
                <ul className="tn-timeline">
                  {mine.map((m) => (
                    <li key={m.tid}>
                      <Link to={`/tournois/${m.tid}`}>{m.title}</Link>
                      <span className="tn-muted">
                        {m.role === 'creator' ? t('organisateur', 'òganizatè') : formatLabel(m.format, isCreole)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
