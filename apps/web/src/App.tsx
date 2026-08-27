import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuthStore } from '@/store/authStore';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import Editor from '@/pages/Editor';
import SharedView from '@/pages/SharedView';
import NotFound from '@/pages/NotFound';

export default function App() {
  const setRestoring = useAuthStore((s) => s.setRestoring);

  useEffect(() => {
    // Phase 5 replaces this with a real /auth/refresh call. Until the auth
    // endpoints exist there is nothing to restore, so settle immediately.
    setRestoring(false);
  }, [setRestoring]);

  return (
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
  );
}
