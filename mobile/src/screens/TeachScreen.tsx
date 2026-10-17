/**
 * TeachScreen — volunteer-instructor application ("Vin anseye").
 *
 * Mobile mirror of the web /enseigner page: same fields, same
 * /api/instructor-apply endpoint (source: 'mobile'). Public — no sign-in
 * required (applicants are teachers, usually without a student account).
 * Presented as a root-stack modal with an X button. Every string is FR/HT.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, CheckCircle2 } from 'lucide-react-native';
import useStore from '../contexts/store';
import { useTheme, radius, typeScale } from '../theme/theme';
import Button from '../components/ui/Button';

const APPLY_URL = 'https://academy.edlight.org/api/instructor-apply';
const GUTTER = 20;

const SUBJECTS = [
  { value: 'math', fr: 'Mathématiques', ht: 'Matematik' },
  { value: 'physics', fr: 'Physique', ht: 'Fizik' },
  { value: 'chemistry', fr: 'Chimie', ht: 'Chimi' },
  { value: 'economics', fr: 'Économie', ht: 'Ekonomi' },
  { value: 'other', fr: 'Autre', ht: 'Lòt' },
];

const LEVELS = [
  { value: '9af', label: '9e AF' },
  { value: 'ns1', label: 'NS I' },
  { value: 'ns2', label: 'NS II' },
  { value: 'ns3', label: 'NS III' },
  { value: 'ns4', label: 'NS IV' },
];

const EXPERIENCE = [
  { value: '0-2', fr: '0–2 ans', ht: '0–2 ane' },
  { value: '3-5', fr: '3–5 ans', ht: '3–5 ane' },
  { value: '6-10', fr: '6–10 ans', ht: '6–10 ane' },
  { value: '10+', fr: '10+ ans', ht: '10+ ane' },
];

type Status = 'idle' | 'sending' | 'sent' | 'error';

export default function TeachScreen({ onClose }: { onClose?: () => void }) {
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const { colors, cardSurface, featureSurface, fonts, isDark } = useTheme();
  const [focused, setFocused] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [school, setSchool] = useState('');
  const [subjects, setSubjects] = useState<string[]>([]);
  const [levels, setLevels] = useState<string[]>([]);
  const [experience, setExperience] = useState('');
  const [motivation, setMotivation] = useState('');
  const [status, setStatus] = useState<Status>('idle');

  const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const canSubmit =
    !!(name.trim() && email.trim() && whatsapp.trim() && school.trim() &&
      subjects.length && levels.length && experience) && status !== 'sending';

  const submit = async () => {
    if (!canSubmit) return;
    setStatus('sending');
    try {
      const res = await fetch(APPLY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, email, whatsapp, school, subjects, levels, experience, motivation,
          lang: isCreole ? 'ht' : 'fr', source: 'mobile',
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setStatus('sent');
    } catch {
      setStatus('error');
    }
  };

  // Opaque grey field, 56 tall; an azure focus ring while typing.
  const inputStyle = (key: string) => ({
    backgroundColor: focused === key ? colors.surface : colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: focused === key ? colors.azure : 'transparent',
    borderRadius: radius.control,
    paddingHorizontal: 16,
    minHeight: 56,
    fontFamily: fonts.regular,
    fontSize: 17,
    color: colors.ink,
  } as const);
  const focus = (key: string) => ({ onFocus: () => setFocused(key), onBlur: () => setFocused(null) });

  const Label = ({ children }: { children: React.ReactNode }) => (
    <Text style={{ fontFamily: fonts.medium, fontSize: 15, lineHeight: 20, color: colors.muted, marginBottom: 6, marginTop: 18 }}>{children}</Text>
  );

  const Chip = ({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) => (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      style={{
        paddingHorizontal: 16,
        minHeight: 44,
        justifyContent: 'center',
        borderRadius: 999,
        backgroundColor: on ? colors.azureFill : colors.surfaceAlt,
      }}
    >
      <Text style={{ fontFamily: fonts.bold, fontSize: 15, color: on ? '#ffffff' : colors.ink }}>{label}</Text>
    </TouchableOpacity>
  );

  const header = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingLeft: onClose ? 8 : GUTTER,
        paddingRight: GUTTER,
        paddingTop: 8,
        paddingBottom: 12,
      }}
    >
      {onClose && (
        <TouchableOpacity
          onPress={onClose}
          activeOpacity={0.7}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
          accessibilityRole="button"
          accessibilityLabel={t('Retour', 'Retounen')}
        >
          <ChevronLeft size={26} color={colors.ink} strokeWidth={2.2} />
        </TouchableOpacity>
      )}
      <Text accessibilityRole="header" numberOfLines={1} style={[typeScale.pageTitle, { color: colors.ink, flex: 1, fontSize: 28, lineHeight: 33 }]}>
        {t('Devenir enseignant', 'Vin yon pwofesè')}
      </Text>
    </View>
  );

  if (status === 'sent') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
        {header}
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: GUTTER }}>
          <View style={[featureSurface, { padding: 24, alignItems: 'center', gap: 12 }]}>
          <CheckCircle2 size={48} color={colors.successFill} />
          <Text accessibilityRole="header" style={[typeScale.section, { color: colors.ink, textAlign: 'center' }]}>
            {t('Candidature envoyée !', 'Aplikasyon ou an ale !')}
          </Text>
          <Text style={[typeScale.body, { color: colors.muted, textAlign: 'center' }]}>
            {t(
              'Merci ! Notre équipe examine chaque candidature et te contactera sur WhatsApp, généralement sous une à deux semaines.',
              'Mèsi ! Ekip nou an gade chak aplikasyon epi n ap kontakte ou sou WhatsApp, anjeneral nan 1 a 2 semèn.',
            )}
          </Text>
          <Button label={t('Fermer', 'Fèmen')} onPress={onClose} fullWidth style={{ marginTop: 8 }} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      {header}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[typeScale.body, { color: colors.muted }]}>
            {t(
              'EdLight recrute des enseignants bénévoles pour créer des leçons et des exercices dans leur matière. Ta salle de classe devient tout le pays.',
              'EdLight ap chèche pwofesè volontè pou kreye leson ak egzèsis nan matyè yo. Klas ou a vin tout peyi a.',
            )}
          </Text>

          {/* How it works — a real 3-step sequence */}
          <View style={{ ...cardSurface, padding: 20, marginTop: 16, gap: 14 }}>
            {[
              { n: '1', fr: 'Tu postules', ht: 'Ou aplike' },
              { n: '2', fr: 'On te contacte sur WhatsApp', ht: 'Nou kontakte ou sou WhatsApp' },
              { n: '3', fr: 'Tu crées tes leçons', ht: 'Ou kreye leson ou yo' },
            ].map(({ n, fr, ht }) => (
              <View key={n} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt }}>
                  <Text style={{ fontFamily: fonts.heading, fontSize: 16, color: isDark ? colors.ink : colors.azureInk }}>{n}</Text>
                </View>
                <Text style={[typeScale.bodyMd, { color: colors.ink, flex: 1 }]}>{t(fr, ht)}</Text>
              </View>
            ))}
          </View>

          <Label>{t('Nom complet *', 'Non konplè *')}</Label>
          <TextInput style={inputStyle('name')} {...focus('name')} value={name} onChangeText={setName} maxLength={120}
            autoComplete="name" placeholderTextColor={colors.faint} placeholder={t('Ton nom', 'Non ou')} />

          <Label>Email *</Label>
          <TextInput style={inputStyle('email')} {...focus('email')} value={email} onChangeText={setEmail} maxLength={200}
            keyboardType="email-address" autoCapitalize="none" autoComplete="email"
            placeholderTextColor={colors.faint} placeholder="nom@email.com" />

          <Label>WhatsApp *</Label>
          <TextInput style={inputStyle('wa')} {...focus('wa')} value={whatsapp} onChangeText={setWhatsapp} maxLength={40}
            keyboardType="phone-pad" autoComplete="tel"
            placeholderTextColor={colors.faint} placeholder="+509 …" />

          <Label>{t('École actuelle *', 'Lekòl kote w ap anseye *')}</Label>
          <TextInput style={inputStyle('school')} {...focus('school')} value={school} onChangeText={setSchool} maxLength={200}
            placeholderTextColor={colors.faint} placeholder={t('Nom de l’établissement', 'Non etablisman an')} />

          <Label>{t('Matières *', 'Matyè *')}</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {SUBJECTS.map((s) => (
              <Chip key={s.value} on={subjects.includes(s.value)} label={t(s.fr, s.ht)}
                onPress={() => toggle(subjects, setSubjects, s.value)} />
            ))}
          </View>

          <Label>{t('Niveaux *', 'Nivo *')}</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {LEVELS.map((l) => (
              <Chip key={l.value} on={levels.includes(l.value)} label={l.label}
                onPress={() => toggle(levels, setLevels, l.value)} />
            ))}
          </View>

          <Label>{t('Années d’expérience *', 'Ane eksperyans *')}</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {EXPERIENCE.map((x) => (
              <Chip key={x.value} on={experience === x.value} label={t(x.fr, x.ht)}
                onPress={() => setExperience(experience === x.value ? '' : x.value)} />
            ))}
          </View>

          <Label>{t('Pourquoi veux-tu enseigner sur EdLight ?', 'Poukisa ou vle anseye sou EdLight ?')}</Label>
          <TextInput
            style={[inputStyle('why'), { minHeight: 120, paddingTop: 14, textAlignVertical: 'top' }]}
            {...focus('why')}
            value={motivation} onChangeText={setMotivation} maxLength={2000} multiline
            placeholderTextColor={colors.faint} placeholder={t('Quelques phrases suffisent.', 'Kèk fraz sifi.')}
          />

          {status === 'error' && (
            <Text style={[typeScale.status, { marginTop: 14, color: colors.danger }]} accessibilityRole="alert">
              {t('L’envoi a échoué. Vérifie ta connexion, puis réessaie.', 'Voye a echwe. Tcheke koneksyon ou, epi eseye ankò.')}
            </Text>
          )}

          <Button
            size="lg"
            fullWidth
            onPress={submit}
            disabled={!canSubmit}
            loading={status === 'sending'}
            label={t('Envoyer ma candidature', 'Voye aplikasyon mwen')}
            style={{ marginTop: 24 }}
          />

          <Text style={[typeScale.caption, { color: colors.muted, marginTop: 12 }]}>
            {t(
              'Postuler ne garantit pas une place : chaque candidature est examinée par notre équipe. L’enseignement sur EdLight est bénévole.',
              'Aplike pa garanti yon plas : ekip nou an gade chak aplikasyon. Anseye sou EdLight se yon travay volontè.',
            )}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
