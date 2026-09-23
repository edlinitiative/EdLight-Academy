import React, { useEffect, useMemo, useState } from 'react';
import { School as SchoolIcon, Search, Plus, Check, AlertTriangle } from '../icons';
import {
  searchSchools,
  likelyDuplicate,
  validateShortName,
  shortNameFailure,
  type School,
  type ShortNameReason,
} from '../../../shared/schools';
import {
  loadSchools,
  seedSchools,
  addSchool,
  type AddSchoolResult,
} from '../../services/schoolWebService';
import { HAITI_DEPARTMENTS, OTHER_CITY, citiesOf } from '../../data/haitiGeo';
// The field's styles live with the /arena page; the sign-in school step renders
// it app-wide, so it brings them along (every rule there is .arena-* scoped).
import '../../pages/Arena.css';

/**
 * Pick your school, or add the one that isn't there.
 *
 * The web port of mobile's SchoolPicker, and it exists because the first cut
 * of /arena searched only the bundled seed: 94 schools from four years of ESLP
 * applicants, which was never the whole country. A student whose school was
 * missing had nowhere to go — the exact report this is answering.
 *
 * Two rules carried over from the mobile picker, both about the same failure:
 *
 *  1. Adding is offered ONLY after a search has come up short. The school board
 *     groups by name, so every duplicate entry halves a real school's points,
 *     and most duplicates are not people wanting a new entry — they are people
 *     failing to find the one that exists.
 *  2. A confident near-match is shown as a warning WHILE the add form is open,
 *     because the last chance to stop a duplicate is the moment before it.
 *
 * The list paints from the bundled seed immediately and folds in the added
 * schools when Firestore answers, so it is never empty and never blocks.
 */
