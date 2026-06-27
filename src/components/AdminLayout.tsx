import React from 'react';
import { Outlet, NavLink, Link } from 'react-router-dom';
import { LayoutDashboard, BookOpen, CheckSquare, ArrowLeft, GraduationCap } from 'lucide-react';
import useStore from '../contexts/store';
import { getFirstName } from '../utils/shared';
import './AdminLayout.css';

const ADMIN_NAV = [
  { to: '/admin', end: true, Icon: LayoutDashboard, label: 'Vue d\'ensemble' },
  { to: '/admin/courses', end: false, Icon: BookOpen, label: 'Cours' },
  { to: '/admin/verify', end: false, Icon: CheckSquare, label: 'Vérification' },
];

export default function AdminLayout() {
  const { user } = useStore();
  const displayName = user?.name || getFirstName(user) || user?.email || '';

  return (
    <div className="admin-shell">
      <nav className="admin-nav" aria-label="Navigation administration">
        <div className="admin-nav__brand">
          <GraduationCap size={18} aria-hidden="true" />
          <span className="admin-nav__logo">EdLight</span>
          <span className="admin-nav__badge">Admin</span>
        </div>

        <div className="admin-nav__links">
          {ADMIN_NAV.map(({ to, end, Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `admin-nav__link${isActive ? ' is-active' : ''}`
              }
            >
              <Icon size={15} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </div>

        <div className="admin-nav__right">
          {displayName && (
            <span className="admin-nav__user" title={user?.email ?? ''}>
              {displayName}
            </span>
          )}
          <Link to="/" className="admin-nav__back">
            <ArrowLeft size={14} aria-hidden="true" />
            Retour au site
          </Link>
        </div>
      </nav>

      <main id="admin-content" className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
