/**
 * Google OAuth routes — mounted at /api/v1/auth and /api/auth.
 *
 *   GET /google            -> 302 to Google's consent screen
 *   GET /google/callback   -> 302 back to the SPA, carrying a session handoff
 *
 * Both endpoints are navigated to by the browser, so they never answer with
 * JSON. Every failure path redirects to the frontend callback with a stable
 * `?error=<code>` the SPA can turn into a human message.
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import {
  isGoogleConfigured,
  buildAuthorizeUrl,
  signState,
  verifyState,
  exchangeCode,
  fetchUserInfo,
  decodeIdTokenPayload,
} from '../lib/google.js';
import {
  supabaseAdmin,
  isSupabaseConfigured,
  hasServiceRoleKey,
  findAuthUserByEmail,
} from '../lib/supabase.js';
import { upsertProfile, UserStatus } from '../modules/otp/index.js';

export const googleAuthRouter = Router();

/** Trailing slashes are stripped so the redirect never doubles up. */
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');

/* ══════════════════════════════════════════════════════════
   GET /google
   Kicks off the flow. A signed `state` is minted here and
   verified on the way back, which is what stops login CSRF.
   ══════════════════════════════════════════════════════════ */
googleAuthRouter.get('/google', (_req: Request, res: Response) => {
  if (!isGoogleConfigured) {
    console.warn('[Google OAuth] /google hit but GOOGLE_* env vars are incomplete.');
    return failRedirect(res, 'google_not_configured');
  }

  return res.redirect(302, buildAuthorizeUrl(signState()));
});

/* ══════════════════════════════════════════════════════════
   GET /google/callback
   Google sends the browser here with `code` + `state`.
   ══════════════════════════════════════════════════════════ */
googleAuthRouter.get('/google/callback', async (req: Request, res: Response) => {
  try {
    const errorParam = asString(req.query.error);
    const state = asString(req.query.state);
    const code = asString(req.query.code);

    /* ---- the user declined, or Google refused ---- */
    if (errorParam) {
      console.warn('[Google OAuth] Authorization denied:', errorParam);
      return failRedirect(res, errorParam === 'access_denied' ? 'access_denied' : 'oauth_failed');
    }

    if (!isGoogleConfigured) {
      return failRedirect(res, 'google_not_configured');
    }
    if (!state || !verifyState(state)) {
      console.warn('[Google OAuth] Rejected callback: state missing or invalid.');
      return failRedirect(res, 'invalid_state');
    }
    if (!code) {
      return failRedirect(res, 'missing_code');
    }

    /* ---- code -> tokens -> verified profile ---- */
    const tokens = await exchangeCode(code);
    const profile = await fetchUserInfo(tokens.access_token);

    /*
     * Cross-check the id_token when Google returned one. Both values come
     * straight from Google over TLS, so a mismatch means something is wrong
     * with the exchange rather than with the caller.
     */
    if (tokens.id_token) {
      const payload = decodeIdTokenPayload(tokens.id_token);
      if (!payload || payload.sub !== profile.sub) {
        console.warn('[Google OAuth] id_token did not match userinfo.');
        return failRedirect(res, 'invalid_id_token');
      }
    }

    if (!profile.email || profile.email_verified !== true) {
      console.warn('[Google OAuth] Rejected unverified Google address.');
      return failRedirect(res, 'email_not_verified');
    }

    const email = profile.email.trim().toLowerCase();
    const name = (profile.name || email.split('@')[0] || 'Pengguna costKu').trim();

    const provisioned = await provisionUser({ email, name, avatarUrl: profile.picture });
    if (provisioned.error) {
      return failRedirect(res, provisioned.error);
    }

    /*
     * Happy path: hand the SPA a one-time token_hash (in the URL *fragment*,
     * so it never reaches a server log or the Referer header). The SPA
     * exchanges it via verifyOtp for a real Supabase session.
     */
    if (provisioned.tokenHash) {
      return res.redirect(
        302,
        frontendCallback({ token_hash: provisioned.tokenHash, type: 'magiclink' }, true)
      );
    }

    /*
     * Degraded path: no service-role key, so no Supabase session can be
     * minted. Fall back to the local identity the app already understands
     * rather than failing the login outright.
     */
    return res.redirect(
      302,
      frontendCallback(
        { demo: '1', uid: provisioned.userId, email, name },
        true
      )
    );
  } catch (err) {
    const e = err as Error & { cause?: unknown };
    console.error('[Google OAuth] Callback failed:', e.message);
    console.error('[Google OAuth] Stack:', e.stack);
    if (e.cause) console.error('[Google OAuth] Cause:', e.cause);
    return failRedirect(res, 'oauth_failed');
  }
});

