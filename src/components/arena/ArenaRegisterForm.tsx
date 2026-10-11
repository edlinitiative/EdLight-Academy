import React, { useState } from 'react';
import { GraduationCap, Check, Smartphone, Laptop } from '../icons';
import useStore from '../../contexts/store';
import { registerForTournament, registerErrorMessage } from '../../services/arenaWebService';
import { GRADES } from '../../../shared/trackConfig';
import { ARENA_WEB_PLAY } from '../../../shared/arena/webPlay';
import SchoolField from './SchoolField';
import '../../pages/Arena.css';

/**
 * Register for one Arena edition: school, class, attestation.
 *
 * Lifted out of /arena so the play room (/arena/jouer/:tid) can offer the same
 * form to a student who opens a link before registering — including for a
 * rehearsal edition an admin is testing, which the public /arena page never
 * lists. The server decides every rule (sign-up open, grade allowed, school
 * real); this sends three facts and reports back what it said.
 */
export default function ArenaRegisterForm({ tournamentId, isCreole, onRegistered }: {
  tournamentId: string;
  isCreole: boolean;
  onRegistered: (school: string) => void;
}) {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const user = useStore((s) => s.user);
  const toggleAuthModal = useStore((s) => s.toggleAuthModal);
  const storedGrade = useStore((s) => s.grade);
  const signedIn = !!user?.uid;

  const [picked, setPicked] = useState<{ key: string; label: string } | null>(null);
  const [grade, setGrade] = useState<string>(storedGrade && storedGrade !== 'POSTBAC' ? storedGrade : '');
  const [attested, setAttested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = !!tournamentId && signedIn && !!picked && !!grade && attested && !busy;

  const submit = async () => {
    if (!canSubmit || !picked) return;
    setBusy(true);
    setError(null);
    const res = await registerForTournament({ tournamentId, schoolKey: picked.key, grade });
    setBusy(false);
    if (res.ok) onRegistered(picked.label);
    else setError(registerErrorMessage(res.error || 'unknown', isCreole));
  };

  return (
    <div className="arena-page__form" id="arena-inscription">
      {/* Said BEFORE the button, not after it: registering is not enough —
          a school counts only the students who are actually in the room. */}
      <div className="arena-page__note">
        {ARENA_WEB_PLAY ? <Laptop size={17} aria-hidden="true" /> : <Smartphone size={17} aria-hidden="true" />}
        <p>
          {ARENA_WEB_PLAY
            ? t(
              'Inscrivez-vous ici. Le jour du championnat, jouez sur cet ordinateur ou dans l’application mobile — votre école ne compte que les élèves présents.',
              'Enskri isit la. Jou chanpyona a, jwe sou òdinatè sa a oswa nan aplikasyon mobil la — lekòl ou konte sèlman elèv ki prezan.',
            )
            : t(
              'Inscrivez-vous ici. Le jour du championnat, les questions se jouent dans l’application mobile — votre école ne compte que les élèves présents.',
              'Enskri isit la. Jou chanpyona a, kesyon yo jwe nan aplikasyon mobil la — lekòl ou konte sèlman elèv ki prezan.',
            )}
        </p>
      </div>

      <SchoolField picked={picked} onPick={setPicked} isCreole={isCreole} signedIn={signedIn} />

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
          {t('Réservé au primaire et au secondaire.', 'Se pou primè ak segondè sèlman.')}
        </span>
      </label>

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
  );
}
