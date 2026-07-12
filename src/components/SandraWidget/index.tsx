import React, { Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageCircle, X } from 'lucide-react';
import { lazyWithRetry } from '../../utils/lazyWithRetry';
import './SandraWidget.css';

// The chat panel (message list, composer, network logic) is only needed once
// the student actually opens Sandra — keep it out of the initial shell bundle.
const SandraPanel = lazyWithRetry(() => import('./SandraPanel'));

/**
 * Sandra — the floating student assistant, mounted once in `Layout`.
 *
 * Renders the always-present launcher pill (bottom-right, lifted above the
 * mobile bottom tab bar) and lazily mounts the chat panel on first open. The
 * panel stays mounted after that so the conversation survives open/close
 * toggles while navigating the app.
 */
export function SandraWidget() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);

  const toggle = () => {
    setOpen((v) => !v);
    setEverOpened(true);
  };

  return (
    <>
      {everOpened && (
        <Suspense fallback={null}>
          <SandraPanel open={open} onClose={() => setOpen(false)} />
        </Suspense>
      )}
      <button
        type="button"
        className={`sandra-launcher ${open ? 'is-open' : ''}`}
        aria-label={open ? t('common.close') : t('sandra.open')}
        aria-expanded={open}
        onClick={toggle}
      >
        {open ? (
          <X size={22} strokeWidth={2.4} aria-hidden="true" />
        ) : (
          <MessageCircle size={22} strokeWidth={2.4} aria-hidden="true" />
        )}
        <span className="sandra-launcher__label">Sandra</span>
      </button>
    </>
  );
}

export default SandraWidget;
