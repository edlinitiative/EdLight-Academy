import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, Share, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import useStore from '../contexts/store';
import { useTheme } from '../theme/theme';
import Button from '../components/ui/Button';
import { shareRequest } from '../services/progressShareService';
import {
  DEFAULT_SHARE_DAYS, SHARE_DURATIONS, SHARE_PRIVACY, daysLeft, shareErrorMessage, shareLink, shareMessage,
  type ShareDuration, type ShareListItem,
} from '../../../shared/progressShare';

const fmt = (ms: number) => new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Port-au-Prince' });

/** "Partager mon suivi": read-only progress links for a parent (shared/progressShare.ts). */
export default function ProgressShareScreen({ navigation }: { navigation: any }) {
  const user = useStore((s) => s.user), language = useStore((s) => s.language);
  const { colors, cardSurface } = useTheme();
  const isCreole = language === 'ht', t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const uid = user?.uid;
  const [shares, setShares] = useState<ShareListItem[] | null>(null);
  const [days, setDays] = useState<ShareDuration>(DEFAULT_SHARE_DAYS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    if (!uid) return;
    setError(null);
    try { setShares((await shareRequest<{ shares: ShareListItem[] }>('list')).shares); } catch (e) { setError(e); }
  }, [uid]);
  useEffect(() => { setShares(null); setNotice(''); void load(); }, [load]);

  const create = async () => {
    setBusy(true); setError(null); setNotice('');
    try {
      const out = await shareRequest<{ token: string }>('create', { days });
      const message = shareMessage(shareLink(out.token), isCreole ? 'ht' : 'fr');
      await load();
      // The link is shown only now; the share sheet also offers "Copy".
      try { await Share.share({ message }); } catch { /* dismissed */ }
      setNotice(t('Lien créé. Tu peux le désactiver ci-dessous à tout moment.', 'Lyen an kreye. Ou ka dezaktive l anba a nenpòt lè.'));
    } catch (e) { setError(e); } finally { setBusy(false); }
  };
  const revoke = (id: string) => Alert.alert(
    t('Désactiver ce lien ?', 'Dezaktive lyen sa a?'),
    t('La personne qui l’a ne verra plus ton suivi.', 'Moun ki genyen l lan p ap wè swivi ou ankò.'),
    [{ text: t('Annuler', 'Anile'), style: 'cancel' }, { text: t('Désactiver', 'Dezaktive'), style: 'destructive', onPress: async () => {
      setBusy(true); setError(null);
      try { await shareRequest('revoke', { id }); await load(); setNotice(t('Lien désactivé.', 'Lyen an dezaktive.')); }
      catch (e) { setError(e); } finally { setBusy(false); }
    } }],
  );

  const card = { ...cardSurface, padding: 20, gap: 12 };
  const text = { color: colors.ink, fontSize: 16, lineHeight: 24 };
  const muted = { ...text, color: colors.muted, fontSize: 14, lineHeight: 20 };
  const heading = { ...text, fontSize: 22, fontWeight: '700' as const };

  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}><ScrollView contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 60 }}>
    <Button label={t('Retour', 'Retounen')} variant="ghost" onPress={() => navigation.goBack()} />
    <Text accessibilityRole="header" style={heading}>{t('Partager mon suivi', 'Pataje swivi mwen')}</Text>
    {!uid ? <>
      <Text style={text}>{t('Connecte-toi pour partager tes progrès avec un parent.', 'Konekte pou pataje pwogrè ou ak yon paran.')}</Text>
      <Button label={t('Se connecter', 'Konekte')} onPress={() => useStore.getState().setShowAuthModal(true)} />
    </> : <>
      <Text style={text}>{t('Envoie à un parent un lien en lecture seule vers ton relevé de progression. Pas besoin de compte pour l’ouvrir.', 'Voye yon paran yon lyen pou li sèlman sou relve pwogrè ou. Li pa bezwen kont pou l ouvri l.')}</Text>
      {error != null && <View style={card}><Text accessibilityRole="alert" style={{ ...text, color: colors.dangerInk }}>{shareErrorMessage(error, language)}</Text><Button label={t('Réessayer', 'Eseye ankò')} variant="secondary" disabled={busy} onPress={() => load()} /></View>}
      {!!notice && <Text accessibilityLiveRegion="polite" style={text}>{notice}</Text>}
      <View style={card}>
        <Text accessibilityRole="header" style={{ ...text, fontWeight: '700' }}>{t('Nouveau lien', 'Nouvo lyen')}</Text>
        <Text style={muted}>{SHARE_PRIVACY[isCreole ? 'ht' : 'fr']}</Text>
        <Text style={text}>{t('Durée du lien', 'Dire lyen an')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {SHARE_DURATIONS.map((d) => (
            <Button key={d} label={`${d} ${t('jours', 'jou')}`} variant={days === d ? 'primary' : 'outline'} onPress={() => setDays(d)}
              accessibilityLabel={`${d} ${t('jours', 'jou')}${days === d ? t(', choisi', ', chwazi') : ''}`} />
          ))}
        </View>
        <Button label={t('Créer et partager le lien', 'Kreye epi pataje lyen an')} disabled={busy} onPress={create} />
      </View>
      <View style={card}>
        <Text accessibilityRole="header" style={{ ...text, fontWeight: '700' }}>{t('Liens actifs', 'Lyen ki aktif')}</Text>
        {shares == null && error == null && <Text style={text}>{t('Chargement…', 'Ap chaje…')}</Text>}
        {shares?.length === 0 && <Text style={text}>{t('Aucun lien actif.', 'Pa gen lyen ki aktif.')}</Text>}
        {shares?.map((s) => (
          <View key={s.id} style={{ gap: 8, paddingVertical: 12, borderTopWidth: 1, borderColor: colors.border }}>
            <Text style={text}>{t('Créé le', 'Kreye')} {fmt(s.createdAt)} · {t(`expire dans ${daysLeft(s.expiresAt, Date.now())} j`, `ekspire nan ${daysLeft(s.expiresAt, Date.now())} jou`)}</Text>
            <Text style={muted}>{s.views === 0 ? t('Pas encore ouvert', 'Poko ouvri') : t(`Ouvert ${s.views} fois, dernière fois le ${fmt(s.lastViewedAt || s.createdAt)}`, `Ouvri ${s.views} fwa, dènye fwa ${fmt(s.lastViewedAt || s.createdAt)}`)}</Text>
            <Button label={t('Désactiver', 'Dezaktive')} variant="outline" disabled={busy} onPress={() => revoke(s.id)} />
          </View>
        ))}
        <Text style={muted}>{t('Pour des raisons de sécurité, un lien n’est affiché qu’à sa création. Pour en renvoyer un, crée un nouveau lien.', 'Pou sekirite, nou montre yon lyen sèlman lè ou kreye l. Pou voye youn ankò, kreye yon nouvo lyen.')}</Text>
      </View>
    </>}
  </ScrollView></SafeAreaView>;
}
