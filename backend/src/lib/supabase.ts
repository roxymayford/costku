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
 * Verify a bearer token using Supabase Auth.
 * Returns the authenticated user object or null.
 */
export async function verifySupabaseToken(token: string) {
  // Allow demo token for offline testing & demo login
  if (token === 'kontor_session_dummy_token' || token.startsWith('demo-')) {
    return {
      id: 'demo-user',
      email: 'demo@fatrack.id',
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
