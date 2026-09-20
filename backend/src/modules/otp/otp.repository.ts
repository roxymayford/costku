/**
 * OTP repository — all reads and writes against public.otp_codes
 * and public.profiles.
 *
 * Uses the Supabase admin client (service role), which bypasses RLS.
 * The table is intentionally locked down for anon/authenticated roles.
 */

import { randomUUID } from 'node:crypto';
import { supabaseAdmin, isSupabaseConfigured, hasServiceRoleKey } from '../../lib/supabase.js';
import {
  OtpChannelType,
  OtpPurposeType,
  UserStatus,
  UserStatusType,
} from './otp.constants.js';

export interface OtpRecord {
  id: string;
  user_id: string;
  purpose: string;
  channel: OtpChannelType;
  destination: string;
  code_hash: string;
  expires_at: string;
  attempts: number;
  max_attempts: number;
  consumed_at: string | null;
  invalidated_at: string | null;
  request_ip: string | null;
  created_at: string;
}

export interface ProfileRecord {
  id: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  status: UserStatusType;
  verified_at: string | null;
  created_at: string;
}

/**
 * In-memory fallback store, used when the database is not usable for
 * these tables (no Supabase config, or no service-role key — in which
 * case RLS would block every read and write anyway).
 */
interface MemoryStore {
  otp: Map<string, OtpRecord>;
  profiles: Map<string, ProfileRecord>;
}
const memory: MemoryStore = { otp: new Map(), profiles: new Map() };

/**
 * Whether reads/writes fall back to the in-memory store.
 *
 * A service-role key is required because both otp_codes and profiles are
 * RLS-protected and the backend is the only writer. Without it every
 * Supabase call would fail, so we deliberately use memory instead of
 * surfacing a database error to the user.
 */
export function usingMemoryStore(): boolean {
  return !isSupabaseConfigured || !supabaseAdmin || !hasServiceRoleKey;
}

/** Why the memory store is in use — surfaced in diagnostics. */
export function storageMode(): 'supabase' | 'memory-no-config' | 'memory-no-service-role' {
  if (!isSupabaseConfigured || !supabaseAdmin) return 'memory-no-config';
  if (!hasServiceRoleKey) return 'memory-no-service-role';
  return 'supabase';
}

/**
 * Some deployments run the OTP tables on a project that has profiles but
 * not otp_codes (or vice versa). Rather than probing on every call, we
 * remember a missing table once and switch that entity to memory.
 */
let profilesTableMissing = false;
let otpTableMissing = false;

function isMissingTableError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const msg = err.message ?? '';
  return (
    err.code === '42P01' ||
    err.code === 'PGRST205' ||
    /schema cache|does not exist/i.test(msg)
  );
}

/* ──────────────────────────────────────────────────────────
   Insert a new OTP row
   ────────────────────────────────────────────────────────── */
export async function insertOtp(input: {
  id: string;
  userId: string;
  purpose: OtpPurposeType;
  channel: OtpChannelType;
  destination: string;
  codeHash: string;
  expiresAt: Date;
  maxAttempts: number;
  requestIp?: string | null;
}): Promise<OtpRecord> {
  const record: OtpRecord = {
    id: input.id,
    user_id: input.userId,
    purpose: input.purpose,
    channel: input.channel,
    destination: input.destination,
    code_hash: input.codeHash,
    expires_at: input.expiresAt.toISOString(),
    attempts: 0,
    max_attempts: input.maxAttempts,
    consumed_at: null,
    invalidated_at: null,
    request_ip: input.requestIp ?? null,
    created_at: new Date().toISOString(),
  };

  if (usingMemoryStore() || otpTableMissing) {
    memory.otp.set(record.id, record);
    return record;
  }

  const { data, error } = await supabaseAdmin!
    .from('otp_codes')
    .insert({
      id: input.id,
      user_id: input.userId,
      purpose: input.purpose,
      channel: input.channel,
      destination: input.destination,
      code_hash: input.codeHash,
      expires_at: input.expiresAt.toISOString(),
      max_attempts: input.maxAttempts,
      attempts: 0,
      request_ip: input.requestIp ?? null,
    })
    .select('*')
    .single();

  if (error || !data) {
    // The table may simply not be migrated yet — fall back rather than
    // breaking registration entirely.
    if (isMissingTableError(error)) {
      otpTableMissing = true;
      console.warn(
        '[OTP] Table public.otp_codes not found — using in-memory storage. ' +
          'Run backend/supabase/otp_schema.sql to enable persistence.'
      );
      memory.otp.set(record.id, record);
      return record;
    }
    throw new Error(`[OTP] Failed to insert otp_codes row: ${error?.message}`);
  }
  return data as OtpRecord;
}

