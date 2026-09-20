/**
 * OtpSender contract (otpplan.md §4.7).
 *
 * Every delivery channel implements this interface, so the core OTP
 * logic never depends on a specific provider.
 */

import { OtpChannelType } from '../otp.constants.js';

export interface OtpSendPayload {
  /** Masked-friendly raw destination (email address or phone number). */
  destination: string;
  /** Plaintext code. Never logged, never persisted. */
  code: string;
  /** Validity window, in minutes — shown in the message body. */
  ttlMinutes: number;
  /** Optional display name for greeting the user. */
  recipientName?: string | null;
  /** Channel the OTP is being delivered over. */
  channel?: OtpChannelType;
}

export interface OtpSendResult {
  ok: boolean;
  /** Provider message id, when the provider returns one. */
  providerMessageId?: string;
  /** Human-readable failure reason. */
  error?: string;
}

export interface OtpSender {
  readonly channel: OtpChannelType;
  /** Whether this sender has the credentials it needs to operate. */
  isConfigured(): boolean;
  send(payload: OtpSendPayload): Promise<OtpSendResult>;
}

/** Shared message template (otpplan.md §4.7). */
export function buildOtpMessage(code: string, ttlMinutes: number): string {
  return `Kode verifikasi Anda: ${code}. Berlaku ${ttlMinutes} menit. Jangan bagikan kode ini kepada siapa pun.`;
}

export function buildOtpEmailSubject(): string {
  return 'Kode Verifikasi Akun FATrack';
}

/** Minimal HTML body for the email channel — Swiss-style, no remote assets. */
export function buildOtpEmailHtml(
  code: string,
  ttlMinutes: number,
  recipientName?: string | null
): string {
  const greeting = recipientName ? `Halo ${escapeHtml(recipientName)},` : 'Halo,';
  return `<!doctype html>
<html lang="id">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f3f1;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f3f1;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:520px;background:#ffffff;border:1px solid #111111;">
        <tr><td style="padding:20px 24px;border-bottom:1px solid #111111;">
          <span style="font-family:Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#e8420b;">FATrack</span>
          <span style="font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#6e6e6e;">&nbsp;/&nbsp;Verifikasi Akun</span>
        </td></tr>
        <tr><td style="padding:28px 24px 8px;">
          <p style="margin:0 0 18px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#111111;">${greeting}</p>
          <p style="margin:0 0 20px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#3a3a3a;">
            Gunakan kode berikut untuk menyelesaikan verifikasi akun Anda.
          </p>
          <div style="border:1px solid #111111;padding:18px 20px;text-align:center;margin-bottom:20px;">
            <div style="font-family:Helvetica,Arial,sans-serif;font-size:34px;font-weight:700;letter-spacing:.28em;color:#111111;font-variant-numeric:tabular-nums;">${escapeHtml(code)}</div>
          </div>
          <p style="margin:0 0 22px;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#6e6e6e;">
            Kode ini berlaku <strong style="color:#111111;">${ttlMinutes} menit</strong> dan hanya dapat dipakai satu kali.
            Jangan bagikan kode ini kepada siapa pun.
          </p>
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid #d3d2ce;background:#f4f3f1;">
          <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:1.5;color:#6e6e6e;">
            Jika Anda tidak merasa membuat akun FATrack, abaikan email ini.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
