/**
 * "Défi d'un ami" — the web's duel surfaces.
 *
 *   DuelShareSheet  copy link / WhatsApp / native share for a minted duel
 *   DuelPanel       end of a trivia round: mint the duel from THIS round, or,
 *                   when the round can't be replayed faithfully, start one
 *                   that can
 *   MyDuels         /jeux: the duels you sent and the ones you opened
 *
 * Server-authoritative throughout (services/challengeWebService.ts): the web
 * mints and reports, it never decides an outcome.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import CategoryIcon from '../CategoryIcon';
import { Copy, Check, Send, Share2, Swords, Trophy, Clock, ChevronRight, LogIn, Link as LinkIcon } from '../icons';
import useStore from '../../contexts/store';
import { TRIVIA_CATEGORIES } from '../../data/triviaData';
import { canNativeShare } from '../../utils/schoolInvite';
import { trackEvent } from '../../utils/telemetry';
import { loadDuelBank } from '../../utils/duelBank';
import {
  duelShareMessage, duelState, duelUrl, idxsInBank, isDuelCode, normalizeDuelCode, outcomeFor,
  sortDuels, uniqueByCode, whatsappUrl, type DuelQuestion,
} from '../../utils/duels';
import {
  createChallenge, listMyChallenges, listReceivedChallenges, referralCodeForShare, type Challenge,
} from '../../services/challengeWebService';
import { DuelMintReceipt, RulesButton } from '../arena/trust';
import Avatar from '../../arena-art/avatars/Avatar';
import './duels.css';

export function categoryLabel(id: string, isCreole: boolean): string {
  const c: any = (TRIVIA_CATEGORIES as any[]).find((x) => x.id === id);
  if (!c) return id;
  return isCreole ? c.nameHt || c.name : c.name;
}

/* ─── Share sheet ───────────────────────────────────────────────────────── */

export function DuelShareSheet({ code, categoryId, score, total, isCreole, where }: {
  code: string;
  categoryId: string;
  score: number;
  total: number;
  isCreole: boolean;
  where: string;
}) {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const url = duelUrl(code);
  const [ref, setRef] = useState<string | null | undefined>(undefined);
  const [copied, setCopied] = useState<'link' | 'code' | null>(null);

  useEffect(() => {
    let live = true;
    referralCodeForShare().then((c) => { if (live) setRef(c); });
    return () => { live = false; };
  }, []);

  const message = duelShareMessage({
    categoryLabel: categoryLabel(categoryId, isCreole), score, total, url, referralCode: ref ?? null, isCreole,
  });

  const copy = async (what: 'link' | 'code') => {
    trackEvent('duel_share', { channel: `copy-${what}`, where });
    try {
      await navigator.clipboard.writeText(what === 'link' ? url : code);
      setCopied(what);
      setTimeout(() => setCopied(null), 2200);
    } catch {
      /* clipboard blocked — the link is selectable in the field */
    }
  };
  const nativeShare = async () => {
    trackEvent('duel_share', { channel: 'native', where });
    try { await navigator.share({ text: message }); } catch { /* dismissed */ }
  };

  return (
    <div className="duel-sheet">
      <label className="duel-sheet__label" htmlFor={`duel-link-${code}`}>{t('Lien du défi', 'Lyen defi a')}</label>
      <div className="duel-sheet__linkrow">
        <input
          id={`duel-link-${code}`}
          className="duel-sheet__link"
          value={url}
          readOnly
          onFocus={(e) => e.currentTarget.select()}
        />
        <button type="button" className="duel-pill duel-pill--soft" onClick={() => copy('link')}>
          {copied === 'link' ? <Check size={16} /> : <Copy size={16} />}
          {copied === 'link' ? t('Copié', 'Kopye') : t('Copier', 'Kopye')}
        </button>
      </div>
      <div className="duel-sheet__actions">
        <a
          className="duel-pill duel-pill--primary"
          href={whatsappUrl(message)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackEvent('duel_share', { channel: 'whatsapp', where })}
        >
          <Send size={16} /> {t('Envoyer sur WhatsApp', 'Voye sou WhatsApp')}
        </a>
        {canNativeShare() && (
          <button type="button" className="duel-pill duel-pill--soft" onClick={nativeShare}>
            <Share2 size={16} /> {t('Partager', 'Pataje')}
          </button>
        )}
      </div>
      <p className="duel-sheet__code">
        {t('Code', 'Kòd')} <strong translate="no">{code}</strong>
        <button type="button" className="duel-link" onClick={() => copy('code')}>
          {copied === 'code' ? t('copié', 'kopye') : t('copier', 'kopye')}
        </button>
      </p>
    </div>
  );
}

