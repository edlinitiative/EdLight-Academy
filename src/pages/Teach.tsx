import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { GraduationCap, MessageCircle, Video, CheckCircle2 } from 'lucide-react';
import useStore from '../contexts/store';
import { HAITI_DEPARTMENTS } from '../data/haitiGeo';
import './Teach.css';

// Option values are stable keys (stored in Firestore); labels are bilingual.
const SUBJECTS = [
  { value: 'math', fr: 'Mathématiques', ht: 'Matematik' },
  { value: 'physics', fr: 'Physique', ht: 'Fizik' },
  { value: 'chemistry', fr: 'Chimie', ht: 'Chimi' },
  { value: 'economics', fr: 'Économie', ht: 'Ekonomi' },
  { value: 'other', fr: 'Autre matière', ht: 'Lòt matyè' },
];

const LEVELS = [
  { value: '9af', fr: '9e AF', ht: '9e AF' },
  { value: 'ns1', fr: 'NS I', ht: 'NS I' },
  { value: 'ns2', fr: 'NS II', ht: 'NS II' },
  { value: 'ns3', fr: 'NS III', ht: 'NS III' },
  { value: 'ns4', fr: 'NS IV (Bac)', ht: 'NS IV (Bak)' },
];

const EXPERIENCE = [
  { value: '0-2', fr: '0 à 2 ans', ht: '0 a 2 ane' },
  { value: '3-5', fr: '3 à 5 ans', ht: '3 a 5 ane' },
  { value: '6-10', fr: '6 à 10 ans', ht: '6 a 10 ane' },
  { value: '10+', fr: 'Plus de 10 ans', ht: 'Plis pase 10 ane' },
];

type Status = 'idle' | 'sending' | 'sent' | 'error';

