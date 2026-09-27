import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import ProtectedRoute from '@/components/ProtectedRoute';
import { restoreSession } from '@/lib/auth';
import { useAuthStore } from '@/store/authStore';
import Landing from '@/pages/Landing';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import Editor from '@/pages/Editor';
import SharedView from '@/pages/SharedView';
import NotFound from '@/pages/NotFound';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

function AppRoutes() {
  return (
    <Routes>
      {/* Public: marketing page with a Sign in button in the top corner. */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/s/:token" element={<SharedView />} />

      {/* Authenticated: boards list and the editor. */}
      <Route
        path="/boards"
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
  );
}

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

  const tree = (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );

  // Browsing the app works without a Google client ID; only the sign-in flow
  // needs one (Login shows a friendly notice instead of the Google button).
  if (!GOOGLE_CLIENT_ID) return tree;

  return <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>{tree}</GoogleOAuthProvider>;
}