/* ─── End of a round ────────────────────────────────────────────────────── */

/**
 * Mint a duel from the round just played — but only when the opponent can
 * replay EXACTLY those questions. A round drawn from the web's bigger bank
 * usually can't be (utils/duels.ts explains why), and then the honest offer
 * is a fresh duel round, not a duel over questions the friend will never see.
 */
export function DuelPanel({ category, played, score, total, isAuthed, isCreole, onStartDuelRound, onPickDuel, primary = true }: {
  category: string;
  played: DuelQuestion[];
  score: number;
  total: number;
  isAuthed: boolean;
  isCreole: boolean;
  onStartDuelRound: (categoryId: string) => void;
  onPickDuel: () => void;
  /** False when the results screen already has its one coral action (Rejouer). */
  primary?: boolean;
}) {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const pill = `duel-pill ${primary ? 'duel-pill--primary' : 'duel-pill--soft'}`;
  const toggleAuthModal = useStore((s) => s.toggleAuthModal);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const singleTheme = !!category && category !== 'daily' && category !== 'mixed';
  // undefined = still checking, null = this round can't become a duel
  const [idxs, setIdxs] = useState<number[] | null | undefined>(singleTheme ? undefined : null);
  const [hasBank, setHasBank] = useState(false);
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ code: string } | null>(null);

  useEffect(() => {
    if (!singleTheme || !isAuthed) return;
    let live = true;
    loadDuelBank()
      .then((bank) => {
        if (!live) return;
        setHasBank((bank[category] || []).length > 0);
        setIdxs(idxsInBank(bank[category], played));
      })
      .catch(() => { if (live) setIdxs(null); });
    return () => { live = false; };
    // Guests only see "sign in", so they never download the duel bank.
  }, [category, played, singleTheme, isAuthed]);

  const mint = useCallback(async () => {
    if (!idxs) return;
    setState('busy');
    setError(null);
    const r = await createChallenge({ categoryId: category, questionIdxs: idxs, score });
    if (r.ok && r.challenge) {
      setCreated({ code: r.challenge.code });
      setState('idle');
      trackEvent('duel_created', { category, score, total, where: 'trivia-results' });
    } else {
      setState('error');
      setError(r.error === 'rate_limit_exceeded'
        ? t('Trop de défis d’un coup. Réessaie dans quelques minutes.', 'Twòp defi yon sèl kou. Eseye ankò nan kèk minit.')
        : r.error === 'auth'
          ? t('Reconnecte-toi pour lancer le défi.', 'Rekonekte pou w voye defi a.')
          : t('Le défi n’est pas parti. Vérifie ta connexion et réessaie.', 'Defi a pa t pati. Verifye koneksyon ou epi eseye ankò.'));
    }
  }, [idxs, category, score, total, isCreole]); // eslint-disable-line react-hooks/exhaustive-deps

  const signIn = () => { setActiveTab?.('signin'); toggleAuthModal(); };

  return (
    <section className="duel-panel" aria-labelledby="duel-panel-title">
      <div className="duel-panel__head">
        <span className="duel-panel__icon" aria-hidden="true"><Swords size={18} /></span>
        <div>
          <h3 id="duel-panel-title" className="duel-panel__title">{t('Défier un ami', 'Defye yon zanmi')}</h3>
          <p className="duel-panel__sub">
            {created
              ? t(`Ton ami joue les mêmes ${total} questions, un seul essai. Le meilleur score gagne +20 XP.`, `Zanmi ou ap jwe menm ${total} kesyon yo, yon sèl tantativ. Pi gwo nòt la genyen +20 XP.`)
              : idxs
                ? t(`Envoie ces ${total} questions à un ami : il doit battre ton ${score}/${total} en un seul essai.`, `Voye ${total} kesyon sa yo bay yon zanmi : li dwe bat ${score}/${total} ou a nan yon sèl tantativ.`)
                : t('Un défi, ce sont 10 questions qu’un ami rejoue à l’identique, 15 secondes chacune, un seul essai.', 'Yon defi se 10 kesyon yon zanmi ap rejwe egzakteman, 15 segonn chak, yon sèl tantativ.')}
          </p>
        </div>
      </div>

      {created ? (
        <DuelShareSheet code={created.code} categoryId={category} score={score} total={total} isCreole={isCreole} where="trivia-results" />
      ) : !isAuthed ? (
        <div className="duel-panel__actions">
          <button type="button" className={pill} onClick={signIn}>
            <LogIn size={16} /> {t('Se connecter pour défier', 'Konekte pou defye')}
          </button>
        </div>
      ) : idxs === undefined ? (
        <p className="duel-panel__note" role="status">{t('Préparation du défi…', 'N ap prepare defi a…')}</p>
      ) : idxs ? (
        <div className="duel-panel__actions">
          <button type="button" className={pill} onClick={mint} disabled={state === 'busy'}>
            <Swords size={16} /> {state === 'busy' ? t('Création…', 'N ap kreye…') : t('Défier un ami', 'Defye yon zanmi')}
          </button>
        </div>
      ) : singleTheme && hasBank ? (
        <div className="duel-panel__actions">
          <p className="duel-panel__note">
            {t('Cette partie ne peut pas être rejouée à l’identique par un ami. Lance une manche défi sur ce thème, puis envoie-la.', 'Pati sa a pa ka rejwe egzakteman pa yon zanmi. Lanse yon pati defi sou tèm sa a, epi voye l.')}
          </p>
          <button type="button" className={pill} onClick={() => onStartDuelRound(category)}>
            <Swords size={16} /> {t('Jouer une manche défi', 'Jwe yon pati defi')}
          </button>
        </div>
      ) : (
        <div className="duel-panel__actions">
          <p className="duel-panel__note">
            {t('Un défi se joue sur un seul thème.', 'Yon defi jwe sou yon sèl tèm.')}
          </p>
          <button type="button" className={pill} onClick={onPickDuel}>
            <Swords size={16} /> {t('Choisir un thème pour défier', 'Chwazi yon tèm pou defye')}
          </button>
        </div>
      )}
      {state === 'error' && error && <p className="duel-panel__error" role="alert">{error}</p>}
      {created && <DuelMintReceipt isCreole={isCreole} />}
    </section>
  );
}

