import React, { useEffect, useRef, useState } from 'react';
import OpponentReveal, { MatchPhase } from './OpponentReveal';
import ReadyCountdown, { Beat, BeatInfo } from './ReadyCountdown';
import TrophyCeremony, { ResultStatus, TrophyCeremonyHandle } from './TrophyCeremony';
import {
  CEREMONY_STATES, CEREMONY_TIMING, COUNTDOWN_STATES, REVEAL_STATES, REVEAL_TIMING,
} from './machines';
import { MotionPlayer, useReduced, useT } from './shared';
import { DUR } from './tokens';
import './motion.css';
import './showcase.css';

/* Demo data — invented people and schools, labelled "Démo" on screen. */
const ME: MotionPlayer = {
  name: 'Naïka Pierre', school: 'Lycée des Palmiers', seed: 'demo-naika',
  colors: { primary: '#2F7BFF', secondary: '#FFD23F' },
};
const OPPONENT: MotionPlayer = {
  name: 'Jean-Wilson Dorvil', school: 'Collège Morne Bleu', seed: 'demo-jeanwilson',
  colors: { primary: '#E0465E', secondary: '#F5F8FF' },
};
const WINNER = {
  name: 'Lycée des Palmiers', colors: ME.colors, points: 412,
  roster: ['Naïka Pierre', 'Samuel Joseph', 'Daphnée Louis', 'Ricardo Étienne', 'Mirlande Charles'],
};
const TIED = [
  { name: 'Lycée des Palmiers', colors: ME.colors, points: 412 },
  { name: 'Collège Morne Bleu', colors: OPPONENT.colors, points: 412 },
];
const DEMO_MATCH_AFTER_MS = 2600;

function Frame({ title, sub, states, current, children, controls, aside }: {
  title: string; sub: string; states: string[]; current: string;
  children: React.ReactNode; controls: React.ReactNode; aside?: React.ReactNode;
}) {
  const t = useT();
  return (
    <article className="mo-frame">
      <header className="mo-frame__head">
        <div className="mo-frame__titles">
          <h3 className="mo-frame__title">{title} <span className="mo-chip mo-chip--demo">{t('Démo', 'Demo')}</span></h3>
          <p className="mo-frame__sub">{sub}</p>
        </div>
      </header>
      <ol className="mo-frame__states" aria-label={t('États de la machine', 'Eta machin nan')}>
        {states.map((s) => (
          <li key={s} className={s === current ? 'is-on' : undefined} aria-current={s === current ? 'step' : undefined}>{s}</li>
        ))}
      </ol>
      <div className="mo-frame__stage">{children}</div>
      <div className="mo-frame__controls">{controls}</div>
      {aside}
    </article>
  );
}

function RevealDemo({ reduced }: { reduced: boolean }) {
  const t = useT();
  const [phase, setPhase] = useState<MatchPhase>('idle');
  const [state, setState] = useState('idle');
  const timer = useRef(0);
  const clear = () => window.clearTimeout(timer.current);
  useEffect(() => clear, []);
  const go = (p: MatchPhase) => {
    clear();
    setPhase(p);
    // Demo server: a match is found 2.6 s after a search begins.
    if (p === 'searching') timer.current = window.setTimeout(() => setPhase('matched'), DEMO_MATCH_AFTER_MS);
  };
  const searching = state === 'searching';
  const matched = state === 'found' || state === 'introduce' || state === 'settled';
  return (
    <Frame
      title={t('Révélation de l’adversaire', 'Revelasyon advèsè a')}
      sub={t(
        `Le serveur de démo trouve un adversaire après ${DEMO_MATCH_AFTER_MS / 1000} s. Arrivée : ${REVEAL_TIMING.found + REVEAL_TIMING.introduce} ms.`,
        `Sèvè demo a jwenn yon advèsè apre ${DEMO_MATCH_AFTER_MS / 1000} s. Antre : ${REVEAL_TIMING.found + REVEAL_TIMING.introduce} ms.`,
      )}
      states={REVEAL_STATES}
      current={state}
      controls={(
        <>
          <button type="button" className="mo-btn mo-btn--primary" disabled={searching || matched} onClick={() => go('searching')}>
            {t('Chercher', 'Chèche')}
          </button>
          <button type="button" className="mo-btn mo-btn--ghost" disabled={!searching} onClick={() => go('cancelled')}>{t('Annuler', 'Anile')}</button>
          <button type="button" className="mo-btn mo-btn--ghost" disabled={!searching} onClick={() => go('failed')}>{t('Échec', 'Echèk')}</button>
          <button type="button" className="mo-btn mo-btn--ghost" disabled={!(state === 'found' || state === 'introduce')} onClick={() => go('started')}>
            {t('Le match démarre', 'Match la kòmanse')}
          </button>
          <button type="button" className="mo-btn mo-btn--ghost" onClick={() => go('idle')}>{t('Réinitialiser', 'Reyinisyalize')}</button>
        </>
      )}
    >
      <OpponentReveal
        me={ME} opponent={OPPONENT} phase={phase} reducedMotion={reduced}
        onCancel={() => go('cancelled')} onRetry={() => go('searching')} onStateChange={setState}
      />
    </Frame>
  );
}

