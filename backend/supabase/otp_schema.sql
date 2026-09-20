-- ──────────────────────────────────────────────────────────
-- FATrack OTP Verification Schema
-- Implements the plan in otpplan.md §4.3
-- Run this in the Supabase SQL Editor (after schema.sql)
-- ──────────────────────────────────────────────────────────

-- ──────────────────────────────────────────────────────────
-- 1. profiles — user state for OTP verification
--    Supabase keeps the credential in auth.users; we only
--    track the verification lifecycle here.
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT,
  phone       TEXT,
  name        TEXT,
  status      TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',
              -- 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED'
  verified_at TIMESTAMPTZ NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT profiles_status_check
    CHECK (status IN ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED'))
);

CREATE INDEX IF NOT EXISTS idx_profiles_status      ON public.profiles(status);
CREATE INDEX IF NOT EXISTS idx_profiles_created_at  ON public.profiles(created_at);

-- Auto-create a PENDING_VERIFICATION profile whenever a user
-- is created in auth.users (applies to both our OTP register
-- flow and Supabase's own signup / OAuth flows).
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, status)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'name', 'Pengguna FATrack'),
    'PENDING_VERIFICATION'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

-- ──────────────────────────────────────────────────────────
-- 2. otp_codes — the OTP record itself (otpplan.md §4.3)
--    Stores an HMAC-SHA256 hash, never the plaintext code.
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.otp_codes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  purpose         VARCHAR(30)  NOT NULL DEFAULT 'REGISTER',
  channel         VARCHAR(10)  NOT NULL,            -- EMAIL | SMS | WHATSAPP
  destination     VARCHAR(255) NOT NULL,
  code_hash       CHAR(64)     NOT NULL,            -- HMAC-SHA256 hex, not plaintext
  expires_at      TIMESTAMPTZ  NOT NULL,
  attempts        SMALLINT     NOT NULL DEFAULT 0,
  max_attempts    SMALLINT     NOT NULL DEFAULT 5,
  consumed_at     TIMESTAMPTZ  NULL,
  invalidated_at  TIMESTAMPTZ  NULL,
  request_ip      INET         NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT otp_codes_channel_check
    CHECK (channel IN ('EMAIL', 'SMS', 'WHATSAPP')),
  CONSTRAINT otp_codes_attempts_check
    CHECK (attempts >= 0 AND max_attempts > 0)
);

-- Lookup path: latest active OTP for (user, purpose)
CREATE INDEX IF NOT EXISTS idx_otp_user_purpose_created
  ON public.otp_codes (user_id, purpose, created_at DESC);

-- Cleanup job path: delete everything past its expiry
CREATE INDEX IF NOT EXISTS idx_otp_expires_at
  ON public.otp_codes (expires_at);

-- ──────────────────────────────────────────────────────────
-- 3. Row Level Security
--    OTP rows are never read by clients — only by the backend
--    service role. RLS stays enabled with no policies for
--    anon/authenticated, so the table is fully locked down.
-- ──────────────────────────────────────────────────────────
ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Users may not flip their own status to ACTIVE — that is the
-- backend's job after a successful OTP verification. Service
-- role bypasses RLS, so it can still write.

-- ──────────────────────────────────────────────────────────
-- 4. Cleanup helpers (otpplan.md §8)
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cleanup_expired_otp_codes()
RETURNS integer AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.otp_codes
  WHERE expires_at < NOW() - INTERVAL '24 hours';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.cleanup_unverified_users(unverified_days integer DEFAULT 3)
RETURNS integer AS $$
DECLARE
  deleted_count integer;
BEGIN
  -- Deleting from auth.users cascades to profiles and otp_codes.
  DELETE FROM auth.users
  WHERE id IN (
    SELECT p.id
    FROM public.profiles p
    WHERE p.status = 'PENDING_VERIFICATION'
      AND p.created_at < NOW() - (unverified_days || ' days')::interval
  );
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
