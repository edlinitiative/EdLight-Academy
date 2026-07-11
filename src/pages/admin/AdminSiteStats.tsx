import React, { useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import useStore from '../../contexts/store';
import { db } from '../../services/firebase';
import { useSiteStats } from '../../hooks/useSiteStats';

/**
 * AdminSiteStats — edit the public site statistics.
 *
 * The public About page reads its numbers from the Firestore doc
 * `siteStats/public`. Three of those fields are editorial/manual —
 * `active_students_term`, `exams`, `mastery_rate_percent` — and are edited here.
 * Content counts (courses/videos/quizzes) are computed live and shown read-only.
 * Renders inside the admin sidebar layout via <Outlet>.
 */

type EditableField = 'active_students_term' | 'exams' | 'mastery_rate_percent';

const FIELD_ORDER: EditableField[] = ['active_students_term', 'exams', 'mastery_rate_percent'];

type FormState = Record<EditableField, string>;

const EMPTY_FORM: FormState = {
  active_students_term: '',
  exams: '',
  mastery_rate_percent: '',
};

export default function AdminSiteStats() {
  const isCreole = useStore((s) => s.language) === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const liveStats = useSiteStats();
  const counts = liveStats.data?.counts;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, 'siteStats', 'public'));
        const data = snap.exists() ? snap.data() : {};
        if (cancelled) return;
        setForm({
          active_students_term:
            data.active_students_term != null ? String(data.active_students_term) : '',
          exams: data.exams != null ? String(data.exams) : '',
          mastery_rate_percent:
            data.mastery_rate_percent != null ? String(data.mastery_rate_percent) : '',
        });
      } catch (err) {
        console.error('[AdminSiteStats] Failed to load siteStats/public:', err);
        if (!cancelled) {
          setMessage({
            type: 'error',
            text: t('Échec du chargement des statistiques.', 'Chajman estatistik yo echwe.'),
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleChange(field: EditableField, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    setMessage(null);

    // Guard non-numeric input: build a payload of valid numbers only.
    const payload: Partial<Record<EditableField, number>> = {};
    for (const field of FIELD_ORDER) {
      const raw = form[field].trim();
      if (raw === '') continue; // leave unchanged / unset
      const num = Number(raw);
      if (!Number.isFinite(num) || num < 0) {
        setMessage({
          type: 'error',
          text: t(
            'Valeurs invalides : saisissez des nombres positifs.',
            'Valè pa bon : mete chif pozitif.',
          ),
        });
        return;
      }
      payload[field] = num;
    }

    setSaving(true);
    try {
      await setDoc(doc(db, 'siteStats', 'public'), payload, { merge: true });
      setMessage({
        type: 'success',
        text: t('Statistiques enregistrées.', 'Estatistik yo anrejistre.'),
      });
    } catch (err) {
      console.error('[AdminSiteStats] Failed to save siteStats/public:', err);
      setMessage({
        type: 'error',
        text: t("Échec de l'enregistrement.", 'Anrejistreman an echwe.'),
      });
    } finally {
      setSaving(false);
    }
  }

  const FIELDS: Array<{ field: EditableField; label: string; helper: string }> = [
    {
      field: 'active_students_term',
      label: t('Élèves actifs (ce trimestre)', 'Elèv aktif (trimès sa a)'),
      helper: t(
        "Nombre d'élèves actifs affiché sur la page À propos.",
        'Kantite elèv aktif ki parèt sou paj Apwopo a.',
      ),
    },
    {
      field: 'exams',
      label: t('Examens officiels', 'Egzamen ofisyèl'),
      helper: t(
        "Nombre d'examens officiels disponibles.",
        'Kantite egzamen ofisyèl ki disponib.',
      ),
    },
    {
      field: 'mastery_rate_percent',
      label: t('Taux de maîtrise (%)', 'To metriz (%)'),
      helper: t(
        'Pourcentage de maîtrise affiché comme indicateur de réussite.',
        'Pousantaj metriz ki montre kòm endikatè siksè.',
      ),
    },
  ];

  return (
    <div>
      <div className="admin-page__head">
        <div className="admin-page__eyebrow">
          <BarChart3 size={13} aria-hidden="true" />
          {t('DONNÉES', 'DONE')}
        </div>
        <h1 className="admin-page__title">{t('Statistiques du site', 'Estatistik sit la')}</h1>
        <p className="admin-page__subtitle">
          {t(
            'Ces chiffres alimentent la page publique « À propos ».',
            'Chif sa yo alimante paj piblik « Apwopo » a.',
          )}
        </p>
      </div>

      {message && (
        <div
          className="admin-card"
          style={{
            padding: '12px 16px',
            marginBottom: 16,
            color: message.type === 'error' ? '#c93434' : undefined,
          }}
        >
          {message.text}
        </div>
      )}

      <div className="admin-card" style={{ padding: 20, maxWidth: 560 }}>
        {loading ? (
          <div className="admin-empty">{t('Chargement…', 'N ap chaje…')}</div>
        ) : (
          <>
            {FIELDS.map(({ field, label, helper }) => (
              <div key={field} style={{ marginBottom: 18 }}>
                <label
                  htmlFor={`stat-${field}`}
                  style={{ display: 'block', fontWeight: 650, fontSize: 14, marginBottom: 4 }}
                >
                  {label}
                </label>
                <input
                  id={`stat-${field}`}
                  className="admin-input"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={form[field]}
                  onChange={(e) => handleChange(field, e.target.value)}
                  disabled={saving}
                />
                <p
                  className="admin-page__subtitle"
                  style={{ fontSize: 12, marginTop: 5 }}
                >
                  {helper}
                </p>
              </div>
            ))}

            <button
              type="button"
              className="admin-btn"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? t('Enregistrement…', 'N ap anrejistre…') : t('Enregistrer', 'Anrejistre')}
            </button>
          </>
        )}
      </div>

      <p className="admin-page__subtitle" style={{ marginTop: 16 }}>
        {t(
          'Les contenus (cours, vidéos, quiz) sont comptés automatiquement et ne sont pas modifiables ici.',
          'Kontni yo (kou, videyo, quiz) konte otomatikman epi yo pa modifyab isit la.',
        )}
      </p>

      {counts && (
        <div className="admin-tiles" style={{ marginTop: 12 }}>
          <div className="admin-card admin-tile">
            <div className="admin-tile__label">{t('Cours', 'Kou')}</div>
            <div className="admin-tile__value">{counts.courses ?? '—'}</div>
          </div>
          <div className="admin-card admin-tile">
            <div className="admin-tile__label">{t('Vidéos', 'Videyo')}</div>
            <div className="admin-tile__value">{counts.videos ?? '—'}</div>
          </div>
          <div className="admin-card admin-tile">
            <div className="admin-tile__label">{t('Quiz', 'Quiz')}</div>
            <div className="admin-tile__value">{counts.quizzes ?? '—'}</div>
          </div>
        </div>
      )}
    </div>
  );
}