function CountdownDemo({ reduced }: { reduced: boolean }) {
  const t = useT();
  const [startsAt, setStartsAt] = useState<number | null>(null);
  const [state, setState] = useState('idle');
  const [log, setLog] = useState<Array<{ beat: Beat; info: BeatInfo; id: number }>>([]);
  const n = useRef(0);
  const start = (inMs: number) => { setLog([]); setStartsAt(Date.now() + inMs); };
  const beatName: Record<Beat, string> = { three: '3', two: '2', one: '1', go: t('Partez', 'Ale') };
  return (
    <Frame
      title={t('Compte à rebours', 'Konte a rebou')}
      sub={t('Calculé depuis l’horloge : il ne dérive jamais, même si l’onglet est ralenti.', 'Kalkile apati lè a : li pa janm dekale, menm si onglè a ralanti.')}
      states={COUNTDOWN_STATES}
      current={state}
      controls={(
        <>
          <button type="button" className="mo-btn mo-btn--primary" onClick={() => start(5000)}>{t('Démarrer (dans 5 s)', 'Kòmanse (nan 5 s)')}</button>
          <button type="button" className="mo-btn mo-btn--ghost" onClick={() => start(1500)}>{t('Arrivée en retard', 'Rive an reta')}</button>
          <button type="button" className="mo-btn mo-btn--ghost" disabled={startsAt == null} onClick={() => setStartsAt(null)}>{t('Arrêter', 'Kanpe')}</button>
        </>
      )}
      aside={(
        <ul className="mo-frame__log" aria-label={t('Battements reçus par onBeat', 'Bat onBeat resevwa')}>
          {log.length === 0 && <li className="is-empty">{t('onBeat : aucun battement pour l’instant', 'onBeat : poko gen bat')}</li>}
          {log.map((l) => (
            <li key={l.id} className={l.info.stale ? 'is-stale' : undefined}>
              <b>{beatName[l.beat]}</b>
              {l.info.stale
                ? t(` · en retard de ${Math.round(l.info.lateMs)} ms, son ignoré`, ` · an reta ${Math.round(l.info.lateMs)} ms, son an sote`)
                : t(` · à l’heure (${Math.round(l.info.lateMs)} ms)`, ` · alè (${Math.round(l.info.lateMs)} ms)`)}
            </li>
          ))}
        </ul>
      )}
    >
      <ReadyCountdown
        startsAt={startsAt} reducedMotion={reduced} onStateChange={setState}
        onBeat={(beat, info) => { n.current += 1; const id = n.current; setLog((l) => [...l, { beat, info, id }].slice(-6)); }}
      />
    </Frame>
  );
}

