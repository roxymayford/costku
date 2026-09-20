import { Router, Request, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import {
  supabaseAdmin,
  isSupabaseConfigured,
  hasServiceRoleKey,
} from '../lib/supabase.js';
import {
  CODE_RE,
  EMAIL_RE,
  PHONE_RE,
  ValidationIssue,
  handleOtpError,
  resolveClientIp,
  sendOtpError,
  sendValidationError,
} from '../middleware/otpError.js';
import {
  OtpChannel,
  OtpError,
  OtpErrorCode,
  UserStatus,
  describeOtpDelivery,
  getProfile,
  issueOtp,
  otpRuntimeInfo,
  resendOtp,
  startRegistrationCooldown,
  upsertProfile,
  verifyOtp,
} from '../modules/otp/index.js';

export const authRouter = Router();

/* ══════════════════════════════════════════════════════════
   POST /api/v1/auth/register   (otpplan.md §4.1)
   Creates the account in PENDING_VERIFICATION and dispatches
   an OTP. If the address already exists but is still pending,
   refresh it and send a new code — that is not an error.
   ══════════════════════════════════════════════════════════ */
authRouter.post('/register', async (req: Request, res: Response) => {
  const { name, email, phone, password } = req.body ?? {};

  /* ---- validation ---- */
  const issues: ValidationIssue[] = [];
  if (!email || typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    issues.push({ field: 'email', message: 'Alamat email tidak valid.' });
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    issues.push({ field: 'password', message: 'Kata sandi minimal 6 karakter.' });
  }
  if (phone && (typeof phone !== 'string' || !PHONE_RE.test(phone.trim()))) {
    issues.push({ field: 'phone', message: 'Nomor HP tidak valid (format internasional, mis. +62812...).' });
  }
  if (issues.length > 0) {
    return sendValidationError(res, issues);
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanPhone = phone ? phone.trim() : null;
  const cleanName = (name && String(name).trim()) || 'Pengguna FATrack';
  const requestIp = resolveClientIp(req);

  try {
    let userId: string;
    let isExistingPending = false;

    if (canUseSupabaseAdmin()) {
      /* ---- real Supabase auth.users ---- */
      const existing = await findAuthUserByEmail(cleanEmail);

      if (existing) {
        const profile = await getProfile(existing.id);

        if (profile?.status === UserStatus.ACTIVE) {
          // otpplan.md §4.1: 409 for an already-active account.
          return sendOtpError(res, OtpErrorCode.USER_ALREADY_VERIFIED);
        }

        // Pending account: refresh the data and resend rather than error.
        userId = existing.id;
        isExistingPending = true;

        if (password) {
          const { error: pwError } = await supabaseAdmin!.auth.admin.updateUserById(userId, {
            password,
          });
          if (pwError) {
            console.warn('[Auth] Failed to refresh password for pending user:', pwError.message);
          }
        }
      } else {
        const { data, error } = await supabaseAdmin!.auth.admin.createUser({
          email: cleanEmail,
          password,
          email_confirm: false,
          user_metadata: { name: cleanName, phone: cleanPhone },
        });

        if (error || !data?.user) {
          // Supabase reports an existing address with a 422 / specific message.
          if (/already|registered|exists/i.test(error?.message ?? '')) {
            return sendOtpError(res, OtpErrorCode.USER_ALREADY_VERIFIED);
          }
          console.error('[Auth] createUser failed:', error?.message);
          throw new Error(error?.message ?? 'Gagal membuat akun.');
        }
        userId = data.user.id;
      }
    } else {
      /* ---- local mode: Supabase unusable for account provisioning ---- */
      const resolved = await resolveLocalUser(cleanEmail, cleanName);
      userId = resolved.userId;
      isExistingPending = resolved.isExisting;
    }

    /* ---- profile: the verification lifecycle lives here ---- */
    await upsertProfile({
      userId,
      email: cleanEmail,
      phone: cleanPhone,
      name: cleanName,
      status: UserStatus.PENDING_VERIFICATION,
    });

    /* ---- issue the OTP ---- */
    const issued = await issueOtp({
      userId,
      channel: OtpChannel.EMAIL,
      destination: cleanEmail,
      recipientName: cleanName,
      requestIp,
    });

    // Start the cooldown so an immediate resend is correctly rejected.
    await startRegistrationCooldown(userId);

    return res.status(201).json({
      userId,
      status: UserStatus.PENDING_VERIFICATION,
      resent: isExistingPending,
      otp: {
        channel: issued.channel,
        destination: issued.destinationMasked,
        expiresInSeconds: issued.expiresInSeconds,
        resendAvailableInSeconds: issued.resendAvailableInSeconds,
      },
    });
  } catch (err) {
    return handleOtpError(res, err);
  }
});

/* ══════════════════════════════════════════════════════════
   POST /api/v1/auth/register/verify-otp   (otpplan.md §4.1)
   ══════════════════════════════════════════════════════════ */
authRouter.post('/register/verify-otp', async (req: Request, res: Response) => {
  const { userId, code } = req.body ?? {};

  const issues: ValidationIssue[] = [];
  if (!userId || typeof userId !== 'string') {
    issues.push({ field: 'userId', message: 'userId wajib diisi.' });
  }
  if (!code || typeof code !== 'string' || !CODE_RE.test(code.trim())) {
    issues.push({ field: 'code', message: 'Kode OTP harus berupa angka.' });
  }
  if (issues.length > 0) {
    return sendValidationError(res, issues);
  }

  try {
    await verifyOtp({ userId: userId.trim(), code: code.trim() });

    /* ---- issue tokens after a successful verification ---- */
    const tokens = await issueSessionTokens(userId.trim());

    return res.status(200).json({
      status: UserStatus.ACTIVE,
      ...tokens,
    });
  } catch (err) {
    return handleOtpError(res, err);
  }
});

/* ══════════════════════════════════════════════════════════
   POST /api/v1/auth/register/resend-otp   (otpplan.md §4.1)
   ══════════════════════════════════════════════════════════ */
authRouter.post('/register/resend-otp', async (req: Request, res: Response) => {
  const { userId } = req.body ?? {};

  if (!userId || typeof userId !== 'string') {
    return sendValidationError(res, [{ field: 'userId', message: 'userId wajib diisi.' }]);
  }

  const requestIp = resolveClientIp(req);
  const id = userId.trim();

  try {
    const profile = await getProfile(id);
    if (!profile) {
      return sendOtpError(res, OtpErrorCode.USER_NOT_FOUND);
    }
    if (!profile.email) {
      return sendOtpError(res, OtpErrorCode.VALIDATION_ERROR, {
        message: 'Akun ini tidak memiliki alamat email tujuan.',
      });
    }

    const issued = await resendOtp({
      userId: id,
      destination: profile.email,
      channel: OtpChannel.EMAIL,
      recipientName: profile.name,
      requestIp,
    });

    return res.status(200).json({
      expiresInSeconds: issued.expiresInSeconds,
      resendAvailableInSeconds: issued.resendAvailableInSeconds,
      otp: {
        channel: issued.channel,
        destination: issued.destinationMasked,
      },
    });
  } catch (err) {
    return handleOtpError(res, err);
  }
});

/* ══════════════════════════════════════════════════════════
   GET /api/v1/auth/register/status/:userId
   Lets the verify page rehydrate after a refresh.
   ══════════════════════════════════════════════════════════ */
authRouter.get('/register/status/:userId', async (req: Request, res: Response) => {
  const raw = req.params.userId;
  const userId = Array.isArray(raw) ? raw[0] : raw;
  if (!userId) {
    return sendValidationError(res, [{ field: 'userId', message: 'userId wajib diisi.' }]);
  }
  try {
    const profile = await getProfile(userId);
    if (!profile) {
      return sendOtpError(res, OtpErrorCode.USER_NOT_FOUND);
    }
    return res.json({
      userId: profile.id,
      status: profile.status,
      email: profile.email ? maskEmail(profile.email) : null,
      verifiedAt: profile.verified_at,
    });
  } catch (err) {
    return handleOtpError(res, err);
  }
});

/* ══════════════════════════════════════════════════════════
   GET /api/v1/auth/otp/diagnostics
   Surfaces the effective OTP configuration for debugging.
   ══════════════════════════════════════════════════════════ */
authRouter.get('/otp/diagnostics', (_req: Request, res: Response) => {
  res.json({
    status: 'success',
    config: otpRuntimeInfo(),
    delivery: describeOtpDelivery(),
    storage: {
      supabaseConfigured: isSupabaseConfigured,
      serviceRoleKeyPresent: hasServiceRoleKey,
      mode: canUseSupabaseAdmin() ? 'supabase-admin' : supabaseAdminUnavailable() ? 'local-degraded' : 'local',
      note: supabaseAdminUnavailable()
        ? 'SUPABASE_SERVICE_ROLE_KEY belum diisi. Supabase admin API (createUser/listUsers) tidak bisa dipakai, ' +
          'sehingga registrasi berjalan di penyimpanan lokal dalam memori. Isi service role key untuk memakai auth.users.'
        : undefined,
    },
  });
});

/* ══════════════════════════════════════════════════════════
   Legacy routes — kept so the existing app keeps working
   ══════════════════════════════════════════════════════════ */

// POST /api/auth/login
authRouter.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    return sendValidationError(res, [
      { field: 'email', message: 'Email dan kata sandi wajib diisi.' },
    ]);
  }

  // Supabase handles password auth directly from the client; this endpoint
  // stays for parity and now enforces the ACTIVE gate.
  if (isSupabaseConfigured && supabaseAdmin) {
    const existing = await findAuthUserByEmail(String(email).trim().toLowerCase());
    if (existing) {
      const profile = await getProfile(existing.id);
      if (profile && profile.status === UserStatus.PENDING_VERIFICATION) {
        return sendOtpError(res, OtpErrorCode.VALIDATION_ERROR, {
          message: 'Akun belum diverifikasi. Selesaikan verifikasi OTP terlebih dahulu.',
          reason: 'PENDING_VERIFICATION',
          userId: existing.id,
        });
      }
    }
  }

  return res.status(200).json({
    status: 'success',
    message: 'Autentikasi berhasil.',
    token: 'kontor_session_dummy_token',
    user: { email },
  });
});

