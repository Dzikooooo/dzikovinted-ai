import { useEffect, useState } from 'react';
import { Eye, EyeOff, ArrowLeft, Mail, Lock, User, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import type { AuthMode, AppPage } from '../lib/types';
import { Wordmark } from '../components/ui/Wordmark';
import { Button } from '../components/ui/Button';

interface AuthPageProps {
  onNavigate: (page: AppPage) => void;
}

// Deep-link d'intention d'inscription (audit beta 2026-08-08) : les CTA de
// la landing/Navbar/Pricing/Newsletter promettent tous "Créer un compte" /
// "Commencer gratuitement" mais atterrissaient sur l'écran Connexion --
// onNavigate('auth') ne transportait aucune information de mode. Meme
// technique que resellos:dashboardPage (sessionStorage lu une seule fois au
// montage, StrictMode-safe) plutot que d'etendre AppPage avec un mode.
function readInitialAuthMode(): AuthMode {
  const stored = sessionStorage.getItem('resellos:authMode');
  return stored === 'register' ? 'register' : stored === 'forgot' ? 'forgot' : 'login';
}

// P1-1 (Freeze Audit correctif) : message pose par App.tsx quand un lien de
// reinitialisation expire/invalide est detecte dans le hash de l'URL (voir
// consumePasswordRecoveryHashError, App.tsx) -- meme idiome StrictMode-safe
// que readInitialAuthMode ci-dessus (lu une seule fois a l'initialisation,
// nettoye a part dans le useEffect ci-dessous, jamais dans l'initializer).
function readInitialAuthNotice(): string | null {
  return sessionStorage.getItem('resellos:authNotice');
}

export default function AuthPage({ onNavigate }: AuthPageProps) {
  const [mode, setMode] = useState<AuthMode>(readInitialAuthMode);

  // Nettoyage a part (jamais dans l'initializer lui-meme) : StrictMode
  // invoque readInitialAuthMode()/readInitialAuthNotice() deux fois au
  // montage en dev, un clear fait depuis l'initializer ferait lire 'null' au
  // second appel et retomberait silencieusement sur 'login'/aucun message.
  useEffect(() => {
    sessionStorage.removeItem('resellos:authMode');
    sessionStorage.removeItem('resellos:authNotice');
  }, []);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  // Initialise avec le message de lien expire (voir readInitialAuthNotice)
  // s'il y en a un -- s'affiche donc immediatement au premier rendu, dans le
  // meme bandeau que toute autre erreur d'authentification (jamais de texte
  // technique Supabase brut, voir consumePasswordRecoveryHashError).
  const [error, setError] = useState<string | null>(readInitialAuthNotice);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { signIn, signUp, resetPassword } = useAuth();
  const passwordsMismatch = mode === 'register' && confirmPassword.length > 0 && password !== confirmPassword;
  const loadingLabel = mode === 'login' ? 'Connexion...' : mode === 'register' ? 'Création du compte...' : 'Envoi en cours...';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (mode === 'register' && password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }
    if (mode === 'register' && password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        const { error } = await signIn(email, password);
        if (error) {
          setError(error);
        } else {
          onNavigate('dashboard');
        }
      } else if (mode === 'register') {
        const { error, confirmEmail } = await signUp(email, password, fullName);
        if (error) {
          setError(error);
        } else if (confirmEmail) {
          setInfo('Compte créé avec succès ! Vérifie ton email pour activer ton compte.');
        } else {
          onNavigate('dashboard');
        }
      } else {
        const { error } = await resetPassword(email);
        if (error) {
          setError(error);
        } else {
          setInfo('Si cet email existe, tu recevras un lien de réinitialisation.');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark-200 flex flex-col items-center justify-center px-4">

      <div className="relative z-10 w-full max-w-md">
        <button onClick={() => onNavigate('landing')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-neon-500 transition-colors mb-8">
          <ArrowLeft className="w-4 h-4" /> Retour à l'accueil
        </button>

        <div className="mb-8">
          <Wordmark size="lg" />
        </div>

        <div className="bg-surface border border-gray-200 rounded-2xl p-8">
          <h1 className="text-2xl font-black mb-1">
            {mode === 'login' ? 'Connexion' : mode === 'register' ? 'Créer un compte' : 'Mot de passe oublié'}
          </h1>
          <p className="text-sm text-gray-500 mb-8">
            {mode === 'login' ? 'Accède à ton tableau de bord.' : mode === 'register' ? '10 annonces IA offertes chaque mois, dès l\'inscription.' : 'Reçois un lien de réinitialisation.'}
          </p>

          {error && (
            <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-6">
              <AlertCircle className="w-4 h-4 text-red-700 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {info && (
            <div className="flex items-center gap-3 bg-neon-500/10 border border-neon-500/20 rounded-xl px-4 py-3 mb-6">
              <CheckCircle2 className="w-4 h-4 text-neon-500 flex-shrink-0" />
              <p className="text-sm text-neon-500">{info}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label htmlFor="auth-fullname" className="text-xs font-mono uppercase tracking-wider text-gray-500 block mb-2">Nom complet</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    id="auth-fullname"
                    type="text"
                    required
                    autoFocus
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Jean Dupont"
                    className="w-full bg-dark-400 border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm text-gray-800 placeholder:text-gray-500 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all"
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="auth-email" className="text-xs font-mono uppercase tracking-wider text-gray-500 block mb-2">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  id="auth-email"
                  type="email"
                  required
                  autoFocus={mode !== 'register'}
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="toi@example.com"
                  className="w-full bg-dark-400 border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm text-gray-800 placeholder:text-gray-500 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all"
                />
              </div>
            </div>

            {mode !== 'forgot' && (
              <div>
                <label htmlFor="auth-password" className="text-xs font-mono uppercase tracking-wider text-gray-500 block mb-2">Mot de passe</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-dark-400 border border-gray-200 rounded-xl pl-10 pr-10 py-3 text-sm text-gray-800 placeholder:text-gray-500 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-500">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {mode === 'register' && (
              <div>
                <label htmlFor="auth-confirm-password" className="text-xs font-mono uppercase tracking-wider text-gray-500 block mb-2">Confirmer le mot de passe</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    id="auth-confirm-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className={`w-full bg-dark-400 border rounded-xl pl-10 pr-4 py-3 text-sm text-gray-800 placeholder:text-gray-500 focus:outline-none focus:ring-2 transition-all ${
                      passwordsMismatch
                        ? 'border-red-500/40 focus:border-red-500/60 focus:ring-red-500/20'
                        : 'border-gray-200 focus:border-neon-500/40 focus:ring-neon-500/20'
                    }`}
                  />
                </div>
                {passwordsMismatch && <p className="text-xs text-red-700 mt-1.5">Les mots de passe ne correspondent pas.</p>}
              </div>
            )}

            {mode === 'login' && (
              <div className="flex justify-end">
                <button type="button" onClick={() => { setMode('forgot'); setError(null); }} className="text-xs text-gray-500 hover:text-neon-500 transition-colors">
                  Mot de passe oublié ?
                </button>
              </div>
            )}

            <Button type="submit" fullWidth loading={loading} disabled={passwordsMismatch} className="mt-2">
              {loading ? loadingLabel : mode === 'login' ? 'Se connecter' : mode === 'register' ? 'Créer mon compte' : 'Envoyer le lien'}
            </Button>
          </form>

          <div className="border-t border-gray-200 mt-6 pt-6 text-center">
            {mode === 'login' ? (
              <p className="text-sm text-gray-500">Pas encore de compte ?{' '}
                <button onClick={() => { setMode('register'); setError(null); }} className="text-neon-500 hover:underline font-medium">Créer un compte</button>
              </p>
            ) : (
              <p className="text-sm text-gray-500">Déjà un compte ?{' '}
                <button onClick={() => { setMode('login'); setError(null); }} className="text-neon-500 hover:underline font-medium">Se connecter</button>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
