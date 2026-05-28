import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import useStore from '../contexts/store';
import { db } from '../services/firebase';
import { doc, getDoc } from 'firebase/firestore';

/**
 * Route guard for admin-only pages.
 * Checks Firebase auth + Firestore user doc for role === 'admin'.
 */
export default function AdminRoute({ children }) {
  const { isAuthenticated, user } = useStore();
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !user?.uid) {
      setChecking(false);
      return;
    }

    const checkAdmin = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists() && userDoc.data().role === 'admin') {
          setIsAdmin(true);
        }
      } catch (err) {
        console.error('Admin check failed:', err);
      } finally {
        setChecking(false);
      }
    };

    checkAdmin();
  }, [isAuthenticated, user?.uid]);

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
