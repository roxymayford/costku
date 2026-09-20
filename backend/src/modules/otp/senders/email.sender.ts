/**
 * EmailOtpSender — delivers the OTP over SMTP via Nodemailer.
 *
 * Nodemailer is imported dynamically so the project still runs when the
 * package is not installed (the factory falls back to the console
 * sender in that case).
 */

import { OtpChannel } from '../otp.constants.js';
import {
  OtpSendPayload,
  OtpSendResult,
  OtpSender,
  buildOtpEmailHtml,
  buildOtpEmailSubject,
  buildOtpMessage,
} from './otp-sender.interface.js';

interface Mailer {
  sendMail(options: Record<string, unknown>): Promise<{ messageId?: string }>;
}

let transporter: Mailer | null = null;
let initialized = false;

function readSmtpConfig() {
  return {
    host: process.env.SMTP_HOST || '',
    port: Number.parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.OTP_EMAIL_FROM || process.env.SMTP_USER || 'no-reply@fatrack.id',
    fromName: process.env.OTP_EMAIL_FROM_NAME || 'FATrack',
  };
}

export function isSmtpConfigured(): boolean {
  const cfg = readSmtpConfig();
  return Boolean(cfg.host && cfg.user && cfg.pass);
}

async function getTransporter(): Promise<Mailer | null> {
  if (initialized) return transporter;
  initialized = true;

  if (!isSmtpConfigured()) return null;

  try {
    const mod: any = await import('nodemailer');
    const nodemailer = mod.default ?? mod;
    const cfg = readSmtpConfig();

    transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.pass },
    }) as Mailer;

    console.log(`[OTP EmailSender] SMTP transport ready (${cfg.host}:${cfg.port}).`);
  } catch (err) {
    console.warn(
      '[OTP EmailSender] nodemailer unavailable — install it with `npm i nodemailer`. ' +
        `Reason: ${(err as Error).message}`
    );
    transporter = null;
  }

  return transporter;
}

export class EmailOtpSender implements OtpSender {
  readonly channel = OtpChannel.EMAIL;

  isConfigured(): boolean {
    return isSmtpConfigured();
  }

  async send(payload: OtpSendPayload): Promise<OtpSendResult> {
    if (!isSmtpConfigured()) {
      return {
        ok: false,
        error: 'SMTP belum dikonfigurasi (SMTP_HOST / SMTP_USER / SMTP_PASS).',
      };
    }

    const mailer = await getTransporter();
    if (!mailer) {
      return { ok: false, error: 'Transport email tidak tersedia.' };
    }

    const cfg = readSmtpConfig();

    try {
      const info = await mailer.sendMail({
        from: `"${cfg.fromName}" <${cfg.from}>`,
        to: payload.destination,
        subject: buildOtpEmailSubject(),
        text: buildOtpMessage(payload.code, payload.ttlMinutes),
        html: buildOtpEmailHtml(payload.code, payload.ttlMinutes, payload.recipientName),
      });
      return { ok: true, providerMessageId: info?.messageId };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }
}
