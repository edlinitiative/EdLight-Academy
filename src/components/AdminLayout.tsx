import React, { useState } from 'react';
import { Outlet, NavLink, Link } from 'react-router-dom';
import {
  LayoutDashboard, BookOpen, Video, Target, ClipboardList, CheckSquare, Gamepad2,
  Users, ShieldAlert, Database, BarChart3, ArrowLeft, GraduationCap, Menu, X,
} from 'lucide-react';
import useStore from '../contexts/store';
import { getFirstName } from '../utils/shared';
import './AdminLayout.css';

/**
 * Admin console shell — a left sidebar grouping pages under sections, with the
 * page content in an <Outlet>. Collapses to a slide-over on mobile. Styled in
 * the editorial system (Space Grotesk, ink borders, mono labels).
 */
const NAV: Array<{ section?: string; items: Array<{ to: string; end?: boolean; Icon: any; label: string }> }> = [
  {
    items: [{ to: '/admin', end: true, Icon: LayoutDashboard, label: "Vue d'ensemble" }],
  },
  {
    section: 'Contenu',
    items: [
      { to: '/admin/content/courses', Icon: BookOpen, label: 'Cours' },
      { to: '/admin/content/videos', Icon: Video, label: 'Vidéos' },
      { to: '/admin/content/quizzes', Icon: Target, label: 'Quiz' },
      { to: '/admin/content/exams', Icon: ClipboardList, label: 'Examens' },
      { to: '/admin/content/trivia', Icon: Gamepad2, label: 'Trivia' },
      { to: '/admin/content/verify', Icon: CheckSquare, label: 'Vérification' },
    ],
  },
  {
    section: 'Utilisateurs',
    items: [
      { to: '/admin/users', end: true, Icon: Users, label: 'Tous les utilisateurs' },
      { to: '/admin/users/moderation', Icon: ShieldAlert, label: 'Modération' },
    ],
  },
  {
    section: 'Données',
    items: [
      { to: '/admin/data/collections', Icon: Database, label: 'Collections' },
      { to: '/admin/data/stats', Icon: BarChart3, label: 'Statistiques du site' },
    ],
  },
];

export default function AdminLayout() {
  const { user } = useStore();
  const displayName = user?.name || getFirstName(user) || user?.email || '';
  const [open, setOpen] = useState(false);

  return (
    <div className={`admin-shell ${open ? 'is-open' : ''}`}>
      <button
        type="button"
        className="admin-shell__menu-btn"
        aria-label="Ouvrir le menu"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <X size={18} /> : <Menu size={18} />}
      </button>

      <aside className="admin-sidebar" aria-label="Navigation administration">
        <div className="admin-sidebar__brand">
          <span className="admin-sidebar__mark"><GraduationCap size={18} aria-hidden="true" /></span>
          <span className="admin-sidebar__logo">EdLight</span>
          <span className="admin-sidebar__badge">Admin</span>
        </div>

        <nav className="admin-sidebar__nav" onClick={() => setOpen(false)}>
          {NAV.map((group, i) => (
            <div className="admin-sidebar__group" key={group.section || `g${i}`}>
              {group.section && <div className="admin-sidebar__section">{group.section}</div>}
              {group.items.map(({ to, end, Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) => `admin-sidebar__link${isActive ? ' is-active' : ''}`}
                >
                  <Icon size={16} aria-hidden="true" />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="admin-sidebar__foot">
          {displayName && (
            <span className="admin-sidebar__user" title={user?.email ?? ''}>{displayName}</span>
          )}
          <Link to="/" className="admin-sidebar__back">
            <ArrowLeft size={14} aria-hidden="true" /> Retour au site
          </Link>
        </div>
      </aside>

      <div className="admin-scrim" onClick={() => setOpen(false)} aria-hidden="true" />

      <main id="admin-content" className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
