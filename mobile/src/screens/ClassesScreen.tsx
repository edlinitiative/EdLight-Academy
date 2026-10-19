import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import useStore from '../contexts/store';
import { useTheme } from '../theme/theme';
import Button from '../components/ui/Button';
import { classRequest } from '../services/classService';
import { createUseClasses } from '../../../shared/useClasses';
import { CLASS_PRIVACY, classErrorMessage } from '../../../shared/classes';
import { AnalyticsPanel, AssignExamForm, ConsentNotice, CreateClassForm, FixturesPanel, HousesPanel, TeacherInvite } from '../components/classes/ClassTeacherTools';
const useClasses = createUseClasses(React);

/** Students and approved teachers: the same class tools as the web workspace. */
export default function ClassesScreen({ navigation }: { navigation: any }) {
  const user = useStore((s) => s.user), language = useStore((s) => s.language);
  const { colors, cardSurface } = useTheme();
  const uid = user?.uid, t = (fr: string, ht: string) => language === 'ht' ? ht : fr;
  const { home, detail, loading, busy, error, load, act, selectedId } = useClasses(uid, classRequest);
  const [code, setCode] = useState('');
  useEffect(() => setCode(''), [uid]);
  const id = selectedId;
  const current = useRef({ load, id });
  current.current = { load, id };
  useFocusEffect(useCallback(() => { void current.current.load(current.current.id); }, []));
  useEffect(() => { const sub = AppState.addEventListener('change', (state) => { if (state === 'active') void load(id); }); return () => sub.remove(); }, [load, id]);
  const card = { ...cardSurface, padding: 20, gap: 12 };
  const text = { color: colors.ink, fontSize: 16, lineHeight: 24 };
  const heading = { ...text, fontSize: 22, fontWeight: '700' as const };
  const c = detail?.classroom;
  const panel = { detail: detail!, busy, act, t, ht: language === 'ht' };
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 60 }}>
    <Button label={t('Retour', 'Retounen')} variant="ghost" onPress={() => navigation.goBack()} />
    <Text accessibilityRole="header" style={heading}>{c?.title || t('Mes classes', 'Klas mwen yo')}</Text>
    {!uid ? <><Text style={text}>{t('Connecte-toi pour rejoindre ta classe.', 'Konekte pou antre nan klas ou.')}</Text><Button label={t('Se connecter', 'Konekte')} onPress={() => useStore.getState().setShowAuthModal(true)} /></> : <>
      {loading && <Text accessibilityLiveRegion="polite" style={text}>{t('Chargement…', 'Ap chaje…')}</Text>}
      {error != null && <View style={card}><Text accessibilityRole="alert" style={{ ...text, color: colors.dangerInk }}>{classErrorMessage(error, language)}</Text><Button label={t('Réessayer', 'Eseye ankò')} variant="secondary" disabled={busy || loading} onPress={() => load(id)} /></View>}
      {c ? <>
        <Button label={t('Toutes mes classes', 'Tout klas mwen yo')} variant="secondary" disabled={busy} onPress={() => load()} />
        <Text style={text}>{c.school} · {c.grade}</Text>
        {c.archived && <Text style={text}>{t('Classe archivée', 'Klas achive')}</Text>}
        <ConsentNotice {...panel} />
        <TeacherInvite {...panel} />
        <View style={card}><Text accessibilityRole="header" style={heading}>{t('Devoirs', 'Devwa yo')}</Text><Text style={text}>{t('Après avoir enregistré ton examen, reviens confirmer ici. Ce sont des résultats de pratique.', 'Lè ou fin anrejistre egzamen ou, retounen konfime isit la. Rezilta sa yo se pou pratik.')}</Text>
          {!c.assignments.length && <Text style={text}>{t('Aucun devoir publié.', 'Pa gen devwa pibliye.')}</Text>}
          {c.assignments.map((a) => <View key={a.id} style={{ paddingVertical: 16, gap: 12, borderTopWidth: 1, borderColor: colors.border }}><Text style={{ ...text, fontWeight: '700' }}>{a.title}</Text><Text style={text}>{t('À rendre', 'Pou remèt')} : {new Date(a.dueAt).toLocaleString('fr-FR', { timeZone: 'America/Port-au-Prince' })} · {t('Heure d’Haïti', 'Lè Ayiti')}</Text><Text style={text}>{detail.completionCounts[a.id] || 0}/{detail.members.length} {t('terminés', 'fini')}</Text>
            <Button label={t('Ouvrir l’examen', 'Ouvri egzamen an')} variant="secondary" onPress={() => navigation.navigate('Main', { screen: 'Exams', params: { screen: 'ExamOverview', params: { examId: a.examId, level: a.level }, initial: false } })} />
            {detail.teacher && detail.members.map((m) => { const score = detail.scores?.[m.uid]?.[a.id]; return <Text key={m.uid} style={text}>{m.name} : {!score ? t('À faire', 'Pou fè') : `${t('Terminé', 'Fini')} · ${score.objectiveScore == null ? t('Sans note objective', 'San nòt objektif') : `${score.objectiveScore}%`}${score.late ? ` ${t('(en retard)', '(anreta)')}` : ''}`}</Text>; })}
            {!detail.teacher && <Button label={detail.completed.includes(a.id) ? t('Terminé', 'Fini') : t('Confirmer mon examen enregistré', 'Konfime egzamen mwen anrejistre a')} disabled={busy || c.archived || detail.completed.includes(a.id)} onPress={() => act('complete', { id: c.id, assignmentId: a.id })} />}
          </View>)}
        </View>
        <AssignExamForm key={`assign-${c.id}`} {...panel} />
        <View style={card}><Text accessibilityRole="header" style={heading}>{t('Tableau de la semaine', 'Tablo semèn nan')}</Text><Text style={text}>{detail.week} · {t('XP de pratique, sans valeur de compétition', 'XP pratik, li pa konte pou konpetisyon')}</Text>{!detail.members.length && <Text style={text}>{t('Les élèves approuvés apparaîtront ici.', 'Elèv ki apwouve yo ap parèt isit la.')}</Text>}{detail.members.map((m) => <View key={m.uid} style={{ gap: 4, paddingVertical: 10 }}><Text style={{ ...text, fontWeight: '700' }}>{m.name}</Text><Text style={text}>{m.xp} XP · {m.completed} {t('devoirs cette semaine', 'devwa semèn sa a')}</Text>{detail.teacher && !c.archived && <Button size="sm" variant="ghost" label={t('Retirer', 'Retire')} accessibilityLabel={`${t('Retirer', 'Retire')} ${m.name}`} disabled={busy} onPress={() => Alert.alert(t('Retirer cet élève ?', 'Retire elèv sa a?'), m.name, [{ text: t('Annuler', 'Anile'), style: 'cancel' }, { text: t('Retirer', 'Retire'), style: 'destructive', onPress: () => { void act('remove', { id: c.id, studentUid: m.uid }); } }])} />}</View>)}</View>
        <HousesPanel key={`houses-${c.id}`} {...panel} />
        <FixturesPanel key={`fixtures-${c.id}`} {...panel} onOpen={(tid) => navigation.navigate('Tournois', { tournamentId: tid })} />
        {detail.teacher && <AnalyticsPanel key={`analytics-${c.id}`} detail={detail} t={t} ht={language === 'ht'} />}
        {detail.teacher && !c.archived && <Button label={t('Archiver', 'Achive')} variant="outline" disabled={busy} onPress={() => Alert.alert(t('Archiver la classe ? Les devoirs seront fermés.', 'Achive klas la? Devwa yo ap fèmen.'), '', [{ text: t('Annuler', 'Anile'), style: 'cancel' }, { text: t('Archiver', 'Achive'), style: 'destructive', onPress: () => { void act('archive', { id: c.id }); } }])} />}
        {!detail.teacher && <Button label={t('Quitter la classe', 'Kite klas la')} variant="outline" disabled={busy} onPress={() => Alert.alert(t('Quitter cette classe ?', 'Kite klas sa a?'), '', [{ text: t('Annuler', 'Anile'), style: 'cancel' }, { text: t('Quitter', 'Kite'), style: 'destructive', onPress: () => { void act('leave', { id: c.id }); } }])} />}
      </> : <>
        {home?.canTeach && <CreateClassForm busy={busy} act={act} t={t} />}
        {home?.classes.map((r) => <View style={card} key={r.id}><Text accessibilityRole="header" style={heading}>{r.title}</Text><Text style={text}>{r.school}</Text>{r.pending ? <><Text style={text}>{r.archived ? t('Classe archivée. Tu peux annuler ta demande.', 'Klas achive. Ou ka anile demann ou.') : t('En attente de validation du professeur.', 'Ap tann apwobasyon pwofesè a.')}</Text><Button label={t('Annuler la demande', 'Anile demann lan')} variant="outline" disabled={busy} onPress={() => act('leave', { id: r.id })} /></> : <Button label={t('Ouvrir', 'Ouvri')} disabled={busy || loading} onPress={() => load(r.id)} />}</View>)}
        <View style={card}><Text accessibilityRole="header" style={heading}>{t('Rejoindre une classe', 'Antre nan yon klas')}</Text><Text style={text}>{t('Demande le code à ton professeur.', 'Mande pwofesè ou kòd la.')}</Text><TextInput accessibilityLabel={t('Code de 6 caractères', 'Kòd 6 karaktè')} placeholder={t('Code de 6 caractères', 'Kòd 6 karaktè')} placeholderTextColor={colors.muted} autoCapitalize="characters" autoCorrect={false} maxLength={6} value={code} onChangeText={(v) => setCode(v.toUpperCase())} style={{ ...text, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14 }} /><Text style={text}>{CLASS_PRIVACY[language === 'ht' ? 'ht' : 'fr']}</Text><Button label={t('Accepter et demander à rejoindre', 'Aksepte epi mande pou antre')} disabled={busy || code.trim().length !== 6} onPress={() => Alert.alert(t('Partager avec ma classe', 'Pataje ak klas mwen'), CLASS_PRIVACY[language === 'ht' ? 'ht' : 'fr'], [{ text: t('Annuler', 'Anile'), style: 'cancel' }, { text: t('Accepter', 'Aksepte'), onPress: async () => { if (await act('join', { code, consent: true, name: user?.name || t('Élève', 'Elèv') })) setCode(''); } }])} /></View>
      </>}
      <Button label={t('Actualiser', 'Rafrechi')} variant="ghost" disabled={busy || loading} onPress={() => load(id)} />
    </>}
  </ScrollView></SafeAreaView>;
}