export default function SchoolField({ picked, onPick, isCreole, signedIn, variant = 'arena', autoFocus = false }: {
  picked: { key: string; label: string } | null;
  onPick: (s: { key: string; label: string; departement?: string | null } | null) => void;
  /** 'onboarding' is the sign-in school step: adding asks for exactly the
   *  name, the département and the commune — the tournament's short name and
   *  street address belong to /arena, not to someone's first minute here. */
  variant?: 'arena' | 'onboarding';
  autoFocus?: boolean;
  isCreole: boolean;
  /** Re-runs the load when it flips: the schools a student ADDED are readable
   *  only to a signed-in user, so a visitor who signs in on this page would
   *  otherwise keep searching the bundled seed alone. */
  signedIn: boolean;
}) {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const [schools, setSchools] = useState<School[]>(seedSchools);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  // The name being ADDED, separate from the search text and editable. Mobile
  // submits the raw query, which means "lycee toussaint louverture" goes on the
  // tournament stage exactly as typed — lowercase, unaccented. Nothing here
  // rewrites it (a school's name is not ours to invent); the student is simply
  // given the chance to fix it before it becomes the entry everyone sees.
  const [newName, setNewName] = useState('');
  const [commune, setCommune] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [shortName, setShortName] = useState('');
  const [departement, setDepartement] = useState('');
  const [communeOther, setCommuneOther] = useState(false);
  const [busy, setBusy] = useState(false);
  const onboarding = variant === 'onboarding';
  const [problem, setProblem] = useState<AddSchoolResult | null>(null);

  useEffect(() => {
    let live = true;
    loadSchools().then((all) => { if (live) setSchools(all); });
    return () => { live = false; };
  }, [signedIn]);

  // searchSchools, not a substring filter: it forgives accents, abbreviations
  // and the institution type. A student who types "lycee toussaint" must land
  // on the existing "Lycée Toussaint Louverture" — every near-miss here is a
  // school split in two on the board, with half the points each.
  const matches = useMemo(
    () => (query.trim().length < 2 ? [] : searchSchools(schools, query, { limit: 6 })),
    [schools, query],
  );

  // Only while the add form is open, and only for a confident match: offering
  // "did you mean?" for a loose one trains people to dismiss it.
  const maybeSame = useMemo(
    () => (adding && newName.trim().length >= 4 ? likelyDuplicate(schools, newName) : null),
    [adding, newName, schools],
  );

  // Checked as it is typed, so "already taken" lands while the student can
  // still ask a classmate what theirs actually is — finding out after clicking
  // Ajouter is how a second-best name gets invented.
  const shortNameBroken = useMemo(
    () => shortNameFailure(shortName.trim() ? validateShortName(shortName, schools) : null),
    [shortName, schools],
  );

  const shortNameProblem = (reason: ShortNameReason): string => ({
    'too-short': t('Au moins 2 caractères.', 'Omwen 2 karaktè.'),
    'too-long': t('8 caractères au maximum.', '8 karaktè omaksimòm.'),
    charset: t('Lettres et chiffres seulement.', 'Sèlman lèt ak chif.'),
    taken: t('Une autre école utilise déjà ce nom court.', 'Yon lòt lekòl deja ap sèvi ak non kout sa a.'),
    reserved: t('Ce nom court est réservé.', 'Non kout sa a rezève.'),
  })[reason];

  const addProblem = (res: AddSchoolResult): string => {
    switch (res.reason) {
      case 'duplicate':
        return t(
          `${res.existing?.name} est déjà dans la liste — choisissez-la.`,
          `${res.existing?.name} deja nan lis la — chwazi l.`,
        );
      case 'short-name':
        return res.detail ? shortNameProblem(res.detail) : t('Nom court invalide.', 'Non kout pa bon.');
      case 'signed-out':
        return t('Connectez-vous d’abord.', 'Konekte anvan.');
      case 'invalid':
        return t('Écrivez le nom complet de l’école.', 'Ekri non konplè lekòl la.');
      default:
        return t('Impossible d’ajouter l’école pour le moment.', 'Nou pa ka ajoute lekòl la kounye a.');
    }
  };

  // A blank short name is fine; a broken one is not, because the service would
  // reject it after the student thinks they are done.
  const canAdd = newName.trim().length >= 4
    && commune.trim().length > 0
    && (!onboarding || departement.length > 0)
    && !shortNameBroken
    && !busy;

  const submitNew = async () => {
    setBusy(true);
    setProblem(null);
    const res = await addSchool({
      name: newName.trim(),
      commune,
      address,
      city,
      shortName,
      departement: departement || undefined,
    });
    setBusy(false);
    if (res.ok && res.school) {
      onPick({ key: res.school.key, label: res.school.name, departement: departement || null });
      setAdding(false);
      return;
    }
    setProblem(res);
  };

  if (picked) {
    return (
      <div className="arena-field">
        <span className="arena-field__label">
          <SchoolIcon size={15} aria-hidden="true" /> {t('Votre école', 'Lekòl ou')}
        </span>
        <div className="arena-field__picked">
          <span>{picked.label}</span>
          <button type="button" onClick={() => { onPick(null); setQuery(''); }}>
            {t('Changer', 'Chanje')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="arena-field">
      <label className="arena-field__label" htmlFor="arena-school">
        <SchoolIcon size={15} aria-hidden="true" /> {t('Votre école', 'Lekòl ou')}
      </label>
      {!adding && (
        <span className="arena-field__search">
          <Search size={15} aria-hidden="true" />
          <input
            id="arena-school"
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setProblem(null); }}
            placeholder={t('Tapez le nom de votre école…', 'Tape non lekòl ou…')}
            autoComplete="off"
            autoFocus={autoFocus}
          />
        </span>
      )}

      {!adding && matches.length > 0 && (
        <ul className="arena-field__results">
          {matches.map((s) => (
            <li key={s.key}>
              <button type="button" onClick={() => onPick({ key: s.key, label: s.name, departement: s.departement ?? null })}>
                <strong>{s.name}</strong>
                {/* Short name and commune, because the list holds schools whose
                    names differ only by where they are. */}
                {(s.shortName || s.commune) && (
                  <span>{[s.shortName, s.commune].filter(Boolean).join(' · ')}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Offered only once a search has actually come up short. */}
      {!adding && query.trim().length >= 4 && matches.length === 0 && (
        <button
          type="button"
          className="arena-field__add"
          onClick={() => { setNewName(query.trim()); setAdding(true); }}
        >
          <Plus size={15} aria-hidden="true" />
          {t('Ajouter « ', 'Ajoute « ')}{query.trim()}{t(' » à la liste', ' » nan lis la')}
        </button>
      )}

      {!adding && query.trim().length >= 2 && query.trim().length < 4 && matches.length === 0 && (
        <p className="arena-field__hint">
          {t('Continuez à taper le nom de l’école.', 'Kontinye tape non lekòl la.')}
        </p>
      )}

      {adding && (
        <div className="arena-add">
          {maybeSame && (
            <p className="arena-add__same">
              <AlertTriangle size={15} aria-hidden="true" />
              <span>
                {t('Est-ce plutôt ', 'Èske se pito ')}
                <button type="button" onClick={() => { onPick({ key: maybeSame.key, label: maybeSame.name }); setAdding(false); }}>
                  {maybeSame.name}
                </button>
                {t(' ? Une école en double partage ses points en deux.',
                  ' ? Yon lekòl an doub separe pwen li an de.')}
              </span>
            </p>
          )}

          <label className="arena-add__field">
            <span>{t('Nom complet de l’école', 'Non konplè lekòl la')}</span>
            <input
              type="text"
              value={newName}
              onChange={(e) => { setNewName(e.target.value); setProblem(null); }}
              placeholder={t('Ex. Lycée Toussaint Louverture', 'Egz. Lise Tousen Louvèti')}
              autoComplete="off"
            />
            <small>
              {t(
                'Écrivez-le comme votre école l’écrit — c’est le nom qui apparaîtra au classement.',
                'Ekri l jan lekòl ou ekri l — se non sa a k ap parèt nan klasman an.',
              )}
            </small>
          </label>

          {onboarding ? (
            <>
              <label className="arena-add__field">
                <span>{t('Département', 'Depatman')}</span>
                <select
                  value={departement}
                  onChange={(e) => { setDepartement(e.target.value); setCommune(''); setCommuneOther(false); }}
                >
                  <option value="">{t('Choisir…', 'Chwazi…')}</option>
                  {HAITI_DEPARTMENTS.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
                </select>
              </label>
              <label className="arena-add__field">
                <span>{t('Commune de l’école', 'Komin lekòl la')}</span>
                {communeOther || !departement || citiesOf(departement).length === 0 ? (
                  <input
                    type="text"
                    value={commune}
                    onChange={(e) => setCommune(e.target.value)}
                    placeholder={t('Ex. Delmas', 'Egz. Dèlma')}
                    autoComplete="off"
                    disabled={!departement}
                  />
                ) : (
                  <select
                    value={commune}
                    onChange={(e) => {
                      if (e.target.value === OTHER_CITY) { setCommuneOther(true); setCommune(''); }
                      else setCommune(e.target.value);
                    }}
                  >
                    <option value="">{t('Choisir…', 'Chwazi…')}</option>
                    {citiesOf(departement).map((c) => <option key={c} value={c}>{c}</option>)}
                    <option value={OTHER_CITY}>{t('Autre commune…', 'Lòt komin…')}</option>
                  </select>
                )}
              </label>
            </>
          ) : (
            <>
          <label className="arena-add__field">
            <span>{t('Commune de l’école', 'Komin lekòl la')}</span>
            <input
              type="text"
              value={commune}
              onChange={(e) => setCommune(e.target.value)}
              placeholder={t('Ex. Delmas', 'Egz. Dèlma')}
              autoComplete="off"
            />
          </label>

          <label className="arena-add__field">
            <span>{t('Ville', 'Vil')}</span>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder={t('Ex. Port-au-Prince', 'Egz. Pòtoprens')}
              autoComplete="off"
            />
          </label>

          <label className="arena-add__field">
            <span>{t('Nom court (facultatif)', 'Non kout (si w vle)')}</span>
            <input
              type="text"
              value={shortName}
              onChange={(e) => setShortName(e.target.value)}
              placeholder="CODOSA"
              autoComplete="off"
              maxLength={8}
            />
            {/* The name that goes on the tournament stage, so it comes from a
                student who knows it — never invented from the long name. */}
            <small>
              {shortNameBroken
                ? shortNameProblem(shortNameBroken)
                : t(
                  'Le nom que vos camarades utilisent. Laissez vide si vous n’êtes pas sûr.',
                  'Non kanmarad ou yo itilize. Kite l vid si w pa sèten.',
                )}
            </small>
          </label>

          <label className="arena-add__field">
            <span>{t('Adresse (facultatif)', 'Adrès (si w vle)')}</span>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={t('Rue, numéro…', 'Ri, nimewo…')}
              autoComplete="off"
            />
          </label>

            </>
          )}

          {problem && <p className="arena-page__error" role="alert">{addProblem(problem)}</p>}

          <p className="arena-field__hint">
            {/* A disabled button with no reason beside it reads as a broken
                page. Name the one thing that is missing. */}
            {newName.trim().length < 4
              ? t('Écrivez le nom complet de l’école.', 'Ekri non konplè lekòl la.')
              : onboarding && !departement
                ? t('Choisissez le département de l’école.', 'Chwazi depatman lekòl la.')
              : !commune.trim()
                ? t('Indiquez la commune de l’école.', 'Di nan ki komin lekòl la ye.')
                : shortNameBroken
                  ? t('Corrigez le nom court, ou laissez-le vide.', 'Korije non kout la, oswa kite l vid.')
                  : onboarding
                    ? t('Notre équipe vérifiera l’école ; vous pouvez continuer tout de suite.', 'Ekip nou an ap verifye lekòl la ; ou ka kontinye kounye a.')
                    : t(
                      'Votre école sera vérifiée par notre équipe. Vous pouvez vous inscrire tout de suite.',
                      'Ekip nou an ap verifye lekòl ou a. Ou ka enskri kounye a menm.',
                    )}
          </p>

          <div className="arena-add__actions">
            <button type="button" className="button button--ghost button--sm" onClick={() => { setAdding(false); setProblem(null); }}>
              {t('Retour', 'Tounen')}
            </button>
            <button type="button" className="button button--primary button--sm" disabled={!canAdd} onClick={submitNew}>
              <Check size={15} aria-hidden="true" />
              {busy ? t('Ajout…', 'Ap ajoute…') : t('Ajouter', 'Ajoute')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
