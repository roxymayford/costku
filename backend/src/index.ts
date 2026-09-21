import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { authRouter } from './routes/auth.js';
import { googleAuthRouter } from './routes/googleAuth.js';
import { subscriptionRouter } from './routes/subscription.js';
import { midtransRouter } from './routes/midtrans.js';
import { errorHandler } from './middleware/errorHandler.js';
import { isSupabaseConfigured, hasServiceRoleKey } from './lib/supabase.js';
import { isMidtransConfigured } from './lib/midtrans.js';
import { isGoogleConfigured, googleRedirectUri } from './lib/google.js';
import { describeOtpDelivery, otpRuntimeInfo } from './modules/otp/index.js';
import { registerCleanupJobs } from './modules/jobs/cleanup-otp.job.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Behind a proxy (Docker / nginx) these make req.ip reflect the real client,
// which the OTP rate limiter depends on.
app.set('trust proxy', 1);

// Middlewares
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'costKu Financial Advisor API',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    features: {
      supabaseConnected: isSupabaseConfigured,
      supabaseAdminReady: isSupabaseConfigured && hasServiceRoleKey,
      midtransConnected: isMidtransConfigured,
      otpVerification: true,
      googleConnected: isGoogleConfigured,
    },
    otp: {
      ...otpRuntimeInfo(),
      delivery: describeOtpDelivery(),
    },
  });
});

// Routes
// OTP verification lives under /api/v1/auth per otpplan.md §4.1.
// The same router is also mounted at /api/auth so the existing frontend
// and any older integrations keep working unchanged.
app.use('/api/v1/auth', authRouter);
app.use('/api/auth', authRouter);
// Google OAuth owns /google and /google/callback, so it coexists with the
// auth router above without shadowing any of its paths.
app.use('/api/v1/auth', googleAuthRouter);
app.use('/api/auth', googleAuthRouter);
app.use('/api/subscription', subscriptionRouter);
app.use('/api/midtrans', midtransRouter);

// Global Error Handler
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`[costKu API] Server running at http://localhost:${PORT}`);
  console.log(
    `[costKu API] OTP channel: ${describeOtpDelivery().effectiveSender} ` +
      `(configured: ${describeOtpDelivery().configuredChannel})`
  );
  console.log(
    isGoogleConfigured
      ? `[costKu API] Google OAuth ready. Redirect URI: ${googleRedirectUri}`
      : '[costKu API] Google OAuth disabled — set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.'
  );

  if (isSupabaseConfigured && !hasServiceRoleKey) {
    console.warn(
      '[costKu API] ⚠ SUPABASE_SERVICE_ROLE_KEY belum diisi. Supabase admin API tidak dapat dipakai, ' +
        'jadi endpoint register/verify/resend OTP berjalan di penyimpanan lokal dalam memori, ' +
        'dan login Google akan memakai sesi lokal (bukan sesi Supabase asli). ' +
        'Isi service role key untuk memakai auth.users.'
    );
  }

  registerCleanupJobs();
});
