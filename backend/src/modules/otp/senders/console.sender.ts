/**
 * ConsoleOtpSender — development / fallback sender.
 *
 * Writes the OTP to the server log so the flow can be exercised without
 * any provider credentials. It refuses to operate in production unless
 * OTP_ALLOW_CONSOLE_IN_PRODUCTION is explicitly truthy.
 */

import { OtpChannel } from '../otp.constants.js';
import { redactCodes } from '../otp.crypto.js';
import {
  OtpSendPayload,
  OtpSendResult,
  OtpSender,
  buildOtpMessage,
} from './otp-sender.interface.js';

export class ConsoleOtpSender implements OtpSender {
  readonly channel = OtpChannel.EMAIL;

  isConfigured(): boolean {
    return true;
  }

  async send(payload: OtpSendPayload): Promise<OtpSendResult> {
    if (
      process.env.NODE_ENV === 'production' &&
      process.env.OTP_ALLOW_CONSOLE_IN_PRODUCTION !== 'true'
    ) {
      return {
        ok: false,
        error:
          'Console sender dinonaktifkan di produksi. Konfigurasikan SMTP atau provider lain.',
      };
    }

    const line = buildOtpMessage(payload.code, payload.ttlMinutes);

    console.log(
      [
        '',
        '┌──────────────────────────────────────────────────────────────',
        '│  OTP DEV DELIVERY (tidak dikirim ke pengguna)',
        `│  channel     : ${payload.channel ?? this.channel}`,
        `│  destination : ${payload.destination}`,
        `│  message     : ${line}`,
        `│  expires in  : ${payload.ttlMinutes} menit`,
        '└──────────────────────────────────────────────────────────────',
        '',
      ].join('\n')
    );

    return { ok: true, providerMessageId: `console-${Date.now()}` };
  }
}

/**
 * Guards the rest of the app: a single place that decides whether a
 * log line containing a code is acceptable. Used by the logger wrapper.
 */
export function safeLog(message: string): void {
  console.log(redactCodes(message));
}
