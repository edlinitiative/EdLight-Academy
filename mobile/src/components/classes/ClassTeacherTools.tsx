/**
 * Native class-space panels: everything a teacher manages on the web (create,
 * approve/reject, assign, houses, fixtures, analytics) plus the student-facing
 * house board, fixture entry and the disclosure re-accept card.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Text, TextInput, View, type TextStyle, type ViewStyle } from 'react-native';
import Button from '../ui/Button';
import PressableScale from '../ui/PressableScale';
import { useTheme } from '../../theme/theme';
import { classRequest } from '../../services/classService';
import { fetchCatalogIndex } from '../../utils/examCatalog';
import { CLASS_PRIVACY, FIXTURE_LIMITS, HOUSE_COLORS, HOUSE_LIMITS, classErrorMessage, houseHex, type ClassAnalytics, type ClassDetail, type FixturePreview } from '../../../../shared/classes';
import { LEVELS, LEVEL_HEX, aggregateHelp, aggregateLabel, defaultHouses, fixturePhaseLabel, haitiTime, levelLabel, teamScoreLine, type Tr } from '../../../../shared/classViews';
import { operationId } from '../../../../shared/competition/client';

type Act = (action: string, values?: Record<string, unknown>) => Promise<boolean>;
export type PanelProps = { detail: ClassDetail; busy: boolean; act: Act; t: Tr; ht: boolean };

function useStyles() {
  const { colors, cardSurface } = useTheme();
  const text: TextStyle = { color: colors.ink, fontSize: 16, lineHeight: 24 };
  return {
    colors, text,
    muted: { ...text, color: colors.muted } as TextStyle,
    heading: { ...text, fontSize: 20, fontWeight: '700' } as TextStyle,
    sub: { ...text, fontWeight: '700' } as TextStyle,
    card: { ...cardSurface, padding: 20, gap: 12 } as ViewStyle,
    input: { ...text, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14 } as TextStyle,
    row: { gap: 4, paddingVertical: 10, borderTopWidth: 1, borderColor: colors.border } as ViewStyle,
    wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } as ViewStyle,
  };
}

/** A selectable pill: 44pt, real selected state for VoiceOver/TalkBack. */
export function Chip({ label, selected, onPress, disabled, radio }: { label: string; selected: boolean; onPress: () => void; disabled?: boolean; radio?: boolean }) {
  const { colors } = useTheme();
  return <PressableScale accessibilityRole={radio ? 'radio' : 'button'} accessibilityLabel={label}
    accessibilityState={radio ? { checked: selected, disabled } : { selected, disabled }} disabled={disabled} onPress={onPress}
    style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: selected ? colors.azureFill : colors.border, backgroundColor: selected ? colors.azureFill : 'transparent', opacity: disabled ? 0.5 : 1 }}>
    <Text maxFontSizeMultiplier={1.6} style={{ color: selected ? '#fff' : colors.ink, fontSize: 15, fontWeight: '600' }}>{label}</Text>
  </PressableScale>;
}

const Dot = ({ color }: { color: string }) => <View accessible={false} style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: houseHex(color) }} />;

export function ConsentNotice({ detail, busy, act, t, ht }: PanelProps) {
  const s = useStyles();
  if (detail.teacher || detail.consentCurrent !== false) return null;
  return <View style={s.card}><Text accessibilityRole="header" style={s.heading}>{t('Nouveau : partage de ta maîtrise', 'Nouvo : pataje metriz ou')}</Text>
    <Text style={s.text}>{CLASS_PRIVACY[ht ? 'ht' : 'fr']}</Text>
    <Button label={t('J’accepte', 'Mwen dakò')} variant="secondary" disabled={busy} onPress={() => act('share-mastery', { id: detail.classroom.id })} /></View>;
}

