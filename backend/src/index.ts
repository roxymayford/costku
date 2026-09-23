import dns from 'node:dns';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Force Node.js to resolve IPv4 first on Windows/dual-stack networks
// Prevents intermittent 10-second connect timeouts (UND_ERR_CONNECT_TIMEOUT) to Google and Supabase
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {
  // Ignore on older Node runtimes
}
import { authRouter } from './routes/auth.js';
import { googleAuthRouter } from './routes/googleAuth.js';
import { subscriptionRouter } from './routes/subscription.js';
import { midtransRouter } from './routes/midtrans.js';
import { nlpRouter } from './routes/nlp.js';
import { incomesRouter } from './routes/incomes.js';
import { liabilitiesRouter } from './routes/liabilities.js';
import { errorHandler } from './middleware/errorHandler.js';
import { isSupabaseConfigured, hasServiceRoleKey } from './lib/supabase.js';
import { isMidtransConfigured } from './lib/midtrans.js';
import { isGoogleConfigured, googleRedirectUri } from './lib/google.js';
import { describeOtpDelivery, otpRuntimeInfo } from './modules/otp/index.js';
import { nlpModuleInfo, initializeNlpParser, getMlServiceUrl, isMlClassifierEnabled } from './modules/nlp/index.js';
import { registerCleanupJobs } from './modules/jobs/cleanup-otp.job.js';
import { registerLiabilityJobs } from './modules/jobs/liability-payment.job.js';

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
      nlpTransactionParser: true,
      incomeTracker: true,
    },
    otp: {
      ...otpRuntimeInfo(),
      delivery: describeOtpDelivery(),
    },
    nlp: nlpModuleInfo(),
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
app.use('/api/v1/nlp', nlpRouter);
app.use('/api/nlp', nlpRouter);
app.use('/api/v1/incomes', incomesRouter);
app.use('/api/incomes', incomesRouter);
app.use('/api/v1/liabilities', liabilitiesRouter);
app.use('/api/liabilities', liabilitiesRouter);

// Global Error Handler
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`[costKu API] Server running at http://localhost:${PORT}`);
  console.log(
    `[costKu API] OTP channel: ${describeOtpDelivery().effectiveSender} ` +
      `(configured: ${describeOtpDelivery().configuredChannel})`
  );
  console.log(
    `[costKu API] ML Microservice: ${
      isMlClassifierEnabled()
        ? `Enabled -> ${getMlServiceUrl()} (with automatic rule-based fallback)`
        : 'Disabled (rule-based only)'
    }`
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
  registerLiabilityJobs();

  // Dictionary bootstrap is best-effort: until it resolves (or if it fails)
  // the NLP parser runs on the seed lexicons, which is Fase 1's baseline.
  void initializeNlpParser()
    .then((bundle) => {
      console.log(
        `[costKu API] NLP parser ready — ${bundle.keywords.length} keywords, ` +
          `${Object.keys(bundle.slang).length} slang entries, ${bundle.products.length} products ` +
          `(slang: ${bundle.loadedFrom.slang}, keywords: ${bundle.loadedFrom.keywords}, products: ${bundle.loadedFrom.products}).`
      );
    })
    .catch((err: unknown) => {
      console.warn('[costKu API] NLP dictionary bootstrap failed, using seed lexicons:', err);
    });
});
