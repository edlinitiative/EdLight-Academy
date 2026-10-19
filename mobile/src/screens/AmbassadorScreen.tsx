import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, Share, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import useStore from '../contexts/store';
import { useTheme } from '../theme/theme';
import Button from '../components/ui/Button';
import { ambassadorRequest } from '../services/ambassadorService';
import { logInviteSent } from '../services/referralService';
import { AMBASSADOR_RULES, ambassadorErrorMessage, type AmbassadorDashboard } from '../../../shared/ambassadors';

/** School ambassador dashboard. Every figure is computed by the server (shared/ambassadors.ts). */
export default function AmbassadorScreen({ navigation }: { navigation: any }) {
  const user = useStore((s) => s.user), language = useStore((s) => s.language);
  const { colors, cardSurface } = useTheme();
  const isCreole = language === 'ht', t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const uid = user?.uid;
  const [data, setData] = useState<AmbassadorDashboard | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!uid) return;
    setLoading(true); setError(null);
    try { setData(await ambassadorRequest<AmbassadorDashboard>('dashboard')); } catch (e) { setError(e); } finally { setLoading(false); }
  }, [uid]);
  useEffect(() => { setData(null); void load(); }, [load]);

  const card = { ...cardSurface, padding: 20, gap: 12 };
  const text = { color: colors.ink, fontSize: 16, lineHeight: 24 };
  const muted = { ...text, color: colors.muted, fontSize: 14, lineHeight: 20 };
  const heading = { ...text, fontSize: 22, fontWeight: '700' as const };
  const invite = async () => {
    if (!data?.link) return;
    const message = isCreole
      ? `Ede ${data.school} monte nan klasman lekòl yo sou EdLight ak kòd mwen ${data.code} : ${data.link}`
      : `Aide ${data.school} à monter au classement des écoles sur EdLight avec mon code ${data.code} : ${data.link}`;
    try { await Share.share({ message }); logInviteSent('other'); } catch { /* dismissed */ }
  };
  const Figures = ({ s }: { s: AmbassadorDashboard['total'] }) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
      {[[t('Recrues', 'Rekri'), s.recruits], [t('Recrues actives', 'Rekri aktif'), s.retained], [t('En cours', 'An kou'), s.pending]].map(([label, value]) => (
        <View key={String(label)} style={{ minWidth: 90 }} accessible accessibilityLabel={`${label} : ${value}`}>
          <Text style={muted}>{label}</Text>
          <Text style={{ ...text, fontSize: 26, fontWeight: '700' }}>{value}</Text>
        </View>
      ))}
    </View>
  );
  const standing = (label: string, s: AmbassadorDashboard['schoolProgress']['week']) => (
    <Text style={text}>{label} : {s ? t(`${s.rank}e sur ${s.of} · ${s.totalXp} XP · ${s.members} élèves`, `${s.rank}yèm sou ${s.of} · ${s.totalXp} XP · ${s.members} elèv`) : t('pas encore au classement', 'poko nan klasman an')}</Text>
  );

  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}><ScrollView contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 60 }}>
    <Button label={t('Retour', 'Retounen')} variant="ghost" onPress={() => navigation.goBack()} />
    <Text accessibilityRole="header" style={heading}>{data?.school || t('Ambassadeur', 'Anbasadè')}</Text>
    {loading && <Text accessibilityLiveRegion="polite" style={text}>{t('Chargement…', 'Ap chaje…')}</Text>}
    {error != null && <View style={card}><Text accessibilityRole="alert" style={{ ...text, color: colors.dangerInk }}>{ambassadorErrorMessage(error, language)}</Text><Button label={t('Réessayer', 'Eseye ankò')} variant="secondary" disabled={loading} onPress={() => load()} /></View>}
    {data && <>
      <View style={card}>
        <Text accessibilityRole="header" style={{ ...text, fontWeight: '700' }}>{t('Mon invitation', 'Envitasyon mwen')}</Text>
        {data.code ? <>
          <Text style={text}>{t('Ton code', 'Kòd ou')} : <Text style={{ fontWeight: '700', letterSpacing: 2 }}>{data.code}</Text></Text>
          <Button label={t('Inviter mon école', 'Envite lekòl mwen')} onPress={invite} />
        </> : <Text style={text}>{t('Code indisponible pour le moment. Réessaie plus tard.', 'Kòd la pa disponib kounye a. Eseye pita.')}</Text>}
      </View>
      <View style={card}>
        <Text accessibilityRole="header" style={{ ...text, fontWeight: '700' }}>{t('Ce mois-ci', 'Mwa sa a')} ({data.period})</Text>
        <Figures s={data.thisPeriod} />
        <Text style={{ ...text, fontWeight: '700' }}>{t('Depuis le début', 'Depi nan kòmansman')}</Text>
        <Figures s={data.total} />
        <Text style={muted}>{t(
          `Une recrue active est un nouveau compte inscrit avec ton code qui a étudié au moins ${AMBASSADOR_RULES.retainedMinDays} jours différents pendant ses ${AMBASSADOR_RULES.retentionWindowDays} premiers jours. Les chiffres sont calculés par EdLight.`,
          `Yon rekri aktif se yon nouvo kont ki enskri ak kòd ou epi ki etidye omwen ${AMBASSADOR_RULES.retainedMinDays} jou diferan pandan ${AMBASSADOR_RULES.retentionWindowDays} premye jou li yo. EdLight kalkile chif yo.`)}</Text>
        <Text style={muted}>{t('Les récompenses sont décidées et remises par l’équipe EdLight, en dehors de l’application.', 'Ekip EdLight deside epi remèt rekonpans yo, andeyò aplikasyon an.')}</Text>
      </View>
      <View style={card}>
        <Text accessibilityRole="header" style={{ ...text, fontWeight: '700' }}>{t('Mon école au classement', 'Lekòl mwen nan klasman an')}</Text>
        {standing(t('Cette semaine', 'Semèn sa a'), data.schoolProgress.week)}
        {standing(t('Depuis le début', 'Depi nan kòmansman'), data.schoolProgress.allTime)}
      </View>
      <Button label={t('Actualiser', 'Rafrechi')} variant="ghost" disabled={loading} onPress={() => load()} />
    </>}
  </ScrollView></SafeAreaView>;
}
