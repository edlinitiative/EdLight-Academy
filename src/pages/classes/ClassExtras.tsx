import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CLASS_PRIVACY, FIXTURE_LIMITS, HOUSE_COLORS, HOUSE_LIMITS, classErrorMessage, houseHex, type ClassAnalytics, type ClassDetail, type FixturePreview } from '../../../shared/classes';
import { LEVELS, LEVEL_HEX, aggregateHelp, aggregateLabel, defaultHouses, fixturePhaseLabel, haitiTime, houseColorName, levelLabel, teamScoreLine, type Tr } from '../../../shared/classViews';
import { operationId } from '../../../shared/competition/client';

type Act = (action: string, values?: Record<string, unknown>) => Promise<boolean>;
type Request = <T = any>(action: string, values?: Record<string, unknown>) => Promise<T>;
type Props = { detail: ClassDetail; busy: boolean; act: Act; t: Tr; ht: boolean };

const Dot = ({ color }: { color: string }) => <span aria-hidden="true" className="classes-dot" style={{ background: houseHex(color) }} />;

/** Students who joined under the earlier disclosure re-accept before their mastery is shared. */
export function ConsentCard({ detail, busy, act, t, ht }: Props) {
  if (detail.teacher || detail.consentCurrent !== false) return null;
  return <div className="card"><h2>{t('Nouveau : partage de ta maîtrise', 'Nouvo : pataje metriz ou')}</h2><p>{CLASS_PRIVACY[ht ? 'ht' : 'fr']}</p>
    <button className="button button--secondary" disabled={busy} onClick={() => act('share-mastery', { id: detail.classroom.id })}>{t('J’accepte', 'Mwen dakò')}</button></div>;
}

