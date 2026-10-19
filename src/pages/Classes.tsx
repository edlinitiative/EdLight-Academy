import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import useStore from '../contexts/store';
import { classRequest } from '../services/classService';
import { createUseClasses } from '../../shared/useClasses';
import { CLASS_PRIVACY, classErrorMessage } from '../../shared/classes';
import { operationId } from '../../shared/competition/client';
import './Classes.css';
const useClasses = createUseClasses(React);

export default function Classes() {
  const user = useStore((s) => s.user), language = useStore((s) => s.language);
  const uid = user?.uid, t = (fr: string, ht: string) => language === 'ht' ? ht : fr;
  const { home, detail, loading, busy, error, load, act, selectedId } = useClasses(uid, classRequest);
  const [code, setCode] = useState(''), [consent, setConsent] = useState(false);
  const [title, setTitle] = useState(''), [school, setSchool] = useState(''), [grade, setGrade] = useState('');
  const [examId, setExamId] = useState(''), [due, setDue] = useState('');
  const [catalog, setCatalog] = useState<any[]>([]), [catalogError, setCatalogError] = useState(false);
  const [catalogVersion, setCatalogVersion] = useState(0);
  const createId = useRef(operationId()), assignmentId = useRef(operationId());
  useEffect(() => { setCode(''); setConsent(false); setTitle(''); setSchool(''); setGrade(''); setExamId(''); setDue(''); createId.current = operationId(); assignmentId.current = operationId(); }, [uid]);
  useEffect(() => {
    if (!detail?.teacher) return;
    const controller = new AbortController();
    setCatalogError(false);
    fetch('/exam_catalog_index.json', { signal: controller.signal }).then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((rows) => setCatalog(Array.isArray(rows) ? rows : Object.values(rows).flat()))
      .catch(() => { if (!controller.signal.aborted) setCatalogError(true); });
    return () => controller.abort();
  }, [detail?.teacher, catalogVersion]);
  if (!uid) return <section className="section classes-page"><h1>{t('Mes classes', 'Klas mwen yo')}</h1><p>{t('Connecte-toi pour rejoindre ta classe.', 'Konekte pou antre nan klas ou.')}</p><button className="btn btn-primary" onClick={() => useStore.getState().setShowAuthModal(true)}>{t('Se connecter', 'Konekte')}</button></section>;
  const c = detail?.classroom;
  return <section className="section classes-page">
    <header><p className="text-muted">{t('Apprendre ensemble · Pilote', 'Aprann ansanm · Pilòt')}</p><h1>{c?.title || t('Mes classes', 'Klas mwen yo')}</h1><p>{c ? `${c.school} · ${c.grade}` : t('Des devoirs et un tableau privé, avec ton professeur.', 'Devwa ak yon tablo prive, ansanm ak pwofesè ou.')}</p></header>
    {error != null && <div role="alert" className="card"><p>{classErrorMessage(error, language)}</p><button className="btn btn-secondary" disabled={busy || loading} onClick={() => load(selectedId)}>{t('Réessayer', 'Eseye ankò')}</button></div>}
    {loading && <p role="status">{t('Chargement…', 'Ap chaje…')}</p>}
    {c ? <>
      <button className="btn btn-secondary" disabled={busy} onClick={() => load()}>{t('Toutes mes classes', 'Tout klas mwen yo')}</button>
      {c.archived && <p role="status">{t('Classe archivée', 'Klas achive')}</p>}
      {detail.teacher && !c.archived && <div className="card"><h2>{t('Inviter la classe', 'Envite klas la')}</h2><p>{t('Code à transmettre aux élèves', 'Kòd pou bay elèv yo')} : <strong className="classes-code">{c.code}</strong></p><p>{t('Chaque demande nécessite ton approbation.', 'Ou dwe apwouve chak demann.')}</p>
        <h3>{t('Demandes', 'Demann yo')}</h3>{detail.pending.length === 0 && <p>{t('Aucune demande en attente.', 'Pa gen demann k ap tann.')}</p>}
        {detail.pending.map((m) => <div className="classes-row" key={m.uid}><span>{m.name}</span><button disabled={busy || c.archived} onClick={() => act('approve', { id: c.id, studentUid: m.uid })}>{t('Approuver', 'Apwouve')}</button><button disabled={busy || c.archived} onClick={() => act('reject', { id: c.id, studentUid: m.uid })}>{t('Refuser', 'Refize')}</button></div>)}
      </div>}
      <div className="card"><h2>{t('Devoirs', 'Devwa yo')}</h2><p className="text-muted">{t('Les résultats servent à la pratique, pas à une note officielle. Après avoir enregistré ton examen, confirme-le ici.', 'Rezilta yo se pou pratik, yo pa nòt ofisyèl. Lè ou fin anrejistre egzamen ou, konfime li isit la.')}</p>
        {!c.assignments.length && <p>{t('Aucun devoir publié.', 'Pa gen devwa pibliye.')}</p>}
        {c.assignments.map((a) => <article key={a.id} className="classes-assignment"><h3>{a.title}</h3><p>{t('À rendre', 'Pou remèt')} : {new Date(a.dueAt).toLocaleString(language === 'ht' ? 'fr-HT' : 'fr-FR', { timeZone: 'America/Port-au-Prince' })} · {t('Heure d’Haïti', 'Lè Ayiti')}</p><p>{detail.completionCounts[a.id] || 0}/{detail.members.length} {t('terminés', 'fini')}</p>
          <Link className="btn btn-secondary" to={`/exams/${a.level}/${a.examId}`}>{t('Ouvrir l’examen', 'Ouvri egzamen an')}</Link>{!detail.teacher && <button className="btn btn-primary" disabled={busy || c.archived || detail.completed.includes(a.id)} onClick={() => act('complete', { id: c.id, assignmentId: a.id })}>{detail.completed.includes(a.id) ? t('Terminé', 'Fini') : t('Confirmer mon examen enregistré', 'Konfime egzamen mwen anrejistre a')}</button>}
          {detail.teacher && <ul className="classes-members">{detail.members.map((m) => { const score = detail.scores?.[m.uid]?.[a.id]; return <li key={m.uid}><span>{m.name}</span><span>{!score ? t('À faire', 'Pou fè') : `${t('Terminé', 'Fini')} · ${score.objectiveScore == null ? t('Sans note objective', 'San nòt objektif') : `${score.objectiveScore}%`} ${score.late ? t('(en retard)', '(anreta)') : ''}`}</span></li>; })}</ul>}
        </article>)}
        {detail.teacher && <p className="text-muted">{t('Les pourcentages portent uniquement sur les questions objectives. Les rédactions ne sont pas incluses.', 'Pousantaj yo konsène sèlman kesyon objektif yo. Redaksyon yo pa ladan yo.')}</p>}
        {detail.teacher && !c.archived && <form className="classes-form" onSubmit={async (e) => {
          e.preventDefault(); const exam = catalog.find((r) => r.exam_id === examId); if (!exam) return;
          const raw = String(exam.level || '').toLowerCase();
          const level = /9|neuvi/.test(raw) ? '9e' : /univers/.test(raw) ? 'university' : 'terminale';
          if (await act('assign', { id: c.id, requestId: assignmentId.current, title: `${exam.subject || ''} · ${exam.year || ''} · ${exam.exam_title || exam.title || examId}`.slice(0, 100), examId, level, dueAt: new Date(due).getTime() })) { assignmentId.current = operationId(); setExamId(''); setDue(''); }
        }}><h3>{t('Publier un devoir', 'Pibliye yon devwa')}</h3>
          {catalogError && <div role="alert"><p>{t('Catalogue indisponible.', 'Katalòg la pa disponib.')}</p><button type="button" onClick={() => setCatalogVersion((n) => n + 1)}>{t('Réessayer', 'Eseye ankò')}</button></div>}
          <label>{t('Examen', 'Egzamen')}<select required value={examId} onChange={(e) => { setExamId(e.target.value); assignmentId.current = operationId(); }}><option value="">{t('Choisir un examen', 'Chwazi yon egzamen')}</option>{catalog.map((r) => <option key={r.exam_id} value={r.exam_id}>{r.subject} · {r.year} · {r.exam_title || r.title || r.exam_id}</option>)}</select></label>
          <label>{t('Échéance (heure de ton appareil)', 'Dat limit (lè aparèy ou)')}<input required type="datetime-local" value={due} onChange={(e) => { setDue(e.target.value); assignmentId.current = operationId(); }} /></label><button className="btn btn-primary" disabled={busy || !examId}>{t('Publier', 'Pibliye')}</button>
        </form>}
      </div>
      <div className="card"><h2>{t('Tableau de la semaine', 'Tablo semèn nan')}</h2><p>{t('Semaine du', 'Semèn ki kòmanse')} {detail.week} · {t('XP de pratique, sans valeur de compétition', 'XP pratik, li pa konte pou konpetisyon')}</p>
        {!detail.members.length && <p>{t('Les élèves approuvés apparaîtront ici.', 'Elèv ki apwouve yo ap parèt isit la.')}</p>}
        <ul className="classes-members">{detail.members.map((m) => <li key={m.uid}><span>{m.name}</span><span>{m.xp} XP · {m.completed} {t('devoirs cette semaine', 'devwa semèn sa a')}</span>{detail.teacher && !c.archived && <button disabled={busy} onClick={() => { if (window.confirm(t('Retirer cet élève ?', 'Retire elèv sa a?'))) void act('remove', { id: c.id, studentUid: m.uid }); }}>{t('Retirer', 'Retire')}</button>}</li>)}</ul>
      </div>
      {!detail.teacher ? <button className="btn btn-secondary" disabled={busy} onClick={() => { if (window.confirm(t('Quitter cette classe ?', 'Kite klas sa a?'))) void act('leave', { id: c.id }); }}>{t('Quitter la classe', 'Kite klas la')}</button> : !c.archived && <button className="btn btn-secondary" disabled={busy} onClick={() => { if (window.confirm(t('Archiver la classe ? Les devoirs seront fermés.', 'Achive klas la? Devwa yo ap fèmen.'))) void act('archive', { id: c.id }); }}>{t('Archiver', 'Achive')}</button>}
    </> : <>
      <div className="classes-grid">{home?.classes.map((r) => <article className="card" key={r.id}><h2>{r.title}</h2><p>{r.school}</p>{r.pending ? <><p>{r.archived ? t('Classe archivée. Tu peux annuler ta demande.', 'Klas achive. Ou ka anile demann ou.') : t('En attente de validation du professeur.', 'Ap tann apwobasyon pwofesè a.')}</p><button disabled={busy} onClick={() => act('leave', { id: r.id })}>{t('Annuler la demande', 'Anile demann lan')}</button></> : <button className="btn btn-primary" disabled={busy || loading} onClick={() => load(r.id)}>{t('Ouvrir', 'Ouvri')}</button>}</article>)}</div>
      <form className="card classes-form" onSubmit={async (e) => { e.preventDefault(); if (await act('join', { code, consent, name: user?.name || t('Élève', 'Elèv') })) { setCode(''); setConsent(false); } }}><h2>{t('Rejoindre une classe', 'Antre nan yon klas')}</h2><label>{t('Code de 6 caractères', 'Kòd 6 karaktè')}<input required minLength={6} maxLength={6} autoCapitalize="characters" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} /></label><label className="classes-consent"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required /><span>{CLASS_PRIVACY[language === 'ht' ? 'ht' : 'fr']}</span></label><button className="btn btn-primary" disabled={busy || !consent}>{t('Demander à rejoindre', 'Mande pou antre')}</button></form>
      {home?.canTeach && <form className="card classes-form" onSubmit={async (e) => { e.preventDefault(); if (await act('create', { requestId: createId.current, title, school, grade })) { createId.current = operationId(); setTitle(''); setSchool(''); setGrade(''); } }}><h2>{t('Créer une classe', 'Kreye yon klas')}</h2>{[[t('Nom de la classe', 'Non klas la'), title, setTitle], [t('École', 'Lekòl'), school, setSchool], [t('Niveau', 'Nivo'), grade, setGrade]].map(([label, value, setter], i) => <label key={i}>{label as string}<input required maxLength={i === 2 ? 30 : 100} value={value as string} onChange={(e) => { (setter as (v: string) => void)(e.target.value); createId.current = operationId(); }} /></label>)}<button className="btn btn-primary" disabled={busy}>{t('Créer', 'Kreye')}</button></form>}
    </>}
  </section>;
}
