import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Search, X, Plus, MapPin, Check } from 'lucide-react-native';
import PressableScale from './ui/PressableScale';
import useStore from '../contexts/store';
import { useColors, useTheme, typeScale } from '../theme/theme';
import { select, tapMedium } from '../utils/haptics';
import { searchSchools, likelyDuplicate, type School } from '../../../shared/schools';
import { loadSchools, seedSchools, addSchool, type AddResult } from '../services/schoolService';

/**
 * Choosing a school, rather than typing one.
 *
 * The school board groups by name, so spelling IS the grouping: left to free
 * text, "Lycée Toussaint", "lycee toussaint" and "L. Toussaint" become three
 * schools with a third of the points each, and the comparison the whole
 * competition rests on quietly stops working.
 *
 * Almost every duplicate comes from someone failing to find a school that is
 * already there, not from wanting a new one. So the search forgives accents,
 * abbreviations and the institution type, the student's own commune is listed
 * first, and adding is offered only after a search has come up short — with one
 * last "did you mean?" if the name still looks like one we have.
 */

export default function SchoolPicker({ visible, commune, onSelect, onClose }: {
  visible: boolean;
  /** The student's commune, from the profile — narrows a national list to a few. */
  commune?: string | null;
  onSelect: (school: School) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const { radius, shadow } = useTheme();
  const language = useStore((s) => s.language);
  const t = (fr: string, ht: string) => (language === 'ht' ? ht : fr);

  const [schools, setSchools] = useState<School[]>(seedSchools);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [newCommune, setNewCommune] = useState(commune ?? '');
  const [newAddress, setNewAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<AddResult | null>(null);

  // Paint from the bundled seed immediately, then fold in anything added.
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    loadSchools().then((all) => { if (alive) setSchools(all); });
    return () => { alive = false; };
  }, [visible]);

  useEffect(() => {
    if (!visible) { setQ(''); setAdding(false); setProblem(null); setNewAddress(''); }
  }, [visible]);

  const results = useMemo(
    () => searchSchools(schools, q, { commune, limit: 30 }),
    [schools, q, commune],
  );
  const maybeSame = useMemo(
    () => (adding && q.trim().length >= 4 ? likelyDuplicate(schools, q, newCommune || commune) : null),
    [adding, q, schools, newCommune, commune],
  );

  const choose = (s: School) => { select(); onSelect(s); onClose(); };

  const submitNew = async () => {
    setBusy(true);
    setProblem(null);
    const res = await addSchool({ name: q.trim(), commune: newCommune.trim(), address: newAddress });
    setBusy(false);
    if (res.ok) { tapMedium(); onSelect(res.school); onClose(); return; }
    setProblem(res);
  };

  const field = {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    backgroundColor: colors.surfaceAlt,
    color: colors.ink,
  } as const;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
        <View style={[
          { backgroundColor: colors.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 10, maxHeight: '88%' },
          shadow.lg ?? shadow.sm,
        ]}>
          {/* Grab handle + header */}
          <View style={{ alignSelf: 'center', width: 38, height: 4, borderRadius: 999, backgroundColor: colors.border, marginBottom: 12 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12, marginBottom: 12 }}>
            <Text style={[typeScale.titleSm, { color: colors.ink, flex: 1 }]}>
              {t('Ton école', 'Lekòl ou')}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel={t('Fermer', 'Fèmen')}>
              <X color={colors.muted} size={20} />
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={{ paddingHorizontal: 16, marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Search color={colors.muted} size={16} />
              <TextInput
                value={q}
                onChangeText={(v) => { setQ(v); setProblem(null); }}
                autoFocus
                autoCorrect={false}
                maxLength={80}
                placeholder={t('Chercher une école…', 'Chèche yon lekòl…')}
                placeholderTextColor={colors.faint}
                style={[field, { flex: 1 }]}
                accessibilityLabel={t('Chercher une école', 'Chèche yon lekòl')}
              />
            </View>
            {commune && !q ? (
              <Text style={[typeScale.caption, { color: colors.muted, marginTop: 6 }]}>
                {t(`Écoles à ${commune}`, `Lekòl nan ${commune}`)}
              </Text>
            ) : null}
          </View>

          {adding ? (
            // ── Adding the one that isn't there ──────────────────────────
            <View style={{ paddingHorizontal: 16, gap: 10, paddingBottom: 22 }}>
              {maybeSame ? (
                <View style={{ backgroundColor: colors.azureSoft, borderRadius: radius.card, padding: 12, gap: 8 }}>
                  <Text style={[typeScale.caption, { color: colors.ink }]}>
                    {t('Est-ce plutôt celle-ci ?', 'Èske se pito sa a ?')}
                  </Text>
                  <PressableScale
                    onPress={() => choose(maybeSame)}
                    pressedScale={0.98}
                    accessibilityRole="button"
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                  >
                    <Check color={colors.azure} size={16} />
                    <Text style={[typeScale.label, { color: colors.azure, flex: 1 }]}>{maybeSame.name}</Text>
                  </PressableScale>
                </View>
              ) : null}

              <Text style={[typeScale.label, { color: colors.muted }]}>{t('Commune', 'Komin')}</Text>
              <TextInput
                value={newCommune}
                onChangeText={setNewCommune}
                maxLength={40}
                placeholder={t('Ex. Delmas', 'Egz. Delmas')}
                placeholderTextColor={colors.faint}
                style={field}
              />

              <Text style={[typeScale.label, { color: colors.muted }]}>{t('Adresse', 'Adrès')}</Text>
              <TextInput
                value={newAddress}
                onChangeText={setNewAddress}
                maxLength={90}
                placeholder={t('Rue, numéro…', 'Ri, nimewo…')}
                placeholderTextColor={colors.faint}
                style={field}
              />
              <Text style={[typeScale.caption, { color: colors.muted }]}>
                {t(
                  "L'adresse aide les prochains élèves à reconnaître leur école.",
                  'Adrès la ap ede lòt elèv yo rekonèt lekòl yo a.',
                )}
              </Text>

              {problem && !problem.ok ? (
                <Text style={[typeScale.caption, { color: colors.danger }]}>
                  {problem.reason === 'duplicate'
                    ? t(`Déjà dans la liste : ${problem.existing.name}`, `Deja nan lis la : ${problem.existing.name}`)
                    : problem.reason === 'signed-out'
                      ? t('Connecte-toi pour ajouter une école.', 'Konekte pou ajoute yon lekòl.')
                      : t("Impossible d'ajouter pour le moment.", 'Nou pa ka ajoute l kounye a.')}
                </Text>
              ) : null}

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                <PressableScale
                  onPress={() => setAdding(false)}
                  pressedScale={0.97}
                  accessibilityRole="button"
                  style={{ flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: radius.control, borderWidth: 1, borderColor: colors.border }}
                >
                  <Text style={[typeScale.label, { color: colors.muted }]}>{t('Retour', 'Tounen')}</Text>
                </PressableScale>
                <PressableScale
                  onPress={submitNew}
                  disabled={busy || q.trim().length < 4}
                  pressedScale={0.97}
                  accessibilityRole="button"
                  style={{ flex: 2, alignItems: 'center', paddingVertical: 13, borderRadius: radius.control, backgroundColor: q.trim().length < 4 ? colors.border : colors.azure }}
                >
                  {busy
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={[typeScale.label, { color: '#fff' }]}>{t('Ajouter', 'Ajoute')}</Text>}
                </PressableScale>
              </View>
            </View>
          ) : (
            // ── The list ─────────────────────────────────────────────────
            <FlatList
              data={results}
              keyExtractor={(s) => s.key}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28 }}
              renderItem={({ item }) => (
                <PressableScale
                  onPress={() => choose(item)}
                  pressedScale={0.98}
                  accessibilityRole="button"
                  accessibilityLabel={item.commune ? `${item.name}, ${item.commune}` : item.name}
                  style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}
                >
                  <Text style={[typeScale.label, { color: colors.ink }]}>{item.name}</Text>
                  {item.commune ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <MapPin color={colors.faint} size={11} />
                      <Text style={[typeScale.caption, { color: colors.muted }]}>{item.commune}</Text>
                    </View>
                  ) : null}
                </PressableScale>
              )}
              ListEmptyComponent={
                <Text style={[typeScale.caption, { color: colors.muted, paddingVertical: 18, textAlign: 'center' }]}>
                  {q
                    ? t('Aucune école trouvée.', 'Nou pa jwenn okenn lekòl.')
                    : t('Commence à taper le nom de ton école.', 'Kòmanse tape non lekòl ou.')}
                </Text>
              }
              ListFooterComponent={
                // Adding is offered only once a search has come up short — the
                // list is what prevents duplicates, so it has to be tried first.
                q.trim().length >= 4 ? (
                  <PressableScale
                    onPress={() => { select(); setNewCommune(commune ?? ''); setAdding(true); }}
                    pressedScale={0.98}
                    accessibilityRole="button"
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14 }}
                  >
                    <Plus color={colors.azure} size={16} />
                    <Text style={[typeScale.label, { color: colors.azure, flex: 1 }]}>
                      {t(`Ajouter « ${q.trim()} »`, `Ajoute « ${q.trim()} »`)}
                    </Text>
                  </PressableScale>
                ) : null
              }
            />
          )}
        </View>
      </View>
    </Modal>
  );
}
