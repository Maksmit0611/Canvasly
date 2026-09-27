import { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { signInWithGoogle } from '@/lib/auth';
import { useAuthStore } from '@/store/authStore';

export default function Login(): React.JSX.Element {
  const user = useAuthStore((s) => s.user);
  const isRestoring = useAuthStore((s) => s.isRestoring);
  const [error, setError] = useState<string | null>(null);
  const location = useLocation() as { state?: { from?: string } };
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

  if (user) return <Navigate to={location.state?.from ?? '/boards'} replace />;

  return (
    <div className="landing-grid flex min-h-full flex-col items-center justify-center px-6">
      <Link
        to="/"
        className="btn btn-ghost absolute left-6 top-5"
        style={{ background: 'var(--surface-raised)' }}
      >
        <ArrowLeft size={15} />
        Back to home
      </Link>

      <div className="card relative z-10 w-full max-w-sm px-8 py-10 text-center">
        <div className="flex justify-center">
          <Logo size={30} />
        </div>
        <p className="mt-3 text-sm" style={{ color: 'var(--text-muted)' }}>
          An infinite canvas for projects, notes, and diagrams.
        </p>

        <div className="mt-8 flex justify-center" data-testid="signin-slot">
          {isRestoring ? (
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Checking your session…
            </span>
          ) : googleClientId ? (
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
          ) : (
            <p className="max-w-[16rem] text-sm" style={{ color: 'var(--text-muted)' }} role="status">
              Sign-in isn’t configured on this deployment yet. Add the{' '}
              <code>VITE_GOOGLE_CLIENT_ID</code> environment variable to enable Google sign-in.
            </p>
          )}
        </div>

        {error && (
          <p className="mt-4 text-sm" style={{ color: 'var(--danger)' }} role="alert">
            {error}
          </p>
        )}

        <p className="mt-6 text-xs" style={{ color: 'var(--text-muted)' }}>
          Use your Google account.
        </p>
      </div>
    </div>
  );
}
