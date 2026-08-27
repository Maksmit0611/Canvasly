import { beforeEach, describe, expect, it } from 'vitest';
import type { User } from '@canvas/shared';
import { ApiRequestError, attachAuthHeader, toApiRequestError } from './api';
import { useAuthStore } from '@/store/authStore';

const user: User = {
  id: '00000000-0000-4000-8000-000000000000',
  email: 'a@b.com',
  name: null,
  avatarUrl: null,
  createdAt: new Date().toISOString(),
};

describe('attachAuthHeader', () => {
  beforeEach(() => useAuthStore.getState().clear());

  it('attaches a bearer token when the store holds one', () => {
    useAuthStore.getState().setSession(user, 'token-123');
    const config = attachAuthHeader({ headers: {} as Record<string, unknown> });
    expect(config.headers.Authorization).toBe('Bearer token-123');
  });

  it('omits the header when there is no token', () => {
    const config = attachAuthHeader({ headers: {} as Record<string, unknown> });
    expect(config.headers.Authorization).toBeUndefined();
  });
});

describe('toApiRequestError', () => {
  beforeEach(() => useAuthStore.getState().clear());

  it('surfaces the server error envelope', () => {
    const err = toApiRequestError({
      config: { url: '/projects' },
      response: { status: 404, data: { error: { code: 'NOT_FOUND', message: 'Project not found' } } },
    });

    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('Project not found');
    expect(err.status).toBe(404);
  });

  it('falls back to INTERNAL when there is no envelope', () => {
    const err = toApiRequestError({ message: 'Network Error' });
    expect(err.code).toBe('INTERNAL');
    expect(err.status).toBe(0);
  });

  it('clears the session on a 401', () => {
    useAuthStore.getState().setSession(user, 'token-123');

    toApiRequestError({
      config: { url: '/projects' },
      response: {
        status: 401,
        data: { error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } },
      },
    });

    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('does not clear the session when the refresh endpoint itself 401s', () => {
    useAuthStore.getState().setSession(user, 'token-123');

    toApiRequestError({
      config: { url: '/auth/refresh' },
      response: {
        status: 401,
        data: { error: { code: 'UNAUTHENTICATED', message: 'No refresh cookie' } },
      },
    });

    expect(useAuthStore.getState().user).toEqual(user);
  });
});