export function ClassHouses({ detail, busy, act, t, ht }: Props) {
  const c = detail.classroom, houses = detail.houses || [];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => (houses.length ? houses.map((h) => ({ name: h.name, color: h.color as string })) : defaultHouses(4)));
  const [mode, setMode] = useState<'auto' | 'keep'>('auto');
  const resize = (n: number) => setDraft((d) => [...d.slice(0, n), ...defaultHouses(n).slice(d.length)].map((h, i) => ({ ...h, color: d[i]?.color || HOUSE_COLORS.find((x) => !d.some((y) => y.color === x.id))?.id || h.color })));
  const colorsOk = new Set(draft.map((h) => h.color)).size === draft.length && draft.every((h) => h.name.trim());
  if (!detail.teacher && !houses.length) return null;
  const nameOf = (id?: string | null) => houses.find((h) => h.id === id)?.name;
  return <div className="card"><h2>{t('Maisons', 'Kay yo')}</h2>
    {!detail.teacher && detail.myHouse && <p>{t('Ta maison', 'Kay ou')} : <strong>{nameOf(detail.myHouse)}</strong></p>}
    {houses.length > 0 && <><p className="text-muted">{t('Total des XP de pratique de la semaine, par maison.', 'Total XP pratik semèn nan, pou chak kay.')}</p>
      <ol className="classes-members" aria-label={t('Classement des maisons', 'Klasman kay yo')}>{houses.map((h) => <li key={h.id}>
        <span><Dot color={h.color} /> {h.rank}. {h.name} {detail.myHouse === h.id && <span className="classes-badge">{t('Ta maison', 'Kay ou')}</span>}</span>
        <span>{h.xp} XP · {h.members} {t('élèves', 'elèv')} · {h.completed} {t('devoirs', 'devwa')}</span></li>)}</ol></>}
    {detail.teacher && !c.archived && <>
      {!houses.length && !editing && <p>{t('Partage la classe en 2 à 6 maisons pour une rivalité amicale chaque semaine.', 'Separe klas la an 2 a 6 kay pou yon ti konpetisyon chak semèn.')}</p>}
      {!editing ? <div className="classes-actions">
        <button className="button button--secondary" disabled={busy} onClick={() => setEditing(true)}>{houses.length ? t('Modifier les maisons', 'Modifye kay yo') : t('Créer des maisons', 'Kreye kay')}</button>
        {houses.length > 0 && <button className="button button--ghost" disabled={busy} onClick={() => act('houses-balance', { id: c.id })}>{t('Rééquilibrer', 'Reekilibre')}</button>}
        {houses.length > 0 && <button className="button button--ghost" disabled={busy} onClick={() => { if (window.confirm(t('Supprimer les maisons ?', 'Efase kay yo?'))) void act('houses-clear', { id: c.id }); }}>{t('Supprimer les maisons', 'Efase kay yo')}</button>}
      </div> : <form className="classes-form" onSubmit={async (e) => { e.preventDefault(); if (await act('houses-set', { id: c.id, houses: draft, mode: houses.length ? mode : 'auto' })) setEditing(false); }}>
        <label>{t('Nombre de maisons', 'Kantite kay')}<select value={draft.length} onChange={(e) => resize(Number(e.target.value))}>{Array.from({ length: HOUSE_LIMITS.max - HOUSE_LIMITS.min + 1 }, (_, i) => i + HOUSE_LIMITS.min).map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
        {draft.map((h, i) => <fieldset key={i} className="classes-house-row"><legend className="sr-only">{t(`Maison ${i + 1}`, `Kay ${i + 1}`)}</legend>
          <label>{t(`Nom de la maison ${i + 1}`, `Non kay ${i + 1}`)}<input required maxLength={HOUSE_LIMITS.name} value={h.name} onChange={(e) => setDraft((d) => d.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /></label>
          <label>{t('Couleur', 'Koulè')}<select value={h.color} onChange={(e) => setDraft((d) => d.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)))}>{HOUSE_COLORS.map((x) => <option key={x.id} value={x.id}>{ht ? x.ht : x.fr}</option>)}</select></label>
          <Dot color={h.color} /></fieldset>)}
        {!colorsOk && <p role="alert">{t('Chaque maison a besoin d’un nom et d’une couleur différente.', 'Chak kay bezwen yon non ak yon koulè diferan.')}</p>}
        {houses.length > 0 && <div role="radiogroup" aria-label={t('Répartition', 'Repatisyon')} className="classes-actions">
          {(['auto', 'keep'] as const).map((m) => <button type="button" key={m} role="radio" aria-checked={mode === m} className={`classes-chip${mode === m ? ' is-on' : ''}`} onClick={() => setMode(m)}>{m === 'auto' ? t('Répartir automatiquement', 'Repati otomatikman') : t('Garder la répartition', 'Kenbe repatisyon an')}</button>)}
        </div>}
        <p className="text-muted">{t('La répartition automatique équilibre le nombre d’élèves et les XP récents.', 'Repatisyon otomatik la balanse kantite elèv ak XP resan yo.')}</p>
        <div className="classes-actions"><button className="button button--primary" disabled={busy || !colorsOk}>{t('Enregistrer', 'Anrejistre')}</button><button type="button" className="button button--ghost" onClick={() => setEditing(false)}>{t('Annuler', 'Anile')}</button></div>
      </form>}
      {houses.length > 0 && !editing && detail.members.length > 0 && <details><summary>{t('Changer un élève de maison', 'Chanje kay yon elèv')}</summary>
        <ul className="classes-members">{detail.members.map((m) => <li key={m.uid}><span>{m.name}</span>
          <label className="sr-only" htmlFor={`house-${m.uid}`}>{t(`Maison de ${m.name}`, `Kay ${m.name}`)}</label>
          <select id={`house-${m.uid}`} disabled={busy} value={m.house || ''} onChange={(e) => act('house-move', { id: c.id, studentUid: m.uid, houseId: e.target.value })}>
            {houses.map((h) => <option key={h.id} value={h.id}>{h.name} ({houseColorName(h.color, ht)})</option>)}</select></li>)}</ul></details>}
    </>}
  </div>;
}

const localInput = (ms: number) => { const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };

