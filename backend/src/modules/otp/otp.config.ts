/**
 * OTP configuration, read from environment variables.
 * Mirrors otpplan.md §6.
 */

import { OtpChannel, OtpChannelType } from './otp.constants.js';

function readInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readChannel(): OtpChannelType {
  const raw = (process.env.OTP_CHANNEL || 'EMAIL').toUpperCase();
  const allowed = Object.values(OtpChannel) as string[];
  if (!allowed.includes(raw)) return OtpChannel.EMAIL;
  return raw as OtpChannelType;
}

export const otpConfig = {
  /** Panjang kode (OTP_LENGTH) */
  get length(): number {
    return Math.min(Math.max(readInt('OTP_LENGTH', 6), 4), 10);
  },

  /** Masa berlaku dalam detik (OTP_TTL_SECONDS) */
  get ttlSeconds(): number {
    return readInt('OTP_TTL_SECONDS', 300);
  },

  /** Maks. percobaan verifikasi per OTP (OTP_MAX_ATTEMPTS) */
  get maxAttempts(): number {
    return readInt('OTP_MAX_ATTEMPTS', 5);
  },

  /** Jeda minimal resend dalam detik (OTP_RESEND_COOLDOWN_SECONDS) */
  get resendCooldownSeconds(): number {
    return readInt('OTP_RESEND_COOLDOWN_SECONDS', 60);
  },

  /** Batas permintaan per jam per tujuan (OTP_MAX_REQUESTS_PER_HOUR_DEST) */
  get maxRequestsPerHourPerDestination(): number {
    return readInt('OTP_MAX_REQUESTS_PER_HOUR_DEST', 5);
  },

  /** Batas permintaan per jam per IP (OTP_MAX_REQUESTS_PER_HOUR_IP) */
  get maxRequestsPerHourPerIp(): number {
    return readInt('OTP_MAX_REQUESTS_PER_HOUR_IP', 10);
  },

  /** Kanal aktif (OTP_CHANNEL) */
  get channel(): OtpChannelType {
    return readChannel();
  },

  /** TTL user yang belum verifikasi, dalam hari (UNVERIFIED_USER_TTL_DAYS) */
  get unverifiedUserTtlDays(): number {
    return readInt('UNVERIFIED_USER_TTL_DAYS', 3);
  },

  /** Retry maksimum untuk job pengiriman OTP */
  get sendRetryAttempts(): number {
    return readInt('OTP_SEND_RETRY_ATTEMPTS', 3);
  },

  /** Base delay exponential backoff untuk retry pengiriman (ms) */
  get sendRetryBaseDelayMs(): number {
    return readInt('OTP_SEND_RETRY_BASE_DELAY_MS', 1500);
  },

  /** Redis URL — bila kosong, rate limiter jatuh ke penyimpanan in-memory */
  get redisUrl(): string {
    return process.env.REDIS_URL || '';
  },
} as const;
