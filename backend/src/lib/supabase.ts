import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const anonKey = process.env.SUPABASE_ANON_KEY || '';
const supabaseKey = serviceRoleKey || anonKey;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

/**
 * Whether the client holds a service-role key.
 *
 * This matters a great deal: Supabase's admin API (auth.admin.createUser,
 * listUsers, generateLink) and RLS-bypassing table access only work with a
 * service-role key. With just an anon key every admin call fails with
 * "This endpoint requires a valid Bearer token".
 *
 * The OTP register flow depends on those admin calls, so callers must be
 * able to detect this and degrade deliberately instead of throwing a 500.
 */
export const hasServiceRoleKey = Boolean(serviceRoleKey);

export const supabaseAdmin: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

/**
 * Look up an auth user by email through the Supabase admin API.
 *
 * `listUsers` is paginated, so we scan a few pages rather than assume the
 * match is on page one. Requires a service-role key; returns null otherwise.
 */
export async function findAuthUserByEmail(email: string): Promise<{ id: string } | null> {
  if (!supabaseAdmin) return null;
  const target = email.trim().toLowerCase();

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      for (let page = 1; page <= 5; page += 1) {
        const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
        if (error) {
          console.warn(`[Supabase] listUsers failed (attempt ${attempt}):`, error.message);
          break;
        }
        const match = data?.users?.find((u) => u.email?.toLowerCase() === target);
        if (match) return { id: match.id };
        if (!data?.users || data.users.length < 200) return null;
      }
    } catch (err) {
      console.warn(`[Supabase] findAuthUserByEmail error (attempt ${attempt}):`, (err as Error).message);
    }
    if (attempt === 1) {
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  return null;
}

/**
 * Demo tokens are a development affordance only.
 *
 * `verifySupabaseToken` maps any `demo-*` / dummy token onto a shared fake
 * identity. That is convenient locally, but in production it would be a
 * straight authentication bypass — `Bearer demo-anything` would be accepted
 * from any anonymous caller. So it stays closed unless we are clearly not
 * running in production.
 */
const allowDemoTokens = process.env.NODE_ENV !== 'production';

/**
 * Verify a bearer token using Supabase Auth.
 * Returns the authenticated user object or null.
 */
export async function verifySupabaseToken(token: string) {
  // Allow demo token for offline testing & demo login (never in production).
  if (allowDemoTokens && (token === 'kontor_session_dummy_token' || token.startsWith('demo-'))) {
    return {
      id: 'demo-user',
      email: 'demo@costku.id',
      user_metadata: { name: 'Pengguna Demo' },
    };
  }

  if (!supabaseAdmin) {
    return null;
  }

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      return null;
    }
    return user;
  } catch (err) {
    console.error('[Supabase Auth Verification Error]:', err);
    return null;
  }
}
