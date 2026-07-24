import { createContext, useCallback, useContext, useEffect, useState, useRef, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/types';
import type { User, Session } from '@supabase/supabase-js';
import { translateAuthError } from '../lib/errorMessages';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  // true uniquement entre le clic sur le lien de reinitialisation recu par
  // email (evenement Supabase PASSWORD_RECOVERY) et la confirmation du
  // nouveau mot de passe -- App.tsx s'en sert pour router vers l'ecran
  // dedie au lieu du dashboard, meme si une session valide existe deja.
  passwordRecovery: boolean;
  clearPasswordRecovery: () => void;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null; confirmEmail: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const initializedRef = useRef(false);

  const fetchProfile = useCallback(async (userId: string, retries = 3): Promise<void> => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (data) {
      setProfile(data as Profile);
    } else if (retries > 0) {
      await new Promise((r) => setTimeout(r, 500));
      return fetchProfile(userId, retries - 1);
    }
  }, []);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        fetchProfile(s.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      // PASSWORD_RECOVERY : signal officiel Supabase declenche par le clic
      // sur le lien recu par email (voir resetPassword ci-dessous) -- une
      // vraie session est etablie en meme temps, distincte d'une connexion
      // normale uniquement par cet evenement.
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        fetchProfile(s.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const signUp = async (email: string, password: string, fullName: string): Promise<{ error: string | null; confirmEmail: boolean }> => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });

    if (error) {
      return { error: translateAuthError(error.message), confirmEmail: false };
    }

    if (!data.user) {
      return { error: 'Inscription echouee. Veuillez reessayer.', confirmEmail: false };
    }

    // If no session is returned, email confirmation is required
    if (!data.session) {
      return { error: null, confirmEmail: true };
    }

    setSession(data.session);
    setUser(data.user);
    await fetchProfile(data.user.id);
    return { error: null, confirmEmail: false };
  };

  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      return { error: translateAuthError(error.message) };
    }

    if (data.user) {
      setSession(data.session);
      setUser(data.user);
      await fetchProfile(data.user.id);
    }

    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setUser(null);
    setSession(null);
  };

  const resetPassword = async (email: string): Promise<{ error: string | null }> => {
    // redirectTo explicite (2026-07-24) : evite de dependre d'un reglage
    // externe (Site URL du projet Supabase) invisible depuis ce code --
    // ramene toujours l'utilisateur sur le domaine d'ou la demande est partie.
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) return { error: translateAuthError(error.message) };
    return { error: null };
  };

  const clearPasswordRecovery = () => setPasswordRecovery(false);

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  return (
    <AuthContext.Provider
      value={{ user, session, profile, loading, passwordRecovery, clearPasswordRecovery, signUp, signIn, signOut, resetPassword, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