export function CreateClassForm({ busy, act, t }: { busy: boolean; act: Act; t: Tr }) {
  const s = useStyles();
  const [title, setTitle] = useState(''), [school, setSchool] = useState(''), [grade, setGrade] = useState('');
  const requestId = useRef(operationId());
  const field = (label: string, value: string, set: (v: string) => void, max: number) => <TextInput accessibilityLabel={label} placeholder={label} placeholderTextColor={s.colors.muted} maxLength={max} value={value}
    onChangeText={(v) => { set(v); requestId.current = operationId(); }} style={s.input} />;
  return <View style={s.card}><Text accessibilityRole="header" style={s.heading}>{t('Créer une classe', 'Kreye yon klas')}</Text>
    {field(t('Nom de la classe', 'Non klas la'), title, setTitle, 100)}{field(t('École', 'Lekòl'), school, setSchool, 100)}{field(t('Niveau', 'Nivo'), grade, setGrade, 30)}
    <Button label={t('Créer', 'Kreye')} disabled={busy || !title.trim() || !school.trim() || !grade.trim()} onPress={async () => {
      if (await act('create', { requestId: requestId.current, title, school, grade })) { requestId.current = operationId(); setTitle(''); setSchool(''); setGrade(''); }
    }} /></View>;
}

export function TeacherInvite({ detail, busy, act, t }: PanelProps) {
  const s = useStyles();
  const c = detail.classroom;
  if (!detail.teacher || c.archived) return null;
  return <View style={s.card}><Text accessibilityRole="header" style={s.heading}>{t('Inviter la classe', 'Envite klas la')}</Text>
    <Text style={s.text}>{t('Code à transmettre aux élèves', 'Kòd pou bay elèv yo')} : <Text style={{ fontWeight: '700', letterSpacing: 2 }}>{c.code}</Text></Text>
    <Text style={s.muted}>{t('Chaque demande nécessite ton approbation.', 'Ou dwe apwouve chak demann.')}</Text>
    <Text accessibilityRole="header" style={s.sub}>{t('Demandes', 'Demann yo')}</Text>
    {!detail.pending.length && <Text style={s.text}>{t('Aucune demande en attente.', 'Pa gen demann k ap tann.')}</Text>}
    {detail.pending.map((m) => <View key={m.uid} style={s.row}><Text style={s.sub}>{m.name}</Text><View style={s.wrap}>
      <Button size="sm" label={t('Approuver', 'Apwouve')} accessibilityLabel={`${t('Approuver', 'Apwouve')} ${m.name}`} disabled={busy} onPress={() => act('approve', { id: c.id, studentUid: m.uid })} />
      <Button size="sm" variant="outline" label={t('Refuser', 'Refize')} accessibilityLabel={`${t('Refuser', 'Refize')} ${m.name}`} disabled={busy} onPress={() => act('reject', { id: c.id, studentUid: m.uid })} />
    </View></View>)}
  </View>;
}

const DUE_DAYS = [1, 3, 7, 14];
const dueAt = (days: number) => { const d = new Date(Date.now() + days * 86400000); d.setHours(22, 0, 0, 0); return d.getTime(); };
const examLevel = (raw: unknown) => { const l = String(raw || '').toLowerCase(); return /9|neuvi/.test(l) ? '9e' : /univers/.test(l) ? 'university' : 'terminale'; };