/* ──────────────────────────────────────────────────────────
   Find the latest active OTP for (user, purpose)
   "Active" = not consumed and not invalidated.
   ────────────────────────────────────────────────────────── */
export async function findLatestActive(
  userId: string,
  purpose: OtpPurposeType
): Promise<OtpRecord | null> {
  if (usingMemoryStore() || otpTableMissing) {
    const rows = [...memory.otp.values()]
      .filter(
        (r) =>
          r.user_id === userId &&
          r.purpose === purpose &&
          r.consumed_at === null &&
          r.invalidated_at === null
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return rows[0] ?? null;
  }

  const { data, error } = await supabaseAdmin!
    .from('otp_codes')
    .select('*')
    .eq('user_id', userId)
    .eq('purpose', purpose)
    .is('consumed_at', null)
    .is('invalidated_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`[OTP] Failed to read active OTP: ${error.message}`);
  }
  return (data as OtpRecord) ?? null;
}

/** Read a single OTP row by id — used for diagnostics and tests. */
export async function findOtpById(otpId: string): Promise<OtpRecord | null> {
  if (usingMemoryStore() || otpTableMissing) {
    return memory.otp.get(otpId) ?? null;
  }

  const { data, error } = await supabaseAdmin!
    .from('otp_codes')
    .select('*')
    .eq('id', otpId)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      otpTableMissing = true;
      return memory.otp.get(otpId) ?? null;
    }
    throw new Error(`[OTP] Failed to read OTP row: ${error.message}`);
  }
  return (data as OtpRecord) ?? null;
}

/** Increment the attempt counter. Returns the new count. */
export async function incrementAttempts(otpId: string): Promise<number> {
  if (usingMemoryStore() || otpTableMissing) {
    const row = memory.otp.get(otpId);
    if (!row) throw new Error('[OTP] OTP row not found for attempt increment.');
    row.attempts += 1;
    return row.attempts;
  }

  // Read-then-write: the OTP is guarded by the caller's flow and the
  // per-OTP attempt ceiling, so a lost update here is not exploitable
  // (worst case one extra attempt). The decisive state changes are the
  // atomic consumed_at / invalidated_at updates below.
  const { data: current, error: readError } = await supabaseAdmin!
    .from('otp_codes')
    .select('attempts')
    .eq('id', otpId)
    .single();

  if (readError || !current) {
    throw new Error(`[OTP] Failed to read attempts: ${readError?.message}`);
  }

  const next = (current as { attempts: number }).attempts + 1;
  const { error: writeError } = await supabaseAdmin!
    .from('otp_codes')
    .update({ attempts: next })
    .eq('id', otpId);

  if (writeError) {
    throw new Error(`[OTP] Failed to update attempts: ${writeError.message}`);
  }
  return next;
}

/**
 * Atomically mark an OTP as consumed. Returns true only for the caller
 * that actually performed the transition — this is what makes the
 * "only one parallel verify wins" guarantee hold.
 */
export async function consumeOtp(otpId: string): Promise<boolean> {
  if (usingMemoryStore() || otpTableMissing) {
    const row = memory.otp.get(otpId);
    if (!row || row.consumed_at !== null) return false;
    row.consumed_at = new Date().toISOString();
    return true;
  }

  const { data, error } = await supabaseAdmin!
    .from('otp_codes')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', otpId)
    .is('consumed_at', null)
    .select('id');

  if (error) {
    throw new Error(`[OTP] Failed to consume OTP: ${error.message}`);
  }
  // Zero rows updated => another request already consumed it.
  return Array.isArray(data) && data.length === 1;
}

