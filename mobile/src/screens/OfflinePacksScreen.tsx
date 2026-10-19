/**
 * OfflinePacksScreen — "Hors ligne / San entènèt": revision packs to keep on
 * the phone (exams and practice, never video).
 *
 *   • every pack shows its size BEFORE download ("≈ 1,2 Mo"), and the data it
 *     costs when the build measured it;
 *   • download, update ("Mise à jour disponible") and remove, one by one or
 *     all at once (with a confirmation); nothing is removed without a tap and
 *     a pack that does not fit is refused, never squeezed in by evicting one;
 *   • storage used against the budget, and a "Wi-Fi seulement" switch.
 *
 * Reached from the Exams landing and from Practice (QuizzesScreen). Packs are
 * shared by every account on the phone; results never live in them.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Switch, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ChevronLeft } from 'lucide-react-native';
import useStore from '../contexts/store';
import { useColors, useTheme, typeScale } from '../theme/theme';
import Segmented from '../components/ui/Segmented';
import Button from '../components/ui/Button';
import { useContentContainerStyle } from '../components/ui/ContentContainer';
import { ListSkeleton } from '../components/StateViews';
import { tapLight } from '../utils/haptics';
import {
  formatPackSize,
  packYearsLabel,
  PackError,
  type PackEntry,
  type PackKind,
  type PackManifest,
  type StoredPack,
} from '../../../shared/offlinePacks';
import {
  downloadExamPack,
  getWifiOnly,
  listPracticePacks,
  loadPackManifest,
  PACK_BUDGET_BYTES,
  packLibrary,
  packStorageKind,
  removeAllPacks,
  removePack,
  savePracticePack,
  setWifiOnly,
} from '../services/offlinePacks';

type Translate = (fr: string, ht: string) => string;

const LEVELS = [
  { key: 'baccalaureat', fr: 'Bac', ht: 'Bak' },
  { key: '9eme_af', fr: '9e AF', ht: '9e AF' },
  { key: 'universite', fr: 'Université', ht: 'Inivèsite' },
] as const;

export function packTitle(p: Pick<PackEntry, 'title' | 'subject' | 'volume' | 'volumes' | 'years'>, ht: boolean): string {
  const years = packYearsLabel(p.years, ht ? 'ht' : 'fr');
  const part = p.volume && p.volumes ? (ht ? ` (pati ${p.volume} sou ${p.volumes})` : ` (partie ${p.volume} sur ${p.volumes})`) : '';
  return `${p.title || p.subject}${years ? ` · ${years}` : ''}${part}`;
}

export function packErrorMessage(err: unknown, t: Translate): string {
  const code = err instanceof PackError ? err.code : 'network';
  switch (code) {
    case 'budget':
    case 'too_large':
      return t('Pas assez de place pour ce paquet. Supprime un paquet pour libérer de l’espace.', 'Pa gen ase plas pou pake sa a. Efase yon pake pou libere plas.');
    case 'offline':
      return t('Tu es hors ligne. Connecte-toi pour télécharger.', 'Ou pa sou entènèt. Konekte pou telechaje.');
    case 'wifi_required':
      return t('« Wi-Fi seulement » est activé : connecte-toi au Wi-Fi pour télécharger.', '« Wi-Fi sèlman » aktive : konekte sou Wi-Fi pou telechaje.');
    case 'storage':
      return t('Pas assez d’espace libre sur ce téléphone.', 'Pa gen ase plas lib sou telefòn sa a.');
    default:
      return t('Le téléchargement a échoué. Réessaie.', 'Telechajman an echwe. Eseye ankò.');
  }
}

type Row = { entry: PackEntry; text?: string };

export default function OfflinePacksScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { language } = useStore();
  const ht = language === 'ht';
  const t: Translate = (fr, k) => (ht ? k : fr);
  const colors = useColors();
  const { cardSurface } = useTheme();
  const column = useContentContainerStyle('readable');

  const [kind, setKind] = useState<PackKind>(route.params?.kind === 'practice' ? 'practice' : 'exam');
  const [level, setLevel] = useState<string>(route.params?.level || 'baccalaureat');
  const [manifest, setManifest] = useState<PackManifest | null | undefined>(undefined);
  const [practice, setPractice] = useState<Row[] | null>(null);
  const [stored, setStored] = useState<StoredPack[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [wifiOnly, setWifiOnlyState] = useState(false);

  useEffect(() => {
    let alive = true;
    packLibrary.list().then((p) => { if (alive) setStored(p); });
    getWifiOnly().then((v) => { if (alive) setWifiOnlyState(v); });
    const off = packLibrary.subscribe((p) => { if (alive) setStored(p); });
    return () => { alive = false; off(); };
  }, []);

  useEffect(() => {
    let alive = true;
    if (kind === 'exam' && manifest === undefined) {
      loadPackManifest().then(({ manifest: m }) => { if (alive) setManifest(m); });
    }
    if (kind === 'practice' && practice === null) {
      listPracticePacks().then((rows) => { if (alive) setPractice(rows); }, () => { if (alive) setPractice([]); });
    }
    return () => { alive = false; };
  }, [kind, manifest, practice]);

  const rows: Row[] | null = useMemo(() => {
    if (kind === 'exam') {
      if (manifest === undefined) return null;
      return (manifest?.packs || []).filter((p) => p.kind === 'exam' && p.level === level).map((entry) => ({ entry }));
    }
    return practice;
  }, [kind, manifest, practice, level]);

  const retired = useMemo(() => {
    if (kind === 'exam') return packLibrary.retired(manifest ?? null, stored, 'exam').filter((p) => p.level === level);
    if (!practice) return [];
    const ids = new Set(practice.map((r) => r.entry.id));
    return stored.filter((p) => p.kind === 'practice' && !ids.has(p.id));
  }, [kind, manifest, practice, stored, level]);

  const used = stored.reduce((s, p) => s + p.sizeBytes, 0);
  const pct = Math.min(100, Math.round((used / PACK_BUDGET_BYTES) * 100));

  const act = useCallback(async (id: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(id);
    setMessage(null);
    try {
      await fn();
      setMessage(done);
    } catch (err) {
      setMessage(packErrorMessage(err, t));
    } finally {
      setBusy(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ht]);

  const confirmRemoveAll = () => {
    Alert.alert(
      t('Tout supprimer ?', 'Efase tout?'),
      t('Les paquets seront retirés de ce téléphone. Tes résultats restent sur ton compte.', 'Pake yo ap retire sou telefòn sa a. Rezilta ou yo rete sou kont ou.'),
      [
        { text: t('Annuler', 'Anile'), style: 'cancel' },
        { text: t('Tout supprimer', 'Efase tout'), style: 'destructive', onPress: () => act('all', removeAllPacks, t('Tous les paquets sont supprimés.', 'Tout pake yo efase.')) },
      ],
    );
  };

  const renderRow = ({ entry, text }: Row) => {
    const status = packLibrary.statusOf(entry, stored);
    const title = packTitle(entry, ht);
    const count = entry.kind === 'exam'
      ? t(`${entry.items} sujet${entry.items > 1 ? 's' : ''}`, `${entry.items} sijè`)
      : t(`${entry.items} questions`, `${entry.items} kesyon`);
    const size = entry.downloadBytes
      ? t(`${formatPackSize(entry.sizeBytes)} sur le téléphone · téléchargement ${formatPackSize(entry.downloadBytes)}`, `${formatPackSize(entry.sizeBytes)} sou telefòn nan · telechajman ${formatPackSize(entry.downloadBytes)}`)
      : formatPackSize(entry.sizeBytes);
    const download = () => act(entry.id,
      () => (entry.kind === 'exam' ? downloadExamPack(entry) : savePracticePack({ entry, text: text as string })),
      t('Paquet prêt hors ligne.', 'Pake a pare pou san entènèt.'));
    return (
      <View key={entry.id} style={[cardSurface, { padding: 16, gap: 10 }]}>
        <View style={{ gap: 4 }}>
          <Text style={[typeScale.titleSm, { color: colors.ink }]}>{title}</Text>
          <Text style={[typeScale.meta, { color: colors.muted }]}>{count} · {size}</Text>
          {status !== 'absent' ? (
            <View style={{ alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: status === 'current' ? colors.successSoft : colors.warnSoft }}>
              <Text style={[typeScale.label, { color: status === 'current' ? colors.successInk : colors.warnInk }]}>
                {status === 'current' ? t('Sur ce téléphone', 'Sou telefòn sa a') : t('Mise à jour disponible', 'Mizajou disponib')}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {status !== 'current' ? (
            <Button
              onPress={download}
              variant="secondary"
              size="sm"
              loading={busy === entry.id}
              disabled={busy !== null}
              label={status === 'update' ? t('Mettre à jour', 'Mete ajou') : t('Télécharger', 'Telechaje')}
              accessibilityLabel={`${status === 'update' ? t('Mettre à jour', 'Mete ajou') : t('Télécharger', 'Telechaje')} : ${title}, ${formatPackSize(entry.sizeBytes)}`}
            />
          ) : null}
          {status !== 'absent' ? (
            <Button
              onPress={() => act(entry.id, () => removePack(entry.id), t('Paquet supprimé.', 'Pake a efase.'))}
              variant="ghost"
              size="sm"
              disabled={busy !== null}
              label={t('Supprimer', 'Efase')}
              accessibilityLabel={`${t('Supprimer', 'Efase')} : ${title}`}
            />
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingTop: 4, paddingBottom: 12 }}>
        <TouchableOpacity
          onPress={() => { tapLight(); navigation.goBack(); }}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={t('Retour', 'Retounen')}
        >
          <ChevronLeft color={colors.ink} size={26} />
        </TouchableOpacity>
        <Text accessibilityRole="header" style={[typeScale.section, { color: colors.ink, flex: 1 }]} numberOfLines={1}>
          {t('Hors ligne', 'San entènèt')}
        </Text>
      </View>

      <ScrollView contentContainerStyle={[{ paddingHorizontal: 20, paddingBottom: 120, gap: 16 }, column]}>
        <Text style={[typeScale.body, { color: colors.muted }]}>
          {t(
            'Garde des sujets et des questions sur ce téléphone pour réviser sans connexion. La correction automatique marche hors ligne ; tes résultats sont envoyés à ton compte dès que tu te reconnectes. Les scores hors ligne restent des entraînements : ils ne comptent ni pour l’Arène ni pour les classements.',
            'Kenbe sijè ak kesyon sou telefòn sa a pou revize san entènèt. Koreksyon otomatik la mache san entènèt ; rezilta ou yo ap voye sou kont ou depi ou rekonekte. Nòt san entènèt yo se pratik sèlman : yo pa konte pou Arèn nan ni pou klasman yo.',
          )}
        </Text>

        {/* Storage used */}
        <View style={[cardSurface, { padding: 16, gap: 10 }]} accessible accessibilityLabel={t(`Espace utilisé : ${formatPackSize(used)} sur ${formatPackSize(PACK_BUDGET_BYTES)}`, `Plas itilize : ${formatPackSize(used)} sou ${formatPackSize(PACK_BUDGET_BYTES)}`)}>
          <Text style={[typeScale.titleSm, { color: colors.ink }]}>
            {t(`${stored.length} paquet${stored.length > 1 ? 's' : ''} · ${formatPackSize(used)}`, `${stored.length} pake · ${formatPackSize(used)}`)}
          </Text>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
            <View style={{ width: `${pct}%`, height: 8, backgroundColor: colors.azure }} />
          </View>
          <Text style={[typeScale.meta, { color: colors.muted }]}>
            {t(`Maximum ${formatPackSize(PACK_BUDGET_BYTES).replace('≈ ', '')} sur ce téléphone`, `Maksimòm ${formatPackSize(PACK_BUDGET_BYTES).replace('≈ ', '')} sou telefòn sa a`)}
            {packStorageKind === 'async-storage' ? t(' (espace réduit sur cette version de l’app)', ' (plas redwi sou vèsyon aplikasyon sa a)') : ''}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
            <Text style={[typeScale.bodyMd, { color: colors.ink, flex: 1 }]}>{t('Télécharger en Wi-Fi seulement', 'Telechaje sou Wi-Fi sèlman')}</Text>
            <Switch
              value={wifiOnly}
              onValueChange={(v) => { setWifiOnlyState(v); void setWifiOnly(v); }}
              accessibilityRole="switch"
              accessibilityLabel={t('Télécharger en Wi-Fi seulement', 'Telechaje sou Wi-Fi sèlman')}
              trackColor={{ true: colors.azure, false: colors.surfaceAlt }}
            />
          </View>
          {stored.length > 0 ? (
            <Button onPress={confirmRemoveAll} variant="ghost" size="sm" disabled={busy !== null} label={t('Tout supprimer', 'Efase tout')} style={{ alignSelf: 'flex-start' }} />
          ) : null}
        </View>

        <Segmented
          options={[
            { key: 'exam', label: t('Examens', 'Egzamen') },
            { key: 'practice', label: t('Pratique', 'Pratik') },
          ]}
          value={kind}
          onChange={(k) => { setMessage(null); setKind(k as PackKind); }}
        />
        {kind === 'exam' ? (
          <Segmented
            options={LEVELS.map((l) => ({ key: l.key, label: ht ? l.ht : l.fr }))}
            value={level}
            onChange={(k) => setLevel(k)}
          />
        ) : null}

        {message ? (
          <Text accessibilityLiveRegion="polite" style={[typeScale.bodyMd, { color: colors.ink }]}>{message}</Text>
        ) : null}

        {rows === null ? (
          <ListSkeleton rows={4} />
        ) : rows.length === 0 ? (
          <Text style={[typeScale.body, { color: colors.muted }]}>
            {kind === 'exam'
              ? t('Liste des paquets indisponible. Connecte-toi une fois pour la charger.', 'Lis pake yo pa disponib. Konekte yon fwa pou chaje l.')
              : t('Les questions de pratique ne sont pas encore sur ce téléphone. Connecte-toi une fois pour les charger.', 'Kesyon pratik yo poko sou telefòn sa a. Konekte yon fwa pou chaje yo.')}
          </Text>
        ) : (
          <View style={{ gap: 12 }}>{rows.map(renderRow)}</View>
        )}

        {retired.length > 0 ? (
          <View style={{ gap: 12 }}>
            <Text accessibilityRole="header" style={[typeScale.cardTitle, { color: colors.ink }]}>{t('Plus publiés', 'Pa pibliye ankò')}</Text>
            {retired.map((p) => (
              <View key={p.id} style={[cardSurface, { padding: 16, gap: 10 }]}>
                <Text style={[typeScale.titleSm, { color: colors.ink }]}>{packTitle(p, ht)}</Text>
                <Text style={[typeScale.meta, { color: colors.muted }]}>
                  {t('Gardé jusqu’à ce que tu le supprimes', 'N ap kenbe l jiskaske ou efase l')} · {formatPackSize(p.sizeBytes)}
                </Text>
                <Button
                  onPress={() => act(p.id, () => removePack(p.id), t('Paquet supprimé.', 'Pake a efase.'))}
                  variant="ghost" size="sm" disabled={busy !== null}
                  label={t('Supprimer', 'Efase')}
                  accessibilityLabel={`${t('Supprimer', 'Efase')} : ${packTitle(p, ht)}`}
                  style={{ alignSelf: 'flex-start' }}
                />
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
