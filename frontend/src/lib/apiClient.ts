// ──────────────────────────────────────────────────────────
// costKu — Centralized Backend API Client
// Handles authentication headers, base URL, and response parsing
// ──────────────────────────────────────────────────────────

import { supabase, isSupabaseConfigured } from './supabase';

export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

const LOCAL_IDENTITY_KEY = 'fatrack-demo-user';

/**
 * Get active auth Bearer token.
 * Prefers active Supabase session; falls back to demo/local token.
 */
export async function getAuthToken(): Promise<string> {
  if (isSupabaseConfigured) {
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) {
        return data.session.access_token;
      }
    } catch {
      // Fall through to local fallback
    }
  }

  // Check if local demo user exists
  try {
    const saved = localStorage.getItem(LOCAL_IDENTITY_KEY);
    if (saved) {
      const user = JSON.parse(saved);
      if (user?.id) {
        return `demo-${user.id}`;
      }
    }
  } catch {
    // Ignore parse error
  }

  return 'kontor_session_dummy_token';
}

export interface ApiResponse<T = any> {
  status: 'success' | 'fail' | 'error';
  data?: T;
  message?: string;
  errors?: string[];
}

/**
 * Perform an authenticated API request to the Express backend.
 */
export async function apiFetch<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getAuthToken();
  const url = `${BACKEND_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const headers = new Headers(options.headers || {});
  if (!headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  const json: ApiResponse<T> = await res.json().catch(() => ({
    status: 'error',
    message: `Respon backend tidak valid (${res.status} ${res.statusText})`,
  }));

  if (!res.ok || json.status === 'fail' || json.status === 'error') {
    const errorMsg =
      json.message ||
      (json.errors && json.errors.length > 0 ? json.errors.join(', ') : `Request failed with status ${res.status}`);
    throw new Error(errorMsg);
  }

  return json.data as T;
}