/** Invalidate every active OTP for (user, purpose). Used on resend. */
export async function invalidateActive(
  userId: string,
  purpose: OtpPurposeType
): Promise<number> {
  if (usingMemoryStore() || otpTableMissing) {
    let count = 0;
    for (const row of memory.otp.values()) {
      if (
        row.user_id === userId &&
        row.purpose === purpose &&
        row.consumed_at === null &&
        row.invalidated_at === null
      ) {
        row.invalidated_at = new Date().toISOString();
        count += 1;
      }
    }
    return count;
  }

  const { data, error } = await supabaseAdmin!
    .from('otp_codes')
    .update({ invalidated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('purpose', purpose)
    .is('consumed_at', null)
    .is('invalidated_at', null)
    .select('id');

  if (error) {
    throw new Error(`[OTP] Failed to invalidate OTPs: ${error.message}`);
  }
  return Array.isArray(data) ? data.length : 0;
}

/* ──────────────────────────────────────────────────────────
   Profiles
   ────────────────────────────────────────────────────────── */
export async function getProfile(userId: string): Promise<ProfileRecord | null> {
  if (usingMemoryStore() || profilesTableMissing) {
    return memory.profiles.get(userId) ?? null;
  }

  const { data, error } = await supabaseAdmin!
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    // A missing profiles table means the migration has not run. Degrade to
    // memory rather than failing the request.
    if (isMissingTableError(error) || error.code === 'PGRST116') {
      if (isMissingTableError(error)) {
        profilesTableMissing = true;
        console.warn(
          '[OTP] Table public.profiles not found — using in-memory storage. ' +
            'Run backend/supabase/otp_schema.sql to enable persistence.'
        );
      }
      return memory.profiles.get(userId) ?? null;
    }
    throw new Error(`[OTP] Failed to read profile: ${error.message}`);
  }
  return (data as ProfileRecord) ?? null;
}

/** Write a profile into the in-memory store, merging with any existing row. */
function writeMemoryProfile(input: {
  userId: string;
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  status?: UserStatusType;
  verifiedAt?: Date | null;
}): ProfileRecord {
  const existing = memory.profiles.get(input.userId);
  const record: ProfileRecord = {
    id: input.userId,
    email: input.email ?? existing?.email ?? null,
    phone: input.phone ?? existing?.phone ?? null,
    name: input.name ?? existing?.name ?? null,
    status: input.status ?? existing?.status ?? UserStatus.PENDING_VERIFICATION,
    verified_at:
      input.verifiedAt !== undefined
        ? input.verifiedAt
          ? input.verifiedAt.toISOString()
          : null
        : existing?.verified_at ?? null,
    created_at: existing?.created_at ?? new Date().toISOString(),
  };
  memory.profiles.set(record.id, record);
  return record;
}

export async function upsertProfile(input: {
  userId: string;
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  status?: UserStatusType;
  verifiedAt?: Date | null;
}): Promise<ProfileRecord | null> {
  if (usingMemoryStore() || profilesTableMissing) {
    return writeMemoryProfile(input);
  }

  const payload: Record<string, unknown> = {
    id: input.userId,
    updated_at: new Date().toISOString(),
  };
  if (input.email !== undefined) payload.email = input.email;
  if (input.phone !== undefined) payload.phone = input.phone;
  if (input.name !== undefined) payload.name = input.name;
  if (input.status !== undefined) payload.status = input.status;
  if (input.verifiedAt !== undefined) {
    payload.verified_at = input.verifiedAt ? input.verifiedAt.toISOString() : null;
  }

  const { data, error } = await supabaseAdmin!
    .from('profiles')
    .upsert(payload, { onConflict: 'id' })
    .select('*')
    .single();

  if (error) {
    if (isMissingTableError(error)) {
      profilesTableMissing = true;
      console.warn(
        '[OTP] Table public.profiles not found — using in-memory storage. ' +
          'Run backend/supabase/otp_schema.sql to enable persistence.'
      );
      return writeMemoryProfile(input);
    }
    throw new Error(`[OTP] Failed to upsert profile: ${error.message}`);
  }
  return (data as ProfileRecord) ?? null;
}

/**
 * Mark a user ACTIVE after a successful verification.
 * Guarded with a status filter so a parallel verify cannot flip an
 * already-ACTIVE account twice.
 */
export async function activateProfile(userId: string): Promise<boolean> {
  const now = new Date();

  if (usingMemoryStore() || profilesTableMissing) {
    const profile = memory.profiles.get(userId);
    if (!profile || profile.status === UserStatus.ACTIVE) return false;
    profile.status = UserStatus.ACTIVE;
    profile.verified_at = now.toISOString();
    return true;
  }

  const { data, error } = await supabaseAdmin!
    .from('profiles')
    .update({ status: UserStatus.ACTIVE, verified_at: now.toISOString(), updated_at: now.toISOString() })
    .eq('id', userId)
    .neq('status', UserStatus.ACTIVE)
    .select('id');

  if (error) {
    if (isMissingTableError(error)) {
      profilesTableMissing = true;
      const profile = memory.profiles.get(userId);
      if (!profile || profile.status === UserStatus.ACTIVE) return false;
      profile.status = UserStatus.ACTIVE;
      profile.verified_at = now.toISOString();
      return true;
    }
    throw new Error(`[OTP] Failed to activate profile: ${error.message}`);
  }
  return Array.isArray(data) && data.length === 1;
}

/** Generate a fresh UUID for a new OTP row. */
export function newOtpId(): string {
  return randomUUID();
}

/**
 * List every profile id held in the in-memory store.
 * Only meaningful in demo/offline mode — used to resolve an email back
 * to a user id without a database.
 */
export function listMemoryProfileIds(): string[] {
  return [...memory.profiles.keys()];
}
