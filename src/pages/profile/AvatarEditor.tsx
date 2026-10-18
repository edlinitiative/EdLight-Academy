/**
 * /profile/avatar — the student avatar editor.
 *
 * The model is src/arena-art/avatars/avatarConfig.ts (shared with the app);
 * the face is the Arène avatar, so what a student builds here is exactly what
 * classmates see on the boards, in duels and on the broadcast.
 *
 * Every choice is a native radio group (fieldset + legend), so arrow keys,
 * focus and screen-reader announcements come from the platform. Sections are
 * a tablist. One solid "Enregistrer"; leaving with unsaved changes asks first.
 *
 * Dev-only `?preview=signed-in` renders the signed-in editor with a fake
 * student for screenshots; it never saves and is dead code in production.
 */
import React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import useStore from '../../contexts/store';
import Avatar from '../../arena-art/avatars/Avatar';
import type { AvatarMood } from '../../arena-art/avatars/traits';
import { schoolColors } from '../../arena-art/crest/SchoolCrest';
import {
  AVATAR_GLASSES, AVATAR_HAIR_COLORS, AVATAR_SKIN_TONES, AVATAR_WRAPS, BROW_STYLES, CHEEK_STYLES,
  FACE_MARKS, FACE_SHAPES, FRAME_COLORS, HEADWEARS, PRESENTATIONS, UNIFORM_COLORS, UNIFORM_HEX,
  defaultConfigFor, randomConfig, sameConfig, sanitizeConfig, serializeConfig, suggestedHairs, suggestedUniforms,
  type AvatarConfig, type AvatarHair, type UniformColor, type UniformCut,
} from '../../arena-art/avatars/avatarConfig';
import { useTrivia } from '../../hooks/useTrivia';
import { setMyAvatarCache, useMyAvatar } from '../../hooks/useMyAvatar';
import { saveAvatar } from '../../services/avatarService';
import './AvatarEditor.css';

type T = (fr: string, ht: string) => string;
type Section = 'presentation' | 'skin' | 'hair' | 'face' | 'glasses' | 'uniform';
const SECTIONS: Section[] = ['presentation', 'skin', 'hair', 'face', 'glasses', 'uniform'];

const SECTION_TEXT: Record<Section, [string, string]> = {
  presentation: ['Présentation', 'Prezantasyon'],
  skin: ['Peau', 'Po'],
  hair: ['Cheveux', 'Cheve'],
  face: ['Visage', 'Figi'],
  glasses: ['Lunettes', 'Linèt'],
  uniform: ['Uniforme', 'Inifòm'],
};

const HAIR_TEXT: Record<AvatarHair, [string, string]> = {
  fade: ['Dégradé', 'Degrade'],
  crop: ['Coupe courte', 'Tèt koupe kout'],
  afro: ['Afro', 'Afro'],
  puffs: ['Deux puffs', 'De ti boul'],
  cornrows: ['Nattes collées', 'Très kole'],
  locs: ['Locks', 'Dread'],
  braids: ['Tresses, chignon', 'Très, chiyon'],
  twists: ['Twists courts', 'Ti twist kout'],
  bun: ['Chignon', 'Chiyon'],
  ponytail: ['Queue de cheval', 'Ke chwal'],
  shaved: ['Rasé', 'Tèt raze'],
  bantu: ['Nœuds bantous', 'Ne bantou'],
  longbraids: ['Tresses longues', 'Très long'],
};
const HAIR_COLOR_TEXT: Array<[string, string]> = [
  ['Noir', 'Nwa'], ['Noir doux', 'Nwa dous'], ['Brun foncé', 'Mawon fonse'], ['Châtain', 'Chatèy'],
  ['Brun', 'Mawon'], ['Roux', 'Wouj'], ['Miel', 'Myèl'], ['Bordeaux', 'Bòdo'],
];
const UNIFORM_TEXT: Record<UniformCut, [string, string]> = {
  chemise: ['Chemise', 'Chemiz'],
  blouse: ['Blouse à col rond', 'Blouz kolye won'],
  polo: ['Polo', 'Polo'],
  cravate: ['Chemise et cravate', 'Chemiz ak kravat'],
  noeud: ['Chemise et nœud', 'Chemiz ak ne'],
};
const COLOR_TEXT: Record<UniformColor, [string, string]> = {
  ecole: ['Mon école', 'Lekòl mwen'],
  blanc: ['Blanc', 'Blan'],
  kaki: ['Kaki', 'Kaki'],
  bleu: ['Bleu ciel', 'Ble syèl'],
  marine: ['Marine', 'Ble maren'],
  gris: ['Gris', 'Gri'],
  bordeaux: ['Bordeaux', 'Bòdo'],
};
const MOODS: Array<[AvatarMood, string, string]> = [
  ['idle', 'Au repos', 'Repo'],
  ['ready', 'Prêt·e', 'Pare'],
  ['focused', 'Concentré·e', 'Konsantre'],
  ['celebrating', 'Fête', 'Fèt'],
  ['recovering', 'On repart', 'Nou rekòmanse'],
];