export default function Teach() {
  const language = useStore((s) => s.language);
  const ht = language === 'ht';
  const L = (fr: string, kr: string) => (ht ? kr : fr);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [subjects, setSubjects] = useState<string[]>([]);
  const [levels, setLevels] = useState<string[]>([]);
  const [experience, setExperience] = useState('');
  const [school, setSchool] = useState('');
  const [department, setDepartment] = useState('');
  const [motivation, setMotivation] = useState('');
  const [website, setWebsite] = useState(''); // honeypot — humans never see it
  const [status, setStatus] = useState<Status>('idle');

  const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const canSubmit =
    name.trim() && email.trim() && whatsapp.trim() && school.trim() &&
    subjects.length > 0 && levels.length > 0 && experience && status !== 'sending';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus('sending');
    try {
      const res = await fetch('/api/instructor-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, email, whatsapp, subjects, levels, experience,
          school, department, motivation, website,
          lang: ht ? 'ht' : 'fr', source: 'web',
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus('sent');
    } catch {
      setStatus('error');
    }
  };

  if (status === 'sent') {
    return (
      <section className="section">
        <div className="container teach-container">
          <div className="card teach-success" role="status">
            <CheckCircle2 size={44} aria-hidden />
            <h1>{L('Candidature envoyée !', 'Aplikasyon ou an ale !')}</h1>
            <p className="text-muted">
              {L(
                'Merci ! Notre équipe examine chaque candidature et vous contactera sur WhatsApp, généralement sous une à deux semaines.',
                'Mèsi ! Ekip nou an gade chak aplikasyon epi n ap kontakte ou sou WhatsApp, anjeneral nan 1 a 2 semèn.'
              )}
            </p>
            <Link to="/" className="button button--primary">{L('Retour à l’accueil', 'Tounen nan akèy')}</Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="section">
      <div className="container teach-container">
        <div className="page-header teach-hero">
          <div>
            <span className="teach-eyebrow">{L('Bénévolat · Enseignement', 'Benevola · Anseyman')}</span>
            <h1>
              {L('Enseignez à des milliers d’élèves, où que vous soyez.', 'Anseye plizyè milye elèv, kèlkeswa kote ou ye.')}
            </h1>
            <p className="text-muted teach-lede">
              {L(
                'EdLight Academy recrute des enseignants bénévoles pour créer des leçons vidéo et des exercices dans leur matière. Votre salle de classe devient tout le pays — sur le site et sur l’application mobile.',
                'EdLight Academy ap chèche pwofesè volontè pou kreye leson videyo ak egzèsis nan matyè yo. Klas ou a vin tout peyi a — sou sit la ak nan aplikasyon mobil lan.'
              )}
            </p>
          </div>
        </div>

        <ol className="teach-steps" aria-label={L('Comment ça marche', 'Kijan sa mache')}>
          <li className="card card--compact teach-step">
            <GraduationCap aria-hidden />
            <h3>{L('1. Postulez', '1. Aplike')}</h3>
            <p className="text-muted">{L('Dites-nous votre matière, vos niveaux et votre expérience.', 'Di nou matyè ou, nivo ou yo ak eksperyans ou.')}</p>
          </li>
          <li className="card card--compact teach-step">
            <MessageCircle aria-hidden />
            <h3>{L('2. On vous contacte', '2. Nou kontakte ou')}</h3>
            <p className="text-muted">{L('Notre équipe échange avec vous sur WhatsApp pour faire connaissance.', 'Ekip nou an pale ak ou sou WhatsApp pou nou fè konesans.')}</p>
          </li>
          <li className="card card--compact teach-step">
            <Video aria-hidden />
            <h3>{L('3. Vous enseignez', '3. Ou anseye')}</h3>
            <p className="text-muted">{L('Vous créez des leçons et obtenez votre profil d’enseignant sur la plateforme.', 'Ou kreye leson epi ou jwenn pwofil pwofesè ou sou platfòm lan.')}</p>
          </li>
        </ol>

        <form className="card teach-form" onSubmit={handleSubmit}>
          <h2>{L('Formulaire de candidature', 'Fòm aplikasyon')}</h2>

          <div className="contact-form-row">
            <div className="field">
              <label className="label" htmlFor="teach-name">{L('Nom complet', 'Non konplè')} *</label>
              <input id="teach-name" className="input-field" type="text" value={name}
                onChange={(e) => setName(e.target.value)} autoComplete="name" required maxLength={120} />
            </div>
            <div className="field">
              <label className="label" htmlFor="teach-email">Email *</label>
              <input id="teach-email" className="input-field" type="email" value={email}
                onChange={(e) => setEmail(e.target.value)} autoComplete="email" required maxLength={200} />
            </div>
          </div>

          <div className="contact-form-row teach-row-gap">
            <div className="field">
              <label className="label" htmlFor="teach-whatsapp">WhatsApp *</label>
              <input id="teach-whatsapp" className="input-field" type="tel" value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)} placeholder="+509 …"
                autoComplete="tel" required maxLength={40} />
              <span className="field__hint">{L('C’est là que nous vous répondrons.', 'Se la n ap reponn ou.')}</span>
            </div>
            <div className="field">
              <label className="label" htmlFor="teach-school">{L('École actuelle', 'Lekòl kote w ap anseye kounye a')} *</label>
              <input id="teach-school" className="input-field" type="text" value={school}
                onChange={(e) => setSchool(e.target.value)} required maxLength={200}
                placeholder={L('Nom de l’établissement', 'Non etablisman an')} />
            </div>
          </div>

          <fieldset className="field teach-row-gap teach-fieldset">
            <legend className="label">{L('Matières que vous voulez enseigner', 'Matyè ou vle anseye')} *</legend>
            <div className="teach-chips" role="group">
              {SUBJECTS.map((s) => (
                <label key={s.value} className={`teach-chip${subjects.includes(s.value) ? ' teach-chip--on' : ''}`}>
                  <input type="checkbox" checked={subjects.includes(s.value)}
                    onChange={() => toggle(subjects, setSubjects, s.value)} />
                  {ht ? s.ht : s.fr}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="field teach-row-gap teach-fieldset">
            <legend className="label">{L('Niveaux', 'Nivo yo')} *</legend>
            <div className="teach-chips" role="group">
              {LEVELS.map((l) => (
                <label key={l.value} className={`teach-chip${levels.includes(l.value) ? ' teach-chip--on' : ''}`}>
                  <input type="checkbox" checked={levels.includes(l.value)}
                    onChange={() => toggle(levels, setLevels, l.value)} />
                  {ht ? l.ht : l.fr}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="contact-form-row teach-row-gap">
            <div className="field">
              <label className="label" htmlFor="teach-exp">{L('Années d’expérience', 'Ane eksperyans')} *</label>
              <select id="teach-exp" className="input-field" value={experience}
                onChange={(e) => setExperience(e.target.value)} required>
                <option value="" disabled>{L('Choisissez…', 'Chwazi…')}</option>
                {EXPERIENCE.map((x) => (
                  <option key={x.value} value={x.value}>{ht ? x.ht : x.fr}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="teach-dept">{L('Département', 'Depatman')}</label>
              <select id="teach-dept" className="input-field" value={department}
                onChange={(e) => setDepartment(e.target.value)}>
                <option value="">{L('Facultatif', 'Si ou vle')}</option>
                {HAITI_DEPARTMENTS.map((d: { name: string }) => (
                  <option key={d.name} value={d.name}>{d.name}</option>
                ))}
                <option value="diaspora">{L('Diaspora (hors d’Haïti)', 'Dyaspora (andeyò Ayiti)')}</option>
              </select>
            </div>
          </div>

          <div className="field teach-row-gap">
            <label className="label" htmlFor="teach-motivation">{L('Pourquoi voulez-vous enseigner sur EdLight ?', 'Poukisa ou vle anseye sou EdLight ?')}</label>
            <textarea id="teach-motivation" className="input-field" rows={5} value={motivation}
              onChange={(e) => setMotivation(e.target.value)} maxLength={2000}
              placeholder={L('Quelques phrases suffisent.', 'Kèk fraz sifi.')} />
          </div>

          {/* Honeypot: visually hidden from humans, present for bots. */}
          <div className="teach-hp" aria-hidden="true">
            <label htmlFor="teach-website">Website</label>
            <input id="teach-website" type="text" tabIndex={-1} autoComplete="off"
              value={website} onChange={(e) => setWebsite(e.target.value)} />
          </div>

          {status === 'error' && (
            <p className="teach-error" role="alert">
              {L('L’envoi a échoué. Vérifiez votre connexion, puis réessayez.', 'Voye a echwe. Tcheke koneksyon ou, epi eseye ankò.')}
            </p>
          )}

          <div className="quiz-card__controls teach-row-gap">
            <button type="submit" className="button button--primary" disabled={!canSubmit}>
              {status === 'sending' ? L('Envoi…', 'Ap voye…') : L('Envoyer ma candidature', 'Voye aplikasyon mwen')}
            </button>
          </div>
          <p className="field__hint teach-disclaimer">
            {L(
              'Postuler ne garantit pas une place : chaque candidature est examinée par notre équipe. L’enseignement sur EdLight est bénévole.',
              'Aplike pa garanti yon plas : ekip nou an gade chak aplikasyon. Anseye sou EdLight se yon travay volontè.'
            )}
          </p>
        </form>
      </div>
    </section>
  );
}
