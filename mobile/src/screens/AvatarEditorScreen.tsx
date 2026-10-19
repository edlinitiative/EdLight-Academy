/**
 * Mon avatar — the student avatar editor (the app twin of web /profile/avatar).
 *
 * The model is components/arena/art/avatars/avatarConfig.ts (byte-identical to
 * the web copy); the face is the Arène avatar, so what a student builds here is
 * exactly what classmates see on the boards, in duels and in the Arène.
 *
 * Layout: title row, a large live preview (mood chips, Aléatoire, reset), a
 * scrolling section switcher, the section's choices, and ONE solid
 * "Enregistrer" pinned at the bottom. Every choice is a radio (role + checked
 * state + label). Leaving with unsaved changes asks first — header back,
 * Android hardware back and (by disabling it while dirty) the iOS swipe.
 *
 * Dev-only `preview` route param (deep link `…/--/profile/avatar?preview=1`)
 * renders the signed-in editor for a fake student so it can be screenshotted
 * signed-out. It never saves; `__DEV__` makes it dead code in production.
 */
import React from 'react';
import {
  View, Text, ScrollView, Pressable, Alert, AccessibilityInfo, useWindowDimensions, StyleProp, ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, ChevronLeft, Shuffle } from 'lucide-react-native';
import useStore from '../contexts/store';
import Avatar from '../components/arena/art/avatars/Avatar';
import type { AvatarMood } from '../components/arena/art/avatars/traits';
import { schoolColors } from '../components/arena/art/crest/SchoolCrest';
import {
  AVATAR_GLASSES, AVATAR_HAIR_COLORS, AVATAR_SKIN_TONES, AVATAR_WRAPS, BROW_STYLES, CHEEK_STYLES,
  FACE_MARKS, FACE_SHAPES, FRAME_COLORS, HEADWEARS, PRESENTATIONS, UNIFORM_COLORS, UNIFORM_HEX,
  defaultConfigFor, randomConfig, sameConfig, sanitizeConfig, suggestedHairs, suggestedUniforms,
  type AvatarConfig, type AvatarHair, type UniformColor, type UniformCut,
} from '../components/arena/art/avatars/avatarConfig';
import Button from '../components/ui/Button';
import PageTitle from '../components/ui/PageTitle';
import PressableScale from '../components/ui/PressableScale';
import Segmented from '../components/ui/Segmented';
import { useContentContainerStyle } from '../components/ui/ContentContainer';
import { useTheme, touch } from '../theme/theme';
import { useTrivia } from '../hooks/useTrivia';
import { setMyAvatarCache, useMyAvatar } from '../hooks/useMyAvatar';
import { saveAvatar } from '../services/avatarService';
import { select as hapticSelect, success as hapticSuccess } from '../utils/haptics';

type T = (fr: string, ht: string) => string;
export type AvatarSection = 'presentation' | 'skin' | 'hair' | 'face' | 'glasses' | 'uniform';
const SECTIONS: AvatarSection[] = ['presentation', 'skin', 'hair', 'face', 'glasses', 'uniform'];

