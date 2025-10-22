import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import useStore from '../contexts/store';
import { exchangeCodeForTokens, decodeJwt } from '../services/googleOAuth';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const setUser = useStore(s => s.setUser);
  const [error, setError] = useState('');

  useEffect(() => {
    async function run() {
      try {
        const returnedState = params.get('state');
        const expectedState = sessionStorage.getItem('google_oauth_state');
        if (!returnedState || !expectedState || returnedState !== expectedState) {
          throw new Error('Invalid OAuth state. Please try signing in again.');
        }
        const code = params.get('code');
        if (!code) throw new Error('Missing authorization code');

        const tokens = await exchangeCodeForTokens(code);
        const payload = decodeJwt(tokens.id_token);
        if (!payload) throw new Error('Failed to decode ID token');

        const profile = {
          name: payload.name || 'Student',
          email: payload.email || '',
          picture: payload.picture || '',
        };
        setUser(profile);

        // Cleanup
        sessionStorage.removeItem('google_oauth_verifier');
        sessionStorage.removeItem('google_oauth_state');

        navigate('/', { replace: true });
      } catch (e) {
        setError(e.message);
      }
    }
    run();
  }, [navigate, params, setUser]);

  return (
    <div className="container" style={{ padding: '2rem 1rem' }}>
      <h2>Signing you in…</h2>
      {!error && <p>Please wait, completing sign-in with Google.</p>}
      {error && (
        <div className="form-message form-message--error" style={{ marginTop: '1rem' }}>
          {error}
        </div>
      )}
    </div>
  );
}