/* ── a native radio group, drawn as tiles ─────────────────────────────── */

interface Opt<V> { value: V; label: string; visual?: React.ReactNode }

function Choice<V extends string | number | boolean>({
  name, legend, hint, options, value, onChange, kind = 'tile',
}: {
  name: string;
  legend: string;
  hint?: string;
  options: Array<Opt<V>>;
  value: V;
  onChange: (v: V) => void;
  kind?: 'tile' | 'swatch' | 'pill';
}) {
  const hintId = hint ? `${name}-hint` : undefined;
  return (
    <fieldset className={`ave-group ave-group--${kind}`} aria-describedby={hintId}>
      <legend className="ave-group__legend">{legend}</legend>
      {hint && <p id={hintId} className="ave-group__hint">{hint}</p>}
      <div className="ave-group__opts">
        {options.map((o) => {
          const checked = o.value === value;
          return (
            <label key={String(o.value)} className={`ave-opt${checked ? ' is-on' : ''}`}>
              <input
                type="radio" className="ave-opt__input" name={name}
                checked={checked} onChange={() => onChange(o.value)}
                aria-label={kind === 'swatch' ? o.label : undefined}
              />
              {o.visual && <span className="ave-opt__visual" aria-hidden="true">{o.visual}</span>}
              {kind !== 'swatch' && <span className="ave-opt__label">{o.label}</span>}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

const Swatch = ({ fill, ring }: { fill: string; ring?: string }) => (
  <span className="ave-swatch" style={{ background: fill, boxShadow: ring ? `inset 0 0 0 5px ${ring}` : undefined }} />
);

/* ── the page ──────────────────────────────────────────────────────────── */

export default function AvatarEditor() {
  const navigate = useNavigate();
  const language = useStore((s) => s.language);
  const storeUser = useStore((s) => s.user);
  const toggleAuthModal = useStore((s) => s.toggleAuthModal);
  const isCreole = language === 'ht';
  const t: T = (fr, ht) => (isCreole ? ht : fr);

  const [params] = useSearchParams();
  const preview = process.env.NODE_ENV !== 'production' && params.get('preview') === 'signed-in';
  const uid: string | null = preview ? 'u-preview-eleve' : storeUser?.uid || null;

  const trivia = useTrivia();
  const school: string | null = preview ? 'Lycée Toussaint Louverture' : trivia.profile?.leaderboard?.school || null;
  const colors = React.useMemo(() => (school ? schoolColors(school) : undefined), [school]);

  const mine = useMyAvatar();
  const savedWire = preview ? null : mine.avatar;
  const origin = React.useMemo(() => (uid ? defaultConfigFor(uid) : null), [uid]);
  const saved = React.useMemo(() => sanitizeConfig(savedWire) ?? origin, [savedWire, origin]);

  const [draft, setDraft] = React.useState<AvatarConfig | null>(null);
  // Adopt the saved look once it has loaded (and again if another tab saved).
  React.useEffect(() => { if (saved) setDraft((d) => d ?? saved); }, [saved]);
  const cfg = draft ?? saved;
  const dirty = !!cfg && !!saved && !sameConfig(cfg, saved);

  const [section, setSection] = React.useState<Section>('presentation');
  const [mood, setMood] = React.useState<AvatarMood>('idle');
  const [status, setStatus] = React.useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [live, setLive] = React.useState('');

  const set = <K extends keyof AvatarConfig>(key: K, value: AvatarConfig[K]) => {
    setDraft((d) => ({ ...(d ?? saved ?? (origin as AvatarConfig)), [key]: value }));
    setStatus('idle');
  };

  /* Unsaved-changes guard: closing the tab, and any in-app link. */
  const dirtyRef = React.useRef(dirty);
  dirtyRef.current = dirty && status !== 'saving';
  const leaveMsg = t('Quitter sans enregistrer ton avatar ?', 'Kite san w pa anrejistre avatar ou?');
  React.useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    const onClick = (e: MouseEvent) => {
      if (!dirtyRef.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      if (!window.confirm(leaveMsg)) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener('beforeunload', onUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [leaveMsg]);

  /* ── guest ── */
  if (!uid) {
    return (
      <section className="section ave ave--guest">
        <div className="container ave-guest">
          <span className="ave-guest__face" aria-hidden="true"><Avatar seed="invite-eleve" size={160} mood="ready" /></span>
          <h1 className="ave-title">{t('Crée ton avatar', 'Kreye avatar ou')}</h1>
          <p className="ave-sub">{t(
            'Connecte-toi pour choisir ton visage, tes cheveux et ton uniforme. Tes camarades le verront dans les classements, les défis et l’Arène.',
            'Konekte pou chwazi figi ou, cheve ou ak inifòm ou. Kamarad ou yo ap wè l nan klasman yo, defi yo ak Arèn nan.',
          )}</p>
          <button type="button" className="ave-solid" onClick={() => toggleAuthModal()}>{t('Se connecter', 'Konekte')}</button>
        </div>
      </section>
    );
  }

  if (!cfg || !origin) {
    return (
      <section className="section ave">
        <div className="container"><p className="ave-sub" role="status">{t('Chargement…', 'Chajman…')}</p></div>
      </section>
    );
  }

  // Decorative: the option's visible label names it.
  const thumb = (patch: Partial<AvatarConfig>, _key: string) => (
    <Avatar seed={uid} config={{ ...cfg, ...patch }} colors={colors} size={64} still />
  );

  const onRandom = () => {
    setDraft(randomConfig(cfg.presentation));
    setStatus('idle');
    setLive(t('Nouveau look au hasard.', 'Nouvo stil o aza.'));
  };
  const onOrigin = () => {
    setDraft(origin);
    setStatus('idle');
    setLive(t('Avatar d’origine rétabli.', 'Avatar orijinal la tounen.'));
  };
  const onSave = async () => {
    if (status === 'saving') return;
    const isOrigin = sameConfig(cfg, origin);
    setStatus('saving');
    if (preview) {
      setTimeout(() => { setStatus('saved'); setLive(t('C’est enregistré.', 'Li anrejistre.')); }, 300);
      return;
    }
    try {
      const r = await saveAvatar(uid, isOrigin ? null : cfg);
      setMyAvatarCache(uid, r.avatar);
      setDraft(isOrigin ? origin : cfg);
      setStatus('saved');
      setLive(t('C’est enregistré.', 'Li anrejistre.'));
    } catch {
      setStatus('failed');
      setLive(t('Échec de l’enregistrement. Réessaie.', 'Anrejistreman an echwe. Eseye ankò.'));
    }
  };

  const onTabKey = (e: React.KeyboardEvent) => {
    const i = SECTIONS.indexOf(section);
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % SECTIONS.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + SECTIONS.length) % SECTIONS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = SECTIONS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    setSection(SECTIONS[next]);
    document.getElementById(`ave-tab-${SECTIONS[next]}`)?.focus();
  };

  const schoolSwatch = colors ?? { primary: '#1F4E9C', secondary: '#F2C230' };
  const colorOpts = (which: 'primary' | 'secondary'): Array<Opt<UniformColor>> => UNIFORM_COLORS.map((c) => ({
    value: c,
    label: c === 'ecole' ? `${t(...COLOR_TEXT.ecole)}${school ? ` (${school})` : ''}` : t(...COLOR_TEXT[c]),
    visual: c === 'ecole'
      ? <Swatch fill={schoolSwatch[which]} ring={schoolSwatch[which === 'primary' ? 'secondary' : 'primary']} />
      : <Swatch fill={UNIFORM_HEX[c]} />,
  }));

  let panel: React.ReactNode;
  switch (section) {
    case 'presentation':
      panel = (
        <Choice
          name="presentation" kind="tile"
          legend={t('Je me présente comme', 'Mwen prezante tèt mwen kòm')}
          hint={t(
            'Ton choix change seulement l’ordre des suggestions et la ligne des épaules. Toutes les coiffures et tous les uniformes restent disponibles.',
            'Chwa ou chanje sèlman lòd sijesyon yo ak liy zepòl yo. Tout kalite cheve ak tout inifòm rete disponib.',
          )}
          options={PRESENTATIONS.map((p) => ({
            value: p,
            label: p === 'fille' ? t('Fille', 'Fi') : p === 'garçon' ? t('Garçon', 'Gason') : t('Neutre', 'Net'),
            visual: thumb({ presentation: p }, p),
          }))}
          value={cfg.presentation} onChange={(v) => set('presentation', v)}
        />
      );
      break;
    case 'skin':
      panel = (
        <Choice
          name="skin" kind="swatch" legend={t('Teint', 'Koulè po')}
          options={AVATAR_SKIN_TONES.map(([base], i) => ({
            value: i,
            label: t(`Teint ${i + 1} sur ${AVATAR_SKIN_TONES.length}`, `Koulè po ${i + 1} sou ${AVATAR_SKIN_TONES.length}`),
            visual: <Swatch fill={base} />,
          }))}
          value={cfg.skin} onChange={(v) => set('skin', v)}
        />
      );
      break;
    case 'hair':
      panel = (
        <>
          <Choice
            name="hair" kind="tile" legend={t('Coiffure', 'Kwafi')}
            options={suggestedHairs(cfg.presentation).map((h) => ({ value: h, label: t(...HAIR_TEXT[h]), visual: thumb({ hair: h, headwear: 'none' }, h) }))}
            value={cfg.hair} onChange={(v) => set('hair', v)}
          />
          <Choice
            name="hairColor" kind="swatch" legend={t('Couleur des cheveux', 'Koulè cheve')}
            options={AVATAR_HAIR_COLORS.map(([base, hi], i) => ({ value: i, label: t(...HAIR_COLOR_TEXT[i]), visual: <Swatch fill={base} ring={hi} /> }))}
            value={cfg.hairColor} onChange={(v) => set('hairColor', v)}
          />
          <Choice
            name="headwear" kind="tile" legend={t('Sur la tête', 'Sou tèt')}
            options={HEADWEARS.map((h) => ({
              value: h,
              label: h === 'none' ? t('Rien', 'Anyen') : h === 'moushwa' ? t('Moushwa', 'Mouchwa') : t('Riban', 'Riban'),
              visual: thumb({ headwear: h }, h),
            }))}
            value={cfg.headwear} onChange={(v) => set('headwear', v)}
          />
          {cfg.headwear === 'moushwa' && (
            <Choice
              name="wrap" kind="swatch" legend={t('Tissu du moushwa', 'Twal mouchwa a')}
              options={AVATAR_WRAPS.map(([a, b], i) => ({ value: i, label: t(`Tissu ${i + 1}`, `Twal ${i + 1}`), visual: <Swatch fill={a} ring={b} /> }))}
              value={cfg.wrap} onChange={(v) => set('wrap', v)}
            />
          )}
        </>
      );
      break;
    case 'face':
      panel = (
        <>
          <Choice
            name="faceShape" kind="tile" legend={t('Forme du visage', 'Fòm figi')}
            options={FACE_SHAPES.map((f) => ({ value: f, label: f === 'oval' ? t('Ovale', 'Oval') : f === 'round' ? t('Rond', 'Won') : t('Allongé', 'Long'), visual: thumb({ face: f }, f) }))}
            value={cfg.face} onChange={(v) => set('face', v)}
          />
          <Choice
            name="brows" kind="pill" legend={t('Sourcils', 'Sousi')}
            options={BROW_STYLES.map((b) => ({ value: b, label: b === 'soft' ? t('Doux', 'Dous') : b === 'straight' ? t('Droits', 'Dwat') : t('Arqués', 'Koube') }))}
            value={cfg.brows} onChange={(v) => set('brows', v)}
          />
          <Choice
            name="marks" kind="pill" legend={t('Détails', 'Detay')}
            options={FACE_MARKS.map((m) => ({ value: m, label: m === 'none' ? t('Aucun', 'Okenn') : m === 'freckles' ? t('Taches de rousseur', 'Ti pwen sou figi') : t('Grain de beauté', 'Siy bote') }))}
            value={cfg.marks} onChange={(v) => set('marks', v)}
          />
          <Choice
            name="cheeks" kind="pill" legend={t('Joues', 'Machwè')}
            options={CHEEK_STYLES.map((c) => ({ value: c, label: c === 'blush' ? t('Rosées', 'Woz') : c === 'plain' ? t('Naturelles', 'Natirèl') : t('Fossettes', 'Ti twou nan machwè') }))}
            value={cfg.cheeks} onChange={(v) => set('cheeks', v)}
          />
          <Choice
            name="earrings" kind="pill" legend={t('Boucles d’oreilles', 'Zanno')}
            options={[{ value: false, label: t('Non', 'Non') }, { value: true, label: t('Oui', 'Wi') }]}
            value={cfg.earrings} onChange={(v) => set('earrings', v)}
          />
        </>
      );
      break;
    case 'glasses':
      panel = (
        <>
          <Choice
            name="glasses" kind="tile" legend={t('Lunettes', 'Linèt')}
            options={AVATAR_GLASSES.map((g) => ({
              value: g,
              label: g === 'none' ? t('Aucune', 'Okenn') : g === 'round' ? t('Rondes', 'Won') : g === 'square' ? t('Carrées', 'Kare') : t('Demi-cerclées', 'Mwatye ankadre'),
              visual: thumb({ glasses: g }, g),
            }))}
            value={cfg.glasses} onChange={(v) => set('glasses', v)}
          />
          {cfg.glasses !== 'none' && (
            <Choice
              name="frame" kind="swatch" legend={t('Monture', 'Ankadreman')}
              options={FRAME_COLORS.map((c, i) => ({ value: i, label: [t('Noire', 'Nwa'), t('Écaille', 'Mawon'), t('Dorée', 'Dore')][i], visual: <Swatch fill={c} /> }))}
              value={cfg.frame} onChange={(v) => set('frame', v)}
            />
          )}
        </>
      );
      break;
    case 'uniform':
      panel = (
        <>
          <Choice
            name="uniform" kind="tile" legend={t('Coupe de l’uniforme', 'Modèl inifòm nan')}
            options={suggestedUniforms(cfg.presentation).map((u) => ({ value: u, label: t(...UNIFORM_TEXT[u]), visual: thumb({ uniform: u }, u) }))}
            value={cfg.uniform} onChange={(v) => set('uniform', v)}
          />
          <Choice
            name="shirt" kind="swatch" legend={t('Couleur de la chemise', 'Koulè chemiz la')}
            hint={school
              ? t('« Mon école » suit les couleurs de ton école.', '« Lekòl mwen » swiv koulè lekòl ou.')
              : t('« Mon école » prendra les couleurs de ton école dès que tu l’auras choisie dans ton profil.', '« Lekòl mwen » ap pran koulè lekòl ou lè w chwazi l nan pwofil ou.')}
            options={colorOpts('primary')}
            value={cfg.shirt} onChange={(v) => set('shirt', v)}
          />
          <Choice
            name="tie" kind="swatch" legend={t('Cravate, col et finitions', 'Kravat, kolye ak bò yo')}
            options={colorOpts('secondary')}
            value={cfg.tie} onChange={(v) => set('tie', v)}
          />
        </>
      );
      break;
  }

  const saveText = status === 'saving' ? t('Enregistrement…', 'Ap anrejistre…') : t('Enregistrer', 'Anrejistre');
  const note = status === 'saved' && !dirty
    ? t('C’est enregistré. Tes camarades verront ce visage.', 'Li anrejistre. Kamarad ou yo ap wè figi sa a.')
    : status === 'failed'
      ? t('Échec de l’enregistrement. Réessaie.', 'Anrejistreman an echwe. Eseye ankò.')
      : dirty ? t('Modifications non enregistrées', 'Chanjman pa anrejistre') : t('Aucune modification', 'Pa gen chanjman');

  return (
    <section className="section ave">
      <div className="container ave-page">
        {preview && <p className="ave-devnote">{t('Aperçu de développement — rien n’est enregistré', 'Apèsi devlopman — anyen pa anrejistre')}</p>}
        <div className="ave-head">
          <Link to="/profile" className="ave-back">{t('Retour au profil', 'Retounen nan pwofil')}</Link>
          <h1 className="ave-title">{t('Mon avatar', 'Avatar mwen')}</h1>
          <p className="ave-sub">{t('Ton visage dans l’Arène, les classements et les défis.', 'Figi ou nan Arèn nan, klasman yo ak defi yo.')}</p>
        </div>

        <div className="ave-layout">
          <aside className="ave-stage" aria-label={t('Aperçu', 'Apèsi')}>
            <div className="ave-stage__face">
              <Avatar
                seed={uid} config={cfg} colors={colors} mood={mood} size={240}
                title={t('Aperçu de ton avatar', 'Apèsi avatar ou')}
              />
            </div>
            <div className="ave-moods" role="radiogroup" aria-label={t('Voir une humeur', 'Gade yon imè')}>
              {MOODS.map(([m, fr, ht]) => (
                <label key={m} className={`ave-mood${mood === m ? ' is-on' : ''}`}>
                  <input type="radio" className="ave-opt__input" name="ave-mood" checked={mood === m} onChange={() => setMood(m)} />
                  <span>{t(fr, ht)}</span>
                </label>
              ))}
            </div>
            <div className="ave-stage__actions">
              <button type="button" className="ave-tonal" onClick={onRandom}>{t('Aléatoire', 'O aza')}</button>
              <button type="button" className="ave-text" onClick={onOrigin} disabled={sameConfig(cfg, origin)}>
                {t('Revenir à mon avatar d’origine', 'Retounen nan avatar orijinal mwen')}
              </button>
            </div>
          </aside>

          <div className="ave-editor">
            <div className="ave-tabs" role="tablist" aria-label={t('Parties de l’avatar', 'Pati avatar a')} onKeyDown={onTabKey}>
              {SECTIONS.map((s) => (
                <button
                  key={s} id={`ave-tab-${s}`} type="button" role="tab"
                  aria-selected={section === s} aria-controls="ave-panel" tabIndex={section === s ? 0 : -1}
                  className={`ave-tab${section === s ? ' is-on' : ''}`} onClick={() => setSection(s)}
                >
                  {t(...SECTION_TEXT[s])}
                </button>
              ))}
            </div>
            <div id="ave-panel" className="ave-panel" role="tabpanel" aria-labelledby={`ave-tab-${section}`} tabIndex={-1}>
              {panel}
            </div>
          </div>
        </div>

        <div className="ave-bar">
          <p className={`ave-bar__note${status === 'failed' ? ' is-error' : ''}`}>{note}</p>
          <button type="button" className="ave-text" onClick={() => { if (!dirty || window.confirm(leaveMsg)) { dirtyRef.current = false; navigate('/profile'); } }}>{t('Annuler', 'Anile')}</button>
          <button type="button" className="ave-solid" onClick={onSave} disabled={(!dirty && status !== 'failed') || status === 'saving'} aria-describedby="ave-live">
            {saveText}
          </button>
        </div>
        <p id="ave-live" className="ave-sr" role="status" aria-live="polite">{live}</p>
        {/* serialized form, for QA */}
        {preview && <p className="ave-devnote" data-testid="ave-wire">{serializeConfig(cfg)}</p>}
      </div>
    </section>
  );
}
