import { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { Navigate, useLocation } from 'react-router-dom';
import { signInWithGoogle } from '@/lib/auth';
import { useAuthStore } from '@/store/authStore';

export default function Login() {
  const user = useAuthStore((s) => s.user);
  const isRestoring = useAuthStore((s) => s.isRestoring);
  const [error, setError] = useState<string | null>(null);
  const location = useLocation() as { state?: { from?: string } };

  if (user) return <Navigate to={location.state?.from ?? '/'} replace />;

  return (
    <div className="flex min-h-full items-center justify-center px-6">
      <div className="card w-full max-w-sm px-8 py-10 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Canvasly</h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
          An infinite canvas for projects, notes, and diagrams.
        </p>

        <div className="mt-8 flex justify-center" data-testid="signin-slot">
          {isRestoring ? (
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Checking your session…
            </span>
          ) : (
            <GoogleLogin
              onSuccess={(response) => {
                setError(null);
                if (!response.credential) {
                  setError('Google did not return a credential. Please try again.');
                  return;
                }
                void signInWithGoogle(response.credential).catch(() => {
                  setError('Sign-in failed. Please try again.');
                });
              }}
              onError={() => setError('Sign-in was cancelled or blocked.')}
            />
          )}
        </div>

        {error && (
          <p className="mt-4 text-sm" style={{ color: 'var(--danger)' }} role="alert">
            {error}
          </p>
        )}

        <p className="mt-6 text-xs" style={{ color: 'var(--text-muted)' }}>
          Use your university Google account.
        </p>
      </div>
    </div>
  );
}
