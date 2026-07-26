import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { GraduationCap } from 'lucide-react-native';
import useStore from '../contexts/store';
import { GRADES } from '../config/trackConfig';
import { useColors, typeScale, radius } from '../theme/theme';

/**
 * One-time "Quelle classe ?" prompt, shown right after the language choice (and
 * once for existing users, who default to gradeChosen=false). The grade drives
 * adaptive content (see gradeProfile / pickHomeSuggestion). One tap picks a
 * grade; "Passer" skips without a grade. Never blocks — both paths set
 * gradeChosen so it won't ask again.
 */
export default function WelcomeGradeModal() {
  const hydrated = useStore((s) => s.hydrated);
  const authConfirmed = useStore((s) => s.authConfirmed);
  const gradeChosen = useStore((s) => s.gradeChosen);
  const language = useStore((s) => s.language);
  const setGrade = useStore((s) => s.setGrade);
  const setGradeChosen = useStore((s) => s.setGradeChosen);
  const colors = useColors();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  // Wait for authConfirmed so the prompt appears over the real dashboard, not
  // the loading splash (whose logo otherwise bleeds faintly behind the sheet).
  const visible = hydrated && authConfirmed && !gradeChosen;

  const choose = (code: string) => {
    setGrade(code);
    setGradeChosen(true);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.surface }]} accessibilityViewIsModal>
          <View style={[styles.iconWrap, { backgroundColor: colors.azureSoft }]}>
            <GraduationCap color={colors.azure} size={30} />
          </View>

          <Text maxFontSizeMultiplier={1.3} style={[styles.title, { color: colors.ink }]}>
            {t('Tu es en quelle classe ?', 'Ki klas ou ye ?')}
          </Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            {t('Pour te proposer le bon contenu.', 'Pou n ba w bon kontni an.')}
          </Text>

          <View style={styles.grid}>
            {GRADES.map((g) => (
              <TouchableOpacity
                key={g.code}
                onPress={() => choose(g.code)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={isCreole ? g.labelHt : g.label}
                style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
              >
                <Text style={[styles.chipText, { color: colors.ink }]} numberOfLines={2}>
                  {isCreole ? g.labelHt : g.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            onPress={() => setGradeChosen(true)}
            activeOpacity={0.7}
            style={styles.skip}
            accessibilityRole="button"
            accessibilityLabel={t('Passer', 'Sote')}
          >
            <Text style={[styles.skipText, { color: colors.faint }]}>{t('Passer', 'Sote')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 420, borderRadius: radius.hero, padding: 24, alignItems: 'center' },
  iconWrap: { width: 60, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title: { ...typeScale.h1, textAlign: 'center' },
  subtitle: { ...typeScale.body, textAlign: 'center', marginTop: 6, marginBottom: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  chip: { width: '47%', minHeight: 52, borderRadius: radius.control, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 10 },
  chipText: { ...typeScale.titleSm, textAlign: 'center' },
  skip: { marginTop: 18, paddingVertical: 6, paddingHorizontal: 16 },
  skipText: { ...typeScale.bodyMd },
});
