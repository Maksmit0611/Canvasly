import axios, { AxiosError } from 'axios';
import type { ApiErrorBody, ErrorCode } from '@canvas/shared';
import { getAccessToken, useAuthStore } from '@/store/authStore';

export const api = axios.create({
  // Relative in dev so the Vite proxy handles it; absolute in production.
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  withCredentials: true,
  timeout: 20_000,
});

/** Exported so it can be unit tested without reaching into axios internals. */
export function attachAuthHeader<T extends { headers: Record<string, unknown> }>(config: T): T {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
}

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** A failed request narrowed to the server's error envelope. */
export class ApiRequestError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, status: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const isEnvelope = (data: unknown): data is ApiErrorBody =>
  typeof data === 'object' &&
  data !== null &&
  'error' in data &&
  typeof (data as ApiErrorBody).error?.code === 'string';

/**
 * Normalise any axios failure into an ApiRequestError, clearing the session
 * first when the server says the token is no longer good.
 */
export function toApiRequestError(error: {
  config?: { url?: string };
  response?: { status?: number; data?: unknown };
  message?: string;
}): ApiRequestError {
  const status = error.response?.status ?? 0;
  const data = error.response?.data;

  // A 401 means the session is gone; drop it and let the router redirect.
  // The refresh endpoint is exempt, or a failed restore would loop.
  const url = error.config?.url ?? '';
  if (status === 401 && !url.includes('/auth/refresh')) {
    useAuthStore.getState().clear();
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.assign('/login');
    }
  }

  if (isEnvelope(data)) {
    const { code, message, details } = data.error;
    return new ApiRequestError(code, message, status, details);
  }

  return new ApiRequestError('INTERNAL', error.message || 'Network request failed', status);
}

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => Promise.reject(toApiRequestError(error)),
);

export interface HealthResponse {
  status: string;
  db: string;
}

export const fetchHealth = async (): Promise<HealthResponse> => {
  const { data } = await api.get<HealthResponse>('/health');
  return data;
};
