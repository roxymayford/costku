/**
 * Google OAuth 2.0 — Authorization Code flow (server side).
 *
 * The backend owns this flow end to end: it builds the consent URL, receives
 * the `code` on its own callback route, exchanges it for tokens, and reads the
 * verified profile from Google. The client secret never leaves the server —
 * see the note on `GOOGLE_CLIENT_SECRET` in backend/.env.example.
 *
 * No extra dependency is needed: Node 22 ships a global `fetch`, and the
 * `state` parameter is signed with `node:crypto` instead of a session store.
 */

import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config();

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/userinfo';

/** How long a signed `state` stays valid. */
const STATE_TTL_MS = 10 * 60 * 1000;
/** Tolerated clock skew when reading `state` timestamps. */
const STATE_CLOCK_SKEW_MS = 60 * 1000;

const clientId = process.env.GOOGLE_CLIENT_ID || '';
const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
const redirectUri =
  process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/v1/auth/google/callback';

/**
 * HMAC key for the OAuth `state` parameter.
 *
 * Prefers an explicit OAUTH_STATE_SECRET, then the OTP pepper, and finally a
 * per-process random key. The random fallback keeps signing/verification
 * working out of the box; the only cost is that an in-flight login is
 * invalidated by a server restart (the user just clicks the button again).
 */
const stateSecret =
  process.env.OAUTH_STATE_SECRET || process.env.OTP_PEPPER || randomBytes(32).toString('hex');

/** True when the client id, secret, and redirect URI are all present. */
export const isGoogleConfigured = Boolean(clientId && clientSecret && redirectUri);

/** The redirect URI Google must have registered, exposed for diagnostics. */
export const googleRedirectUri = redirectUri;

export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  id_token?: string;
  scope?: string;
  token_type: string;
}

export interface GoogleUserInfo {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
}

export interface GoogleIdTokenPayload {
  iss?: string;
  aud?: string;
  exp?: number;
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

const VALID_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

/**
 * Build the consent URL the browser is redirected to.
 *
 * `access_type=online` keeps us out of the refresh-token/consent-screen dance
 * (we only need the identity, not offline API access), and
 * `prompt=select_account` shows the account picker instead of silently
 * reusing whichever Google session is active.
 */
export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
    include_granted_scopes: 'true',
  });

  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

/**
 * Mint a signed, self-contained `state` value.
 *
 * Format: `<issuedAt>.<nonce>.<hmac>`. Stateless, so it survives restarts and
 * leaves no per-request memory behind.
 */
export function signState(): string {
  const payload = `${Date.now()}.${randomUUID()}`;
  return `${payload}.${signHmac(payload)}`;
}

/**
 * Verify a `state` value returned by Google.
 *
 * Guards against login CSRF: the signature proves we issued it, and the
 * timestamp bounds how long it can be replayed.
 */
export function verifyState(state: string): boolean {
  const segments = state.split('.');
  if (segments.length !== 3) return false;

  const [issuedAt, nonce, signature] = segments;
  if (!issuedAt || !nonce || !signature) return false;

  if (!safeEqual(signature, signHmac(`${issuedAt}.${nonce}`))) return false;

  const issuedAtMs = Number(issuedAt);
  if (!Number.isFinite(issuedAtMs)) return false;

  const age = Date.now() - issuedAtMs;
  if (age > STATE_TTL_MS || age < -STATE_CLOCK_SKEW_MS) return false;

  return true;
}

/** Exchange the authorization code for tokens. */
export async function exchangeCode(code: string): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const data = (await response.json()) as Partial<GoogleTokenResponse> & {
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !data.access_token) {
    const detail = data.error_description || data.error || `HTTP ${response.status}`;
    throw new Error(`Google token exchange failed: ${detail}`);
  }

  return data as GoogleTokenResponse;
}

/**
 * Read the authenticated profile.
 *
 * This is the authoritative source of the user's identity — the access token
 * is presented to Google over TLS and Google answers with the profile it has
 * verified.
 */
export async function fetchUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const response = await fetch(GOOGLE_USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Google userinfo request failed: HTTP ${response.status}`);
  }

  const data = (await response.json()) as GoogleUserInfo;
  if (!data.sub) {
    throw new Error('Google userinfo response contained no subject.');
  }

  return data;
}

/**
 * Decode (not fully verify) an id_token payload.
 *
 * Used only as a cross-check against /userinfo. It is safe to skip JWKS
 * signature verification here precisely because this token is never accepted
 * from the client — it arrives directly from Google's token endpoint over TLS.
 * Never call this on a client-supplied id_token.
 */
export function decodeIdTokenPayload(idToken: string): GoogleIdTokenPayload | null {
  const segments = idToken.split('.');
  if (segments.length !== 3) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(segments[1], 'base64url').toString('utf8')
    ) as GoogleIdTokenPayload;

    if (!payload.iss || !VALID_ISSUERS.has(payload.iss)) return null;
    if (payload.aud !== clientId) return null;
    if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) return null;

    return payload;
  } catch {
    return null;
  }
}

/* ── internals ─────────────────────────────────────────── */

function signHmac(payload: string): string {
  return createHmac('sha256', stateSecret).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
