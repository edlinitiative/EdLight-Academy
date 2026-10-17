import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, X } from '../../icons';
import { ARENA_RULES, DUEL_RULES } from './rulesFacts';
import './trust.css';

type Variant = 'arena' | 'duel';

/**
 * The rules, in plain words, from the code that enforces them.
 *
 * Every number comes from rulesFacts.ts, which imports the scoring constants
 * from shared/arena/scoring.ts and pins the ones it must restate (claim
 * window, duel TTL and XP) to their api/ sources with a test. The tie-break
 * order is the order of `compareSchools` / `compareIndividuals` in
 * shared/arena/scoring.ts and of the `tie` test in api/challenges/accept.ts.
 *
 * A real dialog: focus moves in on open, Tab stays inside, Escape and the
 * backdrop close it, and focus returns to the button that opened it.
 */
export function RulesSheet({ open, onClose, variant, isCreole, teamSize, minPlayers }: {
  open: boolean;
  onClose: () => void;
  variant: Variant;
  isCreole: boolean;
  teamSize?: number;
  minPlayers?: number;
}) {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const titleId = useId();
  const panel = useRef<HTMLDivElement | null>(null);
  const closeBtn = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const before = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key !== 'Tab' || !panel.current) return;
      const f = panel.current.querySelectorAll<HTMLElement>('button, a[href], [tabindex]:not([tabindex="-1"])');
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      before?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const sec = (ms: number) => Math.round(ms / 1000);
  const team = teamSize || 5;
  const min = minPlayers || team;

  // Portalled to <body>: page sections create stacking contexts that would
  // otherwise put the phone tab bar on top of the sheet.
  return createPortal(
    <div className="trust-sheet" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="trust-sheet__panel" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={panel}>
        <div className="trust-sheet__head">
          <h2 id={titleId}>
            {variant === 'arena'
              ? t('Règles du championnat', 'Règ chanpyona a')
              : t('Comment le gagnant est décidé', 'Kijan nou deside kiyès ki genyen')}
          </h2>
          <button type="button" className="trust-iconbtn" onClick={onClose} ref={closeBtn} aria-label={t('Fermer', 'Fèmen')}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {variant === 'arena' ? (
          <div className="trust-sheet__body">
            <section>
              <h3>{t('Les points', 'Pwen yo')}</h3>
              <ul>
                <li><strong>{ARENA_RULES.pointsFull}</strong> {t(`bonne réponse en ${sec(ARENA_RULES.fullMs)} secondes ou moins`, `bon repons nan ${sec(ARENA_RULES.fullMs)} segonn oswa mwens`)}</li>
                <li><strong>{ARENA_RULES.pointsHalf}</strong> {t(`bonne réponse entre ${sec(ARENA_RULES.fullMs)} et ${sec(ARENA_RULES.halfMs)} secondes`, `bon repons ant ${sec(ARENA_RULES.fullMs)} ak ${sec(ARENA_RULES.halfMs)} segonn`)}</li>
                <li><strong>0</strong> {t(`mauvaise réponse, ou après ${sec(ARENA_RULES.halfMs)} secondes`, `move repons, oswa apre ${sec(ARENA_RULES.halfMs)} segonn`)}</li>
              </ul>
              <p>{t(
                `Ton chrono part quand la question s’affiche chez toi — au plus ${sec(ARENA_RULES.graceMs)} secondes après son ouverture, pour qu’une connexion lente ne te coûte pas. Il s’arrête quand le serveur reçoit ta réponse.`,
                `Kwonomèt ou kòmanse lè kesyon an parèt sou ekran ou — pi ta ${sec(ARENA_RULES.graceMs)} segonn apre li louvri, pou yon koneksyon ki lan pa koute w. Li kanpe lè sèvè a resevwa repons ou.`,
              )}</p>
              <p>{t(
                'Un seul clic compte, et il est définitif. Personne ne voit la bonne réponse ni les scores avant la fermeture de la question : tout le monde la découvre en même temps.',
                'Yon sèl klik konte, e li final. Pèsonn pa wè bon repons lan ni nòt yo anvan kesyon an fèmen : tout moun dekouvri l an menm tan.',
              )}</p>
            </section>
            <section>
              <h3>{t('Connexion et temps écoulé', 'Koneksyon ak tan ki fini')}</h3>
              <ul>
                <li>{t('« Réponse reçue ✓ » s’affiche seulement quand le serveur a confirmé. Avant, c’est « envoyée ».', '« Repons resevwa ✓ » parèt sèlman lè sèvè a konfime. Anvan sa, se « voye ».')}</li>
                <li>{t('Si le réseau coupe, ta réponse reste sur cet appareil et repart toute seule au retour. Renvoyer ne la compte jamais deux fois.', 'Si rezo a koupe, repons ou rete sou aparèy sa a epi l repati pou kont li lè l tounen. Voye l ankò pa janm fè l konte de fwa.')}</li>
                <li>{t('Une réponse qui arrive après la fermeture de la question ne compte pas.', 'Yon repons ki rive apre kesyon an fèmen pa konte.')}</li>
                <li>{t('Quitter l’onglet est noté pour la vérification, mais ne bloque jamais ta réponse.', 'Lè w kite onglè a, nou note l pou verifikasyon, men sa pa janm bloke repons ou.')}</li>
              </ul>
            </section>
            <section>
              <h3>{t('Le classement des écoles', 'Klasman lekòl yo')}</h3>
              <p>{t(
                `Une école est classée si au moins ${min} de ses élèves sont présents dans la salle quand elle se ferme, juste avant la première question. Son score est la moyenne de ses ${team} meilleurs joueurs. Une école non classée joue quand même : tes points comptent en individuel.`,
                `Yon lekòl klase si omwen ${min} nan elèv li yo prezan nan sal la lè l fèmen, jis anvan premye kesyon an. Nòt li se mwayèn ${team} pi bon jwè li yo. Yon lekòl ki pa klase jwe kanmenm : pwen ou yo konte pou klasman endividyèl.`,
              )}</p>
              <p><strong>{t('En cas d’égalité, dans l’ordre :', 'Si gen egalite, nan lòd sa a :')}</strong></p>
              <ol>
                <li>{t('la meilleure moyenne d’équipe ;', 'pi bon mwayèn ekip la ;')}</li>
                <li>{t(`le temps total le plus court des ${team} qui comptent ;`, `tan total ki pi kout pou ${team} ki konte yo ;`)}</li>
                <li>{t('le plus de bonnes réponses parmi eux ;', 'plis bon repons pami yo ;')}</li>
                <li>{t('l’école qualifiée la première.', 'lekòl ki kalifye an premye a.')}</li>
              </ol>
              <p><strong>{t('Classement individuel :', 'Klasman endividyèl :')}</strong> {t(
                'le score, puis le temps total le plus court, puis le plus de réponses à 1000 points, puis l’inscription la plus ancienne. Égalité parfaite sur les quatre = même rang.',
                'nòt la, apre tan total ki pi kout, apre plis repons a 1000 pwen, apre enskripsyon ki pi ansyen. Egalite total sou kat yo = menm plas.',
              )}</p>
            </section>
            <section>
              <h3>{t('Provisoire, puis définitif', 'Pwovizwa, apre definitif')}</h3>
              <ul>
                <li><strong>{t('Résultats provisoires', 'Rezilta pwovizwa')}</strong> — {t(
                  'calculés juste après la dernière question. Ils sont vérifiés (réponses impossibles ou trop rapides, changements d’appareil). Un compte écarté libère sa place : les rangs peuvent encore bouger.',
                  'kalkile touswit apre dènye kesyon an. Nou verifye yo (repons enposib oswa twò rapid, chanjman aparèy). Yon kont nou retire libere plas li : plas yo ka toujou chanje.',
                )}</li>
                <li><strong>{t('Résultats définitifs', 'Rezilta definitif')}</strong> — {t(
                  'la vérification est terminée et les prix sont versés. Plus rien ne change.',
                  'verifikasyon an fini e nou peye pri yo. Anyen pa chanje ankò.',
                )}</li>
                <li>{t(
                  `Un gagnant a ${ARENA_RULES.claimHours} heures pour réclamer son prix ; ensuite il passe au suivant.`,
                  `Yon gayan gen ${ARENA_RULES.claimHours} èdtan pou reklame pri li ; apre sa li pase bay moun ki vin apre a.`,
                )}</li>
                <li>{t('Un résultat te semble faux ? Signale-le pendant la période provisoire, avec l’heure et la question.', 'Ou panse yon rezilta pa bon ? Siyale l pandan peryòd pwovizwa a, ak lè a ak kesyon an.')}</li>
              </ul>
            </section>
          </div>
        ) : (
          <div className="trust-sheet__body">
            <section>
              <ul>
                <li>{t(
                  `Les mêmes ${DUEL_RULES.questions} questions, dans le même ordre, que celles de ton ami.`,
                  `Menm ${DUEL_RULES.questions} kesyon yo, nan menm lòd, ak sa zanmi ou te jwe yo.`,
                )}</li>
                <li>{t(
                  `${DUEL_RULES.secondsPerQuestion} secondes par question. Sans réponse à la fin du chrono, la question compte comme fausse.`,
                  `${DUEL_RULES.secondsPerQuestion} segonn pa kesyon. Si w pa reponn lè kwonomèt la fini, kesyon an konte kòm fo.`,
                )}</li>
                <li>{t(
                  'Un seul essai : le serveur n’accepte qu’un score par défi, le premier envoyé.',
                  'Yon sèl tantativ : sèvè a aksepte yon sèl nòt pa defi, premye a ki voye.',
                )}</li>
                <li>{t(
                  `Le score, c’est le nombre de bonnes réponses. Le plus grand gagne +${DUEL_RULES.winXp} XP.`,
                  `Nòt la se kantite bon repons. Pi gwo a genyen +${DUEL_RULES.winXp} XP.`,
                )}</li>
                <li>{t(
                  `Même score = égalité : +${DUEL_RULES.tieXp} XP chacun. La vitesse ne départage pas.`,
                  `Menm nòt = egalite : +${DUEL_RULES.tieXp} XP chak. Vitès pa depataje.`,
                )}</li>
                <li>{t(
                  `Un défi expire ${DUEL_RULES.ttlDays} jours après sa création. Expiré, il ne se joue plus.`,
                  `Yon defi ekspire ${DUEL_RULES.ttlDays} jou apre li kreye. Lè l ekspire, li pa jwe ankò.`,
                )}</li>
                <li>{t(
                  'Ton ami voit ton score sur la page du défi, et reçoit une notification s’il a l’application.',
                  'Zanmi ou wè nòt ou sou paj defi a, e li resevwa yon notifikasyon si l gen aplikasyon an.',
                )}</li>
              </ul>
            </section>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** The trigger + its sheet. */
export default function RulesButton({ variant, isCreole, teamSize, minPlayers, label }: {
  variant: Variant;
  isCreole: boolean;
  teamSize?: number;
  minPlayers?: number;
  label?: string;
}) {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button type="button" className="trust-link" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <HelpCircle size={16} aria-hidden="true" />
        {label || (variant === 'arena' ? t('Règles', 'Règ yo') : t('Comment le gagnant est décidé', 'Kijan nou deside kiyès ki genyen'))}
      </button>
      <RulesSheet open={open} onClose={close} variant={variant} isCreole={isCreole} teamSize={teamSize} minPlayers={minPlayers} />
    </>
  );
}