/* FR/HT tables — identical to the web editor (src/pages/profile/AvatarEditor.tsx). */
const SECTION_TEXT: Record<AvatarSection, [string, string]> = {
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

const GUTTER = 20;
const PREVIEW_UID = 'u-preview-eleve';
const PREVIEW_SCHOOL = 'Lycée Toussaint Louverture';

/* ── a radio group, drawn as tiles / swatches / pills ─────────────────── */

interface Opt<V> { value: V; label: string; visual?: React.ReactNode }

function Choice<V extends string | number | boolean>({
  legend, hint, options, value, onChange, kind = 'tile', tileWidth, showLabels = true,
}: {
  legend: string;
  hint?: string;
  options: Array<Opt<V>>;
  value: V;
  onChange: (v: V) => void;
  kind?: 'tile' | 'swatch' | 'pill';
  tileWidth: number;
  /** Swatches only: print the name under each colour. */
  showLabels?: boolean;
}) {
  const { colors, fonts, typeScale, radius } = useTheme();
  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 4 }}>
        <Text accessibilityRole="header" style={[typeScale.cardTitle, { fontSize: 18, lineHeight: 23, color: colors.ink }]}>{legend}</Text>
        {hint ? <Text style={[typeScale.instruction, { color: colors.muted }]}>{hint}</Text> : null}
      </View>
      <View accessibilityRole="radiogroup" accessibilityLabel={legend} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: kind === 'swatch' ? 8 : 10 }}>
        {options.map((o) => {
          const on = o.value === value;
          const press = () => { if (!on) { hapticSelect(); onChange(o.value); } };
          const a11y = {
            accessibilityRole: 'radio' as const,
            accessibilityState: { checked: on },
            accessibilityLabel: o.label,
          };
          if (kind === 'pill') {
            return (
              <PressableScale
                key={String(o.value)} onPress={press} haptic={false} pressedScale={0.97} {...a11y}
                style={{
                  minHeight: touch.min, paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.pill,
                  justifyContent: 'center', backgroundColor: on ? colors.azureSoft : colors.surfaceAlt,
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                }}
              >
                {on ? <Check size={16} color={colors.azureInk} strokeWidth={2.6} /> : null}
                <Text style={{ fontFamily: on ? fonts.bold : fonts.medium, fontSize: 15, lineHeight: 20, color: on ? colors.azureInk : colors.ink }}>{o.label}</Text>
              </PressableScale>
            );
          }
          if (kind === 'swatch') {
            return (
              <PressableScale
                key={String(o.value)} onPress={press} haptic={false} pressedScale={0.94} {...a11y}
                style={{
                  width: showLabels ? 76 : 56, minHeight: 56, paddingVertical: 4, borderRadius: radius.tile,
                  alignItems: 'center', gap: 4, backgroundColor: on ? colors.azureSoft : 'transparent',
                }}
              >
                <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
                  {o.visual}
                  {on ? (
                    <View style={{ position: 'absolute', width: 24, height: 24, borderRadius: 12, backgroundColor: colors.azureFill, alignItems: 'center', justifyContent: 'center' }}>
                      <Check size={15} color="#ffffff" strokeWidth={3} />
                    </View>
                  ) : null}
                </View>
                {showLabels ? (
                  <Text
                    numberOfLines={2}
                    style={{ fontFamily: on ? fonts.bold : fonts.medium, fontSize: 14, lineHeight: 18, textAlign: 'center', color: on ? colors.azureInk : colors.ink }}
                  >
                    {o.label}
                  </Text>
                ) : null}
              </PressableScale>
            );
          }
          return (
            <PressableScale
              key={String(o.value)} onPress={press} haptic={false} pressedScale={0.97} {...a11y}
              style={{
                width: tileWidth, paddingTop: 12, paddingBottom: 10, paddingHorizontal: 6, borderRadius: radius.tile,
                alignItems: 'center', gap: 8, backgroundColor: on ? colors.azureSoft : colors.surfaceAlt,
              }}
            >
              <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>{o.visual}</View>
              <Text
                style={{ fontFamily: on ? fonts.bold : fonts.medium, fontSize: 15, lineHeight: 19, textAlign: 'center', color: on ? colors.azureInk : colors.ink }}
              >
                {o.label}
              </Text>
              {on ? (
                <View style={{ position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.azureFill, alignItems: 'center', justifyContent: 'center' }}>
                  <Check size={14} color="#ffffff" strokeWidth={3} />
                </View>
              ) : null}
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

/** A colour disc; `inner` draws the second tone (highlight, band, school trim) as a centre dot. */
const Swatch = ({ fill, inner, edge }: { fill: string; inner?: string; edge?: boolean }) => (
  <View
    style={{
      width: 40, height: 40, borderRadius: 20, backgroundColor: fill, alignItems: 'center', justifyContent: 'center',
      // White and the palest tones need a lift off a white card: a shadow, not a ring.
      ...(edge ? { shadowColor: '#0B296B', shadowOpacity: 0.18, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 } : null),
    }}
  >
    {inner ? <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: inner }} /> : null}
  </View>
);

/* ── the screen ────────────────────────────────────────────────────────── */

export default function AvatarEditorScreen({ navigation, route }: any) {
  const { colors, fonts, typeScale, cardSurface, featureSurface, elevation, isDark } = useTheme();
  const language = useStore((s) => s.language);
  const storeUser = useStore((s) => s.user);
  const toggleAuthModal = useStore((s) => s.toggleAuthModal);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const isCreole = language === 'ht';
  const t: T = (fr, ht) => (isCreole ? ht : fr);
  const column = useContentContainerStyle('readable');
  const { width } = useWindowDimensions();

  const preview = __DEV__ && !!route?.params?.preview;
  // Dev preview only: `theme=dark|light` flips the app theme for screenshots.
  const previewTheme = preview ? route?.params?.theme : undefined;
  const setTheme = useStore((s) => s.setTheme);
  React.useEffect(() => { if (previewTheme === 'dark' || previewTheme === 'light') setTheme(previewTheme); }, [previewTheme, setTheme]);
  const uid: string | null = preview ? PREVIEW_UID : storeUser?.uid || null;

  const trivia = useTrivia();
  const school: string | null = preview ? PREVIEW_SCHOOL : (trivia.profile as any)?.leaderboard?.school || null;
  const schoolTint = React.useMemo(() => (school ? schoolColors(school) : undefined), [school]);

  const mine = useMyAvatar();
  const savedWire = preview ? null : mine.avatar;
  const origin = React.useMemo(() => (uid ? defaultConfigFor(uid) : null), [uid]);
  const saved = React.useMemo(() => sanitizeConfig(savedWire) ?? origin, [savedWire, origin]);
  const loading = !preview && mine.loading;

  const [draft, setDraft] = React.useState<AvatarConfig | null>(null);
  // Adopt the saved look once it has loaded.
  React.useEffect(() => { if (saved && !loading) setDraft((d) => d ?? saved); }, [saved, loading]);
  const cfg = draft ?? saved;
  const dirty = !!cfg && !!saved && !sameConfig(cfg, saved);

  const initialSection = SECTIONS.includes(route?.params?.section) ? route.params.section as AvatarSection : 'presentation';
  const [section, setSection] = React.useState<AvatarSection>(initialSection);
  // A link to a section (…/profile/avatar?section=hair) also works while open.
  const linkedSection = route?.params?.section;
  React.useEffect(() => { if (SECTIONS.includes(linkedSection)) setSection(linkedSection); }, [linkedSection]);
  const [mood, setMood] = React.useState<AvatarMood>('idle');
  const [status, setStatus] = React.useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');

  const announce = (msg: string) => AccessibilityInfo.announceForAccessibility(msg);
  const set = <K extends keyof AvatarConfig>(key: K, value: AvatarConfig[K]) => {
    setDraft((d) => ({ ...(d ?? saved ?? (origin as AvatarConfig)), [key]: value }));
    setStatus('idle');
  };

  /* Unsaved-changes guard: header back, Android back, programmatic goBack. */
  const dirtyRef = React.useRef(false);
  dirtyRef.current = dirty && status !== 'saving';
  const leaveTitle = t('Quitter sans enregistrer ton avatar ?', 'Kite san w pa anrejistre avatar ou?');
  React.useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e: any) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      Alert.alert(leaveTitle, t('Tes changements seront perdus.', 'Chanjman ou yo ap pèdi.'), [
        { text: t('Rester', 'Rete'), style: 'cancel' },
        {
          text: t('Quitter', 'Kite'),
          style: 'destructive',
          onPress: () => { dirtyRef.current = false; navigation.dispatch(e.data.action); },
        },
      ]);
    });
    return unsub;
  }, [navigation, leaveTitle]); // eslint-disable-line react-hooks/exhaustive-deps
  // The iOS swipe-back can't be interrupted by beforeRemove: turn it off while dirty.
  React.useEffect(() => { navigation.setOptions?.({ gestureEnabled: !dirty }); }, [navigation, dirty]);

  const goBack = () => (navigation.canGoBack?.() ? navigation.goBack() : navigation.navigate('Main', { screen: 'Profile' }));

  const header = (
    <View style={{ paddingHorizontal: 8, paddingTop: 4, flexDirection: 'row', alignItems: 'center' }}>
      <Pressable
        onPress={goBack}
        accessibilityRole="button"
        accessibilityLabel={t('Retour au profil', 'Retounen nan pwofil')}
        hitSlop={8}
        style={{ minWidth: touch.min, minHeight: touch.min, alignItems: 'center', justifyContent: 'center' }}
      >
        <ChevronLeft size={28} color={colors.ink} strokeWidth={2.2} />
      </Pressable>
    </View>
  );

  /* ── guest ── */
  if (!uid) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
        {header}
        <ScrollView contentContainerStyle={[{ paddingBottom: 40 }, column]}>
          <PageTitle title={t('Crée ton avatar', 'Kreye avatar ou')} />
          <View style={{ paddingHorizontal: GUTTER, marginTop: 20 }}>
            <View style={[featureSurface, { padding: 24, alignItems: 'center', gap: 16 }]}>
              <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                <Avatar seed="invite-eleve" size={160} mood="ready" still />
              </View>
              <Text style={[typeScale.body, { color: colors.muted, textAlign: 'center' }]}>
                {t(
                  'Connecte-toi pour choisir ton visage, tes cheveux et ton uniforme. Tes camarades le verront dans les classements, les défis et l’Arène.',
                  'Konekte pou chwazi figi ou, cheve ou ak inifòm ou. Kamarad ou yo ap wè l nan klasman yo, defi yo ak Arèn nan.',
                )}
              </Text>
              <Button
                label={t('Se connecter', 'Konekte')}
                fullWidth
                size="lg"
                onPress={() => { setActiveTab?.('signin'); toggleAuthModal(); }}
              />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!cfg || !origin || loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
        {header}
        <PageTitle title={t('Mon avatar', 'Avatar mwen')} />
        <Text accessibilityRole="text" style={[typeScale.meta, { color: colors.muted, paddingHorizontal: GUTTER, marginTop: 12 }]}>
          {t('Chargement…', 'Chajman…')}
        </Text>
      </SafeAreaView>
    );
  }

  // Tiles: three across the card (the column is capped on iPad).
  const colWidth = Math.min(width, 640);
  const tileWidth = Math.floor((colWidth - GUTTER * 2 - 20 * 2 - 10 * 2) / 3);
  const thumbSize = Math.min(64, tileWidth - 24);
  const thumb = (patch: Partial<AvatarConfig>) => (
    <Avatar seed={uid} config={{ ...cfg, ...patch }} colors={schoolTint} size={thumbSize} still />
  );

  const onRandom = () => {
    hapticSelect();
    setDraft(randomConfig(cfg.presentation));
    setStatus('idle');
    announce(t('Nouveau look au hasard.', 'Nouvo stil o aza.'));
  };
  const onOrigin = () => {
    setDraft(origin);
    setStatus('idle');
    announce(t('Avatar d’origine rétabli.', 'Avatar orijinal la tounen.'));
  };
  const onSave = async () => {
    if (status === 'saving') return;
    setStatus('saving');
    if (preview) {
      setTimeout(() => { setStatus('saved'); announce(t('C’est enregistré.', 'Li anrejistre.')); }, 300);
      return;
    }
    try {
      const r = await saveAvatar(uid, cfg);
      setMyAvatarCache(uid, r.avatar);
      setDraft(sanitizeConfig(r.avatar) ?? origin);
      setStatus('saved');
      hapticSuccess();
      announce(t('C’est enregistré.', 'Li anrejistre.'));
    } catch {
      setStatus('failed');
      announce(t('Échec de l’enregistrement. Réessaie.', 'Anrejistreman an echwe. Eseye ankò.'));
    }
  };

  const schoolSwatch = schoolTint ?? { primary: '#1F4E9C', secondary: '#F2C230' };
  const colorOpts = (which: 'primary' | 'secondary'): Array<Opt<UniformColor>> => UNIFORM_COLORS.map((c) => ({
    value: c,
    label: t(...COLOR_TEXT[c]),
    visual: c === 'ecole'
      ? <Swatch fill={schoolSwatch[which]} inner={schoolSwatch[which === 'primary' ? 'secondary' : 'primary']} />
      : <Swatch fill={UNIFORM_HEX[c]} edge={c === 'blanc' && !isDark} />,
  }));
  const common = { tileWidth };

  let panel: React.ReactNode;
  switch (section) {
    case 'presentation':
      panel = (
        <Choice
          {...common} kind="tile"
          legend={t('Je me présente comme', 'Mwen prezante tèt mwen kòm')}
          hint={t(
            'Ton choix change seulement l’ordre des suggestions et la ligne des épaules. Toutes les coiffures et tous les uniformes restent disponibles.',
            'Chwa ou chanje sèlman lòd sijesyon yo ak liy zepòl yo. Tout kalite cheve ak tout inifòm rete disponib.',
          )}
          options={PRESENTATIONS.map((p) => ({
            value: p,
            label: p === 'fille' ? t('Fille', 'Fi') : p === 'garçon' ? t('Garçon', 'Gason') : t('Neutre', 'Net'),
            visual: thumb({ presentation: p }),
          }))}
          value={cfg.presentation} onChange={(v) => set('presentation', v)}
        />
      );
      break;
    case 'skin':
      panel = (
        <Choice
          {...common} kind="swatch" showLabels={false} legend={t('Teint', 'Koulè po')}
          options={AVATAR_SKIN_TONES.map(([base], i) => ({
            value: i,
            label: t(`Teint ${i + 1} sur ${AVATAR_SKIN_TONES.length}`, `Koulè po ${i + 1} sou ${AVATAR_SKIN_TONES.length}`),
            visual: <Swatch fill={base} edge={!isDark && i >= 12} />,
          }))}
          value={cfg.skin} onChange={(v) => set('skin', v)}
        />
      );
      break;
    case 'hair':
      panel = (
        <>
          <Choice
            {...common} kind="tile" legend={t('Coiffure', 'Kwafi')}
            options={suggestedHairs(cfg.presentation).map((h) => ({ value: h, label: t(...HAIR_TEXT[h]), visual: thumb({ hair: h, headwear: 'none' }) }))}
            value={cfg.hair} onChange={(v) => set('hair', v)}
          />
          <Choice
            {...common} kind="swatch" legend={t('Couleur des cheveux', 'Koulè cheve')}
            options={AVATAR_HAIR_COLORS.map(([base, hi], i) => ({ value: i, label: t(...HAIR_COLOR_TEXT[i]), visual: <Swatch fill={base} inner={hi} /> }))}
            value={cfg.hairColor} onChange={(v) => set('hairColor', v)}
          />
          <Choice
            {...common} kind="tile" legend={t('Sur la tête', 'Sou tèt')}
            options={HEADWEARS.map((h) => ({
              value: h,
              label: h === 'none' ? t('Rien', 'Anyen') : h === 'moushwa' ? t('Moushwa', 'Mouchwa') : t('Riban', 'Riban'),
              visual: thumb({ headwear: h }),
            }))}
            value={cfg.headwear} onChange={(v) => set('headwear', v)}
          />
          {cfg.headwear === 'moushwa' ? (
            <Choice
              {...common} kind="swatch" showLabels={false} legend={t('Tissu du moushwa', 'Twal mouchwa a')}
              options={AVATAR_WRAPS.map(([a, b], i) => ({ value: i, label: t(`Tissu ${i + 1}`, `Twal ${i + 1}`), visual: <Swatch fill={a} inner={b} /> }))}
              value={cfg.wrap} onChange={(v) => set('wrap', v)}
            />
          ) : null}
        </>
      );
      break;
    case 'face':
      panel = (
        <>
          <Choice
            {...common} kind="tile" legend={t('Forme du visage', 'Fòm figi')}
            options={FACE_SHAPES.map((f) => ({ value: f, label: f === 'oval' ? t('Ovale', 'Oval') : f === 'round' ? t('Rond', 'Won') : t('Allongé', 'Long'), visual: thumb({ face: f }) }))}
            value={cfg.face} onChange={(v) => set('face', v)}
          />
          <Choice
            {...common} kind="pill" legend={t('Sourcils', 'Sousi')}
            options={BROW_STYLES.map((b) => ({ value: b, label: b === 'soft' ? t('Doux', 'Dous') : b === 'straight' ? t('Droits', 'Dwat') : t('Arqués', 'Koube') }))}
            value={cfg.brows} onChange={(v) => set('brows', v)}
          />
          <Choice
            {...common} kind="pill" legend={t('Détails', 'Detay')}
            options={FACE_MARKS.map((m) => ({ value: m, label: m === 'none' ? t('Aucun', 'Okenn') : m === 'freckles' ? t('Taches de rousseur', 'Ti pwen sou figi') : t('Grain de beauté', 'Siy bote') }))}
            value={cfg.marks} onChange={(v) => set('marks', v)}
          />
          <Choice
            {...common} kind="pill" legend={t('Joues', 'Machwè')}
            options={CHEEK_STYLES.map((c) => ({ value: c, label: c === 'blush' ? t('Rosées', 'Woz') : c === 'plain' ? t('Naturelles', 'Natirèl') : t('Fossettes', 'Ti twou nan machwè') }))}
            value={cfg.cheeks} onChange={(v) => set('cheeks', v)}
          />
          <Choice
            {...common} kind="pill" legend={t('Boucles d’oreilles', 'Zanno')}
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
            {...common} kind="tile" legend={t('Lunettes', 'Linèt')}
            options={AVATAR_GLASSES.map((g) => ({
              value: g,
              label: g === 'none' ? t('Aucune', 'Okenn') : g === 'round' ? t('Rondes', 'Won') : g === 'square' ? t('Carrées', 'Kare') : t('Demi-cerclées', 'Mwatye ankadre'),
              visual: thumb({ glasses: g }),
            }))}
            value={cfg.glasses} onChange={(v) => set('glasses', v)}
          />
          {cfg.glasses !== 'none' ? (
            <Choice
              {...common} kind="swatch" legend={t('Monture', 'Ankadreman')}
              options={FRAME_COLORS.map((c, i) => ({ value: i, label: [t('Noire', 'Nwa'), t('Écaille', 'Mawon'), t('Dorée', 'Dore')][i], visual: <Swatch fill={c} /> }))}
              value={cfg.frame} onChange={(v) => set('frame', v)}
            />
          ) : null}
        </>
      );
      break;
    case 'uniform':
      panel = (
        <>
          <Choice
            {...common} kind="tile" legend={t('Coupe de l’uniforme', 'Modèl inifòm nan')}
            options={suggestedUniforms(cfg.presentation).map((u) => ({ value: u, label: t(...UNIFORM_TEXT[u]), visual: thumb({ uniform: u }) }))}
            value={cfg.uniform} onChange={(v) => set('uniform', v)}
          />
          <Choice
            {...common} kind="swatch" legend={t('Couleur de la chemise', 'Koulè chemiz la')}
            hint={school
              ? t(`« Mon école » suit les couleurs de ${school}.`, `« Lekòl mwen » swiv koulè ${school}.`)
              : t('« Mon école » prendra les couleurs de ton école dès que tu l’auras choisie dans ton profil.', '« Lekòl mwen » ap pran koulè lekòl ou lè w chwazi l nan pwofil ou.')}
            options={colorOpts('primary')}
            value={cfg.shirt} onChange={(v) => set('shirt', v)}
          />
          <Choice
            {...common} kind="swatch" legend={t('Cravate, col et finitions', 'Kravat, kolye ak bò yo')}
            options={colorOpts('secondary')}
            value={cfg.tie} onChange={(v) => set('tie', v)}
          />
        </>
      );
      break;
  }

  const atOrigin = sameConfig(cfg, origin);
  const note = status === 'saved' && !dirty
    ? t('C’est enregistré. Tes camarades verront ce visage.', 'Li anrejistre. Kamarad ou yo ap wè figi sa a.')
    : status === 'failed'
      ? t('Échec de l’enregistrement. Réessaie.', 'Anrejistreman an echwe. Eseye ankò.')
      : dirty ? t('Modifications non enregistrées', 'Chanjman pa anrejistre') : t('Aucune modification', 'Pa gen chanjman');
  const chip: StyleProp<ViewStyle> = { minHeight: touch.min, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center' };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      {header}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[{ paddingBottom: 32 }, column]}
        showsVerticalScrollIndicator={false}
      >
        <PageTitle
          title={t('Mon avatar', 'Avatar mwen')}
          subtitle={t('Ton visage dans l’Arène, les classements et les défis.', 'Figi ou nan Arèn nan, klasman yo ak defi yo.')}
        />
        {preview ? (
          <Text style={[typeScale.status, { color: colors.coralInk, paddingHorizontal: GUTTER, marginTop: 8 }]}>
            {t('Aperçu de développement — rien n’est enregistré', 'Apèsi devlopman — anyen pa anrejistre')}
          </Text>
        ) : null}

        {/* Live preview */}
        <View style={{ paddingHorizontal: GUTTER, marginTop: 20 }}>
          <View style={[featureSurface, { padding: 20, alignItems: 'center', gap: 16 }]}>
            <Avatar
              seed={uid} config={cfg} colors={schoolTint} mood={mood} size={Math.min(168, colWidth - 140)} still
              title={t('Aperçu de ton avatar', 'Apèsi avatar ou')}
            />
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel={t('Voir une humeur', 'Gade yon imè')}
              style={{ alignSelf: 'stretch' }}
            >
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, flexGrow: 1, justifyContent: 'center' }}>
              {MOODS.map(([m, fr, ht]) => {
                const on = mood === m;
                return (
                  <Pressable
                    key={m}
                    onPress={() => setMood(m)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={t(fr, ht)}
                    style={[chip, { backgroundColor: on ? colors.azureSoft : colors.surfaceAlt }]}
                  >
                    <Text style={{ fontFamily: on ? fonts.bold : fonts.medium, fontSize: 15, lineHeight: 20, color: on ? colors.azureInk : colors.ink }}>{t(fr, ht)}</Text>
                  </Pressable>
                );
              })}
              </ScrollView>
            </View>
            <View style={{ alignSelf: 'stretch', gap: 4 }}>
              <Button
                variant="secondary"
                label={t('Aléatoire', 'O aza')}
                onPress={onRandom}
                fullWidth
                icon={<Shuffle size={18} color={isDark ? colors.ink : colors.azureInk} strokeWidth={2.2} />}
              />
              <Button
                variant="ghost"
                label={t('Revenir à mon avatar d’origine', 'Retounen nan avatar orijinal mwen')}
                onPress={onOrigin}
                disabled={atOrigin}
                fullWidth
              />
            </View>
          </View>
        </View>

        {/* Sections */}
        <View style={{ paddingHorizontal: GUTTER, marginTop: 20 }}>
          <Segmented
            scroll
            options={SECTIONS.map((s) => ({ key: s, label: t(...SECTION_TEXT[s]) }))}
            value={section}
            onChange={(k) => setSection(k)}
          />
        </View>
        <View style={{ paddingHorizontal: GUTTER, marginTop: 12 }}>
          <View style={[cardSurface, { padding: 20, gap: 28 }]}>{panel}</View>
        </View>
      </ScrollView>

      {/* Pinned save bar: opaque, lifted by shadow — no rule above it. */}
      <SafeAreaView edges={['bottom']} style={[{ backgroundColor: colors.surface }, elevation.card, { shadowOffset: { width: 0, height: -8 } }]}>
        <View style={[{ paddingHorizontal: GUTTER, paddingTop: 12, paddingBottom: 12, gap: 8 }, column]}>
          <Text
            accessibilityLiveRegion="polite"
            style={[typeScale.status, { color: status === 'failed' ? (isDark ? colors.danger : '#B91C1C') : colors.muted, textAlign: 'center' }]}
          >
            {note}
          </Text>
          <Button
            size="lg"
            fullWidth
            label={status === 'saving' ? t('Enregistrement…', 'Ap anrejistre…') : t('Enregistrer', 'Anrejistre')}
            loading={status === 'saving'}
            disabled={!dirty && status !== 'failed'}
            onPress={onSave}
          />
        </View>
      </SafeAreaView>
    </SafeAreaView>
  );
}

