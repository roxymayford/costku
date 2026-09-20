/**
 * OTP sender factory.
 *
 * Resolves the sender for the configured OTP_CHANNEL, falling back to
 * the console sender whenever the requested provider has no credentials.
 * The rest of the app only ever talks to the OtpSender interface.
 */

import { OtpChannel, OtpChannelType } from '../otp.constants.js';
import { isSmtpConfigured, EmailOtpSender } from './email.sender.js';
import { ConsoleOtpSender } from './console.sender.js';
import type { OtpSender } from './otp-sender.interface.js';
import { otpConfig } from '../otp.config.js';

let cached: OtpSender | null = null;

/**
 * Build the sender for a channel. SMS and WhatsApp are intentionally
 * declared but not wired to a provider yet — the interface is the
 * extension point (otpplan.md §4.7). Requests for them fall back to
 * console delivery so nothing silently breaks.
 */
function buildSender(channel: OtpChannelType): OtpSender {
  switch (channel) {
    case OtpChannel.EMAIL:
      if (isSmtpConfigured()) return new EmailOtpSender();
      console.warn(
        '[OTP Sender] OTP_CHANNEL=EMAIL but SMTP is not configured. ' +
          'Falling back to console delivery (development only).'
      );
      return new ConsoleOtpSender();

    case OtpChannel.SMS:
    case OtpChannel.WHATSAPP:
      console.warn(
        `[OTP Sender] Channel ${channel} has no provider implementation yet. ` +
          'Falling back to console delivery. Implement SmsOtpSender/WhatsappOtpSender ' +
          'against the OtpSender interface to enable it.'
      );
      return new ConsoleOtpSender();

    default:
      return new ConsoleOtpSender();
  }
}

/** The active sender for this process. */
export function getOtpSender(): OtpSender {
  if (!cached) {
    cached = buildSender(otpConfig.channel);
  }
  return cached;
}

/**
 * A sender pinned to a specific channel — used when an OTP row records
 * a channel that differs from the current default.
 */
export function getOtpSenderForChannel(channel: OtpChannelType): OtpSender {
  if (channel === otpConfig.channel && cached) return cached;
  return buildSender(channel);
}

/** Describe the effective delivery setup, for the health endpoint. */
export function describeOtpDelivery(): {
  configuredChannel: OtpChannelType;
  effectiveSender: string;
  smtpConfigured: boolean;
} {
  const sender = getOtpSender();
  return {
    configuredChannel: otpConfig.channel,
    effectiveSender: sender instanceof EmailOtpSender ? 'EMAIL_SMTP' : 'CONSOLE',
    smtpConfigured: isSmtpConfigured(),
  };
}

export type { OtpSender };