/* ─── /jeux: the entry point and "Mes défis" ────────────────────────────── */

function DuelRow({ c, uid, isCreole }: { c: Challenge; uid: string; isCreole: boolean }) {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const state = duelState(c, uid);
  const mine = c.challengerUid === uid;
  const outcome = outcomeFor(c, uid);
  const other = mine
    ? (c.opponent?.name || (c.opponent ? t('Un ami', 'Yon zanmi') : null))
    : (c.challengerName || t('Un ami', 'Yon zanmi'));
  // The other student's face (their uid seeds the same generated avatar
  // everywhere); before anyone has played a sent duel, the theme's icon.
  const otherUid: string | null = mine ? c.opponent?.uid || null : c.challengerUid || null;
  const myScore = mine ? c.challengerScore : c.opponent?.uid === uid ? c.opponent.score : null;
  const theirScore = mine ? c.opponent?.score ?? null : c.challengerScore;

  let status: React.ReactNode;
  if (state === 'to-play') status = <span className="duel-chip duel-chip--azure">{t('À toi de jouer', 'Se tou pa w')}</span>;
  else if (state === 'waiting') status = <span className="duel-chip duel-chip--slate">{t('En attente', 'Ap tann')}</span>;
  else if (state === 'expired') status = <span className="duel-chip duel-chip--slate">{t('Expiré', 'Ekspire')}</span>;
  else if (state === 'taken') status = <span className="duel-chip duel-chip--slate">{t('Déjà relevé', 'Deja jwe')}</span>;
  else if (outcome === 'won') status = <span className="duel-chip duel-chip--green">{t('Gagné', 'Genyen')}</span>;
  else if (outcome === 'lost') status = <span className="duel-chip duel-chip--rose">{t('Perdu', 'Pèdi')}</span>;
  else status = <span className="duel-chip duel-chip--amber">{t('Égalité', 'Egalite')}</span>;

  const line = mine
    ? other
      ? t(`Envoyé · contre ${other}`, `Voye · kont ${other}`)
      : t('Envoyé · personne n’a encore joué', 'Voye · pèsonn poko jwe')
    : t(`Reçu · de ${other}`, `Resevwa · nan men ${other}`);

  return (
    <li>
      <Link to={`/defi/${c.code}`} className="duel-row">
        <span className="duel-row__icon" aria-hidden="true">
          {otherUid ? <Avatar seed={otherUid} size={40} still /> : <CategoryIcon id={c.categoryId} size={18} />}
        </span>
        <span className="duel-row__body">
          <span className="duel-row__title">{categoryLabel(c.categoryId, isCreole)}</span>
          <span className="duel-row__line">{line}</span>
        </span>
        <span className="duel-row__score" translate="no">
          {myScore != null ? myScore : '–'} <span aria-hidden="true">·</span> {theirScore != null ? theirScore : '–'}
          <span className="duel-row__total">/{c.total}</span>
        </span>
        {status}
        <ChevronRight size={16} aria-hidden="true" />
      </Link>
    </li>
  );
}