// POST /api/auth/forgot-password
authRouter.post('/forgot-password', (req: Request, res: Response) => {
  const { email } = req.body ?? {};
  if (!email) {
    return sendValidationError(res, [{ field: 'email', message: 'Alamat email wajib diisi.' }]);
  }
  return res.status(200).json({
    status: 'success',
    message: 'Tautan pengaturan ulang kata sandi telah dikirimkan ke email Anda.',
  });
});

// GET /api/auth/me
authRouter.get('/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  return res.status(200).json({
    status: 'success',
    user: req.user,
  });
});

/* ══════════════════════════════════════════════════════════
   Helpers
   ══════════════════════════════════════════════════════════ */

/**
 * Whether the OTP register flow may provision accounts through Supabase.
 *
 * Requires BOTH a configured client AND a service-role key — the admin API
 * refuses anon-key calls. When this is false the route degrades to local
 * user resolution rather than returning an opaque 500, and the health
 * endpoint reports the degraded state.
 */
function canUseSupabaseAdmin(): boolean {
  return Boolean(isSupabaseConfigured && supabaseAdmin && hasServiceRoleKey);
}

/** True when Supabase is reachable but only holds an anon key. */
function supabaseAdminUnavailable(): boolean {
  return Boolean(isSupabaseConfigured && supabaseAdmin && !hasServiceRoleKey);
}

