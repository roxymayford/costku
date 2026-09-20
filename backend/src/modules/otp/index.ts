/**
 * OTP module barrel — the single import surface for everything OTP.
 */

export * from './otp.constants.js';
export * from './otp.config.js';
export * from './otp.crypto.js';
export * from './otp.repository.js';
export * from './otp.rate-limiter.js';
export {
  OtpError,
  issueOtp,
  verifyOtp,
  resendOtp,
  startRegistrationCooldown,
  otpRuntimeInfo,
  audit,
  setOtpAuditSink,
  type IssuedOtp,
  type OtpAuditEvent,
} from './otp.service.js';
export {
  enqueueSendOtp,
  runSendOtpJob,
  setSendOtpAuditHook,
  type SendOtpJobPayload,
} from './jobs/send-otp.job.js';
export {
  getOtpSender,
  getOtpSenderForChannel,
  describeOtpDelivery,
  type OtpSender,
} from './senders/index.js';
