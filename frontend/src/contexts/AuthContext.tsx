import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

type User = {
  id: string;
  email: string;
  name?: string;
};

type AuthContextType = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  register: (email: string, password: string, name: string) => Promise<{ error?: string }>;
  loginWithGoogle: () => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  loginDemo: () => void;
  /**
   * Adopt a session produced outside this provider — used by the OTP
   * verification flow, where the backend issues tokens after a valid code.
   */
  adoptSession: (user: User, accessToken?: string, refreshToken?: string) => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

const LOCAL_IDENTITY_KEY = 'fatrack-demo-user';

/**
 * Read a locally-adopted identity from storage.
 *
 * Used as the *initial* state so a reload doesn't render one frame with no
 * user: the dashboard guard would read that as "signed out" and bounce to
 * /auth before the async restore had a chance to run.
 */
function readLocalIdentity(): User | null {
  try {
    const saved = localStorage.getItem(LOCAL_IDENTITY_KEY);
    return saved ? (JSON.parse(saved) as User) : null;
  } catch {
    localStorage.removeItem(LOCAL_IDENTITY_KEY);
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => readLocalIdentity());
  const [loading, setLoading] = useState(true);

  /**
   * Where the current identity came from.
   *
   * A "local" identity — the demo button, or an OTP/Google login that ran
   * without a service-role key — has no Supabase session behind it. Supabase
   * emits null-session events on mount (INITIAL_SESSION / SIGNED_OUT), and
   * letting those clear a local identity races the OAuth callback: the
   * callback sets the user, the event nulls it, and the dashboard guard
   * bounces straight back to /auth.
   */
  const identitySource = useRef<'supabase' | 'local' | null>(user ? 'local' : null);

  useEffect(() => {
    /**
     * Re-read the local identity. Mostly a safety net now that the initial
     * state is seeded from storage — it still catches the case where the key
     * was written after the first render but before getSession() resolved.
     */
    const restoreLocalIdentity = () => {
      const local = readLocalIdentity();
      if (!local) return;
      setUser(local);
      identitySource.current = 'local';
    };

    if (!isSupabaseConfigured) {
      // Demo mode — localStorage is the only identity store.
      restoreLocalIdentity();
      setLoading(false);
      return;
    }

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        identitySource.current = 'supabase';
        // A real session supersedes any locally-adopted identity.
        localStorage.removeItem(LOCAL_IDENTITY_KEY);
        setUser({
          id: session.user.id,
          email: session.user.email || '',
          name: session.user.user_metadata?.name,
        });
      } else {
        restoreLocalIdentity();
      }
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        identitySource.current = 'supabase';
        // A real session supersedes any locally-adopted identity.
        localStorage.removeItem(LOCAL_IDENTITY_KEY);
        setUser({
          id: session.user.id,
          email: session.user.email || '',
          name: session.user.user_metadata?.name,
        });
        return;
      }

      /*
       * A null session only clears state when Supabase itself was the source of
       * the identity. Supabase emits INITIAL_SESSION on every mount, so clearing
       * unconditionally would wipe a locally-adopted user mid-flow.
       */
      if (identitySource.current === 'local') return;

      if (event === 'SIGNED_OUT') {
        identitySource.current = null;
        setUser(null);
        localStorage.removeItem(LOCAL_IDENTITY_KEY);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function login(email: string, password: string): Promise<{ error?: string }> {
    if (isSupabaseConfigured) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: error.message };
      return {};
    }
    // Demo mode
    const demoUser: User = { id: 'demo-user', email, name: email.split('@')[0] };
    setUser(demoUser);
    localStorage.setItem(LOCAL_IDENTITY_KEY, JSON.stringify(demoUser));
    return {};
  }

  async function register(email: string, password: string, name: string): Promise<{ error?: string }> {
    if (isSupabaseConfigured) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });
      if (error) return { error: error.message };
      return {};
    }
    // Demo mode
    const demoUser: User = { id: 'demo-user', email, name };
    setUser(demoUser);
    localStorage.setItem(LOCAL_IDENTITY_KEY, JSON.stringify(demoUser));
    return {};
  }

  /**
   * Start the Google OAuth flow.
   *
   * The backend owns the whole flow — it holds the client secret, talks to
   * Google, and redirects back to /auth/callback — so this is a full-page
   * navigation rather than a Supabase client call. The SPA picks the sign-in
   * back up on that callback route.
   */
  function loginWithGoogle(): Promise<{ error?: string }> {
    if (!isSupabaseConfigured) {
      // Nothing to hand a session to — fall back to the local demo identity.
      loginDemo();
      return Promise.resolve({});
    }

    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
    window.location.href = `${backendUrl}/api/v1/auth/google`;
    return Promise.resolve({});
  }

  async function logout(): Promise<void> {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
    identitySource.current = null;
    setUser(null);
    localStorage.removeItem(LOCAL_IDENTITY_KEY);
  }

  function loginDemo(): void {
    const demoUser: User = { id: 'demo-user', email: 'demo@costku.id', name: 'Pengguna Demo' };
    identitySource.current = 'local';
    setUser(demoUser);
    localStorage.setItem(LOCAL_IDENTITY_KEY, JSON.stringify(demoUser));
  }

  /**
   * Adopt a session minted by the backend after OTP verification.
   *
   * With Supabase configured the tokens are a real session, so we also
   * seed the Supabase client via setSession — that keeps the rest of the
   * app (RLS-scoped queries, onAuthStateChange listeners) working from the
   * very next request. Otherwise we fall back to the local demo user.
   */
  function adoptSession(nextUser: User, accessToken?: string, refreshToken?: string): void {
    /*
     * `demo-*` tokens are the backend's degraded-mode placeholder, not real
     * Supabase credentials — treating them as real would mark the identity as
     * Supabase-backed and let a null-session event sign the user straight out.
     */
    const hasRealTokens = Boolean(
      accessToken &&
        refreshToken &&
        !accessToken.startsWith('demo-') &&
        !refreshToken.startsWith('demo-')
    );

    identitySource.current = hasRealTokens ? 'supabase' : 'local';
    setUser(nextUser);
    localStorage.setItem(LOCAL_IDENTITY_KEY, JSON.stringify(nextUser));

    if (isSupabaseConfigured && hasRealTokens) {
      void supabase.auth
        .setSession({ access_token: accessToken as string, refresh_token: refreshToken as string })
        .catch(() => {
          /* the local session above still keeps the user signed in */
        });
    }
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, loginWithGoogle, logout, loginDemo, adoptSession }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
