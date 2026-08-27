import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import ProtectedRoute from '@/components/ProtectedRoute';
import { restoreSession } from '@/lib/auth';
import { useAuthStore } from '@/store/authStore';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import Editor from '@/pages/Editor';
import SharedView from '@/pages/SharedView';
import NotFound from '@/pages/NotFound';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

export default function App() {
  const setRestoring = useAuthStore((s) => s.setRestoring);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      // Without a client ID there is no session to restore; don't hang the UI.
      setRestoring(false);
      return;
    }
    void restoreSession();
  }, [setRestoring]);

  if (!GOOGLE_CLIENT_ID) {
    return (
      <div className="flex min-h-full items-center justify-center px-6">
        <div className="card max-w-md px-6 py-8 text-center">
          <h1 className="text-base font-semibold">Configuration required</h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            Set <code>VITE_GOOGLE_CLIENT_ID</code> in your .env file and restart the dev server.
          </p>
        </div>
      </div>
    );
  }

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/s/:token" element={<SharedView />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/p/:projectId"
            element={
              <ProtectedRoute>
                <Editor />
              </ProtectedRoute>
            }
          />
          <Route path="/index.html" element={<Navigate to="/" replace />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </GoogleOAuthProvider>
  );
}
