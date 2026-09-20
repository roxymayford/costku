/**
 * OTP constants — purpose, channel, and the canonical error codes
 * from otpplan.md §4.2.
 */

export const OtpPurpose = {
  REGISTER: 'REGISTER',
  RESET_PASSWORD: 'RESET_PASSWORD',
} as const;

export type OtpPurposeType = (typeof OtpPurpose)[keyof typeof OtpPurpose];

export const OtpChannel = {
  EMAIL: 'EMAIL',
  SMS: 'SMS',
  WHATSAPP: 'WHATSAPP',
} as const;

export type OtpChannelType = (typeof OtpChannel)[keyof typeof OtpChannel];

export const UserStatus = {
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
} as const;

export type UserStatusType = (typeof UserStatus)[keyof typeof UserStatus];

/**
 * Machine-readable error codes. Each maps to a fixed HTTP status so
 * the API envelope stays predictable for clients.
 */
export const OtpErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  OTP_INVALID: 'OTP_INVALID',
  OTP_EXPIRED: 'OTP_EXPIRED',
  USER_ALREADY_VERIFIED: 'USER_ALREADY_VERIFIED',
  OTP_MAX_ATTEMPTS: 'OTP_MAX_ATTEMPTS',
  OTP_RESEND_COOLDOWN: 'OTP_RESEND_COOLDOWN',
  OTP_RATE_LIMITED: 'OTP_RATE_LIMITED',
  OTP_DELIVERY_FAILED: 'OTP_DELIVERY_FAILED',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type OtpErrorCodeType = (typeof OtpErrorCode)[keyof typeof OtpErrorCode];

export const OTP_ERROR_STATUS: Record<OtpErrorCodeType, number> = {
  VALIDATION_ERROR: 400,
  OTP_INVALID: 400,
  OTP_EXPIRED: 400,
  USER_ALREADY_VERIFIED: 409,
  OTP_MAX_ATTEMPTS: 429,
  OTP_RESEND_COOLDOWN: 429,
  OTP_RATE_LIMITED: 429,
  OTP_DELIVERY_FAILED: 503,
  USER_NOT_FOUND: 404,
  INTERNAL_ERROR: 500,
};

/** Human-readable Indonesian messages, matching the tone of the app. */
export const OTP_ERROR_MESSAGE: Record<OtpErrorCodeType, string> = {
  VALIDATION_ERROR: 'Input tidak valid.',
  OTP_INVALID: 'Kode OTP salah.',
  OTP_EXPIRED: 'Kode OTP sudah kedaluwarsa. Silakan minta kode baru.',
  USER_ALREADY_VERIFIED: 'Akun ini sudah aktif.',
  OTP_MAX_ATTEMPTS: 'Terlalu banyak percobaan. Silakan minta kode baru.',
  OTP_RESEND_COOLDOWN: 'Mohon tunggu sebelum meminta kode baru.',
  OTP_RATE_LIMITED: 'Terlalu banyak permintaan kode. Coba lagi nanti.',
  OTP_DELIVERY_FAILED: 'Gagal mengirim kode verifikasi. Silakan coba lagi.',
  USER_NOT_FOUND: 'Permintaan verifikasi tidak ditemukan.',
  INTERNAL_ERROR: 'Terjadi kesalahan pada server.',
};

export const REDIS_KEYS = {
  cooldown: (userId: string) => `otp:cooldown:${userId}`,
  otp: (userId: string, purpose: string) => `otp:${purpose.toLowerCase()}:${userId}`,
  rateDest: (destination: string) => `otp:dest:${destination.toLowerCase()}`,
  rateIp: (ip: string) => `otp:ip:${ip}`,
} as const;
