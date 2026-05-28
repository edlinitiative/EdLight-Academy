import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import useStore from '../contexts/store';
// With Firebase-based Google sign-in we no longer need this callback route.
// Keep a friendly message and redirect home.

export default function AuthCallback() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const setUser = useStore(s => s.setUser);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => navigate('/', { replace: true }), 500);
    return () => clearTimeout(t);
  }, [navigate]);

  return (
    <div className="container" style={{ padding: '2rem 1rem' }}>
      <h2>Signing you in…</h2>
      {!error && <p>Redirecting…</p>}
      {error && (
        <div className="form-message form-message--error" style={{ marginTop: '1rem' }}>
          {error}
        </div>
      )}
    </div>
  );
}