export function AssignExamForm({ detail, busy, act, t }: PanelProps) {
  const s = useStyles();
  const c = detail.classroom;
  const [catalog, setCatalog] = useState<any[] | null>(null), [failed, setFailed] = useState(false), [version, setVersion] = useState(0);
  const [query, setQuery] = useState(''), [exam, setExam] = useState<any>(null), [days, setDays] = useState(7);
  const requestId = useRef(operationId());
  useEffect(() => { let live = true; setFailed(false); fetchCatalogIndex().then((rows) => { if (live) setCatalog(rows); }).catch(() => { if (live) setFailed(true); }); return () => { live = false; }; }, [version]);
  if (!detail.teacher || c.archived) return null;
  const q = query.trim().toLowerCase();
  const matches = q.length < 2 ? [] : (catalog || []).filter((r) => `${r.subject} ${r.year} ${r.exam_title || r.title || ''}`.toLowerCase().includes(q)).slice(0, 12);
  const label = (r: any) => `${r.subject || ''} · ${r.year || ''} · ${r.exam_title || r.title || r.exam_id}`.slice(0, 100);
  return <View style={s.card}><Text accessibilityRole="header" style={s.heading}>{t('Publier un devoir', 'Pibliye yon devwa')}</Text>
    {failed && <><Text accessibilityRole="alert" style={s.text}>{t('Catalogue indisponible.', 'Katalòg la pa disponib.')}</Text><Button size="sm" variant="secondary" label={t('Réessayer', 'Eseye ankò')} onPress={() => setVersion((v) => v + 1)} /></>}
    {exam ? <View style={s.wrap}><Text style={[s.sub, { flex: 1 }]}>{label(exam)}</Text><Button size="sm" variant="ghost" label={t('Changer', 'Chanje')} onPress={() => { setExam(null); requestId.current = operationId(); }} /></View>
      : <TextInput accessibilityLabel={t('Chercher un examen (matière, année)', 'Chèche yon egzamen (matyè, ane)')} placeholder={t('Chercher un examen (matière, année)', 'Chèche yon egzamen (matyè, ane)')} placeholderTextColor={s.colors.muted} value={query} onChangeText={setQuery} style={s.input} />}
    {!exam && matches.map((r) => <Button key={r.exam_id} size="sm" variant="outline" label={label(r)} onPress={() => { setExam(r); requestId.current = operationId(); }} />)}
    <Text style={s.text}>{t('Échéance', 'Dat limit')}</Text>
    <View accessibilityRole="radiogroup" style={s.wrap}>{DUE_DAYS.map((d) => <Chip radio key={d} selected={days === d} label={t(`Dans ${d} jour(s)`, `Nan ${d} jou`)} onPress={() => { setDays(d); requestId.current = operationId(); }} />)}</View>
    <Text style={s.muted}>{t('À rendre à 22 h, heure de ton appareil.', 'Pou remèt a 10 è diswa, lè aparèy ou.')}</Text>
    <Button label={t('Publier', 'Pibliye')} disabled={busy || !exam} onPress={async () => {
      if (await act('assign', { id: c.id, requestId: requestId.current, title: label(exam), examId: exam.exam_id, level: examLevel(exam.level), dueAt: dueAt(days) })) { requestId.current = operationId(); setExam(null); setQuery(''); }
    }} />
  </View>;
}

