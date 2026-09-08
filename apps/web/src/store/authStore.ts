import { create } from 'zustand';
import type { User } from '@canvas/shared';

const USER_KEY = 'canvasly.user';

/**
 * Only the user profile is persisted. The access token stays in memory and the
 * refresh token lives in an httpOnly cookie the browser never exposes to JS.
 */
const readStoredUser = (): User | null => {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
};

const writeStoredUser = (user: User | null): void => {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {
    // Private-mode browsers can throw on write; the session still works.
  }
};

interface AuthState {
  user: User | null;
  accessToken: string | null;
  /** True until the silent-refresh attempt on mount has settled. */
  isRestoring: boolean;
  setSession: (user: User, accessToken: string) => void;
  setAccessToken: (accessToken: string) => void;
  setRestoring: (isRestoring: boolean) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: readStoredUser(),
  accessToken: null,
  isRestoring: true,

  setSession: (user, accessToken) => {
    writeStoredUser(user);
    set({ user, accessToken, isRestoring: false });
  },

  setAccessToken: (accessToken) => set({ accessToken }),

  setRestoring: (isRestoring) => set({ isRestoring }),

  clear: () => {
    writeStoredUser(null);
    set({ user: null, accessToken: null, isRestoring: false });
  },
}));

/** Read the token outside React — used by the axios request interceptor. */
export const getAccessToken = (): string | null => useAuthStore.getState().accessToken;
