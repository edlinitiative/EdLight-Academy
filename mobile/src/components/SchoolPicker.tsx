import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Search, X, Plus, MapPin, Check } from 'lucide-react-native';
import PressableScale from './ui/PressableScale';
import Button from './ui/Button';
import { SchoolCrest } from './arena/art';
import { useReduceMotion } from '../utils/motion';
import useStore from '../contexts/store';
import { useColors, useTheme, typeScale } from '../theme/theme';
import { select, tapMedium } from '../utils/haptics';
import {
  searchSchools,
  likelyDuplicate,
  validateShortName,
  shortNameKey,
  SHORT_NAME_MAX,
  type School,
  type ShortNameReason,
} from '../../../shared/schools';
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
 *
 * The short name is asked for here and nowhere else, because this is the one
 * moment a student is telling us about their own school. It is optional on
 * purpose: a student who does not know it leaves it blank and an admin asks
 * later, whereas a required field would be filled with something invented —
 * and an invented short name on the tournament stage is worse than none.
 */

export default function SchoolPicker({ visible, commune, onSelect, onClose }: {
  visible: boolean;
  /** The student's commune, from the profile — narrows a national list to a few. */
  commune?: string | null;
  onSelect: (school: School) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const { radius, shadow, fonts, elevation, cardSurface } = useTheme();
  const reduce = useReduceMotion();
  const language = useStore((s) => s.language);
  const t = (fr: string, ht: string) => (language === 'ht' ? ht : fr);

  const [schools, setSchools] = useState<School[]>(seedSchools);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [newCommune, setNewCommune] = useState(commune ?? '');
  const [newAddress, setNewAddress] = useState('');
  const [newCity, setNewCity] = useState('');
  const [newShortName, setNewShortName] = useState('');
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
    if (!visible) {
      setQ(''); setAdding(false); setProblem(null);
      setNewAddress(''); setNewCity(''); setNewShortName('');
    }
  }, [visible]);

  const results = useMemo(
    () => searchSchools(schools, q, { commune, limit: 30 }),
    [schools, q, commune],
  );
  const maybeSame = useMemo(
    () => (adding && q.trim().length >= 4 ? likelyDuplicate(schools, q) : null),
    [adding, q, schools],
  );
  // Checked against the whole list as it is typed, so "already taken" lands
  // while the student can still ask a classmate what theirs actually is —
  // finding out after tapping Ajouter is how a second-best name gets invented.
  const shortNameCheck = useMemo(
    () => (newShortName.trim() ? validateShortName(newShortName, schools) : null),
    [newShortName, schools],
  );

  const shortNameProblem = (reason: ShortNameReason): string => ({
    'too-short': t('Au moins 2 caractères.', 'Omwen 2 karaktè.'),
    'too-long': t('8 caractères au maximum.', '8 karaktè omaksimòm.'),
    charset: t('Lettres et chiffres seulement.', 'Sèlman lèt ak chif.'),
    taken: t('Une autre école utilise déjà ce nom court.', 'Yon lòt lekòl deja ap sèvi ak non kout sa a.'),
    reserved: t('Ce nom court est réservé.', 'Non kout sa a rezève.'),
  })[reason];

  const choose = (s: School) => { select(); onSelect(s); onClose(); };

  // A blank short name is fine; a broken one is not, because it would be
  // rejected by the service after the student thinks they are done.
  const canSubmit = q.trim().length >= 4 && (!shortNameCheck || shortNameCheck.ok);

  const submitNew = async () => {
    setBusy(true);
    setProblem(null);
    const res = await addSchool({
      name: q.trim(),
      commune: newCommune.trim(),
      address: newAddress,
      city: newCity,
      shortName: newShortName,
    });
    setBusy(false);
    if (res.ok) { tapMedium(); onSelect(res.school); onClose(); return; }
    setProblem(res);
  };

  // Opaque grey field, no outline (web form anatomy: 52 tall, radius 12).
  const field = {
    borderRadius: radius.control,
    paddingHorizontal: 14,
    minHeight: 52,
    fontFamily: fonts.regular,
    fontSize: 16,
    backgroundColor: colors.surfaceAlt,
    color: colors.ink,
  } as const;

  return (
    <Modal visible={visible} animationType={reduce ? 'none' : 'slide'} transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' }}>
        <View style={[
          { backgroundColor: colors.bg, borderTopLeftRadius: radius.hero, borderTopRightRadius: radius.hero, paddingTop: 12, maxHeight: '88%' },
          shadow.lg ?? shadow.sm,
        ]}>
          {/* Grab handle + header */}
          <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 999, backgroundColor: colors.surfaceAlt, marginBottom: 12 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 12, marginBottom: 12 }}>
            <Text accessibilityRole="header" style={[typeScale.section, { color: colors.ink, flex: 1 }]}>
              {t('Ton école', 'Lekòl ou')}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t('Fermer', 'Fèmen')}
              style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt }}
            >
              <X color={colors.muted} size={20} />
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={{ paddingHorizontal: 20, marginBottom: 10 }}>
            <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: radius.pill, paddingLeft: 18, minHeight: 52 }, elevation.thumb]}>
              <Search color={colors.muted} size={20} />
              <TextInput
                value={q}
                onChangeText={(v) => { setQ(v); setProblem(null); }}
                autoFocus
                autoCorrect={false}
                maxLength={80}
                placeholder={t('Chercher une école…', 'Chèche yon lekòl…')}
                placeholderTextColor={colors.faint}
                style={[field, { flex: 1, backgroundColor: 'transparent', paddingHorizontal: 0 }]}
                accessibilityLabel={t('Chercher une école', 'Chèche yon lekòl')}
              />
            </View>
            {!q ? (
              <Text style={[typeScale.meta, { color: colors.muted, marginTop: 10 }]}>
                {t('Les écoles les plus fréquentées', 'Lekòl yo plis moun ale')}
              </Text>
            ) : null}
          </View>

          {adding ? (
            // ── Adding the one that isn't there ──────────────────────────
            <View style={{ paddingHorizontal: 20, gap: 10, paddingBottom: 26 }}>
              {maybeSame ? (
                <View style={{ backgroundColor: colors.azureSoft, borderRadius: radius.card, padding: 12, gap: 8 }}>
                  <Text style={[typeScale.body, { color: colors.ink }]}>
                    {t('Est-ce plutôt celle-ci ?', 'Èske se pito sa a ?')}
                  </Text>
                  <PressableScale
                    onPress={() => choose(maybeSame)}
                    pressedScale={0.98}
                    accessibilityRole="button"
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}
                  >
                    <Check color={colors.azureInk} size={18} />
                    <Text style={[typeScale.bodyMd, { color: colors.azureInk, flex: 1 }]}>{maybeSame.name}</Text>
                  </PressableScale>
                </View>
              ) : null}

              <Text style={[typeScale.label, { color: colors.muted, fontSize: 15 }]}>{t("Commune de l'école", 'Komin lekòl la')}</Text>
              <TextInput
                value={newCommune}
                onChangeText={setNewCommune}
                maxLength={40}
                placeholder={t('Ex. Delmas', 'Egz. Delmas')}
                placeholderTextColor={colors.faint}
                style={field}
              />

              <Text style={[typeScale.label, { color: colors.muted }]}>{t('Ville', 'Vil')}</Text>
              <TextInput
                value={newCity}
                onChangeText={setNewCity}
                maxLength={40}
                placeholder={t('Ex. Port-au-Prince', 'Egz. Pòtoprens')}
                placeholderTextColor={colors.faint}
                style={field}
              />

              <Text style={[typeScale.label, { color: colors.muted }]}>
                {t('Nom court — ex. CODOSA', 'Non kout — egz. CODOSA')}
              </Text>
              <TextInput
                value={newShortName}
                // Stored the way it will be shouted and displayed, so what the
                // student sees here is exactly what goes on the board.
                onChangeText={(v) => { setNewShortName(shortNameKey(v)); setProblem(null); }}
                autoCapitalize="characters"
                autoCorrect={false}
                // Capped at the length the check allows, so the only inline
                // errors left are ones the student can actually act on.
                maxLength={SHORT_NAME_MAX}
                placeholder={t('CODOSA', 'CODOSA')}
                placeholderTextColor={colors.faint}
                style={field}
                accessibilityLabel={t("Nom court de l'école", 'Non kout lekòl la')}
              />
              <Text style={[
                typeScale.caption,
                { color: shortNameCheck && !shortNameCheck.ok ? colors.danger : colors.muted },
              ]}>
                {shortNameCheck && !shortNameCheck.ok
                  ? shortNameProblem(shortNameCheck.reason)
                  : t(
                    "Comme les élèves l'appellent. Laisse vide si tu n'es pas sûr — on ne l'invente pas.",
                    'Jan elèv yo rele l. Kite l vid si ou pa sèten — nou pa envante l.',
                  )}
              </Text>

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
                <Text accessibilityRole="alert" style={[typeScale.status, { color: colors.dangerInk }]}>
                  {problem.reason === 'duplicate'
                    ? t(`Déjà dans la liste : ${problem.existing.name}`, `Deja nan lis la : ${problem.existing.name}`)
                    : problem.reason === 'short-name'
                      // The list can grow between the typing and the tap, so
                      // the service re-checks and can still refuse: name the
                      // reason here, or the student is left with a dead button.
                      ? shortNameProblem(problem.detail)
                      : problem.reason === 'signed-out'
                        ? t('Connecte-toi pour ajouter une école.', 'Konekte pou ajoute yon lekòl.')
                        : t("Impossible d'ajouter pour le moment.", 'Nou pa ka ajoute l kounye a.')}
                </Text>
              ) : null}

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                <Button
                  variant="secondary"
                  label={t('Retour', 'Tounen')}
                  onPress={() => setAdding(false)}
                  style={{ flex: 1 }}
                />
                <Button
                  label={t('Ajouter', 'Ajoute')}
                  onPress={submitNew}
                  disabled={!canSubmit}
                  loading={busy}
                  style={{ flex: 2 }}
                />
              </View>
            </View>
          ) : (
            // ── The list ─────────────────────────────────────────────────
            <FlatList
              data={results}
              keyExtractor={(s) => s.key}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28, gap: 8 }}
              renderItem={({ item }) => (
                <PressableScale
                  onPress={() => choose(item)}
                  pressedScale={0.98}
                  accessibilityRole="button"
                  accessibilityLabel={[item.name, item.shortName, item.commune].filter(Boolean).join(', ')}
                  style={[cardSurface, { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, minHeight: 60 }]}
                >
                  <SchoolCrest name={item.name} size={36} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <Text style={{ fontFamily: fonts.headingBold, fontSize: 16, lineHeight: 21, color: colors.ink, flexShrink: 1 }}>{item.name}</Text>
                    {/* The short name is how students recognise their school
                        faster than the registered name — and seeing it here is
                        what teaches everyone else that it exists. */}
                    {item.shortName ? (
                      <Text style={[typeScale.caption, {
                        color: colors.ink,
                        fontFamily: fonts.headingBold,
                        backgroundColor: colors.surfaceAlt,
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 999,
                        overflow: 'hidden',
                      }]}>
                        {item.shortName}
                      </Text>
                    ) : null}
                  </View>
                  {item.commune ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <MapPin color={colors.muted} size={14} />
                      <Text style={[typeScale.caption, { color: colors.muted }]}>{item.commune}</Text>
                    </View>
                  ) : null}
                  </View>
                </PressableScale>
              )}
              ListEmptyComponent={
                <Text style={[typeScale.body, { color: colors.muted, paddingVertical: 18, textAlign: 'center' }]}>
                  {q
                    ? t('Aucune école trouvée.', 'Nou pa jwenn okenn lekòl.')
                    : t('Cherche le nom de ton école.', 'Chèche non lekòl ou.')}
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
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, paddingVertical: 8 }}
                  >
                    <Plus color={colors.azureInk} size={20} />
                    <Text style={[typeScale.bodyMd, { color: colors.azureInk, flex: 1, fontFamily: fonts.bold }]}>
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
