/**
 * /tournois — the tournaments hub.
 *
 * Create one, join one with a PIN, watch the public ones, find your own.
 * Premium pass (2026-10-17): the shared title row, then plain sections on
 * the night — tiles are the only cards, because they are the only things
 * you tap. The empty list is an invitation, the PIN a labelled field, and
 * a guest is asked to sign in once.
 * Ted, 2026-09-23: "allow people to create their own tournament and play …
 * people can loop in to see the game, they can decide to make the visibility
 * public or not." Only PUBLIC tournaments are listed here; unlisted and
 * private ones are reached by their link or PIN.
 */
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Radio, Users } from '../../components/icons';
import useStore from '../../contexts/store';
import {
  formatLabel,
  listMine,
  listPublic,
  type MyTournament,
  type Tournament,
} from '../../services/tournoisService';
import { formatWhen, useLang } from './parts';
import ArenaPageHead from '../../components/arena/ArenaPageHead';
import { Skeleton } from '../../components/Skeleton';
import { ErrorState, LoadingState } from '../../components/StateViews';
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
        {tour.teamRule === 'class' && <span className="tn-pill">{t('Classe vérifiée', 'Klas verifye')}</span>}
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
  // Bumped by "Réessayer" so a failed list can be fetched again in place.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoadError(false);
    if (reloadKey > 0) setOpen(null);
    listPublic('open').then((r) => alive && setOpen(r)).catch(() => { if (alive) { setOpen([]); setLoadError(true); } });
    listPublic('finished').then((r) => alive && setFinished(r)).catch(() => {});
    return () => { alive = false; };
  }, [reloadKey]);

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

  const signedIn = !!user?.uid;
  // With no public tournament, the empty list itself carries the create
  // button — so the title row does not repeat it.
  const listEmpty = open !== null && open.length === 0 && !loadError;

  return (
    <section className="tn tn--hub">
      <div className="tn__wrap">
        <ArenaPageHead
          title={t('Tournois', 'Tounwa')}
          sub={t(
            'Monte un tournoi pour ta classe ou ton école, ou entre dans celui d’un ami avec son PIN.',
            'Monte yon tounwa pou klas ou oswa lekòl ou, oswa antre nan tounwa yon zanmi ak PIN li.',
          )}
          actions={listEmpty ? undefined : (
            <button type="button" className="an-go" onClick={create}>
              <Plus size={18} aria-hidden="true" /> {t('Créer un tournoi', 'Kreye yon tounwa')}
            </button>
          )}
        />

        <div className="tn-split tn-hub">
          <div className="tn-hub__main">
            <section aria-labelledby="tn-public-title">
              <div className="tn-section__head tn-section__head--stack">
                <h2 id="tn-public-title">{t('Tournois publics', 'Tounwa piblik')}</h2>
                {!listEmpty && <span>{t('Tout le monde peut les regarder.', 'Tout moun ka gade yo.')}</span>}
              </div>
              {open === null ? (
                <LoadingState label={t('Chargement des tournois…', 'N ap chaje tounwa yo…')}>
                  <div className="tn-grid" aria-hidden="true">
                    {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={112} radius={18} />)}
                  </div>
                </LoadingState>
              ) : loadError ? (
                /* A failed fetch is not an empty list: say so and offer a retry.
                   PIN entry and "Créer" stay usable beside it. */
                <ErrorState
                  compact
                  title={t('Liste indisponible', 'Lis la pa disponib')}
                  message={t('Impossible de charger la liste pour l’instant.', 'Nou pa ka chaje lis la kounye a.')}
                  offlineMessage={t('Tu es hors ligne. Reconnecte-toi pour voir les tournois publics.', 'Ou pa sou entènèt. Rekonekte pou wè tounwa piblik yo.')}
                  onRetry={() => setReloadKey((k) => k + 1)}
                  retryLabel={t('Réessayer', 'Eseye ankò')}
                />
              ) : open.length === 0 ? (
                /* An empty list is an invitation, not a panel announcing nothing. */
                <div className="tn-hub__empty" role="status">
                  <p>
                    {t('Aucun tournoi public en ce moment. Lance le premier : toute l’Arène pourra le suivre.', 'Pa gen tounwa piblik kounye a. Lanse premye a : tout Arèn nan ap ka swiv li.')}
                  </p>
                  <button type="button" className="an-go" onClick={create}>
                    <Plus size={18} aria-hidden="true" /> {t('Créer un tournoi', 'Kreye yon tounwa')}
                  </button>
                </div>
              ) : (
                <div className="tn-grid">
                  {open.map((x) => <TournamentTile key={x.id} tour={x} />)}
                </div>
              )}
            </section>

            {finished.length > 0 && (
              <section className="tn-section" aria-labelledby="tn-finished-title">
                <div className="tn-section__head"><h2 id="tn-finished-title">{t('Récemment terminés', 'Fèk fini')}</h2></div>
                <div className="tn-grid">
                  {finished.map((x) => <TournamentTile key={x.id} tour={x} />)}
                </div>
              </section>
            )}
          </div>

          <aside className="tn-hub__side">
            <form className="tn-hub__pin" onSubmit={goPin} aria-labelledby="tn-pin-title">
              <h2 id="tn-pin-title" className="tn-hub__title">{t('Rejoindre avec un PIN', 'Antre ak yon PIN')}</h2>
              <label htmlFor="tn-pin-input" className="tn-hub__label">
                {t('Le PIN à six chiffres que l’organisateur a partagé', 'PIN sis chif òganizatè a pataje a')}
              </label>
              <div className="tn-pinform">
                <input
                  id="tn-pin-input"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={7}
                  placeholder="000 000"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/[^\d ]/g, ''))}
                />
                <button type="submit" className="an-go" disabled={pin.replace(/\D/g, '').length !== 6}>
                  {t('Rejoindre', 'Antre')}
                </button>
              </div>
            </form>

            <section className="tn-hub__mine" aria-labelledby="tn-mine-title">
              <h2 id="tn-mine-title" className="tn-hub__title">{t('Mes tournois', 'Tounwa mwen')}</h2>
              {!signedIn ? (
                /* The page's one sign-in ask. */
                <div className="tn-signin">
                  <p className="tn-muted">{t('Connecte-toi pour retrouver les tournois que tu as créés ou rejoints.', 'Konekte pou w jwenn tounwa ou te kreye oswa antre ladan yo.')}</p>
                  <button type="button" className="an-ghost" onClick={toggleAuthModal}>{t('Se connecter', 'Konekte')}</button>
                </div>
              ) : mine.length === 0 ? (
                <p className="tn-muted">{t('Tu n’as encore créé ni rejoint aucun tournoi.', 'Ou poko kreye ni antre nan okenn tounwa.')}</p>
              ) : (
                <ul className="tn-hub__list">
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
            </section>
          </aside>
        </div>
      </div>
    </section>
  );
}
