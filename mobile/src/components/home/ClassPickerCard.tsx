import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { CheckCircle2, Circle, PlayCircle, PenLine, BadgeCheck } from 'lucide-react-native';
import useStore from '../../contexts/store';
import PressableScale from '../ui/PressableScale';
import { useTheme } from '../../theme/theme';
import { select, tapLight } from '../../utils/haptics';
import { updateUserGrade } from '../../services/firebase';

/** The four classes the video catalogue covers, as the student reads them. */
const COVERED = [
  { code: 'NS1', label: 'NS I' },
  { code: 'NS2', label: 'NS II' },
  { code: 'NS3', label: 'NS III' },
  { code: 'NS4', label: 'NS IV' },
];

/**
 * "Quelle classe ?" inline (Stitch 02): for a student with no class yet, Home
 * asks right where the content will appear instead of hiding the question in
 * a modal. One tap sets the class (store + user doc, same as
 * WelcomeGradeModal.finish) and Home re-renders for it. The full list (7e–9e,
 * après le Bac) stays one link away in the existing sheet.
 *
 * Tiles carry the NS level alone — no invented old-system names (§0.7).
 */
export default function ClassPickerCard() {
  const { colors, cardSurface, featureSurface, typeScale, fonts, radius, isDark } = useTheme();
  const language = useStore((s) => s.language);
  const user = useStore((s) => s.user);
  const grade = useStore((s) => s.grade);
  const setGrade = useStore((s) => s.setGrade);
  const setGradeChosen = useStore((s) => s.setGradeChosen);
  const t = (fr: string, ht: string) => (language === 'ht' ? ht : fr);

  const choose = (code: string) => {
    select();
    setGrade(code);
    setGradeChosen(true);
    // Fire-and-forget; guests are backfilled at sign-in (App.tsx AuthGate).
    if (user?.uid) updateUserGrade(user.uid, code);
  };

  return (
    <View style={{ ...featureSurface, padding: 20 }}>
      <Text accessibilityRole="header" style={[typeScale.cardTitle, { color: colors.ink, fontSize: 22, lineHeight: 27 }]}>
        {t('Quelle classe ?', 'Ki klas ou ?')}
      </Text>
      <Text style={[typeScale.meta, { color: colors.muted, marginTop: 4 }]}>
        {t('Choisis ton niveau pour adapter ton programme', 'Chwazi nivo ou pou nou adapte pwogram ou')}
      </Text>
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 18 }}>
        {COVERED.map((g) => {
          const on = grade === g.code;
          return (
            <PressableScale
              key={g.code}
              onPress={() => choose(g.code)}
              pressedScale={0.97}
              haptic={false}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, checked: on }}
              accessibilityLabel={g.label}
              style={{
                ...(on ? {} : cardSurface),
                backgroundColor: on ? colors.azureSoft : (isDark ? colors.surfaceAlt : colors.surface),
                borderRadius: radius.tile + 2,
                // Two per row: (card width - gap) / 2.
                flexBasis: '47%', flexGrow: 1,
                minHeight: 96, padding: 16,
                flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
              }}
            >
              <Text maxFontSizeMultiplier={1.4} style={{ fontFamily: fonts.heading, fontSize: 22, lineHeight: 27, letterSpacing: -0.5, color: on ? colors.azureInk : colors.ink }}>
                {g.label}
              </Text>
              {on
                ? <CheckCircle2 color={colors.azureInk} size={22} strokeWidth={2.2} />
                : <Circle color={colors.border} size={22} strokeWidth={2} />}
            </PressableScale>
          );
        })}
      </View>
      <TouchableOpacity
        onPress={() => { tapLight(); setGradeChosen(false); }}
        accessibilityRole="button"
        accessibilityLabel={t('Autre classe : 7e, 8e, 9e ou après le Bac', 'Lòt klas : 7yèm, 8yèm, 9yèm oswa apre Bak')}
        style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', marginTop: 8 }}
      >
        <Text style={{ fontFamily: fonts.bold, fontSize: 16, lineHeight: 21, color: colors.azureInk }}>
          {t('Autre classe (7e à 9e, après le Bac)', 'Lòt klas (7yèm rive 9yèm, apre Bak)')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

/** "Comment ça marche" — the three rungs of the ladder, for a first visit. */
export function HowItWorksCard() {
  const { colors, cardSurface, typeScale, fonts } = useTheme();
  const language = useStore((s) => s.language);
  const t = (fr: string, ht: string) => (language === 'ht' ? ht : fr);
  const steps = [
    { Icon: PlayCircle, title: t('Regarde la leçon', 'Gade leson an'), body: t('Des vidéos courtes sur le programme du nouveau secondaire', 'Videyo kout sou pwogram nouvo segondè a') },
    { Icon: PenLine, title: t('Pratique', 'Pratike'), body: t('Des questions ciblées pour vérifier que tu as compris', 'Kesyon ki vize pou verifye ou konprann') },
    { Icon: BadgeCheck, title: t('Maîtrise le chapitre', 'Metrize chapit la'), body: t('Le test du chapitre confirme ce que tu sais', 'Tès chapit la konfime sa ou konnen') },
  ];
  return (
    <View style={{ ...cardSurface, padding: 20 }}>
      <Text accessibilityRole="header" style={[typeScale.cardTitle, { color: colors.ink }]}>
        {t('Comment ça marche', 'Kijan sa mache')}
      </Text>
      <View style={{ gap: 16, marginTop: 16 }}>
        {steps.map(({ Icon, title, body }) => (
          <View key={title} accessible accessibilityLabel={`${title}. ${body}`} style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.azureSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Icon color={colors.azureInk} size={20} strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 16, lineHeight: 21, color: colors.ink }}>{title}</Text>
              <Text style={[typeScale.meta, { color: colors.muted, marginTop: 2 }]}>{body}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
