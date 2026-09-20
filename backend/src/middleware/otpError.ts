/**
 * Error envelope helper (otpplan.md §4.2).
 *
 * Every OTP-related failure responds with the same shape:
 *   { "error": { "code": "...", "message": "...", ...extras } }
 *
 * Keeping this in one place is what lets the frontend branch on
 * `error.code` without per-endpoint parsing.
 */

import { Response } from 'express';
import {
  OtpError,
  OtpErrorCode,
  OtpErrorCodeType,
  OTP_ERROR_MESSAGE,
  OTP_ERROR_STATUS,
} from '../modules/otp/index.js';

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    [key: string]: unknown;
  };
}

/** Send a formatted error envelope. Returns the response for chaining. */
export function sendOtpError(
  res: Response,
  code: OtpErrorCodeType,
  extras: Record<string, unknown> = {}
): Response {
  const status = OTP_ERROR_STATUS[code] ?? 500;
  const body: ErrorEnvelope = {
    error: {
      code,
      message: OTP_ERROR_MESSAGE[code] ?? 'Terjadi kesalahan.',
      ...extras,
    },
  };
  return res.status(status).json(body);
}

/** Convert a caught OtpError into a response, or fall through. */
export function handleOtpError(res: Response, err: unknown): Response {
  if (err instanceof OtpError) {
    return sendOtpError(res, err.code, err.extra);
  }
  console.error('[OTP Endpoint Error]:', err);
  return sendOtpError(res, OtpErrorCode.INTERNAL_ERROR);
}

/* ──────────────────────────────────────────────────────────
   Input validation — VALIDATION_ERROR
   ────────────────────────────────────────────────────────── */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const PHONE_RE = /^\+?[1-9]\d{6,14}$/;
export const CODE_RE = /^\d{4,10}$/;

export interface ValidationIssue {
  field: string;
  message: string;
}

export function sendValidationError(res: Response, issues: ValidationIssue[]): Response {
  return sendOtpError(res, OtpErrorCode.VALIDATION_ERROR, {
    message: issues[0]?.message ?? OTP_ERROR_MESSAGE.VALIDATION_ERROR,
    issues,
  });
}

/** Extract the caller's IP, honouring proxy headers. */
export function resolveClientIp(req: {
  headers: Record<string, unknown>;
  ip?: string;
  socket?: { remoteAddress?: string };
}): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return String(forwarded[0]).split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || '0.0.0.0';
}
