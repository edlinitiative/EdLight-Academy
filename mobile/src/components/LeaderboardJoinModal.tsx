/**
 * LeaderboardJoinModal — join/edit the public leaderboard profile.
 * Mirrors the web form: pseudo (≥1 letter required, never fabricated),
 * optional school, and ville picked département → commune (haitiGeo) with an
 * "Autre ville…" free-text escape. Diaspora goes straight to free text.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { X, ShieldCheck, ChevronDown, Check } from 'lucide-react-native';
import useStore from '../contexts/store';
import { useTrivia } from '../hooks/useTrivia';
import { isValidAlias } from '../services/leaderboardService';
import { HAITI_DEPARTMENTS, OTHER_CITY, citiesOf, findCity } from '../data/haitiGeo';

const PRIMARY = '#0857A6';

function defaultAlias(name?: string | null) {
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  // The auth layer substitutes "Élève"/"Elèv" when Firebase has no name —
  // that's a placeholder, not a real first name, so don't prefill with it.
  if (/^(élève|eleve|elèv|elev)$/i.test(first)) return '';
  return first;
}

/** Bottom-sheet single-select list (replaces the web <select>). */
function OptionSheet({ visible, title, options, onPick, onClose }: {
  visible: boolean; title: string; options: { value: string; label: string }[];
  onPick: (v: string) => void; onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(10,20,40,0.45)' }} activeOpacity={1} onPress={onClose} />
      <View style={{ maxHeight: '70%', backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingBottom: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderColor: '#eef1f6' }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: '#0f172a' }}>{title}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <X size={20} color="#64748b" />
          </TouchableOpacity>
        </View>
        <ScrollView>
          {options.map((o) => (
            <TouchableOpacity
              key={o.value}
              onPress={() => { onPick(o.value); onClose(); }}
              style={{ paddingVertical: 13, paddingHorizontal: 18, borderBottomWidth: 1, borderColor: '#f4f6fa' }}
            >
              <Text style={{ fontSize: 15, color: '#1f2937' }}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

/** Field trigger that looks like a select. */
function SelectField({ label, value, placeholder, onPress }: { label: string; value?: string | null; placeholder: string; onPress: () => void }) {
  return (
    <View style={{ gap: 5 }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748b' }}>{label}</Text>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#dbe2ec', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, backgroundColor: '#fff' }}
      >
        <Text style={{ fontSize: 15, color: value ? '#0f172a' : '#9aa4b2' }}>{value || placeholder}</Text>
        <ChevronDown size={16} color="#9aa4b2" />
      </TouchableOpacity>
    </View>
  );
}

export default function LeaderboardJoinModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { user, language } = useStore();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const { profile, setLeaderboardOptIn } = useTrivia();

  const [alias, setAlias] = useState('');
  const [school, setSchool] = useState('');
  const [department, setDepartment] = useState('');
  const [cityChoice, setCityChoice] = useState('');
  const [customCity, setCustomCity] = useState('');
  const [saving, setSaving] = useState(false);
  const [sheet, setSheet] = useState<null | 'dept' | 'city'>(null);

  // Seed from the saved profile every time the modal opens; legacy free-typed
  // cities snap onto the canonical commune when they match one.
  useEffect(() => {
    if (!visible) return;
    const lb: any = profile?.leaderboard || {};
    setAlias(lb.displayName || defaultAlias(user?.name));
    setSchool(lb.school || '');
    const known = lb.city ? findCity(lb.city) : null;
    if (known) {
      setDepartment(known.department);
      setCityChoice(known.city);
      setCustomCity('');
    } else {
      setDepartment(lb.department || '');
      setCityChoice(lb.city ? OTHER_CITY : '');
      setCustomCity(lb.city || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const deptCities = useMemo(() => citiesOf(department), [department]);
  const aliasOk = isValidAlias(alias.trim());

  const pickDepartment = (name: string) => {
    setDepartment(name);
    // Diaspora has no commune list → jump straight to the free-text field.
    setCityChoice(name && citiesOf(name).length === 0 ? OTHER_CITY : '');
    setCustomCity('');
  };

  const save = async () => {
    if (!aliasOk || saving) return;
    setSaving(true);
    try {
      const city = cityChoice === OTHER_CITY ? customCity.trim() : cityChoice;
      await setLeaderboardOptIn({
        optedIn: true,
        displayName: alias.trim().slice(0, 24),
        school: school.trim() || null,
        city: city || null,
        department: department || null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(10,20,40,0.45)' }} activeOpacity={1} onPress={onClose} />
        <View style={{ backgroundColor: '#f7f9fc', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 30, gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ShieldCheck size={18} color="#10b981" />
            <Text style={{ flex: 1, fontSize: 16, fontWeight: '800', color: '#0f172a' }}>
              {t('Mon profil de classement', 'Pwofil klasman mwen')}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={20} color="#64748b" />
            </TouchableOpacity>
          </View>
          <Text style={{ fontSize: 12.5, color: '#64748b', marginTop: -6 }}>
            {t(
              'Vous apparaissez avec un pseudo — vous restez anonyme.',
              'Ou parèt ak yon ti non — ou rete anonim.',
            )}
          </Text>

          <View style={{ gap: 5 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748b' }}>{t('Pseudo affiché', 'Ti non pou afiche')}</Text>
            <TextInput
              value={alias}
              onChangeText={setAlias}
              maxLength={24}
              placeholder={t('Votre pseudo', 'Ti non ou')}
              placeholderTextColor="#9aa4b2"
              style={{ borderWidth: 1, borderColor: aliasOk || !alias ? '#dbe2ec' : '#f59e0b', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, backgroundColor: '#fff', color: '#0f172a' }}
            />
            {!aliasOk && (
              <Text style={{ fontSize: 11.5, fontWeight: '600', color: '#b45309' }}>
                {t(
                  'Choisissez un pseudo (au moins une lettre) pour apparaître dans le classement.',
                  'Chwazi yon ti non (omwen yon lèt) pou parèt nan klasman an.',
                )}
              </Text>
            )}
          </View>

          <View style={{ gap: 5 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748b' }}>{t('École (optionnel)', 'Lekòl (opsyonèl)')}</Text>
            <TextInput
              value={school}
              onChangeText={setSchool}
              maxLength={60}
              placeholder={t('Nom de votre école', 'Non lekòl ou')}
              placeholderTextColor="#9aa4b2"
              style={{ borderWidth: 1, borderColor: '#dbe2ec', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, backgroundColor: '#fff', color: '#0f172a' }}
            />
          </View>

          <SelectField
            label={t('Département (optionnel)', 'Depatman (opsyonèl)')}
            value={department}
            placeholder={t('— Choisir —', '— Chwazi —')}
            onPress={() => setSheet('dept')}
          />

          {!!department && deptCities.length > 0 && (
            <SelectField
              label={t('Ville (optionnel)', 'Vil (opsyonèl)')}
              value={cityChoice === OTHER_CITY ? t('Autre ville…', 'Lòt vil…') : cityChoice}
              placeholder={t('— Choisir —', '— Chwazi —')}
              onPress={() => setSheet('city')}
            />
          )}

          {cityChoice === OTHER_CITY && (
            <TextInput
              value={customCity}
              onChangeText={setCustomCity}
              maxLength={60}
              placeholder={t('Nom de votre ville', 'Non vil ou')}
              placeholderTextColor="#9aa4b2"
              style={{ borderWidth: 1, borderColor: '#dbe2ec', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, backgroundColor: '#fff', color: '#0f172a' }}
            />
          )}

          <TouchableOpacity
            onPress={save}
            disabled={saving || !aliasOk}
            activeOpacity={0.85}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: saving || !aliasOk ? '#9dbde0' : PRIMARY, borderRadius: 999, paddingVertical: 14, marginTop: 4 }}
          >
            <Check size={17} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 15.5, fontWeight: '800' }}>
              {saving ? '…' : t('Confirmer', 'Konfime')}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <OptionSheet
        visible={sheet === 'dept'}
        title={t('Département', 'Depatman')}
        options={HAITI_DEPARTMENTS.map((d) => ({ value: d.name, label: d.name }))}
        onPick={pickDepartment}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'city'}
        title={t('Ville', 'Vil')}
        options={[
          ...deptCities.map((c) => ({ value: c, label: c })),
          { value: OTHER_CITY, label: t('Autre ville…', 'Lòt vil…') },
        ]}
        onPick={(v) => { setCityChoice(v); if (v !== OTHER_CITY) setCustomCity(''); }}
        onClose={() => setSheet(null)}
      />
    </Modal>
  );
}
