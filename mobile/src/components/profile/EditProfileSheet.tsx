import React, { useRef } from 'react';
import { Modal, Platform, Pressable, Text, View } from 'react-native';
import { GraduationCap, Pencil, School as SchoolIcon, User as UserIcon, X } from 'lucide-react-native';
import { SettingsRow } from './SettingsCard';
import PressableScale from '../ui/PressableScale';
import { useTheme, touch } from '../../theme/theme';
import { useReduceMotion } from '../../utils/motion';

export type ProfileField = 'name' | 'grade' | 'school' | 'avatar';

/**
 * "Modifier" on the Profil identity card.
 *
 * From TestFlight feedback on build 63 ("how do we change your school?"): the
 * card showed "NS I · Collège …" beside a button labelled "Modifier" that only
 * ever opened the class picker. Each fact the card shows now has its own row
 * here, and each row opens the editor that already exists for it.
 *
 * Every editor is itself a Modal, and iOS cannot present one while another is
 * still dismissing — so the choice is held until this sheet is fully gone
 * (`onDismiss`, iOS only; Android has no such restriction).
 */
export default function EditProfileSheet({
  visible,
  isCreole,
  name,
  grade,
  school,
  onChoose,
  onClose,
}: {
  visible: boolean;
  isCreole: boolean;
  name: string | null;
  grade: string | null;
  school: string | null;
  onChoose: (field: ProfileField) => void;
  onClose: () => void;
}) {
  const { colors, radius, typeScale } = useTheme();
  const reduce = useReduceMotion();
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const pending = useRef<ProfileField | null>(null);

  const flush = () => {
    const f = pending.current;
    pending.current = null;
    if (f) onChoose(f);
  };

  const pick = (f: ProfileField) => {
    pending.current = f;
    onClose();
    if (Platform.OS !== 'ios') flush();
  };

  const notSet = t('À choisir', 'Pou chwazi');

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduce ? 'none' : 'slide'}
      onRequestClose={onClose}
      onDismiss={flush}
    >
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.55)' }}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('Fermer', 'Fèmen')}
      />
      <View
        accessibilityViewIsModal
        style={{
          backgroundColor: colors.surface,
          borderTopLeftRadius: radius.hero,
          borderTopRightRadius: radius.hero,
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: 34,
        }}
      >
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 8 }}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text accessibilityRole="header" style={[typeScale.cardTitle, { color: colors.ink }]}>
            {t('Modifier mon profil', 'Modifye pwofil mwen')}
          </Text>
          <PressableScale
            onPress={onClose}
            haptic={false}
            accessibilityRole="button"
            accessibilityLabel={t('Fermer', 'Fèmen')}
            style={{ width: touch.min, height: touch.min, alignItems: 'center', justifyContent: 'center', marginRight: -10 }}
          >
            <X size={22} color={colors.muted} />
          </PressableScale>
        </View>

        <SettingsRow
          icon={UserIcon}
          label={t('Nom complet', 'Non konplè')}
          value={name || notSet}
          onPress={() => pick('name')}
          accessibilityLabel={`${t('Modifier mon nom', 'Chanje non mwen')}, ${name || notSet}`}
        />
        <SettingsRow
          icon={GraduationCap}
          label={t('Classe', 'Klas')}
          value={grade || notSet}
          onPress={() => pick('grade')}
          accessibilityLabel={`${t('Modifier ma classe', 'Chanje klas mwen')}, ${grade || notSet}`}
        />
        <SettingsRow
          icon={SchoolIcon}
          label={t('École', 'Lekòl')}
          value={school || notSet}
          onPress={() => pick('school')}
          accessibilityLabel={`${school ? t('Changer d’école', 'Chanje lekòl') : t('Choisir mon école', 'Chwazi lekòl mwen')}, ${school || notSet}`}
        />
        <SettingsRow
          icon={Pencil}
          label={t('Avatar', 'Avatar')}
          onPress={() => pick('avatar')}
          accessibilityLabel={t('Modifier mon avatar', 'Modifye avatar mwen')}
        />
      </View>
    </Modal>
  );
}