export function HousesPanel({ detail, busy, act, t, ht }: PanelProps) {
  const s = useStyles();
  const c = detail.classroom, houses = detail.houses || [];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => (houses.length ? houses.map((h) => ({ name: h.name, color: h.color as string })) : defaultHouses(4)));
  const [mode, setMode] = useState<'auto' | 'keep'>('auto');
  if (!detail.teacher && !houses.length) return null;
  const resize = (n: number) => setDraft((d) => [...d.slice(0, n), ...defaultHouses(n).slice(d.length)].map((h, i) => ({ ...h, color: d[i]?.color || HOUSE_COLORS.find((x) => !d.some((y) => y.color === x.id))?.id || h.color })));
  const valid = new Set(draft.map((h) => h.color)).size === draft.length && draft.every((h) => h.name.trim());
  const nextColor = (i: number) => {
    const used = new Set(draft.map((h, j) => (j === i ? '' : h.color)));
    const start = HOUSE_COLORS.findIndex((x) => x.id === draft[i].color);
    for (let k = 1; k <= HOUSE_COLORS.length; k += 1) { const cand = HOUSE_COLORS[(start + k) % HOUSE_COLORS.length].id; if (!used.has(cand)) return cand; }
    return draft[i].color;
  };
  return <View style={s.card}><Text accessibilityRole="header" style={s.heading}>{t('Maisons', 'Kay yo')}</Text>
    {!detail.teacher && detail.myHouse && <Text style={s.text}>{t('Ta maison', 'Kay ou')} : <Text style={{ fontWeight: '700' }}>{houses.find((h) => h.id === detail.myHouse)?.name}</Text></Text>}
    {houses.length > 0 && <Text style={s.muted}>{t('Total des XP de pratique de la semaine, par maison.', 'Total XP pratik semèn nan, pou chak kay.')}</Text>}
    {houses.map((h) => <View key={h.id} style={s.row} accessible accessibilityLabel={`${h.rank}. ${h.name}, ${h.xp} XP, ${h.members} ${t('élèves', 'elèv')}`}>
      <View style={[s.wrap, { alignItems: 'center' }]}><Dot color={h.color} /><Text style={s.sub}>{h.rank}. {h.name}{detail.myHouse === h.id ? ` · ${t('Ta maison', 'Kay ou')}` : ''}</Text></View>
      <Text style={s.text}>{h.xp} XP · {h.members} {t('élèves', 'elèv')} · {h.completed} {t('devoirs', 'devwa')}</Text></View>)}
    {detail.teacher && !c.archived && (!editing ? <View style={s.wrap}>
      <Button size="sm" variant="secondary" label={houses.length ? t('Modifier les maisons', 'Modifye kay yo') : t('Créer des maisons', 'Kreye kay')} disabled={busy} onPress={() => setEditing(true)} />
      {houses.length > 0 && <Button size="sm" variant="ghost" label={t('Rééquilibrer', 'Reekilibre')} disabled={busy} onPress={() => act('houses-balance', { id: c.id })} />}
      {houses.length > 0 && <Button size="sm" variant="ghost" label={t('Supprimer les maisons', 'Efase kay yo')} disabled={busy} onPress={() => Alert.alert(t('Supprimer les maisons ?', 'Efase kay yo?'), '', [{ text: t('Annuler', 'Anile'), style: 'cancel' }, { text: t('Supprimer', 'Efase'), style: 'destructive', onPress: () => { void act('houses-clear', { id: c.id }); } }])} />}
    </View> : <View style={{ gap: 12 }}>
      <Text style={s.text}>{t('Nombre de maisons', 'Kantite kay')}</Text>
      <View accessibilityRole="radiogroup" style={s.wrap}>{[2, 3, 4, 5, 6].map((n) => <Chip radio key={n} label={String(n)} selected={draft.length === n} onPress={() => resize(n)} />)}</View>
      {draft.map((h, i) => <View key={i} style={[s.wrap, { alignItems: 'center' }]}>
        <Dot color={h.color} />
        <TextInput accessibilityLabel={t(`Nom de la maison ${i + 1}`, `Non kay ${i + 1}`)} maxLength={HOUSE_LIMITS.name} value={h.name} onChangeText={(v) => setDraft((d) => d.map((x, j) => (j === i ? { ...x, name: v } : x)))} style={[s.input, { flex: 1, minWidth: 140 }]} />
        <Button size="sm" variant="outline" label={t('Couleur', 'Koulè')} accessibilityLabel={t(`Changer la couleur de la maison ${i + 1}`, `Chanje koulè kay ${i + 1}`)} onPress={() => setDraft((d) => d.map((x, j) => (j === i ? { ...x, color: nextColor(i) } : x)))} />
      </View>)}
      {!valid && <Text accessibilityRole="alert" style={{ ...s.text, color: s.colors.dangerInk }}>{t('Chaque maison a besoin d’un nom et d’une couleur différente.', 'Chak kay bezwen yon non ak yon koulè diferan.')}</Text>}
      {houses.length > 0 && <View accessibilityRole="radiogroup" style={s.wrap}>{(['auto', 'keep'] as const).map((m) => <Chip radio key={m} selected={mode === m} label={m === 'auto' ? t('Répartir automatiquement', 'Repati otomatikman') : t('Garder la répartition', 'Kenbe repatisyon an')} onPress={() => setMode(m)} />)}</View>}
      <Text style={s.muted}>{t('La répartition automatique équilibre le nombre d’élèves et les XP récents.', 'Repatisyon otomatik la balanse kantite elèv ak XP resan yo.')}</Text>
      <View style={s.wrap}><Button label={t('Enregistrer', 'Anrejistre')} disabled={busy || !valid} onPress={async () => { if (await act('houses-set', { id: c.id, houses: draft, mode: houses.length ? mode : 'auto' })) setEditing(false); }} />
        <Button variant="ghost" label={t('Annuler', 'Anile')} onPress={() => setEditing(false)} /></View>
    </View>)}
    {detail.teacher && !c.archived && !editing && houses.length > 0 && detail.members.map((m) => <View key={m.uid} style={s.row}>
      <Text style={s.sub}>{m.name}</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={t(`Maison de ${m.name}`, `Kay ${m.name}`)} style={s.wrap}>{houses.map((h) => <Chip radio key={h.id} label={h.name} selected={m.house === h.id} disabled={busy} onPress={() => act('house-move', { id: c.id, studentUid: m.uid, houseId: h.id })} />)}</View>
    </View>)}
  </View>;
}

