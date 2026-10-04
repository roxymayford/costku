import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Icon } from '../components/Icon';
import logoSrc from '../assets/logo.png';
import {
  isSuccess,
  requestRegistration,
  savePendingVerification,
} from '../lib/otpApi';
import {
  PASSWORD_RULES,
  isStrongPassword,
  passwordStrength,
  strengthLabel,
  strengthColor,
} from '../lib/passwordStrength';

export const AuthPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get('mode') === 'register' ? 'register' : 'login';
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  /* ---- login attempt tracking ---- */
  const [loginRemainingAttempts, setLoginRemainingAttempts] = useState<number | null>(null);
  const [loginLockedUntil, setLoginLockedUntil] = useState<number | null>(null);
  const [lockCountdown, setLockCountdown] = useState(0);

  const { login, loginWithGoogle, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  /* ---- lockout countdown timer ---- */
  useEffect(() => {
    if (!loginLockedUntil) {
      setLockCountdown(0);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((loginLockedUntil - Date.now()) / 1000));
      setLockCountdown(remaining);
      if (remaining <= 0) {
        setLoginLockedUntil(null);
        setLoginRemainingAttempts(null);
        setErrorMsg(null);
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [loginLockedUntil]);

  const isLoginLocked = lockCountdown > 0;

  // Clear a field's error as soon as the user starts fixing it.
  const clearFieldError = (field: string) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  /* ---- password strength (register mode) ---- */
  const strength = useMemo(() => passwordStrength(password), [password]);
  const sLabel = useMemo(() => strengthLabel(strength), [strength]);
  const sColor = useMemo(() => strengthColor(strength), [strength]);
  const ruleResults = useMemo(
    () =>
      PASSWORD_RULES.map((rule) => ({
        ...rule,
        passed: rule.test(password),
      })),
    [password]
  );

  const validate = () => {
    const errors: Record<string, string> = {};
    if (mode === 'register' && !name.trim()) {
      errors.name = 'Nama tidak boleh kosong.';
    }
    if (!email.trim()) {
      errors.email = 'Email wajib diisi.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = 'Format email belum benar.';
    }
    if (!password) {
      errors.password = 'Kata sandi wajib diisi.';
    } else if (mode === 'register' && !isStrongPassword(password)) {
      errors.password = 'Kata sandi belum memenuhi semua persyaratan.';
    } else if (mode === 'login' && password.length < 6) {
      errors.password = 'Kata sandi minimal 6 karakter.';
    }
    if (phone && !/^\+?[0-9\s-]{8,}$/.test(phone.trim())) {
      errors.phone = 'Nomor HP belum valid.';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!validate()) return;
    if (isLoginLocked && mode === 'login') return;
    setIsSubmitting(true);

    try {
      if (mode === 'register') {
        const res = await requestRegistration({
          name: name || 'Pengguna costKu',
          email,
          password,
          phone: phone || undefined,
        });

        if (isSuccess(res)) {
          savePendingVerification({
            userId: res.userId,
            email,
            destination: res.otp.destination,
            expiresInSeconds: res.otp.expiresInSeconds,
            resendAvailableInSeconds: res.otp.resendAvailableInSeconds,
            startedAt: Date.now(),
          });
          navigate('/verify-otp');
        } else {
          setErrorMsg(res.message);
        }
      } else {
        const res = await login(email, password);
        if (res.error) {
          /* ---- parse rate-limit info from error ---- */
          const errorText = res.error;
          // Try to extract remaining attempts from the error message
          const attemptsMatch = errorText.match(/Sisa (\d+) percobaan/);
          const lockedMatch = errorText.match(/dikunci/i);

          if (attemptsMatch) {
            setLoginRemainingAttempts(parseInt(attemptsMatch[1], 10));
          }
          if (lockedMatch) {
            // Extract lockout time from message
            const minuteMatch = errorText.match(/(\d+) menit/);
            const secondMatch = errorText.match(/(\d+) detik/);
            const lockMs = minuteMatch
              ? parseInt(minuteMatch[1], 10) * 60 * 1000
              : secondMatch
              ? parseInt(secondMatch[1], 10) * 1000
              : 15 * 60 * 1000;
            setLoginLockedUntil(Date.now() + lockMs);
            setLoginRemainingAttempts(0);
          }

          setErrorMsg(errorText);
        } else {
          setLoginRemainingAttempts(null);
          setLoginLockedUntil(null);
          navigate('/dashboard');
        }
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Terjadi kesalahan sistem.');
    } finally {
      setIsSubmitting(false);
    }
  };


  const handleGoogle = async () => {
    setErrorMsg(null);
    setIsSubmitting(true);
    const res = await loginWithGoogle();
    if (res.error) {
      setErrorMsg(res.error);
      setIsSubmitting(false);
    }
    // On success with real Supabase, OAuth redirect occurs; demo mode falls through to dashboard via user effect
  };

  const formatLockCountdown = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <button className="auth-brand" type="button" onClick={() => navigate('/')}>
          <img src={logoSrc} alt="costKu" className="brand-logo" />
          <b>COSTKU</b>
          <i>/</i>
          <span>PENDAMPING KEUANGAN PRIBADI</span>
        </button>

        <div className="auth-card">
          <small className="accent">
            {mode === 'register' ? 'Langkah 1 dari 2' : 'Selamat datang kembali'}
          </small>
          <h1>{mode === 'register' ? 'Buat akun gratis' : 'Masuk ke akunmu'}</h1>
          <p>
            {mode === 'register'
              ? 'Cukup email aktif. Kami kirim kode 6 digit untuk memastikan akunmu aman.'
              : 'Lanjutkan memantau pengeluaran dan batas jajan harianmu.'}
          </p>

          {errorMsg && (
            <div className="auth-error-box" role="alert">
              <Icon name="alert" size={16} /> {errorMsg}
            </div>
          )}

          {/* ---- login lockout banner ---- */}
          {mode === 'login' && isLoginLocked && (
            <div className="auth-lockout-banner" role="alert">
              <Icon name="alert" size={18} />
              <div>
                <strong>Akun dikunci sementara</strong>
                <p>Terlalu banyak percobaan gagal. Coba lagi dalam <b>{formatLockCountdown(lockCountdown)}</b></p>
              </div>
            </div>
          )}

          {/* ---- login remaining attempts ---- */}
          {mode === 'login' && loginRemainingAttempts !== null && loginRemainingAttempts > 0 && !isLoginLocked && (
            <div className="auth-attempts-warning">
              <Icon name="alert" size={14} />
              <span>Sisa <b>{loginRemainingAttempts}</b> percobaan sebelum akun dikunci.</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            {mode === 'register' && (
              <label>
                Nama lengkap
                <input
                  type="text"
                  placeholder="Misal: Andi Pratama"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    clearFieldError('name');
                  }}
                  aria-invalid={!!fieldErrors.name}
                />
                {fieldErrors.name && <span className="field-error">{fieldErrors.name}</span>}
              </label>
            )}

            <label>
              Email
              <input
                type="email"
                placeholder="nama@email.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  clearFieldError('email');
                }}
                aria-invalid={!!fieldErrors.email}
                disabled={isLoginLocked && mode === 'login'}
              />
              {fieldErrors.email && <span className="field-error">{fieldErrors.email}</span>}
            </label>

            {mode === 'register' && (
              <label>
                Nomor HP <span className="auth-optional">(opsional)</span>
                <input
                  type="tel"
                  placeholder="+6281234567890"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    clearFieldError('phone');
                  }}
                  aria-invalid={!!fieldErrors.phone}
                />
                {fieldErrors.phone && <span className="field-error">{fieldErrors.phone}</span>}
              </label>
            )}

            <label>
              Kata sandi
              <input
                type="password"
                placeholder={mode === 'register' ? 'Buat kata sandi kuat' : 'Masukkan kata sandi'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  clearFieldError('password');
                }}
                aria-invalid={!!fieldErrors.password}
                disabled={isLoginLocked && mode === 'login'}
              />
              {fieldErrors.password && <span className="field-error">{fieldErrors.password}</span>}
            </label>

            {/* ---- password strength meter (register only) ---- */}
            {mode === 'register' && password.length > 0 && (
              <div className="pw-strength-section">
                <div className="pw-strength-bar-track">
                  <div
                    className="pw-strength-bar-fill"
                    style={{
                      width: `${strength * 100}%`,
                      background: sColor,
                    }}
                  />
                </div>
                <div className="pw-strength-label" style={{ color: sColor }}>
                  {sLabel}
                </div>
                <ul className="pw-rules-list">
                  {ruleResults.map((rule) => (
                    <li key={rule.id} className={rule.passed ? 'pw-rule-pass' : 'pw-rule-fail'}>
                      <span className="pw-rule-icon">{rule.passed ? '✓' : '✗'}</span>
                      {rule.label}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button
              className="pill dark auth-submit-btn"
              type="submit"
              disabled={isSubmitting || (isLoginLocked && mode === 'login')}
            >
              {isSubmitting
                ? 'Memproses…'
                : mode === 'register'
                ? <span className="inline-flex items-center gap-1.5">Daftar &amp; Kirim Kode <Icon name="arrowRight" size={14} /></span>
                : <span className="inline-flex items-center gap-1.5">Masuk <Icon name="arrowRight" size={14} /></span>}
            </button>
          </form>

          <div className="auth-or-divider">
            <span>atau</span>
          </div>

          <button
            type="button"
            className="auth-google-btn"
            onClick={handleGoogle}
            disabled={isSubmitting || isLoginLocked}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M21.8 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.5a4.7 4.7 0 0 1-2 3.1v2.6h3.3a10 10 0 0 0 3-7.7Z" fill="#4285F4" />
              <path d="M12 22c2.7 0 5-.9 6.7-2.5l-3.3-2.6c-.9.6-2 .9-3.4.9a5.9 5.9 0 0 1-5.5-4H3.1v2.7A10 10 0 0 0 12 22Z" fill="#34A853" />
              <path d="M6.5 13.8a6 6 0 0 1 0-3.6V7.5H3.1a10 10 0 0 0 0 9l3.4-2.7Z" fill="#FBBC05" />
              <path d="M12 6.2c1.5 0 2.8.5 3.8 1.5l2.9-2.9A9.8 9.8 0 0 0 12 2 10 10 0 0 0 3.1 7.5l3.4 2.7A5.9 5.9 0 0 1 12 6.2Z" fill="#EA4335" />
            </svg>
            <span>{mode === 'register' ? 'Daftar dengan Google' : 'Masuk dengan Google'}</span>
          </button>



          <p className="auth-switch">
            {mode === 'register' ? 'Sudah punya akun?' : 'Belum punya akun?'}{' '}
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'register' ? 'login' : 'register');
                setErrorMsg(null);
                setFieldErrors({});
                setLoginRemainingAttempts(null);
                setLoginLockedUntil(null);
              }}
            >
              {mode === 'register' ? 'Masuk' : 'Daftar sekarang'}
            </button>
          </p>
        </div>

        <small className="auth-note">
          Data keuanganmu dilindungi dan tidak dibagikan ke pihak ketiga.
        </small>
      </section>

      <aside className="auth-aside">
        <small>Kenapa pakai costKu</small>
        <h2>
          Uang rapi,
          <br />
          hidup lebih
          <br />
          tenang.
        </h2>
        <div>
          <b>01 / Batas jajan harian</b>
          <p>Tahu persis berapa yang aman kamu belanjakan hari ini.</p>
        </div>
        <div>
          <b>02 / Batas sewa kost</b>
          <p>Cegah biaya tempat tinggal menelan lebih dari 25% gajimu.</p>
        </div>
        <div>
          <b>03 / Rencana makan &amp; belanja</b>
          <p>Perkiraan belanja minimarket supaya pengeluaran makan tetap terkendali.</p>
        </div>
      </aside>
    </main>
  );
};
