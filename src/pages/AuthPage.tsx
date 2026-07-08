import { useState } from 'react';
import { Zap, Eye, EyeOff, ArrowLeft, Mail, Lock, User, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import type { AuthMode, AppPage } from '../lib/types';

interface AuthPageProps {
  onNavigate: (page: AppPage) => void;
}

export default function AuthPage({ onNavigate }: AuthPageProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { signIn, signUp, resetPassword } = useAuth();

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
          setInfo('Compte cree avec succes ! Verifie ton email pour activer ton compte.');
        } else {
          onNavigate('dashboard');
        }
      } else {
        const { error } = await resetPassword(email);
        if (error) {
          setError(error);
        } else {
          setInfo('Si cet email existe, tu recevras un lien de reinitialisation.');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark-400 flex flex-col items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(255,196,0,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,196,0,0.025) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[500px] bg-neon-500/4 rounded-full blur-[160px]" />

      <div className="relative z-10 w-full max-w-md">
        <button onClick={() => onNavigate('landing')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-neon-500 transition-colors mb-8">
          <ArrowLeft className="w-4 h-4" /> Retour à l'accueil
        </button>

        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 bg-neon-500 rounded-lg flex items-center justify-center">
            <Zap className="w-5 h-5 text-black" />
          </div>
          <span className="text-xl font-black">Dziko<span className="text-neon-500">Vinted</span></span>
        </div>

        <div className="bg-surface border border-white/8 rounded-2xl p-8">
          <h1 className="text-2xl font-black mb-1">
            {mode === 'login' ? 'Connexion' : mode === 'register' ? 'Créer un compte' : 'Mot de passe oublié'}
          </h1>
          <p className="text-sm text-gray-500 mb-8">
            {mode === 'login' ? 'Accède à ton tableau de bord.' : mode === 'register' ? '10 analyses gratuites dès l\'inscription.' : 'Reçois un lien de réinitialisation.'}
          </p>

          {error && (
            <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-6">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {info && (
            <div className="flex items-center gap-3 bg-neon-500/10 border border-neon-500/20 rounded-xl px-4 py-3 mb-6">
              <AlertCircle className="w-4 h-4 text-neon-500 flex-shrink-0" />
              <p className="text-sm text-neon-500">{info}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="text-xs font-mono uppercase tracking-wider text-gray-500 block mb-2">Nom complet</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Jean Dupont"
                    className="w-full bg-dark-400 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-mono uppercase tracking-wider text-gray-500 block mb-2">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="toi@example.com"
                  className="w-full bg-dark-400 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all"
                />
              </div>
            </div>

            {mode !== 'forgot' && (
              <div>
                <label className="text-xs font-mono uppercase tracking-wider text-gray-500 block mb-2">Mot de passe</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-dark-400 border border-white/10 rounded-xl pl-10 pr-10 py-3 text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {mode === 'register' && (
              <div>
                <label className="text-xs font-mono uppercase tracking-wider text-gray-500 block mb-2">Confirmer le mot de passe</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-dark-400 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-neon-500/40 focus:ring-2 focus:ring-neon-500/20 transition-all"
                  />
                </div>
              </div>
            )}

            {mode === 'login' && (
              <div className="flex justify-end">
                <button type="button" onClick={() => { setMode('forgot'); setError(null); }} className="text-xs text-gray-500 hover:text-neon-500 transition-colors">
                  Mot de passe oublié ?
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-neon-500 text-black font-bold py-3.5 rounded-xl hover:bg-neon-600 transition-all duration-200 hover:shadow-[0_0_30px_rgba(255,196,0,0.3)] disabled:opacity-50 disabled:cursor-not-allowed text-sm mt-2"
            >
              {loading ? 'Chargement...' : mode === 'login' ? 'Se connecter' : mode === 'register' ? 'Créer mon compte' : 'Envoyer le lien'}
            </button>
          </form>

          <div className="border-t border-white/5 mt-6 pt-6 text-center">
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
