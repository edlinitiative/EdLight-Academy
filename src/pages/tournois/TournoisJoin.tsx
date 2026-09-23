/**
 * /tournois/rejoindre?pin=XXXXXX — join by PIN.
 *
 * The one door into a PRIVATE tournament (its page is unreadable until the
 * player is on the roster), and the short path for every other kind: the
 * Jeux page links here with the PIN a friend read out.
 */
import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, KeyRound } from 'lucide-react';
import useStore from '../../contexts/store';
import { useTrivia } from '../../hooks/useTrivia';
import { GRADES } from '../../../shared/trackConfig';
import { errorMessage, joinTournament, resolvePin } from '../../services/tournoisService';
import { useLang } from './parts';
import './Tournois.css';

export default function TournoisJoin() {
  const { t, isCreole } = useLang();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const user = useStore((s) => s.user);
  const storedGrade = useStore((s) => s.grade);
  const toggleAuthModal = useStore((s) => s.toggleAuthModal);
  const { profile } = useTrivia();
  const [pin, setPin] = useState((params.get('pin') || '').replace(/\D/g, '').slice(0, 6));
  const [school, setSchool] = useState('');
  const [grade, setGrade] = useState(storedGrade && storedGrade !== 'POSTBAC' ? storedGrade : '');
  const [need, setNeed] = useState<'school' | 'grade' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clean = pin.replace(/\D/g, '');

  const join = async () => {
    if (clean.length !== 6) return;
    if (!user?.uid) { toggleAuthModal(); return; }
    setBusy(true);
    setError(null);
    const r = await joinTournament({ pin: clean }, {
      displayName: profile?.leaderboard?.displayName || undefined,
      school: (school || profile?.leaderboard?.school) || undefined,
      grade: grade || undefined,
    });
    setBusy(false);
    if (r.ok && r.data?.tid) { navigate(`/tournois/${r.data.tid}`); return; }
    if (r.error === 'school_required') setNeed('school');
    if (r.error === 'grade_required') setNeed('grade');
    if (r.error === 'closed') {
      // Too late to play — but a public or unlisted room can still be watched.
      const tid = await resolvePin(clean);
      if (tid) { navigate(`/tournois/${tid}`); return; }
    }
    setError(errorMessage(r.error, isCreole));
  };

  // Arriving from a shared link with the PIN already in it: go straight in.
  useEffect(() => {
    if (params.get('pin') && user?.uid && clean.length === 6) join();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  return (
    <section className="tn">
      <div className="tn__narrow" style={{ display: 'grid', gap: '1rem' }}>
        <Link to="/tournois" className="tn-muted" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <ArrowLeft size={15} aria-hidden="true" /> {t('Tournois', 'Tounwa')}
        </Link>
        <header className="tn-hero">
          <div className="tn-hero__top"><span className="tn-chip"><KeyRound size={13} aria-hidden="true" /> PIN</span></div>
          <h1>{t('Rejoindre un tournoi', 'Antre nan yon tounwa')}</h1>
          <p>{t('Entre le PIN à six chiffres que l’organisateur a partagé.', 'Antre PIN sis chif òganizatè a pataje a.')}</p>
        </header>
        <form className="tn-card" style={{ display: 'grid', gap: '0.9rem' }} onSubmit={(e) => { e.preventDefault(); join(); }}>
          <div className="tn-pinform">
            <input
              inputMode="numeric"
              autoComplete="off"
              maxLength={7}
              placeholder="000 000"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/[^\d ]/g, ''))}
              aria-label={t('PIN du tournoi', 'PIN tounwa a')}
              autoFocus
            />
            <button type="submit" className="button button--primary" disabled={clean.length !== 6 || busy}>
              {busy ? t('Connexion…', 'Ap konekte…') : user?.uid ? t('Rejoindre', 'Antre') : t('Se connecter pour jouer', 'Konekte pou jwe')}
            </button>
          </div>
          {need === 'school' && (
            <div className="tn-field" style={{ marginBottom: 0 }}>
              <label htmlFor="tnj-school">{t('Ton école (école contre école)', 'Lekòl ou (lekòl kont lekòl)')}</label>
              <input id="tnj-school" type="text" maxLength={80} value={school} onChange={(e) => setSchool(e.target.value)} />
            </div>
          )}
          {need === 'grade' && (
            <div className="tn-field" style={{ marginBottom: 0 }}>
              <label htmlFor="tnj-grade">{t('Ta classe (classe contre classe)', 'Klas ou (klas kont klas)')}</label>
              <select id="tnj-grade" value={grade} onChange={(e) => setGrade(e.target.value)}>
                <option value="">{t('Choisis ta classe…', 'Chwazi klas ou…')}</option>
                {GRADES.map((g) => <option key={g.code} value={g.code}>{isCreole ? g.labelHt : g.label}</option>)}
              </select>
            </div>
          )}
          {error && <p className="tn-error" role="alert">{error}</p>}
        </form>
      </div>
    </section>
  );
}
