import type { ReactElement } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { Logo } from '@/components/Logo';

interface Props {
  children: ReactElement;
}

/**
 * Holds the route while the silent refresh on mount is still in flight, so a
 * logged-in user reloading the page is never bounced to /login mid-restore.
 */
export default function ProtectedRoute({ children }: Props) {
  const user = useAuthStore((s) => s.user);
  const isRestoring = useAuthStore((s) => s.isRestoring);
  const location = useLocation();

  if (isRestoring) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3" role="status" aria-live="polite">
        <Logo size={24} />
        <span
          className="h-5 w-5 animate-spin rounded-full border-2 border-transparent"
          style={{ borderTopColor: 'var(--accent)', borderRightColor: 'var(--accent)' }}
        />
        <span className="sr-only">Restoring your session</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}
