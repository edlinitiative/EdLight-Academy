import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Swords, GraduationCap, Check, Smartphone } from 'lucide-react';
import useStore from '../contexts/store';
import { useOpenArena } from '../hooks/useOpenArena';
import { registerForTournament, registerErrorMessage } from '../services/arenaWebService';
import SchoolField from '../components/arena/SchoolField';
import MySchoolCard from '../components/MySchoolCard';
import SchoolRanking from '../components/SchoolRanking';
import { GRADES } from '../../shared/trackConfig';
import './Arena.css';

/**
 * /arena — the championship's permanent home on the web.
 *
 * This route used to be `<Navigate to="/download" />`: every link about the
 * championship threw a visitor at a QR code. Reported twice — "there's no
 * clear message and all", then "arène does not let me register my school".
 *
 * Ted's rule, 2026-09-21: "only the play is now allowed on website, everything
 * else is." So a student registers here, sees their school's progress here,
 * and installs the app to actually play. That order matters: registering is
 * cheap and can happen the moment interest strikes, on a school computer or a
 * borrowed laptop; installing is the expensive step and it has days to happen.
 *
 * WHAT THIS PAGE MAY NEVER IMPLY: that registering is enough. Qualification is
 * measured at doors close on players PRESENT, so a student who registers and
 * never opens the app is a no-show who contributes nothing to their school's
 * five. The app requirement is stated before the button and again after it.
 */