function CeremonyDemo({ reduced }: { reduced: boolean }) {
  const t = useT();
  const ref = useRef<TrophyCeremonyHandle>(null);
  const [status, setStatus] = useState<ResultStatus>('pending');
  const [state, setState] = useState('waiting');
  const [mount, setMount] = useState({ key: 0, resume: false });
  const cosmetic = ['dark', 'anticipation', 'reveal', 'roster'].includes(state);
  const total = Object.values(CEREMONY_TIMING).reduce((a, b) => a + b, 0);
  const startCeremony = () => {
    if (status === 'confirmed') ref.current?.replay();
    else setStatus('confirmed');
  };
  return (
    <Frame
      title={t('Cérémonie du trophée', 'Seremoni twofe a')}
      sub={t(
        `${total / 1000} s, interruptible. Provisoire et égalité ne lancent jamais la révélation du vainqueur.`,
        `${total / 1000} s, ka entewonp. Pwovizwa ak egalite pa janm lanse revelasyon gayan an.`,
      )}
      states={CEREMONY_STATES}
      current={state}
      controls={(
        <>
          <button type="button" className="mo-btn mo-btn--primary" disabled={cosmetic} onClick={startCeremony}>
            {t('Lancer la cérémonie', 'Lanse seremoni an')}
          </button>
          <button type="button" className="mo-btn mo-btn--ghost" onClick={() => setStatus('provisional')}>{t('Provisoire', 'Pwovizwa')}</button>
          <button type="button" className="mo-btn mo-btn--ghost" onClick={() => setStatus('tie')}>{t('Égalité', 'Egalite')}</button>
          <button type="button" className="mo-btn mo-btn--ghost" disabled={!cosmetic} onClick={() => ref.current?.skip()}>{t('Passer', 'Sote')}</button>
          <button type="button" className="mo-btn mo-btn--ghost" disabled={state !== 'settled'} onClick={() => ref.current?.replay()}>{t('Rejouer', 'Rejwe')}</button>
          <button
            type="button" className="mo-btn mo-btn--ghost" disabled={status !== 'confirmed'}
            onClick={() => setMount((m) => ({ key: m.key + 1, resume: true }))}
          >
            {t('Reconnexion', 'Rekonekte')}
          </button>
        </>
      )}
    >
      <TrophyCeremony
        key={mount.key}
        ref={ref}
        event={{
          title: t('Championnat national de l’Arène', 'Chanpyona nasyonal Arèn nan'),
          subtitle: t('Finale · 2026', 'Final · 2026'),
          year: '2026',
        }}
        winner={WINNER}
        tied={TIED}
        status={status}
        resume={mount.resume}
        demo
        reducedMotion={reduced}
        onStateChange={setState}
      />
    </Frame>
  );
}

export default function MotionShowcase() {
  const t = useT();
  const os = useReduced();
  const [override, setOverride] = useState<boolean | null>(null);
  const reduced = override ?? os;
  return (
    <div className="mo-show">
      <div className="mo-show__bar">
        <button
          type="button" className="mo-toggle" role="switch" aria-checked={reduced}
          onClick={() => setOverride(!reduced)}
        >
          <span className="mo-toggle__track" aria-hidden="true"><span className="mo-toggle__thumb" /></span>
          {t('Mouvement réduit', 'Mouvman redwi')}
        </button>
        <p className="mo-show__note">
          {t(
            `Chaque séquence est pilotée par une machine à états (le modèle Rive). Durées : appui ${DUR.press} ms · composant ${DUR.component} ms · navigation ${DUR.navigation} ms · intro ${DUR.intro / 1000} s · cérémonie ${DUR.ceremony / 1000} s. Données de démonstration.`,
            `Chak sekans mache ak yon machin eta (modèl Rive la). Dire : peze ${DUR.press} ms · konpozan ${DUR.component} ms · navigasyon ${DUR.navigation} ms · entwodiksyon ${DUR.intro / 1000} s · seremoni ${DUR.ceremony / 1000} s. Done demo.`,
          )}
        </p>
      </div>
      <RevealDemo reduced={reduced} />
      <CountdownDemo reduced={reduced} />
      <CeremonyDemo reduced={reduced} />
    </div>
  );
}
