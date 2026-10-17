import React from 'react';
import useStore from '../../contexts/store';
import { useArenaSound } from './useArenaSound';
import { getArenaSound, CueName, MOTIF, renderCueOffline, analyze, encodeWav } from './arenaSound';
import './sound.css';

type Tx = (fr: string, ht: string) => string;

interface CueCard {
  cue: Exclude<CueName, 'crowdBed'>;
  name: [string, string];
  purpose: [string, string];
  /** What the screen shows alongside — sound is never the only carrier. */
  visual?: [string, string];
}

const CARDS: CueCard[] = [
  { cue: 'press', name: ['Appui', 'Peze'], purpose: ['Un tic discret pour chaque bouton.', 'Yon ti tik dous pou chak bouton.'] },
  { cue: 'select', name: ['Choix', 'Chwa'], purpose: ['Une réponse est choisie : une note douce.', 'Ou chwazi yon repons : yon nòt dous.'] },
  { cue: 'submitted', name: ['Réponse reçue', 'Repons resevwa'], purpose: ['Neutre : deux petits coups de bois, ni juste ni faux.', 'Net : de ti kou bwa, ni bon ni move.'] },
  { cue: 'correct', name: ['Juste', 'Bon repons'], purpose: ['Les trois dernières notes du motif, vives et brèves.', 'Twa dènye nòt motif la, klere epi kout.'], visual: ['✓ Juste', '✓ Bon'] },
  { cue: 'incorrect', name: ['Pas cette fois', 'Pa fwa sa a'], purpose: ['Deux notes douces qui descendent. Jamais moqueur.', 'De nòt dous ki desann. Pa janm pou fè moun wont.'], visual: ['○ Pas cette fois', '○ Pa fwa sa a'] },
  { cue: 'countdown', name: ['Compte à rebours', 'Konte a'], purpose: ['3, 2, 1… partez ! L’image se cale sur chaque coup.', '3, 2, 1… ale ! Imaj la swiv chak kou.'] },
  { cue: 'reveal', name: ['Révélation', 'Revelasyon'], purpose: ['Un scintillement qui monte quand la manche se dévoile.', 'Yon ti klere k ap monte lè manch lan parèt.'] },
  { cue: 'scoreUp', name: ['Points', 'Pwen'], purpose: ['Les points qui montent, note après note.', 'Pwen yo k ap monte, nòt apre nòt.'] },
  { cue: 'promotion', name: ['Promotion', 'Monte ran'], purpose: ['Le motif entier, en accéléré : on monte de rang.', 'Tout motif la, pi vit : ou monte ran.'] },
  { cue: 'victory', name: ['Victoire', 'Viktwa'], purpose: ['Le motif sur un groove inspiré du kompa.', 'Motif la sou yon ritm enspire konpa.'] },
  { cue: 'championship', name: ['Championnat', 'Chanpyona'], purpose: ['La cérémonie : appel rara, fanfare du motif, accord final.', 'Seremoni an : apèl rara, fanfa motif la, dènye akò a.'] },
];

const SOLFEGE: Record<string, [string, string]> = {
  C: ['Do', 'Do'], D: ['Ré', 'Re'], E: ['Mi', 'Mi'], G: ['Sol', 'Sòl'],
};