export function MyDuels({ isCreole }: { isCreole: boolean }) {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const navigate = useNavigate();
  const user = useStore((s) => s.user);
  const toggleAuthModal = useStore((s) => s.toggleAuthModal);
  const uid: string | null = user?.uid || null;
  const [duels, setDuels] = useState<Challenge[] | null>(null);
  const [code, setCode] = useState('');
  const clean = normalizeDuelCode(code);

  useEffect(() => {
    if (!uid) { setDuels(null); return; }
    let live = true;
    Promise.all([listMyChallenges(20), listReceivedChallenges(uid)])
      .then(([sent, received]) => { if (live) setDuels(sortDuels(uniqueByCode([...received, ...sent]), uid)); })
      .catch(() => { if (live) setDuels([]); });
    return () => { live = false; };
  }, [uid]);

  const toPlay = (duels || []).filter((c) => duelState(c, uid) === 'to-play').length;

  return (
    <section className="gx-card duel-hub" aria-labelledby="duel-title">
      <div className="duel-hub__head">
        <span className="pf-tile pf-tile--sm pf-tile--violet" aria-hidden="true"><Swords size={15} /></span>
        <div className="gx-card__body">
          <h2 id="duel-title" className="gx-card__title gx-card__title--sm">{t('Défi d’un ami — 1 contre 1', 'Defi yon zanmi — 1 kont 1')}</h2>
          <p className="gx-card__text">{t('Joue 10 questions, puis envoie exactement les mêmes à un ami : un seul essai, 15 secondes par question, le meilleur score gagne +20 XP.', 'Jwe 10 kesyon, epi voye egzakteman menm yo bay yon zanmi : yon sèl tantativ, 15 segonn pa kesyon, pi gwo nòt la genyen +20 XP.')}</p>
        </div>
      </div>
      <div className="duel-hub__actions">
        <button
          type="button"
          className="duel-pill duel-pill--primary"
          onClick={() => { trackEvent('duel_entry', { where: 'jeux' }); navigate('/jeux/trivia', { state: { duelPick: true } }); }}
        >
          <Swords size={16} /> {t('Lance une partie, puis défie un ami', 'Lanse yon pati, epi defye yon zanmi')}
        </button>
        <form
          className="duel-hub__code"
          onSubmit={(e) => { e.preventDefault(); if (isDuelCode(clean)) navigate(`/defi/${clean}`); }}
        >
          <label className="duel-sr-only" htmlFor="duel-code-input">{t('Code d’un défi reçu', 'Kòd yon defi ou resevwa')}</label>
          <input
            id="duel-code-input"
            className="duel-hub__input"
            placeholder={t('J’ai un code', 'Mwen gen yon kòd')}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            maxLength={12}
          />
          <button type="submit" className="duel-pill duel-pill--soft" disabled={!isDuelCode(clean)}>
            <LinkIcon size={16} /> {t('Ouvrir', 'Louvri')}
          </button>
        </form>
      </div>

      <div className="duel-hub__list">
        <h3 className="duel-hub__subtitle">
          {t('Mes défis', 'Defi mwen yo')}
          {toPlay > 0 && <span className="duel-chip duel-chip--azure">{toPlay} {t('à jouer', 'pou jwe')}</span>}
        </h3>
        {!uid ? (
          <p className="gx-card__text">
            {t('Connecte-toi pour lancer un défi et suivre tes résultats.', 'Konekte pou lanse yon defi epi swiv rezilta ou.')}{' '}
            <button type="button" className="duel-link" onClick={toggleAuthModal}>{t('Se connecter', 'Konekte')}</button>
          </p>
        ) : duels === null ? (
          <p className="gx-card__text" role="status">{t('Chargement…', 'N ap chaje…')}</p>
        ) : duels.length === 0 ? (
          <p className="gx-card__text">{t('Aucun défi pour l’instant. Lance le premier !', 'Poko gen defi. Lanse premye a !')}</p>
        ) : (
          <ul className="duel-list">
            {duels.slice(0, 12).map((c) => <DuelRow key={c.code} c={c} uid={uid} isCreole={isCreole} />)}
          </ul>
        )}
      </div>
      <div className="trust-row"><RulesButton variant="duel" isCreole={isCreole} /></div>
    </section>
  );
}

