import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';
import { sendValidationError, EMAIL_RE, PHONE_RE } from './otpError.js';

/**
 * Express middleware to validate request body using a Zod schema.
 * Replaces req.body with the sanitized/parsed data upon success.
 */
export function validateBody<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      const issues = result.error.issues.map((e) => ({
        field: e.path.join('.') || 'body',
        message: e.message,
      }));
      return sendValidationError(res, issues);
    }
    req.body = result.data;
    next();
  };
}

/* ──────────────────────────────────────────────────────────
   Predefined Zod Schemas for Common Auth & Input Flows
   ────────────────────────────────────────────────────────── */

export const registerSchema = z.object({
  name: z.string().trim().max(100, 'Nama maksimal 100 karakter.').optional(),
  email: z
    .string()
    .trim()
    .min(1, 'Email wajib diisi.')
    .regex(EMAIL_RE, 'Alamat email tidak valid.')
    .toLowerCase(),
  phone: z
    .string()
    .trim()
    .regex(PHONE_RE, 'Nomor HP tidak valid (format internasional, mis. +62812...).')
    .optional()
    .nullable(),
  password: z
    .string()
    .min(12, 'Kata sandi minimal 12 karakter.')
    .max(128, 'Kata sandi maksimal 128 karakter.'),
});

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Email wajib diisi.')
    .toLowerCase(),
  password: z
    .string()
    .min(1, 'Kata sandi wajib diisi.'),
});

export const verifyOtpSchema = z.object({
  email: z.string().trim().regex(EMAIL_RE, 'Format email tidak valid.').optional(),
  phone: z.string().trim().regex(PHONE_RE, 'Format nomor HP tidak valid.').optional(),
  code: z.string().trim().regex(/^\d{4,10}$/, 'Kode OTP harus berupa digit angka.'),
});

export const resendOtpSchema = z.object({
  email: z.string().trim().regex(EMAIL_RE, 'Format email tidak valid.').optional(),
  phone: z.string().trim().regex(PHONE_RE, 'Format nomor HP tidak valid.').optional(),
});

export const nlpParseSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, 'Teks transaksi wajib diisi.')
    .max(1000, 'Teks transaksi maksimal 1000 karakter.'),
});