const STARTS = [{ key: 'soon', hours: 0.25 }, { key: 'tomorrow', hours: 24 }, { key: 'twoDays', hours: 48 }] as const;
const startAt = (key: string) => { const base = Date.now(); if (key === 'soon') return base + 15 * 60000; const d = new Date(base + (key === 'tomorrow' ? 1 : 2) * 86400000); d.setHours(8, 0, 0, 0); return d.getTime(); };

export function FixturesPanel({ detail, busy, act, t, ht, onOpen }: PanelProps & { onOpen: (tid: string) => void }) {
  const s = useStyles();
  const c = detail.classroom, fixtures = detail.fixtures || [], cats = detail.fixtureCategories || [];
  const [proposing, setProposing] = useState(false);
  const [form, setForm] = useState({ categories: [] as string[], questionCount: 10, secondsPerQuestion: 20, windowHours: 48, teamSize: 5, aggregate: 'average', start: 'tomorrow' });
  const requestId = useRef(operationId());
  const set = (patch: Partial<typeof form>) => { setForm((f) => ({ ...f, ...patch })); requestId.current = operationId(); };
  const [code, setCode] = useState(''), [preview, setPreview] = useState<FixturePreview | null>(null), [previewError, setPreviewError] = useState<unknown>(null);
  return <View style={s.card}><Text accessibilityRole="header" style={s.heading}>{t('Défis entre classes', 'Defi ant klas')}</Text>
    <Text style={s.muted}>{t('Chaque élève joue une fois pendant la fenêtre ; le serveur chronomètre et note. Seuls les prénoms apparaissent.', 'Chak elèv jwe yon fwa pandan fenèt la ; sèvè a kontwole tan ak nòt. Se sèlman premye non ki parèt.')}</Text>
    {!fixtures.length && <Text style={s.text}>{detail.teacher ? t('Aucun défi pour l’instant.', 'Poko gen defi.') : t('Ton professeur n’a pas encore organisé de défi.', 'Pwofesè ou poko òganize defi.')}</Text>}
    {fixtures.map((f) => <View key={f.id} style={s.row}>
      <Text style={s.sub}>{f.title}</Text>
      <Text style={s.text}>{f.opponent ? `${t('Contre', 'Kont')} ${f.opponent.title}${f.opponent.school ? ` · ${f.opponent.school}` : ''}` : t('Adversaire à confirmer', 'Advèsè pou konfime')}</Text>
      <Text style={{ ...s.text, color: s.colors.azureInk, fontWeight: '700' }}>{fixturePhaseLabel(f, t)}</Text>
      <Text style={s.muted}>{aggregateLabel(f.aggregate, f.teamSize, t)} · {haitiTime(f.startsAt, ht)}</Text>
      {f.code && <Text style={s.text}>{t('Code pour l’autre professeur', 'Kòd pou lòt pwofesè a')} : <Text style={{ fontWeight: '700', letterSpacing: 2 }}>{f.code}</Text></Text>}
      {f.state === 'accepted' && <><Text style={s.text}>{t('Ta classe', 'Klas ou')} : {teamScoreLine(f.mine, f.teamSize, t)}</Text><Text style={s.text}>{f.opponent?.title} : {teamScoreLine(f.theirs, f.teamSize, t)}</Text></>}
      <View style={s.wrap}>
        {!detail.teacher && f.tid && (f.phase === 'open' || f.phase === 'upcoming') && !f.joined && <Button size="sm" label={t('Rejoindre le match', 'Antre nan match la')} disabled={busy || c.archived} onPress={async () => { if (await act('fixture-join', { id: c.id, fixtureId: f.id })) onOpen(f.tid!); }} />}
        {f.tid && (detail.teacher || f.joined) && <Button size="sm" variant="secondary" label={f.phase === 'final' ? t('Voir le classement', 'Wè klasman an') : t('Ouvrir le match', 'Ouvri match la')} onPress={() => onOpen(f.tid!)} />}
        {f.code && <Button size="sm" variant="ghost" label={t('Annuler le défi', 'Anile defi a')} disabled={busy} onPress={() => act('fixture-cancel', { id: c.id, fixtureId: f.id })} />}
      </View>
    </View>)}
    {detail.teacher && !c.archived && <>
      {!proposing ? <Button variant="secondary" label={t('Défier une autre classe', 'Defi yon lòt klas')} disabled={busy} onPress={() => setProposing(true)} /> : <View style={{ gap: 12 }}>
        <Text accessibilityRole="header" style={s.sub}>{t('Nouveau défi', 'Nouvo defi')}</Text>
        <Text style={s.text}>{t('Thèmes', 'Tèm')}</Text>
        <View style={s.wrap}>{cats.map((x) => { const on = form.categories.includes(x.id); return <Chip key={x.id} selected={on} label={ht ? x.nameHt : x.name} disabled={!on && form.categories.length >= FIXTURE_LIMITS.categoriesMax} onPress={() => set({ categories: on ? form.categories.filter((y) => y !== x.id) : [...form.categories, x.id] })} />; })}</View>
        <Text style={s.text}>{t('Début', 'Kòmansman')}</Text>
        <View accessibilityRole="radiogroup" style={s.wrap}>{STARTS.map((x) => <Chip radio key={x.key} selected={form.start === x.key} label={x.key === 'soon' ? t('Dans 15 min', 'Nan 15 minit') : x.key === 'tomorrow' ? t('Demain 8 h', 'Demen 8 è') : t('Dans 2 jours, 8 h', 'Nan 2 jou, 8 è')} onPress={() => set({ start: x.key })} />)}</View>
        <Text style={s.text}>{t('Durée de la fenêtre', 'Dire fenèt la')}</Text>
        <View accessibilityRole="radiogroup" style={s.wrap}>{FIXTURE_LIMITS.windowHours.map((h) => <Chip radio key={h} selected={form.windowHours === h} label={h < 24 ? `${h} h` : t(`${h / 24} j`, `${h / 24} jou`)} onPress={() => set({ windowHours: h })} />)}</View>
        <Text style={s.text}>{t('Questions', 'Kesyon')}</Text>
        <View accessibilityRole="radiogroup" style={s.wrap}>{FIXTURE_LIMITS.questionCounts.map((n) => <Chip radio key={n} selected={form.questionCount === n} label={String(n)} onPress={() => set({ questionCount: n })} />)}</View>
        <Text style={s.text}>{t('Joueurs comptés par classe', 'Jwè ki konte pou chak klas')}</Text>
        <View accessibilityRole="radiogroup" style={s.wrap}>{FIXTURE_LIMITS.teamSizes.map((n) => <Chip radio key={n} selected={form.teamSize === n} label={String(n)} onPress={() => set({ teamSize: n })} />)}</View>
        <View accessibilityRole="radiogroup" style={s.wrap}>{(['average', 'sum'] as const).map((a) => <Chip radio key={a} selected={form.aggregate === a} label={aggregateLabel(a, form.teamSize, t)} onPress={() => set({ aggregate: a })} />)}</View>
        <Text style={s.muted}>{aggregateHelp(form.aggregate, t)}</Text>
        <View style={s.wrap}><Button label={t('Créer le défi', 'Kreye defi a')} disabled={busy || !form.categories.length} onPress={async () => {
          if (await act('fixture-propose', { id: c.id, requestId: requestId.current, categories: form.categories, questionCount: form.questionCount, secondsPerQuestion: form.secondsPerQuestion, windowHours: form.windowHours, teamSize: form.teamSize, aggregate: form.aggregate, startsAt: startAt(form.start) })) { setProposing(false); requestId.current = operationId(); }
        }} /><Button variant="ghost" label={t('Annuler', 'Anile')} onPress={() => setProposing(false)} /></View>
      </View>}
      <Text accessibilityRole="header" style={s.sub}>{t('Accepter le défi d’un collègue', 'Aksepte defi yon kolèg')}</Text>
      <TextInput accessibilityLabel={t('Code du défi', 'Kòd defi a')} placeholder={t('Code du défi', 'Kòd defi a')} placeholderTextColor={s.colors.muted} autoCapitalize="characters" autoCorrect={false} maxLength={6} value={code} onChangeText={(v) => { setCode(v.toUpperCase()); setPreview(null); }} style={s.input} />
      <Button variant="secondary" label={t('Voir le défi', 'Wè defi a')} disabled={busy || code.length !== 6} onPress={async () => { setPreview(null); setPreviewError(null); try { setPreview(await classRequest<FixturePreview>('fixture-preview', { code })); } catch (error) { setPreviewError(error); } }} />
      {previewError != null && <Text accessibilityRole="alert" style={{ ...s.text, color: s.colors.dangerInk }}>{classErrorMessage(previewError, ht ? 'ht' : 'fr')}</Text>}
      {preview && <View style={{ gap: 8 }} accessibilityLiveRegion="polite"><Text style={s.sub}>{preview.title} · {preview.home.title} · {preview.home.school}</Text>
        <Text style={s.text}>{haitiTime(preview.startsAt, ht)} · {preview.windowHours} h · {aggregateLabel(preview.aggregate, preview.teamSize, t)}</Text>
        <View style={s.wrap}><Button label={t(`Accepter pour ${c.title}`, `Aksepte pou ${c.title}`)} disabled={busy} onPress={async () => { if (await act('fixture-accept', { id: c.id, code })) { setCode(''); setPreview(null); } }} />
          <Button variant="ghost" label={t('Refuser', 'Refize')} disabled={busy} onPress={async () => { if (await act('fixture-decline', { code })) { setCode(''); setPreview(null); } }} /></View></View>}
    </>}
  </View>;
}

