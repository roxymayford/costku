import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Icon } from '../components/Icon';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

type Phase = 'working' | 'error';

/**
 * Stable error codes emitted by the backend's /google/callback, mapped to
 * human Indonesian. Anything unknown falls back to a generic message.
 */
const ERROR_MESSAGES: Record<string, string> = {
  google_not_configured:
    'Login Google belum dikonfigurasi di server. Pakai email & kata sandi dulu, atau hubungi admin.',
  access_denied: 'Kamu membatalkan proses login Google. Silakan coba lagi.',
  invalid_state: 'Sesi login tidak valid atau sudah kedaluwarsa. Coba lagi ya.',
  missing_code: 'Google tidak mengirimkan kode otorisasi. Coba lagi ya.',
  invalid_id_token: 'Respons dari Google tidak dapat diverifikasi. Coba lagi ya.',
  email_not_verified: 'Alamat email Google kamu belum terverifikasi.',
  provision_failed: 'Gagal menyiapkan akunmu. Coba lagi sebentar lagi.',
  oauth_failed: 'Login Google gagal. Coba lagi ya.',
};

/**
 * Landing page for the Google OAuth redirect.
 *
 * The backend sends the browser here with the session handoff in the URL
 * fragment:
 *
 *   #token_hash=...&type=magiclink   -> trade for a real Supabase session
 *   #demo=1&uid=...&email=...        -> local identity (no service-role key)
 *
 * or with a `?error=<code>` in the query when the flow failed.
 */
export const AuthCallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { adoptSession } = useAuth();

  const [phase, setPhase] = useState<Phase>('working');
  const [message, setMessage] = useState('Menghubungkan akun Google…');

  // token_hash is single-use, and StrictMode double-invokes effects in dev.
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    const fail = (text: string) => {
      setMessage(text);
      setPhase('error');
    };

    const queryError = searchParams.get('error');
    if (queryError) {
      fail(ERROR_MESSAGES[queryError] ?? ERROR_MESSAGES.oauth_failed);
      return;
    }

    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));

    // Drop the handoff from the address bar so it never lingers in history.
    window.history.replaceState(null, '', window.location.pathname);

    const tokenHash = fragment.get('token_hash');
    const tokenType = fragment.get('type') || 'magiclink';
    const isDemo = fragment.get('demo') === '1';

    const finish = () => {
      setMessage('Berhasil. Mengalihkan ke dashboard…');
      window.setTimeout(() => navigate('/dashboard', { replace: true }), 300);
    };

    /* ---- real Supabase session handoff ---- */
    if (tokenHash) {
      if (!isSupabaseConfigured) {
        fail('Supabase belum dikonfigurasi di aplikasi ini.');
        return;
      }

      void (async () => {
        try {
          const { error } = await supabase.auth.verifyOtp({
            type: tokenType as 'magiclink',
            token_hash: tokenHash,
          });

          if (error) {
            fail(`Gagal membuat sesi: ${error.message}`);
            return;
          }

          // onAuthStateChange in AuthContext picks the session up from here.
          finish();
        } catch (err) {
          fail((err as Error)?.message || ERROR_MESSAGES.oauth_failed);
        }
      })();
      return;
    }

    /* ---- degraded: local identity only ---- */
    if (isDemo) {
      adoptSession({
        id: fragment.get('uid') || 'demo-user',
        email: fragment.get('email') || '',
        name: fragment.get('name') || undefined,
      });
      finish();
      return;
    }

    fail('Tidak ada data login yang diterima dari Google.');
    // Intentionally runs once — the fragment is consumed above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <button className="auth-brand" type="button" onClick={() => navigate('/')}>
          <span className="avatar">CK</span>
          <b>COSTKU</b>
          <i>/</i>
          <span>PENDAMPING KEUANGAN PRIBADI</span>
        </button>

        <div className="auth-card">
          {phase === 'working' ? (
            <>
              <small className="accent">Menghubungkan</small>
              <h1>SEBENTAR YA.</h1>
              <p>{message}</p>

              <div className="otp-meta">
                <span className="otp-meta__label">STATUS</span>
                <span className="otp-meta__value">MEMPROSES</span>
              </div>
            </>
          ) : (
            <>
              <small className="accent">Login gagal</small>
              <h1>GOOGLE LOGIN GAGAL.</h1>

              <div className="auth-error-box" role="alert">
                <Icon name="alert" size={16} />
                <span>{message}</span>
              </div>

              <button
                className="pill dark"
                type="button"
                onClick={() => navigate('/auth', { replace: true })}
              >
                <span className="inline-flex items-center gap-1.5">
                  KEMBALI KE HALAMAN MASUK <Icon name="arrowRight" size={14} />
                </span>
              </button>
            </>
          )}
        </div>

        <small className="auth-note">
          TOKEN DITUKAR DI BROWSER / TIDAK PERNAH MASUK LOG SERVER
        </small>
      </section>

      <aside className="auth-aside">
        <small>PROSES AMAN</small>
        <h2>
          SATU AKUN.
          <br />
          SATU KLIK.
          <br />
          TANPA KATA SANDI.
        </h2>
        <div>
          <b>01 / TANPA KATA SANDI</b>
          <p>Google yang memverifikasi identitasmu. costKu tidak pernah menyimpan kata sandi Google.</p>
        </div>
        <div>
          <b>02 / TOKEN SEKALI PAKAI</b>
          <p>Token ditukar langsung di browser dan tidak pernah tercatat di log server.</p>
        </div>
        <div>
          <b>03 / EMAIL TERVERIFIKASI</b>
          <p>Hanya alamat email yang sudah diverifikasi Google yang bisa masuk.</p>
        </div>
      </aside>
    </main>
  );
};

export default AuthCallbackPage;