/** Studio control panel for the Arène sound palette. */
export default function SoundShowcase() {
  const isCreole = useStore((s) => s.language) === 'ht';
  const t: Tx = (fr, ht) => (isCreole ? ht : fr);
  const snd = useArenaSound();
  const ready = snd.enabled && snd.unlocked;
  const [last, setLast] = React.useState<{ cue: CueName; text: string } | null>(null);
  const [tickShown, setTickShown] = React.useState<number | null>(null);
  const countdownRef = React.useRef<() => void>(() => {});

  // Studio-only instrumentation hook for automated checks (page is noindex).
  React.useEffect(() => {
    (window as any).__arenaSound = getArenaSound();
    (window as any).__arenaSoundApi = { renderCueOffline, analyze, encodeWav };
    return () => { countdownRef.current(); };
  }, []);

  const play = (card: CueCard) => {
    let opts = {};
    if (card.cue === 'countdown') {
      countdownRef.current();
      opts = { onTick: (n: number) => { setTickShown(n); if (n === 0) setTimeout(() => setTickShown(null), 900); } };
    }
    const r = snd.play(card.cue, opts);
    if (card.cue === 'countdown') countdownRef.current = r.cancel;
    const vis = card.visual ? `${t(...card.visual)} · ` : '';
    setLast({
      cue: card.cue,
      text: r.played
        ? `${vis}${t(...card.name)} — ${Math.round((r.duration || 0) * 1000)} ms`
        : `${vis}${t(...card.name)} — ${t('non joué', 'pa jwe')} (${r.reason})`,
    });
  };

  const needId = 'snd-need';

  return (
    <div className="snd">
      <div className="snd__bar">
        <div className="snd__status" role="status" aria-live="polite">
          {ready
            ? (snd.muted ? t('Son activé, mais coupé.', 'Son an limen, men li koupe.') : t('Son activé.', 'Son an limen.'))
            : snd.enabled
              ? t('Touchez « Activer le son » pour le rallumer sur cet appareil.', 'Peze « Limen son an » pou w limen l ankò sou aparèy sa a.')
              : t('Le son est coupé par défaut. Rien ne joue tant que vous ne l’activez pas.', 'Son an koupe pa defo. Anyen p ap jwe toutotan ou pa limen l.')}
        </div>
        <div className="snd__controls">
          {ready ? (
            <button type="button" className="an-ghost snd__btn" onClick={snd.disable}>{t('Désactiver le son', 'Etenn son an')}</button>
          ) : (
            <button type="button" className="an-go snd__btn" onClick={snd.enable} data-testid="snd-enable">{t('Activer le son', 'Limen son an')}</button>
          )}
          <button
            type="button"
            className="an-ghost snd__btn"
            aria-pressed={snd.muted}
            onClick={() => snd.setMuted(!snd.muted)}
          >
            {snd.muted ? t('Rétablir le son', 'Remete son an') : t('Muet', 'An silans')}
          </button>
          <label className="snd__vol">
            <span>{t('Volume', 'Volim')} <b>{Math.round(snd.volume * 100)} %</b></span>
            <input
              type="range" min={0} max={1} step={0.05}
              value={snd.volume}
              onChange={(e) => snd.setVolume(parseFloat(e.target.value))}
            />
          </label>
          <label className="snd__check">
            <input type="checkbox" checked={snd.reducedSound} onChange={(e) => snd.setReducedSound(e.target.checked)} />
            <span>{t('Sons courts', 'Son kout')}</span>
          </label>
        </div>
      </div>

      <div className="snd__motif" aria-label={t('Le motif de l’Arène', 'Motif Arèn nan')}>
        <span className="snd__motif-t">{t('Le motif', 'Motif la')}</span>
        <ol className="snd__notes">
          {MOTIF.map((n, i) => (
            <li key={i} style={{ flexGrow: n.len }} data-len={n.len}>
              <span>{t(...SOLFEGE[n.note[0]])}</span>
            </li>
          ))}
        </ol>
        <span className="snd__motif-s">{t('Cinq notes, sur la pulsation 3 + 3 + 2. Tous les sons de fête le citent.', 'Senk nòt, sou batman 3 + 3 + 2. Tout son fèt yo sèvi avè l.')}</span>
      </div>

      {!ready && (
        <p id={needId} className="snd__need">{t('Activez le son pour écouter chaque élément.', 'Limen son an pou w ka koute chak son.')}</p>
      )}

      <ul className="snd__grid">
        {CARDS.map((c) => (
          <li key={c.cue} className="snd__card">
            <div className="snd__card-h">
              <h3 className="snd__name">{t(...c.name)}</h3>
              {c.cue === 'countdown' && tickShown != null && (
                <span className="snd__tick" aria-live="assertive">{tickShown === 0 ? t('Partez !', 'Ale !') : tickShown}</span>
              )}
            </div>
            <p className="snd__purpose">{t(...c.purpose)}</p>
            <button
              type="button"
              className={c.cue === 'championship' || c.cue === 'victory' ? 'an-go snd__play' : 'an-ghost snd__play'}
              disabled={!ready}
              aria-describedby={!ready ? needId : undefined}
              onClick={() => play(c)}
              data-cue={c.cue}
            >
              {t('Écouter', 'Koute')} · {t(...c.name)}
            </button>
          </li>
        ))}
        <li className="snd__card snd__card--amb">
          <h3 className="snd__name">{t('Foule (ambiance)', 'Foul (anbyans)')}</h3>
          <p className="snd__purpose">{t('Un murmure très doux, jamais automatique. Il s’efface pendant les cérémonies.', 'Yon ti bwi foul trè dous, li pa janm limen pou kont li. Li bese pandan seremoni yo.')}</p>
          <button
            type="button"
            className="an-ghost snd__play"
            disabled={!ready}
            aria-pressed={snd.crowdOn}
            aria-describedby={!ready ? needId : undefined}
            onClick={() => (snd.crowdOn ? snd.stopCrowd() : snd.startCrowd())}
            data-cue="crowdBed"
          >
            {snd.crowdOn ? t('Arrêter la foule', 'Kanpe foul la') : t('Lancer la foule', 'Lanse foul la')}
          </button>
        </li>
      </ul>

      <p className="snd__last" aria-live="polite">{last ? last.text : ' '}</p>
    </div>
  );
}
