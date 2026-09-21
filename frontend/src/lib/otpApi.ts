/**
 * OTP API client.
 *
 * Talks to the backend OTP endpoints (otpplan.md §4.1) and normalises
 * the response contract:
 *
 *   success -> { ok: true, ... }
 *   failure -> { ok: false, code, message, retryAfter?, remainingAttempts? }
 *
 * The backend always answers failures with { error: { code, message, ... } },
 * so every caller can branch on a stable `code` instead of parsing strings.
 */

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

/** Machine-readable error codes emitted by the backend. */
export type OtpErrorCode =
  | 'VALIDATION_ERROR'
  | 'OTP_INVALID'
  | 'OTP_EXPIRED'
  | 'USER_ALREADY_VERIFIED'
  | 'OTP_MAX_ATTEMPTS'
  | 'OTP_RESEND_COOLDOWN'
  | 'OTP_RATE_LIMITED'
  | 'OTP_DELIVERY_FAILED'
  | 'USER_NOT_FOUND'
  | 'INTERNAL_ERROR'
  | 'NETWORK_ERROR';

export interface OtpApiFailure {
  ok: false;
  code: OtpErrorCode;
  message: string;
  /** Seconds the caller must wait before retrying. */
  retryAfter?: number;
  /** Attempts left on the current OTP. */
  remainingAttempts?: number;
}

export interface OtpIssueInfo {
  channel: string;
  destination: string;
  expiresInSeconds: number;
  resendAvailableInSeconds: number;
}

export interface RegisterSuccess {
  ok: true;
  userId: string;
  status: string;
  /** True when an existing pending account was refreshed. */
  resent: boolean;
  otp: OtpIssueInfo;
}

export interface VerifySuccess {
  ok: true;
  status: string;
  /**
   * Present when the backend could mint a real Supabase session. The client
   * must exchange it via `supabase.auth.verifyOtp({ type: 'magiclink',
   * token_hash })` — it is NOT an access token.
   */
  tokenHash?: string;
  accessToken: string;
  refreshToken: string;
}

export interface ResendSuccess {
  ok: true;
  expiresInSeconds: number;
  resendAvailableInSeconds: number;
  otp: { channel: string; destination: string };
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  phone?: string;
}

/* ──────────────────────────────────────────────────────────
   Low-level request
   ────────────────────────────────────────────────────────── */
async function post<T extends { ok: true }>(
  path: string,
  body: Record<string, unknown>
): Promise<T | OtpApiFailure> {
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const payload = await res.json().catch(() => null);

    if (res.ok && payload) {
      return { ok: true, ...payload } as T;
    }

    /* ---- normalise the error envelope ---- */
    const err = payload?.error;
    if (err && typeof err === 'object') {
      return {
        ok: false,
        code: (err.code as OtpErrorCode) || 'INTERNAL_ERROR',
        message: err.message || 'Terjadi kesalahan.',
        retryAfter: typeof err.retryAfter === 'number' ? err.retryAfter : undefined,
        remainingAttempts:
          typeof err.remainingAttempts === 'number' ? err.remainingAttempts : undefined,
      };
    }

    return {
      ok: false,
      code: 'INTERNAL_ERROR',
      message: payload?.message || `Permintaan gagal (HTTP ${res.status}).`,
    };
  } catch {
    return {
      ok: false,
      code: 'NETWORK_ERROR',
      message: 'Tidak dapat menghubungi server. Periksa koneksi Anda.',
    };
  }
}

/* ──────────────────────────────────────────────────────────
   Endpoints
   ────────────────────────────────────────────────────────── */
export function requestRegistration(input: RegisterInput) {
  return post<RegisterSuccess>('/api/v1/auth/register', {
    name: input.name,
    email: input.email,
    password: input.password,
    phone: input.phone,
  });
}

export function requestVerifyOtp(userId: string, code: string) {
  return post<VerifySuccess>('/api/v1/auth/register/verify-otp', { userId, code });
}

export function requestResendOtp(userId: string) {
  return post<ResendSuccess>('/api/v1/auth/register/resend-otp', { userId });
}

/** Rehydrate the verification state after a page refresh. */
export async function fetchVerificationStatus(userId: string): Promise<{
  userId: string;
  status: string;
  email: string | null;
  verifiedAt: string | null;
} | null> {
  try {
    const res = await fetch(
      `${BACKEND_URL}/api/v1/auth/register/status/${encodeURIComponent(userId)}`
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/* ──────────────────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────────────────── */
export const isFailure = <T extends { ok: true }>(
  result: T | OtpApiFailure
): result is OtpApiFailure => result.ok === false;

export const isSuccess = <T extends { ok: true }>(
  result: T | OtpApiFailure
): result is T => result.ok === true;

/** Human-friendly message, including contextual details when available. */
export function describeFailure(failure: OtpApiFailure): string {
  switch (failure.code) {
    case 'OTP_INVALID':
      return failure.remainingAttempts !== undefined
        ? `${failure.message} Sisa ${failure.remainingAttempts} percobaan.`
        : failure.message;
    case 'OTP_RESEND_COOLDOWN':
    case 'OTP_RATE_LIMITED':
      return failure.retryAfter !== undefined
        ? `${failure.message} Coba lagi dalam ${failure.retryAfter} detik.`
        : failure.message;
    default:
      return failure.message;
  }
}

/** Persist the pending verification so a refresh keeps its place. */
const PENDING_KEY = 'fatrack-pending-otp';

export interface PendingVerification {
  userId: string;
  email: string;
  destination: string;
  expiresInSeconds: number;
  resendAvailableInSeconds: number;
  startedAt: number;
}

export function savePendingVerification(pending: PendingVerification): void {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    /* storage unavailable — the flow still works, it just will not survive a refresh */
  }
}

export function loadPendingVerification(): PendingVerification | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingVerification;
    if (!parsed?.userId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingVerification(): void {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}