/* ══════════════════════════════════════════════════════════
   Helpers
   ══════════════════════════════════════════════════════════ */

interface ProvisionInput {
  email: string;
  name: string;
  avatarUrl?: string;
}

interface ProvisionResult {
  userId: string;
  /** Present when a real Supabase session handoff is possible. */
  tokenHash?: string;
  /** Stable error code for the redirect, when provisioning failed. */
  error?: string;
}

/**
 * Find or create the Supabase user behind a verified Google address.
 *
 * A Google address is already verified by Google, so the account skips the
 * OTP step entirely and the profile is written straight to ACTIVE. The
 * `on_auth_user_created_profile` trigger creates a PENDING_VERIFICATION row
 * on insert; `upsertProfile` then updates that same row in place, so there is
 * no double-create.
 */
async function provisionUser(input: ProvisionInput): Promise<ProvisionResult> {
  const { email, name, avatarUrl } = input;
  const canUseAdmin = Boolean(isSupabaseConfigured && supabaseAdmin && hasServiceRoleKey);

  let userId: string;

  if (canUseAdmin) {
    const existing = await findAuthUserByEmail(email);

    if (existing) {
      userId = existing.id;
      const { error } = await supabaseAdmin!.auth.admin.updateUserById(userId, {
        user_metadata: { name, avatar_url: avatarUrl, provider: 'google' },
      });
      if (error) {
        console.warn('[Google OAuth] updateUserById failed:', error.message);
      }
    } else {
      const { data, error } = await supabaseAdmin!.auth.admin.createUser({
        email,
        // Google already proved ownership of this address.
        email_confirm: true,
        user_metadata: { name, avatar_url: avatarUrl, provider: 'google' },
      });

      if (error || !data?.user) {
        if (error?.message?.toLowerCase().includes('already')) {
          console.log('[Google OAuth] User already registered in Supabase. Recovering existing account...');
          const recovered = await findAuthUserByEmail(email);
          if (recovered) {
            userId = recovered.id;
            await supabaseAdmin!.auth.admin.updateUserById(userId, {
              user_metadata: { name, avatar_url: avatarUrl, provider: 'google' },
            }).catch(() => {});
          } else {
            console.error('[Google OAuth] Failed to recover existing user by email:', error.message);
            return { userId: '', error: 'provision_failed' };
          }
        } else {
          console.error('[Google OAuth] createUser failed:', error?.message);
          return { userId: '', error: 'provision_failed' };
        }
      } else {
        userId = data.user.id;
      }
    }
  } else {
    /*
     * No service-role key: the admin API is off limits, so identity is
     * local-only. A fresh uuid keeps each Google account distinct instead of
     * collapsing everyone onto the shared `demo-user`.
     */
    userId = randomUUID();
  }

  await upsertProfile({
    userId,
    email,
    name,
    status: UserStatus.ACTIVE,
    verifiedAt: new Date(),
  });

  if (!canUseAdmin) {
    return { userId };
  }

  /* ---- mint the one-time token the SPA trades for a session ---- */
  try {
    const { data, error } = await supabaseAdmin!.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });

    const tokenHash = data?.properties?.hashed_token;
    if (!error && tokenHash) {
      return { userId, tokenHash };
    }

    console.warn(
      '[Google OAuth] generateLink unavailable, falling back to local session:',
      error?.message ?? 'response carried no hashed_token'
    );
  } catch (err) {
    console.warn('[Google OAuth] generateLink threw:', (err as Error).message);
  }

  return { userId };
}

/** Build the SPA callback URL, in the query or the fragment. */
function frontendCallback(params: Record<string, string>, inFragment = false): string {
  const encoded = new URLSearchParams(params).toString();
  return inFragment
    ? `${FRONTEND_URL}/auth/callback#${encoded}`
    : `${FRONTEND_URL}/auth/callback?${encoded}`;
}

/** Send the browser back to the SPA with a stable error code. */
function failRedirect(res: Response, error: string): void {
  res.redirect(302, frontendCallback({ error }));
}

/** Read a query param that may arrive as a repeated value. */
function asString(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value;
  if (Array.isArray(value) && typeof value[0] === 'string' && value[0].length > 0) {
    return value[0];
  }
  return null;
}
