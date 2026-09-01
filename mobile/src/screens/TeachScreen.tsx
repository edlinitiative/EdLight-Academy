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
import { X, GraduationCap, MessageCircle, Video, CheckCircle2 } from 'lucide-react-native';
import useStore from '../contexts/store';
import { useTheme, radius, typeScale } from '../theme/theme';
import PressableScale from '../components/ui/PressableScale';

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
  const { colors, cardSurface } = useTheme();

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

  const inputStyle = {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.tile,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.ink,
  } as const;

  const Label = ({ children }: { children: React.ReactNode }) => (
    <Text style={[typeScale.label, { color: colors.ink, marginBottom: 6, marginTop: 16 }]}>{children}</Text>
  );

  const Chip = ({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) => (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: on ? colors.azure : colors.border,
        backgroundColor: on ? colors.azureSoft : colors.surface,
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: '700', color: on ? colors.azure : colors.muted }}>{label}</Text>
    </TouchableOpacity>
  );

  const header = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: GUTTER,
        paddingTop: 8,
        paddingBottom: 10,
      }}
    >
      <Text style={[typeScale.title, { color: colors.ink }]}>{t('Devenir enseignant', 'Vin yon pwofesè')}</Text>
      {onClose && (
        <TouchableOpacity
          onPress={onClose}
          activeOpacity={0.7}
          style={{
            width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
            backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
          }}
          accessibilityLabel={t('Fermer', 'Fèmen')}
        >
          <X size={18} color={colors.muted} />
        </TouchableOpacity>
      )}
    </View>
  );

  if (status === 'sent') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
        {header}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 }}>
          <CheckCircle2 size={44} color={colors.success} />
          <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink, textAlign: 'center' }}>
            {t('Candidature envoyée !', 'Aplikasyon ou an ale !')}
          </Text>
          <Text style={{ fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 19 }}>
            {t(
              'Merci ! Notre équipe examine chaque candidature et vous contactera sur WhatsApp, généralement sous une à deux semaines.',
              'Mèsi ! Ekip nou an gade chak aplikasyon epi n ap kontakte ou sou WhatsApp, anjeneral nan 1 a 2 semèn.',
            )}
          </Text>
          <TouchableOpacity
            onPress={onClose}
            activeOpacity={0.8}
            style={{ backgroundColor: colors.azure, borderRadius: 999, paddingHorizontal: 28, paddingVertical: 12, marginTop: 6 }}
          >
            <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 14 }}>{t('Fermer', 'Fèmen')}</Text>
          </TouchableOpacity>
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
          <Text style={[typeScale.caption, { color: colors.muted, lineHeight: 19 }]}>
            {t(
              'EdLight recrute des enseignants bénévoles pour créer des leçons et des exercices dans leur matière. Votre salle de classe devient tout le pays.',
              'EdLight ap chèche pwofesè volontè pou kreye leson ak egzèsis nan matyè yo. Klas ou a vin tout peyi a.',
            )}
          </Text>

          {/* How it works — a real 3-step sequence */}
          <View style={{ ...cardSurface, padding: 14, marginTop: 14, gap: 10 }}>
            {[
              { Icon: GraduationCap, fr: '1. Postulez', ht: '1. Aplike' },
              { Icon: MessageCircle, fr: '2. On vous contacte sur WhatsApp', ht: '2. Nou kontakte ou sou WhatsApp' },
              { Icon: Video, fr: '3. Vous créez vos leçons', ht: '3. Ou kreye leson ou yo' },
            ].map(({ Icon, fr, ht }) => (
              <View key={fr} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 30, height: 30, borderRadius: radius.chip, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.azureSoft }}>
                  <Icon size={15} color={colors.azure} />
                </View>
                <Text style={[typeScale.caption, { color: colors.ink, flex: 1 }]}>{t(fr, ht)}</Text>
              </View>
            ))}
          </View>

          <Label>{t('Nom complet *', 'Non konplè *')}</Label>
          <TextInput style={inputStyle} value={name} onChangeText={setName} maxLength={120}
            autoComplete="name" placeholderTextColor={colors.faint} placeholder={t('Votre nom', 'Non ou')} />

          <Label>Email *</Label>
          <TextInput style={inputStyle} value={email} onChangeText={setEmail} maxLength={200}
            keyboardType="email-address" autoCapitalize="none" autoComplete="email"
            placeholderTextColor={colors.faint} placeholder="nom@email.com" />

          <Label>WhatsApp *</Label>
          <TextInput style={inputStyle} value={whatsapp} onChangeText={setWhatsapp} maxLength={40}
            keyboardType="phone-pad" autoComplete="tel"
            placeholderTextColor={colors.faint} placeholder="+509 …" />

          <Label>{t('École actuelle *', 'Lekòl kote w ap anseye *')}</Label>
          <TextInput style={inputStyle} value={school} onChangeText={setSchool} maxLength={200}
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

          <Label>{t('Pourquoi voulez-vous enseigner sur EdLight ?', 'Poukisa ou vle anseye sou EdLight ?')}</Label>
          <TextInput
            style={[inputStyle, { minHeight: 110, textAlignVertical: 'top' }]}
            value={motivation} onChangeText={setMotivation} maxLength={2000} multiline
            placeholderTextColor={colors.faint} placeholder={t('Quelques phrases suffisent.', 'Kèk fraz sifi.')}
          />

          {status === 'error' && (
            <Text style={{ marginTop: 14, color: colors.danger, fontSize: 13 }} accessibilityRole="alert">
              {t('L’envoi a échoué. Vérifiez votre connexion, puis réessayez.', 'Voye a echwe. Tcheke koneksyon ou, epi eseye ankò.')}
            </Text>
          )}

          <PressableScale
            onPress={submit}
            disabled={!canSubmit}
            accessibilityRole="button"
            style={{
              marginTop: 20,
              backgroundColor: canSubmit ? colors.azureFill : colors.border,
              borderRadius: 999,
              paddingVertical: 14,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: canSubmit ? '#ffffff' : colors.faint, fontWeight: '800', fontSize: 15 }}>
              {status === 'sending' ? t('Envoi…', 'Ap voye…') : t('Envoyer ma candidature', 'Voye aplikasyon mwen')}
            </Text>
          </PressableScale>

          <Text style={[typeScale.micro, { color: colors.faint, marginTop: 10, lineHeight: 16 }]}>
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
