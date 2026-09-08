import type { AuthResponse, MeResponse, User } from '@canvas/shared';
import { api } from './api';
import { useAuthStore } from '@/store/authStore';

interface RefreshResult {
  token: string;
  user: User;
}

export async function signInWithGoogle(credential: string): Promise<User> {
  const { data } = await api.post<AuthResponse>('/auth/google', { credential });
  useAuthStore.getState().setSession(data.user, data.token);
  return data.user;
}

/**
 * Exchange the refresh cookie for a new access token. Called once on mount so a
 * reload restores the session without another trip through Google.
 */
export async function restoreSession(): Promise<User | null> {
  const store = useAuthStore.getState();
  try {
    const { data } = await api.post<RefreshResult>('/auth/refresh');
    store.setSession(data.user, data.token);
    return data.user;
  } catch {
    // No cookie, or it has expired — a normal signed-out state, not an error.
    store.clear();
    return null;
  } finally {
    store.setRestoring(false);
  }
}

export async function signOut(): Promise<void> {
  try {
    await api.post('/auth/logout');
  } finally {
    useAuthStore.getState().clear();
    window.location.assign('/login');
  }
}

export async function fetchMe(): Promise<User> {
  const { data } = await api.get<MeResponse>('/auth/me');
  return data.user;
}
