import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import useStore from '../contexts/store';

/**
 * Route guard for admin-only pages.
 * Checks Firebase auth + Firestore user doc for role === 'admin'.
 *
 * Firebase is imported DYNAMICALLY inside the effect so this guard — which is
 * referenced eagerly from App.tsx — does not pull the ~600 KB SDK into the
 * initial bundle. The check only runs for authenticated users on admin routes.
 */
export default function AdminRoute({ children }) {
  const { isAuthenticated, authConfirmed, user } = useStore();
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    // Wait for Firebase to confirm auth before running the Firestore role check.
    if (!authConfirmed) return;
    if (!isAuthenticated || !user?.uid) {
      setChecking(false);
      return;
    }

    let cancelled = false;
    const checkAdmin = async () => {
      try {
        const [{ db }, { doc, getDoc }] = await Promise.all([
          import('../services/firebase'),
          import('firebase/firestore'),
        ]);
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (!cancelled && userDoc.exists() && userDoc.data().role === 'admin') {
          setIsAdmin(true);
        }
      } catch (err) {
        console.error('Admin check failed:', err);
      } finally {
        if (!cancelled) setChecking(false);
      }
    };

    checkAdmin();
    return () => {
      cancelled = true;
    };
  }, [authConfirmed, isAuthenticated, user?.uid]);

  if (checking) {
    return (
      <div className="container" style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
        <div className="loading-spinner" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  if (!isAdmin) {
    return (
      <div className="container" style={{ padding: '4rem 1rem', textAlign: 'center' }}>
        <h2>Access Denied</h2>
        <p className="text-muted" style={{ marginTop: '0.5rem' }}>
          You don't have permission to view this page.
        </p>
      </div>
    );
  }

  return children;
}
