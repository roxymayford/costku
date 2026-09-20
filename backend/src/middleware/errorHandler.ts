import { Request, Response, NextFunction } from 'express';
import { OtpError, OTP_ERROR_MESSAGE, OTP_ERROR_STATUS } from '../modules/otp/index.js';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  extra?: Record<string, unknown>;
}

/**
 * Global error handler.
 *
 * OTP errors are emitted through the same envelope the OTP endpoints use
 * (otpplan.md §4.2) so a thrown OtpError from any layer still produces a
 * predictable client contract. Everything else keeps the app's original
 * status/statusCode/message shape.
 */
export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  /* ---- OTP-specific envelope ---- */
  if (err instanceof OtpError) {
    const status = OTP_ERROR_STATUS[err.code] ?? 500;
    // Never log the code — only the machine-readable reason.
    console.warn(`[OTP Error ${status}] ${err.code}`);
    res.status(status).json({
      error: {
        code: err.code,
        message: OTP_ERROR_MESSAGE[err.code] ?? err.message,
        ...err.extra,
      },
    });
    return;
  }

  /* ---- generic envelope ---- */
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  console.error(`[Error ${statusCode}]:`, err);

  res.status(statusCode).json({
    status: 'error',
    statusCode,
    message,
    timestamp: new Date().toISOString(),
  });
}
