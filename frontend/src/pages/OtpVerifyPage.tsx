import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Icon } from '../components/Icon';
import {
  clearPendingVerification,
  describeFailure,
  isSuccess,
  loadPendingVerification,
  requestResendOtp,
  requestVerifyOtp,
  savePendingVerification,
  type PendingVerification,
} from '../lib/otpApi';

const CODE_LENGTH = 6;

type Notice = { tone: 'error' | 'info' | 'success'; text: string } | null;

/** mm:ss for a countdown, or null when it has elapsed. */
function formatCountdown(secondsLeft: number): string {
  const m = Math.floor(secondsLeft / 60);
  const s = secondsLeft % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const OtpVerifyPage: React.FC = () => {
  const navigate = useNavigate();
  const { adoptSession } = useAuth();

  const [pending, setPending] = useState<PendingVerification | null>(() => loadPendingVerification());
  const [digits, setDigits] = useState<string[]>(() => Array(CODE_LENGTH).fill(''));
  const [notice, setNotice] = useState<Notice>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const [now, setNow] = useState(() => Date.now());
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  /* ---- redirect out when there is nothing to verify ---- */
  useEffect(() => {
    if (!pending) {
      navigate('/auth?mode=register', { replace: true });
    }
  }, [pending, navigate]);

  /* ---- one clock for both countdowns ---- */
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const code = useMemo(() => digits.join(''), [digits]);
  const isComplete = code.length === CODE_LENGTH && /^\d+$/.test(code);

  /* ---- derived countdowns ---- */
  const { expiryLeft, resendLeft } = useMemo(() => {
    if (!pending) return { expiryLeft: 0, resendLeft: 0 };
    const elapsed = Math.floor((now - pending.startedAt) / 1000);
    const startedResendCountdown = pending.resendAvailableInSeconds;
    return {
      expiryLeft: Math.max(0, pending.expiresInSeconds - elapsed),
      resendLeft: Math.max(0, startedResendCountdown - elapsed),
    };
  }, [pending, now]);

  const isExpired = expiryLeft === 0;

  /* ---- focus the first empty box on mount / rehydrate ---- */
  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, [pending?.userId]);

  /* ---- clearing a code once it expires ---- */
  useEffect(() => {
    if (isExpired && pending) {
      setNotice({
        tone: 'info',
        text: 'Kode sudah kedaluwarsa. Minta kode baru untuk melanjutkan.',
      });
    }
  }, [isExpired, pending]);

  /* ══════════════════════════════════════════════════════
     Input handling — auto-advance, backspace, paste
     ══════════════════════════════════════════════════════ */
  const setDigitAt = useCallback((index: number, value: string) => {
    setDigits((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  const handleChange = (index: number, raw: string) => {
    const value = raw.replace(/\D/g, '');
    if (!value) return;

    // Typing into a box with existing content replaces that digit.
    if (value.length === 1) {
      setDigitAt(index, value);
      if (index < CODE_LENGTH - 1) inputsRef.current[index + 1]?.focus();
      return;
    }

    // Multi-digit input (autofill / fast typing) spills into following boxes.
    const chars = value.slice(0, CODE_LENGTH - index).split('');
    setDigits((prev) => {
      const next = [...prev];
      chars.forEach((c, offset) => {
        next[index + offset] = c;
      });
      return next;
    });
    const lastIndex = Math.min(index + chars.length, CODE_LENGTH - 1);
    inputsRef.current[lastIndex]?.focus();
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (digits[index]) {
        setDigitAt(index, '');
      } else if (index > 0) {
        setDigitAt(index - 1, '');
        inputsRef.current[index - 1]?.focus();
      }
      return;
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      inputsRef.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowRight' && index < CODE_LENGTH - 1) {
      e.preventDefault();
      inputsRef.current[index + 1]?.focus();
    }
    if (e.key === 'Enter' && isComplete && !isVerifying) {
      e.preventDefault();
      void handleVerify();
    }
  };

  const handlePaste = (index: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '');
    if (!pasted) return;
    const chars = pasted.slice(0, CODE_LENGTH - index).split('');
    setDigits((prev) => {
      const next = [...prev];
      chars.forEach((c, offset) => {
        next[index + offset] = c;
      });
      return next;
    });
    const lastIndex = Math.min(index + chars.length, CODE_LENGTH - 1);
    inputsRef.current[lastIndex]?.focus();
  };

  /* ══════════════════════════════════════════════════════
     Submit
     ══════════════════════════════════════════════════════ */
  const handleVerify = async () => {
    if (!pending || !isComplete || isVerifying) return;

    setIsVerifying(true);
    setNotice(null);

    const result = await requestVerifyOtp(pending.userId, code);

    if (isSuccess(result)) {
      // The account is active — hand the session to AuthContext and continue.
      adoptSession(
        { id: pending.userId, email: pending.email, name: undefined },
        result.accessToken,
        result.refreshToken
      );
      clearPendingVerification();
      setNotice({ tone: 'success', text: 'Verifikasi berhasil. Mengalihkan…' });
      window.setTimeout(() => navigate('/onboarding', { replace: true }), 700);
      return;
    }

    setIsVerifying(false);

    // A burned OTP cannot be retried — clear the boxes and route to resend.
    if (result.code === 'OTP_MAX_ATTEMPTS' || result.code === 'OTP_EXPIRED') {
      setDigits(Array(CODE_LENGTH).fill(''));
      inputsRef.current[0]?.focus();
    }

    // Already active (e.g. verified in another tab) — just proceed.
    if (result.code === 'USER_ALREADY_VERIFIED') {
      adoptSession({ id: pending.userId, email: pending.email, name: undefined }, `demo-${pending.userId}`,
        '');
      clearPendingVerification();
      navigate('/onboarding', { replace: true });
      return;
    }

    setNotice({ tone: 'error', text: describeFailure(result) });
  };

  const handleResend = async () => {
    if (!pending || isResending || resendLeft > 0) return;

    setIsResending(true);
    setNotice(null);

    const result = await requestResendOtp(pending.userId);

    if (isSuccess(result)) {
      const refreshed: PendingVerification = {
        ...pending,
        expiresInSeconds: result.expiresInSeconds,
        resendAvailableInSeconds: result.resendAvailableInSeconds,
        startedAt: Date.now(),
      };
      setPending(refreshed);
      savePendingVerification(refreshed);
      setDigits(Array(CODE_LENGTH).fill(''));
      inputsRef.current[0]?.focus();
      setNotice({ tone: 'info', text: `Kode baru telah dikirim ke ${result.otp.destination}.` });
    } else {
      setNotice({ tone: 'error', text: describeFailure(result) });
    }

    setIsResending(false);
  };

  const handleChangeEmail = () => {
    clearPendingVerification();
    navigate('/auth?mode=register', { replace: true });
  };

  if (!pending) return null;

  /* ══════════════════════════════════════════════════════
     Render
     ══════════════════════════════════════════════════════ */
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <button className="auth-brand" type="button" onClick={() => navigate('/')}>
          <span className="avatar">FA</span>
          <b>FATRACK</b>
          <i>/</i>
          <span>PERSONAL FINANCE ADVISOR</span>
        </button>

        <div className="auth-card otp-card">
          <small className="accent">03 / VERIFIKASI KODE OTP</small>
          <h1>MASUKKAN 6 DIGIT KODE.</h1>
          <p>
            Kami mengirim kode verifikasi ke <b>{pending.destination}</b>. Kode berlaku{' '}
            <b>{formatCountdown(expiryLeft)}</b> dan hanya dapat dipakai satu kali.
          </p>

          {notice && (
            <div
              className={`auth-error-box otp-notice otp-notice--${notice.tone}`}
              role={notice.tone === 'error' ? 'alert' : 'status'}
            >
              {notice.tone === 'error' ? (
                <Icon name="alert" size={16} />
              ) : (
                <span className="otp-notice__dot" aria-hidden="true" />
              )}
              <span>{notice.text}</span>
            </div>
          )}

          {/* ---- the 6 code boxes ---- */}
          <div
            className="otp-input-row"
            role="group"
            aria-label="Kode verifikasi 6 digit"
            data-expired={isExpired ? 'true' : 'false'}
          >
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={(el) => {
                  inputsRef.current[index] = el;
                }}
                className="otp-input"
                type="text"
                inputMode="numeric"
                autoComplete={index === 0 ? 'one-time-code' : 'off'}
                maxLength={CODE_LENGTH}
                value={digit}
                placeholder="·"
                disabled={isVerifying || isExpired}
                aria-label={`Digit ke-${index + 1}`}
                onChange={(e) => handleChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onPaste={(e) => handlePaste(index, e)}
                onFocus={(e) => e.target.select()}
              />
            ))}
          </div>

          {/* ---- progress / expiry line ---- */}
          <div className="otp-meta">
            <span className="otp-meta__label">
              {isExpired ? 'KODE KEDALUWARSA' : 'SISA WAKTU'}
            </span>
            <span className={`otp-meta__value ${isExpired ? 'is-expired' : ''}`}>
              {isExpired ? '00:00' : formatCountdown(expiryLeft)}
            </span>
          </div>

          <button
            className="pill dark otp-submit"
            type="button"
            onClick={() => void handleVerify()}
            disabled={!isComplete || isVerifying || isExpired}
          >
            {isVerifying ? (
              'MEMVERIFIKASI...'
            ) : (
              <span className="inline-flex items-center gap-1.5">
                VERIFIKASI AKUN <Icon name="arrowRight" size={14} />
              </span>
            )}
          </button>

          {/* ---- resend row ---- */}
          <div className="otp-resend">
            <span>Belum menerima kode?</span>
            <button
              type="button"
              onClick={() => void handleResend()}
              disabled={resendLeft > 0 || isResending}
            >
              {isResending
                ? 'MENGIRIM...'
                : resendLeft > 0
                ? `KIRIM ULANG DALAM ${formatCountdown(resendLeft)}`
                : 'KIRIM ULANG KODE'}
            </button>
          </div>

          <p className="auth-switch">
            Salah alamat email?{' '}
            <button type="button" onClick={handleChangeEmail}>
              UBAH DATA REGISTRASI
            </button>
          </p>
        </div>

        <small className="auth-note">
          KODE DI-HASH DENGAN HMAC-SHA256 / TIDAK PERNAH DISIMPAN SEBAGAI TEKS BIASA
        </small>
      </section>

      <aside className="auth-aside">
        <small>PROSES AMAN SATU KALI PAKAI</small>
        <h2>
          SATU KODE.
          <br />
          SATU KALI PAKAI.
          <br />
          LIMA MENIT.
        </h2>
        <div>
          <b>01 / BATAS PERCOBAAN</b>
          <p>Kode hangus setelah 5 percobaan salah. Minta kode baru untuk melanjutkan.</p>
        </div>
        <div>
          <b>02 / JEDA PENGIRIMAN</b>
          <p>Kirim ulang dibatasi 60 detik untuk mencegah penyalahgunaan biaya pengiriman.</p>
        </div>
        <div>
          <b>03 / PENYIMPANAN AMAN</b>
          <p>Server hanya menyimpan hash kode. Kode asli tidak pernah ditulis ke log.</p>
        </div>
      </aside>
    </main>
  );
};

export default OtpVerifyPage;