/** Look up an auth user by email through the admin API. */
async function findAuthUserByEmail(email: string): Promise<{ id: string } | null> {
  if (!supabaseAdmin) return null;
  try {
    // listUsers is paginated; scan a few pages rather than assume page 1.
    for (let page = 1; page <= 5; page += 1) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) {
        console.warn('[Auth] listUsers failed:', error.message);
        return null;
      }
      const match = data?.users?.find((u) => u.email?.toLowerCase() === email);
      if (match) return { id: match.id };
      if (!data?.users || data.users.length < 200) break;
    }
    return null;
  } catch (err) {
    console.warn('[Auth] findAuthUserByEmail error:', (err as Error).message);
    return null;
  }
}

/**
 * Local user resolution, used when Supabase cannot provision accounts.
 *
 * Keeps the OTP contract identical so the frontend, the rate limiter, and
 * the tests all behave the same — only the identity store differs. The
 * profile lives in the in-memory repository.
 */
async function resolveLocalUser(
  email: string,
  name: string
): Promise<{ userId: string; isExisting: boolean }> {
  const existingId = await findLocalUserByEmail(email);

  if (existingId) {
    const profile = await getProfile(existingId);
    if (profile?.status === UserStatus.ACTIVE) {
      throw new OtpError(OtpErrorCode.USER_ALREADY_VERIFIED);
    }
    return { userId: existingId, isExisting: true };
  }

  void name;
  const { randomUUID } = await import('node:crypto');
  return { userId: randomUUID(), isExisting: false };
}

/** Scan the in-memory profile store for a matching email. */
async function findLocalUserByEmail(email: string): Promise<string | null> {
  const { listMemoryProfileIds } = await import('../modules/otp/otp.repository.js');
  for (const id of listMemoryProfileIds()) {
    const profile = await getProfile(id);
    if (profile?.email?.toLowerCase() === email) return id;
  }
  return null;
}

/**
 * Issue tokens after verification.
 *
 * With a service-role key we mint a real Supabase session. Otherwise we
 * return the demo token shape the rest of the app already understands, so
 * a partially-configured environment still yields a usable flow.
 */
async function issueSessionTokens(
  userId: string
): Promise<{ accessToken: string; refreshToken: string }> {
  if (canUseSupabaseAdmin()) {
    try {
      const profile = await getProfile(userId);
      if (profile?.email) {
        const { data, error } = await supabaseAdmin!.auth.admin.generateLink({
          type: 'magiclink',
          email: profile.email,
        });
        if (!error && data?.properties?.hashed_token) {
          return {
            accessToken: data.properties.hashed_token,
            refreshToken: '',
          };
        }
      }
    } catch (err) {
      console.warn('[Auth] Token issuance fallback used:', (err as Error).message);
    }
  }

  // Local / degraded mode — the app accepts this token shape.
  return {
    accessToken: `demo-${userId}`,
    refreshToken: `demo-refresh-${userId}`,
  };
}

/** Mask an email for status responses. */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 1)}***@${domain}`;
}