/* ─── Head-to-head scoreboard (Defi page result) ────────────────────────── */

export function DuelScoreboard({ leftName, leftScore, rightName, rightScore, total, isCreole, leftSeed = null, rightSeed = null }: {
  /** Stable ids (uids) for the two students' generated faces. */
  leftSeed?: string | null;
  rightSeed?: string | null;
  leftName: string;
  leftScore: number | null;
  rightName: string;
  rightScore: number | null;
  total: number;
  isCreole: boolean;
}) {
  const leftWins = leftScore != null && rightScore != null && leftScore > rightScore;
  const rightWins = leftScore != null && rightScore != null && rightScore > leftScore;
  return (
    <div className="duel-board" role="group" aria-label={isCreole ? 'Rezilta defi a' : 'Résultat du défi'}>
      <div className={`duel-board__side${leftWins ? ' is-win' : ''}`}>
        {leftSeed && <span className="duel-board__face" aria-hidden="true"><Avatar seed={leftSeed} size={56} mood={leftWins ? 'celebrating' : 'idle'} still /></span>}
        <span className="duel-board__name">{leftName}</span>
        <span className="duel-board__score" translate="no">{leftScore ?? '–'}<small>/{total}</small></span>
        {leftWins && <span className="duel-board__crown"><Trophy size={14} /> {isCreole ? 'Genyen' : 'Gagnant'}</span>}
      </div>
      <span className="duel-board__vs" aria-hidden="true">{isCreole ? 'kont' : 'contre'}</span>
      <div className={`duel-board__side${rightWins ? ' is-win' : ''}`}>
        {rightSeed && <span className="duel-board__face" aria-hidden="true"><Avatar seed={rightSeed} size={56} mood={rightWins ? 'celebrating' : 'idle'} still /></span>}
        <span className="duel-board__name">{rightName}</span>
        <span className="duel-board__score" translate="no">{rightScore ?? <Clock size={22} />}{rightScore != null && <small>/{total}</small>}</span>
        {rightWins && <span className="duel-board__crown"><Trophy size={14} /> {isCreole ? 'Genyen' : 'Gagnant'}</span>}
      </div>
    </div>
  );
}