export default function Arena() {
  const language = useStore((s) => s.language);
  const user = useStore((s) => s.user);
  const toggleAuthModal = useStore((s) => s.toggleAuthModal);
  const storedGrade = useStore((s) => s.grade);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const open = useOpenArena();

  const [picked, setPicked] = useState<{ key: string; label: string } | null>(null);
  const [grade, setGrade] = useState<string>(storedGrade && storedGrade !== 'POSTBAC' ? storedGrade : '');
  const [attested, setAttested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | { school: string }>(null);

  const signedIn = !!user?.uid;
  const canSubmit = !!open && signedIn && !!picked && !!grade && attested && !busy;

  const submit = async () => {
    if (!canSubmit || !open || !picked) return;
    setBusy(true);
    setError(null);
    const res = await registerForTournament({
      tournamentId: open.id,
      schoolKey: picked.key,
      grade,
    });
    setBusy(false);
    if (res.ok) setDone({ school: picked.label });
    else setError(registerErrorMessage(res.error || 'unknown', isCreole));
  };

  /**
   * The date, only while it is still ahead.
   *
   * A tournament sits in `registration` until an admin advances it, so a start
   * time can slip into the past while sign-up is still open — and the page was
   * then announcing "Prochaine édition : vendredi 18 septembre" on the 21st.
   * A date that has gone is worse than no date: it reads as a dead event.
   */
  const dateLabel = open?.startsAt && open.startsAt > Date.now()
    ? new Date(open.startsAt).toLocaleDateString(isCreole ? 'fr-HT' : 'fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long',
    })
    : null;

  return (
    <section className="section arena-page">
      <div className="container arena-page__container">
        <header className="arena-page__header">
          <span className="arena-page__eyebrow">
            <Swords size={14} aria-hidden="true" /> {t('Championnat interscolaire', 'Chanpyona ant lekòl yo')}
          </span>
          <h1>{open ? (isCreole && open.titleHt ? open.titleHt : open.title) : t('L’Arène', 'Arèn nan')}</h1>
          <p>
            {open
              ? t(
                dateLabel
                  ? `Votre école contre les autres, le ${dateLabel}.`
                  : open.state === 'doors'
                    ? 'Votre école contre les autres. Les portes sont ouvertes — inscrivez-vous maintenant.'
                    : 'Votre école contre les autres. Les inscriptions sont ouvertes.',
                dateLabel
                  ? `Lekòl ou kont lòt yo, ${dateLabel}.`
                  : open.state === 'doors'
                    ? 'Lekòl ou kont lòt yo. Pòt yo louvri — enskri kounye a.'
                    : 'Lekòl ou kont lòt yo. Enskripsyon yo ouvè.',
              )
              : t(
                'Ton école contre les autres, tous les jours. Chaque partie, quiz et examen compte ; une fois par mois, la finale se joue en direct.',
                'Lekòl ou kont lòt yo, chak jou. Chak pati, quiz ak egzamen konte ; yon fwa pa mwa, final la jwe an dirèk.',
              )}
          </p>
        </header>

        {/* Said BEFORE the button, not after it. A student who registers here
            and never installs the app is a no-show who counts for nothing.
            Only while an edition is open — between editions there is no
            button for it to come before. */}
        {open && !done && (
        <div className="arena-page__note">
          <Smartphone size={17} aria-hidden="true" />
          <p>
            {t(
              'Inscrivez-vous ici. Le jour du championnat, les questions se jouent dans l’application mobile — votre école ne compte que les élèves présents.',
              'Enskri isit la. Jou chanpyona a, kesyon yo jwe nan aplikasyon mobil la — lekòl ou konte sèlman elèv ki prezan.',
            )}
          </p>
        </div>
        )}

        {done ? (
          <div className="arena-page__done" role="status">
            <span className="arena-page__done-icon"><Check size={20} aria-hidden="true" /></span>
            <h2>{t('Vous êtes inscrit', 'Ou enskri')}</h2>
            <p>
              {t(
                `${done.school} — votre place est enregistrée. Installez l’application et connectez-vous avec le même compte : le jour J, votre école ne compte que les élèves réellement présents.`,
                `${done.school} — plas ou anrejistre. Enstale aplikasyon an epi konekte ak menm kont lan : jou a, lekòl ou konte sèlman elèv ki reyèlman prezan.`,
              )}
            </p>
            <Link to="/download?from=arena" className="button button--primary">
              {t('Installer l’application', 'Enstale aplikasyon an')}
            </Link>
          </div>
        ) : open === undefined ? (
          // Not "nothing is open" — not known yet. Saying the championship is
          // closed while the answer is still in flight loses the visitor.
          <div className="arena-page__loading" role="status" aria-live="polite">
            <span className="arena-page__spinner" aria-hidden="true" />
            <p>{t('Chargement du championnat…', 'N ap chaje chanpyona a…')}</p>
          </div>
        ) : !open ? (
          /* Between editions the tab is the race itself, not an apology: the
             school board moves every day, and the student's own school — with
             the invite beside it — is the reason to come back. It used to be
             one line saying nothing was open. */
          <div className="arena-page__between">
            {signedIn ? (
              <MySchoolCard where="arena" />
            ) : (
              <div className="arena-page__signin">
                <p>{t('Connecte-toi pour représenter ton école.', 'Konekte pou w reprezante lekòl ou.')}</p>
                <button type="button" className="button button--primary" onClick={toggleAuthModal}>
                  {t('Se connecter', 'Konekte')}
                </button>
              </div>
            )}
            <SchoolRanking max={10} />
            <p className="arena-page__next">
              {t('Prochaine finale en direct : annoncée ici et dans l’application.', 'Pwochen final an dirèk : n ap anonse l isit la ak nan aplikasyon an.')}
              {' '}<Link to="/jeux">{t('Jouer maintenant', 'Jwe kounye a')}</Link>
            </p>
          </div>
        ) : (
          <div className="arena-page__form">
            <SchoolField picked={picked} onPick={setPicked} isCreole={isCreole} signedIn={signedIn} />

            {/* ── Grade ──────────────────────────────────────────────── */}
            <label className="arena-field">
              <span className="arena-field__label">
                <GraduationCap size={15} aria-hidden="true" /> {t('Votre classe', 'Klas ou')}
              </span>
              <select value={grade} onChange={(e) => setGrade(e.target.value)} className="arena-field__select">
                <option value="">{t('Choisissez votre classe…', 'Chwazi klas ou…')}</option>
                {GRADES.filter((g) => g.code !== 'POSTBAC').map((g) => (
                  <option key={g.code} value={g.code}>{isCreole ? g.labelHt : g.label}</option>
                ))}
              </select>
              <span className="arena-field__hint">
                {t(
                  'Réservé au primaire et au secondaire.',
                  'Se pou primè ak segondè sèlman.',
                )}
              </span>
            </label>

            {/* ── Attestation ────────────────────────────────────────── */}
            <button
              type="button"
              className="arena-attest"
              aria-pressed={attested}
              onClick={() => setAttested((a) => !a)}
            >
              <span className={`arena-attest__box${attested ? ' is-on' : ''}`} aria-hidden="true">
                {attested && <Check size={13} />}
              </span>
              <span>
                {t(
                  'Je confirme que ces informations sont exactes. Si je gagne, je devrai prouver mon identité.',
                  'Mwen konfime enfòmasyon sa yo kòrèk. Si m genyen, m ap gen pou pwouve ki moun mwen ye.',
                )}
              </span>
            </button>

            {error && <p className="arena-page__error" role="alert">{error}</p>}

            {signedIn ? (
              <button
                type="button"
                className="button button--primary arena-page__submit"
                disabled={!canSubmit}
                onClick={submit}
              >
                {busy ? t('Inscription…', 'Ap enskri…') : t('Inscrire mon école', 'Enskri lekòl mwen')}
              </button>
            ) : (
              <div className="arena-page__signin">
                <p>
                  {t(
                    'Connectez-vous pour inscrire votre école — votre place est liée à votre compte.',
                    'Konekte pou w enskri lekòl ou — plas ou mare ak kont ou.',
                  )}
                </p>
                <button type="button" className="button button--primary" onClick={toggleAuthModal}>
                  {t('Se connecter', 'Konekte')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