export function ClassFixtures({ detail, busy, act, t, ht, request }: Props & { request: Request }) {
  const c = detail.classroom, fixtures = detail.fixtures || [], cats = detail.fixtureCategories || [];
  const [proposing, setProposing] = useState(false);
  const [form, setForm] = useState({ categories: [] as string[], questionCount: 10, secondsPerQuestion: 20, windowHours: 48, teamSize: 5, aggregate: 'average', start: localInput(Date.now() + 3600000), title: '' });
  const requestId = useRef(operationId());
  const [code, setCode] = useState(''), [preview, setPreview] = useState<FixturePreview | null>(null), [previewError, setPreviewError] = useState<unknown>(null);
  const set = (patch: Partial<typeof form>) => { setForm((f) => ({ ...f, ...patch })); requestId.current = operationId(); };
  const look = async () => { setPreview(null); setPreviewError(null); try { setPreview(await request<FixturePreview>('fixture-preview', { code })); } catch (error) { setPreviewError(error); } };
  return <div className="card"><h2>{t('Défis entre classes', 'Defi ant klas')}</h2>
    <p className="text-muted">{t('Un match sur une fenêtre de temps : chaque élève joue une fois, le serveur chronomètre et note. Seuls les prénoms apparaissent.', 'Yon match sou yon fenèt tan : chak elèv jwe yon fwa, sèvè a kontwole tan ak nòt. Se sèlman premye non ki parèt.')}</p>
    {!fixtures.length && <p>{detail.teacher ? t('Aucun défi pour l’instant. Lance-en un ou accepte celui d’un collègue.', 'Poko gen defi. Lanse youn oswa aksepte youn yon kolèg voye.') : t('Ton professeur n’a pas encore organisé de défi.', 'Pwofesè ou poko òganize defi.')}</p>}
    {fixtures.map((f) => <article key={f.id} className="classes-assignment" aria-label={f.title}>
      <h3>{f.title}</h3>
      <p>{f.opponent ? `${t('Contre', 'Kont')} ${f.opponent.title}${f.opponent.school ? ` · ${f.opponent.school}` : ''}` : t('Adversaire à confirmer', 'Advèsè pou konfime')}</p>
      <p><span className="classes-badge">{fixturePhaseLabel(f, t)}</span> {aggregateLabel(f.aggregate, f.teamSize, t)} · {f.questionCount} {t('questions', 'kesyon')}</p>
      <p>{haitiTime(f.startsAt, ht)} → {haitiTime(f.endsAt, ht)}</p>
      {f.code && <p>{t('Code à envoyer à l’autre professeur', 'Kòd pou voye bay lòt pwofesè a')} : <strong className="classes-code">{f.code}</strong></p>}
      {(f.phase === 'open' || f.phase === 'final' || f.phase === 'upcoming') && f.state === 'accepted' && <ul className="classes-members">
        <li><span>{t('Ta classe', 'Klas ou')}</span><span>{teamScoreLine(f.mine, f.teamSize, t)}</span></li>
        <li><span>{f.opponent?.title}</span><span>{teamScoreLine(f.theirs, f.teamSize, t)}</span></li></ul>}
      <div className="classes-actions">
        {!detail.teacher && f.tid && (f.phase === 'open' || f.phase === 'upcoming') && !f.joined && <button className="button button--primary" disabled={busy || c.archived} onClick={() => act('fixture-join', { id: c.id, fixtureId: f.id })}>{t('Rejoindre le match', 'Antre nan match la')}</button>}
        {f.tid && (detail.teacher || f.joined) && <Link className="button button--secondary" to={`/tournois/${f.tid}`}>{f.phase === 'final' ? t('Voir le classement', 'Wè klasman an') : t('Ouvrir le match', 'Ouvri match la')}</Link>}
        {f.code && <button className="button button--ghost" disabled={busy} onClick={() => act('fixture-cancel', { id: c.id, fixtureId: f.id })}>{t('Annuler le défi', 'Anile defi a')}</button>}
      </div>
    </article>)}
    {detail.teacher && !c.archived && <>
      {!proposing ? <button className="button button--secondary" disabled={busy} onClick={() => setProposing(true)}>{t('Défier une autre classe', 'Defi yon lòt klas')}</button>
        : <form className="classes-form" onSubmit={async (e) => {
          e.preventDefault();
          if (await act('fixture-propose', { id: c.id, requestId: requestId.current, title: form.title || undefined, categories: form.categories, questionCount: form.questionCount, secondsPerQuestion: form.secondsPerQuestion, windowHours: form.windowHours, teamSize: form.teamSize, aggregate: form.aggregate, startsAt: new Date(form.start).getTime() })) { setProposing(false); requestId.current = operationId(); }
        }}><h3>{t('Nouveau défi', 'Nouvo defi')}</h3>
          <label>{t('Titre (facultatif)', 'Tit (si ou vle)')}<input maxLength={60} value={form.title} onChange={(e) => set({ title: e.target.value })} /></label>
          <fieldset><legend>{t(`Thèmes (jusqu’à ${FIXTURE_LIMITS.categoriesMax})`, `Tèm (jiska ${FIXTURE_LIMITS.categoriesMax})`)}</legend><div role="group" aria-label={t('Thèmes', 'Tèm')} className="classes-actions">
            {cats.map((x) => { const on = form.categories.includes(x.id); return <button type="button" key={x.id} aria-pressed={on} className={`classes-chip${on ? ' is-on' : ''}`} disabled={!on && form.categories.length >= FIXTURE_LIMITS.categoriesMax} onClick={() => set({ categories: on ? form.categories.filter((y) => y !== x.id) : [...form.categories, x.id] })}>{ht ? x.nameHt : x.name}</button>; })}
          </div></fieldset>
          <label>{t('Début (heure de ton appareil)', 'Kòmansman (lè aparèy ou)')}<input required type="datetime-local" value={form.start} onChange={(e) => set({ start: e.target.value })} /></label>
          <label>{t('Durée de la fenêtre', 'Dire fenèt la')}<select value={form.windowHours} onChange={(e) => set({ windowHours: Number(e.target.value) })}>{FIXTURE_LIMITS.windowHours.map((h) => <option key={h} value={h}>{h < 24 ? `${h} h` : t(`${h / 24} jour(s)`, `${h / 24} jou`)}</option>)}</select></label>
          <label>{t('Questions', 'Kesyon')}<select value={form.questionCount} onChange={(e) => set({ questionCount: Number(e.target.value) })}>{FIXTURE_LIMITS.questionCounts.map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
          <label>{t('Secondes par question', 'Segonn pou chak kesyon')}<select value={form.secondsPerQuestion} onChange={(e) => set({ secondsPerQuestion: Number(e.target.value) })}>{FIXTURE_LIMITS.seconds.map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
          <label>{t('Joueurs comptés par classe', 'Jwè ki konte pou chak klas')}<select value={form.teamSize} onChange={(e) => set({ teamSize: Number(e.target.value) })}>{FIXTURE_LIMITS.teamSizes.map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
          <div role="radiogroup" aria-label={t('Score de la classe', 'Nòt klas la')} className="classes-actions">{(['average', 'sum'] as const).map((a) => <button type="button" key={a} role="radio" aria-checked={form.aggregate === a} className={`classes-chip${form.aggregate === a ? ' is-on' : ''}`} onClick={() => set({ aggregate: a })}>{aggregateLabel(a, form.teamSize, t)}</button>)}</div>
          <p className="text-muted">{aggregateHelp(form.aggregate, t)}</p>
          <div className="classes-actions"><button className="button button--primary" disabled={busy || !form.categories.length}>{t('Créer le défi', 'Kreye defi a')}</button><button type="button" className="button button--ghost" onClick={() => setProposing(false)}>{t('Annuler', 'Anile')}</button></div>
        </form>}
      <form className="classes-form" onSubmit={(e) => { e.preventDefault(); void look(); }}><h3>{t('Accepter le défi d’un collègue', 'Aksepte defi yon kolèg')}</h3>
        <label>{t('Code du défi', 'Kòd defi a')}<input required minLength={6} maxLength={6} autoCapitalize="characters" value={code} onChange={(e) => { setCode(e.target.value.toUpperCase()); setPreview(null); }} /></label>
        <button className="button button--secondary" disabled={busy || code.length !== 6}>{t('Voir le défi', 'Wè defi a')}</button>
        {previewError != null && <p role="alert">{classErrorMessage(previewError, ht ? 'ht' : 'fr')}</p>}
        {preview && <div role="status"><p><strong>{preview.title}</strong> · {preview.home.title} · {preview.home.school}</p>
          <p>{haitiTime(preview.startsAt, ht)} · {preview.windowHours} h · {aggregateLabel(preview.aggregate, preview.teamSize, t)} · {preview.questionCount} {t('questions', 'kesyon')}</p>
          <div className="classes-actions"><button type="button" className="button button--primary" disabled={busy} onClick={async () => { if (await act('fixture-accept', { id: c.id, code })) { setCode(''); setPreview(null); } }}>{t(`Accepter pour ${c.title}`, `Aksepte pou ${c.title}`)}</button>
            <button type="button" className="button button--ghost" disabled={busy} onClick={async () => { if (await act('fixture-decline', { code })) { setCode(''); setPreview(null); } }}>{t('Refuser', 'Refize')}</button></div></div>}
      </form>
    </>}
  </div>;
}

export function ClassAnalyticsPanel({ detail, t, ht, request }: { detail: ClassDetail; t: Tr; ht: boolean; request: Request }) {
  const id = detail.classroom.id;
  const [courseId, setCourseId] = useState<string | undefined>(undefined);
  const [state, setState] = useState<{ data?: ClassAnalytics; error?: unknown; loading: boolean }>({ loading: true });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    setState((s) => ({ data: s.data, loading: true }));
    request<ClassAnalytics>('analytics', { id, ...(courseId ? { courseId } : {}) })
      .then((data) => { if (live) setState({ data, loading: false }); })
      .catch((error) => { if (live) setState({ error, loading: false }); });
    return () => { live = false; };
  }, [id, courseId, version, request]);
  const a = state.data;
  const chapterTitle = (cid: string) => a?.chapters.find((ch) => ch.id === cid)?.title || cid;
  return <div className="card" aria-busy={state.loading}><h2>{t('Suivi de la maîtrise', 'Swivi metriz')}</h2>
    <p className="text-muted">{t('Niveaux par chapitre, calculés à partir de la pratique des élèves. Aucune réponse n’est visible.', 'Nivo pou chak chapit, kalkile apati pratik elèv yo. Ou pa wè okenn repons.')}</p>
    {state.loading && !a && <p role="status">{t('Chargement…', 'Ap chaje…')}</p>}
    {state.error != null && <div role="alert"><p>{classErrorMessage(state.error, ht ? 'ht' : 'fr')}</p><button className="button button--secondary" onClick={() => setVersion((v) => v + 1)}>{t('Réessayer', 'Eseye ankò')}</button></div>}
    {a && <>
      <label className="classes-inline">{t('Cours', 'Kou')}<select value={a.courseId || ''} onChange={(e) => setCourseId(e.target.value)}>{a.courses.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      <p>{t(`${a.shared} élève(s) inclus`, `${a.shared} elèv ladan`)}{a.notShared > 0 && ` · ${t(`${a.notShared} n’ont pas encore accepté le partage`, `${a.notShared} poko aksepte pataj la`)}`}</p>
      {a.weakest.length > 0 && <><h3>{t('Chapitres à retravailler', 'Chapit pou travay ankò')}</h3><ol>{a.weakest.map((cid) => <li key={cid}>{chapterTitle(cid)}</li>)}</ol></>}
      <h3>{t('Répartition par chapitre', 'Repatisyon pa chapit')}</h3>
      {a.shared === 0 ? <p>{t('Aucune donnée partagée pour l’instant.', 'Poko gen done pataje.')}</p> : a.chapters.map((ch) => <details key={ch.id} className="classes-chapter"><summary><strong>{ch.title}</strong> · {ch.avgPoints}/100</summary>
        <div className="classes-bar" aria-hidden="true">{LEVELS.map((l) => ch.percent[l] > 0 && <span key={l} style={{ width: `${ch.percent[l]}%`, background: LEVEL_HEX[l] }} />)}</div>
        <p>{LEVELS.filter((l) => ch.counts[l]).map((l) => `${levelLabel(l, ht)} ${ch.counts[l]} (${ch.percent[l]} %)`).join(' · ')}</p>
        <ul className="classes-members">{ch.lessonRows.map((l) => <li key={l.id}><span>{l.title}</span><span>{LEVELS.filter((x) => l.counts[x]).map((x) => `${levelLabel(x, ht)} ${l.counts[x]}`).join(' · ')}</span></li>)}</ul>
      </details>)}
      {a.students.length > 0 && <><h3>{t('Par élève', 'Pa elèv')}</h3><div className="classes-scroll"><table className="classes-table"><thead><tr><th scope="col">{t('Élève', 'Elèv')}</th><th scope="col">{t('Points', 'Pwen')}</th>{a.chapters.map((ch) => <th scope="col" key={ch.id}>{ch.title}</th>)}</tr></thead>
        <tbody>{a.students.map((s) => <tr key={s.uid}><th scope="row">{s.name}</th><td>{s.points}</td>{a.chapters.map((ch) => <td key={ch.id}>{levelLabel(s.levels[ch.id] || 'none', ht)}</td>)}</tr>)}</tbody></table></div></>}
      <h3>{t('Devoirs', 'Devwa yo')}</h3>
      {!a.assignments.length ? <p>{t('Aucun devoir publié.', 'Pa gen devwa pibliye.')}</p> : <ul className="classes-members">{a.assignments.map((x) => <li key={x.id}><span>{x.title}</span><span>{x.completed} {t('terminés', 'fini')} ({x.rate} %) · {x.onTime} {t('à l’heure', 'alè')} · {x.late} {t('en retard', 'anreta')}</span></li>)}</ul>}
    </>}
  </div>;
}