export function AnalyticsPanel({ detail, t, ht }: { detail: ClassDetail; t: Tr; ht: boolean }) {
  const s = useStyles();
  const id = detail.classroom.id;
  const [courseId, setCourseId] = useState<string | undefined>(undefined), [version, setVersion] = useState(0);
  const [state, setState] = useState<{ data?: ClassAnalytics; error?: unknown; loading: boolean }>({ loading: true });
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setState((x) => ({ data: x.data, loading: true }));
    classRequest<ClassAnalytics>('analytics', { id, ...(courseId ? { courseId } : {}) })
      .then((data) => { if (live) setState({ data, loading: false }); }).catch((error) => { if (live) setState({ error, loading: false }); });
    return () => { live = false; };
  }, [id, courseId, version]);
  if (!detail.teacher) return null;
  const a = state.data;
  return <View style={s.card} accessibilityState={{ busy: state.loading }}>
    <Text accessibilityRole="header" style={s.heading}>{t('Suivi de la maîtrise', 'Swivi metriz')}</Text>
    <Text style={s.muted}>{t('Niveaux par chapitre, calculés à partir de la pratique. Aucune réponse n’est visible.', 'Nivo pou chak chapit, kalkile apati pratik la. Ou pa wè okenn repons.')}</Text>
    {state.loading && !a && <Text accessibilityLiveRegion="polite" style={s.text}>{t('Chargement…', 'Ap chaje…')}</Text>}
    {state.error != null && <><Text accessibilityRole="alert" style={{ ...s.text, color: s.colors.dangerInk }}>{classErrorMessage(state.error, ht ? 'ht' : 'fr')}</Text><Button size="sm" variant="secondary" label={t('Réessayer', 'Eseye ankò')} onPress={() => setVersion((v) => v + 1)} /></>}
    {a && <>
      <View style={s.wrap}>{a.courses.map((x) => <Chip radio key={x.id} label={x.name} selected={a.courseId === x.id} onPress={() => setCourseId(x.id)} />)}</View>
      <Text style={s.text}>{t(`${a.shared} élève(s) inclus`, `${a.shared} elèv ladan`)}{a.notShared > 0 ? ` · ${t(`${a.notShared} n’ont pas encore accepté le partage`, `${a.notShared} poko aksepte pataj la`)}` : ''}</Text>
      {a.weakest.length > 0 && <><Text accessibilityRole="header" style={s.sub}>{t('Chapitres à retravailler', 'Chapit pou travay ankò')}</Text>
        {a.weakest.map((cid, i) => <Text key={cid} style={s.text}>{i + 1}. {a.chapters.find((ch) => ch.id === cid)?.title}</Text>)}</>}
      <Text accessibilityRole="header" style={s.sub}>{t('Répartition par chapitre', 'Repatisyon pa chapit')}</Text>
      {a.shared === 0 ? <Text style={s.text}>{t('Aucune donnée partagée pour l’instant.', 'Poko gen done pataje.')}</Text> : a.chapters.map((ch) => <View key={ch.id} style={s.row}>
        <PressableScale accessibilityRole="button" accessibilityLabel={`${ch.title}, ${ch.avgPoints}/100`} accessibilityState={{ expanded: open === ch.id }} onPress={() => setOpen(open === ch.id ? null : ch.id)} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={s.sub}>{ch.title} · {ch.avgPoints}/100</Text></PressableScale>
        <View accessible={false} style={{ flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: s.colors.surfaceAlt }}>{LEVELS.map((l) => ch.percent[l] > 0 ? <View key={l} style={{ width: `${ch.percent[l]}%`, backgroundColor: LEVEL_HEX[l] }} /> : null)}</View>
        <Text style={s.text}>{LEVELS.filter((l) => ch.counts[l]).map((l) => `${levelLabel(l, ht)} ${ch.counts[l]} (${ch.percent[l]} %)`).join(' · ')}</Text>
        {open === ch.id && ch.lessonRows.map((l) => <Text key={l.id} style={s.muted}>{l.title} : {LEVELS.filter((x) => l.counts[x]).map((x) => `${levelLabel(x, ht)} ${l.counts[x]}`).join(' · ')}</Text>)}
      </View>)}
      {a.students.length > 0 && <><Text accessibilityRole="header" style={s.sub}>{t('Par élève', 'Pa elèv')}</Text>
        {a.students.map((st) => <View key={st.uid} style={s.row}><Text style={s.sub}>{st.name} · {st.points}/100</Text>
          <Text style={s.text}>{a.chapters.map((ch) => `${ch.title} : ${levelLabel(st.levels[ch.id] || 'none', ht)}`).join(' · ')}</Text></View>)}</>}
      <Text accessibilityRole="header" style={s.sub}>{t('Devoirs', 'Devwa yo')}</Text>
      {!a.assignments.length ? <Text style={s.text}>{t('Aucun devoir publié.', 'Pa gen devwa pibliye.')}</Text> : a.assignments.map((x) => <Text key={x.id} style={s.text}>{x.title} : {x.completed} {t('terminés', 'fini')} ({x.rate} %) · {x.late} {t('en retard', 'anreta')}</Text>)}
    </>}
  </View>;
}
